import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sodium from 'libsodium-wrappers-sumo';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildPicoHomeDeviceActivationSignatureInput,
  buildPicoHomeDeviceLifecycleReceiptSignatureInput,
  picoHomeDeviceActivationActions,
  picoHomeDeviceLifecycleActions,
  picoHomeDeviceLifecycleCanonicalLabels,
  picoHomeDeviceLifecycleEvidenceDigestHex,
  picoHomeDeviceLifecycleRecordSchema,
  picoHomeDeviceLifecycleSubmissionDigestHex,
  picoHomeDeviceLifecycleSubmissionSchema,
  picoProtocolVersion,
  type PicoHomeDeviceActivationSignatureInput,
  type PicoHomeDeviceLifecycleEvidence,
  type PicoHomeDeviceLifecycleReceiptSignatureInput,
  type PicoHomeDeviceLifecycleSubmission,
} from './index.js';

type JsonRecord = Record<string, unknown>;

beforeAll(async () => {
  await sodium.ready;
});

describe('ADR 0109 device lifecycle protocol forms', () => {
  it('pins the authoritative activation, evidence, submission and receipt vectors', () => {
    const suite = JSON.parse(readFileSync(resolve(
      process.cwd(),
      '../../docs/protocol/fixtures/home-device-lifecycle/suite.json',
    ), 'utf8')) as JsonRecord;
    const enrollment = suite.enrollment as JsonRecord;
    const evidence = enrollment.evidence as unknown as PicoHomeDeviceLifecycleEvidence;
    const activation = enrollment.activation as unknown as PicoHomeDeviceActivationSignatureInput;
    const submission: PicoHomeDeviceLifecycleSubmission = {
      schema: picoHomeDeviceLifecycleSubmissionSchema,
      evidence,
      activation: {
        input: activation,
        targetSignatureHex: enrollment.targetSignatureHex as string,
      },
    };
    const receiptVector = suite.receipt as JsonRecord;
    const receipt = receiptVector.fields as unknown as PicoHomeDeviceLifecycleReceiptSignatureInput;

    expect(suite.schema).toBe('pico.home.device-lifecycle.vector.suite');
    expect(suite.schemaVersion).toBe(1);
    expect(suite.suiteVersion).toBe(picoProtocolVersion);
    expect(suite.compatibilityLevel)
      .toBe('authoritative-local-device-lifecycle-vectors');
    expect(picoHomeDeviceLifecycleEvidenceDigestHex(sodium, evidence))
      .toBe(enrollment.evidenceDigestHex);
    expect(Buffer.from(buildPicoHomeDeviceActivationSignatureInput(activation)).toString('hex'))
      .toBe(enrollment.activationSignatureInputHex);
    expect(buildPicoHomeDeviceActivationSignatureInput(activation).length)
      .toBe(enrollment.activationSignatureInputLen);
    expect(picoHomeDeviceLifecycleSubmissionDigestHex(sodium, submission))
      .toBe(enrollment.submissionDigestHex);
    expect(Buffer.from(buildPicoHomeDeviceLifecycleReceiptSignatureInput(receipt)).toString('hex'))
      .toBe(receiptVector.signatureInputHex);
    expect(buildPicoHomeDeviceLifecycleReceiptSignatureInput(receipt).length)
      .toBe(receiptVector.signatureInputLen);
  });

  it('exports a closed action/schema/label vocabulary and keeps the durable record distinct', () => {
    expect(picoHomeDeviceLifecycleActions).toEqual(['enroll', 'renew', 'revoke']);
    expect(picoHomeDeviceActivationActions).toEqual(['enroll', 'renew']);
    expect(picoHomeDeviceLifecycleSubmissionSchema)
      .toBe('pico.home.device-lifecycle-submission.v1');
    expect(picoHomeDeviceLifecycleRecordSchema)
      .toBe('pico.home.device-lifecycle-record.v1');
    expect(picoHomeDeviceLifecycleCanonicalLabels).toEqual({
      activation: 'pico.home.device-activation.v1',
      evidenceDigest: 'pico.home.device-lifecycle-evidence-digest.v1',
      submissionDigest: 'pico.home.device-lifecycle-submission-digest.v1',
      receipt: 'pico.home.device-lifecycle-receipt.v1',
    });
  });

  it('rejects action/evidence shape substitution before a digest can authorize it', () => {
    const suite = fixtureSuite();
    const enrollment = suite.enrollment as JsonRecord;
    const evidence = enrollment.evidence as unknown as PicoHomeDeviceLifecycleEvidence;
    const activation = enrollment.activation as unknown as PicoHomeDeviceActivationSignatureInput;
    const base = {
      schema: picoHomeDeviceLifecycleSubmissionSchema,
      evidence,
      activation: {
        input: activation,
        targetSignatureHex: enrollment.targetSignatureHex as string,
      },
    } satisfies PicoHomeDeviceLifecycleSubmission;

    expect(() => picoHomeDeviceLifecycleSubmissionDigestHex(sodium, {
      ...base,
      activation: {
        ...base.activation!,
        input: {
          ...activation,
          homeId: 'home_substituted',
        },
      },
    })).not.toThrow();
    expect(picoHomeDeviceLifecycleSubmissionDigestHex(sodium, {
      ...base,
      activation: {
        ...base.activation!,
        input: {
          ...activation,
          homeId: 'home_substituted',
        },
      },
    })).not.toBe(enrollment.submissionDigestHex);

    expect(() => picoHomeDeviceLifecycleSubmissionDigestHex(sodium, {
      ...base,
      evidence: {
        ...evidence,
        action: 'renew',
      },
      activation: {
        ...base.activation!,
        input: { ...activation, action: 'renew' },
      },
    })).toThrow('invalid_device_renewal_evidence');

    expect(() => picoHomeDeviceLifecycleSubmissionDigestHex(sodium, {
      ...base,
      evidence: {
        ...evidence,
        action: 'revoke',
        targetDeviceSigningKeyRecord: null,
        targetDeviceKeyAgreementKeyRecord: null,
        delegation: null,
      },
    })).toThrow();

    const revocation = {
      record: {
        suite: 'pico.suite.id.v1',
        revocationId: 'revocation_protocol_negative',
        issuerIdentityKeyFingerprintHex: evidence.picoIdentityFingerprintHex,
        subjectKind: 'delegation' as const,
        subjectRef: evidence.targetDelegationId,
        reasonCategory: 'device_retired' as const,
        revokedAt: '2026-07-30T10:05:00.000Z',
        lifecycleOrder: 'seq:0000000000000003',
      },
      signatureHex: 'cc'.repeat(64),
    };
    expect(() => picoHomeDeviceLifecycleSubmissionDigestHex(sodium, {
      ...base,
      evidence: {
        ...evidence,
        revocations: [revocation],
      },
    })).toThrow('invalid_device_enrollment_evidence');
    expect(() => picoHomeDeviceLifecycleSubmissionDigestHex(sodium, {
      ...base,
      evidence: {
        ...evidence,
        action: 'revoke',
        targetDeviceSigningKeyRecord: null,
        targetDeviceKeyAgreementKeyRecord: null,
        delegation: null,
        revocations: [revocation],
      },
    })).toThrow('unexpected_device_activation');

    expect(() => buildPicoHomeDeviceActivationSignatureInput({
      ...activation,
      action: 'revoke' as never,
    })).toThrow('invalid_device_lifecycle_action');
  });

  it('binds every receipt fact, including last-device closure', () => {
    const suite = fixtureSuite();
    const receipt = (suite.receipt as JsonRecord).fields as unknown as PicoHomeDeviceLifecycleReceiptSignatureInput;
    const baseline = Buffer.from(
      buildPicoHomeDeviceLifecycleReceiptSignatureInput(receipt),
    ).toString('hex');

    expect(Buffer.from(buildPicoHomeDeviceLifecycleReceiptSignatureInput({
      ...receipt,
      transitionDigestHex: '00'.repeat(32),
    })).toString('hex')).not.toBe(baseline);
    expect(Buffer.from(buildPicoHomeDeviceLifecycleReceiptSignatureInput({
      ...receipt,
      leavesNoActiveDevice: true,
    })).toString('hex')).not.toBe(baseline);
    expect(() => buildPicoHomeDeviceLifecycleReceiptSignatureInput({
      ...receipt,
      action: 'replace' as never,
    })).toThrow('invalid_device_lifecycle_action');
  });

  it('keeps the authoritative negative-case inventory closed', () => {
    expect(fixtureSuite().negativeCases).toEqual([
      'activation-evidence-digest-substitution',
      'activation-home-substitution',
      'activation-over-five-minutes',
      'revoke-with-target-activation',
      'enroll-with-root-revocation',
      'renew-without-replaced-delegation',
      'unknown-action',
      'receipt-transition-digest-substitution',
      'issuer-lifecycle-order-reuse',
    ]);
  });
});

function fixtureSuite(): JsonRecord {
  return JSON.parse(readFileSync(resolve(
    process.cwd(),
    '../../docs/protocol/fixtures/home-device-lifecycle/suite.json',
  ), 'utf8')) as JsonRecord;
}
