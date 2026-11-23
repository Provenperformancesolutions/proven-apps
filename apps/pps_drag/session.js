'use strict';
/**
 * session.js - Proven Drag: everything between the car's data and the screens. It owns the logic modules
 * (run.js through feed.js, gpsscale.js, wheels.js, slope.js), is handed every sample by car.js with its
 * time, and turns a finished run into the record that is shown, logged and saved (store.js).
 * It reads no car signal and draws nothing itself.
 *
 *   const s = new Session({ now, wall, log, settings, store });
 *     now()   ms on ONE clock that only runs forward (process.hrtime): every time in the timing path
 *     wall()  Date.now(): only for the date on a saved run and on a saved calibration
 *   s.speed(series, t, kmh, took)  every speed sample, series 'notified' | 'polled', as the car reports it
 *                                  (took: ms the getter read took, for a polled sample)
 *   s.accel(t, ms2, notified)      forward acceleration (notified: it was notified, not read by the fallback)
 *   s.wheels(t, raw4), s.nmea(t, text), s.position(t, lat, lon, src), s.heightCan(t, m)
 *   s.seen(key, t)                 a sample of source `key` arrived (the Signals page's rates)
 *   s.slowRead()                   the speed getter answered a read too slowly for it to be used
 *   s.tick(now, { hidden, signalsPage })    every 50 ms
 *   s.speedPeriod(), s.accelPeriod()         how often the two getters are to be read right now (ms; 0: not)
 *   s.view(now), s.signalsView(now)          what the screens draw
 *   s.resetRun(), s.resetBest(), s.resetCalibration(), s.configure()
 *
 * A RUN RECORD (what the Timeslip shows and the saved file keeps; no position is in it):
 *   { date, start, unit, series, why, results: { key: { s, pm, trap, at } }, flags: [...],
 *     scale, scaleSource, scaleLabel, spin: { peak, secs, axle, method, readHigh } | null,
 *     slope: { pct, ms, n } | null, height: { src, splits: { key: { m, pct } } } | null (height CHANGES
 *     only: the height above sea level is not kept),
 *     sum: the chosen engine's run summary (spacings, launch gap, how the launch was placed, holes ...),
 *     other: the other engine's times of the same run, for comparison }
 *
 * FLAGS (any of them keeps a run from setting a best time; the Timeslip lists them)
 *   DOWNHILL START, SPEED READ HIGH AT LAUNCH   the brief's two (slope.js, wheels.js)
 *   DATA GAP          the speed series had a hole of 0.3 s or more while the speed moved, or repeated one
 *                     value for a second or more, or stopped before the run was over, or the app itself
 *                     was held up for 0.3 s or more during the run (its 50 ms tick came that late)
 *   SPEED JUMP        the series made a step upwards that no car does and stuck to it: the run ended there
 *   SERIES DISAGREE   the notified and the polled engine timed the run and a split differs by more than
 *                     their two +- together (the +- shown is widened to that difference)
 *
 * IS THE SPEED FRESH. A speed sample that arrived once says nothing about now. The speed counts as
 *   there while a getter read was kept within the last second (2.5 poll periods where the getter is read
 *   more slowly), or a notification arrived within the last second. Otherwise the Run tab says NO SPEED
 *   FROM THE CAR and shows no speed, the Signals tab says since when, the polled engine is not left
 *   armed on a standstill that may be long over, and a run that was being timed ends after 3 s without
 *   a sample (ended 'silent', DATA GAP).
 *   ARMED, NO NEW SPEED. A car that only notifies its speed sends nothing while it stands, and that is
 *   no fault: the notified engine stays armed on the last value it was sent, and the launch is timed.
 *   So when nothing arrives but that engine is armed, the Run tab says ARMED, NO NEW SPEED with the line
 *   "Closed roads and track days only" (no speed is shown: none is arriving), if this car's notifier has
 *   been heard while the speed changed, or its getter has never answered (then the notifier is all there
 *   can be). It keeps saying NO SPEED FROM THE CAR where the car's getter has answered at some time (in
 *   time or too slowly to be used), has stopped, and the notifier has never been heard (a launch would
 *   not be timed, as far as the app can tell), and where nothing is armed at all. What the app cannot
 *   tell apart: a car that only notifies, standing, from one whose notifier has died while it stood, or
 *   from one that never notifies and whose getter only ever answered the kit's own first read. All
 *   three read ARMED, NO NEW SPEED.
 *   The line "Closed roads and track days only" shows whenever an engine is armed, whatever the banner
 *   says: under NO SPEED FROM THE CAR it reads "Timer armed. Closed roads and track days only" while
 *   state() is 'ready' (screens.js). A car that notifies and has only stood since the app started, with a
 *   getter that is too slow or has stopped, is such a case: its launch is timed. So is a car that never
 *   notifies and whose getter has died: there the line shows although nothing will be timed.
 *
 * WHAT IS DECIDED HERE (each is a choice, none was tried on a car)
 *   - The speed scale is the "Speed scale" setting's whether or not the workshop switch is on: that
 *     switch only shows or hides the setting.
 *   - Start slope and the height at the launch are taken at the first launch signal of a run (the
 *     acceleration record only reaches back 4 s, and a run can last a minute).
 *   - Height change is only given when the height at the launch and at the line come from the same
 *     source (the receiver's own sentence, or the raw GPS value): the two may count from different zeros.
 *   - Any flag keeps a run from setting a best time.
 *   - The saved file is written when a run ends, and for a calibration alone: 10 s after a factor was
 *     first learned (GPS, a wheel), and for a GPS factor that drifts only once it has moved by 0.1 % from
 *     what the file holds and 5 minutes have passed since the last write. Never while the timer is armed
 *     or timing (a write blocks the app for a moment, and a sample stamped late is a wrong time). The
 *     log is held back for the same reason (heldlog.js).
 *   - The data rate on the Run tab is what arrived: samples of the series the screen follows over the
 *     last 2 s. A notifier that says nothing right now (a steady car, while the getter delivers) shows
 *     the rate it was measured at while the speed last changed. While a finished run is on the screen
 *     the cell is that run's own middle spacing and is labelled RUN DATA RATE. Whenever no speed is
 *     arriving the cell says "--", whatever is on the screen (the Timeslip has the run's own rate).
 *   - Demo data goes to an engine of its own; nothing of a demo run reaches the saved file, and the
 *     demo has no wheelspin, slope or height (those would be the real car's, or invented).
 */
