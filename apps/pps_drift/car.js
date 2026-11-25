'use strict';
/**
 * car.js - Proven Drift: the car side, after Proven Drag's car.js. It subscribes to the car's signals,
 * reads getters on a schedule, subscribes to one event, and hands every sample to the session with the
 * time it arrived.
 * READ ONLY: nothing here writes a field, calls a method or opens the diagnostic link. What leaves the
 * app is: subscriptions (signals.watch), getter reads (getValue) of the speed and, where the car does not
 * send them often enough, of the yaw rate and the two accelerations, and one event subscription (the GPS
 * receiver's sentences). It never touches DSC, traction control, the handbrake or any driving setting:
 * it reads the DSC button's state and the handbrake's, and that is all it has to do with them.
 *
 *   const car = new CarSide({ signals, log, session, scaling, now });
 *   car.start();               subscribe (a failed subscription is tried again after 5, 15 and 60 s)
 *   car.tick(now)              every 50 ms: the poll periods may have changed
 *   car.status()               for the Signals page: per source { key, label, state, optional }
 *   car.live                   the study-only raw values, for the Signals page
 *
 * WHAT IT ASSUMES ABOUT THE CAR (public reports and a head unit's interface catalogue; none of it measured
 * by Proven)
 *   - No sample carries a time: each is stamped when its handler runs, on the forward-only clock.
 *   - The kit's signals.watch() reads every getter once itself whenever the car's service comes up, and
 *     hands the answer to the same handler as a notification. Two reads of one field must not be in flight
 *     together. So a getter is not read by the app while the kit says its service is down, and after it
 *     came up only once the service has been up for 1 s and 300 ms have passed since the first value of
 *     that field arrived through its handler, or 3.3 s after it came up if nothing arrived (the kit's read
 *     allows 3 s). A head unit whose binding never says "up" is read anyway from 10 s after the
 *     subscription. (All as Proven Drag.)
 *   - Raw 65535 in the speed and the accelerations is the car's "no value": such a sample is counted and
 *     not used. Neither is an acceleration beyond 30 m/s2 either way. The yaw rate and the steering are
 *     handed on raw, 65535 and all: their scale is not known here, and the engine deals with their ends
 *     (angle.js).
 *   - The members read are named in MEMBER below, as the catalogue of one head unit has them. A value
 *     that does not have its member is no value (the log's first lines show what it did have). The
 *     "qualifier" members some of these values carry are not read: what their values mean is not known.
 *   - The handbrake's two states are read as the kit's own Live Data app reads them (released / applied,
 *     by name or by number 1 / 2); anything else is "not known".
 *   - STUDY ONLY: the car's own motion estimate (DrivingVector), BMW's own drift analyser of some M cars
 *     (MDrive statusDriftLast, statusDriftBest) and the DSC button's state are shown raw on the Signals
 *     tab and logged, so that one photo from a first car tells what they are. They enter no angle and no
 *     score, and controlDisplayDrift is never asked for, let alone called.
 *
 * THE LOG (first-car evidence): the first 10 raw values of every source, interfaces that are missing,
 *   getter reads that failed or were too slow. NO POSITION, NO COURSE AND NO HEADING IS EVER LOGGED: of
 *   the GPS receiver's sentences only their kinds, whether their checksums were right, and the status and
 *   speed of the RMC sentence (gpscheck.js reads nothing else out of them).
 */
const { PollScheduler, TOPUP_MS } = require('./feed');

