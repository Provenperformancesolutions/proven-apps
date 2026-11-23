'use strict';
/**
 * feed.js - Proven Drag: the bookkeeping around the speed feed. Pure logic: it never touches the car.
 * The app hands it what arrives, the clock, and a function that does one getter read.
 *
 *   TwoSeries      the notified samples and the polled samples, a timing engine (run.js) each, never mixed;
 *                  which engine the screen follows, and which one a finished run is taken from
 *   chooseSeries   that choice, as a function of the two run summaries
 *   PollScheduler  reads a getter on a period: one read at a time, timed against the clock it is given
 *   pollPeriod     how often the speed getter is read: 50 ms / 500 ms / 2 s
 *   AccelFallback  whether the acceleration getter has to be polled too
 *   Changing       is the car's speed changing right now
 *   RateMeter      per source: how often it sends while the speed is changing, median and longest spacing
 *   describeRun    one log line for a run summary
 *
 * WHAT IT ASSUMES ABOUT THE CAR (from public reports, none measured by Proven)
 *   - The speed is notified when it changes, at a rate that differs by car and firmware (every 100 ms on
 *     one car, almost never on others). So the getter is polled as well, and the two series are kept
 *     apart: each has its own delay, and a constant delay only cancels inside one series.
 *   - One getter read takes about 25 ms, and two reads of one field must never be in flight together.
 *     A polled sample is stamped at the middle of its round trip (the car read the value somewhere in
 *     between; if most of the round trip is on one side, all polled times shift by the same few ms).
 *   - The kit's signals.watch() does a getter read of its own whenever the car's service comes (back) up.
 *     That read is outside this scheduler: the app should start polling a moment after watch() returns.
 *
 * WHICH ENGINE A RUN IS TAKEN FROM (chooseSeries): the brief's rule is the shorter median spacing during
 *   the run, the notifier winning while it is within 20 %. Five rules come before it, each for a case
 *   where that rule alone would pick a wrong time: an engine without a result loses; an engine that saw the
 *   launch late loses (the getter is only read every 2 s on a car parked with the screen hidden, and every
 *   50 ms as soon as the run is on: short spacing, launch missed); an engine whose series went silent
 *   before the end of the run loses; an engine whose series made a step no car does loses; an engine whose
 *   series had a hole of 0.3 s or more, or repeated one value for a second or more, loses (the median
 *   spacing does not show a hole). Samples that arrive in lumps are merged by the engine before any of
 *   this (run.js), so a series delivered in lumps is measured by the spacing of its lumps. A sample that
 *   was stamped late is taken out by the engine too: it leaves a hole, and no step.
 *   WHEN THE TWO ENGINES DO NOT AGREE: if the run was chosen by the spacing rule (neither engine had lost
 *   for a reason above) and a split differs between them by more than their two +- together, the chosen
 *   result's +- is widened to that difference and the run is marked (disagree): the app flags it, and a
 *   flagged run sets no best.
 *
 * FIGURES THAT ARE GUESSES
 *   A read over 500 ms is thrown away, the 50 / 500 / 2000 ms periods and the 5 minutes (the brief's; the
 *   2 s of a car parked with the screen hidden come before "armed", or a parked car would be read 20 times
 *   a second for ever). A read still unanswered after 10 s is given up, so that one lost answer cannot stop
 *   the feed for good: this is the one case in which a read is started while an older one might still be
 *   on its way. A read that ran into its own time limit (the app asks the car to give up after 1 s) is not
 *   followed by the next one before 4 s after it began: the car may still answer it (the kit's own reads
 *   allow 3 s), and once it answers again it is back at its normal pace within those 4 s. After 10 failed reads in a row the getter is only
 *   tried every 2 s; a hole in a series counts from 0.3 s and a repeated value from 1 s (which engine a run
 *   is taken from, and the DATA GAP flag); "changing" = moved
 *   0.5 km/h within 1 s; the acceleration is polled every 100 ms after 2 s of changing speed without a
 *   notification, and from then until one arrives; a finished run waits up to 2 s for the other engine;
 *   "launch seen late" = launch gap (plus what the engine says the series was late by) over 150 ms and
 *   over 2.5 times the series' median spacing; "ended in silence" = no sample in the last second of the
 *   run; the screen changes over to the other engine during a run only when that one leads by 3 samples;
 *   a series is taken as not being sent once the other has seen the car move for 1 s while it said nothing.
 */
