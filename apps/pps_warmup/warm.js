'use strict';
/**
 * warm.js - the warm-up decision: are engine oil, gearbox oil and coolant in their safe range?
 *
 * No drawing, no car access: it is fed temperatures and answers with states, so it can be tested on a PC
 * (tools/test_warmup.js).
 *
 *   const warm = new WarmUp(() => limits);            // limits: see limitsFrom()
 *   warm.feed({ rpm, speed, oil, gearbox, coolant, gearboxAbsent }, nowMs)    // about once a second, on a steady clock
 *                 gearboxAbsent: true = the gearbox reader has evidence that this car gives no gearbox reading
 *   warm.rev(rpm, nowMs)                              // every engine speed as it arrives, between two feeds
 *   warm.endRun()                                     // the head unit slept: as an engine stop of RUN_END_MS
 *   warm.status(nowMs) -> {
 *     overall     'nodata' | 'off' | 'warming' | 'ready' | 'hot'
 *     fluids      { oil, gearbox, coolant }: { state, temp, ready, hot, min, capped, est, progress, counted, last }
 *                 state: 'ready' | 'warming' | 'stalled' | 'off' (engine not running) | 'hot'
 *                        | 'dip' (a little under "safe from" on a car that earned "ready" on this engine run)
 *                        | 'none' (no reading) | 'unused' (switched off for this car)
 *                 min: minutes until it is ready, at most MAX_MIN (capped: it is more), null until MEASURE_MS
 *                 of warming has been measured
 *                 temp null with state 'ready': the gearbox, counted on its last reading (last)
 *     waiting     the fluids not ready yet: below their safe temperature, or with no reading, e.g. ['oil', 'gearbox']
 *     cold        those of them that are read below their "safe from" (not the ones that merely have no reading)
 *     min         minutes until all are ready (the slowest one), or null; capped as for a fluid
 *     over        the engine was revved past the cold limit in the last OVER_HOLD_MS
 *     overRpm     the highest engine speed of that burst, else null
 *     limit       the rev limit until warm (0 = none)
 *     readyAt     when everything first came into range on this warm-up (ms), else null
 *     unwatched   the gearbox, when it counts for nothing because the car gives no reading for it
 *     held        the gearbox, when it has no reading now and counts on its last one
 *   }
 *   warm.announce() -> true once, when everything has just come into range after a warm-up that was watched
 *
 * Rules
 *   - A fluid is READY from its "safe from" temperature and stays ready until it falls HYST below it
 *     (no flicker at the threshold). From its "too hot above" temperature it is HOT, and stays hot until
 *     it falls HYST below that, for the same reason.
 *   - Engine oil and coolant must each have a reading and be ready before the car is called ready: without
 *     one of them the car is never called ready.
 *   - An engine run lasts until the engine has been off for RUN_END_MS: a stop at the lights, auto start-stop
 *     or a stall is the same run. It also ends when nothing was fed for RUN_END_MS (the app did not run, so
 *     nobody watched the car) and with endRun().
 *   - Once this app has seen the car ready with its engine running, at the end of a warm-up it watched (a
 *     fluid it read below its "safe from" came into range while the engine ran) or else for ARM_MS of running,
 *     the car stays ready for the rest of that engine run while every fluid that has a reading is no more than
 *     SAG below its "safe from": a fluid that sags under load is shown on its own row ('dip'), and "Warming
 *     up", the rev advice and the over-rev warning do not come back for it.
 *     A car that is merely found in range has not earned that: with the engine off, or in the first ARM_MS after
 *     a start this app did not see the warm-up of (the app started on a warm car, a restart after a long stop),
 *     its sensors may be heat-soaked, and a fluid that settles under its "safe from" is warming up, not dipped.
 *     A fluid more than SAG under is cold and ends that at once, as do the end of the engine run and a limit
 *     changed in Workshop settings; a fluid that is too hot or has no reading is never covered by it.
 *   - The gearbox with no reading now, whose last reading was in range (ready and not too hot), counts on
 *     that reading for the rest of the engine run and is named ("on its last reading"): its reading ages
 *     out whenever the gearbox unit is not being asked. Last read below its "safe from", or too hot, it is
 *     waited for until a reading returns.
 *   - Only a gearbox that never gave a reading may be left out: once the engine has run for NO_DATA_MS on this
 *     engine run (a stop at the lights does not start that again), while it runs, and only when the gearbox
 *     reader has evidence that this car gives none (gearboxAbsent: see absent() in gearbox.js). It is then named
 *     ("not monitored") and stays left out, also across engine stops, until a gearbox reading arrives or
 *     reset(). While the reader could not ask at all, it is waited for.
 *   - Revving past the limit is flagged only while the car is warming up and a counted fluid is read below
 *     its "safe from": a fluid that merely has no reading does not make the engine cold.
 *   - The announcement is made once per warm-up, and only when this app read a fluid below its "safe from"
 *     first: a hot restart shows READY straight away without it. It is withdrawn if the car stops being
 *     ready before it has been shown.
 *   - "ready in" comes from the measured warming rate, blended with a typical rate until two minutes
 *     have been measured (as the idrive7-apps kit's Warm-Up app does it). The rate is measured on a running
 *     engine only: nothing is sampled while the engine is off, and what was measured is dropped once it has
 *     been off for MEASURE_OFF_MS. No figure is given before MEASURE_MS has been measured, and none above
 *     MAX_MIN.
 *   - The widget's progress is measured from the lowest temperature of this engine run (at least 20 deg C
 *     under "safe from"), so it does not run backwards while a temperature stands still.
 */
