'use strict';
/**
 * store.js - Proven Drift: the saved file (pps_drift.json in the app's data folder). After Proven Drag's
 * store.js: whole-file writes, and a file that cannot be read never stops the app.
 *
 *   const store = new Store({ dir, log });     dir null: kept in memory only (demo drifts are never saved)
 *   store.data = { v, best: { score, angle, time, dist: one drift each, or null },
 *                  drifts: [the last 30 drifts, newest first; the newest 5 with their trace],
 *                  learned: what learn.js exports, or null }
 *   store.addDrift(record)      -> { score: true, angle: true, ... } for every best this drift set
 *   store.save()                the whole file, written to a temporary file and renamed over the old one
 *   store.resetBest(), store.resetLearned()
 *
 * THE FOUR BESTS: the highest score, the biggest peak angle, the longest drift by time and the longest by
 * distance. A drift with any flag sets none of them (drift.js, canBeBest).
 *
 * WHAT IS IN IT: scores, angles against the car's own direction of travel, speeds, times, distances,
 * ratios, counts, flags, dates, and the raw counts and ratios learn.js keeps. NO POSITION, NO COURSE AND
 * NO HEADING: none ever reaches this app's logic, and a drift is written member by member from the list
 * in cleanDrift(), so nothing that is not named there can get into the file whatever a record is handed
 * in with.
 *
 * A file that cannot be read as what this app wrote starts fresh, and the log says so; the unreadable
 * file is kept beside it once as pps_drift.json.bad. A file written by a NEWER version of this app (its
 * "v" is higher) is not read either: it is kept as pps_drift.json.newer, so that this version does not
 * write over what it does not understand. Single entries that make no sense are dropped, the rest is
 * kept. Of what was learned only the shape is checked here (rows of numbers): learn.js checks the figures
 * when it loads them.
 *
 * A write that fails (folder not writable, disk full) is said in the log once, and store.failed holds the
 * reason until a write works again: the Last and Best tabs then say NOT SAVED.
 */
const fs = require('fs');
const path = require('path');

const FILE = 'pps_drift.json';
const VERSION = 1;
const KEEP_DRIFTS = 30;
const KEEP_TRACES = 5;
const TRACE_MAX = 240;
const FLAG_WORDS = ['UNCALIBRATED', 'ANGLE UNSURE', 'NO STEERING CHECK', 'DATA GAP', 'LOW DATA RATE', 'SPIN', 'DEMO'];
const GRADES = ['D', 'C', 'B', 'A', 'S'];
const ENDS = ['ended', 'slow', 'spin', 'lost'];
const BESTS = ['score', 'angle', 'time', 'dist'];

const isNum = (x) => typeof x === 'number' && isFinite(x);
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const fresh = () => ({ v: VERSION, best: { score: null, angle: null, time: null, dist: null }, drifts: [], learned: null });
const within = (x, lo, hi) => isNum(x) && x >= lo && x <= hi;
const orNull = (x, lo, hi) => (within(x, lo, hi) ? x : null);

/** A drift's trace as it is kept: { ms, a: [degrees], v: [km/h] } with whole numbers only, or null. */
function cleanTrace(t) {
    if (!isObj(t) || !within(t.ms, 20, 10000) || !Array.isArray(t.a) || !Array.isArray(t.v)) return null;
    const n = Math.min(t.a.length, t.v.length, TRACE_MAX);
    if (n < 2) return null;
    const a = [], v = [];
    for (let i = 0; i < n; i++) {
        if (!within(t.a[i], -360, 360) || !within(t.v[i], 0, 500)) return null;
        a.push(Math.round(t.a[i])); v.push(Math.round(t.v[i]));
    }
    return { ms: t.ms, a, v };
}

/**
 * A drift as it is kept, or null if it is not one. Every member is named here and checked: a number in
 * its range, a word from its list. Nothing else of the record is taken.
 */
