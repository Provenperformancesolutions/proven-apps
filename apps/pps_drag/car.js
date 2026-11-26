'use strict';
/**
 * car.js - Proven Drag: the car side. It subscribes to the car's signals and hands every sample to the
 * session with the time it arrived. READ ONLY: nothing here writes a field, calls a method or opens the
 * diagnostic link.
 *
 * WHAT LEAVES THE APP AS SHIPPED (since 1.0.2): two subscriptions, and nothing else. Vehicle2
 *   statusCarSpeed2 (the speed) and CDS2 statusLongitudinalAccelerationMassCenter (the acceleration): the
 *   two fields the kit's own Drag Timer (apps/draggy) and Proven Gauges subscribe to on cars, asked for
 *   in the same way. The app makes NO getter read of its own, in any state, shown or hidden: its two
 *   poll schedulers are never started. (The kit reads each of the two fields once itself whenever the
 *   car's service comes up: that read is the kit's, every app that asks for a field with "rs" has it,
 *   and it is how the app learns the speed of a standing car, which notifies nothing.)
 * EVERYTHING ELSE IS AN EXTRA behind a setting that is off as shipped, because on the first car the app
 *   closed by itself and these are what only Proven Drag and Proven Drift did to the car:
 *     askCar    the app reads the speed getter itself on a schedule (and the acceleration's as a fallback).
 *               Even when on: never while the app's screen is hidden, never before every subscription asked
 *               for is set up or has failed for good (the GPS receiver's event included: its interface counts
 *               as set up only once the event is subscribed), never while one is being tried again. And a
 *               subscription that is asked for while the app runs (an extra switched on) waits until no read
 *               of the app's own is still on its way to the car (a read is given up after 1 s)
 *     gps       the GPS receiver's sentences (SatellitePositioning, the event updatePosition): the speed scale
 *     xWheels   the four wheel speeds (Powertrain ActualValueRPMWheel)
 *     xPos      the raw GPS position and height (GPSData), the navigation's position (Positioning)
 *     xStudy    the wheel-travel counters (Vehicle2) and the road gradient (VehicleModel): study only
 *   An extra that is off is not subscribed at all: no proxy is built for an interface whose every field
 *   is off. Switched ON, it is subscribed at once. Switched OFF, its values are dropped at once (the
 *   Signals page says "switched off"); the subscription itself stays until the app is next started,
 *   because ending one would be a call to the car that neither this app nor the kit has ever made there.
 *
 *   const car = new CarSide({ signals, log, session, settings, scaling, now, changed });
 *                              changed(): called whenever a subscription is asked for, set up or has failed, and
 *                              whenever an extra is switched (the record of starts and stops takes a note at once)
 *   car.start();               subscribe (a failed subscription is tried again after 5, 15 and 60 s)
 *   car.setGroup(group, on)    a setting of an extra changed ('gps' | 'wheels' | 'pos' | 'study')
 *   car.tick(now)              every 50 ms: may the getters be read, and how often
 *   car.status()               for the Signals page: per source { label, state, optional, off }
 *   car.setupText(), car.onMap(), car.reads()      for the record of starts and stops (box.js)
 *
 * WHAT IT ASSUMES ABOUT THE CAR (public reports; none of it measured by Proven)
 *   - No sample carries a time: each is stamped when its handler runs, on the forward-only clock.
 *   - The kit's signals.watch() reads every getter once itself whenever the car's service comes up, and
 *     hands the answer to the same handler as a notification. So the first "notified" speed may be that
 *     read. With "Ask the car for values" on, that read is outside the app's poll schedule, and two reads
 *     of one field must not be in flight together. So
 *     a getter is not read by the app while the kit says its service is down, and after it came up only
 *     once the service has been up for 1 s and 300 ms have passed since the first value arrived through
 *     the handler (the kit's read has been answered, or the car notified: the two cannot be told apart,
 *     hence the second), or 3.3 s after it came up if nothing arrived (the kit's read allows 3 s).
 *     The kit may read the getter, and hand over the answer, before its set-up of the subscription has
 *     returned to the app (a binding that says "available" early and answers fast): such a value counts as
 *     the first one once the app sees the service up. Without that a standing car, which notifies nothing,
 *     would read "no new speed" until it first moves, although the app had been told its speed.
 *     A head unit whose binding never says "up" is read anyway from 10 s after the subscription.
 *   - A getter read is asked to give up after 1 s (the kit's own reads allow 3 s). Whether the car's
 *     answer can still arrive after that is not known, so the next read waits until 4 s after such a
 *     read began (feed.js). A getter that never answers is still asked again and again, 15 times a
 *     minute (it may come back, and then it is read at its normal pace again within 4 s): each of those
 *     may be one more request the car has not answered. Nothing the app can do stops that short of
 *     giving the getter up for good.
 *   - Raw 65535 in the speed and the acceleration is the car's "no value": such a sample is counted and
 *     logged, and not used. Neither is an acceleration beyond 30 m/s2 either way (a guess at what no car does).
 *
 * THE LOG (first-car evidence): the first 10 raw values of every source, interfaces that are missing,
 *   getter reads that failed or were too slow. NO POSITION AND NO DIRECTION OF TRAVEL IS EVER LOGGED: of
 *   the two position sources only the member names and whether the position was valid; of the raw GPS
 *   height value its member names and the two members named here (height, speed); of the GPS receiver's
 *   sentences only their kinds and what gpsscale.js reads out of them (speed, fix, satellites, height).
 *   What a line holds is put together member by member (an allow-list): a member this file does not name
 *   is never written out. The height above sea level IS in those raw lines (the first car has to show
 *   whether raw - 32768 is metres); it is not in the saved file.
 */
