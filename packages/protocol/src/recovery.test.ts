import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sodium from 'libsodium-wrappers-sumo';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildPicoHomeDeviceRecoveryClaimSignatureInput,
  buildPicoHomeDeviceRecoveryPrepareSignatureInput,
  buildPicoHomeDeviceRecoveryReceiptSignatureInput,
  buildPicoRecoveryCardPayload,
  buildPicoRecoveryCardScanTransport,
  parsePicoRecoveryCardPayload,
  parsePicoRecoveryCardScanTransport,
  picoHomeDeviceRecoveryCanonicalLabels,
  picoHomeDeviceRecoveryClaimDigestHex,
  picoHomeDeviceRecoveryEvidenceDigestHex,
  picoHomeDeviceRecoveryRecordSchema,
  picoHomeDeviceRecoverySubmissionSchema,
  picoHomeDeviceRecoveryTiming,
  picoProtocolVersion,
  picoRecoveryCardSchema,
  picoRecoveryCardScanPrefix,
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
    expect(picoHomeDeviceRecoveryTiming).toEqual({
      signedRequestLifetimeMs: 5 * 60 * 1_000,
      vetoDelayMs: 48 * 60 * 60 * 1_000,
      completionWindowMs: 7 * 24 * 60 * 60 * 1_000,
    });
  });

  it('refuses a card whose text is not valid UTF-8', () => {
    /**
     * The refusal exists; nothing tested that it was reachable. It matters
     * more since 2026-08-19, when the strictness behind it changed: the
     * decoder used to be `TextDecoder` with `fatal: true`, which throws
     * `ERR_NO_ICU` on the runtime Android uses, so the whole card path was
     * unreadable there. What replaced it re-encodes and compares bytes.
     *
     * What this pins is *which* refusal answers. Take the strictness away
     * and the card is still refused - the canonical re-encode below catches
     * the replacement character - but it says `noncanonical_recovery_card_
     * payload`, which sends the reader looking for the wrong fault. The
     * grant path has no such second riegel; see device-enrolment.test.ts.
     */
    const vector = fixtureCard();
    const canonical = buildPicoRecoveryCardPayload(vector.fields);
    const name = new TextEncoder().encode(vector.fields.picoName);
    const at = Buffer.from(canonical).indexOf(Buffer.from(name));
    expect(at).toBeGreaterThan(0);

    const broken = Uint8Array.from(canonical);
    // A lone continuation byte: valid length, impossible sequence, which is
    // what a cut or re-encoded card looks like.
    broken[at] = 0x80;

    expect(() => parsePicoRecoveryCardPayload(broken))
      .toThrow('invalid_recovery_card_utf8');
  });

  it('round-trips the one card form and pins its bytes', () => {
    const vector = fixtureCard();
    const fields = vector.fields;
    const canonical = buildPicoRecoveryCardPayload(fields);
    expect(parsePicoRecoveryCardPayload(canonical)).toEqual(fields);
    expect(Buffer.from(canonical).toString('hex'))
      .toBe(vector.canonicalPayloadHex);

    expect(() => parsePicoRecoveryCardPayload(
      canonical.subarray(0, canonical.byteLength - 1),
    )).toThrow('invalid_recovery_card_canonical_length');
    expect(() => parsePicoRecoveryCardPayload(new Uint8Array(4_097)))
      .toThrow('invalid_recovery_card_payload_length');
  });

  it('pins the scan transport and refuses every alternate spelling', () => {
    const vector = fixtureCard();
    const canonical = buildPicoRecoveryCardPayload(vector.fields);
    const transport = buildPicoRecoveryCardScanTransport(canonical);

    expect(transport).toBe(vector.scanTransport);
    expect(transport.startsWith(picoRecoveryCardScanPrefix)).toBe(true);
    const scan = parsePicoRecoveryCardScanTransport(transport);
    expect(scan.payload).toEqual(vector.fields);
    expect(Buffer.from(scan.canonicalPayload).toString('hex'))
      .toBe(vector.canonicalPayloadHex);

    const body = transport.slice(picoRecoveryCardScanPrefix.length);
    // Padding, the standard alphabet and surrounding whitespace are all
    // spellings a tolerant decoder would accept for these same bytes.
    expect(() => parsePicoRecoveryCardScanTransport(`${transport}=`))
      .toThrow('invalid_recovery_card_scan_charset');
    for (const outside of ['+', '/', '=', ' ', 'ä']) {
      expect(() => parsePicoRecoveryCardScanTransport(
        picoRecoveryCardScanPrefix + body.slice(0, -1) + outside,
      )).toThrow('invalid_recovery_card_scan_charset');
    }
    expect(() => parsePicoRecoveryCardScanTransport(`${transport}\n`))
      .toThrow('invalid_recovery_card_scan_charset');
    expect(() => parsePicoRecoveryCardScanTransport(` ${transport}`))
      .toThrow('invalid_recovery_card_scan_prefix');
    // Case is part of the prefix: an upper-cased spelling is a different
    // string carrying the same bytes, which is the class this parser refuses.
    expect(() => parsePicoRecoveryCardScanTransport(
      `PICO-RECOVERY-CARD-V1:${body}`,
    )).toThrow('invalid_recovery_card_scan_prefix');
    expect(() => parsePicoRecoveryCardScanTransport(
      picoRecoveryCardScanPrefix,
    )).toThrow('invalid_recovery_card_scan_length');
    expect(() => parsePicoRecoveryCardScanTransport(`${transport}A`))
      .toThrow('invalid_recovery_card_scan_length');

    // A body of length 4n+3 carries two bits that encode nothing. Flipping
    // them yields a different string that a tolerant decoder maps to the very
    // same bytes - the second spelling this parser has to refuse.
    const short = Buffer.from(body.slice(0, -1), 'base64url')
      .toString('base64url');
    expect(short.length % 4).toBe(3);
    const alternate = `${short.slice(0, -1)}${flipUnusedBits(short.slice(-1))}`;
    expect(alternate).not.toBe(short);
    expect(Buffer.from(alternate, 'base64url'))
      .toEqual(Buffer.from(short, 'base64url'));
    expect(() => parsePicoRecoveryCardScanTransport(
      picoRecoveryCardScanPrefix + alternate,
    )).toThrow('noncanonical_recovery_card_scan');

    expect(() => buildPicoRecoveryCardScanTransport(new Uint8Array(4_097)))
      .toThrow('invalid_recovery_card_payload_length');
    expect(() => buildPicoRecoveryCardScanTransport(new Uint8Array(0)))
      .toThrow('invalid_recovery_card_payload_length');
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
      schema: 'pico.recovery.card.v3' as never,
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

const base64UrlAlphabet =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function flipUnusedBits(character: string): string {
  return base64UrlAlphabet[base64UrlAlphabet.indexOf(character) ^ 1];
}

function fixtureCard(): {
  fields: PicoRecoveryCardPayload;
  canonicalPayloadHex: string;
  scanTransport: string;
} {
  return (fixtureSuite() as unknown as {
    card: {
      fields: PicoRecoveryCardPayload;
      canonicalPayloadHex: string;
      scanTransport: string;
    };
  }).card;
}
