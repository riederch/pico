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
import { isPicoVaultPassphrase } from '@pico/vault';
// The narrow subpath, not the barrel: ADR 0131 A1 measured the client's
// closure and found the barrel dragging the CLI, the daemon *server* and
// `reader-access` - which needs `node:worker_threads` - into everything that
// only wanted to open a socket. Same finding ADR 0136 recorded for the tray,
// one package further in.
import {
  connectPicoVaultDaemonClient,
  type PicoVaultDaemonClient,
} from '@pico/vault-daemon/client';
import {
  picoCompanionAndroidAttestationRoots,
  picoCompanionAndroidKeystoreLevels,
  picoCompanionLinuxKeystoreBackends,
  parsePicoCompanionAndroidKeystoreEvidence,
  requirePicoCompanionAndroidKeystore,
  requirePicoCompanionAndroidKeystoreLevel,
  requirePicoCompanionKeystoreBackend,
  type PicoCompanionAndroidKeystoreLevel,
  type PicoCompanionAndroidSecretPort,
  type PicoCompanionLinuxKeystoreBackend,
  type PicoCompanionPlatformSecretPort,
} from './platform-secrets.js';
import type { PicoCompanionProfile } from './profile.js';

export const picoCompanionPlatformUnlockSchema =
  'pico.companion.platform-unlock.v1' as const;

/**
 * Re-exported from `platform-secrets.ts`, which is where they live since
 * 2026-08-16. They moved because this module reaches the Vault daemon and the
 * keystore rules are needed by things that must not (ADR 0154); callers that
 * import them from here keep working.
 */
export {
  picoCompanionLinuxKeystoreBackends,
  type PicoCompanionAndroidSecretPort,
  type PicoCompanionLinuxKeystoreBackend,
  type PicoCompanionPlatformSecretPort,
} from './platform-secrets.js';

/**
 * Beide Ports, wo dieses Modul einen entgegennimmt.
 *
 * ADR 0131: Android ist ein vollwertiger Client. Der Satz hat hier eine
 * konkrete Folge - der automatische Unlock ist **eine** Maschine mit zwei
 * Anschlüssen und nicht zwei Maschinen, die sich ähneln. Was sich zwischen
 * den Plattformen unterscheidet, ist die Frage, was als Keystore zählt; alles
 * danach - Bindung an das Profil, versiegelte Passphrase, die zwei
 * Gerätesitzungen, die wieder aufgemacht werden - ist dasselbe.
 */
export type PicoCompanionSecretPort =
  | PicoCompanionPlatformSecretPort
  | PicoCompanionAndroidSecretPort;

export interface PicoCompanionAutomaticVaultUnlock {
  ensureUnlocked(): Promise<void>;
  lock(): Promise<void>;
  close(): Promise<void>;
}

interface PicoCompanionPlatformUnlockBinding {
  homeHostPicoIdentityFingerprintHex: string;
  identityKeyFingerprintHex: string;
  deviceSigningKeyFingerprintHex: string;
  deviceKeyAgreementKeyFingerprintHex: string;
  delegationId: string;
}

interface PicoCompanionLinuxUnlockRecord {
  schema: typeof picoCompanionPlatformUnlockSchema;
  platform: 'linux';
  backend: PicoCompanionLinuxKeystoreBackend;
  binding: PicoCompanionPlatformUnlockBinding;
  encryptedPassphraseBase64: string;
}

/**
 * Dasselbe für Android, mit einem Unterschied, der die ganze A3-Messung ist:
 * hier steht kein Backend-Name, den der Kern nachschlagen könnte, sondern das
 * **Niveau**, auf das sich zwei unabhängige Quellen geeinigt haben.
 *
 * `sealedWith` wird aufgeschrieben und **nicht verglichen**, und das ist eine
 * Entscheidung. Wurzel und Patchstände ändern sich unter einem Telefon, das
 * genau das Richtige tut - es wird gepatcht, und Google rotiert seine
 * Attestierungswurzeln. Ein Vergleich hätte also die Geräte bestraft, die
 * gepflegt werden. Was sie sind: das Protokoll des Moments, in dem versiegelt
 * wurde, und die einzige Stelle, an der man später sehen kann, dass sich die
 * Pin-Liste unter einem installierten Client bewegt hat - die offene
 * ADR-0134-Frage aus ADR 0131 A3.
 */
interface PicoCompanionAndroidUnlockRecord {
  schema: typeof picoCompanionPlatformUnlockSchema;
  platform: 'android';
  keystoreLevel: PicoCompanionAndroidKeystoreLevel;
  sealedWith: {
    attestationRoot: string;
    osPatchLevel: string;
    bootPatchLevel: string;
  };
  binding: PicoCompanionPlatformUnlockBinding;
  encryptedPassphraseBase64: string;
}

