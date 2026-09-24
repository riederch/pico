import { hasExactKeys } from './canonical-bytes.js';
import {
  picoConfidenceLevels,
  picoConfidenceRank,
  type PicoConfidenceLevel,
} from './confidence.js';
import { assertPicoInstant } from './instant.js';
import { assertPicoPlace, type PicoPlace } from './place.js';

/**
 * ADR 0129 SR1. The vocabulary of a place a person remembers being.
 *
 * It ships from the protocol rather than from the module for the ADR 0127
 * reason: an append-only log written while the module was active must stay
 * parseable while it is off, and a parser that shipped with the module would
 * not be there.
 *
 * Nothing here reaches a network or a model. Deciding that a car stopped is a
 * comparison between readings, and the whole point of the ADR 0118 floor is
 * that the answer arrives in the underground car park where the question is
 * asked.
 */

/**
 * How a person was moving. Closed and listed, in the idiom the module
 * identifiers and protective event types already use.
 *
 * `unknown` is a member rather than an absence: a classifier that cannot tell
 * must be able to say so, and a surface that treated silence as `stationary`
 * would invent a fact. It is the only honest answer to a gap in the samples.
 */
export const picoMobilityKinds = [
  'stationary',
  'walking',
  'cycling',
  'car',
  'public_transport',
  'unknown',
] as const;

export type PicoMobilityKind = typeof picoMobilityKinds[number];

/**
 * How well something is known - a second axis, independent of where it came
 * from (ADR 0129).
 *
 * Three levels rather than a number. Nothing here computes a calibrated
 * probability, and `0.73` would claim one; these are what can be said honestly
 * and what a person can act on differently.
 */
// Lifted to `./confidence.js` on 2026-08-10 (ADR 0136 BR4): nothing about
// three honest levels is spatial, and the comment above always said so. The
// name stays here so spatial recall keeps its own word without keeping its own
// list.
export const picoSpatialConfidences = picoConfidenceLevels;
export type PicoSpatialConfidence = PicoConfidenceLevel;



/**
 * One reading of where the device was.
 *
 * **Accuracy is required.** A coordinate without it is a false precision the
 * surface cannot recover: every honest thing that can be said about a
 * remembered place depends on how well it was known, and a reading that lost
 * its accuracy is unusable rather than merely imprecise.
 */
export interface PicoLocationFix extends PicoPlace {
  /** Canonical instant, on the wall clock the person lives on. */
  at: string;
}

/** One reading of how the person was moving, as the device understood it. */
export interface PicoMobilitySample {
  at: string;
  mobility: PicoMobilityKind;
  confidence: PicoSpatialConfidence;
}

/** A change from one kind of movement to another, with when it was noticed. */
export interface PicoMobilityTransition {
  at: string;
  from: PicoMobilityKind;
  to: PicoMobilityKind;
  /** The lower of the two samples: a transition is only as sure as its ends. */
  confidence: PicoSpatialConfidence;
}

/**
 * Where a vehicle was most likely left, and how sure that is.
 *
 * `status` is what a person did about it, not what the derivation thinks.
 * A candidate they confirmed or rejected has been answered, and a later
 * re-reading of the same samples must not quietly disagree with them.
 */
export const picoParkingStatuses = ['candidate', 'confirmed', 'rejected'] as const;
export type PicoParkingStatus = typeof picoParkingStatuses[number];

/**
 * ADR 0129 SR3. Was ein abgeleitetes Parkereignis fuer eine Inhaltsart hat.
 *
 * **Hier und nicht neben dem Verdichter**, seit dem 2026-09-23. Die Zeichenkette
 * stand in `apps/companion/src/observation-condensation.ts` und musste vom Kern
 * gelesen werden, sobald es eine Lesehaelfte gab (Nutzerentscheidung 14). Zwei
 * Seiten, die dieselbe Art buchstabieren, koennen auseinanderlaufen; eine
 * Wahrheit, zweimal geschrieben, driftet.
 */
/**
 * ADR 0129 SR4. Was eine Person ueber einen Kandidaten sagen kann.
 *
 * **Zwei Woerter, nicht drei.** `picoParkingStatuses` kennt daneben
 * `candidate`, und das ist genau das, was eine Person *nicht* sagen kann: es
 * ist der Zustand, in dem eine Ableitung auf die Welt kommt, bevor jemand
 * etwas dazu gesagt hat. Eine Entscheidung, die "Kandidat" lauten duerfte,
 * waere ein Weg, eine Bestaetigung zurueckzunehmen, ohne sie zu verwerfen -
 * und damit ein dritter Zustand ohne Bedeutung.
 */
export const picoParkingDecisions = ['confirmed', 'rejected'] as const;

export type PicoParkingDecision = typeof picoParkingDecisions[number];

export const picoParkingEventContentType = 'application/vnd.pico.parking-event' as const;

/**
 * Wie weit ein Home fuer die juengste Ableitung zurueckschaut.
 *
 * Jede Lesung, die eine Person ausloesen kann, ist begrenzt. Die Zahl ist
 * grosszuegig gegen die Frage gemessen, die sie beantwortet: gesucht wird das
 * juengste verortete Stueck *dieser* Inhaltsart, und daneben liegen im selben
 * Raum die gewoehnlichen Erinnerungen.
 */
