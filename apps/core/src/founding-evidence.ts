import {
  buildPicoHomeClaimResponseSignatureInput,
  buildPicoHomeFoundingSignatureInput,
  picoHomeFoundingRecordSchema,
  picoIdentitySuite,
  type PicoHomeFoundingRecord,
} from '@pico/protocol';
import {
  createVerifiedPicoIdentityLifecycleIndex,
  verifyPicoIdentityDetachedSignature,
  verifyPicoIdentityKeyRecordFingerprint,
  type IdentityVerificationSodium,
} from '@pico/identity';

/**
 * ADR 0115. Ob eine Gruendungsevidenz haelt, was sie behauptet.
 *
 * **Warum das hier steht und nicht mehr in `app.ts`** (Befund B155,
 * 2026-09-13). Die Funktion ist rein - ein Datensatz, ein Hostschluessel, ein
 * Urteil -, war aber modulprivat und nur ueber die Anspruchsflaeche
 * erreichbar. Elf ihrer Ablehnungen hatte deshalb nie jemand ausgeloest
 * (Befund B151), und das sind die Ablehnungen der Tuer, durch die ein Home
 * ueberhaupt entsteht.
 *
 * Ihre zwei Geschwister stehen laengst so: `verifyPicoHomeMembershipAuthority`
 * in `home-membership.ts` und `verifyPicoHomeDomainReadGrant` in
 * `domain-read-grant.ts` - exportierte reine Pruefer mit eigenen Tests. Der
 * Umzug ist damit kein neuer Zuschnitt, sondern derselbe, den die Nachbarn
 * schon haben. `sodium` kommt als Parameter herein, wie dort auch, statt aus
 * dem Modulkopf des Servers.
 */
export type PicoHomeFoundingEvidenceFailure =
  | 'invalid_founding_record_schema'
  | 'invalid_claimant_key_role'
  | 'claimant_key_fingerprint_mismatch'
  | 'first_device_signing_key_mismatch'
  | 'first_device_agreement_key_mismatch'
  | 'first_device_delegation_mismatch'
  | 'inactive_first_device_delegation'
  | 'invalid_claimant_founding_signature'
  | 'invalid_host_claim_response_signature'
  | 'invalid_host_founding_signature'
  | 'malformed_founding_evidence';

export type PicoHomeFoundingEvidenceVerification =
  | { ok: true }
  | { ok: false; reason: PicoHomeFoundingEvidenceFailure };

export function verifyPicoHomeFoundingEvidence(
  sodium: IdentityVerificationSodium,
  record: PicoHomeFoundingRecord,
  // ADR 0115: the founding was signed by the founding-era host key. Before a
  // rotation that is custody's key; afterwards the retired public key comes
  // from the first continuity link, or the founding could never re-verify.
  hostSigningPublicKeyHex: string,
): PicoHomeFoundingEvidenceVerification {
  const claimantKey = record.claimantIdentityKeyRecord;

  try {
    if (record.schema !== picoHomeFoundingRecordSchema) {
      return { ok: false, reason: 'invalid_founding_record_schema' };
    }
    if (claimantKey.suite !== picoIdentitySuite || claimantKey.keyRole !== 'pico_identity') {
      return { ok: false, reason: 'invalid_claimant_key_role' };
    }

    if (!verifyPicoIdentityKeyRecordFingerprint(sodium, {
      keyRecord: claimantKey,
      expectedFingerprintHex: record.founding.homeHostPicoIdentityFingerprintHex,
    })) {
      return { ok: false, reason: 'claimant_key_fingerprint_mismatch' };
    }

    const founding = record.founding;
    if (record.firstDeviceSigningKeyRecord.suite !== picoIdentitySuite
      || record.firstDeviceSigningKeyRecord.keyRole !== 'device_signing'
      || !verifyPicoIdentityKeyRecordFingerprint(sodium, {
        keyRecord: record.firstDeviceSigningKeyRecord,
        expectedFingerprintHex: founding.firstDeviceSigningKeyFingerprintHex,
      })) {
      return { ok: false, reason: 'first_device_signing_key_mismatch' };
    }
    if (record.firstDeviceKeyAgreementKeyRecord.suite !== picoIdentitySuite
      || record.firstDeviceKeyAgreementKeyRecord.keyRole !== 'device_key_agreement'
      || !verifyPicoIdentityKeyRecordFingerprint(sodium, {
        keyRecord: record.firstDeviceKeyAgreementKeyRecord,
        expectedFingerprintHex: founding.firstDeviceKeyAgreementKeyFingerprintHex,
      })) {
      return { ok: false, reason: 'first_device_agreement_key_mismatch' };
    }
    const delegation = record.firstDeviceDelegation.record;
    if (delegation.delegationId !== founding.firstDeviceDelegationId
      || delegation.issuerIdentityKeyFingerprintHex
        !== founding.homeHostPicoIdentityFingerprintHex
      || delegation.subjectSigningKeyFingerprintHex
        !== founding.firstDeviceSigningKeyFingerprintHex
      || delegation.subjectKeyAgreementKeyFingerprintHex
        !== founding.firstDeviceKeyAgreementKeyFingerprintHex) {
      return { ok: false, reason: 'first_device_delegation_mismatch' };
    }
    const lifecycle = createVerifiedPicoIdentityLifecycleIndex(sodium, {
      issuerIdentityKeyRecord: claimantKey,
      signedDelegations: [record.firstDeviceDelegation],
      signedRevocations: record.firstDeviceRevocations,
    });
    if (lifecycle.lookupDelegation(founding.firstDeviceDelegationId, {
      at: founding.foundedAt,
      requiredScopes: ['surface_session'],
    }).status !== 'active') {
      return { ok: false, reason: 'inactive_first_device_delegation' };
    }

    if (!verifyPicoIdentityDetachedSignature(sodium, {
      publicKeyHex: claimantKey.publicKeyHex,
      signatureInput: buildPicoHomeFoundingSignatureInput(record.founding),
      signatureHex: record.claimantFoundingSignatureHex,
    })) {
      return { ok: false, reason: 'invalid_claimant_founding_signature' };
    }

    if (!verifyPicoIdentityDetachedSignature(sodium, {
      publicKeyHex: hostSigningPublicKeyHex,
      signatureInput: buildPicoHomeClaimResponseSignatureInput(record.hostClaimResponse.claimResponse),
      signatureHex: record.hostClaimResponse.hostSignatureHex,
    })) {
      return { ok: false, reason: 'invalid_host_claim_response_signature' };
    }

    if (!verifyPicoIdentityDetachedSignature(sodium, {
      publicKeyHex: hostSigningPublicKeyHex,
      signatureInput: buildPicoHomeFoundingSignatureInput(record.founding),
      signatureHex: record.hostFoundingSignatureHex,
    })) {
      return { ok: false, reason: 'invalid_host_founding_signature' };
    }
  } catch {
    return { ok: false, reason: 'malformed_founding_evidence' };
  }

  return { ok: true };
}
