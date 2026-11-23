# Proven Warm-Up 1.3.0: what changed, what was left, what to check on a car

> This is the working record of the changes as they were made and reviewed, before the first car. It was
> written before the public notes (README.md) were brought up to date for this version.
> Labels such as `warmup-B9` are the numbers the faults had in the pre-car review, and "the sceptic" is that
> review's second reader. The summary for users is in [README.md](README.md).
>
> **Update, 23 Nov 2026:** since this record was written, Proven has installed both apps through the MGU
> Store and run them on a car, and the BETA label came off with Warm-Up 1.3.1 and Gauges 1.1.1 (no change
> to the apps' code). The record below is left as it was written: where it says BETA, or that nothing
> has run on a car, read that as of the day it was written. The list in section 4, "What to look at on
> the first real car", is still to do: nothing is recorded of that car run beyond the apps installing
> and running.

Still BETA: nothing here has run on a car or a head unit. Everything below was checked on a PC only.

Files changed: `apps/pps_warmup/` (`warm.js`, `source.js`, `gearbox.js`, `main.js`, new `subscribe.js`, `NOTICE`,
generated `app.json`), `proven/tools/make_warmup_appjson.py`, `proven/tools/test_warmup.js`, new
`proven/tools/test_warmup_car.js` and `proven/tools/warmup_bench.js`. Nothing in `kit/`, `proven/README.md` or
`mgu-repo.json` was touched.

How it was tested (Node.js 24 on a Mac, from the repository's top folder):

```
python3 kit/tools/build.py --preview-only pps_warmup
node proven/tools/test_warmup.js dist/pps_warmup          # 350 checks, ALL OK, about 25 seconds
node kit/tools/preview.js dist/pps_warmup <a folder for the pictures> wait=8 render wait=45 render
```

The other app's test was run in the same copy as well, to see that nothing shared was disturbed
(`python3 kit/tools/build.py --preview-only pps_gauges`, `node proven/tools/test_vitals.js dist/pps_gauges`:
ALL OK). `dist/` and the picture folder were deleted afterwards.

The pictures from `preview.js`, and pictures of every new state drawn from the stand-in car in both gauge styles
and both units, were looked at one by one when 1.3.0 was first written. The corrections made after its review
(listed at the end of part 1) changed no drawing code and no wording on the screen; the `preview.js` pictures
were looked at again. The decision (`warm.js`) was put through random readings with its rules checked after
each one (a script that is not in the repository): 16 million before the review, which found the two small
faults listed in part 1, and 16.8 million after the corrections, with the corrected rules among the checks (a
dip only on an engine run in which the car was seen ready with the engine running; a time figure only after a
minute measured with the engine running; the gearbox left out only on the reader's evidence, with the engine
running, after 90 seconds of running). No rule was broken.

`test_warmup.js` ends by running `test_warmup_car.js`: the built app (the real `main.js`, `source.js`,
`gearbox.js`, `warm.js` and the kit's own read-only diagnostic link) started against a stand-in car on clocks the
test moves by hand. Run against a build of the published 1.2.1 (`WARMUP_TEST_ALL=1`, which goes on after a
failed check), 174 checks pass, 106 fail and 9 groups of checks stop at an error, so that the rest are not
reached; every fault below has at least one check that fails on 1.2.1 and passes now. Run the same way against
the 1.3.0 that was reviewed (commit 9976889), 314 pass and 36 fail: at least one for each of the review's
findings.

## 1. What changed

**warmup-B9 with kit-B1: an engine speed that stops arriving, and a car that has been left.**
An engine speed the car stops giving no longer counts as a running engine. After 3 seconds of "no value" in
its place, or 10 seconds with no engine speed at all, the app takes the engine as stopped: the screen reads
"Engine off" and the gearbox unit is no longer asked. Before, the last value was kept for good, and a car whose
last message was an idle speed was asked every 5 to 30 seconds until the head unit shut down (119 requests in
10 minutes in the test; now 0 to 3). The log says once per stop when the speed it stopped at was that of a
running engine. The app also reads the car's own "locked and left" state now (a new optional signal,
VehicleCondition, added through the generator and read the way the kit's Ambient config and eDrive read it):
while the car says it is parked or in standby with nobody in it, nothing is asked, unless an engine speed is
still arriving. A car that does not say its state is covered by two time limits: with the screen left on, the
gearbox unit is asked for 10 minutes after the screen was opened, and with only the widget for 3 minutes after
the engine last ran or the car last moved.

**warmup-B1: a gearbox that is left out stays left out.**
Once the gearbox has been left out ("gearbox oil not monitored") it stays left out through engine stops and
restarts, until a gearbox reading arrives or the app's memory is reset. A manual car on "Auto" no longer drops
to "Engine off, waiting for gearbox oil" at every set of lights and then shows 90 seconds of "Warming up" with
"Ease off" after the restart. The 90 seconds of engine running before the first leave-out are counted over the
engine run, not in one piece, so stop-and-go traffic gets there too: with 60 seconds running and 12 stopped, the
gearbox is left out about half a minute into the second stretch (before, such traffic alternated "Engine off,
waiting for gearbox oil" and "Warming up, keep below 4,000 rpm" for as long as it lasted). The memory still
ends with the app: after a head-unit start the 90 seconds are waited once more, so "Not monitored" remains the
right setting for a manual car.

**warmup-B2: a warm automatic no longer falls back to "waiting for gearbox oil".**
Four changes. (1) When the gearbox has no reading now and its last reading was in range (not cold, not too hot),
it counts on that last reading for the rest of the engine run, and the screen says so: the status line reads
"gearbox oil on its last reading", the gearbox row reads READY with "on its last reading, 75°C" under it, and
the big number is "--", so the old number is never drawn as live. This ends five minutes after the engine
stops. (2) When the unit is asked follows the kit's rule for a screen: with the screen open it is asked whether
the engine runs or not (while the car is driven, or for 10 minutes after the screen was opened); with only the
widget, while the car is driven; with the app closed and no widget, only until the car is up to temperature.
The reader also looks every second whether it may ask, so opening the screen brings a live reading within about
a second. (3) With the app closed, a gearbox that is read a little under its "safe from" on a car that is ready
(a dip, see the next fault) goes on being asked while the engine runs: a dipped reading is not counted on once
it has aged out, and without this the decision fell to "warming, waiting for gearbox oil" for about a second in
every 25. (4) A gearbox unit that did not answer while the engine was off (asleep with the ignition off, which
only a car can show) is asked again within a second of the engine's start. Without this the reader could be on
its 30-second pace, and a hot restart with the screen showing read "Warming up, keep below 4,000 rpm, waiting
for gearbox oil" for up to 30 seconds; in the test it is now up to temperature within 3.5 seconds of the start.
The same is done when it was the head unit's transport that kept refusing while the engine was off.

Sceptic's cases: S2 (45 s stop with the screen open) stays ready with a live reading; S3 (app closed) stays
ready with no requests at all, where it flapped to "warming" for 5 seconds in every 25; S3w (widget) stays
ready and live. A car that only has the car's own gearbox signal, arriving once a minute, stays ready too.

**The fault the warm-up sceptic added: coolant sagging in the middle of a drive.**
The rule, in one sentence: once the app has seen the car ready with its engine running, either at the end of a
warm-up it watched on that engine run or for two minutes of running, the car stays ready for the rest of that
engine run as long as every fluid that has a reading is no more than 15 °C below its "safe from"; a fluid that
dips is shown as dipped on its own row. "A warm-up it watched" means: the app read a fluid below its "safe
from", and then saw everything come into range while the engine was running. An engine run ends when the
engine has been off for 5 minutes, and also when the app itself has not run for 5 minutes. So coolant sagging
to 76 °C at 5,500 rpm keeps "Up to temperature"; the status line says "coolant has dipped below 80°C",
coolant's row reads "BELOW 80°C / dipped after the warm-up" with its live number, there is no rev advice, no
"Ease off", and no second full-screen announcement when it comes back.

What is never covered: a fluid more than 15 °C under (it is cold: "Warming up" returns at once), a fluid that
is too hot, a fluid with no reading, a limit that was just changed in Workshop settings, and a car that was
only found in range. That last one is the correction made after the review. A car is only found in range when
the engine is off (the head unit starting on a parked car: a new app cannot know how long the car stood), and
in the first two minutes of running after a start whose warm-up the app did not watch (the app has just
started, the engine was off for 5 minutes or more, or the car came into range while the engine was stopped).
Its sensors may be heat-soaked, so a fluid that settles under its "safe from" once the engine runs is "Warming
up", with the rev advice and "Ease off", as in 1.2.1. The two minutes are engine running time: a stop at the
lights does not count towards them and does not start them again. A car that gives no engine speed at all
never earns the rule. If the head unit sleeps, its forward-only clock stands still; the app notices the wall
clock jumping ahead and treats that as a long stop as well.

**warmup-B7: the time to ready.**
There is one cap, in the decision itself: no figure is ever above 60 minutes, and the status line, the rows,
the side column and both widgets all say "over 60 min" (">60 min" on the widget) from the same number. The
warming rate is measured on a running engine only: nothing is sampled while the engine is off, and what was
measured is dropped once the engine has been off for 30 seconds. No figure is given until a minute has been
measured that way; until then the rows and the side column read "WARMING UP". So a start after the ignition
was on for a while shows no figure for the first minute of running and then the real one (in the test "about
16 min"); the 1.3.0 that was reviewed showed "READY IN OVER 60 MIN" and "NOT WARMING" within seconds of such a
start, and 1.2.1 "about 343 min". A stop of under half a minute keeps the figure: the stop is then inside the
measured time and thins the rate a little. Before, a cold idle showed "about 50 min" rising to 250.

**warmup-B8: "Ease off".**
The line prints the engine speed that raised it (the highest of that burst), not the live one, which was often
already back under the limit; the live revs stay beside it marked "rpm now". It reads "on a cold engine" only
when engine oil or coolant is read below its "safe from"; when only the gearbox is behind it reads "before the
car is up to temperature". It is raised only while the car is warming up and a counted fluid is actually read
below its "safe from": a warm car that merely lost a reading is no longer told to ease off. And it is raised as
the car sends each engine speed, not once a second, so a short burst between two checks is caught.

**warmup-B12 with the kit sceptic's added fault on refusals from other apps: the gearbox reader.**
Every app receives every reply from a control unit, so a refusal can be the answer to another app's request.
The reader now never gives up an identifier that has answered; one that has never answered is given up only
after three refusals on three separate polls, 5 seconds apart; and once both identifiers are given up the unit
is asked again every 5 minutes instead of never. Before, one stray refusal ended the gearbox reading until the
app was restarted, and a gearbox last read cold then kept the car on "Warming up" for good.

**warmup-B10: the gearbox reading's age and the head unit's clock.**
A gearbox reading is live for 20 seconds on a clock that only moves forward. Before, the wall clock was used,
and if the head unit set its clock back an old reading stayed "fresh" for as long as the step. The wall clock
is still checked as well, so a clock set forward (or a head unit that slept) drops the reading rather than
showing it. The other half of the same fault is in the kit's diagnostic link, which paces its requests on the
wall clock and, set back by two hours, sends nothing for two hours. `kit/` was not changed; instead the reader
sets the link up afresh when a request has not come back for 30 seconds (at most 10 times), which gets it
asking again within a minute. `NOTICE`, `source.js` and the top of `gearbox.js` no longer call the reader the
kit's "unchanged": the changes are listed at the top of `gearbox.js`.

**warmup-B13: plausible temperatures only.**
Coolant outside -40 to 160 °C and engine oil outside -40 to 170 °C (the ranges Proven Gauges uses) are treated
as "no value": kept for 10 seconds, then the row reads NO READING. A raw 254 no longer shows as 206 °C and
"Too hot".

**warmup-B11: a failed start-up is tried again.**
A signal subscription that fails, and a diagnostic link whose set-up fails, are tried again after 5, 15 and 60
seconds, and every outcome is written to the log ("signal CDS error: ... (trying again in 5 s)", "signal CDS
subscribed (try 3)", "gearbox: no diagnostic link (trying again in 5 s)"). Before, one failure at head-unit
start left the app blind until it was restarted. An interface the head unit does not have is not tried again.

**warmup-B14, warmup-B15, kit-B4 and the added fault on the small widget's line length: the widget.**
Progress is measured from the lowest temperature of the engine run, so the bars no longer run backwards while
a temperature stands still, and a steady warm-up reads right (60 °C on the way from 20 to 80 is 0.67, not
0.50). The "Proven logo" switch now takes the logo off the widget too. The big widget shows "°C" or "°F" once,
at the right of its top line. Every text line of the small widget is 20 characters or fewer in every state
tried, in both units: the temperature line is now "Oil105 Gbx100 Clt110" (20 at most), and the unit moved to
the title, "Warm-Up, deg C" ("Warm-Up DEMO, deg F" is the longest title, 19). Its hint line reads "below 4000
rpm", "coolant dipped", "no gearbox temp" or "old gearbox temp", and the time reads "~12 min" or ">60 min".

**warmup-B3: the gearbox is left out on evidence, not on 90 seconds alone.**
Done, on top of B1, B2 and B12. The gearbox is left out only when it has never given a reading, the engine has
run for 90 seconds on this engine run and is running now, and the reader has evidence that this car gives
none. With "Car signal only" the evidence is that the car's own gearbox signal has never given a usable value.
With "Auto" it is that, and one of these from the gearbox unit:

- it refused both identifiers as unknown (NRC 11, 12 or 31), three times each;
- it left three requests in a row unanswered since the engine was last started;
- it gave twelve answers in a row (a minute of them) with no reading among them: a refusal for another reason
  (NRC 33, 22, 10, 7F and so on; not "busy" and not "pending"), a value outside -40 to 160 °C, or a 22 DA12
  value that has never moved (the kit only trusts that identifier once it has moved). The log says so once:
  "gearbox: 12 answers in a row from the gearbox unit and no reading among them".

The third kind is the correction made after the review. Without it a gearbox unit that is neither silent nor
refuses with 11, 12 or 31 (what a unit other than the ZF 8HP holds under these identifiers is not known) kept
the car on "Warming up, waiting for gearbox oil" for good, where 1.2.1 left it out after 90 seconds. What is
not evidence: a request the head unit's transport refused, a missing diagnostic link, and "busy". The gearbox
is never left out while the engine is off, and what the unit left unanswered with the engine off is forgotten
when the engine starts (a unit that sleeps with the ignition off is silent too); refusals are kept. While the
reader could not ask at all, the gearbox is waited for. A gearbox that has ever given a reading is never left
out any more: it is either counted on its last reading (B2) or waited for. A reading that arrives after the
gearbox was left out is used at once. The sceptic's S4 (transport 100 seconds late, gearbox really at 45 °C)
and S4b (no link at all) no longer produce a false "Up to temperature".

**Two smaller things found by the random testing of the decision before the review, and fixed with a check
each:** a limit changed in Workshop settings after the engine run was over brought an old gearbox reading
back; and "Ease off" stayed for up to 2.5 seconds with "keep below 0 rpm" when the rev limit was set to None
while it showed.

**What the review of 1.3.0 found, and what was done.** All six findings were reproduced on the reviewed
commit with the reviewer's own probe scripts before anything was changed, and all six were real.

1. *The dip rule was armed the first second the car read ready, also with the engine off and never seen
   running.* Fixed as described under the sagging fault above: it is earned with the engine running, by a
   watched warm-up or by two minutes of running in range. One point is stricter than the fix proposed: a car
   that comes into range while the engine is off (sensors soaking after a stop) has not been watched warming
   up either, and the two minutes count running time only.
2. *B7 was half fixed: the minute was a minute of readings, engine on or off.* Fixed as proposed.
3. *The B3 evidence was too narrow.* Fixed as proposed (the third kind of evidence above). Its side effect is
   accepted: a unit that answers 22 6000 with a value outside -40 to 160 °C is left out after a minute of such
   answers, as 1.2.1 did after 90 seconds.
4. *After three unanswered requests with the engine off the reader stayed on its 30-second pace through the
   start.* Fixed. Instead of the extra counter proposed, the count of unanswered requests starts again at the
   engine's start, which gives the same three quick requests and also means that silence with the engine off
   is not evidence for leaving the gearbox out. The same pace is reached when the head unit's transport keeps
   refusing while the engine is off (30 seconds of that, with the screen open); the engine's start ends that
   too. 1.2.1 had neither, because it never asked with the engine off.
5. *With the app closed, a dipped gearbox reading aged out and the decision flapped.* Fixed as proposed.
6. *The first leave-out needed 90 seconds of unbroken running.* Fixed as proposed, with one addition: the
   gearbox is only left out while the engine is running, so evidence that turns up with the engine off still
   leaves nothing out.

One more of the same kind was found while checking finding 1 and fixed with it: if the app itself did not run
for 5 minutes or more while both of the head unit's clocks went on (the engine running at its last look and at
its next), nothing ended the engine run, and a car that had cooled meanwhile was passed off as "dipped". No
feed for 5 minutes now ends the engine run.

Version raised to 1.3.0 in the generator; `app.json` was regenerated, not edited.

## 2. What was deliberately left, and why

- **warmup-B4** (engine oil and coolant have no age: if the car goes quiet without sending "no value", the last
  numbers stay on screen as live). Needs a car: what the car sends for the two temperatures at engine-off and
  ignition-off (0, 255 or nothing), and whether a periodic re-read returns 255 once the engine unit is off.
- **warmup-B5** (the first byte of 22 6000 is trusted as a temperature on any gearbox). Needs a car per gearbox
  type: compare the first reading with ISTA, and read the unit's identification (22 F150) on each. New in 1.3.0
  and related: an answer outside -40 to 160 °C is logged as "not used", and a unit that keeps answering with
  such a value is left out after a minute of them and 90 seconds of running ("gearbox oil not monitored"), as
  1.2.1 did. A first byte that is inside the range but is not a temperature is still shown as one (a raw 0
  reads -40 °C and keeps the car on "Warming up"): set "Car signal only" or "Not monitored" on such a car.
- **warmup-B6 with kit-B3** (the widget after a head-unit start without opening the app). Needs a car, and
  probably a kit change (passing the widget to the background part). A car must show: widget placed, head unit
  restarted, app not opened: does the widget fill, and does the log say "no screens for this start".
- **The kit sceptic's added fault on cars with no engine oil temperature on the car's signal** (the kit names
  the 330e). Needs a car: whether CDS gives an oil temperature at all, and what the engine unit answers.
  Unchanged: such a car stays on "Warming up" with NO READING for engine oil.
- **kit-B2** (started with the head unit only when installed through the MGU Store). A README matter and a car
  check of what the kit's own installer does; no code here.
- **warmup-B16** (wording on an electric car, heat soak after shut-down, rev advice while one fluid is too hot).
  Nothing of it fell out of the other changes.
- **The kit's diagnostic link paces itself on the wall clock** (`kit/runtime/readonly-diag.js`, `queue()` and
  `physical()`: `Date.now()`). The proper fix is in the kit: use `process.hrtime` there. Worked around in
  `gearbox.js` as described under B10.
- **A manual car on "Auto" whose head unit never gets a diagnostic link, or whose transport refuses every
  request,** now stays on "Warming up, waiting for gearbox oil" (NO READING on the gearbox row) instead of
  leaving the gearbox out after 90 seconds. That is the price of B3: when it cannot ask, the app cannot tell a
  manual car from an automatic with a cold gearbox. "Not monitored" fixes it per car.
- **The numbers in the new rules are judgement, not measurement:** 15 °C for a dip, two minutes of running
  before a car that was only found in range is covered, 30 seconds of engine off before the time estimate
  starts afresh, twelve answers without a reading before a gearbox unit counts as giving none. Each needs a
  car (part 4, items 6, 10, 12 and 2, in that order).
- **A car that comes into range within seconds of a start** (read a little under its "safe from" with the
  engine off, in range moments after the start, lower again once the coolant circulates) counts as a watched
  warm-up, so the drop after it is shown as a dip. Whether real sensors do that needs a car; the two-minute
  rule does not catch it.
- **A dipped gearbox with the engine stopped and the app closed is not asked** (the car must be able to go to
  sleep), so its reading ages out. Nobody sees that while the app is closed; opening the screen then shows
  "Engine off, waiting for gearbox oil" for about a second, until the unit answers. A restart with the app
  still closed is "warming, waiting for gearbox oil" inside the app for about a second, with no rev warning
  and no announcement.
- **A gearbox unit that answers but never with a reading goes on being asked every 5 seconds** while the screen
  is open or the car is warming up, as in 1.2.1 and the kit. Only a unit that does not answer is asked every 30
  seconds.
- **A fluid within 3 °C under its "safe from" after a long stop is still READY** if it was ready before (the
  3 °C hold is kept across stops, as in 1.2.1). Not in the fault list; left as it was.
- **The demo drive.** Its warm-up lasts 50 seconds, so in its first round no time figure appears any more (a
  figure needs a minute of measuring). From the second round on it shows wrong figures, and from the third
  "NOT WARMING" as well, because the history is carried across the demo's wrap-around: that was already so in
  1.2.1. Demo only; a longer demo warm-up, or a reset at each round, would fix it.

## 3. Sentences for the public notes

They are in [README.md](README.md) now.

## 4. What to look at on the first real car, in order

Read the app's log after each step; the lines quoted are the ones 1.3.0 writes.

1. **Cold head-unit start, app not opened.** In the log: "signal CDS subscribed", "signal Vehicle2
   subscribed", "gearbox: signal subscribed", "TASU proxy ready"; any "(trying again in ...)" lines and whether
   they end in "subscribed (try N)"; "signal VehicleCondition subscribed" or its error (then this head unit
   does not give the locked-and-left state); "no screens for this start" (B6); any "head unit's clock jumped
   ahead" line and by how much.
2. **Engine oil, coolant and gearbox oil against a tool you trust** (ISTA or a logger), cold and warm. On any
   gearbox that is not a ZF 8HP also note what the log says the unit answered: "gearbox: EGS 6000 -> N deg C"
   (with "not used" if it was outside the range), "gearbox: EGS refused 6000 (NRC xx)", "gearbox: EGS has no
   6000", "gearbox: EGS DA12 -> N deg C", and "gearbox: 12 answers in a row from the gearbox unit and no
   reading among them" (B5, B3).
3. **Engine speed while running.** Idle for two minutes and hold a steady cruise for two: the log must not
   show "engine speed: no more from the car" and the screen must not read "Engine off". If it does, the 10
   second rule is wrong for this car.
4. **Ignition on, engine not started, the app's screen open.** Does the gearbox row show a number (the gearbox
   unit answers with the engine off), or NO READING with "gearbox: no answer from the gearbox unit" in the
   log? Then start the engine: the gearbox number should be there within about 3 seconds. On a warm car the
   status should go to "Up to temperature" in that time, not stay on "Warming up, waiting for gearbox oil".
5. **Switch-off.** With the screen open, switch the engine off and watch: "Engine off" at once (the car sent
   0), or after 3 to 10 seconds with the log line "engine speed: no more from the car after N rpm" (the car
   left a running value behind, B9). Then leave the ignition off and note what engine oil and coolant show
   after 1, 5 and 30 minutes: frozen numbers, "--" or nothing (B4).
6. **A hot restart, after 10 minutes parked and again after 30.** Note the engine oil and coolant numbers just
   before the start, and 20 seconds, 1 minute and 2 minutes after it, and what the status line says each time.
   This is what the two-minute rule rests on: do the numbers fall once the engine runs, by how much, and for
   how long. If they are still falling after two minutes, two minutes is too short. A fluid that settles
   under its "safe from" must read "Warming up" with the rev advice, not "dipped".
7. **Lock the car and walk away with the app's screen left on.** After unlocking, the log should show "the car
   is locked and left: the gearbox unit is not asked" and later "the car is in use again". If neither line is
   there, this car does not say its state and only the 3 and 10 minute limits apply; check that the car goes
   to sleep as it does without the app (kit-B1).
8. **Start-stop on a warm automatic,** screen open: the status stays "Up to temperature" through the stop and
   the gearbox number stays live. Then the same with the app closed and reopened at the restart: a live
   gearbox number within a second or two, never "Warming up" (B2).
9. **A manual car left on "Auto":** "Warming up, waiting for gearbox oil" for about 90 seconds of running,
   then "Up to temperature ... gearbox oil not monitored"; it must stay so through a stall or a stop at the
   lights, and in stop-and-go traffic it must get there once the engine has run 90 seconds in all (B1, B3).
   Log: "gearbox: no answer from the gearbox unit".
10. **Coolant under sustained load,** and with Max Cooling on if the tune has it: does coolant fall under its
    "safe from", by how much, and does the row read "BELOW 80°C" while the status stays "Up to temperature".
    If it falls by more than 15 °C the status goes back to "Warming up": note the lowest number. If coolant
    never reaches 80 °C on that tune the car never becomes ready: lower "Coolant: safe from" for it.
11. **A short burst past the rev limit while cold:** "Ease off" appears and names the peak of the burst, and
    goes about 2.5 seconds later (B8).
12. **A cold start with the ignition on for a minute or two first:** no time figure during the first minute of
    running, and never "NOT WARMING" or "over 60 min" just after the start; then figures that count down
    sensibly; none above "over 60 min". Switch the engine off for a minute during the warm-up and start
    again: the figure goes, and comes back after a minute of running (B7).
13. **The widget on an iDrive 7 home screen.** Small: all five lines complete, with three-digit values and in
    Fahrenheit ("Warm-Up, deg F", "Oil230 Gbx212 Clt230"); big: the unit at the top right is inside the picture
    after the head unit's cropping; the logo goes with the "Proven logo" switch (B15, kit-B4).
14. **The widget after a head-unit restart, app not opened** (B6, kit-B3).
15. **Other apps beside it.** With Proven Gauges (and any kit app that reads the gearbox unit) running, the log
    should not show "EGS has no 6000" on a ZF 8HP; "EGS refused 6000 ... asked again" is harmless (B12).
16. **iDrive 8:** the new lines under the rows ("on its last reading, 75°C", "dipped after the warm-up") and
    the longest status lines fit on that screen.
