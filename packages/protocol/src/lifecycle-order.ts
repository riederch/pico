/**
 * What a lifecycle order is, for the whole product. One rule.
 *
 * A lifecycle order says which of two records about the same subject came
 * later - which delegation supersedes which, which host key follows which. It
 * is `seq:` and **exactly sixteen digits**, and the fixed width is the
 * load-bearing half: every consumer compares these as *strings*. A shorter one
 * sorts below everything, so a rotation written with a lost `padStart` would
 * take effect as the oldest record rather than the newest, and nothing about
 * it would look wrong.
 *
 * **That rule was written twenty times on 2026-09-11** (finding B137). Ten
 * times as the shape that admits one - four as a `lifecycleOrderPattern` in
 * three spellings, six as a literal - and ten times as the shape that *builds*
 * one, `seq:` with a `padStart(16, '0')` beside it. Two halves of one format,
 * kept apart in twenty places, and the second half is the one a person forgets.
 *
 * Sixteen digits is also why the sequence is a `bigint`: the largest value the
 * width allows is 9_999_999_999_999_999, and `Number.MAX_SAFE_INTEGER` stops
 * at 9_007_199_254_740_991. A `Number` path is exact for every order this tree
 * writes today and silently wrong for the top nine hundred trillion the format
 * permits.
 */

const lifecycleOrderPattern = /^seq:([0-9]{16})$/u;

/** The largest sequence sixteen digits can carry. */
export const maxPicoLifecycleOrderSequence = 9_999_999_999_999_999n;

export function isPicoLifecycleOrder(value: unknown): value is string {
  return typeof value === 'string' && lifecycleOrderPattern.test(value);
}

export function assertPicoLifecycleOrder(
  value: unknown,
  reason = 'invalid_lifecycle_order',
): asserts value is string {
  if (!isPicoLifecycleOrder(value)) {
    throw new Error(reason);
  }
}

/**
 * The number inside an order, for the two things that need to count with it.
 *
 * Reachable only through the assertion, which is the point: every caller that
 * wanted this number first had to decide what a malformed order means, and one
 * of them decided *silently start again at one* - see `nextPicoLifecycleOrder`.
 */
export function picoLifecycleOrderSequence(
  value: unknown,
  reason = 'invalid_lifecycle_order',
): bigint {
  assertPicoLifecycleOrder(value, reason);
  return BigInt(lifecycleOrderPattern.exec(value)?.[1] ?? '0');
}

/**
 * An order from a sequence, padded to the width that makes the comparison work.
 *
 * The exhaustion refusal is not decoration: the alternative is a seventeenth
 * digit, and a seventeen-digit order sorts *above* nothing correctly - it would
 * compare as a string against sixteen-digit neighbours and win or lose by its
 * first character.
 */
export function picoLifecycleOrderFrom(sequence: bigint): string {
  if (sequence < 0n) {
    throw new Error('invalid_lifecycle_order');
  }
  if (sequence > maxPicoLifecycleOrderSequence) {
    throw new Error('lifecycle_order_exhausted');
  }
  return `seq:${sequence.toString().padStart(16, '0')}`;
}

/**
 * The next order after this one.
 *
 * **A malformed current order is a refusal here, and was not everywhere.** One
 * of the three copies this replaces read `match === null ? 1 : …`, so an order
 * it could not parse started the sequence again at one - and one is the value
 * that sorts below every record already written. Measured on 2026-09-11: the
 * value it reads comes from a stored chain whose entries were validated on the
 * way in, so nothing reached it. A fallback nobody can reach is still a
 * fallback somebody will reach later, and this one had no argument beside it.
 */
export function nextPicoLifecycleOrder(current: unknown, offset = 1n): string {
  return picoLifecycleOrderFrom(picoLifecycleOrderSequence(current) + offset);
}
