'use strict';
/**
 * driftsim.js - a made-up car whose drift angle is known, and the samples a head unit would hand an app for it.
 * What the Proven Drift tests measure the engine (apps/pps_drift/angle.js, learn.js, drift.js, score.js) against.
 * No car, no SDK. Nothing in here was measured on a car: every number is made up to be plausible.
 *
 *   const sim = require('./driftsim');
 *   const truth = new sim.Truth(sim.scene('held'), sim.CARS.a);       the true motion, every millisecond
 *   truth.at(ms)                     -> { V m/s, beta rad, r rad/s, ax, ay m/s2, delta rad, drift: scripted angle, deg }
 *   const events = sim.sampleAll(truth, sim.CARS.a, { spacing: 50, faults: sim.DIRTY, rand: sim.rng(1) });
 *                                    -> [{ t ms (the app's clock), src, v }] in the order they arrive
 *   sim.drive(engine, events, { onTick: (now) => ... })   hands them over as the app does, idle() every 50 ms
 *
 * THE TRUE MOTION is made first, from a script (class Script): the car's speed V, the sideways acceleration
 * of its path (`lat`, in g: together with V that is how tightly it turns) and its drift angle, each moved
 * smoothly from one value to the next. From those, on a 1 ms grid:
 *   beta  = the scripted drift angle (as an angle of travel against the nose, see SIGNS) plus the small
 *           angle a car that grips has anyway (the rear axle's distance times the path's curvature, less the
 *           rear tyres' own slip, which grows with the sideways load)
 *   r     = lat / V - d(beta)/dt                 the yaw rate that goes with that path and that angle
 *   u = V cos(beta), v = V sin(beta)             forward and sideways speed in the car's own frame
 *   ax = du/dt - r v,   ay = dv/dt + r u         what an acceleration sensor at the centre of gravity feels
 * These are kinematics, exact for any motion: no tyre and no engine model decides them. The script decides what
 * the car does, so a scene is only as real as its author made it.
 * Derived from the motion, for the sources that are not kinematics:
 *   - the front wheels' angle: delta = beta + a r / V + alpha_f, where alpha_f is the front tyres' slip angle
 *     for the sideways force the front axle has to give (its sideways acceleration, ay + a x yaw acceleration),
 *     from a tyre curve of the "magic formula" kind (grip x sin(C atan(B alpha))), turned round. A scene can
 *     add more front slip on top (`under`: the front ploughs). This is NOT the curve the app uses, and none of
 *     its numbers are shared with the app.
 *   - four wheel speeds: each wheel's own speed over the ground along the way it points; the rear ones times
 *     1 + `spin` (wheelspin under power), or all but locked with `hb` (the handbrake).
 *   - the vehicle speed the car reports: the true speed (speedFrom: 'cg'), or what the front wheels roll at
 *     ('front'), or the speed along the car's own length ('u'). Nobody knows which a car sends while sideways.
 *
 * SIGNS (the simulator's own, stated so that a test can compare): x forward, y to the LEFT, yaw rate and `lat`
 *   positive in a left-hand turn. beta is the angle of the way the car travels against the way it points,
 *   positive when it travels to the left of its nose. A script's `drift` is the angle a driver would name:
 *   positive = the nose points left of the way it travels (the tail is out to the right, as in a drift
 *   through a left-hand turn). So beta = -drift + the grip angle.
 *
 * WHAT THE SENSORS DO TO IT (class of faults, every number an option because none is known):
 *   roll      degrees of body roll per g: the acceleration sensor tilts with the body and reads part of gravity
 *   bank      a scene's road tilts sideways (degrees): the sensor reads part of gravity there too
 *   gain and zero errors of both accelerations; pitch (the forward one reads a share more)
 *   noise     on each source; `rough` in a scene shakes all three motion sensors (a bumpy road)
 *   the raw units: speed in steps of 1/64 km/h, acceleration in steps of 0.002 m/s2 (the kit's scaling), the
 *             yaw rate, the steering and the wheels in raw counts with a scale, sign and zero that differ from
 *             car to car (CARS.a, .b, .c) and that the app is not told
 *   a ceiling the yaw sensor cannot read past (yawCeil), a wheel angle the steering cannot go past (lock)
 *   delivery: each source on its own send grid (spacing, phase), sent only on change or every slot, late by a
 *             constant (delay) and by a random share of a slot (jitter), handed over in lumps (lump), lost
 *             for a stretch (gaps), one slot replaced by nonsense, and the app itself held up (holdups: what
 *             arrives meanwhile is stamped when the hold-up is over, and the app's own tick is late too).
 */
