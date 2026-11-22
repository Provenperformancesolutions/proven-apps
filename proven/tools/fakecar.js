'use strict';
/**
 * fakecar.js - what the Proven Gauges tests stand the app on instead of a car. No car, no SDK.
 *
 *   const { clock, makeCar, healthy, mhdUnit, keyOf, checker } = require('./fakecar');
 *
 * clock: time the test moves by hand. clock.install() replaces Date.now, process.hrtime and the timers;
 *   await clock.advance(ms) runs the timers and promise jobs that fall due, in order; clock.wall(ms) sets
 *   the WALL clock (Date.now) forward or back and leaves the forward-only clock (process.hrtime) alone,
 *   as the head unit does when it sets its clock; clock.reset() drops every timer (the app of the last
 *   scenario stops with that).
 *
 * makeCar(app, opts): the app's ctx (settings, signals, log) with the car's signal handlers handed back
 *   (car.handlers.CDS.statusEngineSpeed2({...})) and a stand-in for the head unit's diagnostic transport.
 *   Transport model (assumptions, not car measurements):
 *     - one request at a time: while one is in flight the transport says APP_REQUEST_TEMPORARILY_NOT_ACCEPTED
 *     - a unit that answers does so after latencyMs (40), and the transport is free again then
 *     - a request nobody answers keeps the transport busy for holdMs (6000; the public mgu-ethanol app's
 *       notes say 5 to 8 s on the one car it was on). holdMs: 0 = it is free again at once.
 *   opts.reply(target, sid, data, t) -> the unit's reply bytes, null for no answer, or a string: the transport's
 *     own verdict on the request, which it turns away at once (a gateway saying 'TARGET_NOT_REACHABLE').
 *   opts: settings {key: value}, noLink, available (signal providers and the transport), name.
 *   car.inject(udsBytes, ecu): a frame from a control unit (0x12 unless given) that nobody here asked for, as the
 *     reply to another app's request arrives: every app on the head unit hears every reply.
 *
 * healthy(extra): reply() of an engine unit (0x12) and a gearbox unit (0x18) that answer what Proven Gauges
 *   asks, with made-up numbers; extra = { '22:550D': [0x66] | null (silent) | { nrc: 0x31 } } replaces or adds.
 */
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');

/* ---------- a clock the test moves ---------- */
const real = { now: Date.now, hrtime: process.hrtime, setTimeout, setInterval, setImmediate, clearTimeout, clearInterval, clearImmediate };
let now = 1790000000000, skew = 0, timers = [], seq = 0, installed = false;
const drain = () => new Promise((resolve) => process.nextTick(resolve));      // every promise job that is due runs before this resolves
const add = (fn, ms, every, args) => { const t = { id: ++seq, at: now + Math.max(0, ms || 0), fn, every, args, unref() { return t; }, ref() { return t; } }; timers.push(t); return t; };
const clear = (t) => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); };
const clock = {
    install() {
        if (installed) return clock;
        installed = true;
        Date.now = () => now + skew;
        process.hrtime = () => { const s = Math.floor(now / 1000); return [s, Math.round((now - s * 1000) * 1e6)]; };
        global.setTimeout = (fn, ms, ...a) => add(fn, ms, 0, a);
        global.setInterval = (fn, ms, ...a) => add(fn, ms, Math.max(1, ms || 1), a);
        global.setImmediate = (fn, ...a) => add(fn, 0, 0, a);
        global.clearTimeout = global.clearInterval = global.clearImmediate = clear;
        return clock;
    },
    /** The forward-only time, ms. */
    now: () => now,
    /** Set the wall clock by ms (negative: back). */
    wall(ms) { skew += ms; },
    reset() { timers = []; skew = 0; },
    async advance(ms) {
        const end = now + ms;
        for (;;) {
            await drain();
            let best = null;
            for (const t of timers) if (t.at <= end && (!best || t.at < best.at || (t.at === best.at && t.id < best.id))) best = t;
            if (!best) break;
            if (best.at > now) now = best.at;
            if (best.every) best.at = now + best.every; else clear(best);
            best.fn.apply(null, best.args);
        }
        now = end;
        await drain();
    },
};

