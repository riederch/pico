import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { EventStore } from './event-store.js';
import type { MemoryStore, MemoryItemInput } from './memory-store.js';

const tempDirs: string[] = [];
const stores: EventStore[] = [];

function createDatabasePath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pico-memory-store-test-'));
  tempDirs.push(dir);
  return join(dir, 'pico.sqlite');
}

function openMemory(): MemoryStore {
  const store = new EventStore(createDatabasePath());
  stores.push(store);
  return store.memory();
}

function createInput(overrides: Partial<MemoryItemInput> = {}): MemoryItemInput {
  return {
    memoryItemId: 'mem-1',
    privacyDomain: 'domain-private',
    owner: 'pico-owner',
    controller: 'pico-owner',
    contentType: 'text/markdown',
    content: 'A private note.',
    ...overrides,
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

describe('MemoryStore', () => {
  it('creates and reads back an active memory item scoped by privacy domain', () => {
    const memory = openMemory();

    const created = memory.create(createInput({ retentionPolicyRef: 'retain-30d', sourceRef: 'event-1' }));
    expect(memory.getDomainCustodyClass('domain-private')).toBe('host_custody');
    expect(created).toEqual({
      memoryItemId: 'mem-1',
      privacyDomain: 'domain-private',
      owner: 'pico-owner',
      controller: 'pico-owner',
      contentType: 'text/markdown',
      content: 'A private note.',
      retentionPolicyRef: 'retain-30d',
      deletionState: 'active',
      contentPosture: 'plaintext_foundation',
      sourceRef: 'event-1',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    expect(memory.getInDomain('mem-1', 'domain-private')?.content).toBe('A private note.');
    expect(memory.getInDomain('mem-1', 'other-domain')).toBeUndefined();
    expect(memory.listInDomain('domain-private').map((item) => item.memoryItemId)).toEqual(['mem-1']);
    expect(memory.listInDomain('other-domain')).toEqual([]);
  });

  it('omits optional fields when they are not provided', () => {
    const memory = openMemory();

    const created = memory.create(createInput());
    expect('retentionPolicyRef' in created).toBe(false);
    expect('sourceRef' in created).toBe(false);
  });

  it('records a fixed domain custody class and refuses silent changes', () => {
    const memory = openMemory();

    expect(memory.getDomainCustodyClass('new-domain')).toBe('host_custody');

    expect(memory.recordDomainCustodyClass('domain-hosted', 'reader_custody')).toEqual({
      privacyDomain: 'domain-hosted',
      custodyClass: 'reader_custody',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(memory.getDomainCustodyClass('domain-hosted')).toBe('reader_custody');
    expect(() => memory.recordDomainCustodyClass('domain-hosted', 'host_custody')).toThrow('refusing to change it silently');
    expect(() => memory.recordDomainCustodyClass('domain-bad', 'future' as never)).toThrow('custodyClass');
  });

  it('keeps reader-custody content out of the host-custody memory-item path', () => {
    const memory = openMemory();
    memory.recordDomainCustodyClass('domain-hosted', 'reader_custody');

    expect(() => memory.create(createInput({ privacyDomain: 'domain-hosted' }))).toThrow('opaque reader-custody package path');
  });

  it('deletes content but keeps the item as deleted and excludes it from the active list', () => {
    const memory = openMemory();
    memory.create(createInput());

    expect(memory.deleteInDomain('mem-1', 'domain-private')).toBe('deleted');

    const deleted = memory.getInDomain('mem-1', 'domain-private');
    expect(deleted?.deletionState).toBe('deleted');
    expect(deleted !== undefined && 'content' in deleted).toBe(false);
    expect(memory.listInDomain('domain-private')).toEqual([]);
  });

  it('pages active items by (createdAt, memoryItemId) with a cursor and hasMore', () => {
    const memory = openMemory();
    memory.create(createInput({ memoryItemId: 'mem-1' }));
    memory.create(createInput({ memoryItemId: 'mem-2' }));
    memory.create(createInput({ memoryItemId: 'mem-3' }));

    const first = memory.listInDomainPage('domain-private', { limit: 2 });
    expect(first.items.map((item) => item.memoryItemId)).toEqual(['mem-1', 'mem-2']);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).not.toBeNull();

    const second = memory.listInDomainPage('domain-private', { limit: 2, after: first.nextCursor });
    expect(second.items.map((item) => item.memoryItemId)).toEqual(['mem-3']);
    expect(second.hasMore).toBe(false);

    const third = memory.listInDomainPage('domain-private', { limit: 2, after: second.nextCursor });
    expect(third.items).toEqual([]);
    expect(third.hasMore).toBe(false);
  });

  it('excludes deleted items from a page and stays scoped to the domain', () => {
    const memory = openMemory();
    memory.create(createInput({ memoryItemId: 'mem-1' }));
    memory.create(createInput({ memoryItemId: 'mem-2' }));
    memory.create(createInput({ memoryItemId: 'other', privacyDomain: 'other-domain' }));
    memory.deleteInDomain('mem-1', 'domain-private');

    const page = memory.listInDomainPage('domain-private');
    expect(page.items.map((item) => item.memoryItemId)).toEqual(['mem-2']);
    expect(page.hasMore).toBe(false);
  });

  it('rejects a non-positive page limit', () => {
    const memory = openMemory();
    expect(() => memory.listInDomainPage('domain-private', { limit: 0 })).toThrow(/positive integer/);
  });

  it('reports delete results for missing, cross-domain and already-deleted items', () => {
    const memory = openMemory();
    memory.create(createInput());

    expect(memory.deleteInDomain('mem-unknown', 'domain-private')).toBe('not_found');
    expect(memory.deleteInDomain('mem-1', 'other-domain')).toBe('not_found');
    expect(memory.deleteInDomain('mem-1', 'domain-private')).toBe('deleted');
    expect(memory.deleteInDomain('mem-1', 'domain-private')).toBe('already_deleted');
  });

  it('tombstones a deleted item and reports missing or not-yet-deleted items', () => {
    const memory = openMemory();
    memory.create(createInput());

    expect(memory.tombstone('mem-1', 'domain-private')).toBe('not_deleted');
    expect(memory.tombstone('mem-unknown', 'domain-private')).toBe('not_found');
    expect(memory.tombstone('mem-1', 'other-domain')).toBe('not_found');

    expect(memory.deleteInDomain('mem-1', 'domain-private')).toBe('deleted');
    expect(memory.tombstone('mem-1', 'domain-private')).toBe('tombstoned');
    expect(memory.getInDomain('mem-1', 'domain-private')?.deletionState).toBe('tombstoned');
    expect(memory.tombstone('mem-1', 'domain-private')).toBe('not_deleted');
  });

  it('enforces the tombstoned state on an item regardless of its current state', () => {
    const memory = openMemory();
    memory.create(createInput());

    // Active item (resurrected by a restore) -> forced straight to tombstoned, content gone.
    expect(memory.enforceTombstone('mem-1', 'domain-private')).toBe('tombstoned');
    const enforced = memory.getInDomain('mem-1', 'domain-private');
    expect(enforced?.deletionState).toBe('tombstoned');
    expect(enforced !== undefined && 'content' in enforced).toBe(false);

    // Idempotent + scoped.
    expect(memory.enforceTombstone('mem-1', 'domain-private')).toBe('already_tombstoned');
    expect(memory.enforceTombstone('mem-unknown', 'domain-private')).toBe('not_found');
    expect(memory.enforceTombstone('mem-1', 'other-domain')).toBe('not_found');
  });

  it('resolves a reference target against the store state', () => {
    const memory = openMemory();
    memory.create(createInput());

    expect(memory.resolutionState('mem-1', 'domain-private')).toBe('resolvable');
    expect(memory.resolutionState('mem-1', 'other-domain')).toBe('unknown');
    expect(memory.resolutionState('mem-unknown', 'domain-private')).toBe('unknown');

    memory.deleteInDomain('mem-1', 'domain-private');
    expect(memory.resolutionState('mem-1', 'domain-private')).toBe('deleted');

    memory.tombstone('mem-1', 'domain-private');
    expect(memory.resolutionState('mem-1', 'domain-private')).toBe('deleted');
  });

  it('rejects a duplicate memory item id and blank required fields', () => {
    const memory = openMemory();
    memory.create(createInput());

    expect(() => memory.create(createInput())).toThrow('Memory item id already exists.');
    expect(() => memory.create(createInput({ memoryItemId: 'mem-2', content: '   ' }))).toThrow('Memory item content must be a non-empty string.');
    expect(() => memory.create(createInput({ memoryItemId: 'mem-3', privacyDomain: '' }))).toThrow('Memory item privacyDomain must be a non-empty string.');
  });

  it('carries the ADR 0116 W2 origin class on every read path', () => {
    const memory = openMemory();
    memory.create(createInput({
      memoryItemId: 'mem-labelled',
      origin: 'external_content',
    }));
    memory.create(createInput({ memoryItemId: 'mem-unlabelled' }));

    expect(memory.getInDomain('mem-labelled', 'domain-private')?.origin)
      .toBe('external_content');
    // Absent is "not yet classified", never "trusted": the field is simply
    // missing, so a consumer cannot mistake a default for a decision.
    expect(memory.getInDomain('mem-unlabelled', 'domain-private'))
      .not.toHaveProperty('origin');

    const listed = memory.listInDomain('domain-private');
    expect(listed.map((item) => item.origin))
      .toEqual(['external_content', undefined]);
    const paged = memory.listInDomainPage('domain-private', { limit: 10 });
    expect(paged.items.map((item) => item.origin))
      .toEqual(['external_content', undefined]);

    expect(() => memory.create(createInput({
      memoryItemId: 'mem-invented',
      origin: 'trusted' as never,
    }))).toThrow('origin must be a known ADR 0116 class.');
  });

  it('derives the lowest class among its sources and never upgrades', () => {
    const memory = openMemory();
    memory.create(createInput({
      memoryItemId: 'mem-person',
      origin: 'person_present',
    }));
    memory.create(createInput({
      memoryItemId: 'mem-mail',
      origin: 'external_content',
    }));
    memory.create(createInput({ memoryItemId: 'mem-unlabelled' }));

    // A summary of the person's note and a fetched mail is not the person
    // speaking - this is the laundering step the gate breaks.
    const summary = memory.createDerived({
      ...createInput({ memoryItemId: 'mem-summary', content: 'A summary.' }),
      derivedFromMemoryItemIds: ['mem-person', 'mem-mail'],
    });
    expect(summary.origin).toBe('external_content');

    const ownOnly = memory.createDerived({
      ...createInput({ memoryItemId: 'mem-own', content: 'Restatement.' }),
      derivedFromMemoryItemIds: ['mem-person'],
    });
    expect(ownOnly.origin).toBe('person_present');

    expect(() => memory.createDerived({
      ...createInput({ memoryItemId: 'mem-none', content: 'x' }),
      derivedFromMemoryItemIds: [],
    })).toThrow('A derived memory item requires at least one source.');
    expect(() => memory.createDerived({
      ...createInput({ memoryItemId: 'mem-missing', content: 'x' }),
      derivedFromMemoryItemIds: ['mem-person', 'mem-absent'],
    })).toThrow('Derivation source is not in this domain: mem-absent');
    // Deriving a definite class from unknown provenance would be an upgrade by
    // another route.
    expect(() => memory.createDerived({
      ...createInput({ memoryItemId: 'mem-from-unlabelled', content: 'x' }),
      derivedFromMemoryItemIds: ['mem-unlabelled'],
    })).toThrow('Derivation source carries no origin class: mem-unlabelled');
  });
});
