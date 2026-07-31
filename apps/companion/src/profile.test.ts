import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  parsePicoCompanionProfile,
  readPicoCompanionProfile,
  writePicoCompanionProfile,
  type PicoCompanionProfile,
} from './profile.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function tempDir(): string {
  const directory = mkdtempSync('/tmp/pico-companion-profile-');
  temporaryDirectories.push(directory);
  return directory;
}

function validProfile(): PicoCompanionProfile {
  return {
    schema: 'pico.companion.profile.v1',
    coreUrl: 'http://127.0.0.1:8321',
    host: {
      signingPublicKeyHex: '11'.repeat(32),
      signingKeyFingerprintHex: '22'.repeat(32),
      keyAgreementPublicKeyHex: '33'.repeat(32),
      keyAgreementKeyFingerprintHex: '44'.repeat(32),
    },
    identity: {
      keyFingerprintHex: '55'.repeat(32),
      publicKeyHex: '66'.repeat(32),
    },
    device: {
      signingKeyFingerprintHex: '77'.repeat(32),
      keyAgreementKeyFingerprintHex: '88'.repeat(32),
      delegationId: 'delegation_companion_0001',
    },
  };
}

describe('Companion profile store (ADR 0113 C1)', () => {
  it('round-trips a valid profile with private file and directory modes', () => {
    const path = join(tempDir(), 'nested', 'profile.json');
    writePicoCompanionProfile(path, validProfile());

    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(statSync(join(path, '..')).mode & 0o777).toBe(0o700);
    expect(readPicoCompanionProfile(path)).toEqual(validProfile());
  });

  it('rejects unknown fields, missing fields and malformed values strictly', () => {
    const good = validProfile();

    expect(() => parsePicoCompanionProfile({ ...good, extra: true }))
      .toThrow('unexpected_companion_profile_field');
    const { device, ...withoutDevice } = good;
    void device;
    expect(() => parsePicoCompanionProfile(withoutDevice))
      .toThrow('missing_companion_profile_field');
    expect(() => parsePicoCompanionProfile({ ...good, schema: 'pico.companion.profile.v2' }))
      .toThrow('invalid_companion_profile_schema');
    expect(() => parsePicoCompanionProfile({
      ...good,
      host: { ...good.host, signingKeyFingerprintHex: 'aa'.repeat(31) },
    })).toThrow('invalid_host_signing_fingerprint');
    expect(() => parsePicoCompanionProfile({
      ...good,
      host: { ...good.host, unexpected: 1 },
    })).toThrow('unexpected_companion_profile_host_field');
    expect(() => parsePicoCompanionProfile({
      ...good,
      device: { ...good.device, delegationId: 'no spaces allowed' },
    })).toThrow('invalid_device_delegation_id');
    expect(() => parsePicoCompanionProfile({ ...good, coreUrl: 'file:///etc/passwd' }))
      .toThrow('invalid_companion_core_url');
    expect(() => parsePicoCompanionProfile({ ...good, coreUrl: 'not a url' }))
      .toThrow('invalid_companion_core_url');
  });

  it('refuses to write an invalid profile and to read a corrupt file', () => {
    const path = join(tempDir(), 'profile.json');
    const broken = {
      ...validProfile(),
      identity: { keyFingerprintHex: 'zz', publicKeyHex: '66'.repeat(32) },
    } as unknown as PicoCompanionProfile;
    expect(() => writePicoCompanionProfile(path, broken))
      .toThrow('invalid_identity_fingerprint');
    expect(() => readPicoCompanionProfile(path))
      .toThrow('unreadable_companion_profile');
  });
});
