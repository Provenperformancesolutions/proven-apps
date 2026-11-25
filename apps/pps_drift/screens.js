'use strict';
/**
 * screens.js - Proven Drift: the five tabs and the first screen, drawn on the kit's frame surface (1600 x 520,
 * page content from G.TOP to G.BOTTOM). Each takes what session.view() / signalsView() and car.status()
 * give and draws it; none of them reads the car or decides anything.
 *
 *   splash(cv, t)            the first screen: the logo, CLOSED COURSE ONLY, what the app is for
 *   drift(cv, t, v)          the live page: the drawn car turned by the drift angle against the way it travels,
 *                            the angle with LEFT / RIGHT and its +-, the speed, the running drift's score,
 *                            multiplier and time, three small bars, the banner, the session in a strip; and
 *                            a standing line under the car while the steering backs no drift (why, and that
 *                            no best is set)
 *   last(cv, t, v)           the last drift: everything known about it, its trace, its flags in words
 *   session(cv, t, v)        this session's totals and its drifts
 *   best(cv, t, v)           the all-time bests and the saved list
 *   signals(cv, t, s)        the workshop's page: every source, what was learned, the study-only raw values
 *
 * THE DRAWN CAR is a plain outline of Proven's own, made of a few straight-edged shapes in this file: no
 * maker's shape, no badge, no grille. It is turned by the estimated drift angle; the arrow is the way the
 * car travels and always points up. The front wheels are turned by the opposite lock where it is known.
 *
 * Nothing on the Drift tab needs a touch. Every figure of a saved drift is checked to be a number before
 * it is formatted (store.js drops what is damaged; this is the second line of defence, because a throw
 * here would be a throw on every frame).
 * The angle is an estimate everywhere, and the pages say so: "Angle, estimate", "+-", and the Last tab's
 * line that nothing has been on a car.
 */
const { withAlpha } = require('./kit/canvas');
const G = require('./kit/gauges');
const Logo = require('./logo');

const GO = '#2fd27a';
const TABS = ['Drift', 'Last', 'Session', 'Best', 'Signals'];
const MPH = 1.609344, FOOT = 0.3048;
/** What the Last tab says the app is: shown with every drift, because the app has not been on a car. */
const BETA_TEXT = 'BETA: not yet tested on a car. The angle is an estimate from the car\'s motion sensors.';
const CLOSED_TEXT = 'For closed circuits and skid pans only';
/** Each flag in a sentence (the Last tab), and in a short word (the lists). */
const FLAG_TEXT = {
    UNCALIBRATED: 'UNCALIBRATED: the car was not fully learned yet, so the angle may be off.',
    'ANGLE UNSURE': 'ANGLE UNSURE: the ± of the angle was wide.',
    'NO STEERING CHECK': 'NO STEERING CHECK: the steering did not back this drift, so a banked corner cannot be told from a slide.',
    'DATA GAP': 'DATA GAP: samples were missing, or the angle was lost, during the drift or just before it.',
    'LOW DATA RATE': 'LOW DATA RATE: the car sent its motion data less than 8 times a second.',
    SPIN: 'SPIN: the car spun. Half the points are kept.',
    DEMO: 'DEMO: made-up data, not a drift of this car.',
};
const FLAG_SHORT = { UNCALIBRATED: 'UNCAL', 'ANGLE UNSURE': 'UNSURE', 'NO STEERING CHECK': 'STEER', 'DATA GAP': 'GAP', 'LOW DATA RATE': 'RATE', SPIN: 'SPIN', DEMO: 'DEMO' };
const BEST_WORD = { score: 'SCORE', angle: 'ANGLE', time: 'TIME', dist: 'DISTANCE' };
/** Why the steering backs no drift right now (drift.js, view().noSteer), for the Drift tab's standing line and for the Signals tab. */
const NO_STEER = {
    off: ['STEERING CHECK OFF', 'switched off in Settings'], nosource: ['NO STEERING FROM THE CAR', 'no steering from the car'],
    stale: ['STEERING SILENT OR STUCK', 'the steering is silent or stuck'], unlearned: ['STEERING NOT LEARNED YET', 'not learned yet'],
};

const isNum = G.isNum;
const fix = (x, d) => (isNum(x) ? x.toFixed(d) : '--');
const two = (n) => String(n).padStart(2, '0');
/** A saved drift's date: day.month. hours:minutes, by the head unit's clock when the drift ended. */
function when(ms, year) {
    if (!isNum(ms)) return 'no date';
    const d = new Date(ms);
    return two(d.getDate()) + '.' + two(d.getMonth() + 1) + '.' + (year ? d.getFullYear() : '') + ' ' + two(d.getHours()) + ':' + two(d.getMinutes());
}
const unitOf = (v) => (v.unit === 'mph' ? 'mph' : 'km/h');
const conv = (v, kmh) => (v.unit === 'mph' ? kmh / MPH : kmh);
const speedText = (v, kmh) => (isNum(kmh) ? conv(v, kmh).toFixed(0) + ' ' + unitOf(v) : 'not known');
const distUnit = (v) => (v.unit === 'mph' ? 'ft' : 'm');
const distOf = (v, m) => (v.unit === 'mph' ? m / FOOT : m);
const distText = (v, m) => (isNum(m) ? distOf(v, m).toFixed(0) + ' ' + distUnit(v) : 'not known');
const side = (dir) => (dir === 'L' ? 'LEFT' : dir === 'R' ? 'RIGHT' : '');
const deg = (x, d) => (isNum(x) ? x.toFixed(d === undefined ? 1 : d) + '°' : '--');
const flagsOf = (r) => (r && Array.isArray(r.flags) ? r.flags.filter((f) => FLAG_SHORT[f]) : []);
/** A drift's flags in short words: all of them, or the first `max` and how many more. */
function flagsShort(r, max) {
    const f = flagsOf(r).map((x) => FLAG_SHORT[x]);
    if (!f.length) return '';
    return max && f.length > max ? f.slice(0, max).join(' ') + ' +' + (f.length - max) : f.join(' ');
}
const gradeColor = (t, g) => (g === 'S' || g === 'A' ? GO : g === 'B' ? t.accent2 || t.text : g === 'C' ? t.text : t.dim);

