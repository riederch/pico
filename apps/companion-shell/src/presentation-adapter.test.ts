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
  });
});
