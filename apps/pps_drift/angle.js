'use strict';
/**
 * angle.js - Proven Drift: the drift angle, estimated from the car's own motion sensors. Pure logic: it is
 * handed stamped samples and the clock, and touches neither the car nor the wall clock.
 *
 *   const a = new Angle({ wheelbase: 2.85, front: 0.5, useSteer: true, useLong: true, speedMaxAgeMs: 0, yawMaxAgeMs: 0, latMaxAgeMs: 0,
 *                         learned: () => learn.values(), onStep: (s) => ... });
 *   a.speed(t, kmh)  a.lat(t, ms2)  a.long(t, ms2)     the car's speed and its two accelerations, scaled as the kit scales them
 *   a.yaw(t, raw)    a.steer(t, raw)                   raw counts: their scale, sign and zero are learned (learn.js)
 *   a.advance(now)   after every sample and every 50 ms: works the angle out up to a moment ago and calls
 *                    onStep(s) for every step of at most 20 ms
 *   s = { t, ok, why, beta rad, pm degrees, kmh, r rad/s, ay, ax m/s2 (less ax0), hasAx: there is a forward acceleration,
 *         ax0 m/s2: what the forward acceleration reads more than the speed's own change on a straight (taken out),
 *         d rad | null (front wheels), over rad | null, steering: the steering check is pulling,
 *         sw: why the steering can back no drift right now ('off' | 'nosource' | 'stale': silent or stuck | 'unlearned'), or null: it can,
 *         acc rad | null (the acceleration check's angle), accStrong: it is strong enough to pull, accel: it is pulling,
 *         rest, anchored, lost: the angle was dropped in this step because what was learned changed under it,
 *         gap ms, slot ms | null (not known yet), lag ms, state: 'learned' | 'learning' | 'none' }
 *       (one object, written again for every step: copy what you keep)
 *   a.stats(t, ms)   what the sources read over the last ms, for learn.js
 *
 * THE ANGLE is the angle between where the car points and where it travels (the sideslip angle, beta). It is
 * an ESTIMATE everywhere: nothing here has been on a car.
 *
 * SIGNS, in this file and in every number it hands on: x forward, y to the LEFT; the sideways acceleration
 *   and the yaw rate are positive in a left-hand turn. beta is positive when the car travels to the left of
 *   where its nose points. So in a drift through a left-hander (the tail out to the right, the nose pointing
 *   into the turn) beta is NEGATIVE. drift.js turns that into a size and LEFT / RIGHT for the screen.
 *   Which way the car's sideways acceleration counts as positive is not known: left is assumed, and learn.js
 *   checks it against the wheels where there are wheel speeds. The yaw rate and the steering have no sign of
 *   their own here: each is learned against the sideways acceleration, sign and all.
 *
 * THE CORE. With speed V, yaw rate r, sideways acceleration ay and forward acceleration ax:
 *     d(beta)/dt = (ay cos(beta) - ax sin(beta)) / V - r
 *   That is plain kinematics: it needs no tyre and no car data. It is summed up step by step (20 ms at most,
 *   a midpoint step) over real time. Every error in ay or r adds up for as long as it runs, so four things
 *   keep it honest:
 *   1. THE PAIR (ay, r) IS MATCHED ON THIS CAR (learn.js). In ordinary cornering ay = k r V. k, with the yaw
 *      rate's unknown scale and sign, is learned from ordinary corners, so r here is "k times the yaw rate":
 *      the angle then stays at rest while the car is not sliding. Body roll and sensor gain fall into k, and
 *      the price is that the angle reads high by whatever share of k is not the yaw rate's own scale (the roll
 *      share: a few percent, not known for any car). The +- carries 8 % of the angle for it.
 *   2. REST. When the car has gone straight and settled for 0.7 s (in both halves of that stretch the yaw
 *      rate within 2 degrees a second of zero and the two halves alike; the sideways acceleration within
 *      1.5 m/s2 of its zero and the halves alike; the steering near its centre where it is known; while
 *      the yaw rate's scale is still the default its test is left out and the acceleration's is 0.5), the
 *      angle is pulled to zero within a quarter of a second. Where the yaw rate is within 1 degree a
 *      second, the zeros of ay and r are trimmed slowly as well. Between 1 and 2 they are left alone:
 *      that may be a zero that has moved (the angle must not run away on a straight for it), and it may
 *      be a gentle bend (which must not be learned as a zero).
 *      A standing car trims the yaw zero quickly (a standing car does not turn). Under 10 km/h the angle is
 *      not defined: it is held at zero and reported as such.
 *   3. THE STEERING CHECK. With the front wheels' angle d (learned scale), wheelbase L and the distance a
 *      from the front axle to the centre of gravity, the car travels at beta + a r / V at its front axle,
 *      and the front tyres run at a small slip angle alpha_f to that:  beta_steer = d - a r / V - alpha_f.
 *      alpha_f grows with the sideways load and stops growing: 4 degrees per g, and no more than 5 degrees
 *      (the table below; a guess at a road car's front axle, not any car's tyre). While the car OVERSTEERS
 *      (it turns faster than its steering asks for: sign(r) (L r / V - d) is more than 1.5 degrees, which
 *      includes steering against the turn), the summed angle is pulled toward beta_steer with a time
 *      constant of 3 s. In understeer (the car turns less than it is steered, by more than 3 degrees at
 *      the wheels) the front tyres' slip is large and unknown, the steering says nothing about beta, and
 *      it is not used.
 *      Two things here are not in the brief (proven/CHANGES-drift.md says why, with the figures):
 *      - Between the two, where the car GOES WHERE IT IS STEERED, the same beta_steer is pulled to with a
 *        time constant of 1 s. There the car does not slide, beta_steer is the small angle of a car that
 *        grips, and this is what keeps a banked or a very long corner from adding up to an angle.
 *      - Where beta_steer and the summed angle are more than 15 degrees apart, the check is not believed
 *        and does not pull (the wheels at their lock, a driver who has let go, a spin). The +- grows by
 *        the whole difference instead. An angle that was lost takes the check whatever it says.
 *      THE STEERING GONE SILENT. A steering angle that is not sent may be a wheel held still, or a source
 *      that has died. It counts as silent (stale) when it has said nothing for 2 s or more and, since its
 *      last sample, the car has both gone straight (under 2 degrees a second of yaw, with less than 20
 *      degrees of angle shown) and turned (the yaw rate moved by 6 degrees a second or more): no car goes
 *      into a corner or out of one on a wheel that does not move by a count. It is then not used, here or
 *      at rest, until it speaks again. (A source that dies in the middle of a corner is believed until the
 *      car has gone straight with less than 20 degrees shown: see WHAT THE TWO RULES DO NOT SEE.)
 *      THE STEERING STUCK. A value that is still SENT and does not move is no news of the wheel either,
 *      and the rule above does not see it (its samples arrive). But a wheel that is held still reads the
 *      same for seconds too, in a long steady drift and at its lock, so more is asked here. It counts as
 *      stuck (stale, the same word) when its value has not moved by one count for 2 s or more and in that
 *      time the car has gone straight for 0.7 s at 10 km/h or more (the yaw rate within 2 degrees a second
 *      of zero in both halves of that stretch, on average, and the car not shown sideways at its end: the
 *      next two paragraphs) and after that turned for 0.7 s (in both halves the yaw rate 6 degrees a second
 *      or more and the sideways acceleration 1.5 m/s2 or more from its zero, all the same way). It is then
 *      not used, here or at rest, until its value moves. A yaw rate that only crosses zero or only shakes,
 *      a yaw rate that turns while the car feels nothing sideways, and a car that pulls away from a
 *      standstill on a turned wheel do not make it stuck.
 *      "GONE STRAIGHT" ASKS FOR THE ANGLE SHOWN, in both rules (STRAIGHT_DEG), because a car that is
 *      sideways can stop turning its nose: the driver lifts in the middle of a drift, or the car slides on
 *      in a straight line between two corners, and its wheels sit at their lock all the while. Judged by
 *      the yaw rate alone that read "gone straight, then turned, on a value that did not move", and a
 *      healthy steering was taken for stuck or silent in the largest drifts. That takes a value that sits
 *      still to the last count at the lock; whether a car's steering does that is not known. Why 20
 *      degrees: it is more than a stuck value pulls onto the screen by itself in a car that grips (the
 *      check believes nothing further than 15 degrees from the sum), and less than a car's lock. On
 *      made-up cars with 35 to 37 degrees of lock, limits of 15 to 30 did both; with 12 and less a stuck
 *      value backed false drifts with no flag again, and with 35 the healthy wheel was taken for stuck.
 *      (A lock of less than about 28 degrees is not covered by it: part 7 of proven/CHANGES-drift.md.)
 *      THE STUCK RULE ASKS THE STEERING AS WELL (SIDEWAYS_STEER_DEG). With the angle shown alone, the
 *      stuck rule and the rest rule could hold each other up. A value freezes at a few degrees in an
 *      ordinary corner and is still sent; a banked corner follows with no straight between; the frozen
 *      value does not fit it, the check is not believed, and the sum runs to 20 degrees or more. On every
 *      straight after it the rest rule waits for a steering near its centre and the stuck rule for less
 *      than 20 degrees shown, for as long as the car stays over 10 km/h. So for the stuck rule a stretch
 *      is "not straight" only where 20 degrees or more are shown AND the front wheels are turned the way
 *      of that angle, down the car's path, by 10 degrees or more (on the scale that was learned), as a
 *      car that slides without turning its nose holds them: at their lock in a big drift. Where the
 *      steering's scale is not known at all, the angle shown alone decides. Why 10 degrees: on made-up
 *      cars a value that froze in an ordinary corner (0.4 to 0.5 g at 40 to 60 km/h) stood at 2 to 8
 *      degrees at the wheels, and a wheel at a lock of 28 degrees was read as 25 (as 17.5 on a scale
 *      learned 30 % too small). With 5 the state above still held; with 15 a wheel at a lock of 22
 *      degrees on such a short scale was taken for stuck. Nothing of this is known for any car.
 *      THE SILENT RULE DOES NOT ASK THE STEERING. Its straight is one look, not 0.7 s. With the steering
 *      asked there too, a healthy wheel held still at a few degrees of opposite lock through a slide, on
 *      a steering that is sent on change, was taken for silent in the slide itself, the car for at rest,
 *      and the drift was cut in two (made-up cars). A steering that says nothing has not moved either:
 *      the stuck rule looks at it as well, and finds it in the first corner after a straight.
 *      WHAT THE TWO RULES DO NOT SEE: a value that sticks or dies in the middle of a corner or of a drift
 *      (it is believed until the car has gone straight, with less than 20 degrees shown, and turned
 *      again); one that sticks or dies while 20 degrees or more are on the screen for another reason AND
 *      stands 10 degrees or more to the side of that angle, such as a value frozen in a slow, tight
 *      corner before a banked one (it is believed until less than 20 are shown on a straight, or the car
 *      comes under 10 km/h); a car that never goes straight for 0.7 s (on a pan a value that sticks in a
 *      corner then backs the circles the other way as opposite lock, with no flag); corners in which the
 *      car feels under 1.5 m/s2 sideways; and a slalom alone.
 *      AND ONE THAT DIES OR STICKS AT THE LOCK IN A DRIFT THAT THEN FADES OUT SLOWLY while the car goes on
 *      turning (part 8 of proven/CHANGES-drift.md). The dead value reads as opposite lock and holds the
 *      angle shown up as the true one falls. On every straight after it 20 degrees or more then stand on
 *      the screen, on that value's own side: no straight for the silent rule, none for the stuck rule
 *      (the wheels read far into the slide), and the rest rule waits for a steering near its centre. It
 *      is believed to the end of the drive, real drifts after it are not counted and nothing can start,
 *      whether the value is still sent or not. On made-up cars it was found where the drift faded out
 *      within 12 s, and believed to the end where that took 13 s or more on two of them and 14 s or more
 *      on the third. Before "gone straight" asked for the angle shown, the silent rule found a dead
 *      steering there as the car first went straight.
 *      THE OTHER WAY ROUND, a HEALTHY wheel that does not move by a count for 2 s or more with less than
 *      10 degrees of it turned into the slide, while the car's nose stops turning and turns again, is
 *      taken for stuck. A SLOW, TIGHT DRIFT asks no more of the wheel than that (part 8): the front
 *      wheels point down their own path, which at the front axle is the drift angle less a r / V and
 *      the front tyres' slip (point 3), and a r / V is large where the car turns tightly at low speed.
 *      On made-up cars 19 to 20 degrees of angle through a corner of 0.5 to 0.7 g at 25 to 30 km/h were
 *      held with 9 to 10 degrees of opposite lock, and on one of them tighter corners with the wheels
 *      turned into the turn. If the value then sits still to the count through a straight slide and the
 *      corner after it, the steering counts as stuck: a drift that had no flag carries NO STEERING
 *      CHECK; in a SECOND straight slide the rest rule, which leaves a stuck steering out, takes the car
 *      for at rest, pulls the angle to zero in the middle of the slide and cuts the drift in two; and
 *      the screen says the steering is silent or stuck while it works. On the files of part 6 no clean
 *      drift was flagged and none was cut in two in those cases.
 *      It takes a value that does not move by one count: with counts of 0.01 or 0.1 degrees a wander of
 *      the hands of 0.05 degrees kept it away on a made-up car, with counts of 0.5 or 1 degree a wander
 *      of 0.2 did not. Not changed for 1.0.0: the three rounds before each traded one such case for
 *      another on made-up cars, and which of them a car can show at all (a value that sits still to the
 *      count, one that freezes and is still sent, how fine its counts are, whether it is sent every slot
 *      or on change) is not known for any car.
 *      And the stuck rule assumes a steering angle whose counts are fine enough to move whenever the car
 *      goes from a straight into such a corner. On a made-up car that held with counts as coarse as 1
 *      degree at the wheels; no car's steering counts are known.
 *      WHY THE STEERING CAN BACK NO DRIFT (sw): the setting "Steering check" is off, there is no steering
 *      sample, it has gone silent or is stuck, or its scale is not "learned" yet (learn.js; the check itself already pulls on a
 *      scale that is still "learning"). drift.js gives every drift that the steering did not back a flag
 *      of its own, and such a drift is no best.
 *   3b. THE ACCELERATION CHECK (not in the brief either). Along its path the car gains speed at
 *      ax cos(beta) + ay sin(beta): a car that is sideways feels part of its turn in its FORWARD
 *      acceleration. With the speed's own change Vdot that gives an angle without any summing up:
 *      beta_acc = asin(Vdot / A) - atan2(ax, ay), A = both accelerations together. It is worked out with
 *      1.5 m/s2 or more of sideways acceleration (both accelerations as their mean over 0.2 s, the speed's
 *      change over 0.3 s), and it PULLS with 3 m/s2 or more: where the steering check is not pulling (no
 *      steering on this car, understeer, or the check not believed), the summed angle is pulled toward
 *      beta_acc with a time constant of 2 s, unless the two are more than 20 degrees apart. Between 1.5
 *      and 3 m/s2 it is too coarse to pull (a forward acceleration that is 0.3 m/s2 off is 11 degrees
 *      there), and is only handed on: without steering, drift.js starts no drift that it speaks against.
 *      A banked road tilts ay only and leaves this angle near zero. So a HARD banked corner (3 m/s2 felt
 *      or more) does not sum up to an angle on a car without steering. A gentler one does: nothing pulls
 *      there, the angle shown runs, and what drift.js counts of it is flagged and no best. It rests on
 *      two things nobody has checked: that the forward acceleration is a sensor's reading and not worked
 *      out from the speed, and that the speed is the car's true speed while it is sideways. (If it IS
 *      worked out from the speed, the core above is wrong with it and every held drift runs away:
 *      useLong: false leaves the forward acceleration out.)
 *   3c. THE FORWARD ACCELERATION'S OFFSET (not in the brief). On a road that climbs the car feels g x the
 *      sine of the grade forward that its speed does not show (0.51 m/s2 on 3 degrees), and a zero that
 *      is off reads the same. To the acceleration check, to the core and to learn.js that is the forward
 *      share of a slide. So at rest (point 2), where the car goes straight and gains speed at just what
 *      it feels, the difference between the two is measured: over the 0.7 s of rest, where the speed
 *      changes by no more than 2 m/s2 and the two halves of the stretch agree within 0.5 m/s2. The first
 *      looks are averaged as they come, from then on it follows with a time constant of 2 s. It is taken
 *      out of the forward acceleration everywhere: in the core, in the acceleration check, and in what
 *      learn.js is handed. What is left: a grade that begins or changes inside a corner (the offset is
 *      the last straight's), and a car that never goes straight.
 *   4. A +- THAT GROWS (pm, degrees). Five parts, put together as the root of their squares: 1 degree; 8 %
 *      of the angle; what may have been summed up wrongly since the last rest (each step adds the root of
 *      the squares of: 0.15 degrees a second for the yaw zero, 0.15 m/s2 over V for the ay zero, and of the
 *      yaw rate 2 % once k is learned, or its spread if that is more, 10 % while learning, 50 % before);
 *      half a send slot's worth of yaw rate; and how far the check that is in use and the summed angle are
 *      apart. While the steering check pulls, the summed-up part falls back toward 3 degrees (what that
 *      check is taken to be good for), while the acceleration check pulls toward 4. Added on top: 10
 *      degrees until the first rest after the angle was lost or the app started.
 *
 * WHAT WAS LEARNED CHANGES UNDER THE SUM. When a first line is drawn for the yaw rate, or a line moves the
 *   yaw rate in use by more than 5 % (and half a degree a second), the angle summed so far was summed on
 *   another scale. It is dropped (zero, 10 degrees more +- until the next rest), and the step says so
 *   (lost): drift.js then starts nothing until the car has gone straight. Before this rule the stale angle
 *   of a car whose scale is not the default started a drift the moment its first line was drawn.
 *
 * WITHOUT A YAW RATE there is no angle (ok false, why 'noyaw'). Without steering points 1, 2, 3b, 3c and 4
 * remain; where the car then feels less than 3 m/s2 sideways (low grip, a banked corner) nothing pulls,
 * the angle is the bare sum and its +- grows. Without the forward acceleration (a car that does not send
 * it, or useLong: false) there is no acceleration check, and in the core its steady share is used
 * (ax = -r V sin(beta), what it is in a held drift). With neither steering nor forward acceleration nothing
 * holds the +- down anywhere.
 *
 * HOW THE SAMPLES ARE USED. Each source is kept on its own (series.js) and read at any moment on the
 * straight line between its two samples around that moment. So the angle is worked out up to a moment AGO:
 * 1.5 send slots of the slower of ay and r, plus 10 ms (40 to 300 ms). Sources may arrive at different rates
 * and not together. A source that has gone silent reads its last value. If the yaw rate has said nothing
 * for 2 s while ay moved, or ay while the yaw rate moved, it is taken as lost: the angle is no longer
 * defined (why 'noyaw' or 'gap') until that source speaks again, and then carries 10 degrees more +- until
 * the next rest. The two stopping TOGETHER shows nothing that way. So the app may say how old a healthy
 * yaw rate and a healthy sideways acceleration can be on the move (yawMaxAgeMs, latMaxAgeMs: it reads
 * their getters when the car sends too few): one that is older, with the car at 10 km/h or more for all of
 * that time, is lost in the same way. A hole in a source (series.js), one of those two silent for 350 ms while the other moved,
 * the yaw rate at the end of its raw range, and a tick of the app that came 300 ms late or more are
 * reported with the next step (gap), for the DATA GAP flag. Nothing is made up across a hole beyond the
 * straight line between its two ends.
 *
 * WHAT IS NOT KNOWN AND NOT SOLVED HERE
 *   - What speed the car reports while it is sideways (its true speed, or the speed along its own length).
 *     The formula takes it as the true speed.
 *   - How late each source is against the others. A constant difference of 50 ms between ay and r puts the
 *     angle off by that time's worth of change in the yaw rate while it lasts.
 *   - A banked road reads as sideways acceleration that turns nothing. The steering check holds the angle
 *     down there, and the acceleration check where the car still feels 3 m/s2 sideways. They do not take
 *     the bank out. On a car without steering in a gentler banked corner nothing holds it, and with
 *     neither steering nor forward acceleration nothing sees it at all. With steering a slow, tight
 *     banked corner outruns the check too (10 degrees of bank at 25 km/h showed 11 degrees on a made-up
 *     car). drift.js keeps all of that from being a best; it is still shown and counted.
 *   - A road that begins to climb in the corner (point 3c).
 *   - With the front wheels at their lock the steering check pulls the angle down, as long as it is
 *     within 15 degrees of the sum (drifts of about 42 to 52 degrees on a car with 35 degrees of lock).
 *   - The front tyres' slip is a guess (the table below). A front axle that slips more makes the steering
 *     check, and with it every held drift, read low by about that much.
 *   - The angle reads high by the share of k that is body roll (point 1). Where the yaw rate is all there is
 *     (a spin), the summed angle runs ahead by that share.
 *   - A car that pulls away from a crawl already sideways starts from zero at 10 km/h and reads low at first.
 *   - Driving backwards is not recognised.
 */
