'use strict';
/**
 * test_screens.js <built app: dist/pps_gauges> [folder for pictures] - draws the five gauge sets with the app's own
 * main.js, on the kit's PC stand-in for the head unit (kit/tools/hu-stub.js) and a stand-in car (fakecar.js), in
 * states the demo drive never shows: nothing from the car, a car without a gear signal, a unit that does not
 * answer, the ethanol read-out with and without a reading, units the car never named. It records every text
 * drawn (the cached parts of dials and panels included) and checks, for every state and set:
 *   - the frame draws without an error
 *   - every character has a glyph in its font at the sizes of the PC picture, iDrive 7 and iDrive 8 full screen
 *     (the big number font has digits and a few letters only: a missing letter is dropped without a mark)
 *   - no two texts lie on top of each other, and none leaves the screen
 * and what particular faults were about (gauges-B7, B11, B12, B13, B16, the "Chart max" figure, ethanol).
 * With a folder as second argument it also saves a picture of each state (the kit's software renderer).
 * A PC check: it shows that the drawing code runs and where the texts land, not what a head unit shows.
 */
const fs = require('fs'), path = require('path');
const { clock, makeCar, healthy, mhdUnit, checker } = require('./fakecar');
const { headUnit } = require('../../kit/tools/hu-stub');
const APP = path.resolve(process.argv[2]), OUT = process.argv[3] ? path.resolve(process.argv[3]) : null;
const js = path.join(APP, 'source', 'javascript');
const ok = checker();
const W = 1600, PAGES = ['street', 'track', 'boost', 'thermal', 'tyres'];
// text scale of the kit's full-screen layout: 1 on the PC, about 1.16 on iDrive 7 and 1.42 on iDrive 8 (kit/runtime/display.js; not measured on a car)
const SCALES = [1, 1.16, 1.42];

/* ---------- every text drawn is noted, on the frame and in the cached layers it is made of ---------- */
const rec = require(path.join(js, 'kit', 'record')), fonts = require(path.join(js, 'kit', 'fonts'));
const R = rec.Recorder, text0 = R.prototype.text, blit0 = R.prototype.blit, reset0 = R.prototype.reset, rrect0 = R.prototype.roundRect, make0 = rec.makeLayer;
R.prototype.text = function (str, x, y, size, c, opts) {
    const w = text0.apply(this, arguments), al = (opts && opts.align) || 'left';
    (this._texts || (this._texts = [])).push({ s: String(str), x0: al === 'center' ? x - w / 2 : al === 'right' ? x - w : x, y, size, w, font: (opts && opts.font) || 'label' });
    return w;
};
// (and every rounded box, for the colour of the four tyres on the Tyres set)
R.prototype.roundRect = function (x, y, w, h, r, c) { (this._boxes || (this._boxes = [])).push({ x, y, w, h, c: String(c) }); return rrect0.apply(this, arguments); };
R.prototype.reset = function () { this._texts = []; this._boxes = []; return reset0.apply(this, arguments); };
R.prototype.blit = function (L, x, y) {
    (L._texts || []).forEach((t) => (this._texts || (this._texts = [])).push(Object.assign({}, t, { x0: t.x0 + Math.round(x), y: t.y + Math.round(y), layer: true })));
    return blit0.apply(this, arguments);
};
rec.makeLayer = function (w, h, draw, ts) { let texts = []; const L = make0(w, h, (r) => { draw(r); texts = r._texts || []; }, ts); L._texts = texts; return L; };