/* ---------- the first screen ---------- */

function splash(cv, t) {
    const lw = 560, z = Logo.size(lw, 'full'), W = cv.w, top = G.TOP + 40;
    Logo.draw(cv, (W - lw) / 2, top, lw, 'full');
    const y = top + z.h + 44;
    cv.roundRect(W / 2 - 330, y, 660, 60, 10, withAlpha(t.warn, 0.2));
    cv.text('CLOSED COURSE ONLY', W / 2, y + 43, 36, t.warn, { align: 'center', font: 'bold', spacing: 4, literal: true });
    cv.text('Proven Drift. ' + CLOSED_TEXT + '.', W / 2, y + 100, 24, t.text, { align: 'center', literal: true });
    cv.text('BETA: not yet tested on a car. The drift angle shown is an estimate.', W / 2, y + 134, 20, t.dim, { align: 'center', literal: true });
}

/* ---------- Drift ---------- */

/**
 * The state banner: { text, color, sub }. v: session.view().
 * In the order they win: no yaw rate, no data, data lost, a drift running (SWITCH for 4 s after a change of
 * direction), a drift just over (SPIN or DRIFT ENDED, for 4 s), nothing learned yet, too slow, nothing starts
 * until the car has gone straight (after a spin, an angle that was lost, or a change in what was learned),
 * still learning, ready.
 */
function banner(t, v) {
    const L = v.live, U = unitOf(v);
    if (L.state === 'noyaw') return { text: 'NO YAW RATE FROM THE CAR', color: t.warn, sub: 'Without it there is no angle, and nothing is scored' };
    if (L.state === 'nodata') return { text: 'NO DATA FROM THE CAR', color: t.dim, sub: 'Waiting for the speed and the sideways acceleration' };
    if (L.state === 'gap') return { text: 'DATA LOST', color: t.warn, sub: 'A source the angle needs has gone silent' };
    if (L.run) {
        const sub = L.learning ? 'The car is not fully learned: this drift will be flagged UNCALIBRATED' : L.noSteer ? 'No steering check: this drift is scored, and sets no best' : CLOSED_TEXT;
        return L.switched ? { text: 'SWITCH', color: GO, sub } : { text: 'DRIFT', color: GO, sub };
    }
    if (L.ended && L.last) {
        const r = L.last, got = Object.keys(v.newBest || {}).filter((k) => BEST_WORD[k]), fl = flagsOf(r).filter((f) => f !== 'SPIN');
        const what = fix(r.score, 0) + ' points, grade ' + r.grade;
        if (r.end === 'spin') return { text: 'SPIN', color: t.crit, sub: what + ': half the points, and no best' + (fl.length ? '. Also ' + fl.join(', ') : '') };
        return { text: 'DRIFT ENDED', color: t.text, sub: what + (got.length ? '. NEW BEST: ' + got.map((k) => BEST_WORD[k]).join(', ') : fl.length ? '. Flagged ' + fl.join(', ') + ': no best' : '') };
    }
    if (L.learn === 'none') return { text: 'LEARNING THE CAR', color: t.warn, sub: 'Drive a few ordinary corners, left and right. Nothing is scored yet' };
    if (L.state === 'slow' || (isNum(L.kmh) && L.kmh < v.minKmh)) return { text: 'TOO SLOW', color: t.dim, sub: 'Drifts are counted from ' + conv(v, v.minKmh).toFixed(0) + ' ' + U };
    if (L.blocked) return { text: 'GO STRAIGHT FOR A MOMENT', color: t.warn, sub: 'No drift is counted until the car has gone straight' };
    if (L.learning) return { text: 'LEARNING THE CAR', color: t.warn, sub: 'Keep driving ordinary corners. Drifts are scored, and flagged UNCALIBRATED' };
    return { text: 'READY', color: GO, sub: CLOSED_TEXT };
}

/** A point of the car (x to its right, y to its front, px) turned by th (rad, counter-clockwise) about (cx, cy). */
const turn = (cx, cy, th) => { const c = Math.cos(th), s = Math.sin(th); return (x, y) => [cx + x * c - y * s, cy - (x * s + y * c)]; };

/**
 * The car from above, nose up when th is 0. Our own plain outline: a body with a tapered nose and tail,
 * two windows and a roof, four wheels (the front ones turned by `lock`, rad, clockwise positive), four lamps.
 */
function drawCar(cv, t, cx, cy, th, lock, color, alive) {
    const P = turn(cx, cy, th), shape = (pts) => pts.map((p) => P(p[0], p[1]));
    const wheel = (x, y, a) => {
        const c = Math.cos(a), s = Math.sin(a), w = 7, h = 19;
        return [[-w, h], [w, h], [w, -h], [-w, -h]].map((p) => P(x + p[0] * c + p[1] * s, y - p[0] * s + p[1] * c));
    };
    const tyre = withAlpha(t.text, alive ? 0.85 : 0.4);
    cv.quad(wheel(-45, 58, lock), tyre); cv.quad(wheel(45, 58, lock), tyre);
    cv.quad(wheel(-45, -56, 0), tyre); cv.quad(wheel(45, -56, 0), tyre);
    const body = shape([[-28, 98], [28, 98], [39, 86], [42, 60], [42, -78], [36, -96], [-36, -96], [-42, -78], [-42, 60], [-39, 86]]);
    cv.fill(body, t.bg);
    cv.fill(body, withAlpha(color, alive ? 0.22 : 0.1));
    cv.polyline(body.concat([body[0]]), 3, withAlpha(color, alive ? 1 : 0.45));
    const glass = withAlpha(t.text, alive ? 0.3 : 0.14);
    cv.quad(shape([[-32, 46], [32, 46], [27, 20], [-27, 20]]), glass);
    cv.quad(shape([[-27, -40], [27, -40], [31, -64], [-31, -64]]), glass);
    cv.quad(shape([[-27, 16], [27, 16], [27, -36], [-27, -36]]), withAlpha(color, alive ? 0.3 : 0.12));
    const lamp = withAlpha(t.accent2 || t.text, alive ? 0.95 : 0.4), tail = withAlpha(t.crit, alive ? 0.95 : 0.4);
    cv.quad(shape([[-36, 88], [-24, 94], [-24, 89], [-38, 82]]), lamp); cv.quad(shape([[36, 88], [24, 94], [24, 89], [38, 82]]), lamp);
    cv.quad(shape([[-35, -93], [-20, -93], [-20, -88], [-39, -88]]), tail); cv.quad(shape([[35, -93], [20, -93], [20, -88], [39, -88]]), tail);
}

