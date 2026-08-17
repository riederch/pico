import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { EventStore } from './event-store.js';
import sodium from 'libsodium-wrappers-sumo';
import {
  buildPicoHomeDomainReadGrantSignatureInput,
  picoHomeDomainReadGrantRecordSchema,
  picoIdentitySuite,
} from '@pico/protocol';
import { startPicoFakeModelHost } from './test-model-provider-host.js';
import {
  keyRecordFingerprintHex, openPicoHomeWithDevice, sendPicoLinkDirectRequest,
} from './test-claimed-home.js';

/**
 * ADR 0116 W1 with ADR 0151 PV1 - the path the product exists for.
 *
 * A person asks their own Home about their own memory, is answered, keeps the
 * answer, and takes it back. Every step over Link as a signed request from a
 * claimed device; the only things written behind the surface are the note
 * being asked about and its origin label.
 *
 * **The fork is the subject.** PV1 decides which provider may see the words,
 * and the same question over the same domain answers differently depending on
 * what the material is: the person's own note travels on the narrow allowance,
 * and a note nobody labelled needs a provider that proved who it is - which
 * over plain HTTP it cannot, because PV5 will not put a credential there. Both
 * halves are asserted, because either alone reads as a rule that does nothing.
 */
const dirs: string[] = [];
const apps: Array<{ close(): Promise<void> }> = [];
const hosts: Array<{ close(): Promise<void> }> = [];

afterEach(async () => {
  for (const app of apps.splice(0)) {
    await app.close();
  }
  for (const host of hosts.splice(0)) {
    await host.close();
  }
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

async function homeThatCanAnswer(noteOrigin: string | undefined) {
  const host = await startPicoFakeModelHost({ text: 'Bergstrasse, bay 114.' });
  hosts.push(host);
  const dir = mkdtempSync(join(tmpdir(), 'pico-primary-path-'));
  dirs.push(dir);
  const databasePath = join(dir, 'pico.sqlite');
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
  } as never) as unknown as {
    inject(request: { method: string; url: string }): Promise<{ json(): unknown }>;
    picoSweepModelJobs(): Promise<number>;
    close(): Promise<void>;
  };
  apps.push(app);

  const moveInCode = logLines
    .map((line) => JSON.parse(line) as { picoHomeMoveInCode?: string })
    .find((line) => typeof line.picoHomeMoveInCode === 'string')!.picoHomeMoveInCode!;
  const setup = (await app.inject({ method: 'GET', url: '/api/home/setup' })).json() as {
    host: { signingKeyFingerprintHex: string; keyAgreementPublicKeyHex: string };
  };
  const { device, sealedClaim } = await openPicoHomeWithDevice(app as never, {
    moveInCode,
    idSuffix: 'primary_path',
  });
  const person = keyRecordFingerprintHex(sealedClaim.claimantIdentityKeyRecord);
  const send = async (operation: string, args: Record<string, unknown>) =>
    await sendPicoLinkDirectRequest(app as never, {
      operation: operation as never,
      args,
      sender: device,
      identityKeyRecord: sealedClaim.claimantIdentityKeyRecord,
      hostSigningKeyFingerprintHex: setup.host.signingKeyFingerprintHex,
      hostKeyAgreementPublicKeyHex: setup.host.keyAgreementPublicKeyHex,
    });

  const seed = await EventStore.open(databasePath, {});
  seed.memory().create({
    memoryItemId: 'mem_note_0001',
    privacyDomain: 'privat',
    owner: `pico:identity:${person}`,
    controller: `pico:identity:${person}`,
    contentType: 'text/plain',
    content: 'I parked on Bergstrasse in bay 114.',
    // ADR 0116 W2. Absent is not `own_pico`: an item nobody labelled is
    // `unattributed`, which is the class that says exactly that.
    ...(noteOrigin === undefined ? {} : { origin: noteOrigin }),
  } as never);
  const founding = seed.picoHomeFoundingRecord()!;
  seed.close();

  /**
   * ADR 0082 with ADR 0087. The Home Host Pico signs and the Home relays: a
   * Home that could mint this would be a Home that reads anything it holds by
   * deciding to.
   */
  await sodium.ready;
  const grant = {
    suite: picoIdentitySuite,
    grantId: 'grant_primary_0001',
    homeId: founding.founding.homeId,
    hostSigningKeyFingerprintHex: founding.founding.hostSigningKeyFingerprintHex,
    privacyDomain: 'privat',
    controllerPicoIdentityFingerprintHex: founding.founding.homeHostPicoIdentityFingerprintHex,
    readerPicoIdentityFingerprintHex: founding.founding.homeHostPicoIdentityFingerprintHex,
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: '2027-01-01T00:00:00.000Z',
    lifecycleOrder: 'seq:0000000000000001',
  };
  await send('home.domain.read-grant.submit', {
    schema: picoHomeDomainReadGrantRecordSchema,
    grant,
    issuerIdentityKeyRecord: sealedClaim.claimantIdentityKeyRecord,
    issuerSignatureHex: Buffer.from(sodium.crypto_sign_detached(
      buildPicoHomeDomainReadGrantSignatureInput(grant),
      sealedClaim.claimantPrivateKey,
    )).toString('hex'),
  });

  // ADR 0142 PE2, through the surface: the Home measures a machine the person
  // declares is theirs, and they decide about the finding it produces.
  await send('home.model.provider.measure.ask', {
    reach: host.reach,
    model: 'a-model:measured',
    providerClass: 'declared_own_host',
  });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const read = (await send('home.model.providers.read', {}))
      .result as unknown as { measurements: Array<{ state: string }> };
    if (read.measurements.every((entry) => entry.state !== 'running')) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  await send('home.model.provider.decision.submit', {
    entryId: 'a-model:measured',
    providerClass: 'declared_own_host',
    carries: 'live_turn',
  });

  return { app, send };
}

