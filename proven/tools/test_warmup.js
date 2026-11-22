'use strict';
/**
 * test_warmup.js <built app: dist/pps_warmup> - the warm-up decision (warm.js) put through a cold start,
 * a hot restart, an over-rev, overheating, cars without a gearbox reading, and readings that are missing
 * or that the car replaces with "no value" (source.js). Then the whole app on a stand-in car
 * (test_warmup_car.js: the gearbox reader, when the gearbox unit is asked, the screen's and the widget's
 * words). No car needed.
 *
 * WARMUP_TEST_ALL=1 in the environment: a failed check does not stop the run; they are listed at the end
 * (to see everything a change breaks).
 */
const path = require('path'), assert = require('assert');
const { WarmUp, limitsFrom } = require(path.join(path.resolve(process.argv[2]), 'source', 'javascript', 'warm'));
const base = { readyOil: 85, hotOil: 130, readyGearbox: 60, hotGearbox: 120, readyCoolant: 80, hotCoolant: 115, coldLimit: 3500, gearboxSource: 'auto' };
const make = (over) => { const s = Object.assign({}, base, over); return new WarmUp(() => limitsFrom((k) => s[k])); };
let n = 0;
const ALL = !!process.env.WARMUP_TEST_ALL, failed = [];
const ok = (cond, what) => {
    if (!cond && ALL) { failed.push(what); console.log('  FAILED  ' + what); return; }
    assert.ok(cond, what); n++; console.log('  ok  ' + what);
};
/** A group of checks (with WARMUP_TEST_ALL an error in one group does not stop the others). */
const part = (name, fn) => {
    console.log(name);
    if (!ALL) return fn();
    try { return fn(); } catch (e) { failed.push(name + ': ' + e); console.log('  FAILED  ' + name + ': ' + e); }
};

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
// a car that gives no gearbox reading: none arrives, and the gearbox reader has the evidence (gearboxAbsent, see gearbox.js)
const noGearbox = { rpm: 2000, speed: 50, oil: 90, gearbox: null, coolant: 85, gearboxAbsent: true };
const noGearboxOff = Object.assign({}, noGearbox, { rpm: 0, speed: 0 });
w = make(); t = 0; st = w.feed(noGearbox, t);
ok(st.overall === 'warming' && st.waiting.join() === 'gearbox', 'no gearbox reading yet: it is waited for');
for (let i = 0; i < 89; i++) st = w.feed(noGearbox, t += 1000);
ok(st.overall === 'warming', 'still waited for after 89 s of running');
for (let i = 0; i < 3; i++) st = w.feed(noGearbox, t += 1000);
ok(st.overall === 'ready' && st.unwatched.join() === 'gearbox', 'no reading for 90 s of running on a car that gives none: left out, and named as not monitored');
part('a gearbox that is left out stays left out across an engine stop (warmup-B1)', () => {
    st = w.feed(noGearboxOff, t += 1000);
    ok(st.overall === 'ready' && st.unwatched.join() === 'gearbox', 'B1: the engine stops (start-stop at the lights, a stall): the gearbox stays left out and the car stays ready');
    for (let i = 0; i < 8; i++) st = w.feed(noGearboxOff, t += 1000);
    st = w.feed(Object.assign({}, noGearbox, { rpm: 900 }), t += 1000);
    ok(st.overall === 'ready' && st.unwatched.join() === 'gearbox', 'B1: restarted: ready at once, not 90 s of "Warming up" again');
    st = w.feed(Object.assign({}, noGearbox, { rpm: 4500 }), t += 1000);
    ok(st.overall === 'ready' && w.status(t).over === false, 'B1: pulling away at 4,500 rpm: still ready, nothing flagged');
    for (let i = 0; i < 20; i++) st = w.feed(noGearboxOff, t += 60000);
    st = w.feed(noGearbox, t += 1000);
    ok(st.overall === 'ready' && st.unwatched.join() === 'gearbox', 'B1: and after 20 minutes parked with the head unit on');
});
st = w.feed({ rpm: 2000, speed: 50, oil: 90, gearbox: 35, coolant: 85 }, t += 1000);
ok(st.overall === 'warming' && st.waiting.join() === 'gearbox', 'a reading turns up after all, and it is cold: waited for again');
for (let i = 0; i < 120; i++) st = w.feed(noGearbox, t += 1000);
ok(st.overall === 'warming' && st.waiting.join() === 'gearbox' && st.unwatched.length === 0, 'read cold, then no reading for 2 minutes of running: still waited for, the car is not called ready');
ok(!w.announce(), 'and nothing is announced');
st = w.feed({ rpm: 2000, speed: 50, oil: 90, gearbox: 62, coolant: 85 }, t += 1000);
ok(st.overall === 'ready' && st.unwatched.length === 0 && w.announce() === true, 'its reading comes back in range: ready, and announced');
part('a gearbox reading that ages out counts on its last value while it was in range (warmup-B2)', () => {
    st = w.feed(noGearbox, t += 1000);
    ok(st.overall === 'ready' && st.held.join() === 'gearbox' && st.unwatched.length === 0, 'B2: last read in range, then no reading: it counts on its last reading at once, and is named as that');
    ok(st.fluids.gearbox.temp === null && st.fluids.gearbox.last === 62 && st.fluids.gearbox.state === 'ready', 'B2: its row has no live number: the last reading is given apart, as the last reading');
    for (let i = 0; i < 600; i++) st = w.feed(noGearbox, t += 1000);
    ok(st.overall === 'ready' && st.held.join() === 'gearbox' && !w.announce(), 'B2: still so after 10 minutes of driving without a reading (the app closed: the unit is not asked), without a second announcement');
    for (let i = 0; i < 120; i++) st = w.feed(noGearboxOff, t += 1000);
    ok(st.overall === 'ready' && st.held.join() === 'gearbox', 'B2: and through 2 minutes with the engine stopped: not "Engine off, waiting for gearbox oil"');
    st = w.feed(Object.assign({}, noGearbox, { rpm: 4500 }), t += 1000);
    ok(st.overall === 'ready' && w.status(t).over === false, 'B2: restarted at 4,500 rpm: ready, nothing flagged');
    for (let i = 0; i < 299; i++) st = w.feed(noGearboxOff, t += 1000);
    ok(st.overall === 'ready', 'B2: the engine off for just under 5 minutes: the last reading still counts');
    for (let i = 0; i < 3; i++) st = w.feed(noGearboxOff, t += 1000);
    ok(st.overall === 'off' && st.waiting.join() === 'gearbox' && st.held.length === 0, 'B2: off for 5 minutes: that engine run is over, the old reading no longer counts and the gearbox is waited for');
    st = w.feed(Object.assign({}, noGearbox, { rpm: 4500 }), t += 1000);
    ok(st.overall === 'warming' && st.waiting.join() === 'gearbox' && st.unwatched.length === 0, 'B2: started again: waited for until the unit answers (it has given readings: never left out now)');
    ok(w.status(t).over === false, 'B2: 4,500 rpm meanwhile is not flagged: no fluid is read below its "safe from"');
    st = w.feed({ rpm: 2000, speed: 50, oil: 90, gearbox: 58, coolant: 85 }, t += 3000);
    ok(st.overall === 'warming' && st.fluids.gearbox.state === 'warming', 'B2: its answer is 58 (2 under "safe from") after the long stop: not ready on the strength of the earlier 62');
    st = w.feed({ rpm: 2000, speed: 50, oil: 90, gearbox: 61, coolant: 85 }, t += 60000);
    ok(st.overall === 'ready' && st.held.length === 0, 'B2: at 61 it is ready again');
    // a limit changed in Workshop settings while the gearbox has no reading: its last reading is judged against the new number
    const lims = Object.assign({}, base); w = new WarmUp(() => limitsFrom((k) => lims[k])); t = 0;
    w.feed({ rpm: 2000, speed: 50, oil: 90, gearbox: 62, coolant: 85 }, t); st = w.feed(noGearbox, t += 30000);
    ok(st.overall === 'ready' && st.held.join() === 'gearbox', 'B2: gearbox last read 62 against "safe from" 60: counted on it');
    lims.readyGearbox = 70; st = w.feed(noGearbox, t += 1000);
    ok(st.overall === 'warming' && st.waiting.join() === 'gearbox' && st.held.length === 0, 'B2: its "safe from" is raised to 70 meanwhile: 62 no longer counts, it is waited for');
    lims.readyGearbox = 60; st = w.feed(noGearbox, t += 1000);
    ok(st.overall === 'ready' && st.held.join() === 'gearbox', 'B2: and put back to 60: counted on again');
    for (let i = 0; i < 6; i++) st = w.feed(noGearboxOff, t += 60000);
    lims.readyGearbox = 55; st = w.feed(noGearboxOff, t += 1000);
    ok(st.overall === 'off' && st.waiting.join() === 'gearbox' && st.held.length === 0, 'B2: but a limit changed after the engine run is over does not bring the old reading back');
});
w = make(); t = 0; st = w.feed({ rpm: 2000, speed: 50, oil: 90, gearbox: 121, coolant: 85 }, t);
for (let i = 0; i < 120; i++) st = w.feed(noGearbox, t += 1000);
ok(st.overall === 'warming' && st.waiting.join() === 'gearbox' && st.unwatched.length === 0 && !w.announce(), 'read too hot, then no reading for 2 minutes of running: not left out, the car is not called ready');
part('the gearbox is left out on evidence, not on 90 seconds alone (warmup-B3)', () => {
    const silent = { rpm: 2000, speed: 50, oil: 90, gearbox: null, coolant: 85 };        // no reading, and no evidence either way
    w = make(); t = 0;
    for (let i = 0; i <= 600; i++) st = w.feed(silent, t = i * 1000);
    ok(st.overall === 'warming' && st.waiting.join() === 'gearbox' && st.unwatched.length === 0, 'B3: no gearbox reading for 10 minutes of running, the reader could not ask the unit yet: still waited for, the car is not called ready');
    ok(!w.announce(), 'B3: and nothing is announced');
    st = w.feed(Object.assign({}, silent, { gearbox: 45 }), t += 1000);
    ok(st.overall === 'warming' && st.fluids.gearbox.state === 'warming', 'B3: the late first answer is 45 deg C: the car was right not to be called ready');
    w = make(); t = 0;
    for (let i = 0; i <= 600; i++) st = w.feed(silent, t = i * 1000);
    st = w.feed(Object.assign({}, silent, { gearboxAbsent: false }), t += 1000);
    ok(st.overall === 'warming', 'B3: the reader says it does not know yet: waited for');
    st = w.feed(noGearbox, t += 1000);
    ok(st.overall === 'ready' && st.unwatched.join() === 'gearbox', 'B3: the reader has its evidence (the unit refused, or stays silent): left out, the engine having run 90 s long since');
    w = make(); t = 0;
    for (let i = 0; i <= 600; i++) st = w.feed(noGearboxOff, t = i * 1000);
    ok(st.overall === 'off' && st.waiting.join() === 'gearbox', 'B3: evidence with the engine off (a unit that is asleep is silent too) leaves nothing out');
});
part('the 90 s before the gearbox is left out are counted over the engine run, not in one piece (warmup-B1)', () => {
    w = make(); t = 0;
    for (let i = 0; i <= 60; i++) st = w.feed(noGearbox, t = i * 1000);
    for (let i = 0; i < 12; i++) st = w.feed(noGearboxOff, t += 1000);
    ok(st.overall === 'off' && st.waiting.join() === 'gearbox' && st.unwatched.length === 0, 'B1: a manual car in stop-and-go traffic, 60 s running and 12 s stopped: waited for so far');
    for (let i = 0; i < 30; i++) st = w.feed(noGearbox, t += 1000);
    ok(st.overall === 'warming' && st.unwatched.length === 0, 'B1: running again, until the engine has run 90 s in all: still waited for');
    for (let i = 0; i < 2; i++) st = w.feed(noGearbox, t += 1000);
    ok(st.overall === 'ready' && st.unwatched.join() === 'gearbox', 'B1: then left out, 32 s into the second stretch (it took 90 s in one piece, which stop-and-go traffic never gives)');
    // ... but only on evidence the reader has while the engine runs
    w = make(); t = 0;
    for (let i = 0; i <= 100; i++) st = w.feed(Object.assign({}, noGearbox, { gearboxAbsent: false }), t = i * 1000);
    for (let i = 0; i < 60; i++) st = w.feed(noGearboxOff, t += 1000);
    ok(st.overall === 'off' && st.waiting.join() === 'gearbox' && st.unwatched.length === 0, 'B3: the engine ran 100 s while the reader could not ask, and the evidence only turns up with the engine off (a unit that is asleep): nothing is left out');
    st = w.feed(Object.assign({}, noGearbox, { gearboxAbsent: false }), t += 1000);
    ok(st.overall === 'warming' && st.unwatched.length === 0, 'B3: nor at the restart, while the reader does not know yet');
    st = w.feed(noGearbox, t += 15000);
    ok(st.overall === 'ready' && st.unwatched.join() === 'gearbox', 'B3: left out once the reader has its evidence with the engine running');
    // ... and a new engine run starts the 90 s again
    w = make(); t = 0;
    for (let i = 0; i <= 60; i++) st = w.feed(noGearbox, t = i * 1000);
    for (let i = 0; i < 301; i++) st = w.feed(noGearboxOff, t += 1000);
    for (let i = 0; i < 60; i++) st = w.feed(noGearbox, t += 1000);
    ok(st.overall === 'warming' && st.unwatched.length === 0, 'the engine off for 5 minutes in between: the 60 s before that stop no longer count');
    for (let i = 0; i < 32; i++) st = w.feed(noGearbox, t += 1000);
    ok(st.overall === 'ready' && st.unwatched.join() === 'gearbox', 'left out after 90 s of the new engine run');
});

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
for (let i = 0; i <= 120; i++) st = w.feed(Object.assign({}, noGearbox, { oil: null }), t = i * 1000);
ok(st.overall === 'warming' && st.waiting.join() === 'oil' && st.unwatched.join() === 'gearbox', 'coolant alone never makes the car ready: the gearbox is left out, engine oil is still waited for');
st = w.feed(noGearbox, t += 1000);
ok(st.overall === 'ready' && st.unwatched.join() === 'gearbox', 'the engine oil reading arrives warm: ready, with the gearbox named as not monitored');
ok(!w.announce(), 'and not announced, because no fluid was read below its "safe from"');
for (let i = 0; i < 95; i++) st = w.feed(Object.assign({}, noGearbox, { oil: null }), t += 1000);
ok(st.overall === 'warming' && st.waiting.join() === 'oil', 'an engine oil reading that is lost again, for over 90 s: the car is not called ready');

