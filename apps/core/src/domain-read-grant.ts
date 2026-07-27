import {
  buildPicoHomeDomainReadGrantLifecycleSignatureInput,
  buildPicoHomeDomainReadGrantSignatureInput,
  picoHomeDomainReadGrantLifecycleRecordSchema,
  picoHomeDomainReadGrantRecordSchema,
  picoIdentitySuite,
  type PicoHomeDomainReadGrantLifecycleRecord,
  type PicoHomeDomainReadGrantRecord,
  type PicoHomeFoundingRecord,
  type PicoIdentityKeyRecordSignatureInput,
} from '@pico/protocol';
import {
  verifyPicoIdentityDetachedSignature,
  verifyPicoIdentityKeyRecordFingerprint,
  type IdentityVerificationSodium,
} from '@pico/identity';

export type PicoHomeDomainReadGrantVerificationFailure =
  | 'invalid_grant_schema'
  | 'invalid_lifecycle_schema'
  | 'foreign_suite'
  | 'foreign_home'
  | 'foreign_host_key'
  | 'issuer_is_not_home_host_pico'
  | 'invalid_issuer_key_role'
  | 'issuer_key_fingerprint_mismatch'
  | 'invalid_issuer_signature'
  | 'unknown_grant'
  | 'grant_binding_mismatch'
  | 'malformed_domain_read_grant';

export type PicoHomeDomainReadGrantVerification =
  | { ok: true }
  | { ok: false; reason: PicoHomeDomainReadGrantVerificationFailure };

export function verifyPicoHomeDomainReadGrant(
  sodium: IdentityVerificationSodium,
  input: {
    record: PicoHomeDomainReadGrantRecord;
    foundingRecord: PicoHomeFoundingRecord;
  },
): PicoHomeDomainReadGrantVerification {
  const { record, foundingRecord } = input;
  const grant = record.grant;
  const founding = foundingRecord.founding;

  if (record.schema !== picoHomeDomainReadGrantRecordSchema) {
    return { ok: false, reason: 'invalid_grant_schema' };
  }
  if (grant.suite !== picoIdentitySuite) {
    return { ok: false, reason: 'foreign_suite' };
  }
  if (grant.homeId !== founding.homeId) {
    return { ok: false, reason: 'foreign_home' };
  }
  if (grant.hostSigningKeyFingerprintHex !== founding.hostSigningKeyFingerprintHex) {
    return { ok: false, reason: 'foreign_host_key' };
  }
  if (grant.controllerPicoIdentityFingerprintHex !== founding.homeHostPicoIdentityFingerprintHex) {
    return { ok: false, reason: 'issuer_is_not_home_host_pico' };
  }

  const issuer = verifyIssuerKey(
    sodium,
    record.issuerIdentityKeyRecord,
    grant.controllerPicoIdentityFingerprintHex,
  );
  if (!issuer.ok) {
    return issuer;
  }

  try {
    if (!verifyPicoIdentityDetachedSignature(sodium, {
      publicKeyHex: record.issuerIdentityKeyRecord.publicKeyHex,
      signatureInput: buildPicoHomeDomainReadGrantSignatureInput(grant),
      signatureHex: record.issuerSignatureHex,
    })) {
      return { ok: false, reason: 'invalid_issuer_signature' };
    }
  } catch {
    return { ok: false, reason: 'malformed_domain_read_grant' };
  }

  return { ok: true };
}

export function verifyPicoHomeDomainReadGrantLifecycle(
  sodium: IdentityVerificationSodium,
  input: {
    record: PicoHomeDomainReadGrantLifecycleRecord;
    grantRecord: PicoHomeDomainReadGrantRecord;
    foundingRecord: PicoHomeFoundingRecord;
  },
): PicoHomeDomainReadGrantVerification {
  const { record, grantRecord, foundingRecord } = input;
  const lifecycle = record.lifecycle;
  const grant = grantRecord.grant;

  if (record.schema !== picoHomeDomainReadGrantLifecycleRecordSchema) {
    return { ok: false, reason: 'invalid_lifecycle_schema' };
  }
  if (lifecycle.suite !== picoIdentitySuite) {
    return { ok: false, reason: 'foreign_suite' };
  }
  if (lifecycle.grantId !== grant.grantId) {
    return { ok: false, reason: 'unknown_grant' };
  }
  if (lifecycle.homeId !== grant.homeId
    || lifecycle.hostSigningKeyFingerprintHex !== grant.hostSigningKeyFingerprintHex
    || lifecycle.privacyDomain !== grant.privacyDomain
    || lifecycle.controllerPicoIdentityFingerprintHex !== grant.controllerPicoIdentityFingerprintHex
    || lifecycle.readerPicoIdentityFingerprintHex !== grant.readerPicoIdentityFingerprintHex) {
    return { ok: false, reason: 'grant_binding_mismatch' };
  }
  if (lifecycle.lifecycleOrder <= grant.lifecycleOrder) {
    return { ok: false, reason: 'grant_binding_mismatch' };
  }

  const authority = verifyPicoHomeDomainReadGrant(sodium, {
    record: grantRecord,
    foundingRecord,
  });
  if (!authority.ok) {
    return authority;
  }

  const issuer = verifyIssuerKey(
    sodium,
    record.issuerIdentityKeyRecord,
    lifecycle.controllerPicoIdentityFingerprintHex,
  );
  if (!issuer.ok) {
    return issuer;
  }

  try {
    if (!verifyPicoIdentityDetachedSignature(sodium, {
      publicKeyHex: record.issuerIdentityKeyRecord.publicKeyHex,
      signatureInput: buildPicoHomeDomainReadGrantLifecycleSignatureInput(lifecycle),
      signatureHex: record.issuerSignatureHex,
    })) {
      return { ok: false, reason: 'invalid_issuer_signature' };
    }
  } catch {
    return { ok: false, reason: 'malformed_domain_read_grant' };
  }

  return { ok: true };
}

function verifyIssuerKey(
  sodium: IdentityVerificationSodium,
  keyRecord: PicoIdentityKeyRecordSignatureInput,
  expectedFingerprintHex: string,
): PicoHomeDomainReadGrantVerification {
  if (keyRecord.suite !== picoIdentitySuite || keyRecord.keyRole !== 'pico_identity') {
    return { ok: false, reason: 'invalid_issuer_key_role' };
  }

  try {
    if (!verifyPicoIdentityKeyRecordFingerprint(sodium, {
      keyRecord,
      expectedFingerprintHex,
    })) {
      return { ok: false, reason: 'issuer_key_fingerprint_mismatch' };
    }
  } catch {
    return { ok: false, reason: 'malformed_domain_read_grant' };
  }

  return { ok: true };
}
