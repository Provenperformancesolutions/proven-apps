'use strict';
/**
 * dragsim.js - a standing-start run with known answers, and the speed samples a car would hand an app for it.
 * What the Proven Drag tests measure the timing engine (apps/pps_drag/run.js) against. No car, no SDK.
 *
 *   const { Truth, randomCar, sample, drive, rng } = require('./dragsim');
 *   const car = new Truth({ a0: 8, vTop: 70, ramp: 0.15, shifts: [{ v: 60, dur: 0.15, cut: 0.9 }] });
 *   car.answers('slip', 'kmh')              -> { '0-100': { s }, 'quarter': { s, trap, at }, ... } exact
 *   sample(car, { spacing: 100, phase: 37 }) -> [{ t, v }] what the car sends (t: ms on the app's clock)
 *   drive(engine, samples)                  -> the engine's summary of that run
 *
 * THE TRUTH MODEL (made up to be plausible, not measured on any car):
 *   The car stands until time 0. Its acceleration then rises in a straight line from 0 to full over `ramp`
 *   seconds (0 to 0.3: the clutch taking up, the tyres loading; `shape` gives other ways of building up:
 *   'smooth' an S-curve, 'exp' creeping up to full, 'spike' overshooting by 30 %, 'creep' the brake released
 *   and the throttle only 0.4 s later: a tenth of full until then, then full at once), and full acceleration falls off with speed
 *   as a0 x (1 - v / vTop), which gives a top speed the car creeps up to (vTop). At each gear change the
 *   acceleration is cut for `dur` seconds (by `cut`: 1 = all of it, more than 1 = the car slows a little),
 *   with 30 ms edges. A gear change may carry a `kick`: for `kickDur` seconds (0.1 if not given) after it is
 *   over the car pulls `kick` times as hard as it otherwise would, from one moment to the next (torque that
 *   comes back hard; no car was measured for it). `lift` (seconds): from then the car brakes at 4 m/s2 to a stop.
 *   Speed and distance are worked out in steps of 0.1 ms and kept every 1 ms; the answers are read off that
 *   table by straight lines, which is exact to a few hundredths of a millisecond.
 *
 * WHAT COUNTS AS THE RIGHT ANSWER (the app's own definitions, section 2 of the brief):
 *   - the car "moves" from the instant its true speed passes 0.5 km/h (with a slow ramp that is up to 0.1 s
 *     after the acceleration began: `tMove`); times "from first movement" and distances count from there
 *   - one-foot rollout: the clock for that split starts when the car has covered 0.3048 m from there, and
 *     the distance is measured from that point
 *   - trap speed: 20.1168 m (66 ft) divided by the time taken for the last 66 ft before the line
 *
 * THE SAMPLERS (what a car might do to the truth; every number is an option because none is known):
 *   spacing   ms between the car's own send slots                    phase    ms, where the slots fall
 *   onChange  a slot is only sent when the value differs from the last one sent (a standing car sends nothing)
 *   quantum   km/h per count (1/64, the speed signal's own step; 0 = none)
 *   delay     ms every sample arrives late (constant)                 jitter   ms, each arrives late by 0..jitter more
 *   lag       ms, first-order low-pass on the speed before sampling  over     the car reads this much too high (1.03 = 3 %)
 *   zeroAt    ms after the start: the slot nearest to it reads 0     stand    ms of standing before the start
 *   floor     km/h: the car reports 0 while its speed is below this (a speed signal that cuts in late; 0.5: one
 *             that reads 0 under the very speed the app counts as standing)
 *   until     ms after the start to stop at                           clock0   the app clock's reading at time 0
 * samplePolled(): the getter read as the app reads it, one read after another: each takes `rt` +- `rtJitter` ms, the
 *   car reads its value at a random moment of that round trip, the sample is stamped at its middle and carries
 *   the round trip (took), as the app's scheduler hands it to the engine.
 */
