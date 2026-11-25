'use strict';
/**
 * drift.js - Proven Drift: when a drift starts, goes on and ends, what is kept of it, and the engine that
 * ties the parts together. Pure logic: stamped samples in; the angle, the state, the running score and
 * finished drifts out. It touches neither the car nor the wall clock, and no position ever comes near it.
 *
 *   const eng = new DriftEngine({ startDeg: 10, endDeg: 6, minKmh: 20, wheelbase: 2.85, front: 0.5, useSteer: true,
 *                                 useLong: true (false: the forward acceleration is left out, as on a car that sends none),
 *                                 yawKey: 'cds2', steerKey: 'front', saved: <what learn.export() gave>, demo: false,
 *                                 speedMaxAgeMs: 0 (set it where the speed's getter is read on a schedule: a speed older than this is lost),
 *                                 yawMaxAgeMs: 0, latMaxAgeMs: 0 (the same for the yaw rate and the sideways acceleration, on the move),
 *                                 onDrift: (record) => ..., onStart: () => ..., onSwitch: () => ..., onLearned: (what, state) => ... });
 *   eng.speed(t, kmh)  eng.lat(t, ms2)  eng.long(t, ms2)      t: ms on a clock that only runs forward (process.hrtime)
 *   eng.yaw(t, raw)  eng.steer(t, raw)  eng.pedal(t, raw)     raw counts as the car sends them
 *   eng.wheels(t, { fl, fr, rl, rr })  eng.hb(t, true | false | null)
 *   eng.idle(now)             every 50 ms
 *   eng.view()                what the screen needs right now (see view())
 *   eng.learn                 the Learn object: status() for the Signals tab, export() for the saved file, reset()
 *   eng.configure({ startDeg, endDeg, minKmh, wheelbase, front, useSteer, useLong, yawKey, steerKey, demo, speedMaxAgeMs, yawMaxAgeMs, latMaxAgeMs })
 *
 * A DRIFT STARTS when the angle is at or above the start angle (10 degrees unless set) for 0.3 s, at or above
 * the minimum speed (20 km/h), with the nose pointing into the turn: the angle and the yaw rate have opposite
 * signs (angle.js: in a left-hander the yaw rate is positive and the angle negative), the car is turning by
 * 2 degrees a second or more, and, where the steering is known, the car turns more than its steering asks
 * for; where it is not, the acceleration check (angle.js) must not speak against it where it is strong
 * enough to pull. That held for most of the 0.3 s. The drift counts from the moment the angle first
 * reached the start angle.
 * WITHOUT STEERING a banked or a climbing corner taken with full grip sums up to an angle too, and nothing
 * here can tell it from a slide. Two things follow.
 *   - Where the acceleration check SPEAKS AGAINST the angle, no drift starts: of the time since the start
 *     angle in which the check could speak, it must have SEEN the angle (the same side, 0.4 of it or more)
 *     for half. A drift waits for that, a second at most, and still counts from where it began; then it
 *     is dropped and may begin again. Where the check cannot speak at all (under 1.5 m/s2 felt sideways:
 *     low grip, a large angle, a gentle banked corner; or a car with no forward acceleration) the drift
 *     starts on the sum.
 *   - Whatever started that way is flagged NO STEERING CHECK (below) and is no best. The acceleration
 *     check helps the angle; it vouches for nothing.
 * NOTHING STARTS while the yaw rate's scale is the stated default alone (learn.js: "none"): on a car whose
 * scale is another, that angle means nothing, and view() does not show it. When a first line is drawn
 * ("learning") angle.js drops the angle that was summed until then, and nothing starts until the car has
 * gone straight. From then on drifts are counted and flagged UNCALIBRATED until it is "learned".
 * IT GOES ON THROUGH A CHANGE OF DIRECTION (a switch) if the angle crosses zero and reaches the start angle on
 * the other side within 1 s of the crossing.
 * IT ENDS when the angle has stayed under the end angle (6 degrees) for 0.6 s, or did not reach the start
 * angle within 1 s of crossing zero (in both cases it ends at the moment it went under the end angle: the
 * time after that is not counted), or when the speed falls under the minimum.
 * A SPIN: the angle passes 100 degrees; or, within 1.5 s of the speed falling under the minimum, the car is
 * under 10 km/h (where the angle is no longer defined) and was still 25 degrees or more sideways when the
 * angle was last defined. A spin keeps half its points (score.js) and is flagged.
 * IF THE ANGLE IS LOST while a drift runs (angle.js: a source gone silent or too old, or what was learned
 * changed under the sum), the drift ends there, flagged DATA GAP, and nothing starts until the car has
 * gone straight.
 * NOTHING STARTS UNTIL THE CAR HAS GONE STRAIGHT (at rest, angle.js: 0.7 s), after a spin, after an angle
 * that was lost, and after what was learned changed under the sum. view() says so (blocked), and the
 * screen tells the driver. Coming under 10 km/h lifts it as well.
 *
 * FLAGS (any flag keeps a drift from being a best, as in Proven Drag):
 *   UNCALIBRATED   the yaw rate's scale was not learned (learn.js) at some moment of the drift
 *   ANGLE UNSURE   the angle's +- over the drift was, on average, more than a fifth of the drift's peak angle
 *                  (but 7 degrees are always allowed, and more than 10 never: clean data alone settles at 5
 *                  to 6.5)
 *   NO STEERING CHECK   for less than half of the drift's time did the steering BACK it. It backs a drift
 *                  at a moment when it can be used (angle.js, sw: switched on, there, neither silent nor
 *                  stuck, its scale learned) and says that the car oversteers: the car turns 1.5 degrees or more, at
 *                  the front wheels, further than it is steered, and at least half of what its path asks
 *                  of the wheels. A car that grips through a banked or climbing corner is steered as far
 *                  as its path asks, so this is what tells the two apart. On a car that gives no usable
 *                  steering angle every drift carries this flag, and none is a best
 *   DATA GAP       a hole of 350 ms or more in the yaw rate, the sideways acceleration or the speed, the yaw
 *                  rate stuck at the end of its raw range, or the app held up for 300 ms or more, during
 *                  the drift or in the 3 s before it began; or the angle lost
 *   LOW DATA RATE  the slower of yaw rate and sideways acceleration came less than 8 times a second (its
 *                  usual spacing, averaged over the drift, was more than 125 ms)
 *   SPIN, DEMO
 *
 * FIGURES THAT ARE GUESSES: every number above; the trace keeps one point every 100 ms and halves itself
 * when it reaches 240 points; peak sideways g is the largest average over 0.2 s; the handbrake counts as
 * "seen at the start" if it was on at any time from 1.5 s before the drift began to 0.5 s after; wheelspin
 * (rear over front wheel speed against their usual ratio, over the cosine of the angle) is only read above
 * 15 km/h.
 */