console.log('the announcement is made once, and only while it is true');
const cold = { rpm: 900, speed: 0, oil: 20, gearbox: 20, coolant: 22 }, warmed = { rpm: 2000, speed: 50, oil: 90, gearbox: 65, coolant: 85 };
w = make(); t = 0; w.feed(cold, t); st = w.feed(warmed, t += 1000);
ok(st.overall === 'ready' && w.status(t).readyAt === t, 'status() says when the car came up to temperature, so the screen can tell news from old news');
ok(w.announce() === true, 'a watched warm-up: announced');
st = w.feed(Object.assign({}, warmed, { gearbox: null }), t += 5000);
ok(st.overall === 'ready' && st.waiting.length === 0, 'once warm, the gearbox reading drops out for a moment: the car stays ready on its last reading');
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

part('once ready, a small dip does not bring "Warming up" back (the fault added on coolant sagging mid-drive)', () => {
    const FLUIDS = ['oil', 'gearbox', 'coolant'];
    const fresh = () => { w = new WarmUp(() => limitsFrom((k) => dflt[k])); t = 0; w.feed({ rpm: 900, speed: 0, oil: 30, gearbox: 30, coolant: 30 }, t); return w.feed({ rpm: 3000, speed: 100, oil: 100, gearbox: 85, coolant: 95 }, t += 600000); };
    const load = (coolant, more) => Object.assign({ rpm: 5500, speed: 140, oil: 105, gearbox: 90, coolant }, more);
    st = fresh();
    ok(st.overall === 'ready' && w.announce() === true, 'a watched warm-up with the presets (80 / 60 / 80): ready, announced');
    const seen = [];
    for (const c of [82, 79, 77, 76, 72, 68, 65]) { st = w.feed(load(c), t += 1000); seen.push(st.overall + (w.status(t).over ? ' OVER' : '') + ':' + st.fluids.coolant.state); }
    ok(seen.every((x) => /^ready:/.test(x)), 'coolant sags from 82 to 65 at 5,500 rpm: the car stays up to temperature all the way, no "Warming up", no "Ease off" (' + seen.join(' ') + ')');
    ok(st.fluids.coolant.state === 'dip' && st.waiting.length === 0 && st.fluids.coolant.temp === 65, 'coolant itself is shown as dipped, with its live reading, and is not waited for');
    st = w.feed(load(77), t += 1000);
    ok(st.fluids.coolant.state === 'dip', 'back at 77: still shown as dipped until it reaches its "safe from" again');
    st = w.feed(load(80), t += 700000);
    ok(st.overall === 'ready' && st.fluids.coolant.state === 'ready' && w.announce() === false, 'back at 80 more than 10 minutes later: ready, and not announced a second time');
    st = w.feed(load(64), t += 1000);
    ok(st.overall === 'warming' && st.waiting.join() === 'coolant', 'more than 15 under its "safe from" (64): that is a cold fluid, not a dip: warming up again');
    st = w.feed(load(70), t += 1000);
    ok(st.overall === 'warming' && w.status(t).over === true, 'and at 70 it still is, with the rev warning back: having been ready no longer covers it');
    st = w.feed(load(80), t += 60000);
    ok(st.overall === 'ready', 'at 80 it is ready again');
    // oil and gearbox are held to the same rule
    st = w.feed(load(95, { oil: 70, gearbox: 50 }), t += 1000);
    ok(st.overall === 'ready' && st.fluids.oil.state === 'dip' && st.fluids.gearbox.state === 'dip', 'engine oil and gearbox oil 10 under on a car that was ready: shown as dipped, the car stays ready');
    // too hot, and a reading that is lost, are never covered
    st = w.feed(load(116), t += 1000);
    ok(st.overall === 'hot', 'too hot is still too hot');
    st = w.feed(load(95, { oil: null }), t += 1000);
    ok(st.overall === 'warming' && st.waiting.join() === 'oil', 'a lost engine oil reading still takes "ready" away: the car is never called ready without one');
    // the engine stops
    st = fresh();
    for (let i = 0; i < 120; i++) st = w.feed({ rpm: 0, speed: 0, oil: 100, gearbox: 85, coolant: 76 }, t += 1000);
    ok(st.overall === 'ready' && st.fluids.coolant.state === 'dip', 'a 2-minute stop (start-stop, lights) with coolant at 76: the same engine run, still ready');
    st = w.feed(load(76), t += 1000);
    ok(st.overall === 'ready' && w.status(t).over === false, 'restarted: ready, nothing flagged');
    for (let i = 0; i < 301; i++) st = w.feed({ rpm: 0, speed: 0, oil: 100, gearbox: 85, coolant: 76 }, t += 1000);
    ok(st.overall === 'off' && st.waiting.join() === 'coolant', 'the engine off for 5 minutes: that engine run is over, and a fluid 4 under its "safe from" is waited for again');
    // never hidden: a fluid that is cold after a long stop
    st = fresh();
    st = w.feed({ rpm: 0, speed: 0, oil: 100, gearbox: 85, coolant: 95 }, t += 1000);
    st = w.feed({ rpm: 900, speed: 0, oil: 72, gearbox: 55, coolant: 70 }, t += 3600000);
    ok(st.overall === 'warming' && st.waiting.join() === 'oil,gearbox,coolant' && FLUIDS.every((k) => st.fluids[k].state === 'warming'), 'an hour parked, restarted with every fluid 5 to 10 under: warming up, none of them passed off as a dip');
    st = w.feed({ rpm: 4500, speed: 30, oil: 72, gearbox: 55, coolant: 70 }, t += 1000);
    ok(w.status(t).over === true, 'and revving it is flagged');
    st = fresh();
    for (let i = 0; i < 360; i++) st = w.feed({ rpm: 0, speed: 0, oil: 100, gearbox: 85, coolant: 95 }, t += 1000);
    ok(st.overall === 'ready', 'six minutes parked, readings still in range: still up to temperature');
    st = w.feed({ rpm: 900, speed: 0, oil: 100, gearbox: 85, coolant: 76 }, t += 1000);
    ok(st.overall === 'warming' && st.waiting.join() === 'coolant', 'but a fluid found 4 under its "safe from" after that stop is warming up, not a dip');
    // the head unit slept: the steady clock stood still (main.js then calls endRun())
    st = fresh(); w.endRun();
    st = w.feed({ rpm: 900, speed: 0, oil: 100, gearbox: 85, coolant: 76 }, t += 1000);
    ok(st.overall === 'warming' && st.waiting.join() === 'coolant', 'the same when the stop was not counted by the clock (the head unit slept): endRun() ends the engine run');
    // a limit changed in Workshop settings is applied at once
    const lims = Object.assign({}, dflt); w = new WarmUp(() => limitsFrom((k) => lims[k])); t = 0;
    st = w.feed({ rpm: 2000, speed: 50, oil: 85, gearbox: 70, coolant: 90 }, t);
    lims.readyOil = 90; st = w.feed({ rpm: 2000, speed: 50, oil: 85, gearbox: 70, coolant: 90 }, t += 1000);
    ok(st.overall === 'warming' && st.waiting.join() === 'oil', 'engine oil "safe from" raised to 90 with the oil at 85 on a ready car: not ready, and not a dip either');
});

