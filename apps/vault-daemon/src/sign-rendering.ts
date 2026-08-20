import { picoDisplayFingerprint } from '@pico/protocol/fingerprint-display';
import {
  buildPicoHomeContinuitySignatureInput,
  buildPicoHomeDeviceActivationSignatureInput,
  buildPicoHomeDeviceRecoveryClaimSignatureInput,
  buildPicoHomeDeviceRecoveryPrepareSignatureInput,
  buildPicoHomeClaimSignatureInput,
  buildPicoHomeFoundingSignatureInput,
  buildPicoHomeMembershipLifecycleSignatureInput,
  buildPicoHomeMembershipSignatureInput,
  buildPicoIdentityDelegationSignatureInput,
  buildPicoIdentityKeyRecordSignatureInput,
  buildPicoIdentityPossessionSignatureInput,
  buildPicoIdentityReaderKeyFreshnessSignatureInput,
  buildPicoIdentityRevocationSignatureInput,
  buildPicoLinkDirectRequestSignatureInput,
  buildPicoReaderCustodyDomainSignatureInput,
  buildPicoReaderCustodyItemSignatureInput,
  buildPicoReaderCustodyKekRotationSignatureInput,
  buildPicoReaderCustodyReaderGrantLifecycleSignatureInput,
  buildPicoReaderCustodyReaderGrantSignatureInput,
  buildPicoReaderCustodySyncManifestSignatureInput,
  buildPicoReaderCustodyWriterGrantLifecycleSignatureInput,
  buildPicoReaderCustodyWriterGrantSignatureInput,
  buildPicoShareEnvelopeSignatureInput,
  picoHomeDeviceLifecycleCanonicalLabels,
  picoHomeDeviceRecoveryCanonicalLabels,
  picoHomeSignatureInputLabels,
  picoHomeV2SignatureInputLabels,
  picoIdentityReaderKeyFreshnessSignatureInputLabel,
  picoIdentitySignatureInputLabels,
  picoLinkDirectRequestSignatureInputLabel,
  picoReaderCustodyCanonicalLabels,
  picoShareCanonicalLabels,
  type PicoHomeClaimSignatureInput,
  type PicoHomeContinuitySignatureInput,
  type PicoHomeDeviceActivationSignatureInput,
  type PicoHomeDeviceRecoveryClaimSignatureInput,
  type PicoHomeDeviceRecoveryPrepareSignatureInput,
  type PicoHomeFoundingSignatureInput,
  type PicoHomeMembershipLifecycleSignatureInput,
  type PicoHomeMembershipSignatureInput,
  type PicoIdentityDelegationSignatureInput,
  type PicoIdentityKeyRecordSignatureInput,
  type PicoIdentityRevocationSignatureInput,
  type PicoReaderCustodyDomainSignatureInput,
  type PicoReaderCustodyKekRotationSignatureInput,
  type PicoReaderCustodyReaderGrantLifecycleSignatureInput,
  type PicoReaderCustodyReaderGrantSignatureInput,
  type PicoReaderCustodyWriterGrantLifecycleSignatureInput,
  type PicoReaderCustodyWriterGrantSignatureInput,
  type PicoShareEnvelopeSignatureInput,
} from '@pico/protocol';

/**
 * ADR 0106: the one place where a signing request's fields become canonical
 * bytes and a human statement.
 *
 * Both come from the same `fields`, which is the entire point. The daemon
 * signs only bytes it built here, and shows only sentences rendered here, so
 * there is no path on which a person approves one thing while the key signs
 * another. The builders are the same `build…SignatureInput` functions every
 * verifier uses, and they throw on anything malformed - so field validation
 * is inherited, not reimplemented.
 *
 * A label with a builder but no renderer is signable only if it is
 * approval-exempt. For a gated label the statement is mandatory: a record
 * nobody can render is a record nobody could have meaningfully approved.
 */
export function buildPicoVaultSignatureInputFromFields(
  label: string,
  fields: object,
): Uint8Array | undefined {
  const builder = buildersByLabel[label];
  return builder === undefined ? undefined : builder(fields);
}

