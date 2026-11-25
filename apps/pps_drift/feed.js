'use strict';
/**
 * feed.js - Proven Drift: the bookkeeping around the signal feed. Pure logic: it never touches the car.
 * The app hands it what arrives, the clock, and a function that does one getter read.
 *
 *   PollScheduler  reads a getter on a period: one read at a time, timed against the clock it is given
 *                  (Proven Drag's, unchanged: apps/pps_drag/feed.js)
 *   speedPeriod    how often the speed getter is read: 100 ms on the move, 500 ms standing, 2 s parked
 *   TopUp          which of the three CDS2 getters (yaw rate, sideways and forward acceleration) have to be
 *                  read because the car does not send them often enough, and in what order
 *   Meter          per source: how many samples, how often right now, the most it ever sent
 *   Pick           which of several sources of one thing is in use (the yaw rate, the steering)
 *
 * WHAT IT ASSUMES ABOUT THE CAR (as Proven Drag does, from public reports; none measured by Proven)
 *   - A field is notified when its value changes, at a rate that differs by car and firmware. A sensor's
 *     reading (the yaw rate, the two accelerations) flickers by a count all the time while the car moves,
 *     so it is notified all the time. Whether that holds on a car is not known: hence TopUp.
 *   - One getter read takes about 25 ms, and two reads of one field must never be in flight together.
 *     A polled sample is stamped at the middle of its round trip.
 *   - The kit's signals.watch() does a getter read of its own whenever the car's service comes (back) up.
 *     That read is outside these schedulers: car.js starts reading a moment after it.
 *
 * THE SPEED. The engine is handed ONE speed series, never two mixed: each has its own delay, and the
 *   speed's change over 0.3 s is part of the angle (angle.js, the acceleration check). It is the getter's
 *   series while the getter answers (it comes on an even grid, also while the speed does not change, so
 *   a speed that stops arriving is noticed), and the notified one where it does not (session.js).
 *
 * FIGURES THAT ARE GUESSES
 *   The 100 / 500 / 2000 ms periods and the 5 minutes; everything in PollScheduler (see Proven Drag's
 *   record, proven/CHANGES-drag.md); a CDS2 field is topped up while the car does 10 km/h or more and
 *   fewer than 16 notifications of it arrived in the last 2 s (8 a second, the limit of the LOW DATA
 *   RATE flag); the top-up reads one field every 40 ms, the yaw rate and the sideways acceleration
 *   twice for every read of the forward acceleration; a source counts as "in use" material once it has
 *   delivered 20 usable values, and the choice is made 10 s after the car was first heard.
 */
const FAST_MS = 100, STAND_MS = 500, PARKED_MS = 2000;
const PARKED_AFTER_MS = 300000;    // standing this long with the screen hidden: the slowest polling
const STAND_KMH = 1;
const SLOW_READ_MS = 500;          // a read that took longer is thrown away
const HUNG_READ_MS = 10000;        // a read not answered by then is given up
const TIMEOUT_WAIT_MS = 4000;      // after a read that ran into its time limit: no new read before this long after it began
const BACKOFF_AFTER = 10;          // failed reads in a row before the getter is only tried every PARKED_MS
const TOPUP_MS = 40, TOPUP_KMH = 10, TOPUP_WINDOW_MS = 2000, TOPUP_NEED = 16;
const TOPUP_ORDER = ['yaw', 'lat', 'yaw', 'lat', 'long'];
const RATE_MS = 2000, RATE_MIN_N = 5;
const PICK_AFTER_MS = 10000, PICK_NEED = 20;

const isNum = (x) => typeof x === 'number' && isFinite(x);

/* ---------- how often the speed getter is read ---------- */

/**
 * c: { speed km/h or null, signalsPage (it is showing), hidden (the app's screen is not showing),
 *      standingMs (how long the car has stood) }  ->  ms between reads
 */
function speedPeriod(c) {
    if (c.hidden && c.standingMs >= PARKED_AFTER_MS) return PARKED_MS;
    if (c.signalsPage || !isNum(c.speed) || c.speed >= STAND_KMH) return FAST_MS;
    return STAND_MS;
}

/**
 * Reads a getter again and again.
 *   o.read()      -> a promise of the value (one getter read)
 *   o.clock       { now() -> ms that only run forward, setTimeout(fn, ms) -> handle, clearTimeout(handle) }
 *   o.period()    -> ms wanted between reads right now (asked before every read)
 *   o.onSample(t, value, tookMs)   t = the middle of the round trip
 *   o.onMiss(why, tookMs)          'slow' (over 500 ms: thrown away) | 'failed' | 'hung'
 *   o.timeoutMs   the time limit read() itself asks of the car (a failed read that took 80 % of it ran into it)
 * Never two reads in flight. The next read is due one period after the last one was DUE, not after its
 * timer fired or its answer came, so a late timer does not slow the rate; slots that were missed altogether
 * are skipped, not made up for. start(), stop(), kick() (the period just got shorter: do not wait out the
 * old one). counts: { reads, kept, slow, failed, hung, timedOut }.
 */
