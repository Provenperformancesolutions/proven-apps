'use strict';
/**
 * wheels.js - Proven Drag: the four wheel speeds. Their scale is learned against the vehicle speed, and
 * a launch's wheelspin is read off them. Pure logic: every time comes in as an argument.
 *
 *   rawWheels(value)                 Powertrain.ActualValueRPMWheel -> { fl, fr, rl, rr } raw (null = no value)
 *   const f = new WheelFactors({ saved, onLearned })
 *   f.speed(t, kmh)                  every vehicle speed sample (as the car reports it, no GPS scale)
 *   f.wheels(t, raw)                 every wheel event; learns while the car holds a steady speed
 *   f.kmh(raw)                       -> { fl, fr, rl, rr } km/h, or null until all four factors are known
 *   f.status(), f.export(), f.load(saved), f.reset()
 *
 *   const s = new WheelSpin()        one launch
 *   s.launch(t0)                     the run started (t0: the engine's launch instant)
 *   s.speed(t, kmh, series)          vehicle speed samples (as the car reports them), series 'notified' | 'polled'
 *   s.wheels(t, kmh4)                wheel speeds from WheelFactors.kmh()
 *   s.result(series)                 -> { peak %, secs above 10 %, axle 'front' | 'rear', method: 'wheels',
 *                                         readHigh: SPEED READ HIGH AT LAUNCH, highSecs } | null (no wheel data)
 *
 *   const e = new AccelSpin()        the fallback without wheel data, marked "estimate"
 *   e.accel(t, ms2), e.speed(t, kmh), e.launch(t0, kmh0), e.result() -> { peak, secs, method: 'estimate' } | null
 *
 * WHAT IT ASSUMES ABOUT THE CAR (none of it measured by Proven)
 *   - The four raw wheel values are plain multiples of the wheel's speed (raw x factor = km/h). Their
 *     scaling is not known, which is why the factor is learned: factor = vehicle km/h / raw, while the
 *     vehicle speed is above 30 km/h and has moved by less than 1 km/h over the last second. If the raw
 *     value had an offset as well, the ratios would spread with speed: a wheel whose ratios spread by
 *     more than 3 % is not used, and the Signals page shows the spread.
 *   - The vehicle speed (the stability control's own, already corrected for wheelspin by the car) and the
 *     wheel speeds reach the app equally late. If one is later than the other, the cross-check reads a
 *     difference that is only that delay: at 0.8 g, 50 ms are 1.4 km/h, which is 5 % at 28 km/h. So
 *     SPEED READ HIGH AT LAUNCH is a hint to look at, it never alters a time, and on the first car the
 *     log has to show whether it comes up on launches without wheelspin.
 *   - Cornering makes the four wheels differ by a few percent. The factor is the median of many steady
 *     moments, so bends to both sides cancel; a factor learned on a roundabout alone would be off.
 *
 * WHEELSPIN, over the first 3 s after the launch and while the slowest wheel does more than 5 km/h:
 *   spin % = (fastest wheel - slowest wheel) / slowest wheel x 100. Reported: the peak, the seconds above
 *   10 %, and the axle the fastest wheel was on at the peak.
 * CROSS-CHECK: in those 3 s, the vehicle speed more than 5 % above the slowest wheel for more than 0.3 s
 *   in all: the run is flagged SPEED READ HIGH AT LAUNCH (60 ft and the first foot may be optimistic).
 *
 * The fallback follows the kit's Drag Timer (apps/draggy/wheelspin.js, idrive7-apps, MIT): the car's
 * acceleration, less what the sensor read while standing, is summed up from the launch to the speed the
 * car really has; where the speed signal runs ahead of that sum, the wheels spin. It drifts, and the
 * speed signal is already corrected by the car, so it reads low: an estimate. Four things differ from the
 * kit's: the sum starts AT the launch instant (the acceleration of the last second is kept, because the
 * app only learns of a launch when the first moving speed sample arrives, some tenths after it; the kit's
 * sum starts at the first acceleration sample after that), and it starts from the speed the car has at
 * that instant (0.5 km/h, not 0); each speed sample is compared with the sum carried on to that sample's
 * own moment; and the standing reading is the one from a quarter of a second before the launch (the kit's
 * also takes in the first samples of the launch itself, which the car sends while its speed still reads 0).
 * Without these a launch with no wheelspin at all read about 35 % on the test's
 * stand-in car, because the sum was short by what the car gained before it began. What is left is
 * the delay between the car's acceleration and its speed reaching the app, which is not known: if the
 * acceleration arrives later than the speed, the estimate still reads high at low speed.
 *
 * FIGURES THAT ARE GUESSES: 20 steady moments before a factor counts, the last 200 kept; the 3 % spread
 * limit; a speed sample may be 1.5 s old for learning; a step between two wheel events counts for at most
 * 0.5 s; the fallback's 8 km/h floor and its 2 s of standing for the sensor's zero (the kit's figures); the
 * quarter of a second before the launch whose readings are not taken as "standing".
 */
