import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultPicoStoreCeilingRows } from '@pico/protocol';
import { EventStore } from './event-store.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

async function openStore(
  options: Parameters<typeof EventStore.open>[1] = {},
): Promise<{ store: EventStore; databasePath: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'pico-store-ceiling-'));
  tempDirs.push(dir);
  const databasePath = join(dir, 'pico.sqlite');
  return { store: await EventStore.open(databasePath, options), databasePath };
}

function event(index: number, type = 'message.created'): Parameters<EventStore['append']>[0] {
  return {
    eventId: `event-${index}`,
    deviceId: 'desktop-dev',
    lamport: index + 1,
    wallTime: new Date(1_700_000_000_000 + index).toISOString(),
    type,
    stream: 'default',
    payload: { role: 'user', text: `entry ${index}` },
  } as Parameters<EventStore['append']>[0];
}

describe('ADR 0119 Q5 durable ceilings', () => {
  it('refuses a creating write at the ceiling and trims nothing', async () => {
    const { store } = await openStore({ storeCeilingRows: { event_log: 3 } });

    try {
      for (let index = 0; index < 3; index += 1) {
        expect(store.append(event(index))).toBe('inserted');
      }
      expect(store.storageCondition().state).toBe('reserved');

      const before = store.list(100).length;
      expect(store.append(event(3))).toBe('refused_storage_pressure');

      // The load-bearing half of this gate: a ceiling refuses, it never trims.
      // ADR 0014 made the log append-only for reasons resource pressure does
      // not overturn, and an expiry that quietly forgets signed evidence is a
      // worse failure than a refusal.
      expect(store.list(100)).toHaveLength(before);
      expect(store.list(100).some((stored) => stored.eventId === 'event-3')).toBe(false);
    } finally {
      store.close();
    }
  });

  it('keeps the protective paths alive at the ceiling', async () => {
    // Same posture as low disk, and for the same reason: a ceiling that blocked
    // a tombstone would leave the person unable to make room by the one route
    // still open to them.
    const { store } = await openStore({ storeCeilingRows: { event_log: 2 } });

    try {
      expect(store.append(event(0))).toBe('inserted');
      expect(store.append(event(1))).toBe('inserted');
      expect(store.storageCondition().state).toBe('reserved');

      expect(store.append(event(2))).toBe('refused_storage_pressure');
      expect(store.append(event(3, 'memory.tombstone'))).toBe('inserted');
      expect(store.append(event(4, 'home.domain_read_revoked'))).toBe('inserted');
    } finally {
      store.close();
    }
  });

  it('names the reached store and the action that clears it', async () => {
    const { store } = await openStore({ storeCeilingRows: { event_log: 1 } });

    try {
      expect(store.append(event(0))).toBe('inserted');
      const condition = store.storageCondition();

      expect(condition.state).toBe('reserved');
      expect(condition.reasons).toEqual([{
        cause: 'store_ceiling',
        remedy: 'reduce_stored_data',
        store: 'event_log',
        rows: 1,
        ceilingRows: 1,
      }]);
    } finally {
      store.close();
    }
  });

  it('unblocks on the next attempt once rows are actually gone', async () => {
    // Insert counts drift upward on purpose - deletions are not counted, so a
    // ceiling can be reached on a number that reality has already left behind.
    // The resync at the boundary is what keeps that from being permanent: a
    // person who made room is unblocked by their next attempt, not by a sweep
    // an hour later.
    const { store, databasePath } = await openStore({ storeCeilingRows: { event_log: 3 } });

    try {
      for (let index = 0; index < 3; index += 1) {
        expect(store.append(event(index))).toBe('inserted');
      }
      expect(store.append(event(3))).toBe('refused_storage_pressure');

      // Rows removed behind the counter's back through a second connection -
      // which is what an uncounted deletion path looks like from here.
      const outside = new Database(databasePath);
      outside.prepare('DELETE FROM pico_event WHERE event_id = ?').run('event-0');
      outside.close();

      expect(store.storageCondition().state).toBe('normal');
      expect(store.append(event(3))).toBe('inserted');
    } finally {
      store.close();
    }
  });

  it('reports the ceiling from a count taken at open, not only from this run', async () => {
    // A restart must not forgive a full store. The counter seeds from the
    // table rather than from zero, so rows written by a previous process are
    // still there as far as the ceiling is concerned.
    const dir = mkdtempSync(join(tmpdir(), 'pico-store-ceiling-restart-'));
    tempDirs.push(dir);
    const databasePath = join(dir, 'pico.sqlite');

    const first = await EventStore.open(databasePath, { storeCeilingRows: { event_log: 2 } });
    expect(first.append(event(0))).toBe('inserted');
    expect(first.append(event(1))).toBe('inserted');
    first.close();

    const second = await EventStore.open(databasePath, { storeCeilingRows: { event_log: 2 } });
    try {
      expect(second.storageCondition().state).toBe('reserved');
      expect(second.append(event(2))).toBe('refused_storage_pressure');
    } finally {
      second.close();
    }
  });

  it('refuses a ceiling that would not bound anything', async () => {
    for (const ceilingRows of [0, -1]) {
      await expect(openStore({ storeCeilingRows: { event_log: ceilingRows } }))
        .rejects.toThrow(/invalid_pico_store_ceiling/u);
    }
  });

});

