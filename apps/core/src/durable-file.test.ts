import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, fsyncSync: vi.fn(actual.fsyncSync) };
});

const { createPicoHomeFileDurably, picoHomePartialPath, removePicoHomeFileDurably } =
  await import('./durable-file.js');
const { KeyStore } = await import('./key-store.js');
const { HomeHostKeyStore } = await import('./home-setup.js');

const tempDirs: string[] = [];

afterEach(() => {
  vi.mocked(fs.fsyncSync).mockClear();
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pico-durable-'));
  tempDirs.push(dir);
  return dir;
}

/**
 * Finding B275. A power cut cannot be staged in a test; what can be held is
 * the order: the file and its directory are flushed before the caller hears
 * that the file exists, so nothing the caller commits afterwards can reach
 * the disk ahead of it.
 */
describe('B275 a key file is on the disk before anybody is told it exists', () => {
  it('flushes the file and its directory before returning', () => {
    const dir = tempDir();
    createPicoHomeFileDurably(join(dir, 'k.key'), 'secret');

    expect(vi.mocked(fs.fsyncSync)).toHaveBeenCalledTimes(2);
    expect(readFileSync(join(dir, 'k.key'), 'utf8')).toBe('secret');
    expect(statSync(join(dir, 'k.key')).mode & 0o777).toBe(0o600);
    expect(readdirSync(dir)).toEqual(['k.key']);
  });

  it('creates and never replaces, the way `wx` did', () => {
    const dir = tempDir();
    const path = join(dir, 'k.key');
    createPicoHomeFileDurably(path, 'first');

    expect(() => createPicoHomeFileDurably(path, 'second')).toThrow(/EEXIST/u);
    expect(readFileSync(path, 'utf8')).toBe('first');
    expect(existsSync(picoHomePartialPath(path))).toBe(false);
  });

  it('clears a partial copy a crash left, and removing takes the copy too', () => {
    const dir = tempDir();
    const path = join(dir, 'k.key');
    writeFileSync(picoHomePartialPath(path), 'torn');

    createPicoHomeFileDurably(path, 'whole');
    expect(readFileSync(path, 'utf8')).toBe('whole');
    expect(existsSync(picoHomePartialPath(path))).toBe(false);

    writeFileSync(picoHomePartialPath(path), 'another copy');
    removePicoHomeFileDurably(path);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('puts a new domain key on the disk before the version is handed out', () => {
    const store = new KeyStore(tempDir());
    store.createKeyVersion('domain-private');

    // The file and the directory, and only then does the caller get a
    // version it will encrypt under and SQLite will commit.
    expect(vi.mocked(fs.fsyncSync)).toHaveBeenCalledTimes(2);
  });

  it('shreds the partial copy of a version whose creation never finished', () => {
    // The security half. A crash between writing and publishing version 2
    // leaves its key only in the partial file, which `listVersions` cannot
    // see - and a shred that left it would leave the key.
    const dir = tempDir();
    const store = new KeyStore(dir);
    store.createKeyVersion('domain-private');
    writeFileSync(join(dir, 'domain_domain-private.v2.key.partial'), Buffer.alloc(32, 7));
    writeFileSync(join(dir, 'domain_domain-other.v1.key.partial'), Buffer.alloc(32, 9));

    expect(store.shredDomain('domain-private')).toEqual({ removed: 1 });
    expect(readdirSync(dir)).toEqual(['domain_domain-other.v1.key.partial']);
  });

  it('puts the host key pair on the disk before the Home uses it', async () => {
    const sodiumModule = await import('libsodium-wrappers-sumo');
    const sodium = sodiumModule.default;
    await sodium.ready;
    const store = new HomeHostKeyStore(tempDir());
    store.ensure(sodium as never);

    // Two files, each with its directory.
    expect(vi.mocked(fs.fsyncSync)).toHaveBeenCalledTimes(4);
  });
});
