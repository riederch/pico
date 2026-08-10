/**
 * ADR 0129's second axis, lifted out of spatial recall.
 *
 * "How well something is known" is independent of where it came from, and the
 * comment that said so has always sat in `spatial-recall.ts` beside a constant
 * called `picoSpatialConfidences`. Nothing about three honest levels is
 * spatial: an AIS position, a passage from a knowledge base and a parking
 * candidate are certain or uncertain in exactly the same three ways.
 *
 * Lifted rather than copied, in the ADR 0127 M5 move: a mechanic two things
 * need becomes a core capability instead of an edge between them.
 * `picoSpatialConfidences` stays exported and derives from this, so spatial
 * recall keeps its own word for it without keeping its own list.
 *
 * **Three levels rather than a number.** Nothing here computes a calibrated
 * probability, and `0.73` would claim one; these are what can be said honestly
 * and what a person can act on differently.
 *
 * **There is deliberately no fourth level meaning "certain".** Confirmation is
 * a different axis, moved only by a person - ADR 0129 keeps it as its own
 * status, and ADR 0136 BR4 makes a supplier structurally unable to claim it.
 */
export const picoConfidenceLevels = ['low', 'medium', 'high'] as const;

export type PicoConfidenceLevel = typeof picoConfidenceLevels[number];

const rank: Record<PicoConfidenceLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

export function picoConfidenceRank(level: PicoConfidenceLevel): number {
  const value = rank[level];
  if (value === undefined) {
    throw new Error('invalid_pico_confidence_level');
  }
  return value;
}

export function isPicoConfidenceLevel(value: unknown): value is PicoConfidenceLevel {
  return typeof value === 'string'
    && (picoConfidenceLevels as readonly string[]).includes(value);
}

/**
 * The lowest of several, for a value derived from more than one source.
 *
 * The same shape as `lowestPicoOriginClass` and for the same reason: a
 * derivation is no more certain than the least certain thing it rests on. An
 * empty source list throws rather than answering the floor, because a
 * derivation from nothing is a caller bug and a quiet `low` would hide it.
 */
export function lowestPicoConfidence(
  levels: readonly PicoConfidenceLevel[],
): PicoConfidenceLevel {
  if (!Array.isArray(levels) || levels.length === 0) {
    throw new Error('pico_confidence_derivation_requires_sources');
  }
  let lowest = levels[0]!;
  for (const level of levels) {
    if (picoConfidenceRank(level) < picoConfidenceRank(lowest)) {
      lowest = level;
    }
  }
  return lowest;
}