const FLUIDS = ['oil', 'gearbox', 'coolant'];
const HYST = 3;                    // deg C under the threshold before "ready" is taken back
const SAG = 15;                    // deg C under "safe from" a fluid may dip on a car already called ready
const ARM_MS = 120000;             // found in range, no warm-up watched: the engine running in range this long before a dip is covered
const NO_DATA_MS = 90000;          // the engine has run this long (on this engine run) before a gearbox that gives no reading is left out
const RUN_END_MS = 300000;         // the engine off this long: that engine run is over
const RUNNING_RPM = 400;
const OVER_HOLD_MS = 2500;         // an over-rev stays shown this long
const HIST_MS = 2000, HIST_KEEP = 120;     // a sample every 2 s, 4 minutes
const MEASURE_MS = 60000;          // "ready in" is given once this much warming has been measured
const MEASURE_OFF_MS = 30000;      // the engine off this long: what was measured before no longer counts
const FEED_MAX_MS = 2000;          // feeds come once a second: of a longer gap, this much counts as engine running time
const MAX_MIN = 60;                // and never as more than this many minutes
// typical warming rates (deg C / min) until enough has been measured
const TYPICAL = { oil: { drive: 4, idle: 1.5 }, coolant: { drive: 7, idle: 3 }, gearbox: { drive: 3, idle: 0.8 } };

const isNum = (x) => typeof x === 'number' && isFinite(x);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/**
 * The workshop's numbers from the app's settings: { oil: { ready, hot, use }, gearbox, coolant, revLimit }.
 * A "too hot" at or under "safe from" (a slip while programming) is moved to 10 deg C above it.
 */
function limitsFrom(get) {
    const one = (ready, hot, use) => ({ ready, hot: hot > ready ? hot : ready + 10, use: use !== false });
    return {
        oil: one(get('readyOil'), get('hotOil')),
        gearbox: one(get('readyGearbox'), get('hotGearbox'), get('gearboxSource') !== 'none'),
        coolant: one(get('readyCoolant'), get('hotCoolant')),
        revLimit: get('coldLimit') || 0,
    };
}

class WarmUp {
    constructor(limits) {
        this.limits = limits;
        this.latched = {};             // fluid -> ready (with hysteresis)
        this.hotLatched = {};          // fluid -> too hot (with hysteresis)
        this.last = {};                // the latest feed
        this.hist = [];                // [t, oil, gearbox, coolant]
        this.histT = null;
        this.fedAt = null;             // the last feed (ms)
        this.runSince = null;          // the engine has been running since (ms), null = not running
        this.ran = 0;                  // how long the engine has run on this engine run (ms)
        this.offSince = null;          // the engine has not been running since (ms), null = running
        this.runOver = false;          // the engine has been off for RUN_END_MS: the engine run is over
        this.ended = false;            // endRun() was called: the next feed ends the engine run
        this.seenAt = {};              // fluid -> last time it had a reading
        this.lastTemp = {};            // fluid -> its last reading
        this.from = {};                // fluid -> its lowest reading of this engine run (the widget's progress)
        this.wasReady = false;         // "ready through a small dip" holds: earned on this engine run (see Rules)
        this.watched = false;          // this app saw the car come into range with the engine running, on this engine run
        this.readyRan = 0;             // how long the engine has run with the car in range, without a break in "ready" (ms)
        this.leftOut = false;          // the gearbox is left out: this car gives no reading for it
        this.limitsWere = null;        // the limits at the last feed (a change is noticed)
        this.sawCold = false;          // this warm-up was watched from below temperature
        this.readyAt = null;           // when everything first came into range on this warm-up
        this.toAnnounce = false;
        this.overAt = null;            // the last moment the engine was over the cold rev limit
        this.overRpm = null;           // the highest engine speed of that burst
        this.revWatch = false;         // revs are checked: warming up, with a fluid read below its "safe from"
        this.revLimit = 0;
    }