const { Angle, DEG, TABLE } = require('./angle');
const { Learn } = require('./learn');
const { Score } = require('./score');
const { Series, isNum } = require('./series');

const RULE = {
    START_MS: 300, END_MS: 600, SWITCH_MS: 1000,
    SPIN_DEG: 100, SPIN_SIDE_DEG: 25, SLOW_WATCH_MS: 1500,
    UNSURE_SHARE: 0.2, UNSURE_MIN_DEG: 7, UNSURE_MAX_DEG: 10,
    ACC_SHARE: 0.4, SEEN_SHARE: 0.5, SEEN_WAIT_MS: 1000,
    BACK_SHARE: 0.5, BACK_OVER: 0.5,
    GAP_MS: 300, GAP_BEFORE_MS: 3000, LOW_RATE_MS: 125,
    TRACE_MS: 100, TRACE_MAX: 240,
    PEAK_G_MS: 200,
    HB_BEFORE_MS: 1500, HB_AFTER_MS: 500,
    WHEEL_KMH: 15,
    LOOK_MS: 250, LOOK_SPAN_MS: 1000,
    SLIDING_DEG: 4,
    SHOW_MS: 4000,                 // how long view() says that a drift has just ended, or just switched
};
const G0 = 9.80665;
const FLAGS = { UNCAL: 'UNCALIBRATED', UNSURE: 'ANGLE UNSURE', STEER: 'NO STEERING CHECK', GAP: 'DATA GAP', RATE: 'LOW DATA RATE', SPIN: 'SPIN', DEMO: 'DEMO' };