part('"ready through a small dip" is earned with the engine running, on an engine run this app watched', () => {
    const mk = () => { w = new WarmUp(() => limitsFrom((k) => dflt[k])); t = 0; };
    const parked = (oil, gearbox, coolant) => ({ rpm: 0, speed: 0, oil, gearbox, coolant });
    const idle = (oil, gearbox, coolant) => ({ rpm: 900, speed: 0, oil, gearbox, coolant });
    const hard = (oil, gearbox, coolant) => ({ rpm: 4500, speed: 50, oil, gearbox, coolant });
    const dips = () => ['oil', 'gearbox', 'coolant'].filter((k) => st.fluids[k].state === 'dip').join();
    // the head unit starts on a parked car (a new app: it cannot know how long the car stood), the engine stays off
    mk(); st = w.feed(parked(82, 62, 81), t);
    ok(st.overall === 'ready', 'the app starts on a parked car that reads 82 / 62 / 81 with the engine off: in range, on its readings');
    for (let i = 1; i <= 180; i++) st = w.feed(parked(82 - i / 30, 62 - i / 60, 81 - i / 30), t += 1000);
    ok(st.overall === 'off' && st.waiting.join() === 'oil,coolant' && dips() === '', 'three minutes later it reads 76 / 59 / 75 and the engine was never started: "Engine off", waiting for engine oil and coolant (they were passed off as "dipped a little" on a car called ready)');
    st = w.feed(idle(76, 59, 75), t += 1000); st = w.feed(hard(76, 59, 75), t += 1000);
    ok(st.overall === 'warming' && st.cold.join() === 'oil,coolant' && w.status(t).over === true, 'started and revved to 4,500 rpm: warming up, and flagged (it was "Up to temperature" with no rev advice for the whole drive)');
    // the engine is started on a car found in range: sensors that were heat-soaked settle lower once it runs
    mk(); st = w.feed(idle(84, 66, 83), t);
    for (let i = 0; i < 19; i++) st = w.feed(idle(84, 66, 83), t += 1000);
    ok(st.overall === 'ready', 'a car found at 84 / 66 / 83 when the engine starts: up to temperature, on its readings');
    st = w.feed(hard(76, 66, 72), t += 1000);
    ok(st.overall === 'warming' && st.waiting.join() === 'oil,coolant' && w.status(t).over === true, '20 s later they have settled at 76 / 66 / 72, at 4,500 rpm: warming up, and flagged (it was a "dip")');
    mk(); st = w.feed(idle(84, 66, 83), t);
    for (let i = 0; i < 119; i++) st = w.feed(idle(84, 66, 83), t += 1000);
    st = w.feed(hard(76, 66, 72), t += 1000);
    ok(st.overall === 'warming', 'the same drop after 1 min 59 s of running in range: still warming up');
    mk(); st = w.feed(idle(84, 66, 83), t);
    for (let i = 0; i < 120; i++) st = w.feed(idle(84, 66, 83), t += 1000);
    st = w.feed(hard(76, 66, 72), t += 1000);
    ok(st.overall === 'ready' && dips() === 'oil,coolant' && w.status(t).over === false, 'after 2 minutes of running in range the car has shown it is warm: the same drop is a dip, the car stays ready');
    // the two minutes are engine running time
    mk(); st = w.feed(idle(84, 66, 83), t);
    for (let i = 0; i < 60; i++) st = w.feed(idle(84, 66, 83), t += 1000);
    for (let i = 0; i < 90; i++) st = w.feed(parked(84, 66, 83), t += 1000);
    for (let i = 0; i < 30; i++) st = w.feed(idle(84, 66, 83), t += 1000);
    st = w.feed(hard(76, 66, 72), t += 1000);
    ok(st.overall === 'warming', 'found in range, 60 s running, 90 s stopped, 30 s running: three minutes in range but only a minute and a half of them running: the drop is "Warming up"');
    mk(); st = w.feed(idle(84, 66, 83), t);
    for (let i = 0; i < 60; i++) st = w.feed(idle(84, 66, 83), t += 1000);
    for (let i = 0; i < 20; i++) st = w.feed(parked(84, 66, 83), t += 1000);
    for (let i = 0; i < 60; i++) st = w.feed(idle(84, 66, 83), t += 1000);
    st = w.feed(hard(76, 66, 72), t += 1000);
    ok(st.overall === 'ready' && dips() === 'oil,coolant', 'a stop at the lights does not start the two minutes again: 60 s running, 20 s stopped, 60 s running, and the drop is a dip');
    // coming into range with the engine off is the sensors soaking, not a warm-up
    mk(); st = w.feed(idle(70, 62, 76), t);
    for (let i = 0; i < 30; i++) st = w.feed(idle(74, 62, 76), t += 1000);
    for (let i = 0; i < 60; i++) st = w.feed(parked(81, 62, 82), t += 1000);
    ok(st.overall === 'ready', 'read at 74 / 62 / 76 while running, then 81 / 62 / 82 with the engine stopped (heat soak): in range, on its readings');
    st = w.feed(idle(81, 62, 82), t += 1000); st = w.feed(hard(75, 62, 76), t += 5000);
    ok(st.overall === 'warming' && w.status(t).over === true, 'restarted, and back at 75 / 62 / 76 within seconds at 4,500 rpm: warming up, and flagged (it was a "dip": the warm-up was never finished)');
    st = w.feed(hard(80, 63, 80), t += 60000);
    st = w.feed(hard(76, 63, 75), t += 1000);
    ok(st.overall === 'ready' && dips() === 'oil,coolant', 'once it has come into range with the engine running, as this app watched, a drop after that is a dip');
    // a new engine run has to be earned again
    mk(); w.feed(idle(30, 30, 30), t); st = w.feed(hard(100, 85, 95), t += 600000);
    for (let i = 0; i < 400; i++) st = w.feed(parked(100, 85, 95), t += 1000);
    st = w.feed(idle(100, 85, 95), t += 1000);
    for (let i = 0; i < 19; i++) st = w.feed(idle(95, 85, 88), t += 1000);
    st = w.feed(hard(86, 85, 76), t += 1000);
    ok(st.overall === 'warming' && st.waiting.join() === 'coolant' && w.status(t).over === true, 'a watched warm-up, then parked for over 5 minutes and restarted in range; 20 s later coolant has settled at 76: warming up (it was a "dip" from the second second of the new engine run)');
    // the app did not run for a while (no feed), the engine running at its last look and at its next
    mk(); w.feed(idle(30, 30, 30), t); st = w.feed(hard(100, 85, 95), t += 60000);
    for (let i = 0; i < 60; i++) st = w.feed(hard(100, 85, 95), t += 1000);
    st = w.feed(hard(76, 85, 75), t += 240000);
    ok(st.overall === 'ready' && dips() === 'oil,coolant', 'a watched warm-up, then nothing fed for 4 minutes: the same engine run, a drop is a dip');
    st = w.feed(hard(100, 85, 95), t += 1000);
    st = w.feed(hard(70, 85, 68), t += 2400000);
    ok(st.overall === 'warming' && st.waiting.join() === 'oil,coolant' && w.status(t).over === true, 'nothing fed for 40 minutes (the app did not run), then 70 / 85 / 68 at 4,500 rpm: what the car did meanwhile is not known, so that engine run is over: warming up, and flagged (it was a "dip")');
    // a car that gives no engine speed never earns it
    mk(); for (let i = 0; i < 300; i++) st = w.feed({ oil: 84, gearbox: 66, coolant: 83 }, t += 1000);
    st = w.feed({ oil: 76, gearbox: 66, coolant: 72 }, t += 1000);
    ok(st.overall === 'warming' && dips() === '', 'a car that gives no engine speed at all: a fluid under its "safe from" is never called a dip');
});

