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
  | 'service_error';

export type PicoCompanionPresentationSeverity = 'active' | 'warning' | 'blocked';
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
  if (Object.keys(record).some((key) => !expected.has(key))
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
  return Object.freeze({ ...record }) as unknown as PicoCompanionPresentation;
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
