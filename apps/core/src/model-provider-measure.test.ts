import { describe, expect, it } from 'vitest';
import {
  PicoModelProviderMeasurer,
  picoModelProviderEntryFromMeasurement,
  type PicoModelProviderMeasurementReport,
} from './model-provider-measure.js';

/**
 * ADR 0142 PE2. The measurer against a host that answers like a provider.
 *
 * **No vendor appears here on purpose.** ADR 0036's first paragraph asks that
 * Pico not become architecturally dependent on one protocol, and a test suite
 * written against one product's endpoints is how that dependency arrives
 * without anybody deciding it. The fake answers the shape the adapter speaks;
 * which implementation speaks it is not this suite's subject.
 *
 * A fake rather than a recording, because what is being tested is the two
 * judgements the measurer makes on its own - which step's numbers reach the
 * entry, and whether two jobs shared a lane - and both need a host whose
 * answers can be arranged to disagree with the obvious reading.
 */
const ns = 1_000_000;

function modelHost(options: {
  perStep?: Record<number, { evalRate: number; promptRate: number }>;
  /** A model that finishes early, which is what a real one does. */
  stopAfterTokens?: number;
  /** The width from which the host stops keeping it all on the card. */
  spillsFromTokens?: number;
  /** Another model holding the accelerator when the run starts. */
  foreignResident?: string;
  /**
   * ADR 0151 PV1. The one bearer this host answers, if it reads any.
   *
   * Everything else is 401 - a wrong one, and a request carrying none - which
   * is the deployment an authenticating proxy in front of an open runtime
   * actually produces.
   */
  credential?: string;
} = {}): { fetch: typeof globalThis.fetch; calls: string[] } {
  const calls: string[] = [];
  const evicted = new Set<string>();
  let lastContextTokens = 0;
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

    if (options.credential !== undefined) {
      const sent = (init?.headers as Record<string, string> | undefined)?.authorization;
      if (sent !== `Bearer ${options.credential}`) {
        return new Response('{}', { status: 401 });
      }
    }

    if (path === '/api/version') {
      return json({ version: '0.32.7' });
    }
    if (path === '/api/tags') {
      return json({
        models: [{
          name: 'a-model:measured',
          digest: `sha256:${'c'.repeat(64)}`,
          details: { parameter_size: '23.6B', quantization_level: 'Q4_K_M' },
        }],
      });
    }
    if (path === '/api/ps') {
      if (options.foreignResident !== undefined && !evicted.has(options.foreignResident)) {
        return json({
          models: [{
            name: options.foreignResident,
            size: 9_000_000_000,
            size_vram: 9_000_000_000,
          }],
        });
      }
      // `size` is the whole deployment and `size_vram` the part on the card.
      // Below the spill width they are equal; above it the host keeps some
      // off, and says so.
      const spilled = options.spillsFromTokens !== undefined
        && lastContextTokens >= options.spillsFromTokens;
      return json({
        models: [{
          name: 'a-model:measured',
          size: 14_334_000_000,
          size_vram: spilled ? 9_000_000_000 : 14_334_000_000,
        }],
      });
    }
    if (path === '/api/show') {
      return json({
        capabilities: ['completion', 'tools'],
        model_info: {
          'llama.context_length': 32768,
          'llama.block_count': 40,
          'llama.attention.head_count_kv': 8,
          'llama.attention.key_length': 128,
          'llama.attention.value_length': 128,
        },
      });
    }
    if (path === '/api/generate') {
      const body = JSON.parse(String(init?.body)) as {
        model?: string;
        prompt?: string;
        options?: { num_ctx?: number };
        keep_alive?: number | string;
      };
      if (body.prompt === undefined && body.keep_alive === 0 && body.model !== undefined) {
        evicted.add(body.model);
        return json({ done: true });
      }
      const step = body.options?.num_ctx;
      if (step !== undefined) {
        lastContextTokens = step;
      }
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
  fake = modelHost(),
  timeline: readonly number[] = [0, 4_000, 4_000, 12_000],
) {
  const readings = [...timeline];
  let last = 0;
  return new PicoModelProviderMeasurer({
    reach: 'http://provider.invalid:11434',
    model: 'a-model:measured',
    providerClass: 'declared_own_host',
    entryId: 'a-measured-host',
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
    const fake = modelHost();
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
    const report = await measurer({}, modelHost(), [0, 4_000, 4_000, 8_500]).measure();
    expect(report.concurrentJobs).toBe(2);
  });

  it('takes the accelerator before it measures anything', async () => {
    // A 14B model once reported 3.4 tok/s at a narrow window and 28.2 at a
    // wide one - impossible, and the tell that another model had been holding
    // the card for the first figure.
    const fake = modelHost({ foreignResident: 'another-model:resident' });
    const report = await measurer({}, fake).measure();
    expect(report.notes.join(' ')).toContain('another-model:resident was resident');
    expect(report.notes.join(' ')).toContain('sharing its accelerator is a different deployment');
    // Evicted before the model was even looked up, so nothing was measured
    // against a shared card.
    expect(fake.calls.indexOf('/api/generate')).toBeLessThan(fake.calls.indexOf('/api/tags'));
  });

  it('notices a host that answers a credential that cannot be right', async () => {
    // ADR 0151 PV5 checks that a transport protects a credential. Nothing in
    // the tree can check that the far side reads one - an entry pointed at a
    // proxy that answers any bearer passes every rule and still claims a proof
    // nobody gave. One request tells.
    const report = await measurer().measure();
    expect(report.refusesAWrongCredential).toBe(false);
    expect(report.notes.join(' ')).toContain('would say a provider proved');
  });

  it('prices the declared window against the one it serves', async () => {
    // The finding this replaced a broken probe with: at a constant prompt, a
    // wider declared window costs throughput. `size_vram` never moved on the
    // real host, so the spill check found nothing; a stopwatch does.
    const report = await measurer({}, modelHost({
      perStep: {
        4096: { evalRate: 18.4, promptRate: 1152 },
        8192: { evalRate: 18.0, promptRate: 980 },
        32768: { evalRate: 9.5, promptRate: 700 },
      },
    })).measure();
    expect(report.kvBytesPerToken).toBe(81_920);
    expect(report.windowCost?.atServedTokens).toBe(8192);
    expect(report.windowCost?.atNominalTokens).toBe(32768);
    expect(report.windowCost!.nominalTokensPerSecond)
      .toBeLessThan(report.windowCost!.servedTokensPerSecond * 0.7);
    expect(report.notes.join(' ')).toContain('a price every job pays');
  });

  it('walks up to the widest window that costs nothing', async () => {
    // Free to 16384 and priced above it. ADR 0142 stated 8192 on this host and
    // a walk found 12288 at the same speed - half a window left unused because
    // the figure was reasoned rather than measured.
    const report = await measurer({}, modelHost({
      perStep: {
        4096: { evalRate: 18.2, promptRate: 1152 },
        8192: { evalRate: 18.2, promptRate: 980 },
        16384: { evalRate: 18.2, promptRate: 900 },
        32768: { evalRate: 9.9, promptRate: 700 },
      },
    })).measure();
    expect(report.widestFreeWindowTokens).toBe(16384);
    expect(report.notes.join(' ')).toContain('would leave that free');
  });

  it('drops a step the model answered in a handful of tokens', async () => {
    // `num_predict` is a ceiling, never a target. A rate over two tokens is
    // startup cost, and the first version of this measurer reported it as
    // 32 tok/s against ADR 0142's 17.8 on the same host.
    const report = await measurer({}, modelHost({ stopAfterTokens: 2 })).measure();
    expect(report.contextSteps).toHaveLength(0);
    expect(report.notes.join(' ')).toContain('below the 32-token floor');
  });
});

