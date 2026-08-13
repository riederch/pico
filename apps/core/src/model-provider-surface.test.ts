import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { parsePicoModelProviderEntry } from '@pico/protocol/model-provider';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { EventStore } from './event-store.js';

/**
 * ADR 0152 SE1/SE3/SE4/SE5, at the surface that serves them.
 *
 * The route is the Home-infrastructure half: which machine computes here,
 * configured by whoever administers the instance, in the same access class as
 * a retention policy. The per-person half - consent and allowance - is a
 * different surface and deliberately not this route.
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
});

const measured = {
  schema: 'pico.model.provider.entry.v1',
  entryId: 'qwen3-14b',
  providerClass: 'declared_own_host',
  reach: 'http://inference.lan.invalid:11434',
  model: { identifier: 'qwen3:14b', digestHex: 'b'.repeat(64) },
  measurement: {
    measuredAt: '2026-08-13T17:43:04.923Z',
    capacity: {
      contextTokens: 40960,
      generationTokensPerSecond: 26.31,
      promptTokensPerSecond: 1575.94,
      concurrentJobs: 1,
    },
    residency: { coldLoadMs: 4871, reloadMs: 3988, keepAliveMs: 300_000 },
  },
  carries: 'live_turn',
} as const;

interface AppWithInject {
  inject(request: {
    method: string;
    url: string;
    payload?: unknown;
    headers?: Record<string, string>;
  }): Promise<{ statusCode: number; json(): unknown }>;
  close(): Promise<void>;
}

async function bootWithEntry(): Promise<{ app: AppWithInject; operator: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'pico-provider-surface-'));
  dirs.push(dir);
  const databasePath = join(dir, 'pico.sqlite');

  const store = await EventStore.open(databasePath, {});
  store.picoModelProviderRegistry().put(
    parsePicoModelProviderEntry(measured),
    '2026-08-13T18:00:00.000Z',
  );
  store.close();

  const logLines: string[] = [];
  const app = await buildApp({
    host: '127.0.0.1',
    port: 0,
    databasePath,
    deviceId: 'pico-core',
    logDestination: new Writable({
      write(chunk: Buffer, _encoding, callback) {
        logLines.push(chunk.toString('utf8'));
        callback();
      },
    }),
  }) as unknown as AppWithInject;
  apps.push(app);

  const bootstrapCode = logLines
    .map((line) => JSON.parse(line) as { operatorBootstrapCode?: string })
    .find((line) => typeof line.operatorBootstrapCode === 'string')?.operatorBootstrapCode;
  await app.inject({
    method: 'POST',
    url: '/api/auth/bootstrap',
    payload: { bootstrapCode, passphrase: 'provider surface passphrase' },
  });
  const session = (await app.inject({
    method: 'POST',
    url: '/api/auth/session',
    payload: { passphrase: 'provider surface passphrase' },
  })).json() as { session: string };

  return { app, operator: `Bearer ${session.session}` };
}

describe('ADR 0152 - the surface says the consequence and shows the measurement', () => {
  it('leads with what the provider sees, in words', async () => {
    const { app, operator } = await bootWithEntry();
    const body = (await app.inject({
      method: 'GET',
      url: '/api/model/providers',
      headers: { authorization: operator },
    })).json() as { providers: Array<Record<string, unknown>> };

    const provider = body.providers[0]!;
    // SE1. The consequence, before any number.
    expect(provider.sees).toBe('this conversation only');
    // SE1's quiet outcome, named where the choice is made rather than in help.
    expect(provider.needsCredentialToSeeMore).toBe(true);
    // SE3. The measurement is visible, with the moment it was taken.
    expect((provider.measured as Record<string, unknown>).at).toBe('2026-08-13T17:43:04.923Z');
    expect((provider.measured as Record<string, unknown>).contextTokens).toBe(40960);
    expect((provider.measured as Record<string, unknown>).modelDigestHex).toBe('b'.repeat(64));
  });

  it('refuses a widening with the number it was measured against', async () => {
    // SE4 with ADR 0119 Q5. "Too large" without the measurement is a person
    // guessing at what would fit.
    const { app, operator } = await bootWithEntry();
    const response = await app.inject({
      method: 'POST',
      url: '/api/model/providers/qwen3-14b/narrowing',
      headers: { authorization: operator },
      payload: { contextTokens: 65536 },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'context_wider_than_measured', measured: 40960 });
  });

  it('accepts a narrowing and shows both readings afterwards', async () => {
    const { app, operator } = await bootWithEntry();
    expect((await app.inject({
      method: 'POST',
      url: '/api/model/providers/qwen3-14b/narrowing',
      headers: { authorization: operator },
      payload: { contextTokens: 12288 },
    })).statusCode).toBe(200);

    const provider = ((await app.inject({
      method: 'GET',
      url: '/api/model/providers',
      headers: { authorization: operator },
    })).json() as { providers: Array<Record<string, unknown>> }).providers[0]!;

    // SE3. What this host did, and what this person asked for, side by side.
    expect((provider.measured as Record<string, unknown>).contextTokens).toBe(40960);
    expect((provider.narrowing as Record<string, unknown>).contextTokens).toBe(12288);
    expect((provider.effective as Record<string, unknown>).contextTokens).toBe(12288);
  });

  it('is not reachable without an operator session', async () => {
    // ADR 0075 A2/A3. A Foundation route without an access class must not
    // become routable, and this one is `host-admin` like a retention policy.
    const { app } = await bootWithEntry();
    expect((await app.inject({ method: 'GET', url: '/api/model/providers' })).statusCode)
      .toBe(401);
    expect((await app.inject({
      method: 'POST',
      url: '/api/model/providers/qwen3-14b/narrowing',
      payload: { contextTokens: 8192 },
    })).statusCode).toBe(401);
  });

  it('refuses a narrowing that is not a whole number of tokens', async () => {
    const { app, operator } = await bootWithEntry();
    expect((await app.inject({
      method: 'POST',
      url: '/api/model/providers/qwen3-14b/narrowing',
      headers: { authorization: operator },
      payload: { contextTokens: 'lots' },
    })).statusCode).toBe(400);
  });
});
