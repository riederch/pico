/**
 * ADR 0116 W2 - die geschlossene Herkunftsklasse, und sonst nichts.
 *
 * **Warum das ein eigenes Blatt ist** (2026-09-01, Befund B49). Diese Liste
 * stand in `index.ts`, und `model-context.ts` holte sie von dort zurueck -
 * obwohl `index.ts` `model-context.js` wieder ausgibt. Das ist ein Zyklus, und
 * `index.ts` beschrieb ihn selbst als „a cycle that happens to work today only
 * because the values are read inside functions rather than at module
 * evaluation".
 *
 * Am 2026-09-01 hoerte er auf zu funktionieren. Ein einziger neuer Import an
 * einer ganz anderen Stelle - `pending-action.ts` zog
 * `approval-statement.js` herein - kippte die Auswertungsreihenfolge, und das
 * laufende Home antwortete auf `home.recall.keep` mit
 * `lowestPicoOriginClass is not a function`: die Sammelausgabe hatte aus einem
 * halbfertigen Modul kopiert. Ein Zyklus, der von der Reihenfolge lebt, ist
 * keine Ordnung, sondern ein Zufall mit einem Datum darauf.
 *
 * Ein Blatt ohne eigene Importe kann in keinem Zyklus liegen. `index.ts` gibt
 * es weiter aus, damit kein Aufrufer etwas umschreiben muss.
 */

// ADR 0116 W2 direction: server-assigned, authorization-relevant provenance.
// The closed vocabulary is fixed by the ADR; the current runtime (W1) only
// ever assigns `unattributed`, and only the server assigns at all - a client
// asserting an origin is refused at the write path.
export const picoEventOriginClasses = [
  'person_present',
  'own_pico',
  'home_member',
  'remote_pico',
  'external_content',
  'unattributed',
] as const;

export type PicoEventOriginClass = typeof picoEventOriginClasses[number];
