'use strict';
/**
 * gpscheck.js - Proven Drift: the GPS receiver's speed against the car's own, as a cross-check for the
 * Signals tab. Pure logic, in memory: it never enters an angle or a score, and of it only a speed ratio and
 * a count are saved, with a drift (session.js, store.js). No position, course or heading is in either.
 *
 *   const g = new GpsCheck();
 *   g.speed(t, kmh)          the car's speed (the series the engine uses)
 *   g.nmea(t, text, mode)    SatellitePositioning.updatePosition's nmeaString; mode: 'drift' (a drift is
 *                            running) | 'straight' (the angle is known and small) | null (neither: not taken)
 *                            -> { ok, bad, rmc: [{ valid, kmh, coarse }] } what was read out of it, for the log
 *   g.since(t0)              -> { ratio, n } of the sentences taken in a drift since t0, or null
 *   g.status(now)            for the Signals tab
 *
 * WHY. The drift angle is worked out with the car's speed (angle.js), and nobody knows what speed a car
 * reports while it is sideways: its true speed over the ground, or the speed along its own length, which
 * is smaller by the cosine of the angle (13 % at 30 degrees). The receiver's speed is the true one. So the
 * middle one of receiver speed / car speed is kept twice: while the car goes straight, and while a drift
 * runs. If the second is clearly above the first, the car reports the speed along its length and the
 * angles shown are off (proven/CHANGES-drift.md says by how much on a made-up car).
 *
 * WHAT IS READ OUT OF A SENTENCE: of the RMC sentence its status (A or V) and field 7, the speed over the
 * ground in knots. NOTHING ELSE: not the latitude, not the longitude, not the course, not the date. They
 * are never taken out of the text, so they cannot reach a log, a file or the screen.
 *
 * A sentence is taken when: its checksum is right, its status is A, its speed has a decimal point (whole
 * knots are steps of 1.85 km/h), both speeds are 20 km/h or more, and the car's speed has moved by less
 * than 2 km/h over the 1.5 s before (the receiver's speed is late by an unknown time, about a second: on
 * a car that is slowing down, as most drifts do, a late speed reads high and would look like the very
 * thing this is to find). So a drift gives ratios only while its speed is held, as on a skid pan's circle.
 *
 * FIGURES THAT ARE GUESSES: every number above; 120 ratios are kept each; a middle one is shown from 3.
 */
const KNOT_KMH = 1.852;
const MIN_KMH = 20, STEADY_KMH = 2, STEADY_MS = 1500, SPEED_AGE_MS = 1500;
const KEEP = 120, SHOW_FROM = 3;

const isNum = (x) => typeof x === 'number' && isFinite(x);
function median(list) {
    if (!list.length) return null;
    const a = list.slice().sort((x, y) => x - y), m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/**
 * The RMC sentences of one nmeaString: { ok, bad, rmc: [{ valid: status 'A', kmh (null if absent), coarse:
 * sent without a decimal point }] }. Only sentences whose checksum is right count. Fields 2 and 7 are read,
 * no other.
 */
function parseRmc(text) {
    const out = { ok: 0, bad: 0, rmc: [] };
    if (typeof text !== 'string') return out;
    const parts = text.split('$');
    for (let i = 1; i < parts.length && i <= 40; i++) {
        const m = /^([^*\r\n]*)\*([0-9A-Fa-f]{2})/.exec(parts[i]);
        if (!m) { out.bad++; continue; }
        let sum = 0;
        for (let k = 0; k < m[1].length; k++) sum ^= m[1].charCodeAt(k);
        if (sum !== parseInt(m[2], 16)) { out.bad++; continue; }
        out.ok++;
        const f = m[1].split(',');
        if (f[0].length !== 5 || f[0].slice(2) !== 'RMC') continue;
        const knots = f[7] === undefined || f[7] === '' ? NaN : Number(f[7]);
        out.rmc.push({ valid: f[2] === 'A', kmh: isFinite(knots) && knots >= 0 ? knots * KNOT_KMH : null, coarse: isFinite(knots) && String(f[7]).indexOf('.') < 0 });
    }
    return out;
}

class GpsCheck {
    constructor() {
        this.v = [];                    // the car's speed over the last 2 s: [t, kmh]
        this.straight = []; this.drift = [];       // [{ t, r }]
        this.count = { ok: 0, bad: 0, valid: 0, invalid: 0, coarse: 0, taken: 0 };
        this.last = null;               // { t, kmh, valid }
    }

    speed(t, kmh) {
        if (!isNum(t) || !isNum(kmh)) return;
        this.v.push([t, kmh]);
        while (this.v.length > 1 && t - this.v[0][0] > STEADY_MS + 500) this.v.shift();
    }

    /** The car's speed now, if it is fresh and has held steady: km/h, or null. */
    _steady(t) {
        const n = this.v.length;
        if (!n || t - this.v[n - 1][0] > SPEED_AGE_MS || this.v[0][0] > t - STEADY_MS) return null;
        let lo = Infinity, hi = -Infinity;
        for (const p of this.v) if (t - p[0] <= STEADY_MS) { if (p[1] < lo) lo = p[1]; if (p[1] > hi) hi = p[1]; }
        return hi - lo < STEADY_KMH ? this.v[n - 1][1] : null;
    }

    nmea(t, text, mode) {
        const p = parseRmc(text), c = this.count;
        c.ok += p.ok; c.bad += p.bad;
        for (const r of p.rmc) {
            if (!r.valid || r.kmh === null) { c.invalid++; this.last = { t, kmh: null, valid: false }; continue; }
            c.valid++;
            this.last = { t, kmh: r.kmh, valid: true };
            if (r.coarse) { c.coarse++; continue; }
            const car = this._steady(t);
            if (car === null || car < MIN_KMH || r.kmh < MIN_KMH || (mode !== 'drift' && mode !== 'straight')) continue;
            const list = mode === 'drift' ? this.drift : this.straight;
            list.push({ t, r: r.kmh / car });
            if (list.length > KEEP) list.shift();
            c.taken++;
        }
        return p;
    }

    since(t0) {
        const a = this.drift.filter((x) => x.t >= t0).map((x) => x.r);
        return a.length ? { ratio: median(a), n: a.length } : null;
    }

    status(now) {
        const one = (list) => ({ n: list.length, ratio: list.length >= SHOW_FROM ? median(list.map((x) => x.r)) : null });
        return {
            sentences: Object.assign({}, this.count),
            last: this.last ? { kmh: this.last.kmh, valid: this.last.valid, age: isNum(now) ? now - this.last.t : null } : null,
            straight: one(this.straight), drift: one(this.drift),
        };
    }
}

module.exports = { GpsCheck, parseRmc, KNOT_KMH };
