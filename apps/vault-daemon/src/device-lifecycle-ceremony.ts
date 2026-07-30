import {
  picoHomeDeviceLifecycleCanonicalLabels,
  picoHomeDeviceLifecycleEvidenceDigestHex,
  picoHomeDeviceLifecycleSubmissionSchema,
  picoIdentitySignatureInputLabels,
  picoIdentitySuite,
  type PicoHomeDeviceActivationSignatureInput,
  type PicoHomeDeviceLifecycleEvidence,
  type PicoHomeDeviceLifecycleSubmission,
  type PicoIdentityDelegationScope,
  type PicoIdentityDelegationSignatureInput,
  type PicoIdentityKeyRecordSignatureInput,
  type PicoIdentityRevocationReasonCategory,
  type PicoIdentityRevocationSignatureInput,
} from '@pico/protocol';
import type { VaultSodium } from '@pico/vault';
import type { PicoVaultDaemonClient } from './client.js';
import type {
  PicoVaultDaemonUnlockedSessionDescriptor,
} from './protocol.js';
import type {
  PicoLinkDirectClient,
  PicoLinkDirectSender,
} from './link-direct-client.js';

const TARGET_ACTIVATION_LIFETIME_MS = 4 * 60 * 1_000;
const lifecycleOrderPattern = /^seq:([0-9]{16})$/;

export interface PicoHomeDeviceLifecycleDeviceView {
  delegationId: string;
  deviceSigningKeyFingerprintHex: string;
  deviceKeyAgreementKeyFingerprintHex: string;
  lifecycleOrder: string;
  validUntil: string;
  status: 'active' | 'not_yet_valid' | 'expired' | 'revoked';
}

export interface PicoHomeDeviceLifecycleView {
  homeId: string;
  picoIdentityFingerprintHex: string;
  observedLifecycleOrder: string;
  devices: PicoHomeDeviceLifecycleDeviceView[];
}

export interface PicoHomeDeviceLifecycleCeremonyResult {
  accepted: Record<string, unknown>;
  submission: PicoHomeDeviceLifecycleSubmission;
}

interface LifecycleCeremonyBaseInput {
  rootClient: PicoVaultDaemonClient;
  sponsorLinkClient: PicoLinkDirectClient;
  sodium: VaultSodium;
  identityKeyFingerprintHex: string;
  sponsor: PicoLinkDirectSender;
  now?: () => Date;
}

interface AuthorityCreationInput extends LifecycleCeremonyBaseInput {
  targetClient: PicoVaultDaemonClient;
  targetSigningKeyFingerprintHex: string;
  targetKeyAgreementKeyFingerprintHex: string;
  scopes: PicoIdentityDelegationScope[];
  validFrom?: string;
  validUntil: string;
}

export interface EnrollPicoHomeDeviceInput extends AuthorityCreationInput {
  delegationId?: string;
  transitionId?: string;
}

export interface RenewPicoHomeDeviceInput extends AuthorityCreationInput {
  replacedDelegationId: string;
  delegationId?: string;
  transitionId?: string;
}

export interface RevokePicoHomeDeviceInput extends LifecycleCeremonyBaseInput {
  targetDelegationId: string;
  subjectKind?: 'delegation' | 'key';
  subject?: 'delegation' | 'device_signing_key' | 'device_key_agreement_key';
  reasonCategory?: PicoIdentityRevocationReasonCategory;
  transitionId?: string;
  revocationId?: string;
}

/**
 * ADR 0109 D3 enrollment.
 *
 * The identity root signs the authority-creating delegation through its
 * approval-gated Vault client. A distinct target Vault then co-signs the
 * short-lived Home activation with the exact target device key. The sponsor
 * Vault signs only the outer Link request, through the client supplied here.
 */
