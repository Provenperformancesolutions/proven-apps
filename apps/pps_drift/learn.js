'use strict';
/**
 * learn.js - Proven Drift: what has to be learned about this car before its drift angle means anything.
 * Learned from ordinary driving, shown on the Signals tab, saved between drives. Pure logic: it is handed
 * what the sources read over the last second and keeps "moments" of it. No position, course or heading
 * ever comes near it.
 *
 *   const learn = new Learn({ saved, yawKey: 'cds2', steerKey: 'front', onChange: (what) => ... });
 *   learn.look(m)            every quarter of a second, m = Angle.stats() plus { wheels, sliding } (see look())
 *   learn.pedal(raw)         every accelerator sample -> its share 0..1 of the largest value seen, or null
 *   learn.values()           -> { k, zero, state, kc, szero, sstate, axSign, left, wheelBase } what angle.js works with
 *   learn.status()           -> the same with counts and spreads, for the Signals tab
 *   learn.export(), learn.load(saved), learn.reset(), learn.use({ yawKey, steerKey })
 *
 * 1. THE YAW RATE: k, sign and zero. In a corner the car takes without sliding, sideways acceleration =
 *    k x yaw rate x speed. The yaw rate arrives as a raw count of unknown scale, sign and zero, so what is
 *    learned is K in   ay / V = K (raw - zero):  the line through many moments in the plane (raw, ay / V).
 *    K holds the sensor's scale and sign, the body's roll and the sensors' gains all at once (angle.js says
 *    what that costs).
 *    A MOMENT is one second in which the car held a steady corner: speed between 30 and 110 km/h, sideways
 *    acceleration between 1.5 and 5 m/s2, each of them and the yaw rate steady, rear and front wheels
 *    turning alike where there are wheel speeds, the forward acceleration felt within 0.5 m/s2 (or a fifth
 *    of the sideways acceleration, if that is more) of the speed's own change where there is a forward
 *    acceleration, and (once K is learned) the engine not saying that the car is sliding. The forward
 *    acceleration is there because a car that slides feels part of its turn in it and a car that grips
 *    next to none: without that test a car drifted in steady circles both ways before it had learned
 *    anything came out "learned" with K low by the cosine of its angle. What the forward acceleration
 *    reads more than the speed's change on a straight (a road that climbs, a zero that is off: angle.js
 *    measures it) is taken out first; without that a climb of 3 degrees turned gripping corners down as
 *    slides. Seconds that were turned down by this test are counted for the Signals tab (status().turnedDown,
 *    since the app started, not saved). At most one moment a second. "Steady" compares the mean of the second's two halves (noise
 *    does not make a steady corner look unsteady that way): the speed within 1.5 km/h, the sideways
 *    acceleration and the yaw rate each within 8 % of their own size (0.3 m/s2 at least).
 *    THE FIT is robust: K is the middle one of the slopes between every left-hand moment and every
 *    right-hand moment, the zero the middle one of what each moment then says it is. So a few moments
 *    taken in a slide do not move it. Left and right must both be seen: from corners one way only the zero
 *    cannot be told from the scale.
 *    learned: 20 moments or more, 6 or more each way, the middle 80 % of them within 8 % of the line.
 *    learning: a line exists (2 or more each way; or 6 moments one way and a zero that angle.js has from a
 *    standing car or from a straight).
 *    Before that the DEFAULT stands: 0.005 degrees a second per count, zero at 32768, positive in a
 *    left-hand turn. It is a guess from the look of the acceleration signals' scaling, right for no car
 *    that anybody has checked. Until K is learned every drift is flagged UNCALIBRATED, and while there is
 *    no line at all none is counted (drift.js).
 * 2. THE STEERING: scale, sign and zero. In a slow, gentle corner the front wheels point where the car
 *    goes: front-wheel angle = wheelbase x yaw rate / speed. Learned the same way, as "curvature per count"
 *    (so the wheelbase setting can change without learning again): moments of one second at 12 to 60 km/h
 *    with 0.5 to 2.5 m/s2 of sideways acceleration, everything steady, at most one every 0.8 s. It needs
 *    the yaw rate's line first.
 *    learned: 14 moments, 4 each way, the middle 80 % within 12 %.
 * 3. THE ACCELERATOR: the smallest and largest raw value seen. Shown as a share, never scored.
 * 4. THE WHEELS (where there are wheel speeds; their scale is not known, only ratios are used): the usual
 *    ratio of rear to front wheel speed while nothing spins, which wheelspin is then read against; and
 *    WHICH WAY IS LEFT: in a corner the outer front wheel turns faster, so the wheels say whether positive
 *    sideways acceleration is a left-hand turn. Until 8 corners agree (8 of 10 at least), left is assumed.
 * 5. THE FORWARD ACCELERATION'S SIGN, checked against the speed in straight-line pulls and stops (the
 *    speed changing by 1.2 m/s2 or more over a second). Until 6 of them agree, positive = speeding up is
 *    assumed, as the kit's own apps take it.
 *
 * WHAT IS SAVED (export): the moments as pairs of numbers (a raw count and a ratio), the pedal's two raw
 * values, the wheel ratio, and the two tallies. Nothing else.
 *
 * WHAT THIS CANNOT KNOW: corners with camber into the turn take their share of gravity off the sideways
 * acceleration, and K comes out low by that share (1.5 degrees: 8 % on a made-up car) with the state
 * "learned". Learn on flat ground. A road that begins to climb in the corner still reads as a slide to
 * the test above (the offset is the last straight's), and such a corner gives no moment. And a car with
 * neither wheel speeds nor a forward acceleration can still learn from steady slides.
 *
 * FIGURES THAT ARE GUESSES: every number above, and: 120 yaw moments and 80 steering moments are kept (the
 * oldest go); wheels "alike" = within 3 % of their usual ratio and steady within 1.5 %; the usual ratio is
 * the middle one of the last 60 steady readings, from 8 on.
 */