type PicoCompanionPlatformUnlockRecord =
  | PicoCompanionLinuxUnlockRecord
  | PicoCompanionAndroidUnlockRecord;

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
export async function writePicoCompanionPlatformUnlock(input: {
  path: string;
  profile: PicoCompanionProfile;
  passphrase: string;
  secrets: PicoCompanionSecretPort;
}): Promise<void> {
  assertPassphrase(input.passphrase);
  // **Zuerst** urteilen, dann versiegeln. Ein Keystore, den dieses Produkt
  // ablehnt, darf die Passphrase nicht einmal kurz gesehen haben; die
  // Reihenfolge ist derselbe Gedanke wie die Wurzel vor der Erweiterung.
  const header = input.secrets.platform === 'android'
    ? await androidHeader(input.secrets)
    : ({ platform: 'linux', backend: requireUsableBackend(input.secrets) } as const);
  const encrypted = await input.secrets.encryptString(input.passphrase);
  if (!(encrypted instanceof Uint8Array)
    || encrypted.byteLength === 0
    || encrypted.byteLength > 16 * 1_024) {
    throw new Error('invalid_platform_unlock_ciphertext');
  }
  const record: PicoCompanionPlatformUnlockRecord = {
    schema: picoCompanionPlatformUnlockSchema,
    ...header,
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
  secrets: PicoCompanionSecretPort;
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
            let unlocked;
            try {
              unlocked = await nextHold.unlock({ ...target, passphrase });
            } catch (refused) {
              /**
               * **Zwei Prozesse, ein Daemon** - am Telefon gefunden, 2026-08-26.
               *
               * Die Reihenfolge oben gilt innerhalb dieses Prozesses. Auf
               * Android hält nodejs-mobile eine Node-Instanz je Prozess, also
               * ist jede Sonde ein eigener: zwei starteten zusammen, lasen
               * beide einen leeren Status und entsperrten beide. Die zweite
               * bekam `already_unlocked` und meldete daraufhin einen
               * Fehlschlag - von einer Methode, die `ensureUnlocked` heißt und
               * deren Zusage in diesem Moment erfüllt war.
               *
               * `already_unlocked` nennt genau diesen Schlüssel. Es ist damit
               * dieselbe Lage wie der Frühausstieg oben, nur im Wettlauf
               * entstanden - **und sie wird nachgesehen, nicht angenommen**:
               * ein Erfolg, der aus einer Fehlermeldung geschlossen wird, ohne
               * den Zustand zu prüfen, ist geraten.
               */
              const named = refused instanceof Error ? refused.message : String(refused);
              if (!named.includes('already_unlocked')) {
                throw refused;
              }
              const after = await readStatus(connect, input.socketPath);
              if (!after.sessions.some((session) =>
                session.keyRole === target.keyRole
                && session.keyFingerprintHex === target.keyFingerprintHex)) {
                throw refused;
              }
              continue;
            }
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
    secrets: PicoCompanionSecretPort;
  },
  use: (passphrase: string) => Promise<void>,
): Promise<void> {
  const record = readPicoCompanionPlatformUnlock(input.path);
  assertBinding(record, input.profile);
  await assertSameKeystore(record, input.secrets);
  let passphrase = await input.secrets.decryptString(
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

/**
 * Welche der beiden Formen es ist, entscheidet `platform` - und nur dieses
 * Feld wird vorher angefasst.
 *
 * Der Grund ist die Feldliste selbst: `exactRecord` verlangt genau die Namen,
 * die zu einer Plattform gehören, und ein Android-Satz durch die Linux-Liste
 * gelesen fiele mit "unbekanntes Feld" durch statt mit "falsche Plattform".
 * Die zweite Auskunft ist die, mit der jemand etwas anfangen kann.
 */
function parsePicoCompanionPlatformUnlock(
  value: unknown,
): PicoCompanionPlatformUnlockRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('invalid_platform_unlock_record');
  }
  return (value as Record<string, unknown>).platform === 'android'
    ? parseAndroidUnlock(value)
    : parseLinuxUnlock(value);
}

function parseLinuxUnlock(value: unknown): PicoCompanionLinuxUnlockRecord {
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
  return Object.freeze({
    schema: picoCompanionPlatformUnlockSchema,
    platform: 'linux',
    backend: record.backend as PicoCompanionLinuxKeystoreBackend,
    binding: parseBinding(record.binding),
    encryptedPassphraseBase64: parseCiphertext(record.encryptedPassphraseBase64),
  }) as PicoCompanionLinuxUnlockRecord;
}

