import { describe, expect, it } from 'vitest';
import {
  hasPicoExposureWindowElapsed,
  hasPicoObjectionWindowElapsed,
  isPicoWallClockPlausible,
  parsePicoWindowClass,
  picoImplausibleWallClockAheadMs,
  picoWindowClasses,
} from './index.js';

const hour = 60 * 60 * 1_000;
const start = Date.parse('2026-09-01T09:00:00.000Z');
const vetoEndsAt = start + 48 * hour;

describe('ADR 0120 N1 window classes', () => {
  it('keeps the vocabulary closed', () => {
    expect(picoWindowClasses)
      .toEqual(['objection', 'exposure', 'housekeeping']);
    for (const windowClass of picoWindowClasses) {
      expect(parsePicoWindowClass(windowClass)).toBe(windowClass);
    }
    for (const rejected of ['session', '', null, 7]) {
      expect(() => parsePicoWindowClass(rejected))
        .toThrow('invalid_pico_window_class');
    }
  });
});

describe('ADR 0120 N1/N2 objection windows never end early', () => {
  it('needs the wall clock and the durable floor to agree', () => {
    // Both past the end: elapsed.
    expect(hasPicoObjectionWindowElapsed({
      endsAtMs: vetoEndsAt,
      nowMs: vetoEndsAt,
      anchorFloorMs: vetoEndsAt,
    })).toBe(true);

    // The attack: wind the wall clock a year forward. The floor did not move,
    // so the objection period is not retired.
    expect(hasPicoObjectionWindowElapsed({
      endsAtMs: vetoEndsAt,
      nowMs: start + 365 * 24 * hour,
      anchorFloorMs: start + hour,
    })).toBe(false);

    // The floor alone is not enough either: a wall clock behind the floor
    // still has not reached the end the record itself names.
    expect(hasPicoObjectionWindowElapsed({
      endsAtMs: vetoEndsAt,
      nowMs: start + hour,
      anchorFloorMs: vetoEndsAt + hour,
    })).toBe(false);
  });

  it('refuses outright when no floor is available', () => {
    // A missing anchor is the exact condition a wound-forward clock exploits,
    // so absence refuses rather than defaults.
    expect(hasPicoObjectionWindowElapsed({
      endsAtMs: vetoEndsAt,
      nowMs: vetoEndsAt + hour,
      anchorFloorMs: null,
    })).toBe(false);
  });

  it('rejects unusable readings rather than comparing NaN', () => {
    expect(() => hasPicoObjectionWindowElapsed({
      endsAtMs: Number.NaN,
      nowMs: start,
      anchorFloorMs: start,
    })).toThrow('invalid_pico_window_end');
    expect(() => hasPicoObjectionWindowElapsed({
      endsAtMs: vetoEndsAt,
      nowMs: start,
      anchorFloorMs: Number.POSITIVE_INFINITY,
    })).toThrow('invalid_pico_window_floor');
  });
});

describe('ADR 0120 N1 exposure windows never last longer', () => {
  it('expires at the earliest instant either clock allows', () => {
    const endsAtMs = start + hour;

    expect(hasPicoExposureWindowElapsed({ endsAtMs, nowMs: start })).toBe(false);
    expect(hasPicoExposureWindowElapsed({ endsAtMs, nowMs: endsAtMs }))
      .toBe(true);

    // The attack: wind the wall clock backward to keep a session alive. The
    // monotonic clock kept counting, so the window is over anyway.
    expect(hasPicoExposureWindowElapsed({
      endsAtMs,
      nowMs: start - 24 * hour,
      monotonic: { startedAtMs: 1_000, nowMs: 1_000 + hour, durationMs: hour },
    })).toBe(true);

    // Neither clock says so yet.
    expect(hasPicoExposureWindowElapsed({
      endsAtMs,
      nowMs: start,
      monotonic: { startedAtMs: 1_000, nowMs: 1_000 + hour / 2, durationMs: hour },
    })).toBe(false);
  });

  it('uses the durable floor when the window outlived its process', () => {
    const endsAtMs = start + hour;
    // No start reading and no floor: nothing to measure against, so a
    // backward wall clock does extend this one. Stated, not hidden.
    expect(hasPicoExposureWindowElapsed({ endsAtMs, nowMs: start - hour }))
      .toBe(false);

    // With a floor there is: it never moved backward, so it stands ahead of
    // the rewound wall clock and the window is over.
    expect(hasPicoExposureWindowElapsed({
      endsAtMs,
      nowMs: start - 24 * hour,
      anchorFloorMs: endsAtMs,
    })).toBe(true);
    // A floor that has genuinely not reached the end does not expire it - the
    // floor lags real time and must not cut a window short on its own.
    expect(hasPicoExposureWindowElapsed({
      endsAtMs,
      nowMs: start,
      anchorFloorMs: start,
    })).toBe(false);
    expect(hasPicoExposureWindowElapsed({
      endsAtMs,
      nowMs: start,
      anchorFloorMs: null,
    })).toBe(false);
  });
});

describe('ADR 0120 N5 implausible wall clocks', () => {
  it('accepts normal downtime and refuses a clock jumped by years', () => {
    expect(isPicoWallClockPlausible({
      nowMs: start + 7 * 24 * hour,
      anchorFloorMs: start,
    })).toBe(true);
    expect(isPicoWallClockPlausible({
      nowMs: start + picoImplausibleWallClockAheadMs + 1,
      anchorFloorMs: start,
    })).toBe(false);
    // A wall clock behind the floor is not implausible in this direction; the
    // objection rule is what protects against that one.
    expect(isPicoWallClockPlausible({
      nowMs: start - 10 * 24 * hour,
      anchorFloorMs: start,
    })).toBe(true);
    // A missing anchor is no evidence of nonsense: refusing every deletion
    // because a file is absent would turn that into a retention outage.
    expect(isPicoWallClockPlausible({ nowMs: start, anchorFloorMs: null }))
      .toBe(true);
  });
});
