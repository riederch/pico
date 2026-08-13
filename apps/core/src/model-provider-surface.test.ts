import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { parsePicoModelProviderEntry } from '@pico/protocol/model-provider';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { EventStore } from './event-store.js';
import { openPicoHomeWithDevice, sendPicoLinkDirectRequest } from './test-claimed-home.js';

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

describe('ADR 0152 - the personal half is a person\'s, and the operator is not one', () => {
  async function bootWithPerson(): Promise<{
    app: AppWithInject;
    operator: string;
    person: string;
  }> {
    const dir = mkdtempSync(join(tmpdir(), 'pico-provider-person-'));
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

    const logged = (key: string): string => {
      for (const line of logLines) {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        if (typeof parsed[key] === 'string') {
          return parsed[key];
        }
      }
      throw new Error(`pico_host_log_missing:${key}`);
    };

    await app.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: { bootstrapCode: logged('operatorBootstrapCode'), passphrase: 'person surface pass' },
    });
    const { device } = await openPicoHomeWithDevice(app, {
      moveInCode: logged('picoHomeMoveInCode'),
      idSuffix: 'provider_decision_20260813',
    });
    const operator = (await app.inject({
      method: 'POST',
      url: '/api/auth/session',
      payload: { passphrase: 'person surface pass' },
    })).json() as { session: string };

    return {
      app,
      operator: `Bearer ${operator.session}`,
      person: `Bearer ${device.session}`,
    };
  }

  it('lets a person decide and then see their own provider', async () => {
    const { app, person } = await bootWithPerson();
    // Before deciding, this person has no provider - not the Home's.
    expect(((await app.inject({
      method: 'GET',
      url: '/api/model/providers/mine',
      headers: { authorization: person },
    })).json() as { providers: unknown[] }).providers).toHaveLength(0);

    expect((await app.inject({
      method: 'POST',
      url: '/api/model/providers/qwen3-14b/decision',
      headers: { authorization: person },
      payload: { providerClass: 'declared_own_host', carries: 'live_turn' },
    })).statusCode).toBe(201);

    const mine = ((await app.inject({
      method: 'GET',
      url: '/api/model/providers/mine',
      headers: { authorization: person },
    })).json() as { providers: Array<Record<string, unknown>> }).providers;
    expect(mine).toHaveLength(1);
    expect(mine[0]!.sees).toBe('this conversation only');
  });

  it('refuses the operator, by name, on a decision that is not theirs', async () => {
    // ADR 0087. Host administration installs and backs up; it does not answer
    // for a resident about whether their memory may leave the house.
    const { app, operator } = await bootWithPerson();
    for (const [method, url] of [
      ['GET', '/api/model/providers/mine'],
      ['POST', '/api/model/providers/qwen3-14b/decision'],
      ['DELETE', '/api/model/providers/qwen3-14b/decision'],
    ] as const) {
      const response = await app.inject({
        method,
        url,
        headers: { authorization: operator },
        payload: { providerClass: 'declared_own_host', carries: 'live_turn' },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: 'pico_model_provider_decision_is_personal' });
    }
  });

  it('passes the parser\'s refusal out rather than flattening it', async () => {
    // ADR 0151 PV4: the wider allowance without a credential is a sentence
    // about what the decision needed, not a generic bad request.
    const { app, person } = await bootWithPerson();
    const response = await app.inject({
      method: 'POST',
      url: '/api/model/providers/qwen3-14b/decision',
      headers: { authorization: person },
      payload: { providerClass: 'declared_own_host', carries: 'live_turn_and_retrieved_memory' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'pico_model_provider_allowance_without_credential' });
  });

  it('revokes, and the provider is gone for that person only', async () => {
    const { app, person } = await bootWithPerson();
    await app.inject({
      method: 'POST',
      url: '/api/model/providers/qwen3-14b/decision',
      headers: { authorization: person },
      payload: { providerClass: 'declared_own_host', carries: 'live_turn' },
    });
    expect((await app.inject({
      method: 'DELETE',
      url: '/api/model/providers/qwen3-14b/decision',
      headers: { authorization: person },
    })).statusCode).toBe(200);

    expect(((await app.inject({
      method: 'GET',
      url: '/api/model/providers/mine',
      headers: { authorization: person },
    })).json() as { providers: unknown[] }).providers).toHaveLength(0);
  });

  it('leaves the shared finding untouched by a personal decision', async () => {
    const { app, operator, person } = await bootWithPerson();
    await app.inject({
      method: 'POST',
      url: '/api/model/providers/qwen3-14b/decision',
      headers: { authorization: person },
      payload: { providerClass: 'pico_endpoint', carries: 'live_turn' },
    });
    // The Home-level route still reports the measurement, unchanged by what
    // one resident decided about it.
    const shared = ((await app.inject({
      method: 'GET',
      url: '/api/model/providers',
      headers: { authorization: operator },
    })).json() as { providers: Array<Record<string, unknown>> }).providers[0]!;
    expect(shared.providerClass).toBe('declared_own_host');
    expect((shared.measured as Record<string, unknown>).contextTokens).toBe(40960);
  });
});

