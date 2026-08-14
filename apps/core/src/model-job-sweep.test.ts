import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { parsePicoModelProviderEntry } from '@pico/protocol/model-provider';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app.js';
import { EventStore } from './event-store.js';
import { picoLibraryReadJob } from './library-read.js';

/**
 * ADR 0049 with ADR 0142 PE3. The thing that actually runs jobs, which had no
 * test at all.
 *
 * Every piece below it was covered - the queue, the runtime, the lanes, the
 * entry contract - and the arrangement that joins them was not: what happens
 * when nobody decided, which refusals settle and which wait, and how many jobs
 * one tick may start. The last of those was the reason to look: PE3's measured
 * lane count was stored, shown, and used by nothing, because a sweep that took
 * one job per tick drained a two-lane provider exactly like a one-lane one.
 */
const dirs: string[] = [];
const apps: Array<{ close(): Promise<void> }> = [];

afterEach(async () => {
  for (const app of apps.splice(0)) {
    await app.close();
  }
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  vi.unstubAllGlobals();
});

const digest = 'b'.repeat(64);
const person = 'a'.repeat(64);

function measured(overrides: { entryId?: string; concurrentJobs?: number } = {}) {
  return {
    schema: 'pico.model.provider.entry.v1',
    entryId: overrides.entryId ?? 'a-measured-host',
    providerClass: 'declared_own_host',
    // ADR 0151 PV5. A credential obliges a transport that protects it, so the
    // entry a library read can run on is an https one.
    reach: 'https://provider.invalid',
    model: { identifier: 'a-model:measured', digestHex: digest },
    measurement: {
      measuredAt: '2026-08-13T17:43:04.923Z',
      capacity: {
        contextTokens: 40960,
        generationTokensPerSecond: 26.31,
        promptTokensPerSecond: 1575.94,
        concurrentJobs: overrides.concurrentJobs ?? 1,
      },
      residency: { coldLoadMs: 4871, reloadMs: 3988, keepAliveMs: 300_000 },
    },
    carries: 'live_turn',
  } as const;
}

/** A provider host that answers, and counts how many calls overlap. */
function modelHost(options: { hold?: Promise<void> } = {}): {
  fetch: typeof globalThis.fetch;
  concurrentPeak: () => number;
  generated: () => number;
} {
  let inFlight = 0;
  let peak = 0;
  let generated = 0;
  const fetchImpl = async (url: string | URL | Request): Promise<Response> => {
    const path = new URL(String(url)).pathname;
    if (path === '/api/tags') {
      return new Response(JSON.stringify({
        models: [{ name: 'a-model:measured', digest: `sha256:${digest}` }],
      }), { status: 200 });
    }
    generated += 1;
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    try {
      if (options.hold !== undefined) {
        await options.hold;
      }
      return new Response(JSON.stringify({
        response: JSON.stringify({ topic: 'a-topic', summary: 'a summary' }),
      }), { status: 200 });
    } finally {
      inFlight -= 1;
    }
  };
  return {
    fetch: fetchImpl as unknown as typeof globalThis.fetch,
    concurrentPeak: () => peak,
    generated: () => generated,
  };
}

interface AppWithSweep {
  picoSweepModelJobs(): Promise<number>;
  close(): Promise<void>;
}

async function boot(input: {
  entries: ReadonlyArray<{ entryId?: string; concurrentJobs?: number }>;
  decided?: boolean;
  jobs: ReadonlyArray<{ jobId: string; entryId: string }>;
}): Promise<{ app: AppWithSweep; databasePath: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'pico-model-sweep-'));
  dirs.push(dir);
  const databasePath = join(dir, 'pico.sqlite');

  const store = await EventStore.open(databasePath, {});
  const registry = store.picoModelProviderRegistry();
  for (const entry of input.entries) {
    registry.put(parsePicoModelProviderEntry(measured(entry)), '2026-08-13T18:00:00.000Z');
  }
  if (input.decided !== false) {
    const consent = store.picoModelProviderConsent();
    for (const entry of input.entries) {
      consent.decide({
        entryId: entry.entryId ?? 'a-measured-host',
        picoIdentityFingerprintHex: person,
        providerClass: 'declared_own_host',
        // A library read carries retrieved memory by construction, so the
        // decision that lets it run is the wider one - and ADR 0151 PV4 makes
        // that unwritable without the reference that earns it.
        carries: 'live_turn_and_retrieved_memory',
        credentialRef: 'a_credential_reference',
        at: '2026-08-13T19:00:00.000Z',
      });
    }
  }
  const queue = store.picoModelJobQueue();
  for (const [index, job] of input.jobs.entries()) {
    queue.enqueue({
      job: picoLibraryReadJob({
        jobId: job.jobId,
        contextRefId: `ref_${job.jobId}`,
        privacyDomain: 'household',
        excerpt: { path: `${job.jobId}.md`, text: 'contents', commit: 'a'.repeat(40) },
        expects: [{ name: 'topic', type: 'token' }, { name: 'summary', type: 'text' }],
        question: 'What is this document about?',
        nowMs: Date.now(),
      }),
      picoIdentityFingerprintHex: person,
      entryId: job.entryId,
      // Enqueued in order, so "oldest first" is a fact this test can rely on.
      at: new Date(Date.parse('2026-08-14T12:00:00.000Z') + index * 1_000).toISOString(),
      derivedFrom: {
        supplierIdentifier: 'a-library',
        commit: 'a'.repeat(40),
        pinCoversContent: true,
      },
    });
  }
  store.close();

  const app = await buildApp({
    host: '127.0.0.1',
    port: 0,
    databasePath,
    deviceId: 'pico-core',
    logDestination: new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    }),
  }) as unknown as AppWithSweep;
  apps.push(app);
  return { app, databasePath };
}

