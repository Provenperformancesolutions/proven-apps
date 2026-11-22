'use strict';
/**
 * gearbox.js - the gearbox oil temperature for Warm-Up (issue #164), from the first source that has it:
 *
 *   1. the gearbox unit (EGS, 0x18), read only (kit/readonly-diag): 22 6000 (ZF 8HP, deg C + 40, read on a G22),
 *      else 22 DA12 (deg C + 48, not confirmed on a car: only once it has moved)
 *   2. the car's BasicDataSet signal, valueTemperatureTransmissionOil (deg C + 48, 255 = none): only once it has
 *      moved, as some cars leave it at one number
 *
 *   const gb = new Gearbox(ctx, log, () => visible).start();
 *   gb.temp()     deg C, or null (no source has it)
 *   gb.source()   'EGS' | 'signal' | null
 *   gb.absent(unit)   true: the evidence is that this car gives no gearbox oil temperature (see absent())
 *   gb.engineStarted()   the engine has just been started: a unit that was not answering is asked again now
 *
 * The unit is asked every POLL_MS while visible() says so; a unit that doesn't answer is asked every SLOW_MS, until
 * the engine is next started.
 *
 * This is the idrive7-apps kit's reader (apps/warmup/gearbox.js) with Proven's changes for Warm-Up 1.3.0:
 *   - a reading is live for FRESH_MS on a clock that only moves forward (the head unit sets its wall clock after
 *     start-up: set back, an old reading stayed "fresh" for as long as the step), and on the wall clock as well
 *     (the forward-only clock stands still while the head unit sleeps)
 *   - an identifier that has answered is never given up. One that has not is given up only after REFUSALS refusals
 *     on separate polls (every app gets every reply, so a refusal may be the answer to another app's request), and
 *     once every identifier is given up the unit is asked again after RETRY_MS instead of never
 *   - the diagnostic link's set-up is tried again when it fails (LINK_RETRY_MS), and the link is set up afresh when
 *     a request has not come back for STUCK_MS (the kit's link paces itself on the wall clock: set back, it waits
 *     for as long as the step)
 *   - the signal's subscription is tried again when it fails (subscribe.js)
 *   - while the unit is not asked, visible() is looked at every IDLE_MS, so the first request goes within a second
 *   - a unit that did not answer while the engine was off (asleep with the ignition off), or a transport that
 *     kept refusing then, is asked again within a second of the engine's start, not up to SLOW_MS later
 *     (engineStarted())
 *   - absent(), for warm.js: the gearbox is left out on evidence, not on time alone
 */
const { ReadOnlyDiag } = require('./kit/readonly-diag');
const { subscribe } = require('./subscribe');

const EGS = 0x18, POLL_MS = 5000, SLOW_MS = 30000, FRESH_MS = 20000;
const IDLE_MS = 1000;              // the unit is not asked now: looked at again this soon
const REFUSALS = 3;                // refusals on separate polls before an identifier that never answered is given up
const RETRY_MS = 300000;           // every identifier given up: the unit is asked again after this
const SILENT_N = 3;                // requests in a row without an answer: the unit is not there
const FAILED_N = 15;               // requests in a row the transport refused (2 s apart): it is tried every SLOW_MS
const FRUITLESS_N = 12;            // answers in a row that brought no reading (a minute of them): the unit gives none
const NOT_NOW = [0x21, 0x78];      // NRCs that are not a "no": busy, answer pending
const LINK_RETRY_MS = [5000, 15000, 60000];        // the diagnostic link's set-up is tried again after these
const STUCK_MS = 30000, STUCK_MAX = 10;            // a request not back after this: a new link (so often at most)
const DIDS = [{ did: 0x6000, offset: -40, sure: true }, { did: 0xDA12, offset: -48, sure: false }];
const ABSENT = [0x11, 0x12, 0x31];         // NRCs that mean "this unit has no such identifier"
const MIN = -40, MAX = 160, MOVE = 1;
/** A clock that only moves forward (the head unit sets its wall clock after start-up). */
const mono = () => { const h = process.hrtime(); return h[0] * 1000 + h[1] / 1e6; };
const hex4 = (did) => did.toString(16).toUpperCase();

/** A value that counts only once it has moved by MOVE from the first one seen. */
class Moving {
    constructor(sure) { this.sure = !!sure; this.first = null; this.moved = this.sure; this.v = null; this.at = 0; this.wall = 0; }
    /** now: the forward-only clock; wall: the wall clock (both in ms). */
    put(v, now, wall) {
        if (typeof v !== 'number' || !isFinite(v) || v < MIN || v > MAX) return;
        if (this.first === null) this.first = v;
        if (Math.abs(v - this.first) >= MOVE) this.moved = true;
        this.v = v; this.at = now; this.wall = wall;
    }
    /** Younger than FRESH_MS on both clocks (a wall clock that was set back does not make it older). */
    get(now, wall) { return this.moved && this.v !== null && now - this.at < FRESH_MS && wall - this.wall < FRESH_MS ? this.v : null; }
}