const { TwoSeries, pollPeriod, AccelFallback, Changing, RateMeter, describeRun, PARKED_AFTER_MS } = require('./feed');
const { GpsScale, scaleFor, heightChange } = require('./gpsscale');
const { WheelFactors, WheelSpin, AccelSpin } = require('./wheels');
const { StartSlope, downhill } = require('./slope');
const { STARTS, DISTANCES, splitsFor, LAUNCH_KMH } = require('./run');
const { Store } = require('./store');
const Demo = require('./demo');

const SLOW_MS = 1000;              // housekeeping: rates for the log, the saved file
const CAL_SAVE_MS = 10000;         // a calibration learned for the first time is written this long after the last write at the earliest
const CAL_AGAIN_MS = 300000;       // a GPS factor that only drifted: this long after the last write at the earliest
const FACTOR_SAVE = 0.001;         // ... and only once it is this far from what the file holds
const FRESH_MS = 1000;             // the speed is there while a sample is at most this old (2.5 poll periods if that is longer)
const SILENT_MS = 3000;            // a run ends when no speed sample at all arrived for this long
const RATE_MS = 2000;              // the data rate shown: samples over this long
const GAP_FLAG_MS = 300;           // DATA GAP: a hole in the series, or the app held up, for this long
const FROZEN_FLAG_MS = 1000;       // DATA GAP: one value repeated for this long
const TICK_LATE_MS = 250;          // the 50 ms tick this far apart: the app was held up
const HEIGHT_KEEP = 400;           // height readings kept through one run
const HEIGHT_AGE_MS = 3000;        // a height reading counts for a line crossed up to this long after it
const DEMO_AUTO_MS = 5000;         // "Auto": demo data once the car has said nothing for this long after the start
const FACTOR_LOG = 0.001;          // the GPS factor is logged again when it has moved by this much

const isNum = (x) => typeof x === 'number' && isFinite(x);
const round = (x, d) => (isNum(x) ? Math.round(x * Math.pow(10, d)) / Math.pow(10, d) : null);

