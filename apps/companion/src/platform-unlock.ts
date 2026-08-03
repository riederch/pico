import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import {
  connectPicoVaultDaemonClient,
  type PicoVaultDaemonClient,
} from '@pico/vault-daemon';
import type { PicoCompanionProfile } from './profile.js';

export const picoCompanionPlatformUnlockSchema =
  'pico.companion.platform-unlock.v1' as const;

export const picoCompanionLinuxKeystoreBackends = [
  'gnome_libsecret',
  'kwallet',
  'kwallet5',
  'kwallet6',
] as const;

export type PicoCompanionLinuxKeystoreBackend =
  typeof picoCompanionLinuxKeystoreBackends[number];

export interface PicoCompanionPlatformSecretPort {
  platform: 'linux';
  selectedBackend(): string;
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Uint8Array;
  decryptString(encrypted: Uint8Array): string;
}

export interface PicoCompanionAutomaticVaultUnlock {
  ensureUnlocked(): Promise<void>;
  lock(): Promise<void>;
  close(): Promise<void>;
}

interface PicoCompanionPlatformUnlockRecord {
  schema: typeof picoCompanionPlatformUnlockSchema;
  platform: 'linux';
  backend: PicoCompanionLinuxKeystoreBackend;
  binding: {
    homeHostPicoIdentityFingerprintHex: string;
    identityKeyFingerprintHex: string;
    deviceSigningKeyFingerprintHex: string;
    deviceKeyAgreementKeyFingerprintHex: string;
    delegationId: string;
  };
  encryptedPassphraseBase64: string;
}

export function defaultPicoCompanionPlatformUnlockPath(
  profilePath: string,
): string {
  return join(dirname(profilePath), 'platform-unlock.json');
}

/**
 * Stores only an OS-keystore-encrypted unlock secret. Canonical keyfiles stay
 * unchanged and the identity root is deliberately absent from the automatic
 * unlock list. The passphrase string is an explicitly documented ADR 0123
 * JavaScript-runtime debt; it never crosses renderer IPC or persistent JSON.
 */
export function writePicoCompanionPlatformUnlock(input: {
  path: string;
  profile: PicoCompanionProfile;
  passphrase: string;
  secrets: PicoCompanionPlatformSecretPort;
}): void {
  assertPassphrase(input.passphrase);
  const backend = requireUsableBackend(input.secrets);
  const encrypted = input.secrets.encryptString(input.passphrase);
  if (!(encrypted instanceof Uint8Array)
    || encrypted.byteLength === 0
    || encrypted.byteLength > 16 * 1_024) {
    throw new Error('invalid_platform_unlock_ciphertext');
  }
  const record: PicoCompanionPlatformUnlockRecord = {
    schema: picoCompanionPlatformUnlockSchema,
    platform: 'linux',
    backend,
    binding: profileBinding(input.profile),
    encryptedPassphraseBase64: Buffer.from(encrypted).toString('base64'),
  };
  const parsed = parsePicoCompanionPlatformUnlock(record);
  mkdirSync(dirname(input.path), { recursive: true, mode: 0o700 });
  const temporaryPath = `${input.path}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(parsed, null, 2)}\n`, {
    mode: 0o600,
  });
  chmodSync(temporaryPath, 0o600);
  fsyncPath(temporaryPath, 'r+');
  renameSync(temporaryPath, input.path);
  fsyncPath(dirname(input.path), 'r');
}

export function hasPicoCompanionPlatformUnlock(path: string): boolean {
  return existsSync(path);
}

/**
 * Re-establishes only the two operational device sessions. The daemon's own
 * five-minute idle and fifteen-minute absolute ceilings remain authoritative;
 * each authenticated carrier run calls `ensureUnlocked` and obtains a fresh,
 * bounded session if those ceilings already locked the previous one.
 */
