export const foundationEventTypes = [
  'device.registered',
  'device.seen',
  'session.created',
  'message.created',
  'avatar.state_changed',
  'memory.tombstone',
] as const;

export type FoundationEventType = typeof foundationEventTypes[number];

export type DeviceRegisteredPayload = Record<string, never>;

export const deviceSeenStatuses = [
  'online',
  'offline',
] as const;

export type DeviceSeenStatus = typeof deviceSeenStatuses[number];

export interface DeviceSeenPayload {
  status: DeviceSeenStatus;
}

export type SessionCreatedPayload = Record<string, never>;

// Reserved product protocol direction. These event names are known for
// compatibility and documentation, but the current Foundation POST /api/events
// endpoint must reject them until dedicated Pico Rules, Action Runner or
// Action History write paths exist.
export const actionEventTypes = [
  'action.requested',
  'action.completed',
  'pico_rules.decision_created',
  'approval.requested',
  'approval.resolved',
  'action_runner.action_started',
  'action_runner.action_completed',
  'action_history.event_created',
] as const;

export type ActionEventType = typeof actionEventTypes[number];

// Reserved compatibility aliases for earlier tool/policy terminology. They are
// exported so readers can map old names, but they are not writable Foundation
// events and are not implemented policy or executor APIs.
export const legacyToolPolicyEventTypes = [
  'tool.call_requested',
  'tool.call_completed',
  'policy.decision_created',
  'confirmation.requested',
  'confirmation.resolved',
  'executor.action_started',
  'executor.action_completed',
  'audit.event_created',
] as const;

export type LegacyToolPolicyEventType = typeof legacyToolPolicyEventTypes[number];

// Reserved Pico Home Link direction. These names are not claim, membership or
// residency write APIs in the current Foundation implementation.
export const picoHomeEventTypes = [
  'pico_home.claim_requested',
  'pico_home.claim_completed',
  'pico_home.invite_created',
  'pico_home.resident_joined',
  'pico_home.resident_removed',
] as const;

export type PicoHomeEventType = typeof picoHomeEventTypes[number];

export const picoEventTypes = [
  ...foundationEventTypes,
  ...actionEventTypes,
  ...legacyToolPolicyEventTypes,
  ...picoHomeEventTypes,
] as const;

export type PicoEventType = typeof picoEventTypes[number];

export const protocolCapabilities = {
  'pico.core.events.v1': true,
  'pico.core.websocket.v1': true,
  'pico.avatar_state.v1': true,
} as const;

export type PicoProtocolCapability = keyof typeof protocolCapabilities;
export type PicoProtocolCapabilities = typeof protocolCapabilities;

export const picoHomeClaimStates = [
  'unclaimed',
  'claimed',
] as const;

export type PicoHomeClaimStateName = typeof picoHomeClaimStates[number];

export const realtimeMessageType = {
  coreConnected: 'pico.core.connected',
  eventCreated: 'pico.event.created',
} as const;

export const realtimeMessageTypes = [
  realtimeMessageType.coreConnected,
  realtimeMessageType.eventCreated,
] as const;

export type PicoRealtimeMessageType = typeof realtimeMessageTypes[number];

export type PicoNodeType =
  | 'pico_home'
  | 'pico_vault'
  | 'pico_surface'
  | 'pico_relay'
  | 'mobile'
  | 'desktop'
  | 'home_assistant'
  | 'browser_extension'
  | 'unknown';

/** @deprecated Use PicoNodeType. */
export type DeviceType = PicoNodeType | 'core' | 'web';

// Reserved context-signal posture. These values are compatibility and planning
// direction only. `admin` is a legacy/placeholder signal label and must not be
// used as an authorization role, host-administration grant or capability.
export type ContextSignalLevel = 'untrusted' | 'known' | 'trusted' | 'admin';

/** @deprecated Use ContextSignalLevel. */
export type TrustedLevel = ContextSignalLevel;

export const messageCreatedRoles = [
  'user',
  'assistant',
  'system',
  'tool',
] as const;

export type MessageCreatedRole = typeof messageCreatedRoles[number];

export interface MessageCreatedPayload {
  role: MessageCreatedRole;
  text: string;
}

export const avatarModes = [
  'everyday',
  'technical',
  'wwg',
  'firefighter',
  'security',
  'organization',
  'smart_home',
] as const;

export type AvatarMode = typeof avatarModes[number];

export const avatarStates = [
  'idle',
  'listening',
  'thinking',
  'working',
  'unsure',
  'warning',
  'confirmation_required',
  'blocked',
  'success',
  'sleeping',
] as const;

export type AvatarStateName = typeof avatarStates[number];

export const avatarIntensities = [
  'low',
  'normal',
  'high',
] as const;

export type AvatarIntensity = typeof avatarIntensities[number];