class Session {
    constructor(o) {
        this.now = o.now;
        this.wall = o.wall || (() => Date.now());
        this.log = o.log;
        this.settings = o.settings;
        this.store = o.store;
        this.demoStore = new Store({ dir: null });
        this.startT = this.now();
        const eng = () => ({ start: this.settings.get('start'), unit: this.settings.get('speedUnit') });
        this.two = new TwoSeries(Object.assign(eng(), {
            scale: () => { this.runScale = this.scaleNow(); return this.runScale; },
            onLaunch: (series, t0) => this._onLaunch(series, t0),
            onRun: (run) => this._onRun(run, false),
        }));
        this.demoTwo = new TwoSeries(Object.assign(eng(), {
            scale: () => { this.runScale = { factor: 1, source: 'demo', label: 'DEMO' }; return this.runScale; },
            onLaunch: () => { this.shown = null; this.newBest = {}; },
            onRun: (run) => this._onRun(run, true),
        }));
        this.demo = new Demo(this.startT);
        this.demoOn = false; this.demoSpeed = 0;
        this.gps = new GpsScale({ saved: this.store.data.gps, onResult: (r) => this._gpsResult(r) });
        this.factors = new WheelFactors({ saved: this.store.data.wheels, onLearned: (w, f, n) => this._wheelLearned(w, f, n) });
        this.spin = new WheelSpin();
        this.est = new AccelSpin();
        this.slope = new StartSlope();
        this.changing = new Changing();
        this.fallback = new AccelFallback();
        this.meters = {};
        this.live = { speed: null, speedT: null, accel: null, accelT: null };
        this.recent = { speedN: [], speedP: [] };      // arrival times of the last 2 s, per speed series
        this.win = { ms: 50, t: this.startT };         // the longest poll period in force lately (for "is the speed fresh")
        this.lastTick = null; this.stallMs = 0;
        this.stoodSince = null;            // since when the car has stood (either series), null while it moves
        this.carSeen = false;              // the car has answered (a speed sample, or its speed service is up)
        this.getterAnswers = false;        // the speed getter has answered a read of the app at some time (in time, or too slowly to be used)
        this.launched = false; this.launch = null; this.heights = [];
        this.shown = null;                 // the run record on screen (until the next launch)
        this.spinLive = null;
        this.newBest = {};
        this.runScale = null;
        this.env = {};
        this.lastSlow = this.startT; this.calDirty = false; this.calDrift = false; this.lastCalSave = -Infinity; this.factorLogged = null;
        const saved = this.gps.result();
        this.calSaved = saved ? { method: saved.method, factor: saved.factor } : null;      // the GPS factor the file holds
        if (saved) this.log.info('speed scale from the saved file: ' + this._factorText(saved));
    }

    /* ---------- what the car sends (car.js) ---------- */

    meter(key) { return this.meters[key] || (this.meters[key] = new RateMeter(key)); }
    seen(key, t) { this.meter(key).sample(t); }

    /** A speed sample of one series, km/h as the car reports it (no GPS scale). took: ms the getter read took (polled). */
    speed(series, t, kmh, took) {
        if (!isNum(t) || !isNum(kmh)) return;
        this.carSeen = true;
        const key = series === 'polled' ? 'speedP' : 'speedN', rec = this.recent[key];
        if (series === 'polled') this.getterAnswers = true;
        this.seen(key, t);
        rec.push(t);
        while (rec.length > 1 && t - rec[0] > RATE_MS) rec.shift();
        // the engines first: a launch they call from here still finds the standstill and the records before it
        if (!this.demoOn) { if (series === 'polled') this.two.polled(t, kmh, took); else this.two.notified(t, kmh); }
        this.changing.speed(t, kmh);
        this.gps.speed(t, kmh);
        this.factors.speed(t, kmh);
        this.spin.speed(t, kmh, series);
        this.est.speed(t, kmh);
        if (this.live.speedT === null || t >= this.live.speedT) { this.live.speed = kmh; this.live.speedT = t; }
        if (kmh < LAUNCH_KMH) { if (this.stoodSince === null) this.stoodSince = t; } else this.stoodSince = null;
        // the held-back log: right after a getter reading is the moment a write is least in the way
        if (series === 'polled' && this.log.safe && this.two.state() !== 'run') this.log.safe(t);
    }

    /* ---------- is the speed fresh; the data rate ---------- */

    /** ms since the last sample of a speed series ('speedN' | 'speedP'), Infinity if there never was one. */
    _age(key, now) { const m = this.meters[key]; return m && m.lastT !== null ? now - m.lastT : Infinity; }

    /** Has the getter delivered lately: a read kept within 1 s, or within 2.5 of the longest poll period in force lately. */
    polledFresh(now) { return this._age('speedP', now) <= Math.max(FRESH_MS, 2.5 * this.win.ms); }