class Gearbox {
    constructor(ctx, log, visible) {
        this.ctx = ctx; this.log = log; this.visible = visible || (() => true);
        // gone: given up (refused REFUSALS times and never answered); answered: it has given a usable value
        this.egs = DIDS.map((d) => Object.assign({ gone: false, refused: 0, answered: false, val: new Moving(d.sure) }, d));
        this.sig = new Moving(false);
        this.silent = 0; this.timer = null; this.link = null; this.logged = {};
        this.noIds = false;            // the unit refused every identifier (until one answers)
        this.fruitless = 0;            // answers in a row that brought no reading: a refusal, a value outside MIN..MAX, one that never moved
        this.goneAt = 0;               // when the last identifier was given up
        this.gen = 0;                  // counts the links set up: an answer from an earlier one is dropped
        this.linkTries = 0; this.stuck = 0;
    }

    start() {
        subscribe(this.ctx.signals, 'de.bmw.infrastructure.analytics.BasicDataSet', {
            basicDataSet: (v) => {
                const raw = v && v.valueTemperatureTransmissionOil;
                if (typeof raw === 'number' && raw !== 255) this.sig.put(raw - 48, mono(), Date.now());
                this._once('signal', 'gearbox: BasicDataSet oil ' + raw);
            },
        }, this.log, 'gearbox: signal');
        this._connect();
        return this;
    }

    stop() { this.stopped = true; clearTimeout(this.timer); clearTimeout(this.linkTimer); clearTimeout(this.guard); this.timer = null; }

    temp() { const s = this._pick(); return s ? s.v : null; }
    source() { const s = this._pick(); return s ? s.name : null; }

    /**
     * The evidence that this car gives no gearbox oil temperature (a manual gearbox has no oil sensor, and what a
     * gearbox unit other than the ZF 8HP holds under these identifiers is not known): no source has ever given a
     * reading, and the gearbox unit, where it is asked at all (unit; not with "Car signal only"),
     *   - refused every identifier as one it does not have (ABSENT, REFUSALS times each), or
     *   - left SILENT_N requests in a row unanswered since the engine was last started, or
     *   - gave FRUITLESS_N answers in a row that brought no reading: refused for another reason (but for "busy" and
     *     "pending"), a value outside MIN..MAX, or a DA12 value that has never moved.
     * false while that is not known: no diagnostic link yet, the transport not up (a request the transport refuses
     * is no answer of the unit's), the unit not asked yet.
     */
    absent(unit) {
        if (this.sig.moved || this.egs.some((e) => e.val.moved && e.val.v !== null)) return false;
        return !unit || this.noIds || this.silent >= SILENT_N || this.fruitless >= FRUITLESS_N;
    }

    /**
     * The engine has just been started (source.js). A unit that was not answering while it was off (asleep with the
     * ignition off) is asked now and every POLL_MS again, not at the next slow poll; and what it left unanswered
     * until now is no evidence that this car gives no reading: that is counted afresh. The same for a transport
     * that kept refusing while the engine was off: it is tried every 2 s again.
     */
    engineStarted() {
        if (this.stopped) return;
        const slow = this.silent >= SILENT_N || this.failed >= FAILED_N;
        this.silent = 0; this.failed = 0;
        if (slow && this.timer !== null) this._next(IDLE_MS);
    }

    _pick() {
        const now = mono(), wall = Date.now();
        for (const e of this.egs) { const v = e.val.get(now, wall); if (v !== null) return { v, name: 'EGS' }; }
        const v = this.sig.get(now, wall);
        return v !== null ? { v, name: 'signal' } : null;
    }

    /** Set the diagnostic link up: a new one each time, so nothing of a failed or stuck one is carried over. */
    _connect() {
        const gen = ++this.gen;
        clearTimeout(this.timer); clearTimeout(this.guard); this.timer = null;
        if (this.link && this.link.cancel) this.link.cancel();          // what the old link still holds is not sent
        const link = this.link = new ReadOnlyDiag(this.ctx.signals, this.log);
        let up;
        try { up = Promise.resolve(link.init()); } catch (e) { up = Promise.reject(e); }
        up.catch((e) => this.log.warn('gearbox: diagnostic link: ' + (e && e.message || e))).then(() => {
            if (gen !== this.gen || this.stopped) return;
            if (link.ready) {
                if (this.linkTries || this.stuck) this.log.info('gearbox: diagnostic link ready (set up again)');
                this.linkTries = 0;
                this._next(1000);
                return;
            }
            // the head unit's services may not be up yet when the app starts with it: tried again
            const wait = LINK_RETRY_MS[this.linkTries++];
            this.log.info('gearbox: no diagnostic link' + (wait ? ' (trying again in ' + wait / 1000 + ' s)' : ' (not tried again)'));
            if (wait) this.linkTimer = setTimeout(() => this._connect(), wait);
        });
    }

    _next(ms) { clearTimeout(this.timer); this.timer = this.stopped ? null : setTimeout(() => this._poll(), ms); }

