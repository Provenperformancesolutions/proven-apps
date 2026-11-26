'use strict';
/**
 * box.js - Proven Drag: the record of every start and stop of the app, for the Signals tab and the log.
 *
 * WHY. On the first car the app closed by itself, again and again, and nothing was left to say how: the
 * app's log is in its data folder, and the platform empties that folder after an unexpected exit. Nobody
 * can attach a tool to the car. So the app keeps its own small record, in a place the platform does not
 * empty, and shows it on a screen that can be photographed.
 *
 * WHAT IS KEPT: the last 5 lives of the app (a life = one start of its process). Per life:
 *   n        its number                      at, wall   when it started, by the head unit's clock (text, ms)
 *   up       os.uptime() at its start, in seconds: the head unit's clock can jump, its uptime cannot, and an
 *            uptime that is now smaller than it was then says the head unit has been restarted since
 *   s        how long it lived (seconds, as of its last note)
 *   end      how it ended: 'asked' (the SDK's shutdown event: the car asked the app to stop), 'error' (the app's
 *            own error: err holds its first line, cut with "..." at 160 characters, where the file and line of the first place in its stack),
 *            'exit' (the process ended with exit code `code` and no word before it), 'signal' (the process was
 *            sent a signal that ends it, and `sig` says which: SIGTERM, SIGHUP or SIGINT; only with the setting
 *            "Note stop signals" on, see below), or '' = NO WORD: none of these was written. The process was
 *            killed outright (SIGKILL cannot be noted), it was ended by a signal nobody noted (as shipped: any
 *            signal), it crashed in native code, or the power went
 *   note     the last note of that life, refreshed every 2 s: memory now and highest (MB), processor share over
 *            the last 2 s and highest (percent of one core), the longest hold-up of the app's own 50 ms tick
 *            in this life and in the last 10 s (ms), frames drawn a second and what drew them, notifications a
 *            second, the app's own getter reads asked and answered, what was showing, the app's state, how far
 *            the set-up of the subscriptions had got, and which extras were switched on (on.sig: whether the
 *            stop signals were being noted, and which of the three).
 *            The two rates are worked out over a second or more: a note taken sooner than that after the last
 *            one (at an end, or when a setting or a subscription changes) keeps the rates it had.
 *   ram, disk, gone, from    this life's record was written to RAM, and to the data folder; at this start the
 *            data folder's copy was gone although the copy in RAM said it had one ("the saved data was
 *            emptied"); the lives before this one were read from another user's record (the app was
 *            installed again)
 *   old      1: all that is left of this life is the data folder's copy, and no end is noted in it. That copy
 *            is written at the start and then once a minute at most, so its note may be up to a minute older
 *            than the life's end (it is the start's note if the life was under a minute old). The lines then
 *            say "lived at least ..." and "Saved note (up to a minute before its end)", not "lived ..." and
 *            "Last note"
 * NO POSITION, NO COURSE AND NO HEADING is in it, and nothing else of the car's data: numbers the process
 * knows about itself, names of tabs and interfaces, and the first line of an error.
 *
 * WHERE. Two copies of the same small text (about 3 KB):
 *   in RAM    <tmp>/pps-box-<app id>-<uid>/box.json      /tmp is a RAM disk on the head unit (the kit keeps its
 *             drawn frames there the same way: kit/runtime/mgu.js). Written at the start, every 2 s and at
 *             every kind of end. It outlives the process and a wipe of the data folder; it is gone when the
 *             head unit restarts.
 *   on disk   <data folder>/box.json                      written at the start, at every kind of end the app
 *             hears of, and at most once a minute while no run is being timed (a write to the head unit's
 *             flash can hold the app up). It outlives a restart of the head unit; it is gone with a wipe.
 * At a start both are read: the newest counts. Only where neither holds a record is the record of another
 * user id looked for (after a reinstall the app may run as another user): read only, and said to be one.
 *
 * A SIGNAL THAT ENDS THE PROCESS (SIGTERM, SIGHUP, SIGINT). AS SHIPPED THIS MODULE LISTENS FOR NONE OF THEM.
 * Neither does the kit, the published 1.0.1, Proven Gauges or Proven Warm-Up: a signal then ends the process
 * at once, also while the app is held up or hangs, and the record has NO WORD for such an end, as for a kill.
 * That is the price of doing nothing the working apps do not do, and it is paid on purpose: a listener
 * changes how the process answers a signal. A signal is handed to a listener only when the app's own code
 * next comes round, so while the app is held up, and for good while its main thread is stuck (the kit's
 * notes say the native binding can deadlock it), a signal no longer ends the process; only SIGKILL does.
 * Whether the platform ends an app with a signal, and what it does with one that does not go, is not known.
 * THE WORKSHOP SETTING "Note stop signals" (off as shipped) is for finding that out on purpose. Switched on
 * (box.listen(true), or signals: true at the start), this module listens for the three at once, but only
 * where nobody else on the process does (the kit does not; if the SDK does, this module leaves that signal
 * alone, what happens then is theirs as before, and the line of this life says which signals are noted).
 * When one comes, the word is written at once and in the same turn (RAM first, then the data folder), the
 * listener is taken off again and the same signal is sent to the app's own process: with no listener left
 * it ends the process exactly as it would have without this module, so the platform sees the same end.
 * Switched off (box.listen(false)), the listeners are taken off at once and everything is as shipped again.
 * A signal and the car's own word together (the SDK's shutdown event, in either order) is a clean stop: the
 * life reads "asked to stop by the car", with the signal named, and the Run tab shows no line.
 *
 * /tmp IS EVERYBODY'S. Any process on the unit can write there. So: the folder is made with mode 0755 and
 * the file with 0644 (both set outright: the process's umask does not decide them, so that the record can
 * be read after a reinstall under another user id); if the path is there already and is not a real
 * directory owned by this process's user (a symbolic link is not one), nothing is written to it and
 * nothing in it is read as this app's own; a write goes to a temporary name and is
 * renamed. A file is read through a handle that follows no link and does not wait on a pipe, 64 KB at
 * most, parsed inside try / catch, and every field is taken through clean(): a finite number inside its
 * bounds or nothing, a text cut to its length and stripped to printable ASCII, 5 lives at most. A planted
 * or broken file can at worst put a wrong but harmless line on the Signals tab.
 * EVERY file operation here is inside try / catch. Nothing in this module can throw into the app, and if
 * /tmp cannot be used the app runs on with the copy in the data folder alone (the Signals tab says so).
 *
 *   const box = new Box({ id, dir, tmp, now, wall, on, signals, proc });     reads the old record, writes this life's start
 *     now()   ms on the app's forward-only clock;  wall()  Date.now();  proc: the process (for the tests)
 *     on      which extras the settings have switched on at this start ({ ask, gps, wheels, pos, study }: 0 / 1),
 *             so that the first copy written says so (the data folder's copy may be all that is left of a life)
 *     signals true: the setting "Note stop signals" is on at this start (left out or false, as shipped: no listener)
 *   box.listen(on)           that setting was switched: the listeners for the three signals are put on the process
 *                            (true) or taken off it (false) at once, and a note is taken and written to RAM
 *   box.beat(now, state)     every 50 ms from the app's own tick: measures how late the tick is, and every 2 s
 *                            takes a note (box.tell) and writes it. state 'timing': no write to the data folder
 *   box.tell = () => ({ frames, path, notes, asked, answered, tab, state, setup, on })   what only the app knows
 *   box.note(now)            take a note now and write it to RAM: at the app's start, and whenever a setting of
 *                            an extra or the state of a subscription changes (so that the record is right
 *                            before the next call to the car is made)
 *   box.end('asked', null, true)   the car asked the app to stop: the word goes to RAM at once (a fast write),
 *   box.end('asked')         and to the data folder after the app has saved its own file;  the app's own error
 *                            and the exit code are noted by the two listeners this module puts on the process
 *                            (it never swallows an error: the kit's own handler still runs, logs it and exits)
 *                            A signal is noted only with the setting for it on (see above).
 *   box.lines()              -> [{ head, more: [...], warn, wide }] newest first, for the screen and the log (this
 *                            life, then the life before it in two lines: how it ended, and its last note; then the
 *                            older ones. wide: the screen may give the line a second row)
 *   box.alarm(now)           -> true in the first minute after a start that follows an end without a word or by
 *                            a signal alone (the head unit not restarted in between), the app's own error, or an
 *                            exit code other than 0 with no word before it. Never after "asked to stop by the car",
 *                            whatever signal came with it
 *   box.kept()               -> one line: where the record is kept right now
 *
 * FIGURES THAT ARE CHOICES: 5 lives, a note every 2 s, rates over 1 s or more, the data folder once a minute,
 * 64 KB, one minute of the line on the Run tab.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const FILE = 'box.json', VERSION = 1, KEEP = 5, MAX_BYTES = 65536;
const NOTE_MS = 2000, RATE_MS = 1000, DISK_MS = 60000, LAG_WINDOW_MS = 10000, ALARM_MS = 60000, TICK_MS = 50, RETRY_MS = 30000;
const RAM_FILE_MODE = 0o644, RAM_DIR_MODE = 0o755, SETUP_CHARS = 200, ERR_CHARS = 160;
const ENDS = ['', 'asked', 'error', 'exit', 'signal'];
const SIGNALS = ['SIGTERM', 'SIGHUP', 'SIGINT'];        // the signals that end a process and can be listened for (SIGKILL cannot)
const GROUPS = ['ask', 'gps', 'wheels', 'pos', 'study'];
// on.sig in a note: 0 = the stop signals are not noted (as shipped); else SIG_ON plus one bit for each signal this module
// has its listener on (in the order of SIGNALS: 1, 2, 4). SIG_ON alone: switched on, and somebody else listens for all three
const SIG_ON = 8, SIG_ALL = 7;
const GROUP_TEXT = { gps: 'GPS', wheels: 'wheels', pos: 'positions', study: 'study signals' };

const isNum = (x) => typeof x === 'number' && isFinite(x);
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
/** A finite number inside [lo, hi], else dflt. */
const num = (x, lo, hi, dflt) => (isNum(x) && x >= lo && x <= hi ? x : dflt);
const int = (x, lo, hi, dflt) => { const v = num(x, lo, hi, null); return v === null ? dflt : Math.round(v); };
/** A text cut to n characters and stripped to printable ASCII, else ''. */
const str = (x, n) => (typeof x === 'string' ? x.slice(0, 4 * n).replace(/[^\x20-\x7e]/g, '').slice(0, n) : '');
const two = (n) => (n < 10 ? '0' : '') + n;

