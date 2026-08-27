import {
  fetchPicoCompanionReaderCustodyBundle,
  type PicoCompanionReaderCustodyBundle,
} from '@pico/companion/reader-custody';
import type { PicoLinkDirectClient } from '@pico/vault-daemon/link-direct-client';
import {
  connectPicoVaultDaemonSyncTransport,
  openPicoVaultDaemonReaderAccessSession,
} from '@pico/vault-daemon/reader-access';

/**
 * ADR 0094 mit ADR 0098 - was in einem Reader-Custody-Raum steht, gelesen.
 *
 * **Warum das hier wohnt und nicht im schalenfreien Kern**, gemessen und nicht
 * gewählt: die Leihe verlangt einen *blockierenden* Anschluss (ADR 0096 - ein
 * Lesevorgang läuft ohne Zwischenschritte), und der steckt in
 * `reader-access.ts` mit `node:worker_threads`. `check-companion-boundary`
 * verbietet dem Kern, ihn zu erreichen, weil das der Built-in ist, den eine
 * mobile JS-Laufzeit am ehesten nicht hat.
 *
 * Die Folge ist damit benannt statt entdeckt: **ein Telefon kann so einen Raum
 * heute holen und nicht lesen.** Wer das ändern will, ändert ADR 0096s
 * Nicht-Verschachtelung oder findet für sie eine andere Bauform - nicht diese
 * Datei.
 *
 * **Die Leihe wird geschlossen.** ADR 0098 gibt ihr eine Höchstdauer; sie
 * offen zu lassen hiesse, den Leserschlüssel länger bereitzuhalten, als
 * jemand liest. Das `finally` ist deshalb keine Aufräumarbeit, sondern die
 * Zusage.
 */
export async function readPicoCompanionReaderCustodyNotes(input: {
  linkClient: PicoLinkDirectClient;
  socketPath: string;
  readerKeyFingerprintHex: string;
  domainAuthorityId: string;
  maxDurationMs?: number;
}): Promise<readonly { memoryItemId: string; text: string }[]> {
  const bundle: PicoCompanionReaderCustodyBundle =
    await fetchPicoCompanionReaderCustodyBundle({
      linkClient: input.linkClient,
      domainAuthorityId: input.domainAuthorityId,
    });
  if (bundle.items.length === 0) {
    // Nichts zu lesen ist eine Antwort. Eine Leihe dafür zu öffnen hiesse,
    // den Leserschlüssel für nichts bereitzuhalten.
    return Object.freeze([]);
  }

  const syncTransport = connectPicoVaultDaemonSyncTransport({ socketPath: input.socketPath });
  try {
    const session = openPicoVaultDaemonReaderAccessSession(syncTransport, {
      readerKeyFingerprintHex: input.readerKeyFingerprintHex,
      maxDurationMs: input.maxDurationMs ?? 60_000,
    });
    if (session === undefined) {
      // ADR 0096s zugelassener „nicht verfügbar"-Pfad: der Leserschlüssel ist
      // nicht entsperrt. Das ist etwas anderes als eine Ablehnung.
      throw new Error('reader_key_not_unlocked');
    }
    try {
      const read: { memoryItemId: string; text: string }[] = [];
      for (const itemRecord of bundle.items) {
        const item = itemRecord as { item?: { writerGrantId?: string; memoryItemId?: string } };
        const writerGrantRecord = bundle.writerGrants.find((grant) =>
          (grant as { grant?: { writerGrantId?: string } }).grant?.writerGrantId
            === item.item?.writerGrantId);
        if (writerGrantRecord === undefined) {
          /**
           * Ein Item, dessen Schreibrecht fehlt, wird übergangen und nicht
           * geraten. Übergehen ist die laute Hälfte: es fehlt dann sichtbar in
           * der Liste, statt mit erfundenem Inhalt darin zu stehen.
           */
          continue;
        }
        read.push({
          memoryItemId: item.item?.memoryItemId ?? '',
          text: session.decryptItem({
            domainRecord: bundle.domain,
            /**
             * Fehlt beim Besitzer, und dann wird es auch nicht mitgeschickt:
             * er entschlüsselt über seinen eigenen Umschlag, und ein
             * erfundenes Leserrecht wäre eine Lüge, die auf einen Prüfer
             * wartet.
             */
            ...(bundle.readerGrant === undefined
              ? {}
              : { readerGrantRecord: bundle.readerGrant }),
            writerGrantRecord,
            rotationRecords: bundle.rotations,
            itemRecord,
          } as never),
        });
      }
      return Object.freeze(read);
    } finally {
      session.lock();
    }
  } finally {
    syncTransport.close();
  }
}
