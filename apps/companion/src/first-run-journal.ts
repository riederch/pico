import { isPicoInstant } from '@pico/protocol/instant';
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import type { PicoHomeDeviceRecoveryPendingView } from '@pico/protocol';
import type { PicoCompanionProfile } from './profile.js';
import type { PicoCompanionRecoveryReceiptSummary } from './recovery-state.js';

/**
 * ADR 0112 S3 first-run journal. The first run crosses one irreversible step -
 * the Vault daemon bootstrap, after which the vault is no longer provably
 * fresh and can never be bootstrapped again - and several steps that must end
 * up either wholly done or plainly unfinished: the Home-side recovery, the
 * profile and the Platform Keystore binding. Three separately atomic file
 * writes are not one atomic commit, so this journal records which step the run
 * has actually reached and lets a restart resume forward from it.
 *
 * It carries public facts only. The card's seed material, the Card PIN and the
 * device passphrase are never written here, which is also why a crash before
 * the bootstrap simply asks the person to scan again: nothing irreversible has
 * happened yet, so there is nothing to resume.
 */
export const picoCompanionFirstRunJournalSchema =
  'pico.companion.first-run-journal.v1' as const;

/**
 * Ordered. `advancePicoCompanionFirstRunJournal` refuses to move backwards, so
 * a stale writer cannot rewind the run past the bootstrap it already spent.
 */
export const picoCompanionFirstRunSteps = [
  'bootstrapped',
  'submitted',
  'completed',
  'committed',
] as const;

export type PicoCompanionFirstRunStep =
  typeof picoCompanionFirstRunSteps[number];

/**
 * Everything the remaining steps need, and nothing else. The host key bundle
 * comes from the ADR 0115 continuity read rather than the card, because a v2
 * card pins the host signing key by fingerprint but does not carry its public
 * key; the acceptor pin is what makes that read trustworthy.
 */