part('the time to ready: nothing before a minute is measured, and one cap (warmup-B7)', () => {
    w = make(); t = 0;
    const figures = [];
    for (let s = 0; s <= 59; s++) { st = w.feed({ rpm: 800, speed: 0, oil: 20, gearbox: 20, coolant: 20 }, t = s * 1000); figures.push(st.min, st.fluids.oil.min, st.fluids.gearbox.min, st.fluids.coolant.min); }
    ok(figures.every((x) => x === null) && st.overall === 'warming' && st.fluids.oil.state === 'warming', 'B7: cold idle, the first minute: warming up, and no time figure yet for the car or any fluid');
    const later = [];
    for (let s = 60; s <= 95; s++) { st = w.feed({ rpm: 800, speed: 0, oil: 20, gearbox: 20, coolant: 20 }, t = s * 1000); later.push(st.min, st.fluids.oil.min, st.fluids.gearbox.min, st.fluids.coolant.min); }
    ok(later.every((x) => x !== null && x <= 60) && later.some((x) => x === 60), 'B7: readings that have not moved yet: no figure over 60 minutes anywhere (it was 50 rising to 250)');
    ok(st.capped === true && st.min === 60 && st.fluids.oil.capped === true && st.fluids.oil.min === 60, 'B7: the decision itself says "over 60": the car\'s figure and the fluid\'s carry the same cap');
    w = make(); t = 0;
    for (let s = 0; s <= 180; s++) st = w.feed({ rpm: 2000, speed: 60, oil: 25 + s * 0.1, gearbox: 70, coolant: 90 }, t = s * 1000);
    ok(st.capped === false && st.fluids.oil.capped === false && Math.abs(st.min - 7) < 0.5, 'B7: a real figure is not capped (7 min)');
});

