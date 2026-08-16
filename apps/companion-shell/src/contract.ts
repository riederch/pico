import type { PicoModelProviderState } from '@pico/protocol/model-provider-state';

/**
 * ADR 0113 C2/B3: the complete renderer-facing contract. It contains only
 * already-rendered presentation state. Key material, daemon paths, sockets,
 * signed records and generic IPC payloads have no representation here.
 */
export const picoCompanionIpcChannels = Object.freeze({
  getPresentation: 'pico:presentation:get',
  presentationChanged: 'pico:presentation:changed',
  requestCheck: 'pico:lifecycle:check',
  vetoRecovery: 'pico:recovery:veto',
  openRecoveryCard: 'pico:recovery-card:open',
  submitRecoveryCard: 'pico:recovery-card:submit',
  decideApproval: 'pico:approval:decide',
  beginFirstRun: 'pico:first-run:begin',
  closeWindow: 'pico:window:close',
  getModelProviders: 'pico:model-providers:get',
  decideModelProvider: 'pico:model-provider:decide',
  widenModelProvider: 'pico:model-provider:widen',
  revokeModelProvider: 'pico:model-provider:revoke',
  getAnsweredReads: 'pico:model-reads:get',
  keepAnsweredRead: 'pico:model-read:keep',
  askRecall: 'pico:recall:ask',
  getRecalls: 'pico:recalls:get',
  grantDomainRead: 'pico:domain-read-grant:issue',
  keepRecall: 'pico:recall:keep',
  getRelays: 'pico:relays:get',
  claimRelay: 'pico:relay:claim',
  createRelayAccount: 'pico:relay-account:create',
  revokeRelayAccount: 'pico:relay-account:revoke',
  forgetRelay: 'pico:relay:forget',
});

export type PicoCompanionPresentationKind =
  | 'starting'
  | 'first_run'
  | 'idle'
  | 'pending_recovery'
  | 'recovery_waiting'
  | 'recovery_completed'
  | 'recovery_completion_blocked'
  | 'recovery_card_setup'
  | 'secure_input'
  | 'approval'
  | 'recovery_card_printed'
  | 'host_keys_rotated'
  | 'host_continuity_unverified'
  | 'clock_divergence'
  /**
   * ADR 0118 O1. Something the person asked to be reminded of is due. A
   * `kind` rather than a condition: the conditions list says what is *absent*,
   * and a waiting appointment is the opposite - something present that needs
   * them.
   */
  | 'time_bound_entry_due'
  | 'service_error';

export type PicoCompanionPresentationSeverity = 'active' | 'warning' | 'blocked';

/**
 * ADR 0118 O4 and ADR 0119 Q5. Stated conditions, carried beside `kind` rather
 * than folded into it.
 *
 * ADR 0009 offered one avatar state, "offline or degraded", for facts the
 * person needs to tell apart: "I cannot send this" is not "I cannot have this
 * summarised", and neither is "I am running out of room". Different decisions
 * follow from each, and any of them may hold while the others do not - so this
 * is a list, and a shape that cannot collapse them back into one.
 */
export const picoCompanionConditionKinds = [
  'no_network',
  'no_model',
  'storage_reserved',
  'storage_exhausted',
] as const;

export type PicoCompanionConditionKind = typeof picoCompanionConditionKinds[number];

/**
 * ADR 0113 C2. The protocol's provider states, declared here because this file
 * loads in the renderer, where a bare specifier does not resolve.
 *
 * A local copy of a closed list is exactly the drift this project keeps
 * hitting, so it is bound to the protocol by a test rather than by intent -
 * the same arrangement `browser:check` names as the remedy.
 */
/**
 * ADR 0151 PV4. What a device calls the credential it hands over.
 *
 * A person types a secret, not a name. The seal is keyed by entry and resident
 * already, so the reference carries no information a person could supply and
 * asking for one would be asking them to invent a label for a thing they
 * cannot see.
 */
export const picoCompanionModelProviderCredentialRef = 'provider_credential';

export const picoCompanionModelProviderStates = [
  'not_used_yet',
  'working',
  'answered',
  'did_not_answer',
  'different_model',
] as const;

