import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LamportClock } from '@pico/sync';
import type { MemoryDomainShreddedPayload } from '@pico/protocol';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EventFactory } from './event-factory.js';
import { EventStore } from './event-store.js';
import { KeyStore } from './key-store.js';
import { MemoryContentCrypto } from './memory-content-crypto.js';
import { shredDomainWithAudit, type AppendShredAudit } from './domain-shred.js';

const tempDirs: string[] = [];
const stores: EventStore[] = [];

interface Harness {
  store: EventStore;
  append: AppendShredAudit;
  databasePath: string;
}

function openHarness(): Harness {
  const dir = mkdtempSync(join(tmpdir(), 'pico-domain-shred-test-'));
  tempDirs.push(dir);
  const databasePath = join(dir, 'pico.sqlite');
  const keyDir = join(dir, 'keys');
  const crypto = new MemoryContentCrypto(sodium, new KeyStore(keyDir));
  const store = new EventStore(databasePath, { memoryCrypto: crypto });
  stores.push(store);

  const factory = new EventFactory(new LamportClock(store.maxLamport()));
  const append: AppendShredAudit = ({ privacyDomain, removedKeyVersions, reason }) => {
    store.append(factory.create({
      deviceId: 'pico-core',
      type: 'memory.domain_shredded',
      payload: { privacyDomain, removedKeyVersions, ...(reason === undefined ? {} : { reason }) },
    }));
  };

  return { store, append, databasePath };
}

function createEncryptedItem(store: EventStore, memoryItemId: string, privacyDomain: string): void {
  store.memory().create({
    memoryItemId,
    privacyDomain,
    owner: 'pico-owner',
    controller: 'pico-owner',
    contentType: 'text/plain',
    content: `secret ${memoryItemId}`,
    contentPosture: 'domain_encrypted',
  });
}

beforeAll(async () => {
  await sodium.ready;
});

afterEach(() => {
  for (const store of stores.splice(0)) {
    store.close();
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('shredDomainWithAudit (ADR 0071 step 4)', () => {
  it('shreds a domain and appends a durable, content-free audit event', () => {
    const { store, append } = openHarness();
    createEncryptedItem(store, 'mem-1', 'domain-private');
    expect(store.memory().getInDomain('mem-1', 'domain-private')?.content).toBe('secret mem-1');

    const result = shredDomainWithAudit(store.memory(), append, { privacyDomain: 'domain-private', reason: 'device loss' });
    expect(result.removedKeyVersions).toBe(1);

    // The item is now unreadable.
    const read = store.memory().getInDomain('mem-1', 'domain-private');
    expect(read?.content).toBeUndefined();
    expect(read?.contentUnavailable).toBe('key_shredded');

    // The audit event is in the append-only log, references only, no content or keys.
    const audits = store.list().filter((event) => event.type === 'memory.domain_shredded');
    expect(audits).toHaveLength(1);
    expect(audits[0].deviceId).toBe('pico-core');
    expect(audits[0].payload as MemoryDomainShreddedPayload).toEqual({
      privacyDomain: 'domain-private',
      removedKeyVersions: 1,
      reason: 'device loss',
    });
    expect(JSON.stringify(audits[0].payload)).not.toContain('secret');
  });

  it('reaches the recall history, and says how many exchanges it cleared', () => {
    /**
     * ADR 0049 mit ADR 0071 (2026-09-10). Der Shred ist ein Vorgang, der
     * Inhalt unlesbar macht; eine Klartextkopie derselben Worte daneben lässt
     * ihn tun, was er verspricht, an allem ausser an der Stelle, an der die
     * Worte ohnehin offen lagen. Der Port ist der Weg dorthin, aus demselben
     * Grund wie beim Beobachtungspuffer: ein Kaskadenschritt, den man von
     * aussen anhängt, ist einer, den jemand vergisst.
     */
    const { store, append } = openHarness();
    const cleared: string[] = [];

    const result = shredDomainWithAudit(
      store.memory(),
      append,
      { privacyDomain: 'domain-private' },
      undefined,
      (domain) => {
        cleared.push(domain);
        return 3;
      },
    );

    expect(cleared).toEqual(['domain-private']);
    expect(result.forgottenRecalls).toBe(3);
  });

  it('reaches what a person said about a place, and says how many it dropped', () => {
    /**
     * ADR 0129 SR4 mit ADR 0071 (2026-09-24). Die Zeile traegt keinen
     * Schluesselumschlag: `source_transition_at` ist selbst eine Aussage
     * darueber, wann jemand gefahren ist, und ein zerstoerter Domaenenschluessel
     * macht sie nicht unlesbar. Sie stehen zu lassen waere Befund B251 eine
     * Tabelle weiter.
     */
    const { store, append } = openHarness();
    const dropped: string[] = [];

    const result = shredDomainWithAudit(
      store.memory(),
      append,
      { privacyDomain: 'domain-private' },
      undefined,
      undefined,
      (domain) => {
        dropped.push(domain);
        return 2;
      },
    );

    expect(dropped).toEqual(['domain-private']);
    expect(result.forgottenParkingDecisions).toBe(2);
  });

  it('answers zero for the parking decisions when nobody wired it', () => {
    const { store, append } = openHarness();
    expect(shredDomainWithAudit(store.memory(), append, { privacyDomain: 'domain-private' })
      .forgottenParkingDecisions).toBe(0);
  });

  it('answers zero for the recall history when nobody wired it', () => {
    // The port is optional, and a shred without it says zero rather than
    // pretending it reached something.
    const { store, append } = openHarness();
    expect(shredDomainWithAudit(store.memory(), append, { privacyDomain: 'domain-private' })
      .forgottenRecalls).toBe(0);
  });

  it('records an audit event even when the domain had no keys', () => {
    const { store, append } = openHarness();

    const result = shredDomainWithAudit(store.memory(), append, { privacyDomain: 'empty-domain' });
    expect(result.removedKeyVersions).toBe(0);

    const audits = store.list().filter((event) => event.type === 'memory.domain_shredded');
    expect(audits).toHaveLength(1);
    expect((audits[0].payload as MemoryDomainShreddedPayload).removedKeyVersions).toBe(0);
  });

  it('keeps the audit event across a store reopen (append-only durability)', () => {
    const { store, append, databasePath } = openHarness();
    createEncryptedItem(store, 'mem-1', 'domain-private');
    shredDomainWithAudit(store.memory(), append, { privacyDomain: 'domain-private' });
    store.close();
    stores.length = 0;

    const reopened = new EventStore(databasePath);
    stores.push(reopened);
    const audits = reopened.list().filter((event) => event.type === 'memory.domain_shredded');
    expect(audits).toHaveLength(1);
    expect((audits[0].payload as MemoryDomainShreddedPayload).privacyDomain).toBe('domain-private');
  });
});
