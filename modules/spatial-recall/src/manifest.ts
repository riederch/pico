import type { PicoModuleManifest } from '@pico/protocol/module';

/**
 * ADR 0129 SR1. Spatial recall, the second Pico module.
 *
 * **A product module**, and the reasoning matters because it is close to the
 * line. Its input is measurement, not authored content: a latitude cannot
 * carry an instruction, so the ADR 0116 W2 threshold that defines a connector
 * has nothing to label. The moment this module wanted a *place name* - a
 * reverse geocode, a map tile, a business listing - it would be taking in
 * words someone else wrote, and it would have become a connector and taken
 * that ADR's rules with it. ADR 0129 keeps those out of scope for exactly
 * this reason.
 *
 * **It causes nothing.** Deriving where a car was left changes a record, not
 * the world; the answer is something a person reads. The empty list is the
 * declaration (ADR 0128 H3), and it would stop being empty the day this
 * module could, say, pay a parking meter.
 *
 * **It owns no store.** ADR 0129 puts observations in a core-owned second
 * store and the derived parking event in an ordinary memory item. Nothing in
 * this package knows what a table is; the derivation runs on samples a caller
 * hands it.
 */
export const picoSpatialRecallModuleManifest: PicoModuleManifest = Object.freeze({
  identifier: 'spatial-recall',
  kind: 'product',
  packageName: '@pico/module-spatial-recall',
  dependencies: Object.freeze([]),
  publishedSubpaths: Object.freeze([
    './manifest', './mobility', './parking', './ports', './speed-mobility',
  ]),
  /**
   * **Pico Link, nicht Foundation API** - berichtigt am 2026-09-23
   * (Nutzerentscheidung 14). Die beiden ersten Saetze sagten `Foundation API`,
   * und das war zweimal falsch: gebaut war keiner von ihnen, und die
   * Foundation-Flaeche ist lokale Diagnose und kein Produktweg. Was eine
   * Person erreicht, erreicht sie ueber Pico Link.
   *
   * **Der dritte Satz ist weg, nicht erfuellt.** Eine Antwort ohne das Home
   * braeuchte eine Quelle auf dem Geraet: entweder eigene Messungen - die
   * Erfassung auf dem Client ist eine zurueckgestellte Produktentscheidung,
   * `ports.ts` sagt das mit Datum - oder eine Kopie der letzten Ableitung
   * neben der Domaenen-Custody und ausserhalb des Shred-Pfads. Ein Versprechen
   * stehenzulassen, dessen Einloesung eine offene Entscheidung ist, ist genau
   * das, was B194 gefunden hat.
   */
  surfaces: Object.freeze([
    'Pico Link: home.parking.ask',
    'Pico Link: home.parking.decide',
  ]),
  effects: Object.freeze([]),
});