const { SpeedWindow } = require('./steady');

const WHEELS = ['fl', 'fr', 'rl', 'rr'];
// the members of ActualValueRPMWheel (the front right one is spelt with a small w on the car)
const MEMBER = { fl: 'actualValueRPMWheelFLH', fr: 'actualValueRPMwheelFRH', rl: 'actualValueRPMWheelRLH', rr: 'actualValueRPMWheelRRH' };
const RAW_NONE = 65534;
const LEARN_KMH = 30, LEARN_MS = 1000, LEARN_TOL_KMH = 1, LEARN_AGE_MS = 1500;
const FACTOR_NEED = 20, FACTOR_KEEP = 200, FACTOR_SPREAD = 0.03;
const WINDOW_MS = 3000, SPIN_FLOOR_KMH = 5, SPIN_PCT = 10, HIGH_PCT = 5, HIGH_SECS = 0.3, STEP_MAX_MS = 500;
const EST_FLOOR_KMH = 8, EST_BIAS_MS = 2000, STAND_KMH = 0.5, HIST_MS = 1500, BIAS_GUARD_MS = 250;

const isNum = (x) => typeof x === 'number' && isFinite(x);
function median(list) {
    const a = list.slice().sort((x, y) => x - y), m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/**
 * The four raw wheel values out of an ActualValueRPMWheel event: { fl, fr, rl, rr }, null where the car
 * sends "no value" (65534, 65535) or nothing. Members starting qualifier / CRC / alive / dummy are not read.
 */
function rawWheels(v) {
    const out = { fl: null, fr: null, rl: null, rr: null };
    if (!v || typeof v !== 'object') return out;
    // (a head unit that spells a member differently: the same name without regard to capitals)
    const lower = {};
    Object.keys(v).forEach((k) => { if (!/^(qualifier|crc|alive|dummy)/i.test(k)) lower[k.toLowerCase()] = v[k]; });
    WHEELS.forEach((w) => {
        const x = lower[MEMBER[w].toLowerCase()];
        out[w] = isNum(x) && x >= 0 && x < RAW_NONE ? x : null;
    });
    return out;
}

class WheelFactors {
    /** o.saved: what export() gave last time;  o.onLearned(wheel, factor, n): a wheel's factor is known (said once per start). */
    constructor(o) {
        this.o = o || {};
        this.w = new SpeedWindow(4000);
        this.reset();
        if (this.o.saved) this.load(this.o.saved);
    }

    reset() {
        this.ratios = { fl: [], fr: [], rl: [], rr: [] };
        this.saved = {};
        this.cur = {};                  // wheel -> { f, n, spread } learned since the start
        this.said = {};
        this.lastRaw = null;
    }

    load(saved) {
        WHEELS.forEach((w) => {
            const s = saved && saved[w];
            if (s && isNum(s.f) && s.f > 0) this.saved[w] = { f: s.f, n: isNum(s.n) ? s.n : 0 };
        });
    }

    /** For the saved file: { fl: { f, n }, ... } of the wheels that have a factor. */
    export() {
        const out = {};
        WHEELS.forEach((w) => { const c = this._factor(w); if (c) out[w] = { f: c.f, n: c.n }; });
        return out;
    }

    speed(t, kmh) { this.w.add(t, kmh); }

    /** A wheel event: raw = rawWheels(value). Learns when the car is steady above 30 km/h. */
    wheels(t, raw) {
        this.lastRaw = raw;
        if (!raw || !this.w.steady(t, LEARN_MS, LEARN_TOL_KMH, LEARN_AGE_MS)) return;
        const r = this.w.range(t, LEARN_MS);
        if (!(r.min > LEARN_KMH)) return;
        const v = (r.min + r.max) / 2;
        WHEELS.forEach((w) => {
            if (!isNum(raw[w]) || !(raw[w] > 0)) return;
            const list = this.ratios[w];
            list.push(v / raw[w]);
            if (list.length > FACTOR_KEEP) list.shift();
            if (list.length < FACTOR_NEED) return;
            const a = list.slice().sort((x, y) => x - y), n = a.length, f = median(a);
            const spread = Math.max(f - a[Math.floor(0.1 * (n - 1))], a[Math.ceil(0.9 * (n - 1))] - f) / f;
            this.cur[w] = { f, n, spread };
            if (!this.said[w] && spread <= FACTOR_SPREAD) { this.said[w] = true; if (this.o.onLearned) this.o.onLearned(w, f, n); }
        });
    }

    /** A wheel's factor: learned since the start (if its ratios agree), else the saved one, else null. */
    _factor(w) {
        const c = this.cur[w];
        if (c && c.spread <= FACTOR_SPREAD) return c;
        if (c) return null;                                     // learned, and the ratios do not agree: not a plain factor
        return this.saved[w] ? Object.assign({ saved: true }, this.saved[w]) : null;
    }

    /** Wheel speeds in km/h for a raw event, or null until all four wheels have a factor and a value. */
    kmh(raw) {
        const out = {};
        for (const w of WHEELS) {
            const c = this._factor(w);
            if (!c || !raw || !isNum(raw[w])) return null;
            out[w] = raw[w] * c.f;
        }
        return out;
    }

    /** For the Signals page: per wheel { raw, f, n, spread, saved, usable }, and whether all four are usable. */
    status() {
        const out = { all: true, wheels: {} };
        WHEELS.forEach((w) => {
            const c = this.cur[w], u = this._factor(w);
            out.wheels[w] = {
                raw: this.lastRaw ? this.lastRaw[w] : null, f: u ? u.f : c ? c.f : null, n: c ? c.n : this.ratios[w].length,
                spread: c ? c.spread : null, saved: !!(u && u.saved), usable: !!u,
            };
            if (!u) out.all = false;
        });
        return out;
    }
}

class WheelSpin {
    constructor() { this.t0 = null; this.w = []; this.v = {}; }

    /** A run started at t0 (ms). Samples before a launch are not kept. */
    launch(t0) { this.t0 = t0; this.w = []; this.v = {}; }

    /** Not timing any more: forget the launch. */
    clear() { this.t0 = null; this.w = []; this.v = {}; }

    speed(t, kmh, series) {
        if (this.t0 === null || !isNum(kmh) || t < this.t0 - 500 || t > this.t0 + WINDOW_MS + 500) return;
        const k = series || 'speed';
        (this.v[k] = this.v[k] || new SpeedWindow(WINDOW_MS + 2000)).add(t, kmh);
    }

    wheels(t, kmh4) {
        if (this.t0 === null || !kmh4 || t < this.t0 || t > this.t0 + WINDOW_MS) return;
        this.w.push({ t, k: kmh4 });
    }

    /** series: whose speed samples the cross-check uses (default: the series with more of them). */
    result(series) {
        if (this.t0 === null || !this.w.length) return null;
        let win = this.v[series] || null;
        if (!win) Object.keys(this.v).forEach((k) => { if (!win || this.v[k].s.length > win.s.length) win = this.v[k]; });
        let peak = 0, secs = 0, axle = null, highSecs = 0, prevT = null;
        for (const s of this.w) {
            const dt = prevT === null ? 0 : Math.min(STEP_MAX_MS, s.t - prevT) / 1000;
            prevT = s.t;
            const k = s.k, slow = Math.min(k.fl, k.fr, k.rl, k.rr), fast = Math.max(k.fl, k.fr, k.rl, k.rr);
            if (!(slow > SPIN_FLOOR_KMH)) continue;
            const pct = (fast - slow) / slow * 100;
            if (pct > peak) { peak = pct; axle = Math.max(k.fl, k.fr) >= Math.max(k.rl, k.rr) ? 'front' : 'rear'; }
            if (pct > SPIN_PCT) secs += dt;
            const v = win ? win.valueAt(s.t) : null;
            if (v !== null && v > slow * (1 + HIGH_PCT / 100)) highSecs += dt;
        }
        return {
            peak: Math.round(peak * 10) / 10, secs: Math.round(secs * 100) / 100, axle, method: 'wheels',
            readHigh: highSecs > HIGH_SECS, highSecs: Math.round(highSecs * 100) / 100, samples: this.w.length,
        };
    }
}

class AccelSpin {
    constructor() { this.bias = 0; this.biasN = 0; this.standing = false; this.lastStandA = null; this.hist = []; this._clear(); }

    _clear() { this.t0 = null; this.vb = 0; this.lastA = null; this.peak = 0; this.over = 0; this.lastS = null; this.seen = false; }

    /** A run started at t0; kmh0: the speed the car has at that instant (the launch threshold). */
    launch(t0, kmh0) {
        this._clear();
        this.t0 = t0;
        if (isNum(kmh0) && kmh0 > 0) this.vb = kmh0;
        // The sum from the launch instant on, through the samples that arrived before the app knew of the launch.
        // No news = no change: the acceleration at the launch instant is the one last heard before it.
        const h = this.hist;
        this.hist = [];
        // what the sensor read standing is taken as it stood a quarter of a second before the launch: the samples
        // after that are the launch building up, and would be taken off every sample of the sum
        for (const s of h) if (s.t > t0 - BIAS_GUARD_MS) { this.bias = s.b; this.biasN = s.n; break; }
        let at = null;
        for (const s of h) if (s.t <= t0) at = s;
        if (at) this.lastA = { t: t0, a: at.a };
        for (const s of h) if (s.t > t0) this.accel(s.t, s.a);
    }

    clear() { this._clear(); }

    accel(t, a) {
        if (!isNum(a) || !isNum(t)) return;
        if (this.t0 === null) {
            // (the last second and a half is kept for launch(), and one sample from before it)
            const h = this.hist;
            h.push({ t, a, b: this.bias, n: this.biasN });         // (b, n: the standing reading before this sample)
            while (h.length > 2 && (h[1].t < t - HIST_MS || h.length > 400)) h.shift();
            // standing: what the sensor reads now is its zero (the slope, its own offset), averaged over about 2 s
            if (this.standing) {
                const dt = this.lastStandA === null ? 50 : Math.max(0, Math.min(500, t - this.lastStandA));
                this.lastStandA = t;
                const k = Math.min(1, dt / EST_BIAS_MS);
                this.bias = this.biasN ? this.bias + (a - this.bias) * k : a;
                this.biasN++;
            }
            return;
        }
        if (t - this.t0 > WINDOW_MS) return;
        if (this.lastA) this.vb += ((this.lastA.a + a) / 2 - this.bias) * Math.max(0, t - this.lastA.t) / 1000 * 3.6;
        this.lastA = { t, a };
        this.seen = true;
    }

    speed(t, kmh) {
        if (!isNum(kmh)) return;
        this.standing = kmh < STAND_KMH;
        if (!this.standing) this.lastStandA = null;
        if (this.t0 === null || t - this.t0 > WINDOW_MS || !this.seen) return;
        const dt = this.lastS === null ? 0 : Math.min(STEP_MAX_MS, Math.max(0, t - this.lastS)) / 1000;
        this.lastS = t;
        // the sum carried on to this speed sample's own moment (no news = no change in the acceleration): compared
        // with the sum as it stood at the last acceleration sample, the speed would be ahead by whatever the car
        // gained since, and a launch without wheelspin read 20 % at its worst sample
        const vb = this.vb + (this.lastA ? (this.lastA.a - this.bias) * Math.min(STEP_MAX_MS, Math.max(0, t - this.lastA.t)) / 1000 * 3.6 : 0);
        if (kmh < EST_FLOOR_KMH || vb <= 0) return;
        const pct = (kmh - vb) / vb * 100;
        if (pct > this.peak) this.peak = pct;
        if (pct > SPIN_PCT) this.over += dt;
    }

    result() {
        return this.seen ? { peak: Math.round(Math.max(0, this.peak)), secs: Math.round(this.over * 10) / 10, axle: null, method: 'estimate' } : null;
    }
}

module.exports = { rawWheels, WheelFactors, WheelSpin, AccelSpin, WHEELS, WINDOW_MS, SPIN_PCT, FACTOR_NEED };
