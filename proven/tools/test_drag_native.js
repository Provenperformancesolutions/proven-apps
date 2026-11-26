'use strict';
/**
 * test_drag_native.js <built app: dist/pps_drag> - what Proven Drag asks of the car's NATIVE binding, counted at the
 * binding itself. The built app runs on the kit's PC stand-in for the head unit (kit/tools/hu-stub.js) with the kit's
 * REAL signals.js (its one-at-a-time lane, watch(), on()) on top of a stand-in for the native module "someip", on a
 * clock the test moves by hand. test_drag_car.js replaces signals.watch() as a whole, so it cannot show what the kit
 * itself does on the app's behalf (its own first read of a field asked for with "r"); this file can.
 *
 * WHY (1.0.2): on the first car the app closed by itself. Among the few things only Proven Drag and Proven Drift did
 * to the car were getter reads of their own on a fast schedule, the GPS receiver's event, the wheel speeds, and seven
 * fields asked for with "r" (which makes the kit read each getter itself whenever the car's service comes up), five
 * of them read by no other app of this source. As shipped the app now does none of that. This file counts it.
 *
 * The stand-in binding does what it is told (how long a set-up call takes, which call fails first); what it records
 * is what the app and the kit ASK of it: buildProxy, init, subscribeToAvailability, subscribe, getValue (with the time
 * limit the caller gave: 3000 is the kit's own read, 1000 the app's), isAvailable, setValue, callMethod, shutdown.
 * It follows checks/crash-native/nativebench.js of the first car's investigation. The interface files it writes are a
 * guess at what the head unit's installer makes of the manifest (the kit only looks at fields[f].getter in them).
 *
 * What this cannot show: the real binding, the real installer, a car. Node here is the PC's, the car's is Node 8.
 *
 * PPS_TEST_ALL=1 in the environment: a failed check does not stop the run; they are listed at the end.
 */
const fs = require('fs'), os = require('os'), path = require('path'), Module = require('module'), EventEmitter = require('events');
const sim = require('./dragsim');
const { checker } = require('./fakecar');

if (!process.argv[2]) { console.error('usage: node proven/tools/test_drag_native.js dist/pps_drag'); process.exit(2); }
const BUILT = path.resolve(process.argv[2]);
const ok = checker();
const real = { setImmediate };

/* ---------- a copy of the built app to stand it on (the interface files go beside its source, as on the car) ---------- */
const TOP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pps-drag-native-')));      // (the real path: node keeps the modules it has loaded under it)
process.on('exit', () => { try { fs.rmSync(TOP, { recursive: true, force: true }); } catch (e) { /* gone */ } });
const STAGE = path.join(TOP, 'pps_drag'), JS = path.join(STAGE, 'source', 'javascript');
fs.cpSync(BUILT, STAGE, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(STAGE, 'source', 'manifest.json'), 'utf8')).proxies;
fs.mkdirSync(path.join(STAGE, 'someipInterfaces'));
Object.keys(manifest).forEach((iface) => {
    const e = manifest[iface];
    if (!e || typeof e !== 'object') return;
    const cfg = { interface: iface, fields: {}, events: {} };
    Object.keys(e.attributes || {}).forEach((f) => { cfg.fields[f] = {}; if (e.attributes[f].indexOf('r') >= 0) cfg.fields[f].getter = { id: 1 }; if (e.attributes[f].indexOf('s') >= 0) cfg.fields[f].notifier = { id: 2 }; });
    (e.broadcasts || []).forEach((b) => { cfg.events[b] = { id: 4 }; });
    fs.writeFileSync(path.join(STAGE, 'someipInterfaces', iface.replace(/\./g, '_') + '.json'), JSON.stringify(cfg));
});

