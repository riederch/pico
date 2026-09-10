import { describe, expect, it } from 'vitest';
import {
  assertPicoInstant,
  isPicoInstant,
  picoCanonicalInstantPattern,
  picoInstantToEpochMs,
} from './instant.js';

describe('what counts as an instant', () => {
  it('takes the one fixed-width UTC form and nothing else', () => {
    expect(isPicoInstant('2026-08-20T10:00:00.000Z')).toBe(true);
    // Second precision misses the exact boundary a string comparison lands on.
    expect(isPicoInstant('2026-08-20T10:00:00Z')).toBe(false);
    // An offset form sorts before `Z` at the same instant.
    expect(isPicoInstant('2026-08-20T12:00:00.000+02:00')).toBe(false);
    expect(isPicoInstant(undefined)).toBe(false);
  });

  it('refuses the extended-year form, which round-trips and sorts first', () => {
    /**
     * The defect this module exists to end, stated as the two facts that make
     * it one. Nine copies of "is this a canonical instant" checked only that
     * the value round-tripped through `toISOString`, and the extended-year
     * form does exactly that.
     */
    const farFuture = '+275760-09-13T00:00:00.000Z';
    expect(new Date(farFuture).toISOString()).toBe(farFuture);
    expect(isPicoInstant(farFuture)).toBe(false);

    // And why it matters: `+` is 0x2B, below every digit, so the farthest
    // future a Date can hold sorts before every ordinary year. Every consumer
    // of one of these compares it as a string.
    expect(farFuture < '0001-01-01T00:00:00.000Z').toBe(true);
    expect(Date.parse(farFuture) > Date.parse('9999-12-31T23:59:59.999Z')).toBe(true);
  });

  it('still refuses a date that does not exist', () => {
    // The shape check alone admits it: `Date.parse` rolls 2026-02-30 forward
    // to March 2 rather than failing, so the re-serialization stays.
    expect(picoCanonicalInstantPattern.test('2026-02-30T00:00:00.000Z')).toBe(true);
    expect(isPicoInstant('2026-02-30T00:00:00.000Z')).toBe(false);
  });
});

describe('the one refusal around it', () => {
  it('names the field that was wrong, for every way of being wrong', () => {
    /**
     * The decision this test exists to hold (finding B126). Two of the
     * nineteen hand-written coats put `assertAsciiToken` in front of the
     * rule, and it decided nothing: every value that guard rejects,
     * `isPicoInstant` rejects too. What it did change was the *name* - these
     * five inputs came back as `empty_field`, `invalid_field_charset` or
     * `field_too_long`, a generic field fault where the reader needed to be
     * told the value was not an instant. Put the prefix back and this test
     * fails on the first four.
     */
    for (const notAnInstant of ['', '2026-08-20 10:00:00.000Z', '2026-08-20T10:00:00.000Z\u200b', 'x'.repeat(1_025), 42, null, undefined]) {
      expect(() => assertPicoInstant(notAnInstant)).toThrow('invalid_instant');
    }
    expect(() => assertPicoInstant('2026-08-20T10:00:00.000Z')).not.toThrow();
  });

  it('lets a caller name its own refusal, and that is the only thing it varies', () => {
    expect(() => assertPicoInstant('nope', 'invalid_first_run_instant'))
      .toThrow('invalid_first_run_instant');
    expect(() => assertPicoInstant('2026-02-30T00:00:00.000Z', 'invalid_pico_link_expiry'))
      .toThrow('invalid_pico_link_expiry');
  });

  it('never hands out a NaN', () => {
    // `Date.parse` on an unchecked string returns NaN silently, and NaN
    // compared against a deadline is false in both directions - neither
    // expired nor valid, which every caller here would read as "not expired".
    expect(Number.isNaN(Date.parse('2026-08-20T10:00:00.000Z\u200b'))).toBe(true);
    expect(() => picoInstantToEpochMs('2026-08-20T10:00:00.000Z\u200b')).toThrow('invalid_instant');
    expect(picoInstantToEpochMs('2026-08-20T10:00:00.000Z')).toBe(Date.parse('2026-08-20T10:00:00.000Z'));
    expect(() => picoInstantToEpochMs('2026-02-30T00:00:00.000Z', 'invalid_companion_recovery_instant'))
      .toThrow('invalid_companion_recovery_instant');
  });
});
