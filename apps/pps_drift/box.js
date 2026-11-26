'use strict';
/**
 * box.js - Proven Drift: a record of every start and stop of the app, kept so that it outlives the app, and
 * shown on the Signals tab. After the first car (proven/CHANGES-drift.md part 9): the app closed by itself
 * there, the platform emptied its data folder with the log in it, and nothing was left to say how it had
 * ended or what it was doing. This is the answer to that: one photo of the Signals tab now tells.
 * (Begun from the investigators' prototype checks/crash-lifecycle/fix/files/runlog.js.)
 *
 *   const box = new Box({ id, ver, dataDir, tmp, mono, wall, uptime, groups, log });
 *   box.me            this life: { n, wall, up, s, end, on, note, ... }
 *   box.lives         the lives before this one, newest first (4 at most), as they were read and cleaned
 *   box.before        the newest of them, or null
 *   box.byItself      true if the life before this one ended with no word, with the app's own error, by a signal,
 *                     or with an exit code other than 0 and no word, while the head unit went on running
 *   box.signals(on)   listen for SIGTERM, SIGHUP and SIGINT, or stop listening (see A SIGNAL below). Not listening
 *                     is how the record starts: main.js switches it on only with the Workshop setting "Note stop signals"
 *   box.signal(sig, alone)   a signal was heard: noted with the life; its end too where nobody else listens for it
 *   box.on(keys)      the settings that are on (their keys): kept for this life, once on they stay listed
 *   box.off(keys)     but these are taken off the list again (a setting that leaves nothing behind when switched off)
 *   box.note(n, quiet)   every 2 s: the last note of this life (see NOTE below). Written to RAM every time, to
 *                     the data folder at most once a minute and only while quiet (no drift runs)
 *   box.end(kind, text, ramOnly)   'asked' (the SDK's shutdown event) | 'error' (text: its first line) | 'exit' (text:
 *                     the code) | 'signal' (text: SIGTERM, SIGHUP or SIGINT). ramOnly: the record in RAM alone for
 *                     now; box.flush() writes the data folder's copy
 *   box.lines()       the lines for the Signals tab and the log: [{ parts: [text, ...], warn }], newest first
 *   new Vitals({ mono })   memory, processor share and the longest hold-up of the event loop (see Vitals)
 *
 * WHAT A LIFE IS: one run of the app's process, from its start to its end. Five are kept. Per life:
 *   n        its number: one more than the number of the life before, 1 where there is none. Where the number
 *            found is the highest the record can hold (only a planted record reaches it), the lives found are
 *            kept and numbered again from 1, so that this life and the next can always be read back
 *   wall     when it started by the wall clock (ms; at: the same as text), and up: os.uptime() then (s), so
 *            that lives can be placed even when the wall clock jumps, and a restart of the head unit shows
 *   s        how long it has lived (s), as of its last note or its end
 *   end      how it ended: 'asked' (asked to stop by the car: the SDK's shutdown event), 'error' (the app's own
 *            error: err holds its first line and, where the stack names one, the file and line it came from, 160
 *            characters at most), 'exit' (the process ended with code: process's exit event), 'signal' (the
 *            process was sent SIGTERM, SIGHUP or SIGINT and nobody else on the process listened for it), or null:
 *            NO WORD. No word means none of these was written: the process was killed outright (kill -9), crashed in
 *            native code, or the power went
 *   sig      a signal that was heard in this life, whatever its end was (with the end 'asked': the SDK made a
 *            clean stop of it). Only with "Note stop signals" on
 *   on       which of the Workshop settings that are off as shipped were on in this life (askCar, gpsOn, ...)
 *   note     the LAST NOTE, refreshed every 2 s (NOTE below)
 *   disk     the copy in the data folder has been written in this life; ram: the record in RAM has
 *   emptied  the app's data folder was found empty at the start after this life
 *   other    this life was read from the record of another user id (the app was installed again since)
 *
 * NOTE (numbers and words from fixed lists only): mem, memMax (MB, the process's resident memory now and the
 *   most in this life), cpu, cpuMax (percent of one core over the last 2 s, and the most), lag, lagMax (ms: the
 *   longest hold-up of the event loop in the last 10 s, and in this life), fps (frames handed to the screen a
 *   second), path ('gpu' | 'soft' | ''), nps (values from the car a second, all sources), asked, answered (the
 *   app's own getter reads), show (what was showing: a tab, the first screen, or hidden), state (learning |
 *   ready | drift | nodata | demo), ok, want, failed (interfaces set up, wanted, failed), wait, bad (the names
 *   of those still being set up and of those that failed: names the app itself gave, o.names).
 *   NO POSITION, NO COURSE AND NO HEADING: nothing of the kind ever reaches this file.
 *
 * WHERE IT IS KEPT
 *   1. <tmp>/pps-box-<app id>-<user id>/box.json. /tmp is RAM on the head unit, one mount for every process
 *      (the kit keeps its drawn frames there the same way: kit/runtime/mgu.js). Written at the start, every
 *      2 s, whenever a setting or a subscription changes, and at every kind of end. It outlives the app's process AND a wipe of the app's data folder; it is
 *      gone when the head unit restarts.
 *   2. <data folder>/pps_drift_box.json. Written at the start, once more when the life is 10 s old (so that a
 *      short life has a real note there), at a clean stop, and at most once a minute, each only while no drift
 *      runs (a write to the head unit's flash can hold the app up). It outlives a restart of
 *      the head unit; it is gone when the data folder is emptied.
 *   At a start both are read and the newer one is taken. If the copy in RAM says the data folder had its copy
 *   and that copy is gone, the data folder was emptied in between: the life before is marked (emptied).
 *   ONLY WHERE THE APP HAS NO RECORD OF ITS OWN are the records of OTHER user ids (/tmp/pps-box-<app id>-*)
 *   looked at, read only: after the app was installed again it may run as another user. With a record of its
 *   own to go by, such a folder is not even opened: anybody can put one into /tmp, and one with a very high
 *   life number once took the place of the app's own lives for good. A folder under this user's own name that
 *   is NOT this user's (somebody else made it) is read the same way, as another user's, and never as the
 *   app's own; one that is a symbolic link is not read at all. Another user's record never counts as "the
 *   app stopped by itself last time": its lives are shown, marked "as another user", and that is all.
 *   DID THE HEAD UNIT RESTART since the life before? Yes for certain where its uptime now is less than it was
 *   then. Where that life had its record in RAM and RAM holds none now, RAM was cleared: by a restart, or by
 *   somebody who removed the folder while the unit ran on. The two clocks tell: if the uptime has grown since
 *   that life's last sign by as much as the wall clock has (within 20 s), the unit ran on: the first line
 *   then says "the record in RAM was gone, no restart", and the life counts as a stop by itself like any
 *   other. If they differ, or where a clock is not known, it is taken as a restart, as before.
 *   A folder in RAM that is gone, or cannot be written, is made again once a minute at most.
 *
 * A SIGNAL (SIGTERM, SIGHUP, SIGINT): the kit listens for none of them (kit/runtime/mgu.js), so each ends the
 *   process at once, as kill -9 does, and without a note the two cannot be told apart: both read NO WORD.
 *   AS SHIPPED THIS FILE LISTENS FOR NONE EITHER. A listener changes how the process answers a signal, and no
 *   app known to run on a car has one: (1) a process whose event loop is held up hears a signal only when
 *   the loop turns again, where without a listener it ends at once (the second check of this release
 *   measured it: 5 s instead of 3 ms, and never while the main thread is stuck in a system call); (2) if
 *   BMW's SDK or its native module handle a signal below JavaScript, a listener here takes that handler's
 *   place, and nothing in JavaScript can see whether one is there. Neither can be put right in JavaScript.
 *   So the three listeners are behind the Workshop setting "Note stop signals", OFF as shipped: box.signals(true).
 *   With it on: where nobody else on the process listens for the signal, the end is written into the record
 *   in RAM (one small synchronous write), the listener is taken off again and the same signal is sent to the
 *   app's own process, which then ends by that signal as it would have without the listener.
 *   Where some other listener for the signal exists (the SDK's JavaScript may have one: it is not in this
 *   source), the signal does not end the process by itself and what happens with it is that listener's
 *   business, as before: nothing is sent, and the signal is only noted with the life (sig), not as its end.
 *   If the SDK then asks the app to stop, the life reads "asked to stop by the car (the signal SIGTERM came
 *   first)", which is a clean stop and not a stop by itself.
 *
 * /tmp IS A PLACE ANYBODY ON THE UNIT CAN WRITE TO. So:
 *   - the folder is made with mode 0755 and is used only if it is a real directory (no symbolic link) that
 *     belongs to this process's user; otherwise nothing is written there;
 *   - a file is written under a temporary name (never through a symbolic link and never into a pipe: what
 *     stands under that name and is no plain file is removed first, and the open does not wait), mode 0644,
 *     and renamed;
 *   - a file is read only if it is a plain file of 64 KB at most (no link, no pipe: it is opened without
 *     following links and without waiting), parsed inside try / catch, and every field is taken through
 *     clean(): numbers that are finite and within bounds, words from fixed lists, the one free text (an
 *     error's first line) cut to 160 characters of printable ASCII, 5 lives at most. A planted or broken
 *     file cannot throw, hang, or put odd text on the screen: at worst its lives are not shown.
 *   - every file operation here is inside try / catch. If /tmp cannot be used the app runs on with the copy
 *     in the data folder alone, and says so (box.ram false).
 *
 * WHAT IT COSTS: one write of about 2 KB to RAM every 2 s, one to the data folder a minute at most, a timer
 * every 100 ms that reads the clock. It reads no car signal and calls nothing on the car.
 *
 * FIGURES THAT ARE GUESSES: 2 s, a minute, 100 ms, 10 s, 5 lives, 64 KB, 160 characters. None was tried on
 * a car. Whether the app's user may write to /tmp on a car is known from the kit's own comment only.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const KEEP = 5;                     // lives kept
const MAX_BYTES = 65536;            // a record larger than this is not read
const ERR_MAX = 160;                // characters of an error's first line
const DISK_EVERY_MS = 60000;        // the copy in the data folder: at most this often
const LAG_TICK_MS = 100, LAG_WINDOW_MS = 10000;
const DISK_FILE = 'pps_drift_box.json', RAM_FILE = 'box.json';
const OTHERS_MAX = 6;               // records of other user ids looked at
const ENDS = ['asked', 'error', 'exit', 'signal'];
const SIGS = ['SIGTERM', 'SIGHUP', 'SIGINT'];
const EARLY_DISK_S = 10;            // the copy in the data folder is written once more when the life is this old
const MAX_N = 999999999;            // the highest life number the record holds
const RAM_RETRY_MS = 60000;         // a folder in RAM that cannot be used is tried again this often
const RAN_ON_S = 20, RAN_ON_SHARE = 0.001;  // "the unit ran on": uptime and wall clock agree on the time since the life before within 20 s and a thousandth
const SHOWS = ['hidden', 'first', 'drift', 'last', 'session', 'best', 'signals', 'study'];
const STATES = ['learning', 'ready', 'drift', 'nodata', 'demo'];
const PATHS = ['gpu', 'soft'];
const HOOK = '__pps_drift_box';     // one set of process listeners, however often this file is loaded

const C = fs.constants || {};
const NOFOLLOW = C.O_NOFOLLOW || 0, NONBLOCK = C.O_NONBLOCK || 0;

const isNum = (x) => typeof x === 'number' && isFinite(x);
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const num = (x, lo, hi, dflt) => (isNum(x) && x >= lo && x <= hi ? x : dflt);
const whole = (x, lo, hi, dflt) => (isNum(x) && x >= lo && x <= hi ? Math.round(x) : dflt);
const word = (x, list) => (typeof x === 'string' && list.indexOf(x) >= 0 ? x : null);
/** A text cut to max characters of printable ASCII (anything else becomes a space). */
const plain = (x, max) => (typeof x === 'string' ? x.slice(0, max).replace(/[^\x20-\x7e]/g, ' ').trim() : '');
const two = (n) => (n < 10 ? '0' : '') + n;
/** A wall-clock time as text: day.month. hours:minutes:seconds, by the head unit's clock. */
function when(ms) {
    if (!isNum(ms) || ms <= 0) return 'no date';
    const d = new Date(ms);
    return two(d.getDate()) + '.' + two(d.getMonth() + 1) + '. ' + two(d.getHours()) + ':' + two(d.getMinutes()) + ':' + two(d.getSeconds());
}
/** Seconds as "24 s", "3 min 12 s", "2 h 5 min". */
function span(s) {
    if (!isNum(s) || s < 0) return '--';
    s = Math.round(s);
    if (s < 60) return s + ' s';
    if (s < 3600) return Math.floor(s / 60) + ' min' + (s % 60 ? ' ' + (s % 60) + ' s' : '');
    return Math.floor(s / 3600) + ' h ' + Math.floor((s % 3600) / 60) + ' min';
}

