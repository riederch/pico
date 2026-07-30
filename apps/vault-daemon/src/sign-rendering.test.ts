import {
  buildPicoHomeDeviceActivationSignatureInput,
  buildPicoIdentityDelegationSignatureInput,
  buildPicoIdentityRevocationSignatureInput,
  picoHomeDeviceLifecycleCanonicalLabels,
  picoIdentitySignatureInputLabels,
  picoIdentitySuite,
  type PicoHomeDeviceActivationSignatureInput,
  type PicoIdentityDelegationSignatureInput,
  type PicoIdentityRevocationSignatureInput,
} from '@pico/protocol';
import { describe, expect, it } from 'vitest';
import {
  buildPicoVaultSignatureInputFromFields,
  renderPicoVaultApprovalStatement,
} from './sign-rendering.js';

describe('ADR 0109 device lifecycle approval rendering', () => {
  it('shows the exact device target, scopes, validity and delegation action', () => {
    const delegation: PicoIdentityDelegationSignatureInput = {
      suite: picoIdentitySuite,
      delegationId: 'delegation_render_device_0001',
      issuerIdentityKeyFingerprintHex: '11'.repeat(32),
      subjectSigningKeyFingerprintHex: '22'.repeat(32),
      subjectKeyAgreementKeyFingerprintHex: '33'.repeat(32),
      scopes: ['surface_session', 'decrypt_domain'],
      validFrom: '2026-07-30T12:00:00.000Z',
      validUntil: '2027-07-30T12:00:00.000Z',
      lifecycleOrder: 'seq:0000000000000002',
    };

    expect(buildPicoVaultSignatureInputFromFields(
      picoIdentitySignatureInputLabels.delegation,
      delegation,
    )).toEqual(buildPicoIdentityDelegationSignatureInput(delegation));
    expect(renderPicoVaultApprovalStatement(
      picoIdentitySignatureInputLabels.delegation,
      delegation,
    )).toBe(
      'Create device authority: delegate surface_session, decrypt_domain '
      + 'to device keys 222222222222… and 333333333333… '
      + 'from 2026-07-30T12:00:00.000Z until 2027-07-30T12:00:00.000Z.',
    );
  });

  it('renders the revocation action with an explicit last-remote-path warning', () => {
    const revocation: PicoIdentityRevocationSignatureInput = {
      suite: picoIdentitySuite,
      revocationId: 'revocation_render_device_0001',
      issuerIdentityKeyFingerprintHex: '11'.repeat(32),
      subjectKind: 'delegation',
      subjectRef: 'delegation_render_device_0001',
      reasonCategory: 'device_retired',
      revokedAt: '2026-07-30T12:05:00.000Z',
      lifecycleOrder: 'seq:0000000000000003',
    };

    expect(buildPicoVaultSignatureInputFromFields(
      picoIdentitySignatureInputLabels.revocation,
      revocation,
    )).toEqual(buildPicoIdentityRevocationSignatureInput(revocation));
    expect(renderPicoVaultApprovalStatement(
      picoIdentitySignatureInputLabels.revocation,
      revocation,
    )).toBe(
      'Revoke delegation delegation_render_device_0001 (device_retired). '
      + 'Warning: this may close the last remote device path.',
    );
  });

  it('builds target activation bytes but exposes no approval renderer', () => {
    const activation: PicoHomeDeviceActivationSignatureInput = {
      suite: picoIdentitySuite,
      activationId: 'activation_render_device_0001',
      action: 'enroll',
      homeId: 'home_render_device_0001',
      hostSigningKeyFingerprintHex: '11'.repeat(32),
      picoIdentityFingerprintHex: '22'.repeat(32),
      sponsorDelegationId: 'delegation_render_sponsor_0001',
      sponsorDeviceSigningKeyFingerprintHex: '33'.repeat(32),
      sponsorDeviceKeyAgreementKeyFingerprintHex: '44'.repeat(32),
      targetDelegationId: 'delegation_render_target_0001',
      targetDeviceSigningKeyFingerprintHex: '55'.repeat(32),
      targetDeviceKeyAgreementKeyFingerprintHex: '66'.repeat(32),
      lifecycleEvidenceDigestHex: '77'.repeat(32),
      observedLifecycleOrder: 'seq:0000000000000001',
      createdAt: '2026-07-30T12:00:00.000Z',
      expiresAt: '2026-07-30T12:04:00.000Z',
    };

    expect(buildPicoVaultSignatureInputFromFields(
      picoHomeDeviceLifecycleCanonicalLabels.activation,
      activation,
    )).toEqual(buildPicoHomeDeviceActivationSignatureInput(activation));
    expect(renderPicoVaultApprovalStatement(
      picoHomeDeviceLifecycleCanonicalLabels.activation,
      activation,
    )).toBeUndefined();
  });
});
