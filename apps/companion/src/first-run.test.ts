import { tmpdir } from 'node:os';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildPicoRecoveryCardPayload,
  buildPicoRecoveryCardScanTransport,
  picoRecoveryCardSchema,
} from '@pico/protocol';
import type { PicoVaultDaemonClient } from '@pico/vault-daemon';
import { afterEach, describe, expect, it } from 'vitest';
import {
  advancePicoCompanionFirstRunJournal,
  defaultPicoCompanionFirstRunJournalPath,
  picoCompanionFirstRunJournalSchema,
  readPicoCompanionFirstRunJournal,
  type PicoCompanionFirstRunBinding,
} from './first-run-journal.js';
import {
  readPicoCompanionFirstRunNeed,
  runPicoCompanionFirstRun,
} from './first-run.js';
import { defaultPicoCompanionPlatformUnlockPath } from './platform-unlock.js';
import type { PicoCompanionPlatformSecretPort } from './platform-unlock.js';
import { readPicoCompanionProfile } from './profile.js';
import type { PicoCompanionApprovalDecisionPort } from './approval-carrier.js';
import type { PicoCompanionRecoveryNotifications } from './recovery-controller.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('ADR 0112 S3 first run', () => {
  it('reports what it still needs, and never asks for the card twice', () => {
    const paths = temporaryPaths();
    expect(readPicoCompanionFirstRunNeed(paths))
      .toEqual({ need: 'card_and_secrets' });

    advancePicoCompanionFirstRunJournal(paths.journalPath, bootstrapped());
    expect(readPicoCompanionFirstRunNeed(paths)).toEqual({
      need: 'passphrase',
      step: 'bootstrapped',
      binding: binding(),
    });

    advancePicoCompanionFirstRunJournal(paths.journalPath, submitted());
    const need = readPicoCompanionFirstRunNeed(paths);
    expect(need.need).toBe('passphrase');
    expect(need.need === 'passphrase' && need.pending?.recoveryId)
      .toBe('recovery-first-run');
  });

  it('commits the profile and the keystore binding together, then drops the journal', async () => {
    const paths = temporaryPaths();
    advancePicoCompanionFirstRunJournal(paths.journalPath, bootstrapped());
    advancePicoCompanionFirstRunJournal(paths.journalPath, submitted());
    advancePicoCompanionFirstRunJournal(paths.journalPath, completed());
    const secrets = secretPort('device passphrase');

    const outcome = await runPicoCompanionFirstRun({
      ...paths,
      sodium: stubSodium(),
      socketPath: join(tmpdir(), 'pico-first-run-test.sock'),
      decisions: silentDecisions(),
      connect: fakeDaemonClient().connect,
      secrets: { passphrase: 'device passphrase' },
      notifications: silentNotifications(),
      platformSecrets: secrets,
    });

    expect(outcome.status).toBe('complete');
    expect(outcome.status === 'complete' && outcome.platformUnlockBound)
      .toBe(true);
    const profile = readPicoCompanionProfile(paths.profilePath);
    expect(profile.coreUrl).toBe(binding().coreUrl);
    expect(profile.device.delegationId).toBe(binding().device.delegationId);
    expect(statSync(paths.profilePath).mode & 0o777).toBe(0o600);

    const unlockPath = defaultPicoCompanionPlatformUnlockPath(paths.profilePath);
    expect(readFileSync(unlockPath, 'utf8')).not.toContain('device passphrase');
    // The journal only goes away once the profile it produced reads back.
    expect(readPicoCompanionFirstRunJournal(paths.journalPath)).toBeNull();
    expect(readPicoCompanionFirstRunNeed(paths).need).toBe('nothing');
  });

  it('records an unbound keystore rather than pretending automatic unlock works', async () => {
    const paths = temporaryPaths();
    advancePicoCompanionFirstRunJournal(paths.journalPath, bootstrapped());
    advancePicoCompanionFirstRunJournal(paths.journalPath, submitted());
    advancePicoCompanionFirstRunJournal(paths.journalPath, completed());

    const outcome = await runPicoCompanionFirstRun({
      ...paths,
      sodium: stubSodium(),
      socketPath: join(tmpdir(), 'pico-first-run-test.sock'),
      decisions: silentDecisions(),
      connect: fakeDaemonClient().connect,
      secrets: { passphrase: 'device passphrase' },
      notifications: silentNotifications(),
    });

    expect(outcome.status === 'complete' && outcome.platformUnlockBound)
      .toBe(false);
    expect(existsSync(defaultPicoCompanionPlatformUnlockPath(paths.profilePath)))
      .toBe(false);
    expect(readPicoCompanionProfile(paths.profilePath).identity.keyFingerprintHex)
      .toBe(binding().identity.keyFingerprintHex);
  });

  it('opens no vault session once the Home side is already done', async () => {
    const paths = temporaryPaths();
    advancePicoCompanionFirstRunJournal(paths.journalPath, bootstrapped());
    advancePicoCompanionFirstRunJournal(paths.journalPath, submitted());
    advancePicoCompanionFirstRunJournal(paths.journalPath, completed());
    const daemon = fakeDaemonClient();

    await runPicoCompanionFirstRun({
      ...paths,
      sodium: stubSodium(),
      socketPath: join(tmpdir(), 'pico-first-run-test.sock'),
      decisions: silentDecisions(),
      connect: daemon.connect,
      secrets: { passphrase: 'device passphrase' },
      notifications: silentNotifications(),
    });

    // Committing a profile is file work. Unlocking keys for it would widen the
    // window the passphrase is live for, and buy nothing.
    expect(daemon.unlocks).toHaveLength(0);
  });

  it('refuses a transport this card format cannot read, before the vault is touched', async () => {
    const paths = temporaryPaths();
    const daemon = fakeDaemonClient();
    // A payload with the right element count but a schema label from another
    // format: the one thing a scanner can hand over that still looks like a
    // card. Flipping the label in place keeps every canonical length valid, so
    // the refusal can only come from the label itself.
    const canonical = buildPicoRecoveryCardPayload({
      schema: picoRecoveryCardSchema,
      suite: 'pico.suite.id.v1',
      picoName: 'Ada',
      homeNameOrId: 'Home Vector',
      seedMaterialHex: '00'.repeat(32),
      pinProtected: true,
      identityKeyFingerprintHex: '11'.repeat(32),
      homeId: 'home_vector_01',
      homeHostPicoIdentityFingerprintHex: '99'.repeat(32),
      hostSigningKeyFingerprintHex: '66'.repeat(32),
      hostKeyAgreementKeyFingerprintHex: '77'.repeat(32),
      hostKeyAgreementPublicKeyHex: '88'.repeat(32),
      endpointHint: 'https://home.example/link',
      issuedAt: '2026-07-31T08:00:00.000Z',
    });
    const labelAt = Buffer.from(canonical).indexOf(picoRecoveryCardSchema);
    expect(labelAt).toBeGreaterThanOrEqual(0);
    canonical[labelAt + picoRecoveryCardSchema.length - 1] = '2'.charCodeAt(0);
    const foreignTransport = buildPicoRecoveryCardScanTransport(canonical);

    await expect(runPicoCompanionFirstRun({
      ...paths,
      sodium: stubSodium(),
      socketPath: join(tmpdir(), 'pico-first-run-test.sock'),
      decisions: silentDecisions(),
      connect: daemon.connect,
      secrets: {
        cardTransport: foreignTransport,
        pin: '123456',
        passphrase: 'device passphrase',
      },
      notifications: silentNotifications(),
    })).rejects.toThrow('invalid_recovery_card_schema');

    // Nothing irreversible may happen on a card this run cannot use.
    expect(daemon.bootstraps).toHaveLength(0);
    expect(daemon.unlocks).toHaveLength(0);
    expect(readPicoCompanionFirstRunJournal(paths.journalPath)).toBeNull();
  });

  it('refuses to start without the card and PIN, and refuses an empty passphrase', async () => {
    const paths = temporaryPaths();
    await expect(runPicoCompanionFirstRun({
      ...paths,
      sodium: stubSodium(),
      socketPath: join(tmpdir(), 'pico-first-run-test.sock'),
      decisions: silentDecisions(),
      connect: fakeDaemonClient().connect,
      secrets: { passphrase: 'device passphrase' },
      notifications: silentNotifications(),
    })).rejects.toThrow('first_run_requires_card_and_pin');

    await expect(runPicoCompanionFirstRun({
      ...paths,
      sodium: stubSodium(),
      socketPath: join(tmpdir(), 'pico-first-run-test.sock'),
      decisions: silentDecisions(),
      connect: fakeDaemonClient().connect,
      secrets: { passphrase: '' },
      notifications: silentNotifications(),
    })).rejects.toThrow('invalid_first_run_passphrase');
  });

  it('treats a committed run without a profile as damage, not as a fresh start', () => {
    const paths = temporaryPaths();
    advancePicoCompanionFirstRunJournal(paths.journalPath, bootstrapped());
    advancePicoCompanionFirstRunJournal(paths.journalPath, submitted());
    advancePicoCompanionFirstRunJournal(paths.journalPath, completed());
    advancePicoCompanionFirstRunJournal(paths.journalPath, {
      schema: picoCompanionFirstRunJournalSchema,
      step: 'committed',
      binding: binding(),
      receipt: receipt(),
      platformUnlockBound: false,
    });

    expect(() => readPicoCompanionFirstRunNeed(paths))
      .toThrow('first_run_committed_without_profile');
  });

  it('refuses a daemon that unlocks a key other than the one asked for', async () => {
    const paths = temporaryPaths();
    advancePicoCompanionFirstRunJournal(paths.journalPath, bootstrapped());
    advancePicoCompanionFirstRunJournal(paths.journalPath, submitted());

    await expect(runPicoCompanionFirstRun({
      ...paths,
      sodium: stubSodium(),
      socketPath: join(tmpdir(), 'pico-first-run-test.sock'),
      decisions: silentDecisions(),
      connect: fakeDaemonClient({ swapUnlockedFingerprint: true }).connect,
      secrets: { passphrase: 'device passphrase' },
      notifications: silentNotifications(),
    })).rejects.toThrow('companion_vault_unlock_binding_mismatch');
    expect(existsSync(paths.profilePath)).toBe(false);
  });
});