    /** Is the car's speed arriving: a getter read kept lately, or a notification within the last second. */
    speedFresh(now) { return this.polledFresh(now) || this._age('speedN', now) <= FRESH_MS; }

    /** A read of the speed getter was answered, but too slowly to be used (car.js): this car has a getter that answers. */
    slowRead() { this.getterAnswers = true; }

    /**
     * Nothing arrives, and the timer is armed all the same: on the last value the car notified (the polled engine
     * is disarmed once the getter stops delivering). True where that is how this car works as far as the app can
     * tell: its notifier has been heard while the speed changed, or its getter has never answered. See the top.
     */
    armedQuiet(now) {
        if (this.demoOn || this.speedFresh(now) || this.two.state() !== 'ready') return false;
        const n = this.meters.speedN;
        return (!!n && n.spoke()) || !this.getterAnswers;
    }

    /** Samples a second of one speed series over the last 2 s (what arrived: from the spacing of those samples), or null with fewer than two. */
    rateOf(key, now) {
        const a = this.recent[key].filter((t) => now - t <= RATE_MS);
        return a.length >= 2 && a[a.length - 1] > a[0] ? (a.length - 1) * 1000 / (a[a.length - 1] - a[0]) : null;
    }

    accel(t, ms2, notified) {
        if (!isNum(t) || !isNum(ms2)) return;
        this.seen('accel', t);
        if (notified) this.fallback.notified();
        this.slope.accel(t, ms2);
        this.est.accel(t, ms2);
        this.live.accel = ms2; this.live.accelT = t;
    }

    /** raw4: rawWheels() of a wheel event. */
    wheels(t, raw4) {
        this.seen('wheels', t);
        this.factors.wheels(t, raw4);
        this.spin.wheels(t, this.factors.kmh(raw4));
    }

    nmea(t, text) { this.seen('nmea', t); return this.gps.nmea(t, text); }
    position(t, lat, lon, src) { this.gps.position(t, lat, lon, src); }
    heightCan(t, m) { this.gps.heightCan(t, m); }

    /* ---------- the clock tick ---------- */

    usingDemo(now) {
        const m = this.settings.get('demo');
        return m === 'on' || (m === 'auto' && !this.carSeen && now - this.startT > DEMO_AUTO_MS);
    }

    /** The engines the screen shows: the demo's, or the car's. */
    active() { return this.demoOn ? this.demoTwo : this.two; }

    /** Every 50 ms. env: { hidden: the app's screen is not showing, signalsPage: the Signals page is }. */
    tick(now, env) {
        this.env = env || {};
        // the app itself held up (its own tick came late): every sample handled after that was stamped late
        if (this.lastTick !== null && this.launched && now - this.lastTick >= TICK_LATE_MS && now - this.lastTick > this.stallMs) this.stallMs = now - this.lastTick;
        this.lastTick = now;
        const demo = this.usingDemo(now);
        if (demo !== this.demoOn) {
            // the demo and the car never share a run: both start clean
            this.demoOn = demo;
            this.two.reset(); this.demoTwo.reset();
            this._forgetLaunch();
            this.shown = null; this.newBest = {};
            this.log.info(demo ? 'demo data on: runs are not saved' : 'the car\'s speed: runs are timed and saved');
        }
        if (demo) {
            this.demoSpeed = this.demo.speed(now);
            this.demoTwo.polled(now, this.demoSpeed);
            this.demoTwo.idle(now);
        } else {
            this.two.idle(now);
            // the longest poll period in force over the last few seconds (a getter read every 2 s is not "stopped" after 1 s)
            const per = this.speedPeriod();
            if (per >= this.win.ms || now - this.win.t > 2.5 * this.win.ms) this.win = { ms: per, t: now };
            if (!this.speedFresh(now)) {
                // nothing arrives: a run being timed ends with what it has
                if (this.two.state() === 'run' && Math.min(this._age('speedN', now), this._age('speedP', now)) > SILENT_MS) this.two.silent();
            }
            // a getter that has stopped answering leaves no engine armed on the standstill it last reported
            if (!this.polledFresh(now) && this.two.engines.polled.state !== 'run' && this.two.engines.polled.last) this.two.engines.polled.disarm();
        }
        // the log is held back while it could spoil a time (heldlog.js)
        if (this.log.set) { const st = this.demoOn ? 'wait' : this.two.state(); this.log.set(st === 'run' ? 'run' : st === 'ready' ? 'armed' : 'write'); }
        const ch = this.changing.now(now);
        Object.keys(this.meters).forEach((k) => this.meters[k].tick(now, ch));
        // a launch that came to nothing (a creep, a start the series missed): its records are forgotten
        if (this.launched && this.two.state() !== 'run') this._forgetLaunch();
        // GPS height through a run, for the height change at each line
        if (this.launched) {
            const h = this.gps.height(now), l = this.heights[this.heights.length - 1];
            if (h && (!l || l.m !== h.m || l.src !== h.src || now - l.t >= 1000) && this.heights.length < HEIGHT_KEEP) this.heights.push({ t: now, m: h.m, src: h.src });
        }
        if (now - this.lastSlow >= SLOW_MS) { this.lastSlow = now; this._slow(now); }
    }