export interface PicoCompanionCondition {
  kind: PicoCompanionConditionKind;
  /** What the person can do about it. Short, and never a mystery refusal. */
  remedy: string;
}

/**
 * ADR 0118's five floor families, declared here rather than imported.
 *
 * This file is renderer-reachable and the renderer loads plain ES modules with
 * no bundler, so a bare specifier like `@pico/protocol` would simply fail to
 * resolve at runtime. A test binds this list to the protocol's own, which is
 * what keeps a local copy from drifting into a second source of truth.
 */
export const picoCompanionFloorFamilies = [
  'capture',
  'time_bound_entry',
  'local_recall',
  'decide',
  'recovery_access',
  // ADR 0129. Remembering a place, and answering from it - the family whose
  // question is asked in exactly the place the network is not.
  'spatial_recall',
] as const;

/**
 * ADR 0118 O4, the load-bearing half: no condition renders a floor operation
 * as blocked. An avatar that reports itself broken while capture works teaches
 * the person that Pico is unreliable offline, which is the opposite of what the
 * contract buys - so whenever a condition is shown, what still works is shown
 * with it, derived from the list rather than written out by hand.
 */
export function picoCompanionFloorAssurance(): string {
  return `Still working: ${picoCompanionFloorFamilies.join(', ').replace(/_/gu, ' ')}.`;
}
export type PicoCompanionPresentationDecision =
  | 'none'
  | 'veto_recovery'
  | 'recovery_card_details'
  | 'approve_or_deny'
  | 'begin_first_run';

/**
 * How the Recovery Card reaches Electron Main. Both sources deliver into the
 * main process only - the camera through an external decoder, the scanner and
 * the typed fallback through main-process keystroke capture - so the renderer
 * chooses the source and never sees the result.
 */
export const picoCompanionFirstRunScanSources = ['camera', 'typed'] as const;

export type PicoCompanionFirstRunScanSource =
  typeof picoCompanionFirstRunScanSources[number];

export interface PicoCompanionRecoveryCardSetupInput {
  picoName: string;
  homeNameOrId: string;
  homeId: string;
  form: 'paper' | 'card_printer';
}

export interface PicoCompanionPresentation {
  kind: PicoCompanionPresentationKind;
  severity: PicoCompanionPresentationSeverity;
  symbol: '●' | '!' | '×';
  decision: PicoCompanionPresentationDecision;
  title: string;
  body: string;
  /**
   * Independent of `kind`: several may hold at once, and none of them changes
   * what the floor can do.
   */
  conditions: readonly PicoCompanionCondition[];
  observedAt: string;
}

const kinds = new Set<PicoCompanionPresentationKind>([
  'starting',
  'first_run',
  'idle',
  'pending_recovery',
  'recovery_waiting',
  'recovery_completed',
  'recovery_completion_blocked',
  'recovery_card_setup',
  'secure_input',
  'approval',
  'recovery_card_printed',
  'host_keys_rotated',
  'host_continuity_unverified',
  'clock_divergence',
  'time_bound_entry_due',
  'service_error',
]);
const severities = new Set<PicoCompanionPresentationSeverity>([
  'active',
  'warning',
  'blocked',
]);
const symbols = new Set<PicoCompanionPresentation['symbol']>(['●', '!', '×']);
const decisions = new Set<PicoCompanionPresentationDecision>([
  'none',
  'veto_recovery',
  'recovery_card_details',
  'approve_or_deny',
  'begin_first_run',
]);

/**
 * ADR 0118 O4 and ADR 0119 Q5. Turns the facts a host can observe into stated
 * conditions, so the wording of a remedy lives in one place instead of being
 * re-invented at each producer.
 *
 * `online` is `undefined` when nothing observed it, and that is deliberately
 * not the same as offline: claiming "no network" because nobody looked would
 * teach the person to distrust the indicator. Same for the storage state.
 *
 * The remedies are what the person can actually do, not restatements of the
 * problem. ADR 0119 Q5's `reserved` is the one that matters most - the person
 * is told while there is still room to act, which is what makes ADR 0118's
 * capture floor honest under exhaustion.
 */
