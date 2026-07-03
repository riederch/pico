import type { PicoEvent as ProtocolPicoEvent } from '@pico/protocol';

export type PicoEvent = ProtocolPicoEvent;

export interface HealthResponse {
  ok: boolean;
  service: string;
  deviceId: string;
}

export interface AppliedMigration {
  id: string;
  appliedAt: string;
}

export interface SystemStatus {
  service: string;
  version: string;
  protocolVersion: string;
  deviceId: string;
  database: {
    maxLamport: number;
    migrations: AppliedMigration[];
  };
}

export interface EventListResponse {
  events: PicoEvent[];
}

export interface DashboardSnapshot {
  health: HealthResponse;
  systemStatus: SystemStatus;
  events: PicoEvent[];
}

export type ConnectionStatus = 'idle' | 'checking' | 'connecting' | 'connected' | 'disconnected' | 'error';

export interface DashboardState {
  baseUrl: string;
  httpStatus: ConnectionStatus;
  websocketStatus: ConnectionStatus;
  lastUpdatedAt: Date | null;
  systemStatus: SystemStatus | null;
  events: PicoEvent[];
  errorMessage: string | null;
}

export interface RealtimeConnectedMessage {
  type: 'pico.core.connected';
  deviceId: string;
}

export interface RealtimeEventCreatedMessage {
  type: 'pico.event.created';
  event: PicoEvent;
}

export type RealtimeMessage = RealtimeConnectedMessage | RealtimeEventCreatedMessage;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isPicoEvent(value: unknown): value is PicoEvent {
  return (
    isRecord(value)
    && typeof value.eventId === 'string'
    && typeof value.deviceId === 'string'
    && (value.sessionId === undefined || typeof value.sessionId === 'string')
    && typeof value.lamport === 'number'
    && Number.isInteger(value.lamport)
    && typeof value.wallTime === 'string'
    && typeof value.type === 'string'
    && typeof value.stream === 'string'
    && Object.hasOwn(value, 'payload')
    && (value.signature === undefined || typeof value.signature === 'string')
  );
}
