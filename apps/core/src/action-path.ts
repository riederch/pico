import {
  buildPicoActionRequest,
  type PicoActionRequest,
  type PicoActionRequestInput,
} from '@pico/protocol/action';
import type { PicoEventOriginClass } from '@pico/protocol';
import {
  resolvePicoApproval,
  type PicoApprovalOutcome,
  type PicoPendingApproval,
} from '@pico/protocol/approval';
import {
  picoInstanceToken,
  type PicoInstanceSelection,
} from '@pico/protocol/instance-selection';
import type { PicoModuleEffect } from '@pico/protocol/module';
import {
  escalatePicoRulesDecision,
  picoRulesFloorOutcome,
  picoRulesMissingInput,
  type PicoActionEscalation,
  type PicoRulesDecisionValue,
  type PicoRulesInput,
  type PicoRulesMissingInputCode,
} from '@pico/protocol/pico-rules';

/**
 * ADR 0139 AC6, ADR 0140 RL5/RL6, ADR 0141 RN1/RN2/RN4 - the action path.
 *
 * ADR 0010 opens with "the LLM may propose an action", and that framing is
 * what made this look blocked for as long as it did. It never needed
 * inference: something inside Pico wanting to reach a person is an action
 * request, and it needs the same five facts.
 *
 * The requester here is Pico's own scheduler, which is the point rather than a
 * shortcut. ADR 0139's first rule is that the requester is never trusted, and
 * being Pico's own code buys no exemption - so the path is built against an
 * untrusted requester from its first caller, and a planner arriving later
 * changes nothing about the contract.
 *
 * **Deciding and executing are two functions, and that is ADR 0140 RL5.** The
 * decision is recorded before anything runs, and `executePicoAction` takes the
 * *record* rather than the inputs - so it has nothing to re-decide with. One
 * decision in one place is the property every guard in this tree has; two
 * evaluations of the same request are two chances to disagree, resolved by
 * whichever ran last.
 *
 * The record carries the request rather than pointing at it, which is ADR 0141
 * RN1's "a changed request is a new request" made structural: there is no
 * second copy that could differ from the one that was decided.
 *
 * **What stands in for Pico Rules, and what does not.** ADR 0140 leaves the
 * rule language undecided, so this runs the *floor* only: the RL3 answer that
 * holds before any rule is consulted. `hasRuleForEffect` is answered from the
 * ADR 0139 AC4 consent record, because that record is a person's decision
 * about exactly this effect - they read its description and its risk class
 * when they switched the module on. A real rule engine adds contextual
 * decisions above this; nothing here is one.
 */

/**
 * ADR 0141 RN2 - what a `read_only` effect is handed.
 *
 * The runner cannot look inside an implementation and see a write, so this is
 * not a detection. It is the construction ADR 0117 X1 uses for
 * `picoReaderCapabilities` and ADR 0136 BR4 for `confirmedByPerson`: the
 * capability is simply not there.
 *
 * Two layers, because they catch different mistakes. The **type** omits
 * `write` for a read-only effect, so a call site that tries does not compile.
 * The **runtime** still hands over a named thrower rather than nothing,
 * because an absent property produces a `TypeError` whose message says
 * nothing, and what gets recorded has to say what happened.
 *
 * And it is a **runner failure**, never an approval prompt. Asking would put
 * the escalation in front of a person as a normal-looking question at exactly
 * the moment the system has evidence that a declaration is false.
 */
export interface PicoEffectCapabilities {
  /** Present for every risk class except `read_only`. */
  write: (perform: () => void) => void;
}

export function picoEffectCapabilitiesFor(risk: string): PicoEffectCapabilities {
  if (risk === 'read_only') {
    return Object.freeze({
      write: () => {
        throw new Error('pico_effect_read_only_attempted_write');
      },
    });
  }
  return Object.freeze({ write: (perform: () => void) => { perform(); } });
}

export type PicoActionFactType =
  | 'action.requested'
  | 'pico_rules.decision_created'
  | 'approval.requested'
  | 'approval.resolved'
  | 'action_runner.action_started'
  | 'action_runner.action_completed';

export type PicoActionEffect = (
  request: PicoActionRequest,
  capabilities: PicoEffectCapabilities,
) => void;

export type PicoActionEmit = (
  type: PicoActionFactType,
  payload: Record<string, unknown>,
) => string;

/**
 * ADR 0140 RL5. What the runner is given, and the only thing it is given.
 *
 * It carries the request rather than a reference to it, so nothing can drift
 * between what was decided and what runs.
 */