export function picoCompanionConditionsFor(input: {
  online?: boolean;
  modelReachable?: boolean;
  storage?: 'normal' | 'reserved' | 'exhausted';
}): readonly PicoCompanionCondition[] {
  const conditions: PicoCompanionCondition[] = [];
  if (input.online === false) {
    conditions.push({
      kind: 'no_network',
      remedy: 'Already approved sends wait for a route. Nothing else is affected.',
    });
  }
  if (input.modelReachable === false) {
    conditions.push({
      kind: 'no_model',
      remedy: 'Summaries and suggestions wait. Capture, entry, recall and decide do not.',
    });
  }
  if (input.storage === 'reserved') {
    conditions.push({
      kind: 'storage_reserved',
      remedy: 'Export, migrate or shred a domain to make room, or provision more space.',
    });
  } else if (input.storage === 'exhausted') {
    conditions.push({
      kind: 'storage_exhausted',
      remedy: 'Free space now. Removing data still works; adding it does not.',
    });
  }
  return Object.freeze(conditions);
}

/**
 * What a builder supplies. `conditions` is optional here and always present on
 * the parsed result, so a construction site that has none writes nothing and a
 * consumer never has to tell absent from empty.
 */
export type PicoCompanionPresentationInput =
  Omit<PicoCompanionPresentation, 'conditions'>
  & { conditions?: readonly PicoCompanionCondition[] };

export function parsePicoCompanionPresentation(value: unknown): PicoCompanionPresentation {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('invalid_companion_presentation');
  }
  const record = value as Record<string, unknown>;
  const expected = new Set([
    'kind',
    'severity',
    'symbol',
    'decision',
    'title',
    'body',
    'observedAt',
  ]);
  // `conditions` is accepted but not required, so every existing construction
  // site stays valid and simply carries none. The parsed result always has the
  // array, so a consumer never has to distinguish absent from empty.
  if (Object.keys(record).some((key) => key !== 'conditions' && !expected.has(key))
    || [...expected].some((key) => !(key in record))) {
    throw new Error('invalid_companion_presentation_shape');
  }
  if (!kinds.has(record.kind as PicoCompanionPresentationKind)
    || !severities.has(record.severity as PicoCompanionPresentationSeverity)
    || !symbols.has(record.symbol as PicoCompanionPresentation['symbol'])
    || !decisions.has(record.decision as PicoCompanionPresentationDecision)) {
    throw new Error('invalid_companion_presentation_state');
  }
  assertDecisionKind(
    record.kind as PicoCompanionPresentationKind,
    record.decision as PicoCompanionPresentationDecision,
  );
  assertDisplayText(record.title, 160);
  assertDisplayText(record.body, 4_000);
  if (typeof record.observedAt !== 'string'
    || !Number.isFinite(Date.parse(record.observedAt))) {
    throw new Error('invalid_companion_presentation_time');
  }
  const conditions = parseConditions(record.conditions);
  return Object.freeze({
    ...record,
    conditions,
  }) as unknown as PicoCompanionPresentation;
}

const conditionKinds = new Set<PicoCompanionConditionKind>(picoCompanionConditionKinds);

function parseConditions(value: unknown): readonly PicoCompanionCondition[] {
  if (value === undefined) {
    return Object.freeze([]);
  }
  if (!Array.isArray(value) || value.length > picoCompanionConditionKinds.length) {
    throw new Error('invalid_companion_presentation_conditions');
  }
  const seen = new Set<PicoCompanionConditionKind>();
  const parsed: PicoCompanionCondition[] = [];
  for (const entry of value as unknown[]) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error('invalid_companion_presentation_conditions');
    }
    const record = entry as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    if (keys.length !== 2 || keys[0] !== 'kind' || keys[1] !== 'remedy') {
      throw new Error('invalid_companion_presentation_conditions');
    }
    const kind = record.kind as PicoCompanionConditionKind;
    if (!conditionKinds.has(kind)) {
      throw new Error('invalid_companion_presentation_conditions');
    }
    if (seen.has(kind)) {
      // Two rows saying the same thing is a display nobody declared, and
      // "show them both" is a decision this contract did not make.
      throw new Error('duplicate_companion_presentation_condition');
    }
    seen.add(kind);
    assertDisplayText(record.remedy, 200);
    parsed.push(Object.freeze({ kind, remedy: record.remedy as string }));
  }
  if (seen.has('storage_reserved') && seen.has('storage_exhausted')) {
    // ADR 0119 Q5's states are a ladder, not a set. Showing both would leave
    // the person to work out which one is true.
    throw new Error('conflicting_companion_presentation_condition');
  }
  return Object.freeze(parsed);
}

