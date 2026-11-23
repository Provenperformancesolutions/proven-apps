'use strict';
/**
 * store.js - Proven Drag: the saved file (pps_drag.json in the app's data folder).
 *
 *   const store = new Store({ dir, log });     dir null: kept in memory only (demo runs are never saved)
 *   store.data = { v, best: { slip: { '0-100': { s, pm, trap, date, scale } }, standstill: {}, rollout: {} },
 *                  runs: [the last 30 run records, newest first], wheels: wheel factors, gps: GPS factor }
 *   store.addRun(record)        -> { key: true } for every split this run set a new best in
 *   store.save()                the whole file, written to a temporary file and renamed over the old one
 *   store.resetBest(), store.resetCalibration()
 *
 * WHAT IS IN IT: times, speeds, ratios, counts, dates. No position: the modules that see latitude and
 * longitude (gpsscale.js) never hand one out, and nothing here would take one.
 *
 * A file that cannot be read as what this app wrote starts fresh, and the log says so; the unreadable
 * file is kept beside it once as pps_drag.json.bad, for whoever wants to know what happened. A file
 * written by a NEWER version of this app (its "v" is higher than this version's) is not read either: it is
 * kept as pps_drag.json.newer, so that this version does not write over what it does not understand.
 * Single entries that make no sense are dropped, the rest is kept: a time that is not a number, and of a
 * run's wheelspin, slope, height and summary every part the screens draw (a wheelspin without its
 * seconds, a height change that is text) - a run whose extras are damaged keeps its times and loses them.
 *
 * A write that fails (folder not writable, disk full) is said in the log once, and store.failed holds
 * the reason until a write works again: the Timeslip and Best tabs then say NOT SAVED.
 *
 * Bests are kept per start convention (a time after the first foot and one from first movement are not
 * the same thing). A flagged run (DOWNHILL START, SPEED READ HIGH AT LAUNCH, DATA GAP, SPEED JUMP,
 * SERIES DISAGREE) sets no best.
 */
const fs = require('fs');
const path = require('path');

const FILE = 'pps_drag.json';
const VERSION = 1;
const KEEP_RUNS = 30;
const KEEP_FLAGS = 6;
const CONVENTIONS = ['slip', 'standstill', 'rollout'];

const isNum = (x) => typeof x === 'number' && isFinite(x);
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const fresh = () => ({ v: VERSION, best: { slip: {}, standstill: {}, rollout: {} }, runs: [], wheels: {}, gps: {} });

/** One split's result as it is kept: { s, pm, trap, at } with numbers only, or null. */
function cleanResult(r) {
    if (!isObj(r) || !isNum(r.s) || !(r.s > 0) || r.s > 120) return null;
    const out = { s: r.s, pm: isNum(r.pm) && r.pm > 0 ? r.pm : 0.01 };
    if (isNum(r.trap) && r.trap > 0) out.trap = r.trap;
    if (isNum(r.at) && r.at > 0) out.at = r.at;
    return out;
}

const str = (x, n) => (typeof x === 'string' ? x.slice(0, n) : null);
const numOr = (x, dflt) => (isNum(x) ? x : dflt);

/** A run's wheelspin as the screens draw it: { peak, secs, axle, method, readHigh, highSecs }, or null. */
function cleanSpin(x) {
    if (!isObj(x) || !isNum(x.peak) || !isNum(x.secs)) return null;
    const out = { peak: x.peak, secs: x.secs, axle: x.axle === 'front' || x.axle === 'rear' ? x.axle : null, method: x.method === 'estimate' ? 'estimate' : 'wheels', readHigh: x.readHigh === true };
    if (isNum(x.highSecs)) out.highSecs = x.highSecs;
    return out;
}

/** A run's height changes: { src, splits: { key: { m, pct } } } with numbers only, or null. No height above sea level is kept. */
function cleanHeight(x) {
    if (!isObj(x) || !isObj(x.splits)) return null;
    const splits = {};
    Object.keys(x.splits).forEach((k) => { const h = x.splits[k]; if (isObj(h) && isNum(h.m) && isNum(h.pct)) splits[k] = { m: h.m, pct: h.pct }; });
    return Object.keys(splits).length ? { src: x.src === 'can' ? 'can' : 'gga', splits } : null;
}

/** The run summary's figures the screens draw, each a number or left out; the rest of it as it came (it is only logged). */
function cleanSum(x) {
    if (!isObj(x)) return {};
    const out = Object.assign({}, x);
    ['vmax', 'peakG', 'samples', 'medianGap', 'longestGap', 'launchGap', 'firstKmh', 'dropped', 'merged', 'holeMs', 'frozenMs', 'stallMs', 'roundTrip', 'length', 'dist', 'lowSeen', 'afterCreep'].forEach((k) => { if (k in out && !isNum(out[k])) delete out[k]; });
    if ('renderer' in out && typeof out.renderer !== 'string') delete out.renderer;
    return out;
}

