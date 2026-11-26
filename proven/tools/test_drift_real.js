'use strict';
/**
 * test_drift_real.js <built app: dist/pps_drift> - Proven Drift on the kit's REAL runtime, one process per start,
 * in real time: kit/runtime/mgu.js, display.js and signals.js exactly as they are built into the app, with a
 * stand-in for BMW's SDK ("oap-sdk") and one for the native binding ("someip") under them. The test plays
 * MainApp: it starts the process, sends the SDK's "shutdown" event, makes the app throw, kills it (SIGKILL), and
 * empties its data folder. What it checks is what the NEXT start then shows on the Signals tab: how the app last
 * stopped. Takes about three minutes (fourteen lives, each a process of its own).
 * (After the investigators' checks/crash-lifecycle/realkit of 25 November 2026: host.js, fake-oap-sdk.js,
 * fake-someip.js and run_real.js, put into one file.)
 *
 * The app is "installed" as on a car (source/, data/, rhmiData/, someipInterfaces/) in a folder of the test's
 * own. ONE line of that copy of the kit is changed: the folder mgu.js writes drawn frames to is the test's own
 * and not /tmp, so that this test leaves /tmp alone. The app's record of starts and stops goes to the same
 * folder (PPS_BOX_TMP). Nothing else of the app or the kit is changed.
 *
 * What this cannot show: what MainApp really does and when (it is BMW's, and not in this source), the real SDK,
 * the real binding, Node.js 8 (this runs on the PC's Node), and how long a file write takes on a head unit: the
 * kit ends the process 200 ms after the shutdown event, and whether the app's writes fit into that on a car is
 * not known.
 *
 * PPS_TEST_ALL=1 in the environment: a failed check does not stop the run; they are listed at the end.
 * PPS_DRIFT_LINES=<file>: the lines the "Starts and stops" block drew at each start are also written to that file.
 */
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');

/* =====================================================================================================
 * THE CHILD: one start of the app (node test_drift_real.js --host <install root>)
 * ===================================================================================================== */