const { median, quantile, isNum } = require('./series');

const DEG = Math.PI / 180, KMH = 3.6;
const DEFAULT_K = 0.005 * DEG, DEFAULT_ZERO = 32768;

// "steady": how far the mean of a moment's second half may be from the mean of its first half
const STEADY = { KMH: 1.5, AY: 0.3, SHARE: 0.08, RAW: 1, WHEELS: 0.015 };
const YAW = { V_LO: 30, V_HI: 110, AY_LO: 1.5, AY_HI: 5, KEEP: 120, NEED: 20, NEED_SIDE: 6, SPREAD: 0.08, FIT_SIDE: 2, FIT_ONE_WAY: 6, EVERY_MS: 1000 };
const STEER = { V_LO: 12, V_HI: 60, AY_LO: 0.5, AY_HI: 2.5, KEEP: 80, NEED: 14, NEED_SIDE: 4, SPREAD: 0.12, FIT_SIDE: 2, EVERY_MS: 800 };
const WHEEL = { ALIKE: 0.03, KEEP: 60, NEED: 8, V_LO: 20, AX_MAX: 1.0, LR_MIN: 0.003, VOTES: 8, SHARE: 0.8, TALLY_MAX: 40 };
const AX = { RATE: 1.2, AY_MAX: 0.8, VOTES: 6, SHARE: 0.8, EVERY_MS: 1000 };
// a slide: the forward acceleration felt is this far (m/s2; or this share of the sideways acceleration, if that is more) from the speed's own change
const SLIDE = { AX: 0.5, SHARE: 0.2 };

const moved = (w) => Math.abs(w.d);

/**
 * The line y = K (x - zero) through moments [{ x, y }], robustly. zeroHint: a zero known from elsewhere (a
 * standing car), used when the moments are all on one side. -> { k, zero, n, left, right, spread } | null
 */