/* ---------- files: never a throw, never a link, never a wait ---------- */

/** The text of a plain file of MAX_BYTES at most, or null (not there, a link, a pipe, too large, not readable). */
function readSmall(file) {
    let fd = null;
    try {
        const st = fs.lstatSync(file);
        if (!st.isFile() || st.size > MAX_BYTES) return null;
        fd = fs.openSync(file, (C.O_RDONLY || 0) | NOFOLLOW | NONBLOCK);
        const st2 = fs.fstatSync(fd);
        if (!st2.isFile() || st2.size > MAX_BYTES) return null;
        const buf = Buffer.alloc(MAX_BYTES + 1);
        const n = fs.readSync(fd, buf, 0, MAX_BYTES + 1, 0);
        return n > MAX_BYTES ? null : buf.toString('utf8', 0, n);
    } catch (e) { return null; } finally { if (fd !== null) { try { fs.closeSync(fd); } catch (e) { /* closed */ } } }
}

/** Is the file there at all (whatever it is)? null: cannot tell. */
function exists(file) {
    try { fs.lstatSync(file); return true; } catch (e) { return e && e.code === 'ENOENT' ? false : null; }
}

/**
 * Write text to dir/name: under a temporary name, never through a link, never into a pipe, mode 0644, then renamed.
 * -> true | false. It cannot wait: a named pipe under the temporary name would hold an ordinary open for good (and
 * with it the whole app, at its start), so what stands there is looked at first and removed if it is no plain file,
 * and the open itself is one that does not wait (a pipe put there in between makes it fail, not wait).
 */
