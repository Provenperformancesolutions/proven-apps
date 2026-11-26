'use strict';
/**
 * test_drift_car.js <built app: dist/pps_drift> [folder for pictures [sizes]] - the whole Proven Drift app on a
 * stand-in car (fakedrift.js): app.js with car.js, session.js, the engine, store.js, box.js and the six pages, on the
 * kit's PC stand-in for the head unit and on clocks the test moves by hand. What test_drift.js (the engine on its
 * own) cannot reach: what the app subscribes to and reads, which source it takes, the saved file, the log, the
 * settings, the words on the screens and whether they fit.
 *
 * The drives are driftsim.js's scenes, so the true drift angle is known at every moment. With a folder as second
 * argument a picture of each screen state drawn is saved there (the kit's software renderer, PC size). With
 * "sizes" as third argument each state is also saved as it is drawn for iDrive 7 and iDrive 8
 * (<state>-<tab>-id7.png, -id8.png: 1.165 and 1.419 times the pixels, each glyph from the atlas that screen
 * takes; the page alone).
 *
 * What this cannot show: how a real car sends its signals, and how exact the angle is on one. Every rate, delay,
 * raw unit and value of the stand-in car is an assumption (fakedrift.js, driftsim.js), and the iDrive 7 / iDrive 8
 * text sizes are the kit's figures, not measured on a car by Proven. Version 1.0.0 was on one car (it closed by
 * itself there, and none of its screens was photographed): nothing in this test has been checked against a car.
 *
 * 1.0.1: AS SHIPPED the app subscribes to its core signals only and reads no getter itself. The parts marked
 * "(1.0.1)" check that. The parts that were written for 1.0.0 run with what 1.0.0 did without being asked
 * switched on in Settings (ALL: every extra, the app's own getter reads, and the front wheels' own angle as
 * the steering source), so that each of their checks still tests what it tested. Where a check had to change,
 * proven/CHANGES-drift.md part 9 lists it.
 *
 * PPS_TEST_ALL=1 in the environment: a failed check does not stop the run; they are listed at the end.
 */
const fs = require('fs'), os = require('os'), path = require('path');
const { checker } = require('./fakecar');
const fit = require('./textfit');

if (!process.argv[2]) { console.error('usage: node proven/tools/test_drift_car.js dist/pps_drift [folder for pictures [sizes]]'); process.exit(2); }
const APP = path.resolve(process.argv[2]), OUT = process.argv[3] ? path.resolve(process.argv[3]) : null, SIZED = process.argv[4] === 'sizes';
const ok = checker();
const bench = require('./fakedrift')(APP);
const { advance, clock, sim } = bench;
/** What 1.0.0 did without being asked: every extra, the app's own getter reads, the front wheels' own angle first. */
const ALL = Object.assign({}, bench.ALL_ON, { steerSource: 'front' });
/** A car with all of that switched on (the parts written for 1.0.0). */
const boot = (o) => bench.boot(Object.assign({}, o, { sets: Object.assign({}, ALL, o && o.sets) }));
/** A car as shipped: the core signals only, no getter reads of the app's own (opts.sets: what a test switches on). */
const bootShipped = (o) => bench.boot(o || {});
const JS = bench.JS, KIT = path.join(JS, 'kit');
const spec = JSON.parse(fs.readFileSync(path.join(KIT, 'app-spec.json'), 'utf8'));
// the manifest as it is in the repository, and what the build made of it for the installer
const APPJSON = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', 'apps', 'pps_drift', 'app.json'), 'utf8'));
const MANIFEST = JSON.parse(fs.readFileSync(path.join(APP, 'source', 'manifest.json'), 'utf8')), PKG = JSON.parse(fs.readFileSync(path.join(APP, 'source', 'package.json'), 'utf8'));
const FILE = 'pps_drift.json';
const DEG = Math.PI / 180;

/* ---------- what holds for every frame (as test_drag_car.js) ---------- */
const W = 1600, SCALES = [1, 1.16, 1.42], PAGES = ['drift', 'last', 'session', 'best', 'signals', 'study'], MODES = ['pc', 'id7', 'id8'];
const box = (t) => ({ x0: t.x0 + 1, x1: t.x0 + t.w - 1, y0: t.y - t.size * 0.70, y1: t.y });
function faults(texts, bottom) {
    const out = [];
    texts.forEach((t) => {
        if (!t.s.trim()) return;
        SCALES.forEach((sc) => {
            const f = bench.fonts.get(t.font, t.size * sc, t.s);
            const miss = f ? Array.from(t.s).filter((ch) => ch !== ' ' && !f.glyphs[ch.codePointAt(0)]) : Array.from(t.s);
            if (miss.length) out.push('"' + t.s + '" (' + t.font + ' ' + t.size + ' px, scale ' + sc + ') has no glyph for "' + miss.join('') + '"');
        });
        // on the screen, and inside the page's own margins (the panels end 24 px from either side)
        if (t.w > 0 && (t.x0 < 23.5 || t.x0 + t.w > W - 23.5)) out.push('"' + t.s + '" leaves the page (' + Math.round(t.x0) + ' to ' + Math.round(t.x0 + t.w) + ')');
        if (t.w > 0 && (t.y - t.size * 0.7 < 0 || t.y > bottom)) out.push('"' + t.s + '" leaves the page at the ' + (t.y > bottom ? 'bottom' : 'top') + ' (baseline ' + Math.round(t.y) + ')');
    });
    const live = texts.filter((t) => t.s.trim() && t.w > 0);
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
        const a = box(live[i]), b = box(live[j]);
        if (a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1) out.push('"' + live[i].s + '" and "' + live[j].s + '" overlap at ' + Math.round(Math.max(a.x0, b.x0)) + ',' + Math.round(Math.max(a.y0, b.y0)));
    }
    return out;
}
/** The first screen shows for 2.6 s after the app is first drawn, then the page fades in: draw once and let it pass. */
async function past(car) { if (car.past) return; car.past = true; await car.draw(); await advance(3200); }
let frames = 0;
const drawn = {};                   // state name -> { page: texts } (PC size), for the checks on the words
/** What is wrong with the frame as last drawn (car.draw()): the text rules of textfit.js. */
const wrong = (car, texts) => faults(texts, 514).concat(fit.crossings(texts, car.boxes));
/**
 * The six pages of a car as it is now (five tabs; "study" is the Signals tab's second page), at the PC's size and as on
 * iDrive 7 and iDrive 8 where the kit runs the screen: drawn, checked, and saved as pictures. Returns { drift, last, session,
 * best, signals, study }: the texts at PC size.
 */
async function screens(car, name, only) {
    const bad = [], all = {};
    await past(car);
    for (const mode of MODES) {
        car.mode = mode;
        for (let p = 0; p < PAGES.length; p++) {
            if (only !== undefined && only !== p) continue;
            await car.page(p);
            const texts = await car.draw();
            frames++;
            // (the page ends at 512; on iDrive 7 its lowest panels reach 49 px further down, their texts do not move)
            wrong(car, texts).forEach((f) => bad.push(mode + ' ' + PAGES[p] + ': ' + f));
            if (mode === 'pc') { all[PAGES[p]] = texts; if (OUT) await car.save(OUT, name + '-' + PAGES[p]); }
            else if (OUT && SIZED) car.saveSized(OUT, name + '-' + PAGES[p] + '-' + mode);
        }
    }
    car.mode = 'pc';
    await car.page(0);
    const errors = car.logged(/^ERROR |^WARN first render|\(\d+x\): /);
    ok(bad.length === 0 && errors.length === 0, name + ': ' + (only === undefined ? 'the six pages draw' : 'the ' + PAGES[only] + ' page draws') + ' at PC, iDrive 7 and iDrive 8 size: every letter has its glyph, no text on another, none off the page or over the edge of its box' +
        (bad.concat(errors).length ? ':\n        ' + bad.concat(errors).slice(0, 14).join('\n        ') : ''));
    drawn[name] = all;
    return all;
}
const has = (texts, s) => texts.some((t) => t.s === s);
const find = (texts, re) => texts.filter((t) => re.test(t.s));
const words = (texts) => texts.map((t) => t.s);
const fileOf = (car) => { try { return JSON.parse(fs.readFileSync(path.join(car.dataDir, FILE), 'utf8')); } catch (e) { return null; } };
const reads = (car, field, from, to) => car.calls.filter((c) => c.type === 'getValue' && c.field === field && c.t >= from && c.t < (to === undefined ? Infinity : to)).length;
const SPEED = 'statusCarSpeed2', CDS2_FIELDS = ['statusLateralAccelerationMassCenter', 'statusLongitudinalAccelerationMassCenter', 'statusYawVelocityVehicle'];
/** The session's drifts, oldest first. */
const drifts = (car) => car.session.sess.list.slice().reverse();
const lastDrift = (car) => car.session.sess.list[0] || null;
/** The last drift as the store keeps it (with its trace). */
const kept = (car) => car.store.data.drifts[0] || null;

/* ---------- a car that has been learned on an earlier drive ---------- */
let LEARNED = null;                 // what the first stand-in car's saved file held after its first drive: what was learned, no drift
/** A folder with a saved file as a car has it that was learned on an earlier drive (and, with drifts, what else it held). */
const tmpDirs = [];
process.on('exit', () => tmpDirs.forEach((d) => { try { fs.chmodSync(d, 0o700); fs.readdirSync(d).forEach((f) => fs.unlinkSync(path.join(d, f))); fs.rmdirSync(d); } catch (e) { /* gone */ } }));
function learnedDir(extra) {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pps-drift-learned-'));
    tmpDirs.push(d);
    fs.writeFileSync(path.join(d, FILE), JSON.stringify(Object.assign({ v: 1, best: { score: null, angle: null, time: null, dist: null }, drifts: [], learned: LEARNED }, extra)));
    return d;
}
/** Such a car, started, and its first screen already past (first: true keeps the first screen for the test to look at). */
const learnedCar = async (opts) => { const car = await boot(Object.assign({ dataDir: learnedDir() }, opts)); if (!(opts && opts.first)) await past(car); return car; };
/** A script of the test's own: from the car's state to v km/h, a drift of `deg` degrees for `secs` at `lat` g, and out again. */
const driftScript = (car, v, deg, secs, lat) => car.script().to(Math.max(2, Math.abs(v - car.state.v) / 9), { v, lat: 0, drift: 0, pedal: 0.3 }).hold(2.5)
    .to(1.2, { lat: lat || 0.75, drift: deg, spin: 0.3, pedal: 0.7 }).hold(secs).to(1, { lat: 0, drift: 0, spin: 0, pedal: 0.3 }).hold(3);

