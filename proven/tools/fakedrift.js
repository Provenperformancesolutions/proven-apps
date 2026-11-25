'use strict';
/**
 * fakedrift.js - what the Proven Drift tests stand the BUILT app on instead of a car (test_drift_car.js), after
 * fakedrag.js. The whole app runs: app.js with car.js, session.js, the engine, store.js and the screens, on the
 * kit's PC stand-in for the head unit (kit/tools/hu-stub.js) and on clocks the test moves by hand.
 * No car, no SDK. Nothing here is measured on a car: every rate, delay, raw unit and value is an assumption. The
 * interface, field and member names are those of one head unit's interface catalogue.
 *
 *   const bench = require('./fakedrift')('dist/pps_drift');
 *   const car = await bench.boot({ sets: { speedUnit: 'mph' }, missing: ['Powertrain'], dataDir });
 *   await car.play('held');                  drive one of driftsim.js's scenes, from the state the car is in now
 *   await car.run(car.script().to(4, { v: 60 }).hold(3));     or a script of the test's own (driftsim.js, Script)
 *   await bench.advance(5000);               5 s pass on both clocks: timers, the car's signals, the app's ticks
 *   await bench.stall(400);                  the app is held up for 0.4 s: the clocks go on, nothing runs meanwhile
 *   car.session, car.store, car.side         the app's own session (session.js), saved file (store.js), car side (car.js)
 *   await car.draw()                         one frame of the page shown: every text on it, with where it is
 *
 * THE CLOCKS: bench.clock.mono is the forward-only clock (process.hrtime), bench.clock.wall the wall clock
 * (Date.now). advance() moves both; a test may set clock.wall alone, as the head unit does when it sets its clock
 * from GPS. Timers run on the forward-only clock. Between two timers every waiting promise is run.
 *
 * THE STAND-IN CAR is driftsim.js's made-up car: a scripted true motion, and what each sensor would say of it by
 * exact kinematics. Its true drift angle is known at every moment (car.truthNow()). Its sources, as the app gets
 * them (boot options change them):
 *   speed          notified on change every 100 ms (30 ms on the way); its getter answers after 25 ms
 *   CDS2           sideways and forward acceleration and the yaw rate, each notified on change every 20 ms. As
 *                  shipped each flickers by one count from slot to slot, as a sensor's reading is taken to do, so
 *                  it is notified all the time. Their getters answer after 25 ms
 *   chassis yaw    the same yaw rate in OTHER raw units (another scale and zero, the sign turned round), every 20 ms
 *   steering       four sources: the front wheels' angle from the chassis (every 20 ms) and from XView (every
 *                  50 ms), the steering wheel's angle (14.6 times that, in other raw units) from both
 *   pedal, wheels  every 50 ms;  handbrake, DSC button: on change
 *   study only     the car's own motion estimate and BMW's drift analyser: made-up numbers
 *   GPS sentences  once a second: RMC with a position, the TRUE speed and a course, GGA, GSA
 * Boot options: k (the speed the car reports = true speed x k), notifier / getter (false: that way of the speed is
 *   not there), getterMs, cds2 ('notify' | 'silent': never notified, the getters answer | 'slow': notified 4
 *   times a second), flicker (false: the CDS2 values sit still to the last count while nothing changes),
 *   yawCds2 ('none': CDS2's yaw rate is the car's "no value", 65535, all the time), hbNumbers (the handbrake as
 *   numbers, not names), missing ([interface names] this head unit does not have), watchFail ({ Vehicle2: 2 }: that
 *   many subscriptions fail first), noEvent, upAfter ({ CDS2: 1500 }), faults (driftsim's sensor faults), limit,
 *   model (what differs from driftsim's car "a", e.g. { speedFrom: 'u' }: the speed it reports is the speed along
 *   its own length).
 * While running: car.on.<source> = false silences one source (car.on.yaw = false: CDS2's yaw rate alone, its getter
 *   too; car.on.cds2 = 'off': all of CDS2); car.send.<source>(value) sends anything at all;
 *   car.dsc; car.nmeaMode ('ok' | 'bad' checksums | 'void' | 'knots' whole knots | 'junk').
 *
 * The car drives east along a parallel at latitude 67.9123, from longitude 144.9631, and its sentences say course
 * 283.74. Those figures are what the tests look for in the log and the saved file (they must never be there).
 *
 * WHAT LEAVES THE APP is recorded in car.calls: { type: 'watch' | 'getValue' | 'on' | ... }. Anything that is not
 * a subscription, a getter read or an event subscription is in car.forbidden.
 */