function fitLine(pts, zeroHint, fitSide, oneWay) {
    const pos = pts.filter((p) => p.y > 0), neg = pts.filter((p) => p.y < 0);
    let k = null, zero = null;
    if (pos.length >= fitSide && neg.length >= fitSide) {
        const slopes = [];
        for (const p of pos) for (const q of neg) if (p.x !== q.x) slopes.push((p.y - q.y) / (p.x - q.x));
        k = median(slopes);
        if (!isNum(k) || k === 0) return null;
        zero = median(pts.map((p) => p.x - p.y / k));
    } else if (isNum(zeroHint) && isNum(oneWay) && pts.length >= oneWay) {
        k = median(pts.filter((p) => p.x !== zeroHint).map((p) => p.y / (p.x - zeroHint)));
        zero = zeroHint;
        if (!isNum(k) || k === 0) return null;
    } else return null;
    const ratio = pts.map((p) => p.y / (k * (p.x - zero))).filter(isNum);
    const spread = ratio.length >= 3 ? (quantile(ratio, 0.9) - quantile(ratio, 0.1)) / 2 : null;
    return { k, zero, n: pts.length, left: pos.length, right: neg.length, spread };
}

const freshYaw = () => ({ m: [], fit: null, at: -Infinity });
const freshSteer = () => ({ m: [], fit: null, at: -Infinity });

class Learn {
    constructor(o) {
        this.o = o || {};
        this.yawKey = this.o.yawKey || 'yaw';
        this.steerKey = this.o.steerKey || 'steer';
        this.reset();
        if (this.o.saved) this.load(this.o.saved);
    }

    reset() {
        this.yaws = {}; this.steers = {};
        this.ped = { min: null, max: null };
        this.wheel = { r: [], base: null, lr: [], lrBase: null, yes: 0, no: 0 };
        this.ax = { yes: 0, no: 0, at: -Infinity };
        this.slid = { n: 0, at: -Infinity };      // seconds turned down by the "no slide" test since the app started (not saved)
        this.cache = null;
    }

    /** Which yaw and which steering source is in use: each has its own moments. */
    use(c) {
        if (c && c.yawKey) this.yawKey = c.yawKey;
        if (c && c.steerKey) this.steerKey = c.steerKey;
        this.cache = null;
    }

    _yaw() { return this.yaws[this.yawKey] || (this.yaws[this.yawKey] = freshYaw()); }
    /** (the steering's moments hold the yaw rate's raw readings, so they belong to one pair of sources) */
    _steer() {
        const key = this.steerKey + '/' + this.yawKey, S = this.steers[key] || (this.steers[key] = freshSteer());
        if (S.stale) { S.stale = false; this._fitSteer(); }
        return S;
    }

    _yawState(f) {
        if (!f) return 'none';
        return f.n >= YAW.NEED && f.left >= YAW.NEED_SIDE && f.right >= YAW.NEED_SIDE && isNum(f.spread) && f.spread <= YAW.SPREAD ? 'learned' : 'learning';
    }
    _steerState(f) {
        if (!f) return 'none';
        return f.n >= STEER.NEED && f.left >= STEER.NEED_SIDE && f.right >= STEER.NEED_SIDE && isNum(f.spread) && f.spread <= STEER.SPREAD ? 'learned' : 'learning';
    }

    /** What angle.js works with. One object, made again only when something was learned. */
    values() {
        if (this.cache) return this.cache;
        const y = this._yaw().fit, s = this._steer().fit, w = this.wheel, votes = w.yes + w.no, av = this.ax.yes + this.ax.no;
        const leftKnown = votes >= WHEEL.VOTES && Math.max(w.yes, w.no) >= WHEEL.SHARE * votes;
        const axKnown = av >= AX.VOTES && Math.max(this.ax.yes, this.ax.no) >= AX.SHARE * av;
        this.cache = {
            k: y ? y.k : DEFAULT_K, zero: y ? y.zero : DEFAULT_ZERO, state: this._yawState(y), spread: y ? y.spread : null,
            kc: s ? s.k : null, szero: s ? s.zero : null, sstate: this._steerState(s),
            axSign: axKnown && this.ax.no > this.ax.yes ? -1 : 1, axKnown,
            left: leftKnown && w.no > w.yes ? -1 : 1, leftKnown,       // 1: positive sideways acceleration is a left-hand turn
            wheelBase: w.base,
        };
        return this.cache;
    }

