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
 *   signals(cv, t, s, ui)    the Signals tab's first page: "Starts and stops" (the record of how the app started and
 *                            stopped, box.js: always shown), and every source with its state and rate
 *   signals2(cv, t, s, ui)   its second page (touch the tab again, or "Next page"): the raw wheel values for study,
 *                            the GPS speed scale, slopes
 *
 * NOTHING ON THESE PAGES MOVES FOR ITS OWN SAKE (since 1.0.2): no banner pulses with the clock. A frame differs from
 * the one before only when a figure on it changed, so the kit does not send it on again (a standing car at READY
 * was a new picture for every frame before).
 * AN EXTRA THAT IS SWITCHED OFF in the settings says so where its figure would be, in a few words, and how to switch
 * it on where that helps. No row shows "--" without a reason, and never a made-up figure.
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
/** What the Timeslip says the app is, on every start. */
const BETA_TEXT = 'BETA: still being tested on cars';
/** On the Run tab for the first minute after a start that follows an end the app did not hear of, or its own error (box.js). */
const STOPPED_TEXT = 'The app stopped by itself last time. Please photograph the Signals tab.';
/** The Run tab's speed scale cell, second line, while the GPS speed scale is switched off and no factor is there. */
const GPS_OFF_TEXT = 'GPS SCALE IS OFF IN SETTINGS';
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
    // (a steady green: a banner that pulses with the clock makes every frame a new picture for the head unit)
    if (v.state === 'ready' && v.hasSpeed) cv.roundRect(44, 322, 416, 44, 8, withAlpha(GO, 0.35));
    cv.text(b.text, 252, 353, 24, v.state === 'ready' && v.hasSpeed ? t.text : b.color, { align: 'center', font: 'bold', spacing: 3, literal: true });
    cv.text(b.sub, 252, 396, 19, t.dim, { align: 'center', literal: true });

    // ---- the four results ----
    const r = G.panel(cv, t, 496, G.TOP, 1080, 372, 'Results');
    if (v.stopped) cv.text(STOPPED_TEXT, r.x + r.w - 20, r.y + 40, 18, t.warn, { align: 'right', literal: true });
    else cv.text(START_TEXT[v.start](speedKey(v.unit)), r.x + r.w - 20, r.y + 40, 18, t.dim, { align: 'right', literal: true });
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
    if (v.scale.gpsOff && v.scale.label === 'UNCALIBRATED') {
        // (uncalibrated because the GPS speed scale is switched off: said in two lines, with where to switch it on)
        cell(234, 'SPEED SCALE', null);
        cv.text('UNCALIBRATED', 234, 484, 18, t.warn, { font: 'bold', literal: true });
        cv.text(GPS_OFF_TEXT, 234, 505, 16, t.warn, { font: 'bold', literal: true });
    } else cell(234, 'SPEED SCALE', v.scale.label, v.scale.label === 'UNCALIBRATED' ? t.warn : t.text);
    // (what arrived, session.js: never the rate the app asks for; under 2 a second with one decimal; "--" when nothing
    // arrives; "WHEN IT CHANGES" while the speed is known and nothing new is notified: a standing or steady car)
    const rate = isNum(v.rate) ? (v.rate < 2 ? v.rate.toFixed(1) : String(Math.round(v.rate))) + '/s' + (v.series === 'polled' ? ', GETTER' : v.series === 'notified' ? ', NOTIFIED' : '') : v.held ? 'WHEN IT CHANGES' : '--';
    // (while a finished run is shown the figure is that run's own, and says so)
    cell(470, v.rateRun ? 'RUN DATA RATE' : 'DATA RATE', 'SPEED ' + rate, isNum(v.rate) || v.held ? t.text : t.dim);
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
    // (ext: which extras were switched on for this run; a run from before 1.0.2 has none on record)
    const ext = rec.ext || null, gpsOff = !!ext && !ext.gps && !ext.pos;
    line('HEIGHT CHANGE', none || (hs.length ? hs.map((k) => k[1] + ' ' + signed(h[k[0]].m, 1) + ' m (' + signed(h[k[0]].pct, 1) + ' %)').join(',  ') : gpsOff ? 'not known (GPS is switched off in Settings)' : 'not known (no GPS height through the run)'),
        t.text, hs.length ? 'GPS height, ±1 m at best' : null);
    line('SPEED SCALE', rec.scaleLabel + (rec.scaleLabel !== 'UNCALIBRATED' ? '' : ext && !ext.gps && rec.scaleSource === 'none' ? ': the GPS speed scale is switched off in Settings' : ': speed as the car reports it'),
        rec.scaleLabel === 'UNCALIBRATED' ? t.warn : t.text);
    // (what else the data showed, in a second line: only what is there, the weightiest first, as much as the line holds)
    const all = [];
    // (noReads: the app read nothing itself in that run, so all it knows is that nothing was notified)
    if (s.ended === 'silent') all.push(s.noReads === true ? 'nothing notified for 3 s (steady speed or signal lost)' : 'the speed stopped arriving');
    if (s.ended === 'jump') all.push('ended on a step no car does');
    if (isNum(s.frozenMs) && s.frozenMs >= 1000) all.push('one value repeated ' + (s.frozenMs / 1000).toFixed(1) + ' s');
    // (holeMs: the longest stretch the engine timed as a hole; the DATA GAP flag goes by it. lostMs, since 1.0.2: the longest
    // such stretch after which the samples do NOT look like a speed that stood still and then moved on. Where the longest
    // stretch does look like that, the line says so as a possibility, never as a fact: lost notifications can look the
    // same, and the flag stands either way. A run saved before that figure existed has holeMs alone: "hole", as in 1.0.1)
    // (a hole that does not look like that, and the app held up, come BEFORE the "may be" words: they are the weightier, and
    // the long sentence must never push them off the line)
    let maybe = null;
    if (isNum(s.holeMs) && s.holeMs > 0) {
        const lost = isNum(s.lostMs) ? s.lostMs : s.holeMs;
        if (lost < s.holeMs) maybe = 'nothing notified for ' + (s.holeMs >= 1000 ? (s.holeMs / 1000).toFixed(1) + ' s' : Math.round(s.holeMs) + ' ms') + ' (may be a steady speed)';
        if (lost > 0) all.push('hole ' + Math.round(Math.min(lost, s.holeMs)) + ' ms');
    }
    if (isNum(s.stallMs) && s.stallMs > 0) all.push('app held up ' + Math.round(s.stallMs) + ' ms');
    if (maybe) all.push(maybe);
    if (s.launch && s.launch.late === true) all.push('launch seen late');
    if (isNum(s.afterCreep)) all.push('launched ' + (s.afterCreep / 1000).toFixed(2) + ' s after a roll');
    if (isNum(s.dropped) && s.dropped > 0) all.push(s.dropped + ' dropped');
    if (isNum(s.merged) && s.merged > 0) all.push(s.merged + ' merged');
    let more = '';
    // (as much as the line's own width holds, measured: 60 characters, the rule before, left no room behind the "may be" words)
    const room = d.w - 228 - 24;
    all.forEach((x) => { const next = more ? more + ', ' + x : x; if (cv.textWidth(next, 17) <= room) more = next; });
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
    missing: ['not on this unit', 'dim'], error: ['not answering', 'warn'], wait: ['subscribing', 'dim'], off: ['switched off', 'dim'],
};
const OFF = 'switched off';
const LIFE_ROWS = 7;               // rows of text in the block "Starts and stops"
/** A text cut to the width it has, with "..." where it was cut. */
function clip(cv, text, size, maxW) {
    text = String(text);
    if (cv.textWidth(text, size) <= maxW) return text;
    while (text.length > 1 && cv.textWidth(text + '...', size) > maxW) text = text.slice(0, -1);
    return text + '...';
}
/**
 * One line of the record of starts and stops as rows of text (`rows` at most: 1 or 2). The head first, then its
 * parts, the weightiest first, each part kept whole. What the first row does not hold runs on in a second row,
 * set in. Parts that no row holds are left out (the log has the whole line); a head that no row holds is cut
 * with "...". Since 1.0.2's repair: with the extras switched on the line of this life and the last note of the
 * life before lost their tail (the set-up, the tab, the rates), which is when they are wanted.
 */
