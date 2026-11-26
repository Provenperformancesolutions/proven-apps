# Proven apps for iDrive 7 and iDrive 8

Four apps for BMW MGU head units (iDrive 7 and iDrive 8) by Proven Performance Solutions, built on the
open-source idrive7-apps kit:

- **Proven Gauges** 1.1.2 (`apps/pps_gauges`): five gauge sets
- **Proven Warm-Up** 1.3.2 (`apps/pps_warmup`): tells the driver to keep below 4,000 rpm until engine oil,
  gearbox oil and coolant are up to temperature, with Proven's temperatures built in
- **Proven Drag** 1.0.2 (`apps/pps_drag`): times standing-start runs from the car's own speed signal:
  0-100 km/h, 60 ft, 1/8 mile and 1/4 mile, with trap speeds. For closed roads and track days only.
  **BETA, still being tested on cars**
- **Proven Drift** 1.0.1 (`apps/pps_drift`): shows the car's drift angle live on a drawn car, scores
  every drift and keeps its data, from the car's own motion sensors. For closed circuits and skid pans
  only. **BETA, still being tested on cars**

> **Proven Gauges and Proven Warm-Up: no longer BETA (23 Nov 2026).** Proven installed these two apps on
> a car from this source through the MGU Store and reports that both work. Nothing more is recorded of
> that use: not which car or head unit (iDrive 7 or iDrive 8), not which screens were seen, not whether
> any reading was compared with another tool. See "What has and has not been tested" for what was
> checked on a PC only and what is still open.
> That was with the font the apps had before. Since 1.1.2 and 1.3.2 they draw their text in a new
> font, Rajdhani. For these two apps the new font has been checked on a PC only: no use of 1.1.2 or
> 1.3.2 on a car is recorded.
> As shipped, the apps only read values the car already has.
> There is one exception, and it is switched off until a workshop chooses it: the "MHD flex" ethanol
> reading in Gauges sends three requests to the engine unit that are not reads (see "The ethanol
> read-out"). The apps are a guide for a quick glance and do not replace the car's own instruments and
> warnings. Compare every reading with a tool you trust before relying on it. Proven's own code is
> provided as is, without warranty of any kind: you install and use it at your own risk.

> **Proven Drag and Proven Drift: BETA, still being tested on cars (26 Nov 2026).** The note above
> is not about these two apps. On the first car they were on (25 Nov 2026) the MGU Store built and
> installed Proven Drag 1.0.1 and Proven Drift 1.0.0, and both ran. But each closed by itself,
> "generally within 30 seconds, randomly", and after the second time the platform removed the app.
> Proven Gauges and Proven Warm-Up kept working on the same car. **The cause is not known.** Nothing
> found on a PC makes either app's own code do that, and nothing can be debugged on the car.
> Proven Drag 1.0.2 and Proven Drift 1.0.1 are what was made after that car. As shipped, each asks
> of the car only what apps that run on cars also ask. Everything more is a setting that is switched
> off. And each keeps a record of how every start of the app ended, and shows it on its Signals tab
> under "Starts and stops", so that one phone photo tells how the app last stopped.
> **This release is not a proven fix. The apps may still close by themselves.** Nothing of 1.0.2 or
> 1.0.1 has been on a car. See "After installing Proven Drag 1.0.2 or Proven Drift 1.0.1" and "What
> the first car showed".

> **Proven Drag.** Its times are an indication only. They come from the car's own speed signal, and
> as shipped every run is UNCALIBRATED: the speed scale is only learned with "GPS speed scale"
> switched on in Settings. One run on the first car was set beside a GPS timer by the car's owner.
> One run says little, and it is no measure of how exact the app is. Proven Drag only reads values
> the car already has, and it is for closed roads and track days only. Like all of Proven's own code
> it is provided as is, without warranty of any kind: you install and use it at your own risk. See
> "Proven Drag" and "What has and has not been tested".

> **Proven Drift.** No screen of Proven Drift was photographed on the first car. Its accelerator
> figure was reported as "jumping about" there, and the app shows no accelerator percentage any more.
> The drift angle it shows is an estimate, worked out from the car's motion sensors, and no angle
> from it has been compared with a car's. So its angles and its scores are an indication only. It
> only reads values the car already has, it does nothing with DSC or any driving setting, and it is
> **for closed circuits and skid pans only**. Like all of Proven's own code it is provided as is,
> without warranty of any kind: you install and use it at your own risk. See "Proven Drift" and
> "What has and has not been tested".

## Add them to your car

You need a BMW with an iDrive 7 (MGU) or iDrive 8 head unit and the
[MGU Store](https://github.com/robertnisipeanu/mgu-store).

1. In the Store: **Settings**, **Add source**, type **`Provenperformancesolutions/proven-apps`**.
   No token and no sign-in are needed. The source should show 4 components.
2. Install **Proven Gauges** and **Proven Warm-Up**.
3. Installing **Proven Drag** is optional. It is BETA and still being tested on cars. On the first
   car the Store built and installed version 1.0.1, and the app then closed by itself (see the note
   above). Whether 1.0.2 does is not known. It is for closed roads and track days only.
4. Installing **Proven Drift** is optional too. It is BETA in the same way: the Store built and
   installed version 1.0.0 on the first car, and it closed by itself there. Whether 1.0.1 does is not
   known. It is for closed circuits and skid pans only.
5. If you install either of the two, read the next section first.

The GPU renderer and the controller gate the apps need come from the Store's built-in
`cauliflowermossgrape/idrive7-apps` source, so that source must still be on the car.

## After installing Proven Drag 1.0.2 or Proven Drift 1.0.1

Why the two apps closed on the first car is not known, and the apps of this release may close too.
Nothing can be debugged on a car: only phone photos of the screen come back. So each app now writes
down how every start of it ended, and the order of things matters.

1. **Leave every switch off for the first drive.** That is how the two apps are shipped. In Proven
   Drag the switches are "GPS speed scale" in Settings and the five under Workshop settings. In
   Proven Drift they are the seven under Workshop settings. With all of them off, each app asks of
   the car only what apps that run on cars also ask. Proven Drag's runs then say UNCALIBRATED. That
   is expected.
2. **Open the app, wait a minute, open the Signals tab and photograph it.** Its first block,
   "Starts and stops", is the record. One line is one start of the app: when it started, how long it
   lived, how it ended and what it was doing at its last note.
3. **If the app closes by itself, open it again in the same drive and photograph the Signals tab
   before you switch the car off.** For the first minute the Run tab of Proven Drag and the Drift
   tab of Proven Drift then say "The app stopped by itself last time. Please photograph the Signals
   tab." The same drive matters. One copy of the record is kept in the head unit's memory, and that
   copy is gone when the head unit restarts. The other copy is in the app's data folder, which the
   platform empties after an unexpected end.
4. **What the platform does then.** By the kit's README (section 4.3), the first time an app ends
   unexpectedly the platform empties the app's data folder. That takes the saved runs or drifts,
   the log and the settings with it, so every switch is off again by itself. The second time it
   removes the app, and it has to be installed again.
5. **If the app does not close, try the switches one at a time.** What closed it may be among what
   is switched off. Switch one on, drive, and photograph the Signals tab again. Then the next. Each
   start's line says what was switched on in it. In Proven Drag, "GPS speed scale" is the switch
   that gives calibrated runs. Keep "Note stop signals" for a drive of its own, after the app has
   stayed up without it: see "Starts and stops" under each app.
6. **One more photo helps a great deal.** After an ordinary day, switch the car off, come back
   later, open the app and photograph the Signals tab. It shows how the car ends the app when
   nothing is wrong. Nobody knows that yet.
7. **Proven Drift, the steering.** With the car standing and the engine running, photograph the
   Signals tab with the steering wheel straight, a quarter turn left and a quarter turn right. The
   rows "Steering wheel, chassis" and "Steering wheel, NoCRC" show the raw value now and its lowest
   and highest.
8. **Proven Drag, a flagged run.** Photograph its Timeslip. The DATA line says what the app saw:
   see "DATA GAP on a car that sends its speed only when it changes".

These photos are what the next release is made from.

## What changed

**Proven Drag 1.0.2 and Proven Drift 1.0.1, BETA (26 November 2026)**

- **Made after the first car, and not a proven fix.** On 25 Nov 2026 Proven Drag 1.0.1 and Proven
  Drift 1.0.0 were installed on one car through the Store, and ran. Each closed by itself, "generally
  within 30 seconds, randomly", and after the second time the platform removed the app. Proven Gauges
  and Proven Warm-Up kept working on that car. **Why the two apps closed is not known.** Nothing
  found on a PC makes either app's own code throw, hang or grow without bound, and nobody can attach
  a tool to the car. So this release does two things, and promises nothing about the closing. See
  "What the first car showed".
- **First: as shipped, each app asks of the car only what apps that run on cars also ask.** Proven
  Drag subscribes to two values: the car's speed and its forward acceleration. Proven Drift
  subscribes to six: the speed, the two accelerations, the yaw rate, and the steering wheel's angle
  under its two field names. As shipped neither app reads a value from the car itself any more.
  Everything else the two apps did is an extra behind a setting that is off as shipped: six settings
  in Proven Drag, seven in Proven Drift. An unexpected end empties the settings, so the app goes
  back to that state by itself. See "Settings" and "It only reads" under each app.
- **Second: each app keeps a record of its starts and stops**, and shows it on the Signals tab
  under "Starts and stops": how each of the last five starts of the app ended, and what the app was
  doing at its last note. It is there for the next phone photo. See "Starts and stops" under each
  app, and "After installing Proven Drag 1.0.2 or Proven Drift 1.0.1".
- **No signal listener as shipped.** The record can note a signal that ends the app (SIGTERM,
  SIGHUP, SIGINT). But a listener changes how the app's process answers such a signal, and no app
  known to run on a car has one. So it is behind the Workshop setting "Note stop signals", off as
  shipped in both apps.
- **Proven Drag: what the first car's screens showed is in it.** That car sends its speed only
  while the speed changes. The app now takes a speed that is not sent anew as the speed the car
  still has, and times a run from what the car sends alone. On such a car gentle pull-aways will
  often be flagged DATA GAP: see "DATA GAP on a car that sends its speed only when it changes". The
  wheel values of that car are in a form nobody expected. A wheel factor now has to prove itself at
  two steady speeds 20 km/h apart before anything is worked out from the wheels.
- **Proven Drag: runs are UNCALIBRATED as shipped.** The GPS receiver is one of the extras. No speed
  scale is learned until "GPS speed scale" is switched on.
- **Proven Drift: no accelerator percentage anywhere.** On the first car the figure was "jumping
  about", so the value does not arrive in the form the app took it for. The PEDAL bar and AVERAGE
  PEDAL are gone. The score and the flags never used the pedal. With "Pedal and handbrake" on, the
  Signals tab's second page shows the pedal's raw values for a photo.
- **Proven Drift: wheel values must prove themselves.** No wheel value reaches the angle, the
  score or the learning until all four have shown, at two steady speeds 20 km/h apart, that they are
  plain multiples of the car's speed. Until then no rear wheelspin is shown, and its place says why.
- **Proven Drift: the steering.** The steering wheel's angle is the first source now, the one the
  kit's own apps read. Slow, gentle corners are kept as steering moments from the start and no
  longer thrown away until the yaw rate is learned. The Drift tab says in words how far learning is.
  What was learned is written every 20 seconds on the move, where it was every two minutes.
- **Both apps: the Signals tab has two pages**, and a figure that needs an extra says that it is
  switched off where it would stand. No banner pulses with the clock any more, so a picture on
  which nothing changed is not sent to the screen again for its own sake. When the car asks the app
  to stop, the app writes its saved file once before it ends.
- **Words.** The Store descriptions begin "BETA, still being tested on cars". Proven Drag's
  Timeslip and Proven Drift's first screen and Last tab say "BETA: still being tested on cars".
- **Checked on a PC only.** Nothing of 1.0.2 or 1.0.1 has been on a car, on a head unit or on
  Node.js 8. Independent checks of both builds were made, and what they found is repaired in this
  release. Proven Drag has two new test files and Proven Drift three: see "Look at them on a PC".
- **Nothing changed in Proven Gauges, Proven Warm-Up and the kit with it.** No file in
  `apps/pps_gauges`, `apps/pps_warmup` or `kit/` was touched. To see it for yourself (a319514 is
  where this source stood before this release), this prints nothing:

  ```
  git diff a319514 HEAD -- apps/pps_gauges apps/pps_warmup kit
  ```
- What the car showed, every change, every check that was changed on purpose, and what is not
  fixed and not known are in [CHANGES-drag.md](CHANGES-drag.md), parts 11 to 14, and
  [CHANGES-drift.md](CHANGES-drift.md), parts 9 to 12.

**Proven Drift 1.0.0, BETA (November 2026)**

- **A fourth app: Proven Drift.** It shows the car's drift angle live on a car drawn from above,
  scores every drift by angle, speed and length, and keeps the data of each drift, of the session and
  the all-time bests. See "Proven Drift".
- **It was BETA and had not been on a car.** It had been built and checked on a PC only, with
  made-up cars. The angle is an estimate, and no angle from the app had been compared with a car's.
  Its Store description began "BETA, not yet tested on a car", every tab of the app carried a BETA
  badge, and its first screen said CLOSED COURSE ONLY.
- **For closed circuits and skid pans only.** It only reads values from the car. It does nothing with
  DSC, traction control, the handbrake or any driving setting, and nothing leaves the car.
- **The car has to be learned first.** Nobody knows how a car scales the signals the angle is worked
  out from, so the app learns that from steady corners without sliding, and shows no angle and scores
  nothing before.
- **Two reviews of the first build.** Two reviewers who had not built the app tried it on a PC
  with made-up cars of their own. What they found (a banked corner counted as a drift on a car
  without steering, the first corners of a first drive counted as a drift, a flag on clean drifts,
  motion data that could die unnoticed) was changed, and what could not be cured is listed under
  "Known from the PC and not solved". CHANGES-drift.md, part 3, has all of it.
- **A re-check of those changes.** A checker who had not written them tried them again. A banked
  corner on a climb was still counted as a drift on a car without steering, real drifts on low grip
  were no longer counted there, and learning stopped on a climb. Since then **a drift that the
  steering did not back sets no best**: it is scored and shown, with the flag NO STEERING CHECK. So on
  a car that gives no steering angle no drift becomes a best. That rule is to be looked at again once
  a car has shown what it gives. CHANGES-drift.md, part 4.
- **A second check.** Two checkers who had not written those changes found them good and left a short
  list. Since then a steering angle that is still sent and does not move is taken for stuck after one
  ordinary corner and is no longer used (before, it could "back" a corner as if it were opposite
  lock, with no flag). The line under the drawn car is larger and shorter, and the Last tab's sentence
  for NO STEERING CHECK is true in every case of that flag. Sentences of these notes that the
  re-check's changes had made untrue are put right. CHANGES-drift.md, part 5.
- **A third check.** A checker who had not written those changes found that the new rule took a
  healthy steering for stuck in the largest drifts. With the front wheels at their lock the steering's
  value can sit still to the last count. If the car's nose then stopped turning for a moment in the
  middle of the drift (the driver lifts, or the car slides straight between two corners), the drift
  was flagged NO STEERING CHECK and set no best, and the older rule for a silent steering did worse
  on a steering that is only sent when it changes. Since then, for both rules, the car has "gone
  straight" only while less than 20 degrees are shown. What that costs when a steering really is
  stuck is under "Known from the PC and not solved". CHANGES-drift.md, part 6.
- **A fourth check.** A checker who had not written that change found that it had opened a state in
  which a stuck steering is believed for minutes. A steering value freezes at a few degrees in an
  ordinary corner and is still sent; a banked corner follows with no straight between, and the angle
  shown runs away there. After that the rule for a stuck steering waited for less than 20 degrees
  shown, the rule that pulls the angle to zero on a straight waited for a steering near its centre,
  and each held the other up: real drifts were not counted, and GO STRAIGHT FOR A MOMENT stood on
  the screen while the car went straight. Since then the stuck rule asks the steering as well: with
  20 degrees or more shown, a stretch is "not straight" only if the front wheels are turned 10
  degrees or more the way of that angle, as a car that slides holds them. What is still not found,
  and what this costs a healthy steering, is under "Known from the PC and not solved".
  CHANGES-drift.md, part 7.
- **A fifth check.** A checker who had not written that change found two things these notes did not
  say. In slow, tight drifts a car needs little opposite lock, and since the fourth check's change a
  healthy steering whose value sits still to the last count there can be taken for stuck: the drift
  then sets no best, a drift with two straight slides in it is counted as two, and the screen says
  STEERING SILENT OR STUCK while the steering works. And since the third check's change a steering
  that dies with the wheels at their lock, in a drift that then fades out slowly, is believed to the
  end of the drive. **No line of the app's code was changed for either.** Three rounds had each traded one
  such case for another on made-up cars, and which of them a car can show at all is not known
  before a car has been driven. Both are written down with their figures under "Known from the PC
  and not solved", both are held by scenes in the test, and the list for a first car asks for what
  decides them. CHANGES-drift.md, part 8.
- The source now lists four components. Installing Proven Drift is optional.
- **Nothing changed in the other three apps with it.** No file in `apps/pps_gauges`,
  `apps/pps_warmup`, `apps/pps_drag` or `kit/` was touched, and their tests were as they had been.
  To see it for yourself (1becffc is where this source stood before Proven Drift was added, a319514
  where it stood with it), this prints nothing:

  ```
  git diff 1becffc a319514 -- apps/pps_gauges apps/pps_warmup apps/pps_drag kit
  ```
- How the app was built, the error tables, every figure in it that is a guess, where the estimate is
  poor and what to look at on a first car are in [CHANGES-drift.md](CHANGES-drift.md).

**New font, November 2026: Gauges 1.1.2, Warm-Up 1.3.2, Drag 1.0.1**

- **All three apps now draw their text in Rajdhani**, a free font (Copyright (c) 2014 Indian Type
  Foundry, SIL Open Font Licence 1.1). Before, they used the kit's Ubuntu font.
- **When it was released, the new look had been checked on a PC only and had not been on a car.**
  Proven Gauges and Proven Warm-Up had run on a car with the font before. Proven Drag had not been on
  a car at all. Since then Proven Drag 1.0.1 and Proven Drift 1.0.0, which draw with this font, have
  run on one car (25 Nov 2026). Nothing is recorded of how the text read there.
- **What stays in the car's own font**: everything the head unit draws itself. That is the Store's own
  screens, such as its settings list, the app's name in the head unit's menu, the head unit's own
  button bar and its own settings screen, and the text lines of Warm-Up's small home-screen widget.
  Where the kit draws the whole screen itself (GPU renderer, full-screen layout), the header with the
  tabs and the list of settings are the kit's, and they are in Rajdhani too.
- **Digits take the same room each.** Rajdhani gives every digit its own width. Left like that, a
  running clock would shake and a unit would move as the digits change. So every digit has the room of
  the widest one, as in the font before. A 1 and a 7 have more space around them for it.
- **The degree sign is drawn larger.** Rajdhani's own ring is small and thin. Beside a temperature it
  was a faint speck. It is drawn 1.4 times as large, in the same place and in the same room, so no
  text moved. It is still Rajdhani's ring.
- **Nothing else changed, with one exception.** On the Track set of Gauges the Speed panel is wider
  (372 px, was 330) and the two tiles beside it are narrower. From 100 km/h on, the speed's unit ran
  into the gear's letter there: in M with the font before, in D, S and M with the new one.
- What the apps read from the car, what they work out and what they save is the same code as before.
  Of the apps' files, only `apps/pps_gauges/main.js` (that panel) and the version number in each
  `app.json` changed. In `kit/`, the five text atlases changed, the font's licence was added, and one
  paragraph was added to the header of the Ubuntu licence file (`UFL-Ubuntu.txt`, two copies: see
  "Licence and credits"). Nothing else in `kit/` changed. This lists exactly those files (bad68cb is
  where this source stood before the new font, 1becffc where it stood with it):

  ```
  git diff --stat bad68cb 1becffc -- apps kit
  ```
- The three version numbers went up because the Store offers an update only when the version is
  higher. Proven Drag's Store description stayed the same with it.
- The sizes, what was checked and how, and what only a car can show are in
  [CHANGES-font.md](CHANGES-font.md).

**Proven Drag 1.0.0, BETA (November 2026)**

- **A third app: Proven Drag**, a timer for standing-start runs. It times 0-100 km/h (or 0-60 mph),
  60 ft, 330 ft, 1/8 mile, 1000 ft and 1/4 mile, with trap speeds, from the car's own speed signal. See
  "Proven Drag".
- **It was BETA and had not been on a car.** It had been built and checked on a PC only, with
  made-up cars, and no time from it had been compared with a timeslip or a GPS timer. Its Store
  description began "BETA, not yet tested on a car", and every tab of the app carried a BETA badge.
- It only reads values from the car, and it is for closed roads and track days only.
- The source then listed three components. Installing Proven Drag is optional.
- **Nothing changed in Proven Gauges and Proven Warm-Up with it.** They stayed 1.1.1 and 1.3.1, and
  no file in `apps/pps_gauges`, `apps/pps_warmup` or `kit/` was touched. To see it for yourself
  (376bb5e is where this source stood before Proven Drag was added, bad68cb where it stood with it),
  this prints nothing:

  ```
  git diff 376bb5e bad68cb -- apps/pps_gauges apps/pps_warmup kit
  ```
- How the app was built, what two reviews and the checks after them found, every figure in it that is
  a guess and what to look at on a first car are in [CHANGES-drag.md](CHANGES-drag.md).

**Warm-Up 1.3.1 and Gauges 1.1.1 (23 Nov 2026)**

- **The Store descriptions no longer say BETA.** Both apps have been installed through the Store and
  run on a car: see "What has and has not been tested".
- Nothing else changed. Apart from the description and the version number in `app.json`, every file of
  both apps is the same as in 1.3.0 and 1.1.0.

**Warm-Up 1.3.0 and Gauges 1.1.0 (published 23 Nov 2026)**

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
- Signal names, scaling and the engine-unit identifiers are the kit's M Vitals definitions, with four
  changes of Proven's. No result from a car is recorded for any of them: a diesel's rail pressure is
  accepted up to 2700 bar;
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
fresh answer from the engine unit is a value. **It is still unproven on every car: the first car has no
flex-fuel sensor, so it was not switched on there.** Compare it with the tuner's own app at
two different blends before trusting it on a car, and leave it off otherwise.

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
  **This is the one place where any of the four apps sends something that is not a read**, and only
  when the workshop chooses it:

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
  **Proven has not run this on a car: the first car has no flex-fuel sensor.** The requests and the two
  memory places come
  from the Flex Fuel app's notes for one B58 gen2 on MHD 5.41; whether another MHD version keeps the same places is not
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
  see "Still open". The kit builds home-screen widgets for iDrive 7 only, so an iDrive 8 car
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
  30 seconds, twelve answers. Each is on the list of things to look at on a car in
  [CHANGES-warmup.md](CHANGES-warmup.md) (section 4). No result from a car is recorded for any of them yet.

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

# Proven Drag

**BETA, still being tested on cars.** A timer for standing-start runs: 0-100 km/h (or 0-60 mph),
60 ft, 330 ft, 1/8 mile, 1000 ft and 1/4 mile, with a trap speed at the 1/8 and the 1/4 mile. It
times a run from the car's own speed signal. For closed roads and track days only.

This section says what the code of version 1.0.2 does. Version 1.0.1 ran on one car and closed by
itself there: see "What the first car showed". Nothing of 1.0.2 has been seen on a car. Its times
are an indication only: see "What has and has not been tested".

## What the driver sees

Four tabs. A BETA badge sits beside them on every tab. The Signals tab has two pages: touch it
again, or use Next page, for the second.

| Tab | What is on it |
|---|---|
| **Run** | The speed now, the clock and the state: STOP TO ARM, READY, TIMING or RUN FINISHED. Four results, each with its ± figure and the best so far: 0-100 km/h, 60 ft, 1/8 mile and 1/4 mile, the last two with their trap speed. A strip under them: clock start, speed scale, data rate, wheelspin, start slope and flags |
| **Timeslip** | The last run as a slip: 60 ft, 330 ft, 1/8 mile and its trap speed, 1000 ft, 1/4 mile and its trap speed, and 0-100 km/h, each time with its ±. Beside it: peak g and top speed, wheelspin, start slope, height change, the speed scale used, how the speed data arrived, and the flags. It carries the line "BETA: still being tested on cars" |
| **Best** | The best time per split for the clock start in use, and the last runs. "Reset best" asks twice. It clears the best times and the list of runs |
| **Signals** | The workshop's page, in two pages. Page 1: "Starts and stops", the record of how the app started and stopped, always shown. Under it the eleven sources, each with its state, rate, longest gap and number of samples. A source whose setting is off says "switched off". Page 2: the four wheels' raw values and learned factors, the GPS speed scale, the car's road gradient and the slope the car stands on. As shipped most of page 2 says "switched off" and names the setting. "Reset calibration" is on page 2, shows with Workshop settings on, and asks twice |

- **A run.** Stop the car. After one second at a standstill the Run tab says READY, with the line
  "Closed roads and track days only". Launch: the clock starts at first movement. The run ends when you
  lift (the speed falls 5 km/h under the run's top speed), at the 1/4 mile, or after 60 seconds. Splits
  reached by then are kept, and the results stay on the screen until the next launch. A roll that never
  passes 5 km/h and stops again is not a run.
- **A speed that is not sent anew.** The first car sends its speed only while the speed changes. So
  as shipped, a speed the car has not sent anew is taken as the speed it still has, for as long as
  the head unit says the car's speed service is up and a value has arrived since it came up. The Run
  tab then shows that speed and says READY on a standing car, and the data rate cell says SPEED WHEN
  IT CHANGES. What the app cannot tell apart there: a steady speed from a speed signal that has died
  while its service stayed up. A speed that stays on the Run tab while the car stands still means
  the car has stopped sending it. The Signals tab then says "silent for N s" for the speed.
- **No speed.** While no speed is known, the Run tab shows none and says NO SPEED FROM THE CAR.
  Where the car's speed service is down and the timer is armed on the last speed the car sent, the
  tab says ARMED, NO NEW SPEED, and a launch is still timed if the car sends it. The app cannot
  always tell which case it is in. Where the speed has stopped arriving and the timer is still armed
  on the last speed it heard, the tab says NO SPEED FROM THE CAR with the line "Timer armed. Closed
  roads and track days only" under it, and a launch can still be timed. That line, and ARMED, NO NEW
  SPEED, can also show on a car whose launch is then not timed. CHANGES-drag.md parts 8, 9 and 11
  list these cases.
- **After a stop by itself.** For the first minute after a start that follows an end nobody asked
  for, the Run tab says "The app stopped by itself last time. Please photograph the Signals tab."
  See "Starts and stops".
- **Flags.** A run is flagged when something says its times may be off. A flagged run is shown and
  saved, but **it sets no best time**. The five flags:
  - DOWNHILL START: the car stood on a steeper downhill slope than the limit in Settings.
  - SPEED READ HIGH AT LAUNCH: in the first 3 seconds the car's speed ran more than 5 % above the
    slowest wheel for more than 0.3 seconds. The 60 ft time may be too good.
  - DATA GAP: the speed data had a hole of 0.3 seconds or more, repeated one value for a second or
    more, or stopped before the run was over. Or the app itself was held up for 0.3 seconds or more.
    A shorter hold-up can leave such a hole too, because a sample that was stamped late is taken out.
    On a car that sends its speed only when it changes, this flag comes up often on gentle runs: see
    "DATA GAP on a car that sends its speed only when it changes".
  - SPEED JUMP: the speed made a step upwards that no car does. The run ends there.
  - SERIES DISAGREE: the two ways the speed arrives gave times further apart than their two ± figures
    together. The ± shown is widened to that difference.
- Times are shown to a hundredth of a second, each with its ±. Demo data is off as shipped. Switched
  on, the app shows one made-up launch with a DEMO tag, and a demo run is never saved.
- The app has no home-screen widget and does not start with the head unit. It runs once it has been
  opened, and from then on it times with its screen showing or not.

## How it times a run

- **From the car's own speed signal.** This is the car's own vehicle speed, read in steps of
  1/64 km/h. By public reports it is the stability control's speed, which the car has already corrected
  for wheelspin.
- **As shipped the app only listens.** The car sends the speed when it changes. The kit reads it
  once when the car's speed service comes up, and that one read is how the app knows that a standing
  car stands: a standing car sends nothing. The app reads nothing itself. Every run is timed from
  the samples the car sent, and from nothing else. On the first car the speed arrived 47 to 50 times
  a second while it changed, and not while it was constant.
- **With "Ask the car for values" switched on** (Workshop settings) the app also reads the speed
  itself, as 1.0.1 did without being asked: every 50 ms while the car is under 5 km/h, armed or
  being timed, and every 500 ms on the move otherwise. It never reads while its screen is hidden,
  before every subscription asked for is set up, or while one is being tried again. Each way is
  timed on its own and the two are never mixed. When a run is over the app takes the one whose
  samples were closer together, unless that one saw the launch late, went silent, had a hole,
  repeated a value or made a jump. Both are written to the log. On the first car the app's own reads
  were answered and added nothing. A car that never sends its speed by itself is not timed without
  this switch.
- **No sample carries the car's own time.** Each is stamped when it reaches the app. A delay that is
  always the same cancels out. A delay that varies goes straight into the result.
- **Where the clock starts.** "First movement" is the moment the speed passes 0.5 km/h. On made-up
  cars that is 0.01 to 0.2 s after the car begins to move, depending on how gently it pulls away. The
  app places it with a fit through the last standing sample and the first moving ones. Distance is the
  speed summed up from there. The setting "Clock starts" has three choices, and best times are kept
  apart for each:
  - **Slip** (as shipped): the 0-100 km/h from first movement, the distances after the first foot.
  - **Everything from first movement.**
  - **Everything after the first foot.**
- **Trap speed** is the average speed over the last 66 ft before the line. The Timeslip also shows the
  speed at the line itself.
- **The ± figure** beside a time is the sampling uncertainty only: how far off the launch and the
  crossing of a line can be because the car says its speed only every so often. It is a quarter of the
  gap between the last standing and the first moving sample, plus a quarter of the gap between the two
  samples around the line. For a time taken after the first foot the first gap counts a sixteenth. It
  is never under 0.01 s. It gets wider where the samples show that more is open: a sample that was
  stamped late, a hole, a gear change right at 100 km/h, or half the time a read took when the speed
  was asked for. Where one read took far longer than the others, half of what it took longer is added
  for the launch or the line beside it. **It does not cover:**
  - **the speed scale** (tyre size and wear). On three made-up cars on a PC that do 0-100 km/h in 3,
    6.5 and 12 s, a speed that read 1 % low moved the 0-100 km/h by 0.05, 0.12 and 0.24 s, and the
    1/4 mile by 0.07, 0.10 and 0.12 s.
  - **a slope, and wheelspin.** No time is corrected for either. They are shown, and can flag a run.
  - **a speed signal that starts late.** If the car's signal reads 0 until the car already does
    1 km/h or more, every time from first movement reads short. On made-up cars on a PC, with a signal
    that starts at 2 km/h, the 0-100 km/h read 5 to 33 ms short on average for a car that does it in
    3 s and 19 to 104 ms short for a 12 s car, depending on how the speed arrives. With a gentle start
    (brake released first, then throttle) and a signal that starts at 1 km/h it read about 160 ms
    short, and the ± did not cover that. None of this is corrected. Where the samples show it, the
    Timeslip says "Speed signal starts at N km/h: times from first movement read short".
  - **a speed signal that is smoothed.** On two made-up cars on a PC, a signal that lags 80 ms behind
    the true speed read the 0-100 km/h 33 and 41 ms long, and nothing in the samples shows that.
  - **a delay between the car and the app that varies**, as above.

## DATA GAP on a car that sends its speed only when it changes

The first car is such a car, and as shipped the app has nothing but what the car sends. A car that
holds one speed to the last count (1/64 km/h) sends nothing for that time. A car whose data is lost
on the way also sends nothing, as far as the app can see. On the samples alone the two cannot be
told apart for certain. A wrong time shown as clean is worse than a flag too many, so the app flags
the run.

- **The rule.** When the speed has said nothing and the next sample is too far from the last for
  "nothing changed", the app times that stretch as a hole. From 0.3 seconds the run is flagged DATA
  GAP. That is the rule of 1.0.1. A gentler rule for the flag was tried for 1.0.2 and taken back: it
  let a made-up run with a lost second pass as clean, with a 60 ft time that was wrong by more than
  its ±. What is left of it only chooses the words on the Timeslip.
- **Gentle pull-aways will often be flagged.** Whenever the speed has stood still to the last count
  for 0.3 seconds or more and the next change is a brisk one, the run is flagged. On a made-up car
  like the first one, of 16 gentle pull-aways that hold a speed for 0.5 or 1.5 seconds and then pull
  or brake at once, 12 are flagged. With a speed that wavers a little it is chance: of 8 runs held
  for 2 seconds and then lifted, 1 was flagged. On the first car four of six gentle pull-aways
  carried the flag under 1.0.1.
- **In 1.0.2 this comes up more often on gentle runs than in 1.0.1, not less.** In 1.0.1 the app's
  own reads of the speed took some such runs without a flag. They are off as shipped now. With "Ask
  the car for values" switched on the app behaves as 1.0.1 did here.
- **A flagged run keeps its times and sets no best.** The Run tab says "flagged: sets no best"
  under a time that would have been a best, and the Timeslip says "A flagged run sets no best time."
- **A full-throttle run that ends in a held speed is flagged too.** In the PC tests, full-throttle
  runs of made-up cars that were driven to the 1/4 mile or ended by a lift carried no flag. But of
  118 made-up drives that begin with a full-throttle pull, 13 carried DATA GAP: in each the driver
  held one speed to the last count after the pull, where a lift would have ended the run. **Lift
  off to end a run.** The Run tab says so while it is timing: "Lift off to end the run".
- **A run ends after 3 seconds of silence.** If nothing at all is sent for 3 seconds while a run is
  timed, the run ends there with DATA GAP and keeps the splits it has. That is so whether the car
  held one speed to the last count for 3 seconds or its signal was lost.
- **The Timeslip's words.** Its DATA line says what the app saw, and a photo of it tells which case
  it looked like:
  - "hole N ms": a hole that does not look like a steady speed.
  - "app held up N ms": the app itself was held up, whatever the car sent meanwhile.
  - "nothing notified for N s (may be a steady speed)": the samples after the silence look like a
    speed that stood still and then moved on. Under one second the length is given in ms. Lost data
    can look the same, so it is said as a possibility and the flag stands.
  - "nothing notified for 3 s (steady speed or signal lost)": the run ended on a silence.

  The FLAGS line says DATA GAP in every one of these cases.
- **Not solved.** What could tell a steady speed from lost data is not built: the car's own
  acceleration through the silence, or the app's own reads. Whether the first car's speed ever sits
  still to the last count for seconds is not known. All figures here are from made-up cars on a PC.

## What the GPS is used for, and what not

- **It does not time the run.** The head unit's GPS is far too slow for that: by public reports it
  gives 1 to 3 positions a second. Proven has not measured that.
- **As shipped it is not used at all.** The GPS receiver is an extra, and it is off. The app does
  not listen to the receiver, no speed scale is learned, and every run says UNCALIBRATED: its times
  are worked out from the speed as the car reports it. The Run tab then says GPS SCALE IS OFF IN
  SETTINGS under UNCALIBRATED. The switch is "GPS speed scale" in Settings. A factor that is already
  in the saved file keeps being used with the switch off.
- **With "GPS speed scale" on, it is used to correct the speed scale.** The biggest error in a time
  taken from the car's own speed is the scale of that speed, which moves with tyre size and wear. At
  a steady speed the GPS can say how far off it is. While the car holds a steady speed above
  60 km/h, and the receiver, where it says so, has a fix on 6 or more satellites, the app compares
  the receiver's speed with the car's, at most once a second. After 60 comparisons that agree, which
  is a minute of steady driving at the least, it has a factor. That minute has to come in one start
  of the app: comparisons in progress are not saved. Every speed of the next run is multiplied by
  the factor. A factor is accepted only between 0.90 and 1.10. It is saved and used again after a
  restart, until "Reset calibration" clears it. Each run says which scale it used: "GPS x0.987",
  "MANUAL +1.25 %" or "UNCALIBRATED". On the first car, with 1.0.1, a factor was learned in about
  five minutes: x0.988. That is one car's figure for its own speed signal.
- **With "Positions, study" on** (Workshop settings) the app can work the factor out from positions,
  where the receiver's speed does not arrive: straight stretches of 1000 m or more that begin above
  60 km/h, stay above 50 km/h and have the same speed at both ends within 3 km/h. It needs three of
  them that agree.
- **It gives the height change**, with one of those two settings on. The Timeslip shows how far the
  road rose or fell over the 1/8 and the 1/4 mile, marked "GPS height, ±1 m at best". No time is
  corrected for it. With both off the Timeslip says "not known (GPS is switched off in Settings)".

## What the four wheel speeds are used for

Not for timing, and as shipped for nothing: the wheel speeds are an extra, and the app only asks
the car for them with "Wheel speeds, study" switched on (Workshop settings).

Their scale is not known, so the app learns it: at a steady speed above 30 km/h it compares each
wheel's raw value with the car's speed. A factor counts after 20 such moments, and since 1.0.2 only
once they come from steady speeds at least 20 km/h apart. The moments are kept per stretch of
10 km/h, and every stretch has to agree with the whole. A wheel whose values do not fit a plain
scale (they spread by more than 3 %) is not used.

That second condition is what the first car taught. All four of its wheel values read 65407 with
the car standing, and the factors never settled. Moments taken at one speed agree with each other
whatever form a value has. So on a made-up car with wheel values of such a form, 1.0.1 called all
four factors learned after 14 seconds at one steady speed, and the launch after it got a wheelspin
figure and the flag SPEED READ HIGH AT LAUNCH, both made of nothing. With the new rule nothing is
called learned on that made-up car, and the wheelspin stays the estimate. A car whose wheel values
are plain multiples of its speed now needs two steady speeds 20 km/h apart before its wheels are
used. Wheel factors saved by 1.0.0 or 1.0.1 are not read and are learned again. The first car's
wheel values are not decoded, and no decoding is guessed in this release.

With "Wheel speeds, study" on, the Signals tab's second page shows for each wheel the raw value
now, the lowest and the highest since the app started, and the raw value at the last steady speed
above 30 km/h with that speed, in decimal and hexadecimal. That table is there for one photo.

With all four factors known, the app looks at the first 3 seconds of a run:

- **Wheelspin**: how much faster the fastest wheel turns than the slowest, as a percent. The app
  reports the peak, the seconds above 10 % and which axle led.
- **A cross-check of the speed signal**: if the car's speed runs more than 5 % above the slowest wheel
  for more than 0.3 seconds, the run is flagged SPEED READ HIGH AT LAUNCH. No time is changed for it.

Without wheel speeds the wheelspin is worked out from the car's acceleration and marked as an
estimate, and there is no cross-check. That is how the app is shipped. On the first car's photos
the wheelspin figure was that estimate too, because the wheel factors never settled. The car's
wheel-travel counters are shown raw on the Signals tab's second page for study, with "Wheel travel,
gradient, study" switched on, and are used for nothing.

## The start slope and the downhill flag

The start slope is the reading of the car's own acceleration sensor, averaged over 1.5 seconds of
standing before the launch and given as a percent. Plus is nose up. It is the sensor's reading: the
sensor's own offset is in it, and so is the car's pitch on its springs. A run that starts on a steeper
downhill slope than the limit is flagged DOWNHILL START and sets no best time. The limit is 1 % as
shipped, and can be set to 2 % or switched off. No time is corrected for a slope.

Two limits are known from the PC. A car held on the brake against the engine squats before it moves:
that reads as nose up and can hide a downhill start. And a sensor whose value does not change at all
from the drive through the stop gives no start slope ("not known"), so nothing is flagged.

The car's own road gradient is shown on the Signals tab's second page for study only, with "Wheel
travel, gradient, study" switched on. It is never used in a result.

## Settings

| Setting | Choices | As shipped |
|---|---|---|
| Speed unit | km/h, mph. With mph the speed split is 0-60 mph | km/h |
| Clock starts | Slip, Everything from first movement, Everything after the first foot | Slip |
| Downhill start limit | 1 %, 2 %, Off | 1 % |
| GPS speed scale (off takes full effect after a restart) | On, off. An extra. On: the app listens to the GPS receiver's sentences and learns the speed scale from them. Off: no new speed scale is learned, so runs are UNCALIBRATED unless a factor is in the saved file, and there is no height from the receiver | **Off** |
| Workshop settings | On, off. On shows the seven settings below and the "Reset calibration" button | Off |
| Speed scale | Which factor a run uses: GPS factor (if one is learned), Off (1.000), Manual | GPS factor |
| Manual speed scale (+: the car reads low) | -4.00 % to +4.00 % in steps of 0.25 %, shown when Speed scale is Manual | 0.00 % |
| Ask the car for values (study) | On, off. An extra. On: the app reads the speed itself on a schedule, and the acceleration when the car has not sent it for 2 seconds while the speed changes, as 1.0.1 did. Off: the app reads nothing itself. A car that never sends its speed by itself is then not timed | **Off** |
| Wheel speeds, study (off takes full effect after a restart) | On, off. An extra. On: the app asks for the four wheel speeds. Off: wheelspin is the estimate from the acceleration, there is no cross-check of the speed at the launch and no raw wheel table | **Off** |
| Positions, study (off takes full effect after a restart) | On, off. An extra. On: the app asks for the raw GPS position and height and for the navigation's position. Off: no speed scale from positions, no second source of height | **Off** |
| Wheel travel, gradient, study (off takes full effect after a restart) | On, off. An extra. On: the app asks for the wheel-travel counters and the car's road gradient. Off: two study lines on the Signals tab say "switched off". Nothing in any result changes | **Off** |
| Note stop signals, study (while on, an app that hangs is not ended by one) | On, off. An extra that asks nothing of the car. On: the record of starts and stops listens for the signals that end a process and says which one ended the app. Off: such an end reads NO WORD. See "Starts and stops" | **Off** |
| Colour theme | Proven, Proven Red, Proven Blue, and the kit's four | Proven |
| Screen layout | Full screen, Standard | Full screen |
| Renderer | GPU 60 fps, Software | GPU 60 fps |
| Demo data | Auto, Always, Never | Never |

The names in the first column are the labels as the settings list shows them.

**The six extras.** "GPS speed scale" is shown to everybody. The other five are Workshop settings.
All six are off as shipped, and off is also what the app goes back to when the platform has emptied
its data, because the settings are in that folder.

- An extra that is off is not subscribed at all. No connection to the car is built for a group of
  signals whose every value is off.
- Switched on, an extra is subscribed at once. Switched off, its values are dropped at once and the
  Signals tab says "switched off". The subscription itself stays until the app is next started,
  which is what "(off takes full effect after a restart)" in four of the labels means. Ending a
  subscription would be a call to the car that neither this app nor the kit has ever made on a car,
  so it is not made.
- "Ask the car for values" and "Note stop signals" take effect at once both ways.
- The extra values are asked for without a first read by the kit. With an extra on, a value that
  rarely changes shows when the car next sends it, not at once.
- The speed scale and every switch stay as they were set when Workshop settings is switched off
  again. The five switches are then hidden, and only "Starts and stops" shows what is on.

## Starts and stops

New in 1.0.2. On the first car the app closed by itself and nothing was left to say how: the log is
in the app's data folder, and the platform empties that folder after an unexpected end. So the app
now keeps a small record of its own and shows it on a screen that can be photographed.

- **What is kept.** The last 5 lives of the app. A life is one start of its process. For each: its
  number, when it started by the head unit's clock, how long it lived, how it ended, and its last
  note. The note is refreshed every 2 seconds: memory now and highest, processor share now and
  highest, the longest hold-up of the app's own 50 ms tick, frames drawn a second and what drew them
  (the GPU renderer or software), values a second from the car, the app's own reads asked and
  answered, the tab that was showing, the state (idle, armed or timing), how far the set-up of the
  subscriptions had got, and which extras were switched on.
- **Where it is shown.** The Signals tab's first page begins with "Starts and stops". It is always
  shown, not only with Workshop settings on. This life comes first, then the life before it in two
  lines (how it ended, and its last note), then the older ones. Seven rows at most, and a line that
  says where the record is kept. The same lines go to the log at every start. And for the first
  minute after a start that follows a stop by itself, the Run tab says "The app stopped by itself
  last time. Please photograph the Signals tab."
- **What a line means.** A line of an earlier life reads, for example, "#3 at 25.11. 14:17 lived
  1 min, NO WORD (killed or crashed)." The words for the end:

  | On the screen | What it means |
  |---|---|
  | asked to stop by the car | The platform asked the app to stop, and the app heard it. A clean stop |
  | THE APP'S OWN ERROR at (file and line) (exit code 1): (the error's first line) | An error in the app's or the kit's JavaScript that nothing caught. The error is not swallowed: the kit still logs it and ends the app |
  | ended with exit code N and no word before it | The process ended itself some other way |
  | ENDED BY THE SIGNAL SIGTERM (sent to the app from outside), or SIGHUP, SIGINT | Something outside the app ended it with that signal. Only with "Note stop signals" on |
  | NO WORD (killed or crashed) | None of the above was written. The process was killed outright, ended by a signal (as shipped the app listens for none), or crashed in native code. Nothing in JavaScript can tell these apart |
  | no word, and the head unit has restarted since (power off also ends the app without a word) | Switching the car off is not a crash, and this line is not counted as a stop by itself |
  | The saved data was emptied after #N | The data folder's copy of the record was gone at this start: the platform emptied the app's data folder, so it counted that end as unexpected |

  "Stopped by itself" means: no word, the app's own error, a signal alone, or an exit code other
  than 0 with nothing before it.
- **Where it is kept.** Two copies of one small text of about 3 KB.
  - `box.json` in the app's data folder. Written at the start, at every end the app hears of, and
    at most once a minute while no run is being timed. It outlives a restart of the head unit. It
    is gone when the platform empties the data folder.
  - `/tmp/pps-box-pps_drag-<user id>/box.json`. `/tmp` is memory on the head unit: the kit keeps
    its drawn frames there. Written at the start, every 2 seconds and at every end the app hears of.
    It outlives the app's process and the platform's wipe of the data folder. It does not outlive a
    restart of the head unit.

  At a start both are read and the newer one counts. Where only the data folder's copy is left, a
  life reads "lived at least ..." and its note is headed "Saved note", because that copy can be up
  to a minute older than the life's end. Where the app has no record of its own at all, the record
  of another user id in `/tmp` is read and said to be one, and never written: an app that was
  installed again may run as another user.
- **What is not in it.** No position, no course and no heading, and nothing else of the car's
  data. It holds numbers the process knows about itself, names of tabs and of groups of signals, and
  the first line of an error.
- **`/tmp` is everybody's.** Any process on the head unit can write there. The folder is used only
  if it is a real folder of the app's own user. A file is read through a handle that follows no link
  and does not wait on a pipe, 64 KB at most, and every field is cleaned before it reaches a screen.
  If `/tmp` cannot be used, the app runs on with the data folder's copy alone and the Signals tab
  says so. Whether an app may write to `/tmp` on a car is only known from the kit doing it for its
  frames.
- **"Note stop signals".** As shipped the app puts no listener on its process for any signal, as
  the kit, Proven Gauges and Proven Warm-Up put none. A signal then ends the app at once, and the
  record says NO WORD for it, as for a kill. With the setting on, the record listens for SIGTERM,
  SIGHUP and SIGINT, writes down which one came, takes its listener off and sends the same signal to
  the app's own process, which then ends by it. The price is in the setting's name: a listener is
  only called when the app's own code next comes round, so while the setting is on an app that
  hangs is not ended by such a signal. Whether the platform ever sends a signal is not known. Switch
  it on only after the app has stayed up without it, on a drive of its own. A stop by itself puts
  it back to off.
- **What a photo still cannot tell.** An app that froze and was killed later shows the note from
  before the freeze. The memory figure is the whole process's, not the JavaScript heap alone. If
  the head unit has to be restarted before a crashed app opens again, the copy in memory is gone,
  and the platform has emptied the other. So photograph the Signals tab in the same drive, before
  the car is switched off.

## What is saved and what is logged

- **Saved** (`pps_drag.json` in the app's data folder): the best times per clock start, the last 30
  runs, the four wheel factors and the GPS speed factor. A run is kept as its times with their ±, trap
  speeds, flags, the speed scale used, wheelspin, start slope, height changes, figures on how the
  speed data arrived and which extras were switched on. Each run and each best time is kept with its
  date and time by the head unit's clock, and so is the GPS speed factor. Every line of the log
  carries the time it was written. A demo run is never saved. If the file cannot be written, the
  Timeslip and Best tabs say NOT SAVED. When the car asks the app to stop, the app writes this file
  once before it ends. Every pull-away from a standstill is timed and saved, so 30 gentle
  pull-aways push the real runs out of the list of last runs. The best times stay.
- **The record of starts and stops**: `box.json` in the same folder and a second copy in `/tmp`.
  See "Starts and stops".
- **Logged** (`pps_drag.log` in the same folder), so that a car can be read afterwards: the lines
  of "Starts and stops" at every start, the first 10 raw values of every source, how often each
  source sends, which signals the head unit does not have, each learned factor, and after each run a
  line for the way the speed arrived (for each of the two ways, with "Ask the car for values" on),
  with every result and how the launch was placed. **The log is in the data folder, so the platform
  empties it with that folder after an unexpected end.** No log came back from the first car.
- **Never saved and never logged: a position, a course or a heading.** That means no latitude, no
  longitude, no raw GPS sentence and no place text. Latitude and longitude are held in memory only
  while a straight stretch is measured for the speed scale.
- **What the log does hold of the GPS**, in its first lines:
  - of the receiver's sentences, for the first 10 times they arrive: which kinds of sentence came, how
    many passed their checksum, and the figures read out of them. Those are the speed and whether it
    is valid, the fix quality, the number of satellites, the HDOP figure and **the height above sea
    level in metres**. The sentences' delay counter is logged with them.
  - of the raw GPS height value, the first 10 times: the names of its members, the raw height number
    with what it reads in metres, and the raw GPS speed number.
  - of the two position sources, the first 10 times each: the names of their members, and whether the
    position was valid. No value of them.
  - the learned speed factor, and after each run the height change in metres.

  The member names are written as the car gives them, and some of those names contain the word
  "heading". No value goes with them. The height above sea level is in those first lines on purpose: a
  first car has to show whether the raw value is read correctly. The saved file keeps height changes
  only.

## It only reads

Proven Drag only reads values the car already has. It sets no value, calls no method and does not
use the head unit's diagnostic link, so it sends no request to any control unit.

**As shipped it asks the car for two values, and for nothing else.** It subscribes to
`Vehicle2.statusCarSpeed2`, the car's speed, and to
`CDS2.statusLongitudinalAccelerationMassCenter`, its forward acceleration. Both are asked for the
way the kit's own Drag Timer asks for them. Proven Gauges asks for both in that way and Proven
Warm-Up for the speed, on the car where those two run. Asked for like this, the kit reads each of
the two once itself when the car's service comes up: every app that asks this way has that read.
The app makes no read of its own, with its screen shown or hidden.

Counted at a stand-in for the head unit's native binding, under the kit's own signals code
(`test_drag_native.js`), over a made-up drive of 521 seconds with a launch, town and motorway
speeds, the screen hidden twice and six minutes parked:

| | 1.0.1 | 1.0.2 as shipped |
|---|---|---|
| Connections to a group of signals (proxies) built | 7 | 2 |
| Values and events subscribed | 10 | 2 |
| Reads of a value | 7007 | 2, or 4 where the head unit says "available" twice. They are the kit's own, none is the app's |

**Everything else is an extra behind a setting that is off as shipped**: the app's own reads of the
speed and the acceleration ("Ask the car for values"), the GPS receiver's sentences, which are one
event ("GPS speed scale"), the wheel speeds, the raw GPS position and height with the navigation's
position, and the wheel-travel counters with the car's road gradient. See "Settings".

The app's manifest still names seven groups of signals, or the switches could not work. Two are
needed: the one with the car's speed and the one with its acceleration. Five are optional: the wheel
speeds, the GPS receiver's sentences, the raw GPS position and height, the navigation's position,
and the car's road gradient. As shipped no connection is built for any of the five. The app is
built to work with less where an optional one is missing, and its log then says what is missing and
what that costs.

**If 1.0.2 as shipped still closes, the cause is in what is left.** That is the two subscriptions,
which the kit's own Drag Timer, Proven Gauges and Proven Warm-Up have too, the drawing, or the
platform. And four things Proven Drag still has as shipped that Proven Gauges and Proven Warm-Up
do not:

1. The manifest names five groups of signals that no running Proven app asks for, and the two
   wheel-travel values. What the installer and the platform do with a manifest entry that is never
   used is not known.
2. The app's own 50 ms timer, which runs whether its screen is shown or hidden.
3. The record's file writes: a small file to `/tmp` every 2 seconds, and to the data folder at the
   start, at an end and at most once a minute.
4. Two listeners on the app's process, for its exit and for an error nothing caught. Not for a
   signal.

# Proven Drift

**BETA, still being tested on cars.** It shows the car's drift angle live on a drawn car, scores
every drift, and keeps the data of each drift, of the session and the all-time bests. It works from
the car's own motion sensors. **For closed circuits and skid pans only.**

This section says what the code of version 1.0.1 does. Version 1.0.0 ran on one car and closed by
itself there, and no screen of it was photographed: see "What the first car showed". Nothing of
1.0.1 has been seen on a car, and no angle from the app has been compared with anything outside a
PC: see "What has and has not been tested". The drift angle is an estimate everywhere, and the app
says so on its screens.

## What the driver sees

The first screen, each time the app is first opened after a start of the head unit: the logo, CLOSED
COURSE ONLY, "For closed circuits and skid pans only", and "BETA: still being tested on cars. The
drift angle shown is an estimate." Then five tabs. A BETA badge sits beside them on every tab.
Nothing on any tab needs a touch while driving. The Signals tab has two pages: touch it again, or
use Next page, for the second.

| Tab | What is on it |
|---|---|
| **Drift** | A car drawn from above, turned by the drift angle against an arrow that shows the way it travels. The angle as a big number with LEFT or RIGHT and its ± figure. The speed. The score of the running drift counting up, its multiplier and its time. Two small bars: opposite lock and rear wheelspin. There is no pedal bar. As shipped the rear wheelspin bar says "switched off in Settings". A banner. A strip with the session's score, number of drifts, best score, biggest angle, the data rate, and whether the car is learned. The session's figures take in flagged drifts, so BEST THIS SESSION can show a drift that the Best tab does not hold. Under the drawn car, up to three lines: how far learning is, and a line while no drift can set a best for want of a steering check |
| **Last** | The last drift: score and grade, peak and average angle with the side, the ± of the angle, time, distance, switches and multiplier, entry, average and lowest speed, peak sideways g, peak yaw rate, most opposite lock, peak rear wheelspin, whether the handbrake was on at the start, smoothness, the data rate, and the GPS speed against the car's. There is no pedal figure. As shipped the rear wheelspin, the handbrake and the GPS speed say "switched off". Beside it the angle and the speed over the seconds of the drift, and each flag in a sentence. It carries the line "BETA: still being tested on cars. The angle is an estimate from the car's motion sensors." |
| **Session** | Every drift since the app was started: total score, number of drifts, best score, biggest angle, longest drift by time and by distance, and the list of the drifts with score, grade, peak angle, time, distance and flags |
| **Best** | The four all-time bests (best score, biggest angle, longest by time, longest by distance) with their dates, and the saved list of drifts |
| **Signals** | The workshop's page, in two pages, made so that one photo of the first tells how the app last stopped and what a car gives. Page 1: "Starts and stops", the record of how the app started and stopped, always shown. Under it 13 of the 20 sources. Each has its state (present, not on this unit, not answering, subscribing, no data yet, "arrives, not readable", switched off), how often it sends now and at most, its number of samples and its raw value. The steering and yaw rows also have the lowest and highest raw value since the app started. Beside them what was learned about the car and what is still missing. Page 2: what is switched on in Workshop settings, the other 7 sources, the raw values that are shown for study only, the GPS check, and the pedal's and the wheels' raw values with their settings on |

- **The banner** says one of: LEARNING THE CAR, READY, DRIFT, SWITCH, SPIN, DRIFT ENDED (with the
  score and the grade, and NEW BEST or the flags), TOO SLOW, GO STRAIGHT FOR A MOMENT, NO YAW RATE FROM
  THE CAR, NO DATA FROM THE CAR, DATA LOST. While the car is ready or drifting, the line beside it
  reads "For closed circuits and skid pans only". On a car that sends next to no motion data (fewer
  than five values of the sideways acceleration or of the yaw rate after 10 seconds on the move),
  LEARNING THE CAR says "Almost no motion data arrives from the car. Please photograph the Signals
  tab." And for the first minute after a start that follows a stop by itself, the line beside the
  banner says "The app stopped by itself last time. Please photograph the Signals tab." See "Starts
  and stops".
- **GO STRAIGHT FOR A MOMENT** shows while no drift can start: after a spin, after the angle was lost,
  and after what the app had learned about the car changed. The angle starts again from a straight
  (0.7 seconds of it), or from the car coming under 10 km/h.
- **The lines under the drawn car**, three at most. While the yaw rate is not learned, one says how
  far it is: "YAW RATE: 12 OF 20 CORNERS, 3 MORE TO THE LEFT". While the steering is not learned,
  one says how far that is, "STEERING: 9 OF 14 SLOW CORNERS, 2 MORE TO THE RIGHT", and one under it
  says at what speeds it learns: "NO BEST IS SET UNTIL THEN. IT LEARNS AT 12 TO 60 KM/H". Once a
  count has reached what is needed it is said without "OF", for example "STEERING: 18 SLOW CORNERS
  KEPT (YAW RATE FIRST)": the app has enough slow corners and waits for the yaw rate. Where the app
  cannot use the steering for another reason, one line says why: STEERING CHECK OFF, NO STEERING
  FROM THE CAR or STEERING SILENT OR STUCK, each followed by "NO BEST IS SET". Drifts are still
  scored then. Where the steering can be used and simply does not say that the car oversteers, no
  line shows: the drift is flagged when it ends. On the PC, STEERING SILENT OR STUCK also came up
  while the steering worked: where its value sat still to the last count in a slow, tight drift (see
  "Known from the PC and not solved").
- **LEFT and RIGHT.** LEFT means the nose points to the left of the way the car travels, as in a drift
  through a left-hand corner.
- **Flags.** A drift is flagged when something says its figures may be off. A flagged drift is shown
  and saved, and it counts in the session (in its score, its best score, its biggest angle and its
  longest drift, so the session's best can be a drift that the Best tab does not hold), but **it sets
  no all-time best**. The seven flags:
  - UNCALIBRATED: the car was not fully learned yet (see "Learning the car").
  - ANGLE UNSURE: the ± of the angle, averaged over the drift, was more than a fifth of its peak angle
    (7 degrees are always allowed, more than 10 never).
  - NO STEERING CHECK: for less than half of the drift's time did the steering back it. The steering
    backs a drift while the app can use it (the car gives a steering angle, it is neither silent nor
    stuck, its scale is learned, and "Steering check" is on) and it says that the car oversteers: the
    car turns clearly more than it is steered. Without that, nothing in the car's data tells a slide
    from a banked or climbing corner taken with full grip. So the flag has two cases: the app could
    not use the steering, or it could and the steering said that the car went where it was steered.
    **On a car that gives no usable steering angle every drift carries this flag, and none becomes a
    best.**
  - DATA GAP: samples of the yaw rate, the sideways acceleration or the speed were missing for 0.35 s
    or more, or the app itself was held up for 0.3 s or more, during the drift or in the 3 seconds
    before it. Or the angle was lost while the drift ran: the yaw rate or the sideways acceleration
    stopped arriving for 2.5 s (the drift goes on from the last values for that long, and ends
    there), or what the app had learned about the car changed under the drift. Or, only with "Ask
    the car for values" on, the speed the app reads itself stopped arriving for 1.5 s. As shipped a
    speed that the car does not send anew counts as unchanged, however long.
  - LOW DATA RATE: the yaw rate or the sideways acceleration came less than 8 times a second.
  - SPIN: the angle passed 100 degrees, or the car all but stopped while still sideways. The drift
    keeps half its points.
  - DEMO: demo data.
- Demo data is off as shipped. Switched on, the app shows a made-up drive with a DEMO badge. A demo
  drift carries the DEMO flag, sets no best and is never saved.
- The app has no home-screen widget and does not start with the head unit. It runs once it has been
  opened, and from then on it works with its screen showing or not.

## How the angle is worked out

The drift angle is the angle between where the car points and where it travels. The car does not
report it. The app works it out from three things the car does report: its speed, how fast it turns
(the yaw rate) and its sideways acceleration.

- **The sum.** A car that goes round a corner without sliding turns exactly as fast as its sideways
  acceleration and its speed say it must. If it turns faster than that, its nose is swinging into the
  corner: the drift angle is growing. The app adds that difference up, 50 times a second or more, from
  one moment to the next. This needs no data about the car or its tyres. Its weakness is that every
  small error in a reading is added up too, for as long as the sum runs.
- **Four things keep the sum honest.**
  1. *The car is learned first* (next section), so that the two readings agree in ordinary corners.
  2. *Rest.* When the car has gone straight for 0.7 seconds, the angle is pulled to zero and the
     sensors' zeros are trimmed.
  3. *The steering check.* In a drift the front wheels point close to the way the car travels. Where
     the car gives its steering, the sum is pulled slowly toward what the steering says, while the
     car turns more than it is steered, or as it is steered. While the front ploughs (understeer) the
     steering says nothing about the angle and is not used.
  4. *The acceleration check.* A car that is sideways feels part of its cornering in its forward
     acceleration. Together with the change of its speed that gives an angle of its own. Where the
     steering check is not at work, the sum is pulled slowly toward it. It can only pull where the
     car feels 3 m/s2 or more sideways (about 0.3 g). On a pan with less grip than that, and at large
     angles in the wet, it cannot. On a road that climbs the car feels forward acceleration that its
     speed does not show, and so does a sensor whose zero is off. The app measures that difference
     wherever the car goes straight and takes it out. A climb that begins in the corner it cannot
     take out.
- **The ± figure** beside the angle says how far off the app takes the angle to be. It grows with the
  time since the car last went straight, with a low data rate, while the car is not learned, and where
  the checks and the sum disagree. It is the app's own estimate of its error on made-up cars. It is
  not a measured accuracy, and nothing says that it holds on a car.
- **Under 10 km/h there is no angle**, and the screen shows "--". Without a yaw rate there is no angle
  at all: the banner says NO YAW RATE FROM THE CAR and nothing is scored. Without wheel speeds
  everything works but the rear wheelspin.
- **Without steering** (a car that does not give it, a steering signal that has gone silent or is
  stuck, a car whose steering is not learned yet, or "Steering check" switched off) the angle rests
  on the acceleration check alone. Where that check can pull, the angle was about as good on the made-up car
  as with steering. Where it cannot (low grip), the angle is the bare sum: its ± grows by about a
  degree a second, and a drift longer than about 10 seconds is flagged ANGLE UNSURE. And in a banked
  or cambered corner taken without sliding the angle shown can run to tens of degrees on such a car,
  and the corner may be counted as a drift. **So without steering every drift is flagged NO STEERING
  CHECK: it is scored and shown, and it sets no best** (see "Known from the PC and not solved").
- The angle on the screen is from a moment ago: 40 ms where the car sends 50 samples a second, 0.3 s
  at 5 a second.

## Learning the car

Nobody at Proven knows how the car scales its yaw rate or its steering. So the app does not guess:
it learns them from ordinary driving, shows what it learned on the Signals tab, and saves it between
drives. "Ordinary driving" here means corners taken without sliding, on the same closed ground,
before the first drift. The app learns whenever it is running and the car takes such a corner. The
accelerator pedal and the wheel speeds are not learned like that: on the first car neither arrived
in the form the app took it for. See "The accelerator pedal and the wheel values".

- **The yaw rate** is learned from steady corners without sliding, at 30 to 110 km/h with a moderate
  sideways acceleration, held for a second. One such second is a "moment". Left and right corners are
  both needed. With 20 moments, 6 each way, that agree within 8 %, the yaw rate is "learned". On the
  stand-in car that took 67 seconds from pulling away into its first corners; how long it takes on a
  car is not known.
- **Until then** the banner says LEARNING THE CAR. Before a first handful of moments (two each way,
  or six one way with a standstill or a straight before them) the app has nothing to go by: **no
  angle is shown ("--") and nothing is scored**. After that drifts are scored and flagged
  UNCALIBRATED, until the yaw rate is "learned". When that first handful is complete, the angle starts
  from zero, and nothing is scored until the car has gone straight once: the banner says GO STRAIGHT
  FOR A MOMENT until it has.
- **Learn on flat ground.** A corner with camber into the turn takes part of the sideways
  acceleration away, and the yaw rate's scale then comes out too low, with the app still saying
  "learned": 8 % low with 1.5 degrees of camber in every corner on a made-up car, and a drift then
  read 10 degrees low. A skid pan is flat. A circuit is not. Ground that climbs or falls evenly does
  no harm: with the forward acceleration reading up to 1 m/s2 more than the speed's change (a climb
  of about 6 degrees) the made-up car was learned as on the flat.
- **A second in which the car slides is not taken as a moment**: the car then feels forward
  acceleration that its speed does not show (beyond what it shows on a straight, which is the road's
  climb or the sensor's zero and is taken out first). The Signals tab says how many seconds were
  turned down for it. On a car that gives no forward acceleration only the wheel speeds say so, and
  on a car with neither nothing does.
- **The steering** is learned from slow, gentle corners (12 to 60 km/h, with 0.5 to 2.5 m/s2 of
  sideways acceleration), where the front wheels point the way the car goes. It needs 14 moments, 4
  each way. Faster or harder corners teach the yaw rate and not the steering: after 3.5 minutes of
  ordinary corners at 44 to 100 km/h the made-up car had the yaw rate learned and no steering moment.
  **Until the steering is "learned" no drift sets a best** (the flag NO STEERING CHECK), so a first
  drive needs slow corners both ways as well, for example a slow figure of eight on the pan. The
  lines under the drawn car say how far it is until then.
- **Slow corners count from the start.** Since 1.0.1 a slow, gentle corner is kept as a steering
  moment also before the yaw rate is learned. 1.0.0 threw those corners away until then, and on a
  PC it usually did not learn the steering in 20 minutes of mixed road even on the stand-in car. The
  steering's scale is still worked out together with the yaw rate's, so nothing is used earlier than
  before. No other learning limit changed. The first car's owner wrote that the steering "is
  calibrating from 20 min of normal driving". That sentence reads both ways, and no screen of the
  app was photographed, so whether that car's steering was learned is not known.
- **The steering wheel's angle may arrive in a form this version does not read.** The app uses a
  steering or yaw value only where it is a plain count from 0 to 65535, and guesses no other
  decoding. If a car sends the angle as a signed number, the steering will not learn, every drift
  carries NO STEERING CHECK and none is a best. The Signals tab shows the value as it came, with its
  lowest and highest since the app started, so that a photo with the car standing shows its form.
- **The pedal** is not learned and not used. **The wheels**, only with "Wheel speeds" switched on
  and once their values have proven themselves: the usual ratio of rear to front wheel speed, which
  wheelspin is then read against. Two signs are checked on the way: which way the car counts a left
  turn, and that a positive forward acceleration is speeding up. Without proven wheel values the
  first of the two stays assumed, and the Signals tab says ASSUMED.
- **Which source.** As shipped the app asks for one source of each. The yaw rate is CDS2's. The
  steering is the steering wheel's angle, under the two field names the kit's own apps subscribe
  to: whichever delivers first is used, the other is counted and shown. 1.0.0 took the front wheels'
  own angle first, which no app of the kit reads. That angle, a second source of the yaw rate and
  two more steering sources are an extra now: "Other steering and yaw". With it on and the source on
  Auto, if the first choice has delivered nothing 10 seconds after the car was first heard, the
  first one that has delivered 20 usable values takes its place. Each source is learned on its own.
  A workshop can set either source by hand. A source set by hand that belongs to the extra is not
  used while the extra is off, and the Signals tab says so.
- **A steering wheel's angle is a plain multiple of the front wheels' only where the steering
  ratio is fixed.** On another car its moments spread wider and the steering may not reach
  "learned". The front wheels' own angle, set by hand with "Other steering and yaw" on, is then
  1.0.0's way.
- **What was learned is written to the saved file** 10 seconds after something was first learned,
  when the car next stands, and every 20 seconds on the move (1.0.0: every two minutes). Never while
  a drift runs or may be beginning. An app that is stopped loses 20 seconds of learning at most.
- "Reset what was learned" in Settings (Workshop settings) forgets all of it.

## What a drift is, and how it is scored

- **A drift starts** when the angle has been at or above the start angle (10 degrees as shipped) for
  0.3 seconds, at or above the slowest speed that counts (20 km/h), with the nose pointing into the
  turn. Without steering the acceleration check has a say: where it can speak (from 1.5 m/s2 of
  sideways acceleration) and speaks against the angle, nothing starts. The drift waits a second at
  most for it to come round, and still counts from where it began. Where it cannot speak (low grip,
  large angles) the drift starts on the sum. Either way a drift without steering is flagged NO
  STEERING CHECK. **It goes on through a change of
  direction** (a switch) if the angle crosses zero and reaches the start angle on the other side
  within a second. **It ends** when the angle has stayed under the
  end angle (0.6 of the start angle: 6 degrees) for 0.6 seconds, or when the speed falls under the
  slowest speed. **A spin** ends it: the angle passes 100 degrees, or the car all but stops while
  still sideways.
- **The score** of one drift:
  - Points build up for as long as the drift lasts. Each second gives 10 points at 10 degrees and
    50 km/h.
  - More angle gives more, in proportion: 30 degrees gives three times what 10 degrees gives. Angle
    beyond 60 degrees gives no more than 60 does.
  - More speed gives more, in proportion: 100 km/h gives twice what 50 km/h gives. Speed beyond
    150 km/h gives no more than 150 does.
  - A held drift earns a multiplier. It starts at 1.0 and grows by 0.1 for every second the drift has
    lasted, up to 2.0 more.
  - Each switch adds 0.5 to the multiplier (up to 2.0 more) and gives 150 points at once.
  - A smooth angle earns more than a sawing one. Every time the angle turns back by 5 degrees or
    more counts as a reversal. With no reversal in the last 3 seconds the points count 1.2 times.
    Each reversal in those 3 seconds takes 0.1 off, down to 0.7 times. The same sawing gives the same
    number of reversals, within two, wherever in it the count begins.
  - A drift that ends in a spin keeps half its points.
  - Grades: D under 150 points, C from 150, B from 500, A from 1200, S from 3000.
- The same drift always gives the same score: nothing in the scoring reads a clock or a random number.
  Every number of it stands in one table at the top of `apps/pps_drift/score.js`.
- What that gives on the made-up car: 30 degrees at about 65 km/h for 6.5 seconds, 373 points (C).
  Three such drifts joined by two switches, 1146 (B). A long circle of 27 seconds at 45 km/h and
  about 35 degrees, 2014 (A). A drift that ends in a spin, 102 (D).

## Settings

| Setting | Choices | As shipped |
|---|---|---|
| Speed unit | km/h, mph. With mph, distances are in feet | km/h |
| A drift starts at | 8, 10, 12, 15 or 20 degrees. It ends under 0.6 of that | 10 degrees |
| Slowest speed that counts | 15, 20, 30 or 40 km/h | 20 km/h |
| Chassis | 3 / 4 Series, M3, M4 (2.85 m); 2 Series Coupe, M2 (2.74 m); 5 Series, M5 (2.98 m); 8 Series, M8, two doors (2.82 m); Z4 (2.47 m); Other | 3 / 4 Series |
| Wheelbase | 2.30 m to 3.30 m in steps of 5 cm, shown when Chassis is Other | 2.85 m |
| Workshop settings | On, off. On shows the thirteen settings below | Off |
| Yaw rate from | Auto, CDS2, Chassis. Chassis needs "Other steering and yaw" on | Auto |
| Steering from | Auto, Front wheels (chassis), Front wheels (XView), Steering wheel (chassis), Steering wheel (XView). All but Steering wheel (chassis) need "Other steering and yaw" on | Auto |
| Steering check | On, off. Off: the angle is worked out without the steering, no opposite lock is shown, and every drift is flagged NO STEERING CHECK and sets no best | On |
| Forward acceleration | Use, Leave out. Leave out is for a car that turns out to work its forward acceleration out from its speed: see "Known from the PC and not solved" | Use |
| Ask the car for values (study) | On, off. An extra. On: the app reads the speed itself, 2 to 10 times a second, and the yaw rate and the two accelerations where the car sends them fewer than 8 times a second. Off: the app reads nothing itself and works from what the car sends | **Off** |
| GPS receiver (study, off in full at next start) | On, off. An extra. On: the app listens to the GPS receiver's sentences. Off: no GPS check of the car's speed | **Off** |
| Wheel speeds (study, off in full at next start) | On, off. An extra. On: the app asks for the four wheel speeds, and uses them only once they have proven themselves. Off: no rear wheelspin, learning cannot check that the wheels grip, and which way is left stays assumed | **Off** |
| Other steering and yaw (study, off in full at next start) | On, off. An extra. On: the app also asks for the front wheels' own angle, two more steering angles and a second yaw rate. Off: the steering is the steering wheel's angle and the yaw rate is CDS2's | **Off** |
| Pedal and handbrake (study, off in full at next start) | On, off. An extra. On: the app asks for the accelerator pedal, shown raw only, and for the handbrake. Off: the pedal's raw value is not shown and "handbrake at the start" is not known. Neither enters a flag or the score | **Off** |
| Car estimate and analyser (study, off in full at next start) | On, off. An extra. On: the app asks for the car's own motion estimate, the two results of BMW's own drift analyser and the DSC button's state, and shows them raw. Off: no raw study values | **Off** |
| Note stop signals (study) | On, off. An extra that asks nothing of the car. On: the record of starts and stops listens for the signals that end a process, and while it is on an app that hangs is not ended by one. Off: an end by a signal reads NO WORD. See "Starts and stops" | **Off** |
| Reset what was learned | No, Confirm, Reset now | No |
| Reset bests | No, Confirm, Reset now. It clears the four bests and the saved list | No |
| Colour theme | Proven, Proven Red, Proven Blue, and the kit's four | Proven |
| Screen layout | Full screen, Standard | Full screen |
| Renderer | GPU 60 fps, Software | GPU 60 fps |
| Demo data | Auto, Always, Never | Never |

- The names in the first column are the labels as the settings list shows them.
- **The seven extras** are all Workshop settings and all off as shipped. Off is also what the app
  goes back to when the platform has emptied its data, because the settings are in that folder.
  - An extra that is off is not subscribed at all, and no connection to the car is built for a group
    of signals none of whose values is wanted.
  - Switched on, an extra is subscribed at once. Switched off, its values are no longer used from
    that moment and its rows say "switched off". The subscription itself ends with the next start of
    the app, which is what "off in full at next start" in five of the labels means. The kit has no
    call that ends one subscription, and shutting a connection down is something no app here has
    done on a car.
  - "Ask the car for values" and "Note stop signals" take effect at once both ways. Even with "Ask
    the car for values" on, the app never reads while its screen is hidden, before every
    subscription wanted is set up, or while one is being tried again.
  - The extra values are asked for without a first read by the kit. A value that rarely changes,
    such as the handbrake, says "no data yet" until the car next sends it.
  - The DSC button's state is in "Car estimate and analyser" and is not named in the label. The app
    shows it raw and does nothing with DSC.
- The chassis only matters for the steering check. The wheelbases are the makers' published figures.
  Half the car's weight is taken to be on the front axle for every one of them.
- **A reset always takes two steps.** The setting has three values: No, "Confirm: choose Reset now",
  and Reset now. The reset happens when "Reset now" is chosen while the setting stands at Confirm.
  Chosen straight from No, "Reset now" only puts it at Confirm. After 30 seconds, or when Workshop
  settings is switched off, it is back at No. This has been tried on a PC only: no use of it on a
  head unit is recorded.

## The accelerator pedal and the wheel values

Two things the first car showed are in this section. Neither value is decoded, and no decoding is
guessed in this release.

- **No accelerator percentage anywhere.** 1.0.0 showed a PEDAL bar on the Drift tab and AVERAGE
  PEDAL on the Last tab: the raw value's share between the smallest and the largest value seen so
  far. On the first car that figure was "jumping about". So the value does not arrive in the form
  the app took it for, and its form is not known. In 1.0.1 no pedal percentage is shown, logged or
  newly saved. The pedal never reaches the part of the app that works out the angle and the score.
- **The score, the flags and the angle never used the pedal.** On a PC the same drive with "Pedal
  and handbrake" on and off gave the same drift to the last figure.
- **The pedal raw, for two photos.** With "Pedal and handbrake" on, the Signals tab's second page
  shows the pedal's raw value now, the lowest and the highest since the app started, each in
  decimal and in hexadecimal, how many different values were seen and how many arrive a second. Two
  photos of that page, one with the foot off and one with the foot on the floor, are what a later
  version needs to read the value's form.
- **Wheel values must prove themselves.** On the first car all four wheel values read 65407 with
  the car standing, and they are no plain multiple of the car's speed. The app only ever uses ratios
  of the wheel values: rear over front for the rear wheelspin and for learning's check that the
  wheels grip, right over left for which way is left. Values in another form still give ratios, and
  steady ones at one speed. So with "Wheel speeds" on, no wheel value is used until all four have
  proven themselves:
  - a steady moment is one in which the speed is 30 km/h or more and has moved by less than 1 km/h
    over the last second, the car goes straight and no drift runs or may be beginning. In it the
    raw value over the speed is one ratio of that wheel, taken five times a second;
  - the ratios are kept per stretch of 10 km/h, and a stretch counts with 5 of them;
  - proven means: every wheel has stretches that count at speeds 20 km/h apart or more, and the
    middle ratio of each is within 3 % of the middle of them all.
- **Until then, and whenever that stops holding, the app has no wheels at all.** No rear wheelspin
  is shown, scored or saved, and nothing is learned from the wheels. The place of the figure says
  why: "wheel values not proven yet", "wheel values in an unknown form" or "no wheel values from the
  car" on the Drift tab, "wheels not proven" on the Last tab. The proof is made again at every start
  of the app. It needs two steady speeds on a straight, above 30 km/h and 20 km/h apart. On a skid
  pan that may never come: then there is no rear wheelspin.
- **The wheels raw, for a photo.** With "Wheel speeds" on, the Signals tab's second page shows for
  each wheel the raw value now, the lowest and the highest since the app started, and the raw value
  at the last steady speed above 30 km/h with that speed.
- **Old saved files.** A file saved by 1.0.0 still loads. Its pedal figures stay in the file and
  are not shown. A rear wheelspin figure saved by 1.0.0 is still shown for that old drift, proven or
  not, and what 1.0.0 learned from the wheels stays until "Reset what was learned". The first car's
  data was emptied by the platform, so no car is known to hold such a file.

## Starts and stops

New in 1.0.1, for the same reason as in Proven Drag: on the first car the app closed by itself, the
platform emptied its data folder with the log in it, and nothing was left to say how it had ended.

- **What is kept.** The last five lives of the app. A life is one start of its process. For each:
  its number, when it started, how long it lived, how it ended, which of the seven extras were on in
  it, and a last note. The note is refreshed every 2 seconds: memory now and the most, processor
  share now and the most, the longest hold-up of the app in the last 10 seconds and in the life,
  frames handed to the screen a second and whether the GPU renderer or software shows them, values
  from the car a second, the app's own reads answered and asked, what was showing, the app's state
  (learning, ready, in a drift, no data, demo data), and how far the set-up of the subscriptions had
  got.
- **Where it is shown.** The Signals tab's first page opens with the block "STARTS AND STOPS OF
  PROVEN DRIFT 1.0.1, NEWEST FIRST". It is always shown. One line per life, this life and the one
  before it on up to two lines, eight lines at most. Each line keeps its number, how the life ended
  and what was switched on. Of the last note as much is shown as the line has room for. The same
  lines go to the log in full at each start. And for the first minute after a start that follows a
  stop by itself, the Drift tab says "The app stopped by itself last time. Please photograph the
  Signals tab." The minute runs from when the page first shows.
- **What a line means.** A line of an earlier life reads, for example, "#4 25.11. 14:17:38 lived
  8 s, NO WORD (killed, crashed or power lost), Last note: memory 122 MB, ..., on: GPS". The words
  for the end:

  | On the screen | What it means |
  |---|---|
  | asked to stop by the car | The platform asked the app to stop, and the app heard it. A clean stop. The last note's memory and processor say whether a limit was near |
  | THE APP'S OWN ERROR (exit code 1): (the error's first line, with its file and line) | An error in the app's or the kit's JavaScript that nothing caught. The error is not swallowed: the kit still logs it and ends the app |
  | EXIT CODE N AND NO WORD BEFORE IT | The process ended itself some other way |
  | ENDED BY THE SIGNAL SIGTERM (sent from outside the app), or SIGHUP, SIGINT | Something outside the app ended it with that signal. Only with "Note stop signals" on |
  | asked to stop by the car (the signal SIGTERM came first) | A clean stop that began with a signal. Only with "Note stop signals" on |
  | NO WORD (killed, crashed or power lost) | None of the above was written. The process was killed outright, ended by a signal (as shipped the app listens for none), crashed in native code, or the power went. Nothing in JavaScript can tell these apart. The last note says what the app was doing up to 2 seconds before |
  | The saved data was emptied after #N | The platform emptied the app's data folder: it counted that end as unexpected |

  The line of this life says how it relates to the one before: "(started 0 s after #4's last
  note)", "(the head unit was restarted since #4)", or "(the record in RAM was gone, no restart
  since #4)". After a restart of the head unit the app does not say that it stopped by itself:
  switching the car off is not a crash.
- **Where it is kept.** In two small files.
  - `pps_drift_box.json` in the app's data folder. Written at the start, once more when the life is
    10 seconds old, at a clean stop, and at most once a minute, each only while no drift runs. It
    outlives a restart of the head unit. It is gone when the platform empties the data folder.
  - `/tmp/pps-box-pps_drift-<user id>/box.json`. `/tmp` is memory on the head unit: the kit keeps
    its drawn frames there. Written at the start, every 2 seconds, whenever a setting or a
    subscription changes, and at every kind of end the app hears of. It outlives the app's process
    and the platform's wipe of the data folder. It does not outlive a restart of the head unit.

  At a start both are read and the newer one is taken. Where a life is known from the data folder's
  copy alone, its line reads "lived at least 10 s (saved note, up to a minute old)".
- **What is not in it.** No position, no course and no heading: none ever reaches that file. It
  holds numbers the process knows about itself, words from fixed lists, names of groups of signals,
  and the first line of an error.
- **`/tmp` is everybody's.** The same care is taken as in Proven Drag: the folder is used only if
  it is a real folder of the app's own user, a file is read without following a link or waiting on a
  pipe, 64 KB at most, and every field is cleaned before it reaches a screen. If `/tmp` cannot be
  used, the first line says "(no record in RAM: data folder only)", and a wipe of the data folder
  then takes the record with it.
- **"Note stop signals".** As shipped the app listens for no signal, as 1.0.0 listened for none,
  and an end by a signal reads NO WORD. With the setting on, the record notes SIGTERM, SIGHUP and
  SIGINT, and the line lists "on: signals". The price is the one named under Proven Drag: while it
  is on, an app that is held up ends later than it would have, and one that hangs for good is not
  ended by the signal at all. When to switch it on: if a photo reads NO WORD and the last note
  beside it shows no high memory, processor or hold-up, switching it on for the next try tells a
  stop by a signal from a kill or a crash. A stop by itself puts it back to off.
- **Not known.** How the platform ends apps when the car is switched off. If it ends them without a
  word and `/tmp` outlives that, every first start of a day will say that the app stopped by itself.
  The line of this life says how long after the life before it started, so a night can be told from
  a crash. One photo after an ordinary switch-off would settle it.

## What is saved and what is logged

- **Saved** (`pps_drift.json` in the app's data folder): the four all-time bests, the last 30 drifts
  (the newest 5 with their trace of angle and speed), and what was learned about the car. A drift is
  kept as the figures the Last tab shows, with its date and time by the head unit's clock. A demo
  drift is never saved. The file is written a second after a drift has ended, and never while one
  runs. What was learned is also written when the car next stands, and every 20 seconds at most on
  the move (1.0.0: every two minutes). When the car asks the app to stop, the app writes the file
  once before it ends. If the file cannot be written, the Last, Best and Signals tabs say NOT SAVED.
- **The record of starts and stops**: `pps_drift_box.json` in the same folder and a second copy in
  `/tmp`. See "Starts and stops".
- **Logged** (`pps_drift.log` in the same folder), so that a car can be read afterwards: the lines
  of "Starts and stops" at each start, what is switched on in Workshop settings, the first 10 raw
  values of every source, how often each source sends, which signals the head unit does not have,
  what was learned and when, which source is in use, and one line for every drift with all its
  figures and the share of its time that the steering backed it. No pedal figure is in that line any
  more. **The log is in the data folder, so the platform empties it with that folder after an
  unexpected end.** No log came back from the first car.
- **Never saved and never logged: a position, a course or a heading.** The app's logic never sees
  one. The only place they pass is the GPS receiver's sentences, which the app only listens to with
  "GPS receiver" switched on. Of those the app reads two things: whether the fix is valid, and the
  speed. The log holds, for the first 10 sentences, which kinds of sentence came, how many passed
  their checksum, and that speed.
- **Nothing leaves the car.** The app has no network code. It shares and uploads nothing.

## What the GPS is used for

As shipped, for nothing: the GPS receiver is an extra, and the app only listens to it with "GPS
receiver" switched on (Workshop settings). With it on, for one cross-check, shown on the Signals
tab's second page, and for nothing else. The angle is worked out with the
car's speed, and nobody knows what speed a car reports while it is sideways: its true speed over the
ground, or the speed along its own length, which is smaller. The GPS receiver's speed is the true
one. So the app keeps the receiver's speed over the car's speed twice: while the car goes straight,
and while a drift runs at a held speed (the receiver's speed is about a second late, so a drift that
is slowing down says nothing). If the second figure is clearly above the first, the car reports the
speed along its length, and the angles the app shows are off. No angle and no score is changed by it.

## It only reads

Proven Drift only reads values the car already has. It sets no value, calls no method and does not
use the head unit's diagnostic link, so it sends no request to any control unit.

**As shipped it asks the car for six values, and for nothing else.** Each is asked for exactly as
apps of the kit ask for it:

| Value | The kit also reads it once when the car's service comes up | Asked for the same way by |
|---|---|---|
| `Vehicle2.statusCarSpeed2`, the speed | yes | 12 apps of the kit, Proven Gauges and Proven Warm-Up |
| `CDS2.statusLateralAccelerationMassCenter`, the sideways acceleration | yes | the kit's M Vitals, G-Force, Live Data, Engine Config (`apps/live_adjustments`) and Redline, and Proven Gauges |
| `CDS2.statusLongitudinalAccelerationMassCenter`, the forward acceleration | yes | eight apps of the kit, the same five among them, and Proven Gauges |
| `CDS2.statusYawVelocityVehicle`, the yaw rate | yes | the kit's Live Data and Engine Config |
| `SteeringAngle.ActualSteeringAngleDriver`, the steering wheel's angle | no | the kit's Live Data and Engine Config |
| `SteeringAngle.actualSteeringAngleDriverNoCRC`, the same angle under its second name | no | the kit's Live Data and Engine Config |

The speed and the two accelerations are known to arrive on the first car: Proven Gauges asks for
them the same way and runs there. Whether the kit's Live Data or Engine Config have run on that car
is not known, so the yaw rate and the steering wheel's angle have not been seen there.

As shipped the app builds three connections to the car (1.0.0 built twelve) and reads no value
itself, with its screen shown or hidden. The four reads the table marks are the kit's own. They are
how the app knows that a standing car stands: a standing car sends nothing. 1.0.0 had the kit read
ten values that way.

**Everything else is an extra behind a Workshop setting that is off as shipped**: the app's own
reads of the speed, the yaw rate and the accelerations ("Ask the car for values"), the GPS
receiver's sentences, which are one event ("GPS receiver"), the four wheel speeds, the other
steering and yaw sources, the accelerator pedal with the handbrake, and the study values. See
"Settings".

**It does nothing with DSC, traction control, the handbrake or any driving setting.** With "Car
estimate and analyser" on it reads the DSC button's state and shows it raw on the Signals tab, and
with "Pedal and handbrake" on it reads whether the handbrake is on. That is all. No text of the app
tells the driver to switch anything off.

The app's manifest still names twelve groups of signals, or the switches could not work. Two are
needed: the one with the car's speed, and the one with the yaw rate and the two accelerations. Ten
are optional: a second source of the yaw rate, two sources of the steering, the accelerator pedal,
the four wheel speeds, the handbrake, the DSC button, the car's own motion estimate, BMW's own drift
analyser of some M cars, and the GPS receiver's sentences. The app is built to work with less where
an optional one is missing, and its log then says what is missing and what that costs.

Three of those are **for study only**, and all three are in the extra "Car estimate and analyser":
the car's own motion estimate, the two results of BMW's own drift analyser, and the DSC button's
state. Nobody at Proven knows what they hold. With the extra on, the app shows them raw on the
Signals tab's second page and in the log, so that one photo tells what they are. They enter no angle
and no score. Of BMW's drift analyser the app asks for its two result values only.

**What works differently without reads of its own.** As shipped the app is on the speed the car
sends, where silence means "no change". So:

- A speed that goes silent is not noticed: the last speed stands.
- If the kit's one first read of the speed gives nothing, a standing car reads "--" and NO DATA
  FROM THE CAR until it moves.
- A yaw rate and a sideways acceleration that stop arriving are noticed after 2.5 seconds while a
  drift runs or may be beginning: the drift ends, flagged DATA GAP. On a straight they are not
  noticed: a sensor that has died and one whose value holds still look alike, the banner stays
  READY, and a drift driven then is not counted. With "Ask the car for values" on it is noticed on
  a straight within about 3 seconds, as in 1.0.0.
- A car that does not send its yaw rate, its accelerations or its speed by itself needs "Ask the
  car for values". As shipped nothing is learned on such a car.

**If 1.0.1 as shipped still closes, the cause is in what is left.** What it still does that Proven
Gauges and Proven Warm-Up do not: the subscription to the yaw rate, with the kit's own first read
of it. The connection to the steering angle, with its two subscriptions. A manifest that names
twelve groups of signals. The Drift tab, which is another picture about nine times a second while
the car moves, as in 1.0.0. The app's own 50 ms timer and a 100 ms timer that measures hold-ups.
And the record's file writes: to `/tmp` every 2 seconds, and to the data folder at the start, at 10
seconds and at most once a minute.

# How this source is set up

The apps are written for the open-source **idrive7-apps kit**
(https://github.com/cauliflowermossgrape/idrive7-apps, MIT), as of 16 Nov 2026 (commit 422957a). This
repository is a copy of that kit with the four Proven apps added, and with the kit's five text
atlases made again from another font (see "The font"). The kit's own README, at the top level of this
repository, is the reference for building apps.

- `mgu-repo.json` lists the four apps by name under `"components"`, so the Store offers only those
  four. The kit's other apps are here as source and are not offered from this source.
- The head unit builds each app from source against the app SDK it already has, so BMW's app SDK is not
  in this repository.
- Not in this copy of the kit: its screenshots and animations (`docs/media`, `docs/screens`), its
  `.github` folder, and the fault-text database for its Fault Scanner with the full translation files
  and the import tool made for it. Built from this copy, the kit's Fault Scanner has no fault texts, and
  its Russian and Chinese builds fail.
- `proven/tools/` holds the generators of the four `app.json` files (they are not edited by hand) and
  the tests. `fakecar.js` and `warmup_bench.js` are the stand-in cars the tests run Gauges and Warm-Up
  on. For Proven Drag, `dragsim.js` is a run with known answers and `fakedrag.js` is the stand-in car
  and head unit. For Proven Drift, `driftsim.js` is a made-up car whose true drift angle is known and
  `fakedrift.js` is the stand-in car and head unit. `test_drag_life_host.js` is not a test by itself:
  it is one start of the built app for `test_drag_life.js`. `bake_proven_fonts.py` makes the text
  atlases. `textfit.js` holds the rules for where a text may stand, for `test_fonts.js`,
  `test_drag_car.js` and `test_drift_car.js`.

## The font

The head unit cannot draw a font for an app. The kit draws text from five prepared files, the atlases
in `kit/runtime/fonts` (`label`, `bold`, `num`, `light`, `gear`). In this copy they are baked from
Rajdhani by `proven/tools/bake_proven_fonts.py`, and all four apps, like every app built from this
copy, draw with them. The kit's other apps are not offered from this source, and their screens were
not checked with this font. `kit/tools/bake_fonts.py`, which the kit's README names, would put the
Ubuntu atlases back. The kit's separate atlases for Chinese, Korean and Cyrillic text did not change.

To bake the font again you need Python 3 with Pillow (11.3.0 was used) and the Rajdhani files
`Rajdhani-Regular.ttf`, `-Medium.ttf`, `-SemiBold.ttf` and `-Bold.ttf` from
https://github.com/google/fonts/tree/main/ofl/rajdhani. They are not in this repository. The tool also
reads the kit's original Ubuntu atlases, for the eleven characters of the kit's set that Rajdhani
does not have (see "Licence and credits"). It must not be given the files it is about to write, so
take the originals out of commit bad68cb first:

```
mkdir ubuntu-atlases
for f in label bold num light gear; do git show bad68cb:kit/runtime/fonts/$f.json > ubuntu-atlases/$f.json; done
python3 proven/tools/bake_proven_fonts.py <folder with the .ttf files> ubuntu-atlases kit/runtime/fonts
```

How large each family is drawn is set by five factors at the top of the tool. Two more settings are
there: every digit in the same room, and the degree sign drawn 1.4 times as large. Run twice, the tool
writes the same files. After a bake, build the four apps and run every test below.
[CHANGES-font.md](CHANGES-font.md) has the factors and what they do.

## Look at them on a PC (no car, no SDK)

Needs Python 3 and Node.js 14 or newer. The Proven Drag and Proven Drift commands and `test_fonts.js`
were run on Node.js 24 only, on a Mac. The two lines that begin with `PPS_BOX_TMP=` are written for
a shell that takes a variable in front of a command (sh, bash, zsh). In another shell, set
`PPS_BOX_TMP` to a folder of your own first.

```
python3 kit/tools/build.py --preview-only pps_gauges
node kit/tools/preview.js dist/pps_gauges preview-gauges render wait=9 render --set page=street
node proven/tools/test_vitals.js dist/pps_gauges
node proven/tools/test_engine_unit.js dist/pps_gauges
node proven/tools/test_ethanol.js dist/pps_gauges
node proven/tools/test_mhdflex.js dist/pps_gauges
node proven/tools/test_screens.js dist/pps_gauges pictures-gauges
node proven/tools/test_fonts.js dist/pps_gauges pictures-gauges-sizes

python3 kit/tools/build.py --preview-only pps_warmup
node kit/tools/preview.js dist/pps_warmup preview-warmup wait=8 render wait=45 render
node proven/tools/test_warmup.js dist/pps_warmup
node proven/tools/test_fonts.js dist/pps_warmup pictures-warmup-sizes

python3 kit/tools/build.py --preview-only pps_drag
PPS_BOX_TMP=preview-drag node kit/tools/preview.js dist/pps_drag preview-drag render wait=2 render wait=4 render wait=12 render BTN_PAGE BTN_PAGE BTN_PAGE BTN_PAGE
node proven/tools/test_drag.js dist/pps_drag
node proven/tools/test_drag_car.js dist/pps_drag pictures-drag
node proven/tools/test_drag_native.js dist/pps_drag
node proven/tools/test_drag_life.js dist/pps_drag
node proven/tools/test_fonts.js dist/pps_drag

python3 kit/tools/build.py --preview-only pps_drift
PPS_BOX_TMP=preview-drift node kit/tools/preview.js dist/pps_drift preview-drift render wait=3.2 render wait=3 render wait=4.5 render wait=5 render wait=12.5 render BTN_PAGE BTN_PAGE BTN_PAGE BTN_PAGE BTN_PAGE
node proven/tools/test_drift.js dist/pps_drift
node proven/tools/test_drift_car.js dist/pps_drift pictures-drift
node proven/tools/test_drift_native.js dist/pps_drift
node proven/tools/test_drift_box.js dist/pps_drift
node proven/tools/test_drift_real.js dist/pps_drift
```

The checks as they stand (26 Nov 2026): Gauges 133, 121, 55, 128, 50 and 44 in the order above
(531), Warm-Up 350 and 94 (444), Proven Drag 473, 457, 27, 38 and 14 (1009), Proven Drift 306, 608,
27, 69 and 44 (1054). Each file ends with its count and "ALL OK". `test_drag_native.js` and
`test_drag_life.js` are new with Proven Drag 1.0.2. `test_drift_native.js`, `test_drift_box.js` and
`test_drift_real.js` are new with Proven Drift 1.0.1. `test_drag_life.js` and `test_drift_real.js`
run in real time and take two to three minutes each.

**`PPS_BOX_TMP` and the preview.** Proven Drag and Proven Drift keep one copy of their record of
starts and stops in `/tmp`, as on the head unit. Run on a PC without `PPS_BOX_TMP`, the preview
writes that record to the PC's own `/tmp`. With `PPS_BOX_TMP` set to a folder, here the preview's
own output folder, it goes there. The tests keep the record in folders of their own. A second
preview into the same folder finds the record of the first and lists it under "Starts and stops",
as a life that ended with exit code 0 (Proven Drag's words are "ended with exit code 0", Proven
Drift's "exit code 0"): that is how the preview itself ends.

`preview.js` writes PNGs of what the app draws from its demo drive (it switches demo data on). Gauges
shows its start-up logo first, so the early pictures are the logo and the last one is the gauge set;
`page` can be street, track, boost, thermal or tyres. Warm-Up's demo is a whole warm-up from cold in
about 50 seconds; it shows no time figure, because that needs a minute of measuring. `test_screens.js`
with a folder as its second argument saves a picture of every state it draws, including ones the demo
drive never shows (a car that sends nothing, a unit that does not answer, the ethanol strip).
`test_warmup.js` runs `test_warmup_car.js` as its last part. `test_fonts.js` checks the font and where
every text stands, one app per run. With a folder it saves each state at the PC's size and as it is
drawn for iDrive 7 and iDrive 8 (`-id7.png`, `-id8.png`). `test_drag_car.js` saves those two sizes
too with `sizes` as its third argument. The kit's live emulator
(`node kit/tools/emu.js pps_gauges`, kit README section 6.4) shows an app moving, but it runs the full
build, which needs BMW's app SDK from your own head unit (kit README section 3.1).

Proven Drag's demo is one made-up launch. Its nine pictures are, in order: the first frame, the
start-up logo, the Run tab at READY, while TIMING and at RUN FINISHED, then the Timeslip, the Best
tab and the two pages of the Signals tab. The fourth press of Next page in the command is for the
second Signals page. No car answers in the preview, so its Signals tab says "not answering" for the
two sources that are on and "switched off" for the other nine. The five test files:

- `test_drag.js` tests the timing logic alone and the record of starts and stops alone, and prints
  its error tables.
- `test_drag_car.js` runs the built app on the stand-in car, as shipped and with every extra
  switched on. With a folder as its second argument it saves a picture of every state it draws (320
  pictures), among them the Signals pages with data.
- `test_drag_native.js` counts what the app and the kit ask of the head unit's native binding. The
  built app runs under the kit's real signals code, on a stand-in for the binding.
- `test_drag_life.js` runs the built app on the kit's real runtime, each start a process of its own,
  with stand-ins for BMW's software only. It ends those processes the ways a process can end: asked
  to stop, an error of the app's own, a kill, a signal. It empties the data folder as the platform
  does. Then it reads what the next start says about each on the Signals tab.
- `test_fonts.js` checks the font's atlases in the built app, and the header and the list of
  settings as the kit draws them for this app.

`test_drag_native.js` and `test_drag_life.js` copy the built app with `fs.cpSync`, which Node.js 14
does not have. `apps/pps_drag/app.json` is written by
`python3 proven/tools/make_drag_appjson.py .` and is not edited by hand.

Proven Drift's demo is a made-up drive of 34 seconds that goes round again: a drift to the left that
switches to the right, a straight, a drift to the right. Its twelve pictures are, in order: the first
frame (the Drift tab before anything has arrived), the first screen (CLOSED COURSE ONLY), the Drift
tab at READY, in a DRIFT, after the SWITCH, at DRIFT ENDED and after the second drift, then the Last,
Session and Best tabs and the two pages of the Signals tab. The fifth press of Next page in the
command is for the second Signals page. Every demo drift carries the DEMO flag, so the Best tab
shows no best. No car answers in the preview, so its Signals tab says "not answering" for the six
core sources and "switched off" for the others (the DSC button's row says "not read"). The five
test files:

- `test_drift.js` tests the engine alone and prints its error tables. It takes about 30 seconds.
  Without an argument it runs on `apps/pps_drift`, with no build.
- `test_drift_car.js` runs the built app on the stand-in car, as shipped and with every extra
  switched on. It takes about a minute. With a folder as its second argument it saves a picture of
  every state it draws (417 pictures), among them the Signals pages with data, and with `sizes` as
  its third argument each state as it is drawn for iDrive 7 and iDrive 8 too.
- `test_drift_native.js` counts, call by call, what the app and the kit ask of the head unit's
  native binding. The built app runs under the kit's real signals code, on a stand-in for the
  binding. It writes a folder `someipInterfaces` into `dist/pps_drift`: build again for a clean
  copy of the built app.
- `test_drift_box.js` tests the record of starts and stops on its own: what it writes and where,
  what it makes of what it finds at a start, and what it does with a file it did not write.
- `test_drift_real.js` runs the built app on the kit's real runtime, fourteen starts, each a process
  of its own, with stand-ins for BMW's software only. It ends them the ways a process can end and
  checks what the next start then shows on the Signals tab.

`test_fonts.js` does not know Proven Drift: the header and the list of settings the kit draws for
it are checked in `test_drift_car.js`. `apps/pps_drift/app.json` is written by
`python3 proven/tools/make_drift_appjson.py .` and is not edited by hand, and
`apps/pps_drift/icon.png` by
`node proven/tools/make_drift_icon.js apps/pps_gauges/icon.png apps/pps_drift/icon.png`.

None of these tests can show what a real head unit does. The stand-ins for BMW's software and for
the native binding do what the tests tell them, and Node.js on a PC is not the head unit's
Node.js 8.

# What has and has not been tested

This section has four parts. Proven Gauges and Proven Warm-Up have been installed and run on a car.
Proven Drag 1.0.1 and Proven Drift 1.0.0 were installed on one car and ran there, and closed by
themselves: the second part says what that car showed. Proven Drag 1.0.2 and Proven Drift 1.0.1
have not been on a car. Each was checked on a PC only, and their parts come third and fourth.

## Proven Gauges and Proven Warm-Up

Everything in this part is about these two apps. Where it says "the apps" or "both apps", it means
these two and not Proven Drag or Proven Drift.

On a car (reported 23 Nov 2026): Proven installed Gauges and Warm-Up on a car from this source through the
MGU Store and used both. The workshop's report is that both work, so two things are no longer open: the
Store builds and installs these two apps from this source, and they run on a car. The source had offered Gauges
1.1.0 and Warm-Up 1.3.0 since that morning; which version numbers the Store showed on the car is not
recorded.
What else that use covered is not recorded here either: which car and head unit, which screens and
states, and whether any reading was compared with another tool. That car has no flex-fuel sensor, so the
ethanol read-out stayed off. So every point under "Still open" below
stays open. Versions 1.1.1 and 1.3.1 are the same code as 1.1.0 and 1.3.0, with BETA taken off the
description. Versions 1.1.2 and 1.3.2 have the new font and, in Gauges, the wider Speed panel on the
Track set. They have not been on a car.

Tested on a PC (Node.js 24, all checks passed). The checks were run on 1.1.2 and 1.3.2 on
24 Nov 2026, with the new font. The other points below are from 1.1.0 and 1.3.0, whose code is the
same but for the font and that one panel:

- **Gauges 1.1.2, 531 checks in six files.** `test_vitals.js` (133): the data layer with raw values as
  the car sends them, "no value" markers, units, peaks, power. `test_engine_unit.js` (121): simulated
  engine and gearbox units that answer, refuse, keep quiet, sleep and wake. `test_ethanol.js` (55) and
  `test_mhdflex.js` (128): the ethanol read-out against simulated engine units, including which requests
  can leave the head unit, how often, and when none does. With the ethanol setting on anything but MHD
  flex, the app sends the same requests at the same moments as it did before that choice was added
  (48,522 calls to the car's diagnostic link compared over nineteen simulated scenarios). `test_screens.js` (50): all five sets drawn with the app's
  own main.js in states the demo never shows, checking that every letter has a glyph at the PC, iDrive 7
  and iDrive 8 text sizes and that no two texts overlap or leave the screen. `test_fonts.js` (44): the
  new font. The five atlases in the built app, with every digit in the same room, every text as
  wide from each atlas, a degree sign large enough to show, and each atlas saying what it was made
  from. The five sets in 15
  states of the car, with every figure at its widest among them, each drawn at the PC, iDrive 7 and
  iDrive 8 text sizes: no text lies on another, leaves the page or crosses the edge of its panel. The
  header and the list of settings as the kit draws them.
- **Warm-Up 1.3.2, 444 checks in three files.** `test_warmup.js`: the decision (cold start to ready, the
  holds, dips, the gearbox left out or on its last reading, too hot, no readings, the time to ready, the
  presets as shipped). `test_warmup_car.js` (161 of the 350): the built app on a stand-in car, reading
  the status line, the rows, the widget's lines and every request sent to the gearbox unit, through
  switch-off, start-stop, a locked car, a manual car, refusals and a clock set back. `test_fonts.js`
  (94): the new font. The screen in 20 states, as bars and as dials, in deg C and deg F, at the same
  text sizes and by the same rules as for Gauges, with the picture of the widget each time.
- Each fix was shown to fail on the version before it: the same tests run against the published 1.2.1 and
  1.0.3 fail at least one check for every fault listed in the two CHANGES files.
- The Warm-Up decision was also put through about 16 million random sequences of readings with its rules
  checked after each, without a rule broken. That script is not in this repository.
- Both apps were built with the kit's build step, their demo drives drawn with `preview.js` without an
  error, and every app file parsed at the JavaScript level the head unit runs (Node.js 8).

Every engine unit, gearbox unit and car in those tests is a stand-in written from the kit's notes and
the Flex Fuel app's notes. The tests show what the apps do with such answers and what they send; they do
not show what a real car answers.

Checked on earlier versions only (1.2.x and 1.0.x, with the font before), not repeated on these:

- every gauge set and the Warm-Up screen and Settings in the kit's live emulator, which runs the car's
  own draw engine (the full-screen layout at 1920 x 720, tabs, Settings, Reset peaks on the page)
- the kit's build step producing both the iDrive 7 and the iDrive 8 screen description, and both apps
  placed with the kit's iDrive 8 screen figures (app area 2880 x 764 above the climate bar) without
  errors. The kit itself marks those figures "not measured on a car yet"

Still open:

- **the new font on a car.** No use of these two apps with it on a car is recorded. Proven Drag
  1.0.1 and Proven Drift 1.0.0 draw with it, and they ran on one car (25 Nov 2026). Nothing is
  recorded of how their text read there, and whether that car drew them with the GPU renderer or in
  software is not known. So how the text reads at arm's length on the real screen is not known. The
  digits of the big figures are about a fifth lower than in the font before.
  [CHANGES-font.md](CHANGES-font.md), part 6, has the list.
- **anything not named above as done on the car.** Which gauge sets, settings, states and warnings were
  seen on the first car is not recorded, so each of them counts as checked on a PC only.
- **the readings against a second tool.** No comparison from a car is recorded here. Compare every
  reading with a tool you trust (the dealer tool, a logger) before relying on it.
- **the ethanol read-out.** None of its three choices has been switched on in a car: the first car has
  no flex-fuel sensor. For the MHD
  flex choice in particular: whether the head unit reaches the engine unit on the car, whether another MHD or program
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
- **the screen texts on a head unit.** All of them were drawn on a PC with the kit's software drawing
  code and fitted their places. The apps have been used on a car, with the font before, but which
  texts and states were seen there is not recorded. In the new font no text of these two apps is
  recorded as seen on a head unit. Count these as not yet seen there in either font: the warnings,
  "not answering", and the small widget's text lines, which the head unit draws itself.
- the timing of Warm-Up's full-screen announcement (15 seconds, once in 10 minutes), the guarded timers,
  and Gauges' Thermal line and start-up logo timing are not covered by a test that ships here.
- **the home-screen widget after a head-unit restart, without opening the app.** If the widget stays
  empty until the app is opened, the app needs a change (and one in the kit) before the widget can be
  promised "without opening the app".
- whether each car gives an engine oil temperature on the signal Warm-Up reads. Where it gives none,
  Warm-Up stays on "Warming up".
- **which head unit the apps have run on.** Whether the first car has iDrive 7 or iDrive 8 is not
  recorded here, so neither is confirmed on a car. For iDrive 8 the PC evidence is only the build step
  and the placement figures above.

## What the first car showed (25 Nov 2026)

One car with the curved display (iDrive 8 screens). Its owner installed Proven Drag 1.0.1 and Proven
Drift 1.0.0 on it from this source, through the MGU Store. What is known of that comes from the
owner's words and from ten phone photos of Proven Drag's screens. There is no photo of Proven Drift.
There is no log: the log is in the app's data folder, and the platform emptied that folder. Nobody
could attach a tool to the car. It is the first car these two apps were on, and it is one car.

What happened:

- **The Store built and installed both apps, and both ran.** So for those two versions, on that
  car, the install is no longer open.
- **Both apps closed by themselves**, "generally within 30 seconds, randomly", and after the second
  time the app could not be opened again. That is what the kit's README (section 4.3) says the
  platform does with an app that ends unexpectedly: the first time it empties the app's data folder,
  the second time it removes the app. So these were unexpected ends of the app's process, not stops
  the platform asked for. One life of Proven Drag was at least 191 seconds old when it was
  photographed, so the ends do not come at a fixed time after the start.
- **Proven Gauges and Proven Warm-Up ran on the same car without trouble.**
- **Why the two apps closed is not known.** Seven separate looks on a PC found nothing in either
  app's own JavaScript that throws out of the app, hangs it or grows without bound. What only these
  two apps did to the car, and the two working ones do not: reads of values on a fast schedule of
  their own, the GPS receiver's event, the wheel speeds, and in Proven Drift several chassis values
  that no app of the kit reads. None of these is proven to be the cause. What is left cannot be seen
  on a PC: the head unit's native binding, the platform's limits, the drawing on the head unit.

What that car's screens showed of its signals, read off Proven Drag's Signals tab:

- **The speed** is sent 47 to 50 times a second while it changes, and not while it is constant.
  Every run in the photos was timed from the speed the car sent. The app's own reads of the speed,
  20 a second, were answered and added nothing on this car.
- **The forward acceleration** arrives 10 times a second.
- **The GPS receiver** reports once a second, with about 38 sentences each time and 12 satellites.
  The speed scale was learned in about five minutes: x0.988. So that car's speed signal reads 1.2 %
  above its GPS speed.
- **The wheel speeds are not decoded right.** All four read 65407 with the car standing, and the
  factors never settled: their ratios spread by 98 to 274 %. The wheelspin figure on those screens
  was the estimate from the acceleration, not from the wheels.
- **Four of six gentle pull-aways carried DATA GAP.**

What else is known from the owner's words:

- **One run was set beside a GPS drag timer.** CHANGES-drag.md, part 11, has the figures. That run
  was almost certainly timed UNCALIBRATED, because the speed scale was learned later. One run says
  little. It is not a measure of how exact the app is, and nothing in this release changes how a
  time is worked out.
- **Proven Drift's accelerator figure was "jumping about".** Only Proven Drift showed the pedal.
- **Proven Drift's steering**: "is calibrating from 20 min of normal driving". The sentence reads
  both ways: it did learn, or it was still not learned.

What that car did not show: any screen of Proven Drift, its yaw rate and its steering angle, whether
it draws the apps with the GPU renderer or in software, and how it ends an app when the car is
switched off. And nothing of versions 1.0.2 and 1.0.1.

## Proven Drag 1.0.2: on a PC only

**Nothing in this part was done on a car.** Version 1.0.1 ran on one car: the part above says what
is known of that. Version 1.0.2 has not been installed or run on a car or on a head unit. Everything
below ran on a PC (a Mac, Node.js 24), and every car in it is made up. The figures say what the
app's arithmetic does with the samples a made-up car sends. They do not say what a car sends, and
they are not a statement of how exact the app is on a car.

The figures below speak of a speed that is "sent" by the car and of one that is "asked for" by the
app. As shipped, 1.0.2 does not ask. Every figure for a speed that is asked for holds only with "Ask
the car for values" switched on.

Tested on a PC (26 November 2026, all checks passed):

- **1009 checks in five files** (1.0.1: 734 in three). `test_drag.js` (473): the timing logic alone
  against runs with known answers (`dragsim.js`). It covers the launch instant, every split and trap
  speed, the three clock starts and mph, the ± figure, holes, lone wrong samples, samples stamped
  late, readings that are too high for a moment, clean launches of quick cars, the choice between
  the two ways the speed arrives, the speed scale from GPS speed and from positions, wheel factors
  and wheelspin, and the start slope. New in 1.0.2: DATA GAP on a car that sends its speed only when
  it changes, wheel values that are no plain multiple of the speed, and the record of starts and
  stops on its own, with files it did not write. Two of its checks say NOT SOLVED: they pin the
  figures of cases that are known and left open (see the list below). `test_drag_car.js` (457): the
  built app on a stand-in car and head unit (`fakedrag.js`). It covers a car that only sends its
  speed, one that only answers when asked and one that does both; every optional group of signals
  missing in turn and all together; values that are nonsense; a downhill start; the saved file read
  back, damaged, from a newer version and not writable; demo runs never saved; and the head unit's
  clock set back in the middle of a run. Those parts now start the app with every extra switched
  on, because what they test is behind the extras. The parts that are new in 1.0.2 start it as
  shipped: the two subscriptions and nothing else, a car like the first one timed from what it sends
  alone, each extra switched on and off, the wheel values of a car like the first one, the record on
  the Signals tab and the line on the Run tab, and DATA GAP. One check there says NOT SOLVED: a
  gentle pull-away that then holds one speed to the last count is ended after 3 seconds.
  `test_drag_native.js` (27, new): what the app and the kit ask of the head unit's native binding,
  counted at a stand-in for it. `test_drag_life.js` (38, new): real processes of the built app on
  the kit's real runtime, ended in every way a process can end, and what the next start says of
  each. `test_fonts.js` (14): the font's atlases in the built app, and the header and the list of
  settings as the kit draws them for this app, 16 settings now.
- **Can the new tests fail.** Run on the published 1.0.1, 16 of the 22 checks `test_drag_native.js`
  had at first fail, and 9 of the 10 that `test_drag_life.js` gets to. The repairs that followed
  each have a check that failed on the build before them. CHANGES-drag.md, parts 11 to 14, lists
  every check that was changed on purpose.
- **A made-up car like the first one.** Its speed has a send slot every 21 ms, each sample is 12 to
  18 ms on its way, and nothing is sent while the speed is constant. As shipped, six full-throttle
  runs to the 1/4 mile of three made-up cars were all timed from the speed sent, and none carried a
  flag. Gentle runs on that car are in "DATA GAP on a car that sends its speed only when it
  changes". That is arithmetic on made-up samples, as everything here.
- **The made-up cars.** The error tables of `test_drag.js` use 240 cars that do 0-100 km/h in 3.8 to
  9.6 s, with the acceleration building up over 0 to 0.3 s and 2 to 4 gear changes each. Each is
  launched at a random moment between two samples. Their speed signal reads every speed from 0 up, is
  not smoothed, and reaches the app on time.
- **Timing error on that model.** The error is the app's time less the model's own true time, with the
  "Slip" clock start:

  | Time between two samples | 0-100 km/h, mean error (sign left out) | 0-100 km/h, worst run | Distance splits, worst run | Trap speed, worst run |
  |---|---|---|---|---|
  | 20 ms | 0.4 ms | 2.3 ms | 0.2 ms | 0.00 km/h |
  | 50 ms | 0.6 ms | 9.1 ms | 0.7 ms | 0.01 km/h |
  | 100 ms | 2.0 ms | 32.3 ms | 2.4 ms | 0.03 km/h |
  | 200 ms | 8.8 ms | 131.7 ms | 10.0 ms | 0.09 km/h |

  The error was inside the ± shown in every one of those runs. The worst runs from 50 ms up are cars
  that change gear right at 100 km/h. On the first reviewer's own model (five made-up cars, 300
  launches each, run again on the final build), with the speed sent every 20, 50, 100 and 200 ms, the
  0-100 km/h was off by 0.4, 0.5, 1.2 and 6.4 ms on average and by 2.2, 2.2, 20.2 and 54.2 ms in the
  worst run. With the speed asked for every 50 ms and answered after 25 ± 10 ms it was off by 7.7 ms on
  average and 40.5 ms in the worst run. In none of those runs was the error beyond the ±. That
  reviewer's three made-up cars that change gear right at 100 km/h read the 0-100 km/h long by 36 to
  54 ms on average and by up to 170 ms, and by up to 191 ms with the speed asked for. The ± covered
  that in every run where the speed was sent. Where it was asked for, 3.6 % of the runs were beyond
  their ± on the reviewer's set-up.
- **Samples that arrive late.** With every sample 80 ms late, no split moved. With every sample late
  by 0 to 5 ms at random, the worst split was off by 0.006 s at 20 ms between samples, 0.011 s at
  50 ms and 0.022 s at 100 ms.
- **The app held up.** Hold-ups of 40 to 300 ms were put in at five places in a run and at the launch
  itself, on two made-up cars whose speed is sent every 50 or 100 ms. All 4,800 runs reached the
  1/4 mile and no split was off by more than its ±. A wider probe written for that fix, which is not in
  this repository, left 43 of 302,400 results beyond their ±, the worst by 20 ms, all after a hold-up
  at the launch or just after it. Those figures are for a speed that is sent. Where the speed is asked
  for, an answer that was on its way during the hold-up comes back late. With hold-ups of 150 to
  300 ms around the launch on three made-up cars, all 600 runs reached the 1/4 mile and no split was
  beyond its ±, with the speed asked for alone and with both ways together. The ± is wide there: 0.09
  to 0.14 s on the 0-100 km/h on average. Other made-up cars and longer hold-ups do lose launches: see
  the list below.
- **A reading that is too high for a moment.** A speed that reads 10 km/h too high for one or two
  samples from 93 km/h on, right after a sample that was stamped late or after a hold-up of 150 or
  300 ms, with the speed sent every 20, 50 or 100 ms: none of 360 launches showed a 0-100 km/h beyond
  its ±. In those launches a lone wrong sample was dropped, or it ended the run, and two in a row
  ended the run, with the flag SPEED JUMP and no 0-100 km/h. That does not hold in every case. On
  one of those cars, with the speed sent every 20, 50 or 100 ms: where the first wrong sample was
  itself stamped late, a reading 6 km/h too high for 0.22 s made up a 0-100 km/h in 40 of 60
  launches, and one of 10 km/h in 20 of 60. Where the wrong reading began while the app was held up
  for 0.15 s, 45 and 36 of 60 did. With the speed asked for and answered after 25 ± 10 ms, a reading
  6 km/h too high for 0.22 s made up a 0-100 km/h in 50 of 120 launches. The list below says why.
- **Clean launches of quick cars.** Two made-up cars that launch at 1.2 and 1.5 g and pull hard again
  after each gear change, timed from the speed asked for alone, with answers that take 40 or 60 ms:
  all 600 launches reached the 1/4 mile. Two that launch at 1.5 and 1.7 g, timed from the speed sent
  alone, every 20 ms with each stamp up to 15 ms late or every 10 ms with each stamp up to 8 ms late:
  all 1,800 did. The build before this one ended 8 of the 600 with SPEED JUMP right after a gear
  change and lost 14 of the 1,800. With later stamps or more time between samples, launches of such
  cars are lost: see the list below.
- **Flags on clean data.** A probe of the final checker, not in this repository, ran 200 clean
  launches of each of 15 made-up cars for seven ways a car might send its speed. No run ended on a
  jump, had a hole of 0.3 s or repeated a value for a second. SERIES DISAGREE came up in 4 of 3,000
  launches where an answer took 60 ± 20 ms, and in none of the other 18,000.
- **The speed scale**, with the GPS extras switched on. On the stand-in car, a car that reads 3 %
  high at a steady speed gave no factor after 50 seconds and the factor 0.9700 after 70 seconds.
  From positions alone, three straight kilometres at a steady 100 km/h on a car that reads 3 % low
  gave 1.0299.
- **Read only.** In all 140 starts of the app in `test_drag_car.js`, with 18,369 calls to the
  stand-in car's signals, nothing left the app but subscriptions and, in the starts with the extras
  on, reads of the two values and the one event subscription. The app's own files hold no call that
  sets a value or calls a method, and load nothing of the kit's diagnostics.
- **What is asked as shipped.** At the stand-in for the native binding, over a drive of 521
  seconds: two connections built, two values subscribed, and two reads, both the kit's own. No
  write, no method call, and no connection shut down. See "It only reads".
- **No position.** The stand-in cars sent 29,998 positions. In the 10,375 log lines and 407 files
  the app wrote, the record of starts and stops among them, not one number is a latitude or
  longitude a car sent, in degrees, in the receiver's form or raw. The same search does find a
  position that is put there on purpose. One drive is also searched for the car's course and
  heading, and neither is found.
- **The screens.** 960 frames in 92 states were drawn with the kit's software drawing code at the PC,
  iDrive 7 and iDrive 8 text sizes, checking that every letter has a glyph and that no text lies on
  another, leaves the page or crosses the edge of the panel it stands in. Some of the pictures were
  looked at by eye, the rest by those rules only.
- **The level of JavaScript.** All 17 files of the app parse at the level the head unit runs
  (Node.js 8). They were not run on Node.js 8.
- **The signals asked for.** The built app of 1.0.1 was held against the signal list of one iDrive 7
  head unit, which is not in this repository. That unit has all seven groups and every signal the
  app asks for. It is one car. That check was not made again for 1.0.2: its manifest names the same
  groups and the same signals, and asks the kit to read fewer of them.
- The app was built with the kit's offline preview build, which is not installable. Proven Gauges
  and Proven Warm-Up build to the same files as before this release, and their checks were run
  again in the same copy and pass (531 and 444).

Before the first car, for 1.0.0: two independent reviews and four rounds of checks after them, all
on a PC:

- Two reviewers each wrote their own made-up cars and probes, one for the numbers and one for the car
  side and the words. Both said "fix first". Together they found 4 points that had to be fixed and 15
  that should be. Among them: the launch was placed late where a speed signal reads 0 under 0.5 km/h,
  so times read short by more than their ±; a hole in the speed data was read as "the speed stood
  still"; two wrong high samples in a row made up a 0-100 km/h time; a GPS factor 1 % off was
  accepted; the data rate on the Run tab was the rate the app asked for, not what arrived; a speed
  that had stopped arriving still read READY; the direction of travel was written to the log and a
  height above sea level was saved; and nothing on a screen said BETA.
- All 19 were fixed, each with a check that fails on the code before it: run against the reviewed
  build, the two test files of that stage failed 50 and 44 checks.
- A third checker then ran the reviewers' probes and their own against the result. They found the 19
  closed and four new points. One was damage done by a fix: a sample stamped late ended a clean run.
  Those were fixed too, and the two test files of that stage failed 22 and 13 checks on the build
  before that.
- Two more checks were then made of that result, one of the numbers and one of the car side and the
  words. They found that fix had opened a new gap: a reading 5 to 40 km/h too high was taken for real
  when it came right after a sample stamped late or after a hold-up, and a 0-100 km/h was made up from
  it. They also found that a hold-up of 0.15 s or more at the launch put the times of a run timed from
  the speed asked for up to 0.1 s off with a ± that did not show it, and that the Run tab could time a
  launch without the closed-roads line having shown. Those were fixed, and the two test files of that
  stage failed 10 and 4 checks on the build before that.
- Two more checks were then made of those fixes. They found two of the new rules throwing away clean
  launches of quick made-up cars. One did it where the speed is only asked for and an answer takes 30
  ms or more. On the very quickest made-up cars it did so with 25 ms too. That rule was taken out
  again, which leaves open what it was for: where the speed is asked for, a reading up to about 7 km/h
  too high passes for real, and more where an answer takes longer. The other did it where the speed is
  only sent, every 20 ms or faster, with stamps that are late. It got a floor of 20 ms. They also
  found limits that these notes did not state: those are in the list below now. `test_drag.js` as it
  is now fails 5 checks on the build before that.
- A last check was then made of those changes. It found no new fault in the timing code. It found one
  sentence in these notes that understated how many clean launches are lost where every sample is
  stamped late. That sentence and three smaller ones were corrected. No code was changed after it.
- The full account is in [CHANGES-drag.md](CHANGES-drag.md), parts 7 to 10.

After the first car, for 1.0.2, all on a PC:

- Two independent checks were made of the first build of 1.0.2. Both said: good after the repairs
  they listed. Most of those were in the record of starts and stops: it could say the wrong thing
  for up to 2 seconds after a switch, after a power loss, and for a file planted in `/tmp`. Each was
  first made to happen on that build, then repaired, with a check that failed on it.
- One more independent read of the repaired build found two things the repair had added that cost
  more than they gave. A gentler rule for DATA GAP let a lost second pass as clean, so the flag goes
  by the length of the hole again. And the listeners for stop signals changed how a held-up app
  answers a signal, so they are behind a setting that is off.
- A check of those two changes found both carried out, and one fault of words: the Timeslip's DATA
  line could hide a hole or a hold-up behind the "may be a steady speed" words. That line is filled
  by its width now, and the hole and the hold-up come first.
- The full account is in [CHANGES-drag.md](CHANGES-drag.md), parts 11 to 14.

Known from the PC and not solved:

- **DATA GAP on gentle runs** on a car that sends its speed only when it changes. It is flagged on
  purpose wherever the app cannot tell a steady speed from lost data. See "DATA GAP on a car that
  sends its speed only when it changes".
- **A speed signal that has died outside a run reads as the last speed**, for as long as the head
  unit says the car's speed service is up. The Signals tab says "silent for N s". Inside a run it
  ends the run after 3 seconds, flagged.
- **If the kit's one first read of the speed gets no answer**, the app does not know that the car
  stands until it has moved once, and the first launch after opening the app is not timed.
- **A subscription that is tried again** builds a new connection, and the old one is never shut
  down. Where the first try had in fact worked, every value is handled twice. That can only happen
  in the first 80 seconds. Shutting a connection down is a call nobody has made on a car.
- **As shipped the record cannot tell an end by a signal from a kill or a crash in native code.**
  All three read NO WORD.
- A speed signal that starts late, is smoothed or arrives with a delay that varies: see "How it times
  a run". None of it is corrected, and the ± does not cover it.
- A gentle start (brake released first, then throttle) on a speed that is sent only every 200 ms and
  reads 0 under 0.5 km/h: on the first reviewer's model the 0-100 km/h reads 75 ms short on average
  and is beyond its ± in 30 % of launches.
- Where one way the speed arrives is smoothed and the other is not, the app can take the smoothed one:
  nothing in the samples says which is right. The run is flagged where the two differ by more than
  their two ± figures together.
- A hold-up of the app right at the launch that leaves no trace in the samples: the launch is placed
  late by up to the hold-up, and the ± does not show it.
- A reading that is only a little too high is taken for real: up to about 4.5 km/h with 50 ms
  between samples, 9 km/h with 100 ms and 18 km/h with 200 ms. A 0-100 km/h can be made up from such a
  reading. More than that passes in three cases, each seen on made-up cars on a PC:
  - Where the speed is asked for, the time between two readings is only known to within the time the
    two answers took, and a step is judged over the longest it can be. With answers of 25 ± 10 ms a
    reading 5 or 6 km/h too high for 0.22 s passed in 69 and 99 of 180 launches, and one of 8 km/h in
    none. With answers of 60 ± 20 ms one of 10 km/h passed in 102 of 180, and with 100 ± 40 ms one of
    20 km/h in 32 of 180. A stricter rule was tried and taken out again: it ended clean runs of quick
    cars.
  - Where the first wrong sample is itself stamped late, or the wrong reading begins while the app is
    held up, it is judged over that longer time. That holds for a speed that is sent too. A reading
    10 km/h too high passed with 20 ms between samples and a hold-up of 0.15 s, and one of 20 km/h
    with a hold-up of 0.3 s.
  - Where the speed is asked for, no answer comes in while the app is held up, so a wrong reading
    that begins right after a hold-up is judged over that longer time: after a hold-up of 0.15 s one
    of 10 km/h passed, after 0.3 s one of 20 km/h.
- A wrong reading next to a sample that was stamped late can look to the app like samples that
  arrived out of order. For the rest of that run the check on a sample that replaces a late one is
  then off. The run's line in the log says "A SAMPLE READ FAR LOWER THAN THE ONE RIGHT BEFORE IT".
- A reading that is too low for a moment can end a run early, as if the driver had lifted. On
  made-up cars on a PC, one sample 20 km/h too low at 60 km/h, right after a sample stamped late, did
  that in 31 of 60 launches with the speed sent every 100 ms. Just after the car has passed 100 km/h
  it can put the 0-100 km/h off by more than its ±: with the speed sent every 200 ms and readings 5
  to 40 km/h too low, or 0, for 0.06 to 0.22 s right after a sample stamped late, in 37 of 900
  launches, by up to 0.59 s.
- A launch can be lost. On made-up cars on a PC, with the app held up, or one sample stamped late,
  by 0.25 or 0.3 s around the launch, up to 4 of 300 launches gave no run, or a run that ended at once
  with SPEED JUMP, where the speed is sent every 100 ms, and up to 26 of 300 where it is sent every
  200 ms. With 0.4 s it was up to 26 and 41 of 300, and up to 19 of 300 where the speed is sent
  every 20 or 50 ms. Where the speed is sent only every 200 ms,
  shorter ones lost up to 4 of 300 too, and on a car that pulls about 1.5 g one sample stamped 0.1 s
  late lost 15 of 400 launches.
- Clean launches of quick cars are lost where every sample is stamped late by a large and changing
  part of the time between two samples. The app then takes that time for shorter than it is, and what
  the car really gained reads as a step that no car does. The launch gives no run, or ends with SPEED
  JUMP in the first second. On eight made-up cars on a PC, with the speed sent every 10 to 200 ms,
  240,000 clean launches were run, 60,000 for each of four amounts of lateness. With every stamp late
  by up to a quarter of the time between two samples, none was lost. With up to a half, 55 were, 53 of
  them with the speed sent every 200 ms. With up to three quarters, 370: none for cars that launch at
  0.7 or 1.2 g, up to 30 of 7,500 at 1.5 g and up to 173 of 7,500 at 1.7 g. With up to the whole of
  it, 1,554: up to 8 of 7,500 at 1.2 g, up to 196 at 1.5 g and up to 600 at 1.7 g. All but 2 of these
  were already lost before the rule against a reading that is too high was tightened. That rule adds a
  few more where the speed is sent every 30 to 50 ms: see CHANGES-drag.md, part 10.
- DATA GAP can come up on a run whose times are right. Where a car is timed from the speed it sends,
  a hold-up of 0.2 s can leave a hole of 0.3 s, because the sample that was stamped late is taken
  out. On made-up cars on a PC, with the speed sent every 100 ms, that flagged 1,215 of 2,100
  launches, and no split of those was beyond its ±. A flagged run sets no best time.
- A roll that runs straight into the launch, with no sample that caught the car standing in between,
  is timed from the roll, so the times read long. The Timeslip says "launched N s after a roll" when a
  launch follows a roll by under a second.
- The wheelspin estimate from the acceleration reads about 8 % on the stand-in car on a launch with no
  wheelspin at all.

Not tested, and not known until a car has shown it:

- **Why 1.0.1 closed by itself, and whether 1.0.2 still does.** Nothing here is proven to end the
  closing.
- **The install of 1.0.2.** On the first car the Store built and installed 1.0.1, with the one
  thing in it that has no precedent in the kit: the app asks for the GPS receiver's sentences as an
  event alone. For 1.0.2 no installable package was built: that needs BMW's app SDK from a head
  unit. Its manifest names the same groups of signals. As shipped five of them are never used, and
  what the installer and the platform do with a manifest entry that is never used is not known.
- **The record of starts and stops on a head unit.** Its two places, its write every 2 seconds and
  the write at a clean stop were only run on a PC. Whether an app may write to `/tmp` on a car is
  only known from the kit doing it for its frames. The kit ends the app about 200 ms after the
  platform asks it to stop: how long the app's write takes on the head unit's storage is not known.
  A write that is cut off leaves the old file whole.
- **How the platform ends an app.** Whether it counts a stop for memory or processor load as
  unexpected, whether it stops an app that is not in front, how it ends apps when the car is
  switched off, and whether it ever sends a signal: not known. The record is there to show it.
- **How often the speed signal arrives on another car.** On the first car it is sent 47 to 50 times
  a second while it changes, and the app's own reads were answered. Not known there: how long an
  answer takes when the app asks (about 25 ms is assumed, from public reports), how often one takes
  far longer, and whether asking 20 times a second troubles the head unit. It is one of the things
  only Proven Drag and Proven Drift did on that car. Answers that now and then
  take far longer lose launches once an answer usually takes 50 ms or more. On made-up cars on a PC,
  with the speed asked for alone and one answer in twenty taking 3 to 6 times as long, launches that
  gave no run, of 4,200: none where an answer usually takes up to 40 ms, 1 at 50 ms, up to 10 at 60
  ms, up to 55 at 80 ms, up to 156 at 100 ms and up to 320 at 150 ms. None without the long answers.
- **Whether the speed signal ever reads too high or too low for a moment.** If it reads too high, a
  0-100 km/h can be made up from it. If it reads too low, a run can end early. See the list above.
- **In what steps the speed value really moves.** The app reads it in steps of 1/64 km/h. If the car
  changes it in coarser steps, clean launches are lost. On made-up cars with steps of 1 km/h, the
  speed sent every 20 ms and each stamp up to 15 ms late, 358 of 800 clean launches were not timed to
  the 1/4 mile, most of them ended with SPEED JUMP: a change of 2 km/h from one sample to the next
  reads as more than a car can gain.
- **How late it arrives, and whether that delay is steady.** No sample carries the car's own time, and
  a delay that varies goes straight into a time. How long and how often the head unit holds the app up
  (a file write, a frame drawn in software, memory being tidied) is not known.
- **Whether the speed signal reads from 0 or cuts in late.** If it reads 0 until the car does 1 km/h
  or more, times from first movement read short, and that is not corrected.
- **How the wheel speeds are coded.** On the first car they arrive in a form nobody expected: all
  four read 65407 with the car standing, and they are no plain multiple of the speed. No decoding
  is guessed. On a car whose wheel values are plain
  multiples: if wheel speeds and vehicle speed do not reach the app equally late, SPEED READ HIGH AT
  LAUNCH can come up on every launch, and then no run sets a best time.
- **The GPS on another car.** On the first car the receiver's sentences arrive, once a second. How
  old the GPS speed is when it arrives is not known. Whether the raw GPS height is read correctly:
  its scaling is reported from one car.
- **The acceleration sensor**: on the first car it arrives 10 times a second. Whether plus really
  is nose up, and how high the wheelspin estimate reads on a clean launch, is not known.
- **The settings screen.** Nothing is recorded of it from the first car. The six new settings have
  not been on a head unit. Where the kit runs the screen itself it draws the list of settings, and
  that list was drawn on a PC. Elsewhere the head unit draws its own settings screen, with six more
  rows and long names in it now, and that was not looked at.
- **The screens of 1.0.2 on a head unit.** Ten phone photos of 1.0.1's screens came back from the
  first car. Every screen of 1.0.2 was drawn on a PC with the kit's software drawing code. There is
  no picture of it from the GPU renderer, none from the kit's live emulator and none from a car.
  Whether the first car draws the app with the GPU renderer or in software is not known: the record
  of starts and stops says it from the first start on.
- **Both iDrive generations.** 1.0.1 ran on one car with the curved display (iDrive 8 screens). No
  iDrive 7 car has run the app, and 1.0.2 has run on neither. The PC evidence for both is the
  screens drawn at the kit's own text sizes for them. The kit marks its iDrive 8 screen figures "Not
  measured on a car yet".
- **Node.js 8.** The head unit's JavaScript ran 1.0.1. It has run nothing of 1.0.2.

**One run of 1.0.1 was set beside a GPS drag timer by the first car's owner. One run says little,
and it is no measure of how exact the app is. No time from 1.0.2 has been compared with anything.
The app's times are an indication only.** What to do on the next car is in "After installing
Proven Drag 1.0.2 or Proven Drift 1.0.1" and in [CHANGES-drag.md](CHANGES-drag.md), part 11. The
longer list of what a car has to show, written before the first car, is in part 5.

## Proven Drift 1.0.1: on a PC only

**Nothing in this part was done on a car.** Version 1.0.0 ran on one car, and no screen of it was
photographed: the second part above says what is known of that. Version 1.0.1 has not been installed
or run on a car or on a head unit. Everything below ran on a PC (a Mac, Node.js 24), and every car
in it is made up. The figures say what the app's arithmetic does with the samples a made-up car
sends. They do not say what a car sends, and they are not a statement of how exact the app is on a
car. **The drift angle the app shows is an estimate, and no angle from it has been compared with a
car's.**

Tested on a PC (26 November 2026, all checks passed):

- **1054 checks in five files** (1.0.0: 721 in two). `test_drift.js` (306): the engine alone, which
  is the angle, what is learned, when a drift starts and ends, and the score, against a made-up car
  whose true drift angle is known at every moment (`driftsim.js`). It prints its error tables. Three
  checks are new, for steering moments kept from the start. No check of it was changed, and the
  files that work out the angle, the drifts and the score are byte for byte those of 1.0.0.
  `test_drift_native.js` (27, new): what the app and the kit ask of the head unit's native binding,
  counted call by call at a stand-in for it. `test_drift_box.js` (69, new): the record of starts
  and stops on its own, and what it does with a file it did not write: a planted record, a link, a
  pipe, another user's folder. `test_drift_real.js` (44, new): fourteen starts of the built app on
  the kit's real runtime, each a process of its own, ended in every way a process can end, and what
  the next start then shows. `test_drift_car.js` (608): the
  built app on a stand-in car and head unit (`fakedrift.js`). Its parts from 1.0.0 now start the
  app with every extra and the app's own reads switched on and the front wheels' angle set by hand,
  so that each still tests what it tested. Its parts marked "(1.0.1)" start the app as shipped: the
  core signals only, a car like the first one, cars that send too little, no pedal percentage,
  wheel values in an unknown form, each extra switched on and off, the record on the Signals tab,
  frames that only go to the screen when something changed, and the changes to learning. The parts
  from 1.0.0 cover a first drive from "not
  learned" to the first drift; switches, a spin, a handbrake entry and a long circle; the driving
  that must score nothing; each of the ten optional groups of signals missing in turn and all
  together; the yaw rate from its second source; no yaw rate at all; a speed that is only sent, only
  read, or lost; yaw rate and accelerations that the car does not send by itself, and that stop
  arriving altogether; a steering signal that stops, and one that sticks at a value and is still
  sent; a healthy steering at its lock while the car's nose stops turning in the middle of a drift;
  a steering value that freezes in a corner before a banked one; values that are nonsense; a car
  that is only
  driven in circles before its first drift; a car whose forward acceleration reads more than its
  speed gains; the saved file read back, damaged, from a newer version and not writable; every
  setting; demo drifts never saved; and the head unit's clock set back in the middle of a drift.
- **Can the new tests fail.** For the first build of 1.0.1 the built app was broken in 23 ways,
  and for its second part in 13 ways, one at a time in a scratch copy. Each break makes at least one
  check fail now. Three were not noticed at first: the test was changed for each, and one of them
  led to a real fault that was fixed. The repairs that followed were not broken one by one: their
  checks were shown to fail on the build before them. CHANGES-drift.md, parts 9 to 12, lists every
  check that was changed on purpose.
- **What is asked as shipped.** At the stand-in for the native binding, in ten minutes of stop and
  go: three connections built, six values subscribed, 15 set-up calls where 1.0.0 made 54, and not
  one read of the app's own. The kit read four values once at the start, and three of them once
  more when their service came back. No write, no method call, and no connection shut down.
- **A made-up car like the first one.** Its speed is sent about 47 times a second while it changes
  and not at all while it holds, its yaw rate and accelerations 10 times a second. As shipped, the
  car was learned and five kinds of drift were read from what it sends, with no flag and not one
  read of the app's own. Those are a made-up car's figures, and no promise for a real one.
- **Every tab was drawn in 159 states** at the PC's text size and at the kit's sizes for iDrive 7
  and iDrive 8 (1245 frames), with the rules of `textfit.js`: every letter has its picture in the
  font, no text lies on another, none leaves the page, none crosses the edge of its panel. Among the
  states is every tab with the longest values it can show, in km/h and in mph. The first runs of
  these rules found lines on the Signals tab that ran out of their panel; they were shortened. The
  smallest text on the Drift tab is 15 px.
- **It only reads.** In all those drives the stand-in car counted every call the app made to it:
  subscriptions, getter reads and the one event subscription, and nothing else. The getters read were
  the speed and, only where the made-up car did not send them, the yaw rate and the two
  accelerations. Never two reads of one value at once.
- **No position.** The stand-in cars sent their position and a course in every GPS sentence. The
  test searches every log line and every saved file for those numbers, in the forms a receiver writes
  them, and for any member named after a position, a course or a heading. It finds none, and the same
  search finds each of five planted ones.
- **The made-up car.** `driftsim.js` makes a true motion first (speed, how hard the car turns, its
  drift angle) and works out from it, exactly, what each sensor would read. The app's angle is then
  measured against the true one. The car's driver steers perfectly, its tyres are a curve that is not
  the app's, and the app is told none of its raw units.
- **Angle error on that model**, after the car was learned, in degrees, for a held drift of 30
  degrees, a long circle and a drift with two switches. "Typical" is the middle error while the car
  turns, "worst" the largest:

  | Data | With steering: typical | With steering: worst | Without steering: typical | Without steering: worst |
  |---|---|---|---|---|
  | Clean, 20 samples a second | 0.3 to 0.5 | 0.6 to 0.7 | 0.1 to 0.7 | 0.8 to 1.4 |
  | With sensor faults, 20 a second | 1.2 to 1.6 | 1.5 to 3.2 | 0.9 to 1.8 | 2.6 to 4.0 |
  | With sensor faults, 5 a second | 0.7 to 1.9 | 2.2 to 6.2 | 1.5 to 2.4 | 3.4 to 7.2 |

  "Sensor faults" is a set of faults made up to be plausible, all at once: body roll, gain and zero
  errors, noise, a speed that reads 2 % high, samples that arrive late and in lumps. The full tables,
  for seventeen kinds of driving, are in [CHANGES-drift.md](CHANGES-drift.md). Without steering the
  drifts of this table are flagged NO STEERING CHECK, whatever their error.

  **That table holds for a car whose front tyres match the app's guess, and for no other.** The
  steering check takes the front tyres to slip 4 degrees per g and no more than 5 degrees, and the
  made-up car's tyres are close to that. A reviewer's car whose front tyres slip about 8 degrees
  near the limit read every held drift 3 to 6 degrees LOW with steering, for as long as it lasted
  (its score 12 to 18 % under what the rules give for the true angle), where the same drifts were
  within 1.5 degrees without steering. About a degree low for every degree the front tyres slip
  more than the guess. Whether a car reads high (body roll, below) or low (this) is not known.
- **What must score nothing** scored nothing in every run on the test's made-up cars: a quick lane
  change, a slalom, a bumpy straight, hard braking in a straight line, plain understeer, a long
  ordinary corner, four minutes of ordinary driving (also on a car whose yaw rate is scaled 2.5
  times finer than the app's default, from nothing), and banked corners taken without sliding (3 to
  12 degrees of bank, 0.16 to 0.6 g at 80 to 100 km/h) with steering, also on a road that climbs.
  Without steering such corners ARE counted where the car feels little sideways or the road climbs
  through them, and each is then flagged NO STEERING CHECK and sets no best: 56 such drifts in 112
  runs, none without the flag.
- **Learning.** On three made-up cars with three different sets of raw units, one with the signs
  turned round, the yaw rate's scale was learned to within 0.2 % and the steering's to within 9 %,
  from five and a half minutes of ordinary driving on flat ground. On a reviewer's three cars the
  steering's scale came out 5, 10 and 16 % low: a car that pushes a little in a gentle corner looks
  like one that is steered more. Through the whole app the yaw rate was "learned" 67 seconds after
  the made-up car pulled away into its first corners. With the forward acceleration reading 0.5 to
  1.0 m/s2 more than the speed's change, or 0.7 less (a road that climbs by 3 to 6 degrees or falls
  by 4, or a sensor's zero that is off), it was learned as on the flat.
- **Can the tests fail.** The engine was broken in 18 ways and the app in 28 ways, one at a time, in
  a scratch copy. Every break makes at least one check fail now. Four were not noticed at first (two
  in the engine, two in the app) and one only by accident: a check was added for each. What was
  changed after the two reviews was broken in 19 more ways: two of those were not noticed at first
  either, and a check was added for each. What was changed after the re-check was broken in 29 ways,
  and each makes at least one check fail. What was changed after the second check: 16 ways, and each
  makes at least one check fail. After the fifth check the figure of 10 degrees in the rule for a
  stuck steering was set to 6, to 8 and to 25 in a scratch copy: each makes checks fail (before, 6
  and 8 did not). CHANGES-drift.md lists them.
- `apps/pps_drift/*.js` was parsed as ES2017, the level the head unit's Node.js 8 runs, and scanned
  for newer library calls. It was not run on Node.js 8.
- The four apps were built with the kit's build step. The manifest of 1.0.0 was checked against
  the interface catalogue of one head unit (an M8 on iDrive 7): every interface, field and access it
  asked for is in that catalogue. That check was not made again for 1.0.1. Its manifest names the
  same twelve groups, asks the kit to read fewer values, and adds one: the steering wheel's angle
  under its second field name, which the kit's own Live Data and Engine Config subscribe to.
- Proven Gauges and Proven Warm-Up build to the same files as before this release.

Known from the PC and not solved (CHANGES-drift.md has the figures). The first six points are new
with 1.0.1:

- **The steering wheel's angle may arrive in a form this version does not read.** The kit's own
  apps read it as a signed number in an unsigned field, as their best guess. If a car sends it so,
  the steering will not learn, every drift carries NO STEERING CHECK and none is a best. The app
  still counts slow corners from the half of the values it can read, for example "15 SLOW CORNERS
  KEPT", without ever learning. That is on purpose: no decoding is guessed before a photo shows the
  form.
- **A steering wheel's angle is a plain multiple of the front wheels' only where the steering ratio
  is fixed.** On another car the steering may not reach "learned".
- **The wheel proof needs two steady speeds on a straight**, above 30 km/h and 20 km/h apart, a
  second or two each, at every start of the app. On a skid pan that may never come. After the proof
  the app still has to learn the usual ratio of rear to front before a wheelspin shows.
- **The record has limits.** With five lives, two of them on two lines and several "saved data was
  emptied" lines, the oldest life can fall off the eight lines: the log has every line. "Asked to
  stop by the car" does not say whether the app reached its exit: the word is written first, so a
  process killed right after it reads like a finished clean stop. After the app is installed again
  under another user id, the Drift tab shows no line, even when the life before ended with no word.
  If the data folder and the folder in `/tmp` are both gone, the app reads like a first start.
- **"No restart" rests on the head unit's two clocks.** Where the record in `/tmp` is gone, the app
  takes it that the head unit ran on only if its uptime and its wall clock have grown by the same,
  within 20 seconds. 20 seconds is a guess. A head unit that sets its wall clock in between reads as
  restarted, and one whose wall clock started from the same date at every start would read as not
  restarted.
- **The Signals pages are up to a second old.** They take what they show every 0.9 seconds, so
  that the page that is photographed is not a new picture with every value the car sends.
- **The angle reads high by the car's body roll.** The sideways acceleration sensor tilts with the
  body. On a made-up car with 4.2 degrees of roll per g every peak read 4 to 10 % high; with 6
  degrees per g the angle was up to 6 degrees off. Nothing learned from ordinary driving takes that
  out.
- **If the car reports the speed along its own length while it is sideways**, and not its true speed,
  the angle was up to 14 degrees off on the made-up car. Which one a car reports is not known. The
  GPS check on the Signals tab is there to find out.
- **A yaw sensor that stops reading inside its range** is not seen. With a ceiling at 40 degrees a
  second a drift with two switches was 24 degrees off and counted as two drifts, with no flag.
- **With steering the angle is only as good as the app's guess at the front tyres**: 3 to 7 degrees
  low in every held drift on made-up cars with a softer front axle, and no flag says so (see the
  note under the table above).
- **With the front wheels at their lock the steering check pulls the angle down.** On a made-up car
  whose wheels turn 36 degrees, a drift held at 46 degrees sank to 6 degrees low and one at 50 to 9.5
  low, with no flag. From about 55 degrees the check is dropped and the angle was right again.
  Without steering all of them were within 2 degrees, but with "Steering check" off no drift sets a
  best.
- **On a car that gives no usable steering angle no drift becomes a best.** Every drift of such a
  car is scored, shown and saved, and flagged NO STEERING CHECK. The same holds until the steering is
  learned, with "Steering check" off, and after a steering signal has gone silent or stuck. That is
  the price of the next point, and the rule is to be looked at again once a car has shown what it
  gives.
- **That rule rests on a car that does not oversteer while it grips.** A car that grips through a
  banked corner is steered as far as its path asks, so its steering backs nothing there. A made-up
  car whose rear tyres slip well beyond its front ones in a hard corner is steered less than its path
  asks all the way round, and its steering "backs" what the bank adds to the sum. On a checker's car
  of that kind, with steering, in 180 hard corners banked by up to 10 degrees (0.6 to 0.9 g at 60 to
  140 km/h, the car never as far sideways as the start angle): 72 were counted as drifts, 15 of them
  with no flag (up to 665 points, grade B: 11.9 degrees shown where the car was 7.7 sideways at
  most). On a milder one 16 and 1. On two made-up cars that do not oversteer while they grip: none.
  On the test's own car with its rear slip raised from 2.4 to 6 degrees per g: 42 of 160, 2 with no
  flag; as built, and with 4 and 5: none. Whether a car that grips ever runs that much more slip at
  the rear is not known.
- **Without a steering angle a banked or a climbing corner taken with full grip is counted as a
  drift.** Nothing in the yaw rate and the two accelerations tells it from a slide. With steering:
  3.8 degrees off (4.6 shown) on a corner banked by 12 degrees, no more than 4.6 shown in any such
  corner tried at 80 to 100 km/h, and none counted. Without steering only a hard banked corner is
  held (9.5 degrees on 12 degrees of bank at 0.6 g). In gentler ones, where the car feels less than 3 m/s2 sideways, the
  angle shown ran to 25 to 68 degrees with nothing sliding, and where it feels under 1.5 m/s2, or the
  road climbs through the corner, the corner was counted as a drift (up to 4053 points, grade S, on
  the made-up car). A flat corner on a climb of 5 degrees that begins with the corner: 10 degrees
  shown, 145 points. Each is flagged NO STEERING CHECK, so none can be a best. It is still on the
  screen as DRIFT and in the session's total. On a checker's wider grid (336 corners with full grip
  on each of four made-up cars: banks up to 20 degrees, 0.15 to 0.8 g, 25 to 110 km/h, level and
  climbing) about twice as many are counted without steering as before the re-check's changes: 197
  to 210 on each car, where it was 86 to 102. Before, 38 to 44 of them carried no flag. Now every one
  is flagged.
- **With steering, a slow and tight banked corner is counted too.** On the made-up car 10 degrees of
  bank at 25 km/h and 12 degrees at 30 km/h showed 11 degrees and were counted (169 and 159 points),
  and a steeper bank at such speeds ran the angle to its limit. The steering said the car went where
  it was steered, so each is flagged NO STEERING CHECK and none is a best.
- **A road that begins to climb inside a corner** still reads as the forward share of a slide: no
  learning from that corner, and without steering it can be counted as above. A steady climb is
  taken out on the straight before.
- **On low grip without steering the angle is the bare sum** (see "How the angle is worked out").
  On a made-up circle on grip 0.3 it was within 1 degree on clean data and up to 5.8 off with sensor
  faults, and with a reviewer's faults 12 to 14 degrees low in the middle of a 40 second circle.
  Such a drift is flagged ANGLE UNSURE after about 10 seconds, clean data or not, and NO STEERING
  CHECK like every drift without steering. With steering the same circle was within 3 degrees.
- **A car learned on corners with camber has a wrong scale and still says "learned"**: 8 % low with
  1.5 degrees of camber in every corner and 15 % with 3 degrees on a made-up car, and a held drift
  on the flat then read 10 to 15 degrees low with steering and 5 to 8 without. Camber that differed
  from corner to corner did no harm.
- **If the car works its forward acceleration out from its speed**, and does not feel it with a
  sensor, the angle runs away in every held drift: a drift of 30 degrees was up to 66 degrees off
  with steering and 91 without on the made-up car, and on a reviewer's car it ended after 4 seconds
  as a spin that was none. The workshop setting "Forward acceleration: Leave out" is for such a car:
  the same drift was then within 2.7 degrees with steering and 3.1 without. With that setting and
  without steering nothing but the sum is left. Whether any car does this is not known.
- **A yaw rate or a sideways acceleration that stops arriving is noticed after 2.5 seconds, and as
  shipped only in a drift.** While a drift runs or may be beginning, a car that slides does not hold
  both still to the last count, so silence there is a source that has died. For those 2.5 seconds
  the drift goes on from the last values; then it ends, flagged DATA GAP, and sets no best. On a
  straight, as shipped, it is not noticed at all: a sensor that has died and one whose value holds
  still look alike, the banner stays READY, and a drift driven then is not counted. With "Ask the
  car for values" on, the app reads those values itself once the car has sent too few for 2
  seconds, and a dead source is noticed on the move after 2.5 seconds, as in 1.0.0. On the yaw
  rate's second source, which the app cannot read itself, a dead signal is only noticed when the
  sideways acceleration next moves.
- **A yaw rate whose zero has moved** by 1 to 2 degrees a second no longer lets the angle run away on
  a straight, but the zero stays off until the car stands or goes straight with less than 1 degree
  a second showing. A jump of 3 degrees a second or more on a car without steering: the angle shown
  runs to its limit on a straight, and that IS counted as a drift (3415 points, grade S, on a
  reviewer's car; 832 with a jump of 8), flagged NO STEERING CHECK and SPIN, so it sets no best. For
  a while nothing was counted there; since a drift without steering may start on the sum again, it
  is. With steering nothing was counted in those runs.
- **A speed that stops arriving is not noticed as shipped.** The app is then on the speed the car
  sends, and a speed that has died looks like a speed that holds still: the last speed stands. It
  is only noticed with "Ask the car for values" on, on a car whose speed can be read.
- **A steering signal that stops arriving looks like a steering wheel held still** until the car has
  both gone straight and turned with nothing from it for 2 seconds. From then on it is not used, and
  drifts are flagged NO STEERING CHECK (drifts of 30 and 13 degrees were then read within a degree
  on the made-up car). A signal that dies in the middle of a corner is believed until the next
  straight on which less than 20 degrees are shown. One that dies with the wheels at their lock in a
  drift that then fades out slowly was believed to the end of the drive (see "What the two rules do
  not see").
- **A steering value that sticks and is still sent** is taken for stuck once the car has gone
  straight for 0.7 seconds and then turned for 0.7 seconds on it (6 degrees a second or more, with
  1.5 m/s2 or more of sideways acceleration), and the value has not moved by a count for 2 seconds.
  From then on it is not used, as a silent one, until it moves. On made-up cars a steering stuck at 9
  to 14 degrees had made corners with full grip look like opposite lock (up to 846 points, grade B,
  no flag); with the rule nothing was counted there.
- **For both of those rules the car has "gone straight" only while less than 20 degrees are shown.**
  A car that is sideways can stop turning its nose: the driver lifts in the middle of a drift, or
  the car slides on in a straight line between two corners. With the front wheels at their lock all
  the while, a steering value that sits still to the last count then looked stuck, or silent where
  it is only sent on change, as long as "straight" was judged by the yaw rate alone. That cost the
  largest clean drifts. Of 88 cases on two made-up cars (drifts of 45 to 60 degrees
  with such a moment in them, and a few controls), 66 were flagged NO STEERING CHECK and set no
  best; with a steering sent on change 76 were, and where the car slid straight it was taken for at
  rest: the angle was pulled to zero and the drift counted as two (through the whole app 22 degrees
  were shown for 50). With the limit none of the 88 carries that flag, either way, and each is one
  drift. All of this takes a steering value that sits still to the count at the lock. Whether a
  car's steering does that is not known; with a tenth of a degree of noise on the made-up steering
  it happened in none of the 88. The limit has to lie under the angle that is shown while a car
  slides at its lock, and that angle is less than the true one (see above). On this source's own
  made-up car, with drifts 10 degrees beyond the lock, it kept a healthy steering clean from 22
  degrees of lock up. On a reviewer's made-up car, with drifts 6 and 12 degrees beyond the lock, it
  did so from 28 degrees up: at 22 degrees of lock 5 of 16 cases were still taken for silent or
  stuck, at 24 one. So a lock of less than about 28 degrees is not covered. (The two cars of the
  88 cases have 35 and 37.) What a car's lock reads at the wheels is not known.
- **For the stuck rule the car is "sideways" only with its front wheels turned into the slide.**
  With the angle shown alone, a stuck steering could be believed for minutes. A value froze at a
  few degrees in an ordinary corner and was still sent; a banked corner followed with no straight
  between, and the angle shown ran to 20 degrees or more in it. On every straight after that the
  stuck rule waited for less than 20 degrees shown, and the rule that pulls the angle to zero on a
  straight waited for a steering near its centre. On four made-up cars 13 to 45 of 69 real drifts
  were then counted; where the false angle stayed under 100 degrees, one false drift ran on for 69
  seconds (8928 points, grade S, flagged, so no all-time best); and through the whole app a real
  drift of 40 degrees was shown as 2.7 and not counted, under the banner GO STRAIGHT FOR A MOMENT.
  So for the stuck rule a stretch is "not straight" only where 20 degrees or more are shown and the
  front wheels are turned the way of that angle, down the car's path, by 10 degrees or more, as a
  car that slides without turning its nose holds them. Where the steering's scale is not learned at
  all, the angle shown alone decides. With it all 69 real drifts are counted on each of the four
  cars, at 5 to 50 samples a second, and the stuck steering is found in the first corner after the
  first straight. The rule for a silent steering does not ask this: tried there, it took a healthy
  wheel that was held still at a few degrees for silent in the middle of a slide, and cut the drift
  in two. A steering that is no longer sent is seen by the stuck rule as well, one corner later.
- **What the two rules do not see.**
  - A value that sticks or dies while 20 degrees or more are on the screen for another reason AND
    that stands 10 degrees or more to the side of that angle. That is reached like the state in
    the bullet above, with a slower, tighter first corner. On a reviewer's made-up car a value that
    froze at 11.5 degrees or more at the wheels (a first corner of 0.45 g at 30 km/h, and tighter
    ones), with a banked corner the other way after it, was believed for 89 seconds, until less
    than 20 degrees were shown on a straight, or to the end of the drive of 198 seconds. Real
    drifts were lost meanwhile, and in the worst case one false drift ran for 69 seconds with
    12390 points, grade S, flagged ANGLE UNSURE and NO STEERING CHECK (it sets no all-time best,
    but it is the session's best). Where the value froze at 10.8 degrees or less it was found in
    the first corner after the first straight.
    On a second made-up car the line lay at 10.3 degrees. On a steering that is only sent when it
    changes every case of this kind (a value frozen in a first corner before a banked one) was
    found; the next point is one that is not. In the 43 cases tried on this source's own made-up
    car of a steering that sticks or dies with an angle on the screen (in a banked corner, in a
    drift of 15 to 30 degrees that ends within a second, in a corner that leads into another, on a
    long straight) it is found in all 43.
  - A steering that dies, or sticks, with the wheels at their lock in a drift that then fades out
    slowly while the car goes on turning. The dead value reads as opposite lock and holds the angle
    shown up as the true one falls. On the straights after it 20 degrees or more then stand on the
    screen on that value's own side, so neither rule sees a straight, and the rule that pulls the
    angle to zero on a straight waits for a steering near its centre. It is believed to the end of
    the drive. A checker's cases on two made-up cars: the steering dies, or sticks on a car that
    sends it on change (in some cases one that sends it every slot), 2.5 seconds into a drift of
    45 or 55 degrees at 70 km/h; the drift fades out over 5 to 30 seconds into a corner of 0.35 g;
    then three laps with one real drift of 40 degrees in each; 49 cases a car. Where the fade
    took 13 seconds or more on one car and 14 or more on the other (22 and 20 cases), the
    steering was never taken for silent or stuck. In each of those ONE drift was counted, the one
    in which the steering died, run on for 72 to 90 seconds until the angle shown passed 100
    degrees (5461 to 8510 points, grade S, flagged ANGLE UNSURE and SPIN, so no all-time best).
    None of the three real drifts after it was counted, about 200 degrees stood on the screen at
    the end, and nothing could start. Where the drift faded out within 12 seconds, and where it
    was brought down to 15 to 25 degrees, held there and then ended quickly, the dead steering was
    found and all three real drifts were counted. Before the limit of 20 degrees on the angle
    shown (the third check) it was found in every one of the 49 on both cars and no real drift
    was lost. On this source's own made-up car the test holds one such drive: with a fade of 20
    seconds the dead steering is believed to the end and neither real drift of two laps is
    counted, with a fade of 12 seconds it is found and both are. It takes a sensor fault at the
    lock and a slow fade. No false drift without a flag came of it.
  - The other way round, a HEALTHY wheel that does not move by a count for 2 seconds or more, with
    less than 10 degrees of it turned into the slide, while the car's nose stops turning and then
    turns again, is taken for stuck. In 832 made-up cases built to look for that (a lift in which
    the driver winds the lock off and holds the wheel still; a slide on low grip with a little
    opposite lock held still; steering scales learned 30 % wrong) 194 were newly taken for stuck
    on one made-up car and 172 on another. In those 832 cases no drift that had no flag got one,
    none was cut in two or lost, and no angle read worse by more than half a degree; 124 and 104
    drifts that already carried ANGLE UNSURE now carry NO STEERING CHECK as well.
  - **In slow, tight drifts that costs more**, and the 832 cases had none of them. On a pan a car
    needs little opposite lock: its front wheels point down their own path, and in a tight circle
    at low speed that is well inside the drift angle. On two made-up cars a drift shown as 19 to
    20 degrees through a corner of 0.5 to 0.6 g at 25 to 30 km/h was held with 9.6 to 9.9 degrees
    of opposite lock, and tighter ones on one of the cars with the wheels turned into the turn. A
    wheel whose value sits still to the last count there, through a straight slide and the corner
    after it, is taken for stuck. A checker's cases on those two cars (a corner, a straight slide
    of 1 or 2 seconds, the corner again; the wheel held as it stood in the corner; steering sent
    every slot and on change):
    - With one straight slide, 1800 cases a car: 140 and 80 were newly taken for stuck. In 10 and
      2 of them a drift that had carried no flag now carries NO STEERING CHECK and sets no best;
      in 126 and 78 that flag came beside another.
    - With two straight slides, 3600 cases a car: once the steering counts as stuck, the rule that
      pulls the angle to zero on a straight leaves it out, so in the second slide the car counts
      as at rest. The angle shown is pulled to zero in the middle of a real slide and the drift is
      counted as two: in 256 and 160 cases, with the angle up to 44.8 and 39.9 degrees wrong (5.0
      and 3.1 at most before). Every one of those drifts had carried ANGLE UNSURE before.
      That is so at 20 samples a second on clean data: at 50 samples a second, and at 20 with
      sensor faults, 3 of the 252 and 3 of the 276 drifts that were cut in two on the first of
      the two cars had carried no flag.
    - The screen then says STEERING SILENT OR STUCK: NO BEST IS SET, and the Signals tab "the
      steering is silent or stuck", on a steering that works. Through the whole app on the
      stand-in car (0.65 g at 28 km/h, two straight slides of 1.5 seconds, the wheel held at 9.3
      degrees of opposite lock) 1.2 degrees were shown at the end of the second slide for a true
      27, and one drift of 672 points became two of 307 and 89.

    Before the fourth check's change no clean drift was flagged and none was cut in two in these
    cases: the limit of 20 degrees on the angle shown had covered this wheel, and asking the
    steering as well uncovered it. (Before that limit, the rule for a stuck steering did the same
    to a steering sent every slot in every one of them.) With the wheel as the car's own, which
    moves when the car slides straight, not one of as many control cases changed.
    **All of it takes a value that does not move by one count for 2 seconds.** On one of the cars
    with steering counts of 0.01 or 0.1 degrees at the wheels, hands that wander by about 0.05
    degrees kept all of it away; with counts of 0.5 or 1 degree, hands that wander by 0.05 or 0.2
    degrees kept none of it away, and by 0.5 degrees all of it. Whether a driver's hands and a
    car's steering counts hold a wheel that still, anywhere but at the lock, is not known. The
    test holds one such drift with one straight slide and one with two on this source's own
    made-up car, and the same wheel with a wander.
  - A car that never goes straight for 0.7 seconds. On a pan this is worse than it sounds: the car
    has gone straight earlier with a healthy steering, the value then sticks in a corner and is
    still sent, and the car goes on in figures of eight. The stuck value backs the circles the
    other way as opposite lock. On two made-up cars a false drift was counted in 12 of 40 such
    cases, in 4 of them with NO flag (202 to 380 points, grade C), and such a drift can set a best;
    the other 8 carried ANGLE UNSURE alone.
  - Corners in which the car feels less than 1.5 m/s2 sideways (a stuck steering then goes on being
    believed: two gentle banked corners were counted with it on the made-up car, and the stuck
    steering had "backed" 42 and 49 % of them, just under the half that takes the flag off), and a
    slalom alone.
  - The stuck rule needs a steering angle whose counts are fine enough to move whenever the car
    turns in from a straight. On the made-up car, with counts as coarse as 1 degree at the wheels,
    the wheel was not taken for stuck in ordinary driving, in fast gentle corners, in a held drift
    or in the long circle. What a car's counts are is not known.
- **A drift during which the steering dies, or sticks, keeps the wheel's last value to its end.** It
  carries no flag and can set a best, and its opposite lock and its angle follow that last value. On
  the stand-in car a drift of 30 degrees that grew to 45 read 43.8 at its peak, with 34.9 degrees of
  opposite lock and 997 points. With every steering source cut 2 seconds in it read 41.3, 25.5
  degrees and 884 points, was up to 12.1 degrees off (4.8 with the steering alive), had no flag and
  set all four bests. Nothing in a steering that says nothing tells a dead source from a wheel that
  is held still in a steady drift.
- **A lone speed reading of 0 after a long silence can be taken as real.** With a speed that had not
  changed for seconds, under 45 km/h and only sent on change, one such value ended a drift of the
  made-up car as a SPIN that was none. With the speed arriving ten times a second or more, as it
  does where the app reads it itself, such a value was dropped in every run of the test. As shipped
  the app does not read the speed itself, and the first car sends its speed only when it changes.
- **A car with neither wheel speeds nor a forward acceleration can learn from slides.** Drifted in
  steady circles both ways on a wet pan before anything was learned, the made-up car counted as
  "learned" with its scale 8.5 % low. An ordinary drive after it put that right.
- **A bumpy road at a low data rate**: the angle wandered by up to 8 degrees at 5 samples a second.
  On the test's own car no drift was counted there. On a reviewer's car without steering a bumpy
  straight (it shakes by 2.6 m/s2) at 5 samples a second IS counted as a drift: in six of ten runs
  (clean and with its sensor faults, five draws of the noise each), with 72 to 3009 points (975,
  grade B, in the reviewer's own run). With steering it was not counted in the reviewer's own run,
  and it was counted in four of the ten runs with other draws of the noise (21 to 1018 points). Each
  of these is flagged NO STEERING CHECK and LOW DATA RATE, so none sets a best. A straight that
  shakes by 5 m/s2 is counted without steering at 10 samples a second as well, where LOW DATA RATE
  does not apply: in five of ten runs, 30 to 305 points, each flagged NO STEERING CHECK. With
  steering nothing was counted at 10 or at 20 samples a second.
- **A car with no steering source that slides sideways in a straight line counts as at rest.** The
  rest rule then has the yaw rate and the sideways acceleration alone, and both are small there. On
  a reviewer's car crabbing at 25 degrees on grip 0.15 the car counted as at rest for 93 % of the
  crab (0.6 degrees shown for 25); with a steering source, not at all (24.3 shown).
- **A drift that is mostly a straight slide is flagged NO STEERING CHECK, with a healthy steering
  too.** The steering backs a drift only at moments in which the car turns (2 degrees a second or
  more), and the flag goes to every drift that was backed for less than half its time. On the
  made-up car thrown sideways on ice (grip 0.04 to 0.2) and sliding straight for two stretches of
  3 seconds, all 12 cases were counted and flagged (backed 17 to 26 %); a reviewer's car crabbing
  straight at 12 to 40 degrees was counted and flagged the same (backed 3 to 10 %). Such a drift is
  scored and sets no best.
- The ± figure does not cover a banked road, and it is too small on a bumpy road under 50 samples a
  second. On the test's made-up car it covered the error at least 99 % of the time in the drift
  scenes; on a
  reviewer's car with softer front tyres 37 to 86 % of the time in six of eleven scenes with faults.
- A car that pulls away from a crawl already sideways reads low at first. Driving backwards is not
  recognised. A driver who saws at the wheel as the made-up driver never does was not tried.
- Where the kit draws the whole screen on iDrive 7 and the DEMO badge shows beside BETA, the kit
  leaves the app's name out of its header to make room for the five tabs.

Not tested, and not known until a car has shown it:

- **Why 1.0.0 closed by itself, and whether 1.0.1 still does.** Nothing here is proven to end the
  closing.
- **The install of 1.0.1.** On the first car the Store built and installed 1.0.0. For 1.0.1 no
  installable package was built: that needs BMW's app SDK from a head unit. Its manifest names the
  same twelve groups of signals and one value more. As shipped nine of the groups are never used,
  and what the installer and the platform do with a manifest entry that is never used is not known.
  The manifest of 1.0.0 was checked against one head unit's catalogue only. A head unit that lacks
  an optional group of signals should get the app without it; that path is the kit's and was not
  run.
- **The record of starts and stops on a head unit.** It was only run on a PC. Whether an app may
  write to `/tmp` on a car is known from the kit's own notes only. The kit ends the app 200 ms after
  the platform asks it to stop: whether the app's writes fit into that on a head unit is not known.
  The record in `/tmp` is written first.
- **How the platform ends an app**: whether for memory or processor load, whether with a signal,
  and what it does when the car is switched off. Memory and processor in the record are what the
  process can see of itself. How the platform counts against its limits is not known.
- **Whether the signals arrive**, under the names the app expects, how often, and in what raw
  units. The names are from one head unit's catalogue. On the first car the speed and the forward
  acceleration arrive: Proven Drag's screens showed them. Its yaw rate and its steering angle have
  not been seen. Its accelerator pedal and its wheel speeds arrive in forms that are not known.
- **Whether the angle is right.** Only a drift filmed from outside or from above, set against the
  angle shown, can say.
- **Whether learning comes to "learned" on a car**, and how long that takes. The first car's owner
  wrote one sentence on it, and it reads both ways.
- **Whether the car's forward acceleration is a sensor's reading.** If the car works it out from its
  speed, every held drift runs away (see above), and "Forward acceleration" has to be set to "Leave
  out". The tell-tale: the angle climbs past 90 degrees in a drift that is held steady, and the
  forward acceleration reads the same standing on a slope as on the flat.
- **Whether a car's sensors flicker.** The app takes a yaw rate that has said nothing for 2.5 seconds
  as dead: as shipped while a drift runs or may be beginning, and with "Ask the car for values" on
  whenever the car moves. On a car whose readings hold still to the last count for longer than that,
  and whose values the app does not or cannot read itself, or can only read slower than half a
  second, it would say NO YAW RATE FROM THE CAR while nothing is wrong.
- **Whether the car gives a steering angle the app can learn.** Without one no drift becomes a best
  (see above).
- **Whether the steering arrives on a schedule or only when it changes, and how fine its counts
  are.** That decides how a steering that has died shows: as silence, or as a value that is sent
  again and again. How fine the counts are also decides whether a wheel that is held still reads
  the same to the last count for seconds: on a made-up car with counts of half a degree it did,
  even with hands that wander by 0.2 degrees.
- **Whether the steering's value sits still to the last count with the wheels at their lock**, or
  with the wheel held still anywhere else, or flickers by a count there. The rules for a silent
  and a stuck steering had to be changed for a value that sits still at the lock, and what they
  do to a healthy steering in a slow, tight drift hangs on it (see above).
- **What a car's lock reads at the wheels.** The stuck rule takes a wheel that is held into a slide
  to read 10 degrees or more on the learned scale, and the two rules do not cover a healthy wheel
  at a lock of less than about 28 degrees (see above). The made-up cars have 33 to 38.
- **Whether a steering value can freeze and still be sent**, and whether a driver holds a wheel
  still to the last count anywhere but at the lock. The first is what the stuck rule is for, the
  second is what it costs (see above). Whether a steering signal ever stops or sticks on a car
  that is being driven is not known either: every dead steering above is a made-up fault.
- **What the car's forward acceleration reads on a slope and on the flat.** The Signals tab shows
  what it reads more than the speed gains on a straight.
- **What speed the car reports while sideways.** See above.
- **How late each signal arrives against the others**, and how long and how often the head unit holds
  the app up. A steady delay of 0.1 s between yaw rate and sideways acceleration cost 2.5 degrees on
  the made-up car.
- **Whether reading the speed 10 times a second troubles the head unit**, and, on a car that does not
  send them, reading the yaw rate and the accelerations about 25 times a second together. 1.0.0 did
  both without being asked, and it is one of the things only Proven Drag and Proven Drift did on the
  first car. In 1.0.1 it only happens with "Ask the car for values" on.
- **The forms of the pedal, the wheel values and the steering wheel's angle.** Photos of the
  Signals tab with their settings on are what a later version needs.
- **What the handbrake's signal reads**, with "Pedal and handbrake" on. The app takes its two states
  as the kit's own Live Data app reads them. An electric parking brake may read otherwise, or not at
  all.
- **The settings screen**, and with it the two resets. Nothing is recorded of it from the first
  car. Where the kit runs the screen itself it draws the list of settings, and that list was drawn
  on a PC. Elsewhere the head unit draws its own settings screen, with seven more rows and long
  names in it now, and that was not looked at.
- **The screens on a head unit.** No screen of Proven Drift was photographed on the first car. All
  were drawn on a PC with the kit's software drawing code. There is no picture from the GPU
  renderer, none from the kit's live emulator and none from a car. The drawn car turns smoothly on a
  PC; whether it does at the head unit's frame rate is not known.
- **Both iDrive generations.** 1.0.0 ran on one car with the curved display (iDrive 8 screens), and
  nothing is recorded of its screens there. No iDrive 7 car has run the app, and 1.0.1 has run on
  neither.
- **Node.js 8.** The head unit's JavaScript ran 1.0.0. It has run nothing of 1.0.1. How long the
  head unit takes for the app's arithmetic is not known: on the PC the whole app with its stand-in
  car ran 130 times faster than real time.

**What the next car must show.** First the photos of "After installing Proven Drag 1.0.2 or Proven
Drift 1.0.1": the Signals tab after a minute, the Signals tab right after any stop of the app, and
the steering's rows with the wheel straight and a quarter turn each way. The longer list, written
before the first car, is in [CHANGES-drift.md](CHANGES-drift.md). In short, all of it
on closed ground: a photo of the Signals tab standing, one after ten minutes of ordinary corners on
flat ground with slow ones among them (the steering is learned from slow corners only), one after a
drift on a skid pan, the log file, and one drift filmed from outside. And of the steering in
particular: its raw value on the Signals tab watched with the wheel held still and with the wheel at
its lock (does it flicker by a count), how fine one count is, and whether it is sent on a schedule
or only when it changes.

# Licence and credits

- The Proven Performance Solutions name and logo, and Proven's own code in `apps/pps_gauges`,
  `apps/pps_warmup`, `apps/pps_drag`, `apps/pps_drift` and `proven/`, are not under the kit's MIT
  licence: see the `NOTICE` file in each app folder. The same terms apply to the files in `proven/`.
- The idrive7-apps kit and its apps: MIT, by cauliflowermossgrape and contributors (`LICENSE` at the top
  level), except the GPU renderer in `kit/renderd` and the emulator's draw engine in `kit/emu`
  (GPL-3.0-or-later) and the Doom app with `third_party/doomgeneric` (GPL-2.0): see "Doom and renderer
  licences" in the kit's README. Fonts keep their own licences in their folders.
- The font of the four apps is Rajdhani, Copyright (c) 2014 Indian Type Foundry, under the SIL Open
  Font Licence 1.1: `kit/runtime/fonts/OFL-Rajdhani.txt`. Five characters it does not have are still
  the Ubuntu font's (Ubuntu Font Licence 1.0, `kit/runtime/fonts/UFL-Ubuntu.txt`): superscript 2 and
  3, the micro sign, the Greek mu and the tick. They are copied from the kit's Ubuntu atlases. Both
  licence files go into every app the kit builds. The font files themselves are not in this repository.
- Six more characters of the kit's set are in neither font: the four arrows, the box line and the
  cross. In each of the kit's own atlases all six had one and the same picture, the Ubuntu font's
  empty box for a missing character. That box is copied unchanged. So these six showed as an empty
  box before the new font, and they still do. The four apps draw none of the six. Of the five above
  they draw only the tick.
- The header of `UFL-Ubuntu.txt` (in `kit/runtime/fonts` and in `kit/localization/fonts`) is the kit
  authors' text. It says that the five atlases `bold.json`, `gear.json`, `label.json`, `light.json`
  and `num.json` were made from the Ubuntu font. In this copy that holds only for the characters named
  in the two points above. Everything else in the five atlases is Rajdhani, and `gear.json` holds
  nothing of the Ubuntu font. So this copy adds one paragraph to that header which says exactly that.
  The licence text below the header is unchanged. The file goes into every built app. Each atlas also
  says in its own `"source"` line what it was made from.
- The MHD flex ethanol reading (`apps/pps_gauges/mhdflex.js`) is adapted from the Flex Fuel app by Alex
  Perea (https://github.com/alexpereap/pereaperformance-idrive7-apps, MIT): its method, its requests and
  the two memory places for the B58 gen2. Its licence notice is in `apps/pps_gauges/NOTICE`.
- Proven Drag (`apps/pps_drag`) runs on the kit and follows two parts of it, both MIT: the kit's run
  timer (`kit/runtime/run_timer.js`), whose three states, creep rule and idle clock the timing engine
  in `run.js` keeps; and the kit's Drag Timer app (`apps/draggy`), whose wheelspin estimate from the
  car's acceleration is the fallback in `wheels.js`, and whose screen the Run and Best tabs follow.
  The kit's licence notice is in `apps/pps_drag/NOTICE`.
- Proven Drift (`apps/pps_drift`) is Proven's own work: how the angle is worked out, how a drift is
  scored, the screens and the drawn car are taken from no other drift app. It runs on the kit and
  keeps three things of it, all MIT: the scaling of the car's speed and of its two accelerations
  (`kit/runtime/car.js`), and the way the kit's Live Data app (`apps/live_data`) reads the handbrake's
  two states. Its poll scheduler, its saved file and its held-back log follow Proven Drag's. The kit's
  licence notice is in `apps/pps_drift/NOTICE`.

Unofficial software, not affiliated with, endorsed by or supported by BMW AG, MHD Tuning or Perea
Performance. Gauges are for a quick glance: set them up parked, and keep eyes on the road. Proven Drag
is for closed roads and track days only. Proven Drift is for closed circuits and skid pans only.
