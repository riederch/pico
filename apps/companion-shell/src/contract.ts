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
  /** ADR 0142 PE2. Point the Home at a host, and watch it be timed. */
  askModelProviderMeasurement: 'pico:model-provider-measurement:ask',
  getModelProviderMeasurements: 'pico:model-provider-measurements:get',
  decideModelProvider: 'pico:model-provider:decide',
  widenModelProvider: 'pico:model-provider:widen',
  revokeModelProvider: 'pico:model-provider:revoke',
  getAnsweredReads: 'pico:model-reads:get',
  keepAnsweredRead: 'pico:model-read:keep',
  askRecall: 'pico:recall:ask',
  getRecalls: 'pico:recalls:get',
  grantDomainRead: 'pico:domain-read-grant:issue',
  keepRecall: 'pico:recall:keep',
  /** ADR 0071. One memory item, unmade by the person who made it. */
  forgetMemory: 'pico:memory:forget',
  getSuppliers: 'pico:suppliers:get',
  decideSupplierReach: 'pico:supplier-reach:decide',
  /** ADR 0137 IN5. The one field a depot may not supply, from the person. */
  attachSupplier: 'pico:supplier:attach',
  detachSupplier: 'pico:supplier:detach',
  detachDepot: 'pico:depot:detach',
  forgetModelProvider: 'pico:model-provider:forget',
  getDepots: 'pico:depots:get',
  attachDepot: 'pico:depot:attach',
  decideDepotReach: 'pico:depot-reach:decide',
  fetchDepotsNow: 'pico:depot-fetch:ask',
  /**
   * ADR 0141 RN4, and deliberately not `decideApproval` above.
   *
   * That one answers the Vault about a signature this device is being asked to
   * make; this one answers the *Home* about an action it is holding against a
   * presence session. Sharing a channel would put two different questions with
   * two different clocks and two different answerers behind one name.
   */
  getPendingActions: 'pico:pending-actions:get',
  resolvePendingAction: 'pico:pending-action:resolve',
  /** ADR 0139 AC4. What the parts of Pico may do, agreed to one at a time. */
  getModuleConsent: 'pico:module-consent:get',
  recordModuleConsent: 'pico:module-consent:record',
  getDevices: 'pico:devices:get',
  switchDevice: 'pico:device:switch',
  forgetDevice: 'pico:device:forget',
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
   * ADR 0142 PE1. A machine they no longer have, forgotten.
   *
   * **Beside `action` rather than inside it**, and the two rules do not
   * disagree: `action` is the decision axis - what this machine may see - and
   * offering two of those at once is what asks a person to work out which
   * applies. This is the other axis, and it ends the thing the decision is
   * about. `Forget` rather than `Remove` because there is nothing on disk to
   * remove; what goes is a measurement and every answer given about it.
   */
  forgetActionLabel: string;
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
        forgetActionLabel: 'Forget this machine',
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
        forgetActionLabel: 'Forget this machine',
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
      forgetActionLabel: 'Forget this machine',
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
  keptAs?: { memoryItemId: string; privacyDomain: string };
}

