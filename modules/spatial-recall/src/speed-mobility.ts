import {
  type PicoLocationFix,
  type PicoMobilityKind,
  type PicoMobilitySample,
  type PicoSpatialConfidence,
} from '@pico/protocol/spatial-recall';

/**
 * ADR 0129 SR1. Bewegungsarten aus den Standortmessungen selbst.
 *
 * **Warum es das gibt** (2026-09-04, Entscheidung des Nutzers). ADR 0129
 * modelliert eine Bewegungsart als *gemessen* - ein Klassifikator sagt sie,
 * mit einer Zuversicht. Bei Android kommt der aus den Play-Diensten, die die
 * handgebaute Sonde nicht hat, und ohne den Uebergang von „fahrend" zu
 * „gehend" hat ein Parkplatz kein Merkmal. Phase 3 zog den Puffer auf das
 * Geraet und leitete danach genauso wenig ab wie vorher der Home.
 *
 * Der Kommentar in `mobility.ts` sah diesen Fall bereits vor: *„a caller
 * merging two sources - a motion classifier and a location-derived one"*. Dies
 * ist die zweite Quelle.
 *
 * **Was hier geschaetzt wird, und was nicht.** Eine Geschwindigkeit zwischen
 * zwei Messungen ist Arithmetik; welche Fortbewegung dahintersteckt, ist ein
 * Schluss. Der Schluss wird deshalb nur dort gezogen, wo er traegt:
 *
 * - **Langsam ist gehen, schnell ist fahren, und dazwischen ist `unknown`.**
 *   Ein Fahrrad und ein Auto im Stadtverkehr sind an der Geschwindigkeit
 *   allein nicht zu unterscheiden. Diese Spanne als „Fahrrad" auszugeben
 *   naehme jedem Autofahrer im Stau seinen Parkplatz; als „Auto" gaebe sie
 *   jedem Radfahrer einen erfundenen. `unknown` ist die dritte Antwort, die
 *   ADR 0129 dafuer vorsieht - eine Luecke im Aufschrieb, und `mobility.ts`
 *   deckelt jeden Uebergang, der eine beruehrt, auf `low`.
 * - **Genauigkeit schlaegt Geschwindigkeit.** Zwei Messungen mit je fuenfzig
 *   Metern Unsicherheit, dreissig Sekunden auseinander, tragen einen Fehler
 *   von mehreren Metern pro Sekunde - und damit keine Aussage ueber Gehen.
 *   Zugeordnet wird deshalb ein *Intervall* und keine Zahl: reicht
 *   Geschwindigkeit plus/minus Fehler ueber eine Spannengrenze, ist das
 *   Ergebnis `unknown`.
 * - **`public_transport` wird nie ausgegeben.** Ein Bus faehrt wie ein Auto.
 *   Die Art zu raten hiesse, eine Unterscheidung zu behaupten, die in diesen
 *   Zahlen nicht steckt.
 *
 * Rein, modellfrei und netzfrei wie der Rest dieser Familie (ADR 0118).
 */

/** Metrischer Erdradius, fuer die Entfernung zwischen zwei Messungen. */
const earthRadiusMetres = 6_371_008.8;

export interface PicoSpeedMobilityThresholds {
  /** Darunter steht jemand. */
  stationaryMetresPerSecond: number;
  /** Darunter geht jemand - zuegiges Gehen liegt bei rund zwei. */
  walkingMetresPerSecond: number;
  /**
   * Darueber faehrt jemand in einem Fahrzeug. Acht Meter pro Sekunde sind
   * knapp neunundzwanzig Kilometer pro Stunde; darunter liegt die Spanne, in
   * der ein Rad und ein Auto dasselbe aussehen.
   */
  vehicleMetresPerSecond: number;
  /**
   * Zwei Messungen, die zeitlich zu dicht liegen, tragen keine
   * Geschwindigkeit: der Fehler waechst mit `1/dt`.
   */
  minimumSeparationSeconds: number;
}

export const defaultPicoSpeedMobilityThresholds: PicoSpeedMobilityThresholds = Object.freeze({
  stationaryMetresPerSecond: 0.5,
  walkingMetresPerSecond: 2.5,
  vehicleMetresPerSecond: 8,
  minimumSeparationSeconds: 5,
});