const { Series, isNum } = require('./series');

const DEG = Math.PI / 180, KMH = 3.6, G0 = 9.80665;

/** Every number of the estimate. All are guesses made by reasoning: none was tried on a car. */
const TABLE = {
    STEP_MS: 20,                       // the longest step of the sum
    LAG_SLOTS: 1.5, LAG_ADD_MS: 10, LAG_MIN_MS: 40, LAG_MAX_MS: 300,     // how far behind "now" the angle is worked out
    SLOT_UNKNOWN_MS: 100,              // a source whose send slot is not known yet counts as this
    MIN_KMH: 10,                       // under this the angle is not defined
    STAND_KMH: 0.5, STAND_MS: 1000, STAND_TAU_MS: 700,                   // standing: the yaw zero is trimmed quickly
    REST_MS: 700,                      // straight and settled for this long: rest
    REST_AY: 0.5, REST_AY_WIDE: 1.5,   // m/s2 from its zero (the wide one where the yaw rate is known to be near zero)
    REST_AY_ALIKE: 0.35,               // m/s2 between the two halves
    REST_YAW_DPS: 1.0, REST_YAW_ALIKE_DPS: 0.6,
    REST_STEER_DEG: 2.5,
    REST_TAU_MS: 250,                  // the angle goes to zero this fast at rest
    TRIM_AY_TAU_MS: 4000, TRIM_YAW_TAU_MS: 15000,                        // the zeros follow this slowly at rest
    REST_EVERY_MS: 100,                // how often rest is looked for
    STEER_TAU_MS: 3000,                // the steering check pulls this slowly while the car oversteers
    OVER_ON_DEG: 1.5,                  // oversteer: the car turns this much (at the front wheels) more than its steering asks
    NEUTRAL_DEG: 3, NEUTRAL_TAU_MS: 1000,   // it goes where it is steered (within this much the other way): the check pulls this fast
    STEER_OFF_DEG: 15,                 // the check and the summed angle further apart than this: the check is not used
    ACC_AY: 3,                         // m/s2: the acceleration check pulls with this much sideways acceleration or more
    ACC_SEE: 1.5,                      // m/s2: and is worked out, for drift.js to ask, from this much on
    ACC_MEAN_MS: 200, ACC_V_MS: 300,   // it takes both accelerations as their mean over this long, and the speed's change over this long
    ACC_VDOT_SHARE: 0.8,               // and a speed that changes by no more than this share of the two accelerations together
    ACC_TAU_MS: 2000, ACC_OFF_DEG: 20, // it pulls this slowly, and is not used further off than this
    AX0_TAU_MS: 2000, AX0_VDOT: 2, AX0_ALIKE: 0.5,   // the forward acceleration's offset follows this slowly at rest, with the speed changing by no more than this (m/s2) and the two halves of the stretch alike within this (m/s2)
    TURN_MIN_DPS: 2,                   // under this yaw rate the car is not "turning"
    STRAIGHT_DEG: 20,                  // for a steering that is silent or stuck the car has "gone straight" only with less than this angle shown: a car that is sideways can stop turning its nose too
    SIDEWAYS_STEER_DEG: 10,            // for the stuck rule that angle is "sideways" only with the front wheels turned this far or more the way of it, down the car's path (where the steering's scale is known at all): a value frozen at less is no wheel held into a slide (nor, a known limit, is a healthy wheel held still at less, as a slow, tight drift asks: the head of this file)
    RELEARN_SHARE: 0.05, RELEARN_DPS: 0.5,   // what was learned moves the yaw rate in use by more than this share of it (and this much): the sum starts again
    ALPHA_PER_G: 4, ALPHA_MAX_DEG: 5,  // front slip angle: 4 degrees per g of sideways acceleration, and no more than 5 degrees
    V_FLOOR: 2.5,                      // m/s: no division by less
    DEAD_MS: 2000,                     // the yaw rate or the sideways acceleration silent this long while the other moved: lost
    STALE_SPAN_MS: 5500,               // the steering silent for DEAD_MS or more: the yaw rate is looked at since its last sample, this far back at most
    RESTART_MS: 5000,                  // the app itself was away this long: start again
    LATE_TICK_MS: 300,                 // the app's own tick this late: a gap
    BETA_MAX_DEG: 220,
    RAW_LO: 0, RAW_HI: 65534,          // a raw yaw count at either end of its range (or beyond: 65535 is the car's "no value") is no reading
    CEIL_GAP_MS: 350,                  // a reading at the ceiling counts as a gap of at least this long
    // a step bigger than JUMP from one sample to the next, and bigger than SLEW a second, is held back until the next
    // sample confirms it (series.js). The accelerations have no SLEW: on a rough road they really do step about.
    JUMP: { kmh: 5, ms2: 8, yawDps: 40, steerDeg: 8 },
    SLEW: { kmh: 90, ms2: 0, yawDps: 500, steerDeg: 300 },
    CROSS_GAP_MS: 350,                 // the yaw rate silent this long while the sideways acceleration moved (or the other way round): a gap
    STILL: { kmh: 0.5, ms2: 0.5, yawDps: 3, steerDeg: 1.5 },             // "no change" across a silence
    PM: { base: 1, share: 0.08, zeroDps: 0.15, ayZero: 0.15, k: { learned: 0.02, learning: 0.10, none: 0.5 }, slot: 0.5, disagree: 1, steerFloor: 3, accFloor: 4, unanchored: 10, max: 99 },
};
const T = TABLE;

