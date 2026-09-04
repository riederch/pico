import { canonicalJson } from '@pico/protocol/canonical-transport';
import type { PicoPlace } from '@pico/protocol/place';
import type {
  PicoLocationFix,
  PicoMobilitySample,
} from '@pico/protocol/spatial-recall';
import { picoDeriveParkingCandidate } from '@pico/module-spatial-recall/parking';

/**
 * ADR 0126 P3 mit ADR 0129 SR2 - die Verdichtung, auf dem Gerät.
 *
 * **Die andere Hälfte der Zustandsgrenze.** P3 sagt: was ein Gerät gemessen
 * hat, wird auf dem Gerät zu dem, was es bedeutet, und nur das überquert die
 * Grenze. Der Home sieht die Messungen nie. Bis heute war es umgekehrt - das
 * Telefon schickte rohe Standorte, und der Puffer stand im Home (ADR 0129
 * SR2). ADR 0126 nennt das ausdrücklich: „what changes is where the buffer
 * lives, which is P3's work and not a silent redefinition."
 *
 * Der Zwilling steht in `apps/core/src/observation-condensation.ts`, und die
 * Aufgabenteilung ist dieselbe geblieben: **das Modul entscheidet, was es
 * bedeutet; die Custody entscheidet alles andere.** Deshalb reist hier keine
 * Domäne mit. Wer seinen eigenen Raum nennen dürfte, legte seine Messungen in
 * den Raum eines anderen - die Domäne ist die einzige Custody, die eine
 * Beobachtung trägt, und der Home nennt sie.
 *
 * **Was hier nicht steht, ist ein Satz für eine Person.** Der Inhalt ist die
 * kanonische Form dessen, was das Modul abgeleitet hat, und der Ort steht in
 * der Kernspalte aus ADR 0129 SR3. Ein Modul, das hier Prosa schriebe, wäre
 * genau die Drift, die `check-one-voice` misst.
 *
 * **Und eine gemessene Wahrheit, die diesem Weg heute die Wirkung nimmt**
 * (2026-09-03, ausgeführt statt gelesen): ohne Bewegungsarten gibt
 * `picoDeriveParkingCandidate` `undefined` zurück, und die handgebaute
 * Android-Sonde hat keine - die kommen bei Android aus den Play-Diensten. Auf
 * einem echten Telefon leitet dieser Weg deshalb heute nichts ab. Das ist
 * kein Grund, ihn nicht zu gehen, sondern der stärkste dafür: der Home sammelt
 * bis dahin Rohstandorte, aus denen nichts entsteht.
 */

/** Was das Gerät hält, und was der Home nie zu sehen bekommt. */
export interface PicoCompanionCondensationInput {
  locationFixes: readonly PicoLocationFix[];
  mobilitySamples: readonly PicoMobilitySample[];
}

/**
 * Was die Grenze überquert: eine Erinnerung, kein Messwert.
 *
 * `consumedThrough` ist der letzte Zeitpunkt, den die Ableitung gebraucht hat.
 * Alles bis dahin darf das Gerät verwerfen, sobald der Home die Erinnerung
 * hat - und keine Messung danach, weil die nächste Ableitung sie noch braucht.
 */
export interface PicoCompanionDerivedObservation {
  contentType: 'application/vnd.pico.parking-event';
  content: string;
  place: PicoPlace;
  /** Wann das Fahrzeug zur Ruhe kam - nicht, wann das Gehen bemerkt wurde. */
  at: string;
  consumedThrough: string;
}

export const picoCompanionParkingEventContentType = 'application/vnd.pico.parking-event' as const;

/**
 * Verdichtet, was das Gerät hält - oder gibt nichts zurück.
 *
 * **Nichts abgeleitet heisst nichts verbraucht.** Dieselbe Reihenfolge, die
 * der Zwilling im Home und der ADR-0118-O1-Planer benutzen: eine Fahrt, die
 * nicht zu Ende ist, ist keine Fahrt, die nichts ergeben hat. Wer hier bei
 * `undefined` den Puffer leerte, verlöre genau die Messungen, aus denen der
 * nächste Durchgang seinen Schluss zöge.
 */
export function condensePicoCompanionObservations(
  input: PicoCompanionCondensationInput,
): PicoCompanionDerivedObservation | undefined {
  const derived = picoDeriveParkingCandidate({
    locationFixes: input.locationFixes,
    mobilitySamples: input.mobilitySamples,
  });
  if (derived === undefined) {
    return undefined;
  }

  return Object.freeze({
    contentType: picoCompanionParkingEventContentType,
    /**
     * Kanonisch geschrieben, damit zwei Implementierungen dieselben Bytes
     * ergeben - und Feld für Feld gebaut statt durchgereicht, damit nichts
     * mitreist, was das Modul zufällig danebengelegt hat.
     */
    content: canonicalJson({
      parkedAt: derived.parkedAt,
      confidence: derived.confidence,
      status: derived.status,
      sourceTransitionAt: derived.sourceTransitionAt,
    }),
    place: Object.freeze({
      latitudeDeg: derived.latitudeDeg,
      longitudeDeg: derived.longitudeDeg,
      accuracyM: derived.accuracyM,
    }),
    at: derived.parkedAt,
    /**
     * Bis zum Übergang, aus dem die Ableitung ihren Schluss gezogen hat.
     * Später gemessene Fixe bleiben liegen: der nächste Parkvorgang beginnt
     * mit ihnen.
     */
    consumedThrough: derived.sourceTransitionAt,
  });
}

/**
 * Was das Gerät behalten muss, nachdem eine Ableitung angekommen ist.
 *
 * **Hier liegt der leise Fehlschlag**, und deshalb steht diese Entscheidung
 * hier und nicht im Sondenskript: `tools/android-runtime-probe` liegt nicht im
 * Arbeitsbereich und hat keine Tests, also wäre eine Zeile dort eine Zeile,
 * die niemand prüfen kann. Verlorene Messungen sind genau das, was ADR 0129
 * SR5 der Wiederholung vorzieht zu vermeiden.
 *
 * **Die Schnittkante ist der Übergang, nicht der Zeitpunkt des Abgebens.** Was
 * *nach* dem Übergang gemessen wurde, aus dem die Ableitung ihren Schluss zog,
 * gehört zur nächsten Fahrt: wer bis „jetzt" leerte, nähme dem nächsten
 * Parkvorgang seinen Anfang.
 *
 * **Eine Zeile ohne lesbaren Zeitpunkt wird verworfen**, und das ist eine
 * Entscheidung und keine Nachlässigkeit: sie war nie eine Eingabe - der Leser
 * daneben übergeht sie ebenfalls - und sie zu behalten liesse die Datei
 * unbegrenzt wachsen, ohne dass je etwas daraus würde.
 */
export function retainPicoCompanionObservationLines(input: {
  lines: readonly string[];
  consumedThrough: string;
}): readonly string[] {
  const cut = Date.parse(input.consumedThrough);
  if (Number.isNaN(cut)) {
    /**
     * Ohne lesbare Schnittkante wird nichts verworfen. Ein Puffer, der bei
     * einer unlesbaren Angabe geleert würde, verlöre alles wegen eines
     * Tippfehlers; einer, der stehen bleibt, bietet dieselben Messungen noch
     * einmal an.
     */
    return Object.freeze([...input.lines]);
  }
  return Object.freeze(input.lines.filter((line) => {
    if (line.trim() === '') {
      return false;
    }
    let at;
    try {
      at = Date.parse((JSON.parse(line) as { at?: unknown }).at as string);
    } catch {
      return false;
    }
    return !Number.isNaN(at) && at > cut;
  }));
}
