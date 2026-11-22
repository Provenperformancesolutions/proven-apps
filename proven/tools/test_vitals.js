'use strict';
/**
 * test_vitals.js <built app: dist/pps_gauges> - feeds raw car values into the data layer the way the car's
 * signals arrive and checks what the gauges would show: scaling, the car's display units, readings the car
 * takes back ("no value"), demo data kept apart from the car's, peaks, power, the raw-value log.
 * No car, no SDK: fakecar.js hands the signal handlers back and moves the clock by hand.
 * (The engine unit and gearbox unit are in test_engine_unit.js, ethanol in test_ethanol.js, the drawing in test_screens.js.)
 */
const { clock, makeCar, checker } = require('./fakecar');
const APP = process.argv[2];
const ok = checker();
const near = (a, b, tol, what) => ok(typeof a === 'number' && Math.abs(a - b) <= (tol || 1e-6), what + ' = ' + (typeof a === 'number' ? Math.round(a * 1000) / 1000 : a) + (typeof a === 'number' && Math.abs(a - b) <= (tol || 1e-6) ? '' : ' (expected ' + b + ')'));
const PSI = 14.5038;
const g = (x) => 32500 + Math.round(x * 9.80665 / 0.002);            // raw acceleration for x g
const nums = (a) => a.filter((x) => typeof x === 'number');
const units = (h, press, temp) => h.Vehicle.statusNewCurrentUnitsStatusExt({ unitOfMeasurementAirPressure: press, unitOfMeasurementTemperature: temp });
const tyresP = (h, a) => h.TPMS.statusTyrePressure({ actualValuePressureTyreFLH: a[0], actualValuePressureTyreFRH: a[1], actualValuePressureTyreRLH: a[2], actualValuePressureTyreRRH: a[3] });
const tyresT = (h, a) => h.TPMS.statusTyreTemperature({ actualValueTemperatureTyreFLH: a[0], actualValueTemperatureTyreFRH: a[1], actualValueTemperatureTyreRLH: a[2], actualValueTemperatureTyreRRH: a[3] });
const boost = (h, raw) => h.FES.statusSwitchDriveDynamicSport2({ displayBoostPressure: raw });