/** Entfernung auf der Kugel, in Metern. */
function metresBetween(from: PicoLocationFix, to: PicoLocationFix): number {
  const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
  const lat1 = toRadians(from.latitudeDeg);
  const lat2 = toRadians(to.latitudeDeg);
  const deltaLat = lat2 - lat1;
  const deltaLon = toRadians(to.longitudeDeg - from.longitudeDeg);
  const a = Math.sin(deltaLat / 2) ** 2
    + (Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2);
  return 2 * earthRadiusMetres * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Wie sicher die Zuordnung ist - nicht, wie genau die Zahl ist.
 *
 * **Der Unterschied hat mich beim Schreiben erwischt.** Zuerst stand hier das
 * Verhaeltnis von Fehler zu Wert, und damit war *Stillstand* nie sicher: wer
 * steht, hat eine Geschwindigkeit nahe null, und daneben ist jeder Fehler
 * gross. Der Test fiel, und er hatte recht.
 *
 * Die Frage ist nicht „wie genau ist die Zahl", sondern **„liegt sie samt
 * ihrem Fehler in derselben Spanne"**. Der Fehler ist die Summe beider
 * Unsicherheiten auf die verstrichene Zeit - die schlechteste Annahme, und die
 * richtige: die beiden Messungen koennen in entgegengesetzte Richtungen
 * danebenliegen. Reicht das Intervall ueber eine Grenze, ist die Zuordnung
 * keine, und `unknown` ist die Antwort.
 *
 * Die Zuversicht misst danach den Fehler an der Geschwindigkeit, mit der
 * Stillstandsschwelle als Boden - sonst bestrafte sie genau das, was sie
 * gerade zugelassen hat.
 */
function bandFor(
  speed: number,
  error: number,
  thresholds: PicoSpeedMobilityThresholds,
): { mobility: PicoMobilityKind; confidence: PicoSpatialConfidence } {
  const lower = Math.max(0, speed - error);
  const upper = speed + error;
  const kind = kindFor(lower, thresholds);
  if (kind !== kindFor(upper, thresholds)) {
    // Das Intervall reicht ueber eine Grenze: keine Zuordnung, keine Aussage.
    return { mobility: 'unknown', confidence: 'low' };
  }
  const ratio = error / Math.max(speed, thresholds.stationaryMetresPerSecond);
  const confidence: PicoSpatialConfidence = ratio < 0.25
    ? 'high'
    : (ratio < 0.5 ? 'medium' : 'low');
  return { mobility: kind, confidence: kind === 'unknown' ? 'low' : confidence };
}

function kindFor(
  speed: number,
  thresholds: PicoSpeedMobilityThresholds,
): PicoMobilityKind {
  if (speed < thresholds.stationaryMetresPerSecond) {
    return 'stationary';
  }
  if (speed < thresholds.walkingMetresPerSecond) {
    return 'walking';
  }
  if (speed >= thresholds.vehicleMetresPerSecond) {
    return 'car';
  }
  // Die Spanne, in der ein Rad und ein Auto dasselbe aussehen.
  return 'unknown';
}

/**
 * Bewegungsarten aus einer Folge von Standortmessungen, aeltester zuerst.
 *
 * Eine Probe je Paar, datiert auf die *spaetere* der beiden Messungen: die
 * Geschwindigkeit beschreibt die Strecke, die dort endet, und ein Uebergang
 * soll dort stehen, wo er bemerkt wurde, nicht wo die Strecke begann.
 *
 * Was keine Aussage traegt, gibt `unknown` mit `low` zurueck statt zu fehlen:
 * eine Luecke, die dasteht, deckelt den Uebergang darueber (`mobility.ts`),
 * waehrend eine fehlende Probe zwei Messungen benachbart aussehen liesse, die
 * es nicht sind.
 */
export function picoMobilityFromLocationFixes(
  fixes: readonly PicoLocationFix[],
  thresholds: PicoSpeedMobilityThresholds = defaultPicoSpeedMobilityThresholds,
): readonly PicoMobilitySample[] {
  const ordered = [...fixes].sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
  const samples: PicoMobilitySample[] = [];

  for (let index = 1; index < ordered.length; index += 1) {
    const from = ordered[index - 1]!;
    const to = ordered[index]!;
    const seconds = (Date.parse(to.at) - Date.parse(from.at)) / 1_000;
    if (!Number.isFinite(seconds) || seconds < thresholds.minimumSeparationSeconds) {
      samples.push(Object.freeze({ at: to.at, mobility: 'unknown', confidence: 'low' }));
      continue;
    }
    const speed = metresBetween(from, to) / seconds;
    const error = (from.accuracyM + to.accuracyM) / seconds;
    samples.push(Object.freeze({ at: to.at, ...bandFor(speed, error, thresholds) }));
  }

  return Object.freeze(samples);
}
