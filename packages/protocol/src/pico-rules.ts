import { type PicoEventOriginClass } from './index.js';
import { picoOriginTrustRank } from './model-context.js';
import { picoActionRiskClasses, type PicoActionRisk } from './module.js';

/**
 * ADR 0140 RL1-RL3 - what a decision may read, and what it answers.
 *
 * ADR 0010 listed nine things a policy decision "may depend on", as prose, in
 * a document written before any of them existed. That is not a contract: a
 * rule engine whose input is open cannot be tested against a counter-proof,
 * because there is no statement of what it was allowed to see.
 *
 * Worse, an open input is a path. A rationale is text, text is available, and
 * nothing written down says it must not be read - so the component with the
 * most authority in the system ends up reading model-authored prose, which is
 * the thing ADR 0117's whole split exists to prevent one layer higher.
 *
 * **So the gate here is the absence of a parameter**, in the same construction
 * `assemblePicoPlannerContext` uses: there is no field on `PicoRulesInput`
 * through which a sentence could arrive. A caller holding a rationale has
 * nowhere to put it, and the refusal happens at the call site rather than at
 * review time. A rule reads the class on a value, never the value's words.
 *
 * What this file does **not** decide is the rule language. Whether rules nest,
 * inherit or compose is product work; ADR 0140 constrains it rather than
 * designing it.
 */
export const picoRulesDecisions = ['allow', 'require_approval', 'deny'] as const;

export type PicoRulesDecisionValue = typeof picoRulesDecisions[number];

/**
 * ADR 0143 DP8 - a named reason a decision must be stricter than it would be.
 *
 * A large pull is not a bridge feature. ADR 0139 AC6 already made the scheduler
 * a requester, so a size threshold turns its `allow` into `require_approval`
 * and ADR 0141 RN4's presence-bound expiring approval does the rest: **one
 * consent mechanism, not two**. A second one built for transfers would have its
 * own expiry, its own presence rule and its own way of being wrong.
 *
 * Closed and named rather than a boolean, for the reason ADR 0140 RL3 gives
 * about missing-input codes: a reason has to reach a surface that can act on
 * it, and "the scheduler said so" is not something a person can answer.
 */
export const picoActionEscalations = ['large_transfer'] as const;

export type PicoActionEscalation = typeof picoActionEscalations[number];

const decisionStrictness: Readonly<Record<PicoRulesDecisionValue, number>> =
  Object.freeze({ allow: 0, require_approval: 1, deny: 2 });

/**
 * ADR 0140 RL4. Wendet eine aufgezeichnete Regel an: sie **wählt**, was der
 * Boden übrig gelassen hat.
 *
 * **Benannt statt inline, seit dem 2026-08-25**, weil hier ein blankes
 * `recordedRule ?? derived` stand und daneben eine Testgruppe namens „a
 * recorded rule refines, and never grants". Die bewies zwei Dinge - eine Regel
 * überstimmt den RL3-Boden nicht und schafft keine Reichweite, die ADR 0138
 * CO3 nie erlaubt hat - und ließ den Fall dazwischen ungeprüft. Ihr Titel las
 * sich als Aussage über alle drei.
 *
 * **Was gilt, genau gesagt.** Eine Regel entscheidet unter den Antworten, die
 * nach dem Boden und nach der Reichweitenbedingung übrig sind, und das schließt
 * beide Richtungen ein: sie kann ein `allow`, das die Risikoklasse hergäbe, zu
 * einer Frage oder einem Verbot machen, **und** sie kann eine Frage, die aus
 * `external_write` folgt, zu einer Erlaubnis machen. Das zweite ist nicht die
 * Lücke, es ist der Zweck: eine stehende Regel ist das, was einen
 * unbeaufsichtigten Lauf überhaupt handeln lässt (ADR 0143 DP8), und ohne sie
 * muss jeder Pfad einen Menschen finden.
 *
 * **Was sie nicht kann**, steht eine Ebene höher und nicht hier: der Boden und
 * ADR 0138 CO3 werden vor dieser Funktion zu `deny`, und keine Regel kommt
 * daran vorbei. Vom Nutzer am 2026-08-25 bestätigt, nachdem beide
 * Möglichkeiten nebeneinander lagen - und nachdem die erste Frage danach auf
 * zwei falschen Prämissen stand, die ich berichtigt habe.
 */
