import {
  buildPicoHomeDeviceActivationSignatureInput,
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
  picoHomeSignatureInputLabels,
  picoHomeV2SignatureInputLabels,
  picoIdentityReaderKeyFreshnessSignatureInputLabel,
  picoIdentitySignatureInputLabels,
  picoLinkDirectRequestSignatureInputLabel,
  picoReaderCustodyCanonicalLabels,
  picoShareCanonicalLabels,
  type PicoHomeClaimSignatureInput,
  type PicoHomeDeviceActivationSignatureInput,
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
 * Fingerprints are shortened for the eye; the approval stays bound to the
 * BLAKE2b digest of the exact bytes, so the display never carries the
 * integrity burden alone.
 */
const renderersByLabel: Record<string, (fields: object) => string> = {
  [picoIdentitySignatureInputLabels.keyrecord]: (f) => {
    const v = f as PicoIdentityKeyRecordSignatureInput;
    return `Certify a ${v.keyRole} key record (${short(v.publicKeyHex)}).`;
  },
  [picoIdentitySignatureInputLabels.delegation]: (f) => {
    const v = f as PicoIdentityDelegationSignatureInput;
    return `Create device authority: delegate ${v.scopes.join(', ')} to device keys ${short(v.subjectSigningKeyFingerprintHex)} and ${short(v.subjectKeyAgreementKeyFingerprintHex)} from ${v.validFrom} until ${v.validUntil}.`;
  },
  [picoIdentitySignatureInputLabels.revocation]: (f) => {
    const v = f as PicoIdentityRevocationSignatureInput;
    return `Revoke ${v.subjectKind} ${v.subjectRef} (${v.reasonCategory}). Warning: this may close the last remote device path.`;
  },
  [picoHomeSignatureInputLabels.claim]: (f) => {
    const v = f as PicoHomeClaimSignatureInput;
    return `Claim the Pico Home whose host key is ${short(v.hostSigningKeyFingerprintHex)} for identity ${short(v.claimantIdentityKeyFingerprintHex)}.`;
  },
  [picoHomeV2SignatureInputLabels.claim]: (f) => {
    const v = f as PicoHomeClaimSignatureInput;
    return `Claim the Pico Home whose host key is ${short(v.hostSigningKeyFingerprintHex)} for identity ${short(v.claimantIdentityKeyFingerprintHex)} with first device ${short(v.firstDeviceSigningKeyFingerprintHex)}.`;
  },
  [picoHomeSignatureInputLabels.founding]: (f) => {
    const v = f as PicoHomeFoundingSignatureInput;
    return `Found Pico Home ${v.homeId} and take Home Host authority for it.`;
  },
  [picoHomeV2SignatureInputLabels.founding]: (f) => {
    const v = f as PicoHomeFoundingSignatureInput;
    return `Found Pico Home ${v.homeId} and bind first device ${short(v.firstDeviceSigningKeyFingerprintHex)} as Home Host authority.`;
  },
  [picoHomeSignatureInputLabels.membership]: (f) => {
    const v = f as PicoHomeMembershipSignatureInput;
    return `Admit ${short(v.subjectPicoIdentityFingerprintHex)} to Home ${v.homeId} as ${v.role} (${v.scopes.join(', ')}) until ${v.validUntil}.`;
  },
  [picoHomeSignatureInputLabels.membershipLifecycle]: (f) => {
    const v = f as PicoHomeMembershipLifecycleSignatureInput;
    return `Set the membership of ${short(v.subjectPicoIdentityFingerprintHex)} in Home ${v.homeId} to ${v.status} (${v.reasonCategory}).`;
  },
  [picoShareCanonicalLabels.envelope]: (f) => {
    const v = f as PicoShareEnvelopeSignatureInput;
    return `Issue the domain key of ${v.domainId} (KEK v${v.kekVersion}) to reader key ${short(v.readerKeyFingerprintHex)}.`;
  },
  [picoReaderCustodyCanonicalLabels.domain]: (f) => {
    const v = f as PicoReaderCustodyDomainSignatureInput;
    return `Create encrypted domain ${v.domainId} in Home ${v.homeId} with your reader key ${short(v.ownerReaderKeyFingerprintHex)}.`;
  },
  [picoReaderCustodyCanonicalLabels.readerGrant]: (f) => {
    const v = f as PicoReaderCustodyReaderGrantSignatureInput;
    return `Grant reader ${short(v.readerIdentityKeyFingerprintHex)} access to domain ${v.domainId} from KEK v${v.firstKekVersion} (${v.accessMode}) until ${v.validUntil}.`;
  },
  [picoReaderCustodyCanonicalLabels.readerGrantLifecycle]: (f) => {
    const v = f as PicoReaderCustodyReaderGrantLifecycleSignatureInput;
    return `Set the reader grant of ${short(v.readerIdentityKeyFingerprintHex)} on domain ${v.domainId} to ${v.status} (${v.reasonCategory}).`;
  },
  [picoReaderCustodyCanonicalLabels.writerGrant]: (f) => {
    const v = f as PicoReaderCustodyWriterGrantSignatureInput;
    return `Authorize writer ${short(v.writerIdentityKeyFingerprintHex)} to write domain ${v.domainId} at KEK v${v.kekVersion} until ${v.validUntil}.`;
  },
  [picoReaderCustodyCanonicalLabels.writerGrantLifecycle]: (f) => {
    const v = f as PicoReaderCustodyWriterGrantLifecycleSignatureInput;
    return `Set the writer grant of ${short(v.writerIdentityKeyFingerprintHex)} on domain ${v.domainId} to ${v.status} (${v.reasonCategory}).`;
  },
  [picoReaderCustodyCanonicalLabels.kekRotation]: (f) => {
    const v = f as PicoReaderCustodyKekRotationSignatureInput;
    return `Rotate domain ${v.domainId} from KEK v${v.previousKekVersion} to v${v.kekVersion}; ${v.remainingReaderGrantIds.length} reader(s) keep access.`;
  },
};

function short(fingerprintHex: string): string {
  return fingerprintHex.length <= 12 ? fingerprintHex : `${fingerprintHex.slice(0, 12)}…`;
}
