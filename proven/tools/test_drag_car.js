'use strict';
/**
 * test_drag_car.js <built app: dist/pps_drag> [folder for pictures] - the whole Proven Drag app on a stand-in
 * car (fakedrag.js): app.js with car.js, session.js, the timing logic, store.js and the four screens, on the
 * kit's PC stand-in for the head unit and on clocks the test moves by hand. What test_drag.js (the logic on
 * its own) cannot reach: what the app subscribes to and reads, which series a run is taken from, the saved
 * file, the log, the flags, the words on the screens.
 *
 * The runs are dragsim.js's truth model, so every time has a known answer. With a folder as second argument
 * a picture of each screen state drawn is saved there (the kit's software renderer, PC size). With "sizes" as
 * third argument each state is also saved as it is drawn for iDrive 7 and iDrive 8 (<state>-<tab>-id7.png,
 * -id8.png: 1.165 and 1.419 times the pixels, each glyph from the atlas that screen takes; the page alone).
 *
 * The parts whose names begin with "review" hold one check or more for every finding of the first review
 * that concerned the app around the logic: each failed on the app as it was reviewed, and its sentence says
 * what was wrong ("WAS: ...").
 *
 * The parts whose names begin with "1.0.2" were written after the app had been on its first car, where it closed
 * by itself (proven/CHANGES-drag.md, part 11). They start the app AS SHIPPED (every extra switched off, no getter
 * read of its own) on a stand-in car like that one, and check what that release is for: nothing asked of the car
 * beyond two subscriptions, runs timed from the notified speed alone, each extra subscribed when it is switched on,
 * the record of starts and stops (box.js) and its lines on the Signals tab, hostile files where that record is kept
 * in RAM, and pages that do not change for their own sake. Every part written before that starts the app with all of
 * the new settings switched ON, because what it tests is behind them now.
 * Two more files belong to this one since 1.0.2: test_drag_native.js (what the app and the kit ask of the native
 * binding, counted under the kit's real signals.js) and test_drag_life.js (real processes ended four ways on the
 * kit's real runtime).
 *
 * What this cannot show: how a real car sends its signals. Every rate, delay and member name of the stand-in
 * car is an assumption (fakedrag.js), and the iDrive 7 / iDrive 8 text sizes are the kit's figures, not
 * measured on a car by Proven. What is known of the first car is what its owner's photos showed.
 *
 * PPS_TEST_ALL=1 in the environment: a failed check does not stop the run; they are listed at the end.
 */
const fs = require('fs'), os = require('os'), path = require('path');
const sim = require('./dragsim');
const { checker } = require('./fakecar');
const fit = require('./textfit');
// (folders this test makes itself, cleared away at the end)
const made = [];
process.on('exit', () => made.forEach((d) => { try { fs.chmodSync(d, 0o755); fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* gone */ } }));

if (!process.argv[2]) { console.error('usage: node proven/tools/test_drag_car.js dist/pps_drag [folder for pictures [sizes]]'); process.exit(2); }
const APP = path.resolve(process.argv[2]), OUT = process.argv[3] ? path.resolve(process.argv[3]) : null, SIZED = process.argv[4] === 'sizes';
const ok = checker();
const bench = require('./fakedrag')(APP);
const { advance, clock } = bench;
const JS = bench.JS;
/**
 * Since 1.0.2 the app as shipped subscribes to the speed and the acceleration and nothing else, and reads no getter
 * itself: everything else is behind a setting that is off. The parts written for 1.0.0 and 1.0.1 test what is now
 * behind those settings (the getter's series, the GPS speed scale, the wheels, the positions, the study signals),
 * so they start the app with every one of them switched ON: boot(). The parts at the end whose names begin with
 * "1.0.2" start it AS SHIPPED: shipped().
 */
const boot = async (o) => { const car = await bench.boot(Object.assign({}, o, { sets: Object.assign({}, bench.ALL_ON, o && o.sets) })); car.allOn = true; return car; };
const shipped = (o) => bench.boot(o || {});
/**
 * A car like the first one the app ran on (25 Nov 2026, from photos of its screens): the speed notified 47 to 50 times a
 * second while it changes and not at all while it is constant, the acceleration 10 times a second, the GPS receiver's
 * event once a second with about 38 sentences, wheel values in a form nobody expected (65407 standing still). Here: a
 * send slot every 21 ms, each notification 12 to 18 ms on its way. Everything else about that car is not known.
 */
const OWNER = { notifyMs: 21, notifyDelay: 12, notifyJitter: 6, accelMs: 100, nmeaMore: 35, wheelForm: 'swapped' };

/* ---------- runs with known answers ---------- */
const truth = (o) => new sim.Truth(Object.assign({ a0: 7, vTop: 75, ramp: 0.15, shifts: [{ v: 62 / 3.6, dur: 0.15, cut: 0.9 }] }, o));
const FULL = truth();               // 0-100 km/h in about 5.1 s, the 1/4 mile in about 12.7 s
const LIFT_MS = 6200;               // a short run: the driver lifts here (0-100, 60 ft and 330 ft are done by then)
const s3 = (x) => x.toFixed(3) + ' s';

/**
 * Stand (the timer arms), launch the truth model, wait until the run is over.
 * o: stand ms (2500), phase ms (where the launch falls between the car's send slots), lift (true: a short run),
 *    before(at): just before the launch, mid: { at ms into the run, fn }, wait: ms after the car's lift or the model's end (2500)
 * -> { rec: the run record the app made, at, ans: the true times, stopAt: when the car stands again }
 */
async function launch(car, model, o) {
    o = o || {};
    await advance(o.stand === undefined ? 2500 : o.stand);
    const at = clock.mono + 400 + (o.phase || 0), lift = o.lift ? LIFT_MS : null;
    const stopAt = car.launch(model, at, lift);
    if (o.before) o.before(at);
    const until = at + (lift || model.tEnd * 1000) + (o.wait === undefined ? 2500 : o.wait);
    if (o.mid) { await advance(at + o.mid.at - clock.mono); await o.mid.fn(); }
    await advance(until - clock.mono);
    const all = model.answers(car.settings.get('start'), car.settings.get('speedUnit')), ans = {};
    // (a split the car reached before the driver lifted)
    Object.keys(all).forEach((k) => { if (!lift || all[k].s < (lift - 600) / 1000) ans[k] = all[k]; });
    return { rec: car.session.shown, at, ans, stopAt };
}
/** The largest difference between the app's times and the true ones (99: a split is missing). */
const worst = (rec, ans) => Math.max.apply(null, Object.keys(ans).map((k) => (rec && rec.results[k] ? Math.abs(rec.results[k].s - ans[k].s) : 99)));
/** Wait until the car stands, and a moment longer. */
async function stop(car, extra) { while (car.vTrue(clock.mono) > 0) await advance(500); await advance(extra === undefined ? 1500 : extra); }
/** Brake to a standstill from a cruise (stop() waits for a car whose plan already ends at 0), and a moment longer. */
async function halt(car, extra) { car.goto(0, 4); await stop(car, extra); }
/** Drive at a steady true speed for secs. */
async function cruise(car, kmh, secs) { car.goto(kmh, 4); await advance(secs * 1000); }
const reads = (car, field, from, to) => car.calls.filter((c) => c.type === 'getValue' && c.field === field && c.t >= from && c.t < (to === undefined ? Infinity : to)).length;
const SPEED = 'statusCarSpeed2', ACCEL = 'statusLongitudinalAccelerationMassCenter';

/* ---------- what holds for every frame (as test_screens.js) ---------- */
const W = 1600, SCALES = [1, 1.16, 1.42], PAGES = ['run', 'timeslip', 'best', 'signals', 'signals2'], MODES = ['pc', 'id7', 'id8'];
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
/** The start-up logo shows for the first 1.4 s after the app is first drawn: draw once and let it pass. */
async function past(car) { if (car.past) return; car.past = true; await car.draw(); await advance(1900); }
let frames = 0;
const drawn = {};                   // state name -> { page: texts } (PC size), for the checks on the words
/**
 * The four tabs of a car as it is now (the Signals tab's two pages: five pages), at the PC's size and as on iDrive 7
 * and iDrive 8 where the kit runs the screen: drawn, checked, and saved as pictures. Returns { run, timeslip, best,
 * signals, signals2 }: the texts at PC size.
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
            faults(texts, 514).forEach((f) => bad.push(mode + ' ' + PAGES[p] + ': ' + f));
            // (and no text crosses the edge of the panel, button or banner it stands in: textfit.js)
            fit.crossings(texts, car.boxes).forEach((f) => bad.push(mode + ' ' + PAGES[p] + ': ' + f));
            if (mode === 'pc') { all[PAGES[p]] = texts; if (OUT) await car.save(OUT, name + '-' + PAGES[p]); }
            else if (OUT && SIZED) car.saveSized(OUT, name + '-' + PAGES[p] + '-' + mode);
        }
    }
    car.mode = 'pc';
    await car.page(0);
    const errors = car.logged(/^ERROR |^WARN first render|\(\d+x\): /);
    ok(bad.length === 0 && errors.length === 0, name + ': ' + (only === undefined ? 'the four tabs (five pages) draw' : 'the ' + PAGES[only] + ' page draws') + ' at PC, iDrive 7 and iDrive 8 size: every letter has its glyph, no text on another, none off the page or over the edge of its box' +
        (bad.concat(errors).length ? ':\n        ' + bad.concat(errors).slice(0, 14).join('\n        ') : ''));
    drawn[name] = all;
    return all;
}
const has = (texts, s) => texts.some((t) => t.s === s);
/** An NMEA sentence with its checksum. */
const nmea = (body) => { let x = 0; for (let i = 0; i < body.length; i++) x ^= body.charCodeAt(i); return '$' + body + '*' + x.toString(16).toUpperCase().padStart(2, '0'); };
const find = (texts, re) => texts.filter((t) => re.test(t.s));
const words = (texts) => texts.map((t) => t.s);