export async function enrollPicoHomeDevice(
  input: EnrollPicoHomeDeviceInput,
): Promise<PicoHomeDeviceLifecycleCeremonyResult> {
  const context = await authorityCreationContext(input);
  const transitionId = input.transitionId ?? randomId(input.sodium, 'device_enrollment');
  const delegation: PicoIdentityDelegationSignatureInput = {
    suite: picoIdentitySuite,
    delegationId: input.delegationId ?? randomId(input.sodium, 'delegation'),
    issuerIdentityKeyFingerprintHex: input.identityKeyFingerprintHex,
    subjectSigningKeyFingerprintHex: context.targetSigning.keyFingerprintHex,
    subjectKeyAgreementKeyFingerprintHex: context.targetAgreement.keyFingerprintHex,
    scopes: [...input.scopes],
    validFrom: input.validFrom ?? context.now.toISOString(),
    validUntil: input.validUntil,
    lifecycleOrder: nextLifecycleOrder(context.view.observedLifecycleOrder),
  };
  const delegationSignatureHex = await signWithExactKey(input.rootClient, {
    keyFingerprintHex: context.identity.keyFingerprintHex,
    keyRole: 'pico_identity',
    label: picoIdentitySignatureInputLabels.delegation,
    fields: delegation as unknown as Record<string, unknown>,
  });
  const evidence: PicoHomeDeviceLifecycleEvidence = {
    transitionId,
    action: 'enroll',
    picoIdentityFingerprintHex: input.identityKeyFingerprintHex,
    targetDelegationId: delegation.delegationId,
    targetDeviceSigningKeyFingerprintHex: context.targetSigning.keyFingerprintHex,
    targetDeviceKeyAgreementKeyFingerprintHex: context.targetAgreement.keyFingerprintHex,
    replacedDelegationId: null,
    observedLifecycleOrder: context.view.observedLifecycleOrder,
    identityKeyRecord: keyRecord(context.identity),
    targetDeviceSigningKeyRecord: keyRecord(context.targetSigning),
    targetDeviceKeyAgreementKeyRecord: keyRecord(context.targetAgreement),
    delegation: { record: delegation, signatureHex: delegationSignatureHex },
    revocations: [],
  };

  return await activateAndSubmit(input, context, evidence);
}

/**
 * ADR 0109 replacement renewal. The delegation and the old-delegation
 * revocation are two independent root signatures and therefore two explicit
 * approvals. Their lifecycle orders are distinct and strictly above the head
 * read before either signature was requested.
 */
export async function renewPicoHomeDevice(
  input: RenewPicoHomeDeviceInput,
): Promise<PicoHomeDeviceLifecycleCeremonyResult> {
  const context = await authorityCreationContext(input);
  const replaced = context.view.devices.find(
    (device) => device.delegationId === input.replacedDelegationId,
  );
  if (replaced === undefined
    || replaced.status !== 'active'
    || replaced.deviceSigningKeyFingerprintHex !== context.targetSigning.keyFingerprintHex
    || replaced.deviceKeyAgreementKeyFingerprintHex !== context.targetAgreement.keyFingerprintHex) {
    throw new Error('renewal_target_is_not_active');
  }

  const transitionId = input.transitionId ?? randomId(input.sodium, 'device_renewal');
  const delegation: PicoIdentityDelegationSignatureInput = {
    suite: picoIdentitySuite,
    delegationId: input.delegationId ?? randomId(input.sodium, 'delegation'),
    issuerIdentityKeyFingerprintHex: input.identityKeyFingerprintHex,
    subjectSigningKeyFingerprintHex: context.targetSigning.keyFingerprintHex,
    subjectKeyAgreementKeyFingerprintHex: context.targetAgreement.keyFingerprintHex,
    scopes: [...input.scopes],
    validFrom: input.validFrom ?? context.now.toISOString(),
    validUntil: input.validUntil,
    lifecycleOrder: nextLifecycleOrder(context.view.observedLifecycleOrder),
  };
  const revocation: PicoIdentityRevocationSignatureInput = {
    suite: picoIdentitySuite,
    revocationId: randomId(input.sodium, 'revocation'),
    issuerIdentityKeyFingerprintHex: input.identityKeyFingerprintHex,
    subjectKind: 'delegation',
    subjectRef: input.replacedDelegationId,
    reasonCategory: 'key_rotated',
    revokedAt: context.now.toISOString(),
    lifecycleOrder: nextLifecycleOrder(context.view.observedLifecycleOrder, 2n),
  };
  const delegationSignatureHex = await signWithExactKey(input.rootClient, {
    keyFingerprintHex: context.identity.keyFingerprintHex,
    keyRole: 'pico_identity',
    label: picoIdentitySignatureInputLabels.delegation,
    fields: delegation as unknown as Record<string, unknown>,
  });
  const revocationSignatureHex = await signWithExactKey(input.rootClient, {
    keyFingerprintHex: context.identity.keyFingerprintHex,
    keyRole: 'pico_identity',
    label: picoIdentitySignatureInputLabels.revocation,
    fields: revocation as unknown as Record<string, unknown>,
  });
  const evidence: PicoHomeDeviceLifecycleEvidence = {
    transitionId,
    action: 'renew',
    picoIdentityFingerprintHex: input.identityKeyFingerprintHex,
    targetDelegationId: delegation.delegationId,
    targetDeviceSigningKeyFingerprintHex: context.targetSigning.keyFingerprintHex,
    targetDeviceKeyAgreementKeyFingerprintHex: context.targetAgreement.keyFingerprintHex,
    replacedDelegationId: input.replacedDelegationId,
    observedLifecycleOrder: context.view.observedLifecycleOrder,
    identityKeyRecord: keyRecord(context.identity),
    targetDeviceSigningKeyRecord: keyRecord(context.targetSigning),
    targetDeviceKeyAgreementKeyRecord: keyRecord(context.targetAgreement),
    delegation: { record: delegation, signatureHex: delegationSignatureHex },
    revocations: [{ record: revocation, signatureHex: revocationSignatureHex }],
  };

  return await activateAndSubmit(input, context, evidence);
}

