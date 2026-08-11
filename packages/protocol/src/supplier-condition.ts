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
  /**
   * ADR 0136 BR6. Attached, credential present, everything decided - and the
   * working copy is not there yet, because a corpus is still arriving.
   *
   * It needed a name of its own because without one it presents as a defect,
   * and the honest test for whether a name earns a place in this list is
   * whether its **predicate signature** is new. This one is: it resolves
   * itself *and* spent nothing. `unreachable` and `rate_limited` resolve
   * themselves and spent disclosure - the request left. `out_of_scope` spends
   * nothing and never resolves. Nothing else waits for free.
   */
  'materializing',
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
  return condition === 'rate_limited'
    || condition === 'unreachable'
    || condition === 'materializing';
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
  return condition === 'not_configured'
    || condition === 'out_of_scope'
    || condition === 'materializing';
}

/**
 * ADR 0136 BR6. Reports `materializing` in place of `unreachable` while Pico
 * knows a working copy is still arriving.
 *
 * **A supplier cannot answer this one, and that is not a gap in the supplier.**
 * A half-cloned working copy, a freshly initialised repository and a damaged
 * one are indistinguishable from the files: all three have `.git/HEAD` naming
 * a ref that does not resolve. Only the side that *started* the fetch knows
 * which it is looking at - so this is Pico's own bookkeeping, in the same sense
 * ADR 0136 BR4 makes `askedAt` Pico's bookkeeping while the measurement belongs
 * to the content.
 *
 * **It replaces `unreachable` and nothing else.** That restriction is the whole
 * safety of the function: a not-yet-materialised working copy can only produce
 * `unreachable`, so anything else the supplier reported is a real answer about
 * something else - a budget that ran out, a subject not covered - and turning
 * *that* into "please wait" would launder a failure into patience. The one
 * direction is deliberate and the other is impossible: nothing here ever turns
 * `materializing` back into a failure.
 */
export function picoSupplierConditionWhileMaterializing(
  reported: PicoSupplierCondition,
  materializing: boolean,
): PicoSupplierCondition {
  if (!materializing || reported !== 'unreachable') {
    return reported;
  }
  return 'materializing';
}

/**
 * ADR 0138 CO5 - a limit is announced, not discovered.
 *
 * The posture ADR 0119 Q5 already uses for storage pressure: told while there
 * is still room to act, never as a surprise afterwards. A budget that only
 * speaks when it is gone turns the moment it is reached into an unexplained
 * outage, which is the failure this ADR names for spend and that ADR named for
 * disk.
 *
 * Two limits rather than one, and the refusal names which. `rate_limited`
 * resolves itself and needs nobody; `budget_exhausted` resolves itself never
 * and needs a person. A caller that could not tell them apart would report
 * "try later" for a question that will never work again.
 */
export const picoSupplierLimitKinds = ['rate', 'budget'] as const;

export type PicoSupplierLimitKind = typeof picoSupplierLimitKinds[number];

export const picoSupplierLimitStates = [
  /** Room left, nothing to say. */
  'normal',
  /** Close enough that a person can still act on it. */
  'approaching',
  /** Reached. The condition that follows is `rate_limited` or `budget_exhausted`. */
  'reached',
] as const;

export type PicoSupplierLimitState = typeof picoSupplierLimitStates[number];

/**
 * The share of a limit at which it starts speaking. Ten percent left, chosen
 * for the same reason ADR 0119's reserve is: it is enough room to do something
 * about it, and a deployment may widen it.
 */
export const defaultPicoSupplierLimitHeadroom = 0.1;

export function evaluatePicoSupplierLimit(input: {
  used: number;
  ceiling: number;
  headroom?: number;
}): PicoSupplierLimitState {
  const headroom = input.headroom ?? defaultPicoSupplierLimitHeadroom;
  if (!Number.isFinite(input.ceiling) || input.ceiling <= 0) {
    throw new Error('invalid_pico_supplier_limit_ceiling');
  }
  if (!Number.isFinite(headroom) || headroom < 0 || headroom >= 1) {
    throw new Error('invalid_pico_supplier_limit_headroom');
  }
  if (!Number.isFinite(input.used) || input.used < 0) {
    // An unreadable usage reading is not evidence of room, for the reason
    // ADR 0119 gives about free space: the one case that cannot be measured
    // must not be the one case that is unprotected.
    return 'reached';
  }
  if (input.used >= input.ceiling) {
    return 'reached';
  }
  return input.used >= input.ceiling * (1 - headroom) ? 'approaching' : 'normal';
}

/**
 * ADR 0138 CO5/CO2. Which condition a reached limit produces, named rather
 * than collapsed. Returns `null` while there is still room, because a limit
 * that has not been reached has no condition to report.
 */
export function picoSupplierLimitCondition(input: {
  kind: PicoSupplierLimitKind;
  state: PicoSupplierLimitState;
}): PicoSupplierCondition | null {
  if (input.state !== 'reached') {
    return null;
  }
  return input.kind === 'rate' ? 'rate_limited' : 'budget_exhausted';
}
