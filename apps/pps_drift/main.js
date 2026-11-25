'use strict';
/**
 * Proven Drift - Proven Performance Solutions' drift read-out for BMW iDrive 7 and iDrive 8 (MGU): the
 * car's drift angle live on a drawn car, a score for every drift, and the data of each drift, of the
 * session and of the all-time bests. From the car's own motion sensors.
 * FOR CLOSED CIRCUITS AND SKID PANS ONLY. BETA: nothing in this app has been on a car yet, and every screen
 * says so (a BETA badge beside the tabs; the first screen and the Last tab spell it out). The angle is an
 * estimate everywhere.
 *
 * Five tabs (touch a tab, or "Next page" / "Previous page"). Nothing on them needs a touch while driving:
 *   Drift     the drawn car turned by the drift angle against the way it travels, the angle with LEFT /
 *             RIGHT and its +-, the speed, the running drift's score, multiplier and time, bars for
 *             opposite lock, pedal and rear wheelspin, the banner (LEARNING THE CAR, READY, DRIFT, SWITCH,
 *             SPIN, DRIFT ENDED, NO YAW RATE FROM THE CAR, TOO SLOW, GO STRAIGHT FOR A MOMENT), the session
 *             in a strip, and a line that says so while no drift can be a best for want of a steering check
 *   Last      the last drift: all its data, the trace of angle and speed, its flags in words
 *   Session   this session's totals and its drifts
 *   Best      the all-time bests and the saved list
 *   Signals   the workshop's page: every source with its state and rate, what was learned about the car,
 *             the study-only raw values, the GPS check. Made so that one photo of it tells what a car gives
 *
 * The parts:
 *   car.js       the car's signals: subscriptions, getters read on a schedule, one event. Read only
 *   session.js   what happens with a sample, the session's totals, what a finished drift becomes
 *   drift.js, angle.js, learn.js, score.js, series.js    the engine (pure, tested alone: test_drift.js)
 *   feed.js, gpscheck.js    the bookkeeping around the feed; the GPS speed as a cross-check (pure)
 *   store.js     the saved file (pps_drift.json): bests, the last 30 drifts, what was learned about the car
 *   heldlog.js   the log, held back while a drift runs (a file write would stamp a sample late)
 *   screens.js   the five tabs and the first screen       demo.js   the made-up drive of demo mode
 *
 * READ ONLY: this app subscribes to signals, reads getters and subscribes to one event. It writes no
 * signal, calls no method and does not use the diagnostic link. It never touches DSC, traction control,
 * the handbrake or any driving setting, and no text of it tells the driver to switch anything off.
 * TIME: everything in the measuring path is on process.hrtime (it only runs forward). Date.now() is used
 * for the date on a saved drift and nothing else: the head unit sets that clock from GPS and it can jump.
 * NOTHING LEAVES THE CAR: no network, no sharing. No position, course or heading is saved or logged.
 *
 * Built on the idrive7-apps kit (MIT): kit/runtime draws the screens and builds them for iDrive 7 and
 * iDrive 8 from app.json. Colours: proven-theme.js. Logo: logo.js.
 */
require('./proven-theme').register();
const mgu = require('./kit/mgu');
const { withAlpha } = require('./kit/canvas');
const G = require('./kit/gauges');
const { Store } = require('./store');
const { HeldLog } = require('./heldlog');
const { Session } = require('./session');
const { CarSide } = require('./car');
const Screens = require('./screens');

const W = 1600, H = 520;
const TICK_MS = 50;                    // the engine's idle clock, the poll periods, the demo feed
const SPLASH_MS = 2600, FADE_MS = 450; // the first screen (logo, CLOSED COURSE ONLY), then the page fades in
const ARMED_MS = 30000;                // a reset in Settings must be confirmed within this
const SIGNALS_PAGE = 4;
/** The settings the engine works with: a change of one goes to it at once. */
const ENGINE_KEYS = ['startAngle', 'minSpeed', 'chassis', 'wheelbase', 'useSteer', 'useLong', 'yawSource', 'steerSource'];
// a clock that only moves forward (ms)
const mono = () => { const h = process.hrtime(); return h[0] * 1000 + h[1] / 1e6; };