function parseAndroidUnlock(value: unknown): PicoCompanionAndroidUnlockRecord {
  const record = exactRecord(value, [
    'schema',
    'platform',
    'keystoreLevel',
    'sealedWith',
    'binding',
    'encryptedPassphraseBase64',
  ], 'invalid_platform_unlock_record');
  if (record.schema !== picoCompanionPlatformUnlockSchema
    || !picoCompanionAndroidKeystoreLevels.includes(
      record.keystoreLevel as PicoCompanionAndroidKeystoreLevel,
    )) {
    throw new Error('invalid_platform_unlock_header');
  }
  const sealed = exactRecord(record.sealedWith, [
    'attestationRoot',
    'osPatchLevel',
    'bootPatchLevel',
  ], 'invalid_platform_unlock_sealed_with');
  if (!picoCompanionAndroidAttestationRoots.includes(
    sealed.attestationRoot as typeof picoCompanionAndroidAttestationRoots[number],
  )) {
    throw new Error('invalid_platform_unlock_sealed_with');
  }
  for (const field of ['osPatchLevel', 'bootPatchLevel'] as const) {
    // `absent` gehört dazu: eine Erweiterung ohne Patchstand ist ein
    // ehrlicher Befund, und ihn als leeres Feld zu schreiben hieße, ihn mit
    // einem Fehler zu verwechseln.
    if (typeof sealed[field] !== 'string'
      || !/^(?:\d{6,8}|absent)$/u.test(sealed[field] as string)) {
      throw new Error('invalid_platform_unlock_sealed_with');
    }
  }
  return Object.freeze({
    schema: picoCompanionPlatformUnlockSchema,
    platform: 'android',
    keystoreLevel: record.keystoreLevel as PicoCompanionAndroidKeystoreLevel,
    sealedWith: Object.freeze({
      attestationRoot: sealed.attestationRoot as string,
      osPatchLevel: sealed.osPatchLevel as string,
      bootPatchLevel: sealed.bootPatchLevel as string,
    }),
    binding: parseBinding(record.binding),
    encryptedPassphraseBase64: parseCiphertext(record.encryptedPassphraseBase64),
  }) as PicoCompanionAndroidUnlockRecord;
}

function parseBinding(value: unknown): PicoCompanionPlatformUnlockBinding {
  const binding = exactRecord(value, [
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
  // Feld für Feld statt Spread: `exactRecord` hat die Namen schon geprüft,
  // aber ein Spread trägt den Typ `unknown` weiter, und ein Cast darüber wäre
  // genau die Zusicherung, die diese Funktion eigentlich erarbeitet.
  return Object.freeze({
    homeHostPicoIdentityFingerprintHex:
      binding.homeHostPicoIdentityFingerprintHex as string,
    identityKeyFingerprintHex: binding.identityKeyFingerprintHex as string,
    deviceSigningKeyFingerprintHex:
      binding.deviceSigningKeyFingerprintHex as string,
    deviceKeyAgreementKeyFingerprintHex:
      binding.deviceKeyAgreementKeyFingerprintHex as string,
    delegationId: binding.delegationId,
  });
}

function parseCiphertext(value: unknown): string {
  if (typeof value !== 'string'
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u
      .test(value)
    || Buffer.from(value, 'base64').byteLength === 0
    || Buffer.from(value, 'base64').byteLength > 16 * 1_024) {
    throw new Error('invalid_platform_unlock_ciphertext');
  }
  return value;
}

const requireUsableBackend = requirePicoCompanionKeystoreBackend;

async function androidHeader(secrets: PicoCompanionAndroidSecretPort): Promise<{
  platform: 'android';
  keystoreLevel: PicoCompanionAndroidKeystoreLevel;
  sealedWith: PicoCompanionAndroidUnlockRecord['sealedWith'];
}> {
  const evidence = parsePicoCompanionAndroidKeystoreEvidence(
    await secrets.keystoreEvidence(),
  );
  return {
    platform: 'android',
    keystoreLevel: requirePicoCompanionAndroidKeystoreLevel(evidence),
    sealedWith: {
      attestationRoot: evidence.attestationRoot,
      osPatchLevel: evidence.osPatchLevel,
      bootPatchLevel: evidence.bootPatchLevel,
    },
  };
}

/**
 * Derselbe Keystore wie beim Versiegeln, oder gar keiner.
 *
 * Auf Linux ist das der Backend-Name; auf Android das Niveau. Beide werden
 * auf **Gleichheit** geprüft, nicht auf "mindestens so gut": ein Gerät, dessen
 * Schlüssel eben noch im sicheren Element lagen und heute im TEE, hat etwas
 * getan, das eine Erklärung braucht - und die versiegelten Bytes ließen sich
 * ohnehin nicht mehr öffnen, weil sie an den alten Schlüssel gebunden sind.
 * Die Ablehnung ist also die ehrliche Auskunft und keine Härte.
 */
async function assertSameKeystore(
  record: PicoCompanionPlatformUnlockRecord,
  secrets: PicoCompanionSecretPort,
): Promise<void> {
  if (record.platform !== secrets.platform) {
    throw new Error('platform_unlock_platform_changed');
  }
  if (record.platform === 'android') {
    if (record.keystoreLevel
      !== await requirePicoCompanionAndroidKeystore(
        secrets as PicoCompanionAndroidSecretPort)) {
      throw new Error('platform_unlock_level_changed');
    }
    return;
  }
  if (record.backend
    !== requireUsableBackend(secrets as PicoCompanionPlatformSecretPort)) {
    throw new Error('platform_unlock_backend_changed');
  }
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

// The bound is `@pico/vault`'s, where a passphrase becomes a keyfile; the
// refusal stays this surface's own, because a person who is told no should
// hear it in the vocabulary of what they were doing.
function assertPassphrase(value: unknown): asserts value is string {
  if (!isPicoVaultPassphrase(value)) {
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
