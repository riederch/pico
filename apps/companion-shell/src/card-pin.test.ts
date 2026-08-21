import { describe, expect, it } from 'vitest';
import { isPicoRecoveryCardPin, picoRecoveryPinProtection } from '@pico/vault';
import { picoCompanionCardPinPrompt } from './contract.js';

describe('ADR 0112 - the Card PIN the window asks for is the one the vault accepts', () => {
  const prompt = picoCompanionCardPinPrompt('choose', picoRecoveryPinProtection);

  it('accepts exactly the lengths the vault does', () => {
    /**
     * The window cannot import the vault - this file loads in the renderer,
     * where a bare specifier does not resolve - so the record crosses as an
     * argument from the main process, and what this checks is the wiring
     * rather than the equality of two literals. It was two literals with a
     * test beside them until 2026-08-21.
     *
     * It matters more than the usual copy: a PIN the vault would take and the
     * window refuses is rejected by `collectPicoCompanionSecureInput`, which
     * answers with a character count and no sentence. The person would be
     * typing a valid PIN into a box that silently blinks at them.
     */
    const alphabet = picoRecoveryPinProtection.alphabet;
    const shortest = alphabet.slice(0, 1).repeat(picoRecoveryPinProtection.minLength);
    const longest = alphabet.slice(0, 1).repeat(picoRecoveryPinProtection.maxLength);

    expect(prompt.validate(shortest)).toBe(true);
    expect(prompt.validate(longest)).toBe(true);
    expect(prompt.validate(shortest.slice(1))).toBe(false);
    expect(prompt.validate(`${longest}a`)).toBe(false);
  });

  it('accepts every character of the vault alphabet and nothing else', () => {
    for (const character of picoRecoveryPinProtection.alphabet) {
      const pin = character.repeat(picoRecoveryPinProtection.minLength);
      expect(prompt.validate(pin), `alphabet character ${character}`).toBe(true);
    }
    for (const rejected of ['A', '-', ' ', 'ä', '_']) {
      const pin = `${rejected}${'a'.repeat(picoRecoveryPinProtection.minLength - 1)}`;
      expect(prompt.validate(pin), `rejected character ${rejected}`).toBe(false);
    }
  });

  it('says the same numbers to the person that it enforces', () => {
    // The third copy is the prose. A rule that changes without its sentence
    // leaves the person reading an instruction the box disagrees with.
    expect(prompt.instruction).toContain(String(picoRecoveryPinProtection.minLength));
    expect(prompt.instruction).toContain(String(picoRecoveryPinProtection.maxLength));
  });
});

describe('ADR 0112 - one alphabet, read by everything that judges a PIN', () => {
  it('is the vault\'s declared alphabet, not a pattern beside it', () => {
    /**
     * `picoRecoveryPinProtection` has carried an `alphabet` since it was
     * written, and until 2026-08-21 no running code read it: the vault and
     * both of the daemon's parsers spelled the same set as `/^[0-9a-z]+$/`,
     * once with the `u` flag and once without, and the window built its own
     * pattern from two literals. The declared alphabet was documentation
     * standing beside the rule rather than the rule.
     *
     * The change that costs is narrowing it - a PIN printed under a QR block
     * is a good candidate for losing `0`, `o`, `1` and `l` - and every regex
     * would have gone on accepting the wider set while the record said
     * otherwise.
     */
    const prompt = picoCompanionCardPinPrompt('choose', picoRecoveryPinProtection);
    const pad = (character: string): string =>
      character.repeat(picoRecoveryPinProtection.minLength);

    for (const character of picoRecoveryPinProtection.alphabet) {
      expect(isPicoRecoveryCardPin(pad(character)), `vault: ${character}`).toBe(true);
      expect(prompt.validate(pad(character)), `window: ${character}`).toBe(true);
    }
    for (const rejected of ['A', '-', ' ', 'ä', '_', '\u{1f600}']) {
      expect(isPicoRecoveryCardPin(pad(rejected)), `vault: ${rejected}`).toBe(false);
      expect(prompt.validate(pad(rejected)), `window: ${rejected}`).toBe(false);
    }

    // And the lengths, from the same record rather than from beside it.
    const inside = 'a'.repeat(picoRecoveryPinProtection.minLength);
    expect(isPicoRecoveryCardPin(inside)).toBe(true);
    expect(isPicoRecoveryCardPin(inside.slice(1))).toBe(false);
    expect(isPicoRecoveryCardPin('a'.repeat(picoRecoveryPinProtection.maxLength + 1))).toBe(false);
  });
});