    _forgetLaunch() { this.launched = false; this.launch = null; this.heights = []; this.spinLive = null; this.stallMs = 0; this.spin.clear(); this.est.clear(); }

    _slow(now) {
        Object.keys(this.meters).forEach((k) => {
            const r = this.meters[k].report();
            if (r) this.log.info('rate ' + k + ': ' + (isNum(r.rate) ? r.rate.toFixed(1) + ' a second while the speed changes, median ' + Math.round(r.median) + ' ms, longest ' + Math.round(r.longest) + ' ms' : 'no two samples in one stretch of changing speed') + ' (' + r.n + ' samples in all)');
        });
        // (a calibration alone: never while armed or timing; a factor that only drifted, every 5 minutes at most)
        if (this.two.state() === 'wait' && ((this.calDirty && now - this.lastCalSave >= CAL_SAVE_MS) || (this.calDrift && now - this.lastCalSave >= CAL_AGAIN_MS))) this._saveCal(now);
        // (no getter reading for a while: the held-back log is written here instead)
        if (this.log.safe && this._age('speedP', now) > 1500) this.log.safe(now);
    }

    _saveCal(now) {
        this.store.data.gps = this.gps.export(this.wall());
        this.store.data.wheels = this.factors.export();
        const r = this.gps.result();
        this.calSaved = r ? { method: r.method, factor: r.factor } : null;
        this.calDirty = false; this.calDrift = false; this.lastCalSave = now;
        this.store.save();
    }

    /* ---------- how often the getters are read ---------- */

    _standingMs(now) {
        if (this.stoodSince !== null) return now - this.stoodSince;
        return this.live.speed === null ? now - this.startT : 0;        // (no speed from the car at all counts as standing)
    }

    /** ms between reads of the speed getter right now. */
    speedPeriod() {
        const now = this.now(), st = this.two.state();
        return pollPeriod({
            speed: this.live.speed, armed: st === 'ready', running: st === 'run', signalsPage: !!this.env.signalsPage,
            hidden: !!this.env.hidden, standingMs: this._standingMs(now),
        });
    }

    /** ms between reads of the acceleration getter right now; 0: it is notified, do not read it. */
    accelPeriod() {
        const now = this.now();
        return this.fallback.period(now, this.changing.now(now), !!this.env.hidden && this.two.state() !== 'run' && this._standingMs(now) >= PARKED_AFTER_MS);
    }

    /* ---------- speed scale ---------- */

    scaleNow() { return scaleFor(this.settings.get('scale'), this.settings.get('scaleManual'), this.gps.result()); }

    _factorText(r) {
        return 'x' + r.factor.toFixed(4) + ' from ' + (r.method === 'rmc' ? 'GPS speed, ' + r.count + ' ratios' : 'position legs, ' + r.count + ' legs') + (r.saved ? ' (saved)' : '');
    }

    _gpsResult(r) {
        // into the saved file: at once if the file has no factor by this method, else only once it has moved by 0.1 %
        const sv = this.calSaved;
        if (!sv || sv.method !== r.method) this.calDirty = true; else if (Math.abs(r.factor - sv.factor) >= FACTOR_SAVE) this.calDrift = true;
        if (this.factorLogged !== null && this.factorLogged.method === r.method && Math.abs(r.factor - this.factorLogged.factor) < FACTOR_LOG) return;
        this.factorLogged = { method: r.method, factor: r.factor };
        this.log.info('speed scale learned: ' + this._factorText(r) + (this.settings.get('scale') === 'gps' ? '' : ' (not used: the Speed scale setting is "' + this.settings.get('scale') + '")'));
    }

    _wheelLearned(w, f, n) {
        this.calDirty = true;
        this.log.info('wheel factor ' + w.toUpperCase() + ' learned: ' + f.toPrecision(5) + ' km/h per count (' + n + ' steady moments)');
    }

