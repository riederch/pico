import {
  maxPicoObservationSubmission,
  type PicoObservationKind,
} from '@pico/protocol/observation';
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
