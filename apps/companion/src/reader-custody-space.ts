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
  fetchPicoCompanionReaderCustodyRotationBundle,
  submitPicoCompanionAuthorityRecord,
  submitPicoCompanionKekRotation,
  publishPicoCompanionReaderKeyFreshness,
  submitPicoCompanionReaderCustodyRecords,
  submitPicoCompanionReaderGrant,
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
  /**
   * ADR 0101. Die Fassungen zwischen der Domäne und dem geltenden Schreibrecht.
   *
   * **Nachgetragen am 2026-08-27**, an einem Durchlauf gefunden: nach einer
   * Rotation nennt die Domäne die Fassung eins und das Schreibrecht die zwei,
   * und ohne diese Kette kann der Vault die beiden nicht verbinden. Fehlt das
   * Feld, gab es nie eine Rotation - eine Raumdatei von vor diesem Tag liest
   * sich also richtig, statt ungültig zu sein.
   */
  rotationRecords?: Record<string, unknown>[];
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
  /**
   * **Ein zweites Drücken macht keinen zweiten Raum - es beendet den ersten.**
   *
   * Am Durchlauf gelernt (2026-08-27). Zuerst stand hier eine Ablehnung, und
   * die war für den falschen Fehlschlag gedacht: „du hast schon einen" ist
   * richtig, wenn der Raum fertig ist, und falsch, wenn die Abgabe auf halbem
   * Weg abgebrochen ist. Genau das geschah - die Domäne lag beim Home, das
   * Schreibrecht nicht, und die Person hätte für immer eine Ablehnung
   * gelesen.
   *
   * Die Abgabe ist wiederholbar: dieselben Aufzeichnungen noch einmal zu
   * schicken beantwortet der Home mit „schon da" und nicht mit einem Fehler.
   */
  const unfinished = readPicoCompanionReaderCustodySpace(input.profilePath);
  if (unfinished !== undefined) {
    await submitPicoCompanionReaderCustodyRecords({
      linkClient: await createPicoCompanionLinkClient({
        profile: input.profile,
        daemonClient: input.daemonClient,
        sodium: input.sodium,
        ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
      }),
      records: {
        domainRecord: unfinished.domainRecord,
        writerGrantRecord: unfinished.writerGrantRecord,
      },
    });
    return unfinished;
  }
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
  /**
   * **Benannt statt leer.** Hier stand `?? ''`, und ein leerer öffentlicher
   * Schlüssel wäre in ein Schreibrecht gewandert, das niemand mehr benutzen
   * kann - eine Zeremonie mit einer Zustimmung, die eine unbrauchbare
   * Urkunde erzeugt. Ein nicht entsperrter Schlüssel ist kein leerer.
   */
  const signing = status.sessions.find(
    (session) => session.keyFingerprintHex
      === input.profile.device.signingKeyFingerprintHex,
  );
  if (signing === undefined) {
    throw new Error('device_signing_key_not_unlocked');
  }

  const authorizedAt = new Date().toISOString();
  const domainAuthorityId = `authority_${randomUUID()}`;
  /**
   * **Der Raumname trägt seine Kennung** - am Durchlauf gelernt. Ein fester
   * Name kollidiert mit `UNIQUE (home_id, privacy_domain)`, sobald irgendwann
   * einmal eine Domäne dieses Namens beim Home liegt, die dieses Gerät nicht
   * mehr kennt. Dann wäre jeder weitere Versuch `conflicting_record`, für
   * immer, ohne dass die Person etwas tun könnte.
   */
  const domainId = `chosen-readers-${domainAuthorityId.slice(-12)}`;
  /**
   * **Ohne `agreementKeyFingerprintHex`** - am Durchlauf gelernt, 2026-08-27.
   * Die Domänen-Zeremonie kennt es nicht: der KEK entsteht im Daemon und wird
   * auf den Leserschlüssel *als Datensatz* versiegelt, nicht über eine offene
   * Sitzung. Ein Feld zu viel ist hier `invalid_request`, und das `as never`
   * unten hat die Typprüfung an genau dieser Stelle stummgeschaltet.
   */
  const { domainRecord } = await input.daemonClient.ceremonyCreateDomain({
    signerKeyFingerprintHex: input.profile.identity.keyFingerprintHex,
    ownerReaderKeyRecord: {
      suite: picoIdentitySuite,
      keyRole: 'device_key_agreement',
      publicKeyHex: agreement.publicKeyHex,
    },
    domainAuthorityId,
    homeId,
    hostSigningKeyFingerprintHex: input.profile.host.signingKeyFingerprintHex,
    domainId,
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
      publicKeyHex: signing.publicKeyHex,
    },
    writerGrantId: `writer_${randomUUID()}`,
    // Dieselbe Person schreibt in ihren eigenen Raum.
    writerIdentityKeyFingerprintHex: input.profile.identity.keyFingerprintHex,
    validFrom: authorizedAt,
    validUntil: new Date(Date.parse(authorizedAt) + 365 * 24 * 60 * 60 * 1_000).toISOString(),
    lifecycleOrder: 'seq:0000000000000002',
  } as never);

  const space: PicoCompanionReaderCustodySpace = {
    domainRecord,
    writerGrantRecord,
    domainId,
    domainAuthorityId,
  };
  /**
   * **Erst aufschreiben, dann abgeben** - umgedreht am 2026-08-27, nachdem der
   * Durchlauf gezeigt hat, was die andere Reihenfolge kostet. Sie war für den
   * Fehlschlag „Home kennt den Raum nicht" gedacht; der teurere ist der
   * andere: eine Abgabe, die auf halbem Weg abbricht, ließ ein Gerät ohne
   * jede Spur zurück, während beim Home schon etwas lag. Ein Raum, den dieses
   * Gerät kennt und der Home noch nicht, ist reparierbar - der umgekehrte
   * Fall war es nicht.
   */
  writeFileSync(
    picoCompanionReaderCustodySpacePath(input.profilePath),
    JSON.stringify(space, null, 2),
    'utf8',
  );
  await submitPicoCompanionReaderCustodyRecords({
    linkClient: await createPicoCompanionLinkClient({
      profile: input.profile,
      daemonClient: input.daemonClient,
      sodium: input.sodium,
      ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
    }),
    records: { domainRecord, writerGrantRecord },
  });
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
    // Ohne sie kann der Vault ein Recht der neuen Fassung nicht gegen eine
    // Domäne der alten prüfen; leer heißt, es gab nie eine Rotation.
    rotationRecords: space.rotationRecords ?? [],
    agreementKeyFingerprintHex: input.profile.device.keyAgreementKeyFingerprintHex,
    writerSigningKeyFingerprintHex: input.profile.device.signingKeyFingerprintHex,
    packageId: `package_${randomUUID()}`,
    memoryItemId: `mem_${randomUUID()}`,
    contentType: 'text/plain',
    plaintext: input.text,
    createdAt: new Date().toISOString(),
  });
}

