'use strict';
/**
 * Proven Drift - Proven Performance Solutions' drift read-out for BMW iDrive 7 and iDrive 8 (MGU): the
 * car's drift angle live on a drawn car, a score for every drift, and the data of each drift, of the
 * session and of the all-time bests. From the car's own motion sensors.
 * FOR CLOSED CIRCUITS AND SKID PANS ONLY. BETA: the app is still being tested on cars, and every screen
 * says so (a BETA badge beside the tabs; the first screen and the Last tab spell it out). The angle is an
 * estimate everywhere.
 *
 * 1.0.1, AFTER THE FIRST CAR (proven/CHANGES-drift.md part 9). On the first car the app closed by itself
 * again and again, and nothing found on a PC makes its own code do that. So this version (A) asks nothing
 * of the car, as shipped, that apps known to run on cars do not also ask: no getter reads of its own, only
 * the core signals, every extra behind a Workshop setting that is off (car.js); and (B) keeps a record of
 * every start and stop where the platform's wipe of the data folder does not reach it, and shows it on the
 * Signals tab (box.js), so that the next photo says how the app last stopped and what it was doing.
 *
 * Five tabs, the last with two pages (touch a tab, or "Next page" / "Previous page"; the Signals tab touched again
 * changes between its two pages). Nothing on them needs a touch while driving:
 *   Drift     the drawn car turned by the drift angle against the way it travels, the angle with LEFT /
 *             RIGHT and its +-, the speed, the running drift's score, multiplier and time, bars for
 *             opposite lock and rear wheelspin (no pedal: its form on a car is not known), the banner (LEARNING THE CAR, READY, DRIFT, SWITCH,
 *             SPIN, DRIFT ENDED, NO YAW RATE FROM THE CAR, TOO SLOW, GO STRAIGHT FOR A MOMENT), the session
 *             in a strip, and a line that says so while no drift can be a best for want of a steering check
 *   Last      the last drift: all its data, the trace of angle and speed, its flags in words
 *   Session   this session's totals and its drifts
 *   Best      the all-time bests and the saved list
 *   Signals   the workshop's page: the starts and stops of the app, every source with its state, rate and
 *             raw value, what was learned about the car and what is still missing. Made so that ONE photo
 *             of it tells how the app last stopped and what the car gives
 *             Its second page: what is switched on in Workshop settings, the study-only raw values, the GPS check,
 *             and the accelerator pedal and the four wheel values raw (now, lowest, highest), for a photo
 *
 * The parts:
 *   car.js       the car's signals: the core subscriptions, and each extra only while its setting is on. Read only
 *   box.js       the record of every start and stop, and the app's own memory, processor share and hold-ups
 *   rawstudy.js  the pedal and the wheel values kept raw for a photo; the rule the wheel values must pass (pure)
 *   session.js   what happens with a sample, the session's totals, what a finished drift becomes
 *   drift.js, angle.js, learn.js, score.js, series.js    the engine (pure, tested alone: test_drift.js)
 *   feed.js, gpscheck.js    the bookkeeping around the feed; the GPS speed as a cross-check (pure)
 *   store.js     the saved file (pps_drift.json): bests, the last 30 drifts, what was learned about the car
 *   heldlog.js   the log, held back while a drift runs (a file write would stamp a sample late)
 *   screens.js   the five tabs and the first screen       demo.js   the made-up drive of demo mode
 *
 * READ ONLY: this app subscribes to signals, and (each only with its setting on) reads getters and subscribes to one event. It writes no
 * signal, calls no method and does not use the diagnostic link. It never touches DSC, traction control,
 * the handbrake or any driving setting, and no text of it tells the driver to switch anything off.
 * TIME: everything in the measuring path is on process.hrtime (it only runs forward). Date.now() is used
 * for the date on a saved drift and for the time a start of the app is noted with (box.js), and nothing
 * else: the head unit sets that clock from GPS and it can jump.
 * NOTHING LEAVES THE CAR: no network, no sharing. No position, course or heading is saved or logged, and
 * none is in the record of starts and stops.
 * A FRAME IS HANDED TO THE SCREEN ONLY WHEN SOMETHING ON IT CHANGED: no banner pulses with the clock, and
 * where the kit draws in software a frame that is the same as the last is not handed over at all (the kit
 * would rasterise it first to find that out), but once in 0.9 s. The two Signals pages take what they show
 * about once a second (every 0.9 s, and at once when the page or a setting changes): their sample counts and raw values move
 * with every value the car sends, and the page the owner is asked to photograph was a new picture ten times
 * a second on a standing car.
 * NO SIGNAL IS LISTENED FOR AS SHIPPED. The record can note SIGTERM, SIGHUP and SIGINT (box.js), but a
 * listener changes how the process answers a signal, so it is behind the Workshop setting "Note stop
 * signals", which is off as shipped like every other extra.
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
const { CarSide, GROUPS, INTERFACES } = require('./car');
const { Box, Vitals } = require('./box');
const Screens = require('./screens');

const W = 1600, H = 520;
const TICK_MS = 50;                    // the engine's idle clock, the poll periods, the demo feed
const SPLASH_MS = 2600, FADE_MS = 450; // the first screen (logo, CLOSED COURSE ONLY), then the page fades in
const ARMED_MS = 30000;                // a reset in Settings must be confirmed within this
const SIGNALS_PAGE = 4, STUDY_PAGE = 5, PAGES = 6;      // (pages 4 and 5 are both under the Signals tab)
const NOTE_MS = 2000;                  // the last note of the record of starts and stops is refreshed this often
const RATE_MS = 1000;                  // frames and values a second are worked out over this long at least (a note taken sooner keeps the last figures)
const NOTICE_MS = 60000;               // after a start that follows a stop nobody asked for, the Drift tab says so for this long, counted from when the page first shows (after the first screen)
const SAME_KEEP_MS = 900, LOOP_GAP_MS = 400;   // software frames: one that is the same as the last is handed over once in this long; a loop that paused for this long starts with a frame for sure
const SIGNALS_MS = SAME_KEEP_MS;       // the two Signals pages take what they show this often, about once a second (and at once when the page or a setting changes): in step with the frame that is handed over anyway
/** What is showing, in the record's words (box.js, SHOWS), by tab. */
const PAGE_WORD = ['drift', 'last', 'session', 'best', 'signals', 'study'];
/** The settings that ask more of the car than the core signals (car.js). All off as shipped. */
const GROUP_KEYS = Object.keys(GROUPS);
/** The setting that lets the record listen for SIGTERM, SIGHUP and SIGINT (box.js). Off as shipped: nothing of the car's, but it changes how the process answers a signal. */
const SIG_KEY = 'sigOn', SIG_WORD = 'signals', SIG_NAME = 'Note stop signals';
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
        // (the wall clock, read in this one place: for the date on a saved drift and the time a start is noted with)
        const wall = () => Date.now();
        const session = new Session({ now: mono, wall, log, settings, store });
        const car = new CarSide({ signals: ctx.signals, log, session, settings, scaling: ctx.spec.config && ctx.spec.config.scaling, now: mono });
        let page = 0;
        const visible = () => { try { return !!ui.isVisible('MAIN'); } catch (e) { return true; } };
        // does the GPU renderer show the screen (else the kit draws frames in software)? Not known: software
        const gpu = () => { try { return !!(ctx.display && ctx.display.active && ctx.display.active('MAIN')); } catch (e) { return false; } };

        /* ---------- the record of every start and stop (box.js) ---------- */
        const startT = mono();
        const words = {};
        GROUP_KEYS.forEach((k) => { words[k] = GROUPS[k].word; });
        words[SIG_KEY] = SIG_WORD;
        const onNow = () => GROUP_KEYS.filter((k) => settings.get(k) === true);
        const sigOn = () => settings.get(SIG_KEY) === true;
        /** Every Workshop setting that is off as shipped and on now: what the record lists under "on:". */
        const allOn = () => onNow().concat(sigOn() ? [SIG_KEY] : []);
        const box = new Box({ id: ctx.spec.id, ver: ctx.spec.version, dataDir: ctx.dataDir, tmp: process.env.PPS_BOX_TMP || '/tmp', mono, wall, groups: words, names: Object.keys(INTERFACES).map((k) => INTERFACES[k].name), log });
        box.on(allOn());
        // (the three signals are listened for only with their setting on: as shipped the process answers a signal as 1.0.0 did)
        box.signals(sigOn());
        box.lines().forEach((l) => log.info('starts and stops: ' + l.parts.join(', ')));
        let shownAt = 0, drawn = 0, pushed = 0;

        // The last note of this life: what the app itself can measure, and what it was doing. Taken every 2 s, and at once
        // whenever a setting that asks more of the car is switched or a subscription changes its state, so that a process
        // that dies right after a switch leaves a record that says what was on and how far set-up had got. Frames and
        // values a second are worked out over a second at least: a note taken sooner keeps the figures of the one before.
        let noteErr = 0;
        const vitals = new Vitals({ mono });
        const rates = { t: startT, pushed: 0, arrived: 0, fps: null, nps: null };
        const takeNote = () => {
            try {
                const now = mono(), on = visible(), r = car.reads(), su = car.setup();
                if (now - rates.t >= RATE_MS) {
                    const dt = (now - rates.t) / 1000;
                    rates.fps = Math.round((pushed - rates.pushed) / dt); rates.nps = Math.round((car.counts.arrived - rates.arrived) / dt);
                    rates.t = now; rates.pushed = pushed; rates.arrived = car.counts.arrived;
                }
                box.note(Object.assign(vitals.read(), {
                    fps: rates.fps, path: gpu() ? 'gpu' : 'soft', nps: rates.nps,
                    asked: r.asked, answered: r.answered, show: !on ? 'hidden' : shownAt && now - shownAt < SPLASH_MS ? 'first' : PAGE_WORD[page] || 'drift',
                    state: session.stateWord(), ok: su.ok, want: su.want, failed: su.failed, wait: su.wait, bad: su.bad,
                }), session.quiet());
            } catch (e) { if (noteErr++ % 600 === 0) log.warn('starts and stops (' + noteErr + 'x): ' + (e && e.stack || e)); }
        };
        car.onSetup = takeNote;

        // (the kit does not guard a timer an app starts itself, and an uncaught error would stop the app:
        // an error that keeps coming is logged the first time and then once a minute)
        let tickErr = 0;
        setInterval(() => {
            try {
                const now = mono(), on = visible();
                session.tick(now, { hidden: !on, signalsPage: on && (page === SIGNALS_PAGE || page === STUDY_PAGE) });
                car.tick(now);
            } catch (e) { if (tickErr++ % 1200 === 0) log.warn('tick (' + tickErr + 'x): ' + (e && e.stack || e)); }
        }, TICK_MS);
        car.start();

        vitals.start();
        setInterval(takeNote, NOTE_MS);

        // The platform asks the app to stop: the kit's own listener (kit/runtime/mgu.js) ends the process 200 ms after
        // this event. What is only in memory is written now: first the stop itself into the record in RAM (the
        // quickest), then the saved file, once; then the record's copy in the data folder and the held-back log.
        if (ctx.app && typeof ctx.app.on === 'function') {
            ctx.app.on('shutdown', () => {
                let saved = false;
                try { box.end('asked', null, true); } catch (e) { /* too late to say */ }
                try { saved = session.stopping(); } catch (e) { /* too late to say */ }
                try { box.flush(); } catch (e) { /* too late to say */ }
                try { log.info('stopping: asked to stop by the car. The saved file ' + (saved ? 'is written' : 'could NOT be written')); if (log.set) log.set('write'); if (log.flush) log.flush(); } catch (e) { /* too late to say */ }
            });
        }

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
        // A frame goes to the screen only when something on it changed. With the GPU renderer the kit sees to that
        // itself (it compares what was drawn, and sends one frame a second at least). Where it draws in software it
        // would rasterise every frame first to find out: there the app compares what it drew, and hands a frame that
        // is the same as the last one over only once in 0.9 s.
        let lastWords = null, lastPush = -Infinity, lastCall = -Infinity, fresh = true;
        // What the two Signals pages show, taken about once a second and at once when the page or a setting changes (stale).
        // Between two takes the page is the same picture, and is not handed over again.
        let sig = null, sigAt = -Infinity, stale = true;
        const signalsNow = (now) => {
            if (sig === null || stale || now - sigAt >= SIGNALS_MS || now < sigAt) {
                // (car.live is written to by the handlers: what the page shows of it is a copy of this moment)
                sig = Object.assign(session.signalsView(now), { sources: car.status(), car: { study: Object.assign({}, car.live.study), kinds: car.live.kinds }, lives: box.lines(), reads: car.reads(), groups: GROUPS,
                    ver: String(ctx.spec.version || ''), sigOn: sigOn(), sigName: SIG_NAME, listening: box.listening() });
                sigAt = now; stale = false;
            }
            return sig;
        };
        const show = (cv, now) => {
            const gap = now - lastCall;
            lastCall = now;
            if (!gpu() && typeof cv.words === 'function') {
                const w = cv.words(), sig = Buffer.from(w.buffer, w.byteOffset, w.byteLength);
                if (!fresh && lastWords !== null && gap < LOOP_GAP_MS && now - lastPush < SAME_KEEP_MS && sig.equals(lastWords)) return Promise.resolve();
                lastWords = Buffer.from(sig);
            } else lastWords = null;
            fresh = false; lastPush = now; pushed++;
            return ui.image('MAIN_GFX', cv);
        };
        async function render() {
            const t = ctx.theme(), now = mono(), age = shownAt ? now - shownAt : Infinity;
            const badges = [{ text: 'BETA' }, session.demoOn && { text: 'DEMO' }];
            if (age < SPLASH_MS) {
                const cv = ctx.canvas(W, H).clear('#000000');
                Screens.splash(cv, t);
                G.frame(cv, t, Screens.TABS, Math.min(page, SIGNALS_PAGE), badges);
                await show(cv, now);
                return;
            }
            const cv = ctx.canvas(W, H).clear(t.bg);
            if (page === SIGNALS_PAGE || page === STUDY_PAGE) {
                const s = signalsNow(now);
                if (page === SIGNALS_PAGE) Screens.signals(cv, t, s); else Screens.study(cv, t, s);
            } else {
                const v = session.view(now);
                // (the life before this one ended without a word, with the app's own error, or by itself in another way: said
                // calmly for a minute. The minute runs from when the page first shows, after the first screen, not from the
                // start of the process: an app that the platform starts again by itself may be opened much later)
                v.notice = box.byItself && (!shownAt || now - shownAt < SPLASH_MS + NOTICE_MS) ? Screens.NOTICE_TEXT : null;
                if (page === 0) Screens.drift(cv, t, v);
                else if (page === 1) Screens.last(cv, t, v);
                else if (page === 2) Screens.session(cv, t, v);
                else Screens.best(cv, t, v);
            }
            if (age < SPLASH_MS + FADE_MS) cv.fillRect(0, G.BAR_H, W, H - G.BAR_H, withAlpha('#000000', 1 - (age - SPLASH_MS) / FADE_MS));
            G.frame(cv, t, Screens.TABS, Math.min(page, SIGNALS_PAGE), badges);
            if (!drawn++) log.info('first frame drawn');
            await show(cv, now);
        }

        const go = (i) => { page = (i + PAGES) % PAGES; fresh = true; stale = true; return render(); };
        ui.onClick('BTN_PAGE', () => go(page + 1));
        ui.onClick('BTN_PREV', () => go(page - 1));
        // (a tab that is touched opens; the Signals tab touched while it shows changes between its two pages)
        ctx.onTab((i) => go(i === SIGNALS_PAGE && page === SIGNALS_PAGE ? STUDY_PAGE : i));
        if (typeof ctx.onLayout === 'function') ctx.onLayout(() => { fresh = true; stale = true; });
        settings.onChange((k, value) => {
            fresh = true; stale = true;
            if (RESET[k]) { reset(k, value); return; }
            if (ENGINE_KEYS.indexOf(k) >= 0) session.configure();
            // one of the settings that ask more of the car: ON subscribes at once; OFF stops using the values at once
            // (the subscription itself ends with the next start of the app: car.js)
            if (GROUP_KEYS.indexOf(k) >= 0) {
                if (value === true) car.apply(); else session.groupOff(k);
                if (k === 'sourcesOn') session.configure();
                // (the record says so at once, with how far set-up has got: not at the next 2 s beat)
                box.on(allOn());
                takeNote();
                log.info('settings: "' + GROUPS[k].name + '" switched ' + (value === true ? 'on' : 'off (its values are no longer used; what was subscribed stays so until the app is next started)'));
            }
            // the record listens for SIGTERM, SIGHUP and SIGINT, or stops listening: at once, both ways
            if (k === SIG_KEY) {
                box.signals(value === true);
                // (switched off, its listeners are gone at once: it is no longer listed as on, unlike a subscription, which stays)
                if (value === true) box.on(allOn()); else box.off([SIG_KEY]);
                takeNote();
                log.info('settings: "' + SIG_NAME + '" switched ' + (value === true ? 'on: a signal that ends the app is noted in the record first' : 'off: the app listens for no signal, as shipped'));
            }
            // (with the workshop's settings put away, nothing stays armed)
            if (k === 'workshop' && !value) Object.keys(RESET).forEach((r) => { disarm(r); if (settings.get(r) !== 'no') later(() => settings.set(r, 'no')); });
        });
        // every screen refresh (60 fps) with the GPU renderer; 10 fps in software (PNG frames). The angle does not
        // depend on it: samples are taken in the signal handlers and the 50 ms tick, screen or no screen
        ctx.loop('MAIN', 10, () => { if (!shownAt) shownAt = mono() || 1; return render(); });
        log.info('Proven Drift: started, a drift starts at ' + settings.get('startAngle') + ' degrees from ' + settings.get('minSpeed') + ' km/h, chassis "' + settings.get('chassis') +
            '", yaw source "' + settings.get('yawSource') + '", steering source "' + settings.get('steerSource') + '", demo data "' + settings.get('demo') + '"');
        log.info('Proven Drift ' + ctx.spec.version + ': switched on in Workshop settings: ' + (onNow().map((k) => GROUPS[k].name).concat(sigOn() ? [SIG_NAME] : []).join(', ') || 'nothing (the core signals only, no getter reads of the app\'s own, no signal listened for)'));
        render().catch((e) => log.warn('first render: ' + e));
    },
});
