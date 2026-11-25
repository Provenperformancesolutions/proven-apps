# Proven Drift 1.0.0: what was built, what is assumed, what to check on a car

BETA. Nothing here has run on a car or on a head unit. Everything below was checked on a PC only (a Mac,
Node.js 24), against made-up cars. The head unit runs Node.js 8: the engine's files were parsed as ES2017 and
scanned for newer library calls, they were not run on Node 8. No figure in this record says how exact the
app is on a car. The angle is an estimate everywhere.

This is the working record of the build, written stage by stage. Part 1 is the ENGINE: the pure logic that
takes stamped samples in and gives the drift angle, its ±, the drift state, the running score and finished
drifts out. Part 2 is THE APP around it: what it asks of the car, the session, the saved file, the screens,
the settings, demo mode and the manifest. Part 1 was written before part 2 existed, so where it says "no
car side yet" or "later stages", part 2 is that later stage. Part 3 is what two independent reviews of
parts 1 and 2 found, and what was changed for it. Where part 3 changed what the engine or the app does, the
sentences of parts 1 and 2 that said otherwise were changed with it and say what the files do now, with
"(part 3)" beside them; the tables of part 1 were printed again. What it was like before is in part 3.
Part 4 is what an independent re-check of part 3 found, and what was changed for it. The same holds
there: sentences of parts 1 to 3 that it made untrue say what the files do now, with "(part 4)" beside
them, and the tables of part 1 were printed once more.
Part 5 is what a second check of part 4 found, by two checkers, and what was changed for it: little, and
most of it words. Where it changed what a file does, or found a sentence of parts 1 to 4 untrue, that
sentence says what holds now, with "(part 5)" beside it. No cell of part 1's tables moved in part 5.
Part 6 is what a third check found, of part 5: two rules of the engine were given one condition
more for it, and the rest is words.
Sentences of parts 1 to 5 that it found untrue say what holds now, with "(part 6)" beside them. No
cell of part 1's tables moved in part 6.
Part 7 is what a fourth check found, of part 6: the rule for a stuck steering was given one condition
more, the tests four scenes, and the rest is words. Sentences of part 6 that it found untrue say what
holds now, with "(part 7)" beside them. No cell of part 1's tables moved in part 7.
Part 8 is what a fifth check found, of part 7: two limits that parts 6 and 7 had not said, one sentence
that said too little and one check that was too loose. No line of code in the app was changed for it:
comments, scenes in the test, and words. Sentences of parts 1 to 7 that it found untrue or too narrow
say what holds now, with "(part 8)" beside them. No cell of part 1's tables moved in part 8.
Where this record says "assumed" or "a guess", read that literally: nobody at Proven has measured it.

## How it was tested

From the top of the repository:

```
python3 kit/tools/build.py --preview-only pps_drift
node proven/tools/test_drift.js dist/pps_drift        # 303 checks, ALL OK: the engine alone
node proven/tools/test_drift.js                       # the same on apps/pps_drift, without a build
node proven/tools/test_drift_car.js dist/pps_drift    # 418 checks, ALL OK: the built app on a stand-in car (part 2)
```

`test_drift.js` prints the error tables of part 1 and then checks them. It takes about 30 seconds,
`test_drift_car.js` about 30. The ES2017 check (`recover/es2017.js`, outside the repository) says
"ES2017 ok" for all 17 files of the app.

The three existing apps were built and their eleven test runs made in the same copy, after part 1, again
after part 2, after part 3, after part 4, after part 5, after part 6, after part 7 and again after part 8, each time on a clean export of the last commit: 133, 121, 55, 128, 50 and 44 (Proven Gauges), 350
and 94 (Proven Warm-Up), 408, 312 and 14 (Proven Drag), all OK. Nothing in `kit/`, `apps/pps_gauges`,
`apps/pps_warmup`, `apps/pps_drag` or their tests was changed.

To see that `test_drift.js` can fail, the engine was broken in eighteen ways in a scratch copy (the forward
acceleration with the wrong sign, no pull to zero at rest, a sign wrong in the steering check, the
acceleration check off, the steering check used in understeer, the line fit taking the first slope, learning
from a slide, no spin at 100 degrees, drifts counted on the default scale, a spin keeping all its points,
lone wrong values taken, a drift ending after 0.1 s, the nose not having to point into the turn, a clock read
in the angle, no flag for a gap, the yaw zero never trimmed, no multiplier, a sawing angle earning the same).
Sixteen of them made between 1 and 49 checks fail. Two were not noticed at first: learning from a slide once
the car is learned (the other conditions of a moment already kept every slide of the test out) and the yaw
zero from a standing car (the zero trimmed on a straight did the same job in every scene). A check was added
for each: a learned car without wheel speeds drifting steadily on a wet pan, and a car whose yaw zero has
moved since it was learned and that pulls away from standing straight into a drift. Each of the two now makes
one check fail. That script is not in the repository. Part 2 says the same for the app: 28 breaks. Part 3
says it for what it changed: 19 breaks. Part 4: 29 breaks. Part 5: 16 breaks. Part 6: 7 breaks. Part 7: 8
breaks. Part 8: 3 breaks of one figure.

## 1. The engine

### What was built

| File | What it does |
|---|---|
| `apps/pps_drift/angle.js` | the drift angle and its ±, from speed, yaw rate and the two accelerations; rest; the steering check; the acceleration check; lost sources and gaps |
| `apps/pps_drift/learn.js` | what is learned from ordinary driving: the yaw rate's scale, sign and zero; the steering's; the pedal's range; the wheels' usual ratio and which way is left; the forward acceleration's sign |
| `apps/pps_drift/drift.js` | when a drift starts, switches, ends or spins; the data and the flags of each drift; `DriftEngine`, which ties the parts together |
| `apps/pps_drift/score.js` | the score of one drift, every number in one table (`RULES`), and the grades |
| `apps/pps_drift/series.js` | one source's samples: what it read at any moment, lone wrong values, holes, send slot (shared by the others) |
| `proven/tools/driftsim.js` | the made-up car: a true motion first, then what each sensor would say of it, then faults on top |
| `proven/tools/test_drift.js` | the logic test: the error tables, and 303 checks |

All five files of the engine are pure: none reads a clock, starts a timer, draws a random number, or loads
anything but each other (the test checks that). No position, course or heading ever reaches them.

The made-up car shares nothing with the engine but the kinematics the brief states (`u = V cos(beta)`,
`v = V sin(beta)`, `ax = du/dt - r v`, `ay = dv/dt + r u`) and the raw units the car's signals come in. It
loads no file of the app. Its front tyre is
a "magic formula" curve turned round; the app's is a straight line with a cap. Its three cars send the yaw
rate, the steering, the pedal and the wheels in three different raw scales, one with the signs turned round,
and the engine is told none of them.

### How the angle is worked out, in short

The drift angle is the angle between where the car points and where it travels. The engine sums up
`d(beta)/dt = (ay cos(beta) - ax sin(beta)) / V - r` in steps of 20 ms at most, each source read on the
straight line between its two samples around that moment, so the angle is worked out a moment behind "now"
(40 ms at 50 samples a second, 85 at 20, 160 at 10, 300 at 5). Four things from the brief keep the sum
honest, and three that are not in the brief (next section):

1. The pair (sideways acceleration, yaw rate) is matched on this car: the yaw rate's scale, sign and zero are
   learned from steady ordinary corners as one number K, so that the angle stays at rest while nothing slides.
2. Rest: straight and settled for 0.7 s pulls the angle to zero. "Straight" is: the yaw rate under 2 degrees
   a second, next to no sideways acceleration, the steering near its centre. Under 1 degree a second the
   two zeros are trimmed as well (part 3: at first rest ended at 1 degree a second altogether). A standing
   car trims the yaw zero. Under 10 km/h the angle is not defined.
3. The steering check: where the front wheels point, less a small tyre slip, is where the car's front axle
   travels. While the car oversteers the sum is pulled toward that, with a time constant of 3 s.
4. A ± that grows with what may have been summed up wrongly since the last rest, with the data rate, the
   quality of K, and with how far the check in use and the sum are apart.

Signs: x forward, y to the left. In a drift through a left-hander the angle is negative inside the engine;
the screen is given its size and L or R.

### Where it departs from the brief, and why

Every one of these came out of the error tables. The figures are from the made-up cars.

**The steering check also pulls while the car goes where it is steered (angle.js).** The brief uses the
steering only while the car oversteers. With that alone a corner banked by 12 degrees read 46.7 degrees of
"drift" at the end of 8 seconds, with the tyres gripping all the way: a banked road reads as sideways
acceleration that turns nothing, and the sum had nothing to stop it. Between oversteer and understeer (the
car turns within 1.5 degrees more and 3 degrees less than its steering asks, at the wheels) the same
`beta_steer` is now pulled to with a time constant of 1 s. There the car does not slide and `beta_steer` is
the small angle of a car that grips. The 12 degree bank now reads 3.8 degrees. In understeer the steering is
still not used, as the brief says.

**The steering check is not believed when it is 15 degrees from the sum (angle.js).** In a spin the front
wheels are at their lock (or the driver has let go) and `beta_steer` stays near 30 degrees while the car
goes round. Pulled toward it, the sum was up to 60 degrees off before the car had stopped, and the spin was
counted as four drifts. Past 15 degrees apart the check no longer pulls and the whole difference goes into
the ±. Inside 15 degrees it still pulls with the wheels at their lock, and pulls the angle down: see "Where
the estimate is poor".

**An acceleration check, where the steering check is not pulling (angle.js, point 3b).** Along its path
the car gains speed at `ax cos(beta) + ay sin(beta)`: a car that is sideways feels part of its turn in its
forward acceleration. With the speed's own change that gives an angle without any summing up,
`beta_acc = asin(Vdot / A) - atan2(ax, ay)`. It is used with 3 m/s2 or more of sideways acceleration, as a
pull with a time constant of 2 s (part 3: it is worked out from 1.5 m/s2 on, for the start of a drift and
for a flag; it pulls from 3 as before), wherever the steering check is not pulling: on a car without steering, in
understeer, and when the steering check is not believed. Why it was needed: without steering nothing held
the sum, and something drove it away. The likely cause, worked out on paper and not measured apart: the yaw
rate is matched to the sideways acceleration (K holds the body roll), the forward acceleration is not, and
in a held drift that mismatch grows with the angle it causes. On the long
circle with dirty data and no steering the angle ran to 79.7 degrees where the truth was 37, and the drift
scored 3491 points, grade S, with no flag. With the check it reads 35.6 and scores 1955. On the one banked
corner that was tried then (12 degrees of bank, 0.6 g at 100 km/h, where the car still feels 3.7 m/s2
sideways) it held the angle at 9.5 degrees without steering, where it was 46.7: a bank tilts the sideways
acceleration only. In a gentler banked corner the car feels less than 3 m/s2, the check does not pull, and
the sum runs as before (part 3). Taken on its own, with dirty data, that
angle was typically 1.8 to 2.5 degrees off in the held drifts, the circle and the switches, and within 3.2
at nine moments in ten. In the handbrake entry it was within 5.8 at nine in ten and 22.8 off for a moment
(a scratch probe, not in the repository). That is why it only pulls slowly.
It rests on two things nobody has checked: that the car's forward acceleration is a sensor's reading and
not worked out from the speed, and that the speed is the car's true speed while it is sideways. The first
of the two matters for more than this check: the sum itself uses the forward acceleration (part 3).
What the forward acceleration reads more than the speed's own change on a straight (a road that climbs, a
zero that is off) is measured at rest and taken out, for this check, for the sum and for learn.js (part
4: at first a climb of 3 degrees was enough to make a banked corner look like a slide to this check).

**Without steering, no drift starts that the acceleration check speaks against, and none is a best
(drift.js).** Where the steering is known a drift starts only while the car turns more than it is steered.
Where it is not, the acceleration check has a say: of the time since the angle reached the start angle in
which it could speak (1.5 m/s2 of sideways acceleration or more), it must have seen the angle (the same
side, 0.4 of it or more) for half. The drift waits for that, a second at most, and still counts from
where it began. Where the check cannot speak at all the drift starts on the sum. (That was so at first,
and it was the hole a banked corner went through. Part 3 closed it by starting nothing there, which cost
every real drift on low grip. Part 4 opened it again and closed the hole another way: a drift that the
steering did not back for half of its time carries the flag NO STEERING CHECK and is no best, whatever
the acceleration check says. So on a car that gives no usable steering angle no drift is a best.)

**Nothing is counted on the stated default scale alone (drift.js).** The brief says: until K is learned the
app uses a stated default and flags every drift UNCALIBRATED. The default (0.005 degrees a second per
count, zero at 32768, positive to the left) is right for no car that anybody has checked. On made-up car "b",
whose scale is another and whose sign is turned round, the angle before learning was up to 108 degrees off,
and ordinary driving was counted as two drifts of 59 and 29 degrees (flagged UNCALIBRATED). So while there
is no line at all for the yaw rate ("not learned") nothing is counted. As soon as a first line is drawn
("learning": two steady corners each way, or six one way with a zero from standing or from a straight)
drifts are
counted and flagged UNCALIBRATED, as the brief says, until the line is "learned" (20 moments, 6 each way,
within 8 %). While there is no line the angle is not shown either, and the screen says LEARNING THE CAR.
When the first line is drawn, the angle summed so far is dropped and nothing starts until the car has gone
straight: it was summed on another scale (part 3: at first it was kept and shown, and it started a drift
at that very moment).

**A first line from corners one way (learn.js).** The brief wants left and right both, or the zero cannot be
told from the scale. A standing car does not turn, so its yaw reading IS the zero (and so, nearly, is the
reading on a straight). With that zero, six steady corners one way give a K to work with ("learning",
never "learned").

**Which way is left, and the forward acceleration's sign (learn.js).** Neither is in the brief. Whether
positive sideways acceleration is a left-hand turn is not known (the kit's own g-meter has a setting to
flip it). Where there are wheel speeds the outer front wheel turns faster, and eight corners that agree
settle it. Until then left is assumed. The forward acceleration's sign is checked against the speed in
straight-line pulls and stops. A wrong sign there would make every angle run away (the test with that one
sign turned fails 49 checks).

**The ± is a root of squares, and it is not much wider without steering.** The brief asks for a wider ±
without steering. The acceleration check holds the summed-up part down almost as well as the steering check
(toward 4 degrees against 3), so the ± of a drift without steering was 0.1 to 1 degree wider on the
made-up car (4.5 against 4.1 on the held drift with dirty data, 6.1 against 5.0 on the switches), not more.
That holds where the car feels 3 m/s2 or more sideways. Where it feels less (a pan with grip under about
0.35, large angles in the wet) the acceleration check does not pull, the angle is the bare sum, and its ±
grows by about a degree a second: on grip 0.3 a clean drift of 25 degrees was flagged ANGLE UNSURE once it
lasted longer than about 10 s (part 3). With neither steering nor forward acceleration nothing holds it
down anywhere.

**Flags.** ANGLE UNSURE: the ± averaged over the drift is more than a fifth of the peak angle (7 degrees
are always allowed, more than 10 never; part 3: it was 5 at first). NO STEERING CHECK (part 4, and not in
the brief): the steering did not back the drift for half of its time. It backs a drift where it can be
used (the check is on, there is a steering angle, it has not gone silent, its scale is "learned") and
says that the car oversteers: by 1.5 degrees at the wheels, and by half of what the path asks of them.
(Part 3 had a second way into ANGLE UNSURE, "neither check held the angle for half of the drift". It is
gone: the acceleration check takes no flag away any more.) DATA GAP: a hole of 350 ms or more in a source, the yaw rate or the
sideways acceleration silent for 350 ms while the other moved, the yaw rate at the end of its raw range, or
the app held up for 300 ms, during the drift or in the 3 s before it; or the angle lost (a source gone, or
what was learned changed under the drift). LOW DATA RATE: the
slower of yaw rate and sideways acceleration under 8 samples a second.

**A spin by stopping.** "The car all but stops while still sideways" is: within 1.5 s of the speed falling
under the minimum the car is under 10 km/h and was 25 degrees or more sideways when the angle was last
defined.

**Smaller ones.**
- The front tyres' slip in the steering check is a straight 4 degrees per g with a cap at 5 degrees. The
  brief says "a simple saturating curve". See the next section for what it was at first.
- Rear wheelspin is the rear wheels over the front wheels against their usual ratio, over the cosine of the
  angle (a car that is sideways moves along its own length at that share of its speed). Without that a true
  35 % read 20 %.
- A switch counts as one reversal of the angle for the smoothness, so the 3 s after a switch count 1.1
  times, not 1.2. The switch's bonus and its share of the multiplier far outweigh that.
- The score stops counting when the angle goes under the end angle. What was counted in the 0.6 s the engine
  waits to be sure is taken back, so the running score can step down by a few points when a drift ends
  (1145 to 1142 in the test).
- Session totals, all-time bests and the saved file are not in this stage. `canBeBest(record)` is: no flag.
- `test_drift.js` takes the app's folder as well as a built app, because nothing can be built yet.

### What the first tables changed

The engine's first form followed the brief to the letter. This is what the tables then showed and what was
done, in the order it happened. Three of the changes were themselves wrong at first.

1. The banked corner, the spin and the long circle without steering: the three departures above.
2. The ± was a plain sum of its parts and read 8 to 10 degrees on a clean held drift whose error was 1
   degree, so every clean drift was flagged ANGLE UNSURE. It is a root of squares now, and the flag has its
   present limits.
3. The front tyres' slip was `6 x tanh(ay / 6)` degrees. That rises by almost 10 degrees per g at first,
   far more than a tyre that grips. With the steering check also used in ordinary corners, the angle in a
   long ordinary corner was 2.7 degrees off (0.7 now). It is 4 degrees per g now, a guess at a road car's
   front axle.
   This must be said plainly: the made-up cars' front tyres give 2.8 to 3.6 degrees per g, close to that
   guess, so the tables flatter the steering check. By how much was measured in part 3: about a degree
   low for every degree the front tyres slip more than the guess, 3 to 7 degrees low in a held drift on
   a softer front axle, for as long as the drift lasts.
4. "A source is lost when it has been silent for 2 s while another moves" ended clean drifts. Sent on change
   only, a steady speed says nothing for seconds while the car turns. The rule became evidence for each
   source: the yaw rate while the sideways acceleration moved, and the other way round. The first evidence
   for the speed (the forward acceleration says it must have changed) was wrong as well: in a drift the
   forward acceleration is not the speed's change. The speed now counts as lost only where the app says how
   long a healthy speed can stay silent (`speedMaxAgeMs`).
5. A source taken as lost came back to life as soon as nothing moved any more. It now stays lost until it
   speaks again.
6. A tighter filter against lone wrong values (3 m/s2 from one sample to the next) was tried on the
   accelerations and taken out again. On the bumpy straight at 20 samples a second the angle went from
   about 2 to as much as 4 degrees with it. The likely cause: with the shaking quicker than the samples,
   every other sample looked like a lone wrong value and was dropped, which keeps one side of the shaking.
   The accelerations are back at 8 m/s2. The yaw rate, the speed and the steering have limits that grow
   with the time since the last sample.
7. A hole in the yaw rate as a drift begins was not flagged: the yaw rate rose and fell again inside the
   hole and came back where it was, so no step showed it, and the angle read 26.5 degrees for 30. The
   sideways acceleration moving meanwhile now shows it. (A second cause: a sample that is held back for a
   moment was pushed in after the engine had already asked for new holes.)
8. Learning took "steady" from the lowest and highest reading in a second, which a noisy sensor on a rough
   road would defeat. It now compares the means of the second's two halves. This was changed on reasoning
   alone: with three times the dirty noise both forms reached "learned" in the same drive (86 moments), so
   no table shows a difference.
9. With the default scale wrong, ordinary driving was counted as drifts: the departure above.

### The error tables

Printed by `node proven/tools/test_drift.js`. Degrees. Made-up car "a" unless it says otherwise. Nothing
here was measured on a car.

- worst: the largest error while the angle is defined (in "spin": until the true angle passes 100 degrees).
- typ: the middle error while the car is turning.
- +-ok: the share of the time the error is within the ± shown.
- clean: every source on one even grid, every slot sent, no sensor fault but the raw units.
- dirty: body roll 4.2 degrees per g, gain and zero errors, noise, a speed reading 2 % high; sent on change
  only, each stamp up to 0.3 slots late, speed and wheels no faster than 10 a second, the wheels in lumps,
  the app held up once for 120 ms, and four lone nonsense values.
- after learning: the engine has first driven the scenes "ordinary" and "gentle" (5.5 minutes) with the
  same faults. Before learning: it has learned nothing.
- These tables were printed again after part 3. Against the first print: the row "lowgrip" is new. Before
  learning, "roundabout" reads 2.1 where it read 0.2 to 0.3, "gentle" up to 0.2 more and "banked" about 1
  less in the middle: the angle is dropped when the first line is drawn, in the middle of a corner, and
  starts again from zero. The bumpy straight at 5 samples a second moved by up to 0.3. In the fault table
  "no forward acceleration at all" without steering carries a flag now. No other cell moved.
- And once more after part 4. Clean data: two cells of the long circle with steering moved in their last
  figure, and three rows before learning by 0.1. Dirty data moved in most cells, because the forward
  acceleration's offset is now taken out (the dirty set's zero is -0.09 m/s2): part 4 says by how much
  and which way. In the fault table every drift without steering carries a flag (NO STEERING CHECK), and
  the row with the forward zero reads as the row with nothing wrong.

The scenes:

| Scene | What the made-up car does |
|---|---|
| held | a held drift: 30 degrees through a left-hander for 5 s, power on |
| right | the same through a right-hander, 22 degrees |
| circle | a long circle on a wet pan: 33 to 38 degrees at 45 km/h for 25 s |
| lowgrip | a circle on a low-grip pan: 27 to 33 degrees at 30 km/h for 40 s on grip 0.3, where the car feels 2.5 m/s2 sideways (added in part 3) |
| switches | three drifts joined by two changes of direction, 30 degrees each way |
| handbrake | a handbrake entry at 60 km/h: 40 degrees within 0.7 s, held 2.5 s |
| spin | a drift that goes round: past 100 degrees while the car comes to a stop |
| ordinary | 4 minutes of ordinary driving, corners both ways, two stops, nothing slides |
| gentle | slow, gentle corners both ways (what the steering scale is learned from) |
| lanechange | a quick lane change at 85 km/h, the tyres gripping |
| slalom | a slalom at 60 km/h: 0.6 g each way, six times |
| understeer | plain understeer: the front ploughs through a corner, the rear grips |
| bumpy | a bumpy straight at 70 km/h |
| braking | hard braking in a straight line, 120 to 25 km/h |
| roundabout | a long ordinary corner: 0.5 g at 40 km/h for 14 s |
| banked5, banked | a corner banked by 5 and by 12 degrees: 0.6 g at 100 km/h for 8 s, the tyres gripping |

