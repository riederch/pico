import { describe, expect, it } from 'vitest';
import { picoRecoveryPinProtection } from '@pico/vault';
import { picoCompanionCardPinPrompt } from './contract.js';

describe('ADR 0112 - the Card PIN the window asks for is the one the vault accepts', () => {
  const prompt = picoCompanionCardPinPrompt();

  it('accepts exactly the lengths the vault does', () => {
    /**
     * The window cannot import the vault - this file loads in the renderer,
     * where a bare specifier does not resolve - so the rule is stated twice
     * and bound here, which is this project's own remedy for a copy that
     * cannot be an import.
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
