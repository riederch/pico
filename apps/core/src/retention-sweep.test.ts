import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { LamportClock } from '@pico/sync';
import { afterEach, describe, expect, it } from 'vitest';
import { EventFactory } from './event-factory.js';
import { EventStore } from './event-store.js';
import type { MemoryStore } from './memory-store.js';
import type { RetentionPolicyStore } from './retention-policy-store.js';
import { RetentionSweeper, type AppendRetentionTombstone } from './retention-sweep.js';

const DAY_MS = 86_400_000;
const tempDirs: string[] = [];
const stores: EventStore[] = [];

interface Harness {
  store: EventStore;
  memory: MemoryStore;
  policies: RetentionPolicyStore;
  databasePath: string;
}

function openHarness(): Harness {
  const dir = mkdtempSync(join(tmpdir(), 'pico-retention-sweep-test-'));
  tempDirs.push(dir);
  const databasePath = join(dir, 'pico.sqlite');
  const store = new EventStore(databasePath);
  stores.push(store);
  return { store, memory: store.memory(), policies: store.retentionPolicies(), databasePath };
}

function createItem(memory: MemoryStore, memoryItemId: string, retentionPolicyRef?: string): void {
  memory.create({
    memoryItemId,
    privacyDomain: 'domain-private',
    owner: 'pico-owner',
    controller: 'pico-owner',
    contentType: 'text/plain',
    content: `content of ${memoryItemId}`,
    ...(retentionPolicyRef === undefined ? {} : { retentionPolicyRef }),
  });
}

function recordingAppend(): { append: AppendRetentionTombstone; reasons: string[] } {
  const reasons: string[] = [];
  return {
    reasons,
    append: ({ reason }) => {
      reasons.push(reason);
    },
  };
}

