'use strict';
/**
 * score.js - Proven Drift: the score of one drift. Pure logic: it is handed the angle and the speed step by
 * step and counts. The same drift always gives the same score: nothing here reads a clock or a random number.
 *
 *   const s = new Score();
 *   s.step(seconds, angleDeg, kmh, t)   one step of the drift (angleDeg with its sign, t ms)
 *   s.switched()                        the drift changed direction
 *   s.points, s.mult(), s.smooth(t)     the running score, its multiplier, how smooth the angle is right now
 *   s.finish(spin)                      -> { score, grade, mult, smooth, reversals }
 *   grade(score)                        -> 'D' | 'C' | 'B' | 'A' | 'S'
 *
 * THE RULES, in plain words (every number is in RULES below):
 *   - Points build up for as long as the drift lasts. Each second gives 10 points at 10 degrees and 50 km/h.
 *   - More angle gives more, in proportion: 30 degrees gives three times what 10 degrees gives. Angle
 *     beyond 60 degrees gives no more than 60 does.
 *   - More speed gives more, in proportion: 100 km/h gives twice what 50 km/h gives. Speed beyond 150 km/h
 *     gives no more than 150 does.
 *   - A held drift earns a multiplier: it starts at 1.0 and grows by 0.1 for every second the drift has
 *     lasted, up to 2.0 more (after 20 s).
 *   - Each change of direction (a switch) adds 0.5 to the multiplier (up to 2.0 more, four switches) and
 *     gives 150 points at once.
 *   - A smooth angle earns more than a sawing one. Every time the angle turns back by 5 degrees or more
 *     counts as one reversal. With no reversal in the last 3 s the points count 1.2 times; each reversal in
 *     those 3 s takes 0.1 off, down to 0.7 times. (A switch is one reversal, and so is the end of a drift.)
 *     Where the count begins the angle has no direction yet: it has one once the lowest and the highest
 *     angle counted so far are 5 degrees apart, so the same sawing gives the same reversals (within two)
 *     wherever in it the count begins.
 *   - A drift that ends in a SPIN keeps half its points and cannot be a best.
 *   - Grades from the score of one drift: D under 150, C from 150, B from 500, A from 1200, S from 3000.
 */
const RULES = {
    BASE: 10,                        // points a second at ANGLE_REF and SPEED_REF
    ANGLE_REF: 10, ANGLE_CAP: 60,    // degrees
    SPEED_REF: 50, SPEED_CAP: 150,   // km/h
    HOLD_PER_S: 0.1, HOLD_MAX: 2,    // the multiplier's growth with the drift's length
    SWITCH_MULT: 0.5, SWITCH_MULT_MAX: 2, SWITCH_BONUS: 150,
    SAW_DEG: 5, SAW_WINDOW_S: 3, SMOOTH_BEST: 1.2, SMOOTH_STEP: 0.1, SMOOTH_WORST: 0.7,
    SPIN_KEEPS: 0.5,
    GRADES: [['S', 3000], ['A', 1200], ['B', 500], ['C', 150], ['D', 0]],
};
const R = RULES;

function grade(score) {
    for (const g of R.GRADES) if (score >= g[1]) return g[0];
    return 'D';
}

/** Points a second for an angle (degrees) and a speed (km/h), before the multiplier and the smoothness. */
function rate(angleDeg, kmh) {
    return R.BASE * Math.min(Math.abs(angleDeg), R.ANGLE_CAP) / R.ANGLE_REF * Math.min(Math.max(kmh, 0), R.SPEED_CAP) / R.SPEED_REF;
}

class Score {
    constructor() {
        this.points = 0; this.time = 0; this.switches = 0;
        this.turns = [];                 // the times (ms) of the reversals of the last few seconds
        this.reversals = 0;
        this.ext = null; this.way = 0;   // the angle's last extreme, and which way it has been going since
        this.lo = null; this.hi = null;  // while it has no way yet: the lowest and the highest angle counted so far
        this.smoothSum = 0;
    }

    mult() { return 1 + Math.min(R.HOLD_MAX, R.HOLD_PER_S * this.time) + Math.min(R.SWITCH_MULT_MAX, R.SWITCH_MULT * this.switches); }

    smooth(t) {
        let n = 0;
        for (const x of this.turns) if (t - x <= R.SAW_WINDOW_S * 1000) n++;
        return Math.max(R.SMOOTH_WORST, R.SMOOTH_BEST - R.SMOOTH_STEP * n);
    }

    step(seconds, angleDeg, kmh, t) {
        if (!(seconds > 0)) return;
        // a reversal: the angle has come back from its last extreme by SAW_DEG
        const a = angleDeg;
        if (this.ext === null) { this.ext = a; this.lo = a; this.hi = a; } else if (this.way === 0) {
            // no direction yet: it has one once the lowest and the highest angle counted so far are SAW_DEG apart (the
            // angle is then at one of the two, and that is the way it is going)
            if (a < this.lo) this.lo = a;
            if (a > this.hi) this.hi = a;
            if (this.hi - this.lo >= R.SAW_DEG) { this.way = a >= this.hi ? 1 : -1; this.ext = a; }
        } else if ((a - this.ext) * this.way > 0) this.ext = a;              // further the same way: a new extreme
        else if (Math.abs(a - this.ext) >= R.SAW_DEG) {
            this.way = -this.way; this.ext = a; this.reversals++;
            this.turns.push(t);
            while (this.turns.length && t - this.turns[0] > R.SAW_WINDOW_S * 1000) this.turns.shift();
        }
        const sm = this.smooth(t);
        this.points += rate(angleDeg, kmh) * this.mult() * sm * seconds;
        this.smoothSum += sm * seconds;
        this.time += seconds;
    }

    switched() { this.switches++; this.points += R.SWITCH_BONUS; }

    finish(spin) {
        const score = Math.round(this.points * (spin ? R.SPIN_KEEPS : 1));
        return { score, grade: grade(score), mult: Math.round(this.mult() * 100) / 100, smooth: this.time > 0 ? Math.round(this.smoothSum / this.time * 100) / 100 : R.SMOOTH_BEST, reversals: this.reversals };
    }
}

module.exports = { Score, grade, rate, RULES };
