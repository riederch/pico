import { describe, expect, it } from 'vitest';
import {
  PicoModelProviderMeasurer,
  picoModelProviderEntryFromMeasurement,
  type PicoModelProviderMeasurementReport,
} from './model-provider-measure.js';

/**
 * ADR 0142 PE2. The measurer against a host that answers like the real one.
 *
 * A fake rather than a recording, because what is being tested is the two
 * judgements the measurer makes on its own - which step's numbers reach the
 * entry, and whether two jobs shared a lane - and both need a host whose
 * answers can be arranged to disagree with the obvious reading.
 */
const ns = 1_000_000;

function ollama(options: {
  perStep?: Record<number, { evalRate: number; promptRate: number }>;
  /** A model that finishes early, which is what a real one does. */
  stopAfterTokens?: number;
} = {}): { fetch: typeof globalThis.fetch; calls: string[] } {
  const calls: string[] = [];
  const perStep = options.perStep ?? {
    4096: { evalRate: 18.4, promptRate: 1152 },
    8192: { evalRate: 17.8, promptRate: 980 },
  };

  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    calls.push(path);
    const json = (body: unknown) => new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

    if (path === '/api/version') {
      return json({ version: '0.32.7' });
    }
    if (path === '/api/tags') {
      return json({
        models: [{
          name: 'mistral-small:latest',
          digest: `sha256:${'c'.repeat(64)}`,
          details: { parameter_size: '23.6B', quantization_level: 'Q4_K_M' },
        }],
      });
    }
    if (path === '/api/ps') {
      return json({ models: [{ name: 'mistral-small:latest', size_vram: 14_334_000_000 }] });
    }
    if (path === '/api/show') {
      return json({
        capabilities: ['completion', 'tools'],
        model_info: { 'llama.context_length': 32768 },
      });
    }
    if (path === '/api/generate') {
      const body = JSON.parse(String(init?.body)) as {
        options?: { num_ctx?: number };
        keep_alive?: number | string;
      };
      const step = body.options?.num_ctx;
      if (step === undefined) {
        // The load probes: one-token answers whose only interesting field is
        // how long the model took to become resident.
        return json({
          load_duration: (body.keep_alive === 0 ? 0 : 8_000) * ns,
          eval_count: 1,
          eval_duration: 50 * ns,
          total_duration: 8_100 * ns,
        });
      }
      const rates = perStep[step] ?? { evalRate: 10, promptRate: 500 };
      const generated = options.stopAfterTokens ?? 64;
      return json({
        load_duration: 0,
        prompt_eval_count: step - 256,
        prompt_eval_duration: ((step - 256) / rates.promptRate) * 1_000 * ns,
        eval_count: generated,
        eval_duration: (generated / rates.evalRate) * 1_000 * ns,
        total_duration: 4_000 * ns,
      });
    }
    return new Response('not found', { status: 404 });
  }) as typeof globalThis.fetch;

  return { fetch: fetchImpl, calls };
}

/**
 * The clock is scripted rather than advancing on its own, because the lane
 * count is read from exactly four readings: before and after one job, then
 * before and after two. A clock that ticked uniformly could not express the
 * difference between a host that queues and one that does not - which is the
 * whole judgement under test.
 */
function measurer(
  overrides: Record<string, unknown> = {},
  fake = ollama(),
  timeline: readonly number[] = [0, 4_000, 4_000, 12_000],
) {
  const readings = [...timeline];
  let last = 0;
  return new PicoModelProviderMeasurer({
    reach: 'http://inference.lan.invalid:11434',
    model: 'mistral-small:latest',
    providerClass: 'declared_own_host',
    entryId: 'lan-mistral-small',
    fetch: fake.fetch,
    now: () => {
      last = readings.shift() ?? last;
      return last;
    },
    ...overrides,
  });
}