export function applyPicoRulesRecordedDecision(
  derived: PicoRulesDecisionValue,
  recorded?: PicoRulesDecisionValue,
): PicoRulesDecisionValue {
  return recorded ?? derived;
}

/**
 * ADR 0143 DP8. Applies escalations, and **only ever tightens**.
 *
 * A `deny` stays a `deny` and a `require_approval` never becomes an `allow`,
 * whatever a caller passes. That direction is the whole safety of letting a
 * requester influence a decision at all: this is a caller saying *ask about
 * this one*, never a caller saying *do not bother asking*, and the ordering is
 * enforced here rather than trusted to every call site.
 */
export function escalatePicoRulesDecision(
  decision: PicoRulesDecisionValue,
  escalations: readonly PicoActionEscalation[] = [],
): PicoRulesDecisionValue {
  if (escalations.length === 0) {
    return decision;
  }
  for (const escalation of escalations) {
    if (!(picoActionEscalations as readonly string[]).includes(escalation)) {
      throw new Error('pico_action_escalation_not_listed');
    }
  }
  return decisionStrictness[decision] >= decisionStrictness.require_approval
    ? decision
    : 'require_approval';
}

/**
 * ADR 0140 RL3. The closed set of reasons a decision can be refused *for want
 * of an input*, as codes rather than sentences.
 *
 * Codes because a reason has to reach a surface that can act on it, and
 * because a denial composed as free text is one a requester could eventually
 * influence. ADR 0140 RL1 keeps the reason as content; this keeps it as
 * Pico's own content.
 */
export const picoRulesMissingInputCodes = [
  'no_rule_for_effect',
  'argument_without_origin',
  'unknown_risk_class',
  'instance_not_attached',
  'domain_unresolved',
] as const;

export type PicoRulesMissingInputCode = typeof picoRulesMissingInputCodes[number];

export const picoRulesDomainPattern = /^[a-z0-9]+(?:_[a-z0-9]+)*$/u;
export const picoRulesInstancePattern = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/u;

/**
 * ADR 0140 RL2. Everything a decision may read.
 *
 * Note what is not here: no rationale, no summary, no description, no argument
 * *values*. The classes are present; the words are not.
 */
export interface PicoRulesInput {
  /** The manifest-declared effect (ADR 0139 AC1). */
  effectName: string;
  /** Pinned with the effect at consent (ADR 0139 AC4). */
  risk: PicoActionRisk;
  /** Per argument, never per request (ADR 0139 AC2). Names only, no values. */
  argumentOrigins: Readonly<Record<string, PicoEventOriginClass>>;
  /** The ADR 0075 domain the action would act in. */
  privacyDomain: string;
  /** Whether a person's presence was established for this request. */
  personPresent: boolean;
  /** The ADR 0137 instance the effect targets, or null where the slot has none. */
  instance: string | null;
  /** ADR 0138: whether this reaches a system Pico does not run. */
  reachesOutside: boolean;
  /**
   * ADR 0138 CO3. A precondition, not an input a rule can outvote: an `allow`
   * never creates reach. Present so a decision can refuse for the right
   * reason rather than allowing something that will then fail.
   */
  reachPermitted: boolean;
  /** Facts, not precedent (ADR 0140). Decisions on the same effect. */
  recentDecisions: readonly PicoRulesDecisionValue[];
}

export interface PicoRulesOutcome {
  decision: PicoRulesDecisionValue;
  /**
   * ADR 0140 RL1. A denial is content: it reaches the surface that asked and a
   * person can read it. Carried as codes so a surface can act on it and so
   * that nothing a requester wrote can end up in it.
   */
  reasons: readonly PicoRulesMissingInputCode[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertExactKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
  error: string,
): void {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])) {
    throw new Error(error);
  }
}

/**
 * ADR 0140 RL2. Re-parses the input at the decision boundary rather than
 * trusting it, and refuses any key the contract does not name - which is where
 * a `rationale` or a `summary` would be turned away.
 */
