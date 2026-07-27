import {
  buildPicoIdentityDelegationSignatureInput,
  buildPicoIdentityKeyRecordSignatureInput,
  buildPicoIdentityPossessionSignatureInput,
  buildPicoIdentityReaderKeyFreshnessSignatureInput,
  buildPicoIdentityRevocationSignatureInput,
  picoIdentityDelegationScopes,
  picoIdentitySuite,
} from '@pico/protocol';
import type {
  PicoIdentityDelegationScope,
  PicoIdentityDelegationSignatureInput,
  PicoIdentityKeyRecordSignatureInput,
  PicoIdentityPossessionSignatureInput,
  PicoIdentityReaderKeyFreshnessSignatureInput,
  PicoIdentityRevocationSignatureInput,
} from '@pico/protocol';

export const picoIdentityLifecycleStatementKinds = [
  'delegation',
  'revocation',
] as const;

export type PicoIdentityLifecycleStatementKind = typeof picoIdentityLifecycleStatementKinds[number];

export type PicoIdentityDelegationLifecycleState =
  | 'active'
  | 'expired'
  | 'missing_scope'
  | 'not_yet_valid'
  | 'revoked'
  | 'unknown';

export type PicoIdentityRevocationMatch =
  | 'delegation'
  | 'issuer_identity_key'
  | 'subject_signing_key'
  | 'subject_key_agreement_key';

export interface PicoIdentityLifecycleIndexInput {
  acceptedDelegations?: readonly PicoIdentityDelegationSignatureInput[];
  acceptedRevocations?: readonly PicoIdentityRevocationSignatureInput[];
}

export interface PicoIdentitySignedDelegation {
  record: PicoIdentityDelegationSignatureInput;
  signatureHex: string;
}

export interface PicoIdentitySignedRevocation {
  record: PicoIdentityRevocationSignatureInput;
  signatureHex: string;
}

export interface PicoIdentityKeyRecordFingerprintInput {
  keyRecord: PicoIdentityKeyRecordSignatureInput;
  expectedFingerprintHex: string;
}

export interface PicoIdentityDetachedSignatureVerificationInput {
  publicKeyHex: string;
  signatureInput: Uint8Array;
  signatureHex: string;
}

export interface PicoIdentityPossessionVerificationInput {
  subjectKeyRecord: PicoIdentityKeyRecordSignatureInput;
  possession: PicoIdentityPossessionSignatureInput;
  signatureHex: string;
}

export interface PicoIdentityDelegationVerificationInput {
  issuerIdentityKeyRecord: PicoIdentityKeyRecordSignatureInput;
  delegation: PicoIdentityDelegationSignatureInput;
  signatureHex: string;
}

export interface PicoIdentityRevocationVerificationInput {
  issuerIdentityKeyRecord: PicoIdentityKeyRecordSignatureInput;
  revocation: PicoIdentityRevocationSignatureInput;
  signatureHex: string;
}

export interface PicoIdentityReaderKeyFreshnessVerificationInput {
  issuerIdentityKeyRecord: PicoIdentityKeyRecordSignatureInput;
  checkpoint: PicoIdentityReaderKeyFreshnessSignatureInput;
  signatureHex: string;
}

export interface PicoIdentityVerifiedLifecycleIndexInput {
  issuerIdentityKeyRecord: PicoIdentityKeyRecordSignatureInput;
  signedDelegations?: readonly PicoIdentitySignedDelegation[];
  signedRevocations?: readonly PicoIdentitySignedRevocation[];
}

export interface IdentityVerificationSodium {
  crypto_sign_BYTES: number;
  crypto_sign_PUBLICKEYBYTES: number;
  crypto_generichash(hashLength: number, message: Uint8Array | string, key: Uint8Array | string | null): Uint8Array;
  crypto_sign_verify_detached(signature: Uint8Array, message: Uint8Array | string, publicKey: Uint8Array): boolean;
}

