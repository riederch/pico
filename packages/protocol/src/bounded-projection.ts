/**
 * ADR 0127 M5. A list that says how much of it you are not seeing.
 *
 * Lifted because this tree had the shape twice and got it right once. The ADR
 * 0127 M4 deactivation statement reports `total` beside the few it shows; the
 * ADR 0118 O1 due-entries view cut its list at fifty and said nothing - so a
 * device with sixty entries due was told "50 entries are due", and the count a
 * person read was a fact about the cap rather than about their day.
 *
 * That is the failure this exists to prevent, and it is worse on a delivery
 * path than anywhere else: the whole argument for putting time-bound entries
 * on the offline floor is that a promise not kept is worse than one never
 * made. A silent truncation turns ten unkept promises into no message at all.
 *
 * **The total is the true count, always.** A bounded list that reports its own
 * bounded length is not a smaller answer, it is a wrong one - and it is wrong
 * in the direction that hides work rather than inventing it, which is exactly
 * the direction nobody checks.
 */
export interface PicoBoundedProjection<T> {
  /** How many there are. Never the shown length. */
  total: number;
  /** The first `max`, in whatever order the caller established. */
  shown: readonly T[];
}

export function boundPicoProjection<T>(input: {
  items: readonly T[];
  max: number;
}): PicoBoundedProjection<T> {
  if (!Number.isInteger(input.max) || input.max < 1) {
    // A bound of zero would produce a list that shows nothing and claims a
    // total, which reads as an outage rather than as a cap.
    throw new Error('invalid_pico_projection_bound');
  }
  return Object.freeze({
    total: input.items.length,
    shown: Object.freeze(input.items.slice(0, input.max)),
  });
}

/**
 * How many were left out. Zero when everything is shown.
 *
 * A surface needs this more often than it needs the total - "and 12 more" is
 * the sentence a person reads - and computing it at each call site is how one
 * of them ends up subtracting the wrong pair.
 */
export function picoProjectionRemainder(projection: PicoBoundedProjection<unknown>): number {
  return Math.max(0, projection.total - projection.shown.length);
}