/* ---------- the car ---------- */
const hex = (n, w) => n.toString(16).toUpperCase().padStart(w || 2, '0');
/** A sent request as '550D@12' / 'OBD 52@12'. */
const keyOf = (r) => (r.sid === 0x22 ? hex(r.data[0]) + hex(r.data[1]) : 'OBD ' + hex(r.data[0])) + '@' + hex(r.target);
const tmp = [];
process.on('exit', () => tmp.forEach((d) => { try { fs.readdirSync(d).forEach((f) => fs.unlinkSync(path.join(d, f))); fs.rmdirSync(d); } catch (e) { /* gone */ } }));

function makeCar(app, opts) {
    opts = opts || {};
    const js = path.join(path.resolve(app), 'source', 'javascript');
    const spec = JSON.parse(fs.readFileSync(path.join(js, 'kit', 'app-spec.json'), 'utf8'));
    const values = {}, listeners = [];
    spec.settings.forEach((s) => { values[s.key] = s.default; });
    Object.assign(values, opts.settings || {});
    const handlers = {}, subs = [], sent = [], logs = [], stats = { busyVerdicts: 0 };
    let frames = [], busyUntil = 0;
    const latency = opts.latencyMs == null ? 40 : opts.latencyMs, hold = opts.holdMs == null ? 6000 : opts.holdMs;
    const signals = {
        watch: (iface, inst, h) => {
            const s = { iface, available: opts.available !== false, error: null };
            handlers[iface.split('.').pop()] = h; subs.push(s);
            return Promise.resolve(s);
        },
        proxy: () => (opts.noLink || !opts.reply ? Promise.reject(new Error('test: no diagnostic link')) : Promise.resolve({})),
        on: (p, name, fn) => { frames.push(fn); return Promise.resolve(); },
        onAvailable: (p, fn) => { fn(opts.available !== false); return Promise.resolve(); },
        call: (p, method, q) => {
            const t = now;
            if (t < busyUntil) { stats.busyVerdicts++; return Promise.resolve({ TasuErrorEnum: 'APP_REQUEST_TEMPORARILY_NOT_ACCEPTED' }); }
            const target = q.targetAddress, sid = q.serviceID, data = Array.prototype.slice.call(q.udsData);
            const r = opts.reply(target, sid, data, t);
            if (typeof r === 'string') { sent.push({ t, target, sid, data, answered: false, refused: r }); return Promise.resolve({ TasuErrorEnum: r }); }
            sent.push({ t, target, sid, data, answered: !!r });
            if (r) {
                busyUntil = t + latency;
                setTimeout(() => frames.forEach((fn) => fn({ udsResponse: [0, 0, 0, 0, 0, 0, target, 0, 0].concat(r), errorCode: 'NO_ERROR' })), latency);
            } else busyUntil = t + hold;
            return Promise.resolve({ TasuErrorEnum: 'NO_ERROR' });
        },
    };
    const log = { info: (m) => logs.push('info ' + m), warn: (m) => logs.push('WARN ' + m), error: (m) => logs.push('ERROR ' + m), debug() {} };
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pps-test-'));
    tmp.push(dataDir);
    const settings = {
        get: (k) => values[k], onChange: (fn) => listeners.push(fn),
        set: (k, v) => { values[k] = v; listeners.forEach((fn) => fn(k, v)); },
    };
    const ctx = { spec, dataDir, log, settings, signals };
    const car = { js, ctx, values, settings, handlers, subs, sent, logs, stats };
    /** The data layer of the built app on this car, with the kit's engine profile. */
    car.vitals = () => {
        const Engine = require(path.join(js, 'kit', 'engine')), Vitals = require(path.join(js, 'vitals'));
        car.engine = new Engine({ settings, dataDir, log });
        car.v = new Vitals(ctx, car.engine);
        return car.v;
    };
    car.inject = (uds, ecu) => frames.forEach((fn) => fn({ udsResponse: [0, 0, 0, 0, 0, 0, ecu === undefined ? 0x12 : ecu, 0, 0].concat(uds), errorCode: 'NO_ERROR' }));
    /** A frame as the transport hands it over, header and all (too short to be a reply, for instance). */
    car.injectRaw = (bytes) => frames.forEach((fn) => fn({ udsResponse: bytes, errorCode: 'NO_ERROR' }));
    /** Someone else's request keeps the transport busy for ms from now. */
    car.hold = (ms) => { busyUntil = Math.max(busyUntil, now + ms); };
    /** Requests sent whose key ('F40F@12') matches re. */
    car.count = (re) => sent.filter((r) => re.test(keyOf(r))).length;
    /**
     * Drive for secs: a frame every 16 ms as the screen draws them (o.screen !== false: seenScreen, and want(o.want)
     * for the engine-unit values of the gauge set shown), with a running engine's signals (o.feed(n) instead: your own;
     * o.fes === false: no sport-display boost). o.each(n) after every frame.
     */
    let n = 0;
    car.run = async (secs, o) => {
        o = o || {};
        const v = car.v, h = handlers;
        for (let t = 0; t < secs * 1000; t += 16) {
            if (o.feed) o.feed(n);
            else if (o.feed !== false) {
                h.CDS.statusEngineSpeed2({ actualValueRPMEngineCrankshaft: 12000 + (n % 2) * 4 });
                if (n % 60 === 0) h.CDS.statusEngineTemperature({ temperatureEngineDrive: 138, temperatureEngineOilDrive: o.oil === undefined ? 153 + (n % 120 ? 0 : 1) : o.oil });
                if (o.fes !== false) h.FES.statusSwitchDriveDynamicSport2({ displayBoostPressure: 100 + (n % 20) });
            }
            n++;
            if (o.screen !== false) { v.seenScreen(); v.want(typeof o.want === 'function' ? o.want() : o.want || []); }
            await clock.advance(16);
            if (o.each) o.each(n);
        }
    };
    return car;
}

