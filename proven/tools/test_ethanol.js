'use strict';
/**
 * test_ethanol.js <built app: dist/pps_gauges> - the ethanol read-out's data side (the slot in vitals.js) against
 * stand-in engine units on a stand-in diagnostic transport (fakecar.js), in time the test moves by hand.
 * Simulations: nobody has recorded what a real engine unit answers to these identifiers, with or without a
 * flex-fuel set-up. What is checked is that the read-out can only show a fresh answer, and what it costs the
 * other gauges when there is none.
 */
const { clock, makeCar, healthy, keyOf, checker } = require('./fakecar');
const APP = process.argv[2];
const ok = checker();
const BOOST = ['iat', 'hpfp', 'lpfp', 'timing', 'boostCtl'];
const ETH = /^(550D|F452|OBD 52)@12$/;
const withEth = (v) => () => BOOST.concat(v.boostFromDme() ? ['boost'] : [], ['ethanol']);
const eth = (car) => car.sent.filter((r) => ETH.test(keyOf(r)));
const show = (e) => (!e.on ? 'not shown' : e.value === null ? 'NO READING (' + e.why + ')' : 'E' + Math.round(e.value) + ' [' + e.source + ']');
const start = async (opts) => { const car = makeCar(APP, opts), v = car.vitals(); await clock.advance(10); return { car, v }; };