function writeSmall(dir, name, text) {
    const tmp = path.join(dir, name + '.tmp'), file = path.join(dir, name);
    for (let attempt = 0; attempt < 2; attempt++) {
        let fd = null;
        try {
            let st = null;
            try { st = fs.lstatSync(tmp); } catch (e) { st = null; }
            // (itself, not what it points to; a folder there cannot be removed this way: caught below, and "no" is the answer)
            if (st && !st.isFile()) fs.unlinkSync(tmp);
            fd = fs.openSync(tmp, (C.O_WRONLY || 1) | (C.O_CREAT || 0) | (C.O_TRUNC || 0) | NOFOLLOW | NONBLOCK, 0o644);
            if (!fs.fstatSync(fd).isFile()) throw new Error('no plain file');
            try { fs.fchmodSync(fd, 0o644); } catch (e) { /* as the system made it */ }
            fs.writeSync(fd, text);
            fs.closeSync(fd); fd = null;
            fs.renameSync(tmp, file);
            return true;
        } catch (e) {
            if (fd !== null) { try { fs.closeSync(fd); } catch (e2) { /* closed */ } }
            // (something that is no plain file stands under the temporary name: it is removed, itself and not what it points to, once)
            try { fs.unlinkSync(tmp); } catch (e2) { return false; }
        }
    }
    return false;
}

/** dir as a folder of this user's own: made if it is not there (0755). true only for a real directory that belongs to this process's user. */
function ownDir(dir) {
    try { fs.mkdirSync(dir, 0o755); } catch (e) { /* there already, or not allowed: looked at below */ }
    try {
        const st = fs.lstatSync(dir);
        if (!st.isDirectory() || st.isSymbolicLink()) return false;
        if (typeof process.getuid === 'function' && st.uid !== process.getuid()) return false;
        try { fs.chmodSync(dir, 0o755); } catch (e) { /* as it is */ }
        return true;
    } catch (e) { return false; }
}

/** What stands at dir: 'own' (a real directory of this process's user), 'foreign' (a real directory of somebody else), or null (not there, a link, no directory). Nothing is made or changed. */
function whose(dir) {
    try {
        const st = fs.lstatSync(dir);
        if (!st.isDirectory() || st.isSymbolicLink()) return null;
        return typeof process.getuid === 'function' && st.uid !== process.getuid() ? 'foreign' : 'own';
    } catch (e) { return null; }
}

/** The first line of an error and, where its stack names one, the file and line of its first frame: "TypeError: x is not a function (session.js:201)". */
function errorText(e) {
    const stack = String((e && e.stack) || e).split('\n'), first = stack[0] || '';
    let at = '';
    for (let i = 1; i < stack.length && i < 12 && !at; i++) {
        const m = /([A-Za-z0-9_.-]+\.js):(\d+)(?::\d+)?\)?\s*$/.exec(stack[i]);
        if (m) at = ' (' + m[1] + ':' + m[2] + ')';
    }
    return first.slice(0, ERR_MAX - at.length) + at;
}

/* ---------- a record as it is taken from a file ---------- */

