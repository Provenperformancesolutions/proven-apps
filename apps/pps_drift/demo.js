'use strict';
/**
 * demo.js - Proven Drift: a made-up drive for demo mode (showroom, bench unit, PC preview). Only shown
 * when the "Demo data" setting says so; the screen then carries a DEMO tag, every demo drift carries the
 * DEMO flag, is scored by an engine of its own and is never saved.
 *
 * A 34 s loop on the app's forward-only clock: 5 s straight at 72 km/h, a drift of 30 degrees through a
 * left-hander that switches to 28 degrees the other way, a straight, a second drift of 22 degrees through
 * a right-hander, a straight. The numbers are invented: no car is behind them.
 *
 * It is not a recording. The loop says what the made-up car does (its speed, how hard it turns, its
 * drift angle), and what each sensor would read of that is worked out from it with plain kinematics
 * (u = V cos(beta), v = V sin(beta), ax = du/dt - r v, ay = dv/dt + r u), in raw units of its own. The
 * app's engine then works the angle out again from those readings, as it would on a car. So the demo
 * shows the whole app at work, on data that is far cleaner than a car's.
 *
 *   const demo = new Demo(now);      now: ms on the forward-only clock
 *   demo.sample(now)                 -> { kmh, lat, long (m/s2), yaw, steer, pedal (raw), wheels: { fl, fr, rl, rr }, hb }
 *   Demo.learned()                   -> what the demo's engine is handed as "learned" (the demo car's own raw units)
 *   Demo.CAR                         -> { wheelbase, front } of the demo car
 */
const G0 = 9.80665, DEG = Math.PI / 180, KMH = 3.6;
const LOOP_MS = 34000;
const CAR = { wheelbase: 2.85, front: 0.5 };
// the demo car's raw units (its own: the engine is handed them as "learned", it does not read them from here)
const YAW_STEP = 0.005, YAW_ZERO = 32768;          // degrees a second per count
const STEER_STEP = 0.01, STEER_ZERO = 32768;       // degrees at the front wheels per count
const PEDAL_FULL = 3200, WHEEL_COUNT = 16;         // raw at the floor; raw per km/h of wheel speed
const SLIP_PER_G = 3.5, SLIP_MAX = 5;              // degrees: the front tyres' slip in the demo

// [s into the loop, km/h, sideways g (+ = turning left), drift degrees (+ = nose left of travel), pedal 0..1, rear wheelspin]
const KEYS = [
    [0, 72, 0, 0, 0.3, 0], [5, 72, 0, 0, 0.3, 0],
    [6.2, 68, 0.78, 30, 0.7, 0.3], [10.2, 62, 0.78, 30, 0.7, 0.3],
    [11.3, 61, -0.78, -28, 0.7, 0.3], [14.3, 58, -0.78, -28, 0.7, 0.3],
    [15.4, 58, 0, 0, 0.3, 0], [19, 72, 0, 0, 0.5, 0], [22, 72, 0, 0, 0.3, 0],
    [23.2, 68, -0.74, -22, 0.6, 0.25], [27.2, 64, -0.74, -22, 0.6, 0.25],
    [28.2, 64, 0, 0, 0.3, 0], [31, 72, 0, 0, 0.5, 0], [34, 72, 0, 0, 0.3, 0],
];
/** 0 to 1 with no jerk at either end. */
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * x * (x * (x * 6 - 15) + 10));

/** What the demo car does at s seconds into the loop: [km/h, g, degrees, pedal, wheelspin]. */
function script(s) {
    const T = LOOP_MS / 1000;
    s = ((s % T) + T) % T;
    let i = 0;
    while (i + 2 < KEYS.length && s >= KEYS[i + 1][0]) i++;
    const a = KEYS[i], b = KEYS[i + 1], x = ease((s - a[0]) / (b[0] - a[0]));
    return [1, 2, 3, 4, 5].map((k) => a[k] + (b[k] - a[k]) * x);
}

/** The car's own speeds at s: forward and sideways (m/s), and its angle of travel against its nose (rad). */
function body(s) {
    const c = script(s), V = c[0] / KMH, beta = -c[2] * DEG;
    return { V, beta, u: V * Math.cos(beta), v: V * Math.sin(beta), lat: c[1] * G0, pedal: c[3], spin: c[4] };
}

class Demo {
    constructor(t0) { this.t0 = t0 || 0; }

    sample(now) {
        const s = (now - this.t0) / 1000, h = 0.005;
        const m = body(s), p = body(s + h), q = body(s - h);
        const r = m.lat / m.V - (p.beta - q.beta) / (2 * h);                // the path's turning less the angle's own change
        const ax = (p.u - q.u) / (2 * h) - r * m.v, ay = (p.v - q.v) / (2 * h) + r * m.u;
        const slip = Math.max(-SLIP_MAX, Math.min(SLIP_MAX, SLIP_PER_G * ay / G0)) * DEG;
        const delta = m.beta + CAR.wheelbase * (1 - CAR.front) * r / m.V + slip;
        const kmh = m.V * KMH, front = Math.round(kmh * WHEEL_COUNT), rear = Math.round(m.u * KMH * (1 + m.spin) * WHEEL_COUNT);
        return {
            kmh: Math.round(kmh * 64) / 64, lat: Math.round(ay * 500) / 500, long: Math.round(ax * 500) / 500,
            yaw: Math.round(YAW_ZERO + r / DEG / YAW_STEP), steer: Math.round(STEER_ZERO + delta / DEG / STEER_STEP),
            pedal: Math.round(m.pedal * PEDAL_FULL), wheels: { fl: front, fr: front, rl: rear, rr: rear }, hb: false,
        };
    }

    /**
     * What learn.js would have learned on the demo car, in the form it exports: 24 steady corners for the yaw
     * rate's line, 16 slow ones for the steering's, the pedal's range, the wheels' usual ratio. Made from the
     * demo car's raw units above, so the demo's engine starts "learned".
     */
    static learned() {
        const yaw = [], steer = [];
        for (let i = 1; i <= 12; i++) [1, -1].forEach((side) => { const dps = side * (5 + i); yaw.push([YAW_ZERO + dps / YAW_STEP, dps * DEG]); });
        for (let i = 1; i <= 8; i++) [1, -1].forEach((side) => {
            const dps = side * (3 + i), v = 10;                             // at 10 m/s the front wheels point at wheelbase x yaw rate / speed
            steer.push([STEER_ZERO + CAR.wheelbase * dps / v / STEER_STEP, YAW_ZERO + dps / YAW_STEP, v]);
        });
        return {
            v: 1, yaw: { demo: yaw }, steer: { 'demo/demo': steer }, pedal: { min: 0, max: PEDAL_FULL },
            wheels: { r: [1, 1, 1, 1, 1, 1, 1, 1], lr: [], yes: 10, no: 0 }, ax: { yes: 8, no: 0 },
        };
    }
}

module.exports = Demo;
module.exports.LOOP_MS = LOOP_MS;
module.exports.CAR = CAR;
module.exports.script = script;