export interface PicoCompanionRecallLine {
  jobId: string;
  question: string;
  /** What state this question is in, as a sentence. */
  state: string;
  /** ADR 0116 W5. Present only when there is an answer to keep. */
  keepable?: true;
  /**
   * ADR 0071. Present only when there is a memory to take back.
   *
   * **Never beside `keepable`**, and that is the whole shape: an answer is
   * either kept or not, so a line offers exactly one of the two. Two controls
   * on one line would ask a person to work out which of them applies to the
   * state they are looking at.
   */
  forgettable?: { memoryItemId: string; label: string };
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
      state: recall.keptAs === undefined
        ? 'Answered from what you remember.'
        // Said as what is true now rather than as what happened: the sentence
        // is in their memory, which is the thing the control below undoes.
        : 'Answered from what you remember, and kept.',
      ...(recall.answer === undefined || recall.keptAs !== undefined
        ? {}
        : { keepable: true as const }),
      ...(recall.keptAs === undefined ? {} : {
        forgettable: Object.freeze({
          memoryItemId: recall.keptAs.memoryItemId,
          // Never *delete*: what goes is one sentence out of their memory, and
          // the word for that is the one a person would use about a memory.
          label: 'Forget this',
        }),
      }),
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
      ...(((): Record<string, unknown> => {
        const kept = record.keptAs as Record<string, unknown> | undefined;
        // Both halves or neither: a memory item without its domain is not
        // something this window can offer to take back.
        return typeof kept?.memoryItemId === 'string' && typeof kept.privacyDomain === 'string'
          ? {
            keptAs: Object.freeze({
              memoryItemId: kept.memoryItemId,
              privacyDomain: kept.privacyDomain,
            }),
          }
          : {};
      })()),
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
 * ADR 0154 RO5. What withdrawing a key cost, in the words a person reads.
 *
 * Revoking is the one destructive act on this surface, and the mail it drops
 * has no reader left to notice it - the account that could have collected is
 * the account that just stopped existing. So the numbers are said plainly
 * rather than folded into "done".
 */
export function picoCompanionRelayRevocationLine(ended: {
  mailboxesEnded: number;
  packetsDropped: number;
}): string {
  if (ended.mailboxesEnded === 0) {
    return 'That key no longer works. It held no addresses.';
  }
  const addresses = ended.mailboxesEnded === 1
    ? 'one address'
    : `${ended.mailboxesEnded} addresses`;
  if (ended.packetsDropped === 0) {
    return `That key no longer works, and ${addresses} ended with it. `
      + 'Nothing was waiting at them.';
  }
  const waiting = ended.packetsDropped === 1
    ? 'one waiting message was'
    : `${ended.packetsDropped} waiting messages were`;
  return `That key no longer works, and ${addresses} ended with it. `
    + `${waiting[0]!.toUpperCase()}${waiting.slice(1)} discarded - nobody could have `
    + 'collected them once the key stopped.';
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

/**
 * ADR 0126 P2/P6 - the person's own devices, in words.
 *
 * **This is where a machine fact becomes a sentence.** The registry holds
 * `camera`, which is exactly right for a planner and useless to a person
 * deciding whether to allow it. What a person needs to know is what would
 * happen: *this device can read a Recovery Card with its camera*. The
 * translation lives here, in one place a test can hold, rather than in a
 * renderer where each label would be somebody's improvisation.
 */
export interface PicoCompanionDevice {
  presenceId: string;
  presenceType: string;
  affordances: readonly string[];
  withheld: readonly string[];
  enabled: boolean;
  connected: boolean;
  lastSeenAt: string;
}

export interface PicoCompanionDeviceLine {
  presenceId: string;
  headline: string;
  detail: string;
  offers: readonly {
    affordance: string;
    headline: string;
    /** What pressing the control does next, in the words of the consequence. */
    actionLabel: string;
    withheld: boolean;
  }[];
  /** The whole-device switch, which is a different statement from all of them. */
  deviceActionLabel: string;
  forgetLabel: string;
}

/**
 * What a device would do with each thing it declared.
 *
 * A closed map beside a closed vocabulary, which is the drift risk this tree
 * names out loud - so `contract.test.ts` asserts every affordance in
 * `@pico/protocol` has a sentence here, and an unknown key cannot be typed.
 */
const picoCompanionAffordanceSentences: Readonly<Record<string, string>> = Object.freeze({
  display: 'show you things in a window',
  notification: 'get your attention when you are not looking',
  secure_input: 'take a passphrase without the page ever seeing it',
  camera: 'read a Recovery Card with its camera',
  microphone: 'listen with its microphone',
  printer: 'print a Recovery Card',
  location: 'tell where it is',
  composite_tier: 'draw Pico in full rather than as a still picture',
});

export function picoCompanionDeviceLines(
  devices: readonly PicoCompanionDevice[],
): readonly PicoCompanionDeviceLine[] {
  return Object.freeze(devices.map((device) => Object.freeze({
    presenceId: device.presenceId,
    headline: picoCompanionDeviceName(device.presenceType),
    detail: picoCompanionDeviceDetail(device),
    offers: Object.freeze(device.affordances.map((affordance) => {
      const withheld = device.withheld.includes(affordance);
      const sentence = picoCompanionAffordanceSentences[affordance] ?? affordance;
      return Object.freeze({
        affordance,
        headline: withheld
          // The fact stays true and the sentence says so. ADR 0126 keeps the
          // affordance and the switch apart precisely so this can be said.
          ? `It can ${sentence}, and you have told Pico not to`
          : `It can ${sentence}`,
        actionLabel: withheld ? 'Allow this again' : 'Do not use this',
        withheld,
      });
    })),
    deviceActionLabel: device.enabled ? 'Do not use this device' : 'Use this device again',
    // Said as what it costs. The device is not touched; what goes is the row
    // and every answer the person gave about it.
    forgetLabel: 'Forget this device and everything you decided about it',
  })));
}

/**
 * ADR 0126. The label a person recognises their own device by.
 *
 * The one place a presence type is read, and it produces **a word and never a
 * decision** - `presence:check` allows this file for that reason and refuses
 * every other read. A person choosing between two rows needs to know which
 * machine each one is; nothing here plans anything.
 */
function picoCompanionDeviceName(presenceType: string): string {
  switch (presenceType) {
    case 'desktop_companion':
      return 'A computer';
    case 'mobile_companion':
      return 'A phone';
    case 'surface':
      return 'A surface';
    case 'embodiment':
      return 'Something with sensors';
    default:
      // A type this window does not know is still one of the person's devices.
      // Hiding it would hide a device from its owner.
      return 'A device';
  }
}

function picoCompanionDeviceDetail(device: PicoCompanionDevice): string {
  if (!device.enabled) {
    return 'You have switched this device off. Pico uses nothing on it, whatever it '
      + 'says it can do.';
  }
  if (device.connected) {
    return 'Here now.';
  }
  /**
   * ADR 0152 SE5. Quiet and gone are different absences and get different
   * sentences: one ends by itself and the other needs somebody. A device that
   * is asleep is not a device that is lost, and the list keeps it either way.
   */
  return `Not answering right now. It was last here on ${device.lastSeenAt.slice(0, 10)}.`;
}

export function parsePicoCompanionDevices(value: unknown): readonly PicoCompanionDevice[] {
  if (!Array.isArray(value)) {
    throw new Error('invalid_pico_companion_devices');
  }
  return Object.freeze(value.map((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error('invalid_pico_companion_device');
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.presenceId !== 'string'
      || typeof record.presenceType !== 'string'
      || typeof record.lastSeenAt !== 'string'
      || typeof record.enabled !== 'boolean'
      || typeof record.connected !== 'boolean'
      || !Array.isArray(record.affordances)
      || !Array.isArray(record.withheld)) {
      throw new Error('invalid_pico_companion_device');
    }
    return Object.freeze({
      presenceId: record.presenceId,
      presenceType: record.presenceType,
      affordances: Object.freeze(record.affordances.map(String)),
      withheld: Object.freeze(record.withheld.map(String)),
      enabled: record.enabled,
      connected: record.connected,
      lastSeenAt: record.lastSeenAt,
    });
  }));
}

/**
 * ADR 0113 with ADR 0152 SE1 - what the window is showing, and why it has to
 * be a question at all.
 *
 * **ADR 0113 says a window exists only during an interaction or an active
 * alarm.** It is an occasion, not a workplace. By 2026-08-17 it had eight
 * sections, six reads on open and no navigation, in the order they happened to
 * be built - so somebody opening it because Pico needed an answer scrolled
 * past relay administration to give one.
 *
 * Two views, and the split is the ADR's own: what needs you now, and what you
 * keep. The window never opens into the second. Settings are somewhere a
 * person goes; an occasion is something that came to them.
 */
/**
 * ADR 0142 PE2 with ADR 0152 - a measurement, said as work rather than a number.
 *
 * **What a person needs while it runs is that it is running and roughly how
 * long that is.** Measuring generates long answers at several context widths,
 * unloads the model to time a load, and runs two jobs at once - minutes on a
 * real card - and a surface that showed a spinner with no explanation would
 * make a person think their Home had hung.
 *
 * The measured numbers are deliberately not here. They are the entry's, ADR
 * 0152 SE1 says the entry states its consequence in words before any figure,
 * and a second rendering of a throughput on this line would be a second place
 * for it to drift.
 */
export interface PicoCompanionMeasurementLine {
  entryId: string;
  headline: string;
  detail: string;
}

export function picoCompanionMeasurementLines(
  measurements: ReadonlyArray<{
    entryId: string;
    reach: string;
    model: string;
    state: string;
    refusal?: string;
    notes?: readonly string[];
  }>,
): readonly PicoCompanionMeasurementLine[] {
  return Object.freeze(measurements.map((entry) => {
    if (entry.state === 'running') {
      return Object.freeze({
        entryId: entry.entryId,
        headline: `Measuring ${entry.model} at ${entry.reach}.`,
        detail: 'Pico is timing this machine: how fast it answers, how wide a '
          + 'question it holds, and how long it takes to wake up. That takes '
          + 'several minutes and you do not have to wait here.',
      });
    }
    if (entry.state === 'failed') {
      return Object.freeze({
        entryId: entry.entryId,
        headline: `${entry.model} at ${entry.reach} was not measured.`,
        // The measurement's own words. ADR 0118 O4: a host that could not be
        // measured is a fact about the host, and flattening every cause into
        // "failed" would tell somebody nothing they can act on.
        detail: entry.refusal ?? 'The measurement did not finish.',
      });
    }
    return Object.freeze({
      entryId: entry.entryId,
      headline: `${entry.model} at ${entry.reach} was measured.`,
      // What the measurement wanted said, then what is left to do. Notes carry
      // things only a measurement can know - ADR 0151 PV5's "this host checks
      // no credential" among them - and they are the reason this is not just a
      // green tick.
      detail: [
        ...(entry.notes ?? []),
        'It is in the list below, and nothing uses it until you decide.',
      ].join(' '),
    });
  }));
}

export function parsePicoCompanionMeasurements(value: unknown): ReadonlyArray<{
  entryId: string;
  reach: string;
  model: string;
  state: string;
  refusal?: string;
  notes?: readonly string[];
}> {
  if (!Array.isArray(value)) {
    throw new Error('invalid_pico_companion_measurements');
  }
  return Object.freeze(value.map((entry) => {
    const record = entry as Record<string, unknown> | null;
    if (typeof record?.entryId !== 'string'
      || typeof record.reach !== 'string'
      || typeof record.model !== 'string'
      || typeof record.state !== 'string') {
      throw new Error('invalid_pico_companion_measurement');
    }
    return Object.freeze({
      entryId: record.entryId,
      reach: record.reach,
      model: record.model,
      state: record.state,
      ...(typeof record.refusal === 'string' ? { refusal: record.refusal } : {}),
      ...(Array.isArray(record.notes)
        ? { notes: Object.freeze(record.notes.map(String)) }
        : {}),
    });
  }));
}

/**
 * ADR 0048 with ADR 0152 - the sentence a person has to agree with before Pico
 * measures a machine they named.
 *
 * Pico cannot tell from an address whether a machine stands in somebody's home,
 * and the five other provider classes all describe runtimes Pico mediates. So a
 * typed address is `declared_own_host` or it is nothing, and the declaration is
 * a precondition rather than a field with options. Refusing in words beats a
 * disabled button, which invites somebody to wonder what it would have done.
 */
export const picoCompanionOwnMachineDeclaration =
  'This machine is mine, and I am responsible for what it does with what I send it.';

export const picoCompanionOwnMachineUndeclared =
  'Pico only measures a machine you say is yours. There is no other kind it '
  + 'knows how to describe: every other sort of provider is one Pico runs '
  + 'itself, not one you reach by address.';

export const picoCompanionWindowViews = ['now', 'settings'] as const;

export type PicoCompanionWindowView = typeof picoCompanionWindowViews[number];

/**
 * What each view has to ask the Home for.
 *
 * The reason the split is worth building rather than just drawing: the window
 * asked for all of it on every open, including the four lists a person looking
 * at an approval will never read. A view that shows nothing asks nothing.
 */
export const picoCompanionViewReads: Readonly<
  Record<PicoCompanionWindowView, readonly string[]>
> = Object.freeze({
  // ADR 0141 RN4's questions are here rather than in settings: they expire in
  // minutes and they are why somebody is being interrupted.
  now: Object.freeze(['getRecalls', 'getAnsweredReads', 'getPendingActions']),
  settings: Object.freeze([
    'getModelProviders', 'getSuppliers', 'getDepots', 'getDevices', 'getRelays',
    // ADR 0139 AC4's agreement is a thing somebody came to change.
    'getModuleConsent',
  ]),
});

/**
 * ADR 0112/ADR 0113. Whether this presentation takes the window back.
 *
 * A person may be halfway through changing a setting when their Vault asks
 * them to approve something. The approval is the reason this window exists at
 * all, so it wins - and the rule is a property of the presentation rather than
 * a judgement in the renderer, so it cannot differ between two places that
 * both react to one.
 *
 * **Only a decision takes the window back, not merely a bad mood.** A warning
 * about storage or a clock is worth showing and is not worth interrupting
 * somebody for; something waiting for their answer is.
 */
export function picoCompanionPresentationTakesTheWindow(
  presentation: Pick<PicoCompanionPresentation, 'decision' | 'severity'>,
): boolean {
  return presentation.decision !== 'none' || presentation.severity === 'blocked';
}

export interface PicoCompanionWindowViewLine {
  view: PicoCompanionWindowView;
  label: string;
  /** What a person will find there, so the word is not the only clue. */
  detail: string;
}

export function picoCompanionWindowViewLines(): readonly PicoCompanionWindowViewLine[] {
  return Object.freeze([
    Object.freeze({
      view: 'now' as const,
      label: 'Now',
      detail: 'What Pico needs from you, and what you asked it.',
    }),
    Object.freeze({
      view: 'settings' as const,
      label: 'Settings',
      detail: 'What computes for you, your devices, and anything you run.',
    }),
  ]);
}

/**
 * ADR 0138 CO3/CO4 - what an attached supplier may do, in words about money
 * and about who learns you asked.
 *
 * **The ADR's own sentence is the one this surface has to carry**, because it
 * is the reason the two switches are two: *an answered question that cost
 * money is visible to the person who asked, and a background sweep is visible
 * to nobody.* A single "allow this supplier" control would hide exactly that
 * difference behind the word allow.
 */
export interface PicoCompanionSupplier {
  identifier: string;
  kind: string;
  mayReachOutside: boolean;
  mayReachUnasked: boolean;
}

export interface PicoCompanionSupplierLine {
  identifier: string;
  headline: string;
  detail: string;
  reachActionLabel: string;
  /**
   * Absent while reaching is off - not a disabled control, because CO4 cannot
   * be granted without CO3 and a greyed-out switch invites somebody to wonder
   * what it would have done.
   */
  unaskedActionLabel?: string;
  unaskedDetail?: string;
  /**
   * **Everything a person added, taken back.**
   *
   * Last on the line and never a switch: the two above are settings that go
   * on being decided, while this ends the thing they are about. The word is
   * `Remove` rather than `Delete` because what goes is the attachment, and
   * what Pico derived under it stays where it is (ADR 0136 with ADR 0129 SR6).
   */
  removeActionLabel: string;
}

export function picoCompanionSupplierLines(
  suppliers: readonly PicoCompanionSupplier[],
): readonly PicoCompanionSupplierLine[] {
  const removeActionLabel = 'Remove';
  return Object.freeze(suppliers.map((supplier) => {
    if (!supplier.mayReachOutside) {
      return Object.freeze({
        identifier: supplier.identifier,
        headline: `${supplier.identifier} is attached and reaches nothing`,
        // Not "it is off". Attached says this material may be here; it does
        // not say Pico may go and get it.
        detail: 'Pico does not go out for this. Nothing it holds costs you '
          + 'anything, and nobody learns you asked.',
        reachActionLabel: 'Let Pico fetch this when you ask',
        removeActionLabel,
      });
    }
    return Object.freeze({
      identifier: supplier.identifier,
      headline: supplier.mayReachUnasked
        ? `${supplier.identifier} may fetch, and may do so on its own`
        : `${supplier.identifier} may fetch when you ask`,
      detail: 'Going out may cost money, and whoever answers learns that '
        + 'somebody asked.',
      reachActionLabel: 'Stop fetching this',
      unaskedActionLabel: supplier.mayReachUnasked
        ? 'Only when I ask'
        : 'Let it fetch without being asked',
      // ADR 0138 CO4's reason for being a second decision rather than a wider
      // first one, said where the person decides it.
      unaskedDetail: supplier.mayReachUnasked
        ? 'It fetches in the background. You will not see those trips, which is '
          + 'what makes this a separate answer from the one above.'
        : 'A question you asked and that cost something is visible to you. A '
          + 'trip nobody asked for is visible to nobody.',
      removeActionLabel,
    });
  }));
}

/**
 * ADR 0143 DP3 - a supplier a depot brought, waiting for one answer.
 *
 * **The question is where its material belongs, and that is the whole line.**
 * A depot declares what a supplier is and what it fills; the one thing it may
 * not declare is the space its material lands in, because that decides who can
 * later read it and what a deletion reaches. So the line asks exactly that and
 * nothing else, and it says which depot it came from - a person agreeing to a
 * space for somebody else's code is owed the name of whose code it is.
 */
export interface PicoCompanionDeclaredSupplierLine {
  identifier: string;
  headline: string;
  detail: string;
  domainLabel: string;
  actionLabel: string;
}

export function picoCompanionDeclaredSupplierLines(
  declared: ReadonlyArray<{
    identifier: string;
    kind: string;
    remote: string;
    needs: readonly string[];
  }>,
): readonly PicoCompanionDeclaredSupplierLine[] {
  return Object.freeze(declared.map((entry) => Object.freeze({
    identifier: entry.identifier,
    headline: `${entry.identifier} came with ${entry.remote}.`,
    detail: entry.kind === 'library'
      // Said as what it will do with the space, not as what it is. "Library"
      // is Pico's word for a shape; the person is deciding about their memory.
      ? 'It reads material and puts what it finds into your memory. '
        + 'Name the part of your memory that should hold it.'
      : `It fills a ${entry.kind} slot. Name the part of your memory it belongs to.`,
    domainLabel: 'Where its material belongs',
    // Never *enable* or *allow*: attaching says where something goes, and ADR
    // 0138 CO3 keeps whether Pico may go out for it a separate answer.
    actionLabel: entry.needs.includes('privacyDomain')
      ? 'Put it here'
      : 'Attach',
  })));
}

export function parsePicoCompanionDeclaredSuppliers(value: unknown): ReadonlyArray<{
  identifier: string;
  kind: string;
  remote: string;
  needs: readonly string[];
}> {
  if (!Array.isArray(value)) {
    throw new Error('invalid_pico_companion_declared_suppliers');
  }
  return Object.freeze(value.map((entry) => {
    const record = entry as Record<string, unknown> | null;
    if (typeof record?.identifier !== 'string'
      || typeof record.kind !== 'string'
      || typeof record.remote !== 'string'
      || !Array.isArray(record.needs)) {
      throw new Error('invalid_pico_companion_declared_supplier');
    }
    return Object.freeze({
      identifier: record.identifier,
      kind: record.kind,
      remote: record.remote,
      needs: Object.freeze(record.needs.map(String)),
    });
  }));
}

export function parsePicoCompanionSuppliers(value: unknown): readonly PicoCompanionSupplier[] {
  if (!Array.isArray(value)) {
    throw new Error('invalid_pico_companion_suppliers');
  }
  return Object.freeze(value.map((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error('invalid_pico_companion_supplier');
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.identifier !== 'string'
      || typeof record.kind !== 'string'
      || typeof record.mayReachOutside !== 'boolean'
      || typeof record.mayReachUnasked !== 'boolean') {
      throw new Error('invalid_pico_companion_supplier');
    }
    return Object.freeze({
      identifier: record.identifier,
      kind: record.kind,
      mayReachOutside: record.mayReachOutside,
      mayReachUnasked: record.mayReachUnasked,
    });
  }));
}

