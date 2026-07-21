import {
  buildPicoHomeMembershipLifecycleSignatureInput,
  buildPicoHomeMembershipSignatureInput,
  picoHomeMembershipCredentialSchema,
  picoHomeMembershipLifecycleRecordSchema,
  picoIdentitySuite,
} from '@pico/protocol';
import type {
  PicoHomeFoundingRecord,
  PicoHomeMembershipCredential,
  PicoHomeMembershipIssuerStatement,
  PicoHomeMembershipLifecycleRecord,
  PicoIdentityKeyRecordSignatureInput,
} from '@pico/protocol';
import {
  verifyPicoIdentityDetachedSignature,
  verifyPicoIdentityKeyRecordFingerprint,
  type IdentityVerificationSodium,
} from '@pico/identity';

/**
 * Home Membership Credential and lifecycle verification (ADR 0080 H6, the first
 * slice of Gate M3).
 *
 * The asymmetry the ADR states in prose is the shape of the code here: the Home
 * Host Pico's issuer signature is the authority, and the host's countersignature
 * is operational acknowledgment that creates none. So the issuer is verified
 * first and a failure there ends it — checking the host half of an issuer-less
 * credential would be verifying a signature over garbage, and an implementation
 * that did it in the other order could be talked into treating "the host says
 * so" as membership.
 *
 * Everything is anchored to the founding record: a credential that does not name
 * this Home and this host key verifies as nothing, which is what "chains that do
 * not reach a well-formed founding record" means in enforceable terms.
 */

export type PicoHomeMembershipVerificationFailure =
  | 'invalid_credential_schema'
  | 'invalid_lifecycle_schema'
  | 'foreign_suite'
  | 'foreign_home'
  | 'foreign_host_key'
  | 'issuer_is_not_home_host_pico'
  | 'issuer_delegation_unsupported'
  | 'invalid_issuer_key_role'
  | 'issuer_key_fingerprint_mismatch'
  | 'invalid_issuer_signature'
  | 'invalid_host_activation_signature'
  | 'home_host_membership_is_not_reissued'
  | 'unknown_credential'
  | 'subject_mismatch'
  | 'malformed_membership_record';

export type PicoHomeMembershipVerification =
  | { ok: true }
  | { ok: false; reason: PicoHomeMembershipVerificationFailure };

export interface PicoHomeMembershipAuthorityInput {
  /**
   * Only the issuer half is needed, and taking only that is the point: the
   * authority check must be answerable before this Home has signed anything.
   */
  credential: PicoHomeMembershipIssuerStatement;
  foundingRecord: PicoHomeFoundingRecord;
}

export interface PicoHomeMembershipActivationInput {
  credential: PicoHomeMembershipCredential;
  hostSigningPublicKeyHex: string;
}

export interface PicoHomeMembershipLifecycleVerificationInput {
  record: PicoHomeMembershipLifecycleRecord;
  credential: PicoHomeMembershipCredential;
  foundingRecord: PicoHomeFoundingRecord;
}

/**
 * The authority half (ADR 0080 H6): the issuer signature and the bindings that
 * anchor the credential to this Home's founding record. This is what has to
 * re-verify for as long as the credential exists, including after a restore, so
 * it is checked both at intake and at every boot.
 */
export function verifyPicoHomeMembershipAuthority(
  sodium: IdentityVerificationSodium,
  input: PicoHomeMembershipAuthorityInput,
): PicoHomeMembershipVerification {
  const { credential, foundingRecord } = input;
  const membership = credential.membership;
  const founding = foundingRecord.founding;

  if (credential.schema !== picoHomeMembershipCredentialSchema) {
    return { ok: false, reason: 'invalid_credential_schema' };
  }

  if (membership.suite !== picoIdentitySuite) {
    return { ok: false, reason: 'foreign_suite' };
  }

  if (membership.homeId !== founding.homeId) {
    return { ok: false, reason: 'foreign_home' };
  }

  if (membership.hostSigningKeyFingerprintHex !== founding.hostSigningKeyFingerprintHex) {
    return { ok: false, reason: 'foreign_host_key' };
  }

  // The founding record is the Home Host Pico's own membership root and is not
  // re-issued as a credential by its own subject (ADR 0080). A credential that
  // claims the host role, or names the Home Host Pico as its subject, would be
  // a second and weaker source of truth for the same row.
  if (membership.role !== 'home_member') {
    return { ok: false, reason: 'home_host_membership_is_not_reissued' };
  }

  if (membership.subjectPicoIdentityFingerprintHex === founding.homeHostPicoIdentityFingerprintHex) {
    return { ok: false, reason: 'home_host_membership_is_not_reissued' };
  }

  const issuerCheck = verifyIssuerIdentity(sodium, credential.issuerIdentityKeyRecord, membership.issuerPicoIdentityFingerprintHex, founding.homeHostPicoIdentityFingerprintHex);
  if (!issuerCheck.ok) {
    return issuerCheck;
  }

  try {
    if (!verifyPicoIdentityDetachedSignature(sodium, {
      publicKeyHex: credential.issuerIdentityKeyRecord.publicKeyHex,
      signatureInput: buildPicoHomeMembershipSignatureInput(membership),
      signatureHex: credential.issuerSignatureHex,
    })) {
      return { ok: false, reason: 'invalid_issuer_signature' };
    }

  } catch {
    return { ok: false, reason: 'malformed_membership_record' };
  }

  return { ok: true };
}

