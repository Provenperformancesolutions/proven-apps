'use strict';
/**
 * source.js - where Proven Warm-Up's readings come from.
 *
 *   const src = new Source({ settings, signals, log });      // the app's ctx, or the background's
 *   src.wantGearbox = () => true / false                      // may the gearbox unit be asked now?
 *   src.onRpm = (rpm) => ...                                  // every engine speed the car sends (not in the demo)
 *   src.data() -> { rpm, speed, oil, coolant, gearbox, gearboxFrom, gearboxAbsent, demo }     deg C, rpm, km/h
 *   src.moving()                                              // the car is moving (a fresh speed over 1 km/h)
 *   src.left()                                                // the car says it is locked and left (and no engine runs)
 *
 *   engine oil, coolant, rpm   the car's own signals (CDS), which arrive on their own: nothing is asked
 *   speed                      the car's own signal (Vehicle2)
 *   gearbox oil                gearbox.js, the idrive7-apps kit's reader with Proven's changes (listed at its
 *                              top): the gearbox unit (read only, 22 6000 as on a ZF 8HP), else the car's own
 *                              signal once it has moved. gearboxAbsent: the reader's evidence that this car gives
 *                              none. Setting "Gearbox oil temperature": Auto / Car signal only / Not monitored.
 *                              The reader is told when the engine starts (a unit that was asleep is asked at once).
 *   locked and left            the car's own state (VehicleCondition, where the head unit has it), as the kit's
 *                              eDrive and Ambient config read it: parked or standby with nobody in it
 *
 * Scaling is BMW's own, as in kit/runtime/car.js: rpm x 0.25, speed x 0.015625 km/h, temperatures - 48 deg C
 * (255 = no value). A temperature outside RANGE (as Proven Gauges has it) is taken as "no value" too.
 *
 * A temperature the car stops giving (it sends 255 in its place) is kept for GONE_MS and then dropped, so a
 * reading that is no longer live is not shown as one: warm.js then waits for it again. A reading whose
 * signal simply stops arriving is kept: the car only sends a value when it changes, so silence is also
 * what a steady temperature looks like.
 *
 * The engine speed is different: a running engine's speed never stands still, and the car sends it many times
 * a second. An engine speed the car has stopped giving ("no value" in its place for RPM_GONE_MS, or nothing at
 * all for QUIET_MS) is therefore an engine that is not running, and data() gives 0 for it (a number that is not
 * drawn anywhere): the screen then reads "Engine off", and the gearbox unit is no longer asked.
 * Every subscription is tried again when it fails at start-up (subscribe.js).
 *
 * Demo (setting "Demo data": Never, as shipped / Auto until the car answers / Always): a warm-up from cold
 * in 50 s with one burst past the cold rev limit, then half a minute up to temperature, and round again.
 */
const { Gearbox } = require('./gearbox');
const { subscribe } = require('./subscribe');
const Car = require('./kit/car');

const RPM = { factor: 0.25, invalid: 65535 }, SPEED = { factor: 0.015625, invalid: 65535 }, TEMP = { offset: -48, invalid: 255 };
const GONE_MS = 10000;             // "no value" from the car for this long: the last temperature is dropped
const RPM_GONE_MS = 3000;          // "no value" for the engine speed for this long: the engine is not running
const QUIET_MS = 10000;            // no engine speed (road speed) at all for this long: not running (not moving)
const RUNNING_RPM = 400;
// plausible temperatures, deg C (as Proven Gauges): outside is the car's "no value", or a field this car fills differently
const RANGE = { coolant: [-40, 160], oil: [-40, 170] };
const isNum = (x) => typeof x === 'number' && isFinite(x);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
/** A clock that only moves forward (the head unit sets its wall clock after start-up). */
const mono = () => { const h = process.hrtime(); return h[0] * 1000 + h[1] / 1e6; };

class Demo {
    constructor() { this.t0 = mono(); }
    sample() {
        const t = ((mono() - this.t0) / 1000) % 80;
        const ease = (x, p) => 1 - Math.pow(1 - clamp(x, 0, 1), p);
        const driving = t >= 5;
        return {
            rpm: !driving ? 950 + 15 * Math.sin(t * 5) : 2100 + 700 * Math.sin(t / 3) + (t > 21 && t < 24.5 ? 2500 : 0),
            speed: driving ? 52 + 18 * Math.sin(t / 7) : 0,
            coolant: 22 + 70 * ease(t / 44, 1.6),
            gearbox: 20 + 50 * ease((t - 4) / 56, 1.2),
            oil: 21 + 72 * ease((t - 2) / 58, 1.3),
            gearboxFrom: 'demo', demo: true,
        };
    }
}

