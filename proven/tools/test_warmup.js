'use strict';
/**
 * test_warmup.js <built app: dist/pps_warmup> - the warm-up decision (warm.js) put through a cold start,
 * a hot restart, an over-rev, overheating, cars without a gearbox reading, and readings that are missing
 * or that the car replaces with "no value" (source.js). No car needed.
 */
const path = require('path'), assert = require('assert');
const { WarmUp, limitsFrom } = require(path.join(path.resolve(process.argv[2]), 'source', 'javascript', 'warm'));
const base = { readyOil: 85, hotOil: 130, readyGearbox: 60, hotGearbox: 120, readyCoolant: 80, hotCoolant: 115, coldLimit: 3500, gearboxSource: 'auto' };
const make = (over) => { const s = Object.assign({}, base, over); return new WarmUp(() => limitsFrom((k) => s[k])); };
let n = 0;
const ok = (cond, what) => { assert.ok(cond, what); n++; console.log('  ok  ' + what); };

console.log('cold start to ready');
let w = make(), t = 0;
let st = w.feed({ rpm: 900, speed: 0, oil: 20, gearbox: 20, coolant: 22 }, t);
ok(st.overall === 'warming' && st.waiting.length === 3, 'cold with the engine running: warming, waiting for all three');
ok(!w.announce(), 'nothing announced while cold');
st = w.feed({ rpm: 2000, speed: 50, oil: 50, gearbox: 40, coolant: 80 }, t += 1000);
ok(st.fluids.coolant.state === 'ready' && st.overall === 'warming', 'coolant at its "safe from": ready, the car still warming');
st = w.feed({ rpm: 2000, speed: 50, oil: 50, gearbox: 40, coolant: 78 }, t += 1000);
ok(st.fluids.coolant.state === 'ready', 'coolant 2 deg under the threshold: still ready (no flicker)');
st = w.feed({ rpm: 2000, speed: 50, oil: 50, gearbox: 40, coolant: 76 }, t += 1000);
ok(st.fluids.coolant.state !== 'ready', 'coolant 4 deg under: no longer ready');
st = w.feed({ rpm: 2000, speed: 50, oil: 84, gearbox: 61, coolant: 88 }, t += 1000);
ok(st.overall === 'warming' && st.waiting.join() === 'oil', 'oil 1 deg short: the car is not called ready');
ok(!w.announce(), 'and nothing is announced');
st = w.feed({ rpm: 2000, speed: 50, oil: 85, gearbox: 61, coolant: 88 }, t += 1000);
ok(st.overall === 'ready' && st.waiting.length === 0, 'all three in range: ready');
ok(w.announce() === true, 'announced');
ok(w.announce() === false, 'announced once only');
st = w.feed({ rpm: 2000, speed: 50, oil: 86, gearbox: 62, coolant: 88 }, t += 1000);
ok(!w.announce(), 'not again while it stays warm');

console.log('hot restart');
w = make(); st = w.feed({ rpm: 900, speed: 0, oil: 95, gearbox: 70, coolant: 90 }, 0);
ok(st.overall === 'ready' && !w.announce(), 'already warm at start: ready, no announcement');

console.log('revving a cold engine');
w = make(); t = 0;
w.feed({ rpm: 4200, speed: 60, oil: 30, gearbox: 25, coolant: 40 }, t);
ok(w.status(t).over === true, '4,200 rpm against a 3,500 limit while cold: flagged');
w.feed({ rpm: 2000, speed: 60, oil: 30, gearbox: 25, coolant: 40 }, t += 1000);
ok(w.status(t).over === true, 'still shown a second later');
w.feed({ rpm: 2000, speed: 60, oil: 30, gearbox: 25, coolant: 40 }, t += 3000);
ok(w.status(t).over === false, 'cleared once the revs have been down for 3 s');
w = make({ coldLimit: 0 }); w.feed({ rpm: 6000, speed: 60, oil: 30, gearbox: 25, coolant: 40 }, 0);
ok(w.status(0).over === false, 'rev limit set to None: never flagged');
w = make(); w.feed({ rpm: 6000, speed: 100, oil: 95, gearbox: 70, coolant: 90 }, 0);
ok(w.status(0).over === false, 'high revs on a warm engine: not flagged');