/**
 * ADR 0109 revocation. The target never co-signs its own removal. The
 * ceremony reads its exact stored binding, asks the identity-root holder once,
 * and submits through an independently active sponsor (or the still-active
 * target itself). The approval renderer always carries the last-path warning.
 */
export async function revokePicoHomeDevice(
  input: RevokePicoHomeDeviceInput,
): Promise<PicoHomeDeviceLifecycleCeremonyResult> {
  const now = (input.now ?? (() => new Date()))();
  const identity = await identitySession(input.rootClient, input.identityKeyFingerprintHex);
  const view = await readLifecycle(input.sponsorLinkClient, input);
  const target = view.devices.find(
    (device) => device.delegationId === input.targetDelegationId,
  );
  if (target === undefined) {
    throw new Error('revocation_target_is_unknown');
  }

  const subject = input.subject ?? 'delegation';
  const subjectRef = subject === 'delegation'
    ? target.delegationId
    : subject === 'device_signing_key'
      ? target.deviceSigningKeyFingerprintHex
      : target.deviceKeyAgreementKeyFingerprintHex;
  const revocation: PicoIdentityRevocationSignatureInput = {
    suite: picoIdentitySuite,
    revocationId: input.revocationId ?? randomId(input.sodium, 'revocation'),
    issuerIdentityKeyFingerprintHex: input.identityKeyFingerprintHex,
    subjectKind: input.subjectKind ?? (subject === 'delegation' ? 'delegation' : 'key'),
    subjectRef,
    reasonCategory: input.reasonCategory ?? 'device_retired',
    revokedAt: now.toISOString(),
    lifecycleOrder: nextLifecycleOrder(view.observedLifecycleOrder),
  };
  if (
    (subject === 'delegation' && revocation.subjectKind !== 'delegation')
    || (subject !== 'delegation' && revocation.subjectKind !== 'key')
  ) {
    throw new Error('revocation_subject_kind_mismatch');
  }
  const signatureHex = await signWithExactKey(input.rootClient, {
    keyFingerprintHex: identity.keyFingerprintHex,
    keyRole: 'pico_identity',
    label: picoIdentitySignatureInputLabels.revocation,
    fields: revocation as unknown as Record<string, unknown>,
  });
  const evidence: PicoHomeDeviceLifecycleEvidence = {
    transitionId: input.transitionId ?? randomId(input.sodium, 'device_revocation'),
    action: 'revoke',
    picoIdentityFingerprintHex: input.identityKeyFingerprintHex,
    targetDelegationId: target.delegationId,
    targetDeviceSigningKeyFingerprintHex: target.deviceSigningKeyFingerprintHex,
    targetDeviceKeyAgreementKeyFingerprintHex: target.deviceKeyAgreementKeyFingerprintHex,
    replacedDelegationId: null,
    observedLifecycleOrder: view.observedLifecycleOrder,
    identityKeyRecord: keyRecord(identity),
    targetDeviceSigningKeyRecord: null,
    targetDeviceKeyAgreementKeyRecord: null,
    delegation: null,
    revocations: [{ record: revocation, signatureHex }],
  };
  const submission: PicoHomeDeviceLifecycleSubmission = {
    schema: picoHomeDeviceLifecycleSubmissionSchema,
    evidence,
    activation: null,
  };

  return {
    accepted: await submit(input.sponsorLinkClient, submission),
    submission,
  };
}