/** One small bar: label, a track with its fill, the value as text. value null: not known. */
function smallBar(cv, t, x, y, label, value, max, text, color) {
    cv.text(label, x, y + 15, 15, t.dim, { font: 'bold', spacing: 1.5, literal: true });
    const bx = x + 196, bw = 226, share = isNum(value) ? Math.max(0, Math.min(1, value / max)) : 0;
    cv.roundRect(bx, y + 2, bw, 14, 7, withAlpha(t.text, isNum(value) ? 0.16 : 0.07));
    if (share > 0.02) cv.roundRect(bx, y + 2, bw * share, 14, 7, color);
    cv.text(isNum(value) ? text : '--', x + 510, y + 17, 20, isNum(value) ? t.text : t.dim, { align: 'right', literal: true });
}

function drift(cv, t, v) {
    const L = v.live, U = unitOf(v), b = banner(t, v), run = L.run;
    const alive = isNum(L.angle), running = !!run;
    const stateColor = running ? GO : L.ended && L.last && L.last.end === 'spin' ? t.crit : t.text;

    // ---- the car and the way it travels ----
    G.panel(cv, t, 24, G.TOP, 470, 340, 'Car and way of travel');
    const cx = 259, cy = 252, R = 118;
    // (the car's turn follows the estimate smoothly: the estimate itself comes in steps)
    const signed = alive ? (L.dir === 'R' ? -1 : 1) * Math.min(L.angle, 135) : 0;
    const shownDeg = G.smooth('pps-drift-car', signed, 14) || 0, th = shownDeg * Math.PI / 180;
    [-90, -60, -30, 0, 30, 60, 90].forEach((a) => {
        const r = a * Math.PI / 180, x0 = cx + Math.sin(r) * (R + 6), y0 = cy - Math.cos(r) * (R + 6), x1 = cx + Math.sin(r) * (R + 18), y1 = cy - Math.cos(r) * (R + 18);
        cv.line(x0, y0, x1, y1, a === 0 ? 3 : 2, withAlpha(t.tick, 0.9));
        if (a) cv.text(String(Math.abs(a)), cx + Math.sin(r) * (R + 36), cy - Math.cos(r) * (R + 36) + 6, 16, t.dim, { align: 'center', literal: true });
    });
    // (the angle at which a drift starts, on both sides)
    [-v.startDeg, v.startDeg].forEach((a) => { const r = a * Math.PI / 180; cv.line(cx + Math.sin(r) * (R + 4), cy - Math.cos(r) * (R + 4), cx + Math.sin(r) * (R + 20), cy - Math.cos(r) * (R + 20), 3, withAlpha(GO, 0.8)); });
    if (alive && Math.abs(shownDeg) > 0.5) cv.arc(cx, cy, R - 4, R + 2, Math.min(-shownDeg, 0), Math.max(-shownDeg, 0), withAlpha(stateColor, 0.9));
    // the way it travels: an arrow that always points up, from under the car
    const ac = t.accent2 || t.text;
    cv.line(cx, cy, cx, cy - R - 2, 4, ac);
    cv.fill([[cx, cy - R - 22], [cx - 11, cy - R], [cx + 11, cy - R]], ac);
    cv.text('TRAVEL', cx + 18, cy - R - 26, 15, ac, { font: 'bold', spacing: 1.5, literal: true });
    const lock = isNum(L.opp) && alive ? (shownDeg >= 0 ? 1 : -1) * Math.min(L.opp, 36) * Math.PI / 180 : 0;
    drawCar(cv, t, cx, cy, th, lock, stateColor, alive);
    // a standing line while the steering backs no drift: drift.js flags every drift then, and none becomes a best
    // (not while nothing is scored anyway: nothing learned yet, no angle, or nothing can start until the car has gone straight)
    if (L.noSteer && NO_STEER[L.noSteer] && L.learn !== 'none' && !L.blocked && L.state !== 'noyaw' && L.state !== 'nodata' && L.state !== 'gap') cv.text(NO_STEER[L.noSteer][0] + ': NO BEST IS SET', 44, 372, 15, t.warn, { font: 'bold', spacing: 1, literal: true });

    // ---- the angle and the speed ----
    G.panel(cv, t, 510, G.TOP, 500, 340, 'Angle, estimate');
    const ang = alive ? G.hold('pps-drift-angle', L.angle, 100) : null;
    cv.text(isNum(ang) ? ang.toFixed(0) : '--', 800, 232, 150, alive ? stateColor : t.dim, { align: 'right', font: 'num', literal: true });
    if (alive) cv.text('°', 804, 184, 60, stateColor, { font: 'num', literal: true });
    cv.text(alive && isNum(L.pm) ? '± ' + L.pm.toFixed(0) + '°' : '± --', 850, 172, 30, t.dim, { literal: true });
    cv.text(alive ? side(L.dir) || 'STRAIGHT' : '', 812, 232, 38, alive && L.dir ? t.text : t.dim, { font: 'bold', spacing: 2, literal: true });
    cv.fillRect(530, 258, 460, 2, t.panelEdge || withAlpha(t.tick, 0.5));
    const sp = isNum(L.kmh) && L.state !== 'nodata' && L.state !== 'gap' ? conv(v, G.hold('pps-drift-speed', L.kmh, 100)) : null;
    cv.text(G.fmt(sp, 0), 800, 344, 84, sp === null ? t.dim : t.text, { align: 'right', font: 'num', literal: true });
    cv.text(U, 812, 344, 28, t.dim, { literal: true });
    cv.text('SPEED', 530, 300, 15, t.dim, { font: 'bold', spacing: 1.5, literal: true });

    // ---- the drift: score, multiplier, time, three bars ----
    const lastRec = !running && L.last ? L.last : null;
    G.panel(cv, t, 1026, G.TOP, 550, 340, running ? 'This drift' : lastRec ? 'Last drift' : 'This drift');
    const sc = running ? run.score : lastRec ? lastRec.score : null, col = running ? t.text : t.dim;
    cv.text(isNum(sc) ? sc.toFixed(0) : '--', 1352, 196, 110, running ? GO : col, { align: 'right', font: 'num', literal: true });
    cv.text('POINTS', 1352, 228, 15, t.dim, { align: 'right', font: 'bold', spacing: 1.5, literal: true });
    const mult = running ? run.mult : lastRec ? lastRec.mult : null, secs = running ? run.time : lastRec ? lastRec.time : null;
    cv.text('MULTIPLIER', 1392, 112, 15, t.dim, { font: 'bold', spacing: 1.5, literal: true });
    cv.text(isNum(mult) ? 'x' + mult.toFixed(2) : '--', 1392, 156, 44, col, { font: 'num', literal: true });
    cv.text('TIME', 1392, 190, 15, t.dim, { font: 'bold', spacing: 1.5, literal: true });
    const tw = cv.text(isNum(secs) ? secs.toFixed(1) : '--', 1392, 234, 44, col, { font: 'num', literal: true });
    cv.text('s', 1392 + tw + 8, 234, 24, t.dim, { literal: true });
    cv.fillRect(1046, 252, 510, 2, t.panelEdge || withAlpha(t.tick, 0.5));
    smallBar(cv, t, 1046, 270, 'OPPOSITE LOCK', L.opp, 40, isNum(L.opp) ? L.opp.toFixed(0) + '°' : '', ac);
    smallBar(cv, t, 1046, 306, 'PEDAL', isNum(L.pedal) ? L.pedal * 100 : null, 100, isNum(L.pedal) ? (L.pedal * 100).toFixed(0) + ' %' : '', ac);
    smallBar(cv, t, 1046, 342, 'REAR WHEELSPIN', L.wheelspin, 100, isNum(L.wheelspin) ? L.wheelspin.toFixed(0) + ' %' : '', L.wheelspin >= 10 ? t.warn : ac);

    // ---- the banner ----
    cv.roundRect(24, 392, 1552, 52, 10, withAlpha(b.color, 0.18));
    if (running) cv.roundRect(24, 392, 1552, 52, 10, withAlpha(GO, 0.14 + 0.1 * Math.sin(v.now / 160)));
    cv.text(b.text, 48, 429, 30, b.color, { font: 'bold', spacing: 3, literal: true });
    cv.text(b.sub, 1552, 427, 22, t.text, { align: 'right', literal: true });

    // ---- the session, in a strip ----
    G.panel(cv, t, 24, 452, 1552, 60);
    const S = v.sess, cell = (x, label, value, color) => {
        cv.text(label, x, 474, 15, t.dim, { font: 'bold', spacing: 1.5, literal: true });
        cv.text(value, x, 501, 22, color || t.text, { font: 'bold', literal: true });
    };
    cell(44, 'SESSION SCORE', fix(S.total, 0));
    cell(270, 'DRIFTS', fix(S.count, 0));
    cell(420, 'BEST THIS SESSION', S.best ? fix(S.best.score, 0) + ', GRADE ' + S.best.grade : '--', S.best ? t.text : t.dim);
    cell(730, 'BIGGEST ANGLE', S.angle ? deg(S.angle.peak) + ' ' + side(S.angle.dir) : '--', S.angle ? t.text : t.dim);
    cell(990, 'DATA RATE', isNum(L.rate) ? L.rate.toFixed(0) + '/s' : '--', isNum(L.rate) && L.rate < 8 ? t.warn : isNum(L.rate) ? t.text : t.dim);
    cell(1170, 'THE CAR', L.learn === 'learned' ? 'LEARNED' : L.learn === 'learning' ? 'LEARNING: UNCALIBRATED' : 'NOT LEARNED: NO SCORE', L.learn === 'learned' ? t.text : t.warn);
}