function cleanDrift(r, withTrace) {
    if (!isObj(r) || !within(r.score, 0, 1e7) || !within(r.peak, 0, 400) || !within(r.time, 0, 3600)) return null;
    const out = {
        date: isNum(r.date) ? r.date : null,
        score: Math.round(r.score), grade: GRADES.indexOf(r.grade) >= 0 ? r.grade : 'D',
        end: ENDS.indexOf(r.end) >= 0 ? r.end : 'ended',
        flags: Array.isArray(r.flags) ? FLAG_WORDS.filter((f) => r.flags.indexOf(f) >= 0) : [],
        peak: r.peak, avg: orNull(r.avg, 0, 400), dir: r.dir === 'L' || r.dir === 'R' ? r.dir : null, switches: within(r.switches, 0, 999) ? Math.round(r.switches) : 0,
        time: r.time, dist: orNull(r.dist, 0, 1e6),
        entry: orNull(r.entry, 0, 500), avgKmh: orNull(r.avgKmh, 0, 500), minKmh: orNull(r.minKmh, 0, 500),
        peakG: orNull(r.peakG, 0, 9), peakYaw: orNull(r.peakYaw, 0, 2000),
        opp: orNull(r.opp, 0, 90), pedal: orNull(r.pedal, 0, 100), wheelspin: orNull(r.wheelspin, 0, 2000),
        handbrake: r.handbrake === true ? true : r.handbrake === false ? false : null,
        pm: orNull(r.pm, 0, 99), pmMax: orNull(r.pmMax, 0, 99),
        mult: orNull(r.mult, 1, 99), smooth: orNull(r.smooth, 0, 9), reversals: within(r.reversals, 0, 9999) ? Math.round(r.reversals) : 0,
        rate: orNull(r.rate, 0, 1000), gap: within(r.gap, 0, 1e6) ? Math.round(r.gap) : 0,
        // (the receiver's speed over the car's while the drift's speed was held: a ratio and a count, gpscheck.js)
        gps: isObj(r.gps) && within(r.gps.ratio, 0.2, 5) && within(r.gps.n, 1, 9999) ? { ratio: Math.round(r.gps.ratio * 1000) / 1000, n: Math.round(r.gps.n) } : null,
        trace: withTrace === false ? null : cleanTrace(r.trace),
    };
    return out;
}

/** A best as it is kept: the drift without its trace. */
const cleanBest = (r) => cleanDrift(r, false);

/**
 * What was learned about the car, as it is kept: the shape learn.js exports (rows of numbers under the name
 * of their source, two raw values, readings and tallies), numbers only, or null. learn.js checks the
 * figures themselves when it loads them.
 */
function cleanLearned(x) {
    if (!isObj(x) || x.v !== 1) return null;
    const rows = (m, n) => {
        const out = {};
        if (isObj(m)) Object.keys(m).filter((k) => /^[a-z0-9/]{1,24}$/.test(k)).slice(0, 8).forEach((k) => {
            const r = Array.isArray(m[k]) ? m[k].filter((p) => Array.isArray(p) && p.length === n && p.every(isNum)).slice(-200) : [];
            if (r.length) out[k] = r;
        });
        return out;
    };
    const nums = (a) => (Array.isArray(a) ? a.filter(isNum).slice(-200) : []);
    const count = (n) => (isNum(n) && n >= 0 && n <= 1e6 ? Math.round(n) : 0);
    const p = isObj(x.pedal) ? x.pedal : {}, w = isObj(x.wheels) ? x.wheels : {}, a = isObj(x.ax) ? x.ax : {};
    return {
        v: 1, yaw: rows(x.yaw, 2), steer: rows(x.steer, 3),
        pedal: { min: isNum(p.min) ? p.min : null, max: isNum(p.max) ? p.max : null },
        wheels: { r: nums(w.r), lr: nums(w.lr), yes: count(w.yes), no: count(w.no) },
        ax: { yes: count(a.yes), no: count(a.no) },
    };
}

function clean(raw) {
    const d = fresh();
    if (!isObj(raw)) return d;
    if (isObj(raw.best)) BESTS.forEach((k) => { const b = cleanBest(raw.best[k]); if (b && !b.flags.length && b.score > 0) d.best[k] = b; });
    if (Array.isArray(raw.drifts)) d.drifts = raw.drifts.map((r) => cleanDrift(r, true)).filter(Boolean).slice(0, KEEP_DRIFTS);
    d.drifts.forEach((r, i) => { if (i >= KEEP_TRACES) r.trace = null; });
    d.learned = cleanLearned(raw.learned);
    return d;
}

