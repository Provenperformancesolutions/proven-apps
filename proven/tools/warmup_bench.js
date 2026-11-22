'use strict';
/**
 * warmup_bench.js - a test bench for Proven Warm-Up: the built app (app.js with source.js, gearbox.js and warm.js,
 * on the kit's own read-only diagnostic link) started on a PC against a stand-in car, on clocks the test moves by
 * hand. Used by test_warmup_car.js. No car needed.
 *
 *   const bench = require('./warmup_bench')('dist/pps_warmup');
 *   const car = await bench.boot({ sets: { tempUnit: 'f' } });     // the app started; car = the stand-in car
 *   car.rpm = 900; car.temps(22, 21);                               // what the car sends (see makeCar)
 *   await bench.advance(5000);                                      // 5 s pass: timers, replies, the app's ticks
 *   car.status()                                                    // the decision now (warm.js status)
 *   await car.frame()                                               // one frame of the screen: the texts it drew
 *
 * Both clocks are stand-ins: the forward-only clock (process.hrtime) and the wall clock (Date.now), which a test
 * can set back or forward on its own (bench.clock.wall), as the head unit does after start-up. Timers run on the
 * forward-only clock, as Node's own do.
 * The head unit is the kit's PC stand-in (kit/tools/hu-stub.js), as its preview.js uses it; the car's signals
 * and its diagnostic transport are the stand-ins below. What a real car sends is not known from here.
 */
const fs = require('fs'), os = require('os'), path = require('path');