if (process.argv[2] === '--host') {
    const root = path.resolve(process.argv[3]), JS = path.join(root, 'source', 'javascript');
    const HU = global.__HU = { calls: { frames: 0 }, reads: { own: 0, kit: 0, fields: {} }, proxies: [], subscribed: 0, framesDrawn: 0 };
    // every text a frame draws is noted (as proven/tools/fakedrift.js does)
    const rec = require(path.join(JS, 'kit', 'record')), R = rec.Recorder;
    const text0 = R.prototype.text, blit0 = R.prototype.blit, reset0 = R.prototype.reset, make0 = rec.makeLayer;
    R.prototype.text = function (str, x, y) { const w = text0.apply(this, arguments); (this._texts || (this._texts = [])).push({ s: String(str), x0: x, y }); return w; };
    R.prototype.reset = function () { this._texts = []; return reset0.apply(this, arguments); };
    R.prototype.blit = function (L, x, y) { (L._texts || []).forEach((t) => (this._texts || (this._texts = [])).push({ s: t.s, x0: t.x0 + Math.round(x), y: t.y + Math.round(y) })); return blit0.apply(this, arguments); };
    rec.makeLayer = function (w, h, draw, ts) { let texts = []; const L = make0(w, h, (r) => { draw(r); texts = r._texts || []; }, ts); L._texts = texts; return L; };
    const { Display } = require(path.join(JS, 'kit', 'display'));
    const present0 = Display.prototype.present;
    Display.prototype.present = function (name, img) { if (img && img._texts) { HU.lastTexts = img._texts.slice(); HU.framesDrawn++; } return present0.apply(this, arguments); };
    // the app's own session and record, as the app holds them
    const S = require(path.join(JS, 'session')).Session, tick = S.prototype.tick;
    S.prototype.tick = function () { HU.session = this; return tick.apply(this, arguments); };
    const B = require(path.join(JS, 'box')).Box, note = B.prototype.note;
    B.prototype.note = function () { HU.box = this; return note.apply(this, arguments); };

    /* the made-up car, in real time: 60 km/h, corners of 0.3 g that change sides every 2.6 s. Its speed is notified when it
     * changes (looked at 50 times a second), CDS2 ten times a second, the steering wheel's angle 50 times a second */
    const V = 60, K = 0.005 * Math.PI / 180, t0 = Date.now();
    const lat = () => { const s = ((Date.now() - t0) / 1000) % 5.2; const side = s < 2.6 ? 1 : -1, x = s % 2.6; return 3 * side * Math.min(1, x / 0.3, (2.6 - x) / 0.3); };
    let fl = 0, sentSpeed = null;
    const val = {
        statusCarSpeed2: () => ({ speedVehicleCentreOfGravity: Math.round((V + 0.3 * Math.sin((Date.now() - t0) / 700)) / 0.015625) }),
        statusLateralAccelerationMassCenter: () => ({ lateralAccelerationCentreOfGravity: Math.round((lat() + 65) / 0.002) + (fl++ % 2) }),
        statusLongitudinalAccelerationMassCenter: () => ({ longitudinalAccelerationCentreOfGravity: 32500 + (fl++ % 2) }),
        statusYawVelocityVehicle: () => ({ yawVelocityVehicle: 32768 + Math.round(lat() / (V / 3.6) / K) + (fl++ % 2) }),
        ActualSteeringAngleDriver: () => ({ actualValueSteeringAngleDriver: 32767 + Math.round(lat() * 400) }),
    };
    HU.deliver = (iface, name, v) => HU.proxies.forEach((p) => { if (p.iface === iface && p.subs[name]) p.subs[name](v); });
    setInterval(() => { const v = val.statusCarSpeed2(); if (v.speedVehicleCentreOfGravity === sentSpeed) return; sentSpeed = v.speedVehicleCentreOfGravity; HU.deliver('de.bmw.infotainment.vehicle.Vehicle2', 'statusCarSpeed2', v); }, 20);
    setInterval(() => ['statusLateralAccelerationMassCenter', 'statusLongitudinalAccelerationMassCenter', 'statusYawVelocityVehicle'].forEach((f) => HU.deliver('de.bmw.infotainment.vehicle.CDS2', f, val[f]())), 100);
    setInterval(() => HU.deliver('de.bmw.chassis.SteeringAngle', 'ActualSteeringAngleDriver', val.ActualSteeringAngleDriver()), 20);
    HU.value = (iface, field) => (val[field] ? val[field]() : undefined);

    const send = (m) => { if (process.connected) process.send(m); };
    const stack = (on) => { const rh = HU.app && HU.app.rhmiApplication; if (rh) rh.emit('applicationStackChanged', on ? { ROOT_APP: [rh.getByName('MAIN').getId()] } : {}); };
    process.on('message', (m) => {
        if (m.t === 'shutdown') HU.app.emit('shutdown');
        else if (m.t === 'throw') setTimeout(() => { throw new Error('injected by the test: an uncaught error in a timer'); }, 0);
        else if (m.t === 'exit') setTimeout(() => process.exit(m.code), 0);
        // (the app is held up: nothing of its JavaScript runs for m.ms, as in a long frame, a slow file write or a stuck call)
        else if (m.t === 'hold') { send({ t: 'holding' }); const t = Date.now(); while (Date.now() - t < m.ms) { /* held up */ } }
        // (a stand-in SDK that answers SIGTERM with its own "shutdown" event 20 ms later. Whether BMW's SDK does so is not known)
        else if (m.t === 'sdkSig') process.on('SIGTERM', () => setTimeout(() => HU.app.emit('shutdown'), 20));
        else if (m.t === 'show') stack(true);
        else if (m.t === 'click') HU.app.rhmiApplication.getByName(m.id).emit('action', {});
        else if (m.t === 'set') { try { HU.session.settings.set(m.key, m.value); } catch (e) { /* said in the answer */ } }
        else if (m.t === 'look') {
            const tx = (HU.lastTexts || []).filter((t) => t.s.trim()).sort((a, b) => (Math.abs(a.y - b.y) > 3 ? a.y - b.y : a.x0 - b.x0)).map((t) => t.s.trim());
            const st = HU.session ? HU.session.eng.learn.status() : null;
            send({ t: 'look', id: m.id, texts: tx, reads: HU.reads, proxies: HU.proxies.map((p) => p.iface.split('.').pop()), subscribed: HU.subscribed, frames: HU.calls.frames,
                moments: st ? st.yaw.moments : null, saves: HU.session ? HU.session.store.saves : null, life: HU.box ? HU.box.me : null, sig: ['SIGTERM', 'SIGHUP', 'SIGINT'].map((x) => process.listenerCount(x)).join(), sdk: { active: HU.calls.registerActive, initialized: HU.calls.initialized } });
        }
    });
    process.on('disconnect', () => process.exit(0));
    require(path.join(JS, 'app.js'));
    send({ t: 'loaded' });
    return;
}

/* =====================================================================================================
 * THE PARENT: the test
 * ===================================================================================================== */
