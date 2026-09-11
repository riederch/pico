import { hasExactKeys, hexOfBytesPattern, isAsciiToken } from '@pico/protocol/canonical-bytes';
import { isPicoLifecycleOrder, nextPicoLifecycleOrder } from '@pico/protocol/lifecycle-order';
import {
  buildPicoHomeDeviceRecoveryClaimSignatureInput,
  buildPicoHomeDeviceRecoveryPrepareSignatureInput,
  buildPicoIdentityDelegationSignatureInput,
  buildPicoIdentityRevocationSignatureInput,
  isPicoInstant,
  picoHomeDeviceRecoveryCanonicalLabels,
  picoHomeDeviceRecoveryClaimDigestHex,
  picoHomeDeviceRecoveryEvidenceDigestHex,
  picoHomeDeviceRecoveryRecordSchema,
  picoHomeDeviceRecoverySubmissionSchema,
  picoHomeDeviceRecoveryTiming,
  picoIdentityDelegationScopes,
  picoIdentitySignatureInputLabels,
  picoIdentitySuite,
  type PicoHomeDeviceRecoveryEvidence,
  type PicoHomeDeviceRecoveryPendingView,
  type PicoHomeDeviceRecoveryPreparation,
  type PicoHomeDeviceRecoveryRecord,
  type PicoHomeDeviceRecoverySubmission,
  type PicoIdentityDelegationScope,
  type PicoIdentityDelegationSignatureInput,
  type PicoIdentityKeyRecordSignatureInput,
  type PicoIdentityRevocationSignatureInput,
} from '@pico/protocol';
import type { VaultSodium } from '@pico/vault';
import type { PicoVaultDaemonClient } from './client.js';
import type { PicoLinkDirectClient } from './link-direct-client.js';
import type {
  PicoVaultDaemonUnlockedSessionDescriptor,
} from './protocol.js';

const fingerprintPattern = hexOfBytesPattern(32);
const signaturePattern = hexOfBytesPattern(64);

const defaultRecoveryScopes: readonly PicoIdentityDelegationScope[] = [
  'surface_session',
  'decrypt_domain',
  'receive_key_envelope',
];

export interface PicoHomeDeviceRecoveryActiveDeviceView {
  delegationId: string;
  deviceSigningKeyFingerprintHex: string;
  deviceKeyAgreementKeyFingerprintHex: string;
}

export interface PicoHomeDeviceRecoveryPreparationView {
  homeId: string;
  picoIdentityFingerprintHex: string;
  observedLifecycleOrder: string;
  activeDevices: PicoHomeDeviceRecoveryActiveDeviceView[];
}

export interface InitiatePicoHomeDeviceRecoveryInput {
  rootClient: PicoVaultDaemonClient;
  targetClient: PicoVaultDaemonClient;
  targetLinkClient: PicoLinkDirectClient;
  sodium: VaultSodium;
  homeId: string;
  hostSigningKeyFingerprintHex: string;
  hostKeyAgreementKeyFingerprintHex: string;
  identityKeyFingerprintHex: string;
  targetDelegationId: string;
  targetDeviceSigningKeyFingerprintHex: string;
  targetDeviceKeyAgreementKeyFingerprintHex: string;
  validFrom?: string;
  validUntil: string;
  scopes?: PicoIdentityDelegationScope[];
  preparationId?: string;
  recoveryId?: string;
  now?: () => Date;
}

export interface PicoHomeDeviceRecoveryCeremonyResult {
  preparation: PicoHomeDeviceRecoveryPreparation;
  preparationView: PicoHomeDeviceRecoveryPreparationView;
  submission: PicoHomeDeviceRecoverySubmission;
  pending: PicoHomeDeviceRecoveryPendingView;
}

export interface CompletePicoHomeDeviceRecoveryInput {
  targetLinkClient: PicoLinkDirectClient;
  pending: PicoHomeDeviceRecoveryPendingView;
}

export interface PicoHomeDeviceRecoveryCompletionResult {
  status: 'consumed';
  record: PicoHomeDeviceRecoveryRecord;
}

export interface VetoPicoHomeDeviceRecoveryInput {
  livingDeviceLinkClient: PicoLinkDirectClient;
  recoveryId: string;
}

/**
 * ADR 0110 R3 person-side recovery ceremony.
 *
 * The root first authorizes a target-bound discovery, then creates one new
 * delegation plus a revocation for every active delegation returned by that
 * authenticated read. Finally root and target sign the same claim. Only
 * finished public records cross Link; no private key or PIN enters this path.
 */