describe('ADR 0119 Q5 with ADR 0137 IN1 - the attachment ceiling', () => {
  const manifest = (identifier: string) => ({
    identifier,
    kind: 'library' as const,
    slots: ['memory_item' as const],
    coverage: ['knowledge_base'],
    privacyDomain: 'domain_private',
  });

  it('refuses a new attachment at the ceiling, naming the store', async () => {
    // The open instance list is what makes this ceiling the guard rather than
    // an enumeration: nothing states ahead of time how many suppliers exist.
    const { store } = await openStore({ storeCeilingRows: { supplier_attachment: 2 } });
    try {
      store.attachPicoSupplier({ manifest: manifest('rchkb'), attachedAt: '2026-08-11T09:00:00.000Z' });
      store.attachPicoSupplier({ manifest: manifest('wwgkb'), attachedAt: '2026-08-11T09:00:00.000Z' });

      expect(() => store.attachPicoSupplier({
        manifest: manifest('drittes'),
        attachedAt: '2026-08-11T09:00:00.000Z',
      })).toThrow('pico_supplier_attachment_ceiling_reached');

      // Refused, not trimmed: the two that were there are untouched.
      expect(store.picoSupplierAttachments().map((a) => a.identifier))
        .toEqual(['rchkb', 'wwgkb']);
    } finally {
      store.close();
    }
  });

  it('still lets an existing attachment be corrected at the ceiling', async () => {
    // Re-attaching replaces a row rather than adding one. Refusing it would
    // block a person at exactly the moment they are trying to fix something.
    const { store } = await openStore({ storeCeilingRows: { supplier_attachment: 2 } });
    try {
      store.attachPicoSupplier({ manifest: manifest('rchkb'), attachedAt: '2026-08-11T09:00:00.000Z' });
      store.attachPicoSupplier({ manifest: manifest('wwgkb'), attachedAt: '2026-08-11T09:00:00.000Z' });

      expect(() => store.attachPicoSupplier({
        manifest: { ...manifest('rchkb'), coverage: ['knowledge_base', 'finanz'] },
        attachedAt: '2026-08-11T10:00:00.000Z',
      })).not.toThrow();
      expect(store.picoSupplierAttachment('rchkb')?.coverage)
        .toEqual(['knowledge_base', 'finanz']);
    } finally {
      store.close();
    }
  });

  it('unblocks the next attempt after a detach, without waiting for a sweep', async () => {
    // The insert count drifts upward by design, so a reached ceiling is
    // re-counted before it is believed. Without that, detaching to make room
    // would leave the person refused on a number that is no longer true.
    const { store } = await openStore({ storeCeilingRows: { supplier_attachment: 2 } });
    try {
      store.attachPicoSupplier({ manifest: manifest('rchkb'), attachedAt: '2026-08-11T09:00:00.000Z' });
      store.attachPicoSupplier({ manifest: manifest('wwgkb'), attachedAt: '2026-08-11T09:00:00.000Z' });
      expect(() => store.attachPicoSupplier({
        manifest: manifest('drittes'),
        attachedAt: '2026-08-11T09:00:00.000Z',
      })).toThrow('pico_supplier_attachment_ceiling_reached');

      store.detachPicoSupplier('wwgkb');

      expect(() => store.attachPicoSupplier({
        manifest: manifest('drittes'),
        attachedAt: '2026-08-11T11:00:00.000Z',
      })).not.toThrow();
    } finally {
      store.close();
    }
  });

  it('names the store, the count and the limit when it is reached', async () => {
    // ADR 0119 Q5's posture: told with the numbers, so a surface can say which
    // store filled rather than reporting an unexplained refusal.
    const { store } = await openStore({ storeCeilingRows: { supplier_attachment: 1 } });
    try {
      store.attachPicoSupplier({ manifest: manifest('rchkb'), attachedAt: '2026-08-11T09:00:00.000Z' });
      expect(store.storageCondition().reasons).toContainEqual({
        cause: 'store_ceiling',
        remedy: 'reduce_stored_data',
        store: 'supplier_attachment',
        rows: 1,
        ceilingRows: 1,
      });
    } finally {
      store.close();
    }
  });

  it('carries a default sized against a runaway rather than against use', async () => {
    // A thousand is roughly twenty times the largest estate anyone would
    // attach by hand, and four orders of magnitude below the record stores,
    // because every row here is a person deciding something.
    expect(defaultPicoStoreCeilingRows.supplier_attachment).toBe(1_000);
    expect(defaultPicoStoreCeilingRows.supplier_attachment)
      .toBeLessThan(defaultPicoStoreCeilingRows.observation);
  });
});
