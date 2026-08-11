import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LamportClock } from '@pico/sync';
import {
  buildPicoLibraryDerivation,
  picoLibraryPinCoversContent,
} from '@pico/protocol/library-pin';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { shredDomainWithAudit } from './domain-shred.js';
import { EventFactory } from './event-factory.js';
import { EventStore } from './event-store.js';
import { KeyStore } from './key-store.js';
import { MemoryContentCrypto } from './memory-content-crypto.js';

/**
 * ADR 0136 BR6. A library is attached, not held.
 *
 * Two claims are proved here and they pull in opposite directions, which is
 * why neither is safe to assume from the other:
 *
 * - **detaching deletes nothing** - what Pico concluded outlives the
 *   attachment it concluded it from, because stopping and forgetting are
 *   different acts (ADR 0129 SR6);
 * - **a domain shred reaches every derived item** - because there is no second
 *   place holding a copy of what was derived.
 *
 * Both follow from the same decision: the pin lives on the memory item rather
 * than in a store of its own. A derivation table would have needed its own
 * answer to ADR 0127's five questions, and would have been a second place a
 * shred had to remember to visit.
 */
const tempDirs: string[] = [];
const stores: EventStore[] = [];

const rchkb = Object.freeze({
  identifier: 'rchkb',
  kind: 'library' as const,
  slots: ['memory_item' as const],
  coverage: ['knowledge_base'],
  privacyDomain: 'domain_private',
});

const readAtCommit = { kind: 'commit' as const, value: 'a'.repeat(40) };

beforeAll(async () => {
  await sodium.ready;
});