const ROW_IN = '        ';
function lifeRows(cv, l, size, maxW, rows) {
    const fits = (x) => cv.textWidth(x, size) <= maxW;
    const more = Array.isArray(l.more) ? l.more : [], out = [];
    let row = '', left = Math.max(1, rows || 1);
    // one more piece on the row in hand, or at the start of the next row. -> false: no row has room for it
    const put = (piece, sep, endOfRow) => {
        const next = row === '' ? piece : row + sep + piece;
        if (fits(next)) { row = next; return true; }
        if (left < 2 || row === '' || !fits(ROW_IN + piece)) return false;
        out.push(fits(row + endOfRow) ? row + endOfRow : row);
        left--;
        row = ROW_IN + piece;
        return true;
    };
    // (a head that is set in keeps its place: the life before this one has its last note under it)
    const head = String(l.head), lead = /^ */.exec(head)[0], words = head.slice(lead.length).split(' ');
    if (words.length) words[0] = lead + words[0];
    for (let i = 0; i < words.length; i++) {
        if (put(words[i], ' ', '')) continue;
        // (the head itself is longer than its rows: cut, and said so)
        out.push(clip(cv, (row === '' ? '' : row + ' ') + words.slice(i).join(' '), size, maxW));
        return out;
    }
    for (let i = 0; i < more.length; i++) if (!put(String(more[i]), i ? ', ' : ' ', i ? ',' : '')) break;
    out.push(row);
    return out;
}
/** A raw value in decimal and, where it is a whole number of at most 32 bits, in hexadecimal: "65407 (FF7F)". */
function rawText(x) {
    if (!isNum(x)) return 'no number';
    if (x !== Math.floor(x) || x < 0 || x > 4294967295) return String(x);
    const h = x.toString(16).toUpperCase();
    return x + ' (' + (h.length < 4 ? '0000'.slice(h.length) + h : h) + ')';
}