export interface PicoCompanionFirstRunBinding {
  coreUrl: string;
  homeId: string;
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

export interface PicoCompanionFirstRunBootstrapped {
  schema: typeof picoCompanionFirstRunJournalSchema;
  step: 'bootstrapped';
  binding: PicoCompanionFirstRunBinding;
}

export interface PicoCompanionFirstRunSubmitted {
  schema: typeof picoCompanionFirstRunJournalSchema;
  step: 'submitted';
  binding: PicoCompanionFirstRunBinding;
  pending: PicoHomeDeviceRecoveryPendingView;
}

export interface PicoCompanionFirstRunCompleted {
  schema: typeof picoCompanionFirstRunJournalSchema;
  step: 'completed';
  binding: PicoCompanionFirstRunBinding;
  receipt: PicoCompanionRecoveryReceiptSummary;
}

/**
 * `platformUnlockBound` is false when the run committed the profile but not
 * the keystore binding - the honest outcome when a crash took the passphrase
 * with it, since it is never journaled. Automatic unlock then stays off until
 * the person supplies it again, which is exactly what the existing fail-closed
 * unlock owner already does with a missing binding.
 */
export interface PicoCompanionFirstRunCommitted {
  schema: typeof picoCompanionFirstRunJournalSchema;
  step: 'committed';
  binding: PicoCompanionFirstRunBinding;
  receipt: PicoCompanionRecoveryReceiptSummary;
  platformUnlockBound: boolean;
}

export type PicoCompanionFirstRunJournal =
  | PicoCompanionFirstRunBootstrapped
  | PicoCompanionFirstRunSubmitted
  | PicoCompanionFirstRunCompleted
  | PicoCompanionFirstRunCommitted;

export function defaultPicoCompanionFirstRunJournalPath(
  profilePath: string,
): string {
  return join(dirname(profilePath), 'first-run-journal.json');
}

/**
 * The binding is what the journal is about, so it is checked in full on every
 * read and write. A run in progress cannot be redirected to another Home,
 * identity or device by a second card or a tampered file.
 */
export function picoCompanionFirstRunProfile(
  binding: PicoCompanionFirstRunBinding,
): PicoCompanionProfile {
  return {
    schema: 'pico.companion.profile.v1',
    coreUrl: binding.coreUrl,
    home: { ...binding.home },
    host: { ...binding.host },
    identity: { ...binding.identity },
    device: { ...binding.device },
  };
}

export function parsePicoCompanionFirstRunJournal(
  value: unknown,
): PicoCompanionFirstRunJournal {
  const record = requireRecord(value, 'invalid_first_run_journal');
  if (record.schema !== picoCompanionFirstRunJournalSchema) {
    throw new Error('invalid_first_run_journal_schema');
  }
  const step = record.step;
  if (typeof step !== 'string'
    || !picoCompanionFirstRunSteps.includes(step as PicoCompanionFirstRunStep)) {
    throw new Error('invalid_first_run_journal_step');
  }

  switch (step as PicoCompanionFirstRunStep) {
    case 'bootstrapped': {
      assertExactKeys(record, ['schema', 'step', 'binding']);
      return Object.freeze({
        schema: picoCompanionFirstRunJournalSchema,
        step: 'bootstrapped',
        binding: parseBinding(record.binding),
      });
    }
    case 'submitted': {
      assertExactKeys(record, ['schema', 'step', 'binding', 'pending']);
      const binding = parseBinding(record.binding);
      return Object.freeze({
        schema: picoCompanionFirstRunJournalSchema,
        step: 'submitted',
        binding,
        pending: parsePending(record.pending, binding),
      });
    }
    case 'completed': {
      assertExactKeys(record, ['schema', 'step', 'binding', 'receipt']);
      const binding = parseBinding(record.binding);
      return Object.freeze({
        schema: picoCompanionFirstRunJournalSchema,
        step: 'completed',
        binding,
        receipt: parseReceipt(record.receipt, binding),
      });
    }
    default: {
      assertExactKeys(record, [
        'schema',
        'step',
        'binding',
        'receipt',
        'platformUnlockBound',
      ]);
      if (typeof record.platformUnlockBound !== 'boolean') {
        throw new Error('invalid_first_run_journal_unlock_flag');
      }
      const binding = parseBinding(record.binding);
      return Object.freeze({
        schema: picoCompanionFirstRunJournalSchema,
        step: 'committed',
        binding,
        receipt: parseReceipt(record.receipt, binding),
        platformUnlockBound: record.platformUnlockBound,
      });
    }
  }
}

export function readPicoCompanionFirstRunJournal(
  path: string,
): PicoCompanionFirstRunJournal | null {
  if (!existsSync(path)) {
    return null;
  }
  try {
    return parsePicoCompanionFirstRunJournal(
      JSON.parse(readFileSync(path, 'utf8')),
    );
  } catch (error) {
    throw new Error(`unreadable_first_run_journal:${(error as Error).message}`);
  }
}

/**
 * The only writer. It reads the current record first and refuses anything that
 * is not a forward move of the same run: a step that goes backwards or stays
 * put, or a binding that differs in any field. A first-run device is by
 * definition not yet authenticated to anything, so this local monotonicity is
 * the whole protection against a replayed or swapped journal.
 */
export function advancePicoCompanionFirstRunJournal(
  path: string,
  next: PicoCompanionFirstRunJournal,
): PicoCompanionFirstRunJournal {
  const parsed = parsePicoCompanionFirstRunJournal(next);
  const current = readPicoCompanionFirstRunJournal(path);
  if (current !== null) {
    if (stepOrder(parsed.step) <= stepOrder(current.step)) {
      throw new Error('first_run_journal_step_not_forward');
    }
    if (!sameBinding(current.binding, parsed.binding)) {
      throw new Error('first_run_journal_binding_changed');
    }
  } else if (parsed.step !== 'bootstrapped') {
    throw new Error('first_run_journal_missing_bootstrap');
  }

  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporaryPath = `${path}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(parsed, null, 2)}\n`, {
    mode: 0o600,
  });
  chmodSync(temporaryPath, 0o600);
  fsyncPath(temporaryPath, 'r+');
  renameSync(temporaryPath, path);
  fsyncPath(dirname(path), 'r');
  return parsed;
}

/**
 * Removed only once the profile it produced is readable, so the durable
 * evidence never disappears before its replacement exists.
 */
export function clearPicoCompanionFirstRunJournal(path: string): void {
  if (!existsSync(path)) {
    return;
  }
  unlinkSync(path);
  fsyncPath(dirname(path), 'r');
}

function stepOrder(step: PicoCompanionFirstRunStep): number {
  return picoCompanionFirstRunSteps.indexOf(step);
}