/* ---------- Last ---------- */

function last(cv, t, v) {
    const r = v.last;
    const p = G.panel(cv, t, 24, G.TOP, 700, 468, 'Last drift');
    const q = G.panel(cv, t, 740, G.TOP, 836, 468, 'Angle and speed');
    if (!r) {
        cv.text('No drift yet.', 48, 150, 26, t.dim, { literal: true });
        cv.text('A drift starts at ' + v.startDeg + '° or more, from ' + speedText(v, v.minKmh) + '.', 48, 186, 22, t.dim, { literal: true });
        cv.text(CLOSED_TEXT + '.', 48, 218, 22, t.dim, { literal: true });
        cv.text(BETA_TEXT, 48, 496, 17, t.warn, { literal: true });
        return;
    }
    const fl = flagsOf(r), got = Object.keys(v.newBest || {}).filter((k) => BEST_WORD[k]);
    cv.text(when(r.date, true), p.x + p.w - 20, p.y + 40, 20, t.dim, { align: 'right', literal: true });
    // ---- score and grade ----
    const sw = cv.text(fix(r.score, 0), 48, 176, 84, t.text, { font: 'num', literal: true });
    cv.text('POINTS', 48 + sw + 12, 176, 20, t.dim, { font: 'bold', spacing: 1.5, literal: true });
    cv.roundRect(596, 104, 104, 84, 12, withAlpha(gradeColor(t, r.grade), 0.2));
    cv.text(String(r.grade || '-'), 648, 170, 64, gradeColor(t, r.grade), { align: 'center', font: 'bold', literal: true });
    cv.text('GRADE', 584, 170, 15, t.dim, { align: 'right', font: 'bold', spacing: 1.5, literal: true });
    cv.fillRect(48, 196, p.w - 48, 1, withAlpha(t.tick, 0.4));
    // ---- everything known about it: three columns, six rows ----
    const cells = [
        ['PEAK ANGLE', deg(r.peak) + ' ' + side(r.dir)], ['AVERAGE ANGLE', deg(r.avg)], ['ANGLE ±', deg(r.pm) + (isNum(r.pmMax) ? ', most ' + deg(r.pmMax) : ''), fl.indexOf('ANGLE UNSURE') >= 0 ? t.warn : null],
        ['TIME', fix(r.time, 2) + ' s'], ['DISTANCE', distText(v, r.dist)], ['SWITCHES', fix(r.switches, 0) + (isNum(r.mult) ? ', multiplier x' + r.mult.toFixed(2) : '')],
        ['ENTRY SPEED', speedText(v, r.entry)], ['AVERAGE SPEED', speedText(v, r.avgKmh)], ['LOWEST SPEED', speedText(v, r.minKmh)],
        ['PEAK SIDEWAYS G', isNum(r.peakG) ? r.peakG.toFixed(2) + ' g' : 'not known'], ['PEAK YAW RATE', isNum(r.peakYaw) ? r.peakYaw.toFixed(0) + '°/s' : 'not known'], ['MOST OPPOSITE LOCK', isNum(r.opp) ? deg(r.opp, 0) : 'not known'],
        ['AVERAGE PEDAL', isNum(r.pedal) ? r.pedal.toFixed(0) + ' %' : 'not known'], ['PEAK REAR WHEELSPIN', isNum(r.wheelspin) ? r.wheelspin.toFixed(0) + ' %' : 'not known'], ['HANDBRAKE AT THE START', r.handbrake === true ? 'yes' : r.handbrake === false ? 'no' : 'not known'],
        ['SMOOTHNESS', isNum(r.smooth) ? 'x' + r.smooth.toFixed(2) + ', ' + fix(r.reversals, 0) + (r.reversals === 1 ? ' reversal' : ' reversals') : 'not known'],
        ['DATA', (isNum(r.rate) ? r.rate.toFixed(0) + '/s' : 'rate not known') + (isNum(r.gap) && r.gap > 0 ? ', gap ' + r.gap.toFixed(0) + ' ms' : ''), fl.indexOf('DATA GAP') >= 0 || fl.indexOf('LOW DATA RATE') >= 0 ? t.warn : null],
        ['GPS SPEED / CAR SPEED', r.gps && isNum(r.gps.ratio) ? 'x' + r.gps.ratio.toFixed(3) + ' (' + fix(r.gps.n, 0) + ')' : 'not known'],
    ];
    cells.forEach((c, i) => {
        const x = 48 + (i % 3) * 226, y = 220 + Math.floor(i / 3) * 45;
        cv.text(c[0], x, y, 14, t.dim, { font: 'bold', spacing: 1.2, literal: true });
        cv.text(c[1], x, y + 22, 21, c[2] || (/not known/.test(c[1]) ? t.dim : t.text), { literal: true });
    });
    if (v.notSaved) cv.text('NOT SAVED: the app cannot write its file. Drifts are lost when it closes.', 48, 496, 17, t.crit, { literal: true });
    else cv.text(BETA_TEXT, 48, 496, 17, t.warn, { literal: true });

    // ---- the trace: the angle over the drift's time, and the speed under it ----
    cv.text(fl.length ? 'FLAGGED: SETS NO BEST' : got.length ? 'NEW BEST: ' + got.map((k) => BEST_WORD[k]).join(', ') : 'NO FLAG', q.x + q.w - 20, q.y + 40, 18, fl.length ? t.crit : got.length ? GO : t.dim, { align: 'right', font: 'bold', spacing: 1, literal: true });
    const tr = r.trace, n = tr && Array.isArray(tr.a) && Array.isArray(tr.v) ? Math.min(tr.a.length, tr.v.length) : 0;
    const ok = n >= 2 && isNum(tr.ms) && tr.ms > 0;
    const X = (i) => i * tr.ms / 1000, T = ok ? X(n - 1) : 1;
    const pts = (list, f) => (ok ? list.slice(0, n).map((y, i) => [X(i), f(y)]) : []);
    const a = ok ? tr.a.slice(0, n).filter(isNum) : [], sv = ok ? tr.v.slice(0, n).filter(isNum).map((x) => conv(v, x)) : [];
    // a scale of whole steps: the smallest step of the list that needs four intervals at most
    const scale = (lo, hi, steps) => {
        for (const st of steps) { const y0 = Math.floor(lo / st) * st, y1 = Math.max(y0 + st, Math.ceil(hi / st) * st); if ((y1 - y0) / st <= 4) return { y0, y1, st }; }
        const st = steps[steps.length - 1];
        return { y0: Math.floor(lo / st) * st, y1: Math.ceil(hi / st) * st, st };
    };
    // (the trace's angle is negative to the LEFT: a drift all one way gets the whole height, one that switches a line at zero)
    const A = scale(Math.min(0, Math.min.apply(null, a.concat([0]))), Math.max(0, Math.max.apply(null, a.concat([0]))), [10, 20, 30, 50, 100, 200]);
    cv.text('ANGLE, DEGREES' + (A.y0 < 0 && Math.max.apply(null, a.concat([0])) > 0 ? ': ABOVE THE LINE RIGHT, BELOW IT LEFT' : A.y0 < 0 ? ': TO THE LEFT (SHOWN BELOW THE LINE)' : ': TO THE RIGHT'), q.x + 20, 106, 14, t.dim, { font: 'bold', spacing: 1.2, literal: true });
    G.chart(cv, t, q.x + 20, 112, q.w - 40, 118, {
        xMin: 0, xMax: T, yMin: A.y0, yMax: A.y1, yStep: A.st, xFmt: () => '', padBottom: 8, padLeft: 52,
        series: [{ pts: pts(tr ? tr.a : [], (y) => y), color: GO, width: 3 }], marks: A.y0 < 0 && A.y1 > 0 ? [{ y: 0, color: t.text }] : [],
        empty: 'No trace is kept for this drift.',
    });
    const V = sv.length ? scale(Math.min.apply(null, sv), Math.max.apply(null, sv), [10, 20, 50, 100]) : { y0: 0, y1: 10, st: 10 };
    cv.text('SPEED, ' + unitOf(v).toUpperCase() + ', OVER THE SECONDS OF THE DRIFT', q.x + 20, 250, 14, t.dim, { font: 'bold', spacing: 1.2, literal: true });
    G.chart(cv, t, q.x + 20, 256, q.w - 40, 112, {
        xMin: 0, xMax: T, yMin: V.y0, yMax: V.y1, yStep: V.st, xUnit: 's', padLeft: 52,
        xStep: T <= 6 ? 1 : T <= 12 ? 2 : T <= 30 ? 5 : T <= 60 ? 10 : Math.ceil(T / 60) * 10,
        series: [{ pts: pts(tr ? tr.v : [], (y) => conv(v, y)), color: t.accent2 || t.text, width: 3 }], empty: '',
    });
    // ---- the flags in words ----
    if (!fl.length) cv.text('No flag: nothing in the data speaks against this drift. It can be a best.', q.x + 20, 404, 17, t.dim, { literal: true });
    // (six fit at 19 px a line; all seven at once at 17)
    fl.forEach((f, i) => cv.text(FLAG_TEXT[f], q.x + 20, (fl.length > 6 ? 398 : 402) + i * (fl.length > 6 ? 17.5 : 19), 16, f === 'DEMO' ? t.dim : t.warn, { literal: true }));
}

