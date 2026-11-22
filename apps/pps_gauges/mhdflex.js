'use strict';
/**
 * mhdflex.js - the ethanol content an MHD flex-fuel tune keeps in the engine unit, for the setting
 * "Ethanol reading: MHD flex". Off as shipped, and NOT READ ONLY: three of its requests are not reads.
 *
 * Where the number is. As far as Proven knows (from MHD's description of its flex-fuel kit; not checked on a
 * car), the flex-fuel sensor reports to the engine unit on PT-CAN2, a bus the head unit is not on, so the head
 * unit never sees that message. The tune keeps two bytes in the engine unit's working memory, "Ethanol Content
 * (Active)" (what the tune is running on) and "Ethanol Content (CAN)" (what the sensor says). MHD's own app
 * gets them by asking the engine unit to make a temporary identifier out of the two memory places and then
 * reading that identifier. This file does the same.
 *
 * The method, the requests and the two memory places are those of the "Flex Fuel" app by Alex Perea
 * (https://github.com/alexpereap/pereaperformance-idrive7-apps, apps/perea_mhd_flex, MIT licence: see
 * NOTICE), who recorded them from MHD's app on a B58 gen2 (engine unit 0x12, MHD 5.41). The parsing below is
 * adapted from that app's protocol.js and the steps from its poller.js. Proven has not run any of it on a car.
 *
 *   identify   22 F1 01                -> the engine unit's list of the software it runs now: 17 bytes of header
 *                                         (the number of entries in its bytes 3 and 4), then entries of 8 bytes:
 *                                         class, id (4 bytes), version (3 bytes). The program entry is class 08:
 *                                         08 00 00 <family, 2 bytes> <version>. An id with anything in its first
 *                                         two bytes is another program, named by its whole id                        a read
 *   probe      2F 04 4D 48 44 ("MHD")  -> 6F 04 4D 48 44 32 .. ("MHD2" and a version). An engine unit without
 *                                         the tune refuses                                                           NOT a read
 *   clear      2C 03 F3 03             -> forget our temporary identifier (a refusal means there was none)           NOT a read
 *   define     2C 02 F3 03 14 <place, 4 bytes> 01 <place, 4 bytes> 01 -> 6C 02 F3 03                                 NOT a read
 *   read       22 F3 03                -> 62 F3 03 <active> <can>, % ethanol, one byte each                          a read
 *
 * What the reference app's notes say about the three: the probe is a question only the tune answers. The
 * definition is temporary: the engine unit forgets it at the next ignition cycle (22 F3 03 then answers
 * 7F 22 31 and it is defined again). The engine unit has four such identifiers, F300 to F303. MHD's app uses
 * F300 and F302 and clears all four when it connects, so this takes F303, or F301 when F303 is refused.
 * The memory places differ from one engine program to the next: PROFILES holds them per program family, and
 * a family that is not in it is "software not supported" (its ids go to the log, nothing else is sent).
 *
 * What keeps this narrow:
 *   - order: the identification (one read) comes first, and it is strict: the list must have exactly the
 *     shape above and exactly one program family, and only a family in PROFILES gets the probe. A list of
 *     another shape is "software not identified", any other family "software not supported". (The reference
 *     app also reads 22 F1 02 and takes a family from either list. On the one car it was recorded on, that
 *     second list names a second program family. As far as Proven knows that list is not the one of what
 *     the engine unit runs now (not checked on a car); it is not asked here.) Only an engine unit that
 *     answered the probe with MHD's marker gets the definition.
 *   - Gate: the only way out for the three non-read requests. It does three things, each of them twice: when a
 *     request is handed to it, and again when the kit's Diag hands the bytes on to the kit's call into the
 *     head unit (signals.call), at every try (the kit tries a busy transport again for up to a second).
 *       what: check() lets through exactly the probe, the clear of F303 / F301, and the definition of F303 /
 *         F301 from the two places of one PROFILES entry, to the engine unit (0x12) only.
 *       whether: armed(), the setting. With the setting off nothing is handed over.
 *       how often: LIMITS, for the probe, the clear and the definition each: never two within 5 s, at most 3
 *         in any 10 minutes and at most 6 in any hour. A request counts from the moment it is handed on; its
 *         place is given back only when the transport answers "busy, not accepted" (then nothing left). The
 *         Gate is made once per run of the app and keeps its counts whatever the steps do: no answer of the
 *         engine unit, no change of a setting and no start-over makes room. So at most 18 non-read requests
 *         in any hour. (The counts are in memory: a restart of the app starts them at nothing.)
 *       whose: a request of steps that were started over since they asked for it (a setting was changed) is
 *         not handed on, wherever it was waiting: the steps' generation goes with the request from the ask.
 *     Not covered: the kit keeps one queue of calls into the head unit (kit/runtime/signals.js), and a request
 *     that has passed the Gate waits there for the call before it. In normal running that is one tick.
 *     The reads (22 F1 01, 22 F3 03) go through the kit's read-only link like every other value.
 *   - pace of the steps, below those limits: nothing is asked while its read-out is not on screen or the
 *     engine unit is not answering (the caller, vitals.js). The value once every READ_MS. After a failure 5 s,
 *     15 s, 30 s, 1, 5, 10 minutes (BACKOFF_MS), starting afresh once an identifier has lasted SETTLED_MS.
 *     After a clear "no" to the probe a rest of 10 minutes (REST_MS), 20 after the second in a row and 30
 *     from the third on.
 *   - other apps: every app on the head unit hears every reply of the engine unit, and a refusal meant for
 *     another app's request looks like one meant for ours. So a "no" that would cost a non-read request is
 *     asked once more before it is believed: a lost identifier (two reads), an identifier out of range (two
 *     definitions), the first "no" to the probe (two probes).
 *
 * One transport, one subscription: tap() wraps the app's signals object so the read-only link's own proxy
 * and its one subscription are shared (none of the kit's apps in this repository opens two diagnostic links
 * in one app, so a second one is untried on a head unit). The Gate's Diag (kit/diag.js) is never init()ed:
 * it is handed that proxy, and those frames only while one of its requests is out.
 */
