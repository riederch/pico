import { describe, expect, it } from 'vitest';
import { picoRecoveryCardScanPrefix } from '@pico/protocol';
import {
  picoCompanionCardPinPrompt,
  picoCompanionRecoveryCardEntryPrompt,
  picoCompanionSecureInputBody,
} from './contract.js';

describe('ADR 0113 C2 - a refused secret says what the field wanted', () => {
  it('states the refusal instead of only that something is wrong', () => {
    /**
     * Until 2026-08-19 the body said "the value is not valid yet" and nothing
     * else, for every prompt. Four defects found the same day were invisible
     * because of it: a Recovery Card code that could not be typed, a founding
     * line from a Home's second boot, and two rules copied out of the core
     * that could drift. In each, the person did the right thing and watched a
     * counter blink.
     */
    const prompt = picoCompanionRecoveryCardEntryPrompt(picoRecoveryCardScanPrefix);
    const refused = picoCompanionSecureInputBody(prompt, 12, true);
    const accepted = picoCompanionSecureInputBody(prompt, 12, false);

    expect(refused).toContain(prompt.refusal);
    expect(refused).toContain(picoRecoveryCardScanPrefix);
    expect(accepted).not.toContain(prompt.refusal);
    // ADR 0113's floor holds either way: the page is told a count, never a value.
    expect(refused).toContain('12 characters');
    expect(refused).toContain('neither keystrokes nor value');
  });

  it('says what a Card PIN is, in both places it is asked for', () => {
    for (const purpose of ['choose', 'enter'] as const) {
      const prompt = picoCompanionCardPinPrompt(purpose);
      expect(prompt.refusal).toMatch(/6/);
      expect(prompt.refusal).toMatch(/64/);
      expect(picoCompanionSecureInputBody(prompt, 3, true)).toContain(prompt.refusal);
    }
  });

  it('cannot describe the value, only the rule', () => {
    /**
     * The sentence is the prompt's, chosen before anything was typed, so no
     * refusal can carry a fact about the secret to the page - which is the
     * ADR 0113 boundary this whole input path exists to hold. A refusal
     * computed from the value would be the obvious next step and the wrong
     * one.
     */
    const prompt = picoCompanionCardPinPrompt('enter');
    const short = picoCompanionSecureInputBody(prompt, 1, true);
    const long = picoCompanionSecureInputBody(prompt, 63, true);

    expect(short.replace('1 character', 'N'))
      .toBe(long.replace('63 characters', 'N'));
  });
});
