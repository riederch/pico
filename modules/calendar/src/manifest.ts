import type { PicoModuleManifest } from '@pico/protocol/module';

/**
 * ADR 0127 M1. The calendar, as the first Pico module.
 *
 * It is deliberately the first because the ADR 0118 O1 work was already cut
 * along this boundary: `due_at` and `raised_at` carry no calendar-specific
 * name, the scheduler is generic, and the vocabulary already sits behind
 * `@pico/protocol/time-bound-entry`. So the calendar demonstrates the contract
 * without a rewrite, which is what a first module should do.
 *
 * **A product module.** Its input is the person's own, through Pico's own
 * surfaces. If it ever accepted foreign content - a shared invitation, a
 * message parsed into an appointment - it would have become a connector and
 * would take ADR 0116 W2 threshold labeling with it. That is a change of kind,
 * not an addition of a feature.
 *
 * **No dependencies.** Nothing else is shipped yet, and an empty list is a
 * declaration rather than an omission: ADR 0127 permits a module to depend on
 * another when the dependency is declared, targets a published subpath, and
 * keeps the graph acyclic.
 */
export const picoCalendarModuleManifest: PicoModuleManifest = Object.freeze({
  identifier: 'calendar',
  kind: 'product',
  packageName: '@pico/module-calendar',
  dependencies: Object.freeze([]),
  // No `.` export exists, deliberately. A barrel is how this tree twice
  // dragged unrelated code into the measured tray budget, and ADR 0127 chose
  // subpaths from the first day rather than vigilance.
  publishedSubpaths: Object.freeze(['./manifest', './calendar']),
  surfaces: Object.freeze([
    'Foundation API: recording a memory item with a due instant',
    'Foundation dashboard: the entry list and its waiting, overdue and raised states',
    'Pico Link: home.time_bound_entries.read',
    'Companion: the time_bound_entry_due presentation state',
  ]),
});
