'use strict';
/**
 * test_warmup_car.js <built app: dist/pps_warmup> - the whole app on a stand-in car (warmup_bench.js): app.js with
 * source.js, gearbox.js and warm.js, on the kit's own read-only diagnostic link, on clocks the test moves by hand.
 * What test_warmup.js cannot reach: when the gearbox unit is asked, the gearbox reader, the words on the screen
 * and on the widget. Run by test_warmup.js as its last part, or alone. No car needed: what a real car sends, and
 * how the head unit draws the small widget's lines, is not known from here.
 *
 * WARMUP_TEST_ALL=1 as in test_warmup.js; WARMUP_TEST_TIMES=1 prints how long each group took.
 */
const assert = require('assert');

module.exports = async function (stage, ok) {
    const { boot, advance, clock, asked, mishaps } = require('./warmup_bench')(stage);
    /** A group of checks on one drive (with WARMUP_TEST_ALL an error in one does not stop the others). */
    const drive = async (name, fn) => {
        console.log(name);
        const began = Date.now.real ? Date.now.real() : 0;
        if (!process.env.WARMUP_TEST_ALL) await fn();
        else { try { await fn(); } catch (e) { ok(false, name + ': ' + (e && e.stack || e)); } }
        if (process.env.WARMUP_TEST_TIMES) console.log('  (' + (Date.now.real() - began) + ' ms)');
    };
    /** sec seconds pass, with a look at the decision 5 times a second: every state it was in (each(st) sees them all). */
    const watch = async (car, sec, each) => {
        const seen = [];
        for (let i = 0; i < sec * 5; i++) {
            await advance(200);
            const st = car.status(), s = st.overall + (st.over ? '+over' : '');
            if (seen.indexOf(s) < 0) seen.push(s);
            if (each) each(st);
        }
        return seen.join();
    };
    const has = (texts, s) => texts.indexOf(s) >= 0;
    const logged = (car, re) => car.logs.filter((l) => re.test(l)).length;
    let gb = 20, car, t0, texts, seen, w, n;
    const zf = (c) => { c.egs = c.zf(() => gb); return c; };

    await drive('after switch-off the gearbox unit is left alone (warmup-B9, kit-B1)', async () => {
        gb = 35; car = zf(await boot()); car.rpm = 700; car.speed = 0; car.temps(40, 30);
        await advance(60000);
        ok(asked(car) >= 10, 'cold idle with the app closed and no widget: the gearbox unit is asked while the car warms up (' + asked(car) + ' requests in a minute)');
        // switched off: the last engine speed the car sends is an idle value, then "no value"
        car.rpm = null; car.send.rpm(620); car.send.rpm(null);
        t0 = clock.mono; await advance(600000);
        ok(asked(car, t0) <= 1, 'B9: switched off, the car\'s last engine speed 620 rpm and then "no value": ' + asked(car, t0) + ' request(s) in the next 10 minutes (it was 119, then one every 30 s until the head unit shut down)');
        ok(car.status().overall === 'off' && car.status().running === false, 'B9: and the app has it as "Engine off"');
        car.screen = true; texts = await car.frame();
        ok(texts[0] === 'ENGINE OFF' && !texts.some((x) => /rpm/.test(x)), 'B9: the screen says so, and draws no engine speed');
        // the same when the car simply sends nothing more
        car = zf(await boot()); car.rpm = 700; car.speed = 0; car.temps(40, 30);
        await advance(60000);
        car.rpm = null; t0 = clock.mono; await advance(600000);
        ok(asked(car, t0) <= 3 && car.status().overall === 'off', 'B9: switched off and the car sends nothing more at all: asked ' + asked(car, t0) + ' more time(s) (the 10 s it takes to notice), then "Engine off"');
        ok(logged(car, /engine speed: no more from the car after 70\d rpm/) === 1, 'B9: the log says once what happened: ' + car.logs.filter((l) => /engine speed/.test(l))[0]);
        car.rpm = 800; await advance(8000);
        ok(car.status().running === true && asked(car, clock.mono - 8000) >= 1, 'started again: running, and asked again');
    });

    await drive('a car that is locked and left, or parked with the screen left on, is not kept awake (kit-B1)', async () => {
        gb = 35; car = zf(await boot()); car.screen = true; car.rpm = 700; car.speed = 0; car.temps(40, 30);
        await advance(20000);
        // switched off and locked, the app's screen left on
        car.rpm = 0; await advance(5000); t0 = clock.mono; await advance(20000);
        ok(asked(car, t0) >= 3, 'the engine just switched off, the screen still open: the gearbox unit is still asked');
        car.send.condition(2);
        t0 = clock.mono; await advance(300000);
        ok(asked(car, t0) === 0, 'kit-B1: the car says it is locked and left (vehicle state 2): not one request in the next 5 minutes, screen or not');
        ok(logged(car, /locked and left/) === 1, 'kit-B1: logged: ' + car.logs.filter((l) => /locked and left/.test(l))[0]);
        car.send.condition('WOHNEN');
        t0 = clock.mono; await advance(20000);
        ok(asked(car, t0) >= 3 && logged(car, /in use again/) === 1, 'unlocked (state "WOHNEN"): asked again');
        car.handlers.VehicleCondition.vehicleConditionNoCrc({ statusConditionVehicle: 'PARKEN_BN_IO' });
        t0 = clock.mono; await advance(60000);
        ok(asked(car, t0) === 0, 'kit-B1: the state from the car\'s second copy (no CRC) counts the same');
        car.rpm = 800; t0 = clock.mono; await advance(20000);
        ok(asked(car, t0) >= 3, 'should the car\'s "in use again" ever be missed: a running engine is asked for its gearbox all the same');
        // a car that does not say its state: ignition on, engine not started, the screen open
        gb = 25; car = zf(await boot()); car.screen = true; car.rpm = 0; car.speed = 0; car.temps(24, 23);
        await advance(30000);
        ok(asked(car) >= 5 && car.status().fluids.gearbox.temp === 25, 'B2: ignition on, engine not started, the screen open: the gearbox is read (' + asked(car) + ' requests; it was NO READING until the engine ran)');
        texts = await car.frame();
        ok(texts[0] === 'ENGINE OFF' && has(texts, '25'), 'B2: "Engine off", with the gearbox temperature on its row');
        await advance(600000); t0 = clock.mono; await advance(600000);
        ok(asked(car, t0) === 0, 'kit-B1: still parked with the screen left on, 10 to 20 minutes after it was opened: no more requests');
        ok(car.status().fluids.gearbox.temp === null, 'and no gearbox reading is shown as live then');
        car.rpm = 800; t0 = clock.mono; await advance(8000);
        ok(asked(car, t0) >= 1 && car.status().fluids.gearbox.temp === 25, 'the engine is started: asked again at once');
    });

    await drive('a manual car on "Auto": the gearbox is left out, and stays left out (warmup-B1, warmup-B3)', async () => {
        car = await boot(); car.screen = true; car.rpm = 900; car.speed = 0; car.temps(92, 95); car.send.gearboxSignal(null);
        await advance(2000); seen = await watch(car, 86);
        ok(seen === 'warming', 'warm engine, no gearbox unit and no gearbox signal: waited for during the first 90 s of running');
        await advance(6000); texts = await car.frame();
        ok(car.status().overall === 'ready' && texts[0] === 'UP TO TEMPERATURE' && /gearbox oil not monitored$/.test(texts[1]), 'then left out on the reader\'s evidence (the unit never answers, the signal has no value), and named: ' + texts[1]);
        car.rpm = 0; seen = await watch(car, 8);
        car.rpm = 900; await advance(600); car.rpm = 4500; car.speed = 40;
        seen += ',' + await watch(car, 100); texts = await car.frame();
        ok(seen === 'ready,ready', 'B1: an 8 s start-stop at the lights, then away at 4,500 rpm: up to temperature throughout (it was "Engine off, waiting for gearbox oil", then 90 s of "Warming up" with "Ease off")');
        ok(texts[0] === 'UP TO TEMPERATURE' && !has(texts, 'EASE OFF') && !has(texts, 'KEEP BELOW'), 'B1: and the screen shows no rev advice');
        t0 = clock.mono; await advance(600000);
        ok(asked(car, t0) <= 21, 'the absent unit is asked no more than every 30 s meanwhile (' + asked(car, t0) + ' requests in 10 minutes with the screen open)');
        // "Car signal only" on a car whose signal gives nothing: left out after 90 s as before
        car = await boot({ sets: { gearboxSource: 'signal' } }); car.rpm = 900; car.speed = 0; car.temps(92, 95); car.send.gearboxSignal(null);
        await advance(95000);
        ok(car.status().overall === 'ready' && car.status().unwatched.join() === 'gearbox' && asked(car) === 0, '"Car signal only" and the signal has no value: left out after 90 s of running, the unit never asked');
    });

    await drive('a manual car on "Auto" in stop-and-go traffic: the 90 s are counted over the engine run (warmup-B1)', async () => {
        car = await boot(); car.screen = true; car.rpm = 1500; car.speed = 20; car.temps(92, 95); car.send.gearboxSignal(null);
        await advance(2000); seen = await watch(car, 58);
        car.rpm = 0; car.speed = 0; await advance(1000); seen += ',' + await watch(car, 11);
        ok(seen === 'warming,off', 'B1: warm engine, no gearbox unit, 60 s running and 12 s stopped: the gearbox is waited for so far');
        car.rpm = 1500; car.speed = 20; await advance(25000);
        ok(car.status().overall === 'warming' && car.status().unwatched.length === 0, 'B1: 25 s into the second stretch (85 s of running in all): still waited for');
        await advance(15000); texts = await car.frame();
        ok(car.status().overall === 'ready' && texts[0] === 'UP TO TEMPERATURE' && /gearbox oil not monitored$/.test(texts[1]), 'B1: 40 s into it: left out, "' + texts[1] + '" (it took 90 s of running in one piece: 10 minutes of this traffic alternated "Engine off, waiting for gearbox oil" and "Warming up, keep below 4,000 rpm")');
        car.rpm = 0; car.speed = 0; seen = await watch(car, 12); car.rpm = 1500; car.speed = 20; seen += ',' + await watch(car, 20);
        ok(seen === 'ready,ready', 'B1: and it stays so through the next stop and start');
    });

    await drive('a gearbox unit that answers, but never with a reading, is left out as well (warmup-B3)', async () => {
        const no = [0x7F, 0x22, 0x31];
        const units = {
            '22 6000 refused as unknown, 22 DA12 answers one value that never moves (32 deg C)': (did) => (did === 0x6000 ? no : [0x62, 0xDA, 0x12, 0x50]),
            '22 6000 refused as unknown, 22 DA12 answers a value outside the range (-48 deg C)': (did) => (did === 0x6000 ? no : [0x62, 0xDA, 0x12, 0x00]),
            '22 6000 refused as unknown, 22 DA12 refused with NRC 33': (did) => (did === 0x6000 ? no : [0x7F, 0x22, 0x33]),
            'both identifiers refused with NRC 33 (security access)': () => [0x7F, 0x22, 0x33],
            'both identifiers refused with NRC 22 (conditions not correct)': () => [0x7F, 0x22, 0x22],
            'both identifiers refused with NRC 10 (general reject)': () => [0x7F, 0x22, 0x10],
            'both identifiers refused with NRC 7F (not in this session)': () => [0x7F, 0x22, 0x7F],
            '22 6000 answers a value outside the range (215 deg C)': (did) => (did === 0x6000 ? [0x62, 0x60, 0x00, 0xFF] : no),
        };
        for (const name of Object.keys(units)) {
            car = await boot(); car.egs = units[name]; car.screen = true; car.rpm = 900; car.speed = 0; car.temps(92, 95); car.send.gearboxSignal(null);
            await advance(2000); seen = await watch(car, 48);
            await advance(50000); texts = await car.frame();
            ok(seen === 'warming' && car.status().unwatched.join() === 'gearbox' && texts[0] === 'UP TO TEMPERATURE' && /gearbox oil not monitored$/.test(texts[1]),
                'B3: ' + name + ': waited for at first, left out after 100 s of running, "' + texts[1].replace(/^.*  ·  /, '') + '" (it stayed on "Warming up ... waiting for gearbox oil" for good; 1.2.1 left it out after 90 s)');
        }
        ok(logged(car, /gearbox: EGS 6000 -> 215 deg C \(outside -40\.\.160: not used\)/) === 1, 'B5: the value that was not used is in the log: ' + car.logs.filter((l) => /not used/.test(l))[0]);
        ok(logged(car, /gearbox: 12 answers in a row from the gearbox unit and no reading among them/) === 1, 'B3: and so is what the reader made of it, once: ' + car.logs.filter((l) => /answers in a row/.test(l))[0]);
        // a DA12 value that does move later is a reading after all
        n = 0x50; car = await boot(); car.egs = (did) => (did === 0x6000 ? no : [0x62, 0xDA, 0x12, n]); car.screen = true; car.rpm = 900; car.speed = 0; car.temps(92, 95);
        await advance(100000);
        ok(car.status().overall === 'ready' && car.status().unwatched.join() === 'gearbox', 'a DA12 value that stood at 32 deg C for 100 s: left out');
        n = 0x52; await advance(7000); texts = await car.frame();
        ok(car.status().overall === 'warming' && car.status().fluids.gearbox.temp === 34 && car.status().unwatched.length === 0 && /waiting for gearbox oil$/.test(texts[1]), 'it moves to 34: a reading after all, and a cold one: counted again, and waited for');
        // "busy" is not a "no"
        gb = 45; car = await boot(); car.egs = () => [0x7F, 0x22, 0x21]; car.screen = true; car.rpm = 900; car.speed = 0; car.temps(92, 95);
        await advance(150000);
        ok(car.status().overall === 'warming' && car.status().unwatched.length === 0 && car.src.gearbox.absent(true) === false && asked(car) >= 20, 'B3: a unit that answers "busy" (NRC 21) for 2.5 minutes of running is waited for, and asked on: that is not a "no"');
        zf(car); await advance(8000);
        ok(car.status().overall === 'warming' && car.status().fluids.gearbox.temp === 45, 'B3: when it then answers 45 deg C, the car was right not to be called ready');
    });

    await drive('the gearbox is not left out while the reader could not ask yet (warmup-B3)', async () => {
        // S4: a warm engine, the gearbox really at 45, the head unit's diagnostic transport not up for 100 s
        gb = 45; car = zf(await boot()); car.transport = false; car.screen = true; car.rpm = 900; car.speed = 0; car.temps(90, 88);
        await advance(2000); seen = await watch(car, 98);
        ok(seen === 'warming', 'B3: transport refusing for the first 100 s: the car is not called ready meanwhile (it was, from 91 s, with the gearbox at 45)');
        car.transport = true; seen = await watch(car, 30);
        ok(seen === 'warming' && car.status().fluids.gearbox.temp === 45 && car.status().unwatched.length === 0, 'B3: the transport comes up: the gearbox reads 45 and is waited for');
        // S4b: the diagnostic link never comes up at all
        gb = 30; car = zf(await boot({ car: { proxyFail: 99 } })); car.screen = true; car.rpm = 900; car.speed = 0;
        for (let s = 0; s < 420; s += 5) { car.temps(Math.min(90, Math.round(20 + s / 4)), Math.min(88, Math.round(20 + s / 5))); await advance(5000); }
        ok(car.status().overall === 'warming' && car.status().waiting.join() === 'gearbox' && car.status().unwatched.length === 0, 'B3: no diagnostic link at all, a 7-minute warm-up: the gearbox is waited for, not left out (it was, and the warm-up was announced)');
        ok(logged(car, /announced/) === 0 && asked(car) === 0, 'B3: nothing announced, nothing asked');
        ok(logged(car, /gearbox: no diagnostic link \(trying again in (5|15|60) s\)/) === 3 && logged(car, /gearbox: no diagnostic link \(not tried again\)/) === 1, 'B11: the link\'s set-up was tried again after 5, 15 and 60 s, each outcome logged');
        texts = await car.frame();
        ok(texts[0] === 'WARMING UP' && has(texts, 'NO READING') && has(texts, 'no gearbox oil temperature reading'), 'B3: the gearbox row says why: NO READING');
    });

    await drive('a gearbox unit that is asleep with the engine off is asked at once when the engine starts (warmup-B2)', async () => {
        // a unit that only answers while the engine runs; the app's screen showing when the driver gets in
        const asleep = (c) => { c.egs = (did) => (c.rpm > 0 ? c.zf(() => gb)(did) : null); return c; };
        for (const wait of [20, 47]) {
            gb = 75; car = asleep(await boot()); car.screen = true; car.rpm = 0; car.speed = 0; car.temps(90, 92);
            await advance(wait * 1000);
            ok(car.status().overall === 'off' && car.status().waiting.join() === 'gearbox' && asked(car) >= 3, 'a warm car, the screen showing for ' + wait + ' s with the engine off, the gearbox unit not answering: "Engine off", waiting for gearbox oil (' + asked(car) + ' requests)');
            car.rpm = 900; t0 = clock.mono; await advance(300); car.rpm = 4500; car.speed = 30; await advance(3200); texts = await car.frame();
            ok(car.status().overall === 'ready' && car.status().fluids.gearbox.temp === 75 && texts[0] === 'UP TO TEMPERATURE' && asked(car, t0) >= 1, 'B2: started and driven off: asked at once, and up to temperature on a live gearbox reading 3.5 s after the start (the reader was on its 30 s pace: up to 30 s of "Warming up, keep below 4,000 rpm, waiting for gearbox oil")');
        }
        // the same when it was the head unit's transport that kept refusing while the engine was off
        gb = 75; car = zf(await boot()); car.transport = false; car.screen = true; car.rpm = 0; car.speed = 0; car.temps(90, 92);
        await advance(50000);
        car.rpm = 900; await advance(5000); car.transport = true; t0 = clock.mono; await advance(4000);
        ok(car.status().overall === 'ready' && car.status().fluids.gearbox.temp === 75 && asked(car, t0) >= 1, 'B2: the screen showing for 50 s with the engine off and the transport refusing, then the engine is started and the transport comes up 5 s later: asked within 2 s of that, and up to temperature 4 s after it (the reader stayed on its 30 s pace through the start)');
        // what such a unit left unanswered with the engine off is no evidence that the car gives no gearbox reading
        gb = 45; car = asleep(await boot()); car.transport = false; car.screen = true; car.rpm = 900; car.speed = 0; car.temps(90, 88);
        await advance(100000);
        car.rpm = 0; car.transport = true; await advance(60000);
        ok(car.src.gearbox.absent(true) === true && car.status().overall === 'off' && car.status().unwatched.length === 0, 'B3: 100 s of running with the transport not up, then the engine off and the unit asleep: its silence leaves nothing out with the engine off');
        n = 0; car.rpm = 900; seen = await watch(car, 10, (st) => { if (st.unwatched.length) n++; });
        ok(!/ready/.test(seen) && n === 0 && car.status().overall === 'warming' && car.status().fluids.gearbox.temp === 45, 'B3: nor at the restart: the unit is asked at once, answers 45 deg C, and the gearbox is waited for (never left out, the car never called ready)');
    });

    await drive('a warm automatic stays up to temperature while its gearbox reading ages out (warmup-B2)', async () => {
        // S2: the screen open, the engine stopped for 45 s
        gb = 75; car = zf(await boot()); car.screen = true; car.rpm = 900; car.speed = 0; car.temps(95, 98);
        await advance(15000);
        ok(car.status().overall === 'ready', 'ZF 8HP at 75, engine oil 98, coolant 95: ready');
        n = 0; car.rpm = 0; seen = await watch(car, 45, (st) => { if (st.fluids.gearbox.temp === null) n++; });
        ok(seen === 'ready' && n === 0, 'B2 (S2): the engine stopped for 45 s with the screen open: up to temperature throughout, the gearbox reading live throughout (it fell to "Engine off, waiting for gearbox oil" after 17 s)');
        car.rpm = 900; await advance(400); car.rpm = 4500; car.speed = 30; seen = await watch(car, 10);
        ok(seen === 'ready', 'B2 (S2): restarted and away at 4,500 rpm: ready, no "Warming up", no "Ease off"');
        // S3: the app closed and no widget
        car = zf(await boot()); car.rpm = 2000; car.speed = 80; car.temps(95, 98);
        await advance(10000); t0 = clock.mono;
        seen = await watch(car, 120);
        ok(seen === 'ready', 'B2 (S3): app closed, no widget, a warm car for 2 minutes: ready throughout (it was "warming" for 5 s in every 25)');
        ok(asked(car, t0) === 0 && car.status().held.join() === 'gearbox', 'B2 (S3): on the gearbox\'s last reading, and the unit is not asked meanwhile (it was asked every 25 s)');
        car.rpm = 0; car.speed = 0; seen = await watch(car, 60); car.rpm = 2000; seen += ',' + await watch(car, 20);
        ok(seen === 'ready,ready', 'B2: a minute stopped and a restart with the app closed: still ready');
        t0 = clock.mono; car.screen = true; await advance(2000); texts = await car.frame();
        ok(asked(car, t0) >= 1 && car.status().fluids.gearbox.temp === 75 && car.status().held.length === 0 && has(texts, '75'), 'B2: the screen is opened: the gearbox unit is asked within a second, and its live reading is on the screen within 2');
        // the unit stops answering with the screen open: counted on its last reading, and shown as that
        car.egs = () => null; await advance(30000); texts = await car.frame();
        ok(car.status().overall === 'ready' && texts[0] === 'UP TO TEMPERATURE' && /gearbox oil on its last reading$/.test(texts[1]), 'B2: the gearbox unit stops answering: "' + texts[1] + '"');
        ok(has(texts, 'on its last reading, 75°C') && has(texts, '--') && !has(texts, '75'), 'B2: its row says "on its last reading, 75°C" and the big number is "--": the old number is not drawn as live');
        // S3w: only the widget on the home screen
        car = zf(await boot()); car.widget = true; car.rpm = 2000; car.speed = 80; car.temps(95, 98);
        await advance(10000);
        n = 0; seen = await watch(car, 120, (st) => { if (st.fluids.gearbox.temp === null) n++; });
        ok(seen === 'ready' && n === 0, 'B2 (S3w): with the widget on the home screen: asked while the car is driven, ready and live throughout');
        car.rpm = 0; car.speed = 0; t0 = clock.mono; await advance(170000);
        n = asked(car, t0); t0 = clock.mono + 15000; await advance(80000);
        w = await car.drawWidget();
        ok(car.status().overall === 'ready' && w.cells.TextCam === 'Oil98 Gbx-- Clt95' && w.cells.TimeElapsed === 'old gearbox temp' && has(w.texts, 'LAST 75°'), 'B2: four minutes into the stop the widget shows the gearbox as "--", "old gearbox temp" (small) and "LAST 75°" (big)');
        await advance(60000);
        ok(car.status().overall === 'off' && car.status().waiting.join() === 'gearbox', 'B2: 5 minutes after the engine stopped the old reading no longer counts: "Engine off", waiting for gearbox oil');
        await advance(300000);
        ok(n >= 30 && asked(car, t0) === 0, 'kit-B1: widget only, the engine stopped: asked for 3 minutes more (' + n + ' requests), then not at all');
        car.rpm = 2000; t0 = clock.mono; await advance(3000);
        ok(car.status().overall === 'ready' && car.status().fluids.gearbox.temp === 75, 'B2: started again: asked at once, and ready on a live reading within 3 s');
        // a car that only has the car's own gearbox signal, which comes once a minute
        car = await boot(); car.egs = () => [0x7F, 0x22, 0x31]; car.screen = true; car.rpm = 2000; car.speed = 80; car.temps(92, 95);
        car.send.gearboxSignal(68); await advance(60000); car.send.gearboxSignal(70); await advance(5000);
        ok(car.status().overall === 'ready' && car.status().fluids.gearbox.temp === 70, 'the car\'s own gearbox signal, once it has moved: ready');
        seen = ''; for (let i = 0; i < 5; i++) { seen += await watch(car, 55) + ','; car.send.gearboxSignal(71 + i); await advance(5000); }
        ok(seen === 'ready,ready,ready,ready,ready,', 'B2: that signal arriving once a minute: ready throughout (it was 20 s ready, 40 s "warming")');
        // the app closed, and the gearbox read a little under its limit on a car that is ready
        gb = 30; car = zf(await boot()); car.rpm = 2000; car.speed = 60; car.temps(30, 30);
        await advance(5000); gb = 62; car.temps(90, 95); await advance(10000);
        ok(car.status().overall === 'ready', 'a watched warm-up with the app closed: ready, the gearbox at 62');
        gb = 55; await advance(60000); car.screen = true; await advance(3000); car.screen = false;
        ok(car.status().overall === 'ready' && car.status().fluids.gearbox.state === 'dip' && car.status().fluids.gearbox.temp === 55, 'the gearbox has cooled to 55 meanwhile, as a look at the screen shows: ready, the gearbox shown as dipped');
        t0 = clock.mono; n = 0; seen = await watch(car, 120, (st) => { if (st.fluids.gearbox.temp === null) n++; });
        ok(seen === 'ready' && n === 0 && asked(car, t0) >= 20, 'B2: the app closed again, two minutes: ready throughout, the dipped gearbox kept live (' + asked(car, t0) + ' requests; it was "warming, waiting for gearbox oil" for a second in every 25, as its reading aged out)');
        gb = 61; await advance(30000); t0 = clock.mono; seen = await watch(car, 60);
        ok(seen === 'ready' && asked(car, t0) === 0 && car.status().held.join() === 'gearbox', 'B2: back at 61: in range, so the unit is left alone again and the gearbox counts on its last reading');
    });

    await drive('once ready, a dip in coolant does not bring "Warming up" back (the fault added on coolant sagging)', async () => {
        gb = 30; car = zf(await boot()); car.screen = true; car.widget = true; car.rpm = 900; car.speed = 0; car.temps(30, 30);
        await advance(5000);
        gb = 85; car.rpm = 3000; car.speed = 100; car.temps(95, 100);
        await advance(8000); texts = await car.frame();
        ok(texts[0] === 'UP TO TEMPERATURE' && logged(car, /announced/) === 1, 'a watched warm-up: up to temperature, announced');
        car.rpm = 5500; car.temps(76, 105);
        seen = await watch(car, 20); texts = await car.frame(); w = await car.drawWidget();
        ok(seen === 'ready', 'coolant sags to 76 at 5,500 rpm: the car stays up to temperature (it was "Warming up" with a red "Ease off ... on a cold engine")');
        ok(texts[0] === 'UP TO TEMPERATURE' && texts[1] === 'Engine oil and gearbox oil are in their safe range  ·  coolant has dipped below 80°C', 'the status line does not claim coolant is in range: "' + texts[1] + '"');
        ok(has(texts, 'BELOW 80°C') && has(texts, 'dipped after the warm-up') && has(texts, '76') && !has(texts, 'EASE OFF') && !has(texts, 'KEEP BELOW'), 'coolant\'s own row shows it: "BELOW 80°C", with its live 76, and there is no rev advice');
        ok(w.cells.TextRecordings === 'UP TO TEMPERATURE' && w.cells.TimeElapsed === 'coolant dipped' && has(w.texts, 'BELOW 80°'), 'the widget says the same: "coolant dipped" (small), "BELOW 80°" (big)');
        car.temps(82, 105); await advance(700000);
        ok(car.status().overall === 'ready' && logged(car, /announced/) === 1, 'back at 82 more than 10 minutes later: no second full-screen announcement');
        car.rpm = 3000; car.temps(60, 105); await advance(4000); texts = await car.frame();
        ok(texts[0] === 'WARMING UP' && /^Keep below 4,000 rpm until warm  ·  waiting for coolant/.test(texts[1]), 'coolant 20 under its "safe from": that is cold, and it is "Warming up" with the rev advice again');
        car.rpm = 5500; await advance(1500); texts = await car.frame();
        ok(texts[0] === 'EASE OFF' && /^5,50\d rpm on a cold engine/.test(texts[1]), 'and 5,500 rpm is then flagged: "' + texts[1] + '"');
    });

    await drive('a car that is only found in range has not earned "ready through a small dip" (the same fault)', async () => {
        // back at the car after a stop long enough for the head unit to have shut down: a new app, the engine off
        for (const screen of [true, false]) {
            const where = screen ? 'screen open' : 'app closed';
            gb = 66; car = zf(await boot()); car.screen = screen; car.rpm = 0; car.speed = 0; car.temps(83, 84);
            await advance(60000);
            if (screen) { texts = await car.frame(); ok(texts[0] === 'UP TO TEMPERATURE', 'the head unit starts on a parked car that reads 84 / 66 / 83 with the engine off: "Up to temperature", on its readings'); }
            // started; in 20 s the readings settle at oil 76, coolant 72 (the sensors were heat-soaked); then 4,500 rpm
            car.rpm = 900; await advance(5000); car.temps(78, 81); await advance(5000); car.temps(74, 78); await advance(5000); car.temps(72, 76); await advance(5000);
            car.rpm = 4500; car.speed = 50; await advance(1500);
            seen = await watch(car, 60); car.screen = true; texts = await car.frame();
            ok(seen === 'warming+over' && texts[0] === 'EASE OFF' && /^4,50\d rpm on a cold engine  ·  keep below 4,000 rpm until warm$/.test(texts[1]),
                where + ': started, the readings settle at 76 / 66 / 72 within 20 s, then 4,500 rpm for a minute: "Ease off", "' + texts[1] + '" (it was "Up to temperature ... engine oil and coolant have dipped a little", with no rev advice, for the whole drive)');
        }
        // two minutes of running in range earn it
        gb = 66; car = zf(await boot()); car.screen = true; car.rpm = 2000; car.speed = 50; car.temps(83, 84);
        await advance(125000); car.rpm = 4500; car.temps(76, 84);
        seen = await watch(car, 10); texts = await car.frame();
        ok(seen === 'ready' && texts[0] === 'UP TO TEMPERATURE' && /coolant has dipped below 80°C$/.test(texts[1]), 'a car found in range and driven for 2 minutes in range, then coolant 76 at 4,500 rpm: a dip, "' + texts[1] + '"');
        // the app does not run for 40 minutes while both of the head unit's clocks go on: the engine running at its last look, and at its next
        gb = 30; car = zf(await boot()); car.screen = true; car.rpm = 900; car.speed = 0; car.temps(30, 30);
        await advance(5000); gb = 85; car.rpm = 3000; car.speed = 100; car.temps(95, 100); await advance(8000);
        ok(car.status().overall === 'ready' && logged(car, /announced/) === 1, 'a watched warm-up: up to temperature, announced');
        car.rpm = null; car.speed = null; clock.mono += 2400000; clock.wall += 2400000;
        gb = 52; car.temps(68, 70); car.rpm = 4500; car.speed = 40; car.send.rpm(4500);
        await advance(3000); texts = await car.frame();
        ok(texts[0] === 'EASE OFF' && /^4,50\d rpm on a cold engine/.test(texts[1]) && car.status().waiting.join() === 'oil,gearbox,coolant', 'the app did not run for 40 minutes; then 70 / 52 / 68 at 4,500 rpm: that engine run is over, "Ease off", "' + texts[1] + '" (it was "Up to temperature", "Engine oil, gearbox oil and coolant have dipped a little")');
    });

    await drive('the time to ready: one cap everywhere, and no figure in the first minute (warmup-B7)', async () => {
        const anyTime = (list) => list.filter((x) => /\bmin\b/i.test(x)).join(' / ');
        for (const style of ['bars', 'dials']) {
            gb = 20; car = zf(await boot({ sets: { gaugeStyle: style } })); car.screen = true; car.widget = true; car.rpm = 900; car.speed = 0; car.temps(22, 21);
            await advance(30000); texts = await car.frame(); w = await car.drawWidget();
            ok(anyTime(texts.concat(w.texts, [w.cells.TimeRemaining])) === '' && has(texts, 'WARMING UP'), 'B7 (' + style + '): 30 s into a cold idle: "Warming up" and no time figure on the screen or the widget (it read "about 50 min")');
            await advance(50000); texts = await car.frame(); w = await car.drawWidget();
            ok(/  ·  over 60 min$/.test(texts[1]) && has(texts, 'READY IN OVER 60 MIN'), 'B7 (' + style + '): at 80 s, readings not moved yet: "over 60 min" on the status line and on the rows (they read 150 min)');
            if (style === 'bars') ok(has(texts, 'READY IN OVER') && texts[texts.indexOf('READY IN OVER') + 1] === '60', 'B7: and "READY IN OVER 60 min" in the side column');
            ok(w.cells.TimeRemaining === '>60 min' && has(w.texts, '>60 min'), 'B7 (' + style + '): ">60 min" on both widgets');
            ok(!texts.concat(w.texts, [w.cells.TimeRemaining]).some((x) => { const m = /(\d+)\s*min\b/i.exec(x); return m && Number(m[1]) > 60; }), 'B7 (' + style + '): no figure over 60 anywhere: ' + anyTime(texts));
        }
        // the ignition on for a while before the engine is started (the head unit is up from the unlock): an everyday start
        for (const pre of [100, 40]) {
            gb = 20; car = zf(await boot()); car.screen = true; car.widget = true; car.rpm = 0; car.speed = 0; car.temps(20, 20);
            await advance(pre * 1000);
            let oil = 20, cool = 20; const wrong = [];
            car.rpm = 1000;
            for (let sec = 1; sec <= 70; sec++) {
                if (sec === 30) { car.rpm = 2200; car.speed = 50; }
                cool += (sec < 30 ? 3 : 7) / 60; oil += (sec < 30 ? 1.5 : 4) / 60; gb += (sec < 30 ? 0.8 : 3) / 60; car.temps(Math.round(cool), Math.round(oil));
                await advance(1000);
                if (sec > 58) continue;
                texts = await car.frame(); w = await car.drawWidget();
                const all = texts.concat(w.texts, [w.cells.TimeRemaining]);
                if (anyTime(all) !== '' || has(all, 'NOT WARMING')) wrong.push(sec + ' s: ' + (anyTime(all) || 'NOT WARMING'));
            }
            ok(wrong.length === 0, 'B7: the ignition on for ' + pre + ' s, then a normal start: no time figure and no "NOT WARMING" on the screen or the widget in the first 58 s of running' + (wrong.length ? ': ' + wrong.slice(0, 3).join(' | ') : ' (the rows read "READY IN OVER 60 MIN" and "NOT WARMING" within seconds, the status line "over 60 min")'));
            texts = await car.frame(); n = /  ·  about (\d+) min$/.exec(texts[1]);
            ok(n && Number(n[1]) >= 12 && Number(n[1]) <= 20, 'B7: at 70 s the figure is the real one: "' + texts[1].replace(/^.*  ·  /, '') + '" (16 with no wait before the start; it counted down from 56)');
        }
    });

    await drive('"Ease off": the revs that raised it, and only when a fluid is read cold (warmup-B8)', async () => {
        gb = 25; car = zf(await boot()); car.screen = true; car.rpm = 2000; car.speed = 60; car.temps(40, 30);
        await advance(10100);
        // 0.3 s at 4,600 rpm that no once-a-second check sees: the next one comes when the car has sent 2,100 again
        car.rpm = 4600; car.send.rpm(4600); await advance(300); car.rpm = 2100; car.send.rpm(2100); await advance(500); texts = await car.frame();
        ok(texts[0] === 'EASE OFF', 'B8: 0.3 s past the limit, between two once-a-second checks: flagged (the engine speed is looked at as the car sends it)');
        ok(/^4,60\d rpm on a cold engine  ·  keep below 4,000 rpm until warm$/.test(texts[1]), 'B8: the line prints the revs that raised it while the live ones are back at 2,100: "' + texts[1] + '"');
        ok(has(texts, 'EASE OFF') && texts.some((x) => /^2,10\d$/.test(x)) && has(texts, ' rpm now'), 'B8: the live revs are beside it, marked "rpm now"');
        await advance(3000); texts = await car.frame();
        ok(texts[0] === 'WARMING UP', 'B8: gone again 2.5 s after the last engine speed over the limit');
        // only the gearbox is behind
        gb = 45; car = zf(await boot()); car.screen = true; car.rpm = 2000; car.speed = 50; car.temps(90, 95);
        await advance(8000); car.rpm = 5200; await advance(1200); texts = await car.frame();
        ok(texts[0] === 'EASE OFF' && /^5,20\d rpm before the car is up to temperature  ·  keep below 4,000 rpm until warm$/.test(texts[1]), 'B8: engine oil and coolant warm, the gearbox at 45: not "on a cold engine" but "' + texts[1] + '"');
        // nothing is read cold: a warm car that lost its engine oil reading
        gb = 75; car = zf(await boot()); car.screen = true; car.rpm = 2000; car.speed = 60; car.temps(95, 98);
        await advance(8000); car.temps(95, null); await advance(12000);
        car.rpm = 4500; seen = await watch(car, 5); texts = await car.frame();
        ok(seen === 'warming' && texts[0] === 'WARMING UP' && /waiting for engine oil$/.test(texts[1]) && !has(texts, 'EASE OFF'), 'B8: a warm car whose engine oil reading is lost, at 4,500 rpm: waited for, but no "Ease off ... on a cold engine" (nothing is read cold)');
    });

    await drive('the gearbox reader and other apps\' refusals (warmup-B12, the kit sceptic\'s added fault)', async () => {
        gb = 55; car = zf(await boot()); car.screen = true; car.rpm = 2000; car.speed = 60; car.temps(90, 88);
        await advance(12000);
        ok(car.src.gearbox.temp() === 55 && car.src.gearbox.source() === 'EGS', 'the gearbox unit answers 22 6000: 55 deg C');
        car.foreign = [0x7F, 0x22, 0x31];
        await advance(6000); t0 = clock.mono; await advance(60000);
        ok(car.src.gearbox.temp() === 55 && asked(car, t0) >= 10 && logged(car, /EGS has no/) === 0, 'B12: a refusal meant for another app\'s request arrives while ours is waiting: the identifier is not given up, the reading goes on (it was "EGS has no 6000", "no DA12", and never asked again)');
        // an identifier that has answered is never given up, however often it is refused afterwards
        n = 0; car.egs = (did) => (did === 0x6000 && ++n <= 3 ? [0x62, 0x60, 0x00, 35 + 40] : [0x7F, 0x22, 0x31]);
        car = await boot({ car: { egs: car.egs } }); car.screen = true; car.rpm = 2000; car.speed = 60; car.temps(90, 88);
        await advance(120000); t0 = clock.mono; await advance(60000);
        ok(asked(car, t0) >= 10 && car.sent.every((s) => s.did === 0x6000) && logged(car, /EGS has no/) === 0, 'B12: answered three times (35 deg C), then refused for good: 6000 is still asked every 5 s, so a reading can return (it was given up, and the car then never became ready)');
        ok(car.status().overall === 'warming' && car.status().waiting.join() === 'gearbox', 'and the gearbox, last read cold, is waited for');
        // a unit that has neither identifier
        car = await boot(); car.egs = () => [0x7F, 0x22, 0x31]; car.screen = true; car.rpm = 2000; car.speed = 60; car.temps(90, 88);
        await advance(60000);
        const dids = car.sent.map((s) => s.did.toString(16)).join(' ');
        ok(dids === '6000 6000 6000 da12 da12 da12', 'B12: a unit that refuses both identifiers: each asked three times before it is given up (' + dids + '; it was once)');
        ok(car.sent[1].t - car.sent[0].t >= 5000 && car.sent[2].t - car.sent[1].t >= 5000, 'B12: on separate polls, 5 s apart');
        t0 = clock.mono; await advance(200000);
        ok(asked(car, t0) === 0 && car.src.gearbox.absent(true) === true, 'B12: then left alone, and the reader has its evidence that this car gives no gearbox reading');
        await advance(120000);
        ok(asked(car, t0) >= 1 && logged(car, /asking the gearbox unit for its identifiers again/) === 1, 'B12: asked again 5 minutes later (it was never)');
        ok(car.status().overall === 'ready' && car.status().unwatched.join() === 'gearbox', 'B1/B3: meanwhile the gearbox was left out, and stays so through the retry');
    });

    await drive('the gearbox reading and the head unit\'s clock (warmup-B10)', async () => {
        gb = 75; car = zf(await boot()); car.screen = true; car.rpm = 2000; car.speed = 80; car.temps(95, 98);
        await advance(8000);
        ok(car.src.gearbox.temp() === 75, 'the gearbox reads 75');
        clock.wall -= 7200000; car.egs = null;
        await advance(25000);
        ok(car.src.gearbox.temp() === null, 'B10: the wall clock is set back 2 hours and the unit then stops answering: 25 s later the old reading is no longer given as live (it stayed "fresh" for as long as the step)');
        // the same step with the unit still answering: the kit's link would wait out the 2 hours
        gb = 20; car = zf(await boot()); car.screen = true; car.rpm = 2000; car.speed = 80; car.temps(40, 30);
        await advance(12000);
        clock.wall -= 7200000; gb = 60; t0 = clock.mono;
        await advance(60000);
        ok(asked(car, t0) >= 3 && car.src.gearbox.temp() === 60, 'the wall clock set back 2 hours while the unit answers: the reader is asking again within a minute and reads the real 60 (the request hung for 2 hours and the screen kept the old 20)');
        ok(logged(car, /a request has not come back for 30 s: setting the diagnostic link up again/) === 1, 'logged: ' + car.logs.filter((l) => /has not come back/.test(l))[0]);
        clock.wall += 3 * 365 * 86400000;
        ok(car.src.gearbox.temp() === null, 'the wall clock set forward by years (the head unit setting its clock): the reading before the step is dropped, not shown');
        await advance(8000);
        ok(car.src.gearbox.temp() === 60 && logged(car, /clock jumped ahead by \d+ min: taken as a long stop/) === 1, 'and the next poll has a live one again; the decision takes the step as a long stop');
    });

    await drive('a subscription or the diagnostic link failing at start-up is tried again (warmup-B11)', async () => {
        gb = 30; car = zf(await boot({ car: { watchFail: { CDS: 2, BasicDataSet: 1 }, proxyFail: 1 } })); car.screen = true;
        ok(!car.handlers.CDS && !car.handlers.BasicDataSet, 'the car\'s services are not up when the app starts: the first subscriptions fail');
        await advance(6000);
        ok(!car.handlers.CDS && !!car.handlers.BasicDataSet, 'B11: tried again after 5 s: the gearbox signal is there now, the engine signals still not');
        await advance(16000);
        ok(!!car.handlers.CDS, 'B11: and again 15 s later: the engine signals are subscribed (it was never tried again, and the app ran blind)');
        car.rpm = 900; car.speed = 0; car.temps(22, 21); await advance(8000);
        ok(car.status().overall === 'warming' && car.status().fluids.oil.temp === 21 && car.status().fluids.gearbox.temp === 30, 'B11: readings flow: engine oil 21, and the gearbox unit answers through the link set up at its second try');
        ok(logged(car, /signal CDS error: .* \(trying again in 5 s\)/) === 1 && logged(car, /signal CDS error: .* \(trying again in 15 s\)/) === 1 && logged(car, /signal CDS subscribed \(try 3\)/) === 1, 'B11: each outcome is in the log: ' + car.logs.filter((l) => /signal CDS/.test(l)).join(' | '));
        ok(logged(car, /gearbox: no diagnostic link \(trying again in 5 s\)/) === 1 && logged(car, /gearbox: diagnostic link ready \(set up again\)/) === 1, 'B11: and the link\'s: ' + car.logs.filter((l) => /diagnostic link/.test(l)).join(' | '));
        // a head unit without the (optional) vehicle state interface: said once, not tried again, and the app runs without it
        gb = 30; car = zf(await boot({ car: { missing: { VehicleCondition: true } } })); car.rpm = 900; car.speed = 0; car.temps(22, 21);
        await advance(120000);
        ok(logged(car, /signal VehicleCondition error: .*no SOME\/IP config.* \(not tried again\)/) === 1 && logged(car, /signal VehicleCondition/) === 1, 'kit-B1: a head unit that has no vehicle state interface: logged once, not tried again');
        ok(car.status().overall === 'warming' && asked(car) >= 20, 'and the app goes by the engine alone: the gearbox unit is asked while the car warms up (' + asked(car) + ' requests in 2 minutes)');
    });

    await drive('the widget (warmup-B14, warmup-B15, kit-B4, the added fault on its line length)', async () => {
        const lines = [];
        const look = async (c, what) => { const x = await c.drawWidget(); Object.keys(x.cells).forEach((k) => { if (typeof x.cells[k] === 'string') lines.push(x.cells[k]); }); return x; };
        for (const unit of ['c', 'f']) {
            for (const demo of ['off', 'on']) {
                gb = 20; car = zf(await boot({ sets: { tempUnit: unit, demo } })); car.widget = true; car.rpm = 900; car.speed = 0; car.temps(22, 21);
                await look(car);                                                      // no data yet
                await advance(30000); await look(car);                               // warming up, no figure
                await advance(50000); await look(car);                               // over 60 min
                for (let s = 0; s < 150; s++) { car.rpm = 2000; car.speed = 60; car.temps(22 + Math.floor(s * 0.2), 21 + Math.floor(s * 0.1)); gb = 20 + s * 0.05; await advance(1000); }
                w = await look(car);                                                 // a figure
                if (demo === 'off') ok(/^~\d+ min$/.test(w.cells.TimeRemaining) && w.cells.TimeElapsed === 'below 4000 rpm', 'the small widget while warming up: "' + w.cells.TimeElapsed + '", "' + w.cells.TimeRemaining + '"');
                car.rpm = 4600; await advance(1200); await look(car);                // ease off
                gb = 100; car.rpm = 3000; car.temps(110, 110); await advance(8000);
                w = await look(car);                                                 // three digits each
                if (demo === 'off') ok(w.cells.TextCam === (unit === 'f' ? 'Oil230 Gbx212 Clt230' : 'Oil110 Gbx100 Clt110') && w.cells.Title === 'Warm-Up, deg ' + unit.toUpperCase(), 'kit-B4: three-digit values in ' + (unit === 'f' ? 'Fahrenheit' : 'Celsius') + ': "' + w.cells.TextCam + '" (' + w.cells.TextCam.length + ' characters), the unit in the title: "' + w.cells.Title + '"');
                gb = 85; car.temps(95, 100); await advance(8000); await look(car);    // up to temperature
                car.temps(76, 100); await advance(3000); await look(car);            // a dip
                car.temps(95, 100); car.egs = () => null; await advance(30000); await look(car);     // the gearbox on its last reading
                car.temps(118, 100); await advance(3000); await look(car);           // too hot
                car.rpm = 0; car.speed = 0; car.temps(60, 60); await advance(3000); await look(car);  // engine off
                car.temps(-30, -30); await advance(3000); await look(car);           // negative values
            }
            // a manual car, and one switched to "Not monitored"
            car = await boot({ sets: { tempUnit: unit } }); car.widget = true; car.rpm = 2000; car.speed = 50; car.temps(105, 110); car.send.gearboxSignal(null);
            await advance(100000); w = await look(car);
            ok(w.cells.TimeElapsed === 'no gearbox temp' && /^Oil\d+ Gbx-- Clt\d+$/.test(w.cells.TextCam), 'a gearbox that is left out on the small widget: "' + w.cells.TextCam + '", "' + w.cells.TimeElapsed + '"');
            car = await boot({ sets: { tempUnit: unit, gearboxSource: 'none' } }); car.widget = true; car.rpm = 2000; car.speed = 50; car.temps(105, 110);
            await advance(5000); await look(car);
        }
        const longest = lines.slice().sort((a, b) => b.length - a.length)[0];
        ok(lines.length > 200 && lines.every((x) => x.length <= 20), 'kit-B4: every text line of the small widget is 20 characters or fewer in every state tried, Celsius and Fahrenheit, demo on and off (the longest: "' + longest + '", ' + longest.length + '; the temperature line was 24 to 27)');
        ok(lines.every((x) => /^[\x20-\x7e]*$/.test(x)), 'and plain ASCII, as the widget\'s text cells take');
        // the big widget: the unit letter, and the logo switch
        for (const unit of ['c', 'f']) {
            gb = 85; car = zf(await boot({ sets: { tempUnit: unit } })); car.widget = true; car.rpm = 2000; car.speed = 50; car.temps(95, 100);
            await advance(8000); w = await car.drawWidget();
            ok(has(w.texts, unit === 'f' ? '°F' : '°C') && w.logo === true, 'B15: the big widget names its unit, "' + (unit === 'f' ? '°F' : '°C') + '", once on its top line; with the logo setting on the logo is painted');
        }
        gb = 85; car = zf(await boot({ sets: { branding: false } })); car.widget = true; car.rpm = 2000; car.speed = 50; car.temps(95, 100);
        await advance(8000); w = await car.drawWidget();
        ok(w.logo === false, 'B15: "Proven logo" switched off: no logo on the widget either');
        // progress from the start of the warm-up
        gb = 70; car = zf(await boot()); car.widget = true; car.rpm = 900; car.speed = 0;
        const prog = [];
        for (let s = 0; s <= 480; s += 2) { car.temps(90, Math.min(50, Math.round(20 + s * 0.25))); await advance(2000); if (s % 20 === 0) prog.push((await car.drawWidget()).cells.Progress); }
        ok(prog.every((x, i) => i === 0 || x >= prog[i - 1]) && prog[prog.length - 1] === 0.5, 'B14: engine oil rises to 50 and stays there: the small widget\'s progress bar never runs backwards and ends at 0.5 of the way from 20 to 80 (' + prog.filter((x, i) => i % 4 === 0).join(' ') + '; it fell back to 0)');
    });

    await drive('every state of the screen and the widget is drawn, in both gauge styles and both units', async () => {
        const titles = [];
        const look = async (c) => { const x = await c.frame(); await c.drawWidget(); titles.push(x[0]); return x; };
        for (const style of ['bars', 'dials']) for (const unit of ['c', 'f']) for (const source of ['auto', 'none']) {
            gb = 20; car = zf(await boot({ sets: { gaugeStyle: style, tempUnit: unit, gearboxSource: source, branding: unit === 'c' } })); car.screen = true; car.widget = true;
            texts = await look(car);                                                                // nothing from the car yet
            ok(texts[0] === 'NO TEMPERATURE DATA' && texts[1] === 'waiting for the car', style + ', ' + unit + ', gearbox ' + source + ': before the car has sent anything: "No temperature data", "waiting for the car"');
            car.rpm = 0; car.speed = 0; car.temps(20, 20); await advance(3000); await look(car);    // engine off, cold
            car.rpm = 900; await advance(150000); texts = await look(car);                          // readings that do not move
            ok(texts[0] === 'WARMING UP' && has(texts, 'NOT WARMING'), style + ', ' + unit + ', gearbox ' + source + ': readings that stand still for 2.5 minutes: NOT WARMING on their rows');
            car.rpm = 4600; await advance(1500); await look(car);                                   // ease off
            gb = 105; car.rpm = 3000; car.temps(118, 120); await advance(4000); await look(car);     // too hot
            car.temps(null, null); await advance(12000); await look(car);                           // the car sends "no value"
            gb = 70; car.temps(90, 95); await advance(4000); await look(car);                       // up to temperature
            car.temps(90, null); await advance(12000); await look(car);                             // engine oil lost
            car.temps(90, 95); await advance(4000); car.temps(70, 66); gb = 46; await advance(7000); await look(car);    // every fluid dipped
            car.egs = () => null; car.temps(90, 95); await advance(30000); await look(car);          // the gearbox on its last reading
        }
        const seen = titles.filter((x, i) => titles.indexOf(x) === i).sort().join(', ');
        ok(seen === 'EASE OFF, ENGINE OFF, NO TEMPERATURE DATA, TOO HOT, UP TO TEMPERATURE, WARMING UP', titles.length + ' frames, every status the screen has: ' + seen);
    });

    ok(mishaps().length === 0, 'in all these drives no frame of the screen threw, and the app logged no error' + (mishaps().length ? ': ' + mishaps().slice(0, 3).join(' | ') : ''));
};

if (require.main === module) {
    let n = 0;
    const failed = [];
    const ok = (cond, what) => {
        if (!cond && process.env.WARMUP_TEST_ALL) { failed.push(what); console.log('  FAILED  ' + what); return; }
        assert.ok(cond, what); n++; console.log('  ok  ' + what);
    };
    module.exports(process.argv[2], ok).then(() => {
        if (failed.length) { console.log(n + ' checks passed, ' + failed.length + ' FAILED:\n  ' + failed.join('\n  ')); process.exit(1); }
        console.log(n + ' checks, ALL OK');
        process.exit(0);
    }, (e) => { console.error(e && e.stack || e); process.exit(1); });
}
