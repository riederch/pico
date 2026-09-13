import { tmpdir } from 'node:os';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
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
  type PicoCompanionAndroidSecretPort,
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
    await writePicoCompanionPlatformUnlock({
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
    await expect(writePicoCompanionPlatformUnlock({
      path: temporaryPath(),
      profile: profile(),
      passphrase: 'vault passphrase',
      secrets: secretPort('vault passphrase', 'basic_text'),
    })).rejects.toThrow('platform_keystore_plaintext_refused');

    const path = temporaryPath();
    const secrets = secretPort('vault passphrase');
    await writePicoCompanionPlatformUnlock({
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

/**
 * ADR 0131 A3 / ADR 0081 P3. Dieselbe Maschine, anderer Anschluss.
 *
 * Die Belege stammen aus der Messung auf einem Galaxy A55 (Android 16,
 * Patchstand 2026-07-05, EC-Wurzel) - dieselben Werte, die
 * `KeystoreProbeService` am 2026-08-21 in der Form des Kerns geschrieben hat.
 */
describe('Android Keystore unlock path (ADR 0131 A3)', () => {
  it('seals against the level two sources agreed on, and reopens the same sessions', async () => {
    const path = temporaryPath();
    const secrets = androidPort('vault passphrase');
    await writePicoCompanionPlatformUnlock({
      path,
      profile: profile(),
      passphrase: 'vault passphrase',
      secrets,
    });
    expect(statSync(path).mode & 0o777).toBe(0o600);
    const persisted = JSON.parse(readFileSync(path, 'utf8'));
    expect(persisted.platform).toBe('android');
    expect(persisted.keystoreLevel).toBe('trusted_environment');
    expect(persisted.backend).toBeUndefined();
    expect(readFileSync(path, 'utf8')).not.toContain('vault passphrase');
    // Das Protokoll des Moments: gegen welche Wurzel und welchen Patchstand
    // versiegelt wurde. Aufgeschrieben, nicht verglichen.
    expect(persisted.sealedWith).toEqual({
      attestationRoot: 'google_ec_key_attestation_ca1',
      osPatchLevel: '202607',
      bootPatchLevel: '20260705',
    });

    const daemon = fakeDaemon();
    const automatic = createPicoCompanionAutomaticVaultUnlock({
      path,
      profile: profile(),
      socketPath: join(tmpdir(), 'fake-vault.sock'),
      secrets,
      connect: daemon.connect,
    });
    await automatic.ensureUnlocked();
    expect(daemon.unlocks.map((unlock) => unlock.keyRole))
      .toEqual(['device_signing', 'device_key_agreement']);
    await automatic.close();
  });

  it('judges the keystore before the passphrase is ever handed to it', async () => {
    // Die Reihenfolge ist die Aussage: ein Keystore, den dieses Produkt
    // ablehnt, darf die Passphrase nicht einmal kurz gesehen haben.
    const secrets = androidPort('vault passphrase', {
      keyInfoLevel: 'software',
      attestedKeyLevel: 'software',
      attestationLevel: 'software',
    });
    await expect(writePicoCompanionPlatformUnlock({
      path: temporaryPath(),
      profile: profile(),
      passphrase: 'vault passphrase',
      secrets,
    })).rejects.toThrow('platform_keystore_software_refused');
    expect(secrets.encryptString).not.toHaveBeenCalled();
  });

  it('refuses a chain that reached no pinned root, at sealing time', async () => {
    await expect(writePicoCompanionPlatformUnlock({
      path: temporaryPath(),
      profile: profile(),
      passphrase: 'vault passphrase',
      secrets: androidPort('vault passphrase', { attestationRoot: 'none' }),
    })).rejects.toThrow('platform_keystore_attestation_unrooted');
  });

  it('nimmt ein verlorenes Wettrennen als das, was es ist - und sieht nach', async () => {
    /**
     * **Zwei Prozesse, ein Daemon** - am Telefon gefunden, 2026-08-26.
     *
     * Auf Android hält nodejs-mobile eine Node-Instanz je Prozess, also ist
     * jede Sonde ein eigener Prozess. Zwei starteten zusammen, lasen beide
     * einen leeren Status und entsperrten beide; die zweite bekam
     * `already_unlocked` und meldete einen Fehlschlag - von einer Methode, die
     * `ensureUnlocked` heißt und deren Zusage in diesem Moment erfüllt war.
     * Auf dem Bildschirm wurde daraus „read_failed".
     */
    const path = temporaryPath();
    await writePicoCompanionPlatformUnlock({
      path,
      profile: profile(),
      passphrase: 'vault passphrase',
      secrets: androidPort('vault passphrase'),
    });
    const daemon = fakeDaemon();
    const racing = {
      ...daemon,
      connect: async () => {
        const client = await daemon.connect();
        return {
          ...client,
          unlock: async (input: {
            keyRole: 'pico_identity' | 'device_signing' | 'device_key_agreement';
            keyFingerprintHex: string;
            passphrase: string;
          }) => {
            // Der andere Prozess war schneller: der Schlüssel ist offen, und
            // dieser Aufruf erfährt es als Fehler.
            daemon.sessions.push({
              ...input,
              publicKeyHex: input.keyRole === 'device_signing' ? 'aa'.repeat(32) : 'bb'.repeat(32),
            } as never);
            throw new Error('already_unlocked');
          },
        } as unknown as PicoVaultDaemonClient;
      },
    };
    const automatic = createPicoCompanionAutomaticVaultUnlock({
      path,
      profile: profile(),
      socketPath: join(tmpdir(), 'fake-vault.sock'),
      secrets: androidPort('vault passphrase'),
      connect: racing.connect,
    });

    await expect(automatic.ensureUnlocked()).resolves.toBeUndefined();
    await automatic.close();
  });

  it('meldet ein `already_unlocked` weiter, hinter dem kein offener Schlüssel steht', async () => {
    // Der Unterschied zwischen nachsehen und annehmen. Ein Erfolg, der aus
    // einer Fehlermeldung geschlossen wird, ohne den Zustand zu prüfen, ist
    // geraten - und hier ist nichts offen.
    const path = temporaryPath();
    await writePicoCompanionPlatformUnlock({
      path,
      profile: profile(),
      passphrase: 'vault passphrase',
      secrets: androidPort('vault passphrase'),
    });
    const daemon = fakeDaemon();
    const lying = async () => {
      const client = await daemon.connect();
      return {
        ...client,
        unlock: async () => { throw new Error('already_unlocked'); },
      } as unknown as PicoVaultDaemonClient;
    };
    const automatic = createPicoCompanionAutomaticVaultUnlock({
      path,
      profile: profile(),
      socketPath: join(tmpdir(), 'fake-vault.sock'),
      secrets: androidPort('vault passphrase'),
      connect: lying,
    });

    await expect(automatic.ensureUnlocked()).rejects.toThrow('already_unlocked');
    await automatic.close();
  });

  it('refuses to open what a different keystore level sealed', async () => {
    const path = temporaryPath();
    await writePicoCompanionPlatformUnlock({
      path,
      profile: profile(),
      passphrase: 'vault passphrase',
      secrets: androidPort('vault passphrase'),
    });
    const daemon = fakeDaemon();
    const automatic = createPicoCompanionAutomaticVaultUnlock({
      path,
      profile: profile(),
      socketPath: join(tmpdir(), 'fake-vault.sock'),
      // Dasselbe Telefon, das heute StrongBox meldet. Die versiegelten Bytes
      // hängen am alten Schlüssel und ließen sich ohnehin nicht öffnen; die
      // Ablehnung sagt nur, was ohne sie erst der Entschlüsselungsfehler
      // gesagt hätte - und der sagt es nicht so deutlich.
      secrets: androidPort('vault passphrase', {
        keyInfoLevel: 'strongbox',
        attestedKeyLevel: 'strongbox',
        attestationLevel: 'strongbox',
      }),
      connect: daemon.connect,
    });
    await expect(automatic.ensureUnlocked())
      .rejects.toThrow('platform_unlock_level_changed');
    expect(daemon.unlocks).toHaveLength(0);
    await automatic.close();
  });

  it('refuses to read one platform\'s record with the other platform\'s port', async () => {
    const path = temporaryPath();
    await writePicoCompanionPlatformUnlock({
      path,
      profile: profile(),
      passphrase: 'vault passphrase',
      secrets: secretPort('vault passphrase'),
    });
    const daemon = fakeDaemon();
    const automatic = createPicoCompanionAutomaticVaultUnlock({
      path,
      profile: profile(),
      socketPath: join(tmpdir(), 'fake-vault.sock'),
      secrets: androidPort('vault passphrase'),
      connect: daemon.connect,
    });
    await expect(automatic.ensureUnlocked())
      .rejects.toThrow('platform_unlock_platform_changed');
    await automatic.close();
  });

  it('opens after the phone was patched, which is the point of not comparing', async () => {
    const path = temporaryPath();
    await writePicoCompanionPlatformUnlock({
      path,
      profile: profile(),
      passphrase: 'vault passphrase',
      secrets: androidPort('vault passphrase'),
    });
    const daemon = fakeDaemon();
    const automatic = createPicoCompanionAutomaticVaultUnlock({
      path,
      profile: profile(),
      socketPath: join(tmpdir(), 'fake-vault.sock'),
      // Ein Telefon, das getan hat, was es soll: neuer Patchstand, und Google
      // hat die Wurzel gewechselt. Beides würde ein Vergleich bestrafen.
      secrets: androidPort('vault passphrase', {
        attestationRoot: 'google_rsa_f92009e853b6b045',
        osPatchLevel: '202612',
        bootPatchLevel: '20261205',
      }),
      connect: daemon.connect,
    });
    await automatic.ensureUnlocked();
    expect(daemon.unlocks).toHaveLength(2);
    await automatic.close();
  });

  /**
   * Befund B158. Ein Satz, der gar keiner ist, hatte keinen Test - und er steht
   * vor allen anderen Pruefungen dieser Datei. Ohne ihn liefe der Rest gegen
   * `null` oder ein Array und faellt dort mit irgendetwas, statt hier mit einer
   * Auskunft.
   *
   * Der Grund reist zusammengesetzt heraus: der Leser sagt, dass er die Datei
   * nicht lesen konnte, und haengt an, warum. Beides ist eine eigene Auskunft -
   * "nicht da" und "da, aber keiner" sind verschiedene Lagen.
   */
  it('refuses a stored record that is not a record at all', async () => {
    const secrets = androidPort('vault passphrase');
    for (const written of ['[]', '42', 'null', '"nope"']) {
      const path = temporaryPath();
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, written);
      const daemon = fakeDaemon();
      const automatic = createPicoCompanionAutomaticVaultUnlock({
        path,
        profile: profile(),
        socketPath: join(tmpdir(), 'fake-vault.sock'),
        secrets,
        connect: daemon.connect,
      });
      await expect(automatic.ensureUnlocked(), written)
        .rejects.toThrow('unreadable_platform_unlock:invalid_platform_unlock_record');
      await automatic.close();
    }
  });

  it('refuses a record whose sealing note was tampered with', async () => {
    const path = temporaryPath();
    const secrets = androidPort('vault passphrase');
    await writePicoCompanionPlatformUnlock({
      path, profile: profile(), passphrase: 'vault passphrase', secrets,
    });
    const record = JSON.parse(readFileSync(path, 'utf8'));
    record.sealedWith.attestationRoot = 'google_ec_ca1';
    writeFileSync(path, JSON.stringify(record));
    const daemon = fakeDaemon();
    const automatic = createPicoCompanionAutomaticVaultUnlock({
      path,
      profile: profile(),
      socketPath: join(tmpdir(), 'fake-vault.sock'),
      secrets,
      connect: daemon.connect,
    });
    await expect(automatic.ensureUnlocked())
      .rejects.toThrow('invalid_platform_unlock_sealed_with');
    await automatic.close();
  });
});

/**
 * Der Belegsatz vom Galaxy A55, mit je einer Stelle veränderbar.
 *
 * Die Vorgabe ist gemessen und nicht erfunden: ein ausgedachter Satz würde
 * dieselben Prüfungen bestehen und nichts darüber sagen, ob die Form zu dem
 * passt, was ein Telefon tatsächlich schreibt.
 */
function androidPort(
  passphrase: string,
  evidence: Record<string, unknown> = {},
): PicoCompanionAndroidSecretPort & { encryptString: ReturnType<typeof vi.fn> } {
  return {
    platform: 'android',
    keystoreEvidence: async () => ({
      platform: 'android',
      keyInfoLevel: 'trusted_environment',
      attestedKeyLevel: 'trusted_environment',
      attestationLevel: 'trusted_environment',
      attestationRoot: 'google_ec_key_attestation_ca1',
      challengeMatches: true,
      verifiedBootState: 'verified',
      deviceLocked: true,
      osPatchLevel: '202607',
      bootPatchLevel: '20260705',
      ...evidence,
    }),
    encryptString: vi.fn(async () => Uint8Array.from([0xa1, 0xb2, 0xc3])),
    decryptString: vi.fn(async () => passphrase),
  };
}

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