class PollScheduler {
    constructor(o) {
        this.o = o;
        this.clock = o.clock;
        this.on = false; this.busy = false; this.timer = null; this.dog = null;
        this.due = null; this.started = null; this.token = 0; this.fails = 0;
        this.counts = { reads: 0, kept: 0, slow: 0, failed: 0, hung: 0, timedOut: 0 };
        this.lastTook = null;
    }

    _period() {
        const p = Number(this.o.period ? this.o.period() : FAST_MS);
        const ms = p > 0 ? p : FAST_MS;
        return this.fails >= BACKOFF_AFTER ? Math.max(ms, PARKED_MS) : ms;
    }

    start() {
        if (this.on) return;
        this.on = true;
        this.due = this.clock.now();
        this._arm();
    }

    stop() {
        this.on = false;
        this.token++;                       // an answer still under way is no longer wanted
        this.busy = false;
        if (this.timer !== null) { this.clock.clearTimeout(this.timer); this.timer = null; }
        if (this.dog !== null) { this.clock.clearTimeout(this.dog); this.dog = null; }
    }

    /** The period may have become shorter: bring the next read forward to where the new period puts it. */
    kick() {
        if (!this.on || this.busy || this.timer === null) return;
        if (this.fails > 0) return;                         // (a getter that is failing is not hurried)
        const now = this.clock.now(), want = Math.max(now, (this.started === null ? now : this.started) + this._period());
        if (want >= this.due) return;
        this.due = want;
        this.clock.clearTimeout(this.timer); this.timer = null;
        this._arm();
    }

    _arm() {
        if (!this.on || this.busy || this.timer !== null) return;
        this.timer = this.clock.setTimeout(() => { this.timer = null; this._read(); }, Math.max(0, this.due - this.clock.now()));
    }

    _read() {
        if (!this.on || this.busy) return;
        const t1 = this.clock.now(), token = ++this.token, period = this._period();
        // the next one: a period after this one was due; if that is already past, from now (no burst to catch up)
        this.due += period;
        if (this.due < t1) this.due = t1;
        this.busy = true; this.started = t1;
        this.counts.reads++;
        const done = (ok, value) => {
            if (token !== this.token) return;                   // given up meanwhile
            if (this.dog !== null) { this.clock.clearTimeout(this.dog); this.dog = null; }
            this.busy = false;
            const t2 = this.clock.now(), took = t2 - t1;
            this.lastTook = took;
            if (!ok) {
                this.counts.failed++; this.fails++;
                // it ran into its time limit: the car may still answer it, so the next read keeps well clear of it
                if (this.o.timeoutMs > 0 && took >= 0.8 * this.o.timeoutMs) { this.counts.timedOut++; this.due = Math.max(this.due, t1 + TIMEOUT_WAIT_MS); }
                if (this.o.onMiss) this.o.onMiss('failed', took);
            } else {
                // the getter answers (again): back to the normal rate at once, not after the slow period it was on
                const slowed = this.fails >= BACKOFF_AFTER;
                this.fails = 0;
                if (slowed) this.due = Math.min(this.due, t2 + this._period());
                if (took > SLOW_READ_MS) { this.counts.slow++; if (this.o.onMiss) this.o.onMiss('slow', took); } else {
                    this.counts.kept++;
                    try { this.o.onSample((t1 + t2) / 2, value, took); } catch (e) { if (this.o.onError) this.o.onError(e); }
                }
            }
            this._arm();
        };
        // an answer that never comes must not stop the feed for good: after HUNG_READ_MS that read is given up
        this.dog = this.clock.setTimeout(() => {
            this.dog = null;
            if (token !== this.token || !this.busy) return;
            this.token++; this.busy = false; this.counts.hung++; this.fails++;
            if (this.o.onMiss) this.o.onMiss('hung', this.clock.now() - t1);
            if (this.due < this.clock.now()) this.due = this.clock.now();
            this._arm();
        }, HUNG_READ_MS);
        let p;
        try { p = Promise.resolve(this.o.read()); } catch (e) { p = Promise.reject(e); }
        p.then((v) => done(true, v), () => done(false));
    }
}

/* ---------- the three CDS2 getters, read only where the car does not send them often enough ---------- */

