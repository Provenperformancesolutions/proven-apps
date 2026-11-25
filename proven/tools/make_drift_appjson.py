"""Build apps/pps_drift/app.json: the Proven Drift manifest.

    python3 proven/tools/make_drift_appjson.py .

Proven Drift only READS the car: every field below is asked for with "r" (its getter) and / or "s" (its
notifier), never "w", and no interface lists a method. The one event is the GPS receiver's sentences
(SatellitePositioning.updatePosition). Of BMW's own drift analyser (MDrive) only the two result fields are
asked for; controlDisplayDrift is not in this manifest, so the app cannot even reach it.

Vehicle2 (speed) and CDS2 (yaw rate and the two accelerations) are needed: a head unit without them does
not get the app. Every other interface is "_optional": the kit installs the app on a unit that lacks it,
drops single fields a unit lacks, and the app works without it, with what the "_optional" text names
missing. Those texts are the ones apps/pps_drift/car.js logs.

"r" is asked for only where the interface catalogue of one head unit (an M8 on iDrive 7) lists a getter for
the field. The interface, field and member names are from that catalogue; no scaling of the yaw rate, the
steering, the pedal or the wheels is known, and none is written here: the app learns them
(apps/pps_drift/learn.js). Speed and acceleration scaling as in the idrive7-apps kit. None of it has been
measured by Proven.
The screen settings (layout, renderer, demo) are the kit's own, taken from its M Vitals app as the other
Proven apps take them; demo data is off unless somebody switches it on.
"""
import json, sys
kit = sys.argv[1]
src = json.load(open(kit + '/apps/car_vitals/app.json', encoding='utf-8'))
by = {s['key']: s for s in src['settings']}

W = {'workshop': True}
# "Other" chassis: the wheelbase in centimetres, 2.30 m to 3.30 m in steps of 5 cm. That is 21 rows: the HMI's own
# settings screen shows a number setting as a list, and the longest list in any app of the kit has 35 rows
WHEELBASES = list(range(230, 331, 5))
assert len(WHEELBASES) <= 35
# the two resets: a setting each, No / Confirm / Reset now (apps/pps_drift/main.js says how they act)
RESET = [['no', 'No'], ['arm', 'Confirm: choose Reset now'], ['go', 'Reset now']]

