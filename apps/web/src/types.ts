export interface SystemVersion {
  service: string;
  version: string;
  protocolVersion: string;
}

export interface AppliedMigration {
  id: string;
  appliedAt: string;
}

export interface SystemStatus extends SystemVersion {
  deviceId: string;
  database: {
    maxLamport: number;
    migrations: AppliedMigration[];
  };
}

export interface PicoEvent {
  eventId: string;
  deviceId: string;
  sessionId?: string;
  lamport: number;
  wallTime: string;
  type: string;
  stream: string;
  payload: unknown;
  signature?: string;
}

export interface EventListResponse {
  events: PicoEvent[];
}

export interface RealtimeMessage {
  type: string;
  event?: PicoEvent;
  deviceId?: string;
}

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'warning' | 'error';
