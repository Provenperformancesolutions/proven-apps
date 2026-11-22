# Proven Gauges 1.1.0: what changed, what was left, and what to check on the first car

> This is the working record of the changes as they were made and reviewed, before the first car. It was
> written before the public notes (README.md) were brought up to date for this version.
> Labels such as `gauges-B3` are the numbers the faults had in the pre-car review, and "the sceptic" is that
> review's second reader. The summary for users is in [README.md](README.md).

Proven Gauges 1.1.0 is still BETA. **Nothing in it has run on a car or on a head unit.** Everything below was
checked on a PC: the data layer against a stand-in car and stand-in control units with a clock the test moves
by hand, and the drawing with the kit's PC stand-in for the head unit. Every figure from those runs is a
simulation, not a car measurement.

Files changed: `apps/pps_gauges/` (vitals.js, main.js, faces.js, demo.js, NOTICE, and app.json through its
generator), `proven/tools/make_appjson.py`, `proven/tools/test_vitals.js`, and four new files beside it:
`fakecar.js` (the stand-in car), `test_engine_unit.js`, `test_ethanol.js`, `test_screens.js`. Nothing in
`kit/`, `proven/README.md` or `mgu-repo.json` was touched.

The first two commits of this work are 1.1.0 as it was written, and the corrections after a review of it
(section 1a). Later commits added the third ethanol choice, "MHD flex", and corrected it after its own
reviews: section 1b, with new files `apps/pps_gauges/mhdflex.js` and `proven/tools/test_mhdflex.js`. Sections
1 to 4 describe the app as it is after all of them.

How the tests were run (Node.js 24 on a Mac, from the top of the repository):

```
python3 proven/tools/make_appjson.py .
python3 kit/tools/build.py --preview-only pps_gauges
node proven/tools/test_vitals.js dist/pps_gauges          133 checks, all passed
node proven/tools/test_engine_unit.js dist/pps_gauges     121 checks, all passed
node proven/tools/test_ethanol.js dist/pps_gauges          55 checks, all passed
node proven/tools/test_screens.js dist/pps_gauges          45 checks, all passed
```

(These are the counts of the two commits. With the MHD flex choice of section 1b there are five test
files and 487 checks: the list is near the end of that section.)

`test_screens.js` takes a folder as a second argument and then saves a picture of every state it draws
(a car that sends nothing, a manual car, the ethanol read-out with and without a reading, and so on):
states the demo drive never shows. The same four files were also run with `PPS_TEST_ALL=1`, which lists
every failed check instead of stopping at the first (a part that stops on an error counts as one check):

- against a build of the published 1.0.3 (commit f461b7d): 37 of 71, 65 of 107, 13 of 20 and 31 of 45
  checks failed, at least one for every fault in section 1;
- against a build of the first 1.1.0 commit (f437fec): 20, 22, 0 and 4 checks failed, at least one for
  every correction in section 1a.

The five gauge sets were also drawn with `kit/tools/preview.js` (demo drive): every picture was written,
and the one warning in its output, "TASU: Error: preview", is the PC stand-in saying that it has no
diagnostic link. vitals.js and main.js were parsed as ES2017 (what Node 8 has) without an error, and the
kit's `test_id8_ui.py` (506 checks) and `test_fit_to_unit.py` (12 checks) still pass. `make_appjson.py`
was run again after the corrections: app.json came out unchanged.

## 1. What changed, fault by fault

**gauges-B2, demo values left in the traces.** The demo drive and the car no longer share anything that
is drawn over time. When one takes over from the other, the 5-minute histories, the 60-second boost trace
and the g trail are emptied at once, in both directions. Test: `test_vitals.js`, "demo data and the car's
never share a trace".

