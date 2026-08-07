import {
  isPicoSpatialConfidenceAtLeast,
  lowerPicoSpatialConfidence,
  picoDistanceM,
  type PicoLocationFix,
  type PicoMobilitySample,
  type PicoParkingCandidate,
  type PicoSpatialConfidence,
} from '@pico/protocol/spatial-recall';
import {
  isPicoLeavingOnFoot,
  lastPicoMobilityTransition,
  picoMobilityTransitions,
} from './mobility.js';

/**
 * ADR 0129 SR1 and SR4. Where the car most likely is, and how sure that is.
 *
 * The derivation is the easy half. The hard half is SR4: **an answer carries
 * its certainty or it is not built.** A surface renders what it is handed, so
 * a bare position must never be something it can be handed - which is why
 * `picoParkingAnswer` returns a tagged value and there is no path from a
 * derivation to the `known` tag.
 */

/**
 * Judgement, not calibration - and stated as such, because ADR 0129 accepts
 * this as a named cost rather than hiding it. Every number below is a person's
 * guess about ordinary movement, exposed so a caller can disagree and a test
 * can pin the disagreement.
 */
export interface PicoParkingThresholds {
  /**
   * How far away counts as having left the vehicle. Below this a person may
   * still be at the car - loading it, standing beside it - and calling that
   * "parked" would record the moment before the one that matters.
   */
  minWalkAwayM: number;
  /**
   * A position fix wider than this cannot say which car park, let alone which
   * space. It still produces an answer, just never a confident one.
   */
  goodAccuracyM: number;
  /**
   * How stale the last vehicle fix may be at the moment of stopping. A fix
   * from ten minutes before the car stopped is a place the car drove through.
   */
  maxFixAgeMs: number;
}

export const defaultPicoParkingThresholds: PicoParkingThresholds = Object.freeze({
  minWalkAwayM: 100,
  goodAccuracyM: 50,
  maxFixAgeMs: 5 * 60 * 1_000,
});

export interface PicoParkingDerivationInput {
  mobilitySamples: readonly PicoMobilitySample[];
  locationFixes: readonly PicoLocationFix[];
  thresholds?: PicoParkingThresholds;
}

/**
 * The most recent time the person appears to have left a vehicle.
 *
 * `undefined` when nothing in the samples looks like parking, which is an
 * honest absence rather than a low-confidence guess. Inventing a candidate so
 * that something can be shown is the failure this whole ADR is about.
 *
 * The recorded position is the **last reliable fix from while the vehicle was
 * still moving or stopping** - not where the person was standing when walking
 * was noticed, which is already some distance away by definition.
 */
export function picoDeriveParkingCandidate(
  input: PicoParkingDerivationInput,
): PicoParkingCandidate | undefined {
  const thresholds = input.thresholds ?? defaultPicoParkingThresholds;
  const transitions = picoMobilityTransitions(input.mobilitySamples);

  // The pattern is "was in a car, then was on foot". The stationary step in
  // between is usual but not required: a classifier that never emitted it
  // still saw the person get out.
  const leaving = lastPicoMobilityTransition(transitions, { to: 'walking' })
    ?? lastPicoMobilityTransition(transitions, { to: 'cycling' });
  if (leaving === undefined || !isPicoLeavingOnFoot(leaving.to)) {
    return undefined;
  }

  const stopped = leaving.from === 'car'
    ? leaving
    : lastPicoMobilityTransition(transitions, { from: 'car', notAfter: leaving.at });
  if (stopped === undefined || stopped.from !== 'car') {
    return undefined;
  }

  const stoppedAtMs = Date.parse(stopped.at);
  const vehicleFixes = [...input.locationFixes]
    .filter((fix) => Date.parse(fix.at) <= stoppedAtMs)
    .sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
  const parkedFix = vehicleFixes[vehicleFixes.length - 1];
  if (parkedFix === undefined) {
    // The transitions say a car was parked and nothing says where. Answering
    // "somewhere" helps nobody.
    return undefined;
  }

  const fixAgeMs = stoppedAtMs - Date.parse(parkedFix.at);
  const walkedAwayM = furthestDistanceAfter({
    fixes: input.locationFixes,
    afterMs: stoppedAtMs,
    from: parkedFix,
  });

  const confidence = judgeConfidence({
    transitions: lowerPicoSpatialConfidence(stopped.confidence, leaving.confidence),
    fixAgeMs,
    accuracyM: parkedFix.accuracyM,
    walkedAwayM,
    thresholds,
  });

  return Object.freeze({
    // What the person asks for is when the car was left, which is when it
    // stopped - not when Pico noticed them walking.
    parkedAt: stopped.at,
    latitudeDeg: parkedFix.latitudeDeg,
    longitudeDeg: parkedFix.longitudeDeg,
    accuracyM: parkedFix.accuracyM,
    confidence,
    status: 'candidate',
    sourceTransitionAt: stopped.at,
  });
}

