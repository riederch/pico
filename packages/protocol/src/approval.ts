import { hasPicoExposureWindowElapsed } from './time-authority.js';

/**
 * ADR 0141 RN4 - an approval is bound to presence and expires.
 *
 * Following ADR 0116 W4's direction to ADR 0099/0106 semantics. Two
 * properties, and the second is the one the reserved payload could not
 * express.
 *
 * **Bound to presence.** An approval is answered inside the session it was
 * asked into, where a person's presence was established. Another session
 * answering it would be someone else agreeing on their behalf, which is the
 * whole thing an approval exists to prevent.
 *
 * **Expiring, on two clocks.** A pending approval that outlives the moment is
 * a standing grant nobody intended - ADR 0117 X2 already refused the
 * equivalent for references. Expiry uses `hasPicoExposureWindowElapsed`, so a
 * wall clock wound backward cannot extend the window: the monotonic clock kept
 * counting and the durable floor never moved back (ADR 0120).
 *
 * **And unanswered is not denied.** The reserved `ApprovalResolvedPayload`
 * carried `approved: boolean`, which has room for two answers and the third
 * state is neither. A person who was asleep did not refuse; the question
 * simply expired, and recording that as a refusal would put a decision in
 * their mouth. Revised in place under ADR 0134 - reserved, never writable.
 */
export const picoApprovalOutcomes = ['approved', 'refused', 'unanswered'] as const;

export type PicoApprovalOutcome = typeof picoApprovalOutcomes[number];

export interface PicoPendingApproval {
  /** The ADR 0139 fact this answers. */
  requestedEventId: string;
  /** The session presence was established in. Only it may answer. */
  presenceSessionId: string;
  /** Wall-clock end of the window. */
  endsAtMs: number;
  /** When the window began in this process, for the monotonic half. */
  startedAtMs: number;
  durationMs: number;
}

export interface PicoApprovalResolution {
  outcome: PicoApprovalOutcome;
  /** True only for `approved`. Stated so no caller has to re-derive it. */
  mayRun: boolean;
}

function assertNonEmpty(value: unknown, error: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(error);
  }
  return value;
}

/**
 * ADR 0141 RN4. Answers a pending approval, or explains why it cannot be
 * answered.
 *
 * Expiry is checked before the answer is read. A person answering a question
 * that has already expired is answering a question that no longer stands, and
 * treating their click as consent would be the standing grant this refuses.
 */
export function resolvePicoApproval(input: {
  pending: PicoPendingApproval;
  /** The session offering the answer. */
  presenceSessionId: string;
  /** Absent where nobody answered - the caller is sweeping expiries. */
  approved?: boolean;
  nowMs: number;
  monotonicNowMs: number;
  /** The ADR 0120 durable floor, where one is available. */
  anchorFloorMs?: number | null;
}): PicoApprovalResolution {
  const pending = input.pending;
  assertNonEmpty(pending.requestedEventId, 'invalid_pico_approval_request');
  assertNonEmpty(pending.presenceSessionId, 'invalid_pico_approval_session');

  const elapsed = hasPicoExposureWindowElapsed({
    endsAtMs: pending.endsAtMs,
    nowMs: input.nowMs,
    monotonic: {
      startedAtMs: pending.startedAtMs,
      nowMs: input.monotonicNowMs,
      durationMs: pending.durationMs,
    },
    anchorFloorMs: input.anchorFloorMs,
  });
  if (elapsed) {
    // Not a refusal. Nobody said no; the question stopped standing.
    return Object.freeze({ outcome: 'unanswered' as const, mayRun: false });
  }

  if (assertNonEmpty(input.presenceSessionId, 'invalid_pico_approval_session')
    !== pending.presenceSessionId) {
    // Its own error rather than an outcome: this is not an answer at all, it
    // is someone else answering, and folding it into `refused` would record a
    // decision the present person never made.
    throw new Error('pico_approval_wrong_presence_session');
  }

  if (input.approved === undefined) {
    // The sweep found it still standing. Nothing to record yet.
    throw new Error('pico_approval_still_pending');
  }

  return Object.freeze({
    outcome: input.approved ? ('approved' as const) : ('refused' as const),
    mayRun: input.approved === true,
  });
}