function cleanNote(x, names) {
    if (!isObj(x)) return null;
    // (names of interfaces: only those the app knows, each once, in the app's own order)
    const known = (list) => (Array.isArray(list) ? (names || []).filter((n) => list.indexOf(n) >= 0) : []);
    return {
        mem: whole(x.mem, 0, 99999, null), memMax: whole(x.memMax, 0, 99999, null),
        cpu: whole(x.cpu, 0, 9999, null), cpuMax: whole(x.cpuMax, 0, 9999, null),
        lag: whole(x.lag, 0, 9999999, null), lagMax: whole(x.lagMax, 0, 9999999, null),
        fps: whole(x.fps, 0, 999, null), path: word(x.path, PATHS), nps: whole(x.nps, 0, 99999, null),
        asked: whole(x.asked, 0, 999999999, null), answered: whole(x.answered, 0, 999999999, null),
        show: word(x.show, SHOWS), state: word(x.state, STATES),
        ok: whole(x.ok, 0, 99, null), want: whole(x.want, 0, 99, null), failed: whole(x.failed, 0, 99, null),
        wait: known(x.wait), bad: known(x.bad),
    };
}

/** One life as it is kept, or null if it is not one. groups: the setting keys that may be listed under "on"; names: the interfaces a note may name. */
function cleanLife(x, groups, names) {
    if (!isObj(x) || !own(x, 'n')) return null;
    const n = whole(x.n, 1, MAX_N, null);
    if (n === null) return null;
    const end = word(x.end, ENDS);
    return {
        n, wall: num(x.wall, 1, 9e12, null), up: num(x.up, 0, 1e9, null), s: num(x.s, 0, 1e9, 0),
        end, code: end === null ? null : whole(x.code, 0, 255, null), err: end === 'error' ? plain(x.err, ERR_MAX) : '', sig: word(x.sig, SIGS),
        on: Array.isArray(x.on) ? (groups || []).filter((k) => x.on.indexOf(k) >= 0) : [],
        note: cleanNote(x.note, names),
        uid: whole(x.uid, 0, 4294967295, null), disk: x.disk === true, ram: x.ram === true, emptied: x.emptied === true, other: x.other === true,
        // (what is known of a life from the data folder's copy only, and a restart of the head unit after it, stay with the
        // life: one start later it would else read as a plain "lived 10 s ... Last note" where nobody knows how long it lived)
        atLeast: x.atLeast === true, restart: x.restart === true,
    };
}

/** A whole record from a file's text: { rev, lives: [newest first, KEEP at most] } or null. */
function clean(text, groups, names) {
    if (typeof text !== 'string' || !text) return null;
    let raw = null;
    try { raw = JSON.parse(text); } catch (e) { return null; }
    if (!isObj(raw) || raw.v !== 1 || !Array.isArray(raw.lives)) return null;
    const lives = [];
    for (let i = 0; i < raw.lives.length && i < 4 * KEEP && lives.length < KEEP; i++) {
        const l = cleanLife(raw.lives[i], groups, names);
        if (l && !lives.some((o) => o.n === l.n)) lives.push(l);
    }
    if (!lives.length) return null;
    lives.sort((a, b) => b.n - a.n);
    return { rev: whole(raw.rev, 0, 9e15, 0), lives };
}

/* ---------- memory, processor, hold-ups ---------- */

/**
 * What the process itself can measure of its own load.
 *   v.start()        a timer every 100 ms that notes how late it fires: the longest hold-up of the event loop
 *   v.read()      -> { mem, memMax (MB), cpu, cpuMax (percent of one core since the last read), lag (ms, the
 *                     longest hold-up in the last 10 s), lagMax (in this life) }
 * A hold-up of the app (a frame drawn in software, a file write, memory being tidied, another process taking
 * the processor) shows as a timer that fires late. Each of the figures is null where the runtime cannot give it.
 */
class Vitals {
    constructor(o) {
        this.mono = o.mono;
        this.memMax = null; this.cpuMax = null; this.lagMax = 0;
        this.lags = [];                 // [t, ms] of the hold-ups of the last 10 s that matter (the longest come first out of read())
        this.due = null; this.timer = null;
        this.cpuAt = null; this.cpuWas = null; this.cpu = null;
    }

    start() {
        if (this.timer !== null) return;
        this.due = this.mono() + LAG_TICK_MS;
        this.timer = setInterval(() => {
            try {
                const now = this.mono(), late = Math.max(0, now - this.due);
                // (the next one is due a tick after this one fired: one long hold-up is counted once)
                this.due = now + LAG_TICK_MS;
                if (late > this.lagMax) this.lagMax = late;
                if (late >= 5) { this.lags.push([now, late]); if (this.lags.length > 200) this.lags.shift(); }
            } catch (e) { /* never in the way */ }
        }, LAG_TICK_MS);
    }

    read() {
        // (the processor share is worked out over 0.2 s at least: a read that follows another closely keeps the last figure)
        const out = { mem: null, memMax: this.memMax, cpu: this.cpu, cpuMax: this.cpuMax, lag: 0, lagMax: Math.round(this.lagMax) };
        try {
            const mb = process.memoryUsage().rss / 1048576;
            if (isNum(mb)) { out.mem = Math.round(mb); if (this.memMax === null || out.mem > this.memMax) this.memMax = out.mem; out.memMax = this.memMax; }
        } catch (e) { /* not known */ }
        try {
            const now = this.mono(), u = process.cpuUsage(), used = (u.user + u.system) / 1000;
            if (this.cpuAt !== null && now - this.cpuAt >= 200) {
                const share = Math.max(0, Math.round(100 * (used - this.cpuWas) / (now - this.cpuAt)));
                out.cpu = share; this.cpu = share;
                if (this.cpuMax === null || share > this.cpuMax) this.cpuMax = share;
                out.cpuMax = this.cpuMax;
            }
            if (this.cpuAt === null || now - this.cpuAt >= 200) { this.cpuAt = now; this.cpuWas = used; }
        } catch (e) { /* not known */ }
        try {
            const now = this.mono();
            this.lags = this.lags.filter((l) => now - l[0] <= LAG_WINDOW_MS);
            out.lag = Math.round(this.lags.reduce((m, l) => Math.max(m, l[1]), 0));
        } catch (e) { /* not known */ }
        return out;
    }
}

