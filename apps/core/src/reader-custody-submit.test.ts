import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import {
  buildPicoIdentityDelegationSignatureInput,
  buildPicoIdentityReaderKeyFreshnessSignatureInput,
  picoIdentityReaderKeyFreshnessCheckpointSchema,
  picoIdentitySuite,
} from '@pico/protocol';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { EventStore } from './event-store.js';
import {
  createPicoIdentitySessionDevice,
  keyRecordFingerprintHex,
  openPicoHomeWithDevice,
  sendPicoLinkDirectRequest,
} from './test-claimed-home.js';
import {
  makeReaderCustodyReaderGrant,
  makeReaderCustodyRecords,
} from './test-reader-custody-records.js';

/**
 * ADR 0086 mit ADR 0130 E5, Roadmap-Befund B5 - der Ast bekommt sein Subjekt.
 *
 * Fünfzehn implementierte ADRs hatten keines: das Home prüfte und speicherte
 * Reader-Custody-Inhalt seit langem, und die einzige Route dorthin war
 * Home-zu-Home. Nichts, was eine Person in der Hand hält, hat je etwas unter
 * dieser Verwahrung geschrieben.
 *
 * Dieser Test schreibt es - mit echten Schlüsseln, echter Domäne und echtem
 * Schreibrecht, weil ein Test mit erfundenen Aufzeichnungen genau die
 * Prüfungen überspränge, um die es hier geht.
 */
const dirs: string[] = [];
const apps: Array<{ close(): Promise<void> }> = [];

beforeAll(async () => {
  await sodium.ready;
}, 60_000);