export interface PicoIdentityDelegationLookupOptions {
  /**
   * The instant the authority question is asked at, in the protocol's canonical
   * UTC form. Required: an optional evaluation time made "caller forgot" and
   * "delegation is inside its window" indistinguishable, and the index answered
   * `active` for expired delegations (ADR 0079 I8/I9). The index derives no time
   * of its own, so the caller states it.
   */
  at: string;
  requiredScopes?: readonly PicoIdentityDelegationScope[];
}

export interface PicoIdentityRevocationReference {
  match: PicoIdentityRevocationMatch;
  revocation: PicoIdentityRevocationSignatureInput;
}

export interface PicoIdentityDelegationLookupResult {
  status: PicoIdentityDelegationLifecycleState;
  delegation?: PicoIdentityDelegationSignatureInput;
  freshestLifecycleOrder: string | null;
  revokedBy?: PicoIdentityRevocationReference;
  missingScopes?: PicoIdentityDelegationScope[];
}

export interface PicoIdentityLifecycleSnapshot {
  delegations: PicoIdentityDelegationSignatureInput[];
  revocations: PicoIdentityRevocationSignatureInput[];
  freshestLifecycleOrder: string | null;
}

type LifecycleStatement = {
  kind: PicoIdentityLifecycleStatementKind;
  order: bigint;
  id: string;
  stableJson: string;
};

const lifecycleOrderPattern = /^seq:([0-9]{16})$/;

export class PicoIdentityLifecycleIndex {
  readonly #delegationsById: Map<string, PicoIdentityDelegationSignatureInput>;

  readonly #revocationsById: Map<string, PicoIdentityRevocationSignatureInput>;

  readonly #freshestLifecycleOrder: string | null;

  public constructor(input: PicoIdentityLifecycleIndexInput = {}) {
    const delegationsById = new Map<string, PicoIdentityDelegationSignatureInput>();
    const revocationsById = new Map<string, PicoIdentityRevocationSignatureInput>();
    const statements: LifecycleStatement[] = [];

    for (const delegation of input.acceptedDelegations ?? []) {
      const canonical = cloneDelegation(delegation);
      buildPicoIdentityDelegationSignatureInput(canonical);
      addUniqueStatement(delegationsById, canonical.delegationId, canonical, 'conflicting_delegation_statement');
      statements.push({
        kind: 'delegation',
        order: parsePicoIdentityLifecycleOrder(canonical.lifecycleOrder),
        id: canonical.delegationId,
        stableJson: stableJson(canonical),
      });
    }

    for (const revocation of input.acceptedRevocations ?? []) {
      const canonical = cloneRevocation(revocation);
      buildPicoIdentityRevocationSignatureInput(canonical);
      addUniqueStatement(revocationsById, canonical.revocationId, canonical, 'conflicting_revocation_statement');
      statements.push({
        kind: 'revocation',
        order: parsePicoIdentityLifecycleOrder(canonical.lifecycleOrder),
        id: canonical.revocationId,
        stableJson: stableJson(canonical),
      });
    }

    this.#delegationsById = delegationsById;
    this.#revocationsById = revocationsById;
    this.#freshestLifecycleOrder = freshestLifecycleOrder(statements);
  }

  public freshestLifecycleOrder(): string | null {
    return this.#freshestLifecycleOrder;
  }

