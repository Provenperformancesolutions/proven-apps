'use strict';
/**
 * test_mhdflex.js <built app: dist/pps_gauges> - the choice "Ethanol reading: MHD flex" (apps/pps_gauges/mhdflex.js)
 * against stand-in engine units on a stand-in diagnostic transport (fakecar.js), in time the test moves by hand.
 *
 * The stand-in engine unit (fakecar.js mhdUnit) answers the way the reference app's notes say an engine unit with
 * an MHD flex-fuel tune does. That is an assumption, not a car: what a real engine unit does is unproven here.
 * What these checks show is what the app SENDS, and when it sends nothing:
 *   - the three requests that are not reads can only be the probe, the clear and the definition of mhdflex.js
 *   - none of them leaves with another choice of the setting, with the read-out off screen, in demo mode, with
 *     engine data off, on an engine program that is not in the list, or after the setting was switched away
 *   - the Gate's limits (each of the three: never two within 5 s, at most 3 in any 10 minutes, at most 6 in any
 *     hour) hold whatever the engine unit answers and however often a setting is changed: limits() below looks at
 *     every request a scenario sent, and is asked in every scenario that could strain them
 * Not checked here (each is in the code, the stand-in cannot tell it from its absence): that the Gate's requests
 * wait in the read-only link's queue; the 20 s "the engine unit has answered something" condition in vitals.js;
 * the value of BUSY_MS and of the backoff steps after the second (parts N and L hold an upper bound of them only).
 */
const path = require('path');
const { clock, makeCar, mhdUnit, hex, checker } = require('./fakecar');
const APP = process.argv[2];
const js = path.join(path.resolve(APP), 'source', 'javascript');
const ok = checker();
const BOOST = ['iat', 'hpfp', 'lpfp', 'timing', 'boostCtl'];
const withEth = (v) => () => BOOST.concat(v.boostFromDme() ? ['boost'] : [], ['ethanol']);
const key = (r) => hex(r.sid) + ' ' + r.data.map((b) => hex(b)).join(' ');
const READS = [0x22, 0x01, 0x09];
const notReads = (car) => car.sent.filter((r) => READS.indexOf(r.sid) < 0);
const all = (car, re) => car.sent.filter((r) => re.test(key(r)));
const n = (car, re) => all(car, re).length;
const PROBE = /^2F 04 4D 48 44$/, CLEAR = /^2C 03 F3 0[13]$/, DEFINE = /^2C 02 F3 0[13] /, IDENT = /^22 F1 0[12]$/, VALUE = /^22 F3 0[0-9A-F]$/;
const P_BYTES = [0x04, 0x4D, 0x48, 0x44];
const mhdAll = (car) => car.sent.filter((r) => PROBE.test(key(r)) || /^2C /.test(key(r)) || IDENT.test(key(r)) || VALUE.test(key(r)));
const show = (e) => (!e.on ? 'not shown' : e.value === null ? 'NO READING (' + e.why + ')' : 'E' + Math.round(e.value) + ' [' + e.source + (e.can == null ? '' : ', sensor E' + e.can) + ']');
const start = async (opts) => { const car = makeCar(APP, opts), v = car.vitals(); await clock.advance(10); return { car, v }; };
const mhd = (o, more) => Object.assign({ settings: { ethanol: 'mhd' }, reply: mhdUnit(o) }, more || {});
/** Seconds after the first of them, for a list of sent requests. */
const secs = (list) => list.map((r) => Math.round((r.t - list[0].t) / 1000));
const minGap = (list) => Math.min.apply(null, list.map((r, i, a) => (i ? r.t - a[i - 1].t : Infinity)));
/** The most of them in any stretch of ms. */
const most = (list, ms) => list.reduce((m, r, i) => Math.max(m, list.filter((x, j) => j >= i && x.t - r.t < ms).length), 0);
/**
 * The Gate's limits over everything this car was sent: '' when they hold, else what broke. For the probe, the
 * clear and the definition each: never two within 5 s, at most 3 in any 10 minutes, at most 6 in any hour.
 */
function limits(car) {
    const bad = [];
    [['probe', PROBE], ['clear', CLEAR], ['definition', DEFINE]].forEach(([name, re]) => {
        const l = all(car, re);
        if (l.length > 1 && minGap(l) < 5000) bad.push('two ' + name + 's ' + minGap(l) + ' ms apart');
        if (most(l, 600000) > 3) bad.push(most(l, 600000) + ' ' + name + 's in 10 minutes');
        if (most(l, 3600000) > 6) bad.push(most(l, 3600000) + ' ' + name + 's in an hour');
    });
    const other = notReads(car).filter((r) => !PROBE.test(key(r)) && !CLEAR.test(key(r)) && !DEFINE.test(key(r)) || r.target !== 0x12);
    if (other.length) bad.push('other requests that are not reads: ' + other.slice(0, 3).map((r) => key(r) + '@' + hex(r.target)).join('; '));
    return bad.join(', ');
}
const counts = (car) => n(car, PROBE) + ' probes, ' + n(car, CLEAR) + ' clears, ' + n(car, DEFINE) + ' definitions';
/** A send that must not go out: started, the clock moved on, and what became of it (never awaited: it may hang). */
async function tryGate(c, sid, data, ms) {
    let err = null, went = false;
    c.v.gate.send(sid, data).then(() => { went = true; }, (e) => { err = e; });
    await clock.advance(ms || 5000);
    return { err, went, msg: err ? err.message : '' };
}

