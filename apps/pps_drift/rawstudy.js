'use strict';
/**
 * rawstudy.js - Proven Drift: two signals whose form on a real car is NOT KNOWN, kept raw for a photo, and
 * the rule by which the wheel values have to prove themselves before anything is worked out from them.
 * Pure logic: every time comes in as an argument, nothing here reads a clock, a file or the car.
 * (1.0.1, after the first car: proven/CHANGES-drift.md part 9. The wheel rule follows Proven Drag's
 * apps/pps_drag/wheels.js, which is Proven's own.)
 *
 *   const p = new PedalStudy();
 *   p.value(v, first)       every value of AcceleratorPedal.AngleAcceleratorPedal as it came (a number, or
 *                           an object: each of its numeric fields is kept under its own name; `first` is the
 *                           member the kit's Live Data reads, shown first)
 *   p.status()           -> [{ name, now, lo, hi, kinds (different values seen), more (more than KINDS_MAX) }]
 *   p.others                how many further numeric fields the value had that are not kept (3 are)
 *
 *   const w = new WheelProof();
 *   w.speed(t, kmh)         every speed sample the engine takes
 *   w.wheels(t, any)        every wheel event, any = { fl, fr, rl, rr } as the numbers came (null: none)
 *   w.look(t, calm)         every 50 ms; calm: the car goes straight and does not slide (session.js says so).
 *                           Five times a second at most, in a steady moment, it takes one ratio of each wheel
 *   w.proven()           -> true once the four wheel values have proven themselves (below)
 *   w.status()           -> { ok, why: 'none' | 'wait' | 'form' | null, wheels: { fl: { now, lo, hi, steady,
 *                             steadyKmh }, ... } }
 *
 * THE ACCELERATOR PEDAL. On the first car the owner saw the pedal's percentage "jumping about": the raw
 * value does not arrive in the form 1.0.0 assumed (a plain count that grows with the pedal). The kit's own
 * Redline app leaves the pedal out for the same reason. So this version shows NO pedal percentage anywhere
 * and works nothing out from the pedal. With the setting "Pedal and handbrake" on, the Signals tab shows
 * what two photos need to read its form off (one with the foot off, one with the foot on the floor): per
 * numeric field the value now, the lowest and the highest of this life, in decimal and in hexadecimal, and
 * how many different values were seen. Fields whose names begin with crc, alive or dummy are left out (a
 * checksum, a counter, padding). NO DECODING IS GUESSED HERE.
 *
 * THE WHEEL SPEEDS. On the first car all four read 65407 standing still, and the values are no plain
 * multiple of the car's speed. Proven Drift only ever uses ratios of them (rear over front for the rear
 * wheelspin and for learning's check that the wheels grip, right over left for "which way is left"), and
 * a ratio means something only if each value is a plain multiple of its wheel's speed. Values in another
 * form still give ratios, steady ones at one speed, and a wheelspin made of nothing. So no wheel value
 * reaches the engine until all four have PROVEN THEMSELVES:
 *   - a steady moment: the car's speed is 30 km/h or more and has moved by less than 1 km/h over the last
 *     second, and the car goes straight without sliding (in a corner the four wheels differ by some percent,
 *     and in a drift the rear ones spin: neither says anything about the form of the values). In it, raw
 *     value / speed is one ratio of that wheel, taken five times a second from the value that stands (a car
 *     may send a wheel value only when it changes, and at a held speed it hardly does);
 *   - the ratios are kept per stretch of 10 km/h (the newest 20 of each), and a stretch counts with 5;
 *   - proven: every wheel has stretches that count whose speeds lie 20 km/h apart or more, and the middle
 *     ratio of each such stretch is within 3 % of the middle of them all. Ratios taken at ONE speed agree
 *     with each other whatever form the value has: only across speeds does the test mean anything.
 *   A wheel whose stretches disagree is "no plain multiple of the speed": nothing of the wheels is used, for
 *   as long as that holds. The proof is made again in every life of the app (it is not saved): two steady
 *   speeds, for example 35 and 60 km/h held for a second each.
 *   What the engine had learned from the wheels in an earlier version (the usual ratio, which way is left)
 *   stays in the saved file as it was.
 *
 * FIGURES THAT ARE GUESSES: 30 km/h, 1 km/h over 1 s, a ratio every 0.2 s, 10 km/h stretches, 5 and 20 ratios, 20 km/h apart,
 * 3 %; 256 different pedal values counted; 3 numeric fields of the pedal's value kept. None was tried on a car.
 */
