'use strict';
/**
 * screens.js - Proven Drag: the four tabs, drawn on the kit's frame surface (1600 x 520, page content
 * from G.TOP to G.BOTTOM). Each takes what session.view() / signalsView() and car.status() give and
 * draws it; none of them reads the car or decides anything.
 *
 *   run(cv, t, v, ui)        speed now, the clock, the state (STOP TO ARM, READY, ARMED NO NEW SPEED, TIMING,
 *                            RUN FINISHED, NO SPEED FROM THE CAR), four results with +- and best, the strip
 *   slip(cv, t, v)           the last run as a timeslip, with everything known about it
 *   best(cv, t, v, ui)       best per split for the start convention in use, and the last runs
 *   signals(cv, t, s, ui)    the workshop's page: every source, wheels, GPS scale, slopes
 *
 * ui: { button(cv, t, x, y, w, h, label, what): a button on the page where the kit runs the screen }
 *
 * The +- beside a time is the sampling uncertainty only (run.js): how far off the time can be because the
 * car says its speed only every so often. It does not cover the speed scale, a slope or wheelspin, and
 * the Timeslip page says so.
 * Times are shown to a hundredth: the +- is never under 0.01 s, so a third decimal would promise too much.
 * A saved run is drawn whatever the file held: every figure is checked to be a number before it is
 * formatted (store.js drops what is damaged; this is the second line of defence, because a throw here
 * would be a throw on every frame).
 */
const { withAlpha } = require('./kit/canvas');
const G = require('./kit/gauges');
const { STARTS, MPH } = require('./run');

const GO = '#2fd27a';
const TABS = ['Run', 'Timeslip', 'Best', 'Signals'];
/** What the Timeslip says the app is: shown on every start, because the app has not been on a car. */
const BETA_TEXT = 'BETA: not yet checked against a car or a GPS timer';
/** The start conventions in a line each (the settings screen has the long form). */
const START_TEXT = {
    slip: (u) => 'Slip: ' + u + ' from first movement, distances after 1 ft',
    standstill: () => 'Standstill: everything from first movement',
    rollout: () => 'Rollout: everything after the first foot',
};
const isNum = G.isNum;
const secs = (s) => (isNum(s) ? s.toFixed(2) : '--.--');
/** +0.4 / -1.2 (a value that rounds to zero is +0.0). */
const signed = (x, d) => { if (!isNum(x)) return '--'; const r = Number(x.toFixed(d)); return (r < 0 ? '-' : '+') + Math.abs(r).toFixed(d); };
const fix = (x, d) => (isNum(x) ? x.toFixed(d) : '--');
const two = (n) => String(n).padStart(2, '0');
/** A saved run's date: day.month. hours:minutes, by the head unit's clock when the run ended. */
function when(ms, year) {
    if (!isNum(ms)) return 'no date';
    const d = new Date(ms);
    return two(d.getDate()) + '.' + two(d.getMonth() + 1) + '.' + (year ? d.getFullYear() : '') + ' ' + two(d.getHours()) + ':' + two(d.getMinutes());
}
const unitOf = (v) => (v.unit === 'mph' ? 'mph' : 'km/h');
const conv = (v, kmh) => (v.unit === 'mph' ? kmh / MPH : kmh);
const speedKey = (unit) => (unit === 'mph' ? '0-60' : '0-100');
const speedLabel = (unit) => (unit === 'mph' ? '0-60 mph' : '0-100 km/h');
const up = (s) => String(s).toUpperCase();

function spinShort(sp) {
    if (!sp || !isNum(sp.peak)) return '--';
    if (sp.method === 'estimate') return 'ABOUT ' + Math.round(sp.peak) + ' % (ESTIMATE)';
    return 'PEAK ' + Math.round(sp.peak) + ' %' + (sp.axle ? ', ' + up(sp.axle) : '');
}
function spinLong(sp) {
    if (!sp || !isNum(sp.peak)) return 'not known (no wheel or acceleration data)';
    if (sp.method === 'estimate') return 'about ' + Math.round(sp.peak) + ' %, ' + fix(sp.secs, 1) + ' s above 10 % (estimate from the acceleration)';
    return 'peak ' + sp.peak.toFixed(1) + ' %, ' + fix(sp.secs, 2) + ' s above 10 %' + (sp.axle ? ', ' + sp.axle + ' wheels led' : '');
}
/** How long ago, for a source that has stopped: "12 s ago", "5 min". */
const ago = (ms) => (ms < 100000 ? Math.round(ms / 1000) + ' s ago' : Math.round(ms / 60000) + ' min');