export function renderPicoVaultApprovalStatement(
  label: string,
  fields: object,
): string | undefined {
  const renderer = renderersByLabel[label];
  return renderer === undefined ? undefined : renderer(fields);
}

const buildersByLabel: Record<string, (fields: object) => Uint8Array> = {
  [picoHomeDeviceRecoveryCanonicalLabels.prepare]: (f) =>
    buildPicoHomeDeviceRecoveryPrepareSignatureInput(
      f as PicoHomeDeviceRecoveryPrepareSignatureInput,
    ),
  [picoHomeDeviceRecoveryCanonicalLabels.claim]: (f) =>
    buildPicoHomeDeviceRecoveryClaimSignatureInput(
      f as PicoHomeDeviceRecoveryClaimSignatureInput,
    ),
  [picoHomeDeviceLifecycleCanonicalLabels.activation]: (f) =>
    buildPicoHomeDeviceActivationSignatureInput(
      f as PicoHomeDeviceActivationSignatureInput,
    ),
  [picoIdentitySignatureInputLabels.keyrecord]: (f) =>
    buildPicoIdentityKeyRecordSignatureInput(f as never),
  [picoIdentitySignatureInputLabels.possession]: (f) =>
    buildPicoIdentityPossessionSignatureInput(f as never),
  [picoIdentitySignatureInputLabels.delegation]: (f) =>
    buildPicoIdentityDelegationSignatureInput(f as never),
  [picoIdentitySignatureInputLabels.revocation]: (f) =>
    buildPicoIdentityRevocationSignatureInput(f as never),
  [picoIdentityReaderKeyFreshnessSignatureInputLabel]: (f) =>
    buildPicoIdentityReaderKeyFreshnessSignatureInput(f as never),
  [picoLinkDirectRequestSignatureInputLabel]: (f) =>
    buildPicoLinkDirectRequestSignatureInput(f as never),
  [picoHomeSignatureInputLabels.claim]: (f) =>
    buildPicoHomeClaimSignatureInput(f as never),
  [picoHomeV2SignatureInputLabels.claim]: (f) =>
    buildPicoHomeClaimSignatureInput(f as never),
  [picoHomeSignatureInputLabels.founding]: (f) =>
    buildPicoHomeFoundingSignatureInput(f as never),
  [picoHomeV2SignatureInputLabels.founding]: (f) =>
    buildPicoHomeFoundingSignatureInput(f as never),
  [picoHomeSignatureInputLabels.membership]: (f) =>
    buildPicoHomeMembershipSignatureInput(f as never),
  [picoHomeSignatureInputLabels.continuity]: (f) =>
    buildPicoHomeContinuitySignatureInput(f as never),
  [picoHomeSignatureInputLabels.membershipLifecycle]: (f) =>
    buildPicoHomeMembershipLifecycleSignatureInput(f as never),
  [picoShareCanonicalLabels.envelope]: (f) =>
    buildPicoShareEnvelopeSignatureInput(f as never),
  [picoReaderCustodyCanonicalLabels.domain]: (f) =>
    buildPicoReaderCustodyDomainSignatureInput(f as never),
  [picoReaderCustodyCanonicalLabels.readerGrant]: (f) =>
    buildPicoReaderCustodyReaderGrantSignatureInput(f as never),
  [picoReaderCustodyCanonicalLabels.readerGrantLifecycle]: (f) =>
    buildPicoReaderCustodyReaderGrantLifecycleSignatureInput(f as never),
  [picoReaderCustodyCanonicalLabels.writerGrant]: (f) =>
    buildPicoReaderCustodyWriterGrantSignatureInput(f as never),
  [picoReaderCustodyCanonicalLabels.writerGrantLifecycle]: (f) =>
    buildPicoReaderCustodyWriterGrantLifecycleSignatureInput(f as never),
  [picoReaderCustodyCanonicalLabels.kekRotation]: (f) =>
    buildPicoReaderCustodyKekRotationSignatureInput(f as never),
  [picoReaderCustodyCanonicalLabels.syncManifest]: (f) =>
    buildPicoReaderCustodySyncManifestSignatureInput(f as never),
  [picoReaderCustodyCanonicalLabels.item]: (f) =>
    buildPicoReaderCustodyItemSignatureInput(f as never),
};