const fade = (ms, tau) => 1 - Math.exp(-ms / tau);
const sign = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);

/** The front tyres' slip angle (rad) taken for a sideways acceleration (m/s2): it grows, and stops growing. */
function frontSlip(ay) {
    const a = Math.min(T.ALPHA_MAX_DEG, T.ALPHA_PER_G * Math.abs(ay) / G0) * DEG;
    return ay < 0 ? -a : a;
}

class Angle {
    constructor(o) {
        this.o = Object.assign({ wheelbase: 2.85, front: 0.5, useSteer: true, useLong: true }, o);
        this.speedS = new Series({ keepMs: 6000, lo: 0, hi: 500, jump: T.JUMP.kmh, slew: T.SLEW.kmh, still: T.STILL.kmh });
        this.latS = new Series({ keepMs: 6000, lo: -30, hi: 30, jump: T.JUMP.ms2, slew: T.SLEW.ms2, still: T.STILL.ms2 });
        this.longS = new Series({ keepMs: 6000, lo: -30, hi: 30, jump: T.JUMP.ms2, slew: T.SLEW.ms2, still: T.STILL.ms2 });
        this.yawS = new Series({ keepMs: 6000, lo: T.RAW_LO + 1, hi: T.RAW_HI - 1 });
        this.steerS = new Series({ keepMs: 6000, lo: T.RAW_LO + 1, hi: T.RAW_HI - 1 });
        this.reset();
    }

