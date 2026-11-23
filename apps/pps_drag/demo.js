'use strict';
/**
 * demo.js - Proven Drag: a made-up launch for demo mode (showroom, bench unit, PC preview). Only shown
 * when the "Demo data" setting says so; the screen then carries a DEMO tag, and a demo run is timed by
 * an engine of its own and never saved.
 *
 * A 30 s loop on the app's forward-only clock: 5 s standing (the timer arms), a pull of 14.5 s that
 * passes 100 km/h after about 4.7 s and the 1/4 mile after about 12.8 s, 5.5 s of braking, 5 s standing.
 * The numbers are invented: no car is behind them.
 *
 *   const demo = new Demo(now);      now: ms on the forward-only clock
 *   demo.speed(now)                  -> km/h
 */
const STAND_MS = 5000, PULL_MS = 14500, BRAKE_MS = 5500, LOOP_MS = 30000;
const TOP_KMH = 250, TAU_S = 9, RAMP_S = 0.2;

/** km/h after u seconds of the pull: the acceleration builds up over RAMP_S, then falls off towards TOP_KMH. */
function pull(u) {
    const e = u < RAMP_S ? u * u / (2 * RAMP_S) : u - RAMP_S / 2;
    return TOP_KMH * (1 - Math.exp(-e / TAU_S));
}

class Demo {
    constructor(t0) { this.t0 = t0 || 0; }

    speed(now) {
        const t = (((now - this.t0) % LOOP_MS) + LOOP_MS) % LOOP_MS;
        if (t < STAND_MS) return 0;
        if (t < STAND_MS + PULL_MS) return pull((t - STAND_MS) / 1000);
        const b = (t - STAND_MS - PULL_MS) / BRAKE_MS;
        return b < 1 ? pull(PULL_MS / 1000) * (1 - b) : 0;
    }
}

module.exports = Demo;
module.exports.LOOP_MS = LOOP_MS;
module.exports.STAND_MS = STAND_MS;