```
AFTER LEARNING, WITH STEERING, CLEAN
scene         5/s: worst  typ  +-ok  10/s: worst  typ  +-ok  20/s: worst  typ  +-ok  50/s: worst  typ  +-ok
held                  1.2  0.3 100%           0.8  0.3 100%           0.7  0.3 100%           0.7  0.3 100%
right                 0.9  0.2 100%           0.6  0.2 100%           0.5  0.2 100%           0.5  0.2 100%
circle                0.8  0.5 100%           0.6  0.5 100%           0.6  0.5 100%           0.6  0.6 100%
lowgrip               0.6  0.5 100%           0.5  0.5 100%           0.5  0.4 100%           0.5  0.5 100%
switches              1.6  0.5 100%           0.8  0.4 100%           0.6  0.4 100%           0.6  0.4 100%
handbrake             1.8  0.3 100%           1.4  0.8 100%           1.0  0.8 100%           1.0  0.8 100%
spin                  3.8  0.3 100%           3.6  0.4 100%           3.4  0.3 100%           3.5  0.3 100%
ordinary              0.6  0.3 100%           0.6  0.3 100%           0.6  0.3 100%           0.6  0.3 100%
gentle                0.7  0.3 100%           0.5  0.3 100%           0.6  0.2 100%           0.5  0.3 100%
lanechange            0.2  0.1 100%           0.2  0.1 100%           0.2  0.1 100%           0.2  0.1 100%
slalom                0.3  0.1 100%           0.3  0.1 100%           0.3  0.2 100%           0.3  0.1 100%
understeer            0.8  0.3 100%           0.9  0.3 100%           0.9  0.3 100%           0.9  0.3 100%
bumpy                 3.0  0.0  86%           1.5  0.0  99%           2.1  0.0  92%           0.4  0.0 100%
braking               0.6  0.0 100%           0.3  0.0 100%           0.1  0.0 100%           0.1  0.0 100%
roundabout            0.7  0.6 100%           0.6  0.6 100%           0.6  0.6 100%           0.7  0.6 100%
banked5               1.9  1.8 100%           1.9  1.9 100%           1.9  1.9 100%           1.9  1.9 100%
banked                3.8  3.8 100%           3.8  3.8 100%           3.8  3.8 100%           3.8  3.8 100%

AFTER LEARNING, WITH STEERING, DIRTY
scene         5/s: worst  typ  +-ok  10/s: worst  typ  +-ok  20/s: worst  typ  +-ok  50/s: worst  typ  +-ok
held                  2.2  0.7 100%           1.6  0.9 100%           1.5  1.2 100%           1.6  1.4 100%
right                 2.9  1.4 100%           2.3  1.9 100%           2.3  1.8 100%           2.3  1.8 100%
circle                2.2  1.6 100%           1.8  1.6 100%           2.1  1.6 100%           1.9  1.6 100%
lowgrip               2.8  0.3 100%           1.8  0.2 100%           2.0  0.3 100%           1.8  0.2 100%
switches              6.2  1.9 100%           4.2  0.9 100%           3.2  1.2 100%           3.1  1.2 100%
handbrake             6.0  2.7 100%           2.5  0.5 100%           1.9  1.8 100%           2.0  1.8 100%
spin                  2.0  0.7 100%           2.5  0.2 100%           5.4  1.2 100%           7.3  1.4 100%
ordinary              1.2  0.4 100%           0.9  0.3 100%           0.8  0.3 100%           0.7  0.4 100%
gentle                1.0  0.2 100%           0.9  0.2 100%           1.0  0.2 100%           0.9  0.2 100%
lanechange            0.5  0.2 100%           0.6  0.2 100%           0.3  0.1 100%           0.3  0.1 100%
slalom                1.2  0.3 100%           0.7  0.1 100%           0.6  0.2 100%           0.7  0.2 100%
understeer            2.9  1.1  97%           2.1  1.1  99%           1.5  0.7 100%           1.4  0.8 100%
bumpy                 6.7  0.0  87%           3.1  0.0  88%           1.4  0.0  99%           0.4  0.0 100%
braking               0.7  0.0 100%           0.4  0.0 100%           0.3  0.0 100%           0.2  0.0 100%
roundabout            2.1  0.3 100%           2.1  0.3 100%           2.1  0.3  99%           2.1  0.3  98%
banked5               1.9  1.8 100%           2.0  1.9 100%           2.0  1.9 100%           1.9  1.9 100%
banked                3.8  3.7 100%           3.9  3.8 100%           3.9  3.7 100%           3.8  3.8 100%

AFTER LEARNING, WITHOUT STEERING, CLEAN
scene         5/s: worst  typ  +-ok  10/s: worst  typ  +-ok  20/s: worst  typ  +-ok  50/s: worst  typ  +-ok
held                  1.6  0.2 100%           1.2  0.3 100%           1.0  0.3 100%           1.0  0.3 100%
right                 1.2  0.3 100%           0.8  0.3 100%           0.7  0.3 100%           0.7  0.3 100%
circle                1.1  0.1 100%           0.8  0.1 100%           0.8  0.1 100%           0.7  0.1 100%
lowgrip               0.9  0.4 100%           0.8  0.5 100%           0.7  0.4 100%           0.8  0.4 100%
switches              2.0  0.7 100%           1.5  0.7 100%           1.4  0.7 100%           1.4  0.7 100%
handbrake             2.3  0.5 100%           1.5  0.2 100%           1.3  0.1 100%           1.3  0.2 100%
spin                  5.5  0.7 100%           5.4  0.8 100%           5.2  0.8 100%           5.4  0.8 100%
ordinary              0.2  0.0 100%           0.2  0.0 100%           0.1  0.0 100%           0.2  0.0 100%
gentle                1.0  0.3 100%           0.8  0.2 100%           0.8  0.2 100%           0.8  0.2 100%
lanechange            0.2  0.1 100%           0.0  0.0 100%           0.0  0.0 100%           0.0  0.0 100%
slalom                0.1  0.0 100%           0.1  0.0 100%           0.1  0.0 100%           0.0  0.0 100%
understeer            0.6  0.2 100%           0.6  0.2 100%           0.6  0.2 100%           0.6  0.2 100%
bumpy                 3.6  0.0  82%           1.9  0.0  98%           2.2  0.0  91%           0.4  0.0 100%
braking               0.6  0.0 100%           0.3  0.0 100%           0.1  0.0 100%           0.1  0.0 100%
roundabout            0.2  0.0 100%           0.3  0.0 100%           0.2  0.0 100%           0.3  0.0 100%
banked5               3.6  3.3 100%           3.6  3.3 100%           3.6  3.3 100%           3.6  3.3 100%
banked                9.5  8.0  78%           9.5  8.0  70%           9.5  8.1  69%           9.5  8.0  68%

AFTER LEARNING, WITHOUT STEERING, DIRTY
scene         5/s: worst  typ  +-ok  10/s: worst  typ  +-ok  20/s: worst  typ  +-ok  50/s: worst  typ  +-ok
held                  3.8  2.4 100%           3.0  1.8 100%           2.6  1.5 100%           2.4  1.4 100%
right                 1.3  0.2 100%           0.8  0.3 100%           0.6  0.1 100%           0.8  0.1 100%
circle                3.4  1.5 100%           3.5  2.1 100%           3.2  1.8 100%           3.5  1.8 100%
lowgrip               5.3  2.2 100%           5.8  2.8 100%           5.8  2.7 100%           5.1  2.6 100%
switches              7.2  1.9 100%           5.0  0.9 100%           4.0  0.9 100%           4.3  0.9 100%
handbrake             6.5  1.4  99%           2.4  0.8 100%           1.9  0.5 100%           2.1  0.7 100%
spin                  9.4  1.6 100%           6.6  2.4 100%           4.4  1.3 100%           2.7  1.2 100%
ordinary              1.2  0.1 100%           0.9  0.1 100%           0.5  0.1 100%           0.4  0.1 100%
gentle                2.4  0.3 100%           1.9  0.2 100%           2.6  0.2 100%           2.1  0.2 100%
lanechange            0.3  0.2 100%           0.5  0.4 100%           0.3  0.1 100%           0.3  0.1 100%
slalom                1.8  0.8 100%           0.9  0.6 100%           0.9  0.6 100%           0.8  0.5 100%
understeer            2.8  1.0  98%           1.9  1.0 100%           1.3  0.6 100%           1.2  0.7 100%
bumpy                 7.8  0.0  74%           3.8  0.0  62%           1.5  0.0  98%           0.4  0.0 100%
braking               0.7  0.0 100%           0.4  0.0 100%           0.3  0.0 100%           0.2  0.0 100%
roundabout            2.2  0.2 100%           2.1  0.7 100%           2.1  0.6 100%           2.1  0.5 100%
banked5               2.9  2.7 100%           3.6  3.1 100%           3.1  2.8  99%           3.3  3.1 100%
banked                8.3  7.2  88%           8.8  7.8  69%           8.2  7.4  79%           8.6  7.8  73%

BEFORE LEARNING (car "a": its yaw scale happens to be the stated default), CLEAN
scene         5/s: worst  typ  +-ok  10/s: worst  typ  +-ok  20/s: worst  typ  +-ok  50/s: worst  typ  +-ok
held                  2.6  0.8 100%           2.9  0.9 100%           3.1  0.8 100%           2.9  0.8 100%
right                 2.1  0.9 100%           2.4  0.9 100%           1.4  0.6 100%           2.4  0.9 100%
circle                3.7  0.3 100%           2.9  0.2 100%           3.1  0.2 100%           3.0  0.2 100%
lowgrip               6.0  5.3 100%           5.1  4.5 100%           5.3  4.7 100%           5.1  4.5 100%
switches              2.9  1.0 100%           3.3  0.9 100%           1.9  0.8 100%           3.3  0.8 100%
handbrake             5.4  1.2 100%           5.7  1.9 100%           5.8  2.1 100%           5.4  2.0 100%
spin                  6.4  2.3 100%           6.6  2.8 100%           5.7  1.8 100%           6.7  2.8 100%
ordinary              0.2  0.0 100%           0.2  0.0 100%           0.1  0.0 100%           0.2  0.0 100%
gentle                1.1  0.3 100%           1.0  0.3 100%           0.9  0.3 100%           0.9  0.3 100%
lanechange            0.2  0.1 100%           0.1  0.0 100%           0.1  0.1 100%           0.1  0.1 100%
slalom                0.1  0.0 100%           0.1  0.0 100%           0.1  0.0 100%           0.1  0.0 100%
understeer            0.6  0.2 100%           0.6  0.2 100%           0.7  0.2 100%           0.7  0.2 100%
bumpy                 3.9  0.0  79%           1.3  0.0 100%           2.2  0.0  91%           0.4  0.0 100%
braking               0.6  0.0 100%           0.3  0.0 100%           0.1  0.0 100%           0.1  0.0 100%
roundabout            2.1  0.1 100%           2.1  0.1 100%           2.2  0.1 100%           2.1  0.1 100%
banked5               3.7  3.3 100%           3.7  3.3 100%           3.7  3.3 100%           3.7  3.3 100%
banked                8.6  4.3 100%           8.6  4.4 100%           8.6  4.2 100%           8.6  4.3 100%

BEFORE LEARNING (car "a"), DIRTY
scene         5/s: worst  typ  +-ok  10/s: worst  typ  +-ok  20/s: worst  typ  +-ok  50/s: worst  typ  +-ok
held                  7.7  5.7 100%           5.4  4.8 100%           4.9  4.8 100%           5.0  4.7 100%
right                 3.9  3.2 100%           3.4  2.8 100%           3.4  3.0 100%           3.6  3.1 100%
circle                5.0  4.6 100%           5.3  4.8 100%           5.1  4.7 100%           5.0  4.7 100%
lowgrip              12.7  9.8  99%          13.5 10.0  99%          12.6  9.8  99%          12.8  9.9  99%
switches              7.5  3.2 100%           6.0  2.8 100%           5.1  2.7 100%           4.7  2.6 100%
handbrake            10.3  5.8 100%           6.2  4.8 100%           5.1  4.4 100%           5.9  5.1 100%
spin                 18.9  5.2 100%          16.3  6.3 100%          14.0  5.1 100%          15.0  5.3 100%
ordinary              1.4  0.1 100%           1.4  0.2 100%           1.5  0.1 100%           1.5  0.1 100%
gentle                5.2  0.4 100%           4.4  0.4 100%           5.0  0.3 100%           5.4  0.4 100%
lanechange            0.4  0.2 100%           0.7  0.4 100%           0.5  0.3 100%           0.5  0.3 100%
slalom                2.1  1.0 100%           1.2  0.8 100%           1.1  0.6 100%           1.1  0.6 100%
understeer            3.7  3.0 100%           3.3  3.0 100%           3.2  2.7 100%           3.6  3.0 100%
bumpy                 7.3  0.0  87%           4.4  0.0  80%           1.5  0.0  99%           0.4  0.0 100%
braking               0.6  0.0 100%           0.4  0.0 100%           0.3  0.0 100%           0.2  0.0 100%
roundabout            3.5  2.9 100%           4.0  3.3 100%           3.8  2.9 100%           3.6  3.0 100%
banked5               1.5  1.3 100%           2.1  1.7 100%           1.7  1.5 100%           1.8  1.7 100%
banked                6.3  3.1 100%           6.8  3.5 100%           6.5  3.4 100%           6.7  3.4 100%

BEFORE LEARNING on the other two cars (their yaw scale is not the default; "b" has the sign turned round), 20/s, clean:
car b, held      worst  108.2   drifts: none
car b, ordinary  worst   59.2   drifts: none
car c, held      worst   13.1   drifts: none
car c, ordinary  worst    6.8   drifts: none

THE OTHER TWO CARS after learning, dirty, 20/s: worst / typ, with and without steering
car b  held          1.6   0.2   |   2.6   1.5
car b  right         1.2   1.0   |   0.6   0.1
car b  circle        1.9   0.5   |   3.5   1.7
car b  lowgrip       2.5   1.0   |   5.0   2.5
car b  switches      3.8   0.8   |   4.2   0.8
car b  handbrake     2.0   0.9   |   2.1   0.4
car b  spin          3.8   0.4   |   4.1   1.3
car b  ordinary      0.9   0.3   |   0.6   0.1
car b  gentle        1.0   0.3   |   2.5   0.3
car b  lanechange    0.3   0.1   |   0.3   0.1
car b  slalom        0.6   0.2   |   0.8   0.5
car b  understeer    1.5   0.7   |   1.4   0.6
car b  bumpy         1.4   0.0   |   1.5   0.0
car b  braking       0.3   0.0   |   0.3   0.0
car b  roundabout    2.1   0.5   |   2.1   0.4
car b  banked5       1.8   1.7   |   3.1   2.9
car b  banked        3.7   3.6   |   8.4   7.4
car c  held          3.0   2.1   |   2.5   1.5
car c  right         3.3   2.4   |   0.6   0.1
car c  circle        3.8   3.2   |   3.1   1.7
car c  lowgrip       1.9   1.4   |   5.4   2.6
car c  switches      3.8   2.0   |   3.9   0.9
car c  handbrake     3.1   2.6   |   2.0   0.5
car c  spin          7.1   1.6   |   4.3   1.2
car c  ordinary      0.7   0.4   |   0.5   0.1
car c  gentle        1.0   0.2   |   2.5   0.2
car c  lanechange    0.4   0.1   |   0.4   0.2
car c  slalom        0.6   0.2   |   0.9   0.7
car c  understeer    1.5   0.7   |   1.3   0.6
car c  bumpy         1.4   0.0   |   1.5   0.0
car c  braking       0.3   0.0   |   0.3   0.0
car c  roundabout    2.1   0.2   |   2.1   0.4
car c  banked5       2.1   2.0   |   3.2   2.8
car c  banked        4.0   3.9   |   8.4   7.5

WHAT THE DRIFTS WERE READ AS (after learning, 20/s): peak angle and time against the truth, score
scene      data    steering   peak read / true    time read / true    score  grade  flags
held       clean   yes          29.9 / 30.1         6.51 / 6.51         370    C    
held       clean   no           29.7 / 30.1         6.52 / 6.51         372    C    NO STEERING CHECK
held       dirty   yes          31.6 / 30.1         6.49 / 6.51         397    C
held       dirty   no           30.2 / 30.1         6.45 / 6.51         364    C    NO STEERING CHECK
right      clean   yes          21.7 / 21.8         5.23 / 5.25         195    C    
right      clean   no           21.4 / 21.8         5.25 / 5.25         195    C    NO STEERING CHECK
right      dirty   yes          23.6 / 21.8         5.30 / 5.25         220    C
right      dirty   no           22.5 / 21.8         5.26 / 5.25         203    C    NO STEERING CHECK
circle     clean   yes          36.2 / 36.6        27.23 / 27.23       1991    A
circle     clean   no           36.4 / 36.6        27.25 / 27.23       2209    A    NO STEERING CHECK
circle     dirty   yes          38.6 / 36.6        27.23 / 27.23       2163    A
circle     dirty   no           35.6 / 36.6        27.17 / 27.23       1955    A    NO STEERING CHECK
switches   clean   yes          30.2 / 30.4        10.63 / 10.64       1142    B    
switches   clean   no           30.0 / 30.4        10.65 / 10.64       1132    B    NO STEERING CHECK
switches   dirty   yes          33.3 / 30.4        10.63 / 10.64       1220    A
switches   dirty   no           34.0 / 30.4        10.59 / 10.64       1182    B    NO STEERING CHECK
handbrake  clean   yes          38.3 / 39.1         3.81 / 3.83         172    C    
handbrake  clean   no           39.2 / 39.1         3.85 / 3.83         177    C    NO STEERING CHECK
handbrake  dirty   yes          40.6 / 39.1         3.83 / 3.83         189    C
handbrake  dirty   no           40.5 / 39.1         3.80 / 3.83         179    C    NO STEERING CHECK
spin       clean   yes         100.7 / 100.0        3.36 / 3.33         102    D    SPIN
spin       clean   no          100.4 / 100.0        3.38 / 3.33         101    D    NO STEERING CHECK, SPIN
spin       dirty   yes         100.5 / 100.0        3.29 / 3.33         105    D    SPIN
spin       dirty   no          100.9 / 100.0        3.39 / 3.33         103    D    NO STEERING CHECK, SPIN
(how far the angle is worked out behind "now", clean: 5/s: 293 ms, 10/s: 160 ms, 20/s: 86 ms, 50/s: 40 ms)
```

What was learned on the way to those tables, 20 samples a second:

```
car  data   yaw: state     K against the truth   moments (left/right)  spread   steering: state   scale against the truth   moments   left known   ax sign
a    clean  learned            -0.06 %            85 (41/44)    0.4 %   learned                      -3.0 %        36          yes         +
a    dirty  learned            -0.13 %            82 (41/41)    1.0 %   learned                      -2.9 %        35          yes         +
b    clean  learned            -0.10 %            85 (41/44)    0.3 %   learned                      -8.3 %        36          yes         +
b    dirty  learned             0.00 %            83 (41/42)    0.9 %   learned                      -8.5 %        35          yes         +
c    clean  learned            -0.06 %            85 (41/44)    0.4 %   learned                       2.2 %        34          yes         +
c    dirty  learned            -0.13 %            82 (41/41)    0.9 %   learned                       1.8 %        34          yes         +
```

One fault at a time (learned with that fault where it is the sensor's):

```
ONE FAULT AT A TIME (car "a", learned with that fault where it is the sensor's, 20/s): worst error in degrees,
with steering | without steering, for a held drift, a long circle and two switches
nothing wrong                                          0.7    0.6    0.6   |   1.0*   0.8*   1.4*
body roll 4.2 deg/g                                    3.1    3.9    2.7   |   1.7*   2.3*   3.0*
body roll 6 deg/g                                      4.8    6.1    4.1   |   2.8*   3.6*   4.7*
sideways acceleration zero +0.3 m/s2                   1.6    2.4    1.7   |   1.6*   2.4*   2.8*
yaw zero +0.5 deg/s                                    0.7    0.6    0.6   |   1.0*   0.8*   1.4*
forward acceleration zero -0.3 m/s2 (a 3 % grade)      0.7    0.6    0.6   |   1.0*   0.8*   1.4*
forward acceleration reads 10 % low                    1.6    1.8    1.2   |   1.2*   1.5*   1.4*
noise on every source                                  0.6    0.6    0.6   |   1.1*   0.8*   1.3*
three times that noise                                 1.0    0.8    0.9   |   1.1*   1.6*   1.5*
speed reads 2 % high                                   1.4    1.8    1.3   |   1.5*   1.4*   2.3*
the speed is the front wheels' speed                   2.3    3.2    2.6   |   1.9*   2.7*   2.4*
the speed is the speed along the car                  10.3*  13.7*   7.7   |   8.4*  11.9*   6.7*
every stamp up to half a slot late                     1.3    0.7    1.8   |   1.6*   1.3*   2.2*
every stamp up to a whole slot late                    2.0    1.3    3.0   |   2.3*   1.8*   3.4*
sideways acceleration 50 ms later than the yaw rate    0.8    0.6    1.1   |   0.6*   0.7*   0.6*
sideways acceleration 100 ms later                     1.9    1.3    2.5   |   1.3*   1.6*   1.7*
yaw rate 50/s, accelerations 10/s                      0.7    0.6    0.7   |   1.0*   0.8*   1.3*
yaw rate 5/s, accelerations 50/s                       1.0*   0.8*   1.4*  |   1.5*   1.0*   2.1*
everything in lumps of 100 ms                          1.4    0.7    2.0   |   1.7*   1.3*   2.0*
the app held up for 150 ms as the drift begins         0.7    0.6    0.6   |   1.0*   0.8*   1.3*
the app held up for 300 ms as the drift begins         2.3*   1.5*   2.4*  |   2.3*   1.5*   2.2*
the yaw rate lost for 300 ms as the drift begins       3.4*   2.1*   3.4*  |   3.5*   2.1*   3.5*
the yaw rate lost for 600 ms as the drift begins       8.8*   8.5*   6.7*  |   8.8*   8.7*   6.8*
the sideways acceleration lost for 600 ms              3.5*   1.4*   3.1*  |   4.1*   1.7*   3.6*
no forward acceleration at all                         2.7    3.1    2.7   |   3.1*   3.6*   3.2*
the yaw sensor reads no more than 40 deg/s             6.0    2.3   24.2!  |   6.1*   2.4*  26.4!
wheelbase set 0.35 m too short                         3.2    4.4    2.6   |   1.0*   0.8*   1.4*
(* the drift carries a flag;  ! not exactly one drift was counted)
```

The scores those drifts were given (learned, clean, 20 samples a second):

```
30 degrees at 70 km/h for 7 s: 480 C
at 120 km/h: 854 B
15 degrees: 235 C
for 3 s: 176 C
sawing 22 to 38 degrees: 348 C
held: 370 C
long circle: 1991 A
two switches: 1142 B
spin: 102 D
handbrake: 172 C
```

### Where the estimate is poor

In plain words, worst first. Every figure is from the tables above or from a check in the test.

1. **It reads high by the car's body roll.** The sideways acceleration sensor tilts with the body and reads
   part of gravity. That share (7 % on the made-up car with 4.2 degrees of roll per g, 10 % with 6) goes
   into K with the yaw rate's scale, and nothing learned from ordinary driving can take it out. With dirty
   data and steering every drift's peak read 4 to 10 % high (31.6 for 30.1, 38.6 for 36.6). With 6 degrees
   of roll per g the angle was up to 6.1 degrees off. The ± carries 8 % of the angle for it. Whether a
   car's sideways acceleration is already corrected for roll is not known.
2. **If the car's speed is not its true speed while sideways, the angle is wrong.** If the car reports the
   speed along its own length, the angle was up to 13.7 degrees off on the long circle. If it reports what
   the front wheels roll at, 3.2. Which one a car sends is not known.
3. **A yaw sensor that stops reading inside its raw range is not seen.** With a ceiling at 40 degrees a
   second the switches scene was 24 to 26 degrees off and counted as two drifts, with no flag. A ceiling at
   the very end of the raw range IS seen (two such counts in a row are a gap, and the drift is flagged).
4. **A banked or cambered corner reads as angle, and without steering the angle shown runs away in it.**
   With steering: 1.9 degrees off on 5 degrees of bank, 3.8 off on 12 (4.6 shown there), and no more
   than 4.6 shown in the six banked corners of the test. Without steering (no steering from the car, the steering not learned yet, or
   "Steering check: off") only a hard banked corner is held: 3.6 degrees on 5 degrees of bank and 9.5 on
   12, both at 0.6 g. Wherever the car feels less than 3 m/s2 sideways nothing holds the sum, and it
   showed 25 to 68 degrees in corners banked by 3 to 12 degrees and taken at 0.16 to 0.45 g, with the
   tyres gripping all the way. Some of that is counted as a drift: where the car feels under 1.5 m/s2
   sideways (1325 A and 4053 S in two gentle banked corners), where the road climbs through the corner,
   and with dirty data. Every such drift is flagged NO STEERING CHECK and is no best (part 4; at first
   they were counted up to grade S without a flag, and after part 3 a banked corner that climbs still
   was). A car with neither steering nor forward acceleration counts the 12 degree bank as a drift of 31
   degrees, flagged the same. With steering a slow, tight banked corner is counted too (10 degrees of
   bank at 25 km/h: 169 C), flagged the same (part 4). Not solved: the angle shown, and that such a
   corner is counted at all.
5. **A bumpy road at a low data rate.** From 20 samples a second up the angle stays within 2.2 degrees on
   the bumpy straight. At 10 a second it wanders by up to 3.8 degrees, at 5 a second by up to 7.8: the
   shaking is quicker than the samples, and such a road gives the angle no rest. No drift was counted
   there in any run of the test's own car. On the first reviewer's car without steering a bumpy
   straight at 5 samples a second is counted, flagged (part 5). With steering it is counted there
   too in some draws of the noise, and without steering a rougher straight is counted at 10 samples
   a second as well, each flagged (part 6, point 2).
6. **5 samples a second.** With dirty data the switches and the handbrake entry were 6.0 to 7.2 degrees off
   at 5 a second, against 1.9 to 4.3 from 20 up. Every drift at 5 a second is flagged LOW DATA RATE.
7. **A spin.** The estimate holds to 100 degrees within 3.8 (clean, steering), 5.5 (clean, no steering) and
   7.3 to 9.4 degrees (dirty). Past that it runs away, because the yaw rate is read K times too high and a
   spin is all yaw rate. The drift has ended as a SPIN by then.
8. **A gap in the yaw rate while the car is turning in.** 300 ms lost as the drift begins: 3.5 degrees.
   600 ms: 8.8 degrees at first. Both are flagged DATA GAP.
9. **Before the car is learned.** The angle on the stated default means nothing on a car whose yaw scale
   is not the default (108 degrees off on car "b"). It is not shown, and nothing is counted then. On the
   car whose scale happens to be the default it was within 5.8 degrees clean, and 6.2 dirty from 10
   samples a second up.
10. **Learning from a slide, on a car that has neither wheel speeds nor a forward acceleration.** Drifted
    in steady circles both ways on a wet pan before anything is learned, such a car took 20 moments from
    the slides (they are steady, and gentle enough to pass for corners) and counted as "learned" with K
    8.5 % low, the cosine of the angle. An ordinary drive after it put K within 0.3 %, because the fit
    takes the middle one. With a forward acceleration no moment is taken from a slide: a car that slides
    feels forward acceleration that its speed does not show (part 3; at first the wheel speeds were the
    only guard, and they are blind while the rear wheels spin by about as much as the angle's cosine
    takes off). Once the car is learned none is taken either way.
11. **The ± does not cover everything.** It covered the error at least 99 % of the time in every drift
    scene of the four tables. That is this made-up car, whose front tyres match the steering check's
    guess: on a reviewer's car with softer front tyres it covered the error 37 to 86 % of the time in six
    of eleven scenes with faults (part 3). It does not know that a road is banked (68 % of the time on
    the 12 degree bank without steering) and it is too small on the bumpy straight under 50 samples a
    second (60 to 99 % of the time).
12. **A road that climbs or falls** put the acceleration check off, and the sum and learning with it: 3 %
    of grade cost up to 2 degrees in a drift, and on a climb of 4 degrees the steering was not learned at
    all.
    What the forward acceleration reads more than the speed's change on a straight is now taken out (part
    4): with 0.85 m/s2 of it (a climb of 5 degrees) a held drift, the long circle and the switches read
    within 0.3 degrees of what they read on the level. What is left is a grade that begins or changes
    inside the corner.
13. **A constant delay between two sources** cost 1.1 degrees at 50 ms and 2.5 at 100 ms. Nothing in the
    data shows such a delay, and how late a car's sources are against each other is not known.
14. **What dies quietly.** A yaw rate that stops arriving while everything is steady is "no change" until
    something else moves. Then it takes 2 s to be taken as lost, and the angle runs meanwhile (30 to 54
    degrees in the test; flagged). A speed that stops arriving is never noticed unless the app sets
    `speedMaxAgeMs`. A yaw rate and a sideways acceleration that stop TOGETHER are never noticed either,
    unless the app sets `yawMaxAgeMs` and `latMaxAgeMs` (part 3: the app does, for CDS2).
15. **Not handled at all:** a car that pulls away from a crawl already sideways (the angle starts from zero
    at 10 km/h and reads low at first); driving backwards; a driver sawing at the wheel in a way the
    made-up car's driver never does (its steering always points where the car goes).
16. **With steering the angle is only as good as the guess at the front tyres** (part 3). Front tyres that
    slip more than the guess make every held drift read low, by about a degree for each degree more: 3 to
    6 degrees on a reviewer's car, 3 to 7 on this made-up car with a softer front tyre. No flag says so.
    Whether a car reads high (body roll, point 1) or low (this) is not known.
17. **With the front wheels at their lock the steering check pulls the angle down** (part 3). On this
    made-up car (36 degrees of lock) a drift held at 46 degrees sank to 6.0 degrees low and one at 50 to
    9.5 low, without a flag. From about 55 degrees the check is more than 15 degrees from the sum, is
    dropped, and the angle is right again (58 degrees: within 1.8). Without steering all three were within
    1.8. Not solved.
18. **A car learned on corners with camber has a wrong K and still says "learned"** (part 3). Camber into
    the turn takes its share of gravity off the sideways acceleration in every corner. On a reviewer's car
    1.5 degrees of camber in every corner cost 8 % of K and 3 degrees cost 15 %, and a held drift on the
    flat then read 10 to 15 degrees low with steering and 5 to 8 low without. Camber that differed from
    corner to corner did no harm. Not solved: learn on flat ground.
19. **If the car works its forward acceleration out from its speed, the sum itself runs away** (part 3). A
    held drift of 30 degrees was up to 66 degrees off with steering and 91 without on this made-up car. The
    workshop setting "Forward acceleration: Leave out" is for such a car: the same drift was then within
    2.7 degrees with steering, and within 3.1 without (there flagged NO STEERING CHECK, as every drift
    without steering: part 4).
