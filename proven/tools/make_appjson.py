"""Build apps/pps_gauges/app.json: Proven Gauges manifest.
Signals, scaling and engine-unit (DME) read definitions are taken from the kit's M Vitals app
(apps/car_vitals/app.json, MIT), which is the car-tested reference for them. What Proven changed or
added to them is listed in PROVEN below and is NOT car-tested: the ethanol identifiers (from the kit's
Live Data catalogue and the OBD standard), the diesel rail ceiling, the ceilings of four boost
definitions, the gearbox unit's time-out and one more sport-display field that is only logged."""
import json, sys
kit = sys.argv[1]
src = json.load(open(kit + '/apps/car_vitals/app.json', encoding='utf-8'))
by = {s['key']: s for s in src['settings']}

dme = {k: v for k, v in src['config']['dme'].items() if k in
       ('comment', 'ecu', 'iat', 'hpfp', 'lpfp', 'oil', 'boost', 'baro', 'boostTarget', 'boostActual', 'timing', 'egs')}
dme['comment'] = ('Engine unit (DME, ecu 18 = 0x12) values. Everything listed here is read only: UDS 0x22 / OBD service 01 '
                  '(the ethanol choice "MHD flex" is not in this list and not read only: mhdflex.js). Candidates are tried in '
                  'order; the first plausible one wins. value = raw * factor + offset (bar / deg C / kPa absolute for boost). '
                  'Definitions as in idrive7-apps M Vitals, except: hpfp "maxDiesel" (the ceiling used with a diesel engine), '
                  'the "max" of boost F40B / OBD 0B and of boostTarget 4AB0 / boostActual 580B (one step under the largest '
                  'number the field can hold: a value sitting on that ceiling is no reading, and the next candidate is tried), '
                  '"timeoutMs" on egs, and ethanol. None of these changes has been on a car.')

# ---- PROVEN: what differs from M Vitals (see the docstring) ----
dme = json.loads(json.dumps(dme))
scaling = json.loads(json.dumps(src['config']['scaling']))
# the sport display's boost is one byte with 255 = no value: 254 is where the field stops, not a reading
scaling['boost']['ceiling'] = 254
scaling['boost']['note'] += "; 'ceiling': the largest number the field holds - a value on it is shown as no reading, so the engine unit is tried"
for c in dme['hpfp']:
    # common-rail diesel: far above the 500 bar that fits a petrol engine (rejected there as before)
    c['maxDiesel'] = 2700
def top(key, ident, limit, why):
    for c in dme[key]:
        if c.get('did') == ident or c.get('obd') == ident:
            c['max'] = limit
            c['note'] += why
top('boost', 'F40B', 254, '; 255 is the top of the byte, not a reading')
top('boost', '0B', 254, '; 255 is the top of the byte, not a reading')
top('boostTarget', '4AB0', 255.995, '; raw 65535 (2560 hPa) is the top of the field, not a reading')
top('boostActual', '580B', 255.995, '; raw 65535 (2560 hPa) is the top of the field, not a reading')
for c in dme['egs']:
    # as the kit's own gearbox reader (apps/warmup/gearbox.js): a gearbox unit that is not there is not waited for 4 s
    c['timeoutMs'] = 1500
PCT = 100 / 255
ETH = {'bytes': 1, 'at': 0, 'factor': PCT, 'offset': 0, 'min': 0, 'max': 90, 'timeoutMs': 2500}
dme['ethanol'] = {
    'comment': ('Ethanol content of the fuel, setting "Ethanol reading" (off as shipped). One source per car, chosen by the '
                'workshop: "550d" = BMW\'s own value PROZENT_ALK_KRST (kit Live Data catalogue DME8FF_R), "obd52" = OBD '
                'service 01 PID 52, else the same PID over UDS (22 F452). One byte, value = raw * 100 / 255 %. Raw 255 and '
                'anything above "max" count as no reading. NOT car-tested: nobody has recorded what an engine unit with an '
                'MHD or Motiv ReFlex flex-fuel set-up answers here, and a stock engine unit may answer a constant such as 0. '
                'The first raw replies go to the log ("raw ethanol ..."). The third choice of the setting, "MHD flex", '
                'is not in this list: it reads what an MHD flex-fuel tune keeps in the engine unit, with requests that '
                'are fixed in mhdflex.js and that are not all reads (see that file). Also not car-tested by Proven.'),
    '550d': [dict(ETH, did='550D', note='BMW engine unit: Prozent Alkohol im Kraftstoff (alcohol in the fuel)')],
    'obd52': [dict(ETH, obd='52', note='OBD service 01 PID 0x52, ethanol fuel %'),
              dict(ETH, did='F452', note='the same PID over UDS 0x22')],
}

signals = json.loads(json.dumps(src['signals']))
# Proven Gauges shows no xDrive card: MDrive is only used for the S / M programme letter
signals['de.bmw.infotainment.misc.MDrive'] = {'_optional': 'the S / M programme letter next to the gear', 'dataDisplayGearbox': 's'}
signals['de.bmw.infotainment.vehicle.TPMS']['_optional'] = 'the Tyres gauge set'
# only written to the log ("raw sport display maximum"): whether the car can supply its own 100 % for the sport display's power
signals['de.bmw.infotainment.drivingexcitement.FES']['statusVehicleDynamicEngineMaxValue'] = 'rs'
W = {'workshop': True}
POWERS = [100, 120, 135, 140, 150, 160, 170, 185, 190, 200, 215, 230, 240, 250, 260, 275, 285, 300, 320, 340, 353, 375, 390, 405, 420, 450, 460, 480, 500, 530, 550, 600]

