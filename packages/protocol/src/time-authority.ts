/**
 * ADR 0120 N1 - window classes and conservative evaluation.
 *
 * Pico's windows are not the same kind of thing, and judging them the same way
 * is the defect. For a session the person is protected by the window *ending*;
 * for a veto delay they are protected by it *lasting*. An attacker who can move
 * the clock attacks each from the opposite direction, so each class takes the
 * answer that refuses more.
 *
 * This module changes no window's length. It decides only how a window is
 * judged to have passed.
 */
export const picoWindowClasses = [
  /** The person is protected by the duration. It must never end early. */
  'objection',
  /** The person is protected by the end. It must never last longer. */
  'exposure',
  /** Confers no authority; governed by what it triggers, not by authority. */
  'housekeeping',
] as const;

export type PicoWindowClass = typeof picoWindowClasses[number];

export function parsePicoWindowClass(value: unknown): PicoWindowClass {
  if (typeof value !== 'string'
    || !picoWindowClasses.includes(value as PicoWindowClass)) {
    throw new Error('invalid_pico_window_class');
  }
  return value as PicoWindowClass;
}

export interface PicoObjectionWindowEvaluation {
  endsAtMs: number;
  nowMs: number;
  /**
   * The durable, forward-only floor from ADR 0110 R6's anchor. `null` means no
   * anchor is available, which refuses rather than defaults: an objection
   * window with no durable lower bound is exactly the case a wound-forward
   * wall clock exploits.
   */
  anchorFloorMs: number | null;
}

/**
 * Elapsed only when the wall clock *and* the durable floor have both passed
 * the end. Winding the wall clock forward cannot retire a veto period, because
 * the floor advances only with observed time and never with a claim.
 *
 * These windows are 48 hours or longer, so they will certainly cross a
 * restart, and across that restart there is no monotonic clock left to consult
 * - which is why the second reading is the anchor rather than a process clock.
 */
export function hasPicoObjectionWindowElapsed(
  input: PicoObjectionWindowEvaluation,
): boolean {
  assertFiniteMs(input.endsAtMs, 'invalid_pico_window_end');
  assertFiniteMs(input.nowMs, 'invalid_pico_window_now');
  if (input.anchorFloorMs === null) {
    return false;
  }
  assertFiniteMs(input.anchorFloorMs, 'invalid_pico_window_floor');
  return input.nowMs >= input.endsAtMs && input.anchorFloorMs >= input.endsAtMs;
}

export interface PicoExposureWindowEvaluation {
  endsAtMs: number;
  nowMs: number;
  /**
   * Present when the window began in this process, which is the common case
   * for sessions, tickets and challenges.
   */
  monotonic?: {
    startedAtMs: number;
    nowMs: number;
    durationMs: number;
  };
  /**
   * The same durable floor the objection rule uses, read in the opposite
   * direction. It never moves backward, so a wall clock wound backward leaves
   * it standing ahead - which is exactly the evidence a window that outlived
   * its process has nothing else to offer.
   *
   * It lags real time, since it counts only observed uptime, so it almost
   * never fires before the wall clock does. That is the point: it is here for
   * the one case where the wall clock went the wrong way.
   */
  anchorFloorMs?: number | null;
}

/**
 * Expired at the earliest instant any available clock allows. A wall clock
 * wound backward cannot extend a session, because the monotonic clock kept
 * counting - and for a window that outlived its process, because the durable
 * floor did not move backward either.
 */
export function hasPicoExposureWindowElapsed(
  input: PicoExposureWindowEvaluation,
): boolean {
  assertFiniteMs(input.endsAtMs, 'invalid_pico_window_end');
  assertFiniteMs(input.nowMs, 'invalid_pico_window_now');
  if (input.nowMs >= input.endsAtMs) {
    return true;
  }
  if (input.anchorFloorMs !== undefined && input.anchorFloorMs !== null) {
    assertFiniteMs(input.anchorFloorMs, 'invalid_pico_window_floor');
    if (input.anchorFloorMs >= input.endsAtMs) {
      return true;
    }
  }
  if (input.monotonic === undefined) {
    return false;
  }
  assertFiniteMs(input.monotonic.startedAtMs, 'invalid_pico_window_start');
  assertFiniteMs(input.monotonic.nowMs, 'invalid_pico_window_now');
  assertFiniteMs(input.monotonic.durationMs, 'invalid_pico_window_duration');
  return input.monotonic.nowMs - input.monotonic.startedAtMs
    >= input.monotonic.durationMs;
}

/**
 * How far the wall clock may sit ahead of the durable floor before work that
 * cannot be undone refuses to act. Generous, because the floor advances only
 * while Pico is running: a Home switched off for a week is legitimately that
 * far behind, and this bound exists to catch a clock jumped by years, not to
 * second-guess normal downtime.
 */
export const picoImplausibleWallClockAheadMs = 365 * 24 * 60 * 60 * 1_000;

/**
 * ADR 0120 N5. The retention sweeper deletes, and deletion under ADR 0070's
 * crypto-shredding is not recoverable, so a wall clock jumped forward would
 * expire items that had years left. Being able to run is not permission to act
 * on nonsense.
 */
export function isPicoWallClockPlausible(input: {
  nowMs: number;
  anchorFloorMs: number | null;
  toleranceMs?: number;
}): boolean {
  assertFiniteMs(input.nowMs, 'invalid_pico_window_now');
  if (input.anchorFloorMs === null) {
    // No floor is no evidence of nonsense. Refusing every deletion because the
    // anchor is absent would turn a missing file into a retention outage.
    return true;
  }
  assertFiniteMs(input.anchorFloorMs, 'invalid_pico_window_floor');
  const tolerance = input.toleranceMs ?? picoImplausibleWallClockAheadMs;
  assertFiniteMs(tolerance, 'invalid_pico_window_duration');
  return input.nowMs - input.anchorFloorMs <= tolerance;
}

function assertFiniteMs(value: number, reason: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(reason);
  }
}