function sameBinding(
  left: PicoCompanionFirstRunBinding,
  right: PicoCompanionFirstRunBinding,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function parseBinding(value: unknown): PicoCompanionFirstRunBinding {
  const record = requireRecord(value, 'invalid_first_run_binding');
  assertExactKeys(record, ['coreUrl', 'homeId', 'home', 'host', 'identity', 'device']);
  assertCoreUrl(record.coreUrl);
  assertToken(record.homeId, 'invalid_first_run_home_id');

  const home = requireRecord(record.home, 'invalid_first_run_binding');
  assertExactKeys(home, ['homeHostPicoIdentityFingerprintHex']);
  assertHex32(
    home.homeHostPicoIdentityFingerprintHex,
    'invalid_first_run_acceptor_pin',
  );

  const host = requireRecord(record.host, 'invalid_first_run_binding');
  assertExactKeys(host, [
    'signingPublicKeyHex',
    'signingKeyFingerprintHex',
    'keyAgreementPublicKeyHex',
    'keyAgreementKeyFingerprintHex',
  ]);
  for (const field of Object.keys(host)) {
    assertHex32(host[field], 'invalid_first_run_host_key');
  }

  const identity = requireRecord(record.identity, 'invalid_first_run_binding');
  assertExactKeys(identity, ['keyFingerprintHex', 'publicKeyHex']);
  for (const field of Object.keys(identity)) {
    assertHex32(identity[field], 'invalid_first_run_identity_key');
  }

  const device = requireRecord(record.device, 'invalid_first_run_binding');
  assertExactKeys(device, [
    'signingKeyFingerprintHex',
    'keyAgreementKeyFingerprintHex',
    'delegationId',
  ]);
  assertHex32(device.signingKeyFingerprintHex, 'invalid_first_run_device_key');
  assertHex32(
    device.keyAgreementKeyFingerprintHex,
    'invalid_first_run_device_key',
  );
  assertToken(device.delegationId, 'invalid_first_run_delegation_id');

  return Object.freeze({
    coreUrl: record.coreUrl as string,
    homeId: record.homeId as string,
    home: Object.freeze({ ...home }),
    host: Object.freeze({ ...host }),
    identity: Object.freeze({ ...identity }),
    device: Object.freeze({ ...device }),
  }) as unknown as PicoCompanionFirstRunBinding;
}

/**
 * The pending view is only meaningful for this run if it names this run's
 * target. Checking it here means a resumed completion can never be pointed at
 * a device the bootstrap did not create.
 */
function parsePending(
  value: unknown,
  binding: PicoCompanionFirstRunBinding,
): PicoHomeDeviceRecoveryPendingView {
  const record = requireRecord(value, 'invalid_first_run_pending');
  assertExactKeys(record, [
    'recoveryId',
    'claimDigestHex',
    'targetDelegationId',
    'targetDeviceSigningKeyFingerprintHex',
    'targetDeviceKeyAgreementKeyFingerprintHex',
    'acceptedAt',
    'effectiveAt',
    'completionExpiresAt',
  ]);
  assertToken(record.recoveryId, 'invalid_first_run_recovery_id');
  assertHex32(record.claimDigestHex, 'invalid_first_run_claim_digest');
  assertTarget(record, binding);
  const acceptedAt = assertInstant(record.acceptedAt);
  const effectiveAt = assertInstant(record.effectiveAt);
  const completionExpiresAt = assertInstant(record.completionExpiresAt);
  if (!(acceptedAt < effectiveAt && effectiveAt < completionExpiresAt)) {
    throw new Error('invalid_first_run_recovery_timing');
  }
  return Object.freeze({ ...record }) as unknown as PicoHomeDeviceRecoveryPendingView;
}

function parseReceipt(
  value: unknown,
  binding: PicoCompanionFirstRunBinding,
): PicoCompanionRecoveryReceiptSummary {
  const record = requireRecord(value, 'invalid_first_run_receipt');
  assertExactKeys(record, [
    'recoveryId',
    'targetDelegationId',
    'targetDeviceSigningKeyFingerprintHex',
    'targetDeviceKeyAgreementKeyFingerprintHex',
    'completedAt',
    'leavesExactlyOneActiveDevice',
    'otherDevicesRevoked',
  ]);
  assertToken(record.recoveryId, 'invalid_first_run_recovery_id');
  assertTarget(record, binding);
  assertInstant(record.completedAt);
  if (record.leavesExactlyOneActiveDevice !== true
    || record.otherDevicesRevoked !== true) {
    throw new Error('invalid_first_run_receipt_outcome');
  }
  return Object.freeze({ ...record }) as unknown as PicoCompanionRecoveryReceiptSummary;
}

function assertTarget(
  record: Record<string, unknown>,
  binding: PicoCompanionFirstRunBinding,
): void {
  if (record.targetDelegationId !== binding.device.delegationId
    || record.targetDeviceSigningKeyFingerprintHex
      !== binding.device.signingKeyFingerprintHex
    || record.targetDeviceKeyAgreementKeyFingerprintHex
      !== binding.device.keyAgreementKeyFingerprintHex) {
    throw new Error('first_run_journal_target_mismatch');
  }
}

function requireRecord(value: unknown, reason: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(reason);
  }
  return value as Record<string, unknown>;
}

function assertExactKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
): void {
  const expected = new Set(keys);
  if (Object.keys(record).some((key) => !expected.has(key))
    || keys.some((key) => !(key in record))) {
    throw new Error('invalid_first_run_journal_shape');
  }
}

function assertHex32(value: unknown, reason: string): asserts value is string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error(reason);
  }
}

function assertToken(value: unknown, reason: string): asserts value is string {
  if (typeof value !== 'string'
    || !/^[A-Za-z0-9._:/+-]{1,1024}$/u.test(value)) {
    throw new Error(reason);
  }
}

function assertInstant(value: unknown): number {
  // Befund B52. Beide Haelften standen hier von Hand, richtig und ein zweites
  // Mal - `@pico/protocol/instant` ist die Regel, die sie meinen.
  if (!isPicoInstant(value)) {
    throw new Error('invalid_first_run_instant');
  }
  return Date.parse(value);
}

function assertCoreUrl(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) {
    throw new Error('invalid_first_run_core_url');
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('invalid_first_run_core_url');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('invalid_first_run_core_url');
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