export async function initiatePicoHomeDeviceRecovery(
  input: InitiatePicoHomeDeviceRecoveryInput,
): Promise<PicoHomeDeviceRecoveryCeremonyResult> {
  const now = (input.now ?? (() => new Date()))();
  if (!Number.isFinite(now.getTime())) {
    throw new Error('invalid_recovery_ceremony_time');
  }
  assertRecoveryLinkBinding(input);
  const [rootStatus, targetStatus] = await Promise.all([
    input.rootClient.status(),
    input.targetClient.status(),
  ]);
  const identity = requireSession(
    rootStatus.sessions,
    input.identityKeyFingerprintHex,
    'pico_identity',
    'recovery_identity_key_not_unlocked',
  );
  const targetSigning = requireSession(
    targetStatus.sessions,
    input.targetDeviceSigningKeyFingerprintHex,
    'device_signing',
    'recovery_target_signing_key_not_unlocked',
  );
  const targetAgreement = requireSession(
    targetStatus.sessions,
    input.targetDeviceKeyAgreementKeyFingerprintHex,
    'device_key_agreement',
    'recovery_target_agreement_key_not_unlocked',
  );
  if (input.targetLinkClient.sender.identityPublicKeyHex !== identity.publicKeyHex) {
    throw new Error('recovery_link_identity_key_mismatch');
  }

  const createdAt = now.toISOString();
  const expiresAt = new Date(
    now.getTime() + picoHomeDeviceRecoveryTiming.signedRequestLifetimeMs,
  ).toISOString();
  const preparationRequest = {
    suite: picoIdentitySuite,
    preparationId: input.preparationId
      ?? randomId(input.sodium, 'recovery_preparation'),
    homeId: input.homeId,
    hostSigningKeyFingerprintHex: input.hostSigningKeyFingerprintHex,
    hostKeyAgreementKeyFingerprintHex:
      input.hostKeyAgreementKeyFingerprintHex,
    picoIdentityFingerprintHex: input.identityKeyFingerprintHex,
    targetDelegationId: input.targetDelegationId,
    targetDeviceSigningKeyFingerprintHex:
      input.targetDeviceSigningKeyFingerprintHex,
    targetDeviceKeyAgreementKeyFingerprintHex:
      input.targetDeviceKeyAgreementKeyFingerprintHex,
    createdAt,
    expiresAt,
  };
  buildPicoHomeDeviceRecoveryPrepareSignatureInput(preparationRequest);
  const preparation: PicoHomeDeviceRecoveryPreparation = {
    request: preparationRequest,
    identityKeyRecord: keyRecord(identity, 'pico_identity'),
    rootSignatureHex: await signWithExactKey(input.rootClient, {
      keyFingerprintHex: identity.keyFingerprintHex,
      keyRole: 'pico_identity',
      label: picoHomeDeviceRecoveryCanonicalLabels.prepare,
      fields: preparationRequest as unknown as Record<string, unknown>,
    }),
  };
  const prepared = await input.targetLinkClient.request(
    'home.device.recovery.submit',
    { phase: 'prepare', preparation },
  );
  if (prepared.outcome !== 'ok') {
    throw new Error(`recovery_prepare_rejected:${prepared.outcome}`);
  }
  const preparationView = parsePreparationView(prepared.result, {
    preparationId: preparationRequest.preparationId,
    homeId: input.homeId,
    picoIdentityFingerprintHex: input.identityKeyFingerprintHex,
    targetDelegationId: input.targetDelegationId,
  });

  const scopes = normalizeScopes(input.scopes ?? [...defaultRecoveryScopes]);
  const validFrom = input.validFrom ?? createdAt;
  const validFromMs = Date.parse(validFrom);
  const validUntilMs = Date.parse(input.validUntil);
  if (
    !isPicoInstant(validFrom)
    || !isPicoInstant(input.validUntil)
    || !Number.isFinite(validFromMs)
    || !Number.isFinite(validUntilMs)
    || validFromMs > now.getTime()
    || validUntilMs <= Date.parse(expiresAt)
      + picoHomeDeviceRecoveryTiming.vetoDelayMs
      + picoHomeDeviceRecoveryTiming.completionWindowMs
  ) {
    throw new Error('invalid_recovery_delegation_validity');
  }

  const delegation: PicoIdentityDelegationSignatureInput = {
    suite: picoIdentitySuite,
    delegationId: input.targetDelegationId,
    issuerIdentityKeyFingerprintHex: input.identityKeyFingerprintHex,
    subjectSigningKeyFingerprintHex:
      input.targetDeviceSigningKeyFingerprintHex,
    subjectKeyAgreementKeyFingerprintHex:
      input.targetDeviceKeyAgreementKeyFingerprintHex,
    scopes,
    validFrom,
    validUntil: input.validUntil,
    lifecycleOrder: nextPicoLifecycleOrder(
      preparationView.observedLifecycleOrder,
    ),
  };
  buildPicoIdentityDelegationSignatureInput(delegation);
  const delegationSignatureHex = await signWithExactKey(input.rootClient, {
    keyFingerprintHex: identity.keyFingerprintHex,
    keyRole: 'pico_identity',
    label: picoIdentitySignatureInputLabels.delegation,
    fields: delegation as unknown as Record<string, unknown>,
  });

  const revocations: PicoHomeDeviceRecoveryEvidence['revocations'] = [];
  for (const [index, device] of preparationView.activeDevices.entries()) {
    const revocation: PicoIdentityRevocationSignatureInput = {
      suite: picoIdentitySuite,
      revocationId: randomId(input.sodium, 'recovery_revocation'),
      issuerIdentityKeyFingerprintHex: input.identityKeyFingerprintHex,
      subjectKind: 'delegation',
      subjectRef: device.delegationId,
      reasonCategory: 'lost_device',
      revokedAt: createdAt,
      lifecycleOrder: nextPicoLifecycleOrder(
        preparationView.observedLifecycleOrder,
        BigInt(index + 2),
      ),
    };
    buildPicoIdentityRevocationSignatureInput(revocation);
    revocations.push({
      record: revocation,
      signatureHex: await signWithExactKey(input.rootClient, {
        keyFingerprintHex: identity.keyFingerprintHex,
        keyRole: 'pico_identity',
        label: picoIdentitySignatureInputLabels.revocation,
        fields: revocation as unknown as Record<string, unknown>,
      }),
    });
  }

  const evidence: PicoHomeDeviceRecoveryEvidence = {
    identityKeyRecord: keyRecord(identity, 'pico_identity'),
    targetDeviceSigningKeyRecord: keyRecord(
      targetSigning,
      'device_signing',
    ),
    targetDeviceKeyAgreementKeyRecord: keyRecord(
      targetAgreement,
      'device_key_agreement',
    ),
    delegation: { record: delegation, signatureHex: delegationSignatureHex },
    revocations,
  };
  const claim = {
    suite: picoIdentitySuite,
    recoveryId: input.recoveryId ?? randomId(input.sodium, 'recovery'),
    homeId: input.homeId,
    hostSigningKeyFingerprintHex: input.hostSigningKeyFingerprintHex,
    hostKeyAgreementKeyFingerprintHex:
      input.hostKeyAgreementKeyFingerprintHex,
    picoIdentityFingerprintHex: input.identityKeyFingerprintHex,
    targetDelegationId: input.targetDelegationId,
    targetDeviceSigningKeyFingerprintHex:
      input.targetDeviceSigningKeyFingerprintHex,
    targetDeviceKeyAgreementKeyFingerprintHex:
      input.targetDeviceKeyAgreementKeyFingerprintHex,
    evidenceDigestHex:
      picoHomeDeviceRecoveryEvidenceDigestHex(input.sodium, evidence),
    observedLifecycleOrder: preparationView.observedLifecycleOrder,
    createdAt,
    expiresAt,
  };
  buildPicoHomeDeviceRecoveryClaimSignatureInput(claim);
  const submission: PicoHomeDeviceRecoverySubmission = {
    schema: picoHomeDeviceRecoverySubmissionSchema,
    claim,
    evidence,
    rootSignatureHex: await signWithExactKey(input.rootClient, {
      keyFingerprintHex: identity.keyFingerprintHex,
      keyRole: 'pico_identity',
      label: picoHomeDeviceRecoveryCanonicalLabels.claim,
      fields: claim as unknown as Record<string, unknown>,
    }),
    targetSignatureHex: await signWithExactKey(input.targetClient, {
      keyFingerprintHex: targetSigning.keyFingerprintHex,
      keyRole: 'device_signing',
      label: picoHomeDeviceRecoveryCanonicalLabels.claim,
      fields: claim as unknown as Record<string, unknown>,
    }),
  };
  const initiated = await input.targetLinkClient.request(
    'home.device.recovery.submit',
    { phase: 'initiate', submission },
  );
  if (initiated.outcome !== 'recovery_pending') {
    throw new Error(`recovery_initiate_rejected:${initiated.outcome}`);
  }
  const pending = parsePendingRecovery(initiatedResult(initiated.result));
  const claimDigestHex = picoHomeDeviceRecoveryClaimDigestHex(
    input.sodium,
    claim,
  );
  if (
    pending.recoveryId !== claim.recoveryId
    || pending.claimDigestHex !== claimDigestHex
    || pending.targetDelegationId !== input.targetDelegationId
    || pending.targetDeviceSigningKeyFingerprintHex
      !== input.targetDeviceSigningKeyFingerprintHex
    || pending.targetDeviceKeyAgreementKeyFingerprintHex
      !== input.targetDeviceKeyAgreementKeyFingerprintHex
  ) {
    throw new Error('recovery_pending_binding_mismatch');
  }

  return { preparation, preparationView, submission, pending };
}