/** The app on a stand-in car. opts: fakecar's, and full: px of room under the page (the kit running the screen itself, as with the GPU renderer). */
async function open(opts) {
    opts = opts || {};
    clock.reset();
    const car = makeCar(APP, opts);
    let png = null, frame = null, wantPng = false, n = 0;
    const log = { info: (m) => car.logs.push('info ' + m), warn: (m) => car.logs.push('WARN ' + m), error: (m) => car.logs.push('ERROR ' + (m && m.stack || m)), debug() {} };
    const quiet = console.log; console.log = () => {};          // (the stand-in head unit says which screen it opens)
    const hu = headUnit(APP, { dataDir: car.ctx.dataDir, fresh: true, log, sets: Object.assign({ demo: 'off', splash: false }, opts.settings), image: async (name, cv) => { png = cv; } });
    hu.ctx.signals = car.ctx.signals;
    const canvas = hu.ctx.canvas, image = hu.ui.image;
    hu.ctx.canvas = (w, h) => { const cv = frame = canvas(w, h); if (opts.full) { cv.own = true; cv._extra = opts.full; cv.chrome = { tabs: null }; } return cv; };
    hu.ui.image = (name, cv) => (wantPng ? image(name, cv) : Promise.resolve());
    delete require.cache[path.join(js, 'app.js')];               // the app starts anew for every car
    hu.start();
    await clock.advance(10);
    console.log = quiet;
    car.page = (name) => hu.display.onTab(PAGES.indexOf(name));
    /** Draw one frame: the texts on it. */
    car.draw = async () => { await hu.loopFn(); car.boxes = (frame._boxes || []).slice(); return (frame._texts || []).slice(); };
    /** Drive for secs, a frame every 16 ms; feed(n) sends the car's signals. */
    car.drive = async (secs, feed) => { for (let t = 0; t < secs * 1000; t += 16) { if (feed) feed(n); n++; await hu.loopFn(); await clock.advance(16); } };
    car.save = async (name) => {
        if (!OUT) return;
        wantPng = true; png = null; await hu.loopFn(); wantPng = false;
        if (png) { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.isBuffer(png) ? png : png.png()); }
    };
    return car;
}

/* ---------- what holds for every frame ---------- */
const box = (t) => ({ x0: t.x0 + 1, x1: t.x0 + t.w - 1, y0: t.y - t.size * 0.70, y1: t.y });
function faults(texts) {
    const out = [];
    texts.forEach((t) => {
        if (!t.s.trim()) return;
        SCALES.forEach((sc) => {
            const f = fonts.get(t.font, t.size * sc, t.s);
            const miss = f ? Array.from(t.s).filter((ch) => ch !== ' ' && !f.glyphs[ch.codePointAt(0)]) : Array.from(t.s);
            if (miss.length) out.push('"' + t.s + '" (' + t.font + ' ' + t.size + ' px, scale ' + sc + ') has no glyph for "' + miss.join('') + '"');
        });
        if (t.w > 0 && (t.x0 < -0.5 || t.x0 + t.w > W + 0.5)) out.push('"' + t.s + '" leaves the screen (' + Math.round(t.x0) + ' to ' + Math.round(t.x0 + t.w) + ')');
    });
    const live = texts.filter((t) => t.s.trim() && t.w > 0);
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
        const a = box(live[i]), b = box(live[j]);
        if (a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1) out.push('"' + live[i].s + '" and "' + live[j].s + '" overlap at ' + Math.round(Math.max(a.x0, b.x0)) + ',' + Math.round(Math.max(a.y0, b.y0)));
    }
    return out;
}
/** Every set of one car: drawn, checked, saved. Returns { set: texts }. */
async function sets(car, name, feed, secs) {
    const all = {}, bad = [];
    for (const p of PAGES) {
        await car.page(p);
        await car.drive(secs || 1, feed);
        all[p] = await car.draw();
        faults(all[p]).forEach((f) => bad.push(p + ': ' + f));
        await car.save(name + '-' + p);
    }
    const errors = car.logs.filter((l) => /^ERROR|^WARN (history|boost trace|first render|engine unit poll)/.test(l));
    ok(bad.length === 0 && errors.length === 0, name + ': the five sets draw, every letter has its glyph, no text on another or off the screen' + (bad.concat(errors).length ? ':\n        ' + bad.concat(errors).slice(0, 12).join('\n        ') : ''));
    return all;
}
const has = (texts, s) => texts.some((t) => t.s === s);
const find = (texts, re) => texts.filter((t) => re.test(t.s));
const str = (texts) => texts.filter((t) => !t.layer).map((t) => t.s);