const fs = require('fs'), os = require('os'), path = require('path');
const sim = require('./driftsim');

const RAW_KMH = 0.015625, KNOT = 1.852, KMH = 3.6, DEG = Math.PI / 180;
const LAT0 = 67.9123, LON0 = 144.9631, ALT0 = 512, COURSE = '283.74';
// WGS84: metres per degree of longitude along the parallel at lat
const WGS_A = 6378137, WGS_E2 = 0.00669437999014;
const metresPerDegLon = (lat) => { const p = lat * Math.PI / 180, s = Math.sin(p); return Math.PI / 180 * WGS_A * Math.cos(p) / Math.sqrt(1 - WGS_E2 * s * s); };
const IFACE = {
    Vehicle2: 'de.bmw.infotainment.vehicle.Vehicle2', CDS2: 'de.bmw.infotainment.vehicle.CDS2', SpeedAcceleration: 'de.bmw.chassis.SpeedAcceleration',
    SteeringAngle: 'de.bmw.chassis.SteeringAngle', XView: 'de.bmw.infotainment.drivingexcitement.XView', AcceleratorPedal: 'de.bmw.powertrain.AcceleratorPedal',
    Powertrain: 'de.bmw.powertrain.Powertrain', CDS: 'de.bmw.infotainment.vehicle.CDS', FES: 'de.bmw.infotainment.drivingexcitement.FES',
    DrivingVector: 'de.bmw.chassis.DrivingVector', MDrive: 'de.bmw.infotainment.misc.MDrive', SatellitePositioning: 'de.bmw.infotainment.SatellitePositioning',
};
const OPTIONAL = ['SpeedAcceleration', 'SteeringAngle', 'XView', 'AcceleratorPedal', 'Powertrain', 'CDS', 'FES', 'DrivingVector', 'MDrive', 'SatellitePositioning'];
/** The fields of each interface that have a getter on the stand-in head unit (the kit reads each once when the service comes up). */
const GETTERS = {
    Vehicle2: ['statusCarSpeed2'], CDS2: ['statusLateralAccelerationMassCenter', 'statusLongitudinalAccelerationMassCenter', 'statusYawVelocityVehicle'],
    XView: ['statusFrontAxleSteeringAngle', 'statusSteeringAngleDriver'], CDS: ['statusHandBrake'], FES: ['statusDSCSwitchHMI'], MDrive: ['statusDriftLast', 'statusDriftBest'],
};
/** The other raw units the same quantities come in from the second sources (the app is told none of them). */
const CHASSIS_YAW = { yawStep: 0.0125, yawZero: 32000, yawSign: -1 };
const STEERING_WHEEL = { steerStep: 0.04375, steerZero: 32767, steerSign: -1, steerRatio: 14.6 };

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
    const clock = { mono: 100000, wall: Date.UTC(2026, 10, 24, 9, 0, 0), timers: [], id: 1 };
    const dirs = [];
    const newDir = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pps-drift-test-')); dirs.push(d); return d; };
    process.on('exit', () => dirs.forEach((d) => { try { fs.chmodSync(d, 0o700); fs.readdirSync(d).forEach((f) => fs.unlinkSync(path.join(d, f))); fs.rmdirSync(d); } catch (e) { /* gone */ } }));

    /* ---------- the clocks and the timers ---------- */
    const timer = (fn, ms, every, args) => { const t = { id: clock.id++, at: clock.mono + Math.max(0, Number(ms) || 0), every, fn: () => fn.apply(null, args) }; clock.timers.push(t); return t.id; };
    global.setTimeout = (fn, ms, ...args) => timer(fn, ms, 0, args);
    global.setInterval = (fn, ms, ...args) => timer(fn, ms, Math.max(1, Number(ms) || 1), args);
    global.setImmediate = (fn, ...args) => timer(fn, 0, 0, args);
    global.clearTimeout = global.clearInterval = global.clearImmediate = (id) => { clock.timers = clock.timers.filter((t) => t.id !== id); };
    Date.now = () => clock.wall;
    process.hrtime = () => [Math.floor(clock.mono / 1000), Math.round((clock.mono % 1000) * 1e6)];
    const settle = () => new Promise((resolve) => real.setImmediate(resolve));
    /** ms pass on both clocks: the timers that fall due run in turn, each at its own time. (The clock never goes back.) */
    async function advance(ms) {
        const end = clock.mono + Math.max(0, Number(ms) || 0);
        await settle();
        for (;;) {
            let due = null;
            for (const t of clock.timers) if (t.at <= end && (!due || t.at < due.at || (t.at === due.at && t.id < due.id))) due = t;
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

    /**
     * The app is held up for ms (a file write, a frame drawn in software, memory being tidied): the clocks go on,
     * nothing runs. When it is over, every timer that fell due meanwhile runs once, at once, as after a blocked
     * event loop, so what the car sent meanwhile is stamped late and the app's own tick comes late.
     */
    async function stall(ms) {
        await settle();
        clock.mono += ms; clock.wall += ms;
        await advance(0);
    }

    /* ---------- every text a frame draws is noted (as fakedrag.js does) ---------- */
    const rec = require(path.join(JS, 'kit', 'record')), fonts = require(path.join(JS, 'kit', 'fonts'));
    const R = rec.Recorder, text0 = R.prototype.text, blit0 = R.prototype.blit, reset0 = R.prototype.reset, make0 = rec.makeLayer;
    R.prototype.text = function (str, x, y, size, c, opts) {
        const w = text0.apply(this, arguments), al = (opts && opts.align) || 'left';
        (this._texts || (this._texts = [])).push({ s: String(str), x0: al === 'center' ? x - w / 2 : al === 'right' ? x - w : x, y, size, w, font: (opts && opts.font) || 'label', clip: this._clipNow || null });
        return w;
    };
    R.prototype.reset = function () { this._texts = []; return reset0.apply(this, arguments); };
    R.prototype.blit = function (L, x, y) {
        (L._texts || []).forEach((t) => (this._texts || (this._texts = [])).push(Object.assign({}, t, { x0: t.x0 + Math.round(x), y: t.y + Math.round(y), layer: true })));
        return blit0.apply(this, arguments);
    };
    rec.makeLayer = function (w, h, draw, ts) { let texts = []; const L = make0(w, h, (r) => { draw(r); texts = r._texts || []; }, ts); L._texts = texts; return L; };
    // (and every box a text can stand in: a panel, a bar, the banner. textfit.js, for the rule that no text crosses
    // the edge of its box)
    require('./textfit').watch(rec, { texts: false });

    /* ---------- the stand-in car ---------- */
    function makeCar(o) {
        const model = Object.assign({}, sim.CARS.a, o.model), faults = o.faults || sim.CLEAN;
        const car = {
            k: o.k || 1, model,
            getterMs: o.getterMs == null ? 25 : o.getterMs, notifyMs: o.notifyMs || 100, notifyDelay: o.notifyDelay == null ? 30 : o.notifyDelay,
            on: { notifier: o.notifier !== false, getter: o.getter !== false, cds2: o.cds2 || 'notify', yaw2: true, front: true, driver: true, xfront: true, xdriver: true, pedal: true, wheels: true, hb: true, dsc: true, study: true, nmea: true },
            yawCds2: o.yawCds2 || 'ok', nmeaMode: 'ok', dsc: 0, speedFault: null,
            missing: {}, watchFail: Object.assign({}, o.watchFail),
            handlers: {}, events: {}, calls: [], forbidden: [], logs: [], logAt: [], errors: [], barText: {}, subs: {},
            inFlight: {}, mostInFlight: 0, appInFlight: {}, mostAppInFlight: 0, reads: 0, kitReads: 0, limit: !!o.limit, upAfter: Object.assign({}, o.upAfter),
            positions: { lonMax: LON0, n: 0 }, screen: true, mode: 'pc', picture: null,
        };
        (o.missing || []).forEach((n) => { car.missing[n] = true; });

        /* the true motion: a script of driftsim.js, played from car.t0; before it and after it the car holds its state */
        let truth = null, read = null, odoT = clock.mono, odo = 0;
        const rand = sim.rng(o.seed || 20261124);
        car.state = Object.assign({ v: 0, lat: 0, drift: 0, bank: 0, spin: 0, pedal: 0, under: 0, rough: 0, hb: 0 }, o.start);
        car.setTruth = (script) => {
            truth = new sim.Truth(script, model);
            car.t0 = clock.mono; car.endAt = clock.mono + script.T * 1000;
            car.state = Object.assign({}, script.now);
            read = { main: sim.readers(truth, model, faults, rand), yaw2: sim.readers(truth, Object.assign({}, model, CHASSIS_YAW), faults, rand), wheel: sim.readers(truth, Object.assign({}, model, STEERING_WHEEL), faults, rand) };
            car.truth = truth;
        };
        car.setTruth(new sim.Script(car.state).hold(1));
        const ms = (t) => Math.max(0, t - car.t0);
        /** A script that begins in the state the car is in now. */
        car.script = () => new sim.Script(car.state);
        /** One of driftsim.js's scenes (or a Script), led into from the state the car is in now. */
        car.sceneScript = (name) => {
            const sc = typeof name === 'string' ? sim.scene(name) : name, s = car.script(), first = sc.segs.length ? sc.segs[0].from : sc.now;
            // (into the scene's own first state at a pace a car can do, then a moment to settle)
            s.to(Math.max(2, Math.abs(first.v - car.state.v) / 9), first).hold(1.5);
            sc.segs.forEach((g) => s.to(g.t1 - g.t0, g.to));
            return s;
        };
        /** The true motion right now: { V m/s, beta rad, drift degrees (the scripted angle), ... } (driftsim.js). */
        car.truthNow = (t) => truth.at(ms(t === undefined ? clock.mono : t));
        car.vTrue = (t) => truth.at(ms(t)).V * KMH;
        car.odo = (t) => { while (odoT < t) { const h = Math.min(20, t - odoT); odo += (car.vTrue(odoT) + car.vTrue(odoT + h)) / 2 / KMH * h / 1000; odoT += h; } return odo; };
        car.pos = (t) => {
            const lon = LON0 + car.odo(t) / metresPerDegLon(LAT0), P = car.positions;
            P.lonMax = Math.max(P.lonMax, lon); P.n++;
            return { lat: LAT0, lon, alt: ALT0 };
        };

        /* what the car sends: raw values by source */
        let flick = 0;
        const fl = () => (o.flicker === false ? 0 : flick++ % 2);
        const raws = {
            speed: (t) => (car.speedFault === 'none' ? 65535 : Math.max(0, Math.min(65534, Math.round(read.main.speed(ms(t)) / car.k / RAW_KMH)))),
            lat: (t) => Math.round((read.main.lat(ms(t)) + 65) / 0.002) + fl(),
            long: (t) => Math.round((read.main.long(ms(t)) + 65) / 0.002) + fl(),
            yaw: (t) => (car.yawCds2 === 'none' ? 65535 : read.main.yaw(ms(t)) + fl()),
            yaw2: (t) => read.yaw2.yaw(ms(t)),
            front: (t) => read.main.steer(ms(t)), wheel: (t) => read.wheel.steer(ms(t)),
            pedal: (t) => read.main.pedal(ms(t)), wheels: (t) => read.main.wheels(ms(t)), hb: (t) => read.main.hb(ms(t)),
        };
        car.raws = raws;
        const value = {
            speed: (t) => ({ speedVehicleCentreOfGravity: raws.speed(t) }),
            lat: (t) => ({ lateralAccelerationCentreOfGravity: raws.lat(t) }),
            long: (t) => ({ longitudinalAccelerationCentreOfGravity: raws.long(t) }),
            yaw: (t) => ({ yawVelocityVehicle: raws.yaw(t) }),
            yaw2: (t) => ({ cRCYawVelocityVehicle: 91, aliveYawVelocityVehicle: 3, dummy: 0, yawVelocityVehicle: raws.yaw2(t), yawVelocityVehicleErrorAmplitude: 40, qualifierYawVelocityVehicle: 0 }),
            front: (t) => ({ cRCSteeringAngleFrontAxleEffective: 17, aliveSteeringAngleFrontAxleEffective: 5, dummy: 1, steeringAngleFrontAxleEffective: raws.front(t), qualifierSteeringAngleFrontAxleEffective: 0, statusConditionSteeringAngle: 1, steeringAngleFrontAxleEffectiveErrorAmplitude: 9 }),
            driver: (t) => ({ cRCActualValueSteeringAngleDriver: 44, aliveActualValueSteeringAngleDriver: 2, controlHandsOffRecognitionVehicleGuiding: 0, dummy1: 0, actualValueSteeringAngleDriver: raws.wheel(t), actualValueSteeringAngleVelocityDriver: 32768, dummy2: 0, qualifierActualValueSteeringAngleDriver: 0 }),
            xfront: (t) => ({ steeringAngleFrontAxleEffective: raws.front(t) }),
            xdriver: (t) => ({ actualValueSteeringAngleDriver: raws.wheel(t), qualifierActualValueSteeringAngleDriver: 0 }),
            pedal: (t) => ({ cRCAngleAcceleratorPedal: 7, aliveAngleAcceleratorPedal: 1, dummy: 1, actualValueAngleAcceleratorPedal: raws.pedal(t), qualifierActualValueAngleAcceleratorPedal: 0, actualValueAngleAcceleratorPedalVirtual: raws.pedal(t), gradientActualValueAngleAcceleratorPedal: 2048, dummy2: 0, dummy3: 0, dummy4: 0 }),
            wheels: (t) => { const w = raws.wheels(t); return { CRCActualValueRPMWheel: 77, aliveActualValueRPMWheel: 4, dummy: 0, actualValueRPMWheelRLH: w.rl, actualValueRPMWheelRRH: w.rr, actualValueRPMWheelFLH: w.fl, actualValueRPMwheelFRH: w.fr, qualifierActualValueRPMWheelRLH: 0, qualifierActualValueRPMWheelRRH: 0, qualifierActualValueRPMWheelFLH: 0, qualifierActualValueRPMWheelFRH: 0 }; },
            hb: (t) => ({ statusContactHandBrake: o.hbNumbers ? (raws.hb(t) ? 2 : 1) : raws.hb(t) ? 'HANDBREMSE_ANGEZOGEN' : 'HANDBREMSE_GELOEST' }),
            dsc: () => ({ displayStatusDSC2: car.dsc, counterControlDisplayStatusDSC: 1 }),
            // the study-only values: made-up numbers that follow the true motion
            move: (t) => { const m = car.truthNow(t); return { qualifierFunctionVehicleGuiding: 0, actualValueCurvatureVehicleMove: 32768 + Math.round(m.r / Math.max(m.V, 2) * 2000), actualValueAttitudeAngleVehicleMove: 32768 + Math.round(m.beta / DEG * 20), qualifierActualValueAttitudeAngleVehicleMove: 0, qualifierActualValueCurvatureVehicleMove: 0, dummy: 0, statusConditionSteeringAngle2: 1, aliveActualValueVectorVehicleMove: 6, cRCActualValueVectorVehicleMove: 120 }; },
            est: (t) => ({ attitudeAngleEstimated: 32768 + Math.round(car.truthNow(t).beta / DEG * 20), qualifierVehicleDynamicsDataEstimated: 2, attitudeAngleEstimatedErrorAmplitude: 14, aliveVehicleDynamicsDataEstimatedVerified: 9 }),
            mLast: () => ({ statusDriftAttitudeAngleAverageLast: 214, statusDriftLastNewBest: 0, statusDriftDistanceLast: 87, statusDriftDurationLast: 46, statusDriftStarsLast: 3, statusDriftStarsLastMaxPossible: 5, statusDriftLevelLast: 1 }),
            mBest: () => ({ statusDriftAttitudeAngleAverageBest: 302, statusDriftDistanceBest: 141, statusDriftDurationBest: 72, statusDriftStarsBest: 4, statusDriftStarsBestMaxPossible: 5, statusDriftLevelBest: 1 }),
        };
        car.value = value;
        /** [source, interface, field]: where each source's values go. */
        const ROUTE = {
            speed: ['Vehicle2', 'statusCarSpeed2'], lat: ['CDS2', 'statusLateralAccelerationMassCenter'], long: ['CDS2', 'statusLongitudinalAccelerationMassCenter'], yaw: ['CDS2', 'statusYawVelocityVehicle'],
            yaw2: ['SpeedAcceleration', 'YawSpeedVehicle'], front: ['SteeringAngle', 'SteeringAngleFrontAxleEffective'], driver: ['SteeringAngle', 'ActualSteeringAngleDriver'],
            xfront: ['XView', 'statusFrontAxleSteeringAngle'], xdriver: ['XView', 'statusSteeringAngleDriver'], pedal: ['AcceleratorPedal', 'AngleAcceleratorPedal'],
            wheels: ['Powertrain', 'ActualValueRPMWheel'], hb: ['CDS', 'statusHandBrake'], dsc: ['FES', 'statusDSCSwitchHMI'],
            move: ['DrivingVector', 'ActualVectorVehicleMove'], est: ['DrivingVector', 'VehicleDynamicDataEstimatedVerified'], mLast: ['MDrive', 'statusDriftLast'], mBest: ['MDrive', 'statusDriftBest'],
        };
        car.ROUTE = ROUTE;
        const deliver = (name, field, v) => { const h = car.handlers[name]; if (h && h[field]) h[field](v); };
        const event = (name, ev, v) => { const fn = car.events[name + '.' + ev]; if (fn) fn(v); };
        car.send = {};
        Object.keys(ROUTE).forEach((k) => { car.send[k] = (v) => deliver(ROUTE[k][0], ROUTE[k][1], v); });
        car.send.nmea = (v) => event('SatellitePositioning', 'updatePosition', v);
        /** A sender that sends a source's value when it has changed: every `period` ms, `delay` ms on the way. */
        const onChange = (key, enabled, delay) => {
            let sent = null;
            return () => {
                if (!enabled()) return;
                const v = value[key](clock.mono), sig = JSON.stringify(v);
                if (sig === sent) return;
                sent = sig;
                if (delay) setTimeout(() => car.send[key](v), delay); else car.send[key](v);
            };
        };
        const cds = () => car.on.cds2 === 'notify' || car.on.cds2 === 'slow';
        const emit = {
            speed: onChange('speed', () => car.on.notifier, car.notifyDelay),
            lat: onChange('lat', cds), long: onChange('long', cds), yaw: onChange('yaw', () => cds() && car.on.yaw !== false),
            yaw2: onChange('yaw2', () => car.on.yaw2), front: onChange('front', () => car.on.front), driver: onChange('driver', () => car.on.driver),
            xfront: onChange('xfront', () => car.on.xfront), xdriver: onChange('xdriver', () => car.on.xdriver),
            pedal: onChange('pedal', () => car.on.pedal), wheels: onChange('wheels', () => car.on.wheels),
            hb: onChange('hb', () => car.on.hb), dsc: onChange('dsc', () => car.on.dsc),
            move: onChange('move', () => car.on.study), est: onChange('est', () => car.on.study), mLast: onChange('mLast', () => car.on.study), mBest: onChange('mBest', () => car.on.study),
            nmea: () => {
                if (!car.on.nmea) return;
                const t = clock.mono, p = car.pos(t), m = car.nmeaMode;
                if (m === 'junk') { car.send.nmea({ nmeaString: '$GPRMC,,,,*00\r\nnot a sentence $ $$*ZZ\r\n$GPGGA', delayCounter: 1 }); return; }
                const hms = new Date(clock.wall).toISOString().slice(11, 19).replace(/:/g, '') + '.00', knots = car.vTrue(t) / KNOT;
                const rmc = 'GPRMC,' + hms + ',' + (m === 'void' ? 'V' : 'A') + ',' + dm(p.lat, 2) + ',N,' + dm(p.lon, 3) + ',E,' + (m === 'knots' ? knots.toFixed(0) : knots.toFixed(3)) + ',' + COURSE + ',241126,,,A';
                const gga = 'GPGGA,' + hms + ',' + dm(p.lat, 2) + ',N,' + dm(p.lon, 3) + ',E,1,09,0.9,' + p.alt.toFixed(1) + ',M,47.0,M,,';
                const gsa = 'GPGSA,A,3,04,05,,09,12,,,24,,,,,2.5,1.3,2.1';
                car.send.nmea({ nmeaString: [rmc, gga, gsa].map((b) => sentence(b, m === 'bad')).join('\r\n') + '\r\n', delayCounter: 2 });
            },
        };
        /** Start the car's own senders: [period ms, phase ms]. */
        car.start = () => {
            const every = (period, phase, fn) => setTimeout(() => { fn(); setInterval(fn, period); }, phase);
            const fast = car.on.cds2 === 'slow' ? 250 : 20;
            every(car.notifyMs, 37, emit.speed);
            every(fast, 3, emit.lat); every(fast, 9, emit.long); every(fast, 14, emit.yaw);
            every(20, 6, emit.yaw2); every(20, 11, emit.front); every(20, 17, emit.driver); every(50, 23, emit.xfront); every(50, 41, emit.xdriver);
            every(50, 29, emit.pedal); every(50, 44, emit.wheels); every(100, 61, emit.hb); every(500, 77, emit.dsc);
            every(200, 83, emit.move); every(200, 131, emit.est); every(1000, 210, emit.mLast); every(1000, 215, emit.mBest);
            every(1000, 400, emit.nmea);
        };

        /* what the app may do with the car, and what it must not */
        const note = (c) => { car.calls.push(c); if (['watch', 'getValue', 'on'].indexOf(c.type) < 0) car.forbidden.push(c); };
        const sourceOf = (name, field) => Object.keys(ROUTE).filter((k) => ROUTE[k][0] === name && ROUTE[k][1] === field)[0];
        const answers = (name, field) => (GETTERS[name] || []).indexOf(field) >= 0 && (name !== 'Vehicle2' || car.on.getter) && (name !== 'CDS2' || car.on.cds2 !== 'off') &&
            (field !== 'statusYawVelocityVehicle' || car.on.yaw !== false);
        /** One read of a getter in flight at the car (the app's or the kit's own): counted per field, answered after getterMs. */
        const carRead = (name, field, app) => {
            const src = sourceOf(name, field);
            car.reads++; car.inFlight[field] = (car.inFlight[field] || 0) + 1; car.mostInFlight = Math.max(car.mostInFlight, car.inFlight[field]);
            if (app) { car.appInFlight[name] = (car.appInFlight[name] || 0) + 1; car.mostAppInFlight = Math.max(car.mostAppInFlight, car.appInFlight[name]); }
            const at = clock.mono + 8;
            return new Promise((res) => {
                if (!isFinite(car.getterMs)) return;                // never answered
                setTimeout(() => { car.inFlight[field]--; if (app) car.appInFlight[name]--; res(value[src](at)); }, car.getterMs);
            });
        };
        /** As the kit's watch() does when a service is up or comes up: one read of each getter, handed to the field's handler. */
        const kitRead = (name) => (GETTERS[name] || []).forEach((field) => {
            if (!answers(name, field) || !(car.handlers[name] && car.handlers[name][field])) return;
            car.kitReads++;
            carRead(name, field, false).then((v) => deliver(name, field, v));
        });
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
                if (!answers(name, field)) return new Promise((res, rej) => setTimeout(() => rej(new Error('test: no getter')), 5));
                // a service that is down answers nothing; the read fails when its time limit is over
                if (car.subs[name] && car.subs[name].available === false) return new Promise((res, rej) => setTimeout(() => rej(new Error('test: service down')), limit > 0 ? limit : 1000));
                const answer = carRead(name, field, true);
                if (!car.limit || !(limit > 0)) return answer;
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
        // the app's own session (session.js) and car side (car.js), as the app holds them
        const S = require(path.join(JS, 'session')).Session, tick = S.prototype.tick;
        S.prototype.tick = function () { car.session = this; car.store = this.store; return tick.apply(this, arguments); };
        const C = require(path.join(JS, 'car')).CarSide, ctick = C.prototype.tick;
        C.prototype.tick = function () { car.side = this; return ctick.apply(this, arguments); };
        hu.start();
        car.start();
        await advance(60);
        console.log = quiet;
        /** Open tab i (0 Drift, 1 Last, 2 Session, 3 Best, 4 Signals). */
        car.page = (i) => hu.display.onTab(i);
        /** Press a button of the HMI's bar. */
        car.press = (id) => hu.handlers[id]({});
        /** Draw one frame of the page shown: the texts on it ({ s, x0, y, size, w, font }); car.boxes: the boxes on it. */
        car.draw = async () => { await hu.loopFn(); car.frame = frame; car.boxes = ((frame && frame._boxes) || []).slice(); car.targets = (frame && frame.targets) || []; return ((frame && frame._texts) || []).slice(); };
        /** Save a picture of the page shown (the kit's software renderer, PC size). */
        car.save = async (dir, name) => {
            const mode = car.mode;
            car.mode = 'pc'; wantPng = true; car.picture = null;
            await hu.loopFn();
            wantPng = false; car.mode = mode;
            if (car.picture) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, name + '.png'), Buffer.isBuffer(car.picture) ? car.picture : car.picture.png()); }
        };
        /** Save a picture of the page as last drawn for iDrive 7 or iDrive 8 (car.mode), at that screen's own pixel size. */
        car.saveSized = (dir, name) => {
            if (car.mode === 'pc' || !frame) return;
            const png = require('./textfit').picture(rec, require(path.join(JS, 'kit', 'canvas')), frame, car.mode === 'id7' ? 1.165 : 1.419).png();
            fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, name + '.png'), png);
        };
        car.view = () => car.session.view(clock.mono);
        /** Play a script from now and let the clocks run to its end (o.mid: { at ms into it, fn } to look in on the way; o.after: ms more). */
        car.run = async (script, o2) => {
            o2 = o2 || {};
            car.setTruth(script);
            const t0 = clock.mono, T = script.T * 1000;
            const mids = [].concat(o2.mid || []).sort((a, b) => a.at - b.at);
            for (const m of mids) { await advance(t0 + m.at - clock.mono); await m.fn(); }
            await advance(t0 + T + (o2.after === undefined ? 0 : o2.after) - clock.mono);
            return { t0, T };
        };
        /** Drive one of driftsim.js's scenes from the state the car is in now. Returns { t0, T, lead: ms before the scene itself began }. */
        car.play = async (name, o2) => {
            const before = car.state.v, sc = typeof name === 'string' ? sim.scene(name) : name, first = sc.segs.length ? sc.segs[0].from : sc.now;
            const lead = (Math.max(2, Math.abs(first.v - before) / 9) + 1.5) * 1000;
            const mids = [].concat((o2 && o2.mid) || []).map((m) => ({ at: m.at + lead, fn: m.fn }));
            const r = await car.run(car.sceneScript(name), Object.assign({}, o2, { mid: mids }));
            return Object.assign(r, { lead });
        };
        /** The lines of the log that match re (a line the app held back says so at its end: that note is taken off here). */
        car.logged = (re) => car.logs.map((l) => l.replace(/ \(logged \d+\.\d s later\)$/, '')).filter((l) => re.test(l));
        return car;
    }

    /** What went wrong unseen in any drive so far: an error or a guarded failure the app logged. */
    const mishaps = () => [].concat.apply([], cars.map((c) => c.errors.map((e) => 'frame: ' + ((e && e.stack) || e)).concat(c.logs.filter((l) => /^ERROR |^WARN tick |^WARN first render|^WARN settings|\(\d+x\): /.test(l)))));
    /** Everything any car's app did with its signals, and what of it was not allowed. */
    const allCalls = () => [].concat.apply([], cars.map((c) => c.calls));
    const allForbidden = () => [].concat.apply([], cars.map((c) => c.forbidden));
    return { boot, advance, stall, clock, mishaps, allCalls, allForbidden, cars, fonts, rec, JS, IFACE, OPTIONAL, GETTERS, LAT0, LON0, COURSE, metresPerDegLon, sim };
};