    status() {
        const v = this.values(), y = this._yaw().fit, s = this._steer().fit;
        const one = (f, state) => ({ state, k: f ? f.k : null, zero: f ? f.zero : null, n: f ? f.n : 0, left: f ? f.left : 0, right: f ? f.right : 0, spread: f ? f.spread : null });
        return {
            yaw: Object.assign(one(y, v.state), { moments: this._yaw().m.length, key: this.yawKey, usedK: v.k, usedZero: v.zero }),
            steer: Object.assign(one(s, v.sstate), { moments: this._steer().m.length, key: this.steerKey }),
            pedal: { min: this.ped.min, max: this.ped.max },
            wheels: { base: this.wheel.base, readings: this.wheel.r.length },
            left: { known: v.leftKnown, positiveIsLeft: v.left > 0, agree: this.wheel.yes, against: this.wheel.no },
            ax: { known: v.axKnown, positiveIsForward: v.axSign > 0, agree: this.ax.yes, against: this.ax.no },
            turnedDown: this.slid.n,
        };
    }

    /** An accelerator sample (raw) -> its share of the range seen so far (0..1), or null while there is no range. */
    pedal(raw) {
        if (!isNum(raw) || raw < 0 || raw >= 4095) return null;
        const p = this.ped;
        if (p.min === null || raw < p.min) p.min = raw;
        if (p.max === null || raw > p.max) p.max = raw;
        return p.max > p.min ? (raw - p.min) / (p.max - p.min) : null;
    }

