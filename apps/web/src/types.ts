import type {
  PicoAppliedMigration,
  PicoEvent as ProtocolPicoEvent,
  PicoEventListResponse,
  PicoHealthResponse,
  PicoHomeClaimStateName as ProtocolPicoHomeClaimStateName,
  PicoRealtimeMessage as ProtocolPicoRealtimeMessage,
  PicoRealtimeTicketResponse,
  PicoSystemStatusResponse,
} from '@pico/protocol';

export type PicoEvent = ProtocolPicoEvent;
export type RealtimeMessage = ProtocolPicoRealtimeMessage;
export type HealthResponse = PicoHealthResponse;
export type AppliedMigration = PicoAppliedMigration;
export type PicoHomeClaimStateName = ProtocolPicoHomeClaimStateName;
export type SystemStatus = PicoSystemStatusResponse;
export type EventListResponse = PicoEventListResponse;
export type RealtimeTicketResponse = PicoRealtimeTicketResponse;

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
  foundationToken: string;
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
