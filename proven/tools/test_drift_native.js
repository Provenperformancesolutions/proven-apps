'use strict';
/**
 * test_drift_native.js <built app: dist/pps_drift> - what Proven Drift ASKS OF THE CAR'S NATIVE BINDING, counted
 * call by call. The built app runs on the kit's PC stand-in for the head unit (kit/tools/hu-stub.js) with the
 * kit's REAL signals.js on top (its one-at-a-time lane, watch(), on()), over a stand-in for the native module
 * "someip", on a clock the test moves by hand. test_drift_car.js replaces signals.watch() as a whole; this test
 * does not, so every buildProxy, init, subscribe and getValue the app and the kit make is seen as the binding
 * would see it.
 * (The bench is the investigators' checks/crash-native/nativebench.js of 25 November 2026, cut to what this
 * test needs.)
 *
 * Why it exists (proven/CHANGES-drift.md part 9): on the first car the app closed by itself, and what set it
 * apart from the apps that run there was what it asked of the binding. So 1.0.1 must, as shipped, ask for the
 * core signals only and read no getter itself. This test counts that.
 *
 * What this cannot show: what the real binding does. The stand-in does what it is told; what it records is
 * what the app and the kit ask of it. The interface files are written here in the shape the kit reads (a
 * field has a getter where the manifest says "r"); BMW's own generator is not in this source.
 *
 * PPS_TEST_ALL=1 in the environment: a failed check does not stop the run; they are listed at the end.
 */
const fs = require('fs'), os = require('os'), path = require('path'), Module = require('module');
const { checker } = require('./fakecar');

if (!process.argv[2]) { console.error('usage: node proven/tools/test_drift_native.js dist/pps_drift'); process.exit(2); }
// (the real path: Node keeps loaded files under their real paths, and boot() drops the app's by that path)
const STAGE = fs.realpathSync(path.resolve(process.argv[2])), JS = path.join(STAGE, 'source', 'javascript');
const ok = checker();
const real = { setImmediate };

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
        // (an exception out of a timer is, on the car, an uncaught exception: the kit then ends the process)
        try { due.fn(); } catch (e) { if (current) current.uncaught.push(e); else throw e; }
        await settle();
    }
    clock.wall += end - clock.mono; clock.mono = end;
    await settle();
}

/* ---------- the interface files the installer would make (the kit reads cfg.fields[f].getter, nothing else) ---------- */
const MANIFEST = JSON.parse(fs.readFileSync(path.join(STAGE, 'source', 'manifest.json'), 'utf8'));
function writeConfigs() {
    const dir = path.join(STAGE, 'someipInterfaces');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    Object.keys(MANIFEST.proxies).forEach((iface) => {
        const e = MANIFEST.proxies[iface];
        if (!e || typeof e !== 'object') return;
        const cfg = { interface: iface, fields: {}, events: {} };
        Object.keys(e.attributes || {}).forEach((f) => { cfg.fields[f] = {}; if (e.attributes[f].indexOf('r') >= 0) cfg.fields[f].getter = { id: 1 }; if (e.attributes[f].indexOf('s') >= 0) cfg.fields[f].notifier = { id: 2 }; });
        (e.broadcasts || []).forEach((b) => { cfg.events[b] = { id: 4 }; });
        fs.writeFileSync(path.join(dir, iface.replace(/\./g, '_') + '.json'), JSON.stringify(cfg));
    });
}