spec = {
    'id': 'pps_drift',
    'title': 'Proven Drift',
    'description': ('BETA, not yet tested on a car. Scores drifts by angle, speed and length and keeps the data of each drift, '
                    'from the car\'s own motion sensors. For closed circuits and skid pans only'),
    'version': '1.0.0',
    'vendor': 'Proven Performance Solutions',
    'loggingId': 'PPF1',
    'iconGlyph': 'gforce',
    'mguHmi': ['ID7', 'ID8'],
    'requires': src.get('requires', {}),
    'signals': {
        # the two the app cannot do without
        'de.bmw.infotainment.vehicle.Vehicle2': {
            # the car's speed (notified AND read)
            'statusCarSpeed2': 'rs',
        },
        'de.bmw.infotainment.vehicle.CDS2': {
            # sideways and forward acceleration, and the yaw rate: what the drift angle is worked out from
            'statusLateralAccelerationMassCenter': 'rs',
            'statusLongitudinalAccelerationMassCenter': 'rs',
            'statusYawVelocityVehicle': 'rs',
        },
        'de.bmw.chassis.SpeedAcceleration': {
            '_optional': 'no second source of the yaw rate',
            'YawSpeedVehicle': 's',
        },
        'de.bmw.chassis.SteeringAngle': {
            '_optional': 'the steering check and the opposite lock then need the steering from XView',
            'SteeringAngleFrontAxleEffective': 's', 'ActualSteeringAngleDriver': 's',
        },
        'de.bmw.infotainment.drivingexcitement.XView': {
            '_optional': 'no second source of the steering',
            'statusFrontAxleSteeringAngle': 'rs', 'statusSteeringAngleDriver': 'rs',
        },
        'de.bmw.powertrain.AcceleratorPedal': {
            '_optional': 'no accelerator pedal bar and no average pedal',
            'AngleAcceleratorPedal': 's',
        },
        'de.bmw.powertrain.Powertrain': {
            '_optional': 'no rear wheelspin, and learning cannot check that the rear wheels grip',
            'ActualValueRPMWheel': 's',
        },
        'de.bmw.infotainment.vehicle.CDS': {
            '_optional': 'the handbrake is not known',
            'statusHandBrake': 'rs',
        },
        'de.bmw.infotainment.drivingexcitement.FES': {
            '_optional': 'the DSC button state is not shown',
            # read for information only: the app does nothing with DSC
            'statusDSCSwitchHMI': 'rs',
        },
        'de.bmw.chassis.DrivingVector': {
            '_optional': 'the car\'s own motion estimate is not shown (study only)',
            'ActualVectorVehicleMove': 's', 'VehicleDynamicDataEstimatedVerified': 's',
        },
        'de.bmw.infotainment.misc.MDrive': {
            '_optional': 'BMW\'s own drift analyser is not shown (study only)',
            'statusDriftLast': 'rs', 'statusDriftBest': 'rs',
        },
        'de.bmw.infotainment.SatellitePositioning': {
            '_optional': 'no GPS speed to check the car\'s speed against',
            '_broadcasts': ['updatePosition'],
        },
    },
    'screens': [{
        'name': 'MAIN', 'kind': 'canvas', 'title': 'Proven Drift',
        # the kit's page buttons and Settings: nothing on the pages needs a button
        'buttons': [['BTN_PAGE', 'Next page'], ['BTN_PREV', 'Previous page'], ['BTN_SETTINGS', 'Settings']],
    }],
    'settings': [
        {'key': 'speedUnit', 'label': 'Speed unit', 'type': 'choice', 'default': 'kmh', 'options': [['kmh', 'km/h'], ['mph', 'mph']]},
        # the angle at which a drift starts; it ends under 0.6 of it (apps/pps_drift/session.js)
        {'key': 'startAngle', 'label': 'A drift starts at', 'type': 'choice', 'default': '10',
         'options': [['8', '8 degrees'], ['10', '10 degrees'], ['12', '12 degrees'], ['15', '15 degrees'], ['20', '20 degrees']]},
        {'key': 'minSpeed', 'label': 'Slowest speed that counts', 'type': 'choice', 'default': '20',
         'options': [['15', '15 km/h (9 mph)'], ['20', '20 km/h (12 mph)'], ['30', '30 km/h (19 mph)'], ['40', '40 km/h (25 mph)']]},
        # wheelbase (and weight split) for the steering check: apps/pps_drift/session.js, CHASSIS
        {'key': 'chassis', 'label': 'Chassis', 'type': 'choice', 'default': 'g20',
         'options': [['g20', '3 / 4 Series, M3, M4 (G2x, G8x): 2.85 m'], ['g42', '2 Series Coupe, M2 (G42, G87): 2.74 m'],
                     ['g30', '5 Series, M5 (G30, F90): 2.98 m'], ['g14', '8 Series, M8, two doors: 2.82 m'],
                     ['g29', 'Z4 (G29): 2.47 m'], ['other', 'Other: set the wheelbase']]},
        {'key': 'wheelbase', 'label': 'Wheelbase', 'type': 'number', 'default': 285, 'steps': WHEELBASES,
         'labels': {str(n): '%d.%02d m' % (n // 100, n % 100) for n in WHEELBASES}, 'when': {'chassis': 'other'}},
        # shows the settings below
        {'key': 'workshop', 'label': 'Workshop settings', 'type': 'bool', 'default': False},
        {'key': 'yawSource', 'label': 'Yaw rate from', 'type': 'choice', 'default': 'auto', 'when': W,
         'options': [['auto', 'Auto'], ['cds2', 'CDS2'], ['chassis', 'Chassis (SpeedAcceleration)']]},
        {'key': 'steerSource', 'label': 'Steering from', 'type': 'choice', 'default': 'auto', 'when': W,
         'options': [['auto', 'Auto'], ['front', 'Front wheels, chassis'], ['xfront', 'Front wheels, XView'],
                     ['driver', 'Steering wheel, chassis'], ['xdriver', 'Steering wheel, XView']]},
        {'key': 'useSteer', 'label': 'Steering check', 'type': 'bool', 'default': True, 'when': W},
        # for a car whose forward acceleration turns out to be worked out from its speed (apps/pps_drift/angle.js)
        {'key': 'useLong', 'label': 'Forward acceleration', 'type': 'choice', 'default': 'use', 'when': W,
         'options': [['use', 'Use'], ['off', 'Leave out']]},
        {'key': 'resetLearned', 'label': 'Reset what was learned', 'type': 'choice', 'default': 'no', 'when': W, 'options': RESET},
        {'key': 'resetBest', 'label': 'Reset bests', 'type': 'choice', 'default': 'no', 'when': W, 'options': RESET},
        {'key': 'theme', 'label': 'Colour theme', 'type': 'choice', 'default': 'proven',
         'options': [['proven', 'Proven'], ['proven_red', 'Proven Red'], ['proven_blue', 'Proven Blue'],
                     ['m_tricolour', 'M Tricolour'], ['m_red', 'M Red'], ['ice', 'Ice White'], ['amber', 'Night Amber']]},
        # demo data is off unless somebody switches it on: a car that gives no data shows no invented drift, and
        # demo drifts are never saved (PC previews are not affected: the kit's PC stand-in turns the demo on)
        by['layout'], by['renderer'], dict(by['demo'], default='off'),
    ],
    'config': {
        'comment': ('raw -> value * factor + offset; "invalid" = the car\'s "no value". Speed and acceleration scaling as in the '
                    'idrive7-apps kit. The yaw rate, the steering, the pedal and the wheels have no scaling here: the app learns '
                    'them (apps/pps_drift/learn.js). None of it has been measured by Proven.'),
        'scaling': {
            'speed': {'factor': 0.015625, 'offset': 0, 'invalid': 65535, 'unit': 'km/h', 'member': 'speedVehicleCentreOfGravity'},
            'lat': {'factor': 0.002, 'offset': -65, 'invalid': 65535, 'unit': 'm/s2', 'member': 'lateralAccelerationCentreOfGravity'},
            'long': {'factor': 0.002, 'offset': -65, 'invalid': 65535, 'unit': 'm/s2', 'member': 'longitudinalAccelerationCentreOfGravity'},
        },
    },
}
# read only: no field is asked for with "w", no interface lists a method
for iface, fields in spec['signals'].items():
    assert '_methods' not in fields, iface + ': Proven Drift calls no methods'
    for name, mode in fields.items():
        assert name.startswith('_') or (set(mode) <= set('rs') and mode), iface + '.' + name + ': read (r) and subscribe (s) only'
assert set(k for k in spec['signals']['de.bmw.infotainment.misc.MDrive'] if not k.startswith('_')) == {'statusDriftLast', 'statusDriftBest'}
optional = [i for i, f in spec['signals'].items() if f.get('_optional')]
assert set(spec['signals']) - set(optional) == {'de.bmw.infotainment.vehicle.Vehicle2', 'de.bmw.infotainment.vehicle.CDS2'}
assert not [b for b in spec['screens'][0]['buttons'] if b[0] == 'BTN_ACTION'], 'nothing on the pages needs a button'

json.dump(spec, open(kit + '/apps/pps_drift/app.json', 'w', encoding='utf-8', newline='\n'), indent=1, ensure_ascii=False)
print('written', len(spec['settings']), 'settings,', len(spec['signals']), 'interfaces (' + str(len(optional)) + ' optional); requires', spec['requires'])