/* ---------- Run ---------- */

/** The state banner: { text, color, sub }. */
function banner(t, v) {
    // (armed: nothing arrives, and the timer is armed on the last speed the car notified. A car that only notifies
    // sends nothing while it stands: that is no fault, and its launch is timed. session.js, armedQuiet)
    if (!v.hasSpeed && v.armed) return { text: 'ARMED, NO NEW SPEED', color: GO, sub: 'Closed roads and track days only' };
    // (lost: a speed did arrive and has stopped: the getter is not answering and nothing is notified. The timer can
    // be armed all the same, on the last speed it heard, and a launch is then timed if the car notifies it: so the
    // closed-roads line shows whenever the timer is armed, whatever the banner says)
    if (!v.hasSpeed) {
        return { text: 'NO SPEED FROM THE CAR', color: isNum(v.lost) ? t.warn : t.dim,
            sub: v.state === 'ready' ? 'Timer armed. Closed roads and track days only' : isNum(v.lost) ? 'The car has sent no speed for ' + ago(v.lost).replace(' ago', '') : 'Waiting for the car\'s speed signal' };
    }
    if (v.state === 'run') return { text: 'TIMING', color: t.accent2 || t.accent, sub: 'Lift off to end the run' };
    if (v.state === 'ready') return { text: 'READY', color: GO, sub: 'Closed roads and track days only' };
    if (v.rec) return { text: 'RUN FINISHED', color: t.text, sub: 'Stop to arm the next run' };
    return { text: 'STOP TO ARM', color: t.dim, sub: 'Stand still for one second' };
}