const { PollScheduler } = require('./feed');
const { rawWheels, rawWheelsAny } = require('./wheels');
const { gpsCanPosition, navPosition, decodeHeightCan } = require('./gpsscale');
const { laneSlope } = require('./slope');

const VEHICLE2 = 'de.bmw.infotainment.vehicle.Vehicle2', CDS2 = 'de.bmw.infotainment.vehicle.CDS2';
const POWERTRAIN = 'de.bmw.powertrain.Powertrain', SATELLITE = 'de.bmw.infotainment.SatellitePositioning';
const GPSDATA = 'de.bmw.infotainment.GPSData', POSITIONING = 'de.bmw.infotainment.navigation.positioning.Positioning';
const VEHICLEMODEL = 'de.bmw.chassis.VehicleModel';
/**
 * The subscriptions. group: null = CORE (always asked for), else the extra it belongs to. optional: what the app
 * loses without an optional interface (as app.json says it to the installer). "travel" is the wheel-travel fields
 * of Vehicle2 asked for on their own: only when the study signals are switched on after the app has started (at
 * a start with them on they are part of Vehicle2's one subscription).
 */
const INTERFACES = {
    vehicle2: { iface: VEHICLE2, instance: '1', name: 'Vehicle2', group: null },
    cds2: { iface: CDS2, instance: '1', name: 'CDS2', group: null },
    powertrain: { iface: POWERTRAIN, instance: '1', name: 'Powertrain', group: 'wheels', optional: 'wheelspin is an estimate, the speed signal is not cross-checked at the launch' },
    satellite: { iface: SATELLITE, instance: '1', name: 'SatellitePositioning', group: 'gps', optional: 'no GPS speed: the speed scale comes from position legs, the height from the raw GPS value' },
    gpsdata: { iface: GPSDATA, instance: '1', name: 'GPSData', group: 'pos', optional: 'position legs use the navigation\'s position, no second source of height' },
    positioning: { iface: POSITIONING, instance: 'Main_Instance', name: 'Positioning', group: 'pos', optional: 'position legs need the raw GPS position' },
    vehiclemodel: { iface: VEHICLEMODEL, instance: '1', name: 'VehicleModel', group: 'study', optional: 'no road gradient on the Signals page' },
    travel: { iface: VEHICLE2, instance: '1', name: 'Vehicle2 (wheel travel)', short: 'wheel travel', group: 'study', optional: 'no wheel-travel counters on the Signals page' },
};
/** The extras, and the setting each is switched with (app.json). */
const GROUPS = { wheels: 'xWheels', pos: 'xPos', study: 'xStudy', gps: 'gps' };
const GROUP_NAME = { gps: 'the GPS receiver\'s sentences', wheels: 'the wheel speeds', pos: 'the positions', study: 'the study signals (wheel travel, road gradient)' };
/**
 * The rows of the Signals page: source key (the session's rate meters), label, the subscription it comes from, the
 * extra it belongs to (null: core; 'ask': the app's own getter reads).
 */
