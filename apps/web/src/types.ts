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

export type PicoHomeClaimStateName = 'unclaimed' | 'claimed';

export interface SystemStatus {
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
    migrations: AppliedMigration[];
  };
}

export interface EventListResponse {
  events: PicoEvent[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface EventHistoryStatus {
  loadedCount: number;
  hasMore: boolean;
}

export interface DashboardSnapshot {
  health: HealthResponse;
  systemStatus: SystemStatus;
  events: PicoEvent[];
  eventHistory: EventHistoryStatus;
}

export type ConnectionStatus = 'idle' | 'checking' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

export interface EventFilters {
  type: string;
  stream: string;
  deviceId: string;
}

export interface DashboardState {
  baseUrl: string;
  httpStatus: ConnectionStatus;
  websocketStatus: ConnectionStatus;
  websocketRetryAt: Date | null;
  lastUpdatedAt: Date | null;
  systemStatus: SystemStatus | null;
  events: PicoEvent[];
  eventHistory: EventHistoryStatus | null;
  eventFilters: EventFilters;
  selectedEventId: string | null;
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
