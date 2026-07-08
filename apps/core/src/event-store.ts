import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import type { PicoEvent, PicoEventAppendResult } from '@pico/protocol';
import { listAppliedMigrations, runMigrations, type AppliedMigration } from './migrations.js';

export type AppendResult = PicoEventAppendResult;

export interface EventCursor {
  lamport: number;
  wallTime: string;
  eventId: string;
}

export interface EventListPage {
  events: PicoEvent[];
  nextCursor: EventCursor | null;
  hasMore: boolean;
}

export type PicoHomeClaimState =
  | {
    state: 'unclaimed';
    hostAdminPicoId: null;
    claimedAt: null;
    createdAt: string;
    updatedAt: string;
  }
  | {
    state: 'claimed';
    hostAdminPicoId: string;
    claimedAt: string;
    createdAt: string;
    updatedAt: string;
  };

export class EventStore {
  private readonly db: Database.Database;
  private closed = false;

  public constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.db = new Database(databasePath);
    this.db.pragma('journal_mode = WAL');
    runMigrations(this.db);
  }

  public append(event: PicoEvent): AppendResult {
    this.ensureOpen();
    assertStoredEvent(event);

    const payloadJson = serializePayload(event.payload);
    const existing = this.db
      .prepare('SELECT * FROM pico_event WHERE event_id = ?')
      .get(event.eventId) as EventRow | undefined;

    if (existing) {
      return isSameStoredEvent(existing, event, payloadJson) ? 'duplicate_same_payload' : 'duplicate_conflict';
    }

    const statement = this.db.prepare(`
      INSERT INTO pico_event (
        event_id,
        device_id,
        session_id,
        lamport,
        wall_time,
        type,
        stream,
        payload_json,
        signature,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    statement.run(
      event.eventId,
      event.deviceId,
      event.sessionId ?? null,
      event.lamport,
      event.wallTime,
      event.type,
      event.stream,
      payloadJson,
      event.signature ?? null,
      new Date().toISOString(),
    );

    return 'inserted';
  }

  public list(limit = 100): PicoEvent[] {
    return this.listPage({ limit }).events;
  }

  public listPage(options: { limit?: number; after?: EventCursor | null } = {}): EventListPage {
    this.ensureOpen();
    const limit = options.limit ?? 100;
    assertListLimit(limit);

    const rows = this.selectPageRows(limit + 1, options.after ?? null);
    const pageRows = rows.slice(0, limit);
    const events = pageRows.map((row) => this.mapRow(row));
    const lastEvent = events.at(-1) ?? null;

    return {
      events,
      nextCursor: lastEvent === null ? null : {
        lamport: lastEvent.lamport,
        wallTime: lastEvent.wallTime,
        eventId: lastEvent.eventId,
      },
      hasMore: rows.length > limit,
    };
  }

  public maxLamport(): number {
    this.ensureOpen();

    const row = this.db.prepare('SELECT MAX(lamport) AS max_lamport FROM pico_event').get() as { max_lamport: number | null };
    return row.max_lamport ?? 0;
  }

  public appliedMigrations(): AppliedMigration[] {
    this.ensureOpen();

    return listAppliedMigrations(this.db);
  }

  public picoHomeClaimState(): PicoHomeClaimState {
    this.ensureOpen();

    const row = this.db
      .prepare(`
        SELECT
          state,
          host_admin_pico_id AS hostAdminPicoId,
          claimed_at AS claimedAt,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM pico_home_claim_state
        WHERE id = 1
      `)
      .get() as PicoHomeClaimStateRow | undefined;

    if (row === undefined) {
      throw new Error('Pico Home claim state is missing.');
    }

    return mapPicoHomeClaimState(row);
  }

  public close(): void {
    if (this.closed) {
      return;
    }

    this.db.close();
    this.closed = true;
  }

  private selectPageRows(limit: number, after: EventCursor | null): EventRow[] {
    if (after === null) {
      return this.db.prepare(`
        SELECT *
        FROM pico_event
        ORDER BY lamport ASC, wall_time ASC, event_id ASC
        LIMIT ?
      `).all(limit) as EventRow[];
    }

    return this.db.prepare(`
      SELECT *
      FROM pico_event
      WHERE
        lamport > ?
        OR (lamport = ? AND wall_time > ?)
        OR (lamport = ? AND wall_time = ? AND event_id > ?)
      ORDER BY lamport ASC, wall_time ASC, event_id ASC
      LIMIT ?
    `).all(after.lamport, after.lamport, after.wallTime, after.lamport, after.wallTime, after.eventId, limit) as EventRow[];
  }

  private ensureOpen(): void {
    if (this.closed) {
      throw new Error('EventStore is closed.');
    }
  }

  private mapRow(row: EventRow): PicoEvent {
    return {
      eventId: row.event_id,
      deviceId: row.device_id,
      sessionId: row.session_id ?? undefined,
      lamport: row.lamport,
      wallTime: row.wall_time,
      type: row.type as PicoEvent['type'],
      stream: row.stream,
      payload: JSON.parse(row.payload_json) as unknown,
      signature: row.signature ?? undefined,
    };
  }
}

interface EventRow {
  event_id: string;
  device_id: string;
  session_id: string | null;
  lamport: number;
  wall_time: string;
  type: string;
  stream: string;
  payload_json: string;
  signature: string | null;
}

interface PicoHomeClaimStateRow {
  state: string;
  hostAdminPicoId: string | null;
  claimedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapPicoHomeClaimState(row: PicoHomeClaimStateRow): PicoHomeClaimState {
  if (row.state === 'unclaimed' && row.hostAdminPicoId === null && row.claimedAt === null) {
    return { state: 'unclaimed', hostAdminPicoId: null, claimedAt: null, createdAt: row.createdAt, updatedAt: row.updatedAt };
  }

  if (row.state === 'claimed' && row.hostAdminPicoId !== null && row.hostAdminPicoId.trim() !== '' && row.claimedAt !== null) {
    return { state: 'claimed', hostAdminPicoId: row.hostAdminPicoId, claimedAt: row.claimedAt, createdAt: row.createdAt, updatedAt: row.updatedAt };
  }

  throw new Error('Pico Home claim state is invalid.');
}

function isSameStoredEvent(row: EventRow, event: PicoEvent, payloadJson: string): boolean {
  return row.event_id === event.eventId
    && row.device_id === event.deviceId
    && row.session_id === (event.sessionId ?? null)
    && row.lamport === event.lamport
    && row.wall_time === event.wallTime
    && row.type === event.type
    && row.stream === event.stream
    && serializeStoredPayload(row.payload_json) === payloadJson
    && row.signature === (event.signature ?? null);
}

function assertStoredEvent(event: PicoEvent): void {
  assertNonEmptyString(event.eventId, 'eventId');
  assertNonEmptyString(event.deviceId, 'deviceId');

  if (event.sessionId !== undefined) {
    assertNonEmptyString(event.sessionId, 'sessionId');
  }

  assertLamportValue(event.lamport);
  assertNonEmptyString(event.wallTime, 'wallTime');
  assertNonEmptyString(event.type, 'type');
  assertNonEmptyString(event.stream, 'stream');

  if (event.signature !== undefined) {
    assertNonEmptyString(event.signature, 'signature');
  }
}

function assertNonEmptyString(value: string, label: string): void {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Event ${label} must be a non-empty string.`);
  }
}

function assertLamportValue(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('Event lamport must be a non-negative safe integer.');
  }
}

function assertListLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new Error('EventStore list limit must be a positive safe integer.');
  }
}

function serializePayload(payload: unknown): string {
  const serialized = JSON.stringify(payload);

  if (serialized === undefined) {
    throw new Error('Event payload must be JSON serializable.');
  }

  return stringifyStableJson(JSON.parse(serialized) as JsonValue);
}

function serializeStoredPayload(payloadJson: string): string {
  return stringifyStableJson(JSON.parse(payloadJson) as JsonValue);
}

function stringifyStableJson(value: JsonValue): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stringifyStableJson(item)).join(',')}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stringifyStableJson(value[key])}`)
    .join(',')}}`;
}

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