/* ---------- Session ---------- */

const numCol = (label, w) => ({ label, w, align: 'right', size: 21 });
/** One row of a list of drifts: score, grade, peak angle, time, distance. */
const driftRow = (t, v, r) => [
    { text: fix(r.score, 0), color: 'text' }, { text: String(r.grade || '-'), color: gradeColor(t, r.grade), font: 'bold' },
    deg(r.peak) + ' ' + (r.dir === 'L' ? 'L' : r.dir === 'R' ? 'R' : ''), fix(r.time, 1) + ' s', isNum(r.dist) ? distOf(v, r.dist).toFixed(0) + ' ' + distUnit(v) : '--',
];

function session(cv, t, v) {
    const S = v.sess;
    G.panel(cv, t, 24, G.TOP, 560, 468, 'This session');
    const sw = cv.text(fix(S.total, 0), 48, 180, 84, S.count ? t.text : t.dim, { font: 'num', literal: true });
    cv.text('POINTS', 48 + sw + 12, 180, 20, t.dim, { font: 'bold', spacing: 1.5, literal: true });
    cv.text(fix(S.count, 0) + (S.count === 1 ? ' drift' : ' drifts'), 564, 180, 28, S.count ? t.text : t.dim, { align: 'right', font: 'bold', literal: true });
    const rows = [
        ['BEST SCORE', S.best ? fix(S.best.score, 0) + ', grade ' + S.best.grade : '--'],
        ['BIGGEST ANGLE', S.angle ? deg(S.angle.peak) + ' ' + side(S.angle.dir) : '--'],
        ['LONGEST BY TIME', S.time ? fix(S.time.time, 1) + ' s' : '--'],
        ['LONGEST BY DISTANCE', S.dist ? distText(v, S.dist.dist) : '--'],
    ];
    rows.forEach((r, i) => {
        const y = 216 + i * 62;
        cv.fillRect(48, y - 6, 516, 1, withAlpha(t.tick, 0.35));
        cv.text(r[0], 48, y + 22, 16, t.dim, { font: 'bold', spacing: 1.5, literal: true });
        cv.text(r[1], 564, y + 38, 30, r[1] === '--' ? t.dim : t.text, { align: 'right', font: 'bold', literal: true });
    });
    cv.text('Every drift since the app was started counts here, flagged or not.', 48, 496, 17, t.dim, { literal: true });

    const q = G.panel(cv, t, 600, G.TOP, 976, 468, 'Drifts of this session');
    const list = S.list.slice(0, 9);
    const cols = [{ label: 'No.', w: 80, size: 21, color: 'dim' }, numCol('Score', 130), { label: 'Grade', w: 110, align: 'center', size: 22 }, numCol('Peak angle', 170), numCol('Time', 120), numCol('Distance', 130), { label: '', w: 28 }, { label: 'Flags', w: 160, size: 17, color: 'warn' }];
    G.table(cv, t, q.x + 24, 100, 928, cols, list.map((r, i) => [String(S.count - i)].concat(driftRow(t, v, r), ['', flagsShort(r, 2)])), { rowH: 38, empty: 'No drift yet in this session.' });
    cv.text(S.count > list.length ? 'The newest ' + list.length + ' of ' + S.count + ' are shown. A flagged drift sets no all-time best: see the Last tab.' : 'Newest first. A flagged drift sets no all-time best: the Last tab says each flag in words.', q.x + 24, 496, 17, t.dim, { literal: true });
}