function run(cv, t, v, ui) {
    const U = unitOf(v);
    // ---- speed now, the clock, the state ----
    const p = G.panel(cv, t, 24, G.TOP, 456, 372, 'Speed');
    ui.button(cv, t, p.x + p.w - 160, p.y + 10, 144, 34, 'Reset run', 'run');
    const sp = v.kmh === null ? null : conv(v, G.hold('pps-drag-speed', v.kmh, 100));
    cv.text(G.fmt(sp, 0), 372, 206, 136, sp === null ? t.dim : t.text, { align: 'right', font: 'num', literal: true });
    cv.text(U, 386, 206, 26, t.dim, { literal: true });
    cv.fillRect(44, 224, 416, 2, t.panelEdge || withAlpha(t.tick, 0.5));
    cv.text(secs(v.clock), 372, 304, 84, v.state === 'run' ? t.text : v.rec ? t.accent2 || t.text : t.dim, { align: 'right', font: 'num', literal: true });
    cv.text('s', 386, 304, 30, t.dim, { literal: true });
    const b = banner(t, v);
    cv.roundRect(44, 322, 416, 44, 8, withAlpha(b.color, 0.18));
    if (v.state === 'ready' && v.hasSpeed) cv.roundRect(44, 322, 416, 44, 8, withAlpha(GO, 0.35 + 0.25 * Math.sin(v.now / 160)));
    cv.text(b.text, 252, 353, 24, v.state === 'ready' && v.hasSpeed ? t.text : b.color, { align: 'center', font: 'bold', spacing: 3, literal: true });
    cv.text(b.sub, 252, 396, 19, t.dim, { align: 'center', literal: true });

    // ---- the four results ----
    const r = G.panel(cv, t, 496, G.TOP, 1080, 372, 'Results');
    cv.text(START_TEXT[v.start](speedKey(v.unit)), r.x + r.w - 20, r.y + 40, 18, t.dim, { align: 'right', literal: true });
    const shown = [speedKey(v.unit), '60ft', 'eighth', 'quarter'].map((k) => v.splits.filter((s) => s.key === k)[0]).filter(Boolean);
    shown.forEach((s, i) => {
        const x = 520 + i * 264, res = v.results[s.key], bst = v.best[s.key];
        if (i) cv.fillRect(x - 14, 112, 1, 284, withAlpha(t.tick, 0.35));
        cv.text(up(s.label), x, 134, 22, t.dim, { font: 'bold', spacing: 1, literal: true });
        const tw = cv.text(secs(res && res.s), x, 222, 80, res ? t.text : withAlpha(t.dim, 0.6), { font: 'num', literal: true });
        cv.text('s', x + tw + 6, 222, 26, t.dim, { literal: true });
        if (res) cv.text('± ' + res.pm.toFixed(2) + ' s', x, 258, 22, t.dim, { literal: true });
        if (s.trap) cv.text(res && isNum(res.trap) ? '@ ' + conv(v, res.trap).toFixed(1) + ' ' + U : '@ --', x, 302, 28, res && isNum(res.trap) ? t.accent2 || t.text : withAlpha(t.dim, 0.6), { font: 'bold', literal: true });
        let sub = bst ? 'best ' + secs(bst.s) : 'no best yet', col = t.dim;
        if (res && v.newBest[s.key]) { sub = 'NEW BEST'; col = GO; } else if (res && v.flags.length && (!bst || res.s < bst.s)) { sub = 'flagged: sets no best'; col = t.warn; } else if (res && bst) {
            const d = res.s - bst.s;
            sub = signed(d, 2) + '  vs best ' + secs(bst.s); col = d <= 0 ? GO : t.dim;
        }
        cv.text(sub, x, 348, 22, col, { font: sub === 'NEW BEST' ? 'bold' : 'label', literal: true });
    });

    // ---- the strip ----
    G.panel(cv, t, 24, 432, 1552, 80);
    const cell = (x, label, value, color, size) => {
        cv.text(label, x, 462, 16, t.dim, { font: 'bold', spacing: 1.5, literal: true });
        if (value) cv.text(value, x, 494, size || 22, color || t.text, { font: 'bold', literal: true });
    };
    cell(44, 'CLOCK STARTS', STARTS[v.start].label);
    cell(234, 'SPEED SCALE', v.scale.label, v.scale.label === 'UNCALIBRATED' ? t.warn : t.text);
    // (what arrived, session.js: never the rate the app asks for; under 2 a second with one decimal; "--" when nothing arrives)
    const rate = isNum(v.rate) ? (v.rate < 2 ? v.rate.toFixed(1) : String(Math.round(v.rate))) + '/s' + (v.series === 'polled' ? ', GETTER' : v.series === 'notified' ? ', NOTIFIED' : '') : '--';
    // (while a finished run is shown the figure is that run's own, and says so)
    cell(470, v.rateRun ? 'RUN DATA RATE' : 'DATA RATE', 'SPEED ' + rate, isNum(v.rate) ? t.text : t.dim);
    cell(770, 'WHEELSPIN', spinShort(v.spin), v.spin && v.spin.peak >= 10 ? t.warn : t.text);
    cell(1076, v.slopeLive ? 'SLOPE NOW' : 'START SLOPE', v.slope ? signed(v.slope.pct, 1) + ' %' : '--', v.downhill ? t.crit : t.text);
    if (v.flags.length > 1) {
        // (two lines: with more than two flags the second says how many more the Timeslip lists)
        cv.text('FLAGS', 1226, 462, 16, t.dim, { font: 'bold', spacing: 1.5, literal: true });
        const two = v.flags.length > 2 ? [v.flags[0], '+ ' + (v.flags.length - 1) + ' MORE: SEE TIMESLIP'] : v.flags;
        two.forEach((f, i) => cv.text(f, 1300, 462 + i * 26, 18, t.crit, { font: 'bold', literal: true }));
    } else cell(1226, 'FLAGS', v.flags[0] || (v.rec ? 'NONE' : '--'), v.flags.length ? t.crit : t.dim, v.flags.length ? 20 : 22);
}

/* ---------- Timeslip ---------- */