20. **On low grip without steering the angle is the bare sum** (part 3). The acceleration check pulls only
    from 3 m/s2 of sideways acceleration. On the circle on grip 0.3 the angle was within 0.9 degrees on
    clean data and up to 5.8 off with dirty data, and with a reviewer's faults a 40 s circle was 12 to 14
    degrees low in the middle. Its ± grows by about a degree a second there, so such a drift is flagged
    ANGLE UNSURE after about 10 s, clean data or not. With steering the same circle was within 0.6
    degrees clean and 2.8 dirty. Where the car feels under 1.5 m/s2 sideways such a drift was not counted
    at all after part 3; it is again (part 4), flagged NO STEERING CHECK.

### What is assumed about the car

None of this was measured by Proven.

- No sample carries a time: each is stamped when the app's handler runs, as in Proven Drag.
- A source that does not change sends nothing. Silence is "no change" unless what comes next, or another
  source, shows otherwise.
- The sideways and the forward acceleration arrive in m/s2 with the kit's scaling, and are sensor readings
  at the centre of gravity. Positive forward acceleration is speeding up (checked against the speed).
  Positive sideways acceleration is a left-hand turn (checked against the wheels where there are any).
- The yaw rate, the steering, the pedal and the wheel speeds are raw counts that are plain multiples of the
  quantity plus a zero. Their scale, sign and zero are not known and are learned. 65535 is "no value" for
  the yaw rate and the steering, 4095 for the pedal.
- The vehicle speed is the car's true speed over the ground, also while it is sideways.
- All sources reach the app about equally late.
- The steering source is the front wheels' angle, or a plain multiple of it (a steering wheel angle with a
  fixed ratio is learned the same way).

### Every figure that is a guess

Each stands in one table at the top of its file, with a line saying what it is: `TABLE` in `angle.js`,
`RULE` in `drift.js`, `RULES` in `score.js`, `YAW`, `STEER`, `STEADY`, `WHEEL`, `AX` and `SLIDE` in `learn.js`, and
the constants at the top of `series.js`. All were chosen by reasoning. None was tried on a car, and the
tables above are the only thing they were ever checked against.

### What was not done

- Nothing ran on a car, a head unit, or Node.js 8.
- No car side, no screens, no manifest, no saved file, no session totals, no bests, no demo: later stages.
  So nothing was built, and `test_drift.js` ran on the app's folder.
- The made-up car's motion is scripted, not driven: no tyre model decides what the car does, so a scene is
  only as real as its author made it. Its driver steers perfectly.
- One made-up car carries the main tables. The other two were run at 20 samples a second with dirty data.
- No random fleet of cars or of scenes, as Proven Drag's test has. Every table is one run of one scene with
  one set of random numbers.