describe('ADR 0152 over ADR 0107 - the decision, made where the person is', () => {
  it('reads, decides and revokes over a sealed Link request', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pico-provider-link-'));
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

    const moveInCode = logLines
      .map((line) => JSON.parse(line) as { picoHomeMoveInCode?: string })
      .find((line) => typeof line.picoHomeMoveInCode === 'string')!.picoHomeMoveInCode!;
    const setup = (await app.inject({ method: 'GET', url: '/api/home/setup' })).json() as {
      host: { signingKeyFingerprintHex: string; keyAgreementPublicKeyHex: string };
    };
    const { device, sealedClaim } = await openPicoHomeWithDevice(app, {
      moveInCode,
      idSuffix: 'provider_link_20260813',
    });

    const send = async (
      operation: 'home.model.providers.read'
        | 'home.model.provider.decision.submit'
        | 'home.model.provider.decision.revoke',
      args: Record<string, unknown>,
    ) => await sendPicoLinkDirectRequest(app, {
      operation,
      args,
      sender: device,
      identityKeyRecord: sealedClaim.claimantIdentityKeyRecord,
      hostSigningKeyFingerprintHex: setup.host.signingKeyFingerprintHex,
      hostKeyAgreementPublicKeyHex: setup.host.keyAgreementPublicKeyHex,
    });

    // Before deciding: the finding is visible, and the absence of a decision
    // is said as an absence rather than as a default.
    const before = await send('home.model.providers.read', {});
    expect(before.response.outcome).toBe('ok');
    const listedBefore = (before.result as { providers: Array<Record<string, unknown>> })
      .providers[0]!;
    expect(listedBefore.decided).toBe(false);
    expect(listedBefore.sees).toBe('nothing yet - you have not decided about this one');
    expect(listedBefore.contextTokens).toBe(40960);
    // ADR 0107 carries canonical JSON with no floating point, and ADR 0152 SE1
    // wants the simple layer here anyway: no throughput figure travels.
    expect(listedBefore.generationTokensPerSecond).toBeUndefined();

    // ADR 0151 PV4's refusal reaches the device as itself, not as a shrug.
    const refused = await send('home.model.provider.decision.submit', {
      entryId: 'qwen3-14b',
      providerClass: 'declared_own_host',
      carries: 'live_turn_and_retrieved_memory',
    });
    expect(refused.response.outcome).toBe('invalid_arguments');
    expect(refused.result.refusal).toBe('pico_model_provider_allowance_without_credential');

    const decided = await send('home.model.provider.decision.submit', {
      entryId: 'qwen3-14b',
      providerClass: 'declared_own_host',
      carries: 'live_turn',
    });
    expect(decided.response.outcome).toBe('ok');

    const after = await send('home.model.providers.read', {});
    const listedAfter = (after.result as { providers: Array<Record<string, unknown>> })
      .providers[0]!;
    expect(listedAfter.decided).toBe(true);
    expect(listedAfter.sees).toBe('this conversation only');
    expect(listedAfter.needsCredentialToSeeMore).toBe(true);

    const revoked = await send('home.model.provider.decision.revoke', { entryId: 'qwen3-14b' });
    expect(revoked.response.outcome).toBe('ok');
    expect(((await send('home.model.providers.read', {}))
      .result as { providers: Array<Record<string, unknown>> }).providers[0]!.decided)
      .toBe(false);
  });
});