console.log('too hot');
w = make(); st = w.feed({ rpm: 3000, speed: 100, oil: 130, gearbox: 80, coolant: 95 }, 0);
ok(st.overall === 'hot' && st.fluids.oil.state === 'hot', 'oil at its "too hot above": the car is too hot');
st = w.feed({ rpm: 3000, speed: 100, oil: 128, gearbox: 80, coolant: 95 }, 1000);
ok(st.overall === 'hot', '2 deg C under the limit again: still too hot (3 deg C hold)');
st = w.feed({ rpm: 3000, speed: 100, oil: 126, gearbox: 80, coolant: 95 }, 2000);
ok(st.overall === 'ready' && !w.announce(), 'cooled back into range: ready again, without a second announcement');

console.log('gearbox');
w = make({ gearboxSource: 'none' }); st = w.feed({ rpm: 2000, speed: 50, oil: 90, gearbox: null, coolant: 85 }, 0);
ok(st.overall === 'ready' && st.fluids.gearbox.state === 'unused', '"Not monitored": oil and coolant decide alone');
w = make(); t = 0; st = w.feed({ rpm: 2000, speed: 50, oil: 90, gearbox: null, coolant: 85 }, t);
ok(st.overall === 'warming' && st.waiting.join() === 'gearbox', 'no gearbox reading yet: it is waited for');
for (let i = 0; i < 89; i++) st = w.feed({ rpm: 2000, speed: 50, oil: 90, gearbox: null, coolant: 85 }, t += 1000);
ok(st.overall === 'warming', 'still waited for after 89 s of running');
for (let i = 0; i < 3; i++) st = w.feed({ rpm: 2000, speed: 50, oil: 90, gearbox: null, coolant: 85 }, t += 1000);
ok(st.overall === 'ready' && st.unwatched.join() === 'gearbox', 'no reading for 90 s of running: left out, and named as not monitored');
st = w.feed({ rpm: 2000, speed: 50, oil: 90, gearbox: 35, coolant: 85 }, t += 1000);
ok(st.overall === 'warming' && st.waiting.join() === 'gearbox', 'a reading turns up after all, and it is cold: waited for again');
for (let i = 0; i < 120; i++) st = w.feed({ rpm: 2000, speed: 50, oil: 90, gearbox: null, coolant: 85 }, t += 1000);
ok(st.overall === 'warming' && st.waiting.join() === 'gearbox' && st.unwatched.length === 0, 'read cold, then no reading for 2 minutes of running: still waited for, the car is not called ready');
ok(!w.announce(), 'and nothing is announced');
st = w.feed({ rpm: 2000, speed: 50, oil: 90, gearbox: 62, coolant: 85 }, t += 1000);
ok(st.overall === 'ready' && st.unwatched.length === 0 && w.announce() === true, 'its reading comes back in range: ready, and announced');
for (let i = 0; i < 89; i++) st = w.feed({ rpm: 2000, speed: 50, oil: 90, gearbox: null, coolant: 85 }, t += 1000);
ok(st.overall === 'warming' && st.waiting.join() === 'gearbox', 'last read in range, then no reading: waited for during 90 s');
for (let i = 0; i < 3; i++) st = w.feed({ rpm: 2000, speed: 50, oil: 90, gearbox: null, coolant: 85 }, t += 1000);
ok(st.overall === 'ready' && st.unwatched.join() === 'gearbox' && !w.announce(), 'then left out as before (it was last read in range), without a second announcement');
w = make(); t = 0; st = w.feed({ rpm: 2000, speed: 50, oil: 90, gearbox: 121, coolant: 85 }, t);
for (let i = 0; i < 120; i++) st = w.feed({ rpm: 2000, speed: 50, oil: 90, gearbox: null, coolant: 85 }, t += 1000);
ok(st.overall === 'warming' && st.waiting.join() === 'gearbox' && st.unwatched.length === 0 && !w.announce(), 'read too hot, then no reading for 2 minutes of running: not left out, the car is not called ready');