const { Diag, replyTo, hex, NRC } = require('./kit/diag');

const DME = 0x12;
/** The program families whose two memory places are known (the reference app's capture: prgid 00005D55503C05). */
const PROFILES = Object.freeze([
    Object.freeze({ family: '5D55', name: 'B58 gen2 (program family 5D55)', active: 'B00060C2', can: 'B00060D2' }),
]);
const DIDS = Object.freeze(['F303', 'F301']);
const PROBE = Object.freeze([0x04, 0x4D, 0x48, 0x44]);
const SVK_TYPES = [0x08, 0x0D];       // software list entries MHD keys on: program, calibration
const SVK_HEADER = 17;                // bytes before the first entry of a software list
/** The Gate's limits, for each of the three non-read requests on its own. */
const LIMITS = Object.freeze({ gapMs: 5000, windowMs: 600000, perWindow: 3, hourMs: 3600000, perHour: 6 });

const READ_MS = 2000;                 // between two reads of the value
const FRESH_MS = 10000;               // a value is shown while younger than this
const REST_MS = 600000;               // after a clear "no" to the probe (x 2 after the second in a row, x 3 from the third on)
const BACKOFF_MS = Object.freeze([5000, 15000, 30000, 60000, 300000, 600000]);
const SETTLED_MS = 60000;             // an identifier that still reads this long after its definition has lasted
const MISSES = 3;                     // unanswered reads in a row, then a failure
const BUSY_MS = 1000, BUSY_N = 5;     // the transport took nothing: wait, and after this many in a row a failure
const CLEARED_MS = 10000;             // an answered clear stands while its definition was last tried no longer ago than this
const TIMEOUT_MS = 1500, PROBE_TIMEOUT_MS = 3000;
const RAW_LOGS = 4;                   // the first replies to every request go to the log
const NEVER = -1e15;

