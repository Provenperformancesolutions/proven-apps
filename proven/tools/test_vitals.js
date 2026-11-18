'use strict';
/**
 * test_vitals.js <built app: dist/pps_gauges> - feeds raw car values into the data layer the way the car's
 * signals arrive and checks what the gauges would show. No car, no SDK: signals.watch is a stand-in that
 * hands the handlers back.
 */
const path = require('path'), fs = require('fs'), os = require('os'), assert = require('assert');
const js = path.join(path.resolve(process.argv[2]), 'source', 'javascript');
const spec = JSON.parse(fs.readFileSync(path.join(js, 'kit', 'app-spec.json'), 'utf8'));
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pps-test-'));
const values = {}; spec.settings.forEach((s) => { values[s.key] = s.default; });
values.demo = 'off';
const handlers = {};
const log = { info() {}, warn(m) { console.log('  warn:', m); }, error(m) { console.log('  error:', m); }, debug() {} };
const ctx = {
    spec, dataDir, log,
    settings: { get: (k) => values[k], onChange() {} },
    signals: {
        watch: (iface, inst, h) => { handlers[iface.split('.').pop()] = h; return Promise.resolve({ iface, available: true, error: null }); },
        proxy: () => Promise.reject(new Error('test: no diagnostic link')), call: () => Promise.reject(new Error('test')),
    },
};
const Engine = require(path.join(js, 'kit', 'engine'));
const Vitals = require(path.join(js, 'vitals'));
const v = new Vitals(ctx, new Engine({ settings: ctx.settings, dataDir, log }));
const near = (a, b, tol, what) => { assert.ok(Math.abs(a - b) <= (tol || 1e-6), what + ': got ' + a + ', expected ' + b); console.log('  ok  ' + what + ' = ' + (Math.round(a * 1000) / 1000)); };

handlers.CDS.statusEngineSpeed2({ actualValueRPMEngineCrankshaft: 12000 });
handlers.CDS.statusEngineTemperature({ temperatureEngineDrive: 138, temperatureEngineOilDrive: 153 });
handlers.Vehicle2.statusCarSpeed2({ speedVehicleCentreOfGravity: 6400 });
handlers.CDS2.statusLongitudinalAccelerationMassCenter({ longitudinalAccelerationCentreOfGravity: 32500 + Math.round(0.5 * 9.80665 / 0.002) });
handlers.CDS2.statusLateralAccelerationMassCenter({ lateralAccelerationCentreOfGravity: 32500 - Math.round(1.0 * 9.80665 / 0.002) });
handlers.FES.statusActualValueTorque2({ actualValueTorqueCrankshaft: 2047 + 2 * 450 });
handlers.FES.statusVehicleDynamicEngine({ displaySportEnginePower: 80, displaySportEngineTorque: 90 });
handlers.FES.statusSwitchDriveDynamicSport2({ displayBoostPressure: 100 });
handlers.FES.statusSwitchDriveDynamicSport2({ displayBoostPressure: 120 });       // boost counts once it has moved
handlers.EnvironmentalInformation.ExteriorTemperature({ temperatureExterior: 136 });
handlers.BasicDataSet.basicDataSet({ valueTemperatureTransmissionOil: 120 });
handlers.BasicDataSet.basicDataSet({ valueTemperatureTransmissionOil: 128 });     // gearbox oil too
handlers.VehicleInformation.statusGearboxDrive({ statusActualGearDrive: 6, statusActualStageDrive: 4 });
handlers.Vehicle.statusNewCurrentUnitsStatusExt({ unitOfMeasurementAirPressure: 3, unitOfMeasurementTemperature: 1 });   // car set to psi, deg C
handlers.TPMS.statusTyrePressure({ actualValuePressureTyreFLH: 350, actualValuePressureTyreFRH: 350, actualValuePressureTyreRLH: 380, actualValuePressureTyreRRH: 65535 });
handlers.TPMS.statusTyreTemperature({ actualValueTemperatureTyreFLH: 75, actualValueTemperatureTyreFRH: 76, actualValueTemperatureTyreRLH: 80, actualValueTemperatureTyreRRH: 65535 });
handlers.CDS.statusEngineTemperature({ temperatureEngineDrive: 255, temperatureEngineOilDrive: 255 });                    // "no value": keeps the last reading

const d = v.data();
console.log('car values -> gauges');
near(d.rpm, 3000, 0, 'engine speed, rpm');
near(d.speed, 100, 0, 'speed, km/h');
near(d.coolant, 90, 0, 'coolant, deg C');
near(d.oil, 105, 0, 'oil, deg C');
near(d.gLong, 0.5, 0.002, 'longitudinal g');
near(d.gLat, -1.0, 0.002, 'lateral g');
near(d.torque, 450, 0, 'torque, Nm');
near(d.powerCalc, 450 * 3000 / 9549, 0.01, 'power from torque x rpm, kW');
near(d.powerPct, 80, 0, 'sport display power, %');
near(d.boost, 1.2, 1e-9, 'boost, bar (0.01 bar steps while the car is set to bar)');
near(d.ambient, 28, 0, 'outside, deg C');
near(d.gearbox, 80, 0, 'gearbox oil, deg C');
near(d.gear, 4, 0, 'gear');
assert.strictEqual(d.stage, 'D'); console.log('  ok  selector = D');
near(d.pFL, 35 / 14.5038, 1e-6, 'tyre FL, bar (35 psi)');
near(d.pRL, 38 / 14.5038, 1e-6, 'tyre RL, bar (38 psi)');
assert.strictEqual(d.pRR, undefined); console.log('  ok  tyre RR "no value" (65535) is left out');
near(d.tFL, 35, 0, 'tyre temperature FL, deg C');
assert.strictEqual(v.usingDemo(), false); console.log('  ok  live data, not demo');
// a car set to psi sends the sport display's boost in 0.1 psi steps (the units arrived above, after the first boost)
handlers.FES.statusSwitchDriveDynamicSport2({ displayBoostPressure: 174 });
near(v.data().boost, 17.4 / 14.5038, 1e-6, 'boost, bar, from 17.4 psi on a car set to psi');
// out-of-range values never reach a gauge
handlers.CDS.statusEngineSpeed2({ actualValueRPMEngineCrankshaft: 65535 });
near(v.data().rpm, 3000, 0, 'rpm after a "no value" (65535)');
// peak hold and reset
v.raise('boost', d.boost); v.raise('boost', 0.2);
near(v.pk().boost, d.boost, 1e-9, 'boost peak held');
v.resetPeaks(); assert.strictEqual(v.pk().boost, undefined); console.log('  ok  peaks reset');
// the diagnostics side: with no link, nothing is asked and the tiles say why
assert.strictEqual(v.dmeWhy('iat'), 'no diagnostic link'); console.log('  ok  engine-unit tiles say "no diagnostic link" without one');
values.engineData = 'off'; assert.strictEqual(v.dmeWhy('iat'), 'engine data off'); console.log('  ok  "Engine unit data: Off" is respected');
console.log('ALL OK');
process.exit(0);