/**
 * ADR 0101 mit ADR 0130 E5 - das Schloss wechseln, nachdem jemand hinaus ist.
 *
 * **Warum es das geben muss.** Jede beendete Leserberechtigung erzeugt im Home
 * eine Rotationsschuld, und solange sie besteht, weist es neue Items mit
 * `rotation_required` ab. Das ist richtig: wer hinausgeworfen wurde, hält den
 * alten KEK, und ohne Rotation liefe alles Neue weiter unter genau diesem
 * Schlüssel. Bis zum 2026-08-27 konnte diese Schuld im Produkt niemand
 * begleichen - der Vault konnte rotieren, der Daemon hatte die Zeremonie, das
 * Home nahm die Aufzeichnung an, und dazwischen fehlte diese Funktion. Ein
 * Raum, den man verschließen, aber nicht wieder aufschließen kann, ist
 * schlimmer als einer ohne Schloss.
 *
 * **Die Listen kommen vom Home, nicht von hier.** Anlässe und verbleibende
 * Leser werden dort gegen die eigene Rechnung geprüft; eine Rotation mit einer
 * selbst zusammengesuchten Liste käme als `invalid_record` zurück, ohne zu
 * sagen, welche falsch war.
 *
 * **Nichts zu tun ist eine Antwort.** Wer ohne offenen Anlass rotiert, würde
 * einen zweiten KEK erzeugen, den niemand verlangt hat, und das Home lehnte
 * ihn ab - die Person sähe eine Ablehnung für einen Knopf, der einfach nichts
 * zu tun hatte. Deshalb sagt diese Funktion es vorher.
 *
 * **Und sie tut zwei Dinge, weil eines nicht reicht.** Nach der Rotation
 * gehört das Schreibrecht dieses Geräts zur alten Fassung, und das Home weist
 * es mit `inactive_writer_grant` ab - eine zweite Sackgasse, eine Stufe
 * später. „Das Schloss wechseln" heißt für eine Person, danach wieder
 * hineinschreiben zu können; also gehört das neue Recht in dieselbe Handlung.
 */
