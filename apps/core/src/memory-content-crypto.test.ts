import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EventStore } from './event-store.js';
import { KeyStore } from './key-store.js';
import {
  MemoryContentCrypto,
  buildContentAd,
  buildDekWrapAd,
} from './memory-content-crypto.js';
import type { MemoryStore } from './memory-store.js';

const tempDirs: string[] = [];
const stores: EventStore[] = [];

interface Harness {
  memory: MemoryStore;
  crypto: MemoryContentCrypto;
  keyDir: string;
  databasePath: string;
}

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function openEncryptedMemory(): Harness {
  const databasePath = join(createTempDir('pico-crypto-db-'), 'pico.sqlite');
  const keyDir = join(createTempDir('pico-crypto-keys-'), 'keys');
  const crypto = new MemoryContentCrypto(sodium, new KeyStore(keyDir));
  const store = new EventStore(databasePath, { memoryCrypto: crypto });
  stores.push(store);
  return { memory: store.memory(), crypto, keyDir, databasePath };
}

function rawRow(databasePath: string, memoryItemId: string): { content: string | null; content_posture: string; key_envelope_ref: string | null } {
  const db = new Database(databasePath, { readonly: true });
  try {
    return db
      .prepare('SELECT content, content_posture, key_envelope_ref FROM memory_item WHERE memory_item_id = ?')
      .get(memoryItemId) as { content: string | null; content_posture: string; key_envelope_ref: string | null };
  } finally {
    db.close();
  }
}

function envelopeCount(databasePath: string): number {
  const db = new Database(databasePath, { readonly: true });
  try {
    return (db.prepare('SELECT COUNT(*) AS n FROM memory_key_envelope').get() as { n: number }).n;
  } finally {
    db.close();
  }
}

const encryptedInput = {
  memoryItemId: 'mem-1',
  privacyDomain: 'domain-private',
  owner: 'pico-owner',
  controller: 'pico-owner',
  contentType: 'text/plain',
  content: 'A private secret note.',
  contentPosture: 'domain_encrypted' as const,
};

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

describe('memory content AD builders (ADR 0073)', () => {
  it('reproduces the published content and dek-wrap vectors byte-exactly', () => {
    const contentAd = buildContentAd({
      suite: 'pico.suite.mem.v1',
      memoryItemId: 'mem_01hzx8m9q4rt5v',
      privacyDomain: 'domain-private',
      contentType: 'text/plain',
    });
    expect(Buffer.from(contentAd).toString('hex')).toBe(
      '000000167069636f2e6d656d2e61642e636f6e74656e742e7631000000117069636f2e73756974652e6d656d2e7631000000126d656d5f3031687a78386d397134727435760000000e646f6d61696e2d707269766174650000000a746578742f706c61696e',
    );

    const dekWrapAd = buildDekWrapAd({
      suite: 'pico.suite.mem.v1',
      keyEnvelopeId: 'kenv_01hzx8m9q4rt5v',
      domainId: 'domain-private',
      memoryItemId: 'mem_01hzx8m9q4rt5v',
    });
    expect(Buffer.from(dekWrapAd).toString('hex')).toBe(
      '000000177069636f2e6d656d2e61642e64656b2d777261702e7631000000117069636f2e73756974652e6d656d2e7631000000136b656e765f3031687a78386d397134727435760000000e646f6d61696e2d70726976617465000000126d656d5f3031687a78386d39713472743576',
    );
  });

  it('rejects out-of-charset and empty AD fields', () => {
    expect(() => buildContentAd({ suite: 'pico.suite.mem.v1', memoryItemId: 'mem-1', privacyDomain: 'domain-private', contentType: '' })).toThrow('empty_field');
    expect(() => buildContentAd({ suite: 'pico.suite.mem.v1', memoryItemId: 'mem-1', privacyDomain: 'has space', contentType: 'text/plain' })).toThrow('invalid_field_charset');
  });
});