const round = (x, n) => { const f = Math.pow(10, n || 0); return Math.round(x * f) / f; };

/** Does the acceleration check (angle.js) see the angle: it can speak, on the same side, and shows RULE.ACC_SHARE of it at least. */
const accSees = (s) => s.acc !== null && s.acc * s.beta > 0 && Math.abs(s.acc) >= RULE.ACC_SHARE * Math.abs(s.beta);

/**
 * Does the steering back the drift at this step? It must be usable (angle.js: switched on, there, learned, neither
 * silent nor stuck), and it must say that the car oversteers: the car turns TABLE.OVER_ON_DEG or more (at the front wheels)
 * further than it is steered, and at least RULE.BACK_OVER of what its path asks of the wheels (so the wheels are
 * turned less than half as far into the turn as a car that grips would need there, or against it). A car that grips
 * through a banked or a climbing corner is steered as far as its path asks, whatever its accelerations read. The
 * share is there because a steering scale that was learned too small makes every tight corner look like a little
 * oversteer.
 */
function backs(s) {
    if (s.sw !== null || s.over === null || s.d === null || Math.abs(s.r) < TABLE.TURN_MIN_DPS * DEG) return false;
    const path = s.over + (s.r > 0 ? 1 : -1) * s.d;            // what the path asks of the wheels: wheelbase x yaw rate / speed
    return s.over > Math.max(TABLE.OVER_ON_DEG * DEG, RULE.BACK_OVER * path);
}

/** May this finished drift be a best? Any flag says no. */
function canBeBest(record) { return !!record && Array.isArray(record.flags) && record.flags.length === 0 && record.score > 0; }

/**
 * The drift's bookkeeping. step(s, x) for every step of the angle (angle.js), x = { left (1 | -1), wheelspin
 * (share) | null, pedal (0..1) | null, hbAt (ms the handbrake was last seen on) | null }.
 */
class Tracker {
    constructor(o) {
        this.o = Object.assign({ startDeg: 10, endDeg: 6, minKmh: 20, demo: false }, o);
        this.cur = null;            // the drift that is running, or one that may become one
        this.state = 'off';         // 'off' (no angle) | 'ready' | 'drift'
        this.why = 'nodata';
        this.last = null; this.lastAt = null; this.switchAt = null;
        this.count = 0; this.block = false; this.gapSeen = null;
    }

    configure(c) { Object.assign(this.o, c); }

    _begin(s, deg, x) {
        return {
            t0: s.t, confirmed: false, side: deg < 0 ? -1 : 1, first: deg < 0 ? -1 : 1, left: x.left,
            score: new Score(), switches: 0, cross: null, under: null, snap: null, slow: null,
            time: 0, dist: 0, sumAbs: 0, sumKmh: 0, sumPm: 0, pmMax: 0, back: 0, peak: 0, entry: s.kmh, minKmh: s.kmh,
            peakG: 0, gWin: [], peakYaw: 0, opp: null, pedalSum: 0, pedalTime: 0, wheelspin: null,
            hb: x.hbAt !== null && s.t - x.hbAt <= RULE.HB_BEFORE_MS ? true : x.hbKnown ? false : null,
            uncal: false, gap: 0, slotSum: 0, slotTime: 0, lastDeg: deg, steps: 0, nose: 0, seen: 0, can: 0,
            trace: { ms: RULE.TRACE_MS, a: [], v: [], next: s.t },
        };
    }