const { RunEngine, median, LAUNCH_KMH } = require('./run');
const { SpeedWindow } = require('./steady');

const FAST_MS = 50, SLOW_MS = 500, PARKED_MS = 2000;
const PARKED_AFTER_MS = 300000;    // standing this long with the screen hidden: the slowest polling
const NEAR_STOP_KMH = 5;
const SLOW_READ_MS = 500;          // a read that took longer is thrown away
const HUNG_READ_MS = 10000;        // a read not answered by then is given up
const TIMEOUT_WAIT_MS = 4000;      // after a read that ran into its time limit: no new read before this long after it began
const BACKOFF_AFTER = 10;          // failed reads in a row before the getter is only tried every PARKED_MS
const CHANGING_KMH = 0.5, CHANGING_MS = 1000;
const ACCEL_QUIET_MS = 2000, ACCEL_POLL_MS = 100;
const PAIR_MS = 2000;              // a finished run waits this long for the other engine's
const TIE = 1.2;                   // the notifier wins while its median spacing is within 20 % of the polled one
const LATE_MS = 150, LATE_SPACINGS = 2.5, QUIET_END_MS = 1000;
const HOLE_MS = 300, FROZEN_MS = 1000;   // a hole this long, or one value repeated this long: that engine loses, and the run is flagged
const STALE_MS = 1000;             // one series moving this long while the other still "stands" and says nothing: that one is not armed
const RING = 64;

const isNum = (x) => typeof x === 'number' && isFinite(x);

/* ---------- how often the speed getter is read ---------- */

/**
 * c: { speed km/h or null, armed, running (either engine), signalsPage (it is showing), hidden (the app's
 *      screen is not showing), standingMs (how long the car has stood) }  ->  ms between reads
 */
function pollPeriod(c) {
    if (c.hidden && !c.running && c.standingMs >= PARKED_AFTER_MS) return PARKED_MS;
    if (c.running || c.armed || c.signalsPage || !isNum(c.speed) || c.speed < NEAR_STOP_KMH) return FAST_MS;
    return SLOW_MS;
}

/**
 * Reads a getter again and again.
 *   o.read()      -> a promise of the value (one getter read)
 *   o.clock       { now() -> ms that only run forward, setTimeout(fn, ms) -> handle, clearTimeout(handle) }
 *   o.period()    -> ms wanted between reads right now (asked before every read)
 *   o.onSample(t, value, tookMs)   t = the middle of the round trip
 *   o.onMiss(why, tookMs)          'slow' (over 500 ms: thrown away) | 'failed' | 'hung'
 *   o.timeoutMs   the time limit read() itself asks of the car (a failed read that took 80 % of it ran into it)
 * Never two reads in flight. The next read is due one period after the last one was DUE, not after its
 * timer fired or its answer came, so a late timer does not slow the rate; slots that were missed altogether
 * are skipped, not made up for. start(), stop(), kick() (the period just got shorter: do not wait out the
 * old one). counts: { reads, kept, slow, failed, hung, timedOut }.
 */
class PollScheduler {
    constructor(o) {
        this.o = o;
        this.clock = o.clock;
        this.on = false; this.busy = false; this.timer = null; this.dog = null;
        this.due = null; this.started = null; this.token = 0; this.fails = 0;
        this.counts = { reads: 0, kept: 0, slow: 0, failed: 0, hung: 0, timedOut: 0 };
        this.lastTook = null;
    }

    _period() {
        const p = Number(this.o.period ? this.o.period() : FAST_MS);
        const ms = p > 0 ? p : FAST_MS;
        return this.fails >= BACKOFF_AFTER ? Math.max(ms, PARKED_MS) : ms;
    }

    start() {
        if (this.on) return;
        this.on = true;
        this.due = this.clock.now();
        this._arm();
    }

    stop() {
        this.on = false;
        this.token++;                       // an answer still under way is no longer wanted
        this.busy = false;
        if (this.timer !== null) { this.clock.clearTimeout(this.timer); this.timer = null; }
        if (this.dog !== null) { this.clock.clearTimeout(this.dog); this.dog = null; }
    }

