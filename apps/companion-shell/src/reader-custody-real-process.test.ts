import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import sodium from 'libsodium-wrappers-sumo';
import { picoTestValidityWindow } from '@pico/protocol';
import type { VaultSodium } from '@pico/vault';
import {
  foundPicoCompanionHome,
  parsePicoHomeSetupAnnouncement,
} from '@pico/companion/founding';
import {
  acceptPicoCompanionEnrolment,
  enrolPicoCompanionDevice,
  offerPicoCompanionEnrolment,
} from '@pico/companion/enrolment';
import {
  readPicoCompanionDomainReadership,
  revokePicoCompanionDomainReader,
} from '@pico/companion/home-authority';
import { readPicoCompanionProfile } from '@pico/companion/profile';
import { createPicoCompanionLinkClient } from '@pico/companion/recovery-controller';
import {
  createPicoCompanionReaderCustodySpace,
  letPicoCompanionOtherDeviceRead,
  readPicoCompanionReaderCustodySpace,
  rotatePicoCompanionReaderCustodyDomain,
  writePicoCompanionReaderCustodyNote,
} from '@pico/companion/reader-custody-space';
import {
  openPicoCompanionVaultProductSession,
  type PicoCompanionVaultProductSession,
} from '@pico/companion/vault-product-session';
import { readPicoCompanionReaderCustodyNotes } from './reader-custody-read.js';

/**
 * ADR 0086 mit ADR 0094, 0098 und 0130 E5 - der Reader-Custody-Weg, wirklich
 * gegangen.
 *
 * **Warum diese Datei existiert.** Am 2026-08-27 wurde dieser Ast zum ersten
 * Mal gegen ein laufendes Home und einen laufenden Vault-Daemon durchlaufen -
 * von Hand, in einem Skript neben dem Repository. Der Durchlauf fand drei
 * Dinge, die vier Gates und tausend Tests nicht gefunden hatten:
 *
 *  1. `ceremonyCreateDomain` bekam ein Feld zu viel und antwortete
 *     `invalid_request`; ein `as never` am Aufruf hatte die Typprüfung
 *     stillgelegt.
 *  2. Der Domänenname war fest, und eine halb durchgekommene Anlage machte
 *     daraus über `UNIQUE (home_id, privacy_domain)` ein `conflicting_record`,
 *     aus dem eine Person nie wieder herausgekommen wäre.
 *  3. Die Home-Seite kannte `reader_custody_writer_grant` gar nicht - und
 *     `release:verify` blieb dabei grün, weil der Test des Clients den
 *     **Namen** behauptet und nicht, dass jemand ihn annimmt.
 *
 * Ein Weg, der nur von Hand gegangen wird, wird einmal gegangen. Deshalb steht
 * er hier: gegen dieselben echten Prozesse, mit denen E2 bis E5 daneben
 * geprüft werden, und in der Schale, weil die Lesehälfte einen blockierenden
 * Anschluss braucht (ADR 0096) und der Kern ihn nicht erreichen darf.
 */
const children: ChildProcess[] = [];
const dirs: string[] = [];
const sessions: PicoCompanionVaultProductSession[] = [];