const KMH = 3.6, MPH = 1.609344, FT = 0.3048, TRAP_M = 20.1168, LAUNCH_KMH = 0.5;
const DISTS = { '60ft': 18.288, '330ft': 100.584, eighth: 201.168, '1000ft': 304.8, quarter: 402.336 };
const TRAPS = { eighth: true, quarter: true };
const H = 1e-4;                 // integration step, s
const KEEP = 10, S = H * KEEP;  // every 10th step is kept: the table's step, s

/** A small seeded random number generator (the tests must give the same numbers every time). */
function rng(seed) {
    let a = seed >>> 0;
    const next = () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.between = (lo, hi) => lo + (hi - lo) * next();
    next.pick = (list) => list[Math.floor(next() * list.length)];
    return next;
}

class Truth {
    /**
     * p: a0 m/s2 (full acceleration at low speed), vTop m/s (the speed it never quite reaches), ramp s,
     *    shifts [{ v m/s, dur s, cut, kick (optional, more than 1), kickDur s }], lift s (optional), maxT s (how long to work out, default: until
     *    1 s past the quarter mile with rollout, at most 70)
     */
    constructor(p) {
        this.p = Object.assign({ a0: 8, vTop: 70, ramp: 0.15, shifts: [] }, p);
        const { a0, vTop, ramp } = this.p, EDGE = 0.03;
        const shifts = this.p.shifts.slice().sort((a, b) => a.v - b.v).map((s) => Object.assign({ at: null }, s));
        const maxT = this.p.maxT || 70, steps = Math.ceil(maxT / H) + 2;
        let V = new Float64Array(Math.ceil(steps / KEEP) + 2), X = new Float64Array(Math.ceil(steps / KEEP) + 2);
        const endX = DISTS.quarter + FT + 2;
        let v = 0, x = 0, n = 1, doneAt = Infinity, lifted = false;
        // how the acceleration builds up after time 0, as a share of full (1 = all of it)
        const u = (t) => (ramp > 0 ? t / ramp : Infinity);
        const build = {
            linear: (t) => Math.min(1, u(t)),                                             // a straight rise over `ramp`
            smooth: (t) => { const x = Math.min(1, u(t)); return x * x * (3 - 2 * x); },  // an S-curve over `ramp`
            exp: (t) => (ramp > 0 ? 1 - Math.exp(-3 * t / ramp) : 1),                     // creeping up to full (95 % at `ramp`)
            // overshoots: 130 % at half of `ramp`, back to 100 % at twice `ramp` (a launch that bites, then settles)
            spike: (t) => { const x = u(t); return x < 0.5 ? 2.6 * x : x < 2 ? 1.3 - 0.2 * (x - 0.5) : 1; },
            // the brake released, the throttle 0.4 s later: the car creeps on a tenth of full, then gets all of it at once
            creep: (t) => (t < 0.4 ? 0.1 : 1),
        }[this.p.shape || 'linear'];
        const acc = (t, vv) => {
            if (lifted) return vv > 0 ? -4 : 0;
            let a = a0 * (1 - vv / vTop) * build(t);
            for (const s of shifts) {
                if (s.at === null) continue;
                const u = t - s.at;
                if (s.kick > 1 && u > s.dur && u <= s.dur + (s.kickDur || 0.1)) { a *= s.kick; continue; }
                if (u < 0 || u > s.dur) continue;
                const shape = Math.min(1, u / EDGE, (s.dur - u) / EDGE);       // 0 .. 1 .. 0
                a = a * (1 - shape) + shape * a * (1 - s.cut);
            }
            return a;
        };
        for (let i = 1; i < steps; i++) {
            const t = (i - 1) * H;
            if (this.p.lift !== undefined && !lifted && t >= this.p.lift) lifted = true;
            for (const s of shifts) if (s.at === null && v >= s.v) s.at = t;
            // midpoint rule: good to a few parts in a billion at this step
            const a1 = acc(t, v), vm = v + a1 * H / 2, a2 = acc(t + H / 2, vm);
            const v2 = Math.max(0, v + a2 * H);
            x += (v + v2) / 2 * H;
            v = v2;
            if (i % KEEP === 0) { V[i / KEEP] = v; X[i / KEEP] = x; n = i / KEEP + 1; }
            if (x > endX && doneAt === Infinity) doneAt = t + 1;
            if (!this.p.maxT && t > doneAt) break;
            if (lifted && v === 0 && t > this.p.lift + 0.5) break;
        }
        this.V = V.slice(0, n); this.X = X.slice(0, n); this.n = n; this.tEnd = (n - 1) * S;
        this.tMove = this.tAtV(LAUNCH_KMH / KMH);
        this.xMove = this.xAt(this.tMove);
    }

