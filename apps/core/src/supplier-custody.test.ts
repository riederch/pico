import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LamportClock } from '@pico/sync';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { shredDomainWithAudit } from './domain-shred.js';
import { EventFactory } from './event-factory.js';
import { EventStore } from './event-store.js';
import { KeyStore } from './key-store.js';
import { MemoryContentCrypto } from './memory-content-crypto.js';
import { intakePicoSupplierContent } from './supplier-intake.js';

/**
 * ADR 0136 BR3. Content that arrived through a slot is under the core's
 * custody like anything else it holds.
 *
 * The proof is ADR 0128 H4's and ADR 0127 M1's, for the same reason both use
 * it: "no supplier-specific handling" is not something a comment can assert.
 * Every test below runs a supplier-sourced item and an ordinary memory item
 * through the same core path and requires the two outcomes to be *identical*.
 * If the core ever grew a branch for supplier data, the outcomes would diverge
 * and one of these would fail.
 */
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
      // Already closed by the test that opened it.
    }
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function openEncryptedStore(label: string) {
  const dir = mkdtempSync(join(tmpdir(), `pico-supplier-custody-${label}-`));
  tempDirs.push(dir);
  const keyStore = new KeyStore(join(dir, 'keys'));
  const crypto = new MemoryContentCrypto(sodium, keyStore);
  const store = new EventStore(join(dir, 'pico.sqlite'), { memoryCrypto: crypto });
  stores.push(store);
  return store;
}

/** An ordinary memory item: the control. */
function createPlainItem(store: EventStore, memoryItemId: string, privacyDomain: string): void {
  store.memory().create({
    memoryItemId,
    privacyDomain,
    owner: 'pico-owner',
    controller: 'pico-owner',
    contentType: 'text/plain',
    content: `note ${memoryItemId}`,
    contentPosture: 'domain_encrypted',
  });
}

/** The same item, arrived through a slot. That is the whole difference. */
function createSuppliedItem(store: EventStore, memoryItemId: string, privacyDomain: string): void {
  const intake = intakePicoSupplierContent({
    slot: 'memory_item',
    supplierIdentifier: 'rchkb',
    contentType: 'text/plain',
    content: `note ${memoryItemId}`,
  });
  expect(intake.originClass).toBe('external_content');
  store.memory().create({
    memoryItemId,
    privacyDomain,
    owner: 'pico-owner',
    controller: 'pico-owner',
    contentType: intake.contentType,
    content: intake.content,
    contentPosture: 'domain_encrypted',
  });
}

describe('ADR 0136 BR3 - the core assigns the class, without asking', () => {
  it('labels everything crossing a slot as external content', () => {
    expect(intakePicoSupplierContent({
      slot: 'memory_item',
      supplierIdentifier: 'rchkb',
      contentType: 'text/plain',
      content: 'a passage',
    }).originClass).toBe('external_content');
  });

  it('gives a supplier no field in which to claim provenance', () => {
    // A supplier that could say `person_present` about a line from a
    // stranger's mail would perform the laundering step ADR 0117 X2 exists to
    // break, through the field designed to prevent it.
    expect(() => intakePicoSupplierContent({
      slot: 'memory_item',
      supplierIdentifier: 'rchkb',
      contentType: 'text/plain',
      content: 'a passage',
      originClass: 'person_present',
    })).toThrow('pico_supplier_cannot_declare_origin');
  });

  it('labels a person\'s own knowledge base as external content too', () => {
    // Not a judgement about the author: an admission about what the core can
    // verify. It cannot tell a sentence the person wrote from one they pasted.
    expect(intakePicoSupplierContent({
      slot: 'memory_item',
      supplierIdentifier: 'rchkb',
      contentType: 'text/markdown',
      content: 'my own note',
    }).originClass).toBe('external_content');
  });

  it('refuses a slot the core does not own', () => {
    expect(() => intakePicoSupplierContent({
      slot: 'event',
      supplierIdentifier: 'rchkb',
      contentType: 'text/plain',
      content: 'x',
    })).toThrow('pico_supplier_slot_not_listed');
  });

  it('refuses an undeclared extra field rather than dropping it', () => {
    expect(() => intakePicoSupplierContent({
      slot: 'memory_item',
      supplierIdentifier: 'rchkb',
      contentType: 'text/plain',
      content: 'x',
      trusted: true,
    })).toThrow('invalid_pico_supplier_offering');
  });
});

describe('ADR 0136 BR3 - supplied content is shredded by the core, with no supplier handling', () => {
  it('destroys a supplied item and an ordinary item identically', () => {
    const store = openEncryptedStore('shred');
    const factory = new EventFactory(new LamportClock(store.maxLamport()));

    createSuppliedItem(store, 'mem_supplied', 'domain-private');
    createPlainItem(store, 'mem_note', 'domain-private');
    createSuppliedItem(store, 'mem_other_domain', 'domain-work');

    const memory = store.memory();
    const read = (id: string, domain: string): string | undefined =>
      memory.getInDomain(id, domain)?.content;
    expect(read('mem_supplied', 'domain-private')).toBe('note mem_supplied');
    expect(read('mem_note', 'domain-private')).toBe('note mem_note');

    shredDomainWithAudit(memory, ({ privacyDomain, removedKeyVersions }) => {
      store.append(factory.create({
        deviceId: 'pico-core',
        type: 'memory.domain_shredded',
        payload: { privacyDomain, removedKeyVersions },
      }));
    }, { privacyDomain: 'domain-private' });

    // Identical outcomes, asserted as identical rather than each on its own.
    // Two separate assertions could both pass while the core treated the two
    // kinds differently in some way neither happened to look at.
    const suppliedAfter = read('mem_supplied', 'domain-private');
    const noteAfter = read('mem_note', 'domain-private');
    expect(suppliedAfter).toBe(noteAfter);
    expect(suppliedAfter).not.toBe('note mem_supplied');

    // Scoped to a domain, not to a kind - which also shows the comparison
    // above can fail.
    expect(read('mem_other_domain', 'domain-work')).toBe('note mem_other_domain');
  });
});
