export type PicoEventType =
  | 'device.registered'
  | 'device.seen'
  | 'session.created'
  | 'message.created'
  | 'avatar.state_changed'
  | 'tool.call_requested'
  | 'tool.call_completed'
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

export type ToolRiskLevel = 'read_only' | 'draft' | 'write' | 'destructive' | 'forbidden';

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
