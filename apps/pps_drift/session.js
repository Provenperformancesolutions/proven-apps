'use strict';
/**
 * session.js - Proven Drift: everything between the car's data and the screens. It owns the engine
 * (drift.js with angle.js, learn.js and score.js), is handed every sample by car.js with its time, keeps
 * the session's totals, and turns a finished drift into the record that is shown, logged and saved
 * (store.js). It reads no car signal and draws nothing itself.
 *
 *   const s = new Session({ now, wall, log, settings, store });
 *     now()   ms on ONE clock that only runs forward (process.hrtime): every time in the measuring path
 *     wall()  Date.now(): only for the date on a saved drift
 *   s.speed(series, t, kmh, took)   every speed sample, series 'notified' | 'polled'
 *   s.lat(t, ms2), s.long(t, ms2)   sideways and forward acceleration, scaled as the kit scales them
 *   s.yaw(key, t, raw)              a yaw rate sample of source 'cds2' | 'chassis', raw
 *   s.steer(key, t, raw)            a steering sample of source 'front' | 'xfront' | 'driver' | 'xdriver', raw
 *   s.pedal(t, raw), s.wheels(t, { fl, fr, rl, rr }), s.hb(t, true | false | null)
 *   s.nmea(t, text)                 the GPS receiver's sentences (cross-check only, gpscheck.js)
 *   s.seen(key, t), s.note(key, text)    something of source `key` arrived (the Signals tab's counts and rates:
 *                                   car.js says so for every arrival, usable or not); its raw value as text
 *   s.tick(now, { hidden, signalsPage })    every 50 ms
 *   s.speedPeriod()                 how often the speed getter is to be read right now (ms)
 *   s.view(now), s.signalsView(now) what the screens draw
 *   s.resetBest(), s.resetLearned(), s.configure()
 *
 * A DRIFT RECORD is what drift.js hands over, with the date and, where the receiver's speed was taken
 * during it, that speed over the car's (gpscheck.js). No position, course or heading is in it: none ever
 * reaches this file. store.js lists every member that is kept.
 *
 * WHAT IS DECIDED HERE (each is a choice, none was tried on a car)
 *   - ONE SPEED SERIES goes to the engine: the getter's while the getter answers (a read kept within the
 *     last second, or within 2.5 of its periods where it is read more slowly), else the notified one.
 *     While it is the getter's, a speed older than 1.5 s (3 periods if that is more) counts as lost
 *     (angle.js, speedMaxAgeMs): the screen then says DATA LOST. That also holds once the getter has
 *     stopped answering, until the car notifies a speed: from then on it is the notified series, where
 *     silence is "no change", and a speed that has died cannot be told from one that holds still. A car
 *     whose getter never answered is on the notified series from the start.
 *   - THE YAW RATE AND THE SIDEWAYS ACCELERATION OF CDS2 are notified when they change, and car.js reads
 *     their getters as well as soon as fewer than 16 notifications of one arrived in the last 2 s on the
 *     move (feed.js, TopUp). So on a car whose CDS2 answers, a sample of each arrives at least every 2.3 s
 *     or so at 10 km/h or more. One that is older than 2.5 s there counts as lost (angle.js, yawMaxAgeMs
 *     and latMaxAgeMs): the screen says NO YAW RATE FROM THE CAR or DATA LOST, and a drift that runs ends
 *     there, flagged DATA GAP. That covers CDS2 going silent as a whole, its service going down, and its
 *     fields reading the car's "no value" (which is no sample). It would also be said, wrongly, on a car
 *     whose readings hold still to the last count for 2.5 s on the move while its getters do not answer,
 *     or answer slower than half a second (feed.js throws such a read away). The chassis yaw rate (the second source)
 *     has no getter that the app reads: for it silence stays "no change", and only angle.js's older rule
 *     holds (silent for 2 s while the sideways acceleration moved).
 *   - WHICH YAW RATE AND WHICH STEERING. Two sources carry the yaw rate and four the steering. With the
 *     setting on "Auto" the first in the list below is used; if it has delivered nothing 10 s after the
 *     car was first heard, the first one that has delivered 20 usable values takes its place, for as long
 *     as the app runs. Each source is learned on its own (learn.js keeps its moments under its name).
 *       yaw rate:  cds2 (CDS2 statusYawVelocityVehicle), chassis (SpeedAcceleration YawSpeedVehicle)
 *       steering:  front (SteeringAngle SteeringAngleFrontAxleEffective), xfront (XView
 *                  statusFrontAxleSteeringAngle), driver (SteeringAngle ActualSteeringAngleDriver),
 *                  xdriver (XView statusSteeringAngleDriver)
 *     The front wheels' own angle comes first: a steering wheel's angle is only a plain multiple of it on
 *     a car whose steering ratio is fixed.
 *   - THE END ANGLE is 0.6 of the start angle set (6 degrees for 10), rounded to a whole degree.
 *   - THE SESSION counts every drift since the app started, flagged or not. Only the all-time bests leave
 *     flagged drifts out (store.js).
 *   - THE SAVED FILE is written one second after a drift has ended if no other has begun, and for what was
 *     learned alone: 10 s after a line was first drawn or became "learned", else when the car next stands
 *     or every 2 minutes. Never while a drift runs or may be beginning: a write holds the app up for a
 *     moment, and a sample stamped late is a wrong angle. The log is held back for the same reason.
 *   - DEMO DATA goes to an engine of its own with what the demo car "learned" (demo.js). Nothing of a demo
 *     drift reaches the saved file, and while the demo shows, the car's samples are counted for the Signals
 *     tab but not driven through the car's engine.
 */