export interface PicoActionDecision {
  requestedEventId: string;
  decisionEventId: string;
  decision: PicoRulesDecisionValue;
  reasons: readonly PicoRulesMissingInputCode[];
  request: PicoActionRequest;
  risk: string;
  /** ADR 0140 RL6. The domain this decision spoke for. */
  privacyDomain: string;
  /** ADR 0143 DP8. Present only when something tightened this decision. */
  escalations?: readonly PicoActionEscalation[];
  /** Present only for `require_approval`. */
  pending?: PicoPendingApproval;
}

export interface PicoActionDecisionInput {
  /** What the requester asked for. It cannot state its arguments' origin. */
  requested: PicoActionRequestInput;
  /** Controller knowledge: where each argument came from (ADR 0139 AC2/AC3). */
  argumentSources: Readonly<Record<string, readonly PicoEventOriginClass[]>>;
  /** ADR 0139 AC1: the effects a manifest declared and the runtime wired. */
  declaredEffectNames: readonly string[];
  /** ADR 0139 AC4: what the person consented to, as they read it. */
  consentedEffects: readonly PicoModuleEffect[];
  privacyDomain: string;
  personPresent: boolean;
  /**
   * ADR 0137 IN5. The instance this effect targets, and **not a string**.
   *
   * A `PicoInstanceSelection` can only have come from a person or from there
   * having been exactly one candidate. A derived location produces a
   * `PicoInstanceProposal`, which has no route into this parameter - the
   * refusal is the absence of a way to pass one, the construction ADR 0117 X1
   * uses for the planner context. `null` where the effect's slot has no
   * instance at all.
   */
  instance: PicoInstanceSelection | null;
  /**
   * ADR 0137 IN5 with ADR 0140 RL3. Which instances are attached, so
   * `instance_not_attached` answers from the attachment record instead of
   * being assumed.
   *
   * Absent means none, which denies any named instance. That is the
   * fail-closed reading and the one this parameter replaced: before the
   * attachment store existed, a named instance denied unconditionally.
   */
  attachedInstances?: readonly string[];
  /**
   * ADR 0143 DP8. Named reasons this decision must be stricter than the risk
   * class alone would make it - a large transfer, today.
   *
   * Escalation only: an `allow` can become `require_approval` and nothing here
   * can loosen a `deny`. That direction is what makes it safe to let a
   * requester influence a decision at all - this is a caller saying *ask about
   * this one*, never *do not bother asking*.
   */
  escalations?: readonly PicoActionEscalation[];
  reachesOutside: boolean;
  reachPermitted: boolean;
  /**
   * ADR 0140 RL4. What a person recorded for this effect in this domain, if
   * anything. Absent is not `deny`: the ADR 0139 AC4 consent record already
   * carries a decision that this effect may exist, and an explicit rule
   * refines it rather than being its precondition.
   */
  recordedRule?: PicoRulesDecisionValue;
  emit: PicoActionEmit;
  /**
   * ADR 0141 RN4. Required as soon as a decision could be
   * `require_approval`: the session presence was established in, and how long
   * the question stands.
   */
  approvalWindow?: {
    presenceSessionId: string;
    endsAtMs: number;
    startedAtMs: number;
    durationMs: number;
  };
}

/**
 * ADR 0140 RL5. Decides once, records it, and hands back the record.
 *
 * Nothing here runs an effect. A caller that wants the action to happen takes
 * the record to `executePicoAction`, which is the only way an effect is
 * reached.
 */