export function createPicoCompanionAutomaticVaultUnlock(input: {
  path: string;
  profile: PicoCompanionProfile;
  socketPath: string;
  secrets: PicoCompanionPlatformSecretPort;
  connect?: typeof connectPicoVaultDaemonClient;
}): PicoCompanionAutomaticVaultUnlock {
  const connect = input.connect ?? connectPicoVaultDaemonClient;
  let holdClient: PicoVaultDaemonClient | null = null;
  let closed = false;
  let serial: Promise<void> = Promise.resolve();

  const runSerial = async (operation: () => Promise<void>): Promise<void> => {
    const result = serial.then(operation, operation);
    serial = result.then(() => undefined, () => undefined);
    await result;
  };
  const closeHold = async (): Promise<void> => {
    const current = holdClient;
    holdClient = null;
    await current?.close();
  };

  return {
    ensureUnlocked: async () => await runSerial(async () => {
      if (closed) {
        throw new Error('platform_unlock_closed');
      }
      let status = await readStatus(connect, input.socketPath);
      if (hasTargetSessions(status.sessions, input.profile)) {
        return;
      }

      // A partial session set cannot be repaired while retaining ownership of
      // an old subset: closing first prevents one long-lived stale hold from
      // accumulating across absolute daemon expiries.
      await closeHold();
      status = await readStatus(connect, input.socketPath);
      const missing = targetUnlocks(input.profile).filter((target) =>
        !status.sessions.some((session) =>
          session.keyRole === target.keyRole
          && session.keyFingerprintHex === target.keyFingerprintHex));
      if (missing.length === 0) {
        return;
      }

      const nextHold = await connect({ socketPath: input.socketPath });
      try {
        await nextHold.hello();
        await withPlatformPassphrase({
          path: input.path,
          profile: input.profile,
          secrets: input.secrets,
        }, async (passphrase) => {
          for (const target of missing) {
            const unlocked = await nextHold.unlock({ ...target, passphrase });
            if (unlocked.keyRole !== target.keyRole
              || unlocked.keyFingerprintHex !== target.keyFingerprintHex) {
              throw new Error('platform_unlock_binding_mismatch');
            }
          }
        });
        holdClient = nextHold;
      } catch (error) {
        await nextHold.close();
        throw error;
      }
    }),
    lock: async () => await runSerial(async () => {
      await closeHold();
    }),
    close: async () => await runSerial(async () => {
      closed = true;
      await closeHold();
    }),
  };
}

async function withPlatformPassphrase(
  input: {
    path: string;
    profile: PicoCompanionProfile;
    secrets: PicoCompanionPlatformSecretPort;
  },
  use: (passphrase: string) => Promise<void>,
): Promise<void> {
  const record = readPicoCompanionPlatformUnlock(input.path);
  assertBinding(record, input.profile);
  const backend = requireUsableBackend(input.secrets);
  if (record.backend !== backend) {
    throw new Error('platform_unlock_backend_changed');
  }
  let passphrase = input.secrets.decryptString(
    Buffer.from(record.encryptedPassphraseBase64, 'base64'),
  );
  try {
    assertPassphrase(passphrase);
    await use(passphrase);
  } finally {
    // Strings cannot be reliably erased in V8. Dropping the named reference is
    // best-effort scope reduction, not an erasure claim (ADR 0123).
    passphrase = '';
  }
}

function readPicoCompanionPlatformUnlock(
  path: string,
): PicoCompanionPlatformUnlockRecord {
  try {
    return parsePicoCompanionPlatformUnlock(
      JSON.parse(readFileSync(path, 'utf8')),
    );
  } catch (error) {
    throw new Error(`unreadable_platform_unlock:${(error as Error).message}`);
  }
}

function parsePicoCompanionPlatformUnlock(
  value: unknown,
): PicoCompanionPlatformUnlockRecord {
  const record = exactRecord(value, [
    'schema',
    'platform',
    'backend',
    'binding',
    'encryptedPassphraseBase64',
  ], 'invalid_platform_unlock_record');
  if (record.schema !== picoCompanionPlatformUnlockSchema
    || record.platform !== 'linux'
    || !picoCompanionLinuxKeystoreBackends.includes(
      record.backend as PicoCompanionLinuxKeystoreBackend,
    )) {
    throw new Error('invalid_platform_unlock_header');
  }
  const binding = exactRecord(record.binding, [
    'homeHostPicoIdentityFingerprintHex',
    'identityKeyFingerprintHex',
    'deviceSigningKeyFingerprintHex',
    'deviceKeyAgreementKeyFingerprintHex',
    'delegationId',
  ], 'invalid_platform_unlock_binding');
  for (const field of [
    'homeHostPicoIdentityFingerprintHex',
    'identityKeyFingerprintHex',
    'deviceSigningKeyFingerprintHex',
    'deviceKeyAgreementKeyFingerprintHex',
  ] as const) {
    assertFingerprint(binding[field]);
  }
  if (typeof binding.delegationId !== 'string'
    || !/^[A-Za-z0-9._:/+-]{1,1024}$/u.test(binding.delegationId)) {
    throw new Error('invalid_platform_unlock_delegation');
  }
  if (typeof record.encryptedPassphraseBase64 !== 'string'
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u
      .test(record.encryptedPassphraseBase64)
    || Buffer.from(record.encryptedPassphraseBase64, 'base64').byteLength === 0
    || Buffer.from(record.encryptedPassphraseBase64, 'base64').byteLength
      > 16 * 1_024) {
    throw new Error('invalid_platform_unlock_ciphertext');
  }
  return Object.freeze({
    schema: picoCompanionPlatformUnlockSchema,
    platform: 'linux',
    backend: record.backend,
    binding: Object.freeze({ ...binding }),
    encryptedPassphraseBase64: record.encryptedPassphraseBase64,
  }) as PicoCompanionPlatformUnlockRecord;
}

