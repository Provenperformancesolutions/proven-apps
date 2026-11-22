'use strict';
/**
 * vitals.js - Proven Gauges data layer.
 *
 *   const v = new Vitals(ctx, engine);
 *   v.data()            the values to draw (demo drive or the car), internal units:
 *                       rpm, km/h, bar (boost above outside air, tyres), deg C, g, Nm, kW
 *   v.usingDemo()       demo data on screen?
 *   v.pk()              peaks (peak hold), v.raise(key, value), v.resetPeaks()
 *   v.hist              1 Hz, last 5 minutes: coolant, oil, gearbox, egs, ambient, iat, hpfp, lpfp, timing
 *   v.trace             5 Hz, last 60 s: boost, target
 *   v.trail             the friction circle's trail (filled by the Track set)
 *   v.want([keys])      engine-unit values on screen now (read fast while they are)
 *   v.seenScreen()      called per frame: the app is on screen
 *   v.has(group)        the car has sent real data for this group (boost, gearbox, egs, iat, tyres, ...)
 *   v.why(key) / v.dmeWhy(key) / v.boostWhy()    short reason for a missing value
 *   v.power(d)          { kw, calc }: power, and whether it is torque x rpm (calc) or the sport display's %
 *   v.boostPair(d)      { target, actual }: boost target and actual the engine unit gave in one round
 *   v.ethanol()         { on, value, source, why, can }: the ethanol read-out (setting "Ethanol reading")
 *   v.units()           { known, late, psi }: does the app know the car's display units?
 *   v.gZeroed()         both acceleration axes zeroed at a standstill (the g peaks count from then)
 *
 * Where the values come from
 *   - the car's own signals (SOME/IP notifications, nothing is asked): rpm, speed, coolant, oil,
 *     acceleration, sport-display boost / power, torque, gear, gearbox oil, outside temperature, tyres
 *   - the engine unit (DME) and gearbox unit (EGS) over the head unit's diagnostic gateway, READ ONLY
 *     (kit/readonly-diag.js lets nothing but UDS 0x22 and OBD 0x01 / 0x09 leave the head unit):
 *     intake air temperature, rail and low-side fuel pressure, ignition timing, boost target / actual,
 *     boost and oil temperature as fallbacks, gearbox temperature, ethanol content (off as shipped)
 *   - the one exception to READ ONLY, and only when the workshop chose it: "Ethanol reading: MHD flex".
 *     Its three non-read requests to the engine unit leave through the Gate of mhdflex.js and nothing
 *     else can (see that file). With any other choice the app sends reads only, as before.
 *
 * Signal names, scaling, plausibility ranges and the "only once it has changed" rule for fields
 * some cars never fill follow M Vitals (apps/car_vitals) of the idrive7-apps kit
 * (MIT, (c) cauliflowermossgrape), where they were tested on cars. Proven's own, and not tested on a
 * car: when a reading is dropped (GONE_MS, FRESH_MS), giving up on a unit that does not answer (UNIT_MISSES)
 * and what counts as an engine start (put), the wait for the car's units (UNITS_WAIT_MS) and the unit told by
 * the size of the tyre pressures when the car names none (sizeUnit), when the g sensor counts as zeroed
 * (G_LEARN), the ceilings (app.json) and the ethanol slot (ETH_MS).
 *
 * Times are taken on a clock that only moves forward (mono): the head unit sets its wall clock after
 * start-up and it can step back by hours, and a reading must not count as fresh because of that.
 */
const fs = require('fs');
const path = require('path');
const G = require('./kit/gauges');
const { GearGuess, selectionOf } = require('./kit/car');
const { ReadOnlyDiag } = require('./kit/readonly-diag');
const { DidReader } = require('./kit/dids');
const Demo = require('./demo');
const Mhd = require('./mhdflex');

const HIST_SEC = 300, TRACE_N = 300, TRACE_MS = 200;
/** A clock that only moves forward, ms (as main.js uses for the start-up logo). */
const mono = () => { const h = process.hrtime(); return h[0] * 1000 + h[1] / 1e6; };
const NEVER = -1e12;                // "never" as a time on that clock
const GONE_MS = 10000;              // the car sends "no value" in a reading's place for this long: the reading is dropped
const FRESH_MS = 15000;             // an engine-unit / gearbox-unit value is shown while its last answer is younger
const PAIR_MS = 2500;               // boost target and actual of one round are compared while that round is younger
const PAIR_TRACE_MS = 6000;         // the target line of the 60 s chart keeps a reading this long (off the Boost set it is read every 5 s)
const UNITS_WAIT_MS = 8000;         // sport-display boost and the tyre values wait this long for the car's display units
const G_MAX = 2.5;                  // more than this is no acceleration of a car: the field's "no value" or a glitch
const G_LEARN = 3;                  // readings at a standstill before an axis counts as zeroed (g peaks count from then)
/*
 * A control unit that does not answer. Every request nobody answers holds the head unit's one diagnostic
 * transport (for seconds, on the one car where it was seen), and the requests to the other unit wait behind
 * it. So a unit that gave no reply of any kind to UNIT_MISSES requests in a row is given up: it gets one
 * single request after UNIT_RETRY_MS[0], the next after [1], ... and then one every last entry, and it
 * counts as there again from its first reply of any kind (a value or a refusal). An engine start asks
 * it once at once (wakeUnits). The engine unit and the gearbox unit are counted apart, and a unit's silence
 * is counted on the unit only, not on the value that happened to be asked (missed).
 */
const UNIT_MISSES = 3, UNIT_RETRY_MS = [30000, 60000, 120000, 300000, 600000];
/*
 * Ethanol content (setting "Ethanol reading", config.dme.ethanol). It changes with a refuelling, not with
 * the throttle: one request at most every ETH_MS, last in a round, never among the values read fast, and
 * only while its read-out is on screen and the engine unit has answered something in the last ETH_ALIVE_MS.
 * It is shown while younger than ETH_FRESH_MS. An identifier the engine unit says it does not have
 * (NRC 11 / 12 / 31) rests for ETH_REST_MS; one that was not answered, or refused for another reason, is
 * asked again after ETH_MS, ETH_TRIES times in all, and then rests the same (one try per rest from then on).
 * The choice "MHD flex" has its own steps and its own pace (mhdflex.js), in the same slot and under the same
 * two conditions: on screen, and an engine unit that is answering.
 */
const ETH_MS = 30000, ETH_FRESH_MS = 100000, ETH_REST_MS = 600000, ETH_TRIES = 3, ETH_ALIVE_MS = 20000;
/* Plausible ranges. Outside = the car's "no data" marker or a field this car fills differently. */
const TYRE_T = [-40, 150], TYRE_P = [0.5, 6], TYRE_PT = [1, 6];
const RANGE = {
    rpm: [0, 12000], coolant: [-40, 160], oil: [-40, 170], gearbox: [-40, 160], egs: [-40, 160], ambient: [-50, 60],
    // (hpfp: the petrol ceiling of 500 bar is the definitions' own in app.json; 2700 is a diesel's, "maxDiesel" there)
    iat: [-40, 150], hpfp: [0, 2700], lpfp: [0, 15], timing: [-64, 64],
    boostFes: [-1, 4], boostDme: [-1, 4], boostTarget: [-1, 4], boostActual: [-1, 4],
    gLong: [-G_MAX, G_MAX], gLat: [-G_MAX, G_MAX], powerPct: [0, 100], torquePct: [0, 100],
    tFL: TYRE_T, tFR: TYRE_T, tRL: TYRE_T, tRR: TYRE_T, pFL: TYRE_P, pFR: TYRE_P, pRL: TYRE_P, pRR: TYRE_P,
    ptFL: TYRE_PT, ptFR: TYRE_PT, ptRL: TYRE_PT, ptRR: TYRE_PT,
};
/* Fields some cars never fill sit at one number: they only count once they changed by this much. */
const MOVE = { gearbox: 1, egs: 1, boostFes: 0.03, boostDme: 0.03, powerPct: 1 };
const GROUP = {
    gearbox: 'gearbox', egs: 'egs', boostFes: 'boost', boostDme: 'boost', iat: 'iat', hpfp: 'hpfp', lpfp: 'lpfp', timing: 'timing',
    boostTarget: 'boostCtl', boostActual: 'boostCtl',
    tFL: 'tyreTemp', tFR: 'tyreTemp', tRL: 'tyreTemp', tRR: 'tyreTemp', pFL: 'tyres', pFR: 'tyres', pRL: 'tyres', pRR: 'tyres',
};
const DME_KEYS = ['iat', 'hpfp', 'lpfp', 'timing', 'boostCtl', 'egs'];
const TYRES = ['FL', 'FR', 'RL', 'RR'];
const TYRE_KEY = /^(p|pt|t)(FL|FR|RL|RR)$/;
// gearbox enums: names or wire numbers, as in kit/car.js
const GEARS = { G1: 1, G2: 2, G3: 3, G4: 4, G5: 5, G6: 6, G7: 7, G8: 8, G9: 9, G10: 10, R: -1, N_OR_P: 0 };
const gearOf = (x) => (typeof x === 'number' ? (x >= 3 && x <= 12 ? x - 2 : x === 1 ? -1 : x === 2 ? 0 : undefined) : GEARS[x]);
const STAGES = { P: 'P', R: 'R', N: 'N', D: 'D', 1: 'P', 2: 'R', 3: 'N', 4: 'D' };
const PROGRAMS = { S_MINUS_PROGRAMM: 'S', M_MINUS_PROGRAMM: 'M', 1: 'S', 2: 'M' };

