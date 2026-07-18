import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { KeyStore, assertKeyStoreSeparation } from './key-store.js';

const tempDirs: string[] = [];

function createKeyStorePath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pico-key-store-test-'));
  tempDirs.push(dir);
  return join(dir, 'keys');
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('KeyStore', () => {
  it('creates, loads, lists and shreds versioned key files', () => {
    const store = new KeyStore(createKeyStorePath());

    expect(store.listVersions('domain-private')).toEqual([]);

    const first = store.createKeyVersion('domain-private');
    const second = store.createKeyVersion('domain-private');
    expect(first).toEqual({ domainId: 'domain-private', version: 1 });
    expect(second).toEqual({ domainId: 'domain-private', version: 2 });
    expect(store.listVersions('domain-private')).toEqual([1, 2]);

    const key = store.loadKeyVersion('domain-private', 1);
    expect(key).toHaveLength(32);
    expect(store.loadKeyVersion('domain-private', 2)).not.toEqual(key);

    // Domains are isolated.
    store.createKeyVersion('domain-shared');
    expect(store.listVersions('domain-shared')).toEqual([1]);
    expect(store.listVersions('domain-private')).toEqual([1, 2]);

    expect(store.shredDomain('domain-private')).toEqual({ removed: 2 });
    expect(store.listVersions('domain-private')).toEqual([]);
    expect(store.listVersions('domain-shared')).toEqual([1]);
    expect(() => store.loadKeyVersion('domain-private', 1)).toThrow('Key version not found');
  });

  it('stores keys with 0600 files in a 0700 directory', () => {
    const keyStorePath = createKeyStorePath();
    const store = new KeyStore(keyStorePath);
    store.createKeyVersion('domain-private');

    // Skip on platforms that do not report POSIX mode bits meaningfully.
    if (process.platform !== 'win32') {
      expect(statSync(keyStorePath).mode & 0o777).toBe(0o700);
      expect(statSync(join(keyStorePath, 'domain_domain-private.v1.key')).mode & 0o777).toBe(0o600);
    }
  });

  it('rejects domain ids that could escape the key directory', () => {
    const store = new KeyStore(createKeyStorePath());

    for (const bad of ['../evil', 'a/b', 'dot.dot', 'has space', '', 'x'.repeat(129)]) {
      expect(() => store.createKeyVersion(bad)).toThrow('domainId must match');
    }
  });

  it('refuses raw KEK operations for reader-custody domains (ADR 0078 K6)', () => {
    const store = new KeyStore(createKeyStorePath());

    expect(() => store.createKeyVersion('domain-hosted', { custodyClass: 'reader_custody' })).toThrow('reader_custody domains');
    expect(() => store.listVersions('domain-hosted', { custodyClass: 'reader_custody' })).toThrow('reader_custody domains');
    expect(() => store.loadKeyVersion('domain-hosted', 1, { custodyClass: 'reader_custody' })).toThrow('reader_custody domains');
    expect(() => store.shredDomain('domain-hosted', { custodyClass: 'reader_custody' })).toThrow('reader_custody domains');
  });
});

describe('assertKeyStoreSeparation', () => {
  it('accepts the default layout where the key store is separate from data and backups', () => {
    expect(() => assertKeyStoreSeparation({
      keyStorePath: '/data/keys',
      databasePath: '/data/pico.sqlite',
      backupDirectory: '/data/backups',
    })).not.toThrow();
  });

  it('rejects a key store inside or equal to the SQLite backup directory', () => {
    expect(() => assertKeyStoreSeparation({
      keyStorePath: '/data/backups/keys',
      databasePath: '/data/pico.sqlite',
      backupDirectory: '/data/backups',
    })).toThrow('must not be inside the SQLite backup directory');

    expect(() => assertKeyStoreSeparation({
      keyStorePath: '/data/backups',
      databasePath: '/data/pico.sqlite',
      backupDirectory: '/data/backups',
    })).toThrow('must not be inside the SQLite backup directory');
  });

  it('rejects a key store that is the database directory', () => {
    expect(() => assertKeyStoreSeparation({
      keyStorePath: '/data',
      databasePath: '/data/pico.sqlite',
      backupDirectory: '/data/backups',
    })).toThrow('must not be the database directory');
  });
});
