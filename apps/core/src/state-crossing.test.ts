import { mkdtempSync, rmSync } from 'node:fs';
import sodium from 'libsodium-wrappers-sumo';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { picoStateCrossedEventType } from '@pico/protocol/state-crossing';
import { EventStore } from './event-store.js';
import { crossPicoStateBoundary } from './state-crossing.js';
import { KeyStore } from './key-store.js';
import { MemoryContentCrypto } from './memory-content-crypto.js';
import { shredDomainWithAudit } from './domain-shred.js';

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

describe('ADR 0071 - what a crossing writes is what a shred can reach (B254)', () => {
  /**
   * Befund B254. Diese Datei weist eine Kreuzung ohne Domäne ab und begründet
   * es mit *„material a shred could not reach"* - und schrieb danach selbst
   * Material, das ein Shred nicht erreicht: die Haltung fiel auf
   * `plaintext_foundation` zurück, auch wenn der Store einen Schlüssel hatte.
   *
   * Gemessen bei eingeschalteter Verschlüsselung: nach einem Krypto-Shred
   * derselben Domäne gab die API die behaltene Antwort weiter heraus. Genau
   * der Weg, auf dem ein Mensch eine Rückrufantwort *behält*.
   */
  async function openedWithCrypto(): Promise<EventStore> {
    await sodium.ready;
    const dir = mkdtempSync(join(tmpdir(), 'pico-crossing-sealed-'));
    dirs.push(dir);
    const store = await EventStore.open(join(dir, 'pico.sqlite'), {
      memoryCrypto: new MemoryContentCrypto(sodium, new KeyStore(join(dir, 'keys'))),
    });
    stores.push(store);
    return store;
  }

  it('seals what it writes when the store holds a key, so a shred reaches it', async () => {
    const store = await openedWithCrypto();
    const { result } = crossing(store, { memoryItemId: 'mem_sealed_crossing' });
    expect(result.ok).toBe(true);

    const item = store.memory().getInDomain('mem_sealed_crossing', 'domain-private');
    expect(item?.contentPosture).toBe('domain_encrypted');
    expect(item?.content).toBe('You parked on Bergstrasse.');

    shredDomainWithAudit(
      store.memory(),
      () => undefined,
      { privacyDomain: 'domain-private' },
      () => 0,
      () => 0,
    );
    // Der Schlüssel ist weg, also sind es die Worte: das ist, was ein
    // Krypto-Shred bedeutet, und vorher galt es für diesen Weg nicht.
    expect(store.memory().getInDomain('mem_sealed_crossing', 'domain-private')?.content)
      .toBeUndefined();
  });

  it('stays plaintext where there is no key, because keys would protect nothing', async () => {
    /**
     * Der von ADR 0070 beschriebene Foundation-Zustand. Die Shred-Route weist
     * hier ohnehin ab - *„destroying keys would protect nothing"* -, und ein
     * Store ohne Anbieter kann gar nicht verschlüsseln.
     */
    const store = await opened();
    const { result } = crossing(store, { memoryItemId: 'mem_plain_crossing' });
    expect(result.ok).toBe(true);
    expect(store.memory().getInDomain('mem_plain_crossing', 'domain-private')?.contentPosture)
      .toBe('plaintext_foundation');
  });
});

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

describe('ADR 0126 P3 - who released it, checked rather than believed', () => {
  it('records a presence this identity has, and drops one it does not', async () => {
    /**
     * A device can only ever name one of its own identity's presences: the
     * request is authenticated as that identity and the lookup is scoped to
     * it. Inventing a value would put a device in an audit trail that never
     * said it was there, so an unknown name is dropped rather than recorded.
     */
    const store = await opened();
    store.picoPresenceRegistry().announce({
      picoIdentityFingerprintHex: 'a'.repeat(64),
      announcement: {
        schema: 'pico.presence.v1',
        presenceId: 'device-known01',
        presenceType: 'desktop_companion',
        affordances: ['display'],
      },
      at: '2026-08-17T09:00:00.000Z',
    });
    const known = store.picoPresenceRegistry()
      .forIdentity('a'.repeat(64), Date.parse('2026-08-17T09:00:01.000Z'));
    expect(known.map((presence) => presence.presenceId)).toEqual(['device-known01']);
    expect(store.picoPresenceRegistry()
      .forIdentity('b'.repeat(64), Date.parse('2026-08-17T09:00:01.000Z'))).toEqual([]);
  });
});