const { DriftEngine, FLAGS } = require('./drift');
const { speedPeriod, TopUp, Meter, Pick, PARKED_AFTER_MS } = require('./feed');
const { GpsCheck } = require('./gpscheck');
const { Store } = require('./store');
const Demo = require('./demo');

/**
 * The chassis families of the "Chassis" setting: wheelbase in metres and the share of the weight on the
 * front axle. They only matter for the steering check (angle.js). The wheelbases are the makers' published
 * figures, rounded to a centimetre. Half the weight on the front axle is taken for every one of them: no
 * family's real split was looked up, and a few percent either way move the steering check by about a
 * tenth of a degree. None of it was measured by Proven.
 */
const CHASSIS = {
    g20: { wheelbase: 2.85, front: 0.5 },      // 3 Series and 4 Series, M3 and M4
    g42: { wheelbase: 2.74, front: 0.5 },      // 2 Series Coupe and M2
    g30: { wheelbase: 2.98, front: 0.5 },      // 5 Series and M5
    g14: { wheelbase: 2.82, front: 0.5 },      // 8 Series Coupe and Convertible, M8
    g29: { wheelbase: 2.47, front: 0.5 },      // Z4
};
const DEFAULT_CHASSIS = 'g20';
const YAW_KEYS = ['cds2', 'chassis'], STEER_KEYS = ['front', 'xfront', 'driver', 'xdriver'];
const YAW_METER = { cds2: 'yawC', chassis: 'yawS' }, STEER_METER = { front: 'steerF', xfront: 'steerXF', driver: 'steerD', xdriver: 'steerXD' };
const START_DEGS = [8, 10, 12, 15, 20], MIN_KMHS = [15, 20, 30, 40];
const END_SHARE = 0.6;

const SLOW_MS = 1000;              // housekeeping: the choice of sources, the saved file, rates for the log
const FRESH_MS = 1000;             // the getter is "answering" while a read was kept within this (2.5 poll periods if that is longer)
const SPEED_AGE_MS = 1500;         // a getter speed older than this (3 poll periods if that is more) is lost
const MOTION_AGE_MS = 2500;        // a CDS2 yaw rate or sideways acceleration older than this on the move is lost (see the top)
const STAND_KMH = 0.5;
const DEMO_AUTO_MS = 5000;         // "Auto": demo data once the car has said nothing for this long after the start
const DRIFT_SAVE_MS = 1000;        // a finished drift is written this long after it ended
const LEARN_SAVE_MS = 10000, LEARN_AGAIN_MS = 120000;
const SESSION_KEEP = 200;          // drifts of this session kept for the list (the totals count them all)
const RATES_AFTER_MS = 30000;      // the sources' rates go to the log once the car has driven this long

const isNum = (x) => typeof x === 'number' && isFinite(x);
const freshSession = () => ({ count: 0, total: 0, best: null, angle: null, time: null, dist: null, list: [] });