function outcomes(databasePath: string): Record<string, string | null> {
  const store = new EventStore(databasePath);
  const queue = store.picoModelJobQueue();
  const rows = ['job_one', 'job_two', 'job_three'].reduce<Record<string, string | null>>(
    (all, jobId) => ({ ...all, [jobId]: queue.outcomeOf(jobId).outcome }),
    {},
  );
  store.close();
  return rows;
}

describe('ADR 0142 PE3 - a tick fills the lanes the entry measured', () => {
  it('runs two at once on a two-lane entry', async () => {
    // The number was stored, shown and used by nothing: one job per tick made
    // a two-lane provider drain exactly like a one-lane one.
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const host = modelHost({ hold: held });
    vi.stubGlobal('fetch', host.fetch);

    const { app, databasePath } = await boot({
      entries: [{ concurrentJobs: 2 }],
      jobs: [
        { jobId: 'job_one', entryId: 'a-measured-host' },
        { jobId: 'job_two', entryId: 'a-measured-host' },
        { jobId: 'job_three', entryId: 'a-measured-host' },
      ],
    });

    const sweeping = app.picoSweepModelJobs();
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    release?.();
    expect(await sweeping).toBe(2);

    // Two ran, together, and the third was left for the next tick.
    expect(host.concurrentPeak()).toBe(2);
    expect(outcomes(databasePath)).toEqual({
      job_one: 'answered',
      job_two: 'answered',
      job_three: null,
    });
  });

  it('runs one at a time on a one-lane entry', async () => {
    const host = modelHost();
    vi.stubGlobal('fetch', host.fetch);

    const { app, databasePath } = await boot({
      entries: [{}],
      jobs: [
        { jobId: 'job_one', entryId: 'a-measured-host' },
        { jobId: 'job_two', entryId: 'a-measured-host' },
      ],
    });

    expect(await app.picoSweepModelJobs()).toBe(1);
    expect(host.concurrentPeak()).toBe(1);
    expect(outcomes(databasePath).job_two).toBeNull();
  });

  it('does not pull another provider\'s job into the batch', async () => {
    // The lane count is a property of one deployment. Letting another entry's
    // waiting job join would make it depend on what else happens to be queued.
    const host = modelHost();
    vi.stubGlobal('fetch', host.fetch);

    const { app, databasePath } = await boot({
      entries: [{ concurrentJobs: 2 }, { entryId: 'another-host', concurrentJobs: 2 }],
      jobs: [
        { jobId: 'job_one', entryId: 'a-measured-host' },
        { jobId: 'job_two', entryId: 'another-host' },
      ],
    });

    expect(await app.picoSweepModelJobs()).toBe(1);
    expect(outcomes(databasePath)).toEqual({
      job_one: 'answered',
      job_two: null,
      job_three: null,
    });
  });
});