const { checker } = require('./fakecar');
if (!process.argv[2]) { console.error('usage: node proven/tools/test_drift_real.js dist/pps_drift'); process.exit(2); }
const STAGE = path.resolve(process.argv[2]);
const ok = checker();
const BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'pps-drift-real-')), ROOT = path.join(BASE, 'oap_fake'), DATA = path.join(ROOT, 'data'), FAKETMP = path.join(BASE, 'faketmp');
const rmrf = (d) => { try { const st = fs.lstatSync(d); if (st.isDirectory()) { fs.readdirSync(d).forEach((f) => rmrf(path.join(d, f))); fs.rmdirSync(d); } else fs.unlinkSync(d); } catch (e) { /* gone */ } };
process.on('exit', () => rmrf(BASE));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* the stand-ins the kit's runtime loads instead of BMW's SDK and the native binding: only what mgu.js and signals.js call */
const FAKE_SDK = `'use strict';
const EventEmitter = require('events');
const HU = global.__HU;
Object.assign(HU.calls, { registerActive: 0, registerHmiVisible: 0, unregisterHmiVisible: 0, initialized: 0, setValue: 0 });
let nextId = 100;
const yes = () => Promise.resolve();
const rb = { createResourceHandles(files) { HU.calls.frames++; return Promise.resolve(); }, getResourceHandle(f) { return { handle: f }; }, destroyResourceHandles: yes };
class Comp extends EventEmitter {
    constructor(name) { super(); this.name = name; this.id = nextId++; }
    setValue() { HU.calls.setValue++; return Promise.resolve(); }
    getId() { return this.id; }
    getStringBundle() { return { setStrings: yes }; }
    getResourceBundle() { return rb; }
}
['setProperty', 'setRowCount', 'updateResources', 'setRowSelected'].forEach((m) => { Comp.prototype[m] = yes; });
class Rhmi extends EventEmitter {
    constructor() { super(); this.comps = {}; }
    getByName(n) { if (n === 'KIT_HMI_ID8') return null; return this.comps[n] || (this.comps[n] = new Comp(n)); }
    getById(id) { return Object.keys(this.comps).map((k) => this.comps[k]).filter((c) => c.id === id)[0] || null; }
    getResourceBundle() { return rb; }
}
['openState', 'closeState', 'mapEntryState', 'openEntryState'].forEach((m) => { Rhmi.prototype[m] = yes; });
class OnlineApp extends EventEmitter {
    constructor() { super(); HU.app = this; this.startReason = 'ENTRY_POINT'; this.rhmiApplication = new Rhmi(); }
    start() { setImmediate(() => this.emit('appStatusProxyReady')); return Promise.resolve(); }
    registerActive() { HU.calls.registerActive++; return Promise.resolve(); }
    registerHmiVisible() { HU.calls.registerHmiVisible++; return Promise.resolve(); }
    unregisterHmiVisible() { HU.calls.unregisterHmiVisible++; return Promise.resolve(); }
    initialized() { HU.calls.initialized++; return Promise.resolve(); }
    getLastExecutedEntryPointUuid() { return 'fake-entry-uuid'; }
}
const noop = () => {};
module.exports = { OnlineApp, logging: { getSDKLogger: () => ({ error: noop, warn: noop, info: noop, debug: noop }) } };
`;
const FAKE_SOMEIP = `'use strict';
const HU = global.__HU;
function buildProxy(cfg) {
    const px = {
        iface: cfg.interface, subs: {},
        init: () => Promise.resolve(),
        subscribeToAvailability(cb) { setTimeout(() => cb(true), 30); },
        subscribe(o) { px.subs[o.name] = o.onReceive; HU.subscribed++; return Promise.resolve(); },
        getValue(field, limit) {
            // (the kit's own first read asks with a limit of 3000 ms, the app's own reads with 1000)
            if (limit === 3000) HU.reads.kit++; else HU.reads.own++;
            HU.reads.fields[field] = (HU.reads.fields[field] || 0) + 1;
            return new Promise((res, rej) => setTimeout(() => { const v = HU.value ? HU.value(px.iface, field) : undefined; if (v === undefined) rej(new Error('fake: no value')); else res(v); }, 25));
        },
        isAvailable: () => false, shutdown: () => Promise.resolve(),
    };
    HU.proxies.push(px);
    return Promise.resolve(px);
}
module.exports = { buildProxy };
`;

function install() {
    const copy = (from, to) => { const st = fs.statSync(from); if (st.isDirectory()) { fs.mkdirSync(to); fs.readdirSync(from).forEach((f) => copy(path.join(from, f), path.join(to, f))); } else fs.writeFileSync(to, fs.readFileSync(from)); };
    fs.mkdirSync(ROOT); fs.mkdirSync(DATA); fs.mkdirSync(FAKETMP); fs.mkdirSync(path.join(ROOT, 'rhmiData')); fs.mkdirSync(path.join(ROOT, 'rhmiData', 'resources'));
    copy(path.join(STAGE, 'source'), path.join(ROOT, 'source'));
    // (a preview build has an empty node_modules folder: on a car the SDK and the binding are found there)
    const mods = path.join(ROOT, 'source', 'node_modules');
    if (!fs.existsSync(mods)) fs.mkdirSync(mods);
    [['oap-sdk', FAKE_SDK], ['someip', FAKE_SOMEIP]].forEach((m) => { rmrf(path.join(mods, m[0])); fs.mkdirSync(path.join(mods, m[0])); fs.writeFileSync(path.join(mods, m[0], 'index.js'), m[1]); });
    // the one change to the copy of the kit: where drawn frames go
    const mgu = path.join(ROOT, 'source', 'javascript', 'kit', 'mgu.js'), src = fs.readFileSync(mgu, 'utf8'), was = "path.join('/tmp', 'mgu-frames-'";
    if (src.indexOf(was) < 0) throw new Error('mgu.js: the frame folder line was not found');
    fs.writeFileSync(mgu, src.replace(was, "path.join(process.env.PPS_FAKE_TMP, 'mgu-frames-'"));
    fs.writeFileSync(path.join(ROOT, 'rhmiData', 'application.json'), JSON.stringify({ application: { entryPoints: [{ uuid: 'fake-entry-uuid' }] } }));
    // the interface files, as the installer makes them from the manifest: a field has a getter where the manifest says "r"
    const man = JSON.parse(fs.readFileSync(path.join(STAGE, 'source', 'manifest.json'), 'utf8')).proxies;
    fs.mkdirSync(path.join(ROOT, 'someipInterfaces'));
    Object.keys(man).forEach((iface) => {
        if (!man[iface] || typeof man[iface] !== 'object') return;
        const fields = {};
        Object.keys(man[iface].attributes || {}).forEach((k) => { fields[k] = man[iface].attributes[k].indexOf('r') >= 0 ? { getter: { id: 1 } } : {}; });
        fs.writeFileSync(path.join(ROOT, 'someipInterfaces', iface.replace(/\./g, '_') + '.json'), JSON.stringify({ interface: iface, fields }));
    });
}

