import { hasExactKeys, isHexOfBytes } from '@pico/protocol/canonical-bytes';
import { isPicoLifecycleOrder, nextPicoLifecycleOrder } from '@pico/protocol/lifecycle-order';
import {
  picoClockDivergenceKinds,
  picoHomeDeviceLifecycleCanonicalLabels,
  picoHomeDeviceLifecycleEvidenceDigestHex,
  picoHomeDeviceLifecycleSubmissionSchema,
  picoHomeDeviceRecoveryTiming,
  picoIdentitySignatureInputLabels,
  picoIdentitySuite,
  type PicoClockDivergence,
  type PicoClockDivergenceKind,
  type PicoHomeDeviceActivationAction,
  type PicoHomeDeviceActivationSignatureInput,
  type PicoHomeDeviceLifecycleEvidence,
  type PicoHomeDeviceLifecycleSubmission,
  type PicoHomeDeviceRecoveryPendingView,
  type PicoIdentityDelegationScope,
  type PicoIdentityDelegationSignatureInput,
  type PicoIdentityKeyRecordSignatureInput,
  type PicoIdentityRevocationReasonCategory,
  type PicoIdentityRevocationSignatureInput,
  type PicoHomeDeviceLifecycleDeviceView,
} from '@pico/protocol';

/**
 * ADR 0109 mit ADR 0085. Die Geräte-Ansicht wohnt seit dem 2026-08-26 im
 * Protokoll und wird hier nur weitergereicht.
 *
 * **Sie stand zweimal**: einmal hier als das, was ein Client liest, und
 * einmal in `apps/core` als das, was der Speicher berechnet. Dieselbe Form,
 * zwei Erklärungen - und sie sind auseinandergelaufen, als eine von beiden
 * ein Feld bekam. Die äußere Ansicht darf sich unterscheiden (der Home legt
 * Wartendes und Uhrabweichung darauf); ein Gerät ist auf beiden Seiten
 * dasselbe.
 */
export type { PicoHomeDeviceLifecycleDeviceView };
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


export interface PicoHomeDeviceLifecycleView {
  homeId: string;
  picoIdentityFingerprintHex: string;
  observedLifecycleOrder: string;
  devices: PicoHomeDeviceLifecycleDeviceView[];
  pendingRecovery: PicoHomeDeviceRecoveryPendingView | null;
  /**
   * ADR 0120 N5. Detected clock movement, when the Home reports any. Absent
   * on an older Home, which is not the same as "no movement" - it is simply a
   * Home that does not look.
   */
  clockDivergence?: PicoClockDivergence | null;
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

/**
 * ADR 0109 D3's target side, as a port rather than as a second daemon client.
 *
 * The target has to co-sign the Home activation with its own device key, and
 * that key never leaves the vault holding it. Where that vault is, is
 * transport: on this machine for the tool, and across a camera for a device
 * a person is holding up to another (ADR 0130 E3). The ceremony must not know
 * the difference - the signature is the same proof either way, and a ceremony
 * that could tell would eventually treat one of them as the lesser one.
 */
export interface PicoHomeDeviceTargetSigner {
  /** The exact keys the delegation will name, as the target's vault publishes them. */
  signing: PicoVaultDaemonUnlockedSessionDescriptor;
  keyAgreement: PicoVaultDaemonUnlockedSessionDescriptor;
  signActivation(
    activation: PicoHomeDeviceActivationSignatureInput,
  ): Promise<string>;
}

/**
 * The signer for a target vault this process can reach, which is what the
 * tool has and what the enrolment tests drive.
 */
export async function picoHomeDeviceTargetSignerFromVault(
  client: PicoVaultDaemonClient,
  input: {
    signingKeyFingerprintHex: string;
    keyAgreementKeyFingerprintHex: string;
  },
): Promise<PicoHomeDeviceTargetSigner> {
  const status = await client.status();
  const signing = requireSession(
    status.sessions,
    input.signingKeyFingerprintHex,
    'device_signing',
    'target_signing_key_not_unlocked',
  );
  const keyAgreement = requireSession(
    status.sessions,
    input.keyAgreementKeyFingerprintHex,
    'device_key_agreement',
    'target_agreement_key_not_unlocked',
  );
  return {
    signing,
    keyAgreement,
    signActivation: async (activation) => await signWithExactKey(client, {
      keyFingerprintHex: signing.keyFingerprintHex,
      keyRole: 'device_signing',
      label: picoHomeDeviceLifecycleCanonicalLabels.activation,
      fields: activation as unknown as Record<string, unknown>,
    }),
  };
}

interface AuthorityCreationInput extends LifecycleCeremonyBaseInput {
  target: PicoHomeDeviceTargetSigner;
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
    lifecycleOrder: nextPicoLifecycleOrder(context.view.observedLifecycleOrder),
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
    lifecycleOrder: nextPicoLifecycleOrder(context.view.observedLifecycleOrder),
  };
  const revocation: PicoIdentityRevocationSignatureInput = {
    suite: picoIdentitySuite,
    revocationId: randomId(input.sodium, 'revocation'),
    issuerIdentityKeyFingerprintHex: input.identityKeyFingerprintHex,
    subjectKind: 'delegation',
    subjectRef: input.replacedDelegationId,
    reasonCategory: 'key_rotated',
    revokedAt: context.now.toISOString(),
    lifecycleOrder: nextPicoLifecycleOrder(context.view.observedLifecycleOrder, 2n),
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
    lifecycleOrder: nextPicoLifecycleOrder(view.observedLifecycleOrder),
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
  /**
   * Sequential, and that is a requirement rather than a style choice. These
   * two talk to the vault - one asks it for the identity session, the other
   * signs a Link request - and a device where the root and the sponsor are
   * the same vault answers the second one with `client_request_in_flight`.
   * The tool has two connections and never noticed; a product device has one
   * (ADR 0130 E3), and a ceremony that only works when the caller happens to
   * hold two sockets is a ceremony with an undocumented requirement.
   */
  const identity = await identitySession(input.rootClient, input.identityKeyFingerprintHex);
  const view = await readLifecycle(input.sponsorLinkClient, input);
  /**
   * The roles are checked here rather than trusted from the port. A signer
   * built across a transport carries whatever the other end said it carries,
   * and a delegation naming a key-agreement key as a signing key would be a
   * device the Home can never hear from.
   */
  if (input.target.signing.keyRole !== 'device_signing') {
    throw new Error('target_signing_key_not_unlocked');
  }
  if (input.target.keyAgreement.keyRole !== 'device_key_agreement') {
    throw new Error('target_agreement_key_not_unlocked');
  }
  return {
    now,
    identity,
    targetSigning: input.target.signing,
    targetAgreement: input.target.keyAgreement,
    view,
  };
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
    action: evidence.action as PicoHomeDeviceActivationAction,
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
  const targetSignatureHex = await input.target.signActivation(activation);
  /**
   * Checked here as well as inside a vault-backed signer, because this is the
   * boundary a transport sits behind: what comes back over one is a string
   * somebody else produced, and the Home would refuse it later with a message
   * about bytes rather than about the device that did not answer properly.
   */
  if (!isHexOfBytes(targetSignatureHex, 64)) {
    throw new Error('target_activation_signature_malformed');
  }
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
    || !isHexOfBytes(signed.signatureHex, 64)
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
    || !isPicoLifecycleOrder(value.observedLifecycleOrder)
    || !Array.isArray(value.devices)
    || !('pendingRecovery' in value)
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
    pendingRecovery: parsePendingRecovery(value.pendingRecovery),
    ...(value.clockDivergence === undefined
      ? {}
      : { clockDivergence: parseClockDivergence(value.clockDivergence) }),
  };
}

