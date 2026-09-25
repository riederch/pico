import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, fsyncSync: vi.fn(actual.fsyncSync) };
});

const {
  createPicoVaultKeyfile,
  readPicoVaultKeyfile,
  removePicoVaultKeyfile,
  writePicoVaultKeyfile,
} = await import('./index.js');

const tempDirs: string[] = [];

beforeAll(async () => {
  await sodium.ready;
});

afterEach(() => {
  vi.mocked(fs.fsyncSync).mockClear();
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * Finding B275, the vault's copy of the promise `durable-file.ts` makes for
 * the Home: a keyfile is on the disk before anybody is told about the key it
 * holds. The daemon reads every `.json` in its directory, so one keyfile a
 * power cut left empty would take the whole vault with it.
 */
describe('B275 a vault keyfile is on the disk before the key is used', () => {
  function keyfile() {
    return createPicoVaultKeyfile(sodium as never, {
      keyRole: 'pico_identity',
      passphrase: 'correct horse battery staple',
    }).keyfile;
  }

  it('flushes the keyfile and its directory, and never replaces one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pico-vault-durable-'));
    tempDirs.push(dir);
    const path = join(dir, 'keyfiles', 'pico_identity-a.json');
    const written = keyfile();

    writePicoVaultKeyfile(path, written);
    expect(vi.mocked(fs.fsyncSync)).toHaveBeenCalledTimes(2);
    expect(readPicoVaultKeyfile(path)).toEqual(written);
    expect(readdirSync(join(dir, 'keyfiles'))).toEqual(['pico_identity-a.json']);

    expect(() => writePicoVaultKeyfile(path, keyfile())).toThrow(/EEXIST/u);
    expect(readPicoVaultKeyfile(path)).toEqual(written);
  });

  it('takes back a partial copy along with the keyfile', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pico-vault-durable-'));
    tempDirs.push(dir);
    const path = join(dir, 'pico_identity-b.json');
    writeFileSync(`${path}.partial`, 'torn');

    writePicoVaultKeyfile(path, keyfile());
    expect(existsSync(`${path}.partial`)).toBe(false);

    writeFileSync(`${path}.partial`, 'another copy');
    removePicoVaultKeyfile(path);
    expect(readdirSync(dir)).toEqual([]);
  });
});
