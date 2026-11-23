'use strict';
/**
 * slope.js - Proven Drag: the slope the car stands on before a launch, from the car's own acceleration
 * sensor, and the decoding of the car's road-gradient value. Pure logic: every time comes in as an argument.
 *
 *   const s = new StartSlope()
 *   s.accel(t, ms2)                    every forward-acceleration sample (m/s2, t ms on a forward-only clock)
 *   s.before(t0, stoodSince)           -> { pct, ms, n } | null: the start slope of a launch at t0
 *   s.standing(now, stoodSince)        -> the same for "now" on a standing car (Signals page)
 *   downhill(pct, limit)               -> true: flag the run DOWNHILL START (limit '1' | '2' | 'off', percent)
 *   laneSlope(raw)                     -> { count, pct } | null: the car's LaneSlope value decoded
 *
 * START SLOPE = the sensor's reading averaged over 1.5 s of standing before the launch, as a percent:
 * a / 9.80665 x 100, positive = nose up. A car standing nose up reads forward acceleration, because the
 * sensor feels gravity along the car. It is the SENSOR'S reading: its own offset is in it, and so is the
 * car's pitch on its springs. Label it "start slope (car's sensor)".
 *
 * WHAT IT ASSUMES ABOUT THE CAR (none of it measured by Proven)
 *   - the acceleration is notified when it changes, so between two samples it is taken to have stayed at
 *     the older one; a reading from before the car came to rest (the braking) is never used
 *   - the last 250 ms before the launch instant are left out: the acceleration is already building up
 *     then (the launch instant is when the SPEED passes 0.5 km/h), and at 2.5 m/s2 a tenth of a second
 *     of it would add 1 % of "slope"
 *   - a car held on the brake against the engine (launch control, brake boosting) squats before it moves.
 *     That reads as nose up and can hide a downhill start of the same size. Not corrected.
 *   - LaneSlope: 12 bits packed as count = ((raw & 255) << 4) | ((raw >> 8) & 15); 1280 = level; 0.1 %
 *     per count; nose up below 1280. Reported from ONE car: shown and logged for study, never used.
 *
 * FIGURES THAT ARE GUESSES: the 250 ms left out; at least 300 ms of standing readings for a figure; a
 * step between two samples older than 60 s is not trusted (the sensor may have stopped sending).
 */
const G0 = 9.80665;
const WINDOW_MS = 1500, GUARD_MS = 250, MIN_MS = 300, KEEP_MS = 4000, STALE_MS = 60000;

const LANE_MAX_PCT = 35;
const isNum = (x) => typeof x === 'number' && isFinite(x);

class StartSlope {
    constructor() { this.s = []; }

    accel(t, a) {
        if (!isNum(t) || !isNum(a)) return;
        const s = this.s;
        if (s.length && t < s[s.length - 1].t) return;
        s.push({ t, a });
        // keep the last few seconds, and one sample from before them (a standing car's reading may not change for minutes)
        let cut = 0;
        while (cut + 1 < s.length && s[cut + 1].t <= t - KEEP_MS) cut++;
        if (cut) s.splice(0, cut);
    }

    /** The reading averaged over [from, to], each sample holding until the next. null without MIN_MS of readings taken at standstill. */
    _mean(from, to, stoodSince) {
        const s = this.s;
        let sum = 0, ms = 0, n = 0;
        for (let i = 0; i < s.length; i++) {
            const a = Math.max(s[i].t, from), b = Math.min(i + 1 < s.length ? s[i + 1].t : to, to);
            // only readings taken since the car came to rest, and not held for longer than the sensor can be trusted silent
            if (s[i].t < stoodSince || b <= a || a - s[i].t > STALE_MS) continue;
            sum += s[i].a * (b - a); ms += b - a; n++;
        }
        return ms >= MIN_MS ? { pct: sum / ms / G0 * 100, ms: Math.round(ms), n } : null;
    }

    /** The start slope of a launch at t0, the car standing since stoodSince: { pct (+ = nose up), ms averaged over, n readings } | null. */
    before(t0, stoodSince) {
        if (!isNum(t0)) return null;
        const to = t0 - GUARD_MS, since = isNum(stoodSince) ? stoodSince : to - WINDOW_MS;
        return this._mean(Math.max(to - WINDOW_MS, since), to, since);
    }

    /** The slope a standing car reads right now (no guard: nothing is launching). */
    standing(now, stoodSince) {
        if (!isNum(now) || !isNum(stoodSince)) return null;
        return this._mean(Math.max(now - WINDOW_MS, stoodSince), now, stoodSince);
    }
}

/** A run that starts steeper downhill than the limit ('1' or '2' percent; 'off': never) is flagged and sets no best. */
function downhill(pct, limit) {
    const lim = Number(limit);
    if (!isNum(pct) || !(lim > 0)) return false;
    return pct < -lim;
}

/**
 * LaneSlope raw -> { count, pct (+ = nose up) }, or null for no value: count 4095 (all 12 bits set), a raw
 * value that is no 16-bit number, or a gradient beyond 35 % either way (a guess at what no road is).
 */
function laneSlope(raw) {
    if (!isNum(raw) || raw < 0 || raw > 65535) return null;
    const count = ((raw & 255) << 4) | ((raw >> 8) & 15);
    if (count === 4095) return null;
    const pct = Math.round((1280 - count) * 0.1 * 10) / 10;
    return Math.abs(pct) > LANE_MAX_PCT ? null : { count, pct };
}

module.exports = { StartSlope, downhill, laneSlope, WINDOW_MS, GUARD_MS, G0 };