function temporaryPaths(): {
  profilePath: string;
  journalPath: string;
  recoveryStatePath: string;
} {
  const directory = mkdtempSync(join(tmpdir(), 'pico-companion-first-run-'));
  temporaryDirectories.push(directory);
  const profilePath = join(directory, 'companion', 'profile.json');
  return {
    profilePath,
    journalPath: defaultPicoCompanionFirstRunJournalPath(profilePath),
    recoveryStatePath: join(directory, 'companion', 'recovery-state.json'),
  };
}

function binding(): PicoCompanionFirstRunBinding {
  return {
    coreUrl: 'https://home.example/link',
    homeId: 'home_vector_01',
    home: { homeHostPicoIdentityFingerprintHex: '99'.repeat(32) },
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

function bootstrapped() {
  return {
    schema: picoCompanionFirstRunJournalSchema,
    step: 'bootstrapped' as const,
    binding: binding(),
  };
}

function submitted() {
  return {
    schema: picoCompanionFirstRunJournalSchema,
    step: 'submitted' as const,
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

function completed() {
  return {
    schema: picoCompanionFirstRunJournalSchema,
    step: 'completed' as const,
    binding: binding(),
    receipt: receipt(),
  };
}

type FakeDaemon = {
  connect: () => Promise<PicoVaultDaemonClient>;
  unlocks: Array<{ keyRole: string; keyFingerprintHex: string; passphrase: string }>;
  bootstraps: unknown[];
};

/**
 * Serves both connections `openPicoCompanionVaultProductSession` opens: the
 * hold connection that unlocks and long-polls for approvals, and the consumer
 * connection the ceremony would use. No approval ever arrives here, because
 * these cases stop before a ceremony runs.
 */
function fakeDaemonClient(options: {
  swapUnlockedFingerprint?: boolean;
} = {}): FakeDaemon {
  const unlocks: FakeDaemon['unlocks'] = [];
  const bootstraps: unknown[] = [];
  const sessions: Array<{
    keyRole: string;
    keyFingerprintHex: string;
    publicKeyHex: string;
  }> = [];
  const connect = async (): Promise<PicoVaultDaemonClient> => ({
    hello: async () => ({
      protocolVersion: 1,
      daemonVersion: 'test',
      locked: sessions.length === 0,
    }),
    status: async () => ({
      locked: sessions.length === 0,
      sessions: [...sessions],
      keyfiles: [],
    }),
    unlock: async (input: {
      keyRole: string;
      keyFingerprintHex: string;
      passphrase: string;
    }) => {
      unlocks.push(input);
      const keyFingerprintHex = options.swapUnlockedFingerprint === true
        ? 'ff'.repeat(32)
        : input.keyFingerprintHex;
      sessions.push({
        keyRole: input.keyRole,
        keyFingerprintHex,
        publicKeyHex: 'aa'.repeat(32),
      });
      return {
        keyRole: input.keyRole,
        keyFingerprintHex,
        publicKeyHex: 'aa'.repeat(32),
        idleLockMs: 300_000,
        maxUnlockDurationMs: 900_000,
      };
    },
    approvalWatch: async () => ({ watching: true }),
    approvalWait: async () => {
      throw new Error('daemon_connection_closed');
    },
    recoveryBootstrap: async (input: unknown) => {
      bootstraps.push(input);
      throw new Error('unexpected_bootstrap_in_this_test');
    },
    close: async () => undefined,
  } as unknown as PicoVaultDaemonClient);
  return { connect, unlocks, bootstraps };
}

function silentDecisions(): PicoCompanionApprovalDecisionPort {
  return { decideApproval: async () => false };
}

function secretPort(expected: string): PicoCompanionPlatformSecretPort {
  return {
    platform: 'linux',
    selectedBackend: () => 'gnome_libsecret',
    isEncryptionAvailable: () => true,
    encryptString: (plainText: string) => {
      if (plainText !== expected) {
        throw new Error('unexpected_plaintext');
      }
      return new TextEncoder().encode(`sealed:${plainText}`);
    },
    decryptString: (encrypted: Uint8Array) =>
      new TextDecoder().decode(encrypted).replace(/^sealed:/u, ''),
  };
}

function silentNotifications(): PicoCompanionRecoveryNotifications {
  return {
    presentRecoveryWaiting: () => undefined,
    notifyRecoveryCompleted: () => undefined,
    notifyRecoveryCompletionBlocked: () => undefined,
  };
}

function stubSodium() {
  return {
    randombytes_buf: (length: number) => new Uint8Array(length).fill(7),
  } as unknown as Parameters<typeof runPicoCompanionFirstRun>[0]['sodium'];
}