/* ---------- the record ---------- */

class Box {
    /**
     * o: { id (the app's id), ver, dataDir (or null), tmp (default '/tmp'), mono() ms forward only, wall() ms,
     *      uptime() s (default os.uptime), groups: { settingKey: word for the screen }, names: [the interfaces a note
     *      may name as under way or failed], log }
     */
    constructor(o) {
        this.o = o || {};
        this.id = String(this.o.id || 'app').replace(/[^A-Za-z0-9_]/g, '').slice(0, 40) || 'app';
        this.mono = this.o.mono; this.wall = this.o.wall || (() => Date.now());
        this.uptime = this.o.uptime || (() => os.uptime());
        this.groups = this.o.groups || {};
        this.keys = Object.keys(this.groups);
        this.names = Array.isArray(this.o.names) ? this.o.names.map(String) : [];
        this.log = this.o.log || { info() {}, warn() {} };
        this.uid = typeof process.getuid === 'function' ? process.getuid() : 0;
        this.startMono = this._safe(() => this.mono(), 0);
        this.ram = false; this.ramDir = null; this.disk = false; this.diskAt = -Infinity; this.rev = 0;
        this.lives = []; this.me = null; this.before = null; this.byItself = false; this.restarted = false;
        this.ramGone = false;           // the life before had its record in RAM, RAM holds none now, and the two clocks say the head unit ran on
        this.ramPath = null; this.ramTry = this.startMono;      // where the record in RAM belongs, and when its folder was last looked at
        this.ramLost = false;           // a write to RAM has failed in this life (said in the log when it works again)
        this.gap = null;                // seconds between the end (the last sign) of the life before and this start, where the head unit's uptime tells
        try { this._start(); } catch (e) { this._fallback(e); }
    }

    _safe(fn, dflt) { try { const v = fn(); return v === undefined ? dflt : v; } catch (e) { return dflt; } }

    /** Something in here failed in a way nobody foresaw: the app runs on with a record in memory only. */
    _fallback(e) {
        if (!this.me) this.me = { n: 1, wall: null, up: null, s: 0, end: null, code: null, err: '', sig: null, on: [], note: null, uid: this.uid, disk: false, ram: false, emptied: false, other: false };
        this.ram = false; this.ramDir = null; this.ramPath = null; this.diskDir = null;
        try { this.log.warn('starts and stops: the record cannot be kept (' + (e && e.message || e) + ')'); } catch (e2) { /* nothing to say it with */ }
    }

    _start() {
        const tmp = this.o.tmp || '/tmp', name = 'pps-box-' + this.id + '-';
        this.diskDir = this.o.dataDir || null;
        // 1. what is there: this user's record in RAM and the copy in the data folder
        const ramDir = path.join(tmp, name + this.uid), ramIs = whose(ramDir);
        this.ramPath = ramDir;
        // (the app's own record is read only out of a real folder of this user's own: a folder somebody else put under
        // this name is read below as another user's, never believed as the app's own; a link is not read at all)
        const ramRec = ramIs === 'own' ? clean(readSmall(path.join(ramDir, RAM_FILE)), this.keys, this.names) : null;
        const diskFile = this.diskDir ? path.join(this.diskDir, DISK_FILE) : null;
        const diskRec = diskFile ? clean(readSmall(diskFile), this.keys, this.names) : null;
        // (the newer of the two: the higher life number, then the later write; where both say the same, the one in RAM)
        const newer = (a, b) => !b || a.lives[0].n > b.lives[0].n || (a.lives[0].n === b.lives[0].n && a.rev > b.rev);
        let best = null, from = 'none';
        if (ramRec) { best = ramRec; from = 'ram'; }
        if (diskRec && newer(diskRec, best)) { best = diskRec; from = 'disk'; }
        // The records of other user ids: ONLY where the app has no record of its own (after it was installed again it
        // may run as another user). With a record of its own, such a folder is not even opened: anybody can put one
        // into /tmp, and its life numbers must never take the place of the app's own.
        if (!best) {
            let other = null;
            try {
                const names = fs.readdirSync(tmp).filter((f) => f.indexOf(name) === 0 && /^\d{1,10}$/.test(f.slice(name.length)) && (f !== name + this.uid || ramIs === 'foreign')).slice(0, OTHERS_MAX);
                names.forEach((f) => {
                    let st = null;
                    try { st = fs.lstatSync(path.join(tmp, f)); } catch (e) { return; }
                    if (!st.isDirectory() || st.isSymbolicLink()) return;
                    const r = clean(readSmall(path.join(tmp, f, RAM_FILE)), this.keys, this.names);
                    if (r && (!other || newer(r, other))) other = r;
                });
            } catch (e) { /* /tmp cannot be listed */ }
            if (other) {
                // (its lives are shown as another user's; how often it was written is its own business, not taken over)
                best = { rev: 0, lives: other.lives.map((l) => Object.assign({}, l, { other: true, disk: false, ram: false })) };
                from = 'other';
            }
        }
        this.readFrom = from;
        this.lives = best ? best.lives.slice(0, KEEP - 1) : [];
        // (a life number at the top of what the record holds is no count of this app's starts: only a planted record
        // reaches it. One more would be a number the next start cannot read back, and the record would stop recording:
        // so the lives found are kept and numbered again from 1)
        if (this.lives.length && this.lives[0].n >= MAX_N) this.lives.forEach((l, i) => { l.n = this.lives.length - i; });
        this.before = this.lives[0] || null;
        this.rev = (best ? best.rev : 0) + 1;
        // 2. was the data folder emptied since? The record in RAM says it had its copy, and the copy is gone
        if (from === 'ram' && this.before && this.before.disk && diskFile && exists(diskFile) === false) this.before.emptied = true;
        // 3. the life before: did the head unit restart since (its uptime now is less than it was then)?
        const up = this._safe(() => this.uptime(), null), wall = this._safe(() => this.wall(), null), b = this.before;
        // (a record from the data folder alone is up to a minute behind: how long that life really was is not known)
        if (b && from === 'disk' && b.end === null) b.atLeast = true;
        if (b && isNum(up) && isNum(b.up) && up < b.up + b.s - 5) this.restarted = true;
        // Where that life had its record in RAM and the record is gone, RAM was cleared: by a restart of the head unit,
        // or by somebody who removed the folder while the unit ran on. The two clocks tell which: since that life's
        // last sign the uptime and the wall clock have grown by the same (the unit ran on), or not (a restart; also
        // where a clock is not known, or the wall clock was set in between).
        if (b && !this.restarted && from === 'disk' && b.ram && !ramRec) {
            const du = isNum(up) && isNum(b.up) ? up - (b.up + b.s) : null, dw = isNum(wall) && isNum(b.wall) ? (wall - b.wall) / 1000 - b.s : null;
            if (du !== null && dw !== null && du >= -5 && Math.abs(du - dw) <= Math.max(RAN_ON_S, RAN_ON_SHARE * Math.abs(dw))) this.ramGone = true; else this.restarted = true;
        }
        if (b && this.restarted) b.restart = true;
        if (b && !this.restarted && !b.atLeast && isNum(up) && isNum(b.up)) this.gap = Math.max(0, up - (b.up + b.s));
        // (a stop nobody asked for through the SDK: no word, the app's own error, a signal that ended the process, or an
        // exit code other than 0 with no word. Never said of another user's record: anybody can put one into /tmp)
        this.byItself = !!b && !b.other && !this.restarted && (b.end === null || b.end === 'error' || b.end === 'signal' || (b.end === 'exit' && b.code !== 0));
        // 4. this life
        this.me = { n: (b ? b.n : 0) + 1, wall: isNum(wall) ? wall : null, up: isNum(up) ? up : null, s: 0, end: null, code: null, err: '', sig: null, on: [], note: null, uid: this.uid, disk: false, ram: false, emptied: false, other: false };
        this.early = false;
        // 5. where it is written
        this.ram = ownDir(ramDir);
        this.ramDir = this.ram ? ramDir : null;
        this._hook();
        this._write(true);
    }