/** Selector programme (D / S / M / P / R / N) from the gearbox status; field names differ between cars. */
function modeOf(o) {
    for (const k of Object.keys(o || {})) {
        if (k === 'statusActualGearDrive' || /StageDrive/.test(k) || !/select|lever|position|program|mode|range|manual|sport|tip/i.test(k)) continue;
        const v = o[k];
        if (v === true || v === 1) { if (/manual|tip/i.test(k)) return 'M'; if (/sport/i.test(k)) return 'S'; continue; }
        const x = String(v).toUpperCase();
        if (/NOT|INACTIVE|INVALID|SIGNAL|UNKNOWN|OFF|NO_/.test(x)) continue;
        if (/MANU|TIPP|^M$|^M_|_M$|^M\d/.test(x)) return 'M';
        if (/SPORT|^S$|_S$|^DS$/.test(x)) return 'S';
        if (/PARK|^P$/.test(x)) return 'P';
        if (/REVERSE|^R$/.test(x)) return 'R';
        if (/NEUTRAL|^N$/.test(x)) return 'N';
        if (/DRIVE|^D$|^D_|_D$/.test(x)) return 'D';
    }
    return null;
}

class Vitals {
    constructor(ctx, engine) {
        const { settings, log } = ctx;
        this.ctx = ctx; this.settings = settings; this.log = log; this.engine = engine;
        const cfg = ctx.spec.config || {};
        const S = cfg.scaling || {};
        const sc = (k, raw) => {
            const c = S[k];
            if (!c || raw === undefined || raw === null || raw === c.invalid || (c.invalidFrom != null && raw >= c.invalidFrom)) return null;
            return raw * c.factor + (c.offset || 0);
        };
        /** Did the car send its "no value" in this reading's place? (a field it leaves out altogether is not that) */
        const noValue = (k, raw) => { const c = S[k]; return !!c && typeof raw === 'number' && (raw === c.invalid || (c.invalidFrom != null && raw >= c.invalidFrom)); };

        const live = this.live = {};
        this.peak = {}; this.demoPeak = {}; this.peakAt = new Map();
        this.hist = { coolant: [], oil: [], gearbox: [], egs: [], ambient: [], iat: [], hpfp: [], lpfp: [], timing: [] };
        this.trace = { boost: [], target: [] };
        this.trail = [];
        this.tyreStart = {}; this.demoTyreStart = {};
        this.bad = {}; this.first = {}; this.moved = {};
        this.gone = {};                // reading -> when the car first sent "no value" (or a value out of range) in its place
        this.top = {};                 // reading -> it sits on the ceiling of its field
        this.lastCar = 0; this.startT = mono(); this.subs = [];
        this.screenT = NEVER; this.wantT = {}; this.rpmT = NEVER;
        this.demo = new Demo();
        this.demo.setRedline(engine.redline());
        engine.onChange(() => this.demo.setRedline(engine.redline()));

        // which groups this car has sent real data for: remembered, so the next start shows them at once
        this.seenFile = path.join(ctx.dataDir, 'seen.json');
        this.seen = {};
        try { this.seen = JSON.parse(fs.readFileSync(this.seenFile, 'utf8')) || {}; } catch (e) { /* not yet */ }

        /** The first raw values of a field go to the log (12 different ones at most): what scaling and units are checked against on a new car. */
        const rawLogged = {};
        const logRaw = (name, raw, max) => {
            const key = JSON.stringify(raw), l = rawLogged[name] || (rawLogged[name] = []);
            if (l.length >= (max || 12) || l.indexOf(key) >= 0) return;
            l.push(key); log.info('raw ' + name + ': ' + key);
        };

        /*
         * The car's display units: the TPMS sends tyre pressures as 0.1 x raw in the car's pressure unit
         * and tyre temperatures as the car's degrees + 40 (deg F on a car set to Fahrenheit), and the sport
         * display its boost in 0.1 psi steps on a car set to psi. So these values wait until the car has said
         * which units it uses (read at start; UNITS_WAIT_MS at most). If it never says, the pressure unit is
         * told by the size of the tyre pressures (sizeUnit) and temperatures are taken as deg C, and the
         * screen says so (units()).
         */
        const carUnits = this.carUnits = { press: null, temp: null, guess: null, late: false };
        const PRESS_UNITS = { 1: 'BAR', 2: 'KPA', 3: 'PSI' }, TEMP_UNITS = { 1: 'C', 2: 'F' };
        const PRESS_TO_BAR = { BAR: 1, KPA: 0.01, PSI: 1 / 14.5038 };
        const unitName = (map, v) => (map[v] || (Object.values(map).indexOf(v) >= 0 ? v : null));
        const unitsReady = () => carUnits.press !== null || carUnits.late;
        const tyreP = (raw) => {
            const v = sc('tyrePress', raw);
            if (v === null) return null;
            // (the car never said its unit: the one unit the tyres' sizes point to - sizeUnit - for all of them)
            const k = PRESS_TO_BAR[carUnits.press || carUnits.guess];
            return k ? v * k : v;
        };
        // (deg F only when the car says so: a car set to psi is not thereby set to Fahrenheit)
        const tyreT = (raw) => { const v = sc('tyreTemp', raw); return v !== null && carUnits.temp === 'F' ? (v - 32) * 5 / 9 : v; };
        /*
         * g-force: whatever an axis reads at a standstill is its offset (sensor zero, or a slope):
         * learned while the car stands and taken off. An axis is zeroed once it has sent G_LEARN readings
         * while the car had been standing for 2 s - how often the car sends them there is not known from a car.
         */
        const G0 = 9.80665, gZero = { gLong: { z: 0, n: 0 }, gLat: { z: 0, n: 0 } };
        let stillSince = 0, zeroLogged = false;
        const standing = () => stillSince > 0 && mono() - stillSince > 2000;
        this.gZeroed = () => gZero.gLong.n >= G_LEARN && gZero.gLat.n >= G_LEARN;
        const putG = (k, raw) => {
            const a = sc('accel', raw);
            if (a === null) { if (noValue('accel', raw)) lost(k); return; }
            const g = a / G0, z = gZero[k];
            if (standing() && Math.abs(g) <= 1) { z.n = Math.min(z.n + 1, 50); z.z += (g - z.z) / z.n; }
            if (!zeroLogged && this.gZeroed()) {
                zeroLogged = true;
                log.info('g-force: zeroed at a standstill ' + Math.round((mono() - stillSince) / 100) / 10 + ' s long (offsets: longitudinal ' + gZero.gLong.z.toFixed(3) + ' g, lateral ' + gZero.gLat.z.toFixed(3) + ' g)');
            }
            // session peaks: taken here, where the values arrive (so also with another screen showing), and only of
            // an axis that has been zeroed - before that the reading still carries the sensor's offset or a slope
            if (!put(k, g - z.z) || z.n < G_LEARN) return;
            if (k === 'gLat') this.maxIn(this.peak, 'gLat', Math.abs(g - z.z));
            else { this.maxIn(this.peak, 'gAccel', Math.max(0, g - z.z)); this.maxIn(this.peak, 'gBrake', Math.max(0, z.z - g)); }
        };

        // the engine turns (for "an engine start asks a silent unit once more"); what the engine speed did before that
        // (a text, or the speed it had) and how often that went to the log
        let run = false, stood = 'the first engine speed since the app was started', startLogs = 0;
        /** A reading is no longer one: dropped, with what was worked out from it. */
        const drop = (k) => {
            delete live[k];
            if (k === 'rpm') { run = false; stood = 'engine speed marked "no value"'; }
            if (k === 'rpm' || k === 'torque') delete live.powerCalc;
            if (k === 'rpm' || k === 'speed') live.gearGuess = null;
            if (k === 'speed') stillSince = 0;
            if (k === 'boostFes' || k === 'boostDme') this.updBoost();
        };
        /**
         * The car sent "no value" (or a value out of its range) in a reading's place: the last reading is kept for
         * GONE_MS and then dropped (atOnce: now). A reading whose signal simply stops arriving is kept: the car
         * only sends a value when it changes, so silence is also what a steady reading looks like.
         */
        const lost = (k, atOnce) => {
            if (this.gone[k] === undefined) this.gone[k] = mono();
            if (atOnce) { this.gone[k] = Math.min(this.gone[k], mono() - GONE_MS - 1); drop(k); }
        };
        this.sweep = () => {
            const now = mono();
            Object.keys(this.gone).forEach((k) => { if (live[k] !== undefined && now - this.gone[k] > GONE_MS) drop(k); });
            // oil temperature taken from the engine unit ages as every engine-unit value does
            if (this.oilDme && live.oil !== undefined && now - (this.dmeAt.oil || NEVER) >= FRESH_MS) drop('oil');
        };

        const guess = new GearGuess();
        /** Take a value; false when it is none (missing, or outside its plausible range). */
        const put = this.put = (k, v) => {
            if (v === null || v === undefined || !isFinite(v)) return false;
            this.lastCar = mono();
            const r = RANGE[k];
            // (a tyre value out of range is "--" at once: a tyre losing its air must not keep its last healthy number)
            if (r && (v < r[0] || v > r[1])) { this.bad[k] = v; lost(k, TYRE_KEY.test(k)); return false; }
            delete this.bad[k]; delete this.gone[k];
            if (MOVE[k] != null) {
                if (this.first[k] === undefined) this.first[k] = v;
                else if (!this.moved[k] && Math.abs(v - this.first[k]) >= MOVE[k]) { this.moved[k] = true; this.remember([GROUP[k], k]); }
            } else if (GROUP[k]) this.remember([GROUP[k]]);
            live[k] = v;
            if (k === 'boostFes' || k === 'boostDme') { this.updBoost(); return true; }
            if (k === 'rpm' || k === 'torque') {
                // power without sport-display data: crankshaft torque x engine speed
                if (G.isNum(live.torque) && G.isNum(live.rpm)) live.powerCalc = Math.max(0, live.torque * live.rpm / 9549);
                this.raiseIn(this.peak, k, v);
            }
            // peaks follow the values as they arrive, screen or not (main.js raises them once more per frame, so a held
            // peak also drops back while the car sends nothing new)
            if (k === 'rpm' || k === 'torque' || k === 'powerPct') {
                this.raiseIn(this.peak, 'power', this.power({ powerPct: this.trusted('powerPct') ? live.powerPct : null, powerCalc: live.powerCalc }).kw);
            }
            if (k === 'rpm') {
                // an engine start: the first speed above 400 rpm after the engine stood. What the signal does when the
                // engine stops is not known from a car, so each of these counts as "it stood": a speed under 400 rpm
                // (0, or the last value of the run-down: the kit saw 160 rpm with the engine off), none for 10 s (a
                // running engine's speed never holds still that long), or "no value" until the reading was dropped (drop).
                // Which one it was goes to the log (the first 20 times), for the first car
                if (v < 400) { run = false; stood = v; }
                else if (run && mono() - this.rpmT > 10000) { run = false; stood = 'no engine speed for ' + Math.round((mono() - this.rpmT) / 1000) + ' s'; }
                this.rpmT = mono();
                if (v > 400 && !run) {
                    run = true;
                    if (startLogs++ < 20) log.info('engine speed above 400 rpm, taken as an engine start (before it: ' + (typeof stood === 'number' ? 'engine speed ' + Math.round(stood) + ' rpm' : stood) + ')');
                    wakeUnits();
                }
            }
            if (k === 'speed') stillSince = v < 0.5 ? stillSince || mono() : 0;
            if ((k === 'rpm' || k === 'speed') && G.isNum(live.rpm) && G.isNum(live.speed)) {
                const g = guess.feed(live.rpm, live.speed);
                live.gearGuess = live.speed < 3 ? null : g;          // nothing at a standstill: it can't tell P, N or D there
            }
            if (/^p(FL|FR|RL|RR)$/.test(k) && this.tyreStart[k] === undefined) this.tyreStart[k] = v;
            return true;
        };
        /** One raw car value: scaled and taken, or marked lost when the car sends its "no value" in its place. */
        const take = (k, sk, raw, f) => {
            const v = sc(sk, raw);
            if (v === null) { if (noValue(sk, raw)) lost(k); return false; }
            return put(k, f ? f(v) : v);
        };
        /** The same for a tyre value, which is converted from the car's unit (tyreP / tyreT). */
        const tyre = (k, sk, raw, conv) => {
            const v = conv(raw);
            if (v === null) { if (noValue(sk, raw)) lost(k); return; }
            put(k, v);
        };

        /* ---------- values in the car's display units (see carUnits) ---------- */
        const psi = () => (carUnits.press || carUnits.guess) === 'PSI';
        const lastRaw = {};             // the last raw message of each, taken again once the units are known
        /*
         * A car that never said its pressure unit: the largest of the four tyre pressures tells it (as bar 0.5 to 6,
         * as psi 7 to 60, as kPa 60 to 600), and all four and the car's targets are read in that one unit. A tyre
         * that is going flat then reads low, and "--" once it is out of range - sized on its own, 5 psi came out as
         * 5 bar. A smaller unit than the one found is only believed from three tyres at once (the driver changed the
         * unit): one or two tyres that are low, or the only ones in a message, do not say that.
         * True when the unit found is another one than before.
         */
        const SIZE = { BAR: 1, PSI: 2, KPA: 3 };
        const sizeOf = (x) => (x === null ? null : x >= 60 && x <= 600 ? 'KPA' : x >= 7 && x < 60 ? 'PSI' : x >= TYRE_P[0] && x <= TYRE_P[1] ? 'BAR' : null);
        const sizeUnit = () => {
            const m = lastRaw.tyreP, was = carUnits.guess;
            if (carUnits.press !== null || !carUnits.late || !m) return false;
            const four = TYRES.map((w) => sizeOf(sc('tyrePress', m['actualValuePressureTyre' + w + 'H']))).filter(Boolean);
            const u = four.reduce((a, b) => (a === null || SIZE[b] > SIZE[a] ? b : a), null);
            if (u === null || u === was || (was !== null && SIZE[u] < SIZE[was] && four.length < 3)) return false;
            carUnits.guess = u;
            log.info('car units: none from the car - tyre pressures are read as ' + u + ', by their size');
            return true;
        };
        const UNIT_VALUES = {
            tyreP: (v) => TYRES.forEach((w) => tyre('p' + w, 'tyrePress', v['actualValuePressureTyre' + w + 'H'], tyreP)),
            tyrePT: (v) => TYRES.forEach((w) => tyre('pt' + w, 'tyrePress', v['targetPressureTyre' + w + 'H'], tyreP)),
            tyreT: (v) => TYRES.forEach((w) => tyre('t' + w, 'tyreTemp', v['actualValueTemperatureTyre' + w + 'H'], tyreT)),
            boost: (v) => {
                const raw = v.displayBoostPressure, b = sc('boost', raw);
                if (b === null) { if (noValue('boost', raw)) lost('boostFes'); return; }
                // the largest number the field holds is where it stops, not a reading: none, so the engine unit is tried
                if (S.boost && raw === S.boost.ceiling) { this.top.boostFes = true; lost('boostFes', true); return; }
                delete this.top.boostFes;
                // in the car's pressure unit: 0.01 bar (or 1 kPa) a step, 0.1 psi a step on a car set to psi
                put('boostFes', psi() ? b * 10 / 14.5038 : b);
            },
        };
        /** The last message of each is taken again (noBoost: but for the sport display's boost). */
        const replay = (noBoost) => ['tyreP', 'tyrePT', 'tyreT'].concat(noBoost ? [] : ['boost']).forEach((n) => { if (lastRaw[n]) UNIT_VALUES[n](lastRaw[n]); });
        /** The sport display's boost was taken in another unit than the car's: it goes, with its peak and its trace. */
        const boostGone = () => {
            delete live.boostFes; delete this.first.boostFes; delete this.bad.boostFes; delete this.gone.boostFes; delete this.top.boostFes;
            delete this.peak.boost;
            this.trace.boost.length = 0; this.trace.target.length = 0;
            this.updBoost();
        };
        /** The units changed, or were only guessed until now: what was taken in the other unit goes (boost: false = its unit is the same). */
        const unitReset = (boost) => {
            TYRES.forEach((w) => ['p', 'pt', 't'].forEach((p) => { delete live[p + w]; delete this.bad[p + w]; delete this.gone[p + w]; }));
            this.tyreStart = {};
            if (boost !== false) boostGone();
        };
        const unitValue = (name, v) => {
            if (!v) return;
            lastRaw[name] = v;
            if (!unitsReady()) return;
            // no unit from the car, and the tyres point to another one than before: the tyre values are taken again in it.
            // The sport display's boost goes when that unit is psi or the one before was. Its last message is taken again
            // if it was read without any unit found (as bar); after that the car may really have been set to another unit,
            // and the message be of the old one: the next one is waited for
            const was = psi(), had = carUnits.guess !== null;
            if (name === 'tyreP' && sizeUnit()) { unitReset(was !== psi()); replay(had); } else UNIT_VALUES[name](v);
        };
        setTimeout(() => {
            // (the kit does not guard a timer the app starts itself, and an uncaught error would stop the app)
            try {
                if (carUnits.press !== null) return;
                carUnits.late = true;
                log.info('car units: none received after ' + UNITS_WAIT_MS / 1000 + ' s - the pressure unit is told by the size of the tyre pressures, tyre temperatures taken as deg C');
                sizeUnit();
                replay();
            } catch (e) { log.warn('car units: ' + (e && e.stack || e)); }
        }, UNITS_WAIT_MS);

        this.oilDme = false;            // the oil temperature shown is the engine unit's
        const oilCar = { at: NEVER, lost: false };     // the car's own oil temperature: last good one, and "no value" since
        let gearLogs = 0, lastModeKey = '';
        const watches = [
            ['de.bmw.infotainment.vehicle.CDS', {
                statusEngineSpeed2: (v) => take('rpm', 'rpm', v.actualValueRPMEngineCrankshaft),
                statusEngineTemperature: (v) => {
                    logRaw('engine temperatures', [v.temperatureEngineDrive, v.temperatureEngineOilDrive]);
                    take('coolant', 'engineTemp', v.temperatureEngineDrive);
                    const raw = v.temperatureEngineOilDrive, oil = sc('engineTemp', raw);
                    if (oil === null) { if (noValue('engineTemp', raw)) { oilCar.lost = true; if (!this.oilDme) lost('oil'); } return; }
                    // (the car's own value: it takes over from the engine unit's again)
                    if (RANGE.oil[0] <= oil && oil <= RANGE.oil[1]) { oilCar.at = mono(); oilCar.lost = false; this.oilDme = false; put('oil', oil); }
                    else { oilCar.lost = true; if (!this.oilDme) put('oil', oil); }
                },
            }],
            ['de.bmw.infotainment.vehicle.CDS2', {
                statusLongitudinalAccelerationMassCenter: (v) => {
                    logRaw('longitudinal acceleration' + (standing() ? ' (standing)' : ''), v.longitudinalAccelerationCentreOfGravity);
                    putG('gLong', v.longitudinalAccelerationCentreOfGravity);
                },
                statusLateralAccelerationMassCenter: (v) => {
                    logRaw('lateral acceleration' + (standing() ? ' (standing)' : ''), v.lateralAccelerationCentreOfGravity);
                    putG('gLat', v.lateralAccelerationCentreOfGravity);
                },
            }],
            ['de.bmw.infotainment.vehicle.Vehicle', {
                statusNewCurrentUnitsStatusExt: (v) => {
                    logRaw('car units [pressure, temperature]', [v && v.unitOfMeasurementAirPressure, v && v.unitOfMeasurementTemperature]);
                    let press = unitName(PRESS_UNITS, v && v.unitOfMeasurementAirPressure), temp = unitName(TEMP_UNITS, v && v.unitOfMeasurementTemperature);
                    // (a unit the app does not know, or none, never takes the place of one the car has named: the
                    // values would wait for a unit again, and the wait has run out by then)
                    if (press === null) press = carUnits.press;
                    if (temp === null) temp = carUnits.temp;
                    if (press === carUnits.press && temp === carUnits.temp) return;
                    const first = carUnits.press === null;
                    carUnits.press = press; carUnits.temp = temp;
                    if (press !== null) carUnits.guess = null;
                    log.info('car units: pressure ' + (press || '?') + ', temperature ' + (temp || '?'));
                    unitReset();
                    // known for the first time: the values that waited (or were read by their size) are taken in the car's unit
                    if (first && press !== null) replay();
                },
            }],
            ['de.bmw.infotainment.vehicle.Vehicle2', Object.assign({ statusCarSpeed2: (v) => take('speed', 'speed', v.speedVehicleCentreOfGravity) }, engine.handlers())],
            ['de.bmw.infotainment.drivingexcitement.FES', {
                statusSwitchDriveDynamicSport2: (v) => {
                    logRaw('FES boost', v.displayBoostPressure);
                    logRaw('FES g [lat, long]', [v.displayLateralAcceleration, v.displayLongitudinalAcceleration]);
                    unitValue('boost', v);
                },
                // the HMI's sport display: power / torque in % of the car's maximum
                statusVehicleDynamicEngine: (v) => {
                    logRaw('sport display [power %, torque %]', [v.displaySportEnginePower, v.displaySportEngineTorque]);
                    take('powerPct', 'sportPct', v.displaySportEnginePower); take('torquePct', 'sportPct', v.displaySportEngineTorque);
                },
                // (only logged: whether the car gives the sport display's 100 % itself)
                statusVehicleDynamicEngineMaxValue: (v) => logRaw('sport display maximum [power, torque]', [v && v.displayMaximumValuePower, v && v.displayMaximumValueTorque]),
                // negative = engine braking: shown as 0
                statusActualValueTorque2: (v) => {
                    logRaw('torque', v.actualValueTorqueCrankshaft);
                    take('torque', 'torque', v.actualValueTorqueCrankshaft, (tq) => Math.max(0, tq));
                },
            }],
            ['de.bmw.infrastructure.VehicleInformation', {
                statusGearboxDrive: (v) => {
                    const g = gearOf(v && v.statusActualGearDrive);
                    if (g !== undefined) { live.gear = g; this.lastCar = mono(); }
                    live.stage = STAGES[v && v.statusActualStageDrive];
                    live.gearMode = modeOf(v);
                    // field names / values differ per car: logged, so the D / S / M detection can be checked
                    const key = JSON.stringify(Object.keys(v || {}).filter((x) => x !== 'statusActualGearDrive').map((x) => [x, v[x]]));
                    if (key !== lastModeKey && gearLogs < 40) { gearLogs++; lastModeKey = key; log.info('gearbox: ' + JSON.stringify(v) + ' -> ' + (live.gearMode || '?')); }
                },
                // some cars never send statusGearboxDrive: P / R / N / gear from here too
                DataPowerTrain2: (v) => {
                    logRaw('gear selection', v && v.statusGearSelectionDrive);
                    const sel = selectionOf(v && v.statusGearSelectionDrive);
                    if (!sel) return;
                    if (sel.stage !== undefined) live.stage = sel.stage;
                    live.gear = sel.gear; this.lastCar = mono();
                },
            }],
            ['de.bmw.infrastructure.analytics.BasicDataSet', {
                basicDataSet: (v) => {
                    logRaw('gearbox oil', v.valueTemperatureTransmissionOil);
                    take('gearbox', 'gearboxTemp', v.valueTemperatureTransmissionOil);
                },
            }],
            ['de.bmw.infrastructure.EnvironmentalInformation', {
                ExteriorTemperature: (v) => {
                    logRaw('outside temperature', v.temperatureExterior);
                    take('ambient', 'ambient', v.temperatureExterior);
                },
            }],
            ['de.bmw.infotainment.vehicle.TPMS', {
                statusTyreTemperature: (v) => {
                    logRaw('tyre temperature', [v.actualValueTemperatureTyreFLH, v.actualValueTemperatureTyreFRH, v.actualValueTemperatureTyreRLH, v.actualValueTemperatureTyreRRH]);
                    unitValue('tyreT', v);
                },
                statusTyrePressure: (v) => {
                    logRaw('tyre pressure', [v.actualValuePressureTyreFLH, v.actualValuePressureTyreFRH, v.actualValuePressureTyreRLH, v.actualValuePressureTyreRRH]);
                    if (v && v.actualValuePressureTyreFLH === undefined) logRaw('tyre pressure fields', Object.keys(v));
                    unitValue('tyreP', v);
                },
                statusTargetTyrePressure: (v) => {
                    logRaw('target tyre pressure', [v.targetPressureTyreFLH, v.targetPressureTyreFRH, v.targetPressureTyreRLH, v.targetPressureTyreRRH]);
                    unitValue('tyrePT', v);
                },
            }],
            ['de.bmw.infotainment.misc.MDrive', {
                dataDisplayGearbox: (v) => {
                    logRaw('gear programme', v && v.displayProgramGearbox);
                    live.program = PROGRAMS[v && v.displayProgramGearbox] || null;
                },
            }],
        ];
        log.info('subscribing signals');
        // tyre values are also read every 10 s: a car may not notify them
        Promise.all(watches.map(([iface, h]) => ctx.signals.watch(iface, '1', h, log, /\.TPMS$/.test(iface) ? { pollMs: 10000 } : undefined)
            .then((s) => { this.subs.push(s); return s; })))
            .then((all) => log.info('signals: ' + all.map((s) => s.iface.split('.').pop() + (s.error ? '(err)' : '')).join(' ')))
            .catch((e) => log.warn('signals: ' + e));

        /* ---------- engine unit and gearbox unit (read only) ---------- */
        const dme = this.dme = Object.assign({ ecu: 18 }, cfg.dme || {});
        // (the signals object goes through mhdflex.js's tap, which passes everything on as it is: it lets the MHD flex
        // choice use this link's one proxy and one subscription instead of opening a second link)
        const tapped = Mhd.tap(ctx.signals);
        const link = this.link = new ReadOnlyDiag(tapped.signals, log);
        Promise.resolve().then(() => link.init()).catch((e) => log.warn('diagnostic link: ' + e));   // in the background: the screen never waits for it
        const rd = this.rd = new DidReader(link, { ecu: dme.ecu });
        const at = this.dmeAt = {}, fail = this.dmeFail = {}, rest = {}, slow = {};
        const ecuOf = (c) => (c.ecu == null ? dme.ecu : c.ecu);
        const unitLabel = (ecu) => (ecu === dme.ecu ? 'DME' : ecu === 24 ? 'EGS' : 'unit ' + ecu);
        /* a unit that does not answer (see UNIT_MISSES above) */
        const units = {};
        const unit = this.unit = (ecu) => units[ecu] || (units[ecu] = { ecu, miss: 0, live: false, down: false, step: 0, retryAt: 0, heardT: NEVER, wokeT: NEVER, wakes: 0, wakeAt: 0 });
        const heard = (u) => {
            u.miss = 0; u.live = true; u.heardT = mono(); u.wakes = 0; u.wakeAt = 0;
            if (u.down) { u.down = false; u.step = 0; log.info(unitLabel(u.ecu) + ': answering again'); }
        };
        /**
         * A request to u, handed over at sentT, that nobody answered. True when the unit had answered the request before
         * this one: then the silence is this one identifier's. Else it is the unit's (asleep, not there).
         */
        const missed = (u, sentT) => {
            const own = u.live;
            u.live = false;
            // (the engine was started while it was out: it says nothing about the unit now, which gets its one request at once)
            if (u.wokeT > sentT) { u.retryAt = mono(); return false; }
            u.miss++;
            if (u.down) { u.step = Math.min(u.step + 1, UNIT_RETRY_MS.length - 1); u.retryAt = mono() + UNIT_RETRY_MS[u.step]; }
            else if (u.miss >= UNIT_MISSES) {
                u.down = true; u.step = 0; u.retryAt = mono() + UNIT_RETRY_MS[0];
                log.info(unitLabel(u.ecu) + ': no answer to ' + UNIT_MISSES + ' requests in a row - left alone, asked once after ' + UNIT_RETRY_MS[0] / 1000 + ' s and then less and less often');
            }
            return own;
        };
        const mayAsk = (u) => !u.down || mono() >= u.retryAt;
        /*
         * An engine start (see put): a unit may have slept with the engine off. One that was given up gets one request
         * at once, and its waits start again from the shortest; one that was about to be given up is counted afresh.
         * This is bounded as well, for a unit that is not there at all and an engine that starts every minute (a
         * hybrid, automatic start-stop): the next engine start counts for a unit only UNIT_RETRY_MS[0] after the
         * last one that did, then [1], ... and its waits start again from that entry - until it answers.
         */
        const wakeUnits = () => Object.keys(units).forEach((e) => {
            const u = units[e], now = mono(), n = Math.min(u.wakes, UNIT_RETRY_MS.length - 1);
            if (now < u.wakeAt || !(u.down || u.miss)) return;
            u.wakes++; u.wakeAt = now + UNIT_RETRY_MS[n]; u.wokeT = now;
            u.miss = 0; u.step = n - 1; u.retryAt = now;
        });
        /*
         * The kit's link paces its requests on the wall clock: after the clock was set back, its "earliest next
         * request" lies in the future and every read would wait out the step. A stamp that far ahead is cleared.
         */
        const unstick = () => { if (link.next - Date.now() > 2000) link.next = 0; };
        /**
         * Did nobody answer this request? No reply came, or the gateway said at once that it cannot reach the unit.
         * (Not that: the transport turned the request away because it was busy with someone else's.)
         */
        const unanswered = (r) => r.why === 'no reply' || (/^transport refused/.test(r.why || '') && !/TEMPORARILY_NOT_ACCEPTED|BUSY/i.test(r.why));
        /** The first replies of every identifier asked go to the log, with what they were read as. */
        const logReply = (c, r, name) => logRaw((name || unitLabel(ecuOf(c))) + ' ' + DidReader.label(c),
            r.bytes ? r.bytes + (r.value === null || r.value === undefined ? '' : ' = ' + Math.round(r.value * 1000) / 1000) + (r.why ? ' (' + r.why + ')' : '') : r.why || 'no value', 6);
        /*
         * One value from its candidates, tried as the kit's DidReader.value() tries them (the one that answered last
         * first; a refused or implausible one passes to the next). Other than there:
         *   - a request nobody answered ends the try: each unanswered request holds the diagnostic transport. If the
         *     unit answered the request before it, the silence is the identifier's: one that has never given a
         *     value lets the next one go first next time; one that has is asked again (a lost reply must not move
         *     intake air to its second sensor, the charge air cooler's). If not, it is the unit's (missed())
         *   - a request the transport turned away (busy with someone else's) ends the round (jam): it says nothing
         *     about the value, so it neither counts against it nor passes to another identifier
         * how = how a try ended without a value: 'rest' | 'down' (the unit is given up, or going silent) | 'silent' (this
         * identifier got no answer from a unit that answers) | 'busy' | 'range' | 'refused'.
         */
        let how = '', jam = false;
        const gave = {};                // value + identifier that has given a value, and the one a value is read from (logged)
        const ask = async (name, list) => {
            list = list || [];
            const start = rd.pick[name] || 0;
            let range = false;
            for (let n = 0; n < list.length; n++) {
                const i = (start + n) % list.length, c = list[i], u = unit(ecuOf(c));
                if (!mayAsk(u)) { how = 'down'; return null; }
                link.wake(u.ecu);           // the giving up is done here (unit()): the link's own must not lock the unit out as well
                unstick();
                const sentT = mono();
                const v = await rd.read(c), r = rd.raws[rd.key(c)] || {};
                logReply(c, r);
                if (r.bytes) heard(u);
                if (v !== null) {
                    rd.pick[name] = i; gave[name + ':' + i] = true;
                    if (gave[name] !== i) { gave[name] = i; log.info(name + ': read from ' + unitLabel(u.ecu) + ' ' + DidReader.label(c) + (list.length > 1 ? ' (' + (i + 1) + ' of ' + list.length + ')' : '')); }
                    return v;
                }
                if (unanswered(r)) {
                    // the identifier's own silence only when the unit answered the request before this one. A unit that is
                    // silent altogether is not the value's business: booked on the value, intake air went on resting for
                    // minutes after the unit answered again, and moved on to its next identifier while the unit slept
                    // (the charge air cooler's sensor, which then answered first when the engine was started)
                    const own = missed(u, sentT);
                    if (own && !gave[name + ':' + i]) rd.pick[name] = (i + 1) % list.length;
                    how = own ? 'silent' : 'down';
                    return null;
                }
                if (!r.bytes) { how = 'busy'; jam = true; return null; }
                if (r.why === 'out of range') range = true;
            }
            how = range ? 'range' : 'refused';
            return null;
        };
        /**
         * The same with the value's own back-off: after 3 tries in a row without a value it rests - refused: 30 s, as
         * before; not answered by a unit that answers its other requests: 30 s, then twice as long each time, up to
         * 10 minutes. A value that was only out of range (rail pressure of a stopped engine) is asked again in the
         * next round: it answers at once. A unit that is silent altogether is not the value's business (unit()).
         */
        const read = async (name, list) => {
            if (mono() < (rest[name] || 0)) { how = 'rest'; return null; }
            const v = await ask(name, list);
            if (v !== null) { fail[name] = 0; slow[name] = 0; return v; }
            if (how === 'silent' || how === 'refused') {
                fail[name] = (fail[name] || 0) + 1;
                if (fail[name] >= 3) { slow[name] = how === 'silent' ? Math.min(600000, (slow[name] || 15000) * 2) : 30000; rest[name] = mono() + slow[name]; }
            }
            return null;
        };
        // fuel rail: a diesel's common rail runs far above what is plausible for a petrol engine ("maxDiesel" in app.json)
        const dieselRail = (dme.hpfp || []).map((c) => (c.maxDiesel != null ? Object.assign({}, c, { max: c.maxDiesel }) : c));
        const cands = (k) => (k === 'hpfp' && engine.profile && engine.profile() === 'diesel' ? dieselRail : dme[k]);
        let baro = 101.3, baroT = NEVER, timer = null, busy = false, last = NEVER, round = 0;
        const freshBaro = async () => {
            if (mono() - baroT <= 60000) return;
            const b = await read('baro', dme.baro);
            if (b !== null) baro = b;
            if (!jam) baroT = mono();
        };
        /** Boost from the engine unit: charge / manifold pressure (absolute, kPa) minus outside air pressure -> bar. */
        const readBoost = async () => {
            await freshBaro();
            const m = jam ? null : await read('boost', dme.boost);
            return m === null ? null : (m - baro) / 100;
        };
        /** Boost target and actual (absolute kPa -> bar above outside air); null while the target doesn't answer. */
        const readBoostCtl = async () => {
            let target = await read('boostTarget', dme.boostTarget);
            if (target === null) return null;
            let actual = jam ? null : await read('boostActual', dme.boostActual);
            if (!jam) await freshBaro();
            target = (target - baro) / 100;
            actual = actual === null ? null : (actual - baro) / 100;
            return { target, actual };
        };
        const have = (k) => (dme[k === 'boostCtl' ? 'boostTarget' : k] || []).length > 0;
        /**
         * Engine oil from the engine unit only while the car's own signal has none: it never delivered one (a 330e
         * sends none), or the car marks it "no value". A signal that is merely steady is left alone: the two sources
         * can differ, and the reading would step between them.
         */
        this.needOil = () => (dme.oil || []).length > 0 && (oilCar.lost || (oilCar.at === NEVER && mono() - this.startT > 15000));
        // (once a session it is read all the same, only for the log: whether the two sources differ is not known from any car)
        let oilTried = false;

        /* ---------- ethanol content: a slot of its own (see ETH_MS above) ---------- */
        const ethNew = (src) => ({ src, value: null, at: NEVER, source: '', tried: NEVER, i: 0, ids: [], why: '' });
        const eth = this.eth = ethNew('off');
        /*
         * The choice "MHD flex" (mhdflex.js). Its two reads go through the read-only link, its three non-read
         * requests through the Gate, in this link's queue so they never overlap a read. The Gate hands nothing to
         * the transport unless, at that moment, the setting says MHD flex, engine data is on and no demo data is
         * shown, and never more often than its limits allow (mhdflex.js LIMITS). A change of the ethanol setting,
         * or one that switches this on or off, starts the steps over at once; what was sent stays counted.
         */
        const mhdOn = () => settings.get('ethanol') === 'mhd' && settings.get('engineData') !== 'off' && !this.usingDemo();
        const gate = this.gate = new Mhd.Gate(tapped, mhdOn, log, mono, () => (this.mhd ? this.mhd.gen : 0));
        const mhdAsk = async (ask) => {
            const u = unit(dme.ecu);
            link.wake(u.ecu); unstick();
            let r;
            try { r = await ask(); } catch (e) {
                const m = String(e && e.message || e);
                if (!/^transport refused/.test(m)) throw e;                 // not a verdict of the transport: the step fails with it
                return /TEMPORARILY_NOT_ACCEPTED|BUSY/i.test(m) ? undefined : null;
            }
            if (r) heard(u);
            return r;
        };
        const mhd = this.mhd = new Mhd.MhdFlex({
            read: (did, ms) => mhdAsk(() => link.read(Mhd.DME, did, ms)),
            // (the steps' generation is noted here, when they ask: the request may wait in the link's queue before the Gate sees it)
            send: (sid, data, ms, accept) => { const ep = mhd.gen; return mhdAsk(() => link.queue(() => gate.send(sid, data, ms, accept, ep))); },
            now: mono, log,
        });
        let mhdWas = mhdOn();
        settings.onChange((k) => { const on = mhdOn(); if (k === 'ethanol' || on !== mhdWas) mhd.reset(); mhdWas = on; });
        const readMhd = async () => {
            const now = mono(), u = unit(dme.ecu);
            if (dme.ecu !== Mhd.DME || !mhdOn() || now - (this.wantT.ethanol || NEVER) > 1500) return;
            if (u.down || now - u.heardT > ETH_ALIVE_MS) return;
            if ((await mhd.step()) === 'busy') jam = true;
        };
        const readEthanol = async () => {
            const src = settings.get('ethanol') || 'off';
            mhdWas = mhdOn();                     // (demo data on Auto comes and goes without a setting being changed)
            if (src !== eth.src) { Object.assign(eth, ethNew(src)); mhd.reset(); }          // another source: nothing of the old one is kept
            if (src === 'mhd') { await readMhd(); return; }
            const list = (dme.ethanol || {})[src] || [], now = mono(), u = unit(dme.ecu);
            if (!list.length || now - (this.wantT.ethanol || NEVER) > 1500 || now - eth.tried < ETH_MS) return;
            // only from an engine unit that is answering: its silence then means "not this identifier", not "asleep"
            if (u.down || now - u.heardT > ETH_ALIVE_MS) return;
            const id = (i) => eth.ids[i] || (eth.ids[i] = { until: 0, tries: 0, absent: false, gave: false });
            // the identifier that answered last, else the next one that is not resting; one identifier a try
            let j = -1;
            for (let n = 0; n < list.length && j < 0; n++) { const i = (eth.i + n) % list.length; if (now >= id(i).until) j = i; }
            if (j < 0) return;
            eth.i = j; eth.tried = now;
            const c = list[j], s = id(j), label = DidReader.label(c);
            link.wake(u.ecu); unstick();
            const v = await rd.read(c), r = rd.raws[rd.key(c)] || {};
            logReply(c, r, 'ethanol');
            if (r.bytes) heard(u);
            const b = (r.bytes || '').split(' ');
            // (raw FF is the usual "no value" of a one-byte field, and E100 is not a fuel anyone fills)
            if (v !== null && b[b.length - 1] !== 'FF') { eth.value = v; eth.at = mono(); eth.source = label; eth.why = ''; s.tries = 0; s.absent = false; s.gave = true; return; }
            if (!r.bytes && !unanswered(r)) { jam = true; return; }                                                   // the transport was busy: nothing learned
            // the engine unit answered, and not with a reading: the last reading ends with that (after no answer at
            // all it is shown until it is ETH_FRESH_MS old, and not longer)
            if (r.bytes) eth.value = null;
            if (r.bytes && !/^NRC/.test(r.why)) { eth.why = 'not a plausible value'; s.tries = 0; s.absent = false; return; }       // asked again after ETH_MS
            // "I have no such identifier" is believed of one that never gave a value. From one that did, it is tried again
            // like any other refusal: every app hears every reply, and a refusal meant for another app's request looks the same
            const absent = /NRC (31|11|12)/.test(r.why) && !s.gave;
            s.absent = absent; s.tries = absent ? 0 : s.tries + 1;
            if (absent || s.tries >= ETH_TRIES) {
                s.until = mono() + ETH_REST_MS;
                eth.i = (j + 1) % list.length;
                if (list.length > 1 && now >= id(eth.i).until) eth.tried = NEVER;         // the other form of the same PID may go in the next round
            }
            eth.why = list.every((x, i) => id(i).absent) ? 'not on this car'
                : absent ? 'reading...' : unanswered(r) ? 'no answer to ' + label : 'refused by the engine unit';
        };

        /*
         * The engine unit is only asked while someone can see the result or the engine runs: with the
         * app on screen (the values of the gauge set shown about twice a second, everything else every
         * 5 s so the traces keep filling) or, off screen, every 5 s while the engine turns. A parked,
         * switched-off car is left alone.
         */
        const poll = async () => {
            busy = true; last = mono(); round++; jam = false;
            const now = mono();
            const onScreen = now - this.screenT < 3000, running = now - this.rpmT < 10000 && live.rpm > 400;
            const needBoost = this.boostFromDme(), needOil = this.needOil();
            const visible = DME_KEYS.filter((k) => k !== 'egs' && have(k) && now - (this.wantT[k] || NEVER) < 1500)
                .concat(needBoost && now - (this.wantT.boost || NEVER) < 1500 ? ['boost'] : []);
            const fast = onScreen && visible.length && round % 12 ? visible : null;
            try {
                if (settings.get('engineData') !== 'off' && link.available && (onScreen || running) && !this.usingDemo()) {
                    const oilOnce = !oilTried && oilCar.at !== NEVER && (dme.oil || []).length > 0;
                    const keys = fast || DME_KEYS.filter(have).concat(needBoost ? ['boost'] : [], needOil || oilOnce ? ['oil'] : []);
                    for (const k of keys) {
                        const v = k === 'boost' ? await readBoost() : k === 'boostCtl' ? await readBoostCtl() : await read(k, cands(k));
                        if (jam) break;                                  // the transport is busy with someone else's request: the next round
                        if (k === 'oil') oilTried = true;
                        if (v === null || v === undefined) continue;
                        if (k === 'oil' && !this.needOil()) {            // the car has its own value: the engine unit's is not shown
                            if (G.isNum(live.oil)) log.info('oil temperature: the car\'s own signal reads ' + live.oil + ' deg C, the engine unit ' + v + ' deg C (the signal is the one shown)');
                            continue;
                        }
                        at[k] = mono();
                        if (k === 'boostCtl') {
                            const okT = put('boostTarget', v.target), okA = v.actual !== null && put('boostActual', v.actual);
                            if (!okA) delete live.boostActual;
                            // the two as they came in this one round: what "against target" is worked out from
                            this.pair = { target: okT ? v.target : null, actual: okA ? v.actual : null, at: at[k] };
                        } else if (k === 'oil') { if (put('oil', v)) this.oilDme = true; }
                        else put(k === 'boost' ? 'boostDme' : k, v);
                    }
                    // last, and never in place of another value
                    if (!jam) await readEthanol();
                }
            } catch (e) { log.warn('engine unit poll: ' + e); }
            busy = false;
            timer = setTimeout(poll, fast ? 400 : 5000);
        };
        timer = setTimeout(poll, 1500);
        /** A gauge set that shows engine-unit values was opened: don't wait for the slow timer. */
        this.kick = () => { if (!busy && mono() - last > 600) { clearTimeout(timer); timer = setTimeout(poll, 0); } };

        // 1 Hz histories (5 minutes) for the thermal traces
        // (the kit does not guard a timer the app starts itself, and an uncaught error would stop the app;
        // an error that keeps coming is logged the first time and then once in 300, not every time)
        let histErr = 0, traceErr = 0;
        setInterval(() => {
            try {
                const d = this.data();
                Object.keys(this.hist).forEach((k) => {
                    let v = d[k] == null ? null : d[k];
                    if (DME_KEYS.indexOf(k) >= 0 && !this.fresh(k)) v = null;
                    this.hist[k].push(v); if (this.hist[k].length > HIST_SEC) this.hist[k].shift();
                });
            } catch (e) { if (histErr++ % 300 === 0) log.warn('history (' + histErr + 'x): ' + (e && e.stack || e)); }
        }, 1000);
        // 5 Hz boost trace (60 s) for the Boost gauge set
        setInterval(() => {
            try {
                const d = this.data(), tr = this.trace, p = this.boostPair(d, PAIR_TRACE_MS);
                tr.boost.push(G.isNum(d.boost) ? d.boost : null);
                tr.target.push(G.isNum(p.target) ? p.target : null);
                if (tr.boost.length > TRACE_N) { tr.boost.shift(); tr.target.shift(); }
            } catch (e) { if (traceErr++ % 300 === 0) log.warn('boost trace (' + traceErr + 'x): ' + (e && e.stack || e)); }
        }, TRACE_MS);
    }