export async function readPicoHomeDeviceLifecycle(
  linkClient: PicoLinkDirectClient,
  input: {
    identityKeyFingerprintHex: string;
    sponsor: PicoLinkDirectSender;
  },
): Promise<PicoHomeDeviceLifecycleView> {
  return await readLifecycle(linkClient, input);
}

async function authorityCreationContext(input: AuthorityCreationInput): Promise<{
  now: Date;
  identity: PicoVaultDaemonUnlockedSessionDescriptor;
  targetSigning: PicoVaultDaemonUnlockedSessionDescriptor;
  targetAgreement: PicoVaultDaemonUnlockedSessionDescriptor;
  view: PicoHomeDeviceLifecycleView;
}> {
  const now = (input.now ?? (() => new Date()))();
  const [identity, targetStatus, view] = await Promise.all([
    identitySession(input.rootClient, input.identityKeyFingerprintHex),
    input.targetClient.status(),
    readLifecycle(input.sponsorLinkClient, input),
  ]);
  const targetSigning = requireSession(
    targetStatus.sessions,
    input.targetSigningKeyFingerprintHex,
    'device_signing',
    'target_signing_key_not_unlocked',
  );
  const targetAgreement = requireSession(
    targetStatus.sessions,
    input.targetKeyAgreementKeyFingerprintHex,
    'device_key_agreement',
    'target_agreement_key_not_unlocked',
  );
  return { now, identity, targetSigning, targetAgreement, view };
}

async function activateAndSubmit(
  input: AuthorityCreationInput,
  context: {
    now: Date;
    targetSigning: PicoVaultDaemonUnlockedSessionDescriptor;
    view: PicoHomeDeviceLifecycleView;
  },
  evidence: PicoHomeDeviceLifecycleEvidence,
): Promise<PicoHomeDeviceLifecycleCeremonyResult> {
  const activation: PicoHomeDeviceActivationSignatureInput = {
    suite: picoIdentitySuite,
    activationId: evidence.transitionId,
    action: evidence.action as 'enroll' | 'renew',
    homeId: context.view.homeId,
    hostSigningKeyFingerprintHex: input.sponsorLinkClient.hostSigningKeyFingerprintHex,
    picoIdentityFingerprintHex: evidence.picoIdentityFingerprintHex,
    sponsorDelegationId: input.sponsor.delegationId,
    sponsorDeviceSigningKeyFingerprintHex: input.sponsor.deviceSigningKeyFingerprintHex,
    sponsorDeviceKeyAgreementKeyFingerprintHex:
      input.sponsor.deviceKeyAgreementKeyFingerprintHex,
    targetDelegationId: evidence.targetDelegationId,
    targetDeviceSigningKeyFingerprintHex: evidence.targetDeviceSigningKeyFingerprintHex,
    targetDeviceKeyAgreementKeyFingerprintHex:
      evidence.targetDeviceKeyAgreementKeyFingerprintHex,
    lifecycleEvidenceDigestHex:
      picoHomeDeviceLifecycleEvidenceDigestHex(input.sodium, evidence),
    observedLifecycleOrder: evidence.observedLifecycleOrder,
    createdAt: context.now.toISOString(),
    expiresAt: new Date(context.now.getTime() + TARGET_ACTIVATION_LIFETIME_MS).toISOString(),
  };
  const targetSignatureHex = await signWithExactKey(input.targetClient, {
    keyFingerprintHex: context.targetSigning.keyFingerprintHex,
    keyRole: 'device_signing',
    label: picoHomeDeviceLifecycleCanonicalLabels.activation,
    fields: activation as unknown as Record<string, unknown>,
  });
  const submission: PicoHomeDeviceLifecycleSubmission = {
    schema: picoHomeDeviceLifecycleSubmissionSchema,
    evidence,
    activation: { input: activation, targetSignatureHex },
  };
  return {
    accepted: await submit(input.sponsorLinkClient, submission),
    submission,
  };
}