(async () => {
    /* ================= a first drive ================= */
    let first = null;
    await ok.part('a first drive: the first screen, a car that is not learned, learning it, a drift', async () => {
        const car = await boot({});
        first = car;
        // the first screen, at the three sizes
        const bad = [];
        let texts = null;
        for (const mode of MODES) { car.mode = mode; const t = await car.draw(); frames++; wrong(car, t).forEach((f) => bad.push(mode + ': ' + f)); if (mode === 'pc') { texts = t; if (OUT) await car.save(OUT, 'first-screen'); } else if (OUT && SIZED) car.saveSized(OUT, 'first-screen-' + mode); }
        car.mode = 'pc';
        ok(has(texts, 'CLOSED COURSE ONLY') && has(texts, 'Proven Drift. For closed circuits and skid pans only.') && find(texts, /^BETA: still being tested on cars\. The drift angle shown is an estimate\.$/).length === 1,
            'the first frame after the app is opened is the first screen: the logo, CLOSED COURSE ONLY, "For closed circuits and skid pans only", and that it is BETA and an estimate');
        ok(find(texts, /SPEED|READY|LEARNING|POINTS/).length === 0 && bad.length === 0 && car.frame && car.frame.layersUsed && car.frame.layersUsed.size >= 1,
            'nothing of the page shows with it, the logo is drawn, and its texts fit at the three sizes' + (bad.length ? ': ' + bad.slice(0, 4).join(' | ') : ''));
        car.past = true;
        await advance(3200);
        const s0 = await screens(car, 'not-learned');
        ok(has(s0.drift, 'LEARNING THE CAR') && has(s0.drift, 'Drive a few ordinary corners, left and right. Nothing is scored yet') && has(s0.drift, 'NOT LEARNED: NO SCORE'),
            'a car the app has never driven: LEARNING THE CAR, "Drive a few ordinary corners, left and right. Nothing is scored yet"');
        ok(has(s0.drift, 'BETA') && has(s0.last, 'BETA') && has(s0.session, 'BETA') && has(s0.best, 'BETA') && has(s0.signals, 'BETA') && has(s0.study, 'BETA') && !has(s0.drift, 'DEMO'), 'every tab carries the BETA badge (and no DEMO badge: this is the car\'s data)');
        ok(find(s0.drift, /^--$/).length >= 3 && has(s0.drift, '± --') && has(s0.drift, '0'), 'standing: no angle is shown ("--", "± --"), the speed is 0');
        ok(has(s0.last, 'No drift yet.') && has(s0.last, 'A drift starts at 10° or more, from 20 km/h.') && has(s0.last, 'For closed circuits and skid pans only.') && find(s0.last, /^BETA: still being tested on cars\. The angle is an estimate/).length === 1,
            'the Last tab: "No drift yet", when a drift starts, closed circuits only, BETA and estimate');
        ok(has(s0.session, '0 drifts') && has(s0.session, 'No drift yet in this session.') && has(s0.best, 'No saved drift yet.') && find(s0.best, /^no best yet$/).length === 4, 'the Session and Best tabs are empty');
        // (CHANGED for 1.0.1: 20 sources on two tabs. The steering wheel's angle has a second row for its second field name,
        // which this stand-in car does not send; the getter's row, the GPS and the study rows are on the Study tab)
        ok(find(s0.signals, /^present/).length === 12 && find(s0.signals, /^no data yet$/).length === 1 && find(s0.study, /^present/).length === 7 && find(s0.signals, /^present, in use$/).length === 2 && find(s0.study, /^present, in use$/).length === 1 &&
            find(s0.signals, /: NOT LEARNED$/).length === 2 && find(s0.signals, /ASSUMED/).length === 2,
            'the Signals and Study tabs, with every extra switched on: 19 of the 20 sources present (the steering wheel\'s second field name is not sent by this car), three of them in use (speed, yaw rate, steering), nothing learned, both signs ASSUMED');
        ok(find(s0.study, /^Car's motion estimate: angle \d+, curvature \d+, qualifier \d+$/).length === 1 && find(s0.study, /^BMW drift analyser, last: angle 214, distance 87, time 46, stars 3, of 5$/).length === 1,
            'with the study-only values raw on the Study tab: the car\'s own motion estimate, BMW\'s drift analyser');

        // a drift before anything is learned: shown, not counted
        let mid = null;
        await car.play('held', { mid: { at: 6500, fn: async () => { mid = { v: car.view(), s: await screens(car, 'not-learned-sliding', 0), truth: car.truthNow() }; } }, after: 2000 });
        ok(mid.v.live.state === 'ready' && mid.v.live.run === null && car.session.sess.count === 0 && has(mid.s.drift, 'LEARNING THE CAR'),
            'sliding at ' + mid.truth.drift.toFixed(0) + ' degrees before the car is learned: nothing is counted, the banner stays LEARNING THE CAR');
        ok(mid.v.live.angle === null && mid.v.live.pm === null && has(mid.s.drift, '± --') && !has(mid.s.drift, 'LEFT') && !has(mid.s.drift, 'RIGHT') && find(mid.s.drift, /^\d+$/).length >= 1,
            'and no angle is shown either ("--", "± --"; the speed is): on the stated default alone an angle means nothing on a car whose yaw rate is scaled otherwise, and nobody knows any car\'s');

        // ordinary driving: the car is learned
        const moving = clock.mono;
        await car.play('ordinary');
        const st1 = car.session.eng.learn.status();
        ok(car.logged(/^yaw rate \(cds2\): learning, /).length === 1 && car.logged(/^yaw rate \(cds2\): learned, /).length === 1 && st1.yaw.state === 'learned',
            'four minutes of ordinary driving: the yaw rate goes from "learning" to "learned" (' + st1.yaw.n + ' moments, ' + st1.yaw.left + ' left and ' + st1.yaw.right + ' right), and the log says both');
        ok(Math.abs(st1.yaw.k / DEG / 0.005 - 1) < 0.01 && Math.abs(st1.yaw.zero - 32768) < 5, 'its scale is right to ' + (Math.abs(st1.yaw.k / DEG / 0.005 - 1) * 100).toFixed(2) + ' %, its zero to ' + Math.abs(st1.yaw.zero - 32768).toFixed(1) + ' counts (the made-up car: 0.005 degrees a second per count, zero 32768)');
        ok(car.session.sess.count === 0, 'and ordinary driving was counted as no drift');
        const sp0 = { eng: car.session.eng.angle.speedS.count, p: car.session.meters.speedP.n, n: car.session.meters.speedN.n };
        await car.play('gentle');
        const sp1 = { eng: car.session.eng.angle.speedS.count - sp0.eng, p: car.session.meters.speedP.n - sp0.p, n: car.session.meters.speedN.n - sp0.n };
        ok(sp1.p > 900 && sp1.n > 150 && Math.abs(sp1.eng - sp1.p) <= 2, 'the engine is handed ONE speed series: of ' + sp1.p + ' speeds read from the getter and ' + sp1.n + ' the car notified in that time, it took ' + sp1.eng + ', the getter\'s');
        const st2 = car.session.eng.learn.status(), wb = car.session.eng.o.wheelbase;
        ok(st2.steer.state === 'learned' && Math.abs(st2.steer.k * wb / DEG / 0.01 - 1) < 0.06 && st2.left.known && st2.left.positiveIsLeft && st2.ax.known && st2.ax.positiveIsForward,
            'slow, gentle corners: the steering is learned (its scale right to ' + (Math.abs(st2.steer.k * wb / DEG / 0.01 - 1) * 100).toFixed(1) + ' %), and both signs are known');
        await car.run(car.script().to(5, { v: 0, pedal: 0 }).hold(14));
        const f1 = fileOf(car);
        ok(f1 && f1.v === 1 && f1.drifts.length === 0 && f1.learned && f1.learned.yaw.cds2.length >= 20 && f1.learned.steer['front/cds2'].length >= 14,
            'standing: what was learned is in the saved file (' + f1.learned.yaw.cds2.length + ' moments for the yaw rate, ' + f1.learned.steer['front/cds2'].length + ' for the steering), and no drift');
        LEARNED = f1.learned;
        const s1 = await screens(car, 'learned-standing');
        ok(has(s1.drift, 'TOO SLOW') && has(s1.drift, 'Drifts are counted from 20 km/h') && has(s1.drift, 'LEARNED'), 'the learned car standing: TOO SLOW, "Drifts are counted from 20 km/h"');
        ok(has(s1.signals, 'Yaw rate, CDS2: LEARNED') && find(s1.signals, /^ {4}0\.00\d+ °\/s per count \(x[01]\.\d{3} of the default\), zero 327\d\d\.\d$/).length === 1 && has(s1.signals, 'Steering, front wheels, chassis (set by hand): LEARNED') &&
            find(s1.signals, /^ {4}0\.00\d+° at the wheels per count, zero 327\d\d\.\d, wheelbase 2\.85 m$/).length === 1 && find(s1.signals, /^ {4}\d+ moments, \d+ left and \d+ right, spread \d\.\d %\. Learned: 20, 6 each way, within 8 %$/).length === 1 &&
            find(s1.signals, /known \(\d+ corners agree, 0 against\)$/).length === 1 && find(s1.signals, /known \(\d+ agree, 0 against\)$/).length === 1,
            'the Signals tab says what was learned: both scales with their zeros and moments, both signs known');
        const perSec = reads(car, SPEED, moving + 20000, moving + 60000) / 40;
        ok(perSec >= 9.5 && perSec <= 10.5 && car.mostInFlight === 1 && CDS2_FIELDS.every((f) => reads(car, f, 0) === 0),
            'on the move the speed getter is read ' + perSec.toFixed(1) + ' times a second, never two reads at once; the CDS2 getters are not read at all (the car sends those 50 times a second)');
        const t0 = clock.mono;
        await advance(4000);
        ok(reads(car, SPEED, t0) / 4 >= 1.75 && reads(car, SPEED, t0) / 4 <= 2.25, 'standing, it is read ' + (reads(car, SPEED, t0) / 4).toFixed(1) + ' times a second');

        // the first drift that counts
        const saves = car.store.saves;
        let run = null, wrote = null;
        // (ten looks a second: was a drift running or beginning, and how often had the file been written by then)
        const looks = [];
        const look = (at) => ({ at, fn: async () => { looks.push({ busy: car.session.eng.tracker.cur !== null, saves: car.store.saves }); } });
        const r = await car.play('held', { mid: [{ at: 6500, fn: async () => { run = { v: car.view(), s: await screens(car, 'drift'), truth: car.truthNow(), saves: car.store.saves }; } },
            { at: 12000, fn: async () => { wrote = { v: car.view(), s: await screens(car, 'drift-ended', 0), saves: car.store.saves }; } }].concat(Array.from({ length: 150 }, (_, i) => look(i * 100 - 3000))), after: 3000 });
        const rec = lastDrift(car);
        ok(run.v.live.state === 'drift' && has(run.s.drift, 'DRIFT') && has(run.s.drift, 'This drift') && has(run.s.drift, 'For closed circuits and skid pans only'), 'a held drift: the banner says DRIFT, with "For closed circuits and skid pans only" beside it');
        ok(Math.abs(run.v.live.angle - run.truth.drift) < 2 && run.v.live.dir === 'L' && has(run.s.drift, 'LEFT') && has(run.s.drift, run.v.live.angle.toFixed(0)),
            'the angle shown is ' + run.v.live.angle.toFixed(1) + ' LEFT where the made-up car\'s is ' + run.truth.drift.toFixed(1) + ', with its ± (' + run.v.live.pm.toFixed(1) + ')');
        ok(run.v.live.run.score > 50 && run.v.live.run.mult > 1.1 && has(run.s.drift, String(run.v.live.run.score)) && has(run.s.drift, 'x' + run.v.live.run.mult.toFixed(2)) && has(run.s.drift, run.v.live.run.time.toFixed(1)),
            'the running score (' + run.v.live.run.score + '), multiplier (x' + run.v.live.run.mult.toFixed(2) + ') and time (' + run.v.live.run.time.toFixed(1) + ' s) are on the page');
        ok(find(run.s.drift, /^\d+°$/).length === 1 && find(run.s.drift, /^\d+ %$/).length === 1 && run.v.live.opp > 15 && run.v.live.wheelspin > 20 && !has(run.s.drift, 'PEDAL') && run.v.live.pedal === null,
            // (CHANGED for 1.0.1: three bars with the pedal's. No pedal percentage is shown anywhere now: its form on a car is not known)
            'with the two bars: opposite lock ' + run.v.live.opp.toFixed(0) + ' degrees, rear wheelspin ' + run.v.live.wheelspin.toFixed(0) + ' % (the made-up car spins its rear wheels by 35 %; its wheel values had proven themselves on the road before). There is no PEDAL bar');
        ok(rec && Math.abs(rec.peak - 30.1) < 2 && Math.abs(rec.time - 6.5) < 0.4 && rec.dir === 'L' && rec.switches === 0 && rec.flags.length === 0 && rec.end === 'ended',
            'the finished drift: peak ' + rec.peak + ' degrees LEFT (the made-up car: 30.1), ' + rec.time + ' s (6.5), no flag');
        ok(rec.score > 300 && rec.score < 450 && rec.grade === 'C' && rec.dist > 100 && rec.entry > 65 && rec.peakG > 0.6 && rec.opp > 20 && rec.pedal === null && rec.wheelspin > 25 && rec.handbrake === false && kept(car).trace && kept(car).trace.a.length > 30,
            rec.score + ' points, grade ' + rec.grade + ', with its data: ' + rec.dist + ' m, entry ' + rec.entry + ' km/h, ' + rec.peakG + ' g, opposite lock ' + rec.opp + ', no pedal figure (CHANGED for 1.0.1: it was "pedal > 50 %"), wheelspin ' + rec.wheelspin + ' %, no handbrake, a trace of ' + kept(car).trace.a.length + ' points');
        ok(wrote.v.live.ended && has(wrote.s.drift, 'DRIFT ENDED') && has(wrote.s.drift, rec.score + ' points, grade C. NEW BEST: SCORE, ANGLE, TIME, DISTANCE') && has(wrote.s.drift, 'Last drift'),
            'after it: DRIFT ENDED, "' + rec.score + ' points, grade C. NEW BEST: SCORE, ANGLE, TIME, DISTANCE"');
        // (CHANGED for 1.0.1: what was learned is now written every 20 s on the move instead of every 2 minutes, so "written once
        // after it" no longer holds for every drive. The rule it stood for is checked itself: never a write while a drift runs)
        const during = looks.filter((l, i) => i > 0 && l.busy && looks[i - 1].busy && l.saves !== looks[i - 1].saves).length, busyLooks = looks.filter((l) => l.busy).length;
        ok(during === 0 && busyLooks >= 55 && car.store.saves >= saves + 1 && wrote.saves >= run.saves + 1, 'the saved file was never written while the drift ran or was beginning (' + busyLooks + ' looks, ten a second), and it was written after it (' + (car.store.saves - saves) + ' writes in the whole scene)');
        const f2 = fileOf(car);
        ok(f2.drifts.length === 1 && f2.drifts[0].score === rec.score && f2.best.score.score === rec.score && f2.best.angle.peak === rec.peak && f2.best.time.time === rec.time && f2.best.dist.dist === rec.dist && f2.drifts[0].trace.a.length === kept(car).trace.a.length && f2.best.score.trace === null,
            'it holds the drift with its trace, and the four bests (each without a trace)');
        const s2 = await screens(car, 'after-drift');
        ok(has(s2.last, String(rec.score)) && has(s2.last, 'C') && has(s2.last, rec.peak.toFixed(1) + '° LEFT') && has(s2.last, rec.time.toFixed(2) + ' s') && has(s2.last, rec.dist.toFixed(0) + ' m') && has(s2.last, 'no') && has(s2.last, 'NEW BEST: SCORE, ANGLE, TIME, DISTANCE'),
            'the Last tab has it: score, grade, peak angle and side, time, distance, handbrake "no", NEW BEST');
        ok(['PEAK ANGLE', 'AVERAGE ANGLE', 'ANGLE ±', 'TIME', 'DISTANCE', 'SWITCHES', 'ENTRY SPEED', 'AVERAGE SPEED', 'LOWEST SPEED', 'PEAK SIDEWAYS G', 'PEAK YAW RATE', 'MOST OPPOSITE LOCK', 'PEAK REAR WHEELSPIN', 'HANDBRAKE AT THE START', 'SMOOTHNESS', 'DATA', 'GPS SPEED / CAR SPEED'].every((l) => has(s2.last, l)) && !has(s2.last, 'AVERAGE PEDAL') && find(s2.last, /PEDAL/).length === 0,
            // (CHANGED for 1.0.1: eighteen with AVERAGE PEDAL. No pedal figure is shown: the layout is closed up, five rows of three and one of two)
            'with seventeen figures under their names; AVERAGE PEDAL is gone and nothing of the pedal is on the page');
        ok(find(s2.last, /^ANGLE, DEGREES: TO THE LEFT \(SHOWN BELOW THE LINE\)$/).length === 1 && find(s2.last, /^SPEED, KM\/H, OVER THE SECONDS OF THE DRIFT$/).length === 1 && has(s2.last, '-30') && has(s2.last, 'No flag: nothing in the data speaks against this drift. It can be a best.'),
            'the trace of angle and speed with its scales, and "No flag"');
        ok(has(s2.session, '1 drift') && has(s2.session, rec.score + ', grade C') && has(s2.session, rec.peak.toFixed(1) + '° LEFT') && has(s2.best, rec.peak.toFixed(1) + '°') && find(s2.best, /^grade C {2}· {2}\d+\.\d° LEFT {2}· {2}\d\.\d s {2}· {2}24\.11\.2026 \d\d:\d\d$/).length === 1,
            'the Session tab counts it, the Best tab has the four bests with their date');
        ok(car.logged(/^drift 1: \d+ points, grade C, ended \| peak \d\d\.\d deg LEFT, .* \| flags: none \| new best: score, angle, time, dist$/).length === 1, 'and the log has its line: ' + car.logged(/^drift 1: /)[0].slice(0, 150) + ' ...');
        void r;
    });

    /* ================= every kind of drift ================= */
    let second = null;
    await ok.part('switches, a spin, a handbrake entry, a drift to the right, a long circle', async () => {
        const car = await learnedCar({});
        second = car;
        const s0 = await screens(car, 'learned-on-an-earlier-drive', 0);
        ok(car.view().live.learn === 'learned' && has(s0.drift, 'TOO SLOW') && car.logged(/^learned from the saved file: yaw rate \(cds2\) learned with \d+ moments, steering \(front\) learned with \d+$/).length === 1,
            'a car that was learned on an earlier drive is "learned" from the first moment (the saved file), and the log says so');
        let mid = null;
        await car.play('switches', { mid: { at: 8200, fn: async () => { mid = { v: car.view(), s: await screens(car, 'switch', 0) }; } }, after: 2500 });
        let rec = lastDrift(car);
        ok(mid.v.live.switched && has(mid.s.drift, 'SWITCH') && has(mid.s.drift, 'RIGHT'), 'three drifts joined by two changes of direction: after the first change the banner says SWITCH');
        ok(car.session.sess.count === 1 && rec.switches === 2 && rec.flags.length === 0 && rec.score > 900 && rec.grade === 'B' && rec.mult > 2 && Math.abs(rec.time - 10.6) < 0.5,
            'it is ONE drift with 2 switches: ' + rec.score + ' points, grade ' + rec.grade + ', multiplier x' + rec.mult + ', ' + rec.time + ' s');
        let s = await screens(car, 'after-switches', 1);
        ok(has(s.last, '2, multiplier x' + rec.mult.toFixed(2)) && find(s.last, /^ANGLE, DEGREES: ABOVE THE LINE RIGHT, BELOW IT LEFT$/).length === 1, 'the Last tab says "2, multiplier x' + rec.mult.toFixed(2) + '", and its trace goes both ways');
        const bestBefore = car.store.data.best.score.score;

        await car.play('spin', { mid: { at: 9300, fn: async () => { mid = { v: car.view(), s: await screens(car, 'spin', 0) }; } }, after: 2000 });
        rec = lastDrift(car);
        ok(rec.end === 'spin' && rec.flags.join() === 'SPIN' && rec.peak >= 100 && has(mid.s.drift, 'SPIN') && find(mid.s.drift, /^\d+ points, grade [DC]: half the points, and no best$/).length === 1,
            'a drift that goes round: SPIN, "' + rec.score + ' points, grade ' + rec.grade + ': half the points, and no best"');
        ok(car.store.data.best.score.score === bestBefore && car.store.data.best.angle.peak < 100 && car.session.sess.angle.peak >= 100, 'it sets no all-time best (the biggest angle stays ' + car.store.data.best.angle.peak + '), but it counts in the session');
        s = await screens(car, 'after-spin', 1);
        ok(has(s.last, 'FLAGGED: SETS NO BEST') && has(s.last, 'SPIN: the car spun. Half the points are kept.'), 'the Last tab says the flag in words');

        await car.play('handbrake', { after: 2500 });
        rec = lastDrift(car);
        ok(car.session.sess.count === 3 && rec.handbrake === true && rec.flags.length === 0 && Math.abs(rec.peak - 39.1) < 3, 'a handbrake entry: counted, peak ' + rec.peak + ' (the made-up car: 39.1), and "handbrake at the start: yes"');
        s = await screens(car, 'after-handbrake', 1);
        ok(has(s.last, 'yes'), 'on the Last tab too');

        await car.play('right', { after: 2500 });
        rec = lastDrift(car);
        ok(rec.dir === 'R' && Math.abs(rec.peak - 21.8) < 2.5 && rec.flags.length === 0, 'a drift through a right-hander: ' + rec.peak + ' degrees RIGHT (21.8)');

        await car.play('circle', { after: 2500 });
        rec = lastDrift(car);
        ok(rec.time > 26 && rec.grade === 'A' && rec.flags.length === 0 && Math.abs(rec.peak - 36.6) < 3 && rec.gps && rec.gps.n >= 8 && Math.abs(rec.gps.ratio - 1) < 0.02,
            'a long circle at a held speed: ' + rec.time + ' s, ' + rec.score + ' points, grade A; the GPS receiver\'s speed over the car\'s was x' + rec.gps.ratio.toFixed(3) + ' over ' + rec.gps.n + ' sentences (this made-up car reports its true speed)');
        const S = car.session.sess;
        ok(S.count === 5 && S.total === drifts(car).reduce((a, r) => a + r.score, 0) && S.best.grade === 'A' && S.angle.end === 'spin' && S.time.time === rec.time && S.dist.dist === rec.dist,
            'the session: 5 drifts, ' + S.total + ' points in all, the best score and the longest drift the circle\'s, the biggest angle the spin\'s');
        s = await screens(car, 'five-drifts');
        ok(has(s.session, '5 drifts') && has(s.session, String(S.total)) && find(s.session, /^SPIN$/).length === 1 && find(s.session, /^[1-5]$/).length >= 5, 'the Session tab lists all five, the spin with its flag');
        ok(find(s.best, /^24\.11\. \d\d:\d\d$/).length === 5 && has(s.best, rec.time.toFixed(1)) && has(s.drift, S.total.toString()) && has(s.drift, S.best.score + ', GRADE A'), 'the Best tab has the saved list and the bests; the Drift tab\'s strip has the session');
        ok(find(s.study, /^GPS speed over the car's: straight x1\.00\d \(\d+\), in drifts at a held speed x1\.00\d \(\d+\)$/).length === 1, 'the Study tab has the GPS check: ' + find(s.study, /^GPS speed over/)[0].s);
        const f = fileOf(car);
        ok(f.drifts.length === 5 && f.drifts.filter((d) => d.trace).length === 5 && f.best.time.time === rec.time, 'all five are in the saved file');
        // two drifts with a moment of grip between them: the file waits until the second is over
        const saves = car.store.saves, seen = [];
        const look = (at) => ({ at, fn: async () => { seen.push({ n: car.session.sess.count, saves: car.store.saves, busy: car.session.eng.tracker.cur !== null }); } });
        const two = car.script().to(3, { v: 70, pedal: 0.3 }).hold(2.5).to(1.2, { lat: 0.75, drift: 28, spin: 0.3, pedal: 0.7 }).hold(3).to(0.7, { drift: 2, lat: 0.5 }).hold(0.75).to(0.7, { drift: 28, lat: 0.75 }).hold(3).to(1, { lat: 0, drift: 0, spin: 0 }).hold(4);
        await car.run(two, { mid: [look(12000), look(13500)] });
        ok(car.session.sess.count === 7 && seen[0].n === 6 && seen[0].busy && seen[0].saves === saves && seen[1].saves === saves && car.store.saves === saves + 1 && fileOf(car).drifts.length === 7,
            'a drift, 0.75 s of grip, and the next drift: they are two drifts, and the saved file was not written between them (the second had begun within a second) but once, after the second');
    });

    /* ================= the screen: nothing to touch, hidden, the Signals tab ================= */
    await ok.part('no tab needs a touch; the app works with its screen hidden; how often the speed is read', async () => {
        const car = await learnedCar({});
        // where the kit runs the screen itself an app can draw buttons on its page: this one draws none
        let targets = 0, pages = 0;
        for (const mode of ['id7', 'id8']) { car.mode = mode; for (let p = 0; p < PAGES.length; p++) { await car.page(p); await car.draw(); targets += car.targets.length; pages++; } }
        car.mode = 'pc'; await car.page(0);
        ok(targets === 0 && pages === 12 && Object.keys(car.hu.handlers).sort().join() === 'BTN_PAGE,BTN_PREV',
            'no tab draws a button on its page, on iDrive 7 or iDrive 8: nothing in the app needs a touch while driving. The only buttons the app listens to are the bar\'s "Next page" and "Previous page"');
        await car.press('BTN_PAGE');
        ok(has(await car.draw(), 'Last drift'), '"Next page" goes to the next tab');
        await car.press('BTN_PREV'); await car.press('BTN_PREV');
        ok(has(await car.draw(), 'Switched on in Workshop settings') && has(await car.draw(), 'SIGNALS, PAGE 2 OF 2'), '"Previous page" goes back, and round from the first tab to the last (CHANGED for 1.0.1: the last page is now the Signals tab\'s second)');
        await car.press('BTN_PREV');
        ok(has(await car.draw(), 'STARTS AND STOPS OF PROVEN DRIFT 1.0.1, NEWEST FIRST'), '(1.0.1) and once more to the Signals tab\'s first page');
        await car.hu.display.onTab(4);
        const again = await car.draw();
        await car.hu.display.onTab(4);
        ok(has(again, 'SIGNALS, PAGE 2 OF 2') && has(await car.draw(), 'STARTS AND STOPS OF PROVEN DRIFT 1.0.1, NEWEST FIRST') && find(await car.draw(), /^SIGNALS, PAGE 1 OF 2\. /).length === 1, '(1.0.1) the Signals tab touched while it shows changes between its two pages, and the first page says so');
        // the Signals tab showing: the speed is read 10 times a second also while the car stands, so that a photo shows its rate
        await car.page(4);
        const t0 = clock.mono;
        await advance(4000);
        await car.page(5);
        ok(reads(car, SPEED, t0) / 4 >= 9.5 && find(await car.draw(), /^10\/s$/).length >= 1, 'with "Ask the car for values" on and the Signals tab showing, the standing car\'s speed is read 10 times a second (' + (reads(car, SPEED, t0) / 4).toFixed(1) + '), and the getter\'s row (on the Study tab) says "10/s"');
        await car.page(0);
        // the screen hidden: a drift is counted all the same
        car.screen = false;
        await car.play('held', { after: 3000 });
        ok(car.session.sess.count === 1 && lastDrift(car).flags.length === 0 && fileOf(car).drifts.length === 1, 'with the app\'s screen hidden (another app in front) a drift is counted and saved all the same');
        const hid = clock.mono - 3000;
        await car.run(car.script().to(6, { v: 0, pedal: 0 }).hold(2));
        await advance(320000);
        // (CHANGED for 1.0.1: 1.0.0 read the speed getter every 2 s while parked with the screen hidden. Now nothing is read while it is hidden)
        ok(reads(car, SPEED, hid) === 0 && CDS2_FIELDS.every((f) => reads(car, f, hid) === 0) && car.view().live.state !== 'gap', 'with the screen hidden the app reads no getter at all, even with "Ask the car for values" on: 0 reads in the ' + Math.round((clock.mono - hid) / 1000) + ' s it was hidden, drifting and then parked (and the speed is not taken as lost: the notified one is in use)');
        const before = car.session.sess.count;
        car.screen = true;
        await advance(2000);
        ok(reads(car, SPEED, clock.mono - 1000) >= 2 && car.view().live.state !== 'gap' && car.session.sess.count === before, 'the screen is opened again: twice a second at once, and the speed was never taken as lost meanwhile');
        // (1.0.1) "Ask the car for values" on and the screen hidden while the speed HOLDS STILL: nothing is read and nothing is
        // notified, and that is a speed that has not changed, not a speed that is lost. Standing, then at a held 80 km/h.
        const held = [];
        const hide = async (name, drive) => {
            const shown = car.session.speedSeries(clock.mono);
            car.screen = false;
            const t = clock.mono;
            let lost = 0;
            for (let i = 0; i < 10; i++) { await drive(); if (car.view().live.state === 'gap' || car.session.stateWord() === 'nodata') lost++; }
            held.push({ name, shown, n: reads(car, SPEED, t + 300), lost, series: car.session.speedSeries(clock.mono) });
            car.screen = true;
            let after = 0;
            for (let i = 0; i < 20; i++) { await drive(0.1); if (car.view().live.state === 'gap') after++; }
            held[held.length - 1].after = after;
            held[held.length - 1].back = car.session.speedSeries(clock.mono);
        };
        await hide('standing', (s) => advance((s || 1) * 1000));
        await car.run(car.script().to(8, { v: 80 / 3.6, pedal: 0.3 }).hold(4));
        await hide('at a held 80 km/h', (s) => car.run(car.script().hold(s || 1)));
        ok(held.every((h) => h.shown === 'polled' && h.n === 0 && h.lost === 0 && h.series === 'notified' && h.after === 0 && h.back === 'polled'),
            '(1.0.1) with "Ask the car for values" on, the screen hidden for 10 s while the speed holds still (standing, then at a held 80 km/h): no getter is read, the engine is on the notified speed where silence is "no change", ' +
            'and the speed is never taken as lost, hidden or in the 2 s after the screen is opened again (then the getter is in use again): ' + held.map((h) => h.name + ' ' + h.n + ' reads, lost ' + h.lost + ' of 10 looks, ' + h.series + ', then ' + h.after + ' of 20, ' + h.back).join('; '));
    });

    /* ================= what must score nothing ================= */
    await ok.part('what must score nothing, through the whole app', async () => {
        const car = await learnedCar({});
        const seen = [];
        for (const name of ['lanechange', 'slalom', 'understeer', 'bumpy', 'braking', 'roundabout', 'banked']) {
            let worst = 0;
            await car.play(name, { mid: [1000, 2500, 4000, 5500, 7000].map((at) => ({ at, fn: async () => { const v = car.view().live; if (v.angle > worst) worst = v.angle; if (v.run) seen.push(name); } })), after: 1500 });
            ok(car.session.sess.count === 0, sim.SCENES[name].about + ': no drift (the angle shown reached ' + worst.toFixed(1) + ' degrees)');
        }
        ok(seen.length === 0 && car.store.data.drifts.length === 0, 'the banner never said DRIFT, and nothing went into the saved file');
    });

    /* ================= the optional sources ================= */
    await ok.part('every optional interface missing in turn, and all together', async () => {
        for (const name of bench.OPTIONAL.concat(['ALL'])) {
            const missing = name === 'ALL' ? bench.OPTIONAL : [name];
            // (the steering's sources in turn: with "Steering from" on Auto, as 1.0.0 shipped it. CHANGED for 1.0.1: Auto now starts
            // with the steering wheel's angle, so the log says: was "driver")
            const car = await learnedCar({ missing, sets: name === 'SteeringAngle' ? { steerSource: 'auto' } : {} });
            let mid = null;
            await car.play('held', { mid: { at: 6500, fn: async () => { mid = car.view().live; } }, after: 2500 });
            const rec = lastDrift(car);
            const gone = missing.every((m) => car.logged(new RegExp('^WARN signal ' + m + ': this head unit does not have it \\(optional: .*\\), not tried again$')).length === 1);
            // (no steering that the app has learned: the drift is counted and scored, flagged, and no best)
            const bare = name === 'SteeringAngle' || name === 'ALL';
            ok(rec && Math.abs(rec.peak - 30.1) < 3 && rec.flags.join() === (bare ? 'NO STEERING CHECK' : '') && rec.score > 280 && gone && (car.store.data.best.score === null) === bare,
                'without ' + (name === 'ALL' ? 'all ten' : name) + ': the drift is counted as before (peak ' + (rec ? rec.peak : '--') + ', ' + (rec ? rec.score : 0) + ' points, ' + (bare ? 'flagged NO STEERING CHECK: no best' : 'no flag') + '), the log says what is missing and what that costs');
            const calls = car.calls.filter((c) => c.type === 'watch');
            ok(missing.every((m) => calls.filter((c) => c.iface === m).length === 1), '  and a missing interface is asked for once, not again');
            const s = await screens(car, 'missing-' + name.toLowerCase());
            // (CHANGED for 1.0.1: the sources are on two tabs, and SteeringAngle carries three rows: the steering wheel's two field names and the front wheels)
            const rows = { SpeedAcceleration: 1, SteeringAngle: 3, XView: 2, AcceleratorPedal: 1, Powertrain: 1, CDS: 1, FES: 1, DrivingVector: 2, MDrive: 2, SatellitePositioning: 1, ALL: 15 }[name];
            ok(find(s.signals.concat(s.study), /^not on this unit$/).length === rows, '  the Signals and Study tabs say "not on this unit" for ' + (rows === 1 ? 'it' : 'the ' + rows + ' sources it carries'));
            const all = name === 'ALL';
            if (name === 'SpeedAcceleration' || all) ok(car.session.yawKey === 'cds2' && mid.learn === 'learned', '  no second yaw rate: CDS2\'s is in use, as it was');
            if (name === 'SteeringAngle') ok(car.session.steerKey === 'xfront' && car.logged(/^steering: source "xfront" in use from now on \(was "driver", which has delivered nothing\)$/).length === 1 && rec.opp === null && find(s.signals, /^Steering, front wheels, XView: NOT LEARNED$/).length === 1,
                '  no steering from the chassis: after 10 s XView\'s front wheel angle is in use. It is not learned yet, so this drift has no opposite lock and no steering check');
            // (CHANGED for 1.0.1: the standing line of a steering that is only not learned yet now says how far it is and at what speeds it learns)
            if (name === 'SteeringAngle') ok(find(s.drift, /^STEERING: \d+ OF 14 SLOW CORNERS/).length === 1 && has(s.drift, 'NO BEST IS SET UNTIL THEN. IT LEARNS AT 12 TO 60 KM/H') && find(s.signals, /Steering check: not learned yet$/).length === 1 && has(s.last, 'FLAGGED: SETS NO BEST') &&
                has(s.last, 'NO STEERING CHECK: the steering did not back this drift, so a banked corner cannot be told from a slide.') && find(s.session, /^STEER$/).length === 1 && car.logged(/^drift 1: .* \| the steering backed 0 % of its time \| flags: NO STEERING CHECK \| new best: none \(a flagged drift sets no best\)$/).length === 1,
                '  the Drift tab says so under the drawn car ("' + (find(s.drift, /^STEERING: /)[0] || { s: '' }).s + '", "NO BEST IS SET UNTIL THEN. IT LEARNS AT 12 TO 60 KM/H"), the Signals tab says why, the Last tab says the flag in words, the session list in short (STEER), and the log has the share of the drift that the steering backed');
            if (name === 'XView') ok(car.session.steerKey === 'front' && rec.opp > 20, '  no XView: the chassis steering is in use, opposite lock ' + rec.opp + ' degrees');
            if (name === 'AcceleratorPedal' || all) ok(rec.pedal === null && mid.pedal === null && find(s.last, /PEDAL/).length === 0 && find(s.drift, /PEDAL/).length === 0, '  no pedal: nothing changes, because nothing of the pedal is shown or kept with the pedal either (CHANGED for 1.0.1: its bar said "--", the average pedal "not known")');
            if (name === 'Powertrain' || all) ok(rec.wheelspin === null && mid.wheelspin === null, '  no wheel speeds: no rear wheelspin');
            if (name === 'CDS' || all) ok(rec.handbrake === null, '  no handbrake signal: "handbrake at the start: not known"');
            if (name === 'FES') ok(find(s.study, /^DSC button$/).length === 1 && car.session.raw.dsc === undefined, '  no DSC button state: nothing is shown for it');
            if (name === 'DrivingVector' || all) ok(has(s.study, 'Car\'s motion estimate: nothing yet') && has(s.study, 'The same, verified: nothing yet'), '  no motion estimate of the car\'s own: "nothing yet"');
            if (name === 'MDrive' || all) ok(has(s.study, 'BMW drift analyser, last: nothing yet') && has(s.study, 'BMW drift analyser, best: nothing yet'), '  no drift analyser of BMW\'s: "nothing yet"');
            if (name === 'SatellitePositioning' || all) ok(rec.gps === null && car.calls.filter((c) => c.type === 'on').length === 0 && find(s.study, /^GPS: no sentence yet/).length === 1, '  no GPS sentences: no cross-check, and no event is subscribed to');
            if (all) ok(car.session.steerKey === 'front' && rec.opp === null && mid.steering === false && mid.noSteer === 'nosource' && find(s.signals, /Steering check: no steering from the car$/).length === 1 && has(s.drift, 'NO STEERING FROM THE CAR: NO BEST IS SET') && rec.pm < 8,
                '  no steering at all: the angle is worked out without it (± ' + rec.pm + ' degrees on average through the drift), and the Drift tab says that no drift of this car sets a best');
            if (!bare) ok(mid.noSteer === null && find(s.drift, /NO BEST IS SET$/).length === 0 && car.logged(/^drift 1: .* \| the steering backed (8\d|9\d|100) % of its time \| flags: none /).length === 1, '  (the steering backed this drift, and no standing line shows)');
        }
        // a head unit that takes no event subscription
        const car = await learnedCar({ noEvent: true });
        await advance(3000);
        ok(car.logged(/^WARN signal SatellitePositioning error: event updatePosition: .*not tried again$/).length === 1, 'a head unit that refuses the event subscription: logged, and the app runs without GPS sentences');
    });

    /* ================= the yaw rate's two sources ================= */
    await ok.part('the yaw rate from the second source, by itself and by hand; no yaw rate at all', async () => {
        let car = await boot({ yawCds2: 'none' });
        await advance(4000);
        let s = await screens(car, 'yaw-cds2-no-value', 0);
        ok(car.view().live.state === 'noyaw' && has(s.drift, 'NO YAW RATE FROM THE CAR') && has(s.drift, 'Without it there is no angle, and nothing is scored') && car.session.yawKey === 'cds2',
            'CDS2\'s yaw rate reads the car\'s "no value" (65535) all the time: at first NO YAW RATE FROM THE CAR');
        await advance(9000);
        ok(car.session.yawKey === 'cds2' && car.session.yawPick.count.chassis < 20, 'the car stands, and the chassis\' yaw rate (sent on change) has said ' + car.session.yawPick.count.chassis + ' value: not enough to go by yet');
        let took = null;
        await car.play('ordinary', { mid: { at: 30000, fn: async () => { took = car.session.yawKey; } } });
        ok(took === 'chassis' && car.logged(/^yaw rate: source "chassis" in use from now on \(was "cds2", which has delivered nothing\)$/).length === 1, 'it drives round its first corners: with 20 values from it (and 10 s after the car was first heard) the chassis\' yaw rate is in use, and the log says so');
        const st = car.session.eng.learn.status();
        ok(st.yaw.key === 'chassis' && st.yaw.state === 'learned' && Math.abs(st.yaw.k / DEG / -0.0125 - 1) < 0.01 && Math.abs(st.yaw.zero - 32000) < 5,
            'it is learned on its own: ' + (st.yaw.k / DEG).toFixed(5) + ' degrees a second per count, zero ' + st.yaw.zero.toFixed(1) + ' (this source of the made-up car: -0.0125 and 32000, the sign turned round)');
        await car.play('gentle');
        await car.play('held', { after: 2500 });
        let rec = lastDrift(car);
        ok(rec && Math.abs(rec.peak - 30.1) < 2 && rec.flags.length === 0 && rec.dir === 'L', 'and a drift is read as on the other source: peak ' + rec.peak + ' LEFT, no flag');
        await car.run(car.script().to(5, { v: 0 }).hold(13));
        const f = fileOf(car);
        ok(f.learned.yaw.chassis.length >= 20 && !f.learned.yaw.cds2 && f.learned.steer['front/chassis'].length >= 14, 'the saved file keeps what was learned under the name of the source');
        s = await screens(car, 'yaw-from-the-chassis', 4);
        ok(has(s.signals, 'Yaw rate, chassis: LEARNED') && find(s.signals, /^ {4}-0\.012\d+ °\/s per count \(x-2\.\d{3} of the default\), zero 3\d{4}\.\d$/).length === 1 && has(s.signals, '65535'), 'the Signals tab says which source, its scale against the default, and CDS2\'s raw 65535');

        car = await learnedCar({ sets: { yawSource: 'chassis' } });
        await advance(3500);
        s = await screens(car, 'yaw-set-by-hand', 4);
        ok(car.session.yawKey === 'chassis' && has(s.signals, 'Yaw rate, chassis (set by hand): NOT LEARNED') && has(s.signals, '    the default stands: 0.005 °/s per count, zero 32768') && car.view().live.learn === 'none',
            '"Yaw rate from: Chassis" in Workshop settings: that source is in use at once. It has its own moments, so on this car it is not learned yet');
        car.settings.set('yawSource', 'auto');
        await advance(1200);
        ok(car.session.yawKey === 'chassis', 'back on "Auto" the source that delivers stays in use');
        car.settings.set('yawSource', 'cds2');
        await advance(1200);
        ok(car.session.yawKey === 'cds2' && car.session.eng.learn.status().yaw.state === 'learned' && car.logged(/^yaw rate: source "cds2" in use from now on \(was "chassis"\)$/).length === 1, 'set to CDS2 by hand: CDS2, and what was learned for it is there again');

        car = await learnedCar({ yawCds2: 'none', missing: ['SpeedAcceleration'] });
        let mid = null;
        await car.play('held', { mid: { at: 6500, fn: async () => { mid = { v: car.view(), s: await screens(car, 'no-yaw-rate') }; } }, after: 2500 });
        ok(mid.v.live.state === 'noyaw' && mid.v.live.angle === null && has(mid.s.drift, 'NO YAW RATE FROM THE CAR') && find(mid.s.drift, /^--$/).length >= 2 && car.session.sess.count === 0 && has(mid.s.drift, mid.v.live.kmh.toFixed(0)),
            'no yaw rate from either source: NO YAW RATE FROM THE CAR, no angle, and a drift is not counted (the speed is still shown)');
    });

    /* ================= how the speed and CDS2 arrive ================= */
    await ok.part('the speed notified only, read only, and lost; CDS2 not notified, notified slowly; a yaw rate that dies', async () => {
        let car = await learnedCar({ getter: false });
        await car.play('held', { after: 2500 });
        let rec = lastDrift(car), sv = car.session.signalsView(clock.mono);
        ok(rec && Math.abs(rec.peak - 30.1) < 2.5 && rec.flags.length === 0 && sv.inUse.speed === 'speedN' && car.session.maxAge === 0, 'a car whose speed getter never answers: the drift is counted on the notified speed (peak ' + rec.peak + ')');
        ok(car.logged(/^speed getter: a read failed/).length === 5 && /not logged again/.test(car.logged(/^speed getter: a read failed/)[4]), 'the failing getter is in the log five times, then no more');
        const t0 = clock.mono;
        await advance(20000);
        ok(reads(car, SPEED, t0) <= 11, 'and after ten failures in a row it is only tried every 2 s (' + reads(car, SPEED, t0) + ' reads in 20 s)');

        car = await learnedCar({ notifier: false });
        await car.play('held', { after: 2500 });
        rec = lastDrift(car); sv = car.session.signalsView(clock.mono);
        ok(rec && Math.abs(rec.peak - 30.1) < 2.5 && rec.flags.length === 0 && sv.inUse.speed === 'speedP' && car.session.maxAge === 1500, 'a car that never notifies its speed: the drift is counted on the getter\'s (peak ' + rec.peak + ')');
        // the speed stops arriving altogether, on a straight at a steady speed
        car.on.getter = false;
        await advance(2500);
        let s = await screens(car, 'speed-lost', 0);
        ok(car.view().live.state === 'gap' && has(s.drift, 'DATA LOST') && has(s.drift, 'A source the angle needs has gone silent') && find(s.drift, /^--$/).length >= 3, 'its getter stops answering: after 1.5 s DATA LOST, and neither an angle nor a speed is shown');
        car.on.getter = true;
        await advance(4500);
        ok(car.view().live.state === 'ready' && car.view().live.kmh > 60, 'it answers again: the angle and the speed are back');

        car = await learnedCar({});
        await car.run(car.script().to(7, { v: 66, pedal: 0.3 }).hold(4));
        car.on.getter = false;
        await advance(2500);
        ok(car.view().live.state === 'gap', 'a car that does both, at a steady speed: the getter stops, nothing is notified (the speed does not change), so the speed counts as lost');
        await car.run(car.script().to(3, { v: 76 }).hold(3));
        sv = car.session.signalsView(clock.mono);
        ok(car.view().live.state === 'ready' && sv.inUse.speed === 'speedN' && Math.abs(car.view().live.kmh - 76) < 1, 'the speed changes and the car notifies it: the app goes on with the notified speed');

        // CDS2 is never notified: its getters are read, one at a time
        car = await learnedCar({ cds2: 'silent' });
        await car.play('held', { after: 2500 });
        rec = lastDrift(car);
        ok(car.logged(/^CDS2: fewer than 8 notifications a second of yaw, lat, long while the car moves, reading the getter as well$/).length >= 1 && CDS2_FIELDS.every((f) => reads(car, f, 0) > 50),
            'a car that never notifies its yaw rate and accelerations: once it moves the app reads their getters, and the log says so');
        ok(car.mostAppInFlight === 1 && car.mostInFlight === 1, 'never two of the app\'s reads at once on one interface, and never two reads of one field (the kit\'s own counted)');
        ok(rec && Math.abs(rec.peak - 30.1) < 4 && rec.rate >= 8 && rec.rate <= 13, 'the drift is counted on what the getters give: peak ' + (rec ? rec.peak : '--') + ', ' + (rec ? rec.rate : '--') + ' samples a second, flags: ' + (rec && rec.flags.join(', ') || 'none'));
        const quiet = clock.mono;
        await car.run(car.script().to(6, { v: 0 }).hold(4));
        ok(CDS2_FIELDS.every((f) => reads(car, f, quiet + 7000) === 0) && car.logged(/^CDS2: its getters are left alone again$/).length >= 1, 'standing, they are left alone');

        car = await learnedCar({ cds2: 'slow' });
        await car.play('held', { after: 2500 });
        rec = lastDrift(car);
        ok(rec && Math.abs(rec.peak - 30.1) < 4 && CDS2_FIELDS.every((f) => reads(car, f, 0) > 50), 'a car that notifies them 4 times a second: the getters top it up, and the drift is counted (peak ' + (rec ? rec.peak : '--') + ', ' + (rec ? rec.rate : '--') + ' samples a second)');

        // the yaw rate dies in the middle of a drift
        car = await learnedCar({});
        let mid = null, late = null;
        await car.play('held', { mid: [{ at: 6500, fn: async () => { car.on.yaw = false; } }, { at: 8300, fn: async () => { mid = { v: car.view() }; } }, { at: 9500, fn: async () => { late = { v: car.view() }; } }], after: 2500 });
        rec = lastDrift(car);
        const sd = await screens(car, 'yaw-rate-died', 0);
        ok(rec && rec.end === 'lost' && rec.flags.indexOf('DATA GAP') >= 0 && car.view().live.state === 'noyaw' && has(sd.drift, 'NO YAW RATE FROM THE CAR') && car.store.data.best.score === null,
            'the yaw rate stops arriving in the middle of a drift (its getter too): the drift ends flagged DATA GAP and sets no best, and the banner says NO YAW RATE FROM THE CAR');
        ok(late.v.live.state === 'noyaw' && late.v.live.run === null && late.v.live.angle === null && rec.time > 4.8 && rec.time < 6.2,
            'it ended 2.5 s after the last yaw rate arrived (3 s after: NO YAW RATE FROM THE CAR, no angle, nothing counting; the drift was counted for ' + rec.time + ' s), in the middle of the held drift, where nothing else had changed yet');
        ok(mid.v.live.state === 'drift' && Math.abs(mid.v.live.angle - 30) < 4, 'KNOWN LIMIT: for those 2.5 s the drift went on from the last yaw rate. 1.8 s after it the banner still said DRIFT and the angle read ' + mid.v.live.angle.toFixed(1) +
            ' (the made-up car: 30): the app reads the getter only once the car has sent too few samples for 2 s, so a reading that holds still and one that has died cannot be told apart sooner');
        s = await screens(car, 'after-a-gap', 1);
        ok(has(s.last, 'DATA GAP: samples were missing, or the angle was lost, during the drift or just before it.') && has(s.last, 'FLAGGED: SETS NO BEST'), 'the Last tab says the flag in words');
        car.on.yaw = true;
        await car.run(car.script().to(2, { lat: 0, drift: 0 }).hold(6));
        await car.play('held', { after: 2500 });
        ok(car.session.sess.count === 2 && lastDrift(car).flags.length === 0, 'it comes back, the car goes straight for a moment, and the next drift counts without a flag');

        // all of CDS2 stops in the middle of a held drift: the yaw rate and both accelerations no longer notified, their getters no longer answered
        car = await learnedCar({});
        mid = null; late = null;
        await car.play('held', { mid: [{ at: 6500, fn: async () => { car.on.cds2 = 'off'; } }, { at: 8300, fn: async () => { mid = { v: car.view() }; } },
            { at: 9500, fn: async () => { late = { v: car.view(), s: await screens(car, 'cds2-died', 0) }; } }], after: 2500 });
        rec = lastDrift(car);
        ok(rec && car.session.sess.count === 1 && rec.end === 'lost' && rec.flags.indexOf('DATA GAP') >= 0 && rec.time > 4.8 && rec.time < 6.2 && car.store.data.best.score === null && car.store.data.best.time === null,
            'all of CDS2 stops in the middle of a held drift (nothing notified, no getter answered): the drift ends 2.5 s later, flagged DATA GAP, and sets no best (' + (rec ? rec.score + ' points, ' + rec.time + ' s, ended ' + rec.end : 'no drift') + ')');
        ok(late.v.live.state === 'noyaw' && late.v.live.angle === null && late.v.live.run === null && has(late.s.drift, 'NO YAW RATE FROM THE CAR') && has(late.s.drift, '± --') && !has(late.s.drift, 'READY') && !has(late.s.drift, 'This drift') &&
            late.v.live.rate === null && find(late.s.drift, /^\d+\/s$/).length === 0,
            '3 s after it stopped the Drift tab says NO YAW RATE FROM THE CAR and shows no angle and no data rate; nothing counts on');
        ok(mid.v.live.state === 'drift', 'KNOWN LIMIT: for those 2.5 s the drift went on from the last values (1.8 s after: DRIFT, ' + mid.v.live.run.score + ' points)');
        await car.run(car.script().to(1, { lat: 0, drift: 0, spin: 0, pedal: 0.3 }).hold(20));
        ok(car.session.sess.count === 1 && car.view().live.state === 'noyaw' && car.view().live.angle === null, 'the car drives on for 20 s with CDS2 dead: no angle, nothing more is counted');
        car.on.cds2 = 'notify';
        await advance(5000);
        await car.play('held', { after: 2500 });
        ok(car.session.sess.count === 2 && lastDrift(car).flags.length === 0, 'CDS2 comes back, the car goes straight for a moment, and the next drift counts without a flag');

        // CDS2's service goes down on a straight, as the kit says it: no "0 degrees, READY" through a drift
        car = await learnedCar({});
        await car.run(car.script().to(7, { v: 60, pedal: 0.3 }).hold(4));
        car.on.cds2 = 'off'; car.service('CDS2', false);
        await advance(3200);
        s = await screens(car, 'cds2-down', 0);
        ok(car.view().live.state === 'noyaw' && car.view().live.angle === null && has(s.drift, 'NO YAW RATE FROM THE CAR') && !has(s.drift, 'READY') && !has(s.drift, 'STRAIGHT'),
            'CDS2\'s service goes down on a straight at 60 km/h: within 3.2 s the Drift tab says NO YAW RATE FROM THE CAR, not "0 degrees, STRAIGHT, READY"');
        mid = null;
        await car.play('held', { mid: { at: 6500, fn: async () => { mid = car.view().live; } }, after: 2500 });
        ok(car.session.sess.count === 0 && mid.state === 'noyaw' && mid.angle === null && mid.run === null, 'the car drifts with CDS2 down: nothing is shown as an angle and nothing is counted');
        car.service('CDS2', true); car.on.cds2 = 'notify';
        await advance(5000);
        await car.play('held', { after: 2500 });
        ok(car.session.sess.count === 1 && lastDrift(car).flags.length === 0, 'the service comes up again: the next drift counts without a flag');

        // all three CDS2 fields read the car's "no value" (65535) from the middle of a held drift on
        car = await learnedCar({});
        late = null;
        let junk = null;
        await car.play('held', { mid: [{ at: 6500, fn: async () => {
            car.on.cds2 = 'off';
            junk = setInterval(() => { car.send.lat({ lateralAccelerationCentreOfGravity: 65535 }); car.send.long({ longitudinalAccelerationCentreOfGravity: 65535 }); car.send.yaw({ yawVelocityVehicle: 65535 }); }, 20);
        } }, { at: 9500, fn: async () => { late = car.view().live; } }], after: 2500 });
        clearInterval(junk);
        rec = lastDrift(car);
        ok(rec && car.session.sess.count === 1 && rec.end === 'lost' && rec.flags.indexOf('DATA GAP') >= 0 && rec.time < 6.2 && late.state === 'noyaw' && late.run === null && car.store.data.best.score === null,
            'all three CDS2 fields send the car\'s "no value" (65535) from the middle of a held drift on: that is no sample, so the drift ends 2.5 s later, flagged DATA GAP (' + (rec ? rec.time + ' s' : 'no drift') + '), and no best is set');

        // an optional source that goes silent while the car drives: its last value stands
        car = await learnedCar({});
        await car.run(car.script().to(7, { v: 60, pedal: 0.3 }).hold(4));
        car.on.wheels = false; car.on.pedal = false;
        await advance(3000);
        await car.play('held', { mid: { at: 6500, fn: async () => { mid = car.view().live; } }, after: 2500 });
        rec = lastDrift(car);
        ok(rec && rec.flags.length === 0 && Math.abs(rec.peak - 30.1) < 2 && rec.wheelspin === null && mid.wheelspin === null, 'the wheel speeds go silent on a straight: the next drift is counted as ever, and its rear wheelspin is "not known" (a wheel reading older than a second is not used)');
        // (CHANGED for 1.0.1: this was a KNOWN LIMIT, "the pedal goes silent with them, and its last value stands". No pedal figure is worked out any more, so the limit is gone with it)
        ok(rec.pedal === null && mid.pedal === null, 'the pedal goes silent with them: nothing follows, no pedal figure is worked out at all (1.0.0 let its last value stand)');
        car = await learnedCar({});
        await car.run(car.script().to(7, { v: 60, pedal: 0.3 }).hold(4));
        ['front', 'xfront', 'driver', 'xdriver'].forEach((k) => { car.on[k] = false; });
        await advance(3000);
        await car.play('held', { after: 2500 });
        const big = lastDrift(car);
        await car.run(driftScript(car, 70, 13, 5, 0.7));
        const small = lastDrift(car);
        ok(car.session.sess.count === 2 && Math.abs(big.peak - 30.1) < 2 && big.flags.join() === 'NO STEERING CHECK' && big.opp === null && car.view().live.noSteer === 'stale',
            'every steering source goes silent on a straight. To the app that is a steering wheel held still, until the car has turned in and the steering has still said nothing for 2 s: from then on it is not used. A drift of 30 degrees is read right (' + big.peak +
            '), its opposite lock says "not known", and it is flagged NO STEERING CHECK');
        ok(small.peak < 14.5 && small.peak > 12 && small.flags.join() === 'NO STEERING CHECK' && car.store.data.best.score === null, '  and a drift of 13 degrees reads ' + small.peak + ' (it read 11.9 while the silent wheel was believed, and no flag said so): flagged the same, no best');
        const sil = await screens(car, 'steering-silent');
        ok(has(sil.drift, 'STEERING SILENT OR STUCK: NO BEST IS SET') && find(sil.signals, /Steering check: the steering is silent or stuck$/).length === 1, '  the Drift tab and the Signals tab say that the steering is silent or stuck');
        // a steering value that is still SENT and does not move: every steering source stuck at what it read on a straight
        car = await learnedCar({});
        await car.run(car.script().to(7, { v: 60, pedal: 0.3 }).hold(4));
        const stuckKeys = ['front', 'xfront', 'driver', 'xdriver'], stuckAt = {};
        stuckKeys.forEach((k) => { stuckAt[k] = car.value[k](clock.mono); car.on[k] = false; });
        const resend = stuckKeys.map((k) => setInterval(() => car.send[k](stuckAt[k]), k[0] === 'x' ? 50 : 20));
        await advance(3000);
        const onStraight = car.view().live.noSteer, n0 = car.session.signalsView(clock.mono).meters.steerF.n;
        // (first an ordinary corner, nothing slides: 0.4 g at 60 km/h for 5 s; then a drift of 30 degrees)
        await car.run(car.script().to(1.5, { lat: 0.4 }).hold(5).to(1.5, { lat: 0 }).hold(3));
        const afterCorner = car.view().live.noSteer, countedInCorner = car.session.sess.count;
        await car.play('held', { after: 2500 });
        const stuckRec = lastDrift(car), stk = await screens(car, 'steering-stuck');
        ok(onStraight === null && afterCorner === 'stale' && countedInCorner === 0 && car.session.signalsView(clock.mono).meters.steerF.n > n0 + 500,
            'every steering source goes on sending the value it had on a straight (stuck, not silent: ' + (car.session.signalsView(clock.mono).meters.steerF.n - n0) + ' more samples of the one in use). On the straight nothing shows that. After one ordinary corner the app takes it for stuck: the car went straight and then turned on a value that did not move by a count');
        ok(car.session.sess.count === 1 && Math.abs(stuckRec.peak - 30.1) < 2 && stuckRec.flags.join() === 'NO STEERING CHECK' && stuckRec.opp === null && car.store.data.best.score === null &&
            car.logged(/^drift 1: .* \| the steering backed 0 % of its time \| flags: NO STEERING CHECK \| new best: none /).length === 1,
            '  the drift after it is read without the steering (peak ' + stuckRec.peak + '), its opposite lock says "not known", it is flagged NO STEERING CHECK and sets no best');
        ok(has(stk.drift, 'STEERING SILENT OR STUCK: NO BEST IS SET') && find(stk.signals, /Steering check: the steering is silent or stuck$/).length === 1 && find(stk.signals, /^present, in use$/).length === 2,
            '  the Drift tab and the Signals tab say so with the words of a silent steering, while the Signals tab lists the source as present and in use');
        resend.forEach((id) => clearInterval(id));
        stuckKeys.forEach((k) => { car.on[k] = true; });
        await advance(3000);
        await car.play('held', { after: 2500 });
        ok(car.session.sess.count === 2 && lastDrift(car).flags.length === 0 && lastDrift(car).opp > 20 && car.view().live.noSteer === null, '  when the steering moves again it is used again: the next drift carries no flag (opposite lock ' + lastDrift(car).opp + ' degrees)');
        // a HEALTHY steering whose value sits still at the lock while the car's nose stops turning in the middle of a drift: neither silent nor stuck
        // (as the stand-in car sends its steering, on change only: a drift of 50 degrees, two corners joined by a straight slide of 1 s)
        car = await learnedCar({});
        const steerN = () => car.session.signalsView(clock.mono).meters.steerF.n;
        const slideSc = car.script().to(4, { v: 70, lat: 0, drift: 0, pedal: 0.3 }).hold(3).to(1.3, { lat: 0.78, drift: 50, spin: 0.3, pedal: 0.7 }).hold(3).to(0.8, { lat: 0, v: 67 }).hold(1).to(0.8, { lat: 0.78 });
        const slideMid = slideSc.T * 1000 + 4000;
        slideSc.hold(8).to(1.3, { lat: 0, drift: 0, spin: 0, pedal: 0.3 }).hold(4);
        let atLock = null, inSlide = null;
        await car.run(slideSc, { mid: [{ at: 10000, fn: async () => { atLock = steerN(); } },
            { at: slideMid, fn: async () => { inSlide = { live: car.view().live, tru: Math.abs(car.truthNow().beta) / DEG, n: steerN(), drift: (await screens(car, 'lock-slide-running', 0)).drift }; } }] });
        const slideRec = lastDrift(car), sld = await screens(car, 'lock-slide');
        ok(car.session.sess.count === 1 && slideRec.flags.length === 0 && car.store.data.best.score !== null && car.store.data.best.score.score === slideRec.score && inSlide.n === atLock && inSlide.live.state === 'drift' && inSlide.live.noSteer === null && Math.abs(inSlide.live.angle - inSlide.tru) < 12,
            'a healthy steering at its lock (36 degrees) through a drift of 50 degrees in which the car slides straight for 1 s between two corners. The stand-in car sends its steering on change only, so the wheel is silent at its lock: not one sample in the ' +
            ((slideMid - 10000) / 1000).toFixed(1) + ' s up to 4 s into the second corner. It is ONE drift (' + (slideRec ? slideRec.score + ' points, peak ' + slideRec.peak : 'none') + ') with no flag, it sets the bests, and 4 s into the second corner ' + inSlide.live.angle.toFixed(1) + ' degrees are shown for ' + inSlide.tru.toFixed(1) +
            ' (the wheels at their lock pull the angle down, a known limit). Before, the wheel was taken for silent and the car for at rest in the slide: 22 shown for 50, two drifts, the second flagged');
        ok(find(inSlide.drift, /NO BEST IS SET$/).length === 0 && has(inSlide.drift, 'DRIFT') && find(sld.drift, /NO BEST IS SET$/).length === 0 && find(sld.signals, /Steering check: on$/).length === 1 && has(sld.last, 'NEW BEST: SCORE, ANGLE, TIME, DISTANCE') &&
            car.logged(/^drift 1: .* \| flags: none \| new best: score, angle, time, dist/).length === 1, '  no line STEERING SILENT OR STUCK under the drawn car, in the drift or after it; the Signals tab says "Steering check: on", the Last tab NEW BEST, the log "flags: none"');
        // (every steering source sends its true value in every slot: a drift of 55 degrees in which the driver lifts: the path bends on gently, the nose stops turning for about 0.7 s, the angle falls by 5.8 degrees and comes back)
        car = await learnedCar({});
        const liveKeys = ['front', 'xfront', 'driver', 'xdriver'];
        liveKeys.forEach((k) => { car.on[k] = false; });
        const liveSend = liveKeys.map((k) => setInterval(() => car.send[k](car.value[k](clock.mono)), k[0] === 'x' ? 50 : 20));
        const liftSc = car.script().to(4, { v: 70, lat: 0, drift: 0, pedal: 0.3 }).hold(3).to(1.3, { lat: 0.78, drift: 55, spin: 0.3, pedal: 0.7 }).hold(3).to(0.6, { lat: 0.25, pedal: 0.1, spin: 0.05 }).to(1.2, { drift: 49.2 }).to(1, { drift: 55, lat: 0.78, pedal: 0.7, spin: 0.3 });
        const liftMid = liftSc.T * 1000 + 4000;
        liftSc.hold(8).to(1.3, { lat: 0, drift: 0, spin: 0, pedal: 0.3 }).hold(4);
        let inLift = null;
        const liftN0 = steerN();
        await car.run(liftSc, { mid: [{ at: liftMid, fn: async () => { inLift = { live: car.view().live, tru: Math.abs(car.truthNow().beta) / DEG, n: steerN() - liftN0, drift: (await screens(car, 'lock-lift-running', 0)).drift }; } }] });
        liveSend.forEach((id) => clearInterval(id));
        liveKeys.forEach((k) => { car.on[k] = true; });
        const liftRec = lastDrift(car), lft = await screens(car, 'lock-lift');
        ok(car.session.sess.count === 1 && liftRec.flags.length === 0 && car.store.data.best.score !== null && car.store.data.best.score.score === liftRec.score && inLift.n > 500 && inLift.live.state === 'drift' && inLift.live.noSteer === null && Math.abs(inLift.live.angle - inLift.tru) < 16,
            'the same with every steering source sending its true value in every slot (' + inLift.n + ' samples of the one in use by then, the value still to the count at the lock), and a lift in a drift of 55 degrees: the nose stops turning for about 0.7 s and turns again. ONE drift (' +
            (liftRec ? liftRec.score + ' points, peak ' + liftRec.peak : 'none') + ') with no flag, the bests set, ' + inLift.live.angle.toFixed(1) + ' degrees shown for ' + inLift.tru.toFixed(1) + ' 4 s after the lift (the lock\'s known limit again). Before, the wheel was taken for stuck: the drift was flagged NO STEERING CHECK and set no best');
        ok(find(inLift.drift, /NO BEST IS SET$/).length === 0 && has(inLift.drift, 'DRIFT') && find(lft.drift, /NO BEST IS SET$/).length === 0 && find(lft.signals, /Steering check: on$/).length === 1 && find(lft.signals, /^present, in use$/).length === 2 &&
            car.logged(/^drift 1: .* \| flags: none \| new best: score, angle, time, dist/).length === 1, '  no line under the drawn car there either, "Steering check: on" on the Signals tab, "flags: none" in the log');
        // a steering value that FREEZES in an ordinary corner and is still sent, and with no straight between a banked corner the other way: the stuck rule and the rest rule must not hold each other up
        // (every steering source sends in every slot; 3 s into a corner of 0.45 g at 40 km/h each freezes at what it reads; 8 degrees of bank, 0.3 g at 40 km/h, 12 s; then a lap with full grip and ONE REAL drift of 40 degrees)
        car = await learnedCar({});
        const frzKeys = ['front', 'xfront', 'driver', 'xdriver'], frzAt = {};
        frzKeys.forEach((k) => { car.on[k] = false; });
        const frzSend = frzKeys.map((k) => setInterval(() => car.send[k](frzAt[k] !== undefined ? frzAt[k] : car.value[k](clock.mono)), k[0] === 'x' ? 50 : 20));
        const frzSc = car.script().to(4, { v: 40, lat: 0, drift: 0, pedal: 0.3 }).hold(3).to(1.5, { lat: 0.45 });
        const frzT = frzSc.T * 1000 + 3000;
        frzSc.hold(5).to(2.5, { lat: -0.3, bank: -8 }).hold(12).to(1.5, { lat: 0, bank: 0 }).hold(1).to(3, { v: 80, pedal: 0.3 }).hold(6).to(1.5, { lat: -0.6 }).hold(6).to(1.5, { lat: 0 }).hold(5).to(1.5, { lat: 0.5, v: 60 }).hold(6).to(1.5, { lat: 0 }).to(3, { v: 90 }).hold(6);
        const frzStraight = frzSc.T * 1000 - 2000;
        frzSc.to(2, { v: 70 }).hold(2).to(1.3, { lat: 0.78, drift: 40, spin: 0.3, pedal: 0.7 }).hold(8);
        const frzDrift = frzSc.T * 1000 - 3000;
        frzSc.to(1.3, { lat: 0, drift: 0, spin: 0, pedal: 0.3 }).hold(4);
        let frzDeg = null, onStr = null, inReal = null;
        await car.run(frzSc, { mid: [
            { at: frzT, fn: async () => { frzKeys.forEach((k) => { frzAt[k] = car.value[k](clock.mono); }); frzDeg = Math.abs(car.truthNow().delta) / DEG; } },
            { at: frzStraight, fn: async () => { onStr = { live: car.view().live, tru: Math.abs(car.truthNow().beta) / DEG, counted: car.session.sess.count, drift: (await screens(car, 'frozen-steering-straight', 0)).drift }; } },
            { at: frzDrift, fn: async () => { inReal = { live: car.view().live, tru: Math.abs(car.truthNow().beta) / DEG, drift: (await screens(car, 'frozen-steering-real-drift', 0)).drift }; } }] });
        frzSend.forEach((id) => clearInterval(id));
        const frzRec = lastDrift(car), frz = await screens(car, 'frozen-steering');
        ok(frzDeg > 2.5 && frzDeg < 10 && onStr.live.noSteer === 'stale' && onStr.live.blocked === false && onStr.live.state === 'ready' && onStr.live.angle !== null && onStr.live.angle < 2 && onStr.tru < 0.5 &&
            has(onStr.drift, 'STEERING SILENT OR STUCK: NO BEST IS SET') && has(onStr.drift, 'READY') && !has(onStr.drift, 'GO STRAIGHT FOR A MOMENT'),
            'every steering source freezes at what it reads 3 s into an ordinary corner (' + (frzDeg === null ? '--' : frzDeg.toFixed(1)) + ' degrees at the wheels) and goes on being sent; with no straight between, a banked corner the other way follows, in which the angle shown runs away. ' +
            'Two corners later, on a straight at 90 km/h: ' + (onStr.live.angle === null ? '--' : onStr.live.angle.toFixed(1)) + ' degrees are shown for ' + onStr.tru.toFixed(1) + ', the banner says READY and not GO STRAIGHT FOR A MOMENT, and the line under the drawn car says STEERING SILENT OR STUCK: NO BEST IS SET. ' +
            'Before, 38.4 degrees stood there, the banner said GO STRAIGHT FOR A MOMENT while the car went straight, and the steering was never named');
        ok(inReal.live.state === 'drift' && Math.abs(inReal.live.angle - inReal.tru) < 3 && inReal.tru > 38 && has(inReal.drift, 'DRIFT') && frzRec && Math.abs(frzRec.peak - 40) < 3 && frzRec.flags.join() === 'NO STEERING CHECK' && car.session.sess.count === onStr.counted + 1 &&
            car.session.sess.list.every((d) => d.flags.length > 0) && car.store.data.best.score === null && car.logged(/ \| flags: NO STEERING CHECK \| new best: none /).length === 1,
            '  the real drift of 40 degrees after it is counted (' + (frzRec ? frzRec.score + ' points, peak ' + frzRec.peak : 'none') + '; 5 s into it ' + inReal.live.angle.toFixed(1) + ' degrees are shown for ' + inReal.tru.toFixed(1) + '), flagged NO STEERING CHECK, and sets no best. ' +
            'Before, 2.7 degrees were shown for it and it was not counted. What was counted in the banked corner, where nothing slid, carries a flag too (' + car.session.sess.list.slice(1).map((d) => d.score + ' points [' + d.flags.join(', ') + ']').join(', ') + ')');
        ok(has(frz.drift, 'STEERING SILENT OR STUCK: NO BEST IS SET') && find(frz.signals, /Steering check: the steering is silent or stuck$/).length === 1 && find(frz.signals, /^present, in use$/).length === 2 && has(frz.last, 'FLAGGED: SETS NO BEST'),
            '  at the end the Drift tab and the Signals tab name the steering as silent or stuck, and the Last tab says FLAGGED: SETS NO BEST');
        frzKeys.forEach((k) => { car.on[k] = true; });
        // NO STEERING CHECK on a car whose steering is there, learned and switched on: the steering was read, and did not say oversteer
        car = await learnedCar({});
        await car.run(car.script().to(4, { v: 25, pedal: 0.2 }).hold(3));
        let inBank = null;
        await car.run(car.script().to(1.5, { lat: 0.2, bank: 10 }).hold(12).to(1.5, { lat: 0, bank: 0 }).hold(1.2), { mid: { at: 7000, fn: async () => { inBank = { live: car.view().live, drift: (await screens(car, 'banked-with-steering-running', 0)).drift }; } } });
        await advance(5000);
        const bk = lastDrift(car), bks = await screens(car, 'banked-with-steering');
        ok(car.session.sess.count === 1 && bk.flags.indexOf('NO STEERING CHECK') >= 0 && car.store.data.best.score === null && inBank.live.noSteer === null && inBank.live.state === 'drift' && car.truthNow().drift === 0,
            'a slow, tight banked corner taken with full grip on a car whose steering is learned and switched on (10 degrees of bank, 0.2 g at 25 km/h): it is counted (' + bk.score + ' points, peak ' + bk.peak + ', NOT SOLVED), flagged NO STEERING CHECK, and sets no best');
        ok(find(inBank.drift, /NO BEST IS SET$/).length === 0 && has(inBank.drift, 'DRIFT') && find(bks.drift, /NO BEST IS SET$/).length === 0 && find(bks.signals, /Steering check: on$/).length === 1 && has(bks.last, 'FLAGGED: SETS NO BEST') && has(bks.last, 'NO STEERING CHECK: the steering did not back this drift, so a banked corner cannot be told from a slide.') &&
            car.logged(/^drift 1: .* \| the steering backed 0 % of its time \| flags: .*NO STEERING CHECK/).length === 1,
            '  there the steering can be used, so no standing line shows under the drawn car and the Signals tab says "Steering check: on". The Last tab\'s sentence is true in this case too (the steering did not back this drift), and the log has the share: 0 %');
    });

    /* ================= sensors with faults; the app held up ================= */
    await ok.part('a car whose sensors have faults; the app held up in the middle of a drift', async () => {
        // driftsim.js's set of sensor faults, all at once: body roll 4.2 degrees per g, gain and zero errors, noise, a speed that reads 2 % high
        const car = await boot({ faults: sim.DIRTY });
        await past(car);
        await car.play('ordinary');
        await car.play('gentle');
        const st = car.session.eng.learn.status();
        ok(st.yaw.state === 'learned' && st.steer.state === 'learned' && st.yaw.k / DEG / 0.005 > 1.04 && st.yaw.k / DEG / 0.005 < 1.09 && st.left.known && st.ax.known,
            'the car is learned through the faults. The yaw rate\'s scale comes out ' + ((st.yaw.k / DEG / 0.005 - 1) * 100).toFixed(1) + ' % high: that is the body roll and the sensors\' gains, which learning cannot tell from the scale');
        const out = [];
        for (const name of ['held', 'right', 'switches', 'handbrake', 'circle']) {
            let worst = 0;
            const T = car.sceneScript(name).T * 1000 - 1000, mids = [];
            for (let at = 500; at < T - 12000; at += 250) mids.push({ at, fn: async () => { const v = car.view().live; if (v.angle !== null) worst = Math.max(worst, Math.abs(v.angle - Math.abs(car.truthNow(v.t).beta) / DEG)); } });
            await car.play(name, { mid: mids, after: 2500 });
            out.push({ name, rec: lastDrift(car), worst });
        }
        const TRUE = { held: 30.1, right: 21.8, switches: 30.4, handbrake: 39.1, circle: 36.6 };
        ok(car.session.sess.count === 5 && out.every((o) => o.rec.flags.length === 0 && o.worst < 4.5), 'five kinds of drift are each counted once, without a flag. The angle shown was within ' + Math.max.apply(null, out.map((o) => o.worst)).toFixed(1) + ' degrees of the made-up car\'s at every look (4 looks a second)');
        ok(out.every((o) => o.rec.peak > TRUE[o.name] && o.rec.peak < TRUE[o.name] * 1.11), 'KNOWN LIMIT: every peak reads high, by 4 to 10 %: ' + out.map((o) => o.name + ' ' + o.rec.peak + ' for ' + TRUE[o.name]).join(', ') + '. That is the body roll\'s share again, and nothing in the app takes it out');
        const g = car.session.gps.status(clock.mono);
        ok(Math.abs(g.straight.ratio - 0.98) < 0.005 && Math.abs(g.drift.ratio - 0.98) < 0.005 && g.drift.n >= 20, 'the GPS check shows the speed that reads 2 % high: x' + g.straight.ratio.toFixed(3) + ' going straight, x' + g.drift.ratio.toFixed(3) + ' in drifts at a held speed (the same: this made-up car reports its true speed while sideways)');
        const n = car.session.sess.count;
        for (const name of ['lanechange', 'slalom', 'understeer', 'bumpy', 'braking', 'roundabout', 'banked']) await car.play(name, { after: 1500 });
        ok(car.session.sess.count === n, 'and the seven kinds of driving that must score nothing score nothing with the faults');

        // what the GPS check is for: a car that reports the speed along its own length while it is sideways
        const along = await learnedCar({ model: { speedFrom: 'u' } });
        let off = 0;
        const looks = [];
        for (let at = 6000; at < 28000; at += 500) looks.push({ at, fn: async () => { const v = along.view().live; if (v.angle !== null) off = Math.max(off, Math.abs(v.angle - Math.abs(along.truthNow(v.t).beta) / DEG)); } });
        await along.play('circle', { mid: looks, after: 2500 });
        const ga = along.session.gps.status(clock.mono), ra = lastDrift(along);
        ok(ga.drift.n >= 8 && ga.drift.ratio > 1.15 && ga.drift.ratio < 1.3 && ga.straight.n >= 3 && Math.abs(ga.straight.ratio - 1) < 0.01 && ra && ra.gps && ra.gps.ratio > 1.15,
            'a made-up car that reports the speed along its own length while sideways, on the long circle: the GPS check reads x' + ga.straight.ratio.toFixed(3) + ' going straight and x' + ga.drift.ratio.toFixed(3) + ' in the drift. That difference is what a first car has to show or not show');
        ok(off > 5 && off < 16 && ra.flags.join() === 'ANGLE UNSURE', 'KNOWN LIMIT, NOT SOLVED: on that car the angle shown was up to ' + off.toFixed(1) + ' degrees off (' + ra.peak + ' degrees read as the peak, for 36.6). Here the drift is flagged ' + ra.flags.join(', ') +
            ' (its ± was ' + ra.pm + ' degrees: the steering check and the sum did not agree). The app does not act on the GPS check: it only shows it');
        const sa = await screens(along, 'speed-along-the-car', 5);
        ok(find(sa.study, /^GPS speed over the car's: straight x1\.00\d \(\d+\), in drifts at a held speed x1\.[12]\d\d \(\d+\)$/).length === 1, 'the Study tab shows both figures');

        // the app itself held up for 0.4 s in the middle of a drift
        const held = await learnedCar({});
        await held.play('held', { mid: { at: 6500, fn: async () => { await bench.stall(400); } }, after: 2500 });
        const rec = lastDrift(held);
        ok(rec && rec.flags.join() === 'DATA GAP' && rec.gap >= 300 && held.store.data.best.score === null && Math.abs(rec.peak - 30.1) < 3,
            'the app is held up for 0.4 s in the middle of a drift (nothing runs, and what the car sent meanwhile is stamped late): the drift is counted (peak ' + (rec ? rec.peak : '--') + ') and flagged DATA GAP, so it sets no best');
        const s = await screens(held, 'held-up', 1);
        ok(find(s.last, /^\d+\/s, gap \d{3} ms$/).length === 1 && has(s.last, 'DATA GAP: samples were missing, or the angle was lost, during the drift or just before it.'), 'the Last tab says how long the gap was');
    });

    /* ================= nonsense ================= */
    await ok.part('sources that send nonsense', async () => {
        const car = await learnedCar({});
        await car.run(car.script().to(7, { v: 60, pedal: 0.3 }).hold(2));
        const k0 = car.session.eng.learn.status().yaw.k;
        const LONG = 'A_STATE_WITH_A_VERY_LONG_NAME_THAT_NOBODY_HAS_SEEN_ON_A_CAR_0123456789';
        const junk = [undefined, null, 0, -1, 7.5, 'x', '', true, [], [1, 2], {}, { a: {} }, NaN, Infinity, { speedVehicleCentreOfGravity: 'fast' }, { speedVehicleCentreOfGravity: -5 }, { speedVehicleCentreOfGravity: 1e12 },
            { lateralAccelerationCentreOfGravity: null }, { lateralAccelerationCentreOfGravity: 1e9 }, { longitudinalAccelerationCentreOfGravity: 'a' }, { yawVelocityVehicle: 'r' }, { yawVelocityVehicle: -4 }, { yawVelocityVehicle: 7e7 },
            { steeringAngleFrontAxleEffective: {} }, { actualValueSteeringAngleDriver: -1 }, { actualValueAngleAcceleratorPedal: 1e9 }, { actualValueRPMWheelFLH: 'a', actualValueRPMwheelFRH: {}, actualValueRPMWheelRLH: -3, actualValueRPMWheelRRH: 1e9 },
            { statusContactHandBrake: LONG }, { statusContactHandBrake: 99 }, { displayStatusDSC2: LONG }, { nmeaString: 5 }, { nmeaString: null, delayCounter: 'x' }, { nmeaString: '$GPRMC,,A,,,,,99999,,*' }, { nmeaString: '$'.repeat(500) },
            { actualValueAttitudeAngleVehicleMove: LONG, actualValueCurvatureVehicleMove: LONG, qualifierActualValueAttitudeAngleVehicleMove: LONG }, { attitudeAngleEstimated: LONG, attitudeAngleEstimatedErrorAmplitude: LONG, qualifierVehicleDynamicsDataEstimated: LONG },
            { statusDriftAttitudeAngleAverageLast: LONG, statusDriftDistanceLast: LONG, statusDriftDurationLast: LONG, statusDriftStarsLast: LONG, statusDriftStarsLastMaxPossible: LONG },
            { statusDriftAttitudeAngleAverageBest: LONG, statusDriftDistanceBest: LONG, statusDriftDurationBest: LONG, statusDriftStarsBest: LONG, statusDriftStarsBestMaxPossible: LONG }];
        car.on.study = false; car.on.dsc = false; car.on.hb = false;
        for (let round = 0; round < 3; round++) {
            for (const v of junk) {
                // as the whole value of every field and of the event
                Object.keys(car.handlers).forEach((n) => Object.keys(car.handlers[n]).forEach((f) => car.handlers[n][f](v)));
                Object.keys(car.events).forEach((e) => car.events[e](v));
            }
            await advance(200);
        }
        // the longest text every text-valued source can show, at once
        car.send.move(junk[34]); car.send.est(junk[35]); car.send.mLast(junk[36]); car.send.mBest(junk[37]); car.send.hb(junk[27]); car.send.dsc(junk[29]);
        car.nmeaMode = 'junk';
        await advance(1500);
        const s = await screens(car, 'after-nonsense');
        ok(bench.mishaps().length === 0, junk.length + ' kinds of nonsense as the value of every field and of the event, three times over: no handler threw, the app logged no error' + (bench.mishaps().length ? ': ' + bench.mishaps().slice(0, 3).join(' | ') : ''));
        ok(find(s.signals.concat(s.study), /^A_STATE_WITH\.\.( = ON)?$/).length === 2 && find(s.study, /qualifier A_STAT\.\.$/).length === 2 && find(s.study, /stars A_STAT\.\., of A_STAT\.\.$/).length === 2,
            'a text value of 70 characters is cut short on the Signals and Study tabs (to 14 characters in the lists, to 8 where five values stand in a line), so the pages still fit with every text-valued source at its longest');
        ok(car.session.eng.learn.status().yaw.k === k0 && car.view().live.state === 'ready' && Math.abs(car.view().live.kmh - 60) < 1 && car.session.sess.count === 0, 'nothing was learned from it, no drift came out of it, and the car is still READY at 60 km/h');
        car.on.study = true; car.on.dsc = true; car.on.hb = true;
        car.speedFault = 'none';
        await advance(2500);
        ok(car.view().live.state === 'gap' || car.view().live.kmh === 60, 'the car\'s "no value" (raw 65535) as its speed for 2.5 s is not taken as a speed');
        car.speedFault = null;
        await advance(3000);
        await car.play('held', { after: 2500 });
        const rec = lastDrift(car);
        ok(rec && Math.abs(rec.peak - 30.1) < 2.5 && rec.flags.length === 0, 'and the next drift is read as ever: peak ' + (rec ? rec.peak : '--') + ', no flag');
    });

    /* ================= subscriptions ================= */
    await ok.part('subscriptions that fail at first are tried again; a service that comes up late', async () => {
        let car = await learnedCar({ watchFail: { Vehicle2: 2, CDS2: 1, Powertrain: 1 } });
        const s = await screens(car, 'no-data-yet');
        ok(has(s.drift, 'NO YAW RATE FROM THE CAR') && find(s.signals, /^not answering$/).length === 5 && find(s.study, /^not answering$/).length === 1, 'the car\'s speed and motion services are not up when the app starts: no angle, and the Signals and Study tabs say "not answering" for their six sources');
        ok(car.view().live.rate === null && find(s.drift, /^\d+\/s$/).length === 0, 'and no data rate is shown while none is known ("--", not the engine\'s stand-in of 10 a second)');
        ok(find(s.signals, /set-up 9 of 12 \(under way: Vehicle2 CDS2 Powertrain\)/).length === 1 && car.box.me.note.wait.join() === 'Vehicle2,CDS2,Powertrain' && car.box.me.note.bad.length === 0,
            '(1.0.1) the record\'s last note, on the Signals tab\'s first line, says how far set-up has got: "set-up 9 of 12 (under way: Vehicle2 CDS2 Powertrain)"');
        await advance(6000);
        ok(car.logged(/^WARN signal Vehicle2 error: .*NEEDED: without the speed there is no angle.*trying again in 5 s/).length === 1 && car.logged(/^WARN signal Vehicle2 error: .*trying again in 15 s/).length === 1 &&
            car.logged(/^WARN signal CDS2 error: .*NEEDED: without the yaw rate and the sideways acceleration there is no angle.*trying again in 5 s/).length === 1 && car.logged(/^signal CDS2: subscribed \(try 2\)/).length === 1,
            'tried again after 5 s: CDS2 and the wheels are there now, the speed still not');
        const t = await car.draw();
        ok(has(t, 'NO DATA FROM THE CAR') && has(t, 'Waiting for the speed and the sideways acceleration'), 'with the yaw rate there and the speed not: NO DATA FROM THE CAR');
        await advance(16000);
        ok(car.logged(/^signal Vehicle2: subscribed \(try 3\)/).length === 1, 'and again 15 s later: subscribed');
        await car.play('held', { after: 2500 });
        ok(lastDrift(car) && lastDrift(car).flags.length === 0, 'and a drift is counted');

        car = await boot({ getterMs: 200, dataDir: learnedDir() });
        await advance(5000);
        // (CHANGED for 1.0.1: the kit now reads four getters at a start, the four "rs" fields, where 1.0.0 had ten)
        ok(car.mostInFlight === 1 && reads(car, SPEED, 0) >= 5 && car.kitReads === 4, 'a getter that takes 0.2 s to answer: the app\'s first read of the speed waits until the kit\'s own first read is answered (never two reads of one value at once; ' + reads(car, SPEED, 0) + ' reads in 5 s)');
        car = await learnedCar({ upAfter: { Vehicle2: 1500, CDS2: 2500 }, cds2: 'silent' });
        await car.play('held', { after: 2500 });
        ok(car.mostInFlight === 1 && car.kitReads === 4 && lastDrift(car), 'services that come up 1.5 and 2.5 s after the app: the app\'s own reads keep clear of the kit\'s first read of each getter (never two reads of one field at once)');
    });

    /* ================= the saved file ================= */
    await ok.part('the saved file: read back, kept short, damaged, from a newer version, not writable', async () => {
        // the second car's file, as the next start finds it
        let car = await boot({ dataDir: second.dataDir });
        const s = await screens(car, 'started-again');
        const last5 = second.session.sess.list[0], longest = second.session.sess.time;
        ok(car.session.sess.count === 0 && has(s.session, '0 drifts') && has(s.drift, 'TOO SLOW') && car.store.data.drifts.length === 7 && car.logged(/^saved drifts: 7 drifts, 4 bests, and what was learned about the car read from pps_drift\.json$/).length === 1,
            'the app is started again on a file with seven drifts: the session is new, the car is learned, and the log says what was read');
        ok(has(s.last, String(last5.score)) && has(s.last, last5.grade) && has(s.last, last5.peak.toFixed(1) + '° ' + (last5.dir === 'L' ? 'LEFT' : 'RIGHT')) && !has(s.last, 'No trace is kept for this drift.') && find(s.best, /^24\.11\. \d\d:\d\d$/).length === 7 && has(s.best, longest.time.toFixed(1)) && has(s.last, 'NO FLAG'),
            'the Last tab shows the last drift of the drive before with its trace, the Best tab the bests and the list');
        const old = car.store.data.drifts.filter((d) => !d.trace);
        ok(old.length === 2 && car.store.data.drifts.slice(0, 5).every((d) => d.trace), 'of the seven, the newest five have their trace');

        // 30 drifts are kept, the newest 5 with their trace (the store on its own)
        const { Store, cleanDrift } = require(path.join(JS, 'store'));
        const st = new Store({ dir: null });
        const one = (i) => Object.assign({}, last5, { score: 100 + i, peak: 20 + i / 10, time: 5 + i / 10, dist: 80 + i, date: 1790000000000 + i * 60000, flags: [], trace: { ms: 100, a: [-10, -20, -30, -20], v: [70, 68, 66, 64] } });
        for (let i = 0; i < 37; i++) st.addDrift(one(i));
        ok(st.data.drifts.length === 30 && st.data.drifts[0].score === 136 && st.data.drifts.filter((d) => d.trace).length === 5 && st.data.drifts.slice(0, 5).every((d) => d.trace) && st.data.best.score.score === 136,
            '37 drifts: the last 30 are kept, the newest 5 with their trace, the best is the best of all 37');
        const flagged = st.addDrift(Object.assign(one(99), { flags: ['DATA GAP'] }));
        ok(Object.keys(flagged).length === 0 && st.data.best.score.score === 136 && st.data.drifts[0].score === 199, 'a flagged drift with more points than any is kept in the list and sets no best');
        const odd = cleanDrift(Object.assign(one(1), { latitude: 67.9, longitude: 144.9, heading: 283, course: 12, position: { lat: 1 }, note: 'x', flags: ['SPIN', 'MADE UP'], grade: 'Z', end: 'x' }));
        ok(Object.keys(odd).join() === 'date,score,grade,end,flags,peak,avg,dir,switches,time,dist,entry,avgKmh,minKmh,peakG,peakYaw,opp,pedal,wheelspin,handbrake,pm,pmMax,mult,smooth,reversals,rate,gap,gps,trace' && odd.flags.join() === 'SPIN' && odd.grade === 'D' && odd.end === 'ended',
            'a drift is written member by member: one handed in with a latitude, a longitude, a heading, a course and a made-up flag is kept without them (' + Object.keys(odd).length + ' named members)');

        // damaged entries
        const dir = learnedDir({ best: { score: { score: 'many', peak: 30, time: 5 }, angle: Object.assign(one(3), { flags: ['SPIN'] }), time: one(4), dist: null },
            drifts: [one(5), { score: 5 }, null, 'x', Object.assign(one(6), { trace: { ms: 100, a: ['x', 1], v: [1, 2] }, pm: 'wide', gps: { ratio: 'x' } }), Object.assign(one(7), { time: -1 })],
            learned: Object.assign({}, LEARNED, { somethingElse: { latitude: 67.9 }, pedal: { min: 'x', max: 9 } }) });
        car = await boot({ dataDir: dir });
        ok(car.store.data.drifts.length === 2 && car.store.data.drifts[1].trace === null && car.store.data.drifts[1].pm === null && car.store.data.drifts[1].gps === null && car.store.data.best.score === null && car.store.data.best.angle === null && car.store.data.best.time.score === 104,
            'a file with damaged entries: the two drifts that are drifts are kept (one loses its damaged trace), a best that is no number and a best with a flag are dropped');
        ok(car.session.eng.learn.status().yaw.state === 'learned' && car.store.data.learned.somethingElse === undefined && car.store.data.learned.pedal.min === null, 'what was learned is read; a member that does not belong there is not carried on');
        await screens(car, 'damaged-file');
        // (1.0.1: 1.0.0 wrote its file again within seconds here, because the pedal's range moved with every pedal value. Nothing
        // is learned from the pedal now, so the file is written when there is something to write: here, the clean stop)
        car.session.stopping();
        ok(!/somethingElse|latitude/.test(fs.readFileSync(path.join(dir, FILE), 'utf8')), 'and the next time the app writes its file (here: at a clean stop), the member that does not belong there is gone from the file as well');

        // not what this app wrote; from a newer version
        const bad = learnedDir();
        fs.writeFileSync(path.join(bad, FILE), '{"v":1,"best":');
        car = await boot({ dataDir: bad });
        ok(car.store.data.drifts.length === 0 && car.view().live.learn === 'none' && fs.existsSync(path.join(bad, FILE + '.bad')) && car.logged(/^WARN saved drifts: pps_drift\.json is not what this app wrote \(\d+ characters\): starting fresh, the old file is kept as pps_drift\.json\.bad$/).length === 1,
            'a file that is cut off: the app starts fresh, keeps the file as pps_drift.json.bad, and the log says so');
        const newer = learnedDir();
        fs.writeFileSync(path.join(newer, FILE), JSON.stringify({ v: 2, best: {}, drifts: [], learned: LEARNED, more: 1 }));
        car = await boot({ dataDir: newer });
        ok(car.store.data.drifts.length === 0 && fs.existsSync(path.join(newer, FILE + '.newer')) && !fs.existsSync(path.join(newer, FILE)) && car.logged(/^WARN saved drifts: .*written by a newer version of this app \(file version 2, this one writes 1\)/).length === 1,
            'a file from a newer version of the app: not read and not written over, kept as pps_drift.json.newer');

        // a folder that cannot be written
        const ro = learnedDir();
        car = await boot({ dataDir: ro });
        fs.chmodSync(ro, 0o500);
        await car.play('held', { after: 3000 });
        const s2 = await screens(car, 'not-saved');
        ok(car.store.failed && has(s2.last, 'NOT SAVED: the app cannot write its file. Drifts are lost when it closes.') && has(s2.best, 'NOT SAVED: the app cannot write its file. Drifts are lost when it closes.') && has(s2.signals, 'NOT SAVED: the app cannot write its file.') &&
            car.logged(/^WARN saved drifts: cannot write pps_drift\.json: .* \(the drifts on screen are NOT SAVED\)$/).length === 1,
            'the folder cannot be written: the drift is on the screen, the Last, Best and Signals tabs say NOT SAVED, the log says it once');
        fs.chmodSync(ro, 0o700);
        await car.play('right', { after: 3000 });
        ok(!car.store.failed && fileOf(car).drifts.length === 2 && car.logged(/^saved drifts: pps_drift\.json is written again$/).length === 1, 'it can be written again: both drifts are in the file, and NOT SAVED is gone');
    });

    /* ================= settings ================= */
    await ok.part('settings: units, what a drift is, the chassis, the steering, the two resets', async () => {
        // mph, and feet
        let car = await learnedCar({ sets: { speedUnit: 'mph' } });
        let mid = null;
        await past(car);
        await car.play('held', { mid: { at: 6500, fn: async () => { mid = await car.draw(); } }, after: 2500 });
        let rec = lastDrift(car), s = await screens(car, 'mph');
        ok(has(mid, 'mph') && find(mid, /^4[12]$/).length === 1 && find(s.last, /^\d+ mph$/).length === 3 && has(s.last, (rec.dist / 0.3048).toFixed(0) + ' ft') && find(s.last, /^SPEED, MPH, OVER THE SECONDS OF THE DRIFT$/).length === 1 && find(s.session, /^\d+ ft$/).length >= 1,
            'Speed unit mph: speeds in mph, distances in feet (' + (rec.dist / 0.3048).toFixed(0) + ' ft), on every tab');
        await car.run(car.script().to(6, { v: 0 }).hold(3));
        ok(has(await car.draw(), 'Drifts are counted from 12 mph'), 'and "Drifts are counted from 12 mph"');

        // the start angle
        car = await learnedCar({});
        await car.run(driftScript(car, 70, 15, 5));
        ok(car.session.sess.count === 1 && Math.abs(lastDrift(car).peak - 15) < 2, 'a drift of 15 degrees counts as shipped (a drift starts at 10)');
        car.settings.set('startAngle', '20');
        await car.run(driftScript(car, 70, 15, 5));
        ok(car.session.sess.count === 1 && car.session.eng.o.startDeg === 20 && car.session.eng.o.endDeg === 12, 'with "A drift starts at: 20 degrees" it does not (and a drift then ends under 12)');
        await car.run(driftScript(car, 70, 28, 5));
        ok(car.session.sess.count === 2, 'one of 28 degrees does');
        s = await screens(car, 'start-20', 1);
        car.settings.set('startAngle', '10');
        // the slowest speed
        await car.run(driftScript(car, 32, 25, 5, 0.34));
        ok(car.session.sess.count === 3 && lastDrift(car).avgKmh < 35, 'a drift at 32 km/h counts as shipped (from 20 km/h)');
        car.settings.set('minSpeed', '40');
        await car.run(driftScript(car, 32, 25, 5, 0.34));
        const slow = await car.draw();
        ok(car.session.sess.count === 3 && has(slow, 'TOO SLOW') && has(slow, 'Drifts are counted from 40 km/h'), 'with "Slowest speed that counts: 40 km/h" it does not, and at 32 km/h the banner says TOO SLOW');
        car.settings.set('minSpeed', '20');

        // the chassis
        const wb = () => car.session.eng.o.wheelbase;
        const got = [wb()];
        ['g42', 'g30', 'g14', 'g29'].forEach((c) => { car.settings.set('chassis', c); got.push(wb()); });
        car.settings.set('chassis', 'other'); got.push(wb());
        car.settings.set('wheelbase', 250); got.push(wb());
        ok(got.join() === '2.85,2.74,2.98,2.82,2.47,2.85,2.5', 'the chassis sets the wheelbase the steering check works with: ' + got.join(', ') + ' m ("Other": the Wheelbase setting, 2.85 until it is set)');
        const { CHASSIS } = require(path.join(JS, 'session'));
        const offered = spec.settings.filter((x) => x.key === 'chassis')[0].options.map((x) => x[0]);
        ok(offered.filter((c) => c !== 'other').every((c) => CHASSIS[c] && offered.indexOf(c) >= 0) && Object.keys(CHASSIS).every((c) => offered.indexOf(c) >= 0) && spec.settings.filter((x) => x.key === 'chassis')[0].options.every((x) => x[0] === 'other' || x[1].indexOf(CHASSIS[x[0]].wheelbase.toFixed(2) + ' m') > 0),
            'every chassis the setting offers is in the app\'s table, with the wheelbase its name says');
        car.settings.set('chassis', 'g20');

        // the steering check off; the steering wheel's angle by hand
        car.settings.set('useSteer', false);
        await car.play('held', { mid: { at: 6500, fn: async () => { mid = car.view().live; } }, after: 2500 });
        s = await screens(car, 'steering-check-off');
        rec = lastDrift(car);
        ok(mid.steering === false && mid.opp === null && rec.opp === null && Math.abs(rec.peak - 30.1) < 2.5 && find(s.signals, /Steering check: switched off in Settings$/).length === 1,
            '"Steering check" off: the angle is worked out without the steering (peak ' + rec.peak + '), no opposite lock is shown, and the Signals tab says so');
        ok(rec.flags.join() === 'NO STEERING CHECK' && mid.noSteer === 'off' && has(s.drift, 'STEERING CHECK OFF: NO BEST IS SET') && has(s.last, 'NO STEERING CHECK: the steering did not back this drift, so a banked corner cannot be told from a slide.'),
            '  and every drift then carries NO STEERING CHECK and sets no best: the Drift tab says so in a standing line, the Last tab in words');
        car.settings.set('useSteer', true);
        // the forward acceleration left out (for a car whose forward acceleration is worked out from its speed)
        ok(car.settings.get('useLong') === 'use' && car.session.eng.angle.o.useLong === true && car.session.eng.angle.longS.count > 0, '"Forward acceleration" is on "Use" as shipped');
        car.settings.set('useLong', 'off');
        await advance(1200);
        await car.play('held', { mid: { at: 6500, fn: async () => { mid = car.view().live; } }, after: 2500 });
        s = await screens(car, 'forward-acceleration-left-out', 4);
        rec = lastDrift(car);
        ok(car.session.eng.angle.o.useLong === false && car.session.eng.angle.longS.count === 0 && car.session.eng.angle.out.hasAx === false && Math.abs(rec.peak - 30.1) < 3.5 && rec.flags.length === 0 &&
            find(s.signals, /^Forward acceleration: left out in Settings\. Nothing checks the angle but the steering$/).length === 1,
            '"Forward acceleration: Leave out": the engine no longer takes it (as on a car that does not send it), the drift is still read with the steering check (peak ' + rec.peak + ', no flag), and the Signals tab says so');
        car.settings.set('useSteer', false);
        await car.play('held', { after: 2500 });
        rec = lastDrift(car);
        ok(rec.flags.join() === 'NO STEERING CHECK' && Math.abs(rec.peak - 30.1) < 5, 'with the steering check off as well nothing but the summed angle is left: the drift is counted (peak ' + rec.peak + ') and flagged NO STEERING CHECK');
        car.settings.set('useSteer', true); car.settings.set('useLong', 'use');
        await advance(1200);
        await car.play('held', { after: 2500 });
        ok(car.session.eng.angle.longS.count > 0 && lastDrift(car).flags.length === 0, 'back on "Use": the forward acceleration is taken again, and the drift carries no flag');
        car.settings.set('steerSource', 'driver');
        await advance(1200);
        ok(car.session.steerKey === 'driver' && car.session.eng.learn.status().steer.state === 'none', '"Steering from: Steering wheel, chassis": that source is in use, and not learned yet');
        await car.play('gentle');
        const st = car.session.eng.learn.status().steer;
        await car.play('held', { mid: { at: 6500, fn: async () => { mid = car.view().live; } }, after: 2500 });
        rec = lastDrift(car);
        ok(st.state === 'learned' && Math.abs(st.k * 2.85 / DEG / (-0.04375 / 14.6) - 1) < 0.06 && mid.steering === true && Math.abs(rec.opp - 26) < 3,
            'after slow corners the steering wheel\'s angle is learned as a plain multiple of the front wheels\' (' + (st.k * 2.85 / DEG).toFixed(5) + ' degrees at the wheels per count; the made-up car: ' + (-0.04375 / 14.6).toFixed(5) + '), and the opposite lock reads ' + rec.opp + ' degrees as before');
        s = await screens(car, 'steering-wheel-by-hand', 4);
        ok(has(s.signals, 'Steering, steering wheel, chassis (set by hand): LEARNED') && find(s.signals, /^ {4}-0\.00\d+° at the wheels per count, zero 327\d\d\.\d, wheelbase 2\.85 m$/).length === 1, 'the Signals tab says which source and that it was set by hand');
        car.settings.set('steerSource', 'auto');

        // reset what was learned: two steps, where the head unit steps the setting on and where it offers a list
        const learnedNow = () => car.session.eng.learn.status().yaw.state;
        car.settings.set('workshop', true);
        car.settings.set('resetLearned', 'arm');
        await advance(100);
        ok(learnedNow() === 'learned' && car.settings.get('resetLearned') === 'arm', '"Reset what was learned" stepped on once: it says "Confirm: choose Reset now", and nothing is reset');
        await advance(31000);
        ok(learnedNow() === 'learned' && car.settings.get('resetLearned') === 'no', '30 s later it is back at "No", and nothing was reset');
        car.settings.set('resetLearned', 'go');
        await advance(100);
        ok(learnedNow() === 'learned' && car.settings.get('resetLearned') === 'arm', '"Reset now" chosen from the list in one go: it only arms, and shows "Confirm"');
        car.settings.set('workshop', false);
        await advance(100);
        ok(car.settings.get('resetLearned') === 'no', 'Workshop settings switched off: it is back at "No"');
        car.settings.set('workshop', true);
        car.settings.set('resetLearned', 'go');
        await advance(100);
        car.settings.set('resetLearned', 'go');
        await advance(100);
        const fl = fileOf(car);
        ok(learnedNow() === 'none' && car.settings.get('resetLearned') === 'no' && fl.learned === null && fl.drifts.length === car.store.data.drifts.length && fl.drifts.length >= 5 && car.logged(/^what was learned about the car was reset/).length === 1,
            '"Reset now" chosen again: everything learned is gone, from the app and from the saved file; the drifts stay; the setting is back at "No"');
        s = await screens(car, 'learned-reset');
        ok(has(s.drift, 'LEARNING THE CAR') && find(s.signals, /NOT LEARNED/).length === 2, 'and the app says LEARNING THE CAR again');
        // reset bests
        const n = car.session.sess.count;
        car.settings.set('resetBest', 'arm');
        await advance(100);
        ok(car.store.data.drifts.length >= 5, '"Reset bests" stepped on once: nothing is cleared');
        car.settings.set('resetBest', 'go');
        await advance(100);
        const fb = fileOf(car);
        ok(car.store.data.drifts.length === 0 && fb.drifts.length === 0 && Object.keys(fb.best).every((k) => fb.best[k] === null) && car.session.sess.count === n && car.settings.get('resetBest') === 'no' && car.logged(/^bests and saved drifts cleared$/).length === 1,
            'stepped on again: the bests and the saved list are cleared, in the app and in the file; the session\'s own count stays');
        s = await screens(car, 'bests-reset');
        ok(find(s.best, /^no best yet$/).length === 4 && has(s.best, 'No saved drift yet.') && has(s.last, 'No drift yet.') && has(s.session, n + ' drifts'), 'the Best and Last tabs are empty, the Session tab still has its ' + n + ' drifts');
        // a reset left half way when the app was closed
        const dir = learnedDir();
        fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ resetLearned: 'arm', resetBest: 'go', workshop: true }));
        const hu = await boot({ dataDir: dir, sets: { resetLearned: 'arm', resetBest: 'go', workshop: true } });
        await advance(500);
        ok(hu.settings.get('resetLearned') === 'no' && hu.settings.get('resetBest') === 'no' && hu.view().live.learn === 'learned', 'a reset left half way when the app was last closed starts again at "No", and resets nothing');
    });

    /* ================= demo ================= */
    await ok.part('demo data: shown, tagged, never saved', async () => {
        let car = await learnedCar({ sets: { demo: 'on' }, first: true });
        car.past = true; await car.draw();
        await advance(4600);
        let s = await screens(car, 'demo-ready', 0);
        ok(car.view().demo && has(s.drift, 'DEMO') && has(s.drift, 'BETA') && has(s.drift, 'READY') && has(s.drift, 'For closed circuits and skid pans only') && has(s.drift, '72'), 'Demo data "Always": a DEMO badge beside BETA, the demo car at 72 km/h, READY with "For closed circuits and skid pans only"');
        await advance(3000);
        s = await screens(car, 'demo-drift', 0);
        ok(car.view().live.state === 'drift' && has(s.drift, 'DRIFT') && has(s.drift, 'LEFT') && Math.abs(car.view().live.angle - 30) < 2, 'the demo drifts: DRIFT, ' + car.view().live.angle.toFixed(0) + ' LEFT');
        await advance(4500);
        s = await screens(car, 'demo-switch', 0);
        ok(car.view().live.switched && has(s.drift, 'SWITCH') && has(s.drift, 'RIGHT'), 'it switches: SWITCH, RIGHT');
        await advance(5000);
        s = await screens(car, 'demo-ended');
        const rec = car.session.demoSess.list[0];
        ok(rec && rec.flags.join() === 'DEMO' && rec.switches === 1 && has(s.drift, 'DRIFT ENDED') && has(s.drift, rec.score + ' points, grade ' + rec.grade + '. Flagged DEMO: no best') && has(s.last, 'DEMO: made-up data, not a drift of this car.') && has(s.last, 'FLAGGED: SETS NO BEST'),
            'the demo drift ends: ' + rec.score + ' points, grade ' + rec.grade + ', flagged DEMO; the Last tab says "DEMO: made-up data, not a drift of this car."');
        ok(find(s.best, /^no best yet$/).length === 4 && find(s.best, /^DEMO$/).length >= 2 && has(s.best, 'Demo drifts, not saved') && has(s.best, 'Demo drifts are never saved. The Last tab says each flag in words.') && has(s.signals, 'Demo data is showing on the other tabs. This tab is the car\'s.') && find(s.signals, /^Yaw rate, CDS2: LEARNED/).length === 1,
            'a demo drift sets no best; the Signals tab stays the car\'s own and says so');
        await advance(40000);
        ok(car.session.demoSess.count >= 3 && car.session.sess.count === 0 && car.store.data.drifts.length === 0 && car.store.saves === 0 && fileOf(car).drifts.length === 0 && car.logged(/^drift \d/).length === 0,
            car.session.demoSess.count + ' demo drifts later: none is in the car\'s session, in the saved file or in the log');
        car.settings.set('demo', 'off');
        await advance(1500);
        s = await screens(car, 'demo-off', 0);
        ok(!car.view().demo && !has(s.drift, 'DEMO') && has(s.drift, 'TOO SLOW') && car.logged(/^demo data on: drifts are not saved$/).length === 1 && car.logged(/^the car's data: drifts are scored and saved$/).length === 1, 'demo off: the car\'s own data again, no DEMO badge');

        car = await boot({ sets: { demo: 'auto' }, missing: Object.keys(bench.IFACE) });
        await advance(4000);
        ok(!car.view().demo, 'Demo data "Auto" on a head unit that gives the app nothing: no demo in the first 5 s');
        await advance(2000);
        ok(car.view().demo, 'then the demo');
        car = await boot({ sets: { demo: 'auto' } });
        await advance(8000);
        ok(!car.view().demo, '"Auto" on a car that answers: no demo');
        ok(spec.settings.filter((x) => x.key === 'demo')[0].default === 'off', 'as shipped, demo data is "Never"');
    });

    /* ================= what the re-check found, through the whole app ================= */
    await ok.part('nothing starts until the car has gone straight, and the screen says so; a road that climbs', async () => {
        // a skid pan: a car that has learned nothing circles left and right, and is then drifted with no straight in between
        let car = await boot({});
        await past(car);
        const circles = car.script().to(5, { v: 45, pedal: 0.3 }).hold(4);
        for (let i = 0; i < 8; i++) circles.to(1.5, { lat: (i % 2 ? -1 : 1) * 0.24 }).hold(4);
        await car.run(circles);
        const learnedNow = car.view().live.learn, blockedNow = car.view().live.blocked;
        let mid = null;
        await car.run(car.script().to(1.4, { lat: 0.7, drift: 30, spin: 0.3, pedal: 0.6 }).hold(10).to(1.2, { lat: 0, drift: 0, spin: 0 }), { mid: { at: 6000, fn: async () => { mid = { v: car.view(), s: await screens(car, 'go-straight', 0), truth: car.truthNow() }; } } });
        ok(learnedNow !== 'none' && blockedNow === true && Math.abs(mid.truth.drift) > 25 && mid.v.live.blocked === true && mid.v.live.run === null && car.session.sess.count === 0 && Math.abs(mid.v.live.angle - 30) < 5,
            'a car that has learned nothing circles left and right on a pan (nothing slides); its first line is drawn in a corner, and it is then drifted at 30 degrees with no straight in between: the drift is not counted (the angle shown is ' +
            (mid.v.live.angle === null ? '--' : mid.v.live.angle.toFixed(0)) + ' degrees, the car is "' + mid.v.live.learn + '")');
        ok(has(mid.s.drift, 'GO STRAIGHT FOR A MOMENT') && has(mid.s.drift, 'No drift is counted until the car has gone straight') && !has(mid.s.drift, 'READY') && find(mid.s.drift, /drifts are scored/i).length === 0,
            'and the banner says why: GO STRAIGHT FOR A MOMENT. It does not say READY, and nothing on the page says that drifts are scored');
        await car.run(car.script().hold(2.5));
        const after = car.view().live;
        await car.run(driftScript(car, 45, 30, 6, 0.7));
        ok(after.blocked === false && car.session.sess.count === 1 && Math.abs(lastDrift(car).peak - 30) < 3, 'after 2.5 s of straight the banner is gone, and the next drift is counted (peak ' + lastDrift(car).peak + ')');

        // a car whose forward acceleration reads 0.7 m/s2 more than its speed's own change all the time (a climb of 4 degrees, or a zero that is off)
        car = await boot({ faults: { zeroX: 0.7 } });
        await past(car);
        await car.play('ordinary');
        await car.play('gentle');
        const st = car.session.eng.learn.status();
        const s = await screens(car, 'climbing', 4);
        ok(st.yaw.state === 'learned' && st.steer.state === 'learned' && st.turnedDown === 0 && Math.abs(car.session.signalsView(clock.mono).ax0 - 0.7) < 0.05,
            'a car whose forward acceleration reads 0.7 m/s2 more than its speed\'s own change (a climb of 4 degrees, or a zero that is off) is learned by an ordinary drive all the same: yaw rate "' + st.yaw.state + '" with ' + st.yaw.n + ' moments, steering "' + st.steer.state + '" with ' + st.steer.n +
            ' (the first fix left such a car with no steering moment at all)');
        ok(has(s.signals, '    on a straight it reads 0.70 m/s2 more than the speed gains (taken out). Turned down as slides: 0 s'), 'the Signals tab shows the offset in use and how many seconds the "no slide" test turned down');
        await car.play('held', { after: 2500 });
        ok(lastDrift(car) && lastDrift(car).flags.length === 0 && Math.abs(lastDrift(car).peak - 30.1) < 2, 'and a drift on that car is read as on the level (peak ' + lastDrift(car).peak + ', no flag)');
    });

    /* ================= the widest values ================= */
    await ok.part('every tab with the longest values it can show, in km/h and in mph', async () => {
        for (const unit of ['kmh', 'mph']) {
            const car = await learnedCar({ sets: { speedUnit: unit } });
            await car.play('held', { after: 2500 });
            await past(car);
            const FLAGS = ['UNCALIBRATED', 'ANGLE UNSURE', 'NO STEERING CHECK', 'DATA GAP', 'LOW DATA RATE', 'SPIN', 'DEMO'];
            const big = (i) => ({ date: Date.UTC(2026, 11, 28, 22, 58), score: 88888 - i, grade: 'B', end: 'spin', flags: FLAGS.slice(), peak: 188.8, avg: 128.8, dir: 'R', switches: 88, time: 888.88, dist: 28888.8, entry: 288.8, avgKmh: 288.8, minKmh: 288.8,
                peakG: 2.88, peakYaw: 888.8, opp: 88.8, pedal: 100, wheelspin: 888, handbrake: null, pm: 88.8, pmMax: 98.8, mult: 4.98, smooth: 1.18, reversals: 888, rate: 188.8, gap: 28888, gps: { ratio: 1.888, n: 888 },
                trace: { ms: 3200, a: Array.from({ length: 240 }, (_, k) => Math.round(188 * Math.sin(k / 12))), v: Array.from({ length: 240 }, (_, k) => 150 + Math.round(138 * Math.cos(k / 20))) } });
            const list = Array.from({ length: 12 }, (_, i) => big(i));
            const view0 = car.session.view.bind(car.session), sig0 = car.session.signalsView.bind(car.session);
            let live = null, newBest = {}, prog = null;
            // (how far learning is, at its widest: 120 and 80 moments kept, every phrase of what is missing)
            const P = (yaw, steer) => ({ yaw: Object.assign({ state: 'learning', have: 120, need: 20, side: 6, spread: 9.99, limit: 0.08, lo: 30, hi: 110 }, yaw), steer: Object.assign({ state: 'learning', have: 80, need: 14, side: 4, spread: 9.99, limit: 0.12, lo: 12, hi: 60 }, steer) });
            car.session.view = (now) => {
                const v = view0(now);
                if (prog) v.progress = prog;
                v.live = Object.assign({}, v.live, live);
                v.sess = { count: 8888, total: 8888888, best: list[0], angle: list[0], time: list[0], dist: list[0], list };
                v.best = { score: list[0], angle: list[0], time: list[0], dist: list[0] }; v.saved = list; v.last = list[0]; v.newBest = newBest;
                return v;
            };
            car.session.signalsView = (now) => {
                const v = sig0(now);
                Object.keys(v.meters).forEach((k) => { v.meters[k] = { n: 88888888, rate: 888.8, most: 888.8, age: 0 }; });
                Object.keys(v.raw).forEach((k) => { v.raw[k] = k === 'wheels' ? '65535 65535 65535 65535' : '65535 = OFF'; });
                const fitOf = (k, z) => ({ state: 'learning', k, zero: z, n: 120, left: 60, right: 60, spread: 0.888, moments: 120, key: 'x' });
                v.learn = { yaw: fitOf(-0.0008888, 65535.8), steer: fitOf(-0.0008888, 65535.8), pedal: { min: 65535, max: 65535 }, wheels: { base: 18.8888, readings: 60 }, left: { known: false, positiveIsLeft: false, agree: 40, against: 40 }, ax: { known: false, positiveIsForward: false, agree: 40, against: 40 }, turnedDown: 88888 };
                v.inUse = { speed: 'speedP', yaw: 'yawS', steer: 'steerXD' }; v.auto = { yaw: false, steer: false };
                // (1.0.1) the lowest and highest raw value of the steering and yaw rows, and how far learning is
                Object.keys(v.raw).forEach((k) => { v.spans[k] = { lo: -9999999, hi: 9999999 }; });
                v.progress = prog || P({ left: 60, right: 60 }, { left: 40, right: 40 });
                v.gps = { sentences: { ok: 888888, bad: 888888 }, last: { kmh: 288.8, valid: true, age: 0 }, straight: { n: 120, ratio: 1.888 }, drift: { n: 120, ratio: 1.888 } };
                // (1.0.1) the pedal and the four wheel values raw, at their widest; the longest of the reasons why the wheels give no figure
                const wide = { now: 16777215, lo: 16777215, hi: 16777215, kinds: 256, more: true };
                v.pedalRaw = ['actualValueAngleAcceleratorPedalVirtualWWWWWWWWWWWW', 'qualifierActualValueAngleAcceleratorPedalWWWWWWWW', 'gradientActualValueAngleAcceleratorPedalWWWWWWWW'].map((name) => Object.assign({ name }, wide));
                v.pedalMore = 9; v.meters.pedal = { n: 88888888, rate: 888.8, most: 888.8, age: 0 };
                const wheelWide = { now: 65535.88, lo: -9999999.88, hi: 9999999.88, kinds: 256, more: true, steady: 65535.88, steadyKmh: 288.4 };
                v.wheelRaw = { ok: false, why: 'wait', wheels: { fl: wheelWide, fr: wheelWide, rl: wheelWide, rr: wheelWide } }; v.wheelsWhy = 'wait';
                v.lag = 300; v.pm = 98.8; v.topUp = ['yaw', 'lat', 'long']; v.wheelbase = 3.3; v.steering = true; v.useSteer = true; v.noSteer = 'stale'; v.ax0 = -8.888; v.notSaved = 'EACCES';
                return v;
            };
            car.side.live.kinds = '$GPRMC $GPGGA $GPGSA $GPGSV $GPGLL $GPVTG';
            // (1.0.1) the starts and stops at their widest: five lives, each with every figure of its last note at its largest, the
            // longest error text, every setting on; two of them with "the saved data was emptied" after them
            // (CHANGED in the repair of 1.0.1: with the seventh setting, "Note stop signals", and a signal noted beside one life's end)
            const keysOn = Object.keys(bench.ALL_ON).concat(['sigOn']), noteMax = { mem: 99998, memMax: 99999, cpu: 9998, cpuMax: 9999, lag: 9999998, lagMax: 9999999, fps: 999, path: 'soft', nps: 99999, asked: 999999999, answered: 999999999, show: 'study', state: 'learning', ok: 0, want: 12, failed: 12 };
            const lifeMax = (n, end, more) => Object.assign({ n, wall: Date.UTC(2026, 11, 28, 22, 58, 58), up: 999999, s: 359999, end, code: end ? 255 : null, err: end === 'error' ? 'W'.repeat(160) : '', on: keysOn, note: noteMax, uid: 4294967295, disk: true, ram: true, emptied: false, other: false }, more);
            car.box.me.note = noteMax; car.box.me.on = keysOn; car.box.gap = 359999; car.box.ram = false;
            car.box.lives = [lifeMax(999999998, 'error', { emptied: true }), lifeMax(999999997, null, { other: true, emptied: true, atLeast: true, restart: true }), lifeMax(999999996, 'asked', { sig: 'SIGTERM' }), lifeMax(999999995, 'exit')];
            car.box.before = car.box.lives[0]; car.box.me.n = 999999999;
            car.on.study = false;
            const cut = 'A_STAT..', five = (a) => [[a[0], '65535'], [a[1], '65535'], [a[2], '65535'], [a[3], cut], [a[4], cut]], three = (a) => [[a[0], '65535'], [a[1], '65535'], [a[2], cut]];
            car.side.live.study = { move: three(['angle', 'curvature', 'qualifier']), est: three(['angle', 'error', 'qualifier']), mLast: five(['angle', 'distance', 'time', 'stars', 'of']), mBest: five(['angle', 'distance', 'time', 'stars', 'of']) };
            // a drift running, with every figure at its widest
            live = { state: 'drift', learning: true, learn: 'learning', noSteer: 'unlearned', blocked: false, angle: 188.4, dir: 'R', pm: 98.6, kmh: 288, run: { score: 88888, mult: 4.98, smooth: 1.2, time: 888.8, switches: 88, peak: 188, dist: 28888 }, switched: true, ended: false, opp: 88.4, pedal: 1, wheelspin: 888, rate: 188, lag: 300 };
            const a = await screens(car, 'widest-' + unit + '-running');
            ok(has(a.drift, '188') && has(a.drift, '88888') && has(a.drift, 'x4.98') && has(a.drift, '888.8') && has(a.drift, 'SWITCH') && has(a.drift, 'The car is not fully learned: this drift will be flagged UNCALIBRATED') && has(a.drift, 'LEARNING: UNCALIBRATED') && has(a.drift, '8888888') && has(a.drift, '88888, GRADE B') && has(a.drift, 'STEERING NOT LEARNED YET: NO BEST IS SET'),
                (unit === 'mph' ? 'mph' : 'km/h') + ': a drift running with every figure at its widest (188 degrees, 88888 points, x4.98, 888.8 s, the session at 8888888)');
            ok(FLAGS.every((f) => find(a.last, new RegExp('^' + f + ': ')).length === 1) && has(a.last, 'FLAGGED: SETS NO BEST') && has(a.last, '188.8° RIGHT') && has(a.last, 'x1.888 (888)') && find(a.session, /^UNCAL UNSURE \+5$/).length === 9 && find(a.best, /^UNCAL \+6$/).length === 9 && has(a.last, unit === 'mph' ? '94780 ft' : '28889 m'),
                '  a drift with all seven flags: each in words on the Last tab, in short on the lists');
            // (CHANGED for 1.0.1: the sources are on the Signals tab's two pages, 12 and 7 of them here with rates; the study values, the GPS check and the top-up are on its second page)
            ok(find(a.signals, /^889\/s$/).length === 24 && find(a.study, /^889\/s$/).length === 14 && has(a.signals, '65535 65535 65535 65535') && has(a.signals, 'Yaw rate, chassis (set by hand): LEARNING') && has(a.signals, 'Steering, steering wheel, XView (set by hand): LEARNING') &&
                has(a.signals, '    -0.05092 °/s per count (x-10.185 of the default), zero 65535.8') && has(a.study, 'BMW drift analyser, last: angle 65535, distance 65535, time 65535, stars A_STAT.., of A_STAT..') && has(a.signals, '    120 moments, 60 left and 60 right, spread 88.8 %. Steering check: the steering is silent or stuck') && has(a.signals, '    on a straight it reads 8.89 m/s2 less than the speed gains (taken out). Turned down as slides: 88888 s') &&
                has(a.signals, 'Positive sideways acceleration is a RIGHT turn: ASSUMED (40 corners agree, 40 against)') && find(a.study, /Getter top-up: yaw, lat, long$/).length === 1 &&
                // (1.0.1: the pedal's three fields and the four wheels raw, on page 2, and why the wheels give no figure)
                has(a.study, 'Pedal, actualValueAngleA..ualWWWWWWWWWWWW: now 16777215 (0xFFFFFF), 889/s') && find(a.study, /^ {4}lowest 16777215 \(0xFFFFFF\), highest 16777215 \(0xFFFFFF\), 256 or more different values$/).length === 3 &&
                has(a.study, '    For its form: one photo with the foot off, one with the foot on the floor (9 more fields not shown)') && has(a.study, 'Wheel values, raw: not used yet: the values must agree at two steady speeds 20 km/h apart') &&
                find(a.study, /^ {4}(Front|Rear) (left|right): now 65535\.88, -9999999\.88 to 9999999\.88, at a steady 288 km\/h: 65535\.88$/).length === 4 &&
                has(a.signals, 'Wheel speeds: not used yet: the values must agree at two steady speeds 20 km/h apart. Raw: page 2') && has(a.signals, 'NOT SAVED: the app cannot write its file.') && has(a.study, 'NOT SAVED: the app cannot write its file.'),
                '  the Signals tab\'s two pages with every rate, count, raw value and learned figure at its widest');
            ok(find(a.signals, /^-9999999 to 9999999$/).length === 7 && has(a.signals, '    YAW RATE: 120 CORNERS, UNEVEN: 999 %, LIMIT 8 %') && has(a.signals, '    STEERING: 80 SLOW CORNERS, UNEVEN: 999 %, LIMIT 12 %') &&
                has(a.signals, 'Only gentle corners between 12 and 60 km/h, both ways, teach the steering. Yaw rate: 30 to 110 km/h'),
                '  (1.0.1) with the lowest and highest raw value beside each of the six steering and yaw rows this car sends and beside the pedal\'s, and what learning still lacks in words');
            const lifeLines = find(a.signals, /^#9999999\d\d /), emptied = find(a.signals, /^The saved data was emptied after #9999999\d\d$/);
            const ON_ALL = / on: own reads, GPS, wheels, other sources, pedal, study, signals$/;
            ok(lifeLines.length === 5 && emptied.length === 2 && find(a.signals, /^#999999998 \d\d\.12\. \d\d:\d\d:58 lived 99 h 59 min, THE APP'S OWN ERROR \(exit code 255\): W{20,}\.\., on: /).length === 1 &&
                find(a.signals, /^#999999997 .* lived at least 99 h 59 min \(saved note, up to a minute old\), NO WORD \(killed, crashed or power lost\) \(as another user: installed again since\) \(\.\., on: /).length === 1 &&
                find(a.signals, /^#999999996 .* lived 99 h 59 min, asked to stop by the car \(the signal SIGTERM came first\), Last note: memory /).length === 1 &&
                find(a.signals, /^#999999995 .* lived 99 h 59 min, EXIT CODE 255 AND NO WORD BEFORE IT, Last note: /).length === 1 &&
                lifeLines.slice(1).every((l) => ON_ALL.test(l.s)) && find(a.signals, /^ {4}.*on: own reads, GPS, wheels, other sources, pedal, study, signals$/).length === 1 && find(a.signals, /^#999999999 now: .*\(no record in RAM: data folder only\)/).length === 1,
                '  (1.0.1) the starts and stops at their widest: five lives (life numbers of nine digits, an error text of 160 of the widest letter, every figure of the last note at its largest, every setting on, a signal noted beside one clean stop) and two "saved data was emptied" lines, on eight lines. Each life keeps its number, how it ended and what was switched on; a text too long for its line is cut short, and of a last note as much is shown as fits. (Since the last read of 1.0.1 an older life known from the saved copy, with a restart after it, says "(the head unit restarted after it)" last: at this widest, with every setting on and as another user, those are the words that are cut)');
            // the drift just ended in a spin with every other flag; then not learned at all; then lost
            live = { state: 'ready', learning: true, learn: 'learning', angle: 188.4, dir: 'L', pm: 98.6, kmh: 288, run: null, switched: false, ended: true, last: list[0], opp: 88.4, pedal: 1, wheelspin: 888, rate: 1.4, lag: 300 };
            const b = await screens(car, 'widest-' + unit + '-spin', 0);
            ok(has(b.drift, 'SPIN') && has(b.drift, '88888 points, grade B: half the points, and no best. Also UNCALIBRATED, ANGLE UNSURE, NO STEERING CHECK, DATA GAP, LOW DATA RATE, DEMO'), '  SPIN with every other flag named beside it');
            live = Object.assign({}, live, { last: Object.assign({}, list[0], { end: 'ended', flags: FLAGS.filter((f) => f !== 'SPIN') }) });
            const c = await screens(car, 'widest-' + unit + '-ended', 0);
            ok(has(c.drift, '88888 points, grade B. Flagged UNCALIBRATED, ANGLE UNSURE, NO STEERING CHECK, DATA GAP, LOW DATA RATE, DEMO: no best'), '  DRIFT ENDED with six flags named beside it');
            live = Object.assign({}, live, { last: Object.assign({}, list[0], { end: 'ended', flags: [] }) });
            newBest = { score: true, angle: true, time: true, dist: true };
            const d = await screens(car, 'widest-' + unit + '-new-best', 0);
            ok(has(d.drift, '88888 points, grade B. NEW BEST: SCORE, ANGLE, TIME, DISTANCE'), '  DRIFT ENDED with four new bests named beside it');
            for (const st of [['noyaw', 'NO YAW RATE FROM THE CAR'], ['nodata', 'NO DATA FROM THE CAR'], ['gap', 'DATA LOST']]) {
                live = { state: st[0], learning: true, learn: 'none', angle: null, dir: null, pm: null, kmh: 288, run: null, switched: false, ended: false, last: null, opp: null, pedal: null, wheelspin: null, rate: null, lag: 300 };
                const e = await screens(car, 'widest-' + unit + '-' + st[0], 0);
                ok(has(e.drift, st[1]) && has(e.drift, 'NOT LEARNED: NO SCORE'), '  ' + st[1]);
            }
            live = { state: 'ready', learning: true, learn: 'learning', angle: 0.2, dir: null, pm: 1, kmh: 288, run: null, switched: false, ended: false, last: null, opp: 0, pedal: 0, wheelspin: 0, rate: 50, lag: 40 };
            const f = await screens(car, 'widest-' + unit + '-learning', 0);
            ok(has(f.drift, 'LEARNING THE CAR') && has(f.drift, 'Keep driving ordinary corners. Drifts are scored, and flagged UNCALIBRATED') && has(f.drift, 'STRAIGHT'), '  LEARNING THE CAR while drifts are already scored, going STRAIGHT');
            live = Object.assign({}, live, { blocked: true, noSteer: 'nosource', angle: 188.4, dir: 'L', pm: 98.6 });
            const g = await screens(car, 'widest-' + unit + '-go-straight', 0);
            ok(has(g.drift, 'GO STRAIGHT FOR A MOMENT') && has(g.drift, 'No drift is counted until the car has gone straight') && !has(g.drift, 'LEARNING THE CAR') && find(g.drift, /drifts are scored/i).length === 0 && find(g.drift, /NO BEST IS SET$/).length === 0,
                '  GO STRAIGHT FOR A MOMENT while nothing can start, in place of the learning banner, and nothing on the page says that drifts are scored (no standing line either)');
            live = { state: 'drift', learning: false, learn: 'learned', noSteer: 'stale', blocked: false, angle: 188.4, dir: 'R', pm: 98.6, kmh: 288, run: { score: 88888, mult: 4.98, smooth: 1.2, time: 888.8, switches: 88, peak: 188, dist: 28888 }, switched: false, ended: false, opp: null, pedal: 1, wheelspin: 888, rate: 188, lag: 300 };
            const h = await screens(car, 'widest-' + unit + '-no-steering', 0);
            ok(has(h.drift, 'DRIFT') && has(h.drift, 'No steering check: this drift is scored, and sets no best') && has(h.drift, 'STEERING SILENT OR STUCK: NO BEST IS SET'), '  DRIFT on a learned car whose steering backs nothing: the banner says that this drift sets no best');
            // the standing line, each of its four texts, at the three sizes; and no text on the Drift tab smaller than 15 px
            const lineSizes = [];
            for (const why of ['off', 'nosource', 'stale', 'unlearned']) {
                live = Object.assign({}, live, { noSteer: why });
                const l = await screens(car, 'widest-' + unit + '-line-' + why, 0), line = find(l.drift, /: NO BEST IS SET$/);
                lineSizes.push(line.length === 1 ? line[0].size : 0);
                if (Math.min.apply(null, l.drift.filter((t) => t.s.trim()).map((t) => t.size)) < 15) lineSizes.push(-1);
            }
            // (CHANGED for 1.0.1: a steering that is only not learned yet has its own standing line, which also says at what speeds it learns)
            ok(lineSizes.join() === '15,15,15,15', '  the standing line under the drawn car, each of its four texts (STEERING CHECK OFF, NO STEERING FROM THE CAR, STEERING SILENT OR STUCK, each ": NO BEST IS SET", and NO BEST IS SET UNTIL THEN. IT LEARNS AT ...): 15 px, and no text on the Drift tab is smaller');
            // (1.0.1) how far learning is, under the drawn car: every phrase at its longest, three lines at once
            const kmh = unit === 'mph' ? '7 TO 37 MPH' : '12 TO 60 KM/H', seen = [];
            const cases = [
                // (CHANGED in the repair of 1.0.1: a count that has reached what is needed is said without "OF". These three read
                // "120 OF 20 CORNERS" and "80 OF 14 SLOW CORNERS"; the first check found "18 OF 14" on a car after a few minutes in town)
                [P({ left: 0, right: 1 }, { left: 0, right: 1 }), 'YAW RATE: 120 CORNERS KEPT, 6 MORE LEFT, 5 RIGHT', 'STEERING: 80 SLOW CORNERS KEPT, 4 MORE LEFT, 3 RIGHT'],
                [P({ left: 0, right: 0 }, { left: null, right: null }), 'YAW RATE: 120 CORNERS KEPT, 6 MORE EACH WAY', 'STEERING: 80 SLOW CORNERS KEPT (YAW RATE FIRST)'],
                [P({ left: 60, right: 0 }, { left: 0, right: 40 }), 'YAW RATE: 120 CORNERS KEPT, 6 MORE TO THE RIGHT', 'STEERING: 80 SLOW CORNERS KEPT, 4 MORE TO THE LEFT'],
                // (and below what is needed, with "OF", each at its longest)
                [P({ have: 19, left: 0, right: 1 }, { have: 13, left: 0, right: 1 }), 'YAW RATE: 19 OF 20 CORNERS, 6 MORE LEFT, 5 RIGHT', 'STEERING: 13 OF 14 SLOW CORNERS, 4 MORE LEFT, 3 RIGHT'],
                [P({ have: 19, left: 0, right: 0 }, { have: 13, left: null, right: null }), 'YAW RATE: 19 OF 20 CORNERS, 6 MORE EACH WAY', 'STEERING: 13 OF 14 SLOW CORNERS (YAW RATE FIRST)'],
                [P({ have: 19, left: 19, right: 0 }, { have: 13, left: 0, right: 13 }), 'YAW RATE: 19 OF 20 CORNERS, 6 MORE TO THE RIGHT', 'STEERING: 13 OF 14 SLOW CORNERS, 4 MORE TO THE LEFT'],
                [P({ left: 60, right: 60 }, { left: 40, right: 40 }), 'YAW RATE: 120 CORNERS, UNEVEN: 999 %, LIMIT 8 %', 'STEERING: 80 SLOW CORNERS, UNEVEN: 999 %, LIMIT 12 %'],
                [P({ have: 19, left: 10, right: 9 }, { have: 13, left: 7, right: 6 }), 'YAW RATE: 19 OF 20 CORNERS, 1 MORE, EITHER WAY', 'STEERING: 13 OF 14 SLOW CORNERS, 1 MORE, EITHER WAY'],
            ];
            for (let i = 0; i < cases.length; i++) {
                prog = cases[i][0];
                for (const learn of ['learning', 'none']) {
                    live = Object.assign({}, live, { state: 'ready', run: null, learning: true, learn, noSteer: 'unlearned', blocked: false, angle: 0.2, dir: null });
                    const l = await screens(car, 'widest-' + unit + '-progress-' + i + '-' + learn, 0);
                    seen.push(has(l.drift, cases[i][1]) && has(l.drift, cases[i][2]) && has(l.drift, (learn === 'none' ? 'IT LEARNS IN GENTLE CORNERS AT ' : 'NO BEST IS SET UNTIL THEN. IT LEARNS AT ') + kmh) && find(l.drift, /^(YAW RATE|STEERING|NO BEST|IT LEARNS)/).every((t) => t.size === 15 && t.x0 + t.w <= 484));
                }
            }
            prog = null;
            // (no line says "N OF M" with N at M or beyond it, whatever the counts)
            const odd = [], PT = require(path.join(JS, 'screens')).progressText;
            for (let have = 0; have <= 40; have++) [[null, null], [0, 0], [have, 0], [0, have], [Math.floor(have / 2), Math.ceil(have / 2)]].forEach((lr) => {
                [PT(P({}, { have, left: lr[0], right: lr[1], spread: 0.01 }).steer, 'SLOW CORNERS'), PT(P({ have, left: lr[0], right: lr[1], spread: 0.01 }, {}).yaw, 'CORNERS')].forEach((txt) => { const m = /^(\d+) OF (\d+) /.exec(txt); if (m && Number(m[1]) >= Number(m[2])) odd.push(txt); if (!/^\d+ (OF \d+ )?(SLOW )?CORNERS/.test(txt)) odd.push(txt); });
            });
            if (unit === 'kmh') ok(odd.length === 0 && PT(P({}, { have: 18, left: null, right: null }).steer, 'SLOW CORNERS') === '18 SLOW CORNERS KEPT (YAW RATE FIRST)' && PT(P({}, { have: 30, left: 0, right: 30 }).steer, 'SLOW CORNERS') === '30 SLOW CORNERS KEPT, 4 MORE TO THE LEFT' && PT(P({}, { have: 13, left: null, right: null }).steer, 'SLOW CORNERS') === '13 OF 14 SLOW CORNERS (YAW RATE FIRST)',
                '  (the repair of 1.0.1) a count that has reached what is needed is said without "OF": "STEERING: 18 SLOW CORNERS KEPT (YAW RATE FIRST)", "STEERING: 30 SLOW CORNERS KEPT, 4 MORE TO THE LEFT" (they read "18 OF 14 SLOW CORNERS ..."). With every count from 0 to 40 and every split of sides, no line says "N OF M" with N at M or beyond' + (odd.length ? ': ' + odd.slice(0, 4).join(' | ') : ''));
            ok(seen.length === 16 && seen.every(Boolean), '  (1.0.1) under the drawn car, how far learning is and what is missing: each of eight phrases for the yaw rate and for the steering at its longest (CHANGED in the repair: five before), with the line that says at what speeds the steering learns (' + kmh + '), three lines of 15 px, none past the panel');
        }
    });

    /* ================= what the kit draws for this app ================= */
    await ok.part('the header and the settings, where the kit draws them itself (GPU renderer, full-screen layout)', async () => {
        const G = require(path.join(KIT, 'gauges')), rec = bench.rec, fonts = bench.fonts, MODE = {};
        fit.MODES.forEach((m) => { MODE[m.name] = m; });
        require(path.join(JS, 'proven-theme')).register();
        const theme = require(path.join(KIT, 'themes')).theme('proven'), tabs = require(path.join(JS, 'screens')).TABS.concat(['Settings']);
        // the header: the app's name and every tab, on iDrive 7 (from the back-arrow column at 84 to the HMI's status icons at 1340) and on iDrive 8
        const header = (badges) => {
            const bad = [], named = [];
            [['iDrive 7', 84, 1340 - 84, 1920], ['iDrive 8', 0, 2880, 2880]].forEach(([scr, x, w, sw]) => {
                const c = new rec.Recorder(sw, 80);
                c.reset();
                const end = G.header(c, theme, x, 0, w, 80, spec.title, tabs, 0, badges, true, true);
                const strings = (c._texts || []).map((t) => t.s);
                if (strings.indexOf(spec.title) >= 0) named.push(scr);
                tabs.forEach((t) => { if (strings.indexOf(String(t).toUpperCase()) < 0) bad.push(scr + ': the tab "' + t + '" is left out'); });
                badges.forEach((b) => { if (strings.indexOf(b.text) < 0) bad.push(scr + ': the badge ' + b.text + ' is left out'); });
                if ((c.tabRects || []).length !== tabs.length) bad.push(scr + ': ' + (c.tabRects || []).length + ' of ' + tabs.length + ' tabs can be touched');
                if (end > x + w + 0.5) bad.push(scr + ': the header ends at ' + Math.round(end) + ', its room at ' + (x + w));
                fit.faults(c._texts || [], [], { fonts, scale: 1, left: x, right: x + w, top: 0, bottom: 80 }).forEach((f) => bad.push(scr + ': ' + f));
            });
            return { bad, named };
        };
        const h1 = header([{ text: 'BETA' }]), h2 = header([{ text: 'BETA' }, { text: 'DEMO' }]);
        ok(tabs.length === 6 && h1.bad.length === 0 && h1.named.join() === 'iDrive 7,iDrive 8', 'the kit\'s full-screen header shows "Proven Drift", its five tabs, Settings and the BETA badge on iDrive 7 and iDrive 8' + (h1.bad.length ? ':\n        ' + h1.bad.join('\n        ') : ''));
        ok(h2.bad.length === 0 && h2.named.join() === 'iDrive 8', 'with the DEMO badge beside BETA every tab and both badges still show on both. On iDrive 7 the kit then leaves the app\'s name out of its header to make the room (its own rule, kit/runtime/gauges.js)' + (h2.bad.length ? ':\n        ' + h2.bad.join('\n        ') : ''));

        // the settings: every row with every value beside its label, and every list of values
        const { headUnit } = require('../../kit/tools/hu-stub');
        const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pps-drift-sheet-'));
        tmpDirs.push(dataDir);
        const quiet = console.log; console.log = () => {};
        const hu = headUnit(APP, { dataDir, fresh: true, sets: { demo: 'off' }, image: () => Promise.resolve(), log: { info() {}, warn() {}, error() {}, debug() {} } });
        console.log = quiet;
        const settings = hu.settings, { listSheet } = require(path.join(KIT, 'sheet'));
        // every setting offered: the switches that show more settings are on, and each "when" holds
        (spec.settings || []).forEach((s) => { if (s.when) Object.keys(s.when).forEach((k) => { settings.values[k] = [].concat(s.when[k])[0]; }); });
        const offered = (spec.settings || []).filter((s) => settings.shown(s));
        const wrongs = {}, cut = {}, cutValue = {};
        let sheetFrames = 0, rowsSeen = 0, valuesSeen = 0;
        const draw = (sh, mode) => { let r = null; for (let i = 0; i < 14; i++) { r = fit.surface(rec, W, 520, mode); sh.draw(r, theme); } sheetFrames++; return r; };
        const look = (r, mode, where, list) => {
            const seen = (r._texts || []).filter((t) => !t.clip || (t.y - t.size * 0.7 >= t.clip.y && t.y <= t.clip.y + t.clip.h));
            seen.forEach((t) => {
                if (!/\.\.\.$/.test(t.s)) return;
                if (list && t.x0 > 100) cutValue[t.s.replace(/\s*\.\.\.$/, '')] = true; else cut[mode.says + ', ' + where + ': "' + t.s + '"'] = true;
            });
            fit.faults(seen, r._boxes || [], { fonts, scale: mode.scale, left: 0, right: W, top: 0, bottom: 512 + mode.extra }).forEach((f) => { wrongs[mode.says + ', ' + where + ': ' + f] = true; });
        };
        [MODE.id7, MODE.id8].forEach((mode) => {
            const sh = listSheet(settings, null, { version: spec.version });
            rowsSeen = sh.rows().length;
            offered.forEach((s, i) => {
                const vals = s.type === 'choice' ? (s.options || []).map((o) => o[0]) : s.type === 'number' ? (s.steps || []) : [settings.get(s.key)];
                const was = settings.values[s.key];
                vals.forEach((v) => { settings.values[s.key] = v; sh.focus = i; look(draw(sh, mode), mode, 'the list at "' + s.label + '"', true); });
                settings.values[s.key] = was;
                if (s.type === 'choice' || s.type === 'number') {
                    sh.open = s;
                    const n = sh.rows().length;
                    for (let k = 0; k < n; k += 3) { sh.sub = k; look(draw(sh, mode), mode, 'the values of "' + s.label + '"'); }
                    sh.sub = n - 1; look(draw(sh, mode), mode, 'the values of "' + s.label + '"');
                    valuesSeen += n;
                    sh.open = null;
                }
            });
            if (OUT) { const s2 = listSheet(settings, null, { version: spec.version }); fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'settings-' + mode.name + '.png'), fit.picture(rec, require(path.join(KIT, 'canvas')), draw(s2, mode), mode.scale).png()); }
        });
        const cuts = Object.keys(cut), wr = Object.keys(wrongs), got = Object.keys(cutValue);
        // (CHANGED in the repair of 1.0.1: 23, it was 22. "Note stop signals" is new: the record's signal listeners are behind it)
        ok(offered.length === rowsSeen && offered.length === 23 && spec.settings.length === 23, 'all 23 settings are rows of the list the kit draws (with Workshop settings on and the chassis on "Other"): the 16 of 1.0.0, the six that ask more of the car, and "Note stop signals"');
        ok(cuts.length === 0, 'no label is cut short with "..." in the list of settings, and no value in its own list of values (' + valuesSeen / 2 + ' values), at the iDrive 7 and iDrive 8 text sizes (' + sheetFrames + ' frames)' + (cuts.length ? ':\n        ' + cuts.slice(0, 8).join('\n        ') : ''));
        ok(got.length === 0, 'in the list of settings the kit gives a value 560 px and cuts a longer one: none of this app\'s is that long' + (got.length ? ' (CUT: "' + got.join('", "') + '")' : ''));
        ok(wr.length === 0, 'and in them no text lies on another, leaves the page or crosses the edge of its row' + (wr.length ? ':\n        ' + wr.slice(0, 8).join('\n        ') : ''));
        ok(['yawSource', 'steerSource', 'useSteer', 'useLong', 'resetLearned', 'resetBest', 'sigOn'].concat(Object.keys(bench.ALL_ON)).every((k) => { const s = spec.settings.filter((x) => x.key === k)[0]; return s && s.when && s.when.workshop === true; }) && spec.settings.filter((x) => x.key === 'workshop')[0].default === false,
            'the yaw source, the steering source, the steering check, the forward acceleration, the two resets, the six settings that ask more of the car and "Note stop signals" only show with "Workshop settings" on, which is off as shipped');
        const sg = spec.settings.filter((x) => x.key === 'sigOn')[0];
        ok(sg && sg.type === 'bool' && sg.default === false && sg.label === 'Note stop signals (study)', '(the repair of 1.0.1) "Note stop signals (study)" is OFF as shipped: the app then listens for no signal, as 1.0.0 did');
        ok(Object.keys(bench.ALL_ON).every((k) => { const s = spec.settings.filter((x) => x.key === k)[0]; return s.type === 'bool' && s.default === false; }) && Object.keys(bench.ALL_ON).filter((k) => k !== 'askCar').every((k) => /\(study, off in full at next start\)$/.test(spec.settings.filter((x) => x.key === k)[0].label)) &&
            spec.settings.filter((x) => x.key === 'askCar')[0].label === 'Ask the car for values (study)' && !spec.settings.some((x) => /DSC|traction|ESP/i.test(x.label)),
            '(1.0.1) each of those six is OFF as shipped, which is also what the app goes back to when the platform has emptied its data; the five that subscribe say in their name that switching one off takes full effect at the next start; no setting names DSC');
        ok(JSON.stringify(spec.screens[0].buttons.map((b) => b[0])) === '["BTN_PAGE","BTN_PREV","BTN_SETTINGS"]', 'the bar has the kit\'s two page buttons and Settings, and nothing else: no page needs a button');
        // the font: the built app carries the same five atlases as the other Proven apps (test_fonts.js checks those), and both licences
        const fdir = path.join(KIT, 'fonts'), repo = path.resolve(__dirname, '..', '..', 'kit', 'runtime', 'fonts'), fam = ['label', 'bold', 'num', 'light', 'gear'];
        const same = fam.every((f) => fs.readFileSync(path.join(fdir, f + '.json')).equals(fs.readFileSync(path.join(repo, f + '.json'))));
        const made = fam.map((f) => JSON.parse(fs.readFileSync(path.join(fdir, f + '.json'), 'utf8'))).every((j) => /^Rajdhani \(SIL OFL 1\.1\)/.test(String(j.source)) && /^pps-rajdhani-[0-9a-f]{16}$/.test(String(j.cacheKey)));
        ok(same && made && fs.existsSync(path.join(fdir, 'OFL-Rajdhani.txt')) && fs.existsSync(path.join(fdir, 'UFL-Ubuntu.txt')), 'the built app carries the five Rajdhani text atlases of this copy of the kit, byte for byte, each with its own cacheKey, and both font licences');
    });

    /* ================= (1.0.1) as shipped ================= */
    let LEARNED_SHIPPED = null;
    /** A folder with the saved file of a car that was learned as shipped (the steering wheel's angle as its steering source). */
    const shippedDir = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pps-drift-shipped-')); tmpDirs.push(d); fs.writeFileSync(path.join(d, FILE), JSON.stringify({ v: 1, best: { score: null, angle: null, time: null, dist: null }, drifts: [], learned: LEARNED_SHIPPED })); return d; };
    const watches = (car, from) => car.calls.slice(from || 0).filter((c) => c.type === 'watch').map((c) => c.iface + ' [' + c.fields.join(', ') + ']');
    const ons = (car, from) => car.calls.slice(from || 0).filter((c) => c.type === 'on').map((c) => c.iface + '.' + c.event);
    const gets = (car, from) => car.calls.slice(from || 0).filter((c) => c.type === 'getValue').length;
    const CORE = ['Vehicle2 [statusCarSpeed2]', 'CDS2 [statusLateralAccelerationMassCenter, statusLongitudinalAccelerationMassCenter, statusYawVelocityVehicle]', 'SteeringAngle [ActualSteeringAngleDriver, actualSteeringAngleDriverNoCRC]'];
    await ok.part('(1.0.1) as shipped: the core signals only, no getter read of the app\'s own, and the car is learned and its drifts read from what it notifies', async () => {
        const car = await bootShipped({});
        await past(car);
        const s0 = await screens(car, 'shipped-not-learned');
        ok(watches(car).join(' | ') === CORE.join(' | ') && ons(car).length === 0,
            'as shipped the app subscribes to three interfaces and no more: ' + watches(car).join('; ') + '. No proxy is built for any other interface, and no event is subscribed to');
        ok(car.view().live.kmh === 0 && car.view().live.state === 'slow' && has(s0.drift, 'LEARNING THE CAR') && has(s0.drift, '0') && has(s0.drift, 'km/h') && car.session.meters.speedN.n <= 2 && car.kitReads === 4,
            'a standing car notifies nothing, and the app still knows that it stands: the kit\'s own first read of the speed gave 0 km/h (' + car.session.meters.speedN.n + ' speed values in the first 3 s; the kit read four getters, once each)');
        ok(find(s0.signals, /^switched off$/).length === 7 && find(s0.study, /^switched off$/).length === 6 && find(s0.study, /^not read$/).length === 1 && find(s0.signals, /^present/).length === 5 && find(s0.signals, /^no data yet$/).length === 1 &&
            ['Ask the car for values: OFF. The app reads no getter itself', 'GPS receiver: OFF. No GPS check of the speed', 'Wheel speeds: OFF. No rear wheelspin; learning cannot check that the wheels grip', 'Other steering and yaw: OFF. Steering: the steering wheel\'s angle. Yaw rate: CDS2',
                'Pedal and handbrake: OFF. The pedal\'s raw value is not shown, the handbrake is not known', 'Car estimate and analyser: OFF. No raw values of the car\'s own estimate and analyser'].every((l) => has(s0.study, l)),
            'the Signals tab says "switched off" for the seven sources that are extras (and "not read" for the DSC button\'s state); its second page lists the six settings, each OFF, with what the app does without it');
        ok(find(s0.drift, /^switched off in Settings$/).length === 1 && find(s0.drift, /PEDAL/).length === 0 && has(s0.signals, 'Wheel speeds: switched off') && has(s0.study, 'Accelerator pedal, raw: switched off in Settings') && has(s0.study, 'Wheel values, raw: switched off in Settings') && has(s0.signals, 'Positive sideways acceleration is a LEFT turn: ASSUMED (the wheel speeds are switched off)') &&
            has(s0.study, 'GPS: switched off in Settings') && has(s0.study, 'Car\'s motion estimate: switched off in Settings') && find(s0.study, /Getter top-up: switched off$/).length === 1,
            // (CHANGED for 1.0.1: two bars said it, the pedal's and the rear wheelspin's. There is no pedal bar any more)
            'a figure that needs an extra says so: the rear wheelspin bar says "switched off in Settings" where 1.0.0 would show "--", and so do the lines of the wheels, the pedal\'s raw value, the GPS and the study values. There is no PEDAL bar');
        // it is driven: learned from the notified values alone
        await car.play('ordinary');
        await car.play('gentle');
        const st = car.session.eng.learn.status(), wb = car.session.eng.o.wheelbase, DRIVER = -0.04375 / 14.6;
        ok(st.yaw.state === 'learned' && Math.abs(st.yaw.k / DEG / 0.005 - 1) < 0.01 && st.steer.state === 'learned' && car.session.steerKey === 'driver' && st.steer.key === 'driver' && Math.abs(st.steer.k * wb / DEG / DRIVER - 1) < 0.06 && car.side.driverFrom === 'steerD',
            'ordinary and slow corners: the yaw rate is learned (its scale right to ' + (Math.abs(st.yaw.k / DEG / 0.005 - 1) * 100).toFixed(2) + ' %) and so is the steering, from the steering wheel\'s angle (' + (st.steer.k * wb / DEG).toFixed(5) + ' degrees at the wheels per count; the made-up car: ' + DRIVER.toFixed(5) + ')');
        ok(car.session.maxAge === 0 && car.session.motionAge === 0 && car.session.yawAge === 0 && car.session.signalsView(clock.mono).inUse.speed === 'speedN' && car.session.eng.angle.o.yawMaxAgeMs === 0 && car.session.eng.angle.o.latMaxAgeMs === 0,
            'the engine is on the notified speed, where silence is "no change"; no age limit is put on the speed, and none on the yaw rate or the sideways acceleration while no drift runs (on a straight such a limit needs the getters)');
        const out = [];
        for (const name of ['held', 'right', 'switches', 'circle']) {
            let worst = 0;
            const T = car.sceneScript(name).T * 1000 - 1000, mids = [];
            for (let at = 500; at < T - 3000; at += 250) mids.push({ at, fn: async () => { const v = car.view().live; if (v.angle !== null && v.state === 'drift') worst = Math.max(worst, Math.abs(v.angle - Math.abs(car.truthNow(v.t).beta) / DEG)); } });
            // (the second one with the app's screen hidden)
            car.screen = name !== 'right';
            await car.play(name, { mid: mids, after: 2500 });
            car.screen = true;
            out.push({ name, rec: lastDrift(car), worst });
        }
        const TRUE = { held: 30.1, right: 21.8, switches: 30.4, circle: 36.6 };
        ok(car.session.sess.count === 4 && out.every((o) => o.rec.flags.length === 0 && Math.abs(o.rec.peak - TRUE[o.name]) < 1.5 && o.worst < 2.5) && car.store.data.best.score !== null,
            'four kinds of drift, one of them with the screen hidden, are each counted once with no flag, and set the bests: ' + out.map((o) => o.name + ' ' + o.rec.peak + ' for ' + TRUE[o.name]).join(', ') + ' (the angle shown within ' + Math.max.apply(null, out.map((o) => o.worst)).toFixed(1) + ' degrees of the made-up car\'s at every look)');
        ok(out[0].rec.opp > 20 && out[0].rec.pedal === null && out[0].rec.wheelspin === null && out[0].rec.handbrake === null && out[3].rec.gps === null,
            'each with its opposite lock (' + out[0].rec.opp + ' degrees); the pedal, the rear wheelspin, the handbrake and the GPS check are not known: their sources are switched off');
        const s1 = await screens(car, 'shipped-after-drifts');
        ok(find(s1.last, /^switched off$/).length === 3 && find(s1.last, /^not known$/).length === 0 && find(s1.last, /PEDAL/).length === 0 && find(s1.drift, /^switched off in Settings$/).length === 1 && has(s1.signals, 'Steering, steering wheel, chassis: LEARNED') && find(s1.signals, /Steering check: on$/).length === 1,
            'the Last tab says "switched off" for the three figures it still shows of them (CHANGED for 1.0.1: four, with AVERAGE PEDAL), not "not known"; the Signals tab says that the steering wheel\'s angle is learned and the steering check on');
        // parked for five minutes: silence is not a lost speed
        await car.run(car.script().to(6, { v: 0, pedal: 0 }).hold(4));
        const n0 = car.session.meters.speedN.n;
        await advance(300000);
        const s2 = await screens(car, 'shipped-parked', 0);
        ok(car.session.meters.speedN.n === n0 && car.view().live.kmh === 0 && car.view().live.state === 'slow' && has(s2.drift, 'TOO SLOW') && !has(s2.drift, 'DATA LOST'),
            'parked for five minutes the car notifies no speed at all, and the app goes on knowing that it stands (TOO SLOW, not DATA LOST): the last value notified stands');
        ok(gets(car) === 0 && ons(car).length === 0 && watches(car).length === 3 && car.kitReads === 4 && car.side.speedPoll === null && car.side.cdsPoll === null && car.side.reads().asked === 0,
            'in the whole drive of ' + Math.round((clock.mono - car.logAt[0]) / 60000) + ' minutes, shown, hidden and parked, the app made NOT ONE getter read of its own (the two schedulers were never even made), built no proxy but the three, and subscribed to no event');
        const f = fileOf(car);
        ok(f && f.learned && f.learned.yaw.cds2.length >= 20 && f.learned.steer['driver/cds2'].length >= 14 && f.drifts.length === 4, 'the saved file holds what was learned (' + f.learned.yaw.cds2.length + ' moments for the yaw rate, ' + f.learned.steer['driver/cds2'].length + ' for the steering wheel\'s angle) and the four drifts');
        LEARNED_SHIPPED = f.learned;
    });

    await ok.part('(1.0.1) a car like the first one: its speed notified about 47 times a second while it changes and not at all while it holds, CDS2 ten times a second', async () => {
        // (what Proven Drag's Signals tab showed on that car: speed 47 to 50 a second while it changed, the acceleration 10 a second;
        // the GPS receiver's event once a second with about 38 sentences. How it sends its yaw rate and its steering is not known)
        const car = await bootShipped({ notifyMs: 21, notifyDelay: 8, cdsMs: 100, nmeaSentences: 35 });
        await past(car);
        await advance(20000);
        ok(car.session.meters.speedN.n <= 2 && car.view().live.kmh === 0 && car.view().live.state === 'slow', 'standing for 23 s it notifies no speed (' + car.session.meters.speedN.n + ' values: the kit\'s own first read): the app shows 0 km/h and waits');
        await car.play('ordinary');
        await car.play('gentle');
        const st = car.session.eng.learn.status(), sv = car.session.signalsView(clock.mono);
        ok(st.yaw.state === 'learned' && st.steer.state === 'learned' && Math.abs(st.yaw.k / DEG / 0.005 - 1) < 0.01 && sv.meters.speedN.most > 45 && sv.meters.speedN.most < 50 && Math.abs(sv.meters.lat.most - 10) < 0.5 && Math.abs(sv.meters.yawC.most - 10) < 0.5,
            'it is learned from what it notifies: the speed arrived ' + sv.meters.speedN.most.toFixed(1) + ' times a second at most, the sideways acceleration and the yaw rate ' + sv.meters.lat.most.toFixed(1) + ' (yaw rate "' + st.yaw.state + '" with ' + st.yaw.moments + ' moments, steering "' + st.steer.state + '" with ' + st.steer.moments + ')');
        const out = [];
        for (const name of ['held', 'right', 'switches', 'handbrake', 'circle']) {
            let worst = 0;
            const T = car.sceneScript(name).T * 1000 - 1000, mids = [];
            for (let at = 500; at < T - 3000; at += 250) mids.push({ at, fn: async () => { const v = car.view().live; if (v.angle !== null && v.state === 'drift') worst = Math.max(worst, Math.abs(v.angle - Math.abs(car.truthNow(v.t).beta) / DEG)); } });
            await car.play(name, { mid: mids, after: 2500 });
            out.push({ name, rec: lastDrift(car), worst });
        }
        const TRUE = { held: 30.1, right: 21.8, switches: 30.4, handbrake: 39.1, circle: 36.6 };
        ok(car.session.sess.count === 5 && out.every((o) => o.rec.flags.length === 0 && Math.abs(o.rec.peak - TRUE[o.name]) < 1.5 && o.worst < 2.5 && o.rec.rate >= 9.5 && o.rec.rate <= 10.5),
            'five kinds of drift are each counted once, with no flag, on 10 samples a second: ' + out.map((o) => o.name + ' ' + o.rec.peak + ' for ' + TRUE[o.name]).join(', ') + ' (the angle shown within ' + Math.max.apply(null, out.map((o) => o.worst)).toFixed(1) + ' degrees at every look). These are the made-up car\'s figures, no promise for a real one');
        const s = await screens(car, 'like-the-first-car');
        ok(has(s.drift, '10/s') && find(s.signals, /^48\/s$/).length >= 1 && find(s.signals, /^10\/s$/).length >= 6 && gets(car) === 0 && watches(car).length === 3,
            'the Drift tab shows the data rate (10/s, no warning: the limit is 8), the Signals tab the speed\'s 48/s; and still not one getter read, and three proxies');
        // the GPS receiver switched on: its event once a second with 38 sentences
        const before = car.calls.length;
        car.settings.set('gpsOn', true);
        // (a straight at a speed that is held but not still to the last count: 80 to 81 km/h and back. The GPS check takes a
        // sentence only while the car's speed is fresh, and as shipped a speed that holds perfectly still is not sent at all)
        await car.run(car.script().to(6, { v: 80, pedal: 0.3 }).to(7, { v: 81 }).to(7, { v: 80 }));
        const g = car.session.gps.status(clock.mono), s2 = await screens(car, 'like-the-first-car-gps', 5);
        ok(watches(car, before).join() === 'SatellitePositioning []' && ons(car, before).join() === 'SatellitePositioning.updatePosition' && g.sentences.ok >= 38 * 15 && g.sentences.bad === 0 && has(s2.study, '38 sentences') && find(s2.study, /^GPS speed over the car's: straight x1\.00\d \(\d+\)/).length === 1 && gets(car) === 0,
            '"GPS receiver" switched on in Workshop settings: one more proxy and its one event, at once. In 20 s ' + g.sentences.ok + ' sentences arrived (38 in each event), all read, and the GPS check of the speed is there: ' + (find(s2.study, /^GPS speed over/)[0] || { s: '' }).s);
    });

    await ok.part('(1.0.1) as shipped on cars that send too little: a low data rate, CDS2 never notified', async () => {
        // five a second: under the limit of 8. 1.0.0 topped such a car up from its getters; as shipped 1.0.1 does not
        let car = await bootShipped({ cdsMs: 200, dataDir: shippedDir() });
        await past(car);
        let mid = null;
        await car.play('held', { mid: { at: 6500, fn: async () => { mid = { v: car.view().live, s: await screens(car, 'shipped-low-data-rate', 0) }; } }, after: 2500 });
        let rec = lastDrift(car);
        const every = [];
        Object.keys(drawn['shipped-low-data-rate']).forEach((pg) => words(drawn['shipped-low-data-rate'][pg]).forEach((w) => every.push(w)));
        ok(rec && rec.flags.join() === 'LOW DATA RATE' && Math.abs(rec.rate - 5) < 0.3 && Math.abs(rec.peak - 30.1) < 2 && car.store.data.best.score === null && gets(car) === 0,
            'a car that notifies its yaw rate and accelerations 5 times a second: the drift is counted (peak ' + rec.peak + ') and flagged LOW DATA RATE, so it sets no best; no getter is read');
        ok(Math.abs(mid.v.rate - 5) < 0.3 && has(mid.s.drift, '5/s') && every.every((w) => !/NaN|Infinity|undefined|null/.test(w)) && [rec.rate, rec.score, rec.peak, rec.pm, rec.time].every((x) => typeof x === 'number' && isFinite(x)),
            'the Drift tab shows the rate as it is (5/s), and no figure of the drift or text of the page comes out of a missing rate (no "NaN", no "undefined")');
        const s = await screens(car, 'shipped-low-data-rate-last', 1);
        ok(has(s.last, 'LOW DATA RATE: the car sent its motion data less than 8 times a second.'), 'the Last tab says the flag in words');
        // never notified at all: the kit's first read is all there ever is
        car = await bootShipped({ cds2: 'silent' });
        await past(car);
        await car.play('ordinary', { after: 1000 });
        const sv = car.session.signalsView(clock.mono), sd = await screens(car, 'shipped-no-motion-data');
        ok(car.view().live.learn === 'none' && car.view().starved === true && sv.meters.lat.n === 1 && sv.meters.yawC.n === 1 && car.session.sess.count === 0 && gets(car) === 0,
            'KNOWN LIMIT: a car that never notifies its yaw rate and accelerations gives the app one value of each (the kit\'s own first read) and nothing after: as shipped nothing can be learned on it, and nothing is counted');
        ok(has(sd.drift, 'LEARNING THE CAR') && has(sd.drift, 'Almost no motion data arrives from the car. Please photograph the Signals tab.') && !has(sd.drift, 'Drive a few ordinary corners, left and right. Nothing is scored yet') && find(sd.signals, /^1$/).length >= 3,
            'the Drift tab says so instead of asking for more corners ("Almost no motion data arrives from the car. Please photograph the Signals tab."), and the Signals tab shows one sample for each of the three');
        const before = car.calls.length;
        car.settings.set('askCar', true);
        await car.play('ordinary', { after: 1000 });
        ok(car.view().live.learn !== 'none' && car.view().starved === false && gets(car, before) > 500 && watches(car, before).length === 0, 'with "Ask the car for values" switched on for that car the getters are read where the car sends too little, as 1.0.0 did, and it is learned (yaw rate "' + car.view().live.learn + '")');

        // all of CDS2 stops in the middle of a held drift, as shipped: no getter to ask, and still the drift must not run on
        car = await bootShipped({ dataDir: shippedDir() });
        await past(car);
        let died = null, late = null;
        await car.play('held', { mid: [{ at: 6500, fn: async () => { car.on.cds2 = 'off'; } }, { at: 8300, fn: async () => { died = car.view().live; } },
            { at: 9500, fn: async () => { late = { v: car.view().live, s: await screens(car, 'shipped-cds2-died', 0) }; } }], after: 2500 });
        rec = lastDrift(car);
        ok(rec && car.session.sess.count === 1 && rec.end === 'lost' && rec.flags.indexOf('DATA GAP') >= 0 && rec.time > 4.8 && rec.time < 6.2 && car.store.data.best.score === null && late.v.state === 'noyaw' && late.v.angle === null && late.v.run === null &&
            has(late.s.drift, 'NO YAW RATE FROM THE CAR') && gets(car) === 0,
            'all of CDS2 stops in the middle of a held drift: as shipped the drift still ends 2.5 s later, flagged DATA GAP, and sets no best (' + (rec ? rec.score + ' points, ' + rec.time + ' s, ended ' + rec.end : 'no drift') + '); the banner says NO YAW RATE FROM THE CAR. ' +
            'While a drift runs, a yaw rate and a sideways acceleration that say nothing for 2.5 s count as lost without any getter: a car that slides does not hold both still to the last count');
        ok(died.state === 'drift', 'KNOWN LIMIT (as in 1.0.0): for those 2.5 s the drift went on from the last values (1.8 s after: DRIFT, ' + died.run.score + ' points)');
        await car.run(car.script().to(1, { lat: 0, drift: 0, spin: 0, pedal: 0.3 }).hold(20));
        ok(car.session.sess.count === 1 && car.view().live.state === 'noyaw' && car.view().live.angle === null, 'the car drives on for 20 s with CDS2 dead: no angle, nothing more is counted');
        car.on.cds2 = 'notify';
        await advance(5000);
        await car.play('held', { after: 2500 });
        ok(car.session.sess.count === 2 && lastDrift(car).flags.length === 0, 'CDS2 comes back, the car goes straight for a moment, and the next drift counts without a flag');
        // on a straight it cannot be told
        car = await bootShipped({ dataDir: shippedDir() });
        await past(car);
        await car.run(car.script().to(7, { v: 60, pedal: 0.3 }).hold(4));
        car.on.cds2 = 'off';
        await advance(6000);
        const sq = await screens(car, 'shipped-cds2-silent-on-a-straight', 0);
        let inDead = null;
        await car.play('held', { mid: { at: 6500, fn: async () => { inDead = car.view().live; } }, after: 2500 });
        ok(has(sq.drift, 'READY') && !has(sq.drift, 'NO YAW RATE FROM THE CAR') && inDead.state === 'ready' && inDead.angle < 2 && car.session.sess.count === 0 && gets(car) === 0,
            'KNOWN LIMIT, NEW IN 1.0.1: CDS2 stops as a whole on a straight. As shipped the app reads no getter, so a sensor that has died and one whose value holds still look alike: 6 s later the banner still says READY, and a drift driven then shows ' + inDead.angle.toFixed(1) +
            ' degrees and is not counted. (1.0.0 said NO YAW RATE FROM THE CAR within 3.2 s, and so does 1.0.1 with "Ask the car for values" on: the part about how the speed and CDS2 arrive checks that)');
    });

    /* ================= (1.0.1, second part) the pedal, wheel values in an unknown form, the record's faults ================= */
    await ok.part('(1.0.1) the accelerator pedal: no percentage anywhere, made up or not; with its setting on, its raw value for a photo', async () => {
        // a file as 1.0.0 wrote it: a pedal range in what was learned, and a drift with a pedal figure
        const old = { score: 371, grade: 'C', end: 'ended', flags: [], peak: 29.9, avg: 21, dir: 'L', switches: 0, time: 6.5, dist: 118, entry: 70, avgKmh: 66, minKmh: 60, peakG: 0.7, peakYaw: 30, opp: 26, pedal: 67, wheelspin: 37, handbrake: false,
            pm: 1, pmMax: 2, mult: 1.6, smooth: 1, reversals: 0, rate: 50, gap: 0, date: Date.UTC(2026, 10, 24, 20, 0, 0), gps: null, trace: { ms: 100, a: [0, -10, -20, -30, -20], v: [70, 69, 68, 67, 66] } };
        const dir = shippedDir();
        fs.writeFileSync(path.join(dir, FILE), JSON.stringify({ v: 1, best: { score: old, angle: old, time: old, dist: old }, drifts: [old], learned: Object.assign({}, LEARNED_SHIPPED, { pedal: { min: 12, max: 3100 } }) }));
        let car = await bootShipped({ dataDir: dir, sets: { pedalOn: true } });
        await past(car);
        const s0 = await screens(car, 'saved-by-1-0-0-with-a-pedal-figure');
        ok(car.store.data.drifts.length === 1 && car.store.data.drifts[0].pedal === 67 && car.store.data.learned.pedal.max === 3100 && car.session.eng.learn.status().yaw.state === 'learned' && has(s0.last, '371') && has(s0.last, '37 %'),
            'a saved file of 1.0.0 with a pedal range and a drift with "pedal 67 %" still loads: the drift, its other figures and what was learned are there');
        ok(PAGES.every((pg) => find(s0[pg], /PEDAL|67 %/).length === 0) && find(s0.last, /^[A-Z ±/]+$/).filter((t) => t.size === 14).length === 17,
            'and its pedal figure is not shown on any page: the Last tab has seventeen figures, none of them the pedal\'s');
        // the pedal from the floor up and back, a drift, a clean stop
        await car.run(car.script().to(4, { v: 50, pedal: 0 }).hold(2).to(1, { pedal: 1 }).hold(1.5).to(1, { pedal: 0.3 }).hold(1));
        const moving = car.view().live;
        await car.play('held', { after: 2500 });
        const rec = lastDrift(car), s1 = await screens(car, 'pedal-setting-on'), e = car.session.eng;
        ok(rec && rec.flags.length === 0 && rec.pedal === null && moving.pedal === null && e.pedalAt === null && e.x.pedal === null && e.learn.ped.max === 3100 && kept(car).pedal === null && fileOf(car).drifts[0].pedal === null && fileOf(car).drifts[1].pedal === 67,
            'the pedal moved from 0 to the floor and a drift was driven with "Pedal and handbrake" on: not one pedal value reached the engine, the new drift has no pedal figure in memory or in the saved file (the old drift keeps its own, unshown), and the old range was not moved');
        ok(PAGES.every((pg) => find(s1[pg], /PEDAL/).length === 0) && find(s1.drift, /^\d+ %$/).length === 0 && find(s1.last, /^\d+ %$/).length === 0 && car.logged(/^drift \d+: /).length === 1 && car.logged(/^drift \d+: .*pedal/).length === 0 && car.logged(/pedal range/).length === 0,
            'no page shows a PEDAL bar, an AVERAGE PEDAL or a pedal percentage, and the log\'s line for the drift has no pedal in it');
        const full = find(s1.study, /^Pedal, actualValueAngleAcceleratorPedal: now (\d+) \(0x([0-9A-F]+)\), (\d+\/s|0\/s now, most \d+\/s)$/), lohi = find(s1.study, /^ {4}lowest (\d+) \(0x[0-9A-F]+\), highest (\d+) \(0x[0-9A-F]+\), (\d+( or more)? different values|one value only)$/);
        const m = full.length === 1 ? /now (\d+) \(0x([0-9A-F]+)\)/.exec(full[0].s) : null;
        ok(m && Number(m[1]) === parseInt(m[2], 16) && lohi.length === 3 && /^ {4}lowest 0 \(0x0\), highest 3200 \(0xC80\), \d+( or more)? different values$/.test(lohi[0].s) && Number(/(\d+)( or more)? different/.exec(lohi[0].s)[1]) > 20 && has(s1.study, '    lowest 0 (0x0), highest 0 (0x0), one value only') &&
            find(s1.study, /^Pedal, qualifierActualVa\.\.cceleratorPedal: now 0 \(0x0\)$/).length === 1 && find(s1.study, /^Pedal, actualValueAngleA\.\.torPedalVirtual: now \d+ \(0x[0-9A-F]+\)$/).length === 1 &&
            has(s1.study, '    For its form: one photo with the foot off, one with the foot on the floor (1 more field not shown)') && find(s1.signals, /^0 to 3200$/).length === 1,
            'with the setting on, the Signals tab\'s second page shows the pedal raw: "' + (full[0] || { s: '' }).s + '", "' + (lohi[0] || { s: '' }).s.trim() + '" (the stand-in\'s pedal reads 0 with the foot off and 3200 on the floor), the same for two more numeric fields of the value under their own names, and that one more is not shown; page 1 has its lowest and highest beside its row');
        ok(PAGES.every((pg) => find(s1[pg], /unwrap|decod/i).length === 0) && has(s1.study, 'Pedal and handbrake: ON. The pedal is shown raw, at the right; no percentage'), 'no decoding is guessed: the page says the pedal is shown raw, and no percentage');
        // the same drive with the pedal's setting off: nothing in the score or the flags depends on the pedal
        const ref = await bootShipped({ dataDir: shippedDir() });
        await past(ref);
        await ref.run(ref.script().to(4, { v: 50, pedal: 0 }).hold(2).to(1, { pedal: 1 }).hold(1.5).to(1, { pedal: 0.3 }).hold(1));
        await ref.play('held', { after: 2500 });
        const r0 = lastDrift(ref);
        ok(r0 && r0.score === rec.score && r0.grade === rec.grade && r0.peak === rec.peak && r0.time === rec.time && r0.flags.join() === rec.flags.join() && r0.mult === rec.mult,
            'the same drive with "Pedal and handbrake" off gives the same drift to the last figure (' + r0.score + ' points, grade ' + r0.grade + ', peak ' + r0.peak + ', ' + r0.time + ' s, multiplier ' + r0.mult + '): neither the score nor a flag depends on the pedal');
        // the demo car
        car = await bootShipped({ sets: { demo: 'on' } });
        await past(car);
        await advance(45000);
        const sd = await screens(car, 'demo-without-a-pedal');
        ok(car.session.demoOn && car.session.demoSess.count >= 1 && car.session.demoSess.list.every((d) => d.pedal === null) && car.view().live.pedal === null && PAGES.slice(0, 4).every((pg) => find(sd[pg], /PEDAL/).length === 0) && find(sd.drift, /^REAR WHEELSPIN$/).length === 1,
            'demo data: ' + car.session.demoSess.count + ' made-up drifts, none with a pedal figure, and no PEDAL on the demo\'s pages either (the demo car\'s rear wheelspin is still shown: it is the demo\'s own)');
    });

    await ok.part('(1.0.1) wheel values in an unknown form (65407 standing still, no plain multiple of the speed): shown raw, and no wheelspin is shown, scored or saved', async () => {
        const FORMS = [
            ['an offset count with its two bytes swapped (0x7FFF standing reads 0xFF7F)', (x) => { const v = (0x7FFF + Math.round(x)) & 0xFFFF; return ((v & 0xFF) << 8) | (v >> 8); }],
            ['a count that falls from 65407 as the wheel turns faster', (x) => 65407 - Math.round(x)],
        ];
        for (const form of FORMS) {
            const tag = form === FORMS[0] ? 'swapped' : 'falling';
            const car = await bootShipped({ dataDir: shippedDir(), sets: { wheelsOn: true }, wheelForm: form[1] });
            await past(car);
            await advance(3000);
            const st0 = car.session.eng.learn.status();
            ok(car.session.raw.wheels === '65407 65407 65407 65407' && car.session.wheelsWhy() === 'wait' && car.session.eng.rfS.count === 0, form[0] + ': standing, all four read 65407, as on the first car; nothing of them has reached the engine');
            // one steady speed: ratios taken at ONE speed agree with each other whatever the form (this is where a wheelspin made of nothing came from)
            await car.run(car.script().to(7, { v: 60, pedal: 0.3 }).hold(5));
            const one = car.session.proof.status(), b = car.session.proof.b.fl, keys = Object.keys(b);
            const spreadAtOne = keys.length ? (Math.max.apply(null, b[keys[0]].map((r) => r[0])) / Math.min.apply(null, b[keys[0]].map((r) => r[0])) - 1) : null;
            ok(one.ok === false && one.why === 'wait' && keys.length === 1 && b[keys[0]].length >= 5 && spreadAtOne < 0.03 && car.view().live.wheelspin === null && car.session.eng.rfS.count === 0,
                '  5 s at 60 km/h: the ' + b[keys[0]].length + ' ratios of raw value to speed agree within ' + (spreadAtOne * 100).toFixed(1) + ' %, as ratios at one speed always do. That proves nothing: the values are "not proven yet", and there is no wheelspin');
            await car.run(car.script().to(4, { v: 36 }).hold(3).to(4, { v: 62 }).hold(3));
            const two = car.session.proof.status();
            ok(two.ok === false && two.why === 'form' && car.session.wheelsWhy() === 'form' && car.session.eng.rfS.count === 0, '  36 and 62 km/h held as well: across speeds the ratios do not agree, so the values are "no plain multiple of the speed" and stay out of the engine');
            await car.play('held', { after: 2500 });
            const rec = lastDrift(car), s = await screens(car, 'wheels-in-an-unknown-form-' + tag), st1 = car.session.eng.learn.status(), f = fileOf(car);
            ok(rec && rec.flags.length === 0 && Math.abs(rec.peak - 30.1) < 2 && rec.wheelspin === null && kept(car).wheelspin === null && f.drifts[0].wheelspin === null && car.logged(/^drift 1: .* rear wheelspin not known/).length === 1 && rec.score > 300,
                '  a drift in which the made-up car spins its rear wheels by 35 %: counted and scored as ever (' + rec.score + ' points, no flag), with NO rear wheelspin in memory, in the saved file or in the log');
            ok(st1.wheels.readings === st0.wheels.readings && st1.wheels.base === st0.wheels.base && st1.left.agree + st1.left.against === st0.left.agree + st0.left.against && JSON.stringify(f.learned.wheels) === JSON.stringify(LEARNED_SHIPPED.wheels || f.learned.wheels),
                '  and nothing was learned from them: no usual ratio of rear to front, no vote on which way is left, nothing of the wheels new in the saved file');
            const rows = find(s.study, /^ {4}(Front|Rear) (left|right): now \d+, \d+ to \d+, at a steady \d+ km\/h: \d+$/);
            ok(has(s.drift, 'wheel values in an unknown form') && find(s.drift, /^\d+ %$/).length === 0 && has(s.last, 'wheels not proven') && has(s.signals, 'Wheel speeds: NOT USED: the values are no plain multiple of the speed. Raw: page 2') &&
                has(s.study, 'Wheel values, raw: NOT USED: the values are no plain multiple of the speed') && rows.length === 4 && rows.every((r) => / to 65407, /.test(r.s) || /now \d+, \d+ to \d+/.test(r.s)) && find(s.signals, /^present$/).length >= 1,
                '  the screens say why: the REAR WHEELSPIN bar "wheel values in an unknown form", the Last tab "wheels not proven", the Signals tab "NOT USED: the values are no plain multiple of the speed", and its second page each wheel raw: "' + (rows[0] || { s: '' }).s.trim() + '"');
        }
        // the stand-in car's own wheel values are plain multiples: the same drive proves them, and the wheelspin is there
        const car = await bootShipped({ dataDir: shippedDir(), sets: { wheelsOn: true } });
        await past(car);
        await car.run(car.script().to(7, { v: 60, pedal: 0.3 }).hold(5));
        const one = car.session.wheelsWhy();
        await car.run(car.script().to(4, { v: 36 }).hold(3).to(4, { v: 62 }).hold(3));
        await car.play('held', { after: 2500 });
        const rec = lastDrift(car), s = await screens(car, 'wheels-proven', 5);
        ok(one === 'wait' && car.session.wheelsWhy() === null && rec && rec.wheelspin > 25 && has(s.study, 'Wheel values, raw: plain multiples of the speed: in use'),
            'the same drive with wheel values that ARE plain multiples of the speed: "not proven yet" at one speed, proven after 36 and 62 km/h, and the drift has its rear wheelspin (' + (rec && rec.wheelspin) + ' %)');
    });

    await ok.part('(1.0.1) faults found in Proven Drag\'s record, tried on the app: the record right after a switch, the rates at an end, asked first, a line with every extra on', async () => {
        const dataDir = shippedDir(), boxTmp = bench.newDir(), BOXF = path.join(boxTmp, 'pps-box-pps_drift-' + process.getuid(), 'box.json');
        const me = () => JSON.parse(fs.readFileSync(BOXF, 'utf8')).lives[0];
        let car = await bootShipped({ dataDir, boxTmp });
        await past(car);
        await car.run(car.script().to(5, { v: 50, pedal: 0.3 }).hold(4));
        // (the car gains speed while its page is drawn ten times a second: every frame is another picture, so about ten a second are handed over)
        car.setTruth(car.script().to(8, { v: 130 }).hold(2));
        for (let i = 0; i < 45; i++) { await car.draw(); await advance(100); }
        const n0 = me();
        // "GPS receiver" switched on: the record says so at that moment, not at the next 2 s beat
        car.settings.set('gpsOn', true);
        const n1 = me();
        ok(n0.on.length === 0 && n0.note.want === 3 && n0.note.ok === 3 && n1.on.join() === 'gpsOn' && n1.note.want === 4 && n1.note.ok === 3 && n1.note.wait.join() === 'SatellitePositioning',
            '"GPS receiver" switched on: at that very moment the record in RAM says "on: GPS" and "set-up 3 of 4 (under way: SatellitePositioning)" (in Proven Drag it said "extras off, set-up done" for up to 2 s more)');
        await advance(150);
        const n2 = me();
        ok(n2.note.want === 4 && n2.note.ok === 4 && n2.note.wait.length === 0 && n2.s === n1.s, '150 ms later, still before the next 2 s beat: "set-up done" with four interfaces. A note is taken whenever a subscription changes its state');
        // 30 ms later, with no frame drawn in between, another setting is switched: a third note
        await advance(30);
        car.settings.set('pedalOn', true);
        const n2b = me();
        ok(n0.note.nps > 50 && n0.note.fps >= 5 && n1.note.fps >= 5 && n2.note.nps === n1.note.nps && n2.note.fps === n1.note.fps && n2b.on.join() === 'gpsOn,pedalOn' && n2b.note.fps === n1.note.fps && n2b.note.nps === n1.note.nps,
            'those notes come closer together than a second: each keeps the frames and values a second of the note before (' + n2b.note.fps + ' frames/s, ' + n2b.note.nps + ' values/s), none works them out over the few milliseconds since (no frame was drawn in them: that would read 0 frames/s)');
        // the app's own error right after a note: the last note's rates stand
        await car.run(car.script().hold(2.02));
        const n3 = me();
        const keep = () => {};
        process.on('uncaughtException', keep);
        process.emit('uncaughtException', new Error('test: thrown right after a note'));
        process.removeListener('uncaughtException', keep);
        car.box.end('exit', 1);
        const n4 = me();
        ok(n4.end === 'error' && n4.code === 1 && n3.note.nps > 50 && n4.note.nps === n3.note.nps && n4.note.fps === n3.note.fps, 'the app\'s own error: the record\'s last note keeps its ' + n4.note.fps + ' frames/s and ' + n4.note.nps + ' values/s');
        // every extra on, then no word: the next start has room for that life's whole note
        car = await bootShipped({ dataDir, boxTmp, sets: bench.ALL_ON });
        await past(car);
        await car.run(car.script().to(5, { v: 50, pedal: 0.3 }).hold(6));
        car = await bootShipped({ dataDir, boxTmp });
        await past(car);
        const s = await screens(car, 'after-a-kill-with-every-extra-on', 4), l2 = find(s.signals, /^#2 .* lived \d+ s, NO WORD/)[0];
        const cont = l2 ? s.signals.filter((t) => t.y > l2.y + 10 && t.y < l2.y + 26 && /^ {4}\S/.test(t.s))[0] : null, whole = l2 && cont ? l2.s + ',' + cont.s : '';
        ok(l2 && cont && / on: own reads, GPS, wheels, other sources, pedal, study$/.test(cont.s) && /Last note: memory \d+ MB/.test(whole) && /set-up done/.test(whole) && /\d+ frames\/s software/.test(whole) && /\d+ values\/s/.test(whole) && /own reads \d+ of \d+/.test(whole) && has(s.signals, 'The saved data was emptied after #2') === false,
            'a life with all six settings on that ended without a word: the next start shows it on two lines, with its whole last note and "on: own reads, GPS, wheels, other sources, pedal, study" (one line cut the note short): "' + (cont ? cont.s.trim() : '') + '"');
        // asked to stop: the word is in the record in RAM before the saved file is written
        let seen = null;
        const save0 = car.store.save.bind(car.store);
        car.store.save = () => { seen = me().end; return save0(); };
        car.shutdown();
        car.store.save = save0;
        ok(seen === 'asked' && me().end === 'asked', 'the SDK\'s shutdown event: when the saved file is written, the record in RAM already says "asked to stop" (a kill while saving does not read as NO WORD)');
    });

    /* ================= (1.0.1) the extras ================= */
    await ok.part('(1.0.1) each extra: not subscribed while off, subscribed at once when switched on, no longer used at once when switched off', async () => {
        const car = await bootShipped({ dataDir: shippedDir() });
        await past(car);
        await car.run(car.script().to(7, { v: 60, pedal: 0.3 }).hold(3));
        // a gentle weave at 60 km/h, so that every source has something to say
        const weave = () => car.run(car.script().to(1.2, { lat: 0.2, pedal: 0.4 }).hold(1).to(1.2, { lat: -0.2, pedal: 0.25 }).hold(1).to(1, { lat: 0, pedal: 0.3 }).hold(0.6));
        await weave();
        const rowsOf = async () => { const out = {}; for (const pg of [4, 5]) { await car.page(pg); const t = await car.draw(); car.side.status().forEach((src) => { const lab = t.filter((x) => x.s === src.label)[0]; if (lab) out[src.key] = (t.filter((x) => Math.abs(x.y - lab.y) < 2 && x.x0 > 200 && x.x0 < 380)[0] || { s: '' }).s; }); } await car.page(0); return out; };
        const WANT = {
            gpsOn: { watch: ['SatellitePositioning []'], on: ['SatellitePositioning.updatePosition'], rows: ['nmea'] },
            wheelsOn: { watch: ['Powertrain [ActualValueRPMWheel]'], on: [], rows: ['wheels'] },
            sourcesOn: { watch: ['SpeedAcceleration [YawSpeedVehicle]', 'XView [statusFrontAxleSteeringAngle, statusSteeringAngleDriver]'], on: ['SteeringAngle.SteeringAngleFrontAxleEffective'], rows: ['yawS', 'steerF', 'steerXF', 'steerXD'] },
            pedalOn: { watch: ['AcceleratorPedal [AngleAcceleratorPedal]', 'CDS [statusHandBrake]'], on: [], rows: ['pedal', 'hb'] },
            studyOn: { watch: ['FES [statusDSCSwitchHMI]', 'DrivingVector [ActualVectorVehicleMove, VehicleDynamicDataEstimatedVerified]', 'MDrive [statusDriftLast, statusDriftBest]'], on: [], rows: ['dsc', 'move', 'est', 'mLast', 'mBest'] },
        };
        const LATE = ['hb', 'dsc', 'mLast', 'mBest'];
        const r0 = await rowsOf();
        ok(Object.keys(WANT).every((k) => WANT[k].rows.every((row) => r0[row] === (row === 'dsc' ? 'not read' : 'switched off'))) && r0.speedP === 'switched off' && watches(car).length === 3,
            'as shipped every row of the five groups of extras says "switched off" (15 rows, and the getter\'s), and three proxies exist');
        for (const key of Object.keys(WANT)) {
            const w = WANT[key], before = car.calls.length;
            car.settings.set(key, true);
            await advance(150);
            const asked = { watch: watches(car, before), on: ons(car, before) };
            await weave();
            // (a value that only changes now and then is sent when it next changes: the handbrake, the DSC button, the analyser's results.
            // These extras are subscribed without a first read by the kit, so until then their rows say "no data yet")
            const rowsLate = w.rows.filter((row) => LATE.indexOf(row) >= 0), r0b = await rowsOf();
            const lateOk = rowsLate.every((row) => r0b[row] === 'no data yet');
            rowsLate.forEach((row) => car.send[row](car.value[row](clock.mono)));
            await advance(100);
            const r1 = await rowsOf(), n1 = w.rows.map((row) => (car.session.meters[row] || { n: 0 }).n);
            ok(asked.watch.join(' | ') === w.watch.join(' | ') && asked.on.join(' | ') === w.on.join(' | ') && w.rows.every((row) => /^present/.test(r1[row])) && n1.every((n) => n >= 1) && gets(car) === 0 && lateOk,
                '"' + car.side.settings.item(key).label.replace(/ \(.*$/, '') + '" switched on: subscribed within 150 ms (' + asked.watch.concat(asked.on.map((o) => o + ' on the proxy that is there')).join('; ') + '), and its ' + w.rows.length + (w.rows.length === 1 ? ' row says' : ' rows say') + ' "present"' +
                (rowsLate.length ? ' (' + rowsLate.length + ' of them once the car has next sent the value: "no data yet" until then)' : ''));
            // off again: no longer used from this moment, its rows say so; nothing is taken back from the car
            const calls1 = car.calls.length;
            car.settings.set(key, false);
            await advance(150);
            const live = car.view().live;
            await weave();
            const r2 = await rowsOf(), n2 = w.rows.map((row) => (car.session.meters[row] || { n: 0 }).n);
            ok(w.rows.every((row) => r2[row] === (row === 'dsc' ? 'not read' : 'switched off')) && n2.join() === n1.join() && car.calls.length === calls1 && car.forbidden.length === 0 &&
                (key !== 'pedalOn' || (live.pedal === null && live.handbrake === null)) && (key !== 'wheelsOn' || live.wheelspin === null) && (key !== 'gpsOn' || car.session.gps.status(clock.mono).sentences.ok === 0),
                '  switched off again: its rows say "' + (key === 'studyOn' ? 'switched off" (the DSC button\'s: "not read")' : 'switched off"') + ' at once, not one more of its values is counted or used (the car goes on sending them: the subscription ends with the next start), and nothing is asked of the car for it');
        }
        // all of them on at once, then a drift: as 1.0.0 had it
        const before = car.calls.length;
        Object.keys(WANT).forEach((key) => car.settings.set(key, true));
        await advance(150);
        ok(car.calls.length === before, 'all five switched on a second time in the same start: nothing new is asked of the car (what was subscribed is still subscribed), the values are simply used again');
        await weave();
        car.send.hb(car.value.hb(clock.mono));
        // (1.0.1) the wheel values must prove themselves first: the car has held one speed only since they were switched on
        const whyBefore = car.session.wheelsWhy(), sWait = await screens(car, 'wheels-not-proven-yet', 0);
        ok(whyBefore === 'wait' && car.view().live.wheelspin === null && has(sWait.drift, 'wheel values not proven yet') && car.session.eng.rfS.count === 0,
            '(1.0.1) the wheel speeds switched on and the car at one speed only: no wheel value has reached the engine, and the REAR WHEELSPIN bar says "wheel values not proven yet"');
        await car.run(car.script().to(4, { v: 36, pedal: 0.3 }).hold(3).to(4, { v: 62 }).hold(3));
        const proven = car.session.wheelsWhy();
        // (the engine then learns the usual ratio of rear to front itself, as before: a few seconds of ordinary driving)
        await car.run(car.script().to(6, { v: 50 }).to(6, { v: 64 }).to(3, { v: 60 }).hold(1));
        ok(proven === null && car.session.eng.learn.values().wheelBase !== null && car.logged(/^wheel speeds: the four values are plain multiples of the car's speed across steady speeds: used from now on$/).length === 1,
            '(1.0.1) the car holds 36 and then 62 km/h on a straight for 3 s each: its wheel values are plain multiples of its speed at both, and from then on the engine has them (logged once) and learns the usual ratio of rear to front as before');
        await car.play('held', { after: 2500 });
        const rec = lastDrift(car);
        // (CHANGED for 1.0.1: "with its pedal (N %)". No pedal figure is worked out any more)
        ok(rec && rec.flags.length === 0 && rec.pedal === null && rec.wheelspin > 25 && rec.handbrake === false && Math.abs(rec.peak - 30.1) < 2 && car.session.steerKey === 'driver',
            'a drift with all of them on: counted with no flag, with its rear wheelspin (' + rec.wheelspin + ' %) and "handbrake at the start: no", and no pedal figure; the steering source in use is still the steering wheel\'s angle (Auto prefers it)');
        // the app's own getter reads: on, then off
        const g0 = gets(car);
        car.settings.set('askCar', true);
        await advance(6000);
        const g1 = gets(car), row1 = (await rowsOf()).speedP;
        car.settings.set('askCar', false);
        await advance(200);
        const g2 = gets(car);
        await advance(6000);
        ok(g0 === 0 && g1 >= 50 && /^present/.test(row1) && gets(car) === g2 && car.side.polling === false && (await rowsOf()).speedP === 'switched off' && car.session.speedSeries(clock.mono) === 'notified' && car.view().live.state !== 'gap',
            '"Ask the car for values" switched on: the speed getter is read (' + (g1 - g0) + ' reads in 6 s); switched off: not one more read, the engine is back on the notified speed and takes nothing for lost');
        // a source set by hand that is an extra: used only while the extras are on
        car.settings.set('steerSource', 'front');
        await advance(1200);
        const byHand = car.session.steerKey;
        car.settings.set('sourcesOn', false);
        await advance(1200);
        const s = await screens(car, 'extra-source-off', 4);
        // (CHANGED in the repair of 1.0.1: the Signals tab's line read "Steering, steering wheel, chassis: LEARNED" and nothing said that the choice in Settings was not used)
        ok(byHand === 'front' && car.session.steerKey === 'driver' && car.logged(/^steering: source "driver" in use from now on \(was "front", which is switched off in Settings\)$/).length === 1 && has(s.signals, 'Steering, steering wheel, chassis (the source set in Settings is switched off): LEARNED') &&
            car.logged(/^steering: Settings names the source "front", which belongs to "Other steering and yaw": that is switched off, so "driver" is used$/).length === 1 && find(s.signals, /^Yaw rate, CDS2: /).length === 1,
            '"Steering from: Front wheels, chassis" by hand uses that extra source while "Other steering and yaw" is on; with it switched off the app is back on the steering wheel\'s angle at once, the log says why, and the Signals tab says "Steering, steering wheel, chassis (the source set in Settings is switched off)"');
        // "Ask the car for values" on, the car standing, and an extra switched on whose set-up fails the first time: the own
        // reads are held back until it has been tried again (5 s). Nothing is read and nothing notified in that time, and
        // that is a speed that has not changed, not a speed that is lost.
        const slow = await bootShipped({ dataDir: shippedDir(), sets: { askCar: true }, watchFail: { Powertrain: 1 } });
        await past(slow);
        await advance(3000);
        const series0 = slow.session.speedSeries(clock.mono), settled0 = slow.side.settled();
        slow.settings.set('wheelsOn', true);
        await advance(300);
        const from0 = slow.calls.length;
        let lost = 0, heldBack = 0;
        for (let i = 0; i < 42; i++) { await advance(100); if (slow.view().live.state === 'gap' || slow.session.stateWord() === 'nodata') lost++; if (!slow.side.settled()) heldBack++; }
        const meanwhile = gets(slow, from0), seriesHeld = slow.session.speedSeries(clock.mono);
        await advance(3000);
        ok(series0 === 'polled' && settled0 === true && heldBack === 42 && meanwhile === 0 && lost === 0 && seriesHeld === 'notified' && slow.side.settled() && gets(slow, from0) > 0 && slow.session.speedSeries(clock.mono) === 'polled' && slow.view().live.state !== 'gap' &&
            slow.side.status().filter((x) => x.key === 'wheels')[0].state !== 'off',
            'with "Ask the car for values" on and the car standing, "Wheel speeds" is switched on and its set-up fails the first time: for the ' + (heldBack / 10).toFixed(1) + ' s until it is tried again the app reads no getter (' + meanwhile +
            ' reads), the engine is on the notified speed and the speed is never taken as lost (' + lost + ' of 42 looks); once the set-up is done the getter is read and in use again');
        // an extra whose first subscription failed and waits to be tried again (5 s), switched OFF before that: nothing of its
        // interface is wanted any more, so the retry asks nothing of the car (found by the last read of 1.0.1). Switched on
        // again later, it is asked for afresh.
        const gone = await bootShipped({ dataDir: shippedDir(), sets: { wheelsOn: true }, watchFail: { Powertrain: 1 } });
        await past(gone);
        await advance(1000);
        const pw = () => gone.calls.filter((c) => c.type === 'watch' && /Powertrain/.test(JSON.stringify(c))).length;
        const asked1 = pw(), state1 = gone.side.subs.powertrain.state;
        gone.settings.set('wheelsOn', false);
        await advance(8000);
        const asked2 = pw(), state2 = gone.side.subs.powertrain.state, proxy2 = !!(gone.side.subs.powertrain.sub && gone.side.subs.powertrain.sub.proxy);
        gone.settings.set('wheelsOn', true);
        await advance(1000);
        ok(asked1 === 1 && state1 === 'error' && asked2 === 1 && state2 === 'off' && proxy2 === false && pw() === 2 && gone.side.subs.powertrain.state === 'ok' &&
            gone.logged(/^signal Powertrain: not tried again \(nothing of it is switched on any more\)$/).length === 1 && gone.logged(/^ERROR /).length === 0,
            '"Wheel speeds" on, its first subscription fails (to be tried again after 5 s), and it is switched OFF before that: 8 s later Powertrain was asked for ' + asked2 + ' time (the first), no proxy is built, the log says "not tried again". WAS: a second subscription, with no field, for an interface nothing is wanted of. Switched on again: asked for afresh (' + pw() + ' in all) and subscribed');
    });

    /* ================= (1.0.1) starts and stops ================= */
    await ok.part('(1.0.1) starts and stops: saved at a clean stop, the record on the Signals tab, the line on the Drift tab', async () => {
        const dataDir = bench.newDir(), boxTmp = bench.newDir(), BOX = path.join(boxTmp, 'pps-box-pps_drift-' + process.getuid(), 'box.json'), COPY = path.join(dataDir, 'pps_drift_box.json');
        const boxOf = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
        // (the head unit's uptime runs with the test's clock)
        const start = (o) => bootShipped(Object.assign({ dataDir, boxTmp, uptime: () => 5000 + clock.mono / 1000 }, o));
        const lifeLines = (texts) => find(texts, /^#\d+ /).map((t) => t.s);

        // ---- life 1: driven for a while, then the platform asks it to stop ----
        let car = await start();
        await past(car);
        let s = await screens(car, 'life-1', 4);
        ok(lifeLines(s.signals).length === 1 && /^#1 now: \d+ s, /.test(lifeLines(s.signals)[0]) && / on: none$/.test(find(s.signals, /on: /)[0].s) && has(s.signals, 'STARTS AND STOPS OF PROVEN DRIFT 1.0.1, NEWEST FIRST') && car.logged(/^starts and stops: #1 now: 0 s, on: none$/).length === 1,
            'a first start: the Signals tab has the block "Starts and stops", always shown, with one line (' + lifeLines(s.signals)[0].slice(0, 60) + ' ...), and the log has it too');
        // (the repair of 1.0.1) the record listens for no signal unless "Note stop signals" is switched on
        const sigCount = () => ['SIGTERM', 'SIGHUP', 'SIGINT'].map((x) => process.listenerCount(x)).join();
        const g0 = sigCount(), page0 = (await screens(car, 'note-stop-signals-off', 5)).study;
        car.settings.set('sigOn', true);
        const g1 = sigCount(), on1 = boxOf(BOX).lives[0].on.join(), page1 = (await screens(car, 'note-stop-signals-on', 5)).study, line1 = find(await (async () => { await car.page(4); return car.draw(); })(), /on: /)[0].s;
        car.settings.set('sigOn', false);
        const g2 = sigCount(), on2 = boxOf(BOX).lives[0].on.join(), page2 = (await screens(car, 'note-stop-signals-off-again', 5)).study;
        await car.page(0);
        ok(g0 === '0,0,0' && has(page0, 'Note stop signals: OFF. An end by a signal reads NO WORD, like a kill') && g1 === '1,1,1' && on1 === 'sigOn' && has(page1, 'Note stop signals: ON. A signal that ends the app is noted first') && / on: signals$/.test(line1) &&
            g2 === '0,0,0' && on2 === '' && has(page2, 'Note stop signals: OFF. An end by a signal reads NO WORD, like a kill') && car.logged(/^settings: "Note stop signals" switched on: /).length === 1 && car.logged(/^settings: "Note stop signals" switched off: the app listens for no signal, as shipped$/).length === 1,
            '(the repair of 1.0.1) as shipped the app listens for no signal (SIGTERM, SIGHUP, SIGINT: ' + g0 + ' listeners on the process) and the Signals tab\'s second page says "Note stop signals: OFF. An end by a signal reads NO WORD, like a kill". Switched on: one listener each (' + g1 + '), the record lists "on: signals" at once; switched off: the listeners are gone at once (' + g2 + ') and it is no longer listed');
        const b1 = boxOf(BOX), c1 = boxOf(COPY), st1 = fs.statSync(BOX), dir1 = fs.statSync(path.dirname(BOX));
        ok(b1 && b1.v === 1 && b1.lives.length === 1 && b1.lives[0].n === 1 && b1.lives[0].end === null && typeof b1.lives[0].up === 'number' && /^\d\d\.\d\d\. \d\d:\d\d:\d\d$/.test(b1.lives[0].at) && c1 && c1.lives[0].n === 1 && (st1.mode & 0o777) === 0o644 && (dir1.mode & 0o777) === 0o755,
            'the record is in RAM (a folder of the app\'s own, mode 0755, the file 0644) and its copy in the data folder, both written at the start: life 1, when it started (' + b1.lives[0].at + ' and the head unit\'s uptime), no end yet');
        await car.play('ordinary', { after: 0 });
        const n1 = boxOf(BOX).lives[0];
        ok(n1.note && n1.note.mem > 0 && typeof n1.note.cpu === 'number' && typeof n1.note.lagMax === 'number' && n1.note.show === 'drift' && n1.note.path === 'soft' && ['learning', 'ready'].indexOf(n1.note.state) >= 0 && n1.note.ok === 3 && n1.note.want === 3 && n1.note.failed === 0 && n1.note.asked === 0 && n1.note.nps > 100 && n1.s > 200,
            'while it runs the record in RAM is refreshed every 2 s with the last note: ' + n1.s + ' s alive, memory ' + n1.note.mem + ' MB, processor ' + n1.note.cpu + ' %, hold-up ' + n1.note.lagMax + ' ms, ' + n1.note.nps + ' values a second, the Drift tab showing, software frames, "' + n1.note.state + '", 3 of 3 interfaces set up, 0 getter reads. (Memory and processor are this test\'s own process here, not an app\'s on a head unit)');
        ok(JSON.stringify(boxOf(BOX)).length < 4000 && !/lat|lon|course|heading|position/i.test(Object.keys(n1.note).concat(Object.keys(n1)).join(' ')), 'the record is ' + JSON.stringify(boxOf(BOX)).length + ' characters, and none of its members is a position, a course or a heading (' + Object.keys(n1).join(', ') + '; note: ' + Object.keys(n1.note).join(', ') + ')');
        // (more corners, until memory is ahead of the file: the file is written every 20 s on the move)
        const more = car.script().to(4, { v: 70, pedal: 0.3 }).hold(2);
        for (let i = 0; i < 12; i++) more.to(1.5, { lat: (i % 2 ? -1 : 1) * 0.35 }).hold(5);
        car.setTruth(more);
        for (let i = 0; i < 400 && car.session.eng.learn.status().yaw.moments <= fileOf(car).learned.yaw.cds2.length; i++) await advance(250);
        const mem = car.session.eng.learn.status().yaw.moments, inFile = fileOf(car).learned.yaw.cds2.length, saves = car.store.saves, copyRev = boxOf(COPY).rev;
        car.session.log.set('run'); car.session.log.info('a line held back, as while a drift runs');
        car.shutdown();
        const after = fileOf(car).learned.yaw.cds2.length, bEnd = boxOf(BOX), cEnd = boxOf(COPY);
        ok(mem > inFile && after === mem && car.store.saves === saves + 1, 'the platform asks the app to stop (the SDK\'s "shutdown" event): the saved file is written at once, once (' + inFile + ' moments of the yaw rate were in it, memory held ' + mem + ', now it holds ' + after + ')');
        ok(bEnd.lives[0].end === 'asked' && cEnd.lives[0].end === 'asked' && cEnd.rev > copyRev && car.logged(/^stopping: asked to stop by the car\. The saved file is written$/).length === 1 && car.logs.filter((l) => /^a line held back, as while a drift runs/.test(l)).length === 1,
            'the stop is noted in the record, in RAM and in the data folder ("asked"), the log says so, and the line that was held back is written out');

        // ---- life 2: starts on that; then it is killed (nothing is written) ----
        await advance(40000);
        car = await start();
        await past(car);
        s = await screens(car, 'life-2-after-a-clean-stop');
        const l2 = lifeLines(s.signals);
        ok(l2.length === 2 && /^#2 now: \d+ s \(started \d+ s after #1 ended\), /.test(l2[0]) && /^#1 \d\d\.\d\d\. \d\d:\d\d:\d\d lived \d+ min( \d+ s)?, asked to stop by the car, Last note: memory \d+ MB/.test(l2[1]) && !has(s.drift, 'The app stopped by itself last time. Please photograph the Signals tab.') && car.box.byItself === false,
            'started again: "' + l2[1].slice(0, 70) + ' ...", newest first, and how long after it this start came. Nothing on the Drift tab: it was a clean stop');
        ok(car.view().live.learn === 'learned' && car.logged(/^starts and stops: #1 .* asked to stop by the car/).length === 1, 'what was learned is there from the first moment, and the log has the lines too');
        await car.run(car.script().to(7, { v: 60, pedal: 0.3 }).hold(20));
        // (the process is killed: no end is written. The next start finds the last note)
        await advance(15000);
        car = await start();
        car.past = true; await car.draw(); await advance(3200);
        s = await screens(car, 'life-3-after-a-kill');
        const l3 = lifeLines(s.signals);
        ok(l3.length === 3 && /^#2 .* lived \d+ s, NO WORD \(killed, crashed or power lost\), Last note: memory \d+ MB.*, processor \d+ %.*, hold-up \d+ ms.*, Drift tab, ready, set-up done, \d+ frames\/s software, \d+ values\/s, own reads 0 of 0, on: none$/.test(l3[1]) && /started \d+ s after #2's last note/.test(l3[0]),
            'after a kill: "' + l3[1] + '". No word means that none of the three kinds of end was written');
        ok(has(s.drift, 'The app stopped by itself last time. Please photograph the Signals tab.') && has(s.drift, 'TOO SLOW') && car.box.byItself === true, 'and the Drift tab says, in the banner\'s small text: "The app stopped by itself last time. Please photograph the Signals tab."');
        // (CHANGED in the repair of 1.0.1: the minute runs from when the page first shows, after the first screen of 2.6 s, not
        // from the start of the process. Here the screen was shown at once, so the line stands until 62.6 s after that)
        await advance(54000);
        const still = has(await car.draw(), 'The app stopped by itself last time. Please photograph the Signals tab.');
        await advance(6000);
        ok(still && !has(await car.draw(), 'The app stopped by itself last time. Please photograph the Signals tab.') && has(await car.draw(), 'Drifts are counted from 20 km/h'), 'for a minute from when the page first shows (it still stands a minute after the start; six seconds later the banner\'s own text is back)');

        // ---- life 4: killed again, and the data folder emptied (what the platform is said to do after an unexpected exit) ----
        car.settings.set('gpsOn', true); car.settings.set('wheelsOn', true);
        await advance(4000);
        fs.readdirSync(dataDir).forEach((f) => fs.unlinkSync(path.join(dataDir, f)));
        car = await start();
        car.past = true; await car.draw(); await advance(3200);
        s = await screens(car, 'life-4-data-emptied');
        const l4 = lifeLines(s.signals);
        // (CHANGED in the repair of 1.0.1: what was switched on stands at the end of that life's line, or alone on its second
        // line where the note before it is long. With pictures saved this test's own process passes 1000 MB, the memory
        // figure in the note is a digit longer, and the last part moves to the second line: the check failed for that alone)
        ok(l4.length === 4 && /^#3 .* NO WORD \(killed, crashed or power lost\)/.test(l4[1]) && (/ on: GPS, wheels$/.test(l4[1]) || has(s.signals, '    on: GPS, wheels')) && has(s.signals, 'The saved data was emptied after #3') && car.view().live.learn === 'none' && car.settings.get('gpsOn') === false && has(s.drift, 'The app stopped by itself last time. Please photograph the Signals tab.'),
            'killed again and its data folder emptied: the record in RAM outlives that. "#3 ... NO WORD ... on: GPS, wheels" (what had been switched on in that life), "The saved data was emptied after #3"; the settings are back at their defaults (all extras off) and nothing is learned');
        ok(boxOf(COPY) && boxOf(COPY).lives.length === 4 && boxOf(COPY).lives[1].emptied === true, 'and the data folder has its copy again, with that note in it');

        // ---- life 5: the app's own error (the kit's handler would log it and exit with code 1) ----
        const keep = () => {};
        process.on('uncaughtException', keep);
        process.emit('uncaughtException', new Error('test: thrown in a timer\n    at somewhere (file.js:1:1)'));
        process.removeListener('uncaughtException', keep);
        car.box.end('exit', 1);
        ok(boxOf(BOX).lives[0].end === 'error' && boxOf(BOX).lives[0].code === 1 && boxOf(BOX).lives[0].err === 'Error: test: thrown in a timer (file.js:1)', 'an uncaught error: its first line, with the file and line its stack names first, is in the record before any other handler runs, then the exit code');
        car = await start();
        car.past = true; await car.draw(); await advance(3200);
        s = await screens(car, 'life-5-after-an-error');
        const l5 = lifeLines(s.signals);
        ok(l5.length === 5 && /^#4 .* lived \d+ s, THE APP'S OWN ERROR \(exit code 1\): Error: test: thrown in a timer \(file\.js:1\), Last note: /.test(l5[1]) && has(s.drift, 'The app stopped by itself last time. Please photograph the Signals tab.'),
            'the next start says: "' + l5[1].slice(0, 96) + ' ...", and the Drift tab asks for the photo');
        // ---- life 6: five lives are kept; the head unit restarted in between (RAM cleared, uptime back to a few seconds) ----
        await advance(70000);
        const ram2 = bench.newDir();
        car = await bootShipped({ dataDir, boxTmp: ram2, uptime: () => 12 });
        car.past = true; await car.draw(); await advance(3200);
        s = await screens(car, 'life-6-after-a-restart-of-the-head-unit');
        const l6 = lifeLines(s.signals);
        ok(l6.length === 5 && /^#6 now: \d+ s \(the head unit was restarted since #5\)/.test(l6[0]) && /^#5 .* lived at least 1 min( \d+ s)? \(saved note, up to a minute old\), NO WORD/.test(l6[1]) && /, Saved note: memory /.test(l6[1]) && !l6.some((l) => /^#1 /.test(l)) && car.box.byItself === false && !has(s.drift, 'The app stopped by itself last time. Please photograph the Signals tab.'),
            'the head unit is restarted (its RAM is empty, its uptime starts again): the record comes from the copy in the data folder, which is up to a minute behind ("#5 ... lived at least ... (saved note, up to a minute old)", and its note is headed "Saved note"), the line says that the head unit was restarted, and the Drift tab does NOT say that the app stopped by itself. Five lives are kept: #1 is gone');
        // ---- installed again under another user id: that user's record in RAM is read, not written ----
        const ram3 = bench.newDir(), otherDir = path.join(ram3, 'pps-box-pps_drift-' + (process.getuid() + 1));
        fs.mkdirSync(otherDir);
        const theirs = JSON.stringify({ v: 1, rev: 9, lives: [{ n: 41, wall: Date.UTC(2026, 10, 25, 3, 0, 0), up: 100, s: 24, end: null, on: ['gpsOn'], note: { mem: 58, memMax: 60, cpu: 31, cpuMax: 44, lag: 40, lagMax: 85, show: 'drift', state: 'ready', ok: 4, want: 4, failed: 0 }, disk: true, ram: true }] });
        fs.writeFileSync(path.join(otherDir, 'box.json'), theirs);
        car = await bootShipped({ boxTmp: ram3, uptime: () => 400 });
        car.past = true; await car.draw(); await advance(3200);
        s = await screens(car, 'life-after-a-reinstall', 4);
        ok(/^#42 now: /.test(lifeLines(s.signals)[0]) && /^#41 .* lived 24 s, NO WORD \(killed, crashed or power lost\) \(as another user: installed again since\), Last note: memory 58 MB \(most 60\), processor 31 % \(most 44\), hold-up 40 ms \(most 85\), Drift tab, ready, set-up done, on: GPS$/.test(lifeLines(s.signals)[1]) &&
            fs.readFileSync(path.join(otherDir, 'box.json'), 'utf8') === theirs && fs.readdirSync(otherDir).length === 1 && find(s.signals, /^The saved data was emptied/).length === 0,
            'a start that finds no record of its own but one of another user id (the app was installed again and runs as another user): that record is read, shown as such ("' + lifeLines(s.signals)[1].slice(0, 96) + ' ..."), counted on from (#42), and not touched');
        // ---- (the repair of 1.0.1) the process is started long before its screen is first shown ----
        // The first check found: the minute of the Drift tab's line ran from the start of the process. If the platform starts
        // the app again by itself after it stopped, and the owner opens it two minutes later, the line was never seen.
        const dir7 = bench.newDir(), ram7 = bench.newDir();
        car = await bootShipped({ dataDir: dir7, boxTmp: ram7, uptime: () => 5000 + clock.mono / 1000 });
        await past(car);
        await advance(20000);                                   // (killed: no end is written)
        car = await bootShipped({ dataDir: dir7, boxTmp: ram7, uptime: () => 5000 + clock.mono / 1000, screen: false });
        await advance(120000);                                  // two minutes with its screen not shown: nothing is drawn
        car.screen = true;
        const firstFrame = await car.draw();                    // the first screen
        await advance(3200);
        const shown0 = await car.draw();
        await advance(55000);
        const shown1 = await car.draw();
        await advance(6000);
        const shown2 = await car.draw();
        const NOTE_TEXT = 'The app stopped by itself last time. Please photograph the Signals tab.';
        ok(car.box.byItself === true && has(firstFrame, 'CLOSED COURSE ONLY') && has(shown0, NOTE_TEXT) && has(shown1, NOTE_TEXT) && !has(shown2, NOTE_TEXT),
            '(the repair of 1.0.1) the app is started again after a kill and its screen is first shown two minutes later: the Drift tab still says "' + NOTE_TEXT + '", for a minute from then (as released the minute ran from the start of the process, and the line was never seen)');
    });

    /* ================= (1.0.1) frames ================= */
    await ok.part('(1.0.1) a frame goes to the screen only when something on it changed', async () => {
        const Screens = require(path.join(JS, 'screens')), G = require(path.join(KIT, 'gauges')), theme = require(path.join(KIT, 'themes')).theme('proven');
        const wordsOf = (draw) => { const r = new bench.rec.Recorder(1600, 520); r.reset(); draw(r); const w = r.words(); return Buffer.from(Buffer.from(w.buffer, w.byteOffset, w.byteLength)); };
        // a drift running: 1.0.0 let its banner pulse with the clock (a new frame at every look)
        const car = await boot({ dataDir: learnedDir() });
        await past(car);
        let same = null;
        await car.play('held', { mid: { at: 6500, fn: async () => {
            const v = car.session.view(clock.mono), later = Object.assign({}, v, { now: v.now + 137 });
            same = { state: v.live.state, eq: wordsOf((r) => Screens.drift(r, theme, v)).equals(wordsOf((r) => Screens.drift(r, theme, later))), other: !wordsOf((r) => Screens.drift(r, theme, v)).equals(wordsOf((r) => Screens.drift(r, theme, Object.assign({}, v, { live: Object.assign({}, v.live, { run: Object.assign({}, v.live.run, { score: v.live.run.score + 7 }) }) })))) };
        } }, after: 2500 });
        ok(same && same.state === 'drift' && same.eq && same.other, 'in the middle of a drift the Drift tab drawn for two moments 137 ms apart, with the same data, is the same frame to the last byte (and another one as soon as the score differs): the DRIFT banner no longer pulses with the clock');
        void G;
        // every page of a standing car: frames that follow each other are the same, and are not handed over
        await car.run(car.script().to(6, { v: 0, pedal: 0 }).hold(3));
        Object.keys(car.on).forEach((k) => { car.on[k] = k === 'getter' ? car.on[k] : false; });
        car.settings.set('askCar', false);
        await advance(2500);
        const per = [];
        for (let p = 0; p < 6; p++) {
            await car.page(p);
            // (from just after the record's 2 s note, which changes the Signals tab's first line: in the 1.8 s that follow
            // only the seconds the app has lived can change on any page)
            const s0 = car.box.me.s;
            for (let i = 0; i < 60 && car.box.me.s === s0; i++) await advance(50);
            await advance(60);
            await car.draw();
            const t0 = clock.mono, i0 = car.images;
            let frames = 0, changed = 0, last = null;
            // (ten frames a second, as the kit asks for them where it draws in software)
            while (clock.mono - t0 < 1800) { await car.draw(); const w = car.frame.words(), b = Buffer.from(Buffer.from(w.buffer, w.byteOffset, w.byteLength)); if (last && !b.equals(last)) changed++; last = b; frames++; await advance(100); }
            per.push({ page: PAGES[p], frames, changed, pushed: car.images - i0 });
        }
        ok(per.every((x) => x.frames === 18 && x.changed <= 2 && x.pushed <= 4) && per.filter((x) => x.page !== 'signals').every((x) => x.changed === 0 && x.pushed <= 2),
            'a standing car that sends nothing, each of the six pages drawn 18 times in 1.8 s: ' + per.map((x) => x.page + ' ' + x.changed + ' changed, ' + x.pushed + ' handed over').join('; ') + '. (The Signals tab\'s first line counts the seconds the app has lived; a frame that is the same as the last is handed over once in 0.9 s at most)');
        // and when something changes, the frame goes out at once
        await car.page(0);
        Object.keys(car.on).forEach((k) => { if (car.on[k] === false) car.on[k] = true; });
        const i1 = car.images;
        car.setTruth(car.script().to(4, { v: 40, pedal: 0.4 }).hold(2));
        let n = 0;
        for (let i = 0; i < 30; i++) { await car.draw(); n++; await advance(100); }
        // (CHANGED for 1.0.1: "25 or more". The pedal's bar moved on every frame; there is no pedal bar now, and a frame on which the whole km/h shown did not change is the same picture)
        ok(car.images - i1 >= 20, 'the car pulls away: ' + (car.images - i1) + ' of ' + n + ' frames are handed over, each with another speed on it');
        // the first screen: one frame, not one every look; the fade after it lasts 0.45 s
        const fresh = await bootShipped({});
        const j0 = fresh.images;
        for (let i = 0; i < 20; i++) { await fresh.draw(); await advance(100); }
        const splash = fresh.images - j0;
        for (let i = 0; i < 14; i++) { await fresh.draw(); await advance(100); }
        const j1 = fresh.images;
        for (let i = 0; i < 18; i++) { await fresh.draw(); await advance(100); }
        ok(splash <= 4 && fresh.images - j1 <= 3, 'the first screen (2.6 s) is handed over ' + splash + ' times in 2 s, not 20; the page then fades in over 0.45 s, and once it stands, a standing car\'s Drift tab goes out ' + (fresh.images - j1) + ' times in 1.8 s');

        // ---- (the repair of 1.0.1) the Signals tab, the page the owner is asked to photograph ----
        // Both checks found: on a standing car that sends like the first one (CDS2 ten times a second, each value flickering
        // by a count) the first Signals page was a new picture with every sample: 100 of 100 frames in 10 s were handed over,
        // where every other page hands over one in five seconds. The two Signals pages now take what they show once a second.
        const first = await bootShipped({ notifyMs: 21, notifyDelay: 8, cdsMs: 100 });
        await past(first);
        await advance(8000);
        const sig = {};
        for (const pg of [4, 5]) {
            await first.page(pg); await first.draw();
            const i0 = first.images;
            let changed = 0, last = null, late = 0;
            for (let i = 0; i < 100; i++) {
                await advance(100);
                const texts = await first.draw(), w = first.frame.words(), b = Buffer.from(Buffer.from(w.buffer, w.byteOffset, w.byteLength));
                if (last && !b.equals(last)) changed++;
                last = b;
                // (what the page shows is a second old at most: the count of sideways accelerations it shows against the app's own)
                if (pg === 4) { const shown = find(texts, /^\d+$/).map((t) => Number(t.s)), n = first.session.meters.lat.n; if (!shown.some((x) => x <= n && x >= n - 12)) late++; }
            }
            sig[pg] = { handed: first.images - i0, changed, late };
        }
        await first.page(0); await advance(450); await first.page(4);
        const atOnce = find(await first.draw(), /^\d+$/).map((t) => Number(t.s)).indexOf(first.session.meters.lat.n) >= 0;
        ok(first.session.meters.lat.n > 150 && sig[4].handed <= 14 && sig[4].handed >= 8 && sig[4].changed <= 12 && sig[4].changed >= 8 && sig[4].late === 0 && sig[5].handed <= 14 && atOnce,
            '(the repair of 1.0.1) a standing car that sends like the first one, the Signals tab drawn 100 times in 10 s: page 1 is another picture ' + sig[4].changed + ' times and is handed over ' + sig[4].handed + ' times, page 2 ' + sig[5].handed + ' times (as released: page 1 100 times of 100). What it shows is never more than a second old, and after a change of page it is of that moment');
    });

    /* ================= (1.0.1) learning: from the start, written often, said in words ================= */
    await ok.part('(1.0.1) learning: steering moments from the start, progress written every 20 s, how far it is in words, the steering\'s raw values', async () => {
        const { STEER, YAW } = require(path.join(JS, 'learn')), { LEARN_AGAIN_MS } = require(path.join(JS, 'session'));
        const car = await bootShipped({});
        await past(car);
        // slow, gentle corners FIRST, before the yaw rate has any line (they are too slow and too gentle to teach the yaw rate)
        const slow = car.script().to(5, { v: 32, pedal: 0.2 }).hold(3);
        for (let i = 0; i < 6; i++) slow.to(1.5, { lat: (i % 2 ? -1 : 1) * 0.12 }).hold(5);
        slow.to(1.5, { lat: 0 }).hold(2);
        const saves0 = car.store.saves;
        await car.run(slow);
        const st0 = car.session.eng.learn.status(), s0 = await screens(car, 'learning-steering-first');
        ok(st0.yaw.state === 'none' && st0.yaw.moments === 0 && st0.steer.moments >= 8 && st0.steer.state === 'none',
            'a car that has learned nothing is driven through six slow, gentle corners (32 km/h, 0.12 g): the yaw rate learns nothing from them (too slow, too gentle), and ' + st0.steer.moments + ' steering moments are kept all the same. 1.0.0 threw every one of them away, because the yaw rate had no line yet');
        const P0 = car.session.progress;
        ok(P0.steer.have === st0.steer.moments && P0.steer.left === null && P0.steer.need === STEER.NEED && P0.yaw.need === YAW.NEED && has(s0.drift, 'YAW RATE: 0 OF ' + YAW.NEED + ' CORNERS, ' + YAW.NEED_SIDE + ' MORE EACH WAY') && st0.steer.moments >= STEER.NEED && has(s0.drift, 'STEERING: ' + st0.steer.moments + ' SLOW CORNERS KEPT (YAW RATE FIRST)') &&
            has(s0.drift, 'IT LEARNS IN GENTLE CORNERS AT ' + STEER.V_LO + ' TO ' + STEER.V_HI + ' KM/H') && has(s0.signals, '    YAW RATE: 0 OF ' + YAW.NEED + ' CORNERS, ' + YAW.NEED_SIDE + ' MORE EACH WAY') && has(s0.signals, '    STEERING: ' + st0.steer.moments + ' SLOW CORNERS KEPT (YAW RATE FIRST)') && find(s0.drift.concat(s0.signals), /\d+ OF 14 /).length === 0 &&
            has(s0.signals, 'Only gentle corners between ' + STEER.V_LO + ' and ' + STEER.V_HI + ' km/h, both ways, teach the steering. Yaw rate: ' + YAW.V_LO + ' to ' + YAW.V_HI + ' km/h'),
            // (CHANGED in the repair of 1.0.1: it read "STEERING: 30 OF 14 SLOW CORNERS (YAW RATE FIRST)")
            'under the drawn car and on the Signals tab, in words, with the counts of learn.js: "YAW RATE: 0 OF ' + YAW.NEED + ' CORNERS, ' + YAW.NEED_SIDE + ' MORE EACH WAY", "STEERING: ' + st0.steer.moments + ' SLOW CORNERS KEPT (YAW RATE FIRST)" (' + STEER.NEED + ' are needed: no "' + st0.steer.moments + ' OF ' + STEER.NEED + '"), and at what speeds each learns');
        ok(LEARN_AGAIN_MS === 20000 && car.store.saves - saves0 >= 2 && fileOf(car).learned.steer['driver/cds2'].length >= st0.steer.moments - 26 && fileOf(car).learned.steer['driver/cds2'].length >= 5,
            'while it learns on the move the file is written every 20 s (' + (car.store.saves - saves0) + ' times in these ' + Math.round(slow.T) + ' s; 1.0.0: every 2 minutes), so a stop loses 20 s of it at most: the file holds ' + fileOf(car).learned.steer['driver/cds2'].length + ' of the ' + st0.steer.moments + ' steering moments');
        // then corners that teach the yaw rate, to the left only at first
        const left = car.script().to(4, { v: 70, pedal: 0.3 }).hold(2);
        for (let i = 0; i < 3; i++) left.to(1.5, { lat: 0.3 }).hold(4).to(1.5, { lat: 0 }).hold(2);
        await car.run(left);
        const P1 = car.session.progress, s1 = await screens(car, 'learning-one-way', 0), yawLine = (find(s1.drift, /^YAW RATE: /)[0] || { s: '' }).s;
        ok(P1.yaw.have >= 3 && P1.yaw.right === 0 && P1.yaw.left === P1.yaw.have && new RegExp('^YAW RATE: ' + P1.yaw.have + ' OF 20 CORNERS, ' + (P1.yaw.left >= YAW.NEED_SIDE ? YAW.NEED_SIDE + ' MORE TO THE RIGHT' : (YAW.NEED_SIDE - P1.yaw.left) + ' MORE LEFT, ' + YAW.NEED_SIDE + ' RIGHT') + '$').test(yawLine),
            'left-hand corners only: "' + yawLine + '" (what is missing, and to which side)');
        await car.play('ordinary');
        const P2 = car.session.progress, st2 = car.session.eng.learn.status(), s2 = await screens(car, 'learning-yaw-learned');
        ok(st2.yaw.state === 'learned' && st2.steer.state !== 'none' && P2.steer.left !== null && P2.steer.left + P2.steer.right === P2.steer.have && find(s2.drift, /^YAW RATE: /).length === 0 && (st2.steer.state === 'learned' ? find(s2.drift, /^STEERING: /).length === 0 : find(s2.drift, /^STEERING: \d+ OF 14 SLOW CORNERS/).length === 1),
            'ordinary driving: the yaw rate is learned and its line under the car is gone; the steering moments kept from before now have their sides (' + P2.steer.left + ' left, ' + P2.steer.right + ' right) and their line: the steering is "' + st2.steer.state + '" without one more slow corner');
        // the steering's raw value: now, lowest, highest
        const row = (texts, label) => { const lab = texts.filter((x) => x.s === label)[0]; return lab ? texts.filter((x) => Math.abs(x.y - lab.y) < 2 && x.x0 > 540).map((x) => x.s) : []; };
        const sp = car.session.spans.steerD, r1 = row(s2.signals, 'Steering wheel, chassis');
        ok(sp && sp.lo < 32767 && sp.hi > 32767 && r1.length === 2 && /^\d+$/.test(r1[0]) && r1[1] === sp.lo + ' to ' + sp.hi && row(s2.signals, 'Yaw rate, CDS2')[1] === car.session.spans.yawC.lo + ' to ' + car.session.spans.yawC.hi && has(s2.signals, 'LOWEST TO HIGHEST'),
            'the Signals tab shows each steering row\'s raw value now and its lowest and highest in this life ("' + r1.join('", "') + '"): one photo at a standstill then shows the form of the value. (The yaw rate\'s rows have it too)');
        // a steering wheel angle in a form the app does not read: shown as it came, used for nothing, no guess made
        const odd = await bootShipped({ dataDir: shippedDir(), silent: ['driver'] });
        await past(odd);
        const send = setInterval(() => odd.send.driver({ actualValueSteeringAngleDriver: -123.5 + (clock.mono % 7) }), 20);
        await advance(3000);
        const so = await screens(odd, 'steering-in-another-form', 4), ro = row(so.signals, 'Steering wheel, chassis');
        clearInterval(send);
        const state = (texts, label) => { const lab = texts.filter((x) => x.s === label)[0]; return (texts.filter((x) => Math.abs(x.y - lab.y) < 2 && x.x0 > 200 && x.x0 < 380)[0] || { s: '' }).s; };
        ok(/^-1\d\d(\.\d+)?$/.test(ro[0]) && /^-123\.5 to -11\d\.5$/.test(ro[1]) && state(so.signals, 'Steering wheel, chassis') === 'arrives, not readable' && odd.session.eng.angle.steerS.count === 0 && odd.view().live.noSteer === 'nosource',
            'a steering wheel angle that arrives as a negative number with decimals: the row says "arrives, not readable" and shows it as it came, now and lowest to highest ("' + ro.join('", "') + '"), and the engine takes none of it. No form is guessed in this version');
        // the second field name alone
        const nocrc = await bootShipped({ dataDir: shippedDir(), driverNoCRC: 'only' });
        await past(nocrc);
        await nocrc.play('held', { after: 2500 });
        const sn = await screens(nocrc, 'steering-nocrc-only', 4);
        ok(nocrc.side.driverFrom === 'steerD2' && state(sn.signals, 'Steering wheel, NoCRC') === 'present, in use' && state(sn.signals, 'Steering wheel, chassis') === 'no data yet' && lastDrift(nocrc) && lastDrift(nocrc).flags.length === 0 && lastDrift(nocrc).opp > 20 &&
            nocrc.logged(/^steering wheel: its angle is taken from actualSteeringAngleDriverNoCRC \(the first of the two field names to deliver\)$/).length === 1,
            'a car that sends the steering wheel\'s angle under its second field name only (actualSteeringAngleDriverNoCRC, which the kit\'s own apps subscribe to as well): that row is "present, in use", and the drift has its steering check and no flag');
        const both = await bootShipped({ dataDir: shippedDir(), driverNoCRC: true });
        await past(both);
        await both.play('held', { after: 2500 });
        const eng = both.session.eng.angle.steerS, mD = both.session.meters.steerD.n, mD2 = both.session.meters.steerD2.n;
        ok(both.side.driverFrom === 'steerD' && mD > 100 && mD2 > 100 && eng.count <= mD + 2 && eng.merged === 0 && lastDrift(both).flags.length === 0, 'a car that sends it under both names: both rows count (' + mD + ' and ' + mD2 + '), ONE of them feeds the engine (' + eng.count + ' samples taken, none doubled), and the drift carries no flag');
    });

    /* ================= clocks, the log, and what leaves the app ================= */
    await ok.part('the wall clock set back in the middle of a drift changes nothing; the log is held back while a drift runs', async () => {
        const a = await learnedCar({});
        await a.play('held', { after: 2500 });
        const b = await learnedCar({});
        let from = null, to = null;
        await b.play('held', { mid: [{ at: 4200, fn: async () => { from = clock.mono; b.session.log.info('a line logged while the car turns in'); } }, { at: 6500, fn: async () => { clock.wall -= 3 * 3600 * 1000; b.session.log.info('a line logged in the middle of the drift'); } }, { at: 10000, fn: async () => { to = clock.mono; } }], after: 2500 });
        const ra = lastDrift(a), rb = lastDrift(b), same = (x, y) => JSON.stringify(Object.assign({}, x, { date: 0 })) === JSON.stringify(Object.assign({}, y, { date: 0 }));
        ok(ra && rb && same(ra, rb) && rb.date < ra.date, 'two cars drive the same drift; on one the head unit sets its clock back by three hours in the middle: the two drifts are the same to the last figure, only the date differs');
        const held = b.logs.map((l, i) => [l, b.logAt[i]]).filter((x) => /a line logged/.test(x[0]));
        ok(held.length === 2 && held.every((x) => /\(logged \d+\.\d s later\)$/.test(x[0]) && x[1] >= to - 400) && b.logAt.filter((t) => t > from + 1500 && t < to - 500).length === 0,
            'lines logged while the drift ran were written when it was over, and say how much later: ' + held.map((x) => x[0].replace(/^.*\((logged .*)\)$/, '$1')).join(', '));
    });

    await ok.part('the log of a first drive', async () => {
        const logs = first.logs.join('\n');
        const raw = ['speed (notified)', 'speed (getter)', 'sideways acceleration', 'forward acceleration', 'yaw rate, CDS2', 'yaw rate, chassis', 'steering, front', 'steering, driver', 'steering, xfront', 'steering, xdriver', 'accelerator pedal', 'wheel speeds',
            'handbrake', 'DSC button', 'the car\'s motion estimate', 'the car\'s motion estimate, verified', 'BMW drift analyser, last', 'BMW drift analyser, best', 'GPS sentences'];
        const counts = raw.map((r) => first.logged(new RegExp('^raw ' + r.replace(/[()]/g, '\\$&') + ' #\\d+: ')).length);
        ok(counts.every((n) => n >= 1 && n <= 10) && counts.filter((n) => n === 10).length >= 12, 'the first 10 raw values of each of the ' + raw.length + ' sources are in the log, and no more (' + counts.join(', ') + ')');
        ok(/^raw yaw rate, CDS2 #1: \{"yawVelocityVehicle":3276\d\}$/m.test(logs) && /^raw handbrake #1: \{"statusContactHandBrake":"HANDBREMSE_GELOEST"\} = released$/m.test(logs) && /^raw sideways acceleration #1: 3250\d = -?0\.00\d m\/s2$/m.test(logs) &&
            /^raw BMW drift analyser, last #1: \{.*"statusDriftStarsLast":3.*\} \(shown raw, used for nothing\)$/m.test(logs), 'each as it came, with what the app read out of it');
        ok(first.logged(/^rate [a-zA-Z]+: /).length === 19 && first.logged(/^rate yawC: 50\.0 a second at most \(\d+ samples in all\)$/).length === 1 && first.logged(/^rate speedP: 10\.0 a second at most/).length === 1, 'after 30 s on the move: how often each of the 19 sources sends');
        ok(first.logged(/^Proven Drift: started, a drift starts at 10 degrees from 20 km\/h, chassis "g20", yaw source "auto", steering source "front", demo data "off"$/).length === 1 && first.logged(/^signal [A-Za-z0-9]+: subscribed$/).length === 12 && first.logged(/^Vehicle2 getter: read from now on$/).length === 1,
            'and the start: the settings, the twelve interfaces subscribed, the getter read');
    });

    await ok.part('nothing but reads leaves the app; no position, course or heading in the log or the saved file', async () => {
        const calls = bench.allCalls();
        const kinds = {};
        calls.forEach((c) => { kinds[c.type] = (kinds[c.type] || 0) + 1; });
        ok(bench.allForbidden().length === 0 && Object.keys(kinds).sort().join() === 'getValue,on,watch', 'in all these drives the app made ' + calls.length + ' calls to the car: ' + kinds.watch + ' subscriptions, ' + kinds.getValue + ' getter reads and ' + kinds.on + ' event subscriptions. Nothing else: no write, no method call');
        const got = {};
        calls.filter((c) => c.type === 'getValue').forEach((c) => { got[c.iface + '.' + c.field] = true; });
        ok(Object.keys(got).sort().join() === 'CDS2.statusLateralAccelerationMassCenter,CDS2.statusLongitudinalAccelerationMassCenter,CDS2.statusYawVelocityVehicle,Vehicle2.statusCarSpeed2', 'the getters it read: the speed, and (only where the car does not send them) the yaw rate and the two accelerations. No other');
        const watched = {};
        calls.filter((c) => c.type === 'watch').forEach((c) => { watched[c.iface] = c.fields.slice().sort().join(); });
        // (CHANGED for 1.0.1: the kit's call for an event is now also used for the one field of an extra that shares its interface
        // with core fields, the front wheels' own angle on SteeringAngle, when that extra is switched on after the start)
        const onCalls = calls.filter((c) => c.type === 'on');
        ok(Object.keys(watched).length === 12 && watched.MDrive === 'statusDriftBest,statusDriftLast' && watched.FES === 'statusDSCSwitchHMI' && watched.CDS === 'statusHandBrake' &&
            onCalls.every((c) => (c.iface === 'SatellitePositioning' && c.event === 'updatePosition' && !c.field) || (c.iface === 'SteeringAngle' && c.event === 'SteeringAngleFrontAxleEffective' && c.field)) && onCalls.some((c) => c.field) && onCalls.some((c) => !c.field),
            'of BMW\'s drift analyser it subscribes to the two results only, of DSC to the button\'s state, of the handbrake to its state; the one event is the GPS receiver\'s sentences, and the one field added to a proxy that is there is the front wheels\' own angle');
        // the manifest (app.json, and what the build made of it for the installer): read and subscribe only, and what
        // the app's car side knows is what the manifest asks for
        const sig = APPJSON.signals, modes = [], built = MANIFEST.proxies;
        Object.keys(sig).forEach((i) => Object.keys(sig[i]).forEach((f) => { if (f[0] !== '_') modes.push(sig[i][f]); }));
        const { INTERFACES } = require(path.join(JS, 'car'));
        const mine = Object.keys(INTERFACES).map((k) => INTERFACES[k]);
        // (CHANGED for 1.0.1: 18 fields, the steering wheel's angle under its second field name is new; and "rs" for four of them only)
        const readOnce = [];
        Object.keys(sig).forEach((i) => Object.keys(sig[i]).forEach((f) => { if (f[0] !== '_' && sig[i][f].indexOf('r') >= 0) readOnce.push(f); }));
        ok(modes.length === 18 && modes.every((m) => /^(r|s|rs)$/.test(m)) && Object.keys(sig).every((i) => !sig[i]._methods) && JSON.stringify(APPJSON).indexOf('controlDisplayDrift') < 0,
            'the manifest asks for ' + modes.length + ' fields, each to read or to subscribe ("r", "s"), none to write, no method; controlDisplayDrift is not in it');
        ok(readOnce.sort().join() === 'statusCarSpeed2,statusLateralAccelerationMassCenter,statusLongitudinalAccelerationMassCenter,statusYawVelocityVehicle' && modes.filter((m) => m === 's').length === 14,
            '(1.0.1) the kit may read the getter of four fields only ("rs": the speed, the two accelerations, CDS2\'s yaw rate, as the kit\'s own apps ask for them); the other 14 are "s" alone, so no getter of theirs is ever read');
        ok(Object.keys(sig).every((i) => built[i] && !built[i].methods && String(built[i].instances) === '1' && Object.keys(built[i].attributes || {}).every((f) => sig[i][f] === built[i].attributes[f]) &&
            Object.keys(built[i].attributes || {}).length === Object.keys(sig[i]).filter((f) => f[0] !== '_').length) && JSON.stringify(built['de.bmw.infotainment.SatellitePositioning'].broadcasts) === '["updatePosition"]' && JSON.stringify(Object.keys(sig).map((i) => built[i])).indexOf('"w"') < 0,
            'the build hands the installer exactly that for the app\'s twelve interfaces: the same fields with the same "r" and "s", instance 1, no method, the one event');
        ok(mine.length === 12 && mine.every((m) => sig[m.iface] && (sig[m.iface]._optional || null) === (m.optional || null)) && Object.keys(sig).filter((i) => !sig[i]._optional).sort().join() === 'de.bmw.infotainment.vehicle.CDS2,de.bmw.infotainment.vehicle.Vehicle2',
            'its twelve interfaces are the ones the app subscribes to; Vehicle2 and CDS2 are needed, the other ten are optional, each with what the app loses without it');
        // (CHANGED for 1.0.1: the app has been on a car, so "not yet tested on a car" became "still being tested on cars". BETA stays)
        const WANT = 'BETA, still being tested on cars. Scores drifts by angle, speed and length and keeps the data of each drift, from the car\'s own motion sensors. For closed circuits and skid pans only';
        ok(APPJSON.description === WANT && PKG.description === WANT && APPJSON.loggingId === 'PPF1' && PKG.oapAppSettings.loggingId === 'PPF1' && spec.id === 'pps_drift' && spec.title === 'Proven Drift' && PKG.version === APPJSON.version && spec.version === APPJSON.version,
            'the Store description is the brief\'s, word for word: BETA, and for closed circuits and skid pans only (app.json and the built package, version ' + APPJSON.version + ')');
        // the app's own files
        const own = fs.readdirSync(JS).filter((f) => /\.js$/.test(f) && f !== 'logo-data.js');
        const src = {};
        own.forEach((f) => { src[f] = fs.readFileSync(path.join(JS, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''); });
        const badFiles = own.filter((f) => /signals\.(set|call|proxy)\b|\.setValue\s*\(|\.callMethod\s*\(|kit\/(diag|readonly-diag|dids|ecus|sgbd)|tasu|\buds\b|controlDisplayDrift/i.test(src[f]));
        ok(own.length === 18 && badFiles.length === 0, 'the app\'s ' + own.length + ' own files hold no signals.set, signals.call, signals.proxy, setValue, callMethod, load nothing of the kit\'s diagnostics, and do not name controlDisplayDrift' + (badFiles.length ? ': ' + badFiles.join(', ') : ''));
        const net = own.filter((f) => /require\(\s*'(http|https|net|dgram|tls|dns|child_process)'\s*\)|XMLHttpRequest|fetch\s*\(/.test(src[f]));
        ok(net.length === 0, 'none loads the network or starts another program: nothing leaves the car' + (net.length ? ': ' + net.join(', ') : ''));
        const wall = own.map((f) => [f, (src[f].match(/Date\.now\(\)|new Date\(/g) || []).length]).filter((x) => x[1]);
        // (CHANGED for 1.0.1: box.js, the record of starts and stops, notes when a start was: it falls back to Date.now where it is handed no clock, and turns that time into text)
        ok(JSON.stringify(wall) === JSON.stringify([['app.js', 1], ['box.js', 2], ['screens.js', 1], ['session.js', 1]]), 'the wall clock is read in five places only: app.js hands Date.now to the session and to the record of starts and stops as "wall", session.js and box.js fall back to it, screens.js turns a saved date into text and box.js the time of a start');
        const words2 = own.map((f) => fs.readFileSync(path.join(JS, f), 'utf8')).join('\n');
        ok(words2.indexOf(String.fromCharCode(8212)) < 0 && !/\bPty\b/.test(words2), 'no em dash and no "Pty" in any of them');
        // (CHANGED for 1.0.1: the app now has sources of its own that are "switched off" in its settings, and says so. So the search
        // no longer takes every "switched off" for an instruction: it looks for an instruction to switch something off (the plain
        // form of the verb), and for DSC, traction control, ESP or stability control standing beside "off", "disable" or "deactivate")
        const SAFETY = '(DSC|DTC|traction control|ESP|stability control|a safety system|safety systems|the driving aids)';
        const OFF_RE = new RegExp('\\b(switch|turn) (it |them |this |that |these |those |the [a-z ]{1,24}|[A-Z]{2,5} )?off\\b|\\b(switch|turn)(es|ed|ing)? (the |your )?' + SAFETY + ' off|\\b(switch|turn)(es|ed|ing)? off (the |your )?' + SAFETY +
            '|\\b(disable|deactivate)[sd]? (the |your )?' + SAFETY + '|' + SAFETY + '[^.\\n]{0,24}\\b(off|disabled|deactivated)\\b', 'i');
        const told = (text) => OFF_RE.test(text.replace(/tell[s]? the driver to switch anything off|no text of it tells the driver to switch anything off|no text tells the driver to switch a safety system off/g, ''));
        const all0 = [];
        Object.keys(drawn).forEach((st) => Object.keys(drawn[st]).forEach((pg) => words(drawn[st][pg]).forEach((w) => all0.push(w))));
        const off = own.filter((f) => told(fs.readFileSync(path.join(JS, f), 'utf8')));
        ok(off.length === 0, 'no text of the app tells the driver to switch anything off, and none puts DSC, traction control or ESP beside "off" or "disable"' + (off.length ? ': ' + off.join(', ') : ''));
        const caught = ['Switch off DSC before you drift', 'turn the traction control off', 'For best results switch it off', 'DSC must be off', 'disable ESP', 'Turn off the driving aids', 'DSC button: OFF', 'switching DSC off'].filter(told);
        ok(caught.length === 8 && !told('its rows say "switched off"') && !told('GPS receiver: OFF') && !told('the wheel speeds are switched off'), '(the same search finds each of eight ways of saying it, and does not take "switched off" said of one of the app\'s own sources for one)');
        const offDrawn = all0.filter(told);
        ok(offDrawn.length === 0, 'nor does any text drawn on any screen in these drives' + (offDrawn.length ? ': ' + offDrawn.slice(0, 3).join(' | ') : ''));
        // every word any screen drew
        const all = all0;
        const road = all.filter((w) => /public road|street|highway|motorway|roundabout|traffic/i.test(w));
        ok(all.length > 5000 && road.length === 0 && all.some((w) => /closed circuits and skid pans only/.test(w)), 'of the ' + all.length + ' texts drawn in ' + Object.keys(drawn).length + ' states none invites use on a road; "closed circuits and skid pans only" is among them');
        // positions: the stand-in car drove east from 67.9123 N, 144.9631 E, and its sentences say course 283.74
        let lonMax = bench.LON0, n = 0;
        bench.cars.forEach((c) => { lonMax = Math.max(lonMax, c.positions.lonMax); n += c.positions.n; });
        const near = (x) => (Math.abs(x - bench.LAT0) < 0.3 || (x > bench.LON0 - 0.3 && x < lonMax + 0.3));
        const leaks = [];
        const scan = (where, text) => {
            (text.match(/-?\d+\.\d{3,}/g) || []).forEach((tok) => {
                const x = Math.abs(Number(tok));
                // degrees, or the receiver's degrees-and-minutes form (6754.7380, 14457.7860)
                const deg = x > 1000 ? Math.floor(x / 100) + (x % 100) / 60 : x;
                if (near(deg)) leaks.push(where + ': ' + tok);
            });
            if (text.indexOf(bench.COURSE) >= 0) leaks.push(where + ': the course ' + bench.COURSE);
            if (/\$GP[A-Z]{3},|nmeaString|latitude"?\s*:\s*-?\d|longitude"?\s*:\s*-?\d|heading"?\s*:|course"?\s*:/i.test(text)) leaks.push(where + ': a sentence, a coordinate, a heading or a course member');
        };
        let lines = 0, files = 0;
        bench.cars.forEach((c, i) => {
            c.logs.forEach((l) => { lines++; scan('log of start ' + (i + 1), l); });
            try { fs.readdirSync(c.dataDir).forEach((f) => { if (f === 'settings.json') return; files++; scan(f, fs.readFileSync(path.join(c.dataDir, f), 'utf8')); }); } catch (e) { /* no folder */ }
        });
        ok(n > 2000 && lonMax > bench.LON0 + 0.1, '(the stand-in cars sent ' + n + ' positions, from longitude ' + bench.LON0 + ' to ' + lonMax.toFixed(2) + ', each with the course ' + bench.COURSE + ')');
        ok(leaks.length === 0, lines + ' log lines and ' + files + ' saved files: not one number that is a latitude or longitude the car sent, in degrees or in the receiver\'s form, no course, no heading, no sentence' + (leaks.length ? ': ' + leaks.slice(0, 4).join(' | ') : ''));
        const probe = [];
        const scanProbe = (text) => { const before = leaks.length; scan('probe', text); if (leaks.length > before) probe.push(text); leaks.length = before; };
        ['lat 67.91230001', '$GPRMC,090000.00,A,6754.7380,N,14457.7860,E', 'cog ' + bench.COURSE, '{"longitude":145.98765}', '{"heading": 12}'].forEach(scanProbe);
        ok(probe.length === 5, '(the same search finds a position, a course or a heading written in each of five forms)');
        const keys = {};
        bench.cars.forEach((c) => { const f = fileOf(c); if (f) JSON.stringify(f, (k, v) => { if (k && isNaN(Number(k))) keys[k] = true; return v; }); });
        ok(Object.keys(keys).length >= 30 && !Object.keys(keys).some((k) => /^(lat|lon|latitude|longitude|position|pos|course|heading|bearing|cog)$/i.test(k)), 'the ' + Object.keys(keys).length + ' member names that occur in the saved files: none is a position, a course or a heading (' + Object.keys(keys).slice(0, 12).join(', ') + ', ...)');
    });

    ok(bench.mishaps().length === 0, 'in all these drives the app logged no error, no frame threw' + (bench.mishaps().length ? ': ' + bench.mishaps().slice(0, 3).join(' | ') : ''));
    ok(frames >= 400, frames + ' frames were drawn and checked in ' + Object.keys(drawn).length + ' states' + (OUT ? ', pictures of the PC-size ones are in ' + OUT : ''));
    ok.done();
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