    /** The period may have become shorter: bring the next read forward to where the new period puts it. */
    kick() {
        if (!this.on || this.busy || this.timer === null) return;
        if (this.fails > 0) return;                         // (a getter that is failing is not hurried)
        const now = this.clock.now(), want = Math.max(now, (this.started === null ? now : this.started) + this._period());
        if (want >= this.due) return;
        this.due = want;
        this.clock.clearTimeout(this.timer); this.timer = null;
        this._arm();
    }

    _arm() {
        if (!this.on || this.busy || this.timer !== null) return;
        this.timer = this.clock.setTimeout(() => { this.timer = null; this._read(); }, Math.max(0, this.due - this.clock.now()));
    }

    _read() {
        if (!this.on || this.busy) return;
        const t1 = this.clock.now(), token = ++this.token, period = this._period();
        // the next one: a period after this one was due; if that is already past, from now (no burst to catch up)
        this.due += period;
        if (this.due < t1) this.due = t1;
        this.busy = true; this.started = t1;
        this.counts.reads++;
        const done = (ok, value) => {
            if (token !== this.token) return;                   // given up meanwhile
            if (this.dog !== null) { this.clock.clearTimeout(this.dog); this.dog = null; }
            this.busy = false;
            const t2 = this.clock.now(), took = t2 - t1;
            this.lastTook = took;
            if (!ok) {
                this.counts.failed++; this.fails++;
                // it ran into its time limit: the car may still answer it, so the next read keeps well clear of it
                if (this.o.timeoutMs > 0 && took >= 0.8 * this.o.timeoutMs) { this.counts.timedOut++; this.due = Math.max(this.due, t1 + TIMEOUT_WAIT_MS); }
                if (this.o.onMiss) this.o.onMiss('failed', took);
            } else {
                // the getter answers (again): back to the normal rate at once, not after the slow period it was on
                const slowed = this.fails >= BACKOFF_AFTER;
                this.fails = 0;
                if (slowed) this.due = Math.min(this.due, t2 + this._period());
                if (took > SLOW_READ_MS) { this.counts.slow++; if (this.o.onMiss) this.o.onMiss('slow', took); } else {
                    this.counts.kept++;
                    try { this.o.onSample((t1 + t2) / 2, value, took); } catch (e) { if (this.o.onError) this.o.onError(e); }
                }
            }
            this._arm();
        };
        // an answer that never comes must not stop the feed for good: after HUNG_READ_MS that read is given up
        this.dog = this.clock.setTimeout(() => {
            this.dog = null;
            if (token !== this.token || !this.busy) return;
            this.token++; this.busy = false; this.counts.hung++; this.fails++;
            if (this.o.onMiss) this.o.onMiss('hung', this.clock.now() - t1);
            if (this.due < this.clock.now()) this.due = this.clock.now();
            this._arm();
        }, HUNG_READ_MS);
        let p;
        try { p = Promise.resolve(this.o.read()); } catch (e) { p = Promise.reject(e); }
        p.then((v) => done(true, v), () => done(false));
    }
}

/* ---------- is the speed changing; the acceleration fallback; per-source rates ---------- */

/** Is the car's speed changing: did it move by 0.5 km/h or more within the last second? */
class Changing {
    constructor() { this.w = new SpeedWindow(3000); }
    speed(t, kmh) { this.w.add(t, kmh); }
    now(now) {
        const r = this.w.range(now, CHANGING_MS);
        return !!r && r.max - r.min >= CHANGING_KMH;
    }
}

/**
 * The acceleration is notified by the car; its getter is polled (every 100 ms) only once nothing was
 * notified for 2 s while the speed was changing, and from then until a notification arrives.
 *   notified(t)                     a notification arrived
 *   period(now, changing, parked)   -> 0 (do not poll) | 100 | 2000 (parked with the screen hidden)
 */
class AccelFallback {
    constructor() { this.since = null; this.polling = false; }
    notified() { this.since = null; this.polling = false; }
    period(now, changing, parked) {
        if (!this.polling) {
            if (!changing) this.since = null;
            else if (this.since === null) this.since = now;
            else if (now - this.since >= ACCEL_QUIET_MS) this.polling = true;
        }
        return this.polling ? (parked ? PARKED_MS : ACCEL_POLL_MS) : 0;
    }
}

