'use strict';
/**
 * heldlog.js - Proven Drag: the log, held back while it could spoil a time.
 *
 * Every line of the kit's log is written to its file at once (the kit checks the file's size and appends,
 * all of it blocking). While that goes on no speed sample is handled, and the next one is stamped late,
 * which is a wrong time. On a PC a line takes a fraction of a millisecond; how long it takes on the head
 * unit's flash is NOT KNOWN. So:
 *   - while a run is timed ('run'), lines are kept and written when it is over;
 *   - while the timer is armed ('armed': the car stands, a launch may come at any moment), lines are kept
 *     and written at the moment that is least in the way: right after a reading of the speed getter was
 *     handled (the next read is 50 ms off), once a second at most. With no getter answering: once a second;
 *   - otherwise ('write') at once, as the kit does.
 * The kit stamps a line when it is written, so a line that was kept for 0.1 s or more says for how long.
 *
 *   const log = new HeldLog(ctx.log, now);     now(): ms on the forward-only clock
 *   log.info(...), log.warn(...), log.error(...), log.debug(...)      as the kit's
 *   log.set('write' | 'armed' | 'run')         session.js, every 50 ms
 *   log.safe(now)                              a moment at which writing is least in the way (see above)
 *   log.flush()
 *
 * FIGURES THAT ARE GUESSES: at most 600 lines are kept (a run lasts 60 s at most and logs a few dozen;
 * if more come, the rest are counted and the count is logged); one write a second while armed.
 */
const KEEP = 600;
const ARMED_EVERY_MS = 1000;
const SAY_AGE_MS = 100;

class HeldLog {
    constructor(log, now) {
        this.log = log; this.now = now;
        this.q = []; this.mode = 'write'; this.lost = 0; this.lastFlush = -Infinity;
        ['error', 'warn', 'info', 'debug'].forEach((level) => {
            this[level] = (...a) => {
                if (this.mode === 'write' && !this.q.length) { this.log[level].apply(this.log, a); return; }
                if (this.q.length >= KEEP) { this.lost++; return; }
                // (put into words now: what is logged may have changed by the time it is written)
                this.q.push({ level, t: this.now(), text: a.map((x) => ((x && x.stack) ? x.stack : (typeof x === 'object' ? JSON.stringify(x) : String(x)))).join(' ') });
            };
        });
    }

    set(mode) {
        if (mode === this.mode) return;
        this.mode = mode;
        if (mode === 'write') this.flush();
    }

    safe(now) {
        if (this.mode !== 'armed' || !this.q.length || now - this.lastFlush < ARMED_EVERY_MS) return;
        this.flush();
    }

    flush() {
        const now = this.now(), q = this.q;
        this.lastFlush = now;
        if (!q.length && !this.lost) return;
        this.q = [];
        q.forEach((l) => this.log[l.level](l.text + (now - l.t >= SAY_AGE_MS ? ' (logged ' + ((now - l.t) / 1000).toFixed(1) + ' s later)' : '')));
        if (this.lost) { this.log.warn('log: ' + this.lost + ' lines were not kept while a run was timed (more than ' + KEEP + ')'); this.lost = 0; }
    }
}

module.exports = { HeldLog, KEEP };
