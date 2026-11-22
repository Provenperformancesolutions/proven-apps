'use strict';
/**
 * test_engine_unit.js <built app: dist/pps_gauges> - the engine unit and the gearbox unit as Proven Gauges asks them,
 * against stand-in units on a stand-in diagnostic transport (fakecar.js), in time the test moves by hand:
 * a unit that does not answer, an engine start after it slept, a busy transport, boost against target, ceilings,
 * the oil fall-back, a diesel's rail pressure, the head unit's clock set back. Simulations: the figures are not
 * car measurements.
 */
const { clock, makeCar, healthy, keyOf } = require('./fakecar');
const APP = process.argv[2];
const ok = require('./fakecar').checker();
const BOOST = ['iat', 'hpfp', 'lpfp', 'timing', 'boostCtl'];
const wantBoost = (v) => () => BOOST.concat(v.boostFromDme() ? ['boost'] : []);
const r2 = (x) => Math.round(x * 100) / 100;
const unanswered = (car, target) => car.sent.filter((r) => !r.answered && (target === undefined || r.target === target));
const rpm = (car, raw) => car.handlers.CDS.statusEngineSpeed2({ actualValueRPMEngineCrankshaft: raw });
/** Drive on (engine running) for max seconds: after how many of them every value of the Boost set was fresh (Infinity: never). */
async function backIn(car, v, max) {
    const t0 = clock.now();
    let at = Infinity;
    await car.run(max, { want: wantBoost(v), each: () => { if (at === Infinity && BOOST.every((k) => v.fresh(k))) at = Math.round((clock.now() - t0) / 100) / 10; } });
    return at;
}

