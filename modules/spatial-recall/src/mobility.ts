import {
  lowerPicoSpatialConfidence,
  type PicoMobilityKind,
  type PicoMobilitySample,
  type PicoMobilityTransition,
} from '@pico/protocol/spatial-recall';

/**
 * ADR 0129 SR1. Turning a sequence of readings into the changes that matter.
 *
 * Pure, model-free and network-free: deciding that movement changed is a
 * comparison between two readings. That is what puts this family on the ADR
 * 0118 floor and what `scripts/check-offline-floor.mjs` verifies about the
 * imports reachable from here.
 */

/**
 * Changes in how a person was moving, oldest first.
 *
 * Samples are sorted here rather than trusted to arrive in order. A caller
 * merging two sources - a motion classifier and a location-derived one - has
 * no reason to have interleaved them, and a transition derived from a
 * mis-ordered pair would be a fact about the array rather than about the
 * person.
 *
 * **A transition is only as sure as its ends**, so it takes the lower of the
 * two confidences. Anything touching `unknown` is capped at `low` on top of
 * that: `unknown` is a gap in the record, and a gap cannot support a confident
 * claim about what happened across it.
 */
export function picoMobilityTransitions(
  samples: readonly PicoMobilitySample[],
): readonly PicoMobilityTransition[] {
  const ordered = [...samples].sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
  const transitions: PicoMobilityTransition[] = [];

  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (previous === undefined || current === undefined || previous.mobility === current.mobility) {
      continue;
    }
    const ends = lowerPicoSpatialConfidence(previous.confidence, current.confidence);
    const touchesGap = previous.mobility === 'unknown' || current.mobility === 'unknown';
    transitions.push(Object.freeze({
      // The instant the change was observed, which is the later sample: the
      // earlier one is evidence of the state that ended, not of the change.
      at: current.at,
      from: previous.mobility,
      to: current.mobility,
      confidence: touchesGap ? 'low' : ends,
    }));
  }

  return Object.freeze(transitions);
}

/**
 * The last transition matching a pattern, or `undefined`.
 *
 * "Last" rather than "first" throughout this module: a person asking where
 * their car is means the most recent time they left it, not the first time
 * this history recorded one.
 */
export function lastPicoMobilityTransition(
  transitions: readonly PicoMobilityTransition[],
  pattern: { from?: PicoMobilityKind; to?: PicoMobilityKind; notAfter?: string },
): PicoMobilityTransition | undefined {
  for (let index = transitions.length - 1; index >= 0; index -= 1) {
    const transition = transitions[index];
    if (transition === undefined) {
      continue;
    }
    if (pattern.from !== undefined && transition.from !== pattern.from) {
      continue;
    }
    if (pattern.to !== undefined && transition.to !== pattern.to) {
      continue;
    }
    if (pattern.notAfter !== undefined && Date.parse(transition.at) > Date.parse(pattern.notAfter)) {
      continue;
    }
    return transition;
  }
  return undefined;
}

/** Kinds that mean a person was in a vehicle they would later walk away from. */
export const picoVehicleMobilityKinds: readonly PicoMobilityKind[] = Object.freeze(['car']);

/**
 * Whether a kind means the person was under their own power and moving.
 *
 * `cycling` counts. Someone who parks a car and cycles away has still parked
 * the car, and treating only walking as leaving would lose exactly the person
 * who most needs to be told where they left it.
 */
export function isPicoLeavingOnFoot(kind: PicoMobilityKind): boolean {
  return kind === 'walking' || kind === 'cycling';
}
