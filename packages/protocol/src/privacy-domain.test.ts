import { describe, expect, it } from 'vitest';
import { isPicoPrivacyDomain, picoPrivacyDomainPattern } from './privacy-domain.js';

/**
 * Befund B143. Was eine Privatsphaerendomaene heissen darf - und dass der Baum
 * sich darueber nicht einig ist.
 */
describe('what a privacy domain may be called', () => {
  it('takes lowercase words joined by single underscores', () => {
    expect(isPicoPrivacyDomain('household')).toBe(true);
    expect(isPicoPrivacyDomain('domain_private')).toBe(true);
    expect(isPicoPrivacyDomain('d')).toBe(true);
    expect(isPicoPrivacyDomain('1domain')).toBe(true);
  });

  it('refuses a dot, a hyphen, a capital and a dangling separator', () => {
    for (const value of ['my.domain', 'my-domain', 'Domain', '_leading', 'trailing_', 'a__b', '']) {
      expect(isPicoPrivacyDomain(value)).toBe(false);
    }
  });

  it('is not a token that coerces', () => {
    // Dieselbe Falle wie in Befund B141: `RegExp.test` wandelt sein Argument
    // um, und "undefined" besteht aus erlaubten Zeichen.
    for (const value of [undefined, null, 42, true]) {
      expect(isPicoPrivacyDomain(value)).toBe(false);
      expect(picoPrivacyDomainPattern.test(value as never)).toBe(true);
    }
  });

  it('disagrees with the rule the product enforces, and this pins it', () => {
    /**
     * Die Messung, die diesen Befund traegt. Der Schreibweg eines
     * verschluesselten Items nimmt `[a-zA-Z0-9_-]{1,128}`, weil der Name dort
     * ein Schluesseldateiname wird (ADR 0072). Diese Regel hier nimmt das
     * nicht. Solange kein Produktpfad diese Regel faehrt, faellt das
     * niemandem auf - und genau deshalb steht es als Test da.
     */
    const keyStoreRule = /^[a-zA-Z0-9_-]{1,128}$/u;
    for (const value of ['my-domain', 'Domain', 'domain-1']) {
      expect(keyStoreRule.test(value)).toBe(true);
      expect(isPicoPrivacyDomain(value)).toBe(false);
    }
    // Und in die andere Richtung gibt es keine Uneinigkeit: was diese Regel
    // nimmt, nimmt der Schluesselspeicher auch.
    for (const value of ['household', 'domain_private', 'd', '1domain']) {
      expect(isPicoPrivacyDomain(value)).toBe(true);
      expect(keyStoreRule.test(value)).toBe(true);
    }
  });
});