clock.install();
(async () => {
    let base;
    await ok.part('both units answer: the Boost set for 10 minutes', async () => {
        const car = makeCar(APP, { reply: healthy() }), v = car.vitals();
        await clock.advance(10);
        let stale = 0, n = 0;
        await car.run(600, { want: wantBoost(v), each: (i) => { if (i % 6 === 0 && i > 300) { n++; if (BOOST.some((k) => !v.fresh(k))) stale++; } } });
        const d = v.data();
        ok(d.iat === 30 && d.hpfp === 300 && Math.abs(d.lpfp - 5.4) < 1e-9 && d.timing === 8, 'intake air 30 deg C, rail 300 bar, feed 5.4 bar, timing 8 deg');
        ok(Math.abs(d.boostTarget - 0.79) < 1e-9 && Math.abs(d.boostActual - 0.75) < 1e-9, 'boost target 0.79 bar, actual 0.75 bar (absolute 180 / 176 kPa less 101 kPa outside)');
        ok(stale === 0, 'every engine-unit value fresh in every one of ' + n + ' samples');
        base = { iat: car.count(/^F40F@12$/), egs: car.count(/@18$/), all: car.sent.length };
        ok(base.iat > 600, base.iat + ' intake-air reads, ' + base.egs + ' gearbox-unit reads, ' + base.all + ' requests in all (' + r2(base.all / 600) + ' a second)');
        ok(car.logs.some((l) => /^info raw DME F40F: "62 F4 0F 46 = 30"$/.test(l)), 'the first engine-unit replies are in the log: raw DME F40F: "62 F4 0F 46 = 30"');
        ok(car.logs.some((l) => /^info raw EGS 6000: "62 60 00 5A = 50"$/.test(l)), 'and the gearbox unit\'s ("raw EGS", as app.json says): raw EGS 6000: "62 60 00 5A = 50"');
        ok(car.logs.some((l) => /^info raw DME 4AB0: /.test(l)) && car.logs.some((l) => /^info raw DME 580B: /.test(l)), 'boost target and actual too');
    });

    // gauges-B6: one unit silent must not freeze the other's values
    for (const holdMs of [0, 6000]) {
        await ok.part('the gearbox unit never answers (a manual car), transport ' + (holdMs ? 'held ' + holdMs / 1000 + ' s by a request nobody answers' : 'free again at once') + ': the Boost set for 10 minutes (gauges-B6)', async () => {
            const h = healthy();
            const car = makeCar(APP, { holdMs, reply: (a, b, c) => (a === 0x18 ? null : h(a, b, c)) }), v = car.vitals();
            await clock.advance(10);
            let n = 0, stale = 0, lastAt = null, maxGap = 0, old2 = 0, maxFail = 0;
            await car.run(600, { want: wantBoost(v), each: (i) => {
                if (i % 6 || i < 300) return;
                n++;
                if (BOOST.some((k) => !v.fresh(k))) stale++;
                BOOST.concat(['boostTarget', 'boostActual']).forEach((k) => { maxFail = Math.max(maxFail, v.dmeFail[k] || 0); });
                const at = v.dmeAt.boostCtl;
                if (lastAt !== null && at !== lastAt) maxGap = Math.max(maxGap, at - lastAt);
                lastAt = at;
                if (clock.now() - at > 2000 && !holdMs) old2++;
            } });
            const egs = car.count(/@18$/);
            ok(egs <= 8, egs + ' requests to the silent gearbox unit in 10 minutes: 3, then one after 30 s, 1, 2 and 5 minutes (it was 36)');
            ok(car.logs.some((l) => /EGS: no answer to 3 requests in a row - left alone/.test(l)), 'the log says the gearbox unit was given up');
            ok(v.dmeWhy('egs') === 'not answering', 'its tile says "' + v.dmeWhy('egs') + '"');
            ok(stale === 0, 'the engine unit\'s values stayed fresh in every one of ' + n + ' samples');
            ok(maxFail === 0, 'and none of them was counted as failed');
            ok(v.rd.pick.iat === 0 && v.data().iat === 30, 'intake air is still read from its first identifier (F40F)');
            if (!holdMs) {
                ok(maxGap < 3000, 'longest wait between two boost-target readings ' + Math.round(maxGap) + ' ms (it was 8.5 s, 17 times)');
                ok(old2 / n < 0.01, 'boost target older than 2 s for ' + (100 * old2 / n).toFixed(1) + ' % of the time (it was 19 %)');
                const iat = car.count(/^F40F@12$/);
                ok(iat > base.iat * 0.97, 'the engine unit is read as often as on a car with a gearbox unit: ' + iat + ' intake-air reads against ' + base.iat);
            } else ok(maxGap < 6000 + 2500, 'longest wait between two boost-target readings ' + Math.round(maxGap) + ' ms: one hold of the transport, not more');
        });
    }

    await ok.part('the gateway turns every request to the gearbox unit away at once (TARGET_NOT_REACHABLE): 10 minutes on the Track set', async () => {
        const h = healthy({ '01:5C': [0x94] });
        const car = makeCar(APP, { settings: { boostSource: 'dme' }, reply: (a, b, c) => (a === 0x18 ? 'TARGET_NOT_REACHABLE' : h(a, b, c)) }), v = car.vitals();
        await clock.advance(10);
        const noOil = (n) => { car.handlers.CDS.statusEngineSpeed2({ actualValueRPMEngineCrankshaft: 12000 + (n % 2) * 4 }); };
        let n = 0, stale = 0;
        // (Track asks for no engine-unit value: everything is read in the slow round, the gearbox unit among it)
        await car.run(600, { want: [], feed: noOil, each: (i) => { if (i % 60 === 0 && i > 1900) { n++; if (!v.fresh('boost') || !v.fresh('iat') || v.data().oil !== 108) stale++; } } });
        ok(car.count(/@18$/) <= 8, car.count(/@18$/) + ' requests to the gearbox unit in 10 minutes: given up like a unit that is silent');
        ok(stale === 0 && Math.abs(v.data().boost - 0.75) < 0.001, 'the values read after it in the round (boost and the oil fall-back from the engine unit) stayed fresh in every one of ' + n + ' samples');
    });

    // the gauges sceptic's added fault: a head unit that cannot reach the engine unit at all
    for (const o of [{ holdMs: 4000, screen: true }, { holdMs: 8000, screen: true }, { holdMs: 6000, screen: false }]) {
        await ok.part('the engine unit never answers, the gearbox unit does, transport held ' + o.holdMs / 1000 + ' s, ' + (o.screen ? 'the Boost set on screen' : 'the app closed, engine running') + ': 10 minutes', async () => {
            const h = healthy();
            const car = makeCar(APP, { holdMs: o.holdMs, reply: (a, b, c) => (a === 0x12 ? null : h(a, b, c)) }), v = car.vitals();
            await clock.advance(10);
            let n = 0, egsFresh = 0;
            await car.run(600, { screen: o.screen, want: wantBoost(v), each: (i) => { if (i % 60 === 0 && i > 1900) { n++; if (v.fresh('egs')) egsFresh++; } } });
            const un = unanswered(car, 0x12).length;
            ok(un <= 8, un + ' unanswered requests to the engine unit in 10 minutes (it was 47 to 93)');
            ok(car.logs.some((l) => /DME: no answer to 3 requests in a row - left alone/.test(l)), 'the log says the engine unit was given up');
            ok(egsFresh / n > 0.9, 'the gearbox unit, on its own footing, stayed fresh ' + Math.round(100 * egsFresh / n) + ' % of the time (it was 34 to 57 %)');
            ok(v.live.egs === 50, 'gearbox temperature 50 deg C');
            ok(v.dmeWhy('iat') === 'not answering' && v.dmeWhy('boostCtl') === 'not answering', 'the engine-unit tiles say "' + v.dmeWhy('iat') + '"');
            ok(/engine unit: not answering/.test((car.values.boostSource = 'dme', v.boostWhy())), 'the boost dial, asked to use the engine unit: "' + v.boostWhy() + '"');
        });
    }

    await ok.part('the engine unit asleep at first, awake after 60 s; and an engine start', async () => {
        let awake = false;
        const h = healthy();
        const car = makeCar(APP, { reply: (a, b, c) => (a === 0x12 && !awake ? null : h(a, b, c)) }), v = car.vitals();
        await clock.advance(10);
        await car.run(60, { want: wantBoost(v) });
        ok(v.data().iat === undefined && v.dmeWhy('iat') === 'not answering', 'asleep: no value, "unit not answering"');
        awake = true;
        await car.run(60, { want: wantBoost(v) });
        ok(v.data().iat === 30 && v.fresh('iat'), 'awake: its values are back within a minute (asked again after 30 s, then 60 s)');
        ok(car.logs.some((l) => /DME: answering again/.test(l)), 'logged');
        // given up for longer, then the engine is started: asked once at once
        awake = false;
        await car.run(400, { want: wantBoost(v) });
        const before = unanswered(car, 0x12).length;
        awake = true;
        const stopped = (n) => { car.handlers.CDS.statusEngineSpeed2({ actualValueRPMEngineCrankshaft: 0 }); };
        await car.run(2, { want: wantBoost(v), feed: stopped });
        ok(v.data().iat !== 30 || !v.fresh('iat'), 'given up again, engine off: still no value');
        await car.run(3, { want: wantBoost(v) });
        ok(v.fresh('iat') && v.data().iat === 30, 'the engine starts: the unit is asked at once, and answers (' + before + ' unanswered requests before)');
    });

    // the review of 1.1.0: what the car's engine-speed signal does when the engine stops is not known from a car
    // (raw: what the signal sends when the engine stops, null = nothing more; every: in every frame, else once)
    for (const end of [{ name: 'goes to 0 rpm', raw: 0, every: true, log: 'engine speed 0 rpm' }, { name: 'is marked "no value" (65535)', raw: 65535, log: 'engine speed marked "no value"' },
        { name: 'just stops arriving', raw: null, log: 'no engine speed for 200 s' }, { name: 'rests at 160 rpm, the last value of the run-down', raw: 640, log: 'engine speed 160 rpm' }]) {
        await ok.part('a fuel stop on the Boost set: the engine unit sleeps for 200 s, the engine speed ' + end.name + ', then the engine is started', async () => {
            let awake = true, first = true;
            const h = healthy();
            const car = makeCar(APP, { holdMs: 6000, reply: (a, b, c) => (a === 0x12 && !awake ? null : h(a, b, c)) }), v = car.vitals();
            await clock.advance(10);
            await car.run(30, { want: wantBoost(v) });
            awake = false;
            const off = () => { if (end.raw !== null && (first || end.every)) rpm(car, end.raw); first = false; };
            await car.run(200, { want: wantBoost(v), feed: off });
            ok(v.unit(18).down && v.dmeWhy('iat') === 'not answering', 'engine off: the engine unit was given up, its tiles say "' + v.dmeWhy('iat') + '"');
            awake = true;
            const secs = await backIn(car, v, 40);
            ok(secs <= 3, 'the engine starts: every value of the Boost set is back after ' + secs + ' s (only after 0 rpm was the start seen: 35 s else, up to 10 minutes after a longer stop)');
            const line = 'engine speed above 400 rpm, taken as an engine start (before it: ' + end.log + ')';
            ok(car.logs.indexOf('info ' + line) >= 0, 'the log says what the engine speed did before the start: "' + line + '"');
        });
    }

    await ok.part('the engine is started while the one request to the given-up engine unit is still out', async () => {
        let awake = false;
        const h = healthy(), parked = () => rpm(car, 0);
        const car = makeCar(APP, { holdMs: 0, reply: (a, b, c) => (a === 0x12 && !awake ? null : h(a, b, c)) }), v = car.vitals();
        await clock.advance(10);
        await car.run(20, { want: wantBoost(v), feed: parked });
        ok(v.unit(18).down, 'parked, the engine unit asleep: given up');
        const n0 = unanswered(car, 0x12).length;
        for (let i = 0; i < 3000 && unanswered(car, 0x12).length === n0; i++) await car.run(0.016, { want: wantBoost(v), feed: parked });
        ok(unanswered(car, 0x12).length === n0 + 1, 'its one request after 30 s is sent');
        await car.run(1, { want: wantBoost(v), feed: parked });
        awake = true;
        const secs = await backIn(car, v, 90);
        ok(secs <= 5, 'the engine starts 1 s later, that request still out: the values are back after ' + secs + ' s - the rest of its 4 s time-out and one new request (it took a minute: the old request\'s time-out undid the engine start)');
    });

    for (const holdMs of [0, 6000]) {
        await ok.part('the engine unit asleep for 240 s with the app open, transport ' + (holdMs ? 'held ' + holdMs / 1000 + ' s' : 'free at once') + ', then the engine starts: no value rests on its own', async () => {
            let awake = false;
            const h = healthy({ '22:F477': [0x00, 0x5F] });       // (it has the charge air cooler's temperature too: 55 deg C)
            const car = makeCar(APP, { holdMs, reply: (a, b, c) => (a === 0x12 && !awake ? null : h(a, b, c)) }), v = car.vitals();
            await clock.advance(10);
            await car.run(240, { want: wantBoost(v), feed: () => rpm(car, 0) });
            const un = unanswered(car, 0x12).length;
            ok(un <= 7, un + ' unanswered requests while it slept (3, then one after 30 s, 1 and 2 minutes)');
            ok(BOOST.every((k) => !v.dmeFail[k] || v.dmeFail[k] < 3), 'none of its values was put on a wait of its own for the unit\'s silence');
            awake = true;
            const secs = await backIn(car, v, 30);
            ok(secs <= 3, 'awake, engine started: every value of the Boost set is back after ' + secs + ' s, intake air among them (it stayed "--" for ' + (holdMs ? 239 : 55) + ' s more: its own wait had doubled with every unanswered request of the unit)');
            ok(v.data().iat === 30 && v.rd.pick.iat === 0, 'and intake air reads ' + v.data().iat + ' deg C, from its own sensor: the unit\'s silence did not move it to its next identifier, the charge air cooler\'s (55 deg C)');
        });
    }

    for (const o of [{ before: 10, holdMs: 0 }, { before: 40, holdMs: 0 }, { before: 14, holdMs: 6000 }]) {
        await ok.part('the app is opened ' + o.before + ' s before the engine is started, the engine unit asleep until then (transport ' + (o.holdMs ? 'held ' + o.holdMs / 1000 + ' s' : 'free at once') + ')', async () => {
            let awake = false;
            const h = healthy({ '22:F477': [0x00, 0x5F] });
            const car = makeCar(APP, { holdMs: o.holdMs, reply: (a, b, c) => (a === 0x12 && !awake ? null : h(a, b, c)) }), v = car.vitals();
            await clock.advance(10);
            await car.run(o.before, { want: wantBoost(v), feed: () => rpm(car, 0) });
            awake = true;
            const secs = await backIn(car, v, 60);
            ok(secs <= 6, 'every value of the Boost set is there ' + secs + ' s after the start' + (o.before < 20 ? ' (it took 32 s: the unit was given up on a request sent before the start)' : ''));
            ok(v.data().iat === 30 && v.rd.pick.iat === 0, 'intake air reads ' + v.data().iat + ' deg C, from its own sensor (F40F)' + (o.holdMs ? '' : ' - it was the charge air cooler\'s 55 deg C: every unanswered request while the unit slept had moved the tile one identifier on'));
        });
    }

    // the engine start must not bring the fault back that giving up a unit is there for
    for (const silent of [0x12, 0x18]) {
        await ok.part('the ' + (silent === 0x12 ? 'engine' : 'gearbox') + ' unit never answers, and the engine starts every 45 s (automatic start-stop, a hybrid): 20 minutes', async () => {
            const h = healthy();
            const car = makeCar(APP, { holdMs: 6000, reply: (a, b, c) => (a === silent ? null : h(a, b, c)) }), v = car.vitals();
            await clock.advance(10);
            const t0 = clock.now();
            let n = 0, stale = 0;
            const feed = (i) => rpm(car, ((clock.now() - t0) / 1000) % 45 < 22 ? 12000 + (i % 2) * 4 : 0);
            await car.run(1200, { want: wantBoost(v), feed, each: (i) => { if (i % 60 === 0 && i > 1900) { n++; if (silent === 0x12 ? !v.fresh('egs') : BOOST.some((k) => !v.fresh(k))) stale++; } } });
            const un = unanswered(car, silent), late = un.filter((r) => r.t - t0 > 600000).length;
            ok(un.length <= 14 && late <= 2, un.length + ' unanswered requests to it in 20 minutes with 27 engine starts, ' + late + ' of them in the second 10 (an engine start asks a unit that keeps silent only after 30 s, 1, 2, 5, 10 minutes' + (silent === 0x12 ? '; it was 29 and 13' : '') + ')');
            ok(stale === 0, 'the other unit\'s values stayed fresh in every one of ' + n + ' samples');
        });
    }

    await ok.part('an engine speed that only arrives every 12 s is not an engine start every time (the gearbox unit never answers): 20 minutes', async () => {
        const h = healthy();
        const car = makeCar(APP, { holdMs: 6000, reply: (a, b, c) => (a === 0x18 ? null : h(a, b, c)) }), v = car.vitals();
        await clock.advance(10);
        let last = -1e9;
        const feed = (i) => { if (clock.now() - last >= 12000) { last = clock.now(); rpm(car, 12000 + (i % 2) * 4); } };
        await car.run(1200, { want: wantBoost(v), feed });
        const un = unanswered(car, 0x18).length;
        ok(un <= 12, un + ' unanswered requests to the gearbox unit in 20 minutes (asked at every such "start" it would be 100)');
        ok(BOOST.every((k) => v.fresh(k)), 'and the engine unit\'s values are fresh');
    });

    await ok.part('boost against target comes from one round of the engine unit (gauges-B7)', async () => {
        // target and actual move together, 0.10 bar apart, changing with every reading of the target
        let r = 0, dead = false, noActual = false;
        const h = healthy();
        const w = (kpa) => { const x = Math.round(kpa * 256); return [(x >> 8) & 255, x & 255]; };
        const reply = (a, sid, d) => {
            if (a === 0x12 && dead) return null;
            if (a === 0x12 && sid === 0x22 && d[0] === 0x4A && d[1] === 0xB0) { r++; return [0x62, 0x4A, 0xB0].concat(w(150 + (r % 60))); }
            if (a === 0x12 && sid === 0x22 && d[0] === 0x58 && d[1] === 0x0B) return noActual ? [0x7F, 0x22, 0x31] : [0x62, 0x58, 0x0B].concat(w(140 + (r % 60)));
            if (a === 0x12 && noActual && d[0] === (sid === 0x22 ? 0xF4 : 0x70) && (sid === 0x01 || d[1] === 0x70)) return [0x7F, sid, 0x31];
            return h(a, sid, d);
        };
        const car = makeCar(APP, { reply }), v = car.vitals();
        await clock.advance(10);
        let pairs = 0, off = 0;
        // (the sport display shows a boost of its own, at its own rate: it is not what the target is compared with)
        await car.run(60, { want: wantBoost(v), each: () => { const p = v.boostPair(v.data()); if (p.target !== null && p.actual !== null) { pairs++; if (Math.abs(p.actual - p.target + 0.1) > 1e-6) off++; } } });
        ok(pairs > 3000 && off === 0, 'in ' + pairs + ' frames the pair was always the two values of the same round (actual - target = -0.10 bar)');
        dead = true;
        await car.run(3.5, { want: wantBoost(v) });
        const p = v.boostPair(v.data());
        ok(p.target === null && p.actual === null, 'the engine unit stops answering: after 3.5 s target and "against target" are blank');
        ok(v.fresh('boostCtl') === true, '(the 15 s rule of the engine-unit tiles would still have shown the old number)');
        await car.run(3.5, { want: wantBoost(v) });
        ok(v.trace.target.slice(-3).every((x) => x === null) && v.trace.target.slice(-40, -30).every((x) => typeof x === 'number'), 'and the target line in the 60 s chart stops within 7 s');
        dead = false; noActual = true;
        await car.run(40, { want: wantBoost(v) });
        const q = v.boostPair(v.data());
        ok(typeof q.target === 'number' && q.actual === null, 'an engine unit that gives a target but no actual boost: target shown, "against target" stays blank');
    });

    await ok.part('boost numbers on the ceiling of their field are no readings (gauges-B8)', async () => {
        // only the one-byte manifold pressure answers, and it sits on 255
        let map = 0xFF, target = [0xFF, 0xFF];
        const h = healthy({ '22:F487': { nrc: 0x31 } });
        const reply = (a, sid, d) => {
            if (a === 0x12 && sid === 0x22 && d[0] === 0xF4 && d[1] === 0x70) return [0x62, 0xF4, 0x70, 0x03, 0x23, 0x00, 0x00, 0x00, 0, 0, 0, 0];          // target 280 kPa, no sensor A value (0)
            if (a === 0x12 && sid === 0x22 && d[0] === 0xF4 && d[1] === 0x0B) return [0x62, 0xF4, 0x0B, map];
            if (a === 0x12 && sid === 0x22 && d[0] === 0x4A && d[1] === 0xB0) return [0x62, 0x4A, 0xB0].concat(target);
            return h(a, sid, d);
        };
        const car = makeCar(APP, { settings: { boostSource: 'dme' }, reply }), v = car.vitals();
        await clock.advance(10);
        await car.run(10, { want: wantBoost(v), fes: false });
        ok(v.data().boost == null, 'manifold pressure F40B = 255 kPa, the top of its byte: no boost reading (it showed 1.54 bar)');
        near(v.data().boostTarget, 1.79, 0.001, 'target 4AB0 = FFFF, the top of its field: the next identifier is read instead (F470: 280 kPa), target');
        map = 0xC8; target = [0xC8, 0x00];
        await car.run(10, { want: wantBoost(v), fes: false });
        near(v.data().boost, 0.99, 0.001, 'F40B = 200 kPa: boost');
    });

    await ok.part('Auto: above the sport display\'s ceiling the dial follows the engine unit, not the last number below it (gauges-B8)', async () => {
        let kpa = 270, fes = 200;
        const h = healthy(), PSI = 14.5038;
        // (the engine unit's boost: F470, 1/32 kPa absolute; outside air 101 kPa)
        const reply = (a, sid, d) => {
            if (a === 0x12 && sid === 0x22 && d[0] === 0xF4 && d[1] === 0x70) { const x = Math.round(kpa * 32); return [0x62, 0xF4, 0x70, 0x03, 0x16, 0x80, x >> 8, x & 255, 0, 0, 0, 0]; }
            return h(a, sid, d);
        };
        const car = makeCar(APP, { reply }), v = car.vitals();
        await clock.advance(10);
        car.handlers.Vehicle.statusNewCurrentUnitsStatusExt({ unitOfMeasurementAirPressure: 3, unitOfMeasurementTemperature: 1 });
        const t0 = clock.now();
        const feed = (n) => {
            rpm(car, 20000 + (n % 2) * 4);
            kpa = 270 + 4 * Math.floor((clock.now() - t0) / 500);          // the engine unit's boost climbs 0.08 bar a second
            car.handlers.FES.statusSwitchDriveDynamicSport2({ displayBoostPressure: fes === 200 ? fes + (n % 20) : fes });
        };
        await car.run(2, { want: wantBoost(v), feed });
        fes = 253;
        const asked = car.count(/^F470@12$/);
        await car.run(1, { want: wantBoost(v), feed });
        near(v.data().boost, 25.3 / PSI, 1e-6, 'the sport display at 25.3 psi, a car set to psi: boost, bar');
        ok(car.count(/^F470@12$/) === asked, 'the engine unit is not asked for boost while the sport display works');
        // the pull goes on: the car sends "no value" (255) from 253, without passing 254
        fes = 255;
        let frozen = 0, n = 0;
        await car.run(2, { want: wantBoost(v), feed });
        await car.run(7, { want: wantBoost(v), feed, each: () => { n++; if (Math.abs(v.data().boost - 25.3 / PSI) < 1e-6) frozen++; } });
        near(v.data().boost, (kpa - 101) / 100, 0.05, '"no value" from the sport display, the engine unit read and trusted: 9 s later the dial shows the engine unit\'s boost, bar');
        ok(frozen === 0, 'from 2 s after it, in none of ' + n + ' frames the last sport-display number (it stayed on the dial, and as the peak, for the full 10 s)');
        ok(v.pk().boost > 2.2, 'and the peak is the engine unit\'s: ' + (v.pk().boost * PSI).toFixed(1) + ' psi, not 25.3');
        fes = 240;
        await car.run(0.5, { want: wantBoost(v), feed });
        near(v.data().boost, 24 / PSI, 1e-6, 'the sport display reads again (24.0 psi): it is the one shown, boost, bar');
    });

    await ok.part('engine oil from the engine unit only when the car has none (gauges-B15)', async () => {
        const h = healthy({ '01:5C': [0x94] });                    // the engine unit: 108 deg C
        const car = makeCar(APP, { reply: h }), v = car.vitals();
        await clock.advance(10);
        const seen = [], rpmOnly = (n) => car.handlers.CDS.statusEngineSpeed2({ actualValueRPMEngineCrankshaft: 12000 + (n % 2) * 4 });
        // the car's own signal: 106 deg C, steady, so it is sent once and then not again
        car.handlers.CDS.statusEngineTemperature({ temperatureEngineDrive: 138, temperatureEngineOilDrive: 154 });
        await car.run(90, { want: ['iat'], feed: rpmOnly, each: () => { const o = v.data().oil; if (seen[seen.length - 1] !== o) seen.push(o); } });
        ok(seen.join() === '106', 'a steady 106 deg C from the car, 108 in the engine unit: 90 s long the reading is ' + seen.join(' -> ') + ' (it stepped 106, 108, 106, 108)');
        ok(car.count(/^(OBD 5C|F45C)@12$/) === 1 && car.logs.some((l) => /^info oil temperature: the car's own signal reads 106 deg C, the engine unit 108 deg C/.test(l)),
            'the engine unit is asked for it once, for the log only: "oil temperature: the car\'s own signal reads 106 deg C, the engine unit 108 deg C"');
        // the car takes its value back
        car.handlers.CDS.statusEngineTemperature({ temperatureEngineDrive: 138, temperatureEngineOilDrive: 255 });
        await car.run(12, { want: ['iat'], feed: rpmOnly });
        ok(v.data().oil === 108 && car.count(/^OBD 5C@12$/) > 0, 'the car marks its oil temperature "no value": the engine unit\'s 108 deg C is shown');
        car.handlers.CDS.statusEngineTemperature({ temperatureEngineDrive: 138, temperatureEngineOilDrive: 155 });
        ok(v.data().oil === 107, 'the car\'s own value returns: it is shown again');
    });

    await ok.part('a car that never sends an oil temperature', async () => {
        let dead = false;
        const h = healthy({ '01:5C': [0x94] });
        const car = makeCar(APP, { reply: (a, b, c) => (dead && a === 0x12 ? null : h(a, b, c)) }), v = car.vitals();
        await clock.advance(10);
        const noOil = (n) => { car.handlers.CDS.statusEngineSpeed2({ actualValueRPMEngineCrankshaft: 12000 + (n % 2) * 4 }); };
        await car.run(10, { want: ['iat'], feed: noOil });
        ok(v.data().oil === undefined, 'in the first seconds the car\'s own signal is waited for');
        await car.run(15, { want: ['iat'], feed: noOil });
        ok(v.data().oil === 108, 'after 15 s without one: the engine unit\'s (108 deg C)');
        dead = true;
        await car.run(20, { want: ['iat'], feed: noOil });
        ok(v.data().oil === undefined, 'the engine unit stops answering: its oil temperature is dropped after 15 s like its other values');
    });

    await ok.part('boost from the engine unit ages like its other values (gauges-B3)', async () => {
        let dead = false;
        const h = healthy();
        const car = makeCar(APP, { settings: { boostSource: 'dme' }, reply: (a, b, c) => (dead && a === 0x12 ? null : h(a, b, c)) }), v = car.vitals();
        await clock.advance(10);
        await car.run(10, { want: wantBoost(v), fes: false });
        near(v.data().boost, 0.75, 0.001, 'boost from the engine unit');
        dead = true;
        await car.run(10, { want: wantBoost(v), fes: false });
        near(v.data().boost, 0.75, 0.001, '10 s after its last answer it is still shown');
        await car.run(6, { want: wantBoost(v), fes: false });
        ok(v.data().boost == null, '16 s after: dropped (it stayed on the dial for good)');
    });

    await ok.part('a diesel\'s rail pressure (the gauges sceptic\'s added fault)', async () => {
        let rail = 300;
        const h = healthy();
        const reply = (a, sid, d) => (a === 0x12 && sid === 0x22 && d[0] === 0xF4 && d[1] === 0x23 ? [0x62, 0xF4, 0x23, (rail * 10) >> 8, (rail * 10) & 255] : h(a, sid, d));
        const car = makeCar(APP, { settings: { engine: 'diesel' }, reply }), v = car.vitals();
        await clock.advance(10);
        await car.run(10, { want: wantBoost(v) });
        ok(v.data().hpfp === 300, 'diesel at idle: 300 bar');
        rail = 1600;
        await car.run(5, { want: wantBoost(v) });
        ok(v.data().hpfp === 1600 && v.fresh('hpfp'), 'under load: 1600 bar is shown (it kept 300 bar, then went blank)');
        car.settings.set('engine', 'petrol');
        await car.run(20, { want: wantBoost(v) });
        ok(v.fresh('hpfp') === false, 'the same 1600 bar with a petrol engine: not a reading, as before');
        rail = 300;
        await car.run(2, { want: wantBoost(v) });
        ok(v.data().hpfp === 300 && v.fresh('hpfp'), 'and 300 bar is shown again at once: an out-of-range answer puts nothing on a 30 s wait');
    });

    await ok.part('the transport is busy with someone else\'s request', async () => {
        // (the charge air cooler's temperature is the intake-air tile's second identifier: it must not take over because of a busy transport)
        const car = makeCar(APP, { reply: healthy({ '22:F477': [0x00, 0x5F] }) }), v = car.vitals();
        await clock.advance(10);
        await car.run(10, { want: wantBoost(v) });
        ok(v.data().iat === 30, 'intake air 30 deg C');
        let other = 0;
        for (let i = 0; i < 60; i++) { car.hold(1500); await car.run(3.37, { want: wantBoost(v), each: () => { if (v.data().iat !== 30) other++; } }); }
        ok(other === 0 && v.rd.pick.iat === 0, 'through sixty 1.5 s holds of the transport intake air stayed its own sensor, 30 deg C' + (other ? ': it read something else in ' + other + ' frames' : '') + ' (it took the charge air cooler\'s 55 deg C in its place)');
        ok(BOOST.every((k) => !v.dmeFail[k]), 'and no value was counted as failed');
        ok(car.stats.busyVerdicts > 0, '(the transport turned ' + car.stats.busyVerdicts + ' requests away)');
    });

    await ok.part('a reply that is lost once; an identifier that is never answered', async () => {
        let lose = 0, other = 0;
        const h = healthy({ '22:F477': [0x00, 0x5F], '01:0E': null, '22:F40E': [0x90] });
        const car = makeCar(APP, { holdMs: 0, reply: (a, sid, d) => { if (lose && a === 0x12 && sid === 0x22 && d[0] === 0xF4 && d[1] === 0x0F) { lose--; return null; } return h(a, sid, d); } }), v = car.vitals();
        await clock.advance(10);
        await car.run(20, { want: wantBoost(v) });
        ok(v.data().timing === 8 && unanswered(car).filter((r) => keyOf(r) === 'OBD 0E@12').length === 1, 'timing: its first identifier is never answered, the second is: 8 deg, after one unanswered request');
        ok(car.logs.some((l) => /^info timing: read from DME F40E \(2 of 2\)$/.test(l)), 'the log says which identifier a value is read from: "timing: read from DME F40E (2 of 2)"');
        lose = 1;
        await car.run(30, { want: wantBoost(v), each: () => { if (v.data().iat !== 30) other++; } });
        ok(lose === 0 && other === 0 && v.rd.pick.iat === 0, 'one reply of intake air is lost: it stays on its own sensor, 30 deg C (it moved to the charge air cooler\'s 55 deg C and stayed there)');
    });

    await ok.part('the head unit sets its clock back an hour while the Boost set is on screen', async () => {
        let iat = 0x46;
        const car = makeCar(APP, { reply: (a, b, c) => healthy({ '22:F40F': [iat] })(a, b, c) }), v = car.vitals();
        await clock.advance(10);
        await car.run(20, { want: wantBoost(v) });
        ok(v.data().iat === 30, 'intake air 30 deg C');
        clock.wall(-3600000); iat = 0x64;                       // and the engine unit's intake air goes to 60
        const t0 = clock.now();
        await car.run(3, { want: wantBoost(v) });
        ok(car.sent.some((r) => r.t > t0 + 500), 'the engine unit is still being asked (reads stopped for the whole hour)');
        ok(v.data().iat === 60 && v.fresh('iat'), 'and the tile shows the new 60 deg C (it showed the old 30 as fresh)');
    });
    ok.done();
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });

function near(a, b, tol, what) { return ok(typeof a === 'number' && Math.abs(a - b) <= tol, what + ' = ' + (typeof a === 'number' ? Math.round(a * 1000) / 1000 : a)); }
