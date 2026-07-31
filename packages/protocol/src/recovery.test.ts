import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sodium from 'libsodium-wrappers-sumo';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildPicoHomeDeviceRecoveryClaimSignatureInput,
  buildPicoHomeDeviceRecoveryPrepareSignatureInput,
  buildPicoHomeDeviceRecoveryReceiptSignatureInput,
  buildPicoRecoveryCardPayload,
  picoHomeDeviceRecoveryCanonicalLabels,
  picoHomeDeviceRecoveryClaimDigestHex,
  picoHomeDeviceRecoveryEvidenceDigestHex,
  picoHomeDeviceRecoveryRecordSchema,
  picoHomeDeviceRecoverySubmissionSchema,
  picoProtocolVersion,
  picoRecoveryCardSchema,
  type PicoHomeDeviceRecoveryClaimSignatureInput,
  type PicoHomeDeviceRecoveryPrepareSignatureInput,
  type PicoHomeDeviceRecoveryEvidence,
  type PicoHomeDeviceRecoveryReceiptSignatureInput,
  type PicoRecoveryCardPayload,
} from './index.js';

type JsonRecord = Record<string, unknown>;

beforeAll(async () => {
  await sodium.ready;
});

describe('ADR 0110 recovery protocol forms', () => {
  it('pins the authoritative card, evidence, claim and receipt vectors', () => {
    const suite = fixtureSuite();
    const card = (suite.card as JsonRecord)
      .fields as unknown as PicoRecoveryCardPayload;
    const evidence =
      suite.evidence as unknown as PicoHomeDeviceRecoveryEvidence;
    const claim = (suite.claim as JsonRecord)
      .fields as unknown as PicoHomeDeviceRecoveryClaimSignatureInput;
    const receipt = (suite.receipt as JsonRecord)
      .fields as unknown as PicoHomeDeviceRecoveryReceiptSignatureInput;

    expect(suite.schema)
      .toBe('pico.home.device-recovery.vector.suite');
    expect(suite.schemaVersion).toBe(1);
    expect(suite.suiteVersion).toBe(picoProtocolVersion);
    expect(Buffer.from(buildPicoRecoveryCardPayload(card)).toString('hex'))
      .toBe((suite.card as JsonRecord).canonicalPayloadHex);
    expect(picoHomeDeviceRecoveryEvidenceDigestHex(sodium, evidence))
      .toBe(suite.evidenceDigestHex);
    expect(Buffer.from(
      buildPicoHomeDeviceRecoveryClaimSignatureInput(claim),
    ).toString('hex')).toBe(
      (suite.claim as JsonRecord).signatureInputHex,
    );
    expect(picoHomeDeviceRecoveryClaimDigestHex(sodium, claim))
      .toBe((suite.claim as JsonRecord).digestHex);
    expect(Buffer.from(
      buildPicoHomeDeviceRecoveryReceiptSignatureInput(receipt),
    ).toString('hex')).toBe(
      (suite.receipt as JsonRecord).signatureInputHex,
    );
  });

  it('exports a closed schema and canonical-label vocabulary', () => {
    expect(picoRecoveryCardSchema).toBe('pico.recovery.card.v1');
    expect(picoHomeDeviceRecoverySubmissionSchema)
      .toBe('pico.home.device-recovery-submission.v1');
    expect(picoHomeDeviceRecoveryRecordSchema)
      .toBe('pico.home.device-recovery-record.v1');
    expect(picoHomeDeviceRecoveryCanonicalLabels).toEqual({
      card: 'pico.recovery.card.v1',
      prepare: 'pico.home.device-recovery-prepare.v1',
      evidenceDigest:
        'pico.home.device-recovery-evidence-digest.v1',
      claim: 'pico.home.device-recovery-claim.v1',
      receipt: 'pico.home.device-recovery-receipt.v1',
    });
  });

  it('canonically binds root-authorized preparation to one Home and target', () => {
    const vector = fixtureSuite().prepare as JsonRecord;
    const prepare = vector.fields as unknown as
      PicoHomeDeviceRecoveryPrepareSignatureInput;
    const baseline = Buffer.from(
      buildPicoHomeDeviceRecoveryPrepareSignatureInput(prepare),
    ).toString('hex');
    expect(baseline).toBe(vector.signatureInputHex);
    for (const variant of [
      { ...prepare, homeId: 'home_other' },
      {
        ...prepare,
        targetDeviceSigningKeyFingerprintHex: '44'.repeat(32),
      },
      {
        ...prepare,
        hostSigningKeyFingerprintHex: '55'.repeat(32),
      },
    ]) {
      expect(Buffer.from(
        buildPicoHomeDeviceRecoveryPrepareSignatureInput(variant),
      ).toString('hex')).not.toBe(baseline);
    }
  });

  it('binds Home, identity, target, evidence and lifecycle head distinctly', () => {
    const suite = fixtureSuite();
    const claim = (suite.claim as JsonRecord)
      .fields as unknown as PicoHomeDeviceRecoveryClaimSignatureInput;
    const original =
      picoHomeDeviceRecoveryClaimDigestHex(sodium, claim);
    for (const changed of [
      { ...claim, homeId: 'home_transplanted' },
      {
        ...claim,
        hostSigningKeyFingerprintHex: '00'.repeat(32),
      },
      {
        ...claim,
        hostKeyAgreementKeyFingerprintHex: '00'.repeat(32),
      },
      {
        ...claim,
        picoIdentityFingerprintHex: '00'.repeat(32),
      },
      {
        ...claim,
        targetDeviceSigningKeyFingerprintHex: '00'.repeat(32),
      },
      {
        ...claim,
        evidenceDigestHex: '00'.repeat(32),
      },
      {
        ...claim,
        observedLifecycleOrder: 'seq:0000000000000009',
      },
    ]) {
      expect(picoHomeDeviceRecoveryClaimDigestHex(sodium, changed))
        .not.toBe(original);
    }
  });

  it('rejects malformed role, timing, exact-shape and receipt claims', () => {
    const suite = fixtureSuite();
    const evidence =
      suite.evidence as unknown as PicoHomeDeviceRecoveryEvidence;
    const card = (suite.card as JsonRecord)
      .fields as unknown as PicoRecoveryCardPayload;
    const receipt = (suite.receipt as JsonRecord)
      .fields as unknown as PicoHomeDeviceRecoveryReceiptSignatureInput;

    expect(() => picoHomeDeviceRecoveryEvidenceDigestHex(sodium, {
      ...evidence,
      targetDeviceSigningKeyRecord: {
        ...evidence.targetDeviceSigningKeyRecord,
        publicKeyHex: '01',
      },
    })).toThrow('invalid_public_key_length');
    expect(() => buildPicoRecoveryCardPayload({
      ...card,
      schema: 'pico.recovery.card.v2' as never,
    })).toThrow('invalid_recovery_card_schema');
    expect(() => buildPicoRecoveryCardPayload({
      ...card,
      pinProtected: false,
    })).toThrow('recovery_card_pin_protection_required');
    expect(() => buildPicoHomeDeviceRecoveryReceiptSignatureInput({
      ...receipt,
      completedAt: receipt.pendingAcceptedAt,
    })).toThrow('invalid_recovery_timing');
    expect(() => buildPicoHomeDeviceRecoveryReceiptSignatureInput({
      ...receipt,
      leavesExactlyOneActiveDevice: false,
    })).toThrow('recovery_must_leave_exactly_one_device');
    expect(() => buildPicoHomeDeviceRecoveryClaimSignatureInput({
      ...(suite.claim as JsonRecord).fields as unknown as
        PicoHomeDeviceRecoveryClaimSignatureInput,
      extra: 'not_signed',
    } as never)).toThrow('unexpected_field');
  });
});

function fixtureSuite(): JsonRecord {
  return JSON.parse(readFileSync(resolve(
    process.cwd(),
    '../../docs/protocol/fixtures/home-device-recovery/suite.json',
  ), 'utf8')) as JsonRecord;
}
