import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { EventStore } from './event-store.js';
import { openPicoHomeWithDevice, sendPicoLinkDirectRequest } from './test-claimed-home.js';
import { makeReaderCustodyRecords } from './test-reader-custody-records.js';

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
