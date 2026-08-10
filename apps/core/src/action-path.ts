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
import type { PicoModuleEffect } from '@pico/protocol/module';
import {
  picoRulesFloorOutcome,
  picoRulesMissingInput,
  type PicoRulesDecisionValue,
  type PicoRulesInput,
  type PicoRulesMissingInputCode,
} from '@pico/protocol/pico-rules';

/**
 * ADR 0139 AC6 - the first action, with no model and no bridge.
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
 * **What stands in for Pico Rules, and what does not.** ADR 0140 leaves the
 * rule language undecided, so this runs the *floor* only: the RL3 answer that
 * holds before any rule is consulted. `hasRuleForEffect` is answered from the
 * ADR 0139 AC4 consent record, because that record is a person's decision
 * about exactly this effect - they read its description and its risk class
 * when they switched the module on. A real rule engine adds contextual
 * decisions above this; nothing here is one.
 *
 * **`require_approval` waits, and the waiting is bounded.** ADR 0141 RN4: the
 * question is recorded with the session presence was established in and a
 * window that expires on two clocks, and `resolvePicoActionApproval` finishes
 * it. Nothing runs until someone in that session answers, and an expired
 * question is recorded as unanswered rather than as a refusal - a person who
 * was asleep did not say no.
 */
export interface PicoActionPathInput {
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
  instance: string | null;
  reachesOutside: boolean;
  reachPermitted: boolean;
  /** The wired effect implementations, by declared name (ADR 0128 H3). */
  effects: Readonly<Record<string, (request: PicoActionRequest) => void>>;
  /** Records one fact and returns its event id. */
  emit: (type: PicoActionFactType, payload: Record<string, unknown>) => string;
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

export type PicoActionFactType =
  | 'action.requested'
  | 'pico_rules.decision_created'
  | 'approval.requested'
  | 'approval.resolved'
  | 'action_runner.action_started'
  | 'action_runner.action_completed';

export interface PicoActionPathOutcome {
  requestedEventId: string;
  decision: PicoRulesDecisionValue;
  reasons: readonly PicoRulesMissingInputCode[];
  /** Whether the effect actually ran. */
  ran: boolean;
  /** Present only when it ran. */
  succeeded?: boolean;
  /** Present only for `require_approval`: the question now standing. */
  pending?: PicoPendingApproval;
}

export function runPicoAction(input: PicoActionPathInput): PicoActionPathOutcome {
  const consented = input.consentedEffects
    .find((effect) => effect.name === input.requested.effectName);
  if (consented === undefined) {
    // Not a rules outcome. A person never agreed to this effect, or agreed to
    // a different version of it, and the request contract refuses before any
    // decision is asked for (ADR 0139 AC1/AC4).
    throw new Error('pico_action_effect_not_consented');
  }

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
      { value: argument.value, originClass: argument.originClass },
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
    instance: input.instance,
    reachesOutside: input.reachesOutside,
    reachPermitted: input.reachPermitted,
    recentDecisions: Object.freeze([]),
  });

  const missing = picoRulesMissingInput({
    request: rulesInput,
    argumentNames: request.arguments.map((argument) => argument.name),
    // The consent record is the person's decision about this effect.
    hasRuleForEffect: true,
    instanceAttached: input.instance === null ? true : false,
    domainResolved: true,
  });
  const floor = picoRulesFloorOutcome(missing);

  // ADR 0138: an allow never creates reach. A precondition, not an input a
  // rule can outvote.
  const reachRefused = input.reachesOutside && !input.reachPermitted;

  const decision: PicoRulesDecisionValue = floor !== null || reachRefused
    ? 'deny'
    : (consented.risk === 'read_only' || consented.risk === 'local_write'
      ? 'allow'
      : 'require_approval');

  const reasons = floor?.reasons ?? Object.freeze([]);
  input.emit('pico_rules.decision_created', {
    requestedEventId,
    decision,
    reason: reasons.length > 0 ? reasons.join(',') : decision,
    risk: consented.risk,
    dataSpace: input.privacyDomain,
  });

  if (decision === 'deny') {
    return Object.freeze({ requestedEventId, decision, reasons, ran: false });
  }

  if (decision === 'require_approval') {
    // ADR 0141 RN4. The question is recorded with the session it was asked
    // into and a window that expires on two clocks; nothing runs until it is
    // answered there.
    if (input.approvalWindow === undefined) {
      // Refused rather than defaulted: a window nobody chose is a standing
      // grant with a number attached.
      throw new Error('pico_action_requires_approval_window');
    }
    const pending: PicoPendingApproval = Object.freeze({
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
    return Object.freeze({ requestedEventId, decision, reasons, ran: false, pending });
  }

  const startedEventId = input.emit('action_runner.action_started', {
    requestedEventId,
    actionName: request.effectName,
    risk: consented.risk,
  });

  // ADR 0141 RN1. Executes the decided request and infers nothing; a failure
  // is recorded with the same weight as a success.
  let succeeded = true;
  let summary = 'ran';
  try {
    const run = input.effects[request.effectName];
    if (run === undefined) {
      throw new Error('unsupplied_pico_module_effect');
    }
    run(request);
  } catch (error) {
    succeeded = false;
    summary = error instanceof Error ? error.message : 'failed';
  }

  input.emit('action_runner.action_completed', {
    startedEventId,
    actionName: request.effectName,
    success: succeeded,
    summary,
  });

  return Object.freeze({ requestedEventId, decision, reasons, ran: true, succeeded });
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
  pending: PicoPendingApproval;
  effectName: string;
  presenceSessionId: string;
  approved?: boolean;
  nowMs: number;
  monotonicNowMs: number;
  anchorFloorMs?: number | null;
  request: PicoActionRequest;
  risk: string;
  effects: Readonly<Record<string, (request: PicoActionRequest) => void>>;
  emit: (type: PicoActionFactType, payload: Record<string, unknown>) => string;
}): { outcome: PicoApprovalOutcome; ran: boolean; succeeded?: boolean } {
  const resolution = resolvePicoApproval({
    pending: input.pending,
    presenceSessionId: input.presenceSessionId,
    approved: input.approved,
    nowMs: input.nowMs,
    monotonicNowMs: input.monotonicNowMs,
    anchorFloorMs: input.anchorFloorMs,
  });

  input.emit('approval.resolved', {
    approvalEventId: input.pending.requestedEventId,
    outcome: resolution.outcome,
    resolvedAt: new Date(input.nowMs).toISOString(),
  });

  if (!resolution.mayRun) {
    return { outcome: resolution.outcome, ran: false };
  }

  const startedEventId = input.emit('action_runner.action_started', {
    requestedEventId: input.pending.requestedEventId,
    actionName: input.effectName,
    risk: input.risk,
  });

  let succeeded = true;
  let summary = 'ran';
  try {
    const run = input.effects[input.effectName];
    if (run === undefined) {
      throw new Error('unsupplied_pico_module_effect');
    }
    run(input.request);
  } catch (error) {
    succeeded = false;
    summary = error instanceof Error ? error.message : 'failed';
  }

  input.emit('action_runner.action_completed', {
    startedEventId,
    actionName: input.effectName,
    success: succeeded,
    summary,
  });

  return { outcome: resolution.outcome, ran: true, succeeded };
}