afterEach(async () => {
  for (const app of apps.splice(0)) {
    await app.close();
  }
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

async function claimedHome() {
  const dir = mkdtempSync(join(tmpdir(), 'pico-custody-submit-'));
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
    close(): Promise<void>;
  };
  apps.push(app);

  const moveInCode = logLines
    .map((line) => JSON.parse(line) as { picoHomeMoveInCode?: string })
    .find((line) => typeof line.picoHomeMoveInCode === 'string')!.picoHomeMoveInCode!;
  const setup = (await app.inject({ method: 'GET', url: '/api/home/setup' })).json() as {
    host: { signingKeyFingerprintHex: string; keyAgreementPublicKeyHex: string };
  };
  // Die `homeId` kommt aus dem Anspruch, nicht aus `/api/home/setup`: das
  // Setup wird *vor* dem Beanspruchen gelesen und kennt sie noch nicht.
  const { device, sealedClaim, homeId } = await openPicoHomeWithDevice(app as never, {
    moveInCode,
    idSuffix: 'custody_submit',
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
  return {
    app,
    send,
    sealedClaim,
    databasePath,
    setup: { ...setup, homeId },
    // Der Beanspruchende ist das aktive Mitglied dieses Homes, also gehört ihm
    // die Domäne. Ein frisches Paar wäre niemand, den dieses Home kennt.
    ownerKeypair: {
      publicKey: Buffer.from(sealedClaim.claimantIdentityKeyRecord.publicKeyHex, 'hex'),
      privateKey: sealedClaim.claimantPrivateKey as Uint8Array,
    },
  };
}

describe('ADR 0086 mit ADR 0130 E5 - der Ast bekommt sein Subjekt', () => {
  it('nimmt ein Item vom eigenen Gerät an, nachdem Domäne und Recht da sind', async () => {
    const { send, databasePath, setup, ownerKeypair } = await claimedHome();
    /**
     * Dieselbe Fabrik, die `reader-custody.test.ts` benutzt - nur an *dieses*
     * Home gebunden. Eine zweite daneben wäre eine zweite Auffassung davon,
     * wie ein gültiger Satz Aufzeichnungen aussieht.
     */
    const records = makeReaderCustodyRecords({
      homeId: setup.homeId,
      hostSigningKeyFingerprintHex: setup.host.signingKeyFingerprintHex,
      ownerKeypair,
      // Dieselbe Person schreibt in ihre eigene Domäne.
      writerIdentity: 'owner',
    });

    /**
     * Domäne und Schreibrecht werden in den Speicher gelegt statt über die
     * Home-zu-Home-Route geschickt: die verlangt eine Betreiber-Sitzung, und
     * was hier geprüft wird, ist der Weg für das **Item** vom Gerät. Ein
     * Vorspiel, das seine eigene Anmeldung braucht, prüfte etwas anderes mit.
     */
    const seeding = await EventStore.open(databasePath, {});
    const custody = seeding.readerCustody(sodium as never);
    const domainSeeded = custody.recordDomain(records.domain);
    expect((domainSeeded as { reason?: string }).reason ?? 'ok').toBe('ok');
    const grantSeeded = custody.recordWriterGrant(records.writerGrant);
    expect((grantSeeded as { reason?: string }).reason ?? 'ok').toBe('ok');
    seeding.close();

    const submitted = await send('home.reader_custody.item.submit', { record: records.item });
    expect(submitted.result.refusal ?? submitted.response.outcome).toBe('ok');
    expect(submitted.result).toEqual({
      inserted: true,
      memoryItemId: records.item.item.memoryItemId,
    });

    // Noch einmal abgegeben ist kein Fehler - aber „schon da" ist etwas
    // anderes als „gerade angekommen", und nur das zweite erlaubt einem Gerät,
    // seinen Klartext lokal loszuwerden.
    const again = await send('home.reader_custody.item.submit', { record: records.item });
    expect(again.response.outcome).toBe('ok');
    expect(again.result).toEqual({
      inserted: false, memoryItemId: records.item.item.memoryItemId,
    });
  }, 60_000);

  it('lehnt ein Item ohne sein Schreibrecht ab und sagt, welches fehlt', async () => {
    /**
     * Ein „nein" ohne Namen ließe ein Gerät raten, ob sein Recht abgelaufen
     * ist, die Domäne rotiert wurde oder es die falsche Home fragt - und die
     * drei verlangen verschiedene Antworten von der Person.
     */
    const { send, setup, ownerKeypair } = await claimedHome();
    const records = makeReaderCustodyRecords({
      homeId: setup.homeId,
      hostSigningKeyFingerprintHex: setup.host.signingKeyFingerprintHex,
      ownerKeypair,
      // Dieselbe Person schreibt in ihre eigene Domäne.
      writerIdentity: 'owner',
    });

    const refused = await send('home.reader_custody.item.submit', { record: records.item });
    expect(refused.response.outcome).toBe('invalid_arguments');
    expect(refused.result.refusal).toBe('unknown_writer_grant');
  }, 60_000);
});

/**
 * ADR 0085 mit ADR 0088 und ADR 0089 - der erste Fall, für den es reicht.
 *
 * **Wessen Wurzel unterschreibt, entscheidet, wer wach sein muss.** ADR 0085
 * lässt nur die Identitätswurzel des *Lesers* einen Frische-Nachweis
 * unterschreiben. Für eine andere Person heißt das: ihr Gerät muss in genau
 * dem Moment antworten, denn der Nachweis lebt höchstens fünf Minuten und der
 * Prüfer schlägt bei jeder Prüfung neu nach. Für das **zweite Gerät derselben
 * Person** ist es dieselbe Wurzel - sie liegt in ihrem eigenen Vault, und
 * niemand sonst muss dafür wach sein.
 *
 * Das ist der Fall hier, und die Reihenfolge im Test ist die Aussage: ohne
 * Nachweis lehnt das Home ab und sagt warum; mit Nachweis nimmt es an.
 */
describe('ADR 0085 - das zweite Gerät derselben Person darf lesen', () => {
  const checkpointFor = (input: {
    homeId: string;
    identityKeyRecord: { publicKeyHex: string };
    identityPrivateKey: Uint8Array;
    device: {
      delegationId: string;
      deviceSigningKeyFingerprintHex: string;
      deviceKeyAgreementKeyFingerprintHex: string;
    };
    lifecycleOrder: string;
    now: Date;
  }) => {
    const checkpoint = {
      suite: picoIdentitySuite,
      checkpointId: `freshness_${input.device.delegationId}`,
      homeId: input.homeId,
      issuerIdentityKeyFingerprintHex: keyRecordFingerprintHex({
        suite: picoIdentitySuite,
        keyRole: 'pico_identity',
        publicKeyHex: input.identityKeyRecord.publicKeyHex,
      } as never),
      deviceSigningKeyFingerprintHex: input.device.deviceSigningKeyFingerprintHex,
      deviceKeyAgreementKeyFingerprintHex: input.device.deviceKeyAgreementKeyFingerprintHex,
      delegationId: input.device.delegationId,
      status: 'current' as const,
      observedThroughLifecycleOrder: input.lifecycleOrder,
      checkedAt: input.now.toISOString(),
      // Vier Minuten: unter dem Fünf-Minuten-Deckel, den der Prüfer erzwingt.
      freshUntil: new Date(input.now.getTime() + 4 * 60 * 1_000).toISOString(),
    };
    return {
      schema: picoIdentityReaderKeyFreshnessCheckpointSchema,
      checkpoint,
      issuerIdentityKeyRecord: {
        suite: picoIdentitySuite,
        keyRole: 'pico_identity' as const,
        publicKeyHex: input.identityKeyRecord.publicKeyHex,
      },
      issuerSignatureHex: Buffer.from(sodium.crypto_sign_detached(
        buildPicoIdentityReaderKeyFreshnessSignatureInput(checkpoint as never),
        input.identityPrivateKey,
      )).toString('hex'),
    };
  };

  it('lehnt ohne Frische-Nachweis ab und nimmt mit an', async () => {
    const { send, databasePath, setup, ownerKeypair, sealedClaim } = await claimedHome();
    const records = makeReaderCustodyRecords({
      homeId: setup.homeId,
      hostSigningKeyFingerprintHex: setup.host.signingKeyFingerprintHex,
      ownerKeypair,
      writerIdentity: 'owner',
    });
    const seeding = await EventStore.open(databasePath, {});
    const custody = seeding.readerCustody(sodium as never);
    expect(custody.recordDomain(records.domain).ok).toBe(true);
    seeding.close();

    /**
     * Das zweite Gerät derselben Person. Es bekommt eine spätere
     * Lebenszyklus-Ordnung, weil eine wiederverwendete keine zweite Sache
     * wäre, sondern ein Widerspruch über die erste.
     *
     * Die Lebenszyklus-Beweise gehen durch **dieselbe Tür wie im Produkt** -
     * `recordPicoIdentityLifecycleEvidence` -, und genau dort registriert der
     * Home den Leserschlüssel eines Geräts. Ohne diesen Schritt scheitert die
     * Auswahl vorher und sagt `reader_key_is_not_current`, was etwas anderes
     * ist als „kein Nachweis da".
     */
    const secondSigning = sodium.crypto_sign_keypair();
    const secondAgreement = sodium.crypto_box_keypair();
    const keyRecordOf = (
      keyRole: 'device_signing' | 'device_key_agreement',
      publicKey: Uint8Array,
    ) => ({
      suite: picoIdentitySuite,
      keyRole,
      publicKeyHex: Buffer.from(publicKey).toString('hex'),
    });
    const secondSigningKeyRecord = keyRecordOf('device_signing', secondSigning.publicKey);
    const secondAgreementKeyRecord =
      keyRecordOf('device_key_agreement', secondAgreement.publicKey);
    const delegation = {
      suite: picoIdentitySuite,
      delegationId: 'delegation_second_device',
      issuerIdentityKeyFingerprintHex: keyRecordFingerprintHex(
        sealedClaim.claimantIdentityKeyRecord,
      ),
      subjectSigningKeyFingerprintHex: keyRecordFingerprintHex(secondSigningKeyRecord as never),
      subjectKeyAgreementKeyFingerprintHex:
        keyRecordFingerprintHex(secondAgreementKeyRecord as never),
      /**
       * Die beiden, die ein Leser braucht (`event-store.ts` verlangt sie beim
       * Kandidaten), plus die Sitzung. Ein Gerät ohne sie ist kein Leser,
       * sondern eines, das eine Fläche bedienen darf.
       */
      scopes: ['surface_session', 'decrypt_domain', 'receive_key_envelope'],
      validFrom: '2026-08-26T09:00:00.000Z',
      validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1_000).toISOString(),
      lifecycleOrder: 'seq:0000000000000003',
    };
    const registering = await EventStore.open(databasePath, {});
    const recorded = registering.recordPicoIdentityLifecycleEvidence({
      sodium: sodium as never,
      identityKeyRecord: sealedClaim.claimantIdentityKeyRecord,
      delegation: {
        record: delegation,
        signatureHex: Buffer.from(sodium.crypto_sign_detached(
          buildPicoIdentityDelegationSignatureInput(delegation as never),
          sealedClaim.claimantPrivateKey,
        )).toString('hex'),
      } as never,
      revocations: [],
    });
    expect((recorded as { reason?: string }).reason ?? 'ok').toBe('ok');
    /**
     * Und die Projektion daneben: der Lebenslauf sagt, dass es das Gerät gibt,
     * `registerPicoIdentityReaderKey` legt seinen öffentlichen Leserschlüssel
     * ab. Das Produkt tut beides an derselben Stelle - beim Beitritt, beim
     * Lebenszyklus-Übergang und bei der Wiederherstellung.
     */
    registering.registerPicoIdentityReaderKey({
      sodium: sodium as never,
      picoIdentityFingerprintHex: keyRecordFingerprintHex(
        sealedClaim.claimantIdentityKeyRecord,
      ),
      deviceSigningKeyFingerprintHex: delegation.subjectSigningKeyFingerprintHex,
      delegationId: delegation.delegationId,
      deviceKeyAgreementKeyRecord: secondAgreementKeyRecord as never,
    } as never);
    registering.close();

    const second = {
      picoIdentityFingerprintHex: keyRecordFingerprintHex(
        sealedClaim.claimantIdentityKeyRecord,
      ),
      delegationId: delegation.delegationId,
      deviceSigningKeyFingerprintHex: delegation.subjectSigningKeyFingerprintHex,
      deviceKeyAgreementKeyFingerprintHex: delegation.subjectKeyAgreementKeyFingerprintHex,
      deviceKeyAgreementKeyRecord: secondAgreementKeyRecord,
    };

    const readerGrant = makeReaderCustodyReaderGrant(records, {
      readerIdentityFingerprintHex: second.picoIdentityFingerprintHex,
      readerDeviceSigningKeyFingerprintHex: second.deviceSigningKeyFingerprintHex,
      readerKeyRecord: second.deviceKeyAgreementKeyRecord as never,
      readerDelegationId: second.delegationId,
      validUntil: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
    });

    /**
     * **Ohne Nachweis: `freshness_unavailable`.** Das ist die richtige Antwort
     * auf eine leere Ablage - und der Grund, aus dem der Raum von gestern
     * niemanden hereinlassen konnte.
     */
    const withoutCheckpoint = await send('home.reader_custody.reader_grant.submit', {
      record: readerGrant,
    });
    expect(withoutCheckpoint.response.outcome).toBe('invalid_arguments');
    expect(withoutCheckpoint.result.refusal).toBe('freshness_unavailable');

    const pushed = await send('home.reader_key.freshness.submit', {
      checkpoint: checkpointFor({
        homeId: setup.homeId,
        identityKeyRecord: sealedClaim.claimantIdentityKeyRecord,
        identityPrivateKey: sealedClaim.claimantPrivateKey,
        device: second,
        lifecycleOrder: 'seq:0000000000000003',
        now: new Date(),
      }),
    });
    expect(pushed.result.refusal ?? pushed.response.outcome).toBe('ok');

    const withCheckpoint = await send('home.reader_custody.reader_grant.submit', {
      record: readerGrant,
    });
    expect(withCheckpoint.result.refusal ?? withCheckpoint.response.outcome).toBe('ok');
    expect(withCheckpoint.result).toEqual({ inserted: true });
  }, 60_000);
});