/** A life's last note as it is kept: numbers inside their bounds, short texts. */
function cleanNote(x) {
    const o = isObj(x) ? x : {}, on = isObj(o.on) ? o.on : {}, out = {
        rss: int(o.rss, 0, 65536, 0), rssMax: int(o.rssMax, 0, 65536, 0), cpu: int(o.cpu, 0, 999, 0), cpuMax: int(o.cpuMax, 0, 999, 0),
        lag: int(o.lag, 0, 3600000, 0), lag10: int(o.lag10, 0, 3600000, 0), fps: int(o.fps, 0, 999, 0), nps: int(o.nps, 0, 99999, 0),
        asked: int(o.asked, 0, 1e9, 0), answered: int(o.answered, 0, 1e9, 0),
        path: str(o.path, 10), tab: str(o.tab, 12), state: str(o.state, 12), setup: str(o.setup, SETUP_CHARS), on: {},
    };
    // (per extra: 0 off, 1 on, 2 switched off in this life but still subscribed until the next start)
    GROUPS.forEach((g) => { out.on[g] = int(on[g], 0, 2, 0); });
    out.on.sig = int(on.sig, 0, SIG_ON + SIG_ALL, 0);
    return out;
}

/** One life as it is kept, or null if it is not one. */
function cleanLife(x) {
    if (!isObj(x) || int(x.n, 1, 999999, null) === null) return null;
    return {
        n: int(x.n, 1, 999999, 1), at: str(x.at, 20), wall: num(x.wall, 0, 4e12, 0), up: int(x.up, 0, 4e9, 0), s: int(x.s, 0, 4e7, 0),
        end: ENDS.indexOf(x.end) >= 0 ? x.end : '', code: int(x.code, -1, 255, null), err: str(x.err, ERR_CHARS), where: str(x.where, 40), sig: SIGNALS.indexOf(x.sig) >= 0 ? x.sig : '', old: x.old === 1 ? 1 : 0,
        uid: int(x.uid, 0, 4e9, 0), ram: x.ram === 1 ? 1 : 0, disk: x.disk === 1 ? 1 : 0, gone: x.gone === 1 ? 1 : 0, from: int(x.from, 0, 4e9, 0),
        note: cleanNote(x.note),
    };
}