/** A run record as it is kept, or null if it is not one. */
function cleanRun(r) {
    if (!isObj(r) || !isObj(r.results) || CONVENTIONS.indexOf(r.start) < 0) return null;
    const results = {};
    Object.keys(r.results).forEach((k) => { const c = cleanResult(r.results[k]); if (c) results[k] = c; });
    if (!Object.keys(results).length) return null;
    return Object.assign({}, r, {
        results, date: isNum(r.date) ? r.date : null, unit: r.unit === 'mph' ? 'mph' : 'kmh', demo: r.demo === true,
        series: r.series === 'polled' ? 'polled' : 'notified',
        flags: Array.isArray(r.flags) ? r.flags.filter((f) => typeof f === 'string').map((f) => f.slice(0, 32)).slice(0, KEEP_FLAGS) : [],
        scaleLabel: str(r.scaleLabel, 24) || 'UNCALIBRATED',
        spin: cleanSpin(r.spin),
        slope: isObj(r.slope) && isNum(r.slope.pct) ? { pct: r.slope.pct, ms: numOr(r.slope.ms, 0), n: numOr(r.slope.n, 0) } : null,
        height: cleanHeight(r.height),
        sum: cleanSum(r.sum),
    });
}

function clean(raw) {
    const d = fresh();
    if (!isObj(raw)) return d;
    CONVENTIONS.forEach((c) => {
        const b = isObj(raw.best) && isObj(raw.best[c]) ? raw.best[c] : {};
        Object.keys(b).forEach((k) => {
            const r = cleanResult(b[k]);
            if (!r) return;
            r.date = isNum(b[k].date) ? b[k].date : null;
            r.scale = typeof b[k].scale === 'string' ? b[k].scale.slice(0, 24) : '';
            d.best[c][k] = r;
        });
    });
    if (Array.isArray(raw.runs)) d.runs = raw.runs.map(cleanRun).filter(Boolean).slice(0, KEEP_RUNS);
    // (the two calibrations are checked again by the modules that load them: wheels.js, gpsscale.js)
    if (isObj(raw.wheels)) d.wheels = raw.wheels;
    if (isObj(raw.gps)) d.gps = raw.gps;
    return d;
}

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
            if (e && e.code !== 'ENOENT') this.log.warn('saved runs: ' + FILE + ' cannot be read (' + (e.code || e.message) + '): starting fresh');
            return;
        }
        let raw = null;
        try { raw = JSON.parse(text); } catch (e) { raw = null; }
        if (isObj(raw) && isNum(raw.v) && raw.v > VERSION) {
            this.log.warn('saved runs: ' + FILE + ' was written by a newer version of this app (file version ' + raw.v + ', this one writes ' + VERSION + '): starting fresh, the file is kept as ' + FILE + '.newer');
            try { fs.renameSync(this.file, this.file + '.newer'); } catch (e) { /* then it is written over */ }
            return;
        }
        if (!isObj(raw) || !isObj(raw.best) || !Array.isArray(raw.runs)) {
            this.log.warn('saved runs: ' + FILE + ' is not what this app wrote (' + text.length + ' characters): starting fresh, the old file is kept as ' + FILE + '.bad');
            try { fs.renameSync(this.file, this.file + '.bad'); } catch (e) { /* then it is written over */ }
            return;
        }
        this.data = clean(raw);
        const bests = CONVENTIONS.reduce((n, c) => n + Object.keys(this.data.best[c]).length, 0);
        this.log.info('saved runs: ' + this.data.runs.length + ' runs, ' + bests + ' best times read from ' + FILE);
    }

    /** Write the whole file: a temporary file renamed over the old one, so a power cut never leaves half a file. */
    save() {
        if (!this.file) return false;
        try {
            const tmp = this.file + '.tmp';
            fs.writeFileSync(tmp, JSON.stringify(this.data));
            fs.renameSync(tmp, this.file);
            this.saves++;
            if (this.failed) this.log.info('saved runs: ' + FILE + ' is written again');
            this.failed = null; this.warned = false;
            return true;
        } catch (e) {
            this.failed = String(e && (e.code || e.message) || e);
            if (!this.warned) { this.warned = true; this.log.warn('saved runs: cannot write ' + FILE + ': ' + (e && e.message || e) + ' (the runs on screen are NOT SAVED)'); }
            return false;
        }
    }

    /** Keep a finished run (newest first, 30 at most). Returns the splits it set a new best in. */
    addRun(rec) {
        const r = cleanRun(rec), out = {};
        if (!r) return out;
        if (!r.flags.length) {
            const best = this.data.best[r.start];
            Object.keys(r.results).forEach((k) => {
                const x = r.results[k], b = best[k];
                if (b && b.s <= x.s) return;
                best[k] = Object.assign({}, x, { date: r.date, scale: r.scaleLabel });
                out[k] = true;
            });
        }
        this.data.runs.unshift(r);
        if (this.data.runs.length > KEEP_RUNS) this.data.runs.length = KEEP_RUNS;
        return out;
    }

    /** "Reset best": the best times and the list of runs go, the calibration stays. */
    resetBest() {
        this.data.best = fresh().best;
        this.data.runs = [];
    }

    /** "Reset calibration": the wheel factors and the GPS factor go, the times stay. */
    resetCalibration() {
        this.data.wheels = {};
        this.data.gps = {};
    }
}

module.exports = { Store, FILE, VERSION, KEEP_RUNS, CONVENTIONS };