    /** Forget everything but the settings (the sources' samples too). */
    reset() {
        [this.speedS, this.latS, this.longS, this.yawS, this.steerS].forEach((s) => s.reset());
        this.tp = null; this.lastNow = null;
        this.beta = 0; this.U = 0; this.anchored = false;
        this.ay0 = 0; this.ay0Set = false;
        this.ax0 = 0; this.ax0N = 0; this.ax0Sign = 0;   // what the forward acceleration reads more than the speed's own change on a straight (m/s2), how many looks it was taken from, and with which sign of that acceleration
        this.stale = false; this.staleAt = null;   // the steering has gone silent while the car turned (the count of its samples then)
        this.straightAt = null;            // when the car last went straight, for the silent steering: its yaw rate under 2 degrees a second and the angle shown under STRAIGHT_DEG
        this.steerMoved = null; this.steerMoves = 0;   // when the steering's value last moved by a count, and how often it has
        this.heldAt = 0; this.heldStraight = false; this.stuckAt = null;   // the car has gone straight on a value that did not move; the steering is stuck (the count of its moves then)
        this.z = null;                      // the yaw rate's zero, raw (null: the learned one, or the default)
        this.zs = null;                     // the steering's reading at rest, raw (a hint for learn.js)
        this.rest = false; this.restAt = -Infinity; this.dead = null; this.lost = null;
        this.gapMs = 0; this.ceilAt = null;
        this.was = null;                    // the yaw rate's scale, zero and state that the last step was summed with
        this.out = { t: 0, ok: false, why: 'nodata', beta: 0, pm: T.PM.max, kmh: null, r: 0, ay: 0, ax: 0, hasAx: false, ax0: 0, d: null, over: null, steering: false, sw: 'nosource', acc: null, accStrong: false, accel: false,
            rest: false, anchored: false, lost: false, gap: 0, slot: null, lag: T.LAG_MAX_MS, state: 'none' };
    }

