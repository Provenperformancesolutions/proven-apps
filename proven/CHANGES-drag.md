# Proven Drag 1.0.0: what was built, what is assumed, what to check on a car

BETA. Nothing here has run on a car or on a head unit. Everything below was checked on a PC only
(a Mac, Node.js 24). The head unit runs Node.js 8: the app's files were parsed as ES2017 and scanned for
newer library calls, they were not run on Node 8.

This is the working record of the build. The public notes (`proven/README.md` and the note at the top
of `README.md`) were written after it, from it. Where it says "assumed" or "a guess", read that
literally: nobody at Proven has measured it. Two independent reviews were made of it; part 7, "After
the review", says what each found and what was done. A final check of the result followed; part 8,
"After the final check", says what it found and what was done. Two more checks followed that; part 9,
"After the second check", says what they found and what was done. Two checks of those fixes followed;
part 10, "After the last check", says what they found, what was done and what was left. Parts 1 to 6
were brought up to date each time.

The commit ids this record gives for its own stages (6a574b5, d0975b2, b77cd97, ce83a76, bba74b9) are
those of Proven's working copy. The public repository carries the result as one commit, so they cannot
be looked up there. 376bb5e is the public commit before Proven Drag was added.

## How it was tested

From the top of the repository:

```
python3 proven/tools/make_drag_appjson.py .               # writes apps/pps_drag/app.json
python3 kit/tools/build.py --preview-only pps_drag
node proven/tools/test_drag.js dist/pps_drag              # 408 checks, ALL OK: the timing logic alone
node proven/tools/test_drag_car.js dist/pps_drag          # 312 checks, ALL OK: the whole app on a stand-in car
node proven/tools/test_drag_car.js dist/pps_drag <folder> # the same, and a picture of every state drawn
node kit/tools/preview.js dist/pps_drag <folder> render wait=2 render wait=4 render wait=12 render BTN_PAGE BTN_PAGE BTN_PAGE
```

`preview.js` switches demo data on. Its pictures are, in order: the first frame (before the demo
starts), the start-up logo, Run READY, Run TIMING, Run RUN FINISHED, Timeslip, Best, Signals. In the
preview no car answers, so its Signals page says "not answering" eleven times; the Signals page with data
is among the pictures `test_drag_car.js` saves.

The two existing apps were built and their suites run in the same copy: `test_warmup.js` 350,
`test_vitals.js` 133, `test_engine_unit.js` 121, `test_ethanol.js` 55, `test_screens.js` 50,
`test_mhdflex.js` 128, all OK. Nothing in `kit/`, `apps/pps_gauges`, `apps/pps_warmup` or their tests was
changed.