    /* ---------- a run ---------- */

    /** An engine started timing. The first one of a run takes the records that are only there now. */
    _onLaunch(series, t0) {
        if (this.launched) return;
        const now = this.now(), s = this.two.engines[series].summary();
        this.launched = true; this.stallMs = 0;
        this.shown = null; this.newBest = {};
        this.spin.launch(t0); this.est.launch(t0, LAUNCH_KMH);
        const h = this.gps.height(now);
        this.launch = { t0, series, slope: this.slope.before(t0, s && isNum(s.stoodSince) ? s.stoodSince : null), height: h };
        this.heights = h ? [{ t: now, m: h.m, src: h.src }] : [];
    }

    /** The height reading in force at time t (same source as at the launch), or null. */
    _heightAt(t, src) {
        let best = null;
        for (const h of this.heights) if (h.src === src && h.t <= t + 500 && t - h.t <= HEIGHT_AGE_MS) best = h;
        return best;
    }

    _heightRecord(s) {
        const h0 = this.launch && this.launch.height;
        if (!h0) return null;
        // (only the changes are kept: the height above sea level stays in memory)
        const ref = STARTS[s.start].dist === 'roll' ? s.tRoll : s.t0, out = { src: h0.src, splits: {} };
        if (!isNum(ref)) return null;
        DISTANCES.forEach((d) => {
            const r = s.results[d.key];
            if (!r) return;
            const ch = heightChange(h0, this._heightAt(ref + r.s * 1000, h0.src), d.m);
            if (ch) out.splits[d.key] = { m: round(ch.m, 1), pct: round(ch.pct, 2) };
        });
        return Object.keys(out.splits).length ? out : null;
    }