/** A healthy engine unit (0x12) and gearbox unit (0x18) for the values Proven Gauges asks (synthetic numbers). */
function healthy(extra) {
    const dme = {
        '22:F40F': [0x46], '22:F423': [0x0B, 0xB8], '22:F40A': [0xB4], '01:0E': [0x90],
        '22:4AB0': [0xB4, 0x00], '22:580B': [0xB0, 0x00], '22:F433': [0x65],
        '22:F470': [0x03, 0x16, 0x80, 0x16, 0x00, 0, 0, 0, 0], '01:5C': [0x82],
    };
    Object.assign(dme, extra || {});
    return (target, sid, data) => {
        if (target === 0x18) {
            const g = dme['18:' + data.map((b) => hex(b)).join('')];
            if (g === null) return null;
            if (g !== undefined) return g.nrc ? [0x7F, sid, g.nrc] : [sid + 0x40].concat(data, g);
            return sid === 0x22 && data[0] === 0x60 && data[1] === 0x00 ? [0x62, 0x60, 0x00, 0x5A] : [0x7F, sid, 0x31];
        }
        if (target !== 0x12) return null;
        const v = dme[hex(sid) + ':' + data.map((b) => hex(b)).join('')];
        if (v === null) return null;                                   // silent on this one
        if (v === undefined) return [0x7F, sid, sid === 0x22 ? 0x31 : 0x12];
        if (v.nrc) return [0x7F, sid, v.nrc];
        return [sid + 0x40].concat(data, v);
    };
}

