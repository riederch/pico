import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  picoIdentitySuite,
  picoMemoryKeyCanonicalLabels,
  picoMemoryKeyImportEntry,
} from '@pico/protocol';
import {
  assertPicoVaultKeyExportPassphraseIsOwn,
  openPicoVaultKeyExport,
  sealPicoVaultKeyExport,
  serializePicoVaultKeyExport,
  type PicoVaultExportedKek,
  type VaultSodium,
} from '@pico/vault';
import type { PicoVaultDaemonClient } from '@pico/vault-daemon/client';
import type { PicoLinkDirectClient } from '@pico/vault-daemon/link-direct-client';
import { writePicoCompanionFileAtomically } from './atomic-file.js';
import { readPicoCompanionHomeId } from './domain-read-grant.js';
import type { PicoCompanionProfile } from './profile.js';
import { signPicoCompanionWithIdentityRoot } from './reader-custody.js';

/**
 * ADR 0158 - die eigenen Speicherschluessel mitnehmen und zurueckbringen.
 *
 * **Die Haelfte einer Wiederherstellung, die eine Person selbst halten kann.**
 * ADR 0072 R6 haelt Schluessel und Daten in getrennten Sicherungen, und das
 * ist richtig: sonst waere ein Shred ein leeres Versprechen. Die Folge war
 * aber, dass eine Sicherung ohne Schluesselspeicher jede verschluesselte
 * Erinnerung dauerhaft unlesbar laesst - und eine Person das nicht
 * verhindern, nur erleiden konnte (Befund B255).
 *
 * **Versiegelt wird hier, auf dem Geraet** (Gabel A). Das Home gibt die rohen
 * Schluessel der Domaenen heraus, die diese Person lesen darf (Gabel B), ueber
 * den versiegelten Kanal; dieses Geraet leitet ab, versiegelt und schreibt.
 * Die Passphrase verlaesst es nie, und das Artefakt kreuzt nie die Leitung.
 */

export interface PicoCompanionMemoryKeyExport {
  path: string;
  domains: number;
  keys: number;
  exportedAt: string;
}

export interface PicoCompanionMemoryKeyImportLine {
  domainId: string;
  outcome: 'restored' | 'already_present' | 'conflicting' | 'refused_not_readable' | 'refused_shredded';
  restoredVersions: number;
}

function identityKeyRecord(profile: PicoCompanionProfile): Record<string, unknown> {
  return {
    suite: picoIdentitySuite,
    keyRole: 'pico_identity',
    publicKeyHex: profile.identity.publicKeyHex,
  };
}

export async function exportPicoCompanionMemoryKeys(input: {
  daemonClient: PicoVaultDaemonClient;
  linkClient: PicoLinkDirectClient;
  profile: PicoCompanionProfile;
  sodium: VaultSodium;
  passphrase: string;
  /** Das Identitaets-Keyfile dieses Geraets - nur fuer KE3, nie geoeffnet behalten. */
  identityKeyfile: string;
  outputPath: string;
}): Promise<PicoCompanionMemoryKeyExport> {
  /**
   * **KE3 zuerst, vor jedem Kontakt mit dem Home.** Eine Exportpassphrase, die
   * die Vault-Passphrase ist, wuerde abgewiesen - und das soll eine Person
   * erfahren, bevor ihr Home Schluessel herausgegeben hat, nicht danach.
   */
  assertPicoVaultKeyExportPassphraseIsOwn(input.sodium, {
    identityKeyfile: input.identityKeyfile,
    passphrase: input.passphrase,
  });

  const homeId = await readPicoCompanionHomeId({ livingDeviceLinkClient: input.linkClient });
  const statement = {
    suite: picoIdentitySuite,
    requestId: `key_export_${randomUUID()}`,
    homeId,
    identityKeyFingerprintHex: input.profile.identity.keyFingerprintHex,
    requestedAt: new Date().toISOString(),
  };
  const signed = await signPicoCompanionWithIdentityRoot(input.daemonClient, {
    keyFingerprintHex: input.profile.identity.keyFingerprintHex,
    label: picoMemoryKeyCanonicalLabels.export,
    fields: statement,
  });
  const answer = await input.linkClient.request('home.memory.keys.export.submit', {
    statement,
    identityKeyRecord: identityKeyRecord(input.profile),
    signatureHex: signed.signatureHex,
  });
  if (answer.outcome !== 'ok') {
    const refusal = (answer.result as { refusal?: unknown }).refusal;
    throw new Error(typeof refusal === 'string' ? refusal : `memory_key_export_${answer.outcome}`);
  }
  const result = answer.result as { homeId?: unknown; exportedAt?: unknown; keks?: unknown };
  if (result.homeId !== homeId
    || typeof result.exportedAt !== 'string'
    || !Array.isArray(result.keks)) {
    throw new Error('invalid_pico_memory_key_export');
  }
  const keks = result.keks as PicoVaultExportedKek[];
  const artifact = sealPicoVaultKeyExport(input.sodium, {
    passphrase: input.passphrase,
    homeId,
    identityKeyFingerprintHex: input.profile.identity.keyFingerprintHex,
    exportedAt: result.exportedAt,
    keks,
  });
  writePicoCompanionFileAtomically(input.outputPath, serializePicoVaultKeyExport(artifact));
  return {
    path: input.outputPath,
    domains: new Set(keks.map((entry) => entry.domainId)).size,
    keys: keks.length,
    exportedAt: result.exportedAt,
  };
}