const byte = (b) => Number.isInteger(b) && b >= 0 && b <= 0xFF;
/** A copy of the request bytes with every place looked at (a list with a gap in it has no byte there). */
function dense(data) {
    if (!Array.isArray(data)) throw new Error('MHD flex: bad request bytes');
    const d = [];
    for (let i = 0; i < data.length; i++) {
        if (!byte(data[i])) throw new Error('MHD flex: bad request bytes');
        d.push(data[i]);
    }
    return d;
}
function same(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}
function hexBytes(s) {
    if (typeof s !== 'string' || !/^([0-9A-Fa-f]{2})+$/.test(s)) throw new Error('bad hex ' + s);
    return s.match(/../g).map((b) => parseInt(b, 16));
}
const bytesHex = (b, sep) => (b || []).map((x) => hex(x)).join(sep || '');
const nrcText = (n) => 'NRC ' + hex(n) + (NRC[n] ? ' ' + NRC[n] : '');
/** The bytes after 2C 02 <identifier> that make it "active byte, then CAN byte" (14 = 1-byte size, 4-byte address). */
const places = (p) => [0x14].concat(hexBytes(p.active), [0x01], hexBytes(p.can), [0x01]);
/** The setting is off: not a fault, nothing is counted or retried for it. */
function offError() { const e = new Error('MHD flex: the setting is off'); e.off = true; return e; }
/** One of the Gate's limits is reached: not a fault either. until = when there is room again (forward-only ms). */
function limitError(kind, until) { const e = new Error('MHD flex: no room for another ' + kind + ' yet'); e.limit = true; e.kind = kind; e.until = until; return e; }
/** The transport's answer to the hand-over as the kit's Diag reads it: is it "busy, not accepted"? (then nothing left) */
function busyVerdict(r) {
    const v = r && typeof r === 'object' ? (r.TasuErrorEnum || Object.keys(r).map((k) => r[k]).find((x) => typeof x === 'string')) : r;
    return /TEMPORARILY_NOT_ACCEPTED|BUSY/i.test(v === undefined ? 'NO_ERROR' : String(v));
}

/**
 * Throws unless this is one of the three non-read requests of the top of this file. Returns its name
 * ('probe', 'clear F303', 'define F301', ...). Exported for the tests.
 */
function check(sid, data) {
    const d = dense(data);
    const ours = (hi, lo) => DIDS.some((x) => same(hexBytes(x), [hi, lo]));
    if (sid === 0x2F && same(d, PROBE)) return 'probe';
    if (sid === 0x2C && d.length === 3 && d[0] === 0x03 && ours(d[1], d[2])) return 'clear ' + hex(d[1]) + hex(d[2]);
    if (sid === 0x2C && d.length === 14 && d[0] === 0x02 && ours(d[1], d[2])
        && PROFILES.some((p) => same(d.slice(3), places(p)))) return 'define ' + hex(d[1]) + hex(d[2]);
    throw new Error('MHD flex: request ' + (byte(sid) ? hex(sid) : String(sid)) + ' ' + bytesHex(d, ' ') + ' is not allowed');
}

/**
 * The app's signals object, passed through, with the diagnostic link's proxy remembered. While `frame` is
 * set (the Gate sets it only while one of its requests is out) every frame the link receives is handed on
 * to it as well, after the link's own handler. t.signals goes to the read-only link.
 */
function tap(signals) {
    const t = { p: null, frame: null };
    t.signals = {
        proxy: (iface, instance) => signals.proxy(iface, instance).then((p) => { t.p = p; return p; }),
        on: (p, name, fn, log) => signals.on(p, name, (v) => { fn(v); if (t.frame) t.frame(v); }, log),
        onAvailable: (p, fn) => signals.onAvailable(p, fn),
        call: (p, method, params, timeoutMs) => signals.call(p, method, params, timeoutMs),
    };
    return t;
}