afterEach(async () => {
  for (const session of sessions.splice(0)) {
    await session.close().catch(() => undefined);
  }
  for (const child of children.splice(0)) {
    child.kill('SIGTERM');
    await new Promise((resolve) => {
      child.once('exit', resolve);
      setTimeout(resolve, 4_000);
    });
  }
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const CLI = join(import.meta.dirname, '..', '..', 'vault-daemon', 'dist', 'cli.js');
const CORE = join(import.meta.dirname, '..', '..', 'core', 'dist', 'index.js');
const passphrase = 'a-passphrase-the-person-chose';
const targetPassphrase = 'the-other-machine-has-its-own';

/** Siehe `home-authority-real-process.test.ts` - ein Jahr ab jetzt, nicht ein Kalendertag. */
const VALID_UNTIL = picoTestValidityWindow().validUntil;

function tempDirectory(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

async function freePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('no_port'));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timeout:${label}`);
}

async function startUnclaimedHome(): Promise<{
  coreUrl: string;
  announcementLine: string;
  child: ChildProcess;
}> {
  const port = await freePort();
  const data = tempDirectory('pico-e5-core-');
  let output = '';
  const child = spawn(process.execPath, [CORE], {
    env: {
      ...process.env,
      PICO_DATABASE_PATH: join(data, 'pico.sqlite'),
      PICO_BACKUP_DIRECTORY: join(data, 'backups'),
      PICO_KEY_STORE_PATH: join(data, 'keys'),
      PICO_HOME_HOST_KEY_STORE_PATH: join(data, 'home-host-keys'),
      PICO_HOST: '127.0.0.1',
      PICO_PORT: String(port),
      PICO_FOUNDATION_ACCESS_MODE: 'loopback-dev',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  for (const stream of [child.stdout!, child.stderr!]) {
    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => { output += chunk; });
  }
  await waitFor(
    () => output.includes('picoHomeMoveInCode') && output.includes('Server listening at'),
    'core_start',
  );
  return {
    coreUrl: `http://127.0.0.1:${port}`,
    announcementLine: output.split('\n').find((line) => line.includes('picoHomeMoveInCode'))!,
    child,
  };
}