export async function importPicoCompanionMemoryKeys(input: {
  daemonClient: PicoVaultDaemonClient;
  linkClient: PicoLinkDirectClient;
  profile: PicoCompanionProfile;
  sodium: VaultSodium;
  passphrase: string;
  artifactPath: string;
}): Promise<readonly PicoCompanionMemoryKeyImportLine[]> {
  const opened = openPicoVaultKeyExport(input.sodium, {
    artifact: readFileSync(input.artifactPath, 'utf8'),
    passphrase: input.passphrase,
  });
  const homeId = await readPicoCompanionHomeId({ livingDeviceLinkClient: input.linkClient });
  /**
   * Die Datei gehoert einem Home und einer Person. Schluessel eines anderen
   * Homes in dieses zu schreiben, ergaebe Dateien, die zu nichts hier passen -
   * und die Person, deren Datei es ist, muss es selbst zurueckbringen.
   */
  if (opened.header.homeId !== homeId) {
    throw new Error('key_export_from_another_home');
  }
  if (opened.header.identityKeyFingerprintHex !== input.profile.identity.keyFingerprintHex) {
    throw new Error('key_export_of_another_person');
  }
  const statement = {
    suite: picoIdentitySuite,
    requestId: `key_import_${randomUUID()}`,
    homeId,
    identityKeyFingerprintHex: input.profile.identity.keyFingerprintHex,
    exportedAt: opened.header.exportedAt,
    entries: opened.keks
      .map((entry) => picoMemoryKeyImportEntry(entry.domainId, entry.version, entry.digestHex))
      .sort(),
    requestedAt: new Date().toISOString(),
  };
  const signed = await signPicoCompanionWithIdentityRoot(input.daemonClient, {
    keyFingerprintHex: input.profile.identity.keyFingerprintHex,
    label: picoMemoryKeyCanonicalLabels.import,
    fields: statement,
  });
  const answer = await input.linkClient.request('home.memory.keys.import.submit', {
    statement,
    identityKeyRecord: identityKeyRecord(input.profile),
    signatureHex: signed.signatureHex,
    keks: opened.keks.map((entry) => ({
      domainId: entry.domainId,
      version: entry.version,
      kekHex: entry.kekHex,
    })),
  });
  if (answer.outcome !== 'ok') {
    const refusal = (answer.result as { refusal?: unknown }).refusal;
    throw new Error(typeof refusal === 'string' ? refusal : `memory_key_import_${answer.outcome}`);
  }
  const domains = (answer.result as { domains?: unknown }).domains;
  if (!Array.isArray(domains)) {
    throw new Error('invalid_pico_memory_key_import');
  }
  return Object.freeze(domains as PicoCompanionMemoryKeyImportLine[]);
}
