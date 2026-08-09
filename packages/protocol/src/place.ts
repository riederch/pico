/**
 * ADR 0129 SR3. Where something was, as a core capability.
 *
 * Generically named, in the shape `due_at` and `raised_at` already have: no
 * parking column, no calendar column. "Where was I yesterday afternoon"
 * composes the same capability, and a later module that needs a place does not
 * invent its own.
 *
 * **Accuracy travels with the position and is not optional.** A coordinate
 * without it is a false precision the surface cannot recover: every honest
 * thing that can be said about a remembered place depends on how well it was
 * known, and "here, give or take five metres" and "here, give or take two
 * kilometres" are different answers to the same question. A position that
 * arrives without its accuracy is not a less precise position, it is an
 * unusable one - which is why this is a triple rather than a pair with an
 * optional third.
 *
 * One definition of what a usable position is, so the memory-item column, the
 * spatial-recall fix and anything later cannot drift into disagreeing about
 * it (ADR 0127 M5).
 */
export interface PicoPlace {
  latitudeDeg: number;
  longitudeDeg: number;
  /** Radius of uncertainty in metres. Always present, always positive. */
  accuracyM: number;
}

export const picoPlaceFields = ['accuracyM', 'latitudeDeg', 'longitudeDeg'] as const;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Validates the three fields of a place, wherever they arrived.
 *
 * Takes a record rather than insisting on exact keys, because a place is
 * carried *inside* larger shapes - a location fix adds an instant, a memory
 * item adds everything a memory item has - and each of those checks its own
 * key set. What this owns is the meaning of the three values.
 */
export function assertPicoPlace(record: Record<string, unknown>): PicoPlace {
  if (!isFiniteNumber(record.latitudeDeg)
    || record.latitudeDeg < -90
    || record.latitudeDeg > 90) {
    throw new Error('invalid_pico_place_latitude');
  }
  if (!isFiniteNumber(record.longitudeDeg)
    || record.longitudeDeg < -180
    || record.longitudeDeg > 180) {
    throw new Error('invalid_pico_place_longitude');
  }
  if (!isFiniteNumber(record.accuracyM) || record.accuracyM <= 0) {
    // Zero would claim a perfect reading, which no sensor gives. Absent is
    // worse: the surface cannot tell an unknown accuracy from a good one.
    throw new Error('invalid_pico_place_accuracy');
  }
  return Object.freeze({
    latitudeDeg: record.latitudeDeg,
    longitudeDeg: record.longitudeDeg,
    accuracyM: record.accuracyM,
  });
}

export function parsePicoPlace(value: unknown): PicoPlace {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('invalid_pico_place');
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== picoPlaceFields.length
    || keys.some((key, index) => key !== picoPlaceFields[index])) {
    // All three or none. A place with two of its parts is the failure this
    // type exists to make impossible, and it is the same rule the column
    // CHECK enforces at the other end.
    throw new Error('invalid_pico_place');
  }
  return assertPicoPlace(record);
}
