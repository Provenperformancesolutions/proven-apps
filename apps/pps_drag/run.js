'use strict';
/**
 * run.js - Proven Drag: the timing engine. Pure logic: it is handed (time, speed) samples and the clock,
 * and touches neither the car nor the wall clock.
 *
 *   const eng = new RunEngine({ start: 'slip', unit: 'kmh', series: 'notified', onChange: true,
 *                               scale: () => ({ factor, source }), onLaunch: (t0) => ..., onDone: (summary) => ... });
 *   eng.feed(t, kmh, took) every speed sample of ONE series (t: ms on a clock that only runs forward; took: ms
 *                         the getter read took, for a polled sample)
 *   eng.idle(now)         often (every 50 ms) in between: a standing or steady car sends nothing
 *   eng.state             'wait' (moving: stop to arm) -> 'ready' (stood for 1 s) -> 'run' -> 'wait'
 *   eng.elapsed(now), eng.results(), eng.summary(), eng.trace(), eng.progress(), eng.reset(), eng.configure()
 *   eng.disarm()          its series has gone quiet: do not arm on what it last said
 *   eng.silent()          its series has stopped in the middle of a run: the run ends with what it has
 *
 * Modelled on the kit's run timer (kit/runtime/run_timer.js, idrive7-apps, MIT): its three states, its
 * creep rule and its idle() are kept. What is Proven's own is listed here, because each point changes a time.
 *
 * WHAT IT ASSUMES ABOUT THE CAR (nothing here was measured on a car)
 *   - No sample carries the car's own time. t is when the app's handler ran, so a time is only as good as
 *     the delay between the car and the handler is CONSTANT. A constant delay cancels (start and finish
 *     are late by the same amount); a delay that varies from sample to sample goes straight into the result.
 *   - Speeds under 0.5 km/h count as standing, and "first movement" is the moment the speed passes
 *     0.5 km/h (the brief's definition), not the instant the car begins to move: that is 0.01 to 0.2 s
 *     earlier, depending on how gently the car pulls away.
 *   - HOW THE SPEED SIGNAL BEHAVES UNDER 0.5 km/h IS NOT KNOWN. It may read every speed from 0 up, or read
 *     0 until the car does 0.5, 1 or 2 km/h. The engine looks: the smallest speed above 0 its series has
 *     ever reported (lowSeen, in every run's log line). Once that is 0.1 km/h or less, a 0 is taken as a
 *     real 0. Until then the launch is placed so that it is right either way (see below). A signal that
 *     reads 0 until the car does 1 km/h or more makes every time from first movement read SHORT, by the
 *     time the car took to get there: 0.03 to 0.2 s depending on how hard it launches. That is not
 *     corrected, and the +- only covers it when the first moving samples show it (a hard launch); on a
 *     gentle start it does not.
 *   - A series either sends every slot (the polled getter, onChange: false) or only when the value changed
 *     (the notifier, onChange: true). The slot length is read off the samples themselves (the middle one
 *     of the run's first 8 spacings).
 *
 * THE LAUNCH INSTANT (t0 = the moment the speed passed 0.5 km/h)
 *   Placed from the first three moving samples (two, if only two exist by the time the first is 300 ms
 *   old) and the last standing one, once the sample after them has come in (until then the third may
 *   still be replaced as stamped late, see below). Never later than the first moving sample; never
 *   earlier than the last moment the car was known to stand: its last standing sample, or (on-change
 *   series) one sample spacing before the first moving sample, whichever is later. Until those samples
 *   are in, t0 is the kit's straight interpolation from the standstill idle() carried forward, and the
 *   results on screen may shift by a few hundredths in the first half second.
 *   The brief asked for a straight line through the moving samples, run back to 0.5 km/h. Measured on the
 *   test model (proven/tools/test_drag.js prints both), that line places the launch too LATE whenever the
 *   acceleration builds up over a moment instead of being there at once (by 7 ms on average at 50 ms
 *   spacing, 11 ms at 100 ms, up to 43 ms), so 0-100 read short. So a launch model is fitted by least
 *   squares to the same samples plus the last standing one: the car stands until ts, its acceleration
 *   rises in a straight line over T ms and then stays. T = 0 is the brief's straight line.
 *   Three cases (the first review found the model alone placing the launch late in two of them):
 *   1. The last standing sample is a real reading above 0 (0.2, 0.48 km/h): the two samples around
 *      0.5 km/h pin the launch between them. The model's crossing is used if it lies within 0.3 of their
 *      spacing of the straight line between them (a curve of steady bend cannot be further off); if not,
 *      the model contradicts the two samples (brake released, then throttle: a kink it cannot follow) and
 *      the straight line between them is used ('between').
 *   2. The last standing sample reads 0, and this series has shown that it reports speeds down to
 *      0.1 km/h or less: the 0 is a real 0, the model is used.
 *   3. The last standing sample reads 0 and it is not known what a 0 means: if the signal reads from 0
 *      the model is right and the straight line late; if it reads 0 under 0.5 km/h the straight line is
 *      right and the model late. The EARLIER of the two is used, and their difference is added to the +-.
 *   Where the placement had to be held at the last standstill or at the first moving sample, the whole
 *   launch gap is added to the +- (not a quarter of it).
 *   fit: 'line' gives the brief's method alone; the summary says how far the two were apart (launch.line).
 *   A LAUNCH THE SERIES SAW LATE (the second check found the app held up at the launch placing it late
 *   with a small +-). Four signs, each in the summary's launch record:
 *   - late: the first moving sample(s) were stamped late and taken back (they arrived in a lump, or the
 *     next sample showed it, see SAMPLES STAMPED LATE), or the last standing sample arrived together
 *     with the first moving one. Then nothing says when the car stood last. The launch is run back from
 *     the samples that remain (model or line as above, as far as 2 s), and the whole stretch it was run
 *     back over is in the +-.
 *   - tickLate: idle() had not been called for far longer than its usual spacing when the first moving
 *     sample came (1.5 times the middle one of its last 8 spacings, plus 10 ms), or had just come that
 *     late: the app was held up, and that sample may be as old. The car is then only known to stand
 *     until the last idle() before the hold-up, and the whole gap from there is in the +-.
 *   - uneven: an on-change series sends on a grid. If its first three moving samples are not evenly
 *     spaced (by more than 5 % of the spacing and 1 ms), one stamp was late by about the difference: that
 *     is added to the +-. Placed with two samples, the third shows it when it comes (added twice: with
 *     two samples a late stamp moves the launch by up to twice as much). Spacings of more than 500 ms
 *     are left out of this: they are a silence or a hole, not a send slot with a late stamp.
 *   - the last standing sample of an on-change series closer to the first moving one than the moving
 *     ones are to each other: its stamp was late by what is missing. The car stood one spacing before
 *     the first moving sample, and what the stamp was late by is added to the +- (also under uneven).
 *
 * DISTANCE is the speed summed up in trapezoids from t0. Between two samples the speed is taken as a
 * straight line, so a distance line is crossed where that parabola of distance reaches it (not at a
 * straight share of the step), and a speed where the line reaches it. Up to the first moving sample the
 * distance is the fitted launch curve's.
 *
 * SILENCE ON AN ON-CHANGE SERIES. "Nothing arrived" means "nothing changed" only if what arrives next
 *   fits that: after more than 1.6 slots of silence, the next sample may differ from the last one by what
 *   the speed was doing per slot before the silence (1.5 times that, plus 1/32 km/h). Then the speed is
 *   taken as unchanged until one slot before the new sample (a gear change, a steady speed). If the step
 *   is bigger, or the glitch filter dropped a sample in the silence, samples are MISSING (a lost
 *   notification, a dropped glitch, the app held up): the speed is a straight line across the hole, as
 *   it is for a polled series. While the silence lasts, idle() carries the speed forward (3 s at most) so
 *   that a line is crossed and the run ends on time; that is taken back when the next sample shows a hole.
 *   A hole longer than 2.5 slots is recorded (summary.holeMs), and what it may hide in distance (the
 *   change of speed across it x its length / 4) goes into the +- of every distance split after it.
 *
 * SAMPLES STAMPED LATE. A stamp says when the app's handler ran. If the app was held up (a file write,
 *   a frame drawn in software, the garbage collector), a sample waits and is stamped late; the next one
 *   comes on time. Counted in summary.merged:
 *   - A sample stamped less than 2 ms after the one before it replaces that one: they arrived together,
 *     and the earlier one was already old (the app was held up, or the car delivers its notifications in
 *     lumps). A lump counts as one sample of the series, stamped when it arrived.
 *   - An on-change series is never sent closer together than its send slot. So a sample stamped less than
 *     three quarters of a slot after the one before it also replaces that one, if it comes more than 1.75
 *     slots after the sample before that (it is where a sample is due; a series that simply sends faster
 *     than the slot measured is left alone, and if samples go on replacing each other for more than a
 *     second the rule is switched off for the rest of the run). The stretch across the sample taken out
 *     is a hole: a straight line, with what it may hide in the +- (above), and in summary.holeMs if it is
 *     longer than 2.5 slots.
 *   - A late stamp that stays (less than a quarter of a slot late): the spacing after it is short by what
 *     it was late by. That goes into the +- of a line crossed in the step before it or after it, and half
 *     of it times the speed gained across the two steps into the +- of the distance splits after it.
 *   - A step UPWARDS of more than 25 m/s2 is judged over the time the two readings can really be apart:
 *     one send slot at least on an on-change series; the stamps plus half of both round trips on a polled
 *     one. If it is still a step and the next sample confirms it, the sample before it was stamped late if
 *     (a) it had replaced a late sample itself (the end of a lump: its stamp says when the app got to it),
 *     from the sample before that the step is none, and the launch is not placed yet, or the slot is not
 *     known, or this run's samples have been seen to arrive out of order (below), or (b) it is the run's
 *     first moving sample and the step ends at 20 km/h or less, or (c) the slot is not known yet, the wait
 *     before it was more than twice as long as the spacing after it, and from the sample before it the step
 *     is none. Then it is taken out and the run goes on. Otherwise the series itself jumped, and the run
 *     ends ('jump').
 *   The second check found the code before this ending clean runs as a 'jump' when one notification was
 *   stamped 40 to 300 ms late: the step test divided the speed gained in a whole slot by the few ms
 *   between two stamps.
 *   A READING THAT IS TOO HIGH, RIGHT AFTER A LATE STAMP (the check after that found the rules above taking
 *   a reading 5 to 40 km/h too high for real when it followed a late stamp or a hold-up: it was only judged
 *   from the sample BEFORE the one taken out, over two slots or over the whole hold-up, and a 0-100 was
 *   made up from it):
 *   - A sample taken out as stamped late is still a reading of the car, sent one slot before the sample
 *     that replaced it. So the one that replaces it is judged against that reading too, over one send slot
 *     (or their stamps, if further apart; 20 ms at least, as in the plain test). More than 25 m/s2 above
 *     it: held back like any step, and if the next sample confirms it the run ends ('jump'). A late stamp
 *     excuses nothing there.
 *     (The 20 ms were missing at first. Early in a run the slot is only the middle one of a few spacings,
 *     and with stamps up to 15 ms late it came out at 11 to 13 ms on a series that sends every 20 ms. One
 *     slot's real gain of a quick car then read as a step, and the clean launch was thrown away. Found by
 *     the third check, on a PC with made-up cars. Not covered by the floor: a longer slot that is taken
 *     for much shorter than it is. With the speed sent every 50 ms, stamps up to a whole slot late and a
 *     signal in steps of 0.5 km/h, 4 of 8000 launches of two made-up cars were still lost that way.)
 *   - That needs the samples to arrive in the order they were sent. If a sample comes right behind another
 *     (less than three quarters of a slot) and reads lower by more than 12.5 m/s2 over a slot, or a stamp
 *     does not run forward, they do not (summary.disorder): from then on in that run a reading that was
 *     taken out says nothing about the next one, and rule (a) above holds as it did. A wrong reading next
 *     to a late stamp sets that mark too, although nothing arrived out of order: the engine cannot tell
 *     the two apart.
 *   - A polled series is judged as it was before that check: over the stamps plus half of both round
 *     trips, and no closer. With reads of 25 ms a step of up to about 6.7 km/h passes (more with slower
 *     reads). A second, stricter look at a polled step was added after that check (over the stamps alone,
 *     and against twice what the car had gained over its last three steps). It is OUT again: the third
 *     check found it ending clean runs of quick cars as a 'jump' (up to 35 of 2000 launches of a made-up
 *     car with reads of 40 ms, give or take 15; far fewer with reads of 25 ms, give or take 10, which is
 *     what its own tests used).
 *     Two reads that fall unevenly in their round trips can be twice as far apart as their stamps say,
 *     and right after a gear change the car had gained next to nothing to compare with.
 *   What is NOT seen, as before: a reading too high by less than 25 m/s2 times the time since the reading
 *   before it (about 4.5 km/h at 50 ms, 9 at 100 ms, 18 at 200 ms; on a polled series that time includes
 *   half of both round trips), one whose first wrong sample is itself stamped late or that begins while
 *   the app is held up (it is judged over that longer time), and on a polled series one that begins right
 *   after a hole in it (no read is made while the app is held up).
 *   The send slot is the middle one of the run's first 8 spacings that are not holes; before that the
 *   middle one of the spacings so far (three or more), before that the slot of the series' last run.
 *
 * THE UNCERTAINTY FIGURE (pm, seconds, shown as +-) covers SAMPLING ONLY: how far off the launch instant and
 * the crossing can be because the car only says its speed every so often. It does not cover a wrong speed
 * scale (tyre size: 0.05 s per 1 % on 0-100 km/h for a 3 s car, 0.24 s for a 12 s car), a slope, wheelspin,
 * a speed signal that lags, or a delay that is not constant.
 *   from first movement:  max(0.01, launchGap / 4 + gapAtCrossing / 4)
 *   after the first foot: max(0.01, launchGap / 16 + gapAtCrossing / 4)        rounded up to 0.01 s
 *   launchGap = first moving sample - last known standing; gapAtCrossing = the spacing of the two samples
 *   around the crossing. That is the brief's formula. Added to it, each only where the data show it:
 *   - launch.early: where the straight line through the first moving samples says the car passed
 *     0.5 km/h BEFORE it was known to stand, the first moving sample was already fast (the series saw
 *     the launch late, or the speed signal reads 0 until the car is rolling). In full.
 *   - launch.apart: case 3 above, the time between the model's and the straight line's launch; the rest
 *     of the launch gap where the launch was held at one of its ends; and what a launch seen late adds
 *     (above: the stretch it was run back over, the gap after a late tick, uneven first samples). (A
 *     quarter of all that for splits timed after the first foot, as the brief does with the launch gap.
 *     But only where the series saw the first foot: if it was covered before the first moving sample, the
 *     rollout point is known no better than the launch, and those splits get the full figure.)
 *   - a stamp beside a crossing that is known to have been late, by what it was late (above).
 *   - the speed split: the 100 km/h crossing is also worked out by running the line of the two samples
 *     before it forward and the line of the two after it back. If the three differ by more than a quarter
 *     of the sample gap (a gear change beginning or ending right there), their spread takes its place.
 *     And where the speed was heading past 100 km/h in an earlier step and the next sample fell just
 *     short of it (within 1 km/h, and by no more than a car loses in a gear change), the car may have
 *     touched 100 there and fallen back: that moment counts as a fourth crossing for the spread.
 *   - distance splits: what the holes before them may hide (above), as time at the speed at the line.
 *   - a polled series: half the middle round-trip time of its getter reads (the car read the value
 *     somewhere in that round trip; the sample is stamped at its middle).
 *   - a polled read that took FAR LONGER than this getter's reads usually do (more than 1.5 times the
 *     middle one of its last 16, plus 10 ms): the app was held up while the answer was on its way, or the
 *     car answered late. It is stamped at its middle like the others, but the car may have read the value
 *     at the very beginning or the very end: half of what it took longer is what its stamp may be off by.
 *     That goes into the +- wherever that sample counts: the launch, if it was the last standing sample or
 *     one of the moving ones the launch was placed with (twice with two); a line crossed in the step before
 *     it or after it; the rollout point of a split timed after the first foot; and, as distance, every
 *     distance split after it (as a late stamp above). The check after the second one found this missing:
 *     a hold-up of 150 ms or more at the launch put the times of a polled run up to 0.1 s off with a +-
 *     that did not show it.
 *
 * FIGURES THAT ARE GUESSES (chosen by reasoning, to be checked on the first car)
 *   0.5 km/h standing threshold and 1 s to arm (the kit's); 25 m/s2 and 20 ms in the glitch filter (the
 *   brief asks for it against deceleration, a lone 0 in the middle of a run; it is applied to a lone jump
 *   upwards as well; a jump upwards that the next sample CONFIRMS ends the run at the sample before it,
 *   ended 'jump', unless the sample before it was stamped late: nothing a speed signal says after such a
 *   step is used for a time); 500 ms before a
 *   held-back sample is fed after all; 500 km/h as the most that counts as a speed; 300 ms and three
 *   samples for the launch fit; ramp lengths 0 to 400 ms in the launch model; 0.3 of the spacing between
 *   the model and the two samples around 0.5 km/h; 0.1 km/h as the reading that shows a signal reads from
 *   0; 20 km/h as the highest first moving sample that still counts as a launch seen; 5 km/h for a creep
 *   and for the lift that ends a run; 60 s as the longest run; 1.6 slots of silence before it is looked
 *   at, 1.5 times the step before plus 1/32 km/h as what still counts as "no change", 2.5 slots for a
 *   hole, and 3 s as the longest silence idle() fills; 2 ms for samples that arrived together; three
 *   quarters of a slot, 1.75 slots and 1 s in the rule for a sample stamped late, 5 % of a slot (and 1 ms)
 *   as the least lateness that counts, 250 ms as the longest slot those rules reckon with, 2 s as the
 *   furthest a launch seen late is run back, 1.5 times its usual spacing plus 10 ms for a late tick; half
 *   of 25 m/s2 as the fall that shows samples out of order; 1.5 times the usual round trip plus 10 ms for
 *   a read that took far longer, and 16 reads (4 at least) for what is usual; peak g
 *   over 250 ms (500 ms on a polled series, whose stamps are less even); 5 km/h per second as the most a
 *   car loses in a gear change; a series that sends every slot and repeats one value above 5 km/h is
 *   timed for how long it does (summary.frozenMs: a getter that answers with an old value).
 */