    configure(c) {
        Object.assign(this.o, c);
        // (the forward acceleration left out: as on a car that does not send it)
        if (this.o.useLong === false) { this.longS.reset(); this.ax0 = 0; this.ax0N = 0; }
    }

    speed(t, kmh) { this.speedS.add(t, kmh); }
    lat(t, a) { const last = this.latS.last(); if (this.latS.add(t, a)) this._crossGap(last, t, this.yawS); }
    long(t, a) { if (this.o.useLong !== false) this.longS.add(t, a); }
    yaw(t, raw) {
        // a count at the very end of its range, twice or more in a row, is the sensor's ceiling and not a reading: a gap
        // for as long as it lasts (once, it is a lone wrong value like any other and is simply not taken)
        if (isNum(raw) && isNum(t) && (raw <= T.RAW_LO || raw >= T.RAW_HI)) {
            if (this.ceilAt === null) this.ceilAt = t; else this.gapMs = Math.max(this.gapMs, T.CEIL_GAP_MS, t - this.ceilAt);
            return;
        }
        this.ceilAt = null;
        this._units();
        const last = this.yawS.last();
        if (this.yawS.add(t, raw)) this._crossGap(last, t, this.latS);
    }

    /**
     * One of the two sources that belong together (yaw rate, sideways acceleration) said nothing for 350 ms or
     * more, and the other moved meanwhile (by twice its "no change"): samples are missing, whatever the next one
     * reads. (A yaw rate that rose and fell again inside a hole comes back where it was: no step shows it.)
     */
    _crossGap(last, t, other) {
        if (!last || t - last.t < T.CROSS_GAP_MS || !other.count) return;
        const w = other.window(last.t, t);
        if (w && w.max - w.min > 2 * other.still) this.gapMs = Math.max(this.gapMs, t - last.t);
    }
    steer(t, raw) {
        this._units();
        // (when its value last MOVED: a value that is sent again and again without moving by a count is no news of the wheel)
        const last = this.steerS.last();
        if (this.steerS.add(t, raw) && (!last || raw !== last.v)) { this.steerMoved = t; this.steerMoves++; }
    }

    /** What was learned (learn.js), or the stated defaults. */
    _learned() { return this.o.learned ? this.o.learned() : { k: 0.005 * DEG, zero: 32768, state: 'none', kc: null, szero: null, sstate: 'none', axSign: 1 }; }

    /** The raw sources' limits for a step and for "no change", in their own counts (they follow what was learned). */
    _units() {
        const L = this._learned(), k = Math.abs(L.k) || 1;
        this.yawS.jump = T.JUMP.yawDps * DEG / k; this.yawS.slew = T.SLEW.yawDps * DEG / k; this.yawS.still = T.STILL.yawDps * DEG / k;
        if (isNum(L.kc) && L.kc !== 0) {
            const c = Math.abs(L.kc) * this.o.wheelbase;
            this.steerS.jump = T.JUMP.steerDeg * DEG / c; this.steerS.slew = T.SLEW.steerDeg * DEG / c; this.steerS.still = T.STILL.steerDeg * DEG / c;
        } else { this.steerS.jump = Infinity; this.steerS.slew = 0; this.steerS.still = 0; }
    }

    _slot() {
        const a = this.yawS.slot(), b = this.latS.slot();
        this.slotKnown = a !== null && b !== null;
        return Math.max(a === null ? T.SLOT_UNKNOWN_MS : a, b === null ? T.SLOT_UNKNOWN_MS : b);
    }

    advance(now) {
        if (!isNum(now)) return;
        [this.speedS, this.latS, this.longS, this.yawS, this.steerS].forEach((s) => s.flush(now));
        if (this.lastNow !== null && now < this.lastNow) return;
        if (this.lastNow !== null && now - this.lastNow >= T.LATE_TICK_MS) this.gapMs = Math.max(this.gapMs, now - this.lastNow);
        this.lastNow = now;
        const slot = this._slot(), lag = Math.min(T.LAG_MAX_MS, Math.max(T.LAG_MIN_MS, T.LAG_SLOTS * slot + T.LAG_ADD_MS));
        const target = now - lag;
        if (this.tp === null || target - this.tp > T.RESTART_MS) { this.tp = target; this._lose(); return; }
        while (this.tp + 1e-6 < target) {
            const t1 = Math.min(target, this.tp + T.STEP_MS);
            this._step(this.tp, t1, slot, lag);
            this.tp = t1;
        }
    }

    /** The angle is no longer known: zero, and not to be trusted until the next rest. */
    _lose() { this.beta = 0; this.U = 0; this.anchored = false; this.rest = false; }

    /**
     * Is one of the three sources the angle needs lost? Silence alone does not say so: a value that does not
     * change is not sent. It is lost when it has been silent for 2 s while it MUST have changed: the yaw rate
     * while the sideways acceleration moved (by twice its "no change"), the sideways acceleration while the
     * yaw rate moved. A speed that does not change says nothing either, and nothing here shows that it must
     * have: the speed counts as lost only where the app sets speedMaxAgeMs (it reads the speed's getter on a
     * schedule, as Proven Drag does, and so knows how long a healthy speed can stay silent).
     * The same way the app can set yawMaxAgeMs and latMaxAgeMs where it reads those getters whenever the car
     * sends too few samples on the move: without them, a car whose yaw rate and sideways acceleration stop
     * TOGETHER shows nothing that must have changed, and the angle would go on from the last values for good.
     */
    _dead(t) {
        // (a source that was taken as lost stays lost until it speaks again)
        if (this.lost && this.lost.series.count === this.lost.count) return this.lost.why;
        this.lost = null;
        const why = this._deadNow(t);
        if (why) { const series = why === 'noyaw' ? this.yawS : this.latS.age(t) > T.DEAD_MS ? this.latS : this.speedS; this.lost = { why, series, count: series.count }; }
        return why;
    }

