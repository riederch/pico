/**
 * Die geschlossene Familienliste des Foundation-Protokolls, und sonst nichts.
 *
 * **Warum das ein eigenes Blatt ist** (2026-09-01, Befund B49). Sie stand in
 * `index.ts`, und `storage-pressure.ts` holte sie von dort zurueck - obwohl
 * `index.ts` `storage-pressure.js` wieder ausgibt. Derselbe Zyklus, an dem
 * `model-context.js` am selben Tag zerbrochen ist, nur noch nicht ausgeloest:
 * ein einziger neuer Import an einer ganz anderen Stelle genuegt, um die
 * Auswertungsreihenfolge zu kippen, und dann kopiert die Sammelausgabe aus
 * einem halbfertigen Modul.
 *
 * Ein Blatt ohne eigene Importe kann in keinem Zyklus liegen. `index.ts` gibt
 * die Liste weiter aus, damit kein Aufrufer etwas umschreiben muss.
 */

export const foundationEventTypes = [
  'device.registered',
  'device.seen',
  'session.created',
  'message.created',
  'avatar.state_changed',
  'memory.recorded',
  /**
   * ADR 0118 O1, the fifth floor family. Recorded with a due instant the
   * person meant on the wall clock; raising it needs no model and no network.
   */
  'memory.time_bound_entry_recorded',
  /**
   * ADR 0118 O1. The Home noticed that a time-bound entry came due.
   *
   * This is **not** a claim that anyone was told. It records that the instant
   * passed and the Home saw it, which is the part the Home can honestly know
   * about itself; `raised_at` stays for the surface that actually reached the
   * person. Content-free: an item id and the instant, never the words.
   */
  'memory.time_bound_entry_due',
  'memory.tombstone',
  /**
   * ADR 0049 mit ADR 0071. Eine Person hat einen Austausch zurückgenommen.
   *
   * Inhaltsfrei mit Absicht: die Jobkennung und sonst nichts. Was vergessen
   * wurde, ist gerade das, was hier nicht stehen darf - ein Protokolleintrag,
   * der die Frage aufbewahrt, wäre die Kopie, die das Vergessen aufhebt.
   */
  'memory.recall_forgotten',
  'memory.domain_shredded',
  'auth.operator_bootstrapped',
  'auth.credential_changed',
  'auth.operator_reset',
  'auth.sessions_revoked',
  'home.claimed',
  'home.reset',
  'home.membership_recorded',
  'home.membership_changed',
  'home.domain_read_granted',
  'home.domain_read_revoked',
  'home.share_envelope_issued',
  'home.share_envelope_removed',
  'home.device_recovered',
  'home.device_recovery_vetoed',
  'home.recovery_anchor_reseeded',
  'home.identity_root_rotation_vetoed',
  'home.host_key_rotated',
  'home.clock_divergence_detected',
  /**
   * ADR 0127 M3. A module was switched on or off.
   *
   * Content-free by construction: identifiers and a direction. Activation is a
   * durable decision a person made about their own Pico (ADR 0104 forbids it
   * being a host configuration option), so it is recorded the way this codebase
   * records durable decisions - an event and a projection - and it survives a
   * restart because it is in the log, not because something remembered.
   */
  'home.module_activation_changed',
  /**
   * ADR 0129 SR6. A person said whether a module may record.
   *
   * Separate from activation because they are separate decisions: one is
   * whether a feature exists, the other whether Pico may write down where
   * somebody goes. Content-free - an identifier and a direction.
   */
  'home.module_capture_changed',
  'home.presence_switch_changed',
  /**
   * ADR 0126 P3. Something a presence held became something the identity
   * keeps. Content-free: which crossing, from where, into which domain.
   */
  'home.state_crossed',
  /**
   * ADR 0140 RL4. A person said what may happen when an effect is requested.
   *
   * The third decision recorded in this shape, and the one that decides about
   * the other two: activation says a feature exists, capture says Pico may
   * write down where somebody goes, and this says what a request for a
   * declared effect is answered with. It is emphatically **not** an action -
   * if a rule change were reachable from the path rules govern, the most
   * valuable request in the system would be the one that removes the
   * governor. Content-free: an effect name, a domain and one of three
   * outcomes.
   */
  'home.rule_decision_changed',
  /**
   * ADR 0136 BR7 / ADR 0137 IN5 / ADR 0138 CO3-CO4. A person attached a
   * supplier, moved it, or changed what it may do.
   *
   * The fourth decision in this shape. Content-free: an identifier, a kind, a
   * domain and two flags. What the supplier *holds* never appears here - a
   * knowledge base is 1.4 GB of somebody's life and this is a record that it
   * is attached, not a record of what is in it.
   */
  'home.supplier_attachment_changed',
  /**
   * ADR 0142 PE1/PE2. A measurement of one host began, and later how it ended.
   *
   * **A pair rather than one record at the end**, because the work takes
   * minutes and the live view of it is held in memory. A Home that restarts
   * mid-measurement leaves a start with no finish, which is the honest
   * statement: the work stopped, it was not quietly completed. One record
   * written only on success could not say that.
   *
   * Content-free in the sense this family means: an identifier, the model, the
   * reach, the class a person declared and how it ended. No measured number,
   * because the numbers are the entry and the entry is the registry's - a
   * second copy here would drift from the one a caller reads.
   */
  'home.model_provider_measurement_changed',
  /**
   * ADR 0122 Y6. The running code changed. Content-free by construction: two
   * version strings and a direction, because an installation that cannot tell
   * it was downgraded cannot notice the one update that matters most.
   *
   * The `home.` prefix is not cosmetic here - `picoHomeAuditEventTypes` derives
   * the audit family from it, so this is chained and anchored like every other
   * authority-relevant record without a second decision.
   */
  'home.version_changed',
] as const;

export type FoundationEventType = typeof foundationEventTypes[number];