/** One line for the log: everything a drift record holds but its trace. */
function describeDrift(r, back) {
    const n = (x, d, unit) => (isNum(x) ? x.toFixed(d) + (unit || '') : 'not known');
    return r.score + ' points, grade ' + r.grade + ', ' + (r.end === 'spin' ? 'ended in a SPIN' : r.end === 'slow' ? 'ended under the minimum speed' : r.end === 'lost' ? 'ended because the angle was lost' : 'ended') +
        ' | peak ' + n(r.peak, 1) + ' deg ' + (r.dir === 'L' ? 'LEFT' : r.dir === 'R' ? 'RIGHT' : '') + ', average ' + n(r.avg, 1) + ', ' + r.switches + (r.switches === 1 ? ' switch' : ' switches') + ', ' + n(r.time, 2, ' s') + ', ' + n(r.dist, 1, ' m') +
        ' | entry ' + n(r.entry, 1) + ' km/h, average ' + n(r.avgKmh, 1) + ', lowest ' + n(r.minKmh, 1) +
        ' | peak sideways ' + n(r.peakG, 2, ' g') + ', peak yaw rate ' + n(r.peakYaw, 1, ' deg/s') +
        ' | opposite lock ' + n(r.opp, 1, ' deg') + ', pedal ' + n(r.pedal, 0, ' %') + ', rear wheelspin ' + n(r.wheelspin, 0, ' %') + ', handbrake at the start ' + (r.handbrake === true ? 'yes' : r.handbrake === false ? 'no' : 'not known') +
        ' | +- ' + n(r.pm, 1) + ' deg on average, ' + n(r.pmMax, 1) + ' at most | multiplier ' + n(r.mult, 2) + ', smoothness ' + n(r.smooth, 2) + ', ' + r.reversals + (r.reversals === 1 ? ' reversal' : ' reversals') +
        ' | data ' + n(r.rate, 1) + ' a second, longest gap ' + r.gap + ' ms' +
        (r.gps ? ' | GPS speed over the car\'s speed while its speed was held: x' + r.gps.ratio.toFixed(3) + ' (' + r.gps.n + ' sentences)' : '') +
        (isNum(back) ? ' | the steering backed ' + back.toFixed(0) + ' % of its time' : '') +
        ' | flags: ' + (r.flags.join(', ') || 'none');
}

class Session {
    constructor(o) {
        this.now = o.now;
        this.wall = o.wall || (() => Date.now());
        this.log = o.log;
        this.settings = o.settings;
        this.store = o.store;
        this.demoStore = new Store({ dir: null });
        this.startT = this.now();
        this.yawPick = new Pick(YAW_KEYS); this.steerPick = new Pick(STEER_KEYS);
        this.yawKey = this.yawPick.choose(this.settings.get('yawSource'), this.startT, null);
        this.steerKey = this.steerPick.choose(this.settings.get('steerSource'), this.startT, null);
        this.maxAge = 0;
        this.eng = new DriftEngine(Object.assign(this._options(), {
            yawKey: this.yawKey, steerKey: this.steerKey, saved: this.store.data.learned, demo: false, speedMaxAgeMs: 0,
            yawMaxAgeMs: this.yawKey === 'cds2' ? MOTION_AGE_MS : 0, latMaxAgeMs: MOTION_AGE_MS,
            onDrift: (r) => this._onDrift(r, false), onLearned: (what, state) => this._onLearned(what, state),
        }));
        this.demoEng = null; this.demo = null; this.demoOn = false;
        this.gps = new GpsCheck();
        this.topUp = new TopUp();
        this.meters = {}; this.raw = {};
        this.live = { speed: null, speedT: null };
        this.polledAt = null; this.notifiedAt = null;      // when the speed getter last gave a speed, and when the car last notified one
        this.win = { ms: 100, t: this.startT };        // the longest poll period in force lately (for "is the getter answering")
        this.stoodSince = null;            // since when the car has stood, null while it moves
        this.carSeen = false;              // the car has answered (a speed sample, or its speed service is up)
        this.heardAt = null;               // when the first speed sample arrived
        this.movedMs = 0; this.ratesLogged = false; this.lastTick = null;
        this.sess = freshSession(); this.demoSess = freshSession();
        this.newBest = {};                 // the bests the last drift set
        this.env = {};
        this.lastSlow = this.startT;
        this.driftDirty = false; this.driftEndedAt = -Infinity;
        this.learnDirty = false; this.learnSig = this._learnSig(); this.learnUrgent = false; this.lastSave = -Infinity;
        const st = this.eng.learn.status();
        if (this.store.data.learned) this.log.info('learned from the saved file: yaw rate (' + this.yawKey + ') ' + st.yaw.state + ' with ' + st.yaw.moments + ' moments, steering (' + this.steerKey + ') ' + st.steer.state + ' with ' + st.steer.moments);
    }