    /** Speed (m/s) and distance (m) at time t (s); standing before 0, the last value after the table ends. */
    vAt(t) { return this._at(this.V, t); }
    xAt(t) { return this._at(this.X, t); }
    _at(A, t) {
        if (t <= 0) return 0;
        const f = t / S, i = Math.floor(f);
        if (i >= this.n - 1) return A === this.X ? A[this.n - 1] + this.V[this.n - 1] * (t - this.tEnd) : A[this.n - 1];
        return A[i] + (A[i + 1] - A[i]) * (f - i);
    }
    /** The first time (s) the speed reaches v m/s, or null. */
    tAtV(v) { return this._first(this.V, v); }
    /** The time (s) the car has covered x m, or null. */
    tAtX(x) { return this._first(this.X, x); }
    _first(A, y) {
        for (let i = 1; i < this.n; i++) if (A[i] >= y && A[i - 1] < y) return (i - 1 + (y - A[i - 1]) / (A[i] - A[i - 1])) * S;
        return null;
    }

    /**
     * The exact results for a start convention ('slip' | 'standstill' | 'rollout') and unit ('kmh' | 'mph'):
     * { key: { s, trap (km/h, 1/8 and 1/4 mile), at (km/h at the line) } }, only the splits the car reached.
     */
    answers(start, unit) {
        const out = {}, tM = this.tMove, tR = this.tAtX(this.xMove + FT);
        const ref = { slip: ['move', 'roll'], standstill: ['move', 'move'], rollout: ['roll', 'roll'] }[start || 'slip'];
        const kmh = unit === 'mph' ? 60 * MPH : 100, sKey = unit === 'mph' ? '0-60' : '0-100';
        const t0s = ref[0] === 'roll' ? tR : tM, tv = this.tAtV(kmh / KMH);
        if (tv !== null && t0s !== null) out[sKey] = { s: tv - t0s };
        const t0d = ref[1] === 'roll' ? tR : tM, x0 = this.xMove + (ref[1] === 'roll' ? FT : 0);
        if (t0d === null) return out;
        Object.keys(DISTS).forEach((k) => {
            const tl = this.tAtX(x0 + DISTS[k]);
            if (tl === null) return;
            out[k] = { s: tl - t0d, at: this.vAt(tl) * KMH };
            if (TRAPS[k]) out[k].trap = TRAP_M / (tl - this.tAtX(x0 + DISTS[k] - TRAP_M)) * KMH;
        });
        return out;
    }
}

/** A car drawn at random: 0-100 km/h in about 3.5 to 10 s, launch ramp 0 to 0.3 s, two to four gear changes. */
function randomCar(rand, over) {
    const a0 = rand.between(4, 9.5), vTop = rand.between(55, 90), shifts = [];
    let v = rand.between(45, 75);
    for (let i = 0; i < 4 && v < 0.8 * vTop * KMH; i++) {
        shifts.push({ v: v / KMH, dur: rand.between(0.08, 0.35), cut: rand.between(0.6, 1.08) });
        v *= rand.between(1.4, 1.7);
    }
    return new Truth(Object.assign({ a0, vTop, ramp: rand.between(0, 0.3), shifts }, over || {}));
}

/**
 * The samples a car would hand the app for this run. See the top of the file for the options.
 * Returns [{ t (ms, the app's clock), v (km/h as the car reports it) }], in the order they arrive.
 */
