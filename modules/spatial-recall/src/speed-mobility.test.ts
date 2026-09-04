import { describe, expect, it } from 'vitest';

import { picoMobilityFromLocationFixes } from './speed-mobility.js';
import { picoMobilityTransitions } from './mobility.js';
import { picoDeriveParkingCandidate } from './parking.js';

/**
 * ADR 0129 SR1. Bewegungsarten aus den Messungen selbst — und die drei
 * Stellen, an denen sie *nichts* behaupten.
 */

/** Ein Fix, um `metres` nach Osten versetzt gegen den vorigen. */
const at = (seconds: number, metresEast: number, accuracyM = 8) => ({
  at: new Date(Date.parse('2026-09-04T08:00:00.000Z') + seconds * 1_000).toISOString(),
  latitudeDeg: 48.2,
  // Ein Grad Länge bei 48,2° Breite sind rund 74.200 Meter.
  longitudeDeg: 16.37 + (metresEast / 74_200),
  accuracyM,
});

describe('ADR 0129 SR1 - Bewegungsart aus der Geschwindigkeit', () => {
  it('nennt Stehen, Gehen und Fahren beim Namen', () => {
    const samples = picoMobilityFromLocationFixes([
      at(0, 0),
      at(60, 6),      // 0,1 m/s  -> stationär
      at(120, 90),    // 1,4 m/s  -> gehend
      at(180, 900),   // 13,5 m/s -> fahrend
    ]);
    expect(samples.map((sample) => sample.mobility))
      .toEqual(['stationary', 'walking', 'car']);
  });

  it('sagt `unknown`, wo ein Rad und ein Auto gleich aussehen', () => {
    /**
     * Die Spanne zwischen Gehen und Fahren trägt keine Unterscheidung. Sie als
     * „Fahrrad" auszugeben nähme jedem Autofahrer im Stau seinen Parkplatz;
     * als „Auto" gäbe sie jedem Radfahrer einen erfundenen.
     */
    const samples = picoMobilityFromLocationFixes([at(0, 0), at(60, 300)]); // 5 m/s
    expect(samples[0]).toMatchObject({ mobility: 'unknown', confidence: 'low' });
  });

  it('sagt `unknown`, wenn die Genauigkeit die Bewegung verschluckt', () => {
    /**
     * Zwei Messungen mit je fünfzig Metern Unsicherheit, dreissig Sekunden
     * auseinander: der Fehler ist rund 3,3 m/s, die gemessene Bewegung 1 m/s.
     * Von Rauschen nicht zu trennen — und eine Zahl, die kleiner ist als ihr
     * Fehler, ist keine Aussage.
     */
    const samples = picoMobilityFromLocationFixes([at(0, 0, 50), at(30, 30, 50)]);
    expect(samples[0]).toMatchObject({ mobility: 'unknown', confidence: 'low' });
  });

  it('sagt `unknown`, wenn zwei Messungen zeitlich zu dicht liegen', () => {
    // Der Fehler wächst mit 1/dt; unter fünf Sekunden trägt kein Paar etwas.
    const samples = picoMobilityFromLocationFixes([at(0, 0), at(2, 4)]);
    expect(samples[0]).toMatchObject({ mobility: 'unknown', confidence: 'low' });
  });

  it('gibt nie `public_transport` aus', () => {
    // Ein Bus fährt wie ein Auto. Die Art zu raten hiesse, eine Unterscheidung
    // zu behaupten, die in diesen Zahlen nicht steckt.
    const samples = picoMobilityFromLocationFixes([
      at(0, 0), at(60, 900), at(120, 1_800), at(180, 2_700),
    ]);
    expect(samples.every((sample) => sample.mobility !== 'public_transport')).toBe(true);
  });

  it('datiert jede Probe auf die spätere der beiden Messungen', () => {
    // Ein Übergang soll dort stehen, wo er bemerkt wurde, nicht wo die
    // Strecke begann.
    const samples = picoMobilityFromLocationFixes([at(0, 0), at(60, 90)]);
    expect(samples[0]?.at).toBe(at(60, 0).at);
  });

  it('sortiert, statt der Reihenfolge zu trauen', () => {
    const samples = picoMobilityFromLocationFixes([at(120, 180), at(0, 0), at(60, 90)]);
    expect(samples.map((sample) => sample.at))
      .toEqual([at(60, 0).at, at(120, 0).at]);
  });
});

describe('ADR 0129 SR1 mit SR4 - und daraus wird ein Parkplatz', () => {
  it('findet den Übergang von fahrend zu gehend', () => {
    /**
     * **Der ganze Zweck** (Entscheidung des Nutzers, 2026-09-04): bis hierher
     * gab `picoDeriveParkingCandidate` auf einem echten Telefon `undefined`
     * zurück, weil die zweite Eingabehälfte fehlte. Sie kommt jetzt aus den
     * Messungen selbst.
     */
    const fixes = [
      at(0, 0), at(60, 900), at(120, 1_800),  // fahrend
      at(180, 1_805),                          // steht
      at(240, 1_890),                          // geht
    ];
    const samples = picoMobilityFromLocationFixes(fixes);
    expect(picoMobilityTransitions(samples).length).toBeGreaterThan(0);

    const candidate = picoDeriveParkingCandidate({
      locationFixes: fixes,
      mobilitySamples: samples,
    });
    expect(candidate, JSON.stringify(samples)).toBeDefined();
    expect(candidate?.accuracyM).toBeGreaterThan(0);
  });

  it('erfindet keinen Parkplatz für eine Radfahrt', () => {
    /**
     * Eine Fahrt in der mehrdeutigen Spanne wird `unknown`, und `unknown` ist
     * kein `car`. Der Kandidat bleibt aus — was die richtige Antwort ist:
     * niemand hat ein Auto abgestellt.
     */
    const fixes = [at(0, 0), at(60, 300), at(120, 600), at(180, 690)];
    const candidate = picoDeriveParkingCandidate({
      locationFixes: fixes,
      mobilitySamples: picoMobilityFromLocationFixes(fixes),
    });
    expect(candidate).toBeUndefined();
  });
});
