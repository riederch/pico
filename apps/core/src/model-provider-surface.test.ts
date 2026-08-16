import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { parsePicoModelProviderEntry } from '@pico/protocol/model-provider';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { EventStore } from './event-store.js';
import { openPicoHomeWithDevice, sendPicoLinkDirectRequest } from './test-claimed-home.js';
import { parsePicoModelJob } from '@pico/protocol/model-job';
import { picoLibraryReadJob } from './library-read.js';

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
  entryId: 'a-measured-host',
  providerClass: 'declared_own_host',
  reach: 'http://provider.invalid:11434',
  model: { identifier: 'a-model:measured', digestHex: 'b'.repeat(64) },
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

async function bootWithPerson(): Promise<{
  app: AppWithInject;
  databasePath: string;
  personFingerprint: string;
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
    databasePath,
    personFingerprint: device.picoIdentityFingerprintHex,
    operator: `Bearer ${operator.session}`,
    person: `Bearer ${device.session}`,
  };
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
      url: '/api/model/providers/a-measured-host/narrowing',
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
      url: '/api/model/providers/a-measured-host/narrowing',
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
      url: '/api/model/providers/a-measured-host/narrowing',
      payload: { contextTokens: 8192 },
    })).statusCode).toBe(401);
  });

  it('refuses a narrowing that is not a whole number of tokens', async () => {
    const { app, operator } = await bootWithEntry();
    expect((await app.inject({
      method: 'POST',
      url: '/api/model/providers/a-measured-host/narrowing',
      headers: { authorization: operator },
      payload: { contextTokens: 'lots' },
    })).statusCode).toBe(400);
  });
});

