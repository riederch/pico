import type { PicoModelProviderAllowance } from '@pico/protocol/model-provider';
import { picoModelJobAllowanceFor } from '@pico/protocol/model-job';
import { parsePicoModelProviderEntry } from '@pico/protocol/model-provider';
import { picoModelJobRefusal } from '@pico/protocol/model-job';
import { describe, expect, it } from 'vitest';
import {
  picoLibraryContextRef,
  picoLibraryExcerptOriginClass,
  picoLibraryReadJob,
} from './library-read.js';

/**
 * ADR 0136 BR3 with ADR 0117 X4. The first occasion that wants a model.
 */
const nowMs = Date.parse('2026-08-13T12:00:00.000Z');

const excerpt = {
  path: 'notes/boiler.md',
  text: 'The boiler was serviced in March 2025 by Vaillant. Next service due March 2026.',
  commit: 'a'.repeat(40),
};

function job(overrides: Record<string, unknown> = {}) {
  return picoLibraryReadJob({
    jobId: 'job_library_read_0001',
    contextRefId: 'ref_boiler_0001',
    privacyDomain: 'household',
    excerpt,
    expects: [{ name: 'due_month', type: 'token' }, { name: 'vendor', type: 'text' }],
    question: 'When is the next boiler service due, and who does it?',
    nowMs,
    ...overrides,
  });
}

function entry(carries: PicoModelProviderAllowance) {
  return parsePicoModelProviderEntry({
    schema: 'pico.model.provider.entry.v1',
    entryId: 'a-measured-host',
    providerClass: 'declared_own_host',
    reach: carries === 'live_turn'
      ? 'http://provider.invalid:11434'
      : 'https://provider.invalid:11434',
    model: { identifier: 'a-model:measured', digestHex: 'b'.repeat(64) },
    measurement: {
      measuredAt: '2026-08-13T11:00:00.000Z',
      capacity: {
        contextTokens: 40960,
        generationTokensPerSecond: 26.31,
        promptTokensPerSecond: 1575.94,
        concurrentJobs: 1,
      },
      residency: { coldLoadMs: 4871, reloadMs: 3988, keepAliveMs: 300_000 },
    },
    carries,
    ...(carries === 'live_turn' ? {} : { credentialRef: 'lan-inference-token' }),
  });
}

describe('a library excerpt becomes a bounded packet', () => {
  it('mints the reference for the job it is about to be part of', () => {
    const reference = picoLibraryContextRef({
      jobId: 'job_library_read_0001',
      contextRefId: 'ref_boiler_0001',
      privacyDomain: 'household',
      excerpt,
      nowMs,
    });
    expect(reference.jobId).toBe('job_library_read_0001');
    expect(reference.originClass).toBe(picoLibraryExcerptOriginClass);
    // ADR 0060: one job window, and the ceiling holds however long a caller
    // asks for.
    expect(Date.parse(reference.expiresAt) - nowMs).toBe(5 * 60 * 1_000);
    expect(Date.parse(picoLibraryContextRef({
      jobId: 'job_library_read_0001',
      contextRefId: 'ref_boiler_0001',
      privacyDomain: 'household',
      excerpt,
      nowMs,
      lifetimeMs: 48 * 60 * 60 * 1_000,
    }).expiresAt) - nowMs).toBe(60 * 60 * 1_000);
  });
});

describe('the read a library occasion asks for', () => {
  it('puts the question in a unit and the material in a reference', () => {
    const read = job();
    expect(read.role).toBe('reader');
    expect(read.units).toHaveLength(1);
    expect(read.units[0]?.originClass).toBe('person_present');
    expect(read.references).toHaveLength(1);
    expect(read.references[0]?.excerpt).toContain('Vaillant');
    // Two layers, and only the first is anybody's instruction.
    expect(read.carries).toBe('live_turn_and_retrieved_memory');
    // Derived, not just declared. The excerpt is `own_pico` and `own_pico`
    // units have travelled on the live turn since 2026-08-16, so what keeps
    // this read wide is that a reference is retrieved memory by being one -
    // and a declaration alone would pass the parser either way, because the
    // parser refuses understating and permits overstating.
    expect(picoModelJobAllowanceFor(read.units, read.references))
      .toBe('live_turn_and_retrieved_memory');
  });

  it('refuses a read with no declared answer shape', () => {
    expect(() => job({ expects: [] })).toThrow('invalid_pico_model_job_expects');
  });

  it('is refused today, and that is the design rather than a gap', () => {
    // The measured LAN host is unauthenticated, so ADR 0151 PV1 gives it the
    // live turn alone. A library is somebody's stored material, and a host
    // that cannot say who it is has no business reading it.
    expect(picoModelJobRefusal(job(), entry('live_turn')))
      .toBe('entry_may_not_carry_these_words');
  });

  it('runs the moment the provider can prove who it is', () => {
    expect(picoModelJobRefusal(job(), entry('live_turn_and_retrieved_memory'))).toBeNull();
  });

  it('never lets the excerpt reach a planner', () => {
    // The reference's origin is below the instruction threshold by
    // construction, so the planner variant of this job does not exist.
    expect(() => picoLibraryReadJob({
      jobId: 'job_library_read_0001',
      contextRefId: 'ref_boiler_0001',
      privacyDomain: 'household',
      excerpt,
      expects: [{ name: 'due_month', type: 'token' }],
      question: 'When is the next service due?',
      nowMs,
    })).not.toThrow();

    // And the job builder cannot be talked into a planner: the role is fixed
    // here, so the only way to get one is to write a different job - which the
    // job parser then refuses for carrying foreign content.
    expect(job().role).toBe('reader');
  });
});
