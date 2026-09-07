import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { PicoHomeDeviceRecoveryPendingView } from '@pico/protocol';
import type { PicoLinkDirectClient } from '@pico/vault-daemon';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PicoCompanionProfile } from './profile.js';
import {
  checkPicoCompanionRecoveryCompletion,
  vetoPicoCompanionPendingRecovery,
  type PicoCompanionRecoveryNotifications,
} from './recovery-controller.js';
import {
  picoCompanionRecoveryStateSchema,
  readPicoCompanionRecoveryState,
  writePicoCompanionRecoveryState,
} from './recovery-state.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('ADR 0112 S3 companion recovery decisions', () => {
  it('renders the fixed wait without attempting completion early', async () => {
    const fixture = setup();
    const request = vi.fn();
    const notifications = recordingNotifications();

    await expect(checkPicoCompanionRecoveryCompletion({
      statePath: fixture.statePath,
      profile: fixture.profile,
      targetLinkClient: linkClient(fixture.profile, request),
      notifications,
      now: () => new Date('2026-08-02T10:00:00.000Z'),
    })).resolves.toMatchObject({ status: 'waiting' });
    expect(request).not.toHaveBeenCalled();
    expect(notifications.waiting).toHaveLength(1);
    expect(notifications.waiting[0]?.pending.effectiveAt)
      .toBe(fixture.pending.effectiveAt);
  });

  it('completes automatically after effectiveAt and persists the receipt summary', async () => {
    const fixture = setup();
    const request = vi.fn(async () => ({
      outcome: 'ok',
      result: { status: 'consumed', record: completionRecord(fixture.pending) },
    }));
    const notifications = recordingNotifications();

    const completed = await checkPicoCompanionRecoveryCompletion({
      statePath: fixture.statePath,
      profile: fixture.profile,
      targetLinkClient: linkClient(fixture.profile, request),
      notifications,
      now: () => new Date('2026-08-03T10:00:01.000Z'),
    });

    expect(completed).toMatchObject({
      status: 'completed',
      receipt: {
        recoveryId: fixture.pending.recoveryId,
        leavesExactlyOneActiveDevice: true,
        otherDevicesRevoked: true,
      },
    });
    expect(request).toHaveBeenCalledWith('home.device.recovery.submit', {
      phase: 'complete',
      recoveryId: fixture.pending.recoveryId,
      claimDigestHex: fixture.pending.claimDigestHex,
    });
    expect(readPicoCompanionRecoveryState(fixture.statePath))
      .toMatchObject({ status: 'completed' });
    expect(notifications.completed).toHaveLength(1);
  });

  it('keeps pending state on a locked Vault and names a lapsed window', async () => {
    const locked = setup();
    const lockedNotifications = recordingNotifications();
    const lockedRequest = vi.fn(async () => {
      throw new Error('link_device_signing_key_not_unlocked');
    });
    await expect(checkPicoCompanionRecoveryCompletion({
      statePath: locked.statePath,
      profile: locked.profile,
      targetLinkClient: linkClient(locked.profile, lockedRequest),
      notifications: lockedNotifications,
      now: () => new Date('2026-08-03T10:00:01.000Z'),
    })).resolves.toMatchObject({ status: 'blocked', reason: 'vault_locked' });
    expect(readPicoCompanionRecoveryState(locked.statePath))
      .toMatchObject({ status: 'pending' });

    const lapsed = setup();
    const lapsedNotifications = recordingNotifications();
    const lapsedRequest = vi.fn();
    await expect(checkPicoCompanionRecoveryCompletion({
      statePath: lapsed.statePath,
      profile: lapsed.profile,
      targetLinkClient: linkClient(lapsed.profile, lapsedRequest),
      notifications: lapsedNotifications,
      now: () => new Date('2026-08-10T10:00:00.000Z'),
    })).resolves.toMatchObject({
      status: 'blocked',
      reason: 'completion_window_lapsed',
    });
    expect(lapsedRequest).not.toHaveBeenCalled();

    /**
     * The third answer, and nothing had ever been through it (Befund B71).
     * `vault_locked` is a closed list of four messages a locked Vault gives;
     * everything else is `completion_failed`, and the difference is what the
     * person is told to do - unlock, or try again later. A failure the list
     * does not know must not read as "your Vault is locked", because it is
     * the one sentence the person can act on and being wrong about it costs
     * them the window.
     */
    const failing = setup();
    const failingNotifications = recordingNotifications();
    const failingRequest = vi.fn(async () => {
      throw new Error('home_unreachable');
    });
    await expect(checkPicoCompanionRecoveryCompletion({
      statePath: failing.statePath,
      profile: failing.profile,
      targetLinkClient: linkClient(failing.profile, failingRequest),
      notifications: failingNotifications,
      now: () => new Date('2026-08-03T10:00:01.000Z'),
    })).resolves.toMatchObject({ status: 'blocked', reason: 'completion_failed' });
    expect(readPicoCompanionRecoveryState(failing.statePath))
      .toMatchObject({ status: 'pending' });
  });

  it('vetoes the exact alarm recovery and refuses a mismatched local target state', async () => {
    const fixture = setup();
    const request = vi.fn(async () => ({
      outcome: 'ok',
      result: { status: 'vetoed' },
    }));
    const link = linkClient(fixture.profile, request);

    await expect(vetoPicoCompanionPendingRecovery({
      livingDeviceLinkClient: link,
      pending: fixture.pending,
    })).resolves.toEqual({ status: 'vetoed' });
    expect(request).toHaveBeenCalledWith('home.device.recovery.veto', {
      recoveryId: fixture.pending.recoveryId,
    });

    const notifications = recordingNotifications();
    await expect(checkPicoCompanionRecoveryCompletion({
      statePath: fixture.statePath,
      profile: {
        ...fixture.profile,
        device: { ...fixture.profile.device, delegationId: 'another_target' },
      },
      targetLinkClient: link,
      notifications,
    })).rejects.toThrow('companion_recovery_state_target_mismatch');
  });
});