  public delegationIds(): string[] {
    return [...this.#delegationsById.keys()].sort();
  }

  public revocationIds(): string[] {
    return [...this.#revocationsById.keys()].sort();
  }

  public lookupDelegation(
    delegationId: string,
    options: PicoIdentityDelegationLookupOptions,
  ): PicoIdentityDelegationLookupResult {
    assertAsciiToken(delegationId, 'invalid_delegation_id');
    assertInstant(options.at, 'invalid_lookup_time');
    const delegation = this.#delegationsById.get(delegationId);
    if (delegation === undefined) {
      return {
        status: 'unknown',
        freshestLifecycleOrder: this.#freshestLifecycleOrder,
      };
    }

    const revokedBy = this.#freshestRevocationForDelegation(delegation);
    if (revokedBy !== undefined) {
      return {
        status: 'revoked',
        delegation: cloneDelegation(delegation),
        freshestLifecycleOrder: this.#freshestLifecycleOrder,
        revokedBy,
      };
    }

    if (options.at < delegation.validFrom) {
      return {
        status: 'not_yet_valid',
        delegation: cloneDelegation(delegation),
        freshestLifecycleOrder: this.#freshestLifecycleOrder,
      };
    }
    if (options.at >= delegation.validUntil) {
      return {
        status: 'expired',
        delegation: cloneDelegation(delegation),
        freshestLifecycleOrder: this.#freshestLifecycleOrder,
      };
    }

    const missingScopes = missingRequiredScopes(delegation.scopes, options.requiredScopes ?? []);
    if (missingScopes.length > 0) {
      return {
        status: 'missing_scope',
        delegation: cloneDelegation(delegation),
        freshestLifecycleOrder: this.#freshestLifecycleOrder,
        missingScopes,
      };
    }

    return {
      status: 'active',
      delegation: cloneDelegation(delegation),
      freshestLifecycleOrder: this.#freshestLifecycleOrder,
    };
  }

  public delegationsForSubjectKey(subjectKeyFingerprintHex: string): PicoIdentityDelegationSignatureInput[] {
    assertFingerprint(subjectKeyFingerprintHex);
    return [...this.#delegationsById.values()]
      .filter((delegation) => (
        delegation.subjectSigningKeyFingerprintHex === subjectKeyFingerprintHex
        || delegation.subjectKeyAgreementKeyFingerprintHex === subjectKeyFingerprintHex
      ))
      .sort(compareDelegationRecords)
      .map(cloneDelegation);
  }

  public snapshot(): PicoIdentityLifecycleSnapshot {
    return {
      delegations: [...this.#delegationsById.values()].sort(compareDelegationRecords).map(cloneDelegation),
      revocations: [...this.#revocationsById.values()].sort(compareRevocationRecords).map(cloneRevocation),
      freshestLifecycleOrder: this.#freshestLifecycleOrder,
    };
  }

  public reconcile(input: PicoIdentityLifecycleIndexInput): PicoIdentityLifecycleIndex {
    const current = this.snapshot();
    return createPicoIdentityLifecycleIndex({
      acceptedDelegations: [
        ...current.delegations,
        ...(input.acceptedDelegations ?? []),
      ],
      acceptedRevocations: [
        ...current.revocations,
        ...(input.acceptedRevocations ?? []),
      ],
    });
  }

  #freshestRevocationForDelegation(
    delegation: PicoIdentityDelegationSignatureInput,
  ): PicoIdentityRevocationReference | undefined {
    const matches: PicoIdentityRevocationReference[] = [];

    for (const revocation of this.#revocationsById.values()) {
      // Only the identity that issued a delegation can revoke it. Without this
      // the index is safe just as long as it holds one issuer's statements, and
      // the exported merge paths take whatever they are handed: a Home holding
      // several members' lifecycle records would let any member's revocation
      // reference a foreign delegationId or subject key and kill it.
      if (revocation.issuerIdentityKeyFingerprintHex !== delegation.issuerIdentityKeyFingerprintHex) {
        continue;
      }

      if (revocation.subjectKind === 'delegation' && revocation.subjectRef === delegation.delegationId) {
        matches.push({ match: 'delegation', revocation: cloneRevocation(revocation) });
        continue;
      }

      if (revocation.subjectKind !== 'key') {
        continue;
      }

      // Revoking the identity key itself ends everything it delegated,
      // regardless of ordering. Enumerating delegations is no substitute:
      // whoever holds a stolen root can mint new ones, and the owner cannot
      // revoke what they never learned exists. Signed history stays verifiable
      // (ADR 0033) - only future authority ends here.
      if (revocation.subjectRef === delegation.issuerIdentityKeyFingerprintHex) {
        matches.push({ match: 'issuer_identity_key', revocation: cloneRevocation(revocation) });
      }

      if (revocation.subjectRef === delegation.subjectSigningKeyFingerprintHex) {
        matches.push({ match: 'subject_signing_key', revocation: cloneRevocation(revocation) });
      }
      if (revocation.subjectRef === delegation.subjectKeyAgreementKeyFingerprintHex) {
        matches.push({ match: 'subject_key_agreement_key', revocation: cloneRevocation(revocation) });
      }
    }

    return matches.sort(compareRevocationReferences).at(-1);
  }
}

export function createPicoIdentityLifecycleIndex(
  input: PicoIdentityLifecycleIndexInput = {},
): PicoIdentityLifecycleIndex {
  return new PicoIdentityLifecycleIndex(input);
}

export function createVerifiedPicoIdentityLifecycleIndex(
  sodium: IdentityVerificationSodium,
  input: PicoIdentityVerifiedLifecycleIndexInput,
): PicoIdentityLifecycleIndex {
  assertIdentityIssuerKeyRecord(input.issuerIdentityKeyRecord);
  const acceptedDelegations: PicoIdentityDelegationSignatureInput[] = [];
  const acceptedRevocations: PicoIdentityRevocationSignatureInput[] = [];

  for (const signedDelegation of input.signedDelegations ?? []) {
    if (!verifyPicoIdentityDelegationSignature(sodium, {
      issuerIdentityKeyRecord: input.issuerIdentityKeyRecord,
      delegation: signedDelegation.record,
      signatureHex: signedDelegation.signatureHex,
    })) {
      throw new Error('invalid_delegation_signature');
    }
    acceptedDelegations.push(cloneDelegation(signedDelegation.record));
  }

  for (const signedRevocation of input.signedRevocations ?? []) {
    if (!verifyPicoIdentityRevocationSignature(sodium, {
      issuerIdentityKeyRecord: input.issuerIdentityKeyRecord,
      revocation: signedRevocation.record,
      signatureHex: signedRevocation.signatureHex,
    })) {
      throw new Error('invalid_revocation_signature');
    }
    acceptedRevocations.push(cloneRevocation(signedRevocation.record));
  }

  return createPicoIdentityLifecycleIndex({
    acceptedDelegations,
    acceptedRevocations,
  });
}

export function reconcilePicoIdentityLifecycleInputs(
  inputs: readonly PicoIdentityLifecycleIndexInput[],
): PicoIdentityLifecycleIndex {
  return createPicoIdentityLifecycleIndex({
    acceptedDelegations: inputs.flatMap((input) => [...(input.acceptedDelegations ?? [])]),
    acceptedRevocations: inputs.flatMap((input) => [...(input.acceptedRevocations ?? [])]),
  });
}

export function computePicoIdentityKeyRecordFingerprintHex(
  sodium: IdentityVerificationSodium,
  keyRecord: PicoIdentityKeyRecordSignatureInput,
): string {
  const signatureInput = buildPicoIdentityKeyRecordSignatureInput(cloneKeyRecord(keyRecord));
  return bytesToHex(sodium.crypto_generichash(32, signatureInput, null));
}

export function verifyPicoIdentityKeyRecordFingerprint(
  sodium: IdentityVerificationSodium,
  input: PicoIdentityKeyRecordFingerprintInput,
): boolean {
  assertFingerprint(input.expectedFingerprintHex);
  return timingSafeAsciiEqual(
    computePicoIdentityKeyRecordFingerprintHex(sodium, input.keyRecord),
    input.expectedFingerprintHex,
  );
}

export function verifyPicoIdentityDetachedSignature(
  sodium: IdentityVerificationSodium,
  input: PicoIdentityDetachedSignatureVerificationInput,
): boolean {
  const signature = fixedHexBytes(input.signatureHex, sodium.crypto_sign_BYTES, 'invalid_signature_length');
  const publicKey = fixedHexBytes(input.publicKeyHex, sodium.crypto_sign_PUBLICKEYBYTES, 'invalid_public_key_length');
  return sodium.crypto_sign_verify_detached(signature, input.signatureInput, publicKey);
}

export function verifyPicoIdentityPossessionSignature(
  sodium: IdentityVerificationSodium,
  input: PicoIdentityPossessionVerificationInput,
): boolean {
  assertSigningCapableKeyRecord(input.subjectKeyRecord, 'key_role_cannot_verify_possession');
  const possession = clonePossession(input.possession);
  const signatureInput = buildPicoIdentityPossessionSignatureInput(possession);
  if (!verifyPicoIdentityKeyRecordFingerprint(sodium, {
    keyRecord: input.subjectKeyRecord,
    expectedFingerprintHex: possession.subjectKeyFingerprintHex,
  })) {
    return false;
  }

  return verifyPicoIdentityDetachedSignature(sodium, {
    publicKeyHex: input.subjectKeyRecord.publicKeyHex,
    signatureInput,
    signatureHex: input.signatureHex,
  });
}

export function verifyPicoIdentityDelegationSignature(
  sodium: IdentityVerificationSodium,
  input: PicoIdentityDelegationVerificationInput,
): boolean {
  assertIdentityIssuerKeyRecord(input.issuerIdentityKeyRecord);
  const delegation = cloneDelegation(input.delegation);
  const signatureInput = buildPicoIdentityDelegationSignatureInput(delegation);
  if (!verifyPicoIdentityKeyRecordFingerprint(sodium, {
    keyRecord: input.issuerIdentityKeyRecord,
    expectedFingerprintHex: delegation.issuerIdentityKeyFingerprintHex,
  })) {
    return false;
  }

  return verifyPicoIdentityDetachedSignature(sodium, {
    publicKeyHex: input.issuerIdentityKeyRecord.publicKeyHex,
    signatureInput,
    signatureHex: input.signatureHex,
  });
}

export function verifyPicoIdentityRevocationSignature(
  sodium: IdentityVerificationSodium,
  input: PicoIdentityRevocationVerificationInput,
): boolean {
  assertIdentityIssuerKeyRecord(input.issuerIdentityKeyRecord);
  const revocation = cloneRevocation(input.revocation);
  const signatureInput = buildPicoIdentityRevocationSignatureInput(revocation);
  if (!verifyPicoIdentityKeyRecordFingerprint(sodium, {
    keyRecord: input.issuerIdentityKeyRecord,
    expectedFingerprintHex: revocation.issuerIdentityKeyFingerprintHex,
  })) {
    return false;
  }

  return verifyPicoIdentityDetachedSignature(sodium, {
    publicKeyHex: input.issuerIdentityKeyRecord.publicKeyHex,
    signatureInput,
    signatureHex: input.signatureHex,
  });
}

export function verifyPicoIdentityReaderKeyFreshnessSignature(
  sodium: IdentityVerificationSodium,
  input: PicoIdentityReaderKeyFreshnessVerificationInput,
): boolean {
  assertIdentityIssuerKeyRecord(input.issuerIdentityKeyRecord);
  const signatureInput = buildPicoIdentityReaderKeyFreshnessSignatureInput({
    ...input.checkpoint,
  });
  if (!verifyPicoIdentityKeyRecordFingerprint(sodium, {
    keyRecord: input.issuerIdentityKeyRecord,
    expectedFingerprintHex: input.checkpoint.issuerIdentityKeyFingerprintHex,
  })) {
    return false;
  }

  return verifyPicoIdentityDetachedSignature(sodium, {
    publicKeyHex: input.issuerIdentityKeyRecord.publicKeyHex,
    signatureInput,
    signatureHex: input.signatureHex,
  });
}

export function parsePicoIdentityLifecycleOrder(value: string): bigint {
  const match = lifecycleOrderPattern.exec(value);
  if (match === null) {
    throw new Error('invalid_lifecycle_order');
  }

  return BigInt(match[1]);
}

export function comparePicoIdentityLifecycleOrder(left: string, right: string): number {
  const leftOrder = parsePicoIdentityLifecycleOrder(left);
  const rightOrder = parsePicoIdentityLifecycleOrder(right);

  if (leftOrder < rightOrder) {
    return -1;
  }
  if (leftOrder > rightOrder) {
    return 1;
  }
  return 0;
}

function freshestLifecycleOrder(statements: readonly LifecycleStatement[]): string | null {
  const freshest = [...statements].sort((left, right) => {
    const byOrder = compareBigInt(left.order, right.order);
    if (byOrder !== 0) {
      return byOrder;
    }

    const byKind = left.kind.localeCompare(right.kind);
    if (byKind !== 0) {
      return byKind;
    }

    return left.id.localeCompare(right.id) || left.stableJson.localeCompare(right.stableJson);
  }).at(-1);

  if (freshest === undefined) {
    return null;
  }

  return `seq:${freshest.order.toString().padStart(16, '0')}`;
}

function addUniqueStatement<TStatement>(
  map: Map<string, TStatement>,
  id: string,
  statement: TStatement,
  conflictReason: string,
): void {
  const previous = map.get(id);
  if (previous === undefined) {
    map.set(id, statement);
    return;
  }

  if (stableJson(previous) !== stableJson(statement)) {
    throw new Error(conflictReason);
  }
}

function missingRequiredScopes(
  actualScopes: readonly PicoIdentityDelegationScope[],
  requiredScopes: readonly PicoIdentityDelegationScope[],
): PicoIdentityDelegationScope[] {
  const required = new Set<PicoIdentityDelegationScope>();
  for (const scope of requiredScopes) {
    if (!picoIdentityDelegationScopes.includes(scope)) {
      throw new Error('invalid_required_scope');
    }
    required.add(scope);
  }

  const actual = new Set(actualScopes);
  return [...required].filter((scope) => !actual.has(scope)).sort();
}

function compareDelegationRecords(
  left: PicoIdentityDelegationSignatureInput,
  right: PicoIdentityDelegationSignatureInput,
): number {
  return comparePicoIdentityLifecycleOrder(left.lifecycleOrder, right.lifecycleOrder)
    || left.delegationId.localeCompare(right.delegationId);
}

function compareRevocationRecords(
  left: PicoIdentityRevocationSignatureInput,
  right: PicoIdentityRevocationSignatureInput,
): number {
  return comparePicoIdentityLifecycleOrder(left.lifecycleOrder, right.lifecycleOrder)
    || left.revocationId.localeCompare(right.revocationId);
}

function compareRevocationReferences(
  left: PicoIdentityRevocationReference,
  right: PicoIdentityRevocationReference,
): number {
  return compareRevocationRecords(left.revocation, right.revocation)
    || left.match.localeCompare(right.match);
}

function compareBigInt(left: bigint, right: bigint): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function cloneDelegation(
  delegation: PicoIdentityDelegationSignatureInput,
): PicoIdentityDelegationSignatureInput {
  return {
    suite: delegation.suite,
    delegationId: delegation.delegationId,
    issuerIdentityKeyFingerprintHex: delegation.issuerIdentityKeyFingerprintHex,
    subjectSigningKeyFingerprintHex: delegation.subjectSigningKeyFingerprintHex,
    subjectKeyAgreementKeyFingerprintHex: delegation.subjectKeyAgreementKeyFingerprintHex,
    // Sorted, because the signature input sorts the scope set: two replicas of
    // one signed statement that list the same scopes in different order are the
    // same statement, and unsorted clones made them collide as
    // `conflicting_delegation_statement` on exactly the restore-plus-registry
    // merge ADR 0079 I9 asks reconciliation to survive.
    scopes: [...delegation.scopes].sort(),
    validFrom: delegation.validFrom,
    validUntil: delegation.validUntil,
    lifecycleOrder: delegation.lifecycleOrder,
  };
}

function cloneKeyRecord(
  keyRecord: PicoIdentityKeyRecordSignatureInput,
): PicoIdentityKeyRecordSignatureInput {
  return {
    suite: keyRecord.suite,
    keyRole: keyRecord.keyRole,
    publicKeyHex: keyRecord.publicKeyHex,
  };
}

function clonePossession(
  possession: PicoIdentityPossessionSignatureInput,
): PicoIdentityPossessionSignatureInput {
  return {
    suite: possession.suite,
    subjectKeyFingerprintHex: possession.subjectKeyFingerprintHex,
    verifierNonceHex: possession.verifierNonceHex,
    verifierContext: possession.verifierContext,
  };
}

function cloneRevocation(
  revocation: PicoIdentityRevocationSignatureInput,
): PicoIdentityRevocationSignatureInput {
  return {
    suite: revocation.suite,
    revocationId: revocation.revocationId,
    issuerIdentityKeyFingerprintHex: revocation.issuerIdentityKeyFingerprintHex,
    subjectKind: revocation.subjectKind,
    subjectRef: revocation.subjectRef,
    reasonCategory: revocation.reasonCategory,
    revokedAt: revocation.revokedAt,
    lifecycleOrder: revocation.lifecycleOrder,
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }

  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }

  return JSON.stringify(value);
}

function assertAsciiToken(value: string, reason: string): void {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024 || !/^[A-Za-z0-9._:/+-]+$/.test(value)) {
    throw new Error(reason);
  }
}

function assertFingerprint(value: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new Error('invalid_fingerprint_length');
  }
}

/**
 * Validity windows are decided by comparing these strings, so the lookup time
 * has to be in the same fixed-width UTC form the signature-input builders pin
 * for `validFrom`/`validUntil`. A `+02:00` form sorts before `Z` at the same
 * instant and would report an expired delegation as active.
 */
function assertInstant(value: string, reason: string): void {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error(reason);
  }