/**
 * mhdUnit(o): healthy(), with an engine unit (0x12) that also answers the way the reference app's notes say an
 * engine unit with an MHD flex-fuel tune does (mhdflex.js). Assumptions from those notes, not from a car.
 *   o.family   '5D55'   the program family in its software list (22 F1 01). The list has the shape of the one the
 *                       reference app's author recorded from a car: 17 bytes of header, six entries of 8 bytes
 *   o.programs          more than one program entry: their families, e.g. ['6B21', '5D55']
 *   o.svk               the bytes after 62 F1 01, in place of that list
 *   o.probeSilent       it does not answer the probe
 *   o.identNrc          it refuses 22 F1 01 with this code;  o.identSilent: it does not answer 22 F1 01
 *   o.tune     true     answers the probe 2F 04 "MHD" with MHD's marker (false: refuses it)
 *   o.marker            the bytes after 6F 04 4D 48 44 in that answer ([0x32, 0x05, 0x41] = "2" and a version)
 *   o.probeNrc          it refuses the probe with this code although it has the tune
 *   o.noProgram         its software list has no program entry
 *   o.forgetAfter       it forgets a definition after this many reads of it (an ignition cycle each time)
 *   o.active, o.can     the two ethanol bytes (27, 26)
 *   o.dids              the temporary identifiers it has (F300 to F303)
 *   o.defineNrc         it refuses every definition with this code
 *   o.lose              it takes a definition and has forgotten it at the next read
 *   o.quiet             it does not answer the read of a temporary identifier
 *   o.extra             healthy()'s
 * The function returned has .state: { o (change it mid-run), defined, forget() = an ignition cycle }.
 */
function mhdUnit(o) {
    o = Object.assign({ family: '5D55', tune: true, active: 27, can: 26, dids: ['F300', 'F301', 'F302', 'F303'] }, o || {});
    const base = healthy(o.extra), st = { o, defined: {}, reads: {} };
    st.forget = () => { st.defined = {}; };
    const mem = { B00060C2: () => st.o.active, B00060D2: () => st.o.can };
    const pair = (f) => [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2), 16)];
    // the software list: 17 header bytes (the number of entries in bytes 3 and 4), then 8-byte entries:
    // class, id, version (hardware 01, 02, boot loader 06, program 08, calibration 0D, 05)
    const entries = [[0x01, 0x00, 0x00, 0x3D, 0xDE, 0x03, 0x13, 0x16], [0x02, 0x00, 0x00, 0x3D, 0xD1, 0xFF, 0xFF, 0xFF], [0x06, 0x00, 0x00, 0x48, 0xDB, 0x01, 0x23, 0x05]]
        .concat((o.programs || [o.family]).map((f) => [o.noProgram ? 0x07 : 0x08, 0x00, 0x00].concat(pair(f), [0x50, 0x3C, 0x05])))
        .concat([[0x0D, 0x00, 0x00, 0x84, 0x17, 0x50, 0x3C, 0x1D], [0x05, 0x00, 0x00, 0x27, 0x42, 0x02, 0x05, 0x41]]);
    const svk = o.svk || [0x01, 0x01, 0x00, entries.length, 0x26, 0x11, 0x04, 0x8F, 0x04, 0xD2, 0x01, 0x00, 0x00, 0x00, 0x10, 0x00, 0x00].concat([].concat.apply([], entries));
    // 22 F1 02, a second list of the same unit: it also names a program family that 22 F1 01 does not (as on the recorded car)
    const svkOld = [0x01, 0x01, 0x00, 0x04, 0x22, 0x02, 0x18, 0x8B, 0x00, 0x08, 0x00, 0x30, 0x30, 0x30, 0x30, 0x00, 0x00,
        0x01, 0x00, 0x00, 0x3D, 0xDE, 0x03, 0x1D, 0x04, 0x02, 0x00, 0x00, 0x6E, 0x45, 0xFF, 0xFF, 0xFF,
        0x08, 0x00, 0x00, 0x5D, 0x55, 0x50, 0x3C, 0x05, 0x08, 0x00, 0x00, 0x99, 0xF6, 0x14, 0x46, 0x06];
    const fn = (target, sid, data, t) => {
        if (target !== 0x12) return base(target, sid, data, t);
        const key = data.map((b) => hex(b)).join('');
        if (sid === 0x22 && key === 'F101' && st.o.identSilent) return null;
        if (sid === 0x22 && key === 'F101' && st.o.identNrc) return [0x7F, 0x22, st.o.identNrc];
        if (sid === 0x22 && key === 'F101') return [0x62, 0xF1, 0x01].concat(svk);
        if (sid === 0x22 && key === 'F102') return [0x62, 0xF1, 0x02].concat(svkOld);
        if (sid === 0x2F && st.o.probeSilent) return null;
        if (sid === 0x2F && st.o.probeNrc) return [0x7F, 0x2F, st.o.probeNrc];
        if (sid === 0x2F) return st.o.tune && key === '044D4844' ? [0x6F, 0x04, 0x4D, 0x48, 0x44].concat(st.o.marker || [0x32, 0x05, 0x41]) : [0x7F, 0x2F, 0x31];
        if (sid === 0x2C) {
            const did = hex(data[1] || 0) + hex(data[2] || 0);
            if (!st.o.tune) return [0x7F, 0x2C, 0x33];
            if (st.o.dids.indexOf(did) < 0) return [0x7F, 0x2C, 0x31];
            if (data[0] === 0x03) {
                const had = st.defined[did];
                delete st.defined[did];
                return had ? [0x6C, 0x03, data[1], data[2]] : [0x7F, 0x2C, 0x31];
            }
            if (data[0] !== 0x02) return [0x7F, 0x2C, 0x12];
            if (st.o.defineNrc) return [0x7F, 0x2C, st.o.defineNrc];
            if (data[3] !== 0x14 || data.length < 9 || (data.length - 4) % 5) return [0x7F, 0x2C, 0x13];
            const parts = [];
            for (let i = 4; i < data.length; i += 5) parts.push({ place: data.slice(i, i + 4).map((b) => hex(b)).join(''), size: data[i + 4] });
            if (!st.o.lose) st.defined[did] = parts;
            st.reads[did] = 0;
            return [0x6C, 0x02, data[1], data[2]];
        }
        if (sid === 0x22 && /^F30[0-9A-F]$/.test(key)) {
            if (st.o.quiet) return null;
            const parts = st.defined[key];
            if (!parts) return [0x7F, 0x22, 0x31];
            if (st.o.forgetAfter && ++st.reads[key] >= st.o.forgetAfter) delete st.defined[key];
            const out = [0x62, data[0], data[1]];
            // (a place this stand-in does not know reads EE: the app must never show that)
            parts.forEach((p) => { for (let i = 0; i < p.size; i++) out.push(i === 0 && mem[p.place] ? mem[p.place]() : 0xEE); });
            return out;
        }
        return base(target, sid, data, t);
    };
    fn.state = st;
    return fn;
}

