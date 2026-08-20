import { describe, expect, it } from 'vitest';
import { picoDisplayFingerprint } from './fingerprint-display.js';

describe('ADR 0079 I5 - how a key fingerprint is shown to a person', () => {
  it('shows both ends, because the attack is a ground prefix', () => {
    const fingerprint = `${'a1b2c3d4'}${'0'.repeat(48)}${'7f8e9d0c'}`;
    expect(fingerprint).toHaveLength(64);
    const shown = picoDisplayFingerprint(fingerprint);

    expect(shown).toBe('a1b2c3d4…7f8e9d0c');
    /**
     * ADR 0079's threat table names it: grinding a key whose truncated
     * fingerprint matches a target's *display prefix*. Twelve hex characters
     * of head is forty-eight bits to match. Eight from each end is sixty-four
     * and costs a person nothing, so the tail is the part this pins.
     */
    expect(shown.endsWith('7f8e9d0c')).toBe(true);
    expect(shown.startsWith(fingerprint.slice(0, 12))).toBe(false);
  });

  it('shows a short value whole rather than eliding nothing', () => {
    // An ellipsis between two halves of a seventeen-character string hides
    // nothing and reads as though something is missing.
    expect(picoDisplayFingerprint('a'.repeat(17))).toBe('a'.repeat(17));
    expect(picoDisplayFingerprint('')).toBe('');
    expect(picoDisplayFingerprint('a'.repeat(18))).toContain('…');
  });

  it('renders two different keys that share a head differently', () => {
    /**
     * The property the ceremony needs, stated as a test rather than left to
     * the doc comment. Two keys ground to a common eight-character head are
     * one string under a prefix rendering and two under this one - which is
     * the whole reason the Vault's approval sentence and the window that
     * confirms it afterwards had to stop disagreeing.
     */
    const ground = 'a1b2c3d4';
    const one = `${ground}${'0'.repeat(48)}${'11111111'}`;
    const other = `${ground}${'0'.repeat(48)}${'22222222'}`;

    expect(one.slice(0, 12)).toBe(other.slice(0, 12));
    expect(picoDisplayFingerprint(one)).not.toBe(picoDisplayFingerprint(other));
  });

  it('runs without Intl, because the first Android client has none', () => {
    /**
     * ADR 0131 A1: nodejs-mobile v18.20.4 ships without ICU, so `Intl` is
     * absent entirely. A shared rendering rule that only runs where ICU exists
     * is not shared, it is copied - which is the defect this module closes.
     */
    const intl = Reflect.get(globalThis, 'Intl');
    try {
      Reflect.deleteProperty(globalThis, 'Intl');
      expect(picoDisplayFingerprint(`${'a1b2c3d4'}${'0'.repeat(48)}${'7f8e9d0c'}`))
        .toBe('a1b2c3d4…7f8e9d0c');
    } finally {
      Reflect.set(globalThis, 'Intl', intl);
    }
  });
});
