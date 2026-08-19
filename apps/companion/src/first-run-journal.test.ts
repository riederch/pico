import { tmpdir } from 'node:os';
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  advancePicoCompanionFirstRunJournal,
  clearPicoCompanionFirstRunJournal,
  defaultPicoCompanionFirstRunJournalPath,
  parsePicoCompanionFirstRunJournal,
  picoCompanionFirstRunJournalSchema,
  picoCompanionFirstRunProfile,
  picoCompanionFirstRunSteps,
  readPicoCompanionFirstRunJournal,
  type PicoCompanionFirstRunBinding,
  type PicoCompanionFirstRunJournal,
} from './first-run-journal.js';
import { parsePicoCompanionProfile } from './profile.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function temporaryJournalPath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'pico-companion-first-run-'));
  temporaryDirectories.push(directory);
  return defaultPicoCompanionFirstRunJournalPath(
    join(directory, 'nested', 'profile.json'),
  );
}

describe('ADR 0112 S3 first-run journal', () => {
  it('advances forward through the run and stays private', () => {
    const path = temporaryJournalPath();
    expect(readPicoCompanionFirstRunJournal(path)).toBeNull();

    advancePicoCompanionFirstRunJournal(path, bootstrapped());
    expect(readPicoCompanionFirstRunJournal(path)).toEqual(bootstrapped());
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(statSync(join(path, '..')).mode & 0o777).toBe(0o700);

    advancePicoCompanionFirstRunJournal(path, submitted());
    expect(readPicoCompanionFirstRunJournal(path)).toEqual(submitted());
    advancePicoCompanionFirstRunJournal(path, completed());
    advancePicoCompanionFirstRunJournal(path, committed(true));
    expect(readPicoCompanionFirstRunJournal(path)).toEqual(committed(true));
    expect(readdirSync(join(path, '..'))).toEqual(['first-run-journal.json']);

    clearPicoCompanionFirstRunJournal(path);
    expect(readPicoCompanionFirstRunJournal(path)).toBeNull();
    clearPicoCompanionFirstRunJournal(path);
  });

  it('refuses to rewind past the bootstrap it already spent', () => {
    const path = temporaryJournalPath();
    advancePicoCompanionFirstRunJournal(path, bootstrapped());
    advancePicoCompanionFirstRunJournal(path, submitted());

    // The bootstrap is irreversible: the vault is no longer provably fresh, so
    // a writer that has not noticed must not be able to restart the run.
    expect(() => advancePicoCompanionFirstRunJournal(path, bootstrapped()))
      .toThrow('first_run_journal_step_not_forward');
    expect(() => advancePicoCompanionFirstRunJournal(path, submitted()))
      .toThrow('first_run_journal_step_not_forward');
    expect(readPicoCompanionFirstRunJournal(path)).toEqual(submitted());

    advancePicoCompanionFirstRunJournal(path, completed());
    expect(() => advancePicoCompanionFirstRunJournal(path, submitted()))
      .toThrow('first_run_journal_step_not_forward');
  });

  it('refuses a second card, identity or device on a run in progress', () => {
    const path = temporaryJournalPath();
    advancePicoCompanionFirstRunJournal(path, bootstrapped());

    for (const swapped of [
      { ...binding(), homeId: 'home_other_01' },
      {
        ...binding(),
        home: {
          homeHostPicoIdentityFingerprintHex: 'a'.repeat(64),
        },
      },
      {
        ...binding(),
        identity: { ...binding().identity, keyFingerprintHex: 'b'.repeat(64) },
      },
      { ...binding(), coreUrl: 'https://elsewhere.example' },
    ]) {
      expect(() => advancePicoCompanionFirstRunJournal(path, {
        ...submitted(),
        binding: swapped,
      })).toThrow('first_run_journal_binding_changed');
    }
  });

  it('binds pending view and receipt to this run\'s exact target', () => {
    const path = temporaryJournalPath();
    advancePicoCompanionFirstRunJournal(path, bootstrapped());

    expect(() => advancePicoCompanionFirstRunJournal(path, {
      ...submitted(),
      pending: { ...submitted().pending, targetDelegationId: 'other-device' },
    })).toThrow('first_run_journal_target_mismatch');
    expect(() => advancePicoCompanionFirstRunJournal(path, {
      ...submitted(),
      pending: {
        ...submitted().pending,
        targetDeviceSigningKeyFingerprintHex: 'c'.repeat(64),
      },
    })).toThrow('first_run_journal_target_mismatch');
    expect(() => advancePicoCompanionFirstRunJournal(path, {
      ...completed(),
      receipt: {
        ...completed().receipt,
        targetDeviceKeyAgreementKeyFingerprintHex: 'd'.repeat(64),
      },
    })).toThrow('first_run_journal_target_mismatch');
  });

  it('refuses a journal that starts anywhere but the bootstrap', () => {
    for (const step of ['submitted', 'completed', 'committed'] as const) {
      const path = temporaryJournalPath();
      const record = step === 'submitted'
        ? submitted()
        : step === 'completed' ? completed() : committed(true);
      expect(() => advancePicoCompanionFirstRunJournal(path, record))
        .toThrow('first_run_journal_missing_bootstrap');
      expect(readPicoCompanionFirstRunJournal(path)).toBeNull();
    }
  });

  it('rejects secrets, unknown fields and malformed records', () => {
    expect(() => parsePicoCompanionFirstRunJournal({
      ...bootstrapped(),
      passphrase: 'never allowed here',
    })).toThrow('invalid_first_run_journal_shape');
    expect(() => parsePicoCompanionFirstRunJournal({
      ...bootstrapped(),
      binding: { ...binding(), seedMaterialHex: 'e'.repeat(64) },
    })).toThrow('invalid_first_run_journal_shape');
    expect(() => parsePicoCompanionFirstRunJournal({
      ...bootstrapped(),
      step: 'scanned',
    })).toThrow('invalid_first_run_journal_step');
    expect(() => parsePicoCompanionFirstRunJournal({
      ...bootstrapped(),
      schema: 'pico.companion.first-run-journal.v2',
    })).toThrow('invalid_first_run_journal_schema');
    expect(() => parsePicoCompanionFirstRunJournal({
      ...bootstrapped(),
      binding: { ...binding(), coreUrl: 'ftp://home.example' },
    })).toThrow('invalid_first_run_core_url');
    expect(() => parsePicoCompanionFirstRunJournal({
      ...committed(true),
      platformUnlockBound: 'yes',
    })).toThrow('invalid_first_run_journal_unlock_flag');
    expect(() => parsePicoCompanionFirstRunJournal({
      ...submitted(),
      pending: { ...submitted().pending, effectiveAt: '2026-07-30T08:00:00.000Z' },
    })).toThrow('invalid_first_run_recovery_timing');
    expect(() => parsePicoCompanionFirstRunJournal({
      ...completed(),
      receipt: { ...completed().receipt, leavesExactlyOneActiveDevice: false },
    })).toThrow('invalid_first_run_receipt_outcome');
  });

  it('produces exactly the profile the binding describes', () => {
    const profile = picoCompanionFirstRunProfile(binding());
    expect(parsePicoCompanionProfile(profile)).toEqual(profile);
    expect(profile.coreUrl).toBe(binding().coreUrl);
    expect(profile.device.delegationId).toBe(binding().device.delegationId);
    expect(profile.home.homeHostPicoIdentityFingerprintHex)
      .toBe(binding().home.homeHostPicoIdentityFingerprintHex);
    // homeId belongs to the run, not to the profile shape.
    expect(Object.keys(profile)).toEqual([
      'schema',
      'coreUrl',
      'home',
      'host',
      'identity',
      'device',
    ]);
  });

  it('keeps the step vocabulary closed and ordered', () => {
    expect(picoCompanionFirstRunSteps).toEqual([
      'bootstrapped',
      'submitted',
      'completed',
      'committed',
    ]);
    expect(picoCompanionFirstRunJournalSchema)
      .toBe('pico.companion.first-run-journal.v1');
  });
});