/** Which of the four bests a drift beats: [key, what it is measured by]. */
const MEASURE = { score: 'score', angle: 'peak', time: 'time', dist: 'dist' };

class Store {
    constructor(o) {
        this.log = (o && o.log) || { info() {}, warn() {} };
        this.file = o && o.dir ? path.join(o.dir, FILE) : null;
        this.data = fresh();
        this.saves = 0;
        this.failed = null;             // why the last write failed (null: it worked, or none was tried)
        if (this.file) this.load();
    }

    load() {
        let text = null;
        try { text = fs.readFileSync(this.file, 'utf8'); } catch (e) {
            if (e && e.code !== 'ENOENT') this.log.warn('saved drifts: ' + FILE + ' cannot be read (' + (e.code || e.message) + '): starting fresh');
            return;
        }
        let raw = null;
        try { raw = JSON.parse(text); } catch (e) { raw = null; }
        if (isObj(raw) && isNum(raw.v) && raw.v > VERSION) {
            this.log.warn('saved drifts: ' + FILE + ' was written by a newer version of this app (file version ' + raw.v + ', this one writes ' + VERSION + '): starting fresh, the file is kept as ' + FILE + '.newer');
            try { fs.renameSync(this.file, this.file + '.newer'); } catch (e) { /* then it is written over */ }
            return;
        }
        if (!isObj(raw) || !isObj(raw.best) || !Array.isArray(raw.drifts)) {
            this.log.warn('saved drifts: ' + FILE + ' is not what this app wrote (' + text.length + ' characters): starting fresh, the old file is kept as ' + FILE + '.bad');
            try { fs.renameSync(this.file, this.file + '.bad'); } catch (e) { /* then it is written over */ }
            return;
        }
        this.data = clean(raw);
        this.log.info('saved drifts: ' + this.data.drifts.length + ' drifts, ' + BESTS.filter((k) => this.data.best[k]).length + ' bests' + (this.data.learned ? ', and what was learned about the car' : '') + ' read from ' + FILE);
    }

    /** Write the whole file: a temporary file renamed over the old one, so a power cut never leaves half a file. */
    save() {
        if (!this.file) return false;
        try {
            const tmp = this.file + '.tmp';
            fs.writeFileSync(tmp, JSON.stringify(this.data));
            fs.renameSync(tmp, this.file);
            this.saves++;
            if (this.failed) this.log.info('saved drifts: ' + FILE + ' is written again');
            this.failed = null; this.warned = false;
            return true;
        } catch (e) {
            this.failed = String(e && (e.code || e.message) || e);
            if (!this.warned) { this.warned = true; this.log.warn('saved drifts: cannot write ' + FILE + ': ' + (e && e.message || e) + ' (the drifts on screen are NOT SAVED)'); }
            return false;
        }
    }

    /** Keep a finished drift (newest first, 30 at most, the newest 5 with their trace). Returns the bests it set. */
    addDrift(rec) {
        const r = cleanDrift(rec, true), out = {};
        if (!r) return out;
        if (!r.flags.length && r.score > 0) {
            BESTS.forEach((k) => {
                const m = MEASURE[k], b = this.data.best[k];
                if (!isNum(r[m]) || (b && isNum(b[m]) && b[m] >= r[m])) return;
                this.data.best[k] = cleanBest(r);
                out[k] = true;
            });
        }
        this.data.drifts.unshift(r);
        if (this.data.drifts.length > KEEP_DRIFTS) this.data.drifts.length = KEEP_DRIFTS;
        this.data.drifts.forEach((d, i) => { if (i >= KEEP_TRACES) d.trace = null; });
        return out;
    }

    /** "Reset bests": the four bests and the list of drifts go, what was learned about the car stays. */
    resetBest() {
        this.data.best = fresh().best;
        this.data.drifts = [];
    }

    /** What learn.js exports, for the next write. */
    setLearned(x) { this.data.learned = cleanLearned(x); }

    /** "Reset what was learned": what was learned about the car goes, the drifts stay. */
    resetLearned() { this.data.learned = null; }
}

module.exports = { Store, cleanDrift, cleanLearned, FILE, VERSION, KEEP_DRIFTS, KEEP_TRACES, BESTS, FLAG_WORDS };