const GATES = new WeakMap();          // Gate -> its Diag and its counts, out of reach of the app
class Gate {
    /**
     * tapped: from tap(). armed(): is the setting on? Nothing leaves while it says no.
     * now(): forward-only time in ms (the limits are counted on it).
     */
    constructor(tapped, armed, log, now, epoch) {
        const g = { tapped, out: 0, times: { probe: [], clear: [], define: [] }, ep: 0 };
        this.armed = armed; this.log = log;
        this.epoch = epoch || (() => 0);          // changes when the steps are started over: a request the steps before asked for is not handed on
        this.now = now || (() => { const h = process.hrtime(); return h[0] * 1000 + h[1] / 1e6; });
        // sent: the transport took it. turnedAway: it said busy (nothing left). unknown: the hand-over ended another way
        // (it may have left: it stays counted for the limits). off: stopped because the setting was off or the steps were
        // started over. limited: no room yet. blocked: not one of the three.
        this.stats = { sent: 0, turnedAway: 0, unknown: 0, off: 0, limited: 0, blocked: 0 };
        // the kit's Diag with one way on to the head unit: this function, called once for every try
        g.d = new Diag({
            call: (p, method, params, timeoutMs) => {
                let kind;
                try {
                    try {
                        if (method !== 'sendTasuRequest' || !params || params.targetAddress !== DME) throw new Error('MHD flex: not a request to the engine unit');
                        kind = check(params.serviceID, Array.prototype.slice.call(params.udsData || [])).split(' ')[0];     // the bytes as they are handed on
                    } catch (e) { e.blocked = true; throw e; }
                    if (!this.armed() || this.epoch() !== g.ep) throw offError();                    // the setting, asked again at every try
                    const until = this.until(kind);
                    if (until > this.now()) throw limitError(kind, until);                           // and the limits
                } catch (e) { return Promise.reject(e); }
                // counted from here on. The place is given back only when the transport says "busy, not accepted"
                const at = this.now();
                g.times[kind].push(at);
                let call;
                try { call = Promise.resolve(tapped.signals.call(p, method, params, timeoutMs)); } catch (e) { return Promise.reject(e); }
                return call.then((r) => {
                    if (busyVerdict(r)) { const i = g.times[kind].lastIndexOf(at); if (i >= 0) g.times[kind].splice(i, 1); }
                    return r;
                });
            },
        }, log);
        g.d.quiet = true; g.d.busyMs = 100; g.d.busyLog = false;
        g.onFrame = (v) => g.d._onResponse(v);
        GATES.set(this, g);
    }

    /** When the next request of this kind ('probe', 'clear', 'define') may go: a time on now()'s clock, in the past when there is room. */
    until(kind) {
        const now = this.now(), L = LIMITS, g = GATES.get(this);
        const t = g.times[kind] = g.times[kind].filter((x) => now - x < L.hourMs);
        let until = t.length ? t[t.length - 1] + L.gapMs : 0;
        const w = t.filter((x) => now - x < L.windowMs);
        if (w.length >= L.perWindow) until = Math.max(until, w[w.length - L.perWindow] + L.windowMs);
        if (t.length >= L.perHour) until = Math.max(until, t[t.length - L.perHour] + L.hourMs);
        return until;
    }

    /**
     * One of the three requests check() knows, to the engine unit: its reply bytes, or null when it did not
     * answer. Rejects when the request is not allowed, the setting is off or the steps were started over
     * (error.off), there is no room for it yet (error.limit, error.until), or the transport turned it away.
     */
    async send(sid, data, timeoutMs, accept, ep) {
        const g = GATES.get(this);
        let d, what;
        try { d = dense(data); what = check(sid, d); } catch (e) {                 // d is what was checked and what is sent
            this.stats.blocked++;
            this.log.error('blocked a request to the engine unit: ' + e.message);
            throw e;
        }
        // (ep: the steps' generation when they asked for this request; it may have waited in the link's queue since)
        if (!this.armed() || (ep !== undefined && ep !== this.epoch())) { this.stats.off++; throw offError(); }
        const kind = what.split(' ')[0], until = this.until(kind);
        if (until > this.now()) { this.stats.limited++; throw limitError(kind, until); }
        if (!g.tapped.p) throw new Error('no diagnostic link');
        g.d.p = g.tapped.p; g.ep = this.epoch();
        const line = 'MHD flex: ' + what + ' (' + hex(sid) + ' ' + bytesHex(d, ' ') + ')';
        let reply;
        g.out++; g.tapped.frame = g.onFrame;
        try {
            reply = await g.d.physical(DME, sid, d, timeoutMs || TIMEOUT_MS, accept);
        } catch (e) {
            const m = String(e && e.message || e);
            if (e && e.off) this.stats.off++;
            else if (e && e.limit) this.stats.limited++;
            else if (e && e.blocked) { this.stats.blocked++; this.log.error('blocked a request to the engine unit at the hand-over: ' + m); }
            else if (/^transport refused: .*(TEMPORARILY_NOT_ACCEPTED|BUSY)/i.test(m)) { this.stats.turnedAway++; this.log.info(line + ' not taken by the transport (' + m + ')'); }
            else { this.stats.unknown++; this.log.warn(line + ' handed over, what became of it is not known (' + m + ')'); }
            throw e;
        } finally {
            if (--g.out === 0) g.tapped.frame = null;
        }
        this.stats.sent++;
        this.log.info(line + ' sent to the engine unit' + (reply ? '' : ', no answer'));
        return reply;
    }
}

/* ---------- the replies (adapted from the reference app's protocol.js) ---------- */

