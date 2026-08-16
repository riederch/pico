import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import sodium from 'libsodium-wrappers-sumo';
import {
  buildPicoHomeDomainReadGrantSignatureInput,
  picoHomeDomainReadGrantRecordSchema,
  picoIdentitySuite,
} from '@pico/protocol';
import { parsePicoModelProviderEntry } from '@pico/protocol/model-provider';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app.js';
import { EventStore } from './event-store.js';
import { openPicoHomeWithDevice, sendPicoLinkDirectRequest } from './test-claimed-home.js';

/**
 * ADR 0116 W1 under ADR 0077's real policy, with nothing standing in.
 *
 * Every other recall test injects a readership that says yes, which is right
 * for testing what happens *after* the check and useless for testing the check
 * itself. This one runs the whole way through the authorization a claimed Home
 * actually uses: an active membership, and a domain read grant the Home Host
 * Pico signed.
 *
 * **The grant is the half nobody had exercised.** A person's own device can
 * read their own memory only because the founding identity signed a statement
 * saying so, and until this test the recall path had never met that
 * requirement - it had only ever met a function that returned true.
 */
const dirs: string[] = [];
const apps: Array<{ close(): Promise<void> }> = [];

beforeAll(async () => {
  await sodium.ready;
});

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

/** A provider that answers the two things a dispatch asks it. */
function modelHost(answer: { answer: string; found: boolean }): typeof globalThis.fetch {
  return (async (url: string | URL | Request): Promise<Response> => {
    if (new URL(String(url)).pathname === '/api/tags') {
      return new Response(JSON.stringify({
        models: [{ name: 'a-model:measured', digest: `sha256:${digest}` }],
      }), { status: 200 });
    }
    return new Response(JSON.stringify({
      response: JSON.stringify({ answer: answer.answer, found_in_memory: answer.found }),
    }), { status: 200 });
  }) as unknown as typeof globalThis.fetch;
}

interface AppUnderTest {
  inject(request: {
    method: string;
    url: string;
    payload?: unknown;
    headers?: Record<string, string>;
  }): Promise<{ statusCode: number; json(): unknown }>;
  picoSweepModelJobs(): Promise<number>;
  close(): Promise<void>;
}