/** Completion is target possession plus elapsed Home time; no root re-sign. */
export async function completePicoHomeDeviceRecovery(
  input: CompletePicoHomeDeviceRecoveryInput,
): Promise<PicoHomeDeviceRecoveryCompletionResult> {
  const pending = parsePendingRecovery(
    input.pending as unknown as Record<string, unknown>,
  );
  assertPendingTargetBinding(input.targetLinkClient, pending);
  const completed = await input.targetLinkClient.request(
    'home.device.recovery.submit',
    {
      phase: 'complete',
      recoveryId: pending.recoveryId,
      claimDigestHex: pending.claimDigestHex,
    },
  );
  if (completed.outcome !== 'ok') {
    throw new Error(`recovery_complete_rejected:${completed.outcome}`);
  }
  if (!hasExactKeys(completed.result, ['status', 'record'])
    || completed.result.status !== 'consumed') {
    throw new Error('invalid_recovery_completion_result');
  }
  return {
    status: 'consumed',
    record: parseCompletionRecord(completed.result.record, pending),
  };
}

/** A surviving, normally authorized device can veto; host/admin cannot. */
export async function vetoPicoHomeDeviceRecovery(
  input: VetoPicoHomeDeviceRecoveryInput,
): Promise<{ status: 'vetoed' }> {
  if (!isAsciiToken(input.recoveryId)) {
    throw new Error('invalid_recovery_id');
  }
  const vetoed = await input.livingDeviceLinkClient.request(
    'home.device.recovery.veto',
    { recoveryId: input.recoveryId },
  );
  if (vetoed.outcome !== 'ok') {
    throw new Error(`recovery_veto_rejected:${vetoed.outcome}`);
  }
  if (!hasExactKeys(vetoed.result, ['status'])
    || vetoed.result.status !== 'vetoed') {
    throw new Error('invalid_recovery_veto_result');
  }
  return { status: 'vetoed' };
}