function binding(): PicoCompanionFirstRunBinding {
  return {
    coreUrl: 'https://home.example/link',
    homeId: 'home_vector_01',
    home: {
      homeHostPicoIdentityFingerprintHex: '99'.repeat(32),
    },
    host: {
      signingPublicKeyHex: '55'.repeat(32),
      signingKeyFingerprintHex: '66'.repeat(32),
      keyAgreementPublicKeyHex: '88'.repeat(32),
      keyAgreementKeyFingerprintHex: '77'.repeat(32),
    },
    identity: {
      keyFingerprintHex: '11'.repeat(32),
      publicKeyHex: '22'.repeat(32),
    },
    device: {
      signingKeyFingerprintHex: '33'.repeat(32),
      keyAgreementKeyFingerprintHex: '44'.repeat(32),
      delegationId: 'delegation-first-run',
    },
  };
}

function bootstrapped(): PicoCompanionFirstRunJournal {
  return {
    schema: picoCompanionFirstRunJournalSchema,
    step: 'bootstrapped',
    binding: binding(),
  };
}

function submitted(): PicoCompanionFirstRunJournal & { step: 'submitted' } {
  return {
    schema: picoCompanionFirstRunJournalSchema,
    step: 'submitted',
    binding: binding(),
    pending: {
      recoveryId: 'recovery-first-run',
      claimDigestHex: 'ab'.repeat(32),
      targetDelegationId: binding().device.delegationId,
      targetDeviceSigningKeyFingerprintHex:
        binding().device.signingKeyFingerprintHex,
      targetDeviceKeyAgreementKeyFingerprintHex:
        binding().device.keyAgreementKeyFingerprintHex,
      acceptedAt: '2026-08-01T08:00:00.000Z',
      effectiveAt: '2026-08-03T08:00:00.000Z',
      completionExpiresAt: '2026-08-08T08:00:00.000Z',
    },
  };
}

function completed(): PicoCompanionFirstRunJournal & { step: 'completed' } {
  return {
    schema: picoCompanionFirstRunJournalSchema,
    step: 'completed',
    binding: binding(),
    receipt: receipt(),
  };
}

function committed(
  platformUnlockBound: boolean,
): PicoCompanionFirstRunJournal & { step: 'committed' } {
  return {
    schema: picoCompanionFirstRunJournalSchema,
    step: 'committed',
    binding: binding(),
    receipt: receipt(),
    platformUnlockBound,
  };
}

function receipt() {
  return {
    recoveryId: 'recovery-first-run',
    targetDelegationId: binding().device.delegationId,
    targetDeviceSigningKeyFingerprintHex:
      binding().device.signingKeyFingerprintHex,
    targetDeviceKeyAgreementKeyFingerprintHex:
      binding().device.keyAgreementKeyFingerprintHex,
    completedAt: '2026-08-04T08:00:00.000Z',
    leavesExactlyOneActiveDevice: true as const,
    otherDevicesRevoked: true as const,
  };
}