    /**
     * Has the steering gone silent? Silence alone does not say so: a wheel that is held still is not sent, and a
     * wheel at its lock in a long drift is held still. It is stale when it has said nothing for 2 s or more, and
     * since its last sample the car has both gone straight (under 2 degrees a second of yaw, with less than
     * STRAIGHT_DEG of angle shown) and turned (the yaw rate moved by twice its "no change"): no car goes from a
     * straight into a corner, or out of one, on a wheel that does not move by one count. The angle is asked
     * because a car that is sideways can stop turning its nose as well, in a lift or a straight slide, with its
     * wheels still at their lock: that is no straight. Stale, the steering is not used and backs no drift
     * (drift.js) until it speaks again. (zero, k: the yaw rate's zero and scale in use.)
     */
    _stale(t, zero, k) {
        if (this.staleAt !== null && this.steerS.count === this.staleAt) return true;
        this.staleAt = null;
        // (the car goes straight at this look: the yaw rate came under 2 degrees a second since the last one, and the car is not shown sideways)
        const lim = T.TURN_MIN_DPS * DEG / (Math.abs(k) || 1), y = this.yawS.count ? this.yawS.window(t - T.REST_EVERY_MS, t) : null;
        if (y && y.min - zero <= lim && y.max - zero >= -lim && Math.abs(this.beta) < T.STRAIGHT_DEG * DEG) this.straightAt = t;
        const last = this.steerS.last();
        if (!last || t - last.t <= T.DEAD_MS || this.yawS.age(t) > T.DEAD_MS || !(this.straightAt > last.t)) return false;
        const w = this.yawS.window(Math.max(last.t, t - T.STALE_SPAN_MS), t);
        if (!w || w.n < 3 || w.max - w.min <= 2 * this.yawS.still || w.min - zero > lim || w.max - zero < -lim) return false;
        this.staleAt = this.steerS.count;
        return true;
    }

    /**
     * Is the steering STUCK: a value that is still sent and does not move? A wheel that is held still reads the same
     * for seconds too, in a long steady drift and at its lock, so this asks for more than _stale does. It is stuck
     * when its value has not moved by one count for 2 s or more, and in that time the car has gone straight for
     * 0.7 s at 10 km/h or more (in both halves of that stretch the yaw rate within 2 degrees a second of zero, on
     * average, and the car not shown sideways at the end of it: _sideways) and after that turned for 0.7 s (in
     * both halves the yaw rate 6 degrees a second or more, and the sideways acceleration 1.5 m/s2 or more from
     * its zero, all the same way): no car goes from a straight into a corner on a wheel that does not move by a
     * count. A yaw rate that only crosses zero (a wheel at its lock while the car comes out of a drift), one that
     * only shakes (a rough straight) and one that turns alone while the car feels nothing sideways (its zero has
     * jumped) do not do. Nor does a car that is shown sideways with its wheels turned into the slide: its nose can
     * stop turning for 0.7 s in the middle of a drift (a lift, a straight slide) with its wheels still at their
     * lock. Stuck, the steering is not used and backs no drift, as when it is silent, until its value moves. A
     * steering that is not sent at all has not moved either: this rule looks at it as well.
     * (zero, k: the yaw rate's zero and scale in use; sideways: what _sideways says at this look.)
     */
    _stuck(t, zero, k, sideways) {
        if (this.stuckAt !== null && this.steerMoves === this.stuckAt) return true;
        this.stuckAt = null;
        if (this.heldAt !== this.steerMoves) { this.heldAt = this.steerMoves; this.heldStraight = false; }
        if (!this.steerS.count || this.steerMoved === null || t - this.steerMoved < T.REST_MS || this.yawS.age(t) > T.DEAD_MS || this.yawS.t[0] > t - T.REST_MS) return false;
        const half = T.REST_MS / 2, y1 = this.yawS.window(t - T.REST_MS, t - half), y2 = this.yawS.window(t - half, t);
        if (!y1 || !y2) return false;
        const r1 = k * (y1.mean - zero) / DEG, r2 = k * (y2.mean - zero) / DEG;
        if (Math.abs(r1) <= T.TURN_MIN_DPS && Math.abs(r2) <= T.TURN_MIN_DPS) { if (this._moving(t, T.REST_MS) && !sideways) this.heldStraight = true; return false; }
        if (!this.heldStraight || t - this.steerMoved <= T.DEAD_MS) return false;
        const a1 = this.latS.window(t - T.REST_MS, t - half), a2 = this.latS.window(t - half, t), way = r2 > 0 ? 1 : -1;
        const turned = (r, a) => !!a && r * way >= 2 * T.STILL.yawDps && (a.mean - this.ay0) * way >= T.REST_AY_WIDE;
        if (!turned(r1, a1) || !turned(r2, a2)) return false;
        this.stuckAt = this.steerMoves;
        return true;
    }

    /**
     * Is the car shown SIDEWAYS, for the stuck rule: STRAIGHT_DEG or more of angle shown, AND its front wheels
     * turned the way of that angle, down the car's path, by SIDEWAYS_STEER_DEG or more (the steering's newest
     * value, on the scale that was learned)? A car that slides without turning its nose holds them so, at their
     * lock in a big drift. A value that froze at a few degrees in a corner, under a false angle that nothing takes
     * off the screen while that value is believed, does not: such a stretch is a straight for the stuck rule,
     * whatever angle is shown. Where the steering's scale is not known at all, the angle shown alone decides.
     * A KNOWN LIMIT, both ways (the head of this file): a healthy wheel that a slow, tight drift asks less of than
     * that amount is no wheel "held into the slide" here either, and a dead value that stands at the lock is one.
     * (L: what was learned.)
     */
    _sideways(L) {
        if (Math.abs(this.beta) < T.STRAIGHT_DEG * DEG) return false;
        const last = this.steerS.last();
        if (!last || L.sstate === 'none' || !isNum(L.kc) || !isNum(L.szero)) return true;
        const d = this.o.wheelbase * L.kc * (last.v - L.szero);
        return d * this.beta > 0 && Math.abs(d) >= T.SIDEWAYS_STEER_DEG * DEG;
    }

    /** Has the car done 10 km/h or more for all of the last ms? */
    _moving(t, ms) {
        const w = this.speedS.count && this.speedS.t[0] <= t - ms ? this.speedS.window(t - ms, t) : null;
        return !!w && w.min >= T.MIN_KMH;
    }

    _deadNow(t) {
        const from = t - T.DEAD_MS, moved = (s) => { const w = s.age(t) <= T.DEAD_MS ? s.window(from, t) : null; return !!w && w.n >= 3 && w.max - w.min > 2 * s.still; };
        if (this.yawS.age(t) > T.DEAD_MS && moved(this.latS)) return 'noyaw';
        if (this.latS.age(t) > T.DEAD_MS && moved(this.yawS)) return 'gap';
        // both silent together shows nothing that way. Where the app says how long a healthy yaw rate or sideways
        // acceleration can stay silent on the move (it reads their getters as soon as the car sends too few): one that is
        // older than that, with the car at 10 km/h or more for all of that time, is lost
        const old = (s, max) => max > 0 && s.age(t) > max && this._moving(t, max);
        if (old(this.yawS, this.o.yawMaxAgeMs)) return 'noyaw';
        if (old(this.latS, this.o.latMaxAgeMs)) return 'gap';
        // the speed: only where the app says how long a healthy speed can stay silent (it reads the speed's getter on a schedule)
        if (this.o.speedMaxAgeMs > 0 && this.speedS.age(t) > this.o.speedMaxAgeMs) return 'gap';
        return null;
    }