const { rng } = require('./dragsim');

const G0 = 9.80665, KMH = 3.6, DEG = Math.PI / 180;
const STEP = 0.001;                    // s: the truth's grid
const SOURCES = ['speed', 'lat', 'long', 'yaw', 'steer', 'pedal', 'wheels', 'hb'];

const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
/** 0 to 1 with no jerk at either end (a fifth-order ease). */
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * x * (x * (x * 6 - 15) + 10));

/* ---------- the script of a scene ---------- */

const START = { v: 60, lat: 0, drift: 0, bank: 0, spin: 0, pedal: 0.15, under: 0, rough: 0, hb: 0 };

/**
 * What the car does, as a list of moves. Channels: v km/h, lat g (+ = turning left), drift degrees (+ = nose
 * left of travel), bank degrees (+ = the road falls away to the left, as a banked left-hander does), spin
 * (rear wheelspin, 0.3 = 30 %), pedal 0..1, under degrees (extra front slip: the front ploughs), rough m/s2
 * (a bumpy road), hb 0 | 1 (handbrake).
 *   new Script({ v: 70 }).hold(3).to(1.2, { lat: 0.8, drift: 30 }).hold(5).to(1, { lat: 0, drift: 0 })
 */
class Script {
    constructor(start) { this.now = Object.assign({}, START, start); this.segs = []; this.T = 0; }
    to(sec, targets) {
        const from = Object.assign({}, this.now);
        Object.assign(this.now, targets);
        this.segs.push({ t0: this.T, t1: this.T + sec, from, to: Object.assign({}, this.now) });
        this.T += sec;
        return this;
    }
    hold(sec) { return this.to(sec, {}); }
}

/* ---------- the cars ---------- */

/**
 * Three made-up cars. What differs is what the app is not told: the raw units of the yaw rate, the steering,
 * the pedal and the wheels. `a` has the yaw scale the app states as its default before it has learned one.
 */
const BASE_CAR = {
    wheelbase: 2.85, front: 0.52,          // m; the share of the weight on the front axle
    track: 1.60,                           // m
    rearSlip: 2.4,                         // degrees of rear slip angle per g while the car grips
    grip: 1.05, tyreB: 13, tyreC: 1.45,    // the front tyre curve: grip x sin(C atan(B alpha))
    lock: 36,                              // degrees: the most the front wheels turn
    yawStep: 0.005, yawZero: 32768, yawSign: 1, yawCeil: 0,       // degrees a second per count; 0 = no ceiling
    steerStep: 0.01, steerZero: 32768, steerSign: 1, steerRatio: 1,   // degrees of the source per count; 1 = it is the wheels' own angle
    pedalFull: 3200,                       // raw at the floor
    wheelCount: 41.7,                      // raw per m/s of wheel speed
    speedFrom: 'cg',
};
const CARS = {
    a: Object.assign({}, BASE_CAR),
    b: Object.assign({}, BASE_CAR, { wheelbase: 2.69, front: 0.5, rearSlip: 1.8, grip: 0.98, tyreB: 11, tyreC: 1.6,
        yawStep: 0.0125, yawZero: 32000, yawSign: -1, steerStep: 0.04375, steerZero: 32767, steerSign: -1, steerRatio: 14.6, pedalFull: 2500, wheelCount: 17.9 }),
    c: Object.assign({}, BASE_CAR, { wheelbase: 2.97, front: 0.54, rearSlip: 3.0, grip: 1.1, tyreB: 15, tyreC: 1.35,
        yawStep: 0.004, yawZero: 30000, yawSign: 1, steerStep: 0.1, steerZero: 1000, steerSign: 1, steerRatio: 1, pedalFull: 4000, wheelCount: 104.2 }),
};

