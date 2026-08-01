import {
  chmodSync,
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * ADR 0113: the device-local companion profile. Deployment/binding data in
 * the ADR 0104 sense - the facts the authenticated lifecycle read needs -
 * never person settings and never secrets. Onboarding, enrollment and
 * restore write it when their product surfaces land (C2/S3).
 */
export const picoCompanionProfileSchema = 'pico.companion.profile.v1' as const;

export interface PicoCompanionProfile {
  schema: typeof picoCompanionProfileSchema;
  coreUrl: string;
  host: {
    signingPublicKeyHex: string;
    signingKeyFingerprintHex: string;
    keyAgreementPublicKeyHex: string;
    keyAgreementKeyFingerprintHex: string;
  };
  identity: {
    keyFingerprintHex: string;
    publicKeyHex: string;
  };
  device: {
    signingKeyFingerprintHex: string;
    keyAgreementKeyFingerprintHex: string;
    delegationId: string;
  };
}

export function defaultPicoCompanionProfilePath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return env.PICO_COMPANION_PROFILE
    ?? join(homedir(), '.pico', 'companion', 'profile.json');
}

export function parsePicoCompanionProfile(value: unknown): PicoCompanionProfile {
  const record = assertExactKeys(value, [
    'schema',
    'coreUrl',
    'host',
    'identity',
    'device',
  ], 'profile');
  if (record.schema !== picoCompanionProfileSchema) {
    throw new Error('invalid_companion_profile_schema');
  }
  assertCoreUrl(record.coreUrl);

  const host = assertExactKeys(record.host, [
    'signingPublicKeyHex',
    'signingKeyFingerprintHex',
    'keyAgreementPublicKeyHex',
    'keyAgreementKeyFingerprintHex',
  ], 'profile_host');
  assertHex32(host.signingPublicKeyHex, 'invalid_host_signing_public_key');
  assertHex32(host.signingKeyFingerprintHex, 'invalid_host_signing_fingerprint');
  assertHex32(host.keyAgreementPublicKeyHex, 'invalid_host_agreement_public_key');
  assertHex32(host.keyAgreementKeyFingerprintHex, 'invalid_host_agreement_fingerprint');

  const identity = assertExactKeys(record.identity, [
    'keyFingerprintHex',
    'publicKeyHex',
  ], 'profile_identity');
  assertHex32(identity.keyFingerprintHex, 'invalid_identity_fingerprint');
  assertHex32(identity.publicKeyHex, 'invalid_identity_public_key');

  const device = assertExactKeys(record.device, [
    'signingKeyFingerprintHex',
    'keyAgreementKeyFingerprintHex',
    'delegationId',
  ], 'profile_device');
  assertHex32(device.signingKeyFingerprintHex, 'invalid_device_signing_fingerprint');
  assertHex32(device.keyAgreementKeyFingerprintHex, 'invalid_device_agreement_fingerprint');
  assertAsciiToken(device.delegationId, 'invalid_device_delegation_id');

  return value as PicoCompanionProfile;
}

export function readPicoCompanionProfile(path: string): PicoCompanionProfile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`unreadable_companion_profile:${(error as Error).message}`);
  }
  return parsePicoCompanionProfile(parsed);
}

/**
 * The profile carries no secrets, but it pins which Home this device trusts;
 * private modes keep another local account from silently repointing it.
 */
export function writePicoCompanionProfile(
  path: string,
  profile: PicoCompanionProfile,
): void {
  parsePicoCompanionProfile(profile);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  // Written the same way the recovery anchor is: a half-written profile would
  // point this device at a partially described Home, and a crash mid-write
  // must leave the previous one intact rather than a truncated file.
  const temporaryPath = `${path}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(profile, null, 2)}\n`, { mode: 0o600 });
  chmodSync(temporaryPath, 0o600);
  fsyncFile(temporaryPath);
  renameSync(temporaryPath, path);
  fsyncDirectory(dirname(path));
}

function fsyncFile(path: string): void {
  const handle = openSync(path, 'r+');
  try {
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
}

function fsyncDirectory(path: string): void {
  const handle = openSync(path, 'r');
  try {
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
}

const asciiTokenPattern = /^[A-Za-z0-9._:/+-]+$/;
const hexPattern = /^[0-9a-f]{64}$/;

function assertExactKeys(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`invalid_companion_${label}`);
  }
  const record = value as Record<string, unknown>;
  const expected = new Set(expectedKeys);
  if (Object.keys(record).some((key) => !expected.has(key))) {
    throw new Error(`unexpected_companion_${label}_field`);
  }
  if (expectedKeys.some((key) => !(key in record))) {
    throw new Error(`missing_companion_${label}_field`);
  }
  return record;
}

function assertHex32(value: unknown, reason: string): void {
  if (typeof value !== 'string' || !hexPattern.test(value)) {
    throw new Error(reason);
  }
}

function assertAsciiToken(value: unknown, reason: string): void {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > 1024
    || !asciiTokenPattern.test(value)
  ) {
    throw new Error(reason);
  }
}

function assertCoreUrl(value: unknown): void {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) {
    throw new Error('invalid_companion_core_url');
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('invalid_companion_core_url');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('invalid_companion_core_url');
  }
}