/**
 * ADR 0143 DP1 with ADR 0138 CO3/CO4 - a depot, in the same two questions.
 *
 * **The same shape as a supplier line, deliberately.** ADR 0136's supplier
 * holds material and ADR 0143's depot holds what runs, which is a distinction
 * the tree needs and the money does not: a person is answering *may Pico go
 * and get this, and unasked?* about both. Two vocabularies for one question
 * would be two things to learn for no decision it changes.
 */
export interface PicoCompanionDepot {
  remote: string;
  commit: string;
  mayFetch: boolean;
  mayFetchUnasked: boolean;
}

export function picoCompanionDepotLines(
  depots: readonly PicoCompanionDepot[],
): readonly PicoCompanionSupplierLine[] {
  return picoCompanionSupplierLines(depots.map((depot) => ({
    // The revision, short: a person recognises a commit by its first
    // characters or not at all, and the whole thing crowds the line it is on.
    identifier: `${depot.remote} at ${depot.commit.slice(0, 12)}`,
    kind: 'depot',
    mayReachOutside: depot.mayFetch,
    mayReachUnasked: depot.mayFetchUnasked,
  }))).map((line, index) => Object.freeze({
    ...line,
    // The line's own identity is the remote, because that is what the
    // decision names. The revision is in the words a person reads.
    identifier: depots[index]!.remote,
  }));
}

