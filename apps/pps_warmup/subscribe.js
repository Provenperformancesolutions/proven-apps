'use strict';
/**
 * subscribe.js - a car signal subscribed, and tried again when that fails.
 *
 * Warm-Up starts with the head unit, when the car's services may not be up yet, and the kit's signals.watch()
 * tries once: a subscription that failed then stayed dead until the app was started again.
 *
 *   subscribe(signals, iface, handlers, log, name, done)
 *     name   what the log lines call it ('signal CDS')
 *     done   (optional) called with the subscription once it stands
 *
 * A failed subscription is tried again after RETRY_MS (5, 15 and 60 s), and each outcome is logged. An interface
 * this head unit does not have (the kit's error says so) is not tried again: it will not appear.
 */
const RETRY_MS = [5000, 15000, 60000];

function subscribe(signals, iface, handlers, log, name, done) {
    if (!signals || !signals.watch) return;
    let n = 0;
    const failed = (why) => {
        const wait = /no SOME\/IP config/.test(why) ? 0 : RETRY_MS[n++];
        log.warn(name + ' error: ' + why + (wait ? ' (trying again in ' + wait / 1000 + ' s)' : ' (not tried again)'));
        if (wait) setTimeout(go, wait);
    };
    const go = () => {
        let p;
        try { p = Promise.resolve(signals.watch(iface, '1', handlers, log)); } catch (e) { p = Promise.reject(e); }
        p.then((s) => {
            if (!s) return;
            if (s.error) { failed(String(s.error)); return; }
            log.info(name + ' subscribed' + (n ? ' (try ' + (n + 1) + ')' : ''));
            if (done) done(s);
        }).catch((e) => failed(String(e && e.message || e)));
    };
    go();
}

module.exports = { subscribe, RETRY_MS };