/**
 * How often one source sends while the car's speed is changing (a standing or steady car sends nothing,
 * so a rate over all time would say nothing).
 *   m.tick(now, changing)   often (every 50 ms), with whether the speed is changing
 *   m.sample(t)             a sample of this source arrived
 *   m.stats(now)            -> { n: all samples, changingMs, rate: per second while changing (null: no two
 *                               samples in one stretch of changing speed yet), median, longest (ms, of the
 *                               last 64 spacings while changing, and the open one), age: ms since the last }
 *   m.report()              -> the stats once, when 5 s of changing speed have been seen (for the log); else null
 *   m.spoke()               -> has it ever sent two samples in one stretch of changing speed
 */
class RateMeter {
    constructor(name) {
        this.name = name || '';
        this.n = 0; this.lastT = null;
        this.changing = false; this.tickT = null; this.changingMs = 0;
        this.prevT = null;                  // the last sample inside the current stretch of changing speed
        this.gaps = [];
        this.reported = false;
    }

    tick(now, changing) {
        if (changing && this.changing && this.tickT !== null) this.changingMs += Math.min(500, Math.max(0, now - this.tickT));
        if (!changing) this.prevT = null;
        this.changing = !!changing; this.tickT = now;
    }

    sample(t) {
        this.n++;
        this.lastT = t;
        if (!this.changing) return;
        if (this.prevT !== null && t > this.prevT) { this.gaps.push(t - this.prevT); if (this.gaps.length > RING) this.gaps.shift(); }
        this.prevT = t;
    }

    stats(now) {
        const g = this.gaps;
        let longest = g.length ? Math.max.apply(null, g) : null;
        if (this.changing && this.prevT !== null && isNum(now) && now - this.prevT > (longest || 0)) longest = now - this.prevT;
        const mean = g.length ? g.reduce((a, b) => a + b, 0) / g.length : null;
        return {
            name: this.name, n: this.n, changingMs: this.changingMs,
            rate: mean ? Math.round(10000 / mean) / 10 : null, median: g.length ? median(g) : null, longest,
            age: this.lastT === null || !isNum(now) ? null : now - this.lastT,
        };
    }

    /** Has this source been heard while the speed changed (two samples of it in one stretch of changing speed)? */
    spoke() { return this.gaps.length > 0; }

    report() {
        if (this.reported || this.changingMs < 5000) return null;
        this.reported = true;
        return this.stats(this.tickT);
    }
}

/* ---------- two series, two engines ---------- */

const hasResults = (s) => !!s && Object.keys(s.results).length > 0;
// (launch gap, plus what the engine's own witness says the series was late by: run.js, launch.early)
const lateBy = (s) => s.launchGap + (s.launch && isNum(s.launch.early) ? s.launch.early : 0);
const lateLaunch = (s) => lateBy(s) > LATE_MS && lateBy(s) > LATE_SPACINGS * (s.medianGap || 0);
const quietEnd = (s) => s.ended === 'silent' || (isNum(s.quietEnd) && s.quietEnd > QUIET_END_MS);
const jumped = (s) => s.ended === 'jump' || s.jumps > 0;
/** ms of the worst stretch a series said nothing true in: its longest hole, or the longest time it repeated one value. */
const gapOf = (s) => Math.max(isNum(s.holeMs) ? s.holeMs : 0, isNum(s.frozenMs) && s.frozenMs >= FROZEN_MS ? s.frozenMs : 0);
const holed = (s) => gapOf(s) >= HOLE_MS;
const ceil01 = (x) => Math.ceil(x * 100 - 1e-6) / 100;

/**
 * Which engine a finished run is taken from. n, p: the run summaries of the notified and the polled
 * engine (null: that engine timed no run). -> { chosen: 'notified' | 'polled' | null, why, bySpacing }
 * The brief's rule is the last one: the shorter median spacing during the run, the notifier winning while
 * it is within 20 % (bySpacing: the run was chosen by it, so neither engine had lost for another reason).
 * Before it: an engine without a result loses to one with; one that saw the launch late loses to one that
 * did not (a getter polled every 2 s on a parked car has a short median spacing later in the run and still
 * missed the start); one whose series went silent before the end loses to one that did not; one whose series
 * made a step no car does loses; one whose series had a hole, or repeated one value, loses.
 */