    /* ---------- settings ---------- */

    /** The engine's options as the settings have them. */
    _options() {
        const s = this.settings, pick = (list, v, dflt) => (list.indexOf(Number(v)) >= 0 ? Number(v) : dflt);
        const startDeg = pick(START_DEGS, s.get('startAngle'), 10), minKmh = pick(MIN_KMHS, s.get('minSpeed'), 20);
        const c = CHASSIS[s.get('chassis')], cm = Number(s.get('wheelbase'));
        const car = c || (s.get('chassis') === 'other' && cm >= 200 && cm <= 400 ? { wheelbase: cm / 100, front: 0.5 } : CHASSIS[DEFAULT_CHASSIS]);
        return { startDeg, endDeg: Math.round(END_SHARE * startDeg), minKmh, wheelbase: car.wheelbase, front: car.front, useSteer: s.get('useSteer') !== false, useLong: s.get('useLong') !== 'off' };
    }

    /** A setting changed: the engines take the new figures. A drift that is running goes on with them. */
    configure() {
        const o = this._options();
        this.eng.configure(o);
        // (the demo car is its own car: only what a drift is, is the driver's choice there)
        if (this.demoEng) this.demoEng.configure({ startDeg: o.startDeg, endDeg: o.endDeg, minKmh: o.minKmh });
        this._sources(this.now());
    }

    /** Which yaw rate and which steering source is in use (see the top). */
    _sources(now) {
        const y = this.yawPick.choose(this.settings.get('yawSource'), now, this.heardAt), st = this.steerPick.choose(this.settings.get('steerSource'), now, this.heardAt);
        if (y !== this.yawKey) {
            this.log.info('yaw rate: source "' + y + '" in use from now on (was "' + this.yawKey + '"' + (this.settings.get('yawSource') === 'auto' ? ', which has delivered nothing' : '') + ')');
            this.yawKey = y; this.eng.configure({ yawKey: y, yawMaxAgeMs: y === 'cds2' ? MOTION_AGE_MS : 0 });
        }
        if (st !== this.steerKey) {
            this.log.info('steering: source "' + st + '" in use from now on (was "' + this.steerKey + '"' + (this.settings.get('steerSource') === 'auto' ? ', which has delivered nothing' : '') + ')');
            this.steerKey = st; this.eng.configure({ steerKey: st });
        }
    }

    /* ---------- what the car sends (car.js) ---------- */

    meter(key) { return this.meters[key] || (this.meters[key] = new Meter()); }
    seen(key, t) { this.meter(key).sample(t); }
    /** The raw value of a source as it last arrived, as text, for the Signals tab. */
    note(key, text) { this.raw[key] = String(text).slice(0, 40); }

    /** Is the speed getter answering: a speed read from it within 1 s, or within 2.5 of the longest poll period in force lately. */
    polledFresh(now) { return this.polledAt !== null && now - this.polledAt <= Math.max(FRESH_MS, 2.5 * this.win.ms); }
    /**
     * Which speed series the engine is on: 'polled' while the getter answers, and still once it has stopped until the
     * car notifies a speed; 'notified' from then on, and from the start on a car whose getter never answered.
     */
    speedSeries(now) {
        if (this.polledFresh(now)) return 'polled';
        return this.notifiedAt !== null && (this.polledAt === null || this.notifiedAt > this.polledAt) ? 'notified' : 'polled';
    }

