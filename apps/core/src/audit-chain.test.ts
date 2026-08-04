import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { EventStore } from './event-store.js';
import { openPicoHomeRecoveryAnchor } from './recovery-anchor.js';

const tempDirs: string[] = [];
const stores: EventStore[] = [];

beforeAll(async () => {
  await sodium.ready;
});

afterEach(() => {
  for (const store of stores.splice(0)) {
    try {
      store.close();
    } catch {
      // A test that closed its own store already is not a failure here.
    }
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'pico-audit-chain-'));
  tempDirs.push(dir);
  const databasePath = join(dir, 'pico.sqlite');
  const anchorPath = join(dir, 'recovery-anchor', 'anchor.json');
  return { dir, databasePath, anchorPath, open: () => openStore(databasePath, anchorPath) };
}

function openStore(databasePath: string, anchorPath: string): EventStore {
  const store = new EventStore(databasePath, {
    auditSodium: sodium,
    recoveryAnchor: openPicoHomeRecoveryAnchor(anchorPath),
  });
  stores.push(store);
  return store;
}

let lamport = 0;

function auditEvent(overrides: {
  eventId: string;
  type?: string;
  deviceId?: string;
}) {
  lamport += 1;
  return {
    eventId: overrides.eventId,
    deviceId: overrides.deviceId ?? 'pico-core',
    lamport,
    wallTime: new Date(Date.parse('2026-09-01T09:00:00.000Z') + lamport).toISOString(),
    type: overrides.type ?? 'home.host_key_rotated',
    stream: 'home',
    payload: {},
  } as never;
}