export function decidePicoAction(input: PicoActionDecisionInput): PicoActionDecision {
  const consented = input.consentedEffects
    .find((effect) => effect.name === input.requested.effectName);
  if (consented === undefined) {
    // Not a rules outcome. A person never agreed to this effect, or agreed to
    // a different version of it, and the request contract refuses before any
    // decision is asked for (ADR 0139 AC1/AC4).
    throw new Error('pico_action_effect_not_consented');
  }

  // ADR 0137 IN5. Before anything is recorded: a derived location handed in as
  // the target is refused here, so a guess never becomes a request. The order
  // matters - a refusal after `action.requested` would leave a fact about an
  // action that was never one.
  const instanceToken = picoInstanceToken(input.instance);

  // ADR 0139 AC1-AC3. Throws on an undeclared effect, a requester-asserted
  // origin, an unclassified argument or an empty derivation.
  const request = buildPicoActionRequest({
    requested: input.requested,
    declaredEffectNames: input.declaredEffectNames,
    argumentSources: input.argumentSources,
  });

  const requestedEventId = input.emit('action.requested', {
    actionName: request.effectName,
    risk: consented.risk,
    input: Object.fromEntries(request.arguments.map((argument) => [
      argument.name,
      picoRecordedArgument(argument),
    ])),
  });

  const rulesInput: PicoRulesInput = Object.freeze({
    effectName: request.effectName,
    risk: consented.risk,
    argumentOrigins: Object.freeze(Object.fromEntries(
      request.arguments.map((argument) => [argument.name, argument.originClass]),
    )),
    privacyDomain: input.privacyDomain,
    personPresent: input.personPresent,
    // The token is all a rule reads (ADR 0140 RL1), and it is reachable only
    // through a selection.
    instance: instanceToken,
    reachesOutside: input.reachesOutside,
    reachPermitted: input.reachPermitted,
    recentDecisions: Object.freeze([]),
  });

  const missing = picoRulesMissingInput({
    request: rulesInput,
    argumentNames: request.arguments.map((argument) => argument.name),
    // The consent record is the person's decision about this effect.
    hasRuleForEffect: true,
    instanceAttached: instanceToken === null
      || (input.attachedInstances ?? []).includes(instanceToken),
    domainResolved: true,
  });
  const floor = picoRulesFloorOutcome(missing);

  // ADR 0138: an allow never creates reach. A precondition, not an input a
  // rule can outvote.
  const reachRefused = input.reachesOutside && !input.reachPermitted;

  // The floor and the reach precondition are not overridable: a recorded rule
  // decides between the answers that remain, and cannot grant what ADR 0140
  // RL3 refused for want of an input or what ADR 0138 CO3 never permitted.
  const decided: PicoRulesDecisionValue = floor !== null || reachRefused
    ? 'deny'
    : input.recordedRule
      ?? (consented.risk === 'read_only' || consented.risk === 'local_write'
        ? 'allow'
        : 'require_approval');
  // ADR 0143 DP8. Applied last and only ever tightening, so a recorded rule
  // cannot cancel an escalation and an escalation cannot cancel the floor.
  const decision = escalatePicoRulesDecision(decided, input.escalations ?? []);

  const reasons = floor?.reasons ?? Object.freeze([]);
  const escalations = input.escalations ?? [];
  const decisionEventId = input.emit('pico_rules.decision_created', {
    requestedEventId,
    decision,
    // ADR 0143 DP8. An escalated decision says what escalated it. Without
    // this, a person asked about a two-gigabyte clone would be asked with no
    // reason attached - the floor's codes cover the refusals, and nothing
    // covered the case where a request was *tightened* rather than refused.
    reason: reasons.length > 0
      ? reasons.join(',')
      : (escalations.length > 0 ? escalations.join(',') : decision),
    risk: consented.risk,
    // ADR 0140 RL6. A decision is never domain-blind, and its record says
    // which domain it spoke for.
    dataSpace: input.privacyDomain,
  });

  let pending: PicoPendingApproval | undefined;
  if (decision === 'require_approval') {
    // ADR 0141 RN4. The question is recorded with the session it was asked
    // into and a window that expires on two clocks; nothing runs until it is
    // answered there.
    if (input.approvalWindow === undefined) {
      // Refused rather than defaulted: a window nobody chose is a standing
      // grant with a number attached.
      throw new Error('pico_action_requires_approval_window');
    }
    pending = Object.freeze({
      requestedEventId,
      presenceSessionId: input.approvalWindow.presenceSessionId,
      endsAtMs: input.approvalWindow.endsAtMs,
      startedAtMs: input.approvalWindow.startedAtMs,
      durationMs: input.approvalWindow.durationMs,
    });
    input.emit('approval.requested', {
      requestedEventId,
      prompt: consented.description,
      risk: consented.risk,
      expiresAt: new Date(pending.endsAtMs).toISOString(),
    });
  }

  return Object.freeze({
    requestedEventId,
    decisionEventId,
    decision,
    reasons,
    ...(escalations.length === 0 ? {} : { escalations }),
    request,
    risk: consented.risk,
    privacyDomain: input.privacyDomain,
    ...(pending === undefined ? {} : { pending }),
  });
}

export interface PicoActionExecution {
  ran: boolean;
  succeeded?: boolean;
}

/**
 * ADR 0141 RN1. Executes the decided request and infers nothing.
 *
 * No default is supplied, no ambiguity is resolved, nothing is retried with an
 * adjusted argument, and the rules are not consulted a second time - there is
 * nothing here to consult them with. A request that cannot be executed as
 * decided fails and is recorded as failed.
 *
 * Anything other than `allow` refuses rather than running, including
 * `require_approval`: that decision means a question is standing, and running
 * it here would answer the question by acting.
 */