    feed(d, now) {
        this.last = d = Object.assign({}, d);
        const lim = this.limits();
        const running = isNum(d.rpm) && d.rpm >= RUNNING_RPM;
        const gap = this.fedAt === null ? 0 : now - this.fedAt, dt = clamp(gap, 0, FEED_MAX_MS);
        this.fedAt = now;
        // the engine off for RUN_END_MS (also between two feeds), no feed at all for that long (the app did not run:
        // what the car did meanwhile is not known), or endRun(): that engine run is over. What only held for it goes:
        // "ready through a small dip" and what earned it, the engine's running time, a gearbox counted on its last
        // reading, the start of the widget's progress
        const over = this.ended || gap >= RUN_END_MS || (this.offSince !== null && now - this.offSince >= RUN_END_MS);
        this.ended = false;
        if (over) {
            this.wasReady = false; this.watched = false; this.readyRan = 0; this.ran = 0;
            if (!isNum(d.gearbox)) { this.latched.gearbox = false; delete this.lastTemp.gearbox; }
            if (!this.runOver) { this.runOver = true; this.from = {}; }
        }
        if (running) { if (this.runSince === null) this.runSince = now; else this.ran += dt; this.offSince = null; this.runOver = false; }
        else { this.runSince = null; if (this.offSince === null) this.offSince = now; }
        // a limit changed in Workshop settings: "ready" is decided afresh on the new numbers, and a gearbox that has no
        // reading now is judged on its last one against them
        const limitsNow = FLUIDS.map((k) => [lim[k].ready, lim[k].hot, lim[k].use]).join();
        if (this.limitsWere !== null && this.limitsWere !== limitsNow) {
            this.wasReady = false;
            if (!isNum(d.gearbox) && isNum(this.lastTemp.gearbox)) {
                this.latched.gearbox = this.lastTemp.gearbox >= lim.gearbox.ready;
                this.hotLatched.gearbox = this.lastTemp.gearbox >= lim.gearbox.hot;
            }
        }
        this.limitsWere = limitsNow;
        FLUIDS.forEach((k) => {
            const v = d[k], L = lim[k];
            if (!isNum(v)) return;
            this.seenAt[k] = now; this.lastTemp[k] = v;
            if (this.from[k] === undefined || v < this.from[k]) this.from[k] = v;
            if (v >= L.ready) this.latched[k] = true;
            else if (v < L.ready - HYST) this.latched[k] = false;
            if (v >= L.hot) this.hotLatched[k] = true;
            else if (v < L.hot - HYST) this.hotLatched[k] = false;
        });
        // a fluid more than SAG under its "safe from" is cold, not a dip: the car is no longer covered by having been ready
        if (this.wasReady && FLUIDS.some((k) => lim[k].use && isNum(d[k]) && d[k] < lim[k].ready - SAG)) this.wasReady = false;
        // the gearbox is left out once the engine has run NO_DATA_MS on this engine run (not in one piece: stop-and-go
        // traffic would never get there) and, while it runs, the reader has evidence that this car gives no reading for
        // it (a manual gearbox has no oil sensor), and only if it never gave one. It stays left out, also across engine
        // stops, until a reading arrives.
        if (isNum(d.gearbox) || !lim.gearbox.use) this.leftOut = false;
        else if (!this.leftOut && this.seenAt.gearbox === undefined && d.gearboxAbsent === true
            && running && this.ran > NO_DATA_MS) this.leftOut = true;
        // the warming rate is measured on a running engine only: an engine that is off warms nothing, and its standing
        // readings would read as "over 60 min" or "not warming" after the start. Nothing is sampled while it is off, and
        // once it has been off for MEASURE_OFF_MS the measuring starts afresh (a car that gives no engine speed: sampled
        // all the time)
        const stopped = isNum(d.rpm) && !running;
        if (stopped && this.hist.length && now - this.offSince >= MEASURE_OFF_MS) { this.hist = []; this.histT = null; }
        if (!stopped && (this.histT === null || now - this.histT >= HIST_MS) && FLUIDS.some((k) => isNum(d[k]))) {
            this.histT = now;
            this.hist.push([now, d.oil, d.gearbox, d.coolant]);
            while (this.hist.length > HIST_KEEP) this.hist.shift();
        }
        const st = this._status(now, lim);
        // over-rev on a cold engine: checked here and for every engine speed that arrives until the next feed (rev())
        this.revWatch = st.overall === 'warming' && st.cold.length > 0;
        this.revLimit = lim.revLimit;
        this.rev(d.rpm, now);
        // the announcement: armed by a watched warm-up, fired once when everything is in range.
        // Armed only by a fluid that was read below its "safe from": one that merely has no reading yet does not count
        // (a gearbox answer that arrives late on a hot restart, or drops out for a moment once warm).
        if (st.overall === 'warming' || st.overall === 'off') { if (st.cold.length) this.sawCold = true; this.readyAt = null; }
        // not shown yet and no longer true (too hot, cooled, a reading lost): withdrawn, never shown late
        if (st.overall !== 'ready') this.toAnnounce = false;
        if (st.overall === 'ready' && this.readyAt === null) {
            this.readyAt = now;
            // (watched: the engine was running when it came into range. With the engine off it is the sensors soaking)
            if (this.sawCold) { this.toAnnounce = true; if (running) this.watched = true; }
            this.sawCold = false;
        }
        // "ready through a small dip" is earned with the engine running: by a warm-up this app watched on this engine
        // run, or by ARM_MS of running in range. A car found in range with the engine off, or just after a start, has
        // to show it on its readings: heat-soaked sensors settle lower once the engine runs.
        if (st.overall !== 'ready') this.readyRan = 0;
        else if (running) {
            this.readyRan += dt;
            if (this.watched || this.readyRan >= ARM_MS) this.wasReady = true;
        }
        return st;
    }