/* ---------- Best ---------- */

function best(cv, t, v) {
    const B = v.best || {};
    const p = G.panel(cv, t, 24, G.TOP, 620, 468, 'All-time bests');
    const rows = [
        ['BEST SCORE', B.score, (r) => [fix(r.score, 0), 'points'], (r) => 'grade ' + r.grade + '  ·  ' + deg(r.peak) + ' ' + side(r.dir) + '  ·  ' + fix(r.time, 1) + ' s'],
        ['BIGGEST ANGLE', B.angle, (r) => [fix(r.peak, 1) + '°', ''], (r) => side(r.dir) + '  ·  ' + fix(r.score, 0) + ' points  ·  ' + fix(r.time, 1) + ' s'],
        ['LONGEST BY TIME', B.time, (r) => [fix(r.time, 1), 's'], (r) => fix(r.score, 0) + ' points  ·  ' + deg(r.peak) + ' ' + side(r.dir)],
        ['LONGEST BY DISTANCE', B.dist, (r) => [isNum(r.dist) ? distOf(v, r.dist).toFixed(0) : '--', distUnit(v)], (r) => fix(r.score, 0) + ' points  ·  ' + fix(r.time, 1) + ' s'],
    ];
    rows.forEach((row, i) => {
        const y = 100 + i * 94, r = row[1];
        cv.text(row[0], 48, y + 26, 22, t.text, { font: 'bold', spacing: 1, literal: true });
        const val = r ? row[2](r) : ['--', ''];
        cv.text(val[0], 560, y + 44, 52, r ? t.accent2 || t.text : withAlpha(t.dim, 0.6), { align: 'right', font: 'num', literal: true });
        cv.text(val[1], 568, y + 44, 22, t.dim, { literal: true });
        cv.text(r ? row[3](r) + '  ·  ' + when(r.date, true) : 'no best yet', 48, y + 58, 17, t.dim, { literal: true });
        if (i < rows.length - 1) cv.fillRect(48, y + 76, p.w - 48, 1, withAlpha(t.tick, 0.3));
    });
    if (v.notSaved) cv.text('NOT SAVED: the app cannot write its file. Drifts are lost when it closes.', 48, 496, 17, t.crit, { literal: true });
    else cv.text('A drift with a flag sets no best. "Reset bests" is in Settings, Workshop settings.', 48, 496, 17, t.dim, { literal: true });

    const q = G.panel(cv, t, 660, G.TOP, 916, 468, v.demo ? 'Demo drifts, not saved' : 'Saved drifts');
    const list = (v.saved || []).slice(0, 9);
    const cols = [{ label: 'When', w: 176, size: 20 }, numCol('Score', 110), { label: 'Grade', w: 100, align: 'center', size: 22 }, numCol('Peak angle', 150), numCol('Time', 106), numCol('Distance', 120), { label: '', w: 24 }, { label: 'Flags', w: 90, size: 17, color: 'warn' }];
    G.table(cv, t, q.x + 20, 100, 876, cols, list.map((r) => [when(r.date)].concat(driftRow(t, v, r), ['', flagsShort(r, 1)])), { rowH: 38, empty: v.demo ? 'No demo drift yet.' : 'No saved drift yet.' });
    cv.text((v.demo ? 'Demo drifts are never saved' : 'The last 30 drifts are kept') + ((v.saved || []).length > list.length ? ', the newest ' + list.length + ' are shown' : '') + '. The Last tab says each flag in words.', q.x + 20, 496, 17, t.dim, { literal: true });
}