function furthestDistanceAfter(input: {
  fixes: readonly PicoLocationFix[];
  afterMs: number;
  from: PicoLocationFix;
}): number {
  let furthest = 0;
  for (const fix of input.fixes) {
    if (Date.parse(fix.at) <= input.afterMs) {
      continue;
    }
    furthest = Math.max(furthest, picoDistanceM(input.from, fix));
  }
  return furthest;
}

/**
 * Three levels, and every demotion has a reason a person would accept.
 *
 * `high` needs all four to hold at once. That is deliberately hard: a
 * confident answer is one Pico will state as a near-fact, and the cost of
 * being wrong is a person walking to the wrong street.
 */
function judgeConfidence(input: {
  transitions: PicoSpatialConfidence;
  fixAgeMs: number;
  accuracyM: number;
  walkedAwayM: number;
  thresholds: PicoParkingThresholds;
}): PicoSpatialConfidence {
  const positionIsFresh = input.fixAgeMs <= input.thresholds.maxFixAgeMs;
  const positionIsTight = input.accuracyM <= input.thresholds.goodAccuracyM;
  const reallyLeft = input.walkedAwayM >= input.thresholds.minWalkAwayM;
  const transitionsAreSure = isPicoSpatialConfidenceAtLeast(input.transitions, 'high');

  if (positionIsFresh && positionIsTight && reallyLeft && transitionsAreSure) {
    return 'high';
  }
  // A stale or wide position is the demotion that matters most: the pattern
  // may be perfect and still point at the wrong place.
  if (!positionIsFresh || !positionIsTight) {
    return 'low';
  }
  return isPicoSpatialConfidenceAtLeast(input.transitions, 'medium') ? 'medium' : 'low';
}

/**
 * ADR 0129 SR4. What Pico may say, in a shape that cannot lose its certainty.
 *
 * Four outcomes, and the important property is what is *missing*: no
 * derivation produces `known`. That tag exists only for a place a person
 * confirmed, so there is no code path from a guess to a sentence stated as
 * fact. A surface can still word it badly, but it cannot be handed a position
 * without being told how well it is known.
 */
export type PicoParkingAnswer =
  | { outcome: 'known'; place: PicoParkingCandidate }
  | { outcome: 'likely'; place: PicoParkingCandidate }
  | { outcome: 'uncertain'; place: PicoParkingCandidate }
  | { outcome: 'unknown' };

export interface PicoParkingAnswerInput {
  /** What the samples suggest right now, if anything. */
  derived?: PicoParkingCandidate;
  /**
   * What the person already said about this, if anything. A confirmation or a
   * rejection they gave for the same event.
   */
  recorded?: PicoParkingCandidate;
}

/**
 * ADR 0129 SR4. A person's answer outranks a later derivation of the same event.
 *
 * Someone who told Pico where the car is has ended the question, and a
 * re-reading of the same samples must not quietly disagree with them.
 * **Rejection is equally durable**: a candidate they threw away does not come
 * back because the derivation still likes it. The two are matched by the
 * transition they came from, which is why a candidate carries it.
 *
 * A rejected event does not fall through to the derived candidate for the same
 * event, and does not hide a *different*, later one - a person rejecting
 * yesterday's guess has not said anything about today's.
 */
export function picoParkingAnswer(input: PicoParkingAnswerInput): PicoParkingAnswer {
  const { derived, recorded } = input;

  if (recorded !== undefined && recorded.status === 'confirmed') {
    if (derived === undefined
      || derived.sourceTransitionAt === recorded.sourceTransitionAt
      || Date.parse(derived.sourceTransitionAt) <= Date.parse(recorded.sourceTransitionAt)) {
      return { outcome: 'known', place: recorded };
    }
  }

  if (recorded !== undefined
    && recorded.status === 'rejected'
    && derived !== undefined
    && derived.sourceTransitionAt === recorded.sourceTransitionAt) {
    return { outcome: 'unknown' };
  }

  if (derived === undefined) {
    return { outcome: 'unknown' };
  }

  return derived.confidence === 'high'
    ? { outcome: 'likely', place: derived }
    : { outcome: 'uncertain', place: derived };
}
