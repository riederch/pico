import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import type { PicoEvent } from '@pico/protocol';
import { listAppliedMigrations, runMigrations, type AppliedMigration } from './migrations.js';

export type AppendResult = 'inserted' | 'duplicate_same_payload' | 'duplicate_conflict';

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

    const payloadJson = JSON.stringify(event.payload);
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
    this.ensureOpen();

    const statement = this.db.prepare(`
      SELECT *
      FROM pico_event
      ORDER BY lamport ASC, wall_time ASC, event_id ASC
      LIMIT ?
    `);

    return statement.all(limit).map((row) => this.mapRow(row as EventRow));
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

  public close(): void {
    if (this.closed) {
      return;
    }

    this.db.close();
    this.closed = true;
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

function isSameStoredEvent(row: EventRow, event: PicoEvent, payloadJson: string): boolean {
  return row.event_id === event.eventId
    && row.device_id === event.deviceId
    && row.session_id === (event.sessionId ?? null)
    && row.lamport === event.lamport
    && row.wall_time === event.wallTime
    && row.type === event.type
    && row.stream === event.stream
    && row.payload_json === payloadJson
    && row.signature === (event.signature ?? null);
}