    /** A speed sample of one series, km/h as the car reports it. */
    speed(series, t, kmh) {
        if (!isNum(t) || !isNum(kmh)) return;
        this.carSeen = true;
        if (this.heardAt === null) this.heardAt = t;
        // one series for the engine: the getter's while it answers, else the notified one
        if (series === 'polled') this.polledAt = t; else { this.notifiedAt = t; if (this.polledFresh(t)) return; }
        if (this.live.speedT === null || t >= this.live.speedT) { this.live.speed = kmh; this.live.speedT = t; }
        if (kmh < STAND_KMH) { if (this.stoodSince === null) this.stoodSince = t; } else this.stoodSince = null;
        this.gps.speed(t, kmh);
        if (!this.demoOn) this.eng.speed(t, kmh);
    }

    lat(t, ms2) { if (!this.demoOn) this.eng.lat(t, ms2); }
    long(t, ms2) { if (!this.demoOn) this.eng.long(t, ms2); }

    yaw(key, t, raw) {
        if (isNum(raw) && raw > 0 && raw < 65534) this.yawPick.usable(key);
        if (key === this.yawKey && !this.demoOn) this.eng.yaw(t, raw);
    }

    steer(key, t, raw) {
        if (isNum(raw) && raw > 0 && raw < 65534) this.steerPick.usable(key);
        if (key === this.steerKey && !this.demoOn) this.eng.steer(t, raw);
    }

    pedal(t, raw) { if (!this.demoOn) this.eng.pedal(t, raw); }
    wheels(t, w) { if (!this.demoOn) this.eng.wheels(t, w); }
    hb(t, on) { if (!this.demoOn) this.eng.hb(t, on); }

    /** The GPS receiver's sentences: the speed in them against the car's, nothing else (gpscheck.js). */
    nmea(t, text) {
        const v = this.demoOn ? null : this.eng.view();
        const mode = !v ? null : v.state === 'drift' ? 'drift' : v.state === 'ready' && v.angle !== null && v.angle < 4 ? 'straight' : null;
        return this.gps.nmea(t, text, mode);
    }

    /* ---------- the clock tick ---------- */

    usingDemo(now) {
        const m = this.settings.get('demo');
        return m === 'on' || (m === 'auto' && !this.carSeen && now - this.startT > DEMO_AUTO_MS);
    }

    /** The engine the screen shows: the demo's, or the car's. */
    active() { return this.demoOn && this.demoEng ? this.demoEng : this.eng; }

    /** Every 50 ms. env: { hidden: the app's screen is not showing, signalsPage: the Signals page is }. */
    tick(now, env) {
        this.env = env || {};
        const demo = this.usingDemo(now);
        if (demo !== this.demoOn) {
            // the demo and the car never share a drift: the demo starts on a fresh engine every time
            this.demoOn = demo;
            if (demo) {
                const o = this._options();
                this.demo = new Demo(now);
                this.demoEng = new DriftEngine({ startDeg: o.startDeg, endDeg: o.endDeg, minKmh: o.minKmh, wheelbase: Demo.CAR.wheelbase, front: Demo.CAR.front, useSteer: true,
                    yawKey: 'demo', steerKey: 'demo', saved: Demo.learned(), demo: true, speedMaxAgeMs: SPEED_AGE_MS, onDrift: (r) => this._onDrift(r, true) });
            }
            this.newBest = {};
            this.log.info(demo ? 'demo data on: drifts are not saved' : 'the car\'s data: drifts are scored and saved');
        }
        if (demo) {
            const s = this.demo.sample(now), e = this.demoEng;
            e.speed(now, s.kmh); e.lat(now, s.lat); e.long(now, s.long); e.yaw(now, s.yaw); e.steer(now, s.steer); e.pedal(now, s.pedal); e.wheels(now, s.wheels); e.hb(now, s.hb);
            e.idle(now);
        } else {
            // the longest poll period in force over the last few seconds (a getter read every 2 s has not "stopped" after 1 s)
            const per = this.speedPeriod();
            if (per >= this.win.ms || now - this.win.t > 2.5 * this.win.ms) this.win = { ms: per, t: now };
            const age = this.speedSeries(now) === 'polled' ? Math.max(SPEED_AGE_MS, 3 * this.win.ms) : 0;
            if (age !== this.maxAge) { this.maxAge = age; this.eng.configure({ speedMaxAgeMs: age }); }
            this.eng.idle(now);
        }
        // the log is held back while a drift runs or may be beginning (heldlog.js)
        const busy = this.eng.tracker.cur !== null && !this.demoOn;
        if (this.log.set) this.log.set(busy ? 'run' : 'write');
        if (this.lastTick !== null && isNum(this.live.speed) && this.live.speed >= 10) this.movedMs += Math.min(500, Math.max(0, now - this.lastTick));
        this.lastTick = now;
        // a finished drift is written a second after it ended, if no other has begun
        if (this.driftDirty && !busy && now - this.driftEndedAt >= DRIFT_SAVE_MS) this._save(now);
        if (now - this.lastSlow >= SLOW_MS) { this.lastSlow = now; this._slow(now, busy); }
    }