/**
 * Checks for a test file: ok(cond, what) prints a line per check. With PPS_TEST_ALL=1 in the environment a
 * failed check is listed and the run goes on (to see everything an older build fails), else it stops there.
 */
function checker() {
    const all = !!process.env.PPS_TEST_ALL, failed = [];
    let n = 0, finished = false;
    // a test that stops before its last line (a promise nobody resolves under the hand-moved clock) must not look like a pass
    process.on('exit', (code) => { if (!finished && !code) { console.log('NOT FINISHED: the test stopped after ' + n + ' checks, before its end'); process.exitCode = 1; } });
    const ok = (cond, what) => {
        n++;
        if (cond) { console.log('  ok  ' + what); return true; }
        if (!all) assert.ok(false, what);
        failed.push(what); console.log('  FAILED  ' + what);
        return false;
    };
    /** Run one scenario; with PPS_TEST_ALL an error in it is one failed check. */
    ok.part = async (title, fn) => {
        console.log(title);
        clock.reset();
        try { await fn(); } catch (e) {
            if (!all) throw e;
            n++; failed.push(title + ': ' + (e && e.message || e)); console.log('  FAILED  ' + title + ': ' + (e && e.message || e));
        }
    };
    ok.done = () => {
        finished = true;
        console.log(failed.length ? n + ' checks, ' + failed.length + ' FAILED:\n  ' + failed.join('\n  ') : n + ' checks, ALL OK');
        process.exit(failed.length ? 1 : 0);
    };
    return ok;
}

module.exports = { clock, makeCar, healthy, mhdUnit, keyOf, hex, checker };