function assertDecisionKind(
  kind: PicoCompanionPresentationKind,
  decision: PicoCompanionPresentationDecision,
): void {
  const expectedKind = decision === 'veto_recovery'
    ? 'pending_recovery'
    : decision === 'recovery_card_details'
      ? 'recovery_card_setup'
      : decision === 'approve_or_deny'
        ? 'approval'
        : decision === 'begin_first_run'
          ? 'first_run'
          : undefined;
  if (expectedKind !== undefined && kind !== expectedKind) {
    throw new Error('invalid_companion_presentation_decision_binding');
  }
}

export function picoCompanionIdlePresentation(now = new Date()): PicoCompanionPresentation {
  return parsePicoCompanionPresentation({
    kind: 'idle',
    severity: 'active',
    symbol: '●',
    decision: 'none',
    title: 'Pico is watching your Home',
    body: 'No pending device recovery was found on the last authenticated check.',
    observedAt: now.toISOString(),
  });
}

export function parsePicoCompanionRecoveryCardSetupInput(
  value: unknown,
): PicoCompanionRecoveryCardSetupInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('invalid_recovery_card_setup');
  }
  const record = value as Record<string, unknown>;
  const expected = new Set(['picoName', 'homeNameOrId', 'homeId', 'form']);
  if (
    Object.keys(record).some((key) => !expected.has(key))
    || [...expected].some((key) => !(key in record))
  ) {
    throw new Error('invalid_recovery_card_setup_shape');
  }
  assertDisplayText(record.picoName, 256);
  assertDisplayText(record.homeNameOrId, 256);
  if (
    typeof record.homeId !== 'string'
    || !/^[A-Za-z0-9._:/+-]{1,1024}$/u.test(record.homeId)
  ) {
    throw new Error('invalid_recovery_card_home_id');
  }
  if (record.form !== 'paper' && record.form !== 'card_printer') {
    throw new Error('invalid_recovery_card_print_form');
  }
  return Object.freeze({ ...record }) as unknown as PicoCompanionRecoveryCardSetupInput;
}

export function parsePicoCompanionFirstRunScanSource(
  value: unknown,
): PicoCompanionFirstRunScanSource {
  if (typeof value !== 'string'
    || !picoCompanionFirstRunScanSources.includes(
      value as PicoCompanionFirstRunScanSource,
    )) {
    throw new Error('invalid_first_run_scan_source');
  }
  return value as PicoCompanionFirstRunScanSource;
}

function assertDisplayText(value: unknown, maximum: number): void {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum) {
    throw new Error('invalid_companion_presentation_text');
  }
}

/**
 * ADR 0152 on the person's own device.
 *
 * The shape is the ADR 0107 `home.model.providers.read` reply, which carries
 * no throughput figure and no digest: those are the layer behind, and the
 * layer behind lives where the measurement does. What arrives here is what a
 * person decides with.
 */
export interface PicoCompanionModelProvider {
  entryId: string;
  model: string;
  /**
   * ADR 0048 with ADR 0152 SE2. What the finding says this machine is.
   *
   * Carried because the decision restates it: a person confirming where their
   * words may go is confirming *this*, and a device that sent a class it made
   * up would be declaring on their behalf.
   */
  providerClass: string;
  contextTokens: number;
  measuredAt: string;
  decided: boolean;
  sees: string;
  needsCredentialToSeeMore: boolean;
  /**
   * ADR 0152 SE5. What it last did, derived by the Home from settled jobs.
   *
   * Optional because a Home built before this answered without it, and a
   * device that refused the whole list over a missing word would turn an older
   * Home into a broken one (ADR 0118 O4).
   */
  state?: PicoModelProviderState;
}

