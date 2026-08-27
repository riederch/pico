import { describe, expect, it } from 'vitest';
import {
  submitPicoCompanionReaderCustodyRecords,
  writePicoCompanionReaderCustodyItem,
} from './reader-custody.js';

/**
 * ADR 0086 mit ADR 0130 E5, Roadmap-Befund B5.
 *
 * Was hier geprüft wird, ist die **Reihenfolge** und was auf dem Weg passiert -
 * nicht die Kryptographie, die im Daemon liegt und dort ihre eigenen Tests
 * hat. Erst verschlüsseln, dann abgeben: wer zuerst abgäbe, hätte nichts
 * abzugeben.
 */
const record = { schema: 'pico.reader-custody.item.v1', item: { memoryItemId: 'mem_1' } };

function clients(overrides: {
  outcome?: string;
  result?: Record<string, unknown>;
} = {}) {
  const steps: string[] = [];
  const daemonClient = {
    readerCustodyEncryptItem: async () => {
      steps.push('encrypt');
      return { itemRecord: record };
    },
  } as never;
  const linkClient = {
    request: async (operation: string, args: Record<string, unknown>) => {
      steps.push(`submit:${operation}`);
      expect(args.record).toBe(record);
      return {
        outcome: overrides.outcome ?? 'ok',
        result: overrides.result ?? { inserted: true, memoryItemId: 'mem_1' },
      };
    },
  } as never;
  return { steps, daemonClient, linkClient };
}

const writing = (given: ReturnType<typeof clients>) => writePicoCompanionReaderCustodyItem({
  daemonClient: given.daemonClient,
  linkClient: given.linkClient,
  records: { domainRecord: {}, writerGrantRecord: {} },
  agreementKeyFingerprintHex: 'aa'.repeat(32),
  writerSigningKeyFingerprintHex: 'bb'.repeat(32),
  packageId: 'package_1',
  memoryItemId: 'mem_1',
  contentType: 'text/plain',
  plaintext: 'Der erste Satz, den dieser Ast je getragen hat.',
  createdAt: '2026-08-26T12:00:00.000Z',
});

describe('ADR 0086 - eine Erinnerung unter Reader-Custody, geschrieben', () => {
  it('verschlüsselt zuerst und gibt dann ab', async () => {
    const given = clients();
    await expect(writing(given)).resolves.toEqual({ inserted: true, memoryItemId: 'mem_1' });
    // Die Reihenfolge ist die Sache selbst: wer zuerst abgäbe, hätte nichts
    // abzugeben, und wer den Klartext vor der Bestätigung verwürfe, verlöre
    // ihn, wenn die Leitung reißt.
    expect(given.steps).toEqual(['encrypt', 'submit:home.reader_custody.item.submit']);
  });

  it('reicht den Grund der Ablehnung weiter, statt ihn zu verschlucken', async () => {
    /**
     * Ein „nein" ohne Namen ließe eine Person raten, ob ihr Schreibrecht
     * abgelaufen ist, die Domäne rotiert wurde oder das Gerät die falsche
     * Home fragt - drei Lagen, die drei verschiedene Antworten verlangen.
     */
    const given = clients({
      outcome: 'invalid_arguments',
      result: { refusal: 'unknown_writer_grant' },
    });
    await expect(writing(given)).rejects.toThrow('unknown_writer_grant');
  });

  it('weist eine Antwort zurück, die nicht sagt, ob etwas ankam', async () => {
    // „schon da" ist etwas anderes als „gerade angekommen", und nur das
    // zweite erlaubt einem Gerät, seinen Klartext loszuwerden. Eine Antwort
    // ohne diese Auskunft als Erfolg zu lesen, wäre geraten.
    const given = clients({ result: { memoryItemId: 'mem_1' } });
    await expect(writing(given)).rejects.toThrow('invalid_pico_reader_custody_submit_result');
  });

  it('gibt Domäne und Schreibrecht in dieser Reihenfolge durch die eine Tür ab', async () => {
    /**
     * Ein Schreibrecht ohne seine Domäne wird abgelehnt; die Reihenfolge ist
     * deshalb keine Stilfrage.
     *
     * **Und beide gehen durch `home.authority.submit`** - berichtigt am
     * 2026-08-27. Die erste Fassung gab jeder Aufzeichnung einen eigenen
     * Vorgang; drei davon hatten längst eine Tür, denn dieser Vorgang trägt
     * sie als Ressourcen. Der Test nennt die Ressourcen, weil genau das die
     * Stelle ist, an der eine zweite Liste entstünde.
     */
    const given = clients();
    await submitPicoCompanionReaderCustodyRecords({
      linkClient: {
        request: async (operation: string, args: Record<string, unknown>) => {
          given.steps.push(`${operation}:${String(args.resource)}`);
          return { outcome: 'ok', result: {} };
        },
      } as never,
      records: { domainRecord: {}, writerGrantRecord: {} },
    });
    expect(given.steps).toEqual([
      'home.authority.submit:reader_custody_domain',
      'home.authority.submit:reader_custody_writer_grant',
    ]);
  });
});