    _add(c, s, deg, x, h) {
        const abs = Math.abs(deg);
        c.score.step(h, deg, s.kmh, s.t);
        c.time += h; c.dist += s.kmh / 3.6 * h; c.sumAbs += abs * h; c.sumKmh += s.kmh * h; c.sumPm += s.pm * h;
        if (s.pm > c.pmMax) c.pmMax = s.pm;
        if (backs(s)) c.back += h;
        if (abs > c.peak) c.peak = abs;
        if (s.kmh < c.minKmh) c.minKmh = s.kmh;
        // peak sideways g: the largest average over 0.2 s
        c.gWin.push({ t: s.t, a: Math.abs(s.ay) });
        while (c.gWin.length > 1 && s.t - c.gWin[0].t > RULE.PEAK_G_MS) c.gWin.shift();
        if (s.t - c.gWin[0].t >= RULE.PEAK_G_MS * 0.6 || c.time * 1000 < RULE.PEAK_G_MS) {
            let sum = 0;
            for (const g of c.gWin) sum += g.a;
            const mean = sum / c.gWin.length / G0;
            if (mean > c.peakG) c.peakG = mean;
        }
        const yaw = Math.abs(s.r) / DEG;
        if (yaw > c.peakYaw) c.peakYaw = yaw;
        if (s.d !== null) { const opp = -(s.r > 0 ? 1 : -1) * s.d / DEG; if (c.opp === null || opp > c.opp) c.opp = opp; }
        if (x.pedal !== null) { c.pedalSum += x.pedal * h; c.pedalTime += h; }
        if (x.wheelspin !== null && (c.wheelspin === null || x.wheelspin > c.wheelspin)) c.wheelspin = x.wheelspin;
        if (x.hbAt !== null && s.t - c.t0 <= RULE.HB_AFTER_MS && x.hbAt >= c.t0 - RULE.HB_BEFORE_MS) c.hb = true;
        if (s.state !== 'learned') c.uncal = true;
        if (s.gap > c.gap) c.gap = s.gap;
        if (isNum(s.slot)) { c.slotSum += s.slot * h; c.slotTime += h; }
        c.lastDeg = deg;
        const tr = c.trace;
        if (s.t >= tr.next) {
            tr.a.push(Math.round(deg * c.left)); tr.v.push(Math.round(s.kmh)); tr.next += tr.ms;
            if (tr.a.length >= RULE.TRACE_MAX) {
                tr.a = tr.a.filter((_, i) => i % 2 === 0); tr.v = tr.v.filter((_, i) => i % 2 === 0); tr.ms *= 2;
            }
        }
    }

    /** The numbers that are put back if the drift turns out to have ended a moment ago. */
    _snapshot(c) {
        return { time: c.time, dist: c.dist, sumAbs: c.sumAbs, sumKmh: c.sumKmh, sumPm: c.sumPm, back: c.back, points: c.score.points, stime: c.score.time, smoothSum: c.score.smoothSum, n: c.trace.a.length };
    }
    _restore(c, p) {
        if (!p) return;
        c.time = p.time; c.dist = p.dist; c.sumAbs = p.sumAbs; c.sumKmh = p.sumKmh; c.sumPm = p.sumPm; c.back = p.back;
        c.score.points = p.points; c.score.time = p.stime; c.score.smoothSum = p.smoothSum;
        c.trace.a.length = Math.min(c.trace.a.length, p.n); c.trace.v.length = Math.min(c.trace.v.length, p.n);
    }