/* ---------- the clock ---------- */
const clock = { mono: 100000, wall: Date.UTC(2026, 10, 25, 9, 0, 0), timers: [], id: 1 };
const timer = (fn, ms, every, args) => { const t = { id: clock.id++, at: clock.mono + Math.max(0, Number(ms) || 0), every, fn: () => fn.apply(null, args) }; clock.timers.push(t); return t.id; };
global.setTimeout = (fn, ms, ...args) => timer(fn, ms, 0, args);
global.setInterval = (fn, ms, ...args) => timer(fn, ms, Math.max(1, Number(ms) || 1), args);
global.setImmediate = (fn, ...args) => timer(fn, 0, 0, args);
global.clearTimeout = global.clearInterval = global.clearImmediate = (id) => { clock.timers = clock.timers.filter((t) => t.id !== id); };
Date.now = () => clock.wall;
process.hrtime = () => [Math.floor(clock.mono / 1000), Math.round((clock.mono % 1000) * 1e6)];
const settle = () => new Promise((resolve) => real.setImmediate(resolve));
let current = null;
async function advance(ms) {
    const end = clock.mono + ms;
    await settle();
    for (;;) {
        let due = null;
        clock.timers.forEach((t) => { if (t.at <= end && (!due || t.at < due.at || (t.at === due.at && t.id < due.id))) due = t; });
        if (!due) break;
        const step = Math.max(0, due.at - clock.mono);
        clock.mono += step; clock.wall += step;
        if (due.every) due.at = clock.mono + due.every; else clock.timers = clock.timers.filter((t) => t !== due);
        // (an exception out of a timer is, on the car, an uncaught exception: the kit then exits with code 1)
        try { due.fn(); } catch (e) { if (current) current.uncaught.push(e); else throw e; }
        await settle();
    }
    clock.wall += end - clock.mono; clock.mono = end;
    await settle();
}

/* ---------- the stand-in native binding ---------- */
const short = (i) => i.split('.').pop();
/**
 * o: setupMs (each set-up call takes this long: 20), getMs (25; 'never': a read is not answered at all),
 *    buildFail { Powertrain: n } (the first n buildProxy of it reject),
 *    availEarly (true: the binding says "available" through its callback the moment the app asks to be told, and
 *    isAvailable() says false afterwards: all the kit then knows of the service is that one callback, and its own
 *    first read is made and answered before the set-up of the subscription has returned to the app)
 */
function makeBinding(o, run) {
    const B = { proxies: [], busy: 0 };
    const after = (ms, fn) => new Promise((res, rej) => setTimeout(() => { try { res(fn ? fn() : undefined); } catch (e) { rej(e); } }, ms));
    const note = (c) => { c.t = clock.mono; c.setupBusy = B.busy; run.calls.push(c); return c; };
    const setup = (p) => { B.busy++; const fin = () => { B.busy--; run.lastSetupEnd = clock.mono; }; return after(o.setupMs == null ? 20 : o.setupMs).then(() => p()).then((v) => { fin(); return v; }, (e) => { fin(); throw e; }); };
    const left = (map, key) => { if (map && map[key] > 0) { map[key]--; return true; } return false; };
    B.module = {
        buildProxy(cfg, instance) {
            const name = short(cfg.interface);
            note({ type: 'buildProxy', iface: name, instance });
            return setup(() => {
                if (left(o.buildFail, name)) throw new Error('standin: buildProxy failed (service not up yet)');
                const P = { name, subs: {}, up: false, avail: null };
                B.proxies.push(P);
                return {
                    init() { note({ type: 'init', iface: name }); return setup(() => {}); },
                    subscribeToAvailability(cb) { note({ type: 'subscribeToAvailability', iface: name }); if (o.availEarly) { P.avail = cb; P.up = true; cb(true); return Promise.resolve(); } return setup(() => { P.avail = cb; P.up = true; }); },
                    isAvailable() { note({ type: 'isAvailable', iface: name }); return o.availEarly ? false : P.up; },
                    subscribe(x) { note({ type: 'subscribe', iface: name, name: x && x.name }); return setup(() => { (P.subs[x.name] = P.subs[x.name] || []).push(x.onReceive); }); },
                    getValue(field, limit) {
                        note({ type: 'getValue', iface: name, name: field, limit });
                        if (o.getMs === 'never') return new Promise(() => {});
                        return after(o.getMs == null ? 25 : o.getMs, () => run.car.value(name, field, clock.mono - 8));
                    },
                    setValue(field) { note({ type: 'setValue', iface: name, name: field }); return Promise.reject(new Error('standin: read only')); },
                    callMethod(method) { note({ type: 'callMethod', iface: name, name: method }); return Promise.reject(new Error('standin: read only')); },
                    shutdown() { note({ type: 'shutdown', iface: name }); return Promise.resolve(); },
                };
            });
        },
    };
    /** A notification (or an event) from the car: every proxy of that interface that subscribed gets it. Returns how many did. */
    B.send = (name, field, value) => { let n = 0; B.proxies.forEach((P) => { if (P.name === name) (P.subs[field] || []).forEach((fn) => { n++; fn(value); }); }); return n; };
    return B;
}
const realLoad = Module._load;
Module._load = function (req) { if (req === 'someip' && current) return current.binding.module; return realLoad.apply(this, arguments); };

