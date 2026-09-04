import { describe, expect, it } from 'vitest';
import type { PicoMobilityKind, PicoMobilitySample } from '@pico/protocol/spatial-recall';

import {
  condensePicoCompanionObservations,
  retainPicoCompanionObservationLines,
} from './observation-condensation.js';

/**
 * ADR 0126 P3 mit ADR 0129 SR2 — die Verdichtung auf dem Gerät.
 *
 * Der Zwilling im Home wird gegen Messungen geprüft, die ein Test liefert;
 * dieselbe Ehrlichkeit gilt hier. Was ein *echtes* Telefon liefert, steht in
 * der letzten Probe, und sie ist die wichtigste.
 */
const fix = (at: string, latitudeDeg: number, longitudeDeg: number) => ({
  at,
  latitudeDeg,
  longitudeDeg,
  accuracyM: 8,
});

const sample = (at: string, mobility: PicoMobilityKind): PicoMobilitySample => ({
  at,
  mobility,
  confidence: 'high',
});

describe('ADR 0126 P3 - was das Gerät ableitet, überquert die Grenze', () => {
  it('macht aus Messungen eine Erinnerung mit einem Ort', () => {
    const derived = condensePicoCompanionObservations({
      locationFixes: [
        fix('2026-09-03T08:00:00.000Z', 48.2000, 16.3700),
        fix('2026-09-03T08:10:00.000Z', 48.2100, 16.3800),
        fix('2026-09-03T08:12:00.000Z', 48.2101, 16.3801),
      ],
      mobilitySamples: [
        sample('2026-09-03T08:00:00.000Z', 'car'),
        sample('2026-09-03T08:11:00.000Z', 'stationary'),
        sample('2026-09-03T08:13:00.000Z', 'walking'),
      ],
    });

    expect(derived).toBeDefined();
    expect(derived?.contentType).toBe('application/vnd.pico.parking-event');
    // ADR 0129 SR3. Der Ort ist die Kernspalte, nicht ein Feld im Text.
    expect(derived?.place).toEqual({
      latitudeDeg: expect.any(Number),
      longitudeDeg: expect.any(Number),
      accuracyM: expect.any(Number),
    });
    // ADR 0129: Genauigkeit reist mit und ist nie wahlfrei.
    expect(derived?.place.accuracyM).toBeGreaterThan(0);
  });

  it('nennt keine Domäne, weil die dem Home gehört', () => {
    const derived = condensePicoCompanionObservations({
      locationFixes: [
        fix('2026-09-03T08:00:00.000Z', 48.2000, 16.3700),
        fix('2026-09-03T08:10:00.000Z', 48.2100, 16.3800),
      ],
      mobilitySamples: [
        sample('2026-09-03T08:00:00.000Z', 'car'),
        sample('2026-09-03T08:13:00.000Z', 'walking'),
      ],
    });

    /**
     * Die einzige Custody, die eine Beobachtung trägt, ist ihr Raum — und ein
     * Absender, der seinen eigenen nennen dürfte, legte sie in den Raum eines
     * anderen. Die Abwesenheit ist die Regel, deshalb steht sie als Probe da
     * und nicht als Satz in einem Kommentar.
     */
    expect(Object.keys(derived ?? {}).sort())
      .toEqual(['at', 'consumedThrough', 'content', 'contentType', 'place']);
  });

  it('schreibt den Inhalt kanonisch und ohne Prosa', () => {
    const derived = condensePicoCompanionObservations({
      locationFixes: [
        fix('2026-09-03T08:00:00.000Z', 48.2000, 16.3700),
        fix('2026-09-03T08:10:00.000Z', 48.2100, 16.3800),
      ],
      mobilitySamples: [
        sample('2026-09-03T08:00:00.000Z', 'car'),
        sample('2026-09-03T08:13:00.000Z', 'walking'),
      ],
    });

    const content = JSON.parse(derived!.content) as Record<string, unknown>;
    expect(Object.keys(content).sort())
      .toEqual(['confidence', 'parkedAt', 'sourceTransitionAt', 'status']);
    // Kanonisch heisst sortiert: zwei Implementierungen ergeben dieselben Bytes.
    expect(derived!.content).toBe(JSON.stringify(content, Object.keys(content).sort()));
  });

  it('verbraucht nichts, wenn es nichts abgeleitet hat', () => {
    /**
     * Dieselbe Reihenfolge wie im Zwilling und im ADR-0118-O1-Planer: eine
     * Fahrt, die nicht zu Ende ist, ist keine Fahrt, die nichts ergeben hat.
     * `undefined` heisst deshalb auch „der Puffer bleibt stehen".
     */
    expect(condensePicoCompanionObservations({
      locationFixes: [fix('2026-09-03T08:00:00.000Z', 48.2, 16.37)],
      mobilitySamples: [sample('2026-09-03T08:00:00.000Z', 'car')],
    })).toBeUndefined();
  });

  it('leitet aus blossen Messungen ab, was ein echtes Telefon liefert', () => {
    /**
     * **Diese Probe stand am 2026-09-03 umgekehrt da** und sagte: die
     * handgebaute Sonde hat keine Bewegungsarten, also wird nichts abgeleitet.
     * Sie war die geschriebene Grenze dieses Wegs — *„wer sie baut, sieht hier
     * zuerst, dass diese Probe umschlägt."* Am 2026-09-04 hat der Nutzer
     * entschieden, die Bewegungsarten aus den Messungen selbst abzuleiten, und
     * sie ist umgeschlagen.
     *
     * Ohne einen einzigen Klassifikator-Wert: eine Fahrt, ein Halt, ein
     * Weggehen — und daraus ein Parkplatz.
     */
    const derived = condensePicoCompanionObservations({
      locationFixes: [
        fix('2026-09-04T08:00:00.000Z', 48.2000, 16.3700),
        fix('2026-09-04T08:01:00.000Z', 48.2000, 16.3821),
        fix('2026-09-04T08:02:00.000Z', 48.2000, 16.3942),
        fix('2026-09-04T08:03:00.000Z', 48.2000, 16.39427),
        fix('2026-09-04T08:04:00.000Z', 48.2000, 16.39548),
      ],
      mobilitySamples: [],
    });
    expect(derived, 'eine Fahrt mit Halt und Weggehen muss einen Kandidaten ergeben')
      .toBeDefined();
    expect(derived?.place.accuracyM).toBeGreaterThan(0);
  });

  it('erfindet nichts, wo niemand gefahren ist', () => {
    /**
     * Dieselben Messungen ohne Fahrt: langsam los, langsam weiter. Was in der
     * mehrdeutigen Spanne zwischen Gehen und Fahren liegt, heisst `unknown`
     * und ist kein `car` — also gibt es keinen Parkplatz, und das ist die
     * richtige Antwort.
     */
    expect(condensePicoCompanionObservations({
      locationFixes: [
        fix('2026-09-04T08:00:00.000Z', 48.2000, 16.3700),
        fix('2026-09-04T08:10:00.000Z', 48.2100, 16.3800),
        fix('2026-09-04T08:12:00.000Z', 48.2101, 16.3801),
      ],
      mobilitySamples: [],
    })).toBeUndefined();
  });
});

