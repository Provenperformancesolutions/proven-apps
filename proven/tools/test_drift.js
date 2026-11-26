'use strict';
/**
 * test_drift.js [dist/pps_drift | apps/pps_drift] - Proven Drift's engine on its own files, with no car and no
 * screen: the drift angle (angle.js), what is learned about the car (learn.js), drifts (drift.js) and their
 * score (score.js), measured against a made-up car whose true drift angle is known (driftsim.js).
 *
 * The main part MEASURES and prints: the estimated angle against the true one, worst and typical, for every
 * scene, clean and dirty, at 5, 10, 20 and 50 samples a second, with and without steering, before and after
 * learning, on three made-up cars, and what each single fault costs. Then it checks bounds: the figures as
 * they were measured, with some room, so that a later change that makes the estimate worse is noticed. A bound
 * here says what this engine does on this made-up car. It is no promise for any real car: no figure here has
 * been compared with one.
 *
 * Checks that say KNOWN LIMIT or NOT SOLVED pass while the engine does what proven/CHANGES-drift.md says it
 * does in a case that is known and left open, and pin the figure quoted there.
 *
 * PPS_TEST_ALL=1 in the environment: a failed check does not stop the run; they are listed at the end.
 * PPS_DRIFT_TABLES=1: print every table in full (the default prints them all too; this adds the per-drift lines).
 */
const fs = require('fs'), path = require('path');
const sim = require('./driftsim');
const { checker } = require('./fakecar');

const ARG = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'apps', 'pps_drift'));
const JS = fs.existsSync(path.join(ARG, 'source', 'javascript', 'angle.js')) ? path.join(ARG, 'source', 'javascript') : ARG;
if (!fs.existsSync(path.join(JS, 'angle.js'))) { console.error('usage: node proven/tools/test_drift.js [dist/pps_drift | apps/pps_drift]'); process.exit(2); }
const AngleMod = require(path.join(JS, 'angle'));
const LearnMod = require(path.join(JS, 'learn'));
const DriftMod = require(path.join(JS, 'drift'));
const ScoreMod = require(path.join(JS, 'score'));
const SeriesMod = require(path.join(JS, 'series'));
const { DriftEngine, Tracker, canBeBest, RULE, FLAGS } = DriftMod;
const { Score, grade, rate, RULES } = ScoreMod;
const { Learn, fitLine } = LearnMod;
const { Series } = SeriesMod;

const ok = checker();
const DEG = sim.DEG, C0 = 100000;
const RATES = [5, 10, 20, 50];
const VERBOSE = !!process.env.PPS_DRIFT_TABLES;

const pad = (s, n) => String(s).padStart(n);
const f1 = (x) => (x === null || x === undefined || !isFinite(x) ? '--' : x.toFixed(1));
const med = (a) => { if (!a.length) return NaN; const b = a.slice().sort((x, y) => x - y); return b[b.length >> 1]; };
const max = (a) => a.reduce((m, x) => (x > m ? x : m), 0);

/* ---------- scenes of the test's own, beside driftsim's ---------- */

const S = (start) => new sim.Script(start);
/** A skid pan: ordinary circles left and right from nothing, then a drift of 30 degrees, with `straight` seconds of straight before it or none. */
const pan = (straight) => { const s = S({ v: 45 }).hold(4); for (let i = 0; i < 8; i++) s.to(1.5, { lat: (i % 2 ? -1 : 1) * 0.24 }).hold(4); if (straight) s.to(1.2, { lat: 0 }).hold(straight); return s.to(1.4, { lat: 0.7, drift: 30, spin: 0.3, pedal: 0.6 }).hold(10).to(1.2, { lat: 0, drift: 0, spin: 0 }).hold(4); };
/** n laps with full grip, never under 40 km/h, after a scene: straights at 80 and 90 km/h, corners of 0.6 and 0.5 g, and one real drift of 40 degrees a lap (the laps of `frozenbank`). */
const laps = (s, n) => { for (let lap = 0; lap < n; lap++) s.to(3, { v: 80, pedal: 0.3 }).hold(6).to(1.5, { lat: -0.6 }).hold(6).to(1.5, { lat: 0 }).hold(5).to(1.5, { lat: 0.5, v: 60 }).hold(6).to(1.5, { lat: 0 }).to(3, { v: 90 }).hold(6).to(2, { v: 70 }).hold(2).to(1.3, { lat: 0.78, drift: 40, spin: 0.3, pedal: 0.7 }).hold(8).to(1.3, { lat: 0, drift: 0, spin: 0, pedal: 0.3 }).hold(4); return s; };
const OWN = {
    banked5: () => S({ v: 100 }).hold(3).to(1.5, { lat: 0.6, bank: 5 }).hold(8).to(1.5, { lat: 0, bank: 0 }).hold(4),
    wetcircle: () => S({ v: 42 }).hold(3).to(2, { lat: 0.34, drift: 25, spin: 0.4, pedal: 0.5 }).hold(16).to(1.5, { lat: 0, drift: 0, spin: 0 }).hold(3),
    slowend: () => S({ v: 50 }).hold(3).to(1.2, { lat: 0.7, drift: 28, spin: 0.3 }).to(2.5, { v: 30 }).to(2, { v: 14, drift: 10, lat: 0.25 }).to(1, { drift: 0, lat: 0 }).to(2, { v: 30 }).hold(2),
    stopsideways: () => S({ v: 55 }).hold(3).to(1.2, { lat: 0.75, drift: 35, spin: 0.3 }).to(1.5, { v: 45 }).to(1.6, { v: 4, drift: 55, lat: 0.3, spin: 0 }).to(0.6, { v: 0, lat: 0 }).hold(3),
    wobble: () => S({ v: 70 }).hold(3).to(1.2, { lat: 0.78, drift: 25, spin: 0.3 }).hold(2).to(0.8, { lat: 0, drift: -3 }).to(1.6, { drift: -7, lat: -0.15 }).to(1, { drift: 0, lat: 0 }).hold(3),
    smooth30: () => S({ v: 70 }).hold(3).to(1.2, { lat: 0.78, drift: 30, spin: 0.3 }).hold(6).to(1, { lat: 0, drift: 0, spin: 0 }).hold(3),
    saw30: () => { const s = S({ v: 70 }).hold(3).to(1.2, { lat: 0.78, drift: 38, spin: 0.3 }); for (let i = 0; i < 6; i++) s.to(0.5, { drift: 22 }).to(0.5, { drift: 38 }); return s.to(1, { lat: 0, drift: 0, spin: 0 }).hold(3); },
    fast30: () => S({ v: 120 }).hold(3).to(1.2, { lat: 0.78, drift: 30, spin: 0.3 }).hold(6).to(1, { lat: 0, drift: 0, spin: 0 }).hold(3),
    small15: () => S({ v: 70 }).hold(3).to(1.2, { lat: 0.78, drift: 15, spin: 0.3 }).hold(6).to(1, { lat: 0, drift: 0, spin: 0 }).hold(3),
    short30: () => S({ v: 70 }).hold(3).to(1.2, { lat: 0.78, drift: 30, spin: 0.3 }).hold(2).to(1, { lat: 0, drift: 0, spin: 0 }).hold(3),
    below: () => S({ v: 16 }).hold(3).to(1.2, { lat: 0.3, drift: 30, spin: 0.3 }).hold(4).to(1, { lat: 0, drift: 0, spin: 0 }).hold(3),
    fromstand: () => S({ v: 0 }).hold(3).to(5, { v: 55, lat: 0.35, pedal: 0.5 }).to(1.2, { lat: 0.75, drift: 30, spin: 0.3 }).hold(4).to(1, { lat: 0, drift: 0, spin: 0 }).hold(3),
    eight: () => S({ v: 70 }).hold(3).to(1.2, { lat: 0.7, drift: 8.5 }).hold(4).to(1, { lat: 0, drift: 0 }).hold(3),
    // (what two reviews asked for)
    bank3: () => S({ v: 80 }).hold(3).to(1.5, { lat: 0.3, bank: 3 }).hold(15).to(1.5, { lat: 0, bank: 0 }).hold(4),
    bank6: () => S({ v: 100 }).hold(3).to(1.5, { lat: 0.2, bank: 6 }).hold(15).to(1.5, { lat: 0, bank: 0 }).hold(4),
    bank6b: () => S({ v: 80 }).hold(3).to(1.5, { lat: 0.35, bank: 6 }).hold(10).to(1.5, { lat: 0, bank: 0 }).hold(4),
    bank9: () => S({ v: 100 }).hold(3).to(1.5, { lat: 0.16, bank: 9 }).hold(20).to(1.5, { lat: 0, bank: 0 }).hold(4),
    bank12b: () => S({ v: 100 }).hold(3).to(1.5, { lat: 0.45, bank: 12 }).hold(8).to(1.5, { lat: 0, bank: 0 }).hold(4),
    lowgrip: () => { const s = S({ v: 30 }).hold(3).to(2, { lat: 0.3, drift: 30, spin: 0.4, pedal: 0.5 }); for (let i = 0; i < 8; i++) s.to(2.5, { drift: 33, v: 31 }).to(2.5, { drift: 27, v: 29 }); return s.to(1.5, { lat: 0, drift: 0, spin: 0, pedal: 0.2 }).hold(3); },
    long15: () => S({ v: 70 }).hold(3).to(1.3, { lat: 0.78, drift: 15, spin: 0.3 }).hold(12).to(1.1, { lat: 0, drift: 0, spin: 0 }).hold(3),
    long20: () => S({ v: 50 }).hold(3).to(1.3, { lat: 0.6, drift: 20, spin: 0.3 }).hold(20).to(1.1, { lat: 0, drift: 0, spin: 0 }).hold(3),
    long25: () => S({ v: 45 }).hold(3).to(1.3, { lat: 0.5, drift: 25, spin: 0.3 }).hold(40).to(1.1, { lat: 0, drift: 0, spin: 0 }).hold(3),
    long20slow: () => S({ v: 35 }).hold(3).to(1.3, { lat: 0.4, drift: 20, spin: 0.3 }).hold(20).to(1.1, { lat: 0, drift: 0, spin: 0 }).hold(3),
    long25fast: () => S({ v: 60 }).hold(3).to(1.3, { lat: 0.7, drift: 25, spin: 0.3 }).hold(20).to(1.1, { lat: 0, drift: 0, spin: 0 }).hold(3),
    straight10: () => S({ v: 100 }).hold(600),
    gentlebend: () => S({ v: 100 }).hold(6).to(2, { lat: 0.074 }).hold(30).to(2, { lat: 0 }).hold(6),
    lock46: () => S({ v: 60 }).hold(3).to(1.3, { lat: 0.75, drift: 46, spin: 0.3 }).hold(10).to(1.2, { lat: 0, drift: 0, spin: 0 }).hold(3),
    lock50: () => S({ v: 60 }).hold(3).to(1.3, { lat: 0.75, drift: 50, spin: 0.3 }).hold(10).to(1.2, { lat: 0, drift: 0, spin: 0 }).hold(3),
    lock58: () => S({ v: 60 }).hold(3).to(1.3, { lat: 0.75, drift: 58, spin: 0.3 }).hold(10).to(1.2, { lat: 0, drift: 0, spin: 0 }).hold(3),
    standpull: () => S({ v: 0 }).hold(3).to(5, { v: 55, pedal: 0.5 }).hold(1.5).to(1.2, { lat: 0.75, drift: 30, spin: 0.3 }).hold(4).to(1, { lat: 0, drift: 0, spin: 0 }).hold(3),
    slopestart: () => S({ v: 0, bank: 4 }).hold(4).to(4, { v: 40 }).to(1.5, { bank: 0 }).hold(3).to(4, { v: 0 }).hold(1),
    wetboth: () => { const s = S({ v: 42 }).hold(3); for (let i = 0; i < 4; i++) s.to(2, { lat: i % 2 ? -0.34 : 0.34, drift: i % 2 ? -25 : 25, spin: 0.1, pedal: 0.5 }).hold(12).to(1.5, { lat: 0, drift: 0, spin: 0 }).hold(2); return s.hold(1); },
    // (what the re-check asked for)
    flat45: () => S({ v: 70 }).hold(3).to(1.5, { lat: 0.45 }).hold(10).to(1.5, { lat: 0 }).hold(4),
    flat60: () => S({ v: 80 }).hold(3).to(1.5, { lat: 0.6 }).hold(8).to(1.5, { lat: 0 }).hold(4),
    tight12: () => S({ v: 30 }).hold(3).to(1.5, { lat: 0.25, bank: 12 }).hold(12).to(1.5, { lat: 0, bank: 0 }).hold(4),
    tight10: () => S({ v: 25 }).hold(3).to(1.5, { lat: 0.2, bank: 10 }).hold(15).to(1.5, { lat: 0, bank: 0 }).hold(4),
    ice30: () => S({ v: 30 }).hold(3).to(2, { lat: 0.15, drift: 30, spin: 0.4, pedal: 0.4 }).to(12, { v: 28 }).to(1.5, { lat: 0, drift: 0, spin: 0 }).hold(3),
    snow60: () => S({ v: 30 }).hold(3).to(2.5, { lat: 0.24, drift: 60, spin: 0.5, pedal: 0.5 }).to(12, { v: 28 }).to(2, { lat: 0, drift: 0, spin: 0 }).hold(3),
    small13: () => S({ v: 70 }).hold(3).to(1.2, { lat: 0.7, drift: 13, spin: 0.3 }).hold(5).to(1, { lat: 0, drift: 0, spin: 0 }).hold(3),
    pan: () => pan(0), panstraight: () => pan(1.5),
    fewgentle: () => { const s = S({ v: 40 }).hold(2); [[0.16, 3], [-0.14, 3], [0.2, 2.5], [-0.22, 3]].forEach((c) => s.to(1.2, { lat: c[0] }).hold(c[1]).to(1.2, { lat: 0 }).hold(1.2)); return s; },
    // (what the second check asked for)
    cornerdrift: () => S({ v: 80 }).hold(4).to(1.5, { lat: 0.5 }).hold(6).to(1.5, { lat: 0 }).hold(3).to(1.5, { v: 70 }).hold(1.5).to(1.2, { lat: 0.78, drift: 30, spin: 0.3, pedal: 0.7 }).hold(6).to(1, { lat: 0, drift: 0, spin: 0 }).hold(3),
    fourcorners: () => { const s = S({ v: 80 }).hold(4); [0.6, -0.6, 0.6].forEach((g) => s.to(1.5, { lat: g }).hold(8).to(1.5, { lat: 0 }).hold(3)); return s; },
    brakecorner: () => S({ v: 150 }).hold(3).to(4.8, { v: 60, pedal: 0 }).to(1.5, { lat: 0.5 }).hold(10).to(1.5, { lat: 0 }).hold(4),
    brakedrift: () => S({ v: 150 }).hold(3).to(4.8, { v: 60, pedal: 0 }).to(1.3, { lat: 0.78, drift: 30, spin: 0.3, pedal: 0.7 }).hold(6).to(1.1, { lat: 0, drift: 0, spin: 0 }).hold(3),
    // (what the third check asked for: the wheels at their lock, and the car's nose stops turning in the middle of the drift)
    liftlock: () => S({ v: 70 }).hold(3).to(1.3, { lat: 0.78, drift: 55, spin: 0.3, pedal: 0.7 }).hold(3).to(0.6, { lat: 0.25, pedal: 0.1, spin: 0.05 }).to(1.2, { drift: 49.2 }).to(1, { drift: 55, lat: 0.78, pedal: 0.7, spin: 0.3 }).hold(8).to(1.3, { lat: 0, drift: 0, spin: 0, pedal: 0.3 }).hold(4),
    slidelock: () => S({ v: 70 }).hold(3).to(1.3, { lat: 0.78, drift: 50, spin: 0.3, pedal: 0.7 }).hold(3).to(0.8, { lat: 0, v: 67 }).hold(1).to(0.8, { lat: 0.78 }).hold(8).to(1.3, { lat: 0, drift: 0, spin: 0, pedal: 0.3 }).hold(4),
    nolift: () => S({ v: 70 }).hold(3).to(1.3, { lat: 0.78, drift: 55, spin: 0.3, pedal: 0.7 }).hold(13.8).to(1.3, { lat: 0, drift: 0, spin: 0, pedal: 0.3 }).hold(4),
    noslide: () => S({ v: 70 }).hold(3).to(1.3, { lat: 0.78, drift: 50, spin: 0.3, pedal: 0.7 }).hold(13.6).to(1.3, { lat: 0, drift: 0, spin: 0, pedal: 0.3 }).hold(4),
    // (what the fourth check asked for: a steering value that freezes and is still sent, and a healthy wheel that is not at its lock)
    frozenbank: () => { const s = S({ v: 40 }).hold(4).to(1.5, { lat: 0.45 }).hold(5).to(2.5, { lat: -0.3, bank: -8 }).hold(12).to(1.5, { lat: 0, bank: 0 }).hold(1);
        for (let lap = 0; lap < 2; lap++) s.to(3, { v: 80, pedal: 0.3 }).hold(6).to(1.5, { lat: -0.6 }).hold(6).to(1.5, { lat: 0 }).hold(5).to(1.5, { lat: 0.5, v: 60 }).hold(6).to(1.5, { lat: 0 }).to(3, { v: 90 }).hold(6).to(2, { v: 70 }).hold(2).to(1.3, { lat: 0.78, drift: 40, spin: 0.3, pedal: 0.7 }).hold(8).to(1.3, { lat: 0, drift: 0, spin: 0, pedal: 0.3 }).hold(4);
        return s; },
    opplock: () => { const s = S({ v: 30 }).hold(4).to(1.5, { lat: 0.5 }).hold(6).to(3, { lat: -0.6, v: 80 }).hold(8).to(1.5, { lat: 0 }).to(2, { pedal: 0.3 }).hold(4); [-0.6, 0.6, -0.6].forEach((g) => s.to(1.5, { lat: g }).hold(8).to(1.5, { lat: 0 }).hold(3)); return s.hold(1); },
    liftlockR: () => S({ v: 70 }).hold(3).to(1.3, { lat: -0.78, drift: -55, spin: 0.3, pedal: 0.7 }).hold(3).to(0.6, { lat: -0.25, pedal: 0.1, spin: 0.05 }).to(1.2, { drift: -49.2 }).to(1, { drift: -55, lat: -0.78, pedal: 0.7, spin: 0.3 }).hold(8).to(1.3, { lat: 0, drift: 0, spin: 0, pedal: 0.3 }).hold(4),
    crabslide: () => S({ v: 40 }).hold(3).to(1.3, { lat: 0.25, drift: 40, spin: 0.25, pedal: 0.6 }).hold(3).to(0.8, { lat: 0, v: 37 }).to(2, { v: 29 }).to(0.8, { lat: 0.25 }).hold(6).to(1.3, { lat: 0, drift: 0, spin: 0, pedal: 0.2 }).hold(4),
    oneway: () => { const s = S({ v: 50 }).hold(2); for (let i = 0; i < 14; i++) s.to(1.2, { lat: 0.3 + 0.02 * (i % 4), v: 45 + 3 * (i % 5) }).hold(3).to(1.2, { lat: 0 }).hold(1.2); return s.hold(1); },
    // (what the fifth check asked for: a slow, tight drift that needs little opposite lock, with one straight slide in it and with two; a drift at the lock that
    // fades out slowly while the car goes on turning, then two laps; and the frozen value of `frozenbank` standing at about 8 degrees, with one lap)
    tight1: () => S({ v: 30 }).hold(3).to(1.3, { lat: 0.7, drift: 26, spin: 0.25, pedal: 0.6 }).hold(4).to(0.8, { lat: 0 }).hold(1).to(0.8, { lat: 0.7 }).hold(6).to(1.3, { lat: 0, drift: 0, spin: 0, pedal: 0.2 }).hold(4),
    tight2: () => S({ v: 30 }).hold(3).to(1.3, { lat: 0.7, drift: 26, spin: 0.25, pedal: 0.6 }).hold(4).to(0.8, { lat: 0 }).hold(2).to(0.8, { lat: 0.7 }).hold(4).to(0.8, { lat: 0 }).hold(2).to(0.8, { lat: 0.7 }).hold(6).to(1.3, { lat: 0, drift: 0, spin: 0, pedal: 0.2 }).hold(4),
    fadeout: () => laps(S({ v: 70 }).hold(3).to(1.3, { lat: 0.78, drift: 45, spin: 0.3, pedal: 0.7 }).hold(6).to(20, { drift: 0, lat: 0.35, spin: 0, pedal: 0.3 }).hold(3).to(1.5, { lat: 0 }).hold(1), 2),
    fadeout12: () => laps(S({ v: 70 }).hold(3).to(1.3, { lat: 0.78, drift: 45, spin: 0.3, pedal: 0.7 }).hold(6).to(12, { drift: 0, lat: 0.35, spin: 0, pedal: 0.3 }).hold(3).to(1.5, { lat: 0 }).hold(1), 2),
    frozenbank8: () => laps(S({ v: 34 }).hold(4).to(1.5, { lat: 0.45 }).hold(5).to(2.5, { lat: -0.3, v: 40, bank: -8 }).hold(12).to(1.5, { lat: 0, bank: 0 }).hold(1), 1),
    // (1.0.1, after the first car: six slow, gentle corners, 32 km/h at 0.12 g, too slow and too gentle to teach the yaw rate anything)
    slowfirst: () => { const s = S({ v: 32, pedal: 0.2 }).hold(3); for (let i = 0; i < 6; i++) s.to(1.5, { lat: (i % 2 ? -1 : 1) * 0.12 }).hold(5); return s.to(1.5, { lat: 0 }).hold(2); },
};
const truths = {};
function truthOf(name, car) {
    const key = name + '/' + car.yawStep + '/' + car.wheelbase + '/' + car.speedFrom + '/' + car.yawCeil;
    if (!truths[key]) truths[key] = new sim.Truth(OWN[name] ? OWN[name]() : sim.scene(name), car);
    return truths[key];
}

/* ---------- running a scene through the engine ---------- */

/** What "dirty" adds to the delivery, on top of the sensor faults (sim.DIRTY): see the head of the tables. */
function dirtyDelivery(spacing, T) {
    return {
        jitter: 0.3 * spacing, onChange: true,
        each: { speed: { spacing: Math.max(spacing, 100) }, wheels: { spacing: Math.max(spacing, 100), lump: 50 }, pedal: { spacing: 100 }, steer: { spacing } },
        holdups: [{ at: 0.42 * T, ms: 120 }],
        nonsense: { yaw: [{ at: 0.3 * T, v: 65535 }, { at: 0.55 * T, v: 0 }], lat: [{ at: 0.33 * T, v: 14 }], speed: [{ at: 0.6 * T, v: 0 }] },
    };
}

/** Drive scenes through one engine. Returns the engine and, for the last scene, the errors and the drifts. */
function run(o) {
    const car = o.car || sim.CARS.a, recs = [];
    const eng = new DriftEngine(Object.assign({ wheelbase: car.wheelbase, front: car.front, saved: o.saved || null, useSteer: o.useSteer !== false, onDrift: (r) => recs.push(r) }, o.engine));
    let clock = C0, out = null;
    const names = Array.isArray(o.scene) ? o.scene : [o.scene];
    names.forEach((name, i) => {
        const truth = truthOf(name, car), last = i === names.length - 1, T = truth.T * 1000;
        const so = Object.assign({ spacing: o.spacing || 50, faults: o.dirty ? sim.DIRTY : sim.CLEAN, rand: sim.rng(o.seed || 11), clock0: clock }, o.dirty ? dirtyDelivery(o.spacing || 50, T) : null, o.sample);
        if (o.off) { so.each = Object.assign({}, so.each); o.off.forEach((src) => { so.each[src] = Object.assign({}, so.each[src], { off: true }); }); }
        if (o.faults) so.faults = Object.assign({}, so.faults, o.faults);
        const events = o.events ? o.events(sim.sampleAll(truth, car, so), clock) : sim.sampleAll(truth, car, so);
        const errs = [], turning = [], cover = [], rows = [];
        let spun = false, lag = 0, n = 0;
        sim.drive(eng, events, { clock0: clock, holdups: so.holdups || [], until: clock + T + 1000, onTick: () => {
            if (!last) return;
            const s = eng.angle.out;
            if (o.onTick) o.onTick(eng, s, truth, s.t - clock);
            if (!s.ok) return;
            const tr = truth.at(s.t - clock);
            if (Math.abs(tr.beta) >= 100 * DEG) spun = true;            // past a spin the angle is no longer compared
            if (spun) return;
            const e = Math.abs(s.beta - tr.beta) / DEG;
            errs.push(e); cover.push(e <= s.pm ? 1 : 0); lag += s.lag; n++;
            if (Math.abs(tr.r) >= 2 * DEG) turning.push(e);
            if (o.rows) rows.push({ t: s.t - clock, est: s.beta / DEG, tru: tr.beta / DEG, pm: s.pm });
        } });
        clock += T + 1500;
        if (last) out = { eng, recs, truth, worst: max(errs), typ: turning.length ? med(turning) : 0, cover: cover.length ? cover.reduce((a, b) => a + b, 0) / cover.length : 1, lag: n ? lag / n : null, rows, n };
    });
    return out;
}

const learnedCache = {};
/** What an engine has learned after the ordinary drive and the gentle corners, for a car, a rate and clean or dirty. */
function learned(carName, spacing, dirty, extra) {
    const key = [carName, spacing, dirty ? 'd' : 'c', JSON.stringify(extra || {})].join('/');
    if (!learnedCache[key]) {
        const r = run(Object.assign({ car: sim.CARS[carName], scene: ['ordinary', 'gentle'], spacing, dirty, seed: 7 }, extra));
        learnedCache[key] = { saved: r.eng.learn.export(), status: r.eng.learn.status(), recs: r.recs };
    }
    return learnedCache[key];
}

/** One cell of a table: a scene on a car at a rate. o.learn false: before learning. */
function cell(name, o) {
    const carName = o.carName || 'a', spacing = 1000 / o.rate;
    const L = o.learn === false ? null : learned(carName, spacing, !!o.dirty, o.learnExtra);
    return run(Object.assign({ car: sim.CARS[carName], scene: name, spacing, saved: L ? L.saved : null }, o));
}

const DRIFT_SCENES = ['held', 'right', 'circle', 'lowgrip', 'switches', 'handbrake', 'spin'];
const QUIET_SCENES = ['ordinary', 'gentle', 'lanechange', 'slalom', 'understeer', 'bumpy', 'braking', 'roundabout', 'banked5', 'banked'];
const ALL_SCENES = DRIFT_SCENES.concat(QUIET_SCENES);

/** Print one table: every scene at four rates. Returns { scene: { rate: result } }. */
function table(title, o, scenes) {
    console.log('\n  ' + title);
    console.log('  ' + 'scene'.padEnd(11) + RATES.map((r) => pad(r + '/s: worst  typ  +-ok', 24)).join(''));
    const all = {};
    for (const name of scenes || ALL_SCENES) {
        all[name] = {};
        let line = '  ' + name.padEnd(11);
        for (const r of RATES) {
            const c = cell(name, Object.assign({ rate: r }, o));
            all[name][r] = c;
            line += pad(f1(c.worst), 14) + pad(f1(c.typ), 5) + pad(Math.round(100 * c.cover) + '%', 5);
        }
        console.log(line);
        if (VERBOSE) for (const r of RATES) all[name][r].recs.forEach((d) => console.log('      ' + r + '/s: ' + describe(d)));
    }
    return all;
}
const describe = (d) => d.score + ' ' + d.grade + ', peak ' + d.peak + ', ' + d.time + ' s, ' + d.dir + ', switches ' + d.switches + ', ended ' + d.end + ', +-' + d.pm + (d.flags.length ? ' [' + d.flags.join(', ') + ']' : '');
const worstOf = (t, scenes, rates) => max(scenes.map((s) => max((rates || RATES).map((r) => t[s][r].worst))));
const driftsOf = (t, scenes, rates) => scenes.reduce((n, s) => n + (rates || RATES).reduce((m, r) => m + t[s][r].recs.length, 0), 0);

