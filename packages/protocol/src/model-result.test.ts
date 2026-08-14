import { describe, expect, it } from 'vitest';
import {
  maxPicoModelContextRefBytes,
  maxPicoModelContextRefLifetimeMs,
  parsePicoModelContextRef,
  picoModelContextRefBelongsTo,
  picoModelContextRefSaysNothingAbout,
  picoModelContextRefSchema,
} from './model-context-ref.js';
import {
  parsePicoModelResult,
  picoModelResultMismatch,
  picoModelResultSaysNothingAbout,
  picoModelResultSchema,
} from './model-result.js';
import { picoReaderOutputSchema } from './planner-reader.js';

/**
 * ADR 0059 and ADR 0060, replacing two draft shapes whose booleans could only
 * ever hold one value.
 */
const nowMs = Date.parse('2026-08-13T12:00:00.000Z');

function reference(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: picoModelContextRefSchema,
    contextRefId: 'ref_note_0001',
    jobId: 'job_summarise_0001',
    originClass: 'home_member',
    privacyDomain: 'household',
    excerpt: 'The boiler service is due in March.',
    materializedAt: '2026-08-13T11:59:00.000Z',
    expiresAt: '2026-08-13T12:05:00.000Z',
    ...overrides,
  };
}

function result(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: picoModelResultSchema,
    jobId: 'job_summarise_0001',
    entryId: 'a-model:measured',
    modelDigestHex: 'b'.repeat(64),
    startedAt: '2026-08-13T12:00:00.000Z',
    completedAt: '2026-08-13T12:00:03.000Z',
    output: {
      schema: picoReaderOutputSchema,
      values: [{ name: 'month', type: 'token', value: 'march', originClass: 'home_member' }],
      references: [],
    },
    ...overrides,
  };
}

describe('ADR 0060 - a context reference carries bytes, not an address', () => {
  it('accepts a bounded packet prepared for one job', () => {
    const parsed = parsePicoModelContextRef(reference(), nowMs);
    expect(parsed.jobId).toBe('job_summarise_0001');
    expect(parsed.originClass).toBe('home_member');
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it('has nowhere to write the seven fields that could only hold one value', () => {
    // The draft carried a mode fixed at one value, two expansion switches, a
    // reuse flag, and two claims about the writer's own completed homework.
    expect(Object.keys(picoModelContextRefSaysNothingAbout)).toHaveLength(7);
    for (const field of Object.keys(picoModelContextRefSaysNothingAbout)) {
      expect(() => parsePicoModelContextRef(reference({ [field]: false }), nowMs))
        .toThrow(new RegExp(`says_nothing_about_${field}`, 'u'));
    }
  });

  it('makes reuse across jobs unsayable rather than forbidden', () => {
    // `reusableAcrossJobs: false` became the reference naming its job, so
    // nothing has to read a boolean for the rule to hold.
    const parsed = parsePicoModelContextRef(reference(), nowMs);
    expect(picoModelContextRefBelongsTo(parsed, 'job_summarise_0001')).toBe(true);
    expect(picoModelContextRefBelongsTo(parsed, 'job_something_else')).toBe(false);
  });

  it('refuses a window that is really a durable grant', () => {
    expect(() => parsePicoModelContextRef(reference({
      expiresAt: new Date(Date.parse('2026-08-13T11:59:00.000Z') + maxPicoModelContextRefLifetimeMs + 1_000)
        .toISOString(),
    }), nowMs)).toThrow('pico_model_context_ref_lifetime_too_long');

    expect(() => parsePicoModelContextRef(reference({
      expiresAt: '2026-08-13T11:59:30.000Z',
    }), nowMs)).toThrow('pico_model_context_ref_expired');
  });

  it('refuses an oversized excerpt rather than trimming it', () => {
    // ADR 0119 Q5's posture: a silently shortened excerpt is a different
    // excerpt, and the job would be answered about it.
    expect(() => parsePicoModelContextRef(reference({
      excerpt: 'x'.repeat(maxPicoModelContextRefBytes + 1),
    }), nowMs)).toThrow('pico_model_context_ref_excerpt_too_large');
  });
});

describe('ADR 0059 - a result claims nothing about itself', () => {
  it('accepts a result carrying declared values', () => {
    const parsed = parsePicoModelResult(result());
    expect(parsed.output.values[0]?.value).toBe('march');
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it('has nowhere to claim execution, quality, audit or retention', () => {
    // Six fields in the draft whose documentation was a list of what they did
    // not mean.
    for (const field of Object.keys(picoModelResultSaysNothingAbout)) {
      expect(() => parsePicoModelResult(result({ [field]: false })))
        .toThrow(new RegExp(`says_nothing_about_${field}`, 'u'));
    }
    expect(() => parsePicoModelResult(result({ actionExecuted: true })))
      .toThrow(/says_nothing_about_actionExecuted/u);
  });

  it('refuses a result that finished before it started', () => {
    expect(() => parsePicoModelResult(result({
      completedAt: '2026-08-13T11:59:00.000Z',
    }))).toThrow('invalid_pico_model_result_window');
  });

  it('compares provenance against what the caller dispatched, not against itself', () => {
    // The draft put `jobId` beside `requestedJobId` in one envelope and
    // required them to match - a record compared with itself, written by one
    // party.
    const parsed = parsePicoModelResult(result());
    const dispatched = {
      jobId: 'job_summarise_0001',
      entryId: 'a-model:measured',
      modelDigestHex: 'b'.repeat(64),
    };
    expect(picoModelResultMismatch(parsed, dispatched)).toBeNull();
    expect(picoModelResultMismatch(parsed, { ...dispatched, jobId: 'job_other' }))
      .toBe('answers_another_job');
    expect(picoModelResultMismatch(parsed, { ...dispatched, entryId: 'a-smaller-model:measured' }))
      .toBe('from_another_entry');
    // ADR 0142 PE6's pin, doing the work it was pinned for: the same tag can
    // be made to serve different weights by anyone who reaches the port.
    expect(picoModelResultMismatch(parsed, { ...dispatched, modelDigestHex: 'c'.repeat(64) }))
      .toBe('from_other_weights');
  });
});