    step(s, x) {
        const o = this.o, c = this.cur;
        if (!s.ok) {
            if (c && c.confirmed) {
                // under 10 km/h (the angle is no longer defined): the drift ends; a car that all but stops while still sideways has spun
                if (s.why === 'slow') this._finish(c, s.t, Math.abs(c.lastDeg) >= RULE.SPIN_SIDE_DEG ? 'spin' : 'slow');
                else { c.gap = Math.max(c.gap, RULE.GAP_MS); this._finish(c, s.t, 'lost'); }
            }
            this.cur = null; this.state = 'off'; this.why = s.why;
            if (s.why === 'slow') this.block = false;
            return;
        }
        this.why = null;
        // what was learned about the yaw rate changed under the angle (angle.js): a drift that runs ends there, flagged,
        // and nothing starts until the car has gone straight again
        if (s.lost) {
            if (c && c.confirmed) { c.gap = Math.max(c.gap, RULE.GAP_MS); this._finish(c, s.t, 'lost'); }
            this.cur = null; this.state = 'ready'; this.block = true;
            return;
        }
        if (s.gap >= RULE.GAP_MS) this.gapSeen = { t: s.t, ms: s.gap };
        const deg = s.beta / DEG, abs = Math.abs(deg), side = deg < 0 ? -1 : 1;
        // the nose points into the turn; the steering agrees (the car turns more than it is steered); without steering
        // the acceleration check agrees where it is strong enough to pull (the same side, and RULE.ACC_SHARE of the angle at least)
        const sees = accSees(s), noseIn = s.beta * s.r < 0 && Math.abs(s.r) >= TABLE.TURN_MIN_DPS * DEG && (s.over !== null ? s.over > 0 : !s.accStrong || sees);
        if (!c) {
            this.state = 'ready';
            // after a spin, or an angle that was lost, nothing starts until the car has gone straight again
            if (this.block) { if (s.rest && s.anchored) this.block = false; else return; }
            // (and nothing is counted on the stated default alone: it is right for no car that anybody has checked)
            if (abs >= o.startDeg && s.kmh >= o.minKmh && noseIn && s.state !== 'none') {
                this.cur = this._begin(s, deg, x); this.cur.prev = s.t;
                // (a gap just before the drift began is in the angle it begins with)
                if (this.gapSeen && s.t - this.gapSeen.t <= RULE.GAP_BEFORE_MS) this.cur.gap = this.gapSeen.ms;
            }
            return;
        }
        const h = Math.max(0, s.t - c.prev) / 1000;
        c.prev = s.t;
        if (!c.confirmed) {
            if (abs < o.startDeg || s.kmh < o.minKmh || side !== c.side) { this.cur = null; this.state = 'ready'; return; }
            this._add(c, s, deg, x, h);
            c.steps++; if (noseIn) c.nose++;
            if (s.acc !== null) c.can += h * 1000;
            if (sees) c.seen += h * 1000;
            if (s.t - c.t0 >= RULE.START_MS) {
                // (the nose pointed into the turn for most of that moment)
                if (c.nose * 2 < c.steps) { this.cur = null; this.state = 'ready'; return; }
                // Without steering: where the acceleration check could speak since the start angle and, for more than half of
                // that time, did not see the angle, it speaks against a slide (a banked corner sums up to an angle too). The
                // drift waits for it to come round, a second at most, and still counts from where it began. Where the check
                // cannot speak at all (too little sideways acceleration: low grip, a large angle), the drift starts on the sum.
                // Either way it is flagged in _finish: nothing that the steering did not back can be a best.
                if (s.over === null && s.hasAx && c.seen < RULE.SEEN_SHARE * c.can) {
                    if (s.t - c.t0 >= RULE.SEEN_WAIT_MS) { this.cur = null; this.state = 'ready'; }
                    return;
                }
                c.confirmed = true; this.state = 'drift';
                if (o.onStart) o.onStart();
            }
            return;
        }
        // a drift is running
        if (c.slow) {
            // the speed fell under the minimum: the drift is over; is the car coming to a stop sideways? (see above)
            if (s.kmh >= o.minKmh || abs < o.endDeg || s.t - c.slow >= RULE.SLOW_WATCH_MS) return this._finish(c, s.t, 'slow');
            c.lastDeg = deg;
            return;
        }
        if (abs >= RULE.SPIN_DEG) { this._add(c, s, deg, x, h); return this._finish(c, s.t, 'spin'); }
        if (s.kmh < o.minKmh) { c.slow = s.t; c.lastDeg = deg; return; }
        if (abs < o.endDeg) { if (c.under === null) { c.under = s.t; c.snap = this._snapshot(c); } } else if (side === c.side) { c.under = null; c.snap = null; }
        if (side !== c.side) {
            if (c.cross === null) c.cross = s.t;
            if (abs >= o.startDeg) {
                // a switch: the drift goes on the other way
                c.side = side; c.cross = null; c.under = null; c.snap = null; c.switches++;
                c.score.switched(); this.switchAt = s.t;
                if (o.onSwitch) o.onSwitch();
            } else if (s.t - c.cross > RULE.SWITCH_MS) { this._restore(c, c.snap); return this._finish(c, c.under === null ? s.t : c.under, 'ended'); }
        } else c.cross = null;
        // (while the angle is on its way through zero the switch rule decides, not this one)
        if (c.under !== null && c.cross === null && s.t - c.under >= RULE.END_MS) { this._restore(c, c.snap); return this._finish(c, c.under, 'ended'); }
        this._add(c, s, deg, x, h);
    }