/* ---------- Signals ---------- */

const STATE = { missing: ['not on this unit', 'dim'], error: ['not answering', 'warn'], wait: ['subscribing', 'dim'] };
const YAW_NAME = { yawC: 'CDS2', yawS: 'chassis' };
const STEER_NAME = { steerF: 'front wheels, chassis', steerXF: 'front wheels, XView', steerD: 'steering wheel, chassis', steerXD: 'steering wheel, XView' };
const LEARN_WORD = { learned: 'LEARNED', learning: 'LEARNING', none: 'NOT LEARNED' };
const DEFAULT_YAW = 0.005;              // degrees a second per count: the default learn.js states

function signals(cv, t, s) {
    // ---- every source ----
    const p = G.panel(cv, t, 24, G.TOP, 800, 468, 'Sources');
    const used = [s.inUse.speed, s.inUse.yaw, s.inUse.steer];
    const rows = s.sources.map((src) => {
        const m = s.meters[src.key] || { n: 0 }, on = used.indexOf(src.key) >= 0 && m.n > 0;
        const st = STATE[src.state] || (m.n ? [on ? 'present, in use' : 'present', GO] : ['no data yet', 'dim']);
        return [src.label, { text: st[0], color: st[1] }, isNum(m.rate) ? m.rate.toFixed(0) + '/s' : '--', isNum(m.most) ? m.most.toFixed(0) + '/s' : '--', String(m.n || 0), s.raw[src.key] === undefined ? '--' : String(s.raw[src.key])];
    });
    G.table(cv, t, p.x + 20, 94, 760, [
        { label: 'Source', w: 214, size: 16 }, { label: 'State', w: 136, size: 16 }, { label: 'Now', w: 62, align: 'right', size: 16 },
        { label: 'Most', w: 62, align: 'right', size: 16 }, { label: 'Samples', w: 84, align: 'right', size: 16 }, { label: 'Raw value now', w: 202, align: 'right', size: 16 },
    ], rows, { rowH: 20, headerSize: 14 });

    // ---- what was learned about this car ----
    const g = G.panel(cv, t, 840, G.TOP, 736, 246, 'Learned about this car');
    const L = s.learn, y = L.yaw, st = L.steer, pct = (x) => (isNum(x) ? (x * 100).toFixed(1) + ' %' : '--'), D = 180 / Math.PI;
    const moments = (x) => x.moments + ' moments' + (x.n ? ', ' + x.left + ' left and ' + x.right + ' right, spread ' + pct(x.spread) : '');
    const lines = [
        ['Yaw rate, ' + (YAW_NAME[s.inUse.yaw] || '?') + (s.auto.yaw ? '' : ' (set by hand)') + ': ' + LEARN_WORD[y.state], y.state === 'learned' ? t.text : t.warn],
        ['    ' + (isNum(y.k) ? (y.k * D).toPrecision(4) + ' °/s per count (x' + (y.k * D / DEFAULT_YAW).toFixed(3) + ' of the default), zero ' + y.zero.toFixed(1) : 'the default stands: ' + DEFAULT_YAW + ' °/s per count, zero 32768'), isNum(y.k) ? t.text : t.dim],
        ['    ' + moments(y) + '. Learned: 20, 6 each way, within 8 %', t.dim],
        ['Steering, ' + (STEER_NAME[s.inUse.steer] || '?') + (s.auto.steer ? '' : ' (set by hand)') + ': ' + LEARN_WORD[st.state], st.state === 'learned' ? t.text : t.warn],
        ['    ' + (isNum(st.k) ? (st.k * s.wheelbase * D).toPrecision(4) + '° at the wheels per count, zero ' + st.zero.toFixed(1) : 'no scale yet') + ', wheelbase ' + s.wheelbase.toFixed(2) + ' m', isNum(st.k) ? t.text : t.dim],
        ['    ' + moments(st) + '. Steering check: ' + (!s.useSteer ? NO_STEER.off[1] : !(s.meters[s.inUse.steer] || {}).n ? NO_STEER.nosource[1] : NO_STEER[s.noSteer] ? NO_STEER[s.noSteer][1] : s.steering ? 'on, pulling now' : 'on'), s.useSteer && !NO_STEER[s.noSteer] && (s.meters[s.inUse.steer] || {}).n ? t.dim : t.warn],
        ['Pedal: ' + (isNum(L.pedal.min) && isNum(L.pedal.max) ? 'raw ' + L.pedal.min + ' to ' + L.pedal.max : 'no range yet') + '.   Rear over front wheel speed: ' + (isNum(L.wheels.base) ? L.wheels.base.toFixed(4) : 'not yet') + ' (' + L.wheels.readings + ' readings)', t.text],
        ['Positive sideways acceleration is a ' + (L.left.positiveIsLeft ? 'LEFT' : 'RIGHT') + ' turn: ' + (L.left.known ? 'known' : 'ASSUMED') + ' (' + L.left.agree + ' corners agree, ' + L.left.against + ' against)', L.left.known ? t.text : t.warn],
        [s.useLong === false ? 'Forward acceleration: left out in Settings. Nothing checks the angle but the steering' :
            'Positive forward acceleration is ' + (L.ax.positiveIsForward ? 'speeding up' : 'SLOWING DOWN') + ': ' + (L.ax.known ? 'known' : 'ASSUMED') + ' (' + L.ax.agree + ' agree, ' + L.ax.against + ' against)', s.useLong !== false && L.ax.known ? t.text : t.warn],
        // (what the forward acceleration reads more than the speed's own change on a straight, taken out: angle.js; seconds the "no slide" test of learn.js turned down)
        ['    ' + (s.useLong === false ? 'no offset is taken' : isNum(s.ax0) ? 'on a straight it reads ' + Math.abs(s.ax0).toFixed(2) + ' m/s2 ' + (s.ax0 < 0 ? 'less' : 'more') + ' than the speed gains (taken out)' : 'its offset against the speed\'s own change: no straight yet') +
            '. Turned down as slides: ' + L.turnedDown + ' s', t.dim],
    ];
    lines.forEach((l, i) => cv.text(l[0], g.x + 20, 108 + i * 18.5, 16, l[1], { literal: true }));

    // ---- the study-only raw values, and the GPS check ----
    const h = G.panel(cv, t, 840, 300, 736, 212, 'Study only: raw values, GPS check');
    const study = (key) => { const x = s.car.study[key]; return x ? x.map((m) => m[0] + ' ' + m[1]).join(', ') : 'nothing yet'; };
    const gp = s.gps, ratio = (x) => (isNum(x.ratio) ? 'x' + x.ratio.toFixed(3) + ' (' + x.n + ')' : x.n ? 'too few (' + x.n + ')' : 'none yet');
    const kinds = String(s.car.kinds || '').split(' ').filter(Boolean).slice(0, 4).join(' ');
    const more = [
        ['Car\'s motion estimate: ' + study('move'), t.text],
        ['The same, verified: ' + study('est'), t.text],
        ['BMW drift analyser, last: ' + study('mLast'), t.text],
        ['BMW drift analyser, best: ' + study('mBest'), t.text],
        ['GPS: ' + (kinds || 'no sentence yet') + '.   ' + gp.sentences.ok + ' good, ' + gp.sentences.bad + ' bad' + (gp.last ? ', speed ' + (gp.last.valid && isNum(gp.last.kmh) ? gp.last.kmh.toFixed(1) + ' km/h' : 'void') : ''), t.text],
        ['GPS speed over the car\'s: straight ' + ratio(gp.straight) + ', in drifts at a held speed ' + ratio(gp.drift), t.text],
        ['Angle worked out ' + (isNum(s.lag) ? Math.round(s.lag) + ' ms' : '--') + ' behind, ± ' + (isNum(s.pm) ? s.pm.toFixed(1) + '°' : '--') + '.   Getter top-up: ' + (s.topUp.length ? s.topUp.join(', ') : 'none'), t.text],
        [s.notSaved ? 'NOT SAVED: the app cannot write its file.' : s.demo ? 'Demo data is showing on the other tabs. This tab is the car\'s.' : 'These raw values enter no angle and no score.', s.notSaved ? t.crit : t.dim],
    ];
    more.forEach((l, i) => cv.text(l[0], h.x + 20, 366 + i * 19.5, 16, l[1], { literal: true }));
}

module.exports = { TABS, BETA_TEXT, CLOSED_TEXT, FLAG_TEXT, FLAG_SHORT, splash, drift, last, session, best, signals, banner, when };