The built manifest was checked against one car's interface catalogue (an M8, iDrive 7, i-Level 20-07;
BMW's file, kept outside the repository and not copied into it): `MGU_SOMEIP_CATALOG=<that file> python3
kit/tools/build.py --preview-only pps_drag` printed no "this unit has no ..." line, wrote no
`missing-interfaces.json`, and the manifest is byte for byte the one built without the catalogue. So that
one unit has all seven interfaces and every field with the access asked for. That is one car: another
firmware may lack some, which is what the five `_optional` marks are for.

To see that `test_drag_car.js` can fail, the built app was broken in fourteen ways in a scratch copy (a
`signals.set` call, timing on the wall clock, a text moved onto another, a text past the page's edge, a
letter the big font does not have, a position in the log, the GPS sentence in the log, demo runs saved, a
flagged run setting a best, a second reader of the speed getter, the scale not applied, the lone 0 not
filtered, the saved file written in place, the stale-series rule taken out). Each made between 1 and 25
checks fail. That script is not in the repository.

## 1. What was built

Proven Drag times standing-start runs from the car's own speed signal: 0-100 km/h (0-60 mph), 60 ft,
330 ft, 1/8 mile, 1000 ft and 1/4 mile, with trap speeds. It only reads: it subscribes to signals, reads
two getters, and subscribes to one event.

| File | What it does |
|---|---|
| `apps/pps_drag/run.js` | the timing engine: states, glitch filter, launch instant, distance, splits, trap, the ± |
| `feed.js` | two speed series with an engine each, which one a run is taken from, the poll scheduler, rates |
| `gpsscale.js` | the GPS receiver's sentences, the speed scale from GPS speed and from position legs, GPS height |
| `wheels.js` | wheel factors, wheelspin from the wheels, the estimate from the acceleration, the cross-check |
| `slope.js`, `steady.js` | start slope from the acceleration sensor, the car's road gradient decoded; a speed window |
| `car.js` | the car side: subscriptions (tried again after 5, 15, 60 s), the two getters, the event, the raw log |
| `session.js` | what happens with each sample, and what a finished run becomes (record, flags, bests, log) |
| `store.js` | the saved file `pps_drag.json`: bests per start convention, the last 30 runs, the two calibrations |
| `screens.js` | the four tabs: Run, Timeslip, Best, Signals |
| `demo.js` | a made-up launch for demo mode (never saved) |
| `heldlog.js` | the log, held back while a run is timed (a file write would stamp a sample late) |
| `main.js` | the wiring: the 50 ms tick, tabs, buttons, start-up logo |
| `proven/tools/dragsim.js` | a run with known answers, and samplers that hand it out as a car might |
| `proven/tools/fakedrag.js` | the stand-in car and head unit the whole app is tested on |
| `proven/tools/test_drag.js`, `test_drag_car.js` | the two test files |
| `proven/tools/make_drag_appjson.py`, `make_drag_icon.js` | the manifest generator; the icon (see part 2) |

The brief names `main.js` for the car side, the saved file and the screens. They are in `car.js`,
`session.js`, `store.js` and `screens.js` instead, with `main.js` as the wiring, so that the tests can
reach each part.

How a run is timed, in short. The speed arrives two ways: notified when it changes, and read from its
getter on a schedule (every 50 ms while the car is under 5 km/h, armed, timing, or the Signals page
shows; every 500 ms otherwise; every 2 s after 5 minutes parked with the screen hidden). Each way feeds
its own engine, never mixed. When a run ends the app takes the engine whose series was sampled more
closely (with three rules before that one, see part 2), and logs both. The start of the clock is placed
by a fit through the first moving samples. Distances are the speed summed up. The scale from GPS, if one
has been learned, multiplies every speed of the run.

The log (the evidence from a first car): the first 10 raw values of every source; each source's measured
rate once it has had 5 s of changing speed; every interface that is missing, with what that costs; each
learned factor; after each run one line per engine with every result, launch gap, spacings and how the
launch was placed, then which engine was taken and why, then a line with wheelspin, start slope, height,
scale, flags and new bests.

No position and no direction of travel is logged or saved. Of the two position sources the log has the
member names and "a valid position"; of the raw GPS height value its member names and the two members
the app reads (height, speed); of the GPS sentences their kinds and the speed, fix, satellites and
height read out of them. What a line holds is put together member by member: a member the code does not
name is never written out. The height above sea level IS in those raw lines (the first car has to show
whether raw - 32768 is metres); the saved file keeps height changes only. The test searches every log
line and every file of every drive for the stand-in car's latitude and longitude in three forms, and
one drive for its course and heading, and finds none (and finds them when one is put there on purpose).

## 2. Where it departs from the brief, and why

**The launch instant (run.js).** The brief asks for a straight line through the first moving samples,
run back to 0.5 km/h. On the test model that line puts the launch too late whenever the acceleration
builds up over a moment: 0-100 km/h read short by 6.7 ms on average at 50 ms spacing and 10.8 ms at
100 ms, and the worst run at 50 ms used up the brief's whole 0.020 s. A launch model is fitted instead
(the car stands, then its acceleration rises in a straight line over 0 to 400 ms, then stays). Mean
absolute error of 0-100: 0.6 ms against 6.8 ms at 50 ms, 2.0 against 11.5 ms at 100 ms. The straight
line is still there (`fit: 'line'`), and every run's log line says how far apart the two were.
Since the review (N1) the model is not used alone. Where the last standing sample is a real reading
above 0, the launch lies between it and the first moving sample, and a model that puts it more than 0.3
of their spacing from the straight line between them is overruled by that line. Where the last standing
sample reads 0 and the series has never shown what a 0 means (it has reported no speed of 0.1 km/h or
less), the earliest of the model, the straight line and the line through the first two moving samples
is used, and what they are apart goes into the ±. A series that has reported 0.1 km/h or less keeps the
model, as before.
Since the final check (part 8) the launch is placed for good one sample later: when the sample after
the first three moving ones has come in. Until then the third may still be taken out as stamped late.
And a launch the series saw late is no longer placed at its first sample: where the first moving
samples were stamped late (they arrived in a lump, or the next sample showed it), the launch is run
back from the samples after them, and the whole stretch it was run back over is in the ±.

**The last known standstill (run.js).** For a series that only sends on change, the last moment the car
is known to stand is one sample spacing before the first moving sample, not the last time the 50 ms
timer ran. With the timer's version 0-100 read 11 ms short on average at 50 ms and 29 ms at 100 ms.

**The glitch filter works both ways (run.js).** The brief asks for it against a lone 0. A lone jump
upwards is dropped the same way: it would otherwise end the run and leave a made-up 0-100.

**The ± is the brief's formula plus what the data show (run.js).** Added, each only where it applies:
the time the first moving samples say the car was moving before it was last known to stand (in full);
the time two ways of placing the launch are apart, and the rest of the launch gap where the launch had
to be held at one of its ends; for the speed split, the spread of three ways of finding the crossing
where that is more than a quarter of the sample gap (a gear change at 100 km/h); for distance splits,
what a hole in the series before them may hide; for a polled run, half the getter's round trip. Since
the final check also: what a stamp beside a crossing is known to have been late by; what the first
moving samples are unevenly spaced by; the whole launch gap where the app was held up when the first
moving sample came; and a split timed after the first foot gets the full launch figure, not a quarter
of it, where the first foot was covered before the first moving sample. Since the second check (part
9, R2-02) also, on a polled run: where a getter read took far longer than that getter's reads usually
do, half of what it took longer, on the launch and on every line that read stands beside. On clean
data from a series known to read from 0, none of them adds anything.

**Silence on a notified series is not always "no change" (run.js; since the review, N2).** After more
than 1.6 send slots of silence the next sample decides: if it differs from the last by no more than the
speed was changing per slot before (1.5 times that, plus 1/32 km/h), the speed is taken as unchanged
until one slot before it (a gear change, a steady speed). If the step is bigger, or the glitch filter
dropped a sample in the silence, samples are missing: a straight line across the hole, and the hole
goes into the ± of every distance split after it.

**A sample that was stamped late is taken out (run.js; since the review, widened after the final
check).** A stamp says when the app's handler ran, not when the car sent the sample. A sample stamped
less than 2 ms after the one before it replaces that one: the earlier was already old when it was
stamped (the app was held up, or the car delivers in lumps). Since the final check the same holds, on
a notified series, for a sample stamped less than three quarters of a send slot after the one before
it, if it comes more than 1.75 slots after the sample before that: a series is never sent closer
together than its slot, so the earlier stamp was late. The stretch across the sample taken out is a
hole: a straight line, with what it may hide in the ±. A late stamp that stays (under a quarter of a
slot late) goes into the ± of a line crossed beside it. The brief knows none of this.

**A step upwards that no car does, confirmed by the next sample, ends the run (run.js; since the
review, N4; narrowed after the final check).** The filter still lets a confirmed step through, as the
brief says ("both are fed"), but no time is taken from it or after it: the run ends at the sample
before, with the splits it had. Since the final check the step is judged over the time the two
readings can really be apart (one send slot at least on a notified series; the stamps plus half of
both round trips on a polled one), and where the stamps show that the sample before the step was
stamped late, that sample is taken out and the run goes on. Before, one notification stamped 40 to
300 ms late ended a clean run this way (part 8, V-01). Since the second check (part 9, R2-01) a sample
that replaces one stamped late is judged against that one's reading as well, over one send slot.
Without that a reading 5 to 40 km/h too high passed for real right after a late stamp. Since the last
check (part 10) that test never judges over less than 20 ms, as the plain one. A second look at a
step on a polled series, which part 9 also added, is out again (part 10): it ended clean runs of
quick cars. So on a polled series a reading up to about 6.7 km/h too high passes with reads of 25 ms.

**Which engine a run is taken from (feed.js).** Before the brief's rule (shorter median spacing, the
notifier winning within 20 %): an engine without a result loses; an engine that saw the launch late
loses; an engine whose series went silent before the end loses; since the review (N3, N4) also an
engine whose series made a step no car does, and one whose series had a hole of 0.3 s or more or
repeated one value for a second or more. Without the second rule a getter that was on its 2 s period
when the car launched would win on its 50 ms spacing later in the run. And where the run was chosen by
the spacing rule and the two engines differ on a split by more than their two ± together, the ± shown
is widened to that difference and the run is flagged SERIES DISAGREE.

**Three more flags (session.js; since the review).** DATA GAP (a hole of 0.3 s or more in the series,
one value repeated for 1 s or more, the series stopping before the run was over, or the app itself held
up for 0.3 s or more), SPEED JUMP and SERIES DISAGREE. Like the brief's two, each keeps a run from
setting a best. The brief names two flags; these three are the review's.

**A speed that has stopped arriving is not shown (session.js; since the review, CW-02).** The speed
counts as there while a getter read was kept within the last second (2.5 poll periods where it is read
more slowly) or a notification arrived within the last second. Otherwise the Run tab shows no speed
and says NO SPEED FROM THE CAR. One case reads differently since the final check (part 8, V-04): a car
that only notifies its speed sends nothing while it stands, the notified engine stays armed, and its
launch is timed. There the Run tab says ARMED, NO NEW SPEED, with the line "Closed roads and track
days only" (if its notifier has been heard while the speed changed, or its getter has never answered).
Since the second check (part 9, W2-03) the line under NO SPEED FROM THE CAR reads "Timer armed. Closed
roads and track days only" whenever an engine is armed, because a launch can then still be timed.

**The GPS speed factor needs more than the brief asks (gpsscale.js; since the review, N7).** The
brief's rule is kept (60 ratios, the middle 80 % within 1 %), and three things are added: at most one
ratio a second; a factor is only accepted from 60 ratios taken at a level speed (under 0.5 km/h of
change in the 2 s), or when at least 15 ratios taken while the speed rose and 15 while it fell agree
within 0.3 %; a speed sent in whole knots gives no ratio. Not changed: the brief's "less than 2 km/h
over 2 s" for COLLECTING a ratio. The reviewer suggested 0.5 km/h there; that would have gone against
the brief's figure, and the acceptance rule does the same job.

**A series that is not being sent does not keep the timer armed (feed.js, run.js; found in this
step).** On a car whose speed is never notified, the kit still reads the getter once itself when the
car's service comes up and hands that to the notifier's handler. The notified engine then held one
sample, 0 km/h, for good: the screen said READY at 80 km/h and the getter was read 20 times a second for
as long as the car drove. Now an engine whose series still "stands" while the other has seen the car
move for a second, with nothing heard since that movement began, is disarmed until its series speaks
again. The same covers a getter that stops answering while the car stands.

**The wheelspin estimate (wheels.js; changed in this step).** The fallback follows the kit's Drag
Timer, with four differences. On the stand-in car a launch with no wheelspin at all read "about 35 %,
0.6 s above 10 %" as the kit does it, because the sum of the acceleration started late and from zero.
Now the sum starts at the launch instant (the acceleration of the last 1.5 s is kept, since the app only
learns of a launch some tenths after it), from the 0.5 km/h the car has there; each speed sample is
compared with the sum carried on to that sample's own moment; and the sensor's standing reading is the
one from 250 ms before the launch, not one that already holds the launch building up. The same launch
now reads about 8 % and 0 s above 10 % on the stand-in car (whose acceleration arrives 20 ms late on a
50 ms grid). `test_drag.js` has two new checks for it. It is still an estimate: see part 5.

**Any flag keeps a run from setting a best.** Part 5 of the brief says so for DOWNHILL START, part 6
says "flagged runs set no best". Both flags do. The risk is in part 5 below: if SPEED READ HIGH AT
LAUNCH comes up on every launch of a real car, no run sets a best.

**The speed scale setting applies whether or not "Workshop settings" is on.** That switch only shows or
hides the setting; a workshop that sets "Manual" and switches the workshop settings off again keeps it.

**The icon was not made by `make_icon.py`.** That script needs Pillow and the logo's artwork file, and
the build machine had neither. `make_icon.py` has the flag as a third figure ("drag"), but that code
has never been run. The icon in the repository was made by `proven/tools/make_drag_icon.js`: the same
flag from the same coordinates, drawn with the kit's own canvas, and the PROVEN line copied pixel for
pixel from the bottom rows of Proven Gauges' icon.

**Smaller ones.**
- Raw speed and acceleration outside 16 bits, and an acceleration beyond 30 m/s2 either way, count as
  "no value".
- A getter read is asked to give up after 1 s (the kit's own reads allow 3 s). After a read that ran
  into that limit the next one waits until 4 s after it began (since the review, CW-04).
- A getter is not read while the kit says its service is down, and after it came up only once it has
  been up for 1 s and 300 ms have passed since the first value came through the handler (the kit reads
  every getter once itself then). On a binding that never says "up" the getter is read anyway from 10 s
  after the subscription (since the review, CW-04; before, reads went ahead whatever the flag said).
- The start-up logo has no setting to switch it off (the brief lists none).
- Times are shown to a hundredth. The ± is never under 0.01 s, so a third decimal would promise too
  much. The log has three decimals.
- The screens write ±; the log writes +-.
- The data rate on the Run tab is the run's own (from its middle spacing) once a run is finished, and
  the cell is then labelled RUN DATA RATE; before that it is what arrived over the last 2 s (since the
  review, CW-01; before, it was the rate the app asks of the getter). A notifier that is silent right
  now, while the getter delivers, shows the rate it was measured at while the speed last changed.
  While no speed arrives at all the cell says "--", also with a finished run on the screen (since the
  final check, V-03).
- "Manual speed scale" is a list of 33 rows, -4.00 % to +4.00 % in steps of 0.25 % (the brief has
  -5.0 % to +5.0 % in tenths, which is 101 rows; part 8). A run reads "MANUAL +1.25 %".
- After a run the clock on the Run tab shows the time of the split reached last, a figure that is among
  the results (since the review, CW-11). While a run is timed it counts from first movement (from the
  first foot with "rollout").
- "Reset best" clears the best times and the list of runs, as the kit's Drag Timer does; its second
  press is labelled "Yes, clear all".
- Demo data "Auto" is handled as in Proven Gauges: demo only while the car has said nothing 5 s after
  the start. As shipped it is "Never".
- `fakedrag.js` has its own hand-moved clock (as `warmup_bench.js` has), because `fakecar.js` lets a
  timer run before an answer that is two promises deep has been delivered, which would stamp a getter
  read a tick late. It uses `fakecar.js`'s `checker()` for the checks, unchanged.
- The Signals page shows rate and longest gap per source, not the median spacing (the brief's list for
  that page has those two).
- From gpsscale.js (step 1): the vehicle speed for a GPS ratio is the middle of the 2 s window, because
  the GPS speed is a little old when it arrives; distances use the WGS84 ellipsoid's radii at that
  latitude (a plain sphere would be off by up to 0.5 %, the whole tolerance of a leg).

## 3. What is assumed about the car

None of this was measured by Proven. Signal names and scalings are from public sources.

- **No sample carries a time.** Each is stamped when the app's handler runs. A time is only as good as
  the delay between the car and the handler is constant: a constant delay cancels (tested: 80 ms moves
  no split by 0.0005 s), a delay that varies goes straight into the result (tested: 0 to 5 ms at random
  moves a split by up to 0.011 s at 50 ms spacing). A sample stamped late by a quarter of a send slot
  or more is taken out when the next one shows it (part 2); a smaller lateness stays in the time.
- **How long the head unit holds the app up, and how often, is not known.** A file write, a frame
  drawn by the software renderer and the garbage collector all stop the app for a moment, and a
  sample that arrives meanwhile is stamped when the app gets to it. The tests put in hold-ups of 40 to
  300 ms. Each run's log line says how many samples were taken out as stamped late.
- **What the speed signal does under 0.5 km/h is not known**, and the review showed how much hangs on
  it. "First movement" is the moment the speed passes 0.5 km/h (the brief's definition); that is 0.01 to
  0.2 s after the car begins to move, depending on how gently it pulls away. If the signal reads every
  speed from 0 up, the launch model places that moment within a millisecond or two. If it reads 0 under
  0.5 km/h, the straight line through the moving samples does, and the model is late. The engine does
  not know which car it is on until its series has reported a speed of 0.1 km/h or less; until then it
  takes the earlier of the two and widens the ±. Every run's log line says the smallest speed the series
  had reported before the launch.
- **A signal that reads 0 until the car does 1 km/h or more** makes every time from first movement read
  short by the time the car took to get there: 0.03 to 0.2 s depending on the launch (measured in the
  review: 14 to 34 ms for a 3 s car and 2 km/h, 73 to 104 ms for a 12 s car, 177 ms for a brake-release
  start and 1 km/h). This is not corrected. On a hard launch the first moving samples show it and the ±
  covers it (on the builders' fleet in 93 to 100 % of runs, on the reviewer's cars in 88 % or more); on
  a gentle start the samples cannot show it and the ± does not cover it at all. The Timeslip says
  "Speed signal starts at N km/h: times from first movement read short" on a run whose series had
  never reported less than 0.75 km/h before the launch.
- **A getter read takes about 25 ms and its value is read somewhere in the middle.** A polled sample is
  stamped at the middle of its round trip.
- **The kit reads each getter once itself** whenever the car's service comes up, and hands the answer
  to the notifier's handler. So the first "notified" speed in the log may be that read. The app's own
  reads keep clear of it (part 2). The kit's read and a notification cannot be told apart, so a getter
  that takes more than a second to answer the kit can still overlap the app's first read once.
- **How long a line written to the log holds the app up on the head unit is not known.** On a PC it is
  a fraction of a millisecond. The log is held back while a run is timed and written when it is over;
  while the timer is armed it is written right after a getter reading, once a second at most.
- **Member names.** Speed and acceleration as the kit's car-tested apps read them. The four wheel
  members as the brief gives them (one with a small w). The raw GPS position's two members are found by
  "Latitude" and "Longitude" in their names, whatever the rest of the name is. Height is
  `statusHeightGPSCAN`. The road gradient is `actualValueLongitudinalGradientRoadway` where the value
  has a member of that name (one car's catalogue has), else the first number in it. The event's text is
  `nmeaString`.
- **The four raw wheel values are plain multiples of the wheel's speed.** Their scale is learned. A
  wheel whose ratios spread by more than 3 % is not used.
- **Wheel speeds and vehicle speed reach the app equally late.** If not, the cross-check reads a
  difference that is only that delay: at 0.8 g, 50 ms are 1.4 km/h, which is 5 % at 28 km/h.
- **The acceleration reading never sits perfectly still.** The start slope needs a reading taken after
  the car came to rest. A sensor whose value stays on exactly one count from the drive through the stop
  notifies nothing new, the start slope is then "not known", and a downhill start is not flagged
  (tested, and marked KNOWN LIMIT in the test's output). The stand-in car's reading flickers by one
  count, as a real sensor's is taken to do.
- **Positive acceleration is nose up when standing.** The start slope's sign rests on that.
- **GPS.** The receiver's sentences are standard, each with its checksum; RMC field 7 is knots. The raw
  position is degrees = (raw - 2147483648) / 3600000. The raw height is raw - 32768 metres (reported
  from one car). The road gradient's packing is from one car.
- **The screens on a car.** The text sizes of iDrive 7 and iDrive 8 used in the test (1.165 and 1.419
  times, 49 px of room under the page on iDrive 7) are the kit's own figures.

## 4. Every figure that is a guess

Chosen by reasoning or taken from the kit, none tried on a car. The brief's own figures are in the brief
and not repeated, except where marked.

| Where | Figure |
|---|---|
| run.js | 0.5 km/h counts as standing and 1 s arms the timer (the kit's) |
| run.js | glitch filter: 25 m/s2 (brief), two samples closer than 20 ms count as 20 ms apart (also where a sample that replaced a late one is judged against that one's reading), a held-back sample is fed after 500 ms |
| run.js | above 500 km/h it is no speed |
| run.js | launch fit: three moving samples, or two once the first is 300 ms old (brief), placed for good when the next sample comes; ramp lengths 0 to 400 ms |
| run.js | a first moving sample above 20 km/h: that series missed the launch, no run from it |
| run.js | 5 km/h for a creep and for the lift that ends a run, 60 s the longest run (brief) |
| run.js | 1.6 send slots of silence before a skipped slot is filled in; 3 s the longest silence that is filled |
| run.js | peak g is taken over stretches of at least 250 ms (500 ms on the polled series) |
| run.js | the model may place the launch 0.3 of the spacing from the line between the two samples around 0.5 km/h; a series that has reported 0.1 km/h or less reads from 0 |
| run.js | "no change" after a silence: a step of at most 1.5 times the step per slot before it, plus 1/32 km/h; a hole: more than 2.5 slots; what a hole may hide: the change of speed across it x its length / 4 |
| run.js | samples less than 2 ms apart arrived together |
| run.js | a sample stamped late: the next comes less than three quarters of a send slot after it and more than 1.75 slots after the one before it; the rule is switched off for the run if samples replace each other for more than 1 s; a spacing short of a slot by more than 5 % (and 1 ms) counts as a stamp that late; 250 ms as the longest slot these rules reckon with |
| run.js | the send slot: the middle one of the run's first 8 spacings that are not holes; before that of the spacings so far (three or more); before that the slot of the series' last run |
| run.js | a launch seen late is run back at most 2 s; the app's tick counts as late when it is 1.5 times its usual spacing plus 10 ms apart, and a first moving sample within half that spacing after a late tick counts as held up too |
| run.js | the speed split: a sample within 1 km/h under the target after the speed was heading past it counts as "may have touched it" if the car could have lost that much at 5 km/h per second |
| feed.js | 50 / 500 / 2000 ms periods, 5 minutes, a read over 500 ms thrown away (brief) |
| feed.js | a read not answered after 10 s is given up; after 10 failed reads in a row the getter is tried every 2 s; after a read that ran into its 1 s limit the next waits until 4 s after it began |
| feed.js | a hole counts from 0.3 s, a repeated value from 1 s (which engine is taken, the DATA GAP flag) |
| feed.js | "the speed is changing" = it moved 0.5 km/h within 1 s |
| feed.js | acceleration getter: every 100 ms after 2 s without a notification (brief), and from then until one arrives |
| feed.js | a finished run waits up to 2 s for the other engine |
| feed.js | "launch seen late" = launch gap over 150 ms and over 2.5 times the median spacing; "ended in silence" = no sample in the run's last second |
| feed.js | the screen changes to the other engine during a run only when that one leads by 3 samples |
| feed.js | a series is taken as not being sent after the other has seen the car move for 1 s |
| gpsscale.js | the manual speed scale reaches 4.00 % either way in steps of 0.25 % (33 rows: the longest list in any app of the kit has 35) |
| gpsscale.js | one ratio a second; "level" = under 0.5 km/h of change in the 2 s; 15 rising and 15 falling ratios within 0.3 % |
| gpsscale.js | the newest speed sample may be 3 s old; a GGA older than 5 s no longer vouches for the fix; a fix is quality 1 to 8 with at most 99 satellites |
| gpsscale.js | ratios outside 0.80 to 1.25 are thrown away; the last 300 are kept |
| gpsscale.js | the navigation's position is used once the raw one has been silent for 5 s |
| gpsscale.js | a leg is given up at 3000 m, or when no speed sample came for 3 s |
| gpsscale.js | the receiver's height counts for 3 s, the raw height for 5 s |
| wheels.js | 20 steady moments before a factor counts, the last 200 kept, 3 % spread limit, a speed sample may be 1.5 s old |
| wheels.js | a step between two wheel events counts for at most 0.5 s |
| wheels.js | the estimate: 8 km/h floor and 2 s for the sensor's standing reading (the kit's); 1.5 s of acceleration kept; 250 ms before the launch not taken as standing |
| slope.js | the last 250 ms before the launch are left out; at least 300 ms of standing readings; a reading older than 60 s is not trusted |
| car.js | a getter read gives up after 1 s; a getter is read once its service has been up 1 s and 300 ms after the first value came (3.3 s if none came; 10 s after subscribing on a binding that never says "up"); subscriptions tried again after 5, 15, 60 s |
| car.js | an acceleration beyond 30 m/s2 is no value; a speed above 500 km/h is no value |
| slope.js | a road gradient beyond 35 % either way is no value |
| session.js | a calibration learned for the first time is written 10 s after the last write at the earliest; a GPS factor that drifts, once it is 0.1 % from what the file holds and 5 minutes after the last write; never while armed or timing |
| session.js | the speed is "there" while a sample is at most 1 s old (2.5 poll periods if longer); a run ends 3 s after the last sample of either series; the data rate shown is over the last 2 s |
| session.js | DATA GAP from 0.3 s of hole or of the app held up (its 50 ms tick 250 ms apart or more), or 1 s on one value |
| heldlog.js | at most 600 lines are kept while a run is timed; one write a second while armed |
| session.js | a height reading counts for a line crossed up to 3 s after it (the receiver speaks once a second) |
| session.js | demo data "Auto" starts 5 s after the app if the car has said nothing |
| main.js | the tick is 50 ms; the logo shows 1.4 s and fades over 0.45 s; a reset must be confirmed within 5 s |
| demo.js | the whole demo run is invented |

## 5. What to look at on the first car

In this order. The log is `pps_drag.log` in the app's data folder.

1. **Does it subscribe.** Seven lines "signal ...: subscribed", or "this head unit does not have it" for
   an optional one. "signal SatellitePositioning: subscribed to the event updatePosition" shows that
   the event subscription works at all (the kit has it for another interface only). Positioning is
   asked for at instance `Main_Instance`.
2. **How the speed arrives.** `raw speed (notified) #n` and `raw speed (getter) #n` with "the read took
   N ms". Then `rate speedN: ... a second while the speed changes`. Is it notified at all, how often,
   how long does a read take, do 20 reads a second trouble the head unit (the kit's own line "loop
   MAIN: N ms per frame"). How often does one read take far longer than the others (a run's line
   then says "a getter read at the launch took far longer than usual"). In what steps does the value
   move: 1/64 km/h is assumed, and coarser steps lose clean launches (part 10).