afterEach(() => {
  for (const store of stores.splice(0)) {
    store.close();
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('RetentionSweeper', () => {
  it('expires only aged delete_after_max_age items and keeps everything else (fail-safe)', () => {
    const { memory, policies } = openHarness();
    policies.create({ retentionPolicyId: 'ret-30', displayName: '30d', mode: 'delete_after_max_age', maxAgeDays: 30 });
    policies.create({ retentionPolicyId: 'ret-100', displayName: '100d', mode: 'delete_after_max_age', maxAgeDays: 100 });
    policies.create({ retentionPolicyId: 'keep', displayName: 'keep', mode: 'keep_until_deleted' });

    createItem(memory, 'mem-expire', 'ret-30');
    createItem(memory, 'mem-young', 'ret-100');
    createItem(memory, 'mem-keep', 'keep');
    createItem(memory, 'mem-dangling', 'missing-policy');
    createItem(memory, 'mem-noref');

    const { append, reasons } = recordingAppend();
    // Sweep 40 days in the future: only the 30-day policy has elapsed.
    const sweeper = new RetentionSweeper(memory, policies, append, { now: () => new Date(Date.now() + 40 * DAY_MS) });
    const result = sweeper.sweep();

    expect(result).toEqual({ scanned: 4, expired: 1, kept: 2, unresolved: 1 });
    expect(reasons).toEqual(['retention:ret-30']);

    expect(memory.getInDomain('mem-expire', 'domain-private')?.deletionState).toBe('tombstoned');
    expect(memory.getInDomain('mem-expire', 'domain-private')?.content).toBeUndefined();
    expect(memory.getInDomain('mem-young', 'domain-private')?.deletionState).toBe('active');
    expect(memory.getInDomain('mem-keep', 'domain-private')?.deletionState).toBe('active');
    expect(memory.getInDomain('mem-dangling', 'domain-private')?.deletionState).toBe('active');
    // An item with no policy reference is never a candidate.
    expect(memory.getInDomain('mem-noref', 'domain-private')?.content).toBe('content of mem-noref');
  });

  it('is idempotent: a second sweep expires nothing new', () => {
    const { memory, policies } = openHarness();
    policies.create({ retentionPolicyId: 'ret-1', displayName: '1d', mode: 'delete_after_max_age', maxAgeDays: 1 });
    createItem(memory, 'mem-1', 'ret-1');

    const { append } = recordingAppend();
    const sweeper = new RetentionSweeper(memory, policies, append, { now: () => new Date(Date.now() + 5 * DAY_MS) });

    expect(sweeper.sweep().expired).toBe(1);
    expect(sweeper.sweep()).toEqual({ scanned: 0, expired: 0, kept: 0, unresolved: 0 });
  });

  it('keeps a malformed timestamp (fail-safe) and honours the batch cap', () => {
    const { memory, policies, databasePath } = openHarness();
    policies.create({ retentionPolicyId: 'ret-1', displayName: '1d', mode: 'delete_after_max_age', maxAgeDays: 1 });
    createItem(memory, 'mem-a', 'ret-1');
    createItem(memory, 'mem-b', 'ret-1');
    createItem(memory, 'mem-c', 'ret-1');

    // Corrupt one item's timestamp; it must be kept, never deleted on ambiguity.
    const raw = new Database(databasePath);
    raw.prepare("UPDATE memory_item SET created_at = 'not-a-date' WHERE memory_item_id = 'mem-a'").run();
    raw.close();

    const { append } = recordingAppend();
    const capped = new RetentionSweeper(memory, policies, append, { now: () => new Date(Date.now() + 5 * DAY_MS), maxDeletionsPerSweep: 1 });
    const first = capped.sweep();
    expect(first.expired).toBe(1);
    expect(first.unresolved).toBe(1); // mem-a malformed timestamp

    // The second valid item is still there and gets expired on the next sweep.
    const second = capped.sweep();
    expect(second.expired).toBe(1);
    expect(memory.getInDomain('mem-a', 'domain-private')?.deletionState).toBe('active');
  });

  it('writes a restore-proof tombstone through the event log', () => {
    const { store, memory, policies, databasePath } = openHarness();
    policies.create({ retentionPolicyId: 'ret-1', displayName: '1d', mode: 'delete_after_max_age', maxAgeDays: 1 });
    createItem(memory, 'mem-1', 'ret-1');

    const factory = new EventFactory(new LamportClock(store.maxLamport()));
    const append: AppendRetentionTombstone = ({ memoryItemId, privacyDomain, reason }) => {
      store.append(factory.create({ deviceId: 'pico-core', type: 'memory.tombstone', payload: { memoryItemId, privacyDomain, reason } }));
    };
    new RetentionSweeper(memory, policies, append, { now: () => new Date(Date.now() + 5 * DAY_MS) }).sweep();
    expect(memory.getInDomain('mem-1', 'domain-private')?.deletionState).toBe('tombstoned');

    // Simulate a stale restore that resurrects the item as active with content.
    const raw = new Database(databasePath);
    raw.prepare("UPDATE memory_item SET deletion_state = 'active', content = 'resurrected' WHERE memory_item_id = 'mem-1'").run();
    raw.close();

    // The retention tombstone lives in the append-only log, so reconciliation re-enforces it.
    expect(store.reconcileMemoryTombstones()).toEqual({ enforced: 1 });
    expect(memory.getInDomain('mem-1', 'domain-private')?.deletionState).toBe('tombstoned');
    expect(memory.getInDomain('mem-1', 'domain-private')?.content).toBeUndefined();
  });

  it('refuses to delete against an implausible wall clock (ADR 0120 N5)', () => {
    const { memory, policies } = openHarness();
    policies.create({ retentionPolicyId: 'ret-1', displayName: '1d', mode: 'delete_after_max_age', maxAgeDays: 1 });
    createItem(memory, 'mem-1', 'ret-1');
    const append: AppendRetentionTombstone = () => undefined;
    const floorMs = Date.now();

    // A clock jumped by a decade would expire items with years left, and
    // crypto-shredding cannot be undone.
    const refused = new RetentionSweeper(memory, policies, append, {
      now: () => new Date(floorMs + 10 * 365 * DAY_MS),
      anchorFloorMs: () => floorMs,
    }).sweep();
    expect(refused).toMatchObject({ expired: 0, refusedImplausibleClock: true });
    expect(memory.getInDomain('mem-1', 'domain-private')?.deletionState)
      .toBe('active');

    // Ordinary downtime is not nonsense: a week behind the floor still sweeps.
    const swept = new RetentionSweeper(memory, policies, append, {
      now: () => new Date(floorMs + 7 * DAY_MS),
      anchorFloorMs: () => floorMs,
    }).sweep();
    expect(swept.expired).toBe(1);
    expect(swept.refusedImplausibleClock).toBeUndefined();
  });
});
