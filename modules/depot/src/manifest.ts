import type { PicoModuleManifest } from '@pico/protocol/module';

/**
 * ADR 0143 DP8 with ADR 0127 M5 - depot management as a Pico module.
 *
 * The question this answers looks like a namespace question and is a consent
 * question. ADR 0139 AC4 requires a consent record for **every** effect -
 * name, description and risk class, pinned at the moment a person read them -
 * and that record is keyed by module identifier. An effect with no module has
 * nowhere to live in it: it would be a thing Pico can cause that nobody agreed
 * to and nobody *could* agree to. So a fetch that reaches a remote is either a
 * module's declared effect or it is outside the consent system, and the second
 * is not a place this tree puts outward reach.
 *
 * **A product module, not a connector.** ADR 0127's kinds turn on where the
 * input comes from. A connector takes foreign content and would carry ADR 0116
 * W2 threshold labeling with it; this module takes a person's decision about a
 * repository they chose, and the code that arrives is governed by ADR 0143's
 * pin and DP4's reach rules rather than by an origin class. What a depot
 * *delivers* is suppliers, and everything they carry inward is labeled at
 * ADR 0136 BR3's threshold - by the core, in a different file, without asking
 * anyone.
 *
 * **Why the module cannot do the fetching, and why that is the design rather
 * than a limitation.** `module:check` refuses `node:child_process` in a
 * module, and the fetch is `git`. That is ADR 0128 H3 working exactly as
 * written: *a module declares what it can cause and the core decides whether
 * to cause it; what it needs arrives as a port.* `fetchPicoDepot` lives in the
 * core, where reaching the world is allowed, and this module names the effect
 * that asks for it - the same shape the calendar has for raising an entry.
 *
 * **Switching it off stops fetching and keeps every attachment.** ADR 0127 M3:
 * deactivation stops behaviour, never custody, and re-enabling restores
 * everything. That is the same distinction ADR 0129 SR6 draws between stopping
 * and forgetting, and the same one ADR 0136 draws for detaching a library -
 * three places, one rule.
 */
export const picoDepotModuleManifest: PicoModuleManifest = Object.freeze({
  identifier: 'depot',
  kind: 'product',
  packageName: '@pico/module-depot',
  // Nothing to build on. A depot delivers suppliers; it does not read what
  // they produce, and the modules that will are not written.
  dependencies: Object.freeze([]),
  publishedSubpaths: Object.freeze(['./manifest', './depot']),
  surfaces: Object.freeze([
    'Foundation API: attaching a depot at a commit and detaching it',
    'Foundation API: the two reach decisions, both off until someone grants them',
    'Foundation dashboard: which depots are attached, and the commit each runs at',
    'Foundation dashboard: a newer commit shown as an offer, with what it would move from and to',
    'Foundation API: what will not happen if this module is switched off',
  ]),
  /**
   * ADR 0128 H3 and ADR 0139 AC4. One effect, and the description is the
   * sentence a person consents to.
   *
   * **`external_write` rather than `local_write`.** ADR 0010's six classes are
   * unchanged and this is the honest one: a fetch contacts a system Pico does
   * not run, tells it that this Pico is pulling, and brings back code that
   * will execute. The calendar's `local_write` reaches a surface on the same
   * machine; this reaches somebody else's server. Under ADR 0140's floor,
   * `external_write` also means a fetch does not resolve to `allow` from the
   * risk class alone - which is the correct default for the only effect in the
   * tree that installs code.
   *
   * The description says what the person is agreeing to in the terms they
   * would use, rather than in the terms the implementation uses. "Holt Code"
   * is the fact; "aus einem Repository, das du angenommen hast" is the reason
   * it is not alarming; and naming the commit is what makes ADR 0143 DP1
   * visible at the moment it matters.
   */
  effects: Object.freeze([
    Object.freeze({
      name: 'depot.fetch',
      description:
        'Fetches a depot at the commit you accepted, so the suppliers it '
        + 'provides are on this device. Contacts the repository and tells it '
        + 'that this Pico is pulling.',
      risk: 'external_write' as const,
    }),
  ]),
});
