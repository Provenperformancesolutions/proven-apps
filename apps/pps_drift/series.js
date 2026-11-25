'use strict';
/**
 * series.js - Proven Drift: one source's samples over the last few seconds, and what it read at any moment
 * of them. Shared by angle.js and learn.js. Pure logic: every time comes in as an argument.
 *
 *   const s = new Series({ keepMs: 5000, lo: -30, hi: 30, jump: 3, slew: 40, still: 0.5 });
 *   s.add(t, v)            a sample (t: ms on a clock that only runs forward) -> false if it was no value
 *   s.flush(now)           often: a sample that was held back and that nothing followed is taken after 500 ms
 *   s.valueAt(t)                -> what the source read at t: on the straight line between the two samples around
 *                             it; the newest value after the newest sample ("no news = no change"); null
 *                             before any sample
 *   s.window(t0, t1)       -> { min, max, mean, n } over that stretch (n: samples that arrived in it)
 *   s.halves(t0, t1)       -> the same, and d: the second half's mean less the first half's
 *   s.slot()               -> ms: the middle one of its last 16 spacings (those under 600 ms), null before 3
 *   s.last(), s.age(now), s.count, s.newHole() -> ms of the longest hole found since it was last asked
 *
 * WHAT IT ASSUMES ABOUT THE CAR (as Proven Drag does; none measured by Proven)
 *   - No sample carries a time. t is when the app's handler ran.
 *   - A source is notified when its value changes, so silence means "no change", as long as what comes
 *     next fits that: a long silence that the next sample ends with a step (more than `still`) was a HOLE
 *     (samples lost, or the app held up). It is remembered (newHole), and across it the value is taken as
 *     a straight line, as across any two samples. A silence that ends with no step was no change: the old
 *     value held until one send slot before the new sample.
 *   - Samples stamped less than 2 ms apart arrived together (the app was held up, or the car delivers in
 *     lumps): the later one replaces the earlier, which was already old when it was stamped.
 *   - A single nonsense value happens. A value outside lo..hi is no value. A value that steps by more than
 *     `jump` from the one before it (or, if that is more, by more than `slew` a second over the time since
 *     that one, half a second at most) is held back: if the next sample is nearer to it than to the one
 *     before, the step was real and both are taken; if not, it was a lone wrong value and is dropped. Two
 *     wrong values in a row that agree with each other are taken for real: nothing in one source can show
 *     that.
 *
 * FIGURES THAT ARE GUESSES: 2 ms for "arrived together"; 500 ms before a held-back sample that nothing
 * followed is taken after all; spacings of 600 ms or more are not counted as a send slot; a silence longer
 * than 2.5 slots (150 ms at least) is looked at as a silence, and one of 350 ms or more that ends with a step
 * is a hole.
 */
const BURST_MS = 2;
const HOLD_MS = 500;
const SLOT_MAX_MS = 600, SLOT_KEEP = 16, SLOT_MIN_N = 3;
const LINK_SLOTS = 2.5, LINK_MIN_MS = 150, LINK_UNKNOWN_MS = 300;
const HOLE_MS = 350;
const HOLES_KEEP = 8;