console.log('engine off, programming slips, time to ready');
w = make(); st = w.feed({ rpm: 0, speed: 0, oil: 20, gearbox: 20, coolant: 22 }, 0);
ok(st.overall === 'off', 'cold with the engine off: "engine off", not "warming"');
const lim = limitsFrom((k) => Object.assign({}, base, { hotOil: 80 })[k]);
ok(lim.oil.hot === 95, 'a "too hot" programmed under "safe from" is moved to 10 deg above it');
w = make(); t = 0;
for (let s = 0; s <= 180; s++) st = w.feed({ rpm: 2000, speed: 60, oil: 25 + s * 0.1, gearbox: 70, coolant: 90 }, t = s * 1000);   // oil +6 deg C / min
const want = (85 - 43) / 6;
ok(Math.abs(st.fluids.oil.min - want) < 0.5, 'oil warming at 6 deg C a minute, 42 deg to go: about ' + want.toFixed(1) + ' min (got ' + st.fluids.oil.min.toFixed(1) + ')');
ok(Math.abs(st.min - st.fluids.oil.min) < 1e-9, 'the car\'s time to ready is its slowest fluid\'s');
console.log('the presets a fresh install starts with');
const spec = JSON.parse(require('fs').readFileSync(path.join(path.resolve(process.argv[2]), 'source', 'javascript', 'kit', 'app-spec.json'), 'utf8'));
const dflt = {}; spec.settings.forEach((x) => { dflt[x.key] = x.default; });
ok(dflt.readyOil === 80, 'engine oil is ready from 80 deg C');
ok(dflt.readyGearbox === 60, 'gearbox oil is ready from 60 deg C');
ok(dflt.readyCoolant === 80, 'coolant is ready from 80 deg C');
ok(dflt.coldLimit === 4000, 'keep below 4,000 rpm until warm');
ok(dflt.gaugeStyle === 'bars', 'the screen starts in the horizontal bar style');
w = new WarmUp(() => limitsFrom((k) => dflt[k]));
st = w.feed({ rpm: 2000, speed: 50, oil: 79, gearbox: 60, coolant: 80 }, 0);
ok(st.overall === 'warming' && st.waiting.join() === 'oil', 'with the presets: oil at 79 is not ready yet');
st = w.feed({ rpm: 4100, speed: 50, oil: 79, gearbox: 60, coolant: 80 }, 1000);
ok(w.status(1000).over === true, 'with the presets: 4,100 rpm before it is warm is flagged');
st = w.feed({ rpm: 2000, speed: 50, oil: 80, gearbox: 60, coolant: 80 }, 5000);
ok(st.overall === 'ready' && w.announce() === true, 'with the presets: 80 / 60 / 80 is up to temperature, and announced');
ok(dflt.hotOil === 115, 'engine oil is too hot from 115 deg C');
ok(dflt.hotGearbox === 100, 'gearbox oil is too hot from 100 deg C');
ok(dflt.hotCoolant === 115, 'coolant is too hot from 115 deg C');
ok(spec.settings.filter((x) => x.steps).every((x) => x.steps.indexOf(x.default) >= 0), 'every preset is a value the Settings screen can show');
st = w.feed({ rpm: 3000, speed: 100, oil: 114, gearbox: 99, coolant: 114 }, 60000);
ok(st.overall === 'ready', 'with the presets: 114 / 99 / 114 is still in the safe range');
st = w.feed({ rpm: 3000, speed: 100, oil: 115, gearbox: 99, coolant: 114 }, 61000);
ok(st.overall === 'hot' && st.fluids.oil.state === 'hot' && st.fluids.gearbox.state === 'ready', 'with the presets: engine oil at 115 is too hot');
st = w.feed({ rpm: 3000, speed: 100, oil: 113, gearbox: 99, coolant: 114 }, 61300);
ok(st.overall === 'hot' && st.fluids.oil.state === 'hot', 'with the presets: back at 113 it still reads too hot (3 deg C hold, no flicker at 115)');
st = w.feed({ rpm: 3000, speed: 100, oil: 111, gearbox: 99, coolant: 114 }, 61600);
ok(st.overall === 'ready' && st.fluids.oil.state === 'ready', 'with the presets: at 111 it is back in the safe range');
st = w.feed({ rpm: 3000, speed: 100, oil: 113, gearbox: 99, coolant: 114 }, 61800);
ok(st.overall === 'ready', 'with the presets: 113 on the way up is not too hot');
st = w.feed({ rpm: 3000, speed: 100, oil: 100, gearbox: 100, coolant: 100 }, 62000);
ok(st.overall === 'hot' && st.fluids.gearbox.state === 'hot' && st.fluids.oil.state === 'ready', 'with the presets: gearbox oil at 100 is too hot');
st = w.feed({ rpm: 3000, speed: 100, oil: 100, gearbox: 90, coolant: 115 }, 63000);
ok(st.overall === 'hot' && st.fluids.coolant.state === 'hot' && st.fluids.gearbox.state === 'ready', 'with the presets: coolant at 115 is too hot');