/**
 * ADR 0139 AC4 - what a part of Pico says it will do, put to the person.
 *
 * **The sentences are the module's own, and they are not rewritten here.** A
 * module's effect description is the text somebody agrees to and the text the
 * Vault later quotes back when it asks; a second wording in this file would
 * make the question and the reminder two different questions.
 *
 * So this decides only the frame around them: what the list is called, and
 * what agreeing is called. `drift` is turned into that frame, because *this is
 * new* and *this changed under an agreement you already gave* are different
 * things to be told, and the second is the one ADR 0127 M4 says must never
 * pass silently.
 */
export interface PicoCompanionModuleConsentLine {
  identifier: string;
  headline: string;
  /** One line per declared effect, in the module's own words. */
  effectLines: readonly string[];
  actionLabel: string;
}

export function picoCompanionModuleConsentLines(
  awaiting: ReadonlyArray<{
    identifier: string;
    drift: { added: readonly string[]; removed: readonly string[]; changed: readonly string[] };
    declares: ReadonlyArray<{ name: string; description: string; risk: string }>;
  }>,
): readonly PicoCompanionModuleConsentLine[] {
  return Object.freeze(awaiting.map((entry) => {
    const changed = entry.drift.changed.length > 0;
    return Object.freeze({
      identifier: entry.identifier,
      headline: changed
        ? `${entry.identifier} now asks for something different from what you agreed to.`
        : `${entry.identifier} would like to do this.`,
      effectLines: Object.freeze(entry.declares.map((effect) => effect.description)),
      actionLabel: changed ? 'Agree to the change' : 'Agree',
    });
  }));
}

