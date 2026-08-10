/**
 * ADR 0138 CO2 and ADR 0137 IN3 - what a supplier reports about itself.
 *
 * ADR 0118 O2 already types *capability* unavailability: `no_model`,
 * `no_network`, `timeout`, as reasons a capability could not answer. This is
 * the neighbouring vocabulary and deliberately not the same one: O2 says why a
 * capability is unavailable on this device, and a supplier condition says what
 * happened with one supplier. A device with a network can still hold a bridge
 * whose credits ran out.
 *
 * Carried as content that a surface renders, never as a thrown string. A
 * refusal a person cannot see is indistinguishable from a bug, and a reason
 * composed as free text is one a requester could eventually influence.
 *
 * **The load-bearing distinction is refused-for-now against
 * refused-until-you-decide.** `rate_limited` will work later on its own;
 * `budget_exhausted` will not work until a person decides something. A single
 * `error` collapses them, and collapsing them is how a spend limit turns into
 * an outage nobody can explain.
 */
export const picoSupplierConditions = [
  /** Answered, with what was asked for. */
  'ok',
  /** ADR 0138 CO2. No credential; nothing was attempted, so nothing was disclosed. */
  'not_configured',
  /** The attempt failed below the application. */
  'unreachable',
  /** Refused for now. Will work later without anyone deciding anything. */
  'rate_limited',
  /** Refused until a person decides something. */
  'budget_exhausted',
  /** An answer exists and is older than it looks live (ADR 0136's three clocks). */
  'stale_but_present',
  /** Some of what was asked came back, and the answer says which part. */
  'partial',
  /**
   * ADR 0137 IN3. The subject is not in this instance's declared coverage: the
   * ship is not in these waters, the light is not in this building. A
   * different fact from an answer that does not exist, and only one of the two
   * is worth re-asking somewhere else.
   */
  'out_of_scope',
] as const;

export type PicoSupplierCondition = typeof picoSupplierConditions[number];

export function isPicoSupplierCondition(value: unknown): value is PicoSupplierCondition {
  return typeof value === 'string'
    && (picoSupplierConditions as readonly string[]).includes(value);
}

export function assertPicoSupplierCondition(value: unknown): PicoSupplierCondition {
  if (!isPicoSupplierCondition(value)) {
    throw new Error('invalid_pico_supplier_condition');
  }
  return value;
}

/**
 * ADR 0138 CO2. Whether content came back at all. `stale_but_present` and
 * `partial` do carry content - which is the point of naming them rather than
 * folding them into a failure - and both oblige the caller to say so.
 */
export function picoSupplierConditionCarriesContent(
  condition: PicoSupplierCondition,
): boolean {
  return condition === 'ok'
    || condition === 'stale_but_present'
    || condition === 'partial';
}

/**
 * ADR 0138 CO2. Refused for now, and will resolve without anyone acting.
 * Distinguishable from `budget_exhausted` by a consumer without reading prose,
 * which is the whole reason both names exist.
 */
export function picoSupplierConditionResolvesItself(
  condition: PicoSupplierCondition,
): boolean {
  return condition === 'rate_limited' || condition === 'unreachable';
}

/**
 * ADR 0138 CO2/CO5. Refused until a person decides something - a question
 * addressed to someone, not a state that will pass.
 */
export function picoSupplierConditionNeedsPerson(
  condition: PicoSupplierCondition,
): boolean {
  return condition === 'not_configured' || condition === 'budget_exhausted';
}

/**
 * ADR 0138. Whether the attempt spent anything, where spending means money
 * *and* disclosure - and disclosure always, because asking a provider where a
 * ship is tells the provider that someone cares about that ship.
 *
 * Only two conditions spend nothing, and both are decided before reaching out:
 * there was no credential to try with, or the instance never claimed to cover
 * the subject (ADR 0137 IN2, answerable from the manifest).
 */
export function picoSupplierConditionSpentNothing(
  condition: PicoSupplierCondition,
): boolean {
  return condition === 'not_configured' || condition === 'out_of_scope';
}
