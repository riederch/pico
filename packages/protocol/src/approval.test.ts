import { describe, expect, it } from 'vitest';

import {
  picoApprovalOutcomes,
  resolvePicoApproval,
  type PicoPendingApproval,
} from './approval.js';

const pending: PicoPendingApproval = {
  requestedEventId: 'evt-1',
  presenceSessionId: 'session-a',
  endsAtMs: 1_000_000,
  startedAtMs: 500,
  durationMs: 60_000,
};

const answer = (over: Record<string, unknown> = {}) => resolvePicoApproval({
  pending,
  presenceSessionId: 'session-a',
  approved: true,
  nowMs: 900_000,
  monotonicNowMs: 1_000,
  ...over,
});

describe('ADR 0141 RN4 - an approval is bound to presence', () => {
  it('accepts an answer from the session it was asked into', () => {
    expect(answer()).toEqual({ outcome: 'approved', mayRun: true });
  });

  it('records a refusal as a decision the person made', () => {
    expect(answer({ approved: false })).toEqual({ outcome: 'refused', mayRun: false });
  });

  it('refuses an answer from another session, under its own error', () => {
    // Not an outcome: this is someone else agreeing on the person's behalf,
    // and folding it into `refused` would record a decision they never made.
    expect(() => answer({ presenceSessionId: 'session-b' }))
      .toThrow('pico_approval_wrong_presence_session');
  });
});

describe('ADR 0141 RN4 - expiry, on two clocks', () => {
  it('has three outcomes, because unanswered is not denied', () => {
    expect(picoApprovalOutcomes).toEqual(['approved', 'refused', 'unanswered']);
  });

  it('answers unanswered once the wall clock passed the end', () => {
    // A person who was asleep did not refuse.
    expect(answer({ nowMs: 1_000_001 })).toEqual({ outcome: 'unanswered', mayRun: false });
  });

  it('expires on the monotonic clock even when the wall clock was wound back', () => {
    // The window outlived its duration in this process; a backward wall clock
    // cannot extend it.
    expect(answer({ nowMs: 1, monotonicNowMs: 500 + 60_000 }))
      .toEqual({ outcome: 'unanswered', mayRun: false });
  });

  it('expires on the durable floor for a window that outlived its process', () => {
    expect(answer({ nowMs: 1, monotonicNowMs: 600, anchorFloorMs: 1_000_000 }))
      .toEqual({ outcome: 'unanswered', mayRun: false });
  });

  it('checks expiry before the answer, so a late click is not consent', () => {
    // Answering a question that no longer stands is not agreeing to it, and
    // the session check does not even run.
    expect(resolvePicoApproval({
      pending,
      presenceSessionId: 'session-b',
      approved: true,
      nowMs: 1_000_001,
      monotonicNowMs: 1_000,
    })).toEqual({ outcome: 'unanswered', mayRun: false });
  });

  it('refuses to invent an outcome for a question still standing', () => {
    expect(() => resolvePicoApproval({
      pending,
      presenceSessionId: 'session-a',
      nowMs: 900_000,
      monotonicNowMs: 1_000,
    })).toThrow('pico_approval_still_pending');
  });
});