    /**
     * An engine speed as the car sent it: past the limit while the last feed found the car warming up with a fluid
     * read below its "safe from", it is flagged (the car sends several a second, a feed comes once a second).
     */
    rev(rpm, now) {
        if (!this.revWatch || !(this.revLimit > 0) || !isNum(rpm) || rpm <= this.revLimit) return;
        const burst = this.overAt !== null && now - this.overAt < OVER_HOLD_MS;
        this.overRpm = burst && this.overRpm > rpm ? this.overRpm : rpm;
        this.overAt = now;
    }

    status(now) {
        const st = this._status(now, this.limits());
        // (the limit as it is now: one that was just changed or switched off in Workshop settings ends the warning)
        st.over = this.overAt !== null && now - this.overAt < OVER_HOLD_MS && st.overall === 'warming' && st.limit > 0 && this.overRpm > st.limit;
        st.overRpm = st.over ? this.overRpm : null;
        st.readyAt = this.readyAt;
        return st;
    }

    /**
     * The engine run is over, whatever the engine speed says (main.js: time passed that the steady clock did not
     * count, because the head unit slept): the next feed treats it as an engine stop of RUN_END_MS.
     */
    endRun() { this.ended = true; this.runOver = false; }

    /** true once, when the car has just come up to temperature. */
    announce() { const a = this.toAnnounce; this.toAnnounce = false; return a; }

    /** Forget the history (the data source switched between the car and the demo drive). */
    reset() {
        this.latched = {}; this.hotLatched = {}; this.hist = []; this.histT = null; this.runSince = null; this.seenAt = {};
        this.offSince = null; this.runOver = false; this.ended = false; this.lastTemp = {}; this.from = {}; this.wasReady = false; this.leftOut = false;
        this.fedAt = null; this.ran = 0; this.watched = false; this.readyRan = 0;
        this.sawCold = false; this.readyAt = null; this.toAnnounce = false; this.overAt = null; this.overRpm = null; this.last = {};
        this.revWatch = false;
    }