/** No sensor fault at all: the raw units and nothing else. */
const CLEAN = {
    roll: 0, pitch: 0, gainY: 1, zeroY: 0, gainX: 1, zeroX: 0, noiseY: 0, noiseX: 0,
    yawBias: 0, noiseYaw: 0, noiseSteer: 0, speedGain: 1, noiseWheel: 0,
};
/** A plausible set of sensor faults, all at once. */
const DIRTY = {
    roll: 4.2,                 // degrees per g
    pitch: 0.03,               // the forward acceleration reads this share more
    gainY: 1.012, zeroY: 0.14, gainX: 0.99, zeroX: -0.09,     // zero errors in m/s2
    noiseY: 0.07, noiseX: 0.07,                               // m/s2, one standard deviation
    yawBias: 0.18, noiseYaw: 0.12,                            // degrees a second
    noiseSteer: 0.06,                                         // degrees at the front wheels
    speedGain: 1.02,                                          // a speedometer that reads 2 % high
    noiseWheel: 0.003,                                        // share of the wheel's speed
};

/* ---------- the true motion ---------- */

/** The slip angle (rad) at which the sim's front tyre curve gives the share mu of the weight on it. */
function tyreSlip(mu, car) {
    const m = clamp(Math.abs(mu) / car.grip, 0, 0.985);
    const a = Math.tan(Math.asin(m) / car.tyreC) / car.tyreB;
    return mu < 0 ? -a : a;
}

class Truth {
    constructor(script, car) {
        this.car = car;
        const n = Math.round(script.T / STEP) + 1;
        this.n = n; this.T = script.T;
        const F = () => new Float64Array(n);
        const ch = {};
        Object.keys(START).forEach((k) => { ch[k] = F(); });
        let s = 0;
        for (let i = 0; i < n; i++) {
            const t = i * STEP;
            while (s + 1 < script.segs.length && t >= script.segs[s].t1) s++;
            const g = script.segs[s], x = ease((t - g.t0) / (g.t1 - g.t0));
            for (const k in ch) ch[k][i] = g.from[k] + (g.to[k] - g.from[k]) * x;
        }
        const L = car.wheelbase, b = L * car.front, a = L - b;      // a: front axle to the centre of gravity
        this.a = a; this.b = b;
        const V = F(), beta = F(), r = F(), ax = F(), ay = F(), delta = F(), rdot = F();
        for (let i = 0; i < n; i++) {
            V[i] = ch.v[i] / KMH;
            // (under 4 m/s the grip angle is faded out, and it is none at 1 m/s: a path has no curvature to speak of at a crawl)
            const lat = ch.lat[i] * G0, v2 = Math.max(V[i], 2) * Math.max(V[i], 2), fade = clamp((V[i] - 1) / 3, 0, 1);
            beta[i] = -ch.drift[i] * DEG + fade * (b * lat / v2 - car.rearSlip * DEG / G0 * lat);
        }
        const d = (A, i) => (i === 0 ? (A[1] - A[0]) / STEP : i === n - 1 ? (A[n - 1] - A[n - 2]) / STEP : (A[i + 1] - A[i - 1]) / (2 * STEP));
        // the path turns at lat / V (under 1 m/s that is run down to nothing with the speed, so that it has no step in it)
        for (let i = 0; i < n; i++) r[i] = ch.lat[i] * G0 * V[i] / (Math.max(V[i], 1) * Math.max(V[i], 1)) - d(beta, i);
        const u = F(), v = F();
        for (let i = 0; i < n; i++) { u[i] = V[i] * Math.cos(beta[i]); v[i] = V[i] * Math.sin(beta[i]); }
        for (let i = 0; i < n; i++) { ax[i] = d(u, i) - r[i] * v[i]; ay[i] = d(v, i) + r[i] * u[i]; rdot[i] = d(r, i); }
        const lock = car.lock * DEG;
        const wheels = { fl: F(), fr: F(), rl: F(), rr: F() };
        for (let i = 0; i < n; i++) {
            const turn = ch.lat[i] >= 0 ? 1 : -1;
            const alpha = tyreSlip((ay[i] + a * rdot[i]) / G0, car) + turn * ch.under[i] * DEG;
            delta[i] = clamp(beta[i] + a * r[i] / Math.max(V[i], 2) + alpha, -lock, lock);
            const h = car.track / 2, cd = Math.cos(delta[i]), sd = Math.sin(delta[i]);
            const front = (side) => Math.max(0, (u[i] - side * r[i] * h) * cd + (v[i] + a * r[i]) * sd);
            const rear = (side) => Math.max(0, u[i] - side * r[i] * h) * (ch.hb[i] > 0.5 ? 0.04 : 1 + ch.spin[i]);
            wheels.fl[i] = front(1); wheels.fr[i] = front(-1); wheels.rl[i] = rear(1); wheels.rr[i] = rear(-1);
        }
        Object.assign(this, { ch, V, beta, r, ax, ay, delta, wheels });
        // a bumpy road: the same shake every time, a handful of slow and quick waves
        const rand = rng(4711);
        this.waves = [];
        for (let k = 0; k < 9; k++) this.waves.push({ f: rand.between(2.5, 14), p: rand() * 2 * Math.PI, q: rand() * 2 * Math.PI, s: rand() * 2 * Math.PI });
    }

