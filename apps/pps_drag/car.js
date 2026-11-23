'use strict';
/**
 * car.js - Proven Drag: the car side. It subscribes to the car's signals, reads two getters on a
 * schedule, subscribes to one event, and hands every sample to the session with the time it arrived.
 * READ ONLY: nothing here writes a field, calls a method or opens the diagnostic link. What leaves the
 * app is: subscriptions (signals.watch), getter reads (getValue) of the speed and, as a fallback, of the
 * acceleration, and one event subscription (the GPS receiver's sentences).
 *
 *   const car = new CarSide({ signals, log, session, scaling, now });
 *   car.start();               subscribe (a failed subscription is tried again after 5, 15 and 60 s)
 *   car.tick(now)              every 50 ms: the poll periods may have changed
 *   car.status()               for the Signals page: per source { label, state, optional }
 *
 * WHAT IT ASSUMES ABOUT THE CAR (public reports; none of it measured by Proven)
 *   - No sample carries a time: each is stamped when its handler runs, on the forward-only clock.
 *   - The kit's signals.watch() reads every getter once itself whenever the car's service comes up, and
 *     hands the answer to the same handler as a notification. So the first "notified" speed may be that
 *     read. It is outside the poll schedule, and two reads of one field must not be in flight together. So
 *     a getter is not read by the app while the kit says its service is down, and after it came up only
 *     once the service has been up for 1 s and 300 ms have passed since the first value arrived through
 *     the handler (the kit's read has been answered, or the car notified: the two cannot be told apart,
 *     hence the second), or 3.3 s after it came up if nothing arrived (the kit's read allows 3 s).
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
const { rawWheels } = require('./wheels');
const { gpsCanPosition, navPosition, decodeHeightCan } = require('./gpsscale');
const { laneSlope } = require('./slope');

const VEHICLE2 = 'de.bmw.infotainment.vehicle.Vehicle2', CDS2 = 'de.bmw.infotainment.vehicle.CDS2';
const POWERTRAIN = 'de.bmw.powertrain.Powertrain', SATELLITE = 'de.bmw.infotainment.SatellitePositioning';
const GPSDATA = 'de.bmw.infotainment.GPSData', POSITIONING = 'de.bmw.infotainment.navigation.positioning.Positioning';
const VEHICLEMODEL = 'de.bmw.chassis.VehicleModel';
/** What the app loses without an optional interface (as app.json says it to the installer). */
const INTERFACES = {
    vehicle2: { iface: VEHICLE2, instance: '1', name: 'Vehicle2' },
    cds2: { iface: CDS2, instance: '1', name: 'CDS2' },
    powertrain: { iface: POWERTRAIN, instance: '1', name: 'Powertrain', optional: 'wheelspin is an estimate, the speed signal is not cross-checked at the launch' },
    satellite: { iface: SATELLITE, instance: '1', name: 'SatellitePositioning', optional: 'no GPS speed: the speed scale comes from position legs, the height from the raw GPS value' },
    gpsdata: { iface: GPSDATA, instance: '1', name: 'GPSData', optional: 'position legs use the navigation\'s position, no second source of height' },
    positioning: { iface: POSITIONING, instance: 'Main_Instance', name: 'Positioning', optional: 'position legs need the raw GPS position' },
    vehiclemodel: { iface: VEHICLEMODEL, instance: '1', name: 'VehicleModel', optional: 'no road gradient on the Signals page' },
};
/** The rows of the Signals page: source key (the session's rate meters), label, the interface it comes from. */
const SOURCES = [
    ['speedN', 'Speed, notified', 'vehicle2'], ['speedP', 'Speed, getter', 'vehicle2'], ['accel', 'Acceleration', 'cds2'],
    ['wheels', 'Wheel speeds', 'powertrain'], ['travelF', 'Wheel travel, front', 'vehicle2'], ['travelR', 'Wheel travel, rear', 'vehicle2'],
    ['nmea', 'GPS sentences', 'satellite'], ['gpsPos', 'GPS position, raw', 'gpsdata'], ['gpsExt', 'GPS height, raw', 'gpsdata'],
    ['navPos', 'Navigation position', 'positioning'], ['lane', 'Road gradient', 'vehiclemodel'],
];
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
    /** o: { signals (the kit's ctx.signals), log, session, scaling (app.json config.scaling), now() } */
    constructor(o) {
        this.signals = o.signals; this.log = o.log; this.session = o.session; this.now = o.now;
        const sc = o.scaling || {};
        this.sp = Object.assign({ factor: 0.015625, offset: 0, invalid: 65535, member: 'speedVehicleCentreOfGravity' }, sc.speed);
        this.ac = Object.assign({ factor: 0.002, offset: -65, invalid: 65535, member: 'longitudinalAccelerationCentreOfGravity' }, sc.accel);
        this.subs = {};                 // interface key -> { state: 'wait' | 'ok' | 'missing' | 'error', error, sub }
        Object.keys(INTERFACES).forEach((k) => { this.subs[k] = { state: 'wait', error: null, sub: null }; });
        // when a getter may be read (see the top): per interface { since: subscribed at, up, everUp, upAt, heard, open }
        this.gates = { vehicle2: { since: null, up: false, everUp: false, upAt: null, heard: null, open: false, said: 0 }, cds2: { since: null, up: false, everUp: false, upAt: null, heard: null, open: false, said: 0 } };
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

    /** A handler that cannot throw into the kit (the kit would log every single time). */
    _guard(what, fn) { return (v) => { try { fn(v); } catch (e) { this._oops(what, e); } }; }

    /* ---------- subscribing ---------- */

    start() {
        const h = (what, fn) => this._guard(what, fn);
        this._watch('vehicle2', {
            statusCarSpeed2: h('speed', (v) => { this._heard('vehicle2'); this._speed('notified', this.now(), v); }),
            statusWheeltravel: h('wheel travel', (v) => this._travel('travelF', v)),
            statusWheeltravelRear: h('wheel travel', (v) => this._travel('travelR', v)),
        }, () => { this.gates.vehicle2.since = this.now(); });
        this._watch('cds2', { statusLongitudinalAccelerationMassCenter: h('acceleration', (v) => { this._heard('cds2'); this._accel(this.now(), v, true); }) },
            () => { this.gates.cds2.since = this.now(); });
        this._watch('powertrain', { ActualValueRPMWheel: h('wheels', (v) => this._wheels(v)) });
        this._watch('gpsdata', {
            GPSPositionCAN: h('GPS position', (v) => this._gpsPos(v)),
            GPSPositionExtendedCAN: h('GPS height', (v) => this._gpsExt(v)),
        });
        this._watch('positioning', { currentLocation: h('navigation position', (v) => this._navPos(v)) });
        this._watch('vehiclemodel', { LaneSlope: h('road gradient', (v) => this._lane(v)) });
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
            (I.optional ? ' (optional: ' + I.optional + ')' : key === 'vehicle2' ? ' (NEEDED: without it the app cannot time a run)' : ' (without it: no start slope, no downhill flag, no wheelspin estimate; runs are still timed)') +
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
    _read(key, field) {
        const sub = this.subs[key].sub;
        if (!sub || !sub.proxy || typeof sub.proxy.getValue !== 'function') return Promise.reject(new Error('no proxy'));
        return sub.proxy.getValue(field, READ_TIMEOUT_MS);
    }

    /** A value came through a field's handler: after the service came up, the first one is (or follows) the kit's own read. */
    _heard(key) {
        const g = this.gates[key], now = this.now();
        this._gate(key, now);                           // (the service may have come up since the last tick looked)
        if (g.upAt !== null && g.heard === null) g.heard = now;
    }

    /**
     * May the getter of this interface be read now (see the top of the file)? Not while the kit says the service
     * is down; after it came up, not before the kit's own read of it is out of the way.
     */
    _gate(key, now) {
        const g = this.gates[key], sub = this.subs[key].sub;
        if (!sub || g.since === null) return false;
        const up = !!sub.available;
        if (up && !g.up) { g.upAt = now; g.heard = null; g.everUp = true; }
        if (!up && g.up) g.upAt = null;
        g.up = up;
        const open = up ? (g.heard !== null && now - g.heard >= POLL_START_MS && now - g.upAt >= KIT_GUARD_MS) || now - g.upAt >= KIT_READ_MS + POLL_START_MS : !g.everUp && now - g.since >= NEVER_UP_MS;
        if (open !== g.open && g.said++ < 6) {
            this.log.info(INTERFACES[key].name + ' getter: ' + (open ? (up ? 'read from now on' : 'the head unit has not said in ' + NEVER_UP_MS / 1000 + ' s whether the car\'s service is up: read anyway') :
                'not read while the car\'s service is down') + (g.said === 6 ? ' (not logged again)' : ''));
        }
        g.open = open;
        return open;
    }

    /** Every 50 ms: may the getters be read; the speed getter's period may have become shorter; the acceleration getter is read only as a fallback. */
    tick() {
        const now = this.now();
        // (for Demo data "Auto": the car is there once its speed service says it is up, or a speed sample has arrived)
        const v2 = this.subs.vehicle2.sub;
        if (v2 && v2.available) this.session.carSeen = true;
        const open = this._gate('vehicle2', now), openA = this._gate('cds2', now);
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
            if (this.accelSaid <= 3) this.log.info('acceleration: ' + (openA ? 'notified again, its getter is left alone' : 'its getter is left alone while the car\'s service is down'));
        }
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
        this.session.wheels(this.now(), rawWheels(v));
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

    /** [{ key, label, state: 'ok' | 'wait' | 'missing' | 'error', optional }] in the order of the page. */
    status() {
        return SOURCES.map((s) => ({ key: s[0], label: s[1], state: this.subs[s[2]].state, optional: !!INTERFACES[s[2]].optional }));
    }
}

module.exports = { CarSide, INTERFACES, SOURCES, READ_TIMEOUT_MS, POLL_START_MS, KIT_GUARD_MS, KIT_READ_MS, NEVER_UP_MS };