part('the time to ready is measured on a running engine only (warmup-B7)', () => {
    // oil +4, gearbox +3, coolant +7 deg C a minute from 20: engine oil is the slowest, (85 - 20) / 4 minutes
    const drive = (s) => ({ rpm: 2000, speed: 50, oil: 20 + s * 4 / 60, gearbox: 20 + s * 3 / 60, coolant: 20 + s * 7 / 60 });
    /** The next sec seconds of that drive (from its second s0 on): true when no figure was given and no fluid was "not warming". */
    const first = (sec, s0) => {
        const figures = [], states = [];
        for (let s = 1; s <= sec; s++) { st = w.feed(drive(s0 + s), t += 1000); figures.push(st.min, st.fluids.oil.min, st.fluids.gearbox.min, st.fluids.coolant.min); states.push(st.fluids.oil.state, st.fluids.gearbox.state, st.fluids.coolant.state); }
        return figures.every((x) => x === null) && states.every((x) => x === 'warming');
    };
    w = make(); t = 0;
    for (let s = 0; s < 100; s++) st = w.feed({ rpm: 0, speed: 0, oil: 20, gearbox: 20, coolant: 20 }, t += 1000);
    ok(st.overall === 'off' && st.min === null, 'B7: the ignition on for 100 s before the start, readings standing at 20: "Engine off", no figure');
    ok(first(59, 0), 'B7: then started and driven: no figure and no "not warming" in the first 59 s of running (the rows read "READY IN OVER 60 MIN" and "NOT WARMING" from the first second, and the status line "over 60 min" for over a minute)');
    for (let s = 60; s <= 65; s++) st = w.feed(drive(s), t += 1000);
    ok(st.capped === false && Math.abs(st.min - (85 - 20 - 65 * 4 / 60) / 4) < 1.5, 'B7: at 65 s the figure is the real one, about ' + ((85 - 20 - 65 * 4 / 60) / 4).toFixed(0) + ' min (got ' + (st.min === null ? 'none' : st.min.toFixed(1)) + '; it was about 44, thinned by the readings from before the start)');
    // a stop in the middle of a warm-up
    w = make(); t = 0;
    for (let s = 0; s <= 120; s++) st = w.feed(drive(s), t += 1000);
    ok(st.min !== null && st.capped === false, 'two minutes into a warm-up: a figure');
    for (let s = 0; s < 10; s++) st = w.feed(Object.assign(drive(120), { rpm: 0, speed: 0 }), t += 1000);
    st = w.feed(drive(121), t += 1000);
    ok(st.min !== null && Math.abs(st.min - (85 - 20 - 121 * 4 / 60) / 4) < 2.5, 'a 10 s stop at the lights: the figure is back at the restart, and still sensible (' + (st.min === null ? 'none' : st.min.toFixed(1)) + ' min)');
    for (let s = 0; s < 45; s++) st = w.feed(Object.assign(drive(121), { rpm: 0, speed: 0 }), t += 1000);
    ok(st.overall === 'off' && st.min === null, 'B7: a 45 s stop: "Engine off", no figure');
    ok(first(59, 121), 'B7: and after it the measuring starts afresh: no figure in the first 59 s of running, rather than one thinned by the stop');
});