/* ---------- the stand-in car: like the first one (speed notified every 21 ms on change, acceleration every 100 ms, GPS once a second) ---------- */
const sentence = (body) => { let x = 0; for (let i = 0; i < body.length; i++) x ^= body.charCodeAt(i); return '$' + body + '*' + x.toString(16).toUpperCase().padStart(2, '0'); };
function makeCar(run) {
    const car = { plan: () => 0 };
    const v = (t) => Math.max(0, Number(car.plan(t)) || 0);
    const rawSpeed = (t) => Math.max(0, Math.min(65534, Math.round(v(t) / 0.015625)));
    const rawAccel = (t) => Math.round(((v(t + 5) - v(t - 5)) / 3.6 / 0.01 + 65) / 0.002);
    car.value = (name, field, t) => (name === 'Vehicle2' && field === 'statusCarSpeed2' ? { speedVehicleCentreOfGravity: rawSpeed(t) } : name === 'CDS2' ? { longitudinalAccelerationCentreOfGravity: rawAccel(t) } : {});
    car.sent = {};
    const send = (name, field, value) => { car.sent[name + '.' + field] = (car.sent[name + '.' + field] || 0) + run.binding.send(name, field, value); };
    let lastS = null, n = 0;
    car.start = () => {
        setInterval(() => { const r = rawSpeed(clock.mono); if (r === lastS) return; lastS = r; setTimeout(() => send('Vehicle2', 'statusCarSpeed2', { speedVehicleCentreOfGravity: r }), 12); }, 21);
        setInterval(() => send('CDS2', 'statusLongitudinalAccelerationMassCenter', { longitudinalAccelerationCentreOfGravity: rawAccel(clock.mono) + (n++ % 2) }), 100);
        setInterval(() => { const w = Math.round(v(clock.mono) * 16); send('Powertrain', 'ActualValueRPMWheel', { actualValueRPMWheelFLH: w, actualValueRPMwheelFRH: w, actualValueRPMWheelRLH: w, actualValueRPMWheelRRH: w }); }, 50);
        setInterval(() => {
            const rmc = 'GPRMC,090000.00,A,0000.0000,N,00000.0000,E,' + (v(clock.mono) / 1.852).toFixed(3) + ',,251126,,,A', gga = 'GPGGA,090000.00,0000.0000,N,00000.0000,E,1,09,0.9,31.0,M,47.0,M,,';
            send('SatellitePositioning', 'updatePosition', { nmeaString: [rmc, gga].map(sentence).join('\r\n') + '\r\n', delayCounter: 2 });
            send('GPSData', 'GPSPositionCAN', { positionGPSLatitudeCAN: 4294967295, positionGPSLongitudeCAN: 4294967295 });
            send('GPSData', 'GPSPositionExtendedCAN', { statusHeightGPSCAN: 32799 });
            send('Positioning', 'currentLocation', { coordinatesValid: false });
            send('VehicleModel', 'LaneSlope', { laneSlope: 80 + (n % 3) });
            send('Vehicle2', 'statusWheeltravel', { mileageWheelFLH: n, mileageWheelFRH: n });
            send('Vehicle2', 'statusWheeltravelRear', { mileageWheelRLH: n, mileageWheelRRH: n });
        }, 1000);
    };
    return car;
}