/** A whole record as it is kept (5 lives at most, newest first), or null if it is not one. */
function clean(raw) {
    if (!isObj(raw) || raw.v !== VERSION || !Array.isArray(raw.lives)) return null;
    const lives = [];
    for (let i = 0; i < raw.lives.length && i < 4 * KEEP && lives.length < KEEP; i++) {
        const l = cleanLife(raw.lives[i]);
        if (l && !lives.some((k) => k.n === l.n)) lives.push(l);
    }
    lives.sort((a, b) => b.n - a.n);
    return lives.length ? { v: VERSION, lives } : null;
}

/**
 * Read a record: through a handle that follows no symbolic link and does not wait on a pipe, a plain file only,
 * 64 KB at most. -> { rec: the cleaned record or null, there: is a plain file there at all }
 */
function readSafe(file) {
    let fd = null;
    const out = { rec: null, there: false };
    try {
        const C = fs.constants || {};
        fd = fs.openSync(file, (C.O_RDONLY || 0) | (C.O_NOFOLLOW || 0) | (C.O_NONBLOCK || 0));
        const st = fs.fstatSync(fd);
        if (!st.isFile()) return out;
        out.there = true;
        if (st.size > MAX_BYTES) return out;                    // (a record is a few KB: this is not one)
        const buf = Buffer.alloc(MAX_BYTES);
        const n = fs.readSync(fd, buf, 0, MAX_BYTES, 0);
        out.rec = clean(JSON.parse(buf.toString('utf8', 0, n)));
    } catch (e) {
        out.rec = null;
    } finally {
        if (fd !== null) { try { fs.closeSync(fd); } catch (e) { /* closed */ } }
    }
    return out;
}

/** Is `dir` a real directory (no symbolic link) that belongs to user `uid`? -> '' (yes) or why not. */
function ownDir(dir, uid) {
    let st;
    try { st = fs.lstatSync(dir); } catch (e) { return 'cannot be looked at (' + ((e && e.code) || 'error') + ')'; }
    if (st.isSymbolicLink() || !st.isDirectory()) return 'is not a real folder';
    if (uid !== null && st.uid !== uid) return 'belongs to another user';
    return '';
}

/**
 * Write text to dir/name as a whole: a temporary name (no link followed), then a rename. -> '' or why it failed.
 * mode (the copy in RAM: 0644): set on the file outright, whatever the process's umask is. Left out (the data
 * folder's copy): the umask decides, as for the app's other files there.
 */
function writeWhole(dir, name, text, mode) {
    let fd = null;
    const tmp = path.join(dir, name + '.tmp');
    try {
        const C = fs.constants || {};
        fd = fs.openSync(tmp, (C.O_WRONLY || 1) | (C.O_CREAT || 0) | (C.O_TRUNC || 0) | (C.O_NOFOLLOW || 0), 0o644);
        fs.writeSync(fd, text);
        // (a mode that cannot be set does not cost the write: a record with a tighter mode is still a record)
        if (mode) { try { fs.fchmodSync(fd, mode); } catch (e) { /* as the umask left it */ } }
        fs.closeSync(fd); fd = null;
        fs.renameSync(tmp, path.join(dir, name));
        return '';
    } catch (e) {
        if (fd !== null) { try { fs.closeSync(fd); } catch (e2) { /* closed */ } }
        return String((e && e.code) || (e && e.message) || e).replace(/[^\x20-\x7e]/g, '').slice(0, 60);
    }
}