part('"Ease off": the revs that raised it, and only when a fluid is read cold (warmup-B8)', () => {
    w = make(); t = 0;
    w.feed({ rpm: 2000, speed: 60, oil: 30, gearbox: 25, coolant: 40 }, t);
    w.rev(4500, t + 300); w.rev(4800, t + 400); w.rev(2100, t + 600);
    st = w.feed({ rpm: 2100, speed: 60, oil: 30, gearbox: 25, coolant: 40 }, t += 1000);
    ok(w.status(t).over === true, 'B8: a burst past the limit between two once-a-second checks is flagged (the car sends its engine speed several times a second)');
    ok(w.status(t).overRpm === 4800, 'B8: with the highest engine speed of the burst, not the live 2,100 rpm');
    ok(w.status(t + 2500).over === false && w.status(t + 2500).overRpm === null, 'B8: gone 2.5 s after the last engine speed over the limit');
    ok(st.cold.join() === 'oil,gearbox,coolant', 'B8: status() names the fluids read below their "safe from"');
    w = make(); t = 0;
    w.feed({ rpm: 900, speed: 0, oil: 30, gearbox: 30, coolant: 30 }, t);
    w.feed({ rpm: 2000, speed: 60, oil: 95, gearbox: 70, coolant: 95 }, t += 1000);
    for (let i = 0; i < 20; i++) st = w.feed({ rpm: 2000, speed: 60, oil: null, gearbox: 70, coolant: 95 }, t += 1000);
    st = w.feed({ rpm: 4500, speed: 100, oil: null, gearbox: 70, coolant: 95 }, t += 1000); w.rev(5000, t + 100);
    ok(st.overall === 'warming' && st.cold.length === 0 && w.status(t + 200).over === false, 'B8: a warm car that lost its engine oil reading, at 4,500 rpm: waited for, but not told to ease off (nothing is read cold)');
    w = make(); t = 0;
    w.feed({ rpm: 2000, speed: 60, oil: 95, gearbox: 45, coolant: 90 }, t); w.rev(5000, t + 100);
    ok(w.status(t + 200).over === true && w.status(t + 200).cold.join() === 'gearbox', 'B8: with only the gearbox read below its "safe from" it is flagged, and the screen can say that the engine itself is not cold');
    const lims = Object.assign({}, base); w = new WarmUp(() => limitsFrom((k) => lims[k])); t = 0;
    w.feed({ rpm: 4200, speed: 60, oil: 30, gearbox: 25, coolant: 40 }, t);
    lims.coldLimit = 0;
    ok(w.status(t + 100).over === false, 'B8: the rev limit set to None while the warning shows: it goes at once (no "keep below 0 rpm")');
});