async function startEmptyDaemon(): Promise<string> {
  const vaultHomePath = tempDirectory('pico-e5-vault-');
  let output = '';
  const child = spawn(process.execPath, [
    CLI, 'daemon',
    '--vault-home', vaultHomePath,
    '--foundation-data', tempDirectory('pico-e5-data-'),
    '--foundation-backup', tempDirectory('pico-e5-backup-'),
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  for (const stream of [child.stdout!, child.stderr!]) {
    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => { output += chunk; });
  }
  await waitFor(() => output.includes('\n'), 'daemon_start');
  return join(vaultHomePath, 'run', 'daemon.sock');
}

async function foundedDevice(): Promise<{
  profilePath: string;
  socketPath: string;
  session: PicoCompanionVaultProductSession;
  home: ChildProcess;
}> {
  const home = await startUnclaimedHome();
  const socketPath = await startEmptyDaemon();
  const profilePath = join(tempDirectory('pico-e5-profile-'), 'profile.json');
  await foundPicoCompanionHome({
    socketPath,
    profilePath,
    coreUrl: home.coreUrl,
    announcement: parsePicoHomeSetupAnnouncement(home.announcementLine),
    passphrase,
    sodium: sodium as unknown as VaultSodium,
    /**
     * Die Person sagt ja. Auf dem Tisch ist das ein Fenster; hier ist es diese
     * Zeile, und sie steht sichtbar da, statt dass eine Zeremonie unbemerkt
     * ohne jemanden abliefe.
     */
    decisions: { decideApproval: async () => true },
    delegationValidUntil: VALID_UNTIL,
  });
  const profile = readPicoCompanionProfile(profilePath);
  const session = await openPicoCompanionVaultProductSession({
    socketPath,
    unlock: [
      { keyRole: 'pico_identity', keyFingerprintHex: profile.identity.keyFingerprintHex, passphrase },
      { keyRole: 'device_signing', keyFingerprintHex: profile.device.signingKeyFingerprintHex, passphrase },
      {
        keyRole: 'device_key_agreement',
        keyFingerprintHex: profile.device.keyAgreementKeyFingerprintHex,
        passphrase,
      },
    ],
    decisions: { decideApproval: async () => true },
  });
  sessions.push(session);
  return { profilePath, socketPath, session, home: home.child };
}

/**
 * Ein zweites Gerät derselben Person, wirklich eingezogen.
 *
 * Der Weg ist der aus `enrolment-real-process.test.ts`, hier auf das
 * Notwendige gekürzt: ein Angebot vom neuen Gerät, ein Zuschuss vom alten, eine
 * Annahme zurück. Ohne ein zweites Gerät gibt es keinen Leser, ohne Leser kein
 * Beenden - und genau das Beenden war seit dem 2026-08-24 kaputt, ohne dass es
 * jemand sah.
 */
async function enrolSecondDevice(sponsorProfilePath: string,
  sponsorSession: PicoCompanionVaultProductSession): Promise<void> {
  const sponsorProfile = readPicoCompanionProfile(sponsorProfilePath);
  const targetSocketPath = await startEmptyDaemon();
  const targetProfilePath = join(tempDirectory('pico-e5-target-'), 'profile.json');
  const offer = await offerPicoCompanionEnrolment({
    socketPath: targetSocketPath,
    passphrase: targetPassphrase,
  });
  let confirming: Promise<unknown> | null = null;
  await enrolPicoCompanionDevice({
    profile: sponsorProfile,
    daemonClient: sponsorSession.consumerClient,
    livingDeviceLinkClient: await createPicoCompanionLinkClient({
      profile: sponsorProfile,
      daemonClient: sponsorSession.consumerClient,
      sodium: sodium as unknown as VaultSodium,
    }),
    sodium: sodium as unknown as VaultSodium,
    offerCode: offer.offerCode,
    validUntil: VALID_UNTIL,
    exchange: async (grantCode) => {
      const accepted = await acceptPicoCompanionEnrolment({
        socketPath: targetSocketPath,
        passphrase: targetPassphrase,
        grantCode,
        profilePath: targetProfilePath,
        sodium: sodium as unknown as VaultSodium,
        decisions: { decideApproval: async () => true },
        device: offer.device,
      });
      confirming = accepted.confirm();
      return accepted.acceptanceCode;
    },
  });
  await confirming;
}

describe('ADR 0130 E5 - ein Raum, in den nur Gewählte sehen', () => {
  it('legt ihn an, schreibt hinein und liest zurück, was drin steht', async () => {
    /**
     * Die vier Hälften des Wegs an einem Stück. Was hier bewiesen wird, ist
     * nicht, dass die einzelnen Aufrufe zurückkehren - das taten sie auch, als
     * das Home das Wort `reader_custody_writer_grant` nicht kannte -, sondern
     * dass am Ende **derselbe Satz** wieder herauskommt, den jemand
     * hineingeschrieben hat. Ein Ast, der nur bis zur Ablage geprüft wird,
     * kann alles Nötige ablegen und trotzdem unlesbar sein; genau das war er
     * am 2026-08-26.
     */
    await sodium.ready;
    const { profilePath, socketPath, session } = await foundedDevice();
    const profile = readPicoCompanionProfile(profilePath);

    const space = await createPicoCompanionReaderCustodySpace({
      daemonClient: session.consumerClient,
      profile,
      profilePath,
      sodium: sodium as unknown as VaultSodium,
    });
    expect(space.domainAuthorityId).toMatch(/^authority_/u);
    /**
     * Der Name trägt die Autorität in sich. Ein fester Name kollidierte mit
     * `UNIQUE (home_id, privacy_domain)`, sobald eine Anlage halb
     * durchgekommen war - und aus diesem `conflicting_record` gab es für eine
     * Person keinen Weg zurück.
     */
    expect(space.domainId).toContain(space.domainAuthorityId.slice(-12));

    const written = await writePicoCompanionReaderCustodyNote({
      daemonClient: session.consumerClient,
      profile,
      profilePath,
      sodium: sodium as unknown as VaultSodium,
      text: 'Der erste Satz, den dieser Ast je getragen hat.',
    });
    expect(written.memoryItemId).toMatch(/^mem_/u);

    const linkClient = await createPicoCompanionLinkClient({
      profile,
      daemonClient: session.consumerClient,
      sodium: sodium as unknown as VaultSodium,
    });
    /**
     * Gelesen wird als **Besitzer** über seinen eigenen Umschlag - der Fall,
     * den `readingBundleFor` am 2026-08-27 noch verweigerte, während die
     * damaligen Tests die Verweigerung als richtig festhielten.
     */
    const read = await readPicoCompanionReaderCustodyNotes({
      linkClient,
      socketPath,
      readerKeyFingerprintHex: profile.device.keyAgreementKeyFingerprintHex,
      domainAuthorityId: space.domainAuthorityId,
    });
    expect(read).toEqual([{
      memoryItemId: written.memoryItemId,
      text: 'Der erste Satz, den dieser Ast je getragen hat.',
    }]);
  }, 300_000);

  it('lässt das zweite Gerät herein und nimmt den Zugang wieder zurück', async () => {
    /**
     * **Der Test, der am 2026-08-27 einen Fehler fand, der seit dem
     * 2026-08-24 im Fenster stand.** Einen Lesezugang zu beenden ist ein Knopf
     * neben der Leserschaft, und das Home hat die Aussage jedes Mal mit
     * `invalid_record` abgewiesen: die Zeremonie hängte den Schlüsselnachweis
     * der Besitzerin mit der Inhaltssuite an, während die Domäne die
     * Identitätssuite trägt.
     *
     * Kein Test bemerkte es, weil alle gegen einen erfundenen Link-Client
     * prüfen, *welche Operation* geschickt wird. Der Unterschied zwischen
     * „geschickt" und „angenommen" ist genau dieser Block: nach dem Beenden
     * wird die Leserschaft noch einmal beim Home gelesen, und sie muss den
     * Zugang als beendet zeigen.
     */
    await sodium.ready;
    const { profilePath, session } = await foundedDevice();
    await enrolSecondDevice(profilePath, session);
    const profile = readPicoCompanionProfile(profilePath);
    const input = {
      daemonClient: session.consumerClient,
      profile,
      profilePath,
      sodium: sodium as unknown as VaultSodium,
    };
    await createPicoCompanionReaderCustodySpace(input);
    const letIn = await letPicoCompanionOtherDeviceRead(input);
    expect(letIn.readerDelegationId).toMatch(/^delegation_/u);

    const linkClient = await createPicoCompanionLinkClient({
      profile,
      daemonClient: session.consumerClient,
      sodium: sodium as unknown as VaultSodium,
    });
    const before = await readPicoCompanionDomainReadership({
      livingDeviceLinkClient: linkClient,
    });
    const domain = before.find((entry) => entry.readers.length > 0);
    expect(domain?.readers[0]?.status).toBe('active');

    await revokePicoCompanionDomainReader({
      profile,
      daemonClient: session.consumerClient,
      livingDeviceLinkClient: linkClient,
      sodium: sodium as unknown as VaultSodium,
      domain: domain!,
      reader: domain!.readers[0]!,
      reasonCategory: 'device_retired',
    });

    /**
     * Vom Home gelesen, nicht vom Rückgabewert geglaubt. Der alte Fehler ließ
     * die Zeremonie unterschreiben und das Home ablehnen; ein Test, der der
     * Antwort der eigenen Funktion glaubt, hätte auch das grün gefunden.
     */
    const after = await readPicoCompanionDomainReadership({
      livingDeviceLinkClient: linkClient,
    });
    const sameDomain = after.find((entry) => entry.domainId === domain!.domainId);
    expect(sameDomain?.readers[0]?.status).toBe('revoked');
  }, 300_000);

  it('verschließt die Domäne, bis das Schloss gewechselt ist', async () => {
    /**
     * **Die Sackgasse und ihr Ausgang, beide an einem Stück.**
     *
     * Jede beendete Leserberechtigung erzeugt eine Rotationsschuld (ADR 0101),
     * und solange sie besteht, weist das Home neue Items mit
     * `rotation_required` ab. Das ist richtig: wer hinausgeworfen wurde, hält
     * den alten KEK, und ohne Rotation liefe alles Neue weiter unter genau
     * diesem Schlüssel.
     *
     * Bis zum 2026-08-27 hörte dieser Test hier auf, weil es im Produkt keinen
     * Weg gab, die Schuld zu begleichen - der Vault konnte rotieren, der
     * Daemon hatte die Zeremonie, das Home nahm die Aufzeichnung an, und
     * dazwischen fehlte E5s viertes Bedienelement. Jetzt geht er weiter, und
     * die zweite Hälfte ist die interessantere: **rotieren allein reicht
     * nicht.** Danach gehört das Schreibrecht dieses Geräts zur alten Fassung,
     * und die Domäne wäre eine Stufe später wieder zu. Der Durchlauf hat
     * beides gefunden; hier steht beides.
     */
    await sodium.ready;
    const { profilePath, session } = await foundedDevice();
    await enrolSecondDevice(profilePath, session);
    const profile = readPicoCompanionProfile(profilePath);
    const input = {
      daemonClient: session.consumerClient,
      profile,
      profilePath,
      sodium: sodium as unknown as VaultSodium,
    };
    await createPicoCompanionReaderCustodySpace(input);
    await writePicoCompanionReaderCustodyNote({ ...input, text: 'Vor dem Hinauswerfen.' });
    await letPicoCompanionOtherDeviceRead(input);

    const linkClient = await createPicoCompanionLinkClient({
      profile,
      daemonClient: session.consumerClient,
      sodium: sodium as unknown as VaultSodium,
    });
    const domains = await readPicoCompanionDomainReadership({
      livingDeviceLinkClient: linkClient,
    });
    const domain = domains.find((entry) => entry.readers.length > 0)!;
    await revokePicoCompanionDomainReader({
      profile,
      daemonClient: session.consumerClient,
      livingDeviceLinkClient: linkClient,
      sodium: sodium as unknown as VaultSodium,
      domain,
      reader: domain.readers[0]!,
      reasonCategory: 'reader_removed',
    });

    await expect(writePicoCompanionReaderCustodyNote({
      ...input,
      text: 'Nach dem Hinauswerfen.',
    })).rejects.toThrow('rotation_required');

    const rotated = await rotatePicoCompanionReaderCustodyDomain(input);
    expect(rotated.rotated).toBe(true);
    // Die Fassung ist gestiegen, und das Recht dieses Geräts ist mitgegangen.
    expect(rotated.kekVersion).toBe(2);
    expect(rotated.writerGrantRenewed).toBe(true);
    // Niemand bleibt: der eine Leser war der, der hinausgeworfen wurde.
    expect(rotated.remainingReaders).toBe(0);

    /**
     * Und der Satz, um den es geht. Ohne ihn wäre der ganze Block eine
     * Behauptung über Aufzeichnungen; mit ihm ist er die Aussage, dass eine
     * Person nach dem Hinauswerfen weiterschreiben kann.
     */
    const after = await writePicoCompanionReaderCustodyNote({
      ...input,
      text: 'Nach dem Schlosswechsel.',
    });
    expect(after.memoryItemId).toMatch(/^mem_/u);

    // Und ein zweites Drücken sagt, dass nichts zu tun ist, statt einen
    // zweiten KEK zu erzeugen, den niemand verlangt hat.
    const again = await rotatePicoCompanionReaderCustodyDomain(input);
    expect(again).toMatchObject({ rotated: false, writerGrantRenewed: false });
  }, 300_000);

  it('setzt eine angefangene Anlage fort, statt sie zu verweigern', async () => {
    /**
     * Am Durchlauf gelernt. Die Raumdatei wird **vor** der Abgabe geschrieben,
     * damit eine Abgabe, die auf halbem Weg abbricht, nicht spurlos ist. Damit
     * fände ein zweites Drücken einen Raum vor - und eine Ablehnung „du hast
     * schon einen" wäre dann die Sackgasse und nicht die Rettung.
     *
     * Zweimal drücken muss also dieselbe Domäne ergeben und keinen Fehlschlag.
     */
    await sodium.ready;
    const { profilePath, session } = await foundedDevice();
    const profile = readPicoCompanionProfile(profilePath);
    const input = {
      daemonClient: session.consumerClient,
      profile,
      profilePath,
      sodium: sodium as unknown as VaultSodium,
    };

    const first = await createPicoCompanionReaderCustodySpace(input);
    const second = await createPicoCompanionReaderCustodySpace(input);
    expect(second.domainAuthorityId).toBe(first.domainAuthorityId);
    expect(readPicoCompanionReaderCustodySpace(profilePath)?.domainId).toBe(first.domainId);
  }, 300_000);

  it('sagt, dass es kein zweites Gerät gibt, statt still nichts zu tun', async () => {
    /**
     * ADR 0077 C4. „Du hast nur dieses eine Gerät" ist etwas, worauf eine
     * Person handeln kann - sie kann ein zweites einziehen lassen. Ein stiller
     * Fehlschlag an derselben Stelle sähe aus wie ein kaputter Knopf.
     *
     * Der Satz kommt aus einem echten Lebenszyklus-Lesevorgang beim Home und
     * nicht aus einer Vorrichtung: ein frisch gegründetes Home hat genau ein
     * Gerät, und das ist dieses.
     */
    await sodium.ready;
    const { profilePath, session } = await foundedDevice();
    const profile = readPicoCompanionProfile(profilePath);
    const input = {
      daemonClient: session.consumerClient,
      profile,
      profilePath,
      sodium: sodium as unknown as VaultSodium,
    };
    await createPicoCompanionReaderCustodySpace(input);

    await expect(letPicoCompanionOtherDeviceRead(input))
      .rejects.toThrow('no_other_active_device');
  }, 300_000);

  it('schreibt nicht in einen Raum, den es nicht gibt', async () => {
    // Benannt statt stumm, und geprüft **vor** jedem Netzverkehr: ein Gerät
    // ohne Raum soll nicht erst ein Home fragen, um das zu erfahren.
    await sodium.ready;
    const { profilePath, session } = await foundedDevice();
    const profile = readPicoCompanionProfile(profilePath);
    await expect(writePicoCompanionReaderCustodyNote({
      daemonClient: session.consumerClient,
      profile,
      profilePath,
      sodium: sodium as unknown as VaultSodium,
      text: 'nirgendwohin',
    })).rejects.toThrow('no_reader_custody_space');
  }, 300_000);

  it('und die Antwort kam vom Home, nicht aus dieser Datei', async () => {
    /**
     * Ohne diese Hälfte wäre die ganze Datei über einem Client grün, der nie
     * eine Verbindung aufbaut. Dieselbe Frage an ein totes Home muss werfen.
     */
    await sodium.ready;
    const { profilePath, socketPath, session, home } = await foundedDevice();
    const profile = readPicoCompanionProfile(profilePath);
    const space = await createPicoCompanionReaderCustodySpace({
      daemonClient: session.consumerClient,
      profile,
      profilePath,
      sodium: sodium as unknown as VaultSodium,
    });
    const linkClient = await createPicoCompanionLinkClient({
      profile,
      daemonClient: session.consumerClient,
      sodium: sodium as unknown as VaultSodium,
    });

    home.kill('SIGTERM');
    await expect(readPicoCompanionReaderCustodyNotes({
      linkClient,
      socketPath,
      readerKeyFingerprintHex: profile.device.keyAgreementKeyFingerprintHex,
      domainAuthorityId: space.domainAuthorityId,
    })).rejects.toThrow();
  }, 300_000);
});