/** 95 -> "1 min 35 s"; 5 -> "5 s"; 3700 -> "1 h 1 min". */
function span(s) {
    s = Math.max(0, Math.round(s));
    if (s < 60) return s + ' s';
    if (s < 3600) return Math.floor(s / 60) + ' min' + (s % 60 ? ' ' + (s % 60) + ' s' : '');
    return Math.floor(s / 3600) + ' h' + (Math.floor(s / 60) % 60 ? ' ' + (Math.floor(s / 60) % 60) + ' min' : '');
}

/** Which extras a note says were on: ["GPS on", "wheels on", "notes stop signals"], or ["extras off"]. Those switched off in that life but still subscribed are said in one part. */
function extras(note) {
    const on = note.on, out = [], still = [];
    ['gps', 'wheels', 'pos', 'study'].forEach((g) => { if (on[g] === 1) out.push(GROUP_TEXT[g] + ' on'); else if (on[g] === 2) still.push(GROUP_TEXT[g]); });
    if (still.length) out.push('off but still subscribed: ' + still.join(' + '));
    if (on.ask === 1) out.push('asks the car itself (' + note.asked + ' reads asked, ' + note.answered + ' answered)');
    // (the setting "Note stop signals": all three noted, or only those nobody else on the process listens for)
    if (on.sig >= SIG_ON) {
        const mine = SIGNALS.filter((x, i) => on.sig & (1 << i)), theirs = SIGNALS.filter((x, i) => !(on.sig & (1 << i)));
        out.push(!theirs.length ? 'notes stop signals' : !mine.length ? 'notes no stop signal (each has a listener already)' :
            'notes stop signals (' + mine.join(' ') + ' only: ' + theirs.join(' ') + (theirs.length > 1 ? ' have' : ' has') + ' a listener already)');
    }
    return out.length ? out : ['extras off'];
}

/** Where an error came from: the file and line of the first place in its stack ("session.js:201", "kit/mgu.js:612"), or ''. */
function whereOf(e) {
    try {
        const lines = String((e && e.stack) || '').split('\n');
        for (let i = 1; i < lines.length && i < 12; i++) {
            const m = /([^\s()]+\.js):(\d+)(?::\d+)?\)?\s*$/.exec(lines[i]);
            if (!m) continue;
            const parts = m[1].split(/[\\/]/), name = parts[parts.length - 1], dir = parts.length > 1 ? parts[parts.length - 2] : '';
            return str((dir && dir !== 'javascript' && dir.length <= 12 ? dir + '/' : '') + name + ':' + m[2], 40);
        }
    } catch (e2) { /* an error without a stack */ }
    return '';
}

/** A life's last note in parts, the weightiest first: what the Signals tab shows as far as its line holds. */
function noteParts(note, now) {
    const parts = [
        'memory ' + note.rss + ' MB (most ' + note.rssMax + ')', 'processor ' + note.cpu + ' % (most ' + note.cpuMax + ')',
        now ? 'longest hold-up ' + note.lag + ' ms (last 10 s: ' + note.lag10 + ')' : 'hold-up ' + note.lag10 + ' ms (most ' + note.lag + ')',
    ];
    if (note.state) parts.push(note.state);
    extras(note).forEach((x) => parts.push(x));
    if (note.setup) parts.push(note.setup === 'done' ? 'set-up done' : 'set-up: ' + note.setup);
    if (note.tab) parts.push(note.tab === 'hidden' ? 'screen hidden' : note.tab + ' tab');
    parts.push(note.fps + ' frames/s' + (note.path ? ' ' + note.path : ''));
    parts.push(note.nps + ' values/s');
    return parts;
}