export const avatarStatusColors = [
  'neutral',
  'blue',
  'green',
  'yellow',
  'red',
  'violet',
] as const;

export type AvatarStatusColor = typeof avatarStatusColors[number];

export interface AvatarStateChangedPayload {
  mode: AvatarMode;
  state: AvatarStateName;
  intensity: AvatarIntensity;
  statusColor: AvatarStatusColor;
  message?: string;
}

// Append-only deletion marker for a deleteable memory item (ADR 0014 / ADR 0068).
// It references the deleted item and carries no sensitive content.
export interface MemoryTombstonePayload {
  memoryItemId: string;
  privacyDomain: string;
  reason?: string;
}

export type FoundationEventPayload =
  | DeviceRegisteredPayload
  | DeviceSeenPayload
  | SessionCreatedPayload
  | MessageCreatedPayload
  | AvatarStateChangedPayload
  | MemoryTombstonePayload;

export type FoundationPayloadValidationResult =
  | { ok: true; payload: FoundationEventPayload }
  | { ok: false; error: string };

export interface FoundationPayloadValidationOptions {
  maxMessageTextLength?: number;
  maxAvatarMessageLength?: number;
}

export function validateFoundationEventPayload(
  type: FoundationEventType,
  payload: unknown,
  options: FoundationPayloadValidationOptions = {},
): FoundationPayloadValidationResult {
  if (!isRecord(payload)) {
    return { ok: false, error: 'payload must be an object.' };
  }

  if (type === 'device.registered') {
    const extraKey = firstUnexpectedKey(payload, []);
    if (extraKey !== undefined) {
      return { ok: false, error: `device.registered payload has unexpected field: ${extraKey}.` };
    }

    return { ok: true, payload: {} };
  }

  if (type === 'device.seen') {
    const extraKey = firstUnexpectedKey(payload, ['status']);
    if (extraKey !== undefined) {
      return { ok: false, error: `device.seen payload has unexpected field: ${extraKey}.` };
    }

    if (!isStringMember(payload.status, deviceSeenStatuses)) {
      return { ok: false, error: 'device.seen payload requires status.' };
    }

    return { ok: true, payload: { status: payload.status } };
  }

  if (type === 'session.created') {
    const extraKey = firstUnexpectedKey(payload, []);
    if (extraKey !== undefined) {
      return { ok: false, error: `session.created payload has unexpected field: ${extraKey}.` };
    }

    return { ok: true, payload: {} };
  }

  if (type === 'message.created') {
    const extraKey = firstUnexpectedKey(payload, ['role', 'text']);
    if (extraKey !== undefined) {
      return { ok: false, error: `message.created payload has unexpected field: ${extraKey}.` };
    }

    if (!isStringMember(payload.role, messageCreatedRoles) || !isNonEmptyString(payload.text, options.maxMessageTextLength)) {
      return { ok: false, error: 'message.created payload requires role and text.' };
    }

    return { ok: true, payload: { role: payload.role, text: payload.text } };
  }

  if (type === 'memory.tombstone') {
    const extraKey = firstUnexpectedKey(payload, ['memoryItemId', 'privacyDomain', 'reason']);
    if (extraKey !== undefined) {
      return { ok: false, error: `memory.tombstone payload has unexpected field: ${extraKey}.` };
    }

    if (!isNonEmptyString(payload.memoryItemId, 256) || !isNonEmptyString(payload.privacyDomain, 256)) {
      return { ok: false, error: 'memory.tombstone payload requires memoryItemId and privacyDomain.' };
    }

    if (payload.reason !== undefined && !isNonEmptyString(payload.reason, 1_000)) {
      return { ok: false, error: 'memory.tombstone reason must be a non-empty string when provided.' };
    }

    return {
      ok: true,
      payload: {
        memoryItemId: payload.memoryItemId,
        privacyDomain: payload.privacyDomain,
        ...(payload.reason === undefined ? {} : { reason: payload.reason }),
      },
    };
  }

  const extraKey = firstUnexpectedKey(payload, ['mode', 'state', 'intensity', 'statusColor', 'message']);
  if (extraKey !== undefined) {
    return { ok: false, error: `avatar.state_changed payload has unexpected field: ${extraKey}.` };
  }

  if (
    !isStringMember(payload.mode, avatarModes)
    || !isStringMember(payload.state, avatarStates)
    || !isStringMember(payload.intensity, avatarIntensities)
    || !isStringMember(payload.statusColor, avatarStatusColors)
  ) {
    return { ok: false, error: 'avatar.state_changed payload is invalid.' };
  }

  if (payload.message !== undefined && !isNonEmptyString(payload.message, options.maxAvatarMessageLength)) {
    return { ok: false, error: 'avatar.state_changed message must be a non-empty string when provided.' };
  }

  return {
    ok: true,
    payload: {
      mode: payload.mode,
      state: payload.state,
      intensity: payload.intensity,
      statusColor: payload.statusColor,
      ...(payload.message === undefined ? {} : { message: payload.message }),
    },
  };
}