mgu.run({
    async start(ctx) {
        const { ui, settings } = ctx;
        // every line the app logs goes through this: it is held back while a drift runs (heldlog.js)
        const log = new HeldLog(ctx.log, mono);
        const store = new Store({ dir: ctx.dataDir, log });
        const session = new Session({ now: mono, wall: () => Date.now(), log, settings, store });
        const car = new CarSide({ signals: ctx.signals, log, session, scaling: ctx.spec.config && ctx.spec.config.scaling, now: mono });
        let page = 0;
        const visible = () => { try { return !!ui.isVisible('MAIN'); } catch (e) { return true; } };

        // (the kit does not guard a timer an app starts itself, and an uncaught error would stop the app:
        // an error that keeps coming is logged the first time and then once a minute)
        let tickErr = 0;
        setInterval(() => {
            try {
                const now = mono(), on = visible();
                session.tick(now, { hidden: !on, signalsPage: on && page === SIGNALS_PAGE });
                car.tick(now);
            } catch (e) { if (tickErr++ % 1200 === 0) log.warn('tick (' + tickErr + 'x): ' + (e && e.stack || e)); }
        }, TICK_MS);
        car.start();

        /* ---------- the two resets in Settings ---------- */
        // "Reset what was learned" and "Reset bests" are settings with three values: No, Confirm, Reset now. A reset
        // happens when "Reset now" is chosen while the setting stands at Confirm, so it always takes two steps: where
        // the head unit steps a setting on with each press (No, Confirm, Reset now), and where it offers a list (the
        // first choice of "Reset now" only arms it and shows Confirm). Armed for 30 s, then it falls back to No.
        const RESET = { resetLearned: () => session.resetLearned(), resetBest: () => session.resetBest() };
        const armed = {};
        const later = (fn) => Promise.resolve().then(fn).catch((e) => log.warn('settings: ' + (e && e.stack || e)));
        const disarm = (k) => { if (armed[k]) clearTimeout(armed[k]); armed[k] = null; };
        const arm = (k) => { disarm(k); armed[k] = setTimeout(() => { armed[k] = null; if (settings.get(k) !== 'no') settings.set(k, 'no'); }, ARMED_MS); };
        function reset(k, value) {
            if (value === 'go') {
                if (armed[k]) { disarm(k); RESET[k](); later(() => settings.set(k, 'no')); later(() => render()); return; }
                arm(k);
                later(() => settings.set(k, 'arm'));
            } else if (value === 'arm') { if (!armed[k]) arm(k); } else disarm(k);
        }
        // (a reset left half way when the app was last closed starts again at No)
        Object.keys(RESET).forEach((k) => { if (settings.get(k) !== 'no') settings.set(k, 'no'); });

        /* ---------- frame ---------- */
        // The first screen: the first time the app is opened after a start of the head unit, the logo with
        // CLOSED COURSE ONLY for SPLASH_MS, then the page fades in over FADE_MS.
        let shownAt = 0, drawn = 0;
        async function render() {
            const t = ctx.theme(), now = mono(), age = shownAt ? now - shownAt : Infinity;
            const badges = [{ text: 'BETA' }, session.demoOn && { text: 'DEMO' }];
            if (age < SPLASH_MS) {
                const cv = ctx.canvas(W, H).clear('#000000');
                Screens.splash(cv, t);
                G.frame(cv, t, Screens.TABS, page, badges);
                await ui.image('MAIN_GFX', cv);
                return;
            }
            const cv = ctx.canvas(W, H).clear(t.bg), v = session.view(now);
            if (page === 0) Screens.drift(cv, t, v);
            else if (page === 1) Screens.last(cv, t, v);
            else if (page === 2) Screens.session(cv, t, v);
            else if (page === 3) Screens.best(cv, t, v);
            else Screens.signals(cv, t, Object.assign(session.signalsView(now), { sources: car.status(), car: car.live }));
            if (age < SPLASH_MS + FADE_MS) cv.fillRect(0, G.BAR_H, W, H - G.BAR_H, withAlpha('#000000', 1 - (age - SPLASH_MS) / FADE_MS));
            G.frame(cv, t, Screens.TABS, page, badges);
            if (!drawn++) log.info('first frame drawn');
            await ui.image('MAIN_GFX', cv);
        }

        const go = (i) => { page = (i + Screens.TABS.length) % Screens.TABS.length; return render(); };
        ui.onClick('BTN_PAGE', () => go(page + 1));
        ui.onClick('BTN_PREV', () => go(page - 1));
        ctx.onTab((i) => go(i));
        settings.onChange((k, value) => {
            if (RESET[k]) { reset(k, value); return; }
            if (ENGINE_KEYS.indexOf(k) >= 0) session.configure();
            // (with the workshop's settings put away, nothing stays armed)
            if (k === 'workshop' && !value) Object.keys(RESET).forEach((r) => { disarm(r); if (settings.get(r) !== 'no') later(() => settings.set(r, 'no')); });
        });
        // every screen refresh (60 fps) with the GPU renderer; 10 fps in software (PNG frames). The angle does not
        // depend on it: samples are taken in the signal handlers and the 50 ms tick, screen or no screen
        ctx.loop('MAIN', 10, () => { if (!shownAt) shownAt = mono() || 1; return render(); });
        log.info('Proven Drift: started, a drift starts at ' + settings.get('startAngle') + ' degrees from ' + settings.get('minSpeed') + ' km/h, chassis "' + settings.get('chassis') +
            '", yaw source "' + settings.get('yawSource') + '", steering source "' + settings.get('steerSource') + '", demo data "' + settings.get('demo') + '"');
        render().catch((e) => log.warn('first render: ' + e));
    },
});