function chooseSeries(n, p) {
    if (!n && !p) return { chosen: null, why: 'no run' };
    if (!n || !p) return { chosen: n ? 'notified' : 'polled', why: 'the only series with a run' };
    if (hasResults(n) !== hasResults(p)) return { chosen: hasResults(n) ? 'notified' : 'polled', why: 'the only series with a result' };
    if (lateLaunch(n) !== lateLaunch(p)) return { chosen: lateLaunch(n) ? 'polled' : 'notified', why: 'the other series saw the launch late' };
    if (quietEnd(n) !== quietEnd(p)) return { chosen: quietEnd(n) ? 'polled' : 'notified', why: 'the other series went silent before the end' };
    if (jumped(n) !== jumped(p)) return { chosen: jumped(n) ? 'polled' : 'notified', why: 'the other series made a step no car does' };
    if (holed(n) !== holed(p)) return { chosen: holed(n) ? 'polled' : 'notified', why: 'the other series had a hole of ' + Math.round(gapOf(holed(n) ? n : p)) + ' ms' };
    const clean = !lateLaunch(n) && !quietEnd(n) && !jumped(n) && !holed(n);
    const mn = isNum(n.medianGap) ? n.medianGap : Infinity, mp = isNum(p.medianGap) ? p.medianGap : Infinity;
    if (mn <= mp * TIE) return { chosen: 'notified', why: mn <= mp ? 'shorter median spacing' : 'median spacing within 20 %: the notifier wins a tie', bySpacing: clean };
    return { chosen: 'polled', why: 'shorter median spacing', bySpacing: clean };
}

/**
 * The splits two engines timed of one run and do not agree on: [{ key, a, b, diff }] where the two times
 * differ by more than their two +- together (each +- says how far that time may be off; beyond both, one
 * of the two series is wrong and nothing says which).
 */
function disagreement(a, b) {
    const out = [];
    if (!a || !b) return out;
    Object.keys(a.results).forEach((k) => {
        const x = a.results[k], y = b.results[k];
        if (x && y && Math.abs(x.s - y.s) > x.pm + y.pm + 1e-9) out.push({ key: k, a: x.s, b: y.s, diff: Math.abs(x.s - y.s) });
    });
    return out;
}

/**
 * The two speed series and their engines.
 *   o: start, unit, fit (as RunEngine); scale: a number or a function -> number or { factor, source }, asked
 *        once per launch (both engines get the same answer);
 *      onLaunch(series, t0): an engine started timing (each engine says so for itself);
 *      onRun({ chosen, why, summary, both: { notified, polled }, disagree }): a run is over. summary = the
 *        chosen engine's. both: each engine's summary of this run, or null if it timed none. An engine that
 *        was still timing 2 s after the other had finished, with nothing arriving on its series, is stopped;
 *        its summary so far is in `both` with ended: null, and it is never the one chosen. disagree: the
 *        splits the two engines did not agree on (see the top; the chosen summary's +- is widened for them).
 *   notified(t, kmh), polled(t, kmh, tookMs): a sample of that series;  idle(now): every 50 ms
 *   silent(): both series have stopped (the app sees that): a run being timed ends with what it has
 *   live(): the engine the screen follows: during a run the one with more samples so far (it only changes
 *     hands when the other leads by 3), after a run the one it was taken from, else the one that heard from
 *     the car last
 *   state(): 'run' if either engine is timing, else 'ready' if either is armed, else 'wait'
 *   configure({ start, unit }), reset()
 */
class TwoSeries {
    constructor(o) {
        this.o = o || {};
        this.sc = null;
        const scale = (t) => {
            if (this.sc && Math.abs(t - this.sc.t) < 5000) return this.sc.v;
            this.sc = { t, v: typeof this.o.scale === 'function' ? this.o.scale() : this.o.scale };
            return this.sc.v;
        };
        const mk = (series, onChange) => new RunEngine({
            series, onChange, start: this.o.start, unit: this.o.unit, scale, fit: this.o.fit,
            onLaunch: (t0) => { if (this.o.onLaunch) this.o.onLaunch(series, t0); },
            onDone: (s) => { this._done(series, s); },
        });
        this.engines = { notified: mk('notified', true), polled: mk('polled', false) };
        this.pending = null;            // { series, summary, at }: one engine's finished run, waiting for the other's
        this.shown = null;              // the series the last run was taken from
        this.liveNow = null;
        this.lastRun = null;
    }

    notified(t, kmh) { this.engines.notified.feed(t, kmh); }
    polled(t, kmh, took) { this.engines.polled.feed(t, kmh, took); }
    silent() { this.engines.notified.silent(); this.engines.polled.silent(); }