    /** A run is over (feed.js): log both engines, and make the record of the one chosen. */
    _onRun(run, demo) {
        const log = this.log, s = run.summary;
        const stall = this.stallMs, dis = run.disagree || [];
        if (!demo) {
            ['notified', 'polled'].forEach((k) => { if (run.both[k]) log.info('run, ' + describeRun(run.both[k])); });
            log.info('run taken from ' + (run.chosen ? 'the ' + run.chosen + ' series' : 'neither series') + ': ' + run.why);
            if (dis.length) log.info('run: THE TWO SERIES DO NOT AGREE on ' + dis.map((d) => d.key + ' (' + d.a.toFixed(3) + ' against ' + d.b.toFixed(3) + ' s)').join(', ') + ': the +- is widened to the difference');
            if (stall) log.info('run: the app was held up for ' + Math.round(stall) + ' ms during the run (its 50 ms tick came that late)');
        }
        const L = this.launch || {};
        const spin = demo ? null : this.spin.result(s && s.series) || this.est.result();
        const height = demo || !s ? null : this._heightRecord(s);
        this._forgetLaunch();
        if (!s || !Object.keys(s.results).length) {
            if (!demo) log.info('run: no split reached, nothing to show or save');
            return;
        }
        const results = {};
        Object.keys(s.results).forEach((k) => {
            const r = s.results[k];
            results[k] = { s: round(r.s, 3), pm: r.pm };
            if (isNum(r.trap)) results[k].trap = round(r.trap, 1);
            if (isNum(r.at)) results[k].at = round(r.at, 1);
        });
        const slope = demo || !L.slope ? null : { pct: round(L.slope.pct, 2), ms: L.slope.ms, n: L.slope.n };
        const flags = [];
        if (slope && downhill(slope.pct, this.settings.get('slopeLimit'))) flags.push('DOWNHILL START');
        if (spin && spin.readHigh) flags.push('SPEED READ HIGH AT LAUNCH');
        if (!demo) {
            const frozen = isNum(s.frozenMs) && s.frozenMs >= FROZEN_FLAG_MS;
            if (s.holeMs >= GAP_FLAG_MS || frozen || s.ended === 'silent' || stall >= GAP_FLAG_MS) flags.push('DATA GAP');
            if (s.ended === 'jump' || s.jumps > 0) flags.push('SPEED JUMP');
            if (dis.length) flags.push('SERIES DISAGREE');
        }
        const sc = this.runScale || { label: 'UNCALIBRATED' };
        const o = run.both[run.chosen === 'notified' ? 'polled' : 'notified'];
        const times = (x) => { const out = {}; Object.keys(x.results).forEach((k) => { out[k] = round(x.results[k].s, 3); }); return out; };
        const rec = {
            date: this.wall(), demo: !!demo, start: s.start, unit: s.unit, series: s.series, why: run.why, results, flags,
            scale: round(s.scale, 5), scaleSource: s.scaleSource, scaleLabel: sc.label || 'UNCALIBRATED',
            spin, slope, height,
            sum: {
                vmax: round(s.vmax, 1), peakG: s.peakG, samples: s.samples, medianGap: round(s.medianGap, 1), longestGap: round(s.longestGap, 1),
                launchGap: round(s.launchGap, 1), firstKmh: round(s.firstKmh, 2), launch: s.launch, dropped: s.dropped,
                ended: s.ended, length: round(s.length, 2), dist: round(s.dist, 1), lastSplit: s.lastSplit || null,
                holeMs: s.holeMs || 0, frozenMs: s.frozenMs || 0, merged: s.merged || 0, stallMs: Math.round(stall),
                lowSeen: s.launch && isNum(s.launch.lowSeen) ? round(s.launch.lowSeen, 3) : null, afterCreep: isNum(s.afterCreep) ? s.afterCreep : null,
                roundTrip: isNum(s.roundTrip) ? round(s.roundTrip, 1) : null, renderer: typeof this.env.renderer === 'string' ? this.env.renderer : null,
            },
            other: o ? { series: o.series, ended: o.ended, times: times(o), medianGap: round(o.medianGap, 1), launchGap: round(o.launchGap, 1) } : null,
        };
        const store = demo ? this.demoStore : this.store;
        this.newBest = store.addRun(rec);
        this.shown = store.data.runs[0] || null;
        if (demo) return;
        log.info('run extras: wheelspin ' + (spin ? (spin.method === 'estimate' ? 'about ' : '') + spin.peak + ' % peak, ' + spin.secs + ' s above 10 %' + (spin.axle ? ', ' + spin.axle + ' wheels led' : '') +
            ' (' + spin.method + (isNum(spin.highSecs) ? ', speed above the slowest wheel for ' + spin.highSecs + ' s' : '') + ')' : 'not known') +
            ' | start slope ' + (slope ? (slope.pct >= 0 ? '+' : '') + slope.pct.toFixed(2) + ' % over ' + slope.ms + ' ms' : 'not known') +
            ' | height ' + (height ? Object.keys(height.splits).map((k) => k + ' ' + (height.splits[k].m >= 0 ? '+' : '') + height.splits[k].m + ' m').join(', ') + ' (' + height.src + ')' : 'not known') +
            ' | scale ' + rec.scaleLabel + ' | flags: ' + (flags.join(', ') || 'none') +
            ' | new best: ' + (Object.keys(this.newBest).join(', ') || (flags.length ? 'none (a flagged run sets no best)' : 'none')) +
            ' | screen drawn by: ' + (rec.sum.renderer || 'not known'));
        // (the calibration as it stands goes into the same write)
        this._saveCal(this.now());
    }

    /* ---------- buttons, settings ---------- */

    /** "Reset run": the run on screen goes, the timer waits for the next standstill. */
    resetRun() {
        this.active().reset();
        this._forgetLaunch();
        this.shown = null; this.newBest = {};
    }

    resetBest() {
        const store = this.demoOn ? this.demoStore : this.store;
        store.resetBest();
        store.save();
        this.shown = null; this.newBest = {};
        this.log.info(this.demoOn ? 'demo best times cleared' : 'best times and saved runs cleared');
    }

    resetCalibration() {
        this.gps.reset();
        this.factors.reset();
        this.store.resetCalibration();
        this.store.save();
        this.calDirty = false; this.factorLogged = null;
        this.log.info('calibration reset: GPS speed scale and wheel factors cleared');
    }

    /** The start convention or the unit changed: the run in hand is thrown away (run.js). */
    configure() {
        const c = { start: this.settings.get('start'), unit: this.settings.get('speedUnit') };
        this.two.configure(c); this.demoTwo.configure(c);
        this._forgetLaunch();
        this.shown = null; this.newBest = {};
    }

    /* ---------- for the screens ---------- */

