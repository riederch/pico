import { describe, expect, it, vi } from 'vitest';
import { createPicoCompanionStorageReader } from './storage-reader.js';

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