    idle(now) {
        this._stale();
        this.engines.notified.idle(now);
        this.engines.polled.idle(now);
        const p = this.pending;
        if (!p) return;
        const other = this.engines[p.series === 'notified' ? 'polled' : 'notified'];
        // the other engine is still timing: wait for it while its series is alive, PAIR_MS at most without a sample
        if (other.state === 'run' && now - Math.max(p.at, other.last ? other.last.t : -Infinity) < PAIR_MS) return;
        let part = null;
        if (other.state === 'run') { part = other.summary(); other.reset(); }
        this.pending = null;
        this._emit(p.series, p.summary, part);
    }

    /**
     * A series that still stands in its own eyes while the other has seen the car move for a second, and that
     * has said nothing since that movement began, is not being sent: a notifier that never speaks (the getter
     * is polled for those cars), a getter that has stopped answering. Its engine would stay armed on a
     * standstill that is long over, the screen would say READY at 80 km/h, and the getter would be read 20
     * times a second for ever. Its engine is disarmed until its series speaks again.
     */
    _stale() {
        const E = this.engines;
        [[E.notified, E.polled], [E.polled, E.notified]].forEach((pair) => {
            const e = pair[0], o = pair[1];
            if (e.state === 'run' || !e.last || e.last.v >= LAUNCH_KMH) return;
            if (o.last && o.moveSince !== null && o.last.t - o.moveSince >= STALE_MS && e.last.t < o.moveSince) e.disarm();
        });
    }

    _done(series, summary) {
        const other = this.engines[series === 'notified' ? 'polled' : 'notified'];
        let p = this.pending;
        if (p && p.series === series) { this.pending = null; this._emit(p.series, p.summary, null); p = null; }
        if (p) { this.pending = null; this._emit(series, summary, p.summary); return; }
        if (other.state === 'run') { this.pending = { series, summary, at: summary.tEnd }; return; }
        this._emit(series, summary, null);
    }

    /** A run is over: one engine's summary and (if it timed the run too) the other's. */
    _emit(series, summary, otherSummary) {
        const both = { notified: null, polled: null };
        both[series] = summary;
        both[series === 'notified' ? 'polled' : 'notified'] = otherSummary;
        const done = (s) => (s && s.ended ? s : null);
        const c = chooseSeries(done(both.notified), done(both.polled));
        let chosen = c.chosen ? both[c.chosen] : null, disagree = [];
        if (chosen && c.bySpacing) {
            disagree = disagreement(chosen, both[c.chosen === 'notified' ? 'polled' : 'notified']);
            if (disagree.length) {
                // the chosen engine's times stand, with a +- that reaches the other engine's
                const results = Object.assign({}, chosen.results);
                disagree.forEach((d) => { results[d.key] = Object.assign({}, results[d.key], { pm: Math.max(results[d.key].pm, ceil01(d.diff)) }); });
                chosen = Object.assign({}, chosen, { results });
            }
        }
        this.shown = c.chosen;
        this.liveNow = null;
        this.lastRun = { chosen: c.chosen, why: c.why, summary: chosen, both, disagree };
        if (this.o.onRun) this.o.onRun(this.lastRun);
    }

    live() {
        const n = this.engines.notified, p = this.engines.polled;
        const rn = n.state === 'run', rp = p.state === 'run';
        if (rn || rp) {
            if (rn !== rp) this.liveNow = rn ? 'notified' : 'polled';
            else {
                const sn = n.progress().samples, sp = p.progress().samples;
                if (this.liveNow === null) this.liveNow = sp > sn ? 'polled' : 'notified';
                else if (this.liveNow === 'notified' && sp >= sn + 3) this.liveNow = 'polled';
                else if (this.liveNow === 'polled' && sn >= sp + 3) this.liveNow = 'notified';
            }
            return this.engines[this.liveNow];
        }
        this.liveNow = null;
        if (this.shown && this.engines[this.shown].run) return this.engines[this.shown];
        const tn = n.last ? n.last.t : -Infinity, tp = p.last ? p.last.t : -Infinity;
        return tp > tn ? p : n;
    }

    state() {
        const a = this.engines.notified.state, b = this.engines.polled.state;
        return a === 'run' || b === 'run' ? 'run' : a === 'ready' || b === 'ready' ? 'ready' : 'wait';
    }