    _step(t0, t1, slot, lag) {
        const o = this.out, L = this._learned(), ms = t1 - t0, h = ms / 1000, tm = (t0 + t1) / 2;
        o.t = t1; o.slot = this.slotKnown ? slot : null; o.lag = lag; o.state = L.state; o.steering = false; o.d = null; o.over = null; o.acc = null; o.accStrong = false; o.accel = false; o.lost = false;
        o.ax0 = this.ax0;
        o.gap = Math.max(this.gapMs, this.yawS.newHole(), this.latS.newHole(), this.speedS.newHole());
        this.gapMs = 0;
        const kmh = this.speedS.valueAt(tm);
        o.kmh = kmh;
        const look = t1 - this.restAt >= T.REST_EVERY_MS;
        if (look) {
            this.dead = this._dead(t1);
            // (both are asked at every look: each keeps its own count)
            const z = this.z !== null ? this.z : L.zero, silent = this._stale(t1, z, L.k), stuck = this._stuck(t1, z, L.k, this._sideways(L));
            this.stale = silent || stuck;
        }
        // why the steering cannot back a drift right now (drift.js), or null: it can
        o.sw = !this.o.useSteer ? 'off' : !this.steerS.count ? 'nosource' : this.stale ? 'stale' : L.sstate !== 'learned' || !isNum(L.kc) || !isNum(L.szero) ? 'unlearned' : null;
        const why = !this.yawS.count ? 'noyaw' : kmh === null || !this.latS.count ? 'nodata' : this.dead;
        if (why) { this._lose(); if (look) this.restAt = t1; return this._report(false, why); }

        const k = L.k, zero = this.z !== null ? this.z : L.zero;
        const yawRaw = this.yawS.valueAt(tm), r = k * (yawRaw - zero), ay = this.latS.valueAt(tm) - this.ay0;
        // (the forward acceleration less what it reads more than the speed's own change on a straight: _offset)
        const axRaw = this.longS.count ? this.longS.valueAt(tm) * (L.axSign < 0 ? -1 : 1) - this.ax0 : null;
        o.r = r; o.ay = ay; o.ax = axRaw === null ? 0 : axRaw; o.hasAx = axRaw !== null;
        // What was learned has changed under the sum: a first line for the yaw rate, or one that moved the yaw rate in
        // use by more than 5 % (half a degree a second at least). The angle summed so far was summed on another scale:
        // it is dropped, and drift.js starts nothing until the car has gone straight again.
        const W = this.was;
        if (W && L.state !== 'none') {
            const rWas = W.k * (yawRaw - W.zero);
            if (W.state === 'none' || Math.abs(r - rWas) > Math.max(T.RELEARN_SHARE * Math.abs(rWas), T.RELEARN_DPS * DEG)) { this._lose(); o.lost = true; }
        }
        this.was = { k, zero, state: L.state };

        // rest and standstill are looked for every 100 ms
        if (look) { this._look(t1, L, zero, Math.min(1000, t1 - this.restAt)); this.restAt = t1; }

        if (kmh < T.MIN_KMH) { this.beta = 0; this.U = 0; this.anchored = true; return this._report(false, 'slow'); }

        const V = Math.max(kmh / KMH, T.V_FLOOR);
        const f = (b) => (ay * Math.cos(b) - (axRaw === null ? -r * V * Math.sin(b) : axRaw) * Math.sin(b)) / V - r;
        let beta = this.beta;
        beta += f(beta + f(beta) * h / 2) * h;

        // the steering check
        const wantSteer = this.o.useSteer && L.sstate !== 'none' && isNum(L.kc) && isNum(L.szero) && this.steerS.count > 0 && !this.stale;
        let steerOff = 0;
        if (wantSteer) {
            const Lw = this.o.wheelbase, a = Lw * (1 - this.o.front);
            const d = Lw * L.kc * (this.steerS.valueAt(tm) - L.szero), over = sign(r) * (Lw * r / V - d);
            o.d = d; o.over = over;
            if (Math.abs(r) >= T.TURN_MIN_DPS * DEG && over > -T.NEUTRAL_DEG * DEG) {
                const target = d - a * r / V - frontSlip(ay);
                steerOff = Math.abs(target - beta) / DEG;
                // (far apart: the check is not believed, and the +- says so; an angle that was lost takes any help)
                if (steerOff <= T.STEER_OFF_DEG || !this.anchored) {
                    beta += (target - beta) * fade(ms, over > T.OVER_ON_DEG * DEG ? T.STEER_TAU_MS : T.NEUTRAL_TAU_MS);
                    o.steering = true;
                }
            }
        }
        // the acceleration check: it pulls where the steering check is not pulling and the sideways acceleration is strong enough
        const acc = this._acc(tm, L), strong = acc !== null && this.accStrong;
        let accOff = 0;
        o.acc = acc; o.accStrong = strong; o.accel = false;
        if (strong && !o.steering) {
            accOff = Math.abs(acc - beta) / DEG;
            if (accOff <= T.ACC_OFF_DEG || !this.anchored) { beta += (acc - beta) * fade(ms, T.ACC_TAU_MS); o.accel = true; }
        }
        // what may have been summed up wrongly in this step, in degrees
        const P = T.PM;
        const kq = L.state === 'learned' ? Math.max(P.k.learned, L.spread || 0) : P.k[L.state];
        const e1 = P.zeroDps, e2 = P.ayZero / V / DEG, e3 = kq * Math.abs(r) / DEG;
        this.U += Math.sqrt(e1 * e1 + e2 * e2 + e3 * e3) * h;
        if (o.steering && this.U > P.steerFloor) this.U += (P.steerFloor - this.U) * fade(ms, T.STEER_TAU_MS);
        if (o.accel && this.U > P.accFloor) this.U += (P.accFloor - this.U) * fade(ms, T.ACC_TAU_MS);
        if (this.rest) { const g = fade(ms, T.REST_TAU_MS); beta -= beta * g; this.U -= this.U * g; this.anchored = true; }
        const lim = T.BETA_MAX_DEG * DEG;
        this.beta = beta > lim ? lim : beta < -lim ? -lim : beta;
        const p2 = P.share * Math.abs(this.beta) / DEG, p3 = P.slot * slot / 1000 * Math.abs(r) / DEG, p4 = P.disagree * (o.steering || !strong ? steerOff : accOff);
        o.pm = Math.min(P.max, Math.sqrt(P.base * P.base + p2 * p2 + this.U * this.U + p3 * p3 + p4 * p4) + (this.anchored ? 0 : P.unanchored));
        return this._report(true, null);
    }

    _report(ok, why) {
        const o = this.out;
        o.ok = ok; o.why = why; o.beta = this.beta; o.rest = this.rest; o.anchored = this.anchored;
        if (!ok) o.pm = T.PM.max;
        if (this.o.onStep) this.o.onStep(o);
        return o;
    }

