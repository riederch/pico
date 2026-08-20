import { describe, expect, it } from 'vitest';
import {
  buildPicoRecoveryCardScanTransport,
  maxPicoRecoveryCardScanChars,
  parsePicoRecoveryCardScanTransport,
  picoRecoveryCardScanPrefix,
} from '@pico/protocol';
import {
  picoCompanionCardPinPrompt,
  picoCompanionRecoveryCardEntryPrompt,
} from './contract.js';

describe('ADR 0112 - a printed card can be typed, not only photographed', () => {
  it('accepts a transport the protocol actually produces', () => {
    /**
     * Until 2026-08-19 it did not. The camera path read the prefix from
     * `picoRecoveryCardScanPrefix`; the typed and USB-scanner path beside it
     * carried the literal `pico-recovery-card-v2:`, which no card has ever
     * borne - the card's *metadata* schema is v2, its scan transport is v1.
     *
     * The failure was silent by construction: a rejected value in
     * `collectPicoCompanionSecureInput` produces a character count and no
     * sentence, so a person restoring a device without a camera would have
     * typed a valid card code into a box that blinked at them.
     */
    const transport = buildPicoRecoveryCardScanTransport(
      new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
    );
    const prompt = picoCompanionRecoveryCardEntryPrompt(
      picoRecoveryCardScanPrefix,
      maxPicoRecoveryCardScanChars,
    );

    expect(prompt.validate(transport)).toBe(true);
    expect(prompt.validate(`pico-recovery-card-v2:${transport.split(':')[1]}`)).toBe(false);
    expect(prompt.validate('')).toBe(false);
  });

  it('asks for the PIN of an existing card with the rule that made it', () => {
    // Two prompts, one rule: the PIN a person chooses when the card is printed
    // and the PIN they type when it is used are the same string, so a window
    // that validated them differently would refuse its own card.
    const choose = picoCompanionCardPinPrompt('choose');
    const enter = picoCompanionCardPinPrompt('enter');

    expect(enter.title).not.toBe(choose.title);
    for (const candidate of ['abc123', 'a'.repeat(64), 'ABC123', 'abc12', 'a'.repeat(65)]) {
      expect(enter.validate(candidate), candidate)
        .toBe(choose.validate(candidate));
    }
  });
});

describe('ADR 0113 C2 - the field stops where the parser stops', () => {
  it('takes its cap from the protocol rather than holding one of its own', () => {
    /**
     * It held `8_192` until 2026-08-20, against a parser that refuses anything
     * longer than 5,486 - so a scanner feeding the wrong line, or a person
     * pasting one, ran two thousand seven hundred characters past the last one
     * that could have been part of a code, and the refusal when it came could
     * only say the code was malformed.
     *
     * The same defect as the device-enrolment field, repaired a few hours
     * earlier, and it survived that repair because it lives in the window
     * rather than in the prompts beside the others - which is also why the cap
     * arrives as an argument: this file loads in the renderer and can reach no
     * protocol constant of its own.
     */
    const prompt = picoCompanionRecoveryCardEntryPrompt(
      picoRecoveryCardScanPrefix,
      maxPicoRecoveryCardScanChars,
    );

    expect(prompt.maximumLength).toBe(maxPicoRecoveryCardScanChars);
    // And the bound is the parser's, not a number that resembles it: one
    // character past it is refused there.
    expect(() => parsePicoRecoveryCardScanTransport(
      picoRecoveryCardScanPrefix + 'A'.repeat(
        maxPicoRecoveryCardScanChars - picoRecoveryCardScanPrefix.length + 1,
      ),
    )).toThrow('invalid_recovery_card_scan_length');
  });
});