    configure(c) { this.engines.notified.configure(c); this.engines.polled.configure(c); this._forget(); }
    reset() { this.engines.notified.reset(); this.engines.polled.reset(); this._forget(); }
    _forget() { this.pending = null; this.shown = null; this.liveNow = null; this.sc = null; }
}

/* ---------- the log ---------- */

/** One line for the log: every result of a run summary, its launch gap, spacings and how the launch was placed. */
function describeRun(s) {
    if (!s) return 'no run';
    const res = Object.keys(s.results).map((k) => {
        const r = s.results[k];
        return k + ' ' + r.s.toFixed(3) + ' +-' + r.pm.toFixed(2) + (isNum(r.trap) ? ' trap ' + r.trap.toFixed(1) : '') + (isNum(r.at) ? ' at ' + r.at.toFixed(1) : '');
    }).join(' | ');
    const ms = (x) => (isNum(x) ? Math.round(x) + ' ms' : '-');
    const L = s.launch, END = { jump: 'a step no car does (SPEED JUMP)', silent: 'its series stopping' };
    return s.series + ' (' + s.start + '): ' + (res || 'no split reached') +
        ' | launch gap ' + ms(s.launchGap) + ', first sample ' + s.firstKmh.toFixed(2) + ' km/h, placed by ' + L.how +
        (L.clamp ? ' (held at the ' + (L.clamp === 'stand' ? 'last standstill' : 'first moving sample') + ')' : '') +
        (L.line === null ? '' : ', straight line ' + (L.line >= 0 ? '+' : '') + L.line + ' ms') +
        (L.apart > 0 ? ', +- widened by ' + Math.round(L.apart) + ' ms for the launch' : '') +
        (L.early > 0 ? ', MOVING ' + L.early + ' ms BEFORE THE STANDSTILL by its first samples' : '') +
        (L.late ? ', LAUNCH SEEN LATE (its first moving samples were stamped late): run back from the samples after them' : '') +
        (isNum(L.tickLate) ? ', the app was held up for ' + L.tickLate + ' ms when the first moving sample came' : '') +
        (L.uneven > 0 ? ', first samples unevenly spaced by ' + L.uneven + ' ms' : '') +
        (L.tookLate > 0 ? ', a getter read at the launch took far longer than usual (its stamp may be ' + L.tookLate + ' ms off)' : '') +
        ', smallest speed this series reported before: ' + (isNum(L.lowSeen) ? L.lowSeen.toFixed(3) + ' km/h' : 'none yet') +
        ' | ' + s.samples + ' samples, median ' + ms(s.medianGap) + ', longest ' + ms(s.longestGap) + ', quiet at the end ' + ms(s.quietEnd) +
        (s.holeMs > 0 ? ', HOLE of ' + ms(s.holeMs) : '') + (s.frozenMs >= FROZEN_MS ? ', ONE VALUE REPEATED for ' + ms(s.frozenMs) : '') +
        (s.merged ? ', ' + s.merged + ' stamped late and replaced by the next (arrived together with it, or too soon before it)' : '') + (s.disorder ? ', A SAMPLE READ FAR LOWER THAN THE ONE RIGHT BEFORE IT, OR ITS STAMP DID NOT RUN FORWARD (out of order, or a wrong reading)' : '') +
        (isNum(s.roundTrip) ? ', getter round trip ' + ms(s.roundTrip) : '') +
        ' | top ' + s.vmax.toFixed(1) + ' km/h, peak ' + s.peakG.toFixed(2) + ' g, dropped ' + s.dropped +
        ', scale ' + s.scale.toFixed(4) + ' (' + s.scaleSource + '), ' +
        (s.ended ? 'ended by ' + (END[s.ended] || s.ended) + ' after ' + (isNum(s.length) ? s.length.toFixed(2) : '-') + ' s' : 'NOT FINISHED: stopped, its series had gone silent');
}

module.exports = {
    TwoSeries, chooseSeries, disagreement, PollScheduler, pollPeriod, AccelFallback, Changing, RateMeter, describeRun,
    FAST_MS, SLOW_MS, PARKED_MS, PARKED_AFTER_MS, SLOW_READ_MS, HUNG_READ_MS, TIMEOUT_WAIT_MS, PAIR_MS, HOLE_MS, FROZEN_MS,
};