    /** One set of listeners for the whole process: the exit code, and an uncaught error (written before the kit's own handler ends the process). */
    _hook() {
        const first = !process[HOOK];
        if (first) process[HOOK] = { box: null };
        process[HOOK].box = this;
        if (!first) return;
        process.on('exit', (code) => { try { const b = process[HOOK].box; if (b) b.end('exit', code); } catch (e) { /* too late to matter */ } });
        process.prependListener('uncaughtException', (e) => {
            try { const b = process[HOOK].box; if (b) b.end('error', errorText(e)); } catch (e2) { /* the kit's handler still runs */ }
            // (never swallowed: the kit's own handler comes next, logs it and ends the process. Where there is none, as on
            // a PC without the kit's runtime, the process ends here as it would have without this listener)
            if (process.listenerCount('uncaughtException') <= 1) {
                try { console.error((e && e.stack) || e); } catch (e2) { /* no console */ }
                process.exit(1);
            }
        });
    }

    /**
     * Listen for SIGTERM, SIGHUP and SIGINT (on: true), or stop listening (false). NOT LISTENING IS HOW A LIFE STARTS:
     * a listener changes how the process answers a signal (see A SIGNAL at the top), so main.js calls this with true
     * only while the Workshop setting "Note stop signals" is on. One set of listeners for the whole process.
     * A signal heard: noted in the record in RAM. Where nobody else on the process listens for it, it is this life's
     * end: the listener is taken off and the same signal sent to this process, which then ends by it as it would have
     * without the listener. Where another listener exists, nothing is sent and this one stays: what happens then is
     * that listener's business, as before.
     */
    signals(on) {
        try {
            const H = process[HOOK];
            if (!H) return;
            if (!H.sigs) H.sigs = {};
            SIGS.forEach((sig) => {
                if (on && !H.sigs[sig]) {
                    const heard = () => {
                        let alone = true;
                        try { alone = process.listenerCount(sig) <= 1; } catch (e) { /* taken as alone */ }
                        try { const b = process[HOOK].box; if (b) b.signal(sig, alone); } catch (e) { /* the signal still does its work */ }
                        if (!alone) return;
                        try { process.removeListener(sig, heard); H.sigs[sig] = null; } catch (e) { /* as it is */ }
                        try { if (process.listenerCount(sig) === 0) process.kill(process.pid, sig); } catch (e) { /* nothing more to do */ }
                    };
                    try { process.on(sig, heard); H.sigs[sig] = heard; } catch (e) { /* a system without this signal */ }
                } else if (!on && H.sigs[sig]) {
                    // (with the last listener gone, Node puts the system's own answer to the signal back)
                    try { process.removeListener(sig, H.sigs[sig]); } catch (e) { /* as it is */ }
                    H.sigs[sig] = null;
                }
            });
        } catch (e) { /* never in the way */ }
    }

    /** Is this process listening for the three signals right now? */
    listening() { try { const H = process[HOOK]; return !!(H && H.sigs && SIGS.some((sig) => H.sigs[sig])); } catch (e) { return false; } }

    _text() {
        const me = Object.assign({}, this.me, { at: when(this.me.wall) });
        return JSON.stringify({ v: 1, app: this.id, ver: String(this.o.ver || ''), rev: this.rev, written: when(this._safe(() => this.wall(), null)),
            lives: [me].concat(this.lives.map((l) => Object.assign({ at: when(l.wall) }, l))) });
    }

