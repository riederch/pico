import { mkdirSync, mkdtempSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  assertHomeHostKeyStoreSeparation,
  HomeHostKeyStore,
  MoveInCode,
  consumeHomeResetMarker,
  consumeRecoveryAnchorReseedMarker,
  recoveryAnchorReseedMarkerPath,
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

describe('HomeHostKeyStore rotation staging (ADR 0115 U3)', () => {
  it('stages once, signs with the staged key, and promotes atomically', () => {
    const store = new HomeHostKeyStore(join(createTempDir(), 'host-keys'));
    const active = store.ensure(sodium);
    const staged = store.stageRotation(sodium);

    // Staging is idempotent: re-staging would silently invalidate a
    // possession signature already made over the first staged keys.
    expect(store.stageRotation(sodium).publicBundle.signingKeyFingerprintHex)
      .toBe(staged.publicBundle.signingKeyFingerprintHex);
    // Staging changes nothing about active custody.
    expect(store.load(sodium)?.publicBundle.signingKeyFingerprintHex)
      .toBe(active.publicBundle.signingKeyFingerprintHex);

    const message = new TextEncoder().encode('possession');
    expect(sodium.crypto_sign_verify_detached(
      Buffer.from(store.signWithStagedSigningKey(sodium, message), 'hex'),
      message,
      Buffer.from(staged.publicBundle.signingPublicKeyHex, 'hex'),
    )).toBe(true);

    store.promoteStagedRotation();
    const promoted = store.load(sodium);
    expect(promoted?.publicBundle.signingKeyFingerprintHex)
      .toBe(staged.publicBundle.signingKeyFingerprintHex);
    expect(promoted?.publicBundle.keyAgreementKeyFingerprintHex)
      .toBe(staged.publicBundle.keyAgreementKeyFingerprintHex);
    // The staged slot is empty again; the retired private keys went with the
    // replaced files.
    expect(store.loadStagedRotation(sodium)).toBeUndefined();
  });

  it('completes an interrupted promotion only toward the proven head', () => {
    const dir = join(createTempDir(), 'host-keys');
    const store = new HomeHostKeyStore(dir);
    store.ensure(sodium);
    const staged = store.stageRotation(sodium);
    const head = {
      hostSigningKeyFingerprintHex: staged.publicBundle.signingKeyFingerprintHex,
      hostKeyAgreementKeyFingerprintHex:
        staged.publicBundle.keyAgreementKeyFingerprintHex,
    };

    // Simulate a crash half way: only the signing file was renamed.
    renameSync(
      join(dir, 'home_host_signing.staged.key.json'),
      join(dir, 'home_host_signing.key.json'),
    );

    // A head nobody staged completes nothing and renames nothing.
    expect(store.completeInterruptedRotation(sodium, {
      hostSigningKeyFingerprintHex: 'ee'.repeat(32),
      hostKeyAgreementKeyFingerprintHex: 'ff'.repeat(32),
    })).toBe(false);
    // The proven head is completable from what active and staged hold.
    expect(store.completeInterruptedRotation(sodium, head)).toBe(true);
    expect(store.load(sodium)?.publicBundle.keyAgreementKeyFingerprintHex)
      .toBe(head.hostKeyAgreementKeyFingerprintHex);
    // Idempotent once custody already matches.
    expect(store.completeInterruptedRotation(sodium, head)).toBe(true);
  });

  it('discards an abandoned staging without touching active custody', () => {
    const store = new HomeHostKeyStore(join(createTempDir(), 'host-keys'));
    const active = store.ensure(sodium);
    store.stageRotation(sodium);
    store.discardStagedRotation();
    expect(store.loadStagedRotation(sodium)).toBeUndefined();
    expect(store.load(sodium)?.publicBundle.signingKeyFingerprintHex)
      .toBe(active.publicBundle.signingKeyFingerprintHex);
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

describe('recovery anchor re-seed marker (ADR 0110 R6)', () => {
  it('is consumed exactly once and never shares a file with the home reset', () => {
    const databasePath = join(createTempDir(), 'pico.sqlite');
    const markerPath = recoveryAnchorReseedMarkerPath(databasePath);
    mkdirSync(join(markerPath, '..'), { recursive: true });

    expect(consumeRecoveryAnchorReseedMarker(databasePath)).toBe(false);
    writeFileSync(markerPath, '');
    expect(consumeRecoveryAnchorReseedMarker(databasePath)).toBe(true);
    expect(consumeRecoveryAnchorReseedMarker(databasePath)).toBe(false);

    // Distinct markers: re-seeding the anchor must never be a side effect of
    // resetting the Home, and vice versa.
    expect(markerPath).not.toBe(homeResetMarkerPath(databasePath));
    writeFileSync(homeResetMarkerPath(databasePath), '');
    expect(consumeRecoveryAnchorReseedMarker(databasePath)).toBe(false);
    expect(consumeHomeResetMarker(databasePath)).toBe(true);
  });
});
