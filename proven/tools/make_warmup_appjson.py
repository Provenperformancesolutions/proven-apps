"""Build apps/pps_warmup/app.json: the Proven Warm-Up manifest.

Proven's presets: the numbers a fresh install starts with are in DEFAULTS below. On a car they are changed
in Settings > Workshop settings.

The widget block and the shared screen settings are taken from the kit's own apps (eDrive, M Vitals), which
are the car-tested references for them.
"""
import json, sys
kit = sys.argv[1]

DEFAULTS = {            # deg C, rpm
    # Proven Performance Solutions presets: the car is up to temperature from these, and until then
    # the driver is told to keep below the rev limit
    'readyOil': 80,         # engine oil
    'readyGearbox': 60,     # gearbox (transmission) oil
    'readyCoolant': 80,     # coolant
    'coldLimit': 4000,      # rpm until warm
    # too hot above these
    'hotOil': 115,          # engine oil
    'hotGearbox': 100,      # gearbox (transmission) oil
    'hotCoolant': 115,      # coolant
}
# A car where any setting was ever changed has saved ALL its values, these presets among them, and keeps
# them across updates. To make a changed preset reach those cars too, raise its number here by one: the
# kit then puts that setting back to the new default once on every car (a value set by hand in Workshop
# settings on that car is replaced as well, so re-check those cars).
RESET = {
    'readyOil': 1, 'readyGearbox': 1, 'readyCoolant': 1, 'coldLimit': 1,
    'hotOil': 1, 'hotGearbox': 1, 'hotCoolant': 1,
}
assert set(RESET) == set(DEFAULTS), 'RESET needs one number for each preset in DEFAULTS'

vitals = json.load(open(kit + '/apps/car_vitals/app.json', encoding='utf-8'))
edrive = json.load(open(kit + '/apps/edrive/app.json', encoding='utf-8'))
warmup = json.load(open(kit + '/apps/warmup/app.json', encoding='utf-8'))
by = {s['key']: s for s in vitals['settings']}
widget = {k: v for k, v in edrive['startWidget'].items() if k != 'comment'}
widget['name'] = 'Proven Warm-Up'
W = {'workshop': True}
temp = lambda key, label, lo, hi: {'key': key, 'label': label, 'type': 'number', 'unit': '°C', 'default': DEFAULTS[key],
                                    'reset': RESET[key], 'steps': list(range(lo, hi + 1, 5)), 'when': W}
spec = {
    'id': 'pps_warmup',
    'title': 'Proven Warm-Up',
    'description': 'BETA, not yet tested on a car. Shows when engine oil, gearbox oil and coolant reach the warm-up temperatures set by Proven Performance Solutions. A guide only: it does not replace the car\'s own warnings',
    'version': '1.2.1',
    'vendor': 'Proven Performance Solutions',
    'loggingId': 'PPW1',
    'iconGlyph': 'temp',
    'autostart': True,
    'mguHmi': ['ID7', 'ID8'],
    'requires': warmup.get('requires', {}),
    'signals': {
        'de.bmw.infotainment.vehicle.CDS': {'statusEngineSpeed2': 'rs', 'statusEngineTemperature': 'rs'},
        'de.bmw.infotainment.vehicle.Vehicle2': {'statusCarSpeed2': 'rs'},
        'de.bmw.infrastructure.analytics.BasicDataSet': warmup['signals']['de.bmw.infrastructure.analytics.BasicDataSet'],
        'com.harman.infotainment.systemfunctions.tasu.tasu.InternalTasu': warmup['signals']['com.harman.infotainment.systemfunctions.tasu.tasu.InternalTasu'],
    },
    'screens': [{'name': 'MAIN', 'kind': 'canvas', 'title': 'Proven Warm-Up', 'buttons': [['BTN_SETTINGS', 'Settings']]}],
    'startWidget': widget,
    'settings': [
        {'key': 'gaugeStyle', 'label': 'Gauge style', 'type': 'choice', 'default': 'bars', 'options': [['bars', 'Horizontal bars'], ['dials', 'Round dials']]},
        {'key': 'tempUnit', 'label': 'Temperature unit', 'type': 'choice', 'default': 'c', 'options': [['c', 'Celsius'], ['f', 'Fahrenheit']]},
        {'key': 'announce', 'label': 'Announce when up to temperature', 'type': 'bool', 'default': True},
        {'key': 'branding', 'label': 'Proven logo', 'type': 'bool', 'default': True},
        {'key': 'workshop', 'label': 'Workshop settings', 'type': 'bool', 'default': False},
        temp('readyOil', 'Engine oil: safe from', 60, 110),
        temp('hotOil', 'Engine oil: too hot above', 110, 150),
        {'key': 'gearboxSource', 'label': 'Gearbox oil temperature', 'type': 'choice', 'default': 'auto', 'when': W,
         'options': [['auto', 'Auto (gearbox unit, else car signal)'], ['signal', 'Car signal only'], ['none', 'Not monitored (no sensor)']]},
        temp('readyGearbox', 'Gearbox oil: safe from', 40, 90),
        temp('hotGearbox', 'Gearbox oil: too hot above', 100, 140),
        temp('readyCoolant', 'Coolant: safe from', 60, 100),
        temp('hotCoolant', 'Coolant: too hot above', 100, 125),
        {'key': 'coldLimit', 'label': 'Rev limit until warm', 'type': 'number', 'unit': 'rpm', 'default': DEFAULTS['coldLimit'], 'reset': RESET['coldLimit'], 'labels': {'0': 'None'},
         'steps': [0, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 5500], 'when': W},
        {'key': 'theme', 'label': 'Colour theme', 'type': 'choice', 'default': 'proven',
         'options': [['proven', 'Proven'], ['proven_red', 'Proven Red'], ['proven_blue', 'Proven Blue'],
                     ['m_tricolour', 'M Tricolour'], ['m_red', 'M Red'], ['ice', 'Ice White'], ['amber', 'Night Amber']]},
        # demo data is off unless the workshop switches it on: a car that gives no values shows "No temperature
        # data", never an invented warm-up (PC previews are not affected: the kit's PC stand-in turns the demo on)
        by['layout'], by['renderer'], dict(by['demo'], default='off'),
    ],
}
json.dump(spec, open(kit + '/apps/pps_warmup/app.json', 'w', encoding='utf-8', newline='\n'), indent=1, ensure_ascii=False)
print('written', len(spec['settings']), 'settings; widget', widget['layout'], widget['size'], '; requires', spec['requires'])