// Reserved privacy/deletability protocol direction (ADR 0014 / ADR 0067). These
// names prepare later additive payload-posture documentation, but the current
// Foundation PicoEvent shape does not expose a payloadPosture field and does not
// implement memory, tombstone, retention or privacy-domain storage semantics. An
// absent posture is treated as inline_operational once the field is added.
export const payloadPostures = [
  'inline_operational',
  'inline_test',
  'reference_only',
  'summary_only',
  'redacted',
] as const;

export type PayloadPosture = typeof payloadPostures[number];

// Payload postures writable through the current `POST /api/events` surface
// (ADR 0067). Reference, summary and redacted postures are reserved for future
// memory-referencing events and are not writable until reference targets and a
// deleteable memory store exist.
export const writablePayloadPostures = [
  'inline_operational',
  'inline_test',
] as const;

export type WritablePayloadPosture = typeof writablePayloadPostures[number];

// Reserved deleteable memory direction (ADR 0014 / ADR 0068). Additive planning
// vocabulary for a future memory store. The current Foundation implementation
// has no memory store, reference target, tombstone or deletion runtime; content
// stays out of append-only events (ADR 0067 payload posture).
export const memoryItemDeletionStates = [
  'active',
  'deleted',
  'tombstoned',
] as const;

export type MemoryItemDeletionState = typeof memoryItemDeletionStates[number];

export const referenceTargetResolutionStates = [
  'resolvable',
  'deleted',
  'unknown',
] as const;

export type ReferenceTargetResolutionState = typeof referenceTargetResolutionStates[number];

// Reserved planning type for a future `reference_only` payload posture target
// (ADR 0068). A reference target names where a deleteable memory item lives; it
// is not the content, not a decryption grant and is not accepted on any current
// write path.
export interface MemoryItemReference {
  referenceId: string;
  memoryItemId: string;
  store: string;
  privacyDomain: string;
  contentType: string;
  summary?: string;
  resolutionState: ReferenceTargetResolutionState;
}

// Reserved action/policy/audit protocol direction. The current Foundation API
// exports these shapes for documentation and compatibility planning only; it
// must not accept them on the generic event write path until dedicated product
// APIs and policy gates exist.
export type ActionRisk =
  | 'read_only'
  | 'local_write'
  | 'external_write'
  | 'destructive'
  | 'security_sensitive'
  | 'privileged_system_action';

/** @deprecated Use ActionRisk. */
export type ToolRiskLevel = ActionRisk;

export type PicoRulesDecision = 'allow' | 'require_approval' | 'deny';

/** @deprecated Use PicoRulesDecision. */
export type PolicyDecision = 'allow' | 'require_confirmation' | 'deny';

export interface PicoEvent<TPayload = unknown> {
  eventId: string;
  deviceId: string;
  sessionId?: string;
  lamport: number;
  wallTime: string;
  type: PicoEventType;
  stream: string;
  payload: TPayload;
  signature?: string;
  // Additive, optional (ADR 0014 / ADR 0067). Absent is treated as
  // `inline_operational`; existing events stay valid without change.
  payloadPosture?: PayloadPosture;
}

export interface PicoHealthResponse {
  ok: boolean;
  service: string;
  deviceId: string;
}

export interface PicoSystemVersionResponse {
  service: string;
  version: string;
  protocolVersion: string;
}

export interface PicoAppliedMigration {
  id: string;
  appliedAt: string;
}

export interface PicoSystemStatusResponse {
  service: string;
  version: string;
  protocolVersion: string;
  deviceId: string;
  capabilities: Record<string, boolean>;
  picoHome: {
    claimState: {
      state: PicoHomeClaimStateName;
    };
  };
  database: {
    maxLamport: number;
    migrations: PicoAppliedMigration[];
  };
}