describe('ADR 0129 SR5 - was das Gerät behalten muss', () => {
  const line = (at: string) => JSON.stringify({ at, latitudeDeg: 48.2, longitudeDeg: 16.37, accuracyM: 8 });

  it('behält, was nach dem Übergang gemessen wurde', () => {
    /**
     * Die Schnittkante ist der Übergang und nicht „jetzt": was danach kam,
     * gehört zur nächsten Fahrt, und wer bis jetzt leerte, nähme dem nächsten
     * Parkvorgang seinen Anfang.
     */
    expect(retainPicoCompanionObservationLines({
      lines: [
        line('2026-09-03T08:00:00.000Z'),
        line('2026-09-03T08:13:00.000Z'),
        line('2026-09-03T09:00:00.000Z'),
      ],
      consumedThrough: '2026-09-03T08:13:00.000Z',
    })).toEqual([line('2026-09-03T09:00:00.000Z')]);
  });

  it('verwirft nichts, wenn die Schnittkante unlesbar ist', () => {
    /**
     * Ein Puffer, der bei einer unlesbaren Angabe geleert würde, verlöre alles
     * wegen eines Tippfehlers. Wiederholung ist der laute Fehlschlag.
     */
    const lines = [line('2026-09-03T08:00:00.000Z'), line('2026-09-03T09:00:00.000Z')];
    expect(retainPicoCompanionObservationLines({ lines, consumedThrough: 'gestern' }))
      .toEqual(lines);
  });

  it('verwirft eine Zeile, die nie eine Messung war', () => {
    // Sie war nie eine Eingabe - der Leser daneben übergeht sie ebenfalls -,
    // und sie zu behalten liesse die Datei unbegrenzt wachsen.
    expect(retainPicoCompanionObservationLines({
      lines: ['{kaputt', '', line('2026-09-03T09:00:00.000Z')],
      consumedThrough: '2026-09-03T08:13:00.000Z',
    })).toEqual([line('2026-09-03T09:00:00.000Z')]);
  });

  it('behält eine Messung genau auf der Kante nicht', () => {
    // Sie war die Quelle des Übergangs, also ist sie verbraucht.
    expect(retainPicoCompanionObservationLines({
      lines: [line('2026-09-03T08:13:00.000Z')],
      consumedThrough: '2026-09-03T08:13:00.000Z',
    })).toEqual([]);
  });
});