    _finish(c, t, end) {
        const o = this.o, spin = end === 'spin', sc = c.score.finish(spin), flags = [];
        const pm = c.time > 0 ? c.sumPm / c.time : c.pmMax;
        const slot = c.slotTime > 0 ? c.slotSum / c.slotTime : null;
        if (c.uncal) flags.push(FLAGS.UNCAL);
        if (pm > Math.min(RULE.UNSURE_MAX_DEG, Math.max(RULE.UNSURE_MIN_DEG, RULE.UNSURE_SHARE * c.peak))) flags.push(FLAGS.UNSURE);
        // (for less than half of the drift's time did the steering back it: nothing tells it from a banked or climbing corner)
        if (c.back < RULE.BACK_SHARE * c.time || !(c.time > 0)) flags.push(FLAGS.STEER);
        if (c.gap >= RULE.GAP_MS || end === 'lost') flags.push(FLAGS.GAP);
        if (slot !== null && slot > RULE.LOW_RATE_MS) flags.push(FLAGS.RATE);
        if (spin) flags.push(FLAGS.SPIN);
        if (o.demo) flags.push(FLAGS.DEMO);
        const dir = (side) => (side * c.left < 0 ? 'L' : 'R');
        const record = {
            score: sc.score, grade: sc.grade, end, flags,
            peak: round(c.peak, 1), avg: round(c.time > 0 ? c.sumAbs / c.time : c.peak, 1), dir: dir(c.first), switches: c.switches,
            time: round(c.time, 2), dist: round(c.dist, 1),
            entry: round(c.entry, 1), avgKmh: round(c.time > 0 ? c.sumKmh / c.time : c.entry, 1), minKmh: round(c.minKmh, 1),
            peakG: round(c.peakG, 2), peakYaw: round(c.peakYaw, 1),
            opp: c.opp === null ? null : round(Math.max(0, c.opp), 1),
            pedal: c.pedalTime > 0 ? round(100 * c.pedalSum / c.pedalTime) : null,
            wheelspin: c.wheelspin === null ? null : round(100 * Math.max(0, c.wheelspin)),
            handbrake: c.hb,
            pm: round(pm, 1), pmMax: round(c.pmMax, 1), back: c.time > 0 ? round(100 * Math.min(1, c.back / c.time)) : 0,
            mult: sc.mult, smooth: sc.smooth, reversals: sc.reversals,
            rate: slot === null ? null : round(1000 / slot, 1), gap: Math.round(c.gap),
            trace: { ms: c.trace.ms, a: c.trace.a.slice(), v: c.trace.v.slice() },
        };
        this.cur = null; this.state = 'ready';
        if (spin || end === 'lost') this.block = true;
        this.last = record; this.lastAt = t; this.count++;
        if (o.onDrift) o.onDrift(record);
    }

    /** The running drift for the screen, or null. */
    running(t) {
        const c = this.cur;
        if (!c || !c.confirmed) return null;
        return { score: Math.round(c.score.points), mult: round(c.score.mult(), 2), smooth: c.score.smooth(t), time: round(c.time, 1), switches: c.switches, peak: round(c.peak, 1), dist: round(c.dist, 1) };
    }
}

