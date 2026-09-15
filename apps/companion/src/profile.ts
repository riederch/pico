// Befund B51. Dieselbe Regel, jetzt von dort, wo sie einmal steht.
import { assertAsciiToken, hexOfBytesPattern } from '@pico/protocol/canonical-bytes';
import { assertPicoHomeCoreUrl } from '@pico/protocol/home-address';
// Befund B179. Hier standen bis zum 2026-09-15 acht weitere Bausteine -
// `openSync`, `writeFileSync`, `fsyncSync`, `renameSync`, `chmodSync`,
// `mkdirSync`, `closeSync`, `dirname` -, also genau die Redewendung fuer
// dauerhaftes Schreiben. Benutzt wurde keiner: das Schreiben ist laengst in
// `writePicoCompanionFileAtomically` gefaltet. Eine Importliste ist eine
// Aussage darueber, was eine Datei tut, und diese war seit der Faltung falsch.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { writePicoCompanionFileAtomically } from './atomic-file.js';

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
  /**
   * ADR 0115 U4: the Home this device belongs to, beyond its key custody.
   * The Home Host Pico fingerprint is the acceptor pin the continuity-chain
   * verification binds every rotation acceptance to - without it a thief of
   * a copied host disk forges the whole chain, acceptor included. It is not
   * a host key, so it does not live under `host`, and unlike the host pins
   * it never rotates with them (rotating the founder root is Home handover,
   * ADR 0080's non-goal).
   */
  home: {
    homeHostPicoIdentityFingerprintHex: string;
  };
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
    'home',
    'host',
    'identity',
    'device',
  ], 'profile');
  if (record.schema !== picoCompanionProfileSchema) {
    throw new Error('invalid_companion_profile_schema');
  }
  assertCoreUrl(record.coreUrl);

  const home = assertExactKeys(record.home, [
    'homeHostPicoIdentityFingerprintHex',
  ], 'profile_home');
  assertHex32(
    home.homeHostPicoIdentityFingerprintHex,
    'invalid_home_host_pico_fingerprint',
  );

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
  // Written the same way the recovery anchor is: a half-written profile would
  // point this device at a partially described Home, and a crash mid-write
  // must leave the previous one intact rather than a truncated file. Seit
  // Befund B121 steht dieses Wie in `atomic-file.ts`, weil die Datei daneben
  // dasselbe braucht und es nicht hatte.
  writePicoCompanionFileAtomically(path, `${JSON.stringify(profile, null, 2)}\n`);
}

const hexPattern = hexOfBytesPattern(32);

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

/**
 * One rule, in `@pico/protocol/home-address`.
 *
 * This used to allow 2,048 characters and accept `HTTP://` - `new URL`
 * normalises the scheme, the grant parser reads bytes and does not - so a
 * profile could hold an address that no second device could ever be granted.
 */
function assertCoreUrl(value: unknown): void {
  assertPicoHomeCoreUrl(value, 'invalid_companion_core_url');
}