function requireUsableBackend(
  secrets: PicoCompanionPlatformSecretPort,
): PicoCompanionLinuxKeystoreBackend {
  if (secrets.platform !== 'linux' || !secrets.isEncryptionAvailable()) {
    throw new Error('platform_keystore_unavailable');
  }
  const backend = secrets.selectedBackend();
  if (!picoCompanionLinuxKeystoreBackends.includes(
    backend as PicoCompanionLinuxKeystoreBackend,
  )) {
    throw new Error(backend === 'basic_text'
      ? 'platform_keystore_plaintext_refused'
      : 'platform_keystore_unavailable');
  }
  return backend as PicoCompanionLinuxKeystoreBackend;
}

function profileBinding(
  profile: PicoCompanionProfile,
): PicoCompanionPlatformUnlockRecord['binding'] {
  return {
    homeHostPicoIdentityFingerprintHex:
      profile.home.homeHostPicoIdentityFingerprintHex,
    identityKeyFingerprintHex: profile.identity.keyFingerprintHex,
    deviceSigningKeyFingerprintHex:
      profile.device.signingKeyFingerprintHex,
    deviceKeyAgreementKeyFingerprintHex:
      profile.device.keyAgreementKeyFingerprintHex,
    delegationId: profile.device.delegationId,
  };
}

function assertBinding(
  record: PicoCompanionPlatformUnlockRecord,
  profile: PicoCompanionProfile,
): void {
  const expected = profileBinding(profile);
  if (Object.keys(expected).some((key) =>
    record.binding[key as keyof typeof expected]
      !== expected[key as keyof typeof expected])) {
    throw new Error('platform_unlock_profile_mismatch');
  }
}

function targetUnlocks(profile: PicoCompanionProfile): Array<{
  keyRole: 'device_signing' | 'device_key_agreement';
  keyFingerprintHex: string;
}> {
  return [
    {
      keyRole: 'device_signing',
      keyFingerprintHex: profile.device.signingKeyFingerprintHex,
    },
    {
      keyRole: 'device_key_agreement',
      keyFingerprintHex: profile.device.keyAgreementKeyFingerprintHex,
    },
  ];
}

function hasTargetSessions(
  sessions: Array<{ keyRole: string; keyFingerprintHex: string }>,
  profile: PicoCompanionProfile,
): boolean {
  return targetUnlocks(profile).every((target) => sessions.some((session) =>
    session.keyRole === target.keyRole
    && session.keyFingerprintHex === target.keyFingerprintHex));
}

async function readStatus(
  connect: typeof connectPicoVaultDaemonClient,
  socketPath: string,
) {
  const client = await connect({ socketPath });
  try {
    await client.hello();
    return await client.status();
  } finally {
    await client.close();
  }
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  reason: string,
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(reason);
  }
  const record = value as Record<string, unknown>;
  const expected = new Set(keys);
  if (Object.keys(record).length !== expected.size
    || Object.keys(record).some((key) => !expected.has(key))) {
    throw new Error(reason);
  }
  return record;
}

function assertFingerprint(value: unknown): void {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error('invalid_platform_unlock_fingerprint');
  }
}

function assertPassphrase(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1_024) {
    throw new Error('invalid_platform_unlock_passphrase');
  }
}

function fsyncPath(path: string, flags: 'r' | 'r+'): void {
  const handle = openSync(path, flags);
  try {
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
}
