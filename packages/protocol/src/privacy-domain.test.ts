import { describe, expect, it } from 'vitest';
import { isPicoPrivacyDomain, picoPrivacyDomainPattern } from './privacy-domain.js';

/**
 * Befund B143. Was eine Privatsphaerendomaene heissen darf - entschieden am
 * 2026-09-11, nachdem vier Regeln im Baum sieben von zwoelf gemessenen Namen
 * verschieden beurteilt hatten.
 */
describe('what a privacy domain may be called', () => {
  it('takes letters, digits, underscore and hyphen', () => {
    for (const value of ['household', 'domain_private', 'my-domain', 'Domain', '1domain', 'd']) {
      expect(isPicoPrivacyDomain(value)).toBe(true);
    }
  });

  it('refuses a dot, a space, an empty name and one too long for a file name', () => {
    for (const value of ['my.domain', 'Private Space', 'a/b', '', 'x'.repeat(129)]) {
      expect(isPicoPrivacyDomain(value)).toBe(false);
    }
    expect(isPicoPrivacyDomain('x'.repeat(128))).toBe(true);
  });

  it('is not a token that coerces', () => {
    // Dieselbe Falle wie in Befund B141: `RegExp.test` wandelt sein Argument
    // um, und "undefined" besteht aus erlaubten Zeichen.
    for (const value of [undefined, null, 42, true]) {
      expect(isPicoPrivacyDomain(value)).toBe(false);
      expect(picoPrivacyDomainPattern.test(value as never)).toBe(true);
    }
  });

  it('is the rule the key store forces, and now the only one', () => {
    /**
     * **Die Entscheidung, als Test.** Ein Domaenenname wird ein
     * Schluesseldateiname (ADR 0072), also ist das Dateisystem, was ihn
     * begrenzt - und diese Zeichenmenge war die einzige, die das Produkt
     * wirklich anwandte. Das Protokoll sagte dreimal etwas Engeres und
     * niemand fuhr es.
     *
     * Was die Entscheidung geweitet hat, steht hier namentlich: `my-domain`
     * und `Domain` waren im Protokoll verboten und im Schreibweg erlaubt, und
     * das ist die Uneinigkeit, an der dieser Befund haengt.
     */
    const keyStoreRule = /^[a-zA-Z0-9_-]{1,128}$/u;
    for (const value of ['household', 'my-domain', 'Domain', 'domain-1', '_leading', 'a__b',
      'my.domain', 'Private Space', '', 'x'.repeat(129)]) {
      expect(isPicoPrivacyDomain(value)).toBe(keyStoreRule.test(value));
    }
  });

  it('says that two spellings are two domains, which a file system may not', () => {
    /**
     * Der benannte Rest. `Domain` und `domain` sind hier zwei Domaenen und auf
     * einem Dateisystem ohne Gross-Klein-Unterscheidung eine Datei - also zwei
     * Domaenen mit einem Schluessel. Alles, was dieses Repository ausliefert,
     * laeuft auf Linux, wo es zwei Dateien sind.
     */
    expect(isPicoPrivacyDomain('Domain')).toBe(true);
    expect(isPicoPrivacyDomain('domain')).toBe(true);
    expect('Domain').not.toBe('domain');
  });
});