function slip(cv, t, v) {
    const rec = v.last, U = unitOf(v);
    const p = G.panel(cv, t, 24, G.TOP, 660, 468, 'Timeslip');
    const d = G.panel(cv, t, 708, G.TOP, 868, 468, 'Run details');
    cv.text(BETA_TEXT, d.x + d.w - 20, d.y + 40, 18, t.warn, { align: 'right', literal: true });
    if (!rec) {
        cv.text('No run yet.', 48, 150, 26, t.dim, { literal: true });
        cv.text('Stop, wait for READY, then launch.', 48, 186, 22, t.dim, { literal: true });
        return;
    }
    const R = rec.results, key = speedKey(rec.unit);
    cv.text(when(rec.date, true) + (rec.demo ? '  DEMO' : ''), p.x + p.w - 20, p.y + 40, 20, t.dim, { align: 'right', literal: true });
    const rows = [
        ['60 FT', R['60ft']], ['330 FT', R['330ft']], ['1/8 MILE', R.eighth], ['1/8 MILE TRAP', R.eighth, true],
        ['1000 FT', R['1000ft']], ['1/4 MILE', R.quarter], ['1/4 MILE TRAP', R.quarter, true], [up(speedLabel(rec.unit)), R[key]],
    ];
    rows.forEach((row, i) => {
        const y = 100 + i * 44, res = row[1], trap = row[2];
        const val = trap ? (res && isNum(res.trap) ? conv(v, res.trap).toFixed(1) : '--.-') : secs(res && res.s);
        const has = trap ? !!(res && isNum(res.trap)) : !!res;
        cv.text(row[0], 48, y + 32, 22, t.dim, { font: 'bold', spacing: 1, literal: true });
        cv.text(val, 420, y + 35, 36, has ? (trap ? t.accent2 || t.text : t.text) : withAlpha(t.dim, 0.6), { align: 'right', font: 'num', literal: true });
        cv.text(trap ? U : 's', 430, y + 35, 20, t.dim, { literal: true });
        if (has) cv.text(trap ? 'at the line ' + (isNum(res.at) ? conv(v, res.at).toFixed(1) : '--') : '± ' + res.pm.toFixed(2) + ' s', 508, y + 33, 20, t.dim, { literal: true });
        cv.fillRect(48, y + 44, p.w - 48, 1, withAlpha(t.tick, 0.3));
    });
    if (v.notSaved && !rec.demo) cv.text('NOT SAVED: the app cannot write its file. Runs are lost when it closes.', 48, 490, 17, t.crit, { literal: true });
    else cv.text('Trap speed: the average over the last 66 ft before the line.', 48, 490, 17, t.dim, { literal: true });

    // ---- everything else known about the run ----
    const s = rec.sum || {};
    let y = 124;
    const line = (label, value, color, sub, subColor) => {
        cv.text(label, d.x + 24, y, 17, t.dim, { font: 'bold', spacing: 1.5, literal: true });
        cv.text(value, d.x + 228, y, 20, color || t.text, { literal: true });
        if (sub) { cv.text(sub, d.x + 228, y + 22, 17, subColor || t.dim, { literal: true }); y += 20; }
        y += 36;
    };
    // (a speed signal that has never reported less than about 1 km/h cuts in late: every time from first movement reads short)
    line('CLOCK STARTS', START_TEXT[rec.start](key), t.text, isNum(s.lowSeen) && s.lowSeen >= 0.75 ? 'Speed signal starts at ' + s.lowSeen.toFixed(1) + ' km/h: times from first movement read short' : null, t.warn);
    line('PEAK G', (isNum(s.peakG) ? s.peakG.toFixed(2) + ' g' : '--') + (isNum(s.vmax) ? ', top speed ' + conv(v, s.vmax).toFixed(0) + ' ' + U : ''));
    // (a demo run has none of the three: they would be the real car's, or invented)
    const none = rec.demo ? 'not part of the demo' : null;
    line('WHEELSPIN', none || spinLong(rec.spin), rec.spin && rec.spin.peak >= 10 ? t.warn : t.text);
    line('START SLOPE', none || (rec.slope && isNum(rec.slope.pct) ? signed(rec.slope.pct, 1) + ' % (car\'s sensor, + is nose up)' : 'not known (no acceleration data while standing)'),
        rec.flags.indexOf('DOWNHILL START') >= 0 ? t.crit : t.text);
    const h = rec.height && rec.height.splits, hs = h ? [['eighth', '1/8 mile'], ['quarter', '1/4 mile']].filter((k) => h[k[0]] && isNum(h[k[0]].m) && isNum(h[k[0]].pct)) : [];
    line('HEIGHT CHANGE', none || (hs.length ? hs.map((k) => k[1] + ' ' + signed(h[k[0]].m, 1) + ' m (' + signed(h[k[0]].pct, 1) + ' %)').join(',  ') : 'not known (no GPS height through the run)'),
        t.text, hs.length ? 'GPS height, ±1 m at best' : null);
    line('SPEED SCALE', rec.scaleLabel + (rec.scaleLabel === 'UNCALIBRATED' ? ': speed as the car reports it' : ''), rec.scaleLabel === 'UNCALIBRATED' ? t.warn : t.text);
    // (what else the data showed, in a second line: only what is there, the weightiest first, as much as the line holds)
    const all = [];
    if (s.ended === 'silent') all.push('the speed stopped arriving');
    if (s.ended === 'jump') all.push('ended on a step no car does');
    if (isNum(s.frozenMs) && s.frozenMs >= 1000) all.push('one value repeated ' + (s.frozenMs / 1000).toFixed(1) + ' s');
    if (isNum(s.holeMs) && s.holeMs > 0) all.push('hole ' + Math.round(s.holeMs) + ' ms');
    if (isNum(s.stallMs) && s.stallMs > 0) all.push('app held up ' + Math.round(s.stallMs) + ' ms');
    if (s.launch && s.launch.late === true) all.push('launch seen late');
    if (isNum(s.afterCreep)) all.push('launched ' + (s.afterCreep / 1000).toFixed(2) + ' s after a roll');
    if (isNum(s.dropped) && s.dropped > 0) all.push(s.dropped + ' dropped');
    if (isNum(s.merged) && s.merged > 0) all.push(s.merged + ' merged');
    let more = '';
    all.forEach((x) => { if ((more ? more.length + 2 : 0) + x.length <= 60) more += (more ? ', ' : '') + x; });
    line('DATA', (rec.demo ? 'demo' : rec.series === 'polled' ? 'getter' : 'notified') + (isNum(s.medianGap) && s.medianGap > 0 ? ', ' + Math.round(1000 / s.medianGap) + '/s' : '') +
        (isNum(s.longestGap) ? ', longest gap ' + Math.round(s.longestGap) + ' ms' : '') + (isNum(s.launchGap) ? ', launch gap ' + Math.round(s.launchGap) + ' ms' : ''), t.text, more || null);
    // (two flags to a line; with more than two there is no room for the sentence under them, and the Run tab says it)
    const fl = rec.flags;
    line('FLAGS', fl.length ? fl.slice(0, 2).join(', ') : 'none', fl.length ? t.crit : t.text, fl.length > 2 ? fl.slice(2).join(', ') : fl.length ? 'A flagged run sets no best time.' : null, fl.length > 2 ? t.crit : null);
    cv.text('± is the sampling uncertainty only. It does not cover speed scale, slope or wheelspin.', d.x + 24, 490, 17, t.dim, { literal: true });
}