    /**
     * The acceleration check: the angle that the two accelerations and the speed's own change say, or null where
     * they cannot say (under 1.5 m/s2 of sideways acceleration, no forward acceleration, the speed changing too fast).
     * this.accStrong says whether the sideways acceleration is the 3 m/s2 or more that the check pulls with.
     * Along its path the car gains speed at ax cos(beta) + ay sin(beta). So with the speed's change Vdot:
     *     beta_acc = asin(Vdot / A) - atan2(ax, ay),   A = the two accelerations together
     * (written for a left-hand turn; mirrored for a right-hand one).
     */
    _acc(t, L) {
        const now = Math.abs(this.latS.valueAt(t) - this.ay0);
        if (!this.longS.count || now < T.ACC_SEE / 2) return null;
        const a = this.latS.window(t - T.ACC_MEAN_MS, t), x = this.longS.window(t - T.ACC_MEAN_MS, t);
        if (!a || !x) return null;
        const ay = a.mean - this.ay0, ax = x.mean * (L.axSign < 0 ? -1 : 1) - this.ax0;
        if (Math.abs(ay) < T.ACC_SEE) return null;
        this.accStrong = now >= T.ACC_AY / 2 && Math.abs(ay) >= T.ACC_AY;
        const vd = (this.speedS.valueAt(t) - this.speedS.valueAt(t - T.ACC_V_MS)) / KMH / (T.ACC_V_MS / 1000), A = Math.sqrt(ax * ax + ay * ay);
        if (Math.abs(vd) > T.ACC_VDOT_SHARE * A) return null;
        return (ay > 0 ? 1 : -1) * (Math.asin(vd / A) - Math.atan2(ax, Math.abs(ay)));
    }

    /** Standstill and rest, from the last second of samples. dt: ms since the last look. */
    _look(t, L, zero, dt) {
        this.rest = false;
        const sp = this.speedS.window(t - T.STAND_MS, t);
        if (!sp) return;
        if (sp.max < T.STAND_KMH && this.speedS.t[0] <= t - T.STAND_MS) {
            // a standing car does not turn: what the yaw rate reads now is its zero
            const y = this.yawS.window(t - T.STAND_MS, t);
            if (y) this.z = this.z === null ? y.mean : this.z + (y.mean - this.z) * fade(dt, T.STAND_TAU_MS);
            if (!this.ay0Set) { const a = this.latS.window(t - T.STAND_MS, t); if (a) { this.ay0 = a.mean; this.ay0Set = true; } }
            return;
        }
        if (sp.min < T.MIN_KMH) return;
        const half = T.REST_MS / 2;
        const a1 = this.latS.window(t - T.REST_MS, t - half), a2 = this.latS.window(t - half, t);
        const y1 = this.yawS.window(t - T.REST_MS, t - half), y2 = this.yawS.window(t - half, t);
        if (!a1 || !a2 || !y1 || !y2 || this.latS.t[0] > t - T.REST_MS || this.yawS.t[0] > t - T.REST_MS) return;
        const known = L.state !== 'none', r1 = L.k * (y1.mean - zero) / DEG, r2 = L.k * (y2.mean - zero) / DEG;
        // the yaw rate under what counts as turning, and alike in both halves (only where its scale is known at all)
        const most = Math.max(Math.abs(r1), Math.abs(r2));
        if (known && (most > T.TURN_MIN_DPS || Math.abs(r1 - r2) > T.REST_YAW_ALIKE_DPS)) return;
        const b1 = a1.mean - this.ay0, b2 = a2.mean - this.ay0, wide = known ? T.REST_AY_WIDE : T.REST_AY;
        if (Math.abs(b1) > wide || Math.abs(b2) > wide || Math.abs(b1 - b2) > T.REST_AY_ALIKE) return;
        let st = null;
        if (this.steerS.count && this.steerS.t[0] <= t - T.REST_MS && !this.stale) {
            st = this.steerS.window(t - T.REST_MS, t);
            if (L.sstate !== 'none' && isNum(L.kc) && Math.abs(this.o.wheelbase * L.kc * (st.mean - L.szero)) > T.REST_STEER_DEG * DEG) return;
        }
        this.rest = true;
        this._offset(t, L, dt);
        // between 1 and 2 degrees a second the angle is held at zero, but the zeros are left alone: that may be a zero that
        // has moved, and it may be a gentle bend
        if (known && most > T.REST_YAW_DPS) return;
        this.ay0 += ((a1.mean + a2.mean) / 2 - this.ay0) * fade(dt, T.TRIM_AY_TAU_MS);
        this.ay0Set = true;
        const ym = (y1.mean + y2.mean) / 2;
        this.z = this.z === null ? (known ? zero + (ym - zero) * fade(dt, T.TRIM_YAW_TAU_MS) : ym) : this.z + (ym - this.z) * fade(dt, T.TRIM_YAW_TAU_MS);
        if (st) this.zs = this.zs === null ? st.mean : this.zs + (st.mean - this.zs) * fade(dt, T.TRIM_AY_TAU_MS);
    }

    /**
     * THE FORWARD ACCELERATION'S OFFSET. A car that goes straight gains speed at just what it feels forward. What it
     * feels more than that is a road that climbs (g x the sine of the grade), or a zero that is off. It is measured
     * at rest (the car going straight and settled), where the speed changes by no more than 2 m/s2 and the two halves
     * of the stretch agree. The first looks are averaged as they come, so that one straight of a second is enough; from
     * then on it is followed slowly (2 s). The core, the acceleration check and learn.js take it out.
     */
    _offset(t, L, dt) {
        if (!this.longS.count || this.longS.t[0] > t - T.REST_MS || this.speedS.t[0] > t - T.REST_MS) return;
        const half = T.REST_MS / 2, sg = L.axSign < 0 ? -1 : 1;
        const x1 = this.longS.window(t - T.REST_MS, t - half), x2 = this.longS.window(t - half, t);
        const v0 = this.speedS.valueAt(t - T.REST_MS), v1 = this.speedS.valueAt(t - half), v2 = this.speedS.valueAt(t);
        if (!x1 || !x2 || v0 === null || v1 === null || v2 === null) return;
        const d1 = (v1 - v0) / KMH / (half / 1000), d2 = (v2 - v1) / KMH / (half / 1000);
        const o1 = sg * x1.mean - d1, o2 = sg * x2.mean - d2;
        if (Math.abs(d1) > T.AX0_VDOT || Math.abs(d2) > T.AX0_VDOT || Math.abs(o1 - o2) > T.AX0_ALIKE) return;
        // (the sign of the forward acceleration was learned the other way round meanwhile: start again)
        if (this.ax0Sign !== sg) { this.ax0Sign = sg; this.ax0 = 0; this.ax0N = 0; }
        // (the first looks are averaged as they come, so that a first straight of a second is enough; from then on slowly)
        this.ax0 += ((o1 + o2) / 2 - this.ax0) * Math.max(fade(dt, T.AX0_TAU_MS), 1 / (this.ax0N + 1));
        this.ax0N++;
    }

    /** What the sources read over the last ms before t (the angle's own clock), for learn.js. */
    stats(t, ms) {
        const t0 = t - ms, full = (s) => (s.count && s.t[0] <= t0 ? s.halves(t0, t) : null);
        const v = full(this.speedS);
        return {
            t, ms, v, lat: full(this.latS), long: full(this.longS), yaw: full(this.yawS), steer: full(this.steerS),
            dv: v ? (this.speedS.valueAt(t) - this.speedS.valueAt(t0)) / KMH : null,
            ay0: this.ay0, ax0: this.ax0, zero: this.z, szero: this.zs, beta: this.beta, rest: this.rest,
        };
    }
}

module.exports = { Angle, TABLE, frontSlip, DEG, KMH };