/** The probe's answer: { mhd: true, marker } on 6F 04 4D 48 44 32 .., else { mhd: false, nrc?, reason }. */
function parseProbe(reply) {
    if (!reply || !reply.length) return { mhd: false, reason: 'no answer' };
    if (reply[0] === 0x7F) return { mhd: false, nrc: reply[2], reason: nrcText(reply[2]) };
    const ok = reply[0] === 0x6F && reply[1] === 0x04 && reply[2] === 0x4D && reply[3] === 0x48 && reply[4] === 0x44 && reply[5] === 0x32;
    if (!ok) return { mhd: false, reason: 'unexpected ' + bytesHex(reply.slice(0, 8), ' ') };
    return { mhd: true, marker: bytesHex(reply.slice(2)) };
}

/** The data after 62 F1 01, or null (refused / no answer / another reply). */
function svkData(reply) {
    if (!reply || reply[0] !== 0x62 || reply[1] !== 0xF1 || reply[2] !== 0x01) return null;
    return reply.slice(3);
}

/**
 * The entries of a software list, read on its grid: SVK_HEADER bytes of header with the number of entries in
 * bytes 3 and 4, then that many entries of 8 bytes. [{ type, id (7 bytes as hex), family }], or null when the
 * list has another shape (then nothing is read out of it: a pattern found off the grid is no entry).
 */
function svkEntries(data) {
    if (!data || data.length < SVK_HEADER + 8 || (data.length - SVK_HEADER) % 8) return null;
    const n = (data.length - SVK_HEADER) / 8;
    if (((data[2] << 8) | data[3]) !== n) return null;
    const out = [];
    // (08 00 00 <family>: an id with anything in its first two bytes is another program, named by its whole id)
    for (let i = SVK_HEADER; i < data.length; i += 8) out.push({ type: data[i], id: bytesHex(data.slice(i + 1, i + 8)), family: bytesHex(data[i + 1] || data[i + 2] ? data.slice(i + 1, i + 5) : data.slice(i + 3, i + 5)) });
    return out;
}

/**
 * What the software list says: { shape: is it a list at all, profile (or null), families: of its program
 * entries, seen: its program and calibration ids }. A profile only when the list names exactly one program
 * family and that family is in the profiles.
 */
function matchProfile(data, profiles) {
    const entries = svkEntries(data);
    if (!entries) return { shape: false, profile: null, families: [], seen: [] };
    const families = entries.filter((e) => e.type === 0x08).map((e) => e.family).filter((f, i, a) => a.indexOf(f) === i);
    const profile = families.length === 1 ? (profiles || PROFILES).find((p) => p.family === families[0]) || null : null;
    return { shape: true, profile, families, seen: entries.filter((e) => SVK_TYPES.indexOf(e.type) >= 0).map((e) => (e.type === 0x08 ? 'program ' : 'calibration ') + e.id) };
}

/** accept() for a 2C request: its positive reply echoes the sub-function (and the identifier), or 7F 2C. */
function acceptDefine(sub, did) {
    return (u) => (u[0] === 0x6C && u[1] === sub && (u.length < 4 || (u[2] === did[0] && u[3] === did[1]))) || (u[0] === 0x7F && u[1] === 0x2C);
}

/** { ok: true } when the engine unit took it, else { ok: false, nrc?, reason }. */
function parseDefine(reply, sub) {
    if (!reply || !reply.length) return { ok: false, reason: 'no answer' };
    if (reply[0] === 0x7F) return { ok: false, nrc: reply[2], reason: nrcText(reply[2]) };
    if (reply[0] === 0x6C && reply[1] === sub) return { ok: true };
    return { ok: false, reason: 'unexpected ' + bytesHex(reply.slice(0, 4), ' ') };
}

/**
 * The read's answer: { ok: true, active, can } (a byte over 100 is null: not a percentage), { ok: false, nrc },
 * or reason 'length' when the identifier does not hold exactly our two bytes (someone else defined it).
 */
function parseRead(reply, did) {
    if (!reply || !reply.length) return { ok: false, reason: 'no answer' };
    if (reply[0] === 0x7F) return { ok: false, nrc: reply[2], reason: nrcText(reply[2]) };
    if (reply[0] !== 0x62 || reply[1] !== did[0] || reply[2] !== did[1]) return { ok: false, reason: 'unexpected ' + bytesHex(reply.slice(0, 4), ' ') };
    if (reply.length !== 5) return { ok: false, reason: 'length' };
    const pct = (b) => (b <= 100 ? b : null);
    return { ok: true, active: pct(reply[3]), can: pct(reply[4]) };
}