/* ---------- Best ---------- */

function best(cv, t, v, ui) {
    const U = unitOf(v);
    const p = G.panel(cv, t, 24, G.TOP, 700, 468, 'Best times, ' + STARTS[v.start].label.toLowerCase());
    ui.button(cv, t, p.x + p.w - 210, p.y + 10, 190, 34, 'Reset best', 'best');
    v.splits.forEach((s, i) => {
        const y = 98 + i * 66, b = v.best[s.key];
        cv.text(s.label, 48, y + 30, 26, t.text, { font: 'bold', literal: true });
        cv.text(b ? secs(b.s) : '--.--', 660, y + 42, 48, b ? t.accent2 || t.text : withAlpha(t.dim, 0.6), { align: 'right', font: 'num', literal: true });
        cv.text('s', 668, y + 42, 22, t.dim, { literal: true });
        if (b) cv.text('± ' + fix(b.pm, 2) + ' s  ·  ' + when(b.date, true) + (isNum(b.trap) ? '  ·  trap ' + conv(v, b.trap).toFixed(1) + ' ' + U : '') + (b.scale ? '  ·  ' + b.scale : ''), 48, y + 54, 17, t.dim, { literal: true });
        if (i < v.splits.length - 1) cv.fillRect(48, y + 64, p.w - 48, 1, withAlpha(t.tick, 0.3));
    });

    const q = G.panel(cv, t, 748, G.TOP, 828, 468, 'Last runs');
    const key = speedKey(v.unit);
    const cols = [
        { label: 'When', w: 168, size: 21 }, { label: 'Start', w: 132, size: 19, color: 'dim' },
        { label: key, w: 104, align: 'right', font: 'num', size: 24 }, { label: '60 ft', w: 104, align: 'right', font: 'num', size: 24 },
        { label: '1/8 mile', w: 112, align: 'right', font: 'num', size: 24 }, { label: '1/4 mile', w: 112, align: 'right', font: 'num', size: 24 },
        { label: '', w: 48, align: 'right', font: 'bold', size: 22, color: 'crit' },
    ];
    const cellOf = (r, k) => {
        const x = r.results[k], b = (v.allBest || {})[r.start];
        return { text: secs(x && x.s), color: !x ? 'dim' : b && b[k] && Math.abs(b[k].s - x.s) < 1e-9 ? GO : 'text' };
    };
    const rows = v.runs.slice(0, 9).map((r) => [when(r.date), STARTS[r.start].label.toLowerCase(), cellOf(r, key), cellOf(r, '60ft'), cellOf(r, 'eighth'), cellOf(r, 'quarter'), r.flags.length ? '!' : '']);
    G.table(cv, t, q.x + 24, 100, 780, cols, rows, { rowH: 38, empty: 'No runs yet.' });
    if (v.notSaved) cv.text('NOT SAVED: the app cannot write its file. Runs are lost when it closes.', q.x + 24, 496, 17, t.crit, { literal: true });
    else if (v.runs.some((r) => r.flags.length)) cv.text('! = a flagged run (it sets no best time): see its Timeslip.', q.x + 24, 496, 17, t.dim, { literal: true });
}

