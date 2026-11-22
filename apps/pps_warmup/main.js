'use strict';
/**
 * Proven Warm-Up - tells the driver when engine oil, gearbox oil and coolant are in their safe range.
 *
 * The workshop programs, per car, in Settings > Workshop settings:
 *   - "safe from" and "too hot above" for engine oil, gearbox oil and coolant
 *   - the rev limit to keep to until everything is warm
 *   - where the gearbox oil temperature comes from (or that this car has none)
 *
 * The driver sees
 *   - one screen: a status line and three gauges with a blue (not yet), green (safe) and red (too hot)
 *     zone each, the minutes until each is ready, and a warning when revving past the limit before it is warm.
 *     Gauge style (setting): horizontal bars with the full Proven logo, the rev limit and the time to ready
 *     beside them, or round dials
 *   - an announcement over the screen when everything has come up to temperature
 *   - the same on the iDrive home screen as a widget, without opening the app
 *
 * It runs from the head unit's start (app.json "autostart"), so the warm-up is followed with the app closed.
 * Decision: warm.js. Readings: source.js, gearbox.js. Gauge faces and logo: faces.js, logo.js. Colours:
 * proven-theme.js.
 *
 * When the gearbox unit is asked (every request goes through the car's gateway and keeps the car awake):
 *   - never while the car says it is locked and left (its own state, where the head unit has it)
 *   - with the app closed and no widget: while the engine runs and the car is not yet up to temperature, or its
 *     gearbox oil is read a little under its "safe from" (dipped)
 *   - with the screen open: while the car is driven, or for USED_MS after the screen was opened (engine running
 *     or not, as the kit's Warm-Up asks while its screen shows)
 *   - with only the widget on the home screen: while the car is driven
 * "driven" = the engine running or the car moving, now or in the last DRIVEN_MS (a stop at the lights).
 * Built on the idrive7-apps kit (MIT).
 */
require('./proven-theme').register();
const mgu = require('./kit/mgu');
const { withAlpha, ScaledCanvas } = require('./kit/canvas');
const G = require('./kit/gauges');
const Faces = require('./faces');
const Logo = require('./logo');
const { WarmUp, limitsFrom, FLUIDS, RUN_END_MS } = require('./warm');
const { Source, mono } = require('./source');

const W = 1600, H = 520;
const GO = '#2fd27a';
const NAMES = { oil: 'Engine oil', gearbox: 'Gearbox oil', coolant: 'Coolant' };
const SHORT = { oil: 'OIL', gearbox: 'GEARBOX', coolant: 'COOLANT' };
const CX = { oil: 283, gearbox: 800, coolant: 1317 };
// horizontal bars: three rows on the left, the brand column on the right
const ROW_Y = { oil: 108, gearbox: 244, coolant: 380 }, ROW_H = 128, ROWS_W = 1204, BAR_X = 330, BAR_W = 722, BAR_H = 44;
const SIDE = { x: 1244, w: 332 };
const ANNOUNCE_MS = 6000;
const ANNOUNCE_FRESH_MS = 15000;   // the announcement is only shown this soon after the car came up to temperature
const ANNOUNCE_AGAIN_MS = 600000;  // and not again within this time (a fluid that dips under its hold and comes back)
const DRIVEN_MS = 180000;          // the car counts as driven this long after the engine last ran or the car last moved
const USED_MS = 600000;            // the screen counts as in use this long after it was opened
const OPENED_MS = 5000;            // a frame drawn after a pause this long: the screen was just opened
// dial scales: deg C, and deg F
const SCALE = { c: { min: 0, max: 150, major: 30, minor: 3 }, f: { min: 0, max: 300, major: 50, minor: 5 } };