class Box {
    /** o: { id, dir (the data folder, or null), tmp ('/tmp'), now(), wall(), on (the extras switched on at this start), signals (true: the setting "Note stop signals" is on), proc (the process; the tests hand in their own) } */
    constructor(o) {
        this.now = o.now; this.wall = o.wall || (() => 0);
        this.proc = o.proc || process;
        this.uid = this.proc.getuid ? this.proc.getuid() : null;
        this.id = String(o.id || 'app').replace(/[^A-Za-z0-9_]/g, '').slice(0, 40);
        this.tmpRoot = o.tmp || '/tmp';
        this.ramDir = path.join(this.tmpRoot, 'pps-box-' + this.id + '-' + (this.uid === null ? 0 : this.uid));
        this.diskDir = o.dir || null;
        this.ram = { why: 'not tried yet', at: null, tried: -Infinity };      // why '': the last write worked
        this.disk = { why: this.diskDir ? 'not tried yet' : 'no data folder', at: null, tried: -Infinity };
        this.tell = null;
        this.t0 = this.now();
        this.lastBeat = null; this.lastNote = this.t0; this.lags = []; this.cpu0 = null; this.cpuT = this.t0;
        this.frames0 = 0; this.notes0 = 0; this.rateT = this.t0;
        this.ended = false;
        let history = [], top = 0, prevFrom = 'none';
        try {
            // (the app's own copy in RAM is read only out of a folder that is this user's own real folder, the same test
            // as for writing: what somebody else has put under the app's name is not taken for the app's record)
            const notOwn = ownDir(this.ramDir, this.uid), foreign = !!notOwn && !/ENOENT/.test(notOwn);
            const mine = notOwn ? { rec: null, there: false } : readSafe(path.join(this.ramDir, FILE));
            const disk = this.diskDir ? readSafe(path.join(this.diskDir, FILE)) : { rec: null, there: false };
            // (another user's record: only where the app has none of its own. Anybody can put a folder under that name
            // into /tmp; with a record of the app's own to go by, such a folder is not even opened)
            const other = mine.rec || disk.rec ? { rec: null, uid: 0 } : this._others();
            // the newest record counts: the highest life number, then the copy that knows how that life ended, then
            // the longest life (the copy in RAM first on a tie)
            const found = [[mine.rec, 'ram'], [disk.rec, 'disk'], [other.rec, 'other']].filter((c) => c[0]);
            found.forEach((c) => { top = Math.max(top, c[0].lives[0].n); });
            const said = (c) => (c[0].lives[0].end ? 1 : 0);
            found.sort((a, b) => b[0].lives[0].n - a[0].lives[0].n || said(b) - said(a) || b[0].lives[0].s - a[0].lives[0].s);
            if (found.length) { history = found[0][0].lives; prevFrom = found[0][1]; }
            // All that is left of the life before is the data folder's copy, and it holds no end: that copy is written
            // at the start and then once a minute at most, so its note is not that life's last (see `old` at the top).
            if (prevFrom === 'disk' && history[0].end === '') history[0].old = 1;
            // (the copy in RAM says the data folder had a copy, and the data folder has none now)
            this.gone = !!(this.diskDir && mine.rec && mine.rec.lives[0].disk === 1 && !disk.there);
            this.fromUid = prevFrom === 'other' ? other.uid : 0;
            // Has the head unit restarted since the life before this one? A copy in RAM that knows that life says no.
            // Yes, if that life's record was written to RAM and no copy is there now (RAM is emptied by a restart),
            // or if the head unit's uptime is smaller now than it was at that life's last note. Else: not known.
            const p = history[0] || null;
            // (a folder under the app's name that is not the app's own says nothing about a restart)
            this.boot = !p ? 'none' : (mine.rec && mine.rec.lives[0].n === p.n) || prevFrom === 'other' ? 'same' : (p.ram === 1 && !mine.there && !foreign) || os.uptime() < p.up + p.s ? 'new' : 'unknown';
        } catch (e) { history = []; this.gone = false; this.fromUid = 0; this.boot = 'none'; }
        this.prev = history[0] || null;
        const d = new Date(this.wall());
        this.life = cleanLife({
            n: Math.min(999999, top + 1), at: two(d.getDate()) + '.' + two(d.getMonth() + 1) + '. ' + two(d.getHours()) + ':' + two(d.getMinutes()),
            wall: this.wall(), up: Math.round(os.uptime()), s: 0, end: '', code: null, err: '', where: '', sig: '', old: 0, uid: this.uid === null ? 0 : this.uid,
            ram: 0, disk: 0, gone: this.gone ? 1 : 0, from: this.fromUid, note: { state: 'starting', setup: 'not begun', on: isObj(o.on) ? o.on : {} },
        });
        this.history = history.slice(0, KEEP - 1);
        this.rssMax = 0; this.cpuMax = 0; this.lagMax = 0;
        this._measure(this.t0);
        // A signal that ends the process (see the top). AS SHIPPED NO LISTENER IS PUT ON THE PROCESS FOR ONE: only with the
        // setting "Note stop signals" on, here at the start (before the first copy is written, so that it says so) or
        // when it is switched while the app runs (listen).
        // (sigFns: this module's listener per signal while it is on the process; sigHeard: a signal its listener has
        // taken, and was then taken off for: in the note that signal still counts as one this module noted)
        this.signals = []; this.sigFns = {}; this.sigHeard = {}; this.listening = false;
        if (o.signals === true) { this._listen(true); this.life.note.on.sig = this._sig(); }
        // (RAM first, to know whether it can be used; then the data folder, and RAM again so that it says the data folder has a copy)
        this._write(false, true);
        this._write(true, true);
        // The app's own error: noted BEFORE the kit's handler (which logs it and exits with code 1). This listener
        // swallows nothing: the kit's handler runs after it. Where no other handler is on the process (a PC), the
        // error would be lost in this one: then this one prints it and ends the process with code 1, as Node would.
        try {
            this.proc.prependListener('uncaughtException', (e) => {
                this.end('error', e);
                if (this.proc.listenerCount && this.proc.listenerCount('uncaughtException') <= 1 && this.proc.exit) {
                    try { console.error(e && e.stack || e); } catch (e2) { /* nothing to say it with */ }
                    this.proc.exit(1);
                }
            });
            this.proc.on('exit', (code) => this.end('exit', code));
        } catch (e) { /* a process that takes no listeners: the record then says "no word" for such an end */ }
    }

    /**
     * The setting "Note stop signals" (off as shipped; see the top). on: for each of SIGTERM, SIGHUP and SIGINT that
     * nobody else on the process listens for, a listener of this module's is put on the process, now (a signal somebody
     * listens for does not end the process by itself, and what is done with it then is theirs). off: this module's
     * listeners are taken off, now; with none left a signal ends the process at once again, as shipped. Either way a
     * note is taken and written to RAM, so that the record says which it is before a signal can come.
     */
    listen(on) {
        try {
            this._listen(!!on);
            if (!this.ended) this.note(this.now());
        } catch (e) { /* the record never stops the app */ }
    }