/* ---------- the app ---------- */
const { headUnit } = require(path.resolve(__dirname, '..', '..', 'kit', 'tools', 'hu-stub.js'));
async function boot(opts) {
    opts = opts || {};
    clock.timers = []; clock.mono = Math.ceil(clock.mono);
    Object.keys(require.cache).forEach((f) => { if (f.indexOf(JS + path.sep) === 0) delete require.cache[f]; });
    const run = { calls: [], logs: [], uncaught: [], lastSetupEnd: null, screen: true, t0: clock.mono };
    run.binding = makeBinding(opts, run);
    run.car = makeCar(run);
    current = run;
    const log = {};
    ['info', 'warn', 'error', 'debug'].forEach((l) => { log[l] = function () { run.logs.push((l === 'info' ? '' : l.toUpperCase() + ' ') + Array.prototype.map.call(arguments, (x) => (x && x.stack) || String(x)).join(' ')); }; });
    run.dataDir = fs.mkdtempSync(path.join(TOP, 'data-'));
    process.env.PPS_BOX_TMP = fs.mkdtempSync(path.join(TOP, 'ram-'));
    const quiet = console.log; console.log = () => {};
    const hu = headUnit(STAGE, { dataDir: run.dataDir, fresh: true, sets: Object.assign({ demo: 'off' }, opts.sets), image: () => Promise.resolve(), log });
    run.hu = hu; run.settings = hu.settings;
    hu.ctx.signals = require(path.join(JS, 'kit', 'signals.js'));      // the kit's own, on the stand-in binding
    hu.ctx.app = new EventEmitter();
    hu.ui.isVisible = (n) => n === 'MAIN' && run.screen;
    hu.ui.text = () => Promise.resolve();
    // (the listeners the app's record puts on the process are not put on the test's own)
    const procOn = process.on, procPre = process.prependListener;
    const theirs = (ev) => ['exit', 'uncaughtException', 'SIGTERM', 'SIGHUP', 'SIGINT'].indexOf(ev) >= 0;
    process.on = function (ev) { return theirs(ev) ? process : procOn.apply(process, arguments); };
    process.prependListener = function (ev) { return theirs(ev) ? process : procPre.apply(process, arguments); };
    // (the app's own session, as the app holds it: what the Run tab would say)
    const S = require(path.join(JS, 'session')).Session, tick0 = S.prototype.tick;
    S.prototype.tick = function () { run.session = this; return tick0.apply(this, arguments); };
    run.banner = () => { const v = run.session.view(clock.mono); return require(path.join(JS, 'screens')).banner({}, v).text + (v.hasSpeed ? ', ' + Math.round(v.kmh) + ' km/h' : ', no speed shown'); };
    try { hu.start(); } finally { process.on = procOn; process.prependListener = procPre; }
    run.car.start();
    await advance(1);
    console.log = quiet;
    run.count = (type, pred) => run.calls.filter((c) => c.type === type && (!pred || pred(c))).length;
    run.list = (type) => run.calls.filter((c) => c.type === type).map((c) => c.iface + (c.name ? '.' + c.name : '')).join(', ');
    run.logged = (re) => run.logs.map((l) => l.replace(/ \(logged \d+\.\d s later\)$/, '')).filter((l) => re.test(l));
    run.saved = () => { try { return JSON.parse(fs.readFileSync(path.join(run.dataDir, 'pps_drag.json'), 'utf8')); } catch (e) { return null; } };
    /** A full run of the truth model from now + 400 ms; the driver lifts at the model's end and brakes. Returns the model's answers. */
    run.launch = async (model, liftMs) => {
        const at = clock.mono + 400, end = Math.min(model.tEnd * 1000, liftMs || Infinity), vEnd = model.vAt(end / 1000) * 3.6;
        run.car.plan = (t) => (t < at ? 0 : t - at <= end ? model.vAt((t - at) / 1000) * 3.6 : Math.max(0, vEnd - 8 * 3.6 / 1000 * (t - at - end)));
        await advance(400 + end + vEnd / (8 * 3.6 / 1000) + 3000);
        return model.answers('slip', 'kmh');
    };
    return run;
}
const KIT_LIMIT = 3000, APP_LIMIT = 1000;
const kitReads = (run) => run.calls.filter((c) => c.type === 'getValue' && c.limit === KIT_LIMIT);
const appReads = (run, from, to) => run.calls.filter((c) => c.type === 'getValue' && c.limit !== KIT_LIMIT && c.t >= (from === undefined ? -Infinity : from) && c.t < (to === undefined ? Infinity : to));
const FULL = new sim.Truth({ a0: 7, vTop: 75, ramp: 0.15, shifts: [{ v: 62 / 3.6, dur: 0.15, cut: 0.9 }] });
const ALL_ON = { askCar: true, gps: true, xWheels: true, xPos: true, xStudy: true };