/**
 * ADR 0152 SE1, as the one place the words are chosen.
 *
 * **The sentences are computed here rather than in the DOM**, for the reason
 * SE1 exists: a summary that reads well and hides a condition is the failure
 * mode, and a rule about wording only holds if something can be held to it.
 * The renderer prints these strings with `textContent` and decides nothing.
 *
 * Three states and never two. A provider nobody decided about is not "off" -
 * off is a decision somebody made. Saying so is ADR 0138's posture in a
 * sentence: reaching outside is off until somebody says so, and the person
 * should be able to tell the difference between not yet asked and answered no.
 */
export interface PicoCompanionModelProviderLine {
  entryId: string;
  headline: string;
  detail: string;
  /** What the person can do next, which is never more than one thing. */
  action: 'decide' | 'widen' | 'revoke';
  /**
   * ADR 0152 SE2. The words on the button, chosen here like every other word.
   *
   * A control labelled from the renderer would be the one sentence in this
   * surface that no test could hold to anything - and it is the sentence a
   * person actually acts on.
   */
  actionLabel: string;
  /**
   * ADR 0048. The declaration the person is confirming, carried so the device
   * never invents one.
   */
  providerClass: string;
}

/**
 * ADR 0152 SE5. What a state adds to the line a person is reading.
 *
 * **Working and gone are different absences and get different sentences**:
 * one ends by itself and the other needs somebody. A changed model is neither
 * - it is a sentence about a decision to re-pin, never a warning to wave away.
 *
 * `not_used_yet` and `answered` add nothing, and that is deliberate: a note on
 * a machine that is doing its job is noise, and noise is what makes the two
 * sentences above stop being read.
 */
function picoCompanionModelStateDetail(
  state: PicoModelProviderState | undefined,
): string | undefined {
  switch (state) {
    case 'working':
      return 'It is answering something now. The first answer after a quiet '
        + 'spell takes longer, because the model has to be loaded first.';
    case 'did_not_answer':
      return 'It did not answer the last thing Pico sent. Summaries and '
        + 'suggestions wait; everything you do yourself is unaffected.';
    case 'different_model':
      return 'It is serving a different model than the one that was measured. '
        + 'Pico sends nothing there until somebody measures it again - the '
        + 'numbers this decision was made on were measured against the old one.';
    default:
      return undefined;
  }
}

export function picoCompanionModelProviderLines(
  providers: readonly PicoCompanionModelProvider[],
): readonly PicoCompanionModelProviderLine[] {
  return Object.freeze(providers.map((provider) => {
    const stateDetail = picoCompanionModelStateDetail(provider.state);
    if (!provider.decided) {
      return Object.freeze({
        entryId: provider.entryId,
        headline: `${provider.model} is available and you have not decided about it`,
        // Not "it is off". Off is an answer, and nobody gave one.
        detail: 'Pico will not send anything here until you say so.',
        action: 'decide' as const,
        // The consequence, not the mechanism: what the person is agreeing to
        // is what this machine will see.
        actionLabel: 'Let it see this conversation',
        providerClass: provider.providerClass,
      });
    }
    if (provider.needsCredentialToSeeMore) {
      return Object.freeze({
        entryId: provider.entryId,
        headline: `${provider.model} sees this conversation`,
        // ADR 0151's quiet outcome, said where the choice is rather than in a
        // help page: a person who never adds a credential gets a Pico whose
        // model never sees their memory, and nothing else will tell them.
        detail: 'It does not see what Pico remembers. That needs a way for this '
          + 'machine to prove who it is.'
          + (stateDetail === undefined ? '' : ` ${stateDetail}`),
        action: 'widen' as const,
        actionLabel: 'Add a credential and let it see what Pico remembers',
        providerClass: provider.providerClass,
      });
    }
    return Object.freeze({
      entryId: provider.entryId,
      headline: `${provider.model} sees this conversation and what Pico remembers`,
      detail: `You can withdraw this at any time.${
        stateDetail === undefined ? '' : ` ${stateDetail}`
      }`,
      action: 'revoke' as const,
      actionLabel: 'Withdraw',
      providerClass: provider.providerClass,
    });
  }));
}