/* ---------- the stand-in native binding ---------- */
/** o: setupMs (each set-up call takes this long; 20), getMs (25), buildFail { Vehicle2: n } (the first n buildProxy of it reject), value(iface, field, t) */
function makeBinding(o, run) {
    const short = (i) => i.split('.').pop();
    const B = { proxies: [], setupInFlight: 0 };
    const after = (ms, fn) => new Promise((res, rej) => setTimeout(() => { try { res(fn ? fn() : undefined); } catch (e) { rej(e); } }, ms));
    const note = (c) => { c.t = clock.mono; c.setupBusy = B.setupInFlight; run.calls.push(c); return c; };
    const setup = (p) => { B.setupInFlight++; const fin = () => { B.setupInFlight--; run.lastSetupEnd = clock.mono; }; return after(o.setupMs == null ? 20 : o.setupMs).then(() => p()).then((v) => { fin(); return v; }, (e) => { fin(); throw e; }); };
    B.module = {
        buildProxy(cfg, instance) {
            const name = short(cfg.interface);
            note({ type: 'buildProxy', iface: name, instance });
            return setup(() => {
                if (o.buildFail && o.buildFail[name] > 0) { o.buildFail[name]--; throw new Error('standin: buildProxy failed (service not up yet)'); }
                const P = { name, n: B.proxies.length, subs: {}, avail: null, up: false };
                B.proxies.push(P);
                return {
                    init() { note({ type: 'init', iface: name, proxy: P.n }); return setup(() => {}); },
                    subscribeToAvailability(cb) { note({ type: 'subscribeToAvailability', iface: name, proxy: P.n }); return setup(() => { P.avail = cb; P.up = true; }); },
                    isAvailable() { note({ type: 'isAvailable', iface: name, proxy: P.n }); return P.up; },
                    subscribe(x) { note({ type: 'subscribe', iface: name, name: x && x.name, proxy: P.n }); return setup(() => { (P.subs[x.name] = P.subs[x.name] || []).push(x.onReceive); }); },
                    getValue(field, limit) {
                        // (the kit's own first read asks with a limit of 3000 ms, the app's own reads with 1000: kit/runtime/signals.js, apps/pps_drift/car.js)
                        note({ type: 'getValue', iface: name, name: field, proxy: P.n, limit, own: limit !== 3000 });
                        return after(o.getMs == null ? 25 : o.getMs, () => (o.value ? o.value(name, field, clock.mono) : {}));
                    },
                    setValue(field) { note({ type: 'setValue', iface: name, name: field }); return after(5, () => { throw new Error('standin: read only'); }); },
                    callMethod(method) { note({ type: 'callMethod', iface: name, name: method }); return after(5, () => { throw new Error('standin: read only'); }); },
                    shutdown() { note({ type: 'shutdown', iface: name, proxy: P.n }); return Promise.resolve(); },
                };
            });
        },
    };
    /** A notification of a field (or an event) from the car: every proxy of that interface that subscribed gets it. */
    B.send = (name, field, value) => { let n = 0; B.proxies.forEach((P) => { if (P.name === name) (P.subs[field] || []).forEach((fn) => { n++; fn(value); }); }); return n; };
    /** The car's service goes away or comes back, as the binding's availability callback says it. */
    B.service = (name, up) => B.proxies.forEach((P) => { if (P.name === name && P.up !== up) { P.up = up; if (P.avail) P.avail(up); } });
    return B;
}

/* ---------- the app ---------- */
const { headUnit } = require(path.resolve(__dirname, '..', '..', 'kit', 'tools', 'hu-stub.js'));
const realLoad = Module._load;
Module._load = function (req) { if (req === 'someip' && current) return current.binding.module; return realLoad.apply(this, arguments); };
const dirs = [];
const newDir = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pps-drift-native-')); dirs.push(d); return d; };
process.on('exit', () => dirs.forEach((d) => { try { fs.readdirSync(d).forEach((f) => { const x = path.join(d, f); try { if (fs.statSync(x).isDirectory()) { fs.readdirSync(x).forEach((g) => fs.unlinkSync(path.join(x, g))); fs.rmdirSync(x); } else fs.unlinkSync(x); } catch (e) { /* gone */ } }); fs.rmdirSync(d); } catch (e) { /* gone */ } }));