/**
 * The acknowledgment half: this Home's host key confirming the credential is
 * active here. Deliberately separate from the authority, and deliberately not
 * re-checked at boot — a host key may legitimately have rotated under a
 * continuity statement, and a membership must survive that. It creates no
 * authority, so its absence at boot costs nothing; verifying it *instead of*
 * the issuer would be the failure ADR 0080 H6 warns about.
 */
export function verifyPicoHomeMembershipActivation(
  sodium: IdentityVerificationSodium,
  input: PicoHomeMembershipActivationInput,
): PicoHomeMembershipVerification {
  try {
    if (!verifyPicoIdentityDetachedSignature(sodium, {
      publicKeyHex: input.hostSigningPublicKeyHex,
      signatureInput: buildPicoHomeMembershipSignatureInput(input.credential.membership),
      signatureHex: input.credential.hostActivationSignatureHex,
    })) {
      return { ok: false, reason: 'invalid_host_activation_signature' };
    }
  } catch {
    return { ok: false, reason: 'malformed_membership_record' };
  }

  return { ok: true };
}

export function verifyPicoHomeMembershipLifecycleRecord(
  sodium: IdentityVerificationSodium,
  input: PicoHomeMembershipLifecycleVerificationInput,
): PicoHomeMembershipVerification {
  const { record, credential, foundingRecord } = input;
  const lifecycle = record.lifecycle;
  const founding = foundingRecord.founding;

  if (record.schema !== picoHomeMembershipLifecycleRecordSchema) {
    return { ok: false, reason: 'invalid_lifecycle_schema' };
  }

  if (lifecycle.suite !== picoIdentitySuite) {
    return { ok: false, reason: 'foreign_suite' };
  }

  if (lifecycle.homeId !== founding.homeId) {
    return { ok: false, reason: 'foreign_home' };
  }

  if (lifecycle.credentialId !== credential.membership.credentialId) {
    return { ok: false, reason: 'unknown_credential' };
  }

  // A statement that moves one member's status must name that member: without
  // this a lifecycle record could carry a foreign subject and evict the wrong
  // resident while still verifying against the issuer.
  if (lifecycle.subjectPicoIdentityFingerprintHex !== credential.membership.subjectPicoIdentityFingerprintHex) {
    return { ok: false, reason: 'subject_mismatch' };
  }

  const issuerCheck = verifyIssuerIdentity(sodium, record.issuerIdentityKeyRecord, lifecycle.issuerPicoIdentityFingerprintHex, founding.homeHostPicoIdentityFingerprintHex);
  if (!issuerCheck.ok) {
    return issuerCheck;
  }

  try {
    // Issuer-signed only. The host enforces the freshest statement; it does not
    // co-sign one, so there is no host half to check here.
    if (!verifyPicoIdentityDetachedSignature(sodium, {
      publicKeyHex: record.issuerIdentityKeyRecord.publicKeyHex,
      signatureInput: buildPicoHomeMembershipLifecycleSignatureInput(lifecycle),
      signatureHex: record.issuerSignatureHex,
    })) {
      return { ok: false, reason: 'invalid_issuer_signature' };
    }
  } catch {
    return { ok: false, reason: 'malformed_membership_record' };
  }

  return { ok: true };
}

function verifyIssuerIdentity(
  sodium: IdentityVerificationSodium,
  issuerIdentityKeyRecord: PicoIdentityKeyRecordSignatureInput,
  issuerFingerprintHex: string,
  homeHostPicoIdentityFingerprintHex: string,
): PicoHomeMembershipVerification {
  // ADR 0080 allows a device key delegated with `home_membership` scope to
  // issue. That path needs a verified delegation chain from @pico/identity,
  // which no runtime supplies yet, so it is refused by name rather than
  // silently accepted as if the delegation had been checked.
  if (issuerFingerprintHex !== homeHostPicoIdentityFingerprintHex) {
    return { ok: false, reason: issuerIsPlausibleDelegate(issuerFingerprintHex) ? 'issuer_delegation_unsupported' : 'issuer_is_not_home_host_pico' };
  }

  if (issuerIdentityKeyRecord.suite !== picoIdentitySuite || issuerIdentityKeyRecord.keyRole !== 'pico_identity') {
    return { ok: false, reason: 'invalid_issuer_key_role' };
  }

  try {
    if (!verifyPicoIdentityKeyRecordFingerprint(sodium, {
      keyRecord: issuerIdentityKeyRecord,
      expectedFingerprintHex: issuerFingerprintHex,
    })) {
      return { ok: false, reason: 'issuer_key_fingerprint_mismatch' };
    }
  } catch {
    return { ok: false, reason: 'malformed_membership_record' };
  }

  return { ok: true };
}

function issuerIsPlausibleDelegate(issuerFingerprintHex: string): boolean {
  return /^[0-9a-f]{64}$/.test(issuerFingerprintHex);
}
