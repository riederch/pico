export type PicoEventType =
  | 'device.registered'
  | 'device.seen'
  | 'session.created'
  | 'message.created'
  | 'avatar.state_changed'
  | 'tool.call_requested'
  | 'tool.call_completed'
  | 'policy.decision_created'
  | 'confirmation.requested'
  | 'confirmation.resolved'
  | 'executor.action_started'
  | 'executor.action_completed'
  | 'audit.event_created';

export type DeviceType = 'core' | 'web' | 'mobile' | 'desktop' | 'home_assistant' | 'browser_extension' | 'unknown';

export type TrustedLevel = 'untrusted' | 'known' | 'trusted' | 'admin';

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

export type ToolRiskLevel =
  | 'read_only'
  | 'local_write'
  | 'external_write'
  | 'destructive'
  | 'security_sensitive'
  | 'privileged_system_action';

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

export interface PicoSession {
  sessionId: string;
  activeDeviceId: string;
  createdAt: string;
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

export interface ToolCallRequestedPayload {
  toolName: string;
  riskLevel: ToolRiskLevel;
  arguments: Record<string, unknown>;
}

export interface ToolCallCompletedPayload {
  toolName: string;
  success: boolean;
  summary: string;
}

export interface PolicyDecisionCreatedPayload {
  requestedEventId: string;
  decision: PolicyDecision;
  reason: string;
  riskLevel?: ToolRiskLevel;
  dataDomain?: string;
}

export interface ConfirmationRequestedPayload {
  requestedEventId: string;
  prompt: string;
  riskLevel: ToolRiskLevel;
  expiresAt?: string;
}

export interface ConfirmationResolvedPayload {
  confirmationEventId: string;
  approved: boolean;
  resolvedAt: string;
}

export interface ExecutorActionStartedPayload {
  requestedEventId: string;
  toolName: string;
  riskLevel: ToolRiskLevel;
}

export interface ExecutorActionCompletedPayload {
  startedEventId: string;
  toolName: string;
  success: boolean;
  summary: string;
}

export interface AuditEventCreatedPayload {
  subjectEventId?: string;
  actorDeviceId?: string;
  action: string;
  decision?: PolicyDecision;
  dataDomain?: string;
  redaction: 'none' | 'summary' | 'reference_only';
  summary: string;
}