clock.install();
(async () => {
    await ok.part('A. the gate: which requests that are not reads can leave at all', async () => {
        const M = require(path.join(js, 'mhdflex'));
        const D = [0x02, 0xF3, 0x03, 0x14, 0xB0, 0x00, 0x60, 0xC2, 0x01, 0xB0, 0x00, 0x60, 0xD2, 0x01];
        ok(M.check(0x2F, [0x04, 0x4D, 0x48, 0x44]) === 'probe', 'allowed: the probe 2F 04 4D 48 44');
        ok(M.check(0x2C, [0x03, 0xF3, 0x03]) === 'clear F303' && M.check(0x2C, [0x03, 0xF3, 0x01]) === 'clear F301', 'allowed: the clear of F303 and of F301');
        ok(M.check(0x2C, D) === 'define F303' && M.check(0x2C, [0x02, 0xF3, 0x01].concat(D.slice(3))) === 'define F301', 'allowed: the definition of F303 / F301 from the two places of the B58 gen2 entry');
        // lists with a gap in them: a gap is no byte, and would be sent as 00
        const gapProbe = [0x04, 0x4D, 0x48]; gapProbe.length = 4;
        const gapDefine = D.slice(); delete gapDefine[4]; delete gapDefine[7]; delete gapDefine[8];
        const no = [
            ['the probe with another letter', 0x2F, [0x04, 0x4D, 0x48, 0x45]],
            ['the probe with a byte more', 0x2F, [0x04, 0x4D, 0x48, 0x44, 0x00]],
            ['the probe with a gap where its last byte is', 0x2F, gapProbe],
            ['another I/O control (an exhaust flap)', 0x2F, [0x60, 0xFD, 0x03]],
            ['the clear of F300 (MHD\'s own)', 0x2C, [0x03, 0xF3, 0x00]],
            ['the clear of F302 (MHD\'s own)', 0x2C, [0x03, 0xF3, 0x02]],
            ['the clear of F304', 0x2C, [0x03, 0xF3, 0x04]],
            ['a clear of everything', 0x2C, [0x03]],
            ['a definition of F300', 0x2C, [0x02, 0xF3, 0x00].concat(D.slice(3))],
            ['a definition with one place moved by one', 0x2C, D.slice(0, 7).concat([0xC3], D.slice(8))],
            ['a definition with gaps where three of its bytes are', 0x2C, gapDefine],
            ['a definition reading two bytes from a place', 0x2C, D.slice(0, 8).concat([0x02], D.slice(9))],
            ['a definition with the two places swapped', 0x2C, D.slice(0, 4).concat(D.slice(9, 14), D.slice(4, 9))],
            ['a definition with a third place added', 0x2C, D.concat([0xB0, 0x00, 0x60, 0xE2, 0x01])],
            ['a definition of one place only', 0x2C, D.slice(0, 9)],
            ['a definition by identifier (2C 01)', 0x2C, [0x01, 0xF3, 0x03, 0x55, 0x0D, 0x01, 0x01]],
            ['a write (2E)', 0x2E, [0xF3, 0x03, 0x1B]],
            ['a memory write (3D)', 0x3D, [0x14, 0xB0, 0x00, 0x60, 0xC2, 0x01, 0x55]],
            ['a memory read (23)', 0x23, [0x14, 0xB0, 0x00, 0x60, 0xC2, 0x01]],
            ['a session change (10)', 0x10, [0x03]],
            ['a reset (11)', 0x11, [0x01]],
            ['clearing faults (14)', 0x14, [0xFF, 0xFF, 0xFF]],
            ['security access (27)', 0x27, [0x01]],
            ['communication control (28)', 0x28, [0x03, 0x01]],
            ['a routine (31)', 0x31, [0x01, 0xF0, 0x00]],
            ['tester present (3E)', 0x3E, [0x00]],
            ['a read (22): that goes through the read-only link, not here', 0x22, [0xF3, 0x03]],
            ['a byte that is none', 0x2C, [0x03, 0xF3, 0x103]],
            ['bytes that are no list', 0x2F, 'MHD'],
        ];
        const through = no.filter(([, sid, data]) => { try { M.check(sid, data); return true; } catch (e) { return false; } });
        ok(through.length === 0, 'refused: ' + no.length + ' other requests (' + no.map((x) => x[0]).slice(0, 6).join('; ') + '; ...)' + (through.length ? ' - BUT THROUGH: ' + through.map((x) => x[0]).join('; ') : ''));
        ok(Object.isFrozen(M.PROFILES) && M.PROFILES.every(Object.isFrozen) && Object.isFrozen(M.DIDS) && Object.isFrozen(M.PROBE) && Object.isFrozen(M.LIMITS), 'the list of places, the identifiers, the probe and the limits cannot be changed by the app while it runs');
        ok(M.PROFILES.length === 1 && M.PROFILES[0].family === '5D55', 'one engine program in the list: family 5D55 (B58 gen2)');
        ok(M.LIMITS.gapMs === 5000 && M.LIMITS.perWindow === 3 && M.LIMITS.windowMs === 600000 && M.LIMITS.perHour === 6 && M.LIMITS.hourMs === 3600000, 'the limits: 5 s apart, 3 in 10 minutes, 6 in an hour');

        // the Gate itself, in the app
        let c = await start({ settings: { ethanol: '550d' }, reply: mhdUnit() });
        await c.car.run(3, { want: withEth(c.v) });
        let r = await tryGate(c, 0x2F, P_BYTES);
        ok(!!(r.err && r.err.off) && !r.went && notReads(c.car).length === 0, 'the Gate with another choice of the setting: the probe is not handed over ("' + r.msg + '"), nothing reached the transport');
        clock.reset();
        c = await start({ settings: { ethanol: 'mhd', engineData: 'off' }, reply: mhdUnit() });
        await c.car.run(3, { want: withEth(c.v) });
        r = await tryGate(c, 0x2F, P_BYTES);
        ok(!!(r.err && r.err.off) && notReads(c.car).length === 0, 'the Gate with MHD flex chosen and Engine unit data off: the same');
        clock.reset();
        c = await start({ settings: { ethanol: 'mhd', demo: 'on' }, reply: mhdUnit() });
        await c.car.run(3, { want: withEth(c.v) });
        r = await tryGate(c, 0x2F, P_BYTES);
        ok(!!(r.err && r.err.off) && notReads(c.car).length === 0, 'the Gate with MHD flex chosen and demo data on: the same');
        clock.reset();
        c = await start(mhd());
        await c.car.run(3, { want: withEth(c.v) });
        let before = notReads(c.car).length;
        r = await tryGate(c, 0x2E, [0xF3, 0x03, 0x1B]);
        ok(/not allowed/.test(r.msg) && notReads(c.car).length === before && c.v.gate.stats.blocked === 1, 'the Gate with MHD flex chosen: a write is refused ("' + r.msg + '"), nothing reached the transport, and it is counted and logged');
        ok(c.car.logs.some((l) => /^ERROR blocked a request to the engine unit/.test(l)), 'log: "blocked a request to the engine unit: ..."');
        before = c.car.sent.length;
        r = await tryGate(c, 0x2F, gapProbe);
        const r2 = await tryGate(c, 0x2C, gapDefine);
        ok(/bad request bytes/.test(r.msg) && /bad request bytes/.test(r2.msg) && c.car.sent.slice(before).every((x) => READS.indexOf(x.sid) >= 0) && c.v.gate.stats.blocked === 3,
            'the two lists with gaps, handed to the Gate: refused, nothing but reads on the transport');

        // the limits are the Gate's own: asked for the probe 20 times, 6 s apart, by something other than the app's steps
        clock.reset();
        c = await start(mhd({ family: '6B21' }));           // (an engine program that is not in the list: the app's own steps send nothing that is not a read)
        await c.car.run(3, { want: withEth(c.v) });
        let limited = 0;
        for (let i = 0; i < 20; i++) { r = await tryGate(c, 0x2F, P_BYTES, 6000); if (r.err && r.err.limit) limited++; }
        ok(n(c.car, PROBE) === 3 && limited === 17 && limits(c.car) === '', 'the probe handed to the Gate 20 times in 2 minutes: 3 reach the transport, 17 are stopped ("' + r.msg + '")');
        for (let i = 0; i < 20; i++) await tryGate(c, 0x2F, P_BYTES, 180000);
        ok(n(c.car, PROBE) <= 9 && limits(c.car) === '', 'and 20 times more over the next hour, 3 minutes apart: ' + n(c.car, PROBE) + ' in all, never more than 6 in any hour');
        for (const [name, sid, bytes, re] of [['clear', 0x2C, [0x03, 0xF3, 0x03], CLEAR], ['definition', 0x2C, D, DEFINE]]) {
            for (let i = 0; i < 20; i++) await tryGate(c, sid, bytes, 6000);
            const in2 = n(c.car, re);
            for (let i = 0; i < 20; i++) await tryGate(c, sid, bytes, 180000);
            ok(in2 === 3 && n(c.car, re) <= 9 && limits(c.car) === '', 'the ' + name + ' the same way: 3 of 20 in 2 minutes, ' + n(c.car, re) + ' after the hour, the limits hold');
        }
        // the 5 s rule for each of the three, at the Gate alone: handed over at 0, +1 s and +5 s
        for (const [name, sid, bytes, re] of [['probe', 0x2F, P_BYTES, PROBE], ['clear', 0x2C, [0x03, 0xF3, 0x01], CLEAR], ['definition', 0x2C, [0x02, 0xF3, 0x01].concat(D.slice(3)), DEFINE]]) {
            clock.reset();
            c = await start(mhd({ family: '6B21' }));
            await c.car.run(3, { want: withEth(c.v) });
            const a1 = await tryGate(c, sid, bytes, 1000), a2 = await tryGate(c, sid, bytes, 4000), a3 = await tryGate(c, sid, bytes, 1000);
            const l = all(c.car, re);
            ok(a1.went && !!(a2.err && a2.err.limit) && a3.went && l.length === 2 && l[1].t - l[0].t === 5000, 'the ' + name + ' handed to the Gate at 0, +1 s and +5 s: sent, no room, sent (' + (l[1] ? l[1].t - l[0].t : '-') + ' ms apart on the transport)');
        }
        // two handed over in the same instant: the Gate counts at the hand-over, so the second finds no room
        clock.reset();
        c = await start(mhd({ family: '6B21' }, { latencyMs: 0 }));
        await c.car.run(3, { want: withEth(c.v) });
        {
            let e1 = null, e2 = null, w1 = false, w2 = false;
            c.v.gate.send(0x2F, P_BYTES).then(() => { w1 = true; }, (e) => { e1 = e; });
            c.v.gate.send(0x2F, P_BYTES).then(() => { w2 = true; }, (e) => { e2 = e; });
            await clock.advance(5000);
            ok(w1 && !e1 && !w2 && !!(e2 && e2.limit) && n(c.car, PROBE) === 1, 'two probes handed to the Gate in the same instant, on a transport that would take both: one leaves, the other is stopped by the Gate ("' + (e2 && e2.message) + '")');
        }

        // the second look, at the hand-over: the kit's Diag is made to change a request after the Gate's first check
        const Dg = require(path.join(js, 'kit', 'diag')).Diag, send0 = Dg.prototype.send;
        try {
            clock.reset();
            Dg.prototype.send = function (target, sid, data, opts) { return send0.call(this, target, sid, sid === 0x2F ? [0x60, 0xFD, 0x03] : data, opts); };
            c = await start(mhd());
            await c.car.run(8, { want: withEth(c.v) });
            ok(notReads(c.car).length === 0 && c.v.gate.stats.blocked >= 1 && c.car.logs.some((l) => /^ERROR blocked a request to the engine unit at the hand-over: .*2F 60 FD 03 is not allowed/.test(l)),
                'the probe changed into another I/O control on its way to the transport: stopped at the hand-over, nothing reached the transport, logged as blocked');
            clock.reset();
            Dg.prototype.send = function (target, sid, data, opts) { return send0.call(this, sid === 0x2F ? 0x18 : target, sid, data, opts); };
            c = await start(mhd());
            await c.car.run(8, { want: withEth(c.v) });
            ok(notReads(c.car).length === 0 && c.v.gate.stats.blocked >= 1, 'the probe redirected to the gearbox unit (0x18) on its way: stopped at the hand-over');
        } finally { Dg.prototype.send = send0; }
    });

    let baseIat;
    await ok.part('B. as shipped and with the two other choices: reads only, and nothing of the MHD steps', async () => {
        for (const src of ['off', '550d', 'obd52']) {
            clock.reset();
            const { car, v } = await start({ settings: { ethanol: src }, reply: mhdUnit({ extra: { '22:550D': [0x45], '01:52': [0x45] } }) });
            await car.run(300, { want: withEth(v) });
            ok(notReads(car).length === 0 && mhdAll(car).length === 0, 'Ethanol reading "' + src + '", 5 minutes on the Boost set, on a car that has the tune: ' + car.sent.length + ' requests, every one a read, none of the MHD steps');
            if (src === 'off') baseIat = car.count(/^F40F@12$/);
        }
    });

    await ok.part('C. MHD flex on a B58 gen2 with the tune', async () => {
        const { car, v } = await start(mhd({ active: 27, can: 26 }));
        const opt = car.ctx.spec.settings.find((x) => x.key === 'ethanol').options.filter((o) => o[0] === 'mhd')[0];
        ok(!!opt && /not read only/.test(opt[1]), 'the choice says what it is in Settings: "' + (opt && opt[1]) + '"');
        ok(!/read only/i.test(car.ctx.spec.settings.find((x) => x.key === 'engineData').label), 'and the switch that lets it go is not labelled "read only": "' + car.ctx.spec.settings.find((x) => x.key === 'engineData').label + '"');
        await car.run(6, { want: withEth(v) });
        const e = v.ethanol();
        ok(e.on && e.value === 27 && e.can === 26 && e.source === 'MHD', show(e) + ' within 6 s of opening the Boost set');
        const seq = mhdAll(car).map(key);
        ok(seq.slice(0, 5).join(' | ') === '22 F1 01 | 2F 04 4D 48 44 | 2C 03 F3 03 | 2C 02 F3 03 14 B0 00 60 C2 01 B0 00 60 D2 01 | 22 F3 03',
            'in this order: identify (one read), probe, clear, define, read');
        await car.run(294, { want: withEth(v) });
        ok(n(car, PROBE) === 1 && n(car, CLEAR) === 1 && n(car, DEFINE) === 1 && notReads(car).length === 3, '5 minutes: 3 requests that are not reads in all (1 probe, 1 clear, 1 definition)');
        ok(n(car, IDENT) === 1 && n(car, /^22 F1 02$/) === 0, 'and the identification was read once (22 F1 01; the second list, 22 F1 02, is not asked)');
        const reads = all(car, VALUE);
        ok(reads.length >= 90 && reads.length <= 150 && minGap(reads) >= 2000, reads.length + ' reads of the value in 5 minutes, never two within 2 s (shortest gap ' + minGap(reads) + ' ms)');
        const iat = car.count(/^F40F@12$/);
        ok(Math.abs(iat - baseIat) / baseIat < 0.05, 'the other gauges keep their rate: ' + iat + ' intake-air reads in 5 minutes against ' + baseIat + ' with the setting off');
        const sentLines = car.logs.filter((l) => /^info MHD flex: .* sent to the engine unit$/.test(l));
        ok(sentLines.length === 3 && car.logs.some((l) => l === 'info MHD flex: probe (2F 04 4D 48 44) sent to the engine unit') && v.gate.stats.sent === 3,
            'the log names each request that is not a read once the transport took it (3 lines, "MHD flex: probe (2F 04 4D 48 44) sent to the engine unit")');
        ok(car.logs.some((l) => l === 'info raw MHD flex 22 F3 03: "62 F3 03 1B 1A"'), 'and has the first raw replies ("raw MHD flex 22 F3 03: "62 F3 03 1B 1A"")');
    });

    await ok.part('D. an engine program that is not in the list (an S58 until its places are known)', async () => {
        const { car, v } = await start(mhd({ family: '6B21' }));
        await car.run(600, { want: withEth(v) });
        const e = v.ethanol();
        ok(e.on && e.value === null && e.why === 'software not supported', show(e));
        ok(notReads(car).length === 0, '10 minutes on the Boost set: not one request that is not a read (no probe, no definition)');
        ok(mhdAll(car).length === 1 && n(car, IDENT) === 1, 'the identification read, once, and then nothing more of the MHD steps');
        const line = car.logs.filter((l) => /MHD flex: .*program family 6B21 is not in the list/.test(l))[0] || '';
        ok(/program 00006B21503C05/.test(line) && /calibration 00008417503C1D/.test(line), 'the log has what a new entry needs: ' + line.replace(/^info /, '').slice(0, 170));
        clock.reset();
        let c = await start(mhd({ noProgram: true }));
        await c.car.run(120, { want: withEth(c.v) });
        ok(c.v.ethanol().why === 'software not identified' && notReads(c.car).length === 0, 'a software list without a program entry: ' + show(c.v.ethanol()) + ', and nothing that is not a read');
        // the stand-in's second list (22 F1 02) names 5D55 as the recorded car's does: it must not decide, and is not asked
        ok(n(car, /^22 F1 02$/) === 0 && n(c.car, /^22 F1 02$/) === 0, 'the second list (22 F1 02), which names 5D55 on this stand-in, is never asked: 22 F1 01 decides');
        const M = require(path.join(js, 'mhdflex'));
        const HEAD = (k) => [0x01, 0x01, 0x00, k, 0x26, 0x11, 0x04, 0x8F, 0x04, 0xD2, 0x01, 0x00, 0x00, 0x00, 0x10, 0x00, 0x00];
        const PRG = (a, b) => [0x08, 0x00, 0x00, a, b, 0x50, 0x3C, 0x05], CAL = [0x0D, 0x00, 0x00, 0x84, 0x17, 0x50, 0x3C, 0x1D];
        const odd = [
            ['two program entries, 6B21 and 5D55', { programs: ['6B21', '5D55'] }, 'software not supported'],
            ['two program entries, 5D55 and 6B21', { programs: ['5D55', '6B21'] }, 'software not supported'],
            ['the bytes 08 00 00 5D 55 off the grid, inside the entry before the program entry 6B21', { svk: HEAD(3).concat([0x01, 0x00, 0x00, 0x08, 0x00, 0x00, 0x5D, 0x55], PRG(0x6B, 0x21), CAL) }, 'software not supported'],
            ['a list one byte too long', { svk: HEAD(2).concat(PRG(0x5D, 0x55), CAL, [0x00]) }, 'software not identified'],
            ['a list whose header counts 3 entries and has 2', { svk: HEAD(3).concat(PRG(0x5D, 0x55), CAL) }, 'software not identified'],
            ['a list whose header counts 1 entry and has 2', { svk: HEAD(1).concat(PRG(0x5D, 0x55), CAL) }, 'software not identified'],
            ['a program id 00015D55 (something in the first two bytes: another program)', { svk: HEAD(2).concat([0x08, 0x00, 0x01, 0x5D, 0x55, 0x50, 0x3C, 0x05], CAL) }, 'software not supported'],
            ['a program id 12345D55', { svk: HEAD(2).concat([0x08, 0x12, 0x34, 0x5D, 0x55, 0x50, 0x3C, 0x05], CAL) }, 'software not supported'],
            ['two programs, 00005D55 and 00015D55', { svk: HEAD(3).concat(PRG(0x5D, 0x55), [0x08, 0x00, 0x01, 0x5D, 0x55, 0x50, 0x3C, 0x05], CAL) }, 'software not supported'],
            ['22 F1 01 refused (7F 22 31)', { identNrc: 0x31 }, 'software not identified'],
            ['a list with a 3-byte header', { svk: [0x83, 0x04, 0x01].concat(PRG(0x5D, 0x55), CAL) }, 'software not identified'],
        ];
        const wrongOdd = [];
        for (const [name, o, why] of odd) {
            clock.reset();
            c = await start(mhd(o));
            await c.car.run(60, { want: withEth(c.v) });
            if (c.v.ethanol().why !== why || notReads(c.car).length) wrongOdd.push(name + ': ' + show(c.v.ethanol()) + ', ' + notReads(c.car).length + ' not reads');
        }
        ok(wrongOdd.length === 0, odd.length + ' answers to the identification that are not exactly "one program, 00005D55": ' + odd.map((x) => x[0]).join('; ') + ' - none gets a request that is not a read' + (wrongOdd.length ? ' - BUT: ' + wrongOdd.join(' | ') : ''));
        clock.reset();
        c = await start(mhd({ identSilent: true }, { holdMs: 0 }));
        await c.car.run(600, { want: withEth(c.v) });
        ok(c.v.ethanol().value === null && notReads(c.car).length === 0 && n(c.car, IDENT) >= 2 && n(c.car, IDENT) <= 8, '22 F1 01 never answered, 10 minutes: ' + show(c.v.ethanol()) + ', asked ' + n(c.car, IDENT) + ' times (further and further apart), nothing that is not a read');
        const un = car.logs.filter((l) => /MHD flex: identify -> unsupported/.test(l))[0] || '';
        ok(/program family 6B21 is not in the list\. No request that is not a read was sent for it\./.test(un), 'the log line for a program that is not in the list: "' + un.replace(/^info MHD flex: identify -> unsupported \(/, '').slice(0, 96) + '..."');
        // the list the reference app's author recorded from his car (quoted in that app's own test file), as data
        const REC = '01 01 00 06 26 11 04 8F 04 D2 01 00 00 00 10 00 00 01 00 00 3D DE 03 13 16 02 00 00 3D D1 FF FF FF 06 00 00 48 DB 01 23 05 08 00 00 5D 55 50 3C 05 0D 00 00 84 17 50 3C 1D 05 00 00 27 42 02 05 41'.split(' ').map((x) => parseInt(x, 16));
        const rec = M.matchProfile(REC);
        ok(rec.shape && rec.profile && rec.profile.family === '5D55' && rec.families.join() === '5D55' && rec.seen.join() === 'program 00005D55503C05,calibration 00008417503C1D',
            'the list recorded on the reference car is read as: one program family, 5D55 (' + rec.seen.join(', ') + ')');
    });

    await ok.part('E. the right engine program, and no MHD tune on it', async () => {
        const { car, v } = await start(mhd({ tune: false }));
        await car.run(300, { want: withEth(v) });
        ok(v.ethanol().value === null && v.ethanol().why === 'no MHD tune found', show(v.ethanol()));
        let p = all(car, PROBE);
        ok(p.length === 2 && p[1].t - p[0].t >= 5000 && n(car, /^2C /) === 0, 'first 5 minutes: the probe, refused, and once more ' + Math.round((p[1].t - p[0].t) / 100) / 10 + ' s later (a refusal may be another app\'s); no clear and no definition');
        await car.run(5400, { want: withEth(v) });
        p = all(car, PROBE);
        ok(p.length === 6 && n(car, /^2C /) === 0 && notReads(car).length === 6 && limits(car) === '', '95 minutes: 6 probes, at ' + secs(p).join(', ') + ' s, still no clear and no definition');
        ok(p.length === 6 && p[2].t - p[1].t >= 600000 && p[3].t - p[2].t >= 1200000 && p[4].t - p[3].t >= 1800000 && p[5].t - p[4].t >= 1800000, 'the rests between them are 10, 20 and then 30 minutes each (2 probes an hour from then on)');
        clock.reset();
        let c = await start(mhd({ marker: [0x33, 0x01, 0x00] }));
        await c.car.run(60, { want: withEth(c.v) });
        ok(c.v.ethanol().why === 'no MHD tune found' && n(c.car, /^2C /) === 0, 'the probe answered "MHD3" instead of "MHD2": ' + show(c.v.ethanol()) + ', no clear and no definition');
        clock.reset();
        c = await start(mhd({ probeNrc: 0x21 }));
        await c.car.run(12, { want: withEth(c.v) });
        ok(c.v.ethanol().why === 'engine unit busy' && n(c.car, /^2C /) === 0, 'the probe answered "busy" (NRC 21): ' + show(c.v.ethanol()) + ', tried again later, no definition');
    });

    await ok.part('F. an ignition cycle: the engine unit forgets the definition', async () => {
        const reply = mhdUnit({ active: 40, can: 41 });
        const { car, v } = await start(mhd(null, { reply }));
        await car.run(20, { want: withEth(v) });
        ok(v.ethanol().value === 40, show(v.ethanol()) + ' before');
        reply.state.forget();
        const before = n(car, VALUE);
        let gone = false;
        await car.run(12, { want: withEth(v), each: () => { if (v.ethanol().value === null) gone = true; } });
        ok(gone, 'the read is refused (7F 22 31) twice: the number is gone with the second refusal');
        ok(v.ethanol().value === 40, show(v.ethanol()) + ' again within 12 s');
        ok(n(car, PROBE) === 1 && n(car, CLEAR) === 2 && n(car, DEFINE) === 2, 'defined a second time (2 clears, 2 definitions), the probe not repeated');
        ok(n(car, VALUE) - before >= 3, 'the refusal was read twice before the definition was sent again');
    });

    await ok.part('G. an engine unit that forgets, or refuses, again and again: the limits', async () => {
        let c = await start(mhd({ lose: true }));
        let shown = false;
        await c.car.run(540, { want: withEth(c.v), each: () => { if (c.v.ethanol().value !== null) shown = true; } });
        let d = all(c.car, DEFINE);
        ok(d.length === 3 && n(c.car, CLEAR) === 3 && n(c.car, PROBE) === 1, 'the definition forgotten at once, 9 minutes: 3 definitions (after ' + secs(d).join(', ') + ' s), then it waits');
        ok(!shown && c.v.ethanol().why === 'paused, too many tries', 'no number at any time: ' + show(c.v.ethanol()));
        ok(c.car.logs.filter((l) => /MHD flex: the limit for the clear is reached \(3 in 10 minutes, 6 in an hour\), the next one in \d+ min/.test(l)).length === 1, 'the wait is in the log, once: "the limit for the clear is reached (3 in 10 minutes, 6 in an hour), the next one in 10 min"');
        await c.car.run(3060, { want: withEth(c.v) });
        d = all(c.car, DEFINE);
        ok(d.length === 6 && limits(c.car) === '', '60 minutes: ' + counts(c.car) + ' (the definitions at minute ' + d.map((x) => Math.round((x.t - d[0].t) / 6000) / 10).join(', ') + ')');
        await c.car.run(7200, { want: withEth(c.v) });
        ok(limits(c.car) === '' && n(c.car, DEFINE) <= 18, '3 hours: ' + counts(c.car) + ', the limits hold throughout');

        // one good read, then forgotten, again and again (a count of definitions "in a row" does not see this)
        for (const after of [1, 10, 30]) {
            clock.reset();
            c = await start(mhd({ forgetAfter: after, active: 27, can: 26 }));
            await c.car.run(3600, { want: withEth(c.v) });
            ok(limits(c.car) === '' && n(c.car, DEFINE) <= 6 && notReads(c.car).length <= 18, 'forgotten after ' + after + ' good read' + (after > 1 ? 's' : '') + ' each time, 60 minutes: ' + counts(c.car)
                + (after === 1 ? ' (1,317 requests that are not reads in the first version)' : ''));
        }

        // every definition answered "out of range" (the likeliest refusal of an engine program that does not allow the two places)
        clock.reset();
        c = await start(mhd({ defineNrc: 0x31 }));
        await c.car.run(4 * 3600, { want: withEth(c.v) });
        const hours = [0, 1, 2, 3].map((h) => notReads(c.car).filter((r) => r.t - c.car.sent[0].t >= h * 3600000 && r.t - c.car.sent[0].t < (h + 1) * 3600000).length);
        ok(limits(c.car) === '' && Math.max.apply(null, hours) <= 18, 'every definition refused as out of range, 4 hours: ' + counts(c.car) + '; requests that are not reads per hour: ' + hours.join(', ') + ' (it does not grow)');
        ok(n(c.car, /^2C 02 F3 01 /) >= 1 && c.v.ethanol().value === null, 'F301 is tried as well, and no number is shown: ' + show(c.v.ethanol()));

        // another tool takes the identifier every 3 s (the reference notes: MHD's own app logging a long list may do that)
        clock.reset();
        const reply = mhdUnit({ active: 27, can: 26 });
        c = await start(mhd(null, { reply }));
        setInterval(() => { reply.state.defined.F303 = [{ place: 'B0001234', size: 1 }, { place: 'B0001235', size: 1 }, { place: 'B0001236', size: 1 }]; }, 3000);
        let wrong = false;
        await c.car.run(3600, { want: withEth(c.v), each: () => { const e = c.v.ethanol(); if (e.value !== null && e.value !== 27) wrong = true; } });
        ok(limits(c.car) === '' && n(c.car, DEFINE) <= 6 && !wrong, 'another tool defines F303 for itself every 3 s, 60 minutes: ' + counts(c.car) + ' (658 definitions in the first version), and never a wrong number');
    });

    await ok.part('H. an engine unit that has no F303: F301 is taken', async () => {
        const { car, v } = await start(mhd({ dids: ['F300', 'F301', 'F302'], active: 62, can: 60 }));
        await car.run(20, { want: withEth(v) });
        ok(v.ethanol().value === 62 && v.ethanol().can === 60, show(v.ethanol()));
        const d = all(car, DEFINE);
        ok(n(car, /^2C 02 F3 03 /) === 2 && n(car, /^2C 02 F3 01 /) === 1 && n(car, /^22 F3 01$/) >= 1 && n(car, /^22 F3 03$/) === 0 && limits(car) === '',
            'F303 refused as out of range twice, then F301 defined and read (definitions at ' + secs(d).join(', ') + ' s)');
        ok(n(car, /^2C .. F3 0[02]/) === 0, 'F300 and F302 (MHD\'s own) are never touched');
    });

    await ok.part('I. an engine unit that refuses the definition', async () => {
        const { car, v } = await start(mhd({ defineNrc: 0x33 }));
        await car.run(540, { want: withEth(v) });
        ok(v.ethanol().value === null && /^(engine unit refused it|paused, too many tries)$/.test(v.ethanol().why), show(v.ethanol()));
        let d = all(car, DEFINE);
        const gaps = d.map((r, i, a) => (i ? Math.round((r.t - a[i - 1].t) / 1000) : 0)).slice(1);
        ok(d.length === 3 && gaps[0] >= 5 && gaps[0] <= 7 && gaps[1] >= 15 && gaps[1] <= 17, 'first 9 minutes: 3 definitions, the second ' + gaps[0] + ' s and the third ' + gaps[1] + ' s after the one before (waits of 5 s and 15 s), then it waits for room');
        ok(n(car, PROBE) === 3, 'the tune is asked for again before each new try (' + n(car, PROBE) + ' probes)');
        await car.run(3 * 3600, { want: withEth(v) });
        d = all(car, DEFINE);
        ok(limits(car) === '' && most(notReads(car), 3600000) <= 18, '3 hours more: ' + counts(car) + ' in all; never more than ' + most(notReads(car), 3600000) + ' requests that are not reads in any hour');
    });

    await ok.part('J. when nothing of it is asked: off screen, another gauge set, demo data, engine data off, a sleeping engine unit', async () => {
        let c = await start(mhd());
        await c.car.run(300, { want: () => ['iat'] });
        ok(mhdAll(c.car).length === 0, 'MHD flex chosen, the Street set on screen for 5 minutes: nothing (not even the identification)');
        clock.reset();
        c = await start(mhd());
        await c.car.run(300, { screen: false });
        ok(mhdAll(c.car).length === 0, 'the app in the background, engine running, 5 minutes: nothing');
        clock.reset();
        c = await start(mhd(null, { settings: { ethanol: 'mhd', demo: 'on' } }));
        await c.car.run(120, { want: withEth(c.v) });
        ok(c.car.sent.length === 0 && c.v.ethanol().why === 'demo: not read', 'demo data on: no request of any kind, ' + show(c.v.ethanol()));
        clock.reset();
        c = await start(mhd(null, { settings: { ethanol: 'mhd', engineData: 'off' } }));
        await c.car.run(120, { want: withEth(c.v) });
        ok(c.car.sent.length === 0 && c.v.ethanol().why === 'engine data off', 'Engine unit data off: no request of any kind, ' + show(c.v.ethanol()));
        clock.reset();
        const tuned = mhdUnit();
        c = await start(mhd(null, { holdMs: 0, reply: (a, b, d, t) => (a === 0x12 ? null : tuned(a, b, d, t)) }));
        await c.car.run(600, { want: withEth(c.v) });
        ok(mhdAll(c.car).length === 0, 'an engine unit that answers nothing for 10 minutes: nothing of the MHD steps is sent to it (' + show(c.v.ethanol()) + ')');
    });

    await ok.part('K. the setting is changed: while it reads, while a request is waiting, and over and over', async () => {
        const { car, v } = await start(mhd({ active: 33, can: 33, extra: { '22:550D': [0x66] } }));
        await car.run(10, { want: withEth(v) });
        ok(v.ethanol().value === 33, show(v.ethanol()) + ' with MHD flex');
        car.settings.set('ethanol', '550d');
        ok(v.ethanol().value === null, 'changed to "Engine unit value (550D)": the MHD number is gone at once (' + show(v.ethanol()) + ')');
        const before = notReads(car).length, id = mhdAll(car).length;
        await car.run(120, { want: withEth(v) });
        ok(notReads(car).length === before && mhdAll(car).length === id && v.ethanol().source === '550D', '2 minutes with the other choice: nothing more of the MHD steps, ' + show(v.ethanol()));
        car.settings.set('ethanol', 'off');
        await car.run(60, { want: withEth(v) });
        ok(notReads(car).length === before && v.ethanol().on === false, 'changed to Off: nothing more, nothing shown');
        car.settings.set('ethanol', 'mhd');
        await car.run(10, { want: withEth(v) });
        ok(v.ethanol().value === 33 && n(car, PROBE) === 2, 'back to MHD flex: it starts over from the identification (' + show(v.ethanol()) + ')');

        // Off and back to MHD flex with no round of the engine-unit poll between: it still starts over
        clock.reset();
        let c = await start(mhd({ tune: false }));
        await c.car.run(30, { want: withEth(c.v) });
        const i0 = n(c.car, IDENT), p0 = n(c.car, PROBE);
        c.car.settings.set('ethanol', 'off'); c.car.settings.set('ethanol', 'mhd');
        await c.car.run(15, { want: withEth(c.v) });
        ok(n(c.car, IDENT) === i0 + 1 && n(c.car, PROBE) > p0, '"no MHD tune found", then Off and MHD flex again at once: the identification is read again and the probe asked again');
        // Engine unit data off and on starts it over as well; Demo data between Never and Auto (no demo data shown either way) does not
        clock.reset();
        c = await start(mhd({ active: 27, can: 26 }));
        await c.car.run(10, { want: withEth(c.v) });
        c.car.settings.set('engineData', 'off'); c.car.settings.set('engineData', 'auto');
        await c.car.run(15, { want: withEth(c.v) });
        ok(n(c.car, IDENT) === 2 && c.v.ethanol().value === 27, 'Engine unit data off and on again: started over (' + n(c.car, IDENT) + ' identification reads), ' + show(c.v.ethanol()));
        const nr = notReads(c.car).length, idn = n(c.car, IDENT);
        for (let i = 0; i < 10; i++) { c.car.settings.set('demo', i % 2 ? 'off' : 'auto'); await c.car.run(15, { want: withEth(c.v) }); }
        ok(notReads(c.car).length === nr && n(c.car, IDENT) === idn && c.v.ethanol().value === 27, 'Demo data switched between Never and Auto 10 times with the car there: nothing is started over, nothing more that is not a read');

        // the setting is switched away 50 ms after a request passed the Gate, while the transport is busy with someone else's (450 ms)
        const cases = [
            ['the probe', (q) => q.serviceID === 0x2F, 'ethanol', 'off'],
            ['the clear', (q) => q.serviceID === 0x2C && q.udsData[0] === 0x03, 'ethanol', '550d'],
            ['the definition', (q) => q.serviceID === 0x2C && q.udsData[0] === 0x02, 'ethanol', 'off'],
            ['the probe', (q) => q.serviceID === 0x2F, 'engineData', 'off'],
            ['the probe', (q) => q.serviceID === 0x2F, 'demo', 'on'],
        ];
        const late = [];
        for (const [what, isIt, setting, value] of cases) {
            clock.reset();
            c = await start(mhd({ active: 27, can: 26 }));
            const call0 = c.car.ctx.signals.call, cc = c;
            let armed = false, offAt = null;
            c.car.ctx.signals.call = (p, method, q, ms) => {
                if (!armed && isIt(q)) {
                    armed = true;
                    cc.car.hold(450);
                    setTimeout(() => { cc.car.settings.set(setting, value); offAt = clock.now(); }, 50);
                }
                return call0(p, method, q, ms);
            };
            await c.car.run(8, { want: withEth(c.v) });
            const after = notReads(c.car).filter((r) => offAt !== null && r.t > offAt);
            if (offAt === null || after.length || c.v.gate.stats.blocked || c.car.logs.some((l) => /^(ERROR|WARN) .*MHD flex/.test(l))) late.push(what + ' / ' + setting + ' -> ' + value + ': ' + (offAt === null ? 'never armed' : after.map(key).join('; ') || 'an ERROR or WARN line'));
        }
        ok(late.length === 0, 'the setting switched away while the probe, the clear or the definition waits for a busy transport (5 cases): none of them reaches the transport afterwards, and no error is logged for it' + (late.length ? ' - BUT: ' + late.join(' | ') : ''));

        // switched away and back in one go while a request waits for a busy transport: it belongs to steps that were
        // started over, and is not handed on although the setting says MHD flex again
        {
            const stale = [];
            for (const [what, isIt] of [['the probe', (q) => q.serviceID === 0x2F], ['the clear', (q) => q.serviceID === 0x2C && q.udsData[0] === 0x03], ['the definition', (q) => q.serviceID === 0x2C && q.udsData[0] === 0x02]]) {
                clock.reset();
                c = await start(mhd({ active: 27, can: 26 }));
                const call0 = c.car.ctx.signals.call, cc = c;
                let armed = false, at = null;
                c.car.ctx.signals.call = (p, method, q, ms) => {
                    if (!armed && isIt(q)) { armed = true; cc.car.hold(450); setTimeout(() => { cc.car.settings.set('ethanol', 'off'); cc.car.settings.set('ethanol', 'mhd'); at = clock.now(); }, 50); }
                    return call0(p, method, q, ms);
                };
                await c.car.run(2.5, { want: withEth(c.v) });
                const soon = notReads(c.car).filter((r) => at !== null && r.t > at && r.t - at < 1200);
                await c.car.run(20, { want: withEth(c.v) });
                if (at === null || soon.length || limits(c.car) !== '' || c.v.ethanol().value !== 27) stale.push(what + ': ' + (at === null ? 'never armed' : soon.map(key).join('; ') || limits(c.car) || show(c.v.ethanol())));
            }
            ok(stale.length === 0, 'Off and MHD flex again in one go while the probe, the clear or the definition waits for a busy transport: the waiting one is not handed on, the new steps start from the identification and read the value' + (stale.length ? ' - BUT: ' + stale.join(' | ') : ''));
        }

        // the same switch the moment the steps have asked, while the request still waits its turn in the link's queue
        // (before the Gate has seen it): it is not handed on either
        {
            const stale = [];
            for (const [what, re] of [['the probe', PROBE], ['the clear', CLEAR], ['the definition', DEFINE]]) {
                for (const setting of ['ethanol', 'engineData']) {
                    clock.reset();
                    c = await start(mhd({ active: 27, can: 26 }));
                    const q0 = c.v.link.queue.bind(c.v.link), cc = c, kindOf = { 'the probe': 'probe', 'the clear': 'clear', 'the definition': 'define' }[what];
                    const send0 = c.v.gate.send.bind(c.v.gate);
                    let armed = false, askedGen = null, at = null, want = null;
                    // the Gate's send is wrapped only to see which request is being asked for; the queue's wrapper makes the switch
                    c.v.gate.send = (sid, data, ms, accept, ep) => send0(sid, data, ms, accept, ep);
                    c.v.link.queue = (fn) => {
                        if (!armed && /gate\.send/.test(String(fn)) && cc.v.mhd.state === (kindOf === 'probe' ? 'probe' : 'define') && (kindOf !== 'define' || cc.v.mhd.cleared)) {
                            armed = true; askedGen = cc.v.mhd.gen; at = clock.now();
                            if (setting === 'ethanol') { cc.car.settings.set('ethanol', 'off'); cc.car.settings.set('ethanol', 'mhd'); } else { cc.car.settings.set('engineData', 'off'); cc.car.settings.set('engineData', 'auto'); }
                            want = cc.car.sent.length;
                        }
                        return q0(fn);
                    };
                    await c.car.run(1.5, { want: withEth(c.v) });
                    const soon = at === null ? [] : cc.car.sent.slice(want).filter((r) => READS.indexOf(r.sid) < 0 && r.t - at < 400);
                    await c.car.run(25, { want: withEth(c.v) });
                    if (at === null || soon.length || limits(c.car) !== '' || c.v.ethanol().value !== 27) stale.push(what + ' / ' + setting + ': ' + (at === null ? 'never armed' : soon.map(key).join('; ') || limits(c.car) || show(c.v.ethanol())));
                }
            }
            ok(stale.length === 0, 'the setting switched away and back the moment the steps asked for the probe, the clear or the definition (it still waits its turn in the link\'s queue; 6 cases): it is not handed on, the new steps read the value' + (stale.length ? ' - BUT: ' + stale.join(' | ') : ''));
        }

        // Off and MHD flex again 20 ms after the probe was taken: the step that is out is dropped (no clear follows from it)
        clock.reset();
        c = await start(mhd({ active: 27, can: 26 }));
        {
            const call0 = c.car.ctx.signals.call, cc = c;
            let done = false;
            c.car.ctx.signals.call = (p, method, q, ms) => {
                if (!done && q.serviceID === 0x2F) { done = true; setTimeout(() => { cc.car.settings.set('ethanol', 'off'); cc.car.settings.set('ethanol', 'mhd'); }, 20); }
                return call0(p, method, q, ms);
            };
        }
        await c.car.run(25, { want: withEth(c.v) });
        ok(n(c.car, IDENT) === 2 && n(c.car, PROBE) === 2 && n(c.car, CLEAR) === 1 && n(c.car, DEFINE) === 1 && limits(c.car) === '' && c.v.ethanol().value === 27 && !c.car.logs.some((l) => /^(WARN|ERROR) MHD flex/.test(l)),
            'Off and MHD flex again 20 ms after the probe was handed over: started over, ' + counts(c.car) + ', ' + show(c.v.ethanol()) + ', no warning in the log');

        // Off and MHD flex again 20 ms after the definition was taken: the step that is out is dropped, the run starts over,
        // and what was sent stays counted
        clock.reset();
        c = await start(mhd({ active: 27, can: 26 }));
        {
            const call0 = c.car.ctx.signals.call, cc = c;
            let done = false;
            c.car.ctx.signals.call = (p, method, q, ms) => {
                if (!done && q.serviceID === 0x2C && q.udsData[0] === 0x02) { done = true; setTimeout(() => { cc.car.settings.set('ethanol', 'off'); cc.car.settings.set('ethanol', 'mhd'); }, 20); }
                return call0(p, method, q, ms);
            };
        }
        await c.car.run(1.9, { want: withEth(c.v) });
        const stateThen = c.v.mhd.state;
        await c.car.run(20, { want: withEth(c.v) });
        let d = all(c.car, DEFINE);
        ok(n(c.car, IDENT) === 2 && d.length === 2 && d[1].t - d[0].t >= 5000 && limits(c.car) === '' && c.v.ethanol().value === 27,
            'Off and MHD flex again 20 ms after the definition was handed over: started over (state "' + stateThen + '" right after), and the second definition waits its 5 s (' + Math.round((d[1].t - d[0].t) / 100) / 10 + ' s after the first; 1.8 s in the second version)');

        // a person flipping the setting: Off / MHD flex 40 times, 3 s apart, then once a minute for an hour
        clock.reset();
        c = await start(mhd({ active: 27, can: 26 }));
        for (let i = 0; i < 40; i++) { c.car.settings.set('ethanol', 'off'); await c.car.run(1, { want: withEth(c.v) }); c.car.settings.set('ethanol', 'mhd'); await c.car.run(2, { want: withEth(c.v) }); }
        ok(limits(c.car) === '' && n(c.car, PROBE) <= 3 && n(c.car, CLEAR) <= 3 && n(c.car, DEFINE) <= 3, 'Off and MHD flex 40 times in 2 minutes: ' + counts(c.car) + ' (40 of each in the second version); then "' + c.v.ethanol().why + '"');
        for (let i = 0; i < 60; i++) { c.car.settings.set('ethanol', 'off'); await c.car.run(5, { want: withEth(c.v) }); c.car.settings.set('ethanol', 'mhd'); await c.car.run(55, { want: withEth(c.v) }); }
        ok(limits(c.car) === '' && most(notReads(c.car), 3600000) <= 18, 'and once a minute for an hour more: ' + counts(c.car) + ' in all, never more than ' + most(notReads(c.car), 3600000) + ' requests that are not reads in any hour');
        // stepping through the three sources, 20 s on each (what a workshop comparing them does)
        clock.reset();
        c = await start(mhd({ active: 27, can: 26, extra: { '22:550D': [0x45], '01:52': [0x45] } }));
        for (let i = 0; i < 30; i++) { c.car.settings.set('ethanol', ['mhd', '550d', 'obd52'][i % 3]); await c.car.run(20, { want: withEth(c.v) }); }
        ok(limits(c.car) === '', 'MHD flex, 550D, PID 52 in turn, 20 s each, 10 minutes: ' + counts(c.car));
    });

    await ok.part('L. what counts as a value', async () => {
        const reply = mhdUnit({ active: 0xFF, can: 30 });
        let c = await start(mhd(null, { reply }));
        await c.car.run(8, { want: withEth(c.v) });
        ok(c.v.ethanol().value === null && c.v.ethanol().why === 'not a percentage', 'the tune\'s byte is FF: ' + show(c.v.ethanol()) + ' (the sensor\'s byte is not shown in its place)');
        reply.state.o.active = 101;
        await c.car.run(4, { want: withEth(c.v) });
        ok(c.v.ethanol().value === null, '101: ' + show(c.v.ethanol()));
        reply.state.o.active = 100; reply.state.o.can = 0xFF;
        await c.car.run(4, { want: withEth(c.v) });
        ok(c.v.ethanol().value === 100 && c.v.ethanol().can === null, '100 with a sensor byte of FF: ' + show(c.v.ethanol()) + ', no sensor figure');
        reply.state.o.active = 0; reply.state.o.can = 0;
        await c.car.run(4, { want: withEth(c.v) });
        ok(c.v.ethanol().value === 0 && c.v.ethanol().can === 0, '0 and 0 (petrol): ' + show(c.v.ethanol()));
        // the read stops being answered: the last value is shown for 10 s at most, and nothing is defined again
        clock.reset();
        const r2 = mhdUnit({ active: 55, can: 54 });
        c = await start(mhd(null, { reply: r2, holdMs: 0 }));
        await c.car.run(10, { want: withEth(c.v) });
        ok(c.v.ethanol().value === 55, show(c.v.ethanol()) + ' before');
        r2.state.o.quiet = true;
        const t0 = clock.now();
        let lastSeen = t0;
        await c.car.run(30, { want: withEth(c.v), each: () => { if (c.v.ethanol().value !== null) lastSeen = clock.now(); } });
        ok(lastSeen - t0 <= 10000 && c.v.ethanol().value === null && c.v.ethanol().why === 'no answer', 'the read is no longer answered: the number stays ' + Math.round((lastSeen - t0) / 100) / 10 + ' s and then goes (' + show(c.v.ethanol()) + ')');
        const defs = n(c.car, DEFINE), probes = n(c.car, PROBE);
        await c.car.run(600, { want: withEth(c.v) });
        ok(n(c.car, DEFINE) === defs && n(c.car, PROBE) === probes, '10 more minutes of silence: no new probe and no new definition (only the read is tried, further and further apart)');
        r2.state.o.quiet = false;
        await c.car.run(620, { want: withEth(c.v) });
        ok(c.v.ethanol().value === 55, 'answered again: ' + show(c.v.ethanol()));
    });

    await ok.part('M. the identifier holds something else (another tool defined it)', async () => {
        const reply = mhdUnit({ active: 20, can: 21 });
        const { car, v } = await start(mhd(null, { reply }));
        await car.run(10, { want: withEth(v) });
        reply.state.defined.F303 = [{ place: 'B0001234', size: 1 }, { place: 'B0001235', size: 1 }, { place: 'B0001236', size: 1 }];
        let wrong = false;
        await car.run(15, { want: withEth(v), each: () => { const e = v.ethanol(); if (e.value !== null && e.value !== 20) wrong = true; } });
        ok(!wrong, 'three bytes instead of two: never shown as a value');
        ok(v.ethanol().value === 20 && n(car, DEFINE) === 2, 'read twice, then defined again: ' + show(v.ethanol()));
        // two bytes from places this app never asked for cannot be told apart from ours: nothing to check there
    });

    await ok.part('N. the transport is busy with someone else\'s request', async () => {
        let c = await start(mhd({ active: 70, can: 71 }));
        await c.car.run(0.9, { want: withEth(c.v) });
        c.car.hold(4000);
        await c.car.run(2, { want: withEth(c.v) });
        c.car.hold(3000);
        await c.car.run(12, { want: withEth(c.v) });
        ok(c.v.ethanol().value === 70, 'busy during the set-up: ' + show(c.v.ethanol()) + ' once the transport is free');
        ok(n(c.car, PROBE) === 1 && n(c.car, DEFINE) === 1 && n(c.car, CLEAR) <= 2, 'the probe and the definition were each sent once (' + n(c.car, CLEAR) + ' clear)');
        ok(!c.car.logs.some((l) => /^ERROR/.test(l)), 'no error in the log');

        // aimed at the worst moment: the transport is taken for 1.3 s right after each of our clears is answered
        clock.reset();
        const reply = mhdUnit({ active: 27, can: 26 });
        let car2;
        c = await start(mhd(null, { reply: (target, sid, data, t) => { if (target === 0x12 && sid === 0x2C && data[0] === 0x03) setTimeout(() => car2.hold(1300), 45); return reply(target, sid, data, t); } }));
        car2 = c.car;
        await c.car.run(600, { want: withEth(c.v) });
        ok(n(c.car, CLEAR) === 1 && n(c.car, DEFINE) === 1 && c.v.ethanol().value === 27, 'the transport taken for 1.3 s after every clear, 10 minutes: ' + n(c.car, CLEAR) + ' clear and ' + n(c.car, DEFINE) + ' definition (the definition alone is tried again; 335 clears in the first version), ' + show(c.v.ethanol()));

        // and the definition itself never gets through: every time it is handed over, the transport is busy for 1.5 s
        clock.reset();
        c = await start(mhd({ active: 27, can: 26 }));
        const call0 = c.car.ctx.signals.call, cc = c;
        c.car.ctx.signals.call = (p, method, q, ms) => { if (q.serviceID === 0x2C && q.udsData[0] === 0x02) cc.car.hold(1500); return call0(p, method, q, ms); };
        await c.car.run(3600, { want: withEth(c.v) });
        const cl = all(c.car, CLEAR);
        ok(n(c.car, DEFINE) === 0 && limits(c.car) === '' && cl.length <= 6 && /^(transport busy|paused, too many tries)$/.test(c.v.ethanol().why),
            'the transport busy at every definition, 60 minutes: no definition reached it, ' + cl.length + ' clears (at ' + secs(cl).join(', ') + ' s), ' + show(c.v.ethanol()));
        const sent = c.car.logs.filter((l) => /define F303 .* sent to the engine unit/.test(l)).length, away = c.car.logs.filter((l) => /define F303 .* not taken by the transport/.test(l)).length;
        ok(sent === 0 && away > 0 && c.v.gate.stats.sent === n(c.car, PROBE) + cl.length && c.v.gate.stats.turnedAway === away,
            'the log and the count say what happened: no "define ... sent to the engine unit", ' + away + ' times "not taken by the transport"; counted as sent: the probe and the clears only');
        const warns = c.car.logs.filter((l) => /^WARN MHD flex: the transport took nothing 5 times in a row, next try in \d+ s$/.test(l)).map((l) => l.replace(/.* in (\d+) s$/, '$1'));
        ok(warns.slice(0, 2).join() === '5,15' && away >= 10 && c.car.logs.filter((l, i, a) => /not taken by the transport/.test(l) && i < a.findIndex((x) => /took nothing 5 times/.test(x))).length === 5,
            '5 tries, then a wait of 5 s; 5 more, then 15 s (waits logged: ' + warns.join(', ') + ' s)');
        // a hand-over that fails without the transport's "busy" may have left all the same: it is counted
        clock.reset();
        c = await start(mhd({ active: 27, can: 26 }));
        {
            const c0 = c.car.ctx.signals.call;
            c.car.ctx.signals.call = (p, method, q, ms) => { const r = c0(p, method, q, ms); return q.serviceID === 0x2C && q.udsData[0] === 0x02 ? r.then(() => { throw new Error('call timed out'); }) : r; };
        }
        await c.car.run(3600, { want: withEth(c.v) });
        ok(limits(c.car) === '' && n(c.car, DEFINE) <= 6 && c.v.gate.stats.unknown === n(c.car, DEFINE) && c.car.logs.some((l) => /^WARN MHD flex: define F303 .* handed over, what became of it is not known \(call timed out\)$/.test(l)),
            'the call for the definition fails after the transport took it, 60 minutes: ' + counts(c.car) + ', each counted, the limits hold');
        // the same for every 2C request (no definition is ever reached, so only the clear's own count can hold it)
        clock.reset();
        c = await start(mhd({ active: 27, can: 26 }));
        {
            const c0 = c.car.ctx.signals.call;
            c.car.ctx.signals.call = (p, method, q, ms) => { const r = c0(p, method, q, ms); return q.serviceID === 0x2C ? r.then(() => { throw new Error('call timed out'); }) : r; };
        }
        await c.car.run(3600, { want: withEth(c.v) });
        ok(limits(c.car) === '' && n(c.car, CLEAR) === 6 && n(c.car, DEFINE) === 0, 'the call for every clear fails after the transport took it, 60 minutes: ' + counts(c.car) + ', the limits hold');
        // the transport answers the hand-over with a verdict that is neither "taken" nor "busy"
        clock.reset();
        {
            const tuned = mhdUnit({ active: 27, can: 26 });
            c = await start(mhd(null, { reply: (target, sid, data, t) => (target === 0x12 && sid === 0x2F ? 'TARGET_NOT_REACHABLE' : tuned(target, sid, data, t)) }));
        }
        await c.car.run(3600, { want: withEth(c.v) });
        ok(c.v.gate.stats.unknown === 6 && c.v.gate.stats.turnedAway === 0 && c.v.gate.stats.sent === 0 && c.v.gate.stats.limited >= 1
            && c.car.logs.filter((l) => /^WARN MHD flex: probe .* handed over, what became of it is not known \(transport refused: TARGET_NOT_REACHABLE\)$/.test(l)).length === 6,
            'the transport answers the probe\'s hand-over "TARGET_NOT_REACHABLE", 60 minutes: handed over 6 times, each counted and logged as "what became of it is not known" (not as "not taken"); then ' + show(c.v.ethanol()));
        // an engine unit that never answers the probe (and answers everything else)
        clock.reset();
        c = await start(mhd({ probeSilent: true }, { holdMs: 0 }));
        await c.car.run(3600, { want: withEth(c.v) });
        ok(limits(c.car) === '' && n(c.car, PROBE) === 6 && n(c.car, /^2C /) === 0, 'the probe never answered, 60 minutes: ' + n(c.car, PROBE) + ' probes (at ' + secs(all(c.car, PROBE)).join(', ') + ' s), no clear and no definition');
    });

    await ok.part('O. replies that were meant for another app (every app hears every reply)', async () => {
        // a frame 7F 22 31 arrives while our read of the value is out
        let hit = 0, every = 0, car1;
        const r1 = mhdUnit({ active: 27, can: 26 });
        let c = await start(mhd(null, { reply: (target, sid, data, t) => {
            if (target === 0x12 && sid === 0x22 && data[0] === 0xF3 && (every ? ++hit % every === 0 : ++hit === 5)) setTimeout(() => car1.inject([0x7F, 0x22, 0x31]), 10);
            return r1(target, sid, data, t);
        } }));
        car1 = c.car;
        let gone = false;
        await c.car.run(30, { want: withEth(c.v), each: () => { if (hit >= 5 && c.v.ethanol().value === null) gone = true; } });
        ok(hit >= 5 && n(c.car, DEFINE) === 1 && n(c.car, CLEAR) === 1 && c.v.ethanol().value === 27, 'one refusal 7F 22 31 during our read: no new clear, no new definition (' + n(c.car, DEFINE) + ' definition in all), ' + show(c.v.ethanol()));
        ok(!gone, 'and the number stayed on the screen');
        hit = 0; every = 2;
        await c.car.run(600, { want: withEth(c.v) });
        ok(hit > 100 && n(c.car, DEFINE) === 1 && n(c.car, CLEAR) === 1 && c.v.ethanol().value === 27, 'the same at every second read for 10 minutes: still ' + n(c.car, DEFINE) + ' definition (658 an hour in the first version)');
        hit = 0; every = 1;
        await c.car.run(3600, { want: withEth(c.v) });
        ok(limits(c.car) === '' && n(c.car, DEFINE) <= 7, 'at every read for an hour (two in a row are believed): ' + counts(c.car) + ' in all, the limits hold');

        // a frame 7F 2C 31 arrives while our definition is out (the usual answer to another app's clear)
        clock.reset();
        let car2, once = false;
        const r2 = mhdUnit({ active: 27, can: 26 });
        c = await start(mhd(null, { reply: (target, sid, data, t) => {
            if (target === 0x12 && sid === 0x2C && data[0] === 0x02 && !once) { once = true; setTimeout(() => car2.inject([0x7F, 0x2C, 0x31]), 10); }
            return r2(target, sid, data, t);
        } }));
        car2 = c.car;
        await c.car.run(20, { want: withEth(c.v) });
        ok(once && n(c.car, /^2C .. F3 01/) === 0 && n(c.car, /^2C 02 F3 03 /) === 2 && n(c.car, /^22 F3 03$/) >= 1 && c.v.ethanol().value === 27,
            'a refusal 7F 2C 31 during our definition: F303 is asked for once more and read (' + show(c.v.ethanol()) + '); F301 is not taken as well');

        // a frame 7F 2F 31 arrives while our probe is out
        clock.reset();
        let car3, once3 = false;
        const r3 = mhdUnit({ active: 27, can: 26 });
        c = await start(mhd(null, { reply: (target, sid, data, t) => {
            if (target === 0x12 && sid === 0x2F && !once3) { once3 = true; setTimeout(() => car3.inject([0x7F, 0x2F, 0x31]), 10); }
            return r3(target, sid, data, t);
        } }));
        car3 = c.car;
        await c.car.run(15, { want: withEth(c.v) });
        ok(once3 && n(c.car, PROBE) === 2 && c.v.ethanol().value === 27, 'a refusal 7F 2F 31 during our probe, on a car that has the tune: the probe is asked once more and the value is read (' + show(c.v.ethanol()) + '), not "no MHD tune found" for 10 minutes');

        // frames that are too short to be a reply: the link logs each once, whatever the setting (the Gate listens only while a request of its own is out)
        for (const src of ['550d', 'mhd']) {
            clock.reset();
            c = await start(mhd({ active: 27, can: 26, extra: { '22:550D': [0x45] } }, { settings: { ethanol: src } }));
            await c.car.run(10, { want: withEth(c.v) });
            const short0 = c.car.logs.filter((l) => /short TASU frame/.test(l)).length;
            for (let i = 0; i < 3; i++) { c.car.injectRaw([1, 2, 3]); await c.car.run(1, { want: withEth(c.v) }); }
            ok(c.car.logs.filter((l) => /short TASU frame/.test(l)).length - short0 === 3, 'Ethanol reading "' + src + '": three frames too short to be a reply are logged three times, not six');
        }
    });

    await ok.part('P. when the count of failures starts afresh, and a step that cannot be sent', async () => {
        // two refusals, then the engine unit takes the definition: the failures are forgotten only once the identifier has lasted a minute
        const reply = mhdUnit({ active: 27, can: 26, defineNrc: 0x22 });
        let c = await start(mhd(null, { reply }));
        await c.car.run(12, { want: withEth(c.v) });
        reply.state.o.defineNrc = 0;
        await c.car.run(40, { want: withEth(c.v) });
        const early = c.v.mhd.errors;
        ok(c.v.ethanol().value === 27 && early === 2, 'a definition refused twice, then taken: ' + show(c.v.ethanol()) + ', and the two failures still count (' + early + ')');
        await c.car.run(60, { want: withEth(c.v) });
        ok(c.v.mhd.errors === 0, 'once the identifier has read for a minute they are forgotten (failures ' + c.v.mhd.errors + ')');
        // a step that throws something that is no verdict of the transport
        clock.reset();
        c = await start(mhd());
        c.v.gate.send = () => Promise.reject(new Error('made up for the test'));
        await c.car.run(10, { want: withEth(c.v) });
        ok(c.v.ethanol().why === 'not sent' && notReads(c.car).length === 0 && c.car.logs.some((l) => /^WARN MHD flex: made up for the test, next try in 5 s$/.test(l)), 'a step that fails inside the app: ' + show(c.v.ethanol()) + ', logged, tried again after the wait');
    });

    ok.done();
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