    _listen(on) {
        SIGNALS.forEach((sig) => {
            try {
                const mine = this.sigFns[sig];
                if (on && !mine) {
                    if (this.proc.listenerCount(sig) > 0) return;
                    const fn = () => this._signal(sig, fn);
                    this.proc.on(sig, fn);
                    this.sigFns[sig] = fn;
                } else if (!on && mine) {
                    this.proc.removeListener(sig, mine);
                    delete this.sigFns[sig];
                }
            } catch (e) { /* a process that takes no such listener: that signal ends it without a word, as shipped */ }
        });
        this.listening = on;
        this.signals = SIGNALS.filter((sig) => !!this.sigFns[sig]);
    }

    /** on.sig of a note: 0 while the setting is off, else SIG_ON plus a bit for each signal this module listens for (or did, until that signal came). */
    _sig() { return this.listening ? SIGNALS.reduce((m, sig, i) => m + (this.sigFns[sig] || this.sigHeard[sig] ? 1 << i : 0), SIG_ON) : 0; }

    /**
     * A signal that ends the process has come. The word is written now, in this turn (RAM first: the fast write).
     * Then this listener is taken off, and if no other listener for the signal is on the process, the same signal
     * is sent to the app's own process: with no listener it does what it would have done without this module, and
     * the process ends by that signal. (Another listener still there: it has been called in this same turn, and
     * what it does with the signal is its own. Nothing is sent a second time.)
     */
    _signal(sig, on) {
        this.end('signal', sig, true);
        this.end('signal', sig);
        try { this.proc.removeListener(sig, on); } catch (e) { /* not ours to take off */ }
        if (this.sigFns[sig] === on) { delete this.sigFns[sig]; this.sigHeard[sig] = true; this.signals = SIGNALS.filter((x) => !!this.sigFns[x]); }
        try { if (this.proc.listenerCount(sig) === 0) this.proc.kill(this.proc.pid, sig); } catch (e) { /* the record never stops the app */ }
    }

    /** The newest record of another user id under the same name in the RAM folder (read only): { rec, uid }. */
    _others() {
        const out = { rec: null, uid: 0 };
        try {
            const re = new RegExp('^pps-box-' + this.id + '-(\\d{1,10})$');
            const names = fs.readdirSync(this.tmpRoot).filter((n) => re.test(n)).slice(0, 16);
            names.forEach((n) => {
                const uid = Number(re.exec(n)[1]);
                if (this.uid !== null && uid === this.uid) return;
                if (ownDir(path.join(this.tmpRoot, n), null)) return;
                const r = readSafe(path.join(this.tmpRoot, n, FILE)).rec;
                if (r && (!out.rec || r.lives[0].n > out.rec.lives[0].n)) { out.rec = r; out.uid = uid; }
            });
        } catch (e) { /* no such folder, or it cannot be listed */ }
        return out;
    }

    /** Memory and processor share since the last look. */
    _measure(now) {
        const n = this.life.note;
        try {
            n.rss = Math.round(this.proc.memoryUsage().rss / 1048576);
            if (n.rss > this.rssMax) this.rssMax = n.rss;
            const c = this.proc.cpuUsage(), ms = now - this.cpuT;
            if (this.cpu0 && ms >= 500) {
                n.cpu = Math.max(0, Math.min(999, Math.round(((c.user - this.cpu0.user) + (c.system - this.cpu0.system)) / 1000 / ms * 100)));
                if (n.cpu > this.cpuMax) this.cpuMax = n.cpu;
            }
            if (!this.cpu0 || ms >= 500) { this.cpu0 = c; this.cpuT = now; }
        } catch (e) { /* a process that does not say */ }
        n.rssMax = this.rssMax; n.cpuMax = this.cpuMax;
    }

    _text() { return JSON.stringify({ v: VERSION, id: this.id, lives: [this.life].concat(this.history) }); }

    /**
     * The record as it stands: into the data folder first (disk: true), then into RAM, so that the copy in RAM
     * says whether the data folder holds one. A place that could not be written is tried again after 30 s
     * (force: now).
     */
    _write(disk, force) {
        const now = this.now(), L = this.life;
        try {
            if (disk && this.diskDir && (force || !this.disk.why || now - this.disk.tried >= RETRY_MS)) {
                this.disk.tried = now;
                const was = L.disk;
                L.disk = 1;
                this.disk.why = writeWhole(this.diskDir, FILE, this._text());
                if (this.disk.why) L.disk = was; else this.disk.at = now;
            }
            // RAM: only into a real folder of this user's own (made here if it is not there)
            if (force || !this.ram.why || now - this.ram.tried >= RETRY_MS) {
                this.ram.tried = now;
                const was = L.ram;
                let why = '';
                // (the folder is made and looked at before the first write and after one that failed: once it is this
                // user's own real folder with mode 0755, nobody else can put anything into it or in its place)
                if (this.ram.why) {
                    try { fs.mkdirSync(this.ramDir, RAM_DIR_MODE); } catch (e) { if (!e || e.code !== 'EEXIST') why = this.ramDir + ' cannot be made (' + ((e && e.code) || 'error') + ')'; }
                    if (!why) { why = ownDir(this.ramDir, this.uid); if (why) why = this.ramDir + ' ' + why; }
                    // (its mode is set outright, whatever the umask made of it, also where the folder was there already)
                    if (!why) { try { fs.chmodSync(this.ramDir, RAM_DIR_MODE); } catch (e) { /* as it is */ } }
                }
                if (!why) { L.ram = 1; why = writeWhole(this.ramDir, FILE, this._text(), RAM_FILE_MODE); }
                if (why) L.ram = was; else this.ram.at = now;
                this.ram.why = why;
            }
        } catch (e) { /* the record never stops the app */ }
    }

