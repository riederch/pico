import { describe, expect, it } from 'vitest';
import {
  parsePicoCompanionDomainReadership,
  picoCompanionDomainReadershipLines,
  picoCompanionDomainReadershipSummary,
  picoCompanionReaderRevocationReasonLines,
  type PicoCompanionDomainReadershipRow,
} from './contract.js';
import { picoCompanionRenderedDomainReadership } from './rendered-rows.js';

function domain(
  overrides: Partial<PicoCompanionDomainReadershipRow> = {},
): PicoCompanionDomainReadershipRow {
  return {
    domainId: 'notes',
    domainAuthorityId: 'authority_notes_1',
    ownerDisplay: 'aaaa bbbb cccc dddd',
    readers: [],
    ...overrides,
  };
}

function reader(
  overrides: Partial<PicoCompanionDomainReadershipRow['readers'][number]> = {},
): PicoCompanionDomainReadershipRow['readers'][number] {
  return {
    readerGrantId: 'grant_1',
    readerDisplay: '1111 2222 3333 4444',
    accessMode: 'forward_only',
    status: 'active',
    validUntilDisplay: '31 December 2026',
    ...overrides,
  };
}

describe('ADR 0082 mit ADR 0130 E5 - wer welche Domäne lesen darf', () => {
  it('nennt eine Domäne, die niemand liest, statt sie wegzulassen', () => {
    /**
     * Der Grund, aus dem die Companion zwei Lesevorgänge macht statt eines:
     * eine Ansicht, die nur Domänen mit Lesern zeigt, verschweigt genau das
     * Beruhigende. Der Test hält fest, dass die leere Domäne eine Zeile hat
     * *und* dass die Zusammenfassung es sagt.
     */
    const quiet = [domain()];
    expect(picoCompanionDomainReadershipLines(quiet)).toHaveLength(1);
    expect(picoCompanionDomainReadershipLines(quiet)[0]?.detail)
      .toMatch(/nobody but you/i);
    expect(picoCompanionDomainReadershipSummary(quiet)).toMatch(/nobody but you/i);
  });

  it('unterscheidet eine gelesene Domäne von einer stillen in der Zusammenfassung', () => {
    const mixed = [domain(), domain({ domainId: 'health', readers: [reader()] })];
    const summary = picoCompanionDomainReadershipSummary(mixed);
    expect(summary).toContain('2 domains');
    expect(summary).toContain('1 of them');
    expect(summary).not.toBe(picoCompanionDomainReadershipSummary([domain(), domain()]));
  });

  it('sagt bei gar keiner Domäne nicht, dass niemand mitliest', () => {
    // "Niemand liest mit" über null Domänen wäre eine beruhigende Aussage über
    // etwas, das es nicht gibt.
    expect(picoCompanionDomainReadershipSummary([])).not.toMatch(/nobody but you/i);
  });

  it('bietet das Beenden nur an, wo ein Zugang noch läuft', () => {
    const domains = [domain({
      readers: [
        reader({ readerGrantId: 'active_1' }),
        reader({ readerGrantId: 'expired_1', status: 'expired' }),
        reader({ readerGrantId: 'revoked_1', status: 'revoked' }),
      ],
    })];
    const [line] = picoCompanionDomainReadershipLines(domains);
    const labels = new Map(line!.readers.map((row) => [row.readerGrantId, row.endLabel]));
    expect(labels.get('active_1')).not.toBeNull();
    // Ein Knopf neben einem beendeten Zugang böte eine Handlung an, die nichts
    // tut - und liest sich, als sei der Zugang noch offen.
    expect(labels.get('expired_1')).toBeNull();
    expect(labels.get('revoked_1')).toBeNull();
  });

  it('sagt jeden der vier Zustände verschieden und keinen als Code', () => {
    const domains = [domain({
      readers: (['active', 'not_yet_valid', 'expired', 'revoked'] as const)
        .map((status, index) => reader({ readerGrantId: `g${index}`, status })),
    })];
    const details = picoCompanionDomainReadershipLines(domains)[0]!.readers
      .map((row) => row.detail);
    expect(new Set(details).size).toBe(4);
    for (const detail of details) {
      expect(detail).not.toContain('_');
    }
  });

  it('gibt jedem Widerrufsgrund ein Wort und keinem seinen Code', () => {
    const lines = picoCompanionReaderRevocationReasonLines();
    expect(lines).toHaveLength(5);
    for (const line of lines) {
      expect(line.label, line.reasonCategory).not.toContain('_');
      expect(line.label.length, line.reasonCategory).toBeGreaterThan(0);
    }
    expect(new Set(lines.map((line) => line.label)).size).toBe(lines.length);
  });

  it('weist eine Form zurück, statt sie halb zu lesen', () => {
    expect(() => parsePicoCompanionDomainReadership({})).toThrow('invalid_companion_domain_readership');
    expect(() => parsePicoCompanionDomainReadership([{ domainId: 'x' }]))
      .toThrow('invalid_companion_domain_readership');
    expect(() => parsePicoCompanionDomainReadership([{
      ...domain(), readers: [{ ...reader(), status: 'irgendwas' }],
    }])).toThrow('invalid_companion_domain_reader');
  });

  it('kürzt beide Fingerabdrücke auf dem Weg ins Fenster', () => {
    /**
     * ADR 0079 I5 mit ADR 0113 C2: gekürzt wird im Hauptprozess, weil
     * renderer-erreichbare Dateien die eine Regel dafür nicht erreichen. Der
     * Test hält fest, dass kein voller Schlüssel über die Grenze geht.
     */
    const ownerHex = 'ab'.repeat(32);
    const readerHex = 'cd'.repeat(32);
    const [rendered] = picoCompanionRenderedDomainReadership([{
      domainId: 'notes',
      domainAuthorityId: 'authority_notes_1',
      homeId: 'home_1',
      hostSigningKeyFingerprintHex: 'ef'.repeat(32),
      ownerIdentityKeyFingerprintHex: ownerHex,
      readers: [{
        readerGrantId: 'grant_1',
        readerIdentityKeyFingerprintHex: readerHex,
        readerKeyFingerprintHex: '11'.repeat(32),
        accessMode: 'forward_only',
        status: 'active',
        validUntil: '2026-12-31T00:00:00.000Z',
      }],
    }]);

    expect(rendered?.ownerDisplay).not.toBe(ownerHex);
    expect(rendered?.readers[0]?.readerDisplay).not.toBe(readerHex);
    expect(JSON.stringify(rendered)).not.toContain(ownerHex);
    expect(JSON.stringify(rendered)).not.toContain(readerHex);
    // Und der Host-Schlüssel der Domäne reist gar nicht mit: das Fenster
    // widerruft über zwei Bezeichner, nicht über einen Schlüssel.
    expect(JSON.stringify(rendered)).not.toContain('ef'.repeat(32));
  });
});
