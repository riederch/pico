/**
 * ADR 0113 C2/B3: the complete renderer-facing contract. It contains only
 * already-rendered presentation state. Key material, daemon paths, sockets,
 * signed records and generic IPC payloads have no representation here.
 */
export const picoCompanionIpcChannels = Object.freeze({
  getPresentation: 'pico:presentation:get',
  presentationChanged: 'pico:presentation:changed',
  requestCheck: 'pico:lifecycle:check',
  closeWindow: 'pico:window:close',
});

export type PicoCompanionPresentationKind =
  | 'starting'
  | 'idle'
  | 'pending_recovery'
  | 'host_keys_rotated'
  | 'host_continuity_unverified'
  | 'service_error';

export type PicoCompanionPresentationSeverity = 'active' | 'warning' | 'blocked';

export interface PicoCompanionPresentation {
  kind: PicoCompanionPresentationKind;
  severity: PicoCompanionPresentationSeverity;
  symbol: '●' | '!' | '×';
  title: string;
  body: string;
  observedAt: string;
}

const kinds = new Set<PicoCompanionPresentationKind>([
  'starting',
  'idle',
  'pending_recovery',
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

export function parsePicoCompanionPresentation(value: unknown): PicoCompanionPresentation {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('invalid_companion_presentation');
  }
  const record = value as Record<string, unknown>;
  const expected = new Set(['kind', 'severity', 'symbol', 'title', 'body', 'observedAt']);
  if (Object.keys(record).some((key) => !expected.has(key))
    || [...expected].some((key) => !(key in record))) {
    throw new Error('invalid_companion_presentation_shape');
  }
  if (!kinds.has(record.kind as PicoCompanionPresentationKind)
    || !severities.has(record.severity as PicoCompanionPresentationSeverity)
    || !symbols.has(record.symbol as PicoCompanionPresentation['symbol'])) {
    throw new Error('invalid_companion_presentation_state');
  }
  assertDisplayText(record.title, 160);
  assertDisplayText(record.body, 4_000);
  if (typeof record.observedAt !== 'string'
    || !Number.isFinite(Date.parse(record.observedAt))) {
    throw new Error('invalid_companion_presentation_time');
  }
  return Object.freeze({ ...record }) as unknown as PicoCompanionPresentation;
}

export function picoCompanionIdlePresentation(now = new Date()): PicoCompanionPresentation {
  return parsePicoCompanionPresentation({
    kind: 'idle',
    severity: 'active',
    symbol: '●',
    title: 'Pico is watching your Home',
    body: 'No pending device recovery was found on the last authenticated check.',
    observedAt: now.toISOString(),
  });
}

function assertDisplayText(value: unknown, maximum: number): void {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum) {
    throw new Error('invalid_companion_presentation_text');
  }
}
