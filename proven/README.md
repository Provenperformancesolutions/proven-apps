# Proven apps for iDrive 7 and iDrive 8

Two apps for BMW MGU head units (iDrive 7 and iDrive 8) by Proven Performance Solutions, built on the
open-source idrive7-apps kit:

- **Proven Gauges** 1.0.3 (`apps/pps_gauges`): five gauge sets
- **Proven Warm-Up** 1.2.1 (`apps/pps_warmup`): tells the driver to keep below 4,000 rpm until engine oil,
  gearbox oil and coolant are up to temperature, with Proven's temperatures built in

> **BETA. Neither app has run on a car yet.** Everything below was checked on a PC only: see
> "What has and has not been tested". The apps only read values the car already has. They are a guide
> for a quick glance and do not replace the car's own instruments and warnings. Compare every reading
> with a tool you trust before relying on it. Proven's own code is provided as is, without warranty of
> any kind: you install and use it at your own risk.

## Add them to your car

You need a BMW with an iDrive 7 (MGU) or iDrive 8 head unit and the
[MGU Store](https://github.com/robertnisipeanu/mgu-store).

1. In the Store: **Settings**, **Add source**, type **`Provenperformancesolutions/proven-apps`**.
   No token and no sign-in are needed. The source should show 2 components.
2. Install **Proven Gauges** and **Proven Warm-Up**.

The GPU renderer and the controller gate the apps need come from the Store's built-in
`cauliflowermossgrape/idrive7-apps` source, so that source must still be on the car.

## What changed

**Warm-Up 1.2.1 and Gauges 1.0.3 (18 Nov 2026)**

- The Store descriptions say BETA.
- **Gauges' demo data is off as shipped**, as Warm-Up's already was. A car that gives no values shows
  no readings, never an invented drive. Demo data can be switched on in Settings for a showroom or a
  bench, and the screen then shows a DEMO tag.

**Warm-Up 1.2.0 and Gauges 1.0.2**

Found by code reviews before the first car, and fixed:

- **Warm-Up never calls the car ready without an engine oil and a coolant reading.** Before, a fluid with no
  reading for 90 seconds was left out, so a car that gave no oil temperature was called "Up to temperature"
  on coolant alone. Now only the gearbox can be left out, and only if it never gave a reading or its last
  reading was in range (not cold, not too hot). A car that gives no oil temperature shows "Warming up",
  "NO READING" for engine oil and the rev advice for good; a car that gives no temperature at all shows
  "No temperature data", with the rev advice while the engine runs.
- **The "UP TO TEMPERATURE" announcement is only shown while it is true and new**: within 15 seconds of the
  car coming up to temperature, with the screen open, and not again within 10 minutes. It is no longer
  shown late when the screen is next opened, over "Too hot", on a hot restart whose gearbox answer arrived
  late, or again after the gearbox reading dropped out for a moment.
- **Warm-Up: a temperature the car marks as "no value" is dropped after 10 seconds** instead of being shown
  as live for good. A reading that simply stops arriving, with no "no value" from the car, is still kept as
  before: the car only sends a temperature when it changes, so silence looks the same as a steady reading.
- **Warm-Up's demo data is off as shipped.** A car that gives no values shows "No temperature data", never
  an invented warm-up. When the demo is switched on, the home-screen widget says DEMO as the screen does.
- **Gauges' Thermal line** no longer says "Oil and coolant in the working range" from one reading: without
  an oil temperature it reads "No oil temperature", and otherwise names what was measured.
- Smaller: the timers the apps start themselves are guarded, so an unexpected error is logged instead of
  stopping the app; Gauges' start-up logo is timed on a clock that only moves forward, so it cannot
  return when the head unit sets its clock.

# Proven Gauges

One app, five gauge sets, each a tab:

| Set | What is on it |
|---|---|
| **Street** | Tach dial with redline band and peak tell-tale, 12 shift lights, speed and gear, power and torque bars with peak hold, boost dial, oil / coolant / intake temperatures |
| **Track** | 16 shift lights across the screen, rev bar with shift and redline marks, speed and gear, oil and coolant with 5-minute traces, friction circle with trail and session peak g (lateral, accel, brake) |
| **Boost** | Boost dial with the engine unit's target as a white marker and a peak tell-tale, 60-second boost trace against target, peak / target / error readouts, intake air, ignition timing, fuel rail and fuel feed pressure |
| **Thermal** | Warm-up status line (Cold / Warming up / Up to temperature / Hot / No oil temperature), coolant, engine oil, gearbox, intake air and outside temperature with 5-minute traces and min / max |
| **Tyres** | Each tyre's pressure against the car's own target and its temperature, plus the pressure gained since the start of the drive |

Branding: the Proven logo is on the dial faces and on a start-up screen, the app tile uses it, and the
default "Proven" colour theme is the logo's white, light blue, dark blue and red. "Proven Red" and
"Proven Blue" are plainer alternatives; the kit's four stock themes are still selectable.

Settings (in the app's Settings tab): start set, km/h or mph, °C or °F, psi / bar / kPa, boost gauge
range, boost source, kW / hp / PS, Nm / lb-ft, the car's max power, torque gauge range, petrol / diesel,
redline, rev scale, shift point, shift light style, oil warning temperature, peak markers and hold time,
g-force orientation, engine unit data on / off, logo on the dials, start-up logo, theme, demo data.

## How it reads the car

- Most values arrive on their own as the car's signals (nothing is asked): rpm, speed, coolant, oil,
  acceleration, sport-display boost and power, torque, gear, gearbox oil, outside temperature, tyres.
- Intake air, fuel pressures, ignition timing and boost target are read from the engine unit through the
  head unit's diagnostic gateway. The app uses the kit's read-only link, which lets nothing but
  read requests (UDS 0x22, OBD 0x01 / 0x09) leave the head unit. They are only read while the app is on
  screen or the engine is running, and "Engine unit data: Off" stops them altogether.
- Signal names, scaling and the engine-unit identifiers are the kit's M Vitals definitions, unchanged.
  An engine that refuses an identifier shows "not on this car" on that tile; one that does not answer
  shows "no reading".
- Peak values: the tell-tales and "PEAK" figures follow the Peak hold setting; the g-force peaks and the
  tyre "start" pressures hold until Reset peaks.
- A value the car stops sending, or marks as "no value", stays on the Gauges screen at its last
  reading, as in the kit's M Vitals. Gauges does not mark it as old.

The Gauges app's Thermal status line uses its own fixed thresholds, which are **not** the Warm-Up presets
below: oil under 60 °C is Cold, from 85 °C Up to temperature, and Hot from the oil warning setting
(125 °C as shipped) or 112 °C coolant. Warm-Up calls engine oil up to temperature from 80 °C and too hot
from 115 °C. So on a car with both apps the two can disagree: at 82 °C oil (with coolant and
gearbox also up to temperature), Warm-Up reads "Up to temperature" while Gauges still reads "Warming up". Proven Warm-Up is the one that carries Proven's
numbers. The Gauges line is decided by the oil temperature: without one it reads "No oil temperature" and
shows the coolant, and it never reads "Up to temperature" on coolant alone.

# Proven Warm-Up

## What the driver sees

- **Three horizontal gauges**: engine oil, gearbox oil, coolant. Each is a row of slanted segments that
  light up to the temperature, with a white stroke at the value. They are blue until the fluid is up to
  temperature, green in the safe range and red when it is too hot. The two limits are marked and numbered
  under each bar ("80°C", "115°C"), the unlit part of the bar shows the three zones faintly, and each row has
  the fluid's state on the left (Ready in about 3 min, Ready, Too hot) and its temperature on the right.
- **Beside them, the full Proven logo** (PROVEN / PERFORMANCE / SOLUTIONS), and under it:
  while warming up, "Keep below 4,000 rpm" with a small bar of the live revs against that limit and the
  time to ready; a green tick once the car is up to temperature; a red warning when something is too hot.
- **The status line** while the car is cold reads "Warming up: Keep below 4,000 rpm until warm", then what
  it is waiting for and the minutes left. Rev past 4,000 rpm before it is warm and the line, the limit and
  the rev bar turn red: "Ease off: 5,287 rpm on a cold engine, keep below 4,000 rpm until warm".
  After that it reads Up to temperature (green), Too hot (red) or Engine off.
- **An announcement.** When the last of the three comes into range, "UP TO TEMPERATURE" covers the app's
  screen for six seconds with a green tick and the full logo. It is made once per warm-up, and not on a
  hot restart. It is shown only if the app's screen is open within 15 seconds of the car coming up to
  temperature, at most once in 10 minutes, and it is taken off at once if the car stops being ready: it
  is never shown late. A warm-up that finishes within 10 minutes of the last announcement is therefore
  not announced; the status line and the green tick still show it.
- **Gauge style** (Settings): Horizontal bars is what a fresh install shows; Round dials is the earlier
  look with three dials, and can be chosen per car.
- **A home-screen widget, on iDrive 7 only.** The same three temperatures and the status on the iDrive home
  screen. Whether it fills after a head-unit restart before the app has been opened is not tested yet:
  see "Not tested". The kit builds home-screen widgets for iDrive 7 only, so an iDrive 8 car
  (the curved display) does not get one.

Where the logo is: the full logo on the horizontal screen and the announcement. The round dials, the widget
and the app tile carry its first line (PROVEN) only, because the full logo would be too small to read there.
The "Proven logo" switch in Settings takes it off the screen.

## The presets

Built into the app. Every install starts with these, with nothing to set on the car:

| | Up to temperature from | Too hot from |
|---|---|---|
| Engine oil | 80 °C | 115 °C |
| Gearbox (transmission) oil | 60 °C | 100 °C |
| Coolant | 80 °C | 115 °C |

Until all three are up to temperature the driver is told to **keep below 4,000 rpm**.

They can be changed on a car in the app's Settings, under Workshop settings.

## How it decides

- A fluid is ready from its "safe from" temperature and stays ready until it drops 3 °C below it, so the
  display does not flicker at the threshold.
- A fluid is too hot from its "too hot" temperature and stays too hot until it drops 3 °C below that, for
  the same reason (oil that reached 115 °C reads Too hot until it is back under 112 °C).
- The rev limit applies while the car is warming up. Once everything is up to temperature it is not shown.
- The car is called ready only when engine oil and coolant each have a reading and are ready, and the
  gearbox is ready or left out. Without an engine oil or a coolant reading the car is never called ready.
- Only the gearbox can be left out, after 90 seconds of engine running with no reading, and only if it
  never gave a reading or its last reading was in range (not too hot). Once the car is ready the status
  line says so ("gearbox oil not monitored"). A gearbox that was last read below its "safe from", or too
  hot, and then gives no reading keeps the car on "Warming up", with NO READING for the gearbox, until a
  reading returns. Set Gearbox oil temperature to Not monitored for a car without a sensor, or whose
  reading comes and goes, and it is left out from the start.
- A temperature the car marks as "no value" is kept for 10 seconds and then dropped, and the app waits
  for it again. This also ends a "Too hot" for that fluid: the app then shows NO READING and waits for it.
  A reading that simply stops arriving is kept.
- With no temperature at all the status line reads "No temperature data", with "Keep below 4,000 rpm"
  while the engine runs. That advice is on the app's status line only, not on the widget, and revving
  past the limit is not flagged in that state.
- "Ready in about N min" is measured from how fast each fluid is actually warming.

## Where the readings come from

- Engine oil, coolant and rpm are the car's own signals, which arrive without anything being asked.
- Gearbox oil uses the kit's reader unchanged: the gearbox unit through the head unit's read-only
  diagnostic link (the identifier the kit read on a ZF 8HP), else the car's own signal once it has moved.
  It is asked while the last engine speed the car sent is 400 rpm or more and the car is not yet up
  to temperature. On a car that never is (no engine oil or coolant reading, or a gearbox read cold that
  then gives no reading) that is every 5 seconds for the whole drive, with the app closed too.
  After the car is warm it is asked every few seconds
  while the screen or the widget is showing. With both closed its last answer is kept for about 20
  seconds and then asked for again, and for those few seconds the app counts the car as warming; this is
  only seen if the screen is opened at that moment.
- Demo data is off as shipped (Settings, Demo data: Never). With it off, a car that gives no values shows
  "No temperature data". Switched to Always, or on Auto while the car gives nothing, the app shows an
  invented warm-up, and the screen and the widget both say DEMO.
- The app starts with the head unit, so the warm-up is followed with the app closed.

## Where the messages appear

The messages appear on the app's own screen (and, on iDrive 7, on the home-screen widget). **Nothing pops up
over CarPlay, navigation or another app**, so a driver who is not on the Warm-Up screen does not see them.

# How this source is set up

The apps are written for the open-source **idrive7-apps kit**
(https://github.com/cauliflowermossgrape/idrive7-apps, MIT), as of 16 Nov 2026 (commit 422957a). This
repository is a copy of that kit with the two Proven apps added. The kit's own README, at the top level of
this repository, is the reference for building apps.

- `mgu-repo.json` lists the two apps by name under `"components"`, so the Store offers only those two.
  The kit's other apps are here as source and are not offered from this source.
- The head unit builds each app from source against the app SDK it already has, so BMW's app SDK is not
  in this repository.
- Not in this copy of the kit: its screenshots and animations (`docs/media`, `docs/screens`), its
  `.github` folder, and the fault-text database for its Fault Scanner with the full translation files
  and the import tool made for it. Built from this copy, the kit's Fault Scanner has no fault texts, and
  its Russian and Chinese builds fail.

## Look at them on a PC (no car, no SDK)

Needs Python 3 and Node.js 14 or newer.

```
python3 kit/tools/build.py --preview-only pps_gauges
node kit/tools/preview.js dist/pps_gauges preview-gauges render wait=9 render --set page=street
node proven/tools/test_vitals.js dist/pps_gauges

python3 kit/tools/build.py --preview-only pps_warmup
node kit/tools/preview.js dist/pps_warmup preview-warmup wait=8 render wait=45 render
node proven/tools/test_warmup.js dist/pps_warmup
```

`preview.js` writes PNGs of what the app draws from its demo drive (it switches demo data on). Gauges
shows its start-up logo first, so the early pictures are the logo and the last one is the gauge set;
`page` can be street, track, boost, thermal or tyres. Warm-Up's demo is a whole warm-up from cold in
about 50 seconds. The kit's live emulator (`node kit/tools/emu.js pps_gauges`, kit README section 6.4)
shows it moving, but it runs the full build, which needs BMW's app SDK from your own head unit (kit
README section 3.1).

# What has and has not been tested

Tested on a PC:

- every gauge set drawn by the kit's software renderer and by the kit's live emulator, which runs the
  car's own draw engine (the full-screen layout at 1920 x 720, tabs, Settings, Reset peaks on the page)
- the kit's build step produced both the iDrive 7 and the iDrive 8 screen description from `app.json`
- the data layer with raw values as the car sends them (`test_vitals.js`, 25 checks): rpm, speed,
  temperatures, g, torque, power, boost in a bar car and in a psi car, tyres, "no value" markers
- other units (bar, kPa, °F, mph, hp), a second boost range, the three Proven themes, the no-data state
- Warm-Up: the decision with 88 checks (`test_warmup.js`): cold start to ready, the 3 °C holds, one
  announcement only, hot restart, over-rev, too hot, no gearbox reading, engine off, the presets as
  shipped (80 / 60 / 80 °C, 4,000 rpm, too hot from 115 / 100 / 115 °C), no engine oil or coolant
  reading, a reading that is lost, a gearbox read cold or too hot that then gives no reading, the
  announcement withdrawn when it is no longer true, a late gearbox answer on a hot restart, "no value"
  from the car, and demo data off as shipped.
  During review the decision was also put through about three million random sequences of readings
  (1.4 billion readings), each also fed to 1.1.0 for comparison and checked against the rules above, and
  through 13 end-to-end scenarios (source.js, the gearbox reader and warm.js together). The one rule that
  did not hold, a gearbox last read too hot being left out, was then fixed, and the random runs were
  repeated on the final code at a smaller scale (14 million readings) without a wrong "ready" or
  announcement. The one case they still report is a gearbox "safe from" being raised in Workshop settings
  while the gearbox gives no reading: its last reading is then still judged against the number in force
  when it was read. Those scripts are not in this repository.
- On 18 Nov 2026 both apps were built with the kit's build step and both test files were run under
  Node.js 24 (88 and 25 checks, all passed); before that they had been run with macOS's JavaScriptCore
  and stand-ins for Node's modules. The same day the five Gauges sets, a Warm-Up from cold to "Up to
  temperature" in the horizontal style, the round dial style and the widget's picture were drawn with
  the kit's `preview.js` without an error.
- Warm-Up: every state drawn in the horizontal style (warming, ease off, announcement, ready, too hot,
  gearbox not monitored, °F, limits set close together and at the end of the scale, logo off) and the
  round dial style; the horizontal screen and Settings in the kit's live emulator, which runs the car's
  own draw engine; the widget's picture
- both apps placed with the kit's iDrive 8 screen figures (app area 2880 x 764 above the climate bar)
  without errors. The kit itself marks those figures "not measured on a car yet"

Not tested:

- **on a car, or on a head unit of any kind.** Compare every reading with a tool you trust (the dealer
  tool, a logger) before relying on it.
- **the screen changes in 1.2.0 and 1.0.2 on a head unit.** During review the DEMO mark on the widget, the
  "not monitored" words on the announcement, the line under NO READING, the rev advice on "No temperature
  data" and the new Thermal status lines in Gauges were drawn on a PC with the kit's software drawing
  code, and fitted their places. They have not been through the GPU renderer or a car, and the
  18 Nov 2026 `preview.js` run did not bring up each of them. The small widget's text lines are drawn by
  the head unit itself and have not been seen at all: "Warm-Up DEMO", "no gearbox temp" and the
  temperature line are to be checked on the first iDrive 7 car.
- **the rules in main.js are not covered by `test_warmup.js` or `test_vitals.js`**: when the announcement
  is on the screen (15 seconds, taken off when no longer ready, once in 10 minutes), the guarded timers,
  the widget's lines, and Gauges' Thermal line and start-up logo timing. They were run by hand during
  review, not by a test that ships here.
- what a car sends when it stops giving a temperature: "no value", which Warm-Up drops after 10 seconds, or
  nothing at all, in which case the last reading stays on the screen. Also whether the engine speed falls
  to 0 before it stops arriving: if its last value stays at 400 rpm or more, Warm-Up goes on asking the
  gearbox unit about every 30 seconds until the head unit shuts down.
- **the home-screen widget after a head-unit restart, without opening the app.** Warm-Up is the only app
  that both starts with the head unit and has a widget, and the widget is drawn by the part of the app that
  runs when it has screens. If the widget stays empty until the app is opened, the app needs a change (and
  one in the kit) before the widget can be promised "without opening the app".
- whether each car gives an engine oil temperature on the signal Warm-Up reads. Where it gives none,
  Warm-Up stays on "Warming up" (see "What changed").
- iDrive 8 beyond the build step and the placement figures above. Proven Warm-Up uses the kit's gearbox
  reader, unchanged, but has not itself been on an iDrive 8 screen.
- the MGU Store building the apps from this source.
- the Warm-Up widget on a real iDrive 7 home screen. It uses the same BMW widget layout as the kit's eDrive
  widget.
- the gearbox oil reading on any given car. Use Not monitored where a car gives none.

# Licence and credits

- The Proven Performance Solutions name and logo, and Proven's own code in `apps/pps_gauges`,
  `apps/pps_warmup` and `proven/`, are not under the kit's MIT licence: see the `NOTICE` file in each
  app folder. The same terms apply to the files in `proven/`.
- The idrive7-apps kit and its apps: MIT, by cauliflowermossgrape and contributors (`LICENSE` at the top
  level), except the GPU renderer in `kit/renderd` and the emulator's draw engine in `kit/emu`
  (GPL-3.0-or-later) and the Doom app with `third_party/doomgeneric` (GPL-2.0): see "Doom and renderer
  licences" in the kit's README. Fonts keep their own licences in their folders.

Unofficial software, not affiliated with, endorsed by or supported by BMW AG. Gauges are for a quick
glance: set them up parked, and keep eyes on the road.
