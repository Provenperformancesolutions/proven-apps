'use strict';
/**
 * car.js - Proven Drift: the car side, after Proven Drag's car.js. It subscribes to the car's signals and
 * hands every sample to the session with the time it arrived.
 * READ ONLY: nothing here writes a field, calls a method or opens the diagnostic link. What leaves the
 * app is: subscriptions (signals.watch, signals.on) and, only with the setting "Ask the car for values"
 * on, getter reads (getValue) of the speed and of CDS2's yaw rate and two accelerations. It never touches
 * DSC, traction control, the handbrake or any driving setting: it reads the DSC button's state and the
 * handbrake's (each only with its setting on), and that is all it has to do with them.
 *
 *   const car = new CarSide({ signals, log, session, settings, scaling, now });
 *   car.start();               subscribe to what is wanted (a failed subscription is tried again after 5, 15 and 60 s)
 *   car.apply()                a setting changed: subscribe to what is wanted now and is not subscribed yet
 *   car.tick(now)              every 50 ms: may the getters be read (never, as shipped)
 *   car.status()               for the Signals and Study tabs: per source { key, label, state, group, off }
 *   car.live                   the study-only raw values
 *   car.counts                 { arrived: every value any subscription handed over, noValue }
 *   car.reads()                { asked, answered }: the app's own getter reads
 *   car.setup()                { want, ok, failed, wait, bad }: interfaces wanted, set up, failed, and which wait or failed
 *   car.onSetup = fn           called whenever a subscription changes its state (asked, set up, failed, one more field or
 *                              the event asked or answered): main.js takes a note for the record of starts and stops then
 *
 * CORE AND EXTRAS (1.0.1, after the first car: proven/CHANGES-drift.md part 9). On the first car the app
 * closed by itself, and Proven Gauges and Proven Warm-Up did not. So as shipped this app now asks nothing
 * of the car that apps known to run on cars do not also ask:
 *   CORE, always subscribed. What the angle, the score, the flags and the steering check need:
 *     Vehicle2 statusCarSpeed2                       "rs" (many apps of the kit, Proven Gauges, Proven Warm-Up)
 *     CDS2 statusLateralAccelerationMassCenter,
 *          statusLongitudinalAccelerationMassCenter  "rs" (the kit's G-Force, M Vitals, Redline; Proven Gauges)
 *     CDS2 statusYawVelocityVehicle                  "rs" (the kit's Live Data and Live Adjustments)
 *     SteeringAngle ActualSteeringAngleDriver,
 *          actualSteeringAngleDriverNoCRC            "s"  (the kit's Live Data and Live Adjustments subscribe
 *                                                    to both names and take whichever arrives; so does this)
 *   EXTRAS, each group behind a Workshop setting that is OFF as shipped (GROUPS below). A group that is off
 *   is not subscribed at all, and no proxy is built for an interface none of whose fields is wanted.
 *     gpsOn      the GPS receiver's event (SatellitePositioning updatePosition): the GPS check of the speed
 *     wheelsOn   Powertrain ActualValueRPMWheel: rear wheelspin, and learning's check that the wheels grip. On the
 *                first car the four values arrive in a form nobody expected (65407 standing still): they are shown
 *                raw, and reach the engine only once they have proven themselves (session.js, rawstudy.js)
 *     sourcesOn  the sources of a core value that no app of the kit reads: SteeringAngle
 *                SteeringAngleFrontAxleEffective, XView's two steering angles, SpeedAcceleration YawSpeedVehicle
 *     pedalOn    AcceleratorPedal AngleAcceleratorPedal, CDS statusHandBrake (no flag and no score needs them).
 *                The pedal is shown RAW on the Signals tab and used for nothing: on the first car its percentage
 *                jumped about, so its form is not known, and no percentage is shown anywhere (rawstudy.js)
 *     studyOn    DrivingVector (two fields), MDrive statusDriftLast / statusDriftBest, FES statusDSCSwitchHMI
 *   A group set to ON is subscribed at once: on the interface's proxy if there is one (signals.on), else
 *   with a new one (signals.watch). A group set to OFF is no longer used from that moment (its handlers hand
 *   nothing on, its rows say "switched off"); the subscription itself ends with the next start of the app,
 *   because the kit has no call that ends one subscription and shutting a proxy down is something no app
 *   here has ever done on a car.
 *   THE APP'S OWN GETTER READS ("Ask the car for values", askCar, OFF as shipped): with it off the two
 *   schedulers below are never made, let alone started, and the app calls getValue never, shown or hidden.
 *   With it on they run as in 1.0.0, except: never while the app's screen is hidden, never before every
 *   subscription wanted has been set up, and never while one is being tried again (the investigators'
 *   prototype, checks/crash-native/proto). A setting switched on while the app runs: both schedulers are
 *   stopped in that same moment (not at the next 50 ms tick: a read could begin in between), and the new
 *   subscription's first call to the car waits until no read of the app's own is still on its way (a read is
 *   asked to give up after 1 s; the wait ends after 1.25 s whatever happens). The kit's own first read of the
 *   four "rs" fields is not ours to
 *   switch: it is what every app of the kit does, and it is how a standing car's speed is known at all.
 *
 * WHAT IT ASSUMES ABOUT THE CAR (public reports, a head unit's interface catalogue, and what the first car
 * showed through Proven Drag: its speed is notified 47 to 50 times a second while it changes, and not at
 * all while it holds still)
 *   - No sample carries a time: each is stamped when its handler runs, on the forward-only clock.
 *   - The kit's signals.watch() reads the getter of every "rs" field once itself whenever the car's service
 *     comes up, and hands the answer to the same handler as a notification. Two reads of one field must not
 *     be in flight together. So, with askCar on, a getter is not read by the app while the kit says its
 *     service is down, and after it came up only once the service has been up for 1 s and 300 ms have passed
 *     since the first value of that field arrived through its handler, or 3.3 s after it came up if nothing
 *     arrived (the kit's read allows 3 s). A head unit whose binding never says "up" is read anyway from
 *     10 s after the subscription. (All as Proven Drag.)
 *   - Raw 65535 in the speed and the accelerations is the car's "no value": such a sample is counted and
 *     not used. Neither is an acceleration beyond 30 m/s2 either way. The yaw rate and the steering are
 *     handed on raw, 65535 and all: their scale is not known here, and the engine deals with their ends
 *     (angle.js).
 *   - The members read are named in MEMBER below, as the catalogue of one head unit has them. A value
 *     that does not have its member is no value: the Signals tab then says "arrives, not readable" and names
 *     the members it did have. The "qualifier" members some of these values carry are not read.
 *   - THE STEERING WHEEL'S ANGLE arrives under two field names. Whichever of them first delivers a usable
 *     value feeds the engine for as long as the app runs; the other is counted and shown, not used (the
 *     same value twice would be two samples of one moment).
 *   - NO DECODING GUESS: a steering or yaw value is shown as it came (the Signals tab: now, lowest, highest)
 *     and used only where it is a plain count from 0 to 65535. What form the first car sends is not known.
 *   - The handbrake's two states are read as the kit's own Live Data app reads them (released / applied,
 *     by name or by number 1 / 2); anything else is "not known".
 *   - STUDY ONLY: the car's own motion estimate (DrivingVector), BMW's own drift analyser of some M cars
 *     (MDrive statusDriftLast, statusDriftBest) and the DSC button's state are shown raw on the Study
 *     tab and logged. They enter no angle and no score, and controlDisplayDrift is never asked for.
 *   - A SUBSCRIPTION TRIED AGAIN builds a new proxy; the old one's handlers are told apart by the number of
 *     their attempt and hand nothing on, so no value is ever handled twice.
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
    steering: { iface: 'de.bmw.chassis.SteeringAngle', instance: '1', name: 'SteeringAngle', optional: 'no steering check and no opposite lock, unless "Other steering and yaw" is switched on and XView gives the steering' },
    speedaccel: { iface: 'de.bmw.chassis.SpeedAcceleration', instance: '1', name: 'SpeedAcceleration', optional: 'no second source of the yaw rate' },
    xview: { iface: 'de.bmw.infotainment.drivingexcitement.XView', instance: '1', name: 'XView', optional: 'no second source of the steering' },
    pedal: { iface: 'de.bmw.powertrain.AcceleratorPedal', instance: '1', name: 'AcceleratorPedal', optional: 'the accelerator pedal\'s raw value is not shown (study only)' },
    powertrain: { iface: 'de.bmw.powertrain.Powertrain', instance: '1', name: 'Powertrain', optional: 'no rear wheelspin, and learning cannot check that the rear wheels grip' },
    cds: { iface: 'de.bmw.infotainment.vehicle.CDS', instance: '1', name: 'CDS', optional: 'the handbrake is not known' },
    fes: { iface: 'de.bmw.infotainment.drivingexcitement.FES', instance: '1', name: 'FES', optional: 'the DSC button state is not shown' },
    drivingvector: { iface: 'de.bmw.chassis.DrivingVector', instance: '1', name: 'DrivingVector', optional: 'the car\'s own motion estimate is not shown (study only)' },
    mdrive: { iface: 'de.bmw.infotainment.misc.MDrive', instance: '1', name: 'MDrive', optional: 'BMW\'s own drift analyser is not shown (study only)' },
    satellite: { iface: 'de.bmw.infotainment.SatellitePositioning', instance: '1', name: 'SatellitePositioning', optional: 'no GPS speed to check the car\'s speed against' },
};
/**
 * The groups of extras: the setting's key, a short word for it (the Signals tab's "on: GPS, wheels", the log), and
 * its name as Settings has it. "askCar" is the app's own getter reads: no subscription, but listed with the rest.
 * (The words are short on purpose: with all six on, "on: own reads, GPS, wheels, other sources, pedal, study" still
 * leaves a line of the record room for its note.)
 */