3. **What the speed signal does under 0.5 km/h.** This is the first thing to learn, because the launch
   instant hangs on it. In each `run, ...` line: "first sample X km/h" and "smallest speed this series
   reported before: Y km/h". Y of 0.1 or less after a few stops: the signal reads from 0, the launch
   model is used, nothing is added to the ±. Y stuck at 0.5 or so: it reads 0 under that; the straight
   line is used and the ± is wider. Y of 1 or 2: the signal cuts in late and every time from first
   movement reads short by 0.03 to 0.2 s, depending on the launch. Not corrected; the Timeslip says so.
4. **The two engines against each other.** The two `run, notified` / `run, polled` lines of one launch
   should agree within their ±. If they differ by a steady amount, their delays are not constant in the
   way assumed. If the app says SERIES DISAGREE on clean launches, that is the same finding (on the
   test model two clean series never disagreed in 120 runs).
4a. **Flags on launches that looked clean.** DATA GAP, SPEED JUMP, SERIES DISAGREE and the line "the
   app was held up for N ms" in the log. Each run's "run extras" line ends with what drew the screen
   (GPU renderer or software renderer): the software one draws every frame in the app itself, and
   nothing else runs meanwhile. If DATA GAP comes up with the software renderer only, that is why.
4b. **Lines "(logged N s later)".** Those were held back while a run was timed. If a line is written
   while the timer is armed at the very moment of a launch, the first moving sample is stamped late by
   however long the write took; the "launch gap" in the run's line would show it.
4c. **How often the app is held up.** In each `run, ...` line: "N stamped late and replaced by the
   next", "LAUNCH SEEN LATE", "the app was held up for N ms when the first moving sample came", "first
   samples unevenly spaced by N ms". On a quiet head unit none of them should appear. If they appear on
   most launches, the head unit holds the app up often (the software renderer is the first suspect), the
   ± of those runs is wider for it, and the figures in part 4 for a late stamp need a second look.
4d. **A reading that is wrong for a moment.** SPEED JUMP on a launch that looked clean, a run that
   ended early with no lift, or "A SAMPLE READ FAR LOWER THAN THE ONE RIGHT BEFORE IT" in a run's
   line: keep the `raw speed` lines around it. Whether a car's speed ever reads too high or too low
   for a moment is not known, and the rules of parts 8 to 10 against it cost clean runs in some
   corners. What a car shows decides which of them are worth keeping.
5. **Against a timer you trust.** A GPS timer on the same runs, for 0-100 and the 1/4 mile. This is the
   only check of the whole chain.
6. **The speed scale.** `raw GPS sentences #n` shows which sentences come and what is read out of
   them. After a minute at a steady speed above 60 km/h: "speed scale learned: x0.9...". Is the factor
   believable for the car's tyres? The Signals page shows the count on the way.
7. **Wheels.** `raw wheel speeds #n` prints the whole event: are the four member names right, are the
   values plain numbers. "wheel factor FL learned: ..." four times after a steady stretch above
   30 km/h; the Signals page shows the spread. **Does SPEED READ HIGH AT LAUNCH come up on launches
   without wheelspin?** If it does on every run, it is the delay between the two signals, no run sets a
   best, and the rule needs changing before the app is used.
8. **Acceleration and slope.** Standing on a known slope: does "SLOPE NOW" on the Run tab show it,
   with the right sign (+ is nose up). Does the reading keep arriving while the car stands (`rate
   accel`). The wheelspin estimate on a launch known to be clean: how high does it read.
9. **Height.** A run on a road with a known fall: the Timeslip's height change against it, and which
   source it names in the log (gga or can). Whether the raw height really is raw - 32768.
10. **The car's road gradient and the wheel-travel counters.** Raw in the log and on the Signals page,
    for study only. The gradient decoded against the standing slope.
11. **The screens.** On iDrive 7 and iDrive 8: text sizes, nothing cut off, the BETA badge beside the
    tabs, the buttons on the page where the kit runs the screen (Reset run, Reset best, Reset
    calibration), the bar's first button changing its label with the tab where it does not.
11a. **The install itself** (one thing with no precedent in the kit, which could not be tried here).
    SatellitePositioning is asked for with an event only (no field, no method): BMW's generator on the
    head unit has to accept that entry. The app asks for de.bmw.infotainment.SatellitePositioning with
    one event and no field or method; the built manifest entry is
    `{"instances": "1", "broadcasts": ["updatePosition"]}`. A public app by another author carries
    exactly that entry in its built manifest, and by the note made of it on 23 Nov 2026 its README
    says the sentences were seen to arrive on a car. That could not be read again when this record was
    last corrected, and Proven has not tried it. So there is a precedent for the entry, but still no
    result of Proven's own.
    "Manual speed scale" is no longer on this list: it was a drop-down of 101 rows in the HMI's own
    settings screen and is now one of 33 (the longest in any kit app has 35; part 8).
12. **The saved file.** A run, then the app closed and opened: Best and Timeslip still have it.
13. **A getter-only car, if one is at hand.** Driving, the Run tab must say STOP TO ARM, not READY.
14. **The data rate, NO SPEED FROM THE CAR, and ARMED, NO NEW SPEED.** Standing with the app open,
    "DATA RATE" must show what the log's `raw speed (getter)` lines suggest (20/s if a read takes
    25 ms). If the Run tab says ARMED, NO NEW SPEED on a car that is standing with the ignition on, the
    getter is not answering and the car is timed from its notifier alone: the log has "speed getter: a
    read failed" or "took N ms and was thrown away". A launch must then show TIMING and a speed. If it
    does not, that car gives the app no speed at all. NO SPEED FROM THE CAR while standing means the
    getter did answer and has stopped, or nothing ever arrived. If the line under it says "Timer armed.
    Closed roads and track days only", the timer is armed on the last speed it heard: note whether a
    launch is then timed (it is, if the car notifies its speed).

## 6. What was not done

- Not run on a car, on a head unit, in the kit's emulator, or on Node.js 8.
- No full build: that needs BMW's app SDK from a head unit. Only `--preview-only` builds were made. So
  the installable package, the HMI's own settings screen for this app, and the step that copies
  `icon.png` into the package were not exercised.
- `make_icon.py`'s "drag" figure was never run (no Pillow, no artwork file on the build machine).
- No pictures from the GPU renderer (the 60 fps path, full screen). The test checks where every text
  lands at the kit's iDrive 7 and iDrive 8 sizes; the saved pictures are the software renderer's at PC
  size.