class DriftEngine {
    constructor(o) {
        this.o = Object.assign({ startDeg: 10, endDeg: 6, minKmh: 20, wheelbase: 2.85, front: 0.5, useSteer: true, useLong: true, demo: false }, o);
        this.learn = new Learn({ saved: this.o.saved, yawKey: this.o.yawKey, steerKey: this.o.steerKey, onChange: (what, state) => { if (this.o.onLearned) this.o.onLearned(what, state); } });
        this.angle = new Angle({ wheelbase: this.o.wheelbase, front: this.o.front, useSteer: this.o.useSteer, useLong: this.o.useLong, speedMaxAgeMs: this.o.speedMaxAgeMs || 0, yawMaxAgeMs: this.o.yawMaxAgeMs || 0, latMaxAgeMs: this.o.latMaxAgeMs || 0,
            learned: () => this.learn.values(), onStep: (s) => this._onStep(s) });
        this.tracker = new Tracker({ startDeg: this.o.startDeg, endDeg: this.o.endDeg, minKmh: this.o.minKmh, demo: this.o.demo,
            onDrift: (r) => { if (this.o.onDrift) this.o.onDrift(r); }, onStart: () => { if (this.o.onStart) this.o.onStart(); }, onSwitch: () => { if (this.o.onSwitch) this.o.onSwitch(); } });
        this.rfS = new Series({ keepMs: 4000, lo: 0.05, hi: 20 });      // rear wheels over front wheels
        this.lrS = new Series({ keepMs: 4000, lo: -1, hi: 1 });         // log of front right over front left
        this.pedalShare = null; this.pedalAt = null;
        this.hbOn = null; this.hbAt = null;
        this.lookAt = -Infinity;
        this.x = { left: 1, wheelspin: null, pedal: null, hbAt: null, hbKnown: false };
        this.now = null;
    }

    configure(c) {
        Object.assign(this.o, c);
        this.angle.configure({ wheelbase: this.o.wheelbase, front: this.o.front, useSteer: this.o.useSteer, useLong: this.o.useLong, speedMaxAgeMs: this.o.speedMaxAgeMs || 0, yawMaxAgeMs: this.o.yawMaxAgeMs || 0, latMaxAgeMs: this.o.latMaxAgeMs || 0 });
        this.tracker.configure({ startDeg: this.o.startDeg, endDeg: this.o.endDeg, minKmh: this.o.minKmh, demo: this.o.demo });
        if (c && (c.yawKey || c.steerKey)) {
            // another source: its samples are in other units, so what the old one left behind is dropped
            this.learn.use({ yawKey: this.o.yawKey, steerKey: this.o.steerKey });
            this.angle.yawS.reset(); this.angle.steerS.reset(); this.angle.z = null; this.angle.zs = null;
        }
    }

    speed(t, kmh) { this.angle.speed(t, kmh); this._go(t); }
    lat(t, a) { this.angle.lat(t, a); this._go(t); }
    long(t, a) { this.angle.long(t, a); this._go(t); }
    yaw(t, raw) { this.angle.yaw(t, raw); this._go(t); }
    steer(t, raw) { this.angle.steer(t, raw); this._go(t); }
    pedal(t, raw) { const p = this.learn.pedal(raw); if (p !== null) { this.pedalShare = p; this.pedalAt = t; } }
    hb(t, on) { this.hbOn = on === true ? true : on === false ? false : null; if (this.hbOn) this.hbAt = t; }
    wheels(t, w) {
        if (!w || !isNum(w.fl) || !isNum(w.fr) || !isNum(w.rl) || !isNum(w.rr)) return;
        if (w.fl >= 65535 || w.fr >= 65535 || w.rl >= 65535 || w.rr >= 65535 || !(w.fl > 0) || !(w.fr > 0)) return;
        this.rfS.add(t, (w.rl + w.rr) / (w.fl + w.fr));
        this.lrS.add(t, Math.log(w.fr / w.fl));
    }
    idle(now) { this._go(now); }

    _go(now) { if (isNum(now)) { this.now = now; this.angle.advance(now); } }