    view(now) {
        const two = this.active(), eng = two.live(), state = two.state(), store = this.demoOn ? this.demoStore : this.store;
        const start = STARTS[this.settings.get('start')] ? this.settings.get('start') : 'slip', unit = this.settings.get('speedUnit') === 'mph' ? 'mph' : 'kmh';
        const sc = this.demoOn ? { factor: 1, source: 'demo', label: 'DEMO' } : this.scaleNow();
        const rec = state === 'run' ? null : this.shown;
        // The data rate of the series the screen follows: what arrived. Of a finished run: from the middle spacing
        // of its own samples (rateRun: the screen labels it as the run's). Else: its samples over the last 2 s. A
        // notifier that is silent right now (a steady car notifies nothing): the rate it was measured at while the
        // speed last changed. While no speed is arriving at all: none, whatever is on the screen.
        const fresh = this.demoOn || this.speedFresh(now);
        let rate = null, rateRun = false;
        const gap = rec ? rec.sum.medianGap : null;
        if (!fresh) rate = null;
        else if (isNum(gap) && gap > 0) { rate = 1000 / gap; rateRun = true; } else if (this.demoOn) rate = 20;
        else if (eng.series === 'polled') rate = this.rateOf('speedP', now);
        else { rate = this.rateOf('speedN', now); if (rate === null) rate = this.meter('speedN').stats(now).rate; }
        // (a speed that has stopped arriving is not shown: it says nothing about now)
        const kmh = this.demoOn ? this.demoSpeed : this.live.speed === null || !fresh ? null : this.live.speed * sc.factor;
        const standing = this.demoOn || this.stoodSince === null ? null : this.slope.standing(now, this.stoodSince);
        // (the wheelspin of a run under way is worked out four times a second, not for every frame)
        if (state === 'run' && !this.demoOn && (!this.spinLive || now - this.spinLive.t >= 250 || now < this.spinLive.t)) this.spinLive = { t: now, v: this.spin.result(eng.series) || this.est.result() };
        const spin = rec ? rec.spin : state === 'run' && !this.demoOn && this.spinLive ? this.spinLive.v : null;
        const slope = rec ? rec.slope : state === 'run' && this.launch ? this.launch.slope : standing;
        return {
            // the clock: running while a run is timed; after it, the time of the split reached last (a figure that is among the results)
            now, demo: this.demoOn, state, hasSpeed: this.demoOn || (this.live.speed !== null && fresh), kmh,
            // armed: nothing arrives, and the timer is armed on the last value the car notified (armedQuiet)
            armed: this.armedQuiet(now), rateRun,
            clock: rec ? (rec.results[rec.sum.lastSplit] ? rec.results[rec.sum.lastSplit].s : isNum(rec.sum.length) ? rec.sum.length : 0) : eng.elapsed(now),
            // lost: a speed did arrive once and has stopped (ms since the last sample of either series)
            lost: !this.demoOn && this.live.speed !== null && !fresh ? Math.min(this._age('speedN', now), this._age('speedP', now)) : null,
            notSaved: this.demoOn ? null : this.store.failed,
            results: rec ? rec.results : state === 'run' ? eng.results() : {}, rec, newBest: this.newBest,
            start, unit, splits: splitsFor(unit, start), best: store.data.best[start] || {}, allBest: store.data.best, runs: store.data.runs,
            scale: rec ? { label: rec.scaleLabel } : sc, rate, series: this.demoOn ? 'demo' : rec ? rec.series : eng.series,
            spin, slope, slopeLive: !rec && state !== 'run', slopeLimit: this.settings.get('slopeLimit'),
            downhill: !!slope && downhill(slope.pct, this.settings.get('slopeLimit')),
            flags: rec ? rec.flags : [], last: rec || store.data.runs[0] || null,
        };
    }

    signalsView(now) {
        const meters = {};
        Object.keys(this.meters).forEach((k) => { meters[k] = this.meters[k].stats(now); });
        return {
            meters, wheels: this.factors.status(), gps: this.gps.status(now), scale: this.scaleNow(), setting: this.settings.get('scale'),
            // since when a speed series has stopped (ms; null: it is arriving, or it never did, or it is the notifier of a car whose getter answers)
            stopped: {
                speedP: isFinite(this._age('speedP', now)) && !this.polledFresh(now) ? this._age('speedP', now) : null,
                speedN: isFinite(this._age('speedN', now)) && !this.speedFresh(now) ? this._age('speedN', now) : null,
            },
            notSaved: this.store.failed,
            // (the notifier's silence is no fault while the timer is armed on it: the Signals page says "silent", not "stopped")
            armed: this.armedQuiet(now),
            standing: this.stoodSince === null ? null : this.slope.standing(now, this.stoodSince),
        };
    }
}

module.exports = { Session };