    /**
     * Write the record: to RAM always, to the data folder too where asked (disk). Each life says which copies of
     * it exist (disk, ram): the next start goes by that, so a copy never claims another that was not written.
     */
    _write(disk) {
        try {
            this.rev++;
            const me = this.me, hadDisk = me.disk, hadRam = me.ram, toDisk = !!(disk && this.diskDir);
            let onDisk = false;
            if (toDisk) {
                me.disk = true;
                if (this.ramDir) me.ram = true;             // (written next; put right below if that fails)
                onDisk = writeSmall(this.diskDir, DISK_FILE, this._text());
                if (!onDisk) me.disk = hadDisk;
                this.disk = onDisk; this.diskAt = this._safe(() => this.mono(), 0);
            }
            // (a folder in RAM that is gone, or could not be used or written: looked at again, and made again, once a
            // minute at most. Nothing on a head unit is known to remove it while the unit runs; if something does, the
            // record is back in RAM a minute later at the latest)
            if (!this.ram && this.ramPath) {
                const now = this._safe(() => this.mono(), 0);
                if (now - this.ramTry >= RAM_RETRY_MS) { this.ramTry = now; this.ramDir = ownDir(this.ramPath) ? this.ramPath : null; }
            }
            if (this.ramDir) {
                me.ram = true;
                const inRam = writeSmall(this.ramDir, RAM_FILE, this._text());
                if (!inRam) {
                    me.ram = hadRam;
                    if (onDisk && !hadRam) writeSmall(this.diskDir, DISK_FILE, this._text());
                    if (this.ram) { this.ramTry = this._safe(() => this.mono(), 0); this.log.warn('starts and stops: the record in RAM cannot be written, kept in the data folder alone (tried again in a minute)'); }
                } else if (!this.ram && this.ramLost) this.log.info('starts and stops: the record in RAM is kept again');
                if (!inRam) this.ramLost = true;
                this.ram = inRam;
            }
        } catch (e) { /* never in the way */ }
    }

    /** The settings that are on right now (their keys). A group that was on at any time in this life stays listed: its subscription stays to the end of the life. */
    on(keys) {
        try {
            const add = this.keys.filter((k) => (keys || []).indexOf(k) >= 0 && this.me.on.indexOf(k) < 0);
            if (!add.length) return;
            this.me.on = this.keys.filter((k) => this.me.on.indexOf(k) >= 0 || add.indexOf(k) >= 0);
            this._write(false);
        } catch (e) { /* never in the way */ }
    }

    /** A setting that is no longer on and leaves nothing behind (the signal listeners: taken off at once): no longer listed. */
    off(keys) {
        try {
            const left = this.me.on.filter((k) => (keys || []).indexOf(k) < 0);
            if (left.length === this.me.on.length) return;
            this.me.on = left;
            this._write(false);
        } catch (e) { /* never in the way */ }
    }

    _age() { return Math.max(0, (this._safe(() => this.mono(), this.startMono) - this.startMono) / 1000); }

    /** The last note of this life (every 2 s). quiet: no drift runs, so the copy in the data folder may be written if it is due. */
    note(n, quiet) {
        try {
            if (this.me.end === 'asked' || this.me.end === 'error' || this.me.end === 'signal') return;
            this.me.s = Math.round(this._age());
            this.me.note = cleanNote(n, this.names);
            const now = this._safe(() => this.mono(), 0);
            // (the data folder's copy: a minute apart at most, and once when the life is 10 s old, so that a life that ends
            // young without a word, and whose record in RAM is lost with the power, still has a real note there)
            const early = !this.early && this._age() >= EARLY_DISK_S;
            const disk = !!quiet && (early || now - this.diskAt >= DISK_EVERY_MS);
            if (disk && early) this.early = true;
            this._write(disk);
        } catch (e) { /* never in the way */ }
    }

    /**
     * How this life ends. 'asked': the SDK's shutdown event (the data folder's copy is written too, at once or with
     * flush(): this is the clean stop). 'error': the app's own error, text = its first line. 'signal': see signal().
     * 'exit': the process's exit event, text = its code; it does not replace 'asked', 'error' or 'signal', which came
     * first, it adds the code. 'asked' does replace 'signal': if the SDK still asks the app to stop after a signal, that
     * is a clean stop, and the signal stays noted beside it (sig).
     * The rates of the last note (frames, values a second) are left as the last note had them: an end works out none.
     */
    end(kind, text, ramOnly) {
        try {
            if (ENDS.indexOf(kind) < 0) return;
            if (kind === 'signal') { this.signal(text, true); return; }
            const me = this.me;
            if (kind === 'exit') {
                me.s = Math.round(this._age());
                me.code = whole(Number(text), 0, 255, null);
                if (me.end === null) me.end = 'exit';
                this._write(false);
                return;
            }
            if (me.end === 'asked' || me.end === 'error' || (me.end === 'signal' && kind !== 'asked')) return;
            me.s = Math.round(this._age());
            me.end = kind;
            if (kind === 'error') me.err = plain(String(text), ERR_MAX);
            this._write(kind === 'asked' && !ramOnly);
        } catch (e) { /* never in the way */ }
    }

    /**
     * A signal was heard (SIGTERM, SIGHUP or SIGINT; anything else is kept as "not known"). It is noted with the life
     * in the record in RAM: one small write. alone: nobody else on the process listens for it, so it ends the process,
     * and that is this life's end ('signal'), unless the app was asked to stop or failed before. Not alone: only noted.
     */
    signal(sig, alone) {
        try {
            const me = this.me, ended = me.end === 'asked' || me.end === 'error' || me.end === 'signal';
            if (!ended) me.s = Math.round(this._age());
            if (me.sig === null || (alone && !ended)) me.sig = word(String(sig), SIGS);
            if (alone && !ended) me.end = 'signal';
            this._write(false);
        } catch (e) { /* never in the way */ }
    }

    /** The copy in the data folder, now (after end('asked', null, true): the saved file went first). */
    flush() { try { this._write(true); } catch (e) { /* never in the way */ } }

    /* ---------- in words ---------- */