function sample(truth, o) {
    o = Object.assign({ spacing: 50, phase: 0, onChange: false, quantum: 1 / 64, delay: 0, jitter: 0, lag: 0, over: 1, floor: 0,
        stand: 3000, clock0: 100000 }, o || {});
    const rand = o.rand || rng(1);
    const until = o.until !== undefined ? o.until : truth.tEnd * 1000;
    // the lagged speed, on the truth's own grid (only worked out when asked for)
    let L = null;
    if (o.lag > 0) {
        L = new Float64Array(truth.n);
        const k = 1 - Math.exp(-S / (o.lag / 1000));
        for (let i = 1; i < truth.n; i++) L[i] = L[i - 1] + (truth.V[i] - L[i - 1]) * k;
    }
    const speed = (ms) => {
        if (ms <= 0) return 0;
        if (!L) return truth.vAt(ms / 1000);
        const f = ms / 1000 / S, i = Math.floor(f);
        return i >= truth.n - 1 ? L[truth.n - 1] : L[i] + (L[i + 1] - L[i]) * (f - i);
    };
    const out = [];
    let lastSent = null, lastT = -Infinity;
    const first = -Math.ceil((o.stand + o.phase) / o.spacing);
    const zeroSlot = o.zeroAt === undefined ? null : Math.round((o.zeroAt - o.phase) / o.spacing);
    for (let k = first; ; k++) {
        const ms = o.phase + k * o.spacing;
        if (ms > until) break;
        let v = speed(ms) * KMH * o.over;
        if (o.quantum > 0) v = Math.round(v / o.quantum) * o.quantum;
        if (k === zeroSlot || v < o.floor) v = 0;
        if (o.onChange && lastSent !== null && v === lastSent) continue;
        lastSent = v;
        let t = o.clock0 + ms + o.delay + (o.jitter > 0 ? rand() * o.jitter : 0);
        if (t <= lastT) t = lastT + 0.01;                    // stamped on arrival: never backwards
        lastT = t;
        out.push({ t, v });
    }
    return out;
}

/**
 * The samples of the getter, read as the app reads it (see the top): [{ t, v, took }].
 * o: period (50), rt (25), rtJitter (10), phase, quantum (1/64), stand (3000), until, clock0, rand
 */
function samplePolled(truth, o) {
    o = Object.assign({ period: 50, rt: 25, rtJitter: 10, phase: 0, quantum: 1 / 64, stand: 3000, clock0: 100000 }, o || {});
    const rand = o.rand || rng(1), until = o.until !== undefined ? o.until : truth.tEnd * 1000, out = [];
    let due = -o.stand + o.phase, free = -Infinity;
    while (due <= until) {
        const t1 = Math.max(due, free), rt = Math.max(1, o.rt + (rand() * 2 - 1) * o.rtJitter), at = t1 + rand() * rt;
        let v = at <= 0 ? 0 : truth.vAt(at / 1000) * KMH;
        if (o.quantum > 0) v = Math.round(v / o.quantum) * o.quantum;
        out.push({ t: o.clock0 + t1 + rt / 2, v, took: rt });
        free = t1 + rt;
        due += o.period;
        if (due < t1) due = t1;
    }
    return out;
}

/**
 * Hand samples to an engine as the app does: each at its time, with engine.idle(now) every o.idle ms in
 * between (50, as the app's timer; o.idlePhase ms, default 0), until o.until (the app's clock, default 2 s
 * after the last sample). Returns the summary of the last run that finished, or null.
 */
function drive(engine, samples, o) {
    o = Object.assign({ idle: 50, idlePhase: 0 }, o || {});
    let done = null;
    const prevDone = engine.onDone;
    engine.onDone = (s) => { done = s; if (prevDone) prevDone(s); };
    const end = o.until !== undefined ? o.until : samples[samples.length - 1].t + 2000;
    let tick = o.idle > 0 ? Math.floor(samples[0].t / o.idle) * o.idle + o.idlePhase : Infinity, i = 0;
    while (i < samples.length || tick <= end) {
        const st = i < samples.length ? samples[i].t : Infinity;
        if (st <= tick) { engine.feed(st, samples[i].v, samples[i].took); i++; } else if (tick <= end) { engine.idle(tick); tick += o.idle; } else break;
    }
    engine.onDone = prevDone;
    return done;
}

module.exports = { Truth, randomCar, sample, samplePolled, drive, rng, DISTS, TRAP_M, FT, KMH, MPH, LAUNCH_KMH };
