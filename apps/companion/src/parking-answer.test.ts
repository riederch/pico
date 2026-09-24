import { describe, expect, it } from 'vitest';
import type { PicoLinkDirectClient } from '@pico/vault-daemon/link-direct-client';
import {
  askPicoCompanionParking,
  decidePicoCompanionParking,
} from './observations.js';

/**
 * ADR 0129 SR4, Nutzerentscheidung 14 vom 2026-09-23. Was dieses Geraet einem
 * Home glaubt, wenn es nach dem Parkort fragt.
 *
 * **Der Weg gegen ein echtes Home steht nebenan** - `runtime-real-process`
 * fragt, entscheidet und fragt wieder, ueber laufende Prozesse. Was dort nicht
 * herstellbar ist, ist ein Home, das *falsch* antwortet: eine abgeschnittene
 * Antwort, ein Ort, der keiner ist, ein Ausgang, den das Protokoll nicht kennt.
 *
 * Das ist kein hypothetischer Fall. Zwischen Geraet und Home liegen ein
 * Versiegelungsformat, ein JSON-Parser und eine Version, die sich
 * auseinanderentwickeln kann, und die Antwort traegt einen **Ort einer
 * Person**. Was hier nicht abgewiesen wird, erscheint als Punkt auf einer
 * Karte - und ein erfundener Punkt sieht genauso aus wie ein gemessener.
 */
function answering(result: Record<string, unknown>, outcome = 'ok'): PicoLinkDirectClient {
  return {
    hostSigningKeyFingerprintHex: 'aa'.repeat(32),
    hostKeyAgreementKeyFingerprintHex: 'bb'.repeat(32),
    sender: {
      identityKeyFingerprintHex: 'cc'.repeat(32),
      identityPublicKeyHex: 'dd'.repeat(32),
      deviceSigningKeyFingerprintHex: 'ee'.repeat(32),
      deviceKeyAgreementKeyFingerprintHex: 'ff'.repeat(32),
      delegationId: 'delegation_parking_test',
    },
    request: async () => ({ outcome, result }),
  } as unknown as PicoLinkDirectClient;
}

const wholeAnswer = {
  outcome: 'likely',
  memoryItemId: 'mem_derived_00000000000000000000000000000000',
  parkedAt: '2026-09-04T08:03:00.000Z',
  sourceTransitionAt: '2026-09-04T08:04:00.000Z',
  confidence: 'high',
  place: JSON.stringify({ latitudeDeg: 48.2, longitudeDeg: 16.39, accuracyM: 8 }),
};

describe('ADR 0129 SR4 - was dieses Geraet einer Parkantwort glaubt', () => {
  it('nimmt eine ganze Antwort an und faltet den Ort zurueck', async () => {
    const answer = await askPicoCompanionParking({ linkClient: answering(wholeAnswer) });

    expect(answer.outcome).toBe('likely');
    expect(answer.place).toEqual({
      memoryItemId: 'mem_derived_00000000000000000000000000000000',
      parkedAt: '2026-09-04T08:03:00.000Z',
      sourceTransitionAt: '2026-09-04T08:04:00.000Z',
      confidence: 'high',
      latitudeDeg: 48.2,
      longitudeDeg: 16.39,
      accuracyM: 8,
    });
  });

  it('liest "weiss ich nicht" als Zustand und nicht als Fehler', async () => {
    // ADR 0118 O4. Ein Home, das nie eine Fahrt gesehen hat, ist nicht kaputt.
    await expect(askPicoCompanionParking({ linkClient: answering({ outcome: 'unknown' }) }))
      .resolves.toEqual({ outcome: 'unknown' });
  });

  it('weist jede halbe Antwort ab, statt eine Position ohne ihre Sicherheit zu reichen', async () => {
    /**
     * Die tragende Eigenschaft von SR4, hier auf der Leseseite: eine Flaeche
     * darf keine blosse Position bekommen koennen. Jedes fehlende Feld nimmt
     * genau das weg - ohne `confidence` bliebe ein Punkt ohne Guete, ohne
     * `sourceTransitionAt` gaebe es nichts, worueber eine Person entscheiden
     * koennte.
     */
    for (const missing of [
      'memoryItemId', 'parkedAt', 'sourceTransitionAt', 'confidence', 'place',
    ] as const) {
      const { [missing]: _dropped, ...rest } = wholeAnswer;
      await expect(
        askPicoCompanionParking({ linkClient: answering(rest) }),
        missing,
      ).rejects.toThrow('invalid_pico_parking_answer');
    }
  });

  it('weist einen Ausgang ab, den das Protokoll nicht kennt', async () => {
    // Vier Ausgaenge, und `probably` ist keiner davon. Ein unbekannter Name
    // durchzulassen hiesse, die Sicherheit einer Flaeche raten zu lassen.
    await expect(askPicoCompanionParking({
      linkClient: answering({ ...wholeAnswer, outcome: 'probably' }),
    })).rejects.toThrow('invalid_pico_parking_answer');
  });

  it('weist einen Ort ab, der keiner ist', async () => {
    // Der Ort reist als Text, weil die kanonische Form der Link-Argumente
    // keine Fliesskommazahlen traegt - und Text kann alles sein.
    for (const place of [
      'nicht einmal JSON',
      JSON.stringify({ latitudeDeg: 48.2, longitudeDeg: 16.39 }),
      JSON.stringify({ latitudeDeg: '48.2', longitudeDeg: 16.39, accuracyM: 8 }),
      JSON.stringify(null),
    ]) {
      await expect(
        askPicoCompanionParking({ linkClient: answering({ ...wholeAnswer, place }) }),
        place,
      ).rejects.toThrow('invalid_pico_parking_answer');
    }
  });

  it('traegt die Ablehnung des Homes weiter, statt sie in eine eigene zu uebersetzen', async () => {
    // Wer `not_readable` liest, weiss, was zu tun ist. Wer "etwas ging schief"
    // liest, weiss es nicht - und der Name kommt vom Home, nicht von hier.
    await expect(askPicoCompanionParking({
      linkClient: answering({ refusal: 'not_readable' }, 'invalid_arguments'),
    })).rejects.toThrow('not_readable');

    await expect(askPicoCompanionParking({
      linkClient: answering({}, 'invalid_arguments'),
    })).rejects.toThrow('parking_ask_invalid_arguments');
  });

  it('nimmt als Entscheidung nur zurueck, was eine ist', async () => {
    await expect(decidePicoCompanionParking({
      linkClient: answering({ status: 'confirmed' }),
      sourceTransitionAt: '2026-09-04T08:04:00.000Z',
      status: 'confirmed',
    })).resolves.toEqual({ status: 'confirmed' });

    await expect(decidePicoCompanionParking({
      linkClient: answering({ status: 'maybe' }),
      sourceTransitionAt: '2026-09-04T08:04:00.000Z',
      status: 'confirmed',
    })).rejects.toThrow('invalid_pico_parking_decision_result');

    await expect(decidePicoCompanionParking({
      linkClient: answering({ refusal: 'no_such_parking_candidate' }, 'invalid_arguments'),
      sourceTransitionAt: '2020-01-01T00:00:00.000Z',
      status: 'confirmed',
    })).rejects.toThrow('no_such_parking_candidate');
  });
});
