"""Build apps/pps_drag/app.json: the Proven Drag manifest.

    python3 proven/tools/make_drag_appjson.py .

Proven Drag only READS the car: every field below is asked for with "r" (its getter) and / or "s" (its
notifier), never "w", and no interface lists a method. The one event is the GPS receiver's sentences
(SatellitePositioning.updatePosition).

Vehicle2 (speed) and CDS2 (acceleration) are needed: a head unit without them does not get the app.
Every other interface is "_optional": the kit installs the app on a unit that lacks it, drops single
fields a unit lacks, and the app works without it, with what the "_optional" text names missing.

SINCE 1.0.2 (the first car: the app closed by itself, see proven/CHANGES-drag.md part 11). The manifest
still lists all seven interfaces, so that each can be switched on from the settings, but as shipped the
app only subscribes to the two CORE fields: Vehicle2.statusCarSpeed2 and
CDS2.statusLongitudinalAccelerationMassCenter, both "rs" exactly as the kit's own Drag Timer
(apps/draggy), Proven Gauges and (the speed) Proven Warm-Up ask for them. Every other field is an EXTRA
behind a setting that is off as shipped (the settings "gps", "xWheels", "xPos", "xStudy" below), and is
asked for with "s" only: "r" would make the kit read that field's getter itself each time the car's
service comes up (kit/runtime/signals.js), and five of those getters are read by no other app of this
source. The app's own reads of the speed getter are behind the setting "askCar", off as shipped.
So is what the app does to its own process: as shipped it listens for no signal (SIGTERM, SIGHUP, SIGINT),
as the kit and the working apps listen for none. The setting "xSignals" (off as shipped) makes the record
of starts and stops listen for the three, to say which one ended the app (apps/pps_drag/box.js).

Signal names and scalings are facts gathered from public sources; none has been measured by Proven.
The screen settings (layout, renderer, demo) are the kit's own, taken from its M Vitals app as Proven
Gauges takes them; demo data is off unless somebody switches it on.
"""
import json, sys
kit = sys.argv[1]
src = json.load(open(kit + '/apps/car_vitals/app.json', encoding='utf-8'))
by = {s['key']: s for s in src['settings']}

