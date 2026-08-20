import { describe, expect, it } from 'vitest';
import {
  assertPicoHomeCoreUrl,
  isPicoHomeCoreUrl,
  maxPicoHomeCoreUrlLength,
} from './home-address.js';

describe('ADR 0130 E2 - what a Pico Home’s address is', () => {
  it('takes the ordinary ones', () => {
    expect(isPicoHomeCoreUrl('http://127.0.0.1:3100')).toBe(true);
    expect(isPicoHomeCoreUrl('https://home.local:3100')).toBe(true);
    expect(isPicoHomeCoreUrl('http://192.168.1.20:3000/')).toBe(true);
  });

  it('refuses each of the three the four old rules disagreed about', () => {
    /**
     * The table that made this module. Every one of these was accepted by at
     * least one door and refused by another, and the middle one is the one a
     * person reaches: found a Home at a long address and the founding works,
     * then adding a second device fails with a message about the *code*.
     */
    expect(isPicoHomeCoreUrl('HTTP://192.168.1.20:3000')).toBe(false);
    expect(isPicoHomeCoreUrl(`http://${'a'.repeat(600)}:3000`)).toBe(false);
    expect(isPicoHomeCoreUrl('http://exa mple:3000')).toBe(false);
  });

  it('bounds the address by what a grant can carry', () => {
    // Not by what a URL may be: the address travels inside a code a person
    // reads out or scans.
    expect(maxPicoHomeCoreUrlLength).toBe(512);
    const host = 'a'.repeat(maxPicoHomeCoreUrlLength - 'http://'.length);
    expect(`http://${host}`).toHaveLength(maxPicoHomeCoreUrlLength);
    expect(isPicoHomeCoreUrl(`http://${host}`)).toBe(true);
    expect(isPicoHomeCoreUrl(`http://${host}a`)).toBe(false);
  });

  it('refuses what is not a string at all, and says the caller’s reason', () => {
    expect(isPicoHomeCoreUrl(undefined)).toBe(false);
    expect(isPicoHomeCoreUrl('')).toBe(false);
    expect(isPicoHomeCoreUrl('192.168.1.20:3000')).toBe(false);
    expect(isPicoHomeCoreUrl('file:///etc/passwd')).toBe(false);
    expect(() => assertPicoHomeCoreUrl('nope', 'invalid_companion_core_url'))
      .toThrow('invalid_companion_core_url');
    expect(assertPicoHomeCoreUrl('http://127.0.0.1:3100', 'unused'))
      .toBe('http://127.0.0.1:3100');
  });
});
