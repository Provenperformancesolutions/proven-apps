'use strict';
/**
 * fakedrag.js - what the Proven Drag tests stand the BUILT app on instead of a car (test_drag_car.js).
 * The whole app runs: app.js with car.js, session.js, the logic modules, store.js and the screens, on the
 * kit's PC stand-in for the head unit (kit/tools/hu-stub.js) and on clocks the test moves by hand.
 * No car, no SDK. Nothing here is measured on a car: every rate, delay and member name is an assumption.
 *
 *   const bench = require('./fakedrag')('dist/pps_drag');
 *   const car = await bench.boot({ sets: { speedUnit: 'mph' }, notifier: false, missing: ['Powertrain'] });
 *   car.plan = (t) => 80;                    the car's TRUE speed in km/h at clock time t (ms)
 *   car.launch(truth, at, liftMs)            a run of dragsim.js's truth model starting at clock time `at`
 *   await bench.advance(5000);               5 s pass on both clocks: timers, the car's signals, the app's ticks
 *   car.session, car.store                   the app's own session (session.js) and saved file (store.js)
 *   await car.draw()                         one frame of the page shown: every text on it, with where it is
 *
 * THE CLOCKS: bench.clock.mono is the forward-only clock (process.hrtime), bench.clock.wall the wall clock
 * (Date.now). advance() moves both; a test may set clock.wall alone, as the head unit does when it sets
 * its clock from GPS. Timers run on the forward-only clock, as Node's own do. Between two timers every
 * waiting promise is run (through the real setImmediate), so an answer is stamped at its own moment.
 *
 * THE STAND-IN CAR (boot options, all optional)
 *   k            true speed = the car's speed signal x k (0.97: the car reads 3 % high). Default 1
 *   notifier     false: the speed is never notified            notifyMs 100, notifyDelay 30
 *   getter       false: every read of the speed getter fails   getterMs 25 (the value is read 8 ms in)
 *   limit        true: the head unit gives a read up when the time limit the app asked for is over (the answer
 *                the car sends later is lost, and until then that read is still in flight AT THE CAR). As
 *                shipped the limit is ignored, as before: nobody knows which the real binding does
 *   upAfter      { Vehicle2: 1500 }: that service is not up when the app subscribes and comes up so many ms later
 *                (the kit then reads every getter of it once itself, as kit/runtime/signals.js does)
 *   accel        'notify' (default) | 'silent' (not notified, its getter answers) | false (neither)
 *   accelNoise   false: the acceleration reading sits still to the last count while nothing changes. As
 *                shipped it flickers by one count (0.002 m/s2) from slot to slot, as a sensor's reading is
 *                taken to do, so it is notified all the time (every 50 ms, 20 ms on the way)
 *   missing      ['Powertrain', ...]: interfaces this head unit does not have (the kit's error for that)
 *   watchFail    { Vehicle2: 2 }: that many subscriptions fail first (the car's services not up yet)
 *   noEvent      the head unit takes no event subscription
 *   gpsNoise     0.004: the GPS receiver's speed flickers by that share either way from sentence to sentence
 *   slope        percent the car stands on, + = nose up (the acceleration sensor reads g x slope)
 *   climb        metres of height gained per metre driven
 * car.service('Vehicle2', false | true): the car's service goes away / comes back (the kit's "available";
 *   coming back, the kit reads every getter once itself: that read is counted with the app's in car.mostInFlight)
 * car.logs: every line the app logged; car.logAt: the clock time each was WRITTEN at (the kit's log writes
 *   a line to the file the moment it is logged)
 * While running: car.plan, car.spin = { from, to, peak }, car.wheelLow = { from, to, by }, car.nmeaMode
 *   ('ok' | 'bad' checksums | 'void' status V | 'few' satellites | 'junk'), car.gpsMode ('ok' | 'none'),
 *   car.speedFault ('none': raw 65535), car.zeroNext = { notified: true, polled: true } (a lone 0),
 *   car.on.<source> = false to silence one source, car.send.<source>(value) to send anything at all.
 *
 * The car drives east along a parallel at latitude 67.9123, from longitude 144.9631. Those figures are
 * what the tests look for in the log and the saved file (they must never be there).
 *
 * WHAT LEAVES THE APP is recorded in car.calls: { type: 'watch' | 'getValue' | 'on' | ... }. Anything
 * that is not a subscription, a getter read or an event subscription is in car.forbidden.
 */