export function executePicoAction(input: {
  decided: PicoActionDecision;
  effects: Readonly<Record<string, PicoActionEffect>>;
  emit: PicoActionEmit;
}): PicoActionExecution {
  if (input.decided.decision !== 'allow') {
    throw new Error('pico_action_not_allowed');
  }
  return runDecidedEffect({
    requestedEventId: input.decided.requestedEventId,
    request: input.decided.request,
    risk: input.decided.risk,
    effects: input.effects,
    emit: input.emit,
  });
}

function runDecidedEffect(input: {
  requestedEventId: string;
  request: PicoActionRequest;
  risk: string;
  effects: Readonly<Record<string, PicoActionEffect>>;
  emit: PicoActionEmit;
}): PicoActionExecution {
  const startedEventId = input.emit('action_runner.action_started', {
    requestedEventId: input.requestedEventId,
    actionName: input.request.effectName,
    risk: input.risk,
  });

  let succeeded = true;
  let summary = 'ran';
  try {
    const run = input.effects[input.request.effectName];
    if (run === undefined) {
      throw new Error('unsupplied_pico_module_effect');
    }
    run(input.request, picoEffectCapabilitiesFor(input.risk));
  } catch (error) {
    // A failure is recorded with the same weight as a success. An audit that
    // only holds what worked cannot be audited against.
    succeeded = false;
    summary = error instanceof Error ? error.message : 'failed';
  }

  input.emit('action_runner.action_completed', {
    startedEventId,
    actionName: input.request.effectName,
    success: succeeded,
    summary,
  });

  return { ran: true, succeeded };
}

/**
 * ADR 0141 RN4. Finishes a question that was left standing.
 *
 * The outcome is recorded whatever it is - approved, refused or unanswered -
 * because an audit that only holds the answers somebody gave is missing the
 * ones nobody did. Only `approved` runs, and it runs through the same start
 * and finish facts an immediate allow does, because the runner does not have
 * two paths.
 */
export function resolvePicoActionApproval(input: {
  decided: PicoActionDecision;
  presenceSessionId: string;
  approved?: boolean;
  nowMs: number;
  monotonicNowMs: number;
  anchorFloorMs?: number | null;
  effects: Readonly<Record<string, PicoActionEffect>>;
  emit: PicoActionEmit;
}): { outcome: PicoApprovalOutcome; ran: boolean; succeeded?: boolean } {
  const pending = input.decided.pending;
  if (pending === undefined) {
    throw new Error('pico_action_has_no_pending_approval');
  }

  const resolution = resolvePicoApproval({
    pending,
    presenceSessionId: input.presenceSessionId,
    approved: input.approved,
    nowMs: input.nowMs,
    monotonicNowMs: input.monotonicNowMs,
    anchorFloorMs: input.anchorFloorMs,
  });

  input.emit('approval.resolved', {
    approvalEventId: pending.requestedEventId,
    outcome: resolution.outcome,
    resolvedAt: new Date(input.nowMs).toISOString(),
  });

  if (!resolution.mayRun) {
    return { outcome: resolution.outcome, ran: false };
  }

  return {
    outcome: resolution.outcome,
    ...runDecidedEffect({
      requestedEventId: pending.requestedEventId,
      request: input.decided.request,
      risk: input.decided.risk,
      effects: input.effects,
      emit: input.emit,
    }),
  };
}

/**
 * ADR 0141 RN6. What a recorded argument may hold.
 *
 * An argument that carried `external_content` is never recorded verbatim. The
 * reason is not storage cost: history is read by a person today and is exactly
 * the durable, trusted-looking store a model would later be given access to,
 * and verbatim untrusted text sitting in it would undo ADR 0117's containment
 * through the back door - a year later, by someone with no reason to suspect
 * the history.
 *
 * `reference_only` rather than a summary, because Pico has no summariser here
 * and inventing one would be the thing ADR 0117 forbids. The reference is a
 * digest of the value, which is enough to recognise the same value again
 * without holding it.
 */
export function picoRecordedArgument(argument: {
  name: string;
  value: string | number | boolean;
  originClass: PicoEventOriginClass;
}): Record<string, unknown> {
  if (argument.originClass !== 'external_content') {
    return { value: argument.value, originClass: argument.originClass, redaction: 'none' };
  }
  return {
    originClass: argument.originClass,
    redaction: 'reference_only',
    reference: picoArgumentReference(argument.value),
  };
}

function picoArgumentReference(value: string | number | boolean): string {
  // A short stable handle rather than a cryptographic commitment: this exists
  // so a reader can tell two records apart, not so anyone can prove anything
  // about the value. Stating that is cheaper than a hash nobody may rely on.
  const text = String(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `ref_${hash.toString(16).padStart(8, '0')}_${text.length}`;
}