    /**
     * One look at the last second. m: Angle.stats() = { t, ms, v, lat, long, yaw, steer (each { min, max, mean } or
     * null), dv (m/s the speed changed by), ay0, zero (the yaw zero from a standing car, or null), szero }, plus
     * wheels: { rf: { min, max, mean } rear over front, lr: { mean } log of front right over front left } | null,
     * sliding: the engine says a drift is on or the angle is not small.
     */
    look(m) {
        if (!m || !m.v || !m.lat || !isNum(m.ay0)) return;
        const kmh = m.v.mean, V = kmh / KMH, a = m.lat.mean - m.ay0, abs = Math.abs(a);
        const steadyV = moved(m.v) <= STEADY.KMH, steadyA = moved(m.lat) <= Math.max(STEADY.AY, STEADY.SHARE * abs);
        const W = this.wheel, wh = m.wheels && m.wheels.rf && isNum(m.wheels.rf.mean) ? m.wheels : null;
        const alike = !wh || (moved(wh.rf) <= STEADY.WHEELS && (W.base === null || Math.abs(wh.rf.mean / W.base - 1) <= WHEEL.ALIKE));
        const yawSteady = (zero) => !!m.yaw && (isNum(zero) ? moved(m.yaw) <= STEADY.SHARE * Math.abs(m.yaw.mean - zero) + STEADY.RAW : true);
        const Y = this._yaw(), yState = this._yawState(Y.fit);
        const zeroNow = isNum(m.zero) ? m.zero : Y.fit ? Y.fit.zero : null;
        const quiet = !(m.sliding && yState === 'learned');
        // A car that slides feels part of its turn in its forward acceleration, and its speed does not show it (angle.js,
        // the acceleration check). A car that grips feels next to none. So where there is a forward acceleration, a
        // second in which it is far from the speed's own change is no moment, whatever has been learned so far.
        // (less what it reads more than the speed's change on a straight: a road that climbs, a zero that is off. angle.js measures that)
        const felt = m.long && isNum(m.dv) && m.ms > 0 ? Math.abs(m.long.mean * this.values().axSign - (isNum(m.ax0) ? m.ax0 : 0) - m.dv / (m.ms / 1000)) : 0;
        const grips = felt <= Math.max(SLIDE.AX, SLIDE.SHARE * abs);

        // the wheels' usual ratio, and the forward acceleration's sign
        if (wh && steadyV && kmh >= WHEEL.V_LO && abs <= YAW.AY_HI && moved(wh.rf) <= STEADY.WHEELS && quiet && (!m.long || Math.abs(m.long.mean) <= WHEEL.AX_MAX)) {
            W.r.push(wh.rf.mean); if (W.r.length > WHEEL.KEEP) W.r.shift();
            const base = W.r.length >= WHEEL.NEED ? median(W.r) : null;
            if (base !== W.base) { W.base = base; this.cache = null; }
            if (abs < 0.5 && wh.lr && isNum(wh.lr.mean)) { W.lr.push(wh.lr.mean); if (W.lr.length > WHEEL.KEEP) W.lr.shift(); W.lrBase = W.lr.length >= WHEEL.NEED ? median(W.lr) : null; }
        }
        if (m.long && isNum(m.dv) && abs <= AX.AY_MAX && m.t - this.ax.at >= AX.EVERY_MS && Math.abs(m.dv) / (m.ms / 1000) >= AX.RATE && Math.abs(m.long.mean) >= AX.RATE / 2) {
            this.ax.at = m.t;
            if ((m.dv > 0) === (m.long.mean > 0)) this.ax.yes++; else this.ax.no++;
            this._cap(this.ax); this.cache = null;
        }

        // a steady corner: one moment for the yaw rate's line
        const yawOk = !!m.yaw && steadyV && kmh >= YAW.V_LO && kmh <= YAW.V_HI && abs >= YAW.AY_LO && abs <= YAW.AY_HI && steadyA && yawSteady(zeroNow) && alike && quiet;
        if (yawOk && grips && m.t - Y.at >= YAW.EVERY_MS) {
            Y.at = m.t;
            Y.m.push({ x: m.yaw.mean, y: a / V });
            if (Y.m.length > YAW.KEEP) Y.m.shift();
            const before = this._yawState(Y.fit);
            Y.fit = fitLine(Y.m, isNum(m.zero) ? m.zero : null, YAW.FIT_SIDE, YAW.FIT_ONE_WAY);
            this.cache = null;
            const own = this.steers[this.steerKey + '/' + this.yawKey];
            if (own) own.stale = true;                    // the steering's line is drawn with this one
            // which way is left: the outer front wheel turns faster
            if (wh && wh.lr && isNum(wh.lr.mean) && W.lrBase !== null && Math.abs(wh.lr.mean - W.lrBase) >= WHEEL.LR_MIN) {
                if ((wh.lr.mean - W.lrBase > 0) === (a > 0)) W.yes++; else W.no++;
                this._cap(W);
            }
            const now = this._yawState(Y.fit);
            if (this.o.onChange && now !== before) this.o.onChange('yaw', now);
        }

        // a slow, gentle corner: one moment for the steering's line
        const S = this._steer();
        const steerOk = !!Y.fit && !!m.yaw && !!m.steer && steadyV && kmh >= STEER.V_LO && kmh <= STEER.V_HI && abs >= STEER.AY_LO && abs <= STEER.AY_HI && steadyA && yawSteady(zeroNow) && alike && quiet &&
            (isNum(m.szero) ? moved(m.steer) <= STEADY.SHARE * Math.abs(m.steer.mean - m.szero) + STEADY.RAW : true);
        // (a second that would have been a moment but for the forward acceleration: counted, one a second at most, for the Signals tab)
        if ((yawOk || steerOk) && !grips && m.t - this.slid.at >= YAW.EVERY_MS) { this.slid.at = m.t; this.slid.n++; }
        if (steerOk && grips && m.t - S.at >= STEER.EVERY_MS) {
            S.at = m.t;
            S.m.push({ s: m.steer.mean, w: m.yaw.mean, v: V });
            if (S.m.length > STEER.KEEP) S.m.shift();
            const before = this._steerState(S.fit);
            this._fitSteer();
            const now = this._steerState(S.fit);
            if (this.o.onChange && now !== before) this.o.onChange('steer', now);
        }
    }

