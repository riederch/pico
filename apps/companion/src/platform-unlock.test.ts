import { tmpdir } from 'node:os';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import type {
  PicoVaultDaemonClient,
  PicoVaultDaemonUnlockedSessionDescriptor,
} from '@pico/vault-daemon';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PicoCompanionProfile } from './profile.js';
import {
  createPicoCompanionAutomaticVaultUnlock,
  writePicoCompanionPlatformUnlock,
  type PicoCompanionPlatformSecretPort,
} from './platform-unlock.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('Linux Platform Keystore unlock path (ADR 0081 P3)', () => {
  it('persists only ciphertext with private modes and reopens bounded device sessions', async () => {
    const path = temporaryPath();
    const secrets = secretPort('vault passphrase');
    writePicoCompanionPlatformUnlock({
      path,
      profile: profile(),
      passphrase: 'vault passphrase',
      secrets,
    });
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(statSync(dirname(path)).mode & 0o777).toBe(0o700);
    const persisted = readFileSync(path, 'utf8');
    expect(persisted).not.toContain('vault passphrase');
    expect(persisted).not.toContain('pico_identity');
    expect(persisted).toContain('gnome_libsecret');

    const daemon = fakeDaemon();
    const automatic = createPicoCompanionAutomaticVaultUnlock({
      path,
      profile: profile(),
      socketPath: join(tmpdir(), 'fake-vault.sock'),
      secrets,
      connect: daemon.connect,
    });
    await automatic.ensureUnlocked();
    expect(daemon.unlocks).toEqual([
      {
        keyRole: 'device_signing',
        keyFingerprintHex: '77'.repeat(32),
        passphrase: 'vault passphrase',
      },
      {
        keyRole: 'device_key_agreement',
        keyFingerprintHex: '88'.repeat(32),
        passphrase: 'vault passphrase',
      },
    ]);
    await automatic.ensureUnlocked();
    expect(daemon.unlocks).toHaveLength(2);
    await automatic.lock();
    expect(daemon.sessions).toHaveLength(0);
    await automatic.close();
  });

  it('refuses basic_text and a binding copied to another profile', async () => {
    expect(() => writePicoCompanionPlatformUnlock({
      path: temporaryPath(),
      profile: profile(),
      passphrase: 'vault passphrase',
      secrets: secretPort('vault passphrase', 'basic_text'),
    })).toThrow('platform_keystore_plaintext_refused');

    const path = temporaryPath();
    const secrets = secretPort('vault passphrase');
    writePicoCompanionPlatformUnlock({
      path,
      profile: profile(),
      passphrase: 'vault passphrase',
      secrets,
    });
    const daemon = fakeDaemon();
    const changed = profile();
    changed.device.delegationId = 'delegation_other';
    const automatic = createPicoCompanionAutomaticVaultUnlock({
      path,
      profile: changed,
      socketPath: join(tmpdir(), 'fake-vault.sock'),
      secrets,
      connect: daemon.connect,
    });
    await expect(automatic.ensureUnlocked())
      .rejects.toThrow('platform_unlock_profile_mismatch');
    expect(daemon.unlocks).toHaveLength(0);
    await automatic.close();
  });
});

function temporaryPath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'pico-platform-unlock-'));
  temporaryDirectories.push(directory);
  return join(directory, 'companion', 'platform-unlock.json');
}

function secretPort(
  passphrase: string,
  backend = 'gnome_libsecret',
): PicoCompanionPlatformSecretPort {
  return {
    platform: 'linux',
    selectedBackend: () => backend,
    isEncryptionAvailable: () => true,
    encryptString: vi.fn(() => Uint8Array.from([0xa1, 0xb2, 0xc3])),
    decryptString: vi.fn(() => passphrase),
  };
}

function fakeDaemon(): {
  connect: () => Promise<PicoVaultDaemonClient>;
  sessions: PicoVaultDaemonUnlockedSessionDescriptor[];
  unlocks: Array<{
    keyRole: string;
    keyFingerprintHex: string;
    passphrase: string;
  }>;
} {
  const sessions: PicoVaultDaemonUnlockedSessionDescriptor[] = [];
  const unlocks: Array<{
    keyRole: string;
    keyFingerprintHex: string;
    passphrase: string;
  }> = [];
  const connect = async (): Promise<PicoVaultDaemonClient> => {
    const owned = new Set<string>();
    return {
      hello: async () => ({ protocolVersion: 1, daemonVersion: 'test', locked: sessions.length === 0 }),
      status: async () => ({ locked: sessions.length === 0, sessions: [...sessions], keyfiles: [] }),
      unlock: async (input: {
        keyRole: 'pico_identity' | 'device_signing' | 'device_key_agreement';
        keyFingerprintHex: string;
        passphrase: string;
      }) => {
        unlocks.push(input);
        const publicKeyHex = input.keyRole === 'device_signing'
          ? 'aa'.repeat(32)
          : 'bb'.repeat(32);
        sessions.push({ ...input, publicKeyHex });
        owned.add(input.keyFingerprintHex);
        return { ...input, publicKeyHex, idleLockMs: 300_000, maxUnlockDurationMs: 900_000 };
      },
      close: async () => {
        for (let index = sessions.length - 1; index >= 0; index -= 1) {
          if (owned.has(sessions[index]!.keyFingerprintHex)) {
            sessions.splice(index, 1);
          }
        }
      },
    } as unknown as PicoVaultDaemonClient;
  };
  return { connect, sessions, unlocks };
}

function profile(): PicoCompanionProfile {
  return {
    schema: 'pico.companion.profile.v1',
    coreUrl: 'http://127.0.0.1:8321',
    home: { homeHostPicoIdentityFingerprintHex: '99'.repeat(32) },
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
      delegationId: 'delegation_product_1',
    },
  };
}