const GROUPS = {
    askCar: { word: 'own reads', name: 'Ask the car for values' },
    gpsOn: { word: 'GPS', name: 'GPS receiver' },
    wheelsOn: { word: 'wheels', name: 'Wheel speeds' },
    sourcesOn: { word: 'other sources', name: 'Other steering and yaw' },
    pedalOn: { word: 'pedal', name: 'Pedal and handbrake' },
    studyOn: { word: 'study', name: 'Car estimate and analyser' },
};
/** What is subscribed on each interface: [field, group ('core': always)]. EVENT: the one event, with its group. */
const FIELDS = {
    vehicle2: [['statusCarSpeed2', 'core']],
    cds2: [['statusLateralAccelerationMassCenter', 'core'], ['statusLongitudinalAccelerationMassCenter', 'core'], ['statusYawVelocityVehicle', 'core']],
    steering: [['ActualSteeringAngleDriver', 'core'], ['actualSteeringAngleDriverNoCRC', 'core'], ['SteeringAngleFrontAxleEffective', 'sourcesOn']],
    speedaccel: [['YawSpeedVehicle', 'sourcesOn']],
    xview: [['statusFrontAxleSteeringAngle', 'sourcesOn'], ['statusSteeringAngleDriver', 'sourcesOn']],
    pedal: [['AngleAcceleratorPedal', 'pedalOn']],
    cds: [['statusHandBrake', 'pedalOn']],
    powertrain: [['ActualValueRPMWheel', 'wheelsOn']],
    fes: [['statusDSCSwitchHMI', 'studyOn']],
    drivingvector: [['ActualVectorVehicleMove', 'studyOn'], ['VehicleDynamicDataEstimatedVerified', 'studyOn']],
    mdrive: [['statusDriftLast', 'studyOn'], ['statusDriftBest', 'studyOn']],
    satellite: [],
};
const EVENT = { satellite: ['updatePosition', 'gpsOn'] };
/**
 * The rows of the Signals tab and (page 'study') of the Study tab: source key (the session's meters), label, the
 * interface it comes from, its group.
 */