(async () => {
    await ok.part('as shipped: what the app and the kit ask of the native binding over a whole drive', async () => {
        const run = await boot({});
        await advance(10000);
        ok(run.count('buildProxy') === 2 && run.list('buildProxy') === 'Vehicle2, CDS2', 'two proxies are built, Vehicle2 and CDS2: no proxy for an interface whose every field is switched off (' + run.count('buildProxy') + ' buildProxy calls; 1.0.1 made 7)');
        ok(run.count('subscribe') === 2 && run.list('subscribe') === 'Vehicle2.statusCarSpeed2, CDS2.statusLongitudinalAccelerationMassCenter', 'two fields are subscribed: the speed and the acceleration (1.0.1: nine fields and one event)');
        ok(kitReads(run).length === 2 && kitReads(run).map((c) => c.iface + '.' + c.name).join() === 'Vehicle2.statusCarSpeed2,CDS2.statusLongitudinalAccelerationMassCenter' && appReads(run).length === 0,
            'two getter reads, both the kit\'s own first read of a field asked for with "rs" (time limit 3000 ms): the speed and the acceleration, the two fields the kit\'s Drag Timer and Proven Gauges read the same way. Not one read of the app\'s own');
        ok(run.logged(/^raw speed \(notified\) #1: 0 = 0\.00 km\/h$/).length === 1, 'that read is how the app knows the standing car stands: "' + run.logged(/^raw speed \(notified\) #1/)[0] + '" (a standing car notifies nothing)');
        const ans = await run.launch(FULL);
        await advance(4000);
        run.car.plan = () => 50; await advance(20000);
        run.car.plan = () => 120; await advance(60000);
        run.screen = false; await advance(30000); run.screen = true;
        run.car.plan = () => 0; await advance(5000);
        run.screen = false; await advance(360000); run.screen = true;
        for (let p = 0; p < 5; p++) { run.hu.display.onTab(p === 4 ? 3 : p); await run.hu.loopFn(); await advance(1500); }
        const types = {};
        run.calls.forEach((c) => { types[c.type] = (types[c.type] || 0) + 1; });
        ok(appReads(run).length === 0 && run.count('getValue') === 2, 'after a launch to the 1/4 mile, town and motorway speeds, the screen hidden twice, 6 minutes parked and every page drawn (' + Math.round((clock.mono - run.t0) / 1000) +
            ' s): still ' + run.count('getValue') + ' getter reads in all, none of the app\'s own');
        ok(JSON.stringify(types) === JSON.stringify({ buildProxy: 2, init: 2, subscribeToAvailability: 2, subscribe: 2, isAvailable: 2, getValue: 2 }),
            'every call the binding saw in that drive: ' + Object.keys(types).map((k) => types[k] + ' ' + k).join(', ') + '. No setValue, no callMethod, no shutdown');
        const rec = run.saved() && run.saved().runs.slice(-1)[0];
        const worst = rec ? Math.max.apply(null, Object.keys(ans).map((k) => (rec.results[k] ? Math.abs(rec.results[k].s - ans[k].s) : 99))) : 99;
        ok(rec && rec.series === 'notified' && worst <= 0.02 && rec.flags.length === 0 && rec.sum.noReads === true, 'the launch was timed from the notified speed alone, every split within ' + worst.toFixed(3) + ' s of the true time, no flag');
        ok(run.uncaught.length === 0 && run.logged(/^ERROR |^WARN /).length === 0, 'nothing escaped a timer and the app logged no warning');
    });

    await ok.part('each extra builds its proxy when it is switched on, and none of them makes the kit read a getter', async () => {
        const run = await boot({});
        await advance(5000);
        const step = async (key, label, wantProxies, wantSubs) => {
            const p0 = run.count('buildProxy'), s0 = run.calls.filter((c) => c.type === 'subscribe').length;
            run.settings.set(key, true);
            await advance(3000);
            // (the kit's lane makes the set-up calls of two interfaces in turn: the order of the subscriptions is not the app's)
            const proxies = run.calls.filter((c) => c.type === 'buildProxy').slice(p0).map((c) => c.iface).join(), subs = run.calls.filter((c) => c.type === 'subscribe').slice(s0).map((c) => c.iface + '.' + c.name).sort().join();
            ok(proxies === wantProxies && subs === wantSubs.split(',').sort().join() && run.count('getValue') === 2, '"' + label + '" switched on: buildProxy ' + proxies + '; subscribe ' + subs + '; getter reads still ' + run.count('getValue') + ' (the kit\'s two)');
        };
        await step('gps', 'GPS speed scale', 'SatellitePositioning', 'SatellitePositioning.updatePosition');
        await step('xWheels', 'Wheel speeds', 'Powertrain', 'Powertrain.ActualValueRPMWheel');
        await step('xPos', 'Positions', 'GPSData,Positioning', 'GPSData.GPSPositionCAN,GPSData.GPSPositionExtendedCAN,Positioning.currentLocation');
        await step('xStudy', 'Wheel travel, gradient', 'VehicleModel,Vehicle2', 'VehicleModel.LaneSlope,Vehicle2.statusWheeltravel,Vehicle2.statusWheeltravelRear');
        await advance(5000);
        ok(['SatellitePositioning.updatePosition', 'Powertrain.ActualValueRPMWheel', 'GPSData.GPSPositionCAN', 'Positioning.currentLocation', 'VehicleModel.LaneSlope', 'Vehicle2.statusWheeltravel'].every((k) => run.car.sent[k] > 0) && run.uncaught.length === 0,
            'and each of them delivers to the app from then on');
        // switched off again: nothing is asked of the binding (no shutdown: that would be a call no app here has ever made on a car)
        const n0 = run.calls.length;
        ['gps', 'xWheels', 'xPos', 'xStudy'].forEach((k) => run.settings.set(k, false));
        await advance(5000);
        ok(run.calls.length === n0 && run.count('shutdown') === 0, 'all four switched off again: not one call to the binding (the subscriptions end with the next start of the app; the app drops their values meanwhile)');
        // every extra on from the start, as 1.0.1 asked for them, but each field with "s" only
        const all = await boot({ sets: { gps: true, xWheels: true, xPos: true, xStudy: true } });
        await advance(10000);
        ok(all.count('buildProxy') === 7 && all.count('subscribe') === 10 && kitReads(all).length === 2 && appReads(all).length === 0,
            'a start with all four on: 7 proxies and 10 subscriptions as in 1.0.1, and still only the kit\'s 2 getter reads. (1.0.1 asked for seven fields with "r": the kit then read seven getters at every start, five of them read by no other app of this source)');
        const five = ['Vehicle2.statusWheeltravel', 'Vehicle2.statusWheeltravelRear', 'GPSData.GPSPositionCAN', 'GPSData.GPSPositionExtendedCAN', 'Positioning.currentLocation'];
        const attrs = (i) => (manifest[Object.keys(manifest).filter((k) => short(k) === i)[0]] || {}).attributes || {};
        ok(five.every((f) => attrs(f.split('.')[0])[f.split('.')[1]] === 's') && all.calls.filter((c) => c.type === 'getValue' && five.indexOf(c.iface + '.' + c.name) >= 0).length === 0,
            'those five are in the built manifest with "s" alone, and none of their getters was read');
    });

    await ok.part('"Ask the car for values" on: the app\'s own reads never run next to a set-up call, and never with the screen hidden', async () => {
        // a head unit on which every set-up call takes 300 ms: 31 calls, about 10 s
        let run = await boot({ sets: ALL_ON, setupMs: 300 });
        await advance(25000);
        const first = appReads(run)[0];
        ok(run.lastSetupEnd !== null && first && first.t >= run.lastSetupEnd && appReads(run).every((c) => c.setupBusy === 0) && appReads(run).length > 100,
            'a head unit that takes 300 ms for each set-up call (the last one ends ' + Math.round((run.lastSetupEnd - run.t0) / 100) / 10 + ' s after the start): the app\'s first read of the speed getter comes ' + (first ? Math.round(first.t - run.lastSetupEnd) : '?') +
            ' ms after it, and none of its ' + appReads(run).length + ' reads began while a set-up call was under way');
        const tA = clock.mono;
        await advance(4000);
        const rate = appReads(run, tA).length / 4;
        ok(rate >= 19 && rate <= 21 && appReads(run).every((c) => c.limit === APP_LIMIT && c.iface === 'Vehicle2' && c.name === 'statusCarSpeed2'), 'standing with the screen shown it then reads the speed getter ' + rate + ' times a second, as 1.0.1 did');
        run.screen = false;
        await advance(200);
        const tH = clock.mono;
        await advance(60000);
        ok(appReads(run, tH).length === 0, 'the screen hidden for a minute: not one read (1.0.1: 20 a second for five minutes, then one every 2 s)');
        run.screen = true;
        await advance(1500);
        ok(appReads(run, clock.mono - 1000).length >= 18, 'shown again: read again');
        run.settings.set('askCar', false);
        await advance(200);
        const tO = clock.mono;
        await advance(30000);
        ok(appReads(run, tO).length === 0, 'the setting switched off: no read from then on');
        // a subscription that fails at first and is tried again 5 s later
        run = await boot({ sets: ALL_ON, buildFail: { Powertrain: 1 } });
        await advance(12000);
        const retry = run.calls.filter((c) => c.type === 'buildProxy' && c.iface === 'Powertrain');
        const early = appReads(run, -Infinity, retry.length === 2 ? retry[1].t + 60 : Infinity);
        ok(retry.length === 2 && early.length === 0 && appReads(run).length > 50 && appReads(run).every((c) => c.setupBusy === 0) && run.logged(/^WARN signal Powertrain error: .*trying again in 5 s$/).length === 1,
            'the wheel speeds\' proxy fails at first and is built again 5 s later: the app reads no getter until that second try is through (' + early.length + ' reads before it, ' + appReads(run).length + ' after), and none next to a set-up call');
        // REPAIR: an extra switched on while the app is reading. The GPS receiver's interface has one more set-up call
        // after its proxy is there: the subscription to its event.
        const said = [];
        let allOk = true;
        for (const setupMs of [20, 100, 300]) {
            run = await boot({ sets: { askCar: true }, setupMs });
            await advance(8000);
            const t0 = clock.mono, before = appReads(run).length;
            run.settings.set('gps', true);
            await advance(8000);
            const build = run.calls.filter((c) => c.type === 'buildProxy' && c.iface === 'SatellitePositioning')[0], sub = run.calls.filter((c) => c.type === 'subscribe' && c.iface === 'SatellitePositioning')[0];
            // (a read takes 25 ms here: one that began less than 25 ms before the proxy was asked for is still on its way then)
            const during = appReads(run, t0).filter((c) => c.setupBusy > 0).length, flying = build ? appReads(run, build.t - 25 + 0.001, build.t + 0.001).length : -1, waited = build ? Math.round(build.t - t0) : -1;
            const inEvent = sub ? appReads(run, sub.t, sub.t + setupMs).length : -1, after = sub ? appReads(run, sub.t + setupMs).length : 0;
            if (!(before > 50 && build && sub && during === 0 && flying === 0 && inEvent === 0 && after > 50 && run.count('subscribe', (c) => c.iface === 'SatellitePositioning') === 1)) allOk = false;
            said.push('set-up calls of ' + setupMs + ' ms: ' + during + ' reads begun while one was under way (' + inEvent + ' beside the event\'s), ' + flying + ' still on its way to the car when the proxy was asked for (' + waited + ' ms after the switch, when the read in flight had been answered), ' + after + ' reads after the event was subscribed');
        }
        ok(allOk, 'REPAIR. "Ask the car for values" on and the app reading the speed getter 20 times a second, then "GPS speed scale" switched on: no read of the app\'s own begins while the new proxy or its event is being set up, and none is still on its way to the car when the proxy is asked for. ' +
            said.join('; ') + '. WAS: with set-up calls of 100 and 300 ms, 2 and 6 reads ran beside the subscribe call for the event updatePosition, and in every case one read was still in flight when buildProxy began');
        // ... and a read that is never answered does not keep the new subscription waiting for good
        run = await boot({ sets: { askCar: true }, getMs: 'never' });
        await advance(8000);
        const tSwitch = clock.mono, hung = appReads(run).length;
        run.settings.set('gps', true);
        await advance(4000);
        const built = run.calls.filter((c) => c.type === 'buildProxy' && c.iface === 'SatellitePositioning')[0];
        ok(hung >= 1 && built && built.t - tSwitch >= 1200 && built.t - tSwitch <= 1400 && appReads(run, tSwitch, built.t).length === 0,
            'a head unit whose getter never answers (a read of the app\'s is on its way for good): the proxy for the GPS receiver is asked for ' + (built ? Math.round(built.t - tSwitch) : '?') + ' ms after the switch (a read is asked to give up after 1 s; the app waits a quarter of a second longer and then goes on), with no new read begun meanwhile');
    });

    await ok.part('1.0.2 repair: the kit\'s first read is answered before the set-up of the subscription has returned to the app', async () => {
        // The binding says "available" through its callback at once, the getter answers in 1 ms, the subscribe call takes
        // 80 ms, and isAvailable() says false afterwards: the kit reads once, early, and never again.
        const run = await boot({ setupMs: 80, getMs: 1, availEarly: true });
        await advance(5000);
        const order = run.calls.filter((c) => c.iface === 'Vehicle2').map((c) => c.type + ' ' + Math.round(c.t - run.t0)).join(', ');
        const read = run.calls.filter((c) => c.type === 'getValue' && c.iface === 'Vehicle2')[0], sub = run.calls.filter((c) => c.type === 'subscribe' && c.iface === 'Vehicle2')[0];
        ok(read && sub && read.t + 1 < sub.t + 80 && run.count('getValue', (c) => c.iface === 'Vehicle2') === 1 && run.logged(/^raw speed \(notified\) #1: 0 = 0\.00 km\/h$/).length === 1,
            '(the order at the binding, ms after the start: ' + order + '. The kit read the speed once and its answer reached the app before the subscribe call had returned)');
        const at5 = run.banner();
        await advance(5000);
        ok(at5 === 'READY, 0 km/h' && run.banner() === 'READY, 0 km/h' && appReads(run).length === 0,
            'REPAIR. A standing car on such a head unit: the Run tab says "' + at5 + '" 5 s and 10 s after the start (the value that came early counts as the first one once the app sees the service up). WAS: "ARMED, NO NEW SPEED" with no speed shown until the car first moved, although the app had been told its speed');
        const ans = await run.launch(FULL);
        const rec = run.saved() && run.saved().runs.slice(-1)[0];
        const worst = rec ? Math.max.apply(null, Object.keys(ans).map((k) => (rec.results[k] ? Math.abs(rec.results[k].s - ans[k].s) : 99))) : 99;
        ok(rec && worst <= 0.02 && rec.flags.length === 0 && run.banner() === 'READY, 0 km/h', 'and the launch after it is timed as on any other head unit (every split within ' + worst.toFixed(3) + ' s, no flag); READY again once the car stands');
    });

    ok.done();
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