class Source {
    constructor(env) {
        const { settings, signals, log } = env;
        this.settings = settings; this.log = log;
        this.live = {}; this.lastCar = 0; this.subs = []; this.t0 = Date.now();
        this.gone = {};                // reading -> when the car first sent "no value" in its place (steady clock)
        this.at = {};                  // reading -> when the car last sent a value for it (steady clock)
        this.isLeft = false;           // the car says it is locked and left
        this.rpmOutLogged = false;     // "no more engine speed from the car" is in the log for this stop
        this.demo = new Demo();
        this.wantGearbox = () => false;
        this.onRpm = null;
        const put = (k, v) => { if (isNum(v)) { this.live[k] = v; this.at[k] = mono(); this.lastCar = Date.now(); delete this.gone[k]; } };
        const lost = (k) => { if (this.gone[k] === undefined) this.gone[k] = mono(); };
        // a failed subscription is tried again (subscribe.js); each outcome is logged
        const watch = (iface, handlers) => subscribe(signals, iface, handlers, log, 'signal ' + iface.split('.').pop(), (s) => this.subs.push(s));
        const temp = (k, raw) => {
            if (!isNum(raw)) return;
            const c = raw + TEMP.offset;
            if (raw !== TEMP.invalid && c >= RANGE[k][0] && c <= RANGE[k][1]) put(k, c); else lost(k);
        };
        watch('de.bmw.infotainment.vehicle.CDS', {
            statusEngineSpeed2: (v) => {
                const r = v && v.actualValueRPMEngineCrankshaft;
                if (!isNum(r)) return;
                if (r === RPM.invalid) { lost('rpm'); return; }
                const ran = isNum(this.live.rpm) && this.live.rpm >= RUNNING_RPM && !this.rpmOut(mono());
                put('rpm', r * RPM.factor); this.rpmOutLogged = false;
                // the engine has just been started: a gearbox unit that was asleep with it off is asked at once
                if (!ran && this.live.rpm >= RUNNING_RPM && this.gearbox) this.gearbox.engineStarted();
                // (the demo's revs are not the car's: warm.js gets those with the demo data)
                if (this.onRpm && !this.usingDemo()) this.onRpm(this.live.rpm);
            },
            statusEngineTemperature: (v) => { temp('coolant', v && v.temperatureEngineDrive); temp('oil', v && v.temperatureEngineOilDrive); },
        });
        watch('de.bmw.infotainment.vehicle.Vehicle2', {
            statusCarSpeed2: (v) => { const s = v && v.speedVehicleCentreOfGravity; if (isNum(s) && s !== SPEED.invalid) put('speed', s * SPEED.factor); },
        });
        // the car locked and left (parked, standby: nobody in it): the gearbox unit is not asked, so the car can sleep.
        // The state from either of the car's two copies (some cars send only the one without a CRC); without one, the
        // partial networks it keeps awake, numbered the same (as the kit's Ambient config reads it)
        const condition = (v) => {
            let n = Car.conditionOf(v && v.statusConditionVehicle);
            const p = v && v.controlBasePartialNetworks;
            if (n === undefined) n = p === 0 || p === 'KEINE_KOMMUNIKATION' ? 1 : Car.conditionOf(typeof p === 'string' ? p.replace(/^KOM_/, '') : p);
            if (n === undefined || this.isLeft === (n <= 3)) return;
            this.isLeft = n <= 3;
            log.info(this.isLeft ? 'the car is locked and left: the gearbox unit is not asked, so the car can sleep' : 'the car is in use again');
        };
        watch('de.bmw.infrastructure.VehicleCondition', { VehicleCondition: condition, vehicleConditionNoCrc: condition });
        // the gearbox unit is only asked while wantGearbox() says so, on the car, with the setting on Auto
        this.gearbox = new Gearbox({ signals }, log, () => settings.get('gearboxSource') === 'auto' && !this.usingDemo() && this.wantGearbox()).start();
    }

    /** Has the car answered: a value arrived, or a signal's provider is there. */
    carPresent() { return this.lastCar > 0 || this.subs.some((s) => s.available); }
    usingDemo() {
        const m = this.settings.get('demo');
        return m === 'on' || (m !== 'off' && !this.carPresent() && Date.now() - this.t0 > 5000);
    }

    /** The car is moving: a road speed over 1 km/h that arrived in the last QUIET_MS (a hybrid on its electric motor). */
    moving() { return !this.usingDemo() && isNum(this.live.speed) && this.live.speed > 1 && mono() - this.at.speed < QUIET_MS; }
    /**
     * The car says it is locked and left. false for a car that does not say its state, and while its engine runs:
     * an engine speed that keeps arriving is the better witness, should a change of state ever be missed.
     */
    left() { return this.isLeft && !(isNum(this.live.rpm) && this.live.rpm >= RUNNING_RPM && !this.rpmOut(mono())); }

    /** The car has stopped giving an engine speed: "no value" in its place for RPM_GONE_MS, or nothing for QUIET_MS. */
    rpmOut(now) {
        if (!isNum(this.live.rpm)) return false;
        const out = (this.gone.rpm !== undefined && now - this.gone.rpm > RPM_GONE_MS) || now - this.at.rpm > QUIET_MS;
        // (logged when the speed it stopped at was that of a running engine: the case to look for on the first car)
        if (out && !this.rpmOutLogged && this.live.rpm >= RUNNING_RPM) {
            this.rpmOutLogged = true;
            this.log.info('engine speed: no more from the car after ' + Math.round(this.live.rpm) + ' rpm: taken as not running');
        }
        return out;
    }

    data() {
        if (this.usingDemo()) {
            const d = this.demo.sample();
            if (this.settings.get('gearboxSource') === 'none') d.gearbox = null;
            return d;
        }
        const source = this.settings.get('gearboxSource'), none = source === 'none', live = Object.assign({}, this.live), now = mono();
        // a temperature the car has not given for GONE_MS is no longer a reading
        Object.keys(this.gone).forEach((k) => { if (k !== 'rpm' && now - this.gone[k] > GONE_MS) delete live[k]; });
        // an engine speed the car has stopped giving: the engine is not running
        if (this.rpmOut(now)) live.rpm = 0;
        return Object.assign(live, {
            gearbox: none ? null : this.gearbox.temp(), gearboxFrom: none ? null : this.gearbox.source(),
            gearboxAbsent: !none && this.gearbox.absent(source === 'auto'), demo: false,
        });
    }
}

module.exports = { Source, Demo, mono };
