import { describe, expect, it } from 'vitest';
import { picoCompanionFirstRunFailureBody } from './contract.js';

describe('ADR 0130 E2 - a first run that failed says which failure it was', () => {
  it('tells a second-boot line apart from something that is not a Home log', () => {
    /**
     * `founding.ts` distinguishes these two on purpose - its own comment says
     * they "send a person to different places" - and until 2026-08-19 the
     * distinction could not reach anybody: the window pre-checked the pasted
     * line for the move-in code's field name, and a line without one was
     * rejected by the secure input, which answers with a character count and
     * no sentence at all. The person most likely to hit it is the one whose
     * Home has been restarted once.
     */
    const alreadyClaimed = picoCompanionFirstRunFailureBody(
      'pico_home_setup_announcement_has_no_move_in_code',
      'unknown',
    );
    const notAHomeLog = picoCompanionFirstRunFailureBody(
      'invalid_pico_home_setup_announcement',
      'unknown',
    );

    expect(alreadyClaimed).not.toBe(notAHomeLog);
    expect(alreadyClaimed).toMatch(/already|claimed/i);
    expect(notAHomeLog).toMatch(/line|log/i);
  });

  it('keeps saying what the other named failures are', () => {
    expect(picoCompanionFirstRunFailureBody('secure_input_cancelled', 'x'))
      .toMatch(/cancelled/i);
    expect(picoCompanionFirstRunFailureBody('camera_scan_unavailable', 'x'))
      .toMatch(/zbar/i);
    expect(picoCompanionFirstRunFailureBody('invalid_recovery_card_scan:bad', 'x'))
      .toMatch(/Recovery Card/i);
  });

  it('falls back to the reason it was given rather than inventing one', () => {
    // An unnamed failure still has to say something true and specific, and
    // "nothing was changed at your Home" is the part a person needs first.
    const body = picoCompanionFirstRunFailureBody('something_new_broke', 'link_unreachable');
    expect(body).toContain('link_unreachable');
    expect(body).toMatch(/nothing was changed/i);
  });
});
