export const foundationEventTypes = [
  'device.registered',
  'device.seen',
  'session.created',
  'message.created',
  'avatar.state_changed',
] as const;

export type FoundationEventType = typeof foundationEventTypes[number];

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
