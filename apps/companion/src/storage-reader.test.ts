import { describe, expect, it, vi } from 'vitest';
import {
  createPicoCompanionDueEntriesReader,
  createPicoCompanionDueEntryAcknowledger,
  createPicoCompanionStorageReader,
} from './storage-reader.js';

function linkClient(response: unknown): never {
  return { request: vi.fn(async () => response) } as never;
}

describe('ADR 0119 Q5 companion storage read', () => {
  it('asks the Home over the authenticated Link with no arguments', async () => {
    const client = { request: vi.fn(async () => ({
      outcome: 'ok',
      result: { state: 'reserved', causes: ['store_ceiling'] },
    })) };
    const read = createPicoCompanionStorageReader({ linkClient: client as never });

    expect(await read()).toEqual({ state: 'reserved', causes: ['store_ceiling'] });
    expect(client.request).toHaveBeenCalledWith('home.storage.condition.read', {});
  });

  it('names a refused read instead of reporting good health', async () => {
    // Returning `normal` on a failed read would turn a broken channel into a
    // reassurance, which is the silent comfort this gate exists against.
    const read = createPicoCompanionStorageReader({
      linkClient: linkClient({ outcome: 'sender_is_not_authorized', result: {} }),
    });

    await expect(read()).rejects.toThrow(
      /storage_condition_read_rejected:sender_is_not_authorized/u,
    );
  });

  it('refuses a reply that is not the declared shape', async () => {
    for (const result of [
      { state: 'reserved' },
      { state: 'nonsense', causes: [] },
      { state: 'normal', causes: ['low_disk', 'low_disk'] },
      { state: 'normal', causes: ['low_disk'], rows: 5 },
    ]) {
      const read = createPicoCompanionStorageReader({
        linkClient: linkClient({ outcome: 'ok', result }),
      });
      await expect(read(), JSON.stringify(result))
        .rejects.toThrow(/invalid_pico_home_storage_condition/u);
    }
  });
});

describe('ADR 0118 O1 companion due-entries read', () => {
  it('asks the Home over the authenticated Link with no arguments', async () => {
    const client = { request: vi.fn(async () => ({
      outcome: 'ok',
      result: { entries: [{ memoryItemId: 'mem_1', kind: 'reminder', dueAt: '2026-08-06T09:00:00.000Z' }], total: 1 },
    })) };
    const read = createPicoCompanionDueEntriesReader({ linkClient: client as never });

    expect((await read()).entries).toHaveLength(1);
    expect(client.request).toHaveBeenCalledWith('home.time_bound_entries.read', {});
  });

  it('names a refused read instead of reporting an empty list', async () => {
    // An empty list on a broken channel would tell the person nothing is
    // waiting when nobody actually looked.
    const read = createPicoCompanionDueEntriesReader({
      linkClient: linkClient({ outcome: 'sender_is_not_authorized', result: {} }),
    });
    await expect(read()).rejects.toThrow(/due_entries_read_rejected/u);
  });

  it('accepts a title the Home was allowed to send', async () => {
    // Present only where domain readership allowed it; the Home decides that,
    // and this side simply carries what it was given.
    const read = createPicoCompanionDueEntriesReader({
      linkClient: linkClient({
        outcome: 'ok',
        result: {
          entries: [{
            memoryItemId: 'mem_1',
            kind: 'reminder',
            dueAt: '2026-08-06T09:00:00.000Z',
            title: 'Call the dentist',
          }],
          total: 1,
        },
      }),
    });

    expect((await read()).entries[0]?.title).toBe('Call the dentist');
  });

  it('refuses a title that is empty, oversized or a stray field', async () => {
    // An empty title would render as a blank line the person has to interpret,
    // which is worse than the honest silence of no title at all.
    for (const entry of [
      { memoryItemId: 'mem_1', kind: 'reminder', dueAt: '2026-08-06T09:00:00.000Z', title: '   ' },
      { memoryItemId: 'mem_1', kind: 'reminder', dueAt: '2026-08-06T09:00:00.000Z', title: 'x'.repeat(201) },
      { memoryItemId: 'mem_1', kind: 'reminder', dueAt: '2026-08-06T09:00:00.000Z', privacyDomain: 'd' },
    ]) {
      const read = createPicoCompanionDueEntriesReader({
        linkClient: linkClient({ outcome: 'ok', result: { entries: [entry], total: 1 } }),
      });
      await expect(read(), JSON.stringify(entry))
        .rejects.toThrow(/invalid_pico_home_due_entries/u);
    }
  });
});

describe('ADR 0118 O1 - acknowledging one entry', () => {
  it('names the entry it was given and nothing else', async () => {
    // The Home takes the id from the argument and the device from the
    // authenticated principal, so this call discloses nothing the device was
    // not already told by the read.
    const client = { request: vi.fn(async () => ({
      outcome: 'ok',
      result: { memoryItemId: 'item_older', acknowledged: true },
    })) };
    const acknowledge = createPicoCompanionDueEntryAcknowledger({ linkClient: client as never });

    await acknowledge('item_older');

    expect(client.request).toHaveBeenCalledWith('home.time_bound_entry.acknowledge', {
      memoryItemId: 'item_older',
    });
  });

  it('names a refusal rather than swallowing it', async () => {
    // A silently failed acknowledgement looks exactly like one that worked,
    // and the entry comes back with nobody able to say why.
    const acknowledge = createPicoCompanionDueEntryAcknowledger({
      linkClient: linkClient({ outcome: 'unknown_operation', result: {} }),
    });

    await expect(acknowledge('item_older'))
      .rejects.toThrow(/due_entry_acknowledge_rejected:unknown_operation/u);
  });
});