/** "engine oil", "engine oil and coolant", "engine oil, gearbox oil and coolant" */
const list = (keys) => {
    const n = keys.map((k) => NAMES[k].toLowerCase());
    return n.length < 2 ? n.join('') : n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1];
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/* With or without the screen (autostart): the readings, and the decision once a second. */
async function background(bg) {
    const { settings, log } = bg;
    const src = new Source(bg);
    const warm = new WarmUp(() => limitsFrom((k) => settings.get(k)));
    let wasDemo = null, drivenAt = -Infinity, wallAt = null, monoAt = 0;
    const tick = () => {
        const d = src.data(), now = mono(), wall = Date.now();
        if (d.demo !== wasDemo) { if (wasDemo !== null) warm.reset(); wasDemo = d.demo; log.info(d.demo ? 'demo data' : 'car data'); }
        // time the steady clock did not count (it stands still while the head unit sleeps; the wall clock is also set
        // forward once after start-up): taken as an engine stop of that length, so nothing is carried over a long stop
        if (wallAt !== null && (wall - wallAt) - (now - monoAt) > RUN_END_MS) { log.info('the head unit\'s clock jumped ahead by ' + Math.round((wall - wallAt) / 60000) + ' min: taken as a long stop'); warm.endRun(); }
        wallAt = wall; monoAt = now;
        const st = warm.feed(d, now);
        if (st.running || src.moving()) drivenAt = now;
        return st;
    };
    // revs past the limit are caught as the car sends them, not once a second (the demo's come with tick)
    src.onRpm = (r) => warm.rev(r, mono());
    // (the kit does not guard a timer the app starts itself, and an uncaught error would stop the app;
    // an error that keeps coming is logged the first time and then once in 300, not every second)
    let tickErr = 0;
    setInterval(() => { try { tick(); } catch (e) { if (tickErr++ % 300 === 0) log.warn('tick (' + tickErr + 'x): ' + (e && e.stack || e)); } }, 1000);
    // until the car is up to temperature the gearbox unit is asked with the engine running, app open or not; never
    // while the car is locked and left. Also while the gearbox is read a little under its "safe from" on a car that
    // is ready ('dip'): that reading is not counted on once it has aged out, so it is kept live
    const warmingUp = () => { const st = warm.status(mono()); return st.running && (st.overall !== 'ready' || st.fluids.gearbox.state === 'dip'); };
    src.wantGearbox = () => !src.left() && warmingUp();
    // fedDemo: the temperatures the decision holds now are demo data (true until the next tick after the demo ends)
    // driven: the engine ran or the car moved in the last DRIVEN_MS
    return { src, warm, tick, fedDemo: () => wasDemo === true, warmingUp, driven: () => mono() - drivenAt < DRIVEN_MS };
}

