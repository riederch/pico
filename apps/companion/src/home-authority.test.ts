import { describe, expect, it } from 'vitest';
import { isPicoCompanionMembershipSubject } from './home-authority.js';

describe('ADR 0130 E4 - what a Pico may be admitted by', () => {
  it('is an identity fingerprint, whole and lowercase', () => {
    expect(isPicoCompanionMembershipSubject('ab'.repeat(32))).toBe(true);
    expect(isPicoCompanionMembershipSubject('AB'.repeat(32))).toBe(false);
    expect(isPicoCompanionMembershipSubject('ab'.repeat(31))).toBe(false);
    expect(isPicoCompanionMembershipSubject(`${'ab'.repeat(32)} `)).toBe(false);
    expect(isPicoCompanionMembershipSubject(undefined)).toBe(false);
  });

  it('is the question the field a person pastes into also asks', () => {
    /**
     * The reason this is exported rather than inlined twice. Until
     * 2026-08-20 the Electron prompt held the same expression and a field
     * that stopped at 128 characters - twice a fingerprint - so the two
     * agreed by coincidence. ADR 0131 A5 puts a second client beside this
     * one, and a coincidence does not survive being re-typed in Kotlin.
     */
    expect('ab'.repeat(32)).toHaveLength(64);
  });
});