let seq = 0;
function start() {
    const ch = cp.fork(__filename, ['--host', ROOT], { cwd: DATA, silent: true, env: Object.assign({}, process.env, { PPS_FAKE_TMP: FAKETMP, PPS_BOX_TMP: FAKETMP }) });
    ch.err = ''; ch.stderr.on('data', (d) => { ch.err += d; }); ch.stdout.on('data', () => {});
    ch.done = new Promise((res) => ch.on('exit', (code, signal) => res({ code, signal, at: Date.now() })));
    ch.waiting = {}; ch.on('error', () => {});
    ch.on('message', (m) => { if (m.t === 'look' && ch.waiting[m.id]) { ch.waiting[m.id](m); delete ch.waiting[m.id]; } if (m.t === 'holding' && ch.held) ch.held(); });
    /** Hold the app up for ms (its JavaScript does not run); kept once the hold-up has begun. */
    ch.hold = (ms) => new Promise((res) => { ch.held = res; ch.tell({ t: 'hold', ms }); });
    ch.tell = (m) => { if (ch.connected) ch.send(m); };
    ch.look = () => new Promise((res) => { if (!ch.connected) { res(null); return; } const id = ++seq; ch.waiting[id] = res; ch.send({ t: 'look', id }); setTimeout(() => { if (ch.waiting[id]) { delete ch.waiting[id]; res(null); } }, 4000); });
    /** The texts of a page: 'drift' (where the app opens), 'signals' (two presses of Previous page from there), and back. */
    ch.page = async (which) => { if (which === 'signals') { ch.tell({ t: 'click', id: 'BTN_PREV' }); await sleep(250); ch.tell({ t: 'click', id: 'BTN_PREV' }); await sleep(2400); } const m = await ch.look(); if (which === 'signals') { ch.tell({ t: 'click', id: 'BTN_PAGE' }); await sleep(250); ch.tell({ t: 'click', id: 'BTN_PAGE' }); await sleep(400); } return m; };
    return ch;
}
const boxOf = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const RAM = () => boxOf(path.join(FAKETMP, 'pps-box-pps_drift-' + process.getuid(), 'box.json')), COPY = () => boxOf(path.join(DATA, 'pps_drift_box.json'));
const saved = () => { try { return JSON.parse(fs.readFileSync(path.join(DATA, 'pps_drift.json'), 'utf8')); } catch (e) { return null; } };
const logText = () => { try { return fs.readFileSync(path.join(DATA, 'pps_drift.log'), 'utf8'); } catch (e) { return ''; } };
// (the lines of the "Starts and stops" block: a life's line begins with its number; where it runs on into a second line, that one ends with what was switched on)
const lines = (m) => (m ? m.texts.filter((s) => /^#\d+ |(^|, )on: [A-Za-z, ]+$|emptied/.test(s) && !/^SIGNALS|^STARTS/.test(s)) : []);
// PPS_DRIFT_LINES=<file>: the lines of the "Starts and stops" block as each start drew them are also written there, in full
const keep = (title, L) => { if (process.env.PPS_DRIFT_LINES) fs.appendFileSync(process.env.PPS_DRIFT_LINES, title + '\n' + L.map((l) => '    ' + l).join('\n') + '\n'); };
const NOTICE = 'The app stopped by itself last time. Please photograph the Signals tab.';
/** One start: the process up, its screen shown, the first screen past. */
async function life() { const ch = start(); await sleep(1200); ch.tell({ t: 'show' }); await sleep(3600); return ch; }

(async () => {
    install();
    const coreOnly = (m) => m && m.proxies.join() === 'Vehicle2,CDS2,SteeringAngle' && m.subscribed === 6 && m.reads.own === 0 && m.reads.kit === 4;

    /* ================= life 1: a clean stop ================= */
    await ok.part('life 1: the app runs on the kit\'s real runtime; MainApp asks it to stop (the SDK\'s "shutdown" event)', async () => {
        let ch = start();
        await sleep(1200);
        ch.tell({ t: 'show' });
        await sleep(900);
        let m = await ch.look();
        ok(m && m.sdk.active >= 1 && m.sdk.initialized === 1 && m.texts.indexOf('CLOSED COURSE ONLY') >= 0 && m.texts.indexOf('BETA: still being tested on cars. The drift angle shown is an estimate.') >= 0,
            'the app starts on the kit\'s own mgu.js, reports active and initialized to the stand-in SDK, and draws its first screen: CLOSED COURSE ONLY, "BETA: still being tested on cars. The drift angle shown is an estimate."');
        // it drives: corners both ways. What it learns is in memory first
        let n = 0;
        for (let i = 0; i < 80; i++) { await sleep(500); m = await ch.look(); n = m ? m.moments : 0; const f = saved(); if (m && f && f.learned && f.learned.yaw && f.learned.yaw.cds2 && n >= 4 && n > f.learned.yaw.cds2.length) break; }
        const inFile = saved().learned.yaw.cds2.length, r0 = RAM();
        ok(m.sig === '0,0,0', 'as shipped the process has no listener for SIGTERM, SIGHUP or SIGINT (' + m.sig + '): it answers a signal as 1.0.0 did');
        ok(coreOnly(m) && n >= 4 && n > inFile && m.frames >= 3,
            'driving through corners, as shipped: three proxies (Vehicle2, CDS2, SteeringAngle), six subscriptions, the kit\'s four first reads and NOT ONE getter read of the app\'s own. ' + n + ' moments of the yaw rate are learned, ' + inFile + ' of them in the saved file so far');
        ok(r0 && r0.lives[0].n === 1 && r0.lives[0].end === null && r0.lives[0].note && r0.lives[0].note.mem > 10 && r0.lives[0].note.path === 'soft' && r0.lives[0].note.fps >= 1 && r0.lives[0].note.nps > 50 && r0.lives[0].note.asked === 0 && r0.lives[0].note.ok === 3 && COPY() && COPY().lives[0].n === 1,
            'the record of this life is in RAM with its last note (memory ' + r0.lives[0].note.mem + ' MB, processor ' + r0.lives[0].note.cpu + ' %, longest hold-up ' + r0.lives[0].note.lagMax + ' ms, ' + r0.lives[0].note.fps + ' frames a second in software, ' + r0.lives[0].note.nps + ' values a second), and its copy in the data folder');
        const t = Date.now();
        ch.tell({ t: 'shutdown' });
        const end = await ch.done, took = end.at - t, after = saved().learned.yaw.cds2.length, log = logText();
        ok(end.code === 0 && took >= 150 && took < 1500, 'the SDK\'s "shutdown" event: the kit ends the process with exit code 0, ' + took + ' ms later');
        ok(after >= n && /stopping: asked to stop by the car\. The saved file is written/.test(log) && /shutdown requested by MainApp/.test(log) && /INFO exit code 0/.test(log),
            'in that time the app wrote its saved file: it now holds ' + after + ' moments (memory held ' + n + ' at the last look, the file ' + inFile + '). The log says so, between the kit\'s own two lines');
        ok(RAM().lives[0].end === 'asked' && RAM().lives[0].code === 0 && COPY().lives[0].end === 'asked', 'and the stop is in the record, in RAM and in the data folder: asked to stop, exit code 0');
    });

    /* ================= life 2: an uncaught error ================= */
    await ok.part('life 2 shows how life 1 ended; then an uncaught error (the kit logs it and exits with code 1)', async () => {
        const ch = await life();
        const d = await ch.page('drift'), s = await ch.page('signals'), L = lines(s);
        keep('life 2, after a clean stop of life 1 (the SDK\'s shutdown event):', L);
        ok(L.length >= 2 && /^#2 now: \d+ s \(started \d+ s after #1 ended\)/.test(L[0]) && L.some((l) => /^#1 \d\d\.\d\d\. \d\d:\d\d:\d\d lived \d+ s, asked to stop by the car, Last note: memory \d+ MB/.test(l)),
            'the Signals tab of the next start: "' + (L.filter((l) => /^#1 /.test(l))[0] || '').slice(0, 120) + ' ..."');
        ok(d.texts.indexOf(NOTICE) < 0 && s.texts.indexOf('STARTS AND STOPS OF PROVEN DRIFT 1.0.1, NEWEST FIRST') >= 0 && d.moments >= 4 && coreOnly(s), 'nothing about it on the Drift tab (it was a clean stop); what was learned is there from the first moment; again no getter read of the app\'s own');
        ch.tell({ t: 'throw' });
        const end = await ch.done, log = logText(), r = RAM();
        ok(end.code === 1 && /FATAL uncaught: Error: injected by the test: an uncaught error in a timer/.test(log) && /FATAL exit code 1/.test(log), 'an uncaught error in a timer: the kit\'s own handler still runs (the error is not swallowed), logs FATAL and exits with code 1');
        // (CHANGED in 1.0.1's second part: the error's first line is kept with the file and line its stack names first)
        ok(r.lives[0].n === 2 && r.lives[0].end === 'error' && /^Error: injected by the test: an uncaught error in a timer \(test_drift_real\.js:\d+\)$/.test(r.lives[0].err) && r.lives[0].code === 1, 'and the app\'s record has it, written before the kit\'s handler ended the process: "' + r.lives[0].err + '", then the exit code');
        ok(r.lives[0].note && r.lives[0].note.nps > 50 && r.lives[0].note.fps >= 1, 'the last note of that life still has the rates of its last 2 s (' + r.lives[0].note.fps + ' frames and ' + r.lives[0].note.nps + ' values a second): an end works out none (in Proven Drag an own error read "0 frames/s, 0 values/s")');
    });

    /* ================= life 3: a kill ================= */
    await ok.part('life 3 shows the error; then the process is killed (SIGKILL: nothing can be written)', async () => {
        const ch = await life();
        const d = await ch.page('drift'), s = await ch.page('signals'), L = lines(s);
        keep('life 3, after an uncaught error in life 2:', L);
        ok(L.some((l) => /^#2 .* lived \d+ s, THE APP'S OWN ERROR \(exit code 1\): Error: injected by the test: an uncaught error in a timer/.test(l)) && d.texts.indexOf(NOTICE) >= 0,
            'the next start: "' + (L.filter((l) => /^#2 /.test(l))[0] || '').slice(0, 130) + ' ...", and the Drift tab says "' + NOTICE + '"');
        ch.tell({ t: 'set', key: 'workshop', value: true }); ch.tell({ t: 'set', key: 'gpsOn', value: true });
        await sleep(2600);
        const m = await ch.look();
        ok(m.proxies.join() === 'Vehicle2,CDS2,SteeringAngle,SatellitePositioning' && m.subscribed === 7 && m.reads.own === 0, '"GPS receiver" switched on in this life: one more proxy and its event, on the real signals.js');
        ch.kill('SIGKILL');
        const end = await ch.done;
        ok(end.signal === 'SIGKILL' && RAM().lives[0].n === 3 && RAM().lives[0].end === null && RAM().lives[0].on.join() === 'gpsOn', 'killed: the record in RAM has life 3 with its last note and no end');
    });

    /* ================= life 4: a kill, and the data folder emptied ================= */
    await ok.part('life 4 shows the kill; then it is killed too and its data folder emptied (what the platform is said to do after an unexpected exit)', async () => {
        const ch = await life();
        const d = await ch.page('drift'), s = await ch.page('signals'), L = lines(s);
        keep('life 4, after life 3 was killed (kill -9):', L);
        ok(L.some((l) => /^#3 .* lived \d+ s, NO WORD \(killed, crashed or power lost\), Last note: memory \d+ MB.*on: GPS$/.test(l)) && d.texts.indexOf(NOTICE) >= 0 && s.proxies.join() === 'Vehicle2,CDS2,SteeringAngle,SatellitePositioning',
            'the next start: "' + (L.filter((l) => /^#3 /.test(l))[0] || '').slice(0, 150) + ' ...", with what was switched on in that life, and the Drift tab asks for the photo. (The setting was saved, so the GPS receiver is subscribed again)');
        ch.kill('SIGKILL');
        await ch.done;
        fs.readdirSync(DATA).forEach((f) => rmrf(path.join(DATA, f)));
        ok(fs.readdirSync(DATA).length === 0 && RAM() && RAM().lives[0].n === 4, 'killed, and the data folder emptied: the saved file, the settings, the log and the record\'s copy are gone. The record in RAM is still there');
    });

    /* ================= life 5 ================= */
    await ok.part('life 5: the record in RAM outlived the emptied data folder', async () => {
        const ch = await life();
        const d = await ch.page('drift'), s = await ch.page('signals'), L = lines(s), all = s.texts;
        keep('life 5, after life 4 was killed and the data folder emptied:', L);
        ok(L.some((l) => /^#4 .* NO WORD \(killed, crashed or power lost\)/.test(l)) && all.indexOf('The saved data was emptied after #4') >= 0 && L.filter((l) => /^#\d+ /.test(l)).length === 5 && d.texts.indexOf(NOTICE) >= 0,
            'the next start says: "' + (L.filter((l) => /^#4 /.test(l))[0] || '').slice(0, 90) + ' ..." and "The saved data was emptied after #4". All five lives are on the Signals tab, newest first');
        ok(coreOnly(s) && d.moments <= 3 && d.texts.indexOf('LEARNING THE CAR') >= 0, 'with its data emptied the app is back at its shipped settings (the GPS receiver is off again: three proxies, no getter read of its own) and has to learn the car again (' + d.moments + ' moments in its first seconds, LEARNING THE CAR)');
        ok(COPY() && COPY().lives.length === 5 && COPY().lives[1].emptied === true, 'the data folder has the record\'s copy again');
        ch.tell({ t: 'shutdown' });
        const end = await ch.done;
        ok(end.code === 0 && RAM().lives[0].end === 'asked', 'and a clean stop at the end');
    });

    /* ================= lives 6 to 9: the three signals, and an exit code with no word ================= */
    // (1.0.1, second part) The kit listens for no signal, so SIGTERM, SIGHUP and SIGINT each end the process at once and the
    // record could not tell them from kill -9. box.js notes the signal and lets it do its work: the process must still end
    // BY THE SIGNAL, as it would without the listener (no exit code, the signal's name).
    // (CHANGED in the repair of 1.0.1: only with "Note stop signals" switched on, which it is in life 6 and, the setting
    // being saved, in the lives after it. As shipped the app listens for no signal: lives 12 and 13 below.)
    let n = 6;
    for (const how of ['SIGTERM', 'SIGHUP', 'SIGINT', 'exit 3']) {
        const me = n++, before = me - 1, was = ['asked to stop by the car', 'ENDED BY THE SIGNAL SIGTERM (sent from outside the app)', 'ENDED BY THE SIGNAL SIGHUP (sent from outside the app)', 'ENDED BY THE SIGNAL SIGINT (sent from outside the app)'][me - 6];
        await ok.part('life ' + me + ' shows how life ' + before + ' ended; then ' + (how === 'exit 3' ? 'the process ends itself with exit code 3 and no word' : 'the process is sent ' + how), async () => {
            const ch = await life();
            const d = await ch.page('drift'), s = await ch.page('signals'), L = lines(s), line = L.filter((l) => l.indexOf('#' + before + ' ') === 0)[0] || '';
            keep('life ' + me + ', after life ' + before + ' (' + was + '):', L);
            ok(line.indexOf(', ' + was) > 0 && (d.texts.indexOf(NOTICE) >= 0) === (me > 6),
                'the next start: "' + line.slice(0, 120) + ' ..."' + (me > 6 ? ', and the Drift tab asks for the photo: a signal is a stop nobody asked for through the SDK' : ', and nothing about it on the Drift tab'));
            if (me === 6) {
                ch.tell({ t: 'set', key: 'workshop', value: true }); ch.tell({ t: 'set', key: 'sigOn', value: true });
                await sleep(400);
                const on = await ch.look(), s2 = await ch.page('signals');
                ok(s.sig === '0,0,0' && on.sig === '1,1,1' && RAM().lives[0].on.join() === 'sigOn' && lines(s2).some((l) => / on: signals$/.test(l)),
                    '"Note stop signals" switched on in this life: one listener for each of the three signals (' + s.sig + ' before, ' + on.sig + ' now), and the record lists "on: signals" at once');
            } else if (how !== 'exit 3') ok(s.sig === '1,1,1' && RAM().lives[0].on.join() === 'sigOn', '(the setting was saved: this life listens from its start, and its record says "on: signals")');
            if (how === 'exit 3') {
                ch.tell({ t: 'exit', code: 3 });
                const end = await ch.done, r = RAM();
                ok(end.code === 3 && r.lives[0].n === me && r.lives[0].end === 'exit' && r.lives[0].code === 3, 'process.exit(3) with no word before it: the record has the exit code and no other end');
            } else {
                ch.kill(how);
                const end = await ch.done, r = RAM();
                ok(end.signal === how && end.code === null && r.lives[0].n === me && r.lives[0].end === 'signal' && r.lives[0].sig === how && r.lives[0].note && r.lives[0].note.nps > 50,
                    how + ': the process ends by that signal, with no exit code, exactly as it does without a listener (' + JSON.stringify({ code: end.code, signal: end.signal }) + '), and the record in RAM has the signal\'s name and the last note');
            }
        });
    }
    /* ================= lives 10 to 14: what the two checks of 1.0.1 found (the repair) ================= */
    await ok.part('life 10 shows the exit code; then SIGTERM that a stand-in SDK answers with its "shutdown" event (the setting is on)', async () => {
        const ch = await life();
        const d = await ch.page('drift'), s = await ch.page('signals'), L = lines(s), line = L.filter((l) => /^#9 /.test(l))[0] || '';
        keep('life 10, after life 9 ended itself with exit code 3 and no word:', L);
        ok(/^#9 .* lived \d+ s, EXIT CODE 3 AND NO WORD BEFORE IT/.test(line) && d.texts.indexOf(NOTICE) >= 0, 'the next start: "' + line.slice(0, 110) + ' ...", and the Drift tab asks for the photo (in Proven Drag such an end got no line there)');
        // Nobody knows whether BMW's SDK turns SIGTERM into its shutdown event. If it does (here: a stand-in that listens for
        // SIGTERM in JavaScript and emits "shutdown" 20 ms later), the app is stopped cleanly, and the record must say so.
        ch.tell({ t: 'sdkSig' });
        await sleep(300);
        ch.kill('SIGTERM');
        const end = await ch.done, r = RAM();
        ok(end.code === 0 && end.signal === null && r.lives[0].n === 10 && r.lives[0].end === 'asked' && r.lives[0].sig === 'SIGTERM' && r.lives[0].code === 0 && COPY().lives[0].end === 'asked',
            'SIGTERM, and the stand-in SDK asks the app to stop 20 ms later: the process ends with exit code 0 (' + JSON.stringify({ code: end.code, signal: end.signal }) + '), and the record says "asked", with the signal noted beside it (as released the record said "signal" and nothing of the clean stop)');
    });

    await ok.part('life 11 shows that clean stop; then SIGTERM while the app is held up, with the setting ON: what the setting costs', async () => {
        const ch = await life();
        const d = await ch.page('drift'), s = await ch.page('signals'), L = lines(s), line = L.filter((l) => /^#10 /.test(l))[0] || '';
        keep('life 11, after life 10 (SIGTERM that a stand-in SDK turned into its shutdown event; "Note stop signals" on):', L);
        ok(/^#10 .* lived \d+ s, asked to stop by the car \(the signal SIGTERM came first\)/.test(line) && d.texts.indexOf(NOTICE) < 0,
            'the next start: "' + line.slice(0, 110) + ' ...", and nothing about it on the Drift tab: it was a clean stop (as released: "ENDED BY THE SIGNAL SIGTERM", and the Drift tab asked for a photo)');
        await ch.hold(3000);
        await sleep(500);
        const t = Date.now();
        ch.kill('SIGTERM');
        const end = await ch.done, took = end.at - t, r = RAM();
        ok(end.signal === 'SIGTERM' && took >= 1800 && took < 4500 && r.lives[0].n === 11 && r.lives[0].end === 'signal' && r.lives[0].sig === 'SIGTERM',
            'the app is held up for 3 s and sent SIGTERM half a second in, WITH the setting on: the process ends by SIGTERM only when the hold-up is over, ' + took + ' ms after the signal (a listener hears a signal only when the app\'s code comes round again). The record then has the signal. This is why the setting is off as shipped');
    });

    await ok.part('life 12 shows the signal; the setting is switched OFF again (as shipped): SIGTERM into a hold-up ends the app at once', async () => {
        const ch = await life();
        const s = await ch.page('signals'), L = lines(s), line = L.filter((l) => /^#11 /.test(l))[0] || '';
        keep('life 12, after life 11 (SIGTERM while the app was held up; "Note stop signals" on):', L);
        ok(/^#11 .* lived \d+ s, ENDED BY THE SIGNAL SIGTERM \(sent from outside the app\)/.test(line), 'the next start: "' + line.slice(0, 110) + ' ..."');
        ch.tell({ t: 'set', key: 'sigOn', value: false });
        await sleep(2400);
        const off = await ch.look();
        ok(off.sig === '0,0,0' && RAM().lives[0].on.length === 0, '"Note stop signals" switched off: the three listeners are gone at once (' + off.sig + ') and the record no longer lists it. This is the app as shipped');
        await ch.hold(4000);
        await sleep(500);
        const t = Date.now();
        ch.kill('SIGTERM');
        const end = await ch.done, took = end.at - t, r = RAM();
        ok(end.signal === 'SIGTERM' && end.code === null && took < 1000 && r.lives[0].n === 12 && r.lives[0].end === null && r.lives[0].sig === null,
            'held up for 4 s and sent SIGTERM half a second in, as shipped: the process ends by SIGTERM ' + took + ' ms after the signal, in the middle of the hold-up, exactly as 1.0.0 does (as released it ended only when the hold-up was over). The record has no end: such a stop reads NO WORD');
    });

    await ok.part('life 13 shows NO WORD; then its folder in RAM is removed while the head unit runs on, and the app is killed', async () => {
        const ch = await life();
        const d = await ch.page('drift'), s = await ch.page('signals'), L = lines(s), line = L.filter((l) => /^#12 /.test(l))[0] || '';
        keep('life 13, after life 12 (SIGTERM as shipped: no listener, so no word):', L);
        ok(/^#12 .* lived \d+ s, NO WORD \(killed, crashed or power lost\)/.test(line) && d.texts.indexOf(NOTICE) >= 0 && s.sig === '0,0,0', 'the next start: "' + line.slice(0, 100) + ' ...", and the Drift tab asks for the photo');
        // (the data folder's copy has a real note once the life is 10 s old: wait for it)
        for (let i = 0; i < 40 && !(COPY() && COPY().lives[0].n === 13 && COPY().lives[0].s >= 10); i++) await sleep(500);
        const copy = COPY().lives[0];
        rmrf(path.join(FAKETMP, 'pps-box-pps_drift-' + process.getuid()));
        await sleep(2600);
        const gone = !fs.existsSync(path.join(FAKETMP, 'pps-box-pps_drift-' + process.getuid()));
        ch.kill('SIGKILL');
        const end = await ch.done;
        ok(copy.n === 13 && copy.s >= 10 && copy.ram === true && gone && end.signal === 'SIGKILL', 'the folder in RAM is removed while the app runs (it is made again a minute later at the earliest), and the app is killed: all that is left of life 13 is the data folder\'s copy, ' + copy.s + ' s into it');
    });

    await ok.part('life 14: the record in RAM was gone, and the head unit did not restart', async () => {
        const ch = await life();
        const d = await ch.page('drift'), s = await ch.page('signals'), L = lines(s), line = L.filter((l) => /^#13 /.test(l))[0] || '';
        keep('life 14, after life 13 was killed and its folder in RAM removed (the head unit ran on):', L);
        ok(/^#14 now: \d+ s \(the record in RAM was gone, no restart since #13\)/.test(L[0] || '') && /^#13 .* lived at least \d+ s \(saved note, up to a minute old\), NO WORD \(killed, crashed or power lost\)/.test(line) && d.texts.indexOf(NOTICE) >= 0,
            'the next start: "' + (L[0] || '').slice(0, 64) + ' ..." and "' + line.slice(0, 96) + ' ...", and the Drift tab asks for the photo (as released: "the head unit was restarted since #13", and no line on the Drift tab)');
        ok(RAM() && RAM().lives[0].n === 14 && s.texts.some((t) => /STARTS AND STOPS OF PROVEN DRIFT \d+\.\d+\.\d+, NEWEST FIRST/.test(t)), 'the record is in RAM again, and the block\'s heading names the version: "' + (s.texts.filter((t) => /^STARTS AND STOPS/.test(t))[0] || '') + '"');
        ch.tell({ t: 'shutdown' });
        const end = await ch.done;
        ok(end.code === 0 && RAM().lives[0].end === 'asked', 'and a clean stop at the end');
    });

    ok.done();
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
