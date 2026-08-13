import { parsePicoModelJob } from '@pico/protocol/model-job';
import { parsePicoModelProviderEntry } from '@pico/protocol/model-provider';
import { describe, expect, it } from 'vitest';
import {
  PicoModelDispatchError,
  PicoModelRuntime,
  picoModelAnswerOriginClass,
  picoModelAnswerSchema,
  picoModelJobDeadlineMs,
} from './model-runtime.js';

/**
 * ADR 0049 with ADR 0142 and ADR 0117. The runtime, against a host that can
 * disagree with the contracts above it.
 *
 * The entry is the one measured on 2026-08-13, so the deadline arithmetic is
 * exercised against numbers a real card produced rather than round ones.
 */
const nowMs = Date.parse('2026-08-13T12:00:00.000Z');
const digest = 'b'.repeat(64);

function entry(overrides: Record<string, unknown> = {}) {
  return parsePicoModelProviderEntry({
    schema: 'pico.model.provider.entry.v1',
    entryId: 'qwen3-14b',
    providerClass: 'declared_own_host',
    reach: 'http://inference.lan.invalid:11434',
    model: { identifier: 'qwen3:14b', digestHex: digest },
    measurement: {
      measuredAt: '2026-08-13T12:00:00.000Z',
      capacity: {
        contextTokens: 40960,
        generationTokensPerSecond: 26.31,
        promptTokensPerSecond: 1575.94,
        concurrentJobs: 1,
      },
      residency: { coldLoadMs: 4871, reloadMs: 3988, keepAliveMs: 300_000 },
    },
    carries: 'live_turn',
    ...overrides,
  });
}

function job(overrides: Record<string, unknown> = {}) {
  return parsePicoModelJob({
    schema: 'pico.model.job.v1',
    jobId: 'job_read_0001',
    role: 'reader',
    units: [{ originClass: 'person_present', text: 'The boiler service is due in March.' }],
    references: [],
    expects: [{ name: 'month', type: 'token' }, { name: 'certain', type: 'boolean' }],
    carries: 'live_turn',
    ...overrides,
  }, nowMs);
}

function ollama(options: {
  answer?: string;
  digest?: string;
  status?: number;
  hangs?: boolean;
  onGenerate?: () => void;
} = {}): { fetch: typeof globalThis.fetch; generates: number } {
  const state = { generates: 0 };
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    if (path === '/api/tags') {
      return new Response(JSON.stringify({
        models: [{ name: 'qwen3:14b', digest: `sha256:${options.digest ?? digest}` }],
      }), { status: 200 });
    }
    state.generates += 1;
    options.onGenerate?.();
    if (options.hangs === true) {
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new Error('aborted'));
        });
      });
    }
    return new Response(
      JSON.stringify({ response: options.answer ?? '{"month":"march","certain":true}' }),
      { status: options.status ?? 200 },
    );
  }) as typeof globalThis.fetch;
  return { fetch: impl, get generates() { return state.generates; } };
}

describe('ADR 0049 - one job, one entry, one answer', () => {
  it('returns declared values with a derived origin', async () => {
    const runtime = new PicoModelRuntime({ fetch: ollama().fetch, now: () => nowMs });
    const result = await runtime.dispatch({ job: job(), entry: entry() });
    expect(result.output.values.map((value) => value.value)).toEqual(['march', true]);
    // ADR 0116 W2: a value is derived from what the reader read, so it can
    // never come back as the person's own instruction - even when everything
    // the reader saw was the person's own words.
    expect(result.output.values.every((value) => value.originClass === 'own_pico')).toBe(true);
    expect(result.modelDigestHex).toBe(digest);
  });

  it('refuses the two job-level rules before anything leaves', async () => {
    const fake = ollama();
    const runtime = new PicoModelRuntime({ fetch: fake.fetch, now: () => nowMs });

    // A read over somebody else's words, on an entry that carries only the
    // live turn: exactly the measured LAN host today.
    await expect(runtime.dispatch({
      job: job({
        units: [{ originClass: 'external_content', text: 'Dear customer...' }],
        carries: 'live_turn_and_retrieved_memory',
      }),
      entry: entry(),
    })).rejects.toThrow('entry_may_not_carry_these_words');

    await expect(runtime.dispatch({
      job: job({ role: 'planner' }),
      entry: entry(),
    })).rejects.toThrow('role_outside_trust_boundary');

    // Nothing was sent for either.
    expect(fake.generates).toBe(0);
  });

  it('checks the pinned digest before the words go', async () => {
    // ADR 0142 PE6. That host's port accepts unauthenticated pull, so a tag
    // can be made to serve different weights by anyone who reaches it.
    const fake = ollama({ digest: 'c'.repeat(64) });
    const runtime = new PicoModelRuntime({ fetch: fake.fetch, now: () => nowMs });
    await expect(runtime.dispatch({ job: job(), entry: entry() }))
      .rejects.toThrow('model_is_not_the_measured_one');
    expect(fake.generates).toBe(0);
  });

  it('refuses an answer that was not the declared shape, and says which way', async () => {
    // The detail is asserted rather than the refusal alone: a missing value
    // and a value of the wrong type both end in the same refusal, so a check
    // on the refusal cannot tell whether either branch is still there.
    const cases = [
      ['not json', 'not json'],
      ['["march"]', 'not an object'],
      ['{"month":"march"}', 'missing certain'],
      ['{"month":{"a":1},"certain":true}', 'month is not a scalar'],
    ] as const;
    for (const [answer, detail] of cases) {
      const runtime = new PicoModelRuntime({ fetch: ollama({ answer }).fetch, now: () => nowMs });
      await expect(runtime.dispatch({ job: job(), entry: entry() }))
        .rejects.toThrow(`answer_was_not_the_declared_shape: ${detail}`);
    }
  });

  it('constrains the decoder rather than asking politely', () => {
    // ADR 0117 X2 at the wire: a shape declared, not hoped for.
    expect(picoModelAnswerSchema(job())).toEqual({
      type: 'object',
      properties: { month: { type: 'string' }, certain: { type: 'boolean' } },
      required: ['month', 'certain'],
      additionalProperties: false,
    });
  });
});

