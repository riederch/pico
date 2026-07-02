import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import Database from 'better-sqlite3';
import type { PicoEvent } from '@pico/protocol';

export class EventStore {
  private readonly db: Database.Database;

  public constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.db = new Database(databasePath);
    this.db.pragma('journal_mode = WAL');
    this.migrate();
  }

  public append(event: PicoEvent): void {
    const statement = this.db.prepare(`
      INSERT OR IGNORE INTO pico_event (
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
      JSON.stringify(event.payload),
      event.signature ?? null,
      new Date().toISOString(),
    );
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
    `);
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