function setup(): {
  statePath: string;
  pending: PicoHomeDeviceRecoveryPendingView;
  profile: PicoCompanionProfile;
} {
  const directory = mkdtempSync(join(tmpdir(), 'pico-companion-recovery-controller-'));
  temporaryDirectories.push(directory);
  const statePath = join(directory, 'recovery-state.json');
  const pending: PicoHomeDeviceRecoveryPendingView = {
    recoveryId: 'recovery_product_1',
    claimDigestHex: '11'.repeat(32),
    targetDelegationId: 'delegation_product_1',
    targetDeviceSigningKeyFingerprintHex: '22'.repeat(32),
    targetDeviceKeyAgreementKeyFingerprintHex: '33'.repeat(32),
    acceptedAt: '2026-08-01T10:00:00.000Z',
    effectiveAt: '2026-08-03T10:00:00.000Z',
    completionExpiresAt: '2026-08-10T10:00:00.000Z',
  };
  const profile: PicoCompanionProfile = {
    schema: 'pico.companion.profile.v1',
    coreUrl: 'http://127.0.0.1:8321',
    home: { homeHostPicoIdentityFingerprintHex: '44'.repeat(32) },
    host: {
      signingPublicKeyHex: '55'.repeat(32),
      signingKeyFingerprintHex: '66'.repeat(32),
      keyAgreementPublicKeyHex: '77'.repeat(32),
      keyAgreementKeyFingerprintHex: '88'.repeat(32),
    },
    identity: {
      keyFingerprintHex: '99'.repeat(32),
      publicKeyHex: 'aa'.repeat(32),
    },
    device: {
      signingKeyFingerprintHex: pending.targetDeviceSigningKeyFingerprintHex,
      keyAgreementKeyFingerprintHex:
        pending.targetDeviceKeyAgreementKeyFingerprintHex,
      delegationId: pending.targetDelegationId,
    },
  };
  writePicoCompanionRecoveryState(statePath, {
    schema: picoCompanionRecoveryStateSchema,
    status: 'pending',
    pending,
  });
  return { statePath, pending, profile };
}

function linkClient(
  profile: PicoCompanionProfile,
  request: ReturnType<typeof vi.fn>,
): PicoLinkDirectClient {
  return {
    hostSigningKeyFingerprintHex: profile.host.signingKeyFingerprintHex,
    hostKeyAgreementKeyFingerprintHex:
      profile.host.keyAgreementKeyFingerprintHex,
    sender: {
      identityKeyFingerprintHex: profile.identity.keyFingerprintHex,
      identityPublicKeyHex: profile.identity.publicKeyHex,
      deviceSigningKeyFingerprintHex:
        profile.device.signingKeyFingerprintHex,
      deviceKeyAgreementKeyFingerprintHex:
        profile.device.keyAgreementKeyFingerprintHex,
      delegationId: profile.device.delegationId,
    },
    request,
  } as unknown as PicoLinkDirectClient;
}

function completionRecord(pending: PicoHomeDeviceRecoveryPendingView): Record<string, unknown> {
  return {
    schema: 'pico.home.device-recovery-record.v1',
    submission: {
      schema: 'pico.home.device-recovery-submission.v1',
      claim: {
        recoveryId: pending.recoveryId,
        targetDelegationId: pending.targetDelegationId,
        targetDeviceSigningKeyFingerprintHex:
          pending.targetDeviceSigningKeyFingerprintHex,
        targetDeviceKeyAgreementKeyFingerprintHex:
          pending.targetDeviceKeyAgreementKeyFingerprintHex,
      },
    },
    receipt: {
      recoveryId: pending.recoveryId,
      claimDigestHex: pending.claimDigestHex,
      targetDelegationId: pending.targetDelegationId,
      targetDeviceSigningKeyFingerprintHex:
        pending.targetDeviceSigningKeyFingerprintHex,
      targetDeviceKeyAgreementKeyFingerprintHex:
        pending.targetDeviceKeyAgreementKeyFingerprintHex,
      pendingAcceptedAt: pending.acceptedAt,
      effectiveAt: pending.effectiveAt,
      completionExpiresAt: pending.completionExpiresAt,
      completedAt: '2026-08-03T10:00:01.000Z',
      leavesExactlyOneActiveDevice: true,
    },
    hostSigningKeyRecord: {},
    hostSignatureHex: 'bb'.repeat(64),
  };
}

function recordingNotifications(): PicoCompanionRecoveryNotifications & {
  waiting: Parameters<PicoCompanionRecoveryNotifications['presentRecoveryWaiting']>[0][];
  completed: Parameters<PicoCompanionRecoveryNotifications['notifyRecoveryCompleted']>[0][];
  blocked: Parameters<PicoCompanionRecoveryNotifications['notifyRecoveryCompletionBlocked']>[0][];
} {
  const waiting: Parameters<
    PicoCompanionRecoveryNotifications['presentRecoveryWaiting']
  >[0][] = [];
  const completed: Parameters<
    PicoCompanionRecoveryNotifications['notifyRecoveryCompleted']
  >[0][] = [];
  const blocked: Parameters<
    PicoCompanionRecoveryNotifications['notifyRecoveryCompletionBlocked']
  >[0][] = [];
  return {
    waiting,
    completed,
    blocked,
    presentRecoveryWaiting: (input) => { waiting.push(input); },
    notifyRecoveryCompleted: (input) => { completed.push(input); },
    notifyRecoveryCompletionBlocked: (input) => { blocked.push(input); },
  };
}