/**
 * The yaw rate and the two accelerations are notified by the car. Each one's getter is read as well (in
 * turn, one read at a time for the whole interface) while the car does 10 km/h or more and fewer than 16
 * notifications of that field arrived in the last 2 s.
 *   notified(key, t)       a notification of 'yaw' | 'lat' | 'long' arrived
 *   update(now, kmh)       every 50 ms -> true if any field is to be read now
 *   next(ok)               -> the field to read next, in the order yaw, lat, yaw, lat, long (those that are
 *                             wanted, and that ok(key) allows), or null
 *   wanted()               -> the fields being read, for the log
 */
class TopUp {
    constructor() {
        this.heard = { yaw: [], lat: [], long: [] };
        this.want = { yaw: false, lat: false, long: false };
        this.i = 0;
    }

    notified(key, t) {
        const h = this.heard[key];
        if (!h || !isNum(t)) return;
        h.push(t);
        while (h.length > TOPUP_NEED + 4) h.shift();
    }

    update(now, kmh) {
        const moving = isNum(kmh) && kmh >= TOPUP_KMH;
        let any = false;
        Object.keys(this.heard).forEach((k) => {
            const n = this.heard[k].filter((t) => now - t <= TOPUP_WINDOW_MS).length;
            this.want[k] = moving && n < TOPUP_NEED;
            if (this.want[k]) any = true;
        });
        return any;
    }

    next(ok) {
        for (let n = 0; n < TOPUP_ORDER.length; n++) {
            const k = TOPUP_ORDER[this.i++ % TOPUP_ORDER.length];
            if (this.want[k] && (!ok || ok(k))) return k;
        }
        return null;
    }

    wanted() { return Object.keys(this.want).filter((k) => this.want[k]); }
}

/* ---------- per-source counts and rates ---------- */

/**
 * How often one source sends: what arrived, nothing else.
 *   m.sample(t)      a sample arrived
 *   m.stats(now)  -> { n: all samples, rate: a second over the last 2 s (null with fewer than two in them),
 *                      most: the highest such rate seen with five samples or more, age: ms since the last }
 */
class Meter {
    constructor() { this.n = 0; this.lastT = null; this.recent = []; this.most = null; }

    sample(t) {
        if (!isNum(t)) return;
        this.n++; this.lastT = t;
        const r = this.recent;
        r.push(t);
        while (r.length > 1 && t - r[0] > RATE_MS) r.shift();
        if (r.length >= RATE_MIN_N && r[r.length - 1] > r[0]) {
            const rate = (r.length - 1) * 1000 / (r[r.length - 1] - r[0]);
            if (this.most === null || rate > this.most) this.most = rate;
        }
    }

    rate(now) {
        const a = this.recent.filter((t) => now - t <= RATE_MS);
        return a.length >= 2 && a[a.length - 1] > a[0] ? (a.length - 1) * 1000 / (a[a.length - 1] - a[0]) : null;
    }

    stats(now) {
        return { n: this.n, rate: isNum(now) ? this.rate(now) : null, most: this.most, age: this.lastT === null || !isNum(now) ? null : now - this.lastT };
    }
}

/* ---------- which source of one thing is in use ---------- */

/**
 * Several sources may carry the same thing (the yaw rate: two, the steering: four). One is in use.
 *   const p = new Pick(['front', 'xfront', 'driver', 'xdriver']);     in order of preference
 *   p.usable(key)            a usable value of that source arrived
 *   p.choose(setting, now, heardAt)  -> the key in use. setting: a key (that one, whatever it delivers) or
 *                            'auto': the first in order, until 10 s after the car was first heard (heardAt, ms
 *                            or null); then, if the one in use has delivered nothing usable, the first in
 *                            order that has delivered 20 usable values. Once the one in use delivers, the
 *                            choice stands for as long as the app runs.
 */
class Pick {
    constructor(order) {
        this.order = order.slice();
        this.count = {};
        this.order.forEach((k) => { this.count[k] = 0; });
        this.key = this.order[0];
    }

    usable(key) { if (key in this.count) this.count[key]++; }

    choose(setting, now, heardAt) {
        if (setting !== 'auto' && this.order.indexOf(setting) >= 0) { this.key = setting; return this.key; }
        if (this.count[this.key] > 0 || heardAt === null || !isNum(heardAt) || now - heardAt < PICK_AFTER_MS) return this.key;
        const other = this.order.filter((k) => this.count[k] >= PICK_NEED)[0];
        if (other) this.key = other;
        return this.key;
    }
}

module.exports = {
    PollScheduler, speedPeriod, TopUp, Meter, Pick,
    FAST_MS, STAND_MS, PARKED_MS, PARKED_AFTER_MS, SLOW_READ_MS, HUNG_READ_MS, TIMEOUT_WAIT_MS, TOPUP_MS, TOPUP_KMH, TOPUP_NEED, PICK_AFTER_MS, PICK_NEED,
};