export async function rotatePicoCompanionReaderCustodyDomain(input: {
  daemonClient: PicoVaultDaemonClient;
  profile: PicoCompanionProfile;
  profilePath: string;
  sodium: VaultSodium;
  fetch?: typeof fetch;
}): Promise<{
  rotated: boolean;
  writerGrantRenewed: boolean;
  /** Ob die Raumdatei Rotationen nachgetragen bekam, die sie nicht kannte. */
  chainCaughtUp: boolean;
  kekVersion: number;
  remainingReaders: number;
}> {
  const space: PicoCompanionReaderCustodySpace | undefined =
    readPicoCompanionReaderCustodySpace(input.profilePath);
  if (space === undefined) {
    throw new Error('no_reader_custody_space');
  }
  const linkClient = await createPicoCompanionLinkClient({
    profile: input.profile,
    daemonClient: input.daemonClient,
    sodium: input.sodium,
    ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
  });
  const bundle = await fetchPicoCompanionReaderCustodyRotationBundle({
    linkClient,
    domainAuthorityId: space.domainAuthorityId,
  });

  /**
   * **Die Kette zuerst nachtragen, bevor irgendetwas entschieden wird.**
   *
   * Rotationsaufzeichnungen sind öffentliche Aussagen des Homes, keine
   * Zeremonie - sie hier zu übernehmen ist Buchhaltung. Eine Raumdatei von vor
   * dem 2026-08-27 hat das Feld gar nicht, und eine, deren Gerät bei einer
   * Rotation eines anderen Geräts nicht dabei war, hat es unvollständig. Ohne
   * diesen Schritt sagte der Knopf „nichts zu tun" und das Schreiben blieb
   * abgewiesen - am Durchlauf gefunden, an genau diesem Zustand.
   */
  const chainWasStale = (space.rotationRecords ?? []).length !== bundle.rotations.length;
  if (chainWasStale) {
    writeFileSync(
      picoCompanionReaderCustodySpacePath(input.profilePath),
      `${JSON.stringify({ ...space, rotationRecords: bundle.rotations }, null, 2)}\n`,
      'utf8',
    );
    space.rotationRecords = bundle.rotations;
  }

  const versionOf = (record: unknown): number =>
    (record as { rotation?: { kekVersion?: number } }).rotation?.kekVersion ?? 0;
  const writerGrantVersion = (space.writerGrantRecord as {
    grant?: { kekVersion?: number };
  }).grant?.kekVersion ?? 1;
  let version = Math.max(
    (space.domainRecord as { domain?: { kekVersion?: number } }).domain?.kekVersion ?? 1,
    ...bundle.rotations.map(versionOf),
  );
  const causes = bundle.readerGrantLifecycles.length + bundle.writerGrantLifecycles.length;

  /**
   * **Nichts zu tun ist eine Antwort, und sie hat zwei Bedingungen.**
   *
   * Ohne offenen Anlass zu rotieren erzeugte einen zweiten KEK, den niemand
   * verlangt hat, und das Home lehnte ihn ab - die Person sähe eine Ablehnung
   * für einen Knopf, der einfach nichts zu tun hatte.
   *
   * Aber ein Schreibrecht der alten Fassung ist *auch* etwas zu tun. So steht
   * ein zweites Gerät da, nachdem das erste rotiert hat; ohne diesen Zweig
   * bekäme es für immer `inactive_writer_grant` auf einen Knopf, der sagt,
   * es sei nichts zu tun. Am Durchlauf gefunden (2026-08-27), an genau diesem
   * Zustand.
   */
  if (causes === 0 && writerGrantVersion === version) {
    return Object.freeze({
      rotated: false,
      writerGrantRenewed: false,
      chainCaughtUp: chainWasStale,
      kekVersion: version,
      remainingReaders: bundle.remainingReaderGrants.length,
    });
  }

  const now = new Date();
  const rotations = [...bundle.rotations];
  if (causes > 0) {
    const { rotationRecord } = await input.daemonClient.ceremonyRotateDomain({
      signerKeyFingerprintHex: input.profile.identity.keyFingerprintHex,
      domainRecord: bundle.domain,
      rotationRecords: bundle.rotations,
      readerGrantLifecycleRecords: bundle.readerGrantLifecycles,
      writerGrantLifecycleRecords: bundle.writerGrantLifecycles,
      remainingReaderGrantRecords: bundle.remainingReaderGrants,
      rotationId: `rotation_${randomUUID()}`,
      rotatedAt: now.toISOString(),
      /**
       * Über allen Anlässen, die sie deckt - das Home verlangt genau das, und
       * Millisekunden erfüllen es, weil die Anlässe vorher entstanden sind.
       * Dieselbe Ordnung wie bei den Mitgliedschaften und den Leserrechten.
       */
      lifecycleOrder: `seq:${String(now.getTime()).padStart(16, '0')}`,
    });
    await submitPicoCompanionKekRotation({
      linkClient,
      record: rotationRecord as unknown as Record<string, unknown>,
    });
    rotations.push(rotationRecord as unknown as Record<string, unknown>);
    version = versionOf(rotationRecord);
  }

  /**
   * **Und ein Schreibrecht für die geltende Fassung** - am Durchlauf gelernt
   * (2026-08-27).
   *
   * Nach der Rotation stimmte die Schuld, und die Person konnte trotzdem
   * nicht schreiben: `recordItem` verlangt, dass die Fassung des Items *und*
   * die des Schreibrechts die aktuelle ist, und das alte Recht gehört zur
   * alten. Eine Rotation ohne diesen zweiten Schritt wäre eine Sackgasse eine
   * Stufe später - dieselbe Person, derselbe Raum, eine andere Ablehnung.
   *
   * Das gehört deshalb in dieselbe Handlung und nicht in einen zweiten Knopf:
   * „das Schloss wechseln" heißt für eine Person, danach wieder
   * hineinschreiben zu können.
   */
  const signing = (await input.daemonClient.status()).sessions.find((session) =>
    session.keyFingerprintHex === input.profile.device.signingKeyFingerprintHex);
  if (signing === undefined) {
    throw new Error('device_signing_key_not_unlocked');
  }
  const { writerGrantRecord } = await input.daemonClient.ceremonyCreateWriterGrant({
    signerKeyFingerprintHex: input.profile.identity.keyFingerprintHex,
    domainRecord: bundle.domain,
    rotationRecords: rotations,
    writerDeviceSigningKeyRecord: {
      suite: picoIdentitySuite,
      keyRole: 'device_signing',
      publicKeyHex: signing.publicKeyHex,
    },
    writerGrantId: `writer_${randomUUID()}`,
    writerIdentityKeyFingerprintHex: input.profile.identity.keyFingerprintHex,
    validFrom: now.toISOString(),
    validUntil: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1_000).toISOString(),
    lifecycleOrder: `seq:${String(now.getTime() + 1).padStart(16, '0')}`,
  } as never);
  await submitPicoCompanionAuthorityRecord({
    linkClient,
    resource: 'reader_custody_writer_grant',
    record: writerGrantRecord as unknown as Record<string, unknown>,
  });

  /**
   * Die Raumdatei zeigt erst danach auf das neue Recht. Sie vorher zu
   * schreiben wäre hier falsch herum: bis das Home die Aufzeichnungen
   * angenommen hat, ist das alte Recht das gültige.
   */
  writeFileSync(
    picoCompanionReaderCustodySpacePath(input.profilePath),
    `${JSON.stringify({ ...space, writerGrantRecord, rotationRecords: rotations }, null, 2)}\n`,
    'utf8',
  );

  return Object.freeze({
    rotated: causes > 0,
    writerGrantRenewed: true,
    chainCaughtUp: chainWasStale,
    kekVersion: version,
    remainingReaders: bundle.remainingReaderGrants.length,
  });
}

