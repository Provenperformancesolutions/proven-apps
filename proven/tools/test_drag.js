'use strict';
/**
 * test_drag.js <built app: dist/pps_drag> - Proven Drag's timing logic on the built app's own files, with no
 * car and no screen: the timing engine (run.js) measured against a run with known answers (dragsim.js), and
 * the helpers around it (feed.js, gpsscale.js, wheels.js, slope.js, steady.js).
 *
 * The main part MEASURES: 240 made-up cars, each launched once with the car's send slots falling at a random
 * moment, at 20, 50, 100 and 200 ms between samples. It prints, per split and spacing, how far the engine's
 * time is from the true one (mean, mean absolute, 5th to 95th percentile, worst) and how often the +- figure
 * the driver is shown covers the error, and then checks the bounds. The brief's bounds are checked as they
 * are; where the engine does better, a tighter bound is checked as well, so that a later change that makes
 * it worse is noticed.
 *
 * The parts whose names begin with "review" hold one check or more for every finding of the first review
 * that concerned the logic: each failed on the code as it was reviewed, and its sentence says what was wrong
 * ("WAS: ..."). The part whose name begins with "final check" does the same for what the check after that
 * found (a sample stamped late ending a clean run as a "jump"), and for its neighbours. The two parts whose
 * names begin with "second check" do it for what the check after the final one found: a reading that is too
 * high right after a late stamp, and the polled series with the app held up at the launch. The part whose name
 * begins with "third check" does it for what the check of THOSE fixes found: clean launches of quick cars that
 * were thrown away. That part and one check of the part before it also hold checks that say NOT SOLVED: they
 * pass while the engine does what the README says it does in a case that is known and left open, and they pin
 * the figure the README quotes, so that the text is looked at again if the figure moves.
 *
 * What this cannot show: how a real car sends its speed. Every sampler here is an assumption (dragsim.js).
 *
 * PPS_TEST_ALL=1 in the environment: a failed check does not stop the run; they are listed at the end.
 */
const fs = require('fs'), path = require('path');
const sim = require('./dragsim');
const { checker } = require('./fakecar');

if (!process.argv[2]) { console.error('usage: node proven/tools/test_drag.js dist/pps_drag'); process.exit(2); }
const JS = path.join(path.resolve(process.argv[2]), 'source', 'javascript');
const Run = require(path.join(JS, 'run'));
const Feed = require(path.join(JS, 'feed'));
const Gps = require(path.join(JS, 'gpsscale'));
const Wheels = require(path.join(JS, 'wheels'));
const Slope = require(path.join(JS, 'slope'));
const { SpeedWindow } = require(path.join(JS, 'steady'));
const { RunEngine } = Run;

const ok = checker();
const SPACINGS = [20, 50, 100, 200];
const SPLITS = ['0-100', '60ft', '330ft', 'eighth', '1000ft', 'quarter'];
const RUNS = 240;
const C0 = 100000;                         // the app clock's reading when a simulated car starts to accelerate
// Figures of cases that are known and NOT SOLVED, as proven/README.md and proven/CHANGES-drag.md quote them (launches with a
// 0-100 beyond its +-). A check pins each: if one moves, the check fails and those texts must be looked at again.
const KNOWN_GETTER_6 = 50, KNOWN_HIGH_OPEN = [40, 20, 45, 36];
// What the code that the third check saw did in the third-check part below (this file on a build of ce83a76).
const WAS_GETTER_JUMPS = 8, WAS_NOTIFIER_LOST = 14, WAS_NOTIFIER_NONE = 10;

/* ---------- measuring ---------- */

function stats(list) {
    const a = list.slice().sort((x, y) => x - y), n = a.length;
    const q = (p) => a[Math.min(n - 1, Math.max(0, Math.round(p * (n - 1))))];
    return {
        n, mean: a.reduce((s, x) => s + x, 0) / n, mabs: a.reduce((s, x) => s + Math.abs(x), 0) / n,
        p5: q(0.05), p95: q(0.95), worst: a.reduce((m, x) => (Math.abs(x) > Math.abs(m) ? x : m), 0),
    };
}
const ms1 = (s) => (s >= 0 ? '+' : '-') + Math.abs(s * 1000).toFixed(1);
const pad = (s, n) => String(s).padStart(n);

/** One simulated launch through one engine: the engine's summary. */
function timeRun(car, sampleOpts, engineOpts, driveOpts) {
    const samples = sim.sample(car, Object.assign({ clock0: C0 }, sampleOpts));
    const eng = new RunEngine(engineOpts);
    return { sum: sim.drive(eng, samples, driveOpts), eng, samples };
}

let FLEET = null;
/** 240 cars drawn at random (always the same 240). shape: how their acceleration builds up at the launch. */
function fleet(shape) {
    if (!shape && FLEET) return FLEET;
    const rand = sim.rng(20261123), cars = [];
    for (let i = 0; i < RUNS; i++) cars.push(sim.randomCar(rand, shape ? { shape } : null));
    if (!shape) FLEET = cars;
    return cars;
}

/**
 * Every car of the fleet once per spacing, the send slots at a random phase:
 *   -> { spacing: { split: { err: stats (s), cover: share of runs whose +- covers the error, trap: stats (km/h) } } }
 */
function measure(cars, o) {
    const out = {}, start = o.start || 'slip', unit = o.unit || 'kmh';
    for (const spacing of o.spacings || SPACINGS) {
        const rand = sim.rng(977 + spacing), errs = {}, cover = {}, traps = {};
        let missing = 0;
        for (const car of cars) {
            const so = Object.assign({ spacing, phase: rand() * spacing, rand }, o.sample);
            const r = timeRun(car, so, Object.assign({ start, unit }, o.engine), { idlePhase: Math.floor(rand() * 50) });
            const truth = car.answers(start, unit);
            for (const k of Object.keys(truth)) {
                const res = r.sum && r.sum.results[k];
                if (!res) { missing++; continue; }
                const e = res.s - truth[k].s;
                (errs[k] = errs[k] || []).push(e);
                (cover[k] = cover[k] || []).push(Math.abs(e) <= res.pm + 1e-9 ? 1 : 0);
                if (truth[k].trap !== undefined) (traps[k] = traps[k] || []).push(res.trap - truth[k].trap);
            }
        }
        out[spacing] = { missing };
        for (const k of Object.keys(errs)) {
            out[spacing][k] = { err: stats(errs[k]), cover: cover[k].reduce((a, b) => a + b, 0) / cover[k].length, trap: traps[k] ? stats(traps[k]) : null };
        }
    }
    return out;
}

/** Print a table of measure(): error of the engine's time against the true one, in ms. */
function show(title, m) {
    console.log('\n  ' + title);
    console.log('  spacing  split      runs     mean  mean abs      5 %     95 %    worst   +- covers   trap worst');
    for (const spacing of Object.keys(m)) {
        for (const k of Object.keys(m[spacing])) {
            if (k === 'missing') continue;
            const s = m[spacing][k].err, t = m[spacing][k].trap;
            console.log('  ' + pad(spacing, 4) + ' ms  ' + k.padEnd(8) + pad(s.n, 6) + pad(ms1(s.mean), 9) + pad((s.mabs * 1000).toFixed(1), 10) +
                pad(ms1(s.p5), 9) + pad(ms1(s.p95), 9) + pad(ms1(s.worst), 9) + pad((m[spacing][k].cover * 100).toFixed(0) + ' %', 12) +
                (t ? pad(Math.abs(t.worst).toFixed(2) + ' km/h', 13) : ''));
        }
        if (m[spacing].missing) console.log('  ' + pad(spacing, 4) + ' ms  ' + m[spacing].missing + ' results missing');
    }
    console.log('  (ms; + = the engine\'s time is longer than the true one)');
}
/** The largest |worst|, mean abs and |mean| over the splits of one spacing (seconds), and the smallest cover. */
function over(m, spacing, splits) {
    const o = { worst: 0, mabs: 0, mean: 0, cover: 1, trap: 0, n: Infinity };
    for (const k of splits || Object.keys(m[spacing])) {
        const x = m[spacing][k];
        if (k === 'missing' || !x) continue;
        o.worst = Math.max(o.worst, Math.abs(x.err.worst)); o.mabs = Math.max(o.mabs, x.err.mabs); o.mean = Math.max(o.mean, Math.abs(x.err.mean));
        o.cover = Math.min(o.cover, x.cover); o.n = Math.min(o.n, x.err.n);
        if (x.trap) o.trap = Math.max(o.trap, Math.abs(x.trap.worst));
    }
    return o;
}
const s3 = (x) => x.toFixed(3) + ' s';

/* ---------- a clock the scheduler tests move by hand (not the app's: nothing here touches Date or the timers) ---------- */
function fakeClock() {
    let now = 0, seq = 0;
    const timers = [];
    const flush = () => new Promise((r) => setImmediate(r));
    const c = {
        late: 0,                             // every timer fires this many ms after it was due (a busy head unit)
        now: () => now,
        setTimeout: (fn, ms) => { const t = { at: now + Math.max(0, ms || 0) + c.late, fn, id: ++seq }; timers.push(t); return t; },
        clearTimeout: (t) => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); },
        async advance(ms) {
            const end = now + ms;
            for (;;) {
                await flush();
                let best = null;
                for (const t of timers) if (t.at <= end && (!best || t.at < best.at || (t.at === best.at && t.id < best.id))) best = t;
                if (!best) break;
                if (best.at > now) now = best.at;
                c.clearTimeout(best);
                best.fn();
            }
            now = end;
            await flush();
        },
    };
    return c;
}

/** Hand two series to a TwoSeries as the app does (samples in time order, idle every 50 ms). */
function driveTwo(two, notified, polled, until) {
    const all = notified.map((s) => ({ t: s.t, v: s.v, k: 'notified' })).concat(polled.map((s) => ({ t: s.t, v: s.v, k: 'polled' }))).sort((a, b) => a.t - b.t);
    const end = until !== undefined ? until : all[all.length - 1].t + 3000;
    let tick = Math.floor(all[0].t / 50) * 50 + 7, i = 0;
    while (i < all.length || tick <= end) {
        const st = i < all.length ? all[i].t : Infinity;
        if (st <= tick) { two[all[i].k](st, all[i].v); i++; } else if (tick <= end) { two.idle(tick); tick += 50; } else break;
    }
}

const a2n = (x) => Number(x);
const nmea = (body) => { let x = 0; for (let i = 0; i < body.length; i++) x ^= body.charCodeAt(i); return '$' + body + '*' + x.toString(16).toUpperCase().padStart(2, '0'); };

