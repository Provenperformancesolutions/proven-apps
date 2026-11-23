'use strict';
/**
 * Proven Drag - Proven Performance Solutions' standing-start timer for BMW iDrive 7 and iDrive 8 (MGU):
 * 0-100 km/h, 60 ft, 1/8 mile and 1/4 mile with trap speeds, timed from the car's own speed signal.
 * For closed roads and track days only. BETA: nothing in this app has been on a car yet, and every screen
 * says so (a BETA badge beside the tabs; the Timeslip spells it out).
 *
 * Four tabs (touch a tab, or "Next page" / "Previous page"):
 *   Run       speed now, the clock, STOP TO ARM / READY / TIMING / RUN FINISHED (ARMED, NO NEW SPEED on
 *             a car that only notifies its speed, while it stands), the four results each with its +- and
 *             the best, and a strip: start convention, speed scale, data rate, wheelspin, start slope, flags
 *   Timeslip  the last run as a slip: 60 ft, 330 ft, 1/8 mile and trap, 1000 ft, 1/4 mile and trap,
 *             0-100, peak g, wheelspin, start slope, height change, scale, data quality, flags, date
 *   Best      best per split for the start convention in use, and the last runs. "Reset best" asks twice
 *   Signals   the workshop's page: every source with its rate and longest gap, raw wheel values and
 *             learned factors, the GPS speed scale, the car's road gradient, the standing slope.
 *             "Reset calibration" asks twice (with "Workshop settings" on)
 *
 * How to use it: stop the car. After one second standing the screen says READY (or ARMED). Launch: the clock starts
 * at the first movement. The run ends when you lift (5 km/h under its top speed), at the 1/4 mile, or
 * after 60 s. The results stay until the next launch.
 *
 * The parts:
 *   car.js       the car's signals: subscriptions, two getters read on a schedule, one event. Read only
 *   session.js   what happens with a sample, and what a finished run becomes
 *   run.js, feed.js, gpsscale.js, wheels.js, slope.js, steady.js    the timing logic (pure, tested alone)
 *   store.js     the saved file (pps_drag.json): bests, the last 30 runs, the two calibrations
 *   heldlog.js   the log, held back while a run is timed (a file write would stamp a sample late)
 *   screens.js   the four tabs       demo.js   the made-up launch of demo mode
 *
 * READ ONLY: this app subscribes to signals, reads two getters and subscribes to one event. It writes no
 * signal, calls no method and does not use the diagnostic link.
 * TIME: everything that times a run is on process.hrtime (it only runs forward). Date.now() is used for
 * the date on a saved run and nothing else: the head unit sets that clock from GPS and it can jump.
 *
 * Built on the idrive7-apps kit (MIT): kit/runtime draws the screens and builds them for iDrive 7 and
 * iDrive 8 from app.json. Colours: proven-theme.js. Logo: logo.js.
 */
require('./proven-theme').register();
const mgu = require('./kit/mgu');
const { withAlpha } = require('./kit/canvas');
const G = require('./kit/gauges');
const Logo = require('./logo');
const { Store } = require('./store');
const { HeldLog } = require('./heldlog');
const { Session } = require('./session');
const { CarSide } = require('./car');
const Screens = require('./screens');

const W = 1600, H = 520;
const TICK_MS = 50;                    // the engines' idle clock, the poll periods, the demo feed
const SPLASH_MS = 1400, FADE_MS = 450; // the start-up logo, then the page fades in
const ARMED_MS = 5000;                 // "Reset best" / "Reset calibration" must be pressed again within this
const LABEL = { run: 'Reset run', best: 'Reset best', cal: 'Reset calibration' };
const YES = { best: 'Yes, clear all', cal: 'Yes, reset' };     // ("Reset best" clears the best times AND the list of runs, as the kit's Drag Timer does)
// a clock that only moves forward (ms)
const mono = () => { const h = process.hrtime(); return h[0] * 1000 + h[1] / 1e6; };