/* ---------- Signals ---------- */

const STATE = {
    missing: ['not on this unit', 'dim'], error: ['not answering', 'warn'], wait: ['subscribing', 'dim'],
};

function signals(cv, t, s, ui) {
    // ---- every source ----
    const p = G.panel(cv, t, 24, G.TOP, 770, 468, 'Sources');
    const rows = s.sources.map((src) => {
        const m = s.meters[src.key] || { n: 0 };
        // (a speed series that has stopped arriving says since when: "present" would be a sample count from long ago)
        const gone = s.stopped && isNum(s.stopped[src.key]) ? s.stopped[src.key] : null;
        // (the notifier of a car that stands, with the timer armed on it: silent, which is no fault)
        const st = STATE[src.state] || (gone !== null ? (s.armed && src.key === 'speedN' ? ['silent ' + ago(gone), 'text'] : ['stopped ' + ago(gone), 'warn']) : m.n ? ['present', GO] : ['no data yet', 'dim']);
        return [src.label, { text: st[0], color: st[1] }, isNum(m.rate) ? m.rate.toFixed(1) + '/s' : '--', isNum(m.longest) ? Math.round(m.longest) + ' ms' : '--', String(m.n || 0)];
    });
    G.table(cv, t, p.x + 20, 100, 730, [
        { label: 'Source', w: 250, size: 20 }, { label: 'State', w: 170, size: 20 }, { label: 'Rate', w: 96, align: 'right', size: 20 },
        { label: 'Longest gap', w: 124, align: 'right', size: 20 }, { label: 'Samples', w: 90, align: 'right', size: 20 },
    ], rows, { rowH: 31 });
    cv.text('Rate and longest gap: while the speed changes. "stopped", "silent": nothing has arrived since.', p.x + 20, 496, 17, t.dim, { literal: true });

    // ---- wheels ----
    const w = G.panel(cv, t, 810, G.TOP, 766, 232, 'Wheels');
    const names = { fl: 'Front left', fr: 'Front right', rl: 'Rear left', rr: 'Rear right' };
    const wrows = Object.keys(names).map((k) => {
        const x = s.wheels.wheels[k] || {};
        return [names[k], isNum(x.raw) ? String(Math.round(x.raw)) : '--', isNum(x.f) ? x.f.toPrecision(4) + (x.saved ? ' saved' : '') : '--',
            { text: isNum(x.raw) && isNum(x.f) && x.usable ? (x.raw * x.f).toFixed(1) : '--', color: x.usable ? 'text' : 'dim' },
            String(x.n || 0), { text: isNum(x.spread) ? (x.spread * 100).toFixed(1) + ' %' : '--', color: isNum(x.spread) && x.spread > 0.03 ? 'warn' : 'text' }];
    });
    G.table(cv, t, w.x + 20, 102, 726, [
        { label: 'Wheel', w: 150, size: 19 }, { label: 'Raw', w: 100, align: 'right', size: 19 }, { label: 'Factor', w: 166, align: 'right', size: 19 },
        { label: 'km/h', w: 100, align: 'right', size: 19 }, { label: 'Readings', w: 100, align: 'right', size: 19 }, { label: 'Spread', w: 110, align: 'right', size: 19 },
    ], wrows, { rowH: 27 });
    const tr = (list) => (list && list.length ? list.map((x) => x[1]).join(' / ') : '--');
    cv.text('Wheel travel, raw (for study only): front ' + tr(s.car.travelF) + ',  rear ' + tr(s.car.travelR), w.x + 20, 264, 17, t.dim, { literal: true });

    // ---- GPS speed scale, slopes ----
    const g = G.panel(cv, t, 810, 292, 766, 220, 'GPS speed scale, slope');
    if (s.workshop) ui.button(cv, t, g.x + g.w - 250, g.y + 10, 230, 34, 'Reset calibration', 'cal');
    const gp = s.gps, res = gp.result;
    // (is there a GPS source on this head unit at all)
    const noGps = ['nmea', 'gpsPos', 'navPos'].every((k) => s.sources.some((src) => src.key === k && (src.state === 'missing' || src.state === 'error')));
    const lines = [
        'In use: ' + s.scale.label + (s.setting === 'gps' && res ? ', from ' + (res.method === 'rmc' ? 'GPS speed, ' + res.count + ' ratios' : 'position legs, ' + res.count + ' legs') + (res.saved ? ', saved ' + when(res.date) : '')
            : s.setting === 'gps' ? (noGps ? ': this head unit gives the app no GPS data' : ': no GPS factor yet (learned at a steady speed above 60 km/h)') : ' (Speed scale setting: ' + s.setting + ')'),
        'GPS speed: ' + gp.rmc.ratios + ' / ' + gp.rmc.need + ' ratios' + (gp.rmc.ratios ? ' (' + (gp.rmc.level || 0) + ' at a level speed)' : '') +
            (isNum(gp.rmc.median) && isNum(gp.rmc.spread) ? ', median ' + gp.rmc.median.toFixed(4) + ', spread ' + (gp.rmc.spread * 100).toFixed(2) + ' %' : '') +
            (gp.sentences.rmcCoarse ? ', whole knots: not used' : ''),
        'Position legs: ' + gp.legs.ratios.length + ' (' + gp.legs.need + ' needed)' + (gp.legs.source ? ', from the ' + (gp.legs.source === 'gps' ? 'raw GPS position' : 'navigation\'s position') : ', no position yet') +
            (isNum(gp.legs.legMetres) ? ', leg now ' + gp.legs.legMetres + ' m' : ''),
        'Fix: ' + (gp.fix ? (isNum(gp.fix.sats) ? gp.fix.sats + ' satellites' : 'satellites not said') + (isNum(gp.fix.quality) ? ', quality ' + gp.fix.quality : '') + (isNum(gp.fix.hdop) ? ', HDOP ' + gp.fix.hdop : '') : 'no GGA sentence yet') +
            (gp.height && isNum(gp.height.m) ? ', height ' + gp.height.m.toFixed(0) + ' m (' + (gp.height.src === 'gga' ? 'receiver' : 'raw value') + ')' : ', no height') +
            ', sentences ' + gp.sentences.ok + ' good, ' + gp.sentences.bad + ' bad',
        'Road gradient (car, for study only): ' + (s.car.lane && isNum(s.car.lane.raw) ? 'raw ' + s.car.lane.raw + (isNum(s.car.lane.pct) ? ', count ' + s.car.lane.count + ', ' + signed(s.car.lane.pct, 1) + ' %' : ', no value') : '--'),
        'Standing slope (car\'s sensor): ' + (s.standing ? signed(s.standing.pct, 1) + ' %, + is nose up' : 'only while the car stands') + '  ·  downhill limit ' + (s.slopeLimit === 'off' ? 'off' : s.slopeLimit + ' %'),
    ];
    lines.forEach((l, i) => cv.text(l, g.x + 20, 366 + i * 26, 18, i === 0 && s.scale.label === 'UNCALIBRATED' ? t.warn : t.text, { literal: true }));
}

module.exports = { TABS, BETA_TEXT, run, slip, best, signals, banner, when, signed, secs };