describe('ADR 0116 W1 - a person asks their own Home and is answered', () => {
  it('walks ask, answer, keep and forget on a note the person’s Pico recorded', async () => {
    const { app, send } = await homeThatCanAnswer('own_pico');

    const asked = (await send('home.recall.ask', {
      privacyDomain: 'privat',
      question: 'where did I park?',
    })).result as unknown as { jobId: string; included: number; carries: string };
    expect(asked.included).toBe(1);
    /**
     * ADR 0151 PV1. **The narrow allowance, and this is the whole point.** A
     * derivation from the person's own notes does not need a provider that
     * proved who it is - so no credential, and therefore no TLS requirement,
     * stands between them and an answer about their own parking space.
     */
    expect(asked.carries).toBe('live_turn');

    // Nothing dispatches on its own until the sweep runs, and it does.
    expect(await app.picoSweepModelJobs()).toBe(1);

    const recalls = (await send('home.recall.read', {})).result as unknown as {
      recalls: Array<{
        jobId: string;
        outcome?: string;
        values?: Array<{ name: string; value: unknown; originClass: string }>;
      }>;
    };
    expect(recalls.recalls[0]?.outcome).toBe('answered');
    const answer = recalls.recalls[0]?.values?.find((value) => value.name === 'answer');
    expect(answer?.value).toBe('Bergstrasse, bay 114.');
    // ADR 0116 W2. The answer carries what it was derived from, unrelabelled.
    expect(answer?.originClass).toBe('own_pico');

    // ADR 0116 W5. The press is the write.
    const kept = (await send('home.recall.keep', { jobId: asked.jobId }))
      .result as unknown as { memoryItemId: string };
    expect(kept.memoryItemId).toMatch(/^mem_recall_/u);

    // ADR 0071. And the write has an undo, on the line that made it.
    expect((await send('home.memory.forget', { memoryItemId: kept.memoryItemId })).result)
      .toEqual({ forgotten: true });
  }, 120_000);

  it('refuses the same question over material nobody labelled', async () => {
    /**
     * The other half of PV1, and the reason the first is not vacuous. An
     * unattributed note may not travel to a provider that never proved who it
     * is - and over plain HTTP nothing can, because ADR 0151 PV5 refuses to
     * put a credential on an unprotected transport. So the refusal a person
     * meets is about the *material*, and the fix is a provider they can prove.
     */
    const { send } = await homeThatCanAnswer(undefined);

    expect((await send('home.recall.ask', {
      privacyDomain: 'privat',
      question: 'where did I park?',
    })).result.refusal).toBe('entry_may_not_carry_these_words');

    await send('home.model.provider.credential.submit', {
      entryId: 'a-model:measured',
      credentialRef: 'the-token',
      secret: 'not-a-real-secret',
    });
    const widened = await send('home.model.provider.decision.submit', {
      entryId: 'a-model:measured',
      providerClass: 'declared_own_host',
      carries: 'live_turn_and_retrieved_memory',
      credentialRef: 'the-token',
    });
    expect(widened.result.refusal).toBe('pico_model_provider_credential_on_unprotected_transport');
  }, 120_000);
});
