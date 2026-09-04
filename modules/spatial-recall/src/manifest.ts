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
  surfaces: Object.freeze([
    'Foundation API: the last likely parking place, with its certainty',
    'Foundation API: confirming or rejecting a parking candidate',
    'Companion: answering where the vehicle was left, offline',
  ]),
  effects: Object.freeze([]),
});