    _lin(A, ms) {
        const f = clamp(ms / 1000 / STEP, 0, this.n - 1), i = Math.min(this.n - 2, Math.floor(f));
        return A[i] + (A[i + 1] - A[i]) * (f - i);
    }
    /** The true motion at ms after the scene began. */
    at(ms) {
        return {
            V: this._lin(this.V, ms), beta: this._lin(this.beta, ms), r: this._lin(this.r, ms), ax: this._lin(this.ax, ms), ay: this._lin(this.ay, ms),
            delta: this._lin(this.delta, ms), drift: this._lin(this.ch.drift, ms), lat: this._lin(this.ch.lat, ms),
        };
    }
    /** The road's shake at ms, three numbers of about +-1 (for the sideways and the forward acceleration and the yaw rate). */
    shake(ms) {
        let y = 0, x = 0, w = 0;
        const t = ms / 1000;
        for (const k of this.waves) { y += Math.sin(2 * Math.PI * k.f * t + k.p); x += Math.sin(2 * Math.PI * k.f * t + k.q); w += Math.sin(2 * Math.PI * k.f * t + k.s); }
        return { y: y / 3, x: x / 3, w: w / 3 };
    }
}

/* ---------- what each source says ---------- */

function gauss(rand) { return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand()); }

/**
 * The readers of one car with one set of faults: { speed(ms) km/h, lat(ms) m/s2, long(ms) m/s2, yaw(ms) raw,
 * steer(ms) raw, pedal(ms) raw, wheels(ms) { fl, fr, rl, rr } raw, hb(ms) true | false }.
 * Speed and acceleration come scaled, as the app's car side scales them from their raw values (the kit's
 * scaling); the others raw, because their scaling is what the app has to learn.
 */