(async () => {
    /* ================= the two ways the speed arrives ================= */
    await ok.part('a car that notifies its speed (every 100 ms) and answers the getter', async () => {
        const car = await boot({});
        // the start-up logo first, then the page
        let texts = await car.draw();
        ok(find(texts, /SPEED|READY|STOP TO ARM/).length === 0, 'the first frame after the app is opened is the start-up logo alone');
        car.past = true;
        await advance(2000);
        const armed = await screens(car, 'ready');
        ok(car.view().state === 'ready' && has(armed.run, 'READY'), 'the car stands: after a second the timer is armed, READY');
        ok(has(armed.run, 'Closed roads and track days only'), 'with it the line "Closed roads and track days only"');
        ok(has(armed.run, 'UNCALIBRATED') && has(armed.run, 'SLIP') && find(armed.run, /^SPEED \d+\/s|^SPEED --\/s/).length === 1, 'the strip says the start convention, UNCALIBRATED (no GPS factor yet) and the data rate');
        const standFrom = clock.mono;
        await advance(2000);
        const perSec = reads(car, SPEED, standFrom) / 2;
        ok(perSec >= 19 && perSec <= 21 && car.mostInFlight === 1, 'standing and armed, the speed getter is read ' + perSec + ' times a second, never two reads at once');
        // the run, with a look at the screen 3 s into it
        let mid = null, r;
        r = await launch(car, FULL, { stand: 0, mid: { at: 3000, fn: async () => { mid = await screens(car, 'timing'); mid.view = car.view(); } } });
        ok(mid.view.state === 'run' && has(mid.run, 'TIMING') && Math.abs(mid.view.clock - 3) < 0.2 && find(mid.run, /^\d\.\d\d$/).length >= 2,
            '3 s into the run: TIMING, the clock at ' + mid.view.clock.toFixed(2) + ' s, the 60 ft time already on the screen');
        const rec = r.rec;
        ok(rec && Object.keys(rec.results).join() === '0-100,60ft,330ft,eighth,1000ft,quarter', 'the run to the 1/4 mile gives all six splits');
        ok(worst(rec, r.ans) <= 0.015, 'every one within ' + s3(worst(rec, r.ans)) + ' of the true time (0-100 km/h ' + rec.results['0-100'].s.toFixed(3) + ' against ' + r.ans['0-100'].s.toFixed(3) +
            ', 1/4 mile ' + rec.results.quarter.s.toFixed(3) + ' against ' + r.ans.quarter.s.toFixed(3) + ')');
        ok(Math.abs(rec.results.quarter.trap - r.ans.quarter.trap) < 0.3 && Math.abs(rec.results.eighth.trap - r.ans.eighth.trap) < 0.3, 'trap speeds within 0.3 km/h (1/4 mile ' + rec.results.quarter.trap + ' against ' + r.ans.quarter.trap.toFixed(1) + ')');
        ok(rec.series === 'polled' && rec.sum.medianGap === 50 && rec.other && rec.other.series === 'notified' && Math.abs(rec.other.times['0-100'] - rec.results['0-100'].s) < 0.02,
            'taken from the getter\'s series (50 ms between samples against the notifier\'s 100); the notified engine timed the same run to ' + rec.other.times['0-100'].toFixed(3));
        ok(car.logged(/^run, notified \(slip\): 0-100 /).length === 1 && car.logged(/^run, polled \(slip\): 0-100 /).length === 1 && car.logged(/^run taken from the polled series: /).length === 1,
            'the log has one line per engine with every result, and which was taken: ' + car.logged(/^run taken from/)[0]);
        ok(car.logged(/^run, polled/)[0].indexOf('launch gap 50 ms') > 0 && /median 50 ms, longest 50 ms/.test(car.logged(/^run, polled/)[0]), 'with the launch gap and the spacings');
        ok(car.mostInFlight === 1, 'through the run: never two reads of the getter at once');
        const during = reads(car, SPEED, r.at, r.at + 10000) / 10;
        ok(during >= 19 && during <= 21, 'and ' + during + ' reads a second while timing');
        const done = await screens(car, 'finished');
        ok(has(done.run, 'RUN FINISHED') && has(done.run, 'Stop to arm the next run') && find(done.run, /^NEW BEST$/).length === 4, 'after the 1/4 mile: RUN FINISHED, the four results with NEW BEST');
        ok(find(done.run, /^± 0\.0\d s$/).length === 4 && find(done.run, /^@ \d+\.\d km\/h$/).length === 2, 'each with its ±, the 1/8 and 1/4 mile with their trap speed');
        ok(has(done.run, 'RUN DATA RATE') && !has(done.run, 'DATA RATE') && has(done.run, 'SPEED 20/s, GETTER') && !has(armed.run, 'RUN DATA RATE') && has(armed.run, 'DATA RATE'),
            'while the finished run is on the screen the rate cell is the run\'s own and says so: "RUN DATA RATE", "SPEED 20/s, GETTER" (before the run: "DATA RATE")');
        ok(has(done.timeslip, '330 FT') && has(done.timeslip, '1000 FT') && has(done.timeslip, '1/4 MILE TRAP') && find(done.timeslip, /^at the line \d+\.\d$/).length === 2 && has(done.timeslip, 'UNCALIBRATED: speed as the car reports it'),
            'the Timeslip has 330 ft and 1000 ft as well, both traps with the speed at the line, and says the scale');
        ok(find(done.timeslip, /^± is the sampling uncertainty only\. It does not cover speed scale, slope or wheelspin\.$/).length === 1, 'and says what the ± covers and what it does not');
        // driving on after the run: the getter is left to 500 ms
        const from = clock.mono;
        car.plan = () => 80;
        await advance(6000);
        const slow = reads(car, SPEED, from + 1000) / 5;
        ok(slow >= 1.8 && slow <= 2.2 && car.view().state === 'wait', 'driving on at 80 km/h, not armed: the getter is read ' + slow + ' times a second');
        const sig = await screens(car, 'driving', 3);
        car.page(3);
        const t3 = clock.mono;
        await advance(3000);
        ok(reads(car, SPEED, t3 + 500) / 2.5 >= 19, 'with the Signals page showing it is read 20 times a second again');
        ok(find(sig.signals, /^present$/).length === 11 && find(sig.signals, /^10\.0\/s$/).length === 1 && find(sig.signals, /^20\.0\/s$/).length === 2 && find(sig.signals, /^(100|50|200|333|1000) ms$/).length >= 8,
            'the Signals page: all eleven sources present, with their rates and longest gaps (the notified speed 10.0/s, acceleration and wheels 20.0/s)');
        car.page(0);
        // the results stay until the next launch
        car.plan = () => 0;
        await advance(2500);
        ok(car.view().state === 'ready' && car.view().rec === rec && has(await car.draw(), 'READY'), 'stopped again: READY, and the last run\'s results are still on the screen');
        r = await launch(car, FULL, { stand: 0, lift: true, mid: { at: 1000, fn: async () => { mid = car.view(); } } });
        ok(mid.rec === null && Object.keys(mid.results).length === 0 && mid.state === 'run', 'the next launch clears them');
        ok(r.rec && r.rec !== rec && Object.keys(r.rec.results).join() === '0-100,60ft,330ft' && worst(r.rec, r.ans) <= 0.015 && r.rec.sum.ended === 'lift',
            'a run the driver lifts out of after 6.2 s keeps the splits done by then (0-100, 60 ft, 330 ft), right to ' + s3(worst(r.rec, r.ans)));
        ok(car.store.data.runs.length === 2 && car.store.data.best.slip.quarter.s === rec.results.quarter.s, 'both runs are in the saved list, the bests are the first run\'s');
        // parked with the screen hidden
        await stop(car);
        car.screen = false;
        const tHid = clock.mono;
        await advance(321000);
        const hiddenReads = reads(car, SPEED, tHid + 200);
        ok(hiddenReads === 0 && car.logged(/^the app's own getter reads: none from now on \(the screen is hidden\)/).length === 1,
            'CHANGED IN 1.0.2. Parked for more than 5 minutes with the screen hidden: the app reads no getter at all while its screen is hidden (' + hiddenReads + ' reads in 321 s), and the log says so. WAS: 20 a second for the first 5 minutes, then one every 2 s');
        car.screen = true;
        await advance(1000);
        ok(reads(car, SPEED, clock.mono - 500) >= 9, 'the screen is opened: 20 a second again at once');
    });

    await ok.part('a car that only notifies: every read of the getter fails', async () => {
        const car = await boot({ getter: false });
        const r = await launch(car, FULL, { lift: true });
        ok(r.rec && r.rec.series === 'notified' && r.rec.other === null && worst(r.rec, r.ans) <= 0.03, 'the run is timed from the notified samples alone, right to ' + s3(worst(r.rec, r.ans)) + ' (100 ms between samples)');
        ok(r.rec.results['0-100'].pm >= 0.04, 'and its ± is larger: ' + r.rec.results['0-100'].pm.toFixed(2) + ' s');
        ok(car.logged(/^speed getter: a read failed/).length === 5 && /not logged again/.test(car.logged(/^speed getter: a read failed/)[4]), 'the failing getter is in the log five times, then no more');
        const t0 = clock.mono;
        await advance(20000);
        ok(reads(car, SPEED, t0) <= 11, 'and after ten failures in a row it is only tried every 2 s (' + reads(car, SPEED, t0) + ' reads in 20 s)');
        const s = await screens(car, 'notifier-only', 3);
        ok(s.signals.filter((t) => t.s === 'no data yet').length === 1, 'the Signals page shows the getter\'s row as "no data yet"');
    });

    await ok.part('a car whose notifier is silent: it only answers the getter', async () => {
        const car = await boot({ notifier: false });
        const r = await launch(car, FULL, { lift: true });
        ok(r.rec && r.rec.series === 'polled' && worst(r.rec, r.ans) <= 0.015, 'the run is timed from the getter alone, right to ' + s3(worst(r.rec, r.ans)));
        ok(car.logged(/^run, notified/).length === 0 && car.logged(/^run, polled/).length === 1 && /the only series with a run/.test(car.logged(/^run taken from/)[0]), 'the log says so: ' + car.logged(/^run taken from/)[0]);
        ok(car.logged(/^raw speed \(notified\) #1: /).length === 1 && car.logged(/^raw speed \(notified\) #2: /).length === 0, 'the one "notified" speed in the log is the read the kit does itself when the car\'s service comes up');
        // driving on: that one sample must not keep the timer armed
        await stop(car, 500);
        await car.press('BTN_ACTION');                  // "Reset run": the last run leaves the screen
        car.plan = () => 60;
        await advance(4000);
        const t0 = clock.mono;
        await advance(5000);
        const s = await screens(car, 'driving-not-armed');
        ok(car.view().state === 'wait' && has(s.run, 'STOP TO ARM') && has(s.run, 'Stand still for one second') && !has(s.run, 'READY'), 'driving at 60 km/h on this car the screen says STOP TO ARM (the notified engine, armed on its one sample from the start, said READY for as long as the car drove)');
        ok(reads(car, SPEED, t0, t0 + 5000) / 5 <= 2.2, 'and the getter is read ' + reads(car, SPEED, t0, t0 + 5000) / 5 + ' times a second, not 20');
        car.plan = () => 0;
        await advance(2500);
        const r2 = await launch(car, FULL, { stand: 0, lift: true });
        ok(r2.rec && r2.rec.series === 'polled' && worst(r2.rec, r2.ans) <= 0.015, 'stopped and launched again: armed and timed from the getter, right to ' + s3(worst(r2.rec, r2.ans)));
    });

    await ok.part('a getter that answers slowly, or not at all', async () => {
        let car = await boot({ getterMs: 700 });
        let r = await launch(car, FULL, { lift: true });
        ok(r.rec && r.rec.series === 'notified' && worst(r.rec, r.ans) <= 0.03 && car.logged(/^run, polled/).length === 0, 'a getter that takes 700 ms: its samples are thrown away, the run comes from the notifier (right to ' + s3(worst(r.rec, r.ans)) + ')');
        ok(car.logged(/^speed getter: a read took 700 ms and was thrown away/).length >= 1 && car.mostInFlight === 1, 'logged, and still never two reads at once');
        car = await boot({ getterMs: Infinity });
        r = await launch(car, FULL, { lift: true });
        ok(r.rec && r.rec.series === 'notified' && worst(r.rec, r.ans) <= 0.03, 'a getter that never answers: the run comes from the notifier');
        await advance(15000);
        ok(car.logged(/^speed getter: a read was not answered in 10 s and was given up/).length >= 1, 'and the read is given up after 10 s, so the next one can be tried');
    });

    await ok.part('subscriptions that fail at first are tried again', async () => {
        const car = await boot({ watchFail: { Vehicle2: 2, Powertrain: 1 } });
        const s = await screens(car, 'no-speed-yet');
        ok(has(s.run, 'NO SPEED FROM THE CAR') && has(s.run, 'Waiting for the car\'s speed signal') && has(s.signals, 'not answering'), 'the car\'s speed service is not up when the app starts: "NO SPEED FROM THE CAR", and the Signals page says "not answering"');
        await advance(6000);
        ok(car.logged(/^WARN signal Vehicle2 error: .*NEEDED.*trying again in 5 s/).length === 1 && car.logged(/^WARN signal Vehicle2 error: .*trying again in 15 s/).length === 1 && car.logged(/^signal Powertrain: subscribed \(try 2\)/).length === 1,
            'tried again after 5 s: the wheels are there now, the speed still not');
        await advance(16000);
        ok(car.logged(/^signal Vehicle2: subscribed \(try 3\)/).length === 1, 'and again 15 s later: subscribed');
        const r = await launch(car, FULL, { lift: true });
        ok(r.rec && worst(r.rec, r.ans) <= 0.015, 'and a run is timed (right to ' + s3(worst(r.rec, r.ans)) + ')');
        // (1.0.2, found by the last read of Proven Drift 1.0.1 and the same here) an extra whose first subscription failed and
        // waits to be tried again, switched OFF before that: nothing is asked of the car for it. Switched on again: asked afresh.
        const gone = await shipped({ sets: { xWheels: true }, watchFail: { Powertrain: 1 } });
        await advance(1000);
        const pw = () => gone.calls.filter((c) => c.type === 'watch' && c.iface === 'Powertrain').length;
        const asked1 = pw(), failed1 = gone.logged(/^WARN signal Powertrain error: .*trying again in 5 s/).length;
        gone.settings.set('xWheels', false);
        await advance(8000);
        const asked2 = pw();
        gone.settings.set('xWheels', true);
        await advance(1500);
        ok(asked1 === 1 && failed1 === 1 && asked2 === 1 && pw() === 2 && gone.logged(/^signal Powertrain: subscribed \(try 2\)/).length === 1 && gone.session.meter('wheels').n > 10 &&
            gone.logged(/^signal Powertrain: not tried again \(its extra is switched off\)$/).length === 1 && gone.logged(/^ERROR /).length === 0,
            '"Wheel speeds" on, its first subscription fails (to be tried again after 5 s), and it is switched OFF before that: 8 s later Powertrain was asked for ' + asked2 +
            ' time (the first) and the log says "not tried again". WAS: subscribed 5 s later although the extra was off. Switched on again: asked for afresh (' + pw() + ' in all) and subscribed');
    });

    /* ================= the optional sources ================= */
    await ok.part('every optional interface missing in turn, and all together', async () => {
        for (const name of bench.OPTIONAL.concat(['ALL'])) {
            const missing = name === 'ALL' ? bench.OPTIONAL : [name];
            const car = await boot({ missing });
            const r = await launch(car, FULL, { lift: true });
            const gone = missing.every((m) => car.logged(new RegExp('^WARN signal ' + m + ': this head unit does not have it \\(optional: .*\\), not tried again$')).length === 1);
            ok(r.rec && worst(r.rec, r.ans) <= 0.015 && gone, 'without ' + (name === 'ALL' ? 'all five' : name) + ': the run is timed as before (right to ' + s3(worst(r.rec, r.ans)) + '), the log says what is missing and what that costs');
            const calls = car.calls.filter((c) => c.type === 'watch');
            ok(missing.every((m) => calls.filter((c) => c.iface === m).length === 1), '  and a missing interface is asked for once, not again');
            if (name === 'Powertrain' || name === 'ALL') ok(r.rec.spin && r.rec.spin.method === 'estimate' && r.rec.flags.length === 0, '  no wheel speeds: wheelspin is the estimate from the acceleration (' + r.rec.spin.peak + ' %), and no cross-check flag');
            if (name === 'SatellitePositioning') ok(r.rec.height && r.rec.height.src === 'can', '  no GPS sentences: the height comes from the raw GPS value');
            if (name === 'GPSData') ok(r.rec.height && r.rec.height.src === 'gga', '  no raw GPS data: the height comes from the receiver\'s own sentence');
            if (name === 'VehicleModel') ok(car.logged(/^raw road gradient/).length === 0 && r.rec.slope && r.rec.flags.length === 0, '  no road gradient from the car: the start slope still comes from the acceleration sensor');
            if (name === 'ALL') ok(r.rec.height === null && r.rec.scaleLabel === 'UNCALIBRATED', '  no GPS at all: no height change, UNCALIBRATED');
            const s = await screens(car, 'missing-' + name.toLowerCase());
            ok(find(s.signals, /^not on this unit$/).length === (name === 'ALL' ? 6 : name === 'GPSData' ? 2 : 1), '  the Signals page says "not on this unit" for ' + (name === 'ALL' ? 'the six sources they carry' : 'it'));
            if (name === 'ALL') ok(has(s.timeslip, 'not known (no GPS height through the run)') && find(s.timeslip, /^about \d+ %, \d\.\d s above 10 % \(estimate from the acceleration\)$/).length === 1, '  the Timeslip says what is not known, and marks the wheelspin as an estimate');
        }
        // a head unit that takes no event subscription
        const car = await boot({ noEvent: true });
        await advance(3000);
        ok(car.logged(/^WARN signal SatellitePositioning error: event updatePosition: .*not tried again$/).length === 1, 'a head unit that refuses the event subscription: logged, and the app runs without GPS sentences');
    });

    await ok.part('sources that send nonsense', async () => {
        const car = await boot({});
        await advance(1500);
        const junk = [undefined, null, 0, -1, 7.5, 'x', '', true, [], [1, 2], {}, { a: {} }, NaN, Infinity, { speedVehicleCentreOfGravity: 'fast' }, { speedVehicleCentreOfGravity: -5 },
            { speedVehicleCentreOfGravity: 1e12 }, { speedVehicleCentreOfGravity: NaN }, { longitudinalAccelerationCentreOfGravity: null }, { longitudinalAccelerationCentreOfGravity: 1e9 },
            { actualValueRPMWheelFLH: 'a', actualValueRPMwheelFRH: {}, actualValueRPMWheelRLH: -3, actualValueRPMWheelRRH: 1e9 }, { nmeaString: 5 }, { nmeaString: null, delayCounter: 'x' },
            { nmeaString: '$GPRMC,,A,,,,,99999,,*' }, { nmeaString: '$'.repeat(500) }, { coordinatesValid: true, latitude: 0, longitude: 0 }, { coordinatesValid: true, latitude: 'n', longitude: 950 },
            { positionGPSLatitudeCAN: 4294967295, positionGPSLongitudeCAN: 2147483647 }, { positionGPSLatitudeCAN: -1, positionGPSLongitudeCAN: 1e20 }, { statusHeightGPSCAN: 'h' }, { laneSlope: -7 }, { laneSlope: 1e9 }];
        for (let round = 0; round < 3; round++) {
            for (const v of junk) {
                // as the value of every source's own member, and as the whole value of every field and of the event
                Object.keys(car.send).forEach((k) => car.send[k](v));
                Object.keys(car.handlers).forEach((n) => Object.keys(car.handlers[n]).forEach((f) => car.handlers[n][f](v)));
                Object.keys(car.events).forEach((e) => car.events[e](v));
            }
            await advance(200);
        }
        car.send.speed(0); car.send.accel(32500);          // (the car's own values again)
        car.speedFault = 'none';
        await advance(2000);
        const blank = car.view();
        car.speedFault = null;
        await advance(1500);
        const s = await screens(car, 'after-nonsense');
        ok(bench.mishaps().length === 0, junk.length + ' kinds of nonsense in every source, three times over: no handler threw, the app logged no error' + (bench.mishaps().length ? ': ' + bench.mishaps().slice(0, 3).join(' | ') : ''));
        ok(car.view().state === 'ready' && car.view().kmh === 0 && blank.state === 'ready', 'the car\'s "no value" (raw 65535) for 2 s is not taken as a speed: still standing, still armed');
        ok(car.session.gps.result() === null && car.session.factors.status().all === false, 'no GPS factor and no wheel factor came out of it');
        car.nmeaMode = 'junk';
        // a lone 0 in the middle of a run, in both series
        const r = await launch(car, FULL, { lift: true, mid: { at: 2600, fn: async () => { car.zeroNext = { notified: true, polled: true }; } } });
        ok(r.rec && worst(r.rec, r.ans) <= 0.015 && r.rec.sum.dropped === 1 && r.rec.sum.ended === 'lift', 'a lone 0 in the middle of the next run is dropped (1 sample), the run goes on and is right to ' + s3(worst(r.rec, r.ans)));
        ok(find(s.signals, /^present$/).length >= 9, 'and the screens draw through all of it');
    });

    /* ================= speed scale ================= */
    await ok.part('the speed scale from the GPS receiver\'s speed (RMC), sentences with bad checksums, status V', async () => {
        // this car's speed signal reads 3 % high: true speed = signal x 0.97
        const car = await boot({ k: 0.97 });
        car.on.gps = false; car.on.nav = false;             // (position legs have their own part below)
        let r = await launch(car, FULL, { lift: true });
        const short = r.ans['0-100'].s - r.rec.results['0-100'].s;
        ok(r.rec.scaleLabel === 'UNCALIBRATED' && short > 0.1, 'uncalibrated, a speed signal that reads 3 % high gives 0-100 km/h ' + short.toFixed(2) + ' s too short (the ± of ' + r.rec.results['0-100'].pm.toFixed(2) + ' s does not cover that, and says so)');
        await stop(car, 500);
        car.nmeaMode = 'bad';
        const g0 = car.session.gps.status(clock.mono);
        await cruise(car, 100, 80);
        let g = car.session.gps.status(clock.mono);
        ok(g.rmc.ratios === 0 && g.sentences.bad >= 200 && g.sentences.ok === g0.sentences.ok && g.result === null, '80 s at a steady 100 km/h with every checksum wrong: ' + g.sentences.bad + ' sentences refused, no ratio taken');
        car.nmeaMode = 'void';
        await advance(70000);
        g = car.session.gps.status(clock.mono);
        ok(g.rmc.ratios === 0 && g.sentences.rmcVoid >= 60 && g.result === null, '70 s of sentences with status V (no fix): none used');
        car.nmeaMode = 'few';
        await advance(70000);
        g = car.session.gps.status(clock.mono);
        ok(g.rmc.ratios === 0 && g.result === null, '70 s with only 4 satellites: none used');
        car.nmeaMode = 'ok';
        await advance(50000);
        ok(car.session.gps.result() === null && car.session.gps.status(clock.mono).rmc.ratios >= 45, 'good sentences: after 50 s there are ' + car.session.gps.status(clock.mono).rmc.ratios + ' ratios, and still no factor (60 are needed)');
        const sig = await screens(car, 'scale-learning', 4);
        ok(find(sig.signals2, /^GPS speed: \d+ \/ 60 ratios/).length === 1 && find(sig.signals2, /^In use: UNCALIBRATED: no GPS factor yet/).length === 1, 'the Signals tab (its second page since 1.0.2) shows the count: ' + find(sig.signals2, /^GPS speed:/)[0].s);
        await advance(20000);
        const res = car.session.gps.result();
        ok(res && res.method === 'rmc' && Math.abs(res.factor - 0.97) < 0.001, 'after 70 s: factor ' + res.factor.toFixed(4) + ' from ' + res.count + ' ratios (the car reads 3 % high: 0.9700)');
        ok(car.logged(/^speed scale learned: x0\.97\d\d from GPS speed, \d+ ratios$/).length === 1, 'logged once: ' + car.logged(/^speed scale learned/)[0]);
        await advance(12000);
        const file = JSON.parse(fs.readFileSync(path.join(car.dataDir, 'pps_drag.json'), 'utf8'));
        ok(file.gps && file.gps.rmc && Math.abs(file.gps.rmc.factor - 0.97) < 0.001 && file.gps.rmc.count >= 60 && typeof file.gps.rmc.date === 'number', 'and saved while driving on, with its count and date');
        car.plan = () => 0;
        await advance(3000);
        r = await launch(car, FULL, { stand: 0, lift: true });
        ok(r.rec.scaleLabel === 'GPS x0.970' && r.rec.scaleSource === 'gps-rmc' && worst(r.rec, r.ans) <= 0.02, 'the next run uses it: "GPS x0.970", and its times are right to ' + s3(worst(r.rec, r.ans)) + ' again');
        const s = await screens(car, 'calibrated');
        ok(has(s.run, 'GPS x0.970') && has(s.timeslip, 'GPS x0.970') && find(s.signals2, /^In use: GPS x0\.970, from GPS speed, \d+ ratios$/).length === 1, 'Run, Timeslip and Signals all say "GPS x0.970"');
        // the setting
        await stop(car, 500);
        car.settings.set('scale', 'off');
        r = await launch(car, FULL, { lift: true });
        ok(r.rec.scaleLabel === 'UNCALIBRATED' && r.rec.scaleSource === 'off' && r.rec.scale === 1, 'Speed scale "Off": the next run is timed at 1.000');
        await stop(car, 500);
        car.settings.set('scale', 'manual'); car.settings.set('scaleManual', -300);
        r = await launch(car, FULL, { lift: true });
        ok(r.rec.scaleLabel === 'MANUAL -3.00 %' && r.rec.scale === 0.97 && worst(r.rec, r.ans) <= 0.02, 'Speed scale "Manual", the row "-3.00 %" of its list: "MANUAL -3.00 %", times right to ' + s3(worst(r.rec, r.ans)));
        ok(has(await car.draw(), 'MANUAL -3.00 %'), 'and the Run tab\'s strip says "MANUAL -3.00 %"');
        // a second start of the app on the same saved file
        const again = await boot({ k: 0.97, dataDir: car.dataDir });
        await advance(1500);
        ok(again.view().scale.label === 'GPS x0.970' && again.logged(/^speed scale from the saved file: x0\.97\d\d from GPS speed, \d+ ratios \(saved\)$/).length === 1, 'the app started again: the car is still calibrated, "GPS x0.970" from the saved file');
        // "Reset calibration" asks twice, and is only there with Workshop settings on
        await again.page(3);
        ok(again.barText.BTN_ACTION === 'Reset run', 'on the Signals page the bar\'s button is "Reset run" while Workshop settings is off');
        again.settings.set('workshop', true);
        ok(again.barText.BTN_ACTION === 'Reset calibration', 'with Workshop settings on it is "Reset calibration"');
        await again.press('BTN_ACTION');
        ok(again.barText.BTN_ACTION === 'Yes, reset' && again.view().scale.label === 'GPS x0.970', 'pressed once: it asks "Yes, reset", nothing is cleared');
        await advance(6000);
        ok(again.barText.BTN_ACTION === 'Reset calibration' && again.view().scale.label === 'GPS x0.970', 'not confirmed within 5 s: back to "Reset calibration", nothing cleared');
        await again.press('BTN_ACTION'); await again.press('BTN_ACTION');
        const cleared = JSON.parse(fs.readFileSync(path.join(again.dataDir, 'pps_drag.json'), 'utf8'));
        ok(again.view().scale.label === 'UNCALIBRATED' && Object.keys(cleared.gps).length === 0 && Object.keys(cleared.wheels).length === 0 && cleared.runs.length === 4,
            'pressed twice: the GPS factor and the wheel factors are gone from the app and the file, the runs and bests are kept');
        // the same button on the page, where the kit runs the screen
        again.settings.set('workshop', true);
        const ws = await screens(again, 'workshop-signals', 4);
        ok(find(ws.signals2, /^In use: UNCALIBRATED: no GPS factor yet/).length === 1, 'after the reset the Signals page says UNCALIBRATED again');
        await again.page(4);
        again.mode = 'id7';
        await again.draw();
        ok(again.targets.some((t) => t.key === 'reset-cal'), 'where the kit runs the screen the button is on the Signals page itself');
        again.settings.set('workshop', false);
        await again.draw();
        ok(!again.targets.some((t) => t.key === 'reset-cal'), 'and not there with Workshop settings off');
    });

    await ok.part('the speed scale from position legs, applied to the next run', async () => {
        // no GPS sentences on this unit; the car's speed signal reads 3 % low
        let car = await boot({ k: 1.03, missing: ['SatellitePositioning'] });
        // (the speed is there at once: a leg that begins while the car is still gaining speed is thrown away 3 km later)
        car.plan = () => 100;
        await advance(125000);
        let res = car.session.gps.result();
        ok(res && res.method === 'legs' && Math.abs(res.factor - 1.03) < 0.003 && res.count >= 3, 'three straight kilometres at a steady 100 km/h, raw GPS position: factor ' + (res ? res.factor.toFixed(4) : '-') + ' from ' + (res ? res.count : 0) + ' legs (the car reads 3 % low: 1.0300)');
        ok(car.session.gps.status(clock.mono).legs.source === 'gps', 'from the raw GPS position, which comes before the navigation\'s');
        car.plan = () => 0;
        await advance(3000);
        let r = await launch(car, FULL, { stand: 0, lift: true });
        ok(r.rec.scaleLabel === 'GPS x1.030' && r.rec.scaleSource === 'gps-legs' && worst(r.rec, r.ans) <= 0.02, 'the next run uses it: "GPS x1.030", times right to ' + s3(worst(r.rec, r.ans)));
        const s = await screens(car, 'calibrated-legs', 4);
        ok(find(s.signals2, /^In use: GPS x1\.030, from position legs, \d legs$/).length === 1 && find(s.signals2, /^Position legs: \d \(3 needed\), from the raw GPS position/).length === 1, 'the Signals page says where it came from');
        // neither GPS sentences nor raw GPS data: the navigation's position
        car = await boot({ k: 1.03, missing: ['SatellitePositioning', 'GPSData'] });
        car.plan = () => 100;
        await advance(125000);
        res = car.session.gps.result();
        ok(res && res.method === 'legs' && Math.abs(res.factor - 1.03) < 0.003 && car.session.gps.status(clock.mono).legs.source === 'nav', 'with only the navigation\'s position: factor ' + (res ? res.factor.toFixed(4) : '-'));
        // GPS speed wins over legs when both have a result
        car = await boot({ k: 0.97 });
        car.plan = () => 100;
        await advance(140000);
        const st = car.session.gps.status(clock.mono);
        ok(st.rmc.accepted && st.legs.accepted && car.session.gps.result().method === 'rmc', 'a car with both: both methods have a result after 140 s, and the GPS speed\'s is the one used');
    });

    /* ================= wheels, slope ================= */
    await ok.part('wheel factors learned, wheelspin reported, the speed signal cross-checked', async () => {
        const car = await boot({});
        let r = await launch(car, FULL, { lift: true });
        ok(r.rec.spin && r.rec.spin.method === 'estimate' && r.rec.spin.peak < 15 && r.rec.spin.secs <= 0.1, 'before the wheel factors are known: the estimate, ' + r.rec.spin.peak + ' % on a launch without any wheelspin (the stand-in car\'s acceleration arrives 20 ms late, on a 50 ms grid)');
        await stop(car, 500);
        await cruise(car, 75, 12);
        ok(!car.session.factors.status().all && car.session.factors.status().wheels.fl.why === 'span' && car.logged(/^wheel factor/).length === 0,
            'CHANGED IN 1.0.2. 12 s at a steady 75 km/h: no factor counts yet, all the steady moments are at one speed (which shows nothing about the form of the raw value). WAS: all four learned at one speed');
        await cruise(car, 50, 12);
        const st = car.session.factors.status();
        ok(st.all && Object.keys(st.wheels).every((w) => Math.abs(st.wheels[w].f - 0.0625) < 0.0005), 'then 12 s at a steady 50 km/h (25 km/h from the first): all four factors learned, ' + st.wheels.fl.f.toPrecision(4) + ' km/h per count (the stand-in car sends 16 counts per km/h: 0.0625)');
        ok(car.logged(/^wheel factor (FL|FR|RL|RR) learned: 0\.062\d+ km\/h per count \(\d+ steady moments\)$/).length === 4, 'each logged once: ' + car.logged(/^wheel factor FL/)[0]);
        const sig = await screens(car, 'wheels-learned', 4);
        ok(find(sig.signals2, /^0\.062\d\d$/).length === 4 && find(sig.signals2, /^5\d\.\d$/).length === 4 && find(sig.signals2, /^Wheel travel, raw \(for study only\): front \d+ \/ \d+ \/ 3,  rear \d+ \/ \d+ \/ 4$/).length === 1,
            'the Signals page shows the four factors, the wheel speeds in km/h and the raw travel counters');
        car.plan = () => 0;
        await advance(3000);
        // the rear wheels spin: 30 % at the launch, gone after 0.8 s
        r = await launch(car, FULL, { stand: 0, lift: true, before: (at) => { car.spin = { from: at, to: at + 800, peak: 0.3 }; } });
        const sp = r.rec.spin;
        ok(sp && sp.method === 'wheels' && sp.axle === 'rear' && sp.peak > 15 && sp.peak <= 30 && sp.secs >= 0.2 && sp.secs <= 0.6, 'rear wheels 30 % ahead at the launch, fading over 0.8 s: peak ' + sp.peak + ' % (taken once the slowest wheel does 5 km/h), ' + sp.secs + ' s above 10 %, rear wheels led');
        ok(r.rec.flags.length === 0 && worst(r.rec, r.ans) <= 0.015, 'no flag, and the times are the speed signal\'s as before (right to ' + s3(worst(r.rec, r.ans)) + ')');
        const s = await screens(car, 'wheelspin');
        ok(find(s.run, /^PEAK \d\d %, REAR$/).length === 1 && find(s.timeslip, /^peak \d\d\.\d %, 0\.\d\d s above 10 %, rear wheels led$/).length === 1, 'Run says "' + find(s.run, /^PEAK/)[0].s + '", the Timeslip "' + find(s.timeslip, /^peak /)[0].s + '"');
        // the speed signal 8 % above the slowest wheel for the first 0.7 s
        await stop(car, 500);
        const before = JSON.stringify(car.store.data.best.slip);
        r = await launch(car, FULL, { lift: true, phase: 20, before: (at) => { car.spin = null; car.wheelLow = { from: at, to: at + 700, by: 0.08 }; } });
        ok(r.rec.flags.join() === 'SPEED READ HIGH AT LAUNCH' && r.rec.spin.readHigh === true && r.rec.spin.highSecs > 0.3, 'the speed signal 8 % above the slowest wheel for the first 0.7 s: flagged SPEED READ HIGH AT LAUNCH (' + r.rec.spin.highSecs + ' s)');
        ok(worst(r.rec, r.ans) <= 0.015, 'no time is altered for it (right to ' + s3(worst(r.rec, r.ans)) + ' against the speed signal\'s own truth)');
        ok(JSON.stringify(car.store.data.best.slip) === before && Object.keys(car.view().newBest).length === 0 && car.store.data.runs[0].flags.length === 1, 'the flagged run is in the list of runs and sets no best');
        const f = await screens(car, 'read-high');
        ok(has(f.run, 'SPEED READ HIGH AT LAUNCH') && has(f.timeslip, 'A flagged run sets no best time.') && has(f.best, '!'), 'Run and Timeslip show the flag, the list of runs marks it');
        // the factors are saved, and a new start has them
        const again = await boot({ dataDir: car.dataDir });
        await advance(1500);
        ok(again.session.factors.status().all && again.session.factors.status().wheels.rr.saved === true, 'the app started again: the four wheel factors come from the saved file');
        r = await launch(again, FULL, { lift: true, before: (at) => { again.spin = { from: at, to: at + 800, peak: 0.3 }; } });
        ok(r.rec.spin.method === 'wheels' && r.rec.spin.peak > 15, 'and the first launch already has its wheelspin from the wheels (' + r.rec.spin.peak + ' %)');
    });

    await ok.part('start slope: a downhill start is flagged and sets no best', async () => {
        // the car stands nose down on 1.5 %
        let car = await boot({ slope: -1.5 });
        await advance(2500);
        let s = await screens(car, 'standing-downhill', 0);
        ok(has(s.run, 'SLOPE NOW') && has(s.run, '-1.5 %'), 'standing nose down on 1.5 %: the strip shows "SLOPE NOW -1.5 %" before the launch');
        let r = await launch(car, FULL, { stand: 0, lift: true });
        ok(r.rec.slope && Math.abs(r.rec.slope.pct + 1.5) < 0.1 && r.rec.flags.join() === 'DOWNHILL START', 'the run: start slope ' + r.rec.slope.pct.toFixed(2) + ' % (car\'s sensor), flagged DOWNHILL START (limit 1 %)');
        ok(Object.keys(car.store.data.best.slip).length === 0 && car.store.data.runs.length === 1 && Object.keys(car.view().newBest).length === 0, 'it is kept in the list of runs and sets no best time');
        s = await screens(car, 'downhill');
        ok(has(s.run, 'DOWNHILL START') && find(s.run, /^flagged: sets no best$/).length === 2 && !has(s.run, 'NEW BEST') && has(s.timeslip, '-1.5 % (car\'s sensor, + is nose up)'), 'Run shows the flag and "flagged: sets no best" under each time, the Timeslip the slope');
        ok(car.logged(/^run extras: .*start slope -1\.5\d % over 1500 ms.*flags: DOWNHILL START \| new best: none \(a flagged run sets no best\) \| screen drawn by: /).length === 1, 'and the log: ' + car.logged(/^run extras/)[0].replace(/^.*\| start slope/, 'start slope'));
        await stop(car, 500);
        car.settings.set('slopeLimit', '2');
        r = await launch(car, FULL, { lift: true });
        ok(r.rec.flags.length === 0 && car.store.data.best.slip['0-100'].s === r.rec.results['0-100'].s, 'with the limit at 2 % the same start is not flagged and sets the best');
        await stop(car, 500);
        car.settings.set('slopeLimit', 'off'); car.slope = -6;
        r = await launch(car, FULL, { stand: 4000, lift: true });
        ok(r.rec.flags.length === 0 && Math.abs(r.rec.slope.pct + 6) < 0.2, 'with the limit off, a start on -6 % is not flagged (start slope ' + r.rec.slope.pct.toFixed(1) + ' %)');
        // uphill is never flagged; two flags at once
        car = await boot({ slope: 3 });
        r = await launch(car, FULL, { lift: true });
        ok(r.rec.flags.length === 0 && Math.abs(r.rec.slope.pct - 3) < 0.1, 'an uphill start (+3 %) is not flagged');
        car = await boot({ slope: -2.5 });
        await cruise(car, 75, 12);                      // (two steady speeds: since 1.0.2 a wheel factor needs them, and the cross-check needs the factors)
        await cruise(car, 50, 12);
        car.plan = () => 0;
        await advance(3500);
        r = await launch(car, FULL, { stand: 0, lift: true, before: (at) => { car.wheelLow = { from: at, to: at + 700, by: 0.08 }; } });
        ok(r.rec.flags.join() === 'DOWNHILL START,SPEED READ HIGH AT LAUNCH', 'a downhill start on which the speed also read high: both flags');
        s = await screens(car, 'two-flags');
        ok(has(s.run, 'DOWNHILL START') && has(s.run, 'SPEED READ HIGH AT LAUNCH') && has(s.timeslip, 'DOWNHILL START, SPEED READ HIGH AT LAUNCH'), 'both on the Run strip and on the Timeslip');
        // a sensor whose reading does not move at all through the stop: nothing says what it reads at rest
        car = await boot({ slope: -2.5, accelNoise: false });
        await cruise(car, 50, 12);
        car.plan = () => 0;
        await advance(3500);
        r = await launch(car, FULL, { stand: 0, lift: true });
        ok(r.rec.slope === null && r.rec.flags.length === 0, 'KNOWN LIMIT: an acceleration reading that stays on exactly one value from the drive through the stop (nothing new is notified after the car came to rest): the start slope is "not known", and a downhill start is then not flagged');
        // an acceleration that is never notified: its getter is read while the speed changes
        car = await boot({ accel: 'silent' });
        r = await launch(car, FULL, { lift: true });
        ok(reads(car, ACCEL, r.at + 2500, r.at + 5500) >= 25 && reads(car, ACCEL, 0, r.at) === 0, 'an acceleration that is never notified: its getter is not touched while standing, and read every 100 ms from 2 s into the run (' + reads(car, ACCEL, r.at + 2500, r.at + 5500) + ' reads in 3 s)');
        ok(car.logged(/^acceleration: nothing notified for 2 s while the speed changed, reading its getter every 100 ms/).length >= 1 && r.rec.slope && Math.abs(r.rec.slope.pct) < 0.1, 'logged; the start slope still comes from the reading at the start (' + r.rec.slope.pct.toFixed(2) + ' %)');
        car = await boot({ accel: false });
        r = await launch(car, FULL, { lift: true });
        ok(r.rec && r.rec.slope === null && r.rec.spin === null && r.rec.flags.length === 0 && worst(r.rec, r.ans) <= 0.015, 'no acceleration at all: the run is timed, start slope and wheelspin are "not known", nothing is flagged');
        s = await screens(car, 'no-acceleration');
        ok(has(s.timeslip, 'not known (no acceleration data while standing)') && has(s.timeslip, 'not known (no wheel or acceleration data)'), 'and the Timeslip says so');
    });

    await ok.part('GPS height through a run', async () => {
        // the road falls 2 m in 100 m
        const car = await boot({ climb: -0.02 });
        const r = await launch(car, FULL, {});
        const h = r.rec.height;
        ok(h && h.src === 'gga' && Math.abs(h.splits.quarter.m + 8.05) < 1.2 && Math.abs(h.splits.eighth.m + 4.02) < 1.2, 'a road that falls 2 % : height change ' + h.splits.eighth.m + ' m at the 1/8 mile and ' + h.splits.quarter.m + ' m at the 1/4 mile (true: -4.0 and -8.0; the receiver says its height once a second)');
        const s = await screens(car, 'height', 1);
        ok(find(s.timeslip, /^1\/8 mile -\d\.\d m \(-\d\.\d %\),  1\/4 mile -\d\.\d m \(-\d\.\d %\)$/).length === 1 && has(s.timeslip, 'GPS height, ±1 m at best'), 'the Timeslip: "' + find(s.timeslip, /^1\/8 mile -/)[0].s + '", marked "GPS height, ±1 m at best"');
    });

    /* ================= start conventions, units ================= */
    await ok.part('start conventions and mph, bests kept apart', async () => {
        const car = await boot({});
        let r = await launch(car, FULL, {});
        const slipQ = r.rec.results.quarter.s, slip100 = r.rec.results['0-100'].s;
        await stop(car, 500);
        car.settings.set('start', 'standstill');
        await past(car);
        ok(car.view().rec === null && Object.keys(car.view().best).length === 0 && has(await car.draw(), 'STANDSTILL'), 'the setting "Clock starts" changed to standstill: the run on screen goes, and this convention has no best yet');
        r = await launch(car, FULL, {});
        ok(worst(r.rec, r.ans) <= 0.015 && r.rec.results.quarter.s > slipQ + 0.2 && Math.abs(r.rec.results['0-100'].s - slip100) < 0.02, 'standstill: everything from first movement, right to ' + s3(worst(r.rec, r.ans)) +
            ' (the 1/4 mile ' + (r.rec.results.quarter.s - slipQ).toFixed(2) + ' s longer than with the one-foot rollout, 0-100 the same)');
        await stop(car, 500);
        car.settings.set('start', 'rollout');
        r = await launch(car, FULL, {});
        ok(worst(r.rec, r.ans) <= 0.015 && r.rec.results['0-100'].s < slip100 - 0.2 && Math.abs(r.rec.results.quarter.s - slipQ) < 0.02, 'rollout: everything after the first foot, right to ' + s3(worst(r.rec, r.ans)) + ' (0-100 ' + (slip100 - r.rec.results['0-100'].s).toFixed(2) + ' s shorter)');
        const b = car.store.data.best;
        ok(b.slip.quarter.s === slipQ && b.standstill.quarter.s > slipQ && b.rollout['0-100'].s < slip100 && car.store.data.runs.length === 3, 'three runs, and each convention has its own bests');
        let s = await screens(car, 'rollout');
        ok(has(s.best, 'Best times, rollout') && has(s.run, 'ROLLOUT') && has(s.run, 'Rollout: everything after the first foot') && find(s.best, /^(slip|standstill|rollout)$/).length === 3, 'the Best tab is the rollout\'s, the list of runs names each run\'s convention');
        await stop(car, 500);
        car.settings.set('speedUnit', 'mph'); car.settings.set('start', 'slip');
        r = await launch(car, FULL, {});
        ok(r.rec.unit === 'mph' && r.rec.results['0-60'] && !r.rec.results['0-100'] && worst(r.rec, r.ans) <= 0.015, 'mph: the speed split is 0-60 mph, right to ' + s3(worst(r.rec, r.ans)));
        s = await screens(car, 'mph');
        ok(has(s.run, '0-60 MPH') && has(s.run, 'mph') && find(s.run, /^@ 11\d\.\d mph$/).length === 1 && has(s.timeslip, '0-60 MPH') && find(s.timeslip, /^at the line 11\d\.\d$/).length === 1, 'the screens show mph: "' + find(s.run, /^@ 11/)[0].s + '"');
        ok(car.store.data.best.slip['0-60'].s === r.rec.results['0-60'].s && car.store.data.best.slip['0-100'].s === slip100, '0-60 mph and 0-100 km/h are two bests');
    });

    /* ================= the saved file ================= */
    await ok.part('the saved file: round trip, a corrupt file, Reset best', async () => {
        let car = await boot({});
        const r = await launch(car, FULL, {});
        const file = path.join(car.dataDir, 'pps_drag.json');
        let d = JSON.parse(fs.readFileSync(file, 'utf8'));
        ok(d.runs.length === 1 && d.runs[0].results.quarter.s === r.rec.results.quarter.s && d.best.slip.quarter.s === r.rec.results.quarter.s && d.runs[0].sum.launchGap === 50 && d.runs[0].other.series === 'notified',
            'after a run the file has it: results, the run summary, the other engine\'s times, the bests');
        ok(fs.readdirSync(car.dataDir).filter((f) => /\.tmp$/.test(f)).length === 0, 'written as a temporary file and renamed: no temporary file is left');
        ok(clock.wall - d.runs[0].date > 2000 && clock.wall - d.runs[0].date < 6000, 'the run carries the wall clock\'s date of the moment it ended');
        let again = await boot({ dataDir: car.dataDir });
        await advance(1500);
        let s = await screens(again, 'restart');
        ok(again.logged(/^saved runs: 1 runs, 6 best times read from pps_drag\.json$/).length === 1 && again.view().best.quarter.s === r.rec.results.quarter.s, 'the app started again: ' + again.logged(/^saved runs/)[0]);
        ok(has(s.best, r.rec.results.quarter.s.toFixed(2)) && has(s.timeslip, r.rec.results.quarter.s.toFixed(2)) && has(s.run, 'best ' + r.rec.results.quarter.s.toFixed(2)), 'Best, Timeslip (the last run) and Run ("best ...") show it');
        // "Reset best" asks twice
        await again.page(2);
        ok(again.barText.BTN_ACTION === 'Reset best', 'on the Best tab the bar\'s button is "Reset best"');
        await again.press('BTN_ACTION');
        ok(again.barText.BTN_ACTION === 'Yes, clear all' && again.store.data.runs.length === 1, 'pressed once: "Yes, clear all" (it clears the list of runs too), nothing cleared yet');
        await again.page(0); await again.page(2);
        ok(again.barText.BTN_ACTION === 'Reset best', 'leaving the tab takes the question back');
        await again.press('BTN_ACTION'); await again.press('BTN_ACTION');
        await advance(1500);                            // (the timer is armed: the log line is written at the next quiet moment)
        d = JSON.parse(fs.readFileSync(file, 'utf8'));
        ok(d.runs.length === 0 && Object.keys(d.best.slip).length === 0 && again.logged(/^best times and saved runs cleared$/).length === 1, 'pressed twice: bests and runs are gone, from the file too');
        again.mode = 'id7';
        await again.draw();
        ok(again.targets.some((t) => t.key === 'reset-best') && !again.targets.some((t) => t.key === 'reset-run'), 'where the kit runs the screen, "Reset best" is on the Best tab itself');
        await again.page(0); await again.draw();
        ok(again.targets.some((t) => t.key === 'reset-run'), 'and "Reset run" on the Run tab');
        // a file that is not JSON
        fs.writeFileSync(file, '{"v":1,"best":{"slip":{"quarter":{"s":12.3');
        car = await boot({ dataDir: car.dataDir });
        await advance(1500);
        ok(car.logged(/^WARN saved runs: pps_drag\.json is not what this app wrote \(\d+ characters\): starting fresh, the old file is kept as pps_drag\.json\.bad$/).length === 1 && car.store.data.runs.length === 0 && fs.existsSync(file + '.bad'),
            'a file cut off in the middle: the app starts fresh, says so in the log, and keeps the broken file as pps_drag.json.bad');
        const r2 = await launch(car, FULL, { lift: true });
        d = JSON.parse(fs.readFileSync(file, 'utf8'));
        ok(r2.rec && d.runs.length === 1 && d.best.slip['0-100'].s === r2.rec.results['0-100'].s, 'and the next run is timed and saved as on a new car');
        // JSON of another shape, and one with nonsense inside
        fs.writeFileSync(file, '[1,2,3]');
        car = await boot({ dataDir: car.dataDir });
        await advance(500);
        ok(car.store.data.runs.length === 0 && car.logged(/^WARN saved runs: .*starting fresh/).length === 1, 'a file that holds something else ([1,2,3]): fresh');
        const good = d.runs[0];
        fs.writeFileSync(file, JSON.stringify({ v: 1, best: { slip: { '0-100': { s: 'fast' }, '60ft': { s: 2.1, pm: 'x', date: 'y' }, quarter: { s: -4 } }, rollout: 7 }, runs: [null, 5, 'run', { results: {} }, { start: 'slip', results: { quarter: { s: null } } }, good, { start: 'sideways', results: good.results }], wheels: 'round', gps: [1] }));
        car = await boot({ dataDir: car.dataDir });
        await advance(1500);
        s = await screens(car, 'nonsense-in-file');
        ok(car.store.data.runs.length === 1 && Object.keys(car.store.data.best.slip).join() === '60ft' && car.store.data.best.slip['60ft'].pm === 0.01 && car.session.gps.result() === null && !car.session.factors.status().all,
            'a file with nonsense in it (times that are words, runs that are numbers, a calibration that is text): what makes sense is kept (1 run, 1 best), the rest dropped');
        // thirty runs are kept
        const many = { v: 1, best: { slip: {}, standstill: {}, rollout: {} }, runs: [], wheels: {}, gps: {} };
        for (let i = 0; i < 40; i++) many.runs.push(Object.assign({}, good, { date: good.date - i * 86400000, start: ['slip', 'standstill', 'rollout'][i % 3], flags: i % 5 === 4 ? ['DOWNHILL START'] : [] }));
        fs.writeFileSync(file, JSON.stringify(many));
        car = await boot({ dataDir: car.dataDir });
        await advance(1500);
        ok(car.store.data.runs.length === 30, 'of 40 runs in a file the newest 30 are kept');
        s = await screens(car, 'thirty-runs', 2);
        ok(find(s.best, /^\d\d\.\d\d\. \d\d:\d\d$/).length === 9 && has(s.best, '! = a flagged run (it sets no best time): see its Timeslip.'), 'the Best tab lists the last nine, flagged ones marked');
    });

    /* ================= demo ================= */
    await ok.part('demo data: shown, tagged, never saved', async () => {
        let car = await boot({ sets: { demo: 'on' } });
        let s = await screens(car, 'demo-ready');
        ok(car.view().demo && has(s.run, 'DEMO') && has(s.run, 'READY'), 'Demo data "Always": the screen carries the DEMO tag, the made-up car stands and arms');
        await advance(18200);
        s = await screens(car, 'demo-finished');
        const v = car.view();
        ok(v.rec && v.rec.demo === true && v.rec.results.quarter && has(s.run, 'RUN FINISHED') && has(s.timeslip, 'demo, 20/s, longest gap 50 ms, launch gap 50 ms') && find(s.timeslip, /^not part of the demo$/).length === 3,
            'its run is timed and shown (1/4 mile ' + v.rec.results.quarter.s.toFixed(2) + ' s), the Timeslip says "demo", and "not part of the demo" for wheelspin, slope and height');
        ok(!fs.existsSync(path.join(car.dataDir, 'pps_drag.json')) && car.store.data.runs.length === 0 && Object.keys(car.store.data.best.slip).length === 0 && car.store.saves === 0, 'nothing of it is saved: no file is written, the car\'s own list of runs and bests stays empty');
        ok(v.rec.spin === null && v.rec.slope === null && v.rec.height === null && v.rec.scaleLabel === 'DEMO', 'and it has no wheelspin, slope or height of its own (those would be the real car\'s)');
        ok(car.logged(/^run, /).length === 0 && car.logged(/^demo data on: runs are not saved$/).length === 1, 'the log has no run line for it');
        // the real car launches while the demo shows: not timed, not saved
        const r = await launch(car, FULL, { lift: true });
        ok(car.store.data.runs.length === 0 && car.logged(/^run, /).length === 0 && (r.rec === null || r.rec.demo === true), 'the real car\'s launch while demo data shows is not timed');
        await stop(car, 500);
        car.settings.set('demo', 'off');
        await advance(2500);
        ok(car.view().demo === false && car.view().rec === null && car.view().state === 'ready' && !has(await car.draw(), 'DEMO') && has(await car.draw(), 'READY'), 'demo switched off: the demo run leaves the screen, the car\'s own speed is back');
        const r2 = await launch(car, FULL, { stand: 0, lift: true });
        ok(r2.rec && !r2.rec.demo && car.store.data.runs.length === 1 && worst(r2.rec, r2.ans) <= 0.015, 'and the next real run is timed and saved');
        // "Auto"
        car = await boot({ sets: { demo: 'auto' } });
        await advance(8000);
        ok(car.view().demo === false, 'Demo data "Auto" on a car that answers: no demo');
        car = await boot({ sets: { demo: 'auto' }, watchFail: { Vehicle2: 9 } });
        await advance(4000);
        const early = car.view().demo;
        await advance(3000);
        ok(early === false && car.view().demo === true, '"Auto" with no speed from the car: demo data after 5 s');
        car = await boot({ watchFail: { Vehicle2: 9 } });
        await advance(8000);
        ok(car.view().demo === false && car.view().hasSpeed === false, 'as shipped ("Never"): no speed from the car shows no invented run');
    });

    /* ================= clocks ================= */
    await ok.part('the wall clock set back in the middle of a run changes nothing', async () => {
        const one = async (jump) => {
            const car = await boot({});
            const born = clock.mono, wall0 = clock.wall;
            let mid = null;
            const r = await launch(car, FULL, { mid: { at: 2000, fn: async () => { if (jump) clock.wall += jump; await advance(1000); mid = car.view().clock; } } });
            return { rec: r.rec, mid, at: r.at - born, dated: r.rec.date - wall0, car };
        };
        const same = (x, y) => Math.abs(x - y) < 1e-9;
        const a = await one(0), b = await one(-7200000), c = await one(5 * 365 * 86400000);
        ok(a.at === b.at && JSON.stringify(a.rec.results) === JSON.stringify(b.rec.results) && JSON.stringify(a.rec.sum) === JSON.stringify(b.rec.sum) && same(a.mid, b.mid) && Math.abs(a.mid - 2.92) < 0.03,
            'the wall clock set back two hours 2 s into a run: every time, every spacing and the clock on the screen are the same to the last digit as without (1/4 mile ' + b.rec.results.quarter.s.toFixed(3) + ' s both times)');
        ok(JSON.stringify(a.rec.results) === JSON.stringify(c.rec.results) && same(a.mid, c.mid), 'the same with the wall clock set five years ahead (the head unit getting its time from GPS)');
        ok(Math.abs((a.dated - b.dated) - 7200000) < 5 && Math.abs((c.dated - a.dated) - 5 * 365 * 86400000) < 5 && b.car.mostInFlight === 1, 'only the date on the saved run differs: by those two hours, and by those five years');
    });

    /* ================= the log as first-car evidence ================= */
    /* ================= what the first review found (each part's checks failed on the app as it was reviewed) ================= */
    await ok.part('review: the data rate on the Run tab is what arrived, never what the app asks for', async () => {
        let car = await boot({ getterMs: 300 });
        await past(car);
        await advance(6000);
        let s = await screens(car, 'slow-getter', 0);
        const v = car.view();
        ok(v.series === 'polled' && v.rate > 2.5 && v.rate < 4 && has(s.run, 'SPEED 3/s, GETTER'), 'a getter that takes 300 ms to answer delivers ' + v.rate.toFixed(1) + ' samples a second: the Run tab says "SPEED 3/s, GETTER". WAS: "SPEED 20/s, GETTER", the rate the app asks for, whatever arrived');
        car = await boot({ notifier: false });
        await past(car);
        await advance(4000);
        ok(Math.abs(car.view().rate - 20) <= 0.5 && has(await car.draw(), 'SPEED 20/s, GETTER'), 'a getter that answers in 25 ms: 20 a second, measured');
        car.plan = () => 80;
        await advance(6000);
        ok(Math.abs(car.view().rate - 2) <= 0.5 && has(await car.draw(), 'SPEED 2/s, GETTER'), 'driving at 80 km/h the getter is read every 500 ms: "SPEED 2/s, GETTER"');
    });

    await ok.part('review: a speed that has stopped arriving is not shown as READY', async () => {
        // the car the brief names: its speed is almost never notified, the getter is all there is
        let car = await boot({ notifier: false });
        await past(car);
        await advance(3000);
        ok(car.view().state === 'ready' && car.view().hasSpeed && has(await car.draw(), 'READY'), 'a getter-only car stands: READY');
        car.on.getter = false;                          // from now on every read of the getter fails
        const diedAt = clock.mono;
        await advance(3000);
        let s = await screens(car, 'getter-dead');
        let v = car.view();
        ok(!v.hasSpeed && v.kmh === null && v.lost > 2500 && has(s.run, 'NO SPEED FROM THE CAR') && !has(s.run, 'READY') && has(s.run, 'SPEED --'),
            '3 s after its getter stopped answering: "NO SPEED FROM THE CAR", no speed shown, data rate "SPEED --". WAS: the speed it last read (0), READY and "SPEED 20/s, GETTER", for as long as the car stood there');
        ok(!v.armed && !has(s.run, 'ARMED, NO NEW SPEED') && v.state === 'ready' && has(s.run, 'Timer armed. Closed roads and track days only') && find(s.run, /^The car has sent no speed for/).length === 0,
            'this car was read through its getter and its notifier has never been heard, so the banner does not say ARMED. But the timer is still armed on the one speed the kit read when the app started, and the line under the banner says so: ' +
            '"Timer armed. Closed roads and track days only" (KNOWN LIMIT: on this car no launch is timed, and the app cannot tell it from a car that notifies)');
        ok(find(s.signals, /^stopped \d s ago$/).length === 2 && !find(s.signals, /^present$/).some((t) => Math.abs(t.y - find(s.signals, /^Speed, getter$/)[0].y) < 2 && t.x0 < 800), 'the Signals tab says "stopped 3 s ago" for both speed rows. WAS: "present", from a sample count');
        ok(car.session.two.engines.polled.state === 'wait', 'and the polled engine is no longer armed on the standstill it last heard of');
        // the car launches: nothing arrives, nothing is timed, and the screen has said why all along
        const stopAt = car.launch(FULL, clock.mono + 400, LIFT_MS);
        await advance(5000);
        v = car.view();
        ok(car.vTrue(clock.mono) > 80 && !v.hasSpeed && v.state !== 'run' && has(await car.draw(), 'NO SPEED FROM THE CAR') && car.session.shown === null, '5 s into a launch at ' + Math.round(car.vTrue(clock.mono)) + ' km/h true: no run (there is no speed to time one from), and the Run tab says NO SPEED FROM THE CAR, not READY');
        await advance(stopAt - clock.mono + 600000);
        s = await screens(car, 'getter-dead-10-min');
        ok(has(s.run, 'NO SPEED FROM THE CAR') && find(s.signals, /^stopped 10 min$/).length === 2 && reads(car, SPEED, clock.mono - 60000) <= 31, '10 minutes on it still says so (the Signals tab: "stopped 10 min" for both speed rows), and the dead getter is tried every 2 s');
        car.on.getter = true;
        await advance(5000);
        ok(car.view().hasSpeed && car.view().state === 'ready' && has(await car.draw(), 'READY') && diedAt > 0, 'the getter answers again: the speed is back, the timer arms');
        const r = await launch(car, FULL, { stand: 0, lift: true });
        ok(r.rec && worst(r.rec, r.ans) <= 0.015 && r.rec.flags.length === 0, 'and the next launch is timed as any other');

        // both series stop in the middle of a run
        car = await boot({});
        const r2 = await launch(car, FULL, { mid: { at: 3000, fn: () => { car.on.getter = false; car.on.notifier = false; } }, wait: 6000 });
        ok(r2.rec && r2.rec.sum.ended === 'silent' && r2.rec.results['60ft'] && !r2.rec.results.quarter && !r2.rec.results['0-100'] && r2.rec.flags.join() === 'DATA GAP',
            'both speed series stop 3 s into a run: 3 s later the run ends with the 60 ft it had, flagged DATA GAP. WAS: the clock ran on for a minute on a speed that no longer arrived');
        ok(Object.keys(car.store.data.best.slip).length === 0 && car.logged(/^run, .*ended by its series stopping/).length >= 1, 'it sets no best, and the log says how it ended');
        s = await screens(car, 'run-went-silent');
        ok(has(s.run, 'NO SPEED FROM THE CAR') && has(s.timeslip, 'DATA GAP') && has(s.timeslip, 'A flagged run sets no best time.'), 'the Run tab says NO SPEED FROM THE CAR, the Timeslip lists the flag');
        ok(car.view().state === 'wait' && find(s.run, /^The car has sent no speed for \d+ s$/).length === 1 && !has(s.run, 'Timer armed. Closed roads and track days only'),
            'nothing is armed now (the car was moving when its speed stopped), so the line under the banner says for how long: "' + (find(s.run, /^The car has sent no speed for/)[0] || { s: '' }).s + '"');
        await advance(600000);
        ok(has(await car.draw(), 'The car has sent no speed for 10 min'), '10 minutes on: "The car has sent no speed for 10 min"');
    });

    /* ================= what the final check found (each part's checks failed on the app as it was checked) ================= */
    await ok.part('final check: the data rate cell says nothing while no speed arrives, also with a finished run on the screen', async () => {
        // a whole run, then both series stop while its results are on the screen
        const car = await boot({});
        await past(car);
        const r = await launch(car, FULL, {});
        let s = await car.draw();
        ok(r.rec && has(s, 'RUN FINISHED') && has(s, 'RUN DATA RATE') && has(s, 'SPEED 20/s, GETTER'), 'a finished run on the screen, the speed arriving: "RUN FINISHED", and the rate cell is the run\'s own: "RUN DATA RATE", "SPEED 20/s, GETTER"');
        car.on.getter = false; car.on.notifier = false;
        await advance(4000);
        const t = await screens(car, 'finished-then-silent', 0);
        const v = car.view();
        ok(v.rec === r.rec && !v.hasSpeed && v.rate === null && has(t.run, 'NO SPEED FROM THE CAR') && has(t.run, 'DATA RATE') && has(t.run, 'SPEED --') && !has(t.run, 'RUN DATA RATE') && find(t.run, /^SPEED \d/).length === 0,
            'both series stop while the run is on the screen: "NO SPEED FROM THE CAR", and the cell beside it reads "DATA RATE", "SPEED --". WAS: "SPEED 20/s, GETTER", the finished run\'s rate, under a banner that said no speed was arriving');
        ok(find(t.run, /^\d+\.\d\d$/).length >= 4 && has(car.page(1) && await car.draw(), 'notified, 10/s, longest gap 100 ms, launch gap 100 ms') === false && (await car.draw()).some((x) => /^getter, 20\/s, /.test(x.s)),
            'the run\'s results stay on the Run tab, and its own rate is still on the Timeslip ("getter, 20/s, ...")');
        car.page(0);
        car.on.getter = true; car.on.notifier = true;
        await advance(3000);
        s = await car.draw();
        ok(car.view().hasSpeed && has(s, 'RUN DATA RATE') && has(s, 'SPEED 20/s, GETTER'), 'the speed arrives again: the run\'s own rate is back, labelled as the run\'s');
    });

    await ok.part('final check: a car that only notifies its speed reads ARMED while it stands, not NO SPEED FROM THE CAR', async () => {
        // its getter never answers; the app has been started with the car standing
        let car = await boot({ getter: false });
        await past(car);
        await advance(4000);
        let s = await screens(car, 'notify-only-armed');
        let v = car.view();
        ok(v.state === 'ready' && v.armed && !v.hasSpeed && has(s.run, 'ARMED, NO NEW SPEED') && has(s.run, 'Closed roads and track days only') && !has(s.run, 'NO SPEED FROM THE CAR') && !has(s.run, 'READY'),
            'a car whose getter never answers, standing: it notifies nothing while it stands. The screen says "ARMED, NO NEW SPEED" with the line "Closed roads and track days only". WAS: "NO SPEED FROM THE CAR", never READY, and that line never showed, although its launch was timed');
        ok(v.kmh === null && has(s.run, 'SPEED --') && has(s.run, 'DATA RATE') && find(s.signals, /^silent for \d s$/).length === 1 && find(s.signals, /^stopped /).length === 0,
            'no speed and no rate are shown (none is arriving), and the Signals tab says "silent" for the notified speed, not "stopped"');
        const r3 = await launch(car, FULL, { stand: 0, lift: true, mid: { at: 2000, fn: async () => { s.mid = await car.draw(); s.midView = car.view(); } } });
        ok(s.midView.state === 'run' && s.midView.hasSpeed && has(s.mid, 'TIMING') && has(s.mid, 'SPEED 10/s, NOTIFIED'), 'it launches: TIMING, the speed and its rate on the screen ("SPEED 10/s, NOTIFIED")');
        ok(r3.rec && r3.rec.series === 'notified' && worst(r3.rec, r3.ans) <= 0.03 && r3.rec.flags.length === 0, 'its launch is timed from the notifications (right to ' + s3(worst(r3.rec, r3.ans)) + '), no flag');
        await stop(car, 3000);
        s = await car.draw();
        v = car.view();
        ok(v.state === 'ready' && v.armed && v.rec === r3.rec && has(s, 'ARMED, NO NEW SPEED') && has(s, 'Closed roads and track days only') && has(s, 'SPEED --'), 'stopped again: "ARMED, NO NEW SPEED" and the closed-roads line again, the last run\'s results still on the screen');
        car.goto(60, 2);
        await advance(3000);
        s = await car.draw();
        ok(car.view().hasSpeed && !car.view().armed && car.view().state === 'run' && has(s, 'TIMING') && !has(s, 'ARMED, NO NEW SPEED') && has(s, 'SPEED 10/s, NOTIFIED'), 'pulling away again (' + Math.round(car.vTrue(clock.mono)) +
            ' km/h): the notifications are back, the speed is on the screen, and the timer it was armed with is timing: TIMING');

        // a car with both: its getter stops while it stands. Its notifier has been heard, so the launch is timed from it
        car = await boot({});
        await past(car);
        const r1 = await launch(car, FULL, { lift: true });
        await stop(car, 2000);
        car.on.getter = false;
        await advance(3000);
        s = await car.draw();
        ok(r1.rec && car.view().armed && has(s, 'ARMED, NO NEW SPEED') && has(s, 'Closed roads and track days only'), 'a car that notifies and answered its getter, the getter stops while it stands: "ARMED, NO NEW SPEED" (its notifier has been heard while the speed changed)');
        const r2 = await launch(car, FULL, { stand: 0, lift: true });
        ok(r2.rec && r2.rec !== r1.rec && r2.rec.series === 'notified' && worst(r2.rec, r2.ans) <= 0.03, 'and its next launch is timed from the notifications (right to ' + s3(worst(r2.rec, r2.ans)) + ')');

        // a getter that answers, but too slowly to be used (700 ms), on a car that never notifies: nothing can be timed, and nothing says ARMED
        car = await boot({ getterMs: 700, notifier: false });
        await past(car);
        await advance(8000);
        s = await car.draw();
        ok(car.session.getterAnswers && !car.view().armed && has(s, 'NO SPEED FROM THE CAR') && !has(s, 'ARMED, NO NEW SPEED') && !has(s, 'Closed roads and track days only'),
            'a car that never notifies and whose getter takes 700 ms (every read is thrown away): "NO SPEED FROM THE CAR", not ARMED. Its getter does answer, so the one value it gave at the start is not taken for a notifier at work');
        ok(car.view().state === 'ready' && has(s, 'Timer armed. Closed roads and track days only'), 'the timer is armed on that one value all the same, and the line under the banner says so (KNOWN LIMIT: nothing is timed on this car)');
        car.launch(FULL, clock.mono + 400, LIFT_MS);
        await advance(5000);
        ok(car.session.shown === null && has(await car.draw(), 'NO SPEED FROM THE CAR'), 'it launches: nothing is timed, and the banner said NO SPEED FROM THE CAR all along');
        // the same getter on a car that does notify: NO SPEED until the notifier has been heard once, ARMED from then on
        car = await boot({ getterMs: 700 });
        await past(car);
        await advance(8000);
        s = await car.draw();
        ok(!car.view().armed && has(s, 'NO SPEED FROM THE CAR'), 'a car that notifies and whose getter takes 700 ms, standing since the app started: "NO SPEED FROM THE CAR" (KNOWN LIMIT: its notifier has not been heard yet, and its getter does answer)');
        s = await screens(car, 'no-speed-timer-armed');
        ok(car.view().state === 'ready' && has(s.run, 'NO SPEED FROM THE CAR') && has(s.run, 'Timer armed. Closed roads and track days only') && find(s.run, /^The car has sent no speed for/).length === 0,
            'its timer is armed, so the line under that banner reads "Timer armed. Closed roads and track days only". WAS: "The car has sent no speed for 8 s", and the launch that followed was timed without the closed-roads line ever having been on the Run tab');
        const r4 = await launch(car, FULL, { stand: 0, lift: true });
        await stop(car, 3000);
        s = await car.draw();
        ok(r4.rec && r4.rec.series === 'notified' && car.view().armed && has(s, 'ARMED, NO NEW SPEED') && has(s, 'Closed roads and track days only'), 'its launch is timed from the notifications, and once it stands again it reads "ARMED, NO NEW SPEED": its notifier has been heard now');

        // a car with both whose getter stops while it has only stood since the app started: its notifier has not been heard yet
        car = await boot({});
        await past(car);
        await advance(5000);
        car.on.getter = false;
        await advance(8000);
        s = await car.draw();
        ok(!car.view().armed && car.view().state === 'ready' && has(s, 'NO SPEED FROM THE CAR') && has(s, 'Timer armed. Closed roads and track days only'),
            'a car that notifies, standing since the app started, and its getter stops answering: "NO SPEED FROM THE CAR" with the line "Timer armed. Closed roads and track days only". WAS: "The car has sent no speed for 8 s" and no closed-roads line');
        const r5 = await launch(car, FULL, { stand: 0, lift: true });
        ok(r5.rec && r5.rec.series === 'notified' && worst(r5.rec, r5.ans) <= 0.03, 'and its launch is timed from the notifications (right to ' + s3(worst(r5.rec, r5.ans)) + '): the closed-roads line was on the Run tab before it');

        // no source at all: the app says so, and shows no closed-roads line
        car = await boot({ getter: false, notifier: false });
        await past(car);
        await advance(4000);
        s = await car.draw();
        ok(!car.view().armed && car.view().state === 'wait' && has(s, 'NO SPEED FROM THE CAR') && has(s, 'Waiting for the car\'s speed signal') && !has(s, 'Closed roads and track days only') && !has(s, 'Timer armed. Closed roads and track days only') && !has(s, 'ARMED, NO NEW SPEED'),
            'a car that gives no speed at all (no getter answer, no notification): "NO SPEED FROM THE CAR", "Waiting for the car\'s speed signal", nothing armed, no closed-roads line');
        car.launch(FULL, clock.mono + 400, LIFT_MS);
        await advance(5000);
        ok(car.session.shown === null && has(await car.draw(), 'NO SPEED FROM THE CAR'), 'it launches: nothing is timed, and the screen has said why all along');
    });

    await ok.part('review: no direction of travel in the log, no height above sea level in the saved file', async () => {
        const car = await boot({ climb: -0.01 });
        const r = await launch(car, FULL, {});
        await stop(car, 1500);
        const d = JSON.parse(fs.readFileSync(path.join(car.dataDir, 'pps_drag.json'), 'utf8'));
        // the stand-in car heads 90 degrees: RMC course 90.0, the navigation's heading 90, the raw GPS value's headingGPSCAN 9000
        const dir = car.logs.filter((l) => /course \d|heading \d|headingGPSCAN"?:\s*\d|\b9000\b/.test(l));
        ok(dir.length === 0 && car.logged(/^raw GPS height #1: members statusHeightGPSCAN, speedGPSCAN, headingGPSCAN: statusHeightGPSCAN \d+ = \d+ m, speedGPSCAN \d+ \(raw, scale unknown, not used\)$/).length === 1,
            'the log has no course and no heading (' + car.logs.length + ' lines): of the raw GPS height value the member names and the two members the app reads. WAS: "course 90", "heading 90" and the whole raw value with its heading member, 10 lines each' +
            (dir.length ? ': ' + dir[0] : ''));
        ok(d.runs.length === 1 && d.runs[0].height && d.runs[0].height.launch === undefined && Object.keys(d.runs[0].height).sort().join() === 'splits,src' && r.rec.height.splits.quarter.m < -3.5,
            'the saved run keeps the height CHANGES (1/4 mile ' + r.rec.height.splits.quarter.m + ' m) and not the height above sea level at the launch. WAS: height.launch, 512 m here, in every saved run');
        ok(JSON.stringify(d).indexOf('512') < 0 && JSON.stringify(d).indexOf('"course"') < 0 && JSON.stringify(d).indexOf('heading') < 0, 'no 512 (the stand-in car\'s height), no course, no heading anywhere in the file');
    });

    await ok.part('review: never two reads of the speed getter in flight, the kit\'s own read counted', async () => {
        // the car's speed service comes up 1.5 s after the app subscribed (the kit then reads the getter once itself)
        let car = await boot({ upAfter: { Vehicle2: 1500 } });
        const t0 = clock.mono - 60;
        await advance(6000);
        const first = car.calls.filter((c) => c.type === 'getValue' && c.field === SPEED)[0];
        ok(car.kitReads >= 1 && first && first.t - t0 >= 1500 + 1000 && car.mostInFlight === 1, 'a service that comes up 1.5 s after the subscription: the app\'s first read of the getter is ' + Math.round(first.t - t0 - 1500) +
            ' ms after it came up, never while the kit\'s own read is under way. WAS: the app began reading 300 ms after subscribing, service up or not');
        ok(car.logged(/^Vehicle2 getter: read from now on$/).length === 1 && Math.abs(car.view().rate - 20) <= 1, 'from then on 20 reads a second, and the log says when it began');
        // the service goes away and comes back, with a getter that takes 400 ms: the kit's read is in flight for 400 ms
        car = await boot({ getterMs: 400 });
        await advance(4000);
        let most = 0;
        for (let i = 0; i < 12; i++) {
            car.service('Vehicle2', false);
            const down = clock.mono;
            await advance(2000 + i * 37);
            const whileDown = car.calls.filter((c) => c.type === 'getValue' && c.field === SPEED && c.t > down + 60).length;
            most = Math.max(most, whileDown);
            car.service('Vehicle2', true);
            await advance(3000);
        }
        ok(car.mostInFlight === 1 && car.kitReads === 14, 'the service away and back 12 times, the getter answering in 400 ms: ' + car.kitReads + ' reads by the kit (one of them of the acceleration, at the start), ' + (car.reads - car.kitReads) + ' by the app, never two in flight. WAS: the app went on reading while the service was down, and a read of its own overlapped the kit\'s when it came back');
        ok(most === 0 && car.logged(/^Vehicle2 getter: not read while the car's service is down$/).length >= 1, 'while the service is down the app sends no read at all (and says so in the log)');
        // a head unit that gives a read up after the 1 s the app asks for, on a car that answers after 3 s
        car = await boot({ getterMs: 3000, limit: true, notifier: false });
        await advance(60000);
        const mine = car.calls.filter((c) => c.type === 'getValue' && c.field === SPEED && c.t > clock.mono - 30000);
        ok(car.mostInFlight <= 2 && mine.length >= 6 && mine.length <= 9, 'a getter that answers after 3 s, each read given up after 1 s: the app reads again 4 s after a read began (' + mine.length + ' reads in 30 s), ' +
            'so at most ' + car.mostInFlight + ' are unanswered at the car together. WAS: the next read went out the moment one was given up: up to 4 unanswered together');
    });

    await ok.part('review: a saved file with damaged entries, from a newer version, or that cannot be written', async () => {
        // single entries damaged: the times are whole, the extras are not
        const dir = (await boot({})).dataDir;            // (an empty data folder of the bench's own, cleared away with the others)
        const res = { '0-100': { s: 5.06, pm: 0.03 }, '60ft': { s: 2.1, pm: 0.02 }, quarter: { s: 12.63, pm: 0.02, trap: 186.9, at: 190.1 } };
        const run = (o) => Object.assign({ date: 1790000000000, start: 'slip', unit: 'kmh', series: 'polled', results: res, flags: [], scaleLabel: 'UNCALIBRATED', sum: { medianGap: 50, peakG: 0.7, vmax: 190 } }, o);
        const damaged = [
            run({ spin: { peak: 12, method: 'estimate' } }), run({ spin: { peak: 12, method: 'wheels', secs: 'x' } }), run({ height: { src: 'gga', splits: { quarter: { m: 'four', pct: 1 } } } }),
            run({ height: { src: 'gga', splits: { quarter: { m: -4 }, eighth: 7 } } }), run({ slope: { pct: -1.5, ms: 'x' }, sum: { medianGap: 'x', peakG: null, vmax: {}, longestGap: [], launchGap: 'y', dropped: 'z' } }),
            run({ flags: ['A', 2, 'B', 'C', 'D', 'E', 'F', 'G'], scaleLabel: 7, series: 9, unit: 3, date: 'x' }),
        ];
        fs.writeFileSync(path.join(dir, 'pps_drag.json'), JSON.stringify({ v: 1, best: { slip: { quarter: { s: 12.63, pm: 'x', date: 'y', scale: 5 } }, standstill: {}, rollout: {} }, runs: damaged, wheels: {}, gps: {} }));
        let car = await boot({ dataDir: dir });
        await advance(1500);
        ok(car.store.data.runs.length === 6 && car.logged(/^saved runs: 6 runs, 1 best times read/).length === 1, 'a file whose runs have damaged extras (a wheelspin without its seconds, a height change that is text, a summary of nonsense): all six runs are read');
        let threw = [];
        for (let i = 0; i < 6; i++) {
            car.store.data.runs.unshift(car.store.data.runs.pop());          // each of them in turn as "the last run"
            try { await screens(car, 'damaged-' + i); } catch (e) { threw.push(i + ': ' + (e && e.message || e)); }
        }
        ok(threw.length === 0 && bench.mishaps().length === 0, 'and every tab draws with each of them as the last run. WAS: the Timeslip threw on every frame ("Cannot read properties of undefined (reading \'toFixed\')") for as long as the tab was open' +
            (threw.length ? ': ' + threw[0] : ''));
        const kept = car.store.data.runs;
        ok(kept.every((r) => r.spin === null || (typeof r.spin.secs === 'number' && typeof r.spin.peak === 'number')) && kept.every((r) => !r.height || Object.keys(r.height.splits).every((k) => typeof r.height.splits[k].m === 'number' && typeof r.height.splits[k].pct === 'number')) &&
            kept.filter((r) => r.spin).length === 0 && kept.filter((r) => r.height).length === 0, 'the damaged wheelspin and height entries were dropped, as the top of store.js says, and the runs keep their times');
        // a file from a newer version of the app
        const dir2 = (await boot({})).dataDir;
        const newer = JSON.stringify({ v: 2, best: { slip: {}, standstill: {}, rollout: {} }, runs: [], cars: { mine: { runs: [1, 2, 3] } }, schema: 'two' });
        fs.writeFileSync(path.join(dir2, 'pps_drag.json'), newer);
        car = await boot({ dataDir: dir2 });
        await launch(car, FULL, { lift: true });
        await stop(car, 1500);
        ok(car.logged(/^WARN saved runs: pps_drag\.json was written by a newer version of this app \(file version 2, this one writes 1\): starting fresh, the file is kept as pps_drag\.json\.newer$/).length === 1 &&
            fs.readFileSync(path.join(dir2, 'pps_drag.json.newer'), 'utf8') === newer && JSON.parse(fs.readFileSync(path.join(dir2, 'pps_drag.json'), 'utf8')).runs.length === 1,
        'a file written by version 2 of the app: kept whole as pps_drag.json.newer, said in the log, and this version starts its own file. WAS: read as version 1 and written over at the next save, what this version does not know of it lost without a word');
        // a folder that cannot be written
        car = await boot({});
        fs.chmodSync(car.dataDir, 0o555);
        let r, s;
        try {
            r = await launch(car, FULL, {});
            s = await screens(car, 'not-saved');
        } finally { fs.chmodSync(car.dataDir, 0o755); }
        ok(r.rec && r.rec.results.quarter && car.store.failed && car.view().notSaved && !fs.existsSync(path.join(car.dataDir, 'pps_drag.json')), 'the data folder cannot be written: the run is timed and shown, and the store knows the write failed (' + car.store.failed + ')');
        ok(find(s.timeslip, /^NOT SAVED: /).length === 1 && find(s.best, /^NOT SAVED: /).length === 1 && car.logged(/^WARN saved runs: cannot write pps_drag\.json: .*NOT SAVED/).length === 1,
            'the Timeslip and the Best tab say "' + find(s.timeslip, /^NOT SAVED: /)[0].s + '". WAS: NEW BEST as usual, one line in the log, and the run gone after the next start');
        const r2 = await launch(car, FULL, { stand: 3000 });
        ok(r2.rec && !car.store.failed && !car.view().notSaved && JSON.parse(fs.readFileSync(path.join(car.dataDir, 'pps_drag.json'), 'utf8')).runs.length === 2 && !find((await screens(car, 'saved-again', 1)).timeslip, /^NOT SAVED/).length,
            'the folder can be written again: the next run saves both, and NOT SAVED goes');
    });

    await ok.part('review: the saved file is not rewritten every time the GPS factor flickers, and nothing is written to the log inside a run', async () => {
        let car = await boot({ gpsNoise: 0.004 });
        car.on.gps = false; car.on.nav = false;
        car.screen = false;                             // the app's screen hidden, as on a motorway drive
        await cruise(car, 120, 30);                     // (pulling away is a "run" to the app: it is saved when it ends)
        const s0 = car.store.saves;
        await advance(70000);
        ok(car.session.gps.result() && car.store.saves - s0 === 1, '100 s at 120 km/h, the GPS speed flickering by 0.4 % either way: the factor is learned (' + car.session.gps.result().factor.toFixed(4) + ') and written once');
        const before = car.store.saves;
        let moved = 0, told = car.session.gps.told;
        for (let i = 0; i < 120; i++) { await advance(10000); if (car.session.gps.told !== told) { moved++; told = car.session.gps.told; } }
        ok(moved >= 20 && car.store.saves - before <= 4, '20 more minutes of it: the factor moved in its 4th decimal in ' + moved + ' of 120 looks at it, the file was written ' + (car.store.saves - before) +
            ' more times (only once the factor is 0.1 % from what the file holds, and then every 5 minutes at most). WAS: every 10 s, some 80 writes an hour, for a factor that is shown to 3 decimals');
        // the log inside the first run
        car = await boot({});
        const r = await launch(car, FULL, {});
        const inRun = car.written(r.at + 60, r.at + r.rec.sum.length * 1000);      // (from the launch to the 1/4 mile line)
        const held = car.logs.filter((l) => / \(logged \d+\.\d s later\)$/.test(l));
        ok(inRun === 0 && held.length >= 15 && car.logged(/^raw speed \(notified\) #10: /).length === 1 && car.logged(/^rate speedN: /).length === 1,
            'the first run after a start: not one line is written to the log between the launch and the 1/4 mile; the ' + held.length + ' lines that fell due in it (the raw speed values, the measured rates) are written when it is over, each saying how much later. ' +
            'WAS: 34 lines inside the run, each a file write that holds the app up while a sample waits to be stamped');
        ok(/screen drawn by: /.test(car.logged(/^run extras/)[0]) && typeof r.rec.sum.renderer === 'string', 'each run\'s record and log line say what drew the screen during it (' + r.rec.sum.renderer + ' here): the software renderer holds the app up for every frame');
    });

    await ok.part('review: BETA on every screen, the clock after a run, values that are no values', async () => {
        const car = await boot({});
        await past(car);
        const armed = await screens(car, 'beta-ready');
        ok(PAGES.every((p) => has(armed[p], 'BETA')) && has(armed.timeslip, 'BETA: still being tested on cars'), 'every tab carries a BETA badge beside the tabs, and the Timeslip says "BETA: still being tested on cars" (CHANGED IN 1.0.2: it said "BETA: not yet checked against a car or a GPS timer" until the app had been on a car). WAS: only the Store description said so');
        const r = await launch(car, FULL, {});
        let s = await screens(car, 'clock-after-run');
        const q = r.rec.results.quarter.s;
        ok(car.view().clock === q && find(s.run, new RegExp('^' + q.toFixed(2).replace('.', '\\.') + '$')).length === 2 && r.rec.sum.lastSplit === 'quarter',
            'after the run the clock shows ' + q.toFixed(2) + ' s, the time of the split reached last (here the 1/4 mile, beside it). WAS: ' + (r.rec.sum.length + 0.3).toFixed(1) + ' s or so, from first movement to the sample after the line: a figure that matched no result');
        ok(PAGES.every((p) => has(s[p], 'BETA')), 'BETA is there with a run on the screen too');
        await stop(car, 1500);
        const r2 = await launch(car, FULL, { stand: 0, lift: true });
        ok(r2.rec.sum.lastSplit === '330ft' && car.view().clock === r2.rec.results['330ft'].s, 'a run the driver lifted out of after 330 ft: the clock stops at the 330 ft time (' + r2.rec.results['330ft'].s.toFixed(2) + ' s)');
        // five flags on one run: the Timeslip has room for them, the Run tab says how many more there are
        car.session.shown = Object.assign({}, r2.rec, { flags: ['DOWNHILL START', 'SPEED READ HIGH AT LAUNCH', 'DATA GAP', 'SPEED JUMP', 'SERIES DISAGREE'],
            sum: Object.assign({}, r2.rec.sum, { dropped: 2, merged: 14, holeMs: 1040, lostMs: 1040, stallMs: 1000, lowSeen: 2.03, afterCreep: 40 }) });
        car.store.data.runs[0] = car.session.shown;
        s = await screens(car, 'five-flags');
        ok(has(s.timeslip, 'DOWNHILL START, SPEED READ HIGH AT LAUNCH') && has(s.timeslip, 'DATA GAP, SPEED JUMP, SERIES DISAGREE') && has(s.run, '+ 4 MORE: SEE TIMESLIP') &&
            has(s.timeslip, 'hole 1040 ms, app held up 1000 ms, launched 0.04 s after a roll, 2 dropped, 14 merged') && has(s.timeslip, 'Speed signal starts at 2.0 km/h: times from first movement read short'),
            'a run with all five flags: the Timeslip lists them on two lines, with what the data showed (a hole, the app held up, a launch after a roll, dropped and merged samples: the line is filled by its measured width since the last check of 1.0.2, WAS 60 characters, which left the roll out) and that this car\'s speed signal starts at 2 km/h; the Run tab shows the first flag and "+ 4 MORE: SEE TIMESLIP"');
        // a silence that may be a steady speed AND, beside it, a shorter hole that does not look like one, or the app held up:
        // the Timeslip names them all, the weightier first (the last check of 1.0.2 found the "may be" words alone on the line)
        const mixed = [
            [{ holeMs: 1578, lostMs: 440, merged: 1 }, 'hole 440 ms, nothing notified for 1.6 s (may be a steady speed), 1 merged'],
            [{ holeMs: 1053, lostMs: 0, stallMs: 403, dropped: 3 }, 'app held up 403 ms, nothing notified for 1.1 s (may be a steady speed), 3 dropped'],
            [{ holeMs: 1053, lostMs: 420, stallMs: 403 }, 'hole 420 ms, app held up 403 ms, nothing notified for 1.1 s (may be a steady speed)'],
            [{ holeMs: 640, lostMs: 0 }, 'nothing notified for 640 ms (may be a steady speed)'],
        ];
        let mixedOk = 0;
        for (let i = 0; i < mixed.length; i++) {
            car.session.shown = Object.assign({}, r2.rec, { flags: ['DATA GAP'], sum: Object.assign({}, r2.rec.sum, { dropped: 0, merged: 0, stallMs: 0 }, mixed[i][0]) });
            car.store.data.runs[0] = car.session.shown;
            s = await screens(car, 'mixed-silence-' + (i + 1), 1);
            if (has(s.timeslip, mixed[i][1]) && has(s.timeslip, 'DATA GAP') && has(s.timeslip, 'A flagged run sets no best time.')) mixedOk++;
        }
        ok(mixedOk === mixed.length, 'a silence that may be a steady speed with a shorter hole that does not look like one, or with the app held up, beside it: the Timeslip\'s data line names each (' + mixedOk + ' of ' + mixed.length +
            ' made-up records: "' + mixed[0][1] + '"; "' + mixed[2][1] + '"), the hole and the hold-up before the "may be" words. WAS: the "may be" words alone, the rest only in the log, which nobody can read from the car');
        // a run whose launch the series saw late (its first moving samples were stamped late): the Timeslip says so
        car.session.shown = Object.assign({}, r2.rec, { sum: Object.assign({}, r2.rec.sum, { merged: 3, launch: Object.assign({}, r2.rec.sum.launch, { late: true }) }) });
        car.store.data.runs[0] = car.session.shown;
        s = await screens(car, 'launch-seen-late', 1);
        ok(has(s.timeslip, 'launch seen late, 3 merged') && r2.rec.sum.launch.late === false && !find(drawn['five-flags'].timeslip, /launch seen late/).length,
            'a run whose first moving samples were stamped late: the Timeslip\'s data line says "launch seen late, 3 merged" (a run on clean data does not: its record has launch.late false)');
        // values that are no values
        const speedBefore = car.session.live.speed;
        car.send.speed(65534);
        ok(car.session.live.speed === speedBefore && car.view().kmh !== null && car.view().kmh < 500, 'a raw speed of 65534 (1024 km/h): not a speed, not shown. WAS: "1024" on the Run tab');
        car.on.lane = false;
        car.send.lane({ dummy: 5, crc: 9, laneSlope: 2047 });
        await car.page(4);
        let texts = await car.draw();
        ok(find(texts, /^Road gradient \(car, for study only\): raw 2047, no value$/).length === 1, 'a road gradient value that decodes to -280 %: shown as "raw 2047, no value". WAS: "-280.7 %"');
        const enc = (count) => ((count >> 4) & 255) | ((count & 15) << 8);
        car.send.lane({ crc: 9, alive: 3, dummy: 0, otherGradient: enc(1305), actualValueLongitudinalGradientRoadway: enc(1270) });
        texts = await car.draw();
        ok(find(texts, /^Road gradient \(car, for study only\): raw \d+, count 1270, \+1\.0 %$/).length === 1, 'the gradient along the road is read by its name where the value has it (+1.0 % here), not "the first number" (here that is another gradient: -2.5 %)');
        car.send.nmea({ nmeaString: nmea('GPGGA,1,1,N,1,E,9,99999999,-1,99999,M,46.9,M,,'), delayCounter: 1 });
        await advance(300);                             // (since 1.0.2 the Signals pages take their figures four times a second, not for every frame)
        texts = await car.draw();
        ok(find(texts, /^Fix: satellites not said, height 512 m \(raw value\), sentences/).length === 1 && car.session.gps.height(clock.mono).src === 'can' && car.session.gps._fixGood(clock.mono) === false,
            'a GGA sentence with 99999999 satellites, quality 9, HDOP -1 and 99999 m: none of it shown, it does not vouch for a fix, and the height is the raw GPS value\'s. WAS: "Fix: 99999999 satellites, quality 9, HDOP -1"');
        await car.page(0);
    });

    await ok.part('the log of a first drive', async () => {
        const car = await boot({ k: 0.97 });
        await launch(car, FULL, {});
        const names = ['speed (notified)', 'speed (getter)', 'acceleration', 'wheel speeds', 'wheel travel, front', 'wheel travel, rear', 'GPS sentences', 'GPS position', 'GPS height', 'navigation position', 'road gradient'];
        const esc = (s) => s.replace(/[()]/g, '\\$&');
        const counts = names.map((n) => car.logged(new RegExp('^raw ' + esc(n) + ' #\\d+: ')).length);
        ok(counts.slice(0, 10).every((n) => n === 10) && counts[10] >= 1, 'the first 10 raw values of every source are in the log, and no more (the road gradient only changed ' + counts[10] + ' time)');
        ok(car.logged(/^rate (speedN|speedP|accel|wheels|nmea|gpsPos|gpsExt|navPos|travelF|travelR): \d+\.\d a second while the speed changes, median \d+ ms, longest \d+ ms \(\d+ samples in all\)$/).length === 10,
            'every source\'s measured rate is logged once it has 5 s of changing speed: ' + car.logged(/^rate speedN/)[0]);
        ok(car.logged(/^raw GPS sentences #1: \$GPRMC \$GPGGA \$GPGSA; 3 good, 0 with a wrong checksum; RMC valid, 0\.00 km\/h; GGA quality 1, 9 satellites, HDOP 0\.9, height 512 m; delayCounter 2$/).length === 1,
            'of the GPS sentences: their kinds, speed, fix, satellites and height');
        ok(car.logged(/^raw GPS position #1: members positionGPSLatitudeCAN, positionGPSLongitudeCAN: a valid position \(values not logged\)$/).length === 1 &&
            car.logged(/^raw navigation position #1: members coordinatesValid, latitude, longitude, heading: coordinatesValid true, a valid position \(values not logged\)$/).length === 1,
            'of the two position sources: the member names and "a valid position", no value');
        ok(car.logged(/^Proven Drag: started, clock starts "slip", speed scale "gps", demo data "off"$/).length === 1 && car.logged(/^run extras: wheelspin .* \| start slope .* \| height .* \| scale UNCALIBRATED \| flags: none \| new best: 0-100, 60ft, 330ft, eighth, 1000ft, quarter \| screen drawn by: /).length === 1,
            'the settings at the start, and after the run its wheelspin, slope, height, scale, flags and new bests');
    });

    /* ================= 1.0.2: what the first car showed. Each of these parts starts the app AS SHIPPED unless it says otherwise ================= */
    await ok.part('1.0.2: as shipped the app asks the car for two fields and nothing else, in every state, shown or hidden', async () => {
        const car = await shipped(OWNER);
        await past(car);
        await advance(2500);
        let s = await screens(car, 'shipped-ready');
        let v = car.view();
        ok(v.state === 'ready' && v.hasSpeed && v.kmh === 0 && v.held && !v.armed && has(s.run, 'READY') && has(s.run, 'Closed roads and track days only') && !has(s.run, 'ARMED, NO NEW SPEED') && !has(s.run, 'NO SPEED FROM THE CAR'),
            'the car stands and notifies nothing (it only notifies a speed that changes). The speed the kit read when the car\'s service came up, 0, is held: the Run tab shows 0 km/h, and after a second READY');
        ok(has(s.run, 'DATA RATE') && has(s.run, 'SPEED WHEN IT CHANGES') && !has(s.run, 'SPEED --'), 'the data rate cell says "SPEED WHEN IT CHANGES" while nothing arrives (not "--" without a reason)');
        ok(has(s.run, 'UNCALIBRATED') && has(s.run, 'GPS SCALE IS OFF IN SETTINGS') && v.scale.gpsOff === true, 'the speed scale cell says why the run will be uncalibrated and where to change that: "UNCALIBRATED", "GPS SCALE IS OFF IN SETTINGS"');
        ok(find(s.signals, /^switched off$/).length === 9 && find(s.signals, /^silent for \d s$/).length === 1 && find(s.signals, /^present$/).length === 1 && find(s.signals, /^--$/).length === 4,
            'the Signals tab: nine of the eleven sources say "switched off" and nothing else in their rows (the only "--" are the rate and the longest gap of the two sources that are on: nothing is measured before the speed has changed), the notified speed "silent" (it is held, which is no fault), the acceleration "present"');
        ok(has(s.signals2, 'The wheel speeds are switched off. To study them: Settings, Workshop settings, Wheel speeds.') && find(s.signals2, /^In use: UNCALIBRATED: the GPS speed scale is switched off \(Settings, GPS speed scale\)$/).length === 1 &&
            find(s.signals2, /^GPS speed: switched off \(Settings, GPS speed scale\)$/).length === 1 && find(s.signals2, /^Position legs: switched off \(Settings, Workshop settings, Positions\)$/).length === 1 &&
            find(s.signals2, /^Fix: GPS is switched off$/).length === 1 && find(s.signals2, /^Road gradient \(car, for study only\): switched off$/).length === 1 && find(s.signals2, /^Wheel travel \(for study only\): switched off\./).length === 1,
            'its second page says of every block that is switched off that it is, and where to switch it on');
        // a whole drive: a launch to the 1/4 mile, a stop, town and motorway speeds, the screen hidden and shown, parked for 5 minutes, every page drawn
        const r = await launch(car, FULL, { stand: 0 });
        await stop(car);
        await cruise(car, 50, 20); await cruise(car, 120, 60);
        car.screen = false; await advance(30000); car.screen = true;
        await halt(car);
        car.screen = false; await advance(320000); car.screen = true;
        await advance(3000);
        for (let p = 0; p < 5; p++) { await car.page(p); await car.draw(); await advance(1500); }
        await car.page(0);
        const gets = car.calls.filter((c) => c.type === 'getValue'), watches = car.calls.filter((c) => c.type === 'watch');
        ok(gets.length === 0 && car.reads === 2 && car.kitReads === 2, 'through all of it (' + Math.round((clock.mono - 100000) / 1000) + ' s of the stand-in\'s clock, a launch, a drive, the screen hidden twice, 5 minutes parked, every page): the app made ' + gets.length +
            ' getter reads of its own. The 2 reads the stand-in car saw are the kit\'s own first read of the speed and of the acceleration');
        ok(watches.length === 2 && watches.map((c) => c.iface + ':' + c.fields.join('+')).join() === 'Vehicle2:statusCarSpeed2,CDS2:statusLongitudinalAccelerationMassCenter' && car.calls.length === 2,
            'what left the app: two subscriptions, Vehicle2 statusCarSpeed2 and CDS2 statusLongitudinalAccelerationMassCenter. No subscription for any extra, no event, nothing else (' + car.calls.length + ' calls in all)');
        ok(r.rec && r.rec.series === 'notified' && r.rec.other === null && worst(r.rec, r.ans) <= 0.02 && r.rec.flags.length === 0 && r.rec.sum.noReads === true && r.rec.sum.medianGap >= 20 && r.rec.sum.medianGap <= 22,
            'the launch in it was timed from the notified speed alone, every split within ' + s3(worst(r.rec, r.ans)) + ' of the true time, no flag (' + Math.round(1000 / r.rec.sum.medianGap) + ' samples a second)');
        ok(r.rec.ext && r.rec.ext.gps === false && r.rec.ext.wheels === false && r.rec.ext.ask === false && r.rec.scaleLabel === 'UNCALIBRATED' && r.rec.spin && r.rec.spin.method === 'estimate' && r.rec.height === null,
            'its record says what was switched off for it: UNCALIBRATED, wheelspin the estimate from the acceleration (' + r.rec.spin.peak + ' %), no height');
        ok(car.logged(/^signals: the speed and the acceleration \(core\); every extra is switched off; the app's own getter reads are switched off$/).length === 1 && car.logged(/getter: read from now on|own getter reads: allowed/).length === 0,
            'and the log says at the start what is asked of the car');
        s = await screens(car, 'shipped-after-run');
        ok(has(s.timeslip, 'UNCALIBRATED: the GPS speed scale is switched off in Settings') && has(s.timeslip, 'not known (GPS is switched off in Settings)') && find(s.timeslip, /^about \d+ %, \d\.\d s above 10 % \(estimate from the acceleration\)$/).length === 1 &&
            find(s.timeslip, /^notified, 4[78]\/s, longest gap \d+ ms, launch gap \d+ ms$/).length === 1, 'the Timeslip says the same in words: the scale is switched off, the height is not known because GPS is switched off, the wheelspin is an estimate');
        // driving at a speed held to the last count: nothing is notified, and the screen does not say the speed is lost
        car.plan = () => 80;
        await advance(6000);
        v = car.view();
        const t = await car.draw();
        ok(v.hasSpeed && Math.abs(v.kmh - 80) < 0.1 && v.held && v.state === 'wait' && has(t, 'RUN FINISHED') && has(t, 'Stop to arm the next run') && !has(t, 'NO SPEED FROM THE CAR') && find(t, /^80$/).length === 1 && car.session.meter('speedN').stats(clock.mono).age > 5000,
            'driving at 80 km/h held to the last count: nothing has been notified for ' + Math.round(car.session.meter('speedN').stats(clock.mono).age / 1000) + ' s, and the Run tab still shows 80 km/h and "Stop to arm the next run", not NO SPEED FROM THE CAR. (A speed the car has not notified anew is the speed it still has, while the car\'s speed service is up)');
        // the car's speed service goes away: now the speed is not known
        car.plan = () => 0;
        await advance(4000);
        car.service('Vehicle2', false);
        await advance(1500);
        v = car.view();
        ok(!v.hasSpeed && v.kmh === null && !v.held && v.armed && has(await car.draw(), 'ARMED, NO NEW SPEED'), 'the car\'s speed service goes down while the car stands: the speed is no longer shown as known. "ARMED, NO NEW SPEED", as before 1.0.2');
        car.service('Vehicle2', true);
        await advance(500);
        ok(car.view().hasSpeed && car.view().kmh === 0 && has(await car.draw(), 'READY') && car.kitReads === 3 && car.calls.filter((c) => c.type === 'getValue').length === 0, 'it comes back: the kit reads the speed once itself (its third read in this start, still none of the app\'s), and the Run tab says READY again');
    });

    await ok.part('1.0.2: a car like the first one is timed from what it notifies alone. Full-throttle runs carry no flag, a true gap does', async () => {
        // three made-up cars, each launched at two moments between two of the car's send slots
        const quick = truth({ a0: 10.5, vTop: 82, ramp: 0.1, shifts: [{ v: 58 / 3.6, dur: 0.12, cut: 0.85 }, { v: 98 / 3.6, dur: 0.12, cut: 0.85 }, { v: 150 / 3.6, dur: 0.12, cut: 0.85 }] });
        const slow = truth({ a0: 4.5, vTop: 58, ramp: 0.3, shifts: [{ v: 38 / 3.6, dur: 0.3, cut: 1 }, { v: 72 / 3.6, dur: 0.3, cut: 1 }, { v: 110 / 3.6, dur: 0.3, cut: 1 }] });
        let most = 0, flagged = 0, runs = 0, holes = 0, pmMost = 0;
        const zero100 = [];
        for (const model of [FULL, quick, slow]) {
            zero100.push(model.answers('slip', 'kmh')['0-100'].s.toFixed(1));
            const car = await shipped(OWNER);
            for (const phase of [3, 14]) {
                const r = await launch(car, model, { stand: runs % 2 ? 0 : 2500, phase });
                runs++;
                if (!r.rec || r.rec.series !== 'notified') { most = 99; continue; }
                most = Math.max(most, worst(r.rec, r.ans));
                flagged += r.rec.flags.length; holes = Math.max(holes, r.rec.sum.holeMs);
                Object.keys(r.rec.results).forEach((k) => { pmMost = Math.max(pmMost, r.rec.results[k].pm); });
                await stop(car, 3000);
            }
        }
        ok(runs === 6 && most <= 0.02 && flagged === 0, runs + ' full-throttle runs to the 1/4 mile of three made-up cars (0-100 km/h in ' + zero100.join(', ') + ' s; one to three gear changes each, the slowest with the drive cut altogether for 0.3 s at each): every split within ' + s3(most) +
            ' of the true time, and no run carries a flag');
        ok(holes < 300 && pmMost <= 0.03, 'the longest hole booked in any of them is ' + holes + ' ms (DATA GAP is from 300 ms: the silence of a gear change is taken as "nothing changed" when the next sample fits that), and no ± is above ' + pmMost.toFixed(2) + ' s');
        // a true gap: the car's notifications are lost for 0.4 s while it pulls hard
        let car = await shipped(OWNER);
        let r = await launch(car, FULL, { lift: true, mid: { at: 2000, fn: async () => { car.on.notifier = false; await advance(400); car.on.notifier = true; } } });
        ok(r.rec && r.rec.flags.join() === 'DATA GAP' && r.rec.sum.holeMs >= 380 && r.rec.sum.holeMs <= 460 && Object.keys(car.store.data.best.slip).length === 0,
            'a true gap, the notifications lost for 0.4 s two seconds into a run: a hole of ' + r.rec.sum.holeMs + ' ms, flagged DATA GAP, no best set');
        let s = await screens(car, 'shipped-true-gap', 1);
        ok(find(s.timeslip, /^hole \d+ ms/).length === 1 && has(s.timeslip, 'DATA GAP'), 'and the Timeslip says what it was: "' + (find(s.timeslip, /^hole \d+ ms/)[0] || { s: '' }).s + '"');
        // the speed stops being notified altogether in the middle of a run
        car = await shipped(OWNER);
        r = await launch(car, FULL, { mid: { at: 3000, fn: () => { car.on.notifier = false; } }, wait: 6000 });
        ok(r.rec && r.rec.sum.ended === 'silent' && r.rec.flags.join() === 'DATA GAP' && r.rec.results['60ft'] && !r.rec.results.quarter && r.rec.sum.noReads === true,
            'nothing notified any more from 3 s into a run: the run ends 3 s later with what it has, flagged DATA GAP (as before 1.0.2: the app does not carry a run on over a silence)');
        s = await screens(car, 'shipped-run-went-silent', 1);
        ok(has(s.timeslip, 'nothing notified for 3 s (steady speed or signal lost)'), 'the Timeslip says what the app knows, and no more: "nothing notified for 3 s (steady speed or signal lost)". Without reads of its own it cannot tell the two apart');
        // STILL OPEN, said plainly: a gentle pull-away that holds one speed to the last count for 3 s is ended the same way
        car = await shipped(Object.assign({}, OWNER));
        await advance(2500);
        const t0 = clock.mono + 400;
        car.plan = (t) => (t < t0 ? 0 : Math.min(57, 57 * (t - t0) / 8000));
        await advance(8400 + 6000);
        const g = car.session.shown;
        ok(g && g.sum.ended === 'silent' && g.flags.join() === 'DATA GAP' && g.results['60ft'] && g.results['330ft'],
            'NOT SOLVED, as the notes say: a gentle pull-away to 57 km/h that then holds that speed to the last count is ended after 3 s without a notification and flagged DATA GAP (its 60 ft and 330 ft are kept). A full-throttle run never holds a speed for 3 s');
    });

    await ok.part('1.0.2: each extra is subscribed when it is switched on, its values are dropped when it is switched off, and the GPS speed scale works from the notified speed', async () => {
        // this car's speed signal reads 1.2 % high (true speed = signal x 0.988), and it holds its speed to the last count: nothing is notified at a cruise
        const car = await shipped(Object.assign({ k: 0.988 }, OWNER));
        const watched = () => car.calls.filter((c) => c.type === 'watch').map((c) => c.iface + ':' + c.fields.join('+'));
        await past(car);
        await advance(3000);
        ok(watched().length === 2 && car.calls.filter((c) => c.type === 'on').length === 0, 'as shipped: two subscriptions, no event');
        car.settings.set('gps', true);
        await advance(1500);
        ok(watched().length === 3 && watched()[2] === 'SatellitePositioning:' && car.calls.filter((c) => c.type === 'on' && c.event === 'updatePosition').length === 1 && car.logged(/^switched on: the GPS receiver's sentences: subscribing now$/).length === 1 &&
            car.session.meter('nmea').n >= 1, '"GPS speed scale" switched on: the GPS receiver is subscribed at once (one proxy, one event subscription), and its sentences arrive (' + car.session.meter('nmea').n + ' so far)');
        await cruise(car, 100, 78);
        const res = car.session.gps.result();
        ok(res && res.method === 'rmc' && Math.abs(res.factor - 0.988) < 0.001 && car.calls.filter((c) => c.type === 'getValue').length === 0 && car.session.meter('speedN').stats(clock.mono).age > 30000,
            'a steady 100 km/h for a minute, held to the last count (the car has notified no speed for ' + Math.round(car.session.meter('speedN').stats(clock.mono).age / 1000) + ' s): the factor is learned from the held speed, ' + (res ? res.factor.toFixed(4) : '-') +
            ' (this car reads 1.2 % high: 0.9880), with no getter read of the app\'s own');
        ok(car.session.gps.status(clock.mono).sentences.ok >= 38 * 70 && bench.mishaps().length === 0, 'through ' + car.session.gps.status(clock.mono).sentences.ok + ' sentences, 38 in every event as on the first car');
        await halt(car, 3000);
        await car.press('BTN_ACTION');                  // "Reset run": the pull-away was a run to the app, and its own scale (none yet) would stand in the strip
        let s = await screens(car, 'gps-on');
        ok(has(s.run, 'GPS x0.988') && !has(s.run, 'GPS SCALE IS OFF IN SETTINGS') && find(s.signals, /^switched off$/).length === 8 && find(s.signals2, /^In use: GPS x0\.988, from GPS speed, \d+ ratios$/).length === 1 &&
            find(s.signals2, /^Fix: 9 satellites, quality 1, HDOP 0\.9, height 512 m \(receiver\), sentences \d+ good, 0 bad$/).length === 1, 'the Run tab says "GPS x0.988", the Signals tab shows the GPS sentences as present and the fix');
        // switched off again: its values are dropped at once, the subscription stays, the factor learned stays in use
        const n0 = car.session.meter('nmea').n;
        car.settings.set('gps', false);
        const arrived = car.calls.length;
        let events = 0;
        const ev = car.events['SatellitePositioning.updatePosition'];
        car.events['SatellitePositioning.updatePosition'] = (x) => { events++; return ev(x); };
        await advance(5000);
        s = await screens(car, 'gps-off-again');
        ok(events >= 4 && car.session.meter('nmea').n === n0 && find(s.signals, /^switched off$/).length === 9 && car.calls.length === arrived,
            'switched off again: the car still sends the event (' + events + ' in 5 s, the subscription ends with the next start of the app), and not one of them is used; the Signals tab says "switched off"');
        ok(car.view().scale.label === 'GPS x0.988' && has(s.run, 'GPS x0.988') && find(s.signals2, /^GPS speed: switched off/).length === 1 && car.logged(/^switched off: the GPS receiver's sentences\. Their values are no longer used; the subscription itself ends with the next start of the app$/).length === 1,
            'the factor that was learned stays in use ("GPS x0.988"), and the log says what switching off does and does not do');
        car.settings.set('gps', true);
        await advance(2500);
        ok(watched().filter((w) => w === 'SatellitePositioning:').length === 1 && car.calls.filter((c) => c.type === 'on').length === 1 && car.session.meter('nmea').n > n0 && car.logged(/^switched on: the GPS receiver's sentences \(still subscribed from before: used again\)$/).length === 1,
            'switched on a second time: no second subscription, the one that is still there is used again');
        // the other three extras, one at a time
        car.settings.set('xWheels', true);
        await advance(1500);
        ok(watched().length === 4 && watched()[3] === 'Powertrain:ActualValueRPMWheel' && car.session.meter('wheels').n > 10, '"Wheel speeds" switched on: Powertrain ActualValueRPMWheel is subscribed, and nothing else');
        car.settings.set('xPos', true);
        await advance(2500);
        ok(watched().length === 6 && watched().slice(4).join() === 'GPSData:GPSPositionCAN+GPSPositionExtendedCAN,Positioning:currentLocation' && car.session.meter('gpsPos').n >= 1 && car.session.meter('navPos').n >= 1,
            '"Positions" switched on: GPSData (position and height) and the navigation\'s position are subscribed');
        car.settings.set('xStudy', true);
        await advance(1000);
        car.slope = 0.5;                                // (the road gradient is only notified when it changes, and since 1.0.2 no getter of it is read)
        await advance(1000);
        ok(watched().length === 8 && watched().slice(6).join() === 'VehicleModel:LaneSlope,Vehicle2:statusWheeltravel+statusWheeltravelRear' && car.session.meter('travelF').n >= 1 && car.session.meter('lane').n >= 1,
            '"Wheel travel, gradient" switched on: the road gradient, and the two wheel-travel fields of Vehicle2 in a subscription of their own (at a start with the setting on they are part of Vehicle2\'s one subscription)');
        s = await screens(car, 'extras-switched-on');
        ok(find(s.signals, /^switched off$/).length === 1 && find(s.signals, /^present$/).length === 9 && bench.allForbidden().length === 0 && car.calls.filter((c) => c.type === 'getValue').length === 0,
            'with all four on the Signals tab has one row left that says "switched off": the app\'s own getter reads. Still not one of them');
        // the app's own getter reads
        car.settings.set('workshop', true); car.settings.set('askCar', true);
        const tA = clock.mono;
        await advance(4000);
        const perSec = reads(car, SPEED, tA + 2000, tA + 4000) / 2;
        ok(perSec >= 19 && perSec <= 21 && car.mostInFlight === 1 && car.logged(/^Vehicle2 getter: read from now on$/).length === 1, '"Ask the car for values" switched on, the car standing with its screen shown: the speed getter is read ' + perSec + ' times a second, as 1.0.1 did');
        car.screen = false;
        await advance(300);
        const tH = clock.mono;
        await advance(20000);
        ok(reads(car, SPEED, tH) === 0 && reads(car, ACCEL, tH) === 0, 'the screen hidden: not one read in 20 s, although the setting is on');
        car.screen = true;
        await advance(2000);
        ok(reads(car, SPEED, clock.mono - 1000) >= 18, 'shown again: read again');
        car.settings.set('askCar', false);
        await advance(300);
        const tO = clock.mono;
        await advance(20000);
        ok(reads(car, SPEED, tO) === 0 && car.view().hasSpeed && has(await car.draw(), 'READY'), 'switched off again: no read from that moment on, and the Run tab still says READY (the speed is held)');
        // the next start of the app, as shipped again (an unexpected exit empties the settings): the saved factor is used, nothing extra is subscribed
        await advance(12000);
        const again = await shipped(Object.assign({ k: 0.988, dataDir: car.dataDir, tmpDir: car.tmpDir }, OWNER));
        await past(again);
        await advance(2500);
        s = await screens(again, 'shipped-saved-factor');
        ok(again.calls.length === 2 && again.view().scale.label === 'GPS x0.988' && again.view().scale.gpsOff === false && has(s.run, 'GPS x0.988') && !has(s.run, 'GPS SCALE IS OFF IN SETTINGS') &&
            find(s.signals2, /^In use: GPS x0\.988, from GPS speed, \d+ ratios, saved \d\d\.\d\d\. \d\d:\d\d$/).length === 1 && find(s.signals2, /^GPS speed: switched off/).length === 1,
            'the app started again with its settings as shipped: two subscriptions, and the factor in the saved file keeps being used ("GPS x0.988, ... saved ...") although the GPS speed scale is switched off');
        const r = await launch(again, FULL, { stand: 0, lift: true });
        ok(r.rec && r.rec.scaleLabel === 'GPS x0.988' && r.rec.scaleSource === 'gps-rmc' && worst(r.rec, r.ans) <= 0.02, 'and its next run is timed with it, right to ' + s3(worst(r.rec, r.ans)));
    });

    await ok.part('1.0.2: the wheel speeds of a car like the first one: raw values for one photo, and nothing of them in any figure', async () => {
        const car = await shipped(Object.assign({ sets: { xWheels: true } }, OWNER));
        await past(car);
        await advance(2500);
        let s = await screens(car, 'wheels-raw-standing', 4);
        ok(find(s.signals2, /^65407 \(FF7F\)$/).length === 12 && find(s.signals2, /^no steady speed yet$/).length === 4 && find(s.signals2, /^too few$/).length === 4 && find(s.signals2, /^none yet$/).length === 8,
            'standing, with "Wheel speeds" on: the Signals tab\'s second page shows every wheel\'s raw value now, the lowest and the highest since the start, in decimal and hexadecimal ("65407 (FF7F)", as on the first car), and says of what is not there yet that it is not');
        await cruise(car, 58, 14);
        s = await screens(car, 'wheels-raw-steady', 4);
        const at = find(s.signals2, /^at 58 km\/h: \d+ \([0-9A-F]{4}\)$/);
        ok(at.length === 4 && find(s.signals2, /^one speed$/).length === 4 && car.session.factors.status().all === false,
            '14 s at a steady 58 km/h: each wheel\'s raw value at that speed is on the page with the speed ("' + (at[0] || { s: '' }).s + '"). The ratios agree, all being taken at one speed, and the wheel speeds are still not worked out: "one speed"');
        await cruise(car, 85, 14);
        const st = car.session.factors.status();
        ok(!st.all && st.wheels.fl.why === 'spread' && st.wheels.fl.spread > 0.03, 'then 14 s at 85 km/h: the ratios of the two speeds do not agree (' + (st.wheels.fl.spread * 100).toFixed(0) + ' % spread): these raw values are no plain multiple of the wheel\'s speed, and they stay unused');
        await halt(car, 3000);
        const r = await launch(car, FULL, { stand: 0, lift: true });
        ok(r.rec && r.rec.spin && r.rec.spin.method === 'estimate' && r.rec.flags.length === 0 && worst(r.rec, r.ans) <= 0.02 && car.logged(/^wheel factor/).length === 0,
            'a launch after it: the wheelspin is the estimate from the acceleration, no SPEED READ HIGH AT LAUNCH flag, no wheel factor was ever called "learned", and the times are right to ' + s3(worst(r.rec, r.ans)));
        await stop(car, 12000);
        const file = JSON.parse(fs.readFileSync(path.join(car.dataDir, 'pps_drag.json'), 'utf8'));
        ok(Object.keys(file.wheels).length === 0, 'and no wheel factor is in the saved file');
        s = await screens(car, 'wheels-raw-after-drive');
        ok(find(s.signals2, /^65407 \(FF7F\)$/).length === 4 && find(s.signals2, /^not used$/).length === 4 && find(s.run, /ESTIMATE/).length === 1 && find(s.timeslip, /estimate from the acceleration/).length === 1,
            'the page after the drive: raw now 65407 again, the lowest and highest of the drive, the value at the last steady speed, "not used"; Run and Timeslip show the estimate');
    });

    await ok.part('1.0.2: the record of starts and stops, and the line on the Run tab after a stop the app did not hear of', async () => {
        const uid = process.getuid ? process.getuid() : 0;
        const first = await shipped(OWNER);
        const ram = path.join(first.tmpDir, 'pps-box-pps_drag-' + uid), ramFile = path.join(ram, 'box.json'), diskFile = () => path.join(first.dataDir, 'box.json');
        const readBox = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
        await past(first);
        await advance(5000);
        let s = await screens(first, 'life-1');
        const now1 = find(s.signals, /^#1 now, started \d\d\.\d\d\. \d\d:\d\d, running \d+ s, memory \d+ MB \(most \d+\), processor \d+ % \(most \d+\), longest hold-up \d+ ms \(last 10 s: \d+\), armed, extras off, set-up done, [A-Za-z]+ tab, \d+ frames\/s software, \d+ values\/s$/);
        ok(now1.length === 1 && has(s.signals, 'Starts and stops') && find(s.signals, /^Kept in RAM \(written \d+ s ago\) and in the data folder \(written \d+ s ago\)\.$/).length === 1,
            'the Signals tab, first page, always: "Starts and stops", with this start\'s line: "' + (now1[0] || { s: '(not found)' }).s + '", and where the record is kept');
        ok(fs.existsSync(ramFile) && fs.existsSync(diskFile()) && (fs.statSync(ram).mode & 0o777) === 0o755 && (fs.statSync(ramFile).mode & 0o777) === 0o644 && fs.readdirSync(ram).join() === 'box.json',
            'two copies: one in the folder that stands for the head unit\'s RAM disk (folder mode 0755, file 0644, no temporary file left), one in the data folder');
        const b = readBox(ramFile);
        ok(b.v === 1 && b.lives.length === 1 && b.lives[0].n === 1 && b.lives[0].end === '' && b.lives[0].disk === 1 && b.lives[0].ram === 1 && b.lives[0].note.state === 'armed' && b.lives[0].note.setup === 'done' && b.lives[0].note.on.gps === 0 && b.lives[0].s >= 4,
            'the copy in RAM, 5 s into the first start: life 1, no end noted, state "armed", set-up "done", every extra 0, and it says the data folder holds a copy');
        ok(first.logged(/^starts and stops: #1 now, started /).length === 1 && first.logged(/^starts and stops: Kept in RAM \(written 0 s ago\) and in the data folder \(written 0 s ago\)\.$/).length === 1 && !first.view().stopped, 'the same lines are in the log at the start; nothing on the Run tab (no start before this one)');
        const tW = fs.statSync(ramFile).mtimeMs;
        await advance(2100);
        ok(fs.statSync(ramFile).mtimeMs > tW && readBox(ramFile).lives[0].s >= 6, 'the copy in RAM is written again every 2 s');
        // 1. the car asks the app to stop
        first.settings.set('gps', true);
        await advance(2500);
        const saves0 = first.store.saves, log0 = first.logs.length;
        first.app.emit('shutdown');
        ok(first.store.saves === saves0 + 1 && fs.existsSync(path.join(first.dataDir, 'pps_drag.json')) && first.logs.slice(log0).some((l) => /^stopping: asked to stop by the car, the saved file is written$/.test(l)) && readBox(ramFile).lives[0].end === 'asked' && readBox(diskFile()).lives[0].end === 'asked',
            'the car asks the app to stop (the SDK\'s shutdown event): at that moment the saved file is written once, the log says so at once (it is not held back), and both copies of the record say "asked"');
        first.proc.exit(0);
        ok(readBox(ramFile).lives[0].end === 'asked' && readBox(ramFile).lives[0].code === 0, 'the exit code 0 that follows is added to it, the word "asked" stands');
        let car = await shipped(Object.assign({ dataDir: first.dataDir, tmpDir: first.tmpDir }, OWNER));
        await past(car);
        s = await screens(car, 'life-2-after-clean-stop');
        ok(find(s.signals, /^#2 now, started /).length === 1 && find(s.signals, /^#1 at \d\d\.\d\d\. \d\d:\d\d lived \d+ s, asked to stop by the car\.$/).length === 1 && find(s.signals, /^ +Last note of #1: memory \d+ MB \(most \d+\), .*armed, GPS on, set-up done, /).length === 1 && !has(s.run, 'The app stopped by itself last time. Please photograph the Signals tab.'),
            'the next start: "#1 ... lived ... asked to stop by the car." and under it "Last note of #1: ... armed, GPS on, set-up done ...". Nothing on the Run tab: that was no stop by itself');
        // 2. the app's own error
        await advance(4000);
        car.proc.uncaught(new Error('made up for the test: x is not a function\nat somewhere (file.js:1:1)'));
        car.proc.exit(1);
        ok(readBox(ramFile).lives[0].end === 'error' && readBox(ramFile).lives[0].code === 1 && readBox(ramFile).lives[0].err === 'Error: made up for the test: x is not a function', 'an uncaught error: its first line and the exit code 1 are in the record before the process is gone');
        car = await shipped(Object.assign({ dataDir: first.dataDir, tmpDir: first.tmpDir }, OWNER));
        await past(car);
        s = await screens(car, 'life-3-after-own-error');
        ok(find(s.signals, /^#2 at \d\d\.\d\d\. \d\d:\d\d lived \d+ s, THE APP'S OWN ERROR at file\.js:1 \(exit code 1\): Error: made up for the test: x is not a function\.$/).length === 1 && find(s.signals, /^ +Last note of #2: .*, armed, extras off, set-up done, Run tab, /).length === 1 &&
            has(s.run, 'The app stopped by itself last time. Please photograph the Signals tab.') && !has(s.run, 'Slip: 0-100 from first movement, distances after 1 ft'),
            'the next start: "#2 ... THE APP\'S OWN ERROR at file.js:1 (exit code 1): Error: made up for the test: x is not a function.", and for the first minute the Run tab says "The app stopped by itself last time. Please photograph the Signals tab." ' +
            '(CHANGED ON PURPOSE in the repair: where the error came from and the exit code stand before its text)');
        await advance(61000);
        ok(!has(await car.draw(), 'The app stopped by itself last time. Please photograph the Signals tab.') && has(await car.draw(), 'Slip: 0-100 from first movement, distances after 1 ft'), 'after a minute that line makes room for the clock-start line again');
        // 3. killed: no word at all
        car = await shipped(Object.assign({ dataDir: first.dataDir, tmpDir: first.tmpDir }, OWNER));
        await past(car);
        await advance(1000);
        s = await screens(car, 'life-4-after-no-word');
        ok(find(s.signals, /^#3 at \d\d\.\d\d\. \d\d:\d\d lived 1 min \d+ s, NO WORD \(killed or crashed\)\.$/).length === 1 &&
            find(s.signals, /^ +Last note of #3: memory \d+ MB \(most \d+\), processor \d+ % \(most \d+\), hold-up \d+ ms \(most \d+\), armed, extras off, set-up done, Run tab, \d+ frames\/s software, \d+ values\/s$/).length === 1 &&
            has(s.run, 'The app stopped by itself last time. Please photograph the Signals tab.') && car.logged(/^starts and stops: #3 at .* NO WORD \(killed or crashed\)\.$/).length === 1 && car.logged(/^starts and stops: +Last note of #3: memory .* armed, extras off, set-up done, Run tab, \d+ frames\/s software, \d+ values\/s$/).length === 1,
            'a start that just ends (the process killed, a crash in native code): the next start says "#3 ... lived 1 min ... NO WORD (killed or crashed)." and under it "Last note of #3: memory ..., processor ..., hold-up ..., armed, extras off, set-up done, Run tab, ... frames/s software, ... values/s", on the Signals tab and in the log, and the Run tab has its line');
        // 4. killed, and the data folder emptied (what the platform does after an unexpected exit)
        await advance(8000);
        fs.readdirSync(first.dataDir).forEach((f) => fs.unlinkSync(path.join(first.dataDir, f)));
        car = await shipped(Object.assign({ dataDir: first.dataDir, tmpDir: first.tmpDir }, OWNER));
        await past(car);
        s = await screens(car, 'life-5-after-wipe');
        ok(find(s.signals, /^#5 now, started /).length === 1 && find(s.signals, /^The saved data was emptied after #4 \(the data folder's copy of this record was gone at this start\)\.$/).length === 1 && find(s.signals, /^#4 at .* NO WORD \(killed or crashed\)\.$/).length === 1 &&
            find(s.signals, /^ +Last note of #4: /).length === 1 && find(s.signals, /^#2 at .* THE APP'S OWN ERROR at file\.js:1 \(exit code 1\): /).length === 1 && find(s.signals, /^#1 at .* asked to stop by the car\./).length === 1 && find(s.signals, /^#\d+ /).length === 5 && car.store.data.runs.length === 0,
            'killed, and the data folder emptied: the copy in RAM outlives it. "#5 now ...", "The saved data was emptied after #4 ...", "#4 ... NO WORD (killed or crashed)" with its last note under it, and #3, #2 and #1 are still listed (seven lines)');
        // 5. the head unit restarted: the RAM disk is empty, the data folder's copy is there
        await advance(70000);
        car = await shipped(Object.assign({ dataDir: first.dataDir }, OWNER));
        await past(car);
        s = await screens(car, 'life-6-after-head-unit-restart');
        ok(find(s.signals, /^#5 at .* lived at least 1 min( \d+ s)?, no word, and the head unit has restarted since \(power off also ends the app without a word\)\./).length === 1 && find(s.signals, /^ +Saved note of #5 \(up to a minute before its end\): memory /).length === 1 &&
            !has(s.run, 'The app stopped by itself last time. Please photograph the Signals tab.'),
            'the head unit restarted in between (its RAM disk is empty, the data folder has the record as it was a minute before the end at the latest): "#5 ... lived at least 1 min ..., no word, and the head unit has restarted since (power off also ends the app without a word)" with ' +
            '"Saved note of #5 (up to a minute before its end): ..." under it, and no line on the Run tab (CHANGED ON PURPOSE in the repair: WAS "lived 1 min" and "Last note", as if the data folder\'s copy were that life\'s last word)');
        const lives = car.logged(/^starts and stops: #\d+ /);
        ok(lives.length === 5 && /#6 now/.test(lives[0]) && /#2 at/.test(lives[4]) && readBox(path.join(car.dataDir, 'box.json')).lives.length === 5 && find(s.signals, /^#\d+ /).length >= 3, 'five lives are kept: #6 (now) to #2 are in the log of this start, the oldest has gone');
        // the record of another user id in the RAM folder (the app installed again runs as another user)
        const ram2 = fs.mkdtempSync(path.join(os.tmpdir(), 'pps-drag-ram-'));
        made.push(ram2);
        const other = path.join(ram2, 'pps-box-pps_drag-' + (uid + 7));
        fs.mkdirSync(other);
        fs.writeFileSync(path.join(other, 'box.json'), JSON.stringify({ v: 1, id: 'pps_drag', lives: [{ n: 41, at: '24.11. 23:58', wall: 1, up: 100, s: 24, end: '', uid: uid + 7, ram: 1, disk: 1, note: { rss: 58, rssMax: 60, cpu: 31, cpuMax: 44, lag: 85, lag10: 40, fps: 10, path: 'software', nps: 52, state: 'armed', tab: 'Run', setup: 'done', on: { gps: 1, wheels: 1 } } }] }));
        const fresh = await shipped(Object.assign({ tmpDir: ram2 }, OWNER));
        await past(fresh);
        s = await screens(fresh, 'life-after-reinstall', 3);
        ok(find(s.signals, /^#42 now, /).length === 1 && find(s.signals, new RegExp('^The lives before #42 are from the record of another user id \\(' + (uid + 7) + '\\): the app was installed again\\.$')).length === 1 &&
            find(s.signals, /^#41 at 24\.11\. 23:58 lived 24 s, NO WORD \(killed or crashed\)\.$/).length === 1 && find(s.signals, /^ +Last note of #41: memory 58 MB \(most 60\), processor 31 % \(most 44\), hold-up 40 ms \(most 85\), armed, GPS on, wheels on, set-up done, Run tab, 10 frames\/s software, 52 values\/s$/).length === 1 &&
            fs.readFileSync(path.join(other, 'box.json'), 'utf8').indexOf('"n":41') > 0 && fs.readdirSync(other).join() === 'box.json',
            'an empty data folder and, in RAM, the record of another user id (the app removed after its second unexpected exit and installed again): it is read, not written to, and the Signals tab says "#41 ... lived 24 s, NO WORD (killed or crashed). Last note: ... GPS on, wheels on ..." and that the app was installed again');
    });

    await ok.part('1.0.2 repair: the record is right at the moment a setting is switched, its lines are whole with the extras on, a signal and an exit code are told', async () => {
        const uid = process.getuid ? process.getuid() : 0;
        const readBox = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
        const ramOf = (c) => path.join(c.tmpDir, 'pps-box-pps_drag-' + uid, 'box.json');
        const LINE = 'The app stopped by itself last time. Please photograph the Signals tab.';
        // an extra is switched on while the app runs: the record says so before anything else happens
        let car = await shipped(Object.assign({ sets: { workshop: true } }, OWNER));
        await past(car);
        await advance(3000);
        const before = readBox(ramOf(car)).lives[0].note;
        car.settings.set('gps', true);
        const atOnce = readBox(ramOf(car)).lives[0].note, proxies = car.calls.filter((c) => c.type === 'watch' && /SatellitePositioning/.test(c.iface)).length;
        ok(before.on.gps === 0 && before.setup === 'done' && atOnce.on.gps === 1 && atOnce.setup === 'Vehicle2 CDS2 set up; SatellitePositioning asked' && proxies === 1,
            'REPAIR. "GPS speed scale" is switched on: in the same moment, with the proxy just asked for, the copy in RAM says GPS on and set-up "' + atOnce.setup + '". WAS: "extras off, set-up done" for up to 2 s, so a process that died right after the switch left a record that blamed nothing');
        await advance(300);
        const settled = readBox(ramOf(car)).lives[0].note;
        car.settings.set('askCar', true);
        const asks = readBox(ramOf(car)).lives[0].note;
        ok(settled.setup === 'done' && settled.on.gps === 1 && asks.on.ask === 1, 'a moment later the event is subscribed and the record says set-up "done" again, at once and not at the next 2 s note; "Ask the car for values" switched on is in the record at once too');
        // A SIGNAL THAT ENDS THE PROCESS. As shipped the app listens for none (the Workshop setting "Note stop signals" is off):
        const count = (c) => ['SIGTERM', 'SIGHUP', 'SIGINT'].map((x) => c.proc.listeners[x].length).join();
        const mine = () => ['SIGTERM', 'SIGHUP', 'SIGINT'].map((x) => process.listenerCount(x)).join();
        await advance(2000);
        const unheard = car.proc.signal('SIGTERM');           // (nobody of the app's is there to be called: a real process ends at once)
        ok(count(car) === '0,0,0' && mine() === '0,0,0' && unheard.removed === 0 && unheard.kill === null && readBox(ramOf(car)).lives[0].end === '' && readBox(ramOf(car)).lives[0].note.on.sig === 0,
            'CHANGED ON PURPOSE (was: the app listened as shipped). AS SHIPPED the app has put no listener on the process for SIGTERM, SIGHUP or SIGINT, with the other extras on or off: a signal finds nothing of the app\'s to call, and the record has no word for it');
        // the setting is switched on while the app runs: the listeners are there at once and the record says so at once
        car.proc.during(() => car.settings.set('xSignals', true));
        const sigNote = readBox(ramOf(car)).lives[0].note, countOn = count(car);
        await advance(4000);            // (the log is held back while the timer is armed: its line is written within a second or so)
        ok(countOn === '1,1,1' && mine() === '0,0,0' && sigNote.on.sig === 15 && sigNote.on.gps === 1 && car.logged(/^setting "Note stop signals": on, the record listens for SIGTERM, SIGHUP, SIGINT\. While it is on, such a signal does not end the app while the app hangs$/).length === 1,
            'NEW. "Note stop signals" is switched on (Workshop settings): one listener each for SIGTERM, SIGHUP and SIGINT is on the process in the same moment (caught here: the test\'s own process has none of them), the copy in RAM says so at once, and the log says what it costs');
        // a signal that ends the process: noted, the listener taken off, the same signal sent to the app's own process
        const sent = car.proc.signal('SIGTERM');
        ok(sent.removed === 1 && sent.kill && sent.kill[0] === process.pid && sent.kill[1] === 'SIGTERM' && readBox(ramOf(car)).lives[0].end === 'signal' && readBox(ramOf(car)).lives[0].sig === 'SIGTERM' && readBox(path.join(car.dataDir, 'box.json')).lives[0].end === 'signal' &&
            mine() === '0,0,0',
            'WITH THE SETTING ON. SIGTERM is sent to the app: both copies of the record say so at once, the app takes its listener off and sends the same signal to its own process (caught here: the test\'s own process has none of the app\'s listeners on it)');
        // (the next start has the setting on from the start, as the settings file would have it)
        let next = await shipped(Object.assign({ dataDir: car.dataDir, tmpDir: car.tmpDir, sets: { workshop: true, gps: true, askCar: true, xSignals: true } }, OWNER));
        await past(next);
        let s = await screens(next, 'repair-after-sigterm');
        // (the rows of the block "Starts and stops", top to bottom, as one text)
        const block = (x) => x.signals.filter((t) => t.y >= 110 && t.y <= 250 && t.x0 < 60).sort((a, b) => a.y - b.y).map((t) => t.s).join(' ').replace(/ +/g, ' ');
        ok(find(s.signals, /^#1 at \d\d\.\d\d\. \d\d:\d\d lived \d+ s, ENDED BY THE SIGNAL SIGTERM \(sent to the app from outside\)\.$/).length === 1 && / Last note of #1: .*GPS on, asks the car itself \(\d+ reads asked, \d+ answered\), notes stop signals,? set-up done, Run tab, /.test(block(s)) && has(s.run, LINE),
            'the next start: "' + (find(s.signals, /^#1 at /)[0] || { s: '' }).s + '" with its last note (GPS on, asks the car itself, notes stop signals), and the Run tab has its line (a signal alone, with no word from the car)');
        const nowRows = s.signals.filter((t) => t.y >= 110 && t.y <= 140 && t.x0 < 60).sort((a, b) => a.y - b.y).map((t) => t.s);
        ok(count(next) === '1,1,1' && mine() === '0,0,0' && nowRows.length === 2 && /^#2 now, started .* armed, GPS on, asks the car itself \(\d+ reads asked, \d+ answered\), notes stop signals,? set-up done, Signals tab, \d+ frames\/s software, \d+ values\/s$/.test(nowRows.join(' ').replace(/ +/g, ' ')),
            'NEW. With the setting on at a start the three listeners are on the process from the start, and the line of this life names it among what is on:\n        ' + nowRows.slice(0, 2).join('\n        '));
        // switched off again while the app runs: the listeners are gone at once
        next.proc.during(() => next.settings.set('xSignals', false));
        const offNote = readBox(ramOf(next)).lives[0].note, countOff = count(next);
        await advance(3000);
        ok(countOff === '0,0,0' && mine() === '0,0,0' && offNote.on.sig === 0 && next.logged(/^setting "Note stop signals": off, the app listens for no signal \(as shipped\): a signal ends it at once and leaves no word$/).length === 1,
            'NEW. Switched off again: the three listeners are taken off the process in the same moment, the copy in RAM says so at once, and everything is as shipped again');
        // an exit code other than 0 that nobody asked for
        next.proc.exit(3);
        next = await shipped(Object.assign({ dataDir: car.dataDir, tmpDir: car.tmpDir }, OWNER));
        await past(next);
        s = await screens(next, 'repair-after-exit-code');
        ok(find(s.signals, /^#2 at .* lived \d+ s, ended with exit code 3 and no word before it\.$/).length === 1 && has(s.run, LINE), 'REPAIR. A start that ended with exit code 3 and no word before it: the Signals tab says so, and the Run tab has its line too. WAS: an orange line on the Signals tab and nothing on the Run tab');
        // the car asks the app to stop and a signal comes with it, the setting on: a clean stop, and no line on the Run tab
        let asked = await shipped(Object.assign({ sets: { workshop: true, xSignals: true } }, OWNER));
        await past(asked);
        await advance(3000);
        asked.app.emit('shutdown');
        const then = asked.proc.signal('SIGTERM');
        const both = readBox(ramOf(asked)).lives[0];
        asked = await shipped(Object.assign({ dataDir: asked.dataDir, tmpDir: asked.tmpDir, sets: { workshop: true, xSignals: true } }, OWNER));
        await past(asked);
        s = await screens(asked, 'final-asked-and-signal');
        ok(both.end === 'asked' && both.sig === 'SIGTERM' && then.removed === 1 && then.kill && then.kill[1] === 'SIGTERM' && find(s.signals, /^#1 at .* lived \d+ s, asked to stop by the car \(the signal SIGTERM came too\)\.$/).length === 1 && !has(s.run, LINE) && has(s.run, 'READY'),
            'NEW (the last read\'s note). The setting on, the car asks the app to stop (the SDK\'s shutdown event) and SIGTERM follows: the record says "' + (find(s.signals, /^#1 at /)[0] || { s: '' }).s + '", the signal is still sent on to the process, and the Run tab does NOT say "' + LINE + '"');
        // every extra on: the lines are longer than a row, and run on into a second one
        car = await boot(Object.assign({ sets: { workshop: true } }, OWNER));
        await past(car);
        await advance(6000);
        car.proc.uncaught(new Error('made up for the test: x is not a function, and a very long tail of words so that the line is as long as an error text may be at all, one hundred and sixty characters\n    at Timeout.tick (/a/b/javascript/session.js:201:13)'));
        car.proc.exit(1);
        car = await boot(Object.assign({ dataDir: car.dataDir, tmpDir: car.tmpDir, sets: { workshop: true } }, OWNER));
        await past(car);
        await advance(5000);
        s = await screens(car, 'repair-extras-on-lines');
        const rows = s.signals.filter((t) => t.y >= 110 && t.y <= 250 && t.x0 < 60).sort((a, b) => a.y - b.y).map((t) => t.s);
        ok(rows.length === 6 && /^#2 now, started .*, armed, GPS on, wheels on, positions on, study signals on,$/.test(rows[0]) && /^ +asks the car itself \(\d+ reads asked, \d+ answered\), set-up done, Signals tab, \d+ frames\/s software, \d+ values\/s$/.test(rows[1]) &&
            /^#1 at .* lived \d+ s, THE APP'S OWN ERROR at session\.js:201 \(exit code 1\): Error: made up for the test: /.test(rows[2]) && /^ +one hundred and s\.\.\.$/.test(rows[3]) &&
            /^ +Last note of #1: memory .* asks the car itself \(\d+ reads asked, \d+ answered\),$/.test(rows[4]) && /^ +set-up done, Run tab, \d+ frames\/s software, \d+ values\/s$/.test(rows[5]),
            'REPAIR. With every extra on, the line of this life and the two lines of the life before each run on into a second row: the set-up, the tab and the two rates are on the screen, the exit code and the place of the error stand before its text, and the text itself is whole ' +
            '(160 characters are kept; CHANGED ON PURPOSE after the last read: a longer text now ends with "..." where it was cut, and not with a full stop as if the error had ended there). WAS: one row each, cut after "study signals on" and after the reads; a long error text cut the exit code off:\n        ' + rows.join('\n        '));
        // ... and with the newest switch on as well ("Note stop signals"): the line of this life still has its whole tail
        car = await boot(Object.assign({ dataDir: car.dataDir, tmpDir: car.tmpDir, sets: { workshop: true, xSignals: true } }, OWNER));
        await past(car);
        await advance(5000);
        s = await screens(car, 'final-everything-on-lines');
        const rows2 = s.signals.filter((t) => t.y >= 110 && t.y <= 140 && t.x0 < 60).sort((a, b) => a.y - b.y).map((t) => t.s);
        ok(rows2.length === 2 && /^#3 now, started .* armed, GPS on, wheels on, positions on, study signals on,? asks the car itself \(\d+ reads asked, \d+ answered\), notes stop signals,? set-up done, Signals tab, \d+ frames\/s software, \d+ values\/s$/.test(rows2.join(' ').replace(/ +/g, ' ')),
            'NEW. With every switch on, "Note stop signals" among them, the line of this life names it and still ends with the set-up, the tab and the two rates, in two rows:\n        ' + rows2.join('\n        '));
    });

    await ok.part('1.0.2, DATA GAP on a car like the first one, as shipped: flagged by the hole\'s length as in 1.0.1, whether notifications were lost or the speed only stood still; the words say which it looks like', async () => {
        // SINCE THE LAST READ OF 1.0.2 (CHANGES-drag.md part 13): the repair before it took the flag off a silence after
        // which the samples looked like a steady speed. A run with a lost second then showed a wrong 60 ft with no flag,
        // as a new best (the last check of this part pins it). The flag is back; the judging only chooses the words.
        /** A drive from a standstill. legs: [[seconds, km/h at its end]], straight lines between. o: phase (ms), car (boot options), mid: { at ms, fn(car) } -> { car, rec, best } */
        const total = (legs) => legs.reduce((x, l) => x + l[0], 0) * 1000;
        const go = async (legs, o) => {
            o = o || {};
            const car = await shipped(Object.assign({}, OWNER, o.car));
            await advance(2500);
            const t0 = clock.mono + 400 + (o.phase || 0);
            car.plan = (t) => { let x = (t - t0) / 1000, v = 0; if (x <= 0) return 0; for (const l of legs) { if (x <= l[0]) return v + (l[1] - v) * x / l[0]; x -= l[0]; v = l[1]; } return v; };
            if (o.mid) { await advance(t0 + o.mid.at - clock.mono); await o.mid.fn(car); }
            await advance(t0 + total(legs) + 9000 - clock.mono);
            return { car, rec: car.session.shown, best: Object.keys(car.session.newBest) };
        };
        const lost = (ms) => async (car) => { car.on.notifier = false; await advance(ms); car.on.notifier = true; };
        /** Flagged for the hole and for nothing else, and no best set. */
        const gapOnly = (r) => !!r.rec && r.rec.flags.join() === 'DATA GAP' && r.best.length === 0 && r.rec.sum.ended !== 'silent' && r.rec.sum.stallMs === 0;
        // the speed creeps, stands still to the last count, then the car pulls (or is braked) at once: no notification is missing
        const PULL = (hold) => [[6, 50], [3, 50.2], [hold, 50.2], [2.8, 70], [3, 40]], BRAKE = (hold) => [[6, 50], [3, 50.2], [hold, 50.2], [2.5, 32], [2, 20]];
        let runs = 0, timedAsHole = 0, flagged = 0, looks = 0, plainRuns = 0, plainClean = 0, shown = null;
        for (const hold of [0.5, 1.5]) for (const legs of [PULL(hold), BRAKE(hold)]) for (const phase of [0, 6, 12, 18]) {
            const r = await go(legs, { phase });
            runs++;
            if (r.rec && r.rec.sum.holeMs >= 300) {
                timedAsHole++;
                if (gapOnly(r)) flagged++;
                if (r.rec.sum.lostMs < 300) looks++;
                if (!shown && hold === 1.5) shown = r;
            } else { plainRuns++; if (r.rec && r.rec.flags.length === 0 && r.best.length > 0) plainClean++; }
        }
        ok(runs === 16 && timedAsHole >= 6 && flagged === timedAsHole && looks === timedAsHole && plainClean === plainRuns, 'CHANGED ON PURPOSE (was: "none carries a flag"). ' + runs + ' gentle pull-aways that hold a speed to the last count for 0.5 or 1.5 s and then pull or brake at once (2 m/s2): ' + timedAsHole +
            ' of them have a stretch the engine times as a hole (0.3 s or more), and each of those ' + flagged + ' is flagged DATA GAP and sets no best, as in 1.0.1, although no notification was missing: the app cannot know that. For all ' + looks +
            ' the samples after it look like a steady speed. The other ' + plainRuns + ' carry no flag and set a best');
        let s = await screens(shown.car, 'final-held-speed-timeslip', 1);
        const said = find(s.timeslip, /^nothing notified for \d\.\d s \(may be a steady speed\)/);
        ok(said.length === 1 && has(s.timeslip, 'DATA GAP') && has(s.timeslip, 'A flagged run sets no best time.') && !find(s.timeslip, /no gap/i).length &&
            shown.car.logged(/^run, notified .*HOLE of \d+ ms \(MAY BE A STEADY SPEED: the samples after it look like a speed that stood still and then moved on; lost notifications can look the same\)/).length === 1 &&
            shown.car.logged(/^run extras: .*flags: DATA GAP \| new best: none \(a flagged run sets no best\)/).length === 1,
            'CHANGED ON PURPOSE (was: "steady speed 1.6 s (no gap)", FLAGS none). Its Timeslip says "' + (said[0] || { s: '' }).s + '" under DATA, as a possibility and not as a fact, FLAGS "DATA GAP" with "A flagged run sets no best time.", and the log line of the run says "HOLE of ... (MAY BE A STEADY SPEED: ...)"');
        s = await screens(shown.car, 'final-held-speed-run', 0);
        ok(has(s.run, 'DATA GAP') && find(s.run, /^flagged: sets no best$/).length >= 1 && !has(s.run, 'NEW BEST'), 'and its Run tab: FLAGS "DATA GAP", "flagged: sets no best" under each time it reached, no NEW BEST');
        // The builder's own case with a wavering speed: a pull-away to 57 km/h, held for 2 s, then lifted. A speed that wavers
        // is notified now and then, and how long it had said nothing when the lift begins is chance: 8 runs, the lift at 8 moments
        let wav = 0, wavFlag = 0, wavRight = 0;
        const wavMs = [];
        let r = null;
        for (let k = 0; k < 8; k++) {
            r = await go([[8, 57], [2, 57], [5, 30]], { car: { ripple: 0.05 }, phase: k * 173 });
            const big = !!r.rec && r.rec.sum.holeMs >= 300;
            wav++; wavMs.push(r.rec ? r.rec.sum.holeMs : -1);
            if (big) wavFlag++;
            if (r.rec && (big ? gapOnly(r) && r.rec.sum.lostMs < 300 : r.rec.flags.length === 0 && r.best.length > 0)) wavRight++;
        }
        ok(wav === 8 && wavRight === 8, 'CHANGED ON PURPOSE (was: "no flag", one run). A pull-away to 57 km/h, held there for 2 s with the speed wavering by 0.05 km/h, then lifted, 8 runs with the lift at 8 different moments: the stretch before the lift that the engine times as a hole is ' +
            wavMs.join(', ') + ' ms long. Those of 0.3 s or more (' + wavFlag + ' of 8) are flagged DATA GAP, set no best and look like a steady speed; the others (' + (8 - wavFlag) + ' of 8) carry no flag and set a best. So on such a car a gentle run is flagged or not by chance: by how long the speed had said nothing when the driver next moved the pedal');
        // a cruise that wavers as a real car's speed does is not ended early: the run goes on to the 1/8 mile and beyond
        r = await go([[8, 57], [22, 57], [3, 20]], { car: { ripple: 0.05 } });
        ok(r.rec && r.rec.sum.ended !== 'silent' && r.rec.results.eighth && (r.rec.sum.holeMs >= 300 ? gapOnly(r) : r.rec.flags.length === 0), 'the same pull-away held at 57 km/h for 22 s, wavering by 0.05 km/h: the run goes on (ended by "' + (r.rec && r.rec.sum.ended) + '", 1/8 mile timed; longest stretch timed as a hole ' +
            (r.rec && r.rec.sum.holeMs) + ' ms, flags: ' + (r.rec && r.rec.flags.join(', ') || 'none') + '). Only a speed that says nothing at all for 3 s ends a run (the check marked NOT SOLVED above)');
        // TRUE holes: notifications lost while the speed changes, in a gentle pull-away and at full throttle
        const GENTLE = [[12, 65], [6, 80], [5, 40]];
        const out = [];
        let seen = 0;
        for (const ms of [300, 400, 1000]) {
            r = await go(GENTLE, { mid: { at: 4000, fn: lost(ms) } });
            if (gapOnly(r) && r.rec.sum.lostMs >= ms && r.rec.sum.lostMs === r.rec.sum.holeMs) seen++;
            out.push('gentle, ' + ms + ' ms lost: hole ' + (r.rec && r.rec.sum.holeMs) + ' ms');
            const car = await shipped(OWNER);
            const f = await launch(car, FULL, { lift: true, mid: { at: 2000, fn: () => lost(ms)(car) } });
            if (f.rec && f.rec.flags.join() === 'DATA GAP' && Object.keys(car.session.newBest).length === 0 && f.rec.sum.lostMs >= ms && f.rec.sum.lostMs === f.rec.sum.holeMs) seen++;
            out.push('full throttle, ' + ms + ' ms lost: hole ' + (f.rec && f.rec.sum.holeMs) + ' ms');
        }
        ok(seen === 6, 'notifications lost for 0.3, 0.4 and 1 s while the speed changes, in a gentle pull-away (1.5 m/s2) and at full throttle: all ' + seen + ' of 6 are flagged DATA GAP and set no best, and the samples after none of them look like a steady speed (' + out.join('; ') + ')');
        // both: the speed stands still for a second, and then the first 0.4 s of the pull are lost
        r = await go([[8, 57], [1, 57], [3, 78.6], [3, 40]], { mid: { at: 9000, fn: lost(400) } });
        ok(gapOnly(r) && r.rec.sum.lostMs >= 1300, 'a speed held for 1 s and then the first 0.4 s of the pull lost: DATA GAP, a hole of ' + (r.rec && r.rec.sum.holeMs) + ' ms (the standstill before it counts with it: nothing says where the silence turned into a loss), and it does not look like a steady speed');
        // The app itself held up for 0.4 s in a gentle pull-away: its tick comes that late. (Here both clocks are simply put
        // on by 0.4 s, which holds the stand-in car's own senders up as well: the samples around it then arrive as no car
        // sends them, and the engine may end the run there with a flag of its own. What is looked at is the app's flag.)
        r = await go(GENTLE, { mid: { at: 5000, fn: async () => { clock.mono += 400; clock.wall += 400; } } });
        ok(r.rec && r.rec.flags.indexOf('DATA GAP') >= 0 && r.rec.sum.stallMs >= 400 && r.rec.sum.stallMs <= 460 && r.rec.sum.holeMs < 300, 'the app itself held up for 0.4 s during a gentle pull-away: DATA GAP, "app held up ' + (r.rec && r.rec.sum.stallMs) +
            ' ms", with no hole of 0.3 s in the samples at all (that flag does not go by the samples: the app\'s own 50 ms tick came that late)');
        // ... and held up while the speed stood still: nothing of the car's was missed, but the app cannot know that
        r = await go([[8, 57], [2, 57], [4, 70], [3, 40]], { mid: { at: 8600, fn: async () => { clock.mono += 400; clock.wall += 400; } } });
        ok(r.rec && r.rec.flags.join() === 'DATA GAP' && r.rec.sum.stallMs >= 400, 'held up for 0.4 s while the speed stood still: still DATA GAP (the app was not looking for 0.4 s, whatever the car did meanwhile)');
        // the +- of a run with such a stretch has the stretch in it
        const held = shown.rec, plain = (await go(PULL(0), { phase: 6 })).rec;
        ok(held.results['330ft'] && plain.results['330ft'] && held.results['330ft'].pm >= plain.results['330ft'].pm, 'the ± of a split after such a stretch is not smaller than that of the same pull-away without the hold (330 ft: ±' + held.results['330ft'].pm.toFixed(2) + ' s against ±' + plain.results['330ft'].pm.toFixed(2) +
            ' s): the stretch is timed as a hole (test_drag.js compares every time and every ± of 300 drives with and without the judging)');

        // THE LOST SECOND of the last read (checks/fix1-drag-last/app/caseF.js), on the whole app as shipped: roll away gently,
        // the speed goes up 5 km/h and back within one second (4.0 to 5.0 s) and ITS NOTIFICATIONS ARE LOST, then full throttle.
        const CASE_F = [[3, 18], [1, 18.3], [0.5, 23.3], [0.5, 18.6], [6, 18.6 + 7 * 3.6 * 6], [3, 100], [6, 0], [10, 0]];
        const whole = await go(CASE_F), f = await go(CASE_F, { mid: { at: 4000, fn: lost(1000) } });
        const off = whole.rec && f.rec && whole.rec.results['60ft'] && f.rec.results['60ft'] ? f.rec.results['60ft'].s - whole.rec.results['60ft'].s : NaN;
        s = await screens(f.car, 'final-lost-second-timeslip', 1);
        const saidF = find(s.timeslip, /^nothing notified for 1\.\d s \(may be a steady speed\)/);
        ok(whole.rec && whole.rec.flags.length === 0 && whole.best.indexOf('60ft') >= 0 && gapOnly(f) && f.rec.sum.holeMs >= 1000 && f.rec.sum.lostMs === 0 && off > 0.08 && off < 0.13 && off > f.rec.results['60ft'].pm &&
            saidF.length === 1 && has(s.timeslip, 'DATA GAP') && has(s.timeslip, 'A flagged run sets no best time.') && !find(s.timeslip, /no gap/i).length,
            'THE LOST SECOND (pinned: the run the last read of 1.0.2 found). With every notification: 60 ft ' + (whole.rec ? whole.rec.results['60ft'].s.toFixed(2) : '?') + ' s, no flag, a best. With one second of notifications lost: 60 ft ' +
            (f.rec ? f.rec.results['60ft'].s.toFixed(2) + ' s ± ' + f.rec.results['60ft'].pm.toFixed(2) : '?') + ', off by ' + off.toFixed(3) + ' s, more than the ± shown. It carries ' + (f.rec ? f.rec.flags.join(', ') : 'no run') + ' and sets no best (' + f.best.length +
            '); the Timeslip says "' + (saidF[0] || { s: '' }).s + '" (a hole of ' + (f.rec && f.rec.sum.holeMs) + ' ms that looks like a steady speed and was none). WAS, in the repair: flags none, NEW BEST for 0-100, 60 ft and 330 ft, "steady speed 1.1 s (no gap)"');
        s = await screens(f.car, 'final-lost-second-run', 0);
        ok(has(s.run, 'DATA GAP') && !has(s.run, 'NEW BEST') && find(s.run, /^flagged: sets no best$/).length >= 2, 'and its Run tab: FLAGS "DATA GAP", no NEW BEST, "flagged: sets no best" under the times');
    });

    await ok.part('1.0.2: a broken, huge, planted or linked file where the record is kept in RAM never stops the app and puts no odd text on the screen', async () => {
        const uid = process.getuid ? process.getuid() : 0, name = 'pps-box-pps_drag-' + uid;
        const mk = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pps-drag-ram-')); made.push(d); return d; };
        const one = async (title, prepare, check) => {
            const tmpDir = mk();
            const extra = prepare(tmpDir, path.join(tmpDir, name)) || {};
            const car = await shipped(Object.assign({ tmpDir }, OWNER));
            await past(car);
            await advance(4500);
            const s = await screens(car, 'ram-' + title.replace(/[^a-z]+/g, '-').slice(0, 24), 3);
            const texts = words(s.signals), odd = texts.filter((x) => /[^\x20-\x7e·]/.test(x)), r = await launch(car, FULL, { stand: 0, lift: true });
            ok(odd.length === 0 && r.rec && worst(r.rec, r.ans) <= 0.02 && find(s.signals, /^#\d+ now, started /).length === 1 && check(s.signals, car, extra),
                title + (odd.length ? ' (ODD TEXT: ' + JSON.stringify(odd[0]) + ')' : ''));
            return car;
        };
        const lifeLines = (t) => find(t, /^#\d+ /);
        await one('a file cut off in the middle: the app starts at #1 and writes a whole one over it', (tmp, dir) => { fs.mkdirSync(dir, 0o755); fs.writeFileSync(path.join(dir, 'box.json'), '{"v":1,"lives":[{"n":7,"at":"25.11. 0'); },
            (t, car) => lifeLines(t).length === 1 && /^#1 now/.test(lifeLines(t)[0].s) && JSON.parse(fs.readFileSync(path.join(car.tmpDir, name, 'box.json'), 'utf8')).lives[0].n === 1);
        await one('a file of 5 MB: not read as a record', (tmp, dir) => { fs.mkdirSync(dir, 0o755); fs.writeFileSync(path.join(dir, 'box.json'), '{"v":1,"lives":[{"n":7}],"pad":"' + 'x'.repeat(5 * 1024 * 1024) + '"}'); },
            (t) => lifeLines(t).length === 1 && /^#1 now/.test(lifeLines(t)[0].s));
        await one('a list nested 30,000 deep, and a file of binary rubbish', (tmp, dir) => { fs.mkdirSync(dir, 0o755); fs.writeFileSync(path.join(dir, 'box.json'), '['.repeat(30000)); fs.writeFileSync(path.join(tmp, 'pps-box-pps_drag-' + (uid + 3)), Buffer.from([0, 255, 1, 254, 10, 13, 27])); },
            (t) => lifeLines(t).length === 1);
        await one('a planted record that parses and is under 64 KB: 300 lives, numbers out of every bound, control characters and another alphabet in every text', (tmp, dir) => {
            fs.mkdirSync(dir, 0o755);
            const evil = '\u0007\u001b[31m' + '\u202e' + 'DROP' + '\n' + 'Ж'.repeat(40) + '\u0000' + 'x'.repeat(300);
            const life = (n) => ({ n, at: evil, wall: 1e99, up: -5, s: 1e99, end: evil, code: 1e9, err: evil, uid: 'root', ram: 'yes', disk: 7, gone: 1, from: -1,
                note: { rss: 1e12, rssMax: -3, cpu: 'x', cpuMax: 1e9, lag: 1e99, lag10: null, fps: {}, nps: [], asked: 'NaN', answered: -1, path: evil, tab: evil, state: evil, setup: evil, on: { gps: 'on', wheels: 99, ask: -1, constructor: 1 } } });
            const lives = [life(77), { n: 76, at: '<b>25.11.</b>', s: 12, end: 'error', err: 'ok "quoted" \\ and \u2028 a line separator', note: {} }];
            for (let i = 0; i < 300; i++) lives.push(i % 3 === 0 ? null : i % 3 === 1 ? 'life' : i % 30 === 2 ? life(900000 - i) : { n: 1e12 });
            const text = JSON.stringify({ v: 1, lives }).replace('"n":76', '"__proto__":{"n":9},"constructor":7,"n":76');
            fs.writeFileSync(path.join(dir, 'box.json'), text);
            return { ok: JSON.parse(text).lives.length === 302 && text.length < 64000 };
        }, (t, car, x) => {
            const L = lifeLines(t), all = words(t).join(' ');
            // (of 300 planted lives the three that are lives at all among the first twenty are taken: 5 at most. Their numbers are inside
            // their bounds, their texts cut short and stripped to printable ASCII: "[31mDROPxxxx" is what is left of the escape sequence)
            return x.ok && L.length === 4 && /^#899999 now/.test(L[0].s) && /^#899998 at \[31mDROPx+ lived 0 s, NO WORD/.test(L[1].s) && /^#77 at /.test(L[2].s) && L.every((l) => l.s.length < 420) && all.indexOf('DROP') >= 0 && all.indexOf('Ж') < 0 &&
                !/[\u0000-\u001f\u007f-\uffff]/.test(all.replace(/·/g, '')) && find(t, /Last note of #899998: memory 0 MB \(most 0\), processor 0 % \(most 0\), hold-up 0 ms \(most 0\), \[31mDROP, extras off/).length === 1 &&
                find(t, /^#76 at <b>25\.11\.<\/b> lived 12 s, THE APP'S OWN ERROR: ok "quoted" \\ and  a line separator\./).length === 1;
        });
        await one('the file is a symbolic link to another file: not followed for reading; the write puts a real file in its place and leaves the target alone', (tmp, dir) => {
            fs.mkdirSync(dir, 0o755);
            const target = path.join(tmp, 'elsewhere.json'), was = JSON.stringify({ v: 1, lives: [{ n: 500, at: 'planted', s: 9, end: 'asked', note: {} }] });
            fs.writeFileSync(target, was); fs.symlinkSync(target, path.join(dir, 'box.json'));
            return { target, was };
        }, (t, car, x) => lifeLines(t).length === 1 && /^#1 now/.test(lifeLines(t)[0].s) && fs.readFileSync(x.target, 'utf8') === x.was && !fs.lstatSync(path.join(car.tmpDir, name, 'box.json')).isSymbolicLink());
        await one('the folder is a symbolic link to another folder: nothing is written through it, the app runs on with the copy in the data folder alone', (tmp, dir) => {
            const target = path.join(tmp, 'somewhere-else'); fs.mkdirSync(target); fs.symlinkSync(target, dir);
            return { target };
        }, (t, car, x) => fs.readdirSync(x.target).length === 0 && find(t, /^Kept in RAM \(NOT WRITTEN: .*pps-box-pps_drag-\d+ is not a real folder\) and in the data folder \(written \d+ s ago\)\.$/).length === 1 && fs.existsSync(path.join(car.dataDir, 'box.json')));
        await one('a plain file where the folder should be', (tmp, dir) => { fs.writeFileSync(dir, 'not a folder'); },
            (t, car) => find(t, /^Kept in RAM \(NOT WRITTEN: .* is not a real folder\) and in the data folder \(written \d+ s ago\)\.$/).length === 1 && fs.readFileSync(path.join(car.tmpDir, name), 'utf8') === 'not a folder');
        await one('a pipe where the file should be: reading does not wait on it', (tmp, dir) => { fs.mkdirSync(dir, 0o755); require('child_process').execFileSync('mkfifo', [path.join(dir, 'box.json')]); },
            (t) => lifeLines(t).length === 1 && /^#1 now/.test(lifeLines(t)[0].s));
        // a RAM folder that cannot be written at all, and a data folder that cannot either: the app still runs
        const tmpDir = mk(), dataDir = mk();
        fs.chmodSync(tmpDir, 0o555); fs.chmodSync(dataDir, 0o555);
        let car;
        try {
            car = await shipped(Object.assign({ tmpDir, dataDir }, OWNER));
            await past(car);
            await advance(4500);
            const s = await screens(car, 'ram-and-disk-not-writable', 3), r = await launch(car, FULL, { stand: 0, lift: true });
            ok(r.rec && worst(r.rec, r.ans) <= 0.02 && find(s.signals, /^Kept in RAM \(NOT WRITTEN: .*\) and in the data folder \(NOT WRITTEN: .*\)\.$/).length === 1 && find(s.signals, /^#1 now, /).length === 1,
                'neither place can be written: the app runs, times a run, and the Signals tab says the record is NOT WRITTEN in either');
        } finally { fs.chmodSync(tmpDir, 0o755); fs.chmodSync(dataDir, 0o755); }
        ok(bench.mishaps().length === 0, 'in all of these no handler threw and the app logged no error' + (bench.mishaps().length ? ': ' + bench.mishaps().slice(0, 2).join(' | ') : ''));
    });

    await ok.part('1.0.2: no page changes for its own sake. A standing car at READY is one picture, not a new one for every frame', async () => {
        const car = await shipped(Object.assign({}, OWNER, { accelNoise: false }));
        await past(car);
        await advance(3000);
        const seen = {};
        let n = 0;
        for (let i = 0; i < 100; i++) { await car.draw(); seen[car.frameWords()] = true; n++; await advance(100); }
        ok(car.view().state === 'ready' && Object.keys(seen).length === 1, 'READY with nothing changing, ' + n + ' frames over 10 s: ' + Object.keys(seen).length + ' different picture. The kit does not send a frame that is the same as the one before (WAS: the banner pulsed with the clock, every frame was a new picture: ' +
            'up to 60 a second to the GPU renderer, 10 PNG files a second without it)');
        for (let p = 1; p < 5; p++) {
            await car.page(p);
            const pics = {};
            for (let i = 0; i < 40; i++) { await car.draw(); pics[car.frameWords()] = true; await advance(50); }
            const per = Object.keys(pics).length / 2;
            ok(per <= (p >= 3 ? 4.5 : 0.5), 'the ' + PAGES[p] + ' page of the standing car, 40 frames over 2 s: ' + Object.keys(pics).length + ' different pictures' + (p >= 3 ? ' (its figures are taken four times a second at most; the seconds in "written N s ago" and the samples counted move)' : ''));
        }
        await car.page(0);
        // the first screen: the logo, the fade, then still
        const fresh = await shipped(Object.assign({}, OWNER, { accelNoise: false }));
        const logo = {}, fade = {}, after = {};
        for (let i = 0; i < 13; i++) { await fresh.draw(); logo[fresh.frameWords()] = true; await advance(100); }
        for (let i = 0; i < 10; i++) { await fresh.draw(); fade[fresh.frameWords()] = true; await advance(50); }
        await advance(1500);
        for (let i = 0; i < 20; i++) { await fresh.draw(); after[fresh.frameWords()] = true; await advance(100); }
        ok(Object.keys(logo).length === 1 && Object.keys(fade).length >= 5 && Object.keys(after).length === 1, 'the first screen: the logo is one picture for 1.3 s, the page fades in over 0.45 s (' + Object.keys(fade).length + ' pictures), and then it stands still');
        // TIMING is allowed to move: the clock runs
        const r = await launch(fresh, FULL, { stand: 0, lift: true, mid: { at: 2000, fn: async () => { const a = {}; for (let i = 0; i < 10; i++) { await fresh.draw(); a[fresh.frameWords()] = true; await advance(100); } fresh.moving = Object.keys(a).length; } } });
        ok(r.rec && fresh.moving === 10, 'while a run is timed every frame is a new picture, as it should be (the clock and the speed move)');
    });

    /* ================= read only, and no position anywhere ================= */
    await ok.part('nothing but reads leaves the app; no position in the log or the saved file', async () => {
        const calls = bench.allCalls(), types = {};
        calls.forEach((c) => { const k = c.type + (c.type === 'getValue' ? ' ' + c.iface + '.' + c.field : c.type === 'on' ? ' ' + c.iface + '.' + c.event : ''); types[k] = (types[k] || 0) + 1; });
        const kinds = Object.keys(types).sort().join(', ');
        ok(bench.allForbidden().length === 0, 'in all ' + bench.cars.length + ' starts of the app above, with ' + calls.length + ' calls to the car\'s signals: not one set, method call, proxy of its own or diagnostic request' +
            (bench.allForbidden().length ? ': ' + JSON.stringify(bench.allForbidden().slice(0, 3)) : ''));
        ok(kinds === 'getValue CDS2.statusLongitudinalAccelerationMassCenter, getValue Vehicle2.statusCarSpeed2, on SatellitePositioning.updatePosition, watch', 'what left the app: subscriptions (watch), reads of two getters, one event subscription (' + kinds + ')');
        const watched = {};
        // (of the starts with every extra switched on: as shipped the app asks for two of them, see the parts "1.0.2")
        [].concat.apply([], bench.cars.filter((c) => c.allOn).map((c) => c.calls)).filter((c) => c.type === 'watch').forEach((c) => { watched[c.iface + '@' + c.instance] = c.fields.join(','); });
        ok(JSON.stringify(watched) === JSON.stringify({
            'Vehicle2@1': 'statusCarSpeed2,statusWheeltravel,statusWheeltravelRear', 'CDS2@1': 'statusLongitudinalAccelerationMassCenter', 'Powertrain@1': 'ActualValueRPMWheel',
            'GPSData@1': 'GPSPositionCAN,GPSPositionExtendedCAN', 'Positioning@Main_Instance': 'currentLocation', 'VehicleModel@1': 'LaneSlope', 'SatellitePositioning@1': '',
        }), 'the subscriptions are the seven interfaces of app.json with their fields, the navigation\'s at instance Main_Instance');
        // the app's own files: nothing in them could write or diagnose
        const own = fs.readdirSync(JS).filter((f) => /\.js$/.test(f) && f !== 'logo-data.js');
        const src = {};
        own.forEach((f) => { src[f] = fs.readFileSync(path.join(JS, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''); });
        const bad = own.filter((f) => /signals\.(set|call|proxy)\b|\.setValue\s*\(|\.callMethod\s*\(|kit\/(diag|readonly-diag|dids|ecus|sgbd)|tasu|\buds\b/i.test(src[f]));
        ok(own.length === 16 && bad.length === 0, 'the app\'s ' + own.length + ' own files (16 since 1.0.2: box.js, the record of starts and stops, is new) hold no signals.set, signals.call, signals.proxy, setValue, callMethod, and load nothing of the kit\'s diagnostics' + (bad.length ? ': ' + bad.join(', ') : ''));
        const timing = ['app.js', 'car.js', 'session.js', 'screens.js', 'store.js', 'demo.js', 'box.js'].map((f) => [f, (src[f].match(/Date\.now\(\)|new Date\(/g) || []).length]);
        ok(JSON.stringify(timing) === JSON.stringify([['app.js', 1], ['car.js', 0], ['session.js', 1], ['screens.js', 1], ['store.js', 0], ['demo.js', 0], ['box.js', 1]]),
            'the wall clock is read in four places only: app.js hands Date.now to the session and to the record as "wall", session.js falls back to it, screens.js turns a saved date into text, and (new in 1.0.2) box.js turns the time a life of the app started at into text. Nothing that times a run reads it');
        ok(own.every((f) => fs.readFileSync(path.join(JS, f), 'utf8').indexOf(String.fromCharCode(8212)) < 0), 'no em dash in any of them');
        // positions: the stand-in car drove east from 67.9123 N, 144.9631 E
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
            (text.match(/\b\d{10}\b/g) || []).forEach((tok) => { if (near((Number(tok) - 2147483648) / 3600000)) leaks.push(where + ': ' + tok); });
            if (/\$GP|nmeaString|latitude"?\s*:\s*-?\d|longitude"?\s*:\s*-?\d/i.test(text)) leaks.push(where + ': a sentence or a coordinate member');
        };
        let lines = 0, files = 0;
        // (the data folder, and since 1.0.2 the stand-in for the head unit's RAM disk: the record of starts and stops has a copy in each)
        const readAll = (dir) => { try { fs.readdirSync(dir).forEach((f) => { const x = path.join(dir, f), st = fs.lstatSync(x); if (st.isDirectory()) readAll(x); else if (st.isFile()) { files++; scan(f, fs.readFileSync(x, 'utf8')); } }); } catch (e) { /* no folder */ } };
        bench.cars.forEach((c, i) => {
            c.logs.forEach((l) => { lines++; scan('log of start ' + (i + 1), l.replace(/^raw GPS sentences #\d+: (\$GP[A-Z]{3} ?)+;/, '')); });
            readAll(c.dataDir); readAll(c.tmpDir);
        });
        ok(n > 5000 && lonMax > bench.LON0 + 0.15, '(the stand-in cars sent ' + n + ' positions, from longitude ' + bench.LON0 + ' to ' + lonMax.toFixed(2) + ')');
        ok(leaks.length === 0, lines + ' log lines and ' + files + ' files in the data folders: not one number that is a latitude or longitude the car sent, in degrees, in the receiver\'s form or raw' + (leaks.length ? ': ' + leaks.slice(0, 4).join(' | ') : ''));
        // (and the check itself would find one)
        const probe = [];
        const scanProbe = (text) => { (text.match(/-?\d+\.\d{3,}/g) || []).forEach((tok) => { const x = Math.abs(Number(tok)), deg = x > 1000 ? Math.floor(x / 100) + (x % 100) / 60 : x; if (near(deg)) probe.push(tok); }); (text.match(/\b\d{10}\b/g) || []).forEach((tok) => { if (near((Number(tok) - 2147483648) / 3600000)) probe.push(tok); }); };
        ['lat 67.91230001', '$GPRMC,090000.00,A,6754.7380,N,14457.7860,E', 'raw 2391967928', '{"longitude":144.98765}'].forEach(scanProbe);
        ok(probe.length === 5, '(the same search finds a position written in each of those forms: ' + probe.join(', ') + ')');
    });

    ok(bench.mishaps().length === 0, 'in all these drives the app logged no error, no frame threw' + (bench.mishaps().length ? ': ' + bench.mishaps().slice(0, 3).join(' | ') : ''));
    ok(frames >= 300, frames + ' frames were drawn and checked in ' + Object.keys(drawn).length + ' states' + (OUT ? ', pictures of the PC-size ones are in ' + OUT : ''));
    ok.done();
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
