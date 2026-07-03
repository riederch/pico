import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import type { PicoEvent } from '@pico/protocol';

export type AppendResult = 'inserted' | 'duplicate_same_payload' | 'duplicate_conflict';

export class EventStore {
  private readonly db: Database.Database;

  public constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.db = new Database(databasePath);
    this.db.pragma('journal_mode = WAL');
    this.migrate();
  }

  public append(event: PicoEvent): AppendResult {
    const payloadJson = JSON.stringify(event.payload);
    const existing = this.db
      .prepare('SELECT payload_json FROM pico_event WHERE event_id = ?')
      .get(event.eventId) as { payload_json: string } | undefined;

    if (existing) {
      return existing.payload_json === payloadJson ? 'duplicate_same_payload' : 'duplicate_conflict';
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
    const statement = this.db.prepare(`
      SELECT *
      FROM pico_event
      ORDER BY lamport ASC, wall_time ASC, event_id ASC
      LIMIT ?
    `);

    return statement.all(limit).map((row) => this.mapRow(row as EventRow));
  }

  public maxLamport(): number {
    const row = this.db.prepare('SELECT MAX(lamport) AS max_lamport FROM pico_event').get() as { max_lamport: number | null };
    return row.max_lamport ?? 0;
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migration (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS pico_event (
        event_id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        session_id TEXT NULL,
        lamport INTEGER NOT NULL,
        wall_time TEXT NOT NULL,
        type TEXT NOT NULL,
        stream TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        signature TEXT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_pico_event_lamport
      ON pico_event (lamport, wall_time, event_id);

      CREATE INDEX IF NOT EXISTS idx_pico_event_stream
      ON pico_event (stream, lamport);

      CREATE INDEX IF NOT EXISTS idx_pico_event_type
      ON pico_event (type, lamport);

      CREATE INDEX IF NOT EXISTS idx_pico_event_device
      ON pico_event (device_id, lamport);
    `);

    this.db.prepare(`
      INSERT OR IGNORE INTO schema_migration (id, applied_at)
      VALUES (?, ?)
    `).run('0001_event_store', new Date().toISOString());
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