/**
 * ADR 0141 RN4 - a question the Home is holding, in front of the person.
 *
 * **In the Now view rather than in settings**, which is the split the window
 * already makes: this expires in minutes and is the reason somebody is being
 * interrupted, while agreeing that a module may act at all is a thing they
 * came to change. The two look similar and belong in different places.
 *
 * The prompt is the module's own effect description again, for the reason
 * above: this is the moment the earlier agreement is being drawn on, and it
 * has to be recognisable as the same sentence.
 */
export interface PicoCompanionApprovalLine {
  requestedEventId: string;
  headline: string;
  detail: string;
  approveLabel: string;
  denyLabel: string;
}

export function picoCompanionApprovalLines(
  waiting: ReadonlyArray<{ requestedEventId: string; prompt: string; risk: string }>,
): readonly PicoCompanionApprovalLine[] {
  return Object.freeze(waiting.map((entry) => Object.freeze({
    requestedEventId: entry.requestedEventId,
    headline: 'Pico is waiting for your answer.',
    detail: entry.prompt,
    approveLabel: 'Do it',
    // Never *cancel*: a person closing a question is answering it, and the
    // word for that is no. Leaving it unanswered is what closing the window
    // does, and that is a third thing nothing here offers as a button.
    denyLabel: 'No',
  })));
}

