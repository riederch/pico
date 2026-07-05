export const foundationEventTypes = [
  'device.registered',
  'device.seen',
  'session.created',
  'message.created',
  'avatar.state_changed',
] as const;

export type FoundationEventType = typeof foundationEventTypes[number];

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

export type AvatarMode = 'everyday' | 'technical' | 'wwg' | 'firefighter' | 'security' | 'organization' | 'smart_home';

export type AvatarStateName =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'working'
  | 'unsure'
  | 'warning'
  | 'confirmation_required'
  | 'blocked'
  | 'success'
  | 'sleeping';

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

export interface PicoHomeMembership {
  picoId: string;
  homeId: string;
  role: 'home_host' | 'home_member';
  status: 'invited' | 'active' | 'removed';
}

export interface MessageCreatedPayload {
  role: 'user' | 'assistant' | 'system' | 'tool';
  text: string;
}

export interface AvatarStateChangedPayload {
  mode: AvatarMode;
  state: AvatarStateName;
  intensity: 'low' | 'normal' | 'high';
  statusColor: 'neutral' | 'blue' | 'green' | 'yellow' | 'red' | 'violet';
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
