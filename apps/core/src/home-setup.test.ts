import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  assertHomeHostKeyStoreSeparation,
  HomeHostKeyStore,
  MoveInCode,
  consumeHomeResetMarker,
  homeResetMarkerPath,
} from './home-setup.js';

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pico-home-setup-test-'));
  tempDirs.push(dir);
  return dir;
}

beforeAll(async () => {
  await sodium.ready;
});

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('MoveInCode', () => {
  it('mints a per-process single-use code', () => {
    const code = new MoveInCode();
    const value = code.mint();

    expect(code.isPending()).toBe(true);
    expect(code.consume(value)).toEqual({ ok: true, exhausted: false });
    expect(code.isPending()).toBe(false);
    expect(code.consume(value)).toEqual({ ok: false, exhausted: true });
  });

  it('exhausts after bounded wrong attempts', () => {
    const code = new MoveInCode();
    code.mint();

    for (let i = 0; i < 9; i += 1) {
      expect(code.consume('wrong-code')).toEqual({ ok: false, exhausted: false });
    }

    expect(code.consume('wrong-code')).toEqual({ ok: false, exhausted: true });
    expect(code.isPending()).toBe(false);
  });
});

describe('HomeHostKeyStore', () => {
  it('creates and reloads separated host-role key files', () => {
    const keyPath = join(createTempDir(), 'home-host-keys');
    const store = new HomeHostKeyStore(keyPath);

    const created = store.ensure(sodium, new Date('2026-07-18T09:00:00.000Z'));
    expect(created.publicBundle.suite).toBe('pico.suite.id.v1');
    expect(created.publicBundle.signingPublicKeyHex).toMatch(/^[0-9a-f]{64}$/);
    expect(created.publicBundle.signingKeyFingerprintHex).toMatch(/^[0-9a-f]{64}$/);
    expect(created.publicBundle.keyAgreementPublicKeyHex).toMatch(/^[0-9a-f]{64}$/);
    expect(created.publicBundle.keyAgreementKeyFingerprintHex).toMatch(/^[0-9a-f]{64}$/);

    expect(statSync(keyPath).mode & 0o777).toBe(0o700);
    expect(statSync(join(keyPath, 'home_host_signing.key.json')).mode & 0o777).toBe(0o600);
    expect(statSync(join(keyPath, 'home_host_key_agreement.key.json')).mode & 0o777).toBe(0o600);

    const reloaded = new HomeHostKeyStore(keyPath).ensure(sodium);
    expect(reloaded.publicBundle).toEqual(created.publicBundle);
  });

  it('fails closed for partial host-key custody', () => {
    const keyPath = join(createTempDir(), 'home-host-keys');
    mkdirSync(keyPath, { recursive: true });
    writeFileSync(join(keyPath, 'home_host_signing.key.json'), '{}');

    expect(() => new HomeHostKeyStore(keyPath).ensure(sodium)).toThrow('Pico Home host key custody is incomplete.');
  });

  it('keeps host keys out of database backups and memory-domain key blast radius', () => {
    const dir = createTempDir();
    const params = {
      homeHostKeyStorePath: join(dir, 'home-host-keys'),
      keyStorePath: join(dir, 'keys'),
      databasePath: join(dir, 'pico.sqlite'),
      backupDirectory: join(dir, 'backups'),
    };

    expect(() => assertHomeHostKeyStoreSeparation(params)).not.toThrow();
    expect(() => assertHomeHostKeyStoreSeparation({
      ...params,
      homeHostKeyStorePath: join(params.backupDirectory, 'home-host-keys'),
    })).toThrow('PICO_HOME_HOST_KEY_STORE_PATH must not be inside the SQLite backup directory');
    expect(() => assertHomeHostKeyStoreSeparation({
      ...params,
      homeHostKeyStorePath: join(params.keyStorePath, 'home-host-keys'),
    })).toThrow('PICO_HOME_HOST_KEY_STORE_PATH must be separate from PICO_KEY_STORE_PATH');
  });
});

describe('home reset marker', () => {
  it('is consumed exactly once from the database directory', () => {
    const databasePath = join(createTempDir(), 'pico.sqlite');
    const markerPath = homeResetMarkerPath(databasePath);
    mkdirSync(join(markerPath, '..'), { recursive: true });
    writeFileSync(markerPath, '');

    expect(consumeHomeResetMarker(databasePath)).toBe(true);
    expect(consumeHomeResetMarker(databasePath)).toBe(false);
  });
});