const SOURCES = [
    ['speedN', 'Speed, notified', 'vehicle2', null], ['speedP', 'Speed, getter', 'vehicle2', 'ask'], ['accel', 'Acceleration', 'cds2', null],
    ['wheels', 'Wheel speeds', 'powertrain', 'wheels'], ['travelF', 'Wheel travel, front', 'travel', 'study'], ['travelR', 'Wheel travel, rear', 'travel', 'study'],
    ['nmea', 'GPS sentences', 'satellite', 'gps'], ['gpsPos', 'GPS position, raw', 'gpsdata', 'pos'], ['gpsExt', 'GPS height, raw', 'gpsdata', 'pos'],
    ['navPos', 'Navigation position', 'positioning', 'pos'], ['lane', 'Road gradient', 'vehiclemodel', 'study'],
];
/** How far a subscription has got, in the record's words, in the order they are said. */
const SETUP_WORDS = ['set up', 'asked', 'failed, trying again', 'failed', 'not on this unit'];
const SETUP_WORD = { wait: 'asked', ok: 'set up', missing: 'not on this unit', error: 'failed' };
const RETRY_MS = [5000, 15000, 60000];
const RAW_LINES = 10;              // raw values logged per source
const READ_TIMEOUT_MS = 1000;      // a getter read is asked to give up after this
const POLL_START_MS = 300;         // a getter is read this long after the first value came through its handler (the kit's own read, or a notification) ...
const KIT_GUARD_MS = 1000;         // ... and not before the service has been up this long (the kit's own read may take that long; a slower one is of no use for timing anyway)
const KIT_READ_MS = 3000;          // if no value came at all: this long (plus the 300 ms) after the service came up: the kit's own read allows 3 s
const NEVER_UP_MS = 10000;         // a binding that never says its service is up: the getter is read anyway from this long after the subscription
const SPEED_MAX_KMH = 500;         // above this it is no speed (the engines take the same limit)
const MISS_LINES = 5;              // failed / slow getter reads logged per getter
const ACCEL_MAX = 30;              // m/s2: an acceleration beyond this either way is taken as no value

const isNum = (x) => typeof x === 'number' && isFinite(x);
const text = (v) => { try { return JSON.stringify(v).slice(0, 320); } catch (e) { return String(v); } };
/** The first own number of a value (or the value itself), leaving out the car's housekeeping members. */
function firstNumber(v) {
    if (isNum(v)) return v;
    if (!v || typeof v !== 'object') return null;
    for (const k of Object.keys(v)) if (isNum(v[k]) && !/^(qualifier|crc|alive|dummy)/i.test(k)) return v[k];
    return null;
}