- A speed signal that cuts in late is noticed where the samples show it, not corrected. Looking for
  the start of movement in the acceleration signal instead (the reviewer's idea) was not tried: the
  delay between that signal and the speed is not known either.
- Nothing is corrected for slope, wheelspin, a lagging speed signal or a delay that varies. The ± covers
  sampling only, and the Timeslip says so. Measured in the review: a speed signal smoothed with an 80 ms
  lag reads 0-100 33 to 41 ms long, and nothing in one series can show that (two series that differ
  are flagged SERIES DISAGREE).
- A creep or a roll-back that runs straight into the launch is timed from that first movement when no
  sample caught the car standing in between, and a lone 0 within the first three moving samples starts
  the launch again (the brief's creep rule). Times come out long in the first case, short in the
  second. The Timeslip says "launched N s after a roll" when a launch follows a creep by under a second;
  nothing more is done about either.
- A hold-up of the app right at the launch that leaves no trace in the samples is not seen: one late
  first sample on a series whose send slot is not known yet, with the app's tick on time. The launch
  is then placed late by up to the hold-up and the ± does not say so (part 8, V-01, "What is left").
- A car that only notifies its speed and one whose notifier has died while it stood cannot be told
  apart: both read ARMED, NO NEW SPEED. More corners of that rule are in part 8, V-04, and part 9,
  W2-03.
- Best times are kept per start convention, not per speed scale: an UNCALIBRATED run and a GPS-scaled
  one compete (each best shows the scale it was set with).
- The ± of the distance splits is the brief's and far larger than their error on clean data (18 to 90
  times, measured in the review). Left as the brief has it.
- The wheelspin estimate was made less wrong, not made right: what is left is the unknown delay between
  the car's acceleration and its speed.
- A start slope on a car whose acceleration reading does not move through a stop is "not known" (part
  3). Not solved.
- `proven/README.md` and the note at the top of `README.md` were not edited while the app was built
  and reviewed. They were written afterwards. They now name three apps and say that Proven Drag is
  BETA and has not been on a car. `mgu-repo.json` lists three components: if this branch is published,
  the Store source offers an app that has never been on a car (its description begins "BETA, not yet
  tested on a car").
- No home-screen widget and no autostart: the app only runs once it has been opened after a start of
  the head unit, and times from then on, screen showing or not.
- On the stand-in car the legs method ran on a straight road along a parallel, and the GPS speed method
  at one steady speed. `test_drag.js` tries more on the module alone (a wandering road, a car that slows
  or gains speed, north and east, both position sources).

## 7. After the review

Two independent reviews of commit 6a574b5 (one of the numbers, one of the car side and the words), each
with its own stand-in car and probes. Every must-fix and should-fix finding was first reproduced here
(the reviewers' probes, run again on a copy of that commit, gave their figures to the digit), then
fixed, then given a check in `test_drag.js` or `test_drag_car.js` that fails on the old code and passes
on the new and says in its sentence what was wrong. Run on the build of 6a574b5, the two test files as
they are now fail 50 and 44 checks. The reviewers' probes were run again on the fixed build; "now"
below is from those runs unless it says otherwise. All of it is on a PC, on made-up cars.

### The numbers

- **N1, the launch instant was placed late (must fix).** With a speed signal that reads 0 under
  0.5 km/h, 0-100 read 7 to 10 ms short at 20 ms spacing with a ± of 0.01 (outside the ± in 29 to 52 %
  of launches); on a brake-release start at 100 ms spacing 26 to 30 ms short, up to 82 ms. Fixed in
  `run.js` (part 2, "The launch instant"): the two samples around 0.5 km/h overrule a model that
  contradicts them; where it is not known what a 0 means, the earliest of the model, the straight line
  and the line through the first two moving samples is used and their difference is added to the ±;
  held at an end of the launch gap, the whole gap is added. Now: outside the ± in 0.1 % of the
  reviewer's 13200 launches (was 7.1 %); brake-release start at 100 ms: 5 ms short on average, worst
  30 ms, 0 % outside. What is left: the same start at 200 ms spacing with such a signal is still 75 ms
  short on average and outside the ± in 30 % (the kink falls between the first two moving samples, and
  nothing in the data shows it). The price: on a series nothing is known of, the ± is 1 to 11 ms wider
  on clean data, and launches whose acceleration is there at once and then drops read 1 to 6 ms longer
  than before. `dragsim.js` has the brake-release launch (`shape: 'creep'`); the cut-off signal was
  there already (`floor: 0.5`).
- **N2, a hole in the notified series was read as "the speed stood still" (should fix).** A lone 0
  dropped by the filter left a hole that was filled in: 0-100 73 ms long. A hole of 1 s: every later
  distance split 68 to 114 ms long with ± 0.01 to 0.04. Fixed in `run.js` (part 2, "Silence on a
  notified series"). Now: the lone 0 costs nothing, the 1 s hole leaves the later splits within their
  ±, which is wider by what the hole may hide; a run with a hole of 0.3 s or more is flagged DATA GAP.
- **N3, the choice between the two engines could pick the worse one (should fix).** Fixed in
  `feed.js`: a hole or a repeated value loses; lumps are merged before the spacing is taken; two
  engines that differ by more than their two ± are flagged, the ± widened, no best. Now, on the
  reviewer's 17 cases: the worse engine is still taken in one (was 6). That one is a notifier that
  sends a smoothed speed (150 ms behind) against a getter that reads the true one: nothing in either
  series says which is right, the notifier is taken for its spacing, and its times are outside their ±
  in 21 to 48 of 100 launches (was 100 of 100); where the two differ by more than their two ±
  together the run is flagged SERIES DISAGREE.
- **N4, two wrong high samples in a row made up a 0-100 (should fix).** 2.7 s instead of 6.5 s, kept,
  could set a best. Fixed in `run.js`: a confirmed step upwards of more than 25 m/s2 ends the run at
  the sample before it (ended "jump", flag SPEED JUMP). The same catches a getter that repeats an old
  value and then catches up. (This fix ended clean runs too, when a sample was stamped late. That was
  found in the final check and put right: part 8, V-01.)
- **N5, the ± of the 0-100 near a gear change (should fix).** Outside the ± in 35 to 45 % of launches
  at 100 and 200 ms spacing when a gear change begins at 100.1 km/h. Fixed in `run.js`: the crossing is
  also worked out from the line before and the line after it, and from where the speed was heading if
  the next sample fell just short; their spread goes into the ±. Now 0 % outside on the notified
  series, 2 to 4 % on the reviewer's polled one (which is not told the round trips).
- **N6, getter reads that take long (should fix).** The scheduler now hands each read's round trip to
  the engine, half the middle one is added to the ± of a polled run, and the run's log line says it.
  On the builders' model with 100 ± 40 ms reads: 100 % of 100 cars inside the ± (93 % without it). At
  the 25 ms reported from one car this adds about 0.01 s to a polled run's ±.
- **N7, a GPS factor 1 % wrong was accepted (should fix).** Fixed in `gpsscale.js` (part 2). Now: every
  case of the reviewer's that gave a wrong factor gives none; the steady-speed cases still give theirs
  within 0.05 %. A receiver that speaks 10 times a second now needs a minute, not six seconds.
- **N8, the text on a signal that cuts in late understated it (should fix).** Rewritten (part 3, and
  the top of `run.js`): 0.03 to 0.2 s depending on the launch; the ± may not cover it at all. With the
  whole launch gap in the ± when the launch is held at the standstill, the hard launches are now
  covered in 88 % or more of the reviewer's cases (some were 0 %); the gentle ones are not (100 %
  outside, as before). Not done: finding the start of movement in the acceleration signal.
- **Notes.** N9 (the ± of distance splits is far larger than their error): left as the brief has it.
  N10 (peak g read 4 to 11 % high on the polled series): taken over 500 ms there. Now, as measured:
  on average within 1 % of the same car's notified series on the builders' model (0.2 %); single runs
  still up to about 5 % high on the reviewer's model (true 1.203 g shown as 1.219 to 1.267 g, 0.703 g
  as 0.716 to 0.738 g; it was 4 to 11 % high).
  N11 (a creep or roll-back into the launch): the brief's creep rule was kept; the Timeslip says
  "launched N s after a roll". N12 ("first movement", app stalls, a smoothed signal): what first
  movement means is in part 3; samples that arrive together after a stall are merged and the stall is
  flagged DATA GAP (later splits were 66 to 127 ms long, now within their ±); a smoothed signal cannot
  be seen in one series. N13: the per-percent figure is given as a range; MANUAL's direction is in the
  setting's label ("+: the car reads low"); a stuck receiver and bests per scale were not touched.
  N14 (the wheel cross-check and the downhill rule have limits): nothing to fix, both are in part 5.

### The car side and the words

- **CW-01, the data rate was what the app asks for (must fix).** "SPEED 20/s, GETTER" with a getter
  that delivered 3 a second, or nothing. Now it is what arrived over the last 2 s, and "--" when
  nothing does.
- **CW-02, a speed that had stopped was shown as READY (must fix).** Fixed (part 2, "A speed that has
  stopped arriving"): NO SPEED FROM THE CAR with how long, no speed shown, "stopped N s ago" on the
  Signals tab, the polled engine not left armed, a run that loses both series ends after 3 s (DATA
  GAP). (What this did to a car that only notifies was changed after the final check: part 8, V-04.)
- **CW-03, direction of travel in the log, a height above sea level in the saved file (must fix).**
  The course, the heading and the raw heading member are no longer written (part 1); a saved run keeps
  height changes only. The reviewer's probe still counts 20 lines with the words: those are the member
  NAMES in "members ..., heading, ...", with no value.
- **CW-04, two reads of the speed getter in flight (should fix).** Fixed in `car.js` and `feed.js`
  (part 2). On the reviewer's stand: 0 of 41 of the kit's reads overlapped (was 40), 0 of 20 starts
  (was 20), a getter that answers after 3 s has at most 2 reads unanswered together (was 4). Left: a
  getter that takes over a second to answer the kit's own read overlaps once at the start; a getter
  that never answers is still asked 15 times a minute.
- **CW-05, a damaged saved file made the Timeslip throw on every frame (should fix).** `store.js` now
  checks every part of a run the screens draw, and `screens.js` checks again before it formats.
- **CW-06, the saved file was rewritten every 10 s on a motorway (should fix).** 225 to 352 writes an
  hour. Now a factor that only drifts is written once it is 0.1 % from what the file holds and at most
  every 5 minutes: 0 extra writes in 20 minutes of the same flicker on the builders' stand.
- **CW-07, file writes inside the first timed run (should fix).** 34 log lines between the launch and
  the 1/4 mile. Now none: the log is held back while a run is timed (`heldlog.js`), and each run's
  record says what drew the screen. Not solved: the software renderer still draws each frame in the
  app while samples wait; while armed the log is still written, at the quietest moment there is.
- **CW-08, nothing on a screen said BETA (should fix).** A BETA badge beside the tabs on every tab, and
  the Timeslip says "BETA: not yet checked against a car or a GPS timer".
- **CW-09, a run that could not be saved looked saved (should fix).** The Timeslip and the Best tab now
  say NOT SAVED until a write works again.
- **CW-10, a file from a newer version was read as version 1 and written over (should fix).** It is now
  kept whole as `pps_drag.json.newer`, and the log says so.
- **CW-11, the clock after a run matched no result (should fix).** It now shows the time of the split
  reached last.
- **Notes.** CW-12: the road gradient is read by its name, with limits on it, on the speed shown and on
  the satellite figures. CW-13: the wording points were taken (the log's line on CDS2, "SPEED --", the
  Signals line where there is no GPS source, the "Clock starts" and "Manual speed scale" labels, "Yes,
  clear all", the year on best times, "Readings" for the wheels' count). CW-14: the 101-row list and
  the event-only interface were put on the first-car list (part 5, 11a). Since the final check the list
  has 33 rows (part 8), and for the event-only entry there is a precedent outside Proven: a public app
  by another author carries exactly that entry in its built manifest (part 5, 11a, has the details;
  Proven has not tried it). `README.md`'s note that said two Proven apps was changed afterwards, with
  the README parts. CW-15
  (what runs while the app is hidden): nothing changed.

### What the fixes cost

- The ± is wider where the data leave something open: by what two launch placements differ on a series
  nothing is known of (about 1 ms at 20 ms spacing, 4 at 100 ms, 11 at 200 ms on clean data), and by
  half the getter's round trip on a polled run.
- More runs carry a flag, and a flagged run sets no best. On the test model a clean run carries none.
- A car that only notifies its speed read NO SPEED FROM THE CAR while it stood. (Since the final check
  it reads ARMED, NO NEW SPEED: part 8, V-04.)
- The log of a run is written when the run is over, so a head unit switched off in the middle of a run
  loses that run's lines.

## 8. After the final check

A third, separate check was made of commit d0975b2, the state after part 7, with the two reviewers'
probes and probes of its own. It found every must-fix and should-fix point of the two reviews closed,
and four new things (V-01 to V-04 below). Each was first reproduced here on d0975b2, then fixed, then
given checks in `test_drag.js` or `test_drag_car.js` that fail on d0975b2 and say in their sentence
what was wrong. Run on the build of d0975b2, the two test files as they were after this step failed
22 and 13 checks.
The earlier probes were run again on the final build. Every figure below is from a PC and made-up
cars. Nothing has run on a car.

### V-01, a sample stamped late ended a clean run as a "jump" (should fix)

**What was wrong.** The fix of N4 (part 7) ends a run when the speed makes a step upwards of more than
25 m/s2 and the next sample confirms it. The step test divided the speed gained by the time between
two stamps. A stamp says when the app's handler ran. If the app is held up for a moment, a notification
waits and is stamped late, and the next one comes on time: the two stamps are then a few ms apart, with
a whole send slot's gain in speed between them. That looked like a step no car does, the next sample
agreed with it, and the run was ended: flag SPEED JUMP, no later split, on a clean run. On a car whose
getter answers, the polled engine saved the run. A car timed from its notifier alone lost it.

**Reproduced on d0975b2.** The first reviewer's glitch probe, case 13b (the app held up for 300 ms at
40 km/h, notifier every 100 ms): 47 of 200 runs ended as a "jump". The checker's probes: one hold-up
of 40 to 300 ms per launch ended up to 94 of 200 runs of a 3 s car and up to 58 of 200 of a 6.5 s car;
through both engines with the getter dead, up to 105 of 200 runs had no 1/4 mile time; notifications
0 to 30 ms late at random on a 50 ms notifier ended 31 of 196 runs, 0 to 40 ms late 140 of 177. A
probe written for this fix (`r01`: three cars, four spacings, seven places in the run, six lengths of
hold-up, 100 launches each) counted 2787 of 50400 runs that did not reach the 1/4 mile and 3053
results wrong by more than their ±, the worst by 0.26 s. Most of the wrong results came from a hold-up
at the launch itself, which the code before the review got wrong too (it finished every run, with
11769 results beyond their ±).

**What was done (run.js; part 2 has the rules, the top of run.js the reasons).**
- A step upwards is judged over the time the two readings can really be apart: one send slot at least
  on a notified series, the stamps plus half of both round trips on a polled one.
- A sample of a notified series that comes less than three quarters of a slot after the one before it
  replaces that one, if it is where a sample is due. The stretch across is a hole with a straight line
  through it. Samples that waited and are then handled a few ms apart end up as one sample this way.
- A late stamp that stays (under a quarter of a slot late) goes into the ± of a line crossed beside it.
- Where a confirmed step is still left, the sample before it is taken out instead of ending the run
  if the stamps show that it was late (it was the end of a lump, or the run's first moving sample, or,
  while the slot is not known yet, it came after a long wait and just before the next).
- The launch: the first moving samples stamped late are taken out and the launch is run back from the
  samples after them, with the whole stretch in the ±. A last standing sample that arrived together
  with the first moving one is taken out the same way. The launch is placed for good one sample later
  than before. If the app's own tick was late when the first moving sample came, or the first moving
  samples are unevenly spaced, the ± says so.

**Now, on the final build.**
- Case 13b: 200 of 200 runs reach the 1/4 mile, none wrong by more than its ±.
- The checker's probes: no run ends as a "jump" in any row; the largest amount by which any result is
  beyond its ± in the hold-up probe is 0.0 ms (was 34.8 ms); with the getter dead every run has its
  1/4 mile time; with notifications late at random no run ends as a "jump", and the 0-100 is beyond its
  ± in 3 of 200 launches in one row (0 to 80 ms late on a 100 ms notifier) and in none elsewhere.
- `r01`: 0 of 50400 runs fail to reach the 1/4 mile, and 43 of 302400 results are wrong by more than
  their ±, the worst by 20 ms. All 43 follow a hold-up at the launch or just after it, on the 20 ms and
  the 200 ms series. With the notifier every 50 or 100 ms no result is beyond its ±.
- Two, or three, samples of 250 km/h in a row at 60 km/h still end the run at the sample before them
  with no 0-100 (the first reviewer's case 9: 200 of 200, as before), also right after a late stamp and
  right after a lump. That was tested with 250 km/h only. The second check found that a reading 5 to
  40 km/h too high was taken for real there: part 9, R2-01.
- Clean data: the reviewer's accuracy table is the same to the digit on every series that sends on an
  even grid; the brief's bounds and the tightened ones hold unchanged; the flags stay at 0 on clean
  data (the checker's probe: 0 of 3000 launches per pair of series, 4 of 3000 with a 60 ms round
  trip, as before).

**Neighbours that were found and fixed with it.**
- A series delivered in lumps (sent every 10 ms, handed over every 90 ms): the first lump was taken
  as the launch. With the lumps at ten places against the launch, 0-100 was up to 77 ms off, beyond
  its ± or not timed in 52 of 80 launches. Now within 6 ms and within its ± in all 80.
- A polled run on a car that pulls hard: a read that was in flight while the app was held up comes
  back late and is stamped at the middle of its long round trip. A 1.45 g car lost up to 22 of 200
  runs to a "jump" that way, a 1.7 g car about half. Now none (`r02`). That probe, and the test's
  check, hold the app up at 15, 40 and 60 km/h, never at the launch. What such a read did to the
  launch was found by the second check: part 9, R2-02.
- Two moving samples, then two seconds at one speed: a silence is not a late stamp (found with the
  first reviewer's launch probe while this was being built; it has a check).

**What it costs.**
- On a series whose stamps are uneven the ± is wider, because the stamps show that something is open.
  The reviewer's series with every sample 0 to 15 ms late on a 100 ms notifier: the ± of the 0-100 is
  71 ms on average, was 57 (its error: 6.4 ms mean absolute, was 6.0; the worst is the same 36 ms).
  With 0 to 8 ms on a 20 ms notifier: 25 ms, was 15.
- A series in lumps is always timed as "launch seen late", with a wider ± (0.05 s against 0.03 s in
  the test's case).
- The launch is placed for good one sample later, so the figures on the screen can shift for one
  sample longer after the launch.
- A notifier that doubles its pace right after a hole has its samples replace each other for one
  second before the rule gives up: a hole of one second, flagged DATA GAP. The code before had no such
  hole there. A notifier that doubles its pace without a hole has no sample taken out, but every
  sample then counts as late by half a slot, and the ± of every split grows to about 0.1 s on a run
  whose times are right to a millisecond (0.02 to 0.04 s before). Both have a check; the check of the
  second looks at the times, not at the ±.
- More code in the timing path: `run.js` had 1080 lines after this step, comments included; it had
  800 before.

**What is left.**
- A hold-up of the app right at the launch that leaves no trace: one late first sample on a series
  whose send slot is not known yet, with the app's tick on time. The launch is then placed late by up
  to the hold-up, and the ± does not cover it. In `r01` that is the 43 results above.
- A sample late by less than a quarter of a slot stays. Its lateness goes into the time, as it did
  before; the ± covers it where the next spacing shows it.
- Samples that waited and are then handled three quarters of a slot apart or more are not seen as a
  queue.
- One corner where a launch is still lost, found by the second check: a notifier that sends only every
  200 ms, on a car that pulls about 1.5 g, with its first moving sample stamped late. That sample is
  taken out, the next is already above 20 km/h, and the launch gives no run or ends as a "jump". Long
  hold-ups at the launch (300 ms and more) also lose launches. Part 9 has the figures.
- How long the head unit really holds the app up, and how often, is not known (part 5, 4c).

### V-02, peak g on the polled series (a note)

Part 7 said "now within 1 %". That was the average the builders' test prints. Said as measured now:
on average within 1 % (0.2 % on the builders' model); single runs still up to about 5 % high on the
reviewer's model (it was 4 to 11 %). The code did not change.

### V-03, the data rate cell under NO SPEED FROM THE CAR (a note)

With a finished run on the Run tab and the speed no longer arriving, the banner said NO SPEED FROM THE
CAR and the cell beside it still said "SPEED 20/s, GETTER", the finished run's rate. Now the cell says
"SPEED --" whenever no speed arrives. While a finished run is shown and the speed arrives, the cell is
the run's own rate and is labelled RUN DATA RATE. The run's rate stays on the Timeslip. The second
reviewer's probe that showed it now prints "SPEED --" at 2, 10, 60 and 600 s after the speed stopped.

### V-04, a car that only notifies its speed (a note)

Such a car sends nothing while it stands. After the fix of CW-02 it read NO SPEED FROM THE CAR and
never READY, the line "Closed roads and track days only" never showed, and its launch was timed all
the same. Now the Run tab says ARMED, NO NEW SPEED with that line when nothing arrives but the notified
engine is armed, and the car's notifier has been heard while the speed changed or its getter has never
answered a read of the app. No speed is shown, because none is arriving. The Signals tab says "silent"
for the notified speed in that state, not "stopped".

It still says NO SPEED FROM THE CAR, with how long, where the car's getter has answered at some time
(in time, or too slowly to be used), has stopped, and the notifier has never been heard (a launch would
not be timed, as far as the app can tell), and where nothing is armed at all (no speed ever, or the
last speed heard was not a standstill).

What the app cannot tell apart, and what follows from it:
- A car that only notifies, standing, and a car whose notifier has died while it stood. Both read
  ARMED, NO NEW SPEED.
- A car that never notifies and whose getter answers the kit's own first read but none of the app's
  (it takes 1 to 3 s): it reads ARMED after that one value, although nothing will be timed.
- A car that notifies and whose getter answers too slowly to be used: it reads NO SPEED FROM THE CAR
  while it stands until its notifier has been heard once, and ARMED from then on. Its first launch is
  timed without the closed-roads line having shown.

### The "Manual speed scale" list

It was a list of 101 rows (-5.0 % to +5.0 % in tenths). The longest list in any app of the kit has 35
rows, and nobody knows how the head unit's own settings screen takes 101. It is now 33 rows: -4.00 %
to +4.00 % in steps of 0.25 %. The meaning is the same: + means the car reads low, and the speed is
multiplied by 1 + value. The setting holds hundredths of a percent; a run reads "MANUAL +1.25 %".
Nothing was installed anywhere, so no saved value had to be converted. The brief asks for tenths over
5 %: this departs from it in both range and step.

### The event-only GPS entry (the first review's CW-14)

Part 5, 11a has the fact in full: another author's public app carries exactly the manifest entry this
app asks for, and by the note made of it its README says the sentences arrived on a car. Proven has
not tried it.

### What changed in the tests

After this step `test_drag.js` had 388 checks (was 362) and `test_drag_car.js` 304 (was 281).
Expectations of existing checks that were changed on purpose: the manual scale (hundredths of a
percent, held to 4 %, the shape of the list, "MANUAL -3.00 %"); and the check that a car whose getter
never answers reads NO SPEED FROM THE CAR while it stands, which now expects ARMED, NO NEW SPEED. No
bound was loosened.

The earlier probes on the final build: two exit codes changed from 0 to 1, both for the manual scale
list. The first reviewer's conventions probe has two checks of 46 that expect tenths up to 5 %, and
the second reviewer's manifest probe has one that expects the list from -50 to +50. Every other exit
code is as it was on d0975b2. In the second reviewer's poller probe the banner of a car that only
notifies now prints as "?": the probe does not know the words ARMED, NO NEW SPEED.

### What was not done

- Nothing ran on a car, a head unit or Node.js 8, and no installable package was built.
- The stand-in car of `test_drag_car.js` has no way to hold the app up or to deliver in lumps: the
  late stamps were tested in the logic test and with the probes only.
- The builders' "break it and see the test fail" script was not run again.
- The list of 33 rows was not seen in the head unit's own settings screen (no full build). The kit's
  own tests were not run, and no localised build was made.
- `proven/README.md` and the note at the top of `README.md` were written after this step.
- The pictures were drawn again; the ones the changes touch were looked at, the others were checked by
  the test's rules only.

## 9. After the second check

Two more separate checks were made of commit b77cd97, the state after part 8 and the README parts: one
of the numbers, one of the car side and the words. Both said "fix first". The numbers check found two
points that should be fixed (R2-01, R2-02) and four notes. Of the other check's points, eight were
handed on to be fixed (W2-01 to W2-08): two that had to be, six that should be. Each was first
reproduced here on b77cd97, then fixed. Where a point is about what the app does, it got checks that
fail on b77cd97 and say in their sentence what was wrong: run on the build of b77cd97, the two test
files as they are now fail 10 and 4 checks. The earlier probes were run again on the result. Every
figure below is from a PC and made-up cars. Nothing has run on a car.

### R2-01, a reading that is too high right after a late stamp made up a 0-100 (should fix)

**What was wrong.** This was damage done by the fix of V-01 (part 8). The protection of N4 (a wrong
high reading must not make up a 0-100) only held for a gross value such as 250 km/h. A reading 5 to 40
km/h too high was taken for real in two cases.
- Right after a sample that was taken out as stamped late, or after a hold-up of the app. The sample
  taken out was forgotten, and the next one was judged from the sample BEFORE it, over two slots or
  over the whole hold-up. Over that time 10 or 20 km/h is no step.
- On the polled series at any time. Half of both round trips was added to the time a step is judged
  over, for every pair of reads. With reads of 25 ms a step of about 6.7 km/h passed (4.5 before).

The run then showed a 0-100 that was far too short (by 0.93 s in the checker's trace), ended as a lift
when the true speed came back, carried no flag and could set a best.

**Reproduced on b77cd97.** The checker's trace (a 6.5 s car, notifier every 100 ms): one sample 10
km/h too high at 93 km/h, right after a notification stamped 60 ms late, gave a 0-100 of 5.570 s where
the true one is 6.500 s. Two such samples gave the same, and two right after a hold-up of 150 ms gave
5.546 s. The checker's wider probe (three cars, 20 launches a cell and car, the signal too high from
93 km/h on for 60 to 420 ms by 6, 10, 20 or 40 km/h or reading 250 km/h): launches with a 0-100 beyond
its ±, on d0975b2 and on b77cd97: 7 and 1378 of 6000 after one notification stamped 0.6 slot late, 561
and 2162 of 7200 after a hold-up of 150 ms, 600 and 2843 of 7200 after one of 300 ms, 621 and 718 of
7200 with nothing late.

**What was done (run.js; the top of run.js has the rules).**
- A sample that was taken out as stamped late is still a reading of the car, sent one slot before the
  sample that replaced it. The one that replaces it is now judged against that reading too, over one
  send slot. More than 25 m/s2 above it: held back like any step. If the next sample confirms it, the
  run ends as a "jump" with no 0-100. A lone one is dropped and the run goes on.
- The rule that excused a confirmed step after a lump (part 8) now only holds while the launch is not
  placed yet, while the send slot is not known, or where the samples of the run were seen to arrive
  out of order.
- Out of order: a sample that comes right behind another (less than three quarters of a slot) and
  reads lower by more than 12.5 m/s2 over a slot, or a stamp that does not run forward. The engine
  then says so in the run summary and in the run's log line (it read SAMPLES OUT OF ORDER; part 10
  changed the words), and for the rest of that run a reading that was taken out says nothing about
  the next one. The final checker's probe of samples that waited hands them over that way, and no run
  of it may end as a "jump".
- The polled series keeps the wide time base (half of both round trips) for the question that ends a
  run. The same step is looked at once more over the stamps alone, together with what the car was
  gaining before: more than 25 m/s2 there and more than twice the car's own gain over the same time,
  plus 1 km/h, is held back as a step. A read that took far longer than usual keeps both round trips
  in that second look too. (This second look was taken out again: part 10. It ended clean runs of
  quick cars.)

**Now, on the result.**
- The checker's trace: two high samples after the late stamp, or after the hold-up, end the run as a
  "jump" with no 0-100. One high sample after the late stamp is dropped and the run reaches the 1/4
  mile with its 0-100 1 ms off.
- The wider probe, launches with a 0-100 beyond its ± (d0975b2, b77cd97, now): after a notification
  stamped late 7, 1378, 630 of 6000; after a hold-up of 150 ms 561, 2162, 811 of 7200; after 300 ms
  600, 2843, 856 of 7200; nothing late 621, 718, 621 of 7200. Over the whole probe 1789, 7158 and 2918
  of 55200. Runs with another split beyond its ±: 7, 429, 14. A reading of 250 km/h makes up no 0-100
  in any cell, on any of the three builds.
- With the notifier every 20 or 50 ms and the reading too high from 93 km/h on: none of 9600 launches
  now (it was 2206 on b77cd97).
- The getter alone, nothing late, the reading too high for 220 ms, 180 launches a cell. A getter that
  answers in 25 ms, give or take 10: none with 5, 6, 8, 10, 15 or 20 km/h too high (b77cd97: 69 with 5
  km/h and 99 with 6). One that answers in 60 ms, give or take 20: 16 and 22 with 5 and 6 km/h (180
  with 6 on b77cd97), none above. One that answers in 100 ms, give or take 40: 52, 138, 84, 21, 1 and
  0 (it was 56, 153, 165, 167, 128, 32). (These getter figures no longer hold. They came from the
  second look at a polled step, and part 10 took it out: they are back at those of b77cd97.)
- The final checker's probes of V-01 give the same output as on b77cd97, line for line: no run ends as
  a "jump" for a late stamp. So do the first reviewer's accuracy table and glitch probe.

**What is left.** The rule in these cases is as it was before part 8. The count is not: over the
wider probe it was higher than on d0975b2 (2918 against 1789 of 55200; 3040 since part 10), because
that build ended such runs as a "jump" for the late stamp alone. They are not solved.
- A reading too high by less than 25 m/s2 times the time since the reading before it is no step and is
  taken for real: about 4.5 km/h at 50 ms between samples, 9 km/h at 100 ms, 18 km/h at 200 ms. In the
  wider probe that is every launch still counted on the notifier: 700 of 960 with 6 km/h too high on
  the 100 ms notifier (none with 10 or more), and 539 and 594 of 960 with 6 and 10 km/h on the 200 ms
  one (none with 20 or more).
- The getter after a hold-up. No read is made while the app is held up, so the readings on both sides
  of it really are that far apart, and a wrong one that begins right after it is judged over that
  time. In the wider probe: 143 of 1200 launches after a hold-up of 150 ms (6 and 10 km/h too high)
  and 184 of 1200 after 300 ms (6, 10 and 20 km/h). On d0975b2 it was 86 and 140; that build ended
  more of them as a "jump", as it did with clean runs of quick cars. (145 and 187 since part 10.)
- Two cases this list left out at first (the check after this one found them; figures in part 10): a
  wrong reading whose FIRST sample is itself stamped late, and one that begins WHILE the app is held
  up. Both are judged from the last sample before them, over that longer time, also on a speed that
  is sent. And a wrong reading next to a late stamp sets the out-of-order mark, with every sample in
  order: for the rest of that run the new rule is then off.
- Nobody knows whether a car's speed signal ever reads high for a moment.

### R2-02, the polled series with the app held up at the launch (should fix)

**What was wrong.** Not damage done by a fix, but open since the start and in none of the earlier
parts. A getter read that is in flight when the app is held up comes back when the hold-up is over. It
is stamped at the middle of its long round trip, although the car read the value at its start. If that
sample is the last standing one, the launch is placed up to about 0.1 s late and the 0-100 reads
short. If it is the first moving one, the first metres are counted late and every distance split reads
short. Only half the getter's USUAL round trip was in the ±. Part 8 did this work for the notified
series only.

**Reproduced on b77cd97.** The checker's probe on the first reviewer's model (three cars, 200 launches
a row, one hold-up beginning 100 ms before to 300 ms after the car starts to move): runs with a split
beyond its ±, getter alone: 0 of 600 with a hold-up of 100 ms, 26 with 150 ms, 123 with 200 ms, 144
with 250 ms, 160 with 300 ms, the worst by 79 ms. With a notifier every 100 ms beside the getter: 0,
26, 105, 109 and 139 of 600.

**What was done (run.js).** A read that took more than 1.5 times that getter's usual round trip plus
10 ms (the usual one: the middle one of its last 16 reads) counts as one whose stamp is in doubt. The
app was held up while the answer was on its way, or the car answered late. Nothing says which, so the
stamp stays at the middle, and half of what the read took longer goes into the ± wherever that sample
counts: into the launch, if it is the last standing sample or one of the moving ones the launch is
placed with (the launch record's `tookLate`, and the log line says so); into a line crossed in the
step before it or after it; into the rollout point of a split timed after the first foot; and, as
distance, into every distance split after it.

**Now, on the result.**
- The checker's probe: 0 of 600 in every row, getter alone and with the notifier.
- The checker's own harness (five cars, 60 launches a cell and car, first run and warm engine,
  hold-ups of 40 to 400 ms beginning 150 ms before to 600 ms after the car moves): runs with a split
  beyond its ±, of 5400: getter alone 5 (it was 354), notifier every 100 ms and getter 5 (282),
  notifier every 20 ms and getter 0 (109). The 5 on the getter alone are hold-ups of 300 and 400 ms,
  the worst 6 ms beyond.
- One hold-up of 20 to 500 ms at nine places of a run (the checker's probe, 18900 launches a row):
  splits beyond their ± on the getter alone 1 (it was 397), with the notifier every 100 ms 0 (377),
  every 20 ms 0 (56). No run more is lost than before, in any cell.
- `test_drag.js`: hold-ups of 150, 200, 250 and 300 ms around the launch, three cars, getter alone and
  with a notifier every 100 ms: all 600 launches reach the 1/4 mile and none has a split beyond its ±
  (59 and 48 of each 300 on b77cd97).

**What it costs.** The time itself is not made better: it can still be off by up to half of what the
read took longer. The ± now says so, and it is wide. In the test's case the 0-100 has ± 0.09 to 0.14 s
on average (0.06 to 0.11 s before). Where the app is held up again and again the ± of a polled run
grows with it: in the checker's probe, with the app held up for 80 ms every 250 ms, the ± of the 0-100
and of the 1/4 mile is 0.11 and 0.09 s on average (0.06 and 0.04 s before). Clean polled runs of the
reviewer's cars, with reads of 25 ms, are not touched: the accuracy table is the same to the digit.
This sentence first said that clean polled runs are not touched at all. That was wrong twice over
(part 10): the second look of R2-01 ended clean runs of quick cars as a "jump", and a getter that now
and then takes long gets the wider ± with no hold-up at all. Both fixes add code to the timing path:
`run.js` had 1216 lines then, comments included (1080 after part 8).

### W2-03, the closed-roads line (should fix)

The Run tab could say NO SPEED FROM THE CAR, without the line "Closed roads and track days only", and
time the next launch all the same. On the stand-in car: a car that notifies, has only stood since the
app started, and has a getter that answers in 700 ms (too slow to be used), or one that answers for 5
s and then never again. After 60 s of NO SPEED FROM THE CAR both launches were timed.

Now the line under that banner reads "Timer armed. Closed roads and track days only" whenever an
engine is armed. Where nothing is armed it says for how long no speed has arrived, or that the app is
waiting for the speed, as before.

What the app still cannot tell apart, and what follows:
- A car that never notifies and whose getter has died, or answers too slowly: the notified engine
  stays armed on the one value the kit read when the app started. The tab says NO SPEED FROM THE CAR
  with the line "Timer armed. Closed roads and track days only", and no launch is timed.
- A car that never notifies and whose getter answers the kit's own first read but none of the app's:
  it reads ARMED, NO NEW SPEED, and no launch is timed (part 8, V-04).

The checker's probe of these states looks for the line by its old words alone. For the two cars of the
first paragraph it still prints that the line was never there, and quotes the new line beside it.

### The words (W2-01, W2-02, W2-04 to W2-08)

- W2-01 (must fix). Four pages of the kit still began with Proven's note that this copy offers only
  Proven Gauges and Proven Warm-Up: `README.zh-CN.md`, `README.ru.md`, `README.ko.md` and
  `docs/diagnostic-chinese.md`. The note now names three apps and says that Proven Drag is BETA and
  has not been on a car. The kit's own text below it was not touched.
- W2-02 (must fix). This record said in four places that the two READMEs had not been written, and in
  one that `README.md` still said two apps. Corrected in the opening, in part 6, in part 7 and in part
  8.
- W2-04. The README's "What is saved and what is logged" left out that each run and each best time is
  kept with its date and time, and so is the GPS speed factor, and that every log line carries the
  time it was written. It says so now. (The four wheel factors carry no date.)
- W2-05. The README gave the first reviewer's timing figures for the five plain cars only. It now also
  gives that reviewer's three cars that change gear right at 100 km/h: the 0-100 read long by 36 to 54
  ms on average and by up to 170 ms with the speed sent, and by up to 191 ms with the speed asked for,
  where 3.6 % of the runs were beyond their ±.
- W2-06. Part 5, 11a named another author's project. The name is gone. The sentence now says what the
  note of 23 Nov 2026 says, and that it could not be read again.
- W2-07. One made-up value in `test_drag_car.js` carried five member names in the form of one car's
  signal list. The app reads one of them by name, as the kit's own apps do. The other four are now
  made-up names. The check is the same.
- W2-08. Part 8 said "a third person checked". Nothing here shows who or what made that check, so it
  now says "a third, separate check was made".

### What the numbers check noted and what was not changed for it

- A launch is still lost in one corner (R2-03): a notifier every 200 ms on a car that pulls 1.5 g,
  with its first moving sample stamped late. In the checker's trace, with that sample 100 ms late on
  the first run after the app starts, 15 of 400 launches of that car ended as a "jump" and none of the
  other four cars'. A long hold-up at the launch loses launches on every notifier: with 400 ms, 1 to
  41 of 300, most on the 200 ms notifier; with 300 ms, 0 to 26 of 300. Not changed.
- DATA GAP comes up more often than before part 8 on a car timed from its notifier alone, on runs
  whose times are right (R2-04). Taking a late sample out leaves a stretch of two slots or more. In
  the checker's probe a hold-up of 200 ms on a 100 ms notifier flagged 1215 of 2100 launches (28 on
  d0975b2). Not changed. One more such case is new with this step: a lone wrong sample right after a
  late stamp leaves a hole of three slots (300 ms on a 100 ms notifier).
- A notifier that doubles its pace: the sentence in part 8 was wrong and is corrected there (R2-05).
- The tests (R2-06). The title of the "final check" part of `test_drag.js` says each check failed on
  d0975b2 unless it says "still". Four that do not say "still" pass there too, and two checks carry an
  allowance that is not used. Not changed.

### What changed in the tests

After this step `test_drag.js` had 403 checks (was 388): two new parts, "second check: a reading
that is too high ..." and "second check: the polled series with the app held up at the launch".
`test_drag_car.js` has 312
(was 304), and draws 507 frames in 52 states (169 pictures). Four existing checks of
`test_drag_car.js` were changed on purpose: three expected "The car has sent no speed for N" in a
state where the timer is armed, and one expected no closed-roads line there. That text is now checked
where nothing is armed. No bound was loosened.

The earlier probes on the result. Numbers: every exit code is as on b77cd97 (the first reviewer's
conventions probe still exits 1 for the old manual scale list). The outputs of the accuracy, glitch,
choice, GPS, wheels and comparison probes and of the final checker's five late-stamp probes are the
same as on b77cd97, line for line. The launch probes differ only by the new field in the launch
record. Car side and words: the exit codes are as on b77cd97 (four exit 1 as before: the manifest
probe for the old manual scale list, two privacy probes that count member names, and the screens probe
for one label's size).

### What was not done

- Nothing ran on a car, a head unit or Node.js 8, and no installable package was built.
- The four notes of the numbers check were not acted on in the code or the tests (above).
- The stand-in car of `test_drag_car.js` still cannot hold the app up: late stamps, hold-ups and wrong
  readings were tested in the logic test and with the probes only.
- Wrong LOW readings and lone zeros next to a late stamp were not looked at again.
- The other author's README (part 5, 11a) was not read again: no network was used.
- The pictures were drawn again. The Run tab with the new line was looked at by eye; the others were
  checked by the test's rules only.

## 10. After the last check

Two separate checks were made of commit ce83a76, the state after part 9: one of the numbers, one of
the car side and the words. Both said "fix first". Five of their points were handed on: two that had
to be fixed (C3-N01, C3-N02) and three that should be (C3-N03, C3-W01, C3-W02). Each was first
reproduced here on ce83a76, with the checkers' own probes. Every figure below is from a PC and made-up
cars. Nothing has run on a car, and no figure here says how exact the app is on one.

What these two checks found is the same thing a third time: a rule that was right for the cases its
own tests model, and wrong right beside them. So nothing was added to the timing engine in this step.
One rule of part 9 was taken out again, one got a floor it lacked, and the rest was written down.

### C3-N01 and C3-W02, the second look at a polled step ended clean runs of quick cars (must fix)

The numbers check rated this must fix. The other check found the same and rated its words should fix.

**What was wrong.** Damage done by part 9 (R2-01), on clean data. The second look at a step on the
polled series held a sample back when it was more than 25 m/s2 above the last one over the stamps
alone, and more than twice what the car had gained over its last three steps, plus 1 km/h. Two reads
that fall unevenly in their round trips can be twice as far apart as their stamps say, so a quick car
fails the first test. Right after a gear change, or after a roll, the car had gained next to nothing,
so the torque coming back fails the second too. The next clean sample then confirmed the step and
the run ended as a "jump": SPEED JUMP, no later split. b77cd97 timed every one of those runs.

**Reproduced on ce83a76.**
- The numbers checker's probe: clean data, the getter alone, 2000 launches a row, the same samples
  to both builds. In its 29 rows ce83a76 lost 159 launches that b77cd97 had timed to the 1/4 mile.
  None in the four rows with answers of 25 ms, give or take 10. 4, 1 and 3 with 30 ms, give or take
  10. Up to 35 with 40 ms, give or take 15 (a car that launches at 1.5 g and pulls 1.6 times as hard
  for 100 ms after each gear change). Up to 21 with 60 ms and up to 6 with 100 ms.
- The other checker's probe: a gear change of 150 ms at 60 km/h, then full torque at once, 1000
  launches a cell. With answers of 60 ms, give or take 20: no launch ended as a "jump" up to 1.3 g, 6
  at 1.4 g, 37 at 1.5 g, 55 at 1.6 g, 115 at 1.7 g. With 25 ms, give or take 10: 2 at 1.7 g, none
  below. Brake released, a tenth of the torque for 400 ms, then all of it: 2 to 65 of 1000 from 1.4 g
  up, with answers of 60 and 100 ms.
- Where the car also notifies its speed, no launch was lost in the checkers' probes: the run was taken
  from the notifier. A wider grid written for this step found one that was, in 32000.

**What was done.** The second look is taken out, and nothing is put in its place. A step on the
polled series is judged as on b77cd97 again: over the stamps plus half of both round trips. The two
checkers did not agree on this point. One said take the rule out or narrow it. The other said leave
`run.js` alone and write the corner down. It was taken out because that undoes a change and adds
none, and because the rule that is left is the one two earlier checks went over. A narrower form (the
largest gain of the whole run in place of the last three steps) was not tried: a car that rolls first
and gets all its torque later would fail that too.

**Now, on the result.**
- The numbers checker's 29 rows: no launch lost that b77cd97 had timed.
- The other checker's probes: no launch ended as a "jump" in any cell, and their output is the same
  as on b77cd97, byte for byte.
- A wider grid written for this step: clean launches of the numbers checker's eight cars, the getter
  alone, answers of 25, 30, 40, 60, 100 and 150 ms, with and without one read in twenty that takes 3
  to 6 times as long, 500 launches a cell and car, 48000 in all. ce83a76 lost 59 launches that
  b77cd97 had timed. The build now loses none of them.

**What it gives back.** What the second look was for is open again, as it was before part 9. On the
polled series a reading that is too high passes for real where the step fits into the time the two
readings can be apart: up to about 6.7 km/h with reads of 25 ms, more with slower ones.
- The second checker's getter probe (nothing late, the reading too high for 220 ms from 93 km/h on,
  180 launches a cell), launches with a 0-100 beyond its ±. Answers of 25 ms, give or take 10: 69
  with 5 km/h too high, 99 with 6, none with 8 or more. 60 ms, give or take 20: 73, 180, 170 and 102
  with 5, 6, 8 and 10 km/h, none with 15 or more. 100 ms, give or take 40: 56, 153, 165, 165, 128 and
  32 with 5, 6, 8, 10, 15 and 20 km/h. Those are the figures of b77cd97 but for one cell (165 where
  it had 167). Part 9 had brought them to none; to 16 and 22; and to 52, 138, 84, 21, 1 and 0.
- That checker's wider probe: launches with a made-up 0-100 go from 2918 to 3040 of 55200 (b77cd97:
  7158). 15 of its 920 cells are worse than on ce83a76, by 122 launches. All 15 have the getter in
  them: 9 with the getter alone, 6 with a notifier beside it. No cell is worse than on b77cd97. By
  case, with the reading too high from 93 km/h on: after a notification stamped late 646 of 6000
  (ce83a76: 630), after a hold-up of 150 ms 814 of 7200 (811), after one of 300 ms 862 of 7200 (856),
  nothing late 718 of 7200 (621). The getter alone: 423 of 7200 (ce83a76: 327, b77cd97: 437). With
  the notifier alone every 20 or 50 ms it is still none of 9600.
- The numbers checker's probe of wrong readings in other places (24000 launches): 3688 with a made-up
  0-100, where ce83a76 had 3618, b77cd97 6496 and d0975b2 3706. 9 of its 400 cells are worse than on
  ce83a76, by 71 launches, all with the getter in them, and none is worse than on b77cd97.
- `test_drag.js` had a check for this: a getter that answers in 25 ms reads 6 km/h too high for 220
  ms, 120 launches, none with a made-up 0-100. It is 50 of 120 again, as on b77cd97. The check now
  says NOT SOLVED and pins that figure.

Whether a car's speed ever reads high for a moment is not known. The runs this rule ended were clean
ones. In the numbers checker's rows it began as soon as the reads took 30 ms where 25 are assumed, and
on the very quickest cars of the other checker's probe it ended runs with 25 ms too (above). That is
why it was taken out.

### C3-N02, a clean launch thrown away where the speed is only sent, with late stamps (must fix)

**What was wrong.** Damage done by part 9 (R2-01), on clean data. A sample that replaced a
late-stamped one is judged against that one's reading over the send slot "as far as it is known".
Early in a run that is the middle one of the few spacings so far. With stamps up to 15 ms late it
came out at 11 to 13 ms on a series that sends every 20 ms. One slot's real gain of a quick car then
read as more than 25 m/s2. The sample was held back as a step that no late stamp excuses, the next
clean sample confirmed it, and the run ended. Most of those launches had not passed 5 km/h, so
nothing was shown at all. The rest showed SPEED JUMP. The plain step test never judges over less than
20 ms. This one had no such floor.

**Reproduced on ce83a76.** The numbers checker's probe: clean data in order, the notifier alone, 2000
launches a row. In its 19 rows ce83a76 lost 126 launches that b77cd97 had timed to the 1/4 mile.
Every 20 ms with each stamp up to 15 ms late: 0 to 7 with the signal in steps of 1/64 km/h, 17 with
steps of 0.25 km/h, 0 to 49 with steps of 0.5 km/h. Every 20 ms with each stamp up to 10 ms late: 1,
0 and 4. Every 10 ms with each stamp up to 8 ms late: 13 and 4. None with stamps up to 5 ms late, and
none every 50 ms.

**What was done.** One line in `run.js`: that test never judges over less than 20 ms now.

**Now, on the result.**
- The same 19 rows: no launch lost that b77cd97 had timed.
- The one cell of the second checker's probes that part 9 had made worse is back where it was: every
  notification up to 1.5 slots late, every 20 ms, 18 of 200 launches lost (19 on ce83a76).
- A wider grid written for this step: the notifier alone every 10, 20, 50, 100 or 200 ms, each stamp
  late by up to a quarter, a half, three quarters or the whole of that time, the signal in steps of
  1/64, 0.25 and 0.5 km/h, the same eight cars, 500 launches a cell and car, 240000 in all. ce83a76
  lost 4064 launches that b77cd97 had timed, most of them every 10 ms with steps of 0.5 km/h. The
  build now loses 2 of them.

**What is left.**
- The floor does not help where a longer slot is taken for much shorter than it is. The 2 above are
  that: every 50 ms, stamps up to a whole slot late, steps of 0.5 km/h. With 4000 launches of each of
  the two cars it happened to, it was 1 and 3. Those 4 are only the launches that b77cd97 had still
  timed. In all, the build now loses 9 and 116 of those 8000 launches, and b77cd97 lost 8 and 113:
  they were already thrown away before part 9. Not changed.
- The whole of that limit, from the same grid of 240000 clean launches, counted by the re-check that
  followed this part (below). The build now loses 1979 of them (b77cd97: 1977). By how late every
  stamp can be: none of 60000 with up to a quarter of the slot; 55 with up to a half, 53 of them on
  the 200 ms notifier; 370 with up to three quarters (none for the cars that launch at 0.7 and 1.2 g,
  11 and 30 of 7500 for the two at 1.5 g, 156 and 173 for the two at 1.7 g); 1554 with up to the whole
  slot (3 and 8 at 1.2 g, 193 and 196 at 1.5 g, 554 and 600 at 1.7 g). A quick car's real gain reads
  as a step that no car does, and the launch gives no run or ends as a "jump" in the first second. Not
  changed, and in the README's list now.
- The grid above had no notifier that sends every 30 or 40 ms. The re-check ran those (4000 clean
  launches a row, four quick cars). Launches lost by the build now that b77cd97 had timed, with the
  signal in steps of 1/64 km/h: every 30 ms with stamps up to 22.5 ms late, 2 and 7 for the two cars
  at 1.7 g and none at 1.5 g; with stamps up to 30 ms late, 14 and 25 at 1.7 g. With steps of 0.5
  km/h: 8 to 15 and 28 to 38 on all four cars. Every 40 ms: none with stamps up to 30 ms late, 1 with
  up to 40 ms (0 to 10 with steps of 0.5 km/h). None with stamps up to half the slot late, and none
  every 100 ms. In each of these rows b77cd97 itself lost 3 to 10 times as many launches. Not changed.
- A signal in coarse steps. With steps of 1 km/h, sent every 20 ms with stamps up to 15 ms late, 358
  of 800 clean launches are not timed to the 1/4 mile, as on ce83a76 (b77cd97: 327, d0975b2: 385). A
  change of 2 km/h from one sample to the next is more than 25 m/s2 over 20 ms. That is the brief's
  rule itself. The app reads the speed in steps of 1/64 km/h; in what steps a car really changes it
  is not known. Not changed, and now on the first-car list and in the README.

### C3-N03, texts that read wider than what was tested (should fix)

Words, and one log line. None of it is new damage: in these cases the build is no worse than b77cd97.
- The README said of a reading that is too high: "A lone wrong sample is dropped, or it ends the
  run. Two in a row end the run". That holds for the 360 launches of that test. It does not hold
  where the first wrong sample is itself stamped late, or where the wrong reading begins while the
  app is held up. It is then judged from the last sample before it, over that longer time. The README
  says so now, with the figures of a new check that says NOT SOLVED: a reading 6 or 10 km/h too
  high for 220 ms from 93 km/h on, the speed sent every 20, 50 and 100 ms, 60 launches each. Its
  first sample stamped 0.6 slot late: 40 and 20 launches with a 0-100 beyond its ±. It begins while
  the app is held up for 150 ms: 45 and 36.
- The numbers checker's probe of the same two cases on the build as it is now, of 120 launches a
  cell, the notifier alone. First wrong sample stamped 0.6 slot late: 97 every 50 ms with 6 km/h
  too high (none with 10); 70 and 75 every 100 ms with 6 and 10 km/h. Beginning in a hold-up of 150
  ms: 78 and 74 every 20 ms with 6 and 10 km/h, 43 and 47 every 50 ms, 79 and 21 every 100 ms.
  Beginning in a hold-up of 300 ms: 48, 56 and 61 every 20 ms with 6, 10 and 20 km/h. None anywhere
  with 40 km/h too high or with 250 km/h. In these cells the build is as ce83a76 was.
- Part 9 said of what is left: "These are as they were before part 8." The rule is. The count is
  not. Corrected there, and the two cases above are listed there now.
- The mark "samples out of order". A wrong reading next to a late stamp sets it with every sample in
  order, and for the rest of that run the rule of R2-01 is off. In the numbers checker's probes the
  mark came up in 2033 of 24000 launches with a reading too high and in 18009 of 72000 with one too
  low, and in none of 20800 clean launches and none of 5760 with hold-ups, lumps and late stamps but
  right readings. The log line said SAMPLES OUT OF ORDER. It now says what was seen: "A SAMPLE READ
  FAR LOWER THAN THE ONE RIGHT BEFORE IT, OR ITS STAMP DID NOT RUN FORWARD (out of order, or a wrong
  reading)". Only the words changed (`feed.js`). The engine cannot tell the two apart.

### C3-W01, three things that part 9 lists as left and the README did not (should fix)

The README's list "Known from the PC and not solved" now has them, each with figures run again on
the build as it is now:
- A launch can be lost. The second checker's probe (five cars, 300 launches a cell, the app held up
  or one notification stamped late around the launch): with 250 or 300 ms, 0 to 4 of 300 lost with
  the speed sent every 100 ms and 0 to 26 with 200 ms; with 400 ms, 5 to 26 and 9 to 41; every 20 or
  50 ms none up to 300 ms and 1 to 19 with 400 ms. On the 200 ms notifier 60 to 200 ms lost 0 to 4.
  One sample stamped 100 ms late on the 200 ms notifier, the first run after the app starts: 15 of
  400 launches of the car that pulls 1.5 g ended as a "jump", none of the other four cars'.
- DATA GAP on runs whose times are right. A hold-up of 200 ms on a 100 ms notifier: 1215 of 2100
  launches carry a hole of 300 ms or more, and no split of them is beyond its ±. The README's text of
  the flag says so too.
- Whether the speed signal ever reads too high for a moment is in the README's list of what is not
  known. So is whether it ever reads too low, and in what steps it moves.
The sentence on hold-ups in "What has and has not been tested" (all 4,800 runs reached the 1/4 mile)
is true of the test's two cars. It now ends by pointing to that list.

### What else the two checks noted

Notes, not acted on in the engine. Each is in the texts now.
- What the fix of R2-02 costs on clean runs (C3-N04). A getter that takes long now and then, with no
  hold-up at all, gets the wider ± too. The numbers checker's clean probe (eight cars, 100 launches
  each, 800 a cell), answers of 25 ms, give or take 10, one read in twenty taking 3 to 6 times as
  long: in 204 launches the launch was placed with such a read, and the ± of the 0-100, the 60 ft and
  the 1/4 mile is 0.079, 0.062 and 0.062 s on average, against 0.060, 0.038 and 0.038 s on b77cd97.
  It covered every error there: no run had a split beyond its ±, where b77cd97 had 6 (the worst by
  31 ms). With answers of 100 ms, give or take 40, and no long reads at all, 16 of 800 launches
  counted a read as far longer than usual. Part 9's sentence "Clean polled runs are not touched" is
  corrected.
- Readings that are too LOW for a moment (C3-N05), which no earlier step had looked at next to a late
  stamp. No run shows a time made up short from one, and a lone 0 is dropped and the run is timed.
  But a lone low sample right after a late stamp is taken for real and ends the run as a lift: 31 of
  60 launches, one sample 20 km/h too low at 60 km/h, every 100 ms (none on d0975b2, which timed 51
  of them to the 1/4 mile and ended 9 as a "jump"). And one just past 100 km/h can put the 0-100
  beyond its ±: 37 of 900 launches on the 200 ms notifier after a late stamp, by up to 0.59 s. Both
  are since part 8 and are as on ce83a76. One thing the taking out of the second look undid: a dip
  of 5 km/h for 60 to 220 ms on the getter alone, nothing late, ends 12 of 180 launches as a "jump"
  (157 on ce83a76, 12 on b77cd97). In the README's list.
- Three small differences against b77cd97 that part 9's list of probes did not name (C3-N06). The
  hygiene probe's random streams finish 710 runs where they finished 711. The earlier checker's
  getter probe has a mean ± of 98 ms where it had 97 (60 ft, answers of 100 ms), and of 335, 224 and
  224 ms where it had 330, 220 and 219 (answers of 200 ms), with every error the same. And the one
  cell of C3-N02 above. The first two are as on ce83a76.
- The tests (C3-N07). The new checks are below. Not tested in `test_drag.js`: a reading 20 km/h too
  high, the 200 ms notifier in these cases, and readings that are too low (one check has a low
  sample, for the log line).
- Coarse signal steps (C3-N08): above, under C3-N02.
- "Is the engine better left alone now" (C3-N09). Yes. What decides these rules is how late a head
  unit stamps a sample, how long its reads take, how long it holds the app up, and whether the speed
  ever reads wrong. None of that can be settled on a PC. `run.js` should not be changed again before
  a first car has been logged. It has 1214 lines now, comments included.

### What changed in the tests

`test_drag.js` has 408 checks (was 403). `dragsim.js` got one option: a gear change may be followed
by a moment in which the car pulls harder than it otherwise would. No car of the earlier checks uses
it, and their output is the same byte for byte.
- New part "third check". Two quick cars whose torque comes back hard after a gear change, timed
  from the getter alone with answers of 40 or 60 ms: all 600 clean launches reach the 1/4 mile, none
  ends as a "jump", no split is beyond its ±. Two quick cars timed from the notifier alone, every 20
  ms with stamps up to 15 ms late and every 10 ms with stamps up to 8 ms late, steps of 1/64 and of
  0.5 km/h: all 1800 clean launches reach the 1/4 mile. On the build of ce83a76 8 of the 600 end as
  a "jump" and 14 of the 1800 are lost.
- Two checks say NOT SOLVED. They pass while the engine does what the texts say, and they pin the
  figures the README quotes, so that the text is looked at again if a figure moves: the 6 km/h on
  the getter (changed from a check that passed on ce83a76), and the two cases of C3-N03.
- One new check and two changed ones look for the new words of the log line.
On the build of ce83a76 the file fails 5 checks. `test_drag_car.js` was not changed (312 checks).

The earlier probes on the result, each compared with its output on ce83a76 and on b77cd97.
- The first reviewer's 14 probes, the final checker's 9 and the two written for part 8: the same
  output as on ce83a76, file for file, but for folder names in two of them. Exit codes as before: all
  0 but the conventions probe (the old manual scale list) and one privacy probe (it counts member
  names).
- The second checker's probes. Against ce83a76: the same output in every probe but three. The
  hold-up probe with many hold-ups has the one cell of C3-N02 back at 18. The two probes of readings
  that are too high have the getter cells named above worse, and no other cell. Against b77cd97: no
  count is worse in any cell of any of them; the mean ± of a polled run is wider, which is part 9's
  R2-02.
- The numbers checker's own probes, with the same samples fed to d0975b2, b77cd97, ce83a76 and the
  build now. Clean runs (26 cells of 800 launches): 385 launches lost, where ce83a76 lost 407 and
  b77cd97 354. The 31 more than on b77cd97 are all in the cell with steps of 1 km/h every 20 ms.
  Runs ended as a "jump" on the getter alone: none (ce83a76: 7 in four cells). With both series
  through the built `TwoSeries` (five rows of 1500 clean launches): none lost, on any of the builds.
  The getter's own engine ends none of them as a "jump" now (ce83a76: 26, 8 and 6 in three rows),
  and the notifier's loses none (ce83a76: 4 and 3 in two rows).

### What was not done

- Nothing ran on a car, a head unit or Node.js 8, and no installable package was built.
- The timing engine got no new rule. What the second look at a polled step was for (R2-01 on the
  getter) is open again, by choice, and written down. The two cases of C3-N03, the launches that can
  be lost, DATA GAP on good runs, readings that are too low and coarse signal steps were written
  down and not changed: each rests on what a head unit or a car does, and nobody has measured that.
- The slot that is taken for too short (what is left of C3-N02) was not changed.
- The stand-in car of `test_drag_car.js` still cannot hold the app up or stamp late. All of this was
  tested in the logic test and with the probes only.
- No screen changed, so no picture was drawn again.

### The re-check of this step

One more separate check was made of the six commits of this step (the build bba74b9), with every
earlier probe run again on it and on ce83a76. It changed no code and advised that none be changed: it
found no new fault from taking the one rule out and giving the other its floor, and it agreed that
`run.js` is better left alone until a first car has been logged.

It found one thing that should be fixed, in words. The README said of what is left of C3-N02 that a
clean launch was thrown away "in 4 of 8,000 launches". Those 4 were only the launches that b77cd97 had
still timed; the build loses 125 of those 8000. The README now states the whole limit (late stamps on
every sample lose clean launches of quick cars), with the figures listed under C3-N02 above.

Smaller points it noted, each put right in the words: the rule that was taken out had ended clean runs
with answers of 25 ms too, on the very quickest cars; the README's "A launch can be lost" left out
that a hold-up of 0.4 s also loses launches where the speed is sent every 20 or 50 ms (up to 19 of
300); and no text gave a figure for a getter whose answers now and then take very long. That one is in
the README now: with one answer in twenty taking 3 to 6 times as long, launches with no run of 4200,
on the build now and on b77cd97 alike: none where an answer usually takes up to 40 ms, 1 at 50 ms, 5
and 10 at 60 ms, 47 and 55 at 80 ms, 141 and 156 at 100 ms, 319 and 320 at 150 ms, and none without
the long answers.

Not done after it: the long sentences it counted in the README were not all split, and nothing else
was changed. All figures: a PC, made-up cars. Nothing has run on a car.