    /** The steering's line: curvature (yaw rate / speed, with the yaw rate as it is known now) against the raw steering. */
    _fitSteer() {
        const S = this.steers[this.steerKey + '/' + this.yawKey], y = this._yaw().fit;
        if (!S) return;
        S.fit = y ? fitLine(S.m.map((p) => ({ x: p.s, y: y.k * (p.w - y.zero) / p.v })), null, STEER.FIT_SIDE, null) : null;
        this.cache = null;
    }

    _cap(tally) { if (tally.yes + tally.no > WHEEL.TALLY_MAX) { tally.yes = Math.round(tally.yes / 2); tally.no = Math.round(tally.no / 2); } }

    /** What is saved between drives: numbers only. */
    export() {
        const r4 = (x) => Math.round(x * 1e4) / 1e4, r7 = (x) => Number(x.toPrecision(7));
        const out = { v: 1, yaw: {}, steer: {}, pedal: { min: this.ped.min, max: this.ped.max }, wheels: { r: this.wheel.r.map(r7), lr: this.wheel.lr.map(r7), yes: this.wheel.yes, no: this.wheel.no }, ax: { yes: this.ax.yes, no: this.ax.no } };
        Object.keys(this.yaws).forEach((k) => { if (this.yaws[k].m.length) out.yaw[k] = this.yaws[k].m.map((p) => [r4(p.x), r7(p.y)]); });
        Object.keys(this.steers).forEach((k) => { if (this.steers[k].m.length) out.steer[k] = this.steers[k].m.map((p) => [r4(p.s), r4(p.w), r4(p.v)]); });
        return out;
    }

    /** Take a saved object. Anything in it that is not what export() writes is left out; a bad file changes nothing. */
    load(saved) {
        this.reset();
        if (!saved || typeof saved !== 'object' || saved.v !== 1) return false;
        const rows = (x, n, keep) => (Array.isArray(x) ? x.filter((p) => Array.isArray(p) && p.length === n && p.every(isNum)).slice(-keep) : []);
        const keys = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.keys(x).slice(0, 8) : []);
        keys(saved.yaw).forEach((k) => {
            const m = rows(saved.yaw[k], 2, YAW.KEEP).filter((p) => p[1] !== 0).map((p) => ({ x: p[0], y: p[1] }));
            if (m.length) this.yaws[k] = { m, fit: fitLine(m, null, YAW.FIT_SIDE, null), at: -Infinity };
        });
        keys(saved.steer).forEach((k) => {
            const m = rows(saved.steer[k], 3, STEER.KEEP).filter((p) => p[2] > 0).map((p) => ({ s: p[0], w: p[1], v: p[2] }));
            if (m.length) this.steers[k] = { m, fit: null, at: -Infinity, stale: true };
        });
        const p = saved.pedal;
        if (p && isNum(p.min) && isNum(p.max) && p.min >= 0 && p.max < 4095 && p.max >= p.min) this.ped = { min: p.min, max: p.max };
        const w = saved.wheels, nums = (x, keep) => (Array.isArray(x) ? x.filter((y) => isNum(y)).slice(-keep) : []), tally = (x) => (isNum(x) && x >= 0 && x <= WHEEL.TALLY_MAX ? Math.round(x) : 0);
        if (w && typeof w === 'object') {
            this.wheel.r = nums(w.r, WHEEL.KEEP).filter((x) => x > 0); this.wheel.lr = nums(w.lr, WHEEL.KEEP);
            this.wheel.base = this.wheel.r.length >= WHEEL.NEED ? median(this.wheel.r) : null;
            this.wheel.lrBase = this.wheel.lr.length >= WHEEL.NEED ? median(this.wheel.lr) : null;
            this.wheel.yes = tally(w.yes); this.wheel.no = tally(w.no);
        }
        if (saved.ax && typeof saved.ax === 'object') { this.ax.yes = tally(saved.ax.yes); this.ax.no = tally(saved.ax.no); }
        this.cache = null;
        return true;
    }
}

module.exports = { Learn, fitLine, DEFAULT_K, DEFAULT_ZERO, YAW, STEER, WHEEL, AX, STEADY, SLIDE };