module.exports = function (stageArg) {
    const STAGE = path.resolve(stageArg), JS = path.join(STAGE, 'source', 'javascript');
    const real = { setImmediate };
    const clock = { mono: 100000, wall: 1763400000000, timers: [], id: 1 };
    // the app's data folder (it only reads its settings file there): gone again when the test ends
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pps-warmup-test-'));
    process.on('exit', () => { try { fs.readdirSync(dataDir).forEach((f) => fs.unlinkSync(path.join(dataDir, f))); fs.rmdirSync(dataDir); } catch (e) { /* nothing to remove */ } });

    /* ---------- the clocks and the timers ---------- */
    const timer = (fn, ms, every, args) => { const t = { id: clock.id++, at: clock.mono + Math.max(0, Number(ms) || 0), every, fn: () => fn.apply(null, args) }; clock.timers.push(t); return t.id; };
    global.setTimeout = (fn, ms, ...args) => timer(fn, ms, 0, args);
    global.setInterval = (fn, ms, ...args) => timer(fn, ms, Math.max(1, Number(ms) || 1), args);
    global.setImmediate = (fn, ...args) => timer(fn, 0, 0, args);
    global.clearTimeout = global.clearInterval = global.clearImmediate = (id) => { clock.timers = clock.timers.filter((t) => t.id !== id); };
    const wallNow = Date.now;
    Date.now = () => clock.wall;
    Date.now.real = wallNow;
    process.hrtime = () => [Math.floor(clock.mono / 1000), Math.round((clock.mono % 1000) * 1e6)];
    // everything that is waiting on a promise runs before the next timer does
    const settle = () => new Promise((resolve) => real.setImmediate(resolve));
    /** ms pass on both clocks: the timers that fall due run in turn. */
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
            due.fn();
            await settle();
        }
        clock.wall += end - clock.mono; clock.mono = end;
        await settle();
    }

    /* ---------- the stand-in car ---------- */
    function makeCar() {
        const car = {
            handlers: {},              // interface -> the handlers the app subscribed
            watchFail: {},             // interface -> how many more subscriptions fail (the car's services not up yet)
            missing: {},               // interface -> true: this head unit does not have it (the kit's error for that)
            proxyFail: 0,              // how many more diagnostic-link set-ups fail
            transport: true,           // false: the diagnostic transport refuses every request
            egs: null,                 // the gearbox unit: (did) => reply bytes, or null (no answer); null = no unit
            delay: 60,                 // ms until a unit's reply
            foreign: null,             // reply bytes of another app's request, arriving 20 ms into our next request
            sent: [],                  // the requests that reached the transport: { t, ecu, did }
            listeners: [],             // every diagnostic link gets every reply
            rpm: null, speed: null,    // what the car sends over and over (null: nothing more)
            screen: false, widget: false,          // the app's screen is showing / a widget is on the home screen
            logs: [], cells: {}, errors: [],
            picture: null,             // the last frame of the screen (its .png() is the picture)
        };
        const frame = (ecu, uds) => ({ udsResponse: [0, 0, 0, 0, 0, 0, ecu, 0, 0].concat(uds) });
        car.reply = (ecu, uds) => car.listeners.slice().forEach((fn) => fn(frame(ecu, uds)));
        car.signals = {
            watch: (iface, inst, h) => {
                const name = iface.split('.').pop();
                if (car.missing[name]) return Promise.resolve({ iface, available: false, proxy: null, error: 'Error: no SOME/IP config for ' + iface + ' (add it to app.json "signals")' });
                if (car.watchFail[name] > 0) { car.watchFail[name]--; return Promise.resolve({ iface, available: false, proxy: null, error: 'Error: test: the service is not up yet' }); }
                car.handlers[name] = h;
                return Promise.resolve({ iface, available: true, proxy: {}, error: null });
            },
            proxy: () => (car.proxyFail > 0 ? (car.proxyFail--, Promise.reject(new Error('test: no proxy yet'))) : Promise.resolve({})),
            on: (p, name, fn) => { car.listeners.push(fn); return Promise.resolve(); },
            onAvailable: (p, fn) => { fn(true); return Promise.resolve(); },
            call: (p, method, params) => {
                if (!car.transport) return Promise.resolve({ TasuErrorEnum: 'TRANSPORT_NOT_READY' });
                const did = (params.udsData[0] << 8) | params.udsData[1];
                car.sent.push({ t: clock.mono, ecu: params.targetAddress, did });
                if (car.foreign) { const f = car.foreign; car.foreign = null; setTimeout(() => car.reply(params.targetAddress, f), 20); }
                const r = car.egs && params.targetAddress === 0x18 ? car.egs(did) : null;
                if (r) setTimeout(() => car.reply(0x18, r), car.delay);
                return Promise.resolve({ TasuErrorEnum: 'NO_ERROR' });
            },
        };
        // raw values as the car sends them (null = the car's "no value")
        car.send = {
            rpm: (r) => car.handlers.CDS.statusEngineSpeed2({ actualValueRPMEngineCrankshaft: r === null ? 65535 : Math.round(r / 0.25) }),
            temps: (coolant, oil) => car.handlers.CDS.statusEngineTemperature({ temperatureEngineDrive: coolant === null ? 255 : coolant + 48, temperatureEngineOilDrive: oil === null ? 255 : oil + 48 }),
            speed: (s) => car.handlers.Vehicle2.statusCarSpeed2({ speedVehicleCentreOfGravity: Math.round(s / 0.015625) }),
            gearboxSignal: (c) => car.handlers.BasicDataSet.basicDataSet({ valueTemperatureTransmissionOil: c === null ? 255 : c + 48 }),
            condition: (n) => car.handlers.VehicleCondition.VehicleCondition({ statusConditionVehicle: n }),
        };
        car.temps = car.send.temps;
        /** A gearbox unit that answers 22 6000 with temp() and has no DA12 (a ZF 8HP as the kit read it). */
        car.zf = (temp) => (did) => (did === 0x6000 ? [0x62, 0x60, 0x00, Math.round(temp()) + 40] : [0x7F, 0x22, 0x31]);
        return car;
    }

    /* ---------- the app, started as the kit's preview starts it ---------- */
    const cars = [];                    // every car booted (a test looks through their logs at the end)
    const { headUnit } = require(path.resolve(__dirname, '..', '..', 'kit', 'tools', 'hu-stub.js'));
    async function boot(opts) {
        opts = opts || {};
        clock.timers = [];              // the drive before this one ends here
        // the app's own files afresh (the kit's hold nothing of a drive)
        Object.keys(require.cache).forEach((f) => { if (f.indexOf(JS + path.sep) === 0 && f.indexOf(JS + path.sep + 'kit' + path.sep) !== 0) delete require.cache[f]; });
        const car = makeCar();
        Object.assign(car, opts.car);
        cars.push(car);
        const log = {};
        ['info', 'warn', 'error', 'debug'].forEach((l) => { log[l] = function () { car.logs.push((l === 'info' ? '' : l.toUpperCase() + ' ') + Array.prototype.map.call(arguments, (x) => (x && x.stack) || String(x)).join(' ')); }; });
        const hu = headUnit(STAGE, { dataDir, fresh: true, sets: Object.assign({ demo: 'off' }, opts.sets), image: (name, cv) => { car.picture = cv; return Promise.resolve(); }, log });
        car.hu = hu; car.settings = hu.settings;
        hu.ctx.signals = car.signals;
        hu.ui.isVisible = (n) => n === 'MAIN' && car.screen;
        Object.assign(hu.ctx.widget, {
            active: () => car.widget, instances: () => (car.widget ? hu.WIDGETS : []),
            set: (id, cell, v) => { (car.cells[id] = car.cells[id] || {})[cell] = v; return Promise.resolve(); },
        });
        // the texts a frame draws on the page
        let texts = [];
        const canvas = hu.ctx.canvas;
        hu.ctx.canvas = (w, h) => {
            const cv = canvas(w, h);
            if (!cv.benched) { cv.benched = true; const text = cv.text; cv.text = function (s) { texts.push(String(s)); return text.apply(this, arguments); }; }
            return cv;
        };
        // ... and on the widget's picture, and whether it paints the logo
        const { ScaledCanvas } = require(path.join(JS, 'kit', 'canvas')), Logo = require(path.join(JS, 'logo'));
        if (!ScaledCanvas.prototype.benched) {
            const text = ScaledCanvas.prototype.text;
            ScaledCanvas.prototype.benched = true;
            ScaledCanvas.prototype.text = function (s) { if (ScaledCanvas.onText) ScaledCanvas.onText(String(s)); return text.apply(this, arguments); };
        }
        const paint = Logo.paint;
        Logo.paint = function () { car.logoPaints = (car.logoPaints || 0) + 1; return paint.apply(this, arguments); };
        // warm.js as the app holds it: the decision is asked through the app's own objects
        const Warm = require(path.join(JS, 'warm')), feed = Warm.WarmUp.prototype.feed;
        Warm.WarmUp.prototype.feed = function () { car.warm = this; return feed.apply(this, arguments); };
        const Source = require(path.join(JS, 'source')).Source, data = Source.prototype.data;
        Source.prototype.data = function () { car.src = this; return data.apply(this, arguments); };
        hu.start();
        await advance(20);
        car.status = () => car.warm.status(clock.mono);
        /** One frame of the app's screen: every text it drew, in order. */
        car.frame = async () => { texts = []; await hu.loopFn(); return texts.slice(); };
        /** The widget drawn once for both sizes: { cells: the small one's text cells, texts: the big picture's texts, logo: painted? } */
        car.drawWidget = async () => {
            const big = []; car.logoPaints = 0;
            ScaledCanvas.onText = (s) => big.push(s);
            for (const i of hu.WIDGETS) await hu.widgetFn(i);
            ScaledCanvas.onText = null;
            return { cells: Object.assign({}, car.cells[1]), texts: big, logo: car.logoPaints > 0 };
        };
        // the screen is drawn while it shows (every 2 s here; the kit's loop draws 5 to 60 frames a second, which
        // changes nothing in what the app decides). The widget is only drawn when a test looks at it (drawWidget).
        setInterval(() => { if (car.screen) Promise.resolve().then(() => hu.loopFn()).catch((e) => car.errors.push(e)); }, 2000);
        // a running engine's speed never stands still: the car sends it over and over (twice a second here), and the
        // road speed while moving
        let n = 0;
        setInterval(() => {
            n++;
            if (car.rpm !== null && car.handlers.CDS) car.send.rpm(car.rpm > 0 ? car.rpm + (n % 2) : 0);
            if (car.speed !== null && car.handlers.Vehicle2) car.send.speed(car.speed > 0 ? car.speed + (n % 2) * 0.05 : 0);
        }, 500);
        return car;
    }

    /** The requests sent to the gearbox unit since time t0 (forward-only clock). */
    const asked = (car, t0) => car.sent.filter((s) => s.ecu === 0x18 && s.t >= (t0 || 0)).length;
    /**
     * What went wrong unseen in any drive so far: a frame of the screen that threw, an error the app logged, an error
     * in its once-a-second decision (which the app guards and logs as a warning).
     */
    const mishaps = () => [].concat.apply([], cars.map((c) => c.errors.map((e) => 'frame: ' + ((e && e.stack) || e)).concat(c.logs.filter((l) => /^ERROR |^WARN tick |^WARN first render/.test(l)))));
    return { boot, advance, clock, asked, mishaps };
};