part('the widget\'s progress is measured from the start of the warm-up (warmup-B14)', () => {
    w = make(); t = 0;
    const p = [];
    for (let s = 0; s <= 480; s++) { st = w.feed({ rpm: 900, speed: 0, oil: Math.min(50, 20 + s * 0.25), gearbox: 70, coolant: 90 }, t = s * 1000); p.push(st.fluids.oil.progress); }
    ok(p.every((x, i) => i === 0 || x >= p[i - 1] - 1e-9), 'B14: oil rises to 50 and stays there for 6 minutes: its progress never runs backwards (it fell from 0.50 to 0)');
    ok(Math.abs(st.fluids.oil.progress - (50 - 20) / (85 - 20)) < 0.005, 'B14: 20 -> 50 on the way to 85 is ' + ((50 - 20) / (85 - 20)).toFixed(2) + ' (got ' + st.fluids.oil.progress.toFixed(2) + ')');
    w = make(); t = 0;
    for (let s = 0; s <= 480; s++) st = w.feed({ rpm: 2000, speed: 60, oil: 20 + s * 5 / 60, gearbox: 70, coolant: 90 }, t = s * 1000);
    ok(Math.abs(st.fluids.oil.progress - (60 - 20) / (85 - 20)) < 0.005, 'B14: a steady warm-up reads right too: 60 of 20 -> 85 after 8 minutes is ' + ((60 - 20) / (85 - 20)).toFixed(2) + ', not the 0.50 a sliding start gave');
    w = make(); st = w.feed({ rpm: 900, speed: 0, oil: 80, gearbox: 70, coolant: 90 }, 0);
    ok(Math.abs(st.fluids.oil.progress - 0.75) < 1e-9, 'B14: a hot restart 5 under "safe from" starts at 0.75, as before (at least 20 deg C of scale)');
});

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
        src2.gearbox.stop();
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
    part('plausible temperatures only (warmup-B13)', () => {
        temps(48 + 90, 48 + 92); temps(48 + 90, 254); clock += 11000;
        ok(src.data().oil === undefined && src.data().coolant === 90, 'B13: a raw 254 for engine oil (206 deg C) is not a temperature: taken as "no value" and dropped after 10 s, not shown as "Too hot"');
        temps(0, 48 + 92); clock += 11000;
        ok(src.data().coolant === undefined && src.data().oil === 92, 'B13: a raw 0 for coolant (-48 deg C) the same');
        temps(8, 218);
        ok(src.data().coolant === -40 && src.data().oil === 170, 'B13: the ends of the ranges are readings: coolant -40..160, engine oil -40..170 deg C (as Proven Gauges)');
        temps(209, 219); clock += 11000;
        ok(src.data().coolant === undefined && src.data().oil === undefined, 'B13: one over the top of either range is not');
        temps(48 + 90, 48 + 92);
    });
    part('an engine speed the car stops giving is an engine that is not running (warmup-B9, kit-B1)', () => {
        const rpm = (r) => handlers.CDS.statusEngineSpeed2({ actualValueRPMEngineCrankshaft: r === null ? 65535 : r / 0.25 });
        const logged = []; src.log = { info: (m) => logged.push(m), warn() {}, error() {}, debug() {} };
        rpm(2000);
        ok(src.data().rpm === 2000, 'engine speed 2,000 rpm from the car');
        rpm(null); clock += 2000;
        ok(src.data().rpm === 2000, 'B9: the car sends "no value" in its place: kept for a moment');
        clock += 1500;
        ok(src.data().rpm === 0, 'B9: after 3 s of "no value" the engine counts as not running (it was kept for good)');
        ok(logged.length === 1 && /2000 rpm/.test(logged[0]), 'B9: said once in the log, with the speed it stopped at: ' + logged[0]);
        rpm(1500);
        ok(src.data().rpm === 1500, 'an engine speed again: taken at once');
        clock += 9000;
        ok(src.data().rpm === 1500, 'B9: nothing more from the car for 9 s: still kept');
        clock += 2000;
        ok(src.data().rpm === 0, 'B9: nothing for 10 s: not running (a running engine\'s speed arrives several times a second)');
        clock += 3600000; src.data();
        ok(src.data().rpm === 0 && logged.length === 2, 'B9: and it stays so, logged once per stop');
        const src3 = new Source({ settings: { get: (k) => vals[k], onChange() {} }, log: quiet, signals: { watch: () => Promise.resolve({ available: true, error: null }), proxy: () => Promise.reject(new Error('test')), call: () => Promise.reject(new Error('test')) } });
        clock += 60000;
        ok(src3.data().rpm === undefined, 'a car that never sent an engine speed: none is made up');
        src3.gearbox.stop();
    });
    // when the gearbox unit may be asked: the rule the gearbox reader is given
    src.wantGearbox = () => true;
    ok(src.gearbox.visible() === true, 'the gearbox unit is asked when the app wants it (setting on Auto)');
    vals.gearboxSource = 'signal';
    ok(src.gearbox.visible() === false, '"Car signal only": the gearbox unit is not asked');
    vals.gearboxSource = dflt.gearboxSource; src.wantGearbox = () => false;
    ok(src.gearbox.visible() === false, 'and not when the app does not want it');
    process.hrtime = hr;
    // (the readers' retry timers are not left running)
    src.gearbox.stop();
}

// the whole app on a stand-in car
require('./test_warmup_car')(process.argv[2], ok).then(() => {
    if (failed.length) { console.log(n + ' checks passed, ' + failed.length + ' FAILED:\n  ' + failed.join('\n  ')); process.exit(1); }
    console.log(n + ' checks, ALL OK');
    process.exit(0);
}, (e) => { console.error(e && e.stack || e); process.exit(1); });