    remember(keys) {
        const add = keys.filter((x, i) => x && !this.seen[x] && keys.indexOf(x) === i);
        if (!add.length) return;
        add.forEach((x) => { this.seen[x] = true; });
        this.log.info('real data from the car: ' + add.join(', '));
        try { fs.writeFileSync(this.seenFile, JSON.stringify(this.seen)); } catch (e) { this.log.warn('seen save: ' + e); }
    }
    /** A MOVE value counts once it changed this session or the car is known to send it. */
    trusted(k) { return MOVE[k] == null || !!this.moved[k] || !!this.seen[k]; }

    carPresent() { return this.lastCar > 0 || this.subs.some((s) => s.available); }
    /** Auto: demo only until the car answers (a parked car sends nothing new for minutes, which is not "no car"). */
    usingDemo() {
        const m = this.settings.get('demo');
        return m === 'on' || (m === 'auto' && !this.carPresent() && mono() - this.startT > 5000);
    }
    /**
     * usingDemo(), and: the demo drive and the car never share a trace. When one takes over from the other, the
     * histories, the boost trace and the g trail start empty (peaks and tyre starts are kept apart anyway).
     */
    mode() {
        const demo = this.usingDemo();
        if (demo !== this.wasDemo) {
            if (this.wasDemo !== undefined) {
                Object.keys(this.hist).forEach((k) => { this.hist[k].length = 0; });
                this.trace.boost.length = 0; this.trace.target.length = 0; this.trail.length = 0;
            }
            this.wasDemo = demo;
        }
        return demo;
    }