(async () => {
    /* ================= the truth model itself ================= */
    await ok.part('the run with known answers (dragsim.js)', async () => {
        // a car that pulls 5 m/s2 from the first instant and for ever: the answers are school physics
        const car = new sim.Truth({ a0: 5, vTop: 1e12, ramp: 0, shifts: [] });
        const a = car.answers('standstill', 'kmh'), tm = 0.5 / 3.6 / 5, xm = 5 * tm * tm / 2;
        const at = (x) => Math.sqrt(2 * (x + xm) / 5) - tm;
        ok(Math.abs(car.tMove - tm) < 2e-5, 'a car pulling a steady 5 m/s2 passes 0.5 km/h after ' + (tm * 1000).toFixed(2) + ' ms: the model says ' + (car.tMove * 1000).toFixed(2));
        ok(Math.abs(a['0-100'].s - (100 / 3.6 / 5 - tm)) < 2e-5, 'its 0-100 km/h from first movement is ' + (100 / 3.6 / 5 - tm).toFixed(4) + ' s: the model says ' + a['0-100'].s.toFixed(4));
        ok(Math.abs(a.quarter.s - at(402.336)) < 2e-5 && Math.abs(a['60ft'].s - at(18.288)) < 2e-5, 'its 60 ft and 1/4 mile from first movement match the formula (' + at(18.288).toFixed(4) + ' s, ' + at(402.336).toFixed(4) + ' s)');
        const r = car.answers('rollout', 'kmh'), tr = at(0.3048);
        ok(Math.abs(r.quarter.s - (at(402.336 + 0.3048) - tr)) < 2e-5, 'with a one-foot rollout the 1/4 mile is the time from 1 ft to 1/4 mile + 1 ft: ' + r.quarter.s.toFixed(4) + ' s');
        const trap = 20.1168 / (at(402.336) - at(402.336 - 20.1168)) * 3.6;
        ok(Math.abs(a.quarter.trap - trap) < 0.001 && a.quarter.trap < a.quarter.at, 'the 1/4 mile trap speed is the average over the last 66 ft (' + trap.toFixed(2) + ' km/h), below the speed at the line (' + a.quarter.at.toFixed(2) + ')');
        const s = car.answers('slip', 'kmh');
        ok(s['0-100'].s === a['0-100'].s && s.quarter.s === r.quarter.s, 'the "slip" convention is 0-100 from first movement and the distances after the first foot');
        const smp = sim.sample(car, { spacing: 100, phase: 30, onChange: true, clock0: C0 });
        ok(smp.filter((p) => p.t < C0).length === 1, 'an on-change sampler sends one standing sample and then nothing until the car moves');
        ok(sim.sample(car, { spacing: 100, phase: 30, clock0: C0 }).filter((p) => p.t < C0).length === 31, 'an every-slot sampler sends every slot of the 3 s of standing');
    });

    /* ================= accuracy ================= */
    let mOn, mSlot, mLine;
    await ok.part('accuracy: ' + RUNS + ' cars, launched at a random moment between two send slots, 20 / 50 / 100 / 200 ms between samples', async () => {
        const cars = fleet();
        const ramps = cars.map((c) => c.p.ramp), t100 = cars.map((c) => c.answers('slip', 'kmh')['0-100'].s);
        console.log('  the cars: 0-100 km/h in ' + Math.min.apply(null, t100).toFixed(1) + ' to ' + Math.max.apply(null, t100).toFixed(1) + ' s, acceleration building up over ' +
            Math.round(Math.min.apply(null, ramps) * 1000) + ' to ' + Math.round(Math.max.apply(null, ramps) * 1000) + ' ms, 2 to 4 gear changes each (' +
            cars.filter((c) => c.p.shifts.some((s) => Math.abs(s.v * 3.6 - 100) < 3)).length + ' of them change gear within 3 km/h of 100)');
        mOn = measure(cars, { sample: { onChange: true }, engine: { onChange: true } });
        show('A. a series that only sends on change, in steps of 1/64 km/h (the notifier). Start: slip', mOn);
        mSlot = measure(cars, { sample: { onChange: false }, engine: { onChange: false } });
        show('B. a series that sends every slot (the polled getter). Start: slip', mSlot);
        for (const [name, m] of [['on-change series', mOn], ['every-slot series', mSlot]]) {
            ok(SPACINGS.every((s) => m[s].missing === 0 && over(m, s).n === RUNS), name + ': every one of the ' + RUNS + ' cars got every split at every spacing');
            // the brief's bounds
            let o = over(m, 20);
            ok(o.worst <= 0.010, name + ', 20 ms: every split within 0.010 s (the brief). Worst ' + s3(o.worst));
            ok(o.worst <= 0.004, name + ', 20 ms: and within 0.004 s (tightened: what the engine does, with a margin)');
            o = over(m, 50);
            ok(o.worst <= 0.020, name + ', 50 ms: every split within 0.020 s (the brief). Worst ' + s3(o.worst));
            ok(o.worst <= 0.012, name + ', 50 ms: and within 0.012 s (tightened)');
            ok(over(m, 50, SPLITS.slice(1)).worst <= 0.002, name + ', 50 ms: every distance split within 0.002 s (tightened). Worst ' + s3(over(m, 50, SPLITS.slice(1)).worst));
            ok(m[50]['0-100'].err.mabs <= 0.002 && Math.abs(m[50]['0-100'].err.p5) <= 0.004 && m[50]['0-100'].err.p95 <= 0.004,
                name + ', 50 ms: 0-100 km/h within 0.004 s in 90 % of runs, 0.002 s on average (tightened); its worst, ' + s3(Math.abs(m[50]['0-100'].err.worst)) + ', is a car changing gear at 100 km/h');
            o = over(m, 100);
            ok(o.mabs < 0.020 && o.worst <= 0.050, name + ', 100 ms: mean absolute error under 0.020 s and none over 0.050 s (the brief). Mean absolute ' + s3(o.mabs) + ', worst ' + s3(o.worst));
            ok(o.mabs < 0.004 && o.worst <= 0.035, name + ', 100 ms: mean absolute error under 0.004 s and none over 0.035 s (tightened)');
            ok(over(m, 100, SPLITS.slice(1)).worst <= 0.004, name + ', 100 ms: every distance split within 0.004 s (tightened). Worst ' + s3(over(m, 100, SPLITS.slice(1)).worst));
            o = over(m, 200);
            ok(o.mean < 0.040 && o.mabs < 0.040, name + ', 200 ms: mean error under 0.040 s (the brief). Mean ' + s3(o.mean) + ', mean absolute ' + s3(o.mabs));
            ok(o.mean < 0.005 && o.mabs < 0.015 && over(m, 200, SPLITS.slice(1)).worst <= 0.015, name + ', 200 ms: mean under 0.005 s, mean absolute under 0.015 s, every distance split within 0.015 s (tightened). Worst distance split ' +
                s3(over(m, 200, SPLITS.slice(1)).worst));
            ok(Math.abs(m[200]['0-100'].err.p5) <= 0.035 && m[200]['0-100'].err.p95 <= 0.035 && o.worst <= 0.160, name + ', 200 ms: 0-100 km/h within 0.035 s in 90 % of runs, none over 0.160 s (tightened). Its worst, ' + s3(o.worst) +
                ', is a car changing gear at 100 km/h between two samples');
            ok(SPACINGS.every((s) => over(m, s).cover >= 0.95), name + ': the +- figure covers the real error in at least 95 % of runs at every spacing (least: ' +
                Math.round(Math.min.apply(null, SPACINGS.map((s) => over(m, s).cover)) * 100) + ' %)');
            ok(SPACINGS.every((s) => over(m, s).trap <= (s === 200 ? 0.6 : 0.1)), name + ': the 1/8 and 1/4 mile trap speeds are within 0.1 km/h of the true 66 ft average up to 100 ms spacing, 0.6 km/h at 200 ms (worst ' +
                SPACINGS.map((s) => over(m, s).trap.toFixed(2)).join(' / ') + ' km/h)');
        }
        // what the brief's own method would have done
        mLine = measure(cars, { sample: { onChange: true }, engine: { onChange: true, fit: 'line' } });
        show('C. as A, but the launch placed by a straight line through the first moving samples (the brief\'s method; fit: "line")', mLine);
        const l50 = mLine[50]['0-100'].err, f50 = mOn[50]['0-100'].err, l100 = mLine[100]['0-100'].err, f100 = mOn[100]['0-100'].err;
        ok(l50.mean < -0.004 && l100.mean < -0.006, 'the straight line places the launch late whenever the acceleration builds up: 0-100 km/h reads short by ' +
            (-l50.mean * 1000).toFixed(1) + ' ms on average at 50 ms spacing and ' + (-l100.mean * 1000).toFixed(1) + ' ms at 100 ms');
        ok(Math.abs(l50.worst) > 0.017, 'and at 50 ms its worst run uses up the brief\'s 0.020 s: ' + (Math.abs(l50.worst) * 1000).toFixed(1) + ' ms with these 240 cars (another 240 gave 21.9 ms). That is why the launch model replaced it');
        ok(f50.mabs < l50.mabs / 4 && f100.mabs < l100.mabs / 4, 'the launch model is at least four times closer on average: mean absolute 0-100 error ' + (f50.mabs * 1000).toFixed(1) + ' against ' +
            (l50.mabs * 1000).toFixed(1) + ' ms at 50 ms, ' + (f100.mabs * 1000).toFixed(1) + ' against ' + (l100.mabs * 1000).toFixed(1) + ' ms at 100 ms');
    });

    await ok.part('every start convention, and mph', async () => {
        const cars = fleet();
        for (const start of ['standstill', 'rollout']) {
            const m = measure(cars, { start, sample: { onChange: true }, engine: { onChange: true } });
            show('D. on-change series. Start: ' + start, m);
            ok(SPACINGS.every((s) => m[s].missing === 0), start + ': every car got every split at every spacing');
            ok(over(m, 20).worst <= 0.010 && over(m, 50).worst <= 0.020 && over(m, 100).mabs < 0.020 && over(m, 100).worst <= 0.050 && over(m, 200).mean < 0.040,
                start + ': the brief\'s bounds hold (worst ' + s3(over(m, 20).worst) + ' at 20 ms, ' + s3(over(m, 50).worst) + ' at 50 ms, ' + s3(over(m, 100).worst) + ' at 100 ms; mean ' + s3(over(m, 200).mean) + ' at 200 ms)');
            ok(SPACINGS.every((s) => over(m, s).cover >= 0.95), start + ': the +- figure covers the real error in at least 95 % of runs at every spacing');
        }
        const m = measure(cars, { unit: 'mph', sample: { onChange: true }, engine: { onChange: true }, spacings: [50] });
        ok(m[50]['0-60'] && !m[50]['0-100'] && Math.abs(m[50]['0-60'].err.worst) <= 0.020, 'unit mph: the speed split is 0-60 mph (96.56 km/h), within 0.020 s at 50 ms spacing (worst ' + s3(Math.abs(m[50]['0-60'].err.worst)) + ')');
        // the three conventions on one launch
        const car = cars[3], smp = { spacing: 20, phase: 7, onChange: true };
        const slip = timeRun(car, smp, { start: 'slip' }).sum, still = timeRun(car, smp, { start: 'standstill' }).sum, roll = timeRun(car, smp, { start: 'rollout' }).sum;
        ok(slip.results['0-100'].s === still.results['0-100'].s && Math.abs(slip.results.quarter.s - roll.results.quarter.s) < 1e-9,
            'slip = the 0-100 of "standstill" (' + still.results['0-100'].s.toFixed(3) + ' s) with the distances of "rollout" (1/4 mile ' + roll.results.quarter.s.toFixed(3) + ' s)');
        const foot = (slip.tRoll - slip.t0) / 1000;
        ok(Math.abs(still.results['0-100'].s - roll.results['0-100'].s - foot) < 1e-9 && foot > 0.1 && foot < 0.6,
            'rollout takes the time to cover the first foot (' + foot.toFixed(3) + ' s here) off the 0-100');
        ok(still.results.quarter.s > roll.results.quarter.s + 0.1, 'from first movement the 1/4 mile is longer than with the rollout (' + still.results.quarter.s.toFixed(3) + ' against ' + roll.results.quarter.s.toFixed(3) + ' s)');
        ok(Math.abs(still.results.quarter.s - car.answers('standstill', 'kmh').quarter.s) < 0.004 && Math.abs(roll.results['60ft'].s - car.answers('rollout', 'kmh')['60ft'].s) < 0.004,
            'each against its own true answer: within 0.004 s');
    });

    await ok.part('a delay that is constant, samples that arrive unevenly, a speed signal that lags, launches of another shape', async () => {
        const cars = fleet().slice(0, 120);
        // constant delay: the same run, every sample 80 ms later; the app's 50 ms timer does not move with it
        let worst = 0;
        for (const spacing of SPACINGS) {
            const rand = sim.rng(31 + spacing);
            for (const car of cars) {
                for (const onChange of [true, false]) {
                    const o = { spacing, phase: rand() * spacing, onChange }, d = { idlePhase: Math.floor(rand() * 50) };
                    const a = timeRun(car, o, { onChange }, d).sum.results, b = timeRun(car, Object.assign({ delay: 80 }, o), { onChange }, d).sum.results;
                    for (const k of Object.keys(a)) worst = Math.max(worst, Math.abs(a[k].s - b[k].s));
                }
            }
        }
        ok(worst <= 0.003, 'every sample 80 ms late: no split of ' + cars.length + ' cars at any spacing moves by more than 0.003 s (the brief). Most: ' + (worst * 1000).toFixed(2) + ' ms');
        ok(worst <= 0.0005, 'and by no more than 0.0005 s (tightened)');
        // when the app's 50 ms timer happens to fire makes no difference to a finished run either
        let byTimer = 0;
        for (const spacing of SPACINGS) {
            for (const car of cars.slice(0, 40)) {
                const o = { spacing, phase: 0.43 * spacing, onChange: true };
                const a = timeRun(car, o, { onChange: true }, { idlePhase: 0 }).sum.results, b = timeRun(car, o, { onChange: true }, { idlePhase: 37 }).sum.results;
                for (const k of Object.keys(a)) byTimer = Math.max(byTimer, Math.abs(a[k].s - b[k].s));
            }
        }
        ok(byTimer < 1e-9, 'an on-change series, the app\'s 50 ms timer firing 37 ms later: not one split of 40 cars moves (the launch does not hang on when idle() was called)');

        const jit = measure(cars, { sample: { onChange: true, jitter: 5 }, engine: { onChange: true }, spacings: [20, 50, 100] });
        show('E. on-change series, every sample late by 0 to 5 ms at random (a busy head unit)', jit);
        ok(over(jit, 20).worst <= 0.012 && over(jit, 50).worst <= 0.020 && over(jit, 100).worst <= 0.040,
            'samples late by 0 to 5 ms at random: every split within 0.012 s at 20 ms, 0.020 s at 50 ms, 0.040 s at 100 ms (worst ' +
            [20, 50, 100].map((s) => s3(over(jit, s).worst)).join(', ') + '). That unevenness goes straight into a time: it does not cancel');
        ok([20, 50, 100].every((s) => over(jit, s).cover >= 0.95), 'and the +- figure still covers the error in at least 95 % of runs');

        const lag = measure(cars, { sample: { onChange: true, lag: 50 }, engine: { onChange: true }, spacings: [20, 100] });
        show('F. on-change series, the speed signal a first-order low-pass of the true speed, time constant 50 ms', lag);
        const l0 = lag[20]['0-100'].err;
        ok(l0.mean > 0.010 && l0.mean < 0.050 && Math.abs(lag[20].quarter.err.mean) < 0.010,
            'a speed signal that lags by 50 ms: 0-100 from first movement reads LONG by ' + (l0.mean * 1000).toFixed(0) + ' ms on average (the lagged signal still leaves 0.5 km/h almost on time, ' +
            'but reaches 100 km/h 50 ms late); the 1/4 mile after the rollout moves by ' + (Math.abs(lag[20].quarter.err.mean) * 1000).toFixed(1) + ' ms. Not corrected, and not in the +- figure');

        // a speed signal that reads 0 until the car is rolling
        console.log('\n  G. the speed signal reads 0 below 2 km/h (a signal that cuts in late), every-slot series: 0-100 km/h from first movement');
        const cut = {};
        for (const spacing of [20, 50, 100]) {
            const rand = sim.rng(55 + spacing), errs = [], early = [];
            let covered = 0;
            for (const car of cars) {
                const r = timeRun(car, { spacing, phase: rand() * spacing, onChange: false, floor: 2 }, { onChange: false }).sum;
                const e = r.results['0-100'].s - car.answers('slip', 'kmh')['0-100'].s;
                errs.push(e); early.push(r.launch.early);
                if (Math.abs(e) <= r.results['0-100'].pm + 1e-9) covered++;
            }
            cut[spacing] = { err: stats(errs), cover: covered / cars.length, spoke: early.filter((x) => x > 0).length / cars.length };
            console.log('  ' + pad(spacing, 4) + ' ms: mean ' + ms1(cut[spacing].err.mean) + ' ms, worst ' + ms1(cut[spacing].err.worst) + ' ms; the engine noticed in ' + Math.round(cut[spacing].spoke * 100) +
                ' % of runs; the +- covers the error in ' + Math.round(cut[spacing].cover * 100) + ' %');
        }
        ok(cut[20].err.mean < -0.05 && cut[50].err.mean < -0.04, 'a speed signal that reads 0 below 2 km/h: every time from first movement reads SHORT, by ' + (-cut[20].err.mean * 1000).toFixed(0) + ' ms on average at 20 ms spacing and ' +
            (-cut[50].err.mean * 1000).toFixed(0) + ' ms at 50 ms (the time the car took to reach 2 km/h). Not corrected: the launch is never put before the last standing sample');
        ok(cut[20].spoke > 0.95 && cut[50].spoke > 0.95 && cut[20].cover >= 0.65 && cut[50].cover >= 0.65, 'the engine notices (the first moving samples point back to before the standstill) and widens the +-, which then covers the error in ' +
            Math.round(cut[20].cover * 100) + ' % of runs at 20 ms and ' + Math.round(cut[50].cover * 100) + ' % at 50 ms: at least 65 %, NOT the 95 % it reaches on a signal that starts at 0');

        for (const shape of ['smooth', 'exp', 'spike']) {
            const other = fleet(shape).slice(0, 120);
            const m = measure(other, { sample: { onChange: true }, engine: { onChange: true }, spacings: [50, 100] });
            const l = measure(other, { sample: { onChange: true }, engine: { onChange: true, fit: 'line' }, spacings: [50, 100] });
            const a = m[50]['0-100'].err, b = m[100]['0-100'].err;
            console.log('  launch shape "' + shape + '", 0-100 km/h: mean abs ' + (a.mabs * 1000).toFixed(1) + ' ms, worst ' + ms1(a.worst) + ' at 50 ms; mean abs ' + (b.mabs * 1000).toFixed(1) + ', worst ' + ms1(b.worst) +
                ' at 100 ms   (straight line: mean abs ' + (l[50]['0-100'].err.mabs * 1000).toFixed(1) + ' and ' + (l[100]['0-100'].err.mabs * 1000).toFixed(1) + ' ms)');
            ok(over(m, 50).worst <= 0.020 && over(m, 100).mabs < 0.020 && over(m, 100).worst <= 0.050,
                'a launch whose acceleration builds up another way than the model assumes ("' + shape + '"): the brief\'s bounds for 50 and 100 ms still hold (worst ' + s3(over(m, 50).worst) + ' and ' + s3(over(m, 100).worst) + ')');
            ok(a.mabs <= l[50]['0-100'].err.mabs && b.mabs <= l[100]['0-100'].err.mabs, 'and the launch model is no worse than the straight line there');
        }
    });

    /* ================= the engine's rules ================= */
    await ok.part('states, arming, results that stay', async () => {
        const car = fleet()[10];
        const eng = new RunEngine({ series: 'notified' });
        ok(eng.state === 'wait' && eng.elapsed(5) === 0 && Object.keys(eng.results()).length === 0, 'a new engine waits, with no time and no results');
        eng.feed(1000, 40); eng.feed(1100, 30); eng.idle(1150);
        ok(eng.state === 'wait', 'moving: it waits (stop to arm)');
        eng.feed(2000, 0);
        eng.idle(2900);
        ok(eng.state === 'wait', 'stopped for 0.9 s: not armed yet');
        eng.idle(3000);
        ok(eng.state === 'ready', 'stopped for 1 s, counted by the clock (a standing car sends nothing): ready');
        let launched = 0, done = null;
        eng.onLaunch = () => { launched++; }; eng.onDone = (s) => { done = s; };
        const smp = sim.sample(car, { spacing: 50, phase: 20, onChange: true, clock0: C0, stand: 0 }).filter((p) => p.t >= C0);
        for (let t = 3050; t < smp[0].t; t += 50) eng.idle(t);
        let sawRun = false;
        for (const p of smp) { eng.feed(p.t, p.v); if (eng.state === 'run') sawRun = true; }
        ok(launched === 1 && sawRun && done && done.ended === 'quarter', 'the launch starts the clock; the run ends when the 1/4 mile is done');
        ok(eng.state === 'wait' && Math.abs(eng.elapsed(9e9) - done.length) < 1e-9 && eng.results().quarter.s === done.results.quarter.s, 'after the run it waits again, and the run\'s time and results stay on screen');
        ok(done.series === 'notified' && done.start === 'slip' && done.unit === 'kmh' && done.samples > 100 && done.medianGap === 50 && done.vmax > 100 && done.peakG > 0.3 && done.peakG < 1.1,
            'the summary names its series, start convention and unit, counts ' + done.samples + ' samples at a median spacing of ' + done.medianGap + ' ms, top speed ' + done.vmax.toFixed(0) + ' km/h, peak ' + done.peakG.toFixed(2) + ' g');
        ok(done.t0 < done.tFirst && done.tRoll > done.t0 && done.tEnd > done.tRoll && done.stoodSince === 2000, 'and the moments the app cuts its wheel, slope and height records by (standing since, launch, first sample, first foot, end)');
        const tr = eng.trace();
        ok(tr.length > 50 && tr[0][0] >= 0 && tr[tr.length - 1][1] > 100, 'the speed trace for the screen runs from the launch to the end');
        // a second run on the same engine, of another car
        const car2 = fleet()[11];
        const smp2 = sim.sample(car2, { spacing: 50, phase: 20, onChange: true, clock0: 300000, stand: 0 }).filter((p) => p.t >= 300000);
        const before = eng.last.t;
        eng.feed(before + 3000, 0);
        ok(eng.results().quarter.s === done.results.quarter.s, 'the car stops: the last run stays on screen while the timer arms again');
        for (let t = before + 3050; t < smp2[0].t; t += 50) eng.idle(t);
        for (const p of smp2) eng.feed(p.t, p.v);
        ok(launched === 2 && eng.runs === 2 && Math.abs(done.results['0-100'].s - car2.answers('slip', 'kmh')['0-100'].s) < 0.012 && done.stoodSince === before + 3000, 'the next launch clears it and is timed afresh');
        // values that are no speed
        const snap = JSON.stringify([eng.state, eng.last, eng.results()]);
        eng.feed(eng.last.t + 100, null); eng.feed(eng.last.t + 100, NaN); eng.feed(eng.last.t + 100, -3); eng.feed(NaN, 50); eng.feed(undefined, undefined); eng.feed(eng.last.t - 5000, 50); eng.idle(NaN);
        ok(JSON.stringify([eng.state, eng.last, eng.results()]) === snap, '"no value", nonsense, a negative speed and a sample stamped earlier than the last one are ignored');
        eng.configure({ start: 'rollout', unit: 'mph' });
        ok(eng.state === 'wait' && eng.summary() === null && eng.start === 'rollout' && eng.unit === 'mph', 'another start convention or unit: the run in hand is thrown away');
        eng.reset();
        ok(eng.state === 'wait' && eng.elapsed(9e9) === 0 && eng.summary() === null, 'Reset run: time and results are gone');
    });

    await ok.part('the launch instant', async () => {
        const car = new sim.Truth({ a0: 7, vTop: 70, ramp: 0.2, shifts: [] });
        const truth0 = C0 + car.tMove * 1000;
        let r = timeRun(car, { spacing: 100, phase: 60, onChange: true }, { onChange: true }).sum;
        ok(r.launch.how === 'model3' && Math.abs(r.t0 - truth0) < 3, '100 ms spacing: placed by the launch model through three moving samples, ' + (r.t0 - truth0).toFixed(1) + ' ms from the true instant');
        ok(r.launch.line > 5, 'the summary says where the brief\'s straight line would have put it: ' + r.launch.line + ' ms later');
        ok(r.t0 <= r.tFirst && r.launchGap >= r.tFirst - r.t0, 'never later than the first moving sample, never earlier than the last known standstill (launch gap ' + Math.round(r.launchGap) + ' ms)');
        r = timeRun(car, { spacing: 200, phase: 60, onChange: true }, { onChange: true }).sum;
        ok(r.launch.how === 'model2' && r.launch.n === 2, '200 ms spacing: only two moving samples exist when the first is 300 ms old, so two are used');
        r = timeRun(car, { spacing: 100, phase: 60, onChange: true }, { onChange: true, fit: 'line' }).sum;
        ok(r.launch.how === 'line3' && r.launch.line === 0, 'fit "line": the brief\'s straight line through three moving samples');
        // before the fit exists: the kit's interpolation, replaced once the samples are in
        const smp = sim.sample(car, { spacing: 100, phase: 60, onChange: true, clock0: C0 });
        const eng = new RunEngine({});
        let i = 0;
        for (let t = smp[0].t; eng.state !== 'run'; t += 10) { while (i < smp.length && smp[i].t <= t) { eng.feed(smp[i].t, smp[i].v); i++; } if (eng.state !== 'run') eng.idle(t); }
        const prov = eng.summary();
        ok(prov.launch.how === 'interp' && prov.t0 <= prov.tFirst, 'with one moving sample the launch is the straight interpolation from the last standstill (provisional)');
        while (eng.summary().launch.how === 'interp') { eng.feed(smp[i].t, smp[i].v); i++; }
        ok(Math.abs(eng.summary().t0 - prov.t0) < 100 && eng.summary().launch.how === 'model3', 'and it is replaced when the third moving sample is in (it moved by ' + Math.abs(eng.summary().t0 - prov.t0).toFixed(0) + ' ms here, at 100 ms spacing)');
        // a series that begins to send late
        const late = smp.filter((p) => p.t < C0 || p.t > C0 + 450);
        r = sim.drive(new RunEngine({}), late);
        const lateBy = car.answers('slip', 'kmh')['0-100'].s - r.results['0-100'].s;
        ok(r && r.launch.early > 200 && r.t0 >= r.tFirst - 100, 'a series that says nothing for the first 0.45 s of the launch: the straight line through its first samples says the car was moving ' + r.launch.early +
            ' ms before it was known to stand. The launch stays at the standstill');
        ok(lateBy > 0.2 && r.results['0-100'].pm >= lateBy, 'its 0-100 reads ' + lateBy.toFixed(2) + ' s short, and the +- says so: ' + r.results['0-100'].pm.toFixed(2) + ' s');
        const missed = smp.filter((p) => p.t < C0 || p.v > 25);
        const e2 = new RunEngine({});
        ok(sim.drive(e2, missed) === null && e2.missed === 1 && e2.state === 'wait', 'a series whose first moving sample is already above 20 km/h missed the launch: no run from it');
    });

    await ok.part('the glitch filter', async () => {
        const car = fleet()[20];
        const base = { spacing: 50, phase: 13, onChange: false };
        const clean = timeRun(car, base, { onChange: false }).sum;
        const g = timeRun(car, Object.assign({ zeroAt: 3000 }, base), { onChange: false });
        ok(g.samples.some((p) => p.v === 0 && p.t > C0 + 2000) && car.vAt(3) * 3.6 > 30, 'the car sends a lone 0 at ' + (car.vAt(3) * 3.6).toFixed(0) + ' km/h, 3 s into the run');
        ok(g.sum && g.sum.ended === 'quarter' && g.sum.dropped === 1, 'the run goes on to the 1/4 mile, with one dropped sample counted');
        ok(Object.keys(clean.results).every((k) => Math.abs(g.sum.results[k].s - clean.results[k].s) < 0.003), 'and no split differs from the same run without the glitch by more than 0.003 s');
        const gn = timeRun(car, { spacing: 100, phase: 13, onChange: true, zeroAt: 3000 }, { onChange: true });
        ok(gn.sum && gn.sum.ended === 'quarter' && gn.sum.dropped === 1, 'the same on an on-change series');
        // a car that really stops that fast in the signal (two samples agree): both are fed
        const eng = new RunEngine({ onChange: false });
        let t = 0;
        for (; t <= 1200; t += 50) eng.feed(t, 0);
        for (let v = 4; v <= 40; v += 4, t += 50) eng.feed(t, v);
        ok(eng.state === 'run', 'a run to 40 km/h');
        eng.feed(t, 0);
        ok(eng.state === 'run' && eng.glitches === 0, 'one sample of 0: held back, the run goes on');
        eng.feed(t + 50, 0);
        ok(eng.state !== 'run' && eng.glitches === 0 && eng.summary().ended === 'lift', 'a second 0 agrees with it: both are fed, and the run ends (the speed fell)');
        // a lone jump upwards
        const up = timeRun(car, base, { onChange: false });
        const spiked = sim.sample(car, Object.assign({ clock0: C0 }, base)).map((p) => (p.t > C0 + 3000 && p.t <= C0 + 3050 ? { t: p.t, v: 180 } : p));
        const us = sim.drive(new RunEngine({ onChange: false }), spiked);
        ok(us && us.dropped === 1 && us.ended === 'quarter' && Object.keys(up.sum.results).every((k) => Math.abs(us.results[k].s - up.sum.results[k].s) < 0.003),
            'a lone 180 km/h at ' + (car.vAt(3) * 3.6).toFixed(0) + ' km/h is dropped the same way (unfiltered it would end the run and leave a made-up 0-100)');
        const far = new RunEngine({});
        far.feed(0, 0); far.feed(100, 1023.98); far.feed(200, 600);
        ok(far.last.v === 0 && far.glitches === 0, 'a "speed" above 500 km/h is no speed at all: ignored');
        // nothing follows the held-back sample
        const e2 = new RunEngine({ onChange: true });
        e2.feed(0, 0); e2.idle(1100);
        for (let v = 4, tt = 1200; v <= 40; v += 4, tt += 50) e2.feed(tt, v);
        e2.feed(1700, 0); e2.idle(1750);
        ok(e2.state === 'run', 'an on-change series sends 0 and then nothing: held back at first');
        e2.idle(2250);
        ok(e2.state !== 'run', 'and fed after half a second without another sample');
        // braking is not a glitch
        const e3 = new RunEngine({ onChange: false });
        for (t = 0; t <= 1200; t += 50) e3.feed(t, 0);
        for (let v = 4; v <= 60; v += 4, t += 50) e3.feed(t, v);
        for (let v = 58; v >= 40; v -= 2, t += 50) e3.feed(t, v);
        ok(e3.glitches === 0 && e3.state !== 'run', 'braking at 1.1 g is no glitch: nothing dropped, the run ends on the lift');
    });

    await ok.part('creep, lift, the 60 s limit, a series that dies', async () => {
        // creep: roll to 3 km/h and stop
        const eng = new RunEngine({ onChange: false });
        let done = 0, t = 0;
        eng.onDone = () => { done++; };
        for (; t <= 1500; t += 50) eng.feed(t, 0);
        for (const v of [0.8, 1.6, 2.4, 3, 3, 2.2, 1.2, 0.6]) { eng.feed(t, v); t += 50; }
        ok(eng.state === 'run', 'a roll to 3 km/h starts the clock');
        eng.feed(t, 0.2);
        ok(eng.state === 'ready' && done === 0 && eng.creeps === 1 && eng.summary() === null, 'back to standing without passing 5 km/h: a creep, thrown away, armed again at once');
        const car = fleet()[30];
        const smp = sim.sample(car, { spacing: 50, phase: 0, clock0: t + 2000, stand: 1900 });
        const sum = sim.drive(eng, smp);
        ok(done === 1 && sum && Math.abs(sum.results['0-100'].s - car.answers('slip', 'kmh')['0-100'].s) < 0.004, 'the launch right after it is timed as any other');

        // a lift before the 1/4 mile keeps the earlier splits
        const lifted = new sim.Truth(Object.assign({}, car.p, { lift: car.tAtX(250) }));
        const r = timeRun(lifted, { spacing: 50, phase: 21, onChange: true }, {}).sum, truth = lifted.answers('slip', 'kmh');
        ok(r.ended === 'lift' && !r.results.quarter && !r.results['1000ft'], 'the driver lifts at 250 m: the run ends there, with no 1000 ft and no 1/4 mile');
        ok(['60ft', '330ft', 'eighth'].every((k) => r.results[k] && Math.abs(r.results[k].s - truth[k].s) < 0.004), 'the 60 ft, 330 ft and 1/8 mile done by then are kept and right');
        ok(r.results.eighth.trap > 0 && Math.abs(r.results.eighth.trap - truth.eighth.trap) < 0.1, 'the 1/8 mile keeps its trap speed (' + r.results.eighth.trap.toFixed(1) + ' km/h)');
        const drop = r.vmax - lifted.vAt((r.tEnd - C0) / 1000) * 3.6;
        ok(r.length < 60 && drop >= 5 && drop < 6.5, 'it ended when the speed had fallen 5 km/h under the run\'s top speed of ' + r.vmax.toFixed(0) + ' km/h (' + drop.toFixed(1) + ' km/h at the sample that ended it)');

        // 60 s: a car that crawls
        const slow = new sim.Truth({ a0: 0.6, vTop: 5, ramp: 0.1, shifts: [], maxT: 70 });
        const s = timeRun(slow, { spacing: 100, phase: 40, onChange: true }, {}).sum, st = slow.answers('slip', 'kmh');
        ok(s && s.ended === 'limit' && Math.abs(s.length - 60) < 1e-6, 'a car that creeps up to 18 km/h: the run stops counting at 60 s');
        ok(s.results['60ft'] && s.results.eighth && !s.results.quarter && !s.results['0-100'] && Math.abs(s.results.eighth.s - st.eighth.s) < 0.02, 'the splits done within the 60 s are kept (1/8 mile in ' + s.results.eighth.s.toFixed(2) + ' s), the others never appear');
        // steady speed on an on-change series: nothing arrives, the clock still ends the run, and a line is crossed on time
        const e2 = new RunEngine({ onChange: true });
        let d2 = null;
        e2.onDone = (x) => { d2 = x; };
        e2.feed(0, 0);
        for (t = 50; t <= 1500; t += 50) e2.idle(t);
        for (let v = 1.5; v < 30; v += 1.5, t += 50) e2.feed(t, v);       // 8.3 m/s2 to 30 km/h in 1 s
        e2.feed(t, 30);
        for (t += 50; d2 === null && t < 80000; t += 50) e2.idle(t);
        ok(d2 && d2.ended === 'limit' && d2.samples < 30, 'an on-change series goes quiet at a steady 30 km/h: the clock ends the run at 60 s without a single new sample');
        ok(d2.results['60ft'] && !d2.results['330ft'] && d2.dist > 25 && d2.dist < 30 * 3.2 / 3.6 + 10, 'a steady speed is carried forward for 3 s and no longer (the 60 ft line, 2 s on, is crossed; the count stops at ' + d2.dist.toFixed(0) +
            ' m): no distance is made up for a series that may have died');
        ok(d2.quietEnd > 50000, 'and the summary says the run ended ' + Math.round(d2.quietEnd / 1000) + ' s after the series\' last sample');
        // ... while a real plateau (a gear change) on an on-change series is filled in from the slots that were skipped
        const flat = new sim.Truth({ a0: 7, vTop: 70, ramp: 0.06, shifts: [{ v: 99.6 / 3.6, dur: 0.16, cut: 1 }] });
        const on = timeRun(flat, { spacing: 50, phase: 30, onChange: true }, { onChange: true }).sum, slot = timeRun(flat, { spacing: 50, phase: 30, onChange: false }, { onChange: false }).sum;
        ok(on.medianGap === 50 && on.longestGap >= 100 && Math.abs(on.results['0-100'].s - slot.results['0-100'].s) < 0.002,
            'a gear change at 100 km/h: the on-change series skips slots while the speed stands still (longest gap ' + on.longestGap + ' ms), and its 0-100 is the every-slot series\' to ' +
            (Math.abs(on.results['0-100'].s - slot.results['0-100'].s) * 1000).toFixed(1) + ' ms');
    });

    await ok.part('speed scale, uncertainty figure', async () => {
        const cars = fleet().slice(0, 60);
        let worstScaled = 0, shortBy = [], qBy = [];
        for (const car of cars) {
            const truth = car.answers('slip', 'kmh');
            const raw = timeRun(car, { spacing: 50, phase: 11, onChange: true, over: 1.03 }, {}).sum;
            const fixed = timeRun(car, { spacing: 50, phase: 11, onChange: true, over: 1.03 }, { scale: () => ({ factor: 1 / 1.03, source: 'gps-rmc' }) }).sum;
            for (const k of Object.keys(truth)) worstScaled = Math.max(worstScaled, Math.abs(fixed.results[k].s - truth[k].s));
            shortBy.push(truth['0-100'].s - raw.results['0-100'].s); qBy.push(truth.quarter.s - raw.results.quarter.s);
            if (car === cars[0]) ok(fixed.scale === 1 / 1.03 && fixed.scaleSource === 'gps-rmc' && raw.scale === 1 && raw.scaleSource === 'none', 'a run records the scale it used and where it came from');
        }
        const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
        ok(avg(shortBy) > 0.10 && avg(qBy) > 0.10, 'a car whose speed reads 3 % high, no scale: 0-100 reads short by ' + avg(shortBy).toFixed(2) + ' s and the 1/4 mile by ' + avg(qBy).toFixed(2) + ' s on average (' +
            (avg(shortBy) / 3).toFixed(3) + ' and ' + (avg(qBy) / 3).toFixed(3) + ' s per 1 %)');
        ok(worstScaled <= 0.020, 'with the scale 1 / 1.03 applied to every speed of the run every split is right again (worst ' + s3(worstScaled) + ' over ' + cars.length + ' cars)');
        const r = timeRun(cars[5], { spacing: 100, phase: 33, onChange: true }, {}).sum, x = r.results;
        // (the brief's formula, plus what the two ways of placing the launch are apart on a series nothing is known of: run.js)
        const want = (gap, roll) => Math.ceil(Math.max(0.01, (r.launchGap / (roll ? 16 : 4) + r.launch.apart / (roll ? 4 : 1) + gap / 4) / 1000) * 100 - 1e-6) / 100;
        ok(x['0-100'].pm === want(100, false) && x.quarter.pm === want(100, true), '+- of a split from first movement = launch gap / 4 + sample gap / 4 (' + x['0-100'].pm.toFixed(2) + ' s at 100 ms), after the first foot = launch gap / 16 + sample gap / 4 (' + x.quarter.pm.toFixed(2) +
            ' s); here with ' + r.launch.apart + ' ms for the launch, which the model and the straight line place that far apart');
        ok(Object.keys(x).every((k) => Math.abs(x[k].pm * 100 - Math.round(x[k].pm * 100)) < 1e-9 && x[k].pm >= 0.01), 'rounded up to a hundredth, never under 0.01 s');
        const fast = timeRun(cars[5], { spacing: 20, phase: 3, onChange: true }, {}).sum.results;
        ok(fast['0-100'].pm <= 0.02 && fast.quarter.pm === 0.01, 'at 20 ms spacing: +-' + fast['0-100'].pm.toFixed(2) + ' s on the 0-100, +-' + fast.quarter.pm.toFixed(2) + ' s on the 1/4 mile');
    });

    /* ================= what the first review found (each check here failed on the code as it was reviewed) ================= */
    await ok.part('review, the launch instant: a speed signal that reads 0 under 0.5 km/h, a brake-release start', async () => {
        const cars = fleet().slice(0, 120);
        // (a) the signal reads 0 while the car does less than 0.5 km/h, the very speed the app counts as standing
        const cutN = measure(cars, { sample: { onChange: true, floor: 0.5 }, engine: { onChange: true }, spacings: [20, 50] });
        const cutP = measure(cars, { sample: { onChange: false, floor: 0.5 }, engine: { onChange: false }, spacings: [50] });
        show('H. the speed signal reads 0 under 0.5 km/h. On-change series (the notifier)', cutN);
        show('I. the same signal, a series that sends every slot (the polled getter)', cutP);
        ok(Math.abs(cutN[20]['0-100'].err.mean) < 0.004 && over(cutN, 20).worst <= 0.010,
            'a signal that reads 0 under 0.5 km/h, 20 ms spacing: 0-100 off by ' + ms1(cutN[20]['0-100'].err.mean) + ' ms on average, every split within 0.010 s (worst ' + s3(over(cutN, 20).worst) +
            '). WAS: the launch model took that 0 for a measured standstill and put the launch late: 0-100 read 7 to 10 ms short, up to 20 ms, against a +- of 0.01');
        ok(Math.abs(cutN[50]['0-100'].err.mean) < 0.010 && Math.abs(cutP[50]['0-100'].err.mean) < 0.010,
            'the same at 50 ms, notified and polled: off by ' + ms1(cutN[50]['0-100'].err.mean) + ' and ' + ms1(cutP[50]['0-100'].err.mean) + ' ms on average (what is left is the straight line\'s own lateness on a launch that builds up). WAS: 26 ms short on a gentle start');
        ok(over(cutN, 20).cover >= 0.95 && over(cutN, 50).cover >= 0.95 && over(cutP, 50).cover >= 0.95, 'and the +- covers the error in at least 95 % of those runs (least ' +
            Math.round(Math.min(over(cutN, 20).cover, over(cutN, 50).cover, over(cutP, 50).cover) * 100) + ' %). WAS: 48 to 71 % on such a signal');
        // (b) the brake released and the throttle 0.4 s later: the car creeps past 0.5 km/h, then gets its torque at once
        const creep = fleet('creep').slice(0, 120);
        const cr = measure(creep, { sample: { onChange: true }, engine: { onChange: true }, spacings: [50, 100] });
        const crP = measure(creep, { sample: { onChange: false }, engine: { onChange: false }, spacings: [100] });
        show('J. a brake-release start (a tenth of the torque for 0.4 s, then all of it), signal read from 0. On-change series', cr);
        ok(over(cr, 100).mabs < 0.020 && over(cr, 100).worst <= 0.050 && over(crP, 100).worst <= 0.050,
            'a brake-release start at 100 ms spacing: the brief\'s bound holds (mean absolute ' + s3(over(cr, 100).mabs) + ', worst ' + s3(over(cr, 100).worst) + ' notified, ' + s3(over(crP, 100).worst) +
            ' every slot). WAS: the model could not follow the kink, ignored the two samples around 0.5 km/h and put the launch up to 82 ms late');
        ok(over(cr, 50).cover >= 0.95 && over(cr, 100).cover >= 0.95 && over(crP, 100).cover >= 0.95, 'and the +- covers the error in at least 95 % of those runs. WAS: 76 % at 100 ms');
        const hows = {};
        for (const car of creep.slice(0, 60)) { const r = timeRun(car, { spacing: 100, phase: 41, onChange: true }, {}).sum; hows[r.launch.how] = (hows[r.launch.how] || 0) + 1; }
        ok(hows.between > 0, 'where the model contradicts the two samples around 0.5 km/h the straight line between them is used (in ' + hows.between + ' of 60 such launches; the others by ' +
            Object.keys(hows).filter((k) => k !== 'between').map((k) => k + ' ' + hows[k]).join(', ') + ')');
        // (c) the reviewer's four points: stood at -30 ms, then 0.56, 0.70, 0.84 km/h at 20, 70, 120 ms
        const eng = new RunEngine({ onChange: false });
        for (let t = -1530; t <= -30; t += 50) eng.feed(t, 0);
        [[20, 0.56], [70, 0.70], [120, 0.84], [170, 0.98], [220, 1.12]].forEach((p) => eng.feed(p[0], p[1]));
        const s4 = eng.summary();
        ok(s4.launch.how === 'line3' && Math.abs(s4.t0 - (-1.4)) < 1 && s4.launch.clamp === null, 'stood at -30 ms, then 0.56, 0.70, 0.84 km/h at 20, 70, 120 ms: the launch is put at ' + s4.t0.toFixed(1) +
            ' ms, where the line through the moving samples says. WAS: the model said 40 ms, after the first moving sample, and the launch was held at that sample (20 ms)');
        ok(s4.launch.apart >= 20 && eng.results()['60ft'] === undefined, 'and the time the two ways of placing it are apart (' + s4.launch.apart + ' ms) is in the summary, for the +-');
        // (d) a series that has shown it reads from 0 keeps the model, and nothing is added to the +-
        // (a launch whose first sample above 0 is already above 0.5 km/h: 100 ms spacing, the acceleration building up over 0.2 s)
        const car = new sim.Truth({ a0: 9, vTop: 70, ramp: 0.2, shifts: [] }), smp = sim.sample(car, { spacing: 100, phase: 0, onChange: true, clock0: C0 });
        const fresh = sim.drive(new RunEngine({}), smp);
        const known = new RunEngine({});
        [[C0 - 9000, 30], [C0 - 8000, 6], [C0 - 7900, 0.9], [C0 - 7800, 0.3], [C0 - 7700, 0.05], [C0 - 7600, 0]].forEach((p) => known.feed(p[0], p[1]));
        const kn = sim.drive(known, smp.filter((p) => p.t > C0 - 7000));
        ok(kn.launch.lowSeen === 0.05 && kn.launch.apart === 0 && /^model/.test(kn.launch.how) && fresh.launch.lowSeen === null && fresh.launch.apart > 0,
            'a series that has reported 0.05 km/h reads from 0: its 0 is a real 0, the model is used and nothing is added to the +- (a series nothing is known of: ' + fresh.launch.apart + ' ms added)');
        ok(kn.results['0-100'].pm < fresh.results['0-100'].pm && Math.abs(kn.results['0-100'].s - car.answers('slip', 'kmh')['0-100'].s) < 0.004, 'its 0-100 is right to ' +
            (Math.abs(kn.results['0-100'].s - car.answers('slip', 'kmh')['0-100'].s) * 1000).toFixed(1) + ' ms with +-' + kn.results['0-100'].pm.toFixed(2) + ' s');
        ok(typeof Feed.describeRun(kn) === 'string' && /smallest speed this series reported before: 0\.050 km\/h/.test(Feed.describeRun(kn)) && /none yet/.test(Feed.describeRun(fresh)),
            'the run\'s log line says the smallest speed the series had reported before the launch (the first car will show what its signal does under 0.5 km/h)');
        // (e) held at an end of the launch gap: the whole gap goes into the +-
        const late = timeRun(fleet()[7], { spacing: 50, phase: 21, onChange: false, floor: 2 }, { onChange: false }).sum;
        ok(late.launch.clamp === 'stand' && late.launch.apart >= 0.75 * late.launchGap - 0.1 && late.results['0-100'].pm >= (late.launchGap + late.launch.early) / 1000,
            'a signal that cuts in at 2 km/h: the launch is held at the last standstill, and the whole launch gap (' + Math.round(late.launchGap) + ' ms) is in the +- with what the first samples say it was late by (' +
            late.launch.early + ' ms): +-' + late.results['0-100'].pm.toFixed(2) + ' s. WAS: a quarter of the gap');
    });

    await ok.part('review, bad data: holes in a series, samples that arrive together, a step no car does', async () => {
        const car = fleet()[20], truth = car.answers('slip', 'kmh');
        const t100 = C0 + car.tAtV(100 / 3.6) * 1000, t40 = C0 + car.tAtV(40 / 3.6) * 1000;
        const N = (spacing) => sim.sample(car, { spacing, phase: 0.37 * spacing, onChange: true, clock0: C0 });
        const run = (smp, o) => sim.drive(new RunEngine(Object.assign({ onChange: true }, o)), smp);
        const errOf = (s, k) => s.results[k].s - truth[k].s;
        const inPm = (s, keys) => keys.every((k) => s.results[k] && Math.abs(errOf(s, k)) <= s.results[k].pm + 1e-9);
        const DIST = ['330ft', 'eighth', '1000ft', 'quarter'];
        // a lone 0 in place of the sample just after 100 km/h: the filter drops it, which leaves a hole of two slots
        let smp = N(100), i = smp.findIndex((p) => p.t >= t100);
        const clean = run(smp);
        let s = run(smp.map((p, k) => (k === i ? { t: p.t, v: 0 } : p)));
        ok(s.dropped === 1 && Math.abs(s.results['0-100'].s - clean.results['0-100'].s) < 0.012, 'a lone 0 in place of the sample just after 100 km/h (notified, 100 ms): dropped, and the 0-100 is the clean run\'s to ' +
            (Math.abs(s.results['0-100'].s - clean.results['0-100'].s) * 1000).toFixed(1) + ' ms. WAS: the slot of the dropped sample was filled in as "the speed did not change", 0-100 read 73 ms long on average with +-0.05');
        // one notification lost
        s = run(smp.filter((p, k) => k !== i));
        ok(Math.abs(s.results['0-100'].s - clean.results['0-100'].s) < 0.012 && s.holeMs === 0, 'one notification lost at 100 km/h: a straight line across the two slots, 0-100 within ' +
            (Math.abs(s.results['0-100'].s - clean.results['0-100'].s) * 1000).toFixed(1) + ' ms (too short to count as a hole)');
        // a hole of one second while the car pulls
        for (const spacing of [20, 100]) {
            smp = N(spacing);
            const whole = run(smp);
            s = run(smp.filter((p) => p.t < t40 || p.t > t40 + 1000));
            ok(s.holeMs >= 1000 && s.holeMs <= 1000 + 2 * spacing && inPm(s, DIST) && DIST.every((k) => Math.abs(errOf(s, k)) < 0.03), 'a hole of 1 s from 40 km/h (notified, ' + spacing + ' ms): seen as a hole of ' + s.holeMs +
                ' ms, a straight line across it, and every later distance split within its +- (1/4 mile ' + ms1(errOf(s, 'quarter')) + ' ms, +-' + s.results.quarter.pm.toFixed(2) + ' s). WAS: read as "the speed stood still for a second", 330 ft to 1/4 mile 68 to 114 ms long with +-0.01 to 0.04');
            ok(s.results.quarter.pm > whole.results.quarter.pm && whole.holeMs === 0, 'and the hole is in the +- of the splits after it (1/4 mile +-' + s.results.quarter.pm.toFixed(2) + ' s against +-' + whole.results.quarter.pm.toFixed(2) + ' s without it)');
        }
        s = run(N(20).filter((p) => p.t < t100 - 500 || p.t > t100 + 500));
        ok(Math.abs(errOf(s, '0-100')) <= s.results['0-100'].pm && Math.abs(errOf(s, '0-100')) < 0.05, 'a hole of 1 s around 100 km/h (notified, 20 ms): 0-100 ' + ms1(errOf(s, '0-100')) + ' ms off, with +-' + s.results['0-100'].pm.toFixed(2) +
            ' s. WAS: 0.50 s long with +-0.26');
        // a plateau is still a plateau: the gear change test above (creep, lift ... part) covers the other side
        // the polled series: a hole is a gap of more than 2.5 slots
        const P = sim.sample(car, { spacing: 50, phase: 9, onChange: false, clock0: C0 });
        s = run(P.filter((p) => p.t < t40 || p.t > t40 + 1000), { onChange: false });
        ok(s.holeMs >= 1000 && s.holeMs <= 1100 && inPm(s, DIST), 'the same hole in a series that sends every slot: also recorded (' + s.holeMs + ' ms), later splits within their +-');
        // samples delivered in lumps: sent every 10 ms, handed to the app every 90 ms, stamped on arrival
        const lump = (list, every) => { let last = -Infinity; return list.map((p) => { let t = Math.ceil(p.t / every) * every; if (t <= last) t = last + 0.01; last = t; return { t, v: p.v }; }); };
        s = run(lump(N(10), 90));
        ok(s.merged > 500 && Math.abs(s.medianGap - 90) < 1 && Math.abs(errOf(s, '0-100')) <= s.results['0-100'].pm && Math.abs(errOf(s, '0-100')) < 0.03, 'a series sent every 10 ms and delivered in lumps every 90 ms: the samples that arrive together are merged into the newest (' +
            s.merged + ' of them), it counts as a 90 ms series, 0-100 ' + ms1(errOf(s, '0-100')) + ' ms off with +-' + s.results['0-100'].pm.toFixed(2) + ' s. WAS: median spacing "0 ms", 0-100 up to 70 ms long with +-0.01');
        // the app itself held up for a second: what the car sent meanwhile is all handled, and stamped, when it is over
        const stall = (list, from, ms) => { let k = 0; return list.map((p) => (p.t >= from && p.t < from + ms ? { t: from + ms + (k += 0.05), v: p.v } : p)); };
        for (const [name, list, o] of [['notified, 100 ms', N(100), { onChange: true }], ['polled, 50 ms', P, { onChange: false }]]) {
            s = run(stall(list, t40, 1000), o);
            ok(s.merged >= 8 && s.holeMs >= 1000 && inPm(s, DIST) && DIST.every((k) => Math.abs(errOf(s, k)) < 0.03), 'the app held up for 1 s at 40 km/h (' + name + '): the samples of that second arrive together and are merged, the second is a hole of ' + s.holeMs +
                ' ms, later splits within their +- (1/4 mile ' + ms1(errOf(s, 'quarter')) + ' ms). WAS: 66 to 127 ms long with +-0.01 to 0.04');
        }
        // two wrong high samples in a row: confirmed by each other, so the filter lets them through
        for (const [name, list, o] of [['notified, 100 ms', N(100), { onChange: true }], ['polled, 50 ms', P, { onChange: false }]]) {
            const t60 = C0 + car.tAtV(60 / 3.6) * 1000, k = list.findIndex((p) => p.t >= t60);
            s = run(list.map((p, j) => (j === k || j === k + 1 ? { t: p.t, v: 250 } : p)), o);
            ok(s.ended === 'jump' && s.jumps === 1 && !s.results['0-100'] && s.vmax < 70 && s.results['60ft'] && Math.abs(errOf(s, '60ft')) < 0.005, 'two samples of 250 km/h in a row at 60 km/h (' + name + '): the run ends at the sample before them (ended by "jump"), with its 60 ft and NO 0-100. ' +
                'WAS: the step from 60 to 250 km/h was taken as the car passing 100, and a 0-100 of about half the true time was kept and could set a best');
        }
        // a getter that goes on answering with an old value
        const t90 = C0 + car.tAtV(90 / 3.6) * 1000;
        s = run(P.map((p) => (p.t >= t90 && p.t <= t90 + 2000 ? { t: p.t, v: 90 } : p)), { onChange: false });
        ok(s.ended === 'jump' && !s.results['0-100'] && s.frozenMs >= 1900, 'a getter that repeats 90 km/h for 2 s and then tells the truth again: the catching-up step ends the run (no 0-100), and the summary says one value was repeated for ' + s.frozenMs + ' ms. WAS: 0-100 0.76 s long with +-0.03');
        const stuck = new RunEngine({ onChange: false });
        sim.drive(stuck, P.map((p) => (p.t >= t90 ? { t: p.t, v: 90 } : p)));
        s = stuck.summary();
        ok(s && s.frozenMs >= 5000 && !s.results['0-100'], 'a getter that repeats 90 km/h for good: the summary says so (' + s.frozenMs + ' ms on one value), for the app to flag the run');
        // the brief's own case still holds, and a real stop is still a stop
        const e3 = new RunEngine({ onChange: false });
        let t = 0;
        for (; t <= 1200; t += 50) e3.feed(t, 0);
        for (let v = 4; v <= 60; v += 4, t += 50) e3.feed(t, v);
        e3.feed(t, 0); e3.feed(t + 50, 0);
        ok(e3.summary().ended === 'lift' && e3.summary().jumps === 0, 'two 0 in a row still end the run as a lift (a step DOWN that is confirmed is the brief\'s case: both are fed)');
    });

    /* ================= what the final check found (each check here failed on the code as it was checked, unless it says "still") ================= */
    await ok.part('final check, a sample stamped late: the app held up, samples that waited, uneven delivery. No run may end as a "jump" for it', async () => {
        // Two cars: a quick one and a slower one. Each launch: the send slots at a random phase, one hold-up at a random moment near a place.
        const gears = (list) => list.map((v) => ({ v: v / 3.6, dur: 0.15, cut: 1 }));
        const quick = new sim.Truth({ a0: 12.4, vTop: 85, ramp: 0.08, shifts: gears([65, 110, 160]) });
        const slower = new sim.Truth({ a0: 8.6, vTop: 38, ramp: 0.12, shifts: gears([55, 95]) });
        const CARS = [['quick car', quick], ['slower car', slower]];
        const gAt = (car, kmh) => (car.p.a0 * (1 - kmh / 3.6 / car.p.vTop) / 9.80665).toFixed(2) + ' g';
        console.log('  the two cars: 0-100 km/h in ' + quick.answers('slip', 'kmh')['0-100'].s.toFixed(2) + ' s (pulling ' + gAt(quick, 40) + ' at 40 km/h) and ' + slower.answers('slip', 'kmh')['0-100'].s.toFixed(2) + ' s (' + gAt(slower, 40) + ' at 40 km/h)');
        // The app held up from `from` for `ms`: what arrived in that time is handled, and stamped, when it is over, `each` ms apart
        // (0.05: at once); a sample that arrives while others still wait is handled after them. As the first review's case 13b.
        const held = (list, from, ms, each) => { let free = from + ms; return list.map((p) => { if (p.t < from || p.t >= free) return p; const t = free; free = t + (each || 0.05); return { t, v: p.v }; }); };
        // Hand the samples to an engine. tick: 'on' = idle() every 50 ms throughout (the samples were held up below the app);
        // 'first' / 'last' = the app itself was held up: no idle() during the hold-up, and one late one right when it is over,
        // before or after the samples that waited.
        const drive = (eng, smp, o) => {
            let done = null, i = 0;
            eng.onDone = (x) => { if (!done) done = x; };
            const end = smp[smp.length - 1].t + 2000, from = o && o.from, to = o && o.from + o.ms, mode = (o && o.tick) || 'on';
            const lateTick = mode === 'first' ? to + 0.01 : to + 0.9;
            let tick = Math.floor(smp[0].t / 50) * 50 + ((o && o.phase) || 0), lateDone = mode === 'on';
            for (;;) {
                const st = i < smp.length ? smp[i].t : Infinity;
                if (!lateDone && lateTick <= Math.min(st, tick)) { eng.idle(lateTick); lateDone = true; continue; }
                if (st <= tick) { eng.feed(st, smp[i].v, smp[i].took); i++; continue; }
                if (tick > end) break;
                if (mode === 'on' || tick < from || tick >= to + 1) eng.idle(tick);
                tick += 50;
            }
            return done || eng.summary();
        };
        const PLACES = [['15 km/h', (c) => c.tAtV(15 / 3.6)], ['40 km/h', (c) => c.tAtV(40 / 3.6)], ['the 60 ft line', (c) => c.tAtX(18.6) - 0.1], ['100 km/h', (c) => c.tAtV(100 / 3.6) - 0.1],
            ['the 1/8 mile line', (c) => c.tAtX(201.5) - 0.1]];
        const KEYS = ['0-100', '60ft', '330ft', 'eighth', '1000ft', 'quarter'];
        // one cell: n launches -> { quarter: runs that reached the 1/4 mile, jump, none: launches without a run, over: splits wrong by more than their +-, worst: by how much (s), merged }
        const cell = (car, spacing, at, ms, n, o) => {
            const rand = sim.rng(31000 + spacing * 7 + ms + Math.round(at * 10)), truth = car.answers('slip', 'kmh'), out = { quarter: 0, jump: 0, none: 0, over: 0, worst: 0, merged: 0, late: 0, n };
            for (let i = 0; i < n; i++) {
                const from = C0 + at * 1000 + (rand() - 0.5) * 2 * spacing;
                const smp = held(sim.sample(car, { spacing, phase: rand() * spacing, onChange: true, clock0: C0 }), from, ms, o && o.each);
                const tick = (o && o.tick) === 'app' ? (i % 2 ? 'first' : 'last') : 'on';
                const s = drive(new RunEngine({ onChange: true }), smp, { from, ms, tick, phase: Math.floor(rand() * 50) });
                if (!s || !s.ended) { out.none++; continue; }
                if (s.ended === 'jump') out.jump++;
                if (s.results.quarter) out.quarter++;
                out.merged += s.merged;
                if (s.launch.late || isFinite(s.launch.tickLate) && s.launch.tickLate !== null) out.late++;
                for (const k of KEYS) { const r = s.results[k]; if (r) { const e = Math.abs(r.s - truth[k].s) - r.pm; if (e > 1e-9) { out.over++; out.worst = Math.max(out.worst, e); } } }
            }
            return out;
        };
        const sum = (list) => list.reduce((a, c) => { Object.keys(c).forEach((k) => { a[k] = k === 'worst' ? Math.max(a[k] || 0, c[k]) : (a[k] || 0) + c[k]; }); return a; }, {});
        const STALLS = [40, 60, 80, 100, 300], N = 20;

        // the first review's case 13b, which the final check found broken: 300 ms at 40 km/h, notified every 100 ms, the 6.5 s car
        let c = cell(slower, 100, slower.tAtV(40 / 3.6), 300, 200);
        ok(c.quarter === 200 && c.jump === 0 && c.over === 0, 'the app held up for 300 ms at 40 km/h, notifier every 100 ms, slower car, 200 launches: ' + c.quarter + ' reach the 1/4 mile, ' + c.jump +
            ' end as a "jump", ' + c.over + ' splits wrong by more than their +-. WAS: 37 of the 200 ended as a "jump" at the first sample after the hold-up (flag SPEED JUMP, no later split): the step test divided a whole slot\'s gain in speed by the few ms between a late stamp and the next one');

        // hold-ups of 40 to 300 ms anywhere in the run after the launch
        console.log('  L. one hold-up per launch, notifier only, ' + N + ' launches a cell: runs that reached the 1/4 mile / splits wrong by more than their +-');
        for (const tick of ['on', 'app']) {
            const all = [];
            for (const [cn, car] of CARS) {
                for (const spacing of [50, 100]) {
                    const row = [];
                    for (const ms of STALLS) { const cs = sum(PLACES.map((p) => cell(car, spacing, p[1](car), ms, N, { tick }))); row.push(cs); all.push(cs); }
                    console.log('    ' + (tick === 'on' ? 'samples held up, tick on time  ' : 'the app held up, its tick too  ') + cn.padEnd(11) + pad(spacing, 4) + ' ms:  ' +
                        row.map((x, i) => STALLS[i] + ' ms ' + x.quarter + '/' + x.n + ' / ' + x.over).join('   '));
                }
            }
            const t = sum(all);
            ok(t.quarter === t.n && t.jump === 0 && t.none === 0, 'hold-ups of 40, 60, 80, 100 and 300 ms at 15 km/h, 40 km/h, the 60 ft line, 100 km/h and the 1/8 mile line, notifier every 50 and 100 ms, both cars (' +
                (tick === 'on' ? 'the samples held up below the app, its 50 ms tick on time' : 'the app itself held up, its tick with it') + '): ' + t.quarter + ' of ' + t.n + ' runs reach the 1/4 mile, ' + t.jump + ' end as a "jump"' +
                (tick === 'on' ? '. WAS: 168 of the 2000 ended as a "jump" (1 in 7 of the quick car\'s, 1 in 50 of the slower one\'s)' : '. WAS: the same 168'));
            ok(t.over === 0, 'splits of those runs wrong by more than their +-: ' + t.over + ' (' + t.merged + ' late samples taken out in all)');
        }
        // the same hold-ups right at the launch
        for (const tick of ['on', 'app']) {
            const all = [];
            for (const [, car] of CARS) for (const spacing of [50, 100]) for (const ms of STALLS) all.push(cell(car, spacing, 0, ms, N, { tick }));
            const t = sum(all);
            ok(t.quarter === t.n && t.jump === 0 && t.none === 0, 'the same hold-ups at the launch itself (' + (tick === 'on' ? 'samples held up, tick on time' : 'the app held up, its tick too') + '): ' + t.quarter + ' of ' + t.n +
                ' launches are timed to the 1/4 mile (' + t.jump + ' ended as a "jump", ' + t.none + ' gave no run)' + (tick === 'on' ? '. WAS: 92 of the 400 gave no run at all (the step from a late first sample ended them before 5 km/h)' : '. WAS: the same 92'));
            ok(t.over <= (tick === 'on' ? 0.01 : 0) * t.n * 6, 'splits of those runs wrong by more than their +-: ' + t.over + ' of ' + t.n * 6 + (t.over ? ' (worst by ' + (t.worst * 1000).toFixed(0) + ' ms)' : '') + '; ' + t.late +
                ' launches were seen to be late and timed with a wider +-' + (tick === 'on' ? '. WAS: 137 of 2400 wrong by more than their +-, by up to 243 ms, and no launch marked as seen late' : '. WAS: the same 137'));
        }

        // samples that waited and are then handled a few ms apart (not within the 2 ms that count as "together")
        let all = [];
        for (const [, car] of CARS) for (const spacing of [20, 50, 100]) for (const each of [1, 3, 10]) all.push(cell(car, spacing, car.tAtV(40 / 3.6), 300, 10, { each }));
        let t = sum(all);
        ok(t.quarter === t.n && t.jump === 0 && t.over === 0, 'the app held up for 300 ms at 40 km/h and the samples that waited handled 1, 3 or 10 ms apart (notifier every 20, 50, 100 ms): ' + t.quarter + ' of ' + t.n +
            ' runs reach the 1/4 mile, ' + t.jump + ' end as a "jump", ' + t.over + ' splits wrong by more than their +-. WAS: 69 of the 180 ended as a "jump", and 177 splits of the others were wrong by more than their +-');

        // every notification late by a random time
        all = [[50, 30], [50, 40], [100, 60]].map((x) => {
            const rand = sim.rng(5200 + x[1]), truth = quick.answers('slip', 'kmh'), out = { n: 100, jump: 0, quarter: 0, over: 0 };
            for (let i = 0; i < 100; i++) {
                const s = sim.drive(new RunEngine({ onChange: true }), sim.sample(quick, { spacing: x[0], phase: rand() * x[0], onChange: true, jitter: x[1], rand, clock0: C0 }), { idlePhase: Math.floor(rand() * 50) });
                if (!s) continue;
                if (s.ended === 'jump') out.jump++;
                if (s.results.quarter) out.quarter++;
                if (s.results['0-100'] && Math.abs(s.results['0-100'].s - truth['0-100'].s) > s.results['0-100'].pm + 1e-9) out.over++;
            }
            return out;
        });
        t = sum(all);
        ok(t.jump === 0 && t.quarter === t.n, 'every notification 0 to 30 or 40 ms late at random on a 50 ms notifier, 0 to 60 ms on a 100 ms one, quick car: ' + t.quarter + ' of ' + t.n + ' runs reach the 1/4 mile (' +
            all.map((x) => x.jump).join(', ') + ' end as a "jump"). WAS: 7, 70 and 2 of each 100 ended as a "jump"');
        ok(t.over <= 0.02 * t.n, 'and the 0-100 of those runs is beyond its +- in ' + t.over + ' of ' + t.n);

        // a series delivered in lumps (sent every 10 ms, handed over every 90 ms), the lumps falling anywhere against the launch
        const lumps = (list, off) => { let last = -Infinity; return list.map((p) => { let x = Math.ceil((p.t - off) / 90) * 90 + off; if (x <= last) x = last + 0.01; last = x; return { t: x, v: p.v }; }); };
        let worst = 0, overs = 0, runs = 0;
        for (const ci of [20, 3, 7, 11, 40, 77, 120, 200]) {
            const car = fleet()[ci], truth = car.answers('slip', 'kmh')['0-100'].s;
            for (let ph = 0; ph < 10; ph++) {
                const s = sim.drive(new RunEngine({ onChange: true }), lumps(sim.sample(car, { spacing: 10, phase: 3.7, onChange: true, clock0: C0 }), ph * 9));
                if (!s || !s.results['0-100']) { overs++; continue; }
                runs++;
                const e = Math.abs(s.results['0-100'].s - truth);
                worst = Math.max(worst, e);
                if (e > s.results['0-100'].pm + 1e-9) overs++;
            }
        }
        ok(runs === 80 && overs === 0 && worst < 0.015, 'a series delivered in lumps every 90 ms, 8 cars, the lumps at 10 places against the launch: ' + runs + ' of 80 launches timed, 0-100 within ' + (worst * 1000).toFixed(1) +
            ' ms, ' + overs + ' beyond their +- or not timed. WAS: the first lump was taken as the launch: 78 of 80 timed, 0-100 up to 77 ms off, 52 beyond their +- or not timed');

        // the protection the "jump" was added for stays
        const N100 = sim.sample(slower, { spacing: 100, phase: 37, onChange: true, clock0: C0 }), t60 = C0 + slower.tAtV(60 / 3.6) * 1000, k60 = N100.findIndex((p) => p.t >= t60);
        const tr = slower.answers('slip', 'kmh');
        let s = sim.drive(new RunEngine({ onChange: true }), N100.map((p, j) => (j >= k60 && j < k60 + 3 ? { t: p.t, v: 250 } : p)));
        ok(s.ended === 'jump' && !s.results['0-100'] && s.results['60ft'] && s.vmax < 70, 'three samples of 250 km/h in a row at 60 km/h: still ended by "jump" at the sample before them, with its 60 ft and NO 0-100');
        // ... also right after a sample that really was stamped late (60 ms late on a 100 ms notifier)
        s = sim.drive(new RunEngine({ onChange: true }), N100.map((p, j) => (j === k60 - 1 ? { t: p.t + 60, v: p.v } : j === k60 || j === k60 + 1 ? { t: p.t, v: 250 } : p)));
        ok(s.ended === 'jump' && !s.results['0-100'] && s.vmax < 70, 'a sample stamped 60 ms late, then two samples of 250 km/h: still ended by "jump", no 0-100 (a late stamp does not excuse a step that is one over a whole send slot too)');
        // ... and right after a lump
        s = sim.drive(new RunEngine({ onChange: true }), held(N100, t60 - 350, 300).map((p) => (p.t > t60 && p.t < t60 + 190 ? { t: p.t, v: 250 } : p)));
        ok(s.ended === 'jump' && !s.results['0-100'] && s.vmax < 70, 'the app held up for 300 ms, then two samples of 250 km/h: still ended by "jump", no 0-100');
        // a late stamp, then the driver lifts
        const lifter = new sim.Truth({ a0: 5.7, vTop: 70, ramp: 0.12, shifts: gears([55]), lift: 5.2 }), tl = lifter.answers('slip', 'kmh');
        const L100 = sim.sample(lifter, { spacing: 100, phase: 37, onChange: true, clock0: C0 });
        s = sim.drive(new RunEngine({ onChange: true }), held(L100, C0 + 5200 - 130, 90));
        ok(s.ended === 'lift' && s.jumps === 0 && s.results['60ft'] && Math.abs(s.results['60ft'].s - tl['60ft'].s) <= s.results['60ft'].pm && !s.results.eighth, 'a sample stamped late just before the driver lifts: the run ends as a lift, its 60 ft stands (' +
            s.results['60ft'].s.toFixed(3) + ' s, true ' + tl['60ft'].s.toFixed(3) + ')');
        // a late stamp right at 100 km/h: the sample before the crossing stamped 20 ms late (it stays) or 60 ms late (it is taken out)
        const t100 = C0 + slower.tAtV(100 / 3.6) * 1000, k100 = N100.findIndex((p) => p.t >= t100);
        for (const lateMs of [20, 60]) {
            s = sim.drive(new RunEngine({ onChange: true }), N100.map((p, j) => (j === k100 - 1 ? { t: p.t + lateMs, v: p.v } : p)));
            const e = s.results['0-100'].s - tr['0-100'].s;
            ok(Math.abs(e) <= s.results['0-100'].pm + 1e-9 && s.ended === 'quarter' && s.merged === (lateMs > 25 ? 1 : 0), 'the sample just before 100 km/h stamped ' + lateMs + ' ms late (notifier every 100 ms): ' +
                (lateMs > 25 ? 'taken out, a straight line across' : 'it stays, and the +- gets what it was late by') + ': 0-100 ' + ms1(e) + ' ms off with +-' + s.results['0-100'].pm.toFixed(2) + ' s');
        }
        // a series that sends twice as fast after its first samples is not taken for a queue being worked off
        const fastLater = sim.sample(slower, { spacing: 50, phase: 11, onChange: true, clock0: C0 }).filter((p, j, a) => p.t > C0 + 1200 || Math.round((p.t - a[0].t) / 50) % 2 === 0);
        s = sim.drive(new RunEngine({ onChange: true }), fastLater);
        ok(s.ended === 'quarter' && Math.abs(s.slot - 100) < 1 && s.merged === 0 && s.holeMs === 0 && Math.abs(s.results.quarter.s - tr.quarter.s) < 0.01, 'a notifier that sends every 100 ms for the first second and every 50 ms from then on: no sample is taken out (the ' +
            'one after a late sample comes two slots after the one before it; these do not), 1/4 mile ' + ms1(s.results.quarter.s - tr.quarter.s) + ' ms off');
        // ... not even when the faster pace begins right after a hole (where the first replacement does look right): the rule gives up after a second
        s = sim.drive(new RunEngine({ onChange: true }), fastLater.filter((p) => p.t < C0 + 1150 || p.t > C0 + 1400));
        ok(s.ended === 'quarter' && s.merged > 5 && s.merged < 30 && s.holeMs <= 1300 && s.samples > 150 && Math.abs(s.results.quarter.s - tr.quarter.s) <= s.results.quarter.pm, 'the same with a hole of 250 ms just before the pace doubles: samples replace each other for one second (' +
            s.merged + ' of them, a hole of ' + s.holeMs + ' ms: DATA GAP), then the rule is switched off and the run goes on to the 1/4 mile (' + s.samples + ' samples, ' + ms1(s.results.quarter.s - tr.quarter.s) + ' ms off, +-' + s.results.quarter.pm.toFixed(2) + ' s)');

        // the polled series: a read that was in flight while the app was held up comes back late and is stamped at the middle of its long round trip
        const hard = new sim.Truth({ a0: 15.5, vTop: 95, ramp: 0.06, shifts: gears([70, 120, 170]) }), th = hard.answers('slip', 'kmh');
        const out = { n: 100, jump: 0, quarter: 0, over: 0 }, rnd = sim.rng(8123);
        for (let i = 0; i < 100; i++) {
            const from = C0 + hard.tAtV(15 / 3.6) * 1000 + rnd() * 50, P = [];
            for (const p of sim.samplePolled(hard, { phase: rnd() * 50, rand: rnd, clock0: C0 })) {
                const t1 = p.t - p.took / 2, t2 = p.t + p.took / 2;
                if (t1 >= from && t1 < from + 300) continue;                               // no read is started while the app is held up
                if (t1 < from && t2 >= from) P.push({ t: (t1 + from + 300) / 2, v: p.v, took: from + 300 - t1 }); else P.push(p);
            }
            const x = sim.drive(new RunEngine({ onChange: false }), P, { idlePhase: Math.floor(rnd() * 50) });
            if (!x) continue;
            if (x.ended === 'jump') out.jump++;
            if (x.results.quarter) out.quarter++;
            for (const k of KEYS) if (x.results[k] && Math.abs(x.results[k].s - th[k].s) > x.results[k].pm + 1e-9) out.over++;
        }
        ok(out.jump === 0 && out.quarter === 100 && out.over === 0, 'a car that pulls ' + (15.5 / 9.80665).toFixed(1) + ' g, getter only, the app held up for 300 ms at 15 km/h (the read in flight comes back late): ' + out.quarter + ' of 100 runs reach the 1/4 mile, ' +
            out.jump + ' end as a "jump", ' + out.over + ' splits wrong by more than their +-. WAS: 10 of the 100 ended as a "jump": the step test did not allow for the long round trip of that read');

        // clean data stays clean: nothing taken out, nothing added to the +-
        let dirty = 0, nruns = 0;
        for (const car of fleet().slice(0, 40)) {
            for (const spacing of SPACINGS) {
                const x = timeRun(car, { spacing, phase: 0.61 * spacing, onChange: true }, { onChange: true }).sum;
                nruns++;
                if (x.merged || x.holeMs >= 300 || x.jumps || x.launch.late !== false || x.launch.tickLate !== null || x.launch.uneven !== 0) dirty++;
            }
        }
        ok(dirty === 0, 'on ' + nruns + ' clean runs (40 cars, 20 to 200 ms spacing) no sample is taken out as late, no launch is marked late or uneven, and nothing that would raise DATA GAP or SPEED JUMP is recorded');
        // two moving samples, then two seconds without a change, then on: a silence is not a late stamp
        const e2 = new RunEngine({ onChange: true });
        e2.feed(0, 0);
        for (let x = 50; x <= 1500; x += 50) e2.idle(x);
        e2.feed(1510, 1.1); e2.feed(1610, 2.9);
        for (let x = 1650; x <= 3600; x += 50) e2.idle(x);
        for (let k = 0; k < 40; k++) { e2.feed(3650 + k * 100, 2.9 + (k + 1) * 1.8); e2.idle(3700 + k * 100); }
        const s2 = e2.summary();
        ok(s2.launch.n === 2 && s2.launch.uneven === 0 && s2.launch.apart < 10 && s2.results['60ft'].pm <= 0.06, 'two moving samples 100 ms apart, then 2 s at one speed, then on: that silence is not taken for a stamp that was late (nothing added to the +-: ' +
            s2.results['60ft'].pm.toFixed(2) + ' s on the 60 ft)');
        const d = Feed.describeRun(drive(new RunEngine({ onChange: true }), held(sim.sample(slower, { spacing: 100, phase: 20, onChange: true, clock0: C0 }), C0 - 30, 300)));
        ok(/LAUNCH SEEN LATE/.test(d) && /stamped late and replaced by the next/.test(d), 'the run\'s log line says when a launch was seen late and how many samples were taken out as stamped late');
    });

    /* ================= what the check after the final check found (each check here failed on the code as that check saw it, unless it says "still") ================= */
    await ok.part('second check: a reading that is too high for a moment, right after a late stamp or a hold-up, makes up no 0-100', async () => {
        const gears = (list) => list.map((v) => ({ v: v / 3.6, dur: 0.15, cut: 1 }));
        const quick = new sim.Truth({ a0: 12.4, vTop: 85, ramp: 0.08, shifts: gears([65, 110, 160]) });
        const slower = new sim.Truth({ a0: 8.6, vTop: 38, ramp: 0.12, shifts: gears([55, 95]) });
        const CARS = [['quick car', quick], ['slower car', slower]];
        // the app held up from `from` for `ms`: what arrived in that time is handled, and stamped, when it is over, in order
        const held = (list, from, ms) => { let free = from + ms; return list.map((p) => { if (p.t < from || p.t >= free) return p; const t = free; free = t + 0.05; return { t, v: p.v }; }); };
        // one notification stamped late by `ms` (the ones behind it keep their order)
        const lateOne = (list, k, ms) => { let free = -Infinity; return list.map((p, j) => { let t = j === k ? p.t + ms : p.t; if (t < free) t = free; if (t !== p.t) free = t + 0.05; return t === p.t ? p : { t, v: p.v }; }); };
        const wrong = (s, truth) => !!s.results['0-100'] && Math.abs(s.results['0-100'].s - truth['0-100'].s) > s.results['0-100'].pm + 1e-9;

        // the plain cases first, on the slower car and a 100 ms notifier: one or two samples 10 km/h too high from 93 km/h on
        const tr = slower.answers('slip', 'kmh'), t93 = C0 + slower.tAtV(93 / 3.6) * 1000;
        const N100 = sim.sample(slower, { spacing: 100, phase: 37, onChange: true, clock0: C0 }), k93 = N100.findIndex((p) => p.t >= t93);
        const high = (list, k, n, by) => list.map((p, j) => (j >= k && j < k + n ? { t: p.t, v: p.v + by } : p));
        let s = sim.drive(new RunEngine({ onChange: true }), high(N100, k93, 2, 10));
        ok(s.ended === 'jump' && !s.results['0-100'], 'two samples 10 km/h too high at 93 km/h, nothing late: still ended by "jump" with no 0-100');
        s = sim.drive(new RunEngine({ onChange: true }), lateOne(high(N100, k93, 2, 10), k93 - 1, 60));
        ok(s.ended === 'jump' && !s.results['0-100'] && s.vmax < 93.5, 'the same two samples right after a notification that was stamped 60 ms late: ended by "jump" at the sample before the late one, NO 0-100. ' +
            'WAS: the late sample was taken out and the first high one judged from the sample before it, over two slots: no step. The run showed a 0-100 0.92 s short (+-0.23), ended as a lift, carried no flag and could set a best');
        s = sim.drive(new RunEngine({ onChange: true }), lateOne(high(N100, k93, 1, 10), k93 - 1, 60));
        ok(s.ended === 'quarter' && s.dropped === 1 && !wrong(s, tr) && Math.abs(s.results['0-100'].s - tr['0-100'].s) < 0.02 && s.holeMs === 300, 'ONE such sample after the late stamp: dropped as a glitch, the run goes on to the 1/4 mile, 0-100 ' +
            ms1(s.results['0-100'].s - tr['0-100'].s) + ' ms off (the late sample and the high one both taken out: a hole of ' + s.holeMs + ' ms, DATA GAP). WAS: taken as the car passing 100 km/h, 0-100 0.92 s short (+-0.08), no flag');
        s = sim.drive(new RunEngine({ onChange: true }), high(held(N100, N100[k93].t - 170, 150), k93, 2, 10));
        ok(s.ended === 'jump' && !s.results['0-100'], 'the two high samples right after the app was held up for 150 ms: ended by "jump", NO 0-100. WAS: a 0-100 0.92 s short (+-0.23), no flag');

        // the same at random: 20, 50 and 100 ms notifier, both cars, the reading 10 km/h too high for one or two samples from 93 km/h on,
        // right after one notification stamped 0.6 slot late, or after an app hold-up of 150 or 300 ms that ends just before it
        console.log('  M. a reading 10 km/h too high for one or two samples from 93 km/h on, 20 launches a cell: launches with a 0-100 beyond its +-');
        const tally = { n: 0, made: 0 }, rows = [];
        for (const pre of ['a notification 0.6 slot late', 'the app held up 150 ms', 'the app held up 300 ms']) {
            for (const spacing of [20, 50, 100]) {
                let made = 0, n = 0, jumps = 0, quarters = 0;
                for (const [, car] of CARS) {
                    const truth = car.answers('slip', 'kmh'), rand = sim.rng(9100 + spacing + pre.length), tw = C0 + car.tAtV(93 / 3.6) * 1000;
                    for (let i = 0; i < 20; i++) {
                        let list = sim.sample(car, { spacing, phase: rand() * spacing, onChange: true, clock0: C0 });
                        const k = list.findIndex((p) => p.t >= tw);
                        list = high(list, k, 1 + (i % 2), 10);
                        if (/late/.test(pre)) list = lateOne(list, k - 1, 0.6 * spacing); else { const ms = /150/.test(pre) ? 150 : 300; list = held(list, list[k].t - ms - rand() * spacing, ms); }
                        const x = sim.drive(new RunEngine({ onChange: true }), list, { idlePhase: Math.floor(rand() * 50) });
                        n++;
                        if (!x) continue;
                        if (wrong(x, truth)) made++;
                        if (x.ended === 'jump') jumps++; else if (x.results.quarter) quarters++;
                    }
                }
                rows.push(pre + ', ' + spacing + ' ms: ' + made + ' of ' + n + ' (' + jumps + ' ended as a jump, ' + quarters + ' reached the 1/4 mile)');
                tally.n += n; tally.made += made;
            }
        }
        rows.forEach((x) => console.log('    ' + x));
        ok(tally.made === 0, 'a reading 10 km/h too high for one or two samples from 93 km/h on, right after a notification stamped 0.6 slot late or an app hold-up of 150 or 300 ms (notifier every 20, 50, 100 ms, both cars): ' +
            tally.made + ' of ' + tally.n + ' launches show a 0-100 beyond its +-. WAS: 240 of the 360');

        // the polled series, nothing late: a reading 6 km/h too high for 220 ms on a getter that answers in 25 ms
        const out = { n: 0, made: 0, jump: 0 };
        for (const [, car] of CARS) {
            const truth = car.answers('slip', 'kmh'), rand = sim.rng(9321), tw = C0 + car.tAtV(93 / 3.6) * 1000;
            for (let i = 0; i < 60; i++) {
                const P = sim.samplePolled(car, { phase: rand() * 50, rand, clock0: C0 }).map((p) => (p.t >= tw && p.t < tw + 220 ? { t: p.t, v: p.v + 6, took: p.took } : p));
                const x = sim.drive(new RunEngine({ onChange: false }), P, { idlePhase: Math.floor(rand() * 50) });
                out.n++;
                if (x && wrong(x, truth)) out.made++;
                if (x && x.ended === 'jump') out.jump++;
            }
        }
        // This was closed for a while by a second, stricter look at a polled step. The third check found that look ending clean runs of
        // quick cars as a "jump" (the part "third check" below), and it was taken out again. So this is open as it was before it.
        ok(out.made === KNOWN_GETTER_6 && out.n === 120, 'NOT SOLVED (README, "Known from the PC and not solved"): a getter that answers in 25 ms reads 6 km/h too high for 220 ms from 93 km/h on (nothing late): ' + out.made + ' of ' + out.n +
            ' launches show a 0-100 beyond its +- (' + out.jump + ' ended as a "jump"). The step test allows for half of both round trips on every pair of reads, so a step of up to about 6.7 km/h passes');
        // ... and the quick cars the allowance was made for still reach the line
        const hard = new sim.Truth({ a0: 15.5, vTop: 95, ramp: 0.06, shifts: gears([70, 120, 170]) }), th = hard.answers('slip', 'kmh');
        const clean = { n: 0, quarter: 0, jump: 0, over: 0 }, rnd = sim.rng(9444);
        for (let i = 0; i < 200; i++) {
            const x = sim.drive(new RunEngine({ onChange: false }), sim.samplePolled(hard, { phase: rnd() * 50, rand: rnd, clock0: C0 }), { idlePhase: Math.floor(rnd() * 50) });
            clean.n++;
            if (x && x.results.quarter) clean.quarter++;
            if (x && x.ended === 'jump') clean.jump++;
            if (x) for (const k of SPLITS) if (x.results[k] && Math.abs(x.results[k].s - th[k].s) > x.results[k].pm + 1e-9) clean.over++;
        }
        ok(clean.quarter === clean.n && clean.jump === 0 && clean.over === 0, 'still: a car that pulls ' + (15.5 / 9.80665).toFixed(1) + ' g on that getter, clean data: ' + clean.quarter + ' of ' + clean.n + ' runs reach the 1/4 mile, ' +
            clean.jump + ' end as a "jump", ' + clean.over + ' splits beyond their +-');
        // samples that do not arrive in the order they were sent: there the reading of a sample that was taken out says nothing about
        // the next one. Four samples of the quick car at 40 km/h wait and are handed over together, the oldest one LAST.
        const Q100 = sim.sample(quick, { spacing: 100, phase: 37, onChange: true, clock0: C0 }), kq = Q100.findIndex((p) => p.t >= C0 + quick.tAtV(40 / 3.6) * 1000);
        const T = Q100[kq + 3].t + 30, order = [kq + 1, kq + 2, kq + 3, kq];
        const mixed = Q100.slice(0, kq).concat(order.map((j, i) => ({ t: T + i * 0.05, v: Q100[j].v })), Q100.slice(kq + 4));
        s = sim.drive(new RunEngine({ onChange: true }), mixed);
        const tq = quick.answers('slip', 'kmh');
        ok(s.ended === 'quarter' && s.disorder === true && s.jumps === 0 && Math.abs(s.results.quarter.s - tq.quarter.s) <= s.results.quarter.pm && /A SAMPLE READ FAR LOWER THAN THE ONE RIGHT BEFORE IT, OR ITS STAMP DID NOT RUN FORWARD \(out of order, or a wrong reading\)/.test(Feed.describeRun(s)),
            'four samples that waited are handed over with the oldest one last (the quick car at 40 km/h): the engine sees that they are out of order, the run is not ended as a "jump" by the fresh sample that follows the old one, ' +
            'and its log line says A SAMPLE READ FAR LOWER THAN THE ONE RIGHT BEFORE IT (1/4 mile ' + ms1(s.results.quarter.s - tq.quarter.s) + ' ms off, +-' + s.results.quarter.pm.toFixed(2) + ' s)');
        s = sim.drive(new RunEngine({ onChange: true }), N100);
        ok(s.disorder === false && !/FAR LOWER|OUT OF ORDER/i.test(Feed.describeRun(s)), 'a clean run is not marked so');
    });

    await ok.part('second check: the polled series with the app held up at the launch (the read in flight comes back late)', async () => {
        const gears = (list) => list.map((v) => ({ v: v / 3.6, dur: 0.15, cut: 1 }));
        const quick = new sim.Truth({ a0: 12.4, vTop: 85, ramp: 0.08, shifts: gears([65, 110, 160]) });
        const slower = new sim.Truth({ a0: 8.6, vTop: 38, ramp: 0.12, shifts: gears([55, 95]) });
        const gentle = new sim.Truth({ a0: 4.4, vTop: 60, ramp: 0.25, shifts: gears([50, 90]) });
        const CARS = [['quick car', quick], ['slower car', slower], ['gentle car', gentle]];
        // The getter as the app reads it, with the app held up from `from` for `ms`: no read is started in that time, and the read
        // that was in flight is answered when it is over (stamped at the middle of its long round trip, as the scheduler does).
        const polled = (car, rand, from, ms) => {
            const P = [];
            for (const p of sim.samplePolled(car, { phase: rand() * 50, rand, clock0: C0 })) {
                const t1 = p.t - p.took / 2, t2 = p.t + p.took / 2;
                if (t1 >= from && t1 < from + ms) continue;
                if (t1 < from && t2 >= from) P.push({ t: (t1 + from + ms) / 2, v: p.v, took: from + ms - t1, arrive: from + ms }); else P.push({ t: p.t, v: p.v, took: p.took, arrive: t2 });
            }
            return P;
        };
        const notified = (car, rand, from, ms) => { let free = from + ms; return sim.sample(car, { spacing: 100, phase: rand() * 100, onChange: true, clock0: C0 }).map((p) => { if (p.t < from || p.t >= free) return p; const t = free; free = t + 0.05; return { t, v: p.v }; }); };
        // Hand both series to something with notified() / polled() / idle(), in the order they arrive. The app's 50 ms tick does not
        // run during the hold-up and comes once, late, when it is over (before or after what waited).
        const drive = (target, n, p, o) => {
            const ev = (n || []).map((x) => ({ at: x.t, k: 'n', x })).concat((p || []).map((x) => ({ at: x.arrive, k: 'p', x }))).sort((a, b) => a.at - b.at);
            const end = ev[ev.length - 1].at + 2500, to = o.from + o.ms, lateTick = to + (o.first ? 0.01 : 0.9);
            let tick = Math.floor(ev[0].at / 50) * 50 + o.phase, i = 0, lateDone = false;
            for (;;) {
                const at = i < ev.length ? ev[i].at : Infinity;
                if (!lateDone && lateTick <= Math.min(at, tick)) { target.idle(lateTick); lateDone = true; continue; }
                if (at <= tick) { const e = ev[i++]; if (e.k === 'n') target.notified(e.x.t, e.x.v); else target.polled(e.x.t, e.x.v, e.x.took); continue; }
                if (tick > end) break;
                if (tick < o.from || tick >= to + 1) target.idle(tick);
                tick += 50;
            }
        };
        console.log('  N. the app held up once, beginning 100 ms before to 300 ms after the car moves, 25 launches a cell and car: runs with a split beyond its +- (worst by, ms) / mean +- of the 0-100 (ms)');
        for (const both of [false, true]) {
            const all = { n: 0, quarter: 0, jump: 0, runs: 0, worst: 0, taken: { notified: 0, polled: 0 } }, line = [];
            for (const ms of [150, 200, 250, 300]) {
                let wrongRuns = 0, worst = 0, pm = 0, npm = 0;
                for (const [, car] of CARS) {
                    const truth = car.answers('slip', 'kmh'), rand = sim.rng(9500 + ms + (both ? 7 : 0));
                    for (let i = 0; i < 25; i++) {
                        const from = C0 + car.tMove * 1000 - 100 + rand() * 400, o = { from, ms, first: i % 2 === 0, phase: Math.floor(rand() * 50) };
                        let sum = null, chosen = 'polled';
                        if (both) {
                            let run = null;
                            const tw = new Feed.TwoSeries({ onRun: (r) => { if (!run) run = r; } });
                            drive(tw, notified(car, rand, from, ms), polled(car, rand, from, ms), o);
                            sum = run && run.chosen ? run.summary : null; chosen = run && run.chosen;
                        } else {
                            const eng = new RunEngine({ onChange: false, onDone: (x) => { if (!sum) sum = x; } });
                            drive({ notified: () => {}, polled: (t, v, took) => eng.feed(t, v, took), idle: (now) => eng.idle(now) }, null, polled(car, rand, from, ms), o);
                        }
                        all.n++;
                        if (!sum) continue;
                        if (sum.ended === 'jump') all.jump++;
                        if (sum.results.quarter) all.quarter++;
                        if (chosen) all.taken[chosen]++;
                        let ex = 0;
                        for (const k of SPLITS) { const r = sum.results[k]; if (r) ex = Math.max(ex, Math.abs(r.s - truth[k].s) - r.pm); }
                        if (ex > 1e-9) { wrongRuns++; worst = Math.max(worst, ex); }
                        if (sum.results['0-100']) { pm += sum.results['0-100'].pm; npm++; }
                    }
                }
                all.runs += wrongRuns; all.worst = Math.max(all.worst, worst);
                line.push(ms + ' ms: ' + wrongRuns + (wrongRuns ? ' (' + (worst * 1000).toFixed(0) + ')' : '') + ' / ' + (npm ? (pm / npm * 1000).toFixed(0) : '-'));
            }
            console.log('    ' + (both ? 'notifier every 100 ms and getter' : 'getter only                    ') + ':  ' + line.join('   '));
            ok(all.quarter === all.n && all.jump === 0, (both ? 'a notifier every 100 ms and the getter together' : 'the getter alone') + ', the app held up for 150, 200, 250 or 300 ms around the launch, three cars: ' + all.quarter + ' of ' + all.n +
                ' launches are timed to the 1/4 mile, ' + all.jump + ' end as a "jump"' + (both ? ' (' + all.taken.polled + ' taken from the getter, ' + all.taken.notified + ' from the notifier)' : ''));
            ok(all.runs === 0, 'runs of those with a split beyond its +-: ' + all.runs + (all.runs ? ' (worst by ' + (all.worst * 1000).toFixed(0) + ' ms)' : '') + '. WAS: ' + (both ? '48 of the 300 (worst by 80 ms)' : '59 of the 300 (worst by 57 ms)') +
                ': the read that was in flight came back when the hold-up was over and was stamped at the middle of its long round trip, the launch (or the first foot) was placed with it, and only half the USUAL round trip was in the +-');
        }
        // what the engine says of such a run, and what a clean one keeps
        const rand = sim.rng(9601);
        let marked = 0, most = null;
        for (let i = 0; i < 40; i++) {
            const from = C0 + slower.tMove * 1000 - 60 + rand() * 60;
            let sum = null;
            const eng = new RunEngine({ onChange: false, onDone: (x) => { if (!sum) sum = x; } });
            drive({ notified: () => {}, polled: (t, v, took) => eng.feed(t, v, took), idle: (now) => eng.idle(now) }, null, polled(slower, rand, from, 250), { from, ms: 250, first: i % 2 === 0, phase: Math.floor(rand() * 50) });
            if (sum && sum.launch.tookLate > 0) { marked++; if (!most || sum.launch.tookLate > most.launch.tookLate) most = sum; }
        }
        ok(marked >= 10 && !!most && most.launch.tookLate > 80 && /a getter read at the launch took far longer than usual \(its stamp may be \d+ ms off\)/.test(Feed.describeRun(most)), 'a hold-up of 250 ms that begins up to 60 ms before the slower car moves, 40 launches: in ' + marked +
            ' a read was in flight and the launch was placed with it. The launch record says how far its stamp may be off (up to ' + (most ? most.launch.tookLate : '-') + ' ms), and the log line says so');
        let dirty = 0, n = 0;
        for (const car of fleet().slice(0, 40)) {
            const x = sim.drive(new RunEngine({ onChange: false }), sim.samplePolled(car, { phase: 17, rand: sim.rng(9700 + n), clock0: C0 }));
            n++;
            if (!x || (x.launch.tookLate || 0) !== 0 || x.disorder || x.jumps || x.dropped) dirty++;
        }
        ok(dirty === 0, 'still: on ' + n + ' clean polled runs (reads of 25 ms, give or take 10) no read counts as far longer than usual, nothing is dropped and nothing is added to the +-');
    });

    /* ================= what the third check found: the check of the fixes for the second one ================= */
    await ok.part('third check: clean launches of quick cars that the fix before lost, and what is left open (each check failed on the code as that check saw it, unless it says "still" or NOT SOLVED)', async () => {
        const gears = (list, dur, kick, kickDur) => list.map((v) => ({ v: v / 3.6, dur, cut: 1, kick, kickDur }));
        // the most a car gains over any 20 ms, as g
        const most = (car) => { let m = 0; for (let t = 0; t < 8; t += 0.001) m = Math.max(m, (car.vAt(t + 0.02) - car.vAt(t)) / 0.02); return (m / 9.80665).toFixed(1); };
        const lost = (x) => !x || !x.results.quarter;
        const over = (x, truth) => (x ? SPLITS.filter((k) => x.results[k] && Math.abs(x.results[k].s - truth[k].s) > x.results[k].pm + 1e-9).length : 0);

        // 1. The speed can only be ASKED FOR, and an answer takes 40 or 60 ms instead of 25. Two cars whose torque comes back hard after a
        // gear change: one launches at 1.2 g and pulls 1.5 times as hard for 120 ms after each change of 150 ms, one launches at 1.5 g and
        // pulls 1.6 times as hard for 100 ms after each change of 80 ms. Clean data: nothing late, nothing wrong, no hold-up.
        const k12 = new sim.Truth({ a0: 11.8, vTop: 85, ramp: 0.08, shifts: gears([65, 110, 160], 0.15, 1.5, 0.12) });
        const k15 = new sim.Truth({ a0: 14.7, vTop: 65, ramp: 0.04, shifts: gears([70, 120], 0.08, 1.6, 0.1) });
        console.log('  P. clean launches, the getter alone, 150 a cell: timed to the 1/4 mile / ended as a "jump" / splits beyond their +-');
        const g = { n: 0, quarter: 0, jump: 0, over: 0 };
        for (const [name, car] of [['launch 1.2 g, most ' + most(k12) + ' g', k12], ['launch 1.5 g, most ' + most(k15) + ' g', k15]]) {
            const truth = car.answers('slip', 'kmh'), line = [];
            for (const [rt, rtJitter] of [[40, 15], [60, 20]]) {
                const rand = sim.rng(9800 + rt), c = { quarter: 0, jump: 0, over: 0 };
                for (let i = 0; i < 150; i++) {
                    const x = sim.drive(new RunEngine({ onChange: false }), sim.samplePolled(car, { phase: rand() * 50, rand, rt, rtJitter, clock0: C0 }), { idlePhase: Math.floor(rand() * 50) });
                    g.n++;
                    if (!lost(x)) c.quarter++;
                    if (x && x.ended === 'jump') c.jump++;
                    c.over += over(x, truth);
                }
                g.quarter += c.quarter; g.jump += c.jump; g.over += c.over;
                line.push('answers of ' + rt + ' ms give or take ' + rtJitter + ': ' + c.quarter + ' / ' + c.jump + ' / ' + c.over);
            }
            console.log('    ' + name.padEnd(30) + line.join('     '));
        }
        ok(g.quarter === g.n && g.jump === 0, 'two quick cars whose torque comes back hard after a gear change, timed from the getter alone with answers of 40 or 60 ms, clean data: ' + g.quarter + ' of ' + g.n +
            ' launches are timed to the 1/4 mile, ' + g.jump + ' end as a "jump". WAS: ' + WAS_GETTER_JUMPS + ' of the 600 ended as a "jump" at the first sample after a gear change, with no later split: a second look at a polled step ' +
            '(over the stamps alone, against twice what the car had gained over its last three steps) took the torque coming back for a wrong reading. That look is out again');
        ok(g.over === 0, 'still: ' + g.over + ' splits of those runs beyond their +-');

        // 2. The speed is only SENT, every 20 or 10 ms, and each stamp is late by up to 15 ms (every 20 ms) or 8 ms (every 10 ms), in order. Plain cars that
        // launch at 1.5 and 1.7 g. Clean data. The signal in its own steps of 1/64 km/h, and in steps of 0.5 km/h.
        const p15 = new sim.Truth({ a0: 14.7, vTop: 65, ramp: 0.04, shifts: gears([70, 120], 0.08) });
        const p17 = new sim.Truth({ a0: 16.7, vTop: 70, ramp: 0.03, shifts: gears([75, 125], 0.06) });
        console.log('  Q. clean launches, the notifier alone, every stamp late by up to 15 ms (every 20 ms) or 8 ms (every 10 ms), 300 a cell: launches lost (no run, or not timed to the 1/4 mile)');
        const nn = { n: 0, lost: 0, none: 0, over: 0 };
        for (const [name, car] of [['launch 1.5 g', p15], ['launch 1.7 g', p17]]) {
            const truth = car.answers('slip', 'kmh'), line = [];
            for (const [spacing, jitter, quantum] of [[20, 15, 1 / 64], [20, 15, 0.5], [10, 8, 1 / 64]]) {
                const rand = sim.rng(9900 + spacing + Math.round(quantum * 64));
                let l = 0;
                for (let i = 0; i < 300; i++) {
                    const x = sim.drive(new RunEngine({ onChange: true }), sim.sample(car, { spacing, phase: rand() * spacing, onChange: true, jitter, quantum, rand, clock0: C0 }), { idlePhase: Math.floor(rand() * 50) });
                    nn.n++;
                    if (lost(x)) { l++; if (!x) nn.none++; }
                    nn.over += over(x, truth);
                }
                nn.lost += l;
                line.push('every ' + spacing + ' ms, steps of ' + (quantum < 0.1 ? '1/64' : quantum) + ' km/h: ' + l);
            }
            console.log('    ' + name.padEnd(14) + line.join('     '));
        }
        ok(nn.lost === 0, 'two quick cars timed from the notifier alone, every 20 ms with each stamp up to 15 ms late and every 10 ms with each stamp up to 8 ms late, clean data: ' + nn.lost + ' of ' + nn.n + ' launches lost (' + nn.none + ' with no run at all). WAS: ' + WAS_NOTIFIER_LOST +
            ' of the 1800 (' + WAS_NOTIFIER_NONE + ' with no run at all, the rest ended as a "jump"): the sample that replaced a late one was judged against that one\'s reading over the send slot "as far as it is known", ' +
            'which early in a run came out at about half the real slot. One slot\'s real gain then read as a step of more than 25 m/s2. That test now has the 20 ms floor the plain step test has');

        // 3. NOT SOLVED, and said so in the README. A reading that is too high makes up a 0-100 where the engine has to judge it over a longer
        // time than one send slot: (a) the first wrong sample is itself stamped late, (b) the wrong reading begins while the app is held up.
        // The slower car of the part above, the reading 6 or 10 km/h too high for 220 ms from 93 km/h on, 20 launches a cell.
        const slower = new sim.Truth({ a0: 8.6, vTop: 38, ramp: 0.12, shifts: gears([55, 95], 0.15) }), ts = slower.answers('slip', 'kmh');
        const made = (x) => !!x && !!x.results['0-100'] && Math.abs(x.results['0-100'].s - ts['0-100'].s) > x.results['0-100'].pm + 1e-9;
        const held = (list, from, ms) => { let free = from + ms; return list.map((p) => { if (p.t < from || p.t >= free) return p; const t = free; free = t + 0.05; return { t, v: p.v }; }); };
        const lateOne = (list, k, ms) => { let free = -Infinity; return list.map((p, j) => { let t = j === k ? p.t + ms : p.t; if (t < free) t = free; if (t !== p.t) free = t + 0.05; return t === p.t ? p : { t, v: p.v }; }); };
        const tw = C0 + slower.tAtV(93 / 3.6) * 1000;
        console.log('  R. NOT SOLVED: a reading too high for 220 ms from 93 km/h on, the notifier alone, 20 launches a cell: launches with a 0-100 beyond its +-');
        const open = [];
        for (const pre of ['its first sample is itself stamped 0.6 slot late', 'it begins while the app is held up for 150 ms']) {
            for (const by of [6, 10]) {
                const line = [];
                let sum = 0;
                for (const spacing of [20, 50, 100]) {
                    const rand = sim.rng(9950 + spacing + pre.length + by);
                    let m = 0;
                    for (let i = 0; i < 20; i++) {
                        let list = sim.sample(slower, { spacing, phase: rand() * spacing, onChange: true, clock0: C0 }).map((p) => (p.t >= tw && p.t < tw + 220 ? { t: p.t, v: p.v + by } : p));
                        if (/stamped/.test(pre)) list = lateOne(list, list.findIndex((p) => p.t >= tw), 0.6 * spacing); else list = held(list, tw - rand() * 150, 150);
                        if (made(sim.drive(new RunEngine({ onChange: true }), list, { idlePhase: Math.floor(rand() * 50) }))) m++;
                    }
                    sum += m;
                    line.push('every ' + spacing + ' ms: ' + String(m).padStart(2));
                }
                open.push(sum);
                console.log('    ' + (by + ' km/h too high, ' + pre).padEnd(68) + line.join('     ') + '     together ' + sum + ' of 60');
            }
        }
        ok(open.join(' ') === KNOWN_HIGH_OPEN.join(' '), 'NOT SOLVED (README, "Known from the PC and not solved"): a reading too high for 220 ms from 93 km/h on, the speed sent every 20, 50 or 100 ms, 60 launches each. ' +
            'Its first sample is itself stamped 0.6 slot late: ' + open[0] + ' launches with 6 km/h and ' + open[1] + ' with 10 km/h show a 0-100 beyond its +-. It begins while the app is held up for 150 ms: ' + open[2] +
            ' with 6 km/h and ' + open[3] + ' with 10 km/h. There it is judged from the last sample before it, over that longer time, and is no step');
        // ... and what such a run's log line says: the mark is set by a wrong reading next to a late stamp too
        const N100 = sim.sample(slower, { spacing: 100, phase: 37, onChange: true, clock0: C0 }), k60 = N100.findIndex((p) => p.t >= C0 + slower.tAtV(60 / 3.6) * 1000);
        const low = lateOne(N100.map((p, j) => (j === k60 ? { t: p.t, v: p.v - 10 } : p)), k60 - 1, 60);
        const sl = sim.drive(new RunEngine({ onChange: true }), low);
        ok(!!sl && sl.disorder === true && /A SAMPLE READ FAR LOWER THAN THE ONE RIGHT BEFORE IT, OR ITS STAMP DID NOT RUN FORWARD \(out of order, or a wrong reading\)/.test(Feed.describeRun(sl)) && !/SAMPLES OUT OF ORDER/.test(Feed.describeRun(sl)),
            'one sample 10 km/h too LOW right after a notification stamped 60 ms late, every sample handed over in order: the run gets the mark (disorder), and its log line says what was seen, ' +
            '"A SAMPLE READ FAR LOWER THAN THE ONE RIGHT BEFORE IT, OR ITS STAMP DID NOT RUN FORWARD (out of order, or a wrong reading)". WAS: "SAMPLES OUT OF ORDER", although none was');
    });

    await ok.part('review, the +- figure: a gear change at 100 km/h, getter reads that take long, peak g on a polled series', async () => {
        // a gear change (no torque for 150 ms) that begins just after the car passes 100 km/h; with cut 1.06 the car loses a little speed in it
        const at = (v, cut) => new sim.Truth({ a0: 7.5, vTop: 80, ramp: 0.1, shifts: [{ v: 50 / 3.6, dur: 0.15, cut: 0.9 }, { v: v / 3.6, dur: 0.15, cut }] });
        console.log('  K. a gear change beginning at 100.1 km/h (or ending at 100): 0-100 km/h, 200 launches each');
        const res = {};
        for (const [name, car] of [['flat', at(100.1, 1)], ['falls back', at(100.1, 1.06)], ['ends at 100', at(99.9, 1)]]) {
            for (const spacing of [50, 100, 200]) {
                const rand = sim.rng(4100 + spacing), truth = car.answers('slip', 'kmh')['0-100'].s, errs = [];
                let covered = 0;
                for (let i = 0; i < 200; i++) {
                    const r = timeRun(car, { spacing, phase: rand() * spacing, onChange: true }, { onChange: true }, { idlePhase: Math.floor(rand() * 50) }).sum.results['0-100'];
                    errs.push(r.s - truth);
                    if (Math.abs(r.s - truth) <= r.pm + 1e-9) covered++;
                }
                res[name + spacing] = { cover: covered / 200, err: stats(errs) };
                console.log('    ' + name.padEnd(12) + pad(spacing, 4) + ' ms: mean ' + ms1(res[name + spacing].err.mean) + ' ms, worst ' + ms1(res[name + spacing].err.worst) + ' ms, the +- covers ' + Math.round(covered / 2) + ' %');
            }
        }
        ok(Object.keys(res).every((k) => res[k].cover >= 0.95), 'a gear change that begins at 100.1 km/h or ends at 100 km/h: the +- of the 0-100 covers the error in at least 95 % of launches at 50, 100 and 200 ms (least ' +
            Math.round(Math.min.apply(null, Object.keys(res).map((k) => res[k].cover)) * 100) + ' %). WAS: 61 to 65 % at 100 and 200 ms, because the crossing was taken as a straight share of a step that had a kink in it and the +- allowed a quarter of the step');
        // getter reads that take 100 ms, the value read somewhere in that time
        const cars = fleet().slice(0, 100), rand = sim.rng(606);
        let covered = 0, n = 0, pmWith = 0, pmWithout = 0;
        for (const car of cars) {
            const smp = sim.samplePolled(car, { rt: 100, rtJitter: 40, phase: rand() * 50, rand, clock0: C0 }), truth = car.answers('slip', 'kmh')['0-100'].s;
            const a = sim.drive(new RunEngine({ onChange: false }), smp), b = sim.drive(new RunEngine({ onChange: false }), smp.map((p) => ({ t: p.t, v: p.v })));
            n++; pmWith += a.results['0-100'].pm; pmWithout += b.results['0-100'].pm;
            if (Math.abs(a.results['0-100'].s - truth) <= a.results['0-100'].pm + 1e-9) covered++;
            if (car === cars[0]) ok(Math.abs(a.roundTrip - 100) < 25 && b.roundTrip === null, 'a polled run knows its getter\'s round trip (middle one ' + Math.round(a.roundTrip) + ' ms here) and says it in the summary');
        }
        ok(covered / n >= 0.95 && pmWith / n >= pmWithout / n + 0.04, 'getter reads that take 100 +- 40 ms: half the round trip is in the +- (' + (pmWith / n).toFixed(3) + ' s on average against ' + (pmWithout / n).toFixed(3) +
            ' s without it), which covers the 0-100 error in ' + Math.round(covered / n * 100) + ' % of ' + n + ' cars. WAS: the engine was not told how long a read took: 12 % outside the +- at 100 ms, 8 % at 60 ms');
        // peak g
        let high = 0, m = 0;
        for (const car of cars.slice(0, 40)) {
            const ref = timeRun(car, { spacing: 20, phase: 3, onChange: true }, { onChange: true }).sum.peakG;
            const p = sim.drive(new RunEngine({ onChange: false }), sim.samplePolled(car, { rt: 25, rtJitter: 10, phase: rand() * 50, rand, clock0: C0 })).peakG;
            high += p / ref - 1; m++;
        }
        ok(high / m < 0.03 && high / m > -0.05, 'peak g on a polled series (stamps uneven by +-10 ms): ' + (high / m * 100).toFixed(1) + ' % from the same car\'s notified series on average, taken over 500 ms. WAS: over 250 ms, 4 to 11 % high');
    });

    /* ================= feed.js ================= */
    await ok.part('how often the speed getter is read', async () => {
        const p = Feed.pollPeriod;
        const base = { speed: 80, armed: false, running: false, signalsPage: false, hidden: false, standingMs: 0 };
        const w = (o) => p(Object.assign({}, base, o));
        ok(w({}) === 500, 'driving at 80 km/h, nothing going on: every 500 ms');
        ok(w({ speed: 4 }) === 50 && w({ speed: 0, standingMs: 5000 }) === 50, 'under 5 km/h: every 50 ms');
        ok(w({ armed: true, speed: 0 }) === 50 && w({ running: true }) === 50, 'armed, or in a run: every 50 ms');
        ok(w({ signalsPage: true }) === 50, 'the Signals page showing: every 50 ms');
        ok(w({ speed: null }) === 50, 'no speed known yet: every 50 ms');
        ok(w({ speed: 0, armed: true, hidden: true, standingMs: 299000 }) === 50, 'standing for 4 min 59 s with the screen hidden: still every 50 ms');
        ok(w({ speed: 0, armed: true, hidden: true, standingMs: 300000 }) === 2000, 'standing for 5 minutes with the screen hidden: every 2 s');
        ok(w({ speed: 0, armed: true, hidden: false, standingMs: 900000 }) === 50, 'standing for 15 minutes with the screen showing: every 50 ms');
    });

    await ok.part('the poll scheduler', async () => {
        const mk = (o) => {
            const clock = fakeClock(), log = { starts: [], samples: [], misses: [], inFlight: 0, most: 0 };
            const st = Object.assign({ latency: 24, period: 50, value: 7, fail: false, never: false }, o);
            const sched = new Feed.PollScheduler({
                clock, period: () => st.period,
                read: () => {
                    const begun = clock.now();
                    log.starts.push(begun); log.inFlight++; log.most = Math.max(log.most, log.inFlight);
                    return new Promise((res, rej) => {
                        if (st.never) return;
                        clock.setTimeout(() => { log.inFlight--; if (st.fail) rej(new Error('test')); else res(st.value); }, st.latency);
                    });
                },
                onSample: (t, v, took) => log.samples.push({ t, v, took, at: clock.now() }),
                onMiss: (why, took) => log.misses.push({ why, took }),
            });
            return { clock, log, st, sched };
        };
        let x = mk();
        x.sched.start();
        await x.clock.advance(2000);
        ok(x.log.starts.length === 41 && x.log.most === 1, 'a read every 50 ms, each taking 24 ms: 41 reads in 2 s, never two in flight');
        ok(x.log.starts.every((t, i) => t === i * 50), 'each starts exactly 50 ms after the one before');
        ok(x.log.samples.length === 40 && x.log.samples.every((s, i) => s.t === i * 50 + 12 && s.v === 7 && s.took === 24), 'a sample is stamped at the middle of its round trip (12 ms after the read began, not when the answer came)');
        ok(x.sched.counts.kept === 40 && x.sched.counts.slow + x.sched.counts.failed + x.sched.counts.hung === 0, 'and counted');

        x = mk(); x.clock.late = 7;
        x.sched.start();
        await x.clock.advance(10000);
        ok(x.log.starts.length >= 199 && x.log.starts.length <= 201, 'every timer 7 ms late (a busy head unit): still ' + x.log.starts.length + ' reads in 10 s. A late timer does not slow the rate');
        const gaps = x.log.starts.slice(1).map((t, i) => t - x.log.starts[i]);
        ok(gaps.every((g) => g === 50), 'the reads stay 50 ms apart (the next is due 50 ms after the last was DUE)');

        x = mk({ latency: 80 });
        x.sched.start();
        await x.clock.advance(2000);
        ok(x.log.most === 1 && x.log.starts.length === 26 && x.log.starts.every((t, i) => t === i * 80), 'a getter that takes 80 ms: the next read starts when the answer is in (every 80 ms), never two in flight');
        x.st.latency = 10;
        const before = x.log.starts.length;
        await x.clock.advance(1000);
        ok(x.log.starts.length - before <= 21, 'when it is quick again there is no burst to catch up: ' + (x.log.starts.length - before) + ' reads in the next second');

        x = mk({ latency: 600 });
        x.sched.start();
        await x.clock.advance(590);
        x.st.latency = 20;
        await x.clock.advance(15);
        ok(x.log.samples.length === 0 && x.log.misses.length === 1 && x.log.misses[0].why === 'slow' && x.sched.counts.slow === 1, 'a read that took 600 ms is thrown away');
        await x.clock.advance(500);
        ok(x.log.samples.length >= 9, 'and the reading goes on');

        x = mk({ never: true });
        x.sched.start();
        await x.clock.advance(9000);
        ok(x.log.starts.length === 1, 'a read that is never answered: no second read is started on top of it for 9 s');
        x.st.never = false; x.log.inFlight = 0;
        await x.clock.advance(1100);
        ok(x.sched.counts.hung === 1 && x.log.misses[0].why === 'hung' && x.log.starts.length >= 2, 'after 10 s it is given up, and the reading starts again (one lost answer does not stop the feed for good)');
        await x.clock.advance(300);
        ok(x.log.samples.length >= 4 && x.log.most === 1, 'samples arrive again');

        x = mk({ fail: true });
        x.sched.start();
        await x.clock.advance(600);
        ok(x.sched.counts.failed >= 10 && x.log.samples.length === 0, 'a getter that fails every time: tried at the normal rate ten times');
        const n0 = x.log.starts.length;
        await x.clock.advance(10000);
        ok(x.log.starts.length - n0 >= 4 && x.log.starts.length - n0 <= 6, 'then only every 2 s (' + (x.log.starts.length - n0) + ' tries in 10 s)');
        x.st.fail = false;
        await x.clock.advance(2100);
        const n1 = x.log.starts.length;
        await x.clock.advance(1000);
        ok(x.log.starts.length - n1 >= 19, 'and at the normal rate again after the first answer');

        x = mk({ period: 500 });
        x.sched.start();
        await x.clock.advance(1100);
        ok(x.log.starts.length === 3, 'period 500 ms: reads at 0, 500 and 1000 ms');
        x.st.period = 50; x.sched.kick();
        await x.clock.advance(60);
        ok(x.log.starts.length >= 4 && x.log.starts[3] === 1100, 'the period drops to 50 ms (the car slowed to a stop) and kick() is called: the next read does not wait out the 500 ms');
        x.sched.stop();
        const n2 = x.log.starts.length, s2 = x.log.samples.length;
        await x.clock.advance(1000);
        ok(x.log.starts.length === n2 && x.log.samples.length === s2, 'stop(): no more reads, and an answer still under way is not handed on');
    });

    await ok.part('review, the poll scheduler: a read that runs into its time limit', async () => {
        // the app asks the car to give up a read after 1 s; whether the car's answer can still come after that is not known
        const clock = fakeClock(), starts = [];
        let answer = false;
        const sched = new Feed.PollScheduler({
            clock, period: () => 50, timeoutMs: 1000, onSample: () => {}, onMiss: () => {},
            read: () => { starts.push(clock.now()); return new Promise((res, rej) => { if (answer) clock.setTimeout(() => res(7), 25); else clock.setTimeout(() => rej(new Error('test: time limit')), 1000); }); },
        });
        sched.start();
        for (let i = 0; i < 400; i++) { await clock.advance(50); sched.kick(); }      // 20 s, the app's tick hurrying it as it does
        const gaps = starts.slice(1).map((t, i) => t - starts[i]);
        ok(starts.length >= 4 && starts.length <= 6 && gaps.every((x) => x >= 4000) && sched.counts.timedOut === sched.counts.failed, 'a getter whose reads run into the 1 s limit: the next read starts 4 s after the last one began (' + starts.length +
            ' reads in 20 s), so a car that answers late has at most one request waiting. WAS: the next read started at once (20 in 20 s), up to 4 requests unanswered at the car together');
        answer = true;
        const n0 = starts.length;
        for (let i = 0; i < 120; i++) { await clock.advance(50); sched.kick(); }       // 6 s
        const back = starts.slice(n0);
        ok(back.length >= 38 && back[back.length - 1] - back[back.length - 2] === 50, 'once the getter answers again it is read every 50 ms again (' + back.length + ' reads in the next 6 s)');
        // a read that fails AT ONCE is no time limit: it is tried again at the normal pace (and slowed after 10 in a row, as before)
        const c2 = fakeClock(), s2 = [];
        const quick = new Feed.PollScheduler({ clock: c2, period: () => 50, timeoutMs: 1000, onSample: () => {}, onMiss: () => {}, read: () => { s2.push(c2.now()); return Promise.reject(new Error('test')); } });
        quick.start();
        await c2.advance(450);
        ok(s2.length === 10 && quick.counts.timedOut === 0, 'a read that fails at once did not run into the limit: 10 tries in the first 450 ms, as before');
    });

    await ok.part('two series, two engines', async () => {
        const car = fleet()[40], truth = car.answers('slip', 'kmh');
        const N = (spacing, o) => sim.sample(car, Object.assign({ spacing, phase: 0.37 * spacing, onChange: true, delay: 30, clock0: C0 }, o));
        const P = (spacing, o) => sim.sample(car, Object.assign({ spacing, phase: 0.81 * spacing, onChange: false, delay: 12, clock0: C0 }, o));
        const two = (o) => { const runs = [], launches = []; const t = new Feed.TwoSeries(Object.assign({ onRun: (r) => runs.push(r), onLaunch: (s, t0) => launches.push(s) }, o)); t.runs = runs; t.launches = launches; return t; };

        let t = two({}), n = N(100), p = P(50);
        driveTwo(t, n, p);
        ok(t.runs.length === 1 && t.launches.length === 2, 'both series see the run: each engine says it launched, and ONE run is handed over');
        let r = t.runs[0];
        ok(r.chosen === 'polled' && /shorter median/.test(r.why) && r.both.notified.medianGap === 100 && r.both.polled.medianGap === 50, 'notifier every 100 ms, getter every 50 ms: the polled engine is taken (shorter median spacing)');
        ok(r.summary === r.both.polled && r.both.notified.series === 'notified' && r.both.polled.series === 'polled', 'the run carries both engines\' summaries, for the log');
        ok(r.both.notified.samples === n.filter((s) => s.t >= r.both.notified.tFirst && s.t <= r.both.notified.tEnd).length &&
            r.both.polled.samples === p.filter((s) => s.t >= r.both.polled.tFirst && s.t <= r.both.polled.tEnd).length, 'each engine counted its own series\' samples only: the two are never mixed');
        ok(['notified', 'polled'].every((k) => Object.keys(truth).every((s) => Math.abs(r.both[k].results[s].s - truth[s].s) < 0.03)), 'both engines are right on their own (their delays, 30 and 12 ms, are constant and cancel)');
        ok(t.live() === t.engines.polled && t.state() === 'wait', 'after the run the screen follows the engine it was taken from');
        ok(typeof Feed.describeRun(r.summary) === 'string' && SPLITS.every((k) => Feed.describeRun(r.summary).indexOf(k + ' ') >= 0) && !/undefined|NaN/.test(Feed.describeRun(r.both.notified)), 'one log line per engine names every split');
        console.log('    ' + Feed.describeRun(r.both.notified));
        console.log('    ' + Feed.describeRun(r.both.polled));

        t = two({}); driveTwo(t, N(20), P(50));
        ok(t.runs[0].chosen === 'notified', 'notifier every 20 ms, getter every 50 ms: the notified engine is taken');
        t = two({}); driveTwo(t, N(58), P(50));
        ok(t.runs[0].chosen === 'notified' && /tie/.test(t.runs[0].why), 'notifier every 58 ms against 50 ms: within 20 %, the notifier wins the tie');
        t = two({}); driveTwo(t, N(62), P(50));
        ok(t.runs[0].chosen === 'polled', 'notifier every 62 ms against 50 ms: more than 20 % slower, the polled engine is taken');

        // a notifier that never sends (the cars whose apps poll)
        t = two({}); driveTwo(t, [{ t: C0 - 3000, v: 0 }], P(50));
        ok(t.runs.length === 1 && t.runs[0].chosen === 'polled' && t.runs[0].both.notified === null && /only series/.test(t.runs[0].why), 'a notifier that sends nothing: the run comes from the polled engine alone');
        // a getter that never answers
        t = two({}); driveTwo(t, N(100), []);
        ok(t.runs.length === 1 && t.runs[0].chosen === 'notified' && t.runs[0].both.polled === null, 'a getter that never answers: the run comes from the notified engine alone');
        // the getter was on its 2 s period when the car launched
        const parked = P(50).filter((s) => s.t <= C0 - 1500 || s.t >= C0 + 400);
        t = two({}); driveTwo(t, N(100), parked);
        r = t.runs[0];
        ok(r.both.polled.launchGap > 1500 && r.both.polled.medianGap === 50 && r.chosen === 'notified' && /late/.test(r.why),
            'the getter was only read every 2 s when the car launched (launch gap ' + Math.round(r.both.polled.launchGap) + ' ms) and every 50 ms after: the notified engine is taken although its spacing is longer');
        // the notifier wakes up late: nothing for the first 0.45 s of the launch, then every 20 ms
        t = two({}); driveTwo(t, N(20).filter((s) => s.t < C0 || s.t > C0 + 450), P(50));
        r = t.runs[0];
        ok(r.both.notified.medianGap === 20 && r.both.notified.launch.early > 150 && r.chosen === 'polled' && /late/.test(r.why),
            'a notifier that says nothing for the first 0.45 s of the launch and then sends every 20 ms: the polled engine is taken, although the notifier\'s spacing is shorter');
        // the notifier dies in the middle of the run
        t = two({}); driveTwo(t, N(100).filter((s) => s.t < C0 + 2000), P(50));
        r = t.runs[0];
        ok(t.runs.length === 1 && r.chosen === 'polled' && r.both.notified && r.both.notified.ended === null && r.both.polled.ended === 'quarter',
            'the notifier stops sending 2 s into the run: the run is handed over from the polled engine once the notified one has heard nothing for 2 s');
        ok(t.engines.notified.state === 'wait' && !t.engines.notified.run, 'and the notified engine is stopped (it would have counted on for a minute)');
        ok(/NOT FINISHED/.test(Feed.describeRun(r.both.notified)) && !/undefined|NaN|null/.test(Feed.describeRun(r.both.notified)) && /ended by quarter/.test(Feed.describeRun(r.both.polled)), 'its log line says that it did not finish');
        // which engine the screen follows during a run
        t = two({});
        const nn = N(100), pp = P(50);
        let followed = null, armedAs = null;
        const all = nn.map((s) => ({ t: s.t, v: s.v, k: 'notified' })).concat(pp.map((s) => ({ t: s.t, v: s.v, k: 'polled' }))).sort((a, b) => a.t - b.t);
        let tick = all[0].t;
        for (const s of all) {
            while (tick < s.t) { t.idle(tick); tick += 50; }
            t[s.k](s.t, s.v);
            if (s.t < C0 && s.t > C0 - 500) armedAs = t.state();
            if (s.t > C0 + 3000 && s.t < C0 + 3100) followed = t.live().series;
        }
        ok(armedAs === 'ready', 'standing: READY');
        ok(followed === 'polled', 'three seconds into the run the screen follows the engine with more samples so far (the polled one)');
        // a series that is not being sent must not keep the timer armed
        const drive = (tw, from, to, v, series) => { for (let t = from; t <= to; t += 50) { tw[series || 'polled'](t, typeof v === 'function' ? v(t) : v); tw.idle(t + 7); } };
        let tw = new Feed.TwoSeries({});
        tw.notified(1000, 0);                       // (the one read the kit does itself when the car's service comes up)
        drive(tw, 1000, 4000, 0);
        ok(tw.state() === 'ready' && tw.engines.notified.state === 'ready', 'a notifier that never speaks, the getter answering: standing, both engines are armed (the notified one on its one sample from the start)');
        drive(tw, 4050, 4900, 60);
        ok(tw.engines.notified.state === 'ready' && tw.engines.polled.state === 'wait', 'the car drives off at 60 km/h by the getter: for the first second the notified engine may still believe its standstill');
        drive(tw, 4950, 9000, 60);
        ok(tw.state() === 'wait' && tw.engines.notified.state === 'wait' && tw.engines.notified.last === null, 'after a second of that it is disarmed: the app no longer says READY at 60 km/h (it did, for as long as the car drove)');
        drive(tw, 9050, 11000, 0);
        ok(tw.state() === 'ready' && tw.engines.polled.state === 'ready' && tw.engines.notified.state === 'wait', 'the car stops: armed again, on the getter\'s engine alone');
        tw.notified(11050, 0); drive(tw, 11050, 12200, 0);
        ok(tw.engines.notified.state === 'ready', 'a notifier that speaks again arms its engine as before');
        tw = new Feed.TwoSeries({});
        drive(tw, 1000, 4000, 0); tw.notified(1000.5, 0); tw.idle(4010);
        for (let t = 4100; t <= 9000; t += 100) { tw.notified(t, 50); tw.idle(t + 7); }
        ok(tw.engines.polled.state === 'wait' && tw.engines.polled.last === null && tw.state() === 'wait', 'the other way round, a getter that stops answering while the car stands and the notifier then sees it drive: the polled engine is disarmed');
        tw = new Feed.TwoSeries({});
        const carA = fleet()[10], nA = sim.sample(carA, { spacing: 100, phase: 31, onChange: true, clock0: C0, delay: 30 }), pA = sim.sample(carA, { spacing: 50, phase: 12, clock0: C0 });
        let outA = null;
        tw.o.onRun = (x) => { outA = x; };
        driveTwo(tw, nA, pA);
        ok(outA && outA.both.notified && outA.both.polled && outA.both.notified.ended && outA.both.polled.ended, 'on a car that sends both, a launch disarms nothing: both engines time the run');
        // chooseSeries on its own
        const S = (o) => Object.assign({ results: { '0-100': { s: 5 } }, launchGap: 100, medianGap: 100, quietEnd: 50, ended: 'lift', launch: { early: 0 } }, o);
        ok(Feed.chooseSeries(null, null).chosen === null, 'no run on either engine: nothing chosen');
        ok(Feed.chooseSeries(S({ results: {} }), S({ medianGap: 500 })).chosen === 'polled', 'an engine without a single split loses to one with');
        ok(Feed.chooseSeries(S({ medianGap: 20, quietEnd: 4000 }), S({ medianGap: 50 })).chosen === 'polled', 'an engine whose series went silent before the end loses to one whose series did not');
        ok(Feed.chooseSeries(S({ medianGap: 100, launchGap: 100 }), S({ medianGap: 50, launchGap: 60 })).chosen === 'polled', 'otherwise: the shorter median spacing');
    });

    await ok.part('review, which engine a run is taken from: a hole, lumps, a stale getter, two engines that do not agree', async () => {
        const car = fleet()[40], truth = car.answers('slip', 'kmh');
        const t100 = C0 + car.tAtV(100 / 3.6) * 1000, t90 = C0 + car.tAtV(90 / 3.6) * 1000;
        const N = (spacing, o) => sim.sample(car, Object.assign({ spacing, phase: 0.37 * spacing, onChange: true, delay: 30, clock0: C0 }, o));
        const P = () => sim.sample(car, { spacing: 50, phase: 40, onChange: false, delay: 12, clock0: C0 });
        const both = (n, p) => { const runs = []; const t = new Feed.TwoSeries({ onRun: (r) => runs.push(r) }); driveTwo(t, n, p); return runs[0]; };
        const off = (r, k) => Math.abs(r.summary.results[k].s - truth[k].s);
        let r = both(N(20).filter((p) => p.t < t100 - 150 || p.t > t100 + 150), P());
        ok(r.chosen === 'polled' && /hole of 3\d\d ms/.test(r.why) && off(r, '0-100') < 0.02, 'notifier every 20 ms with a hole of 300 ms around 100 km/h, getter clean: taken from the getter (' + r.why + '), 0-100 right to ' + (off(r, '0-100') * 1000).toFixed(1) +
            ' ms. WAS: the notifier was taken for its shorter median spacing, which a hole does not change, and its 0-100 was 150 ms long');
        const lump = (list, every) => { let last = -Infinity; return list.map((p) => { let t = Math.ceil(p.t / every) * every; if (t <= last) t = last + 0.01; last = t; return { t, v: p.v }; }); };
        r = both(lump(N(10), 90), P());
        ok(r.chosen === 'polled' && /shorter median/.test(r.why) && Math.abs(r.both.notified.medianGap - 90) < 1, 'notifier sent every 10 ms but delivered in lumps every 90 ms: it counts as a 90 ms series and the getter\'s 50 ms win. WAS: the lumps\' median spacing was 0.01 ms, the notifier was taken, 0-100 up to 70 ms long with +-0.01');
        r = both(N(100), P().map((p) => (p.t >= t90 && p.t <= t90 + 2000 ? { t: p.t, v: 90 } : p)));
        ok(r.chosen === 'notified' && /step no car does/.test(r.why) && off(r, '0-100') < 0.02 && off(r, 'quarter') < 0.02, 'a getter that repeats an old value for 2 s, notifier clean: taken from the notifier (' + r.why + '). WAS: the getter was taken, 0-100 0.76 s long');
        r = both(N(100), P().filter((p) => p.t < t90 || p.t > t90 + 1000));
        ok(r.chosen === 'notified' && /hole/.test(r.why), 'a getter that stops answering for 1 s in the run: taken from the notifier');
        // the rules, on summaries
        const base = { results: { a: { s: 1, pm: 0.01 } }, launchGap: 50, launch: { early: 0 }, medianGap: 50, quietEnd: 10, ended: 'quarter', jumps: 0, holeMs: 0, frozenMs: 0 };
        const mk = (o) => Object.assign({}, base, o);
        ok(Feed.chooseSeries(mk({ medianGap: 20, holeMs: 299 }), mk({})).chosen === 'notified' && Feed.chooseSeries(mk({ medianGap: 20, holeMs: 300 }), mk({})).chosen === 'polled', 'a hole counts from 300 ms');
        ok(Feed.chooseSeries(mk({ medianGap: 100 }), mk({ frozenMs: 1000 })).chosen === 'notified' && Feed.chooseSeries(mk({ medianGap: 100 }), mk({ frozenMs: 900 })).chosen === 'polled', 'one value repeated counts from 1 s');
        ok(Feed.chooseSeries(mk({ medianGap: 100 }), mk({ ended: 'jump' })).chosen === 'notified' && Feed.chooseSeries(mk({ ended: 'silent' }), mk({ medianGap: 500 })).chosen === 'polled', 'an engine that ended on a jump, or on its series stopping, loses');
        ok(Feed.chooseSeries(mk({ holeMs: 400 }), mk({ holeMs: 2000 })).bySpacing === false && Feed.chooseSeries(mk({}), mk({})).bySpacing === true, 'with a hole in both the spacing decides, and the choice is not called clean');
        // two engines that do not agree
        const lagged = sim.sample(car, { spacing: 20, phase: 7, onChange: true, lag: 150, clock0: C0 });
        r = both(lagged, P());
        const dn = r.both.notified.results['0-100'], dp = r.both.polled.results['0-100'];
        ok(r.chosen === 'notified' && r.disagree.length >= 1 && r.disagree.some((d) => d.key === '0-100') && Math.abs(dn.s - dp.s) > dn.pm + dp.pm,
            'a notifier that sends a smoothed speed (150 ms behind) and a getter that reads the true one: their 0-100 differ by ' + (Math.abs(dn.s - dp.s) * 1000).toFixed(0) + ' ms, more than their two +- together: the run says so (disagree)');
        ok(r.summary.results['0-100'].pm >= Math.abs(dn.s - dp.s) - 1e-9 && r.summary.results['0-100'].s === dn.s && r.summary.results['0-100'].pm > dn.pm, 'the time stays the chosen engine\'s and its +- is widened to that difference (+-' +
            r.summary.results['0-100'].pm.toFixed(2) + ' s, was +-' + dn.pm.toFixed(2) + '). WAS: the two times were logged side by side, each with its small +-, and nothing else');
        r = both(N(100), P());
        ok(r.disagree.length === 0 && r.summary === r.both[r.chosen], 'two clean series agree: nothing is widened');
        // how often do two CLEAN series "disagree"? (a flag that comes up on good runs would be worse than none)
        let flagged = 0, runs = 0;
        const rand = sim.rng(31337);
        for (const c of fleet().slice(0, 60)) {
            for (const spacing of [20, 100]) {
                const x = both(sim.sample(c, { spacing, phase: rand() * spacing, onChange: true, delay: 30, clock0: C0 }), sim.samplePolled(c, { phase: rand() * 50, rand, clock0: C0 }));
                runs++; if (x.disagree.length) flagged++;
            }
        }
        ok(flagged <= 0.02 * runs, 'on ' + runs + ' clean runs (notifier at 20 or 100 ms, getter with a 25 +- 10 ms round trip) the two engines "disagree" in ' + flagged + ': at most 2 %');
    });

    await ok.part('scheduler, getter, notifier and engines together, on a clock moved by hand', async () => {
        // a stand-in car: its speed at any moment, a getter that takes 25 ms (the car reads the value 8 ms in), a notifier
        const RAW = 0.015625;
        const go = async (car, o) => {
            const clock = fakeClock(), truth = car.answers('slip', 'kmh'), LAUNCH_AT = o.launchAt || 6000;
            const raw = (t) => Math.round(car.vAt((t - LAUNCH_AT) / 1000) * 3.6 / RAW);
            const runs = [], seen = { inFlight: 0, most: 0, reads: 0, periods: {} };
            const two = new Feed.TwoSeries({ onRun: (r) => runs.push(r) });
            let lastKmh = null, stoodFrom = 0;
            const sched = new Feed.PollScheduler({
                clock,
                period: () => {
                    const p = Feed.pollPeriod({ speed: lastKmh, armed: two.state() === 'ready', running: two.state() === 'run', signalsPage: false, hidden: !!o.hidden, standingMs: lastKmh === 0 ? clock.now() - stoodFrom + (o.stoodBefore || 0) : 0 });
                    seen.periods[p] = (seen.periods[p] || 0) + 1;
                    return p;
                },
                read: () => new Promise((res, rej) => {
                    if (o.getter === false) { rej(new Error('no getter')); return; }
                    seen.reads++; seen.inFlight++; seen.most = Math.max(seen.most, seen.inFlight);
                    const value = { at: clock.now() + 8 };
                    clock.setTimeout(() => { seen.inFlight--; res({ speedVehicleCentreOfGravity: raw(value.at) }); }, 25);
                }),
                onSample: (t, v) => { lastKmh = v.speedVehicleCentreOfGravity * RAW; if (lastKmh > 0) stoodFrom = clock.now(); two.polled(t, lastKmh); },
            });
            // the notifier: looks every 100 ms, sends when the value changed, 30 ms on the way
            let sent = null;
            const notify = () => {
                const v = raw(clock.now());
                if (o.notifier !== false && v !== sent) { sent = v; clock.setTimeout(() => two.notified(clock.now(), v * RAW), 30); }
                clock.setTimeout(notify, 100);
            };
            const tick = () => { two.idle(clock.now()); sched.kick(); clock.setTimeout(tick, 50); };
            clock.setTimeout(notify, 37); clock.setTimeout(tick, 11);
            sched.start();
            await clock.advance(LAUNCH_AT + car.tEnd * 1000 + 4000);
            sched.stop();
            return { runs, seen, truth, two };
        };
        const car = fleet()[60];
        let x = await go(car, {});
        let r = x.runs[0];
        ok(x.runs.length === 1 && r.both.notified && r.both.polled && r.chosen === 'polled', 'a car with a notifier (every 100 ms) and a getter: one run, timed by both engines, taken from the polled one');
        ok(x.seen.most === 1 && r.both.polled.medianGap === 50, 'the getter was read every 50 ms through the run, never twice at once');
        const worstOf = (sum, truth) => Math.max.apply(null, Object.keys(truth).map((k) => Math.abs(sum.results[k].s - truth[k].s)));
        ok(worstOf(r.both.polled, x.truth) <= 0.012 && worstOf(r.both.notified, x.truth) <= 0.035, 'both are right: the polled engine to ' + s3(worstOf(r.both.polled, x.truth)) + ', the notified one to ' + s3(worstOf(r.both.notified, x.truth)) +
            ' (the getter\'s 25 ms round trip, stamped at its middle, and the notifier\'s 30 ms are constant and cancel)');
        ok(x.seen.periods[500] > 5 && x.seen.periods[50] > 100 && !x.seen.periods[2000], 'standing and through the run the getter is on its 50 ms period, driving on afterwards on 500 ms');
        x = await go(car, { notifier: false });
        r = x.runs[0];
        ok(x.runs.length === 1 && r.chosen === 'polled' && r.both.notified === null && worstOf(r.summary, x.truth) <= 0.012, 'a car whose notifier never speaks: the run comes from the getter alone, right to ' + s3(worstOf(r.summary, x.truth)));
        x = await go(car, { getter: false });
        r = x.runs[0];
        ok(x.runs.length === 1 && r.chosen === 'notified' && r.both.polled === null && worstOf(r.summary, x.truth) <= 0.035 && x.seen.reads === 0, 'a car whose getter fails every time: the run comes from the notifier alone, right to ' + s3(worstOf(r.summary, x.truth)));
        // parked for more than 5 minutes with the screen hidden: the getter is on its 2 s period when the car launches
        x = await go(car, { hidden: true, stoodBefore: 400000, launchAt: 7000 });
        r = x.runs[0];
        ok(x.seen.periods[2000] > 0 && r && r.chosen === 'notified' && worstOf(r.summary, x.truth) <= 0.035,
            'parked for 5 minutes with the screen hidden (getter every 2 s, last read 1 s before) and then launched: the run is taken from the notifier, which saw the launch (' + r.why + ')');
        ok(r.both.polled && r.both.polled.launchGap > 500 && r.both.polled.medianGap === 50, 'the getter went back to 50 ms as soon as the notified engine was timing, but its engine saw the launch ' + Math.round(r.both.polled.launchGap) +
            ' ms after its last standing sample, and its 0-100 says +-' + r.both.polled.results['0-100'].pm.toFixed(2) + ' s');
    });

    await ok.part('is the speed changing, the acceleration fallback, per-source rates', async () => {
        const ch = new Feed.Changing();
        for (let t = 0; t <= 3000; t += 100) ch.speed(t, 50 + (t % 200 ? 0.02 : 0));
        ok(ch.now(3000) === false, 'a steady 50 km/h (flickering by one step): not changing');
        for (let t = 3100; t <= 4000; t += 100) ch.speed(t, 50 + (t - 3000) / 100);
        ok(ch.now(4000) === true, 'gaining 10 km/h a second: changing');
        ok(new Feed.Changing().now(1000) === false, 'no speed at all: not changing');

        const af = new Feed.AccelFallback();
        ok(af.period(0, true, false) === 0 && af.period(1900, true, false) === 0, 'acceleration: not polled while the notifier may still speak (1.9 s of changing speed without a notification)');
        ok(af.period(2000, true, false) === 100, 'nothing notified for 2 s while the speed changes: its getter is polled every 100 ms');
        ok(af.period(9000, false, false) === 100 && af.period(9000, false, true) === 2000, 'and stays polled when the car stands (the start slope needs it); every 2 s on a parked car with the screen hidden');
        af.notified(9100);
        ok(af.period(9200, true, false) === 0, 'a notification arrives: polling stops');
        const af2 = new Feed.AccelFallback();
        af2.period(0, true, false); af2.period(1500, false, false);
        ok(af2.period(3000, true, false) === 0, 'the 2 s only count while the speed changes');

        const m = new Feed.RateMeter('speed notified');
        let t = 0;
        for (; t < 10000; t += 50) { m.tick(t, false); if (t % 1000 === 0) m.sample(t); }
        ok(m.stats(t).rate === null && m.stats(t).n === 10 && m.report() === null, 'a source on a standing car: samples are counted, but no rate is worked out (a standing car sends nothing)');
        for (; t < 16000; t += 50) { m.tick(t, true); if (t % 100 === 0) m.sample(t); }
        let st = m.stats(t);
        ok(st.rate === 10 && st.median === 100 && st.longest === 100, 'while the speed changes it sends every 100 ms: 10 a second, median 100 ms, longest 100 ms');
        const rep = m.report();
        ok(rep && rep.rate === 10 && m.report() === null, 'after 5 s of changing speed the rate is reported once, for the log');
        for (; t < 17000; t += 50) m.tick(t, true);
        st = m.stats(t);
        ok(st.longest >= 1000 && st.age >= 1000, 'the source goes quiet while the speed changes: the longest gap grows (' + st.longest + ' ms)');
        const quiet = new Feed.RateMeter('wheels');
        for (t = 0; t < 6000; t += 50) quiet.tick(t, true);
        const q = quiet.report();
        ok(q && q.n === 0 && q.rate === null, 'a source that sent nothing in 5 s of changing speed is reported too (as silent)');
    });

    /* ================= gpsscale.js ================= */
    await ok.part('the GPS receiver\'s sentences', async () => {
        const rmc = nmea('GPRMC,123519.00,A,4807.03800,N,01131.00000,E,43.20,084.4,230326,,,A');
        const gga = nmea('GPGGA,123519.00,4807.03800,N,01131.00000,E,1,09,0.9,545.4,M,46.9,M,,');
        let p = Gps.parseNmea(rmc + '\r\n' + gga + '\r\n');
        ok(p.ok === 2 && p.bad === 0 && p.rmc.length === 1 && p.gga.length === 1, 'an RMC and a GGA sentence in one string: both read');
        ok(p.rmc[0].valid === true && Math.abs(p.rmc[0].kmh - 43.2 * 1.852) < 1e-9 && p.rmc[0].coarse === false, 'RMC: status A, 43.2 knots = ' + p.rmc[0].kmh.toFixed(2) + ' km/h over ground');
        ok(p.gga[0].quality === 1 && p.gga[0].sats === 9 && p.gga[0].hdop === 0.9 && p.gga[0].alt === 545.4, 'GGA: fix quality 1, 9 satellites, HDOP 0.9, 545.4 m');
        ok(!/4807|1131|48\.1|11\.5/.test(JSON.stringify(p)), 'the position in the sentences is not read out');
        p = Gps.parseNmea(rmc.replace('43.20', '53.20'));
        ok(p.ok === 0 && p.bad === 1 && p.rmc.length === 0, 'a sentence whose checksum is wrong is not used');
        p = Gps.parseNmea('$GPRMC,123519.00,A,4807.038,N,01131.000,E,43.20,084.4,230326,,,A');
        ok(p.bad === 1 && p.rmc.length === 0, 'nor one without a checksum');
        p = Gps.parseNmea(nmea('GNRMC,123520.00,V,,,,,,,230326,,,N'));
        ok(p.ok === 1 && p.rmc[0].valid === false && p.rmc[0].kmh === null, 'RMC with status V (no fix): read, and marked not valid');
        p = Gps.parseNmea(nmea('GNRMC,1,A,1,N,1,E,10.0,0.0,230326,,,A') + nmea('GNGGA,1,1,N,1,E,0,03,9.9,,M,,M,,') + '\n' + nmea('GPGSV,3,1,11,03,03,111,00'));
        ok(p.ok === 3 && p.other === 1 && p.rmc.length === 1 && p.gga[0].quality === 0 && p.gga[0].alt === null, 'other talkers ($GN...) and other sentences in one string: RMC and GGA are found, the rest is counted');
        ok(Gps.parseNmea(null).ok === 0 && Gps.parseNmea('garbage').ok === 0 && Gps.parseNmea(12345).ok === 0, 'nonsense in place of the string: nothing read, nothing thrown');
    });

    await ok.part('the speed scale from GPS speed (RMC)', async () => {
        const told = [];
        const g = new Gps.GpsScale({ onResult: (r) => told.push(r) });
        let t = 0;
        // the car reads 2 % high: it says 81.6 km/h at a true 80
        const cruise = (secs, carKmh, trueKmh, o) => {
            o = o || {};
            for (let i = 0; i < secs * 2; i++, t += 500) {
                g.speed(t, carKmh + (i % 2 ? 0.02 : 0));
                if (i % 2 === 0) {
                    const kn = (trueKmh * (1 + (o.noise ? (((i / 2) % 7) - 3) * o.noise : 0)) / 1.852).toFixed(3);
                    g.nmea(t + 5, (o.status === 'V' ? nmea('GPRMC,1,V,,,,,' + kn + ',1.0,230326,,,N') : (o.badSum ? nmea('GPRMC,1,A,1,N,1,E,' + kn + ',1.0,230326,,,A').replace(/.$/, 'Z') : nmea('GPRMC,1,A,1,N,1,E,' + kn + ',1.0,230326,,,A'))) +
                        '\r\n' + (o.noGga ? '' : nmea('GPGGA,1,1,N,1,E,' + (o.quality === undefined ? 1 : o.quality) + ',' + String(o.sats === undefined ? 9 : o.sats).padStart(2, '0') + ',0.9,' + (o.alt || 310.5) + ',M,46.9,M,,')));
                }
            }
        };
        cruise(2, 81.6, 80);
        ok(g.status(t).rmc.ratios === 0, 'the first 2 s at speed give no ratio (the speed must have been steady for 2 s)');
        cruise(50, 81.6, 80);
        ok(g.result() === null && g.status(t).rmc.ratios > 40 && g.status(t).rmc.ratios < 60, g.status(t).rmc.ratios + ' ratios: no factor yet (60 are needed)');
        cruise(12, 81.6, 80);
        let r = g.result();
        ok(r && r.method === 'rmc' && Math.abs(r.factor - 80 / 81.6) < 0.0005 && r.count >= 60 && told.length === 1, 'at 60 ratios: factor ' + (r ? r.factor.toFixed(4) : '-') + ' for a car that reads 2 % high (true ' + (80 / 81.6).toFixed(4) + '), said once');
        const sc = Gps.scaleFor('gps', 0, r);
        ok(sc.label === 'GPS x0.980' && sc.source === 'gps-rmc' && sc.factor === r.factor, 'a run then shows "' + sc.label + '"');
        const lab = (g2) => { const n0 = g2.status(t).rmc.total; return () => g2.status(t).rmc.total - n0; };
        let more = lab(g);
        cruise(20, 50, 49);
        ok(more() === 0, 'at 50 km/h nothing is learned (above 60 km/h only)');
        more = lab(g);
        for (let i = 0; i < 40; i++, t += 500) { g.speed(t, 70 + i * 1.5); if (i % 2 === 0) g.nmea(t + 5, nmea('GPRMC,1,A,1,N,1,E,' + ((70 + i * 1.5) / 1.852).toFixed(2) + ',1.0,230326,,,A')); }
        ok(more() === 0, 'while the car gains 3 km/h a second nothing is learned');
        more = lab(g); cruise(20, 90, 88, { sats: 5 });
        ok(more() === 0, 'with 5 satellites nothing is learned (6 or more)');
        more = lab(g); cruise(20, 90, 88, { quality: 0 });
        ok(more() === 0, 'with GGA saying "no fix" nothing is learned');
        more = lab(g); cruise(20, 90, 88, { status: 'V' });
        ok(more() === 0 && g.status(t).sentences.rmcVoid >= 20, 'RMC status V: nothing is learned');
        more = lab(g); const bad0 = g.status(t).sentences.bad; cruise(20, 90, 88, { badSum: true });
        ok(more() === 0 && g.status(t).sentences.bad - bad0 === 20, 'RMC sentences with a wrong checksum: nothing is learned, 20 counted as bad');
        // height
        ok(g.height(t).src === 'gga' && g.height(t).m === 310.5, 'height: the receiver\'s own (GGA), 310.5 m');
        g.heightCan(t + 9000, Gps.decodeHeightCan(32768 + 298));
        ok(g.height(t + 9000).src === 'can' && g.height(t + 9000).m === 298, 'no GGA for 9 s: the raw GPS height instead (raw - 32768 = 298 m)');
        ok(g.height(t + 60000) === null && Gps.decodeHeightCan(65535) === null, 'neither fresh: no height; raw 65535 is "no value"');
        const hc = Gps.heightChange({ m: 310.5 }, { m: 306.5 }, 402.336);
        ok(hc.m === -4 && Math.abs(hc.pct + 0.994) < 0.001 && Gps.heightChange(null, { m: 1 }, 400) === null, 'height change over the 1/4 mile: -4.0 m is ' + hc.pct.toFixed(2) + ' %');
        const g2 = new Gps.GpsScale({});
        t = 0;
        const total2 = () => g2.status(t).rmc.total;
        for (let i = 0; i < 400; i++, t += 500) { g2.speed(t, 100 + (i % 2 ? 0.02 : 0)); if (i % 2 === 0) g2.nmea(t + 5, nmea('GPRMC,1,A,1,N,1,E,' + (100 * (1 + (((i / 2) % 7) - 3) * 0.012) / 1.852).toFixed(3) + ',1.0,230326,,,A')); }
        ok(total2() > 150 && g2.result() === null && g2.status(t).rmc.spread > 0.01, 'a GPS speed that scatters by 3.6 % either way: ' + total2() + ' ratios, but no factor (the middle 80 % must lie within 1 % of the median)');
        ok(g2.status(t).fix === null, 'this receiver sent no GGA at all: RMC status A alone had to vouch for the fix');
        const g3 = new Gps.GpsScale({});
        for (let i = 0; i < 400; i++, t += 500) { g3.speed(t, 100); if (i % 2 === 0) g3.nmea(t + 5, nmea('GPRMC,1,A,1,N,1,E,' + (86 / 1.852).toFixed(3) + ',1.0,230326,,,A')); }
        ok(g3.status(t).rmc.total > 150 && g3.result() === null, 'ratios that agree on 0.86: no factor (only 0.90 to 1.10 is believed)');
        ok(Gps.scaleFor('gps', 0, null).label === 'UNCALIBRATED' && Gps.scaleFor('gps', 0, null).factor === 1, 'without a factor a run uses 1.000 and says UNCALIBRATED');
        ok(Gps.scaleFor('off', 12, r).factor === 1 && Gps.scaleFor('off', 12, r).source === 'off', 'setting "off": always 1.000');
        const man = Gps.scaleFor('manual', 125, r), neg = Gps.scaleFor('manual', -50, null);
        ok(man.factor === 1.0125 && man.label === 'MANUAL +1.25 %' && neg.factor === 0.995 && neg.label === 'MANUAL -0.50 %' && man.source === 'manual', 'setting "manual": hundredths of a percent, + means the car reads low (+1.25 %: the speed is multiplied by ' + man.factor +
            '), shown as "' + man.label + '" and "' + neg.label + '"');
        ok(Gps.scaleFor('manual', 9999, null).factor === 1.04 && Gps.scaleFor('manual', -9999, null).factor === 0.96 && Gps.scaleFor('manual', 'x', null).factor === 1 && Gps.scaleFor('manual', 0, null).label === 'MANUAL +0.00 %',
            'manual is held to +-4.00 %; nonsense counts as 0');
        // saved, and reset
        const saved = JSON.parse(JSON.stringify(g.export(1790000000000)));
        ok(saved.rmc && Math.abs(saved.rmc.factor - r.factor) < 1e-5 && saved.rmc.count >= 60 && saved.rmc.date === 1790000000000 && saved.legs === null, 'the saved file gets the factor with its method, count and date');
        const g4 = new Gps.GpsScale({ saved });
        ok(g4.result() && g4.result().saved === true && g4.result().method === 'rmc' && Math.abs(g4.result().factor - r.factor) < 1e-5 && g4.result().date === 1790000000000, 'after a restart the car is still calibrated, from the saved factor');
        ok(new Gps.GpsScale({ saved: { rmc: { factor: 3 }, legs: 'x' } }).result() === null && new Gps.GpsScale({ saved: null }).result() === null, 'a saved factor that makes no sense is ignored');
        g4.reset();
        ok(g4.result() === null && g4.export(1).rmc === null, '"Reset calibration" clears it, the saved one too');
    });

    await ok.part('review, the GPS speed factor: a car that gains or loses speed gently, a receiver that speaks often or in whole knots', async () => {
        // The car's speed is RIGHT here (the true factor is 1.000). The GPS speed is `age` s old when it arrives; the
        // ratio assumes 1 s. o: secs, from km/h, rate km/h per s, hz, age s, whole (knots without decimals)
        const rmc = (kmh, whole) => nmea('GPRMC,1,A,1,N,1,E,' + (whole ? String(Math.round(kmh / 1.852)) : (kmh / 1.852).toFixed(3)) + ',1.0,230326,,,A');
        const drive = (g, st, o) => {
            const every = Math.round(1000 / (o.hz || 1)), v = (ms) => o.from + o.rate * ms / 1000;
            for (let ms = 0; ms < o.secs * 1000; ms += 100) {
                g.speed(st.t + ms, v(ms));
                if (ms % every === 0) g.nmea(st.t + ms + 1, rmc(v(ms - (o.age || 0) * 1000), o.whole));
            }
            st.t += o.secs * 1000; st.v = v(o.secs * 1000);
        };
        // gaining 0.9 km/h every second: "steady" by the brief's rule (under 2 km/h in 2 s), and every ratio off the same way
        let g = new Gps.GpsScale({}), st = { t: 0 };
        drive(g, st, { secs: 75, from: 70, rate: 0.9, age: 0 });
        let s = g.status(st.t).rmc;
        ok(s.ratios >= 60 && s.spread < 0.01 && Math.abs(s.median - 1.0092) < 0.004 && g.result() === null && s.level === 0 && s.up === s.ratios,
            'a car gaining 0.9 km/h a second for 75 s, the GPS speed fresh on arrival: ' + s.ratios + ' ratios, all taken while the speed rose, median ' + s.median.toFixed(4) + ', spread ' + (s.spread * 100).toFixed(2) +
            ' %: NO factor. WAS: accepted as ' + s.median.toFixed(3) + ' (0.9 % wrong: 0.05 to 0.24 s on a 0-100), shown as "GPS x' + s.median.toFixed(3) + '" and saved');
        drive(g, st, { secs: 75, from: st.v, rate: 0, age: 0 });
        ok(g.result() && Math.abs(g.result().factor - 1) < 0.0005 && g.result().count >= 60 && g.status(st.t).rmc.level >= 60, 'then 75 s at a level speed: factor ' + g.result().factor.toFixed(4) + ' from the ' + g.result().count + ' level ratios alone (true 1.0000)');
        // rising and falling moments that agree: then the age does not matter
        g = new Gps.GpsScale({}); st = { t: 0 };
        drive(g, st, { secs: 45, from: 80, rate: 0.9, age: 1 }); drive(g, st, { secs: 45, from: st.v, rate: -0.9, age: 1 });
        s = g.status(st.t).rmc;
        ok(g.result() && Math.abs(g.result().factor - 1) < 0.001 && s.up >= 15 && s.down >= 15 && s.level < 60, 'a GPS speed that is 1 s old (what the ratio assumes), 45 s gaining and 45 s losing speed: the ' + s.up + ' rising and ' + s.down +
            ' falling ratios agree, factor ' + g.result().factor.toFixed(4));
        g = new Gps.GpsScale({}); st = { t: 0 };
        drive(g, st, { secs: 45, from: 80, rate: 0.9, age: 0 }); drive(g, st, { secs: 45, from: st.v, rate: -0.9, age: 0 });
        ok(g.result() === null, 'the same drive with a GPS speed that is fresh on arrival: rising and falling ratios are 1.8 % apart, no factor');
        // a receiver that speaks ten times a second
        g = new Gps.GpsScale({}); st = { t: 0 };
        drive(g, st, { secs: 12, from: 90, rate: 0.9, hz: 10, age: 0 });
        s = g.status(st.t).rmc;
        ok(s.ratios <= 12 && s.ratios >= 8 && g.result() === null, 'ten sentences a second for 12 s: ' + s.ratios + ' ratios (one a second), no factor. WAS: 100 ratios from one stretch of road, accepted 1.2 % wrong');
        // whole knots
        g = new Gps.GpsScale({}); st = { t: 0 };
        drive(g, st, { secs: 100, from: 65, rate: 0, whole: true });
        ok(g.status(st.t).rmc.ratios === 0 && g.result() === null && g.status(st.t).sentences.rmcCoarse >= 99, 'a receiver that sends its speed in whole knots (steps of 1.85 km/h): no ratio from it, ' + g.status(st.t).sentences.rmcCoarse +
            ' sentences counted as too coarse. WAS: accepted, 0.3 % off at 65 km/h');
        const p = Gps.parseNmea(rmc(80, false) + '\r\n' + rmc(80, true));
        ok(p.rmc[0].coarse === false && p.rmc[1].coarse === true && !('course' in p.rmc[0]), 'the sentence reader says which it is, and no longer takes the course over ground out of a sentence');
    });

    await ok.part('the speed scale from position legs', async () => {
        // one degree at 45 degrees north, from published tables: 111 132 m of latitude, 78 847 m of longitude
        const LAT_M = 111132, LON_M = 78847, LAT0 = 45, LON0 = 9;
        const mk = () => new Gps.GpsScale({});
        // drive: car speed (km/h as the car says), true speed, heading (deg from north), fixes every fixMs
        const drive = (g, st, secs, o) => {
            for (let i = 0; i < secs * 10; i++, st.t += 100) {
                const carKmh = typeof o.car === 'function' ? o.car(st.t) : o.car, trueKmh = carKmh * (o.ratio === undefined ? 1 : o.ratio);
                if (i % 5 === 0) g.speed(st.t, carKmh);
                const d = trueKmh / 3.6 * 0.1, h = (o.heading || 0) * Math.PI / 180;
                st.n += d * Math.cos(h); st.e += d * Math.sin(h);
                if (i % 10 === 0) {
                    const off = o.wiggle ? o.wiggle * Math.sin(st.t / 4000) : 0;      // sideways, metres
                    const lat = LAT0 + (st.n - off * Math.sin(h)) / LAT_M, lon = LON0 + (st.e + off * Math.cos(h)) / LON_M;
                    if (o.src !== 'none') g.position(st.t + 3, lat, lon, o.src || 'gps');
                    if (o.also) g.position(st.t + 4, lat + 0.01, lon, o.also);
                }
            }
        };
        let g = mk(), st = { t: 0, n: 0, e: 0 };
        drive(g, st, 45, { car: 92.7, ratio: 1 / 1.03, heading: 40 });
        ok(g.status().legs.total === 1 && Math.abs(g.status().legs.ratios[0] - 1 / 1.03) < 0.0003, 'a car that reads 3 % high, 1000 m straight at a true 90 km/h: one leg, ratio ' + g.status().legs.ratios[0].toFixed(4) + ' (true ' + (1 / 1.03).toFixed(4) + ')');
        ok(g.result() === null, 'one leg is no result yet (3 within 0.5 % are needed)');
        drive(g, st, 90, { car: 92.7, ratio: 1 / 1.03, heading: 40 });
        let r = g.result();
        ok(r && r.method === 'legs' && r.count >= 3 && Math.abs(r.factor - 1 / 1.03) < 0.0003, 'after 3 legs: factor ' + (r ? r.factor.toFixed(4) : '-') + ' from position legs');
        ok(Gps.scaleFor('gps', 0, r).label === 'GPS x0.971' && Gps.scaleFor('gps', 0, r).source === 'gps-legs', 'shown as "GPS x0.971"');
        // straight north and straight east: the flat-earth distance against the published degree lengths
        for (const heading of [0, 90]) {
            g = mk(); st = { t: 0, n: 0, e: 0 };
            drive(g, st, 45, { car: 90, heading });
            ok(g.status().legs.total === 1 && Math.abs(g.status().legs.ratios[0] - 1) < 0.0002, 'a car that reads right, 1000 m due ' + (heading ? 'east' : 'north') + ' at 45 degrees north: ratio ' + g.status().legs.ratios[0].toFixed(5) +
                ' (the distance on the ground is right to 0.02 %)');
        }
        // nothing that could be a position leaves the module
        g = mk(); st = { t: 0, n: 0, e: 0 };
        drive(g, st, 200, { car: 92.7, ratio: 1 / 1.03, heading: 40 });
        const out = JSON.stringify([g.export(1790000000000), g.status(st.t), g.result()]);
        ok(!/45\.\d\d|9\.0\d\d|lat|lon/i.test(out), 'the saved file, the Signals page and the result hold ratios, counts and distances: no latitude or longitude');
        const saved = g.export(1790000000000);
        ok(saved.legs && saved.legs.date === 1790000000000 && new Gps.GpsScale({ saved }).result().method === 'legs', 'a factor from legs is saved and found again after a restart');
        // what stops a leg
        g = mk(); st = { t: 0, n: 0, e: 0 };
        drive(g, st, 200, { car: 90, heading: 40, wiggle: 30 });
        ok(g.status().legs.total === 0, 'a road that wanders 30 m to either side: no leg (every fix must stay within 5 m of the straight line)');
        g = mk(); st = { t: 0, n: 0, e: 0 };
        drive(g, st, 200, { car: (t) => 62 + (t % 20000 < 2000 ? -15 : 0), heading: 40 });
        ok(g.status().legs.total === 0, 'a car that drops under 50 km/h every 20 s: no leg');
        g = mk(); st = { t: 0, n: 0, e: 0 };
        drive(g, st, 100, { car: (t) => 70 + t / 4000, heading: 40 });
        ok(g.status().legs.total === 0, 'a car that gains speed all the way (more than 3 km/h between the two ends): no leg');
        g = mk(); st = { t: 0, n: 0, e: 0 };
        drive(g, st, 200, { car: 55, heading: 40 });
        ok(g.status().legs.total === 0, 'at 55 km/h no leg starts (above 60 km/h only)');
        // sources
        g = mk(); st = { t: 0, n: 0, e: 0 };
        drive(g, st, 90, { car: 90, heading: 40, src: 'gps', also: 'nav' });
        ok(g.status().legs.source === 'gps' && g.status().legs.total === 2, 'raw GPS and the navigation both send a position: the raw GPS one is used, the other ignored');
        g = mk(); st = { t: 0, n: 0, e: 0 };
        drive(g, st, 90, { car: 90, heading: 40, src: 'nav' });
        ok(g.status().legs.source === 'nav' && g.status().legs.total === 2, 'only the navigation sends one: legs come from it');
        g = mk(); st = { t: 0, n: 0, e: 0 };
        drive(g, st, 60, { car: 90, heading: 40, src: 'none' });
        ok(g.status().legs.total === 0 && g.result() === null, 'no position at all: no legs, no result, nothing thrown');
        // raw values
        ok(Math.abs(Gps.decodeGpsCan(2147483648 + 45 * 3600000) - 45) < 1e-9 && Gps.decodeGpsCan(2147483647) === null && Gps.decodeGpsCan(4294967295) === null && Gps.decodeGpsCan(4294967293) === null,
            'raw GPS position: (raw - 2147483648) / 3600000 degrees; 2147483647 and 4294967293 upward are "no value"');
        const pos = Gps.gpsCanPosition({ statusGPSLongitudeCAN: 2147483648 + 9 * 3600000, statusGPSLatitudeCAN: 2147483648 + 45 * 3600000 });
        ok(pos && Math.abs(pos.lat - 45) < 1e-9 && Math.abs(pos.lon - 9) < 1e-9 && Gps.gpsCanPosition({ statusGPSLongitudeCAN: 2147483647, statusGPSLatitudeCAN: 2147483647 }) === null && Gps.gpsCanPosition(null) === null,
            'a raw GPS position value is read by its member names; "no value" and nonsense give none');
        ok(Gps.navPosition({ coordinatesValid: true, latitude: 45, longitude: 9, heading: 1 }).lat === 45 && Gps.navPosition({ coordinatesValid: true, latitude: 0, longitude: 0 }) === null &&
            Gps.navPosition({ coordinatesValid: false, latitude: 45, longitude: 9 }) === null && Gps.navPosition({ latitude: 'x' }) === null, 'the navigation\'s position: 0 / 0, "not valid" and nonsense are rejected');
        // GPS speed before legs, learned before saved
        g = new Gps.GpsScale({ saved: { rmc: { factor: 0.95, count: 80, date: 5 }, legs: null } });
        st = { t: 0, n: 0, e: 0 };
        drive(g, st, 140, { car: 92.7, ratio: 1 / 1.03, heading: 40 });
        ok(g.result().method === 'legs' && g.result().saved === false, 'a factor learned since the start (from legs) counts before a saved one (from GPS speed)');
    });

    /* ================= wheels.js, slope.js ================= */
    await ok.part('wheel speeds', async () => {
        const F = 0.0146;                       // km/h per count on this made-up car
        const ev = (fl, fr, rl, rr) => ({ CRCActualValueRPMWheel: 17, aliveActualValueRPMWheel: 3, dummy: 0, actualValueRPMWheelRLH: rl, actualValueRPMWheelRRH: rr,
            actualValueRPMWheelFLH: fl, actualValueRPMwheelFRH: fr, qualifierActualValueRPMWheelRLH: 9, qualifierActualValueRPMWheelFLH: 9 });
        let raw = Wheels.rawWheels(ev(5000, 65535, 5020, 65534));
        ok(raw.fl === 5000 && raw.fr === null && raw.rl === 5020 && raw.rr === null, 'the four raw wheel values are read by name (front right with its small w); 65534 and 65535 are "no value"');
        ok(Object.keys(raw).length === 4 && Wheels.rawWheels(null).fl === null && Wheels.rawWheels({ foo: 1 }).rr === null, 'qualifier, CRC, alive and dummy members are not read; nonsense gives no values');
        const learned = [];
        const w = new Wheels.WheelFactors({ onLearned: (wheel, f, n) => learned.push(wheel) });
        let t = 0;
        const steady = (secs, kmh, k) => { for (let i = 0; i < secs * 10; i++, t += 100) { if (i % 5 === 0) w.speed(t, kmh + (i % 10 ? 0.02 : 0)); const c = Math.round(kmh / F); w.wheels(t + 2, Wheels.rawWheels(k ? k(c) : ev(c, c, c, c))); } };
        steady(1.5, 80);
        ok(w.kmh(Wheels.rawWheels(ev(5000, 5000, 5000, 5000))) === null && w.status().all === false, 'no wheel speed in km/h before the factors are learned');
        steady(3, 80);
        let k4 = w.kmh(Wheels.rawWheels(ev(5000, 5000, 5000, 5000)));
        ok(k4 && Math.abs(k4.fl - 5000 * F) < 0.05 && learned.length === 4 && w.status().all === true, 'after 20 steady moments at 80 km/h: factor ' + w.status().wheels.fl.f.toFixed(5) + ' km/h per count on all four (true ' + F + '), said once per wheel');
        const n0 = w.status().wheels.fl.n;
        for (let i = 1; i < 30; i++, t += 100) { w.speed(t, 80 + i); w.wheels(t + 2, Wheels.rawWheels(ev(1, 1, 1, 1))); }
        ok(w.status().wheels.fl.n === n0, 'while the speed changes nothing is learned');
        steady(4, 25);
        ok(w.status().wheels.fl.n === n0, 'nor under 30 km/h');
        const saved = JSON.parse(JSON.stringify(w.export()));
        ok(Math.abs(saved.rl.f - F) < 0.0001 && saved.rl.n >= 20, 'the factors go into the saved file');
        const w2 = new Wheels.WheelFactors({ saved });
        ok(w2.kmh(Wheels.rawWheels(ev(5000, 5000, 5000, 5000))) && w2.status().wheels.fl.saved === true, 'and are used from the first moment after a restart');
        ok(w2.kmh(Wheels.rawWheels(ev(5000, 65535, 5000, 5000))) === null, 'a wheel with "no value": no wheel speeds from that event');
        // a raw value that is not a plain multiple of the speed
        const w3 = new Wheels.WheelFactors({});
        t = 0;
        for (let lap = 0; lap < 6; lap++) for (const kmh of [40, 120]) for (let i = 0; i < 40; i++, t += 100) { if (i % 5 === 0) w3.speed(t, kmh); w3.wheels(t + 2, Wheels.rawWheels(ev(1000 + kmh / F, 1000 + kmh / F, 1000 + kmh / F, 1000 + kmh / F))); }
        ok(w3.status().wheels.fl.spread > 0.03 && w3.status().wheels.fl.usable === false && w3.kmh(Wheels.rawWheels(ev(5000, 5000, 5000, 5000))) === null,
            'raw values with an offset in them: the ratios spread by ' + (w3.status().wheels.fl.spread * 100).toFixed(0) + ' % between 40 and 120 km/h, and the wheel speeds are not used');

        // wheelspin on a launch: 8 m/s2, the rear wheels 30 % ahead for the first 0.8 s
        const spin = new Wheels.WheelSpin();
        ok(spin.result() === null, 'no launch, no wheelspin figure');
        const T0 = 50000, car = (ms) => 8 * ms / 1000 * 3.6;
        const launch = (s, o) => {
            s.launch(T0);
            for (let ms = -200; ms <= 3400; ms += 10) {
                const v = Math.max(0, car(ms));
                if (ms % 100 === 0) s.speed(T0 + ms, v * (o.high && ms > 0 && ms <= o.high ? 1.08 : 1), 'notified');
                if (ms % 50 === 0 && ms >= 0 && o.wheels !== false) {
                    const rear = v * (ms < 800 ? 1.3 : 1.01), front = v * (o.frontLed ? 1.5 : 1);
                    s.wheels(T0 + ms, { fl: front, fr: v, rl: rear, rr: rear * 0.99 });
                }
            }
            return s.result('notified');
        };
        let res = launch(spin, {});
        ok(res && res.method === 'wheels' && Math.abs(res.peak - 30) < 0.5 && res.axle === 'rear', 'rear wheels 30 % faster than the slowest wheel: peak ' + res.peak + ' %, rear axle');
        ok(Math.abs(res.secs - 0.6) <= 0.06, 'above 10 % for ' + res.secs + ' s (from the slowest wheel passing 5 km/h at 0.17 s until 0.8 s)');
        ok(res.readHigh === false && res.highSecs === 0, 'the vehicle speed follows the slowest wheel: no flag');
        res = launch(new Wheels.WheelSpin(), { high: 600 });
        ok(res.readHigh === true && res.highSecs > 0.3, 'the vehicle speed 8 % above the slowest wheel for the first 0.6 s: SPEED READ HIGH AT LAUNCH (' + res.highSecs + ' s above 5 %)');
        res = launch(new Wheels.WheelSpin(), { high: 400 });
        ok(res.readHigh === false && res.highSecs > 0.1, 'the same for the first 0.4 s only (' + res.highSecs + ' s of it with the slowest wheel above 5 km/h): under the 0.3 s it takes, no flag');
        res = launch(new Wheels.WheelSpin(), { frontLed: true });
        ok(res.axle === 'front' && res.peak >= 49, 'a front wheel 50 % ahead: front axle');
        ok(launch(new Wheels.WheelSpin(), { wheels: false }) === null, 'no wheel data in the run: no figure from the wheels (the estimate is the fallback)');
        // the fallback
        const est = new Wheels.AccelSpin();
        ok(est.result() === null, 'the estimate: nothing without acceleration data');
        for (let ms = -3000; ms < 0; ms += 50) { est.speed(T0 + ms, 0); est.accel(T0 + ms, 0.15); }
        est.launch(T0);
        for (let ms = 0; ms <= 3200; ms += 50) { est.accel(T0 + ms, 5 + 0.15); est.speed(T0 + ms + 1, 5 * ms / 1000 * 3.6 * 1.25); }
        res = est.result();
        ok(res && res.method === 'estimate' && Math.abs(res.peak - 25) <= 3 && res.secs > 2, 'the estimate: the speed signal 25 % ahead of the acceleration summed up (less what the sensor read standing): about ' + res.peak + ' %, marked "estimate"');
        // A launch with no wheelspin at all, as the app meets it: 6 m/s2 from the launch instant, the acceleration on a
        // 50 ms grid, the speed on another, and the app only hears of the launch with a speed sample 60 ms after it.
        const clean = (seed) => {
            const e = new Wheels.AccelSpin(), ev = [];
            for (let ms = -3000; ms <= 3200; ms += 50) { ev.push({ t: T0 + ms + 7, a: ms + 7 >= 0 ? 6 : 0 }); ev.push({ t: T0 + ms + 30, v: ms + 30 >= 0 ? 0.5 + 6 * 3.6 * (ms + 30) / 1000 : 0 }); }
            ev.sort((x, y) => x.t - y.t);
            let told = false;
            for (const x of ev) {
                if (!told && x.t >= T0 + 60) { told = true; if (seed) e.launch(T0, 0.5); else e.launch(T0); }
                if (x.a !== undefined) e.accel(x.t, x.a); else e.speed(x.t, x.v);
            }
            return e.result();
        };
        res = clean(true);
        ok(res && res.peak <= 1 && res.secs === 0, 'the estimate on a launch without wheelspin, the app hearing of the launch 60 ms after it: ' + res.peak + ' % (the sum starts at the launch instant, from 0.5 km/h, through the acceleration heard meanwhile, less what the sensor read before the launch began)');
        ok(clean(false).peak <= 12, 'and ' + clean(false).peak + ' % when the sum is not told the speed at the launch instant (it then starts from 0)');
    });

    await ok.part('start slope, the car\'s road gradient', async () => {
        const s = new Slope.StartSlope();
        const T0 = 13000, STOOD = 10000;
        for (let t = 8000; t < STOOD; t += 100) s.accel(t, -3);                                   // braking to a stop
        for (let t = STOOD; t < T0 - 100; t += 100) s.accel(t, -0.17652 + (t % 200 ? 0.002 : -0.002));  // standing on 1.8 % downhill
        for (let t = T0 - 100; t <= T0 + 500; t += 20) s.accel(t, -0.1765 + (t - T0 + 100) * 0.02);  // the launch building up
        let r = s.before(T0, STOOD);
        ok(r && Math.abs(r.pct + 1.8) < 0.01 && r.ms === 1500, 'standing nose down on 1.8 %: start slope ' + r.pct.toFixed(2) + ' %, averaged over the 1.5 s before the launch (the last 250 ms left out)');
        ok(Slope.downhill(r.pct, '1') === true && Slope.downhill(r.pct, '2') === false && Slope.downhill(r.pct, 'off') === false, 'limit 1 %: DOWNHILL START. Limit 2 %: not flagged (it must be steeper). Off: never');
        ok(Slope.downhill(-2.01, '2') === true && Slope.downhill(3, '1') === false && Slope.downhill(null, '1') === false, 'uphill is never flagged, and no reading is no flag');
        r = s.before(T0, 12000);
        ok(r && r.ms === 750 && Math.abs(r.pct + 1.8) < 0.01, 'the car stood for 1 s only: averaged over the 0.75 s of standing there is');
        ok(s.before(T0, 12600) === null, 'less than 0.3 s of standing readings: no figure');
        const s2 = new Slope.StartSlope();
        for (let t = 8000; t < 9990; t += 100) s2.accel(t, -3);
        ok(s2.before(T0, STOOD) === null && s2.standing(T0, STOOD) === null, 'the sensor said nothing since the car came to rest: no figure (its last reading is from the braking)');
        s2.accel(10050, 0.098);
        r = s2.before(T0, STOOD);
        ok(r && Math.abs(r.pct - 1.0) < 0.01, 'one reading at standstill that then does not change (an on-change sensor): it holds, +' + r.pct.toFixed(2) + ' % nose up');
        ok(Math.abs(s2.standing(12000, STOOD).pct - 1.0) < 0.01 && s2.standing(10050 + 70000, STOOD) === null, 'the same figure for a standing car on the Signals page; not from a reading more than a minute old');
        ok(new Slope.StartSlope().before(T0, STOOD) === null, 'no acceleration data at all: no figure, nothing thrown');
        // LaneSlope
        const enc = (count) => (count >> 4) | ((count & 15) << 8);
        ok(Slope.laneSlope(enc(1280)).pct === 0 && Slope.laneSlope(enc(1280)).count === 1280, 'road gradient raw value: count 1280 is level');
        ok(Slope.laneSlope(enc(1270)).pct === 1 && Slope.laneSlope(enc(1305)).pct === -2.5, '0.1 % per count, nose up below 1280: 1270 is +1.0 %, 1305 is -2.5 %');
        ok(Slope.laneSlope(enc(4095)) === null && Slope.laneSlope(undefined) === null, 'all bits set, or nothing: no value');
    });

    await ok.part('steady speed window', async () => {
        const w = new SpeedWindow(5000);
        ok(w.range(1000, 2000) === null && w.steady(1000, 2000, 2, 3000) === false && w.valueAt(5) === null, 'empty: nothing known, not steady');
        w.add(0, 80); w.add(4000, 80.5);
        ok(w.range(4500, 2000).min === 80 && w.range(4500, 2000).max === 80.5 && w.steady(4500, 2000, 2, 3000) === true, 'a car that sent 80 km/h and, 4 s later, 80.5: steady over the last 2 s (no news = no change)');
        ok(w.steady(7500, 2000, 2, 3000) === false, 'but not once its newest sample is older than allowed');
        w.add(4600, 84);
        ok(w.steady(4700, 2000, 2, 3000) === false && w.valueAt(4300) === 80.5 + 3.5 / 2, 'a jump to 84: not steady; the speed between two samples is on the straight line');
        w.add(4400, 82);
        ok(w.s.map((p) => p.t).join() === '0,4000,4400,4600', 'a sample that arrives out of order (the other series) is put in its place');
        const w2 = new SpeedWindow(5000);
        w2.add(1000, 70);
        ok(w2.range(1500, 2000) === null, 'a figure for the last 2 s needs a sample from before them');
    });

    await ok.part('whatever a source may send: nothing throws, nothing absurd comes out', async () => {
        const rand = sim.rng(4711), ORDER = ['60ft', '330ft', 'eighth', '1000ft', 'quarter'];
        let runs = 0, withResults = 0, bad = [];
        const sane = (sum, tag) => {
            const r = sum.results, keys = Object.keys(r);
            for (const k of keys) {
                const x = r[k];
                if (!(x.s > 0 && x.s <= 60.001 && isFinite(x.s))) bad.push(tag + ': ' + k + ' time ' + x.s);
                if (!(x.pm >= 0.01 && isFinite(x.pm))) bad.push(tag + ': ' + k + ' +- ' + x.pm);
                if (x.trap !== undefined && !(x.trap > 0 && x.trap <= sum.vmax + 1e-6)) bad.push(tag + ': ' + k + ' trap ' + x.trap + ' above the top speed ' + sum.vmax);
                if (x.at !== undefined && !(x.at >= 0 && x.at <= sum.vmax + 1e-6)) bad.push(tag + ': ' + k + ' speed at the line ' + x.at);
            }
            const d = ORDER.filter((k) => r[k]);
            for (let i = 1; i < d.length; i++) if (!(r[d[i]].s > r[d[i - 1]].s)) bad.push(tag + ': ' + d[i] + ' before ' + d[i - 1]);
            if (ORDER.some((k, i) => r[k] && i > 0 && !r[ORDER[i - 1]])) bad.push(tag + ': a distance split without the one before it');
            if (/NaN|Infinity/.test(JSON.stringify(sum)) || !(sum.vmax >= 5) || !(sum.samples >= 1) || !(sum.launchGap >= 0) || !(sum.t0 <= sum.tFirst)) bad.push(tag + ': summary ' + JSON.stringify(sum).slice(0, 200));
            if (typeof Feed.describeRun(sum) !== 'string' || /undefined|NaN/.test(Feed.describeRun(sum))) bad.push(tag + ': log line');
        };
        for (let n = 0; n < 400; n++) {
            const car = fleet()[Math.floor(rand() * RUNS)];
            const start = rand.pick(['slip', 'standstill', 'rollout']), onChange = rand() < 0.5;
            // send slots at a random, uneven pace; stretches where the series says nothing; zeros, repeats and nonsense thrown in
            const pace = rand.pick([10, 20, 50, 100, 200, 400]), uneven = rand() * 0.9, floor = rand() < 0.2 ? rand() * 3 : 0, over = 0.9 + rand() * 0.2;
            const holeAt = rand() < 0.3 ? rand() * 12000 : -1, holeFor = rand() * 4000, stopAt = rand() < 0.15 ? 500 + rand() * 9000 : Infinity;
            const eng = new RunEngine({ start, onChange, unit: rand() < 0.3 ? 'mph' : 'kmh', scale: rand() < 0.3 ? () => ({ factor: 0.9 + rand() * 0.2, source: 'test' }) : undefined, fit: rand() < 0.2 ? 'line' : 'model' });
            const sums = [];
            eng.onDone = (x) => sums.push(x);
            let t = C0 - 2500, idleAt = t, sent = null;
            try {
                while (t < C0 + Math.min(stopAt + 3000, car.tEnd * 1000)) {
                    while (idleAt <= t) { eng.idle(idleAt); eng.elapsed(idleAt); eng.results(); idleAt += 50 * (0.5 + rand()); }
                    const ms = t - C0;
                    let v = ms > stopAt ? 0 : car.vAt(ms / 1000) * 3.6 * over;
                    v = Math.round(v * 64) / 64;
                    if (v < floor) v = 0;
                    const dice = rand();
                    if (dice < 0.01) v = 0; else if (dice < 0.013) v = NaN; else if (dice < 0.016) v = 1023.98; else if (dice < 0.018) v = -1; else if (dice < 0.024) v = 20 + rand() * 400;
                    if (!(ms > holeAt && ms < holeAt + holeFor) && !(onChange && v === sent)) { sent = v; eng.feed(t, v); if (rand() < 0.01) eng.feed(t, v); }
                    t += pace * (1 - uneven + 2 * uneven * rand());
                }
                for (let i = 0; i < 1400 && eng.state === 'run'; i++, idleAt += 50) eng.idle(idleAt);
            } catch (e) { bad.push('threw: ' + (e && e.stack || e)); }
            if (eng.state === 'run') bad.push('still timing 70 s after the last sample');
            runs += sums.length;
            sums.forEach((x, i) => { if (Object.keys(x.results).length) withResults++; sane(x, 'stream ' + n + ' run ' + i); });
        }
        ok(bad.length === 0, '400 speed series at an uneven pace, with holes, lone zeros, repeats, "no value", absurd values, signals that cut in late or stop: nothing throws, and every one of the ' + runs +
            ' runs that came out (' + withResults + ' with a split) has its splits in order, times within 60 s, trap speeds under the top speed and a +- figure' + (bad.length ? '. FIRST PROBLEMS: ' + bad.slice(0, 3).join(' | ') : ''));
        // the two engines together on the same kind of streams
        bad = [];
        let handed = 0;
        for (let n = 0; n < 60; n++) {
            const car = fleet()[Math.floor(rand() * RUNS)];
            const two = new Feed.TwoSeries({ start: rand.pick(['slip', 'standstill', 'rollout']), onRun: (r) => {
                handed++;
                // (the summary handed over is the chosen engine's; where the two engines do not agree it is a copy with a wider +-)
                if (!r.chosen || !r.summary || !r.summary.ended || r.summary.series !== r.chosen || r.summary.tEnd !== r.both[r.chosen].tEnd || (!r.disagree.length && r.summary !== r.both[r.chosen])) bad.push('stream ' + n + ': chosen ' + r.chosen);
                ['notified', 'polled'].forEach((k) => { if (r.both[k] && r.both[k].series !== k) bad.push('stream ' + n + ': mixed up'); });
            } });
            const cut = (list) => { const from = rand() < 0.3 ? C0 + rand() * 8000 : Infinity, len = rand() * 5000; return list.filter((p) => !(p.t > from && p.t < from + len)); };
            const nn = rand() < 0.15 ? [] : cut(sim.sample(car, { spacing: rand.pick([20, 50, 100, 200]), phase: rand() * 20, onChange: true, delay: rand() * 50, jitter: rand() * 10, clock0: C0, rand, zeroAt: rand() < 0.3 ? 1000 + rand() * 6000 : undefined }));
            const pp = rand() < 0.15 ? [] : cut(sim.sample(car, { spacing: rand.pick([50, 50, 500]), phase: rand() * 50, onChange: false, delay: rand() * 30, jitter: rand() * 10, clock0: C0, rand }));
            if (!nn.length && !pp.length) continue;
            try { driveTwo(two, nn, pp, C0 + car.tEnd * 1000 + 70000); } catch (e) { bad.push('threw: ' + (e && e.stack || e)); }
            if (two.state() === 'run') bad.push('stream ' + n + ': still timing a minute after the last sample');
        }
        ok(bad.length === 0 && handed >= 40, '60 pairs of series (either may be missing, late, uneven or go silent): ' + handed + ' runs handed over, each from an engine that finished it, none mixed' + (bad.length ? '. FIRST PROBLEMS: ' + bad.slice(0, 3).join(' | ') : ''));
        // the helpers
        let threw = null;
        try {
            const g = new Gps.GpsScale({ saved: { rmc: 'x', legs: [1, 2] } }), w = new Wheels.WheelFactors({ saved: 7 }), sl = new Slope.StartSlope(), sp = new Wheels.WheelSpin(), es = new Wheels.AccelSpin();
            const junk = [undefined, null, NaN, Infinity, -1, 0, 1e12, '', 'x', {}, [], true, '$GPRMC,,,,,,,,,,,,*00', '$$$***', nmea('GPRMC,1,A,,,,,abc,,,,,'), nmea('GPGGA,,,,,,x,y,z,q,M,,M,,')];
            let t = 0;
            for (let i = 0; i < 3000; i++, t += 37) {
                const a = junk[Math.floor(rand() * junk.length)], b = junk[Math.floor(rand() * junk.length)], c = junk[Math.floor(rand() * junk.length)];
                g.speed(t, a); g.speed(a, b); g.nmea(t, a); g.nmea(a, b); g.position(t, a, b, 'gps'); g.position(t, 91, 181, 'nav'); g.position(a, b, c, c); g.heightCan(t, a); g.heightCan(a, b);
                g.speed(t, 60 + rand() * 80); g.position(t, 45 + rand(), 9 + rand(), rand() < 0.5 ? 'gps' : 'nav'); g.height(a); g.status(a); g.result();
                w.speed(t, a); w.wheels(t, Wheels.rawWheels(a)); w.wheels(a, { fl: a, fr: b, rl: c, rr: 0 }); w.wheels(t, { fl: 0, fr: 0, rl: 0, rr: 0 }); w.kmh(a); w.kmh({ fl: a, fr: b, rl: c, rr: a }); w.status();
                sl.accel(t, a); sl.accel(a, b); sl.before(a, b); sl.before(t, a); sl.standing(a, b); Slope.laneSlope(a); Slope.downhill(a, b);
                sp.launch(t - 100); sp.speed(t, a, b); sp.wheels(t, a); sp.wheels(t, { fl: a, fr: b, rl: c, rr: 1 }); sp.result(a);
                es.accel(t, a); es.speed(t, a); es.launch(a); es.accel(a, b); es.result();
                Gps.scaleFor(a, b, c); Gps.scaleFor('gps', a, { factor: b, method: 'rmc' }); Gps.heightChange(a, b, c); Gps.decodeGpsCan(a); Gps.decodeHeightCan(a); Gps.gpsCanPosition(a); Gps.navPosition(a); Gps.parseNmea(a);
            }
            const out = JSON.stringify([g.export(a2n(1)), g.status(t), w.export(), w.status()]);
            if (/NaN|Infinity/.test(out)) threw = 'not a number in ' + out.slice(0, 200);
            const res = g.result();
            if (res && !(res.factor >= 0.9 && res.factor <= 1.1)) threw = 'a factor of ' + res.factor;
        } catch (e) { threw = e && e.stack || e; }
        ok(threw === null, 'GPS, wheel and slope helpers fed 3000 rounds of nonsense in every argument: nothing throws, nothing but numbers in the saved file, no factor outside 0.90 to 1.10' + (threw ? '. PROBLEM: ' + threw : ''));
    });

    /* ================= the app's manifest and the modules' manners ================= */
    await ok.part('read only, and pure', async () => {
        const manifest = JSON.parse(fs.readFileSync(path.join(path.resolve(process.argv[2]), 'source', 'manifest.json'), 'utf8')).proxies;
        const spec = JSON.parse(fs.readFileSync(path.join(JS, 'kit', 'app-spec.json'), 'utf8'));
        const mine = ['de.bmw.infotainment.vehicle.Vehicle2', 'de.bmw.infotainment.vehicle.CDS2', 'de.bmw.powertrain.Powertrain', 'de.bmw.infotainment.SatellitePositioning',
            'de.bmw.infotainment.GPSData', 'de.bmw.infotainment.navigation.positioning.Positioning', 'de.bmw.chassis.VehicleModel'];
        ok(mine.every((i) => manifest[i]), 'the built app asks for its seven interfaces');
        ok(mine.every((i) => !manifest[i].methods && Object.keys(manifest[i].attributes || {}).every((f) => /^[rs]+$/.test(manifest[i].attributes[f]))),
            'of them it asks only to read (r) and to be notified (s): no field with write access, no method');
        const events = mine.reduce((n, i) => n + (manifest[i].broadcasts || []).length, 0);
        ok(events === 1 && manifest['de.bmw.infotainment.SatellitePositioning'].broadcasts[0] === 'updatePosition', 'and one event: the GPS receiver\'s sentences');
        ok(!Object.keys(manifest).some((i) => /tasu/i.test(i)), 'the diagnostic link (TASU) is not in the manifest at all');
        ok(manifest['de.bmw.infotainment.vehicle.Vehicle2'].attributes.statusCarSpeed2 === 'rs', 'the speed is both notified and read');
        const set = (k) => spec.settings.find((s) => s.key === k);
        ok(set('demo').default === 'off' && set('start').default === 'slip' && set('scale').default === 'gps' && set('slopeLimit').default === '1' && set('speedUnit').default === 'kmh' && set('workshop').default === false,
            'settings as shipped: demo off, start "slip", scale from GPS, downhill limit 1 %, km/h, workshop off');
        const sm = set('scaleManual');
        ok(sm.steps.length === 33 && sm.steps.length <= 35 && sm.steps[0] === -400 && sm.steps[32] === 400 && sm.steps.every((x, i) => i === 0 || x - sm.steps[i - 1] === 25) && sm.default === 0 &&
            sm.labels['125'] === '+1.25 %' && sm.labels['-50'] === '-0.50 %' && sm.labels['0'] === '0.00 %' && sm.labels['-400'] === '-4.00 %' && Object.keys(sm.labels).length === 33 && /\+: the car reads low/.test(sm.label),
            'manual scale: a list of 33 rows, -4.00 % to +4.00 % in steps of 0.25 %, shown as "+1.25 %", and its label says which way + goes. WAS: 101 rows (-5.0 % to +5.0 % in tenths); the longest list in any app of the kit has 35, and how the head unit takes a longer one is not known');
        ok(sm.steps.every((x) => Math.abs(Gps.scaleFor('manual', x, null).factor - (1 + x / 10000)) < 1e-12 && Gps.scaleFor('manual', x, null).label === 'MANUAL ' + (x === 0 ? '+0.00 %' : sm.labels[String(x)])),
            'every row of the list gives the factor 1 + value and the label of its row');
        ok(set('scale').when.workshop === true && set('scaleManual').when.workshop === true && set('scaleManual').when.scale === 'manual', 'the speed scale settings are workshop settings');
        ok(spec.title === 'Proven Drag' && spec.screens[0].buttons.map((b) => b[0]).join() === 'BTN_ACTION,BTN_PAGE,BTN_PREV,BTN_SETTINGS', 'one canvas screen with the Drag Timer\'s four buttons');
        const pure = ['run.js', 'feed.js', 'gpsscale.js', 'wheels.js', 'slope.js', 'steady.js'];
        const src = {};
        pure.forEach((f) => { src[f] = fs.readFileSync(path.join(JS, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''); });
        ok(pure.every((f) => !/Date\.now|new Date|process\.hrtime|performance\.now/.test(src[f])), 'run, feed, gpsscale, wheels, slope, steady: none reads a clock (time comes in as an argument)');
        ok(pure.every((f) => !/(^|[^.\w])(setTimeout|setInterval|setImmediate)\s*\(/.test(src[f])), 'none starts a timer of its own (the poll scheduler uses the clock it is handed)');
        ok(pure.every((f) => (src[f].match(/require\(([^)]*)\)/g) || []).every((r) => /require\('\.\/(run|steady)'\)/.test(r))), 'none loads the kit\'s signals, the diagnostics or the file system: only each other');
        ok(pure.every((f) => fs.readFileSync(path.join(JS, f), 'utf8').indexOf(String.fromCharCode(8212)) < 0), 'and no em dash in any of them');
    });

    ok.done();
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