const LAUNCH_KMH = 0.5;        // under this the car counts as standing
const ARM_MS = 1000;           // standing this long arms the timer
const ROLLOUT_M = 0.3048;      // one foot
const TRAP_M = 20.1168;        // 66 ft: the stretch a drag strip takes the trap speed over
const CREEP_KMH = 5;           // a roll that never passed this and stops again is a creep
const LIFT_KMH = 5;            // this far under the run's top speed: the driver has lifted, the run ends
const MAX_RUN_MS = 60000;
const MISSED_KMH = 20;         // a first moving sample above this: the series missed the launch, no run
const MAX_KMH = 500;           // above this it is no speed (the field's largest number is 1023.98): ignored
const GLITCH_MS2 = 25;         // a sample that would mean more deceleration (or acceleration) than this is held back
const GLITCH_MIN_MS = 20;      // two samples closer than this count as this far apart for that test
const GLITCH_HOLD_MS = 500;    // a held-back sample that nothing follows is fed after this long
const FIT_N = 3, FIT_MS = 300; // the launch fit: the first three moving samples, or two by this age
const LATE_BACK_MS = 2000;     // a launch whose first moving samples were stamped late is run back from the later ones this far at most
const SLOT_GAPS = 8;           // an on-change series' send slot: the middle one of the run's first 8 spacings
const HOLD_SLOTS = 1.6;        // silence longer than this many slots on an on-change series: no change, or a hole
const FILL_RATIO = 1.5, FILL_KMH = 1 / 32;  // "no change": the step after the silence is at most this much of the step per slot before it, plus this
const HOLE_SLOTS = 2.5;        // a gap of more than this many slots with the speed moving across it: a hole in the series
const HOLD_MAX_MS = 3000;      // idle() carries a silent speed forward this long at most (then the series may be dead)
const BURST_MS = 2;            // a sample this soon after the one before it replaces it (they arrived together)
const LATE_SHARE = 0.75;       // an on-change series: a sample stamped less than this share of a send slot after the one before it replaces it (that one was stamped late) ...
const LATE_REACH = 1.75;       // ... if it comes more than this many slots after the sample before that one (it is where a sample is due: two slots on, less a quarter)
const LATE_SPAN_MS = 1000;     // ... and only while the samples replaced that way in a row span no more than this
const LATE_MIN = 0.05;         // a spacing this share of a slot (and 1 ms) short of a slot: the earlier stamp was that late, and the +- says so
const SLOT_MAX_MS = 250;       // the longest send slot these three rules reckon with
const UNEVEN_MAX_MS = 2 * SLOT_MAX_MS;  // the first moving samples: a spacing longer than this is a silence or a hole, not a slot with a late stamp
const PEAK_MS = 250, PEAK_POLLED_MS = 500;  // peak g: the largest gain in speed over a stretch at least this long
const BRACKET = 0.3;           // the model may place the launch this share of the spacing from the line between the two samples around 0.5 km/h
const LOW_TRUST_KMH = 0.1;     // a series that has reported a speed this small reads from 0: its 0 is a real 0
const TOOK_KEEP = 600;         // round-trip times kept per run
const TOOK_USUAL = 16, TOOK_MIN = 4;        // a getter's usual round trip: the middle one of its last 16 reads (once it has 4)
const LONG_TOOK = 1.5, LONG_TOOK_MS = 10;   // a read that took more than this many times the usual round trip, plus this: its stamp is in doubt by half of what it took longer
const NEAR_KMH = 1, FALL_KMH_S = 5;   // the speed split: a sample this close under the target, after the speed was heading past it, and how fast a car in a gear change loses speed at most
const KMH = 3.6, MPH = 1.609344, G0 = 9.80665;

