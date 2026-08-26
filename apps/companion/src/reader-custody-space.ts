import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { picoIdentitySuite } from '@pico/protocol';
import type { PicoVaultDaemonClient } from '@pico/vault-daemon/client';
import type { VaultSodium } from '@pico/vault';
import { createPicoCompanionLifecycleReader } from './lifecycle-reader.js';
import type { PicoCompanionProfile } from './profile.js';
import { createPicoCompanionLinkClient } from './recovery-controller.js';
import {
  submitPicoCompanionReaderCustodyRecords,
  writePicoCompanionReaderCustodyItem,
} from './reader-custody.js';

/**
 * ADR 0086 mit ADR 0130 E5 - der Raum, über den die Leserschaft spricht.
 *
 * **Der Ast bekommt sein Subjekt** (Roadmap-Befund B5). Fünfzehn ADRs waren
 * gebaut und geprüft, und nichts im Produkt schrieb je Inhalt unter dieser
 * Verwahrung; die Leserschaft im Fenster zeigte seit dem 2026-08-24, wer lesen
 * darf, und es gab nichts zu lesen.
 *
 * **Zwei Zeremonien, eine Einrichtung.** Die Domäne sagt, wem der Raum gehört;
 * das Schreibrecht sagt, wessen Unterschrift darin angenommen wird. Beide
 * erzeugen Autorität und kosten deshalb je eine Zustimmung (ADR 0099) - das
 * Schreiben danach kostet keine, sonst hörte eine Person auf zu lesen, was sie
 * wegklickt.
 *
 * **Die `homeId` wird gelesen, nicht geraten.** Sie steht im
 * Lebenszyklus-Lesevorgang, den die Companion ohnehin macht; sie ins Profil zu
 * schreiben wäre eine zweite Stelle, an der sie steht, und ein beigetretenes
 * Gerät ohne diese Zeile hätte sie nicht.
 */
export interface PicoCompanionReaderCustodySpace {
  domainRecord: Record<string, unknown>;
  writerGrantRecord: Record<string, unknown>;
  domainId: string;
  domainAuthorityId: string;
}

/** Wo das Gerät seine eigenen Aufzeichnungen hält, neben dem Profil. */
export function picoCompanionReaderCustodySpacePath(profilePath: string): string {
  return join(dirname(profilePath), 'reader-custody-space.json');
}

export function readPicoCompanionReaderCustodySpace(
  profilePath: string,
): PicoCompanionReaderCustodySpace | undefined {
  try {
    return JSON.parse(
      readFileSync(picoCompanionReaderCustodySpacePath(profilePath), 'utf8'),
    ) as PicoCompanionReaderCustodySpace;
  } catch {
    // Kein Raum ist eine Antwort und kein Fehler: die meisten Geräte haben
    // keinen, und die Fläche daneben sagt genau das.
    return undefined;
  }
}

async function homeIdOf(input: {
  profile: PicoCompanionProfile;
  profilePath: string;
  daemonClient: PicoVaultDaemonClient;
  sodium: VaultSodium;
  fetch?: typeof fetch;
}): Promise<string> {
  const readLifecycle = await createPicoCompanionLifecycleReader({
    profile: input.profile,
    profilePath: input.profilePath,
    daemonClient: input.daemonClient,
    sodium: input.sodium,
    ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
  });
  return (await readLifecycle()).homeId;
}