const VEHICLE2 = 'de.bmw.infotainment.vehicle.Vehicle2', CDS2 = 'de.bmw.infotainment.vehicle.CDS2';
/** The interfaces, and what the app loses without an optional one (as app.json says it to the installer). */
const INTERFACES = {
    vehicle2: { iface: VEHICLE2, instance: '1', name: 'Vehicle2' },
    cds2: { iface: CDS2, instance: '1', name: 'CDS2' },
    speedaccel: { iface: 'de.bmw.chassis.SpeedAcceleration', instance: '1', name: 'SpeedAcceleration', optional: 'no second source of the yaw rate' },
    steering: { iface: 'de.bmw.chassis.SteeringAngle', instance: '1', name: 'SteeringAngle', optional: 'the steering check and the opposite lock then need the steering from XView' },
    xview: { iface: 'de.bmw.infotainment.drivingexcitement.XView', instance: '1', name: 'XView', optional: 'no second source of the steering' },
    pedal: { iface: 'de.bmw.powertrain.AcceleratorPedal', instance: '1', name: 'AcceleratorPedal', optional: 'no accelerator pedal bar and no average pedal' },
    powertrain: { iface: 'de.bmw.powertrain.Powertrain', instance: '1', name: 'Powertrain', optional: 'no rear wheelspin, and learning cannot check that the rear wheels grip' },
    cds: { iface: 'de.bmw.infotainment.vehicle.CDS', instance: '1', name: 'CDS', optional: 'the handbrake is not known' },
    fes: { iface: 'de.bmw.infotainment.drivingexcitement.FES', instance: '1', name: 'FES', optional: 'the DSC button state is not shown' },
    drivingvector: { iface: 'de.bmw.chassis.DrivingVector', instance: '1', name: 'DrivingVector', optional: 'the car\'s own motion estimate is not shown (study only)' },
    mdrive: { iface: 'de.bmw.infotainment.misc.MDrive', instance: '1', name: 'MDrive', optional: 'BMW\'s own drift analyser is not shown (study only)' },
    satellite: { iface: 'de.bmw.infotainment.SatellitePositioning', instance: '1', name: 'SatellitePositioning', optional: 'no GPS speed to check the car\'s speed against' },
};
/** The rows of the Signals page: source key (the session's meters), label, the interface it comes from. */
const SOURCES = [
    ['speedP', 'Speed, getter', 'vehicle2'], ['speedN', 'Speed, notified', 'vehicle2'],
    ['lat', 'Sideways acceleration', 'cds2'], ['long', 'Forward acceleration', 'cds2'],
    ['yawC', 'Yaw rate, CDS2', 'cds2'], ['yawS', 'Yaw rate, chassis', 'speedaccel'],
    ['steerF', 'Front wheels, chassis', 'steering'], ['steerXF', 'Front wheels, XView', 'xview'],
    ['steerD', 'Steering wheel, chassis', 'steering'], ['steerXD', 'Steering wheel, XView', 'xview'],
    ['pedal', 'Accelerator pedal', 'pedal'], ['wheels', 'Wheel speeds', 'powertrain'],
    ['hb', 'Handbrake', 'cds'], ['dsc', 'DSC button', 'fes'],
    ['move', 'Car\'s motion estimate', 'drivingvector'], ['est', 'The same, verified', 'drivingvector'],
    ['mLast', 'BMW drift analyser, last', 'mdrive'], ['mBest', 'BMW drift analyser, best', 'mdrive'],
    ['nmea', 'GPS sentences', 'satellite'],
];
/** The member each value is read from. */
const MEMBER = {
    yaw: 'yawVelocityVehicle',
    front: 'steeringAngleFrontAxleEffective', driver: 'actualValueSteeringAngleDriver',
    pedal: 'actualValueAngleAcceleratorPedal',
    hb: 'statusContactHandBrake', dsc: 'displayStatusDSC2',
    // (the front right wheel is spelt with a small w in the head unit's interface catalogue)
    wheels: { fl: 'actualValueRPMWheelFLH', fr: 'actualValueRPMwheelFRH', rl: 'actualValueRPMWheelRLH', rr: 'actualValueRPMWheelRRH' },
};
/** The study-only values: the members shown, with the word the Signals page puts before each. */
const STUDY = {
    move: [['angle', 'actualValueAttitudeAngleVehicleMove'], ['curvature', 'actualValueCurvatureVehicleMove'], ['qualifier', 'qualifierActualValueAttitudeAngleVehicleMove']],
    est: [['angle', 'attitudeAngleEstimated'], ['error', 'attitudeAngleEstimatedErrorAmplitude'], ['qualifier', 'qualifierVehicleDynamicsDataEstimated']],
    mLast: [['angle', 'statusDriftAttitudeAngleAverageLast'], ['distance', 'statusDriftDistanceLast'], ['time', 'statusDriftDurationLast'], ['stars', 'statusDriftStarsLast'], ['of', 'statusDriftStarsLastMaxPossible']],
    mBest: [['angle', 'statusDriftAttitudeAngleAverageBest'], ['distance', 'statusDriftDistanceBest'], ['time', 'statusDriftDurationBest'], ['stars', 'statusDriftStarsBest'], ['of', 'statusDriftStarsBestMaxPossible']],
};
/** The handbrake's state, as the kit's Live Data app reads it (apps/live_data/signals.js): by name or by number. */
const HANDBRAKE = { HANDBREMSE_ANGEZOGEN: true, HANDBREMSE_GELOEST: false, 2: true, 1: false };
/** The getters the app reads itself: the interface and the field of each. */
const GETTER = {
    speed: ['vehicle2', 'statusCarSpeed2'],
    lat: ['cds2', 'statusLateralAccelerationMassCenter'], long: ['cds2', 'statusLongitudinalAccelerationMassCenter'], yaw: ['cds2', 'statusYawVelocityVehicle'],
};
const RETRY_MS = [5000, 15000, 60000];
const RAW_LINES = 10;              // raw values logged per source
const READ_TIMEOUT_MS = 1000;      // a getter read is asked to give up after this
const POLL_START_MS = 300;         // a getter is read this long after the first value came through its handler (the kit's own read, or a notification) ...
const KIT_GUARD_MS = 1000;         // ... and not before the service has been up this long
const KIT_READ_MS = 3000;          // if no value came at all: this long (plus the 300 ms) after the service came up: the kit's own read allows 3 s
const NEVER_UP_MS = 10000;         // a binding that never says its service is up: the getter is read anyway from this long after the subscription
const SPEED_MAX_KMH = 500;         // above this it is no speed
const MISS_LINES = 5;              // failed / slow getter reads logged per getter
const ACCEL_MAX = 30;              // m/s2: an acceleration beyond this either way is taken as no value
const TEXT_MAX = 14, STUDY_MAX = 8; // a value that is text is cut to this many characters on the screen (a study-only one: five stand in a line)