    _slow(now, busy) {
        this._sources(now);
        if (!this.ratesLogged && this.movedMs >= RATES_AFTER_MS && !busy) {
            this.ratesLogged = true;
            Object.keys(this.meters).forEach((k) => { const m = this.meters[k].stats(now); this.log.info('rate ' + k + ': ' + (isNum(m.most) ? m.most.toFixed(1) + ' a second at most' : 'never five samples within 2 s') + ' (' + m.n + ' samples in all)'); });
        }
        // what was learned: written when it is new, at a moment that is not in the way (see the top)
        const sig = this._learnSig();
        if (sig !== this.learnSig) { this.learnSig = sig; this.learnDirty = true; }
        if (!this.learnDirty || busy || this.demoOn) return;
        const since = now - this.lastSave, standing = this.stoodSince !== null && now - this.stoodSince >= 1000;
        if ((this.learnUrgent && since >= LEARN_SAVE_MS) || (standing && since >= LEARN_SAVE_MS) || since >= LEARN_AGAIN_MS) this._save(now);
    }

    /** A short text that changes whenever something was learned. */
    _learnSig() {
        const s = this.eng.learn.status();
        return [s.yaw.key, s.yaw.state, s.yaw.moments, s.steer.key, s.steer.state, s.steer.moments, s.pedal.min, s.pedal.max, s.wheels.readings, s.left.agree + s.left.against, s.ax.agree + s.ax.against].join(' ');
    }

    _save(now) {
        this.store.setLearned(this.eng.learn.export());
        this.driftDirty = false; this.learnDirty = false; this.learnUrgent = false; this.lastSave = now;
        this.learnSig = this._learnSig();
        this.store.save();
    }

    /* ---------- how often the speed getter is read ---------- */

    _standingMs(now) {
        if (this.stoodSince !== null) return now - this.stoodSince;
        return this.live.speed === null ? now - this.startT : 0;        // (no speed from the car at all counts as standing)
    }

    /** ms between reads of the speed getter right now. */
    speedPeriod() {
        const now = this.now();
        return speedPeriod({ speed: this.live.speed, signalsPage: !!this.env.signalsPage, hidden: !!this.env.hidden, standingMs: this._standingMs(now) });
    }

    /* ---------- what was learned; a drift ---------- */

    _onLearned(what, state) {
        const s = this.eng.learn.status(), x = what === 'yaw' ? s.yaw : s.steer, wb = this._options().wheelbase, deg = 180 / Math.PI;
        this.learnDirty = true; this.learnUrgent = true;
        this.log.info((what === 'yaw' ? 'yaw rate (' + s.yaw.key + ')' : 'steering (' + s.steer.key + ')') + ': ' + (state === 'none' ? 'not learned' : state) +
            (x.k !== null ? ', ' + (what === 'yaw' ? (x.k * deg).toPrecision(4) + ' degrees a second per count' : (x.k * wb * deg).toPrecision(4) + ' degrees at the front wheels per count (with a wheelbase of ' + wb.toFixed(2) + ' m)') + ', zero at ' + x.zero.toFixed(1) +
                ', ' + x.n + ' moments (' + x.left + ' left, ' + x.right + ' right)' + (isNum(x.spread) ? ', spread ' + (x.spread * 100).toFixed(1) + ' %' : '') : ''));
    }