export function parsePicoCompanionModelProviders(
  value: unknown,
): readonly PicoCompanionModelProvider[] {
  if (!Array.isArray(value)) {
    throw new Error('invalid_pico_companion_model_providers');
  }
  return Object.freeze(value.map((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error('invalid_pico_companion_model_provider');
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.entryId !== 'string'
      || typeof record.model !== 'string'
      || typeof record.providerClass !== 'string'
      || typeof record.contextTokens !== 'number'
      || typeof record.measuredAt !== 'string'
      || typeof record.decided !== 'boolean'
      || typeof record.sees !== 'string'
      || typeof record.needsCredentialToSeeMore !== 'boolean') {
      throw new Error('invalid_pico_companion_model_provider');
    }
    // A word this device does not know is dropped rather than believed: it
    // would be rendered as a state, and an unknown state rendered is a
    // sentence nobody wrote.
    const state = (picoCompanionModelProviderStates as readonly string[])
      .includes(record.state as string)
      ? record.state as PicoModelProviderState
      : undefined;
    return Object.freeze({
      entryId: record.entryId,
      model: record.model,
      providerClass: record.providerClass,
      contextTokens: record.contextTokens,
      measuredAt: record.measuredAt,
      decided: record.decided,
      sees: record.sees,
      needsCredentialToSeeMore: record.needsCredentialToSeeMore,
      ...(state === undefined ? {} : { state }),
    });
  }));
}

/**
 * ADR 0116 W1 on the device. A question this person asked, and its state.
 *
 * Four states and never fewer: waiting, answered from something, answered from
 * nothing, and did not answer. The middle two are the pair a single "answered"
 * would collapse - and "I have nothing about that" is the more useful of the
 * two, because it is the one that tells a person to look somewhere else.
 */
export interface PicoCompanionRecall {
  jobId: string;
  question: string;
  askedAt: string;
  settledAt?: string;
  outcome?: string;
  answer?: string;
  foundInMemory?: boolean;
}

export interface PicoCompanionRecallLine {
  jobId: string;
  question: string;
  /** What state this question is in, as a sentence. */
  state: string;
  /** ADR 0116 W5. Present only when there is an answer to keep. */
  keepable?: true;
  /**
   * ADR 0117 X5. The answer, and never without its label.
   *
   * A model's words about a person's material are not something Pico knows.
   * The label is produced by the same call that produces the answer, because
   * a labelling step somebody must remember is one somebody will forget - and
   * here forgetting it would let a sentence a model composed read as a fact
   * this Home holds.
   */
  answer?: { label: string; text: string };
}

export function picoCompanionRecallLines(
  recalls: readonly PicoCompanionRecall[],
): readonly PicoCompanionRecallLine[] {
  return Object.freeze(recalls.map((recall) => {
    if (recall.settledAt === undefined) {
      return Object.freeze({
        jobId: recall.jobId,
        question: recall.question,
        // Not "failed" and not "nothing found": nobody has looked yet.
        state: 'Waiting for the provider you decided on.',
      });
    }
    if (recall.outcome !== 'answered') {
      return Object.freeze({
        jobId: recall.jobId,
        question: recall.question,
        // ADR 0118 O4. What still works is part of what happened: this is one
        // question that did not get answered, not a Home that stopped.
        state: 'Your provider did not answer this one. Nothing else is affected, '
          + 'and asking again is free.',
      });
    }
    if (recall.foundInMemory === false) {
      return Object.freeze({
        jobId: recall.jobId,
        question: recall.question,
        // The honest empty answer, and the one worth having: it sends a person
        // to look elsewhere instead of reading a confident sentence about
        // nothing.
        state: 'Nothing in what it read answers that.',
      });
    }
    return Object.freeze({
      jobId: recall.jobId,
      question: recall.question,
      state: 'Answered from what you remember.',
      ...(recall.answer === undefined ? {} : { keepable: true as const }),
      ...(recall.answer === undefined ? {} : {
        answer: Object.freeze({
          label: 'A model wrote this from your own notes. Pico did not check it.',
          text: recall.answer,
        }),
      }),
    });
  }));
}