/** Start the built app on a fresh stand-in. opts: the binding's, sets { setting: value }, screen (false: hidden). */
async function boot(opts) {
    opts = opts || {};
    clock.timers = []; clock.mono = Math.ceil(clock.mono);
    // (the app's own files and the kit's signals.js afresh: its lane is module state)
    Object.keys(require.cache).forEach((f) => { if (f.indexOf(JS + path.sep) === 0) delete require.cache[f]; });
    const run = { calls: [], logs: [], uncaught: [], rejections: [], screen: opts.screen !== false, car: { speed: () => 0 } };
    run.binding = makeBinding(opts, run);
    current = run;
    const log = {};
    ['info', 'warn', 'error', 'debug'].forEach((l) => { log[l] = function () { run.logs.push((l === 'info' ? '' : l.toUpperCase() + ' ') + Array.prototype.map.call(arguments, (x) => (x && x.stack) || (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(' ')); }; });
    process.env.PPS_BOX_TMP = newDir();
    const quiet = console.log; console.log = () => {};
    const hu = headUnit(STAGE, { dataDir: newDir(), fresh: true, sets: Object.assign({ demo: 'off' }, opts.sets), image: () => Promise.resolve(), log });
    run.hu = hu; run.settings = hu.settings;
    hu.ctx.signals = require(path.join(JS, 'kit', 'signals.js'));      // the kit's own, on the stand-in binding
    hu.ui.isVisible = (n) => n === 'MAIN' && run.screen;
    hu.ui.text = () => Promise.resolve();
    hu.ui.image = () => Promise.resolve();
    const S = require(path.join(JS, 'session')).Session, tick = S.prototype.tick;
    S.prototype.tick = function () { run.session = this; return tick.apply(this, arguments); };
    hu.start();
    await advance(1);
    console.log = quiet;
    run.page = (i) => hu.display.onTab(i);
    run.draw = () => hu.loopFn();
    run.count = (type, pred, from, to) => run.calls.filter((c) => c.type === type && (!pred || pred(c)) && (from === undefined || c.t >= from) && (to === undefined || c.t < to)).length;
    run.logged = (re) => run.logs.filter((l) => re.test(l));
    return run;
}
process.on('uncaughtException', (e) => { if (current) current.uncaught.push(e); else throw e; });
process.on('unhandledRejection', (e) => { if (current) current.rejections.push(e); });

/* ---------- the car: what it notifies ---------- */
const RAW = 0.015625;
const every = (ms, phase, fn) => setTimeout(() => { fn(); setInterval(fn, ms); }, phase);
/**
 * A car that sends as the first car was seen to (through Proven Drag): its speed about 47 times a second while it
 * changes and not at all while it holds, CDS2's sensors 10 times a second. And every other field of the manifest
 * at some rate, whether the app has subscribed to it or not (what nobody subscribed to reaches nobody).
 */
function carFor(run) {
    const car = run.car, bind = run.binding;
    const raw = (t) => Math.max(0, Math.min(65534, Math.round(car.speed(t) / RAW)));
    let sent = null, n = 0;
    const got = (k, d) => { run.delivered[k] = (run.delivered[k] || 0) + d; };
    run.delivered = {};
    every(21, 7, () => { const r = raw(clock.mono); if (r === sent) return; sent = r; got('speed', bind.send('Vehicle2', 'statusCarSpeed2', { speedVehicleCentreOfGravity: r })); });
    every(100, 3, () => {
        n++;
        const turn = Math.round(600 * Math.sin(clock.mono / 4000)) * (car.speed(clock.mono) > 5 ? 1 : 0);
        got('long', bind.send('CDS2', 'statusLongitudinalAccelerationMassCenter', { longitudinalAccelerationCentreOfGravity: 32500 + n % 2 }));
        got('lat', bind.send('CDS2', 'statusLateralAccelerationMassCenter', { lateralAccelerationCentreOfGravity: 32500 + turn + n % 2 }));
        got('yaw', bind.send('CDS2', 'statusYawVelocityVehicle', { yawVelocityVehicle: 32768 + 4 * turn + n % 2 }));
        got('yaw2', bind.send('SpeedAcceleration', 'YawSpeedVehicle', { yawVelocityVehicle: 32000 - turn }));
    });
    every(20, 11, () => {
        const turn = Math.round(900 * Math.sin(clock.mono / 4000));
        got('driver', bind.send('SteeringAngle', 'ActualSteeringAngleDriver', { actualValueSteeringAngleDriver: 32767 + turn }));
        got('front', bind.send('SteeringAngle', 'SteeringAngleFrontAxleEffective', { steeringAngleFrontAxleEffective: 32768 + Math.round(turn / 14) }));
    });
    every(50, 23, () => {
        const w = Math.round(car.speed(clock.mono) * 16);
        got('xfront', bind.send('XView', 'statusFrontAxleSteeringAngle', { steeringAngleFrontAxleEffective: 32768 + n % 3 }));
        got('xdriver', bind.send('XView', 'statusSteeringAngleDriver', { actualValueSteeringAngleDriver: 32767 + n % 5 }));
        got('pedal', bind.send('AcceleratorPedal', 'AngleAcceleratorPedal', { actualValueAngleAcceleratorPedal: 400 + n % 50 }));
        got('wheels', bind.send('Powertrain', 'ActualValueRPMWheel', { actualValueRPMWheelFLH: w, actualValueRPMwheelFRH: w, actualValueRPMWheelRLH: w, actualValueRPMWheelRRH: w }));
    });
    every(500, 61, () => {
        got('hb', bind.send('CDS', 'statusHandBrake', { statusContactHandBrake: n % 40 < 20 ? 'HANDBREMSE_GELOEST' : 'HANDBREMSE_ANGEZOGEN' }));
        got('dsc', bind.send('FES', 'statusDSCSwitchHMI', { displayStatusDSC2: n % 3 }));
        got('move', bind.send('DrivingVector', 'ActualVectorVehicleMove', { actualValueAttitudeAngleVehicleMove: 32768 + n % 9 }));
        got('est', bind.send('DrivingVector', 'VehicleDynamicDataEstimatedVerified', { attitudeAngleEstimated: 32768 + n % 7 }));
        got('mLast', bind.send('MDrive', 'statusDriftLast', { statusDriftStarsLast: n % 5 }));
        got('mBest', bind.send('MDrive', 'statusDriftBest', { statusDriftStarsBest: n % 5 }));
    });
    every(1000, 400, () => got('nmea', bind.send('SatellitePositioning', 'updatePosition', { nmeaString: '$GPGSA,A,3,04,05,,09,12,,,24,,,,,2.5,1.3,2.1*39\r\n', delayCounter: 2 })));
    return (i, f, t) => (f === 'statusCarSpeed2' ? { speedVehicleCentreOfGravity: raw(t) } : f === 'statusLongitudinalAccelerationMassCenter' ? { longitudinalAccelerationCentreOfGravity: 32500 } :
        f === 'statusLateralAccelerationMassCenter' ? { lateralAccelerationCentreOfGravity: 32500 } : f === 'statusYawVelocityVehicle' ? { yawVelocityVehicle: 32768 } : {});
}
/** Ten minutes of stop and go: stand, pull away, cruise with the speed moving a little, stop, a hard pull, stand. */
function stopAndGo(run, t0) {
    run.car.speed = (t) => {
        const s = ((t - t0) / 1000) % 120;
        if (s < 15) return 0;
        if (s < 30) return (s - 15) * 5;                       // to 75 km/h
        if (s < 80) return 75 + 6 * Math.sin((s - 30) / 5);    // a cruise that is never quite still
        if (s < 90) return Math.max(0, 75 - (s - 80) * 7.5);
        if (s < 100) return 0;
        if (s < 106) return (s - 100) * 16;                    // a hard pull to 96 km/h
        if (s < 112) return Math.max(0, 96 - (s - 106) * 16);
        return 0;
    };
}
const names = (run, type, pred) => run.calls.filter((c) => c.type === type && (!pred || pred(c))).map((c) => c.iface + (c.name ? '.' + c.name : ''));
const KIT_READS = ['Vehicle2.statusCarSpeed2', 'CDS2.statusLateralAccelerationMassCenter', 'CDS2.statusLongitudinalAccelerationMassCenter', 'CDS2.statusYawVelocityVehicle'];
const EXTRA_KEYS = ['gpsOn', 'wheelsOn', 'sourcesOn', 'pedalOn', 'studyOn'];
/** The app's meter of each source this car sends (apps/pps_drift/car.js, SOURCES). */
const METER = { nmea: 'nmea', wheels: 'wheels', yaw2: 'yawS', front: 'steerF', xfront: 'steerXF', xdriver: 'steerXD', pedal: 'pedal', hb: 'hb', dsc: 'dsc', move: 'move', est: 'est', mLast: 'mLast', mBest: 'mBest' };

(async () => {
    writeConfigs();

    /* ================= as shipped ================= */
    await ok.part('as shipped: what the app and the kit ask of the binding in ten minutes of stop and go', async () => {
        let value = () => ({});
        const run = await boot({ setupMs: 20, getMs: 25, value: (i, f, t) => value(i, f, t) });
        value = carFor(run);
        const t0 = clock.mono;
        stopAndGo(run, t0);
        // every page in turn, the screen hidden for two minutes in the middle, CDS2's service away for 5 s and back
        for (let p = 0; p < 6; p++) { run.page(p === 5 ? 4 : p); if (p === 5) run.page(4); await run.draw(); await advance(50000); await run.draw(); }
        run.screen = false;
        await advance(120000);
        run.screen = true;
        run.binding.service('CDS2', false);
        await advance(5000);
        run.binding.service('CDS2', true);
        await advance(175000);
        const mins = (clock.mono - t0) / 60000;
        const built = names(run, 'buildProxy'), subs = names(run, 'subscribe'), own = run.count('getValue', (c) => c.own), kit = names(run, 'getValue', (c) => !c.own);
        ok(built.join() === 'Vehicle2,CDS2,SteeringAngle' && run.count('init') === 3 && run.count('subscribeToAvailability') === 3,
            'three proxies are built, one each for Vehicle2, CDS2 and SteeringAngle: the interfaces of the core signals. No other interface of the manifest\'s twelve is touched');
        ok(subs.slice().sort().join() === 'CDS2.statusLateralAccelerationMassCenter,CDS2.statusLongitudinalAccelerationMassCenter,CDS2.statusYawVelocityVehicle,SteeringAngle.ActualSteeringAngleDriver,SteeringAngle.actualSteeringAngleDriverNoCRC,Vehicle2.statusCarSpeed2',
            'six fields are subscribed to: the speed, the two accelerations, CDS2\'s yaw rate, and the steering wheel\'s angle under its two names');
        ok(own === 0, 'NOT ONE getter read of the app\'s own in ' + mins.toFixed(0) + ' minutes: standing, pulling away, cruising, on every page, with the screen hidden, with a service away and back (' + run.count('getValue') + ' getValue calls in all, every one of them the kit\'s own first read)');
        ok(kit.length === 7 && kit.slice(0, 4).sort().join() === KIT_READS.slice().sort().join() && kit.slice(4).every((k) => /^CDS2\./.test(k)) && kit.every((k) => KIT_READS.indexOf(k) >= 0),
            'the kit itself read four getters once at the start (the four "rs" fields: ' + KIT_READS.map((k) => k.split('.')[1]).join(', ') + ') and CDS2\'s three once more when its service came back. That is the kit\'s doing in every app; no getter of any other field was read by anybody');
        const setUp = run.calls.filter((c) => /buildProxy|init|subscribe/.test(c.type)).length;
        ok(setUp === 15 && run.count('setValue') === 0 && run.count('callMethod') === 0 && run.count('shutdown') === 0 && run.lastSetupEnd - t0 < 2000,
            setUp + ' set-up calls in all (1.0.0 made 54), the last finished ' + ((run.lastSetupEnd - (t0 - 1)) / 1000).toFixed(1) + ' s after the start, and nothing was asked of the binding for the rest of the drive. No write, no method call, no proxy shut down');
        const D = run.delivered;
        ok(D.speed > 5000 && D.lat > 5000 && D.yaw > 5000 && D.driver > 20000 && ['yaw2', 'front', 'xfront', 'xdriver', 'pedal', 'wheels', 'hb', 'dsc', 'move', 'est', 'mLast', 'mBest', 'nmea'].every((k) => D[k] === 0),
            'the car sent everything all the time: the app was handed ' + D.speed + ' speeds, ' + D.lat + ' sideways accelerations, ' + D.yaw + ' yaw rates and ' + D.driver + ' steering wheel angles, and not one value of the 13 other sources (nobody subscribed to them)');
        const S = run.session, v = S.eng.view();
        ok(S.meters.speedN.n > 5000 && S.maxAge === 0 && S.motionAge === 0 && v.state !== 'gap' && v.state !== 'nodata' && v.state !== 'noyaw' && v.kmh !== null,
            'the app\'s engine has its speed, accelerations and yaw rate from that (state "' + v.state + '", ' + S.meters.speedN.most.toFixed(0) + ' speeds a second at most), with no age limit on any of them');
        ok(run.uncaught.length === 0 && run.rejections.length === 0 && run.logged(/^WARN|^ERROR/).length === 0, 'no error escaped, no rejection was left unhandled, and the app logged no warning');
    });

    /* ================= the extras ================= */
    await ok.part('each extra switched on while the app runs: what is built and subscribed then, and that its values arrive', async () => {
        let value = () => ({});
        const run = await boot({ setupMs: 20, getMs: 25, value: (i, f, t) => value(i, f, t) });
        value = carFor(run);
        stopAndGo(run, clock.mono - 30000);
        await advance(5000);
        const WANT = {
            gpsOn: { build: ['SatellitePositioning'], sub: ['SatellitePositioning.updatePosition'], got: ['nmea'] },
            wheelsOn: { build: ['Powertrain'], sub: ['Powertrain.ActualValueRPMWheel'], got: ['wheels'] },
            sourcesOn: { build: ['SpeedAcceleration', 'XView'], sub: ['SteeringAngle.SteeringAngleFrontAxleEffective', 'SpeedAcceleration.YawSpeedVehicle', 'XView.statusFrontAxleSteeringAngle', 'XView.statusSteeringAngleDriver'], got: ['yaw2', 'front', 'xfront', 'xdriver'] },
            pedalOn: { build: ['AcceleratorPedal', 'CDS'], sub: ['AcceleratorPedal.AngleAcceleratorPedal', 'CDS.statusHandBrake'], got: ['pedal', 'hb'] },
            studyOn: { build: ['FES', 'DrivingVector', 'MDrive'], sub: ['FES.statusDSCSwitchHMI', 'DrivingVector.ActualVectorVehicleMove', 'DrivingVector.VehicleDynamicDataEstimatedVerified', 'MDrive.statusDriftLast', 'MDrive.statusDriftBest'], got: ['dsc', 'move', 'est', 'mLast', 'mBest'] },
        };
        for (const key of EXTRA_KEYS) {
            const w = WANT[key], n0 = run.calls.length, d0 = Object.assign({}, run.delivered);
            run.settings.set(key, true);
            await advance(4000);
            const c = run.calls.slice(n0), build = c.filter((x) => x.type === 'buildProxy').map((x) => x.iface), sub = c.filter((x) => x.type === 'subscribe').map((x) => x.iface + '.' + x.name);
            const steeringProxies = run.binding.proxies.filter((P) => P.name === 'SteeringAngle').length;
            ok(build.join() === w.build.join() && sub.slice().sort().join() === w.sub.slice().sort().join() && c.filter((x) => x.type === 'getValue').length === 0 && w.got.every((k) => run.delivered[k] > d0[k]) && steeringProxies === 1,
                '"' + key + '" on: ' + build.length + (build.length === 1 ? ' proxy is' : ' proxies are') + ' built (' + build.join(', ') + '), ' + sub.length + (sub.length === 1 ? ' subscription' : ' subscriptions') + ' made (' + sub.map((x) => x.split('.')[1]).join(', ') + '), no getter is read for it, and its values arrive' +
                (key === 'sourcesOn' ? '. The front wheels\' own angle is subscribed to on the SteeringAngle proxy that was there: no second proxy for that interface' : ''));
            // (how many values of each of its sources the app has counted: session.js's meters)
            const counted = () => w.got.map((k) => (run.session.meters[METER[k]] || { n: 0 }).n);
            const before = counted();
            run.settings.set(key, false);
            const n1 = run.calls.length, d1 = Object.assign({}, run.delivered), m1 = counted();
            await advance(3000);
            ok(run.calls.length === n1 && w.got.every((k) => run.delivered[k] > d1[k]) && before.every((n) => n >= 1) && counted().join() === m1.join(),
                '  off again: nothing is asked of the binding (no shutdown, no unsubscribe: the kit has no call for it), the car goes on delivering, and the app counts and uses none of it');
        }
        ok(run.binding.proxies.length === 12 && names(run, 'getValue', (c) => c.own).length === 0 && run.uncaught.length === 0 && run.rejections.length === 0 && run.logged(/^WARN|^ERROR/).length === 0,
            'with every extra switched on once: twelve proxies, one for each interface of the manifest, still no getter read of the app\'s own, no error, no warning');
    });

    /* ================= "Ask the car for values" ================= */
    await ok.part('"Ask the car for values" switched on: the app\'s own reads, and when it holds them back', async () => {
        // a head unit on which every set-up call takes 150 ms, and every extra is on: set-up takes about 8 s
        let value = () => ({});
        const all = { askCar: true, gpsOn: true, wheelsOn: true, sourcesOn: true, pedalOn: true, studyOn: true };
        let run = await boot({ setupMs: 150, getMs: 25, value: (i, f, t) => value(i, f, t), sets: all });
        value = carFor(run);
        const t0 = clock.mono;
        stopAndGo(run, t0 - 30000);
        await advance(30000);
        const own = run.calls.filter((c) => c.type === 'getValue' && c.own), during = own.filter((c) => c.setupBusy > 0 || c.t < run.lastSetupEnd).length;
        ok(own.length > 100 && during === 0 && own[0].t >= run.lastSetupEnd,
            'with slow set-up calls (150 ms each, ' + ((run.lastSetupEnd - t0) / 1000).toFixed(1) + ' s in all): the app\'s first own read came ' + ((own[0].t - run.lastSetupEnd) / 1000).toFixed(2) + ' s AFTER the last set-up call had finished, and none of its ' + own.length + ' reads ran beside a set-up call');
        const t1 = clock.mono;
        await advance(20000);
        const shown = run.count('getValue', (c) => c.own, t1) / 20;
        run.screen = false;
        await advance(1000);
        const t2 = clock.mono;
        await advance(60000);
        const hidden = run.count('getValue', (c) => c.own, t2);
        run.screen = true;
        await advance(3000);
        const t3 = clock.mono;
        await advance(10000);
        ok(shown >= 2 && hidden === 0 && run.count('getValue', (c) => c.own, t3) > 15,
            'shown, it reads ' + shown.toFixed(1) + ' getters a second in this drive; with the screen hidden for a minute, driving: ' + hidden + ' reads; shown again: it reads again');
        run.settings.set('askCar', false);
        await advance(500);
        const t4 = clock.mono;
        await advance(30000);
        ok(run.count('getValue', (c) => c.own, t4) === 0, 'switched off again while the app runs: not one more read');
        ok(run.uncaught.length === 0 && run.rejections.length === 0, 'no error escaped');

        // a subscription that fails at first and is tried again after 5 s: no own read while that is under way
        value = () => ({});
        run = await boot({ setupMs: 20, getMs: 25, value: (i, f, t) => value(i, f, t), sets: { askCar: true, wheelsOn: true }, buildFail: { Powertrain: 1 } });
        value = carFor(run);
        const s0 = clock.mono;
        stopAndGo(run, s0 - 30000);
        await advance(15000);
        const retry = run.calls.filter((c) => c.type === 'buildProxy' && c.iface === 'Powertrain'), ownReads = run.calls.filter((c) => c.type === 'getValue' && c.own);
        ok(retry.length === 2 && Math.abs(retry[1].t - retry[0].t - 5000) < 300 && ownReads.length > 20 && ownReads.every((c) => c.t > run.lastSetupEnd && c.setupBusy === 0) && run.logged(/^WARN signal Powertrain error: .*trying again in 5 s$/).length === 1,
            'a proxy that cannot be built at first (the wheels\') is tried again after 5 s; the app\'s own reads begin only after that second try has finished (' + ownReads.length + ' reads, the first ' + ((ownReads[0].t - s0) / 1000).toFixed(1) + ' s after the start, none beside a set-up call)');
    });

    /* ================= the repair of 1.0.1: an extra switched on while the app reads getters itself ================= */
    // The first check of 1.0.1 found: with "Ask the car for values" on, an own getter read could START beside the set-up
    // calls of an extra that is switched on while the app runs. The schedulers were stopped by the next 50 ms tick only,
    // and a read's own timer could fire before it. The checks above could not see it: this bench's clock keeps the app's
    // tick and its read schedule exactly in step for ever. One hold-up of the app of 23 ms (a frame drawn in software, a
    // file write) puts them out of step, as on a head unit.
    await ok.part('the repair of 1.0.1: with "Ask the car for values" on, an extra is switched on while the app runs', async () => {
        const rows = [];
        for (const hold of [0, 23]) for (const setupMs of [20, 150]) {
            let tries = 0, beside = 0, flying = 0, early = 0, readsBefore = 0, readsAfter = 0;
            for (let phase = 0; phase < 20; phase++) {
                let value = () => ({});
                const run = await boot({ setupMs, getMs: 25, value: (i, f, t) => value(i, f, t), sets: { askCar: true } });
                value = carFor(run);
                stopAndGo(run, clock.mono - 30000);             // the car is in its cruise: the speed is never quite still
                await advance(12040);                           // (the hold-up below then lies across a 50 ms tick of the app)
                if (hold) { clock.mono += hold; clock.wall += hold; await advance(0); }
                await advance(1000 + phase * 7);
                readsBefore += run.count('getValue', (c) => c.own);
                const t0 = clock.mono, n0 = run.calls.length;
                // (an own read that is on its way to the car at this moment: it was asked less than 25 ms ago)
                const onItsWay = run.calls.filter((c) => c.type === 'getValue' && c.own && c.t > t0 - 25);
                run.settings.set('wheelsOn', true);
                await advance(3000);
                const after = run.calls.slice(n0), firstSetUp = after.filter((c) => /buildProxy|init|subscribe/.test(c.type))[0];
                tries++;
                if (after.some((c) => c.type === 'getValue' && c.own && (c.t < run.lastSetupEnd || c.setupBusy > 0))) beside++;
                if (onItsWay.length) { flying++; if (!firstSetUp || firstSetUp.t < onItsWay[onItsWay.length - 1].t + 25) early++; }
                readsAfter += after.filter((c) => c.type === 'getValue' && c.own && c.t >= run.lastSetupEnd).length;
                if (!firstSetUp || firstSetUp.type !== 'buildProxy' || firstSetUp.iface !== 'Powertrain' || run.uncaught.length || run.rejections.length) beside += 100;
            }
            rows.push({ hold, setupMs, tries, beside, flying, early, readsBefore, readsAfter });
        }
        const all = (f) => rows.reduce((a, r) => a + f(r), 0);
        ok(all((r) => r.tries) === 80 && all((r) => r.beside) === 0 && rows.every((r) => r.readsBefore > 100 && r.readsAfter > 100),
            '"Wheel speeds" switched on in the cruise, at 20 different moments of the app\'s read schedule, with set-up calls of 20 and of 150 ms, with the app\'s tick in step with its reads and after one hold-up of 23 ms: in ' + all((r) => r.beside) + ' of ' + all((r) => r.tries) +
            ' tries an own getter read began before the new subscription was set up or beside one of its calls (as released: in 5 of 20 after the hold-up). The reads go on afterwards (' + all((r) => r.readsAfter) + ' in the 3 s after each switch)');
        ok(all((r) => r.flying) >= 5 && all((r) => r.early) === 0,
            'in ' + all((r) => r.flying) + ' of those tries an own read was on its way to the car at the moment of the switch (it cannot be called back): the proxy was asked for only once it had been answered, never beside it');
        // a read that the car never answers: the new subscription does not wait for ever
        let value = () => ({});
        const opts = { setupMs: 20, getMs: 25, value: (i, f, t) => value(i, f, t), sets: { askCar: true } };
        const run = await boot(opts);
        value = carFor(run);
        stopAndGo(run, clock.mono - 30000);
        await advance(12000);
        opts.getMs = 1e9;                                       // from now on the binding answers no read
        let waited = 0;
        while (waited < 400 && !run.calls.some((c) => c.type === 'getValue' && c.own && c.t > clock.mono - 30)) { await advance(5); waited += 5; }
        const t0 = clock.mono, n0 = run.calls.length;
        run.settings.set('wheelsOn', true);
        await advance(4000);
        const built = run.calls.slice(n0).filter((c) => c.type === 'buildProxy')[0], reads = run.calls.slice(n0).filter((c) => c.type === 'getValue' && c.own && (c.t < run.lastSetupEnd || c.setupBusy > 0));
        ok(waited < 400 && built && built.iface === 'Powertrain' && built.t - t0 >= 1200 && built.t - t0 <= 1300 && reads.length === 0 && run.session.meters.wheels && run.session.meters.wheels.n > 10 && run.uncaught.length === 0 && run.rejections.length === 0,
            'an own read that the car never answers is on its way when "Wheel speeds" is switched on: the proxy is asked for ' + (built ? Math.round(built.t - t0) : '?') + ' ms later (a read is asked to give up after 1 s; the wait ends after 1.25 s whatever happens), no own read begins meanwhile, and the wheel values arrive');
    });

    ok.done();
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
