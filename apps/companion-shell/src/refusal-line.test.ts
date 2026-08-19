import { describe, expect, it } from 'vitest';
import { picoCompanionRefusalLine } from './contract.js';

describe('ADR 0113 C2 - a refusal reaches the person as a sentence', () => {
  it('says what an operational refusal means and what to do', () => {
    /**
     * The window showed `error.message` verbatim until 2026-08-19, so a
     * person who pressed a second button while the first was working read
     * `companion_operation_in_progress` in a status line.
     */
    const busy = picoCompanionRefusalLine('companion_operation_in_progress', 'x');
    expect(busy).not.toContain('companion_operation_in_progress');
    expect(busy).toMatch(/wait|finish|already/i);

    const gone = picoCompanionRefusalLine('companion_service_unavailable', 'x');
    expect(gone).not.toContain('_');
  });

  it('tells a person their own mistake apart from a defect', () => {
    // A mismatched PIN is something the person can fix by doing it again.
    const mine = picoCompanionRefusalLine('recovery_pin_mismatch', 'x');
    expect(mine).toMatch(/same|again/i);
    expect(mine).not.toMatch(/defect|bug/i);

    /**
     * An `invalid_*` refusal means this window sent something the boundary
     * disallows - which is a defect in Pico, never something a person did.
     * Saying so is the difference between "you typed it wrong" and "report
     * this", and the word stays in the sentence so it *can* be reported.
     */
    const theirs = picoCompanionRefusalLine('invalid_depot_pin', 'x');
    expect(theirs).toMatch(/defect|not something you did/i);
    expect(theirs).toContain('invalid_depot_pin');
  });

  it('keeps the caller\'s sentence when the word means nothing here', () => {
    // Refusals travel from the Home too, with a vocabulary this file does not
    // own. The call site already knows what was being attempted, so its own
    // sentence leads and the word follows it rather than replacing it.
    const line = picoCompanionRefusalLine('not_kept_by_you', 'That was not removed.');
    expect(line).toContain('That was not removed.');
    expect(line).toContain('not_kept_by_you');
  });

  it('says something even when there is no word at all', () => {
    expect(picoCompanionRefusalLine('', 'That was not measured.'))
      .toBe('That was not measured.');
  });
});