function signals(cv, t, s, ui) {
    // ---- starts and stops: always shown ----
    const p = G.panel(cv, t, 24, G.TOP, 1552, 240, 'Starts and stops');
    cv.text('Page 1 of 2. For wheels and GPS: touch the Signals tab again, or Next page.', p.x + p.w - 20, p.y + 40, 17, t.dim, { align: 'right', literal: true });
    const lives = Array.isArray(s.lives) ? s.lives : [];
    // (seven rows. The line of this life and the two lines of the life before may take two rows each, the older lives
    // one: with the extras on a line is longer than a row, and its tail says how far the set-up had got)
    let row = 0;
    lives.forEach((l) => {
        if (row >= LIFE_ROWS) return;
        lifeRows(cv, l, 18, p.w - 40, Math.min(l.wide ? 2 : 1, LIFE_ROWS - row)).forEach((text) => { cv.text(text, p.x + 20, 114 + row * 22, 18, l.warn ? t.warn : t.text, { literal: true }); row++; });
    });
    if (!lives.length) cv.text('No record yet.', p.x + 20, 114, 18, t.dim, { literal: true });
    if (s.kept) cv.text(clip(cv, s.kept, 17, p.w - 40), p.x + 20, 272, 17, t.dim, { literal: true });

    // ---- every source ----
    const q = G.panel(cv, t, 24, 292, 1552, 220, 'Sources');
    cv.text('Rate and longest gap: while the speed changes. "stopped", "silent": nothing has arrived since.', q.x + q.w - 20, q.y + 40, 17, t.dim, { align: 'right', literal: true });
    const rows = s.sources.map((src) => {
        const m = s.meters[src.key] || { n: 0 };
        // (a speed series that has stopped arriving says since when: "present" would be a sample count from long ago)
        const gone = s.stopped && isNum(s.stopped[src.key]) ? s.stopped[src.key] : null;
        // (the notifier of a car that stands or holds its speed, with the timer armed on it or the speed held: silent, which is no fault)
        // ("silent for 14 s": it is a state that lasts, not a thing that happened 14 s ago)
        const st = STATE[src.state] || (gone !== null ? ((s.armed || s.held) && src.key === 'speedN' ? ['silent for ' + ago(gone).replace(' ago', ''), 'text'] : ['stopped ' + ago(gone), 'warn']) : m.n ? ['present', GO] : ['no data yet', 'dim']);
        const off = src.state === 'off';
        return [src.label, { text: st[0], color: st[1] }, off ? '' : isNum(m.rate) ? m.rate.toFixed(1) + '/s' : '--', off ? '' : isNum(m.longest) ? Math.round(m.longest) + ' ms' : '--', off ? '' : String(m.n || 0)];
    });
    const cols = [
        { label: 'Source', w: 250, size: 19 }, { label: 'State', w: 170, size: 19 }, { label: 'Rate', w: 96, align: 'right', size: 19 },
        { label: 'Longest gap', w: 124, align: 'right', size: 19 }, { label: 'Samples', w: 90, align: 'right', size: 19 },
    ];
    // (two halves side by side: the speed, the acceleration and the wheels on the left, GPS and the road gradient on the right)
    G.table(cv, t, q.x + 20, 340, 730, cols, rows.slice(0, 6), { rowH: 23 });
    G.table(cv, t, q.x + 20 + 782, 340, 730, cols, rows.slice(6), { rowH: 23 });
}

