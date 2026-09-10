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

/**
 * The one refusal, and the one conversion.
 *
 * `isPicoInstant` was already the single rule on 2026-08-20, and every caller
 * asked it. What still stood **nineteen** times on 2026-09-10 was the coat
 * around it - what to throw when the answer is no, and whether to hand back a
 * number afterwards. Six wore the name `assertInstant`; the other thirteen
 * stood anonymously inside a parser, which is why counting the name alone
 * found six. Nineteen coats over one rule is where the rule stops being one -
 * finding B125 had just shown the same shape under `bytesToHex`.
 *
 * **Two of the nineteen put `assertAsciiToken` in front of this, and it
 * decided nothing.** Every value that guard rejects, `isPicoInstant` rejects too: an
 * instant is twenty-four ASCII characters drawn from digits, `-`, `:`, `.`,
 * `T` and `Z`, all of which the canonical token pattern already admits. So the
 * prefix changed no verdict; it changed the *name* of the refusal, for empty,
 * non-ASCII, overlong and non-string values - five of eleven measured inputs -
 * from `invalid_instant` to a generic field fault. That is the specific name
 * being traded away for the vague one in exactly the cases where a reader most
 * needs to be told which field was wrong, and no test vector asked for it: all
 * three `invalid_field_charset` vectors are a domain, an item id and an
 * envelope field, never an instant. The prefix is gone, and the name a bad
 * instant carries is `invalid_instant` everywhere unless a caller names its
 * own.
 */
export function assertPicoInstant(value: unknown, reason = 'invalid_instant'): asserts value is string {
  if (!isPicoInstant(value)) {
    throw new Error(reason);
  }
}

/**
 * An instant as a number, for the four places that need arithmetic on it.
 *
 * Reachable only through the assertion above, which is the point: `Date.parse`
 * on an unchecked string returns `NaN` silently, and `NaN` compared against a
 * deadline is false in both directions - neither expired nor valid, which
 * every caller here would read as "not expired". Comparing instants as strings
 * stays the ordinary way (see the note at the top of this file); this is for
 * the places that must subtract.
 */
export function picoInstantToEpochMs(value: unknown, reason = 'invalid_instant'): number {
  assertPicoInstant(value, reason);
  return Date.parse(value);
}