function assertRecoveryLinkBinding(
  input: InitiatePicoHomeDeviceRecoveryInput,
): void {
  const sender = input.targetLinkClient.sender;
  if (
    input.targetLinkClient.hostSigningKeyFingerprintHex
      !== input.hostSigningKeyFingerprintHex
    || input.targetLinkClient.hostKeyAgreementKeyFingerprintHex
      !== input.hostKeyAgreementKeyFingerprintHex
    || sender.identityKeyFingerprintHex !== input.identityKeyFingerprintHex
    || sender.deviceSigningKeyFingerprintHex
      !== input.targetDeviceSigningKeyFingerprintHex
    || sender.deviceKeyAgreementKeyFingerprintHex
      !== input.targetDeviceKeyAgreementKeyFingerprintHex
    || sender.delegationId !== input.targetDelegationId
  ) {
    throw new Error('recovery_link_binding_mismatch');
  }
}

function assertPendingTargetBinding(
  linkClient: PicoLinkDirectClient,
  pending: PicoHomeDeviceRecoveryPendingView,
): void {
  const sender = linkClient.sender;
  if (
    sender.delegationId !== pending.targetDelegationId
    || sender.deviceSigningKeyFingerprintHex
      !== pending.targetDeviceSigningKeyFingerprintHex
    || sender.deviceKeyAgreementKeyFingerprintHex
      !== pending.targetDeviceKeyAgreementKeyFingerprintHex
  ) {
    throw new Error('recovery_completion_target_mismatch');
  }
}

