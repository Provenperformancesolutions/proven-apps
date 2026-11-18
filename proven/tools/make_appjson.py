"""Build apps/pps_gauges/app.json: Proven Gauges manifest.
Signals, scaling and engine-unit (DME) read definitions are taken unchanged from the kit's
M Vitals app (apps/car_vitals/app.json, MIT), which is the car-tested reference for them."""
import json, sys
kit = sys.argv[1]
src = json.load(open(kit + '/apps/car_vitals/app.json', encoding='utf-8'))
by = {s['key']: s for s in src['settings']}

dme = {k: v for k, v in src['config']['dme'].items() if k in
       ('comment', 'ecu', 'iat', 'hpfp', 'lpfp', 'oil', 'boost', 'baro', 'boostTarget', 'boostActual', 'timing', 'egs')}
dme['comment'] = ('Engine unit (DME, ecu 18 = 0x12) values, read only: UDS 0x22 / OBD service 01. Candidates are tried in '
                  'order; the first plausible one wins. value = raw * factor + offset (bar / deg C / kPa absolute for boost). '
                  'Definitions as in idrive7-apps M Vitals.')

signals = json.loads(json.dumps(src['signals']))
# Proven Gauges shows no xDrive card: MDrive is only used for the S / M programme letter
signals['de.bmw.infotainment.misc.MDrive'] = {'_optional': 'the S / M programme letter next to the gear', 'dataDisplayGearbox': 's'}
signals['de.bmw.infotainment.vehicle.TPMS']['_optional'] = 'the Tyres gauge set'