/* ---------- the car's signals ---------- */
const g = (x) => 32500 + Math.round(x * 9.80665 / 0.002);
function signals(h, o) {
    o = o || {};
    if (o.units !== false) h.Vehicle.statusNewCurrentUnitsStatusExt({ unitOfMeasurementAirPressure: o.press || 3, unitOfMeasurementTemperature: 1 });
    h.TPMS.statusTyrePressure({ actualValuePressureTyreFLH: 350, actualValuePressureTyreFRH: 352, actualValuePressureTyreRLH: 380, actualValuePressureTyreRRH: o.flat ? 50 : 381 });
    h.TPMS.statusTargetTyrePressure({ targetPressureTyreFLH: 350, targetPressureTyreFRH: 350, targetPressureTyreRLH: 380, targetPressureTyreRRH: 380 });
    h.TPMS.statusTyreTemperature({ actualValueTemperatureTyreFLH: 75, actualValueTemperatureTyreFRH: 76, actualValueTemperatureTyreRLH: 80, actualValueTemperatureTyreRRH: 81 });
    h.EnvironmentalInformation.ExteriorTemperature({ temperatureExterior: 136 });
    h.CDS.statusEngineTemperature({ temperatureEngineDrive: 138, temperatureEngineOilDrive: 153 });
    h.BasicDataSet.basicDataSet({ valueTemperatureTransmissionOil: 120 });
    h.BasicDataSet.basicDataSet({ valueTemperatureTransmissionOil: 128 });
    if (o.gear) h.VehicleInformation.statusGearboxDrive({ statusActualGearDrive: o.gear, statusActualStageDrive: 4 });
    /** per frame: a car at a steady 80 km/h and 3500 rpm, 16 psi of boost on the sport display */
    return (n) => {
        h.CDS.statusEngineSpeed2({ actualValueRPMEngineCrankshaft: 14000 + (n % 5) * 8 });
        h.Vehicle2.statusCarSpeed2({ speedVehicleCentreOfGravity: o.stand ? 0 : 5120 + (n % 3) });
        h.FES.statusSwitchDriveDynamicSport2({ displayBoostPressure: (o.press === 1 ? 105 : 150) + (n % 20) });
        h.FES.statusActualValueTorque2({ actualValueTorqueCrankshaft: 2047 + 2 * 380 + (n % 7) });
        h.CDS2.statusLongitudinalAccelerationMassCenter({ longitudinalAccelerationCentreOfGravity: g(o.stand ? 0.02 + (n % 2) * 0.002 : 0.2) });
        h.CDS2.statusLateralAccelerationMassCenter({ lateralAccelerationCentreOfGravity: g(o.stand ? 0.01 + (n % 2) * 0.002 : -0.4) });
    };
}