**gauges-B3, readings that never expired.** A reading the car replaces with its "no value" marker, or with a
value outside its plausible range, is kept for 10 seconds and then dropped: the gauge shows "--" and the
tile says "no value from the car" or "not a real value". A reading whose signal is merely silent is kept,
because the car only sends a value when it changes. A tyre pressure outside 0.5 to 6 bar is dropped at
once: the tyre shows "--" with "out of range" under it, never its last healthy number, and the tyre in the
picture is drawn grey instead of in its temperature colour. ("Out of range" and not "not a real value":
the number may be the car's marker for no data, and it may be a tyre that really is flat.) Boost and oil
temperature taken from the engine unit are dropped 15 seconds after its last answer, like its other
values. The old check "no value: keeps the last reading" was replaced by checks of the new rule. Tests:
`test_vitals.js`, "a reading the car takes back, or sends out of range"; `test_engine_unit.js`, "boost
from the engine unit ages like its other values" and "a car that never sends an oil temperature";
`test_screens.js`, "gauges-B3" and the tyre colour check after it.

**gauges-B6, and the sceptic's added fault: a unit that does not answer.** The engine unit and the gearbox
unit are now counted apart. A unit that gave no reply of any kind to 3 requests in a row is given up: it
gets one single request after 30 s, then after 1, 2, 5 and 10 minutes and from then on every 10 minutes.
It counts as there again from its first reply, with all its values: a unit's silence is counted on the
unit only. No value of it is put on a wait of its own for it, and no value moves on to its next
identifier because the unit slept. A gateway that turns requests to a unit away at once ("target not
reachable") is treated the same. The tiles say "not answering", the boost dial "engine unit: not
answering", and the log says when a unit was given up and when it answered again. The gearbox unit's
requests wait 1.5 s for a reply instead of 4 s (as the kit's own gearbox reader does). A request nobody
answered ends the try for that value instead of going through its other identifiers. One identifier that
gets no answer while its unit answers the other requests is a different case: unless it has given a value
before, the value starts with its next identifier the next time, and after three tries in a row without
a value it rests 30 s, then twice as long each time, up to 10 minutes.

*An engine start* asks a given-up unit once at once, and its waits start again at 30 s; a unit that was
about to be given up is counted afresh. An engine start is the first engine speed above 400 rpm after any
of these: a speed under 400 rpm, no engine speed for 10 s, or the car's "no value" for 10 s. All three are
covered because nobody knows what the signal does on these cars when the engine stops; the log says which
one it was ("engine speed above 400 rpm, taken as an engine start (before it: ...)"). If the engine
starts while the unit's one request is still out, the unit is asked again as soon as that request has
timed out. So that a unit that is not there at all is not asked at every start of an engine with automatic
start-stop or of a hybrid, an engine start counts for a unit that keeps silent only 30 s after the last
one that counted, then 1, 2, 5 and 10 minutes.

Simulated as the sceptics and the reviewer did. With a silent gearbox unit on the Boost set: 7 requests
to it in 10 minutes instead of 36, the longest wait between two boost-target readings 2.0 s instead of
8.5 s, and the engine unit read as often as on a car with a gearbox unit (972 intake-air reads against
987). With a silent engine unit: 7 unanswered requests in 10 minutes instead of 50 to 97, and the gearbox
temperature fresh 100 % of the time instead of 22 to 70 %. A fuel stop with the app left on the Boost set
(engine unit asleep for 60 to 900 s, the transport held 0 or 6 s by each unanswered request): every
engine-unit value back 0.5 to 0.9 s after the restart, whichever way the engine speed had ended. The app
opened 3 to 40 s before the engine is started, the engine unit asleep until then: every value there 0.4
to 4.6 s after the start, and intake air read from its own sensor. A unit that never answers and an
engine that starts every 45 s: 12 unanswered requests in 20 minutes, 2 of them in the second 10. Tests:
`test_engine_unit.js`, the parts from "the gearbox unit never answers" to "an engine speed that only
arrives every 12 s".

**A busy transport (from ethanol-B5; found while doing B6).** When the head unit's diagnostic transport
turns a request away because it is busy with someone else's, the round now ends there and is tried again
at the next one. It no longer counts as a failed value, and it no longer passes to the value's next
identifier. In 1.0.3 this moved "Intake air" to its second identifier, the charge air cooler's sensor,
whenever the transport was busy at the wrong moment (reproduced: 55 °C shown in place of 30 °C). A reply
that is lost once does not move a working identifier either. The log now says which identifier each
value is read from ("timing: read from DME F40E (2 of 2)"). Tests: `test_engine_unit.js`, "the transport
is busy with someone else's request" and "a reply that is lost once".

**gauges-B7, "Against target".** The engine unit's boost target and its own actual boost are read back to
back and kept as one pair. "Against target", the "Target" figure and the white marker on the dial all
come from that pair and are blank once it is older than 2.5 s. "Against target" is therefore the engine
unit's actual boost less its target, no longer the sport display's boost less a target up to 15 s old.
If the engine unit gives a target but no actual boost, "Against target" stays blank. The target line in
the 60-second chart keeps a reading for 6 s, because off the Boost set the engine unit is only asked
every 5 s. Tests: `test_engine_unit.js`, "boost against target comes from one round"; `test_screens.js`,
"gauges-B7".

**gauges-B9, cars set to psi.** Sport-display boost and the tyre values come in the car's own display
units, so they now wait until the car has said which units it uses (at most 8 s; normally it is read at
start). Nothing is shown in a guessed unit before that; the boost dial says "sport display: waiting for
car units". Once the car has named a unit, a later unit message the app cannot read (an unknown number,
or none) changes nothing. If the car never says, the pressure unit is told by the size of the tyre
pressures: the largest of the four decides (0.5 to 6 is bar, 7 to 60 psi, 60 to 600 kPa), and all four
tyres and the car's targets are read in that one unit. A tyre going flat on such a car therefore reads
low and then "--", and is not read as a healthy number of a smaller unit. A smaller unit than the one
found is only believed when three tyres say so at once. The screen says that the unit is a guess: "Car's
units unknown: pressures read by their size." on Tyres, and "car's units unknown: sport display read as
psi" (or "as bar / kPa") under both boost dials; the log says which unit was found. Fahrenheit is never
inferred from psi: tyre temperatures are °F only when the car says so. When the car's unit changes, the
values taken in the old unit, the boost peak and the boost trace are dropped. Tests: `test_vitals.js`,
the four "gauges-B9" parts; `test_screens.js`, "a car that never names its units".

**gauges-B8, numbers sitting on the ceiling of their field.** Kept narrow. (a) The sport display's boost
at raw 254, the largest number its one-byte field holds (255 is the car's "no value"): no reading, the
dial says "sport display: at its limit" and the engine unit is asked for boost. (b) Engine-unit boost
from the one-byte manifold pressure (F40B / OBD 0B) at 255 kPa: no reading, the next identifier is tried.
(c) Boost target 4AB0 and actual 580B at raw 65535 (2560 hPa): no reading, the next identifier (F470 /
OBD 70, which has no such ceiling) is tried. (b) and (c) are done in app.json by setting "max" one step
under the ceiling. (d) With "Boost from" on Auto, a sport-display reading the car has taken back ("no
value", for instance straight from 253 to 255) is still kept for 10 s like every reading, but the dial
shows the engine unit's boost instead as soon as there is a fresh one the app trusts. Tests:
`test_vitals.js`, "the sport display's boost at the top of its field"; `test_engine_unit.js`, "boost
numbers on the ceiling of their field" and "Auto: above the sport display's ceiling".

**gauges-B10, and the sceptic's added fault about peaks.** All peaks (rpm, boost, torque, power and the
three g peaks) are now taken in the data layer as the values arrive, so also while navigation or CarPlay
is on the screen. The per-frame call is kept only so a held peak drops back while nothing new arrives.
The g peaks count only once the sensor has been zeroed: each of the two axes has sent 3 readings while
the car had been standing for more than 2 s with the app running. Until then Track says "Peaks count
after a stop that zeroes the g sensor". No time is promised, because how often the car sends the
accelerations at a standstill is not known; the log says when it happened ("g-force: zeroed at a
standstill ... s long"). A reading beyond 2.5 g is not an acceleration of a car: it raises no peak and is
treated like any other out-of-range value. Tests: `test_vitals.js`, "peaks are taken where the values
arrive"; `test_screens.js`, "gauges-B10" and "after a standstill".

**gauges-B12, an estimated gear.** A gear the car did not send, worked out from engine speed and road
speed, is drawn as the number alone with "EST.". There is no "D" in front of it. S and M are still shown
when the car itself says so. Test: `test_screens.js`, "gauges-B12".

**gauges-B13, "EST." on the GEAR label.** On Street "EST." now stands beside the label ("EST.  GEAR").
`test_screens.js` checks on every set and in every state it draws that no two texts lie on top of each
other; run against 1.0.3 it reports this one.

**gauges-B14, raw values in the log.** M Vitals' raw-value logging is carried over: the first 12
different raw values of each doubtful field (engine temperatures, both accelerations, sport-display boost
and g, sport-display power and torque %, torque, gearbox oil, outside temperature, the tyre pressures,
targets and temperatures, gear selection, gear programme, the car's units), the gearbox status with the
D / S / M letter read from it, and the first 6 different replies of every identifier asked of the engine
unit ("raw DME F40F: "62 F4 0F 46 = 30"") and the gearbox unit ("raw EGS 6000: ..."). What the notes in
app.json promise ("raw gearbox oil", "raw FES boost", "raw tyre temperature", "raw EGS") is now really
logged, and a test checks each name. One field is subscribed only to log it: the sport display's own
maximum power and torque ("raw sport display maximum"), to see whether the car can supply its own 100 %.
Engine speed is not logged raw; what it did before each engine start is (see gauges-B6). Tests:
`test_vitals.js`, "raw values go to the log"; `test_engine_unit.js`, first part.

**gauges-B15, engine oil from two sources.** The engine unit's oil temperature is used only while the
car's own signal has none: it never delivered one in the first 15 s, or the car marks it "no value". A
signal that is merely steady is left alone, so the reading no longer steps between the two sources.
Once a session the engine unit's value is read all the same and both are written to the log ("oil
temperature: the car's own signal reads 106 deg C, the engine unit 108 deg C"), because nobody knows
whether they differ. Test: `test_engine_unit.js`, "engine oil from the engine unit only when the car has
none".

**The diesel fuel-rail ceiling (the sceptic's added fault).** With a diesel engine (the Engine setting, or
the car's own engine type) rail pressure is accepted up to 2700 bar instead of 500. On a petrol engine
500 bar stays the limit. An answer that is out of range no longer puts a value on the 30-second wait, so
the tile is back as soon as the pressure is plausible again. Six-digit values (a diesel in kPa) are drawn
smaller so they stay inside the tile. Tests: `test_engine_unit.js`, "a diesel's rail pressure";
`test_screens.js`, "a diesel's 2000 bar in kPa".

**"Peak, 60 s" (the sceptic's added fault).** Renamed, not reset: the figure is now "Chart max". It is the
highest point of the 60-second chart, and "Reset peaks" still does not change it, because emptying the
chart on a reset would lose the trace. Test: `test_screens.js`.

**gauges-B11, what "Start" is (wording only).** The Tyres panel is titled "Since app start", and its two
lines read "Start = the first reading after this app was opened / or after Reset peaks, not the start of
the drive." Test: `test_screens.js`, "gauges-B11".

**gauges-B16, the bar ends.** Done as the two-line change: the power and torque bars end at the number
set, not at the next round one (285 kW ends at 285, 500 Nm at 500). Test: `test_screens.js`, "gauges-B16".

**The head unit's clock (the ethanol sceptic's added fault).** Every time stamp in vitals.js is now on the
forward-only clock (process.hrtime), as main.js already did for the start-up logo: the "no value" 10 s,
the 15 s freshness of engine-unit values, peak hold, the 5 s before Auto demo, the waits and rests. A
clock set back no longer keeps an old reading "fresh", and a clock set forward one second after the
start no longer brings up the demo drive. The kit's link paces its requests on the wall clock; where its
"earliest next request" lies more than 2 s in the future (a clock set back), vitals.js clears it, so
reads go on instead of stopping for the size of the step. Tests: `test_vitals.js`, "the head unit sets
its clock"; `test_engine_unit.js`, last part; `test_ethanol.js`, X5.

**gauges-B4, power.** What was chosen: **Power from ships as "Torque x rpm"**, and the sport display's
percentage can only be used after someone has entered what 100 % is on this car. Why: torque x rpm is
worked out from two of the car's own figures, while percentage x 285 kW showed a typed-in constant as a
measurement on every car where nobody had set it. In detail: "Max power (100% on sport display)" is a new
setting that ships as "Not set" and is only offered when "Sport display % x max power" is chosen; while
it is not set, or the percentage has not moved, torque x rpm is shown. The percentage is limited to
0 to 100 and counts only once it has changed, so a sport display stuck at 0 % no longer reads 0 kW for
good. Cars that saved the old default go back to torque x rpm once. The old "Max power" setting is now
"Power gauge max" and only sets the bar's scale (300 kW as shipped). Following the sceptic's caution,
both sources are worded as estimates: the bar reads "Power est. (torque x rpm)" or "Power est. (sport
display)". The torque figure is the engine unit's own calculation and ends at 1023.5 Nm; it is not
verified on tuned cars. The demo drive's torque was shaped so its power stays on a 300 kW bar. Tests:
`test_vitals.js`, "power is not a typed-in maximum"; `test_screens.js`, "gauges-B4".

**The ethanol read-out (new).** Setting "Ethanol reading" under a new "Workshop settings" switch, shipped
Off. Choices: Off / Engine unit value (550D) / OBD value (PID 52). One source per car; the other is never
tried in its place. The OBD choice asks service 01 PID 52 and, if that gives nothing, the same PID over
UDS (22 F452), and the strip says which of the two answered. 550D and PID 52 are the two identifiers the
kit's Live Data app lists; F452 is in no kit app, it is the form the public mgu-ethanol app (The
Unlicense) also asks, and it got no reply on that app's one car. Value = raw x 100 / 255. It is drawn on
the Boost set as a strip at the top of the right column, "ETHANOL  E27" with "engine unit, value 550D"
(or "OBD PID 52") under it, in the bold font, which has every letter. Without a fresh answer it reads
"ETHANOL  NO READING" with the reason under it: "not on this car", "no answer to 550D", "refused by the
engine unit", "not a plausible value", "engine unit not answering", "engine data off", "no diagnostic
link", "link down", "reading..." or "demo: not read". With the setting Off nothing is drawn and the Boost
set is as before.
- It has a slot of its own: one request at most every 30 s, last in a round, never among the values read
  fast, only while the strip is on screen and only from an engine unit that answered something in the
  last 20 s. A reading is shown while it is under 100 s old, never longer, and it ends at once when the
  engine unit's next answer is a refusal or not a plausible value.
- An identifier the engine unit says it does not have (NRC 11, 12, 31) rests 10 minutes. One that was not
  answered, or refused for another reason, is asked again after 30 s, 3 times in all, then rests 10
  minutes with one try per rest. A refusal from an identifier that has already given a value is retried
  the short way too, because every app hears every reply and a refusal meant for another app looks the
  same.
- Raw 255 and anything above 90 % is no reading ("max" in app.json). Raw 0 is shown as E0: nobody knows
  whether a stock engine unit answers 0 here, which is why the setting ships Off.
- "Workshop settings" is a plain switch in the ordinary settings list, as in Warm-Up. Nothing stops a
  customer from opening it and switching the read-out on for a car that was never compared.
- Nothing is shown in demo mode, nothing is remembered, nothing is entered by hand, and demo.js has no
  ethanol value. These two choices use read requests only (UDS 0x22, OBD 0x01, through the kit's
  read-only link). The third choice, "MHD flex", added later, does not: see section 1b.
- The first raw replies go to the log: "raw ethanol 550D: "62 55 0D 66 = 40"".
- The sceptic's simulations were run again on this code (`test_ethanol.js`, parts A to K and X1 to X5,
  and part H for the unreachable engine unit): with 550D answering, 20 requests in 10 minutes, never two
  within 30 s, and exactly as many intake-air reads as with the setting off (987). With 550D never
  answered: 4 unanswered requests in 15 minutes (at 1, 31, 61 and 664 s); with the transport held 0 to
  12 s by each of them no other value went stale, none was counted as failed and none changed its
  identifier. With a 20 s hold, longer than the 15 s the tiles keep a value, the other values were blank
  in 2.6 % of the samples. The prototype's faults are gone: a first reply lost once, or "conditions not
  correct" for the first 20 s, gives a value after 31 s instead of about 600 s; there is no pause of all
  engine-unit reads (longest gap between two boost reads 3.6 s with a 3 s hold, 9.9 s before); a clock
  set back an hour changes nothing. The corrections of section 1a left the output of `test_ethanol.js`
  unchanged, line for line.

**Plainly: the ethanol read-out is unproven on every car.** Nobody has recorded what an engine unit with
an MHD flex-fuel kit or a Motiv ReFlex answers to 550D or PID 52, and on the one car anyone tried, the
head unit could not reach the engine unit at all. It may show nothing on these set-ups, or a constant
such as E0 that looks measured. It must be compared with the tuner's own app at two different blends on
each car before a customer is told to trust it, and it stays Off until then.

## 1a. Corrections after the review of the first 1.1.0 commit

A reviewer ran the first commit against more simulations and found seven things. Each was reproduced here
first with the reviewer's own probe scripts; all seven were real. Each now has checks that fail on the
first commit and pass on this one.

1. **An engine start was only seen after 0 rpm (must-fix).** Real. After a fuel stop the engine-unit
   tiles stayed "not answering" for 35 s to 4 minutes (by design up to 10) when the engine speed had ended
   in "no value", had just stopped arriving, or rested at a run-down value such as 160 rpm; and a start
   that fell while the unit's one request was out was undone by that request's time-out. Fixed as
   described under gauges-B6. Two things were done differently from the suggested fix, both because the
   suggested one brought gauges-B6 back in simulation: with it, a gearbox unit that is not there got 100
   unanswered requests in 20 minutes on a car whose engine speed only arrives every 12 s, and 29 to 63
   with an engine that starts every 20 to 90 s. So an engine start counts for a silent unit only after
   30 s, 1, 2, 5, 10 minutes (9 to 13 requests in 20 minutes in the same runs). And a unit that is about
   to be given up when the engine starts is counted afresh: without that, the app opened 10 to 14 s before
   the start still waited 32 s. Tests: `test_engine_unit.js`, the four "a fuel stop" parts, "the engine is
   started while the one request ... is still out", "the app is opened ... before the engine is started",
   "never answers, and the engine starts every 45 s", "an engine speed that only arrives every 12 s".
2. **Intake air stayed blank for minutes after the unit answered again (must-fix).** Real: every
   unanswered request of a given-up unit was also counted against the value that happened to be asked,
   and doubled that value's own wait. Fixed: a unit's silence is counted on the unit only. Checking this
   turned up a second fault with the same cause, which the review had not listed: while the unit slept,
   every unanswered request also moved the value one identifier on, so when the app was opened before the
   engine was started, "Intake air" was read from the charge air cooler's sensor afterwards on an engine
   unit that has one (55 °C in place of 30 °C in most of the simulated cases). That is fixed with it: a
   value only moves to its next identifier when its unit answered the request before. Test:
   `test_engine_unit.js`, "the engine unit asleep for 240 s" and "the app is opened ... before the engine
   is started".
3. **A flat tyre shown as a healthy number on a car that never names its units (must-fix).** Real: 5 psi
   was shown as 72.5 psi, 3 psi as 43.5 psi, and on a kPa car 30 kPa as 30 psi (which also turned the
   sport display's boost to psi). Fixed as described under gauges-B9. Beyond the suggested fix: a smaller
   unit is only believed from three tyres at once, so a message with only the low tyre in it does not
   turn the unit; and after the unit found has changed, the last sport-display boost message is not read
   again in the new unit, because it may be of the old one. Tests: `test_vitals.js`, "a tyre going flat
   is not a healthy number of another unit"; `test_screens.js`, "its tyres at 35 / 35 / 38 / 5 psi".
4. **An unreadable unit message blanked boost and tyres (should-fix).** Real: after the car had named its
   units, one message with a pressure unit the app does not know set the unit back to unknown, and the
   values stayed blank until the car named a unit again. Fixed as suggested. Test: `test_vitals.js`, "a
   unit the app does not know never takes the place of one the car has named".
5. **The dial held 25.3 psi for 10 s above the sport display's ceiling (should-fix).** Real when the car
   goes from 253 straight to "no value". Fixed as suggested (gauges-B8 (d)). Test: `test_engine_unit.js`,
   "Auto: above the sport display's ceiling".
6. **"Peaks count once the car has stood still for 2 s" was not what the code did (should-fix).** Real: it
   took 2 s plus 10 readings of each axis. Now 3 readings, and the note, the public sentences and the
   first-car list promise no time. A log line was added that says when the sensor was zeroed. Tests:
   `test_vitals.js`, "peaks are taken where the values arrive"; `test_screens.js`, "gauges-B10".
7. **"not a real value" under a flat tyre, beside a green tyre (should-fix).** Real. The tyre card now
   says "out of range", and a tyre without a pressure is drawn grey (its temperature figure keeps its
   colour). Test: `test_screens.js`, "gauges-B3" and the check after it.

## 1b. The third ethanol choice, "MHD flex" (added after the two commits above, then corrected four times after its own reviews)

Added for cars with an MHD flex-fuel sensor.
As far as Proven knows (from MHD's description of its flex-fuel kit; not checked on a car), the sensor
reports to the engine unit on PT-CAN2, a bus the head unit is not on, so the head unit cannot pick the
reading "off the CAN bus" itself. The tune keeps two bytes in the engine unit's working memory, "Ethanol
Content (Active)" (what the tune runs on) and "Ethanol Content (CAN)" (what the sensor says), and MHD's own
app gets them by asking the engine unit to make a temporary identifier out of the two memory places and
reading that identifier. The public "Flex Fuel" app by Alex Perea (pereaperformance-idrive7-apps, MIT) does
the same from the head unit and gives the requests and the two places for the B58 gen2. This choice follows
that app: new file `apps/pps_gauges/mhdflex.js`, adapted from its protocol.js and poller.js, with its
copyright and licence notice in the app's NOTICE.

**It is not read only, and that is said where it is chosen.** The choice is labelled "MHD flex (not read
only)", under Workshop settings, and ships Off like the other two. The switch "Engine unit data", which
lets it go, no longer carries the words "(read only)". Three of its requests are not reads:

| step | request | what it is |
|---|---|---|
| identify | `22 F1 01` | a read: the list of the software the engine unit runs now, which names its program family |
| probe | `2F 04 4D 48 44` | not a read: "are you MHD?". A tuned engine unit answers with MHD's marker, any other refuses |
| clear | `2C 03 F3 03` | not a read: forget our temporary identifier (a refusal means there was none) |
| define | `2C 02 F3 03 14 <place> 01 <place> 01` | not a read: make the temporary identifier from the two memory places |
| read | `22 F3 03` | a read: the two bytes, % ethanol each |

According to the reference app's notes the definition is temporary: the engine unit forgets it at the next
ignition cycle, and the app then defines it again. Nothing is written to the tune or to the engine unit's
stored settings by any of these requests as far as those notes go. **Proven has not seen any of this on a
car.**

What keeps it narrow. Each point has a check in `proven/tools/test_mhdflex.js` (128 checks) unless it says
"no check of its own":

- **Order.** The identification comes first and is one read, `22 F1 01`: the list of the software the
  engine unit runs now. It is read strictly: 17 bytes of header with the number of entries, then entries
  of 8 bytes, and exactly one program among them, whose id must read 00 00 and then the family (an id
  with anything in its first two bytes is another program). Only that family, if it is in the app's
  list, gets the probe; a list of another shape, a refusal or no answer is "software not identified",
  and two programs, or a program that is not in the list, are "software not supported". Bytes that
  look right but lie off that grid are not read at all. (Eleven such answers in the test, and one that
  never comes: none gets a request that is not a read.) Only an engine unit that answered the probe with MHD's marker
  ("MHD2") gets the definition. The reference app probes first, and it identifies from two lists, `22
  F1 01` and `22 F1 02`, taking a family from either; on the one car it was recorded on, the second list
  names a second program family. As far as Proven knows that second list is not the list of what the
  engine unit runs now (not checked on a car). The first version here did the same (found in the third
  review): an engine unit whose `22 F1 01` named another program would have been sent the probe and the
  definition when its `22 F1 02` named 5D55. `22 F1 02` is no longer asked. The list recorded on the
  reference car is read as one family, 5D55. Whether every engine unit's list has this shape is not
  known: one that has not reads "software not identified" and gets nothing but that read.
- **One engine program in the list: family 5D55, the B58 gen2**, with the two places from the reference
  app. Any other program reads "ETHANOL  NO READING / software not supported", and the log line "program
  family ... is not in the list ... Ids: program ..., calibration ..." has what a new entry needs. **The
  S58 is in that state until its two places are known** (see "left").
- **The Gate: what, whether, how often.** The three non-read requests can only leave through
  `Gate.send()` in mhdflex.js, and the Gate looks at each one twice: when it is handed to the Gate, and
  again when the kit hands the bytes on to its call into the head unit, at every try (the kit tries a
  busy transport again for up to a second).
  - *What:* `check()` lets through exactly the probe, the clear of F303 or F301, and the definition of
    F303 or F301 from the two places of one list entry, to the engine unit (0x12) only. 29 other requests
    are refused in the test (a write, a memory write, a session change, a reset, clearing faults, MHD's
    own identifiers F300 and F302, a definition with one place moved by one, lists with a gap in them, and
    so on). A request changed on its way through the kit (the test makes the kit do that) is stopped at
    the second look and logged as blocked.
  - *Whether:* the setting. MHD flex chosen, engine data on, no demo data shown.
  - *How often:* **for the probe, the clear and the definition each: never two within 5 s, at most 3 in
    any 10 minutes, at most 6 in any hour. So at most 18 requests that are not reads in any hour.** A
    request counts from the moment it is handed on; its place is given back only when the transport
    answers "busy, not accepted". The Gate is made once when the app starts and keeps these counts
    whatever the steps do: no answer of the engine unit, no change of a setting and no start-over makes
    room (a restart of the app does: the counts are in memory). When there is no room the strip reads
    "paused, too many tries" and the log says when the next one may go.
  - *Whose:* a request of steps that were started over since they asked for it (a setting was changed)
    is not handed on, wherever it was waiting: in the link's queue before the Gate saw it, or behind a
    busy transport after.
  The list, the identifiers, the probe and the limits are frozen. The reads go through the kit's
  read-only link like every other value. Not covered by the Gate: the kit keeps one queue of calls into
  the head unit, and a request that has passed the Gate waits there behind the call before it (one tick
  in normal running; a reviewer's stand-in with a 2 s job in that queue let a clear leave 1.5 s after the
  setting was switched off).
- **With any other choice the app sends reads only**, as before: Off, 550D and PID 52 were each run for 5
  minutes on a stand-in car that has the tune, about 3,000 requests each, every one a read.
- **Only while its strip is on screen**, with an engine unit that answered something in the last 20 s
  (in vitals.js; no check of its own), not in demo mode, not with engine data off. On another gauge set,
  in the background, or with a sleeping engine unit nothing of it is sent, not even the identification.
  "On screen" is the rule every Boost value has: up to about a second and a half after the strip was last
  drawn.
- **A changed setting counts at once.** A change of Ethanol reading, or one that switches MHD flex on or
  off (Engine unit data, Demo data), starts the steps over at that moment; what was already sent stays
  counted. A request that had passed the Gate and was waiting for a busy transport when the setting was
  switched away is not handed over any more, also when the setting is switched back at once, and the
  same for a request the steps had only just asked for (fourteen cases in the test). A read of the MHD steps that was already waiting may still leave (a read, no
  more).
- **Pace when all is well.** The value is read once every 2 s and shown for at most 10 s after the last
  answer. In 5 minutes on the stand-in: 1 identification read, 1 probe, 1 clear, 1 definition, 123 value
  reads, and exactly as many intake-air reads as with the setting off (494).
- **What the limits come to, measured.** An engine unit that forgets the identifier at once, or after 1,
  10 or 30 good reads each time: 1 probe, 6 clears and 6 definitions in 60 minutes, 18 definitions in 3
  hours. Every definition answered "out of range" (the likeliest refusal of an engine program that does
  not allow the two places): 13 or 14 requests that are not reads an hour, the same in every hour of 4
  (and of 8 in a longer run). Another tool that takes the identifier for itself every 3 s: 6 definitions of
  ours in 60 minutes and never a wrong number on screen. A person switching Off and MHD flex 40 times in
  2 minutes: 3 probes, 3 clears, 3 definitions, then "paused, too many tries"; once a minute for an hour:
  never more than 18 in any hour. Stepping MHD flex, 550D, PID 52 in turn, 20 s each for 10 minutes: 3
  of each. (The first version counted definitions "in a row": one good read between two losses made that
  1,317 non-read requests an hour. The second counted them per run of the steps: a refusal pattern and
  setting changes got past it. Both found in review; the limits now sit in the Gate.)
- **When the engine unit says no.** No tune: the probe, once more 5.5 s later, then after 10, 20 and every
  30 minutes (6 probes in 95 minutes, 2 an hour from then on), never a clear or a definition. A probe that
  is never answered: 6 in 60 minutes. Definition refused: 3 tries in the first minute (the second 6 s and
  the third 16 s after the one before: waits of 5 s and 15 s, each after a probe), then it waits for room; never more than 18 requests that are not reads in any hour of
  3. A tune that goes away while the app runs (flashed back to stock) is noticed by that probe: no
  further clear or definition. Read no longer answered: the number goes within 10 s and only the read is
  tried again, further and further apart; no new probe and no new definition.
- **Replies meant for another app.** Every app on the head unit hears every reply of the engine unit, and
  a refusal meant for another app's request looks like one meant for ours. A "no" that would cost a
  non-read request is therefore asked once more before it is believed: a lost identifier (two reads), an
  identifier out of range (two definitions), the first "no" to the probe (two probes). With a foreign
  7F 22 31 arriving during every second read for 10 minutes the identifier is not defined again once,
  and the number stays on screen; at every read for an hour, two in a row are believed and the limits
  hold. The test hands such frames in directly; a reviewer also got one without that, from another app's
  refused read on a busy transport.
- **An ignition cycle.** The read is refused (7F 22 31) twice, the number goes with the second refusal,
  the identifier is defined again and the number is back within 12 s in simulation. The probe is not
  repeated.
- **A busy transport.** A step the transport did not take is tried again; after 5 in a row it counts as a
  failure ("transport busy") with waits of 5 s, 15 s, 30 s, 1, 5 and 10 minutes (the first two are
  checked, the later ones logged). A clear that was answered is not sent again while its definition is
  being tried: with the transport taken for 1.3 s after every clear, 10 minutes cost 1 clear and 1
  definition (335 clears in the first version); with the transport busy at every definition for an hour,
  6 clears and no definition. A hand-over that fails without the transport's "busy" may have left all the
  same: it is counted against the limits.
- **F303, or F301.** The reference notes say MHD's app uses F300 and F302 and clears all four when it
  connects. This takes F303, or F301 when the engine unit says twice that F303 is out of range, and never
  touches F300 or F302. If both of those refusals were another app's, F303 stays defined beside F301
  until the next ignition cycle.
- **What counts as a value.** A byte over 100 is not a percentage: "ETHANOL  NO READING / not a
  percentage" (the sensor's byte is not shown in the tune's place). A reply that is not exactly two bytes
  is never shown; after a second such reply the identifier is defined again.
- **One link.** None of the kit's apps in this repository opens two diagnostic links in one app, so a
  second one is untried on a head unit. The Gate uses the read-only link's own proxy and its one
  subscription (`tap()` in mhdflex.js wraps the signals object and passes everything on), hears the
  link's frames only while one of its own requests is out, and its requests go through that link's queue
  (the queue: no check of its own).
- **The log** names every request that is not a read once the transport has taken it ("MHD flex: probe
  (2F 04 4D 48 44) sent to the engine unit"), says "not taken by the transport" when it said busy and
  "what became of it is not known" when the hand-over ended any other way (another verdict of the
  transport, a call that failed: these stay counted against the limits), and has the first four raw
  replies to each request ("raw MHD flex 22 F3 03: ...").

On screen: "ETHANOL  E27" with "MHD flex  ·  sensor E26" under it (the tune's Active figure, and what its
sensor says). Without a value, "ETHANOL  NO READING" with one of: "reading...", "software not supported",
"software not identified", "no MHD tune found", "engine unit refused it", "engine unit busy", "transport
busy", "paused, too many tries", "not a percentage", "no answer", "not sent", or the link reasons of the
other two choices.

Tests after this addition (same commands as above, plus one):

```
node proven/tools/test_vitals.js dist/pps_gauges          133 checks, all passed
node proven/tools/test_engine_unit.js dist/pps_gauges     121 checks, all passed
node proven/tools/test_ethanol.js dist/pps_gauges          55 checks, all passed
node proven/tools/test_screens.js dist/pps_gauges          50 checks, all passed (5 new: the MHD flex strip)
node proven/tools/test_mhdflex.js dist/pps_gauges         128 checks, all passed (new)
```

A test file that stops before its last line now fails (fakecar.js `checker()`): in the first version one
check could hang under the hand-moved clock and the file still ended with exit code 0.

The stand-in engine unit of these tests (`mhdUnit` in fakecar.js) answers the way the reference app's
notes say a tuned engine unit does. That is an assumption taken from those notes, not a car. What the
tests show is what the app sends and when it sends nothing.

**The reviews of this addition.** Four rounds, two independent reviewers each (one on what can leave the
head unit and how often, one on what the change does to the rest of the app and whether the tests and the
words are true). The first round found, in the first version: a ceiling on definitions that one good read
defeated; lists with a gap passing the Gate's check (they would have been sent with 00 in the gap; no path
of the app builds such a list); a request that could still leave up to a second after the setting was
switched away; a refusal meant for another app being believed at once; the clear repeated every 2 s when
the transport was busy at the definition; "sent" logged for requests the transport had turned away; and a
check that could hang without failing. The second round confirmed those closed and found, in the second
version: the growing rests bypassed by an engine unit that answers every definition "out of range" (up
to 42 non-read requests an hour from the third hour on), and the count of definitions emptied by every
change of a setting (41 definitions in 130 s with a person switching Off and MHD flex). Both are closed
by the limits in the Gate, above. The third round could not get past those limits (3,320 random
six-hour runs against the built app, about 222 million requests: never more than 3 of a kind in 10
minutes, 6 in an hour, 18 in all in an hour, nothing but the three, nothing while the setting was
away) and found, in the third version: the identification taking a program family from either of two
lists (see "Order"); the count taken when the call came back instead of at the hand-over (two
hand-overs at once could both pass, which the app itself never does); a verdict of the transport other
than "busy" logged as "not taken" although it was counted; and several figures and test messages that
were the configured waits or another probe's numbers instead of the measured ones. The fourth round found
no fault in what the app sends or how often, and no way past the limits, and found, in the fourth
version: the program family read from the last two bytes of the program's id without a look at the first
two (an id such as 00015D55 would have passed as 5D55); a request still waiting its turn in the link's
queue being handed on although the steps had been started over since; and wording (the count of
corrections in this section's heading, what happens to bytes off the grid, the second list called
"older" as if that were known). All are corrected above, each with a check, and the reviewers' own probes
were run again on this version: none of those requests leaves any more (0 of 1,500 random runs).
With the setting on any other choice, this version does what the commit before the MHD flex choice
was added did: nineteen scenarios (Off, 550D and PID 52 on a healthy stand-in, a silent engine unit, no
link, link down, a transport that is busy now and then, a link that comes up late, settings changed
while it runs, another gauge set, the background), 48,522 calls into the transport, a record of 101,288
lines with every call, every log line and the read-out each second. The requests and their times are
identical; the one difference is a log line in the two no-link scenarios that comes one line later.

## 2. Deliberately left, and why

- **The S58 with MHD flex.** Its two memory places are not public. The app identifies the engine
  program, shows "software not supported" and sends nothing else. To add it, one recording is needed
  from one S58 car on MHD flex: MHD's own app logging only "Ethanol Content (Active)" and "Ethanol
  Content (CAN)" for a minute while PCAPdroid on the same Android phone records the MHD app, plus the
  log MHD exports (its header has the program and calibration ids). The recording holds the car's VIN.
- **Motiv ReFlex.** No reading of its own: the ReFlex box only gives the engine unit a percentage when it
  is linked by CAN to a tune that takes it. On MHD that is the MHD flex choice above; on other tunes the
  places are not known and nothing is read.
- **A newer MHD version.** The probe must answer "MHD2"; anything else is "no MHD tune found". The two
  places were recorded on MHD 5.41 and one B58 gen2 program version (seen on a second). Whether another
  MHD version or program version keeps them is not known: a wrong place would show a wrong number that
  looks measured. Hence the comparison in the car checklist, on every car.
- **Two bytes from the wrong places cannot be told from the right ones** by the app. Only the program
  family in the list of what the engine unit runs now (`22 F1 01`) stands between a wrong list entry and
  a wrong number.
- **The limits are counted in memory.** When the head unit restarts the app they start at nothing. How
  often a head unit does that is not known.
- **Other tools on the same identifiers.** A workshop tester that uses the engine unit's temporary
  identifiers F301 or F303 at the same time would have its definition replaced, and the other way
  round. Switch the read-out off (or close the app) before diagnosing or flashing.
- **MHD's own app logging at the same time.** The reference notes say MHD's app, logging a long list of
  channels, may use F303 or F301 itself, and that it clears all four identifiers when it connects. The
  two would then take the identifier from each other. The Gate's limits bound what this app sends (3
  definitions in any 10 minutes, 6 in any hour), but each of its definitions replaces the other tool's. What MHD's
  app does when that happens is not known. Hence: close the app or switch the read-out off before
  logging or flashing.
- **The settings screen stepping through MHD flex.** On the iDrive 8 settings screen a choice steps to its
  next value at each press, so going from PID 52 to Off passes through MHD flex. Nothing of it is sent
  unless the strip was drawn in the last second and a half, and the Gate's limits apply; whether the
  Boost set is still being drawn behind the settings on a head unit was not checked.
- **The limits can pause a healthy car.** Four ignition cycles, or four changes of the ethanol setting,
  inside 10 minutes with the strip on screen: the fourth definition waits for room ("paused, too many
  tries", at most 10 minutes; at most an hour after six in an hour). Chosen on purpose: the limit does
  not know why it is being asked.
- **Clearing the identifier when the setting is switched off.** Not done: it would be one more non-read
  request at the moment the workshop asked for none. The engine unit forgets it at the next ignition
  cycle (per the reference notes).

- **gauges-B5** (red line per engine), **gauges-B17** (blanks on the first drive), **kit-B5** (the
  `link.available` gate) and **kit-B7** (interfaces not marked optional): left as instructed. B5 means the
  red line and the shift lights are 7000 / 6700 rpm on every petrol car until "Redline" is set by hand.
- **gauges-B3, "when its interface becomes unavailable"**: not used as a reason to drop readings. How the
  availability flag behaves on a car is not known, and a flag that flickers would blank the whole screen.
- **gauges-B6, a "Gearbox temperature: Off" setting**: not added. A gearbox unit that is not there now
  costs 3 short requests and then one every 10 minutes (and one at an engine start, at most as often).
- **gauges-B6, a unit that comes back with the engine running**: it is only asked again on its timer
  (30 s, then 1, 2, 5, 10 minutes). Only an engine start asks at once.
- **gauges-B6, the one request to a given-up unit** goes to the first value of the round with the
  identifier that value stands on (normally intake air, F40F). A unit that is there but never answers
  that one identifier would stay given up. A unit that keeps to the diagnostic standard answers an
  identifier it does not have with a refusal, and a refusal counts as an answer.
- **gauges-B8, asking PID 70 before 4AB0**: the order of the identifiers is still M Vitals'. Only the
  value on the ceiling is skipped.
- **gauges-B8 (d), the first seconds**: the engine unit's boost is only trusted once it has changed by
  0.03 bar, or was seen changing on an earlier drive. Until then the dial keeps the sport display's last
  number (2 s in the simulation, on the first such pull of a car).
- **gauges-B9, a car that never names its units, in two corners.** If the very first tyre message holds
  only a low tyre (the other three "no value"), that tyre is sized on its own until a message with a
  healthy tyre arrives. And if all four tyres are low at once, they are read in the smaller unit. In both
  the screen says "Car's units unknown: pressures read by their size."
- **gauges-B10, an axis that sends nothing at a standstill**: the g peaks then stay "--" with the note on
  the screen. A value held from before the stop is not used to zero the sensor: it may be from the
  braking.
- **gauges-B11 beyond the wording**: "Start" is still the first reading after the app was opened. Taking it
  at the start of the drive needs the app to start with the head unit, which the sceptic showed needs a
  background part the app does not have. Reset peaks still restarts it.
- **gauges-B12 beyond the letter**: the estimated number is still only the rank of the present ratio among
  those seen since the app started (the first gear cruised in reads "1"), there is no "manual gearbox"
  setting, and a car that sends "N or P" with no selector position still shows "N" while driving.
- **gauges-B16 at 1200 Nm**: the bar ends at 1200 but its last number is 1000, because the kit only labels
  the end when it is far enough from the last round step.
- **In the kit, not changed (it is not ours to change here):** (1) the read-only link paces on the wall
  clock. vitals.js clears its stamp before every request; a request that is already waiting when the
  clock moves would still wait. (2) The reader takes any refusal of the same service from the same unit
  as the answer to its own request, so a refusal meant for another app can make one read fail and, for a
  value with several identifiers, pass to the next one. (3) `link.next`, which vitals.js clears, is a
  plain field of the kit's link, not a documented call.
- **Not faults in the trace, so not touched:** speed has no plausibility range; a stopped engine may leave
  its last rpm on the tach if the car sends neither 0 nor "no value"; engine-unit boost assumes 101.3 kPa
  outside pressure until the engine unit has answered its barometer.

## 3. Sentences for the public notes

They are in [README.md](README.md) now.

## 4. What to look at on the first real car, in order

Bring the tuner's app or a logger. After each step, copy the app's log
(`/var/opt/public/oap/oap_<uid>/data/pps_gauges.log` on the head unit): most answers are in it.

1. **Ignition on, engine off, open the app.** No DEMO tag. Street, Thermal and Tyres show values or "--"
   with a reason, never an invented drive. In the log: "car units: pressure ..., temperature ..." within
   the first seconds, and no "car units: none received". (If it is there, the next line says which unit
   the tyre pressures were read as; compare that with the car's setting.)
2. **Tyres against the car's own tyre display**, wheel by wheel: same numbers, same wheels (front left
   is front left). Change the car's pressure unit once (bar, kPa, psi): the values follow and the
   "Since app start" table starts again. In the log: "raw tyre pressure", "raw tyre temperature".
3. **Temperatures against a tool you trust**: coolant, oil, outside, gearbox. In the log: "raw engine
   temperatures" (raw less 48 = °C), "raw gearbox oil", "raw outside temperature".
4. **Go to the Boost set, then start the engine.** Before the start the four tiles may say "not
   answering" (the engine unit asleep; the log then has "DME: no answer to 3 requests in a row"). After
   the start they must fill within a few seconds; the log has "engine speed above 400 rpm, taken as an
   engine start (before it: ...)" and, if the unit had been given up, "DME: answering again". For each
   value the log has "raw DME ..." with the bytes and what they were read as, and "...: read from DME ...
   (n of m)". Intake air must say "iat: read from DME F40F (1 of 3)"; check it against the logger: it
   must be the intake air sensor, not the charge air cooler. Note "oil temperature: the car's own signal
   reads ..., the engine unit ...": do the two differ?
5. **The gearbox unit.** Automatic: Thermal gets a gearbox tile after the oil has warmed 1 °C; the log has
   "raw EGS 6000". Manual: the log says "EGS: no answer to 3 requests in a row" and nothing on the Boost
   set stalls. If it says neither, note what it does say.
6. **If the engine-unit tiles all say "not answering" with the engine running**: the head unit cannot
   reach the engine unit on this car (the one car in the public notes was like that). Then intake air,
   fuel pressures, timing, boost target and ethanol are not available on it, and the log line "DME: no
   answer to 3 requests" confirms it. Report the car and its gateway.
7. **Drive: speed and gear.** Speed against the speedometer (expect it a little lower). Automatic: the
   letter and number against the cluster in D, S and M. Manual: a number alone with "EST."; note whether
   it is right, it is only an estimate. In the log: "gearbox: {...} -> D/S/M", "raw gear selection".
8. **Red line and shift lights** (gauges-B5, not fixed): on anything but a 7000 rpm petrol engine set
   "Redline" and the shift point by hand, then check that the lights strobe where they should.
9. **Boost at a steady load against the logger.** Sport-display boost, the engine unit's target, and
   "Against target" near zero when the car is on target. If "Against target" or the white marker blinks,
   the engine unit answers more slowly than simulated: report it (the 2.5 s limit may need raising). In
   the log: "raw FES boost", "raw DME 4AB0", "raw DME 580B".
10. **Full boost on a tuned car.** Does the sport display's raw value stop at 254, and does the dial then
    say "sport display: at its limit" and switch to the engine unit's boost? Or does it jump to 255, and
    does the dial then follow the engine unit within a few seconds? Does the target stop at 2560 hPa?
11. **Power and torque** against a dyno sheet or the logger, knowing both are the engine unit's own
    estimates. In the log: "raw sport display [power %, torque %]" and "raw sport display maximum":
    does the car give its own maximum?
12. **Track.** Stop the car and count: how long until the note under the g peaks ("Peaks count after a
    stop that zeroes the g sensor") goes? A few seconds is what was simulated; the log line "g-force:
    zeroed at a standstill ... s long" has the time and the two offsets. If the note stays, the car sends
    the accelerations rarely or not at all at a standstill: report it, with the "raw longitudinal
    acceleration (standing)" lines of the log. Then drive: the dot moves the right way (use "G-force:
    brake on top" if wanted), and the peaks look like the drive. Open CarPlay for a hard stop, come back:
    the brake peak has it.
13. **A fuel stop with the app left on the Boost set.** Switch the engine off and watch for three
    minutes: do rpm, speed and the temperatures go to "--" after 10 s, stay, or go to 0? Do the
    engine-unit tiles go to "not answering", and after how long? Start the engine: the tiles must be back
    within a few seconds. The log line "engine speed above 400 rpm, taken as an engine start (before it:
    ...)" says what the engine speed did while the engine was off. If the tiles stay "not answering" for
    more than about 10 s after the start, report it with the log.
14. **Ethanol, workshop only, on a car with the flex-fuel kit and the tuner's app showing E%.** Settings,
    Workshop settings, Ethanol reading: Engine unit value (550D). Note what the strip shows after a
    minute and the "raw ethanol 550D" line in the log. Then OBD value (PID 52), the same. If either shows
    a number, compare it with the tuner's app; refuel to a clearly different blend, drive until the
    tuner's app has settled, and compare again. Only a source that matched both times stays on for that
    car. A number that does not follow the blend (0, or always the same) means Off.
14a. **MHD flex, workshop only, on a B58 gen2 with MHD flex and MHD's app showing both ethanol
    figures.** First install the public Flex Fuel app (Store, Add source,
    `alexpereap/pereaperformance-idrive7-apps`) and see whether it shows the car's ethanol: that is the
    same method, from its author. Then in Proven Gauges: Ethanol reading: MHD flex (not read only),
    Boost set, engine running. Within about 10 s the strip should read "ETHANOL  Exx" with "MHD flex  ·
    sensor Exx". Compare both figures with MHD's app. Switch the ignition off and on: the number must
    come back by itself within about 15 s. If the strip ever says "paused, too many tries", note what
    else was connected to the car at the time and how often the ignition or the setting was switched. Refuel to a clearly different blend and compare again. Keep the log (the lines
    starting "MHD flex" and "raw MHD flex"). Anything else on the strip: note the words and the log.
    On an S58 it will say "software not supported": send the log line with the ids.
15. **With the tuner's app logging or flashing, or a tester connected:** set "Engine unit data: Off"
    first, or close the app. The app shares the engine unit with that tool, and with MHD flex chosen it
    also uses one of the engine unit's temporary identifiers.
16. **A long drive.** After an hour, the engine-unit tiles are still live, and the log has no
    "engine unit poll" or "history" warnings.