function parsePreparationView(
  value: Record<string, unknown>,
  expected: {
    preparationId: string;
    homeId: string;
    picoIdentityFingerprintHex: string;
    targetDelegationId: string;
  },
): PicoHomeDeviceRecoveryPreparationView {
  if (!hasExactKeys(value, [
    'preparationId',
    'homeId',
    'picoIdentityFingerprintHex',
    'observedLifecycleOrder',
    'activeDevices',
  ])
    || value.preparationId !== expected.preparationId
    || value.homeId !== expected.homeId
    || value.picoIdentityFingerprintHex !== expected.picoIdentityFingerprintHex
    || typeof value.observedLifecycleOrder !== 'string'
    || !isPicoLifecycleOrder(value.observedLifecycleOrder)
    || !Array.isArray(value.activeDevices)) {
    throw new Error('invalid_recovery_preparation_result');
  }
  const activeDevices = value.activeDevices.map((candidate) => {
    if (!isRecord(candidate) || !hasExactKeys(candidate, [
      'delegationId',
      'deviceSigningKeyFingerprintHex',
      'deviceKeyAgreementKeyFingerprintHex',
    ])
      || typeof candidate.delegationId !== 'string'
      || !isAsciiToken(candidate.delegationId)
      || !fingerprintPattern.test(String(
        candidate.deviceSigningKeyFingerprintHex,
      ))
      || !fingerprintPattern.test(String(
        candidate.deviceKeyAgreementKeyFingerprintHex,
      ))) {
      throw new Error('invalid_recovery_preparation_result');
    }
    return candidate as unknown as PicoHomeDeviceRecoveryActiveDeviceView;
  }).sort((left, right) => left.delegationId.localeCompare(right.delegationId));
  if (
    new Set(activeDevices.map((device) => device.delegationId)).size
      !== activeDevices.length
    || activeDevices.some(
      (device) => device.delegationId === expected.targetDelegationId,
    )
  ) {
    throw new Error('invalid_recovery_preparation_result');
  }
  return {
    homeId: expected.homeId,
    picoIdentityFingerprintHex: expected.picoIdentityFingerprintHex,
    observedLifecycleOrder: value.observedLifecycleOrder,
    activeDevices,
  };
}

function initiatedResult(
  value: Record<string, unknown>,
): Record<string, unknown> {
  if (!hasExactKeys(value, [
    'status',
    'recoveryId',
    'claimDigestHex',
    'targetDelegationId',
    'targetDeviceSigningKeyFingerprintHex',
    'targetDeviceKeyAgreementKeyFingerprintHex',
    'acceptedAt',
    'effectiveAt',
    'completionExpiresAt',
  ]) || value.status !== 'pending') {
    throw new Error('invalid_recovery_pending_result');
  }
  const { status: _status, ...pending } = value;
  return pending;
}

function parsePendingRecovery(
  value: Record<string, unknown>,
): PicoHomeDeviceRecoveryPendingView {
  if (!hasExactKeys(value, [
    'recoveryId',
    'claimDigestHex',
    'targetDelegationId',
    'targetDeviceSigningKeyFingerprintHex',
    'targetDeviceKeyAgreementKeyFingerprintHex',
    'acceptedAt',
    'effectiveAt',
    'completionExpiresAt',
  ])) {
    throw new Error('invalid_recovery_pending_result');
  }
  const pending = value as unknown as PicoHomeDeviceRecoveryPendingView;
  const acceptedAt = Date.parse(pending.acceptedAt);
  const effectiveAt = Date.parse(pending.effectiveAt);
  const completionExpiresAt = Date.parse(pending.completionExpiresAt);
  if (
    !isAsciiToken(pending.recoveryId)
    || !fingerprintPattern.test(pending.claimDigestHex)
    || !isAsciiToken(pending.targetDelegationId)
    || !fingerprintPattern.test(
      pending.targetDeviceSigningKeyFingerprintHex,
    )
    || !fingerprintPattern.test(
      pending.targetDeviceKeyAgreementKeyFingerprintHex,
    )
    || !isPicoInstant(pending.acceptedAt)
    || !isPicoInstant(pending.effectiveAt)
    || !isPicoInstant(pending.completionExpiresAt)
    || !Number.isFinite(acceptedAt)
    || effectiveAt - acceptedAt !== picoHomeDeviceRecoveryTiming.vetoDelayMs
    || completionExpiresAt - effectiveAt
      !== picoHomeDeviceRecoveryTiming.completionWindowMs
  ) {
    throw new Error('invalid_recovery_pending_result');
  }
  return pending;
}