W = {'workshop': True}
# what every switch of an extra says in its own text: off stops the app using the values at once, the car goes on sending
# them to the app until the app is next started
OFF_NOTE = ' (off takes full effect after a restart)'
# manual speed scale: hundredths of a percent, -4.00 % to +4.00 % in steps of 0.25 %. That is 33 rows: the HMI's
# own settings screen shows a number setting as a list, and the longest list in any app of the kit has 35 rows
# (how the head unit takes a longer one is not known)
QUARTERS = list(range(-400, 401, 25))
assert len(QUARTERS) <= 35
quarter_label = lambda n: ('+' if n > 0 else '-' if n < 0 else '') + '%d.%02d %%' % (abs(n) // 100, abs(n) % 100)

spec = {
    'id': 'pps_drag',
    'title': 'Proven Drag',
    'description': ('BETA, still being tested on cars. Times 0-100 km/h, 60 ft, 1/8 mile and 1/4 mile from the car\'s own speed. '
                    'For closed roads and track days only'),
    'version': '1.0.2',
    'vendor': 'Proven Performance Solutions',
    'loggingId': 'PPD1',
    'iconGlyph': 'flag',
    'mguHmi': ['ID7', 'ID8'],
    'requires': src.get('requires', {}),
    'signals': {
        # the two the app cannot do without
        'de.bmw.infotainment.vehicle.Vehicle2': {
            # CORE. The stability control's centre-of-gravity speed: what every run is timed from. "rs" as in the kit's
            # Drag Timer, Proven Gauges and Proven Warm-Up: the kit reads it once when the car's service comes up (a
            # standing car notifies nothing), after that the car notifies it when it changes
            'statusCarSpeed2': 'rs',
            # EXTRA (setting "xStudy"). Per-wheel travel counters: meaning unknown, raw for study only. "s": no getter read
            'statusWheeltravel': 's', 'statusWheeltravelRear': 's',
        },
        'de.bmw.infotainment.vehicle.CDS2': {
            # CORE. Forward acceleration (with gravity along a slope in it): start slope, the wheelspin estimate. "rs" as
            # in the kit's Drag Timer and Proven Gauges
            'statusLongitudinalAccelerationMassCenter': 'rs',
        },
        'de.bmw.powertrain.Powertrain': {
            # EXTRA (setting "xWheels")
            '_optional': 'the four wheel speeds: wheelspin is then an estimate, and the speed signal is not cross-checked at the launch',
            'ActualValueRPMWheel': 's',
        },
        'de.bmw.infotainment.SatellitePositioning': {
            # EXTRA (setting "gps")
            '_optional': 'the GPS receiver\'s own speed and height: the speed scale then comes from position legs, the height from the raw GPS value',
            '_broadcasts': ['updatePosition'],
        },
        'de.bmw.infotainment.GPSData': {
            '_optional': 'the raw GPS position and height: position legs then use the navigation\'s position, and there is no second source of height',
            # EXTRA (setting "xPos"). "s": no getter read
            'GPSPositionCAN': 's', 'GPSPositionExtendedCAN': 's',
        },
        'de.bmw.infotainment.navigation.positioning.Positioning': {
            '_optional': 'the navigation\'s position: position legs then need the raw GPS position',
            '_instances': 'Main_Instance',
            # EXTRA (setting "xPos"). "s": no getter read
            'currentLocation': 's',
        },
        'de.bmw.chassis.VehicleModel': {
            # EXTRA (setting "xStudy")
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
        # EXTRA, off as shipped: the app listens to the GPS receiver's sentences and learns the speed scale from them. Off:
        # no subscription to SatellitePositioning at all, runs are UNCALIBRATED unless a factor is in the saved file.
        # (every extra: switched ON it is subscribed at once; switched OFF its values are no longer used at once, and
        # the subscription itself ends with the next start of the app, which is what the label says)
        {'key': 'gps', 'label': 'GPS speed scale' + OFF_NOTE, 'type': 'bool', 'default': False},
        # shows the Signals page's "Reset calibration", the speed scale settings and the study switches below
        {'key': 'workshop', 'label': 'Workshop settings', 'type': 'bool', 'default': False},
        # which factor a run uses: the GPS factor (learned with "GPS speed scale" on, or kept in the saved file), none, or a figure
        {'key': 'scale', 'label': 'Speed scale', 'type': 'choice', 'default': 'gps', 'when': W,
         'options': [['gps', 'GPS factor (if one is learned)'], ['off', 'Off (1.000)'], ['manual', 'Manual']]},
        # hundredths of a percent: +125 = the car's speed is multiplied by 1.0125 (the label says which way it goes)
        {'key': 'scaleManual', 'label': 'Manual speed scale (+: the car reads low)', 'type': 'number', 'default': 0, 'steps': QUARTERS,
         'labels': {str(n): quarter_label(n) for n in QUARTERS}, 'when': {'workshop': True, 'scale': 'manual'}},
        # off as shipped: the app reads no getter itself (the kit's own first read of the two core fields stays). On: the
        # speed getter is read on a schedule as in 1.0.1, but never while the screen is hidden and never before every
        # subscription is set up. Takes effect at once both ways
        {'key': 'askCar', 'label': 'Ask the car for values (study)', 'type': 'bool', 'default': False, 'when': W},
        # the other extras, each off as shipped
        {'key': 'xWheels', 'label': 'Wheel speeds, study' + OFF_NOTE, 'type': 'bool', 'default': False, 'when': W},
        {'key': 'xPos', 'label': 'Positions, study' + OFF_NOTE, 'type': 'bool', 'default': False, 'when': W},
        {'key': 'xStudy', 'label': 'Wheel travel, gradient, study' + OFF_NOTE, 'type': 'bool', 'default': False, 'when': W},
        # off as shipped: the app puts no listener on its process for a signal, so SIGTERM, SIGHUP and SIGINT end it at once,
        # as they end Proven Gauges, Proven Warm-Up and 1.0.1, and the record of starts and stops then says NO WORD, as after
        # a kill. On: the record listens for the three and says which one ended the app. The price is in the label, because a
        # setting has no other text: a listener is only called when the app's code next comes round, so while this is on an app
        # that hangs is not ended by such a signal. Takes effect at once both ways (no restart needed)
        {'key': 'xSignals', 'label': 'Note stop signals, study (while on, an app that hangs is not ended by one)', 'type': 'bool', 'default': False, 'when': W},
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
# the kit reads a getter itself only for a field with "r": that is the two core fields and nothing else
getters = sorted(i.split('.')[-1] + '.' + n for i, f in spec['signals'].items() for n, m in f.items() if not n.startswith('_') and 'r' in m)
assert getters == ['CDS2.statusLongitudinalAccelerationMassCenter', 'Vehicle2.statusCarSpeed2'], getters
# every extra and the app's own reads are off as shipped (an unexpected exit wipes the settings: the defaults are the safe set)
by_key = {s['key']: s for s in spec['settings']}
for key in ('gps', 'askCar', 'xWheels', 'xPos', 'xStudy', 'xSignals'):
    assert by_key[key]['type'] == 'bool' and by_key[key]['default'] is False, key

json.dump(spec, open(kit + '/apps/pps_drag/app.json', 'w', encoding='utf-8', newline='\n'), indent=1, ensure_ascii=False)
print('written', len(spec['settings']), 'settings,', len(spec['signals']), 'interfaces (' + str(len(optional)) + ' optional); requires', spec['requires'])