- Hills steeper than 3 % (part 4 tried climbs of 3 to 7 degrees, as a forward acceleration that reads more), low-grip surfaces other than one wet pan (part 3 added one circle on grip 0.3, part 4 two drifts with 0.15 and 0.24 g across the path), tyres of different size front to rear
  (the wheels' usual ratio is learned, so that should not matter; not tried), and a trailer were not tried.
- The body roll share is not measured or corrected. Two ways to measure it were thought of and not built:
  the yaw rate from the difference of two wheel speeds across the car (needs the track width), and the GPS
  course in a steady corner.
- The ± was not tuned further once it covered the drift scenes.

### What a first car must show (the engine's list)

For the lead's first-car sheet. One photo of the Signals tab should answer most of these. Every point of
this list is driven on closed ground, the learning too.

1. Is there a yaw rate at all, from which source, how often, and what does it read standing still (its
   zero) and in a steady corner. Does "learned" come up after ten minutes of ordinary corners on the
   closed ground, with what K against the default (K / 0.005 degrees a second per count), how many
   moments each way, what spread. Learn on FLAT ground: corners with camber make K come out low (part 3),
   and a pan is flat where a circuit is not. If K differs by more than a few percent between two drives,
   say so.
2. Does the steering reach "learned", and from which source. It is learned from slow, gentle corners
   only (12 to 60 km/h). Until it is, and on a car that gives no steering angle at all, every drift
   carries NO STEERING CHECK and none is a best (part 4): note what the Drift tab's line under the drawn
   car says, if there is one. Note also whether the steering arrives on a schedule or only when it
   changes (does its row on the Signals tab show a rate while the wheel is held still), and what the
   Signals tab gives as its scale in degrees at the wheels per count (part 5). And with the car
   standing and the wheel turned to its lock: does the steering's raw value sit still to the last
   count there, or does it flicker (part 6: a value that sits still at the lock is what the rules
   for a silent and a stuck steering had to be changed for). And what that raw value is: less the
   zero and times the scale, both on the Signals tab, it is the lock in degrees at the wheels (part
   7: the stuck rule takes a wheel that is held into a slide to read 10 degrees or more, and the two
   rules do not cover a healthy wheel at a lock of less than about 28 degrees). And with the wheel
   held still by hand a little off centre, standing and, watched by a passenger, in a long steady
   corner: the steering's raw value for a few seconds. Does it flicker by a count, or sit still to the last count for 2 s
   or more; how many degrees at the wheels is one count; and does its row go on showing a rate
   (part 8: a healthy wheel that reads the same to the count with less than 10 degrees of opposite
   lock, as a slow, tight drift asks, is taken for stuck after a straight slide. On the PC counts of
   0.1 degrees with hands that wander by 0.05 kept that away; counts of 0.5 degrees with hands that
   wander by 0.2 did not).
3. "Left known" and "forward acceleration: sign known": yes or no, and which way.
4. Does the forward acceleration read the turn in a steady circle with the car sideways, and does it read
   a slope when standing. If it reads the same standing on a slope as on the flat, and the angle climbs
   past 90 degrees within a few seconds in a drift that is held steady, the car works it out from its
   speed. Then every held drift runs away to a SPIN, with or without steering, and the workshop setting
   "Forward acceleration" has to be put on "Leave out" (part 3).
5. What speed does the car report while sideways: against the GPS speed in a held drift.
6. Does the yaw rate stop at some value in a quick spin (a ceiling), and does DATA GAP come up then.
7. Does DATA GAP, ANGLE UNSURE or NO STEERING CHECK come up on drifts that looked clean. How often do
   samples arrive during a drift (the drift's data rate). The log's line for each drift says what share
   of its time the steering backed it (part 4).
8. On a banked or cambered corner of the closed ground, taken without sliding, and on one that climbs:
   what angle is shown, with the steering check on and off, whether a drift is counted, and that it is
   flagged if it is.
9. A drift filmed from outside or from above, against the angle shown: the only check of the whole chain.
   Whether it reads high or low is not known: the body roll's share pushes it up, front tyres that slip
   more than the guess pull it down (part 3).
10. On a straight, bumpy stretch of the closed ground: does the angle stay near zero.
11. What the Signals tab says the forward acceleration reads more than the speed gains on a straight
    (part 4): on the flat, and on a stretch that climbs. On the flat it is the sensor's zero.
12. On a pan with no straight: does the steering's figure on the Signals tab move with the wheel all
    the time. A steering value that sticks in a corner is not noticed there, and on the PC it then
    backed circles the other way as opposite lock, with no flag (part 6, point 3). And whether the
    line STEERING SILENT OR STUCK ever comes up during or after a drift with the wheels at their
    lock (part 6, point 1), or in a slow, tight drift with little opposite lock: on the PC it came up
    there on a steering that worked, a clean drift then set no best, and a drift with two straight
    slides in it was counted as two (part 8, point 1). And after a long drift that is let fade out
    slowly: does the angle come back to zero on the next straight (part 8, point 2: with a steering
    that had died at the lock it did not on the PC).

### For stage 2: the engine's interface

```
const { DriftEngine, canBeBest, FLAGS } = require('./drift');
const eng = new DriftEngine({ startDeg: 10, endDeg: 6, minKmh: 20, wheelbase: 2.85, front: 0.5, useSteer: true, useLong: true,
    yawKey: 'cds2', steerKey: 'front', saved: file.learned || null, demo: false, speedMaxAgeMs: 1500, yawMaxAgeMs: 2500, latMaxAgeMs: 2500,
    onDrift: (rec) => ..., onStart: () => ..., onSwitch: () => ..., onLearned: (what, state) => ... });
eng.speed(t, kmh)   eng.lat(t, ms2)   eng.long(t, ms2)       // scaled as kit/runtime/car.js scales them; t = ms from process.hrtime
eng.yaw(t, raw)     eng.steer(t, raw)   eng.pedal(t, raw)    // raw counts of the ONE source chosen (drop the car's "no value" or not: the engine does)
eng.wheels(t, { fl, fr, rl, rr })   eng.hb(t, true | false | null)
eng.idle(now)                                                // every 50 ms; the engine does nothing without it
eng.view()          // { state: 'noyaw' | 'nodata' | 'gap' | 'slow' | 'ready' | 'drift', learning, learn, angle (size, deg | null: also while nothing is learned), dir 'L' | 'R' | null,
                    //   pm, kmh, run: { score, mult, time, switches, peak, dist, smooth } | null, switched, ended, last: record | null,
                    //   opp, pedal (0..1), wheelspin (%), handbrake, rate, lag, anchored, steering, count,
                    //   noSteer ('off' | 'nosource' | 'stale' | 'unlearned' | null), blocked, ax0 (m/s2 | null): part 4 }
eng.learn.status()  // for the Signals tab;  eng.learn.export() -> what to save (numbers only);  eng.learn.reset()
eng.configure({ startDeg, endDeg, minKmh, wheelbase, front, useSteer, useLong, yawKey, steerKey, demo, speedMaxAgeMs, yawMaxAgeMs, latMaxAgeMs })
```

- A record (`onDrift`) is plain data, about 1000 characters with its trace: score, grade, end ('ended' |
  'slow' | 'spin' | 'lost'), flags (words from `FLAGS`), peak, avg, dir, switches, time, dist, entry, avgKmh,
  minKmh, peakG, peakYaw, opp, pedal, wheelspin, handbrake (each null where not known), pm, pmMax, mult,
  smooth, reversals, rate, gap, trace { ms, a: [degrees, negative = LEFT], v: [km/h] }, and `back`: the
  share of its time, in percent, that the steering backed it (part 4). It has no date: add one.
  `canBeBest(rec)` is true when it has no flag.
- `front` is the share of the weight on the front axle (0.5 = half). `yawKey` and `steerKey` name the source
  in use: each has its own learned moments, so changing source loses nothing.
- Read the speed's getter on a schedule as Proven Drag does and set `speedMaxAgeMs`, or a speed that stops is
  never noticed. A keep-alive read of the CDS2 getters while they are silent does the same for the yaw
  rate and the sideways acceleration. This said at first "the engine does not need it". It does: without
  `yawMaxAgeMs` and `latMaxAgeMs` the two stopping together is never noticed (part 3).
- `useLong: false` leaves the forward acceleration out, as on a car that does not send it (part 3). The
  step record that `angle.js` hands `drift.js` has four members more than at first: `hasAx`, `accStrong`,
  `lost` (the angle was dropped because what was learned changed) and a `slot` that is null while the
  send slot is not known. Part 4 added `sw` (why the steering can back no drift, or null) and `ax0` (the
  forward acceleration's offset).
- Banners: `state` 'noyaw' is NO YAW RATE FROM THE CAR, 'slow' is TOO SLOW, `learning` true with `learn`
  'none' is LEARNING THE CAR (nothing is counted then), `switched` and `ended` hold for 4 s, `blocked` is
  GO STRAIGHT FOR A MOMENT (part 4).
- Save `eng.learn.export()` when `onLearned` fires and now and then while it learns (it changes with every
  moment, at most once a second), never while a drift runs.

## 2. The app

Part 1 is the engine. This part is everything around it: what the app asks of the car, the session, the
saved file, the five tabs, the settings, demo mode, the manifest, the icon, and a stand-in car to test
the built app on. As in part 1, every figure is from a PC and from made-up cars, and "assumed" and "a
guess" mean exactly that. The engine was not changed in this part: `angle.js`, `learn.js`, `drift.js`,
`score.js` and `series.js` were as part 1 left them, and `test_drift.js` gave the same checks on the
built app. (Parts 3 and 4 changed the engine.)

### What was built

| File | What it does |
|---|---|
| `apps/pps_drift/main.js` | the app: the 50 ms tick, the five tabs, the first screen, the two resets of Settings |
| `apps/pps_drift/car.js` | the car side: twelve subscriptions, the getters read on a schedule, the one event; the first raw values of every source go to the log |
| `apps/pps_drift/feed.js` | the bookkeeping around the feed: Proven Drag's poll scheduler (unchanged), how often the speed is read, the top-up of the CDS2 getters, rates, which of several sources is in use |
| `apps/pps_drift/session.js` | between the car's data and the screens: one speed series for the engine, the sources in use, the session's totals, what a finished drift becomes, when the file is written |
| `apps/pps_drift/store.js` | the saved file `pps_drift.json`: four bests, the last 30 drifts, what was learned |
| `apps/pps_drift/gpscheck.js` | the GPS receiver's speed over the car's own, going straight and in drifts at a held speed |
| `apps/pps_drift/screens.js` | the first screen and the five tabs, and the drawn car |
| `apps/pps_drift/demo.js` | the made-up drive of demo mode |
| `apps/pps_drift/heldlog.js` | the log, held back while a drift runs |
| `apps/pps_drift/proven-theme.js`, `logo.js`, `logo-data.js` | Proven's colours and logo, copied unchanged from the other apps |
| `apps/pps_drift/app.json`, `icon.png`, `NOTICE` | the manifest (written by `proven/tools/make_drift_appjson.py`), the tile icon (by `make_drift_icon.js`), the licence notice |
| `proven/tools/fakedrift.js` | the stand-in car and head unit: `driftsim.js`'s made-up car, sent as a head unit would hand it to an app |
| `proven/tools/test_drift_car.js` | the built app on that stand-in car: 418 checks |
| `mgu-repo.json` | a fourth component, `pps_drift`, with the same build block as the other three |

`feed.js`, `gpscheck.js`, `store.js` (but for the file itself) and `demo.js` are pure: time comes in as
an argument. Only `car.js` touches the car, and it only subscribes and reads.

### What the app asks of the car

Twelve interfaces, looked up in the interface catalogue of one head unit (an M8, iDrive 7): each is
there, with instance 1, and each field has the getter or the notifier the manifest asks for. The build
step's own check (`MGU_SOMEIP_CATALOG=... python3 kit/tools/build.py --preview-only pps_drift`) reports
nothing missing. To see that the check can report, it was run once against a copy of the catalogue with
one interface, one field and one getter taken out: it named all three, with the text of what the app
loses, and left them out of the manifest. That copy was in a scratch folder and is deleted.

| What | Interface, field | Asked for | Needed |
|---|---|---|---|
| Speed | Vehicle2 `statusCarSpeed2` | read and subscribe | yes |
| Sideways and forward acceleration, yaw rate | CDS2 `statusLateralAccelerationMassCenter`, `statusLongitudinalAccelerationMassCenter`, `statusYawVelocityVehicle` | read and subscribe | yes |
| Yaw rate, second source | SpeedAcceleration `YawSpeedVehicle` | subscribe | no |
| Steering | SteeringAngle `SteeringAngleFrontAxleEffective`, `ActualSteeringAngleDriver` | subscribe | no |
| Steering, second source | XView `statusFrontAxleSteeringAngle`, `statusSteeringAngleDriver` | read and subscribe | no |
| Accelerator pedal | AcceleratorPedal `AngleAcceleratorPedal` | subscribe | no |
| Four wheel speeds | Powertrain `ActualValueRPMWheel` | subscribe | no |
| Handbrake | CDS `statusHandBrake` | read and subscribe | no |
| DSC button (shown raw) | FES `statusDSCSwitchHMI` | read and subscribe | no |
| The car's own motion estimate (study only) | DrivingVector `ActualVectorVehicleMove`, `VehicleDynamicDataEstimatedVerified` | subscribe | no |
| BMW's drift analyser (study only) | MDrive `statusDriftLast`, `statusDriftBest` | read and subscribe | no |
| GPS sentences | SatellitePositioning, event `updatePosition` | the event | no |

"Read" is in the manifest wherever the catalogue lists a getter, because the kit reads every such
field once when the car's service comes up, which gives a first value without waiting for a change.
The app itself reads four getters and no other: the speed, and, as a top-up, the yaw rate and the two
accelerations. `controlDisplayDrift` is not in the manifest.

The members read are named in `car.js` (`MEMBER`, `STUDY`). A value that does not have its member is
no value. The "qualifier" members that some of these values carry are not read: what their values mean
is not known, and the catalogue's own names for them are not copied into this repository.

### How the feed works

- **The speed** is read from its getter 10 times a second on the move, twice a second standing, and
  every 2 s once the car has stood for 5 minutes with the screen hidden. It is notified as well. The
  engine is handed ONE of the two series, never both: each has its own delay, and the speed's change
  over 0.3 s is part of the angle. It is the getter's while the getter answers.
- **A speed that stops.** While the engine is on the getter's series, a speed older than 1.5 s counts
  as lost and the banner says DATA LOST. If the getter stops answering, that still holds until the
  car notifies a speed; from then on the engine is on the notified series, where silence means "no
  change". (At first a dead getter made the app go on in silence with the last speed. That came out
  while the test for it was written, and it was changed.)
- **The yaw rate and the two accelerations** are taken as notified. Where fewer than 16 notifications
  of one of them arrived in the last 2 s while the car does 10 km/h or more, its getter is read as
  well: one read at a time for the whole interface, every 40 ms, in the order yaw rate, sideways,
  yaw rate, sideways, forward. On the stand-in car that gives 10 samples a second of the first two.
- **A yaw rate or a sideways acceleration that stops** (part 3). By the top-up's own figures a healthy
  CDS2 gives a sample of each at least every 2.3 s or so on the move, whether the car sends on change or
  all the time. So one that is older than 2.5 s while the car has done 10 km/h or more for all of that time
  counts as lost: NO YAW RATE FROM THE CAR, or DATA LOST, and a drift that runs ends there, flagged
  DATA GAP. The second yaw source has no getter that the app reads; for it silence stays "no change".
  "A healthy CDS2" is one whose getters answer within half a second: a read that takes longer is thrown
  away, and a car whose readings hold still and whose getters are that slow would be called lost while
  nothing is wrong (part 4).
- **Two reads of one value never overlap**, the kit's own first read counted: Proven Drag's rule, kept
  for each of the four getters.
- **Which source.** Two sources carry the yaw rate and four the steering. On "Auto" the first in the
  list is used; if it has delivered nothing usable 10 s after the car was first heard, the first one
  that has delivered 20 usable values takes its place for as long as the app runs. Each source has its
  own learned moments (the engine keeps them under the source's name), so a change loses nothing.

### Where it departs from the brief, and why

**Three banners the brief does not list.** NO DATA FROM THE CAR (no speed or no sideways acceleration
yet) and DATA LOST (a source the angle needs has gone silent). The engine has those two states, and the
page has to say something in them. And GO STRAIGHT FOR A MOMENT (part 4): after a spin, after an angle
that was lost and after what was learned has changed, nothing starts until the car has gone straight,
and the driver has to be told.

**A standing line on the Drift tab (part 4).** While the steering backs no drift (the check off, no
steering from the car, the steering silent or stuck, or not learned yet), a line under the drawn car
says which it is and "NO BEST IS SET" (part 5: it read "DRIFTS ARE SCORED, NONE SETS A BEST" at 13 px,
the smallest text of the app; it is 15 px now). It is not shown while nothing is scored anyway, and not
where the steering can be used and simply does not back the drift.

**LEARNING THE CAR comes before TOO SLOW while nothing at all is learned, after it once drifts are
scored.** A car that has learned nothing scores nothing at any speed, so that is what its driver has to
know first.

**The two resets are settings with three values, not buttons.** The brief puts "reset what was learned"
and "reset bests" under Workshop settings. The kit's settings are choices, switches and numbers; an
app's own row with a button only exists where the kit draws the settings itself. So each reset is a
choice: No, "Confirm: choose Reset now", Reset now. It acts when "Reset now" is chosen while the
setting stands at Confirm, so it takes two steps both where the head unit steps a setting on with each
press and where it offers a list. This was tried on the PC stand-in only. How it reads on a head
unit's own settings screen is not known.

**"Reset bests" clears the saved list of drifts as well**, as Proven Drag's "Reset best" clears its
list of runs. The session's own totals stay.

**The end angle is not a setting.** It is 0.6 of the start angle, rounded to a whole degree (6 for 10,
as the brief's two defaults).

**The steering check switched off also takes the opposite lock away.** The engine works the front
wheels' angle out only where it uses it. That is the engine's, and it was left as it is.

**The GPS is used for one figure, and that figure is kept with a drift.** The brief says "cross-check
only, in memory". The app reads the speed and the validity out of the receiver's RMC sentence and
nothing else, so a position, a course or a heading is never even taken out of the text. What it keeps
is a ratio: the receiver's speed over the car's. That ratio, where a drift gave one, is saved with the
drift (a ratio and a count), because it answers the question a first car has to answer.

**A chassis list of five families, and half the weight on the front axle for all of them.** The brief
asks for wheelbase and weight split from a short list. The wheelbases are the makers' published
figures. No family's real weight split was looked up: 0.5 is taken for every one. Moving it by 0.02
moves the distance the steering check works with by 6 cm, which is about a tenth of a degree in a
drift.

**The handbrake's two values are the kit's.** The brief says "values unknown". The kit's own Live Data
app reads this signal's two states by name and by number, and `car.js` keeps exactly that. Anything
else is "not known".

**Demo.** The brief asks for demo mode as Proven Drag's. The demo here is a made-up motion with its own
raw units, turned into sensor readings by kinematics and driven through an engine of its own, which is
handed what the demo car would have "learned". So the demo shows the real engine at work on clean
made-up data. Its drifts carry the DEMO flag, which blocks a best, so the Best tab of the demo shows
no best.

**`test_fonts.js` does not cover this app.** It is the other three apps' test and was not to be
touched; given Proven Drift it says "not a Proven app". What it checks for Proven Drag beyond the
atlases themselves (the kit's header, the kit's list of settings) is checked for Proven Drift in
`test_drift_car.js`, which also checks that the built app carries the same five atlases byte for
byte.

**Signals tab.** The brief's four states are there, and a fifth, "subscribing", for the moment before
the head unit has answered. A source that is in use says "present, in use".

### What the test's first runs changed

1. The first version of the Signals tab had four lines that ran out of their panel with a source set
   by hand, the steering check off, or a text value from the car (a 70-character text was cut to 14
   characters and five of them stood in a line). The rules of `textfit.js` found each. The two panels
   on the right were laid out again with shorter lines, and a study-only text value is cut to 8
   characters.
2. The degree sign of the big angle stood far above its number, and the one on the Best tab was a
   speck set apart from it. Both seen in the pictures, both moved.
3. The scales of the trace on the Last tab were not whole steps (110, 10, -90, -190). They are now.
4. A dead speed getter went unnoticed: see "How the feed works".
5. With every source of the steering missing, the Signals tab said "Steering check: on". It says "no
   steering from the car" now.
6. The second yaw source was to be taken "10 s after the car was first heard". On the stand-in car
   that source is sent on change only and had said one value by then, with the car standing. The rule
   is what it was (20 usable values); the test now drives the car before it looks.

### Can the test fail

The built app was broken in 28 ways, one at a time, in a scratch copy, and `test_drift_car.js` run on
each (the script is in the checks folder, not in the repository). The breaks: a write to the car; the
GPS sentence itself logged; a drift kept with whatever members it came with; a flagged drift setting a
best; every drift keeping its trace; an unreadable file not kept; demo drifts saved; the log not held
back; the file written the moment a drift ends; the CDS2 getters read all the time; the speed read 20
times a second; the speed read without waiting for the kit's first read; both speed series handed to
the engine; a dead getter never noticed; a reset in one step; the second source never taken; the speed
unit, the slowest speed and the start angle ignored; no CLOSED COURSE ONLY; the handbrake the wrong way
round; the sideways acceleration with the wrong sign; the steering wheel read from the wrong member;
flagged drifts left out of the session; a banner text too long for its line; the wall clock in the
measuring path; the demo on as shipped; what was learned saved under one name for every source.

25 of them made between 1 and 39 checks fail at first. Two were not noticed: the file written the moment a
drift ends (no check had two drifts close together), and the speed read without waiting for the kit's
own first read (the stand-in getter answered in 25 ms, before the app's first tick). One was noticed
by accident only: with both speed series handed to the engine, the one check that failed was a pattern
that wanted the peak in the log to begin with a 3, and the peak had become 29.9. A check was added for
each of the three (two drifts with 0.75 s of grip between them; a getter that takes 0.2 s; the number
of speeds the engine took against the number read), and the accidental pattern was loosened. Each of
the three breaks now makes its own check fail, and all 28 were run again on the test as it then stood:
every one makes between 1 and 44 checks fail.

### What was measured through the whole app

All on the stand-in car, PC only. The made-up car's sources arrive on clean timers here: the late
stamps, lumps and lost samples of part 1's "dirty" delivery are in the engine's test, not in this one,
with one exception (the app held up for 0.4 s).

| What | Figure |
|---|---|
| Learning, from pulling away into the first corners | yaw rate "learning" after 26 s, "learned" after 67 s; steering "learned" 44 s into slow, gentle corners |
| Yaw scale learned, no sensor faults | within 0.05 % of the made-up car's; zero within 1.1 counts |
| Steering scale learned | within 3.1 % |
| A held drift of 30.1 degrees, 6.5 s | read as 30.0, 6.52 s, 373 points (C) |
| Two switches | one drift, 2 switches, 1146 points (B) |
| Long circle, 27 s | 2014 points (A); GPS speed over the car's x1.000 over 26 sentences |
| Spin | SPIN, 102 points (D), no best |
| The same held drift on the second yaw source (other scale, sign turned round) | 29.9 |
| With no steering at all | 29.5, ± 4.2 on average, flagged NO STEERING CHECK (part 4) |
| With the yaw rate and accelerations read from their getters only (10 a second) | 29.9, angle worked out 160 ms behind, no flag |
| With the speed notified only | 29.9 |
| With sensor faults (body roll 4.2 degrees per g, gains, zeros, noise, speed 2 % high) | yaw scale learned 6.4 % high; five kinds of drift each counted once without a flag; angle within 2.8 degrees at every look; every peak 5 to 8 % high (32.0 for 30.1, 39.4 for 36.6). Before part 4 took the forward acceleration's offset out: within 3.6, and 6 to 10 % high |
| On a made-up car that reports the speed along its own length | the long circle read 31.3 for 36.6, up to 13.2 degrees off, flagged ANGLE UNSURE; the GPS check read x1.000 straight and x1.202 in the drift |
| The app held up for 0.4 s in a drift | counted (29.9), flagged DATA GAP |
| What must score nothing (seven kinds of driving, with and without sensor faults) | nothing |
| A car that has learned nothing circles left and right on a pan and is drifted with no straight between (part 4) | not counted; the banner says GO STRAIGHT FOR A MOMENT; after 2.5 s of straight the next drift is counted |
| A car whose forward acceleration reads 0.7 m/s2 more than its speed gains (part 4) | learned as on the flat (85 yaw moments, 36 steering moments); the Signals tab shows the 0.70; a drift read 29.9, no flag |
| Speed of the whole app with its stand-in car on the PC | 246 s of driving in 1.9 s (130 times real time) |
| The saved file | 4 kB with what was learned alone, 9 kB with five drifts and their traces |

### Where the app is weak

In plain words. The engine's own list (part 1, "Where the estimate is poor") stands as it is; this adds
what the app around it brings.

1. **A yaw rate that dies in a steady drift is noticed 2.5 s later.** On the stand-in car the yaw rate
   (and its getter) was cut 2.2 s into a held drift. 1.8 s later the banner still said DRIFT and the
   angle read 28.3 for 30; 2.5 s after the cut the drift ended, flagged DATA GAP, and the banner said
   NO YAW RATE FROM THE CAR. The same with all of CDS2 cut, with its service down, and with its three
   fields reading the car's "no value". (At first the app noticed a dead yaw rate only when the
   sideways acceleration next moved, and all of CDS2 dying was never noticed: part 3.) For those 2.5 s
   the drift goes on from the last values. Not sooner, because the app reads a getter only once the
   car has sent too few samples for 2 s. On the second yaw source (the chassis one) the first rule
   still stands: it is noticed when the sideways acceleration next moves.
2. **The app shows the GPS check and does not act on it.** On a car that reports the speed along its
   own length, the angle was 13 degrees off. There the drift happened to be flagged ANGLE UNSURE. Part
   1's table has the same fault with 10 degrees of error.
3. **On a car that only notifies its speed, a speed that has died is not noticed.**
4. **A steering source that goes silent looked like a steering wheel held still.** Its last value
   stood, as for every source that is sent on change. With every steering source cut on a straight,
   a drift of 30 degrees was still read right (29.5: the steering check is not believed that far from
   the sum), but its opposite lock read 0. A drift of 13 degrees read 11.9 at its peak and as little
   as 8.4 on the way, because the check pulled it toward the wheel that seemed to stand still, and no
   flag said so. Part 2 wrote: telling a dead source from a still one would need a rule like "no
   steering sample for so long while the car turns", and a steady corner is exactly that. Part 4 has
   such a rule: nothing for 2 s while the car both went straight and turned (part 6: "straight" there
   also asks for less than 20 degrees of angle shown). With it the same two
   drifts read 29.5 and 13, opposite lock says "not known", and both are flagged NO STEERING CHECK.
   Still open: a steering that dies in the middle of a corner is believed until the car has gone
   straight (part 8: since part 6 only on a straight with less than 20 degrees shown; one that dies
   at the lock in a drift that fades out slowly is believed to the end of the drive), and a drift
   during which it dies keeps the wheel's last value, with no flag (part 5). A
   steering value that sticks and is still sent is seen by a rule of its own (part 5). The pedal's
   last value still stands in "average pedal".
5. **"Auto" takes the first source that delivers numbers.** A source that delivers numbers that are
   not the yaw rate would be taken and never learned (the fit would not come to "learned"), and the
   app would say LEARNING THE CAR for ever. The Signals tab shows which source is in use, and a
   workshop can set the other.
6. **A variable steering ratio.** The steering wheel's angle is learned as a plain multiple of the
   front wheels' angle. On a car whose ratio changes with the angle that is wrong, which is why the
   front wheels' own angle is preferred. If a car has only the steering wheel's angle, the steering
   check and the opposite lock are off by however much the ratio varies.
7. **The stand-in car is kind.** Its sensors flicker by one count, so everything is notified 50 times
   a second; its services answer in 25 ms; nothing is lost on the way. None of that is known of a car.
8. **Top-up reads.** On a car that does not notify its yaw rate, the app reads three getters about 25
   times a second together, on top of the speed's 10. Whether a head unit takes that is not known.
9. **The Signals tab is small print**: 16 px of 520 on its lists. It is made for a photo.
10. **The header on iDrive 7 with the DEMO badge**: the kit drops the app's name to make room for five
   tabs, Settings and two badges. All tabs and both badges still show.
11. **The settings' two resets** have never been seen on a head unit's own settings screen.
12. **The handbrake**: on a car with an electric parking brake the signal may never say "applied", and
    then every drift says "handbrake at the start: no".
13. **Body roll again.** Through the whole app the peaks read 6 to 10 % high with 4.2 degrees of roll
    per g, as part 1 found. Nothing in the app takes it out or says so on the screen, beyond "estimate"
    and the ± figure.

### What is assumed about the car, beyond part 1

- The twelve interfaces, their fields and their members are named as in one head unit's catalogue.
- A getter read takes about 25 ms, and reading the speed 10 times a second does not trouble the head
  unit (Proven Drag reads it 20 times a second, and has not been on a car either).
- The yaw rate and the accelerations are notified often while the car moves, because a sensor's value
  flickers. If not, the top-up reads them.
- The handbrake's signal reads as the kit's Live Data app takes it.
- The GPS receiver's sentences are standard, with the speed over ground in knots in field 7 of RMC,
  and that speed is about a second old.

### Every figure that is a guess, in this part

Each stands at the top of its file with a line that says what it is: the poll periods, the top-up's
limits and the choice of source in `feed.js`; when a speed counts as fresh or lost, when the file is
written and the demo's 5 s in `session.js`; the limits of a GPS ratio in `gpscheck.js`; 30 drifts and
5 traces in `store.js`; the 2.6 s of the first screen and the 30 s of an armed reset in `main.js`; the
five wheelbases in `session.js`. None was tried on a car.

### What was not done

- Nothing ran on a car, a head unit, the kit's live emulator, the GPU renderer or Node.js 8.
- No installable package was built (that needs BMW's app SDK from a head unit).
- The engine was not changed in this part.
- The delivery faults of part 1 (late stamps, lumps, lost samples) were not put through the whole app,
  only through the engine. The one exception is the app held up for 0.4 s.
- The stand-in car was run with one set of sensor faults, part 1's "dirty" set. No random fleet.
- The settings were drawn as the kit draws them. The head unit's own settings screen was not built.
- No picture of the app is in the repository. The pictures the tests and the preview draw are made
  on the PC when asked for.
- A first-car sheet for the owner is not written. The list for it is below.

### What a first car must show (the whole list)

The engine's ten points in part 1 stand. With the app there is a way to get most of them from
photos of the Signals tab and the log file. **Every point of this list that is driven is driven on
closed ground**: a skid pan or a closed circuit, the learning and the ordinary corners too.

1. **Before anything: does the Store build and install the app**, and does it open. A photo of the
   first screen and of the Drift tab.
2. **Standing, engine running: a photo of the Signals tab.** It answers: which of the 19 sources are
   there, which say "not on this unit", what each one's raw value is standing still (the yaw rate's
   zero, the steering's centre, the handbrake's and the DSC button's value, the wheels' four numbers),
   and what the study-only values are. Then pull the handbrake, with the car still standing, and take
   another photo: what changed is what that signal means. Of DSC, note what its row reads as the car
   stands, and leave the button alone: this app needs no change to DSC or to any driving setting, and
   it makes none.
3. **After ten minutes of driving with ordinary corners both ways, on the closed ground and on flat
   ground: a photo of the Signals tab.** It answers: how often each source sends (the "most" column), whether the yaw
   rate and the steering say LEARNED, with what scale against the default, how many moments each way
   and what spread, which sources are in use, whether "left" and "speeding up" are known, whether the
   getter top-up is at work, and what the GPS check reads going straight.
   And one more, taken by a passenger in a long steady corner: do the yaw rate, the accelerations
   and the steering still show a rate in the "now" column there, or "--"? That says whether the car
   sends them all the time or only when they change, which decides how well a dead signal can be
   told from a still one. Of the steering in particular (part 5): note whether it arrives on a
   schedule or only when it changes, on a straight with the wheel held still as well. A steering
   that has died shows as silence in the one case and as a value sent again and again in the other,
   and the app has a rule for each. And one photo with the car standing and the wheel at its lock:
   does the steering's raw value sit still to the last count there, or flicker (part 6). The same
   photo says what the lock reads at the wheels: the raw value less the zero, times the scale the
   tab gives (part 7: the stuck rule takes a wheel that is held into a slide to read 10 degrees or
   more, and a lock of less than about 28 degrees is not covered). And the steering's raw value
   watched for a few seconds with the wheel held still by hand a little off centre, standing and,
   by a passenger, in a long steady corner: does it flicker by a count or sit still to the last
   count, and how many degrees at the wheels is one count (the scale the tab gives). What a slow,
   tight drift does to a healthy steering hangs on these three: a value that sits still, how fine a
   count is, and whether it is sent on a schedule or on change (part 8, point 1).
4. **A drift held at a steady speed on a skid pan, then a photo of the Last tab and of the Signals
   tab.** The Last tab's "GPS speed / car speed" against the Signals tab's "straight" figure answers
   what speed the car reports while sideways. If the two differ by more than a few percent, the angle
   is wrong and the app has to be changed before it is used.
5. **The same drift filmed from outside or from above**, with the screen in the film or the Last tab
   photographed after: the only check of the angle itself. Whether it reads high or low is not known.
   Do it once with "Steering check" on and once with it off: on the PC the two differed by 3 to 7
   degrees wherever the front tyres did not match the app's guess.
6. **Flags on drifts that looked clean** (DATA GAP, ANGLE UNSURE, NO STEERING CHECK, LOW DATA RATE):
   note them, with the Last tab's "data" figure. NO STEERING CHECK on every drift means the steering
   is not learned, or the car gives none: the line under the drawn car on the Drift tab and the
   Signals tab say which (part 4). NO STEERING CHECK with NO line under the drawn car, and "Steering
   check: on" on the Signals tab, means something else: the steering was read, and it did not say
   that the car oversteers. Then the log's lines "the steering backed N % of its time" are wanted,
   one for every such drift, with the film of the drift if there is one (part 5). And if the line
   STEERING SILENT OR STUCK comes up during or after a drift with the wheels at their lock while the
   steering works: note it, with the Signals tab. On the PC a healthy steering was taken for stuck
   there until part 6. Note it as well if it comes up after the wheel was held still with only a
   little opposite lock (part 7: a wheel that does not move, with less than 10 degrees of it into
   the slide, is taken for stuck), and if the banner GO STRAIGHT FOR A MOMENT ever stays up while the
   car has been going straight for some seconds: on the PC that went with a steering that was
   believed when it was stuck (part 7). On the PC the line STEERING SILENT OR STUCK also came up
   in slow, tight drifts on a pan with a steering that worked (part 8, point 1): note the speed, how
   tight the circle was, the opposite lock on the Last tab, and whether one drift with a straight
   slide in it was counted as two. And if the angle shown does not come back to zero on the straight
   after a long drift that was let fade out slowly, note the steering's row on the Signals tab: on
   the PC that went with a steering that had died at the lock (part 8, point 2).
7. **A straight, bumpy stretch and a banked or cambered corner of the closed ground, taken without
   sliding**: what angle is shown, and whether a drift is counted. If one is, it must carry NO
   STEERING CHECK (part 4).
8. **A spin, if it happens**: does it say SPIN, and does the yaw rate's raw value on the Signals tab
   stop at some number.
9. **The log file** (`pps_drift.log` in the app's data folder): the first raw values of every source
   with their member names, the rates, every "learned" line, and a line for every drift.
10. **The settings**: does the list show all sixteen, do the two resets take two steps, does the
    chassis list read well.
11. **Both screens if there are two cars**: iDrive 7 and iDrive 8, each with a photo of every tab.
12. **The tell-tale of a forward acceleration that is worked out from the speed** (part 3): in a drift
    that is held steady the angle climbs past 90 degrees within a few seconds and the drift ends as a
    SPIN that was none, and the forward acceleration's raw value on the Signals tab is the same
    standing on a slope as standing on the flat. Then set "Forward acceleration" to "Leave out"
    (Workshop settings), and say so.
13. **The steering, before any drift is driven for a best** (part 4). After the ordinary corners,
    drive slow, gentle ones both ways (12 to 60 km/h: a slow figure of eight on the pan) until the
    Signals tab says the steering is LEARNED. Until then, and on a car that gives no steering angle,
    every drift is scored and none becomes a best. If the steering never comes to LEARNED, or the car
    has none, say so: that rule is to be looked at again with this car's data.
14. **The Signals tab's line under "Positive forward acceleration"** (part 4): what the forward
    acceleration reads more than the speed gains on a straight, on the flat and on a stretch that
    climbs, and how many seconds were turned down as slides in the ordinary corners.
15. **After a spin, or with a car that has learned nothing and is only driven in circles**: does the
    banner say GO STRAIGHT FOR A MOMENT, and does it go once the car has gone straight (part 4).
16. **On a pan with no straight: watch the steering's figure on the Signals tab move with the wheel**
    (a passenger, or a photo in each of two corners). A steering value that sticks in a corner is
    not noticed while the car never goes straight, and on the PC the stuck value then backed circles
    the other way as opposite lock: false drifts with no flag (part 6, point 3).

## 3. What two reviews found

Parts 1 and 2 were read and tried by two reviewers who had not built them. Each wrote a stand-in car of
their own, from physics, without the made-up car of this repository. The first measured the engine: a
single-track car with brush tyres and a driver who steers and uses the pedal, three sets of raw units,
16 probes. The second drove the built app on the kit's own signals module over a stand-in for the head
unit's native module, with a made-up car of their own, and read every text. What they found is below. All
of it is from a PC and from made-up cars, as everything in this record.

Each finding was run again first, with the reviewer's own probe on the files as part 2 left them: all 16
probes of the first reviewer and the four of the second that show a fault gave the reviewers' output to
the last character. Then it was changed, and after every change to `angle.js`, `learn.js` or `drift.js`
the test's tables and all 16 probes were run again and laid beside the ones before, cell by cell. The
probes are not in the repository.

### What was found, and what was changed

**1. A banked corner taken with full grip was counted as a drift, on a car without steering.** That is a
car with no steering source, a car whose steering is not learned yet (every car on its first minutes), and
a car with "Steering check: off". The acceleration check only spoke from 3 m/s2 of sideways acceleration
felt, a banked corner is exactly where the car feels little, and a check that could not speak let the
drift start. On the reviewer's car, learned, without steering: 12 degrees of bank at 0.45 g read 43
degrees and scored 884 points, grade B; 6 degrees of bank at 0.2 g and 100 km/h for 15 s scored 1335,
grade A; 9 degrees of bank at 0.16 g for 20 s, where the car feels nothing sideways at all, read 68
degrees and scored 4013, grade S. None carried a flag, so each could set all four bests. On this
repository's made-up car: 868 B (12 degrees at 0.45 g), 1250 A (5 degrees at 0.3 g for 15 s) and 1325 A
(6 degrees at 0.2 g). Part 1 had tried one banked corner (12 degrees at 0.6 g), found 9.5 degrees, and
written "no drift was counted in any run". That was true of that corner only.

Changed (`angle.js`, `drift.js`): the acceleration check is now worked out from 1.5 m/s2 of sideways
acceleration on. Its pull is as it was, from 3 m/s2. Without steering a drift is only confirmed once the
check has seen the angle (the same side, 0.4 of it or more) for half of the time since the angle reached
the start angle. The drift waits for that, for a second at most, and still counts from where it began. And
a drift that neither check held for more than half its time is flagged ANGLE UNSURE. (Part 4 changed both
again: what starts without steering, and the flag, which is NO STEERING CHECK now and is given by the
steering alone.)

After it, clean data: none of the reviewer's ten banked corners is counted, and none of the six in the
test at any of the four rates. With the reviewer's dirty data four of the ten are still counted, each
flagged ANGLE UNSURE now (278 C, 786 B, 277 C and 2126 A; a forward acceleration that is a little off
looks like the start of a slide, and the flag comes because nothing holds the angle afterwards). On this
repository's car with its own dirty set: none in 24 runs. The angle SHOWN still runs away in those
corners, up to 68 degrees: not solved (below). That held on level ground only. With the forward
acceleration reading 0.5 m/s2 more than the speed's change, as on a climb of 3 degrees, four of five of
this car's banked corners were counted with no flag (part 4).

**2. The first corners of a first drive were counted as a drift.** While nothing is learned the angle was
summed on the stated default and shown. On a car whose yaw rate is scaled 1.5 times or more finer than the
default, with the same sign, that sum reads tens of degrees in an ordinary corner. The first line for the
yaw rate is always drawn in the middle of a corner; the stale angle was kept, pointed into the turn, and
a drift began at once. On the first reviewer's car (2.5 times finer): 157 points, grade C, peak 35
degrees, 21 s into the drive, with nothing sliding. With the default 4 times too large: 282 C, peak 77.
On the second reviewer's car through the whole app: 1438 points, grade A, on the screen as DRIFT and in
the session's total. A car whose scale IS the default did it too if the app was first opened standing on
a cross slope of 3 degrees or more (197 to 277 points): the sideways zero is taken at the first
standstill. All were flagged UNCALIBRATED and ANGLE UNSURE, so none set a best. Part 1 said "nothing is
counted on the stated default scale alone"; its cars b and c (the sign turned round, and 1.25 times too
large) happened not to show it.

Changed (`angle.js`, `drift.js`): when what was learned moves the yaw rate in use (a first line, or a
line that moves it by more than 5 % and half a degree a second), the summed angle is dropped and nothing
starts until the car has gone straight; a drift that runs then ends there, flagged DATA GAP. And while
nothing is learned no angle is shown: "--".

After it: none in any of those runs (ratios 1.5 to 10, both reviewers' cars, the cross slope), and the
test has a car scaled 2.5 times finer, clean and dirty.

**3. ANGLE UNSURE came up on clean drifts.** With no fault at all the ± settles at 5 to 6.5 degrees after
about 10 s (what the check in use is taken to be good for, plus what the sum adds in the time the check
needs to pull), and 5 degrees were the least that was allowed. So every clean drift under about 30 degrees
that lasted longer than 8 to 15 s was flagged, and could not be a best: the long steady circle on a pan,
which is what "longest by time" and "longest by distance" are made of. On the reviewer's car 43 of 108
clean drifts from 10 samples a second up were flagged. Part 1's drift scenes were all short or 30 degrees
and more, so its tables never met it.

Changed (`drift.js`): 7 degrees are always allowed. The ± itself is as it was.

After it: of those 108, six are flagged, all on grip 0.3 without steering, where the ± is 10 to 25
degrees because nothing holds the sum (point 20 of part 1's list). The test has six clean drifts of 15 to
35 degrees that last 12 to 40 s at 35 to 70 km/h, with and without steering: no flag, ± 4.1 to 6.0.

**4. If a car works its forward acceleration out from its speed, the angle runs away.** Parts 1 and 2 said
of such a car that "the acceleration check is worthless and must be switched off". It is worse than that:
the sum itself takes that signal as the part of the turn a sideways car feels along its length. On the
reviewer's car a held drift of 30 degrees read 38, 48, 65, 91 degrees and ended as a SPIN after 4 s; on
this repository's car it read 86 with steering and ran past 100 without. And there was nothing to switch
off.

Changed (`angle.js`, the settings): a workshop setting, "Forward acceleration: Use / Leave out". Left
out, the engine does what it does on a car that sends none. The same drift is then within 2.7 degrees with
steering and 3.1 without (there flagged ANGLE UNSURE: nothing but the sum is left). Whether a car's
forward acceleration is a sensor's reading is still not known; the first-car list says how it would show.

**5. All of CDS2 stopping was never noticed.** The engine took a source as lost when it was silent while
another one moved. The yaw rate and both accelerations come from one interface, and when all three stop
nothing moves. On the second reviewer's stand-in car, CDS2 cut 2.5 s into a held drift (its
notifications and its getters, or its service down as the kit says it): 28 s later, on the straight, the
screen still said DRIFT with 30 degrees LEFT and 2850 points counting. The record was 3374 points, grade
S, 36 s, no flag, and it set all four bests. With the service down on the straight before a drift the
screen said "0 degrees, STRAIGHT, READY" through the whole drift. With the three fields reading the
car's "no value" the screen showed the same for 33 s and the drift was at least flagged.

Changed (`angle.js`, `session.js`): the app tells the engine how old a CDS2 yaw rate and a sideways
acceleration may be on the move: 2.5 s, with the car at 10 km/h or more for all of that time. The app can
say so because it reads those getters as soon as fewer than 16 notifications arrived in 2 s.

After it, on the reviewer's car: the drift ends 2.5 s after CDS2 stopped (273 points for 5.6 s, where the
whole drift was 368 for 7.4), flagged DATA GAP, no best, in all three ways of stopping; and NO YAW RATE
FROM THE CAR on the straight. The reviewer's suggestion was 1.5 s, and "lost at once" when the kit says
the service is down. Neither was done: see "Asked for and not done".

**6. A car could become "learned" from slides alone.** Drifted in steady circles both ways on a wet pan
before anything was learned, the reviewer's car counted as "learned" after 20 moments with K 6 to 24 % low
(the cosine of the angle) and a spread of 0.0 %, and UNCALIBRATED no longer showed. The wheel-speed guard
is blind while the rear wheels spin by about as much as the angle's cosine takes off (15 % at 30 degrees).
Part 1 said "with wheel speeds none is taken".

Changed (`learn.js`): a second in which the forward acceleration felt is more than 0.5 m/s2 (or a fifth of
the sideways acceleration, if that is more) from the speed's own change is no moment. A car that slides
feels its turn in its forward acceleration; a car that grips feels next to none.

After it: no moment in any of the reviewer's 28 slides, with and without wheel speeds, scripted and
driven, and none in the test's. What ordinary driving teaches is as it was to the last figure of the
table in part 1. That is on flat ground and with a forward acceleration whose zero is right: on a climb
of 4 degrees the same test left the steering with no moment (part 4, which takes the offset out first). Still open on a car with neither wheel speeds nor a forward acceleration (point 10 of
part 1's list).

**7. A yaw zero that is 1 to 2 degrees a second off let the angle run to its limit on a straight.**
Between 1 and 2 degrees a second of apparent yaw rate nothing held the sum: rest wanted less than 1, the
steering check 2 or more, the acceleration check 3 m/s2. With the zero 1.2 degrees a second off what was
learned and the app opened on the move, the angle read 217 degrees after three minutes of going straight
on this repository's car (and the limit of 220 on the reviewer's), until the car next stood still. A long
gentle bend banked by 3 degrees did the same with no fault at all.

Changed (`angle.js`): the angle is held at rest while the yaw rate is under 2 degrees a second and steady,
with next to no sideways acceleration and the steering near its centre. The zeros are still only trimmed
under 1 degree a second: between 1 and 2 it may be a zero that has moved and it may be a gentle bend, and
a bend must not be learned as a zero.

After it: 1.1 and 1.6 degrees shown in ten minutes straight with the zero 1.2 and 1.8 degrees a second
off (the test: 1.3 with 1.5 off), 0.3 on the banked bend. A zero that is off stays off until the car
stands or goes straight with less than 1 degree a second showing.

**8. Smaller ones.**
- The Drift tab showed "DATA RATE 10/s" with no data at all: the engine's stand-in for a rate it does
  not know. It shows "--" now, and also once the motion data has stopped (it showed the rate from
  before).
- The first-car list told the tester to press the DSC button once to see what its signal reads. That
  line is gone: the list now says to note what the row reads and to leave the button alone.
- A comment in `car.js` read as if a spelling had been found on a car. It is the interface catalogue's.
- The first-car lists did not say where the driving is done. Both now say: on closed ground, all of it.
- A comment in `gpscheck.js` said nothing of the GPS check is saved. A ratio and a count are, with a
  drift (part 2 says why). The comment says so now.

### What the changes cost

Laid beside the tables from before, cell by cell:

- **The angle did not move in any drift cell of the test's tables**, clean or dirty. What moved in them
  is listed above them. In the reviewer's probes of real drifts (held drifts, circles, switches, entries,
  the lock, the score) only flags changed. In the reviewer's fault table one row moved, for the better:
  with the yaw zero 1.5 degrees a second off what was learned, 7.4 and 7.8 degrees of error became 2.1
  and 2.5 (part 4: this said at first that no cell of the probes moved).
- **A drift during which the first line for the yaw rate is drawn is no longer counted.** That needs a
  car that has learned nothing and is drifted at once. It was counted and flagged UNCALIBRATED before.
- **After the first line is drawn in a long corner, the angle shown starts again from zero** and reads
  the car's own small angle low (2.1 degrees for the rest of a long corner in the test), with 10 degrees
  more ± until the next straight.
- **Without steering a drift whose acceleration check speaks later than a second after the start angle
  was reached counts from later.** No drift of the test or of the probes was touched by that. That was
  wrong beyond them: where the check never speaks, a real drift was not counted at all (every drift on
  grip 0.15 on the re-check's car, and large angles on grip up to 0.3). Part 4 changed the rule.
- **The GPS check takes no "straight" figure while nothing is learned.** It asks the angle whether the
  car goes straight, and there is no angle then (7 sentences of 124 fewer in one of the second
  reviewer's drives).
- **With 7 degrees allowed, drifts that were flagged by the old 5 and deserved it are no longer
  flagged.** The old limit did not know them from clean ones. They are the cases of "Found and not
  solved": a car learned on cambered corners (a drift read 10 degrees low, 410 points for 634, no flag
  now), front tyres softer than the guess (5 degrees low), a steering source gone silent (11.9 for 13).
  Two rows of the reviewer's fault table as well (part 4 names them): a yaw sensor that reads no more
  than 40 degrees a second (a held drift 13.4 degrees off with steering) and a yaw rate that reads 5 %
  low (the long circle 8.2 off). And banked corners on a climb, which is part 4's first point.

### Tried and taken out again

- **Letting the acceleration check hold the angle back between 1.5 and 3 m/s2** (pull the sum down to
  it, never up). It kept the angle shown small on a banked corner. It also cost clean drifts: the
  check runs a moment behind the angle while the car turns in, and the handbrake entry without steering
  went from 1.3 degrees of error to 2.2 to 3.4. Taken out.
- **Widening the ± by how far the two checks are apart**, so that a drift in which they disagree is
  flagged. It put the ± of ordinary drifts at 7 to 8 degrees, right at the flag's limit: the long circle
  with dirty data was flagged at 5 and 10 samples a second and not at 20 and 50. A flag that flickers
  says nothing. Taken out.
- **Starting a drift only from the moment the check sees it.** Simpler than waiting, and it cost every
  drift without steering 0.05 to 0.2 s of its time. Replaced by the wait.

### Asked for and not done

- **Lost at once when the kit says the CDS2 service is down.** What the kit's "available" says on a car
  while data still flows is not known, and a drift ended by a flag that flickers would be worse than one
  ended 2.5 s late. The age of the samples is evidence; the flag is hearsay. With the service down no
  sample arrives, so the 2.5 s cover it.
- **1.5 s instead of 2.5 s.** The app reads a CDS2 getter only once fewer than 16 notifications arrived
  in 2 s, so on a car that sends 50 a second a reading that simply holds still is up to about 2.3 s
  old before the first read comes. 1.5 s would call that lost.
- **A rule for the steering at its lock** ("remember the largest wheel angle seen, and say nothing near
  it"). In a held drift the largest angle seen IS the one being held, so the rule would switch the
  steering check off in every first drift. Not built.
- **Blending the two checks, or an understeer term in the steering's line.** Both change what clean
  drifts read. Left as it is and written down.
- **Taking the sideways zero again at every standstill**, in place of once at the first. A car that
  stands on a cross slope at every stop would then carry that slope onto the flat each time. With the
  angle dropped at the first line, a start on a slope no longer counts anything, and once the car is
  learned, rest trims that zero. Left as it is.
- **K from one drive to the next on the Signals tab.** The tab shows K against the default, and the log
  has every "learned" line. It keeps no history. The first-car list asks for the two to be compared by
  hand.

### Found and not solved

Every one of these is in "Where the estimate is poor" in part 1 with its figures (points 4, 10 and 16 to
20), and in the README.

- With steering the angle is only as good as the guess at the front tyres: 3 to 7 degrees low on a
  softer front axle, and no flag. The steering's scale is learned 5 to 24 % low on such a car (understeer
  in a gentle corner looks like steering), which is part of it.
- With the front wheels at their lock the steering check pulls the angle down by 6 to 13 degrees between
  about 42 and 52 degrees of drift, and no flag says so.
- A car learned on cambered corners has K 8 to 15 % low and says "learned".
- On low grip without steering the angle is the bare sum.
- The angle shown on a banked corner without steering, and the flagged drifts there with dirty data.
- A yaw rate that jumps by 3 degrees a second or more and stays, on a car without steering: the angle
  shown runs to its limit on a straight. After part 3 nothing was counted there (it had been: 3415
  points, grade S, flagged SPIN only). Since part 4 it is counted again, because a drift without
  steering may start on the sum where the acceleration check cannot speak: 3415 points, grade S, now
  flagged NO STEERING CHECK and SPIN, so no best (part 5).
- A yaw rate or a sideways acceleration stuck at a value that is still sent every slot looks alive. A
  corner in which the yaw rate stuck for 8 s read 60 degrees and was counted (292 points, flagged ANGLE
  UNSURE, with steering).
- The second yaw source (the chassis one) dying in a steady drift is noticed only when the sideways
  acceleration next moves.
- On a car whose CDS2 getters do not answer, or answer slower than half a second (part 4: such a read
  is thrown away), and whose sensors hold still to the last count for more than 2.5 s on the move, the
  app would say NO YAW RATE FROM THE CAR while nothing is wrong. On the stand-in car a sensor's reading
  flickers. Whether a car's does is not known.

### Can the new checks fail

The changed app was broken in 19 ways, one at a time, in a scratch copy, and both tests run on each: the
angle not dropped at the first line; the tracker ignoring that; an angle shown while nothing is learned; a
drift without steering starting on the sum alone; a drift waiting for the check for ever; no flag where
neither check held; the check worked out from 3 m/s2 only; the check pulling from 1.5; 5 degrees allowed
again; rest under 1 degree a second only; the zeros trimmed up to 2; learning whatever the forward
acceleration says; the new setting doing nothing in the engine; the setting not handed on; no age limit
for the yaw rate; none for the sideways acceleration; the age limit holding for a car that has just pulled
away; the app not telling the engine the limits; an unknown data rate shown as 10 a second.

17 of them made between 1 and 7 checks fail at first. Two were not noticed: the zeros trimmed up to 2
degrees a second (no scene had a gentle bend long enough to move a zero), and no age limit for the
sideways acceleration (where all of CDS2 stops, the yaw rate's limit speaks first). A check was added for
each: a bend of 1.5 degrees a second held for half a minute, and the sideways acceleration stopping alone
in a held drift. Each of the two now makes one check fail. The script is in the checks folder, not in the
repository.

### What was not done, in this part

- Nothing ran on a car, a head unit or Node.js 8.
- `kit/`, the other three apps and their tests were not touched.
- The reviewers' cars are not in the repository, and neither are their probes: the test's own made-up
  car was given the scenes that showed each fault (banked corners, a car scaled 2.5 times finer, long
  shallow drifts, a circle on grip 0.3, drifts at the steering's lock, ten minutes straight, slides both
  ways on a wet pan, a forward acceleration worked out from the speed, CDS2 cut as a whole).
- No random fleet of cars, as before. Each new check is one run of one scene.
- The ± was not made to cover the reviewer's car (point 11 of part 1's list).

## 4. What a re-check found

Part 3 was read and tried again by a checker who had not written it: both reviewers' probes on the files
before and after part 3, and eight probes of the checker's own. The verdict was "fix first". One finding
of part 3 was closed on level ground only, three of its cures had broken something else, and a fault of
stage 1 had come within reach of one of them. This part says what was found, what was changed, what it
cost and what is left. All of it is from a PC and from made-up cars, as everything in this record.

Each finding was run again first, with the checker's own probe on the files as part 3 left them. The
eight probes gave the checker's text (but for the folder's name in their first line), and the first
reviewer's 16 number probes and five bench probes of the second gave theirs to the last character. Then
the files were changed. After every change the test's tables and all of those probes were run again and
laid beside the ones before, clean data first. The probes are not in the repository.

### What was found, and what was changed

**1. A banked corner that climbs was still counted as a drift on a car without steering, with no flag.**
Part 3 let a drift without steering start only once the acceleration check had seen the angle. That check
reads the forward acceleration against the speed's own change. Where the forward acceleration reads a
little MORE than the speed's change, the check "sees" a banked corner's false angle. A road that climbs
does exactly that (g times the sine of the grade: 0.51 m/s2 on 3 degrees), and so does a zero that is off.
On this repository's car, without steering, clean data otherwise, with the forward acceleration reading
0.51 m/s2 more: four of five banked corners were counted with no flag (449 C, 539 B, 800 B, 478 C). With
0.85 more: 377 C, 494 C, 758 B, 640 B, no flag, and a FLAT corner too (0.45 g at 70 km/h: 152 C). On the
first reviewer's car with a climb of 3 degrees in the corner itself: 550 B, 452 C, 818 B, no flag. Some of
those were flagged before part 3: its limit of 7 degrees took the flag off. Part 3's "On clean data none
of that was counted" was true of the level corners it tried.

Three rounds had now tried to tell such a corner from a slide by tuning the acceleration check. It cannot
be told that way: to that check both are forward and sideways acceleration that the car's turning does
not explain. So the rule is made true by construction (`drift.js`, `angle.js`): **a drift that the
steering did not back is no best.** It is counted, scored, shown and saved like any other, and it
carries a flag of its own, NO STEERING CHECK.
- The steering backs a drift at a moment when it can be used and says that the car oversteers: the car
  turns 1.5 degrees or more, at the front wheels, further than it is steered, and at least half of what
  its path asks of the wheels. A car that grips through a banked or a climbing corner is steered as far
  as its path asks, whatever its accelerations read. It must do so for half of the drift's time.
  (That sentence holds for a car that does not oversteer while it grips: part 5, point 4.)
- It cannot be used where "Steering check" is off, where the car gives no steering angle, where the
  steering has gone silent (point 6 below), and while its scale is not "learned" yet. The check itself
  already pulls on a scale that is still "learning"; a best has to wait for "learned".
- The acceleration check is still a help for the angle. It vouches for nothing any more and takes no
  flag away: ANGLE UNSURE is the ± alone again.
- The Drift tab says so in a standing line under the drawn car for as long as it holds (for example
  STEERING NOT LEARNED YET: DRIFTS ARE SCORED, NONE SETS A BEST; since part 5 it ends ": NO BEST IS
  SET"), the DRIFT banner says "No steering
  check: this drift is scored, and sets no best", the Signals tab says which of the four reasons it is,
  and the log has the share of each drift's time that the steering backed.

After it, on this repository's car without steering, clean and dirty: six banked corners of 3 to 12
degrees and two flat ones, on the level, with the forward acceleration reading 0.26, 0.5 and 0.85 m/s2 too
much, and on climbs of 3, 5 and 7 degrees that begin with the corner (112 runs). 56 drifts were counted,
every one flagged NO STEERING CHECK, none a best. With steering none of the 56 clean runs counted
anything, and none showed more than 4.6 degrees. On the checker's own probes: every drift that is still
counted in a banked or climbing corner without steering carries the flag.

**They are still counted.** On clean data: 2 of the 8 corners on the level (the two gentle banked ones,
see point 2), the same two with a forward zero that is off, and 21 of 24 on a climb that begins with the
corner. Such a "drift" shows on the screen and in the session's total. Not solved, and it cannot be
without a steering angle.

**On a car that gives no steering angle no drift becomes a best.** That is the price of the rule, and
it is to be looked at again with the first car's data.

**2. Real drifts on low grip were no longer counted without steering.** That was part 3's rule at work:
where the car feels less than 1.5 m/s2 sideways the acceleration check cannot speak, and a drift that it
had not seen did not start. On the checker's car, learned, without steering, clean data: 9 of 24 real
drifts on grip 0.15 to 0.4 were not counted at all (every drift on grip 0.15, 45 degrees and more on grip
0.2, 60 degrees on grip 0.25 and 0.3), and the screen showed the right angle and READY. Before part 3 all
24 were counted. On this repository's car the same: a drift held at 30 degrees with 0.15 g across its
path, and one of 60 degrees with 0.24 g, were not counted.

Changed (`drift.js`): where the check cannot speak, the drift starts on the summed angle, as before part
3. Where it can speak and, for more than half of the time in which it could, did not see the angle, it
speaks against a slide and nothing starts, as in part 3 (the wait of a second at most is kept).

After it: all 24 of the checker's drifts are counted again, and the two of the test, clean and dirty,
each flagged NO STEERING CHECK. The price: a gentle banked corner where the car feels under 1.5 m/s2 is
counted again as before part 3 (on this car 1325 A and 4053 S), now flagged and no best.

**3. After the first line was drawn nothing could start until the car had gone straight, and the screen
did not say so.** A driver who learns the car by circling left and right on a pan and then drifts with no
straight in between got nothing counted, with the banner on READY, THE CAR: LEARNED, and the right angle
on the screen (checker's car: a drift of 30 degrees for 10 s, 581 points by the rules, not counted;
before part 3 it was 584 B).

Changed (`drift.js`, `screens.js`): the engine's view says when nothing can start ("blocked": after a
spin, after an angle that was lost, after what was learned changed), and the banner then reads GO
STRAIGHT FOR A MOMENT, "No drift is counted until the car has gone straight". It comes before the
learning banner, so the screen no longer says "Drifts are scored" while none can be. The block itself is
as it was: it is lifted by 0.7 s of straight, or by the car coming under 10 km/h. Lifting it after a
steady corner with a small angle was thought of and not built: the block is what keeps the first corners
of a first drive from counting (part 3, point 2), and a second way out of it would have to be shown
harmless on every one of those cases first.

After it: the pan case is in both tests. No straight: not counted, the banner showing for all of the
drift. With 1.5 s of straight before it: counted (522 B in the engine's test).

**4. Learning died on a climb, and with a forward-acceleration zero that is off.** Part 3's test "no
moment where the forward acceleration felt is 0.5 m/s2 from the speed's change" also turned down
gripping corners on a road that climbs or falls. On this repository's car, ordinary drive, with the
forward acceleration reading 0.7 m/s2 more (a climb of 4 degrees): the steering got no moment at all,
and the yaw rate 23 in place of 85. With 1.0 more: the yaw rate 10 moments on clean data and none with
the dirty set's sensor faults. On the checker's car: 16 steering moments in place of 53 with 0.55 more,
none with 0.7. A car in that state is "without steering", which is what points 1 and 2 are about.

Changed (`angle.js`, `learn.js`): what the forward acceleration reads more than the speed's own change
is measured where the car goes straight (at rest, over 0.7 s, with the speed changing by no more than 2
m/s2 and the two halves of that stretch within 0.5 m/s2 of each other). The first looks are averaged as
they come, so one straight of a second is enough; from then on the figure follows with a time constant
of 2 s. It is taken out of the forward acceleration before learn.js's "no slide" test and before the
acceleration check. The Signals tab shows the figure in use and how many seconds the "no slide" test
turned down.

It is also taken out of the sum itself, which was not asked for. Taken out of the two checks alone, a
long circle with steering still read 5.9 degrees off with 0.85 m/s2 of offset (the sum takes the forward
acceleration times the sine of the angle), and drifts without steering with an offset the other way got
worse (2.0 to 2.6 degrees on the held drift, 2.7 to 3.8 on the circle) because the two errors had partly
cancelled. With the sum corrected too, a held drift, the long circle and the switches read within 0.3
degrees of what they read on the level, with 0.85 m/s2 more and with 0.51 less, with and without
steering.

After it: with 0.5 to 1.0 m/s2 more, or 0.7 less, the ordinary drive teaches what it teaches on the flat
(85 yaw moments and 36 steering moments on clean data; within 4 of that on dirty; K within 0.3 %), and
the offset in use ended within 0.05 m/s2 of what was put in (0.15 on dirty data). On the checker's car
every row of the checker's probe gives the flat run's moments (86 and 53 on clean data, 95 and 53 with
the reviewer's dirty set). Slides are still not learned from: the first reviewer's two slide probes give
"no moment" on every line they did before, and so do the test's, also with the forward acceleration
reading 0.6 m/s2 more or less (the "no slide" test turned 16 to 48 seconds down there).

What is left: **a grade that begins or changes inside the corner.** The offset is the last straight's.
A corner that starts to climb as the car turns in still reads as the forward share of a slide: to
learn.js (no moment there), and to the acceleration check (the false drifts of point 1, flagged). And a
car that never goes straight has no offset at all. In figures, from the second check (part 5), on a
checker's car with clean data, for a grade that comes and goes with every corner of the ordinary drive:
with 3 degrees the drive gave 47 yaw moments in place of 86 and 46 steering moments in place of 53;
with 5 degrees the yaw rate stayed "learning" with 10 moments and the steering got none, four corners of
the drive were counted as drifts of 14 to 85 points (each flagged UNCALIBRATED and NO STEERING CHECK),
and a real drift after it was flagged the same; with 7 degrees nothing was learned, and the real drift
after it was not counted.

**5. The same sawing drift scored differently depending on where its count began.** `score.js` took a
direction for the angle only once it had moved 5 degrees from the FIRST sample of the count. A count
that began inside the sawing never got one, and the whole drift was scored as perfectly smooth. 30
degrees plus and minus 4 once a second at 50 km/h for 20 s: 934 points with 39 reversals counted from the
start angle on, 1440 points with no reversal counted from a second later. Part 3's wait could drop the
first second of a drift without steering, which is how the engine reached it (checker's circle on grip
0.2: 2101 points with no reversal, where the rules give 1982).

Changed (`score.js`): while there is no direction, the lowest and the highest angle counted so far are
kept, and the angle has a direction once they are 5 degrees apart. After it: 39, 38 and 38 reversals
counted from 0, 1 and 1.25 s (934, 875 and 853 points; the later counts are shorter). (Part 5: from
other moments the count is up to two short, not one, of what the count from the start angle finds
after the same moment.) **No other
drift's score changed through this**: with nothing but the new `score.js` on the files of part 3, every
table of the test and every line of the 16 number probes and of the checker's probes is the same, but
for that circle (1910 points with 14 reversals) and the probe of the rule itself. With point 2 the
circle is counted from its beginning again and scores 1957 with 15 reversals, as before part 3.

**6. A steering source that goes silent, found on the way.** Point 1 only holds if "the car gives no
usable steering angle" is noticed. A steering that stops arriving looked like a wheel held still (part
2, "Where the app is weak", point 4): on a banked corner such a car would have "backed" a false drift
with a wheel that seemed to stand straight. Changed (`angle.js`): the steering counts as silent when it
has said nothing for 2 s or more and, since its last sample, the car has both gone straight (under 2
degrees a second of yaw) and turned (the yaw rate moved by 6 degrees a second or more). It is then not
used, here or at rest, and backs nothing, until it speaks again. The first form of the rule ("nothing
for 2 s while the yaw rate moved") took a healthy wheel held at its lock for silent on a car that sends
on change only (silent for 72 to 75 % of drifts held at 46, 58 and 70 degrees); the car having gone
straight as well was to tell the two apart. (Part 6: it did not where the car's nose stops turning in
the middle of a drift at the lock, in a lift or a straight slide. There the healthy wheel was still
taken for silent, the car for at rest, and the drift was cut in two. "Gone straight" now also asks for
less than 20 degrees of angle shown: part 6, point 1.) After it: with the steering cut on the straight before,
drifts of 30 and 13 degrees and the long circle are read within 1.0 degrees (the one of 13 read 11.9
before, with no flag), opposite lock says "not known" (it said 0), and each is flagged NO STEERING CHECK.
Still open: a steering that dies in the middle of a corner is believed until the car has gone straight
(part 5, point 3, says what that does to a drift, and point 1 adds a rule for a value that sticks and
is still sent; part 8, point 2: since part 6 that straight has to show less than 20 degrees, and after
a drift at the lock that fades out slowly none does).

**7. With steering, a slow and tight banked corner is counted too. Found on the way, not solved.** The
steering check holds the sum down in a banked corner by pulling it to the steering's angle within a
second. A steep bank at a low speed outruns that. On this repository's car, WITH steering, clean data:
12 degrees of bank at 0.25 g and 30 km/h showed 11.5 degrees and counted 159 C; 10 degrees at 0.2 g and
25 km/h showed 11.2 and counted 169 C. From 15 degrees of bank at 30 to 35 km/h the angle shown ran to
its limit. In all of them the steering said the car goes where it is steered (it backed 0 % of the
time), so each is flagged NO STEERING CHECK and none is a best. That is also why the rule asks for half
of what the path asks of the wheels and not for 1.5 degrees alone: with the steering's scale known 24 %
too small (the first reviewer's softer car learned it 5 to 24 % low), tight corners looked like 1.6
to 3.2 degrees of oversteer, and the steering "backed" such a false drift for all of its time.

**8. Smaller ones.**
- The age rule for CDS2 (part 3, point 5) says NO YAW RATE FROM THE CAR, wrongly, on a car whose
  readings hold still to the last count for 2.5 s on the move while its getters do not answer, OR answer
  slower than half a second (such a read is thrown away). Part 3 and the README said only "do not
  answer". The words are put right. The rule itself is as it was: see "Asked for and not done".
- Part 3's cost list (below, in part 3) names two more rows that lost a flag they had by accident, and
  no longer says that no cell of the probes moved.
- The Last tab's sentence for DATA GAP now reads "samples were missing, or the angle was lost, during
  the drift or just before it": the flag is also given where a drift ends because the angle was lost.

### What the changes cost

Laid beside the outputs from before, cell by cell.

- **Clean data, with steering.** No drift gained the new flag: none in the test's two tables with
  steering (17 scenes at four rates, clean and dirty; the steering backed each drift for 87 % of its
  time or more) nor on the other two cars, and none of the first reviewer's clean drifts with steering.
  A drift held at 58 degrees with the wheels at their lock is not flagged either: the check is not
  believed there, but the steering still says that the car oversteers (it backed 94 %). Of the angle:
  two cells of the test's clean table moved in their last figure (the long circle: 1991 to 1990 points
  at 10 samples a second, a peak of 36.1 to 36.2 at 20), because the offset is a few thousandths of a
  m/s2 on clean data. In the first reviewer's held drifts and other scenes no clean cell of the worst
  error moved after learning; before learning three moved by 0.1. (Part 4 said here that nothing moved
  in the reviewer's clean cells with steering. Part 5: six cells of the reviewer's learning probe did,
  for the same reason. A drift's score went from 344 to 343 three times, from 534 to 530 and from 243
  to 245, a peak from 19.5 to 19.4, and a worst error from 4.1 to 4.4 and from 3.0 to 2.8. One drift
  of the re-check's own probe went from 558 to 557.)
- **Clean data, without steering.** Every drift carries NO STEERING CHECK. No angle moved in the test's
  table; in the reviewer's, two cells in their last figure.
- **Drifts with steering that are flagged now, and were not:**
  - A car whose yaw rate is learned and whose steering is not. The steering is learned from slow,
    gentle corners (12 to 60 km/h, 0.5 to 2.5 m/s2). After 3.5 minutes of ordinary corners at 44 to 100
    km/h the test's car had the yaw rate "learned" and no steering moment, and its drift was flagged.
    The same in the checker's pan case: circles at 0.3 g teach the steering nothing, and the drift
    after them (579 B, no flag after part 3) is flagged.
  - A drift with the steering's scale still "learning" (12 moments of 14 in the test).
  - "Steering check: off". Part 3 offered it as the way round the fault at the steering's lock. The
    angle is right there with it (within 1.8 degrees at 46, 50 and 58 degrees), but no drift is then a
    best.
  - Two that carried other flags already: a car that had learned from corners one way only, and the
    first reviewer's "front sliding too" drift.
- **Dirty data** moved, because the forward acceleration's offset is taken out (this repository's
  dirty set has -0.09 m/s2, the first reviewer's +0.13).
  - The test, after learning, with steering, at 20 samples a second: better or the same in every
    drift scene but one (held 1.8 to 1.5, the long circle 2.7 to 2.1, the switches 3.3 to 3.2). The
    circle on grip 0.3 has a worst error of 2.0 where it had 1.5, with a typical one of 0.3 where it
    had 1.1.
  - The test, without steering, at 20 samples a second: the drift scenes better by 0.2 to 0.4
    degrees. The two hard banked corners read 0.7 to 1.3 degrees MORE (8.2 to 8.8 on 12 degrees of
    bank, where it was 7.2 to 7.5): the dirty set's forward zero had been holding that angle down by
    accident, and they are now nearer to what they read on clean data (9.5).
  - The first reviewer's dirty set, with steering: of the 140 worst-error cells of the held drifts and
    the scenes that moved, 134 are better (by up to 0.8 degrees in a held drift on dry ground; a
    drift of 60 degrees held for 20 s in the wet that had run 17.9 to 24.2 degrees off at the four
    rates is within 3.8 to 8.4), and the ± covers the
    error more often (42 to 49 % on a held drift of 40 degrees, and 51, 65 and 73 % to 100 % in three
    other scenes). Without steering: of the 133 that moved, 99 are worse, by up to 1.6 degrees (a
    drift held at 10 degrees in the wet). The 40 second circle on grip 0.3, which is the bare sum, is
    among the 34 that are better: 16.2 to 19.1 degrees off at the four rates before, 13.3 to 17.3
    after. That set's forward
    zero had cancelled part of what its body roll does to the acceleration check. (These counts and
    the two figures in brackets were counted again in part 5 with the second check's script; part 4
    had 137 and 122, 130 and 95, "22.7 off is within 3.8" and "3.4 worse in the circle".)
  - **Drifts held just over the start angle were lost with it** (part 5). The same set, without
    steering, in the wet, held at 10 degrees (10.3 at its peak) for 3, 8 and 20 s, at 20 samples a
    second: before part 4 the first and the last were counted (34 and 399 points), after it none of
    the three. The angle there reads 1.2 to 1.5 degrees low on average where it had read 0.4 to 0.5
    low, and so stays under the start angle.
  - Two of the reviewer's drifts at the steering's lock lost a switch they had been given by mistake at
    their end, and score less for it (1205 to 1019 and 780 to 616, where the rules give 1315 and 766).
- **Without steering a real drift on low grip is counted again**, and so is a gentle banked corner
  (point 2). On the wider grid of the second check (part 5: 336 corners with full grip on each of
  four made-up cars, banks up to 20 degrees, 0.15 to 0.8 g, 25 to 110 km/h, level and climbing) about
  twice as many are counted without steering as before part 4: 203, 204, 197 and 210, where it was
  91, 94, 86 and 102. Before, 40, 41, 38 and 44 of them carried no flag; now every one is flagged.

### Asked for and not done

- **The age rule for CDS2 applied only once a top-up read of the field has been kept.** It was built as
  asked and run on the second reviewer's bench. It did what it was for: with sensors that hold still
  and getters of 600 ms or slower the held drift was whole again (663 points; with the rule 135,
  flagged DATA GAP). But it reopened part 3's point 5: on a car whose sensors flicker the top-up never
  runs, so no read is ever kept, the rule is never armed, and CDS2 stopping in a held drift went
  unnoticed again (3370 points, grade S, no flag, where it is 273 with DATA GAP). Taken out; the rule is
  as part 3 left it, and only the words were put right. One read of each getter early in every drive
  would arm it on every car whose getters answer. That is a new kind of read towards the car and was
  not built.
- **Lifting the block after a steady corner** (point 3).

### Found and not solved

- Without a steering angle a banked or a climbing corner taken with full grip is counted as a drift:
  flagged, no best, but on the screen and in the session (point 1).
- With steering a slow, tight banked corner is counted as well, flagged the same (point 7).
- On a car that gives no steering angle no drift becomes a best (point 1).
- A grade that begins or changes inside a corner (point 4).
- A steering source that dies in the middle of a corner is believed until the car has gone straight
  (point 6; part 8, point 2: since part 6 only on a straight with less than 20 degrees shown). So a
  drift during which the steering dies keeps the wheel's last value to its end: it
  carries no flag, it can set a best, and its opposite lock and its angle follow that last value
  (part 5, point 3, with the figures).
- The rule "no best without the steering" rests on a car that does not oversteer while it grips. On a
  made-up car whose rear slips well beyond its front in a hard corner, banked corners taken with full
  grip were counted with steering, and a few of them without any flag (part 5, point 4, with the
  figures).
- A yaw rate that jumps on a straight, and a bumpy straight at a low data rate, are counted as drifts
  again on a car without steering, flagged and no best (part 5, point 5).
- A lone speed reading of 0 was taken as real in one case, which ended a drift as a SPIN that was none:
  a speed that had not changed for seconds (held to the last count, sent on change only) under 45 km/h.
  The step that is held back as a lone wrong value grows with the time since the last sample
  (`series.js`), and after a long silence 45 km/h pass. Found while the low-grip scenes were written;
  it is as old as stage 1 and was not changed. The app hands the engine the getter's speed series while
  the getter answers, which comes ten times a second, so there it needs a car whose speed is only
  notified.
- A drift held at 50 degrees on clean data that is sent on change only ended after 2.7 s, flagged DATA
  GAP: the sideways acceleration held still to the last count for 2 s while the yaw rate moved, and was
  taken as lost (part 1's rule). As old as stage 1, seen in a probe of this part, not changed.

### Can the new checks fail

What this part changed was broken in 29 ways, one at a time, in a scratch copy, and both tests run on
each: the steering backing a drift although it cannot be used; no flag given; backing without the 1.5
degrees, without the share of the path, with a quarter of the time, with a scale still "learning";
nothing starting where the check cannot speak (part 3's rule); the check stopping nothing; the view
never saying "blocked"; no banner; learn.js, the acceleration check and the sum each not taking the
offset out; the offset never measured, or followed slowly from the first look; the turned-down seconds
not counted; the score's old rule; a silent steering never noticed, noticed without the car having gone
straight, or still used; the saved file dropping the new flag; no sentence on the Last tab; no standing
line, or one that also shows while nothing can start; the DRIFT banner, the Signals tab's reason, its
offset and the log's share missing; the old DATA GAP sentence. Every one made between 1 and 31 checks
fail. The script is in the checks folder, not in the repository.

### What was not done, in this part

- Nothing ran on a car, a head unit or Node.js 8.
- `kit/`, the other three apps and their tests were not touched.
- The checker's probes and cars are not in the repository. The test's own made-up car was given the
  scenes: banked and flat corners with a forward zero and on a climb, tight banked corners with
  steering, two drifts on low grip, a skid pan with and without a straight, an ordinary drive with a
  forward zero and on a climb, slides with a forward zero, a steering that stops, a steering sent on
  change only at its lock, and the sawing angle counted from three moments.
- The made-up car has no grade in its motion. A climb is the forward acceleration reading g times the
  sine of the grade more, all the time or through the corner only.
- No random fleet of cars, as before. Each new check is one run of one scene.

## 5. What a second check found

Part 4 was read and tried again by two checkers who had not written it. One took the numbers: every
earlier probe on the files before and after part 4, and probes of their own on the first reviewer's
made-up cars and on some of their own, one of them tail-happy on purpose. The other took the app and
the words: the built app on the stand-in car in every case where the steering backs nothing, every
added line of these notes, 36 of the pictures. Both said "good as it is", and both left a short list.
This part is that list: what was found, what was changed, what it cost and what is not solved. It is a
narrow round. All of it is from a PC and from made-up cars, as everything in this record.

Every probe named below was run again first on the files as part 4 left them: the first reviewer's 16
number probes, 9 of the re-check's, 18 of the numbers checker's and 5 of the app checker's (49 outputs).
Each gave its author's text to the last character, but for the folder's name in its first line. After
the changes all of them and the test's tables were run again and laid beside the ones before. Where a
figure of part 4 is put right below, the probes were also run on the files as part 3 left them. The
probes are not in the repository.

### What was found, and what was changed

**1. A steering value that sticks and is still sent was believed.** Part 4's rule for a silent steering
asks whether samples arrive. A value that is frozen and sent in every slot passes it. Stuck at 9 to 14
degrees at the wheels, it made every corner with full grip that turned away from that side look like
opposite lock: the steering check pulled the sum toward it, the steering "backed" the result for 55 to
61 % of its time, and the false drift carried no flag. On the checker's two cars 19 of 42 such cases
counted a drift, 7 of them with no flag (343 to 662 points) and up to 19.8 degrees shown; on this
repository's car 5 of 18, 3 with no flag (458, 698 and 846 points). It is as old as the steering check.
A source that is sent on change only goes silent when it sticks, and part 4's rule sees that.

Asked for: the silent rule's own test on a value that has not MOVED by a count (2 s, and since it last
moved the car has both gone straight and turned), whether samples arrive or not, on condition that no
clean drift with steering gains a flag or changes its score. Built in that form first, it closed every
one of those cases, and it did not keep the condition:
- A clean drift with steering changed its score: the re-check's drift of 60 degrees on grip 0.25, the
  wheels at their lock, went from 908 to 909 points. As a car comes out of such a drift its yaw rate
  runs through zero while the wheels are still at the lock, and for that moment the wheel was taken
  for stuck.
- The bumpy straight of the test's table with steering read worse, 3.6 degrees at 5 samples a second
  where it had read 3.0: the made-up wheel does not move by a count on a straight while the yaw rate
  shakes by more than 6 degrees a second.

So more is asked of a value that is still sent than of one that is silent (`angle.js`, `_stuck`). It
counts as stuck when
- it has not moved by one count for 2 s or more, and in that time
- the car has gone straight for 0.7 s at 10 km/h or more (in both halves of that stretch the yaw rate
  within 2 degrees a second of zero, on average; parts 6 and 7 ask more of that stretch: the car must
  not be shown sideways at its end), and after that
- has turned for 0.7 s: in both halves the yaw rate 6 degrees a second or more and the sideways
  acceleration 1.5 m/s2 or more from its zero, all the same way.

Stuck, the steering is not used, in the check and at rest, and backs no drift, exactly as when it is
silent, until its value moves by a count. The engine has one word for both ("stale"), and the screens
have one text: the line under the drawn car reads STEERING SILENT OR STUCK, the Signals tab "Steering
check: the steering is silent or stuck" (they read STEERING SILENT and "the steering has gone silent").
The silent rule itself was not touched.

Why each condition is there, each with a check that fails without it (`test_drift.js`, "the rule on
samples of its own"): a yaw rate that only crosses zero is no straight (the wheels at their lock while
the car comes out of a drift or swings the other way); a standing car is no straight (a car that stands
with its wheels turned and pulls away in a circle); the sideways acceleration must turn with the yaw
rate (a yaw rate whose zero jumps by 8 degrees a second on a straight is not a turn: without this the
first reviewer's case of that jump, with steering and clean data, was counted as a drift on a straight,
832 points, where nothing was counted before); the turn must last (a rough or wavy straight); the 2 s
are those of the silent rule.

After it, on the files of this part:
- The checker's 42 cases on two cars: no drift is counted in any, and no more than 5.5 degrees are
  shown. This repository's car, 18 cases: none counted, 4.4 degrees at most. With the other sources
  dirty the same (five cases, none counted).
- The test (`fourcorners`, `cornerdrift`): stuck at 9, 12 and 14 degrees, three corners of 0.6 g with
  full grip count nothing and show 3.8 degrees at most (they counted 547, 667 and 547 points with no
  flag at 12 and 14 degrees, and showed up to 17.7). Stuck at straight ahead, an ordinary corner and
  then a drift of 30 degrees: the drift is read within 1.1 degrees without the steering, says "not
  known" for its opposite lock, and is flagged NO STEERING CHECK. When the value moves again the
  steering is used again.
- Through the whole app (`test_drift_car.js`): every steering source of the stand-in car goes on
  sending the value it had on a straight. After one ordinary corner the line STEERING SILENT OR STUCK:
  NO BEST IS SET stands under the drawn car, the Signals tab lists the source as "present, in use"
  with its rate and says "Steering check: the steering is silent or stuck", and the next drift is
  flagged and sets no best. With the sources alive again the drift after it carries no flag.
- In these scenes an honest wheel is not taken for stuck: at its lock for 10 s (46, 50 and 58
  degrees), in the long circle, in 40 s at 25 degrees, on a bumpy straight at 5 to 50 samples a
  second, in a slalom, a lane change, two switches or a handbrake entry (0 % of the time in every
  one). (Part 6: in every one of them the car turns steadily. Where its nose stopped turning for 0.7
  s in the middle of a drift at the lock, the honest wheel WAS taken for stuck, and the drift was
  flagged. This sentence said "An honest wheel is not taken for stuck: not at its lock ...". Put
  right in part 6, point 1.)

**2. Words on the screens.**
- The Last tab's sentence for NO STEERING CHECK gave one cause only: "no usable steering angle, so a
  banked corner cannot be told from a slide". The flag has a second case, and there the sentence was
  untrue: the steering is there, learned and switched on, and says that the car went where it was
  steered (part 4, point 7: a slow, tight banked corner with steering). It reads now: "NO STEERING
  CHECK: the steering did not back this drift, so a banked corner cannot be told from a slide." That
  is true in both cases. The test has the second case through the whole app: 10 degrees of bank at
  25 km/h, counted (127 points), flagged, no line under the drawn car, "Steering check: on" on the
  Signals tab, the new sentence on the Last tab, and "the steering backed 0 % of its time" in the log.
- The standing line under the drawn car was the smallest text of the app, 13 px. Its second half is
  shorter now, ": NO BEST IS SET" in place of ": DRIFTS ARE SCORED, NONE SETS A BEST", and it is 15
  px, as the other small texts of the Drift tab. Its longest form ends 135 px before the edge of its
  panel, at the PC's size and at both of the kit's sizes, and its letters begin 6.7 px under the
  lowest point the drawn car reaches. That drifts are still scored is said by the DRIFT banner ("No
  steering check: this drift is scored, and sets no best") and no longer by this line.

**3. A drift during which the steering dies keeps the wheel's last value. Words only.** Part 4 said in
one clause that a steering which dies in the middle of a corner is believed until the car has gone
straight (part 8, point 2: since part 6 that holds only where less than 20 degrees are shown on that
straight). What that does to a drift was not said: the drift carries no flag, it can set a best, and
its opposite lock and its angle follow the wheel's last value to its end. On the stand-in car, through
the whole app, a drift of 30 degrees that grows to 45: with the steering alive 997 points, a peak of
43.8, 34.9 degrees of opposite lock, 4.8 degrees off at the worst, backed 95 %. With all four steering
sources cut 2 s into it: 884 points, a peak of 41.3, 25.5 degrees of opposite lock, 12.1 degrees off at
the worst (33.9 shown for 45), "backed 95 %", no flag, and all four bests set. A value that sticks in
the drift and is still sent does the same (on the engine alone: 787 points in place of 888, 10.8
degrees off in place of 5.7, no flag). With the sources cut, the line under the drawn car is up six
seconds of straight later, and the next drift is flagged; a value that sticks and is still sent is
seen in the first corner after. Not changed: a wheel that is honestly held still in a steady drift
looks the same in every signal the app reads. Reading the steering's getter once, where a source has
one, could tell the two apart. That is a new kind of read towards the car and belongs to a round with
a car.

**4. "No best without the steering" rests on a car that does not oversteer while it grips. Words only.**
Part 4, point 1: "a car that grips through a banked or a climbing corner is steered as far as its path
asks". That is so where the front tyres slip at least as much as the rear ones. A car whose rear axle
runs well more slip than its front in a hard corner is steered LESS than its path asks all the way
round. Its steering says "oversteer" through a banked corner, and backs what the bank adds to the sum.
On the checker's tail-happy car, with steering, clean data, 180 corners banked by up to 10 degrees and
taken at 0.6 to 0.9 g and 60 to 140 km/h, in which the car was never as far sideways as the start
angle: a drift was counted in 72, and in 15 of them with no flag at all (up to 665 points; 11.9
degrees shown where the car was 7.7 sideways at most). On a milder such car: 16, and 1. On the
checker's ordinary car and on the first reviewer's: none. On this repository's car with nothing changed
but its rear slip: 2.4 degrees per g (as built), 4 and 5: none of 160; 6 degrees per g: 42, 2 of them
with no flag (196 and 253 points). The same counts before part 4. Such a car is unstable at speed, and
whether a real car that grips ever runs that much more slip at the rear is not known. Not changed. The
checker measured one way to close it (asking that the steering's "oversteer" be a fair share of the
angle shown); it was not built and not tried on the drifts at the lock or on low grip.

**5. Two sentences that part 4 made untrue, and one that was only true of the test's own car.**
- "A yaw rate that jumps by 3 degrees a second or more and stays, on a car without steering: the angle
  shown runs to its limit on a straight. Nothing is counted." (part 3 and the README.) True after part
  3. Since part 4 lets a drift without steering start on the sum where the acceleration check cannot
  speak, it is counted again: on the first reviewer's car 3415 points, grade S, with a jump of 3
  degrees a second (3452 with that reviewer's sensor faults), 832 and 842 with a jump of 8. Each is
  flagged NO STEERING CHECK and SPIN and sets no best. With steering none of them is counted. Both
  sentences are put right.
- "A bumpy road at a low data rate ... No drift was counted there in any run." True of the test's own
  car. On the first reviewer's car without steering, with its sensor faults, a bumpy straight that
  shakes by 2.6 m/s2 is counted at 5 samples a second since part 4: 975 points, grade B, flagged NO
  STEERING CHECK and LOW DATA RATE (before part 4: none). With four more draws of the noise, clean and
  with the faults: counted in six of the ten runs, 72 to 3009 points. At 10 samples a second and more
  that straight was not counted. (Part 6: with steering it was not counted in the reviewer's own run,
  and it was counted at 5 samples a second in four of the ten runs with other draws of the noise.
  This sentence said "and with steering" without having run them. Part 6, point 2.)
- The condition that was offered for it was measured and NOT built: "without steering a drift may
  start on the sum alone only where the car has felt some sideways acceleration over the last half
  second". It was to be built only with a factor of two on both sides. What the car felt sideways, as
  the engine sees it (the mean over 0.5 s, its size), at the moment a drift was confirmed: in the
  real drifts without steering of the re-check's low-grip probe and of the first reviewer's held
  drifts and other scenes (336 runs, 5 to 50 samples a second, clean and dirty), as little as 0.28
  m/s2 (60 degrees on grip 0.15). In the false ones on a straight: 0.00 to 0.05 m/s2 where the yaw
  rate had jumped, but 0.06 to 3.44 m/s2 on the bumpy straight at 5 samples a second, which is a road
  that shakes the car sideways. No floor separates them. Nothing was built.

**6. Smaller ones, each as the checkers said.**
- The reversal count of a sawing drift is the same "within two" wherever the count begins, not "within
  one": a count that begins in the middle of a swing needs that swing for its direction and can miss
  the reversal that was under way as well. `score.js` and the README say two now, and the test counts
  it from 60 moments of the first 3 s (0 to 2 fewer than the count from the start angle finds after
  the same moment). The rule is as it was.
- "3.8 degrees shown on a corner banked by 12 degrees" (README): 3.8 is how far off the angle was
  there, 4.6 the largest angle shown. Put right, here and in part 1.
- "A road that climbs or falls evenly does no harm" (README, under "Learn on flat ground") reads
  "Ground that climbs or falls evenly" now: every list around it says closed ground.
- Part 4's cost list: "nothing moved in the reviewer's clean cells with steering" was not exact, its
  counts of the reviewer's dirty cells did not come out the same when counted again, two of its
  figures were wrong (one drift was named with one rate's figure, and the 40 second circle on grip 0.3
  had got better, not worse), and it did not say that drifts held just over the start angle are lost
  on that dirty set without steering. All four are put right in part 4, with "(part 5)".
- Part 4's "What is left" for a grade that begins inside a corner has its figures now, and its costs
  say that on a wider grid about twice as many banked or climbing corners are counted without
  steering as before, each flagged.

**7. The offset's limit of 2 m/s2 had no check.** Part 4 measures what the forward acceleration reads
more than the speed's own change only where the speed changes by no more than 2 m/s2. The numbers
checker took that limit out in a scratch copy and no check failed. A scene that needs it was looked
for, and found (`brakecorner`, `brakedrift`): a car brakes hard in a straight line, 150 to 60 km/h in
4.8 s (1 g at its hardest), and turns in at once, and its forward acceleration reads 10 % low, so that
under braking it is up to 1 m/s2 off what the speed loses. With the limit the offset in use at the
turn-in is 0.02 m/s2, a corner of 0.5 g taken with full grip without steering is within 0.2 degrees,
and a drift of 30 degrees with steering within 1.8. Without the limit the braking is taken for a
climb: 0.41 m/s2 at the turn-in, the corner up to 5.2 degrees off, the drift up to 3.9. The same with
a forward acceleration that reads 6 % more under load, as on a body that pitches: 2.9 degrees off in
that corner without the limit, 0.1 with it. The limit stays, and one check now fails without it.

### What the changes cost

Laid beside the outputs from before, file by file and cell by cell: everything the test prints, and
the 49 probe outputs of the earlier rounds and of the two checkers.

- **No cell moved but in the cases of a stuck steering.** Every line that `test_drift.js` printed
  before is the same to the last character, with and without steering, clean and dirty (it prints 14
  checks more). So are the probe outputs, but for three of the numbers checker's (the two with the
  steering frozen and still sent of point 1, and the probe of other steering faults in its lines
  "stuck at straight ahead, still sent") and for the screen texts that changed in three of the app
  checker's. One of those three looks for the standing line's old text and stops; it was run again
  with the new text. In those outputs no clean drift with steering gained a flag or changed its
  score. (Part 6: none of them has a drift at the lock in which the car's nose stops turning for a
  moment. Such drifts did gain a flag: part 6, point 1.)
- **A car whose steering is found stuck is a car without steering**, and part 4 holds for it. With the
  steering stuck at straight ahead, six corners of the checker's that had been counted flagged ANGLE
  UNSURE alone (105 to 219 points: the stuck wheel had "backed" 86 to 90 % of them) are no longer
  counted. One banked corner that climbs (6 degrees of bank, 0.35 g at 80 km/h, a climb of 5 degrees)
  is counted on each of the two cars where it was not: 500 and 492 points, flagged NO STEERING CHECK.
  The stuck wheel had been holding the sum down there. For the same reason the angle SHOWN in a
  gentle banked corner runs as on any car without steering: 54.6 degrees in a corner banked by 3
  degrees (0.3 g at 40 km/h) and not counted, where the stuck wheel had held it at 11.6 and 115
  points were counted.
- **The line under the drawn car no longer says that drifts are scored.** The banner does while a drift
  runs.
- **Pictures.** `test_drift_car.js` draws 86 states now (645 frames), where it drew 75 (588).

### Asked for and done otherwise, or not done

- **The rule for a stuck steering is not "the same test the silent rule uses".** That form was built
  and measured and did not hold the condition set for it (point 1). What was built asks for more: a
  straight that lasts, at speed, and a turn that lasts and that the sideways acceleration confirms.
  It is a new rule with three figures of the engine's table reused (0.7 s, 2 degrees a second, 1.5
  m/s2) and two of the silent rule (2 s, 6 degrees a second). Nothing in it was tried on a car.
- **The condition for a drift on a straight without steering was not built** (point 5): the margin
  that was asked for is not there.
- The age rule for CDS2 (part 4, "Asked for and not done") and the app staying on a steering source
  that dies while others still send (the Signals tab then shows it "present, in use" beside live
  ones, and every drift is flagged) are as they were. Neither was in this round.

### Found and not solved

- A stuck steering is not seen where the car never goes straight for 0.7 s (on a pan driven in
  circles from the moment the app was started, circles with full grip were counted with the steering
  stuck at 12 degrees: 61 to 93 points, flagged ANGLE UNSURE, most of them with that flag alone; the
  angle had not rested once there; part 6, point 3: where the car HAS gone straight first and the
  value then sticks in a corner, some such circles are counted with no flag at all),
  in corners where the car feels under 1.5 m/s2 sideways (two gentle banked corners were counted
  with a steering stuck at 12 degrees, 1096 and 1417 points; the stuck wheel had "backed" 42 and 49 %
  of them, just under the half that takes the flag off), and in a slalom alone. One corner of 0.6 g
  before them, and it was seen.
- The rule assumes a steering angle whose counts are fine enough to move whenever the car turns in
  from a straight. With counts of 0.01 to 1 degree at the wheels an honest wheel of the made-up car
  was never taken for stuck, in its ordinary drive, in corners of 0.3 to 0.5 g at 150 and 220 km/h,
  in a held drift or in the long circle. What a car's counts are is not known. (Part 6: at the lock,
  with the nose stopping for a moment, it was. Point 1 there.)
- A drift during which the steering dies or sticks (point 3).
- A car that oversteers while it grips (point 4).
- A yaw rate that jumps on a straight, and a bumpy straight at 5 samples a second, on a car without
  steering: counted, flagged, no best (point 5).
- Everything under "Found and not solved" in parts 3 and 4 that this part does not name.

### Can the new checks fail

What this part changed was broken in 16 ways, one at a time, in a scratch copy, and the test that must
notice run on each. In the engine, with `test_drift.js`: the steering never taken for stuck; taken for
stuck and still used; every sample counted as a move; one half of the stretch enough for a straight; a
standing car a straight; the 2 s not asked; the sideways acceleration not asked; the turn only in the
last half; stuck only while the car turns; the silent rule's own test on a value that does not move;
the offset measured while the car brakes. In the app, with `test_drift_car.js`: the standing line at 13
px again; the long second half at 15 px; the flag's old sentence; the old words for a silent steering;
the steering never taken for stuck. Every one made between 1 and 25 checks fail. The script is in the
checks folder, not in the repository.

### What was not done, in this part

- Nothing ran on a car, a head unit or Node.js 8.
- `kit/`, the other three apps and their tests were not touched. `learn.js`, `series.js`, `session.js`,
  `store.js`, `car.js`, `feed.js` and the manifest were not touched either; `drift.js` and `score.js`
  only in their comments.
- The checkers' probes and cars are not in the repository. The test's own made-up car was given the
  scenes: a steering stuck at a value and still sent, with corners and with a drift after it; the rule
  on samples of its own; hard braking into a corner and into a drift with a forward acceleration that
  reads low; the sawing angle counted from 60 moments. The stand-in car was given a steering that
  sticks and still sends, and a slow banked corner with steering.
- The tail-happy car of point 4 and the dying steering of point 3 are in no test: they are faults that
  were left as they are, and their figures are the checkers' probes run again.
- No random fleet of cars, as before. Each new check is one run of one scene.

## 6. What a third check found

Part 5 was read and tried again by one checker who had not written it: every earlier probe on the
files before and after part 5, and probes of their own against part 5's new rule, on the first
reviewer's made-up cars, on the second checker's, on this repository's own and through the whole built
app. The verdict was "fix first": the rule for a stuck steering took a healthy steering for stuck, and
part 5 said that it did not. This part is that list: what was found, what was changed, what it cost
and what is not solved. It is a narrow round: one condition more in two rules of the engine, and
words. All of it is from a PC and from made-up cars, as everything in this record.

Before anything was changed, both tests and 69 probe outputs of the earlier rounds and of this checker
were run again on the files as part 5 left them. Each gave its author's text to the last character,
but for a folder's or a temporary file's name in one line. After the change all of them were run again
and laid beside the ones before. The probes are not in the repository.

### What was found, and what was changed

**1. A healthy steering at its lock was taken for stuck, and for silent.** Both rules for a steering
that is no news of the wheel (part 4, point 6: silent; part 5, point 1: stuck) ask that the car has
both gone straight and turned on a value that did not move. Both judged "gone straight" by the yaw
rate alone. A car that is sideways can stop turning its nose: the driver lifts in the middle of a
drift and the angle falls a few degrees, or the car slides on in a straight line between two corners.
If the car is further sideways than its lock all the while, its front wheels sit at the lock, and a
steering value that reads the same to the last count there is "a value that did not move".

- The stuck rule (part 5), the steering sent in every slot. Of 88 cases on the first reviewer's car
  and on the second checker's (drifts of 45 to 60 degrees with a lift or a straight slide in them, and
  a few controls), 66 were flagged NO STEERING CHECK and set no best. On this repository's car 12 of
  15. Through the whole app, a drift of 55 degrees with a lift in it: 2204 points, flagged, the line
  STEERING SILENT OR STUCK under the drawn car while the Signals tab listed the source as "present, in
  use", and no best. Before part 5 none of these was flagged.
- The silent rule (part 4), the steering sent on change only, as the stand-in car sends it. 76 of the
  88 were flagged and 81 taken for silent; on this repository's car 12 of 15. And it did worse: once a
  steering counts as silent the rest rule leaves it out, so a car that slides in a straight line
  counts as at rest, the angle is pulled to zero in the middle of the drift and the drift is cut in
  two. Through the whole app, a drift of 50 degrees with a straight slide of 1 s in it: 22 degrees
  shown for 50, counted as 462 and 601 points, the second flagged. As old as part 4, found now.

All of it takes a steering value that sits still to the last count at the lock. With the first
reviewer's sensor faults (a tenth of a degree of noise on the steering) none of the 88 was touched.
Whether a car's steering sits still at its lock, or flickers, is not known.

Changed (`angle.js`, `_stale` and `_stuck`): in both rules a stretch counts as "the car has gone
straight" only while less than 20 degrees of angle are shown (`STRAIGHT_DEG`, with the other figures).
For the silent rule the moment at which the yaw rate is near zero must itself show less than that,
and must come after the steering's last sample. Nothing else was touched: the rest rule, the steering
check and every other condition of the two rules are as they were. So neither rule has a new way to
say "silent or stuck": each asks for one thing more than it did. (Part 7: for the stuck rule the
angle shown alone was not enough. It now also asks where the front wheels stand.)

After it, on the files of this part:

- The 88 cases: none flagged NO STEERING CHECK, none taken for silent or stuck, each ONE drift, with
  the steering sent every slot and sent on change. Sent every slot, the probe's output is line for
  line the one from before part 5. (One of the 88, on grip 0.15, carries ANGLE UNSURE, as it did
  then.) This repository's car: none of 15, both ways.
- Through the whole app: the drift with the straight slide is one drift of 1722 points with no flag,
  all four bests are set, and 4 s into its second corner 40.0 degrees are shown for 50.0. That is as
  far under the true angle as in the same drift without the slide (40.3 for 50.2): the wheels at
  their lock pull the angle down (part 3), and this part does not change that. The drift with the
  lift: 1824 points, no flag, the bests set, as before part 5.
- Every stuck and every silent steering of the earlier probes is found as before: the second
  checker's two probes with a steering frozen and still sent, their probe of other steering faults,
  and part 5's own are the same to the last character, but for one line (below, "What the changes
  cost").

**Why 20 degrees.** Asked for: limits of 4, 6, 8 and 10 degrees measured, and one chosen with room on
both sides. They were measured, and more, each on the rule as it is now:

| limit, degrees | the 88 cases at the lock, flagged: sent every slot / on change | this repository's car, of 15, both ways | a steering that sticks or dies with an angle on the screen, 43 cases: found | false drifts with no flag in them |
|---|---|---|---|---|
| none (part 5) | 66 / 76 | 12 / 12 | 43 | 0 |
| 4, 6, 8 | 0 / 0 | 0 / 0 | 40 | 8 |
| 10 | 0 / 0 | 0 / 0 | 40 | 6 |
| 12 | 0 / 0 | 0 / 0 | 40 | 5 |
| 15, 18, 20, 22 | 0 / 0 | 0 / 0 | 40 | 0 |
| 30 | 0 / 0 | 0 / 0 | 42 | 0 |
| 35 | 5 / 6 | 0 / 0 | 43 | 0 |

The 43 cases are this round's own attack on the change (the made-up car of this repository, the
steering stuck and still sent, or dead, from a moment at which an angle is on the screen: in a slow,
tight banked corner, in an ordinary corner before a long straight with sensor faults, in the middle of
a real drift, in a corner that leads into another; then corners with full grip). Eight of them were
built to find the worst: a value that sticks at about 10 degrees in a slow corner, and at once a
faster corner the other way. The stuck value then reads as opposite lock, near enough to the sum to be
believed, and leaves 9 to 15 degrees on the screen on the straight after. With a limit of 12 or less
that straight no longer counts, the stuck steering is found two corners later, and the false drift
runs on through the straight, is "backed" for more than half its time and carries NO flag: 1496 to
1990 points, grade A, where the files of part 5 counted 493 to 790 points, flagged NO STEERING CHECK.
So none of the four limits asked for has room on that side. A stuck value pulls no more than about 15
degrees onto the screen by itself in a car that grips: the steering check believes nothing further
than 15 degrees from the sum. On the other side the limit has to stay under the angle that is shown
while a car slides at its lock, which is about the lock itself (35 to 37 degrees on these cars: with
35 the healthy wheel is taken for stuck again). 20 lies between the two. On made-up cars whose lock
was set lower (drifts 10 degrees beyond the lock, with the lift and with the slide, grip 0.2 and 0.3,
sent every slot and on change, 8 cases for each lock), a limit of 20 kept every one of them clean
from 22 degrees of lock up; with 20 one of 8 was taken for silent for a third of a second as the
drift ended, with 18 degrees of lock 5 of 8 were taken for silent or stuck, with 14 and less all of
them. (Part 7: that is this repository's car with these drifts. On a reviewer's car, with drifts 6
and 12 degrees beyond the lock, a healthy steering was clean from 28 degrees of lock up: at 22
degrees 5 of 16 cases were still taken for silent or stuck, at 24 one. Part 7, point 2.) Nobody at
Proven knows a car's lock at the wheels as its steering reports it.

**2. The bumpy straight, in full. Words only.** Part 5 wrote "at 10 samples a second and more, and
with steering, that straight was not counted", and had run the other draws of the noise without
steering only. The checker's probe, run again on the files of this part, first reviewer's car, five
draws of the noise, clean and with that reviewer's sensor faults, ten runs each:
- A straight that shakes by 2.6 m/s2 at 5 samples a second. Without steering: counted in six of ten
  runs, 72 to 3009 points (part 5's figure). With steering: not counted in the reviewer's own run,
  counted in four of the ten (21 to 1018 points). Every one is flagged NO STEERING CHECK and LOW
  DATA RATE. At 10 and at 20 samples a second: none, with or without steering.
- A straight that shakes by 5 m/s2. Without steering it is counted at 10 samples a second as well,
  where LOW DATA RATE does not apply: five of ten runs, 30 to 305 points, each flagged NO STEERING
  CHECK. At 5 a second: nine of ten without steering (56 to 6030 points), eight of ten with (11 to
  2738), each flagged. At 20 a second: none. With steering at 10 a second: none.
None of them can be a best. The README and parts 1 and 5 say so now.

**3. The stuck rule on ground with no straight is worse than its example. Words only.** Part 5 named
"a car that never goes straight" as a limit of the stuck rule, with a pan driven in circles from the
moment the app was started: every false drift there carried ANGLE UNSURE, because the angle had never
rested. The worse case was not said. The car HAS gone straight first, with a healthy steering; the
value then sticks in a corner and is still sent; the car goes on in figures of eight with no 0.7 s of
straight. The stuck value then backs the circles the other way as opposite lock. The checker's probe
on the files of this part, two made-up cars, 40 cases, nothing sliding in any: a false drift is
counted in 12, in 4 of them with NO flag (202, 241, 325 and 380 points, grade C, "backed" 89 to 92
%), the other 8 flagged ANGLE UNSURE alone. A drift with no flag can set a best. The same before part
5 and after it: the rule does not look there, and this part's change does not either. It is said now
where the limit stands (the README, the head of `angle.js`) and in both first-car lists: on a pan
with no straight, watch the steering's figure on the Signals tab move with the wheel.

**4. The session's best can be a flagged drift. Words only.** The session's score, best score,
biggest angle and longest drift take in every drift, flagged or not. The Session tab says so in a
line, the Drift tab's strip does not: BEST THIS SESSION can show a drift, with its grade, that the
Best tab does not hold. The README's row for the Drift tab and its paragraph on flags say it now.
Nothing in the code.

**5. A car with no steering source that slides sideways in a straight line counts as at rest. Words
only.** Found by the second check (the round of part 5) and left out of these notes then. With no
steering the rest rule has the yaw rate and the sideways acceleration alone, and in a straight slide
both are small. The second checker's probe on the files of this part, first reviewer's car crabbing
at 25 degrees on grip 0.15: with no steering source the car counts as at rest for 93 % of the crab,
and 0.6 degrees are shown for 25; with a steering source 0 %, and 24.3 are shown. As old as part 1.
The README names it now.

### What the changes cost

Laid beside the outputs from before, file by file: everything the two tests print, and the 69 probe
outputs.

- **Nothing moved but in the cases of point 1 and in two lines.** Every table of `test_drift.js` and
  every probe output is the same to the last character, with and without steering, clean and with
  sensor faults, but for the checker's four probes of a healthy wheel at its lock (which now come out
  clean) and:
  - one line of the test: a steering sent on change, the wheels held at their lock in a steady
    drift, was "silent for 3.3 % of the drift at most" and is for 0.0 %. That was the yaw rate
    running through zero as the car came out of the drift with its wheels still at the lock.
  - one line of part 5's own probe: a steering that dies 2 s into a drift (30 degrees growing to 45)
    was taken for silent for 73 % of the run and for 16 % of the drift's time, and is for 71 % and 7
    %. It is found a little later, once less than 20 degrees are shown, and not while the car is
    still far sideways. What is counted is the same (787 points, no flag: part 5, point 3).
    (Part 8, point 2: where such a drift is at the lock and then fades out slowly, the dead value
    keeps 20 degrees or more on the screen and the steering is not found at all. No probe of this
    part had that case. On the files of part 5 it was found.)
  No clean drift with steering gained a flag, lost points or was lost.
- **A steering that sticks or dies while 20 degrees or more are on the screen for another reason is
  no longer found at the next corner.** In the 43 cases above that is 3: the value sticks at 3, at 9
  and at 9 degrees the other way inside a slow, tight banked corner in which the steering is not
  believed and the angle shown runs away (part 4, point 7). Afterwards 30 to 138 degrees stay on the
  screen on the straights and, in these three, nothing more is counted (the engine holds every start
  back until the car has gone straight, for which the app's banner is GO STRAIGHT FOR A MOMENT),
  until the car comes under 10 km/h (the angle is set to zero there) or the value moves. Three more
  of the 43 are these three driven on: the stuck steering was found in the first corner after the
  car had slowed to 5 km/h. On the files of part 5 it was found in the first corner after the banked
  one. In the other 37 nothing changed but in one, where a steering that dies in a drift is found
  0.7 s later. (Part 7: this said too little. A value that simply freezes in an ordinary corner
  does the same when a banked corner follows with no straight between; real drifts after it were
  then not counted; and where the false angle stayed under 100 degrees one false drift ran on over
  the straights for 69 s and WAS counted, flagged. "Nothing more is counted" held for these three
  cases only. Part 7 changed the stuck rule for it: all six of these cases are found there as on
  the files of part 5.)
- **Pictures.** `test_drift_car.js` draws 90 states now (681 frames), where it drew 86 (645).

### Asked for and done otherwise, or not done

- **The limit is not one of the four that were asked for.** 4, 6, 8 and 10 degrees were measured as
  asked, and each lets a stuck steering back false drifts with no flag where part 5 flagged them
  (the table). 20 has room on both sides on the made-up cars tried (part 7: on a made-up car
  whose lock is set under about 28 degrees it has none).
- **One more condition was measured and not built.** Offered for the case that the change leaves a
  hole: "a stretch also counts as straight, whatever angle is shown, once the car has gone straight
  by its motion alone for a longer time, such as 2 s". Built in a scratch copy on top of the change:
  in each half second of the last 2 s the yaw rate within 2 degrees a second of zero and the sideways
  acceleration within 0.5 m/s2 of its zero. It closes the hole above (the stuck steering is found in
  all 43 cases) and the checker's cases at the lock stay clean. It was not built, because it is the
  healthy steering that pays again: nothing in the yaw rate and the sideways acceleration tells a car
  that goes straight with a false angle on the screen from a car that slides straight at its lock
  without slowing much, and the checker's own scenes are of that kind. In this round's attack on it
  (the repository's car, a drift of 50 degrees at 70 km/h with a straight slide of 1 to 4 s in it,
  the car slowed by 0 to 3 m/s2 while it slides, sent every slot and on change, 82 cases): 20 real
  drifts were flagged NO STEERING CHECK again and 6 of them cut in two, every slide of 1.5 s or more
  in which the car was slowed by 0.3 m/s2 or less. With the change alone: none of the 82. With the
  rest rule's own limit for the sideways acceleration (1.5 m/s2) the checker's cases themselves
  failed again (10 and 14 of 88), and with 1 or 1.5 s in place of 2 this repository's car did (6 of
  15). Whether a car can slide straight at its lock for 1.5 s without being slowed more than that
  is not known here; a scripted car can, and the checker's own scenes on this repository's car do
  so for 1 s. The scratch copy and its figures are in the checks folder.
- The age rule for CDS2, the app staying on a steering source that dies while others still send, and
  everything else under "Asked for and done otherwise, or not done" in part 5 are as they were.

### Found and not solved

- A healthy steering whose value sits still while less than 20 degrees are shown, in a car whose
  nose stops turning in a slide, is still taken for silent or stuck. That takes a lock of less than
  about 28 degrees at the wheels (part 7; this said 20), or a wheel that reads the same to the count
  through such a moment for another reason.
- A steering that sticks or dies while 20 degrees or more are on the screen for another reason
  (above). (Part 7: the stuck rule now finds it unless the value stands 10 degrees or more to the
  side of that angle. Part 8, point 2: one way into that was not seen here or in part 7: a
  steering that dies or sticks at the lock in a drift that then fades out slowly keeps the angle up
  by itself, and is believed to the end of the drive.)
- On ground with no straight a steering that sticks in a corner backs false drifts with no flag
  (point 3).
- With the front wheels at their lock the steering check pulls the angle down (part 3): 40 degrees
  shown for 50 in point 1's drifts through the app.
- A bumpy straight at 5 samples a second, with or without steering, and a rougher one at 10 a second
  without: counted, flagged, no best (point 2).
- A car with no steering source that slides straight counts as at rest (point 5). The same holds for
  a car whose steering really has been found silent or stuck: with the steering frozen from the
  straight before, the drift of 50 degrees with a straight slide of 1 s in it was counted as two
  (542 and 614 points, both flagged NO STEERING CHECK).
- Whether a car's steering value sits still to the count at the lock, and what its lock reads.
- Everything under "Found and not solved" in parts 3 to 5 that this part does not name.

### Can the new checks fail

What this part changed was broken in 7 ways, one at a time, in a scratch copy, and the tests run on
each: the stuck rule not asking for the angle shown; the silent rule not asking for it; a straight
from before the steering's last sample counting for the silent rule; the limit at 90 degrees; the
limit at 0 (so that nothing is a straight and no stuck or silent steering is ever found); the silent
rule's straight not asking for the yaw rate; the silent rule never seeing a straight. Every one made
between 1 and 9 checks of `test_drift.js` fail, and the four that were also run through the built app
between 2 and 6 checks of `test_drift_car.js`. With a comment changed and nothing else, both pass
with their counts. The script is in the checks folder, not in the repository.

### What was not done, in this part

- Nothing ran on a car, a head unit or Node.js 8.
- `kit/`, the other three apps and their tests were not touched. Of the app only `angle.js` was
  changed: its two rules, one figure in its table, and its comments. `learn.js`, `drift.js`,
  `score.js`, `series.js`, `session.js`, `store.js`, `car.js`, `feed.js`, the screens and the manifest
  were not touched. No setting, no text on a screen and no saved field changed.
- The checkers' probes and cars are not in the repository. The test's own made-up car was given the
  two scenes at the lock (a lift at 55 degrees, a straight slide of 1 s at 50), each with the
  steering sent every slot and on change, and with a steering that really is stuck or silent; and
  the rule on samples of its own. The stand-in car was given both scenes through the whole app.
- The cases of point 1 are scripts of a motion, as every scene of this record: a path that is
  straight while the car is held sideways at a steady speed is what the script says, not what a
  car's tyres were asked.
- The tail-happy car and the steering that dies in a drift (part 5, points 3 and 4), the two rejected
  forms of part 5's rule and the 16 breaks of part 5 were not run again.
- No random fleet of cars, as before. Each new check is one run of one scene.

## 7. What a fourth check found

Part 6 was read and tried again by one checker who had not written it: every earlier probe on the files
before and after part 6, and probes of their own against part 6's change, on the first reviewer's
made-up cars, on the second checker's, on this repository's own and through the whole built app. The
verdict was "fix first": part 6's change had opened a state in which a steering that is stuck is
believed for minutes, and part 6 had said less of it than was so. This part is that list: what was
found, what was changed, what it cost and what is not solved. It is a narrow round again: one condition
more in one rule of the engine, scenes in the two tests, and words. All of it is from a PC and from
made-up cars, as everything in this record.

Before anything was changed, both tests and 99 probe outputs of the earlier rounds and of this checker
were run again on the files as part 6 left them. The checker had run 92 of them on those files, and
each gave the checker's text to the last character, the names of folders and temporary files apart.
After the change all of them were run again and laid beside the ones before, and this round's own
probes were run on both. The probes are not in the repository.

### What was found, and what was changed

**1. A stuck steering could be believed for minutes.** Part 6 let a stretch count as "the car has gone
straight", for the silent and for the stuck rule, only while less than 20 degrees are shown. That cured
a healthy wheel at its lock. It also made a state that holds itself up:

- A steering value freezes at what it reads in an ordinary corner, a few degrees, and is still sent (so
  it is more than 2.5 degrees from straight ahead, the most the rest rule allows).
- With no straight between, a banked corner follows. The frozen value does not fit that corner, the
  steering check is not believed, and the angle shown runs to 20 degrees or more.
- On every straight after it the rest rule cannot pull the angle to zero, because the steering reads
  "turned" and is not known to be stuck. And the stuck rule cannot call it stuck, because 20 degrees or
  more are shown. Each waits for the other, until the car comes under 10 km/h or the angle falls under
  20 on a straight by chance.

The checker's probe on the files of part 6 (an ordinary corner of 0.4 to 0.5 g at 40 to 60 km/h in
which the value freezes, a banked corner of 5 to 10 degrees the other way at 40 km/h, then three laps
with full grip and one real drift of 40 degrees in each, never under 40 km/h; 23 cases with a fault on
each of four made-up cars, the steering sent every slot, 20 samples a second): of the 69 real drifts a
car, 25, 31, 13 and 45 were counted, and in 19, 19, 19 and 12 of the 23 cases at least one was lost. On
two of the cars the steering was never taken for stuck: in 6 of the 23 cases on one and in 19 on
another (part 8: this said one car, and 6). In the 6, 164 to 220 degrees were shown at most where
nothing slid, and nothing could start to the end of the drive; in the 19, 70 to 220 degrees, and
nothing could start to the end in 18. Where the false angle stayed under
100 degrees there was no spin, so nothing was held back: one false drift then ran on over straights and
corners for 69 s and was counted with 8928 points, grade S, flagged ANGLE UNSURE and NO STEERING CHECK
(so it set no all-time best, but it was the session's best). On the files of part 5 the stuck steering
was found in the first corner after the first straight in every one of these cases, and all 69 real
drifts were counted on each car. Through the whole built app on the stand-in car, on the files of part
6: 38.4 degrees shown on a straight at 90 km/h, the banner GO STRAIGHT FOR A MOMENT while the car went
straight, a real drift of 40 degrees shown as 2.7 and not counted, "Steering check: on" on the Signals
tab, and no line STEERING SILENT OR STUCK.

It takes a sensor fault: a steering that freezes and goes on being sent. No false drift without a flag
came of it in any case. Part 6 had named a narrower form of it (a value that sticks at 3 or at 9
degrees inside a slow, tight banked corner) and had written that "nothing more is counted" there. That
is taken back in place.

This round found it wider still. With a banked corner the SAME way as the first (the corner tightens:
0.45 g at 45 km/h, 6 to 10 degrees of bank into the turn, 30 cases a car on two made-up cars, 20
samples a second) the state held on the files of part 6 for a steering that is only sent on change as
well, and for one that dies: in 10 of 30 cases on one car and 4 of 30 on the other, the same whether
the value is sent every slot, sent on change, or no longer sent at all. The checker's cases have the
banked corner the other way; there the yaw rate passes zero between the two corners while little is
shown yet, and the silent rule found a steering sent on change in every case.

The checker had tried a cure in a scratch copy: the steering itself must show the slide. Changed on
that line (`angle.js`, `_stuck`, and a new `_sideways`): for the STUCK rule a stretch is "not straight"
only where 20 degrees or more are shown AND the front wheels are turned the way of that angle, down the
car's path, by 10 degrees or more (`SIDEWAYS_STEER_DEG`, with the other figures; the steering's newest
value on the learned scale). A car that slides without turning its nose holds its wheels so: at their
lock in a big drift. A value that froze at a few degrees in a corner does not, whatever is shown. Where
the steering's scale is not known at all, the angle shown alone decides, as in part 6. Nothing else was
touched: the silent rule, the rest rule, the steering check and every other condition of the stuck rule
are as they were.

After it, on the files of this part:

- The checker's 23 cases on each of the four cars, at 5, 10, 20 and 50 samples a second: all 69 real
  drifts counted on every car at every rate, and no case in which the steering is never found. Each of
  the 16 outputs is the one from the files of part 5 to the last character, but for its first line.
- The checker's other probe of a steering that sticks or dies with an angle on the screen (110 cases a
  run on two cars; sent every slot and on change at 5, 10, 20 and 50 samples a second, and with sensor
  faults at 5, 10, 20 and 50): the dead steering is found in 110 of 110 in all 12 runs. On the files of
  part 6 it was 108 in the four runs with the steering sent every slot.
- Part 6's own 43 cases: found in 43 of 43 (40 on the files of part 6), none with a false drift without
  a flag. The three that part 6 left open are found 35.4 s into their scene, as on the files of part 5.
  The same 43 at 5, 10, 20 and 50 samples a second, clean and with every case on this repository's
  sensor faults: 43 of 43 in all eight runs (40 clean and 38 with faults before).
- The cases with the banked corner the same way: found in all 30 on both cars, sent every slot and on
  change, clean and with sensor faults, and all 90 real drifts counted (68 of 90 on the first car
  before). The stuck rule finds a steering that is no longer sent too: a value that is not sent has not
  moved either.
- The checker's 23 cases on the first reviewer's sensor faults with the steering still sent every slot
  (this round's probe, four cars, four rates): 69 of 69 real drifts in all 16 runs, where the files of
  part 6 counted 4 to 33 of 69.
- Through the whole built app, the checker's drive: the output is the one from the files of part 5 to
  the last character. On the straight at 90 km/h 0.0 degrees are shown, the banner says READY, the line
  under the drawn car says STEERING SILENT OR STUCK: NO BEST IS SET, and both real drifts are counted
  (918 and 919 points, flagged NO STEERING CHECK).
- A healthy wheel at its lock: the 88 cases of part 6, sent every slot, on change and with sensor
  faults, and this repository's 15: none taken for silent or stuck, none flagged, as on the files of
  part 6, each output the same to the last character.

**Why the silent rule does not ask the steering.** Asked for: the condition in both rules. It was built
so first and measured, and then taken out of the silent rule (see "Asked for and done otherwise"). The
silent rule's straight is one look at the yaw rate, not 0.7 s, and once a steering counts as silent the
rest rule leaves it out. So with the steering asked there, a healthy wheel that is held still at a few
degrees of opposite lock through a slide, on a steering that is sent on change, was taken for silent in
the straight part of the slide itself, the car for at rest, the angle was pulled to zero and the drift
cut in two: part 6's first finding again, for a wheel that sits still under 10 degrees. In this round's
attack on its own condition (below) 84 of 216 such slides on one made-up car and 69 of 216 on another
were newly cut in two that way (steering sent on change, 20 samples a second), with the angle read up
to 41.4 degrees wrong. With the condition in the stuck rule alone: not one more than on the files of
part 6. What the silent rule would have gained: a steering that has died in the state above is found on
the first straight, where the stuck rule finds it in the first corner after that straight (17.9 s
against 29.3 s after the fault in the ten cases above; nothing more was counted or lost for it).

**Why 10 degrees.** Asked for: 5, 8, 10, 12 and 15 degrees measured, and one chosen with room on both
sides. Each on the rule as it is now (first reviewer's car unless said; "this round's cases" are
described under "What the changes cost"):

| the amount, degrees | the 88 and the 15 healthy cases at the lock, taken for silent or stuck | the checker's 23 cases on each of four cars: cases that lose a real drift | part 6's 43 cases: found | this round's 115 cases of a value frozen in a first corner before a banked one: cases that lose a real drift | this round's 832 healthy cases, most of them a wheel that is held still: newly taken for stuck | of those 832, a drift that had no flag and has one now (part 8: none of the 832 is a slow, tight drift; there it is not 0) |
|---|---|---|---|---|---|---|
| none (part 6) | 0 | 19, 19, 19, 12 | 40 | 85 | | |
| 5 | 0 | 6, 6, 12, 6 | 42 | 77 | 118 | 0 |
| 8 | 0 | 0, 0, 0, 0 | 42 | 62 | 168 | 0 |
| 10 | 0 | 0, 0, 0, 0 | 43 | 41 | 194 | 0 |
| 12 | 0 | 0, 0, 0, 0 | 43 | 26 | 230 | 0 |
| 15 | 0 | 0, 0, 0, 0 | 43 | 13 | 245 | 0 |

(Part 8: the last two columns are this round's 832 cases and no others. With the amount at 10, in
slow, tight drifts, which were not among them, clean drifts gained a flag and drifts were cut in two:
part 8, point 1.)

The two sides are the same signal seen from two ends: a value that does not move, a few degrees toward
the slide, under an angle of 20 or more. Below the amount it is taken for a stuck value, above it for a
wheel held into a slide, and nothing in the car's motion tells the two apart. On the stuck side, the
values that froze in the checker's ordinary corners stood at 1.9 to 8.1 degrees at the wheels on the
four cars; 5 still leaves the state in 6 to 12 of 23 cases a car, 8 leaves one of part 6's 43 unfound
(a value forced to 9 degrees toward the false angle), 10 finds all of them. On the healthy side, a
wheel at its lock has to read more than the amount. On the first reviewer's car with its lock set to 28
degrees (the least of the locks tried at which the limit of 20 on the angle shown keeps every case
clean, point 2) the engine reads the wheel at its lock as 25.1 degrees, and as 17.5 when the learned
scale is 30 % too small; with the lock at 22 and that short scale as 13.8. With 15, six cases at a lock of 22 degrees on that short
scale were newly taken for stuck. So 10 is the least of the five that finds every stuck value of the
listed probes, and it keeps clear of every wheel at a lock that was tried. 12 would close a little more
of what is left open (26 for 41) and take a few more still wheels for stuck (230 for 194); it is one
figure in the table of `angle.js`. Nothing of this is known for any car.

**2. "Clean from 22 degrees of lock up" was true of one car. Words only.** Part 6 wrote that the limit
of 20 on the angle shown kept a healthy steering clean from 22 degrees of lock up. That was this
repository's car with drifts 10 degrees beyond the lock. The checker's probe on the first reviewer's
car with its lock set lower (drifts 6 and 12 degrees beyond the lock with a straight slide of 1 s and
with a lift, grip 1 and 0.3, sent every slot and on change, 16 cases for each lock), run again on the
files of this part: the healthy wheel is taken for silent or stuck in 10 of 16 at locks of 12, 14, 16
and 18 degrees, in 7 of 16 at 20, in 5 of 16 at 22 (three of them flagged NO STEERING CHECK), in 1 of
16 at 24 (flagged), and in none at 28 and at 34. The wheels at their lock pull the angle shown under
the true one (part 3), and in the lift or the slide it comes under 20. The same on the files of part 6:
this part's change does not move it. So the room between the limit and a car's lock is smaller than
part 6 said: a lock of less than about 28 degrees is not covered. The made-up cars as built have 33 to
38. Part 6's sentences say so now.

**3. The limit is held by scenes now, not by its figure alone.** The test had the limit of 20 as a
figure inside a check; no scene showed why it must not be lower, and none showed the state of point 1.
`test_drift.js` has four scenes more on its own made-up car (part "what the fourth check found", 10
checks):
- the state of point 1: a value that freezes 3 s into a corner of 0.45 g at 40 km/h (6.2 degrees) and
  is still sent, 8 degrees of bank the other way, two laps with one real drift of 40 degrees each. The
  steering is taken for stuck 37.7 s into the drive, 0.0 degrees are shown on the straights at 90 km/h,
  both real drifts are counted (918 and 919 points, flagged NO STEERING CHECK), and what was counted in
  the banked corner carries a flag (299 points, ANGLE UNSURE and SPIN). On the files of part 6 the same
  scene left 40.5 degrees on those straights, nothing could start to its end, and neither real drift
  was counted;
- the "opposite lock" case that the limit's lower side rests on: a value that sticks at 11.9 degrees in
  a slow corner and at once a faster corner the other way. With the limit at 20 the false drift is
  flagged NO STEERING CHECK (790 points); with 12 in a scratch copy it carried no flag (1990 points,
  grade A) and the check fails;
- a healthy wheel at its lock whose learned scale reads 30 % short (the engine reads 24.4 degrees of
  the 36), in the lift at 55 degrees, to the left and to the right: never stuck, one drift with no flag
  each; and the same lift with a steering whose scale is not known at all: never called silent or
  stuck;
- a healthy wheel held still at 5 degrees of opposite lock through a slide of 40 degrees with a
  straight slide of 2 s in it, sent on change: one drift, the angle within 0.8 degrees, not pulled to
  zero (the reason the silent rule does not ask the steering); and as a KNOWN LIMIT, pinned, that the
  stuck rule takes this wheel for stuck in the corner after the slide and the drift carries NO STEERING
  CHECK beside the ANGLE UNSURE it had before.
And the rule on samples of its own: the same angle shown with the wheels 12 degrees into the slide (not
stuck), 5 degrees (stuck half a second after the car turns again), 12 degrees against it (stuck), on a
scale that is not known (not stuck), and a steering that says nothing more from 5 degrees on (not
silent while the car slides with its nose still; stuck once it turns). `test_drift_car.js` has the
state of point 1 through the whole built app (3 checks and 3 new states): every steering source frozen
at 6.1 degrees and still sent, the banked corner, a lap, one real drift. On the straight at 90 km/h the
banner says READY and not GO STRAIGHT FOR A MOMENT, the line STEERING SILENT OR STUCK: NO BEST IS SET
stands under the drawn car, the real drift is counted (918 points, flagged NO STEERING CHECK, no best),
and the Signals tab names the steering.

**4. A car that slides in a straight line is flagged NO STEERING CHECK even with a healthy steering.
Words only.** Seen in part 6's round and not written down then. The steering backs a drift only at
moments in which the car turns (2 degrees a second or more), so a drift that is mostly a straight slide
is "backed" for less than half its time. Part 6's probe on the files of this part, this repository's
car thrown sideways to 50 degrees on ice (grip 0.04 to 0.2) and sliding straight for two stretches of 3
s: all 12 cases are counted and flagged NO STEERING CHECK, backed 17 to 26 % (155 to 813 points; the
two on grip 0.2 end as a SPIN as well). The second checker's straight crabs of 12 to 40 degrees with a
steering source: counted, backed 3 to 10 %, flagged the same. As old as part 4. The README names it
now.

### What the changes cost

Laid beside the outputs from before, file by file: everything the two tests print, the 99 probe
outputs, and this round's own.

- **A healthy steering as the earlier rounds tried it: nothing moved.** Every table of `test_drift.js`
  and every earlier line of both tests is the same to the last character (the tests' own counts and the
  new lines apart). So are the checkers' probes of a healthy wheel at its lock (88 cases three ways, 15
  on this repository's car, the two drives through the whole app), part 6's 174 cases at small locks
  and on ice, and the checker's 272 healthy cases at the limit, under it and with a steering that is
  not learned.
- **A faulty steering: better in the cases of point 1, the same elsewhere.** The second checker's two
  probes with a frozen steering and of other steering faults, the probe on this repository's car, part
  5's probe of the stuck rule's limits and the third checker's two (gentle corners, ground with no
  straight) are the same to the last character. What moved is listed under point 1, and one line more
  of the checker's: a steering that is still "learning" and freezes before a banked corner is found
  now, and the real drift after it is counted.
- **Every other earlier probe: the same to the last character.** 51 outputs of the first reviewer's,
  the re-check's and the three checkers' probes, with and without sensor faults, and the second
  reviewer's four bench probes (but for a temporary file's name in one line of two of them).
- **A healthy wheel that is held still with less than 10 degrees of it into the slide is taken for
  stuck.** This is what the condition costs, and it was looked for. This round's attack, 832 cases a
  run on each of two made-up cars (the first reviewer's and the second checker's; 32 of the 832 are
  controls with the wheel as the car's own), steering sent every slot and sent on change, at 5, 10, 20
  and 50 samples a second and with sensor faults: a lift in the middle of a drift of 30 to 55 degrees
  in which the driver also winds the lock off to 3 to 20 degrees and holds it still for 4.3 s; a slide
  of 25 to 40 degrees on grip 0.15 to 0.3 with 3 to 15 degrees of opposite lock held still for the
  whole slide and a straight stretch of 1 to 3 s in it; the wheel at its lock (12 to 35 degrees) on a
  scale that reads 30 % too small or too large; a steering that is "learning"; to the left and to the
  right. Against the files of part 6, at 20 samples a second:
  - newly taken for stuck: 194 of the 832 on the first car, 172 on the other. Every one of them is a
    wheel that does not move by a count for 2 s or more, with less than 10 degrees of it into the
    slide as the engine reads it, while the car's nose stops turning for 0.7 s and then turns again.
  - in none of the 832, on either car, at any rate or with sensor faults, did a drift that had no flag
    get one, was a drift cut in two or lost, or did the worst error of the angle grow by more than half
    a degree. In 124 and 104 of them a drift that already carried ANGLE UNSURE (the still wheel and the
    sum disagree there, part 3) now carries NO STEERING CHECK as well. In the lift, 60 of the 144 cases
    on each car are taken for stuck for about 2 s; no drift there got a flag, and 16 on the first car
    and 4 on the other lost the ANGLE UNSURE they had carried.
  - the wheel at locks of 22 to 34 degrees, with the scale as learned and read 30 % short (128 of the
    cases): the same lines as before on both cars.

  A wheel held still to the count in the middle of its travel for seconds, through such a moment, is
  what a script does. Whether a driver's hands and a car's steering counts do is not known.

  (Part 8: "in none of the 832" is true of these 832 cases and not of the condition. They have a
  lift, a slide on low grip, a lock on a wrong scale; they have no slow, tight drift, in which a
  car holds less than 10 degrees of opposite lock by its own geometry. There a drift that had no
  flag gained NO STEERING CHECK, and with a second straight slide the angle was pulled to zero in
  the slide and the drift cut in two: part 8, point 1, with the figures.)
- **What is still not found** is under "Found and not solved".
- **Pictures.** `test_drift_car.js` draws 93 states now (702 frames), where it drew 90 (681).

### Asked for and done otherwise, or not done

- **The condition is in the stuck rule alone, not in both rules.** Asked for: "for the two rules".
  Built so first, measured, and taken out of the silent rule again, because there it cost a healthy
  steering more than it gained (point 1, "Why the silent rule does not ask the steering"). Every probe
  that the round was asked to hold gives the same counts both ways. The form with both rules is kept as
  a diff in the checks folder.
- **Two healthy cases were added to the test, not one**, because the instruction could be read two
  ways: a wheel at its lock on a short scale (a rule that asks for too much, or looks the wrong way,
  fails it), and a steering whose scale is not known (it fails without the sentence "the angle shown
  alone decides"). And one scene more than asked: the still wheel on a steering sent on change, which
  holds the choice above.
- The age rule for CDS2, the app staying on a steering source that dies while others still send, and
  everything else under "Asked for and done otherwise, or not done" in parts 5 and 6 are as they were.
  The "long straight" condition of part 6 was not looked at again.

### Found and not solved

- **A value that sticks or dies while 20 degrees or more are shown for another reason AND stands 10
  degrees or more to the side of that angle** is still believed, as on the files of part 6. It is
  reached like the state of point 1 with a slower, tighter first corner. This round's probe (a first
  corner of 0.3 to 0.6 g at 20 to 40 km/h in which the value freezes, then the banked corner the other
  way and three laps; first reviewer's car, sent every slot, 30 cases): found as in point 1 where the
  value froze at 7.0 to 10.8 degrees at the wheels (18 cases), believed for 88.8 s where it froze at
  11.5 to 16.1 (12 cases: first corners of 0.3 g at 20 km/h, 0.4 g at 25 and 0.45 and 0.5 g at 30),
  until less than 20 degrees were shown on a straight; in 11 of those 12 a real drift was lost, and in
  the worst one false drift ran for 69.2 s with 12390 points, grade S, flagged ANGLE UNSURE and NO
  STEERING CHECK. With the corners the other way round it was believed to the end of the 198 s in 4 of
  10 and no real drift was counted there. On the second checker's car the line lies at 10.3 degrees.
  With the value forced: found up to 11 degrees on the side of the false angle and at every value on
  the other side, believed from 12 up. Where the learned scale reads 30 % too large the line lies lower
  (a value frozen at 9.7 was believed). On a steering sent on change every one of these 115 cases was
  found, on the files of part 6 as well. No false drift without a flag in any.
- **(Part 8.) A steering that dies or sticks at the lock in a drift that then fades out slowly** is
  believed to the end of the drive, whether it is sent every slot, sent on change or no longer sent.
  It is another way into the state of the point above (the dead value itself keeps 20 degrees or
  more on the screen, and it stands far more than 10 degrees into that angle), and it is as old as
  part 6. The probes of part 6 and of this part had drifts that end within 5 s after the fault, and
  none that fades out slowly: part 8, point 2.
- **A healthy wheel held still under 10 degrees into a slide is taken for stuck** ("What the changes
  cost"). (Part 8: in a slow, tight drift that is the wheel a car asks for. A clean drift then
  carries NO STEERING CHECK, a second straight slide cuts the drift in two, and the screen says
  STEERING SILENT OR STUCK on a steering that works: part 8, point 1.) On a steering sent on change
  the files of part 6 and of this part alike cut 42 of 216 such slides in two on the first car and
  47 on the other (all with 8 to 15 degrees held): where less than 20 degrees are shown in the
  straight part of the slide, the silent rule and the rest rule do what part 6's first point
  describes.
- A healthy steering at a lock of less than about 28 degrees (point 2).
- A car that slides straight for most of a drift is flagged NO STEERING CHECK (point 4).
- Whether a car's steering can freeze and still be sent, whether it is sent every slot or on change,
  how fine its counts are, and what its lock reads: all four decide which of the cases above can happen
  at all, and none is known.
- Everything under "Found and not solved" in parts 3 to 6 that this part does not name.

### Can the new checks fail

What this part changed was broken in 8 ways, one at a time, in one scratch copy, and the tests run on
each: the stuck rule not asking the steering; the amount at 40 degrees; the amount at 3; the wheels
asked the wrong way round; the way of the wheels not asked at all; a scale that is not known asked as
well; the silent rule asking the steering too; the limit on the angle shown at 12 degrees. Every one
made between 1 and 5 checks of `test_drift.js` fail, and of the four that were also run through the
built app three made 3 or 4 checks of `test_drift_car.js` fail (the fourth, the silent rule asking the
steering, shows in no scene of that test). With a comment changed and nothing else, both pass with
their counts. The script is in the checks folder, not in the repository.

### What was not done, in this part

- Nothing ran on a car, a head unit or Node.js 8.
- `kit/`, the other three apps and their tests were not touched. Of the app only `angle.js` was
  changed: the stuck rule's one condition, one figure in its table, one small function, and its
  comments. `learn.js`, `drift.js`, `score.js`, `series.js`, `session.js`, `store.js`, `car.js`,
  `feed.js`, the screens and the manifest were not touched. No setting, no text on a screen and no
  saved field changed.
- The checkers' probes and cars are not in the repository, and this round's are not either.
- Every scene of this part is a script of a motion, as in the whole record. This round's healthy cases
  hold a wheel still to the last count by script; its faulty cases freeze a value by script. Neither
  was tried with a driven car model.
- The amount was swept on the engine alone; through the whole app only the final figure was run. The
  first reviewer's cars Y and Z were run in the checker's probe only.
- The earlier rounds' breaks (7 of part 6, 16 of part 5) were not run again.
- No random fleet of cars, as before. Each new check is one run of one scene.

## 8. What a fifth check found

Part 7 was read and tried again by one checker who had not written it: every earlier probe on the files
before and after part 7, and probes of their own against part 7's condition from both sides, a healthy
steering and a faulty one, on the first reviewer's made-up cars, on the second checker's, on this
repository's own and through the whole built app. The verdict was "fix first", for two limits that
parts 6 and 7 had not said, one sentence that said too little and one check that was too loose. This
part is that list. **No line of code in the app was changed for it**: comments in `angle.js`, scenes
in `test_drift.js`, and words ("Why nothing in the engine was changed" says why). All of it is from
a PC and from made-up cars, as everything in this record.

Every figure of this part was measured again for it: the checker's probes, run where they lie on
exports of the files of parts 4, 5, 6 and 7, at 20 samples a second on clean data (but for two runs in
point 1 that are named there as made at another rate and with sensor faults). The app's files of
part 7 are those of this part but for comments. The probes are not in the repository.

### What was found

**1. A healthy steering in a slow, tight drift is taken for stuck.** Part 7 gave the stuck rule one
condition more: with 20 degrees or more shown, a stretch is "not straight" only if the front wheels are
turned 10 degrees or more into the slide. It named the price (a healthy wheel held still with less
than 10 degrees of it into the slide is taken for stuck) and measured it on 832 cases, in none of which
a clean drift was flagged or a drift cut in two. Those 832 had no slow, tight drift among them, and
that is where a car holds its wheel under 10 degrees by its own geometry. The front wheels point down
their own path. At the front axle that is the drift angle less the front axle's distance from the
centre of gravity times the yaw rate over the speed (and less the front tyres' slip), and that share is
large in a tight circle at low speed. On the first reviewer's car a drift shown as 19.7 degrees through
a corner of 0.6 g at 30 km/h is held with 9.9 degrees of opposite lock; on the second checker's, 19.0
degrees at 0.5 g and 25 km/h with 9.6; on this repository's, 19.3 degrees at 0.7 g and 30 km/h with
9.0; and a corner of 0.85 g at 22 km/h on the first reviewer's car with the wheels 12 degrees INTO
the turn.

If the wheel's value then sits still to the count for 2 s or more, through a straight slide (the car's
nose stops turning) and the corner after it, the slide counts as a straight for the stuck rule and
the healthy steering is taken for stuck. The checker's probe on two cars: a corner of 0.14 to 0.85 g at
22 to 40 km/h on grip 0.15 to 1, with 20 to 45 degrees of drift scripted; a straight slide of 1 or 2 s;
the corner again for 6 or 12 s; the wheel held, to the count, as it stood 2 s into the first corner;
steering sent every slot and sent on change. The files of part 6 against the files of part 7:

- **One straight slide** (1800 held cases a car): 140 were newly taken for stuck on the first
  reviewer's car and 80 on the second checker's. In 10 and 2 of them a drift that carried no flag on the files of part 6 now
  carries NO STEERING CHECK and sets no best; in 126 and 78 the flag came beside another. One line
  of the first reviewer's car, 0.6 g at 30 km/h with a slide of 1 s: on the files of part 6 one drift of 319
  points, backed 88 %, no flag, the steering never taken for stuck; now 335 points, backed 46 %,
  NO STEERING CHECK, the steering taken for stuck from 11.2 s on, in the corner after the slide,
  until the wheel is let go.
- **Two straight slides** (3600 held cases a car): once the steering counts as stuck the rest rule
  leaves it out, so in the second slide the car counts as at rest (the yaw rate and the sideways
  acceleration are both small in a straight slide). The angle is pulled to zero in the middle of a
  real slide, the drift ends there and a second one is counted after it. 256 drifts on the first
  reviewer's car and 160 on the second checker's were cut in two that way, each of them one drift on the files of part
  6. The worst error of the angle in the changed cases was 5.0 and 3.1 degrees at most before and
  is 19.0 to 44.8 and 20.8 to 39.9 now. Every one of the cut drifts carried ANGLE UNSURE before. (Two
  more runs, made when this part was checked: at 50 samples a second, and at 20 with the first
  reviewer's sensor faults, 3 of 252 and 3 of 276 cut drifts on the first reviewer's car had carried
  no flag: one clean drift of 712 to 1060 points became two flagged ones.) (In
  48 and 16 of the changed cases the files of part 6 took the steering for stuck too, later in the
  scene, after the second slide.) This is part 6's first finding again: there a steering sent on
  change with the wheels at their lock, here a steering in a slow, tight drift, sent either way.
- **A lift in place of the slide** (900 held cases a car): every line as before.
- **The wheel as the car's own** (the controls, as many again: 6300 a car): every line as before.
  The car's own wheel moves when the car slides straight.
- **Through the whole built app** on the stand-in car (the checker's probe: every steering source
  sent every slot, 0.65 g at 28 km/h, two straight slides of 1.5 s, the wheel held at the 9.3
  degrees of opposite lock it has in the corner). On the files of part 6: one drift of 672 points
  flagged ANGLE UNSURE, 25.9 degrees shown at the end of the second slide for a true 27.0, no line
  under the drawn car, "Steering check: on" on the Signals tab. On the files of part 7: in the
  second corner the line STEERING SILENT OR STUCK: NO BEST IS SET stands under the drawn car and
  the Signals tab says "Steering check: the steering is silent or stuck"; 1.2 degrees are shown at
  the end of the second slide for a true 27.0; and two drifts are counted, 307 points (NO STEERING
  CHECK) and 89 (ANGLE UNSURE, NO STEERING CHECK). With one slide (0.7 g at 29 km/h): 436 points
  flagged ANGLE UNSURE before, 433 flagged NO STEERING CHECK now. A clean drift that gains the flag
  was measured on the engine alone, not through the whole app.

**How that stands against the earlier parts.** Of the cases above, part 7 changed 412 on the first
reviewer's car and 240 on the second checker's. On the files of part 6 no clean drift was flagged in them and none was cut
in two. On the files of part 5, whose stuck rule asked for neither the angle shown nor the wheels, the
steering was taken for silent or stuck in every one of them, and where it is sent every slot (260 and
120 cases) part 5 gave the very line the files give now. On the files of part 4, which had no rule for
a value that is still sent, a steering sent every slot was never taken for stuck in them, and one sent
on change was taken for silent in every one (152 and 120). So part 6's limit on the angle shown had
covered this wheel, and part 7's condition uncovered it again where the wheel stands less than 10
degrees into the slide.

**How still the value has to be.** All of it takes a value that does not move by one count for 2 s.
The checker's probe once more, on the first reviewer's car with other steering counts (its slow, tight corners
on grip 0.6 and 1, one slide and two: 1080 held cases), the held wheel still to the count or wandering
by about 0.05, 0.2 and 0.5 degrees at the wheels (three slow waves), the files of part 6 against the
files of part 7. Each cell: newly taken for stuck / a clean drift flagged / a drift cut in two.

| one count, degrees at the wheels | still to the count | wandering by 0.05 | by 0.2 | by 0.5 |
|---|---|---|---|---|
| 0.01 (the car as it is) | 308 / 10 / 216 | none | none | none |
| 0.1 | 308 / 10 / 216 | none | none | none |
| 0.5 | 316 / 10 / 224 | 316 / 10 / 224 | 316 / 10 / 224 | none |
| 1 | 272 / 8 / 192 | 272 / 8 / 192 | 272 / 8 / 192 | none |

No car's steering counts are known, nor whether a value in the middle of the wheel's travel flickers
by a count while the hands hold it. With a value that moves by a count within 2 s none of this
happens.

**2. A steering that dies at the lock in a drift that then fades out slowly is believed to the end of
the drive.** Not new in part 7: the files of part 6 give the same output to the last character. The
steering dies, or sticks, with the wheels at their lock in a real drift, and the driver then takes the
angle off slowly while the car goes on turning. The dead value at the lock reads as opposite lock and
holds the angle shown up as the true one falls. On the straights after it 20 degrees or more stand on
the screen, on that value's own side. So the silent rule sees no straight (20 or more are shown), the
stuck rule sees none either (20 or more are shown and the wheels read far more than 10 degrees into
it), and the rest rule, which would pull the angle to zero, waits for a steering near its centre. The
dead value meets every one of those conditions by itself.

The checker's probe on two cars: the steering dies, or sticks on a car that sends it on change, or in
part of the cases sticks and is still sent every slot, 2.5 s into a drift of 45 or 55 degrees at 70
km/h with the wheels at 35 and 37 degrees. The drift then fades out over 5 to 30 s into a corner of
0.35 g; or it is brought down to 15, 20 or 25 degrees over 6 s, held for 8 s and ended in 1.5 s. Then
three laps with full grip, never under 40 km/h, with one real drift of 40 degrees in each. 49 cases
with a fault on each car:

- **Believed to the end of the drive** where the fade took 13 s or more on the first reviewer's car
  (22 cases) and 14 s or more on the second checker's (20 cases), whether the value was still sent or not. In each of them
  the steering was never taken for silent or stuck. ONE drift was counted, the one in which the fault
  came: it ran on for 72 to 90 s, through the fade, the corners and the straights, until the angle
  shown passed 100 degrees (5461 to 8510 points, grade S, flagged ANGLE UNSURE and SPIN, in part of
  them NO STEERING CHECK as well, so no all-time best). None of the three real drifts of the laps was
  counted, 199.5 and 198.3 degrees stood on the screen at the end, and nothing could start: after a
  spin nothing starts until the car has gone straight, and the rest rule never says that it has.
- **Found** where the drift faded out within 12 s (13 s on the second checker's car), and in all nine cases a
  car in which it was brought down, held and ended quickly: all three real drifts counted.
- **On the files of part 5** every one of the 49 was found on both cars, and no real drift was lost.
  On the files of part 4 a steering that had died or was sent on change was found in every one of
  them as well; a value that sticks and is still sent every slot was not (part 4 had no rule for
  it). It is part 6's limit of 20 degrees on the angle shown that the dead value keeps itself above.
- No false drift without a flag came of it in any case.

It takes a sensor fault with the wheels at their lock, and a slow fade.

**3. Part 7 said "one car" where it was two. Words only.** Part 7, point 1, wrote of the checker's 23
cases on the files of part 6 that "on one car the steering was never taken for stuck in 6 of the 23".
Run again on those files: never in 6 of the 23 on the first of the first reviewer's three cars and
in 19 of the 23 on the third, and in none on the two other cars. The sentence says so now. It
understated a state that part 7 cured; nothing else hangs on it.

**4. The tests held the amount of 10 degrees from above only.** With `SIDEWAYS_STEER_DEG` set to 6 in a
scratch copy, `test_drift.js` as part 7 left it passed with all its 295 checks, although part 7's own
table says that 5 leaves the state of its point 1 and 8 leaves one of part 6's 43 cases unfound: the
frozen value of the test's scene reads about 6 degrees. The test now has that scene a second time
with a slower first corner (0.45 g at 34 km/h, and one lap), in which the value freezes at 8.1 degrees
as the engine reads it. It is taken for stuck 37.7 s into the drive, 0.0 degrees are shown on the
straights at 90 km/h, and the real drift is counted (918 points, NO STEERING CHECK). With the amount
at 6 or at 8 that check fails (never stuck, 40.5 degrees on those straights, the real drift not
counted), and so do three checks of point 1's scenes.

### Why nothing in the engine was changed

The lead's decision for 1.0.0 BETA. Three rounds have each traded one case of the rules for a silent
or stuck steering for another, each on made-up cars. Part 5's rule for a stuck steering found a value
that is still sent, and took a healthy wheel at its lock for stuck. Part 6's limit on the angle shown
cured that, and opened the state in which a stuck value is believed for minutes (part 7, point 1) and
the one of point 2 above. Part 7's condition closed the first of those for values under 10 degrees,
and took a healthy wheel in a slow, tight drift for stuck again (point 1 above). The checker tried one
more condition in a scratch copy and called it a part cure; it was not built.

Every case that is left depends on things nobody knows before a car has been driven: whether a
steering value can sit still to the last count for 2 s while the wheel is held, at the lock or
anywhere else; whether it is sent every slot or only when it changes; how fine its counts are; and
whether it can freeze, or die, while the rest of the car's data goes on. A fourth trade on made-up
cars would settle none of them. So the files do what part 7 left them doing, what that costs is
written down, the cases are held by scenes in the test so that a later change shows in them, and
the first car's data decides.

### What is written down, and what the test holds now

- **Words.** The README ("What changed", "What the driver sees", "Known from the PC and not solved",
  "Not tested, and not known"), the head comment of `angle.js`, both first-car lists, and the
  sentences of parts 1 to 7 that these findings made untrue or too narrow, each with "(part 8)"
  beside it. In particular: "a steering that dies in the middle of a corner is believed until the
  car has gone straight" holds since part 6 only where less than 20 degrees are shown on that
  straight; part 7's "in none of the 832 did a drift that had no flag get one" is true of those 832
  cases and not of the condition; and "on a steering sent on change every one of these cases was
  found" is true of the cases it was written about and not of point 2.
- **`test_drift.js`: 8 checks more (303), part "what the fifth check found"**, on its own made-up
  car, clean, 20 samples a second:
  - a slow, tight drift (0.7 g at 30 km/h: the car 19.3 degrees sideways in the corner and 26.0 in
    the straight slide, its wheels at 9.0 degrees of opposite lock), with one straight slide of 1 s
    and with two of 2 s. With the wheel as the car's own the steering is never taken for stuck, and
    each is one drift (no flag with one slide, ANGLE UNSURE with two);
  - KNOWN LIMIT, pinned: the same with the wheel held still to the count, one slide. Taken for
    stuck from 11.1 s on; one drift of 323 points flagged NO STEERING CHECK (321 points and no
    flag on the files of part 6);
  - KNOWN LIMIT, pinned: two slides. Taken for stuck from 12.1 s on; 0.2 degrees shown in the
    second slide for a true 26.0; two drifts, 339 and 56 points, both flagged NO STEERING CHECK;
    the angle up to 25.9 degrees wrong (one drift of 655 points, and 24.2 degrees or more shown
    there, on the files of part 6);
  - what keeps it away: the same held wheel with the hands wandering by about 0.05 degrees (this
    car's steering counts in steps of 0.01). Never taken for stuck, one drift each, no flag with
    one slide, 24.2 degrees or more shown in the second slide;
  - a drift of 45 degrees at 70 km/h that fades out over 20 s into a corner of 0.35 g, then two
    laps with one real drift each. With the steering alive: three drifts, no flag;
  - KNOWN LIMIT, pinned: the steering dies 2.5 s into that drift, the wheels read 34.9 degrees
    into the slide (and the same with a value that sticks there and is still sent). Never taken
    for silent or stuck; one drift of 6927 points and 79.49 s flagged ANGLE UNSURE and SPIN;
    neither real drift counted; 198.8 degrees shown at the end; nothing can start. On the files
    of part 5 the dead steering was found 34.4 s into this drive and both real drifts were counted;
  - the same with a fade of 12 s: found 26.4 s into the drive, both real drifts counted and
    flagged NO STEERING CHECK;
  - the amount held from below (point 4).
- **`test_drift_car.js` was not changed.** No state and no picture of the app moved, and the two
  limits are in no scene of that test. Through the whole app they were seen in the checker's probe
  only.

### What a first car has to show

Both first-car lists ask for these now (the engine's points 2 and 12, the whole list's points 3 and
6). They decide which of the cases of parts 5 to 8 can happen on a car at all:

1. **The steering's raw value on the Signals tab, watched for a few seconds with the wheel held
   still**: at its lock, and a little off centre; standing, and by a passenger in a long steady
   corner. Does it flicker by a count, or sit still to the last count for 2 s or more?
2. **How fine one count is**: the scale the Signals tab gives, in degrees at the wheels per count.
3. **Whether it is sent on a schedule or only when it changes**: does its row on the Signals tab
   show a rate while the wheel is held still?
4. **In slow, tight drifts on the pan**: the opposite lock the Last tab gives; whether the line
   STEERING SILENT OR STUCK comes up while the steering works; whether a drift that looked clean is
   flagged NO STEERING CHECK; and whether one drift with a straight slide in it is counted as two.
5. **After a long drift that is let fade out slowly**: does the angle come back to zero on the next
   straight, and does the steering's row still show a rate?

If the value flickers by a count while the wheel is held, point 1 above cannot happen as it did on
the PC. If it sits still (with counts of half a degree or more it did on the PC even under hands
that wander), the stuck rule's amount, or the rule, has to be looked at again with that car's data.
Whether a steering signal ever freezes or dies on a car is not something a first drive can show.

### Can the new checks fail

In a scratch copy the amount `SIDEWAYS_STEER_DEG` was set to 6, to 8 and to 25, one at a time, and
`test_drift.js` run on each: 4, 4 and 3 checks fail (with 6 and with 8 three checks of point 1's
scenes and the one of point 4; with 25 three checks of the scenes of parts 6 and 7). The test as
part 7 left it passed with the amount at 6 and at 8, and failed with 25. With a comment changed and
nothing else the test passes with 303. And the test as it is now, run on the files of the earlier
parts: the two pinned checks of the tight drift fail on the files of part 6 (the wheel is not taken
for stuck there), and the pinned check of the fading drift fails on the files of part 5 (the dead
steering is found there). The script is in the checks folder, not in the repository.

### What was not done, in this part

- Nothing ran on a car, a head unit or Node.js 8.
- No line of code in `apps/pps_drift` was changed. Every file of the app is the same bytes as part 7
  left it but `angle.js`, and that one differs in comments only: the same tokens in the same order,
  checked with the parser that ships inside Node.js. `kit/`, the other three apps and their tests
  were not touched. No setting, no text on a screen and no saved field changed, and
  `test_drift_car.js` and what it draws are as they were.
- The two limits are not cured. The checker's trial condition was not built and not run again.
- The figures of this part are from 20 samples a second on clean data, on the first reviewer's car
  and the second checker's, the whole-app figures on the stand-in car. The checker also ran other
  rates and the first reviewer's sensor faults; of those runs only two were made again, when this
  part was checked (point 1: the cut drifts that had carried no flag), and the figures of the
  others are not in this part.
- Every scene is a script of a motion, as in the whole record: a wheel held still to the count by
  script, a value that dies by script, a drift that fades by script. None was tried with a driven
  car model.
- The checkers' probes and cars are not in the repository.
- The earlier rounds' breaks were not run again. No random fleet of cars, as before. Each new
  check is one run of one scene.
