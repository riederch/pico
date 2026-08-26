import type { PicoVaultDaemonClient } from '@pico/vault-daemon/client';
import type { PicoLinkDirectClient } from '@pico/vault-daemon/link-direct-client';

/**
 * ADR 0086 mit ADR 0130 E5 - eine Erinnerung unter Reader-Custody, geschrieben.
 *
 * **Der Ast hatte kein Subjekt** (Roadmap-Befund B5). ADR 0078 und 0082-0096
 * sind gebaut und geprüft; das Home nahm einen Item-Record entgegen, prüfte
 * Unterschrift, Schreibrecht, Domäne und KEK-Version - und die einzige Route
 * dorthin war Home-zu-Home. Nichts, was eine Person in der Hand hält, hat je
 * etwas unter dieser Verwahrung geschrieben.
 *
 * Diese Datei ist die Hand. Sie hält keinen Schlüssel: das Verschlüsseln läuft
 * im Vault-Daemon, weil der KEK dort bleibt, und was hier durchgeht, ist der
 * Klartext auf dem Weg hinein und ein fertiger Record auf dem Weg hinaus.
 */
export interface PicoCompanionReaderCustodyRecords {
  domainRecord: Record<string, unknown>;
  writerGrantRecord: Record<string, unknown>;
}

/**
 * Schreibt einen Satz in eine Domäne, die dieser Person gehört.
 *
 * **Drei Schritte, in dieser Reihenfolge, und die Reihenfolge ist die Sache
 * selbst**: verschlüsseln im Daemon, abgeben beim Home, und erst dann darf
 * der Aufrufer den Klartext loswerden. Wer zuerst abgäbe und dann
 * verschlüsselte, hätte nichts abzugeben; wer den Klartext vor der Bestätigung
 * verwürfe, hätte ihn verloren, wenn die Leitung reißt.
 */
export async function writePicoCompanionReaderCustodyItem(input: {
  daemonClient: PicoVaultDaemonClient;
  linkClient: PicoLinkDirectClient;
  records: PicoCompanionReaderCustodyRecords;
  agreementKeyFingerprintHex: string;
  writerSigningKeyFingerprintHex: string;
  packageId: string;
  memoryItemId: string;
  contentType: string;
  plaintext: string;
  createdAt: string;
}): Promise<{ inserted: boolean; memoryItemId: string }> {
  const { itemRecord } = await input.daemonClient.readerCustodyEncryptItem({
    agreementKeyFingerprintHex: input.agreementKeyFingerprintHex,
    writerSigningKeyFingerprintHex: input.writerSigningKeyFingerprintHex,
    domainRecord: input.records.domainRecord,
    writerGrantRecord: input.records.writerGrantRecord,
    packageId: input.packageId,
    memoryItemId: input.memoryItemId,
    contentType: input.contentType,
    plaintext: input.plaintext,
    createdAt: input.createdAt,
  });

  const answer = await input.linkClient.request('home.reader_custody.item.submit', {
    record: itemRecord,
  });
  if (answer.outcome !== 'ok') {
    const refusal = (answer.result as { refusal?: unknown }).refusal;
    /**
     * Der Grund reist weiter. Ein „nein" ohne Namen ließe eine Person raten,
     * ob ihr Schreibrecht abgelaufen ist, die Domäne rotiert wurde oder das
     * Gerät die falsche Home fragt - und die drei verlangen verschiedene
     * Antworten von ihr.
     */
    throw new Error(typeof refusal === 'string' ? refusal : `item_submit_${answer.outcome}`);
  }
  const result = answer.result as { inserted?: unknown; memoryItemId?: unknown };
  if (typeof result.inserted !== 'boolean' || typeof result.memoryItemId !== 'string') {
    throw new Error('invalid_pico_reader_custody_submit_result');
  }
  return { inserted: result.inserted, memoryItemId: result.memoryItemId };
}

/**
 * Gibt Domäne und Schreibrecht beim Home ab, bevor das erste Item kommt.
 *
 * Getrennt vom Schreiben, weil es ein anderer Moment ist: dies geschieht
 * einmal, wenn eine Person einen Raum einrichtet, und das Schreiben jedes Mal,
 * wenn sie etwas hineinlegt. Zusammengefasst würde aus beidem eine Handlung,
 * die manchmal eine Zeremonie ist und manchmal nicht.
 */
export async function submitPicoCompanionReaderCustodyRecords(input: {
  linkClient: PicoLinkDirectClient;
  records: PicoCompanionReaderCustodyRecords;
}): Promise<void> {
  for (const [operation, record] of [
    ['home.reader_custody.domain.submit', input.records.domainRecord],
    ['home.reader_custody.writer_grant.submit', input.records.writerGrantRecord],
  ] as const) {
    const answer = await input.linkClient.request(operation, { record });
    if (answer.outcome !== 'ok') {
      const refusal = (answer.result as { refusal?: unknown }).refusal;
      throw new Error(typeof refusal === 'string' ? refusal : `${operation}_${answer.outcome}`);
    }
  }
}