    async _poll() {
        clearTimeout(this.timer); this.timer = null;
        if (this.stopped) return;
        if (!this.visible()) { this._next(IDLE_MS); return; }
        if (this.egs.every((e) => e.gone)) {
            // every identifier was refused: the signal only for now, and the unit is asked again after RETRY_MS
            // (a refusal can be another app's, or the unit's own while it starts)
            if (mono() - this.goneAt < RETRY_MS) { this._next(POLL_MS); return; }
            this.egs.forEach((e) => { e.gone = false; e.refused = 0; });
            this.log.info('gearbox: asking the gearbox unit for its identifiers again');
        }
        const ask = this.egs.filter((e) => !e.gone);
        // this module paces itself (SLOW_MS): the link's own "skip a silent unit" must not lock the unit out
        if (this.link.wake) this.link.wake(EGS);
        // the identifier that answered before (or the first still possible)
        const e = ask.find((x) => x.answered) || ask[0];
        const gen = this.gen;
        // a request that does not come back (the kit's link waits on the wall clock, which the head unit may set back
        // by hours): after STUCK_MS the link is set up afresh
        clearTimeout(this.guard);
        this.guard = setTimeout(() => {
            if (gen !== this.gen || this.stopped) return;
            if (++this.stuck > STUCK_MAX) { this._once('stuck', 'gearbox: requests keep not coming back: the gearbox unit is not asked any more'); return; }
            this.log.warn('gearbox: a request has not come back for ' + STUCK_MS / 1000 + ' s: setting the diagnostic link up again');
            this._connect();
        }, STUCK_MS);
        let r = null;
        try { r = await this.link.read(EGS, e.did); } catch (err) {
            if (gen !== this.gen) return;
            clearTimeout(this.guard);
            // the head unit's transport comes up a few seconds after the app (its availability flag may never say so):
            // until then a request throws; try again soon
            // (a head unit without it: every SLOW_MS after 30 s)
            this._once('err', 'gearbox: ' + (err && err.message || err) + ' (trying again)');
            this.failed = (this.failed || 0) + 1;
            this._next(this.failed >= FAILED_N ? SLOW_MS : 2000);
            return;
        }
        if (gen !== this.gen) return;              // the link was set up afresh meanwhile: not this link's answer
        clearTimeout(this.guard);
        const now = mono(), id = hex4(e.did);
        this.failed = 0;
        if (r && r[0] === 0x62 && r.length >= 4 && ((r[1] << 8) | r[2]) === e.did) {
            this.silent = 0; e.refused = 0;
            e.val.put(r[3] + e.offset, now, Date.now());
            if (e.val.v !== null && !e.answered) { e.answered = true; this.noIds = false; }
            // (an answer that is no reading: outside MIN..MAX, or DA12 that has not moved yet)
            if (e.val.get(now, Date.now()) !== null) this.fruitless = 0; else this._fruitless();
            this._once('egs' + e.did, 'gearbox: EGS ' + id + ' -> ' + (r[3] + e.offset) + ' deg C' + (e.val.v === null ? ' (outside ' + MIN + '..' + MAX + ': not used)' : ''));
            this._next(POLL_MS);
        } else if (r && r[0] === 0x7F) {
            this.silent = 0;
            if (NOT_NOW.indexOf(r[2]) < 0) this._fruitless();
            if (ABSENT.indexOf(r[2]) >= 0) {
                // not given up on one refusal (it may be the answer to another app's request), and never once it has
                // answered
                e.refused++;
                if (!e.answered && e.refused >= REFUSALS) {
                    e.gone = true;
                    this.log.info('gearbox: EGS has no ' + id + ' (refused ' + REFUSALS + ' times)');
                    if (this.egs.every((x) => x.gone)) {
                        this.noIds = true; this.goneAt = now;
                        this.log.info('gearbox: the gearbox unit has no oil temperature identifier: the signal only (asked again in ' + RETRY_MS / 60000 + ' min)');
                    }
                } else this._once('ref' + e.did, 'gearbox: EGS refused ' + id + ' (NRC ' + r[2].toString(16) + '): asked again');
            } else this._once('nrc' + r[2], 'gearbox: EGS refused ' + id + ' (NRC ' + r[2].toString(16) + ')');
            this._next(e.gone ? 100 : POLL_MS);
        } else {
            this._once('none', 'gearbox: no answer from the gearbox unit (' + id + ')');
            this.silent++;
            this._next(this.silent >= SILENT_N ? SLOW_MS : POLL_MS);
        }
    }

    /** An answer of the unit's that brought no reading: FRUITLESS_N of them in a row are evidence (absent()). */
    _fruitless() {
        if (++this.fruitless === FRUITLESS_N) this._once('fruitless', 'gearbox: ' + FRUITLESS_N + ' answers in a row from the gearbox unit and no reading among them: taken as a unit that gives none, until one arrives');
    }

    _once(key, msg) { if (!this.logged[key]) { this.logged[key] = true; this.log.info(msg); } }
}

module.exports = { Gearbox, Moving, DIDS, EGS, FRESH_MS, REFUSALS, RETRY_MS, STUCK_MS, FRUITLESS_N };