/* ---------- helpers for the tracker's own rules ---------- */

/** A step record as angle.js makes them, for the tracker alone: a car with steering, its wheels 12 degrees against the turn, the steering check pulling. */
function stepOf(t, deg, kmh, more) {
    return Object.assign({ t, ok: true, why: null, beta: deg * DEG, pm: 3, kmh, r: deg < 0 ? 25 * DEG : -25 * DEG, ay: deg < 0 ? 7 : -7, ax: 0, hasAx: true, ax0: 0, d: (deg < 0 ? -12 : 12) * DEG, over: 16 * DEG, steering: true, sw: null,
        acc: deg * DEG, accStrong: true, accel: false, rest: false, anchored: true, lost: false, gap: 0, slot: 50, lag: 85, state: 'learned' }, more);
}
/** The same on a car without steering (no source), where the acceleration check is all there is: handed in as `more`. */
const NS = { d: null, over: null, steering: false, sw: 'nosource', accel: true };
const X0 = { left: 1, wheelspin: null, pedal: null, hbAt: null, hbKnown: false };
/** Feed the tracker an angle that follows fn(seconds) -> degrees (or a step record's fields), every 20 ms. */
function track(fn, seconds, o) {
    const recs = [], tr = new Tracker(Object.assign({ onDrift: (r) => recs.push(r) }, o && o.tracker)), states = [];
    for (let ms = 0; ms <= seconds * 1000; ms += 20) {
        const v = fn(ms / 1000), s = typeof v === 'number' ? stepOf(C0 + ms, v, 60) : stepOf(C0 + ms, v.deg, v.kmh === undefined ? 60 : v.kmh, v.more);
        tr.step(s, Object.assign({}, X0, o && o.x));
        states.push(tr.state);
    }
    return { recs, tr, states };
}
const ramp = (t, t0, t1, a, b) => (t <= t0 ? a : t >= t1 ? b : a + (b - a) * (t - t0) / (t1 - t0));
/**
 * A road that climbs by `deg` degrees through the corner of a scene and is level before and after it (the scenes with
 * 3 s of straight, 1.5 s into the corner, the corner, 1.5 s out, 4 s of straight; T: the scene's length, ms): the
 * forward acceleration feels g x sin(grade) more there. For run()'s `events`.
 */
const climbIn = (deg, T) => (ev, clock) => ev.map((e) => (e.src !== 'long' ? e : Object.assign({}, e, { v: Math.round((e.v + sim.G0 * Math.sin(deg * DEG) * Math.max(0, Math.min(1, (e.sent - clock - 3000) / 1500, (T - 4000 - (e.sent - clock)) / 1500))) / 0.002) * 0.002 })));

/**
 * angle.js alone on samples of the test's own, every 50 ms, on a car whose yaw rate and steering are learned (0.005 degrees a
 * second and 0.01 degrees at the wheels per count): fn(seconds) -> { kmh, yaw (degrees a second), ay (m/s2), steer (raw; left out: no sample) }.
 * Returns when the steering first counted as silent or stuck (sw 'stale'; null: never), and at(seconds). learnedMore: what was
 * learned otherwise (a steering scale that is not known: { sstate: 'none', kc: null, szero: null }).
 */
function wheel(fn, seconds, learnedMore) {
    const L = Object.assign({ k: 0.005 * DEG, zero: 32768, state: 'learned', kc: 0.01 * DEG / 2.85, szero: 32768, sstate: 'learned', axSign: 1 }, learnedMore);
    const a = new AngleMod.Angle({ wheelbase: 2.85, front: 0.5, useSteer: true, learned: () => L }), out = [];
    for (let ms = 0; ms <= seconds * 1000; ms += 50) {
        const x = fn(ms / 1000), t = C0 + ms;
        a.speed(t, x.kmh); a.lat(t + 1, x.ay); a.long(t + 2, 0); a.yaw(t + 3, Math.round(32768 + x.yaw / 0.005)); if (x.steer !== undefined) a.steer(t + 4, x.steer);
        a.advance(t + 5);
        out.push(a.out.sw === 'stale');
    }
    const first = out.indexOf(true);
    return { first: first < 0 ? null : first / 20, at: (sec) => out[Math.round(sec * 20)], last: out[out.length - 1], shown: Math.abs(a.out.beta) / DEG };
}