    /** What the screen shows: demo data as it is; the car's values with doubtful ones left out until proven real. */
    data() {
        if (this.mode()) {
            const d = this.demo.sample();
            TYRES.forEach((k) => { if (this.demoTyreStart['p' + k] === undefined) this.demoTyreStart['p' + k] = d['p' + k]; });
            return d;
        }
        this.sweep();
        const v = Object.assign({}, this.live);
        Object.keys(MOVE).forEach((k) => { if (!this.trusted(k)) v[k] = null; });
        v.boost = this.boostNow();
        return v;
    }

    /**
     * Boost from the source the setting asks for; Auto: the sport display if it works, else the engine unit.
     * The engine unit's boost counts while its last answer is fresh, as its other values do. In Auto it also goes
     * before a sport-display reading the car has taken back ("no value", or out of range) and that is only still
     * kept for GONE_MS: above the sport display's ceiling the dial must not hold the last number below it.
     */
    boostNow() {
        const src = this.settings.get('boostSource'), live = this.live;
        const fes = G.isNum(live.boostFes) ? live.boostFes : null;
        const dmeB = G.isNum(live.boostDme) && mono() - (this.dmeAt.boost || NEVER) < FRESH_MS ? live.boostDme : null;
        const fesOk = fes !== null && this.trusted('boostFes'), dmeOk = dmeB !== null && this.trusted('boostDme');
        return src === 'fes' ? fes : src === 'dme' ? dmeB
            : fesOk && !(this.gone.boostFes !== undefined && dmeOk) ? fes : dmeOk ? dmeB : null;
    }
    updBoost() {
        this.live.boost = this.boostNow();
        this.raiseIn(this.peak, 'boost', this.live.boost);
    }
    /** Boost still needed from the engine unit? (also from the moment the car takes the sport display's value back) */
    boostFromDme() {
        const src = this.settings.get('boostSource');
        return (this.dme.boost || []).length > 0 && (src === 'dme'
            || (src !== 'fes' && !(G.isNum(this.live.boostFes) && this.trusted('boostFes') && this.gone.boostFes === undefined)));
    }
    /**
     * Boost target and actual as the engine unit gave them in ONE round, while that round is fresh:
     * { target, actual } in bar, each a number or null (d: the data being drawn; the demo drive has its own pair).
     * maxAge: how old the round may be (default PAIR_MS).
     */
    boostPair(d, maxAge) {
        if (this.usingDemo()) return { target: d && G.isNum(d.boostTarget) ? d.boostTarget : null, actual: d && G.isNum(d.boostActual) ? d.boostActual : null };
        const p = this.pair;
        return p && mono() - p.at < (maxAge || PAIR_MS) ? { target: p.target, actual: p.actual } : { target: null, actual: null };
    }

