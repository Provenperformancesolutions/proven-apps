# Proven apps for iDrive 7 and iDrive 8

Two apps for BMW MGU head units (iDrive 7 and iDrive 8) by Proven Performance Solutions, built on the
open-source idrive7-apps kit:

- **Proven Gauges** 1.1.0 (`apps/pps_gauges`): five gauge sets
- **Proven Warm-Up** 1.3.0 (`apps/pps_warmup`): tells the driver to keep below 4,000 rpm until engine oil,
  gearbox oil and coolant are up to temperature, with Proven's temperatures built in

> **BETA. Neither app has run on a car yet.** Everything below was checked on a PC only: see
> "What has and has not been tested". As shipped, the apps only read values the car already has.
> There is one exception, and it is switched off until a workshop chooses it: the "MHD flex" ethanol
> reading in Gauges sends three requests to the engine unit that are not reads (see "The ethanol
> read-out"). The apps are a guide for a quick glance and do not replace the car's own instruments and
> warnings. Compare every reading with a tool you trust before relying on it. Proven's own code is
> provided as is, without warranty of any kind: you install and use it at your own risk.

## Add them to your car

You need a BMW with an iDrive 7 (MGU) or iDrive 8 head unit and the
[MGU Store](https://github.com/robertnisipeanu/mgu-store).

1. In the Store: **Settings**, **Add source**, type **`Provenperformancesolutions/proven-apps`**.
   No token and no sign-in are needed. The source should show 2 components.
2. Install **Proven Gauges** and **Proven Warm-Up**.

The GPU renderer and the controller gate the apps need come from the Store's built-in
`cauliflowermossgrape/idrive7-apps` source, so that source must still be on the car.

## What changed

**Warm-Up 1.3.0 and Gauges 1.1.0 (18 Nov 2026)**

A second review traced every screen of both apps from the car's signal to the pixel, before the first
car. What it found is fixed here. The full account, fault by fault, with what was left and a list of
what to look at on the first car, is in [CHANGES-warmup.md](CHANGES-warmup.md) and
[CHANGES-gauges.md](CHANGES-gauges.md).

Warm-Up 1.3.0:

- **After switch-off the gearbox unit is left alone.** An engine speed the car stops giving (it sends "no
  value", or nothing at all for 10 seconds) is now an engine that is not running: the screen reads
  "Engine off" and nothing more is asked. Where the head unit has it, the app also reads the car's own
  "locked and left" state and asks nothing while the car is parked with nobody in it. Before, a car whose
  last engine speed stayed at 400 rpm or more was asked about every 30 seconds until the head unit shut
  down.
- **Start-stop traffic no longer brings "Warming up" back.** A gearbox that was left out stays left out
  across engine stops. A gearbox reading that has aged out counts on its last value for the rest of the
  engine run while that value was in range, and the screen says "on its last reading" and shows "--",
  not the old number.
- **Once the app has watched the car come up to temperature, a small dip does not undo it.** A fluid up
  to 15 °C under its "safe from" is then shown as dipped on its own row; "Warming up", the rev advice and
  "Ease off" do not come back for it. A fluid more than 15 °C under is cold and they do. A car that is
  only found warm (the app or the engine has just started) has to stay in range for two minutes of
  running first.
- **The time to ready** is never shown as more than "over 60 min", in every place, and not at all until
  a minute has been measured with the engine running.
- **"Ease off"** prints the revs that raised it, and is raised only when a fluid is actually read below
  its "safe from". It says "on a cold engine" when engine oil or coolant is, and "before the car is up to
  temperature" when only the gearbox is behind.
- **The gearbox reader is harder to knock out.** One refusal from the gearbox unit, which may be the
  answer to another app's request, no longer ends the gearbox reading; a unit that refused is asked again
  every 5 minutes; a reading's age is timed on a clock the head unit cannot set back; a start-up that
  fails is tried again after 5, 15 and 60 seconds.
- **The gearbox is left out on evidence**: only when the gearbox unit refuses, does not answer or never
  answers with a reading, and the car's own signal gives nothing, after 90 seconds of engine running, and
  only if it never gave a reading. The 90 seconds no longer have to be in one piece.
- Engine oil and coolant values outside a plausible range (-40 to 170 °C and -40 to 160 °C) are treated
  as "no value".
- Widget: progress is measured from the start of the warm-up; the "Proven logo" switch applies to it; the
  big widget shows °C or °F; the small widget's lines are 20 characters or fewer.

Gauges 1.1.0:

- A reading the car marks as "no value", or sends outside its plausible range, is dropped after 10
  seconds and the gauge shows "--" with the reason. A tyre pressure out of range shows "--" and "out of
  range" at once. A reading that simply stops arriving is still kept, because the car only sends a value
  when it changes.
- A control unit that does not answer no longer freezes the other values. After three unanswered
  requests the app leaves that unit alone and asks it again after 30 seconds, then less and less often,
  up to every 10 minutes, and once when the engine is started; its tiles say "not answering". The engine
  unit and the gearbox unit are handled apart.
- "Against target" on the Boost set is now the engine unit's own actual boost less its own target, read
  together, and is blank when that pair is older than 2.5 seconds. It used to compare the sport display's
  boost with a target up to 15 seconds old.
- Power is shown as torque x rpm as shipped, and the bar says "Power est.". The sport display's
  percentage can be chosen in Settings, but only shows a figure once "Max power (100% on sport display)"
  has been set for that car. "Power gauge max" sets the bar's scale.
- On a car set to psi, boost and tyre values wait until the car has said which units it uses. If it never
  says, the unit is told by the size of the tyre pressures and the screen says that it is a guess.
- Peaks are taken all the time the app runs, not only while its screen is shown. The three g peaks count
  after the first stop at which the app could zero the g sensor.
- A gear the app has to estimate is shown as the number alone with "EST.", without a "D".
- "Peak, 60 s" on the Boost set is now "Chart max". Reset peaks does not reset it.
- The Tyres set says what "Start" is: the first reading after the app was opened, or after Reset peaks.
  It is not the start of the drive.
- A diesel's fuel rail pressure is shown (up to 2700 bar).
- The demo drive's values no longer stay in the traces after the car's own values take over.
- The app writes the first raw values of each signal and the first replies of the engine unit and the
  gearbox unit to its log, so readings can be checked against the car.
- **New, and off as shipped: an ethanol read-out on the Boost set**, for the workshop to switch on per
  car. It is unproven on every car. One of its three choices, "MHD flex (not read only)", is the one
  thing in either app that is not read only. See "The ethanol read-out".

**Warm-Up 1.2.1 and Gauges 1.0.3 (18 Nov 2026)**

- The Store descriptions say BETA.
- **Gauges' demo data is off as shipped**, as Warm-Up's already was. A car that gives no values shows
  no readings, never an invented drive. Demo data can be switched on in Settings for a showroom or a
  bench, and the screen then shows a DEMO tag.

**Warm-Up 1.2.0 and Gauges 1.0.2**

Found by code reviews before the first car, and fixed:

- **Warm-Up never calls the car ready without an engine oil and a coolant reading.** A car that gives no
  oil temperature shows "Warming up", "NO READING" for engine oil and the rev advice for good; a car that
  gives no temperature at all shows "No temperature data", with the rev advice while the engine runs.
- **The "UP TO TEMPERATURE" announcement is only shown while it is true and new**: within 15 seconds of the
  car coming up to temperature, with the screen open, and not again within 10 minutes.
- **Warm-Up: a temperature the car marks as "no value" is dropped after 10 seconds** instead of being shown
  as live for good.
- **Warm-Up's demo data is off as shipped.** When the demo is switched on, the home-screen widget says
  DEMO as the screen does.
- **Gauges' Thermal line** no longer says "Oil and coolant in the working range" from one reading: without
  an oil temperature it reads "No oil temperature", and otherwise names what was measured.
- Smaller: the timers the apps start themselves are guarded, so an unexpected error is logged instead of
  stopping the app; Gauges' start-up logo is timed on a clock that only moves forward.

# Proven Gauges

One app, five gauge sets, each a tab:

| Set | What is on it |
|---|---|
| **Street** | Tach dial with redline band and peak tell-tale, 12 shift lights, speed and gear, power and torque bars with peak hold, boost dial, oil / coolant / intake temperatures |
| **Track** | 16 shift lights across the screen, rev bar with shift and redline marks, speed and gear, oil and coolant with 5-minute traces, friction circle with trail and session peak g (lateral, accel, brake) |
| **Boost** | Boost dial with the engine unit's target as a white marker and a peak tell-tale, 60-second boost trace against target, chart max / target / against target readouts, intake air, ignition timing, fuel rail and fuel feed pressure, and the ethanol read-out when it is switched on |
| **Thermal** | Warm-up status line (Cold / Warming up / Up to temperature / Hot / No oil temperature), coolant, engine oil, gearbox, intake air and outside temperature with 5-minute traces and min / max |
| **Tyres** | Each tyre's pressure against the car's own target and its temperature, plus the pressure gained since the app was opened |

Branding: the Proven logo is on the dial faces and on a start-up screen, the app tile uses it, and the
default "Proven" colour theme is the logo's white, light blue, dark blue and red. "Proven Red" and
"Proven Blue" are plainer alternatives; the kit's four stock themes are still selectable.

Settings (in the app's Settings tab): start set, km/h or mph, °C or °F, psi / bar / kPa, boost gauge
range, boost source, kW / hp / PS, Nm / lb-ft, power gauge range, power source and the sport display's
max power, torque gauge range, petrol / diesel, redline, rev scale, shift point, shift light style, oil
warning temperature, peak markers and hold time, g-force orientation, engine unit data on / off,
workshop settings (ethanol reading), logo on the dials, start-up logo, theme, demo data.

## How it reads the car

- Most values arrive on their own as the car's signals (nothing is asked): rpm, speed, coolant, oil,
  acceleration, sport-display boost and power, torque, gear, gearbox oil, outside temperature, tyres.
- Intake air, fuel pressures, ignition timing, boost target and actual boost are read from the engine
  unit through the head unit's diagnostic gateway. The app uses the kit's read-only link, which lets
  nothing but read requests (UDS 0x22, OBD 0x01 / 0x09) leave the head unit. They are only read while the
  app is on screen or the engine is running, and "Engine unit data: Off" stops them altogether. The one
  exception to "read only" is the MHD flex ethanol choice, which is off as shipped: see below.
- Signal names, scaling and the engine-unit identifiers are the kit's M Vitals definitions, with these
  changes of Proven's, none of them tested on a car: a diesel's rail pressure is accepted up to 2700 bar;
  a boost value sitting exactly on the largest number its field can hold counts as no reading; the
  gearbox unit is waited for 1.5 seconds instead of 4; and the ethanol identifiers are added.
- A value the car marks as "no value" is kept for 10 seconds and then dropped. A value that simply stops
  arriving stays at its last reading: the car only sends a value when it changes, so silence is also what
  a steady reading looks like. Values read from the engine unit or the gearbox unit are dropped 15
  seconds after the unit's last answer.
- A unit that does not answer three requests in a row is left alone and asked again after 30 seconds,
  then 1, 2, 5 and 10 minutes, and once when the engine is started. The app takes the first engine speed
  above 400 rpm after a stop as an engine start.
- Power is torque x rpm, both the car's own figures; the torque is the engine unit's own calculation,
  not a measurement. Engine oil temperature is the car's own signal; the engine unit's is used only when
  the car gives none.
- On a car that does not tell the app its units, the pressure unit is taken from the size of the tyre
  pressures (the largest of the four decides), and the screen says so.
- Peak values: the tell-tales and "PEAK" figures follow the Peak hold setting and are taken all the time
  the app runs. The g-force peaks count once the app has zeroed the g sensor at a standstill (three
  readings of each direction with the car stopped) and hold until Reset peaks. The tyre "Start" pressures
  are the first readings after the app was opened, or after Reset peaks.

The Gauges app's Thermal status line uses its own fixed thresholds, which are **not** the Warm-Up presets
below: oil under 60 °C is Cold, from 85 °C Up to temperature, and Hot from the oil warning setting
(125 °C as shipped) or 112 °C coolant. Warm-Up calls engine oil up to temperature from 80 °C and too hot
from 115 °C. So on a car with both apps the two can disagree. Proven Warm-Up is the one that carries
Proven's numbers. The Gauges line is decided by the oil temperature: without one it reads "No oil
temperature" and shows the coolant, and it never reads "Up to temperature" on coolant alone.

## The ethanol read-out

Off as shipped. A workshop switches it on per car: Settings, Workshop settings, Ethanol reading. It then
shows as a strip on the Boost set, "ETHANOL  E27" with its source under it, or "ETHANOL  NO READING" with
the reason. Nothing is shown in demo mode, nothing is remembered and nothing is entered by hand: only a
fresh answer from the engine unit is a value. **It is unproven on every car.** Compare it with the
tuner's own app at two different blends before trusting it on a car, and leave it off otherwise.

A flex-fuel sensor reports to the engine unit, not to the head unit, so the head unit cannot pick the
reading off the car's network itself. It can only ask the engine unit. There are three choices, one per
car, and the app never falls back from one to another:

- **Engine unit value (550D)** and **OBD value (PID 52)**: read requests only, like every other value.
  One request at most every 30 seconds, only while the Boost set is on screen. A reading is shown for at
  most 100 seconds after the engine unit's answer; raw 255 and anything above 90 % is shown as no
  reading. Nobody has recorded what an engine unit with a flex-fuel kit answers to these two: it may
  show nothing, or a constant such as E0 that looks measured.
- **MHD flex (not read only)**: for cars with an MHD flex-fuel tune. It reads the ethanol content the
  tune keeps in the engine unit, the way MHD's own app and the public Flex Fuel app by Alex Perea do.
  **This is the one place where either app sends something that is not a read**, and only when the
  workshop chooses it:

  | step | request to the engine unit | what it is |
  |---|---|---|
  | identify | `22 F1 01` | a read: which engine program the engine unit runs now |
  | probe | `2F 04 4D 48 44` | not a read: asks whether the MHD tune is there. A tuned engine unit answers with MHD's marker, any other refuses |
  | clear, define | `2C 03 F3 03`, `2C 02 F3 03 ...` | not reads: make a temporary identifier out of the tune's two ethanol bytes |
  | read | `22 F3 03` | a read, every 2 seconds while the Boost set is on screen |

  Those three requests are fixed in `apps/pps_gauges/mhdflex.js` and nothing else can leave that way.
  They are checked again, together with the setting, at the moment each one is handed on towards the
  car's diagnostic link. Each of the three is limited where it leaves: never two within 5 seconds, at
  most 3 in any 10 minutes and at most 6 in any hour, whatever the engine unit answers and however often
  a setting is changed. That is at most 18 requests that are not reads in any hour; when the limit is
  reached the strip says "paused, too many tries" until there is room again. A refusal is asked once
  more before it is believed, because every app on the head unit hears every reply of the engine unit.
  The identification comes first and is strict: an engine unit whose software list does not name exactly
  one program, one that is in the app's list, gets that one read and nothing more, and shows "software
  not supported" (or "software not identified" when the list has another shape than the one known). **Only the B58 gen2 is in the list so far**; the S58
  is not, until its two memory places are known. According to the Flex Fuel app's notes the engine unit
  forgets the temporary identifier at the next ignition cycle, and the app then defines it again. The
  strip shows the tune's own figure and what its sensor says ("MHD flex  ·  sensor E26").
  **Proven has not run this on a car.** The requests and the two memory places come from the Flex Fuel
  app's notes for one B58 gen2 on MHD 5.41; whether another MHD version keeps the same places is not
  known, and a wrong place would show a wrong number that looks measured. Switch the read-out off, or
  close the app, before logging or flashing with the tuner's app or connecting a tester: they share the
  engine unit and its temporary identifiers.

A Motiv ReFlex has no reading of its own for the head unit: its box only gives the engine unit a
percentage when it is linked to a tune that takes it. On MHD that is the MHD flex choice above.

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
  it is waiting for and the minutes left. Rev past 4,000 rpm while a fluid is read cold and the line, the
  limit and the rev bar turn red: "Ease off: 5,287 rpm on a cold engine, keep below 4,000 rpm until warm".
  After that it reads Up to temperature (green), Too hot (red) or Engine off.
- **A fluid that dips after the warm-up** is shown on its own row ("BELOW 80°C, dipped after the
  warm-up") and named on the status line, while the car stays "Up to temperature". A gearbox whose
  reading has aged out reads "on its last reading" with "--" for the number.
- **An announcement.** When the last of the three comes into range, "UP TO TEMPERATURE" covers the app's
  screen for six seconds with a green tick and the full logo. It is made once per warm-up, and not on a
  hot restart. It is shown only if the app's screen is open within 15 seconds of the car coming up to
  temperature, at most once in 10 minutes, and it is taken off at once if the car stops being ready: it
  is never shown late.
- **Gauge style** (Settings): Horizontal bars is what a fresh install shows; Round dials is the earlier
  look with three dials, and can be chosen per car.
- **A home-screen widget, on iDrive 7 only.** The same three temperatures and the status on the iDrive home
  screen. Whether it fills after a head-unit restart before the app has been opened is not tested yet:
  see "Not tested". The kit builds home-screen widgets for iDrive 7 only, so an iDrive 8 car
  (the curved display) does not get one.

Where the logo is: the full logo on the horizontal screen and the announcement. The round dials, the widget
and the app tile carry its first line (PROVEN) only, because the full logo would be too small to read there.
The "Proven logo" switch in Settings takes it off the screen and the widget.

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
- An engine run lasts until the engine has been off for 5 minutes: a stop at the lights, auto start-stop
  or a stall is the same run. It also ends when the app itself has not run for 5 minutes.
- Once the app has seen the car ready with its engine running, at the end of a warm-up it watched (it
  read a fluid below its "safe from", and everything then came into range while the engine ran) or for
  two minutes of running, the car stays ready for the rest of that engine run while every fluid that has
  a reading is no more than 15 °C below its "safe from". A fluid more than 15 °C under, too hot, or
  without a reading is never covered. Nor is a car that was only found in range: with the engine off, or
  in the first two minutes of running after the app started or the engine was off for 5 minutes or more.
  A fluid that then settles under its "safe from" is "Warming up".
- Only a gearbox that has never given a reading can be left out: once the engine has run for 90 seconds
  on that engine run, while it is running, and only when the gearbox unit refuses both identifiers, does
  not answer three requests in a row, or gives twelve answers in a row with no reading among them, and
  the car's own gearbox signal gives nothing usable. It then stays left out, also across engine stops,
  until a gearbox reading arrives, and the status line says "gearbox oil not monitored". While the app
  could not ask the gearbox unit at all, the gearbox is waited for. Set Gearbox oil temperature to Not
  monitored for a car without a sensor, and it is left out from the start.
- A gearbox with no reading now, whose last reading was in range, counts on that reading for the rest of
  the engine run. Last read below its "safe from", or too hot, it is waited for until a reading returns.
- A temperature the car marks as "no value" is kept for 10 seconds and then dropped, and the app waits
  for it again. This also ends a "Too hot" for that fluid: the app then shows NO READING and waits for it.
  A reading that simply stops arriving is kept.
- With no temperature at all the status line reads "No temperature data", with "Keep below 4,000 rpm"
  while the engine runs. That advice is on the app's status line only, not on the widget, and revving
  past the limit is not flagged in that state.
- Revving past the limit is flagged only while the car is warming up and a fluid is read below its "safe
  from"; the line shows the highest engine speed of that burst.
- "Ready in about N min" is measured from how fast each fluid is actually warming, is given once a minute
  of warming has been measured with the engine running, and never as more than "over 60 min". An engine
  that has been off for 30 seconds starts the measuring afresh.
- The numbers in these rules that are judgement, not measurement: 15 °C for a dip, two minutes of running,
  30 seconds, twelve answers. Each is on the first-car list in [CHANGES-warmup.md](CHANGES-warmup.md).

## Where the readings come from

- Engine oil, coolant and rpm are the car's own signals, which arrive without anything being asked. An
  oil value outside -40 to 170 °C, or a coolant value outside -40 to 160 °C, is treated as "no value".
- The engine counts as running while the car sends an engine speed of 400 rpm or more. An engine speed
  the car replaces with "no value" for 3 seconds, or stops sending for 10 seconds, counts as an engine
  that is not running.
- Gearbox oil uses the kit's reader with Proven's changes, which are listed at the top of
  `apps/pps_warmup/gearbox.js`: the gearbox unit through the head unit's read-only diagnostic link (the
  identifier the kit read on a ZF 8HP), else the car's own signal once it has moved. Warm-Up sends read
  requests only.
- The gearbox unit is asked every 5 seconds: with the app closed and no widget, while the engine runs and
  the car is not yet up to temperature or its gearbox oil is read a little under its "safe from"; with
  the screen open, while the car is driven or for 10 minutes after the screen was opened, engine running
  or not; with only the widget on the home screen, while the car is driven. "Driven" means the engine ran
  or the car moved in the last 3 minutes. It is never asked while the car says it is locked and left. A
  unit that does not answer is asked every 30 seconds, and again at once when the engine is started; one
  that refused both identifiers every 5 minutes.
- A gearbox reading is live for 20 seconds after the unit's answer. After that the screen shows "--".
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
- `proven/tools/` holds the generators of the two `app.json` files (they are not edited by hand) and
  the tests. `fakecar.js` and `warmup_bench.js` are the stand-in cars the tests run the apps on.

## Look at them on a PC (no car, no SDK)

Needs Python 3 and Node.js 14 or newer.

```
python3 kit/tools/build.py --preview-only pps_gauges
node kit/tools/preview.js dist/pps_gauges preview-gauges render wait=9 render --set page=street
node proven/tools/test_vitals.js dist/pps_gauges
node proven/tools/test_engine_unit.js dist/pps_gauges
node proven/tools/test_ethanol.js dist/pps_gauges
node proven/tools/test_mhdflex.js dist/pps_gauges
node proven/tools/test_screens.js dist/pps_gauges pictures-gauges

python3 kit/tools/build.py --preview-only pps_warmup
node kit/tools/preview.js dist/pps_warmup preview-warmup wait=8 render wait=45 render
node proven/tools/test_warmup.js dist/pps_warmup
```

`preview.js` writes PNGs of what the app draws from its demo drive (it switches demo data on). Gauges
shows its start-up logo first, so the early pictures are the logo and the last one is the gauge set;
`page` can be street, track, boost, thermal or tyres. Warm-Up's demo is a whole warm-up from cold in
about 50 seconds; it shows no time figure, because that needs a minute of measuring. `test_screens.js`
with a folder as its second argument saves a picture of every state it draws, including ones the demo
drive never shows (a car that sends nothing, a unit that does not answer, the ethanol strip).
`test_warmup.js` runs `test_warmup_car.js` as its last part. The kit's live emulator
(`node kit/tools/emu.js pps_gauges`, kit README section 6.4) shows an app moving, but it runs the full
build, which needs BMW's app SDK from your own head unit (kit README section 3.1).

# What has and has not been tested

Tested on a PC, on these versions (18 Nov 2026, Node.js 24, all checks passed):

- **Gauges 1.1.0, 487 checks in five files.** `test_vitals.js` (133): the data layer with raw values as
  the car sends them, "no value" markers, units, peaks, power. `test_engine_unit.js` (121): simulated
  engine and gearbox units that answer, refuse, keep quiet, sleep and wake. `test_ethanol.js` (55) and
  `test_mhdflex.js` (128): the ethanol read-out against simulated engine units, including which requests
  can leave the head unit, how often, and when none does. With the ethanol setting on anything but MHD
  flex, the app sends the same requests at the same moments as it did before that choice was added
  (48,522 calls to the car's diagnostic link compared over nineteen simulated scenarios). `test_screens.js` (50): all five sets drawn with the app's
  own main.js in states the demo never shows, checking that every letter has a glyph at the PC, iDrive 7
  and iDrive 8 text sizes and that no two texts overlap or leave the screen.
- **Warm-Up 1.3.0, 350 checks in two files.** `test_warmup.js`: the decision (cold start to ready, the
  holds, dips, the gearbox left out or on its last reading, too hot, no readings, the time to ready, the
  presets as shipped). `test_warmup_car.js` (161 of the 350): the built app on a stand-in car, reading
  the status line, the rows, the widget's lines and every request sent to the gearbox unit, through
  switch-off, start-stop, a locked car, a manual car, refusals and a clock set back.
- Each fix was shown to fail on the version before it: the same tests run against the published 1.2.1 and
  1.0.3 fail at least one check for every fault listed in the two CHANGES files.
- The Warm-Up decision was also put through about 16 million random sequences of readings with its rules
  checked after each, without a rule broken. That script is not in this repository.
- Both apps were built with the kit's build step, their demo drives drawn with `preview.js` without an
  error, and every app file parsed at the JavaScript level the head unit runs (Node.js 8).

Every engine unit, gearbox unit and car in those tests is a stand-in written from the kit's notes and
the Flex Fuel app's notes. The tests show what the apps do with such answers and what they send; they do
not show what a real car answers.

Checked on earlier versions only (1.2.x and 1.0.x), not repeated on these:

- every gauge set and the Warm-Up screen and Settings in the kit's live emulator, which runs the car's
  own draw engine (the full-screen layout at 1920 x 720, tabs, Settings, Reset peaks on the page)
- the kit's build step producing both the iDrive 7 and the iDrive 8 screen description, and both apps
  placed with the kit's iDrive 8 screen figures (app area 2880 x 764 above the climate bar) without
  errors. The kit itself marks those figures "not measured on a car yet"

Not tested:

- **on a car, or on a head unit of any kind.** Compare every reading with a tool you trust (the dealer
  tool, a logger) before relying on it.
- **the ethanol read-out on any car**, in any of its three choices. For the MHD flex choice in
  particular: whether the head unit reaches the engine unit on the car, whether another MHD or program
  version keeps the same memory places, and what an engine unit without the tune answers to the probe.
  The S58 is not supported yet.
- what the car's engine-speed signal does when the engine is switched off (0, a run-down value, "no
  value", or nothing more), and whether the engine unit and the gearbox unit answer before the engine is
  started. The apps handle each case in simulation; which one a car shows is in their logs.
- the car's "locked and left" state: whether each head unit has the signal, and what it sends.
- how far engine oil and coolant fall in the first minutes after a hot restart, which the two-minute rule
  rests on, and how far coolant dips under load.
- what a gearbox unit other than the ZF 8HP answers. One that never gives a reading is left out after a
  minute of such answers and 90 seconds of running. Use Not monitored where a car gives none.
- how long an unanswered request keeps the head unit's diagnostic link busy. Gauges was simulated with 0
  to 20 seconds; with more than 15 seconds its engine-unit tiles go blank for a moment each time.
- whether the car names its display units on every head unit, whether the sport display's boost really
  stops at 25.4 psi, and how often the car sends the two accelerations at a standstill.
- the power figure on a tuned car: the engine unit's torque figure is not verified there.
- **the new screen texts on a head unit.** They were drawn on a PC with the kit's software drawing code
  and fitted their places. They have not been through the GPU renderer or a car. The small widget's text
  lines are drawn by the head unit itself and have not been seen at all.
- the timing of Warm-Up's full-screen announcement (15 seconds, once in 10 minutes), the guarded timers,
  and Gauges' Thermal line and start-up logo timing are not covered by a test that ships here.
- **the home-screen widget after a head-unit restart, without opening the app.** If the widget stays
  empty until the app is opened, the app needs a change (and one in the kit) before the widget can be
  promised "without opening the app".
- whether each car gives an engine oil temperature on the signal Warm-Up reads. Where it gives none,
  Warm-Up stays on "Warming up".
- iDrive 8 beyond the build step and the placement figures above.
- the MGU Store building the apps from this source.

# Licence and credits

- The Proven Performance Solutions name and logo, and Proven's own code in `apps/pps_gauges`,
  `apps/pps_warmup` and `proven/`, are not under the kit's MIT licence: see the `NOTICE` file in each
  app folder. The same terms apply to the files in `proven/`.
- The idrive7-apps kit and its apps: MIT, by cauliflowermossgrape and contributors (`LICENSE` at the top
  level), except the GPU renderer in `kit/renderd` and the emulator's draw engine in `kit/emu`
  (GPL-3.0-or-later) and the Doom app with `third_party/doomgeneric` (GPL-2.0): see "Doom and renderer
  licences" in the kit's README. Fonts keep their own licences in their folders.
- The MHD flex ethanol reading (`apps/pps_gauges/mhdflex.js`) is adapted from the Flex Fuel app by Alex
  Perea (https://github.com/alexpereap/pereaperformance-idrive7-apps, MIT): its method, its requests and
  the two memory places for the B58 gen2. Its licence notice is in `apps/pps_gauges/NOTICE`.

Unofficial software, not affiliated with, endorsed by or supported by BMW AG, MHD Tuning or Perea
Performance. Gauges are for a quick glance: set them up parked, and keep eyes on the road.
