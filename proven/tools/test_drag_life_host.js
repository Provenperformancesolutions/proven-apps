'use strict';
/**
 * test_drag_life_host.js - ONE start of the built app on the kit's REAL runtime, for test_drag_life.js. Not a test by
 * itself. It is two things:
 *
 * 1. Loaded as a module (by the two small files test_drag_life.js puts into the staged app's node_modules), it is the
 *    stand-ins the kit's runtime runs on in place of BMW's software:
 *      sdk      for BMW's "oap-sdk": just what kit/runtime/mgu.js calls of it, each answered in the simplest way that
 *               lets mgu.js carry on. It is NOT the SDK and nothing in it was learned from the SDK.
 *      someip   for the head unit's native SOME/IP binding: just what kit/runtime/signals.js calls of it.
 *    Both follow checks/crash-lifecycle/realkit of the first car's investigation.
 * 2. Run as a script (forked by test_drag_life.js):  node test_drag_life_host.js <install root>
 *    it notes every text a frame draws, starts a standing stand-in car (its speed 0 answered to the kit's own first
 *    read and never notified, as a standing car does; the acceleration notified 10 times a second with one value) and
 *    then loads the app. The parent plays MainApp and the driver's finger over IPC:
 *      { t: 'shutdown' }       the SDK's "shutdown" event: the car asks the app to stop (mgu.js exits 200 ms later)
 *      { t: 'throw' }          an uncaught error in a timer (mgu.js logs it FATAL and exits with code 1)
 *      { t: 'shutdown-killed' }  the shutdown event, with the process killed (SIGKILL) the moment the app begins to write
 *                              its saved file in answer to it (a platform that asks, and then does not wait)
 *    A signal (SIGTERM, SIGHUP, SIGINT, SIGKILL) the parent sends with the operating system's own kill.
 *      { t: 'click', id }      a press on a bar button (BTN_PAGE, BTN_PREV), or on a row of the settings (SET_WORKSHOP,
 *                              SET_XSIGNALS: the kit switches that setting, as a press on the HMI's own row does)
 *      { t: 'texts', id }   -> { t: 'texts', id, texts, pushed, drawn, reads, built, sigs }: the texts of the last frame
 *                              drawn, how many frames were handed to the HMI and how many the app drew, the getter reads
 *                              and the proxies the binding saw, and how many listeners this process has for SIGTERM,
 *                              SIGHUP and SIGINT (sigs: [n, n, n])
 *      { t: 'hog', ms }        the app is held up: nothing of its code comes round for so many ms (a loop that does
 *                              nothing else), as while a long file write or a stuck call holds its one thread
 *      { t: 'shutdown-signal', sig }   the shutdown event, and in the same turn that signal sent to this process (a
 *                              platform that asks the app to stop and sends a signal as well)
 *      { t: 'sdk-listens', sig }       from now on something else on the process listens for that signal too and answers it
 *                              with the shutdown event, as an SDK that turns the signal into a clean stop would. NOT known
 *                              of BMW's SDK: it only stands for "somebody else listens as well"
 */
const EventEmitter = require('events');
const HU = global.__PPS_HU = global.__PPS_HU || { pushed: 0, drawn: 0, reads: 0, built: [], subs: 0, proxies: [], app: null, lastTexts: [] };

/* ---------- the stand-in for the SDK ---------- */
let nextId = 100;
const yes = () => Promise.resolve();
const rb = {
    createResourceHandles() { HU.pushed++; return Promise.resolve(); },
    getResourceHandle(f) { return { handle: f }; }, destroyResourceHandles: yes,
};
class Comp extends EventEmitter {
    constructor(name) { super(); this.name = name; this.id = nextId++; }
    setValue() { return Promise.resolve(); }
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
    getLastExecutedEntryPointUuid() { return 'fake-entry-uuid'; }
}
['registerActive', 'registerHmiVisible', 'unregisterHmiVisible', 'initialized'].forEach((m) => { OnlineApp.prototype[m] = yes; });
const noop = () => {};
const sdk = { OnlineApp, logging: { getSDKLogger: () => ({ error: noop, warn: noop, info: noop, debug: noop }) } };