    _onStep(s) {
        const L = this.learn.values(), x = this.x, t = s.t;
        x.left = L.left;
        // rear wheelspin: rear over front wheel speed against their usual ratio
        const rf = this.rfS.count && this.rfS.age(t) < 1000 && s.kmh !== null && s.kmh >= RULE.WHEEL_KMH && L.wheelBase ? this.rfS.valueAt(t) : null;
        // (a car that is sideways moves along its own length at cos(angle) of its speed, and that is what its rear wheels roll over)
        x.wheelspin = rf === null ? null : rf / L.wheelBase / Math.max(0.25, Math.cos(s.ok ? s.beta : 0)) - 1;
        x.pedal = this.pedalAt !== null ? this.pedalShare : null;
        if (this.hbOn) this.hbAt = t;
        x.hbAt = this.hbAt; x.hbKnown = this.hbOn !== null;
        this.tracker.step(s, x);
        if (t - this.lookAt >= RULE.LOOK_MS) {
            this.lookAt = t;
            const m = this.angle.stats(t, RULE.LOOK_SPAN_MS), t0 = t - RULE.LOOK_SPAN_MS;
            const full = (S) => (S.count && S.t[0] <= t0 && S.age(t) < 1000 ? S.halves(t0, t) : null);
            const w = full(this.rfS);
            m.wheels = w ? { rf: w, lr: full(this.lrS) } : null;
            m.sliding = this.tracker.cur !== null || !s.ok || Math.abs(s.beta) > RULE.SLIDING_DEG * DEG;
            this.learn.look(m);
        }
    }

    /**
     * What the screen needs. state: 'noyaw' (no yaw rate from the car) | 'nodata' (no speed or no sideways
     * acceleration yet) | 'gap' (a source has gone silent) | 'slow' | 'ready' | 'drift'.
     * angle: degrees, its size (null while it is not defined, and while nothing is learned about the yaw rate); dir 'L' | 'R' (L: the nose points left of the way
     * the car travels, as in a drift through a left-hander); pm: degrees; learning: the yaw rate is not learned yet.
     * noSteer: why the steering backs no drift right now, or null; blocked: nothing starts until the car has gone straight.
     */
    view() {
        const s = this.angle.out, tr = this.tracker, L = this.learn.values(), t = s.t;
        // (while the yaw rate's scale is the stated default alone the angle means nothing on a car whose scale is another: it is not shown)
        const shown = s.ok && L.state !== 'none', deg = shown ? s.beta / DEG : null;
        const st = tr.state === 'off' ? (s.why || 'nodata') : tr.state;
        return {
            t, state: st, learning: L.state !== 'learned', learn: L.state,
            angle: deg === null ? null : Math.abs(deg), dir: deg === null || Math.abs(deg) < 0.5 ? null : (deg * L.left < 0 ? 'L' : 'R'), pm: shown ? s.pm : null,
            kmh: s.kmh, anchored: s.anchored, steering: s.steering,
            // why the steering backs no drift right now ('off' | 'nosource' | 'stale': silent or stuck | 'unlearned'), or null: it can
            noSteer: s.sw, blocked: tr.block && tr.state === 'ready',
            // what the forward acceleration reads more than the speed's own change on a straight (m/s2), null until a straight gave one
            ax0: this.angle.ax0N > 0 ? this.angle.ax0 : null,
            run: tr.running(t),
            switched: tr.switchAt !== null && tr.cur && t - tr.switchAt <= RULE.SHOW_MS ? true : false,
            last: tr.last, ended: tr.last !== null && tr.lastAt !== null && t - tr.lastAt <= RULE.SHOW_MS,
            opp: s.ok && s.d !== null ? Math.max(0, -(s.r > 0 ? 1 : -1) * s.d / DEG) : null,
            pedal: this.x.pedal, wheelspin: this.x.wheelspin === null ? null : Math.max(0, 100 * this.x.wheelspin), handbrake: this.hbOn,
            // (a data rate is shown while there is data: not while a source the angle needs is missing or lost)
            rate: isNum(s.slot) && (s.ok || s.why === 'slow') ? 1000 / s.slot : null, lag: s.lag, count: tr.count,
        };
    }
}

module.exports = { DriftEngine, Tracker, canBeBest, RULE, FLAGS };