/* ---------- the steps (after the reference app's poller.js, in another order: see the top) ---------- */

class MhdFlex {
    /**
     * io.read(did, timeoutMs)              one identifier from the engine unit through the read-only link
     * io.send(sid, data, timeoutMs, accept) one of the three non-read requests through the Gate
     *   both: the reply bytes, null = nobody answered, undefined = not sent (the transport was busy: nothing learned)
     * io.now()                             forward-only time, ms
     * io.log
     */
    constructor(io) {
        this.io = io; this.log = io.log;
        this.profiles = io.profiles || PROFILES;
        this.rawN = {};
        this.gen = 0;
        this.reset();
    }

    /**
     * Start over (the setting was changed): nothing of the last run is kept, and a step that is out is dropped
     * when it returns. What was already sent stays counted: that is the Gate's, not this object's.
     */
    reset() {
        this.gen++;
        this.state = 'identify';      // identify -> probe -> define -> read; unsupported = nothing more is asked
        this.why = '';                // for the screen: why there is no value
        this.nextAt = 0;              // the earliest time the next request may go
        this.errors = 0;              // failures (the backoff step), until an identifier has lasted
        this.rests = 0;               // clear "no"s to the probe in a row
        this.busyN = 0;               // times in a row the transport took nothing
        this.profile = null; this.families = []; this.seen = []; this.marker = '';
        this.noTune = 0;              // "no"s to the probe since the marker was last seen
        this.didIndex = 0;
        this.definedAt = NEVER;
        this.cleared = ''; this.clearedSeen = NEVER;      // the identifier an answered clear left empty, and when its definition was last tried
        this.outOfRange = 0;          // "no such identifier" to a definition, in a row
        this.misses = 0;              // unanswered reads in a row
        this.lost = 0;                // reads in a row that said the identifier is not ours
        this.paused = false;          // waiting for room at the Gate (logged once)
        this.active = null; this.can = null; this.at = NEVER;
    }

    get did() { return DIDS[this.didIndex]; }

    _set(state, why, note) {
        if (state !== this.state || note) this.log.info('MHD flex: ' + (state !== this.state ? this.state + ' -> ' + state : state) + (note ? ' (' + note + ')' : ''));
        this.state = state; this.why = why || '';
    }
    _raw(req, reply) {
        const n = this.rawN[req] = (this.rawN[req] || 0) + 1;
        if (n <= RAW_LOGS) this.log.info('raw MHD flex ' + req + ': "' + (reply && reply.length ? bytesHex(reply, ' ') : 'no answer') + '"');
    }
    /** Something went wrong at this step: again after the next backoff wait. */
    _fail(why, note) {
        this.errors++; this.cleared = '';
        const wait = BACKOFF_MS[Math.min(this.errors, BACKOFF_MS.length) - 1];
        this.nextAt = this.io.now() + wait;
        this.why = why;
        this.log.warn('MHD flex: ' + note + ', next try in ' + Math.round(wait / 1000) + ' s');
        return '';
    }
    /** A clear "no" to the probe: again after REST_MS, twice that after the second in a row, three times from the third on. */
    _rest(why, note) {
        const wait = REST_MS * Math.min(++this.rests, 3);
        this.cleared = '';
        this.nextAt = this.io.now() + wait;
        this.why = why;
        this.log.info('MHD flex: ' + note + ', asked again in ' + Math.round(wait / 60000) + ' min');
        return '';
    }
    /** The transport took nothing: a short wait, and a failure after BUSY_N in a row. */
    _busy() {
        if (++this.busyN >= BUSY_N) { this.busyN = 0; this._fail('transport busy', 'the transport took nothing ' + BUSY_N + ' times in a row'); return 'busy'; }
        this.nextAt = this.io.now() + BUSY_MS;
        return 'busy';
    }
    /** The Gate has no room for this request yet: wait until it has. Nothing was sent. */
    _wait(e) {
        const now = this.io.now(), long = e.until - now > LIMITS.gapMs;
        this.nextAt = e.until;
        if (long) {
            this.cleared = '';
            this.why = 'paused, too many tries';
            if (!this.paused) this.log.info('MHD flex: the limit for the ' + e.kind + ' is reached (' + LIMITS.perWindow + ' in 10 minutes, ' + LIMITS.perHour + ' in an hour), the next one in ' + Math.ceil((e.until - now) / 60000) + ' min');
            this.paused = true;
        }
        return '';
    }