const isNum = (x) => typeof x === 'number' && isFinite(x);
function median(list) {
    if (!list.length) return null;
    const a = list.slice().sort((x, y) => x - y), m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
/** The value at share p (0..1) of a list, sorted. */
function quantile(list, p) {
    if (!list.length) return null;
    const a = list.slice().sort((x, y) => x - y), f = p * (a.length - 1), i = Math.floor(f);
    return i + 1 < a.length ? a[i] + (a[i + 1] - a[i]) * (f - i) : a[i];
}

class Series {
    constructor(o) {
        o = o || {};
        this.keep = o.keepMs || 5000;
        this.lo = isNum(o.lo) ? o.lo : -Infinity;
        this.hi = isNum(o.hi) ? o.hi : Infinity;
        this.jump = isNum(o.jump) ? o.jump : Infinity;
        this.slew = isNum(o.slew) ? o.slew : 0;
        this.still = isNum(o.still) ? o.still : 0;
        this.reset();
    }

    reset() {
        this.t = []; this.v = [];
        this.pending = null;
        this.gaps = [];
        this.holes = [];
        this.count = 0; this.noValue = 0; this.dropped = 0; this.merged = 0; this.backwards = 0;
    }

    add(t, v) {
        if (!isNum(t) || !isNum(v) || v < this.lo || v > this.hi) { this.noValue++; return false; }
        const n = this.t.length;
        if (n && t < this.t[n - 1]) { this.backwards++; return false; }
        if (this.pending) {
            const p = this.pending;
            this.pending = null;
            // the held-back value: is the new one nearer to it, or to the one before it?
            if (!n || Math.abs(v - p.v) <= Math.abs(v - this.v[n - 1])) this._push(p.t, p.v); else this.dropped++;
            return this.add(t, v);
        }
        if (n && Math.abs(v - this.v[n - 1]) > Math.max(this.jump, this.slew * Math.min(t - this.t[n - 1], HOLD_MS) / 1000)) { this.pending = { t, v }; return true; }
        this._push(t, v);
        return true;
    }

    flush(now) {
        if (this.pending && now - this.pending.t >= HOLD_MS) { const p = this.pending; this.pending = null; this._push(p.t, p.v); }
    }

    _push(t, v) {
        const T = this.t, V = this.v, n = T.length;
        this.count++;
        if (n && t - T[n - 1] < BURST_MS) { T[n - 1] = t; V[n - 1] = v; this.merged++; return; }
        if (n) {
            const gap = t - T[n - 1];
            if (gap < SLOT_MAX_MS) { this.gaps.push(gap); if (this.gaps.length > SLOT_KEEP) this.gaps.shift(); }
            if (gap >= HOLE_MS && gap > this._link() && Math.abs(v - V[n - 1]) > this.still) {
                this.holes.push({ from: T[n - 1], to: t, told: false });
                if (this.holes.length > HOLES_KEEP) this.holes.shift();
            }
        }
        T.push(t); V.push(v);
        // drop what is older than the window, but keep one sample from before it
        const from = t - this.keep;
        let cut = 0;
        while (cut + 1 < T.length && T[cut + 1] <= from) cut++;
        if (cut) { T.splice(0, cut); V.splice(0, cut); }
    }

    slot() { return this.gaps.length >= SLOT_MIN_N ? median(this.gaps) : null; }
    _link() { const s = this.slot(); return s === null ? LINK_UNKNOWN_MS : Math.max(LINK_SLOTS * s, LINK_MIN_MS); }

    last() { const n = this.t.length; return n ? { t: this.t[n - 1], v: this.v[n - 1] } : null; }
    age(now) { const n = this.t.length; return n ? now - this.t[n - 1] : Infinity; }

    valueAt(t) {
        const T = this.t, V = this.v, n = T.length;
        if (!n) return null;
        if (t >= T[n - 1]) return V[n - 1];
        if (t <= T[0]) return V[0];
        let lo = 0, hi = n - 1;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= t) lo = m; else hi = m; }
        const gap = T[hi] - T[lo];
        let t0 = T[lo];
        // a silence that ended with no step: nothing changed until one slot before the new sample
        if (gap > this._link() && Math.abs(V[hi] - V[lo]) <= this.still) {
            t0 = T[hi] - Math.min(gap, this.slot() || 100);
            if (t <= t0) return V[lo];
        }
        return V[lo] + (V[hi] - V[lo]) * (t - t0) / (T[hi] - t0);
    }

    /** Lowest, highest and mean reading over [t0, t1] (the mean over time), and how many samples arrived in it. */
    window(t0, t1) {
        const T = this.t, n = T.length;
        if (!n || !(t1 > t0)) return null;
        let min = Infinity, max = -Infinity, sum = 0, count = 0, pt = t0, pv = this.valueAt(t0);
        const take = (t, v) => { if (v < min) min = v; if (v > max) max = v; sum += (pv + v) / 2 * (t - pt); pt = t; pv = v; };
        if (pv < min) min = pv;
        if (pv > max) max = pv;
        for (let i = 0; i < n; i++) {
            if (T[i] <= t0) continue;
            if (T[i] >= t1) break;
            take(T[i], this.v[i]); count++;
        }
        take(t1, this.valueAt(t1));
        return { min, max, mean: sum / (t1 - t0), n: count };
    }

    /**
     * The same over the two halves of [t0, t1]: { mean, min, max, n, d: how far the second half's mean is from
     * the first half's }. Noise does not make a steady source look unsteady this way.
     */
    halves(t0, t1) {
        const tm = (t0 + t1) / 2, a = this.window(t0, tm), b = this.window(tm, t1);
        if (!a || !b) return null;
        return { mean: (a.mean + b.mean) / 2, min: Math.min(a.min, b.min), max: Math.max(a.max, b.max), n: a.n + b.n, d: b.mean - a.mean };
    }

    /** ms of the longest hole found since this was last asked (0: none). */
    newHole() {
        let ms = 0;
        for (const h of this.holes) if (!h.told) { h.told = true; if (h.to - h.from > ms) ms = h.to - h.from; }
        return ms;
    }
}

module.exports = { Series, median, quantile, isNum };