clock.install();
(async () => {
    await ok.part('nothing from the car', async () => {
        let car = await open({ reply: healthy() });
        let s = await sets(car, 'no-values');
        ok(has(s.thermal, 'NO TEMPERATURE DATA') && has(s.tyres, 'Waiting for the car to say which units it uses.'), 'Thermal says "No temperature data", Tyres that it waits for the car\'s units');
        ok(find(s.street, /^sport display: waiting for car units/).length === 1, 'the boost dial says what it waits for: "' + (find(s.street, /^sport display/)[0] || {}).s + '"');
        car = await open({ noLink: true });
        s = await sets(car, 'no-values-no-link');
        ok(find(s.boost, /^no diagnostic link$/).length === 4, 'without a diagnostic link the four engine-unit tiles say so');
        car = await open({ reply: healthy(), full: 49 });
        s = await sets(car, 'no-values-full-screen');
        ok(true, '(the same with the kit running the screen, 49 px of room under the page, Reset peaks on the page)');
    });

    await ok.part('a car without a gear signal (a manual), set to psi, one tyre nearly flat', async () => {
        const car = await open({ settings: { maxPower: 285, maxTorque: 500 }, reply: healthy() });
        const feed = signals(car.handlers, { flat: true });
        const s = await sets(car, 'manual-psi', feed, 4);
        const gear = s.street.filter((t) => t.font === 'gear');
        ok(gear.length === 1 && /^\d$/.test(gear[0].s), 'gauges-B12: an estimated gear is the number alone ("' + gear.map((t) => t.s).join('", "') + '"), no D in front of it');
        const est = find(s.street, /^EST\.$/)[0], lab = find(s.street, /^GEAR$/)[0];
        ok(est && lab && est.y === lab.y && est.x0 + est.w < lab.x0, 'gauges-B13: "EST." stands beside the GEAR label (ends at ' + (est ? Math.round(est.x0 + est.w) : '?') + ', GEAR starts at ' + (lab ? Math.round(lab.x0) : '?') + '), not on it');
        ok(find(s.track, /^EST\.$/).length === 1 && s.track.filter((t) => t.font === 'gear').length === 1, 'Track: the same number with EST. over it');
        ok(has(s.street, 'POWER EST. (TORQUE X RPM)'), 'gauges-B4: the power bar says what it is: "POWER EST. (TORQUE X RPM)"');
        ok(has(s.street, '285') && has(s.street, '500') && !has(s.street, '600'), 'gauges-B16: the bars end at the numbers set (285 kW, 500 Nm), not at the next round one');
        ok(has(s.boost, 'CHART MAX') && !has(s.boost, 'PEAK, 60 S'), 'the figure "Reset peaks" does not reset is called "Chart max", not "Peak, 60 s"');
        // gauges-B7: the sport display shows about 16 psi, the engine unit's target is 0.79 bar and its actual 0.75 bar
        const at = find(s.boost, /^AGAINST TARGET$/)[0], v = s.boost.filter((t) => at && t.font === 'num' && Math.abs(t.x0 - at.x0) < 2 && t.y > at.y && t.y < at.y + 60)[0];
        ok(v && v.s === '-0.6', 'gauges-B7: "Against target" is the engine unit\'s own actual less its target, ' + (v && v.s) + ' psi (it was the sport display\'s boost less the target: +4.5)');
        ok(has(s.tyres, 'Start = the first reading after this app was opened') && has(s.tyres, 'or after Reset peaks, not the start of the drive.') && !find(s.tyres, /of this drive/).length,
            'gauges-B11: Tyres says what Start is: the first reading after the app was opened, not the start of the drive');
        ok(find(s.tyres, /^out of range$/).length === 1 && !find(s.tyres, /^not a real value$/).length && str(s.tyres).filter((x) => x === '--').length >= 1,
            'gauges-B3: the tyre at 5 psi shows "--" and "out of range", not its last healthy number (and not "not a real value": a flat tyre is real)');
        // (the four tyres are the 34 x 84 boxes; the car sends tyre temperatures of 35 to 41 deg C, which colours a tyre green)
        await car.page('tyres');
        await car.draw();
        const tyres = car.boxes.filter((b) => b.w === 34 && b.h === 84), green = tyres.filter((b) => b.c === '#2fd27a');
        ok(tyres.length === 4 && green.length === 3 && tyres[3].c !== '#2fd27a', 'and that tyre is not drawn green for its temperature: three green tyres, the fourth in the colour of "no value" (' + (tyres[3] || {}).c + ')');
        ok(has(s.track, 'Peaks count after a stop') && has(s.track, 'that zeroes the g sensor') && !find(s.track, /stood still for 2 s/).length,
            'gauges-B10: Track says why there is no g peak yet, and promises no time: "Peaks count after a stop that zeroes the g sensor"');
    });

    await ok.part('an automatic, set to bar', async () => {
        const car = await open({ reply: healthy() });
        const feed = signals(car.handlers, { gear: 6, press: 1 });
        let s = await sets(car, 'automatic-bar', feed, 2);
        let gear = s.street.filter((t) => t.font === 'gear').map((t) => t.s).sort().join('');
        ok(gear === '4D' && !find(s.street, /^EST\.$/).length, 'the car sends gear 4 in D: "D" and "4", no EST.');
        // standing still for 2 s zeroes the g sensor: the peaks count, and the note goes
        await car.page('track');
        await car.drive(3, signals(car.handlers, { gear: 6, press: 1, stand: true }));
        await car.drive(1, feed);
        s = await car.draw();
        ok(!has(s, 'Peaks count after a stop') && s.filter((t) => t.font === 'num' && /^0\.\d\d$/.test(t.s)).length === 3, 'after a standstill the three g peaks are numbers and the note is gone');
    });

    await ok.part('the ethanol read-out on the Boost set', async () => {
        let car = await open({ reply: healthy({ '22:550D': [0x45] }) });
        let feed = signals(car.handlers);
        await car.page('boost'); await car.drive(3, feed);
        let s = await car.draw();
        ok(!find(s, /ETHANOL/).length, 'as shipped (off): nothing of it on the screen');
        const iat = (t) => t.filter((x) => x.s === '30' && x.font === 'num' && x.x0 > 1152 && x.x0 < 1356)[0];        // the Intake air tile's figure
        const iatY = iat(s).y;
        car = await open({ settings: { ethanol: '550d' }, reply: healthy({ '22:550D': [0x45] }) });
        feed = signals(car.handlers);
        s = (await sets(car, 'ethanol-reading', feed, 3)).boost;
        const e = find(s, /^ETHANOL/)[0];
        ok(e && e.s === 'ETHANOL  E27' && e.font === 'bold', 'Engine unit value (550D), the engine unit answers 45: "' + (e && e.s) + '", in the font that has the letters');
        ok(has(s, 'engine unit, value 550D'), 'with the source under it: "engine unit, value 550D"');
        ok(iat(s).y === iatY + 80 && find(s, /^(Intake air|Timing|Fuel rail|Fuel feed)$/).length === 4, 'the four tiles are still there, 80 px lower');
        car = await open({ settings: { ethanol: 'obd52' }, reply: healthy({ '22:550D': [0x45] }) });
        feed = signals(car.handlers);
        s = (await sets(car, 'ethanol-not-on-this-car', feed, 3)).boost;
        ok(has(s, 'ETHANOL  NO READING') && has(s, 'not on this car') && !find(s, /E\d/).length, 'OBD value chosen, the engine unit has none: "ETHANOL  NO READING", "not on this car", and no number although 550D would answer');
        car = await open({ settings: { ethanol: '550d' }, holdMs: 0, reply: healthy({ '22:550D': null }) });
        feed = signals(car.handlers);
        await car.page('boost'); await car.drive(6, feed);
        s = await car.draw();
        ok(has(s, 'ETHANOL  NO READING') && has(s, 'no answer to 550D') && faults(s).length === 0, '550D not answered: "ETHANOL  NO READING", "no answer to 550D"');
        car = await open({ settings: { ethanol: '550d', demo: 'on' }, reply: healthy({ '22:550D': [0x45] }) });
        s = (await sets(car, 'ethanol-demo')).boost;
        ok(has(s, 'ETHANOL  NO READING') && has(s, 'demo: not read') && !find(s, /^ETHANOL +E\d/).length, 'demo data: "ETHANOL  NO READING", "demo: not read" - the demo drive invents no ethanol content');
        car = await open({ settings: { ethanol: '550d' }, reply: healthy({ '22:550D': [0x45] }), full: 49 });
        feed = signals(car.handlers);
        await sets(car, 'ethanol-full-screen', feed, 3);
        // the third choice, MHD flex (mhdflex.js): a stand-in engine unit with the tune, and one whose software is not in the list
        car = await open({ settings: { ethanol: 'mhd' }, reply: mhdUnit({ active: 27, can: 26 }) });
        feed = signals(car.handlers);
        s = (await sets(car, 'ethanol-mhd-flex', feed, 6)).boost;
        ok(has(s, 'ETHANOL  E27') && has(s, 'MHD flex  ·  sensor E26'), 'MHD flex, the tune runs on 27 and its sensor says 26: "ETHANOL  E27", "MHD flex  ·  sensor E26"');
        car = await open({ settings: { ethanol: 'mhd' }, reply: mhdUnit({ family: '6B21' }) });
        feed = signals(car.handlers);
        s = (await sets(car, 'ethanol-mhd-flex-not-supported', feed, 6)).boost;
        ok(has(s, 'ETHANOL  NO READING') && has(s, 'software not supported') && !find(s, /^ETHANOL +E\d/).length, 'MHD flex on an engine program that is not in the list: "ETHANOL  NO READING", "software not supported"');
        car = await open({ settings: { ethanol: 'mhd' }, reply: mhdUnit({ active: 85, can: 85 }), full: 49 });
        feed = signals(car.handlers);
        await sets(car, 'ethanol-mhd-flex-full-screen', feed, 6);
    });

    await ok.part('an engine unit that does not answer; a car that never names its units; a diesel in kPa', async () => {
        const h = healthy();
        let car = await open({ holdMs: 0, reply: (a, b, c) => (a === 0x12 ? null : h(a, b, c)) });
        let feed = signals(car.handlers);
        await car.page('boost'); await car.drive(20, feed);
        let s = await sets(car, 'engine-unit-silent', feed, 1);
        const tiles = find(s.boost, /^not answering$/);
        ok(tiles.length === 4 && tiles.every((t) => (t.x0 < 1372 ? t.x0 + t.w <= 1356 - 12 : t.x0 + t.w <= 1576 - 12)), 'gauges-B6: the four engine-unit tiles say "not answering", inside their tiles');
        car = await open({ reply: healthy() });
        feed = signals(car.handlers, { units: false, flat: true });
        await car.drive(9, feed);
        s = await sets(car, 'units-unknown', feed, 1);
        ok(has(s.tyres, 'Car\'s units unknown: pressures read by their size.'), 'gauges-B9: Tyres says "Car\'s units unknown: pressures read by their size."');
        const four = s.tyres.filter((t) => t.font === 'num' && t.size >= 72).map((t) => t.s);
        ok(four.join(' ') === '35 35 38 --' && find(s.tyres, /^out of range$/).length === 1, 'and its tyres at 35 / 35 / 38 / 5 psi read ' + four.join(', ') + ' with "out of range": the low one is not sized on its own (it was 73)');
        ok(has(s.street, 'car\'s units unknown: sport display read as psi') && has(s.boost, 'car\'s units unknown: sport display read as psi'), 'and both boost dials: "car\'s units unknown: sport display read as psi"');
        const rail = (a, sid, d) => (a === 0x12 && sid === 0x22 && d[0] === 0xF4 && d[1] === 0x23 ? [0x62, 0xF4, 0x23, 0x4E, 0x20] : h(a, sid, d));      // 2000 bar
        car = await open({ settings: { engine: 'diesel', pressUnit: 'kpa' }, reply: rail });
        feed = signals(car.handlers);
        s = (await sets(car, 'diesel-kpa', feed, 3)).boost;
        const big = find(s, /^200000$/)[0], unit = s.filter((t) => big && t.s === 'kPa' && t.y === big.y)[0];
        ok(big && unit && unit.x0 + unit.w <= 1356 - 12 && find(s, /^200000 – 200000$/).length === 1, 'a diesel\'s 2000 bar in kPa: "200000 kPa" and its range stay inside the Fuel rail tile');
    });

    await ok.part('other units and another theme', async () => {
        const car = await open({ settings: { speedUnit: 'mph', tempUnit: 'f', pressUnit: 'bar', powerUnit: 'hp', torqueUnit: 'lbft', boostMax: '3.5', theme: 'proven_red', ethanol: '550d', peakHold: 0 }, reply: healthy({ '22:550D': [0x45] }) });
        const s = await sets(car, 'mph-f-bar-hp', signals(car.handlers, { gear: 6, press: 1 }), 3);
        ok(has(s.street, 'mph') && has(s.street, ' hp') && has(s.street, ' lb-ft') && find(s.thermal, /°F/).length > 0 && has(s.tyres, ' bar'), 'mph, hp, lb-ft, deg F and bar are drawn');
    });

    await ok.part('the demo drive', async () => {
        const car = await open({ settings: { demo: 'on' } });
        const s = await sets(car, 'demo', null, 3);
        ok(s.street.filter((t) => t.font === 'gear').map((t) => t.s).sort().join('').replace(/\d/, '#') === '#D' || s.street.filter((t) => t.font === 'gear').map((t) => t.s).sort().join('').replace(/\d/, '#') === '#S', 'the demo drive shows its gear with D or S');
    });
    ok.done();
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