function readers(truth, car, faults, rand) {
    const f = Object.assign({}, CLEAN, faults), T = truth;
    const noise = (sd) => (sd > 0 ? sd * gauss(rand) : 0);
    const q = (x, step) => Math.round(x / step) * step;
    return {
        speed(ms) {
            const V = T._lin(T.V, ms), beta = T._lin(T.beta, ms);
            let s = V;
            if (car.speedFrom === 'u') s = V * Math.abs(Math.cos(beta));
            else if (car.speedFrom === 'front') s = (T._lin(T.wheels.fl, ms) + T._lin(T.wheels.fr, ms)) / 2;
            return Math.max(0, q(s * KMH * f.speedGain, 1 / 64));
        },
        lat(ms) {
            const ay = T._lin(T.ay, ms), roll = f.roll * DEG / G0 * ay, rough = T._lin(T.ch.rough, ms);
            const seen = ay * Math.cos(roll) + G0 * Math.sin(roll) - G0 * Math.sin(T._lin(T.ch.bank, ms) * DEG);
            return q(seen * f.gainY + f.zeroY + (rough ? rough * T.shake(ms).y : 0) + noise(f.noiseY), 0.002);
        },
        long(ms) {
            const rough = T._lin(T.ch.rough, ms);
            return q(T._lin(T.ax, ms) * (1 + f.pitch) * f.gainX + f.zeroX + (rough ? 0.6 * rough * T.shake(ms).x : 0) + noise(f.noiseX), 0.002);
        },
        yaw(ms) {
            const rough = T._lin(T.ch.rough, ms);
            let dps = T._lin(T.r, ms) / DEG + f.yawBias + (rough ? 1.2 * rough * T.shake(ms).w : 0) + noise(f.noiseYaw);
            if (car.yawCeil > 0) dps = clamp(dps, -car.yawCeil, car.yawCeil);
            return clamp(Math.round(car.yawZero + car.yawSign * dps / car.yawStep), 0, 65534);
        },
        steer(ms) {
            const deg = T._lin(T.delta, ms) / DEG + noise(f.noiseSteer);
            return clamp(Math.round(car.steerZero + car.steerSign * deg * car.steerRatio / car.steerStep), 0, 65534);
        },
        pedal(ms) { return clamp(Math.round(T._lin(T.ch.pedal, ms) * car.pedalFull), 0, 4094); },
        wheels(ms) {
            const one = (A) => clamp(Math.round(T._lin(A, ms) * car.wheelCount * (1 + noise(f.noiseWheel))), 0, 65534);
            return { fl: one(T.wheels.fl), fr: one(T.wheels.fr), rl: one(T.wheels.rl), rr: one(T.wheels.rr) };
        },
        hb(ms) { return T._lin(T.ch.hb, ms) > 0.5; },
    };
}

const same = (x, y) => (x && typeof x === 'object' ? !!y && x.fl === y.fl && x.fr === y.fr && x.rl === y.rl && x.rr === y.rr : x === y);

/**
 * Every source's samples for one scene, in the order the app gets them: [{ t, src, v, sent }].
 * o: spacing ms (every source, unless o.each names its own: { speed: { spacing: 100, onChange: true, delay: 20,
 *      jitter: 10, lump: 0, off: true (this source is not on the car) } }),
 *    onChange (false: every slot is sent), jitter (ms, each sample late by 0..jitter), delay (ms),
 *    faults (CLEAN | DIRTY | your own), rand, clock0 (the app clock at the scene's start),
 *    gaps { yaw: [{ at, ms }] } (samples sent in that stretch are lost), nonsense { yaw: [{ at, v }] } (the slot
 *    nearest to `at` reads v), holdups [{ at, ms }] (the app is held up: see the top)
 */