export interface PicoEventListResponse<TPayload = unknown> {
  events: PicoEvent<TPayload>[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface PicoRealtimeTicketResponse {
  ticket: string;
  expiresAt: string;
}

export type PicoEventAppendResult = 'inserted' | 'duplicate_same_payload' | 'duplicate_conflict';

export interface PicoEventCreateResponse<TPayload = unknown> {
  event: PicoEvent<TPayload>;
  appendResult: PicoEventAppendResult;
}

export interface PicoCoreConnectedMessage {
  type: typeof realtimeMessageType.coreConnected;
  deviceId: string;
}

export interface PicoEventCreatedMessage<TPayload = unknown> {
  type: typeof realtimeMessageType.eventCreated;
  event: PicoEvent<TPayload>;
}

export type PicoRealtimeMessage = PicoCoreConnectedMessage | PicoEventCreatedMessage;

export interface PicoDevice {
  deviceId: string;
  name: string;
  type: DeviceType;
  trustedLevel: TrustedLevel;
  capabilities: Record<string, boolean>;
  lastSeenAt?: string;
}

export interface PicoNode {
  nodeId: string;
  name: string;
  type: PicoNodeType;
  // Context signal only. This is not a role, permission or auth boundary.
  contextSignalLevel: ContextSignalLevel;
  capabilities: Record<string, boolean>;
  lastSeenAt?: string;
}

export interface PicoSession {
  sessionId: string;
  activeDeviceId: string;
  createdAt: string;
}

// Reserved Pico Home membership direction. This is not an implemented host
// claim, resident membership or eviction API in the current Foundation build.
export interface PicoHomeMembership {
  picoId: string;
  homeId: string;
  role: 'home_host' | 'home_member';
  status: 'invited' | 'active' | 'removed';
}

export interface MessageCreatedPayload {
  role: MessageCreatedRole;
  text: string;
}

export interface AvatarStateChangedPayload {
  mode: AvatarMode;
  state: AvatarStateName;
  intensity: AvatarIntensity;
  statusColor: AvatarStatusColor;
  message?: string;
}

export interface ActionRequestedPayload {
  actionName: string;
  risk: ActionRisk;
  input: Record<string, unknown>;
}

export interface ActionCompletedPayload {
  actionName: string;
  success: boolean;
  summary: string;
}

export interface PicoRulesDecisionCreatedPayload {
  requestedEventId: string;
  decision: PicoRulesDecision;
  reason: string;
  risk?: ActionRisk;
  dataSpace?: string;
}

export interface ApprovalRequestedPayload {
  requestedEventId: string;
  prompt: string;
  risk: ActionRisk;
  expiresAt?: string;
}

export interface ApprovalResolvedPayload {
  approvalEventId: string;
  approved: boolean;
  resolvedAt: string;
}

export interface ActionRunnerStartedPayload {
  requestedEventId: string;
  actionName: string;
  risk: ActionRisk;
}

export interface ActionRunnerCompletedPayload {
  startedEventId: string;
  actionName: string;
  success: boolean;
  summary: string;
}

export interface ActionHistoryEventPayload {
  subjectEventId?: string;
  actorDeviceId?: string;
  action: string;
  decision?: PicoRulesDecision;
  dataSpace?: string;
  redaction: 'none' | 'summary' | 'reference_only';
  summary: string;
}

/** @deprecated Use ActionRequestedPayload. */
export interface ToolCallRequestedPayload {
  toolName: string;
  riskLevel: ToolRiskLevel;
  arguments: Record<string, unknown>;
}

/** @deprecated Use ActionCompletedPayload. */
export interface ToolCallCompletedPayload {
  toolName: string;
  success: boolean;
  summary: string;
}

/** @deprecated Use PicoRulesDecisionCreatedPayload. */
export interface PolicyDecisionCreatedPayload {
  requestedEventId: string;
  decision: PolicyDecision;
  reason: string;
  riskLevel?: ToolRiskLevel;
  dataDomain?: string;
}

/** @deprecated Use ApprovalRequestedPayload. */
export interface ConfirmationRequestedPayload {
  requestedEventId: string;
  prompt: string;
  riskLevel: ToolRiskLevel;
  expiresAt?: string;
}

/** @deprecated Use ApprovalResolvedPayload. */
export interface ConfirmationResolvedPayload {
  confirmationEventId: string;
  approved: boolean;
  resolvedAt: string;
}

/** @deprecated Use ActionRunnerStartedPayload. */
export interface ExecutorActionStartedPayload {
  requestedEventId: string;
  toolName: string;
  riskLevel: ToolRiskLevel;
}

/** @deprecated Use ActionRunnerCompletedPayload. */
export interface ExecutorActionCompletedPayload {
  startedEventId: string;
  toolName: string;
  success: boolean;
  summary: string;
}

/** @deprecated Use ActionHistoryEventPayload. */
export interface AuditEventCreatedPayload {
  subjectEventId?: string;
  actorDeviceId?: string;
  action: string;
  decision?: PolicyDecision;
  dataDomain?: string;
  redaction: 'none' | 'summary' | 'reference_only';
  summary: string;
}

function firstUnexpectedKey(record: Record<string, unknown>, allowedKeys: readonly string[]): string | undefined {
  const allowed = new Set(allowedKeys);
  return Object.keys(record).find((key) => !allowed.has(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringMember<const TValues extends readonly string[]>(value: unknown, allowedValues: TValues): value is TValues[number] {
  return typeof value === 'string' && allowedValues.includes(value);
}

function isNonEmptyString(value: unknown, maxLength: number | undefined): value is string {
  return typeof value === 'string'
    && value.trim().length > 0
    && (maxLength === undefined || value.length <= maxLength);
}