const SOURCES = [
    ['speedN', 'Speed, notified', 'vehicle2', 'core'],
    ['lat', 'Sideways acceleration', 'cds2', 'core'], ['long', 'Forward acceleration', 'cds2', 'core'],
    ['yawC', 'Yaw rate, CDS2', 'cds2', 'core'],
    ['steerD', 'Steering wheel, chassis', 'steering', 'core'], ['steerD2', 'Steering wheel, NoCRC', 'steering', 'core'],
    ['yawS', 'Yaw rate, chassis', 'speedaccel', 'sourcesOn'],
    ['steerF', 'Front wheels, chassis', 'steering', 'sourcesOn'], ['steerXF', 'Front wheels, XView', 'xview', 'sourcesOn'],
    ['steerXD', 'Steering wheel, XView', 'xview', 'sourcesOn'],
    ['pedal', 'Accelerator pedal', 'pedal', 'pedalOn'], ['hb', 'Handbrake', 'cds', 'pedalOn'],
    ['wheels', 'Wheel speeds', 'powertrain', 'wheelsOn'],
    ['speedP', 'Speed, getter', 'vehicle2', 'askCar', 'study'], ['nmea', 'GPS sentences', 'satellite', 'gpsOn', 'study'],
    ['dsc', 'DSC button', 'fes', 'studyOn', 'study'],
    ['move', 'Car\'s motion estimate', 'drivingvector', 'studyOn', 'study'], ['est', 'The same, verified', 'drivingvector', 'studyOn', 'study'],
    ['mLast', 'BMW drift analyser, last', 'mdrive', 'studyOn', 'study'], ['mBest', 'BMW drift analyser, best', 'mdrive', 'studyOn', 'study'],
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
/** The study-only values: the members shown, with the word the Study tab puts before each. */
const STUDY = {
    move: [['angle', 'actualValueAttitudeAngleVehicleMove'], ['curvature', 'actualValueCurvatureVehicleMove'], ['qualifier', 'qualifierActualValueAttitudeAngleVehicleMove']],
    est: [['angle', 'attitudeAngleEstimated'], ['error', 'attitudeAngleEstimatedErrorAmplitude'], ['qualifier', 'qualifierVehicleDynamicsDataEstimated']],
    mLast: [['angle', 'statusDriftAttitudeAngleAverageLast'], ['distance', 'statusDriftDistanceLast'], ['time', 'statusDriftDurationLast'], ['stars', 'statusDriftStarsLast'], ['of', 'statusDriftStarsLastMaxPossible']],
    mBest: [['angle', 'statusDriftAttitudeAngleAverageBest'], ['distance', 'statusDriftDistanceBest'], ['time', 'statusDriftDurationBest'], ['stars', 'statusDriftStarsBest'], ['of', 'statusDriftStarsBestMaxPossible']],
};
/** The handbrake's state, as the kit's Live Data app reads it (apps/live_data/signals.js): by name or by number. */
const HANDBRAKE = { HANDBREMSE_ANGEZOGEN: true, HANDBREMSE_GELOEST: false, 2: true, 1: false };
/** The getters the app reads itself, with "Ask the car for values" on: the interface and the field of each. */
const GETTER = {
    speed: ['vehicle2', 'statusCarSpeed2'],
    lat: ['cds2', 'statusLateralAccelerationMassCenter'], long: ['cds2', 'statusLongitudinalAccelerationMassCenter'], yaw: ['cds2', 'statusYawVelocityVehicle'],
};
const RETRY_MS = [5000, 15000, 60000];
const RAW_LINES = 10;              // raw values logged per source
const READ_TIMEOUT_MS = 1000;      // a getter read is asked to give up after this
const LAND_EXTRA_MS = 250;         // a new subscription waits for a read that is on its way: this much longer than that, and no longer
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
/** What a value that lacks its member did have, for the Signals tab: "has: name, name" (letters, digits and commas only). */
const others = (v) => (v && typeof v === 'object' ? 'has: ' + (Object.keys(v).slice(0, 3).join(', ').replace(/[^A-Za-z0-9, ]/g, '') || 'nothing') : '--');

class CarSide {
    /** o: { signals (the kit's ctx.signals), log, session, settings (the kit's), scaling (app.json config.scaling), now() } */
    constructor(o) {
        this.signals = o.signals; this.log = o.log; this.session = o.session; this.now = o.now;
        this.settings = o.settings || (o.session && o.session.settings) || { get() { return undefined; } };
        const sc = o.scaling || {};
        this.sp = Object.assign({ factor: 0.015625, offset: 0, invalid: 65535, member: 'speedVehicleCentreOfGravity' }, sc.speed);
        this.ac = {
            lat: Object.assign({ factor: 0.002, offset: -65, invalid: 65535, member: 'lateralAccelerationCentreOfGravity' }, sc.lat),
            long: Object.assign({ factor: 0.002, offset: -65, invalid: 65535, member: 'longitudinalAccelerationCentreOfGravity' }, sc.long),
        };
        // interface key -> { state: 'off' (not asked for) | 'wait' | 'ok' | 'missing' | 'error', error, sub, asked: { field: true },
        //   event: asked for, attempt: the number of the latest subscription attempt, tries, retrying, adding: subscriptions under way }
        this.subs = {};
        Object.keys(INTERFACES).forEach((k) => { this.subs[k] = { state: 'off', error: null, sub: null, asked: {}, event: false, attempt: 0, tries: 0, retrying: false, adding: 0 }; });
        // when a getter may be read (see the top): per getter { up, everUp, upAt, heard, open }; per interface: subscribed at
        this.gates = {}; this.since = {};
        Object.keys(GETTER).forEach((k) => { this.gates[k] = { up: false, everUp: false, upAt: null, heard: null, open: false, said: 0 }; });
        this.rawN = {}; this.errN = {}; this.missN = {};
        this.live = { study: {}, kinds: '' };
        this.counts = { noValue: 0, arrived: 0 };
        this.driverFrom = null;         // which of the steering wheel's two field names feeds the engine ('steerD' | 'steerD2')
        this.handlers = null;
        // the two getter schedulers: made only when "Ask the car for values" is first on (_pollers)
        this.speedPoll = null; this.cdsPoll = null;
        this.polling = false; this.topping = false; this.topSaid = 0; this.askSaid = null;
        // the app's own getter reads that are on their way to the car right now, and the subscriptions that wait for them
        this.flying = 0; this.waiting = []; this.landTimer = null;
        this.onSetup = null;
    }

    /** A subscription changed its state: whoever keeps the record of starts and stops is told (never a throw from there). */
    _changed() { try { if (this.onSetup) this.onSetup(); } catch (e) { this._oops('set-up note', e); } }

    /** Is a group in use right now: the core always, an extra while its setting is on. */
    uses(group) { return group === 'core' || this.settings.get(group) === true; }

    /** The two getter schedulers, made on first need (never, as shipped). */
    _pollers() {
        if (this.speedPoll) return;
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

    /**
     * A handler of one field (or of the event) of interface `key`, made for subscription attempt `attempt`. It cannot
     * throw into the kit (the kit would log every single time); it hands nothing on once a later attempt has taken
     * over, nor while its group is switched off.
     */
    _handler(key, attempt, group, what, fn) {
        const st = this.subs[key];
        return (v) => {
            try {
                if (st.attempt !== attempt) return;
                this.counts.arrived++;
                if (!this.uses(group)) return;
                fn(v);
            } catch (e) { this._oops(what, e); }
        };
    }

    /* ---------- what each field does with a value ---------- */

    /** interface key -> { field: [group, what (for the log), fn(value)] } */
    _plan() {
        const S = this.session;
        return {
            vehicle2: { statusCarSpeed2: ['core', 'speed', (v) => { this._heard('speed'); this._speed('notified', this.now(), v); }] },
            cds2: {
                statusLateralAccelerationMassCenter: ['core', 'sideways acceleration', (v) => { this._heard('lat'); this._accel('lat', this.now(), v, true); }],
                statusLongitudinalAccelerationMassCenter: ['core', 'forward acceleration', (v) => { this._heard('long'); this._accel('long', this.now(), v, true); }],
                statusYawVelocityVehicle: ['core', 'yaw rate', (v) => { this._heard('yaw'); this._yaw('cds2', this.now(), v, true); }],
            },
            steering: {
                ActualSteeringAngleDriver: ['core', 'steering wheel', (v) => this._steer('driver', 'steerD', MEMBER.driver, v)],
                actualSteeringAngleDriverNoCRC: ['core', 'steering wheel, NoCRC', (v) => this._steer('driver', 'steerD2', MEMBER.driver, v)],
                SteeringAngleFrontAxleEffective: ['sourcesOn', 'front wheels', (v) => this._steer('front', 'steerF', MEMBER.front, v)],
            },
            speedaccel: { YawSpeedVehicle: ['sourcesOn', 'yaw rate, chassis', (v) => this._yaw('chassis', this.now(), v, true)] },
            xview: {
                statusFrontAxleSteeringAngle: ['sourcesOn', 'front wheels, XView', (v) => this._steer('xfront', 'steerXF', MEMBER.front, v)],
                statusSteeringAngleDriver: ['sourcesOn', 'steering wheel, XView', (v) => this._steer('xdriver', 'steerXD', MEMBER.driver, v)],
            },
            // (study only: shown raw, used for nothing. No percentage is worked out: the value's form is not known)
            pedal: { AngleAcceleratorPedal: ['pedalOn', 'accelerator pedal', (v) => {
                const x = member(v, MEMBER.pedal);
                this._raw('accelerator pedal', () => text(v) + ' (shown raw, used for nothing)');
                S.note('pedal', x === undefined ? others(v) : shown(x));
                S.span('pedal', x);
                if (isNum(v) || (v && typeof v === 'object')) S.seen('pedal', this.now());
                S.pedal(this.now(), v, MEMBER.pedal);
            }] },
            powertrain: { ActualValueRPMWheel: ['wheelsOn', 'wheels', (v) => this._wheels(v)] },
            cds: { statusHandBrake: ['pedalOn', 'handbrake', (v) => {
                const x = member(v, MEMBER.hb), on = Object.prototype.hasOwnProperty.call(HANDBRAKE, String(x)) ? HANDBRAKE[String(x)] : null;
                this._raw('handbrake', () => text(v) + ' = ' + (on === true ? 'applied' : on === false ? 'released' : 'not known'));
                S.note('hb', shown(x) + (on === true ? ' = ON' : on === false ? ' = OFF' : ''));
                if (v && typeof v === 'object') S.seen('hb', this.now());
                S.hb(this.now(), on);
            }] },
            fes: { statusDSCSwitchHMI: ['studyOn', 'DSC button', (v) => {
                this._raw('DSC button', () => text(v) + ' (shown raw, used for nothing)');
                if (v && typeof v === 'object') S.seen('dsc', this.now());
                S.note('dsc', shown(member(v, MEMBER.dsc)));
            }] },
            drivingvector: {
                ActualVectorVehicleMove: ['studyOn', 'the car\'s motion estimate', (v) => this._study('move', 'the car\'s motion estimate', v)],
                VehicleDynamicDataEstimatedVerified: ['studyOn', 'the car\'s motion estimate, verified', (v) => this._study('est', 'the car\'s motion estimate, verified', v)],
            },
            mdrive: {
                statusDriftLast: ['studyOn', 'BMW drift analyser', (v) => this._study('mLast', 'BMW drift analyser, last', v)],
                statusDriftBest: ['studyOn', 'BMW drift analyser', (v) => this._study('mBest', 'BMW drift analyser, best', v)],
            },
            satellite: {},
        };
    }

    /* ---------- subscribing ---------- */

    start() {
        this.plan = this._plan();
        const off = Object.keys(GROUPS).filter((g) => !this.uses(g)).map((g) => GROUPS[g].word), on = Object.keys(GROUPS).filter((g) => this.uses(g)).map((g) => GROUPS[g].word);
        this.log.info('signals: the core (speed, accelerations, CDS2\'s yaw rate, the steering wheel\'s angle)' + (on.length ? ', and switched on in Settings: ' + on.join(', ') : '') + (off.length ? '. Switched off: ' + off.join(', ') : ''));
        this.apply();
    }

    /** The fields of an interface that are wanted now, and whether its event is. */
    _wanted(key) {
        return { fields: FIELDS[key].filter((f) => this.uses(f[1])).map((f) => f[0]), event: !!EVENT[key] && this.uses(EVENT[key][1]) };
    }

    /**
     * Subscribe to what is wanted now and not asked for yet (at the start, when a setting was switched on, and when
     * a subscription attempt has settled). Nothing is ever taken back here: see the top.
     */
    apply() {
        if (!this.plan) return;
        // what is to be asked for now: [interface key, 'watch' | 'more' | 'event', field]
        const todo = [];
        Object.keys(INTERFACES).forEach((key) => {
            try {
                const st = this.subs[key], w = this._wanted(key);
                if (!w.fields.length && !w.event) return;               // nothing of it is wanted: no proxy is built
                if (st.state === 'off') { todo.push([key, 'watch']); return; }
                if (st.state !== 'ok' || !st.sub || !st.sub.proxy) return;   // under way, tried again later, or not there: the attempt takes what is wanted then
                w.fields.filter((f) => !st.asked[f]).forEach((f) => todo.push([key, 'more', f]));
                if (w.event && !st.event) todo.push([key, 'event']);
            } catch (e) { this._oops('subscribe ' + INTERFACES[key].name, e); }
        });
        if (!todo.length) return;
        // The app's own getter reads stop HERE, before anything new is asked of the car, not at the next 50 ms tick: a
        // read's own timer could fire in between and start one beside the set-up calls. tick() starts them again once
        // every subscription has settled. (As shipped there are no schedulers and this does nothing.)
        if (this.speedPoll) this.stop();
        todo.forEach((x) => {
            try { if (x[1] === 'watch') this._watch(x[0]); else if (x[1] === 'more') this._more(x[0], x[2]); else this._event(x[0]); } catch (e) { this._oops('subscribe ' + INTERFACES[x[0]].name, e); }
        });
    }

    /**
     * -> a promise that is kept once no getter read of the app's own is on its way to the car: at once if none is
     * (always so as shipped, and at the app's start), else when the last one has been answered or has given up (a read
     * is asked to give up after 1 s; if the binding does not even say that, 1.25 s after the first wait began).
     * A read that is already on its way cannot be called back: it is let finish, and the new subscription waits for it.
     */
    _landing() {
        if (this.flying <= 0) return Promise.resolve();
        return new Promise((resolve) => {
            this.waiting.push(resolve);
            if (this.landTimer === null) this.landTimer = setTimeout(() => { this.landTimer = null; this._landed(true); }, READ_TIMEOUT_MS + LAND_EXTRA_MS);
        });
    }

    /** A read has landed (or the wait ran out: force): with none left on its way, the subscriptions that waited go on. */
    _landed(force) {
        if (force) this.flying = 0;
        if (this.flying > 0 || !this.waiting.length) return;
        if (this.landTimer !== null) { clearTimeout(this.landTimer); this.landTimer = null; }
        const run = this.waiting;
        this.waiting = [];
        run.forEach((fn) => { try { fn(); } catch (e) { this._oops('subscribe', e); } });
    }

    _failed(key, why, final) {
        const st = this.subs[key], I = INTERFACES[key];
        st.error = why;
        st.state = /no SOME\/IP config/.test(why) ? 'missing' : 'error';
        const wait = final || st.state === 'missing' ? 0 : RETRY_MS[st.tries++];
        this.log.warn('signal ' + I.name + (st.state === 'missing' ? ': this head unit does not have it' : ' error: ' + why) +
            (I.optional ? ' (optional: ' + I.optional + ')' : key === 'vehicle2' ? ' (NEEDED: without the speed there is no angle)' : ' (NEEDED: without the yaw rate and the sideways acceleration there is no angle)') +
            (wait ? ', trying again in ' + wait / 1000 + ' s' : ', not tried again'));
        st.retrying = !!wait;
        if (wait) setTimeout(() => { try { this._watch(key); } catch (e) { this._oops('subscribe ' + I.name, e); } }, wait);
        this._changed();
    }

    /** One subscription attempt for an interface: a proxy with the fields wanted now (the kit's signals.watch), then its event. */
    _watch(key) {
        const st = this.subs[key], I = INTERFACES[key], w = this._wanted(key);
        // (a failed subscription waiting to be tried again whose extra was switched off meanwhile: nothing of the interface
        // is wanted any more, so no proxy is built for it. Back at "off", a later switch-on asks afresh through apply())
        if (!w.fields.length && !w.event) {
            st.state = 'off'; st.retrying = false;
            this.log.info('signal ' + I.name + ': not tried again (nothing of it is switched on any more)');
            this._changed();
            return;
        }
        const attempt = ++st.attempt;
        const handlers = {};
        w.fields.forEach((f) => { const p = this.plan[key][f]; handlers[f] = this._handler(key, attempt, p[0], p[1], p[2]); });
        st.state = 'wait'; st.retrying = false; st.asked = {}; st.event = false;
        w.fields.forEach((f) => { st.asked[f] = true; });
        this._changed();
        let p;
        // (with a read of the app's own on its way to the car, the proxy is asked for once that read has landed; with
        // none, which is always so as shipped, in this same moment as before)
        if (this.flying > 0) p = this._landing().then(() => this.signals.watch(I.iface, I.instance, handlers, this.log));
        else try { p = Promise.resolve(this.signals.watch(I.iface, I.instance, handlers, this.log)); } catch (e) { p = Promise.reject(e); }
        p.then((sub) => {
            if (attempt !== st.attempt) return;
            if (!sub || sub.error) { this._failed(key, String(sub ? sub.error : 'no answer')); return; }
            st.state = 'ok'; st.error = null; st.sub = sub;
            this.since[key] = this.now();
            this.log.info('signal ' + I.name + ': subscribed' + (st.tries ? ' (try ' + (st.tries + 1) + ')' : ''));
            // (what was switched on while this attempt was under way; and the interface's event)
            this.apply();
            this._changed();
        }).catch((e) => { if (attempt === st.attempt) this._failed(key, String(e && e.message || e)); });
    }

    /** One more field on a proxy that is there already: a setting was switched on (the kit's signals.on, as for an event). */
    _more(key, field) {
        const st = this.subs[key], I = INTERFACES[key], p = this.plan[key][field];
        st.asked[field] = true;
        if (!this.signals.on) { this.log.warn('signal ' + I.name + '.' + field + ': this head unit takes no further subscription'); return; }
        st.adding++;
        const done = () => { st.adding = Math.max(0, st.adding - 1); this._changed(); };
        this._changed();
        this._landing().then(() => this.signals.on(st.sub.proxy, field, this._handler(key, st.attempt, p[0], p[1], p[2]), this.log))
            .then(() => { done(); this.log.info('signal ' + I.name + ': subscribed to ' + field + ' as well (switched on in Settings)'); })
            .catch((e) => { done(); this.log.warn('signal ' + I.name + '.' + field + ' error: ' + (e && e.message || e) + ', not tried again'); });
    }

    /** The interface's event: the GPS receiver's sentences are an event, not a field (a proxy without fields, then the one event). */
    _event(key) {
        const st = this.subs[key], I = INTERFACES[key], ev = EVENT[key];
        st.event = true;
        if (!st.sub.proxy || !this.signals.on) { this._failed(key, 'no event subscription on this head unit', true); return; }
        st.adding++;
        const done = () => { st.adding = Math.max(0, st.adding - 1); this._changed(); };
        this._changed();
        this._landing().then(() => this.signals.on(st.sub.proxy, ev[0], this._handler(key, st.attempt, ev[1], 'GPS sentences', (v) => this._nmea(v)), this.log))
            .then(() => { done(); this.log.info('signal ' + I.name + ': subscribed to the event ' + ev[0]); })
            .catch((e) => { done(); this._failed(key, 'event ' + ev[0] + ': ' + (e && e.message || e), true); });
    }

    /** Has every subscription that is wanted been set up or failed for good, with none being tried again or added? */
    settled() {
        return Object.keys(this.subs).every((k) => { const st = this.subs[k]; return st.state !== 'wait' && !st.retrying && !st.adding; });
    }

    /**
     * How far set-up has got, for the record of starts and stops: { want: interfaces asked for, ok: set up, failed: failed
     * for good or not on this unit, wait: [names of those still being set up or tried again], bad: [names of those failed] }.
     */
    setup() {
        const out = { want: 0, ok: 0, failed: 0, wait: [], bad: [] };
        Object.keys(this.subs).forEach((k) => {
            const st = this.subs[k];
            if (st.state === 'off') return;
            out.want++;
            if (st.state === 'ok' && !st.adding) out.ok++;
            else if (st.state === 'missing' || (st.state === 'error' && !st.retrying)) { out.failed++; out.bad.push(INTERFACES[k].name); } else out.wait.push(INTERFACES[k].name);
        });
        return out;
    }

    /** The app's own getter reads so far: asked, and answered (in time or late). None as shipped. */
    reads() {
        const c = [this.speedPoll, this.cdsPoll].filter(Boolean).map((p) => p.counts);
        return { asked: c.reduce((a, x) => a + x.reads, 0), answered: c.reduce((a, x) => a + x.kept + x.slow, 0) };
    }

    /** One getter read through the proxy watch() returned. It is counted while it is on its way to the car: a subscription asked for meanwhile waits for it (_landing). */
    _read(name) {
        const sub = this.subs[GETTER[name][0]].sub;
        if (!sub || !sub.proxy || typeof sub.proxy.getValue !== 'function') return Promise.reject(new Error('no proxy'));
        const p = Promise.resolve(sub.proxy.getValue(GETTER[name][1], READ_TIMEOUT_MS));
        this.flying++;
        const landed = () => { this.flying = Math.max(0, this.flying - 1); this._landed(false); };
        p.then(landed, landed);
        return p;
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
        g.open = open;
        return open;
    }

    /**
     * Every 50 ms. As shipped ("Ask the car for values" off) this reads nothing and starts nothing. With it on: may
     * the getters be read; the speed getter's period may have become shorter; the CDS2 getters are read only to top up.
     */
    tick() {
        const now = this.now();
        // (for Demo data "Auto": the car is there once its speed service says it is up, or a speed sample has arrived)
        const v2 = this.subs.vehicle2.sub;
        if (v2 && v2.available) this.session.carSeen = true;
        // (the gates are kept up to date either way: they cost a comparison, and say when a getter could be read)
        const speedOpen = this._gate('speed', now), any = ['lat', 'long', 'yaw'].map((k) => this._gate(k, now)).some(Boolean);
        const ask = this.uses('askCar'), env = this.session.env || {};
        if (!ask) {
            this.session.readsHeld = false;
            if (this.polling || this.topping) this.stop();
            if (this.askSaid === true) { this.askSaid = false; this.log.info('"Ask the car for values" switched off: the app reads no getter itself'); }
            return;
        }
        // never while the app's screen is hidden, never before every subscription has been set up, never while one is tried again
        const allow = !env.hidden && this.settled();
        // (session.js: while the reads are held back the engine is on the notified speed, where silence is "no change")
        this.session.readsHeld = !this.settled();
        this._pollers();
        if (this.askSaid !== true) { this.askSaid = true; this.log.info('"Ask the car for values" is on: the app reads the speed getter itself, and CDS2\'s where the car sends too little (only while its screen shows and every subscription is set up)'); }
        const open = speedOpen && allow;
        if (open && !this.polling) {
            this.speedPoll.start(); this.polling = true;
            const g = this.gates.speed;
            if (g.said++ < 6) this.log.info('Vehicle2 getter: ' + (g.up ? 'read from now on' : 'the head unit has not said in ' + NEVER_UP_MS / 1000 + ' s whether the car\'s service is up: read anyway') + (g.said === 6 ? ' (not logged again)' : ''));
        }
        if (!open && this.polling) {
            this.speedPoll.stop(); this.polling = false;
            const g = this.gates.speed;
            if (g.said++ < 6) this.log.info('Vehicle2 getter: not read ' + (env.hidden ? 'while the screen is hidden' : !speedOpen ? 'while the car\'s service is down' : 'while a subscription is being set up') + (g.said === 6 ? ' (not logged again)' : ''));
        }
        if (this.polling) this.speedPoll.kick();
        let want = false;
        try {
            want = this.session.topUp.update(now, this.session.live.speed) && any && this.subs.cds2.state === 'ok' && allow;
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

    stop() {
        if (this.speedPoll) this.speedPoll.stop();
        if (this.cdsPoll) this.cdsPoll.stop();
        this.polling = false; this.topping = false;
        try { this.session.topUp.off(); } catch (e) { /* an older feed.js */ }
    }

    /* ---------- the sources ---------- */

    _speed(series, t, v, took) {
        const raw = v && typeof v === 'object' ? v[this.sp.member] : undefined;
        this._raw(series === 'polled' ? 'speed (getter)' : 'speed (notified)', () => (isNum(raw) ? raw + (raw === this.sp.invalid ? ' = no value' : ' = ' + (raw * this.sp.factor + this.sp.offset).toFixed(2) + ' km/h') : text(v)) +
            (isNum(took) ? ', the read took ' + Math.round(took) + ' ms' : ''));
        this.session.note(series === 'polled' ? 'speedP' : 'speedN', raw === undefined ? others(v) : shown(raw));
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
        this.session.note(which, raw === undefined ? others(v) : shown(raw));
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
        const x = member(v, MEMBER.yaw), raw = count16(x), meter = key === 'cds2' ? 'yawC' : 'yawS';
        this._raw('yaw rate, ' + (key === 'cds2' ? 'CDS2' : 'chassis') + (notified ? '' : ' (getter)'), () => text(v));
        // (shown as it came, whatever its form: the Signals tab is where a first car's form is read off)
        this.session.note(meter, x === undefined ? others(v) : shown(x));
        this.session.span(meter, x);
        if (key === 'cds2' && notified) this.session.topUp.notified('yaw', t);
        if (raw === null) { this.counts.noValue++; return; }
        this.session.seen(meter, t);
        this.session.yaw(key, t, raw);
    }

    _steer(key, meter, name, v) {
        const x = member(v, name), raw = count16(x);
        this._raw('steering, ' + key + (meter === 'steerD2' ? ' (NoCRC)' : ''), () => text(v));
        // (shown as it came: a negative number, a number with decimals, a text. Its lowest and highest in this life beside it)
        this.session.note(meter, x === undefined ? others(v) : shown(x));
        this.session.span(meter, x);
        if (raw === null) { this.counts.noValue++; return; }
        this.session.seen(meter, this.now());
        // the steering wheel's angle has two field names: the first that delivers feeds the engine, the other is only counted
        if (key === 'driver') {
            if (this.driverFrom === null) { this.driverFrom = meter; this.log.info('steering wheel: its angle is taken from ' + (meter === 'steerD2' ? 'actualSteeringAngleDriverNoCRC' : 'ActualSteeringAngleDriver') + ' (the first of the two field names to deliver)'); }
            if (this.driverFrom !== meter) return;
        }
        this.session.steer(key, this.now(), raw);
    }

    /**
     * The four raw wheel values: w = { fl, fr, rl, rr }, null where the car sends "no value" (65534, 65535) or nothing;
     * any = the same four as the numbers came, whatever they are (for the proof and the raw study: session.js).
     */
    _wheels(v) {
        const w = {}, any = {};
        Object.keys(MEMBER.wheels).forEach((k) => { const x = member(v, MEMBER.wheels[k]); any[k] = isNum(x) ? x : null; w[k] = isNum(x) && x >= 0 && x < 65534 ? x : null; });
        this._raw('wheel speeds', () => text(v));
        // (shown as they came, "no value" and all: on the first car all four read 65407 standing still, a form nobody expected)
        this.session.note('wheels', ['fl', 'fr', 'rl', 'rr'].map((k) => { const x = member(v, MEMBER.wheels[k]); return isNum(x) ? shown(x) : '--'; }).join(' '));
        if (v && typeof v === 'object') this.session.seen('wheels', this.now());
        this.session.wheels(this.now(), w, any);
    }

    /** A study-only value: its named members as they came, for the Study tab and the log. Used for nothing. */
    _study(key, name, v) {
        this._raw(name, () => text(v) + ' (shown raw, used for nothing)');
        if (v && typeof v === 'object') this.session.seen(key, this.now());
        this.session.note(key, 'listed at the right');
        this.live.study[key] = STUDY[key].map((m) => [m[0], shown(member(v, m[1]), STUDY_MAX)]);
    }

    _nmea(v) {
        const t = this.now(), s = v && typeof v.nmeaString === 'string' ? v.nmeaString : typeof v === 'string' ? v : null;
        if (s !== null) this.session.seen('nmea', t);
        const p = this.session.nmea(t, s);
        // (only the sentences' kinds and what was read out of them: the sentences themselves hold the position and the course)
        const kinds = s ? (s.match(/\$[A-Z]{5}/g) || []).slice(0, 12).join(' ') : '';
        this.live.kinds = kinds || this.live.kinds;
        this.session.note('nmea', s === null ? 'no text in it' : (s.match(/\$[A-Z]{5}/g) || []).length + ' sentences');
        this._raw('GPS sentences', () => (s === null ? 'no text in the event (members: ' + Object.keys(v && typeof v === 'object' ? v : {}).slice(0, 8).join(', ') + ')' : (kinds || 'no sentence') + '; ' + p.ok + ' good, ' + p.bad + ' with a wrong checksum' +
            p.rmc.map((r) => '; RMC ' + (r.valid ? 'valid' : 'void') + (r.kmh === null ? '' : ', ' + r.kmh.toFixed(2) + ' km/h' + (r.coarse ? ' (whole knots: not used)' : ''))).join('')));
    }

    /* ---------- for the Signals and Study tabs ---------- */

    /**
     * [{ key, label, state: 'off' (switched off in Settings) | 'ok' | 'wait' | 'missing' | 'error', group, page ('study' or
     * undefined), optional }] in the order of the pages. A source whose group is switched off says so, whatever its
     * subscription does (it stays to the next start).
     */
    status() {
        return SOURCES.map((s) => {
            const st = this.subs[s[2]], on = this.uses(s[3]);
            // (the getter's row: its "subscription" is the speed's own; "wait" until the getter is read)
            return { key: s[0], label: s[1], state: !on ? 'off' : st.state === 'off' ? 'wait' : st.state, group: s[3], page: s[4], optional: !!INTERFACES[s[2]].optional };
        });
    }
}

module.exports = { CarSide, INTERFACES, GROUPS, FIELDS, EVENT, SOURCES, MEMBER, STUDY, GETTER, READ_TIMEOUT_MS, POLL_START_MS, KIT_GUARD_MS, KIT_READ_MS, NEVER_UP_MS };
