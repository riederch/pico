import { describe, expect, it } from 'vitest';
import type { PicoCompanionPresentation } from './contract.js';
import { createPicoCompanionPresentationAdapter } from './presentation-adapter.js';

describe('Electron presentation adapter', () => {
  it('publishes loud rendered ADR 0106 statements and only clears recovery state', async () => {
    const presented: PicoCompanionPresentation[] = [];
    const notified: PicoCompanionPresentation[] = [];
    const adapter = createPicoCompanionPresentationAdapter({
      present: (state) => { presented.push(state); },
      notify: (state) => { notified.push(state); },
    }, () => new Date('2026-08-02T12:00:00Z'));

    await adapter.notifyPendingRecovery({
      picoIdentityFingerprintHex: 'aa'.repeat(32),
      pending: {
        recoveryId: 'recovery_1',
        claimDigestHex: 'bb'.repeat(32),
        targetDelegationId: 'target_1',
        targetDeviceSigningKeyFingerprintHex: 'cc'.repeat(32),
        targetDeviceKeyAgreementKeyFingerprintHex: 'dd'.repeat(32),
        acceptedAt: '2026-08-02T10:00:00.000Z',
        effectiveAt: '2026-08-04T10:00:00.000Z',
        completionExpiresAt: '2026-08-11T10:00:00.000Z',
      },
    });
    expect(presented.at(-1)).toMatchObject({
      kind: 'pending_recovery',
      severity: 'blocked',
      symbol: '×',
      decision: 'veto_recovery',
    });
    expect(presented.at(-1)?.body).toContain('Identity aaaaaaaa…aaaaaaaa');
    expect(presented.at(-1)?.body).toContain('Target device cccccccc…cccccccc');
    expect(notified).toHaveLength(1);

    await adapter.clearPendingRecovery?.();
    expect(presented.at(-1)?.kind).toBe('idle');
    expect(notified).toHaveLength(1);

    await adapter.notifyHostKeysRotated({
      previousHostSigningKeyFingerprintHex: '11'.repeat(32),
      hostSigningKeyFingerprintHex: '22'.repeat(32),
      followedLinks: 1,
    });
    await adapter.clearPendingRecovery?.();
    expect(presented.at(-1)?.kind).toBe('host_keys_rotated');
    expect(notified.at(-1)?.kind).toBe('host_keys_rotated');

    await adapter.notifyHostContinuityUnverified({
      coreUrl: 'https://pico.home',
      reason: 'continuity_signature_invalid',
    });
    expect(presented.at(-1)).toMatchObject({
      kind: 'host_continuity_unverified',
      severity: 'blocked',
    });
    expect(notified).toHaveLength(3);

    await adapter.presentRecoveryWaiting({
      picoIdentityFingerprintHex: 'aa'.repeat(32),
      pending: {
        recoveryId: 'recovery_target_1',
        claimDigestHex: 'bb'.repeat(32),
        targetDelegationId: 'target_1',
        targetDeviceSigningKeyFingerprintHex: 'cc'.repeat(32),
        targetDeviceKeyAgreementKeyFingerprintHex: 'dd'.repeat(32),
        acceptedAt: '2026-08-02T10:00:00.000Z',
        effectiveAt: '2026-08-04T10:00:00.000Z',
        completionExpiresAt: '2026-08-11T10:00:00.000Z',
      },
    });
    expect(presented.at(-1)).toMatchObject({
      kind: 'recovery_waiting',
      decision: 'none',
    });
    expect(presented.at(-1)?.body).toContain('Nothing can hurry this wait');

    await adapter.notifyRecoveryCompleted({
      picoIdentityFingerprintHex: 'aa'.repeat(32),
      receipt: {
        recoveryId: 'recovery_target_1',
        targetDelegationId: 'target_1',
        targetDeviceSigningKeyFingerprintHex: 'cc'.repeat(32),
        targetDeviceKeyAgreementKeyFingerprintHex: 'dd'.repeat(32),
        completedAt: '2026-08-04T10:00:01.000Z',
        leavesExactlyOneActiveDevice: true,
        otherDevicesRevoked: true,
      },
    });
    expect(presented.at(-1)).toMatchObject({
      kind: 'recovery_completed',
      severity: 'active',
    });
    expect(presented.at(-1)?.body).toContain('Exactly one active device remains');
    expect(presented.at(-1)?.body).toContain('surviving hardware must re-enroll');

    await adapter.notifyRecoveryCompletionBlocked({
      picoIdentityFingerprintHex: 'aa'.repeat(32),
      pending: {
        recoveryId: 'recovery_target_2',
        claimDigestHex: 'bb'.repeat(32),
        targetDelegationId: 'target_2',
        targetDeviceSigningKeyFingerprintHex: 'cc'.repeat(32),
        targetDeviceKeyAgreementKeyFingerprintHex: 'dd'.repeat(32),
        acceptedAt: '2026-08-02T10:00:00.000Z',
        effectiveAt: '2026-08-04T10:00:00.000Z',
        completionExpiresAt: '2026-08-11T10:00:00.000Z',
      },
      reason: 'vault_locked',
    });
    expect(presented.at(-1)).toMatchObject({
      kind: 'recovery_completion_blocked',
      severity: 'blocked',
    });
  });
});

describe('ADR 0118 O1 - what the surface says it showed', () => {
  const entries = [
    { memoryItemId: 'item_newer', dueAt: '2026-08-14T11:00:00.000Z', kind: 'reminder' as const },
    { memoryItemId: 'item_older', dueAt: '2026-08-14T09:00:00.000Z', kind: 'reminder' as const },
  ];

  it('names one entry and reports that one as told', async () => {
    // The notification shows the oldest and counts the rest. Reporting the
    // whole list as told would retire entries whose identity the person never
    // saw, and they would never be offered again - the silent failure this
    // family calls worse than never recording anything.
    const presented: PicoCompanionPresentation[] = [];
    const adapter = createPicoCompanionPresentationAdapter({
      present: (state) => { presented.push(state); },
      notify: () => {},
    }, () => new Date('2026-08-14T12:00:00Z'));

    const told = await adapter.reportDueEntries({ entries, total: 2 });

    expect(told).toEqual({ told: ['item_older'] });
    expect(presented.at(-1)?.kind).toBe('time_bound_entry_due');
  });

  it('reports nothing told when nothing is due', async () => {
    const adapter = createPicoCompanionPresentationAdapter({
      present: () => {},
      notify: () => {},
    }, () => new Date('2026-08-14T12:00:00Z'));

    expect(await adapter.reportDueEntries({ entries: [], total: 0 })).toEqual({ told: [] });
  });

  it('says nothing was told when the surface could not take it', async () => {
    // A presentation that threw is a person who was not told, and the
    // acknowledgement sits downstream of this so it cannot run.
    const adapter = createPicoCompanionPresentationAdapter({
      present: () => {
        throw new Error('screen_unavailable');
      },
      notify: () => {},
    }, () => new Date('2026-08-14T12:00:00Z'));

    await expect(adapter.reportDueEntries({ entries, total: 2 })).rejects.toThrow('screen_unavailable');
  });
});