class CarSide {
    /** o: { signals (the kit's ctx.signals), log, session, settings (the kit's ctx.settings), scaling (app.json config.scaling), now() } */
    constructor(o) {
        this.signals = o.signals; this.log = o.log; this.session = o.session; this.now = o.now;
        this.settings = o.settings || { get() { return undefined; } };
        this.changed = typeof o.changed === 'function' ? o.changed : null;
        // the app's own getter reads that are on their way to the car right now; subscriptions waiting for them to land
        this.flying = 0; this.waiting = []; this.quietTimer = null;
        // the extras as the settings have them at this start; asked[g]: its subscriptions were asked for in this life
        this.on = {}; this.asked = {};
        Object.keys(GROUPS).forEach((g) => { this.on[g] = !!this.settings.get(GROUPS[g]); this.asked[g] = false; });
        this.heardN = 0;                // every value and event the car has handed to the app (the record's "values a second")
        this.allowed = null; this.allowSaid = 0;
        const sc = o.scaling || {};
        this.sp = Object.assign({ factor: 0.015625, offset: 0, invalid: 65535, member: 'speedVehicleCentreOfGravity' }, sc.speed);
        this.ac = Object.assign({ factor: 0.002, offset: -65, invalid: 65535, member: 'longitudinalAccelerationCentreOfGravity' }, sc.accel);
        this.subs = {};                 // subscription key -> { state: 'off' (not asked for) | 'wait' | 'ok' | 'missing' | 'error', error, sub, retrying }
        Object.keys(INTERFACES).forEach((k) => { this.subs[k] = { state: 'off', error: null, sub: null, retrying: false }; });
        // when a getter may be read (see the top): per interface { since: subscribed at, up, everUp, upAt, heard, open }
        // (early: a value came through the handler before the kit's set-up had returned to the app)
        const gate = () => ({ since: null, up: false, everUp: false, upAt: null, heard: null, early: false, open: false, told: false, said: 0 });
        this.gates = { vehicle2: gate(), cds2: gate() };
        this.rawN = {}; this.errN = {}; this.missN = {};
        this.live = { travelF: null, travelR: null, lane: null, navValid: 0, navBad: 0, gpsValid: 0, gpsBad: 0, heightRaw: null, speedGps: null, delay: null, kinds: '' };
        this.counts = { noValue: 0 };
        const clock = { now: this.now, setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h) };
        const safe = (fn, dflt) => () => { try { return fn(); } catch (e) { return dflt; } };
        this.speedPoll = new PollScheduler({
            clock, period: safe(() => this.session.speedPeriod(), 50),
            read: () => this._read('vehicle2', 'statusCarSpeed2'), timeoutMs: READ_TIMEOUT_MS,
            onSample: (t, v, took) => this._speed('polled', t, v, took),
            // (a read that was answered too slowly still shows that this car's getter answers: session.js, armedQuiet)
            onMiss: (why, took) => { if (why === 'slow' && this.session.slowRead) this.session.slowRead(); this._miss('speed', why, took); },
            onError: (e) => this._oops('speed getter', e),
        });
        this.accelMs = 0; this.accelSaid = 0;
        this.accelPoll = new PollScheduler({
            clock, period: () => this.accelMs || 100,
            read: () => this._read('cds2', 'statusLongitudinalAccelerationMassCenter'), timeoutMs: READ_TIMEOUT_MS,
            onSample: (t, v) => this._accel(t, v, false),
            onMiss: (why, took) => this._miss('acceleration', why, took),
            onError: (e) => this._oops('acceleration getter', e),
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
     * A handler that cannot throw into the kit (the kit would log every single time). Every call is counted (what
     * the car hands to the app). group: the extra this source belongs to: while that is switched off its values
     * are dropped here, at once, although the subscription is still there until the app is next started.
     */
    _guard(what, group, fn) { return (v) => { this.heardN++; if (group && !this.on[group]) return; try { fn(v); } catch (e) { this._oops(what, e); } }; }

    /** Something about the subscriptions or the extras has changed: tell whoever keeps the record (it can never throw into this file). */
    _changed() { if (this.changed) { try { this.changed(); } catch (e) { this._oops('record', e); } } }

    /* ---------- subscribing ---------- */

    start() {
        const h = (what, group, fn) => this._guard(what, group, fn);
        const travel = () => ({
            statusWheeltravel: h('wheel travel', 'study', (v) => this._travel('travelF', v)),
            statusWheeltravelRear: h('wheel travel', 'study', (v) => this._travel('travelR', v)),
        });
        // (the study signals on at this start: the wheel-travel fields are part of Vehicle2's one subscription)
        this.travelWithSpeed = this.on.study;
        this.plan = {
            vehicle2: {
                handlers: Object.assign({ statusCarSpeed2: h('speed', null, (v) => { this._heard('vehicle2'); this._speed('notified', this.now(), v); }) }, this.travelWithSpeed ? travel() : {}),
                done: () => { this.gates.vehicle2.since = this.now(); },
            },
            cds2: {
                handlers: { statusLongitudinalAccelerationMassCenter: h('acceleration', null, (v) => { this._heard('cds2'); this._accel(this.now(), v, true); }) },
                done: () => { this.gates.cds2.since = this.now(); },
            },
            powertrain: { handlers: { ActualValueRPMWheel: h('wheels', 'wheels', (v) => this._wheels(v)) } },
            gpsdata: { handlers: { GPSPositionCAN: h('GPS position', 'pos', (v) => this._gpsPos(v)), GPSPositionExtendedCAN: h('GPS height', 'pos', (v) => this._gpsExt(v)) } },
            positioning: { handlers: { currentLocation: h('navigation position', 'pos', (v) => this._navPos(v)) } },
            vehiclemodel: { handlers: { LaneSlope: h('road gradient', 'study', (v) => this._lane(v)) } },
            travel: { handlers: travel() },
            // the GPS receiver's sentences are an event, not a field: a proxy without fields, then the one event
            satellite: {
                handlers: {},
                // (a promise: the interface counts as set up only once the event is subscribed, see _watch)
                done: (sub) => {
                    if (!sub.proxy || !this.signals.on) return Promise.reject(new Error('no event subscription on this head unit'));
                    return Promise.resolve().then(() => this.signals.on(sub.proxy, 'updatePosition', h('GPS sentences', 'gps', (v) => this._nmea(v)), this.log))
                        .then(() => this.log.info('signal SatellitePositioning: subscribed to the event updatePosition'), (e) => { throw new Error('event updatePosition: ' + (e && e.message || e)); });
                },
            },
        };
        const on = Object.keys(GROUPS).filter((g) => this.on[g]);
        this.log.info('signals: the speed and the acceleration (core)' + (on.length ? ', and switched on in the settings: ' + on.map((g) => GROUP_NAME[g]).join('; ') : '; every extra is switched off') +
            '; the app\'s own getter reads are ' + (this.settings.get('askCar') ? 'switched on' : 'switched off'));
        this._ask('vehicle2'); this._ask('cds2');
        on.forEach((g) => this._askGroup(g));
        this._changed();
    }

    /**
     * Ask for one subscription, once in the app's life. From this moment it counts as "asked" (tick() then starts
     * no getter read); the set-up itself begins once no read of the app's own is still on its way to the car.
     */
    _ask(key) {
        const st = this.subs[key];
        if (st.state !== 'off') return;
        st.state = 'wait';
        this._quiet(() => this._watch(key, this.plan[key].handlers, this.plan[key].done));
    }

    /**
     * Run fn once no getter read of the app's own is in flight: at once if none is (always so as shipped, and at
     * the app's start), else when the last one has been answered or given up (a read is asked to give up after
     * 1 s; if the binding does not even say that, after 1.25 s). The two schedulers are stopped at once, so that
     * no new read begins in between.
     */
    _quiet(fn) {
        if (this.flying <= 0) { fn(); return; }
        this._hush();
        this.waiting.push(fn);
        if (this.quietTimer === null) this.quietTimer = setTimeout(() => { this.quietTimer = null; this._landed(true); }, READ_TIMEOUT_MS + 250);
    }

    /** Stop both schedulers now (tick() starts them again when reads are allowed). */
    _hush() {
        this.speedPoll.stop(); this.polling = false;
        if (this.accelMs) { this.accelMs = 0; this.accelPoll.stop(); }
    }

    /** A read has landed (or the wait ran out: force): with none left in flight, the subscriptions that waited are set up. */
    _landed(force) {
        if (force) this.flying = 0;
        if (this.flying > 0 || !this.waiting.length) return;
        if (this.quietTimer !== null) { clearTimeout(this.quietTimer); this.quietTimer = null; }
        const run = this.waiting;
        this.waiting = [];
        run.forEach((fn) => { try { fn(); } catch (e) { this._oops('subscribe', e); } });
    }

    /** Ask for the subscriptions of an extra that are not there yet. */
    _askGroup(g) {
        this.asked[g] = true;
        Object.keys(INTERFACES).forEach((k) => { if (INTERFACES[k].group === g && !(k === 'travel' && this.travelWithSpeed)) this._ask(k); });
    }

    /**
     * A setting of an extra changed. ON: it is subscribed at once (if it is not already). OFF: its values are
     * dropped from now on (_guard); the subscription stays until the app is next started.
     */
    setGroup(g, on) {
        if (!GROUPS[g] || this.on[g] === !!on) return;
        this.on[g] = !!on;
        if (on) {
            const was = this.asked[g] || (g === 'study' && this.travelWithSpeed);
            this.log.info('switched on: ' + GROUP_NAME[g] + (was ? ' (still subscribed from before: used again)' : ': subscribing now'));
            if (this.plan) this._askGroup(g);
        } else this.log.info('switched off: ' + GROUP_NAME[g] + '. Their values are no longer used; the subscription itself ends with the next start of the app');
        this._changed();
    }

    _failed(key, why, final) {
        const st = this.subs[key], I = INTERFACES[key];
        st.error = why;
        st.state = /no SOME\/IP config/.test(why) ? 'missing' : 'error';
        const wait = final || st.state === 'missing' ? 0 : RETRY_MS[st.tries++];
        this.log.warn('signal ' + I.name + (st.state === 'missing' ? ': this head unit does not have it' : ' error: ' + why) +
            (I.optional ? ' (optional: ' + I.optional + ')' : key === 'vehicle2' ? ' (NEEDED: without it the app cannot time a run)' : ' (without it: no start slope, no downhill flag, no wheelspin estimate; runs are still timed)') +
            (wait ? ', trying again in ' + wait / 1000 + ' s' : ', not tried again'));
        st.retrying = !!wait;
        if (wait) setTimeout(() => {
            try {
                // (an extra switched off while its subscription waited to be tried again: nothing is asked of the car for it.
                // Back at "off", a later switch-on asks afresh through _ask())
                if (I.group && !this.on[I.group]) {
                    st.state = 'off'; st.retrying = false;
                    this.log.info('signal ' + I.name + ': not tried again (its extra is switched off)');
                    this._changed();
                    return;
                }
                this._watch(key, st.handlers, st.done);
            } catch (e) { this._oops('subscribe ' + I.name, e); }
        }, wait);
        this._changed();
    }

    _watch(key, handlers, done) {
        const st = this.subs[key], I = INTERFACES[key];
        st.handlers = handlers; st.done = done; st.tries = st.tries || 0;
        let p;
        try { p = Promise.resolve(this.signals.watch(I.iface, I.instance, handlers, this.log)); } catch (e) { p = Promise.reject(e); }
        p.then((sub) => {
            if (!sub || sub.error) { this._failed(key, String(sub ? sub.error : 'no answer')); return; }
            st.error = null; st.sub = sub;
            this.log.info('signal ' + I.name + ': subscribed' + (st.tries ? ' (try ' + (st.tries + 1) + ')' : ''));
            const ok = () => { st.state = 'ok'; st.retrying = false; this._changed(); };
            // One more step for the GPS receiver's interface: its event. done() then hands back a promise, and until
            // that is through the interface is still "asked": the app reads no getter beside that call either. If the
            // event cannot be subscribed, that is final (as before): the proxy is there, the event is not.
            const more = done ? done(sub) : null;
            if (more && typeof more.then === 'function') more.then(ok, (e) => this._failed(key, String(e && e.message || e), true)); else ok();
        }).catch((e) => this._failed(key, String(e && e.message || e)));
    }

    /** One getter read through the proxy watch() returned. */
    _read(key, field) {
        const sub = this.subs[key].sub;
        if (!sub || !sub.proxy || typeof sub.proxy.getValue !== 'function') return Promise.reject(new Error('no proxy'));
        // (counted while it is on its way to the car: a subscription asked for meanwhile waits for it, see _quiet)
        const p = Promise.resolve(sub.proxy.getValue(field, READ_TIMEOUT_MS));
        this.flying++;
        const landed = () => { this.flying = Math.max(0, this.flying - 1); this._landed(false); };
        p.then(landed, landed);
        return p;
    }

    /** A value came through a field's handler: after the service came up, the first one is (or follows) the kit's own read. */
    _heard(key) {
        const g = this.gates[key], now = this.now();
        // (before the kit's set-up has returned to the app: remembered, and counted when the app first sees the service up)
        if (!this.subs[key].sub || g.since === null) { g.early = true; return; }
        this._gate(key, now);                           // (the service may have come up since the last tick looked)
        if (g.upAt !== null && g.heard === null) g.heard = now;
    }

    /**
     * May the getter of this interface be read now (see the top of the file)? Not while the kit says the service
     * is down; after it came up, not before the kit's own read of it is out of the way.
     */
    _gate(key, now, say) {
        const g = this.gates[key], sub = this.subs[key].sub;
        if (!sub || g.since === null) return false;
        const up = !!sub.available;
        if (up && !g.up) { g.upAt = now; g.heard = g.early ? now : null; g.everUp = true; }
        if (!up && g.up) g.upAt = null;
        g.up = up;
        g.early = false;                                // (it counts at the first look after the set-up, and not later)
        const open = up ? (g.heard !== null && now - g.heard >= POLL_START_MS && now - g.upAt >= KIT_GUARD_MS) || now - g.upAt >= KIT_READ_MS + POLL_START_MS : !g.everUp && now - g.since >= NEVER_UP_MS;
        // (said only while the app reads getters at all: the setting "Ask the car for values")
        if (say && open !== g.told && g.said++ < 6) {
            this.log.info(INTERFACES[key].name + ' getter: ' + (open ? (up ? 'read from now on' : 'the head unit has not said in ' + NEVER_UP_MS / 1000 + ' s whether the car\'s service is up: read anyway') :
                'not read while the car\'s service is down') + (g.said === 6 ? ' (not logged again)' : ''));
        }
        if (say) g.told = open;
        g.open = open;
        return open;
    }

    /**
     * Every 50 ms. As shipped the app reads no getter: the two schedulers are never started. With "Ask the car for
     * values" on: may the getters be read (not while the screen is hidden, not before every subscription asked for
     * is set up or has failed for good, not while one is being tried again); the speed getter's period may have
     * become shorter; the acceleration getter is read only as a fallback.
     */
    tick() {
        const now = this.now();
        // (for Demo data "Auto": the car is there once its speed service says it is up, or a speed sample has arrived)
        const v2 = this.subs.vehicle2.sub;
        if (v2 && v2.available) this.session.carSeen = true;
        const ask = !!this.settings.get('askCar'), hidden = !!(this.session.env && this.session.env.hidden);
        const settled = Object.keys(this.subs).every((k) => this.subs[k].state !== 'wait' && !this.subs[k].retrying);
        const allow = ask && !hidden && settled;
        if (allow !== this.allowed && (ask || this.allowed) && this.allowSaid++ < 8) {
            this.log.info('the app\'s own getter reads: ' + (allow ? 'allowed from now on' : 'none from now on (' + (!ask ? 'switched off in the settings' : hidden ? 'the screen is hidden' : 'a subscription is being set up') + ')') + (this.allowSaid === 8 ? ' (not logged again)' : ''));
        }
        this.allowed = allow;
        const open = this._gate('vehicle2', now, allow) && allow, openA = this._gate('cds2', now, allow) && allow;
        if (open && !this.polling) { this.speedPoll.start(); this.polling = true; }
        if (!open && this.polling) { this.speedPoll.stop(); this.polling = false; }
        if (this.polling) this.speedPoll.kick();
        let ms = 0;
        try { ms = openA && this.subs.cds2.state === 'ok' ? this.session.accelPeriod() : 0; } catch (e) { this._oops('acceleration period', e); }
        if (ms > 0) {
            // (said the first three times: a car may go back and forth all day)
            if (!this.accelMs && this.accelSaid++ < 3) this.log.info('acceleration: nothing notified for 2 s while the speed changed, reading its getter every ' + ms + ' ms' + (this.accelSaid === 3 ? ' (not logged again)' : ''));
            this.accelMs = ms; this.accelPoll.start(); this.accelPoll.kick();
        } else if (this.accelMs) {
            this.accelMs = 0; this.accelPoll.stop();
            if (this.accelSaid <= 3) this.log.info('acceleration: ' + (!allow ? 'its getter is left alone (the app reads no getter now)' : openA ? 'notified again, its getter is left alone' : 'its getter is left alone while the car\'s service is down'));
        }
        // What the session may take the speed for while the app reads nothing itself (session.js, speedHeld): the
        // car's speed service is up, and it has said its speed since it came up (the kit's own first read, or a
        // notification). A field is notified when it changes: no news is no change.
        const g = this.gates.vehicle2;
        this.session.feedNow = { held: !!(v2 && v2.available) && g.upAt !== null && g.heard !== null, polling: !!this.polling };
    }

    stop() { this.speedPoll.stop(); this.accelPoll.stop(); this.polling = false; }

    /* ---------- the sources ---------- */

    _speed(series, t, v, took) {
        const raw = v && typeof v === 'object' ? v[this.sp.member] : undefined;
        this._raw(series === 'polled' ? 'speed (getter)' : 'speed (notified)', () => (isNum(raw) ? raw + (raw === this.sp.invalid ? ' = no value' : ' = ' + (raw * this.sp.factor + this.sp.offset).toFixed(2) + ' km/h') : text(v)) +
            (isNum(took) ? ', the read took ' + Math.round(took) + ' ms' : ''));
        // (the field is 16 bits: anything else is not a speed; nor is anything above 500 km/h, which the engines would not take either)
        if (!isNum(raw) || raw === this.sp.invalid || raw < 0 || raw > 65535) { this.counts.noValue++; return; }
        const kmh = raw * this.sp.factor + this.sp.offset;
        if (!(kmh >= 0 && kmh <= SPEED_MAX_KMH)) { this.counts.noValue++; return; }
        this.session.speed(series, t, kmh, took);
    }

    _accel(t, v, notified) {
        const raw = v && typeof v === 'object' ? v[this.ac.member] : undefined;
        this._raw(notified ? 'acceleration' : 'acceleration (getter)', () => (isNum(raw) ? raw + (raw === this.ac.invalid ? ' = no value' : ' = ' + (raw * this.ac.factor + this.ac.offset).toFixed(3) + ' m/s2') : text(v)));
        if (!isNum(raw) || raw === this.ac.invalid || raw < 0 || raw > 65535) return;
        const a = raw * this.ac.factor + this.ac.offset;
        // (the field reaches from -65 to +66 m/s2; more than 3 g either way is not a car's acceleration)
        if (Math.abs(a) > ACCEL_MAX) { this.counts.noValue++; return; }
        this.session.accel(t, a, notified);
    }

    _wheels(v) {
        this._raw('wheel speeds', () => text(v));
        this.session.wheels(this.now(), rawWheels(v), rawWheelsAny(v));
    }

    /** The wheel-travel counters: kept raw for the Signals page and the log, used for nothing. */
    _travel(key, v) {
        this._raw(key === 'travelF' ? 'wheel travel, front' : 'wheel travel, rear', () => text(v));
        this.session.seen(key, this.now());
        this.live[key] = v && typeof v === 'object' ? Object.keys(v).filter((k) => isNum(v[k]) && /mileage|signalage/i.test(k)).map((k) => [k, v[k]]) : null;
    }

    _nmea(v) {
        const t = this.now(), s = v && typeof v.nmeaString === 'string' ? v.nmeaString : typeof v === 'string' ? v : null;
        const p = this.session.nmea(t, s);
        // (only the sentences' kinds and what was read out of them: the sentences themselves hold the position and the course)
        const kinds = s ? (s.match(/\$[A-Z]{5}/g) || []).join(' ') : '';
        this.live.kinds = kinds || this.live.kinds;
        this.live.delay = v && isNum(v.delayCounter) ? v.delayCounter : null;
        this._raw('GPS sentences', () => (s === null ? 'no text in the event (members: ' + Object.keys(v || {}).join(', ') + ')' : (kinds || 'no sentence') + '; ' + p.ok + ' good, ' + p.bad + ' with a wrong checksum' +
            p.rmc.map((r) => '; RMC ' + (r.valid ? 'valid' : 'void') + (r.kmh === null ? '' : ', ' + r.kmh.toFixed(2) + ' km/h' + (r.coarse ? ' (whole knots: not used)' : ''))).join('') +
            p.gga.map((g) => '; GGA quality ' + g.quality + ', ' + g.sats + ' satellites, HDOP ' + g.hdop + ', height ' + g.alt + ' m').join('') +
            (this.live.delay === null ? '' : '; delayCounter ' + this.live.delay)));
    }

    _gpsPos(v) {
        const t = this.now(), pos = gpsCanPosition(v);
        this.session.seen('gpsPos', t);
        if (pos) { this.live.gpsValid++; this.session.position(t, pos.lat, pos.lon, 'gps'); } else this.live.gpsBad++;
        this._raw('GPS position', () => 'members ' + Object.keys(v || {}).join(', ') + ': ' + (pos ? 'a valid position' : 'no position') + ' (values not logged)');
    }

    _gpsExt(v) {
        const t = this.now(), raw = v && typeof v === 'object' ? v.statusHeightGPSCAN : undefined, m = decodeHeightCan(raw);
        this.session.seen('gpsExt', t);
        this.live.heightRaw = isNum(raw) ? raw : null;
        this.live.speedGps = v && isNum(v.speedGPSCAN) ? v.speedGPSCAN : null;
        if (m !== null) this.session.heightCan(t, m);
        // (the member names, and the values of the two members named here: nothing else of it is written out)
        this._raw('GPS height', () => 'members ' + Object.keys(v || {}).join(', ') + ': statusHeightGPSCAN ' + (isNum(raw) ? raw + (m === null ? ' = no value' : ' = ' + m + ' m') : 'not a number') +
            ', speedGPSCAN ' + (this.live.speedGps === null ? 'not a number' : this.live.speedGps + ' (raw, scale unknown, not used)'));
    }

    _navPos(v) {
        const t = this.now(), pos = navPosition(v);
        this.session.seen('navPos', t);
        if (pos) { this.live.navValid++; this.session.position(t, pos.lat, pos.lon, 'nav'); } else this.live.navBad++;
        this._raw('navigation position', () => 'members ' + Object.keys(v || {}).join(', ') + ': coordinatesValid ' + (v && typeof v.coordinatesValid === 'boolean' ? v.coordinatesValid : 'not said') + ', ' +
            (pos ? 'a valid position' : 'no position') + ' (values not logged)');
    }

    _lane(v) {
        // (the gradient along the road by its name on the one car whose catalogue was read; else the first number that is not housekeeping)
        const named = v && typeof v === 'object' ? v.actualValueLongitudinalGradientRoadway : undefined;
        const raw = isNum(named) ? named : firstNumber(v), d = laneSlope(raw);
        this.session.seen('lane', this.now());
        this.live.lane = { raw, count: d ? d.count : null, pct: d ? d.pct : null };
        this._raw('road gradient', () => text(v) + (isNum(raw) ? ', read ' + raw : '') + (d ? ' = count ' + d.count + ' = ' + d.pct + ' %' : ' = no value'));
    }

    /* ---------- for the Signals page ---------- */

    /**
     * [{ key, label, state: 'ok' | 'wait' | 'missing' | 'error' | 'off', optional, group }] in the order of the page.
     * 'off': the extra this source belongs to is switched off in the settings (its values are not used).
     */
    status() {
        return SOURCES.map((s) => {
            const unit = s[2] === 'travel' && this.travelWithSpeed ? 'vehicle2' : s[2], g = s[3];
            const off = g === 'ask' ? !this.settings.get('askCar') : !!g && !this.on[g];
            return { key: s[0], label: s[1], state: off || this.subs[unit].state === 'off' ? 'off' : this.subs[unit].state, optional: !!INTERFACES[unit].optional, group: g };
        });
    }

    /* ---------- for the record of starts and stops (box.js) ---------- */

    /**
     * How far the set-up has got: "done", or the subscriptions asked for, grouped by how far each has got:
     * "Vehicle2 CDS2 set up; SatellitePositioning asked; Powertrain failed, trying again". Short enough that the
     * record keeps it whole with every extra switched on (box.js keeps 200 characters).
     */
    setupText() {
        const keys = Object.keys(this.subs).filter((k) => this.subs[k].state !== 'off');
        if (!keys.length) return 'not begun';
        if (keys.every((k) => this.subs[k].state === 'ok')) return 'done';
        const word = (k) => (this.subs[k].state === 'error' && this.subs[k].retrying ? 'failed, trying again' : SETUP_WORD[this.subs[k].state] || 'asked');
        return SETUP_WORDS.map((w) => { const names = keys.filter((k) => word(k) === w).map((k) => INTERFACES[k].short || INTERFACES[k].name); return names.length ? names.join(' ') + ' ' + w : ''; }).filter(Boolean).join('; ');
    }

    /** Per extra: 0 off, 1 on, 2 switched off but subscribed in this life (until the next start). ask: the app's own getter reads. */
    onMap() {
        const out = { ask: this.settings.get('askCar') ? 1 : 0 };
        Object.keys(GROUPS).forEach((g) => { out[g] = this.on[g] ? 1 : this.asked[g] || (g === 'study' && this.travelWithSpeed) ? 2 : 0; });
        return out;
    }

    /** The app's own getter reads so far: { asked, answered }. */
    reads() {
        const a = this.speedPoll.counts, b = this.accelPoll.counts;
        return { asked: a.reads + b.reads, answered: a.kept + a.slow + b.kept + b.slow };
    }
}

module.exports = { CarSide, INTERFACES, SOURCES, GROUPS, READ_TIMEOUT_MS, POLL_START_MS, KIT_GUARD_MS, KIT_READ_MS, NEVER_UP_MS };