/**
 * One sentence per gated label, rendered only after the builder accepted the
 * fields. Exempt labels (possession, freshness, sync manifest, item) have no
 * renderer on purpose: they raise no approval, so nobody is shown anything.
 *
 * Fingerprints are shortened for the eye by `picoDisplayFingerprint`, the
 * product's one answer to ADR 0079 I5, and not by a rule of this file's own.
 * Until 2026-08-20 it was: a twelve-character prefix, while the companion
 * window that confirms these same ceremonies showed head-and-tail. The two met
 * inside a single approval body - the sentence from here, the signing key
 * appended by the shell - so one identity was named twice, in two alphabets,
 * in the one string a person reads before consenting.
 *
 * The approval stays bound to the BLAKE2b digest of the exact bytes, so the
 * display never carries the integrity burden alone. That is what makes
 * shortening safe at all; it is not what makes two spellings safe.
 */
const renderersByLabel: Record<string, (fields: object) => string> = {
  [picoHomeDeviceRecoveryCanonicalLabels.prepare]: (f) => {
    const v = f as PicoHomeDeviceRecoveryPrepareSignatureInput;
    return `Prepare recovery of identity ${picoDisplayFingerprint(v.picoIdentityFingerprintHex)} in Home ${v.homeId} for target ${picoDisplayFingerprint(v.targetDeviceSigningKeyFingerprintHex)} by reading the current device-replacement head. This does not start the 48-hour veto delay.`;
  },
  [picoHomeDeviceRecoveryCanonicalLabels.claim]: (f) => {
    const v = f as PicoHomeDeviceRecoveryClaimSignatureInput;
    return `Recover identity ${picoDisplayFingerprint(v.picoIdentityFingerprintHex)} into Home ${v.homeId} by replacing the complete device set with target ${picoDisplayFingerprint(v.targetDeviceSigningKeyFingerprintHex)}. The 48-hour veto delay starts only after the Home accepts this claim.`;
  },
  [picoIdentitySignatureInputLabels.keyrecord]: (f) => {
    const v = f as PicoIdentityKeyRecordSignatureInput;
    return `Certify a ${v.keyRole} key record (${picoDisplayFingerprint(v.publicKeyHex)}).`;
  },
  [picoIdentitySignatureInputLabels.delegation]: (f) => {
    const v = f as PicoIdentityDelegationSignatureInput;
    return `Create device authority: delegate ${v.scopes.join(', ')} to device keys ${picoDisplayFingerprint(v.subjectSigningKeyFingerprintHex)} and ${picoDisplayFingerprint(v.subjectKeyAgreementKeyFingerprintHex)} from ${v.validFrom} until ${v.validUntil}.`;
  },
  [picoIdentitySignatureInputLabels.revocation]: (f) => {
    const v = f as PicoIdentityRevocationSignatureInput;
    return `Revoke ${v.subjectKind} ${v.subjectRef} (${v.reasonCategory}). Warning: this may close the last remote device path.`;
  },
  [picoHomeSignatureInputLabels.claim]: (f) => {
    const v = f as PicoHomeClaimSignatureInput;
    return `Claim the Pico Home whose host key is ${picoDisplayFingerprint(v.hostSigningKeyFingerprintHex)} for identity ${picoDisplayFingerprint(v.claimantIdentityKeyFingerprintHex)}.`;
  },
  [picoHomeV2SignatureInputLabels.claim]: (f) => {
    const v = f as PicoHomeClaimSignatureInput;
    return `Claim the Pico Home whose host key is ${picoDisplayFingerprint(v.hostSigningKeyFingerprintHex)} for identity ${picoDisplayFingerprint(v.claimantIdentityKeyFingerprintHex)} with first device ${picoDisplayFingerprint(v.firstDeviceSigningKeyFingerprintHex)}.`;
  },
  [picoHomeSignatureInputLabels.founding]: (f) => {
    const v = f as PicoHomeFoundingSignatureInput;
    return `Found Pico Home ${v.homeId} and take Home Host authority for it.`;
  },
  [picoHomeV2SignatureInputLabels.founding]: (f) => {
    const v = f as PicoHomeFoundingSignatureInput;
    return `Found Pico Home ${v.homeId} and bind first device ${picoDisplayFingerprint(v.firstDeviceSigningKeyFingerprintHex)} as Home Host authority.`;
  },
  [picoHomeSignatureInputLabels.continuity]: (f) => {
    const v = f as PicoHomeContinuitySignatureInput;
    // The whole consequence, not just the swap: acceptance retires every
    // trust pin the old key carries, including the printed Recovery Cards.
    return `Rotate the host keys of Home ${v.homeId} (${v.reasonCategory}): `
      + `retire ${picoDisplayFingerprint(v.outgoingHostSigningKeyFingerprintHex)} and accept `
      + `${picoDisplayFingerprint(v.incomingHostSigningKeyFingerprintHex)} as the only host key. `
      + 'Every printed Recovery Card becomes stale and must be re-issued.';
  },
  [picoHomeSignatureInputLabels.membership]: (f) => {
    const v = f as PicoHomeMembershipSignatureInput;
    return `Admit ${picoDisplayFingerprint(v.subjectPicoIdentityFingerprintHex)} to Home ${v.homeId} as ${v.role} (${v.scopes.join(', ')}) until ${v.validUntil}.`;
  },
  [picoHomeSignatureInputLabels.membershipLifecycle]: (f) => {
    const v = f as PicoHomeMembershipLifecycleSignatureInput;
    return `Set the membership of ${picoDisplayFingerprint(v.subjectPicoIdentityFingerprintHex)} in Home ${v.homeId} to ${v.status} (${v.reasonCategory}).`;
  },
  [picoShareCanonicalLabels.envelope]: (f) => {
    const v = f as PicoShareEnvelopeSignatureInput;
    return `Issue the domain key of ${v.domainId} (KEK v${v.kekVersion}) to reader key ${picoDisplayFingerprint(v.readerKeyFingerprintHex)}.`;
  },
  [picoReaderCustodyCanonicalLabels.domain]: (f) => {
    const v = f as PicoReaderCustodyDomainSignatureInput;
    return `Create encrypted domain ${v.domainId} in Home ${v.homeId} with your reader key ${picoDisplayFingerprint(v.ownerReaderKeyFingerprintHex)}.`;
  },
  [picoReaderCustodyCanonicalLabels.readerGrant]: (f) => {
    const v = f as PicoReaderCustodyReaderGrantSignatureInput;
    return `Grant reader ${picoDisplayFingerprint(v.readerIdentityKeyFingerprintHex)} access to domain ${v.domainId} from KEK v${v.firstKekVersion} (${v.accessMode}) until ${v.validUntil}.`;
  },
  [picoReaderCustodyCanonicalLabels.readerGrantLifecycle]: (f) => {
    const v = f as PicoReaderCustodyReaderGrantLifecycleSignatureInput;
    return `Set the reader grant of ${picoDisplayFingerprint(v.readerIdentityKeyFingerprintHex)} on domain ${v.domainId} to ${v.status} (${v.reasonCategory}).`;
  },
  [picoReaderCustodyCanonicalLabels.writerGrant]: (f) => {
    const v = f as PicoReaderCustodyWriterGrantSignatureInput;
    return `Authorize writer ${picoDisplayFingerprint(v.writerIdentityKeyFingerprintHex)} to write domain ${v.domainId} at KEK v${v.kekVersion} until ${v.validUntil}.`;
  },
  [picoReaderCustodyCanonicalLabels.writerGrantLifecycle]: (f) => {
    const v = f as PicoReaderCustodyWriterGrantLifecycleSignatureInput;
    return `Set the writer grant of ${picoDisplayFingerprint(v.writerIdentityKeyFingerprintHex)} on domain ${v.domainId} to ${v.status} (${v.reasonCategory}).`;
  },
  [picoReaderCustodyCanonicalLabels.kekRotation]: (f) => {
    const v = f as PicoReaderCustodyKekRotationSignatureInput;
    return `Rotate domain ${v.domainId} from KEK v${v.previousKekVersion} to v${v.kekVersion}; ${v.remainingReaderGrantIds.length} reader(s) keep access.`;
  },
};