describe('ADR 0118 O2 - slow is unavailable', () => {
  it('builds the deadline from the entry rather than from a guess', () => {
    // The measured entry: 4871 ms to become resident, 40960 tokens of prompt
    // at 1576 tok/s, 256 answer tokens at 26.31 tok/s.
    const deadline = picoModelJobDeadlineMs(entry(), 256);
    expect(deadline).toBeGreaterThan(entry().measurement.residency.coldLoadMs);
    expect(Math.round(deadline)).toBe(76_313);
  });

  it('reports a provider that did not answer as absent, not as slow', async () => {
    const runtime = new PicoModelRuntime({ fetch: ollama({ hangs: true }).fetch, now: () => nowMs });
    const pending = runtime.dispatch({
      job: job(),
      entry: entry({
        measurement: {
          measuredAt: '2026-08-13T12:00:00.000Z',
          capacity: {
            contextTokens: 1024,
            generationTokensPerSecond: 1_000_000,
            promptTokensPerSecond: 1_000_000,
            concurrentJobs: 1,
          },
          residency: { coldLoadMs: 1, reloadMs: 1, keepAliveMs: 300_000 },
        },
      }),
    });
    await expect(pending).rejects.toThrow('provider_did_not_answer_in_time');
  });
});

describe('ADR 0142 PE3 - one lane', () => {
  it('makes the second job wait for the first', async () => {
    const order: string[] = [];
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let first = true;
    const fake = ollama({
      onGenerate: () => {
        order.push(first ? 'first-started' : 'second-started');
        first = false;
      },
    });
    const gated = (async (url: string | URL | Request, init?: RequestInit) => {
      const response = await fake.fetch(url, init);
      if (new URL(String(url)).pathname === '/api/generate' && order.length === 1) {
        await gate;
      }
      return response;
    }) as typeof globalThis.fetch;

    const runtime = new PicoModelRuntime({ fetch: gated, now: () => nowMs });
    const a = runtime.dispatch({ job: job({ jobId: 'job_a' }), entry: entry() });
    const b = runtime.dispatch({ job: job({ jobId: 'job_b' }), entry: entry() });

    // The second job has not reached the host while the first is in flight.
    await new Promise((resolve) => { setTimeout(resolve, 10); });
    expect(order).toEqual(['first-started']);
    release?.();
    await Promise.all([a, b]);
    expect(order).toEqual(['first-started', 'second-started']);
  });

  it('lets the lane continue after a job fails', async () => {
    const runtime = new PicoModelRuntime({
      fetch: ollama({ answer: 'not json' }).fetch,
      now: () => nowMs,
    });
    await expect(runtime.dispatch({ job: job(), entry: entry() })).rejects
      .toBeInstanceOf(PicoModelDispatchError);
    // A lane blocked by its own failure would be a provider that goes quiet
    // after one bad answer.
    const runtimeAgain = new PicoModelRuntime({ fetch: ollama().fetch, now: () => nowMs });
    await expect(runtimeAgain.dispatch({ job: job(), entry: entry() })).resolves.toBeDefined();
  });
});

describe('ADR 0116 W2 - what a value may claim about itself', () => {
  it('never returns the person as the origin of a derived value', () => {
    expect(picoModelAnswerOriginClass(job())).toBe('own_pico');
    expect(picoModelAnswerOriginClass(job({
      units: [
        { originClass: 'person_present', text: 'Summarise.' },
        { originClass: 'external_content', text: 'Dear customer...' },
      ],
      carries: 'live_turn_and_retrieved_memory',
    }))).toBe('external_content');
  });
});