function sampleAll(truth, car, o) {
    o = Object.assign({ spacing: 50, onChange: false, jitter: 0, delay: 0, clock0: 100000, each: {}, gaps: {}, nonsense: {}, holdups: [] }, o || {});
    const rand = o.rand || rng(1), read = readers(truth, car, o.faults, rand), until = truth.T * 1000;
    let all = [], order = 0;
    for (const src of SOURCES) {
        const e = Object.assign({ spacing: o.spacing, onChange: src === 'hb' ? true : o.onChange, jitter: o.jitter, delay: o.delay, lump: 0, phase: rand() * 1000 }, o.each[src]);
        if (e.off) continue;
        const gaps = o.gaps[src] || [], bad = (o.nonsense[src] || []).map((x) => ({ slot: Math.round((x.at - e.phase % e.spacing) / e.spacing), v: x.v }));
        let lastSent;
        const first = e.phase % e.spacing;
        for (let k = 0; ; k++) {
            const ms = first + k * e.spacing;
            if (ms > until) break;
            let v = read[src](ms);
            const b = bad.find((x) => x.slot === k);
            if (b) v = b.v;
            if (e.onChange && lastSent !== undefined && same(v, lastSent)) continue;
            lastSent = v;
            if (gaps.some((g) => ms >= g.at && ms < g.at + g.ms)) continue;
            let t = ms + e.delay + (e.jitter > 0 ? rand() * e.jitter : 0);
            if (e.lump > 0) t = Math.ceil(t / e.lump) * e.lump;
            all.push({ t, src, v, sent: ms, order: order++ });
        }
    }
    for (const ev of all) for (const h of o.holdups) if (ev.t >= h.at && ev.t < h.at + h.ms) ev.t = h.at + h.ms;
    all.sort((x, y) => x.t - y.t || x.sent - y.sent || x.order - y.order);
    // one handler after another, each stamped when it runs: never two at the same instant, never backwards
    let lastT = -Infinity;
    for (const ev of all) { let t = ev.t; if (t <= lastT) t = lastT + 0.01; lastT = t; ev.t = o.clock0 + t; ev.sent += o.clock0; delete ev.order; }
    return all;
}

/**
 * Hand events to an engine as the app does: each at its time, engine.idle(now) every o.idle ms (50) in between.
 * A tick that falls into a hold-up runs once when it is over, as a timer does. o.onTick(now) after every idle().
 * The engine's methods are named after the sources: speed, lat, long, yaw, steer, pedal, wheels, hb (each (t, v)).
 */
function drive(engine, events, o) {
    o = Object.assign({ idle: 50, idlePhase: 0, holdups: [], clock0: 100000, tail: 400 }, o || {});
    if (!events.length) return;
    const end = o.until !== undefined ? o.until : events[events.length - 1].t + o.tail;
    let tick = Math.floor(events[0].t / o.idle) * o.idle + o.idlePhase, i = 0, heldUntil = -Infinity;
    while (i < events.length || tick <= end) {
        let now = tick;
        const h = o.holdups.find((x) => tick - o.clock0 >= x.at && tick - o.clock0 < x.at + x.ms);
        if (h) now = o.clock0 + h.at + h.ms + 5;            // (what waited is handled first, a few ms in all)
        const st = i < events.length ? events[i].t : Infinity;
        if (st <= now) { const ev = events[i++]; if (typeof engine[ev.src] === 'function') engine[ev.src](ev.t, ev.v); continue; }
        if (tick > end) break;
        if (now > heldUntil) { engine.idle(now); if (o.onTick) o.onTick(now); }
        if (h) heldUntil = now;
        tick += o.idle;
    }
}

/* ---------- the scenes ---------- */

/**
 * The scenes, by name. Each returns a Script. `drifts`: how many drifts a careful judge would count in it
 * (0: the scene must score nothing), `about`: one line for the tables.
 */