export const maxPicoParkingCandidatesRead = 100;

export interface PicoParkingCandidate {
  /** When the vehicle came to rest - not when walking away was noticed. */
  parkedAt: string;
  latitudeDeg: number;
  longitudeDeg: number;
  accuracyM: number;
  confidence: PicoSpatialConfidence;
  status: PicoParkingStatus;
  /** The instant of the transition this was derived from, for tracing. */
  sourceTransitionAt: string;
}


function asRecord(value: unknown, reason: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(reason);
  }
  return value as Record<string, unknown>;
}

export function parsePicoLocationFix(value: unknown): PicoLocationFix {
  const record = asRecord(value, 'invalid_pico_location_fix');
  if (!hasExactKeys(record, ['at', 'latitudeDeg', 'longitudeDeg', 'accuracyM'])) {
    throw new Error('invalid_pico_location_fix');
  }
  assertPicoInstant(record.at, 'invalid_pico_location_fix_at');
  // The position half is the core capability, validated by its own code so
  // this and the memory-item column cannot disagree about what is usable.
  const place = assertPicoPlace(record);
  return Object.freeze({ at: record.at, ...place });
}

export function parsePicoMobilitySample(value: unknown): PicoMobilitySample {
  const record = asRecord(value, 'invalid_pico_mobility_sample');
  if (!hasExactKeys(record, ['at', 'mobility', 'confidence'])) {
    throw new Error('invalid_pico_mobility_sample');
  }
  assertPicoInstant(record.at, 'invalid_pico_mobility_sample_at');
  if (typeof record.mobility !== 'string'
    || !(picoMobilityKinds as readonly string[]).includes(record.mobility)) {
    throw new Error('invalid_pico_mobility_sample_kind');
  }
  if (typeof record.confidence !== 'string'
    || !(picoSpatialConfidences as readonly string[]).includes(record.confidence)) {
    throw new Error('invalid_pico_mobility_sample_confidence');
  }
  return Object.freeze({
    at: record.at,
    mobility: record.mobility as PicoMobilityKind,
    confidence: record.confidence as PicoSpatialConfidence,
  });
}

export function parsePicoParkingCandidate(value: unknown): PicoParkingCandidate {
  const record = asRecord(value, 'invalid_pico_parking_candidate');
  if (!hasExactKeys(record, [
    'parkedAt',
    'latitudeDeg',
    'longitudeDeg',
    'accuracyM',
    'confidence',
    'status',
    'sourceTransitionAt',
  ])) {
    throw new Error('invalid_pico_parking_candidate');
  }
  // The position half is exactly a location fix, so it is validated by the
  // same code rather than by a second copy that can drift.
  parsePicoLocationFix({
    at: record.parkedAt,
    latitudeDeg: record.latitudeDeg,
    longitudeDeg: record.longitudeDeg,
    accuracyM: record.accuracyM,
  });
  assertPicoInstant(record.sourceTransitionAt, 'invalid_pico_parking_candidate_source');
  if (typeof record.confidence !== 'string'
    || !(picoSpatialConfidences as readonly string[]).includes(record.confidence)) {
    throw new Error('invalid_pico_parking_candidate_confidence');
  }
  if (typeof record.status !== 'string'
    || !(picoParkingStatuses as readonly string[]).includes(record.status)) {
    throw new Error('invalid_pico_parking_candidate_status');
  }
  return Object.freeze({
    parkedAt: record.parkedAt as string,
    latitudeDeg: record.latitudeDeg as number,
    longitudeDeg: record.longitudeDeg as number,
    accuracyM: record.accuracyM as number,
    confidence: record.confidence as PicoSpatialConfidence,
    status: record.status as PicoParkingStatus,
    sourceTransitionAt: record.sourceTransitionAt,
  });
}

/** The lower of two certainties. A chain is as sure as its least sure link. */
export function lowerPicoSpatialConfidence(
  left: PicoSpatialConfidence,
  right: PicoSpatialConfidence,
): PicoSpatialConfidence {
  return picoConfidenceRank(left) <= picoConfidenceRank(right) ? left : right;
}

export function isPicoSpatialConfidenceAtLeast(
  value: PicoSpatialConfidence,
  floor: PicoSpatialConfidence,
): boolean {
  return picoConfidenceRank(value) >= picoConfidenceRank(floor);
}

/**
 * Metres between two readings, on a sphere.
 *
 * A sphere rather than an ellipsoid, deliberately: the error is under a
 * half-percent, and every distance here is compared against a threshold in
 * hundreds of metres or against a sensor accuracy that is far larger. Carrying
 * a geodesic solver would add precision to a number whose inputs do not have
 * it.
 */
export function picoDistanceM(
  from: { latitudeDeg: number; longitudeDeg: number },
  to: { latitudeDeg: number; longitudeDeg: number },
): number {
  const earthRadiusM = 6_371_008.8;
  const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
  const lat1 = toRadians(from.latitudeDeg);
  const lat2 = toRadians(to.latitudeDeg);
  const deltaLat = lat2 - lat1;
  const deltaLon = toRadians(to.longitudeDeg - from.longitudeDeg);
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * earthRadiusM * Math.asin(Math.min(1, Math.sqrt(a)));
}
