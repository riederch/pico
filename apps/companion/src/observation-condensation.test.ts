import { describe, expect, it } from 'vitest';
import type { PicoMobilityKind, PicoMobilitySample } from '@pico/protocol/spatial-recall';

import {
  condensePicoCompanionObservations,
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

  it('leitet nichts ab, was ein echtes Telefon heute liefert', () => {
    /**
     * **Die gemessene Wahrheit dieses Wegs am 2026-09-03.** Die handgebaute
     * Android-Sonde hat keine Bewegungsarten — die kommen bei Android aus den
     * Play-Diensten —, also gibt `readMobilitySamples` eine leere Liste
     * zurück. Ohne den Übergang von „fahrend" zu „gehend" hat ein Parkplatz
     * kein Merkmal.
     *
     * Diese Probe steht hier, damit die Grenze nicht in einem Kommentar
     * behauptet wird: der Weg ist gebaut und leitet auf einem echten Gerät
     * nichts ab, bis die zweite Eingabehälfte existiert. Wer sie baut, sieht
     * hier zuerst, dass diese Probe umschlägt.
     */
    expect(condensePicoCompanionObservations({
      locationFixes: [
        fix('2026-09-03T08:00:00.000Z', 48.2000, 16.3700),
        fix('2026-09-03T08:10:00.000Z', 48.2100, 16.3800),
        fix('2026-09-03T08:12:00.000Z', 48.2101, 16.3801),
      ],
      mobilitySamples: [],
    })).toBeUndefined();
  });
});
