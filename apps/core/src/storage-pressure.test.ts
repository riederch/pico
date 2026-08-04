import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { EventStore } from './event-store.js';

const tempDirs: string[] = [];
const stores: EventStore[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) {
    store.close();
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** A disk whose free space the test drives directly. */
function openStore(available: { bytes: number }): EventStore {
  const dir = mkdtempSync(join(tmpdir(), 'pico-storage-pressure-'));
  tempDirs.push(dir);
  const store = new EventStore(join(dir, 'pico.sqlite'), {
    availableBytes: () => available.bytes,
    storageReserveBytes: 1_000,
  });
  stores.push(store);
  return store;
}

let lamport = 0;

function event(type: string, eventId: string) {
  lamport += 1;
  return {
    eventId,
    deviceId: 'pico-core',
    lamport,
    wallTime: new Date(Date.parse('2026-09-01T09:00:00.000Z') + lamport).toISOString(),
    type,
    stream: 'home',
    payload: type === 'memory.tombstone'
      ? { memoryItemId: 'mem-1', privacyDomain: 'domain-private', reason: 'retention' }
      : {},
  } as never;
}

describe('ADR 0119 Q1/Q2 resource exhaustion posture', () => {
  it('refuses a creating write at the floor while a tombstone still commits', () => {
    const available = { bytes: 5_000 };
    const store = openStore(available);

    // Above the floor everything works.
    expect(store.storagePressure()).toBe('normal');
    expect(store.append(event('memory.recorded', 'event_normal'))).toBe('inserted');

    // Fill to the floor. Creating writes fail closed; the protective path
    // keeps the room it needs to commit and checkpoint, which is the whole
    // reason the refusal happens while there is still space.
    available.bytes = 999;
    expect(store.storagePressure()).toBe('reserved');
    expect(store.append(event('memory.recorded', 'event_refused')))
      .toBe('refused_storage_pressure');
    expect(store.append(event('memory.tombstone', 'event_tombstone')))
      .toBe('inserted');

    // A refusal is a refusal, not a partial write.
    const ids = store.list(100).map((stored) => stored.eventId);
    expect(ids).toContain('event_tombstone');
    expect(ids).not.toContain('event_refused');
  });

  it('keeps every protective path alive in reserved', () => {
    const available = { bytes: 999 };
    const store = openStore(available);
    expect(store.storagePressure()).toBe('reserved');

    // A full disk that blocks a revocation has converted a resource problem
    // into a security problem, so each of these has to get through.
    for (const [index, type] of [
      'memory.tombstone',
      'memory.domain_shredded',
      'home.domain_read_revoked',
      'home.share_envelope_removed',
      'home.device_recovery_vetoed',
      'home.identity_root_rotation_vetoed',
      'auth.sessions_revoked',
      'auth.operator_reset',
      'home.reset',
    ].entries()) {
      expect(store.append(event(type, `event_protective_${index}`)))
        .toBe('inserted');
    }
  });

  it('stops everything that writes once the reserve itself is gone', () => {
    const available = { bytes: 0 };
    const store = openStore(available);
    expect(store.storagePressure()).toBe('exhausted');
    // Letting a protective write through here would produce a torn write,
    // not a rescue: this is the state the reserve exists to prevent.
    expect(store.append(event('memory.tombstone', 'event_exhausted')))
      .toBe('refused_storage_pressure');
  });

  it('treats an unreadable reading as no room, and no reading as a dev host', () => {
    const unreadable = openStore({ bytes: Number.NaN });
    expect(unreadable.storagePressure()).toBe('exhausted');

    // A store with no free-space source is a development host, which this ADR
    // scopes itself against rather than protecting.
    const dir = mkdtempSync(join(tmpdir(), 'pico-storage-pressure-dev-'));
    tempDirs.push(dir);
    const development = new EventStore(join(dir, 'pico.sqlite'));
    stores.push(development);
    expect(development.storagePressure()).toBe('normal');
    expect(development.append(event('memory.recorded', 'event_dev')))
      .toBe('inserted');
  });
});