/* ---------- the stand-in for the native binding: a standing car ---------- */
const SPEED = { speedVehicleCentreOfGravity: 0 }, ACCEL = { longitudinalAccelerationCentreOfGravity: 32500 };
const someip = {
    buildProxy(cfg) {
        const name = cfg.interface.split('.').pop();
        HU.built.push(name);
        const px = {
            name, subs: {},
            init: () => Promise.resolve(),
            subscribeToAvailability(cb) { setTimeout(() => cb(true), 30); },
            subscribe(o) { px.subs[o.name] = o.onReceive; HU.subs++; return Promise.resolve(); },
            getValue(field) {
                HU.reads++;
                return new Promise((res, rej) => setTimeout(() => (field === 'statusCarSpeed2' ? res(SPEED) : field === 'statusLongitudinalAccelerationMassCenter' ? res(ACCEL) : rej(new Error('standin: no such getter'))), 25));
            },
            isAvailable: () => false, shutdown: () => Promise.resolve(),
        };
        HU.proxies.push(px);
        return Promise.resolve(px);
    },
};

module.exports = { sdk, someip };

/* ---------- one start of the app ---------- */
if (require.main === module) {
    const path = require('path');
    const root = path.resolve(process.argv[2]), JS = path.join(root, 'source', 'javascript');
    // every text a frame draws is noted (as fakedrag.js does on the other bench)
    const rec = require(path.join(JS, 'kit', 'record')), R = rec.Recorder;
    const text0 = R.prototype.text, blit0 = R.prototype.blit, reset0 = R.prototype.reset, make0 = rec.makeLayer;
    R.prototype.text = function (str, x, y, size, c, opts) {
        const w = text0.apply(this, arguments), al = (opts && opts.align) || 'left';
        (this._texts || (this._texts = [])).push({ s: String(str), x0: al === 'center' ? x - w / 2 : al === 'right' ? x - w : x, y });
        return w;
    };
    R.prototype.reset = function () { this._texts = []; return reset0.apply(this, arguments); };
    R.prototype.blit = function (L, x, y) { (L._texts || []).forEach((t) => (this._texts || (this._texts = [])).push({ s: t.s, x0: t.x0 + Math.round(x), y: t.y + Math.round(y) })); return blit0.apply(this, arguments); };
    rec.makeLayer = function (w, h, draw, ts) { let texts = []; const L = make0(w, h, (r) => { draw(r); texts = r._texts || []; }, ts); L._texts = texts; return L; };
    const { Display } = require(path.join(JS, 'kit', 'display'));
    const present0 = Display.prototype.present;
    Display.prototype.present = function (name, img) { if (img && img._texts) { HU.lastTexts = img._texts.slice(); HU.drawn++; } return present0.apply(this, arguments); };
    // the car: the acceleration 10 times a second, one value (the speed is never notified: the car stands)
    setInterval(() => HU.proxies.forEach((p) => { if (p.name === 'CDS2' && p.subs.statusLongitudinalAccelerationMassCenter) p.subs.statusLongitudinalAccelerationMassCenter(ACCEL); }), 100);

    const send = (m) => { if (process.connected) process.send(m); };
    process.on('message', (m) => {
        if (m.t === 'shutdown') HU.app.emit('shutdown');
        else if (m.t === 'throw') setTimeout(() => { throw new Error('injected by the test: an uncaught error in a timer'); }, 0);
        else if (m.t === 'shutdown-killed') {
            // the shutdown event, and the process killed (SIGKILL) at the moment the app begins to write its saved file in answer to it
            const fs = require('fs'), write = fs.writeFileSync;
            fs.writeFileSync = function (file) { if (/pps_drag\.json\.tmp$/.test(String(file))) process.kill(process.pid, 'SIGKILL'); return write.apply(fs, arguments); };
            HU.app.emit('shutdown');
        }
        else if (m.t === 'click') HU.app.rhmiApplication.getByName(m.id).emit('action', {});
        else if (m.t === 'hog') { const end = Date.now() + (Number(m.ms) || 0); while (Date.now() < end) { /* held up */ } }
        else if (m.t === 'shutdown-signal') { HU.app.emit('shutdown'); process.kill(process.pid, m.sig); }
        else if (m.t === 'sdk-listens') process.on(m.sig, () => HU.app.emit('shutdown'));
        else if (m.t === 'texts') {
            const tx = (HU.lastTexts || []).filter((t) => t.s.trim()).sort((a, b) => (Math.abs(a.y - b.y) > 3 ? a.y - b.y : a.x0 - b.x0));
            send({ t: 'texts', id: m.id, texts: tx.map((t) => t.s), pushed: HU.pushed, drawn: HU.drawn, reads: HU.reads, built: HU.built.slice(), subs: HU.subs,
                sigs: ['SIGTERM', 'SIGHUP', 'SIGINT'].map((x) => process.listenerCount(x)) });
        }
    });
    process.on('disconnect', () => process.exit(0));
    require(path.join(JS, 'app.js'));
    send({ t: 'loaded' });
}