describe('ADR 0142 PE2 - what reaches the entry', () => {
  const base: PicoModelProviderMeasurementReport = Object.freeze({
    reach: 'http://provider.invalid:11434',
    serverVersion: '0.32.7',
    model: {
      identifier: 'a-model:measured',
      digestHex: 'c'.repeat(64),
      parameterSize: '23.6B',
      quantization: 'Q4_K_M',
    },
    nominalContextTokens: 32768,
    capabilities: ['completion', 'tools'],
    contextSteps: [
      { requestedContextTokens: 4096, promptTokens: 3840, generationTokensPerSecond: 18.4, promptTokensPerSecond: 1152, fullyOnAccelerator: true },
      { requestedContextTokens: 8192, promptTokens: 7936, generationTokensPerSecond: 17.8, promptTokensPerSecond: 980, fullyOnAccelerator: true },
    ],
    coldLoadMs: 31_000,
    reloadMs: 8_000,
    keepAliveMs: 300_000,
    concurrentJobs: 1,
    residentBytes: 14_334_000_000,
    spilledFromTokens: null,
    kvBytesPerToken: 81_920,
    windowCost: null,
    widestFreeWindowTokens: null,
    widestFreeWindowTokensPerSecond: null,
    answeredWithoutCredential: true,
    refusesAWrongCredential: false,
    notes: [],
  });

  it('states the slowest step it measured, not the fastest', () => {
    const entry = picoModelProviderEntryFromMeasurement(base, {
      entryId: 'a-measured-host',
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

  it('never states a width the deployment did not fit into', () => {
    const spilled = {
      ...base,
      contextSteps: [
        { ...base.contextSteps[0]!, fullyOnAccelerator: true },
        { ...base.contextSteps[1]!, fullyOnAccelerator: false },
      ],
      spilledFromTokens: 8192,
    };
    const entry = picoModelProviderEntryFromMeasurement(spilled, {
      entryId: 'a-measured-host',
      providerClass: 'declared_own_host',
      measuredAt: '2026-08-13T12:00:00.000Z',
    });
    // 8192 was observed and is not what this host serves.
    expect(entry.measurement.capacity.contextTokens).toBe(4096);
    expect(entry.measurement.capacity.generationTokensPerSecond).toBe(18.4);
  });

  it('refuses to write an entry from a run that measured nothing', () => {
    expect(() => picoModelProviderEntryFromMeasurement({ ...base, contextSteps: [] }, {
      entryId: 'a-measured-host',
      providerClass: 'declared_own_host',
      measuredAt: '2026-08-13T12:00:00.000Z',
    })).toThrow('pico_model_provider_measured_no_context_step');

    expect(() => picoModelProviderEntryFromMeasurement({ ...base, coldLoadMs: null }, {
      entryId: 'a-measured-host',
      providerClass: 'declared_own_host',
      measuredAt: '2026-08-13T12:00:00.000Z',
    })).toThrow('pico_model_provider_measured_no_residency');
  });

  it('never carries the wider allowance out of a measurement', () => {
    // ADR 0151 PV1. Nothing observable grants it, and that includes the best
    // observation there is: a host that refused a credential that cannot be
    // right and refused a request carrying none. The proof is real and
    // spending it is somebody's decision, not a measurer's.
    const proven = {
      ...base,
      answeredWithoutCredential: false,
      refusesAWrongCredential: true,
    } satisfies PicoModelProviderMeasurementReport;
    for (const report of [base, proven]) {
      const entry = picoModelProviderEntryFromMeasurement(report, {
        entryId: 'a-measured-host',
        providerClass: 'declared_own_host',
        measuredAt: '2026-08-13T12:00:00.000Z',
      });
      expect(entry.carries).toBe('live_turn');
      expect(entry.credentialRef).toBeUndefined();
    }
  });
});

/**
 * ADR 0151 PV1, the half that was unreachable until a host was secured.
 *
 * The measurer sent no credential and could not have: `answeredWithoutCredential`
 * was the constant `true`, which restated the run having got that far. Once an
 * authenticating proxy stands in front of the runtime, that constant describes
 * a host nobody is talking to and every probe comes back 401 - so measuring the
 * deployment at all means measuring it the way a job reaches it.
 */
describe('ADR 0151 PV1 - measuring a host that reads a credential', () => {
  it('measures the deployment when it carries the credential a job would', async () => {
    const fake = modelHost({ credential: 'the-one-the-proxy-issued' });
    const report = await measurer({ credential: 'the-one-the-proxy-issued' }, fake).measure();

    // The whole point: capacity, not a 401.
    expect(report.serverVersion).toBe('0.32.7');
    expect(report.contextSteps[0]!.generationTokensPerSecond).toBeCloseTo(18.4, 1);
    // And the two findings that a decision at ADR 0152's surface needs.
    expect(report.answeredWithoutCredential).toBe(false);
    expect(report.refusesAWrongCredential).toBe(true);
    expect(report.notes.join(' ')).not.toContain('distinguishes it from nobody');
  });

  it('measures nothing at all without it, and says which probe was refused', async () => {
    await expect(measurer({}, modelHost({ credential: 'the-one-the-proxy-issued' })).measure())
      .rejects.toThrow('pico_model_provider_probe_failed:/api/version:401');
  });

  it('says so when the credential it sent distinguishes it from nobody', async () => {
    // The hole ADR 0151 recorded on 2026-08-14, from the other side: a proxy
    // that answers whatever it is handed. An entry pointed here would satisfy
    // every rule in the tree and claim a proof nobody gave.
    const report = await measurer({ credential: 'sent-but-never-read' }).measure();
    expect(report.answeredWithoutCredential).toBe(true);
    expect(report.refusesAWrongCredential).toBe(false);
    expect(report.notes.join(' ')).toContain('distinguishes it from nobody');
  });

  it('reports a bare request it could not read as neither answered nor refused', async () => {
    const fake = modelHost();
    const guarded = ((url: string | URL | Request, init?: RequestInit) => {
      const bare = (init?.headers as Record<string, string> | undefined)?.authorization;
      if (new URL(String(url)).pathname === '/api/version' && bare === undefined) {
        return Promise.resolve(new Response('busy', { status: 503 }));
      }
      return fake.fetch(url as string, init);
    }) as typeof globalThis.fetch;

    const report = await measurer({ credential: 'a-credential', fetch: guarded }).measure();
    expect(report.answeredWithoutCredential).toBeNull();
    expect(report.notes.join(' ')).toContain('PE5 went unmeasured');
  });
});