describe('ADR 0116 W1 with ADR 0082 - the way a person actually reads their memory', () => {
  it('refuses without a grant, answers with one, and never mints the grant itself', async () => {
    vi.stubGlobal('fetch', modelHost({
      answer: 'On Bergstrasse, level -2 bay 114.',
      found: true,
    }));

    const dir = mkdtempSync(join(tmpdir(), 'pico-recall-authorized-'));
    dirs.push(dir);
    const databasePath = join(dir, 'pico.sqlite');

    const seeded = await EventStore.open(databasePath, {});
    seeded.picoModelProviderRegistry().put(parsePicoModelProviderEntry({
      schema: 'pico.model.provider.entry.v1',
      entryId: 'a-measured-host',
      providerClass: 'declared_own_host',
      reach: 'http://provider.invalid:11434',
      model: { identifier: 'a-model:measured', digestHex: digest },
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
    }), '2026-08-16T09:00:00.000Z');
    seeded.close();

    const logLines: string[] = [];
    // No readership override anywhere below: this Home reads by membership and
    // grant, exactly as a claimed one does.
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
    }) as unknown as AppUnderTest;
    apps.push(app);

    const moveInCode = logLines
      .map((line) => JSON.parse(line) as { picoHomeMoveInCode?: string })
      .find((line) => typeof line.picoHomeMoveInCode === 'string')!.picoHomeMoveInCode!;
    const setup = (await app.inject({ method: 'GET', url: '/api/home/setup' })).json() as {
      host: { signingKeyFingerprintHex: string; keyAgreementPublicKeyHex: string };
    };
    const { device, sealedClaim } = await openPicoHomeWithDevice(app as never, {
      moveInCode,
      idSuffix: 'recall_authorized',
    });
    const send = async (operation: string, args: Record<string, unknown>) =>
      await sendPicoLinkDirectRequest(app as never, {
        operation: operation as never,
        args,
        sender: device,
        identityKeyRecord: sealedClaim.claimantIdentityKeyRecord,
        hostSigningKeyFingerprintHex: setup.host.signingKeyFingerprintHex,
        hostKeyAgreementPublicKeyHex: setup.host.keyAgreementPublicKeyHex,
      });

    expect((await send('home.model.provider.decision.submit', {
      entryId: 'a-measured-host',
      providerClass: 'declared_own_host',
      carries: 'live_turn',
    })).response.outcome).toBe('ok');

    const writing = await EventStore.open(databasePath, {});
    writing.memory().create({
      memoryItemId: 'mem_parked',
      privacyDomain: 'domain-private',
      owner: 'pico-owner',
      controller: 'pico-owner',
      contentType: 'text/plain',
      content: 'Parked on Bergstrasse, level -2 bay 114.',
      origin: 'person_present',
    });
    const founding = writing.picoHomeFoundingRecord()!;
    writing.close();

    // Before the grant: the real policy, and ADR 0077 C4's one silence.
    expect((await send('home.recall.ask', {
      privacyDomain: 'domain-private',
      question: 'Where did I park?',
    })).result.refusal).toBe('not_readable');

    /**
     * ADR 0082 with ADR 0087. The Home Host Pico signs; the Home relays.
     *
     * The signature is what carries the authority, which is why the same
     * request without one is refused below: a Home that could mint this would
     * be a Home that can read anything it holds by deciding to.
     */
    const grant = {
      suite: picoIdentitySuite,
      grantId: 'grant_recall_0001',
      homeId: founding.founding.homeId,
      hostSigningKeyFingerprintHex: founding.founding.hostSigningKeyFingerprintHex,
      privacyDomain: 'domain-private',
      controllerPicoIdentityFingerprintHex:
        founding.founding.homeHostPicoIdentityFingerprintHex,
      readerPicoIdentityFingerprintHex: founding.founding.homeHostPicoIdentityFingerprintHex,
      validFrom: '2026-01-01T00:00:00.000Z',
      validUntil: '2027-01-01T00:00:00.000Z',
      lifecycleOrder: 'seq:0000000000000001',
    };
    const signed = {
      schema: picoHomeDomainReadGrantRecordSchema,
      grant,
      issuerIdentityKeyRecord: sealedClaim.claimantIdentityKeyRecord,
      issuerSignatureHex: Buffer.from(sodium.crypto_sign_detached(
        buildPicoHomeDomainReadGrantSignatureInput(grant),
        sealedClaim.claimantPrivateKey,
      )).toString('hex'),
    };

    // An unsigned claim to the same authority is refused: relaying is not
    // minting, and the route that transports evidence verifies it first.
    // Forged, over the channel the device actually uses: the Home relays and
    // never mints, so a signature that does not verify is refused here exactly
    // as it is on the Foundation route.
    const forged = await send('home.domain.read-grant.submit', {
      ...signed,
      issuerSignatureHex: 'f'.repeat(128),
    });
    expect(forged.response.outcome).toBe('invalid_arguments');
    expect(forged.result.refusal).toBe('invalid_issuer_signature');

    // And the real one, issued by the device itself - no Foundation session
    // anywhere on this path.
    const issued = await send('home.domain.read-grant.submit', signed);
    expect(issued.response.outcome).toBe('ok');
    expect(issued.result).toEqual({
      grantId: 'grant_recall_0001',
      privacyDomain: 'domain-private',
      status: 'active',
    });

    const asked = await send('home.recall.ask', {
      privacyDomain: 'domain-private',
      question: 'Where did I park?',
    });
    expect(asked.response.outcome).toBe('ok');
    expect(asked.result.included).toBe(1);

    expect(await app.picoSweepModelJobs()).toBe(1);

    const read = await send('home.recall.read', {});
    const recalls = (read.result as { recalls: Array<Record<string, unknown>> }).recalls;
    expect(recalls[0]?.question).toBe('Where did I park?');
    expect(recalls[0]?.outcome).toBe('answered');
    expect(JSON.stringify(recalls[0]?.values)).toContain('Bergstrasse');
  });
});