async function identitySession(
  client: PicoVaultDaemonClient,
  fingerprintHex: string,
): Promise<PicoVaultDaemonUnlockedSessionDescriptor> {
  const status = await client.status();
  return requireSession(
    status.sessions,
    fingerprintHex,
    'pico_identity',
    'lifecycle_identity_key_not_unlocked',
  );
}

async function readLifecycle(
  linkClient: PicoLinkDirectClient,
  input: {
    identityKeyFingerprintHex: string;
    sponsor: PicoLinkDirectSender;
  },
): Promise<PicoHomeDeviceLifecycleView> {
  const response = await linkClient.request('home.device.lifecycle.read', {});
  if (response.outcome !== 'ok') {
    throw new Error(`lifecycle_read_rejected:${response.outcome}`);
  }
  const view = parseLifecycleView(response.result);
  if (view.picoIdentityFingerprintHex !== input.identityKeyFingerprintHex) {
    throw new Error('lifecycle_identity_mismatch');
  }
  const sponsor = view.devices.find(
    (device) =>
      device.delegationId === input.sponsor.delegationId
      && device.deviceSigningKeyFingerprintHex
        === input.sponsor.deviceSigningKeyFingerprintHex
      && device.deviceKeyAgreementKeyFingerprintHex
        === input.sponsor.deviceKeyAgreementKeyFingerprintHex,
  );
  if (sponsor?.status !== 'active') {
    throw new Error('lifecycle_sponsor_is_not_active');
  }
  return view;
}

async function submit(
  linkClient: PicoLinkDirectClient,
  submission: PicoHomeDeviceLifecycleSubmission,
): Promise<Record<string, unknown>> {
  const response = await linkClient.request(
    'home.device.lifecycle.submit',
    { submission },
  );
  if (response.outcome !== 'ok') {
    throw new Error(`lifecycle_submit_rejected:${response.outcome}`);
  }
  return response.result;
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
    || !/^[0-9a-f]{128}$/.test(signed.signatureHex)
  ) {
    throw new Error('lifecycle_signer_mismatch');
  }
  return signed.signatureHex;
}

function parseLifecycleView(value: Record<string, unknown>): PicoHomeDeviceLifecycleView {
  if (
    typeof value.homeId !== 'string'
    || typeof value.picoIdentityFingerprintHex !== 'string'
    || typeof value.observedLifecycleOrder !== 'string'
    || !lifecycleOrderPattern.test(value.observedLifecycleOrder)
    || !Array.isArray(value.devices)
  ) {
    throw new Error('invalid_lifecycle_view');
  }
  const devices = value.devices.map((candidate): PicoHomeDeviceLifecycleDeviceView => {
    if (!isRecord(candidate)
      || typeof candidate.delegationId !== 'string'
      || typeof candidate.deviceSigningKeyFingerprintHex !== 'string'
      || typeof candidate.deviceKeyAgreementKeyFingerprintHex !== 'string'
      || typeof candidate.lifecycleOrder !== 'string'
      || typeof candidate.validUntil !== 'string'
      || !['active', 'not_yet_valid', 'expired', 'revoked'].includes(
        String(candidate.status),
      )) {
      throw new Error('invalid_lifecycle_view');
    }
    return candidate as unknown as PicoHomeDeviceLifecycleDeviceView;
  });
  return {
    homeId: value.homeId,
    picoIdentityFingerprintHex: value.picoIdentityFingerprintHex,
    observedLifecycleOrder: value.observedLifecycleOrder,
    devices,
  };
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

function keyRecord(
  session: PicoVaultDaemonUnlockedSessionDescriptor,
): PicoIdentityKeyRecordSignatureInput {
  return {
    suite: picoIdentitySuite,
    keyRole: session.keyRole,
    publicKeyHex: session.publicKeyHex,
  };
}

function nextLifecycleOrder(current: string, offset: bigint = 1n): string {
  const match = lifecycleOrderPattern.exec(current);
  if (match === null) {
    throw new Error('invalid_lifecycle_order');
  }
  const next = BigInt(match[1]) + offset;
  if (next > 9_999_999_999_999_999n) {
    throw new Error('lifecycle_order_exhausted');
  }
  return `seq:${next.toString().padStart(16, '0')}`;
}

function randomId(sodium: VaultSodium, prefix: string): string {
  return `${prefix}_${Buffer.from(sodium.randombytes_buf(16)).toString('hex')}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