describe('ADR 0142 PE2 - measuring one deployment', () => {
  it('reports what the host does and what it claims, separately', async () => {
    const report = await measurer().measure();
    expect(report.serverVersion).toBe('0.32.7');
    expect(report.model.digestHex).toBe('c'.repeat(64));
    expect(report.nominalContextTokens).toBe(32768);
    expect(report.contextSteps.map((step) => step.requestedContextTokens)).toEqual([4096, 8192]);
    expect(report.contextSteps[0]!.generationTokensPerSecond).toBeCloseTo(18.4, 1);
    expect(report.capabilities).toEqual(['completion', 'tools']);
    expect(report.answeredWithoutCredential).toBe(true);
    // The declared figure is carried in the report and refused by the entry.
    expect(report.notes.join(' ')).toContain('32768');
  });

  it('says what it did not measure instead of leaving a gap', async () => {
    const report = await measurer().measure();
    expect(report.coldLoadMs).toBeNull();
    expect(report.notes.join(' ')).toContain('evicting the model');
  });

  it('observes a cold load only when told to evict', async () => {
    const fake = ollama();
    const report = await measurer({ measureColdLoad: true }, fake).measure();
    expect(report.coldLoadMs).toBe(8_000);
    // Two generate calls before any context step: the eviction and the load.
    expect(fake.calls.filter((path) => path === '/api/generate').length).toBeGreaterThan(4);
  });

  it('reads one lane from a baseline it measured alone', async () => {
    // One job takes 4 s and the pair takes 8: the second waited its full turn.
    const report = await measurer().measure();
    expect(report.concurrentJobs).toBe(1);
  });

  it('reads two lanes when the pair costs about what one does', async () => {
    const report = await measurer({}, ollama(), [0, 4_000, 4_000, 8_500]).measure();
    expect(report.concurrentJobs).toBe(2);
  });

  it('drops a step the model answered in a handful of tokens', async () => {
    // `num_predict` is a ceiling, never a target. A rate over two tokens is
    // startup cost, and the first version of this measurer reported it as
    // 32 tok/s against ADR 0142's 17.8 on the same host.
    const report = await measurer({}, ollama({ stopAfterTokens: 2 })).measure();
    expect(report.contextSteps).toHaveLength(0);
    expect(report.notes.join(' ')).toContain('below the 32-token floor');
  });
});

describe('ADR 0142 PE2 - what reaches the entry', () => {
  const base: PicoModelProviderMeasurementReport = Object.freeze({
    reach: 'http://inference.lan.invalid:11434',
    serverVersion: '0.32.7',
    model: {
      identifier: 'mistral-small:latest',
      digestHex: 'c'.repeat(64),
      parameterSize: '23.6B',
      quantization: 'Q4_K_M',
    },
    nominalContextTokens: 32768,
    capabilities: ['completion', 'tools'],
    contextSteps: [
      { requestedContextTokens: 4096, promptTokens: 3840, generationTokensPerSecond: 18.4, promptTokensPerSecond: 1152 },
      { requestedContextTokens: 8192, promptTokens: 7936, generationTokensPerSecond: 17.8, promptTokensPerSecond: 980 },
    ],
    coldLoadMs: 31_000,
    reloadMs: 8_000,
    keepAliveMs: 300_000,
    concurrentJobs: 1,
    residentBytes: 14_334_000_000,
    answeredWithoutCredential: true,
    notes: [],
  });

  it('states the slowest step it measured, not the fastest', () => {
    const entry = picoModelProviderEntryFromMeasurement(base, {
      entryId: 'lan-mistral-small',
      providerClass: 'declared_own_host',
      measuredAt: '2026-08-13T12:00:00.000Z',
    });
    // The 4k figure would describe the best case of a deployment that does not
    // stay in it. Generation falls on a slope with no detectable cliff.
    expect(entry.measurement.capacity.generationTokensPerSecond).toBe(17.8);
    expect(entry.measurement.capacity.promptTokensPerSecond).toBe(980);
    expect(entry.measurement.capacity.contextTokens).toBe(8192);
    expect(entry.carries).toBe('live_turn');
  });

  it('refuses to write an entry from a run that measured nothing', () => {
    expect(() => picoModelProviderEntryFromMeasurement({ ...base, contextSteps: [] }, {
      entryId: 'lan-mistral-small',
      providerClass: 'declared_own_host',
      measuredAt: '2026-08-13T12:00:00.000Z',
    })).toThrow('pico_model_provider_measured_no_context_step');

    expect(() => picoModelProviderEntryFromMeasurement({ ...base, coldLoadMs: null }, {
      entryId: 'lan-mistral-small',
      providerClass: 'declared_own_host',
      measuredAt: '2026-08-13T12:00:00.000Z',
    })).toThrow('pico_model_provider_measured_no_residency');
  });

  it('never carries the wider allowance out of a measurement', () => {
    // ADR 0151 PV1. Nothing observable grants it; a credential does, and no
    // credential was sent.
    const entry = picoModelProviderEntryFromMeasurement(base, {
      entryId: 'lan-mistral-small',
      providerClass: 'declared_own_host',
      measuredAt: '2026-08-13T12:00:00.000Z',
    });
    expect(entry.carries).toBe('live_turn');
    expect(entry.credentialRef).toBeUndefined();
  });
});