    /** One step (one or two requests), or nothing when it is not time. 'busy' = the transport took nothing. */
    async step() {
        const gen = this.gen;
        if (this.state === 'unsupported' || this.io.now() < this.nextAt) return '';
        try {
            if (this.state === 'identify') return await this._identify(gen);
            if (this.state === 'probe') return await this._probe(gen);
            if (this.state === 'define') return await this._define(gen);
            return await this._read(gen);
        } catch (e) {
            if (gen !== this.gen || (e && e.off)) return '';          // the setting was changed while it was out: nothing to note
            if (e && e.limit) return this._wait(e);
            return this._fail('not sent', String(e && e.message || e).replace(/^MHD flex: /, ''));
        }
    }

    async _identify(gen) {
        const a = await this.io.read(0xF101, TIMEOUT_MS);
        if (gen !== this.gen) return '';
        if (a === undefined) return this._busy();
        this.busyN = 0;
        this._raw('22 F1 01', a);
        if (!a) return this._fail('no answer', 'no answer to the identification (22 F1 01)');
        const m = matchProfile(svkData(a), this.profiles);
        this.seen = m.seen; this.families = m.families;
        if (m.profile) { this.profile = m.profile; this._set('probe', 'reading...', m.profile.name + '. Ids: ' + m.seen.join(', ')); return ''; }
        if (!m.shape) return this._fail('software not identified', 'the answer to 22 F1 01 is not a software list of the known shape');
        if (!m.families.length) return this._fail('software not identified', 'no program entry in the engine unit\'s software list');
        // not a family whose memory places are known (or more than one family): nothing more is sent, and the ids are
        // what a new entry needs
        this._set('unsupported', 'software not supported', (m.families.length > 1 ? 'more than one program family in the software list (' + m.families.join(', ') + ')' : 'program family ' + m.families[0] + ' is not in the list')
            + '. No request that is not a read was sent for it. Ids: ' + m.seen.join(', '));
        return '';
    }

    async _probe(gen) {
        const r = await this.io.send(0x2F, PROBE.slice(), PROBE_TIMEOUT_MS, replyTo(0x2F, PROBE));
        if (gen !== this.gen) return '';
        if (r === undefined) return this._busy();
        this.busyN = 0; this.paused = false;
        this._raw('2F 04 4D 48 44', r);
        const p = parseProbe(r);
        if (p.mhd) { this.marker = p.marker; this.noTune = 0; this.rests = 0; this._set('define', 'reading...', 'MHD marker ' + p.marker); return ''; }
        if (!r) return this._fail('no answer', 'no answer to the MHD probe');
        if (p.nrc === 0x21) return this._fail('engine unit busy', 'the engine unit was busy at the MHD probe');
        // a "no". The first one is asked once more before it is believed (it may be the answer to another app's request)
        if (++this.noTune < 2) {
            this.nextAt = this.io.now() + LIMITS.gapMs;
            this.log.info('MHD flex: the MHD probe was not answered with MHD\'s marker (' + p.reason + '), asked once more');
            return '';
        }
        this.noTune = 2;
        return this._rest('no MHD tune found', 'the engine unit did not answer the MHD probe with MHD\'s marker (' + p.reason + ')');
    }