export function parsePicoRulesInput(value: unknown): PicoRulesInput {
  const record = isRecord(value) ? value : undefined;
  if (record === undefined) {
    throw new Error('invalid_pico_rules_input');
  }
  assertExactKeys(record, [
    'effectName',
    'risk',
    'argumentOrigins',
    'privacyDomain',
    'personPresent',
    'instance',
    'reachesOutside',
    'reachPermitted',
    'recentDecisions',
  ], 'invalid_pico_rules_input');

  if (typeof record.effectName !== 'string' || record.effectName === '') {
    throw new Error('invalid_pico_rules_effect_name');
  }
  if (typeof record.risk !== 'string'
    || !(picoActionRiskClasses as readonly string[]).includes(record.risk)) {
    throw new Error('invalid_pico_rules_risk');
  }
  const origins = isRecord(record.argumentOrigins) ? record.argumentOrigins : undefined;
  if (origins === undefined) {
    throw new Error('invalid_pico_rules_argument_origins');
  }
  for (const [name, originClass] of Object.entries(origins)) {
    if (typeof originClass !== 'string') {
      throw new Error('invalid_pico_rules_argument_origins');
    }
    // Through the shared rank check, so an unknown class cannot enter here
    // either - and so this file holds no second copy of the ordering.
    picoOriginTrustRank(originClass as PicoEventOriginClass);
    if (typeof name !== 'string' || name === '') {
      throw new Error('invalid_pico_rules_argument_origins');
    }
  }
  if (typeof record.privacyDomain !== 'string'
    || !picoRulesDomainPattern.test(record.privacyDomain)) {
    throw new Error('invalid_pico_rules_domain');
  }
  if (typeof record.personPresent !== 'boolean'
    || typeof record.reachesOutside !== 'boolean'
    || typeof record.reachPermitted !== 'boolean') {
    throw new Error('invalid_pico_rules_input');
  }
  if (record.instance !== null
    && (typeof record.instance !== 'string'
      || !picoRulesInstancePattern.test(record.instance))) {
    throw new Error('invalid_pico_rules_instance');
  }
  if (!Array.isArray(record.recentDecisions)
    || record.recentDecisions.some((entry) =>
      typeof entry !== 'string'
      || !(picoRulesDecisions as readonly string[]).includes(entry))) {
    throw new Error('invalid_pico_rules_recent_decisions');
  }

  return Object.freeze({
    effectName: record.effectName,
    risk: record.risk as PicoActionRisk,
    argumentOrigins: Object.freeze({ ...(origins as Record<string, PicoEventOriginClass>) }),
    privacyDomain: record.privacyDomain,
    personPresent: record.personPresent,
    instance: record.instance as string | null,
    reachesOutside: record.reachesOutside,
    reachPermitted: record.reachPermitted,
    recentDecisions: Object.freeze([...(record.recentDecisions as PicoRulesDecisionValue[])]),
  });
}

/**
 * ADR 0140 RL3. Unknown is deny, and the denial names which unknown.
 *
 * Takes the argument names the request actually carried, because a
 * classification map cannot show an argument nobody classified: an absent key
 * and an absent argument look identical from inside the map.
 *
 * A module that ships a new effect is inert until someone rules on it, which
 * is the correct default where every module ships and activation is a
 * configuration question (ADR 0127).
 */
export function picoRulesMissingInput(input: {
  request: PicoRulesInput;
  argumentNames: readonly string[];
  hasRuleForEffect: boolean;
  instanceAttached: boolean;
  domainResolved: boolean;
}): readonly PicoRulesMissingInputCode[] {
  const reasons: PicoRulesMissingInputCode[] = [];
  if (!input.hasRuleForEffect) {
    reasons.push('no_rule_for_effect');
  }
  if (input.argumentNames.some((name) => input.request.argumentOrigins[name] === undefined)) {
    reasons.push('argument_without_origin');
  }
  if (!(picoActionRiskClasses as readonly string[]).includes(input.request.risk)) {
    reasons.push('unknown_risk_class');
  }
  if (input.request.instance !== null && !input.instanceAttached) {
    reasons.push('instance_not_attached');
  }
  if (!input.domainResolved) {
    reasons.push('domain_unresolved');
  }
  return Object.freeze(reasons);
}

/**
 * ADR 0140 RL3 and RL1. A decision that cannot be made is `deny` with its
 * reasons, never an exception and never a silent no-op: a refusal a person
 * cannot see is indistinguishable from a bug.
 *
 * This is not the rule engine. It is the floor underneath one - the answer
 * that holds before any rule is consulted.
 */
export function picoRulesFloorOutcome(
  reasons: readonly PicoRulesMissingInputCode[],
): PicoRulesOutcome | null {
  if (reasons.length === 0) {
    return null;
  }
  return Object.freeze({ decision: 'deny' as const, reasons: Object.freeze([...reasons]) });
}
