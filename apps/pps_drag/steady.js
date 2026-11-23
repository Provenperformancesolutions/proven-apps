'use strict';
/**
 * steady.js - Proven Drag: the vehicle speed over the last few seconds, for the helpers that only learn
 * while the car holds a steady speed (gpsscale.js, wheels.js) and for "is the speed changing" (feed.js).
 * Pure logic: every time comes in as an argument.
 *
 *   const w = new SpeedWindow(5000);       remembers this many ms
 *   w.add(t, kmh)                          every speed sample, of either series (t: ms, a forward-only clock)
 *   w.last()                               -> { t, v } | null
 *   w.range(now, 2000)                     -> { min, max } over the last 2 s, or null if it does not know that far back
 *   w.steady(now, 2000, 2, 3000)           -> true if the speed moved by less than 2 km/h over the last 2 s
 *                                             and the newest sample is at most 3 s old
 *   w.valueAt(t)                           -> km/h at time t, on the straight line between the samples around it
 *
 * WHAT IT ASSUMES ABOUT THE CAR: a steady car sends nothing (the speed is only notified when it changes),
 * so between two samples the speed is taken to have stayed at the older one ("no news = no change").
 * That is why a figure for the last 2 s needs a sample from before those 2 s, and why the newest sample
 * may be a few seconds old and still count. How old is a GUESS (the callers pass 1.5 to 3 s): the speed
 * getter is polled at least every 500 ms while the car drives, so a healthy feed is never older than that.
 */
class SpeedWindow {
    constructor(keepMs) {
        this.keep = keepMs || 5000;
        this.s = [];                     // samples in time order; the first may be older than keepMs (the value "before")
    }

    add(t, v) {
        if (typeof t !== 'number' || typeof v !== 'number' || !isFinite(t) || !isFinite(v)) return;
        const s = this.s;
        let i = s.length;
        while (i > 0 && s[i - 1].t > t) i--;                 // the two series arrive a little out of order
        s.splice(i, 0, { t, v });
        // drop what is older than the window, but keep one sample from before it
        const from = s[s.length - 1].t - this.keep;
        let cut = 0;
        while (cut + 1 < s.length && s[cut + 1].t <= from) cut++;
        if (cut) s.splice(0, cut);
    }

    last() { return this.s.length ? this.s[this.s.length - 1] : null; }

    /** Lowest and highest speed over [now - ms, now], or null without a sample from before that stretch. */
    range(now, ms) {
        const s = this.s, from = now - ms;
        if (!s.length || s[0].t > from) return null;
        let min = Infinity, max = -Infinity;
        for (let i = 0; i < s.length; i++) {
            if (s[i].t > now) break;
            // the value in force at `from` is the last sample at or before it
            if (s[i].t <= from && i + 1 < s.length && s[i + 1].t <= from) continue;
            if (s[i].v < min) min = s[i].v;
            if (s[i].v > max) max = s[i].v;
        }
        return min === Infinity ? null : { min, max };
    }

    /** Moved by less than tolKmh over the last ms, with a newest sample no older than maxAgeMs? */
    steady(now, ms, tolKmh, maxAgeMs) {
        const l = this.last();
        if (!l || now - l.t > maxAgeMs) return false;
        const r = this.range(now, ms);
        return !!r && r.max - r.min < tolKmh;
    }

    /** km/h at time t: on the straight line between the two samples around it; the newest one after it; null before the oldest. */
    valueAt(t) {
        const s = this.s;
        if (!s.length || t < s[0].t) return null;
        for (let i = s.length - 1; i >= 0; i--) {
            if (s[i].t > t) continue;
            if (i === s.length - 1 || s[i + 1].t === s[i].t) return s[i].v;
            return s[i].v + (s[i + 1].v - s[i].v) * (t - s[i].t) / (s[i + 1].t - s[i].t);
        }
        return null;
    }
}

module.exports = { SpeedWindow };