function parseCompletionRecord(
  value: unknown,
  pending: PicoHomeDeviceRecoveryPendingView,
): PicoHomeDeviceRecoveryRecord {
  if (!isRecord(value)
    || value.schema !== picoHomeDeviceRecoveryRecordSchema
    || !isRecord(value.submission)
    || !isRecord(value.receipt)
    || !isRecord(value.hostSigningKeyRecord)
    || typeof value.hostSignatureHex !== 'string'
    || !signaturePattern.test(value.hostSignatureHex)
    || !isRecord(value.submission.claim)
    || value.submission.schema !== picoHomeDeviceRecoverySubmissionSchema) {
    throw new Error('invalid_recovery_completion_result');
  }
  const claim = value.submission.claim;
  const receipt = value.receipt;
  if (
    claim.recoveryId !== pending.recoveryId
    || claim.targetDelegationId !== pending.targetDelegationId
    || claim.targetDeviceSigningKeyFingerprintHex
      !== pending.targetDeviceSigningKeyFingerprintHex
    || claim.targetDeviceKeyAgreementKeyFingerprintHex
      !== pending.targetDeviceKeyAgreementKeyFingerprintHex
    || receipt.recoveryId !== pending.recoveryId
    || receipt.claimDigestHex !== pending.claimDigestHex
    || receipt.targetDelegationId !== pending.targetDelegationId
    || receipt.targetDeviceSigningKeyFingerprintHex
      !== pending.targetDeviceSigningKeyFingerprintHex
    || receipt.targetDeviceKeyAgreementKeyFingerprintHex
      !== pending.targetDeviceKeyAgreementKeyFingerprintHex
    || receipt.pendingAcceptedAt !== pending.acceptedAt
    || receipt.effectiveAt !== pending.effectiveAt
    || receipt.completionExpiresAt !== pending.completionExpiresAt
    || receipt.leavesExactlyOneActiveDevice !== true
  ) {
    throw new Error('recovery_completion_binding_mismatch');
  }
  return value as unknown as PicoHomeDeviceRecoveryRecord;
}

async function signWithExactKey(
  client: PicoVaultDaemonClient,
  input: {
    keyFingerprintHex: string;
    keyRole: 'pico_identity' | 'device_signing';
    label: string;
    fields: Record<string, unknown>;
  },
): Promise<string> {
  const signed = await client.sign(input);
  if (
    signed.keyRole !== input.keyRole
    || signed.keyFingerprintHex !== input.keyFingerprintHex
    || !signaturePattern.test(signed.signatureHex)
  ) {
    throw new Error('recovery_signer_mismatch');
  }
  return signed.signatureHex;
}

function requireSession(
  sessions: PicoVaultDaemonUnlockedSessionDescriptor[],
  fingerprintHex: string,
  keyRole: PicoVaultDaemonUnlockedSessionDescriptor['keyRole'],
  reason: string,
): PicoVaultDaemonUnlockedSessionDescriptor {
  const session = sessions.find(
    (candidate) =>
      candidate.keyFingerprintHex === fingerprintHex
      && candidate.keyRole === keyRole,
  );
  if (session === undefined) {
    throw new Error(reason);
  }
  return session;
}

function keyRecord<Role extends 'pico_identity' | 'device_signing' | 'device_key_agreement'>(
  session: PicoVaultDaemonUnlockedSessionDescriptor,
  role: Role,
): PicoIdentityKeyRecordSignatureInput & { keyRole: Role } {
  if (session.keyRole !== role) {
    throw new Error('recovery_key_role_mismatch');
  }
  return {
    suite: picoIdentitySuite,
    keyRole: role,
    publicKeyHex: session.publicKeyHex,
  };
}

function normalizeScopes(
  scopes: PicoIdentityDelegationScope[],
): PicoIdentityDelegationScope[] {
  const selected = new Set(scopes);
  if (
    selected.size !== scopes.length
    || !selected.has('surface_session')
    || scopes.some((scope) =>
      !(picoIdentityDelegationScopes as readonly string[]).includes(scope))
  ) {
    throw new Error('invalid_recovery_delegation_scopes');
  }
  return picoIdentityDelegationScopes.filter((scope) => selected.has(scope));
}

function randomId(sodium: VaultSodium, prefix: string): string {
  return `${prefix}_${Buffer.from(sodium.randombytes_buf(16)).toString('hex')}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
