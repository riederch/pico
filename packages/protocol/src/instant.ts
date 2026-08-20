/**
 * What counts as an instant, for the whole product. One rule.
 *
 * **The fixed width is the load-bearing half, and it is easy to lose.** Every
 * consumer of one of these compares it as a *string* - validity windows in the
 * Vault, lifecycle lookups in `@pico/identity`, freshness checkpoints and
 * membership projections in the Foundation. That is only sound while all
 * writers use one fixed-width UTC form, which is why it is pinned at the
 * canonicalization boundary rather than left to issuer discipline.
 *
 * Round-tripping through `toISOString` alone looks like the same rule and is
 * not. The extended-year form round-trips exactly:
 * `+275760-09-13T00:00:00.000Z` is a real `Date` that re-serializes to itself.
 * But `+` is 0x2B and `-` is 0x2D, both below every digit, so as a string the
 * farthest future a `Date` can hold sorts *before* every ordinary year. A
 * deadline in that form reads as earlier than everything, and whatever it was
 * guarding opens.
 *
 * **That weaker rule existed eight times on 2026-08-20** - in `@pico/vault`,
 * in three Foundation modules and in four of this package's own parsers,
 * beside the correct one. Every copy was written the same way and every copy
 * had the same hole, which is what a rule spelled more than once does: it
 * drifts in whichever direction nobody was looking.
 *
 * The shape check alone would still admit impossible dates - `Date.parse`
 * rolls `2026-02-30` forward to March 2 rather than failing - so the
 * re-serialization stays as the exact calendar check. Both halves, once.
 */
export const picoCanonicalInstantPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function isPicoInstant(value: unknown): value is string {
  if (typeof value !== 'string' || !picoCanonicalInstantPattern.test(value)) {
    return false;
  }
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}
