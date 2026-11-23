"""Build apps/pps_drag/app.json: the Proven Drag manifest.

    python3 proven/tools/make_drag_appjson.py .

Proven Drag only READS the car: every field below is asked for with "r" (its getter) and / or "s" (its
notifier), never "w", and no interface lists a method. The one event is the GPS receiver's sentences
(SatellitePositioning.updatePosition).

Vehicle2 (speed) and CDS2 (acceleration) are needed: a head unit without them does not get the app.
Every other interface is "_optional": the kit installs the app on a unit that lacks it, drops single
fields a unit lacks, and the app works without it, with what the "_optional" text names missing.

Signal names and scalings are facts gathered from public sources; none has been measured by Proven.
The screen settings (layout, renderer, demo) are the kit's own, taken from its M Vitals app as Proven
Gauges takes them; demo data is off unless somebody switches it on.
"""
import json, sys
kit = sys.argv[1]
src = json.load(open(kit + '/apps/car_vitals/app.json', encoding='utf-8'))
by = {s['key']: s for s in src['settings']}

W = {'workshop': True}
# manual speed scale: hundredths of a percent, -4.00 % to +4.00 % in steps of 0.25 %. That is 33 rows: the HMI's
# own settings screen shows a number setting as a list, and the longest list in any app of the kit has 35 rows
# (how the head unit takes a longer one is not known)
QUARTERS = list(range(-400, 401, 25))
assert len(QUARTERS) <= 35
quarter_label = lambda n: ('+' if n > 0 else '-' if n < 0 else '') + '%d.%02d %%' % (abs(n) // 100, abs(n) % 100)

spec = {
    'id': 'pps_drag',
    'title': 'Proven Drag',
    'description': ('BETA, not yet tested on a car. Times 0-100 km/h, 60 ft, 1/8 mile and 1/4 mile from the car\'s own speed, '
                    'wheel and GPS data. For closed roads and track days only'),
    'version': '1.0.0',
    'vendor': 'Proven Performance Solutions',
    'loggingId': 'PPD1',
    'iconGlyph': 'flag',
    'mguHmi': ['ID7', 'ID8'],
    'requires': src.get('requires', {}),
    'signals': {
        # the two the app cannot do without
        'de.bmw.infotainment.vehicle.Vehicle2': {
            # the stability control's centre-of-gravity speed: what every run is timed from (notified AND read)
            'statusCarSpeed2': 'rs',
            # per-wheel travel counters: meaning unknown, recorded raw for study only (Signals page and log)
            'statusWheeltravel': 'rs', 'statusWheeltravelRear': 'rs',
        },
        'de.bmw.infotainment.vehicle.CDS2': {
            # forward acceleration (with gravity along a slope in it): start slope, the wheelspin estimate
            'statusLongitudinalAccelerationMassCenter': 'rs',
        },
        'de.bmw.powertrain.Powertrain': {
            '_optional': 'the four wheel speeds: wheelspin is then an estimate, and the speed signal is not cross-checked at the launch',
            'ActualValueRPMWheel': 's',
        },
        'de.bmw.infotainment.SatellitePositioning': {
            '_optional': 'the GPS receiver\'s own speed and height: the speed scale then comes from position legs, the height from the raw GPS value',
            '_broadcasts': ['updatePosition'],
        },
        'de.bmw.infotainment.GPSData': {
            '_optional': 'the raw GPS position and height: position legs then use the navigation\'s position, and there is no second source of height',
            'GPSPositionCAN': 'rs', 'GPSPositionExtendedCAN': 'rs',
        },
        'de.bmw.infotainment.navigation.positioning.Positioning': {
            '_optional': 'the navigation\'s position: position legs then need the raw GPS position',
            '_instances': 'Main_Instance',
            'currentLocation': 'rs',
        },
        'de.bmw.chassis.VehicleModel': {
            '_optional': 'the car\'s own road gradient on the Signals page (shown for study only, never used in a result)',
            'LaneSlope': 's',
        },
    },
    'screens': [{
        'name': 'MAIN', 'kind': 'canvas', 'title': 'Proven Drag',
        # the buttons the kit's Drag Timer has
        'buttons': [['BTN_ACTION', 'Reset run'], ['BTN_PAGE', 'Next page'], ['BTN_PREV', 'Previous page'], ['BTN_SETTINGS', 'Settings']],
    }],
    'settings': [
        {'key': 'speedUnit', 'label': 'Speed unit', 'type': 'choice', 'default': 'kmh', 'options': [['kmh', 'km/h'], ['mph', 'mph']]},
        # where each clock starts (apps/pps_drag/run.js): the default is what a drag strip's timeslip and the
        # usual 0-100 figure mean
        {'key': 'start', 'label': 'Clock starts', 'type': 'choice', 'default': 'slip',
         'options': [['slip', 'Slip: speed split from first movement, distances after 1 ft'],
                     ['standstill', 'Everything from first movement'],
                     ['rollout', 'Everything after the first foot']]},
        # a run that starts steeper downhill than this is flagged DOWNHILL START and sets no best time
        {'key': 'slopeLimit', 'label': 'Downhill start limit', 'type': 'choice', 'default': '1',
         'options': [['1', '1 %'], ['2', '2 %'], ['off', 'Off']]},
        # shows the Signals page's "Reset calibration" and the speed scale settings below
        {'key': 'workshop', 'label': 'Workshop settings', 'type': 'bool', 'default': False},
        {'key': 'scale', 'label': 'Speed scale', 'type': 'choice', 'default': 'gps', 'when': W,
         'options': [['gps', 'GPS (calibrates while driving)'], ['off', 'Off (1.000)'], ['manual', 'Manual']]},
        # hundredths of a percent: +125 = the car's speed is multiplied by 1.0125 (the label says which way it goes)
        {'key': 'scaleManual', 'label': 'Manual speed scale (+: the car reads low)', 'type': 'number', 'default': 0, 'steps': QUARTERS,
         'labels': {str(n): quarter_label(n) for n in QUARTERS}, 'when': {'workshop': True, 'scale': 'manual'}},
        {'key': 'theme', 'label': 'Colour theme', 'type': 'choice', 'default': 'proven',
         'options': [['proven', 'Proven'], ['proven_red', 'Proven Red'], ['proven_blue', 'Proven Blue'],
                     ['m_tricolour', 'M Tricolour'], ['m_red', 'M Red'], ['ice', 'Ice White'], ['amber', 'Night Amber']]},
        # demo data is off unless somebody switches it on: a car that gives no speed shows no invented run, and
        # demo runs are never saved (PC previews are not affected: the kit's PC stand-in turns the demo on)
        by['layout'], by['renderer'], dict(by['demo'], default='off'),
    ],
    'config': {
        'comment': ('raw -> value * factor + offset; "invalid" = the car\'s "no value". Speed and acceleration scaling as in the '
                    'idrive7-apps kit. The rest is in the modules that read it (apps/pps_drag/gpsscale.js, wheels.js, slope.js). '
                    'None of it has been measured by Proven.'),
        'scaling': {
            'speed': {'factor': 0.015625, 'offset': 0, 'invalid': 65535, 'unit': 'km/h', 'member': 'speedVehicleCentreOfGravity'},
            'accel': {'factor': 0.002, 'offset': -65, 'invalid': 65535, 'unit': 'm/s2', 'member': 'longitudinalAccelerationCentreOfGravity'},
        },
    },
}
# read only: no field is asked for with "w", no interface lists a method
for iface, fields in spec['signals'].items():
    assert '_methods' not in fields, iface + ': Proven Drag calls no methods'
    for name, mode in fields.items():
        assert name.startswith('_') or (set(mode) <= set('rs') and mode), iface + '.' + name + ': read (r) and subscribe (s) only'
optional = [i for i, f in spec['signals'].items() if f.get('_optional')]
assert set(spec['signals']) - set(optional) == {'de.bmw.infotainment.vehicle.Vehicle2', 'de.bmw.infotainment.vehicle.CDS2'}

json.dump(spec, open(kit + '/apps/pps_drag/app.json', 'w', encoding='utf-8', newline='\n'), indent=1, ensure_ascii=False)
print('written', len(spec['settings']), 'settings,', len(spec['signals']), 'interfaces (' + str(len(optional)) + ' optional); requires', spec['requires'])