const WHEELS = ['fl', 'fr', 'rl', 'rr'];
const PROOF = { KMH: 30, STEADY_MS: 1000, TOL_KMH: 1, EVERY_MS: 200, BUCKET_KMH: 10, BUCKET_NEED: 5, BUCKET_KEEP: 20, SPAN_KMH: 20, SPREAD: 0.03, RAW_NONE: 65534 };
const KINDS_MAX = 256, FIELDS_MAX = 3, NAME_MAX = 48;
const BOOKKEEPING = /^(crc|alive|dummy)/i;       // fields of a value that say nothing about the pedal

const isNum = (x) => typeof x === 'number' && isFinite(x);
function median(list) {
    const a = list.slice().sort((x, y) => x - y), m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/** One numeric value over a life: now, lowest, highest, and how many different values were seen (counted up to KINDS_MAX). */
class RawField {
    constructor() { this.now = null; this.lo = null; this.hi = null; this.seen = {}; this.kinds = 0; this.more = false; }
    add(x) {
        if (!isNum(x)) return;
        this.now = x;
        if (this.lo === null || x < this.lo) this.lo = x;
        if (this.hi === null || x > this.hi) this.hi = x;
        const k = String(x);
        if (this.seen[k]) return;
        if (this.kinds >= KINDS_MAX) { this.more = true; return; }
        this.seen[k] = true; this.kinds++;
    }
    status() { return { now: this.now, lo: this.lo, hi: this.hi, kinds: this.kinds, more: this.more }; }
}

class PedalStudy {
    constructor() { this.reset(); }
    reset() { this.fields = {}; this.order = []; this.left = {}; this.others = 0; }

    /** A value as it came. first: the member the kit's Live Data reads (shown first, where it is there). */
    value(v, first) {
        const take = (name, x) => {
            if (!isNum(x) || BOOKKEEPING.test(String(name))) return;
            const key = String(name).replace(/[^A-Za-z0-9_]/g, '').slice(0, NAME_MAX) || 'value';
            if (!this.fields[key]) {
                // (the member Live Data reads always has its place; of the others the first two are kept, the rest counted)
                const isFirst = !!first && key.toLowerCase() === String(first).toLowerCase();
                if (!isFirst && this.order.filter((k) => !first || k.toLowerCase() !== String(first).toLowerCase()).length >= FIELDS_MAX - 1) {
                    if (!this.left[key] && this.others < 9) { this.left[key] = true; this.others++; }
                    return;
                }
                this.fields[key] = new RawField();
                if (first && key.toLowerCase() === String(first).toLowerCase()) this.order.unshift(key); else this.order.push(key);
            }
            this.fields[key].add(x);
        };
        if (isNum(v)) take('value', v);
        else if (v && typeof v === 'object') Object.keys(v).slice(0, 12).forEach((k) => take(k, v[k]));
    }

    status() { return this.order.map((k) => Object.assign({ name: k }, this.fields[k].status())); }
}

class WheelProof {
    constructor() { this.reset(); }

    reset() {
        this.sp = [];                   // [t, km/h] of the last second, and the one sample before it (the speed in force when that second began)
        this.raw = {}; this.b = {};
        WHEELS.forEach((w) => { this.raw[w] = { f: new RawField(), steady: null, steadyKmh: null }; this.b[w] = {}; });
        this.any = false; this.dirty = false; this.lookAt = -Infinity;
        this.state = { ok: false, why: 'none' };
    }

    speed(t, kmh) {
        if (!isNum(t) || !isNum(kmh)) return;
        const sp = this.sp;
        if (sp.length && t < sp[sp.length - 1][0]) return;
        sp.push([t, kmh]);
        // (the car notifies its speed when it changes: the value in force at the start of the last second is the last one before it)
        while (sp.length > 2 && sp[1][0] <= t - PROOF.STEADY_MS) sp.shift();
    }

    /** The car's speed if it is steady right now (PROOF.KMH or more, moved by less than PROOF.TOL_KMH over the last second), else null. */
    steady(t) {
        const sp = this.sp;
        if (!sp.length || !isNum(t) || sp[0][0] > t - PROOF.STEADY_MS) return null;
        let lo = Infinity, hi = -Infinity;
        for (let i = 0; i < sp.length; i++) {
            // (a sample from before the last second counts only as the value in force when it began)
            if (i < sp.length - 1 && sp[i + 1][0] <= t - PROOF.STEADY_MS) continue;
            if (sp[i][1] < lo) lo = sp[i][1];
            if (sp[i][1] > hi) hi = sp[i][1];
        }
        return lo >= PROOF.KMH && hi - lo < PROOF.TOL_KMH ? sp[sp.length - 1][1] : null;
    }

    /** A wheel event: the four values as they came. Kept raw (now, lowest, highest, and at the last steady speed). */
    wheels(t, any) {
        if (!any || typeof any !== 'object') return;
        const v = this.steady(t);
        WHEELS.forEach((w) => {
            const x = any[w], r = this.raw[w];
            if (!isNum(x)) return;
            this.any = true;
            r.f.add(x);
            if (v !== null) { r.steady = x; r.steadyKmh = v; }
        });
    }

    /**
     * Every 50 ms. In a steady moment in which the car goes straight and does not slide (calm), one ratio of each wheel
     * is taken from the value that stands, PROOF.EVERY_MS apart at least.
     */
    look(t, calm) {
        if (!this.any || !calm || !isNum(t) || t - this.lookAt < PROOF.EVERY_MS) return;
        const v = this.steady(t);
        if (v === null) return;
        this.lookAt = t;
        WHEELS.forEach((w) => {
            const x = this.raw[w].f.now;
            if (!isNum(x)) return;
            this.raw[w].steady = x; this.raw[w].steadyKmh = v;
            if (!(x > 0 && x < PROOF.RAW_NONE)) return;
            const key = Math.floor(v / PROOF.BUCKET_KMH), list = this.b[w][key] || (this.b[w][key] = []);
            list.push([x / v, v]);
            if (list.length > PROOF.BUCKET_KEEP) list.shift();
            this.dirty = true;
        });
    }

    _check() {
        if (!this.any) return { ok: false, why: 'none' };
        let wait = false;
        for (const w of WHEELS) {
            const full = Object.keys(this.b[w]).map((k) => this.b[w][k]).filter((l) => l.length >= PROOF.BUCKET_NEED);
            if (full.length < 2) { wait = true; continue; }
            const speeds = full.map((l) => median(l.map((p) => p[1]))), mids = full.map((l) => median(l.map((p) => p[0])));
            if (Math.max.apply(null, speeds) - Math.min.apply(null, speeds) < PROOF.SPAN_KMH) { wait = true; continue; }
            const mid = median(mids);
            if (!(mid > 0) || mids.some((m) => Math.abs(m / mid - 1) > PROOF.SPREAD)) return { ok: false, why: 'form' };
        }
        return wait ? { ok: false, why: 'wait' } : { ok: true, why: null };
    }

    proven() {
        if (this.dirty) { this.dirty = false; this.state = this._check(); } else if (this.any && this.state.why === 'none') this.state = this._check();
        return this.state.ok;
    }

    status() {
        this.proven();
        const wheels = {};
        WHEELS.forEach((w) => { const r = this.raw[w]; wheels[w] = Object.assign(r.f.status(), { steady: r.steady, steadyKmh: r.steadyKmh }); });
        return { ok: this.state.ok, why: this.state.why, wheels };
    }
}

module.exports = { PedalStudy, WheelProof, RawField, PROOF, WHEELS, KINDS_MAX, FIELDS_MAX };