describe('MemoryContentCrypto encrypt-on-write (ADR 0071)', () => {
  it('round-trips content through the store', () => {
    const { memory } = openEncryptedMemory();

    const created = memory.create(encryptedInput);
    expect(created.contentPosture).toBe('domain_encrypted');
    expect(created.keyEnvelopeRef).toMatch(/^kenv_/);
    // create() reads the item back, so it already returns decrypted plaintext.
    expect(created.content).toBe('A private secret note.');

    const read = memory.getInDomain('mem-1', 'domain-private');
    expect(read?.content).toBe('A private secret note.');
    expect(read?.contentUnavailable).toBeUndefined();

    const listed = memory.listInDomain('domain-private');
    expect(listed).toHaveLength(1);
    expect(listed[0].content).toBe('A private secret note.');
  });

  it('stores ciphertext at rest, never the plaintext', () => {
    const { memory, databasePath } = openEncryptedMemory();
    memory.create(encryptedInput);

    const row = rawRow(databasePath, 'mem-1');
    expect(row.content_posture).toBe('domain_encrypted');
    expect(row.key_envelope_ref).toMatch(/^kenv_/);
    expect(row.content).not.toBeNull();
    expect(row.content).not.toContain('A private secret note.');
    // Stored blob is the versioned suite envelope, not the plaintext.
    expect(JSON.parse(row.content as string)).toMatchObject({ v: 1, suite: 'pico.suite.mem.v1' });
    expect(envelopeCount(databasePath)).toBe(1);
  });

  it('uses a fresh random nonce and DEK per encryption', () => {
    const { crypto } = openEncryptedMemory();
    const a = crypto.encryptForWrite({ memoryItemId: 'mem-x', privacyDomain: 'domain-private', contentType: 'text/plain', plaintext: 'same' });
    const b = crypto.encryptForWrite({ memoryItemId: 'mem-x', privacyDomain: 'domain-private', contentType: 'text/plain', plaintext: 'same' });

    expect(a.storedContent).not.toBe(b.storedContent);
    expect(a.keyEnvelopeId).not.toBe(b.keyEnvelopeId);
    expect(a.envelope.wrappedDek).not.toBe(b.envelope.wrappedDek);
  });

  it('fails authentication when the ciphertext is moved to another content type (AD binding, R3)', () => {
    const { memory, databasePath } = openEncryptedMemory();
    memory.create(encryptedInput);

    // Simulate a ciphertext row retyped in place; the content AD binds contentType.
    const db = new Database(databasePath);
    db.prepare("UPDATE memory_item SET content_type = 'text/markdown' WHERE memory_item_id = 'mem-1'").run();
    db.close();

    expect(() => memory.getInDomain('mem-1', 'domain-private')).toThrow();
  });

  it('fails to unwrap a DEK under a different memory item id (AD binding, R3)', () => {
    const { crypto } = openEncryptedMemory();
    const result = crypto.encryptForWrite({ memoryItemId: 'mem-a', privacyDomain: 'domain-private', contentType: 'text/plain', plaintext: 'secret' });

    expect(() =>
      crypto.decryptForRead({
        memoryItemId: 'mem-b',
        privacyDomain: 'domain-private',
        contentType: 'text/plain',
        storedContent: result.storedContent,
        envelope: result.envelope,
      }),
    ).toThrow();
  });

  it('rejects domain_encrypted content without a crypto provider', () => {
    const store = new EventStore(join(createTempDir('pico-nocrypto-'), 'pico.sqlite'));
    stores.push(store);
    expect(() => store.memory().create(encryptedInput)).toThrow('without a crypto provider');
  });
});

describe('crypto-shredding (ADR 0072)', () => {
  it('makes a domain unreadable after its keys are shredded', () => {
    const { memory } = openEncryptedMemory();
    memory.create(encryptedInput);
    expect(memory.getInDomain('mem-1', 'domain-private')?.content).toBe('A private secret note.');

    const { removed } = memory.cryptoShredDomain('domain-private');
    expect(removed).toBe(1);

    const read = memory.getInDomain('mem-1', 'domain-private');
    expect(read?.content).toBeUndefined();
    expect(read?.contentUnavailable).toBe('key_shredded');
  });

  it('reports content unavailable when read without a crypto provider', () => {
    const { memory, databasePath } = openEncryptedMemory();
    memory.create(encryptedInput);

    // A second store over the same database without a crypto provider cannot decrypt.
    const plainStore = new EventStore(databasePath);
    stores.push(plainStore);
    const read = plainStore.memory().getInDomain('mem-1', 'domain-private');
    expect(read?.content).toBeUndefined();
    expect(read?.contentUnavailable).toBe('crypto_unavailable');
  });
});