clock.install();
(async () => {
    let baseIat;
    await ok.part('A. as shipped: the setting is off and nothing is asked', async () => {
        const { car, v } = await start({ reply: healthy({ '22:550D': [0x66], '01:52': [0x66] }) });
        ok(car.values.ethanol === 'off', 'Ethanol reading: Off as shipped');
        const s = car.ctx.spec.settings.find((x) => x.key === 'ethanol');
        ok(s.when && s.when.workshop === true && car.values.workshop === false, 'and it is offered under Workshop settings only');
        ok(s.options.map((o) => o[0]).join() === 'off,550d,obd52,mhd', 'choices: ' + s.options.map((o) => o[1]).join(' / ') + ' (the last one has its own test, test_mhdflex.js)');
        await car.run(600, { want: withEth(v) });
        ok(eth(car).length === 0, 'no ethanol request in 10 minutes, even with the read-out asked for');
        ok(v.ethanol().on === false && v.ethanol().value === null, 'nothing to draw');
        baseIat = car.count(/^F40F@12$/);
    });

    await ok.part('B. Engine unit value (550D), the engine unit answers 66', async () => {
        const { car, v } = await start({ settings: { ethanol: '550d' }, reply: healthy({ '22:550D': [0x66], '01:52': [0x33] }) });
        await car.run(5, { want: withEth(v) });
        const e = v.ethanol();
        ok(e.on && e.value !== null && Math.abs(e.value - 40) < 0.01 && e.source === '550D', show(e) + ' within 5 s of opening the Boost set (0x66 x 100 / 255 = 40.0), with the identifier that answered');
        await car.run(595, { want: withEth(v) });
        const n = eth(car).length, gaps = eth(car).map((r, i, a) => (i ? r.t - a[i - 1].t : 0)).slice(1);
        ok(n >= 15 && n <= 21, n + ' ethanol requests in 10 minutes');
        ok(Math.min.apply(null, gaps) >= 30000, 'never two within 30 s (shortest gap ' + Math.min.apply(null, gaps) + ' ms)');
        ok(eth(car).every((r) => keyOf(r) === '550D@12'), 'only 550D is asked: the OBD value is never tried behind the workshop\'s back');
        const iat = car.count(/^F40F@12$/);
        ok(Math.abs(iat - baseIat) / baseIat < 0.02, 'the other gauges keep their rate: ' + iat + ' intake-air reads in 10 minutes against ' + baseIat + ' with the setting off');
        ok(car.logs.some((l) => /^info raw ethanol 550D: "62 55 0D 66 = 40"$/.test(l)), 'the first raw reply is in the log: raw ethanol 550D: "62 55 0D 66 = 40"');
    });

    await ok.part('C. one source per car, no fallback from one to the other', async () => {
        let c = await start({ settings: { ethanol: 'obd52' }, reply: healthy({ '22:550D': [0x66], '01:52': [0x80] }) });
        await c.car.run(10, { want: withEth(c.v) });
        let e = c.v.ethanol();
        ok(e.value !== null && Math.abs(e.value - 50.196) < 0.01 && e.source === 'OBD 52', 'OBD value (PID 52) chosen, the engine unit answers 80: ' + show(e));
        ok(eth(c.car).every((r) => keyOf(r) === 'OBD 52@12'), '550D is never asked');
        clock.reset();
        c = await start({ settings: { ethanol: '550d' }, reply: healthy({ '01:52': [0x80] }) });
        await c.car.run(120, { want: withEth(c.v) });
        e = c.v.ethanol();
        ok(e.on && e.value === null && e.why === 'not on this car', '550D chosen, the engine unit refuses it and would answer PID 52: ' + show(e));
        ok(eth(c.car).length === 1 && keyOf(eth(c.car)[0]) === '550D@12', 'PID 52 is not asked in its place (1 request in 2 minutes, to 550D)');
        clock.reset();
        c = await start({ settings: { ethanol: 'obd52' }, reply: healthy({ '01:52': { nrc: 0x12 }, '22:F452': [0x4D] }) });
        await c.car.run(10, { want: withEth(c.v) });
        e = c.v.ethanol();
        ok(e.value !== null && Math.round(e.value) === 30 && e.source === 'F452', 'OBD value chosen, service 01 refused: the same PID over UDS answers, ' + show(e));
        // the workshop changes the source: nothing of the old one stays
        c.car.settings.set('ethanol', '550d');
        ok(c.v.ethanol().value === null, 'the source is changed in Settings: the other source\'s number is gone at once (' + show(c.v.ethanol()) + ')');
    });

    await ok.part('D. the engine unit says it has no such value', async () => {
        const { car, v } = await start({ settings: { ethanol: 'obd52' }, reply: healthy({ '01:52': { nrc: 0x12 } }) });
        await car.run(300, { want: withEth(v) });
        ok(v.ethanol().value === null && v.ethanol().why === 'not on this car', show(v.ethanol()));
        ok(eth(car).length === 2, '2 requests in the first 5 minutes (PID 52 over OBD and over UDS), then a 10 minute rest');
        await car.run(600, { want: withEth(v) });
        ok(eth(car).length === 4, '2 more after the rest (' + eth(car).length + ' in 15 minutes)');
        ok(v.ethanol().value === null, 'still no number');
    });

    await ok.part('E. the engine unit does not answer 550D at all (it answers everything else)', async () => {
        for (const holdMs of [0, 3000, 6000, 8000, 12000, 20000]) {
            clock.reset();
            const { car, v } = await start({ settings: { ethanol: '550d' }, holdMs, reply: healthy({ '22:550D': null }) });
            let n = 0, stale = 0, maxFail = 0;
            await car.run(900, { want: withEth(v), each: (i) => {
                if (i % 6 || i < 200) return;
                n++; if (BOOST.some((k) => !v.fresh(k))) stale++;
                BOOST.concat(['boostTarget', 'boostActual']).forEach((k) => { maxFail = Math.max(maxFail, v.dmeFail[k] || 0); });
            } });
            const un = car.sent.filter((r) => !r.answered);
            const line = 'transport held ' + holdMs / 1000 + ' s: ' + un.length + ' unanswered requests in 15 minutes, the other values stale in ' + stale + ' of ' + n + ' samples, most failures counted in a row ' + maxFail;
            if (holdMs <= 12000) ok(un.length <= 4 && un.every((r) => keyOf(r) === '550D@12') && stale === 0 && maxFail === 0 && v.rd.pick.iat === 0, line);
            else ok(un.length <= 4 && maxFail === 0 && v.rd.pick.iat === 0 && stale / n < 0.03, line + ' (a hold longer than the 15 s the tiles keep a value)');
            if (holdMs === 8000) {
                ok(v.ethanol().value === null && v.ethanol().why === 'no answer to 550D', show(v.ethanol()));
                const t = un.map((r) => Math.round((r.t - car.sent[0].t) / 1000));
                ok(t.length === 4 && t[1] - t[0] < 40 && t[2] - t[1] < 40 && t[3] - t[2] >= 600, 'asked at ' + t.join(', ') + ' s: three tries 30 s apart, then one per 10 minute rest');
            }
        }
    });

    await ok.part('F. demo data on', async () => {
        const { car, v } = await start({ settings: { ethanol: '550d', demo: 'on' }, reply: healthy({ '22:550D': [0x66] }) });
        await car.run(60, { want: withEth(v) });
        ok(v.usingDemo() && car.sent.length === 0, 'demo: no request to any unit');
        ok(v.ethanol().on && v.ethanol().value === null && v.ethanol().why === 'demo: not read', 'demo: ' + show(v.ethanol()) + ', never a number');
        ok(Object.keys(v.data()).every((k) => !/eth/i.test(k)), 'the demo drive has no ethanol value');
    });

    await ok.part('G. Engine unit data: Off; no diagnostic link', async () => {
        let c = await start({ settings: { ethanol: '550d', engineData: 'off' }, reply: healthy({ '22:550D': [0x66] }) });
        await c.car.run(60, { want: withEth(c.v) });
        ok(c.car.sent.length === 0 && c.v.ethanol().why === 'engine data off', 'Engine unit data: Off: no request, ' + show(c.v.ethanol()));
        clock.reset();
        c = await start({ settings: { ethanol: '550d' }, noLink: true, reply: healthy() });
        await c.car.run(5, { want: withEth(c.v) });
        ok(c.v.ethanol().value === null && c.v.ethanol().why === 'no diagnostic link', 'no link: ' + show(c.v.ethanol()));
    });

    await ok.part('H. the engine unit asleep at first, awake after 60 s; a head unit that cannot reach it at all', async () => {
        let awake = false;
        const h = healthy({ '22:550D': [0x33] });
        let c = await start({ settings: { ethanol: '550d' }, reply: (a, b, d) => (awake || a !== 0x12 ? h(a, b, d) : null) });
        await c.car.run(60, { want: withEth(c.v) });
        ok(eth(c.car).length === 0, 'asleep: ethanol is not asked (silence would be read as "not this identifier")');
        ok(c.v.ethanol().value === null && c.v.ethanol().why === 'engine unit not answering', show(c.v.ethanol()));
        awake = true;
        await c.car.run(60, { want: withEth(c.v) });
        ok(c.v.ethanol().value !== null && Math.round(c.v.ethanol().value) === 20, 'awake: ' + show(c.v.ethanol()) + ' within a minute');
        clock.reset();
        c = await start({ settings: { ethanol: '550d' }, holdMs: 6000, reply: (a, b, d) => (a === 0x12 ? null : h(a, b, d)) });
        await c.car.run(300, { want: withEth(c.v) });
        ok(eth(c.car).length === 0 && c.v.ethanol().value === null, 'never reachable: 0 ethanol requests in 5 minutes, ' + show(c.v.ethanol()));
    });

    await ok.part('I. leaving the Boost set', async () => {
        const { car, v } = await start({ settings: { ethanol: '550d' }, reply: healthy({ '22:550D': [0x66] }) });
        await car.run(40, { want: withEth(v) });
        const n = eth(car).length;
        await car.run(200, { want: BOOST });                    // another set: the read-out is not on screen
        ok(eth(car).length === n, 'no ethanol request while its read-out is not on screen');
        ok(v.ethanol().value === null, 'a reading older than 100 s is not shown: ' + show(v.ethanol()));
        await car.run(5, { want: withEth(v) });
        ok(v.ethanol().value !== null, 'back on the Boost set: read again within 5 s');
    });

    await ok.part('J. what counts as a reading', async () => {
        const one = async (raw) => { clock.reset(); const c = await start({ settings: { ethanol: '550d' }, reply: healthy({ '22:550D': [raw] }) }); await c.car.run(5, { want: withEth(c.v) }); return c.v.ethanol(); };
        let e = await one(0xD9);
        ok(Math.round(e.value) === 85, 'raw D9 (217): ' + show(e) + ' - the scale is x 100 / 255, not raw = per cent');
        e = await one(0x00);
        ok(e.value === 0, 'raw 00: ' + show(e) + ' (an engine unit without a sensor may answer this: why the setting ships off)');
        e = await one(0xFF);
        ok(e.on && e.value === null && e.why === 'not a plausible value', 'raw FF, the usual "no value" of a one-byte field: ' + show(e) + ', not E100');
        e = await one(0xF0);
        ok(e.value === null && e.why === 'not a plausible value', 'raw F0 (94 %): ' + show(e));
    });

    await ok.part('K. a reading never outlives the engine unit\'s next answer, nor 100 s without one', async () => {
        let raw = [0x66], dead = false;
        const { car, v } = await start({ settings: { ethanol: '550d' }, reply: (a, b, d) => healthy({ '22:550D': dead ? null : raw })(a, b, d) });
        await car.run(10, { want: withEth(v) });
        ok(Math.round(v.ethanol().value) === 40, show(v.ethanol()));
        raw = { nrc: 0x31 };
        await car.run(35, { want: withEth(v) });
        ok(v.ethanol().value === null, 'the engine unit then refuses the identifier: ' + show(v.ethanol()) + ' at its next answer, not the last number');
        // (one refusal may have been meant for another app's request: every app hears every reply. It is asked again)
        raw = [0x66];
        await car.run(35, { want: withEth(v) });
        ok(Math.round(v.ethanol().value) === 40, 'and when it answers again 30 s later: ' + show(v.ethanol()) + ' (a refusal of an identifier that has answered is not taken as "not on this car" for 10 minutes)');
        raw = [0x1A]; clock.reset();
        const c = await start({ settings: { ethanol: '550d' }, reply: (a, b, d) => healthy({ '22:550D': dead ? null : raw })(a, b, d) });
        await c.car.run(10, { want: withEth(c.v) });
        ok(Math.round(c.v.ethanol().value) === 10, show(c.v.ethanol()));
        dead = true;
        await c.car.run(85, { want: withEth(c.v) });
        ok(Math.round(c.v.ethanol().value) === 10, 'the identifier is no longer answered: the reading is kept while it is under 100 s old');
        await c.car.run(20, { want: withEth(c.v) });
        ok(c.v.ethanol().value === null && c.v.ethanol().why === 'no answer to 550D', 'and then: ' + show(c.v.ethanol()));
    });

    await ok.part('X. the ethanol sceptic\'s scenarios', async () => {
        // X1: "conditions not correct" for the first 20 s, then a value
        let t0 = null;
        const h1 = healthy({ '22:550D': { nrc: 0x22 } }), h2 = healthy({ '22:550D': [0x66] });
        let c = await start({ settings: { ethanol: '550d' }, reply: (a, b, d, t) => { if (t0 === null) t0 = t; return (t - t0 < 20000 ? h1 : h2)(a, b, d); } });
        let first = null;
        for (let s = 1; s <= 900 && first === null; s++) { await c.car.run(1, { want: withEth(c.v) }); if (c.v.ethanol().value !== null) first = s; }
        ok(first !== null && first <= 65, 'X1. 550D refused with "conditions not correct" for the first 20 s: first value after ' + first + ' s (the prototype rested 10 minutes: 597 s)');
        // X2: the very first reply is lost
        clock.reset();
        let lost = false;
        c = await start({ settings: { ethanol: '550d' }, holdMs: 3000, reply: (a, b, d) => { if (!lost && a === 0x12 && b === 0x22 && d[0] === 0x55 && d[1] === 0x0D) { lost = true; return null; } return h2(a, b, d); } });
        first = null;
        for (let s = 1; s <= 900 && first === null; s++) { await c.car.run(1, { want: withEth(c.v) }); if (c.v.ethanol().value !== null) first = s; }
        ok(first !== null && first <= 40, 'X2. the first 550D reply is lost once: first value after ' + first + ' s (598 s)');
        // X3: boost from the engine unit, 550D never answered
        const gap = {};
        for (const on of [false, true]) {
            clock.reset();
            c = await start({ settings: { ethanol: on ? '550d' : 'off', boostSource: 'dme' }, holdMs: 3000, reply: healthy({ '22:550D': null }) });
            await c.car.run(120, { want: withEth(c.v), fes: false });
            const b = c.car.sent.filter((r) => keyOf(r) === 'F470@12' && r.t - c.car.sent[0].t > 2000);
            gap[on] = Math.max.apply(null, b.map((r, i, a) => (i ? r.t - a[i - 1].t : 0)));
        }
        ok(gap[true] <= 3000 + 3000, 'X3. boost read from the engine unit, 550D never answered, transport held 3 s: longest gap between two boost reads ' + gap[true] + ' ms with ethanol on, ' + gap[false] + ' ms with it off (the prototype\'s pause: 9955 ms)');
        // X5: the wall clock set back an hour, and the engine unit's answer changes
        clock.reset();
        let val = 0x66;
        c = await start({ settings: { ethanol: '550d' }, reply: (a, b, d) => healthy({ '22:550D': [val] })(a, b, d) });
        await c.car.run(10, { want: withEth(c.v) });
        const before = eth(c.car).length;
        clock.wall(-3600000); val = 0x1A;
        await c.car.run(45, { want: withEth(c.v) });
        ok(Math.round(c.v.ethanol().value) === 10 && eth(c.car).length > before, 'X5. E40 shown, then the clock is set back an hour and the engine unit answers E10: ' + show(c.v.ethanol()) + ' within 45 s (the prototype showed E40 for another 10 minutes and did not ask)');
    });
    ok.done();
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