afterEach(() => {
  for (const store of stores.splice(0)) {
    try {
      store.close();
    } catch {
      // Already closed by the test that opened it.
    }
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function openStore(label: string) {
  const dir = mkdtempSync(join(tmpdir(), `pico-library-${label}-`));
  tempDirs.push(dir);
  const keyStore = new KeyStore(join(dir, 'keys'));
  const crypto = new MemoryContentCrypto(sodium, keyStore);
  const store = new EventStore(join(dir, 'pico.sqlite'), { memoryCrypto: crypto });
  stores.push(store);
  return store;
}

function derive(
  store: EventStore,
  memoryItemId: string,
  privacyDomain: string,
  gitAttributes = '',
): void {
  const pin = readAtCommit;
  store.memory().create({
    memoryItemId,
    privacyDomain,
    owner: 'pico-owner',
    controller: 'pico-owner',
    contentType: 'text/plain',
    content: `passage ${memoryItemId}`,
    contentPosture: 'domain_encrypted',
    origin: 'external_content',
    derivedFrom: buildPicoLibraryDerivation({
      supplierIdentifier: 'rchkb',
      pin,
      pinCoversContent: picoLibraryPinCoversContent({ pin, gitAttributes }),
    }),
  });
}

describe('ADR 0136 BR6 - a derived item carries the pin it was read at', () => {
  it('stores the pin on the item and reads it back whole', () => {
    const store = openStore('pin');
    derive(store, 'mem_passage', 'domain-private');

    expect(store.memory().getInDomain('mem_passage', 'domain-private')?.derivedFrom)
      .toEqual({
        supplierIdentifier: 'rchkb',
        pin: readAtCommit,
        pinCoversContent: true,
      });
    store.close();
  });

  it('records that a commit did not cover the content when LFS is in play', () => {
    // The commit pins a pointer; the bytes live on a server with its own
    // availability. A derived item claiming the commit as full provenance
    // would be claiming more than the commit can carry.
    const store = openStore('lfs');
    derive(store, 'mem_pdf', 'domain-private', '*.pdf filter=lfs diff=lfs -text\n');

    expect(store.memory().getInDomain('mem_pdf', 'domain-private')?.derivedFrom)
      .toMatchObject({ pinCoversContent: false });
    store.close();
  });

  it('refuses to write a derivation missing its pin', () => {
    const store = openStore('nopin');
    expect(() => store.memory().create({
      memoryItemId: 'mem_bad',
      privacyDomain: 'domain-private',
      owner: 'pico-owner',
      controller: 'pico-owner',
      contentType: 'text/plain',
      content: 'passage',
      derivedFrom: { supplierIdentifier: 'rchkb' } as never,
    })).toThrow('pico_library_derivation_needs_pin');

    // Refused before anything was written, not repaired afterwards.
    expect(store.memory().getInDomain('mem_bad', 'domain-private')).toBeUndefined();
    store.close();
  });

  it('leaves an ordinary item with no derivation at all', () => {
    // The absence is a fact: NULL means "not a derivation", not "derived from
    // somewhere nobody recorded".
    const store = openStore('plain');
    store.memory().create({
      memoryItemId: 'mem_note',
      privacyDomain: 'domain-private',
      owner: 'pico-owner',
      controller: 'pico-owner',
      contentType: 'text/plain',
      content: 'a note the person wrote',
    });
    expect(store.memory().getInDomain('mem_note', 'domain-private')?.derivedFrom)
      .toBeUndefined();
    store.close();
  });
});

describe('ADR 0136 BR6 - detaching stops derivation and deletes nothing', () => {
  it('keeps every derived item, its content and its pin after the library is detached', () => {
    const store = openStore('detach');
    store.attachPicoSupplier({ manifest: rchkb, attachedAt: '2026-08-11T09:00:00.000Z' });
    derive(store, 'mem_passage', 'domain-private');

    store.detachPicoSupplier('rchkb');

    expect(store.picoSupplierAttachment('rchkb')).toBeUndefined();
    const survived = store.memory().getInDomain('mem_passage', 'domain-private');
    expect(survived?.content).toBe('passage mem_passage');
    // The pin survives too, which is the point: a passage that outlived its
    // attachment can still say which commit it came from.
    expect(survived?.derivedFrom).toEqual({
      supplierIdentifier: 'rchkb',
      pin: readAtCommit,
      pinCoversContent: true,
    });
    store.close();
  });
});

describe('ADR 0136 BR6 - a domain shred reaches every derived item', () => {
  it('destroys a derived item and an ordinary item identically', () => {
    // BR3's comparison shape, applied to the derived case: asserted identical
    // to each other rather than each on its own, because two separate
    // assertions could both pass while the core treated the two differently in
    // a way neither happened to look at.
    const store = openStore('shred');
    const factory = new EventFactory(new LamportClock(store.maxLamport()));

    derive(store, 'mem_derived', 'domain-private');
    store.memory().create({
      memoryItemId: 'mem_note',
      privacyDomain: 'domain-private',
      owner: 'pico-owner',
      controller: 'pico-owner',
      contentType: 'text/plain',
      content: 'passage mem_note',
      contentPosture: 'domain_encrypted',
    });
    derive(store, 'mem_other_domain', 'domain-work');

    const memory = store.memory();
    const read = (id: string, domain: string): string | undefined =>
      memory.getInDomain(id, domain)?.content;
    expect(read('mem_derived', 'domain-private')).toBe('passage mem_derived');

    shredDomainWithAudit(memory, ({ privacyDomain, removedKeyVersions }) => {
      store.append(factory.create({
        deviceId: 'pico-core',
        type: 'memory.domain_shredded',
        payload: { privacyDomain, removedKeyVersions },
      }));
    }, { privacyDomain: 'domain-private' });

    const derivedAfter = read('mem_derived', 'domain-private');
    const noteAfter = read('mem_note', 'domain-private');
    expect(derivedAfter).toBe(noteAfter);
    expect(derivedAfter).not.toBe('passage mem_derived');

    // Scoped to a domain rather than to a kind, which also shows the
    // comparison above can fail.
    expect(read('mem_other_domain', 'domain-work')).toBe('passage mem_other_domain');
    store.close();
  });

  it('reaches the pin as well as the content, because there is no second copy', () => {
    // The reason for columns rather than a table. A derivation store would have
    // been a second place a shred had to remember to visit, and forgetting it
    // would leave "rchkb at commit aaaa… said something here" standing after
    // the something was destroyed.
    const store = openStore('shred-pin');
    const factory = new EventFactory(new LamportClock(store.maxLamport()));
    derive(store, 'mem_derived', 'domain-private');

    shredDomainWithAudit(store.memory(), ({ privacyDomain, removedKeyVersions }) => {
      store.append(factory.create({
        deviceId: 'pico-core',
        type: 'memory.domain_shredded',
        payload: { privacyDomain, removedKeyVersions },
      }));
    }, { privacyDomain: 'domain-private' });

    const remaining = store.memory().getInDomain('mem_derived', 'domain-private');
    expect(remaining?.content).toBeUndefined();
    expect(remaining?.contentUnavailable).toBe('key_shredded');
    store.close();
  });
});