export async function createPicoCompanionReaderCustodySpace(input: {
  daemonClient: PicoVaultDaemonClient;
  profile: PicoCompanionProfile;
  profilePath: string;
  sodium: VaultSodium;
  fetch?: typeof fetch;
}): Promise<PicoCompanionReaderCustodySpace> {
  const homeId = await homeIdOf(input);
  /**
   * Der Leseschlüssel des Besitzers ist der Schlüsselvereinbarungsschlüssel
   * *dieses* Geräts - er steht im Daemon und nicht im Profil, weil das Profil
   * nur seinen Fingerabdruck trägt und ein Umschlag den ganzen Schlüssel
   * braucht.
   */
  const status = await input.daemonClient.status();
  const agreement = status.sessions.find(
    (session) => session.keyFingerprintHex
      === input.profile.device.keyAgreementKeyFingerprintHex,
  );
  if (agreement === undefined) {
    throw new Error('device_key_agreement_key_not_unlocked');
  }

  const authorizedAt = new Date().toISOString();
  const domainAuthorityId = `authority_${randomUUID()}`;
  const { domainRecord } = await input.daemonClient.ceremonyCreateDomain({
    signerKeyFingerprintHex: input.profile.identity.keyFingerprintHex,
    agreementKeyFingerprintHex: agreement.keyFingerprintHex,
    ownerReaderKeyRecord: {
      suite: picoIdentitySuite,
      keyRole: 'device_key_agreement',
      publicKeyHex: agreement.publicKeyHex,
    },
    domainAuthorityId,
    homeId,
    hostSigningKeyFingerprintHex: input.profile.host.signingKeyFingerprintHex,
    domainId: 'chosen-readers',
    authorizedAt,
    lifecycleOrder: 'seq:0000000000000001',
  } as never);

  const { writerGrantRecord } = await input.daemonClient.ceremonyCreateWriterGrant({
    signerKeyFingerprintHex: input.profile.identity.keyFingerprintHex,
    domainRecord,
    rotationRecords: [],
    writerDeviceSigningKeyRecord: {
      suite: picoIdentitySuite,
      keyRole: 'device_signing',
      publicKeyHex: status.sessions.find(
        (session) => session.keyFingerprintHex
          === input.profile.device.signingKeyFingerprintHex,
      )?.publicKeyHex ?? '',
    },
    writerGrantId: `writer_${randomUUID()}`,
    // Dieselbe Person schreibt in ihren eigenen Raum.
    writerIdentityKeyFingerprintHex: input.profile.identity.keyFingerprintHex,
    validFrom: authorizedAt,
    validUntil: new Date(Date.parse(authorizedAt) + 365 * 24 * 60 * 60 * 1_000).toISOString(),
    lifecycleOrder: 'seq:0000000000000002',
  } as never);

  const linkClient = await createPicoCompanionLinkClient({
    profile: input.profile,
    daemonClient: input.daemonClient,
    sodium: input.sodium,
    ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
  });
  await submitPicoCompanionReaderCustodyRecords({
    linkClient,
    records: { domainRecord, writerGrantRecord },
  });

  const space: PicoCompanionReaderCustodySpace = {
    domainRecord,
    writerGrantRecord,
    domainId: 'chosen-readers',
    domainAuthorityId,
  };
  /**
   * Erst schreiben, wenn das Home die beiden hat. Ein Gerät, das seinen Raum
   * kennt und das Home nicht, böte einer Person an, hineinzuschreiben, und
   * jeder Satz würde abgelehnt.
   */
  writeFileSync(
    picoCompanionReaderCustodySpacePath(input.profilePath),
    JSON.stringify(space, null, 2),
    'utf8',
  );
  return space;
}

export async function writePicoCompanionReaderCustodyNote(input: {
  daemonClient: PicoVaultDaemonClient;
  profile: PicoCompanionProfile;
  profilePath: string;
  sodium: VaultSodium;
  text: string;
  fetch?: typeof fetch;
}): Promise<{ memoryItemId: string }> {
  const space = readPicoCompanionReaderCustodySpace(input.profilePath);
  if (space === undefined) {
    // Benannt, nicht stumm: „es gibt keinen Raum" ist etwas, worauf eine
    // Person handeln kann, und „das ging nicht" ist es nicht.
    throw new Error('no_reader_custody_space');
  }
  const linkClient = await createPicoCompanionLinkClient({
    profile: input.profile,
    daemonClient: input.daemonClient,
    sodium: input.sodium,
    ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
  });
  return await writePicoCompanionReaderCustodyItem({
    daemonClient: input.daemonClient,
    linkClient,
    records: {
      domainRecord: space.domainRecord,
      writerGrantRecord: space.writerGrantRecord,
    },
    agreementKeyFingerprintHex: input.profile.device.keyAgreementKeyFingerprintHex,
    writerSigningKeyFingerprintHex: input.profile.device.signingKeyFingerprintHex,
    packageId: `package_${randomUUID()}`,
    memoryItemId: `mem_${randomUUID()}`,
    contentType: 'text/plain',
    plaintext: input.text,
    createdAt: new Date().toISOString(),
  });
}