/**
 * ADR 0120 N5. Strict: an unparseable report is refused rather than dropped,
 * because a silently discarded alarm is the outcome an attacker wants.
 */
function parseClockDivergence(value: unknown): PicoClockDivergence | null {
  if (value === null) {
    return null;
  }
  if (!isRecord(value)
    || typeof value.kind !== 'string'
    || !picoClockDivergenceKinds.includes(value.kind as PicoClockDivergenceKind)
    || typeof value.differenceMs !== 'number'
    || !Number.isFinite(value.differenceMs)
    || value.differenceMs < 0) {
    throw new Error('invalid_lifecycle_view');
  }
  return {
    kind: value.kind as PicoClockDivergenceKind,
    differenceMs: value.differenceMs,
  };
}

function parsePendingRecovery(
  value: unknown,
): PicoHomeDeviceRecoveryPendingView | null {
  if (value === null) {
    return null;
  }
  if (!isRecord(value) || !hasExactKeys(value, [
    'recoveryId',
    'claimDigestHex',
    'targetDelegationId',
    'targetDeviceSigningKeyFingerprintHex',
    'targetDeviceKeyAgreementKeyFingerprintHex',
    'acceptedAt',
    'effectiveAt',
    'completionExpiresAt',
  ])) {
    throw new Error('invalid_lifecycle_pending_recovery');
  }
  const pending = value as unknown as PicoHomeDeviceRecoveryPendingView;
  const acceptedAt = Date.parse(pending.acceptedAt);
  const effectiveAt = Date.parse(pending.effectiveAt);
  const completionExpiresAt = Date.parse(pending.completionExpiresAt);
  if (
    !/^[A-Za-z0-9._:/+-]{1,1024}$/u.test(pending.recoveryId)
    || !isHexOfBytes(pending.claimDigestHex, 32)
    || !/^[A-Za-z0-9._:/+-]{1,1024}$/u.test(pending.targetDelegationId)
    || !isHexOfBytes(pending.targetDeviceSigningKeyFingerprintHex, 32)
    || !isHexOfBytes(pending.targetDeviceKeyAgreementKeyFingerprintHex, 32)
    || !Number.isFinite(acceptedAt)
    || effectiveAt - acceptedAt !== picoHomeDeviceRecoveryTiming.vetoDelayMs
    || completionExpiresAt - effectiveAt
      !== picoHomeDeviceRecoveryTiming.completionWindowMs
  ) {
    throw new Error('invalid_lifecycle_pending_recovery');
  }
  return pending;
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

function randomId(sodium: VaultSodium, prefix: string): string {
  return `${prefix}_${Buffer.from(sodium.randombytes_buf(16)).toString('hex')}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

