import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { picoStateCrossedEventType } from '@pico/protocol/state-crossing';
import { EventStore } from './event-store.js';
import { crossPicoStateBoundary } from './state-crossing.js';

/**
 * ADR 0126 P3. The door, and the property that makes it a door rather than a
 * convention: nothing crosses without a record, because crossing is what
 * writes the record.
 */
const dirs: string[] = [];
const stores: EventStore[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) {
    store.close();
  }
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

async function opened(): Promise<EventStore> {
  const dir = mkdtempSync(join(tmpdir(), 'pico-crossing-'));
  dirs.push(dir);
  const store = await EventStore.open(join(dir, 'pico.sqlite'), {});
  stores.push(store);
  return store;
}

function crossing(store: EventStore, over: Record<string, unknown> = {}) {
  const appended: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const result = crossPicoStateBoundary({
    store,
    kind: 'recall_answer',
    privacyDomain: 'domain-private',
    owner: 'pico-owner',
    controller: 'pico-owner',
    contentType: 'text/plain',
    content: 'You parked on Bergstrasse.',
    origin: 'own_pico',
    sourceCount: 2,
    deviceId: 'pico-core',
    memoryItemId: `mem_${Math.random().toString(16).slice(2)}`,
    appendEvent: (event) => appended.push(event),
    ...over,
  } as Parameters<typeof crossPicoStateBoundary>[0]);
  return { result, appended };
}

describe('ADR 0126 P3 - promoting is recording', () => {
  it('writes the item and the record in one act', async () => {
    const store = await opened();
    const { result, appended } = crossing(store);
    expect(result.ok).toBe(true);
    expect(appended).toHaveLength(1);
    expect(appended[0]?.type).toBe(picoStateCrossedEventType);
  });

  it('records what crossed and never what was crossed', async () => {
    // ADR 0129 SR6's shape, one layer up. An audit trail repeating the
    // content would be a second copy of it in a place with different deletion
    // rules.
    const store = await opened();
    const { result, appended } = crossing(store, { content: 'On Bergstrasse, bay 114.' });
    expect(result.ok).toBe(true);
    expect(JSON.stringify(appended[0]?.payload)).not.toContain('Bergstrasse');
    expect(appended[0]?.payload).toEqual({
      kind: 'recall_answer',
      privacyDomain: 'domain-private',
      memoryItemId: result.ok ? result.item.memoryItemId : '',
      sourceCount: 2,
    });
  });

  it('names the presence when one is known, and invents none when it is not', async () => {
    // Writing an invented id would put a device in the record that never said
    // it was there.
    const store = await opened();
    expect(crossing(store).appended[0]?.payload.presenceId).toBeUndefined();
    expect(crossing(store, { presenceId: 'phone-01' }).appended[0]?.payload.presenceId)
      .toBe('phone-01');
  });

  it('refuses material a shred could not reach', async () => {
    // The first of ADR 0129's five places, asked at the boundary: a shred
    // reaches memory items by domain, so material landing without one would
    // be material a deletion somebody relied on would miss.
    const store = await opened();
    const { result, appended } = crossing(store, { privacyDomain: '   ' });
    expect(result).toEqual({ ok: false, refusal: 'crossing_has_no_domain' });
    // And nothing was recorded, because nothing crossed.
    expect(appended).toEqual([]);
  });

  it('refuses a crossing with nothing in it', async () => {
    const store = await opened();
    expect(crossing(store, { content: '  ' }).result)
      .toEqual({ ok: false, refusal: 'crossing_has_no_material' });
  });

  it('refuses a kind nobody declared', async () => {
    const store = await opened();
    expect(() => crossing(store, { kind: 'smuggled' }))
      .toThrow('invalid_pico_state_crossing_kind');
  });

  it('leaves no item behind when it refuses', async () => {
    const store = await opened();
    const memoryItemId = 'mem_refused_0001';
    crossing(store, { privacyDomain: '', memoryItemId });
    expect(store.memory().getInDomain(memoryItemId, 'domain-private')).toBeUndefined();
  });
});