function signals2(cv, t, s, ui) {
    const ext = s.ext || {};
    // ---- wheels: raw values for study ----
    const w = G.panel(cv, t, 24, G.TOP, 1552, 240, 'Wheels, raw values for study');
    cv.text('Page 2 of 2. Nothing of this table enters a time.', w.x + w.w - 20, w.y + 40, 17, t.dim, { align: 'right', literal: true });
    if (!ext.wheels) {
        cv.text('The wheel speeds are switched off. To study them: Settings, Workshop settings, Wheel speeds.', w.x + 20, 130, 20, t.dim, { literal: true });
        cv.text('Wheelspin on the Run tab and the Timeslip is then the estimate from the acceleration.', w.x + 20, 160, 18, t.dim, { literal: true });
    } else {
        const names = { fl: 'Front left', fr: 'Front right', rl: 'Rear left', rr: 'Rear right' };
        const study = (s.study && s.study.wheels) || {};
        const wrows = Object.keys(names).map((k) => {
            const x = s.wheels.wheels[k] || {}, y = study[k] || {};
            return [names[k], rawText(y.raw), isNum(y.min) ? rawText(y.min) : 'none yet', isNum(y.max) ? rawText(y.max) : 'none yet',
                isNum(y.at) && isNum(y.kmh) ? 'at ' + Math.round(y.kmh) + ' km/h: ' + rawText(y.at) : 'no steady speed yet',
                isNum(x.f) ? x.f.toPrecision(4) + (x.saved ? ' saved' : '') : 'none yet',
                // (why a wheel's speed is not worked out: too few steady moments yet, all of them at about one speed, or ratios that do not agree)
                { text: isNum(x.raw) && isNum(x.f) && x.usable ? (x.raw * x.f).toFixed(1) : x.why === 'few' ? 'too few' : x.why === 'span' ? 'one speed' : 'not used', color: x.usable ? 'text' : 'dim' },
                String(x.n || 0), { text: isNum(x.spread) ? (x.spread * 100).toFixed(1) + ' %' : 'none yet', color: isNum(x.spread) && x.spread > 0.03 ? 'warn' : 'text' }];
        });
        G.table(cv, t, w.x + 20, 102, 1512, [
            { label: 'Wheel', w: 140, size: 19 }, { label: 'Raw now', w: 190, align: 'right', size: 19 }, { label: 'Lowest', w: 190, align: 'right', size: 19 },
            { label: 'Highest', w: 190, align: 'right', size: 19 }, { label: 'At a steady speed', w: 310, align: 'right', size: 19 }, { label: 'Factor', w: 170, align: 'right', size: 19 },
            { label: 'km/h', w: 110, align: 'right', size: 19 }, { label: 'Readings', w: 100, align: 'right', size: 19 }, { label: 'Spread', w: 110, align: 'right', size: 19 },
        ], wrows, { rowH: 27 });
    }
    const tr = (list) => (list && list.length ? list.map((x) => x[1]).join(' / ') : 'nothing yet');
    cv.text(ext.study ? 'Wheel travel, raw (for study only): front ' + tr(s.car.travelF) + ',  rear ' + tr(s.car.travelR) : 'Wheel travel (for study only): ' + OFF + '. Settings, Workshop settings, Wheel travel, gradient.',
        w.x + 20, 264, 17, t.dim, { literal: true });

    // ---- GPS speed scale, slopes ----
    const g = G.panel(cv, t, 24, 292, 1552, 220, 'GPS speed scale, slope');
    if (s.workshop) ui.button(cv, t, g.x + g.w - 250, g.y + 10, 230, 34, 'Reset calibration', 'cal');
    const gp = s.gps, res = gp.result;
    // (is a GPS source switched on at all, and does this head unit have one)
    const gpsSrc = ['nmea', 'gpsPos', 'navPos'].map((k) => s.sources.filter((src) => src.key === k)[0]).filter(Boolean);
    const allOff = gpsSrc.every((src) => src.state === 'off');
    const noGps = !allOff && gpsSrc.every((src) => src.state === 'missing' || src.state === 'error' || src.state === 'off');
    const lines = [
        'In use: ' + s.scale.label + (s.setting === 'gps' && res ? ', from ' + (res.method === 'rmc' ? 'GPS speed, ' + res.count + ' ratios' : 'position legs, ' + res.count + ' legs') + (res.saved ? ', saved ' + when(res.date) : '')
            : s.setting === 'gps' ? (allOff ? ': the GPS speed scale is switched off (Settings, GPS speed scale)' : noGps ? ': this head unit gives the app no GPS data' : ': no GPS factor yet (learned at a steady speed above 60 km/h)') : ' (Speed scale setting: ' + s.setting + ')'),
        'GPS speed: ' + (!ext.gps ? OFF + ' (Settings, GPS speed scale)' : gp.rmc.ratios + ' / ' + gp.rmc.need + ' ratios' + (gp.rmc.ratios ? ' (' + (gp.rmc.level || 0) + ' at a level speed)' : '') +
            (isNum(gp.rmc.median) && isNum(gp.rmc.spread) ? ', median ' + gp.rmc.median.toFixed(4) + ', spread ' + (gp.rmc.spread * 100).toFixed(2) + ' %' : '') +
            (gp.sentences.rmcCoarse ? ', whole knots: not used' : '')),
        'Position legs: ' + (!ext.pos ? OFF + ' (Settings, Workshop settings, Positions)' : gp.legs.ratios.length + ' (' + gp.legs.need + ' needed)' + (gp.legs.source ? ', from the ' + (gp.legs.source === 'gps' ? 'raw GPS position' : 'navigation\'s position') : ', no position yet') +
            (isNum(gp.legs.legMetres) ? ', leg now ' + gp.legs.legMetres + ' m' : '')),
        'Fix: ' + (!ext.gps && !ext.pos ? 'GPS is ' + OFF : (gp.fix ? (isNum(gp.fix.sats) ? gp.fix.sats + ' satellites' : 'satellites not said') + (isNum(gp.fix.quality) ? ', quality ' + gp.fix.quality : '') + (isNum(gp.fix.hdop) ? ', HDOP ' + gp.fix.hdop : '') : 'no GGA sentence yet') +
            (gp.height && isNum(gp.height.m) ? ', height ' + gp.height.m.toFixed(0) + ' m (' + (gp.height.src === 'gga' ? 'receiver' : 'raw value') + ')' : ', no height') +
            ', sentences ' + gp.sentences.ok + ' good, ' + gp.sentences.bad + ' bad'),
        'Road gradient (car, for study only): ' + (!ext.study ? OFF : s.car.lane && isNum(s.car.lane.raw) ? 'raw ' + s.car.lane.raw + (isNum(s.car.lane.pct) ? ', count ' + s.car.lane.count + ', ' + signed(s.car.lane.pct, 1) + ' %' : ', no value') : 'nothing yet'),
        'Standing slope (car\'s sensor): ' + (s.standing ? signed(s.standing.pct, 1) + ' %, + is nose up' : 'only while the car stands') + '  ·  downhill limit ' + (s.slopeLimit === 'off' ? 'off' : s.slopeLimit + ' %'),
    ];
    lines.forEach((l, i) => cv.text(l, g.x + 20, 366 + i * 26, 18, i === 0 && s.scale.label === 'UNCALIBRATED' ? t.warn : t.text, { literal: true }));
}

module.exports = { TABS, BETA_TEXT, STOPPED_TEXT, GPS_OFF_TEXT, run, slip, best, signals, signals2, banner, when, signed, secs, lifeRows, rawText };