const fs = require('fs'), os = require('os'), path = require('path');

const RAW_KMH = 0.015625, G0 = 9.80665, KNOT = 1.852;
const LAT0 = 67.9123, LON0 = 144.9631, ALT0 = 512;
// WGS84: metres per degree of longitude along the parallel at lat
const WGS_A = 6378137, WGS_E2 = 0.00669437999014;
const metresPerDegLon = (lat) => { const p = lat * Math.PI / 180, s = Math.sin(p); return Math.PI / 180 * WGS_A * Math.cos(p) / Math.sqrt(1 - WGS_E2 * s * s); };
const IFACE = {
    Vehicle2: 'de.bmw.infotainment.vehicle.Vehicle2', CDS2: 'de.bmw.infotainment.vehicle.CDS2', Powertrain: 'de.bmw.powertrain.Powertrain',
    SatellitePositioning: 'de.bmw.infotainment.SatellitePositioning', GPSData: 'de.bmw.infotainment.GPSData',
    Positioning: 'de.bmw.infotainment.navigation.positioning.Positioning', VehicleModel: 'de.bmw.chassis.VehicleModel',
};
const OPTIONAL = ['Powertrain', 'SatellitePositioning', 'GPSData', 'Positioning', 'VehicleModel'];

/** An NMEA sentence with its checksum (bad: a wrong one). */
function sentence(body, bad) {
    let sum = 0;
    for (let i = 0; i < body.length; i++) sum ^= body.charCodeAt(i);
    if (bad) sum ^= 0x5a;
    return '$' + body + '*' + sum.toString(16).toUpperCase().padStart(2, '0');
}
/** Degrees -> NMEA ddmm.mmmm (width: digits of the degrees). */
const dm = (deg, width) => { const d = Math.floor(Math.abs(deg)), m = (Math.abs(deg) - d) * 60; return String(d).padStart(width, '0') + m.toFixed(4).padStart(7, '0'); };