  // Re-serializing rejects impossible dates the shape check admits: `new Date`
  // rolls `2026-02-30` forward to March 2 instead of failing.
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(reason);
  }
}

function assertIdentityIssuerKeyRecord(keyRecord: PicoIdentityKeyRecordSignatureInput): void {
  buildPicoIdentityKeyRecordSignatureInput(cloneKeyRecord(keyRecord));
  if (keyRecord.suite !== picoIdentitySuite || keyRecord.keyRole !== 'pico_identity') {
    throw new Error('invalid_issuer_key_role');
  }
}

function assertSigningCapableKeyRecord(
  keyRecord: PicoIdentityKeyRecordSignatureInput,
  reason: string,
): void {
  buildPicoIdentityKeyRecordSignatureInput(cloneKeyRecord(keyRecord));
  if (keyRecord.keyRole === 'device_key_agreement' || keyRecord.keyRole === 'home_host_key_agreement') {
    throw new Error(reason);
  }
}

function fixedHexBytes(value: string, expectedByteLength: number, lengthReason: string): Uint8Array {
  if (!/^[0-9a-f]+$/.test(value)) {
    throw new Error('invalid_hex');
  }
  if (value.length !== expectedByteLength * 2) {
    throw new Error(lengthReason);
  }

  const output = new Uint8Array(expectedByteLength);
  for (let i = 0; i < expectedByteLength; i += 1) {
    output[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  }

  return output;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function timingSafeAsciiEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) {
    mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return mismatch === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