    /**
     * Every 50 ms, from the app's own tick. How late the tick comes is the hold-up of the app (a frame drawn in
     * software, a file write, the garbage collector). Every 2 s a note is taken and written to RAM; to the data
     * folder at most once a minute, and not while a run is being timed (state 'timing').
     */
    beat(now, state) {
        try {
            if (this.ended) return;
            if (this.lastBeat !== null) {
                const lag = Math.max(0, now - this.lastBeat - TICK_MS);
                if (lag > this.lagMax) this.lagMax = lag;
                const L = this.lags;
                if (!L.length || lag > L[L.length - 1].lag || now - L[L.length - 1].t >= 1000) L.push({ t: now, lag });
                while (L.length && now - L[0].t > LAG_WINDOW_MS) L.shift();
            }
            this.lastBeat = now;
            if (now - this.lastNote < NOTE_MS) return;
            this._note(now);
            this._write(state !== 'timing' && (this.disk.at === null || now - this.disk.at >= DISK_MS));
        } catch (e) { /* the record never stops the app */ }
    }

    /**
     * Take a note now and write it to RAM. The app calls this at its start, when it can tell what is switched on, and
     * whenever a setting of an extra or the state of a subscription changes: the record then says so before the
     * next call to the car is made, not up to 2 s later.
     */
    note(now) { try { this._note(now); this._write(false); } catch (e) { /* the record never stops the app */ } }

    /** Take the note: what the process knows of itself, and what the app tells (box.tell). */
    _note(now) {
        const n = this.life.note;
        this.lastNote = now;
        this.life.s = Math.round((now - this.t0) / 1000);
        this._measure(now);
        n.lag = Math.round(this.lagMax);
        n.lag10 = Math.round(this.lags.reduce((m, x) => Math.max(m, x.lag), 0));
        let a = null;
        try { a = this.tell ? this.tell() : null; } catch (e) { a = null; }
        if (isObj(a)) {
            // Frames and values a second are worked out over a second or more. A note taken sooner after the last
            // rates (at an end; when a setting or a subscription changes) keeps them: a count over a few ms says
            // nothing, and would read as "0 frames/s, 0 values/s" in the last note of a life that ended with a word.
            const ms = now - this.rateT;
            if (ms >= RATE_MS) {
                if (isNum(a.frames)) { n.fps = Math.max(0, Math.round((a.frames - this.frames0) * 1000 / ms)); this.frames0 = a.frames; }
                if (isNum(a.notes)) { n.nps = Math.max(0, Math.round((a.notes - this.notes0) * 1000 / ms)); this.notes0 = a.notes; }
                this.rateT = now;
            }
            n.asked = a.asked; n.answered = a.answered; n.path = a.path; n.tab = a.tab; n.state = a.state; n.setup = a.setup; n.on = a.on;
        }
        // (whether the stop signals are noted is this module's own to say, not the app's)
        n.on = Object.assign({}, isObj(n.on) ? n.on : {}, { sig: this._sig() });
        this.life.note = cleanNote(n);
    }

    /**
     * An end the app hears of. how: 'asked' (the car asked the app to stop), 'error' (what: the error), 'signal'
     * (what: its name; only with the setting "Note stop signals" on), 'exit' (what: the exit code). The first word
     * stands: an exit code after "asked" or after an error is added to it, and so is a signal that comes after
     * another word. One exception: the car's own word after a signal takes its place (the signal stays named).
     * A process that is asked to stop by the car has not stopped by itself, whatever signal came before or after
     * (a signal can only come first where somebody else listens for it too: with this module's listener alone
     * the signal ends the process there and then).
     * ramOnly: the word goes to the copy in RAM alone (a fast write). The app does that first when the car asks it
     * to stop, then saves its own file, then calls end('asked') again for the data folder: a process that is killed
     * while it still saves has said by then that it was asked.
     */
    end(how, what, ramOnly) {
        try {
            const L = this.life, now = this.now();
            if (how === 'exit') {
                L.code = int(what, -1, 255, null);
                if (L.end === '') L.end = 'exit';
            } else if (how === 'signal') {
                L.sig = SIGNALS.indexOf(what) >= 0 ? what : '';
                if (L.end === '' || L.end === 'exit') L.end = 'signal';
            } else if (L.end === '' || L.end === 'exit' || (how === 'asked' && L.end === 'signal')) {
                L.end = how === 'asked' ? 'asked' : 'error';
                // (the first line of the error, 160 characters at most; where it is longer, 157 of them and "..." so that the
                // line does not read as if the error's own text ended there)
                if (how !== 'asked') { const first = str(String((what && what.stack) || what).split('\n')[0], ERR_CHARS + 1).trim(); L.err = first.length > ERR_CHARS ? first.slice(0, ERR_CHARS - 3) + '...' : first; L.where = whereOf(what); }
            }
            this._note(now);
            this.ended = true;
            this._write(!ramOnly, true);
        } catch (e) { /* the record never stops the app, least of all at its end */ }
    }