/** The distance splits (metres). trap: the 66 ft average before the line is worked out too. */
const DISTANCES = [
    { key: '60ft', label: '60 ft', m: 18.288 },
    { key: '330ft', label: '330 ft', m: 100.584 },
    { key: 'eighth', label: '1/8 mile', m: 201.168, trap: true },
    { key: '1000ft', label: '1000 ft', m: 304.8 },
    { key: 'quarter', label: '1/4 mile', m: 402.336, trap: true },
];
/** Start convention -> where the clock of a speed split and of a distance split starts. */
const STARTS = {
    slip: { speed: 'move', dist: 'roll', label: 'SLIP', text: '0-100 from first movement, distances after a one-foot rollout' },
    standstill: { speed: 'move', dist: 'move', label: 'STANDSTILL', text: 'everything from first movement' },
    rollout: { speed: 'roll', dist: 'roll', label: 'ROLLOUT', text: 'everything after the first foot' },
};

const isNum = (x) => typeof x === 'number' && isFinite(x);
const ceil01 = (s) => Math.ceil(s * 100 - 1e-6) / 100;
function median(list) {
    if (!list.length) return null;
    const a = list.slice().sort((x, y) => x - y), m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/** The splits of a unit ('kmh' | 'mph') and start convention, in the order they are shown. */
function splitsFor(unit, start) {
    const ref = STARTS[start] || STARTS.slip;
    const speed = unit === 'mph' ? { key: '0-60', label: '0-60 mph', kmh: 60 * MPH } : { key: '0-100', label: '0-100 km/h', kmh: 100 };
    return [Object.assign({ ref: ref.speed }, speed)].concat(DISTANCES.map((d) => Object.assign({ ref: ref.dist }, d)));
}

/** The time (ms) at which the least-squares line through pts [{ t, v }] reads y, or null if it does not rise. */
function lineCross(pts, y) {
    const n = pts.length, t0 = pts[0].t;
    let st = 0, sv = 0;
    for (const p of pts) { st += p.t - t0; sv += p.v; }
    const tm = st / n, vm = sv / n;
    let sxx = 0, sxy = 0;
    for (const p of pts) { sxx += (p.t - t0 - tm) * (p.t - t0 - tm); sxy += (p.t - t0 - tm) * (p.v - vm); }
    if (!(sxx > 0) || !(sxy > 0)) return null;
    return t0 + tm - (vm - y) * sxx / sxy;
}

/*
 * The launch model: the car stands until ts, its acceleration then rises in a straight line over T ms to
 * `a` and stays there. Speed = a x ramp(t - ts, T): a parabola from rest that runs into a straight line.
 * T = 0 is the plain straight line (a launch that bites at once), a long T the plain parabola.
 */
const RAMPS_MS = [0, 25, 50, 75, 100, 125, 150, 200, 250, 300, 350, 400];
const ramp = (u, T) => (u <= 0 ? 0 : u < T ? u * u / (2 * T) : u - T / 2);
/** The area under ramp() from 0 to u. */
const rampArea = (u, T) => (u <= 0 ? 0 : u < T ? u * u * u / (6 * T) : T * T / 6 + (u - T) * (u - T) / 2 + T * (u - T) / 2);

/**
 * Fit the launch model to pts [{ t ms, v km/h }] by least squares (ts searched in 2 ms steps over `back` ms
 * before tFirst, then in 0.1 ms steps; T over RAMPS_MS, the shorter one on a tie; a follows from them).
 * Returns { ts, T, a (km/h per ms), cross: the time it reads y km/h }, or null if the points do not rise.
 */
function launchFit(pts, tFirst, y, back) {
    let best = null;
    const tryOne = (ts, T) => {
        let svr = 0, srr = 0, svv = 0;
        for (const p of pts) { const r = ramp(p.t - ts, T); svr += p.v * r; srr += r * r; svv += p.v * p.v; }
        if (!(srr > 0) || !(svr > 0)) return;
        const sse = svv - svr * svr / srr;
        if (!best || sse < best.sse - 1e-12) best = { ts, T, a: svr / srr, sse };
    };
    for (const T of RAMPS_MS) for (let ts = tFirst - back; ts <= tFirst; ts += 2) tryOne(ts, T);
    if (!best) return null;
    const c = best.ts, T = best.T;
    for (let ts = c - 2; ts <= c + 2; ts += 0.1) tryOne(ts, T);
    const u = y / best.a < T / 2 ? Math.sqrt(2 * T * y / best.a) : T / 2 + y / best.a;
    best.cross = best.ts + u;
    return best;
}

class RunEngine {
    /**
     * opts: start 'slip' | 'standstill' | 'rollout';  unit 'kmh' | 'mph';  series: a name for the summary;
     *   scale: a number, or a function called at each launch (with its time) -> number or { factor, source };
     *   onChange (default true): the series only sends when the value changed (the notifier). idle() then
     *     carries the standstill, and a steady speed during a run, forward by the clock. false for a series
     *     that sends every slot (the polled getter): every one of its samples is a real reading;
     *   fit 'model' (default) | 'line': how the launch instant is placed (see the top of the file);
     *   onLaunch(t0), onDone(summary).
     */
    constructor(opts) {
        const o = opts || {};
        this.series = o.series || '';
        this.onChange = o.onChange !== false;
        this.fit = o.fit === 'line' ? 'line' : 'model';
        this.scale = o.scale;
        this.onLaunch = o.onLaunch || null;
        this.onDone = o.onDone || null;
        this.start = STARTS[o.start] ? o.start : 'slip';
        this.unit = o.unit === 'mph' ? 'mph' : 'kmh';
        this.last = null;               // the last sample taken { t, v }
        this.moveSince = null;          // the first of the moving samples in a row that `last` ends, null while it stands
        this.last2 = null;              // the sample before it (for a sample that turns out to be superseded)
        this.held = null;               // a sample the glitch filter is holding back
        this.lowSeen = Infinity;        // the smallest speed above 0 this series has ever reported (km/h, as the car reports it)
        this.slotSeen = null;           // the send slot this series showed in its last run (ms), until a run has measured its own
        this.standWas = null;           // the standstill as it was before the last standing sample (_untake)
        this.lateNext = false;          // a standing sample was taken back as stamped late: a launch that follows was seen late
        this.idleT = null; this.ticks = [];     // when idle() was last called, and its last spacings (is the app's own tick on time?)
        this.heldUp = null;             // { from, to }: the last time idle() came far later than usual (the app was held up in between)
        this.tooks = [];                // the last round trips of this series' getter reads (a polled series): what is usual for it
        this.runs = 0; this.missed = 0; this.creeps = 0; this.glitches = 0; this.merged = 0;
        this.reset();
    }

    /** Throw the run away (its results too) and wait for the next standstill. */
    reset() {
        this.state = 'wait';
        this.stopSince = null;          // since when the car has stood, null while it moves
        this.standT = null;             // the last moment the car is known to stand (carried forward by idle())
        this.standReal = null;          // its last standing sample's time
        this.standV = 0;
        this.standOff = 0;              // what its last standing sample's stamp may be off by (a polled read that took far longer than usual)
        this.run = null;                // the run being timed, or the last one (kept on screen until the next launch)
    }

    /**
     * This series has said nothing while the car demonstrably moved (feed.js sees that on the other series): a
     * notifier that never speaks, a getter that has stopped answering. What it last said is forgotten, so its
     * standstill is not carried forward and the timer is not armed on it. It arms again on its own next
     * samples. The results of its last run stay.
     */
    disarm() {
        if (this.state === 'run') return;
        this.last = null; this.last2 = null; this.held = null; this.moveSince = null;
        this.state = 'wait';
        this.stopSince = null; this.standT = null; this.standReal = null;
    }

    /** Another start convention or unit: the run in hand is thrown away. */
    configure(o) {
        if (o && STARTS[o.start]) this.start = o.start;
        if (o && o.unit) this.unit = o.unit === 'mph' ? 'mph' : 'kmh';
        this.reset();
    }

    /* ---------- samples in ---------- */

    /**
     * More than GLITCH_MS2 of deceleration or acceleration from sample p to c?
     * A step UPWARDS is judged over the time the two readings can really be apart, not over their stamps alone:
     * two samples of an on-change series are never sent closer than one send slot (stamps closer than that mean
     * the earlier one was stamped late), and a polled sample was read somewhere in its round trip.
     */
    _tooSharp(p, c) {
        if (!p) return false;
        let dt = Math.max(c.t - p.t, GLITCH_MIN_MS);
        if (c.v > p.v) {
            const slot = this.onChange ? this._slot() : null;
            if (slot !== null) dt = Math.max(dt, slot);
            if (!this.onChange) dt += ((isNum(p.took) ? p.took : 0) + (isNum(c.took) ? c.took : 0)) / 2;
        }
        return Math.abs(c.v - p.v) / KMH / (dt / 1000) > GLITCH_MS2;
    }

    /**
     * Sample c has just replaced `gone`, which was taken out as stamped late. `gone` is still a reading of the car,
     * and the two were sent one after the other: one send slot apart. Is c more than GLITCH_MS2 above it over one
     * slot (or over their stamps, if those are further apart)? Then c is not the car's speed.
     * Never over less than GLITCH_MIN_MS, the floor _tooSharp has: the slot "as far as it is known" is, early in a
     * run, the middle one of a few spacings, and late stamps make it come out too short (11 to 13 ms on a series
     * that sends every 20 ms). Without the floor one slot's real gain of a quick car read as a step.
     * Only in a run whose launch is placed and whose send slot is known, and not once this run's samples have been
     * seen to arrive out of order (_order): then `gone` may be an old reading that waited, and c a fresh one.
     */
    _aboveGone(gone, c) {
        const r = this.run, slot = this.onChange ? this._slot() : null;
        if (slot === null || !(c.v > gone.v) || this.state !== 'run' || !r || !r.final || r.disorder) return false;
        return (c.v - gone.v) / KMH / (Math.max(c.t - gone.t, slot, GLITCH_MIN_MS) / 1000) > GLITCH_MS2;
    }

    /**
     * Sample c comes right behind `before` (less than three quarters of a send slot after it, so the two are
     * readings sent one after the other) and reads LOWER by more than half of GLITCH_MS2 over a slot: more than
     * a car loses under the hardest braking. Then the samples of this run do not arrive in the order they were
     * sent (a fresh one, then an older one that had waited): run.disorder. From then on the reading of a sample
     * that was taken out says nothing about the one after it (_aboveGone, _lateBefore).
     */
    _order(before, c) {
        const r = this.run, slot = this.onChange ? this._slot() : null;
        if (slot === null || this.state !== 'run' || !r || r.disorder || !(c.t - before.t < LATE_SHARE * slot)) return;
        if ((before.v - c.v) / KMH / (slot / 1000) > GLITCH_MS2 / 2) r.disorder = true;
    }

    /**
     * What the stamp of a polled sample may be off by beyond the usual (ms): a read that took far longer than
     * this getter's reads usually do (the app was held up while the answer was on its way, or the car answered
     * late) is stamped at the middle of its round trip like every other, but the car may have read the value
     * right at its beginning or at its end. Half of what the read took longer than usual; 0 for a read of
     * usual length, and for a notified sample.
     */
    _tookOff(took) {
        if (!isNum(took)) return 0;
        const k = this.tooks, usual = k.length >= TOOK_MIN ? median(k) : null;
        k.push(took);
        if (k.length > TOOK_USUAL) k.shift();
        return usual !== null && took > LONG_TOOK * usual + LONG_TOOK_MS ? (took - usual) / 2 : 0;
    }

    /**
     * The send slot of this series as far as it is known (ms, SLOT_MAX_MS at most), or null: the run's own (the
     * middle one of its first 8 spacings), before that the middle one of the spacings it has so far (three or
     * more), before that the slot the series showed in its last run.
     */
    _slot() {
        const r = this.run;
        let s = this.slotSeen;
        if (this.state === 'run' && r && r.acc) {
            if (r.slot !== null) s = r.slot; else if (r.acc.slotGaps.length >= 3) s = median(r.acc.slotGaps);
        }
        return isNum(s) && s > 0 ? Math.min(s, SLOT_MAX_MS) : null;
    }

    /**
     * This engine's series has stopped in the middle of a run (the app sees that: no read kept, nothing
     * notified). The run ends at its last sample with the splits it has; ended: 'silent'.
     */
    silent() {
        if (this.state !== 'run') return;
        const r = this.run, a = r.acc;
        this.held = null;
        this._finish(a && a.realT !== null ? a.realT : r.tFirst, 'silent');
    }

    /**
     * A speed sample of this engine's series: t ms (a forward-only clock), v km/h as the car reports it,
     * took: ms the getter read took (a polled sample; its stamp is uncertain by half of that).
     * A sample stamped late: one stamped less than 2 ms after the one before replaces it (they arrived
     * together), and so does, on an on-change series, one stamped less than half a send slot after it (see
     * the top of the file).
     * The glitch filter: a sample that would mean more than 25 m/s2 against the sample before it is held
     * back. The next sample decides: if it fits the held one, the car's signal really did that and both are
     * fed, each with its own time (the first marked as a step no car does); if not, the held one was a
     * glitch and is dropped.
     */
    feed(t, v, took) {
        if (!isNum(t) || !isNum(v) || v < 0 || v > MAX_KMH) return;
        const c = { t, v, took: isNum(took) && took >= 0 ? took : null, off: 0, firm: false };
        c.off = this._tookOff(c.took);
        // (the app stamps on one clock that only runs forward: a stamp that is not after the last one's is a sample
        // handed over out of order)
        if (this.last && t <= this.last.t && this.state === 'run' && this.run) this.run.disorder = true;
        let h = this.held, lump = false, gone = null;
        if (h && t >= h.t) this._order(h, c);
        if (h && t >= h.t && t - h.t < BURST_MS) { this.held = h = null; this._merged(); } else if (!h && this.last && t > this.last.t) {
            const soon = this._tooSoon(c), was = this.last;
            if (soon && this._untake(soon === 'late')) { this._merged(); lump = true; gone = was; this._order(gone, c); }
        }
        if (h) {
            this.held = null;
            if (!this._tooSharp(h, c)) { this._take(h.t, h.v, h.firm ? 'firm' : true, h.took, false, h.off); this._take(t, v, false, c.took, false, c.off); return; }
            this.glitches++;
            if (this.state === 'run') { this.run.dropped++; if (this.run.acc) this.run.acc.dropT = h.t; }
        }
        // A sample that replaced one stamped late is judged against that one's reading too (over one send slot), not
        // only against the sample before it (over two slots or a whole hold-up, where a reading 10 or 20 km/h too
        // high is no step). A step from the reading taken out is held back like any other; if the next sample
        // confirms it, the series jumped (firm: no late stamp excuses it).
        const firm = gone !== null && this._aboveGone(gone, c);
        if (firm || this._tooSharp(this.last, c)) { c.firm = firm; this.held = c; return; }
        this._take(t, v, false, c.took, lump, c.off);
    }

    _merged() { this.merged++; if (this.state === 'run' && this.run) this.run.merged++; }

    /**
     * Does sample c come so soon after the last one taken that that one's stamp was late? -> 'lump' | 'late' | null
     * Under 2 ms: they arrived together ('lump'). On an on-change series in a run: less than three quarters of a
     * send slot after it, and more than 1.75 slots after the sample before that, so c is where a sample is due
     * ('late': a sample cannot be stamped before it was sent, so the one after a late one comes two slots after
     * the one before it; a series that simply sends faster than the slot measured never does). If that goes on
     * for more than a second (each sample replacing the one before it), it is no queue being worked off, and
     * the rule is switched off for the rest of the run.
     */
    _tooSoon(c) {
        const p = this.last, pp = this.last2, g = c.t - p.t, r = this.run;
        if (g < BURST_MS) return 'lump';
        if (this.state !== 'run' || !r || !this.onChange || !pp || r.lateOff) return null;
        const slot = this._slot();
        if (slot === null || !(g < LATE_SHARE * slot && c.t - pp.t > LATE_REACH * slot)) return null;
        if (c.t - pp.t > LATE_SPAN_MS) { r.lateOff = true; return null; }
        return 'late';
    }

    /**
     * Take the last sample back: its stamp was late, and the next one replaces it. Only during a run (outside one
     * a sample stamped late changes nothing that is kept). Returns false where it cannot be done.
     */
    _untake(late) {
        if (this.state === 'run' && this.run) {
            if (!this.last2 || !this._back(late)) return false;
        } else {
            // Armed, and the sample taken back is a standing one (under 0.5 km/h) that arrived together with the next:
            // the first word of this series after the standstill came in a lump. What that sample did to the
            // standstill is undone, and a launch that follows was seen late (lateFirst).
            const w = this.standWas;
            if (this.state !== 'ready' || !w || !this.last || w.t !== this.last.t || w.state !== 'ready') return false;
            this.stopSince = w.stopSince; this.standReal = w.standReal; this.standV = w.standV; this.standOff = w.standOff; this.standT = w.standT;
            this.standWas = null; this.lateNext = true;
        }
        this.last = this.last2; this.last2 = null;
        return true;
    }

    /**
     * The run without its last sample (the state after the sample before it). late: that sample did not arrive
     * together with the next one (a lump, which counts as one sample) but was stamped late by itself: the stretch
     * across it is a hole in the series, not "nothing changed", and not one of the series' own spacings.
     * The run's FIRST moving sample taken back: the series saw the launch late, and the next sample becomes the
     * first (lateFirst, _place).
     */
    _back(late) {
        const r = this.run;
        if (!r.final) {
            if (!r.buf || !r.buf.length) return false;
            r.buf.pop();
            if (!r.buf.length) r.lateFirst = true; else if (late) r.dropPending = true;
        } else {
            const a = r.acc;
            if (!a.before) return false;
            const t = a.realT;
            this._restore(a.before);
            a.at = a.before; a.before = null;
            if (late) a.dropT = t;
        }
        return true;
    }

    /**
     * Call often (every 50 ms) between samples, with the clock. A stopped car sends no new speed, so the
     * second of standing that arms the timer is counted here, and the 60 s limit too. For an on-change
     * series the standstill is carried forward to now, and during a run a speed that has stopped changing
     * is carried forward to one send slot before now (so a line is crossed, and the run ends, on time), for
     * 3 s at most: a series that says nothing for longer may have died, and no distance is made up for it.
     * What is carried forward is taken back if the next sample shows that samples were missing (_running).
     */
    idle(now) {
        if (!isNum(now)) return;
        if (this.idleT !== null && now > this.idleT) {
            if (this._overdue(now)) this.heldUp = { from: this.idleT, to: now };
            this.ticks.push(now - this.idleT);
            if (this.ticks.length > 8) this.ticks.shift();
        }
        this.idleT = now;
        const h = this.held;
        if (h && now - h.t >= GLITCH_HOLD_MS) { this.held = null; this._take(h.t, h.v, h.firm ? 'firm' : true, h.took, false, h.off); }
        if (this.state === 'run') {
            const r = this.run;
            if (!r.final && r.buf.length >= 2 && now - r.buf[0].t >= FIT_MS) this._place(true);
            if (this.state === 'run' && r.final && this.onChange && r.slot !== null && !this.held && !(r.acc.dropT > r.acc.realT) && now - r.acc.realT <= HOLD_MAX_MS &&
                now - r.acc.prev.t > HOLD_SLOTS * r.slot) this._step({ t: now - r.slot, v: r.acc.prev.v, filled: true }, true);
            if (this.state === 'run' && now - r.t0 > MAX_RUN_MS) this._finish(r.t0 + MAX_RUN_MS, 'limit');
            return;
        }
        if (!this.last || this.last.v >= LAUNCH_KMH || now < this.last.t) return;
        if (this.stopSince === null) { this.stopSince = now; this.standReal = this.last.t; this.standV = this.last.v; this.standOff = this.last.off || 0; }
        if (now - this.stopSince >= ARM_MS) this.state = 'ready';
        if (this.onChange && !(this.standT >= now)) this.standT = now;
    }

    /**
     * A sample that passed the glitch filter. sharp: it is a step of more than 25 m/s2 that the next sample
     * confirmed ('firm': a step from the reading of a sample that was taken out as stamped late; no late stamp
     * excuses that one). lump: it replaced a sample that was stamped late (its own stamp may be late too).
     * off: what its stamp may be off by (_tookOff).
     */
    _take(t, v, sharp, took, lump, off) {
        if (this.last && t <= this.last.t) return;              // stamps of one series never go backwards
        this.last2 = this.last;
        this.last = { t, v, took: isNum(took) ? took : null, lump: !!lump, off: off || 0 };
        const lowBefore = this.lowSeen;
        if (v > 0 && v < this.lowSeen) this.lowSeen = v;
        if (v < LAUNCH_KMH) this.moveSince = null; else if (this.moveSince === null) this.moveSince = t;
        if (this.state === 'run') { this._running(t, v, sharp, took, lump, off || 0); return; }
        const lateNext = this.lateNext;
        this.lateNext = false;
        if (v < LAUNCH_KMH) {
            this.standWas = { t, state: this.state, stopSince: this.stopSince, standReal: this.standReal, standV: this.standV, standOff: this.standOff, standT: this.standT };
            if (this.stopSince === null) this.stopSince = t;
            this.standReal = t; this.standV = v; this.standOff = off || 0;
            if (!(this.standT >= t)) this.standT = t;
            if (t - this.stopSince >= ARM_MS) this.state = 'ready';
            return;
        }
        const armed = this.state === 'ready', since = this.stopSince;
        this.stopSince = null;
        if (!armed) { this.standT = null; return; }
        this._launch(t, v, since, took, lowBefore, lateNext, off || 0);
    }

    /* ---------- the run ---------- */

    _launch(t, v, stoodSince, took, lowBefore, late, off) {
        // so fast already: this series did not see the launch (it began sending late). No run from it.
        if (v > MISSED_KMH) { this.missed++; this.state = 'wait'; this.standT = null; return; }
        let sc = typeof this.scale === 'function' ? this.scale(t) : this.scale;
        if (isNum(sc)) sc = { factor: sc, source: 'given' };
        if (!sc || !isNum(sc.factor) || !(sc.factor > 0)) sc = { factor: 1, source: 'none' };
        const k = sc.factor;
        this.run = {
            start: this.start, unit: this.unit, splits: splitsFor(this.unit, this.start),
            scale: k, scaleSource: sc.source || 'given',
            standReal: this.standReal === null ? t : Math.min(this.standReal, t),
            standCarried: this.standT === null ? t : Math.min(this.standT, t), standV: this.standV * k,
            standOff: this.standReal === null ? 0 : this.standOff,
            firstKmh: v * k, tFirst: t, stoodSince, buf: [{ t, v: v * k, off }], final: false, slot: null,
            dropped: 0, merged: 0, jumps: 0, took: [], tookMid: null, ended: null, endAt: null, tEnd: null,
            // lateFirst: the first moving sample(s) were stamped late and taken back (_back). tickLate: the app was
            // held up when the first moving sample came, and that sample may be as old as the hold-up (an on-change
            // series; a polled sample knows its round trip)
            lateFirst: !!late, tickLate: this._tickLate(t), dropPending: false, lateOff: false, fit2: null, disorder: false,
            lowSeen: isNum(lowBefore) ? lowBefore : null,       // (the smallest speed above 0 the series had reported BEFORE this launch)
            afterCreep: isNum(this.creepAt) && t - this.creepAt < 1000 ? Math.round(t - this.creepAt) : null,
        };
        if (isNum(took)) this._took(this.run, took);
        this.state = 'run';
        this.runs++;
        this.standT = null;
        this._place(false);
        if (this.onLaunch) this.onLaunch(this.run.t0);
    }

    /** Is idle() overdue at time t: not called for far longer than its usual spacing (1.5 times the middle one of its last spacings, plus 10 ms)? */
    _overdue(t) {
        return this.idleT !== null && this.ticks.length >= 4 && t - this.idleT > 1.5 * median(this.ticks) + 10;
    }

    /**
     * Was the app held up when a first moving sample stamped t came (an on-change series)? idle() is overdue at t,
     * or it has just come late (within half its usual spacing before t: a sample that waited is handled right
     * after the late tick, or right before it). -> { ms: how long the app was not heard from, from: when it was
     * heard last before that } or null.
     */
    _tickLate(t) {
        if (!this.onChange) return null;
        if (this._overdue(t)) return { ms: t - this.idleT, from: this.idleT };
        const h = this.heldUp;
        if (h && t >= h.to && this.ticks.length >= 4 && t - h.to < median(this.ticks) / 2) return { ms: t - h.from, from: h.from };
        return null;
    }

    /** The first moving sample of the run in hand, after the one before it was taken back as stamped late. */
    _first(c, took) {
        const r = this.run;
        // so fast already: this series did not see the launch. No run from it (as in _launch).
        if (c.v > MISSED_KMH * r.scale) { this.missed++; this.state = 'wait'; this.stopSince = null; this.standT = null; this.run = null; return; }
        r.buf = [c]; r.tFirst = c.t; r.firstKmh = c.v; r.dropPending = false;
        if (isNum(took)) this._took(r, took);
        this._place(false);
    }

    /** A getter read's round trip (ms) of a sample of this run: half of the middle one goes into the +-. */
    _took(r, took) {
        const k = r.took;
        if (k.length >= TOOK_KEEP) return;
        k.push(took);
        if (k.length <= 16 || k.length % 16 === 0) r.tookMid = median(k);
    }

    /** Place the launch instant from the moving samples so far (final: for good) and time the run again from it. */
    _place(final) {
        const r = this.run, b = r.buf, f = b[0], n = Math.min(b.length, FIT_N);
        const sv = Math.min(r.standV, LAUNCH_KMH);
        // the straight line between the last known standstill and the first moving sample (the kit's interpolation)
        const between = (from) => from + (f.v > sv ? Math.max(0, Math.min(1, (LAUNCH_KMH - sv) / (f.v - sv))) : 0) * (f.t - from);
        let lo = Math.min(r.standCarried, f.t), how = 'interp', clamp = null, early = 0, line = null, d1 = null, apart = 0, uneven = 0, lateStand = 0, tookLate = 0;
        let t0 = between(lo);
        if (final && n >= 2) {
            // The last moment the car is known to stand. A series that sends every slot: its last standing
            // sample. A series that only sends on change: nothing arrived before the first moving sample, so
            // nothing had changed one send slot before it (the slot = the spacing of the first moving
            // samples). That does not depend on when idle() happened to be called.
            const spacing = (b[n - 1].t - f.t) / (n - 1);
            lo = Math.min(f.t, this.onChange ? Math.max(r.standReal, f.t - spacing) : r.standReal);
            // An on-change series sends on a grid: its last standing sample cannot be closer to the first moving one
            // than the moving ones are to each other. If its stamp says so, that stamp was late by what is missing:
            // the car stood one spacing before the first moving sample, and the +- gets what the stamp was late by.
            // (spacings of more than 500 ms are no send slots: a silence or a hole, not a late stamp. The same below.)
            if (this.onChange && !r.lateFirst && r.standReal < f.t && spacing <= UNEVEN_MAX_MS && spacing - (f.t - r.standReal) > Math.max(1, LATE_MIN * spacing)) {
                lateStand = spacing - (f.t - r.standReal);
                lo = f.t - spacing;
            }
            // The app was held up just before the first moving sample (its tick was overdue): that sample may be as
            // old as the hold-up, so the car is only known to stand until the last tick before it.
            if (r.tickLate !== null && !r.lateFirst) lo = Math.min(lo, Math.max(r.standReal, Math.min(r.standCarried, r.tickLate.from)));
            // The first moving sample(s) were stamped late and taken back: this series saw the launch late, and
            // nothing says when the car stood last. The launch is run back from the samples it has (below), as far
            // as LATE_BACK_MS.
            if (r.lateFirst) lo = Math.max(r.standReal, f.t - LATE_BACK_MS);
            const gap = f.t - lo, mov = b.slice(0, n), back = Math.min(2 * LATE_BACK_MS, Math.max(500, 2 * gap));
            const inGap = (x) => Math.max(lo, Math.min(f.t, x));
            line = lineCross(mov, LAUNCH_KMH);
            const m = this.fit === 'model' ? launchFit([{ t: lo, v: sv }].concat(mov), f.t, LAUNCH_KMH, back) : null;
            let want = m ? m.cross : line, by = m ? 'model' : 'line';
            if (m && sv > 0 && !r.lateFirst) {
                // 1. the last standing sample is a real reading above 0: the launch lies between it and the first
                // moving sample. A model that puts it far from the straight line between the two contradicts them.
                const mid = between(lo);
                if (Math.abs(m.cross - mid) > BRACKET * gap) { want = mid; by = 'between'; }
            } else if (m && !(this.lowSeen <= LOW_TRUST_KMH) && line !== null) {
                // 3. it reads 0 and nobody knows what a 0 means on this series: the earliest of the model, the straight
                // line, and the straight line through the first two moving samples alone (the third may already be
                // past a kink); how far they are apart goes into the +- (2.: a series known to read from 0 keeps the model)
                const two = n > 2 ? lineCross(mov.slice(0, 2), LAUNCH_KMH) : null;
                const all = [m.cross, line].concat(two === null ? [] : [two]), first = Math.min.apply(null, all);
                apart = inGap(Math.max.apply(null, all)) - inGap(first);
                if (first < m.cross) { want = first; by = 'line'; }
            }
            if (want !== null) {
                how = by + (by === 'between' ? '' : n);
                t0 = want;
                if (want < lo) { t0 = lo; clamp = 'stand'; } else if (want > f.t) { t0 = f.t; clamp = 'first'; }
                // held at one end of the launch gap, or the app was held up there: the launch may be anywhere in it
                // (results(): a quarter of the gap is in already)
                if (!r.lateFirst && (clamp || r.tickLate !== null)) apart = Math.max(apart, 0.75 * gap);
                // the distance covered between t0 and the first moving sample, by the model's own curve
                if (by === 'model' && !clamp) d1 = Math.max(0, m.a * (rampArea(f.t - m.ts, m.T) - rampArea(t0 - m.ts, m.T))) / KMH / 1000;
            } else t0 = inGap(t0);
            // The straight line through the moving samples as a witness: if it says the car passed 0.5 km/h
            // before it was known to stand, the first moving sample was already fast: the series saw the
            // launch late, or the speed signal reads 0 until the car is rolling. How late: by the launch model
            // through the moving samples alone (the line itself runs late on a launch that builds up).
            // t0 stays at the standstill, as the brief says; the +- grows by that time (results()).
            if (line !== null && line < lo && !(sv > 0)) {
                const free = launchFit(mov, f.t, LAUNCH_KMH, back);
                early = lo - (free && free.cross < line ? free.cross : line);
            }
            // launch seen late: the stretch the launch was run back over counts as the launch gap, all of it in the +-
            if (r.lateFirst) { lo = t0; apart = Math.max(apart, 0.75 * (f.t - t0)); }
            // An on-change series sends on a grid. If the first three moving samples are not evenly spaced, one of
            // their stamps was late by about that much, and the launch was placed with it: into the +-.
            if (this.onChange && n === 3) {
                const g1 = b[1].t - b[0].t, g2 = b[2].t - b[1].t, off = Math.abs(g1 - g2);
                if (Math.max(g1, g2) <= UNEVEN_MAX_MS && off > Math.max(1, LATE_MIN * Math.min(g1, g2))) { uneven = off; apart += off; }
            }
            if (lateStand > 0) { uneven = Math.max(uneven, lateStand); apart += lateStand; }
            // A polled series: the launch was placed with a read that took far longer than this getter's reads usually
            // do (its last standing sample, one of the moving ones). The car may have read that value half of the
            // extra time before its stamp or after it (_tookOff), and the launch moves with it: into the +- (twice
            // where it was one of two moving samples, as with an uneven stamp above).
            if (!this.onChange) {
                tookLate = (r.standOff > 0 && r.standReal <= f.t ? r.standOff : 0) + mov.reduce((x, p) => x + (p.off || 0), 0) * (n === 2 ? 2 : 1);
                apart += tookLate;
            }
            // (placed with two samples: whether they were evenly spaced shows when the third comes: _running)
            r.fit2 = this.onChange && n === 2 ? { g: b[1].t - b[0].t, t: b[1].t } : null;
        }
        r.t0 = t0;
        r.d1 = d1;
        r.final = !!final;
        r.launchGap = f.t - lo;             // first moving sample - last known standing
        r.early = early;
        r.apart = apart;
        // line: where the brief's straight line through the same moving samples would have put the launch (ms after t0)
        r.launch = {
            how, clamp, early: Math.round(early), n: final ? n : 1, late: !!r.lateFirst, tickLate: r.tickLate === null ? null : Math.round(r.tickLate.ms), uneven: Math.round(uneven), tookLate: Math.round(tookLate),
            line: line === null ? null : Math.round((Math.max(lo, Math.min(f.t, line)) - t0) * 10) / 10,
            apart: Math.round(apart * 10) / 10, lowSeen: r.lowSeen,
        };
        this._replay();
        if (final && this.run === r) r.buf = null;
    }

    /** Time the run from r.t0 through the samples kept so far. */
    _replay() {
        const r = this.run, off = STARTS[r.start].dist === 'roll' ? ROLLOUT_M : 0;
        const marks = [{ id: 'roll', d: ROLLOUT_M }];
        DISTANCES.forEach((s) => {
            marks.push({ id: s.key, d: s.m + off });
            if (s.trap) marks.push({ id: s.key + '-66', d: s.m + off - TRAP_M });
        });
        marks.sort((x, y) => x.d - y.d);
        r.marks = marks;
        r.mark = {};
        marks.forEach((m) => { m.t = null; r.mark[m.id] = m; });
        r.target = r.splits[0].kmh;
        r.acc = {
            prev: { t: r.t0, v: LAUNCH_KMH, launch: true }, prev2: null, realT: null, dist: 0, next: 0, cross: null, wait: false, touched: null, sameT: null, frozenMs: 0,
            vmax: 0, n: 0, gaps: [], slotGaps: [], peak: 0, win: [], trace: [], rates: [], holeMs: 0, holeD: 0, dropT: null,
            at: null, before: null,       // the state after the last real sample, and after the one before it (_snap)
        };
        for (const c of r.buf) {
            this._step(c, false);
            if (this.state !== 'run' || this.run !== r) return;
        }
    }

    /** What a step changes, to take a step back: the points filled into a silence, or a sample that was superseded. */
    _snap() {
        const r = this.run, a = r.acc;
        return {
            prev: a.prev, prev2: a.prev2, realT: a.realT, dist: a.dist, next: a.next, cross: a.cross, wait: a.wait, touched: a.touched, sameT: a.sameT, frozenMs: a.frozenMs, vmax: a.vmax, n: a.n,
            gaps: a.gaps.length, slotGaps: a.slotGaps.length, peak: a.peak, win: a.win.slice(), trace: a.trace.length, rates: a.rates.slice(), holeMs: a.holeMs, holeD: a.holeD,
            slot: r.slot, took: r.took.length, tookMid: r.tookMid,
        };
    }

    _restore(s) {
        const r = this.run, a = r.acc;
        for (let i = s.next; i < a.next && i < r.marks.length; i++) r.marks[i].t = null;
        a.prev = s.prev; a.prev2 = s.prev2; a.realT = s.realT; a.dist = s.dist; a.next = s.next; a.cross = s.cross; a.wait = s.wait; a.touched = s.touched; a.sameT = s.sameT; a.frozenMs = s.frozenMs;
        a.vmax = s.vmax; a.n = s.n; a.gaps.length = s.gaps; a.slotGaps.length = s.slotGaps; a.peak = s.peak; a.win = s.win.slice(); a.rates = s.rates.slice(); a.holeMs = s.holeMs; a.holeD = s.holeD;
        if (a.trace.length > s.trace) a.trace.length = s.trace;
        r.slot = s.slot; r.took.length = s.took; r.tookMid = s.tookMid;
    }

    _running(t, v, sharp, took, lump, off) {
        const r = this.run, none = !r.final && !r.buf.length;     // (none: its first moving sample was taken back)
        // standing again without ever passing 5 km/h: a creep, not a launch. Thrown away, armed again at once.
        if (v < LAUNCH_KMH && (r.acc.vmax < CREEP_KMH || none)) {
            this.creeps++;
            this.reset();
            this.state = 'ready'; this.stopSince = t; this.standT = t; this.standReal = t; this.standV = v; this.standOff = off || 0;
            this.creepAt = t;
            return;
        }
        const c = { t, v: v * r.scale, lump: !!lump, off: off || 0 };
        if (none) { this._first(c, took); return; }
        // A step upwards that no car does, and the next sample agreed with it (feed). Either the sample before it
        // was stamped late (_lateBefore): that one is taken back and the run goes on across the hole. Or this is not
        // the car's speed: the run ends at the sample before it, and nothing from here on is used for a time.
        if (sharp) {
            const p = r.final ? r.acc.prev : r.buf[r.buf.length - 1];
            if (c.v > p.v) {
                if (sharp !== 'firm' && this._lateBefore(c) && this._back(true)) {
                    this._merged(); this.last2 = null;
                    if (!r.buf || r.buf.length) c.lump = false; else { this._first(c, took); return; }
                } else { r.jumps++; this._finish(r.final && r.acc.realT !== null ? r.acc.realT : p.t, 'jump'); return; }
            }
        }
        if (isNum(took)) this._took(r, took);
        // The launch is placed for good when the sample AFTER its first three moving ones comes in (until then the
        // third may still turn out to be stamped late and be replaced), or with two once the first is 300 ms old.
        if (!r.final && (r.buf.length >= FIT_N || (r.buf.length >= 2 && t - r.buf[0].t > FIT_MS))) this._place(true);
        if (this.state !== 'run') return;
        if (!r.final) {
            if (r.dropPending) { c.hole = true; r.dropPending = false; }
            r.buf.push(c);
            this._place(false);
            return;
        }
        // An on-change series was silent for more than a slot. Either nothing changed until one slot ago, or
        // samples are missing. What the new sample says decides (see the top of the file); what idle() carried
        // forward meanwhile is taken back first, so that both ways start from the last real sample.
        const a = r.acc;
        if (this.onChange && r.slot !== null && a.at && a.realT !== null && t - a.realT > HOLD_SLOTS * r.slot) {
            // (what the speed did per slot before the silence: the largest of its last three plain steps, because the
            // step that runs into a gear change is a short one)
            const lastV = a.at.prev.v, per = a.at.rates.reduce((m, x) => Math.max(m, Math.abs(x)), 0) * r.slot;
            const fits = !(a.dropT > a.realT) && Math.abs(c.v - lastV) <= FILL_RATIO * per + FILL_KMH;
            this._restore(a.at);
            if (fits) {
                if (t - r.slot > a.prev.t) this._step({ t: t - r.slot, v: lastV, filled: true }, true);
                if (this.state !== 'run') return;
            } else c.hole = true;
        }
        // (a sample was dropped since the last one that counts: the stretch across it is a hole, however short)
        if (this.onChange && a.realT !== null && a.dropT > a.realT) c.hole = true;
        // The launch was placed with two samples, and this is the third: if the three are not evenly spaced, one
        // stamp was late by about the difference. With two samples that moves the launch by up to twice as much.
        if (r.fit2 && t > r.fit2.t) {
            const off = Math.abs(t - r.fit2.t - r.fit2.g);
            if (!c.hole && Math.max(t - r.fit2.t, r.fit2.g) <= UNEVEN_MAX_MS && off > Math.max(1, LATE_MIN * Math.min(t - r.fit2.t, r.fit2.g))) {
                r.apart += 2 * off;
                r.launch.uneven = Math.round(off); r.launch.apart = Math.round(r.apart * 10) / 10;
            }
            r.fit2 = null;
        }
        this._step(c, false);
    }

    /**
     * c is a step upwards that no car does, and the sample after it agreed with it. Was it the sample BEFORE c
     * that was stamped late (true), or did the series jump (false)?
     *   - That sample replaced one that was stamped late (the end of a lump: its own stamp says when the app got
     *     to it, not when the car sent it): late, if from the sample before the lump c is no step.
     *   - It is the run's first moving sample: late, if c is still a speed a launch begins with (20 km/h at most).
     *   - The send slot of the series is known: the step was judged over a whole slot already (_tooSharp), so it
     *     is a jump.
     *   - The slot is not known yet (the first samples of a series' first run): late, if the spacing before that
     *     sample was more than twice the spacing after it (a long wait, then two samples close together) and from
     *     the sample before it c is no step.
     */
    _lateBefore(c) {
        const r = this.run, a = r.acc, n = r.final ? 0 : r.buf.length;
        const p = r.final ? (a.at ? a.at.prev : a.prev) : r.buf[n - 1];
        const pp = r.final ? (a.before ? a.before.prev : null) : n > 1 ? r.buf[n - 2] : null;
        const first = !r.final && n === 1;
        const fits = (x) => !!x && !x.launch && c.t > x.t && (c.v - x.v) / KMH / ((c.t - x.t) / 1000) <= GLITCH_MS2;
        if (first) return c.v <= MISSED_KMH * r.scale;
        if (p.lump && (!r.final || r.disorder || this._slot() === null)) return fits(pp);
        if (this._slot() !== null) return false;
        return !!pp && !pp.launch && c.t - p.t < LATE_SHARE * (p.t - pp.t) && fits(pp);
    }

    /**
     * One more point of the run: distance, crossings, the end. filled: not a sample but a slot an on-change
     * series skipped (same speed as before), which counts for distance and crossings only.
     */
    _step(c, filled) {
        const r = this.run, a = r.acc, p = a.prev;
        const limit = r.t0 + MAX_RUN_MS;
        const was = a.before, at = a.at;          // the state after the sample before the last real one, and after that one
        if (!filled) a.before = a.at;
        // An on-change series: this sample comes less than a send slot after the last one. Then that one's stamp was
        // late by what is missing (less than half a slot, or it would have been taken back: _tooSoon).
        let late = 0;
        if (!filled && this.onChange && a.realT !== null) {
            const slot = this._slot(), short = slot === null ? 0 : slot - (c.t - a.realT);
            if (short > Math.max(1, LATE_MIN * slot)) late = short;
        }
        // A polled series: the read of the sample before this one took far longer than usual. Its stamp may be off
        // by `off` (_tookOff), and that is treated as a late stamp is.
        if (!filled && !this.onChange && !p.launch && p.off > 0) late = p.off;
        // the 100 km/h crossing was in the step before this one: the line of the two points after it, run back
        if (a.wait && a.cross && c.t > p.t) {
            const x = a.cross, s = (c.v - p.v) / (c.t - p.t), est = x.est.slice();
            if (s > 0) est.push(Math.max(x.lo, Math.min(x.hi, p.t - (p.v - r.target) / s)));
            a.cross = Object.assign({}, x, { est, spread: Math.max.apply(null, est) - Math.min.apply(null, est) });
            a.wait = false;
        }
        const pp = a.prev2;             // the point before p
        a.prev2 = p;
        a.prev = c;
        if (c.t > p.t) {
            const dt = (c.t - p.t) / 1000, vc = c.v / KMH, d0 = a.dist;
            // (the step from t0 to the first moving sample, with a fitted launch: the straight speed line that
            // ends at the sample and covers what the fitted curve covers, at most what a line from 0.5 km/h would)
            const vp = p.launch && r.d1 !== null ? Math.min(p.v / KMH, 2 * r.d1 / dt - vc) : p.v / KMH, acc = (vc - vp) / dt;
            a.dist += (vp + vc) / 2 * dt;
            // the spacing of the two samples around a crossing (in the first step: back to the last known standstill;
            // across slots an on-change series skipped: from the last real sample)
            const gap = p.launch ? r.launchGap : c.t - (a.realT !== null ? a.realT : p.t), next0 = a.next;
            while (a.next < r.marks.length && r.marks[a.next].d <= a.dist) {
                // speed is a straight line between the two points, so distance is a parabola: where it reaches the mark
                const m = r.marks[a.next++], need = Math.max(0, m.d - d0);
                const tau = Math.min(dt, 2 * need / (vp + Math.sqrt(Math.max(0, vp * vp + 2 * acc * need)) || 1e-9));
                if (p.t + tau * 1000 > limit) { a.next = r.marks.length; break; }
                m.t = p.t + tau * 1000; m.v = (vp + acc * tau) * KMH; m.gap = gap; m.unc = a.holeD; m.late = 0;
            }
            // where the line of the two points before this step, run forward, reaches the target speed
            const ahead = !p.launch && pp && !pp.launch && p.t > pp.t && p.v > pp.v && p.v < r.target ? p.t + (r.target - p.v) / ((p.v - pp.v) / (p.t - pp.t)) : null;
            if (a.cross === null && c.v >= r.target && p.v < r.target) {
                const tc = p.t + (r.target - p.v) / (c.v - p.v) * (c.t - p.t);
                if (tc <= limit) {
                    // ... and the line of the two points before it, run forward (a gear change may begin or end right here)
                    const est = [tc];
                    if (ahead !== null) est.push(Math.max(p.t, Math.min(c.t, ahead)));
                    // (the speed was heading past the target in an earlier step and the next sample fell just short: it may have touched it there)
                    if (a.touched !== null) est.push(a.touched);
                    a.cross = { t: tc, gap, lo: p.t, hi: c.t, est, spread: Math.max.apply(null, est) - Math.min.apply(null, est) };
                    a.wait = true;
                }
            } else if (a.cross === null && a.touched === null && ahead !== null && ahead < c.t && c.v < r.target && c.v >= r.target - NEAR_KMH &&
                r.target - c.v <= FALL_KMH_S * (c.t - ahead) / 1000) a.touched = ahead;
            // (a polled sample whose own read took far longer than usual: what was crossed in the step up to it may be
            // off by what its stamp may be off. The step after it is seen to when the next sample comes: `late` above.)
            if (!filled && !this.onChange && c.off > 0) {
                for (let i = next0; i < a.next && i < r.marks.length; i++) if (!(r.marks[i].late >= c.off)) r.marks[i].late = c.off;
                if (a.cross && a.cross.hi === c.t && !(a.cross.late >= c.off)) a.cross = Object.assign({}, a.cross, { late: c.off });
            }
        }
        if (late > 0) {
            // The sample before this one was stamped late by `late` ms. A line crossed in the step up to it or in this
            // one may be off by as much: it goes into that crossing's +-. And the distance is off by up to half of it
            // times the speed gained across the two steps: into the +- of every distance split from here on.
            const from = was ? was.next : at ? at.next : a.next, since = was ? was.prev : p;
            for (let i = from; i < a.next && i < r.marks.length; i++) if (!(r.marks[i].late >= late)) r.marks[i].late = late;
            if (a.cross && a.cross.lo >= since.t && !(a.cross.late >= late)) a.cross = Object.assign({}, a.cross, { late });
            a.holeD += late / 1000 * Math.abs(c.v - since.v) / KMH / 2;
        }
        if (!filled) {
            const gapReal = a.realT !== null ? c.t - a.realT : null;
            if (gapReal !== null) {
                a.gaps.push(gapReal);
                // (the send slot: the middle one of the first 8 spacings that are not holes)
                if (!c.hole) a.slotGaps.push(gapReal);
                if (r.final && r.slot === null && a.slotGaps.length >= SLOT_GAPS) { r.slot = median(a.slotGaps.slice(0, SLOT_GAPS)); this.slotSeen = r.slot; }
                // samples missing while the speed moved (an on-change series: decided in _running; a series that sends
                // every slot: a gap of more than 2.5 slots): what the hole may hide in distance, and how long it was
                // (a hole a dropped sample left before the slot is known counts by its length whatever that is)
                if (this.onChange ? c.hole : r.slot !== null && gapReal > HOLE_SLOTS * r.slot) {
                    a.holeD += Math.abs(c.v - p.v) / KMH * gapReal / 1000 / 4;
                    if ((r.slot === null || gapReal > HOLE_SLOTS * r.slot) && gapReal > a.holeMs) a.holeMs = gapReal;
                } else if (c.t > p.t && !p.launch) {
                    a.rates.push((c.v - p.v) / (c.t - p.t));                    // km/h per ms over a plain step: the last three
                    if (a.rates.length > 3) a.rates.shift();
                }
            }
            // a series that sends every slot and keeps saying exactly the same value while the run goes on: for how long
            if (!this.onChange) {
                if (p.launch || c.v !== p.v) a.sameT = c.t; else if (a.sameT !== null && c.v > CREEP_KMH && c.t - a.sameT > a.frozenMs) a.frozenMs = c.t - a.sameT;
            }
            a.realT = c.t;
            a.n++;
            if (c.v > a.vmax) a.vmax = c.v;
            // peak g: the largest gain in speed over a stretch of at least PEAK_MS (one sample step alone is too noisy)
            const w = a.win, span = this.onChange ? PEAK_MS : PEAK_POLLED_MS;
            w.push(c);
            while (w.length > 2 && c.t - w[1].t >= span) w.shift();
            if (c.t - w[0].t >= span) a.peak = Math.max(a.peak, (c.v - w[0].v) / KMH / ((c.t - w[0].t) / 1000) / G0);
            // the trace for the screen: a point every 50 ms at most, thinned when it gets long
            const tr = a.trace;
            if (!tr.length || c.t - tr[tr.length - 1][0] >= 50) tr.push([c.t, c.v]);
            if (tr.length > 1600) a.trace = tr.filter((_, i) => i % 2 === 0);
            a.at = this._snap();
            if (c.v < a.vmax - LIFT_KMH) { this._finish(c.t, 'lift'); return; }
        }
        if (r.mark.quarter.t !== null) this._finish(c.t, 'quarter');
        else if (c.t > limit) this._finish(limit, 'limit');
    }

    _finish(t, why) {
        const r = this.run;
        if (!r.final) { r.final = true; r.buf = null; }
        // straight back to arming: 'wait' until the car stands, then 'ready' (feed / idle)
        this.state = 'wait';
        this.stopSince = null;
        this.standT = null;
        r.ended = why;
        r.tEnd = t;
        // the clock on the screen stops at the 1/4 mile line where the run got there, else at the sample that ended it
        const ref = this._clockRef(r), stop = why === 'quarter' && r.mark.quarter.t !== null ? r.mark.quarter.t : t;
        r.endAt = ref === null ? 0 : Math.max(0, Math.min(MAX_RUN_MS, stop - ref) / 1000);
        // a roll that never passed 5 km/h is no run, however it ended
        if (r.acc.vmax < CREEP_KMH) { this.creeps++; this.run = null; return; }
        if (this.onDone) this.onDone(this.summary());
    }

    /* ---------- results out ---------- */

    /** Where the clock on the screen counts from: first movement, or the first foot ('rollout'). */
    _clockRef(r) {
        if (STARTS[r.start].speed === 'move') return r.t0;
        return r.mark.roll.t;
    }

    /** Seconds on the clock: running during a run, the run's length after it, 0 before the first. */
    elapsed(now) {
        const r = this.run;
        if (!r) return 0;
        if (this.state !== 'run' || r.ended) return r.endAt || 0;
        const ref = this._clockRef(r);
        return ref === null ? 0 : Math.max(0, Math.min(MAX_RUN_MS, now - ref) / 1000);
    }

    /**
     * The splits reached so far in this run (or the last one): { key: { s, pm, trap, at } }.
     * s seconds; pm the sampling uncertainty in seconds (see the top of the file); for a distance split
     * `at` = km/h at the line and, for the 1/8 and 1/4 mile, `trap` = km/h averaged over the last 66 ft.
     */
    results() {
        const r = this.run, out = {};
        if (!r || !r.acc) return out;
        const roll = r.mark.roll, stamp = isNum(r.tookMid) ? r.tookMid / 2 : 0;
        for (const s of r.splits) {
            const ref = s.ref === 'roll' ? roll.t : r.t0;
            if (ref === null || ref === undefined) continue;
            const x = s.kmh ? r.acc.cross : r.mark[s.key];
            if (!x || x.t === null) continue;
            if (!(x.t > ref)) continue;                         // (only nonsense data puts a crossing before its clock started)
            // (a split timed after the first foot gets the smaller share of the launch's doubt only if the series saw the
            // first foot: where it was covered before the first moving sample, it is known no better than the launch)
            const rolled = s.ref === 'roll' && roll.t >= r.tFirst;
            // the launch: the brief's quarter (sixteenth) of the launch gap, what the two ways of placing it differ by, what the series was late by
            let lead = r.launchGap / (rolled ? 16 : 4) + r.apart / (rolled ? 4 : 1) + r.early;
            // (a polled series: the first foot was crossed beside a read that took far longer than usual, or after
            // one: the rollout point is off by what that stamp may be off, and by what it may hide in distance)
            if (rolled && !this.onChange) lead += (roll.late > 0 ? roll.late : 0) + (roll.unc > 0 && roll.v > 0 ? roll.unc / (roll.v / KMH) * 1000 : 0);
            // the crossing: a quarter of the sample gap; the speed split: or the spread of its three crossings; a distance split: and the holes before it
            // ... and what a stamp beside the crossing is known to have been late by
            const here = (s.kmh ? Math.max(x.gap / 4, x.spread || 0) : x.gap / 4 + (x.unc > 0 && x.v > 0 ? x.unc / (x.v / KMH) * 1000 : 0)) + (x.late > 0 ? x.late : 0);
            const res = { s: (x.t - ref) / 1000, pm: ceil01(Math.max(0.01, (lead + here + stamp) / 1000)) };
            if (!s.kmh) {
                res.at = x.v;
                const b = s.trap ? r.mark[s.key + '-66'] : null;
                if (b && b.t !== null && x.t > b.t) res.trap = TRAP_M / ((x.t - b.t) / 1000) * KMH;
            }
            out[s.key] = res;
        }
        return out;
    }

    /** The run's speed trace for the screen: [[seconds since the clock started, km/h]]. */
    trace() {
        const r = this.run;
        if (!r || !r.acc) return [];
        const ref = this._clockRef(r);
        const from = ref === null ? r.t0 : ref;
        return r.acc.trace.map((p) => [(p[0] - from) / 1000, p[1]]);
    }

    /** Top speed (km/h, scale applied), metres covered and samples taken in this run so far. */
    progress() {
        const r = this.run;
        return r && r.acc ? { vmax: r.acc.vmax, dist: r.acc.dist, samples: r.acc.n } : { vmax: 0, dist: 0, samples: 0 };
    }

    /**
     * What the app is handed when a run ends (and may ask for during one). Times t0 / tFirst / tEnd / tRoll are
     * on the engine's own clock (ms), for the app to cut its wheel, slope and height records by (stoodSince:
     * when the car came to rest before this launch). No date in
     * here: the app adds the wall-clock date of a saved run itself.
     *   launch: { how: 'model3' | 'model2' | 'line3' | 'line2' | 'between' | 'interp', clamp: null | 'stand' | 'first',
     *             early ms, n, line: ms the brief's straight line would have put the launch after t0,
     *             apart: ms added to the +- because two ways of placing the launch differ or it was held at an end,
     *             tookLate: ms the stamp of a getter read the launch was placed with may be off (a read that took
     *             far longer than usual; 0: none),
     *             lowSeen: the smallest speed above 0 this series had reported before the launch (null: none yet).
     *             0.1 or less: it reads from 0. 1 or more after a few stops: it reads 0 until the car does that. }
     *   ended: 'quarter' | 'lift' | 'limit' | 'jump' (a step no car does, confirmed) | 'silent' (the series stopped)
     *   holeMs: the longest stretch with samples missing while the speed moved (0: none); frozenMs: the longest time
     *   a series that sends every slot repeated one value (above 5 km/h); merged: samples replaced by one that
     *   arrived with them; disorder: a sample read far lower than the one right before it, or a stamp did not run
     *   forward (samples out of order, or a wrong reading next to a late stamp: the engine cannot tell which); jumps;
     *   roundTrip: the middle round-trip time of its getter reads (polled);
     *   afterCreep: ms between the end of a creep and this launch, if under a second (the car hardly stood), else null.
     */
    summary() {
        const r = this.run;
        if (!r || !r.acc) return null;
        const a = r.acc, gaps = a.gaps, results = this.results();
        // the split that was reached last (its time is what the clock on the screen stops at)
        let lastSplit = null, lastT = -Infinity;
        r.splits.forEach((sp) => { const x = sp.kmh ? a.cross : r.mark[sp.key]; if (results[sp.key] && x && x.t > lastT) { lastT = x.t; lastSplit = sp.key; } });
        return {
            series: this.series, start: r.start, unit: r.unit,
            results, lastSplit,
            vmax: a.vmax, peakG: Math.round(a.peak * 1000) / 1000,
            samples: a.n, medianGap: gaps.length ? median(gaps) : null, longestGap: gaps.length ? Math.max.apply(null, gaps) : null,
            launchGap: r.launchGap, firstKmh: r.firstKmh, launch: r.launch,
            dropped: r.dropped, merged: r.merged, disorder: !!r.disorder, jumps: r.jumps, holeMs: Math.round(a.holeMs), frozenMs: Math.round(a.frozenMs), roundTrip: isNum(r.tookMid) ? r.tookMid : null,
            afterCreep: r.afterCreep,
            scale: r.scale, scaleSource: r.scaleSource,
            ended: r.ended, length: r.endAt, dist: a.dist, slot: r.slot,
            // quietEnd: ms between the series' last sample and the end of the run (long: it ended on a silent series)
            quietEnd: r.tEnd !== null && a.realT !== null ? Math.max(0, r.tEnd - a.realT) : null,
            t0: r.t0, tFirst: r.tFirst, tEnd: r.tEnd, tRoll: r.mark.roll.t, stoodSince: r.stoodSince,
        };
    }
}

module.exports = {
    RunEngine, splitsFor, lineCross, launchFit, median, DISTANCES, STARTS,
    LAUNCH_KMH, ARM_MS, ROLLOUT_M, TRAP_M, CREEP_KMH, LIFT_KMH, MAX_RUN_MS, MISSED_KMH, GLITCH_MS2, FIT_N, FIT_MS, HOLD_MAX_MS, BURST_MS, LOW_TRUST_KMH, MPH,
};