    /** The groups that were on in a life: "GPS, wheels", or "none". */
    onText(l) { return (l.on || []).map((k) => this.groups[k]).filter(Boolean).join(', ') || 'none'; }

    /** A note in parts, the most telling first: the screen takes as many as fit its line. */
    _noteParts(n, now) {
        if (!n) return [];
        const p = [], more = (a, b, unit, w) => (isNum(a) ? a + unit + (isNum(b) && b > a ? ' (' + (w || 'most') + ' ' + b + ')' : '') : null);
        const add = (x) => { if (x) p.push(x); };
        add(isNum(n.mem) ? 'memory ' + more(n.mem, n.memMax, ' MB') : null);
        add(isNum(n.cpu) ? 'processor ' + more(n.cpu, n.cpuMax, ' %') : null);
        add(isNum(n.lagMax) ? (now ? 'longest hold-up ' + n.lagMax + ' ms' + (isNum(n.lag) ? ' (last 10 s: ' + n.lag + ')' : '') : 'hold-up ' + more(isNum(n.lag) ? n.lag : n.lagMax, n.lagMax, ' ms')) : null);
        add(n.show ? { hidden: 'screen hidden', first: 'first screen', drift: 'Drift tab', last: 'Last tab', session: 'Session tab', best: 'Best tab', signals: 'Signals tab', study: 'Signals tab, page 2' }[n.show] : null);
        add(n.state ? { learning: 'learning', ready: 'ready', drift: 'in a drift', nodata: 'no data', demo: 'demo data' }[n.state] : null);
        // (how far set-up had got: all of it, or how many interfaces of those wanted, which were still under way and which had failed)
        add(isNum(n.want) && isNum(n.ok) ? (n.ok >= n.want && !n.failed ? 'set-up done' : 'set-up ' + n.ok + ' of ' + n.want +
            (n.wait && n.wait.length ? ' (under way: ' + n.wait.join(' ') + ')' : '') + (n.failed ? ' (' + n.failed + ' failed' + (n.bad && n.bad.length ? ': ' + n.bad.join(' ') : '') + ')' : '')) : null);
        add(isNum(n.fps) ? n.fps + (n.fps === 1 ? ' frame/s' : ' frames/s') + (n.path === 'gpu' ? ' GPU' : n.path === 'soft' ? ' software' : '') : null);
        add(isNum(n.nps) ? n.nps + (n.nps === 1 ? ' value/s' : ' values/s') : null);
        add(isNum(n.asked) ? 'own reads ' + (isNum(n.answered) ? n.answered + ' of ' : '') + n.asked : null);
        return p;
    }

    /**
     * The lines for the Signals tab and the log, newest first. Each is { parts, warn }: parts[0] always shows,
     * the others follow it, joined with ", ", as far as the line has room (screens.js; the log takes them all).
     */
    lines() {
        const out = [];
        try {
            const me = this.me, b = this.before;
            const head = '#' + me.n + ' now: ' + span(this._age()) +
                (b && this.restarted ? ' (the head unit was restarted since #' + b.n + ')' : b && this.ramGone ? ' (the record in RAM was gone, no restart since #' + b.n + ')' :
                    b && isNum(this.gap) ? ' (started ' + span(this.gap) + ' after #' + b.n + (b.end === null ? '\'s last note' : ' ended') + ')' : '') +
                (this.ram ? '' : this.diskDir ? ' (no record in RAM: data folder only)' : ' (the record cannot be kept)');
            out.push({ parts: [head].concat(this._noteParts(me.note, true), ['on: ' + this.onText(me)]), warn: false });
            this.lives.forEach((l) => {
                // (a signal that was heard and did not end the life by itself is said beside how the life did end)
                const too = l.sig && l.end !== 'signal' ? ' (the signal ' + l.sig + ' came first)' : '';
                const how = l.end === 'asked' ? 'asked to stop by the car' + too : l.end === 'error' ? 'THE APP\'S OWN ERROR' + (isNum(l.code) ? ' (exit code ' + l.code + ')' : '') + ': ' + (l.err || 'no text') :
                    l.end === 'signal' ? 'ENDED BY THE SIGNAL ' + (l.sig || 'not known') + ' (sent from outside the app)' + (isNum(l.code) ? ', exit code ' + l.code : '') :
                    l.end === 'exit' ? (l.code === 0 ? 'exit code 0' : 'EXIT CODE ' + (isNum(l.code) ? l.code : 'not known') + ' AND NO WORD BEFORE IT') + too : 'NO WORD (killed, crashed or power lost)' + too;
                // (a life known from the data folder's copy alone, with no end in it: that copy is written a minute apart, so
                // how long the life really was is not known, and its note is the saved one, not the last)
                const first = '#' + l.n + ' ' + when(l.wall) + ' lived ' + (l.atLeast ? 'at least ' : '') + span(l.s) + (l.atLeast ? ' (saved note, up to a minute old)' : '') + ', ' + how + (l.other ? ' (as another user: installed again since)' : '') +
                    (l.restart && l !== this.before ? ' (the head unit restarted after it)' : '');     // (of the life just before, the first line says it)
                const note = this._noteParts(l.note, false);
                if (note.length) note[0] = (l.atLeast ? 'Saved note: ' : 'Last note: ') + note[0];
                out.push({ parts: [first].concat(note, ['on: ' + this.onText(l)]), warn: l.end === null || l.end === 'error' || l.end === 'signal' || (l.end === 'exit' && l.code !== 0) });
                if (l.emptied) out.push({ parts: ['The saved data was emptied after #' + l.n], warn: true });
            });
        } catch (e) { /* what there is */ }
        return out;
    }
}

module.exports = { Box, Vitals, clean, cleanLife, readSmall, writeSmall, ownDir, whose, errorText, when, span, SIGS, KEEP, MAX_BYTES, ERR_MAX, MAX_N, RAM_RETRY_MS, DISK_FILE, RAM_FILE, DISK_EVERY_MS, SHOWS, STATES };