mgu.run({
    background,
    async start(ctx) {
        const { ui, settings, log } = ctx;
        const { src, warm, tick, fedDemo, warmingUp, driven } = ctx.background || await background(ctx);
        const demoShown = () => src.usingDemo() || fedDemo();
        const visible = () => { try { return !!ui.isVisible('MAIN'); } catch (e) { return true; } };
        const widgetOn = () => !!(ctx.widget && ctx.widget.active && ctx.widget.active());
        // ... and while someone is looking, also once it is warm and with the engine stopped: at the screen while
        // the car is driven or the screen was opened in the last USED_MS (not for good on a parked car with the screen
        // left on), at the widget while the car is driven
        let drawnAt = -Infinity, openedAt = -Infinity;
        const used = () => mono() - openedAt < USED_MS;
        src.wantGearbox = () => !src.left() && (warmingUp() || (visible() && (driven() || used())) || (widgetOn() && driven()));

        const isF = () => settings.get('tempUnit') === 'f';
        const T = (c) => (G.isNum(c) ? (isF() ? c * 9 / 5 + 32 : c) : null);
        const tU = () => (isF() ? '°F' : '°C');
        const deg = (c) => G.fmt(T(c), 0) + tU();
        const rpmText = (r) => String(Math.round(r)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        const stateColor = (t, s) => (s === 'hot' ? t.crit : s === 'ready' ? GO : s === 'warming' || s === 'stalled' || s === 'off' || s === 'dip' ? t.cold : t.tick);
        // the time to ready as the decision gives it: "about 7", or past its cap "over 60"
        const mins = (m) => String(Math.max(1, Math.round(m)));
        /**
         * What "Up to temperature" rests on: the fluids in range, then what is not quite so: a fluid that has dipped a
         * little under its limit (several: named without their numbers, so the line fits), a gearbox counted on its last
         * reading, a gearbox that is left out.
         */
        const readyNote = (st) => {
            const counted = FLUIDS.filter((k) => st.fluids[k].state === 'ready' && st.fluids[k].temp !== null);
            const dips = FLUIDS.filter((k) => st.fluids[k].state === 'dip');
            return cap((counted.length ? [list(counted) + (counted.length > 1 ? ' are in their safe range' : ' is in its safe range')] : [])
                .concat(dips.length > 1 ? [list(dips) + ' have dipped a little'] : dips.length ? [list(dips) + ' has dipped below ' + deg(st.fluids[dips[0]].ready)] : [],
                    st.held.length ? [list(st.held) + ' on its last reading'] : [], st.unwatched.length ? [list(st.unwatched) + ' not monitored'] : []).join('  ·  '));
        };

        /** The status line: { title, note, color }. */
        function headline(st, d) {
            // (an engine that runs while the car gives no temperature at all still gets the rev advice)
            if (st.overall === 'nodata') return { title: 'No temperature data', note: d.demo ? '' : (st.running && st.limit > 0 ? 'Keep below ' + rpmText(st.limit) + ' rpm  ·  ' : '') + 'waiting for the car', color: 'dim' };
            if (st.overall === 'hot') {
                const hot = FLUIDS.filter((k) => st.fluids[k].state === 'hot');
                return { title: 'Too hot', note: cap(list(hot)) + ' above ' + (hot.length > 1 ? 'their limits' : 'its limit') + '  ·  ease off and let it cool', color: 'crit' };
            }
            if (st.overall === 'ready') return { title: 'Up to temperature', note: readyNote(st), color: GO };
            // the revs that raised it (the highest of the burst), not the live ones, which may be back under the limit;
            // "a cold engine" only when engine oil or coolant is read below its limit, not for the gearbox alone
            if (st.over) {
                return { title: 'Ease off', color: 'crit', note: rpmText(st.overRpm) + (st.cold.some((k) => k !== 'gearbox') ? ' rpm on a cold engine' : ' rpm before the car is up to temperature')
                    + '  ·  keep below ' + rpmText(st.limit) + ' rpm until warm' };
            }
            const wait = 'Waiting for ' + list(st.waiting);
            if (st.overall === 'off') return { title: 'Engine off', note: wait, color: 'dim' };
            return {
                title: 'Warming up', color: 'warn',
                // the advice first: keep below the limit until warm
                note: (st.limit > 0 ? 'Keep below ' + rpmText(st.limit) + ' rpm until warm  ·  ' + wait.charAt(0).toLowerCase() + wait.slice(1) : wait)
                    + (G.isNum(st.min) ? '  ·  ' + (st.capped ? 'over ' : 'about ') + mins(st.min) + ' min' : ''),
            };
        }

        /** One fluid: its dial, its state and the workshop's two numbers. */
        function drawFluid(cv, t, k, f) {
            const cx = CX[k], sc = SCALE[isF() ? 'f' : 'c'], used = f.state !== 'unused';
            Faces.dial(cv, t, cx, 284, 158, {
                key: 'warm-' + k, value: used ? T(f.temp) : null, min: sc.min, max: sc.max, major: sc.major, minor: sc.minor,
                label: NAMES[k], unit: tU(), decimals: 0, holdMs: 500, endLabels: false,
                bands: used ? [{ from: sc.min, to: T(f.ready), color: 'cold' }, { from: T(f.ready), to: T(f.hot), color: GO }, { from: T(f.hot), to: sc.max, color: 'crit' }] : [],
                color: stateColor(t, f.state), needleColor: 'text', brand: settings.get('branding'),
            });
            const s = stateText(t, k, f), line = s.line, col = s.col, sub = s.sub || 'safe from ' + deg(f.ready) + '  ·  too hot above ' + deg(f.hot);
            // (the two lines end 16 px over the page's bottom: on iDrive 8 the climate bar starts right under the page)
            cv.text(line, cx, 481, 24, col, { align: 'center', font: 'bold', spacing: 2, literal: true });
            cv.text(sub, cx, 504, 18, t.dim, { align: 'center' });
        }

        /** A fluid's state in words: { line, col, sub }. */
        function stateText(t, k, f) {
            let line, col = t.text, sub = '';
            // (ready without a reading: the gearbox, counted on its last one; the number is not drawn as live)
            if (f.state === 'ready') { line = '✓  READY'; col = GO; if (f.temp === null) sub = 'on its last reading, ' + deg(f.last); }
            else if (f.state === 'hot') { line = 'TOO HOT'; col = t.crit; }
            else if (f.state === 'dip') { line = 'BELOW ' + deg(f.ready); sub = 'dipped after the warm-up'; }
            // (no figure until enough has been measured)
            else if (f.state === 'warming') line = f.min === null ? 'WARMING UP' : 'READY IN ' + (f.capped ? 'OVER ' : 'ABOUT ') + mins(f.min) + ' MIN';
            else if (f.state === 'stalled') { line = 'NOT WARMING'; col = t.warn; }
            else if (f.state === 'off') { line = 'ENGINE OFF'; col = t.dim; }
            else if (f.state === 'unused') { line = 'NOT MONITORED'; col = t.dim; sub = 'switched off in Workshop settings'; }
            else { line = 'NO READING'; col = t.dim; sub = 'no ' + NAMES[k].toLowerCase() + ' temperature reading'; }
            return { line, col, sub };
        }

        /** One fluid as a horizontal gauge: its name and state, the bar with the two limits marked, the temperature. */
        function drawFluidBar(cv, t, k, f) {
            const x = 24, y = ROW_Y[k], used = f.state !== 'unused', has = used && f.temp !== null;
            const min = T(0), max = T(150), step = isF() ? 9 : 5, s = stateText(t, k, f);
            cv.roundRect(x, y, ROWS_W, ROW_H, 8, withAlpha('#b4bccc', 0.06));
            cv.fillRect(x, y, 6, ROW_H, has ? stateColor(t, f.state) : t.tick);
            cv.text(NAMES[k].toUpperCase(), x + 28, y + 44, 22, t.dim, { font: 'bold', spacing: 2 });
            cv.text(s.line, x + 28, y + 80, 22, s.col, { font: 'bold', spacing: 1.5, literal: true });
            if (s.sub) cv.text(s.sub, x + 28, y + 108, 17, t.dim);
            // two limits close together: their numbers go to either side of their ticks
            const close = (f.hot - f.ready) / 150 * BAR_W < 72;
            Faces.hbar(cv, t, BAR_X, y + 30, BAR_W, BAR_H, {
                key: 'warm-' + k, value: has ? T(f.temp) : null, min, max, step, color: stateColor(t, f.state),
                zones: used ? [{ from: min, to: T(f.ready), color: 'cold' }, { from: T(f.ready), to: T(f.hot), color: GO }, { from: T(f.hot), to: max, color: 'crit' }] : [],
                marks: used ? [{ value: T(f.ready), text: deg(f.ready), color: GO, align: close ? 'right' : 'center' },
                    { value: T(f.hot), text: deg(f.hot), color: 'crit', align: close ? 'left' : 'center' }] : [],
            });
            const rx = x + ROWS_W - 26, uw = cv.textWidth(' ' + tU(), 24);
            cv.text(' ' + tU(), rx, y + 86, 24, t.dim, { align: 'right' });
            cv.text(has ? G.fmt(G.hold('warm-n-' + k, T(f.temp), 500), 0) : '--', rx - uw, y + 88, 68, !has ? t.dim : f.state === 'hot' ? t.crit : t.text, { align: 'right', font: 'num', literal: true });
        }

        /** Beside the bars: the full Proven logo, then the rev limit with the live revs and the time to ready, or the state. */
        function drawSide(cv, t, st, d) {
            const x = SIDE.x, w = SIDE.w, cx = x + w / 2, iw = w - 56, ix = x + 28;
            cv.roundRect(x, G.TOP, w, G.BOTTOM - 4 - G.TOP, 8, withAlpha('#b4bccc', 0.06));
            let y = G.TOP + 8;
            if (settings.get('branding')) {
                y += 14 + Logo.draw(cv, ix, y + 14, iw, 'full') + 20;
                cv.fillRect(ix, y, iw, 2, withAlpha('#ffffff', 0.1));
            }
            const mid = (text, yy, size, col, opt) => cv.text(text, cx, yy, size, col, Object.assign({ align: 'center', font: 'bold', spacing: 2 }, opt));
            // a number with a small unit after it, centred as one
            const pair = (num, unit, yy, ns, us, col) => {
                const nw = cv.textWidth(num, ns, { font: 'num', literal: true }), uw = cv.textWidth(' ' + unit, us), left = cx - (nw + uw) / 2;
                cv.text(num, left, yy, ns, col, { font: 'num', literal: true });
                cv.text(' ' + unit, left + nw, yy, us, t.dim);
            };
            const lamp = (yy, col, mark) => {
                cv.arc(cx, yy, 46, 54, 0, 360, col); cv.arc(cx, yy, 54, 66, 0, 360, withAlpha(col, 0.16));
                if (mark === 'tick') { cv.line(cx - 23, yy + 2, cx - 7, yy + 18, 9, col); cv.line(cx - 7, yy + 18, cx + 25, yy - 18, 9, col); }
                else { cv.line(cx, yy - 24, cx, yy + 6, 9, col); cv.circle(cx, yy + 22, 5.5, col); }
            };
            const room = G.BOTTOM - 4 - y;
            if (st.overall === 'warming') {
                const rev = st.limit > 0 && G.isNum(d.rpm), c = st.over ? t.crit : t.text;
                if (rev) {
                    mid(st.over ? 'EASE OFF' : 'KEEP BELOW', y + 36, 18, st.over ? t.crit : t.dim);
                    pair(rpmText(st.limit), 'rpm', y + 84, 46, 22, c);
                    Faces.hbar(cv, t, ix, y + 100, iw, 26, {
                        key: 'warm-rev', value: d.rpm, min: 0, max: st.limit * 1.5, step: st.limit / 8, color: st.over ? 'crit' : 'text',
                        zones: [{ from: st.limit, to: st.limit * 1.5, color: 'crit' }], marks: [{ value: st.limit, color: 'crit' }],
                    });
                    pair(rpmText(G.hold('warm-rpm', d.rpm, 200)), 'rpm now', y + 168, 28, 18, c);
                    cv.fillRect(ix, y + 188, iw, 2, withAlpha('#ffffff', 0.1));
                }
                const y2 = rev ? y + 188 : y + (room - 110) / 2;
                if (G.isNum(st.min)) { mid(st.capped ? 'READY IN OVER' : 'READY IN ABOUT', y2 + 34, 18, t.dim); pair(mins(st.min), 'min', y2 + 92, 56, 24, t.text); }
                else mid('WARMING UP', y2 + 64, 24, t.warn);
            } else if (st.overall === 'ready') {
                lamp(y + room / 2 - 30, GO, 'tick'); mid('UP TO TEMPERATURE', y + room / 2 + 72, 21, GO, { spacing: 1.5 });
            } else if (st.overall === 'hot') {
                lamp(y + room / 2 - 44, t.crit, 'warn'); mid('TOO HOT', y + room / 2 + 62, 30, t.crit);
                cv.text('Ease off and let it cool', cx, y + room / 2 + 94, 19, t.dim, { align: 'center' });
            } else {
                mid(st.overall === 'off' ? 'ENGINE OFF' : 'NO DATA', y + room / 2 + 4, 24, t.dim);
                if (st.overall === 'nodata' && !d.demo) cv.text('waiting for the car', cx, y + room / 2 + 34, 19, t.dim, { align: 'center' });
            }
        }

        /** "Up to temperature", over the screen for ANNOUNCE_MS. */
        function drawAnnounce(cv, t, age, st) {
            const a = G.clamp(Math.min(age / 300, (ANNOUNCE_MS - age) / 500), 0, 1), cx = W / 2, cy = 146, brand = settings.get('branding');
            const dy = brand ? 0 : 50;                                  // without the logo the rest sits lower
            cv.fillRect(0, G.BAR_H, W, H - G.BAR_H, withAlpha('#000000', 0.9 * a));
            cv.arc(cx, cy + dy, 56, 66, 0, 360, withAlpha(GO, a));
            cv.arc(cx, cy + dy, 66, 80, 0, 360, withAlpha(GO, 0.16 * a));
            cv.line(cx - 28, cy + dy + 2, cx - 8, cy + dy + 22, 10, withAlpha(GO, a));
            cv.line(cx - 8, cy + dy + 22, cx + 30, cy + dy - 22, 10, withAlpha(GO, a));
            cv.text('UP TO TEMPERATURE', cx, 286 + dy, 52, withAlpha('#ffffff', a), { align: 'center', font: 'bold', spacing: 5 });
            // a gearbox that is left out, or counted on its last reading, is named here too, as on the status line
            cv.text(readyNote(st), cx, 328 + dy, 24, withAlpha(t.dim, a), { align: 'center' });
            // the full logo (PROVEN / PERFORMANCE / SOLUTIONS)
            if (brand && a > 0.5) Logo.draw(cv, cx - 170, 364, 340, 'full');
        }

        let announceAt = 0, lastAnnounce = -Infinity;
        async function render() {
            const t = ctx.theme(), now = mono(), d = src.data(), st = warm.status(now);
            // (a frame after a pause: the screen was just opened)
            if (now - drawnAt > OPENED_MS) openedAt = now;
            drawnAt = now;
            // the announcement is taken every frame, and shown only while it is news: the car is ready now, became so
            // in the last ANNOUNCE_FRESH_MS (not minutes later, when the screen is next opened), and it was not
            // already shown in the last ANNOUNCE_AGAIN_MS
            const due = warm.announce();
            if (due && settings.get('announce') && st.overall === 'ready' && st.readyAt !== null && now - st.readyAt < ANNOUNCE_FRESH_MS
                && now - lastAnnounce > ANNOUNCE_AGAIN_MS) { announceAt = lastAnnounce = now; log.info('up to temperature: announced'); }
            if (st.overall !== 'ready') announceAt = 0;        // no longer true: taken off, and it does not come back
            const cv = ctx.canvas(W, H).clear(t.bg);
            if (settings.get('gaugeStyle') === 'dials') {
                // status line; on its right the revs against the limit while warming up
                Faces.statusStrip(cv, t, 24, G.TOP, 1552, 56, headline(st, d));
                if (st.overall === 'warming' && st.limit > 0 && G.isNum(d.rpm)) {
                    const lw = cv.text(' / ' + rpmText(st.limit) + ' rpm', 1556, G.TOP + 38, 22, t.dim, { align: 'right' });
                    cv.text(rpmText(G.hold('warm-rpm', d.rpm, 200)), 1556 - lw, G.TOP + 40, 36, st.over ? t.crit : t.text, { align: 'right', font: 'num', literal: true });
                }
                FLUIDS.forEach((k) => drawFluid(cv, t, k, st.fluids[k]));
            } else {
                // horizontal bars: status line and three bars on the left, the brand column on the right
                Faces.statusStrip(cv, t, 24, G.TOP, ROWS_W, 56, headline(st, d));
                FLUIDS.forEach((k) => drawFluidBar(cv, t, k, st.fluids[k]));
                drawSide(cv, t, st, d);
            }
            // (taken off at once if the car stops being ready while it shows, so it never covers "Too hot")
            if (announceAt && now - announceAt < ANNOUNCE_MS && st.overall === 'ready') drawAnnounce(cv, t, now - announceAt, st);
            G.frame(cv, t, ['Warm-up'], 0, [(d.demo || fedDemo()) && { text: 'DEMO' }]);
            await ui.image('MAIN_GFX', cv);
        }

        /* ---------- home-screen widget ----------
         * Layout and cells as the kit's eDrive widget (BMW's Drive Recorder widget layout): the big widget shows the
         * drawn picture, the small one the layout's own text lines and progress bar. */
        const wcan = {}, wtext = {};
        const word = (st) => ({ ready: 'UP TO TEMPERATURE', hot: 'TOO HOT', warming: st.over ? 'EASE OFF' : 'WARMING UP', off: 'ENGINE OFF', nodata: 'NO DATA' }[st.overall]);
        const wordColor = (t, st) => (st.overall === 'ready' ? GO : st.overall === 'hot' || st.over ? t.crit : st.overall === 'warming' ? t.warn : t.dim);
        const progress = (st) => { const p = FLUIDS.filter((k) => st.fluids[k].counted).map((k) => st.fluids[k].progress); return p.length ? Math.min.apply(null, p) : 0; };
        /**
         * The small widget's text lines. Each cell of the layout shows about 20 characters (the kit's eDrive), and a
         * line cut short would read as another temperature: every line is 20 or fewer, also with three-digit and
         * Fahrenheit values, so the unit is in the title and the three temperatures have no spaces to spare.
         */
        function widgetLines(st) {
            const n = (k) => (st.fluids[k].temp === null ? '--' : String(Math.round(T(st.fluids[k].temp))));
            const dip = FLUIDS.filter((k) => st.fluids[k].state === 'dip')[0];
            return {
                // demo data is marked, so invented temperatures are never taken for the car's
                // (widget text cells take plain ASCII)
                Title: 'Warm-Up' + (demoShown() ? ' DEMO' : '') + (isF() ? ', deg F' : ', deg C'),
                TextRecordings: word(st),
                TextCam: 'Oil' + n('oil') + ' Gbx' + n('gearbox') + ' Clt' + n('coolant'),
                // (once the car is called ready: a fluid that has dipped, a gearbox that is left out or counted on its
                // last reading)
                TimeElapsed: st.limit > 0 && st.overall === 'warming' ? 'below ' + st.limit + ' rpm'
                    : st.overall !== 'ready' ? '' : dip ? NAMES[dip].toLowerCase() + ' dipped' : st.unwatched.length ? 'no gearbox temp' : st.held.length ? 'old gearbox temp' : '',
                TimeRemaining: G.isNum(st.min) ? (st.capped ? '>' : '~') + mins(st.min) + ' min' : '',
            };
        }
        function widgetCells(inst, st) {
            const on = !inst.big, lines = on ? widgetLines(st) : {};
            const cells = {
                Title: [lines.Title || '', 'Text'],
                TextRecordings: [lines.TextRecordings || '', 'Text'],
                TextCam: [lines.TextCam || '', 'Text'],
                ProgressbarVisible: [on, 'Bool'],
                Progress: [on ? Math.round(progress(st) * 100) / 100 : 0, 'Float'],
                TimeElapsed: [lines.TimeElapsed || '', 'Text'],
                TimeRemaining: [lines.TimeRemaining || '', 'Text'],
            };
            const prev = wtext[inst.spawnId] || (wtext[inst.spawnId] = {});
            Object.keys(cells).forEach((k) => {
                const v = JSON.stringify(cells[k][0]);
                if (prev[k] === v) return;
                prev[k] = v;
                ctx.widget.set(inst.spawnId, k, cells[k][0], cells[k][1]);
            });
        }
        function renderWidget(inst) {
            const sw = ctx.spec.startWidget || {}, [w, h] = sw.size || [384, 256], scale = sw.scale || 1;
            const st = warm.status(mono()), t = ctx.theme();
            if (inst) widgetCells(inst, st);
            const cv = (wcan[w + 'x' + h] = wcan[w + 'x' + h] || new ScaledCanvas(w, h, scale)).clear([0, 0, 0, 0]);
            // the HMI crops and fades the picture's edges: everything stays inside the safe box
            const sf = sw.safe || [0.09, 0.17], x0 = Math.round(w * sf[0]), y0 = Math.round(h * sf[1]), x1 = w - x0, y1 = h - y0, iw = x1 - x0;
            cv.text(word(st), x0, y0 + 18, 18, wordColor(t, st), { font: 'bold', spacing: 1.5 });
            // the unit, once, at the end of the top line (the numbers below carry a bare degree sign)
            const uw = cv.text(tU(), x1, y0 + 18, 16, t.dim, { font: 'bold', align: 'right', literal: true });
            if (G.isNum(st.min)) cv.text((st.capped ? '>' : '~') + mins(st.min) + ' min', x1 - uw - 8, y0 + 18, 18, t.text, { font: 'bold', align: 'right' });
            const gap = 10, cw = (iw - gap * 2) / 3;
            FLUIDS.forEach((k, i) => {
                const f = st.fluids[k], x = x0 + i * (cw + gap), c = stateColor(t, f.state);
                cv.text(SHORT[k], x, y0 + 46, 12, t.dim, { font: 'bold', spacing: 1 });
                const vw = cv.text(f.temp === null || f.state === 'unused' ? '--' : String(Math.round(T(f.temp))), x, y0 + 92, 42, f.temp === null ? t.dim : f.state === 'ready' ? GO : f.state === 'hot' ? t.crit : t.text, { font: 'num', literal: true });
                cv.text('°', x + vw + 2, y0 + 74, 18, t.dim, { literal: true });
                cv.roundRect(x, y0 + 104, cw, 8, 4, withAlpha(t.track, 0.95));
                if (f.progress > 0.02) cv.roundRect(x, y0 + 104, cw * f.progress, 8, 4, c);
                // (ready without a reading: the gearbox on its last one, which is named as that)
                cv.text(f.state === 'ready' ? (f.temp === null ? 'LAST ' + Math.round(T(f.last)) + '°' : 'READY') : f.state === 'hot' ? 'TOO HOT' : f.state === 'unused' ? 'OFF' : f.state === 'none' ? 'NO READING'
                    : (f.state === 'dip' ? 'BELOW ' : 'from ') + Math.round(T(f.ready)) + '°',
                    x, y0 + 130, 12, f.state === 'ready' ? GO : f.state === 'hot' ? t.crit : t.dim, { font: 'bold', spacing: 0.5, literal: true });
            });
            // demo data is marked where the logo otherwise is, so invented temperatures are never taken for the car's
            // (no logo with the "Proven logo" setting off, as on the screen)
            if (demoShown()) cv.text('DEMO DATA', x0 + iw / 2, y1 - 2, 13, t.warn, { align: 'center', font: 'bold', spacing: 2 });
            else if (settings.get('branding')) Logo.paint(cv, x0 + (iw - 84) / 2, y1 - 14, 84, 'word');
            return cv.canvas;
        }
        if (ctx.widget) {
            ctx.widget.loop(() => 2, renderWidget);
            ctx.widget.onChange((why) => { if (why === 'resized' || why === 'placed') Object.keys(wtext).forEach((k) => delete wtext[k]); });
        }

        // every screen refresh (60 fps) with the GPU renderer; 5 fps in software
        ctx.loop('MAIN', 5, render);
        tick();
        log.info('Proven Warm-Up: first render');
        render().catch((e) => log.warn('first render: ' + e));
    },
});