mgu.run({
    async start(ctx) {
        const { ui, settings } = ctx;
        // every line the app logs goes through this: it is held back while a run is timed (heldlog.js)
        const log = new HeldLog(ctx.log, mono);
        const store = new Store({ dir: ctx.dataDir, log });
        const session = new Session({ now: mono, wall: () => Date.now(), log, settings, store });
        const car = new CarSide({ signals: ctx.signals, log, session, scaling: ctx.spec.config && ctx.spec.config.scaling, now: mono });
        let page = 0;
        const visible = () => { try { return !!ui.isVisible('MAIN'); } catch (e) { return true; } };
        // which of the kit's two ways draws the screen right now (the software one takes far longer per frame, and
        // nothing else runs meanwhile): it goes into each run's record
        const renderer = () => { try { return ctx.display && typeof ctx.display.active === 'function' ? (ctx.display.active('MAIN') ? 'GPU renderer' : 'software renderer') : null; } catch (e) { return null; } };

        // (the kit does not guard a timer an app starts itself, and an uncaught error would stop the app:
        // an error that keeps coming is logged the first time and then once a minute)
        let tickErr = 0;
        setInterval(() => {
            try {
                const now = mono(), on = visible();
                session.tick(now, { hidden: !on, signalsPage: on && page === 3, renderer: on ? renderer() : 'nothing (screen hidden)' });
                car.tick(now);
            } catch (e) { if (tickErr++ % 1200 === 0) log.warn('tick (' + tickErr + 'x): ' + (e && e.stack || e)); }
        }, TICK_MS);
        car.start();

        /* ---------- buttons ---------- */
        // the bar's first button follows the page: Reset run / Reset best / Reset calibration (the last two ask twice)
        let armed = null, armedTimer = null;
        const actionOf = () => (page === 2 ? 'best' : page === 3 && settings.get('workshop') ? 'cal' : 'run');
        const label = () => { try { const a = actionOf(); Promise.resolve(ui.text('BTN_ACTION', armed === a ? YES[a] : LABEL[a])).catch(() => {}); } catch (e) { /* no bar here */ } };
        const disarm = () => { if (armedTimer) clearTimeout(armedTimer); armed = null; armedTimer = null; };
        function act(what) {
            if (what === 'run') { disarm(); session.resetRun(); label(); return render(); }
            if (armed !== what) {
                disarm();
                armed = what;
                armedTimer = setTimeout(() => { armed = null; armedTimer = null; label(); }, ARMED_MS);
                label();
                return render();
            }
            disarm();
            if (what === 'best') session.resetBest(); else session.resetCalibration();
            label();
            return render();
        }
        // the same on the page, where the kit runs the screen (elsewhere the HMI's bar has the button)
        const pageUi = {
            button(cv, t, x, y, w, h, text, what) {
                if (what === 'run') return G.button(cv, t, x, y, w, h, text, () => act('run'), { key: 'reset-run', confirm: true });
                const hot = armed === what;
                return G.button(cv, t, x, y, w, h, hot ? YES[what] : text, () => act(what), { key: 'reset-' + what, color: hot ? t.crit : null });
            },
        };

        /* ---------- frame ---------- */
        // Start-up logo: the first time the app is opened after a start of the head unit, the logo alone
        // for SPLASH_MS, then the page fades in over FADE_MS.
        let shownAt = 0, drawn = 0;
        async function render() {
            const t = ctx.theme(), now = mono(), age = shownAt ? now - shownAt : Infinity;
            const badges = [{ text: 'BETA' }, session.demoOn && { text: 'DEMO' }];
            if (age < SPLASH_MS) {
                const cv = ctx.canvas(W, H).clear('#000000'), lw = 760, z = Logo.size(lw, 'full');
                Logo.draw(cv, (W - lw) / 2, G.TOP + (G.BOTTOM - G.TOP - z.h) / 2, lw, 'full');
                G.frame(cv, t, Screens.TABS, page, badges);
                await ui.image('MAIN_GFX', cv);
                return;
            }
            const cv = ctx.canvas(W, H).clear(t.bg), v = session.view(now);
            if (page === 0) Screens.run(cv, t, v, pageUi);
            else if (page === 1) Screens.slip(cv, t, v);
            else if (page === 2) Screens.best(cv, t, v, pageUi);
            else {
                Screens.signals(cv, t, Object.assign(session.signalsView(now), {
                    sources: car.status(), car: car.live, workshop: !!settings.get('workshop'), slopeLimit: settings.get('slopeLimit'),
                }), pageUi);
            }
            if (age < SPLASH_MS + FADE_MS) cv.fillRect(0, G.BAR_H, W, H - G.BAR_H, withAlpha('#000000', 1 - (age - SPLASH_MS) / FADE_MS));
            G.frame(cv, t, Screens.TABS, page, badges);
            if (!drawn++) log.info('first frame drawn');
            await ui.image('MAIN_GFX', cv);
        }

        const go = (i) => { page = (i + Screens.TABS.length) % Screens.TABS.length; disarm(); label(); return render(); };
        ui.onClick('BTN_PAGE', () => go(page + 1));
        ui.onClick('BTN_PREV', () => go(page - 1));
        ui.onClick('BTN_ACTION', () => act(actionOf()));
        ctx.hideButton('BTN_ACTION');                   // on the page where the kit runs the screen (pageUi)
        ctx.onTab((i) => go(i));
        settings.onChange((k) => {
            if (k === 'speedUnit' || k === 'start') session.configure();
            if (k === 'workshop') { disarm(); label(); }
        });
        // every screen refresh (60 fps) with the GPU renderer; 10 fps in software (PNG frames). The timing does
        // not depend on it: samples are taken in the signal handlers and the 50 ms tick, screen or no screen
        ctx.loop('MAIN', 10, () => { if (!shownAt) shownAt = mono() || 1; return render(); });
        log.info('Proven Drag: started, clock starts "' + settings.get('start') + '", speed scale "' + settings.get('scale') + '", demo data "' + settings.get('demo') + '"');
        render().catch((e) => log.warn('first render: ' + e));
    },
});
