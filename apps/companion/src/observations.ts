import {
  maxPicoObservationSubmission,
  type PicoObservationKind,
} from '@pico/protocol/observation';
import {
  picoParkingDecisions,
  type PicoParkingDecision,
} from '@pico/protocol/spatial-recall';
import type { PicoLinkDirectClient } from '@pico/vault-daemon/link-direct-client';

/**
 * ADR 0129 SR5. Was ein Gerät gemessen hat, auf dem Weg in den Puffer.
 *
 * **Die Messung reist als Text, und die Domäne reist gar nicht.** Die
 * kanonische Form der Link-Argumente lässt nur ganze Zahlen zu - damit zwei
 * Implementierungen dieselben Bytes hashen -, und ein Standortmesswert hat
 * Fließkomma-Koordinaten; die Übergabe spricht deshalb die Sprache des
 * Puffers. Welcher Raum die Messungen regiert, entscheidet der Home: ein
 * Absender, der seine eigene Domäne nennen dürfte, legte sie in den Raum eines
 * anderen, und die Domäne ist die einzige Custody, die eine Beobachtung trägt.
 */
export interface PicoCompanionObservation {
  kind: PicoObservationKind;
  /** Die Messung selbst, als Text - genau wie der Puffer sie hält. */
  payload: string;
}

export async function submitPicoCompanionObservations(input: {
  linkClient: PicoLinkDirectClient;
  observations: readonly PicoCompanionObservation[];
}): Promise<{ appended: number }> {
  if (input.observations.length === 0) {
    // Nichts zu sagen ist keine Übergabe. Eine leere Anfrage zu schicken hieße,
    // das Home nach etwas zu fragen, das es nicht beantworten kann.
    return { appended: 0 };
  }
  if (input.observations.length > maxPicoObservationSubmission) {
    // Hier abgelehnt und nicht dort: ein Absender, der über den Deckel geht,
    // hat einen Fehler, und ihn erst über die Leitung zu erfahren, kostet die
    // Messungen, die er gerade hielt.
    throw new Error('too_many_observations');
  }
  const answer = await input.linkClient.request('home.observations.submit', {
    observations: input.observations.map((entry) => ({
      kind: entry.kind,
      payload: entry.payload,
    })),
  });
  if (answer.outcome !== 'ok') {
    const refusal = (answer.result as { refusal?: unknown }).refusal;
    throw new Error(typeof refusal === 'string' ? refusal : `observations_${answer.outcome}`);
  }
  const appended = (answer.result as { appended?: unknown }).appended;
  if (typeof appended !== 'number') {
    throw new Error('invalid_pico_observations_result');
  }
  /**
   * Wie viele angekommen sind, nicht wie viele geschickt wurden - der Aufrufer
   * braucht den Unterschied: ein Deckel nach ADR 0119 Q5 kann weniger annehmen
   * als angeboten wurde, und wer „alles gut" liest, misst weiter ins Leere.
   */
  return { appended };
}

/**
 * ADR 0126 P3. Was das Gerät abgeleitet hat, über die Zustandsgrenze.
 *
 * **Der Zwilling von `submitPicoCompanionObservations`, und sein Gegenteil.**
 * Der schickt Messungen; dieser schickt, was aus ihnen wurde, und der Home
 * sieht die Messungen nie.
 *
 * `crossed` sagt, ob dies das erste Mal war. Ein Gerät, das nach einem Abbruch
 * dieselbe Ableitung noch einmal abgibt, ist kein Fehler - aber nur „gerade
 * angekommen" erlaubt ihm, seinen Puffer zu leeren. Wiederholung ist der laute
 * Fehlschlag, Verlust der leise.
 */
export async function keepPicoCompanionDerivedObservation(input: {
  linkClient: PicoLinkDirectClient;
  derived: {
    contentType: string;
    content: string;
    at: string;
    place: { latitudeDeg: number; longitudeDeg: number; accuracyM: number };
  };
}): Promise<{ memoryItemId: string; crossed: boolean }> {
  /**
   * **Der Ort reist als Text**, aus demselben Grund wie die Messung darüber:
   * die kanonische Form der Link-Argumente lässt nur ganze Zahlen zu, damit
   * zwei Implementierungen dieselben Bytes hashen, und eine Koordinate ist
   * Fließkomma. Gefunden hat das der Durchlauf gegen ein laufendes Home, nicht
   * das Lesen - der Nachbarweg beschreibt dieselbe Wand seit dem 2026-08-26.
   */
  const answer = await input.linkClient.request('home.observation.derived.keep', {
    contentType: input.derived.contentType,
    content: input.derived.content,
    at: input.derived.at,
    place: JSON.stringify(input.derived.place),
  });
  if (answer.outcome !== 'ok') {
    const refusal = (answer.result as { refusal?: unknown }).refusal;
    throw new Error(typeof refusal === 'string'
      ? refusal
      : `derived_observation_keep_${answer.outcome}`);
  }
  const result = answer.result as { memoryItemId?: unknown; crossed?: unknown };
  if (typeof result.memoryItemId !== 'string' || typeof result.crossed !== 'boolean') {
    throw new Error('invalid_pico_derived_observation_result');
  }
  return { memoryItemId: result.memoryItemId, crossed: result.crossed };
}