console.log('engine oil and coolant are never left out');
w = make(); t = 0;
for (let i = 0; i <= 120; i++) st = w.feed({ rpm: 2000, speed: 50, oil: null, gearbox: 65, coolant: 85 }, t = i * 1000);
ok(st.overall === 'warming' && st.waiting.join() === 'oil' && st.unwatched.length === 0, 'no engine oil reading for 2 minutes of running: still waited for, the car is not called ready');
ok(st.fluids.oil.state === 'none' && !w.announce(), 'its row says it has no reading, and nothing is announced');
w = make(); t = 0;
for (let i = 0; i <= 120; i++) st = w.feed({ rpm: 2000, speed: 50, oil: 90, gearbox: 65, coolant: null }, t = i * 1000);
ok(st.overall === 'warming' && st.waiting.join() === 'coolant' && st.unwatched.length === 0, 'no coolant reading for 2 minutes of running: still waited for, the car is not called ready');
w = make(); t = 0;
for (let i = 0; i <= 120; i++) st = w.feed({ rpm: 2000, speed: 50, oil: null, gearbox: null, coolant: 85 }, t = i * 1000);
ok(st.overall === 'warming' && st.waiting.join() === 'oil' && st.unwatched.join() === 'gearbox', 'coolant alone never makes the car ready: the gearbox is left out, engine oil is still waited for');
st = w.feed({ rpm: 2000, speed: 50, oil: 90, gearbox: null, coolant: 85 }, t += 1000);
ok(st.overall === 'ready' && st.unwatched.join() === 'gearbox', 'the engine oil reading arrives warm: ready, with the gearbox named as not monitored');
ok(!w.announce(), 'and not announced, because no fluid was read below its "safe from"');
for (let i = 0; i < 95; i++) st = w.feed({ rpm: 2000, speed: 50, oil: null, gearbox: null, coolant: 85 }, t += 1000);
ok(st.overall === 'warming' && st.waiting.join() === 'oil', 'an engine oil reading that is lost again, for over 90 s: the car is not called ready');

console.log('the announcement is made once, and only while it is true');
const cold = { rpm: 900, speed: 0, oil: 20, gearbox: 20, coolant: 22 }, warmed = { rpm: 2000, speed: 50, oil: 90, gearbox: 65, coolant: 85 };
w = make(); t = 0; w.feed(cold, t); st = w.feed(warmed, t += 1000);
ok(st.overall === 'ready' && w.status(t).readyAt === t, 'status() says when the car came up to temperature, so the screen can tell news from old news');
ok(w.announce() === true, 'a watched warm-up: announced');
st = w.feed(Object.assign({}, warmed, { gearbox: null }), t += 5000);
ok(st.overall === 'warming' && st.waiting.join() === 'gearbox', 'once warm, the gearbox reading drops out for a moment: waited for');
st = w.feed(warmed, t += 5000);
ok(st.overall === 'ready' && w.announce() === false, 'it comes back warm: ready, and not announced a second time');
w = make(); t = 0; st = w.feed({ rpm: 900, speed: 0, oil: 95, gearbox: null, coolant: 90 }, t);
ok(st.overall === 'warming' && st.waiting.join() === 'gearbox', 'hot restart, the gearbox unit has not answered yet: waited for');
st = w.feed({ rpm: 900, speed: 0, oil: 95, gearbox: 70, coolant: 90 }, t += 3000);
ok(st.overall === 'ready' && w.announce() === false, 'its answer arrives warm: ready, with no announcement on a hot restart');
w = make(); t = 0; w.feed(cold, t); st = w.feed(warmed, t += 1000);          // up to temperature, the screen is closed
st = w.feed(Object.assign({}, warmed, { rpm: 3000, oil: 131 }), t += 60000);
ok(st.overall === 'hot', 'up to temperature unseen, then too hot');
st = w.feed(Object.assign({}, warmed, { oil: 100 }), t += 60000);
ok(st.overall === 'ready' && w.announce() === false, 'back in range: the announcement that was never shown has been withdrawn, it is not made late');
w = make(); t = 0; w.feed(cold, t); st = w.feed(warmed, t += 1000);          // up to temperature, the screen is closed
st = w.feed({ rpm: 0, speed: 0, oil: 40, gearbox: 30, coolant: 40 }, t += 3600000);
ok(st.overall === 'off' && w.announce() === false, 'up to temperature unseen, then parked and cooled: nothing is announced late');
st = w.feed(Object.assign({}, cold, { oil: 40, gearbox: 30, coolant: 40 }), t += 1000);
ok(st.overall === 'warming', 'started again cold: warming');
st = w.feed(warmed, t += 600000);
ok(st.overall === 'ready' && w.announce() === true, 'that warm-up is announced in its turn');