spec = {
    'id': 'pps_gauges',
    'title': 'Proven Gauges',
    'description': 'BETA, not yet tested on a car. Proven Performance Solutions gauge sets: Street, Track, Boost, Thermal and Tyres. A guide only: check against a gauge you trust',
    'version': '1.0.3',
    'vendor': 'Proven Performance Solutions',
    'loggingId': 'PPG1',
    'iconGlyph': 'gauge',
    'mguHmi': ['ID7', 'ID8'],
    'requires': src.get('requires', {}),
    'signals': signals,
    'screens': [{
        'name': 'MAIN', 'kind': 'canvas', 'title': 'Proven Gauges',
        'buttons': [['BTN_PAGE', 'Next set'], ['BTN_PREV', 'Previous set'], ['BTN_RESET', 'Reset peaks'], ['BTN_SETTINGS', 'Settings']],
    }],
    'settings': [
        {'key': 'page', 'label': 'Start gauge set', 'type': 'choice', 'default': 'street',
         'options': [['street', 'Street'], ['track', 'Track'], ['boost', 'Boost'], ['thermal', 'Thermal'], ['tyres', 'Tyres']]},
        {'key': 'speedUnit', 'label': 'Speed unit', 'type': 'choice', 'default': 'kmh', 'options': [['kmh', 'km/h'], ['mph', 'mph']]},
        {'key': 'tempUnit', 'label': 'Temperature unit', 'type': 'choice', 'default': 'c', 'options': [['c', 'Celsius'], ['f', 'Fahrenheit']]},
        {'key': 'pressUnit', 'label': 'Pressure unit', 'type': 'choice', 'default': 'psi', 'options': [['psi', 'psi'], ['bar', 'bar'], ['kpa', 'kPa']]},
        {'key': 'boostMax', 'label': 'Boost gauge max', 'type': 'choice', 'default': '2.0',
         'options': [['2.0', '30 psi / 2.0 bar'], ['2.5', '40 psi / 2.5 bar'], ['3.0', '45 psi / 3.0 bar'], ['3.5', '50 psi / 3.5 bar']]},
        {'key': 'boostSource', 'label': 'Boost from', 'type': 'choice', 'default': 'auto',
         'options': [['auto', 'Auto (first that works)'], ['fes', 'Sport display'], ['dme', 'Engine unit (OBD)']]},
        {'key': 'powerUnit', 'label': 'Power unit', 'type': 'choice', 'default': 'kw', 'options': [['kw', 'kW'], ['hp', 'hp'], ['ps', 'PS']]},
        {'key': 'torqueUnit', 'label': 'Torque unit', 'type': 'choice', 'default': 'nm', 'options': [['nm', 'Nm'], ['lbft', 'lb-ft']]},
        {'key': 'maxPower', 'label': 'Max power (100% on sport display)', 'type': 'number', 'unit': 'kW', 'default': 285,
         'steps': [100, 120, 135, 140, 150, 160, 170, 185, 190, 200, 215, 230, 240, 250, 260, 275, 285, 300, 320, 340, 353, 375, 390, 405, 420, 450, 460, 480, 500, 530, 550, 600]},
        {'key': 'maxTorque', 'label': 'Torque gauge max', 'type': 'number', 'unit': 'Nm', 'default': 800, 'steps': [400, 500, 600, 700, 800, 900, 1000, 1200]},
        {'key': 'powerSource', 'label': 'Power from', 'type': 'choice', 'default': 'sport', 'options': [['sport', 'Sport display'], ['calc', 'Torque x rpm']]},
        by['engine'], by['redline'], by['rpmScale'],
        {'key': 'shiftAt', 'label': 'Shift lights: shift point', 'type': 'number', 'unit': 'rpm', 'default': 0, 'labels': {'0': 'Auto (300 under redline)'},
         'steps': [0, 4000, 4500, 5000, 5500, 6000, 6200, 6500, 6800, 7000, 7200, 7500, 8000]},
        {'key': 'shiftStyle', 'label': 'Shift light style', 'type': 'choice', 'default': 'gyr',
         'options': [['gyr', 'Green / yellow / red'], ['f1', 'Green / red / blue'], ['mono', 'Theme colour']]},
        {'key': 'oilWarn', 'label': 'Oil temp warning', 'type': 'number', 'unit': '°C', 'default': 125, 'steps': [110, 115, 120, 125, 130, 135]},
        {'key': 'peaks', 'label': 'Show peak markers', 'type': 'bool', 'default': True},
        {'key': 'peakHold', 'label': 'Peak hold', 'type': 'number', 'unit': 's', 'default': 15, 'labels': {'0': 'Until reset'}, 'steps': [0, 5, 10, 15, 30, 60]},
        {'key': 'flipLong', 'label': 'G-force: brake on top', 'type': 'bool', 'default': False},
        {'key': 'engineData', 'label': 'Engine unit data (read only)', 'type': 'choice', 'default': 'auto', 'options': [['auto', 'On'], ['off', 'Off']]},
        {'key': 'branding', 'label': 'Proven logo on the dials', 'type': 'bool', 'default': True},
        {'key': 'splash', 'label': 'Start-up logo', 'type': 'bool', 'default': True},
        by['advanced'],
        {'key': 'theme', 'label': 'Colour theme', 'type': 'choice', 'default': 'proven',
         'options': [['proven', 'Proven'], ['proven_red', 'Proven Red'], ['proven_blue', 'Proven Blue'],
                     ['m_tricolour', 'M Tricolour'], ['m_red', 'M Red'], ['ice', 'Ice White'], ['amber', 'Night Amber']]},
        by['speedRate'], by['layout'], by['renderer'], dict(by['demo'], default='off'),
    ],
    'config': {
        'comment': 'raw -> value * factor + offset. Scaling and engine-unit definitions as in idrive7-apps M Vitals (car-tested there).',
        'scaling': src['config']['scaling'],
        'dme': dme,
    },
}
json.dump(spec, open(kit + '/apps/pps_gauges/app.json', 'w', encoding='utf-8', newline='\n'), indent=1, ensure_ascii=False)
print('written', len(spec['settings']), 'settings,', len(spec['signals']), 'interfaces')