const isNum = (x) => typeof x === 'number' && isFinite(x);
const text = (v) => { try { return String(JSON.stringify(v)).slice(0, 320); } catch (e) { return String(v); } };
/** A member of a value by its name, whatever its capitals; undefined if it is not there. */
function member(v, name) {
    if (!v || typeof v !== 'object') return undefined;
    if (name in v) return v[name];
    const low = name.toLowerCase();
    for (const k of Object.keys(v)) if (k.toLowerCase() === low) return v[k];
    return undefined;
}
/** A raw value as the Signals page shows it: a number as it is, a text cut short (to max characters), anything else "--". */
const shown = (x, max) => (isNum(x) ? String(Math.abs(x) < 1e9 ? Math.round(x * 1000) / 1000 : x.toExponential(2)) : typeof x === 'string' && x ? (x.length > (max || TEXT_MAX) ? x.slice(0, (max || TEXT_MAX) - 2) + '..' : x) : typeof x === 'boolean' ? String(x) : '--');
/** A 16-bit raw count, or null if the value is none. */
const count16 = (x) => (isNum(x) && x >= 0 && x <= 65535 ? x : null);

class CarSide {
    /** o: { signals (the kit's ctx.signals), log, session, scaling (app.json config.scaling), now() } */
    constructor(o) {
        this.signals = o.signals; this.log = o.log; this.session = o.session; this.now = o.now;
        const sc = o.scaling || {};
        this.sp = Object.assign({ factor: 0.015625, offset: 0, invalid: 65535, member: 'speedVehicleCentreOfGravity' }, sc.speed);
        this.ac = {
            lat: Object.assign({ factor: 0.002, offset: -65, invalid: 65535, member: 'lateralAccelerationCentreOfGravity' }, sc.lat),
            long: Object.assign({ factor: 0.002, offset: -65, invalid: 65535, member: 'longitudinalAccelerationCentreOfGravity' }, sc.long),
        };
        this.subs = {};                 // interface key -> { state: 'wait' | 'ok' | 'missing' | 'error', error, sub }
        Object.keys(INTERFACES).forEach((k) => { this.subs[k] = { state: 'wait', error: null, sub: null }; });
        // when a getter may be read (see the top): per getter { up, everUp, upAt, heard, open }; per interface: subscribed at
        this.gates = {}; this.since = {};
        Object.keys(GETTER).forEach((k) => { this.gates[k] = { up: false, everUp: false, upAt: null, heard: null, open: false, said: 0 }; });
        this.rawN = {}; this.errN = {}; this.missN = {};
        this.live = { study: {}, kinds: '' };
        this.counts = { noValue: 0 };
        const clock = { now: this.now, setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h) };
        const safe = (fn, dflt) => () => { try { return fn(); } catch (e) { return dflt; } };
        this.speedPoll = new PollScheduler({
            clock, period: safe(() => this.session.speedPeriod(), 100),
            read: () => this._read('speed'), timeoutMs: READ_TIMEOUT_MS,
            onSample: (t, v, took) => this._speed('polled', t, v, took),
            onMiss: (why, took) => this._miss('speed', why, took),
            onError: (e) => this._oops('speed getter', e),
        });
        // the yaw rate and the two accelerations: one read at a time for the whole interface, only where the car does
        // not send them often enough (feed.js, TopUp)
        this.topping = false; this.topSaid = 0;
        this.cdsPoll = new PollScheduler({
            clock, period: () => TOPUP_MS, timeoutMs: READ_TIMEOUT_MS,
            read: () => {
                const k = this.session.topUp.next((key) => this.gates[key].open);
                return k ? this._read(k).then((v) => ({ k, v })) : Promise.resolve({ k: null });
            },
            onSample: (t, x) => { if (x.k === 'yaw') this._yaw('cds2', t, x.v, false); else if (x.k) this._accel(x.k, t, x.v, false); },
            onMiss: (why, took) => this._miss('CDS2', why, took),
            onError: (e) => this._oops('CDS2 getter', e),
        });
    }

    /* ---------- logging ---------- */

    /** The first RAW_LINES raw values of a source go to the log. */
    _raw(source, make) {
        const n = (this.rawN[source] = (this.rawN[source] || 0) + 1);
        if (n > RAW_LINES) return;
        let s;
        try { s = make(); } catch (e) { s = '(not readable: ' + e + ')'; }
        this.log.info('raw ' + source + ' #' + n + ': ' + s);
    }

    /** An error in one of our own handlers: logged the first time and then every 500th, never thrown on. */
    _oops(what, e) {
        const n = (this.errN[what] = (this.errN[what] || 0) + 1);
        if (n === 1 || n % 500 === 0) this.log.warn(what + ' (' + n + 'x): ' + (e && e.stack || e));
    }

    _miss(what, why, took) {
        const n = (this.missN[what] = (this.missN[what] || 0) + 1);
        if (n <= MISS_LINES) this.log.info(what + ' getter: a read ' + (why === 'slow' ? 'took ' + Math.round(took) + ' ms and was thrown away' : why === 'hung' ? 'was not answered in 10 s and was given up' : 'failed after ' + Math.round(took) + ' ms') + (n === MISS_LINES ? ' (not logged again)' : ''));
    }

    /** A handler that cannot throw into the kit (the kit would log every single time). */
    _guard(what, fn) { return (v) => { try { fn(v); } catch (e) { this._oops(what, e); } }; }

    /* ---------- subscribing ---------- */

    start() {
        const h = (what, fn) => this._guard(what, fn), S = this.session;
        const subscribed = (key) => () => { this.since[key] = this.now(); };
        this._watch('vehicle2', { statusCarSpeed2: h('speed', (v) => { this._heard('speed'); this._speed('notified', this.now(), v); }) }, subscribed('vehicle2'));
        this._watch('cds2', {
            statusLateralAccelerationMassCenter: h('sideways acceleration', (v) => { this._heard('lat'); this._accel('lat', this.now(), v, true); }),
            statusLongitudinalAccelerationMassCenter: h('forward acceleration', (v) => { this._heard('long'); this._accel('long', this.now(), v, true); }),
            statusYawVelocityVehicle: h('yaw rate', (v) => { this._heard('yaw'); this._yaw('cds2', this.now(), v, true); }),
        }, subscribed('cds2'));
        this._watch('speedaccel', { YawSpeedVehicle: h('yaw rate, chassis', (v) => this._yaw('chassis', this.now(), v, true)) });
        this._watch('steering', {
            SteeringAngleFrontAxleEffective: h('front wheels', (v) => this._steer('front', 'steerF', MEMBER.front, v)),
            ActualSteeringAngleDriver: h('steering wheel', (v) => this._steer('driver', 'steerD', MEMBER.driver, v)),
        });
        this._watch('xview', {
            statusFrontAxleSteeringAngle: h('front wheels, XView', (v) => this._steer('xfront', 'steerXF', MEMBER.front, v)),
            statusSteeringAngleDriver: h('steering wheel, XView', (v) => this._steer('xdriver', 'steerXD', MEMBER.driver, v)),
        });
        this._watch('pedal', { AngleAcceleratorPedal: h('accelerator pedal', (v) => {
            const raw = count16(member(v, MEMBER.pedal));
            this._raw('accelerator pedal', () => text(v));
            S.note('pedal', shown(raw));
            if (raw === null) { this.counts.noValue++; return; }
            S.seen('pedal', this.now());
            S.pedal(this.now(), raw);
        }) });
        this._watch('powertrain', { ActualValueRPMWheel: h('wheels', (v) => this._wheels(v)) });
        this._watch('cds', { statusHandBrake: h('handbrake', (v) => {
            const x = member(v, MEMBER.hb), on = Object.prototype.hasOwnProperty.call(HANDBRAKE, String(x)) ? HANDBRAKE[String(x)] : null;
            this._raw('handbrake', () => text(v) + ' = ' + (on === true ? 'applied' : on === false ? 'released' : 'not known'));
            S.note('hb', shown(x) + (on === true ? ' = ON' : on === false ? ' = OFF' : ''));
            if (v && typeof v === 'object') S.seen('hb', this.now());
            S.hb(this.now(), on);
        }) });
        this._watch('fes', { statusDSCSwitchHMI: h('DSC button', (v) => {
            this._raw('DSC button', () => text(v) + ' (shown raw, used for nothing)');
            if (v && typeof v === 'object') S.seen('dsc', this.now());
            S.note('dsc', shown(member(v, MEMBER.dsc)));
        }) });
        this._watch('drivingvector', {
            ActualVectorVehicleMove: h('the car\'s motion estimate', (v) => this._study('move', 'the car\'s motion estimate', v)),
            VehicleDynamicDataEstimatedVerified: h('the car\'s motion estimate, verified', (v) => this._study('est', 'the car\'s motion estimate, verified', v)),
        });
        this._watch('mdrive', {
            statusDriftLast: h('BMW drift analyser', (v) => this._study('mLast', 'BMW drift analyser, last', v)),
            statusDriftBest: h('BMW drift analyser', (v) => this._study('mBest', 'BMW drift analyser, best', v)),
        });
        // the GPS receiver's sentences are an event, not a field: a proxy without fields, then the one event
        this._watch('satellite', {}, (sub) => {
            if (!sub.proxy || !this.signals.on) { this._failed('satellite', 'no event subscription on this head unit', true); return; }
            Promise.resolve().then(() => this.signals.on(sub.proxy, 'updatePosition', h('GPS sentences', (v) => this._nmea(v)), this.log))
                .then(() => this.log.info('signal SatellitePositioning: subscribed to the event updatePosition'))
                .catch((e) => this._failed('satellite', 'event updatePosition: ' + (e && e.message || e), true));
        });
    }

    _failed(key, why, final) {
        const st = this.subs[key], I = INTERFACES[key];
        st.error = why;
        st.state = /no SOME\/IP config/.test(why) ? 'missing' : 'error';
        const wait = final || st.state === 'missing' ? 0 : RETRY_MS[st.tries++];
        this.log.warn('signal ' + I.name + (st.state === 'missing' ? ': this head unit does not have it' : ' error: ' + why) +
            (I.optional ? ' (optional: ' + I.optional + ')' : key === 'vehicle2' ? ' (NEEDED: without the speed there is no angle)' : ' (NEEDED: without the yaw rate and the sideways acceleration there is no angle)') +
            (wait ? ', trying again in ' + wait / 1000 + ' s' : ', not tried again'));
        if (wait) setTimeout(() => { try { this._watch(key, st.handlers, st.done); } catch (e) { this._oops('subscribe ' + I.name, e); } }, wait);
    }

    _watch(key, handlers, done) {
        const st = this.subs[key], I = INTERFACES[key];
        st.handlers = handlers; st.done = done; st.tries = st.tries || 0;
        let p;
        try { p = Promise.resolve(this.signals.watch(I.iface, I.instance, handlers, this.log)); } catch (e) { p = Promise.reject(e); }
        p.then((sub) => {
            if (!sub || sub.error) { this._failed(key, String(sub ? sub.error : 'no answer')); return; }
            st.state = 'ok'; st.error = null; st.sub = sub;
            this.log.info('signal ' + I.name + ': subscribed' + (st.tries ? ' (try ' + (st.tries + 1) + ')' : ''));
            if (done) done(sub);
        }).catch((e) => this._failed(key, String(e && e.message || e)));
    }

    /** One getter read through the proxy watch() returned. */
    _read(name) {
        const sub = this.subs[GETTER[name][0]].sub;
        if (!sub || !sub.proxy || typeof sub.proxy.getValue !== 'function') return Promise.reject(new Error('no proxy'));
        return sub.proxy.getValue(GETTER[name][1], READ_TIMEOUT_MS);
    }

    /** A value came through a getter field's handler: after the service came up, the first one is (or follows) the kit's own read. */
    _heard(name) {
        const g = this.gates[name], now = this.now();
        this._gate(name, now);                          // (the service may have come up since the last tick looked)
        if (g.upAt !== null && g.heard === null) g.heard = now;
    }

    /**
     * May this getter be read now (see the top of the file)? Not while the kit says its service is down; after it
     * came up, not before the kit's own read of it is out of the way.
     */
    _gate(name, now) {
        const g = this.gates[name], key = GETTER[name][0], sub = this.subs[key].sub, since = this.since[key];
        if (!sub || since === undefined) return false;
        const up = !!sub.available;
        if (up && !g.up) { g.upAt = now; g.heard = null; g.everUp = true; }
        if (!up && g.up) g.upAt = null;
        g.up = up;
        const open = up ? (g.heard !== null && now - g.heard >= POLL_START_MS && now - g.upAt >= KIT_GUARD_MS) || now - g.upAt >= KIT_READ_MS + POLL_START_MS : !g.everUp && now - since >= NEVER_UP_MS;
        if (name === 'speed' && open !== g.open && g.said++ < 6) {
            this.log.info('Vehicle2 getter: ' + (open ? (up ? 'read from now on' : 'the head unit has not said in ' + NEVER_UP_MS / 1000 + ' s whether the car\'s service is up: read anyway') :
                'not read while the car\'s service is down') + (g.said === 6 ? ' (not logged again)' : ''));
        }
        g.open = open;
        return open;
    }

    /** Every 50 ms: may the getters be read; the speed getter's period may have become shorter; the CDS2 getters are read only to top up. */
    tick() {
        const now = this.now();
        // (for Demo data "Auto": the car is there once its speed service says it is up, or a speed sample has arrived)
        const v2 = this.subs.vehicle2.sub;
        if (v2 && v2.available) this.session.carSeen = true;
        const open = this._gate('speed', now);
        if (open && !this.polling) { this.speedPoll.start(); this.polling = true; }
        if (!open && this.polling) { this.speedPoll.stop(); this.polling = false; }
        if (this.polling) this.speedPoll.kick();
        let want = false;
        try {
            const any = ['lat', 'long', 'yaw'].map((k) => this._gate(k, now)).some(Boolean);
            want = this.session.topUp.update(now, this.session.live.speed) && any && this.subs.cds2.state === 'ok';
        } catch (e) { this._oops('top-up', e); }
        if (want && !this.topping) {
            this.topping = true; this.cdsPoll.start();
            // (said the first three times: a car may go back and forth all day)
            if (this.topSaid++ < 3) this.log.info('CDS2: fewer than 8 notifications a second of ' + this.session.topUp.wanted().join(', ') + ' while the car moves, reading the getter as well' + (this.topSaid === 3 ? ' (not logged again)' : ''));
        } else if (!want && this.topping) {
            this.topping = false; this.cdsPoll.stop();
            if (this.topSaid <= 3) this.log.info('CDS2: its getters are left alone again');
        }
    }

    stop() { this.speedPoll.stop(); this.cdsPoll.stop(); this.polling = false; this.topping = false; }

    /* ---------- the sources ---------- */

    _speed(series, t, v, took) {
        const raw = v && typeof v === 'object' ? v[this.sp.member] : undefined;
        this._raw(series === 'polled' ? 'speed (getter)' : 'speed (notified)', () => (isNum(raw) ? raw + (raw === this.sp.invalid ? ' = no value' : ' = ' + (raw * this.sp.factor + this.sp.offset).toFixed(2) + ' km/h') : text(v)) +
            (isNum(took) ? ', the read took ' + Math.round(took) + ' ms' : ''));
        this.session.note(series === 'polled' ? 'speedP' : 'speedN', shown(raw));
        // (the field is 16 bits: anything else is not a speed; nor is anything above 500 km/h)
        if (count16(raw) !== null) this.session.seen(series === 'polled' ? 'speedP' : 'speedN', t);
        if (!isNum(raw) || raw === this.sp.invalid || raw < 0 || raw > 65535) { this.counts.noValue++; return; }
        const kmh = raw * this.sp.factor + this.sp.offset;
        if (!(kmh >= 0 && kmh <= SPEED_MAX_KMH)) { this.counts.noValue++; return; }
        this.session.speed(series, t, kmh, took);
    }

    /** which: 'lat' | 'long'. notified: it was notified, not read by the top-up. */
    _accel(which, t, v, notified) {
        const c = this.ac[which], raw = v && typeof v === 'object' ? v[c.member] : undefined;
        this._raw((which === 'lat' ? 'sideways' : 'forward') + ' acceleration' + (notified ? '' : ' (getter)'), () => (isNum(raw) ? raw + (raw === c.invalid ? ' = no value' : ' = ' + (raw * c.factor + c.offset).toFixed(3) + ' m/s2') : text(v)));
        this.session.note(which, shown(raw));
        if (count16(raw) !== null) this.session.seen(which, t);
        if (notified) this.session.topUp.notified(which, t);
        if (!isNum(raw) || raw === c.invalid || raw < 0 || raw > 65535) { this.counts.noValue++; return; }
        const a = raw * c.factor + c.offset;
        // (the field reaches from -65 to +66 m/s2; more than 3 g either way is not a car's acceleration)
        if (Math.abs(a) > ACCEL_MAX) { this.counts.noValue++; return; }
        if (which === 'lat') this.session.lat(t, a); else this.session.long(t, a);
    }

    /** key: 'cds2' | 'chassis'. The raw count goes on as it is: the engine knows the ends of its range (angle.js). */
    _yaw(key, t, v, notified) {
        const raw = count16(member(v, MEMBER.yaw));
        this._raw('yaw rate, ' + (key === 'cds2' ? 'CDS2' : 'chassis') + (notified ? '' : ' (getter)'), () => text(v));
        this.session.note(key === 'cds2' ? 'yawC' : 'yawS', shown(raw));
        if (key === 'cds2' && notified) this.session.topUp.notified('yaw', t);
        if (raw === null) { this.counts.noValue++; return; }
        this.session.seen(key === 'cds2' ? 'yawC' : 'yawS', t);
        this.session.yaw(key, t, raw);
    }

    _steer(key, meter, name, v) {
        const raw = count16(member(v, name));
        this._raw('steering, ' + key, () => text(v));
        this.session.note(meter, shown(raw));
        if (raw === null) { this.counts.noValue++; return; }
        this.session.seen(meter, this.now());
        this.session.steer(key, this.now(), raw);
    }

    /** The four raw wheel values: { fl, fr, rl, rr }, null where the car sends "no value" (65534, 65535) or nothing. */
    _wheels(v) {
        const w = {};
        Object.keys(MEMBER.wheels).forEach((k) => { const x = member(v, MEMBER.wheels[k]); w[k] = isNum(x) && x >= 0 && x < 65534 ? x : null; });
        this._raw('wheel speeds', () => text(v));
        this.session.note('wheels', ['fl', 'fr', 'rl', 'rr'].map((k) => (w[k] === null ? '--' : w[k])).join(' '));
        if (v && typeof v === 'object') this.session.seen('wheels', this.now());
        this.session.wheels(this.now(), w);
    }

    /** A study-only value: its named members as they came, for the Signals page and the log. Used for nothing. */
    _study(key, name, v) {
        this._raw(name, () => text(v) + ' (shown raw, used for nothing)');
        if (v && typeof v === 'object') this.session.seen(key, this.now());
        this.live.study[key] = STUDY[key].map((m) => [m[0], shown(member(v, m[1]), STUDY_MAX)]);
    }

    _nmea(v) {
        const t = this.now(), s = v && typeof v.nmeaString === 'string' ? v.nmeaString : typeof v === 'string' ? v : null;
        if (s !== null) this.session.seen('nmea', t);
        const p = this.session.nmea(t, s);
        // (only the sentences' kinds and what was read out of them: the sentences themselves hold the position and the course)
        const kinds = s ? (s.match(/\$[A-Z]{5}/g) || []).slice(0, 12).join(' ') : '';
        this.live.kinds = kinds || this.live.kinds;
        this._raw('GPS sentences', () => (s === null ? 'no text in the event (members: ' + Object.keys(v && typeof v === 'object' ? v : {}).slice(0, 8).join(', ') + ')' : (kinds || 'no sentence') + '; ' + p.ok + ' good, ' + p.bad + ' with a wrong checksum' +
            p.rmc.map((r) => '; RMC ' + (r.valid ? 'valid' : 'void') + (r.kmh === null ? '' : ', ' + r.kmh.toFixed(2) + ' km/h' + (r.coarse ? ' (whole knots: not used)' : ''))).join('')));
    }

    /* ---------- for the Signals page ---------- */

    /** [{ key, label, state: 'ok' | 'wait' | 'missing' | 'error', optional }] in the order of the page. */
    status() {
        return SOURCES.map((s) => ({ key: s[0], label: s[1], state: this.subs[s[2]].state, optional: !!INTERFACES[s[2]].optional }));
    }
}

module.exports = { CarSide, INTERFACES, SOURCES, MEMBER, STUDY, GETTER, READ_TIMEOUT_MS, POLL_START_MS, KIT_GUARD_MS, KIT_READ_MS, NEVER_UP_MS };