    async _define(gen) {
        let now = this.io.now();
        if (now < this.definedAt + LIMITS.gapMs) { this.nextAt = this.definedAt + LIMITS.gapMs; return ''; }
        const did = this.did, db = hexBytes(did);
        // (an answered clear is not sent again while its definition is being tried against a busy transport)
        if (!(this.cleared === did && now - this.clearedSeen < CLEARED_MS)) {
            this.cleared = '';
            const c = await this.io.send(0x2C, [0x03].concat(db), TIMEOUT_MS, acceptDefine(0x03, db));
            if (gen !== this.gen) return '';
            if (c === undefined) return this._busy();
            // (the count of busy tries goes on: it ends when the definition is taken, not when the clear is)
            this._raw('2C 03 ' + bytesHex(db, ' '), c);
            if (!c) return this._fail('no answer', 'no answer to the clear of ' + did);      // a refusal (nothing was defined) is fine
            this.cleared = did;
        }
        this.clearedSeen = this.io.now();
        const r = await this.io.send(0x2C, [0x02].concat(db, places(this.profile)), TIMEOUT_MS, acceptDefine(0x02, db));
        if (gen !== this.gen) return '';
        if (r === undefined) { this.clearedSeen = this.io.now(); return this._busy(); }          // the clear stands: the definition alone is tried next
        this.busyN = 0; this.paused = false;
        now = this.io.now();
        this.cleared = '';                                  // whatever it answered: the identifier is no longer known to be empty
        this.definedAt = now;
        this._raw('2C 02 ' + bytesHex(db, ' '), r);
        const d = parseDefine(r, 0x02);
        if (d.ok) {
            this.outOfRange = 0; this.misses = 0; this.lost = 0;
            this._set('read', 'reading...', 'identifier ' + did + ' defined');
            return '';
        }
        if (d.nrc === 0x31) {
            // "no such identifier" (or no such place): believed the second time; then the next candidate, if there is one
            if (++this.outOfRange < 2) { this.log.info('MHD flex: definition of ' + did + ' refused (out of range), asked once more'); return ''; }
            this.outOfRange = 0;
            if (this.didIndex + 1 < DIDS.length) {
                this.didIndex++;
                this.log.info('MHD flex: definition of ' + did + ' refused (out of range) twice, trying ' + this.did);
                return '';
            }
        }
        this.outOfRange = 0; this.didIndex = 0;
        if (!r) return this._fail('no answer', 'no answer to the definition of ' + did);
        // refused: after the wait the tune is asked for first
        this._set('probe', 'engine unit refused it', 'definition of ' + did + ' not taken: ' + d.reason);
        return this._fail('engine unit refused it', 'definition of ' + did + ' refused');
    }

    async _read(gen) {
        const did = this.did, db = hexBytes(did);
        const r = await this.io.read((db[0] << 8) | db[1], TIMEOUT_MS);
        if (gen !== this.gen) return '';
        if (r === undefined) return this._busy();
        this.busyN = 0;
        this._raw('22 ' + bytesHex(db, ' '), r);
        const v = parseRead(r, db), now = this.io.now();
        if (v.ok) {
            this.active = v.active; this.can = v.can; this.at = now;
            this.misses = 0; this.lost = 0;
            // the count of failures ends only once the identifier has lasted: one good read between two losses must not start it afresh
            if (now - this.definedAt >= SETTLED_MS) this.errors = 0;
            this.why = v.active === null ? 'not a percentage' : '';
            this.nextAt = now + READ_MS;
            return '';
        }
        if (!r) {
            // nobody answered: the last value is shown until it is FRESH_MS old, and not longer
            if (++this.misses >= MISSES) { this.misses = 0; return this._fail('no answer', 'no answer to ' + MISSES + ' reads of ' + did + ' in a row'); }
            this.nextAt = now + READ_MS;
            return '';
        }
        if (v.nrc === 0x31 || v.reason === 'length') {
            // the engine unit forgot the identifier (an ignition cycle, MHD's own app connecting), someone else defined
            // it - or the refusal was another app's. Read once more before it costs a definition
            if (++this.lost < 2) { this.nextAt = now + READ_MS; return ''; }
            this.lost = 0;
            this.active = null; this.can = null; this.at = NEVER;
            this.nextAt = Math.max(now, this.definedAt + LIMITS.gapMs);
            this._set('define', 'reading...', 'identifier ' + did + ' lost (' + v.reason + ')');
            return '';
        }
        // refused for another reason: the last value ends with that
        this.active = null; this.can = null; this.at = NEVER;
        return this._fail('engine unit refused it', 'read of ' + did + ' refused: ' + v.reason);
    }

    /** For the screen: { active, can: % or null (only while fresh), why, state }. */
    view(now) {
        const fresh = now - this.at < FRESH_MS;
        return { active: fresh ? this.active : null, can: fresh ? this.can : null, why: this.why, state: this.state };
    }
}

module.exports = {
    DME, PROFILES, DIDS, PROBE, LIMITS, READ_MS, FRESH_MS, REST_MS, BACKOFF_MS, SETTLED_MS,
    check, tap, Gate, MhdFlex,
    parseProbe, svkData, svkEntries, matchProfile, parseDefine, parseRead, hexBytes, bytesHex,
};