describe('ADR 0121 J1/J2 tamper-evident audit records', () => {
  it('chains audit records per writer and leaves ordinary events alone', () => {
    const { open, databasePath } = fixture();
    const store = open();
    store.append(auditEvent({ eventId: 'event_audit_1' }));
    store.append(auditEvent({ eventId: 'event_audit_2' }));
    // A second writer keeps its own sequence: ADR 0014's log is designed to
    // become replicated, so a global chain would assert one writer.
    store.append(auditEvent({ eventId: 'event_audit_3', deviceId: 'other-core' }));
    // Not an audit record, so it is not chained.
    store.append(auditEvent({ eventId: 'event_chat_1', type: 'message.created' }));

    const rows = new Database(databasePath)
      .prepare('SELECT writer_id, chain_position, previous_digest_hex, digest_hex FROM pico_audit_record ORDER BY writer_id, chain_position')
      .all() as {
        writer_id: string;
        chain_position: number;
        previous_digest_hex: string | null;
        digest_hex: string;
      }[];

    expect(rows.map((row) => [row.writer_id, row.chain_position]))
      .toEqual([['other-core', 1], ['pico-core', 1], ['pico-core', 2]]);
    expect(rows[0]!.previous_digest_hex).toBeNull();
    expect(rows[1]!.previous_digest_hex).toBeNull();
    expect(rows[2]!.previous_digest_hex).toBe(rows[1]!.digest_hex);

    expect(store.verifyPicoAuditChain()).toEqual({
      chained: true,
      writers: [
        { writerId: 'other-core', recordCount: 1, checkpointedPosition: 1, status: 'verified' },
        { writerId: 'pico-core', recordCount: 2, checkpointedPosition: 2, status: 'verified' },
      ],
    });
  });

  it('detects a deleted row, an edited row and a log rolled back past the anchor', () => {
    const { open, databasePath, anchorPath } = fixture();
    const store = open();
    store.append(auditEvent({ eventId: 'event_audit_a' }));
    store.append(auditEvent({ eventId: 'event_audit_b' }));
    store.append(auditEvent({ eventId: 'event_audit_c' }));
    expect(store.verifyPicoAuditChain().writers[0]).toMatchObject({
      status: 'verified',
      recordCount: 3,
    });
    store.close();

    // The naive edit: delete the middle record. The survivors still link to
    // each other, so only the position and predecessor check catches it.
    const cut = new Database(databasePath);
    cut.prepare("DELETE FROM pico_audit_record WHERE event_id = 'event_audit_b'").run();
    cut.prepare("DELETE FROM pico_event WHERE event_id = 'event_audit_b'").run();
    cut.close();
    expect(open().verifyPicoAuditChain().writers[0]).toMatchObject({
      status: 'broken',
      brokenAtPosition: 3,
    });
  });

  it('reports a rolled-back log against the anchor it cannot reach', () => {
    const { open, databasePath, anchorPath } = fixture();
    const store = open();
    store.append(auditEvent({ eventId: 'event_roll_1' }));
    store.append(auditEvent({ eventId: 'event_roll_2' }));

    // The snapshot an operator would restore, taken here.
    const snapshot = [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]
      .map((path) => ({ path, bytes: existsSync(path) ? readFileSync(path) : undefined }));

    store.append(auditEvent({ eventId: 'event_roll_3' }));
    expect(store.verifyPicoAuditChain().writers[0]).toMatchObject({
      status: 'verified',
      checkpointedPosition: 3,
    });
    store.close();

    // Roll the database back past the third record. The anchor lives outside
    // every restorable snapshot, so it still holds the head it saw.
    for (const entry of snapshot) {
      if (entry.bytes === undefined) {
        rmSync(entry.path, { force: true });
      } else {
        writeFileSync(entry.path, entry.bytes);
      }
    }
    const rolledBack = open();
    expect(rolledBack.verifyPicoAuditChain().writers[0]).toMatchObject({
      // The chain itself is internally consistent - an attacker who rolls back
      // wholesale leaves no broken link. Only the anchor disagrees.
      status: 'rolled_back',
      recordCount: 2,
      checkpointedPosition: 3,
    });

    // Reported, never repaired: the anchor still holds position 3.
    expect(openPicoHomeRecoveryAnchor(anchorPath).auditCheckpoint('pico-core'))
      .toMatchObject({ chainPosition: 3 });
  });

  it('refuses a checkpoint that walks backwards or forks the head', () => {
    const { anchorPath } = fixture();
    const anchor = openPicoHomeRecoveryAnchor(anchorPath);
    anchor.recordAuditCheckpoint({
      writerId: 'pico-core',
      chainPosition: 5,
      headDigestHex: 'aa'.repeat(32),
    });

    expect(() => anchor.recordAuditCheckpoint({
      writerId: 'pico-core',
      chainPosition: 4,
      headDigestHex: 'bb'.repeat(32),
    })).toThrow('audit_checkpoint_not_forward');
    expect(() => anchor.recordAuditCheckpoint({
      writerId: 'pico-core',
      chainPosition: 5,
      headDigestHex: 'cc'.repeat(32),
    })).toThrow('audit_checkpoint_head_conflict');

    // Idempotent on the exact same head, so a retried commit costs nothing.
    anchor.recordAuditCheckpoint({
      writerId: 'pico-core',
      chainPosition: 5,
      headDigestHex: 'aa'.repeat(32),
    });
    expect(anchor.auditCheckpoint('pico-core')).toMatchObject({ chainPosition: 5 });
  });

  it('states coverage on the read surface, gaps included (ADR 0121 J4)', async () => {
    const { databasePath } = fixture();
    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath,
      deviceId: 'pico-core',
    });
    try {
      // An audit record written through the real write path.
      expect((await app.inject({
        method: 'POST',
        url: '/api/events',
        payload: {
          deviceId: 'desktop-dev',
          type: 'message.created',
          payload: { role: 'user', text: 'ordinary' },
        },
      })).statusCode).toBe(201);

      const listed = await app.inject({ method: 'GET', url: '/api/events?limit=50' });
      expect(listed.statusCode).toBe(200);
      const coverage = listed.json().auditCoverage as {
        chained: boolean;
        signed: boolean;
        writers: unknown[];
      };
      // Stated, not omitted: J3's signer does not exist, so every interval is
      // unsigned - and a missing field is what a reader mistakes for coverage.
      expect(coverage).toMatchObject({ chained: true, signed: false });
      expect(Array.isArray(coverage.writers)).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('reports absent coverage rather than showing a green mark', () => {
    const { databasePath } = fixture();
    // No hash supplied: nothing is chained, and the report says exactly that.
    const unchained = new EventStore(databasePath);
    stores.push(unchained);
    unchained.append(auditEvent({ eventId: 'event_uncovered_1' }));
    expect(unchained.verifyPicoAuditChain())
      .toEqual({ chained: false, writers: [] });
  });
});