export function parsePicoCompanionRecalls(value: unknown): readonly PicoCompanionRecall[] {
  if (!Array.isArray(value)) {
    throw new Error('invalid_pico_companion_recalls');
  }
  return Object.freeze(value.map((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error('invalid_pico_companion_recall');
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.jobId !== 'string'
      || typeof record.question !== 'string'
      || typeof record.askedAt !== 'string') {
      throw new Error('invalid_pico_companion_recall');
    }
    return Object.freeze({
      jobId: record.jobId,
      question: record.question,
      askedAt: record.askedAt,
      ...(typeof record.settledAt === 'string' ? { settledAt: record.settledAt } : {}),
      ...(typeof record.outcome === 'string' ? { outcome: record.outcome } : {}),
      ...(typeof record.answer === 'string' ? { answer: record.answer } : {}),
      ...(typeof record.foundInMemory === 'boolean'
        ? { foundInMemory: record.foundInMemory }
        : {}),
    });
  }));
}

/**
 * ADR 0116 W5 on the device. What a read produced, and nobody has kept.
 *
 * **No values travel to this window.** A list that carried the derived output
 * would be the auto-persist W5 forbids, moved out of a database and into a
 * screen - the answer arrives when the person keeps it, and not before. What
 * a device shows is that something is waiting, from which library, and at
 * which revision.
 */
export interface PicoCompanionAnsweredRead {
  jobId: string;
  supplier: string;
  revision: string;
  answeredAt: string;
}

/**
 * ADR 0152 SE1's rule applied to a second surface: the words are chosen here
 * so something can be held to them.
 *
 * **Nothing here says what was found.** A headline that summarised the answer
 * would be the answer, shown - and the whole point of the keep is that the
 * person decides before the derived output goes anywhere it stays.
 */
export function picoCompanionAnsweredReadLines(
  reads: readonly PicoCompanionAnsweredRead[],
): readonly { jobId: string; headline: string; detail: string }[] {
  return Object.freeze(reads.map((read) => Object.freeze({
    jobId: read.jobId,
    headline: `Pico read something from ${read.supplier}`,
    // The revision is the correction point (ADR 0133): if the answer turns out
    // wrong, this is what says which version of the material it was wrong
    // about.
    detail: `Read at ${read.revision}. Keep it to put it in your memory, `
      + 'or leave it and nothing is stored.',
  })));
}

export function parsePicoCompanionAnsweredReads(
  value: unknown,
): readonly PicoCompanionAnsweredRead[] {
  if (!Array.isArray(value)) {
    throw new Error('invalid_pico_companion_answered_reads');
  }
  return Object.freeze(value.map((entry) => {
    const record = entry as Record<string, unknown> | null;
    if (record === null
      || typeof record.jobId !== 'string'
      || typeof record.supplier !== 'string'
      || typeof record.revision !== 'string'
      || typeof record.answeredAt !== 'string') {
      throw new Error('invalid_pico_companion_answered_read');
    }
    // A value that arrived anyway is dropped rather than rendered: this window
    // has no place for one, and a field nobody declared is a field nobody
    // checked.
    return Object.freeze({
      jobId: record.jobId,
      supplier: record.supplier,
      revision: record.revision,
      answeredAt: record.answeredAt,
    });
  }));
}

/**
 * ADR 0154 - the words for a relay this person operates.
 *
 * **A different hat, and the surface says so.** Everywhere else in this window
 * the person is somebody with a Pico; here they are somebody who runs a
 * machine other people's Picos post through. Blurring the two would be the
 * naming failure ADR 0026 exists to prevent, one screen further in.
 */
export interface PicoCompanionRelay {
  baseUrl: string;
  operator: string;
  claimedAt: string;
  accounts?: readonly {
    accountRef: string;
    status: 'active' | 'revoked';
    mailboxQuota: number;
    maxCapacity: number;
    openMailboxes: number;
  }[];
}