    /** A drift is over (drift.js): the session counts it, the store keeps it, the log gets its line. */
    _onDrift(rec, demo) {
        const now = this.now();
        const gps = demo ? null : this.gps.since(now - rec.time * 1000 - 500);
        const full = Object.assign({}, rec, { date: this.wall(), gps });
        const store = demo ? this.demoStore : this.store, S = demo ? this.demoSess : this.sess;
        this.newBest = store.addDrift(full);
        const kept = store.data.drifts[0];
        if (!kept) return;
        const lite = Object.assign({}, kept, { trace: null });
        S.count++; S.total += lite.score;
        if (!S.best || lite.score > S.best.score) S.best = lite;
        if (!S.angle || lite.peak > S.angle.peak) S.angle = lite;
        if (!S.time || lite.time > S.time.time) S.time = lite;
        if (isNum(lite.dist) && (!S.dist || lite.dist > S.dist.dist)) S.dist = lite;
        S.list.unshift(lite);
        if (S.list.length > SESSION_KEEP) S.list.length = SESSION_KEEP;
        if (demo) return;
        this.driftDirty = true; this.driftEndedAt = now;
        this.log.info('drift ' + S.count + ': ' + describeDrift(kept, rec.back) + ' | new best: ' + (Object.keys(this.newBest).join(', ') || (kept.flags.length ? 'none (a flagged drift sets no best)' : 'none')));
    }

    /* ---------- settings' two resets ---------- */

    /** "Reset bests": the all-time bests and the saved list of drifts go. The session's own totals stay. */
    resetBest() {
        const store = this.demoOn ? this.demoStore : this.store;
        store.resetBest();
        this.newBest = {};
        if (!this.demoOn) { this.store.setLearned(this.eng.learn.export()); this.store.save(); }
        this.log.info(this.demoOn ? 'demo bests cleared' : 'bests and saved drifts cleared');
    }

    /** "Reset what was learned": every learned line of every source goes, and the car is learned again from the next corner. */
    resetLearned() {
        this.eng.learn.reset();
        this.store.resetLearned();
        this.store.save();
        this.learnSig = this._learnSig(); this.learnDirty = false; this.learnUrgent = false;
        this.log.info('what was learned about the car was reset: yaw rate, steering, pedal range, wheel ratio, the two signs');
    }

    /* ---------- for the screens ---------- */

    view(now) {
        const eng = this.active(), v = eng.view(), store = this.demoOn ? this.demoStore : this.store, o = this._options();
        return {
            now, demo: this.demoOn, unit: this.settings.get('speedUnit') === 'mph' ? 'mph' : 'kmh',
            live: v, startDeg: o.startDeg, endDeg: o.endDeg, minKmh: o.minKmh,
            sess: this.demoOn ? this.demoSess : this.sess,
            best: store.data.best, saved: store.data.drifts, last: store.data.drifts[0] || null, newBest: this.newBest,
            notSaved: this.demoOn ? null : this.store.failed,
        };
    }

    signalsView(now) {
        const meters = {};
        Object.keys(this.meters).forEach((k) => { meters[k] = this.meters[k].stats(now); });
        const v = this.eng.view(), o = this._options();
        return {
            now, meters, raw: this.raw, learn: this.eng.learn.status(), gps: this.gps.status(now),
            inUse: { speed: this.speedSeries(now) === 'polled' ? 'speedP' : 'speedN', yaw: YAW_METER[this.yawKey], steer: STEER_METER[this.steerKey] },
            auto: { yaw: this.settings.get('yawSource') === 'auto' || YAW_KEYS.indexOf(this.settings.get('yawSource')) < 0, steer: this.settings.get('steerSource') === 'auto' || STEER_KEYS.indexOf(this.settings.get('steerSource')) < 0 },
            useSteer: o.useSteer, useLong: o.useLong, wheelbase: o.wheelbase, steering: v.steering, noSteer: v.noSteer, ax0: v.ax0,
            lag: v.lag, rate: v.rate, state: v.state, pm: v.pm, topUp: this.topUp.wanted(),
            notSaved: this.store.failed, demo: this.demoOn,
        };
    }
}

module.exports = { Session, describeDrift, CHASSIS, DEFAULT_CHASSIS, YAW_KEYS, STEER_KEYS, YAW_METER, STEER_METER, START_DEGS, MIN_KMHS, END_SHARE, FLAGS };