(async () => {
    /* ================= the made-up car ================= */
    await ok.part('the made-up car (driftsim.js)', async () => {
        const src = fs.readFileSync(path.join(__dirname, 'driftsim.js'), 'utf8');
        const reqs = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').match(/require\(([^)]*)\)/g) || [];
        ok(reqs.length === 1 && reqs[0] === "require('./dragsim')", 'driftsim.js loads nothing of the app: only dragsim.js, for its random numbers');
        const T = truthOf('switches', sim.CARS.a);
        let off = 0;
        for (let i = 1; i < T.n - 1; i++) {
            const bd = (T.beta[i + 1] - T.beta[i - 1]) / 0.002;
            off = Math.max(off, Math.abs(T.ay[i] * Math.cos(T.beta[i]) - T.ax[i] * Math.sin(T.beta[i]) - T.V[i] * (bd + T.r[i])));
        }
        ok(off < 1e-3, 'its true motion obeys the kinematics the brief states: ay cos(beta) - ax sin(beta) = V (d(beta)/dt + r), to ' + off.toExponential(1) + ' m/s2 over a scene with two switches');
        const names = Object.keys(sim.SCENES);
        ok(['ordinary', 'held', 'circle', 'switches', 'spin', 'lanechange', 'slalom', 'understeer', 'bumpy', 'banked'].every((n) => names.includes(n)), 'it has the brief\'s scenes: ordinary driving, a held drift, a long circle, switches, a spin, a lane change, a slalom, understeer, a bumpy straight, a banked corner');
        const h = truthOf('held', sim.CARS.a).at(6000);
        ok(Math.abs(h.beta / DEG + 30) < 1 && h.r > 0 && h.ay > 0 && h.ax > 0 && h.delta < 0, 'a held drift through a left-hander: beta about -30 degrees, yaw rate and sideways acceleration positive, the front wheels turned against the turn, and the forward acceleration sensor feeling part of the turn (' + h.ax.toFixed(2) + ' m/s2 at a steady speed)');
        const a = sim.sampleAll(truthOf('held', sim.CARS.a), sim.CARS.a, { spacing: 50, rand: sim.rng(1) });
        const b = sim.sampleAll(truthOf('held', sim.CARS.a), sim.CARS.a, { spacing: 50, rand: sim.rng(1), onChange: true });
        ok(b.length < a.length * 0.8 && b.filter((e) => e.src === 'speed').length < a.filter((e) => e.src === 'speed').length, 'sent only on change, a steady source sends less (' + b.length + ' samples against ' + a.length + ')');
        const hu = sim.sampleAll(truthOf('held', sim.CARS.a), sim.CARS.a, { spacing: 50, rand: sim.rng(1), holdups: [{ at: 5000, ms: 300 }] });
        const inHole = hu.filter((e) => e.t - C0 >= 5000 && e.t - C0 < 5300).length, after = hu.filter((e) => e.t - C0 >= 5300 && e.t - C0 < 5301).length;
        ok(inHole === 0 && after > 30 && hu.every((e, i) => i === 0 || e.t > hu[i - 1].t), 'the app held up for 300 ms: nothing is stamped in that time, ' + after + ' samples are stamped within a millisecond after it, and no stamp runs backwards');
        const g = sim.sampleAll(truthOf('held', sim.CARS.a), sim.CARS.a, { spacing: 50, rand: sim.rng(1), gaps: { yaw: [{ at: 5000, ms: 600 }] }, nonsense: { yaw: [{ at: 3000, v: 65535 }] } });
        const yaw = g.filter((e) => e.src === 'yaw');
        ok(!yaw.some((e) => e.sent - C0 >= 5000 && e.sent - C0 < 5600) && yaw.filter((e) => e.v === 65535).length === 1, 'a source can lose a stretch, and one slot can read nonsense');
        const three = ['a', 'b', 'c'].map((c) => sim.readers(truthOf('held', sim.CARS[c]), sim.CARS[c], sim.CLEAN, sim.rng(1)).yaw(6000));
        ok(three[0] > 32768 && three[1] < 32000 && three[2] > 30000 && new Set(three).size === 3, 'the three cars send the yaw rate in three different raw scales, one of them with the sign turned round (' + three.join(', ') + ' for the same moment)');
    });

    /* ================= the parts on their own ================= */
    await ok.part('one source\'s samples (series.js)', async () => {
        let s = new Series({ jump: 10, still: 0.5 });
        [[0, 1], [50, 2], [100, 3]].forEach((p) => s.add(p[0], p[1]));
        ok(s.valueAt(75) === 2.5 && s.valueAt(200) === 3 && s.valueAt(-5) === 1, 'between two samples the reading is on the straight line between them; after the newest it is the newest');
        s.add(150, 60); s.add(200, 4);
        ok(s.dropped === 1 && s.valueAt(150) === 3.5 && s.count === 4, 'a lone value that steps too far and that the next sample does not confirm is dropped');
        s.add(250, 30); s.add(300, 31);
        ok(s.dropped === 1 && s.valueAt(250) === 30, 'a step that the next sample confirms is taken, both samples');
        s.add(350, 55);
        ok(s.valueAt(400) === 31, 'a sample that is held back is not used yet');
        s.flush(900);
        ok(s.valueAt(900) === 55, 'and is taken after half a second if nothing follows');
        s = new Series({ lo: 0, hi: 100 });
        ok(s.add(0, 101) === false && s.add(0, NaN) === false && s.add('x', 1) === false && s.add(0, undefined) === false && s.count === 0 && s.noValue === 4, 'a value outside its range, or no number at all, is no value');
        s.add(10, 1); s.add(5, 2);
        ok(s.backwards === 1 && s.count === 1, 'a stamp that runs backwards is not taken');
        s.add(11, 7);
        ok(s.merged === 1 && s.valueAt(11) === 7 && s.t.length === 1, 'two samples stamped within 2 ms arrived together: the later one replaces the earlier');
        s = new Series({ still: 0.5 });
        for (let t = 0; t <= 400; t += 50) s.add(t, 1);
        s.add(1400, 1.2);
        ok(s.newHole() === 0 && Math.abs(s.valueAt(900) - 1) < 1e-9 && s.valueAt(1375) > 1.05, 'a silence that ends with no step was "no change": the old value until one send slot before the new sample');
        s.add(2400, 9);
        ok(Math.abs(s.valueAt(1900) - 5.1) < 1e-9 && s.newHole() === 1000 && s.newHole() === 0, 'a silence that ends with a step was a hole: it is reported once with its length, and read as a straight line across');
        s = new Series({ jump: 3, slew: 40 });
        s.add(0, 0); s.add(50, 3.5); s.add(100, 0.2); s.add(600, 12); s.add(650, 12.5);
        ok(s.dropped === 1 && s.valueAt(650) === 12.5 && s.t.length === 4, 'how big a step is held back grows with the time since the last sample: 3.5 after 50 ms is, 12 after half a second is not');
        s = new Series({});
        for (let t = 0; t <= 1000; t += 20) s.add(t, t / 100);
        const w = s.window(200, 800);
        ok(Math.abs(w.mean - 5) < 1e-9 && w.min === 2 && w.max === 8 && s.slot() === 20, 'the mean, the lowest and the highest over a stretch, and the send slot (the middle spacing)');
        for (let t = 1020; t <= 9000; t += 20) s.add(t, 1);
        ok(s.t.length <= 5000 / 20 + 3, 'samples older than the window are let go (' + s.t.length + ' kept)');
    });

    await ok.part('the score (score.js)', async () => {
        ok(rate(10, 50) === RULES.BASE && rate(30, 50) === 3 * RULES.BASE && rate(10, 100) === 2 * RULES.BASE, 'ten points a second at 10 degrees and 50 km/h; three times that at 30 degrees; twice at 100 km/h');
        ok(rate(60, 50) === rate(90, 50) && rate(10, 150) === rate(10, 250) && rate(-30, 50) === rate(30, 50), 'no more for angle beyond 60 degrees or speed beyond 150 km/h; left and right count alike');
        let prev = -1, mono = true;
        for (let a = 0; a <= 60; a += 2) { const r = rate(a, 60); if (r <= prev) mono = false; prev = r; }
        prev = -1;
        for (let v = 20; v <= 150; v += 5) { const r = rate(25, v); if (r <= prev) mono = false; prev = r; }
        ok(mono, 'up to those caps, every degree more and every km/h more gives more');
        const held = (secs, deg, kmh, sw) => { const s = new Score(); for (let i = 0; i < secs * 50; i++) { s.step(0.02, deg, kmh, i * 20); if (sw && sw.includes(i * 20)) s.switched(); } return s; };
        const s5 = held(5, 30, 60), s10 = held(10, 30, 60);
        ok(Math.abs(s5.mult() - 1.5) < 0.011 && Math.abs(s10.mult() - 2) < 0.011 && Math.abs(held(40, 30, 60).mult() - 3) < 1e-9, 'the multiplier grows by 0.1 a second, from 1.0 up to 3.0 after 20 s');
        ok(s10.points > 2 * s5.points, 'twice as long gives more than twice the points (' + Math.round(s5.points) + ' after 5 s, ' + Math.round(s10.points) + ' after 10 s)');
        const sw = held(5, 30, 60, [2000]);
        ok(Math.abs(sw.mult() - s5.mult() - RULES.SWITCH_MULT) < 1e-9 && sw.points > s5.points + RULES.SWITCH_BONUS, 'a switch adds 0.5 to the multiplier and 150 points at once');
        ok(Math.abs(held(5, 30, 60, [500, 1000, 1500, 2000, 2500, 3000]).mult() - s5.mult() - RULES.SWITCH_MULT_MAX) < 1e-9, 'the multiplier takes no more than four switches');
        const saw = new Score(), smooth = new Score();
        for (let i = 0; i < 300; i++) { const t = i * 20; saw.step(0.02, 30 + 8 * Math.sin(2 * Math.PI * t / 1000), 60, t); smooth.step(0.02, 30, 60, t); }
        ok(saw.reversals >= 10 && smooth.reversals === 0 && saw.points < 0.7 * smooth.points && smooth.finish(false).smooth === 1.2 && saw.finish(false).smooth < 0.9,
            'a sawing angle earns less than a smooth one of the same size: ' + Math.round(saw.points) + ' against ' + Math.round(smooth.points) + ' points (' + saw.reversals + ' reversals)');
        const noisy = new Score();
        for (let i = 0; i < 300; i++) noisy.step(0.02, 30 + 2 * Math.sin(i * 1.7), 60, i * 20);
        ok(noisy.reversals === 0, 'an angle that only trembles by 2 degrees is smooth');
        // (the angle of the re-check's probe: up to 30 degrees in a second, then 30 +- 4 once a second, at 50 km/h for 20 s)
        const sawFrom = (from) => { const s = new Score(); for (let t = from; t < 21; t += 0.02) s.step(0.02, t < 1 ? 10 + 20 * t : 30 + 4 * Math.sin(2 * Math.PI * (t - 1)), 50, t * 1000); return s.finish(false); };
        const s0 = sawFrom(0), s1 = sawFrom(1), s125 = sawFrom(1.25);
        // (from 60 other moments of the first 3 s: against what the count from the start angle finds after the same moment)
        const sawUntil = (to) => { const s = new Score(); for (let t = 0; t < to - 1e-9; t += 0.02) s.step(0.02, t < 1 ? 10 + 20 * t : 30 + 4 * Math.sin(2 * Math.PI * (t - 1)), 50, t * 1000); return s.reversals; };
        const lost = [];
        for (let k = 1; k <= 60; k++) lost.push(sawFrom(k * 0.05).reversals - (s0.reversals - sawUntil(k * 0.05)));
        ok([s1, s125].every((x) => Math.abs(x.reversals - s0.reversals) <= 1 && x.smooth < 0.8) && s0.reversals >= 38 && s0.smooth < 0.8,
            'the same sawing angle (30 +- 4 degrees once a second) counted from the start angle on, from 1 s later and from 1.25 s later: ' + [s0, s1, s125].map((x) => x.reversals).join(', ') + ' reversals (the same within one), smoothness x' +
            [s0, s1, s125].map((x) => x.smooth).join(', x') + '. A count that begins in the middle of the sawing finds its direction from the lowest and the highest angle so far');
        ok(Math.min.apply(null, lost) >= -2 && Math.max.apply(null, lost) <= 0 && Math.min.apply(null, lost) < -1, '  begun at any of 60 moments of its first 3 s, the count finds ' + -Math.max.apply(null, lost) + ' to ' + -Math.min.apply(null, lost) +
            ' reversals fewer than the count from the start angle finds after that moment: the same within TWO, not one (a count that begins in the middle of a swing needs that swing for its direction, and can miss the reversal that was under way as well)');
        const fin = s5.finish(false), spun = s5.finish(true);
        ok(spun.score === Math.round(fin.score / 2) || Math.abs(spun.score - fin.score / 2) <= 0.5, 'a spin keeps half the points (' + fin.score + ' becomes ' + spun.score + ')');
        ok(grade(0) === 'D' && grade(149) === 'D' && grade(150) === 'C' && grade(499) === 'C' && grade(500) === 'B' && grade(1199) === 'B' && grade(1200) === 'A' && grade(2999) === 'A' && grade(3000) === 'S',
            'grades: D under 150, C from 150, B from 500, A from 1200, S from 3000');
        const again = held(5, 30, 60, [2000]);
        ok(again.points === sw.points && JSON.stringify(again.finish(false)) === JSON.stringify(sw.finish(false)), 'the same steps give the same score, to the last digit');
    });

    await ok.part('when a drift starts, switches and ends (drift.js, the tracker alone)', async () => {
        let r = track((t) => -ramp(t, 1, 2, 0, 30) + ramp(t, 6, 7, 0, 30), 9);
        ok(r.recs.length === 1 && r.recs[0].end === 'ended' && r.recs[0].dir === 'L' && r.recs[0].switches === 0 && r.recs[0].flags.length === 0, 'an angle that rises to 30 degrees, holds and falls back: one drift, to the LEFT (negative angle), no flag');
        const d = r.recs[0], t10 = 1 + 10 / 30, t6 = 7 - 6 / 30;
        ok(Math.abs(d.time - (t6 - t10)) <= 0.05, 'it counts from the moment the angle reached the start angle to the moment it went under the end angle: ' + d.time + ' s (' + (t6 - t10).toFixed(2) + ' s by the angle); the 0.6 s it waited to be sure are not counted');
        ok(r.states[Math.round((t10 + 0.2) * 50)] === 'ready' && r.states[Math.round((t10 + 0.4) * 50)] === 'drift', 'it is a drift once the angle has been at the start angle for 0.3 s');
        ok(Math.abs(d.peak - 30) < 0.01 && d.avg > 25 && d.avg < 30 && Math.abs(d.dist - d.time * 60 / 3.6) < 0.5 && d.entry === 60 && d.minKmh === 60, 'its data: peak ' + d.peak + ', average ' + d.avg + ' degrees, ' + d.dist + ' m, entry 60 km/h');
        ok(d.trace.a.length >= 40 && d.trace.a.length <= RULE.TRACE_MAX && d.trace.a.every((x) => x <= 0 && Number.isInteger(x)) && d.trace.v.every((x) => x === 60) && d.trace.ms === 100, 'and a trace of ' + d.trace.a.length + ' points, one every 100 ms (negative = LEFT)');
        r = track((t) => ramp(t, 1, 2, 0, 30) - ramp(t, 6, 7, 0, 30), 9);
        ok(r.recs.length === 1 && r.recs[0].dir === 'R', 'the same the other way: to the RIGHT');
        r = track((t) => -ramp(t, 1, 2, 0, 30) + ramp(t, 6, 7, 0, 30), 9, { x: { left: -1 } });
        ok(r.recs.length === 1 && r.recs[0].dir === 'R' && r.recs[0].trace.a.every((x) => x >= 0), 'where the wheels have shown that positive sideways acceleration is a right-hand turn, left and right are the other way round');
        r = track((t) => -ramp(t, 1, 1.2, 0, 12) + ramp(t, 1.4, 1.5, 0, 12), 4);
        ok(r.recs.length === 0, 'an angle at the start angle for less than 0.3 s is no drift');
        r = track((t) => -ramp(t, 1, 2, 0, 9.5), 6);
        ok(r.recs.length === 0 && r.tr.state === 'ready', 'an angle that stays under the start angle is no drift');
        r = track((t) => ({ deg: -ramp(t, 1, 2, 0, 30) + ramp(t, 6, 7, 0, 30), kmh: 18 }), 9);
        ok(r.recs.length === 0, 'under the minimum speed nothing starts');
        r = track((t) => ({ deg: -ramp(t, 1, 2, 0, 30) + ramp(t, 6, 7, 0, 30), more: { r: -25 * DEG } }), 9);
        ok(r.recs.length === 0, 'the nose pointing OUT of the turn (angle and yaw rate of the same sign) is no drift');
        r = track((t) => ({ deg: -ramp(t, 1, 2, 0, 30) + ramp(t, 6, 7, 0, 30), more: { r: 0.5 * DEG } }), 9);
        ok(r.recs.length === 0, 'nor is an angle on a car that is not turning');
        r = track((t) => ({ deg: -ramp(t, 1, 2, 0, 30) + ramp(t, 6, 7, 0, 30), more: { over: -4 * DEG, d: 0.1 } }), 9);
        ok(r.recs.length === 0, 'where the steering is known and the car turns LESS than it is steered, nothing starts');
        // --- without steering the acceleration check has a say in what starts, and nothing of it can be a best
        const shape = (t) => -ramp(t, 1, 2, 0, 30) + ramp(t, 6, 7, 0, 30);
        const plain = track(shape, 9).recs[0];
        const ns = (more) => (t) => ({ deg: shape(t), more: Object.assign({}, NS, typeof more === 'function' ? more(t) : more) });
        r = track(ns({ acc: -1 * DEG }), 9);
        ok(r.recs.length === 0 && r.states.every((x) => x === 'ready'), 'without steering, an angle that the acceleration check speaks against (it can speak, and shows 1 degree where the sum says 30) starts nothing, however long it lasts');
        r = track(ns((t) => ({ acc: 0.8 * shape(t) * DEG })), 9);
        ok(r.recs.length === 1 && r.recs[0].flags.join() === FLAGS.STEER && r.recs[0].score === plain.score && !canBeBest(r.recs[0]) && canBeBest(plain), 'one that it does see starts and is scored as any other (' + r.recs[0].score + ' points), but it is flagged NO STEERING CHECK and cannot be a best');
        r = track(ns({ acc: null, accStrong: false }), 9);
        ok(r.recs.length === 1 && r.recs[0].flags.join() === FLAGS.STEER && Math.abs(r.recs[0].time - plain.time) <= 0.03 && r.recs[0].score === plain.score,
            'where the check cannot speak at all (too little sideways acceleration: low grip, a large angle, and a gentle banked corner too) the drift starts on the summed angle, as soon as with steering (' + r.recs[0].time + ' s, ' + r.recs[0].score + ' points), flagged NO STEERING CHECK');
        r = track(ns((t) => ({ accStrong: false, acc: t < 1.64 ? -1 * DEG : shape(t) * DEG })), 9);
        ok(r.recs.length === 1 && Math.abs(r.recs[0].time - plain.time) <= 0.03 && r.recs[0].score === plain.score,
            'the check speaks against it for the first 0.3 s and then sees it: the drift waits for the check to come round and still counts from where it began (' + r.recs[0].time + ' s, ' + r.recs[0].score + ' points)');
        r = track(ns((t) => ({ accStrong: false, acc: t < 3 ? -1 * DEG : shape(t) * DEG })), 9);
        ok(r.recs.length === 1 && r.recs[0].time < plain.time - 1.5 && r.recs[0].time > plain.time - 2.5, 'it speaks against it for 1.7 s: a drift waits no longer than a second, so this one counts from later (' + r.recs[0].time + ' s of ' + plain.time + ')');
        r = track(ns({ hasAx: false, acc: null, accStrong: false }), 9);
        ok(r.recs.length === 1 && r.recs[0].flags.join() === FLAGS.STEER && r.recs[0].score === plain.score, 'a car with neither steering nor a forward acceleration has no check at all: its drift is counted on the summed angle, and flagged NO STEERING CHECK');
        // --- NO STEERING CHECK: what the steering must have done for a drift to be a best
        r = track((t) => ({ deg: shape(t), more: { acc: null, accStrong: false } }), 9);
        ok(r.recs.length === 1 && r.recs[0].flags.length === 0 && r.recs[0].back === 100 && canBeBest(r.recs[0]), 'with the steering backing the drift no acceleration check is asked for: no flag, and it may be a best');
        const why = (sw) => track((t) => ({ deg: shape(t), more: { sw } }), 9).recs[0];
        ok(['off', 'nosource', 'stale', 'unlearned'].every((x) => why(x).flags.join() === FLAGS.STEER && why(x).back === 0 && !canBeBest(why(x))),
            'NO STEERING CHECK whatever keeps the steering from backing the drift: switched off, no source, gone silent, not learned. The acceleration check sees the angle in all four: it no longer takes a flag away');
        const backedFor = (until) => track((t) => ({ deg: shape(t), more: t < until ? {} : { sw: 'stale', d: null, over: null, steering: false } }), 9).recs[0];
        ok(backedFor(3.5).flags.join() === FLAGS.STEER && backedFor(4.5).flags.length === 0, 'the steering must back a drift for half of its time: one of 5.5 s whose steering goes silent after 2.2 s is flagged (backed ' + backedFor(3.5).back + ' %), after 3.2 s not (' + backedFor(4.5).back + ' %)');
        const grip = (over, d) => track((t) => ({ deg: shape(t), more: { over: over * DEG, d: d * DEG } }), 9).recs[0].flags.join();
        ok(grip(1.4, 0.2) === FLAGS.STEER && grip(1.6, 0.2) === '', 'and it backs a drift only where it says that the car oversteers: it turns 1.5 degrees or more, at the wheels, further than it is steered (1.4: flagged; 1.6: not)');
        ok(grip(3, 4) === FLAGS.STEER && grip(3, 2) === '', '  and by half of what its path asks of the wheels at least: 3 degrees where the path asks 7 is what a tight corner looks like on a steering scale that was learned too small (flagged); 3 where it asks 5: not');
        // switches
        r = track((t) => -ramp(t, 1, 2, 0, 30) + ramp(t, 4, 5, 0, 60) - ramp(t, 8, 9, 0, 30), 11);
        ok(r.recs.length === 1 && r.recs[0].switches === 1 && r.recs[0].dir === 'L' && r.recs[0].end === 'ended', 'the angle crosses zero and reaches the start angle on the other side within a second: one drift with one switch (its direction is the one it began with)');
        const noSw = track((t) => -ramp(t, 1, 2, 0, 30) + ramp(t, 8, 9, 0, 30), 11).recs[0];
        ok(r.recs[0].mult === Math.round((noSw.mult + 0.5 + 0.1 * (r.recs[0].time - noSw.time)) * 100) / 100 || Math.abs(r.recs[0].mult - noSw.mult - 0.5) < 0.05, 'and the switch is in its multiplier (' + r.recs[0].mult + ' against ' + noSw.mult + ' without)');
        r = track((t) => -ramp(t, 1, 2, 0, 30) + ramp(t, 4, 4.8, 0, 30) + ramp(t, 4.8, 6.6, 0, 9) + ramp(t, 6.6, 7, 0, 21) - ramp(t, 9, 10, 0, 30), 12);
        ok(r.recs.length === 2 && r.recs[0].switches === 0 && r.recs[0].dir === 'L' && r.recs[1].dir === 'R' && Math.abs(r.recs[0].time - (4.64 - 1.333)) < 0.06,
            'it crosses zero and takes 1.9 s to reach the start angle on the other side: the first drift ended where it went under the end angle (' + r.recs[0].time + ' s), and a second one began on the other side');
        r = track((t) => -ramp(t, 1, 2, 0, 30) + ramp(t, 4, 4.8, 0, 30) + ramp(t, 4.8, 5.2, 0, 4) - ramp(t, 5.2, 5.6, 0, 4) - ramp(t, 5.6, 6, 0, 25) + ramp(t, 8, 9, 0, 25), 11);
        ok(r.recs.length === 2 && r.recs[0].switches === 0 && r.recs[1].switches === 0 && r.recs[1].dir === 'L', 'it dips through zero for under a second and comes back on the same side after more than 0.6 s under the end angle: that drift ended, a new one began');
        r = track((t) => -ramp(t, 1, 2, 0, 30) + ramp(t, 4, 4.3, 0, 26) - ramp(t, 4.6, 4.9, 0, 26) + ramp(t, 8, 9, 0, 30), 11);
        ok(r.recs.length === 1 && r.recs[0].switches === 0, 'a dip under the end angle for less than 0.6 s is the same drift');
        // spin, slow, lost
        r = track((t) => -ramp(t, 1, 2, 0, 30) - ramp(t, 4, 5.5, 0, 120), 8);
        ok(r.recs.length === 1 && r.recs[0].end === 'spin' && r.recs[0].flags.join() === FLAGS.SPIN && Math.abs(r.recs[0].peak - 100) < 2, 'the angle passes 100 degrees: the drift ends as a SPIN there, and the car turning on beyond that starts no new drift');
        const clean = track((t) => -ramp(t, 1, 2, 0, 30) - ramp(t, 4, 5.5, 0, 120), 4 + 1.5 * 70 / 120 - 0.02, {}).tr.running(0);
        ok(r.recs[0].score <= Math.round(clean.score * 1.02 / 2) + 1 && r.recs[0].score >= Math.round(clean.score / 2), 'the spin kept half its points (' + r.recs[0].score + ' of about ' + clean.score + ')');
        r = track((t) => ({ deg: t < 7 ? -ramp(t, 1, 2, 0, 30) - ramp(t, 4, 5.5, 0, 120) + ramp(t, 6, 7, 0, 150) : -ramp(t, 9, 10, 0, 30) + ramp(t, 13, 14, 0, 30), more: { rest: t > 7.2 && t < 8.8 } }), 16);
        ok(r.recs.length === 2 && r.recs[1].end === 'ended', 'after the car has gone straight again (a rest), a new drift counts');
        r = track((t) => ({ deg: -ramp(t, 1, 2, 0, 30), kmh: ramp(t, 4, 6, 60, 15) }), 8);
        ok(r.recs.length === 1 && r.recs[0].end === 'slow' && Math.abs(r.recs[0].minKmh - 20) < 0.5 && !r.recs[0].flags.includes(FLAGS.SPIN), 'the speed falls under the minimum while the car still rolls at 15 km/h: the drift ends there (' + r.recs[0].minKmh + ' km/h), no spin');
        r = track((t) => { const kmh = ramp(t, 4, 5, 60, 0); return kmh < 10 ? { deg: 0, kmh, more: { ok: false, why: 'slow', beta: 0 } } : { deg: -ramp(t, 1, 2, 0, 40), kmh }; }, 8);
        ok(r.recs.length === 1 && r.recs[0].end === 'spin' && r.recs[0].flags.includes(FLAGS.SPIN), 'the car all but stops within 1.5 s while still 40 degrees sideways: a SPIN');
        r = track((t) => ({ deg: t < 7 ? -ramp(t, 1, 2, 0, 30) + ramp(t, 6, 7, 0, 30) : -ramp(t, 9, 10, 0, 30) + ramp(t, 13, 14, 0, 30), more: { lost: t > 3 && t < 3.03, rest: t > 7.2 && t < 8.8 } }), 16);
        ok(r.recs.length === 2 && r.recs[0].end === 'lost' && r.recs[0].flags.join() === FLAGS.GAP && Math.abs(r.recs[0].time - (3 - 1.333)) < 0.08 && r.recs[1].end === 'ended' && r.recs[1].flags.length === 0,
            'what was learned about the yaw rate changes under a running drift (angle.js drops the angle): the drift ends there, flagged DATA GAP; the 30 degrees that follow start nothing; after the car has gone straight a new drift counts');
        r = track((t) => (t > 4 ? { deg: 0, more: { ok: false, why: 'noyaw', beta: 0 } } : { deg: -ramp(t, 1, 2, 0, 30) }), 6);
        ok(r.recs.length === 1 && r.recs[0].end === 'lost' && r.recs[0].flags.includes(FLAGS.GAP) && r.tr.state === 'off' && r.tr.why === 'noyaw', 'the angle is lost while a drift runs: the drift ends there, flagged DATA GAP');
        // flags
        const flagsOf = (more, tracker) => track((t) => ({ deg: -ramp(t, 1, 2, 0, 30) + ramp(t, 6, 7, 0, 30), more: typeof more === 'function' ? more(t) : more }), 9, { tracker }).recs[0].flags.join();
        ok(flagsOf({ state: 'learning' }) === FLAGS.UNCAL && flagsOf((t) => ({ state: t > 3 && t < 3.1 ? 'learning' : 'learned' })) === FLAGS.UNCAL, 'UNCALIBRATED while the yaw rate is still being learned, be it for a moment of the drift');
        const mid40 = (pm) => track((t) => ({ deg: -ramp(t, 1, 2, 0, 40) + ramp(t, 6, 7, 0, 40), more: { pm } }), 9).recs[0].flags.join();
        ok(mid40(8.1) === FLAGS.UNSURE && mid40(7.9) === '', 'ANGLE UNSURE when the +- is more than a fifth of the peak angle (40 degrees: 8)');
        const small = (pm) => track((t) => ({ deg: -ramp(t, 1, 2, 0, 15) + ramp(t, 6, 7, 0, 15), more: { pm } }), 9).recs[0].flags.join();
        const big = (pm) => track((t) => ({ deg: -ramp(t, 1, 2, 0, 80) + ramp(t, 6, 7, 0, 80), more: { pm } }), 9).recs[0].flags.join();
        ok(small(6.9) === '' && small(7.1) === FLAGS.UNSURE && flagsOf({ pm: 6.9 }) === '' && flagsOf({ pm: 7.1 }) === FLAGS.UNSURE && big(9.9) === '' && big(10.1) === FLAGS.UNSURE,
            '7 degrees of +- are always allowed (a 15 and a 30 degree drift), more than 10 never (an 80 degree one). 7, because clean data alone settles at 5 to 6.5');
        ok(flagsOf((t) => ({ gap: t > 3 && t < 3.03 ? 300 : 0 })) === FLAGS.GAP && flagsOf((t) => ({ gap: t > 3 && t < 3.03 ? 290 : 0 })) === '', 'DATA GAP for a gap of 300 ms or more during the drift');
        ok(flagsOf((t) => ({ gap: t > 0.2 && t < 0.23 ? 400 : 0 })) === FLAGS.GAP && track((t) => ({ deg: -ramp(t, 5, 6, 0, 30) + ramp(t, 9, 10, 0, 30), more: { gap: t > 0.2 && t < 0.23 ? 400 : 0 } }), 12).recs[0].flags.length === 0, 'or in the 3 s before it began (5 s before: no flag)');
        ok(track((t) => ({ deg: -ramp(t, 1, 2, 0, 30) + ramp(t, 6, 7, 0, 30), more: { state: 'none' } }), 9).recs.length === 0, 'nothing is counted while the yaw rate\'s scale is the stated default alone ("none")');
        ok(flagsOf({ slot: 200 }) === FLAGS.RATE && flagsOf({ slot: 100 }) === '' && flagsOf({ slot: 126 }) === FLAGS.RATE, 'LOW DATA RATE under 8 samples a second');
        ok(flagsOf({}, { demo: true }) === FLAGS.DEMO, 'DEMO on every drift of a demo');
        ok(flagsOf({ state: 'learning', pm: 20, slot: 200, sw: 'off' }, { demo: true }) === [FLAGS.UNCAL, FLAGS.UNSURE, FLAGS.STEER, FLAGS.RATE, FLAGS.DEMO].join(), 'several flags at once, in a fixed order');
        const best = track((t) => -ramp(t, 1, 2, 0, 30) + ramp(t, 6, 7, 0, 30), 9).recs[0];
        ok(canBeBest(best) && Object.keys(FLAGS).length === 7 && [FLAGS.UNCAL, FLAGS.UNSURE, FLAGS.STEER, FLAGS.GAP, FLAGS.RATE, FLAGS.SPIN, FLAGS.DEMO].every((f) => !canBeBest(Object.assign({}, best, { flags: [f] }))) && !canBeBest(null) && !canBeBest({ score: 5 }),
            'a drift without a flag may be a best; any one of the seven flags keeps it from being one');
        // the rest of the data
        r = track((t) => -ramp(t, 1, 2, 0, 30) + ramp(t, 6, 7, 0, 30), 9, { x: { wheelspin: 0.42, pedal: 0.8, hbAt: C0 + 900, hbKnown: true } });
        ok(r.recs[0].wheelspin === 42 && r.recs[0].pedal === 80 && r.recs[0].handbrake === true, 'wheelspin, pedal and "handbrake seen at the start" are kept where they are known');
        r = track(ns({}), 9, { x: { hbKnown: true } });
        ok(r.recs[0].handbrake === false && r.recs[0].wheelspin === null && r.recs[0].pedal === null && r.recs[0].opp === null, 'and say "not known" (null) where they are not: wheelspin, pedal, opposite lock (a car without steering); a handbrake that is known and off says false');
        r = track((t) => ({ deg: -ramp(t, 1, 2, 0, 30) + ramp(t, 6, 7, 0, 30), more: { d: -22 * DEG, over: 20 * DEG } }), 9);
        ok(r.recs[0].opp === 22, 'most opposite lock: the front wheels turned 22 degrees against the turn');
        r = track((t) => -ramp(t, 1, 2, 0, 30) + ramp(t, 61, 62, 0, 30), 64);
        ok(r.recs[0].trace.a.length < RULE.TRACE_MAX && r.recs[0].trace.ms === 400 && Math.abs(r.recs[0].trace.a.length * 0.4 - r.recs[0].time) < 1, 'a drift of a minute keeps a trace of ' + r.recs[0].trace.a.length + ' points, one every 400 ms');
    });

    /* ================= learning ================= */
    await ok.part('learning the car (learn.js)', async () => {
        console.log('\n  What was learned from 5.5 minutes of ordinary driving (the scenes "ordinary" and "gentle"), 20 samples a second:');
        console.log('  car  data   yaw: state     K against the truth   moments (left/right)  spread   steering: state   scale against the truth   moments   left known   ax sign');
        const exp = {};
        for (const carName of ['a', 'b', 'c']) for (const dirty of [false, true]) {
            const car = sim.CARS[carName], st = learned(carName, 50, dirty).status, f = dirty ? sim.DIRTY : sim.CLEAN;
            // what K must come out as: the yaw rate's own scale, times what the sideways acceleration reads too much, over what the speed reads too much
            const roll = dirty ? 1 + f.roll * DEG : 1, kTrue = car.yawSign * car.yawStep * DEG * (dirty ? roll * f.gainY / f.speedGain : 1);
            const kcTrue = car.steerSign * car.steerStep * DEG / car.steerRatio / car.wheelbase * (dirty ? roll * f.gainY / (f.speedGain * f.speedGain) : 1);
            const e = { k: st.yaw.k / kTrue - 1, zero: st.yaw.zero - car.yawZero - (dirty ? car.yawSign * f.yawBias / car.yawStep : 0), kc: st.steer.k / kcTrue - 1, st };
            exp[carName + (dirty ? 'd' : 'c')] = e;
            console.log('  ' + carName + '    ' + (dirty ? 'dirty' : 'clean') + '  ' + st.yaw.state.padEnd(9) + pad((100 * e.k).toFixed(2) + ' %', 17) + pad(st.yaw.n + ' (' + st.yaw.left + '/' + st.yaw.right + ')', 22) + pad((100 * st.yaw.spread).toFixed(1) + ' %', 9) +
                '   ' + st.steer.state.padEnd(9) + pad((100 * e.kc).toFixed(1) + ' %', 26) + pad(st.steer.n, 10) + pad(st.left.known ? 'yes' : 'no', 13) + pad(st.ax.known ? (st.ax.positiveIsForward ? '+' : '-') : '?', 10));
        }
        const all = Object.keys(exp).map((k) => exp[k]);
        ok(all.every((e) => e.st.yaw.state === 'learned' && e.st.steer.state === 'learned'), 'three cars, clean and dirty: the yaw rate and the steering are both "learned" after that drive');
        ok(['ac', 'bc', 'cc'].every((k) => Math.abs(exp[k].k) < 0.005) && ['ad', 'bd', 'cd'].every((k) => Math.abs(exp[k].k) < 0.02),
            'K comes out within 0.5 % of the truth on clean data and within 2 % on dirty data, whatever the raw scale and its sign (the truth for dirty data: the yaw scale times what roll and gain make the sideways acceleration read too much)');
        ok(all.every((e) => Math.abs(e.zero) < 0.6 / 0.002 * 0.004 + 60), 'the yaw zero comes out within a quarter of a degree a second');
        ok(all.every((e) => Math.abs(e.kc) < 0.1), 'the steering scale within 10 % (it is drawn with the yaw rate, and a car that grips still slips a little at the front)');
        ok(all.every((e) => e.st.left.known && e.st.left.positiveIsLeft && e.st.ax.known && e.st.ax.positiveIsForward && e.st.wheels.base > 0.98 && e.st.wheels.base < 1.02), 'the wheels say that positive sideways acceleration is a left-hand turn, the speed says that positive forward acceleration is speeding up, and rear and front wheels turn alike');
        const scored = ['a', 'b', 'c'].reduce((list, c) => list.concat(learned(c, 50, false).recs, learned(c, 50, true).recs), []);
        ok(scored.length === 0, 'and that drive scored nothing on any of them' + (scored.length ? '. COUNTED: ' + scored.map(describe).join(' | ') : ''));

        // the states on the way
        const seen = [];
        const eng = new DriftEngine({ onLearned: (what, state) => seen.push(what + ':' + state) });
        ok(eng.learn.values().state === 'none' && Math.abs(eng.learn.values().k - 0.005 * DEG) < 1e-12 && eng.learn.values().zero === 32768 && eng.learn.values().sstate === 'none',
            'before anything is learned the stated default stands: 0.005 degrees a second per count, zero at 32768');
        const r1 = run({ scene: 'oneway', spacing: 50 });
        const s1 = r1.eng.learn.status();
        ok(s1.yaw.state === 'learning' && s1.yaw.right === 0 && s1.yaw.left >= 20, 'corners one way only (' + s1.yaw.left + ' moments, all left): "learning", never "learned": left and right must both be seen');
        ok(Math.abs(s1.yaw.k / (0.005 * DEG) - 1) < 0.01, 'with the zero from standing or going straight, those corners still give a K to work with meanwhile (within 1 %)');
        sim.drive(eng, sim.sampleAll(truthOf('ordinary', sim.CARS.b), sim.CARS.b, { spacing: 50, rand: sim.rng(3) }));
        ok(seen.join() === 'yaw:learning,yaw:learned' || seen.join() === 'yaw:learning,steer:learning,yaw:learned' || /^yaw:learning,.*yaw:learned/.test(seen.join()), 'the app is told when a state changes (' + seen.join(', ') + ')');

        // (1.0.1) steering moments are kept from the start, also before the yaw rate has its line
        const sf = run({ scene: 'slowfirst', spacing: 50 }).eng.learn.status();
        ok(sf.yaw.state === 'none' && sf.yaw.moments === 0 && sf.steer.state === 'none' && sf.steer.moments >= 8,
            '(1.0.1) slow, gentle corners on a car that has learned nothing: the yaw rate takes no moment from them (they are under its 30 km/h and its 1.5 m/s2), and ' + sf.steer.moments + ' steering moments are kept all the same, with no line yet. 1.0.0 kept none: it waited for the yaw rate\'s line, and on the first car the steering was still not learned after 20 minutes');
        const sfo = run({ scene: ['slowfirst', 'ordinary'], spacing: 50 }), so = sfo.eng.learn.status(), carA = sim.CARS.a, kcA = carA.steerSign * carA.steerStep * DEG / carA.steerRatio / carA.wheelbase;
        const only = run({ scene: 'ordinary', spacing: 50 }).eng.learn.status();
        ok(so.yaw.state === 'learned' && so.steer.state === 'learned' && Math.abs(so.steer.k / kcA - 1) < 0.1 && only.steer.state !== 'learned' && sfo.recs.length === 0,
            '(1.0.1) followed by the scene "ordinary" (corners at 44 to 100 km/h): once the yaw rate has its line the steering\'s is drawn through the moments kept before, and it is "learned" (' + so.steer.n + ' moments, its scale within ' + (100 * Math.abs(so.steer.k / kcA - 1)).toFixed(1) +
            ' % of the truth). The same ordinary driving alone leaves the steering "' + only.steer.state + '" with ' + only.steer.moments + ' moments. Nothing was scored');
        const { STEER, YAW } = LearnMod;
        ok(STEER.V_LO === 12 && STEER.V_HI === 60 && STEER.AY_LO === 0.5 && STEER.AY_HI === 2.5 && STEER.NEED === 14 && STEER.NEED_SIDE === 4 && STEER.SPREAD === 0.12 && YAW.V_LO === 30 && YAW.V_HI === 110 && YAW.AY_LO === 1.5 && YAW.NEED === 20 && YAW.NEED_SIDE === 6 && YAW.SPREAD === 0.08,
            '(1.0.1) no learning limit was changed with it: the steering still learns at 12 to 60 km/h with 0.5 to 2.5 m/s2, 14 moments, 4 each way, within 12 %; the yaw rate at 30 to 110 km/h from 1.5 m/s2, 20 moments, 6 each way, within 8 %');

        // not from a slide
        const L = learned('a', 50, true);
        const before = L.status.yaw;
        const after = run({ scene: ['held', 'circle', 'switches', 'wetcircle', 'handbrake', 'right'], spacing: 50, dirty: true, saved: L.saved }).eng.learn.status().yaw;
        ok(Math.abs(after.k / before.k - 1) < 0.002 && after.n - before.n <= 2, 'once learned, six drifts change K by ' + (100 * Math.abs(after.k / before.k - 1)).toFixed(2) + ' % (' + (after.n - before.n) + ' new moments): it does not learn from a slide');
        const Lnw = learned('a', 50, false, { off: ['wheels'] });
        const afterNw = run({ scene: ['wetcircle', 'held', 'circle'], spacing: 50, saved: Lnw.saved, off: ['wheels'] }).eng.learn.status().yaw;
        ok(afterNw.n === Lnw.status.yaw.n && Math.abs(afterNw.k / Lnw.status.yaw.k - 1) < 1e-5, 'nor on a learned car without wheel speeds, where only the engine\'s own "the car is sliding" keeps the wet pan\'s steady slide out (' + (afterNw.n - Lnw.status.yaw.n) + ' new moments in three drifts)');
        const wet = run({ scene: 'wetcircle', spacing: 50 }).eng.learn.status().yaw;
        ok(wet.moments === 0, 'before anything is learned, 16 s of steady drifting on a wet pan with wheel speeds: no moment taken (the rear wheels turn faster than the front ones)');
        const wetNo = run({ scene: 'wetcircle', spacing: 50, off: ['wheels'] }).eng.learn.status().yaw;
        ok(wetNo.moments === 0, 'the same without wheel speeds: no moment either. The car feels 1.4 m/s2 of forward acceleration that its speed does not show, and that is a slide');
        const both = run({ scene: 'wetboth', spacing: 50 }), bothNo = run({ scene: 'wetboth', spacing: 50, off: ['wheels'] });
        ok(both.eng.learn.status().yaw.moments === 0 && bothNo.eng.learn.status().yaw.moments === 0 && both.eng.learn.values().state === 'none' && both.recs.length === 0 && bothNo.recs.length === 0,
            'a car that has learned nothing is drifted in steady circles BOTH ways on a wet pan, its rear wheels spinning by only 10 % (too little for the wheel test), with and without wheel speeds: no moment, "not learned", and nothing counted');
        const wetBare = run({ scene: 'wetboth', spacing: 50, off: ['wheels', 'long'] }).eng.learn.status().yaw;
        ok(wetBare.state === 'learned' && wetBare.k / (0.005 * DEG) < 0.95, 'KNOWN LIMIT: the same on a car with neither wheel speeds nor a forward acceleration: ' + wetBare.moments + ' moments are taken from the slides (' + wetBare.left + ' left, ' + wetBare.right + ' right), and the car counts as "learned" with K ' +
            (100 * (1 - wetBare.k / (0.005 * DEG))).toFixed(1) + ' % low (the cosine of the angle). Nothing in what is left tells a steady slide from a steady corner');
        const mixed = run({ scene: ['wetboth', 'ordinary'], spacing: 50, off: ['wheels', 'long'] }).eng.learn.status().yaw;
        ok(mixed.state !== 'none' && Math.abs(mixed.k / (0.005 * DEG) - 1) < 0.02, 'those slide moments followed by an ordinary drive: K is within 2 % (' + (100 * (mixed.k / (0.005 * DEG) - 1)).toFixed(2) + ' %, "' + mixed.state + '"): the fit takes the middle one');

        // the fit itself
        const pts = [];
        const rand = sim.rng(5);
        for (let i = 0; i < 40; i++) { const x = 1000 + (i % 2 ? 1 : -1) * rand.between(50, 400); pts.push({ x, y: 0.002 * (x - 1000) * (1 + 0.01 * (rand() - 0.5)) }); }
        for (let i = 0; i < 8; i++) pts[i * 5].y *= 0.6;                           // every fifth one taken in a slide
        const fit = fitLine(pts, null, 2, 6);
        ok(Math.abs(fit.k / 0.002 - 1) < 0.02 && Math.abs(fit.zero - 1000) < 5, 'the line fit with a fifth of its moments 40 % off: the slope is within 2 %, the zero within 5 counts of 1000');
        ok(fitLine(pts.filter((p) => p.y > 0), null, 2, 6) === null && fitLine(pts.filter((p) => p.y > 0), 1000, 2, 6) !== null && fitLine([], null, 2, 6) === null, 'no line from one side alone unless the zero is known from elsewhere');

        // saved and loaded
        const ex = L.saved, text = JSON.stringify(ex);
        const back = new Learn({ saved: JSON.parse(text) });
        ok(JSON.stringify(back.export()) === text && back.values().state === 'learned' && Math.abs(back.values().k / before.k - 1) < 1e-4 && back.values().sstate === 'learned', 'what was learned is saved and loaded again: the same K, the same states (' + text.length + ' characters)');
        ok(!/lat|lon|course|heading|position/i.test(Object.keys(ex).join() + Object.keys(ex.wheels).join()) && Object.keys(ex).sort().join() === 'ax,pedal,steer,v,wheels,yaw', 'the saved object holds: the yaw moments, the steering moments, the pedal\'s range, the wheel ratios and two tallies. No position, course or heading is ever handed to learn.js');
        const flat = [];
        (function walk(x) { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === 'object') Object.keys(x).forEach((k) => walk(x[k])); else flat.push(x); })(ex);
        ok(flat.every((x) => x === null || (typeof x === 'number' && isFinite(x))), 'and nothing but numbers');
        for (const bad of [null, 5, 'x', [], {}, { v: 2 }, { v: 1, yaw: 'no' }, { v: 1, yaw: { a: [[1, 'x'], [NaN, 2], 7, null, [1, 2, 3]] }, steer: { b: 5 }, pedal: { min: 9, max: 2 }, wheels: { r: 'x', yes: -4 }, ax: 7 }]) {
            const l = new Learn({ saved: bad });
            if (l.values().state !== 'none' || l.values().sstate !== 'none' || l.status().pedal.min !== null) ok(false, 'a damaged saved object was taken: ' + JSON.stringify(bad));
        }
        ok(true, 'a saved object that is damaged, or of another version, changes nothing and throws nothing');
        back.reset();
        ok(back.values().state === 'none' && back.status().yaw.moments === 0 && back.status().pedal.max === null && JSON.stringify(back.export().yaw) === '{}', 'reset() forgets all of it');
        const two = new Learn({ saved: JSON.parse(text), yawKey: 'yaw' });
        two.use({ yawKey: 'other' });
        const none = two.values().state;
        two.use({ yawKey: 'yaw' });
        ok(none === 'none' && two.values().state === 'learned', 'each yaw source has its own moments: another source starts from nothing, and the first one\'s are still there');
        const p = new Learn({});
        ok(p.pedal(100) === null && p.pedal(900) === 1 && p.pedal(500) === 0.5 && p.pedal(4095) === null && p.pedal('x') === null && p.status().pedal.max === 900, 'the accelerator is a share of the range seen so far; 4095 (the car\'s "no value") is not taken');
    });

    /* ================= the angle: the tables ================= */
    let TAB = null;
    await ok.part('the angle against the truth (the error tables)', async () => {
        console.log('\n  ERRORS OF THE ESTIMATED DRIFT ANGLE, in degrees, on made-up car "a". Nothing here was measured on a car.');
        console.log('  worst: the largest error while the angle is defined (in "spin": until the true angle passes 100 degrees).');
        console.log('  typ: the middle error while the car is turning.   +-ok: the share of the time the error is within the +- shown.');
        console.log('  clean: every source on one even grid, every slot sent, no sensor fault but the raw units.');
        console.log('  dirty: body roll 4.2 deg/g, gain and zero errors, noise, a speed reading 2 % high; sent on change only, each stamp');
        console.log('         up to 0.3 slots late, speed and wheels no faster than 10/s, the wheels in lumps, the app held up once for 120 ms,');
        console.log('         and four lone nonsense values (two in the yaw rate, one each in the sideways acceleration and the speed).');
        const T = {};
        T.cs = table('AFTER LEARNING, WITH STEERING, CLEAN', { dirty: false });
        T.ds = table('AFTER LEARNING, WITH STEERING, DIRTY', { dirty: true });
        T.cn = table('AFTER LEARNING, WITHOUT STEERING, CLEAN', { dirty: false, useSteer: false, off: ['steer'], learnExtra: { off: ['steer'] } });
        T.dn = table('AFTER LEARNING, WITHOUT STEERING, DIRTY', { dirty: true, useSteer: false, off: ['steer'], learnExtra: { off: ['steer'] } });
        T.cb = table('BEFORE LEARNING (car "a": its yaw scale happens to be the stated default), CLEAN', { dirty: false, learn: false });
        T.db = table('BEFORE LEARNING (car "a"), DIRTY', { dirty: true, learn: false });
        TAB = T;

        console.log('\n  BEFORE LEARNING on the other two cars (their yaw scale is not the default; "b" has the sign turned round), 20/s, clean:');
        const wild = {};
        for (const c of ['b', 'c']) { wild[c] = {}; for (const s of ['held', 'ordinary']) { wild[c][s] = cell(s, { carName: c, rate: 20, learn: false }); console.log('  car ' + c + ', ' + s.padEnd(9) + ' worst ' + pad(f1(wild[c][s].worst), 6) + '   drifts: ' + (wild[c][s].recs.map(describe).join(' | ') || 'none')); } }

        console.log('\n  THE OTHER TWO CARS after learning, dirty, 20/s: worst / typ, with and without steering');
        const other = {};
        for (const c of ['b', 'c']) {
            other[c] = {};
            for (const s of ALL_SCENES) {
                const w = cell(s, { carName: c, rate: 20, dirty: true }), n = cell(s, { carName: c, rate: 20, dirty: true, useSteer: false, off: ['steer'], learnExtra: { off: ['steer'] } });
                other[c][s] = { w, n };
                console.log('  car ' + c + '  ' + s.padEnd(11) + pad(f1(w.worst), 6) + pad(f1(w.typ), 6) + '   |' + pad(f1(n.worst), 6) + pad(f1(n.typ), 6));
            }
        }

        console.log('\n  WHAT THE DRIFTS WERE READ AS (after learning, 20/s): peak angle and time against the truth, score');
        console.log('  scene      data    steering   peak read / true    time read / true    score  grade  flags');
        const DR = {};
        for (const s of ['held', 'right', 'circle', 'switches', 'handbrake', 'spin']) for (const d of [false, true]) for (const st of [true, false]) {
            const key = (d ? 'd' : 'c') + (st ? 's' : 'n'), c = T[key][s][20], rec = c.recs[0], tr = c.truth;
            let peak = 0, t0 = null, t1 = null;
            for (let i = 0; i < tr.n; i++) { const a = Math.abs(tr.beta[i]) / DEG; if (a > peak) peak = a; if (a >= 10 && t0 === null) t0 = i; if (a >= 6 && t0 !== null) t1 = i; if (a >= 100) break; }
            DR[s + key] = { rec, peak: Math.min(peak, 100), time: (t1 - t0) / 1000 };
            console.log('  ' + s.padEnd(11) + (d ? 'dirty' : 'clean').padEnd(8) + (st ? 'yes' : 'no').padEnd(9) + pad(rec ? f1(rec.peak) : '--', 8) + ' / ' + f1(Math.min(peak, 100)).padEnd(8) + pad(rec ? rec.time.toFixed(2) : '--', 9) + ' / ' + ((t1 - t0) / 1000).toFixed(2).padEnd(8) +
                pad(rec ? rec.score : '--', 8) + pad(rec ? rec.grade : '', 5) + '    ' + (rec ? rec.flags.join(', ') : 'NO DRIFT COUNTED'));
        }
        console.log('  (how far the angle is worked out behind "now", clean: ' + RATES.map((r) => r + '/s: ' + Math.round(T.cs.held[r].lag) + ' ms').join(', ') + ')');

        /* --- the bounds: what was measured, with room --- */
        const drifts5 = ['held', 'right', 'circle', 'switches', 'handbrake'];
        const say = (t, scenes, rates) => f1(worstOf(t, scenes, rates));
        ok(worstOf(T.cs, drifts5) <= 2.5, 'clean, learned, with steering: the angle of every drift scene is within 2.5 degrees of the truth at every rate (worst ' + say(T.cs, drifts5) + ')');
        ok(worstOf(T.cn, drifts5) <= 3, 'clean, learned, without steering: within 3 degrees (worst ' + say(T.cn, drifts5) + ')');
        ok(worstOf(T.ds, drifts5, [10, 20, 50]) <= 6 && worstOf(T.ds, drifts5, [5]) <= 8, 'dirty, learned, with steering: within 6 degrees from 10 samples a second up (worst ' + say(T.ds, drifts5, [10, 20, 50]) + '), within 8 at 5 a second (' + say(T.ds, drifts5, [5]) + ')');
        ok(worstOf(T.dn, drifts5, [10, 20, 50]) <= 7 && worstOf(T.dn, drifts5, [5]) <= 9.5, 'dirty, learned, without steering: within 7 degrees from 10 a second up (worst ' + say(T.dn, drifts5, [10, 20, 50]) + '), within 9.5 at 5 a second (' + say(T.dn, drifts5, [5]) + ')');
        const typs = max(drifts5.map((s) => max(RATES.map((r) => Math.max(T.ds[s][r].typ, T.dn[s][r].typ)))));
        ok(typs <= 4, 'and typically (the middle error while turning) within 4 degrees in every one of those dirty cells (the largest: ' + f1(typs) + ')');
        ok(worstOf(T.cs, ['spin']) <= 5 && worstOf(T.cn, ['spin']) <= 7 && worstOf(T.ds, ['spin']) <= 10.5 && worstOf(T.dn, ['spin']) <= 12, 'a spin, until the true angle passes 100 degrees: within 5 and 7 degrees clean, 10.5 and 12 dirty (' + say(T.cs, ['spin']) + ', ' + say(T.cn, ['spin']) + ', ' + say(T.ds, ['spin']) + ', ' + say(T.dn, ['spin']) + ')');
        const quiet = ['ordinary', 'gentle', 'lanechange', 'slalom', 'understeer', 'braking', 'roundabout'], four = [T.cs, T.ds, T.cn, T.dn];
        ok(four.every((t) => worstOf(t, quiet) <= 4.5), 'where nothing slides the angle stays within 4.5 degrees of the truth in all four tables (' + four.map((t) => say(t, quiet)).join(', ') + '): a lane change, a slalom, understeer, hard braking, a long corner, ordinary driving');
        ok(four.every((t) => worstOf(t, ['bumpy'], [20, 50]) <= 3.5 && worstOf(t, ['bumpy'], [10]) <= 5.5 && worstOf(t, ['bumpy'], [5]) <= 10),
            'KNOWN LIMIT: a bumpy straight: within 3.5 degrees from 20 samples a second up (' + f1(max(four.map((t) => worstOf(t, ['bumpy'], [20, 50])))) + '), but the angle wanders at lower rates, by up to ' + f1(max(four.map((t) => worstOf(t, ['bumpy'], [10])))) + ' degrees at 10 a second and ' + f1(max(four.map((t) => worstOf(t, ['bumpy'], [5])))) + ' at 5 a second (the shaking is quicker than the samples, and the road gives the angle no rest)');
        ok(worstOf(T.cs, ['banked5']) <= 3 && worstOf(T.cn, ['banked5']) <= 5 && worstOf(T.ds, ['banked5']) <= 3.5 && worstOf(T.dn, ['banked5']) <= 4.5, 'a corner banked by 5 degrees reads up to ' + say(T.cs, ['banked5']) + ' degrees with steering and ' + say(T.cn, ['banked5']) + ' without (clean), where the car does not slide at all');
        ok(worstOf(T.cs, ['banked']) <= 5.5 && worstOf(T.cn, ['banked']) <= 9.9 && worstOf(T.dn, ['banked']) <= 9.9, 'KNOWN LIMIT: a corner banked by 12 degrees reads up to ' + say(T.cs, ['banked']) + ' degrees with steering and ' + say(T.cn, ['banked']) + ' without: a banked road reads as sideways acceleration that turns nothing');
        const cov = (t, scenes) => Math.min.apply(null, scenes.map((s) => Math.min.apply(null, RATES.map((r) => t[s][r].cover))));
        ok(cov(T.cs, drifts5) >= 0.95 && cov(T.ds, drifts5) >= 0.9 && cov(T.cn, drifts5) >= 0.95 && cov(T.dn, drifts5) >= 0.9, 'the +- shown covers the error at least 90 % of the time in every drift scene of the four tables (lowest: ' + [T.cs, T.ds, T.cn, T.dn].map((t) => Math.round(100 * cov(t, drifts5)) + ' %').join(', ') + ')');
        ok(cov(T.cn, ['banked']) < 0.9, 'KNOWN LIMIT: on the 12 degree bank without steering it does not (' + Math.round(100 * cov(T.cn, ['banked'])) + ' % of the time): nothing tells the engine that the road is banked');
        // the drifts themselves
        const recOK = (key, s, d) => { const x = DR[s + key]; return !!x.rec && Math.abs(x.rec.peak - x.peak) <= d && Math.abs(x.rec.time - x.time) <= 0.5; };
        ok(['cs', 'cn'].every((k) => drifts5.every((s) => recOK(k, s, 2.5))) && ['ds', 'dn'].every((k) => drifts5.every((s) => recOK(k, s, 5.5))), 'each drift is read with its peak within 2.5 degrees (clean) or 5.5 (dirty) and its time within half a second');
        const over = ['held', 'right', 'circle', 'switches', 'handbrake'].map((s) => DR[s + 'ds'].rec.peak / DR[s + 'ds'].peak - 1);
        ok(over.every((x) => x > 0.03 && x < 0.2), 'KNOWN LIMIT: with dirty data and steering every peak reads HIGH, by ' + Math.round(100 * Math.min.apply(null, over)) + ' to ' + Math.round(100 * Math.max.apply(null, over)) + ' %: the body\'s roll makes the sideways acceleration read 7 % too much on this made-up car, that share goes into K, and the steering check\'s tyre curve is not the car\'s');
        // before learning
        ok(worstOf(T.cb, drifts5) <= 7 && worstOf(T.db, drifts5, [10, 20, 50]) <= 12,
            'before learning, on the car whose yaw scale happens to be the default: within ' + say(T.cb, drifts5) + ' degrees clean and ' + say(T.db, drifts5, [10, 20, 50]) + ' dirty (the default knows nothing of this car\'s roll, and there is no steering scale yet)');
        ok(wild.b.held.worst > 30 && wild.c.held.worst > 5, 'before learning, on a car whose yaw scale is NOT the default, the angle is worthless (worst ' + f1(wild.b.held.worst) + ' and ' + f1(wild.c.held.worst) + ' degrees)');
        ok(driftsOf(T.cb, ALL_SCENES) + driftsOf(T.db, ALL_SCENES) === 0 && wild.b.held.recs.concat(wild.c.held.recs, wild.b.ordinary.recs, wild.c.ordinary.recs).length === 0,
            'so nothing is counted as a drift before a first line is drawn for the yaw rate: none in all 128 runs of those two tables, none on the other two cars');
        const half = run({ scene: ['oneway', 'held'], spacing: 50 });
        ok(half.recs.length === 1 && half.recs[0].flags.includes(FLAGS.UNCAL) && half.worst <= 3 && half.eng.learn.values().state === 'learning',
            'once there is a first line ("learning": here from corners one way only) a drift is counted, flagged UNCALIBRATED, and its angle is within ' + f1(half.worst) + ' degrees (' + half.eng.learn.values().state + ': ' + half.recs.map(describe).join(' | ') + ')');
        ok(['b', 'c'].every((c) => drifts5.every((s) => other[c][s].w.worst <= 7 && other[c][s].n.worst <= 7 && other[c][s].w.recs.length === 1 && other[c][s].n.recs.length === 1)), 'the other two cars after learning, dirty: every drift scene within 7 degrees, with and without steering, one drift each');
        ok(drifts5.every((s) => DR[s + 'cs'].rec.flags.length === 0 && DR[s + 'ds'].rec.flags.length === 0) && DR.spinds.rec.flags.join() === FLAGS.SPIN, 'and a learned car\'s drifts carry no flag at 20 samples a second where the steering backs them, dirty data and all (the spin: SPIN)');
        ok(drifts5.every((s) => DR[s + 'cn'].rec.flags.join() === FLAGS.STEER && DR[s + 'dn'].rec.flags.join() === FLAGS.STEER && !canBeBest(DR[s + 'cn'].rec)), '  without steering each of them carries NO STEERING CHECK and nothing else: it is counted and scored, and cannot be a best');
        const steerFlagged = [];
        [['cs', T.cs], ['ds', T.ds]].forEach((t) => ALL_SCENES.forEach((s) => RATES.forEach((r) => t[1][s][r].recs.forEach((d) => { if (d.flags.includes(FLAGS.STEER)) steerFlagged.push(t[0] + ' ' + s + ' ' + r + '/s: ' + describe(d)); }))));
        ['b', 'c'].forEach((c) => ALL_SCENES.forEach((s) => other[c][s].w.recs.forEach((d) => { if (d.flags.includes(FLAGS.STEER)) steerFlagged.push('car ' + c + ' ' + s + ': ' + describe(d)); })));
        const backLow = Math.min.apply(null, [].concat.apply([], [T.cs, T.ds].map((t) => [].concat.apply([], drifts5.concat(['lowgrip', 'spin']).map((s) => RATES.map((r) => t[s][r].recs[0].back))))));
        ok(steerFlagged.length === 0 && backLow >= 80, 'WHAT THE NEW FLAG COSTS WITH STEERING: nothing here. In the two tables with steering (17 scenes, four rates, clean and dirty) and on the other two cars no drift carries NO STEERING CHECK; the steering backed each for ' + backLow +
            ' % of its time or more, and half is asked' + (steerFlagged.length ? '. FLAGGED: ' + steerFlagged.join(' | ') : ''));
        ok(RATES.every((r) => T.ds.held[r].recs[0].flags.includes(FLAGS.RATE) === (r === 5)), 'at 5 samples a second every drift is flagged LOW DATA RATE, from 10 up none is');
        ok(Math.abs(T.cs.held[50].lag - 40) < 2 && Math.abs(T.cs.held[20].lag - 85) < 2 && Math.abs(T.cs.held[10].lag - 160) < 2 && Math.abs(T.cs.held[5].lag - 300) < 10, 'the angle is worked out 40, 85, 160 and 300 ms behind "now" at 50, 20, 10 and 5 samples a second');
    });

    /* ================= what each fault costs ================= */
    await ok.part('what each single fault costs', async () => {
        console.log('\n  ONE FAULT AT A TIME (car "a", learned with that fault where it is the sensor\'s, 20/s): worst error in degrees,');
        console.log('  with steering | without steering, for a held drift, a long circle and two switches');
        const scenes = ['held', 'circle', 'switches'];
        const T = (truthOf('held', sim.CARS.a).T * 1000);
        const rows = [
            ['nothing wrong', {}],
            ['body roll 4.2 deg/g', { faults: { roll: 4.2 }, sensor: true }],
            ['body roll 6 deg/g', { faults: { roll: 6 }, sensor: true }],
            ['sideways acceleration zero +0.3 m/s2', { faults: { zeroY: 0.3 }, sensor: true }],
            ['yaw zero +0.5 deg/s', { faults: { yawBias: 0.5 }, sensor: true }],
            ['forward acceleration zero -0.3 m/s2 (a 3 % grade)', { faults: { zeroX: -0.3 } }],
            ['forward acceleration reads 10 % low', { faults: { gainX: 0.9 }, sensor: true }],
            ['noise on every source', { faults: { noiseY: 0.07, noiseX: 0.07, noiseYaw: 0.12, noiseSteer: 0.06 }, sensor: true }],
            ['three times that noise', { faults: { noiseY: 0.21, noiseX: 0.21, noiseYaw: 0.36, noiseSteer: 0.18 }, sensor: true }],
            ['speed reads 2 % high', { faults: { speedGain: 1.02 }, sensor: true }],
            ['the speed is the front wheels\' speed', { car: { speedFrom: 'front' } }],
            ['the speed is the speed along the car', { car: { speedFrom: 'u' } }],
            ['every stamp up to half a slot late', { sample: { jitter: 25 } }],
            ['every stamp up to a whole slot late', { sample: { jitter: 50 } }],
            ['sideways acceleration 50 ms later than the yaw rate', { sample: { each: { lat: { delay: 50 }, long: { delay: 50 } } } }],
            ['sideways acceleration 100 ms later', { sample: { each: { lat: { delay: 100 }, long: { delay: 100 } } } }],
            ['yaw rate 50/s, accelerations 10/s', { sample: { each: { yaw: { spacing: 20 }, lat: { spacing: 100 }, long: { spacing: 100 } } } }],
            ['yaw rate 5/s, accelerations 50/s', { sample: { each: { yaw: { spacing: 200 }, lat: { spacing: 20 }, long: { spacing: 20 } } } }],
            ['everything in lumps of 100 ms', { sample: { each: { yaw: { lump: 100 }, lat: { lump: 100 }, long: { lump: 100 }, speed: { lump: 100 }, steer: { lump: 100 } } } }],
            ['the app held up for 150 ms as the drift begins', { sample: { holdups: [{ at: 3400, ms: 150 }] } }],
            ['the app held up for 300 ms as the drift begins', { sample: { holdups: [{ at: 3400, ms: 300 }] } }],
            ['the yaw rate lost for 300 ms as the drift begins', { sample: { gaps: { yaw: [{ at: 3400, ms: 300 }] } } }],
            ['the yaw rate lost for 600 ms as the drift begins', { sample: { gaps: { yaw: [{ at: 3400, ms: 600 }] } } }],
            ['the sideways acceleration lost for 600 ms', { sample: { gaps: { lat: [{ at: 3400, ms: 600 }] } } }],
            ['no forward acceleration at all', { off: ['long'] }],
            ['the yaw sensor reads no more than 40 deg/s', { car: { yawCeil: 40 } }],
            ['wheelbase set 0.35 m too short', { engine: { wheelbase: 2.5 } }],
        ];
        const res = {};
        for (const row of rows) {
            const o = row[1], car = Object.assign({}, sim.CARS.a, o.car), cells = [];
            res[row[0]] = {};
            for (const steer of [true, false]) {
                const extra = Object.assign({}, o.sensor ? { faults: o.faults } : null, o.car ? { car } : null, steer ? null : { off: ['steer'] });
                const key = JSON.stringify([o.sensor ? o.faults : 0, o.car || 0, steer]);
                if (!learnedCache[key]) learnedCache[key] = { saved: run(Object.assign({ car, scene: ['ordinary', 'gentle'], spacing: 50, seed: 7 }, extra)).eng.learn.export() };
                for (const s of scenes) {
                    const c = run({ car, scene: s, spacing: 50, saved: learnedCache[key].saved, faults: o.faults, sample: o.sample, off: (o.off || []).concat(steer ? [] : ['steer']), useSteer: steer, engine: o.engine });
                    res[row[0]][s + (steer ? 's' : 'n')] = c;
                    cells.push(f1(c.worst) + (c.recs.length === 1 ? (c.recs[0].flags.length ? '*' : ' ') : '!'));
                }
            }
            console.log('  ' + row[0].padEnd(52) + cells.slice(0, 3).map((x) => pad(x, 7)).join('') + '  |' + cells.slice(3).map((x) => pad(x, 7)).join(''));
        }
        console.log('  (* the drift carries a flag;  ! not exactly one drift was counted)');
        void T;
        const w = (name, keys) => max((keys || ['helds', 'circles', 'switchess', 'heldn', 'circlen', 'switchesn']).map((k) => res[name][k].worst));
        const one = (name) => Object.keys(res[name]).every((k) => res[name][k].recs.length === 1);
        // (no flag with steering; without it NO STEERING CHECK and nothing else)
        const plainFlags = (name) => Object.keys(res[name]).every((k) => res[name][k].recs[0].flags.join() === (k.slice(-1) === 'n' ? FLAGS.STEER : ''));
        ok(w('nothing wrong') <= 2 && one('nothing wrong'), 'nothing wrong: within 2 degrees (' + f1(w('nothing wrong')) + ')');
        ok(w('body roll 4.2 deg/g') <= 5 && w('body roll 6 deg/g') <= 7.5, 'body roll: the angle reads high by about the share of gravity the roll adds: up to ' + f1(w('body roll 4.2 deg/g')) + ' degrees at 4.2 deg/g and ' + f1(w('body roll 6 deg/g')) + ' at 6 deg/g. This is the largest steady error of all, and nothing learned from ordinary driving can take it out');
        ok(w('sideways acceleration zero +0.3 m/s2') <= 3.5 && w('yaw zero +0.5 deg/s') <= 2, 'zero errors of the sideways acceleration and the yaw rate are trimmed out at rest (' + f1(w('sideways acceleration zero +0.3 m/s2')) + ', ' + f1(w('yaw zero +0.5 deg/s')) + ')');
        ok(w('noise on every source') <= 2 && w('three times that noise') <= 2.5 && one('three times that noise') && plainFlags('three times that noise'), 'noise: ' + f1(w('noise on every source')) + ' degrees, three times as much noise: ' + f1(w('three times that noise')));
        ok(w('forward acceleration zero -0.3 m/s2 (a 3 % grade)') <= 3 && w('forward acceleration reads 10 % low') <= 3,
            'a road that climbs 3 % (the forward acceleration reads 0.3 m/s2 off): ' + f1(w('forward acceleration zero -0.3 m/s2 (a 3 % grade)')) + ' degrees; a forward acceleration that reads 10 % low: ' + f1(w('forward acceleration reads 10 % low')));
        ok(w('every stamp up to half a slot late') <= 3 && w('every stamp up to a whole slot late') <= 4.5 && w('everything in lumps of 100 ms') <= 3, 'late stamps and lumps: ' + f1(w('every stamp up to half a slot late')) + ', ' + f1(w('every stamp up to a whole slot late')) + ' and ' + f1(w('everything in lumps of 100 ms')) + ' degrees');
        ok(w('sideways acceleration 50 ms later than the yaw rate') <= 2 && w('sideways acceleration 100 ms later') <= 3.5, 'one source later than the other by a constant time: ' + f1(w('sideways acceleration 50 ms later than the yaw rate')) + ' degrees at 50 ms, ' + f1(w('sideways acceleration 100 ms later')) + ' at 100 ms (while the yaw rate is changing). Nothing in the data shows such a delay, and how late a car\'s sources are against each other is not known');
        ok(w('yaw rate 50/s, accelerations 10/s') <= 2 && w('yaw rate 5/s, accelerations 50/s') <= 3, 'sources at different rates: ' + f1(w('yaw rate 50/s, accelerations 10/s')) + ' and ' + f1(w('yaw rate 5/s, accelerations 50/s')) + ' degrees');
        ok(w('the app held up for 150 ms as the drift begins') <= 2 && w('the app held up for 300 ms as the drift begins') <= 3.5 && Object.keys(res['the app held up for 300 ms as the drift begins']).every((k) => res['the app held up for 300 ms as the drift begins'][k].recs[0].flags.includes(FLAGS.GAP)) &&
            plainFlags('the app held up for 150 ms as the drift begins'),
            'the app held up as the drift begins: ' + f1(w('the app held up for 150 ms as the drift begins')) + ' degrees for 150 ms (no flag), ' + f1(w('the app held up for 300 ms as the drift begins')) + ' for 300 ms, and that drift is flagged DATA GAP');
        ok(w('the yaw rate lost for 300 ms as the drift begins') <= 5 && w('the yaw rate lost for 600 ms as the drift begins') <= 11 && Object.keys(res['the yaw rate lost for 600 ms as the drift begins']).every((k) => res['the yaw rate lost for 600 ms as the drift begins'][k].recs.every((d) => d.flags.includes(FLAGS.GAP))),
            'the yaw rate lost as the drift begins: ' + f1(w('the yaw rate lost for 300 ms as the drift begins')) + ' degrees for 300 ms; for 600 ms up to ' + f1(w('the yaw rate lost for 600 ms as the drift begins')) + ' degrees at first, flagged DATA GAP, and the checks pull it back');
        ok(w('no forward acceleration at all') <= 4.5 && one('no forward acceleration at all'), 'without the forward acceleration: ' + f1(w('no forward acceleration at all')) + ' degrees (its steady share is used)');
        ok(w('wheelbase set 0.35 m too short', ['helds', 'circles', 'switchess']) <= 5.5, 'the wheelbase set 0.35 m too short: ' + f1(w('wheelbase set 0.35 m too short', ['helds', 'circles', 'switchess'])) + ' degrees with steering (the steering\'s scale is learned as curvature, so it only moves the share between the axles)');
        const u = w('the speed is the speed along the car'), fw = w('the speed is the front wheels\' speed');
        ok(u <= 16 && u >= 5 && fw <= 4.5, 'KNOWN LIMIT: if the car reports the speed along its own length while sideways, the angle is off by up to ' + f1(u) + ' degrees; if it reports what the front wheels roll at, by up to ' + f1(fw) + '. Which one a car reports is not known');
        const ceil = res['the yaw sensor reads no more than 40 deg/s'];
        ok(w('the yaw sensor reads no more than 40 deg/s') > 5, 'KNOWN LIMIT: a yaw sensor that stops reading at 40 deg/s inside its raw range: the angle is off by up to ' + f1(w('the yaw sensor reads no more than 40 deg/s')) + ' degrees and nothing flags it (drifts counted: ' + Object.keys(ceil).map((k) => ceil[k].recs.length).join(', ') + '). A ceiling at the END of the raw range is seen: see the robustness part');
    });

    /* ================= what must score nothing ================= */
    await ok.part('what must score nothing', async () => {
        const quiet = ['lanechange', 'slalom', 'bumpy', 'braking', 'understeer', 'roundabout', 'ordinary', 'gentle', 'banked5'];
        const counts = {};
        let runs = 0;
        for (const carName of ['a', 'b', 'c']) for (const dirty of [false, true]) for (const steer of [true, false]) for (const rate of (carName === 'a' ? RATES : [20])) {
            for (const s of quiet) {
                const c = carName === 'a' && TAB ? TAB[(dirty ? 'd' : 'c') + (steer ? 's' : 'n')][s][rate] : cell(s, Object.assign({ carName, rate, dirty }, steer ? null : { useSteer: false, off: ['steer'], learnExtra: { off: ['steer'] } }));
                counts[s] = (counts[s] || 0) + c.recs.length; runs++;
            }
        }
        const per = runs / quiet.length;
        ok(counts.lanechange === 0, 'a quick lane change: no drift in any of ' + per + ' runs (three cars, clean and dirty, with and without steering; car "a" at four rates)');
        ok(counts.slalom === 0, 'a slalom: none');
        ok(counts.bumpy === 0, 'a bumpy straight: none');
        ok(counts.braking === 0, 'hard braking in a straight line: none');
        ok(counts.understeer === 0, 'plain understeer: none');
        ok(counts.roundabout === 0 && counts.ordinary === 0 && counts.gentle === 0, 'a long ordinary corner, 4 minutes of ordinary driving, slow gentle corners: none');
        ok(counts.banked5 === 0, 'a corner banked by 5 degrees: none');
        let before = 0;
        for (const s of ['lanechange', 'slalom', 'bumpy', 'braking', 'understeer', 'roundabout']) for (const r of RATES) before += TAB.cb[s][r].recs.length + TAB.db[s][r].recs.length;
        ok(before === 0, 'the same scenes before anything is learned (car "a"): none');
        const b12 = [TAB.cs, TAB.ds].reduce((n, t) => n + RATES.reduce((m, r) => m + t.banked[r].recs.length, 0), 0);
        ok(b12 === 0, 'a corner banked by 12 degrees, with steering: none');
        const b12n = [TAB.cn, TAB.dn].reduce((n, t) => n + RATES.reduce((m, r) => m + t.banked[r].recs.length, 0), 0);
        ok(b12n === 0, 'and without steering: none (the acceleration check holds the angle under the start angle: it read up to ' + f1(Math.max(worstOf(TAB.cn, ['banked']), worstOf(TAB.dn, ['banked']))) + ' degrees there)');
        const noAcc = RATES.map((r) => cell('banked', { rate: r, useSteer: false, off: ['steer', 'long'], learnExtra: { off: ['steer', 'long'] } }));
        ok(noAcc.every((c) => c.recs.length >= 1) && noAcc.every((c) => c.recs.every((d) => d.flags.includes(FLAGS.STEER) && !canBeBest(d))), 'NOT SOLVED: the 12 degree bank on a car with neither steering nor forward acceleration: a drift is counted (' + noAcc.map((c) => c.recs.map((d) => d.score + ' ' + d.grade + ', peak ' + d.peak).join(' and ')).join(' | ') + '). It is flagged NO STEERING CHECK, as every drift of a car without steering is, and cannot be a best');
        const eight = cell('eight', { rate: 20 }), eightD = cell('eight', { rate: 20, dirty: true });
        ok(eight.recs.length === 0, 'a slide that stays at 8.5 degrees is under the start angle: no drift (clean)');
        let read = 0;
        cell('eight', { rate: 20, dirty: true, onTick: (eng, st) => { if (st.ok) read = Math.max(read, Math.abs(st.beta) / DEG); } });
        ok(eightD.recs.length === 0 && read > 8 && read < 10, 'the same with dirty data: none either (it reads up to ' + f1(read) + ' degrees where the truth is 8.7)');
        const below = cell('below', { rate: 20 });
        ok(below.recs.length === 0, 'a slide at 16 km/h is under the minimum speed: no drift');
    });

    /* ================= drifts through the whole engine ================= */
    await ok.part('drifts through the whole engine', async () => {
        const held = TAB.cs.held[20].recs[0], right = TAB.cs.right[20].recs[0], sw = TAB.cs.switches[20].recs[0], spin = TAB.cs.spin[20].recs[0], hb = TAB.cs.handbrake[20].recs[0];
        ok(held.dir === 'L' && right.dir === 'R' && held.switches === 0 && held.end === 'ended', 'a drift through a left-hander is LEFT, through a right-hander RIGHT');
        ok(sw.switches === 2 && sw.end === 'ended' && TAB.cs.switches[20].recs.length === 1 && [TAB.ds, TAB.cn, TAB.dn].every((t) => RATES.every((r) => t.switches[r].recs.length === 1 && t.switches[r].recs[0].switches === 2)),
            'three drifts joined by two changes of direction are ONE drift with two switches, at every rate, clean and dirty, with and without steering');
        const spins = [];
        ['cs', 'ds', 'cn', 'dn'].forEach((k) => RATES.forEach((r) => { const x = TAB[k].spin[r].recs; if (x.length !== 1 || x[0].end !== 'spin') spins.push(k + ' ' + r + '/s: ' + x.map(describe).join(' | ')); }));
        ok(spin.end === 'spin' && spin.flags.join() === FLAGS.SPIN && spins.length === 0, 'a drift that goes round is one drift, ended as a SPIN, at every rate, clean and dirty, with and without steering' + (spins.length ? '. NOT SO: ' + spins.join(' || ') : ''));
        ok(hb.handbrake === true && held.handbrake === false && hb.peak > 35, 'a handbrake entry: "handbrake seen at the start" (and not on the others)');
        ok(held.wheelspin >= 25 && held.wheelspin <= 45 && held.pedal >= 60 && held.opp > 20 && held.opp < 32 && held.peakG > 0.65 && held.peakG < 0.8 && held.peakYaw > 45 && held.peakYaw < 62,
            'the held drift\'s data: wheelspin ' + held.wheelspin + ' % (35 in truth), pedal ' + held.pedal + ' %, opposite lock ' + held.opp + ' degrees (27), ' + held.peakG + ' g (0.71), yaw rate ' + held.peakYaw + ' deg/s (56), entry ' + held.entry + ' km/h');
        const noW = cell('held', { rate: 20, off: ['wheels', 'pedal', 'hb'], learnExtra: { off: ['wheels', 'pedal', 'hb'] } });
        ok(noW.recs.length === 1 && noW.recs[0].wheelspin === null && noW.recs[0].pedal === null && noW.recs[0].handbrake === null && noW.recs[0].flags.length === 0 && noW.worst <= 3,
            'without wheel speeds, pedal and handbrake everything else works: wheelspin, pedal and handbrake say "not known"');
        const noS = TAB.cn.held[20].recs[0];
        ok(noS.opp === null && noS.flags.join() === FLAGS.STEER && noS.score > 0 && !canBeBest(noS), 'without steering: opposite lock "not known"; the drift is counted and scored (' + noS.score + ' points), flagged NO STEERING CHECK, and cannot be a best');
        const slow = cell('slowend', { rate: 20 });
        ok(slow.recs.length === 1 && slow.recs[0].end === 'slow' && slow.recs[0].minKmh >= 19.5 && slow.recs[0].minKmh <= 21, 'a drift that runs down to walking pace ends when the speed falls under 20 km/h (' + slow.recs[0].minKmh + ')');
        const stop = cell('stopsideways', { rate: 20 });
        ok(stop.recs.length === 1 && stop.recs[0].end === 'spin' && stop.recs[0].peak < 100, 'a car that comes to a stop still sideways: a SPIN, though the angle never passed 100 degrees (peak ' + stop.recs[0].peak + ')');
        const wob = cell('wobble', { rate: 20 });
        ok(wob.recs.length === 1 && wob.recs[0].switches === 0 && wob.recs[0].end === 'ended', 'the angle crosses zero and stays at 7 degrees on the other side: the drift ends, no switch, no second drift');
        // settings
        const s15 = run({ scene: 'held', spacing: 50, saved: learned('a', 50, false).saved, engine: { startDeg: 15, endDeg: 9 } }).recs[0];
        ok(s15.time < held.time - 0.15 && s15.peak === held.peak, 'a start angle of 15 and an end angle of 9 degrees: the same drift, shorter by ' + (held.time - s15.time).toFixed(2) + ' s');
        const s35 = run({ scene: 'held', spacing: 50, saved: learned('a', 50, false).saved, engine: { startDeg: 35 } }).recs;
        ok(s35.length === 0, 'a start angle of 35 degrees: a 30 degree drift is none');
        const v80 = run({ scene: 'held', spacing: 50, saved: learned('a', 50, false).saved, engine: { minKmh: 80 } }).recs;
        ok(v80.length === 0, 'a minimum speed of 80 km/h: a drift at 65 km/h is none');
        const demo = run({ scene: 'held', spacing: 50, saved: learned('a', 50, false).saved, engine: { demo: true } }).recs[0];
        ok(demo.flags.join() === FLAGS.DEMO && !canBeBest(demo) && canBeBest(held), 'demo: flagged DEMO, never a best');
        // the score follows the drift
        const sc = (name, dirty) => cell(name, { rate: 20, dirty }).recs[0];
        const smooth = sc('smooth30'), saw = sc('saw30'), fast = sc('fast30'), small = sc('small15'), short = sc('short30');
        console.log('\n  SCORES (learned, clean, 20/s): 30 degrees at 70 km/h for 7 s: ' + smooth.score + ' ' + smooth.grade + ' | at 120 km/h: ' + fast.score + ' ' + fast.grade + ' | 15 degrees: ' + small.score + ' ' + small.grade +
            ' | for 3 s: ' + short.score + ' ' + short.grade + ' | sawing 22 to 38 degrees: ' + saw.score + ' ' + saw.grade + ' | held: ' + held.score + ' ' + held.grade + ' | long circle: ' + TAB.cs.circle[20].recs[0].score + ' ' + TAB.cs.circle[20].recs[0].grade +
            ' | two switches: ' + sw.score + ' ' + sw.grade + ' | spin: ' + spin.score + ' ' + spin.grade + ' | handbrake: ' + hb.score + ' ' + hb.grade);
        ok(fast.score > 1.5 * smooth.score && small.score < 0.6 * smooth.score && short.score < 0.45 * smooth.score, 'more speed, more angle and more time each give more');
        ok(saw.score < 0.8 * smooth.score && saw.reversals >= 8 && smooth.reversals <= 1 && Math.abs(saw.avg - smooth.avg) < 3, 'a sawing angle earns less than a smooth one of the same average (' + saw.score + ' against ' + smooth.score + ', ' + saw.reversals + ' reversals against ' + smooth.reversals + ')');
        const again = cell('switches', { rate: 20, dirty: true }).recs[0];
        ok(JSON.stringify(again) === JSON.stringify(TAB.ds.switches[20].recs[0]), 'the same samples give the same record, to the last digit (the dirty switches scene, run twice)');
        // the screen's view
        const views = [];
        cell('switches', { rate: 20, onTick: (eng) => views.push(eng.view()) });
        const states = views.map((v) => v.state).filter((s, i, a) => i === 0 || s !== a[i - 1]);
        ok(states.join() === 'nodata,ready,drift,ready', 'the state the screen is given through that scene: ' + states.join(', '));
        const mid = views.filter((v) => v.state === 'drift');
        ok(mid.every((v, i) => i === 0 || v.run.score >= mid[i - 1].run.score) && mid[mid.length - 1].run.switches === 2 && mid.some((v) => v.dir === 'L') && mid.some((v) => v.dir === 'R') && mid.some((v) => v.switched) && mid.every((v) => v.angle >= 0 && v.pm > 0),
            'the running score only counts up, the direction changes from L to R and back, and "switched" shows after a switch');
        const end = views[views.length - 1];
        const stood = mid[mid.length - 1].run.score;
        ok(end.last && end.last.score <= stood && end.last.score >= 0.97 * stood && end.run === null && views.some((v) => v.ended) && end.count === 1,
            'after it the view holds the finished drift: ' + end.last.score + ' points, where the count stood at ' + stood + ' (what was counted after the angle went under the end angle is taken back)');
        ok(views.every((v) => v.learning === false && v.learn === 'learned') && cell('held', { rate: 20, learn: false, onTick: (eng) => views.push(eng.view()) }) && views[views.length - 1].learning === true, 'and it says whether the car is still being learned');
    });

    /* ================= robustness ================= */
    await ok.part('faults in the data', async () => {
        const L = learned('a', 50, false).saved;
        const base = (o) => run(Object.assign({ scene: 'held', spacing: 50, saved: L }, o));
        // no yaw at all
        let r = base({ off: ['yaw'], saved: null });
        const v = r.eng.view();
        ok(r.recs.length === 0 && v.state === 'noyaw' && v.angle === null && v.pm === null && r.n === 0, 'no yaw rate from the car: no angle, state "noyaw", nothing scored');
        r = base({ off: ['lat'] });
        ok(r.recs.length === 0 && r.eng.view().state === 'nodata' && r.eng.view().angle === null, 'no sideways acceleration: no angle either ("nodata")');
        r = base({ off: ['speed'] });
        ok(r.recs.length === 0 && r.eng.view().state === 'nodata', 'no speed: no angle');
        r = base({ events: (ev, clock) => ev.filter((e) => e.src !== 'speed' || e.t - clock < 5000), engine: { speedMaxAgeMs: 1500 } });
        ok(r.recs.length === 1 && r.recs[0].end === 'lost' && r.recs[0].flags.includes(FLAGS.GAP) && r.eng.view().state === 'gap' && Math.abs(r.recs[0].time - (5 + 1.5 - 3.42)) < 0.4,
            'the speed stops arriving in the middle of a drift, on an app that says a healthy speed is never older than 1.5 s: the drift ends 1.5 s later, flagged DATA GAP (' + describe(r.recs[0]) + ')');
        r = base({ events: (ev, clock) => ev.filter((e) => e.src !== 'speed' || e.t - clock < 5000) });
        ok(r.recs.length === 1 && r.recs[0].end === 'ended' && r.recs[0].flags.length === 0, 'KNOWN LIMIT: on an app that does not say so, a speed that stops is a speed that does not change: the drift is counted on the last speed, with no flag');
        // the yaw rate dies in the middle of the drift
        const dies = (src) => base({ events: (ev, clock) => ev.filter((e) => e.src !== src || e.t - clock < 6000) });
        r = dies('yaw');
        ok(r.recs.length === 1 && r.recs[0].end === 'lost' && r.recs[0].flags.includes(FLAGS.GAP) && r.eng.view().state === 'noyaw',
            'the yaw rate stops arriving in the middle of a held drift: while nothing else changes that is "no change"; when the sideways acceleration moves and the yaw rate still says nothing for 2 s, the drift ends, flagged DATA GAP, and the state is "noyaw" (' + describe(r.recs[0]) + ')');
        r = base({ events: (ev, clock) => ev.filter((e) => e.src !== 'yaw' || e.t - clock < 3500) });
        ok(r.recs.every((d) => d.end === 'lost' && d.flags.includes(FLAGS.GAP)) && r.eng.view().state === 'noyaw', 'it stops as the drift begins: "noyaw" 2 s later, and what was counted until then is flagged (' + (r.recs.map(describe).join(' | ') || 'nothing counted') + ')');
        r = dies('lat');
        ok(r.recs.length === 1 && r.recs[0].flags.includes(FLAGS.GAP) && r.eng.view().state === 'gap', 'the sideways acceleration stops in the middle of the drift: flagged DATA GAP, state "gap" (' + describe(r.recs[0]) + ')');
        r = base({ events: (ev, clock) => ev.filter((e) => e.src !== 'yaw' || e.t - clock < 1500 || e.t - clock > 12500) });
        ok(r.eng.view().state === 'ready' && r.eng.view().angle !== null && r.eng.view().anchored === true, 'when it comes back the angle is defined again, and trusted again after the car has gone straight');
        // the yaw zero has moved since the car was learned
        r = run({ scene: 'fromstand', spacing: 50, saved: L, faults: { yawBias: 2 } });
        const r0 = run({ scene: 'fromstand', spacing: 50, saved: L });
        ok(r.recs.length === 1 && r.worst <= r0.worst + 1 && r.worst <= 4.5, 'the yaw rate\'s zero has moved by 2 degrees a second since the car was learned; the car stands for 3 s and pulls away straight into a corner and a drift, with no straight to rest on: the standing car gave the zero, and the angle is within ' + f1(r.worst) + ' degrees (' + f1(r0.worst) + ' with the zero unmoved)');
        // a steady source is not a dead one
        r = base({ sample: { onChange: true } });
        ok(r.recs.length === 1 && r.recs[0].flags.length === 0 && r.worst <= 3, 'sent on change only, clean data: the speed says nothing for seconds while the car turns steadily, and nothing is taken as lost (worst ' + f1(r.worst) + ')');
        r = run({ scene: 'circle', spacing: 50, saved: L, sample: { onChange: true } });
        ok(r.recs.length === 1 && r.recs[0].flags.length === 0 && r.worst <= 3 && r.recs[0].time > 26, 'a 27 s circle sent on change only: one drift, no flag (worst ' + f1(r.worst) + '; ' + r.recs.map(describe).join(' | ') + ')');
        // nonsense
        const junk = { yaw: [{ at: 4000, v: 65535 }, { at: 5000, v: 0 }, { at: 6000, v: 60000 }, { at: 7000, v: 1 }], lat: [{ at: 4500, v: -29 }, { at: 5500, v: 25 }, { at: 6500, v: 120 }], long: [{ at: 4700, v: 28 }], speed: [{ at: 5200, v: 0 }, { at: 6200, v: 400 }, { at: 7200, v: 9999 }], steer: [{ at: 5000, v: 65535 }, { at: 6000, v: 0 }] };
        r = base({ sample: { nonsense: junk } });
        const ref = base({});
        const cnt = (S) => S.dropped + S.noValue, A = r.eng.angle;
        ok(r.recs.length === 1 && r.recs[0].flags.length === 0 && r.worst <= ref.worst + 1.5 && Math.abs(r.recs[0].peak - ref.recs[0].peak) < 1,
            'fifteen lone nonsense values in the middle of a drift (the car\'s "no value", zeros, values no car does): the angle is within ' + f1(r.worst) + ' degrees (' + f1(ref.worst) + ' without them), one drift, no flag (' + describe(r.recs[0]) + ')');
        ok(cnt(A.yawS) === 2 && cnt(A.latS) === 3 && cnt(A.longS) === 1 && cnt(A.speedS) === 3 && cnt(A.steerS) === 2, 'each was dropped or taken as no value (yaw ' + cnt(A.yawS) + ' and two at the ends of its range, sideways ' + cnt(A.latS) + ', forward ' + cnt(A.longS) + ', speed ' + cnt(A.speedS) + ', steering ' + cnt(A.steerS) + ')');
        // a ceiling at the end of the raw range
        const carC = Object.assign({}, sim.CARS.c, { yawStep: 0.0012 });
        const Lc = run({ car: carC, scene: ['ordinary', 'gentle'], spacing: 50, seed: 7 }).eng.learn.export();
        r = run({ car: carC, scene: 'held', spacing: 50, saved: Lc });
        ok(r.recs.length >= 1 && r.recs.every((d) => d.flags.includes(FLAGS.GAP)), 'a yaw rate stuck at the end of its raw range (this car\'s sensor ends at 43 deg/s, the drift needs 56): every drift counted there is flagged DATA GAP (' + r.recs.map(describe).join(' | ') + ')');
        // a long gap
        r = base({ sample: { gaps: { yaw: [{ at: 3300, ms: 900 }] } } });
        ok(r.recs.length === 1 && r.recs[0].flags.includes(FLAGS.GAP) && r.recs[0].gap >= 900, 'the yaw rate lost for 0.9 s as a drift begins: flagged DATA GAP, a gap of ' + r.recs[0].gap + ' ms. The yaw rate rose and fell again inside it and came back where it was, so no step shows it: the sideways acceleration moving meanwhile does (' + r.recs.map(describe).join(' | ') + ')');
        r = base({ sample: { gaps: { yaw: [{ at: 6000, ms: 900 }] } } });
        ok(r.recs.length === 1 && r.recs[0].flags.length === 0 && r.worst <= ref.worst + 0.5, 'the same 0.9 s lost in the middle of the held drift, where the yaw rate is steady: what came after the silence fits "no change", nothing was missed, no flag');
        r = base({ sample: { holdups: [{ at: 6000, ms: 450 }] } });
        ok(r.recs.length === 1 && r.recs[0].flags.join() === FLAGS.GAP && r.worst <= 4, 'the app held up for 0.45 s in a held drift: flagged DATA GAP, the angle within ' + f1(r.worst) + ' degrees');
        r = base({ sample: { holdups: [{ at: 6000, ms: 6000 }] } });
        ok(r.recs.length <= 1 && r.recs.every((d) => d.flags.includes(FLAGS.GAP)) && r.eng.view().anchored === true, 'the app away for 6 s: it starts again from nothing, whatever drift was running is flagged, and nothing is invented for the time away');
        // started in the middle of a drift
        r = base({ events: (ev, clock) => ev.filter((e) => e.t - clock > 5000) });
        ok(r.recs.length <= 1 && r.recs.every((d) => d.flags.includes(FLAGS.UNSURE)), 'the app started in the middle of a drift: the angle has had no rest to start from, its +- says so (10 degrees more), and what it counts is flagged ANGLE UNSURE (' + (r.recs.map(describe).join(' | ') || 'nothing counted') + ')');
        // garbage in every argument
        let threw = null;
        try {
            const eng = new DriftEngine({ saved: L, onDrift: (d) => { if (!isFinite(d.score)) throw new Error('a score that is no number'); } });
            const rand = sim.rng(99), junkV = [NaN, Infinity, -Infinity, undefined, null, 'x', {}, [], -1, 0, 1e9, 65535, 32768, 4095, true];
            let t = C0;
            for (let i = 0; i < 4000; i++) {
                t += rand() < 0.05 ? -rand() * 50 : rand() * 40;
                const src = rand.pick(['speed', 'lat', 'long', 'yaw', 'steer', 'pedal', 'hb', 'wheels', 'idle']), v = rand.pick(junkV);
                if (src === 'wheels') eng.wheels(rand() < 0.2 ? rand.pick(junkV) : t, rand() < 0.5 ? v : { fl: rand.pick(junkV), fr: rand.pick(junkV), rl: rand.pick(junkV), rr: rand.pick(junkV) });
                else if (src === 'idle') eng.idle(rand() < 0.2 ? rand.pick(junkV) : t);
                else eng[src](rand() < 0.2 ? rand.pick(junkV) : t, rand() < 0.5 ? v : rand.between(-70000, 70000));
                const view = eng.view();
                if (view.angle !== null && !isFinite(view.angle)) throw new Error('an angle that is no number');
                if (view.run && !isFinite(view.run.score)) throw new Error('a running score that is no number');
            }
            JSON.stringify(eng.learn.export()); JSON.stringify(eng.learn.status());
            eng.configure({ startDeg: 12, yawKey: 'other', steerKey: 'driver' }); eng.idle(t + 100);
        } catch (e) { threw = e && e.stack || e; }
        ok(threw === null, 'the engine fed 4000 rounds of nonsense in every argument (times that run backwards among them): nothing throws, no angle and no score is ever something other than a number' + (threw ? '. PROBLEM: ' + threw : ''));
        // a record is plain data
        const rec = TAB.ds.switches[20].recs[0], vals = [];
        (function walk(x) { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === 'object') Object.keys(x).forEach((k) => walk(x[k])); else vals.push(x); })(rec);
        ok(vals.every((x) => x === null || typeof x === 'string' || typeof x === 'boolean' || (typeof x === 'number' && isFinite(x))) && JSON.stringify(JSON.parse(JSON.stringify(rec))) === JSON.stringify(rec) && JSON.stringify(rec).length < 3000,
            'a finished drift is plain data that can be saved as it is (' + JSON.stringify(rec).length + ' characters with its trace)');
        ok(!/lat|lon|course|heading|position|bearing/i.test(Object.keys(rec).join(' ').replace(/\b(peakG|wheelspin)\b/g, '')), 'and holds no position, course or heading: ' + Object.keys(rec).join(', '));
    });

    /* ================= what two reviews found ================= */
    await ok.part('what two reviews found: each of these was a fault once', async () => {
        const L = learned('a', 50, false).saved, Ln = learned('a', 50, false, { off: ['steer'] }).saved;
        const noSteer = { useSteer: false, off: ['steer'], learnExtra: { off: ['steer'] } };
        const shown = (name, o) => { let m = 0; const c = cell(name, Object.assign({ onTick: (eng, s) => { if (s.ok) m = Math.max(m, Math.abs(s.beta) / DEG); } }, o)); return { c, m }; };

        // --- a banked or cambered corner, the tyres gripping, on a car without steering
        console.log('\n  A BANKED CORNER, the tyres gripping (nothing slides). Largest angle shown, and what was counted, at 20/s:');
        console.log('  scene     bank  path g  km/h     with steering          without, clean                 without, dirty');
        const banks = [['bank3', 3, 0.3, 80], ['bank6', 6, 0.2, 100], ['bank6b', 6, 0.35, 80], ['bank9', 9, 0.16, 100], ['bank12b', 12, 0.45, 100], ['banked', 12, 0.6, 100]];
        const B = {};
        for (const b of banks) {
            const ws = shown(b[0], { rate: 20 }), cn = shown(b[0], Object.assign({ rate: 20 }, noSteer)), dn = shown(b[0], Object.assign({ rate: 20, dirty: true }, noSteer));
            B[b[0]] = { ws, cn, dn, rates: RATES.map((r) => cell(b[0], Object.assign({ rate: r }, noSteer))), ratesD: RATES.map((r) => cell(b[0], Object.assign({ rate: r, dirty: true }, noSteer))) };
            const say = (x) => pad(f1(x.m), 6) + '  ' + (x.c.recs.map((d) => d.score + ' ' + d.grade + '/' + d.peak + (d.flags.length ? ' [' + d.flags.join(', ') + ']' : ' [no flag]')).join(' ') || 'none').padEnd(22);
            console.log('  ' + b[0].padEnd(9) + pad(b[1], 5) + pad(b[2], 8) + pad(b[3], 6) + '   ' + say(ws) + say(cn) + say(dn));
        }
        const names = banks.map((b) => b[0]);
        ok(names.every((n) => B[n].ws.c.recs.length === 0 && B[n].ws.m < 6), 'with steering none of the six banked corners is counted, and none shows more than 6 degrees');
        const speaks = ['bank3', 'bank6b', 'bank12b', 'banked'], silent = ['bank6', 'bank9'];
        ok(speaks.every((n) => B[n].rates.every((c) => c.recs.length === 0)), 'without steering, clean data, level ground: where the acceleration check can speak (the four corners with 1.5 m/s2 or more felt sideways) none is counted at any rate: the check speaks against a slide');
        const cleanRecs = [].concat.apply([], silent.map((n) => [].concat.apply([], B[n].rates.map((c) => c.recs))));
        ok(silent.every((n) => B[n].rates.every((c) => c.recs.length >= 1)) && cleanRecs.every((d) => d.flags.includes(FLAGS.STEER) && !canBeBest(d)), 'NOT SOLVED: where it cannot speak (the two gentle ones, under 1 m/s2 felt) the corner IS counted as a drift again, as before the first fix (' +
            silent.map((n) => B[n].cn.c.recs.map((d) => d.score + ' ' + d.grade + ', peak ' + d.peak).join(' and ')).join(' | ') + ' at 20/s). Each is flagged NO STEERING CHECK and cannot be a best: that is what the rule is for');
        const dirtyRecs = [].concat.apply([], names.map((n) => [].concat.apply([], B[n].ratesD.map((c) => c.recs))));
        ok(dirtyRecs.every((d) => d.flags.includes(FLAGS.STEER) && !canBeBest(d)), 'without steering, dirty data: in those ' + names.length * RATES.length + ' runs no drift is counted without the flag NO STEERING CHECK (counted with it: ' +
            (dirtyRecs.map((d) => d.score + ' ' + d.grade + ', peak ' + d.peak).join(' | ') || 'none on this made-up car') + ')');
        const most = max(names.map((n) => B[n].cn.m));
        ok(most > 20, 'KNOWN LIMIT, NOT SOLVED: the angle SHOWN on such a car still runs away in those corners (up to ' + f1(most) + ' degrees, where the car does not slide at all): nothing holds the sum where the car feels less than 3 m/s2 sideways. It goes back to zero on the next straight');

        // --- the first corners of a car whose yaw rate is not scaled like the default
        const wide = Object.assign({}, sim.CARS.a, { yawStep: 0.002 });
        for (const dirty of [false, true]) {
            let before = 0, firstBeta = null, firstAnch = null, hidden = true, was = 'none';
            const r = run({ car: wide, scene: 'ordinary', spacing: 50, dirty, onTick: (eng, s) => {
                const st = eng.learn.values().state;
                if (st === 'none') { if (s.ok) before = Math.max(before, Math.abs(s.beta) / DEG); if (eng.view().angle !== null || eng.view().pm !== null) hidden = false; }
                if (st !== 'none' && was === 'none' && firstBeta === null) { firstBeta = Math.abs(s.beta) / DEG; firstAnch = s.anchored; }
                was = st;
            } });
            ok(r.recs.length === 0 && r.eng.learn.values().state === 'learned', 'a car whose yaw rate is scaled 2.5 times finer than the stated default (the same sign), four minutes of ordinary driving from nothing, ' + (dirty ? 'dirty' : 'clean') + ': no drift is counted, and the car is learned');
            ok(before > 30 && hidden && firstBeta < 3 && firstAnch === false, '  while nothing was learned the sum on the default ran to ' + f1(before) + ' degrees in ordinary corners, and none of it was shown ("--"); when the first line was drawn, in the middle of a corner, that angle was dropped (' +
                f1(firstBeta) + ' degrees a moment later) and nothing could start until the car had gone straight');
        }
        const slope = run({ scene: ['slopestart', 'ordinary'], spacing: 50 });
        ok(slope.recs.length === 0 && slope.eng.learn.values().state === 'learned', 'a car first started standing on a cross slope of 4 degrees, then driven on the flat (its sideways zero is taken on the slope): no drift is counted');

        // --- clean, long, shallow drifts carry no flag
        console.log('\n  LONG SHALLOW DRIFTS, clean data, 20/s: worst error, the +- on average, flags (with steering | without)');
        const longs = [['long15', '15 degrees, 12 s, 70 km/h'], ['long20', '20 degrees, 20 s, 50 km/h'], ['long25fast', '25 degrees, 20 s, 60 km/h'], ['long25', '25 degrees, 40 s, 45 km/h'], ['long20slow', '20 degrees, 20 s, 35 km/h'], ['circle', 'the long circle, 35 degrees, 27 s, 45 km/h']];
        const LG = {};
        for (const l of longs) {
            LG[l[0]] = [cell(l[0], { rate: 20 }), cell(l[0], Object.assign({ rate: 20 }, noSteer))];
            console.log('  ' + l[1].padEnd(44) + LG[l[0]].map((c) => pad(f1(c.worst), 6) + pad(c.recs.length === 1 ? f1(c.recs[0].pm) : '--', 6) + '  ' + (c.recs.length === 1 ? c.recs[0].flags.join(', ') || 'no flag' : c.recs.length + ' DRIFTS').padEnd(14)).join(' |'));
        }
        ok(longs.every((l) => LG[l[0]].every((c, i) => c.recs.length === 1 && c.recs[0].flags.join() === (i ? FLAGS.STEER : '') && c.worst <= 2)), 'six clean drifts of 15 to 35 degrees that last 12 to 40 s at 35 to 70 km/h, with and without steering: one drift each, within 2 degrees, and NO FLAG with steering, none but NO STEERING CHECK without (the +- settles at ' +
            f1(Math.min.apply(null, longs.map((l) => Math.min(LG[l[0]][0].recs[0].pm, LG[l[0]][1].recs[0].pm)))) + ' to ' + f1(max(longs.map((l) => Math.max(LG[l[0]][0].recs[0].pm, LG[l[0]][1].recs[0].pm)))) + ' degrees there, and 7 are allowed)');

        // --- the front wheels at their lock
        console.log('\n  THE FRONT WHEELS AT THEIR LOCK (this made-up car\'s wheels turn 36 degrees), clean, 20/s: worst error, peak read / true, flags (with steering | without)');
        const LK = {};
        for (const n of ['lock46', 'lock50', 'lock58']) {
            LK[n] = [cell(n, { rate: 20 }), cell(n, Object.assign({ rate: 20 }, noSteer))];
            let peak = 0;
            const t = LK[n][0].truth;
            for (let i = 0; i < t.n; i++) peak = Math.max(peak, Math.abs(t.beta[i]) / DEG);
            LK[n].peak = peak;
            console.log('  held at ' + n.slice(4) + ' degrees for 10 s    ' + LK[n].map((c) => pad(f1(c.worst), 6) + pad(c.recs.length === 1 ? f1(c.recs[0].peak) : '--', 7) + ' / ' + f1(peak) + '  ' + (c.recs.length === 1 ? c.recs[0].flags.join(', ') || 'no flag' : c.recs.length + ' DRIFTS').padEnd(14)).join(' |'));
        }
        ok(LK.lock46[0].worst > 4 && LK.lock50[0].worst > 6 && LK.lock46[0].recs[0].flags.length === 0 && LK.lock50[0].recs[0].flags.length === 0 && LK.lock50[0].recs[0].avg < LK.lock50[1].recs[0].avg - 4,
            'KNOWN LIMIT, NOT SOLVED: with the front wheels at their lock the steering check pulls the angle down. A drift held at 46 degrees sinks to ' + f1(LK.lock46[0].worst) + ' degrees low and one at 50 to ' + f1(LK.lock50[0].worst) +
            ' low (its average reads ' + f1(LK.lock50[0].recs[0].avg) + ', and ' + f1(LK.lock50[1].recs[0].avg) + ' without steering), and no flag says so. The check is only dropped once it is more than 15 degrees from the sum');
        ok(LK.lock58[0].worst <= 4 && LK.lock58[0].recs[0].flags.length === 0 && LK.lock58[0].recs[0].back >= 80 && ['lock46', 'lock50', 'lock58'].every((n) => LK[n][1].worst <= 3 && LK[n][1].recs.length === 1 && LK[n][1].recs[0].flags.join() === FLAGS.STEER),
            '  from about 55 degrees the check is dropped and the angle is right again (58 degrees: within ' + f1(LK.lock58[0].worst) + ', no flag: the steering still says that the car oversteers, and backs the drift for ' + LK.lock58[0].recs[0].back + ' % of its time); without steering all three are within ' +
            f1(max(['lock46', 'lock50', 'lock58'].map((n) => LK[n][1].worst))) + ' degrees. So "Steering check: off" reads the angle right there, but every drift then carries NO STEERING CHECK and none is a best');

        // --- a low-grip pan
        const lg = { cs: TAB.cs.lowgrip, cn: TAB.cn.lowgrip, ds: TAB.ds.lowgrip, dn: TAB.dn.lowgrip };
        ok(RATES.every((r) => lg.cs[r].recs.length === 1 && lg.cn[r].recs.length === 1 && lg.ds[r].recs.length === 1 && lg.dn[r].recs.length === 1), 'a circle on grip 0.3 (30 degrees at 30 km/h for 40 s, 2.5 m/s2 felt sideways): one drift in every run, with and without steering, clean and dirty');
        ok(worstOf({ lowgrip: lg.cs }, ['lowgrip']) <= 1.5 && worstOf({ lowgrip: lg.ds }, ['lowgrip']) <= 3 && [10, 20, 50].every((r) => lg.cs[r].recs[0].flags.length === 0 && lg.ds[r].recs[0].flags.length === 0),
            '  with steering it is read within ' + f1(worstOf({ lowgrip: lg.cs }, ['lowgrip'])) + ' degrees clean and ' + f1(worstOf({ lowgrip: lg.ds }, ['lowgrip'])) + ' dirty, without a flag');
        ok(worstOf({ lowgrip: lg.cn }, ['lowgrip']) <= 1.5 && worstOf({ lowgrip: lg.dn }, ['lowgrip']) > 4 && worstOf({ lowgrip: lg.dn }, ['lowgrip']) <= 8 && RATES.every((r) => lg.cn[r].recs[0].flags.includes(FLAGS.UNSURE) && lg.dn[r].recs[0].flags.includes(FLAGS.UNSURE)),
            '  KNOWN LIMIT: without steering the acceleration check cannot pull there (it needs 3 m/s2 sideways), so the angle is the bare sum: within ' + f1(worstOf({ lowgrip: lg.cn }, ['lowgrip'])) + ' degrees on clean data, off by up to ' + f1(worstOf({ lowgrip: lg.dn }, ['lowgrip'])) +
            ' with dirty data. Its +- grows all the time (' + f1(lg.cn[20].recs[0].pm) + ' degrees on average over the 40 s, ' + f1(lg.cn[20].recs[0].pmMax) + ' at the end), and the drift is flagged ANGLE UNSURE, clean data or not (and NO STEERING CHECK, as every drift without steering)');

        // --- a yaw zero that has moved, the app opened on the move
        for (const steer of [true, false]) {
            let m = 0;
            const r = run(Object.assign({ scene: 'straight10', spacing: 50, saved: steer ? L : Ln, faults: { yawBias: 1.5 }, onTick: (eng, s) => { if (s.ok) m = Math.max(m, Math.abs(s.beta) / DEG); } }, steer ? null : { useSteer: false, off: ['steer'] }));
            ok(m <= 2.5 && r.recs.length === 0, 'ten minutes straight at 100 km/h with the yaw rate\'s zero 1.5 degrees a second off what was learned, the app opened on the move, ' + (steer ? 'with' : 'without') + ' steering: the angle shown stays within ' + f1(m) +
                ' degrees (a car that turns by less than 2 degrees a second, feels no sideways acceleration and holds its steering straight is at rest)');
        }

        // (and a gentle bend is not learned as a zero)
        {
            let z0 = null, z1 = null, a0 = null, a1 = null, m = 0, rest = 0, n = 0;
            const r = run({ scene: 'gentlebend', spacing: 50, saved: L, onTick: (eng, s, truth, ms) => {
                if (ms > 5000 && ms < 6000) { z0 = eng.angle.z; a0 = eng.angle.ay0; }
                if (ms > 12000 && ms < 37000) { z1 = eng.angle.z; a1 = eng.angle.ay0; n++; if (s.rest) rest++; if (s.ok) m = Math.max(m, Math.abs(s.beta) / DEG); }
            } });
            const k = r.eng.learn.values().k / DEG;
            ok(z0 !== null && rest > 0.9 * n && m < 1 && Math.abs(k * (z1 - z0)) < 0.1 && Math.abs(a1 - a0) < 0.05,
                'a gentle bend of 1.5 degrees a second for half a minute (0.07 g at 100 km/h): the angle is held at rest (' + f1(m) + ' degrees at most), and neither zero is trimmed toward the bend (the yaw zero moved by ' +
                Math.abs(k * (z1 - z0)).toFixed(2) + ' degrees a second, the sideways zero by ' + Math.abs(a1 - a0).toFixed(2) + ' m/s2): between 1 and 2 degrees a second it may be a bend');
        }

        // --- the forward acceleration worked out from the speed
        const tr = truthOf('held', sim.CARS.a);
        const fromSpeed = (ev, clock) => ev.map((e) => (e.src === 'long' ? Object.assign({}, e, { v: Math.round((tr.at(e.sent - clock).V - tr.at(e.sent - clock - 100).V) / 0.1 / 0.002) * 0.002 }) : e));
        const fs1 = run({ scene: 'held', spacing: 50, saved: L, events: fromSpeed }), fs2 = run({ scene: 'held', spacing: 50, saved: Ln, events: fromSpeed, useSteer: false, off: ['steer'] });
        ok(fs1.worst > 30 && fs2.worst > 30, 'KNOWN LIMIT: a car whose forward acceleration is worked out from its speed, not felt by a sensor: in a held drift of 30 degrees the angle runs away (off by up to ' + f1(fs1.worst) + ' degrees with steering and ' + f1(fs2.worst) +
            ' without): the sum itself takes that signal as the part of the turn a sideways car feels along its length');
        const fo1 = run({ scene: 'held', spacing: 50, saved: L, events: fromSpeed, engine: { useLong: false } }), fo2 = run({ scene: 'held', spacing: 50, saved: Ln, events: fromSpeed, useSteer: false, off: ['steer'], engine: { useLong: false } });
        ok(fo1.worst <= 4.5 && fo1.recs.length === 1 && fo1.recs[0].flags.length === 0 && fo1.eng.angle.longS.count === 0, 'with the forward acceleration left out (the workshop setting): the same drift is read within ' + f1(fo1.worst) + ' degrees with steering, one drift, no flag');
        ok(fo2.worst <= 4.5 && fo2.recs.length === 1 && fo2.recs[0].flags.join() === FLAGS.STEER, '  and within ' + f1(fo2.worst) + ' degrees without steering, where nothing but the sum is left: counted, and flagged NO STEERING CHECK');
        const off1 = run({ scene: 'held', spacing: 50, saved: L, engine: { useLong: false } }), off0 = run({ scene: 'held', spacing: 50, saved: L, events: (ev) => ev.filter((e) => e.src !== 'long') });
        ok(off1.recs.length === 1 && off0.recs.length === 1 && Math.abs(off1.recs[0].score - off0.recs[0].score) <= 1 && Math.abs(off1.recs[0].peak - off0.recs[0].peak) <= 0.1 && off1.recs[0].flags.join() === off0.recs[0].flags.join() && Math.abs(off1.worst - off0.worst) < 0.1 && off1.eng.angle.out.hasAx === false,
            '  left out, the engine does what it does on a car that sends no forward acceleration (' + off1.recs[0].score + ' points and peak ' + off1.recs[0].peak + ', against ' + off0.recs[0].score + ' and ' + off0.recs[0].peak + ')');

        // --- the yaw rate and both accelerations stop together
        const cut = (at) => (ev, clock) => ev.filter((e) => ['yaw', 'lat', 'long'].indexOf(e.src) < 0 || e.t - clock < at);
        const ages = { yawMaxAgeMs: 2500, latMaxAgeMs: 2500 };
        let r = run({ scene: 'held', spacing: 50, saved: L, events: cut(6000), engine: ages });
        ok(r.recs.length === 1 && r.recs[0].end === 'lost' && r.recs[0].flags.includes(FLAGS.GAP) && r.eng.view().state === 'noyaw' && r.eng.view().angle === null && Math.abs(r.recs[0].time - (6 + 2.5 - 3.42)) < 0.4,
            'the yaw rate and both accelerations stop together in the middle of a held drift, on an app that says a healthy one is never older than 2.5 s on the move: the drift ends 2.5 s later, flagged DATA GAP, and the state is "noyaw" (' + describe(r.recs[0]) + ')');
        r = run({ scene: 'held', spacing: 50, saved: L, events: cut(6000) });
        ok(r.recs.length === 0 && r.eng.view().state === 'drift' && r.eng.view().angle > 15, 'KNOWN LIMIT: on an app that does not say so, nothing shows that they must have changed: 8 s after they stopped, and 3.5 s after the car went straight, the drift still runs on the last values (' +
            f1(r.eng.view().angle) + ' degrees shown, ' + Math.round(r.eng.view().run.score) + ' points and counting)');
        r = run({ scene: 'held', spacing: 50, saved: L, events: cut(1500), engine: ages });
        ok(r.recs.length === 0 && r.eng.view().state === 'noyaw' && r.eng.view().angle === null, 'they stop on the straight before the drift: "noyaw" and no angle, not "0 degrees, ready", and nothing is counted');
        const seen = {};
        r = run({ scene: 'standpull', spacing: 50, saved: L, engine: ages, events: (ev, clock) => ev.filter((e) => ['yaw', 'lat', 'long'].indexOf(e.src) < 0 || e.t - clock < 300 || e.t - clock > 5000), onTick: (eng) => { seen[eng.view().state] = true; } });
        ok(r.recs.length === 1 && r.recs[0].flags.length === 0 && !seen.noyaw && !seen.gap && seen.slow && seen.drift,
            'a car stands for 3 s and pulls away, and its yaw rate and accelerations say nothing until it does 17 km/h (nothing changed, nothing was sent): their last samples are 4.7 s old by then, but the car has not done 10 km/h for 2.5 s yet, so nothing is taken as lost (states seen: ' + Object.keys(seen).join(', ') + ')');
        r = run({ scene: 'held', spacing: 50, saved: L, events: (ev, clock) => ev.filter((e) => e.src !== 'lat' || e.t - clock < 6000), engine: ages });
        ok(r.recs.length === 1 && r.recs[0].end === 'lost' && r.recs[0].flags.includes(FLAGS.GAP) && r.eng.view().state === 'gap' && Math.abs(r.recs[0].time - (6 + 2.5 - 3.42)) < 0.4,
            'the sideways acceleration alone stops in the held drift, where the yaw rate hardly moves: lost 2.5 s later too, state "gap" (' + describe(r.recs[0]) + ')');
        r = run({ scene: 'held', spacing: 50, saved: L, events: (ev, clock) => ev.filter((e) => e.src !== 'yaw' || e.t - clock < 6000), engine: { yawMaxAgeMs: 0, latMaxAgeMs: 2500 } });
        ok(r.recs.length === 1 && r.recs[0].end === 'lost' && r.recs[0].time > 5.2, 'KNOWN LIMIT: a yaw source whose getter the app does not read (the chassis one) has no such limit: it dies in a held drift, and the app notices only when the sideways acceleration next moves (' + describe(r.recs[0]) + ')');

        // --- a data rate that is not known is not shown as one
        const fresh = new DriftEngine({});
        fresh.speed(C0, 50); fresh.idle(C0 + 50); fresh.idle(C0 + 400);
        ok(fresh.view().rate === null && fresh.view().state === 'noyaw', 'with no yaw rate and no sideways acceleration yet, the view holds no data rate (null: the screen shows "--")');
        ok(cell('held', { rate: 20 }).eng.view().rate === 20, 'and 20 a second where the car sends 20 a second');
        r = run({ scene: 'held', spacing: 50, saved: L, events: cut(6000), engine: ages });
        ok(r.eng.view().state === 'noyaw' && r.eng.view().rate === null && isFinite(r.eng.angle.out.slot), 'nor after the yaw rate and the accelerations have stopped: the rate they came at before is not shown as if it still held');
    });

    /* ================= what the re-check found ================= */
    await ok.part('what the re-check found: each of these was a fault once', async () => {
        const L = learned('a', 50, false).saved, Ln = learned('a', 50, false, { off: ['steer'] }).saved, Ld = learned('a', 50, true).saved, Lnd = learned('a', 50, true, { off: ['steer'] }).saved;
        const noSteer = { useSteer: false, off: ['steer'] };
        const say = (c) => c.recs.map((d) => d.score + ' ' + d.grade + '/' + d.peak + (d.flags.length ? ' [' + d.flags.join(', ') + ']' : ' [no flag]')).join(' ') || 'none';
        const shownIn = (o) => { let m = 0; const c = run(Object.assign({ spacing: 50, onTick: (eng, s) => { if (s.ok) m = Math.max(m, Math.abs(s.beta) / DEG); } }, o)); c.m = m; return c; };
        const flagged = (c) => c.recs.every((d) => d.flags.includes(FLAGS.STEER) && !canBeBest(d));

        // --- a banked or a climbing corner, the tyres gripping
        console.log('\n  A BANKED OR A CLIMBING CORNER, the tyres gripping (nothing slides), WITHOUT STEERING, clean data, 20/s: largest angle shown, and what was counted.');
        console.log('  zero: the forward acceleration reads that much more than the speed\'s own change all the time (m/s2). climb: the road climbs by that many degrees through the corner only.');
        const corners = [['bank3', '3 deg bank, 0.3 g, 80 km/h'], ['bank6', '6 deg, 0.2 g, 100'], ['bank6b', '6 deg, 0.35 g, 80'], ['bank9', '9 deg, 0.16 g, 100'], ['bank12b', '12 deg, 0.45 g, 100'], ['banked', '12 deg, 0.6 g, 100'], ['flat45', 'flat, 0.45 g, 70'], ['flat60', 'flat, 0.6 g, 80']];
        const cases = [['level', {}], ['zero +0.26', { faults: { zeroX: 0.26 } }], ['zero +0.5', { faults: { zeroX: 0.5 } }], ['zero +0.85', { faults: { zeroX: 0.85 } }], ['climb 3', 3], ['climb 5', 5], ['climb 7', 7]];
        console.log('  ' + 'corner'.padEnd(27) + cases.map((c) => c[0].padEnd(30)).join(''));
        const without = [], withSteer = [], counted = { level: 0, zero: 0, climb: 0 };
        for (const corner of corners) {
            const T = truthOf(corner[0], sim.CARS.a).T * 1000;
            let line = '  ' + corner[1].padEnd(27);
            for (const cs of cases) {
                const extra = typeof cs[1] === 'number' ? { events: climbIn(cs[1], T) } : cs[1];
                const n = shownIn(Object.assign({ scene: corner[0], saved: Ln }, noSteer, extra)), nd = run(Object.assign({ scene: corner[0], spacing: 50, saved: Lnd, dirty: true }, noSteer, extra)), w = shownIn(Object.assign({ scene: corner[0], saved: L }, extra));
                without.push(n, nd); withSteer.push(w);
                if (n.recs.length) counted[cs[0].split(' ')[0]]++;
                line += (pad(f1(n.m), 5) + '  ' + (n.recs.map((d) => d.score + ' ' + d.grade + (d.flags.includes(FLAGS.STEER) ? '*' : ' NO FLAG')).join(' ') || 'none')).padEnd(30);
            }
            console.log(line);
        }
        console.log('  (* flagged NO STEERING CHECK: counted and scored, never a best)');
        const all = [].concat.apply([], without.map((c) => c.recs));
        ok(without.every(flagged), 'banked corners of 3 to 12 degrees and two flat ones, on the level, with the forward acceleration reading 0.26, 0.5 and 0.85 m/s2 too much, and on climbs of 3, 5 and 7 degrees that begin with the corner, without steering, clean and dirty (' + without.length +
            ' runs): none is counted, or it is flagged NO STEERING CHECK, and never a best (' + all.length + ' drifts were counted, ' + all.filter((d) => d.flags.includes(FLAGS.STEER)).length + ' of them flagged; before this rule up to 800 B with no flag)');
        ok(counted.level === 2 && counted.climb >= 6, 'NOT SOLVED: they are still COUNTED. Clean data: ' + counted.level + ' of 8 on the level (the two gentle banked ones), ' + counted.zero + ' of 24 with a forward zero that is off, ' + counted.climb +
            ' of 24 on a climb that begins with the corner. The drift shows on the screen and in the session. Without a steering angle nothing tells such a corner from a slide');
        ok(withSteer.every((c) => c.recs.length === 0 && c.m < 6), 'with steering none of those ' + withSteer.length + ' runs counts anything, and none shows more than ' + f1(max(withSteer.map((c) => c.m))) + ' degrees');
        // (a slow, tight banked corner WITH steering)
        const tight = [['tight12', '12 degrees of bank, 0.25 g at 30 km/h'], ['tight10', '10 degrees, 0.2 g at 25 km/h']].map((t) => ({ name: t[1], c: shownIn({ scene: t[0], saved: L }), d: shownIn({ scene: t[0], saved: Ld, dirty: true }) }));
        const tightRecs = [].concat.apply([], tight.map((t) => t.c.recs.concat(t.d.recs)));
        ok(tight.every((t) => t.c.recs.length === 1 && t.c.recs[0].back === 0) && tightRecs.every((d) => d.flags.includes(FLAGS.STEER) && !canBeBest(d)),
            'NOT SOLVED, and new here: WITH steering a slow, tight banked corner is counted as a drift too (' + tight.map((t) => t.name + ': ' + f1(t.c.m) + ' degrees shown, ' + say(t.c)).join(' | ') +
            '). The steering check pulls there, but a bank that steep outruns it. The steering does not say that the car oversteers (it backed 0 % of the time), so each is flagged NO STEERING CHECK and none is a best');

        // --- real drifts on low grip, without steering
        console.log('\n  REAL DRIFTS WHERE THE CAR FEELS UNDER 1.5 m/s2 SIDEWAYS (the acceleration check cannot speak), 20/s: peak read / true, time, score, flags');
        const low = [['ice30', '30 degrees, 0.15 g across the path, 30 km/h, 12 s'], ['snow60', '60 degrees, 0.24 g across the path, 30 km/h, 12 s']].map((l) => {
            const tr = truthOf(l[0], sim.CARS.a);
            let felt = 0, peak = 0;
            for (let i = 0; i < tr.n; i++) peak = Math.max(peak, Math.abs(tr.beta[i]) / DEG);
            for (let i = 0; i < tr.n; i++) if (Math.abs(tr.beta[i]) / DEG >= peak - 3) felt = Math.max(felt, Math.abs(tr.ay[i]));       // (while the drift is held)
            const o = { name: l[1], felt, peak, n: run(Object.assign({ scene: l[0], spacing: 50, saved: Ln }, noSteer)), nd: run(Object.assign({ scene: l[0], spacing: 50, saved: Lnd, dirty: true }, noSteer)), w: run({ scene: l[0], spacing: 50, saved: L }) };
            console.log('  ' + o.name.padEnd(42) + ' felt ' + felt.toFixed(2) + ' m/s2 while it is held | without steering: ' + (o.n.recs.map(describe).join(' | ') || 'NOTHING COUNTED') + ' | dirty: ' + (o.nd.recs.map(describe).join(' | ') || 'NOTHING COUNTED') + ' | with steering: ' + (o.w.recs.map(describe).join(' | ') || 'NOTHING COUNTED'));
            return o;
        });
        ok(low.every((o) => o.felt < 1.5 && [o.n, o.nd].every((c) => c.recs.length === 1 && c.recs[0].flags.includes(FLAGS.STEER) && !canBeBest(c.recs[0]) && c.recs[0].time > 12) && Math.abs(o.n.recs[0].peak - o.peak) <= 2),
            'low grip: a drift held at 30 degrees with 0.15 g across its path, and one of 60 degrees with 0.24 g (what grip 0.3 leaves across the path at that angle); the car feels ' + low.map((o) => o.felt.toFixed(2)).join(' and ') + ' m/s2 sideways. Without steering, clean and dirty: each is counted again (after the first fix neither was), read within ' + f1(max(low.map((o) => Math.abs(o.n.recs[0].peak - o.peak)))) +
            ' degrees of its peak on clean data, flagged NO STEERING CHECK, and no best');
        ok(low.every((o) => o.w.recs.length === 1 && !o.w.recs[0].flags.includes(FLAGS.STEER)), '  with steering each is one drift, and the steering backs it (' + low.map((o) => o.w.recs[0].back + ' %').join(', ') + ' of its time)');

        // --- nothing starts until the car has gone straight: the screen is told
        const panRun = (name) => {
            let blocked = 0, n = 0, angle = 0; const states = {};
            const r = run({ scene: name, spacing: 50, onTick: (eng, s, truth, ms) => { if (Math.abs(truth.at(ms).drift) < 20) return; const v = eng.view(); n++; if (v.blocked) blocked++; states[v.state] = true; angle = Math.max(angle, v.angle || 0); } });
            return { r, blocked: n ? blocked / n : 0, states: Object.keys(states).join(), angle, learn: r.eng.learn.values().state };
        };
        const p0 = panRun('pan'), p1 = panRun('panstraight');
        ok(p0.r.recs.length === 0 && p0.blocked === 1 && p0.states === 'ready' && p0.angle > 25 && p0.learn === 'learned',
            'a skid pan: a car that has learned nothing circles left and right (nothing slides), the first line is drawn in a corner, and it is then drifted at 30 degrees for 10 s with no straight in between. The drift is NOT counted (the angle shown is right: ' + f1(p0.angle) +
            ' degrees; the car is "' + p0.learn + '"), and for all of it the view says "blocked": the screen shows GO STRAIGHT FOR A MOMENT (test_drift_car.js)');
        ok(p1.r.recs.length === 1 && p1.blocked === 0 && p1.r.recs[0].flags.indexOf(FLAGS.GAP) < 0 && Math.abs(p1.r.recs[0].peak - 30) < 2.5, '  with 1.5 s of straight before it the same drift is counted, and nothing is blocked (' + describe(p1.r.recs[0]) + ')');
        const fresh = new DriftEngine({});
        ok(fresh.view().blocked === false && fresh.view().noSteer === 'nosource' && fresh.view().ax0 === null, '  (a fresh engine: not blocked, no steering source yet, no forward offset yet)');

        // --- learning on a road that climbs, or with a forward-acceleration zero that is off
        console.log('\n  LEARNING WHERE THE FORWARD ACCELERATION READS MORE THAN THE SPEED\'S OWN CHANGE (the scenes "ordinary" and "gentle", nothing slides, 20/s).');
        console.log('  forward zero (m/s2)        data    yaw: state   moments (left/right)   K against the flat run   steering: state  moments   seconds turned down   offset in use at the end');
        const zeros = [[0, 'the flat run'], [0.513, 'a climb of 3 degrees'], [0.55, ''], [0.684, 'a climb of 4 degrees'], [0.7, ''], [1.0, ''], [-0.7, 'a fall of 4 degrees']], LZ = [];
        for (const z of zeros) for (const dirty of [false, true]) {
            const r = run({ scene: ['ordinary', 'gentle'], spacing: 50, dirty, seed: 7, faults: { zeroX: z[0] } }), st = r.eng.learn.status(), flat = LZ.find((x) => x.z === 0 && x.dirty === dirty);
            const o = { z: z[0], dirty, st, k: flat ? st.yaw.k / flat.st.yaw.k - 1 : 0, ax0: r.eng.view().ax0, recs: r.recs.length };
            LZ.push(o);
            console.log('  ' + ((z[0] > 0 ? '+' : '') + z[0] + (z[1] ? ' (' + z[1] + ')' : '')).padEnd(27) + (dirty ? 'dirty' : 'clean').padEnd(8) + st.yaw.state.padEnd(13) + pad(st.yaw.n + ' (' + st.yaw.left + '/' + st.yaw.right + ')', 12) + pad((100 * o.k).toFixed(2) + ' %', 22) + '       ' +
                st.steer.state.padEnd(13) + pad(st.steer.n, 8) + pad(st.turnedDown, 16) + pad(o.ax0 === null ? '--' : o.ax0.toFixed(2), 22));
        }
        const f0 = (dirty) => LZ.find((x) => x.z === 0 && x.dirty === dirty);
        ok(LZ.every((o) => o.st.yaw.state === 'learned' && o.st.steer.state === 'learned' && Math.abs(o.st.yaw.n - f0(o.dirty).st.yaw.n) <= 4 && Math.abs(o.st.steer.n - f0(o.dirty).st.steer.n) <= 4 && Math.abs(o.k) < 0.003 && o.recs === 0),
            'with the forward acceleration reading 0.5 to 1.0 m/s2 more than the speed\'s change, or 0.7 less (a climb of 3 or 4 degrees, a fall, a zero that is off): the yaw rate and the steering are learned as on the flat, clean and dirty (moments within 4 of the flat run\'s ' +
            f0(false).st.yaw.n + ' and ' + f0(false).st.steer.n + ', K within 0.3 %). Before, +0.7 left the steering with no moment, and +1.0 the yaw rate with 10 moments on clean data and none on dirty');
        ok(LZ.filter((o) => !o.dirty).every((o) => Math.abs(o.ax0 - o.z) < 0.05) && LZ.filter((o) => o.dirty && o.z).every((o) => Math.abs(o.ax0 - o.z) < 0.15),
            '  because the offset is measured on straights and taken out: at the end of each run it stood within 0.05 m/s2 of what was put in on clean data, within 0.15 on dirty data');
        ok(f0(false).st.turnedDown === 0 && LZ.every((o) => o.st.turnedDown <= 6), '  and the "no slide" test turned no second down on the flat run, and ' + max(LZ.map((o) => o.st.turnedDown)) + ' at most in the others (where nothing slides either)');
        // (slides are still not learned from where the forward acceleration reads off)
        const slides = [];
        for (const z of [0.6, -0.6]) for (const sc of [['wetboth', []], ['wetboth', ['wheels']], ['wetcircle', ['wheels']]]) slides.push(run({ scene: sc[0], spacing: 50, off: sc[1], faults: { zeroX: z } }).eng.learn.status());
        ok(slides.every((st) => st.yaw.moments === 0 && st.yaw.state === 'none' && st.turnedDown >= 8), 'a car that has learned nothing is drifted in steady circles with its forward acceleration reading 0.6 m/s2 more, or less, than its speed\'s change, with and without wheel speeds: still no moment in any of the six runs (the "no slide" test turned ' +
            Math.min.apply(null, slides.map((st) => st.turnedDown)) + ' to ' + max(slides.map((st) => st.turnedDown)) + ' seconds down)');
        // (and a drift on a climb is read as on the level)
        const climbs = [];
        for (const sc of ['held', 'circle', 'switches']) for (const z of [0.85, -0.51]) {
            const w = run({ scene: sc, spacing: 50, saved: L, faults: { zeroX: z } }), n = run(Object.assign({ scene: sc, spacing: 50, saved: Ln, faults: { zeroX: z } }, noSteer));
            climbs.push({ w: w.worst - TAB.cs[sc][20].worst, n: n.worst - TAB.cn[sc][20].worst, one: w.recs.length === 1 && n.recs.length === 1 && w.recs[0].flags.length === 0 });
        }
        ok(climbs.every((c) => Math.abs(c.w) <= 0.3 && Math.abs(c.n) <= 0.3 && c.one), 'a held drift, the long circle and the switches with the forward acceleration reading 0.85 m/s2 more (a climb of 5 degrees) or 0.51 less, with and without steering: each angle is within 0.3 degrees of what it is on the level (largest difference ' +
            f1(max(climbs.map((c) => Math.max(Math.abs(c.w), Math.abs(c.n))))) + '). Before, the long circle read up to 5.9 degrees off there');

        // --- a steering scale that is not learned yet backs nothing
        const half = [['ordinary', 'held'], ['ordinary', 'fewgentle', 'held']].map((sc) => { let pull = 0, k = 0; const c = run({ scene: sc, spacing: 50, seed: 7, onTick: (eng, s) => { if (eng.tracker.state === 'drift') { k++; if (s.steering) pull++; } } }); c.pull = k ? pull / k : 0; c.st = c.eng.learn.status(); return c; });
        ok(half[0].st.yaw.state === 'learned' && half[0].st.steer.state === 'none' && half[0].st.steer.n === 0 && half[0].recs.length === 1 && half[0].recs[0].flags.join() === FLAGS.STEER && half[0].eng.view().noSteer === 'unlearned',
            'WHAT THE RULE COSTS: 3.5 minutes of ordinary corners at 44 to 100 km/h teach the yaw rate ("' + half[0].st.yaw.state + '", ' + half[0].st.yaw.n + ' moments) and the steering nothing (it is learned from slow, gentle corners: 12 to 60 km/h, 0.5 to 2.5 m/s2). A drift after that drive alone is flagged NO STEERING CHECK: ' + describe(half[0].recs[0]));
        ok(half[1].st.steer.state === 'learning' && half[1].pull > 0.8 && half[1].recs.length === 1 && half[1].recs[0].flags.join() === FLAGS.STEER && half[1].recs[0].back === 0,
            '  four slow corners more: the steering is "learning" (' + half[1].st.steer.n + ' moments of the 14 it takes) and the check already pulls (' + Math.round(100 * half[1].pull) + ' % of the drift), but a scale that is still being learned backs nothing: flagged the same. With the whole "gentle" scene it is "learned", and the drift carries no flag (the tables)');

        // --- a steering source that goes silent
        const cutSteer = (ev, clock) => ev.filter((e) => e.src !== 'steer' || e.t - clock < 1000);
        const dead = ['held', 'small13', 'circle'].map((n) => run({ scene: n, spacing: 50, saved: L, events: cutSteer }));
        ok(dead.every((c) => c.recs.length === 1 && c.recs[0].flags.join() === FLAGS.STEER && c.recs[0].opp === null && c.worst <= 2 && c.eng.view().noSteer === 'stale'),
            'the steering stops arriving on the straight before a drift (30 degrees, 13 degrees, the long circle): once the car has turned in and the steering has said nothing for 2 s it counts as silent and is not used. The angle is within ' + f1(max(dead.map((c) => c.worst))) +
            ' degrees (a drift of 13 degrees read 11.9 before, pulled toward the wheel that seemed to stand still), opposite lock says "not known", and the drift is flagged NO STEERING CHECK');
        const deadBank = ['bank3', 'bank6b', 'bank12b'].map((n) => shownIn({ scene: n, saved: L, events: cutSteer }));
        ok(deadBank.every(flagged), '  and a banked corner taken with full grip on such a car: none is counted, or it is flagged (' + deadBank.map(say).join(' | ') + ')');
        const back = run({ scene: 'held', spacing: 50, saved: L, events: (ev, clock) => ev.filter((e) => e.src !== 'steer' || e.t - clock < 1000 || e.t - clock > 9000) });
        ok(back.eng.view().noSteer === null, '  when the steering speaks again it is used again');
        const still = ['lock46', 'lock58', 'held', 'circle'].map((n) => { let st = 0, k = 0; const c = run({ scene: n, spacing: 50, saved: L, sample: { onChange: true }, onTick: (eng, s) => { if (eng.tracker.state === 'drift') { k++; if (s.sw === 'stale') st++; } } }); c.stale = k ? st / k : 0; return c; });
        ok(still.every((c) => c.recs.length === 1 && !c.recs[0].flags.includes(FLAGS.STEER) && c.stale < 0.1), '  a steering signal that is sent on change only is not taken as silent in a drift: not with the wheels held at their lock for 10 s (46 and 58 degrees), not in a steady held drift (silent for ' +
            f1(100 * max(still.map((c) => c.stale))) + ' % of the drift at most, backed ' + Math.min.apply(null, still.map((c) => c.recs[0].back)) + ' % or more). Silent is: nothing for 2 s while the car both went straight (with less than ' + AngleMod.TABLE.STRAIGHT_DEG + ' degrees shown) and turned. In these four the car turns steadily; a drift at the lock in which its nose stops turning is under "what the third check found"');
    });

    /* ================= what the second check found ================= */
    await ok.part('what the second check found', async () => {
        const L = learned('a', 50, false).saved, Ln = learned('a', 50, false, { off: ['steer'] }).saved, car = sim.CARS.a;
        const say = (c) => c.recs.map((d) => d.score + ' ' + d.grade + '/' + d.peak + (d.flags.length ? ' [' + d.flags.join(', ') + ']' : ' [no flag]')).join(' ') || 'none';
        const stale = (o) => { let m = 0, n = 0, st = 0, sd = 0, nd = 0; const c = run(Object.assign({ spacing: 50, onTick: (eng, s) => { n++; if (s.sw === 'stale') st++; if (eng.tracker.state === 'drift') { nd++; if (s.sw === 'stale') sd++; } if (s.ok) m = Math.max(m, Math.abs(s.beta) / DEG); } }, o)); c.m = m; c.stale = n ? st / n : 0; c.staleDrift = nd ? sd / nd : 0; return c; };

        // --- a steering value that is still sent and does not move
        const rawAt = (deg) => Math.round(car.steerZero + car.steerSign * deg * car.steerRatio / car.steerStep);
        const frozen = (deg, from) => (ev, clock) => ev.map((e) => (e.src === 'steer' && e.t - clock >= (from || 1000) ? Object.assign({}, e, { v: rawAt(deg) }) : e));
        console.log('\n  THE STEERING STUCK AT A VALUE AND STILL SENT every slot (from 1 s on), then three corners of 0.6 g at 80 km/h with full grip, both ways (nothing slides), clean, 20/s:');
        const stuck = [-14, -12, -9, 12].map((deg) => { const c = stale({ scene: 'fourcorners', saved: L, events: frozen(deg) }); console.log('  stuck at ' + pad(deg, 4) + ' degrees at the wheels: largest angle shown ' + pad(f1(c.m), 5) + ', counted: ' + say(c) + ', taken for stuck ' + Math.round(100 * c.stale) + ' % of the time'); return c; });
        ok(stuck.every((c) => c.recs.length === 0 && c.m < 6 && c.eng.view().noSteer === 'stale' && c.stale > 0.75), 'a steering angle stuck at 9 to 14 degrees and still sent, then corners with full grip: nothing is counted, and no more than ' + f1(max(stuck.map((c) => c.m))) +
            ' degrees are shown. After the first corner the steering counts as stuck and is not used. Before this rule every corner that turned away from the stuck side looked like opposite lock: these runs counted 547, 667 and 547 points, grade B, with no flag, at 12 and 14 degrees (350 C, flagged, at 9), and showed up to 17.7 degrees');
        const sd = stale({ scene: 'cornerdrift', saved: L, events: frozen(0) }), sdRef = run({ scene: 'cornerdrift', spacing: 50, saved: L });
        ok(sd.recs.length === 1 && sd.recs[0].flags.join() === FLAGS.STEER && sd.recs[0].back === 0 && sd.recs[0].opp === null && !canBeBest(sd.recs[0]) && sd.worst <= 2.5 && sdRef.recs.length === 1 && sdRef.recs[0].flags.length === 0,
            '  stuck at straight ahead, then an ordinary corner and a real drift of 30 degrees: the drift is read without the steering (within ' + f1(sd.worst) + ' degrees), its opposite lock says "not known", and it is flagged NO STEERING CHECK: ' + describe(sd.recs[0]) + ' (with the steering alive: ' + describe(sdRef.recs[0]) + ')');
        const thaw = stale({ scene: 'cornerdrift', saved: L, events: (ev, clock) => frozen(0)(ev, clock).map((e, i) => (e.src === 'steer' && e.t - clock >= 16000 ? ev[i] : e)) });
        ok(thaw.recs.length === 1 && thaw.recs[0].flags.length === 0 && thaw.eng.view().noSteer === null && thaw.stale > 0.2, '  when the value moves again (here on the straight before the drift) the steering is used again: ' + describe(thaw.recs[0]));
        // (what it must not take for stuck: a wheel that is honestly held still)
        const honest = [['lock46', 'held at 46 degrees, the wheels at their lock for 10 s'], ['lock50', 'at 50'], ['lock58', 'at 58'], ['circle', 'the long circle'], ['long25', '25 degrees for 40 s'], ['held', 'the held drift'], ['roundabout', 'a long ordinary corner'], ['gentlebend', 'a gentle bend for half a minute'], ['straight10', 'ten minutes straight']]
            .map((h) => { const c = stale({ scene: h[0], saved: L }); c.name = h[1]; return c; });
        ok(honest.every((c) => c.stale === 0) && honest.slice(0, 6).every((c) => c.recs.length === 1 && c.recs[0].flags.length === 0 && c.recs[0].back >= 80),
            '  a wheel that is honestly held still, every slot sent: the wheels at their lock for 10 s (46, 50 and 58 degrees), the long circle, 25 degrees for 40 s, the held drift, a long ordinary corner, a gentle bend, ten minutes straight: never taken for stuck (0 % of the time in all ' + honest.length +
            '), and the six drifts carry no flag (backed ' + Math.min.apply(null, honest.slice(0, 6).map((c) => c.recs[0].back)) + ' % or more)');
        const rough = RATES.map((r) => stale({ scene: 'bumpy', spacing: 1000 / r, saved: learned('a', 1000 / r, false).saved }));
        const drive = stale({ scene: ['ordinary', 'gentle', 'slalom', 'lanechange', 'switches', 'handbrake'], saved: null, seed: 7 });
        ok(rough.every((c) => c.stale === 0 && c.recs.length === 0) && drive.stale === 0, '  nor on a bumpy straight at 5 to 50 samples a second, where the made-up wheel does not move by a count while the yaw rate shakes; nor anywhere in a slalom, a lane change, two switches or a handbrake entry');
        // (the rule itself, on samples of the test's own: each of these needs one of its conditions)
        const V = 80 / 3.6, at = (y) => y * DEG * V;
        const w1 = wheel((t) => { const y = ramp(t, 4, 5.5, 0, 15); return { kmh: 80, yaw: y, ay: at(y), steer: 31568 }; }, 12);
        ok(w1.first !== null && w1.first > 5 && w1.first < 6.5 && w1.last, '  the rule on samples of its own. A value that does not move while the car goes straight for 4 s and then turns in to 15 degrees a second: stuck ' + (w1.first === null ? 'NEVER' : f1(w1.first - 4.6) + ' s after the car turned at 6 degrees a second') + ', and it stays so');
        const w2 = wheel((t) => { const y = ramp(t, 4, 5.5, 0, 15); return { kmh: 80, yaw: y, ay: at(y), steer: t < 9 ? 31568 : 31568 + Math.round((t - 9) * 40) }; }, 12);
        ok(w2.at(8.9) && !w2.at(9.4) && !w2.last, '    until it moves by a count');
        const w3 = wheel((t) => { const y = t < 6 ? 25 : ramp(t, 6, 6.4, 25, -25); return { kmh: 60, yaw: y, ay: y * DEG * 60 / 3.6, steer: 29168 }; }, 12);
        ok(w3.first === null, '    a yaw rate that only CROSSES zero is no straight (a wheel at its lock while the car swings from 25 degrees a second one way to 25 the other in 0.4 s): not stuck. The straight must last 0.7 s');
        const w4 = wheel((t) => { const y = t < 4 ? 0 : 8; return { kmh: 80, yaw: y, ay: 0, steer: 32768 }; }, 14);
        ok(w4.first === null, '    a yaw rate that jumps by 8 degrees a second on a straight and stays, while the car feels nothing sideways: not stuck (it is the yaw rate that is wrong there). The sideways acceleration must turn with it');
        const w5 = wheel((t) => { const kmh = ramp(t, 3, 6, 0, 40), y = t < 3 ? 0 : 12; return { kmh, yaw: ramp(t, 3, 3.5, 0, y), ay: ramp(t, 3, 3.5, 0, y) * DEG * kmh / 3.6, steer: 30768 }; }, 12);
        ok(w5.first === null, '    a car that stands with its wheels turned and pulls away in a circle on a wheel that does not move: not stuck. Standing is no straight: the car must have done 10 km/h or more');
        const w6 = wheel((t) => { const y = ramp(t, 3.8, 4, 0, 15); return { kmh: 80, yaw: y, ay: at(y), steer: 32768 + (t >= 3 ? 1 : 0) + (t >= 4.9 ? 1 : 0) }; }, 12);
        ok(w6.first === null, '    a value that moved by a count 1.7 s ago is not stuck yet, straight and turn or not: 2 s are asked, as of a silent one');
        const w7 = wheel((t) => { const y = t < 3 ? 0 : 12 * Math.sin(2 * Math.PI * 1.3 * (t - 3)); return { kmh: 80, yaw: y, ay: at(y), steer: 32768 }; }, 14);
        ok(w7.first === null, '    a car that swings both ways faster than once a second (12 degrees a second each way at 1.3 a second) on a value that does not move: not stuck. KNOWN LIMIT: the turn must last 0.7 s one way, so a slalom alone does not show a stuck steering');

        // --- the forward acceleration's offset is not measured while the car brakes or pulls hard
        console.log('\n  HARD BRAKING IN A STRAIGHT LINE (150 to 60 km/h in 4.8 s, 1 g at its hardest), THEN AT ONCE A CORNER, on a car whose forward acceleration reads 10 % low (learned so), clean, 20/s:');
        const low = { faults: { gainX: 0.9 } }, Lg = learned('a', 50, false, low).saved, Lgn = learned('a', 50, false, { faults: { gainX: 0.9 }, off: ['steer'] }).saved;
        const offsetAt = (o) => { let ax0 = null, m = 0; const c = run(Object.assign({ spacing: 50, onTick: (eng, s, truth, ms) => { if (ax0 === null && Math.abs(truth.at(ms).lat) > 0.05) ax0 = eng.angle.ax0; if (s.ok) m = Math.max(m, Math.abs(s.beta) / DEG); } }, o)); c.ax0 = ax0; c.m = m; return c; };
        const bc = offsetAt(Object.assign({ scene: 'brakecorner', saved: Lgn, useSteer: false, off: ['steer'] }, low)), bd = offsetAt(Object.assign({ scene: 'brakedrift', saved: Lg }, low));
        console.log('  a corner of 0.5 g for 10 s, nothing slides, without steering: offset in use at the turn-in ' + bc.ax0.toFixed(2) + ' m/s2, largest angle shown ' + f1(bc.m) + ' | a drift of 30 degrees for 6 s, with steering: offset ' + bd.ax0.toFixed(2) + ', worst error ' + f1(bd.worst) + ', ' + say(bd));
        ok(Math.abs(bc.ax0) < 0.1 && bc.m < 1.5 && bc.recs.length === 0 && Math.abs(bd.ax0) < 0.1 && bd.worst <= 3 && bd.recs.length === 1 && bd.recs[0].flags.length === 0,
            'the offset of the forward acceleration is only measured where the speed changes by no more than 2 m/s2. A car brakes hard in a straight line and turns in at once, and its forward acceleration reads 10 % low, so that under braking it reads up to 1 m/s2 off what the speed loses: the offset in use at the turn-in is ' +
            bc.ax0.toFixed(2) + ' m/s2, a corner with full grip shows ' + f1(bc.m) + ' degrees without steering, and a drift of 30 degrees is read within ' + f1(bd.worst) + ' with steering. Without that limit the braking was taken for a climb: 0.41 m/s2 at the turn-in, the angle in that corner up to 5.2 degrees off, the drift up to 3.9');
    });

    /* ================= what the third check found ================= */
    await ok.part('what the third check found', async () => {
        const L = learned('a', 50, false).saved;
        const say = (c) => c.recs.map((d) => d.score + ' ' + d.grade + '/' + d.peak + ', backed ' + d.back + ' %' + (d.flags.length ? ' [' + d.flags.join(', ') + ']' : ' [no flag]')).join(' + ') || 'none';
        const stale = (o) => { let n = 0, st = 0, sd = 0, nd = 0; const c = run(Object.assign({ spacing: 50, saved: L, onTick: (eng, s) => { n++; if (s.sw === 'stale') st++; if (eng.tracker.state === 'drift') { nd++; if (s.sw === 'stale') sd++; } } }, o)); c.stale = n ? st / n : 0; c.staleDrift = nd ? sd / nd : 0; return c; };
        const onChange = { each: { steer: { onChange: true } } };

        // --- a healthy wheel at its lock, and the nose stops turning in the middle of the drift
        console.log('\n  A HEALTHY STEERING, THE WHEELS AT THEIR LOCK (36 degrees), AND THE CAR\'S NOSE STOPS TURNING IN THE MIDDLE OF THE DRIFT, clean, 20/s, with steering:');
        const rows = [['liftlock', 'a lift at 55 degrees: the path bends on at 0.25 g, the angle falls by 5.8 and comes back', 'nolift'], ['slidelock', 'a straight slide of 1 s at 50 degrees between two corners', 'noslide']].map((r) => {
            const o = { name: r[1], every: stale({ scene: r[0] }), change: stale({ scene: r[0], sample: onChange }), ref: stale({ scene: r[2] }) };
            console.log('  ' + r[1] + ':');
            [['the steering sent every slot', o.every], ['sent on change only', o.change], ['the same drift with its nose turning all the way', o.ref]].forEach((x) => console.log('    ' + x[0].padEnd(50) + 'counted: ' + say(x[1]).padEnd(34) + ' worst error ' + pad(f1(x[1].worst), 5) + '   taken for silent or stuck ' + f1(100 * x[1].stale) + ' % of the time'));
            return o;
        });
        const clean = (c, ref) => c.recs.length === 1 && c.recs[0].flags.length === 0 && c.recs[0].back >= 80 && c.stale === 0 && c.worst <= ref.worst + 1;
        ok(rows.every((o) => clean(o.every, o.ref) && clean(o.change, o.ref) && clean(o.ref, o.ref)),
            'a healthy steering is not taken for silent or stuck where the car\'s nose stops turning in the middle of a drift at the lock: in a lift at 55 degrees and in a straight slide of 1 s at 50, steering sent every slot and sent on change only, each is ONE drift with no flag (backed ' +
            Math.min.apply(null, rows.map((o) => Math.min(o.every.recs[0].back, o.change.recs[0].back))) + ' % or more), never "silent or stuck", and the angle is no further off than in the same drift with its nose turning all the way (' +
            rows.map((o) => f1(Math.max(o.every.worst, o.change.worst)) + ' against ' + f1(o.ref.worst)).join(', ') + ' degrees: what the wheels at their lock cost, a known limit). Before, the wheel that sat still to the count was taken for stuck or silent there: "the car has gone straight" was judged by the yaw rate alone. ' +
            'The lift was flagged NO STEERING CHECK, and the slide on a steering sent on change was counted as two drifts, the second read up to 47 degrees low');
        // (a steering that really is stuck or silent is still found in the same scene)
        const car = sim.CARS.a, rawAt = (deg) => Math.round(car.steerZero + car.steerSign * deg * car.steerRatio / car.steerStep);
        const dead = [['stuck at straight ahead and still sent', (ev, clock) => ev.map((e) => (e.src === 'steer' && e.t - clock >= 1000 ? Object.assign({}, e, { v: rawAt(0) }) : e))], ['silent', (ev, clock) => ev.filter((e) => e.src !== 'steer' || e.t - clock < 1000)]]
            .map((d) => { const c = stale({ scene: 'liftlock', events: d[1] }); c.name = d[0]; return c; });
        ok(dead.every((c) => c.recs.length === 1 && c.recs[0].flags.join() === FLAGS.STEER && c.recs[0].back <= 5 && c.staleDrift > 0.9 && c.worst <= 2.5 && c.eng.view().noSteer === 'stale'),
            '  and a steering that really is stuck, or silent, from the straight before that drift on is still found: taken for silent or stuck for ' + Math.round(100 * Math.min.apply(null, dead.map((c) => c.staleDrift))) + ' % of the drift or more, the drift read without it (within ' +
            f1(max(dead.map((c) => c.worst))) + ' degrees) and flagged NO STEERING CHECK (' + dead.map((c) => c.name + ': ' + say(c)).join(' | ') + ')');

        // --- the rule on samples of its own: the same value that does not move, with and without an angle on the screen
        const V = 80 / 3.6, at = (y) => y * DEG * V, lock = 32768 + 3600, LIM = AngleMod.TABLE.STRAIGHT_DEG;
        // the car swings 45 degrees sideways in 3 s (the wheel goes to its lock), its nose stops turning for 2 s, then it turns at 15 degrees a second
        const swing = (t, steer) => ({ kmh: 80, yaw: t < 2 ? 0 : t < 5 ? -15 : t < 7 ? 0 : 15, ay: t < 7 ? 0 : at(15), steer });
        const k1 = wheel((t) => swing(t, t < 2 ? 32768 : t < 4 ? Math.round(32768 + (t - 2) * 1800) : lock), 12);
        ok(LIM === 20 && k1.first === null && k1.shown > 25, '  the rule on samples of its own. A car swings 45 degrees sideways with its wheel going to the lock; its nose stops turning for 2 s and turns again, the value sent every slot and not moving by a count: not stuck (' + f1(k1.shown) + ' degrees are still shown 5 s later). With an angle of ' + LIM + ' degrees or more on the screen, and the wheels turned into the slide as they are here, a yaw rate near zero is no straight');
        const k2 = wheel((t) => swing(t, t < 2 ? 32768 : t < 2.5 ? Math.round(32768 + (t - 2) * 3600) : undefined), 12);
        ok(k2.first === null && k2.shown > 25, '    the same with a steering that says nothing more from half a second into the swing (the wheel turned 18 degrees by then, under ' + LIM + ' degrees shown): not silent, and ' + f1(k2.shown) +
            ' degrees are still shown at the end. The moment at which the yaw rate is near zero must itself show less than ' + LIM + ' degrees. Before, such a wheel was taken for silent, the car for at rest, and the angle was pulled to zero in the slide');
        const k3 = wheel((t) => ({ kmh: 80, yaw: t < 7 ? 0 : 15, ay: t < 7 ? 0 : at(15), steer: t < 2.5 ? 32768 : undefined }), 12), k4 = wheel((t) => ({ kmh: 80, yaw: t < 7 ? 0 : 15, ay: t < 7 ? 0 : at(15), steer: 32768 }), 12);
        ok(k3.first !== null && k3.first > 7 && k3.first < 8 && k4.first !== null && k4.first > 7.5 && k4.first < 8.5, '    and with no angle on the screen (the car goes straight for 7 s and turns in at 15 degrees a second) both are found as before: silent ' + (k3.first === null ? 'NEVER' : f1(k3.first - 7) + ' s') + ' after the turn-in, stuck ' + (k4.first === null ? 'NEVER' : f1(k4.first - 7) + ' s') + ' after it');
    });

    /* ================= what the fourth check found ================= */
    await ok.part('what the fourth check found', async () => {
        const L = learned('a', 50, false).saved, Ln = learned('a', 50, false, { off: ['steer'] }).saved, car = sim.CARS.a;
        const say = (c) => c.recs.map((d) => d.score + ' ' + d.grade + '/' + d.peak + (d.flags.length ? ' [' + d.flags.join(', ') + ']' : ' [no flag]')).join(' + ') || 'none';
        // one scene through the engine, and with it: the share of the time and the first moment (s) at which the steering counted as silent or stuck, the largest
        // angle shown on a true straight at more than 85 km/h, the last moment at which nothing could start, and the most the engine read of the wheels (degrees)
        const watch = (o) => {
            const w = { n: 0, st: 0, first: null, straight: 0, blockedAt: null, d: 0 };
            const c = run(Object.assign({ spacing: 50, saved: L, onTick: (eng, s, truth, ms) => {
                w.n++; if (s.sw === 'stale') { w.st++; if (w.first === null) w.first = ms / 1000; }
                if (s.d !== null && Math.abs(s.d) > w.d) w.d = Math.abs(s.d);
                const tr = truth.at(Math.max(0, Math.min(truth.T * 1000 - 1, ms)));
                if (s.ok && tr.V * 3.6 > 85 && Math.abs(tr.lat) < 0.01 && Math.abs(tr.drift) < 0.3) w.straight = Math.max(w.straight, Math.abs(s.beta) / DEG);
                if (eng.view().blocked) w.blockedAt = ms / 1000;
            } }, o));
            return Object.assign(c, { stale: w.n ? w.st / w.n : 0, first: w.first, straight: w.straight, blockedAt: w.blockedAt, wheels: w.d / DEG });
        };
        const rawAt = (deg) => Math.round(car.steerZero + car.steerSign * deg * car.steerRatio / car.steerStep);
        // the steering's value frozen from `at` ms on at what it reads then, and still sent in every slot
        const frozenFrom = (at) => (ev, clock) => { let v = null; return ev.map((e) => { if (e.src !== 'steer') return e; if (e.t - clock < at) { v = e.v; return e; } return Object.assign({}, e, { v }); }); };
        // the steering sent once at deg degrees at t0 ms and not again until t1 (a wheel held still, on a source that is sent on change)
        const heldFrom = (deg, t0, t1) => (ev, clock) => { const out = ev.filter((e) => e.src !== 'steer' || e.t - clock < t0 || e.t - clock > t1); let i = 0; while (i < out.length && out[i].t - clock < t0) i++; out.splice(i, 0, { t: clock + t0, src: 'steer', v: rawAt(deg) }); return out; };

        // --- the state that held: a value that freezes in an ordinary corner, a banked corner the other way with no straight between
        console.log('\n  A STEERING VALUE THAT FREEZES IN AN ORDINARY CORNER (0.45 g at 40 km/h, 3 s into it) AND IS STILL SENT; WITH NO STRAIGHT BETWEEN A BANKED CORNER THE OTHER WAY');
        console.log('  (8 degrees of bank, 0.3 g at 40 km/h for 12 s); then two laps with full grip, never under 40 km/h, with one real drift of 40 degrees in each. Clean, 20/s:');
        const ref = watch({ scene: 'frozenbank' }), fz = watch({ scene: 'frozenbank', events: frozenFrom(8500) });
        [['the steering alive', ref], ['frozen, still sent', fz]].forEach((x) => console.log('    ' + x[0].padEnd(22) + 'counted: ' + say(x[1]).padEnd(92) + ' silent or stuck: ' + (x[1].first === null ? 'never' : 'from ' + f1(x[1].first) + ' s on').padEnd(16) +
            ' largest angle shown on the two straights at 90 km/h: ' + pad(f1(x[1].straight), 5) + '   nothing can start: ' + (x[1].blockedAt === null ? 'never' : 'until ' + f1(x[1].blockedAt) + ' s')));
        const real = fz.recs.filter((d) => !d.flags.includes(FLAGS.SPIN) && Math.abs(d.peak - 40) < 3);
        ok(ref.recs.length === 2 && ref.recs.every((d) => d.flags.length === 0 && Math.abs(d.peak - 40) < 3) && ref.first === null && ref.straight < 1, 'the drive with the steering alive: the two real drifts and nothing else, no flag (' + say(ref) + '), ' + f1(ref.straight) + ' degrees at most on the straights');
        ok(fz.first !== null && fz.first < 45 && fz.straight < 2 && fz.blockedAt !== null && fz.blockedAt < 60 && real.length === 2 && real.every((d) => d.flags.join() === FLAGS.STEER) && fz.recs.every((d) => !canBeBest(d)) && fz.eng.view().noSteer === 'stale',
            'a steering value that freezes in an ordinary corner and is still sent, then a banked corner the other way with no straight between: the frozen value does not fit that corner, the check is not believed and the angle shown runs away (counted there, flagged: ' +
            say({ recs: fz.recs.filter((d) => real.indexOf(d) < 0) }) + '). The steering is taken for stuck ' + f1(fz.first) + ' s into the drive, in the first corner after the first straight; from ' + f1(fz.blockedAt) + ' s on a drift can start again; ' + f1(fz.straight) +
            ' degrees at most are shown on the straights at 90 km/h; and both real drifts are counted, flagged NO STEERING CHECK (' + say({ recs: real }) + '). Before, the stuck rule and the rest rule held each other up: the stuck rule waited for less than ' + AngleMod.TABLE.STRAIGHT_DEG +
            ' degrees shown, the rest rule for a steering near its centre. 40.5 degrees stood on those straights, nothing could start to the end of the drive, and neither real drift was counted');

        // --- why the limit on the angle shown is not lower: a stuck value that reads as opposite lock
        const op = watch({ scene: 'opplock', events: frozenFrom(8500) });
        ok(op.recs.length >= 1 && op.recs.every((d) => d.flags.includes(FLAGS.STEER) && !canBeBest(d)) && op.first !== null && op.first < 40 && op.eng.view().noSteer === 'stale',
            'why "gone straight" does not ask for less than ' + AngleMod.TABLE.STRAIGHT_DEG + ' degrees shown. A value sticks at about 12 degrees in a slow corner (0.5 g at 30 km/h) and at once a faster corner the other way follows (0.6 g at 80 km/h), then corners with full grip. The stuck value reads as opposite lock there, ' +
            'near enough to the sum to be believed, and leaves about 15 degrees on the screen on the straight after. That straight counts: the steering is taken for stuck ' + (op.first === null ? 'NEVER' : f1(op.first) + ' s into the drive') + ', and what was counted where nothing slid is flagged NO STEERING CHECK (' + say(op) +
            '). With 12 degrees or less in place of ' + AngleMod.TABLE.STRAIGHT_DEG + ' that straight did not count, and the false drift ran on over it with NO flag (1990 points, grade A)');

        // --- a healthy wheel is still not taken for stuck: at its lock on a scale that reads short, both ways; and on a scale that is not known at all
        const short = Object.assign({}, car, { steerRatio: car.steerRatio * 0.7 });
        const hs = [['liftlock', 'to the left'], ['liftlockR', 'to the right']].map((h) => Object.assign(watch({ car: short, scene: h[0] }), { name: h[1] }));
        ok(hs.every((c) => c.recs.length === 1 && c.recs[0].flags.length === 0 && c.stale === 0 && c.wheels > 20 && c.wheels < 28),
            'a healthy steering at its lock whose learned scale reads 30 % short (the engine reads ' + f1(hs[0].wheels) + ' degrees of the 36), sent every slot, in the lift at 55 degrees, to the left and to the right: never taken for stuck, ONE drift with no flag each (' + hs.map((c) => c.name + ': ' + say(c)).join(' | ') +
            '). The stuck rule asks for ' + AngleMod.TABLE.SIDEWAYS_STEER_DEG + ' degrees at the wheels the way of the angle; a rule that asked for more than the wheels read at their lock, or looked the wrong way, would take this wheel for stuck');
        const un = watch({ scene: 'liftlock', saved: Ln });
        ok(un.stale === 0 && un.recs.length === 1 && un.recs[0].flags.join() === FLAGS.STEER && un.eng.view().noSteer === 'unlearned', '  and with a steering whose scale is not known at all (nothing learned of it) the angle shown alone decides, as before: in the same lift it is never called silent or stuck (the drift is flagged NO STEERING CHECK because the steering is not learned: ' + say(un) + ')');

        // --- what the rule costs a healthy wheel that is held still under that amount, and why the silent rule does not ask the steering
        console.log('\n  A HEALTHY WHEEL HELD STILL AT 5 DEGREES OF OPPOSITE LOCK through a slide of 40 degrees on low grip (0.25 g at 40 km/h) with a straight slide of 2 s between two corners, the steering sent on change only, clean, 20/s:');
        const onChange = { each: { steer: { onChange: true } } };
        const crabRef = watch({ scene: 'crabslide', sample: onChange }), crab = watch({ scene: 'crabslide', sample: onChange, events: heldFrom(-5, 4800, 16900) });
        [['the wheel as the car\'s own, at its lock', crabRef], ['held at 5 degrees of opposite lock', crab]].forEach((x) => console.log('    ' + x[0].padEnd(40) + 'counted: ' + say(x[1]).padEnd(52) + ' worst error ' + pad(f1(x[1].worst), 5) + '   silent or stuck: ' + (x[1].first === null ? 'never' : 'from ' + f1(x[1].first) + ' s on')));
        ok(crabRef.recs.length === 1 && crabRef.recs[0].flags.length === 0 && crabRef.first === null && crab.recs.length === 1 && crab.worst <= 3 && (crab.first === null || crab.first > 10.9),
            'a healthy wheel held still at 5 degrees of opposite lock through a slide of 40 degrees, on a steering sent on change: it is ONE drift, and the angle is not pulled to zero in the straight slide (worst error ' + f1(crab.worst) + ' degrees). The silent rule does not ask the steering, only the angle shown. ' +
            'With the steering asked there as well, this wheel was taken for silent in the slide itself and the car for at rest: the angle read up to 33.1 degrees wrong');
        ok(crab.first !== null && crab.first > 10.9 && crab.recs[0].flags.join() === [FLAGS.UNSURE, FLAGS.STEER].join(),
            '  KNOWN LIMIT: in the corner after that slide the stuck rule takes this wheel for stuck (' + (crab.first === null ? 'NEVER' : f1(crab.first) + ' s into the scene') + ': it has not moved by a count, the car went straight and turned, and the wheels are turned less than ' + AngleMod.TABLE.SIDEWAYS_STEER_DEG +
            ' degrees into the slide). The drift then carries NO STEERING CHECK beside the ANGLE UNSURE it had before (' + say(crab) + '). A wheel that is held into the slide by ' + AngleMod.TABLE.SIDEWAYS_STEER_DEG + ' degrees or more, as at its lock, is not (' + say(crabRef) + ')');

        // --- the rule on samples of its own: the angle shown is the same, what differs is where the wheel stands
        const V = 80 / 3.6, at = (y) => y * DEG * V;
        // (as in the part before: the car swings 45 degrees sideways in 3 s, its nose stops turning for 2 s, then it turns at 15 degrees a second; 100 counts are 1 degree at the wheels)
        const swing = (t, steer) => ({ kmh: 80, yaw: t < 2 ? 0 : t < 5 ? -15 : t < 7 ? 0 : 15, ay: t < 7 ? 0 : at(15), steer });
        const goTo = (counts) => (t) => swing(t, t < 2 ? 32768 : t < 2.5 ? Math.round(32768 + (t - 2) * 2 * counts) : 32768 + counts);
        const s5 = wheel(goTo(500), 12), s12 = wheel(goTo(1200), 12), sBack = wheel(goTo(-1200), 12);
        ok(s5.first !== null && s5.first > 7.5 && s5.first < 8.5 && s5.shown > 25 && s12.first === null && s12.shown > 25 && sBack.first !== null && sBack.first > 7.5 && sBack.first < 8.5,
            '  the rule on samples of its own. A car swings 45 degrees sideways, its nose stops turning for 2 s and turns again, the value sent every slot and not moving: with the wheels 12 degrees into the slide it is not stuck (as at the lock); with 5 degrees it is, ' +
            (s5.first === null ? 'NEVER' : f1(s5.first - 7) + ' s') + ' after the car turns again, while ' + f1(s5.shown) + ' degrees are still shown; and with 12 degrees the other way, against the slide, as well');
        // (the same with 2 m/s2 felt sideways while the nose is still: with no steering to ask, a car that slides straight and feels nothing sideways counts as at rest, a known limit)
        const felt = (t) => Object.assign(goTo(500)(t), t >= 5 && t < 7 ? { ay: 2 } : null), none = wheel(felt, 12, { sstate: 'none', kc: null, szero: null }), known = wheel(felt, 12);
        ok(none.first === null && none.shown > 25 && known.first !== null && known.first > 7.5 && known.first < 8.5, '    where the steering\'s scale is not known at all, the angle shown alone decides: the same value, which would be 5 degrees, is not called stuck (' + f1(none.shown) + ' degrees shown at the end); on the learned scale it is');
        const quiet = (t) => swing(t, t < 2 ? 32768 : t < 2.3 ? Math.round(32768 + (t - 2) * 1667) : undefined), q1 = wheel(quiet, 6.9), q2 = wheel(quiet, 12);
        ok(q1.first === null && q1.shown > 25 && q2.first !== null && q2.first > 7.5 && q2.first < 8.5,
            '    a steering that says nothing more from 5 degrees on (sent on change): while the car slides with its nose still it is not called silent, and ' + f1(q1.shown) + ' degrees are still shown at the end of that stretch (the silent rule asks the angle shown alone). Once the car turns again it is taken for stuck, ' +
            (q2.first === null ? 'NEVER' : f1(q2.first - 7) + ' s') + ' after: a value that is not sent has not moved either, and the stuck rule looks at it too');
    });

    /* ================= what the fifth check found ================= */
    await ok.part('what the fifth check found', async () => {
        const L = learned('a', 50, false).saved, car = sim.CARS.a, LIM = AngleMod.TABLE.STRAIGHT_DEG, AMT = AngleMod.TABLE.SIDEWAYS_STEER_DEG;
        const say = (c) => c.recs.map((d) => d.score + ' ' + d.grade + '/' + d.peak + ', ' + d.time + ' s, backed ' + d.back + ' %' + (d.flags.length ? ' [' + d.flags.join(', ') + ']' : ' [no flag]')).join(' + ') || 'none';
        // one scene through the engine, and with it: when the steering first counted as silent or stuck (s into the scene), the largest angle shown on a true straight
        // at more than 85 km/h, whether nothing can start at its end, what was shown and read of the wheels at a moment (at), and the least shown between two (least)
        const watch = (o) => {
            const line = [];
            const c = run(Object.assign({ spacing: 50, saved: L, onTick: (eng, s, truth, ms) => {
                const tr = truth.at(Math.max(0, Math.min(truth.T * 1000 - 1, ms)));
                line.push({ t: ms / 1000, shown: s.ok ? Math.abs(s.beta) / DEG : null, d: s.d === null ? null : s.d / DEG, tru: Math.abs(tr.beta) / DEG, stale: s.sw === 'stale', fast: tr.V * 3.6 > 85 && Math.abs(tr.lat) < 0.01 && Math.abs(tr.drift) < 0.3 });
            } }, o));
            const first = line.find((p) => p.stale), seen = line.filter((p) => p.shown !== null);
            return Object.assign(c, { first: first ? first.t : null, straight: max(seen.filter((p) => p.fast).map((p) => p.shown)), blocked: c.eng.view().blocked, last: seen.length ? seen[seen.length - 1].shown : null,
                at: (sec) => line.find((p) => p.t >= sec) || line[line.length - 1], least: (a, b) => Math.min.apply(null, seen.filter((p) => p.t >= a && p.t <= b).map((p) => p.shown)) });
        };
        const when = (c) => (c.first === null ? 'never' : 'from ' + f1(c.first) + ' s on');
        // the steering's value held from t0 to t1 ms at what it reads at t0, and still sent in every slot (a wheel held still to the count). wander: the hands
        // move it by about that many degrees at the wheels meanwhile (three slow waves of 0.7, 1.3 and 2.1 a second)
        const heldStill = (t0, t1, wander) => (ev, clock) => { let v = null; return ev.map((e) => { if (e.src !== 'steer') return e; const ms = e.t - clock; if (ms < t0) { v = e.v; return e; } if (ms > t1) return e;
            const w = wander ? wander * (Math.sin(2 * Math.PI * 0.7 * ms / 1000 + 1) + Math.sin(2 * Math.PI * 1.3 * ms / 1000 + 2) + Math.sin(2 * Math.PI * 2.1 * ms / 1000 + 3)) / 2 : 0;
            return Object.assign({}, e, { v: v + Math.round(car.steerSign * w * car.steerRatio / car.steerStep) }); }); };
        // no more steering samples from `at` ms on (a source that dies; a steering that is only sent on change and sticks gives the same samples)
        const diesAt = (at) => (ev, clock) => ev.filter((e) => e.src !== 'steer' || e.t - clock < at);
        // the steering's value frozen from `at` ms on at what it reads then, and still sent in every slot
        const frozenFrom = (at) => (ev, clock) => { let v = null; return ev.map((e) => { if (e.src !== 'steer') return e; if (e.t - clock < at) { v = e.v; return e; } return Object.assign({}, e, { v }); }); };

        // --- a healthy wheel in a slow, tight drift, held still to the count with less than the amount of opposite lock: taken for stuck since part 7
        console.log('\n  A HEALTHY WHEEL IN A SLOW, TIGHT DRIFT (0.7 g at 30 km/h, a circle of 10 m radius), HELD STILL TO THE COUNT from 2 s into the drift to its end, sent every slot;');
        console.log('  the car slides straight for a moment between two corners (its nose stops turning): once for 1 s, and twice for 2 s. Clean, 20/s, with steering:');
        const END1 = 16900, END2 = 25500, SLIDE1 = [9.3, 9.9], SLIDE2 = [17.0, 18.6];
        const t1 = { own: watch({ scene: 'tight1' }), held: watch({ scene: 'tight1', events: heldStill(6300, END1) }), wander: watch({ scene: 'tight1', events: heldStill(6300, END1, 0.05) }) };
        const t2 = { own: watch({ scene: 'tight2' }), held: watch({ scene: 'tight2', events: heldStill(6300, END2) }), wander: watch({ scene: 'tight2', events: heldStill(6300, END2, 0.05) }) };
        [['one straight slide of 1 s', t1, null], ['two straight slides of 2 s', t2, SLIDE2]].forEach((x) => { console.log('  ' + x[0] + ':'); [['the wheel as the car\'s own', x[1].own], ['held still to the count', x[1].held], ['held, the hands wandering by 0.05 degrees', x[1].wander]].forEach((y) =>
            console.log('    ' + y[0].padEnd(44) + 'counted: ' + say(y[1]).padEnd(96) + ' worst error ' + pad(f1(y[1].worst), 5) + (x[2] ? '   least shown in the second slide: ' + pad(f1(y[1].least(x[2][0], x[2][1])), 5) : '') + '   silent or stuck: ' + when(y[1]))); });
        const lockNow = Math.abs(t1.held.at(6.8).d), inCorner = t1.own.at(6.8).tru, inSlide = t1.own.at(9.6).tru;   // (what the engine reads of the wheels, and the true angle in the corner and in the slide)
        ok(t1.own.recs.length === 1 && t1.own.recs[0].flags.length === 0 && t1.own.first === null && t2.own.recs.length === 1 && t2.own.first === null && t2.own.least(SLIDE2[0], SLIDE2[1]) > LIM && lockNow > 2.5 && lockNow < AMT && inSlide > LIM,
            'a slow, tight drift needs little opposite lock: in a corner of 0.7 g at 30 km/h the car is ' + f1(inCorner) + ' degrees sideways and its wheels stand at ' + f1(lockNow) + ' degrees of opposite lock, less than the ' + AMT +
            ' the stuck rule asks of a wheel held into a slide (in the straight slide between two such corners it is ' + f1(inSlide) + ' degrees sideways). With the wheel as the car\'s own (it moves when the car slides straight) the steering is never taken for stuck: with one straight slide it is ONE drift with no flag (' +
            say(t1.own) + '), with two it is one drift (' + say(t2.own) + ') and ' + f1(t2.own.least(SLIDE2[0], SLIDE2[1])) + ' degrees or more are shown through the second slide');
        ok(t1.held.first !== null && t1.held.first > 10.9 && t1.held.first < 12 && t1.held.recs.length === 1 && t1.held.recs[0].flags.join() === FLAGS.STEER && !canBeBest(t1.held.recs[0]) && t1.held.least(SLIDE1[0], SLIDE1[1]) > LIM && t1.held.eng.view().noSteer === null,
            '  KNOWN LIMIT, NOT SOLVED (part 8): the same drift with the wheel held still to the count at those ' + f1(lockNow) + ' degrees, through the straight slide and the corner after it. ' + f1(t1.held.least(SLIDE1[0], SLIDE1[1])) + ' degrees are shown in the slide, but the wheels are turned less than ' + AMT +
            ' degrees into it, so the slide counts as a straight for the stuck rule, and in the corner after it this healthy steering is taken for stuck (' + when(t1.held) + ', until the wheel moves). The drift then carries NO STEERING CHECK and is no best: ' + say(t1.held) +
            '. On the files of part 6 the same scene gave one drift with no flag (321 points, backed 88 %) and the steering was never taken for stuck: its limit on the angle shown covered this wheel, and part 7\'s condition uncovered it again (the files of part 5, which asked for neither, gave what the files give now)');
        const cut = t2.held.least(SLIDE2[0], SLIDE2[1]);
        ok(t2.held.first !== null && t2.held.first > 11.9 && t2.held.first < 13 && t2.held.recs.length === 2 && t2.held.recs.every((d) => d.flags.includes(FLAGS.STEER)) && cut < 2 && t2.held.worst > 20 && t2.held.at(17.8).tru > LIM,
            '  KNOWN LIMIT, NOT SOLVED (part 8): with TWO straight slides the drift is cut in two. Once the steering counts as stuck (' + when(t2.held) + ') the rest rule leaves it out, so in the second straight slide the car counts as at rest: the angle shown is pulled down to ' + f1(cut) +
            ' degrees while the car is ' + f1(t2.held.at(17.8).tru) + ' degrees sideways (worst error ' + f1(t2.held.worst) + '), the drift ends there and a second one is counted after it, both flagged NO STEERING CHECK: ' + say(t2.held) +
            '. On the files of part 6 the same scene gave one drift (655 points, ANGLE UNSURE alone) and 24.2 degrees or more were shown through the second slide');
        ok(t1.wander.first === null && t1.wander.recs.length === 1 && t1.wander.recs[0].flags.length === 0 && t2.wander.first === null && t2.wander.recs.length === 1 && t2.wander.recs[0].flags.join() === t2.own.recs[0].flags.join() && t2.wander.least(SLIDE2[0], SLIDE2[1]) > LIM,
            '  what keeps it away: a value that moves. The same held wheel with the hands wandering by about 0.05 degrees at the wheels (this made-up steering counts in steps of ' + car.steerStep * car.steerRatio + ' degrees, so the value moves by a count or more within 2 s): never taken for stuck, one drift with no flag (' +
            say(t1.wander) + '), and with two slides one drift with the flags of the car\'s own wheel (' + say(t2.wander) + '), ' + f1(t2.wander.least(SLIDE2[0], SLIDE2[1])) + ' degrees or more shown through the second slide. Whether a car\'s steering value flickers like that while the wheel is held, and how fine its counts are, is not known');

        // --- a steering that dies with the wheels at their lock in a drift that then fades out slowly: believed to the end of the drive since part 6
        console.log('\n  A STEERING THAT DIES WITH THE WHEELS AT THEIR LOCK, 2.5 s into a drift of 45 degrees at 70 km/h; the drift then FADES OUT over 20 s (or 12 s) into a corner of 0.35 g');
        console.log('  while the car goes on turning; then two laps with full grip, never under 40 km/h, with one real drift of 40 degrees in each. Clean, 20/s:');
        const fd = { ref: watch({ scene: 'fadeout' }), dies: watch({ scene: 'fadeout', events: diesAt(6800) }), sticks: watch({ scene: 'fadeout', events: frozenFrom(6800) }), short: watch({ scene: 'fadeout12', events: diesAt(6800) }) };
        [['fades over 20 s, the steering alive', fd.ref], ['fades over 20 s, the steering dies', fd.dies], ['fades over 20 s, it sticks and is still sent', fd.sticks], ['fades over 12 s, the steering dies', fd.short]].forEach((x) => console.log('    ' + x[0].padEnd(46) + 'counted: ' + say(x[1]).padEnd(124) +
            ' silent or stuck: ' + when(x[1]).padEnd(15) + ' largest angle shown on the straights at 90 km/h: ' + pad(f1(x[1].straight), 5) + '   at the end: ' + pad(f1(x[1].last), 5) + (x[1].blocked ? ', nothing can start' : '')));
        const lapDrifts = (c) => c.recs.filter((d) => !d.flags.includes(FLAGS.SPIN) && Math.abs(d.peak - 40) < 3 && d.time < 12);
        // (the car comes out of the corner that the drift fades into 34.4 s into the long drive and 26.4 s into the short one: what is shown then)
        const out20 = fd.dies.at(34.4).shown, out12 = fd.short.at(26.4).shown;
        ok(fd.ref.recs.length === 3 && fd.ref.recs.every((d) => d.flags.length === 0) && fd.ref.first === null && fd.ref.straight < 1 && lapDrifts(fd.ref).length === 2, 'the drive with the steering alive: the drift that fades out and the two real drifts of the laps, no flag on any (' + say(fd.ref) + '), ' + f1(fd.ref.straight) + ' degrees at most on the straights');
        ok([fd.dies, fd.sticks].every((c) => c.first === null && c.straight > 100 && c.blocked && c.last > 100 && c.recs.length === 1 && c.recs[0].flags.includes(FLAGS.SPIN) && !canBeBest(c.recs[0]) && lapDrifts(c).length === 0 && c.eng.view().noSteer === null) && out20 > LIM,
            '  KNOWN LIMIT, NOT SOLVED (part 8): the steering dies ' + f1(Math.abs(fd.dies.at(6.7).d)) + ' degrees into the slide, at the lock, and the driver then takes the angle off slowly while the car goes on turning. The dead value reads as opposite lock and holds the angle shown up as the true one falls: ' + f1(out20) + ' degrees are still shown as the car comes out of that corner with no angle left. On the straights after it ' + LIM +
            ' degrees or more stand on the screen on the side of that value, so neither rule sees a straight (the silent rule asks for less than ' + LIM + ' shown, the stuck rule for that or for wheels turned less than ' + AMT + ' degrees into it), and the rest rule waits for a steering near its centre. It is believed to the end of the drive (silent or stuck: ' +
            when(fd.dies) + '): ONE drift is counted, the one in which the steering died, run on until the angle shown passes 100 degrees (' + say(fd.dies) + '), neither real drift of the laps is counted, up to ' + f1(fd.dies.straight) + ' degrees are shown on the straights at 90 km/h and ' + f1(fd.dies.last) +
            ' at the end, and nothing can start. A value that sticks there and is still sent does the same (' + say(fd.sticks) + '). On the files of part 5 the dead steering was found 34.4 s into this drive, as the car came out of that corner, and both real drifts were counted');
        ok(fd.short.first !== null && fd.short.first < 30 && out12 < LIM && fd.short.straight < 2 && !fd.short.blocked && lapDrifts(fd.short).length === 2 && lapDrifts(fd.short).every((d) => d.flags.join() === FLAGS.STEER) && fd.short.eng.view().noSteer === 'stale',
            '  where the drift fades out over 12 s it is found: ' + f1(out12) + ' degrees are shown as the car comes out of the corner, less than ' + LIM + '. The dead steering counts as silent ' + when(fd.short) + ', ' + f1(fd.short.straight) + ' degrees at most are shown on the straights, and both real drifts are counted and flagged NO STEERING CHECK (' + say({ recs: lapDrifts(fd.short) }) +
            '). The drift in which it died keeps the wheel\'s last value to its end and carries no flag, as part 5 says (' + say({ recs: fd.short.recs.filter((d) => lapDrifts(fd.short).indexOf(d) < 0) }) + ')');

        // --- the amount held from below: a value frozen at about 8 degrees is still no wheel held into a slide
        const f8 = watch({ scene: 'frozenbank8', events: frozenFrom(8500) }), v8 = Math.abs(f8.at(9).d), real8 = lapDrifts(f8);
        ok(v8 > 7.5 && v8 < AMT - 1 && f8.first !== null && f8.first < 45 && f8.straight < 2 && !f8.blocked && real8.length === 1 && real8[0].flags.join() === FLAGS.STEER && f8.recs.every((d) => !canBeBest(d)) && f8.eng.view().noSteer === 'stale',
            'the amount of ' + AMT + ' degrees is held from below as well. The state of part 7 with a slower first corner (0.45 g at 34 km/h): the value freezes at ' + f1(v8) + ' degrees as the engine reads it and is still sent, the banked corner the other way follows, then a lap. It is taken for stuck ' + f1(f8.first) +
            ' s into the drive, ' + f1(f8.straight) + ' degrees at most are shown on the straights at 90 km/h, and the real drift is counted, flagged NO STEERING CHECK (' + say({ recs: real8 }) + '). With an amount of 6 or of 8 in a scratch copy this value counted as a wheel held into the slide: it was never taken for stuck, 40.5 degrees stood on those straights and the real drift was not counted, as on the files of part 6');
    });

    /* ================= the modules' manners ================= */
    await ok.part('pure', async () => {
        const pure = ['angle.js', 'learn.js', 'drift.js', 'score.js', 'series.js'], src = {};
        pure.forEach((f) => { src[f] = fs.readFileSync(path.join(JS, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''); });
        ok(pure.every((f) => !/Date\.now|new Date|process\.hrtime|performance\.now/.test(src[f])), 'angle, learn, drift, score, series: none reads a clock (time comes in as an argument)');
        ok(pure.every((f) => !/(^|[^.\w])(setTimeout|setInterval|setImmediate)\s*\(/.test(src[f])), 'none starts a timer of its own');
        ok(pure.every((f) => !/Math\.random/.test(src[f])), 'none draws a random number');
        ok(pure.every((f) => (src[f].match(/require\(([^)]*)\)/g) || []).every((r) => /require\('\.\/(angle|learn|score|series)'\)/.test(r))), 'none loads the kit\'s signals, the diagnostics, the file system or the network: only each other');
        ok(pure.every((f) => !/signals\.|\.set\(|tasu|uds|diag/i.test(src[f])), 'none names a signal, a diagnostic or a write');
        ok(pure.every((f) => !/latitude|longitude|nmea|gps|heading|course/i.test(src[f])), 'none handles a position, a course or a heading');
        const all = pure.map((f) => fs.readFileSync(path.join(JS, f), 'utf8')).concat([fs.readFileSync(path.join(__dirname, 'driftsim.js'), 'utf8'), fs.readFileSync(__filename, 'utf8')]);
        ok(all.every((t) => t.indexOf(String.fromCharCode(8212)) < 0), 'and no em dash in any of them, the made-up car or this test');
        ok(/RULES = \{/.test(src['score.js']) && /TABLE = \{/.test(src['angle.js']) && /RULE = \{/.test(src['drift.js']), 'the numbers of the score, of the angle and of the drift rules each stand in one table at the top of their file');
    });

    ok.done();
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