clock.install();
(async () => {
    await ok.part('car values -> gauges (a car set to bar and deg C)', async () => {
        const car = makeCar(APP), v = car.vitals(), h = car.handlers;
        await clock.advance(10);
        units(h, 1, 1);
        h.CDS.statusEngineSpeed2({ actualValueRPMEngineCrankshaft: 12000 });
        h.CDS.statusEngineTemperature({ temperatureEngineDrive: 138, temperatureEngineOilDrive: 153 });
        h.Vehicle2.statusCarSpeed2({ speedVehicleCentreOfGravity: 6400 });
        h.CDS2.statusLongitudinalAccelerationMassCenter({ longitudinalAccelerationCentreOfGravity: g(0.5) });
        h.CDS2.statusLateralAccelerationMassCenter({ lateralAccelerationCentreOfGravity: g(-1.0) });
        h.FES.statusActualValueTorque2({ actualValueTorqueCrankshaft: 2047 + 2 * 450 });
        h.FES.statusVehicleDynamicEngine({ displaySportEnginePower: 70, displaySportEngineTorque: 85 });
        h.FES.statusVehicleDynamicEngine({ displaySportEnginePower: 80, displaySportEngineTorque: 90 });   // the % counts once it has moved
        boost(h, 100); boost(h, 120);                                                                       // boost too
        h.EnvironmentalInformation.ExteriorTemperature({ temperatureExterior: 136 });
        h.BasicDataSet.basicDataSet({ valueTemperatureTransmissionOil: 120 });
        h.BasicDataSet.basicDataSet({ valueTemperatureTransmissionOil: 128 });                              // gearbox oil too
        h.VehicleInformation.statusGearboxDrive({ statusActualGearDrive: 6, statusActualStageDrive: 4 });
        tyresP(h, [24, 24, 26, 65535]);
        tyresT(h, [75, 76, 80, 65535]);
        const d = v.data();
        near(d.rpm, 3000, 0, 'engine speed, rpm');
        near(d.speed, 100, 0, 'speed, km/h');
        near(d.coolant, 90, 0, 'coolant, deg C');
        near(d.oil, 105, 0, 'oil, deg C');
        near(d.gLong, 0.5, 0.002, 'longitudinal g');
        near(d.gLat, -1.0, 0.002, 'lateral g');
        near(d.torque, 450, 0, 'torque, Nm');
        near(d.powerCalc, 450 * 3000 / 9549, 0.01, 'power from torque x rpm, kW');
        near(d.powerPct, 80, 0, 'sport display power, %');
        near(d.boost, 1.2, 1e-9, 'boost, bar (0.01 bar steps on a car set to bar)');
        near(d.ambient, 28, 0, 'outside, deg C');
        near(d.gearbox, 80, 0, 'gearbox oil, deg C');
        near(d.gear, 4, 0, 'gear');
        ok(d.stage === 'D', 'selector = D');
        near(d.pFL, 2.4, 1e-9, 'tyre FL, bar');
        near(d.pRL, 2.6, 1e-9, 'tyre RL, bar');
        ok(d.pRR === undefined, 'tyre RR "no value" (65535) is left out');
        near(d.tFL, 35, 0, 'tyre temperature FL, deg C');
        ok(v.usingDemo() === false, 'live data, not demo');
        // the diagnostics side: with no link, nothing is asked and the tiles say why
        ok(v.dmeWhy('iat') === 'no diagnostic link', 'engine-unit tiles say "no diagnostic link" without one');
        car.values.engineData = 'off';
        ok(v.dmeWhy('iat') === 'engine data off', '"Engine unit data: Off" is respected');
    });

    await ok.part('a reading the car takes back, or sends out of range (gauges-B3)', async () => {
        const car = makeCar(APP), v = car.vitals(), h = car.handlers;
        await clock.advance(10);
        units(h, 3, 1);
        h.CDS.statusEngineSpeed2({ actualValueRPMEngineCrankshaft: 12000 });
        h.FES.statusActualValueTorque2({ actualValueTorqueCrankshaft: 2047 + 2 * 450 });
        h.Vehicle2.statusCarSpeed2({ speedVehicleCentreOfGravity: 6400 });
        h.CDS.statusEngineTemperature({ temperatureEngineDrive: 138, temperatureEngineOilDrive: 153 });
        tyresP(h, [350, 350, 380, 380]);
        // "no value" in place of the two temperatures and the engine speed
        h.CDS.statusEngineTemperature({ temperatureEngineDrive: 255, temperatureEngineOilDrive: 255 });
        h.CDS.statusEngineSpeed2({ actualValueRPMEngineCrankshaft: 65535 });
        await clock.advance(9000);
        let d = v.data();
        ok(d.coolant === 90 && d.oil === 105 && d.rpm === 3000, '9 s after the car\'s "no value": the last readings are still shown (coolant ' + d.coolant + ', oil ' + d.oil + ', rpm ' + d.rpm + ')');
        await clock.advance(1500);
        d = v.data();
        ok(d.coolant === undefined && d.oil === undefined, '10.5 s after it: coolant and oil are dropped, not shown as live');
        ok(d.rpm === undefined && d.powerCalc === undefined, 'the engine speed too, and the power worked out from it');
        ok(v.why('coolant') === 'no value from the car', 'the tile says why: "' + v.why('coolant') + '"');
        ok(d.speed === 100 && d.torque === 450, 'a reading whose signal is merely silent is kept (the car only sends changes): speed ' + d.speed + ', torque ' + d.torque);
        await clock.advance(600000);
        ok(v.data().speed === 100, 'and still after 10 minutes of silence');
        h.CDS.statusEngineTemperature({ temperatureEngineDrive: 139, temperatureEngineOilDrive: 154 });
        d = v.data();
        ok(d.coolant === 91 && d.oil === 106, 'a real value again: shown again');
        // a tyre losing its air
        const shown = [];
        [300, 200, 120, 80, 60, 50, 0].forEach((raw) => { tyresP(h, [raw, 350, 380, 380]); const p = v.data().pFL; shown.push(p === undefined ? '--' : String(Math.round(p * PSI))); });
        ok(shown.join(' ') === '30 20 12 8 -- -- --', 'a tyre going down 30, 20, 12, 8, 6, 5, 0 psi shows ' + shown.join(', ') + ': never the last healthy number');
        ok(Math.round(v.data().pFR * PSI) === 35, 'the other tyres are untouched');
        tyresP(h, [320, 350, 380, 65535]);
        ok(Math.round(v.data().pFL * PSI) === 32 && Math.round(v.data().pRR * PSI) === 38, 'pumped up again: shown; a tyre marked "no value" keeps its reading for now');
        await clock.advance(10500);
        ok(v.data().pRR === undefined, 'and loses it after 10 s');
    });

    await ok.part('a car set to psi: nothing in the car\'s units is taken before the car has said its units (gauges-B9)', async () => {
        const car = makeCar(APP), v = car.vitals(), h = car.handlers;
        await clock.advance(10);
        boost(h, 0); boost(h, 174);
        tyresP(h, [350, 350, 380, 380]); tyresT(h, [75, 75, 75, 75]);
        let d = v.data();
        ok(d.boost == null && d.pFL === undefined && d.tFL === undefined, 'before the unit signal: no boost, no tyre value (17.4 psi was shown as 25.2 psi, a 35 deg C tyre as 2 deg C)');
        ok(v.units().known === false && /waiting for car units/.test(v.boostWhy()), 'the boost dial says "' + v.boostWhy() + '"');
        units(h, 3, 1);
        boost(h, 200);
        d = v.data();
        near(d.boost, 20 / PSI, 1e-6, 'after it (psi, deg C): boost, bar, from 20.0 psi');
        near(d.pFL, 35 / PSI, 1e-6, 'tyre FL, bar (35 psi), from the value that waited');
        near(d.tFL, 35, 0, 'tyre temperature FL, deg C: a car set to psi is not thereby set to Fahrenheit');
        ok(v.units().known === true, 'units known');
        // the driver changes the car's unit: what was taken in the old one goes, and so does the boost peak
        v.raise('boost', d.boost);
        ok(v.pk().boost > 1.3, 'boost peak ' + (v.pk().boost * PSI).toFixed(1) + ' psi');
        units(h, 1, 1);
        ok(v.pk().boost === undefined && v.data().boost == null && v.data().pFL === undefined, 'the car is set to bar: the boost peak and the values in psi are gone');
        boost(h, 120); tyresP(h, [24, 24, 26, 26]);
        near(v.data().boost, 1.2, 1e-9, 'and the next values are read in bar: boost');
        near(v.data().pFL, 2.4, 1e-9, 'tyre FL, bar');
    });

    await ok.part('a car that never says its units (gauges-B9)', async () => {
        const car = makeCar(APP), v = car.vitals(), h = car.handlers;
        await clock.advance(10);
        boost(h, 174); tyresP(h, [350, 350, 380, 380]); tyresT(h, [75, 75, 75, 75]);
        await clock.advance(5000);
        ok(v.data().pFL === undefined, 'after 5 s: still waiting');
        await clock.advance(3500);
        const d = v.data(), u = v.units();
        near(d.pFL, 35 / PSI, 1e-6, 'after 8 s the values are taken by their size: tyre FL, bar (35 psi)');
        near(d.tFL, 35, 0, 'tyre temperature FL, deg C (not read as Fahrenheit because the pressures look like psi)');
        ok(u.known === false && u.late === true && u.psi === true, 'and the screen is told the units are a guess (late, taken as psi)');
        boost(h, 200);
        near(v.data().boost, 20 / PSI, 1e-6, 'boost, bar, taken as 0.1 psi steps because the tyres read in psi');
        ok(car.logs.some((l) => /car units: none received/.test(l)), 'logged');
        // the same car, but its tyre pressures only come after the wait: boost was read as bar until then
        const car2 = makeCar(APP), v2 = car2.vitals();
        await clock.advance(8500);
        boost(car2.handlers, 0); boost(car2.handlers, 174);
        near(v2.data().boost, 1.74, 1e-9, 'no unit and no tyre value yet: the sport display\'s 174 is read as bar');
        ok(v2.units().psi === false && v2.pk().boost > 1.7, 'and the screen says "read as bar / kPa"');
        tyresP(car2.handlers, [350, 350, 380, 380]);
        ok(v2.units().psi === true && Math.abs(v2.data().boost - 17.4 / PSI) < 1e-6 && Math.abs(v2.pk().boost - 17.4 / PSI) < 1e-6, 'the tyres then read in psi: the same 174 is 17.4 psi, and the peak taken as bar is gone with it');
        boost(car2.handlers, 200);
        near(v2.data().boost, 20 / PSI, 1e-6, 'and boost is read in 0.1 psi steps from there');
    });

    await ok.part('a car that never says its units: a tyre going flat is not a healthy number of another unit (gauges-B9)', async () => {
        const shown = (v, k) => { const p = v.data()['p' + k]; return p === undefined ? '--' : String(Math.round(p * PSI * 10) / 10); };
        // a car set to psi: 35 / 35 / 38 psi and one tyre at 5 psi
        const car = makeCar(APP), v = car.vitals(), h = car.handlers;
        await clock.advance(8500);
        tyresP(h, [350, 350, 380, 50]);
        h.TPMS.statusTargetTyrePressure({ targetPressureTyreFLH: 350, targetPressureTyreFRH: 350, targetPressureTyreRLH: 380, targetPressureTyreRRH: 380 });
        ok(shown(v, 'FL') === '35' && shown(v, 'RL') === '38' && v.units().psi === true, 'psi car, 35 / 35 / 38 / 5 psi: the unit is told by the largest of the four, psi (FL ' + shown(v, 'FL') + ', RL ' + shown(v, 'RL') + ' psi)');
        ok(shown(v, 'RR') === '--' && v.bad.pRR !== undefined, 'the tyre at 5 psi is "--", out of range (sized on its own it was read as 5 bar and shown as 72.5 psi)');
        near(v.data().ptRR, 38 / PSI, 1e-6, 'the car\'s targets are read in the same unit: RR target, bar (38 psi)');
        tyresP(h, [350, 350, 380, 30]);
        ok(shown(v, 'RR') === '--', 'at 3 psi too (it was 43.5 psi, green against a 38 psi target)');
        tyresP(h, [65535, 65535, 65535, 50]);
        ok(shown(v, 'RR') === '--' && v.units().psi === true, 'a message with the low tyre alone does not turn the unit to bar: still "--"');
        tyresP(h, [350, 350, 380, 300]);
        ok(shown(v, 'RR') === '30', 'pumped up to 30 psi: shown again');
        ok(car.logs.some((l) => /^info car units: none from the car - tyre pressures are read as PSI, by their size$/.test(l)), 'the log says which unit was found: "tyre pressures are read as PSI, by their size"');
        // the driver sets the car to bar: all four tyres say so
        boost(h, 100); boost(h, 174);
        near(v.data().boost, 17.4 / PSI, 1e-6, 'boost on that car is taken in 0.1 psi steps, bar');
        tyresP(h, [24, 24, 26, 26]);
        near(v.data().pFL, 2.4, 1e-9, 'all four tyres then read 2.4 / 2.6: the car was set to bar, tyre FL, bar');
        ok(v.units().psi === false && v.pk().boost === undefined && v.data().boost == null, 'the boost taken in psi is gone with its peak, and the last message is not read again as bar (it may be of the old unit)');
        boost(h, 120);
        near(v.data().boost, 1.2, 1e-9, 'the next one is read in bar: boost');
        // a car set to kPa: 240 / 240 / 260 kPa and one tyre at 30 kPa
        const car2 = makeCar(APP), v2 = car2.vitals();
        await clock.advance(8500);
        boost(car2.handlers, 100); boost(car2.handlers, 120);
        tyresP(car2.handlers, [2400, 2400, 2600, 300]);
        near(v2.data().pFL, 2.4, 1e-9, 'kPa car, 240 / 240 / 260 / 30 kPa: tyre FL, bar');
        ok(v2.data().pRR === undefined, 'the tyre at 30 kPa is "--" (it was read as 30 psi)');
        ok(v2.units().psi === false && Math.abs(v2.data().boost - 1.2) < 1e-9, 'and it does not turn the sport display\'s boost to psi: 1.20 bar stays 1.20 bar (it became 0.83)');
    });

    await ok.part('a unit the app does not know never takes the place of one the car has named (gauges-B9)', async () => {
        for (const bad of [0, 'INVALID', 4, undefined]) {
            const car = makeCar(APP), v = car.vitals(), h = car.handlers;
            await clock.advance(10);
            units(h, 3, 1);
            boost(h, 100); boost(h, 174); tyresP(h, [350, 350, 380, 380]);
            await clock.advance(20000);                   // long past the wait for the car's units
            units(h, bad, bad);
            boost(h, 200); tyresP(h, [360, 350, 380, 380]);
            const d = v.data();
            ok(v.units().known === true && typeof d.boost === 'number' && Math.abs(d.boost - 20 / PSI) < 1e-6 && typeof d.pFL === 'number' && Math.abs(d.pFL - 36 / PSI) < 1e-6,
                'the car named psi; a later unit message with ' + JSON.stringify(bad) + ': boost and tyres are still read, in psi (they went blank, "waiting for car units", until the car named a unit again)');
        }
        const car = makeCar(APP), v = car.vitals(), h = car.handlers;
        await clock.advance(10);
        units(h, 3, 2);
        units(h, 0, 1);
        tyresT(h, [75, 75, 75, 75]); tyresP(h, [350, 350, 380, 380]);
        near(v.data().tFL, 35, 0, 'a known temperature unit beside an unknown pressure unit is taken (deg F -> deg C): tyre temperature FL, deg C');
        near(v.data().pFL, 35 / PSI, 1e-6, 'and the pressure unit stays psi: tyre FL, bar');
    });

    await ok.part('demo data and the car\'s never share a trace (gauges-B2)', async () => {
        const car = makeCar(APP, { settings: { demo: 'auto' }, available: false }), v = car.vitals(), h = car.handlers;
        await clock.advance(4900);
        ok(v.usingDemo() === false, 'Auto, nothing from the car: no demo for the first 5 s');
        await clock.advance(200);
        ok(v.usingDemo() === true, 'then the demo drive');
        await clock.advance(60000);
        v.trail.push([0.5, 0.5]);
        ok(nums(v.hist.oil).length > 50 && nums(v.trace.boost).length > 250, 'after a minute of demo: ' + nums(v.hist.oil).length + ' demo oil samples, ' + nums(v.trace.boost).length + ' demo boost samples');
        car.subs.forEach((s) => { s.available = true; });
        h.CDS.statusEngineTemperature({ temperatureEngineDrive: 66, temperatureEngineOilDrive: 66 });          // the car: 18 deg C
        ok(v.usingDemo() === false && v.data().oil === 18, 'the car answers: live, oil 18 deg C');
        ok(nums(v.hist.oil).length === 0 && nums(v.trace.boost).length === 0 && v.trail.length === 0, 'the histories, the boost trace and the g trail are empty at once');
        await clock.advance(30000);
        const o = nums(v.hist.oil);
        ok(o.length >= 29 && Math.max.apply(null, o) === 18 && Math.min.apply(null, o) === 18, '30 s later: oil history min 18 / max 18 (' + o.length + ' samples), no demo sample among them');
        ok(nums(v.trace.boost).length === 0, 'no demo boost in the 60 s trace ("Chart max" would have read 1.50 bar)');
        // and the other way round
        car.settings.set('demo', 'on');
        ok(v.usingDemo() === true && v.data().rpm > 0, 'Demo data: Always');
        ok(nums(v.hist.oil).length === 0, 'the car\'s samples are not in the demo\'s traces either');
        await clock.advance(5000);
        car.settings.set('demo', 'off');
        v.data();
        ok(nums(v.hist.oil).length === 0 && nums(v.trace.boost).length === 0, 'and back: empty again');
    });

    await ok.part('peaks are taken where the values arrive, g peaks only once zeroed (gauges-B10, peaks with the screen off)', async () => {
        const car = makeCar(APP), v = car.vitals(), h = car.handlers;
        await clock.advance(10);
        units(h, 1, 1);
        const lon = (x) => h.CDS2.statusLongitudinalAccelerationMassCenter({ longitudinalAccelerationCentreOfGravity: g(x) });
        const lat = (x) => h.CDS2.statusLateralAccelerationMassCenter({ lateralAccelerationCentreOfGravity: g(x) });
        // the app is opened while driving: the sensor's offset (0.3 g here) is still in the readings
        h.Vehicle2.statusCarSpeed2({ speedVehicleCentreOfGravity: 3200 });
        lon(0.9); lat(-0.7);
        ok(v.pk().gAccel === undefined && v.pk().gLat === undefined && v.gZeroed() === false, 'before the car has stood still once: no g peak is taken (the offset would be in it)');
        h.Vehicle2.statusCarSpeed2({ speedVehicleCentreOfGravity: 0 });
        lon(0.3); lat(0.1);
        await clock.advance(1900);
        lon(0.3); lat(0.1); lon(0.3); lat(0.1); lon(0.3); lat(0.1);
        ok(v.gZeroed() === false, 'readings in the first 2 s of a standstill do not count: the car may still be rocking');
        await clock.advance(200);
        lon(0.3); lat(0.1); lon(0.302); lat(0.102);
        ok(v.gZeroed() === false, 'after them, two readings of each axis: not zeroed yet');
        lon(0.298); lat(0.098);
        ok(v.gZeroed() === true, 'the third of each: both axes zeroed (it took 10 of each - 12 s of standstill on a car that sends one a second)');
        ok(car.logs.some((l) => /^info g-force: zeroed at a standstill 2\.1 s long \(offsets: longitudinal 0\.300 g, lateral 0\.100 g\)$/.test(l)), 'logged, with how long the car had stood and the two offsets');
        h.Vehicle2.statusCarSpeed2({ speedVehicleCentreOfGravity: 3200 });
        lon(0.8); lat(-0.9); lon(-0.4);
        near(v.pk().gAccel, 0.5, 0.01, 'peak accel, g, with no frame drawn (0.8 read, 0.3 offset)');
        near(v.pk().gBrake, 0.7, 0.01, 'peak brake, g');
        near(v.pk().gLat, 1.0, 0.01, 'peak lateral, g');
        // the field's end values are not accelerations
        h.CDS2.statusLongitudinalAccelerationMassCenter({ longitudinalAccelerationCentreOfGravity: 0 });       // -6.6 g
        h.CDS2.statusLateralAccelerationMassCenter({ lateralAccelerationCentreOfGravity: 65534 });             // +6.7 g
        ok(v.pk().gBrake < 0.71 && v.pk().gLat < 1.01, 'raw 0 (-6.6 g) and raw 65534 (+6.7 g) raise no peak');
        ok(v.why('gLong') === 'not a real value', 'and are named: "' + v.why('gLong') + '"');
        // the other peaks, also without a frame
        h.CDS.statusEngineSpeed2({ actualValueRPMEngineCrankshaft: 26000 });
        h.FES.statusActualValueTorque2({ actualValueTorqueCrankshaft: 2047 + 2 * 500 });
        boost(h, 100); boost(h, 150);
        h.CDS.statusEngineSpeed2({ actualValueRPMEngineCrankshaft: 8000 });
        h.FES.statusActualValueTorque2({ actualValueTorqueCrankshaft: 2047 + 2 * 100 });
        boost(h, 20);
        near(v.pk().rpm, 6500, 0, 'rpm peak, taken in the data layer');
        near(v.pk().torque, 500, 0, 'torque peak, Nm');
        near(v.pk().boost, 1.5, 1e-9, 'boost peak, bar');
        near(v.pk().power, 500 * 6500 / 9549, 0.01, 'power peak, kW');
        // peak hold and reset
        await clock.advance(14000);
        v.raise('boost', v.data().boost);
        near(v.pk().boost, 1.5, 1e-9, 'boost peak held for 14 s');
        clock.wall(-3600000);                                 // the head unit sets its clock back an hour
        await clock.advance(1500);
        v.raise('boost', v.data().boost);
        near(v.pk().boost, 0.2, 1e-9, 'and dropped back after the 15 s hold, although the wall clock was set back meanwhile');
        v.resetPeaks();
        ok(v.pk().boost === undefined && v.pk().gLat === undefined, 'peaks reset');
    });

    await ok.part('power is not a typed-in maximum (gauges-B4)', async () => {
        const car = makeCar(APP), v = car.vitals(), h = car.handlers;
        await clock.advance(10);
        ok(car.values.powerSource === 'calc', 'as shipped: Power from = Torque x rpm');
        ok(car.values.sportMaxPower === 0, 'as shipped: the sport display\'s 100 % is not set');
        h.CDS.statusEngineSpeed2({ actualValueRPMEngineCrankshaft: 20000 });
        h.FES.statusActualValueTorque2({ actualValueTorqueCrankshaft: 2047 + 2 * 400 });
        h.FES.statusVehicleDynamicEngine({ displaySportEnginePower: 50, displaySportEngineTorque: 50 });
        h.FES.statusVehicleDynamicEngine({ displaySportEnginePower: 100, displaySportEngineTorque: 100 });
        let p = v.power(v.data());
        near(p.kw, 400 * 5000 / 9549, 0.01, 'as shipped, sport display at 100 %: power, kW, is torque x rpm (not 285)');
        ok(p.calc === true, 'and the bar is told so');
        car.settings.set('powerSource', 'sport');
        p = v.power(v.data());
        ok(p.calc === true && Math.abs(p.kw - 400 * 5000 / 9549) < 0.01, '"Sport display" chosen but its 100 % never set: still torque x rpm, no figure from a default');
        car.settings.set('sportMaxPower', 250);
        p = v.power(v.data());
        ok(p.calc === false && p.kw === 250, 'with this car\'s max power entered (250 kW): 100 % = 250 kW');
        h.FES.statusVehicleDynamicEngine({ displaySportEnginePower: 254, displaySportEngineTorque: 254 });
        ok(v.data().powerPct === 100 && v.bad.powerPct === 254, '254 % is not taken (it made 724 kW)');
        // a car that leaves the % at one number
        const car2 = makeCar(APP, { settings: { powerSource: 'sport', sportMaxPower: 250 } }), v2 = car2.vitals();
        await clock.advance(10);
        car2.handlers.CDS.statusEngineSpeed2({ actualValueRPMEngineCrankshaft: 20000 });
        car2.handlers.FES.statusActualValueTorque2({ actualValueTorqueCrankshaft: 2047 + 2 * 400 });
        for (let i = 0; i < 5; i++) car2.handlers.FES.statusVehicleDynamicEngine({ displaySportEnginePower: 0, displaySportEngineTorque: 0 });
        p = v2.power(v2.data());
        ok(p.calc === true && p.kw > 200, 'a sport display stuck at 0 %: torque x rpm takes over (it read 0 kW for good)');
    });

    await ok.part('the sport display\'s boost at the top of its field is no reading (gauges-B8)', async () => {
        const car = makeCar(APP), v = car.vitals(), h = car.handlers;
        await clock.advance(10);
        units(h, 3, 1);
        boost(h, 0); boost(h, 240);
        near(v.data().boost, 24 / PSI, 1e-6, 'raw 240 on a psi car: boost, bar (24.0 psi)');
        ok(v.boostFromDme() === false, 'the engine unit is not asked for boost while the sport display works');
        boost(h, 254);
        ok(v.data().boost == null, 'raw 254, the largest number the field holds: no reading (not 25.4 psi)');
        ok(v.boostFromDme() === true, 'and the engine unit is tried for boost');
        ok(/sport display: at its limit/.test(v.boostWhy()), 'the dial says why: "' + v.boostWhy() + '"');
        boost(h, 253);
        near(v.data().boost, 25.3 / PSI, 1e-6, 'raw 253: a reading again, boost, bar (25.3 psi)');
        ok(v.boostFromDme() === false, 'and the engine unit is left alone again');
        boost(h, 255);
        ok(v.boostFromDme() === true && Math.abs(v.data().boost - 25.3 / PSI) < 1e-6, 'raw 255, the car\'s "no value": the engine unit is asked at once, the last reading is kept for now');
        await clock.advance(10500);
        ok(v.data().boost == null, 'and dropped after 10 s, as every reading the car takes back');
    });

    await ok.part('raw values go to the log, as the notes in app.json say (gauges-B14)', async () => {
        const car = makeCar(APP), h = car.handlers;
        car.vitals();
        await clock.advance(10);
        units(h, 3, 1);
        for (let i = 0; i < 20; i++) boost(h, 100 + i);
        h.CDS.statusEngineTemperature({ temperatureEngineDrive: 138, temperatureEngineOilDrive: 153 });
        h.FES.statusVehicleDynamicEngine({ displaySportEnginePower: 70, displaySportEngineTorque: 85 });
        h.FES.statusActualValueTorque2({ actualValueTorqueCrankshaft: 2947 });
        h.BasicDataSet.basicDataSet({ valueTemperatureTransmissionOil: 120 });
        h.VehicleInformation.statusGearboxDrive({ statusActualGearDrive: 6, statusActualStageDrive: 4, statusModeDrive: 'SPORT' });
        h.VehicleInformation.DataPowerTrain2({ statusGearSelectionDrive: 8 });
        h.MDrive.dataDisplayGearbox({ displayProgramGearbox: 1 });
        tyresP(h, [350, 350, 380, 380]); tyresT(h, [75, 76, 80, 81]);
        h.TPMS.statusTargetTyrePressure({ targetPressureTyreFLH: 350, targetPressureTyreFRH: 350, targetPressureTyreRLH: 380, targetPressureTyreRRH: 380 });
        h.CDS2.statusLongitudinalAccelerationMassCenter({ longitudinalAccelerationCentreOfGravity: 32500 });
        const has = (re) => car.logs.some((l) => re.test(l));
        ['FES boost', 'gearbox oil', 'tyre temperature'].forEach((n) => ok(has(new RegExp('^info raw ' + n + ': ')), 'app.json promises "raw ' + n + '" in the log: it is there'));
        ['engine temperatures', 'sport display \\[power %, torque %\\]', 'torque', 'tyre pressure', 'target tyre pressure', 'gear selection', 'gear programme', 'longitudinal acceleration', 'car units \\[pressure, temperature\\]']
            .forEach((n) => ok(has(new RegExp('^info raw ' + n + ': ')), 'raw ' + n.replace(/\\/g, '')));
        ok(has(/^info gearbox: \{.*statusModeDrive.*\} -> S$/), 'the gearbox status with what the D / S / M letter was read as');
        ok(car.logs.filter((l) => /^info raw FES boost: /.test(l)).length === 12, 'the first 12 different values of a field, not every one (20 came)');
    });

    await ok.part('the head unit sets its clock (forward-only clock in the data layer)', async () => {
        const car = makeCar(APP, { settings: { demo: 'auto' }, available: false }), v = car.vitals();
        await clock.advance(1000);
        clock.wall(3600000);                                  // one second after the start the wall clock jumps an hour ahead
        ok(v.usingDemo() === false, 'Auto: a clock set forward one second after the start does not bring up the demo drive');
        await clock.advance(4500);
        ok(v.usingDemo() === true, 'it comes after 5 real seconds without a car, as before');
        const car2 = makeCar(APP), v2 = car2.vitals();
        await clock.advance(10);
        car2.handlers.CDS.statusEngineTemperature({ temperatureEngineDrive: 138, temperatureEngineOilDrive: 153 });
        car2.handlers.CDS.statusEngineTemperature({ temperatureEngineDrive: 255, temperatureEngineOilDrive: 255 });
        clock.wall(-7200000);                                 // set back two hours
        await clock.advance(10500);
        ok(v2.data().coolant === undefined, 'a clock set back does not keep a reading alive that the car took back 10 s ago');
    });
    ok.done();
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