export function parsePicoCompanionModuleConsent(value: unknown): ReadonlyArray<{
  identifier: string;
  drift: { added: readonly string[]; removed: readonly string[]; changed: readonly string[] };
  declares: ReadonlyArray<{ name: string; description: string; risk: string }>;
}> {
  if (!Array.isArray(value)) {
    throw new Error('invalid_pico_companion_module_consent');
  }
  return Object.freeze(value.map((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error('invalid_pico_companion_module_consent_entry');
    }
    const record = entry as Record<string, unknown>;
    const drift = record.drift as Record<string, unknown> | undefined;
    if (typeof record.identifier !== 'string'
      || !Array.isArray(record.declares)
      || !Array.isArray(drift?.added)
      || !Array.isArray(drift.removed)
      || !Array.isArray(drift.changed)) {
      throw new Error('invalid_pico_companion_module_consent_entry');
    }
    return Object.freeze({
      identifier: record.identifier,
      drift: Object.freeze({
        added: Object.freeze(drift.added.map(String)),
        removed: Object.freeze(drift.removed.map(String)),
        changed: Object.freeze(drift.changed.map(String)),
      }),
      declares: Object.freeze(record.declares.map((effect) => {
        const shape = effect as Record<string, unknown> | null;
        if (typeof shape?.name !== 'string'
          || typeof shape.description !== 'string'
          || typeof shape.risk !== 'string') {
          throw new Error('invalid_pico_companion_module_effect');
        }
        return Object.freeze({
          name: shape.name,
          description: shape.description,
          risk: shape.risk,
        });
      })),
    });
  }));
}