    /**
     * Power in kW, and how it was worked out. As shipped: crankshaft torque x engine speed, both the car's own
     * figures (calc: true). The sport display's % of the car's maximum only when someone chose it AND told the app
     * what 100 % is on this car ("Max power", not set as shipped) and the car really sends a % that moves. Both are
     * estimates: the torque is the engine unit's own calculation, not a measurement.
     */
    power(d) {
        const max = this.settings.get('sportMaxPower');
        if (this.settings.get('powerSource') === 'sport' && max > 0 && G.isNum(d.powerPct)) return { kw: d.powerPct / 100 * max, calc: false };
        return { kw: G.isNum(d.powerCalc) ? d.powerCalc : null, calc: true };
    }

    /* ---------- peaks ---------- */
    pk() { return this.usingDemo() ? this.demoPeak : this.peak; }
    /**
     * Peak hold: a peak follows new highs and drops back to the current value "peakHold" seconds after
     * it was last raised (0 = until Reset peaks). The car's values raise their peaks as they arrive; main.js
     * calls this per frame as well, so a peak also drops back while nothing new arrives (and for the demo drive).
     */
    raiseIn(o, k, v) {
        if (!G.isNum(v)) return;
        const atMap = this.peakAt.get(o) || this.peakAt.set(o, {}).get(o), now = mono(), hold = this.settings.get('peakHold') * 1000;
        if (o[k] === undefined || v >= o[k] || (hold > 0 && now - (atMap[k] === undefined ? NEVER : atMap[k]) > hold)) { o[k] = v; atMap[k] = now; }
    }
    raise(k, v) { this.raiseIn(this.pk(), k, v); }
    /** Session maximum (never drops until reset): for the g-force peaks. */
    maxIn(o, k, v) { if (G.isNum(v) && (o[k] === undefined || v > o[k])) o[k] = v; }
    max(k, v) { this.maxIn(this.pk(), k, v); }
    resetPeaks() {
        const o = this.pk();
        Object.keys(o).forEach((k) => delete o[k]);
        if (this.usingDemo()) this.demoTyreStart = {}; else this.tyreStart = {};
        this.log.info('peaks reset');
    }
    starts() { return this.usingDemo() ? this.demoTyreStart : this.tyreStart; }