const SCENES = {
    ordinary: {
        about: 'ordinary driving: 3.5 minutes, corners both ways, two stops, nothing slides', drifts: 0,
        make() {
            const s = new Script({ v: 0 });
            s.hold(2.5).to(5, { v: 55, pedal: 0.4 }).hold(2);
            const corners = [[0.32, 50, 3], [-0.28, 62, 2.5], [0.4, 70, 4], [-0.45, 58, 3], [0.22, 85, 5], [-0.3, 78, 3.5], [0.5, 48, 2.5], [-0.38, 66, 4],
                [0.26, 95, 3], [-0.24, 90, 4], [0.44, 54, 3], [-0.5, 46, 3.5], [0.3, 72, 2.5], [-0.34, 64, 3], [0.18, 100, 4], [-0.42, 52, 3],
                [0.36, 60, 3.5], [-0.27, 82, 3], [0.47, 44, 2.5], [-0.31, 74, 4]];
            corners.forEach((c, i) => {
                s.to(Math.max(1.6, Math.abs(c[1] - s.now.v) / 9), { v: c[1], pedal: 0.2 }).to(1.3, { lat: c[0] }).hold(c[2]).to(1.2, { lat: 0, pedal: 0.35 }).hold(1.4 + (i % 3) * 0.7);
                if (i === 9) s.to(7, { v: 0, pedal: 0 }).hold(3).to(5, { v: 50, pedal: 0.4 }).hold(1.5);
            });
            return s.to(7, { v: 0, pedal: 0 }).hold(2);
        },
    },
    gentle: {
        about: 'slow, gentle corners both ways (what the steering scale is learned from)', drifts: 0,
        make() {
            const s = new Script({ v: 30 }).hold(2);
            [[0.16, 28, 3], [-0.14, 34, 3], [0.2, 40, 2.5], [-0.22, 26, 3], [0.12, 45, 3], [-0.18, 38, 2.5], [0.24, 24, 3], [-0.16, 42, 3],
                [0.15, 32, 3], [-0.2, 30, 3], [0.19, 36, 2.5], [-0.13, 44, 3]].forEach((c) => {
                s.to(Math.max(1.2, Math.abs(c[1] - s.now.v) / 7), { v: c[1] }).to(1.2, { lat: c[0] }).hold(c[2]).to(1.2, { lat: 0 }).hold(1.2);
            });
            return s.hold(1);
        },
    },
    held: {
        about: 'a held drift: 30 degrees through a left-hander for 5 s, power on', drifts: 1,
        make() {
            return new Script({ v: 72 }).hold(3).to(1.3, { lat: 0.78, drift: 30, spin: 0.35, pedal: 0.7, v: 68 }).to(5, { v: 62 })
                .to(1.1, { lat: 0, drift: 0, spin: 0, pedal: 0.3 }).to(3, { v: 66 });
        },
    },
    right: {
        about: 'the same held drift through a right-hander, 22 degrees', drifts: 1,
        make() {
            return new Script({ v: 64 }).hold(3).to(1.2, { lat: -0.74, drift: -22, spin: 0.25, pedal: 0.6 }).to(4, { v: 58 })
                .to(1, { lat: 0, drift: 0, spin: 0, pedal: 0.3 }).hold(3);
        },
    },
    circle: {
        about: 'a long circle on a wet pan: 35 degrees at 45 km/h for 25 s', drifts: 1,
        make() {
            const s = new Script({ v: 40 }).hold(3).to(2, { lat: 0.52, drift: 35, spin: 0.5, pedal: 0.55, v: 45 });
            for (let i = 0; i < 5; i++) s.to(2.5, { drift: 38, v: 46 }).to(2.5, { drift: 33, v: 44 });
            return s.to(1.5, { lat: 0, drift: 0, spin: 0, pedal: 0.2 }).hold(3);
        },
    },
    switches: {
        about: 'three drifts joined by two changes of direction, 30 degrees each way', drifts: 1,
        make() {
            return new Script({ v: 75 }).hold(3).to(1.2, { lat: 0.8, drift: 30, spin: 0.3, pedal: 0.7 }).to(2.4, { v: 70 })
                .to(1.1, { lat: -0.8, drift: -30 }).to(2.4, { v: 66 }).to(1.1, { lat: 0.8, drift: 28 }).to(2.2, { v: 62 })
                .to(1.1, { lat: 0, drift: 0, spin: 0, pedal: 0.3 }).hold(3);
        },
    },
    spin: {
        about: 'a drift that goes round: past 100 degrees while the car comes to a stop', drifts: 1,
        make() {
            return new Script({ v: 70 }).hold(3).to(1.2, { lat: 0.8, drift: 32, spin: 0.4, pedal: 0.8 }).to(1.5, { v: 62 })
                .to(2, { drift: 150, v: 22, lat: 0.5, spin: 0.1, pedal: 0 }).to(1.4, { drift: 178, v: 0, lat: 0 }).hold(3);
        },
    },
    handbrake: {
        about: 'a handbrake entry at 60 km/h: 40 degrees within 0.7 s, held 2.5 s', drifts: 1,
        make() {
            return new Script({ v: 62 }).hold(3).to(0.25, { hb: 1, pedal: 0 }).to(0.7, { lat: 0.7, drift: 40, v: 54 }).to(0.2, { hb: 0, pedal: 0.7, spin: 0.3 })
                .to(2.5, { v: 48, drift: 34 }).to(1, { lat: 0, drift: 0, spin: 0, pedal: 0.3 }).hold(3);
        },
    },
    lanechange: {
        about: 'a quick lane change at 85 km/h, the tyres gripping', drifts: 0,
        make() { return new Script({ v: 85 }).hold(3).to(0.45, { lat: 0.55 }).to(0.7, { lat: -0.55 }).to(0.45, { lat: 0 }).hold(4); },
    },
    slalom: {
        about: 'a slalom at 60 km/h: 0.6 g each way, six times', drifts: 0,
        make() {
            const s = new Script({ v: 60 }).hold(3).to(0.5, { lat: 0.6 });
            for (let i = 0; i < 5; i++) s.to(1, { lat: i % 2 ? 0.6 : -0.6 });
            return s.to(0.5, { lat: 0 }).hold(4);
        },
    },
    understeer: {
        about: 'plain understeer: the front ploughs through a corner, the rear grips', drifts: 0,
        make() {
            return new Script({ v: 88 }).hold(3).to(1, { lat: 0.82, under: 4 }).to(0.8, { under: 13, v: 82, pedal: 0.5 }).to(3, { v: 66, lat: 0.78 })
                .to(1.2, { lat: 0, under: 0 }).hold(3);
        },
    },
    bumpy: {
        about: 'a bumpy straight at 70 km/h', drifts: 0,
        make() { return new Script({ v: 70 }).hold(2).to(0.5, { rough: 2.6 }).hold(10).to(0.5, { rough: 0 }).hold(3); },
    },
    braking: {
        about: 'hard braking in a straight line, 120 to 25 km/h, up to about 1 g', drifts: 0,
        make() { return new Script({ v: 120 }).hold(3).to(4.7, { v: 25, pedal: 0, rough: 0.5 }).to(0.5, { rough: 0 }).hold(3); },
    },
    banked: {
        about: 'a banked corner: 12 degrees of bank, 0.6 g at 100 km/h for 8 s, the tyres gripping', drifts: 0,
        make() { return new Script({ v: 100 }).hold(3).to(1.5, { lat: 0.6, bank: 12 }).hold(8).to(1.5, { lat: 0, bank: 0 }).hold(4); },
    },
    roundabout: {
        about: 'a long ordinary corner: 0.5 g at 40 km/h for 14 s, the tyres gripping', drifts: 0,
        make() { return new Script({ v: 40 }).hold(3).to(1.5, { lat: 0.5 }).hold(14).to(1.5, { lat: 0 }).hold(4); },
    },
};

/** The Script of a scene by name. */
function scene(name) {
    if (!SCENES[name]) throw new Error('no scene ' + name);
    return SCENES[name].make();
}

module.exports = { Truth, Script, scene, SCENES, CARS, CLEAN, DIRTY, readers, sampleAll, drive, rng, tyreSlip, SOURCES, G0, KMH, DEG };