export function parsePicoCompanionPendingApprovals(value: unknown): ReadonlyArray<{
  requestedEventId: string;
  prompt: string;
  risk: string;
  expiresAt: string;
}> {
  if (!Array.isArray(value)) {
    throw new Error('invalid_pico_companion_pending_approvals');
  }
  return Object.freeze(value.map((entry) => {
    const record = entry as Record<string, unknown> | null;
    if (typeof record?.requestedEventId !== 'string'
      || typeof record.prompt !== 'string'
      || typeof record.risk !== 'string'
      || typeof record.expiresAt !== 'string') {
      throw new Error('invalid_pico_companion_pending_approval');
    }
    return Object.freeze({
      requestedEventId: record.requestedEventId,
      prompt: record.prompt,
      risk: record.risk,
      expiresAt: record.expiresAt,
    });
  }));
}

/**
 * Why a *fetch now* did nothing, in words rather than a count of zero.
 *
 * One reason has a sentence because one reason is a thing a person can fix:
 * nobody has agreed that this part of Pico may act at all. Anything else the
 * sweep declined to do is already visible as the depot's own switches.
 */
export function picoCompanionFetchBlockedLine(blocked: string): string {
  return blocked === 'effects_not_consented'
    ? 'Nothing was fetched: you have not yet agreed that Pico may fetch depots. '
      + 'That agreement is in settings, under what the parts of Pico may do.'
    : 'Nothing was fetched.';
}

export function parsePicoCompanionDepots(value: unknown): readonly PicoCompanionDepot[] {
  if (!Array.isArray(value)) {
    throw new Error('invalid_pico_companion_depots');
  }
  return Object.freeze(value.map((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error('invalid_pico_companion_depot');
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.remote !== 'string'
      || typeof record.commit !== 'string'
      || typeof record.mayFetch !== 'boolean'
      || typeof record.mayFetchUnasked !== 'boolean') {
      throw new Error('invalid_pico_companion_depot');
    }
    return Object.freeze({
      remote: record.remote,
      commit: record.commit,
      mayFetch: record.mayFetch,
      mayFetchUnasked: record.mayFetchUnasked,
    });
  }));
}