console.log('readings the car stops giving (source.js)');
ok(dflt.demo === 'off', 'demo data is off unless the workshop switches it on');
ok(spec.settings.filter((x) => /^(ready|hot)[A-Z]|^coldLimit$/.test(x.key)).length === 7
    && spec.settings.filter((x) => /^(ready|hot)[A-Z]|^coldLimit$/.test(x.key)).every((x) => x.reset >= 1), 'each of the 7 presets carries a reset mark, so a changed preset can be sent to every car');
{
    // a steady clock the test moves by hand (source.js reads process.hrtime through mono())
    let clock = 5000; const hr = process.hrtime; process.hrtime = () => [Math.floor(clock / 1000), (clock % 1000) * 1e6];
    const { Source } = require(path.join(path.resolve(process.argv[2]), 'source', 'javascript', 'source'));
    const handlers = {}, vals = Object.assign({}, dflt), quiet = { info() {}, warn() {}, error() {}, debug() {} };
    const src = new Source({ settings: { get: (k) => vals[k], onChange() {} }, log: quiet, signals: {
        watch: (iface, inst, h) => { handlers[iface.split('.').pop()] = h; return Promise.resolve({ iface, available: true, error: null }); },
        proxy: () => Promise.reject(new Error('test: no diagnostic link')), call: () => Promise.reject(new Error('test')),
    } });
    const temps = (coolant, oil) => handlers.CDS.statusEngineTemperature({ temperatureEngineDrive: coolant, temperatureEngineOilDrive: oil });
    ok(src.data().oil === undefined && src.data().coolant === undefined && src.data().demo === false, 'before the car has sent anything: no readings, and no demo data');
    {
        // a car that gives nothing at all, 6 s after the app started (the Auto setting waits 5 s before it shows the demo)
        const now0 = Date.now, mute = { watch: () => Promise.resolve({ available: false, error: null }), proxy: () => Promise.reject(new Error('test')), call: () => Promise.reject(new Error('test')) };
        const src2 = new Source({ settings: { get: (k) => vals[k], onChange() {} }, log: quiet, signals: mute });
        Date.now = () => now0() + 6000;
        ok(src2.usingDemo() === false && src2.data().demo === false, 'with the shipped settings a car that gives nothing is not shown demo data');
        vals.demo = 'auto';
        ok(src2.usingDemo() === true, 'the same car with Demo data on Auto would be (so the check above does test the shipped default)');
        vals.demo = dflt.demo; Date.now = now0;
    }
    temps(48 + 85, 48 + 90);
    ok(src.data().oil === 90 && src.data().coolant === 85, 'engine oil 90 and coolant 85 from the car');
    temps(48 + 85, 255);
    ok(src.data().oil === 90, 'the car sends "no value" for engine oil: the last reading is kept for a moment');
    clock += 9000; temps(48 + 86, 255);
    ok(src.data().oil === 90 && src.data().coolant === 86, 'still kept 9 s later, and coolant goes on updating');
    clock += 2000;
    ok(src.data().oil === undefined && src.data().coolant === 86, 'after 10 s without a value it is dropped: the app then waits for engine oil again');
    temps(48 + 86, 48 + 91);
    ok(src.data().oil === 91, 'a value again: shown again at once');
    temps(48 + 86, 255); clock += 3000; temps(48 + 86, 48 + 92); clock += 20000;
    ok(src.data().oil === 92, 'a short gap that ends inside 10 s never drops the reading');
    temps(255, 48 + 92); clock += 11000;
    ok(src.data().coolant === undefined && src.data().oil === 92, 'coolant is dropped the same way, 10 s after the car sends "no value" for it');
    handlers.CDS.statusEngineSpeed2({ actualValueRPMEngineCrankshaft: 2000 / 0.25 });
    handlers.CDS.statusEngineSpeed2({ actualValueRPMEngineCrankshaft: 65535 }); clock += 60000;
    ok(src.data().rpm === 2000, 'the engine speed is kept when the car sends "no value" or nothing more (as in 1.1.0)');
    // when the gearbox unit may be asked: the rule the gearbox reader is given (as in 1.1.0)
    src.wantGearbox = () => true;
    ok(src.gearbox.visible() === true, 'the gearbox unit may still be asked 60 s after the last engine speed');
    vals.gearboxSource = 'signal';
    ok(src.gearbox.visible() === false, '"Car signal only": the gearbox unit is not asked');
    vals.gearboxSource = dflt.gearboxSource; src.wantGearbox = () => false;
    ok(src.gearbox.visible() === false, 'and not when the app does not want it');
    process.hrtime = hr;
}
console.log(n + ' checks, ALL OK');