spec = {
    'id': 'pps_gauges',
    'title': 'Proven Gauges',
    'description': 'Proven Performance Solutions gauge sets: Street, Track, Boost, Thermal and Tyres. A guide only: check against a gauge you trust',
    'version': '1.1.2',
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
        # the power bar's scale only (it was also the sport display's 100 % up to 1.0.3)
        {'key': 'maxPower', 'label': 'Power gauge max', 'type': 'number', 'unit': 'kW', 'default': 300, 'steps': POWERS + [700, 800]},
        {'key': 'maxTorque', 'label': 'Torque gauge max', 'type': 'number', 'unit': 'Nm', 'default': 800, 'steps': [400, 500, 600, 700, 800, 900, 1000, 1200]},
        # Power is worked out from the car's own torque and engine speed unless somebody chose the sport display AND said
        # what 100 % is on this car: no figure built on a typed-in maximum nobody set ("reset": cars that saved 'sport', the
        # default up to 1.0.3, go back to torque x rpm once)
        {'key': 'powerSource', 'label': 'Power from', 'type': 'choice', 'default': 'calc', 'reset': 1,
         'options': [['calc', 'Torque x rpm'], ['sport', 'Sport display % x max power']]},
        {'key': 'sportMaxPower', 'label': 'Max power (100% on sport display)', 'type': 'number', 'unit': 'kW', 'default': 0,
         'labels': {'0': 'Not set'}, 'steps': [0] + POWERS, 'when': {'powerSource': 'sport'}},
        by['engine'], by['redline'], by['rpmScale'],
        {'key': 'shiftAt', 'label': 'Shift lights: shift point', 'type': 'number', 'unit': 'rpm', 'default': 0, 'labels': {'0': 'Auto (300 under redline)'},
         'steps': [0, 4000, 4500, 5000, 5500, 6000, 6200, 6500, 6800, 7000, 7200, 7500, 8000]},
        {'key': 'shiftStyle', 'label': 'Shift light style', 'type': 'choice', 'default': 'gyr',
         'options': [['gyr', 'Green / yellow / red'], ['f1', 'Green / red / blue'], ['mono', 'Theme colour']]},
        {'key': 'oilWarn', 'label': 'Oil temp warning', 'type': 'number', 'unit': '°C', 'default': 125, 'steps': [110, 115, 120, 125, 130, 135]},
        {'key': 'peaks', 'label': 'Show peak markers', 'type': 'bool', 'default': True},
        {'key': 'peakHold', 'label': 'Peak hold', 'type': 'number', 'unit': 's', 'default': 15, 'labels': {'0': 'Until reset'}, 'steps': [0, 5, 10, 15, 30, 60]},
        {'key': 'flipLong', 'label': 'G-force: brake on top', 'type': 'bool', 'default': False},
        # (not "read only" in the label any more: with the ethanol choice MHD flex, this switch being On is what lets its
        # three non-read requests go)
        {'key': 'engineData', 'label': 'Engine unit data', 'type': 'choice', 'default': 'auto', 'options': [['auto', 'On'], ['off', 'Off']]},
        {'key': 'workshop', 'label': 'Workshop settings', 'type': 'bool', 'default': False},
        # off as shipped: the workshop switches it on for a car once the read-out has matched the tuner's own app
        {'key': 'ethanol', 'label': 'Ethanol reading', 'type': 'choice', 'default': 'off', 'when': W,
         # 'mhd' is the one choice that is not read only (apps/pps_gauges/mhdflex.js): its requests are fixed in that
         # file, not listed in config.dme.ethanol
         'options': [['off', 'Off'], ['550d', 'Engine unit value (550D)'], ['obd52', 'OBD value (PID 52)'],
                     ['mhd', 'MHD flex (not read only)']]},
        {'key': 'branding', 'label': 'Proven logo on the dials', 'type': 'bool', 'default': True},
        {'key': 'splash', 'label': 'Start-up logo', 'type': 'bool', 'default': True},
        by['advanced'],
        {'key': 'theme', 'label': 'Colour theme', 'type': 'choice', 'default': 'proven',
         'options': [['proven', 'Proven'], ['proven_red', 'Proven Red'], ['proven_blue', 'Proven Blue'],
                     ['m_tricolour', 'M Tricolour'], ['m_red', 'M Red'], ['ice', 'Ice White'], ['amber', 'Night Amber']]},
        by['speedRate'], by['layout'], by['renderer'], dict(by['demo'], default='off'),
    ],
    'config': {
        'comment': ('raw -> value * factor + offset. Scaling and engine-unit definitions as in idrive7-apps M Vitals (car-tested there), '
                    'except what the dme comment and the boost note name, which is Proven\'s and not car-tested.'),
        'scaling': scaling,
        'dme': dme,
    },
}
json.dump(spec, open(kit + '/apps/pps_gauges/app.json', 'w', encoding='utf-8', newline='\n'), indent=1, ensure_ascii=False)
print('written', len(spec['settings']), 'settings,', len(spec['signals']), 'interfaces')