    /**
     * In the first minute after a start that follows a stop by itself: an end without a word or by a signal alone
     * (the head unit not restarted since: switching the car off may end the app either way), the app's own error, or
     * an exit code other than 0 with no word before it. Not after "asked to stop by the car", with or without a
     * signal beside it: that is a clean stop.
     */
    alarm(now) {
        const p = this.prev;
        return !!p && now >= this.t0 && now - this.t0 < ALARM_MS && (p.end === 'error' || (p.end === 'exit' && p.code !== 0) || ((p.end === '' || p.end === 'signal') && this.boot !== 'new'));
    }

    /** How a life before this one ended, in words. */
    _ended(l, newest) {
        // (a signal beside the car's own word, before it or after it: still a clean stop)
        if (l.end === 'asked') return 'asked to stop by the car' + (l.sig ? ' (the signal ' + l.sig + ' came too)' : '');
        // (a signal: the process was told to end from outside, and could say so. Not the car's own way of asking: that is the shutdown event)
        if (l.end === 'signal') {
            return newest && this.boot === 'new' ? 'ended by the signal ' + (l.sig || 'not known') + ', and the head unit has restarted since (switching the car off may end the app this way)' :
                'ENDED BY THE SIGNAL ' + (l.sig || 'not known') + ' (sent to the app from outside)';
        }
        // (where it came from and the exit code first: a long error text is cut at the end of the line, and must not cut them)
        if (l.end === 'error') return 'THE APP\'S OWN ERROR' + (l.where ? ' at ' + l.where : '') + (l.code === null ? '' : ' (exit code ' + l.code + ')') + ': ' + (l.err || 'no text');
        if (l.end === 'exit') return 'ended with exit code ' + (l.code === null ? 'not known' : l.code) + ' and no word before it';
        // (only of the life right before this one can it be said whether the head unit restarted in between)
        if (newest && this.boot === 'new') return 'no word, and the head unit has restarted since (power off also ends the app without a word)';
        if (newest && this.boot === 'same') return 'NO WORD (killed or crashed)';
        return 'NO WORD (killed, crashed or power lost)';
    }

    /**
     * The lines for the Signals tab and the log, newest first: [{ head, more: [parts, the weightiest first], warn }].
     * A line is head + ' ' + as many of its parts as fit, joined with ', '.
     */
    lines() {
        const out = [];
        try {
            const L = this.life;
            this.life.s = Math.max(L.s, Math.round((this.now() - this.t0) / 1000));
            // (what the app can tell at once is told as it is now; memory, processor and the rates are the last note's)
            if (!this.ended && this.tell) {
                const a = this.tell();
                if (isObj(a)) L.note = cleanNote(Object.assign({}, L.note, { tab: a.tab, state: a.state, setup: a.setup, on: Object.assign({}, isObj(a.on) ? a.on : {}, { sig: this._sig() }), path: a.path, asked: a.asked, answered: a.answered }));
            }
            out.push({ head: '#' + L.n + ' now, started ' + L.at + ', running ' + span(L.s) + ',', more: noteParts(L.note, true), warn: false, wide: true });
            if (this.gone) out.push({ head: 'The saved data was emptied after #' + (this.prev ? this.prev.n : L.n - 1) + ' (the data folder\'s copy of this record was gone at this start).', more: [], warn: true });
            if (this.fromUid) out.push({ head: 'The lives before #' + L.n + ' are from the record of another user id (' + this.fromUid + '): the app was installed again.', more: [], warn: true });
            this.history.forEach((l, i) => {
                const bad = l.end !== 'asked', warn = bad && !(i === 0 && (l.end === '' || l.end === 'signal') && this.boot === 'new');
                // (old: only the data folder's copy of that life is left, written at its start and then once a minute at
                // most: how long it lived and its last note are not known, only what that copy held)
                // (an error text that was cut ends with "...": no full stop after that)
                const how = this._ended(l, i === 0), head = '#' + l.n + ' at ' + l.at + ' lived ' + (l.old ? 'at least ' : '') + span(l.s) + ', ' + how + (/\.\.\.$/.test(how) ? '' : '.'), parts = noteParts(l.note, false);
                const what = l.old ? 'Saved note' : 'Last note', age = l.old ? ' (up to a minute before its end)' : '';
                // (the life right before this one has a line for how it ended and a line of its own for its last note)
                // (wide: on the screen these may run on into a second row; the older lives have one row each)
                if (i === 0) { out.push({ head, more: [], warn, wide: true }); out.push({ head: '      ' + what + ' of #' + l.n + age + ':', more: parts, warn, wide: true }); } else out.push({ head, more: [what + age + ': ' + parts[0]].concat(parts.slice(1)), warn });
                if (l.gone) out.push({ head: 'The saved data was emptied after #' + (l.n - 1) + '.', more: [], warn: true });
            });
        } catch (e) { out.push({ head: 'The record of starts and stops cannot be shown.', more: [], warn: true }); }
        return out;
    }

    /** Where the record is kept right now, in one line. */
    kept() {
        try {
            const now = this.now(), ago = (x) => (x.at === null ? 'not written' : 'written ' + span((now - x.at) / 1000) + ' ago');
            return 'Kept in RAM (' + (this.ram.why ? 'NOT WRITTEN: ' + this.ram.why : ago(this.ram)) + ') and in the data folder (' + (this.disk.why ? 'NOT WRITTEN: ' + this.disk.why : ago(this.disk)) + ').';
        } catch (e) { return ''; }
    }
}

module.exports = { Box, clean, readSafe, span, FILE, VERSION, KEEP, MAX_BYTES, NOTE_MS, DISK_MS, ALARM_MS, SIGNALS };