module.exports = function (stageArg) {
    const STAGE = path.resolve(stageArg), JS = path.join(STAGE, 'source', 'javascript');
    const real = { setImmediate };
    const clock = { mono: 100000, wall: Date.UTC(2026, 10, 23, 9, 0, 0), timers: [], id: 1 };
    const dirs = [];
    const newDir = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pps-drag-test-')); dirs.push(d); return d; };
    process.on('exit', () => dirs.forEach((d) => { try { fs.readdirSync(d).forEach((f) => fs.unlinkSync(path.join(d, f))); fs.rmdirSync(d); } catch (e) { /* gone */ } }));

    /* ---------- the clocks and the timers ---------- */
    const timer = (fn, ms, every, args) => { const t = { id: clock.id++, at: clock.mono + Math.max(0, Number(ms) || 0), every, fn: () => fn.apply(null, args) }; clock.timers.push(t); return t.id; };
    global.setTimeout = (fn, ms, ...args) => timer(fn, ms, 0, args);
    global.setInterval = (fn, ms, ...args) => timer(fn, ms, Math.max(1, Number(ms) || 1), args);
    global.setImmediate = (fn, ...args) => timer(fn, 0, 0, args);
    global.clearTimeout = global.clearInterval = global.clearImmediate = (id) => { clock.timers = clock.timers.filter((t) => t.id !== id); };
    Date.now = () => clock.wall;
    process.hrtime = () => [Math.floor(clock.mono / 1000), Math.round((clock.mono % 1000) * 1e6)];
    const settle = () => new Promise((resolve) => real.setImmediate(resolve));
    /** ms pass on both clocks: the timers that fall due run in turn, each at its own time. */
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

    /* ---------- every text a frame draws is noted (as test_screens.js does) ---------- */
    const rec = require(path.join(JS, 'kit', 'record')), fonts = require(path.join(JS, 'kit', 'fonts'));
    const R = rec.Recorder, text0 = R.prototype.text, blit0 = R.prototype.blit, reset0 = R.prototype.reset, make0 = rec.makeLayer;
    R.prototype.text = function (str, x, y, size, c, opts) {
        const w = text0.apply(this, arguments), al = (opts && opts.align) || 'left';
        (this._texts || (this._texts = [])).push({ s: String(str), x0: al === 'center' ? x - w / 2 : al === 'right' ? x - w : x, y, size, w, font: (opts && opts.font) || 'label' });
        return w;
    };
    R.prototype.reset = function () { this._texts = []; return reset0.apply(this, arguments); };
    R.prototype.blit = function (L, x, y) {
        (L._texts || []).forEach((t) => (this._texts || (this._texts = [])).push(Object.assign({}, t, { x0: t.x0 + Math.round(x), y: t.y + Math.round(y), layer: true })));
        return blit0.apply(this, arguments);
    };
    rec.makeLayer = function (w, h, draw, ts) { let texts = []; const L = make0(w, h, (r) => { draw(r); texts = r._texts || []; }, ts); L._texts = texts; return L; };
    // (and every box a text can stand in: a panel, a button, the state banner. textfit.js, for the rule that no text
    // crosses the edge of its box)
    require('./textfit').watch(rec, { texts: false });

    /* ---------- the stand-in car ---------- */
    function makeCar(o) {
        const car = {
            k: o.k || 1, plan: () => 0, slope: o.slope || 0, climb: o.climb || 0,
            getterMs: o.getterMs == null ? 25 : o.getterMs, notifyMs: o.notifyMs || 100, notifyDelay: o.notifyDelay == null ? 30 : o.notifyDelay,
            on: { notifier: o.notifier !== false, getter: o.getter !== false, accel: o.accel === undefined ? 'notify' : o.accel, wheels: true, travel: true, nmea: true, gps: true, nav: true, lane: true },
            nmeaMode: 'ok', gpsMode: 'ok', speedFault: null, zeroNext: {}, spin: null, wheelLow: null,
            missing: {}, watchFail: Object.assign({}, o.watchFail),
            handlers: {}, events: {}, calls: [], forbidden: [], logs: [], logAt: [], errors: [], barText: {}, subs: {},
            inFlight: {}, mostInFlight: 0, reads: 0, kitReads: 0, limit: !!o.limit, upAfter: Object.assign({}, o.upAfter), positions: { latMin: LAT0, latMax: LAT0, lonMin: LON0, lonMax: LON0, n: 0 },
            screen: true, mode: 'pc', picture: null,
        };
        (o.missing || []).forEach((n) => { car.missing[n] = true; });
        // the true motion: speed from the plan, distance summed up in 5 ms steps as it is asked for
        let odoT = clock.mono, odo = 0;
        car.vTrue = (t) => Math.max(0, Number(car.plan(t)) || 0);
        car.vRep = (t) => car.vTrue(t) / car.k;
        car.odo = (t) => {
            while (odoT < t) { const h = Math.min(5, t - odoT); odo += (car.vTrue(odoT) + car.vTrue(odoT + h)) / 2 / 3.6 * h / 1000; odoT += h; }
            return odo;
        };
        car.accelNow = (t) => (car.vTrue(t + 5) - car.vTrue(t - 5)) / 3.6 / 0.01 + G0 * car.slope / 100;
        car.pos = (t) => {
            const lon = LON0 + car.odo(t) / metresPerDegLon(LAT0), P = car.positions;
            P.lonMin = Math.min(P.lonMin, lon); P.lonMax = Math.max(P.lonMax, lon); P.n++;
            return { lat: LAT0, lon, alt: ALT0 + car.climb * car.odo(t) };
        };
        /**
         * A run of the truth model (dragsim.js) from clock time `at`. The driver lifts when the model ends, or
         * `liftMs` after the start, and brakes to a stop at `brake` m/s2 (8). Returns the clock time the car stands again.
         */
        car.launch = (truth, at, liftMs, brake) => {
            const end = Math.min(truth.tEnd * 1000, liftMs || Infinity), vEnd = truth.vAt(end / 1000) * 3.6, b = (brake || 8) * 3.6 / 1000;
            car.plan = (t) => (t < at ? 0 : t - at <= end ? truth.vAt((t - at) / 1000) * 3.6 : Math.max(0, vEnd - b * (t - at - end)));
            return at + end + vEnd / b;
        };
        /** From now: the speed moves to kmh at `rate` m/s2 and stays there. */
        car.goto = (kmh, rate) => {
            const t0 = clock.mono, v0 = car.vTrue(t0), r = (rate || 3) * 3.6 / 1000 * (kmh >= v0 ? 1 : -1);
            car.plan = (t) => (t <= t0 ? v0 : r > 0 ? Math.min(kmh, v0 + r * (t - t0)) : Math.max(kmh, v0 + r * (t - t0)));
        };

        /* what the car sends */
        const raws = {
            speed: (t, series) => {
                if (car.zeroNext[series]) { car.zeroNext[series] = false; return 0; }
                if (car.speedFault === 'none') return 65535;
                return Math.max(0, Math.min(65534, Math.round(car.vRep(t) / RAW_KMH)));
            },
            accel: (t) => Math.round((car.accelNow(t) + 65) / 0.002),
        };
        car.raws = raws;
        const deliver = (name, field, value) => { const h = car.handlers[name]; if (h && h[field]) h[field](value); };
        const event = (name, ev, value) => { const fn = car.events[name + '.' + ev]; if (fn) fn(value); };
        const wheelRaw = (kmh) => Math.max(0, Math.min(65533, Math.round(kmh * 16)));
        let alive = 0, noiseSeed = 20261123;
        car.send = {
            speed: (raw) => deliver('Vehicle2', 'statusCarSpeed2', { speedVehicleCentreOfGravity: raw }),
            accel: (raw) => deliver('CDS2', 'statusLongitudinalAccelerationMassCenter', { longitudinalAccelerationCentreOfGravity: raw }),
            wheels: (v) => deliver('Powertrain', 'ActualValueRPMWheel', v),
            travel: (v) => { deliver('Vehicle2', 'statusWheeltravel', v); deliver('Vehicle2', 'statusWheeltravelRear', v); },
            nmea: (v) => event('SatellitePositioning', 'updatePosition', v),
            gps: (v) => deliver('GPSData', 'GPSPositionCAN', v),
            gpsExt: (v) => deliver('GPSData', 'GPSPositionExtendedCAN', v),
            nav: (v) => deliver('Positioning', 'currentLocation', v),
            lane: (v) => deliver('VehicleModel', 'LaneSlope', v),
        };
        const emit = {
            notifier: (() => {
                let sent = null;
                return () => {
                    if (!car.on.notifier) return;
                    const raw = raws.speed(clock.mono, 'notified');
                    if (raw === sent) return;
                    sent = raw;
                    setTimeout(() => car.send.speed(raw), car.notifyDelay);
                };
            })(),
            accel: (() => {
                let sent = null, n = 0;
                return () => {
                    if (car.on.accel !== 'notify') return;
                    const raw = raws.accel(clock.mono) + (o.accelNoise === false ? 0 : n++ % 2);
                    if (raw === sent) return;
                    sent = raw;
                    setTimeout(() => car.send.accel(raw), 20);
                };
            })(),
            wheels: () => {
                if (!car.on.wheels) return;
                const t = clock.mono, v = car.vRep(t);
                const low = car.wheelLow && t >= car.wheelLow.from && t < car.wheelLow.to ? 1 - car.wheelLow.by : 1;
                const sp = car.spin && t >= car.spin.from && t < car.spin.to ? 1 + car.spin.peak * (1 - (t - car.spin.from) / (car.spin.to - car.spin.from)) : 1;
                car.send.wheels({
                    actualValueRPMWheelFLH: wheelRaw(v * low), actualValueRPMwheelFRH: wheelRaw(v * low * 1.002),
                    actualValueRPMWheelRLH: wheelRaw(v * low * sp * 0.998), actualValueRPMWheelRRH: wheelRaw(v * low * sp),
                    qualifierActualValueRPMWheelFLH: 1, qualifierActualValueRPMWheelRRH: 1, CRCActualValueRPMWheel: 77, aliveCounterActualValueRPMWheel: alive++ % 15, dummyActualValueRPMWheel: 0,
                });
            },
            travel: () => {
                if (!car.on.travel) return;
                const n = Math.floor(car.odo(clock.mono) * 10) & 0xffff;
                deliver('Vehicle2', 'statusWheeltravel', { mileageWheelFLH: n, mileageWheelFRH: (n + 1) & 0xffff, signalAgeMileageWheelFrontSide: 3 });
                deliver('Vehicle2', 'statusWheeltravelRear', { mileageWheelRLH: (n + 2) & 0xffff, mileageWheelRRH: (n + 3) & 0xffff, signalAgeMileageWheelRearSide: 4 });
            },
            nmea: () => {
                if (!car.on.nmea) return;
                const t = clock.mono, p = car.pos(t), m = car.nmeaMode;
                noiseSeed = (noiseSeed * 1103515245 + 12345) % 2147483648;
                const wob = o.gpsNoise ? 1 + o.gpsNoise * (2 * noiseSeed / 2147483648 - 1) : 1;
                if (m === 'junk') { car.send.nmea({ nmeaString: '$GPRMC,,,,*00\r\nnot a sentence $ $$*ZZ\r\n$GPGGA', delayCounter: 1 }); return; }
                const hms = new Date(clock.wall).toISOString().slice(11, 19).replace(/:/g, '') + '.00';
                const rmc = 'GPRMC,' + hms + ',' + (m === 'void' ? 'V' : 'A') + ',' + dm(p.lat, 2) + ',N,' + dm(p.lon, 3) + ',E,' + (car.vTrue(t) * wob / KNOT).toFixed(3) + ',90.0,231126,,,A';
                const gga = 'GPGGA,' + hms + ',' + dm(p.lat, 2) + ',N,' + dm(p.lon, 3) + ',E,1,' + (m === 'few' ? '04' : '09') + ',0.9,' + p.alt.toFixed(1) + ',M,47.0,M,,';
                const gsa = 'GPGSA,A,3,04,05,,09,12,,,24,,,,,2.5,1.3,2.1';
                car.send.nmea({ nmeaString: [rmc, gga, gsa].map((b) => sentence(b, m === 'bad')).join('\r\n') + '\r\n', delayCounter: 2 });
            },
            gps: () => {
                if (!car.on.gps) return;
                const p = car.pos(clock.mono), none = car.gpsMode === 'none';
                car.send.gps({ positionGPSLatitudeCAN: none ? 4294967295 : Math.round(p.lat * 3600000) + 2147483648, positionGPSLongitudeCAN: none ? 4294967295 : Math.round(p.lon * 3600000) + 2147483648 });
                car.send.gpsExt({ statusHeightGPSCAN: none ? 65535 : Math.round(p.alt) + 32768, speedGPSCAN: Math.round(car.vTrue(clock.mono) * 100), headingGPSCAN: 9000 });
            },
            nav: () => {
                if (!car.on.nav) return;
                const p = car.pos(clock.mono);
                car.send.nav({ coordinatesValid: true, latitude: p.lat, longitude: p.lon, heading: 90 });
            },
            lane: (() => {
                let sent = null;
                return () => {
                    if (!car.on.lane) return;
                    const count = Math.round(1280 - car.slope * 10), raw = ((count >> 4) & 255) | ((count & 15) << 8);
                    if (raw === sent) return;
                    sent = raw;
                    car.send.lane({ laneSlope: raw, qualifierLaneSlope: 1 });
                };
            })(),
        };
        /** Start the car's own senders: [period ms, phase ms]. */
        car.start = () => {
            const every = (ms, phase, fn) => setTimeout(() => { fn(); setInterval(fn, ms); }, phase);
            every(car.notifyMs, 37, emit.notifier); every(50, 13, emit.accel); every(50, 21, emit.wheels); every(200, 55, emit.travel);
            every(1000, 400, emit.nmea); every(1000, 650, emit.gps); every(333, 111, emit.nav); every(500, 77, emit.lane);
        };

        /* what the app may do with the car, and what it must not */
        const note = (c) => { car.calls.push(c); if (['watch', 'getValue', 'on'].indexOf(c.type) < 0) car.forbidden.push(c); };
        /** One read of a getter in flight at the car (the app's or the kit's own): counted per field, answered after getterMs. */
        const carRead = (name, field, series) => {
            const speed = name === 'Vehicle2' && field === 'statusCarSpeed2';
            car.reads++; car.inFlight[field] = (car.inFlight[field] || 0) + 1; car.mostInFlight = Math.max(car.mostInFlight, car.inFlight[field]);
            const at = clock.mono + 8;
            return new Promise((res) => {
                if (!isFinite(car.getterMs)) return;                // never answered
                setTimeout(() => { car.inFlight[field]--; res(speed ? { speedVehicleCentreOfGravity: raws.speed(at, series) } : { longitudinalAccelerationCentreOfGravity: raws.accel(at) }); }, car.getterMs);
            });
        };
        /** As the kit's watch() does when a service is up or comes up: one read of each getter, handed to the field's handler. */
        const kitRead = (name) => {
            const field = name === 'Vehicle2' ? 'statusCarSpeed2' : name === 'CDS2' ? 'statusLongitudinalAccelerationMassCenter' : null;
            if (!field || (name === 'Vehicle2' ? !car.on.getter : !car.on.accel)) return;
            car.kitReads++;
            carRead(name, field, 'kit').then((v) => deliver(name, field, v));
        };
        /** The car's service goes away (false) or comes back (true), as the kit's "available" says it. */
        car.service = (name, up) => {
            const sub = car.subs[name];
            if (!sub || sub.available === !!up) return;
            sub.available = !!up;
            if (up) kitRead(name);
        };
        const proxyOf = (name) => ({
            name,
            getValue: (field, limit) => {
                note({ type: 'getValue', iface: name, field, t: clock.mono, limit });
                const speed = name === 'Vehicle2' && field === 'statusCarSpeed2', accel = name === 'CDS2' && field === 'statusLongitudinalAccelerationMassCenter';
                if ((speed && !car.on.getter) || (accel && !car.on.accel) || (!speed && !accel)) return new Promise((res, rej) => setTimeout(() => rej(new Error('test: no getter')), 5));
                // a service that is down answers nothing; the read fails when its time limit is over
                if (car.subs[name] && car.subs[name].available === false) return new Promise((res, rej) => setTimeout(() => rej(new Error('test: service down')), limit > 0 ? limit : 1000));
                // (reads of ONE field must never overlap: counted per field)
                const answer = carRead(name, field, 'polled');
                if (!car.limit || !(limit > 0)) return answer;
                // the head unit gives up at the limit; the car's answer, if it comes later, is lost
                return new Promise((res, rej) => { setTimeout(() => rej(new Error('test: time limit')), limit); answer.then(res); });
            },
            setValue: (field) => { note({ type: 'setValue', iface: name, field }); return Promise.reject(new Error('test: read only')); },
            callMethod: (method) => { note({ type: 'callMethod', iface: name, method }); return Promise.reject(new Error('test: read only')); },
            subscribe: (x) => { note({ type: 'subscribe', iface: name, field: x && x.name }); return Promise.reject(new Error('test: subscribe through the kit')); },
        });
        car.signals = {
            watch: (iface, inst, handlers) => {
                const name = Object.keys(IFACE).filter((n) => IFACE[n] === iface)[0] || iface;
                note({ type: 'watch', iface: name, instance: String(inst), fields: Object.keys(handlers || {}) });
                if (car.missing[name]) return Promise.resolve({ iface, available: false, proxy: null, error: 'Error: no SOME/IP config for ' + iface + ' (add it to app.json "signals")' });
                if (car.watchFail[name] > 0) { car.watchFail[name]--; return Promise.resolve({ iface, available: false, proxy: null, error: 'Error: test: the service is not up yet' }); }
                car.handlers[name] = handlers || {};
                const late = car.upAfter[name] > 0;
                const sub = { iface, available: !late, proxy: proxyOf(name), error: null };
                car.subs[name] = sub;
                // as the kit's watch(): one getter read of its own when the car's service is up (or comes up), handed to the same handler
                if (late) setTimeout(() => car.service(name, true), car.upAfter[name]); else kitRead(name);
                return Promise.resolve(sub);
            },
            on: (p, ev, fn) => {
                note({ type: 'on', iface: p && p.name, event: ev });
                if (o.noEvent) return Promise.reject(new Error('test: no events on this head unit'));
                car.events[(p && p.name) + '.' + ev] = fn;
                return Promise.resolve();
            },
            proxy: (iface) => { note({ type: 'proxy', iface }); return Promise.reject(new Error('test: read only')); },
            call: (p, method) => { note({ type: 'call', method }); return Promise.reject(new Error('test: read only')); },
            set: (p, field) => { note({ type: 'set', field }); return Promise.reject(new Error('test: read only')); },
            onAvailable: () => { note({ type: 'onAvailable' }); return Promise.resolve(); },
            hasNative: () => false,
        };
        return car;
    }

    /* ---------- the app, started as the kit's preview starts it ---------- */
    const cars = [];
    const { headUnit } = require(path.resolve(__dirname, '..', '..', 'kit', 'tools', 'hu-stub.js'));
    /** opts: the car's (see the top), and sets { setting: value }, dataDir (to start again on a saved file), screen. */
    async function boot(opts) {
        opts = opts || {};
        clock.timers = [];              // the drive before this one ends here
        clock.mono = Math.ceil(clock.mono);     // (every start on a whole millisecond: two drives done alike are alike to the last digit)
        Object.keys(require.cache).forEach((f) => { if (f.indexOf(JS + path.sep) === 0 && f.indexOf(JS + path.sep + 'kit' + path.sep) !== 0) delete require.cache[f]; });
        const car = makeCar(opts);
        cars.push(car);
        if (opts.screen === false) car.screen = false;
        const log = {};
        ['info', 'warn', 'error', 'debug'].forEach((l) => { log[l] = function () { car.logAt.push(clock.mono); car.logs.push((l === 'info' ? '' : l.toUpperCase() + ' ') + Array.prototype.map.call(arguments, (x) => (x && x.stack) || String(x)).join(' ')); }; });
        car.dataDir = opts.dataDir || newDir();
        const quiet = console.log; console.log = () => {};          // (the stand-in head unit says which screen it opens)
        const hu = headUnit(STAGE, { dataDir: car.dataDir, fresh: true, sets: Object.assign({ demo: 'off' }, opts.sets), image: (name, cv) => { car.picture = cv; return Promise.resolve(); }, log });
        car.hu = hu; car.settings = hu.settings;
        hu.ctx.signals = car.signals;
        hu.ui.isVisible = (n) => n === 'MAIN' && car.screen;
        hu.ui.text = (n, t) => { car.barText[n] = t; return Promise.resolve(); };
        // the frame surface: the PC's, or as where the kit runs the screen itself on iDrive 7 (text 1.165 times the size,
        // 49 px of room under the page) and iDrive 8 (1.419 times, no room): kit/runtime/display.js, not measured on a car
        let frame = null, wantPng = false;
        const canvas = hu.ctx.canvas, image = hu.ui.image, own = {};
        hu.ctx.canvas = (w, h) => {
            if (car.mode === 'pc') { frame = canvas(w, h); return frame; }
            const r = own[car.mode] || (own[car.mode] = new R(w, h, { textScale: car.mode === 'id7' ? 1.165 : 1.419 }));
            r.reset(); r.tabRects = null; r.chrome = { tabs: null }; r.place = null; r.own = true; r.extra = car.mode === 'id7' ? 49 : 0;
            frame = r;
            return r;
        };
        hu.ui.image = (name, cv) => (wantPng && car.mode === 'pc' ? image(name, cv) : Promise.resolve());
        // the app's own session (session.js), as the app holds it
        const S = require(path.join(JS, 'session')).Session, tick = S.prototype.tick;
        S.prototype.tick = function () { car.session = this; car.store = this.store; return tick.apply(this, arguments); };
        hu.start();
        car.start();
        await advance(60);
        console.log = quiet;
        /** Open tab i (0 Run, 1 Timeslip, 2 Best, 3 Signals). */
        car.page = (i) => hu.display.onTab(i);
        /** Press a button of the HMI's bar. */
        car.press = (id) => hu.handlers[id]({});
        /** Draw one frame of the page shown: the texts on it ({ s, x0, y, size, w, font }); car.boxes: the boxes on it. */
        car.draw = async () => { await hu.loopFn(); car.targets = (frame && frame.targets) || []; car.boxes = ((frame && frame._boxes) || []).slice(); return ((frame && frame._texts) || []).slice(); };
        /** Press a button drawn on the page (where the kit runs the screen: modes id7, id8), by its key. */
        car.tap = (key) => { const t = car.targets.filter((x) => x.key === key)[0]; if (!t) throw new Error('no button "' + key + '" on the page'); return t.run(); };
        /** Save a picture of the page shown (the kit's software renderer, PC size). */
        car.save = async (dir, name) => {
            const mode = car.mode;
            car.mode = 'pc'; wantPng = true; car.picture = null;
            await hu.loopFn();
            wantPng = false; car.mode = mode;
            if (car.picture) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, name + '.png'), Buffer.isBuffer(car.picture) ? car.picture : car.picture.png()); }
        };
        /**
         * Save a picture of the page as last drawn for iDrive 7 or iDrive 8 (car.mode), at that screen's own pixel
         * size: 1.165 or 1.419 times the PC's, each glyph from the atlas that screen takes (textfit.js picture).
         */
        car.saveSized = (dir, name) => {
            if (car.mode === 'pc' || !frame) return;
            const png = require('./textfit').picture(rec, require(path.join(JS, 'kit', 'canvas')), frame, car.mode === 'id7' ? 1.165 : 1.419).png();
            fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, name + '.png'), png);
        };
        car.view = () => car.session.view(clock.mono);
        /** The lines of the log that match re (a line the app held back says so at its end: that note is taken off here). */
        car.logged = (re) => car.logs.map((l) => l.replace(/ \(logged \d+\.\d s later\)$/, '')).filter((l) => re.test(l));
        /** How many lines were written to the log between two clock times. */
        car.written = (from, to) => car.logAt.filter((t) => t >= from && t < to).length;
        return car;
    }

    /** What went wrong unseen in any drive so far: an error or a guarded failure the app logged. */
    const mishaps = () => [].concat.apply([], cars.map((c) => c.errors.map((e) => 'frame: ' + ((e && e.stack) || e)).concat(c.logs.filter((l) => /^ERROR |^WARN tick |^WARN first render|\(\d+x\): /.test(l)))));
    /** Everything any car's app did with its signals, and what of it was not allowed. */
    const allCalls = () => [].concat.apply([], cars.map((c) => c.calls));
    const allForbidden = () => [].concat.apply([], cars.map((c) => c.forbidden));
    return { boot, advance, clock, mishaps, allCalls, allForbidden, cars, fonts, JS, IFACE, OPTIONAL, LAT0, LON0, metresPerDegLon };
};