    /** The car's display units, for the notes on the screen: known (the car said), late (it never did), psi (taken as psi). */
    units() {
        const u = this.carUnits;
        return { known: u.press !== null || this.usingDemo(), late: u.late, psi: (u.press || u.guess) === 'PSI' };
    }

    /* ---------- engine unit bookkeeping ---------- */
    seenScreen() { this.screenT = mono(); }
    /** These engine-unit values are on screen now. */
    want(keys) {
        const now = mono();
        keys.forEach((k) => { this.wantT[k] = now; });
        this.kick();
    }
    /** Is an engine-unit value fresh (demo: always)? */
    fresh(k) { return this.usingDemo() || mono() - (this.dmeAt[k] || NEVER) < FRESH_MS; }
    /** The car / engine unit has sent real data for this group (demo: yes). */
    has(group) { return this.usingDemo() || !!this.seen[group]; }

    /** Why a car signal is missing (short: it goes under a tile). */
    why(k) {
        if (this.bad[k] !== undefined) return 'not a real value';
        if (this.gone[k] !== undefined) return 'no value from the car';
        if (G.isNum(this.live[k]) && !this.trusted(k)) return 'waiting for a change';
        return 'no data from the car';
    }
    /** Has the unit this value is read from been given up as not answering? */
    unitDown(k) {
        const c = (this.dme[k === 'boostCtl' ? 'boostTarget' : k] || [])[0];
        return this.unit(c && c.ecu != null ? c.ecu : this.dme.ecu).down;
    }
    /** Why an engine-unit value is missing. */
    dmeWhy(k) {
        if (this.settings.get('engineData') === 'off') return 'engine data off';
        if (!this.link.ready) return 'no diagnostic link';
        if (!this.link.available) return 'link down';
        if (this.unitDown(k)) return 'not answering';
        const list = this.dme[k === 'boostCtl' ? 'boostTarget' : k] || [];
        const r = list.map((c) => this.rd.raws[this.rd.key(c)]).filter(Boolean);
        if (!r.length) return 'reading...';
        if (r.every((x) => /NRC 31|NRC 11|NRC 12/.test(x.why))) return 'not on this car';
        return 'no reading';
    }
    boostWhy() {
        const src = this.settings.get('boostSource'), u = this.carUnits;
        const fes = u.press === null && !u.late ? 'waiting for car units' : this.top.boostFes ? 'at its limit'
            : this.bad.boostFes !== undefined ? 'not a real value' : G.isNum(this.live.boostFes) ? 'not changing'
            : this.gone.boostFes !== undefined ? 'no value' : 'nothing';
        if (src === 'fes') return fes === 'nothing' || fes === 'not changing' ? 'no boost from the sport display' : 'sport display: ' + fes;
        const dmeMsg = this.settings.get('engineData') === 'off' ? 'engine data off' : !this.link.ready ? 'no diagnostic link'
            : !this.link.available ? 'diagnostic link down' : this.unitDown('boost') ? 'engine unit: not answering'
            : this.dmeFail.boost ? 'engine unit: no boost value' : 'engine unit: reading...';
        return src === 'dme' ? dmeMsg : 'sport display: ' + fes + '  ·  ' + dmeMsg;
    }
    /**
     * The ethanol read-out: { on, value: % or null, source: the identifier that answered, why: short reason }.
     * With the choice "MHD flex": value = the tune's "Active", source 'MHD', can = what its sensor says (or null).
     * Only a fresh answer of the engine unit is a value: nothing in demo mode, nothing remembered, nothing guessed,
     * and no second source tried behind the workshop's back.
     */
    ethanol() {
        const src = this.settings.get('ethanol') || 'off';
        const none = (why) => ({ on: true, value: null, source: '', why });
        const viaMhd = src === 'mhd' && this.dme.ecu === Mhd.DME;
        if (src === 'off' || (!viaMhd && !((this.dme.ethanol || {})[src] || []).length)) return { on: false, value: null, source: '', why: 'off' };
        if (this.usingDemo()) return none('demo: not read');
        if (this.settings.get('engineData') === 'off') return none('engine data off');
        const e = this.eth, m = viaMhd && e.src === src ? this.mhd.view(mono()) : null;
        if (m && m.active !== null) return { on: true, value: m.active, source: 'MHD', why: '', can: m.can };
        if (!viaMhd && e.src === src && e.value !== null && mono() - e.at < ETH_FRESH_MS) return { on: true, value: e.value, source: e.source, why: '' };
        if (!this.link.ready) return none('no diagnostic link');
        if (!this.link.available) return none('link down');
        if (this.unit(this.dme.ecu).down) return none('engine unit not answering');
        if (viaMhd) return none(m && m.why ? m.why : 'reading...');
        return none(e.src === src && e.why ? e.why : 'reading...');
    }
}

Vitals.TYRES = TYRES;
module.exports = Vitals;