/**
 * ADR 0129 SR4, Nutzerentscheidung 14 vom 2026-09-23. Wo das Fahrzeug zuletzt
 * abgestellt wurde - und wie sicher das ist.
 *
 * **Die Lesehaelfte der Ableitung.** Der Zwilling darueber schickt, was aus
 * den Messungen wurde; dieser fragt es zurueck. Bis heute tat das niemand:
 * `picoParkingAnswer` stand fertig im Modul und hatte keinen Aufrufer.
 *
 * `outcome` kommt immer mit, und ohne Ort gibt es kein `place` - ADR 0129 SR4
 * verlangt, dass eine Antwort ihre Sicherheit traegt, und eine Flaeche, der
 * man eine blosse Position reichen kann, hat genau das verloren.
 */
export interface PicoCompanionParkingAnswer {
  outcome: 'known' | 'likely' | 'uncertain' | 'unknown';
  place?: {
    memoryItemId: string;
    parkedAt: string;
    sourceTransitionAt: string;
    confidence: string;
    latitudeDeg: number;
    longitudeDeg: number;
    accuracyM: number;
  };
}

export async function askPicoCompanionParking(input: {
  linkClient: PicoLinkDirectClient;
}): Promise<PicoCompanionParkingAnswer> {
  const answer = await input.linkClient.request('home.parking.ask', {});
  if (answer.outcome !== 'ok') {
    const refusal = (answer.result as { refusal?: unknown }).refusal;
    throw new Error(typeof refusal === 'string' ? refusal : `parking_ask_${answer.outcome}`);
  }
  const result = answer.result as Record<string, unknown>;
  if (result.outcome !== 'known'
    && result.outcome !== 'likely'
    && result.outcome !== 'uncertain'
    && result.outcome !== 'unknown') {
    throw new Error('invalid_pico_parking_answer');
  }
  if (result.outcome === 'unknown') {
    return { outcome: 'unknown' };
  }
  if (typeof result.memoryItemId !== 'string'
    || typeof result.parkedAt !== 'string'
    || typeof result.sourceTransitionAt !== 'string'
    || typeof result.confidence !== 'string'
    || typeof result.place !== 'string') {
    throw new Error('invalid_pico_parking_answer');
  }
  let place: { latitudeDeg: unknown; longitudeDeg: unknown; accuracyM: unknown };
  try {
    // Als Text, aus demselben Grund wie auf dem Hinweg: die kanonische Form
    // der Link-Argumente traegt keine Fliesskommazahlen.
    const parsed: unknown = JSON.parse(result.place);
    /**
     * **`null` ist gueltiges JSON**, und `typeof null` ist `'object'` - ohne
     * diese Zeile wurde aus einem Home, das `"null"` schickt, ein
     * `TypeError: Cannot read properties of null` statt einer benannten
     * Ablehnung. Gefunden hat das die Begehung, nicht das Lesen.
     */
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('invalid_pico_parking_answer');
    }
    place = parsed as typeof place;
  } catch {
    throw new Error('invalid_pico_parking_answer');
  }
  if (typeof place.latitudeDeg !== 'number'
    || typeof place.longitudeDeg !== 'number'
    || typeof place.accuracyM !== 'number') {
    throw new Error('invalid_pico_parking_answer');
  }
  return {
    outcome: result.outcome,
    place: {
      memoryItemId: result.memoryItemId,
      parkedAt: result.parkedAt,
      sourceTransitionAt: result.sourceTransitionAt,
      confidence: result.confidence,
      latitudeDeg: place.latitudeDeg,
      longitudeDeg: place.longitudeDeg,
      accuracyM: place.accuracyM,
    },
  };
}

/**
 * ADR 0129 SR4. Die Person sagt, ob das der Ort war.
 *
 * **Ueber den Uebergang und nicht ueber das Stueck**, weil genau das der
 * Vergleich ist, den die Antwort anstellt: wer die gestrige Vermutung
 * verworfen hat, hat ueber die heutige nichts gesagt.
 */
export async function decidePicoCompanionParking(input: {
  linkClient: PicoLinkDirectClient;
  sourceTransitionAt: string;
  status: PicoParkingDecision;
}): Promise<{ status: PicoParkingDecision }> {
  const answer = await input.linkClient.request('home.parking.decide', {
    sourceTransitionAt: input.sourceTransitionAt,
    status: input.status,
  });
  if (answer.outcome !== 'ok') {
    const refusal = (answer.result as { refusal?: unknown }).refusal;
    throw new Error(typeof refusal === 'string' ? refusal : `parking_decide_${answer.outcome}`);
  }
  const status = (answer.result as { status?: unknown }).status;
  if (typeof status !== 'string'
    || !(picoParkingDecisions as readonly string[]).includes(status)) {
    throw new Error('invalid_pico_parking_decision_result');
  }
  return { status: status as PicoParkingDecision };
}