export interface PicoCompanionRelayLine {
  baseUrl: string;
  headline: string;
  detail: string;
  actionLabel: string;
  accounts: readonly {
    accountRef: string;
    headline: string;
    detail: string;
    revokable: boolean;
  }[];
}

/**
 * What arrives over IPC is untrusted until it has a shape, exactly as
 * everything else on this channel is. A relay's hostname comes from the relay,
 * which makes it a stranger's string.
 */
export function parsePicoCompanionRelays(value: unknown): readonly PicoCompanionRelay[] {
  if (!Array.isArray(value)) {
    throw new Error('invalid_pico_companion_relays');
  }
  return Object.freeze(value.map((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error('invalid_pico_companion_relay');
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.baseUrl !== 'string'
      || typeof record.operator !== 'string'
      || typeof record.claimedAt !== 'string') {
      throw new Error('invalid_pico_companion_relay');
    }
    const accounts = Array.isArray(record.accounts)
      ? Object.freeze(record.accounts.map((account) => {
        const row = account as Record<string, unknown>;
        if (typeof row?.accountRef !== 'string'
          || (row.status !== 'active' && row.status !== 'revoked')
          || typeof row.mailboxQuota !== 'number'
          || typeof row.maxCapacity !== 'number'
          || typeof row.openMailboxes !== 'number') {
          throw new Error('invalid_pico_companion_relay_account');
        }
        return Object.freeze({
          accountRef: row.accountRef,
          status: row.status,
          mailboxQuota: row.mailboxQuota,
          maxCapacity: row.maxCapacity,
          openMailboxes: row.openMailboxes,
        });
      }))
      : undefined;
    return Object.freeze({
      baseUrl: record.baseUrl,
      operator: record.operator,
      claimedAt: record.claimedAt,
      // Absent and empty are different: a relay whose accounts could not be
      // read is not a relay with no accounts (ADR 0117 X1's construction).
      ...(accounts === undefined ? {} : { accounts }),
    });
  }));
}

export function picoCompanionRelayLines(
  relays: readonly PicoCompanionRelay[],
): readonly PicoCompanionRelayLine[] {
  return Object.freeze(relays.map((relay) => {
    const accounts = relay.accounts ?? [];
    const active = accounts.filter((account) => account.status === 'active').length;
    return Object.freeze({
      baseUrl: relay.baseUrl,
      headline: `You run the relay at ${relay.operator}`,
      detail: active === 0
        // Not "it is broken". An unprovisioned relay is running correctly and
        // refusing everybody, and those are different sentences.
        ? 'Nobody can post through it yet. Give somebody an access key to let '
          + 'their Pico use it.'
        : `${active === 1 ? 'One device can' : `${active} devices can`} post `
          + 'through it. It never sees what they send.',
      actionLabel: 'Give somebody access',
      accounts: Object.freeze(accounts.map((account) => Object.freeze({
        accountRef: account.accountRef,
        headline: account.status === 'active'
          ? `Access key ${account.accountRef}`
          : `Access key ${account.accountRef}, withdrawn`,
        detail: account.status === 'active'
          ? `${account.openMailboxes} of ${account.mailboxQuota} `
            + `${account.mailboxQuota === 1 ? 'address' : 'addresses'} in use, `
            + `up to ${account.maxCapacity} waiting messages each.`
          // ADR 0154 RO5. The row stays so this sentence can exist: "was
          // withdrawn" and "never existed" are different things to be told.
          : 'This key no longer works. Whoever held it needs a new one.',
        revokable: account.status === 'active',
      }))),
    });
  }));
}

/**
 * ADR 0154 RO3. The one moment an access key exists outside the relay.
 *
 * Written as its own presentation rather than a line in a list, because it is
 * the only thing in this surface a person has to act on *now* - nothing stores
 * it and no screen can show it again.
 */
export function picoCompanionRelayAccountIssued(credential: string): {
  headline: string;
  detail: string;
  credential: string;
} {
  return Object.freeze({
    headline: 'Give this key to the person whose Pico will use the relay',
    detail: 'It is shown once. Nothing keeps a copy - not this device and not '
      + 'the relay - so if it is lost, withdraw the key and make another.',
    credential,
  });
}
