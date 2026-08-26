import {
  picoIdentityReaderKeyFreshnessCheckpointSchema,
  picoIdentityReaderKeyFreshnessSignatureInputLabel,
  picoIdentitySuite,
} from '@pico/protocol';
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

/**
 * ADR 0085 mit ADR 0089. Der Frische-Nachweis für ein Gerät dieser Identität.
 *
 * **Wessen Wurzel unterschreibt, entscheidet, wer wach sein muss.** ADR 0085
 * lässt nur die Identitätswurzel des *Lesers* einen Nachweis unterschreiben.
 * Für eine andere Person heisst das: ihr Gerät muss in genau dem Moment
 * antworten, denn ein Nachweis lebt höchstens fünf Minuten und der Prüfer
 * schlägt bei jeder Prüfung neu nach. Für das **zweite Gerät derselben
 * Person** ist es dieselbe Wurzel - sie liegt in ihrem eigenen Vault, und
 * niemand sonst muss dafür wach sein. Das ist der Fall, den diese Funktion
 * bedient, und der einzige, für den es heute reicht.
 *
 * Keine Zustimmung: `pico.id.reader-key-freshness.v1` steht auf der
 * zustimmungsfreien Liste des Daemons, und das ist richtig - der Nachweis
 * schafft keine Autorität, er stellt fest, dass keine spätere Aussage die
 * Bindung ungültig macht, und er muss alle fünf Minuten wiederholbar sein.
 * Wer dafür jedes Mal gefragt würde, klickte bald weg.
 */
export async function publishPicoCompanionReaderKeyFreshness(input: {
  daemonClient: PicoVaultDaemonClient;
  linkClient: PicoLinkDirectClient;
  identityKeyFingerprintHex: string;
  identityPublicKeyHex: string;
  homeId: string;
  device: {
    delegationId: string;
    deviceSigningKeyFingerprintHex: string;
    deviceKeyAgreementKeyFingerprintHex: string;
    lifecycleOrder: string;
  };
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  const checkpoint = {
    suite: picoIdentitySuite,
    checkpointId: `freshness_${input.device.delegationId}_${now.getTime()}`,
    homeId: input.homeId,
    issuerIdentityKeyFingerprintHex: input.identityKeyFingerprintHex,
    deviceSigningKeyFingerprintHex: input.device.deviceSigningKeyFingerprintHex,
    deviceKeyAgreementKeyFingerprintHex: input.device.deviceKeyAgreementKeyFingerprintHex,
    delegationId: input.device.delegationId,
    status: 'current' as const,
    observedThroughLifecycleOrder: input.device.lifecycleOrder,
    checkedAt: now.toISOString(),
    /**
     * Vier Minuten statt fünf. Der Prüfer weist ein Fenster über fünf zurück,
     * und ein Nachweis, der genau am Deckel liegt, wird von jeder Uhrabweichung
     * zwischen hier und dem Home zu einem, der schon abgelaufen ankommt.
     */
    freshUntil: new Date(now.getTime() + 4 * 60 * 1_000).toISOString(),
  };
  const signed = await input.daemonClient.sign({
    keyFingerprintHex: input.identityKeyFingerprintHex,
    label: picoIdentityReaderKeyFreshnessSignatureInputLabel,
    fields: checkpoint,
  });
  if (signed.keyRole !== 'pico_identity') {
    // Nur die Wurzel darf. Die Rolle hier zu prüfen ist kein zweites Tor -
    // der Vault lässt nichts anderes zu -, sondern der Satz, an dem ein
    // Aufrufer merkt, dass er den falschen Fingerabdruck geschickt hat.
    throw new Error('pico_identity_key_required');
  }
  const answer = await input.linkClient.request('home.reader_key.freshness.submit', {
    checkpoint: {
      schema: picoIdentityReaderKeyFreshnessCheckpointSchema,
      checkpoint,
      issuerIdentityKeyRecord: {
        suite: picoIdentitySuite,
        keyRole: 'pico_identity',
        publicKeyHex: input.identityPublicKeyHex,
      },
      issuerSignatureHex: signed.signatureHex,
    },
  });
  if (answer.outcome !== 'ok') {
    const refusal = (answer.result as { refusal?: unknown }).refusal;
    throw new Error(typeof refusal === 'string' ? refusal : `freshness_${answer.outcome}`);
  }
}

/** ADR 0086 mit ADR 0088. Wer die Domäne lesen darf, beim Home abgegeben. */
export async function submitPicoCompanionReaderGrant(input: {
  linkClient: PicoLinkDirectClient;
  record: Record<string, unknown>;
}): Promise<void> {
  const answer = await input.linkClient.request('home.reader_custody.reader_grant.submit', {
    record: input.record,
  });
  if (answer.outcome !== 'ok') {
    const refusal = (answer.result as { refusal?: unknown }).refusal;
    /**
     * Der Grund reist weiter, und hier trägt er besonders viel: `freshness_
     * unavailable` heisst „der Nachweis fehlt oder ist abgelaufen" und ist
     * etwas völlig anderes als `reader_is_not_active_member`. Die Fläche
     * darüber kann auf das erste etwas tun und auf das zweite nicht.
     */
    throw new Error(typeof refusal === 'string' ? refusal : `reader_grant_${answer.outcome}`);
  }
}
