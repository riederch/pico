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