describe('ADR 0138 - a job nobody decided for', () => {
  it('settles rather than waiting for somebody to change their mind', async () => {
    // Reaching outside is off until somebody says so. A queue that held the
    // job would be holding it against a decision already made.
    vi.stubGlobal('fetch', modelHost().fetch);

    const { app, databasePath } = await boot({
      entries: [{}],
      decided: false,
      jobs: [{ jobId: 'job_one', entryId: 'a-measured-host' }],
    });

    expect(await app.picoSweepModelJobs()).toBe(0);
    expect(outcomes(databasePath).job_one).toBe('no_decision_for_this_entry');
  });

  it('settles an undecided job without giving up the tick', async () => {
    // One person's undecided job in the middle of a batch must not cost the
    // other jobs their turn.
    const host = modelHost();
    vi.stubGlobal('fetch', host.fetch);

    const dir = mkdtempSync(join(tmpdir(), 'pico-model-sweep-mixed-'));
    dirs.push(dir);
    const databasePath = join(dir, 'pico.sqlite');
    const store = await EventStore.open(databasePath, {});
    store.picoModelProviderRegistry()
      .put(parsePicoModelProviderEntry(measured({ concurrentJobs: 2 })), '2026-08-13T18:00:00.000Z');
    store.picoModelProviderConsent().decide({
      entryId: 'a-measured-host',
      picoIdentityFingerprintHex: person,
      providerClass: 'declared_own_host',
      carries: 'live_turn_and_retrieved_memory',
      credentialRef: 'a_credential_reference',
      at: '2026-08-13T19:00:00.000Z',
    });
    const queue = store.picoModelJobQueue();
    for (const [index, job] of [
      { jobId: 'job_one', who: 'c'.repeat(64) },
      { jobId: 'job_two', who: person },
    ].entries()) {
      queue.enqueue({
        job: picoLibraryReadJob({
          jobId: job.jobId,
          contextRefId: `ref_${job.jobId}`,
          privacyDomain: 'household',
          excerpt: { path: `${job.jobId}.md`, text: 'contents', commit: 'a'.repeat(40) },
          expects: [{ name: 'topic', type: 'token' }, { name: 'summary', type: 'text' }],
          question: 'What is this document about?',
          nowMs: Date.now(),
        }),
        picoIdentityFingerprintHex: job.who,
        entryId: 'a-measured-host',
        at: new Date(Date.parse('2026-08-14T12:00:00.000Z') + index * 1_000).toISOString(),
        derivedFrom: {
          supplierIdentifier: 'a-library',
          commit: 'a'.repeat(40),
          pinCoversContent: true,
        },
      });
    }
    store.close();

    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath,
      deviceId: 'pico-core',
      logDestination: new Writable({
        write(_chunk, _encoding, callback) {
          callback();
        },
      }),
    }) as unknown as AppWithSweep;
    apps.push(app);

    expect(await app.picoSweepModelJobs()).toBe(1);
    expect(outcomes(databasePath)).toEqual({
      // The first belongs to somebody who decided nothing about this entry.
      job_one: 'no_decision_for_this_entry',
      job_two: 'answered',
      job_three: null,
    });
  });
});

describe('ADR 0049 - what a tick settles and what it leaves', () => {
  it('leaves a job pending when the provider could not be reached', async () => {
    // The world may be different in six minutes; whose words these are will
    // not be.
    vi.stubGlobal('fetch', (async () => {
      throw new Error('connection refused');
    }) as unknown as typeof globalThis.fetch);

    const { app, databasePath } = await boot({
      entries: [{}],
      jobs: [{ jobId: 'job_one', entryId: 'a-measured-host' }],
    });

    expect(await app.picoSweepModelJobs()).toBe(0);
    expect(outcomes(databasePath).job_one).toBeNull();
  });

  it('settles a job whose answer was not the declared shape', async () => {
    // About this job's contract rather than about the world, so retrying it
    // would be asking the same question and getting the same answer forever.
    vi.stubGlobal('fetch', (async (url: string | URL | Request) => {
      if (new URL(String(url)).pathname === '/api/tags') {
        return new Response(JSON.stringify({
          models: [{ name: 'a-model:measured', digest: `sha256:${digest}` }],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ response: 'not json at all' }), { status: 200 });
    }) as unknown as typeof globalThis.fetch);

    const { app, databasePath } = await boot({
      entries: [{}],
      jobs: [{ jobId: 'job_one', entryId: 'a-measured-host' }],
    });

    expect(await app.picoSweepModelJobs()).toBe(0);
    expect(outcomes(databasePath).job_one).toBe('answer_was_not_the_declared_shape');
  });

  it('answers nothing and settles nothing on an empty queue', async () => {
    vi.stubGlobal('fetch', modelHost().fetch);
    const { app } = await boot({ entries: [{}], jobs: [] });
    expect(await app.picoSweepModelJobs()).toBe(0);
  });
});

describe('ADR 0117 X2 - a value the protocol refuses is a wrong answer', () => {
  it('settles rather than retrying a token that is not a token', async () => {
    // Well-shaped JSON with a space in a `token` is not a bad afternoon, it is
    // a wrong answer - and it used to escape as a plain error, which the queue
    // reads as the world failing. The same provider would answer the same
    // question the same way forever, on a job that could never settle.
    vi.stubGlobal('fetch', (async (url: string | URL | Request) => {
      if (new URL(String(url)).pathname === '/api/tags') {
        return new Response(JSON.stringify({
          models: [{ name: 'a-model:measured', digest: `sha256:${digest}` }],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        response: JSON.stringify({ topic: 'not a single token', summary: 'a summary' }),
      }), { status: 200 });
    }) as unknown as typeof globalThis.fetch);

    const { app, databasePath } = await boot({
      entries: [{}],
      jobs: [{ jobId: 'job_one', entryId: 'a-measured-host' }],
    });

    expect(await app.picoSweepModelJobs()).toBe(0);
    expect(outcomes(databasePath).job_one).toBe('answer_was_not_the_declared_shape');
  });
});