/**
 * ADR 0085 mit ADR 0088 - das zweite Gerät derselben Person hereinlassen.
 *
 * **Der erste Fall, für den es reicht, und der einzige.** ADR 0085 lässt nur
 * die Identitätswurzel des Lesers einen Frische-Nachweis unterschreiben. Bei
 * einem eigenen zweiten Gerät ist das dieselbe Wurzel, sie liegt im eigenen
 * Vault, und niemand sonst muss dafür wach sein. Eine andere Person
 * hereinzulassen verlangt, dass *ihr* Gerät in genau diesem Moment antwortet -
 * der Nachweis lebt vier Minuten und wird bei jeder Prüfung neu nachgeschlagen.
 * Dafür gibt es noch keinen Weg, und das ist eine benannte Lücke.
 *
 * Drei Schritte in dieser Reihenfolge: den Nachweis schieben, das Recht
 * erteilen, das Recht abgeben. Umgekehrt lehnte das Home mit
 * `freshness_unavailable` ab - richtig, aber die Person sähe eine Ablehnung
 * für etwas, das sie gerade richtig gemacht hat.
 */
export async function letPicoCompanionOtherDeviceRead(input: {
  daemonClient: PicoVaultDaemonClient;
  profile: PicoCompanionProfile;
  profilePath: string;
  sodium: VaultSodium;
  fetch?: typeof fetch;
}): Promise<{ readerDelegationId: string }> {
  const space = readPicoCompanionReaderCustodySpace(input.profilePath);
  if (space === undefined) {
    throw new Error('no_reader_custody_space');
  }
  const readLifecycle = await createPicoCompanionLifecycleReader({
    profile: input.profile,
    profilePath: input.profilePath,
    daemonClient: input.daemonClient,
    sodium: input.sodium,
    ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
  });
  const snapshot = await readLifecycle();
  /**
   * Das andere Gerät: aktiv, und nicht dieses. „Aktiv" ist die Bedingung, an
   * der es auch das Home misst - ein abgelaufenes oder widerrufenes Gerät
   * hereinzulassen wäre eine Zusage, die beim ersten Lesen bricht.
   */
  const other = (snapshot.devices ?? []).find((device) => device.status === 'active'
    && device.deviceKeyAgreementKeyFingerprintHex
      !== input.profile.device.keyAgreementKeyFingerprintHex);
  if (other === undefined) {
    // Benannt, nicht stumm: „du hast nur dieses eine Gerät" ist etwas, worauf
    // eine Person handeln kann.
    throw new Error('no_other_active_device');
  }

  const linkClient = await createPicoCompanionLinkClient({
    profile: input.profile,
    daemonClient: input.daemonClient,
    sodium: input.sodium,
    ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
  });
  await publishPicoCompanionReaderKeyFreshness({
    daemonClient: input.daemonClient,
    linkClient,
    identityKeyFingerprintHex: input.profile.identity.keyFingerprintHex,
    identityPublicKeyHex: input.profile.identity.publicKeyHex,
    homeId: snapshot.homeId,
    device: other,
  });

  const now = new Date();
  const { readerGrantRecord } = await input.daemonClient.ceremonyCreateReaderGrant({
    signerKeyFingerprintHex: input.profile.identity.keyFingerprintHex,
    agreementKeyFingerprintHex: input.profile.device.keyAgreementKeyFingerprintHex,
    domainRecord: space.domainRecord,
    rotationRecords: [],
    readerKeyRecord: other.deviceKeyAgreementKeyRecord,
    readerGrantId: `reader_${randomUUID()}`,
    readerIdentityKeyFingerprintHex: input.profile.identity.keyFingerprintHex,
    readerDeviceSigningKeyFingerprintHex: other.deviceSigningKeyFingerprintHex,
    readerDelegationId: other.delegationId,
    /**
     * ADR 0088: von dieser Fassung an, nicht rückwirkend. Was vor dem
     * Hereinlassen geschrieben wurde, bleibt dem zweiten Gerät verborgen -
     * die vorsichtige Wahl, und die einzige, die eine Person nicht überrascht.
     */
    accessMode: 'from_version',
    /**
     * Aus der Domäne gelesen, nicht als `1` angenommen. Heute rotiert nichts,
     * also stimmte die Annahme - und ADR 0101 hat die Rotation als Zeremonie
     * gebaut, also stimmt sie beim ersten Mal nicht mehr. Ein Leserrecht mit
     * einer falschen Fassung öffnet eine Fassung, die es nicht mehr gibt.
     */
    firstKekVersion: (space.domainRecord as {
      domain?: { kekVersion?: number };
    }).domain?.kekVersion ?? 1,
    validFrom: now.toISOString(),
    validUntil: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1_000).toISOString(),
    /**
     * Aus der Uhr, nicht als feste `3`. Ein zweites Hereinlassen - nach einem
     * Widerruf, oder für ein drittes Gerät - trüge sonst dieselbe Ordnung wie
     * das erste, und eine Ordnung, die zweimal vorkommt, ordnet nichts.
     * Sechzehn Stellen sind die Form, die der Daemon verlangt.
     */
    lifecycleOrder: `seq:${String(now.getTime()).padStart(16, '0')}`,
  } as never);

  await submitPicoCompanionReaderGrant({ linkClient, record: readerGrantRecord });
  return { readerDelegationId: other.delegationId };
}
