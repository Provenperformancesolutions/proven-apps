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
 *   s.pedal(t, value, member)       the accelerator pedal's value as it came: kept raw for the Signals tab, used for nothing
 *   s.wheels(t, { fl, fr, rl, rr }, any)   the wheel values; they reach the engine only once they have proven themselves
 *   s.hb(t, true | false | null)
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
 *   - AS SHIPPED THE APP READS NO GETTER ITSELF (1.0.1, "Ask the car for values" off: car.js). The engine is
 *     then on the notified speed alone, where silence is "no change": a standing car is known to stand from
 *     the kit's own first read of the speed and from the last value notified, and a speed that has died
 *     cannot be told from one that holds still. The yaw rate and the sideways acceleration get an age
 *     limit (2.5 s) only while a drift runs or may be beginning: a car that slides does not hold both still
 *     to the last count, so there silence is a source that has died, and the drift ends flagged DATA GAP
 *     as in 1.0.0. On a straight no limit is put on them (the two paragraphs below are for the setting
 *     switched on): if CDS2 stops as a whole there, the angle stays where it was and nothing here can
 *     tell. A car that sends those two fewer than 8 times a second gets the LOW DATA RATE flag (drift.js),
 *     as before.
 *   - ONE SPEED SERIES goes to the engine. With "Ask the car for values" on: the getter's while the getter
 *     answers (a read kept within the last second, or within 2.5 of its periods where it is read more
 *     slowly), else the notified one.
 *     While it is the getter's, a speed older than 1.5 s (3 periods if that is more) counts as lost
 *     (angle.js, speedMaxAgeMs): the screen then says DATA LOST. That also holds once the getter has
 *     stopped answering, until the car notifies a speed: from then on it is the notified series, where
 *     silence is "no change", and a speed that has died cannot be told from one that holds still. A car
 *     whose getter never answered is on the notified series from the start.
 *     While car.js holds its reads back although the setting is on (the app's screen hidden, a subscription
 *     still being set up or tried again) nothing is read, so it is the notified series as well: a speed
 *     that holds still then (a car standing, a held speed) is not taken for lost.
 *   - THE YAW RATE AND THE SIDEWAYS ACCELERATION OF CDS2 are notified when they change, and with "Ask the
 *     car for values" on (and the app's screen showing) car.js reads their getters as well as soon as fewer
 *     than 16 notifications of one arrived in the last 2 s on the move (feed.js, TopUp). So on a car whose CDS2 answers, a sample of each arrives at least every 2.3 s
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
 *       steering:  driver (SteeringAngle ActualSteeringAngleDriver or actualSteeringAngleDriverNoCRC),
 *                  front (SteeringAngle SteeringAngleFrontAxleEffective), xfront (XView
 *                  statusFrontAxleSteeringAngle), xdriver (XView statusSteeringAngleDriver)
 *     1.0.1: the first of each list is the CORE source, the one the kit's own apps read on cars; the
 *     others are extras, subscribed only with "Other steering and yaw" on (car.js), and one of them can
 *     only be in use while that setting is on. So the steering wheel's angle now comes first (1.0.0 took the
 *     front wheels' own angle first). A steering wheel's angle is a plain multiple of the front wheels'
 *     only on a car whose steering ratio is fixed: on another car its line has a wider spread, and the
 *     Signals tab shows that.
 *   - THE END ANGLE is 0.6 of the start angle set (6 degrees for 10), rounded to a whole degree.
 *   - THE SESSION counts every drift since the app started, flagged or not. Only the all-time bests leave
 *     flagged drifts out (store.js).
 *   - THE SAVED FILE is written one second after a drift has ended if no other has begun, and for what was
 *     learned alone: 10 s after a line was first drawn or became "learned", else when the car next stands
 *     or every 20 s (1.0.0: every 2 minutes; an app that is stopped loses what it has not written). Never
 *     while a drift runs or may be beginning: a write holds the app up for a moment, and a sample stamped
 *     late is a wrong angle. The log is held back for the same reason. And once more, at once, when the
 *     platform asks the app to stop (stopping(): the kit ends the process 200 ms later).
 *   - NO PEDAL PERCENTAGE (1.0.1, after the first car: the owner saw it "jumping about"). 1.0.0 showed the raw
 *     value's share between the smallest and the largest value seen; the value does not arrive in that form.
 *     Nothing is worked out from the pedal any more: it never reaches the engine (the car's or the demo's),
 *     so no drift gets a pedal figure, and none is shown, logged or newly saved. The score and the flags
 *     never depended on it (drift.js sums it for the one figure "pedal" of a drift's record, and nothing
 *     reads that figure back). A saved file of 1.0.0 with a pedal range or pedal figures still loads; the
 *     figures are not shown. With "Pedal and handbrake" on, the raw value is kept for a photo (rawstudy.js).
 *   - THE WHEEL VALUES MUST PROVE THEMSELVES (1.0.1: on the first car all four read 65407 standing still and
 *     are no plain multiple of the speed). With "Wheel speeds" on they are kept raw for a photo, and they
 *     reach the engine (rear wheelspin, learning's check that the wheels grip, which way is left) only while
 *     rawstudy.js's WheelProof says they are plain multiples of the car's speed across steady speeds 20 km/h
 *     apart. Until then, and whenever that stops holding, the engine has no wheels at all: no wheelspin is
 *     shown, scored or saved, and the row says why.
 *   - DEMO DATA goes to an engine of its own with what the demo car "learned" (demo.js). Nothing of a demo
 *     drift reaches the saved file, and while the demo shows, the car's samples are counted for the Signals
 *     tab but not driven through the car's engine.
 */
const { DriftEngine, FLAGS } = require('./drift');
const { speedPeriod, TopUp, Meter, Pick, PARKED_AFTER_MS } = require('./feed');
const LEARN = require('./learn');
const { GpsCheck } = require('./gpscheck');
const { Store } = require('./store');
const Demo = require('./demo');
const { PedalStudy, WheelProof } = require('./rawstudy');

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
const YAW_KEYS = ['cds2', 'chassis'], STEER_KEYS = ['driver', 'front', 'xfront', 'xdriver'];
/** The core source of each (always subscribed); the others only while "Other steering and yaw" is on. */
const YAW_CORE = 'cds2', STEER_CORE = 'driver';
const YAW_METER = { cds2: 'yawC', chassis: 'yawS' }, STEER_METER = { front: 'steerF', xfront: 'steerXF', driver: 'steerD', xdriver: 'steerXD' };
/** The settings that ask more of the car than the core (car.js, GROUPS): what the screens are told is on. */
const EXTRA_KEYS = ['askCar', 'gpsOn', 'wheelsOn', 'sourcesOn', 'pedalOn', 'studyOn'];
const START_DEGS = [8, 10, 12, 15, 20], MIN_KMHS = [15, 20, 30, 40];
const END_SHARE = 0.6;

const SLOW_MS = 1000;              // housekeeping: the choice of sources, the saved file, rates for the log
const FRESH_MS = 1000;             // the getter is "answering" while a read was kept within this (2.5 poll periods if that is longer)
const SPEED_AGE_MS = 1500;         // a getter speed older than this (3 poll periods if that is more) is lost
const MOTION_AGE_MS = 2500;        // a CDS2 yaw rate or sideways acceleration older than this on the move is lost (see the top)
const STAND_KMH = 0.5;
const DEMO_AUTO_MS = 5000;         // "Auto": demo data once the car has said nothing for this long after the start
const DRIFT_SAVE_MS = 1000;        // a finished drift is written this long after it ended
const LEARN_SAVE_MS = 10000, LEARN_AGAIN_MS = 20000;   // (1.0.0: 120000. An app that is stopped loses what it has not written)
const SESSION_KEEP = 200;          // drifts of this session kept for the list (the totals count them all)
const RATES_AFTER_MS = 30000;      // the sources' rates go to the log once the car has driven this long
const CALM_MS2 = 1.0;              // the wheel values prove themselves only in moments with no more sideways acceleration than this (m/s2)
const STARVED_MS = 10000, STARVED_N = 5;   // "next to no motion data": fewer than this many values of one of the two after this long on the move

const isNum = (x) => typeof x === 'number' && isFinite(x);
const freshSession = () => ({ count: 0, total: 0, best: null, angle: null, time: null, dist: null, list: [] });

/** One line for the log: everything a drift record holds but its trace. */
function describeDrift(r, back) {
    const n = (x, d, unit) => (isNum(x) ? x.toFixed(d) + (unit || '') : 'not known');
    return r.score + ' points, grade ' + r.grade + ', ' + (r.end === 'spin' ? 'ended in a SPIN' : r.end === 'slow' ? 'ended under the minimum speed' : r.end === 'lost' ? 'ended because the angle was lost' : 'ended') +
        ' | peak ' + n(r.peak, 1) + ' deg ' + (r.dir === 'L' ? 'LEFT' : r.dir === 'R' ? 'RIGHT' : '') + ', average ' + n(r.avg, 1) + ', ' + r.switches + (r.switches === 1 ? ' switch' : ' switches') + ', ' + n(r.time, 2, ' s') + ', ' + n(r.dist, 1, ' m') +
        ' | entry ' + n(r.entry, 1) + ' km/h, average ' + n(r.avgKmh, 1) + ', lowest ' + n(r.minKmh, 1) +
        ' | peak sideways ' + n(r.peakG, 2, ' g') + ', peak yaw rate ' + n(r.peakYaw, 1, ' deg/s') +
        ' | opposite lock ' + n(r.opp, 1, ' deg') + ', rear wheelspin ' + n(r.wheelspin, 0, ' %') + ', handbrake at the start ' + (r.handbrake === true ? 'yes' : r.handbrake === false ? 'no' : 'not known') +
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
        this.yawKey = this._pick(this.yawPick, 'yawSource', YAW_CORE, this.startT);
        this.steerKey = this._pick(this.steerPick, 'steerSource', STEER_CORE, this.startT);
        this.maxAge = 0; this.motionAge = 0; this.yawAge = 0;      // the age limits handed to the engine right now (tick)
        this.ignoredSaid = '';             // which source named in Settings is not used right now (said in the log when it changes)
        this.spans = {};                   // source key -> { lo, hi }: the lowest and highest raw value in this life (the steering and yaw rows)
        this.progress = null;              // how far learning is (_progress), looked at once a second
        this.eng = new DriftEngine(Object.assign(this._options(), {
            yawKey: this.yawKey, steerKey: this.steerKey, saved: this.store.data.learned, demo: false, speedMaxAgeMs: 0,
            // (an age limit on CDS2's two is set only while the app may read their getters: tick())
            yawMaxAgeMs: 0, latMaxAgeMs: 0,
            onDrift: (r) => this._onDrift(r, false), onLearned: (what, state) => this._onLearned(what, state),
        }));
        this.demoEng = null; this.demo = null; this.demoOn = false;
        this.gps = new GpsCheck();
        this.pedalRaw = new PedalStudy();  // the accelerator pedal as it came: for a photo, used for nothing
        this.proof = new WheelProof();     // the wheel values as they came, and whether they have proven themselves
        this.wheelsOk = false; this.latNow = null;
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
        this.readsHeld = false;            // car.js: the own reads are on in Settings and held back (set-up under way)
        this.lastSlow = this.startT;
        this.driftDirty = false; this.driftEndedAt = -Infinity;
        this.learnDirty = false; this.learnSig = this._learnSig(); this.learnUrgent = false; this.lastSave = -Infinity;
        const st = this.eng.learn.status();
        if (this.store.data.learned) this.log.info('learned from the saved file: yaw rate (' + this.yawKey + ') ' + st.yaw.state + ' with ' + st.yaw.moments + ' moments, steering (' + this.steerKey + ') ' + st.steer.state + ' with ' + st.steer.moments);
        this.progress = this._progress();
    }

    /* ---------- what is switched on ---------- */

    /** Is a setting that asks more of the car on (car.js, GROUPS)? All are off as shipped. */
    uses(group) { return this.settings.get(group) === true; }
    /** Does the app read getters itself ("Ask the car for values")? */
    asks() { return this.uses('askCar'); }
    /**
     * Is it reading them right now? Not while its screen is hidden, and not while car.js holds the reads back because a
     * subscription is still being set up or tried again (car.js, tick, sets readsHeld). While nothing is read the engine
     * is on what the car notifies, exactly as with the setting off.
     */
    reading() { return this.asks() && !this.env.hidden && this.readsHeld !== true; }

    /**
     * A group of extras was switched off: what it gave the engine is taken back at once, so that no figure goes on
     * from a value that no longer arrives (car.js hands nothing of it on from now).
     */
    groupOff(group) {
        const e = this.eng, now = this.now();
        if (group === 'pedalOn') { this.pedalRaw.reset(); e.hb(now, null); e.hbAt = null; e.x.hbAt = null; e.x.hbKnown = false; }
        if (group === 'wheelsOn') { this.proof.reset(); this._noWheels(); }
        if (group === 'gpsOn') this.gps = new GpsCheck();
        if (group === 'sourcesOn') this._sources(now);
        if (group === 'askCar') { this.polledAt = null; this.topUp.off(); }
    }

    /** The source a Pick gives, with the setting as it may be honoured: an extra source only while "Other steering and yaw" is on. */
    _pick(pick, setting, core, now) {
        const extras = this.uses('sourcesOn'), ok = (k) => k === core || extras, set = this.settings.get(setting);
        let k = pick.choose(ok(set) ? set : 'auto', now, this.heardAt === undefined ? null : this.heardAt);
        if (!ok(k)) { k = core; pick.key = core; }
        return k;
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

    /** { yaw, steer }: true where Settings names a source of "Other steering and yaw" while that is switched off: the choice is not used. */
    _ignored() {
        const off = !this.uses('sourcesOn'), is = (setting, keys, core) => { const v = this.settings.get(setting); return off && keys.indexOf(v) >= 0 && v !== core; };
        return { yaw: is('yawSource', YAW_KEYS, YAW_CORE), steer: is('steerSource', STEER_KEYS, STEER_CORE) };
    }

    /** Which yaw rate and which steering source is in use (see the top). */
    _sources(now) {
        const y = this._pick(this.yawPick, 'yawSource', YAW_CORE, now), st = this._pick(this.steerPick, 'steerSource', STEER_CORE, now);
        // (said once in the log, each time it becomes so: the first check of 1.0.1 found that nothing said it)
        const ig = this._ignored(), sig = (ig.yaw ? 'y' : '') + (ig.steer ? 's' : '');
        if (sig !== this.ignoredSaid) {
            this.ignoredSaid = sig;
            if (ig.yaw) this.log.info('yaw rate: Settings names the source "' + this.settings.get('yawSource') + '", which belongs to "Other steering and yaw": that is switched off, so "' + YAW_CORE + '" is used');
            if (ig.steer) this.log.info('steering: Settings names the source "' + this.settings.get('steerSource') + '", which belongs to "Other steering and yaw": that is switched off, so "' + STEER_CORE + '" is used');
        }
        const why = (was, core, setting) => (!this.uses('sourcesOn') && was !== core ? ', which is switched off in Settings' : this.settings.get(setting) === 'auto' ? ', which has delivered nothing' : '');
        if (y !== this.yawKey) {
            this.log.info('yaw rate: source "' + y + '" in use from now on (was "' + this.yawKey + '"' + why(this.yawKey, YAW_CORE, 'yawSource') + ')');
            // (the yaw rate's age limit follows at the next tick)
            this.yawKey = y; this.yawAge = 0; this.eng.configure({ yawKey: y, yawMaxAgeMs: 0 });
        }
        if (st !== this.steerKey) {
            this.log.info('steering: source "' + st + '" in use from now on (was "' + this.steerKey + '"' + why(this.steerKey, STEER_CORE, 'steerSource') + ')');
            this.steerKey = st; this.eng.configure({ steerKey: st });
        }
    }

    /* ---------- what the car sends (car.js) ---------- */

    meter(key) { return this.meters[key] || (this.meters[key] = new Meter()); }
    seen(key, t) { this.meter(key).sample(t); }
    /** The raw value of a source as it last arrived, as text, for the Signals tab. */
    note(key, text) { this.raw[key] = String(text).slice(0, 40); }
    /** The lowest and highest raw value of a source in this life (a number as it came, whatever its form). */
    span(key, x) {
        if (!isNum(x)) return;
        const r = this.spans[key] || (this.spans[key] = { lo: x, hi: x });
        if (x < r.lo) r.lo = x;
        if (x > r.hi) r.hi = x;
    }

    /** Is the speed getter answering: a speed read from it within 1 s, or within 2.5 of the longest poll period in force lately. */
    polledFresh(now) { return this.polledAt !== null && now - this.polledAt <= Math.max(FRESH_MS, 2.5 * this.win.ms); }
    /**
     * Which speed series the engine is on: 'polled' while the getter answers, and still once it has stopped until the
     * car notifies a speed; 'notified' from then on, and from the start on a car whose getter never answered.
     */
    speedSeries(now) {
        // (as shipped the app reads no getter, and with the setting on it reads none while its screen is hidden or a
        // set-up is under way: the notified series, where silence is "no change")
        if (!this.reading()) return 'notified';
        if (this.polledFresh(now)) return 'polled';
        return this.notifiedAt !== null && (this.polledAt === null || this.notifiedAt > this.polledAt) ? 'notified' : 'polled';
    }

    /** A speed sample of one series, km/h as the car reports it. */
    speed(series, t, kmh) {
        if (!isNum(t) || !isNum(kmh)) return;
        this.carSeen = true;
        if (this.heardAt === null) this.heardAt = t;
        // one series for the engine: the getter's while it answers, else the notified one
        if (series === 'polled') { if (!this.reading()) return; this.polledAt = t; } else { this.notifiedAt = t; if (this.reading() && this.polledFresh(t)) return; }
        if (this.live.speedT === null || t >= this.live.speedT) { this.live.speed = kmh; this.live.speedT = t; }
        if (kmh < STAND_KMH) { if (this.stoodSince === null) this.stoodSince = t; } else this.stoodSince = null;
        this.gps.speed(t, kmh);
        this.proof.speed(t, kmh);
        if (!this.demoOn) this.eng.speed(t, kmh);
    }

    lat(t, ms2) { this.latNow = ms2; if (!this.demoOn) this.eng.lat(t, ms2); }
    long(t, ms2) { if (!this.demoOn) this.eng.long(t, ms2); }

    yaw(key, t, raw) {
        if (isNum(raw) && raw > 0 && raw < 65534) this.yawPick.usable(key);
        if (key === this.yawKey && !this.demoOn) this.eng.yaw(t, raw);
    }

    steer(key, t, raw) {
        if (isNum(raw) && raw > 0 && raw < 65534) this.steerPick.usable(key);
        if (key === this.steerKey && !this.demoOn) this.eng.steer(t, raw);
    }

    /** The accelerator pedal's value as it came: kept raw for a photo. Nothing is worked out from it and it never reaches the engine. */
    pedal(t, v, member) { this.pedalRaw.value(v, member); }

    /** What the wheels gave the engine is taken back: no wheelspin goes on from values that are not (or no longer) proven. */
    _noWheels() { const e = this.eng; e.rfS.reset(); e.lrS.reset(); e.x.wheelspin = null; this.wheelsOk = false; }

    /**
     * A wheel event. any: the four values as they came (the proof and the raw study); w: the usable ones. The engine
     * gets them only while the values have proven themselves to be plain multiples of the speed (rawstudy.js).
     */
    wheels(t, w, any) {
        this.proof.wheels(t, any || w);
        if (this._proven() && !this.demoOn) this.eng.wheels(t, w);
    }

    /** Have the wheel values proven themselves (rawstudy.js)? A change either way is logged, and what an unproven value gave is taken back. */
    _proven() {
        const ok = this.proof.proven();
        if (ok !== this.wheelsOk) {
            if (!ok) this._noWheels();
            this.wheelsOk = ok;
            this.log.info(ok ? 'wheel speeds: the four values are plain multiples of the car\'s speed across steady speeds: used from now on' : 'wheel speeds: the values no longer agree with the car\'s speed across steady speeds: not used');
        }
        return ok;
    }
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
        // the own reads have stopped (switched off, the screen hidden, a set-up under way): the getter's last answer is
        // forgotten, so that the engine is not on a getter that is no longer read when the reads start again
        if (this.polledAt !== null && !this.reading()) this.polledAt = null;
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
            // (the demo car's pedal is left out too: no pedal figure is shown anywhere, made up or not)
            e.speed(now, s.kmh); e.lat(now, s.lat); e.long(now, s.long); e.yaw(now, s.yaw); e.steer(now, s.steer); e.wheels(now, s.wheels); e.hb(now, s.hb);
            e.idle(now);
        } else {
            // the longest poll period in force over the last few seconds (a getter read every 2 s has not "stopped" after 1 s)
            const per = this.speedPeriod();
            if (per >= this.win.ms || now - this.win.t > 2.5 * this.win.ms) this.win = { ms: per, t: now };
            const age = this.speedSeries(now) === 'polled' ? Math.max(SPEED_AGE_MS, 3 * this.win.ms) : 0;
            if (age !== this.maxAge) { this.maxAge = age; this.eng.configure({ speedMaxAgeMs: age }); }
            // The yaw rate and the sideways acceleration may "be too old" (2.5 s on the move, then they count as lost) in two
            // cases only. While the app tops CDS2's two up from their getters: "Ask the car for values" on, the screen
            // showing and no set-up under way (car.js reads nothing otherwise). And while a drift runs or may be beginning, getters or not:
            // a car that slides does not hold its yaw rate and its sideways acceleration still to the last count for 2.5 s,
            // so silence there is a source that has died. On a straight, values that hold still and a source that has died
            // look alike, and as shipped (no getter read) nothing can tell them apart.
            const asking = this.reading(), sliding = this.eng.tracker.cur !== null;
            const yAge = sliding || (asking && this.yawKey === 'cds2') ? MOTION_AGE_MS : 0, lAge = sliding || asking ? MOTION_AGE_MS : 0;
            if (yAge !== this.yawAge || lAge !== this.motionAge) { this.yawAge = yAge; this.motionAge = lAge; this.eng.configure({ yawMaxAgeMs: yAge, latMaxAgeMs: lAge }); }
            this.eng.idle(now);
        }
        // the wheel values' proof ("Wheel speeds" on): a ratio only while the car goes straight and no drift runs or may be
        // beginning (in a corner the four wheels differ by some percent, and in a drift the rear ones spin)
        if (this.uses('wheelsOn')) {
            this.proof.look(now, this.eng.tracker.cur === null && isNum(this.latNow) && Math.abs(this.latNow) <= CALM_MS2);
            this._proven();
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
        try { this.progress = this._progress(); } catch (e) { /* the words stay as they were */ }
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
        return this.store.save();
    }

    /** No drift runs or may be beginning: a moment at which a small file write is not in the way. */
    quiet() { return this.demoOn || this.eng.tracker.cur === null; }

    /**
     * The platform has asked the app to stop (the kit ends the process 200 ms later): what was learned and every
     * finished drift go into the saved file now, once, whatever runs. -> true if it was written.
     */
    stopping() { return this._save(this.now()); }

    /** The app's state in one word, for the record of starts and stops: demo | drift | nodata | learning | ready. */
    stateWord() {
        if (this.demoOn) return 'demo';
        const v = this.eng.view();
        if (v.run) return 'drift';
        if (v.state === 'nodata' || v.state === 'noyaw' || v.state === 'gap') return 'nodata';
        return v.learn === 'learned' ? 'ready' : 'learning';
    }

    /**
     * How far learning is, in counts (the words are made in screens.js). The limits are learn.js's own.
     *   yaw:   { state, have (moments kept), need, left, right, side (needed each way), spread, limit }
     *   steer: the same; left and right are null until the yaw rate has its line (which side a steering moment
     *          was on is read off the yaw rate); lo, hi: the speeds (km/h) between which a corner teaches it
     * "left" is a left-hand turn as the app takes it (learn.js: positive sideways acceleration, unless the wheels said otherwise).
     */
    _progress() {
        const L = this.eng.learn, st = L.status(), ex = L.export(), flip = !st.left.positiveIsLeft;
        const sides = (rows, sign) => { let a = 0, b = 0; rows.forEach((p) => { const y = sign(p); if (y > 0) a++; else if (y < 0) b++; }); return flip ? [b, a] : [a, b]; };
        const yawRows = (ex.yaw && ex.yaw[st.yaw.key]) || [], steerRows = (ex.steer && ex.steer[st.steer.key + '/' + st.yaw.key]) || [];
        const y = sides(yawRows, (p) => p[1]), line = isNum(st.yaw.k) && isNum(st.yaw.zero);
        const sd = line ? sides(steerRows, (p) => st.yaw.k * (p[1] - st.yaw.zero)) : [null, null];
        return {
            yaw: { state: st.yaw.state, have: yawRows.length, need: LEARN.YAW.NEED, left: y[0], right: y[1], side: LEARN.YAW.NEED_SIDE, spread: st.yaw.spread, limit: LEARN.YAW.SPREAD, lo: LEARN.YAW.V_LO, hi: LEARN.YAW.V_HI },
            steer: { state: st.steer.state, have: steerRows.length, need: LEARN.STEER.NEED, left: sd[0], right: sd[1], side: LEARN.STEER.NEED_SIDE, spread: st.steer.spread, limit: LEARN.STEER.SPREAD, lo: LEARN.STEER.V_LO, hi: LEARN.STEER.V_HI },
        };
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
        this.log.info('what was learned about the car was reset: yaw rate, steering, wheel ratio, the two signs');
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
            // what is switched on (a figure that needs an extra says so where the extra is off), and how far learning is
            extras: this._extras(), progress: this.demoOn ? null : this.progress,
            starved: !this.demoOn && this.starved(),
            // why there is no rear wheelspin from the wheels: null (there is, or the demo shows) | 'off' | 'none' | 'wait' | 'form'
            wheelsWhy: this.demoOn ? null : this.wheelsWhy(),
        };
    }

    /**
     * Why the wheels give no figure right now: 'off' (switched off in Settings), 'none' (no wheel value has arrived),
     * 'wait' (not proven yet: two steady speeds 20 km/h apart are needed), 'form' (the values are no plain multiple
     * of the speed), or null: they have proven themselves and are in use.
     */
    wheelsWhy() {
        if (!this.uses('wheelsOn')) return 'off';
        const st = this.proof.status();
        return st.ok ? null : st.why || 'wait';
    }

    /**
     * Does the car send next to no motion data? It has done 10 km/h or more for 10 s in all, and fewer than five
     * values of the sideways acceleration, or of the yaw rate in use, have arrived since the app started. As shipped
     * the app reads no getter itself, so on a car that does not notify those two nothing can be learned: the Drift
     * tab then says so instead of asking for more corners (screens.js). With "Ask the car for values" on, the getters
     * are read where the car sends too little, and this is not said.
     */
    starved() {
        if (this.asks() || this.movedMs < STARVED_MS) return false;
        const n = (k) => (this.meters[k] ? this.meters[k].n : 0);
        return n('lat') < STARVED_N || n(YAW_METER[this.yawKey]) < STARVED_N;
    }

    /** { askCar, gpsOn, ...: true | false } as Settings has them now. */
    _extras() { const o = {}; EXTRA_KEYS.forEach((k) => { o[k] = this.uses(k); }); return o; }

    signalsView(now) {
        const meters = {};
        Object.keys(this.meters).forEach((k) => { meters[k] = this.meters[k].stats(now); });
        const v = this.eng.view(), o = this._options();
        // (raw and spans are written to by every sample: the page gets a copy of this moment, main.js takes one a second)
        const spans = {};
        Object.keys(this.spans).forEach((k) => { spans[k] = { lo: this.spans[k].lo, hi: this.spans[k].hi }; });
        return {
            now, meters, raw: Object.assign({}, this.raw), spans, learn: this.eng.learn.status(), gps: this.gps.status(now),
            inUse: { speed: this.speedSeries(now) === 'polled' ? 'speedP' : 'speedN', yaw: YAW_METER[this.yawKey], steer: STEER_METER[this.steerKey] },
            // ("set by hand": the setting names a source, and that source may be used; an extra source named while the extras are off is not)
            auto: { yaw: this.settings.get('yawSource') !== this.yawKey, steer: this.settings.get('steerSource') !== this.steerKey },
            // (a source named in Settings that is one of "Other steering and yaw" while that is off: not used, and the page says so)
            ignored: this._ignored(),
            extras: this._extras(), progress: this.progress,
            pedalRaw: this.pedalRaw.status(), pedalMore: this.pedalRaw.others, wheelRaw: this.proof.status(), wheelsWhy: this.wheelsWhy(),
            useSteer: o.useSteer, useLong: o.useLong, wheelbase: o.wheelbase, steering: v.steering, noSteer: v.noSteer, ax0: v.ax0,
            lag: v.lag, rate: v.rate, state: v.state, pm: v.pm, topUp: this.topUp.wanted(),
            notSaved: this.store.failed, demo: this.demoOn,
        };
    }
}

module.exports = { Session, describeDrift, CHASSIS, DEFAULT_CHASSIS, YAW_KEYS, STEER_KEYS, YAW_CORE, STEER_CORE, YAW_METER, STEER_METER, EXTRA_KEYS, START_DEGS, MIN_KMHS, END_SHARE, LEARN_AGAIN_MS, FLAGS };