    /** deg C per minute over the last 3 minutes (least squares) and the time it covers. */
    _rate(idx) {
        const h = this.hist, last = h.length ? h[h.length - 1][0] : 0;
        const pts = h.filter((p) => isNum(p[idx]) && last - p[0] < 180000);
        if (pts.length < 4) return { rate: null, span: 0 };
        const n = pts.length, mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[idx], 0) / n;
        let num = 0, den = 0;
        pts.forEach((p) => { num += (p[0] - mx) * (p[idx] - my); den += (p[0] - mx) * (p[0] - mx); });
        return { rate: den ? num / den * 60000 : null, span: pts[n - 1][0] - pts[0][0] };
    }

    _status(now, lim) {
        const d = this.last, running = isNum(d.rpm) && d.rpm >= RUNNING_RPM, engineOff = isNum(d.rpm) && d.rpm < RUNNING_RPM;
        const fluids = {}, waiting = [], unwatched = [], held = [];
        let anyHot = false, slowest = null, capped = false;
        FLUIDS.forEach((k, i) => {
            const L = lim[k], v = d[k], f = fluids[k] = { temp: isNum(v) ? v : null, ready: L.ready, hot: L.hot, counted: false, min: null, capped: false, est: false, progress: 0, last: null };
            if (!L.use) { f.state = 'unused'; return; }
            if (!isNum(v)) {
                f.state = 'none';
                // the gearbox this car gives no reading for (feed() decides that, on the reader's evidence): left out and named
                if (k === 'gearbox' && this.leftOut) { unwatched.push(k); return; }
                f.counted = true;
                // the gearbox with no reading now, last read in range: it counts on that reading, and is named, until
                // the engine run is over (feed() then takes its "ready" back).
                // Not if it was last read below its "safe from" or too hot: then it is known not to be in range
                // and is waited for.
                // Engine oil and coolant are never left out or held: without a reading the car is not called ready.
                if (k === 'gearbox' && this.seenAt[k] !== undefined && this.latched[k] && !this.hotLatched[k]) {
                    f.state = 'ready'; f.progress = 1; f.last = this.lastTemp[k]; held.push(k);
                } else waiting.push(k);
                return;
            }
            f.counted = true;
            // from the lowest temperature of this engine run to "safe from"
            const from = Math.min(isNum(this.from[k]) ? this.from[k] : v, L.ready - 20);
            f.progress = clamp((v - from) / (L.ready - from), 0, 1);
            if (v >= L.hot || (this.hotLatched[k] && v >= L.hot - HYST)) { f.state = 'hot'; anyHot = true; return; }
            if (this.latched[k]) { f.state = 'ready'; f.progress = 1; return; }
            // a little under "safe from" on a car that earned "ready" on this engine run (feed()): a dip, not a cold fluid
            if (this.wasReady && v >= L.ready - SAG) { f.state = 'dip'; f.progress = 1; return; }
            waiting.push(k);
            if (engineOff) { f.state = 'off'; return; }
            const m = this._rate(i + 1), typ = TYPICAL[k][isNum(d.speed) && d.speed > 10 ? 'drive' : 'idle'];
            const w = clamp(m.span / 120000, 0, 1), rate = isNum(m.rate) ? w * m.rate + (1 - w) * typ : typ;
            if (w > 0.8 && rate < 0.15) { f.state = 'stalled'; return; }
            f.state = 'warming';
            // no figure before MEASURE_MS has been measured, and one cap for it (MAX_MIN)
            if (m.span < MEASURE_MS) return;
            const min = (L.ready - v) / Math.max(0.15, rate);
            f.capped = min > MAX_MIN; f.min = Math.min(min, MAX_MIN); f.est = w < 0.5;
            if (slowest === null || f.min > slowest) slowest = f.min;
            if (f.capped) capped = true;
        });
        const haveData = FLUIDS.some((k) => fluids[k].temp !== null);
        let overall;
        if (!haveData) overall = 'nodata';
        else if (anyHot) overall = 'hot';
        else if (!waiting.length) overall = 'ready';
        else if (engineOff) overall = 'off';
        else overall = 'warming';
        const allTimed = overall === 'warming' && waiting.every((k) => fluids[k].min !== null);
        return {
            overall, fluids, waiting, unwatched, held, cold: waiting.filter((k) => fluids[k].temp !== null),
            min: allTimed ? slowest : null, capped: allTimed && capped, limit: lim.revLimit, running, over: false, overRpm: null, readyAt: null,
        };
    }
}

module.exports = { WarmUp, limitsFrom, FLUIDS, HYST, SAG, ARM_MS, NO_DATA_MS, RUN_END_MS, MEASURE_MS, MAX_MIN };
