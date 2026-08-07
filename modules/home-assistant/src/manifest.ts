import type { PicoModuleManifest } from '@pico/protocol/module';

/**
 * ADR 0128 H4. Home Assistant as a connected house, which is a module.
 *
 * **A connector, and the reasoning is the whole point of the kind.** Its input
 * is written by somebody else: an entity's friendly name is whatever a person
 * typed into their own Home Assistant, and a notification body can be anything
 * a third party's integration put there. That is text, not measurement - which
 * is exactly what separates this from ADR 0129's spatial recall, whose
 * latitudes cannot carry an instruction. Foreign text carries an ADR 0116 W2
 * origin label at the threshold or it does not enter.
 *
 * **It causes nothing yet.** This slice reads; it does not call a service, and
 * the empty list is the declaration (ADR 0128 H3). The day it can turn a light
 * on, the effect is declared here first and the core decides whether to allow
 * it - and at that moment this module becomes the case ADR 0128 warned about,
 * foreign content in and world-changing action out, where origin has to cross
 * with the value rather than a boundary being drawn between the halves.
 *
 * **The transport is a declared port with no implementation.** ADR 0128 H4
 * forbids a Supervisor client in `apps/core` and H3 forbids the module any
 * direct route out of the process, so the only honest place for it is a
 * capability - and a capability that cannot be exercised against a real Home
 * Assistant would be unverifiable code. It is deferred for the reason ADR 0129
 * deferred its sensor adapter, and the rules that matter are testable without
 * it.
 */
export const picoHomeAssistantModuleManifest: PicoModuleManifest = Object.freeze({
  identifier: 'home-assistant',
  kind: 'connector',
  packageName: '@pico/module-home-assistant',
  dependencies: Object.freeze([]),
  publishedSubpaths: Object.freeze(['./manifest', './observation', './ports']),
  surfaces: Object.freeze([
    'Foundation API: entity observations recorded as memory items',
  ]),
  effects: Object.freeze([]),
});