describe('ADR 0152 - the personal half is a person\'s, and the operator is not one', () => {

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
      url: '/api/model/providers/a-measured-host/decision',
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
      ['POST', '/api/model/providers/a-measured-host/decision'],
      ['DELETE', '/api/model/providers/a-measured-host/decision'],
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
      url: '/api/model/providers/a-measured-host/decision',
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
      url: '/api/model/providers/a-measured-host/decision',
      headers: { authorization: person },
      payload: { providerClass: 'declared_own_host', carries: 'live_turn' },
    });
    expect((await app.inject({
      method: 'DELETE',
      url: '/api/model/providers/a-measured-host/decision',
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
      url: '/api/model/providers/a-measured-host/decision',
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

type PicoLinkSend = (
  operation: 'home.recall.ask'
    | 'home.recall.read'
    | 'home.recall.keep'
    | 'home.model.reads.read'
    | 'home.model.providers.read'
    | 'home.model.provider.credential.submit'
    | 'home.model.provider.decision.submit'
    | 'home.model.provider.decision.revoke',
  args: Record<string, unknown>,
) => Promise<{
  response: { outcome: string };
  result: Record<string, unknown>;
}>;

/**
 * A claimed Home with one measured entry and a device that can send over the
 * ADR 0107 channel.
 *
 * Extracted the second time it was needed rather than copied: a second setup
 * is a second thing to keep in step, and the half that drifts is always the
 * one nobody is looking at.
 */
async function bootWithLinkDevice(options: {
  reach?: string;
  /**
   * ADR 0077. Substituted so a recall test can exercise what happens *after*
   * the readership check; one test below proves the check itself against the
   * real membership-and-grant policy.
   */
  readership?: { mayRead: (principal: unknown, privacyDomain: string) => boolean };
} = {}): Promise<{
  app: AppWithInject;
  databasePath: string;
  send: PicoLinkSend;
}> {
  const dir = mkdtempSync(join(tmpdir(), 'pico-provider-link-'));
  dirs.push(dir);
  const databasePath = join(dir, 'pico.sqlite');

  const store = await EventStore.open(databasePath, {});
  store.picoModelProviderRegistry().put(
    // ADR 0151 PV5. A credential obliges a transport that protects it, so a
    // test about credentials needs an entry that could hold one.
    parsePicoModelProviderEntry(options.reach === undefined
      ? measured
      : { ...measured, reach: options.reach }),
    '2026-08-13T18:00:00.000Z',
  );
  store.close();

  const logLines: string[] = [];
  const app = await buildApp({
    host: '127.0.0.1',
    port: 0,
    databasePath,
    deviceId: 'pico-core',
    ...(options.readership === undefined
      ? {}
      : { readership: options.readership as never }),
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

  return {
    app,
    databasePath,
    send: async (operation, args) => await sendPicoLinkDirectRequest(app, {
      operation,
      args,
      sender: device,
      identityKeyRecord: sealedClaim.claimantIdentityKeyRecord,
      hostSigningKeyFingerprintHex: setup.host.signingKeyFingerprintHex,
      hostKeyAgreementPublicKeyHex: setup.host.keyAgreementPublicKeyHex,
    }),
  };
}

describe('ADR 0152 over ADR 0107 - the decision, made where the person is', () => {
  it('reads, decides and revokes over a sealed Link request', async () => {
    const { send } = await bootWithLinkDevice();

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
      entryId: 'a-measured-host',
      providerClass: 'declared_own_host',
      carries: 'live_turn_and_retrieved_memory',
    });
    expect(refused.response.outcome).toBe('invalid_arguments');
    expect(refused.result.refusal).toBe('pico_model_provider_allowance_without_credential');

    const decided = await send('home.model.provider.decision.submit', {
      entryId: 'a-measured-host',
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

    const revoked = await send('home.model.provider.decision.revoke', { entryId: 'a-measured-host' });
    expect(revoked.response.outcome).toBe('ok');
    expect(((await send('home.model.providers.read', {}))
      .result as { providers: Array<Record<string, unknown>> }).providers[0]!.decided)
      .toBe(false);
  });
});

describe('ADR 0143 DP1 - a person attaches a corpus and is named for it', () => {
  const pin = { remote: 'https://example.invalid/library.git', commit: 'a'.repeat(40) };

  it('records who accepted it, and creates no reach', async () => {
    const { app, person } = await bootWithPerson();
    const attached = await app.inject({
      method: 'POST',
      url: '/api/depot/attachments',
      headers: { authorization: person },
      payload: pin,
    });
    expect(attached.statusCode).toBe(201);
    // ADR 0138 CO3/CO4. Saying "this corpus is mine" and "go and get it,
    // unwatched" are two decisions, and this route makes only the first.
    const depot = (attached.json() as { depot: Record<string, unknown> }).depot;
    expect(depot).toMatchObject({
      remote: pin.remote,
      mayFetch: false,
      mayFetchUnasked: false,
    });
    // The name is the point of the route: it decides whose decision governs
    // where this material may later be read. A corpus attached by nobody gets
    // no reads and no reason.
    expect(depot.acceptedBy).toEqual(expect.any(String));
    expect(depot.acceptedBy).toHaveLength(64);
  });

  it('refuses the operator, because whose corpus this is is not theirs to say', async () => {
    const { app, operator } = await bootWithPerson();
    const response = await app.inject({
      method: 'POST',
      url: '/api/depot/attachments',
      headers: { authorization: operator },
      payload: pin,
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'pico_depot_attachment_is_personal' });
  });

  it('passes the pin parser\'s refusal out as itself', async () => {
    // A remote that is not a remote and a commit that is not a commit are
    // different mistakes.
    const { app, person } = await bootWithPerson();
    const response = await app.inject({
      method: 'POST',
      url: '/api/depot/attachments',
      headers: { authorization: person },
      payload: { remote: pin.remote, commit: 'not-a-commit' },
    });
    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: string }).error).toContain('commit');
  });

  it('is not reachable without a session at all', async () => {
    const { app } = await bootWithPerson();
    expect((await app.inject({
      method: 'POST',
      url: '/api/depot/attachments',
      payload: pin,
    })).statusCode).toBe(401);
  });
});

describe('ADR 0116 W5 - the last inch is a person', () => {
  const jobId = 'job_kept_0001';
  const nowMs = Date.now();

  function answeredJob(picoIdentityFingerprintHex: string) {
    return {
      job: parsePicoModelJob({
        schema: 'pico.model.job.v1',
        jobId,
        role: 'reader',
        units: [{ originClass: 'person_present', text: 'What is due?' }],
        references: [{
          schema: 'pico.model.context.ref.v1',
          contextRefId: 'ref_kept_0001',
          jobId,
          originClass: 'own_pico',
          privacyDomain: 'household',
          excerpt: 'The boiler service is due in March.',
          materializedAt: new Date(nowMs - 60_000).toISOString(),
          expiresAt: new Date(nowMs + 5 * 60_000).toISOString(),
        }],
        expects: [{ name: 'month', type: 'token' }],
        carries: 'live_turn_and_retrieved_memory',
      }, nowMs),
      picoIdentityFingerprintHex,
      entryId: 'a-measured-host',
      derivedFrom: {
        supplierIdentifier: 'a-library',
        commit: 'c'.repeat(40),
        pinCoversContent: false,
      },
      at: new Date(nowMs).toISOString(),
    };
  }

  async function bootWithAnsweredJob(owner: 'person' | 'somebody_else') {
    const booted = await bootWithPerson();
    const identity = ((await booted.app.inject({
      method: 'GET',
      url: '/api/model/providers/mine',
      headers: { authorization: booted.person },
    })).json() as { providers: unknown[] });
    expect(identity.providers).toBeDefined();

    // The queue is written directly: what is under test is the keep, not how
    // a job got there.
    const store = await EventStore.open(booted.databasePath, {});
    const person = owner === 'person' ? booted.personFingerprint : 'f'.repeat(64);
    const queue = store.picoModelJobQueue();
    queue.enqueue(answeredJob(person));
    queue.settle({
      jobId,
      outcome: 'answered',
      result: {
        values: [{ name: 'month', type: 'token', value: 'march', originClass: 'own_pico' }],
      },
      at: new Date(nowMs).toISOString(),
    });
    store.close();
    return booted;
  }

  it('writes a memory item with the derivation the read was taken under', async () => {
    const { app, person, databasePath } = await bootWithAnsweredJob('person');
    const kept = await app.inject({
      method: 'POST',
      url: `/api/model/jobs/${jobId}/keep`,
      headers: { authorization: person },
    });
    expect(kept.statusCode).toBe(201);
    const memoryItemId = (kept.json() as { memoryItemId: string }).memoryItemId;
    expect(memoryItemId).toMatch(/^memory_[0-9a-f]{32}$/u);

    // **Keeping is not reading.** The person who kept this cannot fetch it
    // back without a domain read grant, and the route answers 404 rather than
    // 403 (ADR 0077 C4's non-enumerating denial). That is the custody rule
    // holding rather than a gap in the keep, and it is asserted here so the
    // next person meets it as a decision rather than as a surprise.
    expect((await app.inject({
      method: 'GET',
      url: `/api/memory/domains/household/items/${memoryItemId}`,
      headers: { authorization: person },
    })).statusCode).toBe(404);

    // ADR 0136 BR6 with ADR 0117 X5. The provenance is stored with the
    // content, and travels with it wherever readership does allow a read.
    const store = await EventStore.open(databasePath, {});
    try {
      expect(store.memory().getInDomain(memoryItemId, 'household')?.derivedFrom).toEqual({
        supplierIdentifier: 'a-library',
        pin: { kind: 'commit', value: 'c'.repeat(40) },
        // False is not a defect to hide: it says the commit does not pin what
        // the bytes were.
        pinCoversContent: false,
      });
    } finally {
      store.close();
    }
  });

  it('answers somebody else\'s job as not found, not as forbidden', async () => {
    // Whose jobs exist is not this caller's business either.
    const { app, person } = await bootWithAnsweredJob('somebody_else');
    const kept = await app.inject({
      method: 'POST',
      url: `/api/model/jobs/${jobId}/keep`,
      headers: { authorization: person },
    });
    expect(kept.statusCode).toBe(404);
    expect(kept.json()).toEqual({ error: 'pico_model_job_not_found' });
  });

  it('refuses the operator, because keeping is a person\'s write', async () => {
    const { app, operator } = await bootWithAnsweredJob('person');
    expect((await app.inject({
      method: 'POST',
      url: `/api/model/jobs/${jobId}/keep`,
      headers: { authorization: operator },
    })).statusCode).toBe(403);
  });

  it('refuses a job that was settled without an answer', async () => {
    // A refusal is as settled as an answer, and there is nothing in it to
    // keep - which is a different fact from the job not existing.
    const booted = await bootWithPerson();
    const store = await EventStore.open(booted.databasePath, {});
    const queue = store.picoModelJobQueue();
    queue.enqueue(answeredJob(booted.personFingerprint));
    queue.settle({
      jobId,
      outcome: 'entry_may_not_carry_these_words',
      at: new Date(nowMs).toISOString(),
    });
    store.close();

    const response = await booted.app.inject({
      method: 'POST',
      url: `/api/model/jobs/${jobId}/keep`,
      headers: { authorization: booted.person },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: 'pico_model_job_has_no_answer',
      outcome: 'entry_may_not_carry_these_words',
    });
  });

  it('answers a job that does not exist as not found', async () => {
    const { app, person } = await bootWithPerson();
    expect((await app.inject({
      method: 'POST',
      url: '/api/model/jobs/job_never_existed/keep',
      headers: { authorization: person },
    })).statusCode).toBe(404);
  });
});

describe('ADR 0104 S3 - the encryption decision moves into Pico', () => {
  it('inherits the host option and records that nobody decided it', async () => {
    // The migration path: nothing changes for an existing install on the day
    // it upgrades, and the next answer comes from Pico rather than the add-on.
    const { app, operator } = await bootWithPerson();
    const read = (await app.inject({
      method: 'GET',
      url: '/api/memory/encryption',
      headers: { authorization: operator },
    })).json() as { enabled: boolean; decided: boolean };
    expect(read.enabled).toBe(false);
    // Inherited and decided are different facts.
    expect(read.decided).toBe(false);
  });

  it('records a person\'s answer and says it applies at the next start', async () => {
    // The key store is built before the database opens, so a decision taken
    // now is one the next start reads. Implying otherwise would have somebody
    // believing their content changed posture while it sat as it was.
    const { app, operator } = await bootWithPerson();
    const set = await app.inject({
      method: 'POST',
      url: '/api/memory/encryption',
      headers: { authorization: operator },
      payload: { enabled: true },
    });
    expect(set.statusCode).toBe(200);
    expect(set.json()).toEqual({ enabled: true, decided: true, appliesAtNextStart: true });

    const read = (await app.inject({
      method: 'GET',
      url: '/api/memory/encryption',
      headers: { authorization: operator },
    })).json() as { enabled: boolean; decided: boolean };
    // Still running under what it booted with, and honest about it.
    expect(read.enabled).toBe(false);
    expect(read.decided).toBe(true);
  });

  it('boots under the decision rather than under the host option', async () => {
    // The point of S3. An instance whose person answered runs on that answer,
    // and the environment variable it was started with no longer decides.
    const dir = mkdtempSync(join(tmpdir(), 'pico-encryption-boot-'));
    dirs.push(dir);
    const databasePath = join(dir, 'pico.sqlite');
    const seeded = await EventStore.open(databasePath, {});
    seeded.decidePicoMemoryEncryption({
      enabled: true,
      at: '2026-08-14T10:00:00.000Z',
      inheritedFromHost: false,
    });
    seeded.close();

    const logLines: string[] = [];
    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath,
      deviceId: 'pico-core',
      // The host says off. The person said on, and the person is who this
      // table exists to let answer.
      memoryEncryption: false,
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
      payload: { bootstrapCode, passphrase: 'encryption boot passphrase' },
    });
    const session = (await app.inject({
      method: 'POST',
      url: '/api/auth/session',
      payload: { passphrase: 'encryption boot passphrase' },
    })).json() as { session: string };

    expect(((await app.inject({
      method: 'GET',
      url: '/api/memory/encryption',
      headers: { authorization: `Bearer ${session.session}` },
    })).json() as { enabled: boolean; decided: boolean }))
      .toEqual({ enabled: true, decided: true, decidedAt: '2026-08-14T10:00:00.000Z' });
  });

  it('refuses an answer that is not one', async () => {
    const { app, operator } = await bootWithPerson();
    expect((await app.inject({
      method: 'POST',
      url: '/api/memory/encryption',
      headers: { authorization: operator },
      payload: { enabled: 'yes please' },
    })).statusCode).toBe(400);
  });
});

describe('ADR 0152 SE5 - the state travels with the finding', () => {
  /** Settles one job on the entry, the way a sweep would. */
  async function settle(databasePath: string, outcome: string, at: string): Promise<void> {
    const store = await EventStore.open(databasePath, {});
    const queue = store.picoModelJobQueue();
    queue.enqueue({
      job: picoLibraryReadJob({
        jobId: `job_${outcome}`,
        contextRefId: `ref_${outcome}`,
        privacyDomain: 'household',
        excerpt: { path: 'a.md', text: 'contents', commit: 'a'.repeat(40) },
        expects: [{ name: 'topic', type: 'token' }],
        question: 'What is this document about?',
        nowMs: Date.parse(at),
      }),
      picoIdentityFingerprintHex: 'a'.repeat(64),
      entryId: 'a-measured-host',
      at,
      derivedFrom: {
        supplierIdentifier: 'a-library',
        commit: 'a'.repeat(40),
        pinCoversContent: true,
      },
    });
    queue.settle({ jobId: `job_${outcome}`, outcome, at });
    store.close();
  }

  it('says nothing has been asked before anything has', async () => {
    // Not a fault: ADR 0138's posture is that nothing runs until somebody
    // decides, and a fresh Home has asked its provider nothing.
    const { app, operator } = await bootWithEntry();
    const body = (await app.inject({
      method: 'GET',
      url: '/api/model/providers',
      headers: { authorization: operator },
    })).json() as { providers: Array<Record<string, unknown>> };
    expect(body.providers[0]?.state).toBe('not_used_yet');
  });

  it('carries what the last settled job did, to the host surface', async () => {
    const { app, operator, databasePath } = await bootWithPerson();
    await settle(databasePath, 'provider_unreachable', '2026-08-14T12:00:00.000Z');

    const body = (await app.inject({
      method: 'GET',
      url: '/api/model/providers',
      headers: { authorization: operator },
    })).json() as { providers: Array<Record<string, unknown>> };
    expect(body.providers[0]?.state).toBe('did_not_answer');
  });

  it('carries it to the person\'s own device too, with when it was seen', async () => {
    // ADR 0087 keeps the two surfaces apart; SE5 applies to both, because the
    // person deciding whether to keep using a provider is the one on the
    // device.
    const setup = await bootWithLinkDevice();
    await settle(setup.databasePath, 'model_is_not_the_measured_one', '2026-08-14T12:00:00.000Z');

    const read = await setup.send('home.model.providers.read', {});
    const providers = (read.result as { providers: Array<Record<string, unknown>> }).providers;
    expect(providers[0]?.state).toBe('different_model');
    expect(providers[0]?.stateSince).toBe('2026-08-14T12:00:00.000Z');
  });

  it('leaves the field absent when nothing has settled, rather than sending a null', async () => {
    // ADR 0117 X1's construction: an absent observation is an absent field.
    const setup = await bootWithLinkDevice();
    const read = await setup.send('home.model.providers.read', {});
    const providers = (read.result as { providers: Array<Record<string, unknown>> }).providers;
    expect(providers[0]?.state).toBe('not_used_yet');
    expect('stateSince' in (providers[0] ?? {})).toBe(false);
  });
});

describe('ADR 0151 PV1 - the reference has to name something this Home holds', () => {
  const overHttps = { reach: 'https://provider.invalid' };

  it('refuses a decision naming a credential nobody supplied', async () => {
    // The gap this closes: an entry could declare it proves who it is while no
    // Home could produce a secret, so every job on it went out
    // unauthenticated and the claim proved nothing.
    const { send } = await bootWithLinkDevice(overHttps);

    const decided = await send('home.model.provider.decision.submit', {
      entryId: 'a-measured-host',
      providerClass: 'declared_own_host',
      carries: 'live_turn_and_retrieved_memory',
      credentialRef: 'a_credential_reference',
    });

    expect(decided.response.outcome).toBe('invalid_arguments');
    expect(decided.result.refusal).toBe('pico_model_provider_credential_not_held');
  });

  it('takes the secret, answers the reference, and lets the decision through', async () => {
    const { send } = await bootWithLinkDevice(overHttps);

    const supplied = await send('home.model.provider.credential.submit', {
      entryId: 'a-measured-host',
      credentialRef: 'a_credential_reference',
      secret: 'a-secret-this-test-made-up',
    });
    expect(supplied.response.outcome).toBe('ok');
    // The reply carries the reference and no part of the secret.
    expect(supplied.result).toEqual({ credentialRef: 'a_credential_reference' });
    expect(JSON.stringify(supplied.result)).not.toContain('a-secret-this-test-made-up');

    expect((await send('home.model.provider.decision.submit', {
      entryId: 'a-measured-host',
      providerClass: 'declared_own_host',
      carries: 'live_turn_and_retrieved_memory',
      credentialRef: 'a_credential_reference',
    })).response.outcome).toBe('ok');
  });

  it('refuses a credential for an entry that does not exist', async () => {
    const { send } = await bootWithLinkDevice(overHttps);

    const supplied = await send('home.model.provider.credential.submit', {
      entryId: 'a-host-nobody-measured',
      credentialRef: 'a_credential_reference',
      secret: 'a-secret',
    });
    expect(supplied.response.outcome).toBe('invalid_arguments');
    expect(supplied.result.refusal).toBe('pico_model_provider_entry_not_found');
  });

  it('refuses an empty secret rather than sealing nothing', async () => {
    // A sealed empty string is a credential this Home would then believe it
    // holds, and a decision naming it would pass the check that exists to stop
    // exactly that.
    const { send } = await bootWithLinkDevice(overHttps);

    expect((await send('home.model.provider.credential.submit', {
      entryId: 'a-measured-host',
      credentialRef: 'a_credential_reference',
      secret: '',
    })).response.outcome).toBe('invalid_arguments');
  });

  it('forgets the secret when the decision is withdrawn', async () => {
    // ADR 0138 CO1. The withdrawal is a thing to remember; the credential is a
    // thing this Home now has no reason to hold.
    const { send } = await bootWithLinkDevice(overHttps);

    await send('home.model.provider.credential.submit', {
      entryId: 'a-measured-host',
      credentialRef: 'a_credential_reference',
      secret: 'a-secret-this-test-made-up',
    });
    await send('home.model.provider.decision.submit', {
      entryId: 'a-measured-host',
      providerClass: 'declared_own_host',
      carries: 'live_turn_and_retrieved_memory',
      credentialRef: 'a_credential_reference',
    });
    await send('home.model.provider.decision.revoke', { entryId: 'a-measured-host' });

    // Deciding again with the same reference is now refused: the seal went
    // with the withdrawal.
    expect((await send('home.model.provider.decision.submit', {
      entryId: 'a-measured-host',
      providerClass: 'declared_own_host',
      carries: 'live_turn_and_retrieved_memory',
      credentialRef: 'a_credential_reference',
    })).result.refusal).toBe('pico_model_provider_credential_not_held');
  });
});

/**
 * A claimed Home, one measured entry, a decision to use it, and a domain this
 * person may read.
 */
async function bootWithDecision(options: { readable?: boolean } = {}): Promise<{
  send: PicoLinkSend;
  databasePath: string;
}> {
  const setup = await bootWithLinkDevice(options.readable === false ? {} : {
    readership: { mayRead: (_principal, privacyDomain) => privacyDomain === 'domain-private' },
  });
  const decided = await setup.send('home.model.provider.decision.submit', {
    entryId: 'a-measured-host',
    providerClass: 'declared_own_host',
    carries: 'live_turn',
  });
  expect(decided.response.outcome).toBe('ok');
  return { send: setup.send, databasePath: setup.databasePath };
}

describe('ADR 0116 W1 - a person asks about what their Home remembers', () => {

  it('queues a job over the person\'s own notes and says what it was formed from', async () => {
    const setup = await bootWithDecision();
    const store = await EventStore.open(setup.databasePath, {});
    // Two notes the person wrote themselves.
    for (const [index, text] of ['parked on Bergstrasse', 'milk, bread'].entries()) {
      store.memory().create({
        memoryItemId: `mem_${index}`,
        privacyDomain: 'domain-private',
        owner: 'pico-owner',
        controller: 'pico-owner',
        contentType: 'text/plain',
        content: text,
        origin: 'person_present',
      });
    }
    store.close();

    const asked = await setup.send('home.recall.ask', {
      privacyDomain: 'domain-private',
      question: 'where did I park?',
    });

    expect(asked.response.outcome).toBe('ok');
    // A question over the person's own words needs no proven provider.
    expect(asked.result.carries).toBe('live_turn');
    expect(asked.result.included).toBe(2);
    expect(asked.result.omitted).toBe(0);
    expect(typeof asked.result.jobId).toBe('string');
  });

  it('refuses a domain this person may not read, without saying which it is', async () => {
    // ADR 0077 C4 against the real policy: a claimed Home reads by membership
    // *and* grant, and this device holds neither for that domain. Telling "you
    // may not" apart from "there is no such domain" would make this a grant
    // oracle.
    const setup = await bootWithDecision({ readable: false });
    const refused = await setup.send('home.recall.ask', {
      privacyDomain: 'domain-private',
      question: 'what is in there?',
    });

    expect(refused.response.outcome).toBe('invalid_arguments');
    expect(refused.result.refusal).toBe('not_readable');
  });

  it('refuses before assembling anything when nobody decided on a provider', async () => {
    // ADR 0138. Reaching outside is off until somebody says so, and a question
    // is not a decision to reach.
    const setup = await bootWithLinkDevice({
      readership: { mayRead: () => true },
    });
    const refused = await setup.send('home.recall.ask', {
      privacyDomain: 'domain-private',
      question: 'where did I park?',
    });

    expect(refused.result.refusal).toBe('no_decided_entry');
  });

  it('refuses a question this Home will not carry rather than trimming it', async () => {
    const setup = await bootWithDecision();
    const refused = await setup.send('home.recall.ask', {
      privacyDomain: 'domain-private',
      question: 'x'.repeat(4_001),
    });

    expect(refused.result.refusal).toBe('invalid_pico_recall_question');
  });

  it('refuses when what was included needs more than the provider may carry', async () => {
    // The load-bearing one. Nothing chooses the allowance: it falls out of the
    // origins actually included, so a housemate's synced note turns the same
    // question into one that needs a provider which proved who it is.
    const setup = await bootWithDecision();
    const store = await EventStore.open(setup.databasePath, {});
    store.memory().create({
      memoryItemId: 'mem_theirs',
      privacyDomain: 'domain-private',
      owner: 'pico-owner',
      controller: 'pico-owner',
      contentType: 'text/plain',
      content: 'a note that arrived from somebody else',
      origin: 'external_content',
    });
    store.close();

    const refused = await setup.send('home.recall.ask', {
      privacyDomain: 'domain-private',
      question: 'what did we agree?',
    });

    expect(refused.response.outcome).toBe('invalid_arguments');
    expect(refused.result.refusal).toBe('entry_may_not_carry_these_words');
  });

  it('lists what was asked with the answer, once it has one', async () => {
    // ADR 0116 W5's list withholds values because it is a background inventory
    // of material nobody asked to see. A recall is the opposite act: the
    // person asked a moment ago, and putting the answer in front of them is
    // the delivery rather than a persistence.
    const setup = await bootWithDecision();
    const asked = await setup.send('home.recall.ask', {
      privacyDomain: 'domain-private',
      question: 'where did I park?',
    });
    const jobId = asked.result.jobId as string;

    const store = await EventStore.open(setup.databasePath, {});
    store.picoModelJobQueue().settle({
      jobId,
      outcome: 'answered',
      result: {
        values: [
          { name: 'answer', type: 'text', value: 'on Bergstrasse', originClass: 'own_pico' },
        ],
      },
      at: '2026-08-16T12:05:00.000Z',
    });
    store.close();

    const read = await setup.send('home.recall.read', {});
    const recalls = (read.result as { recalls: Array<Record<string, unknown>> }).recalls;
    expect(recalls).toHaveLength(1);
    expect(recalls[0]?.question).toBe('where did I park?');
    expect(recalls[0]?.outcome).toBe('answered');
    expect(recalls[0]?.values).toBeDefined();
  });

  it('keeps a recall out of the library list, and a library read out of this one', async () => {
    // Two kinds, two lists, and the row says which it is rather than the
    // absence of a library pin standing in for it.
    const setup = await bootWithDecision();
    await setup.send('home.recall.ask', {
      privacyDomain: 'domain-private',
      question: 'where did I park?',
    });

    const read = await setup.send('home.model.reads.read', {});
    expect((read.result as { reads: unknown[] }).reads).toEqual([]);
  });
});

describe('ADR 0116 W5 - an answer becomes a memory only when somebody says so', () => {
  async function askAndAnswer(setup: { send: PicoLinkSend; databasePath: string }, options: {
    origin?: 'person_present' | 'external_content';
    answer?: string;
  } = {}): Promise<string> {
    const store = await EventStore.open(setup.databasePath, {});
    store.memory().create({
      memoryItemId: 'mem_note',
      privacyDomain: 'domain-private',
      owner: 'pico-owner',
      controller: 'pico-owner',
      contentType: 'text/plain',
      content: 'Parked on Bergstrasse.',
      origin: options.origin ?? 'person_present',
    });
    store.close();

    const asked = await setup.send('home.recall.ask', {
      privacyDomain: 'domain-private',
      question: 'Where did I park?',
    });
    const jobId = (asked.result as { jobId: string }).jobId;

    const settling = await EventStore.open(setup.databasePath, {});
    settling.picoModelJobQueue().settle({
      jobId,
      outcome: 'answered',
      result: {
        values: [{
          name: 'answer',
          type: 'text',
          value: options.answer ?? 'On Bergstrasse.',
          originClass: 'own_pico',
        }],
      },
      at: '2026-08-16T12:05:00.000Z',
    });
    settling.close();
    return jobId;
  }

  it('keeps the answer as an item derived from what it read', async () => {
    const setup = await bootWithDecision();
    const jobId = await askAndAnswer(setup);

    const kept = await setup.send('home.recall.keep', { jobId });
    expect(kept.response.outcome).toBe('ok');

    const store = await EventStore.open(setup.databasePath, {});
    const item = store.memory()
      .getInDomain((kept.result as { memoryItemId: string }).memoryItemId, 'domain-private');
    store.close();

    expect(item?.content).toBe('On Bergstrasse.');
    // ADR 0116 W2. A read over the person's own words is `own_pico`: derived,
    // and still not the person speaking.
    expect(item?.origin).toBe('own_pico');
  });

  it('refuses to keep what has not been answered', async () => {
    const setup = await bootWithDecision();
    const asked = await setup.send('home.recall.ask', {
      privacyDomain: 'domain-private',
      question: 'Where did I park?',
    });

    const kept = await setup.send('home.recall.keep', {
      jobId: (asked.result as { jobId: string }).jobId,
    });
    expect(kept.result.refusal).toBe('no_answer');
  });

  it('refuses to keep an answer formed from nothing', async () => {
    // "I have nothing about that" is worth telling somebody and not worth
    // keeping: a derivation with no source is an item with nothing to be
    // wrong about.
    const setup = await bootWithDecision();
    const asked = await setup.send('home.recall.ask', {
      privacyDomain: 'domain-private',
      question: 'Where did I park?',
    });
    const jobId = (asked.result as { jobId: string }).jobId;

    const settling = await EventStore.open(setup.databasePath, {});
    settling.picoModelJobQueue().settle({
      jobId,
      outcome: 'answered',
      result: {
        values: [{
          name: 'answer',
          type: 'text',
          value: 'Nothing here says.',
          originClass: 'own_pico',
        }],
      },
      at: '2026-08-16T12:05:00.000Z',
    });
    settling.close();

    expect((await setup.send('home.recall.keep', { jobId })).result.refusal)
      .toBe('nothing_to_derive_from');
  });

  it('refuses to keep an answer whose sources are gone', async () => {
    // ADR 0116 W2 resolves the derivation from the store. A note deleted
    // between the question and the keep leaves nothing to derive from, and
    // inventing an origin for it would be the laundering step W2 prevents.
    const setup = await bootWithDecision();
    const jobId = await askAndAnswer(setup);

    const deleting = await EventStore.open(setup.databasePath, {});
    deleting.memory().deleteInDomain('mem_note', 'domain-private');
    deleting.close();

    const kept = await setup.send('home.recall.keep', { jobId });
    expect(kept.response.outcome).toBe('invalid_arguments');
    expect(String(kept.result.refusal)).toContain('Derivation source is deleted');
  });
});
