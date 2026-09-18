import { isAsciiToken, isCanonicalHex, isHexOfBytes } from '@pico/protocol/canonical-bytes';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { narrowToOwner } from './database-file-mode.js';
import { assertPicoLifecycleOrder } from '@pico/protocol/lifecycle-order';
import {
  MAX_PICO_LINK_DIRECT_SEEN_REQUESTS,
  PicoLinkDirectSeenRequests,
} from './link-direct-seen-requests.js';
import { PicoModelProviderConsent, PicoModelProviderRegistry } from './model-provider-registry.js';
import { PicoModelJobQueue } from './model-job-queue.js';
import { PicoPresenceRegistry } from './presence-registry.js';
import {
  picoModuleConsentDrift,
  picoModuleConsentIsCurrent,
  picoModuleIdentifiers,
  type PicoModuleConsentDrift,
  type PicoModuleEffect,
  type PicoModuleIdentifier,
} from '@pico/protocol/module';
import {
  acceptPicoDepotOffer,
  assertPicoDepotFetchCondition,
  parsePicoDepotPin,
  picoDepotFetchPermission,
  picoDepotOffer,
  type PicoDepotFetchCondition,
  type PicoDepotFetchPermission,
  type PicoDepotOffer,
  type PicoDepotPin,
} from '@pico/protocol/depot';
import { picoGitCommitPattern } from '@pico/protocol/library-pin';
import {
  assertPicoLinkPushOccasion,
  type PicoLinkPushLedgerEntry,
  type PicoLinkPushOccasion,
} from './link-push-floor.js';
import { parsePicoLinkPacketAddress } from '@pico/protocol/link-packet';
import { assertPicoPlace, type PicoPlace } from '@pico/protocol/place';
import { parsePicoSupplierManifest } from '@pico/protocol/supplier';
import {
  maxPicoObservationAgeMs,
  parsePicoObservation,
  type PicoObservation,
  type PicoObservationKind,
} from '@pico/protocol/observation';
import type {
  FoundationEventType,
  PayloadPosture,
  PicoEvent,
  PicoEventAppendResult,
  PicoEventOriginClass,
  PicoHomeFirstDeviceEvidence,
  PicoHomeContinuityRecord,
  PicoHomeFoundingRecord,
  PicoHomeMembershipRole,
  PicoHomeMembershipScope,
  PicoHomeMembershipStatus,
  PicoHomeMembershipCredential,
  PicoHomeMembershipLifecycleRecord,
  PicoHomeDomainReadGrantLifecycleRecord,
  PicoHomeDomainReadGrantRecord,
  PicoHomeDeviceLifecycleDeviceView,
  PicoHomeDeviceLifecycleRecord,
  PicoHomeDeviceLifecycleSubmission,
  PicoHomeDeviceLifecycleReceiptSignatureInput,
  PicoHomeDeviceRecoveryPendingView,
  PicoHomeDeviceRecoveryPreparation,
  PicoHomeDeviceRecoveryRecord,
  PicoHomeDeviceRecoverySubmission,
  PicoHomeDeviceRecoveryReceiptSignatureInput,
  PicoIdentityKeyRecordSignatureInput,
  PicoIdentityRotationSignatureInput,
  PicoShareEnvelopeRecord,
} from '@pico/protocol';
import {
  isPicoInstant,
  evaluatePicoStorageCondition,
  hasPicoExposureWindowElapsed,
  hasPicoObjectionWindowElapsed,
  isPicoHomeAuditEventType,
  mayAppendUnderPicoStoragePressure,
  picoHomeAuditRecordDigestHex,
  type PicoDurableStore,
  type PicoStorageCondition,
  type PicoStoragePressureState,
} from '@pico/protocol';
import {
  buildPicoHomeDeviceActivationSignatureInput,
  buildPicoHomeDeviceLifecycleReceiptSignatureInput,
  buildPicoHomeDeviceRecoveryClaimSignatureInput,
  buildPicoHomeDeviceRecoveryPrepareSignatureInput,
  buildPicoHomeDeviceRecoveryReceiptSignatureInput,
  buildPicoShareEnvelopeSignatureInput,
  picoHomeDeviceLifecycleEvidenceDigestHex,
  picoHomeDeviceLifecycleRecordSchema,
  picoHomeDeviceLifecycleSubmissionDigestHex,
  picoHomeDeviceRecoveryClaimDigestHex,
  picoHomeDeviceRecoveryEvidenceDigestHex,
  picoHomeDeviceRecoveryRecordSchema,
  picoHomeDeviceRecoverySubmissionSchema,
  picoHomeDeviceRecoveryTiming,
  picoHomeDomainReadGrantLifecycleRecordSchema,
  picoHomeDomainReadGrantRecordSchema,
  picoHomeMembershipCredentialSchema,
  picoIdentityRootRotationTiming,
  picoIdentitySuite,
  type PicoHomeDeviceRecoveryPendingStatus,
  picoShareEnvelopeRecordSchema,
  picoShareSuite,
  payloadPostures,
  picoHomeClaimResponseRecordSchema,
  picoHomeFoundingRecordSchema,
  picoHomeMembershipRoles,
  picoHomeMembershipScopes,
  picoHomeMembershipStatuses,
} from '@pico/protocol';
import {
  listAppliedMigrations,
  runMigrations,
  runMigrationsWithBackup,
  type AppliedMigration,
  type MigrationDefinition,
} from './migrations.js';
import {
  parsePicoTimeBoundEntry,
  type PicoTimeBoundEntry,
} from '@pico/protocol/time-bound-entry';
import { PicoStoreRowCounter } from './store-row-counter.js';
import { MemoryStore } from './memory-store.js';
import { RetentionPolicyStore } from './retention-policy-store.js';
import { OperatorStore, type PasswordHashingSodium } from './operator-store.js';
import {
  verifyPicoHomeMembershipActivation,
  verifyPicoHomeMembershipAuthority,
  verifyPicoHomeMembershipLifecycleRecord,
  type PicoHomeMembershipVerificationFailure,
} from './home-membership.js';
import {
  createVerifiedPicoIdentityLifecycleIndex,
  comparePicoIdentityLifecycleOrder,
  verifyPicoHomeContinuityRecord,
  verifyPicoIdentityDetachedSignature,
  verifyPicoIdentityKeyRecordFingerprint,
  verifyPicoIdentityRotationSignatures,
  type IdentityVerificationSodium,
  type PicoIdentitySignedDelegation,
  type PicoIdentitySignedRevocation,
} from '@pico/identity';
import type { MemoryContentCrypto } from './memory-content-crypto.js';
import {
  defaultPicoHomeRecoveryAnchorPath,
  openPicoHomeRecoveryAnchor,
  type PicoHomeRecoveryAnchor,
} from './recovery-anchor.js';


/**
 * ADR 0120 N2. The durable floor, or `null` when no anchor is available -
 * which refuses every objection window rather than defaulting one open.
 */
function anchorFloorMs(anchor: PicoHomeRecoveryAnchor | undefined): number | null {
  const instant = anchor?.highWaterInstant();
  if (instant === undefined || instant === null) {
    return null;
  }
  const parsed = Date.parse(instant);
  return Number.isFinite(parsed) ? parsed : null;
}
import type { PicoRulesDecisionValue } from '@pico/protocol/pico-rules';
import type { PicoSupplierKind } from '@pico/protocol/supplier';
import type { SqliteBackupResult } from './sqlite-backup.js';
import {
  verifyPicoHomeDomainReadGrant,
  verifyPicoHomeDomainReadGrantLifecycle,
  type PicoHomeDomainReadGrantVerificationFailure,
} from './domain-read-grant.js';
import { ReaderCustodyStore } from './reader-custody.js';
import type { PicoIdentityReaderKeySelector } from './reader-key.js';

export const PICO_HOME_DEVICE_RECOVERY_DELAY_MS =
  picoHomeDeviceRecoveryTiming.vetoDelayMs;
export const PICO_HOME_DEVICE_RECOVERY_COMPLETION_WINDOW_MS =
  picoHomeDeviceRecoveryTiming.completionWindowMs;
export type AppendResult = PicoEventAppendResult;

export interface EventCursor {
  lamport: number;
  wallTime: string;
  eventId: string;
}

export interface EventListPage {
  events: PicoEvent[];
  nextCursor: EventCursor | null;
  hasMore: boolean;
}

export type PicoHomeClaimState =
  | {
    state: 'unclaimed';
    hostAdminPicoId: null;
    homeId: null;
    hostSigningKeyFingerprintHex: null;
    hostKeyAgreementKeyFingerprintHex: null;
    claimedAt: null;
    createdAt: string;
    updatedAt: string;
  }
  | {
    state: 'claimed';
    hostAdminPicoId: string;
    homeId: string | null;
    hostSigningKeyFingerprintHex: string | null;
    hostKeyAgreementKeyFingerprintHex: string | null;
    claimedAt: string;
    createdAt: string;
    updatedAt: string;
  };

export interface PicoHomeClaimInput {
  homeId: string;
  hostAdminPicoId: string;
  hostSigningKeyFingerprintHex: string;
  hostKeyAgreementKeyFingerprintHex: string;
  foundingRecord?: PicoHomeFoundingRecord;
  sodium?: IdentityVerificationSodium;
  claimedAt?: string;
}

export interface PicoHomeFoundingReconciliationResult {
  foundingRecordPresent: boolean;
  restoredClaimState: boolean;
}

export type PicoHomeFirstDeviceReconciliationResult =
  | { foundingRecordPresent: false; reconciled: false }
  | { foundingRecordPresent: true; reconciled: true }
  | { foundingRecordPresent: true; reconciled: false; reason: string };

export type PicoHomeMembershipSource = 'founding_record' | 'membership_credential';

export interface PicoHomeMembership {
  membershipId: string;
  homeId: string;
  picoIdentityFingerprintHex: string;
  role: PicoHomeMembershipRole;
  status: PicoHomeMembershipStatus;
  scopes: PicoHomeMembershipScope[];
  source: PicoHomeMembershipSource;
  sourceRef: string;
  validFrom: string;
  validUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PicoHomeMembershipReconciliationResult {
  foundingRecordPresent: boolean;
  restoredMembership: boolean;
}

export interface PicoHomeMembershipCredentialReconciliationResult {
  verifiedCredentials: number;
  droppedCredentials: number;
  projectedMemberships: number;
}

export type PicoHomeMembershipRecordResult =
  | { ok: true; membership: PicoHomeMembership }
  | { ok: false; reason: PicoHomeMembershipVerificationFailure | 'no_founding_record' | 'conflicting_record' };

export type PicoIdentityLifecycleEvidenceRecordResult =
  | { ok: true }
  | { ok: false; reason: 'conflicting_record' | 'invalid_identity_lifecycle_evidence' };

export type PicoIdentityReaderKeyRegistrationResult =
  | { ok: true; inserted: boolean }
  | {
    ok: false;
    reason:
      | 'identity_is_not_active_member'
      | 'invalid_reader_key'
      | 'inactive_reader_delegation'
      | 'conflicting_record';
  };

export interface PicoHomeDeviceLifecycleSponsor {
  picoIdentityFingerprintHex: string;
  deviceSigningKeyFingerprintHex: string;
  deviceKeyAgreementKeyFingerprintHex: string;
  delegationId: string;
}

export interface PicoHomeDeviceLifecycleView {
  homeId: string;
  picoIdentityFingerprintHex: string;
  observedLifecycleOrder: string;
  devices: PicoHomeDeviceLifecycleDeviceView[];
}

export type PicoHomeDeviceLifecycleRecordResult =
  | { ok: true; inserted: boolean; record: PicoHomeDeviceLifecycleRecord }
  | {
    ok: false;
    reason:
      | 'identity_is_not_active_member'
      | 'inactive_sponsor'
      | 'stale_lifecycle_head'
      | 'invalid_transition'
      | 'conflicting_record';
  };

export interface PicoHomeDeviceLifecycleReconciliationResult {
  verifiedTransitions: number;
  reprojectedTransitions: number;
  quarantinedIdentities: string[];
}

export type PicoHomeDeviceRecoveryInitiationResult =
  | {
    ok: true;
    status: 'pending' | 'superseded';
    pending: PicoHomeDeviceRecoveryPendingView;
  }
  | {
    ok: false;
    reason:
      | 'identity_is_not_active_member'
      | 'invalid_recovery'
      | 'stale_lifecycle_head'
      | 'active_delegation_not_covered'
      | 'recovery_id_reused'
      | 'recovery_anchor_unavailable'
      | 'conflicting_record';
  };

export type PicoHomeDeviceRecoveryPreparationResult =
  | {
    ok: true;
    view: PicoHomeDeviceLifecycleView;
  }
  | {
    ok: false;
    reason: 'recovery_prepare_unavailable' | 'invalid_recovery_prepare';
  };

export type PicoHomeDeviceRecoveryCompletionResult =
  | { ok: true; record: PicoHomeDeviceRecoveryRecord }
  | {
    ok: false;
    reason:
      | 'recovery_unavailable'
      | 'recovery_superseded'
      | 'recovery_vetoed'
      | 'recovery_lapsed'
      | 'recovery_consumed'
      | 'recovery_not_effective'
      | 'stale_lifecycle_head'
      | 'invalid_recovery'
      | 'recovery_anchor_unavailable'
      | 'conflicting_record';
  };

export type PicoHomeDeviceRecoveryVetoResult =
  | { ok: true }
  | {
    ok: false;
    reason:
      | 'recovery_not_found'
      | 'recovery_not_pending'
      | 'identity_mismatch'
      | 'recovery_anchor_unavailable';
  };

// ADR 0114 T1. Named here so the Home's callers keep their word, but the value
// is the protocol's: the rotation inherits ADR 0110's veto delay rather than
// setting one of its own.
export const PICO_IDENTITY_ROOT_ROTATION_VETO_WINDOW_MS =
  picoIdentityRootRotationTiming.vetoDelayMs;

/**
 * ADR 0114 T3. The device the successor root will hold once the rotation is
 * effective. It is named at submission, not afterwards, so the devices that
 * may veto see the whole consequence - which root, and which device it
 * leaves - while they still can object.
 */
export interface PicoIdentityRotationSuccessorFirstDevice {
  delegation: PicoIdentitySignedDelegation;
  deviceKeyAgreementKeyRecord: PicoIdentityKeyRecordSignatureInput;
}

/**
 * Where an identity-root rotation stands. The database says the same three
 * words in a CHECK constraint on `pico_identity_root_rotation.status`; until
 * 2026-09-17 this vocabulary was written out inline at each of its four uses
 * in this file and had no name, so nothing compared the copies (B185).
 */
export const picoIdentityRootRotationStatuses = [
  'pending',
  'vetoed',
  'effective',
] as const;

export type PicoIdentityRootRotationStatus =
  typeof picoIdentityRootRotationStatuses[number];

export interface PicoIdentityRootRotationView {
  rotationId: string;
  predecessorIdentityFingerprintHex: string;
  successorIdentityFingerprintHex: string;
  status: PicoIdentityRootRotationStatus;
  reasonCategory: string;
  rotatedAt: string;
  acceptedAt: string;
  effectiveAt: string;
  coSigningDelegationId: string;
  successorFirstDeviceDelegationId: string;
  successorFirstDeviceSigningKeyFingerprintHex: string;
  successorFirstDeviceKeyAgreementKeyFingerprintHex: string;
  successorFirstDeviceProjectedAt: string | null;
}

/**
 * ADR 0114 T3. What an effective rotation still owes the person, per issuer.
 * Nothing here is rebound by the Home: the successor is eligible, and each
 * issuer re-issues its own records. Making the debt visible is what keeps
 * "you wait for your issuers" an honest statement instead of a silence.
 */
export interface PicoIdentityRotationDebtView {
  rotationId: string;
  predecessorIdentityFingerprintHex: string;
  successorIdentityFingerprintHex: string;
  status: PicoIdentityRootRotationStatus;
  effectiveAt: string;
  successorFirstDevice: {
    delegationId: string;
    deviceSigningKeyFingerprintHex: string;
    delegated: boolean;
    readerKeyRegistered: boolean;
  };
  membershipsToReissue: {
    membershipId: string;
    homeId: string;
    role: string;
    validUntil: string | null;
  }[];
  readGrantsToReissue: {
    grantId: string;
    privacyDomain: string;
    controllerPicoIdentityFingerprintHex: string;
    validUntil: string;
  }[];
}

export type PicoIdentityRootRotationSubmissionResult =
  | { ok: true; rotation: PicoIdentityRootRotationView }
  | {
    ok: false;
    reason:
      | 'identity_is_not_active_member'
      | 'invalid_rotation'
      | 'founder_root_rotation_unsupported'
      | 'rotation_id_reused'
      | 'rotation_already_pending'
      | 'predecessor_already_rotated'
      | 'co_signing_device_not_active'
      | 'invalid_successor_first_device'
      | 'conflicting_record';
  };

export type PicoIdentityRootRotationVetoResult =
  | { ok: true }
  | {
    ok: false;
    reason:
      | 'rotation_not_found'
      | 'rotation_not_pending'
      | 'identity_mismatch'
      | 'veto_requires_another_device';
  };

export interface PicoIdentityRootRotationReconciliationResult {
  verifiedRotations: number;
  effectiveRotations: number;
  projectedSuccessorDevices: number;
  /** Rotations accepted by a different Home; they decide nothing here. */
  foreignRotations: number;
  quarantinedIdentities: string[];
}

export interface PicoHomeHostContinuityLinkView {
  continuityId: string;
  chainPosition: number;
  outgoingHostSigningKeyFingerprintHex: string;
  outgoingHostKeyAgreementKeyFingerprintHex: string;
  incomingHostSigningKeyFingerprintHex: string;
  incomingHostKeyAgreementKeyFingerprintHex: string;
  reasonCategory: string;
  changedAt: string;
  lifecycleOrder: string;
  acceptedAt: string;
}

export interface PicoHomeHostKeyHead {
  hostSigningKeyFingerprintHex: string;
  hostKeyAgreementKeyFingerprintHex: string;
}

export type PicoHomeHostContinuityRecordResult =
  | { ok: true; inserted: boolean; link: PicoHomeHostContinuityLinkView }
  | {
    ok: false;
    reason:
      | 'no_founding_record'
      | 'foreign_home'
      | 'invalid_continuity'
      | 'chain_gap'
      | 'stale_lifecycle_order'
      | 'recovery_pending'
      | 'conflicting_record';
  };

export interface PicoHomeHostContinuityReconciliationResult {
  verifiedLinks: number;
  droppedLinks: number;
  repairedClaimState: boolean;
  currentHostSigningKeyFingerprintHex: string | null;
}

export interface PicoHomeDeviceRecoveryReconciliationResult {
  verifiedRecoveries: number;
  reprojectedRecoveries: number;
  lapsedPending: number;
  quarantinedIdentities: string[];
  /**
   * ADR 0110 R6. `seeded` is a fresh Home taking ownership of an empty anchor;
   * `anchor_lost` is a Home with recovery history whose anchor is gone, which
   * is indistinguishable from a rollback and therefore fails closed until an
   * operator re-seeds; `rollback_detected` means the anchor knows resolutions
   * the database no longer carries.
   */
  anchorStatus: 'live' | 'seeded' | 'anchor_lost' | 'rollback_detected' | 'absent';
  /** Recovery ids the anchor resolved but the database still shows unresolved. */
  resurrectedRecoveryIds: string[];
}

export interface PicoHomeDeviceLifecycleSodium extends IdentityVerificationSodium {
  crypto_generichash(
    hashLength: number,
    message: Uint8Array | string,
    key?: Uint8Array | string | null,
  ): Uint8Array;
}

export interface PicoIdentityReaderKeyCandidate {
  homeId: string;
  picoIdentityFingerprintHex: string;
  deviceSigningKeyFingerprintHex: string;
  deviceKeyAgreementKeyFingerprintHex: string;
  deviceKeyAgreementKeyRecord: PicoIdentityKeyRecordSignatureInput;
  delegationId: string;
  delegationLifecycleOrder: string;
  locallyObservedThroughLifecycleOrder: string;
  validUntil: string;
}

export interface PicoShareEnvelopeStoredRecord {
  issuanceId: string;
  delegationId: string;
  record: PicoShareEnvelopeRecord;
}

export interface PicoShareEnvelopeReference {
  grantId: string;
  privacyDomain: string;
  readerKeyFingerprintHex: string;
  kekVersion: number;
}

export type PicoShareEnvelopeRecordResult =
  | { ok: true; inserted: boolean; envelope: PicoShareEnvelopeStoredRecord }
  | {
    ok: false;
    reason:
      | 'invalid_envelope'
      | 'inactive_grant'
      | 'reader_key_is_not_locally_eligible'
      | 'conflicting_record';
  };

export interface PicoShareEnvelopeVerificationSodium extends IdentityVerificationSodium {
  crypto_generichash(
    hashLength: number,
    message: Uint8Array | string,
    key?: Uint8Array | string | null,
  ): Uint8Array;
}

export interface PicoHomeDomainReadGrantView {
  grantId: string;
  homeId: string;
  privacyDomain: string;
  controllerPicoIdentityFingerprintHex: string;
  readerPicoIdentityFingerprintHex: string;
  status: 'active' | 'not_yet_valid' | 'expired' | 'revoked';
  validFrom: string;
  validUntil: string;
  lifecycleOrder: string;
  createdAt: string;
}

export type PicoHomeDomainReadGrantRecordResult =
  | { ok: true; inserted: boolean; grant: PicoHomeDomainReadGrantView }
  | {
    ok: false;
    reason: PicoHomeDomainReadGrantVerificationFailure
      | 'no_founding_record'
      | 'conflicting_record'
      | 'reader_is_not_active_member'
      | 'domain_is_not_host_custody';
  };

export interface EventStoreOpenOptions {
  backupDirectory?: string;
  requireBackupBeforeMigration?: boolean;
  createBackup?: (databasePath: string, backupDirectory: string) => Promise<SqliteBackupResult>;
  migrationDefinitions?: readonly MigrationDefinition[];
  /** Optional provider that lets {@link EventStore.memory} encrypt/decrypt domain_encrypted items (ADR 0071). */
  memoryCrypto?: MemoryContentCrypto;
  /** ADR 0110 R6; defaults to the filesystem anchor beside the database. */
  recoveryAnchor?: PicoHomeRecoveryAnchor;
  /**
   * ADR 0121 J1. The hash the audit chain is built with. Absent leaves the
   * chain unwritten, which is a coverage gap the read surface reports rather
   * than a silent claim of integrity.
   */
  auditSodium?: PicoAuditSodium;
  /**
   * ADR 0119 Q1. How much room is left. Absent means the store does not
   * evaluate pressure at all, which is the development-host posture the ADR
   * explicitly scopes itself against.
   */
  availableBytes?: () => number;
  /** ADR 0119 Q1. Deployment property; defaults to the conservative floor. */
  storageReserveBytes?: number;
  /** ADR 0119 Q5. Per-store row ceilings; defaults are the conservative ones. */
  storeCeilingRows?: Partial<Record<PicoDurableStore, number>>;
}

interface EventStoreConstructorOptions {
  runMigrations?: boolean;
  migrationDefinitions?: readonly MigrationDefinition[];
  memoryCrypto?: MemoryContentCrypto;
  /**
   * ADR 0110 R6. Kept outside every restorable Foundation snapshot, so a
   * restored database cannot resurrect a spent recovery. `EventStore.open`
   * supplies the filesystem anchor by default; a store constructed directly
   * without one refuses every recovery decision rather than silently allowing
   * what the anchor exists to refuse.
   */
  recoveryAnchor?: PicoHomeRecoveryAnchor;
  /** ADR 0121 J1. See {@link EventStoreOpenOptions.auditSodium}. */
  auditSodium?: PicoAuditSodium;
  /** ADR 0119 Q1. See {@link EventStoreOpenOptions.availableBytes}. */
  availableBytes?: () => number;
  /** ADR 0119 Q1. See {@link EventStoreOpenOptions.storageReserveBytes}. */
  storageReserveBytes?: number;
  /** ADR 0119 Q5. See {@link EventStoreOpenOptions.storeCeilingRows}. */
  storeCeilingRows?: Partial<Record<PicoDurableStore, number>>;
}

/** ADR 0121 J2/J4. What one writer's chain actually covers. */
export interface PicoAuditWriterVerification {
  writerId: string;
  recordCount: number;
  /** Present when a link failed; the range from here on is not covered. */
  brokenAtPosition?: number;
  /** Present when the anchor holds a checkpoint for this writer. */
  checkpointedPosition?: number;
  status: 'verified' | 'broken' | 'rolled_back' | 'unanchored';
}

export interface PicoAuditChainVerification {
  writers: PicoAuditWriterVerification[];
  /** False when no hash was supplied, so nothing was chained at all. */
  chained: boolean;
}

/** ADR 0121 J1. Just the hash the canonical digest needs, nothing else. */
export interface PicoAuditSodium {
  crypto_generichash(length: number, message: Uint8Array, key: null): Uint8Array;
}

/**
 * ADR 0139's five facts, as the event types a history view reads. The list is
 * here rather than derived from `actionEventTypes` because that list also
 * holds `approval.requested`, and a history is a record of what happened
 * rather than of what was asked - the asking is a fact too, so it is included
 * deliberately rather than by accident.
 */
export const picoActionHistoryFactTypes = [
  'action.requested',
  'pico_rules.decision_created',
  'approval.requested',
  'approval.resolved',
  'action_runner.action_started',
  'action_runner.action_completed',
] as const;

export type PicoActionHistoryFactType = typeof picoActionHistoryFactTypes[number];

export interface PicoActionHistoryRecord {
  eventId: string;
  type: PicoActionHistoryFactType;
  occurredAt: string;
  payload: Record<string, unknown>;
  /** ADR 0121: whether this fact carries a chain record. Reported, never assumed. */
  chained: boolean;
  writerId?: string;
  chainPosition?: number;
}

/**
 * ADR 0143 DP1. A depot and the commit it runs at.
 *
 * No privacy domain, which is ADR 0143 DP6 rather than an omission: a depot
 * produces nothing, so it has nothing to place, and its suppliers each land in
 * exactly one Private Space of their own.
 */
export interface PicoDepotAttachment {
  pin: PicoDepotPin;
  acceptedAt: string;
  /**
   * ADR 0143 DP1. Who accepted it, when the row knows.
   *
   * Absent on every attachment made before the column existed, and absent is
   * a fact rather than a default: it means nobody can be attributed, so
   * nothing that needs attribution runs.
   */
  acceptedBy?: string;
  /** ADR 0138 CO3. May Pico fetch this depot at all? Default off. */
  mayFetch: boolean;
  /** ADR 0138 CO4. May Pico fetch it without being asked? Default off. */
  mayFetchUnasked: boolean;
  /**
   * ADR 0143 DP1. A newer commit a fetch saw and nobody has answered.
   *
   * Absent means there is nothing waiting. It is what a *fetch learned*, not
   * what a person decided - the pin above is the decision, and this changes
   * nothing about what runs until someone accepts it.
   */
  offeredCommit?: string;
  /** ADR 0138 CO2. Set when the last attempt did not succeed; cleared when one does. */
  lastFetchCondition?: PicoDepotFetchCondition;
  /** When that attempt was. "Could not reach it" reads differently at four minutes and four weeks. */
  lastFetchAt?: string;
}

/** ADR 0148 EX5. One device's exchanged mailbox addresses, with the delegation they were proved by. */
export interface PicoLinkMailboxRecord {
  deviceSigningKeyFingerprintHex: string;
  picoIdentityFingerprintHex: string;
  deviceKeyAgreementKeyFingerprintHex: string;
  delegationId: string;
  /** Issued by this Home; the device sends here. */
  homeInbound: string;
  /** Issued by the device; this Home sends here. */
  deviceInbound: string;
  exchangedAt: string;
}

export interface PicoSupplierAttachment {
  identifier: string;
  kind: PicoSupplierKind;
  slots: readonly string[];
  coverage: readonly string[];
  /** ADR 0137 IN5. Exactly one, and never a Pico. */
  privacyDomain: string;
  /** ADR 0138 CO3. Default off. */
  mayReachOutside: boolean;
  /** ADR 0138 CO4. Default off, and never implied by CO3. */
  mayReachUnasked: boolean;
  /** ADR 0138 CO1. `read` for a library, always. Absent means none is needed. */
  credentialScope?: 'read' | 'read_write';
  /** ADR 0138 CO1/CO2. Whether one exists - never the secret itself. */
  credentialPresent: boolean;
  attachedAt: string;
}

export class EventStore {
  private readonly db: Database.Database;
  private readonly memoryCrypto?: MemoryContentCrypto;
  private readonly recoveryAnchor?: PicoHomeRecoveryAnchor;
  private readonly auditSodium?: PicoAuditSodium;
  private readonly availableBytes?: () => number;
  private readonly storageReserveBytes?: number;
  private readonly rowCounter: PicoStoreRowCounter;
  private closed = false;

  public static async open(databasePath: string, options: EventStoreOpenOptions = {}): Promise<EventStore> {
    const store = new EventStore(databasePath, {
      runMigrations: false,
      memoryCrypto: options.memoryCrypto,
      ...(options.auditSodium === undefined
        ? {}
        : { auditSodium: options.auditSodium }),
      ...(options.availableBytes === undefined
        ? {}
        : { availableBytes: options.availableBytes }),
      ...(options.storageReserveBytes === undefined
        ? {}
        : { storageReserveBytes: options.storageReserveBytes }),
      ...(options.storeCeilingRows === undefined
        ? {}
        : { storeCeilingRows: options.storeCeilingRows }),
      recoveryAnchor: options.recoveryAnchor
        ?? openPicoHomeRecoveryAnchor(
          defaultPicoHomeRecoveryAnchorPath(databasePath),
        ),
    });

    try {
      await runMigrationsWithBackup(store.db, {
        databasePath,
        backupDirectory: options.backupDirectory ?? defaultBackupDirectory(databasePath),
        requireBackupBeforeMigration: options.requireBackupBeforeMigration ?? true,
        createBackup: options.createBackup,
        migrationDefinitions: options.migrationDefinitions,
      });
    } catch (error) {
      store.close();
      throw error;
    }

    // Enforce recorded deletions on boot so a restore that resurrected deleted
    // memory items as active is re-tombstoned (ADR 0070 recovery direction).
    store.reconcileMemoryTombstones();
    // Enforce ADR 0080 H8: a restored stale claim-state row must not reopen
    // Setup Mode while a founding record is present.
    store.reconcilePicoHomeFoundingEvidence();
    // Enforce the first ADR 0080 M3 membership projection: the founding record
    // is also the Home Host Pico's active membership root.
    store.reconcilePicoHomeMembershipsFromFoundingEvidence();

    return store;
  }

  public constructor(databasePath: string, options: EventStoreConstructorOptions = {}) {
    mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 });
    this.db = new Database(databasePath);
    this.db.pragma('journal_mode = WAL');
    /**
     * ADR 0121. Said rather than inherited (2026-09-18, finding B200).
     *
     * This schema declares exactly one referential constraint in 52 tables -
     * `pico_audit_record.event_id REFERENCES pico_event (event_id)` - and it
     * sits where nothing may lie: an audit record pointing at an event that is
     * not there would be a chain claiming coverage it does not have.
     *
     * SQLite's own default for this pragma is *off*. It held anyway, and the
     * reason is one layer below the driver: the bundled SQLite (3.49.2) is
     * **compiled** with `SQLITE_DEFAULT_FOREIGN_KEYS`, which `PRAGMA
     * compile_options` reports. The guarantee rested on a `-D` flag in a
     * dependency's build script, which nobody here is holding - so it is said
     * here and walked by a test that plants a dangling record.
     *
     * The relay store deliberately does not do this: it declares no
     * `REFERENCES` at all, and a pragma with nothing to enforce is a checker
     * without a subject.
     */
    this.db.pragma('foreign_keys = ON');
    /**
     * ADR 0070, and the measurement that made it necessary (2026-09-18,
     * finding B203).
     *
     * **Every way this product forgets clears a column in place.**
     * `deleteInDomain` sets `content = NULL` and keeps the row so the store can
     * still answer what became of a reference; `forgetRecall` and
     * `forgetDomainRecalls` set `job_json = '{}'` with the result and the
     * recall context beside it. Four sites, all of them person content - what
     * somebody wrote down, and what they said to a model.
     *
     * With SQLite's default (`secure_delete` off), the old bytes stay in the
     * page until something overwrites them. Measured through this store's own
     * API: sixty items with a distinctive sentence, all deleted, the store
     * closed - and the sentence was still in the file sixty-one times. Only a
     * `VACUUM` removed it, and nothing here ever runs one.
     *
     * ADR 0070's core rule says deletion is storage removal and *backups* may
     * retain plaintext. It does not say the live database does, and a person
     * reading it would not expect that.
     *
     * The pragma is a property of the connection and covers all four sites at
     * once. Measured at 200 and 800 deletes of 3 kB, over seven runs a side, it
     * is not slower - it came out 5 to 15 percent faster, which is within the
     * shape of doing less page shuffling rather than a claim about speed.
     */
    this.db.pragma('secure_delete = ON');
    narrowToOwner(databasePath);
    this.memoryCrypto = options.memoryCrypto;
    this.recoveryAnchor = options.recoveryAnchor;
    this.auditSodium = options.auditSodium;
    this.availableBytes = options.availableBytes;
    this.storageReserveBytes = options.storageReserveBytes;
    this.rowCounter = new PicoStoreRowCounter(this.db, options.storeCeilingRows ?? {});

    if (options.runMigrations !== false) {
      runMigrations(this.db, {
        migrationDefinitions: options.migrationDefinitions,
      });
    }
  }

  public append(event: PicoEvent): AppendResult {
    this.ensureOpen();
    assertStoredEvent(event);

    // ADR 0119 Q1/Q2. Creating writes fail closed under pressure so the
    // protective paths keep the room they need to commit and checkpoint. A
    // full disk that blocks a revocation has turned a resource problem into a
    // security problem.
    if (!mayAppendUnderPicoStoragePressure({
      state: this.storagePressure(),
      eventType: event.type,
    })) {
      return 'refused_storage_pressure';
    }

    const payloadJson = serializePayload(event.payload);
    const existing = this.db
      .prepare('SELECT * FROM pico_event WHERE event_id = ?')
      .get(event.eventId) as EventRow | undefined;

    if (existing) {
      return isSameStoredEvent(existing, event, payloadJson) ? 'duplicate_same_payload' : 'duplicate_conflict';
    }

    const statement = this.db.prepare(`
      INSERT INTO pico_event (
        event_id,
        device_id,
        session_id,
        lamport,
        wall_time,
        type,
        stream,
        payload_json,
        signature,
        payload_posture,
        origin,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // ADR 0121 J1. The row and its link commit together. A chain that could
    // be written a moment later would have a window in which the record exists
    // unlinked, and an attacker who can pick that moment gets a free deletion.
    const insert = this.db.transaction((): void => {
      statement.run(
        event.eventId,
        event.deviceId,
        event.sessionId ?? null,
        event.lamport,
        event.wallTime,
        event.type,
        event.stream,
        payloadJson,
        event.signature ?? null,
        event.payloadPosture ?? null,
        event.origin ?? null,
        new Date().toISOString(),
      );
      this.chainAuditRecord(event);
    });
    insert();

    // ADR 0119 Q5. Counted after the transaction commits, so a rolled-back
    // insert never inflates the ceiling.
    this.rowCounter.recordInsert('event_log');

    return 'inserted';
  }

  /**
   * ADR 0121 J1. Links one audit record to its predecessor in this writer's
   * sequence. The writer is the event's own device: each instance attests only
   * "this is the sequence I wrote", because ADR 0014's log is designed to
   * become replicated and a global chain would assert a single writer.
   */
  private chainAuditRecord(event: PicoEvent): void {
    if (this.auditSodium === undefined || !isPicoHomeAuditEventType(event.type)) {
      return;
    }
    const head = this.db
      .prepare(`
        SELECT chain_position AS chainPosition, digest_hex AS digestHex
        FROM pico_audit_record
        WHERE writer_id = ?
        ORDER BY chain_position DESC
        LIMIT 1
      `)
      .get(event.deviceId) as
      { chainPosition: number; digestHex: string } | undefined;

    const chainPosition = (head?.chainPosition ?? 0) + 1;
    const previousDigestHex = head?.digestHex ?? null;
    const digestHex = picoHomeAuditRecordDigestHex(this.auditSodium, {
      writerId: event.deviceId,
      chainPosition,
      eventId: event.eventId,
      eventType: event.type as FoundationEventType,
      occurredAt: event.wallTime,
      previousDigestHex,
    });
    this.db
      .prepare(`
        INSERT INTO pico_audit_record (
          event_id, writer_id, chain_position,
          previous_digest_hex, digest_hex, recorded_at
             ) VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(
        event.eventId,
        event.deviceId,
        chainPosition,
        previousDigestHex,
        digestHex,
        new Date().toISOString(),
      );
    // ADR 0119 Q5.
    this.rowCounter.recordInsert('audit_record');

    // ADR 0121 J2. The head goes where a restore cannot reach. Recorded after
    // the row so the anchor never claims a head the database does not have;
    // the reverse would make an honest log look rolled back.
    this.recoveryAnchor?.recordAuditCheckpoint({
      writerId: event.deviceId,
      chainPosition,
      headDigestHex: digestHex,
    });
  }

  public list(limit = 100): PicoEvent[] {
    return this.listPage({ limit }).events;
  }

  public listPage(options: { limit?: number; after?: EventCursor | null } = {}): EventListPage {
    this.ensureOpen();
    const limit = options.limit ?? 100;
    assertListLimit(limit);

    const rows = this.selectPageRows(limit + 1, options.after ?? null);
    const pageRows = rows.slice(0, limit);
    const events = pageRows.map((row) => this.mapRow(row));
    const lastEvent = events.at(-1) ?? null;

    return {
      events,
      nextCursor: lastEvent === null ? null : {
        lamport: lastEvent.lamport,
        wallTime: lastEvent.wallTime,
        eventId: lastEvent.eventId,
      },
      hasMore: rows.length > limit,
    };
  }

  public listTail(limit = 100): EventListPage {
    this.ensureOpen();
    assertListLimit(limit);

    const rows = this.selectTailRows(limit + 1);
    const pageRows = rows.slice(0, limit).reverse();

    return {
      events: pageRows.map((row) => this.mapRow(row)),
      nextCursor: null,
      hasMore: rows.length > limit,
    };
  }

  public maxLamport(): number {
    this.ensureOpen();

    const row = this.db.prepare('SELECT MAX(lamport) AS max_lamport FROM pico_event').get() as { max_lamport: number | null };
    return row.max_lamport ?? 0;
  }

  public appliedMigrations(): AppliedMigration[] {
    this.ensureOpen();

    return listAppliedMigrations(this.db);
  }

  public picoHomeClaimState(): PicoHomeClaimState {
    this.ensureOpen();

    const row = this.db
      .prepare(`
        SELECT
          state,
          host_admin_pico_id AS hostAdminPicoId,
          ${columnExists(this.db, 'pico_home_claim_state', 'home_id') ? 'home_id' : 'NULL'} AS homeId,
          ${columnExists(this.db, 'pico_home_claim_state', 'host_signing_key_fingerprint_hex') ? 'host_signing_key_fingerprint_hex' : 'NULL'} AS hostSigningKeyFingerprintHex,
          ${columnExists(this.db, 'pico_home_claim_state', 'host_key_agreement_key_fingerprint_hex') ? 'host_key_agreement_key_fingerprint_hex' : 'NULL'} AS hostKeyAgreementKeyFingerprintHex,
          claimed_at AS claimedAt,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM pico_home_claim_state
        WHERE id = 1
      `)
      .get() as PicoHomeClaimStateRow | undefined;

    if (row === undefined) {
      throw new Error('Pico Home claim state is missing.');
    }

    return mapPicoHomeClaimState(row);
  }

  public picoHomeFoundingRecord(): PicoHomeFoundingRecord | undefined {
    this.ensureOpen();

    if (!tableExists(this.db, 'pico_home_founding_record')) {
      return undefined;
    }

    const row = this.db
      .prepare(`
        SELECT
          schema,
          founding_id AS foundingId,
          home_id AS homeId,
          claim_id AS claimId,
          home_host_pico_identity_fingerprint_hex AS homeHostPicoIdentityFingerprintHex,
          host_signing_key_fingerprint_hex AS hostSigningKeyFingerprintHex,
          host_key_agreement_key_fingerprint_hex AS hostKeyAgreementKeyFingerprintHex,
          founded_at AS foundedAt,
          lifecycle_order AS lifecycleOrder,
          claim_response_json AS claimResponseJson,
          founding_json AS foundingJson,
          claimant_identity_key_record_json AS claimantIdentityKeyRecordJson,
          claimant_founding_signature_hex AS claimantFoundingSignatureHex,
          host_claim_response_signature_hex AS hostClaimResponseSignatureHex,
          host_founding_signature_hex AS hostFoundingSignatureHex,
          first_device_evidence_json AS firstDeviceEvidenceJson,
          created_at AS createdAt
        FROM pico_home_founding_record
        WHERE id = 1
      `)
      .get() as PicoHomeFoundingRecordRow | undefined;

    return row === undefined ? undefined : mapPicoHomeFoundingRecord(row);
  }

  public picoHomeMemberships(): PicoHomeMembership[] {
    this.ensureOpen();

    if (!tableExists(this.db, 'pico_home_membership')) {
      return [];
    }

    return this.db
      .prepare(`
        SELECT ${picoHomeMembershipColumns}
        FROM pico_home_membership
        ORDER BY home_id ASC, role ASC, pico_identity_fingerprint_hex ASC
      `)
      .all()
      .map((row) => mapPicoHomeMembership(row as PicoHomeMembershipRow));
  }

  /**
   * Membership is always scoped to one Home. Without an explicit `homeId` the
   * currently claimed Home is used; an unclaimed Home has no member, so this
   * fails closed rather than accepting a membership row for any other Home.
   */
  public hasActivePicoHomeMembership(
    picoIdentityFingerprintHex: string,
    homeId?: string,
    at: string = new Date().toISOString(),
  ): boolean {
    this.ensureOpen();
    assertFingerprint(picoIdentityFingerprintHex, 'picoIdentityFingerprintHex');
    if (homeId !== undefined) {
      assertAsciiToken(homeId, 'homeId');
    }

    if (!tableExists(this.db, 'pico_home_membership')) {
      return false;
    }

    // An expired credential is not an active membership. The stored status
    // cannot express that on its own - expiry is a function of the clock, not
    // of a statement - so the window is part of the question, not a later sweep.
    const scopedHomeId = homeId ?? this.picoHomeClaimState().homeId ?? undefined;
    if (scopedHomeId === undefined) {
      return false;
    }

    const row = this.db
      .prepare(`
        SELECT 1 AS present
        FROM pico_home_membership
        WHERE home_id = ?
          AND pico_identity_fingerprint_hex = ?
          AND status = 'active'
          AND valid_from <= ?
          AND (valid_until IS NULL OR valid_until > ?)
        LIMIT 1
      `)
      .get(scopedHomeId, picoIdentityFingerprintHex, at, at) as { present: 1 } | undefined;

    return row !== undefined;
  }

  public claimPicoHome(input: PicoHomeClaimInput): PicoHomeClaimState {
    this.ensureOpen();
    assertAsciiToken(input.homeId, 'homeId');
    assertAsciiToken(input.hostAdminPicoId, 'hostAdminPicoId');
    assertFingerprint(input.hostSigningKeyFingerprintHex, 'hostSigningKeyFingerprintHex');
    assertFingerprint(input.hostKeyAgreementKeyFingerprintHex, 'hostKeyAgreementKeyFingerprintHex');
    if (input.foundingRecord !== undefined) {
      assertPicoHomeFoundingRecord(input.foundingRecord, input);
    }
    if (input.claimedAt !== undefined) {
      assertNonEmptyString(input.claimedAt, 'claimedAt');
    }

    const claimedAt = input.claimedAt ?? input.foundingRecord?.founding.foundedAt ?? new Date().toISOString();
    const claim = this.db.transaction(() => {
      const result = this.db
        .prepare(`
          UPDATE pico_home_claim_state
          SET state = ?,
              host_admin_pico_id = ?,
              home_id = ?,
              host_signing_key_fingerprint_hex = ?,
              host_key_agreement_key_fingerprint_hex = ?,
              claimed_at = ?,
              updated_at = ?
          WHERE id = 1 AND state = 'unclaimed'
        `)
        .run(
          'claimed',
          input.hostAdminPicoId,
          input.homeId,
          input.hostSigningKeyFingerprintHex,
          input.hostKeyAgreementKeyFingerprintHex,
          claimedAt,
          claimedAt,
        );

      if (result.changes !== 1) {
        throw new Error('Pico Home is already claimed.');
      }

      if (input.foundingRecord !== undefined) {
        this.insertPicoHomeFoundingRecord(input.foundingRecord);
        this.upsertPicoHomeMembership(picoHomeFoundingMembershipFromRecord(input.foundingRecord));
        /**
         * No dispatch on the schema here: `assertPicoHomeFoundingRecord`
         * refused every other spelling before this line, so the comparison
         * that used to stand here could not be false - and its false branch
         * would have founded a Home without the first device's evidence.
         */
        if (input.sodium === undefined) {
          throw new Error('Pico Home founding requires identity verification.');
        }
        const lifecycle = this.recordPicoIdentityLifecycleEvidence({
          sodium: input.sodium,
          identityKeyRecord: input.foundingRecord.claimantIdentityKeyRecord,
          delegation: input.foundingRecord.firstDeviceDelegation,
          revocations: input.foundingRecord.firstDeviceRevocations,
          recordedAt: input.foundingRecord.createdAt,
        });
        if (!lifecycle.ok) {
          throw new Error(`Pico Home first-device lifecycle evidence was refused: ${lifecycle.reason}.`);
        }
        const readerKey = this.registerPicoIdentityReaderKey({
          sodium: input.sodium,
          picoIdentityFingerprintHex:
            input.foundingRecord.founding.homeHostPicoIdentityFingerprintHex,
          deviceSigningKeyFingerprintHex:
            input.foundingRecord.founding.firstDeviceSigningKeyFingerprintHex,
          delegationId: input.foundingRecord.founding.firstDeviceDelegationId,
          deviceKeyAgreementKeyRecord:
            input.foundingRecord.firstDeviceKeyAgreementKeyRecord,
          at: input.foundingRecord.founding.foundedAt,
          registeredAt: input.foundingRecord.createdAt,
        });
        if (!readerKey.ok) {
          throw new Error(`Pico Home first-device reader key was refused: ${readerKey.reason}.`);
        }
      }
    });

    claim();
    return this.picoHomeClaimState();
  }

  public resetPicoHome(resetAt: string = new Date().toISOString()): PicoHomeClaimState {
    this.ensureOpen();
    assertNonEmptyString(resetAt, 'resetAt');

    const reset = this.db.transaction(() => {
      this.db
        .prepare(`
          UPDATE pico_home_claim_state
          SET state = ?,
              host_admin_pico_id = NULL,
              home_id = NULL,
              host_signing_key_fingerprint_hex = NULL,
              host_key_agreement_key_fingerprint_hex = NULL,
              claimed_at = NULL,
              updated_at = ?
          WHERE id = 1
        `)
        .run('unclaimed', resetAt);

      if (tableExists(this.db, 'pico_home_founding_record')) {
        this.db.prepare('DELETE FROM pico_home_founding_record WHERE id = 1').run();
      }

      if (tableExists(this.db, 'pico_home_membership')) {
        this.db.prepare('DELETE FROM pico_home_membership').run();
      }

      if (tableExists(this.db, 'pico_home_device_lifecycle_transition')) {
        this.db.prepare('DELETE FROM pico_home_device_lifecycle_transition').run();
      }
      if (tableExists(this.db, 'pico_identity_revocation')) {
        this.db.prepare('DELETE FROM pico_identity_revocation').run();
      }
      if (tableExists(this.db, 'pico_identity_reader_key')) {
        this.db.prepare('DELETE FROM pico_identity_reader_key').run();
      }
      if (tableExists(this.db, 'pico_identity_delegation')) {
        this.db.prepare('DELETE FROM pico_identity_delegation').run();
      }
      if (tableExists(this.db, 'pico_home_domain_read_grant_lifecycle')) {
        this.db.prepare('DELETE FROM pico_home_domain_read_grant_lifecycle').run();
      }
      if (tableExists(this.db, 'pico_home_domain_read_grant')) {
        this.db.prepare('DELETE FROM pico_home_domain_read_grant').run();
      }
      if (tableExists(this.db, 'pico_share_envelope')) {
        this.db.prepare('DELETE FROM pico_share_envelope').run();
      }
    });

    reset();

    return this.picoHomeClaimState();
  }

  /**
   * Reconciles the current Pico Home claim-state projection from the durable
   * founding evidence (ADR 0080 H8). If a stale restore brings back an
   * `unclaimed` or conflicting claim-state row while a founding record is
   * present, the row is projected back to `claimed`. This never mints a new
   * claim or appends audit; it only prevents Setup Mode from reopening as a
   * restore side effect.
   */
  public reconcilePicoHomeFoundingEvidence(reconciledAt: string = new Date().toISOString()): PicoHomeFoundingReconciliationResult {
    this.ensureOpen();

    if (!tableExists(this.db, 'pico_home_claim_state') || !tableExists(this.db, 'pico_home_founding_record')) {
      return { foundingRecordPresent: false, restoredClaimState: false };
    }

    const foundingRecord = this.picoHomeFoundingRecord();
    if (foundingRecord === undefined) {
      return { foundingRecordPresent: false, restoredClaimState: false };
    }

    const expectedClaim = picoHomeClaimInputFromFoundingRecord(foundingRecord);
    assertPicoHomeFoundingRecord(foundingRecord, expectedClaim);
    assertNonEmptyString(reconciledAt, 'reconciledAt');

    const row = this.db
      .prepare(`
        SELECT
          state,
          host_admin_pico_id AS hostAdminPicoId,
          home_id AS homeId,
          host_signing_key_fingerprint_hex AS hostSigningKeyFingerprintHex,
          host_key_agreement_key_fingerprint_hex AS hostKeyAgreementKeyFingerprintHex,
          claimed_at AS claimedAt
        FROM pico_home_claim_state
        WHERE id = 1
      `)
      .get() as Omit<PicoHomeClaimStateRow, 'createdAt' | 'updatedAt'> | undefined;

    const alreadyReconciled = row !== undefined
      && row.state === 'claimed'
      && row.hostAdminPicoId === expectedClaim.hostAdminPicoId
      && row.homeId === expectedClaim.homeId
      && row.hostSigningKeyFingerprintHex === expectedClaim.hostSigningKeyFingerprintHex
      && row.hostKeyAgreementKeyFingerprintHex === expectedClaim.hostKeyAgreementKeyFingerprintHex
      && row.claimedAt === expectedClaim.claimedAt;

    if (alreadyReconciled) {
      return { foundingRecordPresent: true, restoredClaimState: false };
    }

    const result = this.db
      .prepare(`
        UPDATE pico_home_claim_state
        SET state = ?,
            host_admin_pico_id = ?,
            home_id = ?,
            host_signing_key_fingerprint_hex = ?,
            host_key_agreement_key_fingerprint_hex = ?,
            claimed_at = ?,
            updated_at = ?
        WHERE id = 1
      `)
      .run(
        'claimed',
        expectedClaim.hostAdminPicoId,
        expectedClaim.homeId,
        expectedClaim.hostSigningKeyFingerprintHex,
        expectedClaim.hostKeyAgreementKeyFingerprintHex,
        expectedClaim.claimedAt,
        reconciledAt,
      );

    if (result.changes !== 1) {
      throw new Error('Pico Home claim state could not be reconciled from founding evidence.');
    }

    return { foundingRecordPresent: true, restoredClaimState: true };
  }

  /**
   * Reconciles the Home Host Pico's active membership projection from the
   * durable founding evidence (ADR 0080 M3). The founding record doubles as the
   * Home Host Pico's own membership root; a stale restore that drops or damages
   * that projection must not leave the Home without its local membership root.
   *
   * The current founding record is the only truth for founding-sourced rows, so
   * rows carrying a different `source_ref` are dropped first: they belong to a
   * superseded founding and would otherwise both resurrect a stale active
   * membership and collide with the projected row on
   * `UNIQUE (home_id, pico_identity_fingerprint_hex, role)`.
   */
  public reconcilePicoHomeMembershipsFromFoundingEvidence(
    reconciledAt: string = new Date().toISOString(),
  ): PicoHomeMembershipReconciliationResult {
    this.ensureOpen();

    if (!tableExists(this.db, 'pico_home_founding_record') || !tableExists(this.db, 'pico_home_membership')) {
      return { foundingRecordPresent: false, restoredMembership: false };
    }

    const foundingRecord = this.picoHomeFoundingRecord();
    if (foundingRecord === undefined) {
      return { foundingRecordPresent: false, restoredMembership: false };
    }

    const expected = {
      ...picoHomeFoundingMembershipFromRecord(foundingRecord),
      updatedAt: reconciledAt,
    };

    const existing = this.picoHomeMembership(expected.membershipId);
    const projectionMatches = existing !== undefined
      && existing.homeId === expected.homeId
      && existing.picoIdentityFingerprintHex === expected.picoIdentityFingerprintHex
      && existing.role === expected.role
      && existing.status === expected.status
      && sameScopeSet(existing.scopes, expected.scopes)
      && existing.source === expected.source
      && existing.sourceRef === expected.sourceRef
      && existing.validFrom === expected.validFrom
      && existing.validUntil === expected.validUntil;

    const reconcile = this.db.transaction(() => {
      const pruned = this.db
        .prepare(`
          DELETE FROM pico_home_membership
          WHERE source = 'founding_record'
            AND source_ref <> ?
        `)
        .run(expected.sourceRef).changes;

      if (!projectionMatches) {
        this.upsertPicoHomeMembership(expected);
      }

      return pruned > 0 || !projectionMatches;
    });

    return { foundingRecordPresent: true, restoredMembership: reconcile() };
  }

  /**
   * ADR 0108 restart projection. The founding record is the durable root for
   * the first device just as it is for the founder membership. Rebuild
   * lifecycle evidence before the reader-key projection, in one transaction.
   *
   * ADR 0134 F2 removed the second founding format, and with it the branch that
   * left a record without device evidence unreconciled: every founding record
   * carries that evidence, so every one of them reconciles.
   */
  public reconcilePicoHomeFirstDeviceEvidence(
    sodium: IdentityVerificationSodium,
  ): PicoHomeFirstDeviceReconciliationResult {
    this.ensureOpen();
    const record = this.picoHomeFoundingRecord();
    if (record === undefined) {
      return { foundingRecordPresent: false, reconciled: false };
    }
    const reconcile = this.db.transaction(() => {
      const lifecycle = this.recordPicoIdentityLifecycleEvidence({
        sodium,
        identityKeyRecord: record.claimantIdentityKeyRecord,
        delegation: record.firstDeviceDelegation,
        revocations: record.firstDeviceRevocations,
        recordedAt: record.createdAt,
      });
      if (!lifecycle.ok) {
        throw new Error(`first_device_lifecycle:${lifecycle.reason}`);
      }
      const readerKey = this.registerPicoIdentityReaderKey({
        sodium,
        picoIdentityFingerprintHex:
          record.founding.homeHostPicoIdentityFingerprintHex,
        deviceSigningKeyFingerprintHex:
          record.founding.firstDeviceSigningKeyFingerprintHex,
        delegationId: record.founding.firstDeviceDelegationId,
        deviceKeyAgreementKeyRecord: record.firstDeviceKeyAgreementKeyRecord,
        at: record.founding.foundedAt,
        registeredAt: record.createdAt,
      });
      if (!readerKey.ok) {
        throw new Error(`first_device_reader_key:${readerKey.reason}`);
      }
    });

    try {
      reconcile();
      return { foundingRecordPresent: true, reconciled: true };
    } catch (error) {
      return {
        foundingRecordPresent: true,
        reconciled: false,
        reason: (error as Error).message,
      };
    }
  }

  /**
   * Accepts a signed Home Membership Credential (ADR 0080 H6, Gate M3). The
   * issuer signature is the authority and is checked first; the host activation
   * countersignature is checked only here, at intake, because it is operational
   * acknowledgment rather than authority and must not outrank a later host-key
   * rotation.
   */
  public recordPicoHomeMembershipCredential(params: {
    sodium: IdentityVerificationSodium;
    credential: PicoHomeMembershipCredential;
    hostSigningPublicKeyHex: string;
    recordedAt?: string;
  }): PicoHomeMembershipRecordResult {
    this.ensureOpen();

    const foundingRecord = this.picoHomeFoundingRecord();
    if (foundingRecord === undefined) {
      return { ok: false, reason: 'no_founding_record' };
    }

    const currentHead = this.currentPicoHomeHostKeyHead();
    const authority = verifyPicoHomeMembershipAuthority(params.sodium, {
      credential: params.credential,
      foundingRecord,
      // ADR 0115: a new credential is activated by the Home as it is now, so
      // it must name the current head - a retired key stamps nothing new.
      acceptedHostSigningKeyFingerprintHexes: currentHead === undefined
        ? undefined
        : [currentHead.hostSigningKeyFingerprintHex],
    });
    if (!authority.ok) {
      return { ok: false, reason: authority.reason };
    }

    const activation = verifyPicoHomeMembershipActivation(params.sodium, {
      credential: params.credential,
      hostSigningPublicKeyHex: params.hostSigningPublicKeyHex,
    });
    if (!activation.ok) {
      return { ok: false, reason: activation.reason };
    }

    const membership = params.credential.membership;
    const serialized = serializePayload(membership);
    const existing = this.db
      .prepare('SELECT membership_json FROM pico_home_membership_credential WHERE credential_id = ?')
      .get(membership.credentialId) as { membership_json: string } | undefined;

    // A re-sent identical credential is a replay and is fine; the same id with
    // different content is two different statements claiming one name.
    if (existing !== undefined && existing.membership_json !== serialized) {
      return { ok: false, reason: 'conflicting_record' };
    }

    const recordedAt = params.recordedAt ?? new Date().toISOString();

    const write = this.db.transaction(() => {
      this.db
        .prepare(`
          INSERT INTO pico_home_membership_credential (
            credential_id,
            home_id,
            issuer_pico_identity_fingerprint_hex,
            subject_pico_identity_fingerprint_hex,
            role,
            lifecycle_order,
            valid_from,
            valid_until,
            membership_json,
            issuer_identity_key_record_json,
            issuer_signature_hex,
            host_activation_signature_hex,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(credential_id) DO NOTHING
        `)
        .run(
          membership.credentialId,
          membership.homeId,
          membership.issuerPicoIdentityFingerprintHex,
          membership.subjectPicoIdentityFingerprintHex,
          membership.role,
          membership.lifecycleOrder,
          membership.validFrom,
          membership.validUntil,
          serialized,
          serializePayload(params.credential.issuerIdentityKeyRecord),
          params.credential.issuerSignatureHex,
          params.credential.hostActivationSignatureHex,
          params.credential.createdAt,
        );

      const result = this.projectPicoHomeMemberMembership(
        membership.homeId,
        membership.subjectPicoIdentityFingerprintHex,
        recordedAt,
      );

      // ADR 0114 T3. Re-issuing membership to a rotated identity is the moment
      // its first device can finally read. Doing it here rather than at the
      // next boot is the difference between "your Pico works again" and "your
      // Pico works again after you restart your Home".
      if (result?.status === 'active') {
        this.registerPicoIdentityRotationSuccessorReaderKey(
          params.sodium,
          membership.subjectPicoIdentityFingerprintHex,
          recordedAt,
        );
      }

      return result;
    });

    const projected = write();
    if (projected === undefined) {
      return { ok: false, reason: 'conflicting_record' };
    }

    return { ok: true, membership: projected };
  }

  /**
   * Accepts a signed membership lifecycle statement. Statements are kept even
   * when they are not the freshest — they are history, and the projection reads
   * the freshest of them (ADR 0079 I9 ordering, ADR 0080 H6).
   */
  public recordPicoHomeMembershipLifecycle(params: {
    sodium: IdentityVerificationSodium;
    record: PicoHomeMembershipLifecycleRecord;
    recordedAt?: string;
  }): PicoHomeMembershipRecordResult {
    this.ensureOpen();

    const foundingRecord = this.picoHomeFoundingRecord();
    if (foundingRecord === undefined) {
      return { ok: false, reason: 'no_founding_record' };
    }

    const lifecycle = params.record.lifecycle;
    const credential = this.picoHomeMembershipCredential(lifecycle.credentialId);
    if (credential === undefined) {
      return { ok: false, reason: 'unknown_credential' };
    }

    const verification = verifyPicoHomeMembershipLifecycleRecord(params.sodium, {
      record: params.record,
      credential,
      foundingRecord,
    });
    if (!verification.ok) {
      return { ok: false, reason: verification.reason };
    }

    const serialized = serializePayload(lifecycle);
    const existing = this.db
      .prepare('SELECT lifecycle_json FROM pico_home_membership_lifecycle WHERE lifecycle_id = ?')
      .get(lifecycle.lifecycleId) as { lifecycle_json: string } | undefined;

    if (existing !== undefined && existing.lifecycle_json !== serialized) {
      return { ok: false, reason: 'conflicting_record' };
    }

    const recordedAt = params.recordedAt ?? new Date().toISOString();

    const write = this.db.transaction(() => {
      this.db
        .prepare(`
          INSERT INTO pico_home_membership_lifecycle (
            lifecycle_id,
            home_id,
            credential_id,
            subject_pico_identity_fingerprint_hex,
            status,
            reason_category,
            changed_at,
            lifecycle_order,
            lifecycle_json,
            issuer_identity_key_record_json,
            issuer_signature_hex,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(lifecycle_id) DO NOTHING
        `)
        .run(
          lifecycle.lifecycleId,
          lifecycle.homeId,
          lifecycle.credentialId,
          lifecycle.subjectPicoIdentityFingerprintHex,
          lifecycle.status,
          lifecycle.reasonCategory,
          lifecycle.changedAt,
          lifecycle.lifecycleOrder,
          serialized,
          serializePayload(params.record.issuerIdentityKeyRecord),
          params.record.issuerSignatureHex,
          params.record.createdAt,
        );

      return this.projectPicoHomeMemberMembership(
        lifecycle.homeId,
        lifecycle.subjectPicoIdentityFingerprintHex,
        recordedAt,
      );
    });

    const projected = write();
    if (projected === undefined) {
      return { ok: false, reason: 'conflicting_record' };
    }

    return { ok: true, membership: projected };
  }

  /**
   * Re-verifies every stored credential against the current founding record and
   * rebuilds the member rows from it. Only the authority half is re-checked: a
   * host key may legitimately have rotated since intake, and a membership has to
   * survive that. A credential that no longer verifies is dropped rather than
   * left projecting authority nobody can prove.
   */
  public reconcilePicoHomeMembershipsFromCredentials(
    sodium: IdentityVerificationSodium,
    reconciledAt: string = new Date().toISOString(),
  ): PicoHomeMembershipCredentialReconciliationResult {
    this.ensureOpen();

    if (!tableExists(this.db, 'pico_home_membership_credential') || !tableExists(this.db, 'pico_home_membership')) {
      return { verifiedCredentials: 0, droppedCredentials: 0, projectedMemberships: 0 };
    }

    const foundingRecord = this.picoHomeFoundingRecord();
    const credentialIds = this.db
      .prepare('SELECT credential_id FROM pico_home_membership_credential ORDER BY credential_id')
      .all()
      .map((row) => (row as { credential_id: string }).credential_id);

    let verifiedCredentials = 0;
    let droppedCredentials = 0;
    const subjects = new Set<string>();

    const reconcile = this.db.transaction(() => {
      for (const credentialId of credentialIds) {
        const credential = this.picoHomeMembershipCredential(credentialId);
        const verification = credential === undefined || foundingRecord === undefined
          ? { ok: false as const, reason: 'no_founding_record' as const }
          : verifyPicoHomeMembershipAuthority(sodium, {
            credential,
            foundingRecord,
            // ADR 0115: history is vouched for by the accepted chain - a
            // rotation must not drop every credential of an earlier era.
            acceptedHostSigningKeyFingerprintHexes:
              this.acceptedPicoHomeHostSigningKeyFingerprintHexes(),
          });

        if (!verification.ok) {
          this.dropPicoHomeMembershipCredential(credentialId);
          droppedCredentials += 1;
          continue;
        }

        verifiedCredentials += 1;
        subjects.add(`${credential!.membership.homeId}\u0000${credential!.membership.subjectPicoIdentityFingerprintHex}`);
      }

      // Member rows whose credential is gone must go with it.
      this.db
        .prepare(`
          DELETE FROM pico_home_membership
          WHERE source = 'membership_credential'
            AND source_ref NOT IN (SELECT credential_id FROM pico_home_membership_credential)
        `)
        .run();

      let projectedMemberships = 0;
      for (const key of subjects) {
        const [homeId, subject] = key.split('\u0000');
        if (this.projectPicoHomeMemberMembership(homeId, subject, reconciledAt) !== undefined) {
          projectedMemberships += 1;
        }
      }

      return projectedMemberships;
    });

    // The counters are filled inside the transaction, so it has to run before
    // the result object reads them.
    const projectedMemberships = reconcile();

    return { verifiedCredentials, droppedCredentials, projectedMemberships };
  }

  public picoHomeMembershipCredential(credentialId: string): PicoHomeMembershipCredential | undefined {
    this.ensureOpen();

    if (!tableExists(this.db, 'pico_home_membership_credential')) {
      return undefined;
    }

    const row = this.db
      .prepare(`
        SELECT membership_json, issuer_identity_key_record_json, issuer_signature_hex,
               host_activation_signature_hex, created_at
        FROM pico_home_membership_credential
        WHERE credential_id = ?
      `)
      .get(credentialId) as PicoHomeMembershipCredentialRow | undefined;

    if (row === undefined) {
      return undefined;
    }

    return {
      schema: picoHomeMembershipCredentialSchema,
      membership: JSON.parse(row.membership_json) as PicoHomeMembershipCredential['membership'],
      issuerIdentityKeyRecord: JSON.parse(row.issuer_identity_key_record_json) as PicoHomeMembershipCredential['issuerIdentityKeyRecord'],
      issuerSignatureHex: row.issuer_signature_hex,
      hostActivationSignatureHex: row.host_activation_signature_hex,
      createdAt: row.created_at,
    };
  }

  /**
   * Persists only lifecycle statements whose identity signatures verify. A
   * later login may add revocations, but can never remove an already observed
   * one; conflicts on a stable statement id fail closed.
   */
  public recordPicoIdentityLifecycleEvidence(params: {
    identityKeyRecord: PicoIdentityKeyRecordSignatureInput;
    delegation?: PicoIdentitySignedDelegation;
    revocations: readonly PicoIdentitySignedRevocation[];
    sodium: IdentityVerificationSodium;
    recordedAt?: string;
  }): PicoIdentityLifecycleEvidenceRecordResult {
    this.ensureOpen();

    if (params.delegation === undefined && params.revocations.length === 0) {
      return { ok: false, reason: 'invalid_identity_lifecycle_evidence' };
    }

    try {
      createVerifiedPicoIdentityLifecycleIndex(params.sodium, {
        issuerIdentityKeyRecord: params.identityKeyRecord,
        signedDelegations: params.delegation === undefined ? [] : [params.delegation],
        signedRevocations: params.revocations,
      });
    } catch {
      return { ok: false, reason: 'invalid_identity_lifecycle_evidence' };
    }

    const issuerFingerprint = params.delegation?.record.issuerIdentityKeyFingerprintHex
      ?? params.revocations[0]?.record.issuerIdentityKeyFingerprintHex;
    if (issuerFingerprint === undefined) {
      return { ok: false, reason: 'invalid_identity_lifecycle_evidence' };
    }
    if (params.revocations.some((entry) => entry.record.issuerIdentityKeyFingerprintHex !== issuerFingerprint)) {
      return { ok: false, reason: 'invalid_identity_lifecycle_evidence' };
    }

    const identityKeyJson = serializePayload(params.identityKeyRecord);
    const delegationJson = params.delegation === undefined
      ? undefined
      : serializePayload(params.delegation.record);
    if (params.delegation !== undefined) {
      const existingDelegation = this.db
        .prepare(`
          SELECT delegation_json AS recordJson,
                 issuer_identity_key_record_json AS keyJson,
                 signature_hex AS signatureHex
          FROM pico_identity_delegation
          WHERE delegation_id = ?
        `)
        .get(params.delegation.record.delegationId) as SignedEvidenceRow | undefined;
      if (existingDelegation !== undefined
        && (existingDelegation.recordJson !== delegationJson
          || existingDelegation.keyJson !== identityKeyJson
          || existingDelegation.signatureHex !== params.delegation.signatureHex)) {
        return { ok: false, reason: 'conflicting_record' };
      }
    }

    for (const signed of params.revocations) {
      const existing = this.db
        .prepare(`
          SELECT revocation_json AS recordJson,
                 issuer_identity_key_record_json AS keyJson,
                 signature_hex AS signatureHex
          FROM pico_identity_revocation
          WHERE revocation_id = ?
        `)
        .get(signed.record.revocationId) as SignedEvidenceRow | undefined;
      if (existing !== undefined
        && (existing.recordJson !== serializePayload(signed.record)
          || existing.keyJson !== identityKeyJson
          || existing.signatureHex !== signed.signatureHex)) {
        return { ok: false, reason: 'conflicting_record' };
      }
    }

    const submittedStatements = [
      ...(params.delegation === undefined
        ? []
        : [{
          kind: 'delegation',
          id: params.delegation.record.delegationId,
          lifecycleOrder: params.delegation.record.lifecycleOrder,
        }]),
      ...params.revocations.map((entry) => ({
        kind: 'revocation',
        id: entry.record.revocationId,
        lifecycleOrder: entry.record.lifecycleOrder,
      })),
    ];
    for (const statement of submittedStatements) {
      const occupied = this.db
        .prepare(`
          SELECT 'delegation' AS kind, delegation_id AS id
          FROM pico_identity_delegation
          WHERE issuer_pico_identity_fingerprint_hex = ?
            AND lifecycle_order = ?
          UNION ALL
          SELECT 'revocation' AS kind, revocation_id AS id
          FROM pico_identity_revocation
          WHERE issuer_pico_identity_fingerprint_hex = ?
            AND lifecycle_order = ?
        `)
        .all(
          issuerFingerprint,
          statement.lifecycleOrder,
          issuerFingerprint,
          statement.lifecycleOrder,
        ) as { kind: string; id: string }[];
      if (occupied.some((entry) => entry.kind !== statement.kind || entry.id !== statement.id)) {
        return { ok: false, reason: 'conflicting_record' };
      }
    }

    const recordedAt = params.recordedAt ?? new Date().toISOString();
    const write = this.db.transaction(() => {
      if (params.delegation !== undefined && delegationJson !== undefined) {
        const delegation = params.delegation.record;
        this.db
          .prepare(`
            INSERT INTO pico_identity_delegation (
              delegation_id,
              issuer_pico_identity_fingerprint_hex,
              subject_signing_key_fingerprint_hex,
              lifecycle_order,
              valid_from,
              valid_until,
              delegation_json,
              issuer_identity_key_record_json,
              signature_hex,
              created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(delegation_id) DO NOTHING
          `)
          .run(
            delegation.delegationId,
            delegation.issuerIdentityKeyFingerprintHex,
            delegation.subjectSigningKeyFingerprintHex,
            delegation.lifecycleOrder,
            delegation.validFrom,
            delegation.validUntil,
            delegationJson,
            identityKeyJson,
            params.delegation.signatureHex,
            recordedAt,
          );
      }

      for (const signed of params.revocations) {
        const revocation = signed.record;
        this.db
          .prepare(`
            INSERT INTO pico_identity_revocation (
              revocation_id,
              issuer_pico_identity_fingerprint_hex,
              subject_kind,
              subject_ref,
              lifecycle_order,
              revocation_json,
              issuer_identity_key_record_json,
              signature_hex,
              created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(revocation_id) DO NOTHING
          `)
          .run(
            revocation.revocationId,
            revocation.issuerIdentityKeyFingerprintHex,
            revocation.subjectKind,
            revocation.subjectRef,
            revocation.lifecycleOrder,
            serializePayload(revocation),
            identityKeyJson,
            signed.signatureHex,
            recordedAt,
          );
      }
    });
    write();

    return { ok: true };
  }

  /**
   * Registers the public X25519 reader key that the signed device delegation
   * names. Registration is a local, durable projection; it does not assert
   * registry freshness and cannot by itself authorize envelope issuance.
   */
  public registerPicoIdentityReaderKey(params: {
    picoIdentityFingerprintHex: string;
    deviceSigningKeyFingerprintHex: string;
    delegationId: string;
    deviceKeyAgreementKeyRecord: PicoIdentityKeyRecordSignatureInput;
    sodium: IdentityVerificationSodium;
    at?: string;
    registeredAt?: string;
  }): PicoIdentityReaderKeyRegistrationResult {
    this.ensureOpen();
    const homeId = this.picoHomeClaimState().homeId ?? undefined;
    const at = params.at ?? new Date().toISOString();
    if (homeId === undefined
      || !this.hasActivePicoHomeMembership(params.picoIdentityFingerprintHex, homeId, at)) {
      return { ok: false, reason: 'identity_is_not_active_member' };
    }

    const lifecycle = this.picoIdentityLifecycleIndex(
      params.sodium,
      params.picoIdentityFingerprintHex,
    );
    if (lifecycle === undefined) {
      return { ok: false, reason: 'inactive_reader_delegation' };
    }

    const active = lifecycle.lookupDelegation(params.delegationId, {
      at,
      requiredScopes: ['surface_session'],
    });
    if (active.status !== 'active'
      || active.delegation === undefined
      || active.delegation.issuerIdentityKeyFingerprintHex !== params.picoIdentityFingerprintHex
      || active.delegation.subjectSigningKeyFingerprintHex !== params.deviceSigningKeyFingerprintHex) {
      return { ok: false, reason: 'inactive_reader_delegation' };
    }

    const keyFingerprint = active.delegation.subjectKeyAgreementKeyFingerprintHex;
    try {
      if (params.deviceKeyAgreementKeyRecord.suite !== picoIdentitySuite
        || params.deviceKeyAgreementKeyRecord.keyRole !== 'device_key_agreement'
        || !verifyPicoIdentityKeyRecordFingerprint(params.sodium, {
          keyRecord: params.deviceKeyAgreementKeyRecord,
          expectedFingerprintHex: keyFingerprint,
        })) {
        return { ok: false, reason: 'invalid_reader_key' };
      }
    } catch {
      return { ok: false, reason: 'invalid_reader_key' };
    }

    const keyJson = serializePayload(params.deviceKeyAgreementKeyRecord);
    const existing = this.db
      .prepare(`
        SELECT home_id AS homeId,
               pico_identity_fingerprint_hex AS picoIdentityFingerprintHex,
               device_signing_key_fingerprint_hex AS deviceSigningKeyFingerprintHex,
               device_key_agreement_key_fingerprint_hex AS deviceKeyAgreementKeyFingerprintHex,
               device_key_agreement_key_record_json AS keyJson
        FROM pico_identity_reader_key
        WHERE delegation_id = ?
      `)
      .get(params.delegationId) as PicoIdentityReaderKeyRow | undefined;
    if (existing !== undefined
      && (existing.homeId !== homeId
        || existing.picoIdentityFingerprintHex !== params.picoIdentityFingerprintHex
        || existing.deviceSigningKeyFingerprintHex !== params.deviceSigningKeyFingerprintHex
        || existing.deviceKeyAgreementKeyFingerprintHex !== keyFingerprint
        || existing.keyJson !== keyJson)) {
      return { ok: false, reason: 'conflicting_record' };
    }

    const inserted = this.db
      .prepare(`
        INSERT INTO pico_identity_reader_key (
          delegation_id,
          home_id,
          pico_identity_fingerprint_hex,
          device_signing_key_fingerprint_hex,
          device_key_agreement_key_fingerprint_hex,
          device_key_agreement_key_record_json,
          registered_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(delegation_id) DO NOTHING
      `)
      .run(
        params.delegationId,
        homeId,
        params.picoIdentityFingerprintHex,
        params.deviceSigningKeyFingerprintHex,
        keyFingerprint,
        keyJson,
        params.registeredAt ?? at,
      ).changes === 1;

    return { ok: true, inserted };
  }

  public picoHomeDeviceLifecycleView(params: {
    picoIdentityFingerprintHex: string;
    sodium: IdentityVerificationSodium;
    at?: string;
  }): PicoHomeDeviceLifecycleView | undefined {
    this.ensureOpen();
    const at = params.at ?? new Date().toISOString();
    const homeId = this.picoHomeClaimState().homeId ?? undefined;
    if (homeId === undefined
      || !this.hasActivePicoHomeMembership(params.picoIdentityFingerprintHex, homeId, at)) {
      return undefined;
    }
    const lifecycle = this.picoIdentityLifecycleIndex(
      params.sodium,
      params.picoIdentityFingerprintHex,
    );
    const observedLifecycleOrder = lifecycle?.freshestLifecycleOrder();
    if (lifecycle === undefined || observedLifecycleOrder === null || observedLifecycleOrder === undefined) {
      return undefined;
    }

    const rows = this.db
      .prepare(`
        SELECT delegation_id AS delegationId,
               home_id AS homeId,
               pico_identity_fingerprint_hex AS picoIdentityFingerprintHex,
               device_signing_key_fingerprint_hex AS deviceSigningKeyFingerprintHex,
               device_key_agreement_key_fingerprint_hex AS deviceKeyAgreementKeyFingerprintHex,
               device_key_agreement_key_record_json AS keyJson
        FROM pico_identity_reader_key
        WHERE home_id = ?
          AND pico_identity_fingerprint_hex = ?
        ORDER BY delegation_id ASC
      `)
      .all(homeId, params.picoIdentityFingerprintHex) as PicoIdentityReaderKeyRow[];

    // ADR 0114: once the root's rotation is effective its delegations are no
    // longer active. The devices stay visible - a person needs to see what
    // the rotation cost them - but none of them is `active` any more.
    const rootAuthorityEnded = this.picoIdentityRootAuthorityEnded(
      params.picoIdentityFingerprintHex,
      at,
    );
    const devices = rows.flatMap((row): PicoHomeDeviceLifecycleDeviceView[] => {
      const lookup = lifecycle.lookupDelegation(row.delegationId, {
        at,
        requiredScopes: ['surface_session'],
      });
      if (lookup.delegation === undefined
        || lookup.delegation.subjectSigningKeyFingerprintHex
          !== row.deviceSigningKeyFingerprintHex
        || lookup.delegation.subjectKeyAgreementKeyFingerprintHex
          !== row.deviceKeyAgreementKeyFingerprintHex
        || !['active', 'not_yet_valid', 'expired', 'revoked'].includes(lookup.status)) {
        return [];
      }
      return [{
        delegationId: row.delegationId,
        deviceSigningKeyFingerprintHex: row.deviceSigningKeyFingerprintHex,
        deviceKeyAgreementKeyFingerprintHex: row.deviceKeyAgreementKeyFingerprintHex,
        deviceKeyAgreementKeyRecord:
          JSON.parse(row.keyJson) as PicoIdentityKeyRecordSignatureInput,
        lifecycleOrder: lookup.delegation.lifecycleOrder,
        validUntil: lookup.delegation.validUntil,
        status: rootAuthorityEnded && lookup.status === 'active'
          ? 'revoked'
          : lookup.status as PicoHomeDeviceLifecycleDeviceView['status'],
      }];
    });

    return {
      homeId,
      picoIdentityFingerprintHex: params.picoIdentityFingerprintHex,
      observedLifecycleOrder,
      devices,
    };
  }

  public picoHomeDeviceRecoveryPendingView(
    picoIdentityFingerprintHex: string,
  ): PicoHomeDeviceRecoveryPendingView | null {
    this.ensureOpen();
    if (!tableExists(this.db, 'pico_home_device_recovery')) {
      return null;
    }
    const row = this.db
      .prepare(`
        SELECT recovery_id AS recoveryId,
               claim_digest_hex AS claimDigestHex,
               target_delegation_id AS targetDelegationId,
               target_device_signing_key_fingerprint_hex
                 AS targetDeviceSigningKeyFingerprintHex,
               target_device_key_agreement_key_fingerprint_hex
                 AS targetDeviceKeyAgreementKeyFingerprintHex,
               accepted_at AS acceptedAt,
               effective_at AS effectiveAt,
               completion_expires_at AS completionExpiresAt
        FROM pico_home_device_recovery
        WHERE pico_identity_fingerprint_hex = ?
          AND status = 'pending'
      `)
      .get(picoIdentityFingerprintHex) as PicoHomeDeviceRecoveryPendingView | undefined;
    return row ?? null;
  }

  public preparePicoHomeDeviceRecovery(params: {
    preparation: PicoHomeDeviceRecoveryPreparation;
    sender: PicoHomeDeviceLifecycleSponsor;
    sodium: PicoHomeDeviceLifecycleSodium;
    acceptedAt?: string;
  }): PicoHomeDeviceRecoveryPreparationResult {
    this.ensureOpen();
    const acceptedAt = params.acceptedAt ?? new Date().toISOString();
    try {
      if (!hasExactRecordKeys(
        params.preparation as unknown as Record<string, unknown>,
        ['request', 'identityKeyRecord', 'rootSignatureHex'],
      )) {
        return { ok: false, reason: 'invalid_recovery_prepare' };
      }
      const { request, identityKeyRecord, rootSignatureHex } =
        params.preparation;
      const claimState = this.picoHomeClaimState();
      if (
        claimState.state !== 'claimed'
        || claimState.homeId === null
        || claimState.hostSigningKeyFingerprintHex === null
        || claimState.hostKeyAgreementKeyFingerprintHex === null
        || request.homeId !== claimState.homeId
        || request.hostSigningKeyFingerprintHex
          !== claimState.hostSigningKeyFingerprintHex
        || request.hostKeyAgreementKeyFingerprintHex
          !== claimState.hostKeyAgreementKeyFingerprintHex
        || request.picoIdentityFingerprintHex
          !== params.sender.picoIdentityFingerprintHex
        || request.targetDelegationId !== params.sender.delegationId
        || request.targetDeviceSigningKeyFingerprintHex
          !== params.sender.deviceSigningKeyFingerprintHex
        || request.targetDeviceKeyAgreementKeyFingerprintHex
          !== params.sender.deviceKeyAgreementKeyFingerprintHex
        || identityKeyRecord.suite !== picoIdentitySuite
        || identityKeyRecord.keyRole !== 'pico_identity'
        || !verifyPicoIdentityKeyRecordFingerprint(params.sodium, {
          keyRecord: identityKeyRecord,
          expectedFingerprintHex: request.picoIdentityFingerprintHex,
        })
      ) {
        return { ok: false, reason: 'invalid_recovery_prepare' };
      }
      const createdAtMs = Date.parse(request.createdAt);
      const expiresAtMs = Date.parse(request.expiresAt);
      const acceptedAtMs = Date.parse(acceptedAt);
      if (
        !Number.isFinite(createdAtMs)
        || !Number.isFinite(expiresAtMs)
        || !Number.isFinite(acceptedAtMs)
        || acceptedAtMs < createdAtMs
        || acceptedAtMs >= expiresAtMs
        || expiresAtMs - createdAtMs
          > picoHomeDeviceRecoveryTiming.signedRequestLifetimeMs
        || !verifyPicoIdentityDetachedSignature(params.sodium, {
          publicKeyHex: identityKeyRecord.publicKeyHex,
          signatureInput:
            buildPicoHomeDeviceRecoveryPrepareSignatureInput(request),
          signatureHex: rootSignatureHex,
        })
      ) {
        return { ok: false, reason: 'invalid_recovery_prepare' };
      }

      // Membership and lifecycle state are consulted only after the identity
      // root signature has authenticated the request. A random pre-authority
      // caller therefore cannot use this phase as a membership/status oracle.
      const view = this.picoHomeDeviceLifecycleView({
        picoIdentityFingerprintHex: request.picoIdentityFingerprintHex,
        sodium: params.sodium,
        at: acceptedAt,
      });
      return view === undefined
        ? { ok: false, reason: 'recovery_prepare_unavailable' }
        : { ok: true, view };
    } catch {
      return { ok: false, reason: 'invalid_recovery_prepare' };
    }
  }

  public initiatePicoHomeDeviceRecovery(params: {
    submission: PicoHomeDeviceRecoverySubmission;
    sender: PicoHomeDeviceLifecycleSponsor;
    sodium: PicoHomeDeviceLifecycleSodium;
    acceptedAt?: string;
  }): PicoHomeDeviceRecoveryInitiationResult {
    this.ensureOpen();
    const acceptedAt = params.acceptedAt ?? new Date().toISOString();
    const claimState = this.picoHomeClaimState();
    const claim = params.submission.claim;
    if (!verifyPicoHomeDeviceRecoveryPreAuthority(params.sodium, {
      submission: params.submission,
      sender: params.sender,
      claimState,
      acceptedAt,
    })) {
      return { ok: false, reason: 'invalid_recovery' };
    }
    const homeId = claimState.homeId ?? undefined;
    if (homeId === undefined
      || !this.hasActivePicoHomeMembership(
        claim.picoIdentityFingerprintHex,
        homeId,
        acceptedAt,
      )) {
      return { ok: false, reason: 'identity_is_not_active_member' };
    }
    const view = this.picoHomeDeviceLifecycleView({
      picoIdentityFingerprintHex: claim.picoIdentityFingerprintHex,
      sodium: params.sodium,
      at: acceptedAt,
    });
    if (view === undefined || view.observedLifecycleOrder !== claim.observedLifecycleOrder) {
      return { ok: false, reason: 'stale_lifecycle_head' };
    }

    const verification = verifyPicoHomeDeviceRecoverySubmission(params.sodium, {
      submission: params.submission,
      sender: params.sender,
      claimState,
      view,
      acceptedAt,
    });
    if (!verification.ok) {
      return { ok: false, reason: verification.reason };
    }
    if (this.db
      .prepare('SELECT 1 FROM pico_home_device_recovery WHERE recovery_id = ?')
      .get(claim.recoveryId) !== undefined) {
      return { ok: false, reason: 'recovery_id_reused' };
    }
    const acceptedAtMs = Date.parse(acceptedAt);
    const effectiveAt = new Date(
      acceptedAtMs + PICO_HOME_DEVICE_RECOVERY_DELAY_MS,
    ).toISOString();
    const completionExpiresAt = new Date(
      Date.parse(effectiveAt) + PICO_HOME_DEVICE_RECOVERY_COMPLETION_WINDOW_MS,
    ).toISOString();
    const existing = this.picoHomeDeviceRecoveryPendingView(
      claim.picoIdentityFingerprintHex,
    );
    const status = existing === null ? 'pending' : 'superseded';

    // ADR 0110 R6. The anchor is written before the database, and it is the
    // anchor - not the restorable row - that makes this recovery completable
    // later. An anchor that refuses here costs one re-initiation; an anchor
    // written afterwards would leave a window in which a snapshot captures a
    // pending row the anchor never saw.
    const anchor = this.recoveryAnchor;
    if (anchor === undefined) {
      return { ok: false, reason: 'recovery_anchor_unavailable' };
    }
    try {
      if (existing !== null) {
        anchor.record({
          recoveryId: existing.recoveryId,
          claimDigestHex: existing.claimDigestHex,
          picoIdentityFingerprintHex: claim.picoIdentityFingerprintHex,
          state: 'superseded',
          updatedAt: acceptedAt,
          expiresAt: existing.completionExpiresAt,
        });
      }
      anchor.record({
        recoveryId: claim.recoveryId,
        claimDigestHex: verification.claimDigestHex,
        picoIdentityFingerprintHex: claim.picoIdentityFingerprintHex,
        state: 'accepted',
        updatedAt: acceptedAt,
        expiresAt: completionExpiresAt,
      });
    } catch {
      return { ok: false, reason: 'recovery_anchor_unavailable' };
    }

    try {
      this.db.transaction(() => {
        if (existing !== null) {
          this.db
            .prepare(`
              UPDATE pico_home_device_recovery
              SET status = 'superseded',
                  resolved_at = ?,
                  superseded_by_recovery_id = ?
              WHERE recovery_id = ?
                AND status = 'pending'
            `)
            .run(acceptedAt, claim.recoveryId, existing.recoveryId);
        }
        this.db
          .prepare(`
            INSERT INTO pico_home_device_recovery (
              recovery_id,
              home_id,
              pico_identity_fingerprint_hex,
              status,
              target_delegation_id,
              target_device_signing_key_fingerprint_hex,
              target_device_key_agreement_key_fingerprint_hex,
              observed_lifecycle_order,
              evidence_digest_hex,
              claim_digest_hex,
              submission_json,
              accepted_at,
              effective_at,
              completion_expires_at
            ) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            claim.recoveryId,
            homeId,
            claim.picoIdentityFingerprintHex,
            claim.targetDelegationId,
            claim.targetDeviceSigningKeyFingerprintHex,
            claim.targetDeviceKeyAgreementKeyFingerprintHex,
            claim.observedLifecycleOrder,
            claim.evidenceDigestHex,
            verification.claimDigestHex,
            serializePayload(params.submission),
            acceptedAt,
            effectiveAt,
            completionExpiresAt,
          );
      })();
    } catch (error) {
      if (isPicoUniqueConstraintViolation(error)) {
        return { ok: false, reason: 'conflicting_record' };
      }
      throw error;
    }

    return {
      ok: true,
      status,
      pending: {
        recoveryId: claim.recoveryId,
        claimDigestHex: verification.claimDigestHex,
        targetDelegationId: claim.targetDelegationId,
        targetDeviceSigningKeyFingerprintHex:
          claim.targetDeviceSigningKeyFingerprintHex,
        targetDeviceKeyAgreementKeyFingerprintHex:
          claim.targetDeviceKeyAgreementKeyFingerprintHex,
        acceptedAt,
        effectiveAt,
        completionExpiresAt,
      },
    };
  }

  public vetoPicoHomeDeviceRecovery(params: {
    recoveryId: string;
    picoIdentityFingerprintHex: string;
    vetoedAt?: string;
  }): PicoHomeDeviceRecoveryVetoResult {
    this.ensureOpen();
    const row = this.db
      .prepare(`
        SELECT pico_identity_fingerprint_hex AS picoIdentityFingerprintHex,
               claim_digest_hex AS claimDigestHex,
               completion_expires_at AS completionExpiresAt,
               status
        FROM pico_home_device_recovery
        WHERE recovery_id = ?
      `)
      .get(params.recoveryId) as {
        picoIdentityFingerprintHex: string;
        claimDigestHex: string;
        completionExpiresAt: string;
        status: PicoHomeDeviceRecoveryRow['status'];
      } | undefined;
    if (row === undefined) {
      return { ok: false, reason: 'recovery_not_found' };
    }
    if (row.picoIdentityFingerprintHex !== params.picoIdentityFingerprintHex) {
      return { ok: false, reason: 'identity_mismatch' };
    }
    if (row.status !== 'pending') {
      return { ok: false, reason: 'recovery_not_pending' };
    }
    // ADR 0110 R6. A veto that only lands in the database is undone by the
    // restore that resurrects the recovery it vetoed.
    const anchor = this.recoveryAnchor;
    if (anchor === undefined) {
      return { ok: false, reason: 'recovery_anchor_unavailable' };
    }
    const anchored = anchor.lookup(params.recoveryId);
    // A veto only ever removes a recovery's ability to complete, so it is
    // allowed even where the anchor never saw the recovery - the case a
    // re-seed leaves behind. Refusing it there would leave a living device
    // staring at an alarm it cannot silence.
    if (
      anchored !== undefined
      && (anchored.state !== 'accepted'
        || anchored.claimDigestHex !== row.claimDigestHex)
    ) {
      return { ok: false, reason: 'recovery_anchor_unavailable' };
    }
    const vetoedAt = params.vetoedAt ?? new Date().toISOString();
    try {
      anchor.record({
        recoveryId: params.recoveryId,
        claimDigestHex: row.claimDigestHex,
        picoIdentityFingerprintHex: row.picoIdentityFingerprintHex,
        state: 'vetoed',
        updatedAt: vetoedAt,
        expiresAt: row.completionExpiresAt,
      });
    } catch {
      return { ok: false, reason: 'recovery_anchor_unavailable' };
    }
    this.db
      .prepare(`
        UPDATE pico_home_device_recovery
        SET status = 'vetoed',
            resolved_at = ?
        WHERE recovery_id = ?
          AND status = 'pending'
      `)
      .run(vetoedAt, params.recoveryId);
    return { ok: true };
  }

  /**
   * ADR 0114 T2. Accepts a dual-signed root rotation from a living device.
   *
   * Unlike recovery this is not a pre-authority operation: an identity that
   * can rotate still has an active device by definition, so the carrier is a
   * normally authorized sender and the Link surface does not grow. The device
   * co-signature is what a card thief lacks - to get one they must first
   * complete a recovery, which is loud, delayed and vetoable (ADR 0110).
   *
   * Nothing takes effect here. The rotation becomes effective only after its
   * veto window, and only if no other active device of the identity refuses
   * it in the meantime.
   */
  public submitPicoIdentityRootRotation(params: {
    rotation: PicoIdentityRotationSignatureInput;
    predecessorIdentityKeyRecord: PicoIdentityKeyRecordSignatureInput;
    successorIdentityKeyRecord: PicoIdentityKeyRecordSignatureInput;
    predecessorSignatureHex: string;
    successorSignatureHex: string;
    successorFirstDevice: PicoIdentityRotationSuccessorFirstDevice;
    sender: PicoHomeDeviceLifecycleSponsor;
    sodium: PicoHomeDeviceLifecycleSodium;
    acceptedAt?: string;
  }): PicoIdentityRootRotationSubmissionResult {
    this.ensureOpen();
    const acceptedAt = params.acceptedAt ?? new Date().toISOString();
    const rotation = params.rotation;
    const claimState = this.picoHomeClaimState();
    const homeId = claimState.homeId ?? undefined;

    // The rotating identity must be the sender's own: nobody rotates another
    // identity's root, and no host role stands in for one.
    if (
      params.sender.picoIdentityFingerprintHex
      !== rotation.predecessorIdentityKeyFingerprintHex
    ) {
      return { ok: false, reason: 'invalid_rotation' };
    }

    // ADR 0114 scope. The founder's root is the Home's own governance root;
    // replacing it is Home handover (ADR 0080's named non-goal), not identity
    // continuity. Refused here rather than left to the ceremony, because the
    // record would otherwise verify and end the Home's own authority.
    const founderIdentityFingerprintHex =
      this.picoHomeFoundingRecord()?.founding.homeHostPicoIdentityFingerprintHex
      ?? claimState.hostAdminPicoId?.replace(/^pico:identity:/, '');
    if (
      founderIdentityFingerprintHex
      === rotation.predecessorIdentityKeyFingerprintHex
    ) {
      return { ok: false, reason: 'founder_root_rotation_unsupported' };
    }

    if (
      homeId === undefined
      || !this.hasActivePicoHomeMembership(
        rotation.predecessorIdentityKeyFingerprintHex,
        homeId,
        acceptedAt,
      )
    ) {
      return { ok: false, reason: 'identity_is_not_active_member' };
    }

    try {
      if (!verifyPicoIdentityRotationSignatures(params.sodium, {
        predecessorIdentityKeyRecord: params.predecessorIdentityKeyRecord,
        successorIdentityKeyRecord: params.successorIdentityKeyRecord,
        rotation,
        predecessorSignatureHex: params.predecessorSignatureHex,
        successorSignatureHex: params.successorSignatureHex,
      })) {
        return { ok: false, reason: 'invalid_rotation' };
      }
    } catch {
      return { ok: false, reason: 'invalid_rotation' };
    }

    // ADR 0114 T3. The successor's first device must be delegated by the
    // successor root itself - the one authority that exists for it - and the
    // agreement key must be the one that delegation names, so the device the
    // person ends up holding is the device the veto window showed.
    //
    // That the delegation names the successor as issuer needs no separate
    // check: the delegation verifier binds it to the key record presented
    // here, and the rotation verification above bound that record to the
    // successor fingerprint.
    const firstDevice = params.successorFirstDevice.delegation.record;
    try {
      if (
        params.successorFirstDevice.deviceKeyAgreementKeyRecord.keyRole
          !== 'device_key_agreement'
        || !verifyPicoIdentityKeyRecordFingerprint(params.sodium, {
          keyRecord: params.successorFirstDevice.deviceKeyAgreementKeyRecord,
          expectedFingerprintHex: firstDevice.subjectKeyAgreementKeyFingerprintHex,
        })
      ) {
        return { ok: false, reason: 'invalid_successor_first_device' };
      }
      createVerifiedPicoIdentityLifecycleIndex(params.sodium, {
        issuerIdentityKeyRecord: params.successorIdentityKeyRecord,
        signedDelegations: [params.successorFirstDevice.delegation],
        signedRevocations: [],
      });
    } catch {
      return { ok: false, reason: 'invalid_successor_first_device' };
    }

    const existing = this.db
      .prepare(`
        SELECT rotation_id AS rotationId, status
        FROM pico_identity_root_rotation
        WHERE home_id = ?
          AND predecessor_identity_fingerprint_hex = ?
      `)
      .all(homeId, rotation.predecessorIdentityKeyFingerprintHex) as {
        rotationId: string;
        status: PicoIdentityRootRotationStatus;
      }[];
    if (existing.some((row) => row.rotationId === rotation.rotationId)) {
      return { ok: false, reason: 'rotation_id_reused' };
    }
    if (existing.some((row) => row.status === 'effective')) {
      // A rotated root has no authority left to authorize a second rotation.
      return { ok: false, reason: 'predecessor_already_rotated' };
    }
    if (existing.some((row) => row.status === 'pending')) {
      // Refused rather than superseded: letting a root holder replace the
      // pending successor would let a thief restart the window at will.
      return { ok: false, reason: 'rotation_already_pending' };
    }

    // The co-signing device must be active right now under the predecessor's
    // own authority - the asymmetry the whole design rests on.
    const view = this.picoHomeDeviceLifecycleView({
      picoIdentityFingerprintHex: rotation.predecessorIdentityKeyFingerprintHex,
      sodium: params.sodium,
      at: acceptedAt,
    });
    const coSigner = view?.devices.find(
      (device) => device.delegationId === params.sender.delegationId
        && device.status === 'active'
        && device.deviceSigningKeyFingerprintHex
          === params.sender.deviceSigningKeyFingerprintHex
        && device.deviceKeyAgreementKeyFingerprintHex
          === params.sender.deviceKeyAgreementKeyFingerprintHex,
    );
    if (coSigner === undefined) {
      return { ok: false, reason: 'co_signing_device_not_active' };
    }

    const effectiveAt = new Date(
      Date.parse(acceptedAt) + PICO_IDENTITY_ROOT_ROTATION_VETO_WINDOW_MS,
    ).toISOString();
    try {
      this.db
        .prepare(`
          INSERT INTO pico_identity_root_rotation (
            rotation_id,
            home_id,
            predecessor_identity_fingerprint_hex,
            successor_identity_fingerprint_hex,
            status,
            reason_category,
            lifecycle_order,
            rotated_at,
            accepted_at,
            effective_at,
            co_signing_delegation_id,
            successor_first_device_delegation_id,
            successor_first_device_signing_key_fingerprint_hex,
            successor_first_device_key_agreement_key_fingerprint_hex,
            record_json
          ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          rotation.rotationId,
          homeId,
          rotation.predecessorIdentityKeyFingerprintHex,
          rotation.successorIdentityKeyFingerprintHex,
          rotation.reasonCategory,
          rotation.lifecycleOrder,
          rotation.rotatedAt,
          acceptedAt,
          effectiveAt,
          params.sender.delegationId,
          firstDevice.delegationId,
          firstDevice.subjectSigningKeyFingerprintHex,
          firstDevice.subjectKeyAgreementKeyFingerprintHex,
          serializePayload({
            rotation,
            predecessorIdentityKeyRecord: params.predecessorIdentityKeyRecord,
            successorIdentityKeyRecord: params.successorIdentityKeyRecord,
            predecessorSignatureHex: params.predecessorSignatureHex,
            successorSignatureHex: params.successorSignatureHex,
            successorFirstDevice: params.successorFirstDevice,
          }),
        );
    } catch (error) {
      if (isPicoUniqueConstraintViolation(error)) {
        return { ok: false, reason: 'conflicting_record' };
      }
      throw error;
    }

    return {
      ok: true,
      rotation: {
        rotationId: rotation.rotationId,
        predecessorIdentityFingerprintHex:
          rotation.predecessorIdentityKeyFingerprintHex,
        successorIdentityFingerprintHex:
          rotation.successorIdentityKeyFingerprintHex,
        status: 'pending',
        reasonCategory: rotation.reasonCategory,
        rotatedAt: rotation.rotatedAt,
        acceptedAt,
        effectiveAt,
        coSigningDelegationId: params.sender.delegationId,
        successorFirstDeviceDelegationId: firstDevice.delegationId,
        successorFirstDeviceSigningKeyFingerprintHex:
          firstDevice.subjectSigningKeyFingerprintHex,
        successorFirstDeviceKeyAgreementKeyFingerprintHex:
          firstDevice.subjectKeyAgreementKeyFingerprintHex,
        successorFirstDeviceProjectedAt: null,
      },
    };
  }

  /**
   * ADR 0114 T2. Any *other* active device of the identity may refuse a
   * pending rotation. The co-signing device is excluded on purpose: a device
   * that authorized the rotation cannot also be the independent objection to
   * it, and allowing that would make the window look like a safeguard it is
   * not.
   */
  public vetoPicoIdentityRootRotation(params: {
    rotationId: string;
    sender: PicoHomeDeviceLifecycleSponsor;
    sodium: PicoHomeDeviceLifecycleSodium;
    vetoedAt?: string;
  }): PicoIdentityRootRotationVetoResult {
    this.ensureOpen();
    const vetoedAt = params.vetoedAt ?? new Date().toISOString();
    const row = this.db
      .prepare(`
        SELECT predecessor_identity_fingerprint_hex AS predecessorIdentityFingerprintHex,
               co_signing_delegation_id AS coSigningDelegationId,
               status
        FROM pico_identity_root_rotation
        WHERE rotation_id = ?
          AND home_id = ?
      `)
      .get(params.rotationId, this.picoHomeRotationScope()) as {
        predecessorIdentityFingerprintHex: string;
        coSigningDelegationId: string;
        status: PicoIdentityRootRotationStatus;
      } | undefined;
    if (row === undefined) {
      return { ok: false, reason: 'rotation_not_found' };
    }
    if (
      row.predecessorIdentityFingerprintHex
      !== params.sender.picoIdentityFingerprintHex
    ) {
      return { ok: false, reason: 'identity_mismatch' };
    }
    if (row.status !== 'pending') {
      return { ok: false, reason: 'rotation_not_pending' };
    }
    if (row.coSigningDelegationId === params.sender.delegationId) {
      return { ok: false, reason: 'veto_requires_another_device' };
    }

    this.db
      .prepare(`
        UPDATE pico_identity_root_rotation
        SET status = 'vetoed',
            resolved_at = ?
        WHERE rotation_id = ?
          AND home_id = ?
          AND status = 'pending'
      `)
      .run(vetoedAt, params.rotationId, this.picoHomeRotationScope());
    return { ok: true };
  }

  /** The rotation this identity's root is subject to at `at`, if any. */
  public picoIdentityRootRotationView(
    predecessorIdentityFingerprintHex: string,
  ): PicoIdentityRootRotationView | null {
    this.ensureOpen();
    if (!tableExists(this.db, 'pico_identity_root_rotation')) {
      return null;
    }
    const row = this.db
      .prepare(`
        SELECT rotation_id AS rotationId,
               predecessor_identity_fingerprint_hex AS predecessorIdentityFingerprintHex,
               successor_identity_fingerprint_hex AS successorIdentityFingerprintHex,
               status,
               reason_category AS reasonCategory,
               rotated_at AS rotatedAt,
               accepted_at AS acceptedAt,
               effective_at AS effectiveAt,
               co_signing_delegation_id AS coSigningDelegationId,
               successor_first_device_delegation_id AS successorFirstDeviceDelegationId,
               successor_first_device_signing_key_fingerprint_hex
                 AS successorFirstDeviceSigningKeyFingerprintHex,
               successor_first_device_key_agreement_key_fingerprint_hex
                 AS successorFirstDeviceKeyAgreementKeyFingerprintHex,
               successor_first_device_projected_at AS successorFirstDeviceProjectedAt
        FROM pico_identity_root_rotation
        WHERE home_id = ?
          AND predecessor_identity_fingerprint_hex = ?
          AND status IN ('pending', 'effective')
        ORDER BY accepted_at DESC, rotation_id ASC
        LIMIT 1
      `)
      .get(this.picoHomeRotationScope(), predecessorIdentityFingerprintHex) as
        | PicoIdentityRootRotationView
        | undefined;
    return row ?? null;
  }

  /**
   * ADR 0114 T3. What an effective rotation still owes, per issuer.
   *
   * Rotation grants eligibility, it does not rebind anything: the Home Host
   * Pico re-issues membership, each domain controller re-issues its own read
   * grants, and the successor root issues any further devices itself. That is
   * a deliberate cost - a rotating member waits for their issuers - and this
   * view is what keeps the wait honest instead of silent. Debt already
   * settled disappears from it, so an empty list means finished, not unknown.
   */
  public picoIdentityRotationDebtView(
    successorIdentityFingerprintHex: string,
    at: string = new Date().toISOString(),
  ): PicoIdentityRotationDebtView | null {
    this.ensureOpen();
    if (!tableExists(this.db, 'pico_identity_root_rotation')) {
      return null;
    }
    const row = this.db
      .prepare(`
        SELECT rotation_id AS rotationId,
               predecessor_identity_fingerprint_hex AS predecessorIdentityFingerprintHex,
               successor_identity_fingerprint_hex AS successorIdentityFingerprintHex,
               status,
               effective_at AS effectiveAt,
               successor_first_device_delegation_id AS delegationId,
               successor_first_device_signing_key_fingerprint_hex
                 AS deviceSigningKeyFingerprintHex,
               successor_first_device_projected_at AS projectedAt
        FROM pico_identity_root_rotation
        WHERE home_id = ?
          AND successor_identity_fingerprint_hex = ?
          AND status IN ('pending', 'effective')
        ORDER BY effective_at DESC, rotation_id ASC
        LIMIT 1
      `)
      .get(this.picoHomeRotationScope(), successorIdentityFingerprintHex) as {
        rotationId: string;
        predecessorIdentityFingerprintHex: string;
        successorIdentityFingerprintHex: string;
        status: 'pending' | 'effective';
        effectiveAt: string;
        delegationId: string;
        deviceSigningKeyFingerprintHex: string;
        projectedAt: string | null;
      } | undefined;
    if (row === undefined) {
      return null;
    }

    const readerKeyRegistered = this.db
      .prepare(`
        SELECT 1 AS present
        FROM pico_identity_reader_key
        WHERE delegation_id = ?
          AND pico_identity_fingerprint_hex = ?
      `)
      .get(row.delegationId, row.successorIdentityFingerprintHex) !== undefined;

    const homeId = this.picoHomeClaimState().homeId ?? undefined;
    const memberships = homeId === undefined || !tableExists(this.db, 'pico_home_membership')
      ? []
      : (this.db
        .prepare(`
          SELECT membership_id AS membershipId,
                 home_id AS homeId,
                 role,
                 valid_until AS validUntil
          FROM pico_home_membership
          WHERE home_id = ?
            AND pico_identity_fingerprint_hex = ?
            AND status = 'active'
            AND valid_from <= ?
            AND (valid_until IS NULL OR valid_until > ?)
          ORDER BY membership_id
        `)
        .all(homeId, row.predecessorIdentityFingerprintHex, at, at) as {
          membershipId: string;
          homeId: string;
          role: string;
          validUntil: string | null;
        }[])
        // Only what the successor does not already hold: an issuer that has
        // acted owes nothing further.
        .filter(() => !this.hasActivePicoHomeMembership(
          row.successorIdentityFingerprintHex,
          homeId,
          at,
        ));

    const grants = this.picoHomeDomainReadGrants(at);
    const successorDomains = new Set(
      grants
        .filter((grant) => grant.status === 'active'
          && grant.readerPicoIdentityFingerprintHex
            === row.successorIdentityFingerprintHex)
        .map((grant) => `${grant.privacyDomain}\u0000${grant.controllerPicoIdentityFingerprintHex}`),
    );

    return {
      rotationId: row.rotationId,
      predecessorIdentityFingerprintHex: row.predecessorIdentityFingerprintHex,
      successorIdentityFingerprintHex: row.successorIdentityFingerprintHex,
      status: row.status,
      effectiveAt: row.effectiveAt,
      successorFirstDevice: {
        delegationId: row.delegationId,
        deviceSigningKeyFingerprintHex: row.deviceSigningKeyFingerprintHex,
        delegated: row.projectedAt !== null,
        readerKeyRegistered,
      },
      membershipsToReissue: memberships,
      readGrantsToReissue: grants
        .filter((grant) => grant.status === 'active'
          && grant.readerPicoIdentityFingerprintHex
            === row.predecessorIdentityFingerprintHex
          && !successorDomains.has(
            `${grant.privacyDomain}\u0000${grant.controllerPicoIdentityFingerprintHex}`,
          ))
        .map((grant) => ({
          grantId: grant.grantId,
          privacyDomain: grant.privacyDomain,
          controllerPicoIdentityFingerprintHex:
            grant.controllerPicoIdentityFingerprintHex,
          validUntil: grant.validUntil,
        })),
    };
  }

  private static readonly hostContinuityColumns = `
        continuity_id AS continuityId,
        chain_position AS chainPosition,
        outgoing_host_signing_key_fingerprint_hex AS outgoingHostSigningKeyFingerprintHex,
        outgoing_host_key_agreement_key_fingerprint_hex AS outgoingHostKeyAgreementKeyFingerprintHex,
        incoming_host_signing_key_fingerprint_hex AS incomingHostSigningKeyFingerprintHex,
        incoming_host_key_agreement_key_fingerprint_hex AS incomingHostKeyAgreementKeyFingerprintHex,
        reason_category AS reasonCategory,
        changed_at AS changedAt,
        lifecycle_order AS lifecycleOrder,
        accepted_at AS acceptedAt
  `;

  /**
   * ADR 0115 (ADR 0080 H7). Accepts one link of the host-key chain.
   *
   * "Same Home" is proven, never asserted: the link must retire exactly the
   * Home's current head, its acceptance must come from the Home Host Pico the
   * founding names, and the projection moves the claim state's host pins in
   * the same transaction - so there is no instant at which the Home claims
   * two heads.
   */
  public recordPicoHomeHostContinuity(params: {
    record: PicoHomeContinuityRecord;
    sodium: IdentityVerificationSodium;
    recordedAt?: string;
  }): PicoHomeHostContinuityRecordResult {
    this.ensureOpen();
    const recordedAt = params.recordedAt ?? new Date().toISOString();
    const continuity = params.record.continuity;

    const foundingRecord = this.picoHomeFoundingRecord();
    if (foundingRecord === undefined) {
      return { ok: false, reason: 'no_founding_record' };
    }
    const founding = foundingRecord.founding;
    if (continuity.homeId !== founding.homeId) {
      return { ok: false, reason: 'foreign_home' };
    }
    // The acceptance must be the Home Host Pico's - the one signature a
    // thief of the host disk cannot produce. Any other root is a stranger,
    // however validly it signed.
    if (
      continuity.homeHostPicoIdentityFingerprintHex
      !== founding.homeHostPicoIdentityFingerprintHex
    ) {
      return { ok: false, reason: 'invalid_continuity' };
    }
    try {
      if (!verifyPicoHomeContinuityRecord(params.sodium, params.record)) {
        return { ok: false, reason: 'invalid_continuity' };
      }
    } catch {
      return { ok: false, reason: 'invalid_continuity' };
    }

    const recordJson = serializePayload(params.record);
    const existing = this.db
      .prepare(`
        SELECT record_json AS recordJson, ${EventStore.hostContinuityColumns}
        FROM pico_home_host_continuity
        WHERE home_id = ? AND continuity_id = ?
      `)
      .get(founding.homeId, continuity.continuityId) as
        | (PicoHomeHostContinuityLinkView & { recordJson: string })
        | undefined;
    if (existing !== undefined) {
      if (existing.recordJson !== recordJson) {
        return { ok: false, reason: 'conflicting_record' };
      }
      const { recordJson: _replayed, ...link } = existing;
      return { ok: true, inserted: false, link };
    }

    // A pending recovery has embedded the current host pins in its claim; a
    // rotation underneath it would leave a receipt no later boot could
    // re-verify. The recovery is time-critical, the rotation is not - it
    // waits.
    if (tableExists(this.db, 'pico_home_device_recovery')
      && this.db
        .prepare(`
          SELECT 1 AS present FROM pico_home_device_recovery
          WHERE status = 'pending'
          LIMIT 1
        `)
        .get() !== undefined) {
      return { ok: false, reason: 'recovery_pending' };
    }

    const chainTail = this.picoHomeHostContinuityTail();
    const head = this.currentPicoHomeHostKeyHead();
    if (head === undefined
      || continuity.outgoingHostSigningKeyFingerprintHex
        !== head.hostSigningKeyFingerprintHex
      || continuity.outgoingHostKeyAgreementKeyFingerprintHex
        !== head.hostKeyAgreementKeyFingerprintHex) {
      // Retiring anything but the current head would fork the chain - two
      // presents, both "proven".
      return { ok: false, reason: 'chain_gap' };
    }
    if (chainTail !== undefined
      && comparePicoIdentityLifecycleOrder(
        continuity.lifecycleOrder,
        chainTail.lifecycleOrder,
      ) <= 0) {
      return { ok: false, reason: 'stale_lifecycle_order' };
    }

    const chainPosition = chainTail === undefined ? 0 : chainTail.chainPosition + 1;
    this.db.transaction(() => {
      this.db
        .prepare(`
          INSERT INTO pico_home_host_continuity (
            continuity_id,
            home_id,
            chain_position,
            outgoing_host_signing_key_fingerprint_hex,
            outgoing_host_key_agreement_key_fingerprint_hex,
            incoming_host_signing_key_fingerprint_hex,
            incoming_host_key_agreement_key_fingerprint_hex,
            reason_category,
            changed_at,
            lifecycle_order,
            accepted_at,
            record_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          continuity.continuityId,
          founding.homeId,
          chainPosition,
          continuity.outgoingHostSigningKeyFingerprintHex,
          continuity.outgoingHostKeyAgreementKeyFingerprintHex,
          continuity.incomingHostSigningKeyFingerprintHex,
          continuity.incomingHostKeyAgreementKeyFingerprintHex,
          continuity.reasonCategory,
          continuity.changedAt,
          continuity.lifecycleOrder,
          recordedAt,
          recordJson,
        );
      this.db
        .prepare(`
          UPDATE pico_home_claim_state
          SET host_signing_key_fingerprint_hex = ?,
              host_key_agreement_key_fingerprint_hex = ?,
              updated_at = ?
          WHERE id = 1
        `)
        .run(
          continuity.incomingHostSigningKeyFingerprintHex,
          continuity.incomingHostKeyAgreementKeyFingerprintHex,
          recordedAt,
        );
    })();

    return {
      ok: true,
      inserted: true,
      link: {
        continuityId: continuity.continuityId,
        chainPosition,
        outgoingHostSigningKeyFingerprintHex:
          continuity.outgoingHostSigningKeyFingerprintHex,
        outgoingHostKeyAgreementKeyFingerprintHex:
          continuity.outgoingHostKeyAgreementKeyFingerprintHex,
        incomingHostSigningKeyFingerprintHex:
          continuity.incomingHostSigningKeyFingerprintHex,
        incomingHostKeyAgreementKeyFingerprintHex:
          continuity.incomingHostKeyAgreementKeyFingerprintHex,
        reasonCategory: continuity.reasonCategory,
        changedAt: continuity.changedAt,
        lifecycleOrder: continuity.lifecycleOrder,
        acceptedAt: recordedAt,
      },
    };
  }

  /**
   * ADR 0115. The founding-era host signing public key. Before any rotation
   * it is custody's own key; afterwards custody holds the new keys, and the
   * retired public key survives in the first chain link's outgoing key
   * record - bound to the founding fingerprint by the link's own
   * verification, so founding evidence stays re-verifiable forever.
   */
  public foundingEraHostSigningPublicKeyHex(): string | undefined {
    this.ensureOpen();
    if (!tableExists(this.db, 'pico_home_host_continuity')) {
      return undefined;
    }
    const first = this.db
      .prepare(`
        SELECT record_json AS recordJson
        FROM pico_home_host_continuity
        ORDER BY chain_position ASC
        LIMIT 1
      `)
      .get() as { recordJson: string } | undefined;
    if (first === undefined) {
      return undefined;
    }
    try {
      return (JSON.parse(first.recordJson) as PicoHomeContinuityRecord)
        .outgoingHostSigningKeyRecord.publicKeyHex;
    } catch {
      return undefined;
    }
  }

  /** The accepted host-key chain, founding-first. */
  public picoHomeHostKeyChain(): PicoHomeHostContinuityLinkView[] {
    this.ensureOpen();
    if (!tableExists(this.db, 'pico_home_host_continuity')) {
      return [];
    }
    const homeId = this.picoHomeFoundingRecord()?.founding.homeId;
    if (homeId === undefined) {
      return [];
    }
    return this.db
      .prepare(`
        SELECT ${EventStore.hostContinuityColumns}
        FROM pico_home_host_continuity
        WHERE home_id = ?
        ORDER BY chain_position ASC
      `)
      .all(homeId) as PicoHomeHostContinuityLinkView[];
  }

  /**
   * ADR 0115 U4. The accepted chain verbatim, founding-first: the stored
   * records with every signature, because the unsealed chain read exists for
   * clients that verify - a view without the signatures would be an
   * assertion, and assertions are exactly what a stranded client must not
   * accept. A row that no longer parses is omitted rather than served
   * broken; boot reconciliation is where such a row is dropped for good.
   */
  public picoHomeHostContinuityRecords(): PicoHomeContinuityRecord[] {
    this.ensureOpen();
    if (!tableExists(this.db, 'pico_home_host_continuity')) {
      return [];
    }
    const homeId = this.picoHomeFoundingRecord()?.founding.homeId;
    if (homeId === undefined) {
      return [];
    }
    const rows = this.db
      .prepare(`
        SELECT record_json AS recordJson
        FROM pico_home_host_continuity
        WHERE home_id = ?
        ORDER BY chain_position ASC
      `)
      .all(homeId) as { recordJson: string }[];
    const records: PicoHomeContinuityRecord[] = [];
    for (const row of rows) {
      try {
        records.push(JSON.parse(row.recordJson) as PicoHomeContinuityRecord);
      } catch {
        // Skip: the chain walk on the client ends at its proven prefix.
      }
    }
    return records;
  }

  private picoHomeHostContinuityTail(): PicoHomeHostContinuityLinkView | undefined {
    const chain = this.picoHomeHostKeyChain();
    return chain[chain.length - 1];
  }

  /**
   * ADR 0115. The host keys this Home currently answers to: the founding's
   * until a continuity link retires them, then the newest link's incoming
   * pair. New records bind to this head; history is vouched for by the chain.
   */
  public currentPicoHomeHostKeyHead(): PicoHomeHostKeyHead | undefined {
    this.ensureOpen();
    const founding = this.picoHomeFoundingRecord()?.founding;
    if (founding === undefined) {
      return undefined;
    }
    const tail = tableExists(this.db, 'pico_home_host_continuity')
      ? this.picoHomeHostContinuityTail()
      : undefined;
    return tail === undefined
      ? {
        hostSigningKeyFingerprintHex: founding.hostSigningKeyFingerprintHex,
        hostKeyAgreementKeyFingerprintHex:
          founding.hostKeyAgreementKeyFingerprintHex,
      }
      : {
        hostSigningKeyFingerprintHex: tail.incomingHostSigningKeyFingerprintHex,
        hostKeyAgreementKeyFingerprintHex:
          tail.incomingHostKeyAgreementKeyFingerprintHex,
      };
  }

  /**
   * ADR 0115. Every host signing key the accepted chain vouches for. A record
   * activated under a key of its own era stays valid - the host activates and
   * enforces, it never mints authority, so history needs no re-issue (ADR
   * 0080's asymmetry). Only the head activates anything new.
   */
  public acceptedPicoHomeHostSigningKeyFingerprintHexes(): string[] {
    this.ensureOpen();
    const founding = this.picoHomeFoundingRecord()?.founding;
    if (founding === undefined) {
      return [];
    }
    return [
      founding.hostSigningKeyFingerprintHex,
      ...(tableExists(this.db, 'pico_home_host_continuity')
        ? this.picoHomeHostKeyChain().map(
          (link) => link.incomingHostSigningKeyFingerprintHex,
        )
        : []),
    ];
  }

  /**
   * ADR 0115. Boot re-verifies the whole chain from the founding before
   * anything trusts it. A link that no longer verifies - or that no longer
   * chains - is dropped together with everything after it, because a chain is
   * only as proven as its weakest prefix, and the claim state's host pins are
   * repaired to the verified head so a tampered row cannot leave the Home
   * answering to a key nobody proved.
   *
   * **Ohne Transaktion, und das ist die Antwort und keine Luecke** (gemessen
   * 2026-09-10). Zwei der drei Schreibwege koennen in einem Lauf beide
   * greifen: der unbewiesene Kettenrest faellt, danach werden die Pins
   * repariert. Ein Absturz dazwischen liesse einen halben Zustand liegen - nur
   * kann ihn niemand sehen. Dies laeuft **beim Start**, einmal, aus
   * `app.ts`, bevor irgendetwas bedient wird; ein abgestuerzter Start bedient
   * nichts, und der naechste faehrt denselben Abgleich noch einmal. Ein
   * Abgleich, der zusammenlaeuft, braucht keine Klammer um sich.
   */
  public reconcilePicoHomeHostContinuity(
    sodium: IdentityVerificationSodium,
  ): PicoHomeHostContinuityReconciliationResult {
    this.ensureOpen();
    if (!tableExists(this.db, 'pico_home_host_continuity')) {
      return {
        verifiedLinks: 0,
        droppedLinks: 0,
        repairedClaimState: false,
        currentHostSigningKeyFingerprintHex: null,
      };
    }
    const founding = this.picoHomeFoundingRecord()?.founding;
    const rows = this.db
      .prepare(`
        SELECT record_json AS recordJson, home_id AS homeId,
               ${EventStore.hostContinuityColumns}
        FROM pico_home_host_continuity
        ORDER BY chain_position ASC
      `)
      .all() as (PicoHomeHostContinuityLinkView & {
        recordJson: string;
        homeId: string;
      })[];

    if (founding === undefined) {
      // Continuity without a founding chains off nothing.
      this.db.prepare('DELETE FROM pico_home_host_continuity').run();
      return {
        verifiedLinks: 0,
        droppedLinks: rows.length,
        repairedClaimState: false,
        currentHostSigningKeyFingerprintHex: null,
      };
    }

    let expectedOutgoing: PicoHomeHostKeyHead = {
      hostSigningKeyFingerprintHex: founding.hostSigningKeyFingerprintHex,
      hostKeyAgreementKeyFingerprintHex:
        founding.hostKeyAgreementKeyFingerprintHex,
    };
    let previousOrder: string | undefined;
    let verified = 0;
    for (const [index, row] of rows.entries()) {
      let stored: PicoHomeContinuityRecord;
      try {
        stored = JSON.parse(row.recordJson) as PicoHomeContinuityRecord;
        const continuity = stored.continuity;
        if (
          row.homeId !== founding.homeId
          || continuity.homeId !== founding.homeId
          || continuity.continuityId !== row.continuityId
          || row.chainPosition !== index
          || continuity.homeHostPicoIdentityFingerprintHex
            !== founding.homeHostPicoIdentityFingerprintHex
          || continuity.outgoingHostSigningKeyFingerprintHex
            !== expectedOutgoing.hostSigningKeyFingerprintHex
          || continuity.outgoingHostKeyAgreementKeyFingerprintHex
            !== expectedOutgoing.hostKeyAgreementKeyFingerprintHex
          || continuity.incomingHostSigningKeyFingerprintHex
            !== row.incomingHostSigningKeyFingerprintHex
          || continuity.incomingHostKeyAgreementKeyFingerprintHex
            !== row.incomingHostKeyAgreementKeyFingerprintHex
          || (previousOrder !== undefined
            && comparePicoIdentityLifecycleOrder(
              continuity.lifecycleOrder,
              previousOrder,
            ) <= 0)
          || !verifyPicoHomeContinuityRecord(sodium, stored)
        ) {
          throw new Error('invalid_continuity_link');
        }
      } catch {
        // The weakest prefix rule: this link and everything chained on it is
        // unproven, and unproven links are dropped, not honored.
        this.db
          .prepare('DELETE FROM pico_home_host_continuity WHERE chain_position >= ?')
          .run(row.chainPosition);
        break;
      }
      verified += 1;
      previousOrder = stored.continuity.lifecycleOrder;
      expectedOutgoing = {
        hostSigningKeyFingerprintHex:
          stored.continuity.incomingHostSigningKeyFingerprintHex,
        hostKeyAgreementKeyFingerprintHex:
          stored.continuity.incomingHostKeyAgreementKeyFingerprintHex,
      };
    }

    // The claim state's pins follow the verified head - projections reconcile
    // toward evidence, never the other way around.
    const claim = this.picoHomeClaimState();
    let repaired = false;
    if (claim.state === 'claimed'
      && (claim.hostSigningKeyFingerprintHex
        !== expectedOutgoing.hostSigningKeyFingerprintHex
        || claim.hostKeyAgreementKeyFingerprintHex
          !== expectedOutgoing.hostKeyAgreementKeyFingerprintHex)) {
      this.db
        .prepare(`
          UPDATE pico_home_claim_state
          SET host_signing_key_fingerprint_hex = ?,
              host_key_agreement_key_fingerprint_hex = ?,
              updated_at = ?
          WHERE id = 1
        `)
        .run(
          expectedOutgoing.hostSigningKeyFingerprintHex,
          expectedOutgoing.hostKeyAgreementKeyFingerprintHex,
          new Date().toISOString(),
        );
      repaired = true;
    }

    return {
      verifiedLinks: verified,
      droppedLinks: rows.length - verified,
      repairedClaimState: repaired,
      currentHostSigningKeyFingerprintHex:
        expectedOutgoing.hostSigningKeyFingerprintHex,
    };
  }

  /**
   * ADR 0114 T5. The Home a rotation may decide in.
   *
   * A rotation record carries no Home - that is what makes it portable, and a
   * person can hand-carry it to their other Homes. Accepting one stays a local
   * act, so every read is scoped to the Home that accepted it. A row that
   * arrived some other way - a database restored from another Home, two
   * databases merged - decides nothing here, in either direction.
   */
  private picoHomeRotationScope(): string {
    return this.picoHomeClaimState().homeId ?? '';
  }

  /**
   * ADR 0114. True once this root's rotation has passed its veto window: from
   * that instant every delegation it issued stops being honored. The record
   * is self-authorized - the predecessor signed exactly this - so the Home
   * gains no power by enforcing it.
   */
  private picoIdentityRootAuthorityEnded(
    predecessorIdentityFingerprintHex: string,
    at: string,
  ): boolean {
    if (!tableExists(this.db, 'pico_identity_root_rotation')) {
      return false;
    }
    const row = this.db
      .prepare(`
        SELECT effective_at AS effectiveAt
        FROM pico_identity_root_rotation
        WHERE home_id = ?
          AND predecessor_identity_fingerprint_hex = ?
          AND status IN ('pending', 'effective')
          AND effective_at <= ?
        LIMIT 1
      `)
      .get(this.picoHomeRotationScope(), predecessorIdentityFingerprintHex, at) as
        | { effectiveAt: string }
        | undefined;
    return row !== undefined;
  }

  public completePicoHomeDeviceRecovery(params: {
    recoveryId: string;
    claimDigestHex: string;
    sender: PicoHomeDeviceLifecycleSponsor;
    hostSigningKeyRecord: PicoIdentityKeyRecordSignatureInput;
    signHostReceipt(signatureInput: Uint8Array): string;
    sodium: PicoHomeDeviceLifecycleSodium;
    completedAt?: string;
  }): PicoHomeDeviceRecoveryCompletionResult {
    this.ensureOpen();
    const completedAt = params.completedAt ?? new Date().toISOString();
    const row = this.readPicoHomeDeviceRecoveryRow(params.recoveryId);
    if (
      row === undefined
      || row.claimDigestHex !== params.claimDigestHex
      || row.picoIdentityFingerprintHex !== params.sender.picoIdentityFingerprintHex
      || row.targetDelegationId !== params.sender.delegationId
      || row.targetDeviceSigningKeyFingerprintHex
        !== params.sender.deviceSigningKeyFingerprintHex
      || row.targetDeviceKeyAgreementKeyFingerprintHex
        !== params.sender.deviceKeyAgreementKeyFingerprintHex
    ) {
      // `home.device.recovery.submit` is a pre-authority operation. Unknown
      // ids, wrong digests and wrong targets therefore share one response:
      // no caller may turn a learned recovery id into a status oracle.
      return { ok: false, reason: 'recovery_unavailable' };
    }
    if (row.status !== 'pending') {
      return {
        ok: false,
        // Kein Cast: `row.status` ist hier auf die vier nicht-`pending`
        // Zustaende verengt, und `recovery_${...}` ergibt daraus genau die
        // vier Gruende der Vereinigung. Der Compiler haelt die beiden Listen
        // zusammen, was der Cast unterband: mit ihm ging ein sechster Zustand
        // lautlos durch, ohne ihn faellt der Bau (Befund B70, beides gemessen).
        reason: `recovery_${row.status}`,
      };
    }
    // ADR 0110 R6. The database row alone proves nothing about one-use: it is
    // exactly what a pre-consumption backup restores. Completion therefore
    // requires that this anchor accepted this recovery and has not resolved
    // it - which a resurrected row, a re-seeded anchor and a lost anchor all
    // fail, deliberately, at the cost of a re-initiation.
    const anchor = this.recoveryAnchor;
    if (
      anchor === undefined
      || !anchor.isCompletable({
        recoveryId: row.recoveryId,
        claimDigestHex: row.claimDigestHex,
      })
    ) {
      return { ok: false, reason: 'recovery_anchor_unavailable' };
    }
    // ADR 0120 N2. The veto delay is an objection window: the person is
    // protected by its duration, so it elapses only when the wall clock and
    // the anchor's observed floor both say it did. A wall clock wound forward
    // cannot retire the window the person would have objected in.
    if (!hasPicoObjectionWindowElapsed({
      endsAtMs: Date.parse(row.effectiveAt),
      nowMs: Date.parse(completedAt),
      anchorFloorMs: anchorFloorMs(anchor),
    })) {
      return { ok: false, reason: 'recovery_not_effective' };
    }
    // The far edge is exposure, not objection: past it a spent authorization
    // must stop being usable, so the earliest clock wins. There is no
    // monotonic start reading for a window that outlived its process, which
    // leaves the wall clock alone here - stated rather than hidden.
    if (hasPicoExposureWindowElapsed({
      endsAtMs: Date.parse(row.completionExpiresAt),
      nowMs: Date.parse(completedAt),
    })) {
      this.db
        .prepare(`
          UPDATE pico_home_device_recovery
          SET status = 'lapsed',
              resolved_at = ?
          WHERE recovery_id = ?
            AND status = 'pending'
        `)
        .run(completedAt, row.recoveryId);
      return { ok: false, reason: 'recovery_lapsed' };
    }

    let submission: PicoHomeDeviceRecoverySubmission;
    try {
      submission = JSON.parse(row.submissionJson) as PicoHomeDeviceRecoverySubmission;
    } catch {
      return { ok: false, reason: 'invalid_recovery' };
    }
    const claimState = this.picoHomeClaimState();
    // Re-evaluate the exact device set that the Home accepted, not the set
    // that happens to remain active after the 48-hour delay. A delegation may
    // expire naturally while recovery is pending; that must neither invalidate
    // an otherwise complete replacement nor let a delegation active at
    // acceptance escape its root-signed revocation.
    const view = this.picoHomeDeviceLifecycleView({
      picoIdentityFingerprintHex: row.picoIdentityFingerprintHex,
      sodium: params.sodium,
      at: row.acceptedAt,
    });
    if (view === undefined || view.observedLifecycleOrder !== row.observedLifecycleOrder) {
      return { ok: false, reason: 'stale_lifecycle_head' };
    }
    const verification = verifyPicoHomeDeviceRecoverySubmission(params.sodium, {
      submission,
      sender: params.sender,
      claimState,
      view,
      acceptedAt: row.acceptedAt,
    });
    if (!verification.ok
      || verification.claimDigestHex !== row.claimDigestHex
      || submission.claim.evidenceDigestHex !== row.evidenceDigestHex) {
      return { ok: false, reason: 'invalid_recovery' };
    }

    const resultingLifecycleOrder = freshestRecoveryEvidenceOrder(submission);
    const receipt: PicoHomeDeviceRecoveryReceiptSignatureInput = {
      suite: picoIdentitySuite,
      recoveryId: row.recoveryId,
      homeId: row.homeId,
      hostSigningKeyFingerprintHex:
        claimState.hostSigningKeyFingerprintHex ?? '',
      picoIdentityFingerprintHex: row.picoIdentityFingerprintHex,
      targetDelegationId: row.targetDelegationId,
      targetDeviceSigningKeyFingerprintHex:
        row.targetDeviceSigningKeyFingerprintHex,
      targetDeviceKeyAgreementKeyFingerprintHex:
        row.targetDeviceKeyAgreementKeyFingerprintHex,
      evidenceDigestHex: row.evidenceDigestHex,
      claimDigestHex: row.claimDigestHex,
      acceptedLifecycleOrder: row.observedLifecycleOrder,
      resultingLifecycleOrder,
      pendingAcceptedAt: row.acceptedAt,
      effectiveAt: row.effectiveAt,
      completionExpiresAt: row.completionExpiresAt,
      completedAt,
      leavesExactlyOneActiveDevice: true,
    };
    let hostSignatureHex: string;
    try {
      if (
        params.hostSigningKeyRecord.suite !== picoIdentitySuite
        || params.hostSigningKeyRecord.keyRole !== 'home_host_signing'
        || !verifyPicoIdentityKeyRecordFingerprint(params.sodium, {
          keyRecord: params.hostSigningKeyRecord,
          expectedFingerprintHex:
            claimState.hostSigningKeyFingerprintHex ?? '',
        })
      ) {
        return { ok: false, reason: 'invalid_recovery' };
      }
      const input = buildPicoHomeDeviceRecoveryReceiptSignatureInput(receipt);
      hostSignatureHex = params.signHostReceipt(input);
      if (!verifyPicoIdentityDetachedSignature(params.sodium, {
        publicKeyHex: params.hostSigningKeyRecord.publicKeyHex,
        signatureInput: input,
        signatureHex: hostSignatureHex,
      })) {
        return { ok: false, reason: 'invalid_recovery' };
      }
    } catch {
      return { ok: false, reason: 'invalid_recovery' };
    }
    const record: PicoHomeDeviceRecoveryRecord = {
      schema: picoHomeDeviceRecoveryRecordSchema,
      submission,
      receipt,
      hostSigningKeyRecord: params.hostSigningKeyRecord,
      hostSignatureHex,
    };

    try {
      anchor.record({
        recoveryId: row.recoveryId,
        claimDigestHex: row.claimDigestHex,
        picoIdentityFingerprintHex: row.picoIdentityFingerprintHex,
        state: 'consumed',
        updatedAt: completedAt,
        expiresAt: row.completionExpiresAt,
      });
    } catch {
      return { ok: false, reason: 'recovery_anchor_unavailable' };
    }

    try {
      this.db.transaction(() => {
        const lifecycle = this.recordPicoIdentityLifecycleEvidence({
          identityKeyRecord: submission.evidence.identityKeyRecord,
          delegation: submission.evidence.delegation,
          revocations: submission.evidence.revocations,
          sodium: params.sodium,
          recordedAt: completedAt,
        });
        if (!lifecycle.ok) {
          throw new PicoHomeDeviceRecoveryCommitError(
            lifecycle.reason === 'conflicting_record'
              ? 'conflicting_record'
              : 'invalid_recovery',
          );
        }
        const reader = this.registerPicoIdentityReaderKey({
          picoIdentityFingerprintHex: row.picoIdentityFingerprintHex,
          deviceSigningKeyFingerprintHex:
            row.targetDeviceSigningKeyFingerprintHex,
          delegationId: row.targetDelegationId,
          deviceKeyAgreementKeyRecord:
            submission.evidence.targetDeviceKeyAgreementKeyRecord,
          sodium: params.sodium,
          at: completedAt,
          registeredAt: completedAt,
        });
        if (!reader.ok) {
          throw new PicoHomeDeviceRecoveryCommitError(
            reader.reason === 'conflicting_record'
              ? 'conflicting_record'
              : 'invalid_recovery',
          );
        }
        const resulting = this.picoHomeDeviceLifecycleView({
          picoIdentityFingerprintHex: row.picoIdentityFingerprintHex,
          sodium: params.sodium,
          at: completedAt,
        });
        if (
          resulting === undefined
          || resulting.observedLifecycleOrder !== resultingLifecycleOrder
          || resulting.devices.filter((device) => device.status === 'active').length !== 1
          || resulting.devices.find(
            (device) => device.status === 'active',
          )?.delegationId !== row.targetDelegationId
        ) {
          throw new PicoHomeDeviceRecoveryCommitError('invalid_recovery');
        }
        const consumed = this.db
          .prepare(`
            UPDATE pico_home_device_recovery
            SET status = 'consumed',
                resolved_at = ?,
                recovery_record_json = ?
            WHERE recovery_id = ?
              AND status = 'pending'
          `)
          .run(completedAt, serializePayload(record), row.recoveryId);
        if (consumed.changes !== 1) {
          throw new PicoHomeDeviceRecoveryCommitError('conflicting_record');
        }
      })();
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof PicoHomeDeviceRecoveryCommitError
          ? error.reason
          : 'conflicting_record',
      };
    }
    return { ok: true, record };
  }

  private readPicoHomeDeviceRecoveryRow(
    recoveryId: string,
  ): PicoHomeDeviceRecoveryRow | undefined {
    return this.db
      .prepare(`
        SELECT recovery_id AS recoveryId,
               home_id AS homeId,
               pico_identity_fingerprint_hex AS picoIdentityFingerprintHex,
               status,
               target_delegation_id AS targetDelegationId,
               target_device_signing_key_fingerprint_hex
                 AS targetDeviceSigningKeyFingerprintHex,
               target_device_key_agreement_key_fingerprint_hex
                 AS targetDeviceKeyAgreementKeyFingerprintHex,
               observed_lifecycle_order AS observedLifecycleOrder,
               evidence_digest_hex AS evidenceDigestHex,
               claim_digest_hex AS claimDigestHex,
               submission_json AS submissionJson,
               accepted_at AS acceptedAt,
               effective_at AS effectiveAt,
               completion_expires_at AS completionExpiresAt,
               resolved_at AS resolvedAt,
               superseded_by_recovery_id AS supersededByRecoveryId,
               recovery_record_json AS recoveryRecordJson
        FROM pico_home_device_recovery
        WHERE recovery_id = ?
      `)
      .get(recoveryId) as PicoHomeDeviceRecoveryRow | undefined;
  }

  /**
   * ADR 0109 D2. The Link sponsor is checked before the transaction and the
   * host receipt is constructed from that historical fact. The receipt,
   * identity lifecycle evidence and reader-key projection then commit in one
   * SQLite transaction; a failure in any projection rolls all three back.
   */
  public recordPicoHomeDeviceLifecycleTransition(params: {
    submission: PicoHomeDeviceLifecycleSubmission;
    sponsor: PicoHomeDeviceLifecycleSponsor;
    hostSigningKeyRecord: PicoIdentityKeyRecordSignatureInput;
    signHostReceipt(signatureInput: Uint8Array): string;
    sodium: PicoHomeDeviceLifecycleSodium;
    acceptedAt?: string;
  }): PicoHomeDeviceLifecycleRecordResult {
    this.ensureOpen();
    const acceptedAt = params.acceptedAt ?? new Date().toISOString();
    const claim = this.picoHomeClaimState();
    const homeId = claim.homeId ?? undefined;
    if (homeId === undefined
      || !this.hasActivePicoHomeMembership(
        params.sponsor.picoIdentityFingerprintHex,
        homeId,
        acceptedAt,
      )) {
      return { ok: false, reason: 'identity_is_not_active_member' };
    }
    if (!this.hasActivePicoIdentityDelegation({
      ...params.sponsor,
      sodium: params.sodium,
      at: acceptedAt,
    })) {
      return { ok: false, reason: 'inactive_sponsor' };
    }

    let submissionDigestHex: string;
    let evidenceDigestHex: string;
    try {
      submissionDigestHex = picoHomeDeviceLifecycleSubmissionDigestHex(
        params.sodium,
        params.submission,
      );
      evidenceDigestHex = picoHomeDeviceLifecycleEvidenceDigestHex(
        params.sodium,
        params.submission.evidence,
      );
    } catch {
      return { ok: false, reason: 'invalid_transition' };
    }

    const evidence = params.submission.evidence;
    if (evidence.picoIdentityFingerprintHex !== params.sponsor.picoIdentityFingerprintHex) {
      return { ok: false, reason: 'invalid_transition' };
    }

    const existing = this.db
      .prepare(`
        SELECT transition_id AS transitionId,
               action,
               home_id AS homeId,
               pico_identity_fingerprint_hex AS picoIdentityFingerprintHex,
               sponsor_delegation_id AS sponsorDelegationId,
               target_delegation_id AS targetDelegationId,
               submission_digest_hex AS submissionDigestHex,
               lifecycle_record_json AS recordJson,
               accepted_at AS acceptedAt
        FROM pico_home_device_lifecycle_transition
        WHERE transition_id = ?
      `)
      .get(evidence.transitionId) as PicoHomeDeviceLifecycleTransitionRow | undefined;
    if (existing !== undefined) {
      if (existing.submissionDigestHex !== submissionDigestHex) {
        return { ok: false, reason: 'conflicting_record' };
      }
      let existingRecord: PicoHomeDeviceLifecycleRecord;
      try {
        existingRecord = JSON.parse(existing.recordJson) as PicoHomeDeviceLifecycleRecord;
        if (!verifyStoredPicoHomeDeviceLifecycleRecord(
          params.sodium,
          claim,
          existing,
          existingRecord,
        )) {
          return { ok: false, reason: 'conflicting_record' };
        }
      } catch {
        return { ok: false, reason: 'conflicting_record' };
      }
      return {
        ok: true,
        inserted: false,
        record: existingRecord,
      };
    }

    const lifecycle = this.picoIdentityLifecycleIndex(
      params.sodium,
      evidence.picoIdentityFingerprintHex,
    );
    const acceptedLifecycleOrder = lifecycle?.freshestLifecycleOrder();
    if (lifecycle === undefined || acceptedLifecycleOrder === null || acceptedLifecycleOrder === undefined) {
      return { ok: false, reason: 'invalid_transition' };
    }

    try {
      if (
        evidence.identityKeyRecord.suite !== picoIdentitySuite
        || evidence.identityKeyRecord.keyRole !== 'pico_identity'
        || !verifyPicoIdentityKeyRecordFingerprint(params.sodium, {
          keyRecord: evidence.identityKeyRecord,
          expectedFingerprintHex: evidence.picoIdentityFingerprintHex,
        })
        || params.hostSigningKeyRecord.suite !== picoIdentitySuite
        || params.hostSigningKeyRecord.keyRole !== 'home_host_signing'
        || claim.hostSigningKeyFingerprintHex === null
        || !verifyPicoIdentityKeyRecordFingerprint(params.sodium, {
          keyRecord: params.hostSigningKeyRecord,
          expectedFingerprintHex: claim.hostSigningKeyFingerprintHex,
        })
      ) {
        return { ok: false, reason: 'invalid_transition' };
      }

      createVerifiedPicoIdentityLifecycleIndex(params.sodium, {
        issuerIdentityKeyRecord: evidence.identityKeyRecord,
        signedDelegations: evidence.delegation === null ? [] : [evidence.delegation],
        signedRevocations: evidence.revocations,
      });
    } catch {
      return { ok: false, reason: 'invalid_transition' };
    }

    if (evidence.action !== 'revoke') {
      if (
        evidence.observedLifecycleOrder !== acceptedLifecycleOrder
        || evidence.delegation === null
        || comparePicoIdentityLifecycleOrder(
          evidence.delegation.record.lifecycleOrder,
          acceptedLifecycleOrder,
        ) <= 0
        || evidence.revocations.some((entry) =>
          comparePicoIdentityLifecycleOrder(
            entry.record.lifecycleOrder,
            acceptedLifecycleOrder,
          ) <= 0)
      ) {
        return { ok: false, reason: 'stale_lifecycle_head' };
      }
    }

    const targetBefore = lifecycle.lookupDelegation(evidence.targetDelegationId, {
      at: acceptedAt,
      requiredScopes: ['surface_session'],
    });
    if (evidence.action === 'enroll') {
      const knownTarget = this.db
        .prepare(`
          SELECT 1
          FROM pico_identity_reader_key
          WHERE pico_identity_fingerprint_hex = ?
            AND (
              device_signing_key_fingerprint_hex = ?
              OR device_key_agreement_key_fingerprint_hex = ?
            )
          LIMIT 1
        `)
        .get(
          evidence.picoIdentityFingerprintHex,
          evidence.targetDeviceSigningKeyFingerprintHex,
          evidence.targetDeviceKeyAgreementKeyFingerprintHex,
        );
      if (targetBefore.status !== 'unknown' || knownTarget !== undefined) {
        return { ok: false, reason: 'invalid_transition' };
      }
    } else if (evidence.action === 'renew') {
      const replaced = evidence.replacedDelegationId === null
        ? undefined
        : lifecycle.lookupDelegation(evidence.replacedDelegationId, {
          at: acceptedAt,
          requiredScopes: ['surface_session'],
        });
      if (targetBefore.status !== 'unknown' || replaced?.status !== 'active') {
        return { ok: false, reason: 'invalid_transition' };
      }
    } else if (
      targetBefore.delegation === undefined
      || targetBefore.delegation.subjectSigningKeyFingerprintHex
        !== evidence.targetDeviceSigningKeyFingerprintHex
      || targetBefore.delegation.subjectKeyAgreementKeyFingerprintHex
        !== evidence.targetDeviceKeyAgreementKeyFingerprintHex
    ) {
      return { ok: false, reason: 'invalid_transition' };
    }

    if (evidence.action !== 'revoke') {
      const activation = params.submission.activation;
      if (
        activation === null
        || evidence.targetDeviceSigningKeyRecord === null
        || evidence.targetDeviceKeyAgreementKeyRecord === null
      ) {
        return { ok: false, reason: 'invalid_transition' };
      }
      const input = activation.input;
      const activationCreatedAt = Date.parse(input.createdAt);
      const activationExpiresAt = Date.parse(input.expiresAt);
      const acceptedAtMs = Date.parse(acceptedAt);
      try {
        if (
          input.homeId !== homeId
          || input.hostSigningKeyFingerprintHex !== claim.hostSigningKeyFingerprintHex
          || input.picoIdentityFingerprintHex !== evidence.picoIdentityFingerprintHex
          || input.sponsorDelegationId !== params.sponsor.delegationId
          || input.sponsorDeviceSigningKeyFingerprintHex
            !== params.sponsor.deviceSigningKeyFingerprintHex
          || input.sponsorDeviceKeyAgreementKeyFingerprintHex
            !== params.sponsor.deviceKeyAgreementKeyFingerprintHex
          || input.lifecycleEvidenceDigestHex !== evidenceDigestHex
          || !Number.isFinite(acceptedAtMs)
          || acceptedAtMs < activationCreatedAt
          || acceptedAtMs >= activationExpiresAt
          || activationExpiresAt - activationCreatedAt > 5 * 60 * 1_000
          || !verifyPicoIdentityKeyRecordFingerprint(params.sodium, {
            keyRecord: evidence.targetDeviceSigningKeyRecord,
            expectedFingerprintHex: evidence.targetDeviceSigningKeyFingerprintHex,
          })
          || !verifyPicoIdentityKeyRecordFingerprint(params.sodium, {
            keyRecord: evidence.targetDeviceKeyAgreementKeyRecord,
            expectedFingerprintHex: evidence.targetDeviceKeyAgreementKeyFingerprintHex,
          })
          || !verifyPicoIdentityDetachedSignature(params.sodium, {
            publicKeyHex: evidence.targetDeviceSigningKeyRecord.publicKeyHex,
            signatureInput: buildPicoHomeDeviceActivationSignatureInput(input),
            signatureHex: activation.targetSignatureHex,
          })
        ) {
          return { ok: false, reason: 'invalid_transition' };
        }
      } catch {
        return { ok: false, reason: 'invalid_transition' };
      }
    }

    let resultingLifecycle;
    try {
      resultingLifecycle = lifecycle.reconcile({
        acceptedDelegations: evidence.delegation === null
          ? []
          : [evidence.delegation.record],
        acceptedRevocations: evidence.revocations.map((entry) => entry.record),
      });
    } catch {
      return { ok: false, reason: 'conflicting_record' };
    }
    const resultingLifecycleOrder = resultingLifecycle.freshestLifecycleOrder();
    if (resultingLifecycleOrder === null) {
      return { ok: false, reason: 'invalid_transition' };
    }

    const registeredDelegationIds = new Set(
      (this.db
        .prepare(`
          SELECT delegation_id AS delegationId
          FROM pico_identity_reader_key
          WHERE home_id = ?
            AND pico_identity_fingerprint_hex = ?
        `)
        .all(homeId, evidence.picoIdentityFingerprintHex) as { delegationId: string }[])
        .map((row) => row.delegationId),
    );
    if (evidence.action !== 'revoke') {
      registeredDelegationIds.add(evidence.targetDelegationId);
    }
    const leavesNoActiveDevice = [...registeredDelegationIds].every((delegationId) =>
      resultingLifecycle.lookupDelegation(delegationId, {
        at: acceptedAt,
        requiredScopes: ['surface_session'],
      }).status !== 'active');

    const receipt: PicoHomeDeviceLifecycleReceiptSignatureInput = {
      suite: picoIdentitySuite,
      transitionId: evidence.transitionId,
      action: evidence.action,
      homeId,
      hostSigningKeyFingerprintHex: claim.hostSigningKeyFingerprintHex,
      picoIdentityFingerprintHex: evidence.picoIdentityFingerprintHex,
      sponsorDelegationId: params.sponsor.delegationId,
      sponsorDeviceSigningKeyFingerprintHex: params.sponsor.deviceSigningKeyFingerprintHex,
      sponsorDeviceKeyAgreementKeyFingerprintHex:
        params.sponsor.deviceKeyAgreementKeyFingerprintHex,
      targetDelegationId: evidence.targetDelegationId,
      targetDeviceSigningKeyFingerprintHex: evidence.targetDeviceSigningKeyFingerprintHex,
      targetDeviceKeyAgreementKeyFingerprintHex:
        evidence.targetDeviceKeyAgreementKeyFingerprintHex,
      transitionDigestHex: submissionDigestHex,
      acceptedLifecycleOrder,
      resultingLifecycleOrder,
      acceptedAt,
      leavesNoActiveDevice,
    };
    let hostSignatureHex: string;
    try {
      const receiptInput = buildPicoHomeDeviceLifecycleReceiptSignatureInput(receipt);
      hostSignatureHex = params.signHostReceipt(receiptInput);
      if (!verifyPicoIdentityDetachedSignature(params.sodium, {
        publicKeyHex: params.hostSigningKeyRecord.publicKeyHex,
        signatureInput: receiptInput,
        signatureHex: hostSignatureHex,
      })) {
        return { ok: false, reason: 'invalid_transition' };
      }
    } catch {
      return { ok: false, reason: 'invalid_transition' };
    }

    const record: PicoHomeDeviceLifecycleRecord = {
      schema: picoHomeDeviceLifecycleRecordSchema,
      submission: params.submission,
      receipt,
      hostSigningKeyRecord: params.hostSigningKeyRecord,
      hostSignatureHex,
    };

    try {
      this.db.transaction(() => {
        this.db
          .prepare(`
            INSERT INTO pico_home_device_lifecycle_transition (
              transition_id,
              action,
              home_id,
              pico_identity_fingerprint_hex,
              sponsor_delegation_id,
              target_delegation_id,
              submission_digest_hex,
              lifecycle_record_json,
              accepted_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            evidence.transitionId,
            evidence.action,
            homeId,
            evidence.picoIdentityFingerprintHex,
            params.sponsor.delegationId,
            evidence.targetDelegationId,
            submissionDigestHex,
            serializePayload(record),
            acceptedAt,
          );

        const lifecycleResult = this.recordPicoIdentityLifecycleEvidence({
          identityKeyRecord: evidence.identityKeyRecord,
          delegation: evidence.delegation ?? undefined,
          revocations: evidence.action === 'revoke' ? evidence.revocations : [],
          sodium: params.sodium,
          recordedAt: acceptedAt,
        });
        if (!lifecycleResult.ok) {
          throw new PicoHomeDeviceLifecycleCommitError(
            lifecycleResult.reason === 'conflicting_record'
              ? 'conflicting_record'
              : 'invalid_transition',
          );
        }

        if (evidence.action !== 'revoke') {
          const registration = this.registerPicoIdentityReaderKey({
            picoIdentityFingerprintHex: evidence.picoIdentityFingerprintHex,
            deviceSigningKeyFingerprintHex: evidence.targetDeviceSigningKeyFingerprintHex,
            delegationId: evidence.targetDelegationId,
            deviceKeyAgreementKeyRecord: evidence.targetDeviceKeyAgreementKeyRecord!,
            sodium: params.sodium,
            at: acceptedAt,
            registeredAt: acceptedAt,
          });
          if (!registration.ok) {
            throw new PicoHomeDeviceLifecycleCommitError(
              registration.reason === 'conflicting_record'
                ? 'conflicting_record'
                : 'invalid_transition',
            );
          }
        }

        if (evidence.action === 'renew') {
          const revocationResult = this.recordPicoIdentityLifecycleEvidence({
            identityKeyRecord: evidence.identityKeyRecord,
            revocations: evidence.revocations,
            sodium: params.sodium,
            recordedAt: acceptedAt,
          });
          if (!revocationResult.ok) {
            throw new PicoHomeDeviceLifecycleCommitError(
              revocationResult.reason === 'conflicting_record'
                ? 'conflicting_record'
                : 'invalid_transition',
            );
          }
        }

        // A living device action always outranks a pending root recovery
        // (ADR 0110). Keep the cancellation in the same transaction as the
        // accepted lifecycle transition so neither outcome can exist alone.
        if (tableExists(this.db, 'pico_home_device_recovery')) {
          this.db
            .prepare(`
              UPDATE pico_home_device_recovery
              SET status = 'vetoed',
                  resolved_at = ?
              WHERE pico_identity_fingerprint_hex = ?
                AND status = 'pending'
            `)
            .run(acceptedAt, evidence.picoIdentityFingerprintHex);
        }
      })();
    } catch (error) {
      if (error instanceof PicoHomeDeviceLifecycleCommitError) {
        return { ok: false, reason: error.reason };
      }
      if (isPicoUniqueConstraintViolation(error)) {
        return { ok: false, reason: 'conflicting_record' };
      }
      throw error;
    }

    return { ok: true, inserted: true, record };
  }

  public hasActivePicoIdentityDelegation(params: {
    picoIdentityFingerprintHex: string;
    deviceSigningKeyFingerprintHex: string;
    deviceKeyAgreementKeyFingerprintHex: string;
    delegationId: string;
    sodium: IdentityVerificationSodium;
    at?: string;
  }): boolean {
    this.ensureOpen();

    const readerKey = this.db
      .prepare(`
        SELECT device_key_agreement_key_record_json AS keyJson
        FROM pico_identity_reader_key
        WHERE delegation_id = ?
          AND pico_identity_fingerprint_hex = ?
          AND device_signing_key_fingerprint_hex = ?
          AND device_key_agreement_key_fingerprint_hex = ?
      `)
      .get(
        params.delegationId,
        params.picoIdentityFingerprintHex,
        params.deviceSigningKeyFingerprintHex,
        params.deviceKeyAgreementKeyFingerprintHex,
      ) as { keyJson: string } | undefined;
    if (readerKey === undefined) {
      return false;
    }

    try {
      const keyRecord = JSON.parse(readerKey.keyJson) as PicoIdentityKeyRecordSignatureInput;
      if (keyRecord.keyRole !== 'device_key_agreement'
        || !verifyPicoIdentityKeyRecordFingerprint(params.sodium, {
          keyRecord,
          expectedFingerprintHex: params.deviceKeyAgreementKeyFingerprintHex,
        })) {
        return false;
      }
      const at = params.at ?? new Date().toISOString();
      // ADR 0114: a rotated root authorizes nothing further, so every device
      // it delegated stops here - the single choke point Link authorization
      // and identity sessions both pass through.
      if (this.picoIdentityRootAuthorityEnded(
        params.picoIdentityFingerprintHex,
        at,
      )) {
        return false;
      }
      const index = this.picoIdentityLifecycleIndex(
        params.sodium,
        params.picoIdentityFingerprintHex,
      );
      if (index === undefined) {
        return false;
      }

      return index.lookupDelegation(params.delegationId, {
        at,
        requiredScopes: ['surface_session'],
      }).status === 'active';
    } catch {
      return false;
    }
  }

  /**
   * Resolves one exact reader key for the future envelope issuer. This only
   * proves locally stored membership/lifecycle/key evidence. The caller must
   * still apply the ADR 0083 external freshness contract.
   */
  public picoIdentityReaderKeyCandidate(params: {
    homeId: string;
    picoIdentityFingerprintHex: string;
    delegationId: string;
    deviceKeyAgreementKeyFingerprintHex: string;
    sodium: IdentityVerificationSodium;
    at?: string;
  }): PicoIdentityReaderKeyCandidate | undefined {
    this.ensureOpen();
    const at = params.at ?? new Date().toISOString();
    if (this.picoHomeClaimState().homeId !== params.homeId
      || !this.hasActivePicoHomeMembership(
        params.picoIdentityFingerprintHex,
        params.homeId,
        at,
      )) {
      return undefined;
    }

    const row = this.db
      .prepare(`
        SELECT delegation_id AS delegationId,
               home_id AS homeId,
               pico_identity_fingerprint_hex AS picoIdentityFingerprintHex,
               device_signing_key_fingerprint_hex AS deviceSigningKeyFingerprintHex,
               device_key_agreement_key_fingerprint_hex AS deviceKeyAgreementKeyFingerprintHex,
               device_key_agreement_key_record_json AS keyJson
        FROM pico_identity_reader_key
        WHERE delegation_id = ?
          AND home_id = ?
          AND pico_identity_fingerprint_hex = ?
          AND device_key_agreement_key_fingerprint_hex = ?
      `)
      .get(
        params.delegationId,
        params.homeId,
        params.picoIdentityFingerprintHex,
        params.deviceKeyAgreementKeyFingerprintHex,
      ) as PicoIdentityReaderKeyRow | undefined;
    if (row === undefined) {
      return undefined;
    }

    try {
      const keyRecord = JSON.parse(row.keyJson) as PicoIdentityKeyRecordSignatureInput;
      if (keyRecord.suite !== picoIdentitySuite
        || keyRecord.keyRole !== 'device_key_agreement'
        || !verifyPicoIdentityKeyRecordFingerprint(params.sodium, {
          keyRecord,
          expectedFingerprintHex: row.deviceKeyAgreementKeyFingerprintHex,
        })) {
        return undefined;
      }

      const lifecycle = this.picoIdentityLifecycleIndex(
        params.sodium,
        params.picoIdentityFingerprintHex,
      );
      if (lifecycle === undefined) {
        return undefined;
      }
      const active = lifecycle.lookupDelegation(params.delegationId, {
        at,
        requiredScopes: ['decrypt_domain', 'receive_key_envelope'],
      });
      if (active.status !== 'active'
        || active.delegation === undefined
        || active.delegation.subjectSigningKeyFingerprintHex !== row.deviceSigningKeyFingerprintHex
        || active.delegation.subjectKeyAgreementKeyFingerprintHex !== row.deviceKeyAgreementKeyFingerprintHex) {
        return undefined;
      }

      return {
        homeId: row.homeId,
        picoIdentityFingerprintHex: row.picoIdentityFingerprintHex,
        deviceSigningKeyFingerprintHex: row.deviceSigningKeyFingerprintHex,
        deviceKeyAgreementKeyFingerprintHex: row.deviceKeyAgreementKeyFingerprintHex,
        deviceKeyAgreementKeyRecord: keyRecord,
        delegationId: row.delegationId,
        delegationLifecycleOrder: active.delegation.lifecycleOrder,
        locallyObservedThroughLifecycleOrder:
          active.freshestLifecycleOrder ?? active.delegation.lifecycleOrder,
        validUntil: active.delegation.validUntil,
      };
    } catch {
      return undefined;
    }
  }

  public reconcilePicoIdentityLifecycleEvidence(
    sodium: IdentityVerificationSodium,
  ): { droppedDelegations: number; droppedRevocations: number; droppedReaderKeys: number } {
    this.ensureOpen();
    const issuers = this.db
      .prepare(`
        SELECT DISTINCT issuer_pico_identity_fingerprint_hex AS issuer
        FROM pico_identity_delegation
        ORDER BY issuer
      `)
      .all()
      .map((row) => (row as { issuer: string }).issuer);
    let droppedDelegations = 0;
    let droppedRevocations = 0;
    let droppedReaderKeys = 0;

    const reconcile = this.db.transaction(() => {
      for (const issuer of issuers) {
        const rows = this.db
          .prepare(`
            SELECT delegation_json AS recordJson,
                   issuer_identity_key_record_json AS keyJson,
                   signature_hex AS signatureHex
            FROM pico_identity_delegation
            WHERE issuer_pico_identity_fingerprint_hex = ?
            ORDER BY lifecycle_order ASC, delegation_id ASC
          `)
          .all(issuer) as SignedEvidenceRow[];
        if (rows.length === 0) {
          continue;
        }

        try {
          const identityKeyRecord = JSON.parse(rows[0]!.keyJson) as PicoIdentityKeyRecordSignatureInput;
          const signedDelegations = rows.map((row) => ({
            record: JSON.parse(row.recordJson) as PicoIdentitySignedDelegation['record'],
            signatureHex: row.signatureHex,
          }));
          createVerifiedPicoIdentityLifecycleIndex(sodium, {
            issuerIdentityKeyRecord: identityKeyRecord,
            signedDelegations,
            signedRevocations: this.picoIdentitySignedRevocations(issuer),
          });
        } catch {
          droppedReaderKeys += this.db
            .prepare('DELETE FROM pico_identity_reader_key WHERE pico_identity_fingerprint_hex = ?')
            .run(issuer).changes;
          droppedRevocations += this.db
            .prepare('DELETE FROM pico_identity_revocation WHERE issuer_pico_identity_fingerprint_hex = ?')
            .run(issuer).changes;
          droppedDelegations += this.db
            .prepare('DELETE FROM pico_identity_delegation WHERE issuer_pico_identity_fingerprint_hex = ?')
            .run(issuer).changes;
        }
      }

      // No accepted delegation means no locally anchored identity evidence.
      droppedRevocations += this.db
        .prepare(`
          DELETE FROM pico_identity_revocation
          WHERE issuer_pico_identity_fingerprint_hex NOT IN (
            SELECT DISTINCT issuer_pico_identity_fingerprint_hex
            FROM pico_identity_delegation
          )
        `)
        .run().changes;

      droppedReaderKeys += this.db
        .prepare(`
          DELETE FROM pico_identity_reader_key
          WHERE delegation_id NOT IN (
            SELECT delegation_id FROM pico_identity_delegation
          )
        `)
        .run().changes;

      const readerKeys = this.db
        .prepare(`
          SELECT delegation_id AS delegationId,
                 home_id AS homeId,
                 pico_identity_fingerprint_hex AS picoIdentityFingerprintHex,
                 device_signing_key_fingerprint_hex AS deviceSigningKeyFingerprintHex,
                 device_key_agreement_key_fingerprint_hex AS deviceKeyAgreementKeyFingerprintHex,
                 device_key_agreement_key_record_json AS keyJson
          FROM pico_identity_reader_key
          ORDER BY delegation_id
        `)
        .all() as PicoIdentityReaderKeyRow[];
      for (const readerKey of readerKeys) {
        if (!this.isStructurallyValidPicoIdentityReaderKey(readerKey, sodium)) {
          droppedReaderKeys += this.db
            .prepare('DELETE FROM pico_identity_reader_key WHERE delegation_id = ?')
            .run(readerKey.delegationId).changes;
        }
      }
    });
    reconcile();

    return { droppedDelegations, droppedRevocations, droppedReaderKeys };
  }

  public reconcilePicoHomeDeviceLifecycleTransitions(
    sodium: PicoHomeDeviceLifecycleSodium,
  ): PicoHomeDeviceLifecycleReconciliationResult {
    this.ensureOpen();
    if (!tableExists(this.db, 'pico_home_device_lifecycle_transition')) {
      return {
        verifiedTransitions: 0,
        reprojectedTransitions: 0,
        quarantinedIdentities: [],
      };
    }
    const claim = this.picoHomeClaimState();
    const rows = this.db
      .prepare(`
        SELECT transition_id AS transitionId,
               action,
               home_id AS homeId,
               pico_identity_fingerprint_hex AS picoIdentityFingerprintHex,
               sponsor_delegation_id AS sponsorDelegationId,
               target_delegation_id AS targetDelegationId,
               submission_digest_hex AS submissionDigestHex,
               lifecycle_record_json AS recordJson,
               accepted_at AS acceptedAt
        FROM pico_home_device_lifecycle_transition
        ORDER BY accepted_at ASC, transition_id ASC
      `)
      .all() as PicoHomeDeviceLifecycleTransitionRow[];

    const verified: {
      row: PicoHomeDeviceLifecycleTransitionRow;
      record: PicoHomeDeviceLifecycleRecord;
    }[] = [];
    const quarantined = new Set<string>();
    for (const row of rows) {
      try {
        const record = JSON.parse(row.recordJson) as PicoHomeDeviceLifecycleRecord;
        if (!verifyStoredPicoHomeDeviceLifecycleRecord(sodium, claim, row, record)) {
          quarantined.add(row.picoIdentityFingerprintHex);
          continue;
        }
        verified.push({ row, record });
      } catch {
        quarantined.add(row.picoIdentityFingerprintHex);
      }
    }

    this.db.transaction(() => {
      for (const { row, record } of verified) {
        if (quarantined.has(row.picoIdentityFingerprintHex)) {
          continue;
        }
        const evidence = record.submission.evidence;
        const lifecycle = this.recordPicoIdentityLifecycleEvidence({
          identityKeyRecord: evidence.identityKeyRecord,
          delegation: evidence.delegation ?? undefined,
          revocations: evidence.revocations,
          sodium,
          recordedAt: record.receipt.acceptedAt,
        });
        if (!lifecycle.ok) {
          quarantined.add(row.picoIdentityFingerprintHex);
          continue;
        }

        if (evidence.action !== 'revoke') {
          const keyRecord = evidence.targetDeviceKeyAgreementKeyRecord;
          if (keyRecord === null) {
            quarantined.add(row.picoIdentityFingerprintHex);
            continue;
          }
          const keyJson = serializePayload(keyRecord);
          const existing = this.db
            .prepare(`
              SELECT home_id AS homeId,
                     pico_identity_fingerprint_hex AS picoIdentityFingerprintHex,
                     device_signing_key_fingerprint_hex AS deviceSigningKeyFingerprintHex,
                     device_key_agreement_key_fingerprint_hex AS deviceKeyAgreementKeyFingerprintHex,
                     device_key_agreement_key_record_json AS keyJson
              FROM pico_identity_reader_key
              WHERE delegation_id = ?
            `)
            .get(evidence.targetDelegationId) as PicoIdentityReaderKeyRow | undefined;
          if (existing !== undefined
            && (
              existing.homeId !== row.homeId
              || existing.picoIdentityFingerprintHex !== row.picoIdentityFingerprintHex
              || existing.deviceSigningKeyFingerprintHex
                !== evidence.targetDeviceSigningKeyFingerprintHex
              || existing.deviceKeyAgreementKeyFingerprintHex
                !== evidence.targetDeviceKeyAgreementKeyFingerprintHex
              || existing.keyJson !== keyJson
            )) {
            quarantined.add(row.picoIdentityFingerprintHex);
            continue;
          }
          this.db
            .prepare(`
              INSERT INTO pico_identity_reader_key (
                delegation_id,
                home_id,
                pico_identity_fingerprint_hex,
                device_signing_key_fingerprint_hex,
                device_key_agreement_key_fingerprint_hex,
                device_key_agreement_key_record_json,
                registered_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(delegation_id) DO NOTHING
            `)
            .run(
              evidence.targetDelegationId,
              row.homeId,
              row.picoIdentityFingerprintHex,
              evidence.targetDeviceSigningKeyFingerprintHex,
              evidence.targetDeviceKeyAgreementKeyFingerprintHex,
              keyJson,
              record.receipt.acceptedAt,
            );
        }
      }

      for (const identity of quarantined) {
        this.db
          .prepare('DELETE FROM pico_identity_reader_key WHERE pico_identity_fingerprint_hex = ?')
          .run(identity);
        this.db
          .prepare('DELETE FROM pico_identity_revocation WHERE issuer_pico_identity_fingerprint_hex = ?')
          .run(identity);
        this.db
          .prepare('DELETE FROM pico_identity_delegation WHERE issuer_pico_identity_fingerprint_hex = ?')
          .run(identity);
      }
    })();

    return {
      verifiedTransitions: verified.length,
      reprojectedTransitions: verified.filter(
        ({ row }) => !quarantined.has(row.picoIdentityFingerprintHex),
      ).length,
      quarantinedIdentities: [...quarantined].sort(),
    };
  }

  /**
   * ADR 0110 R2. A consumed recovery is evidence, not merely a projection:
   * boot re-verifies the root and target signatures plus the host receipt,
   * then rebuilds the lifecycle and reader-key projection. Any altered record
   * quarantines all device authority for that identity, matching ADR 0109.
   * Pending rows are intentionally left in place; only an elapsed completion
   * window changes them, and a restart never restarts either clock.
   *
   * ADR 0110 R6 adds the anchor cross-check. Boot is where a restored
   * database first meets the anchor that outlived it, so this is where the
   * rollback becomes visible: resolutions the anchor knows are re-applied to
   * rows the restore rewound, a Home with recovery history but no anchor is
   * reported as `anchor_lost`, and a fresh Home silently seeds an empty one.
   * Nothing here grants anything - the strongest thing it can do is refuse.
   */
  public reconcilePicoHomeDeviceRecoveries(
    sodium: PicoHomeDeviceLifecycleSodium,
    reconciledAt: string = new Date().toISOString(),
  ): PicoHomeDeviceRecoveryReconciliationResult {
    this.ensureOpen();
    if (!tableExists(this.db, 'pico_home_device_recovery')) {
      return {
        verifiedRecoveries: 0,
        reprojectedRecoveries: 0,
        lapsedPending: 0,
        quarantinedIdentities: [],
        anchorStatus: this.recoveryAnchor === undefined ? 'absent' : 'live',
        resurrectedRecoveryIds: [],
      };
    }

    /*
     * **In einer Transaktion, seit Befund B164 (2026-09-13).** Zwei Handlungen
     * standen hier als zwei da: der Ankerabgleich schreibt die zurueckgerollten
     * Zeilen Stueck fuer Stueck auf ihren aufgeloesten Stand, und *danach*
     * raeumt eine eigene Transaktion die Projektionen der Betroffenen ab. Der
     * Kommentar beim Einsammeln sagt es bereits: "Reporting an identity as
     * quarantined while leaving its delegations and reader keys projected would
     * be the worst of both worlds."
     *
     * Hergestellt, nicht geschlossen: bricht es dazwischen ab, sind die Zeilen
     * geschrieben und die Quarantaene nicht. Der naechste Start findet dann
     * nichts mehr zum Zurueckschieben - und meldet `live` statt
     * `rollback_detected`. Die Quarantaene selbst faellt trotzdem, ueber die
     * Pruefung der Beweise; **verloren geht der Alarm.** Aus `app.log.error`
     * ("die Daten wurden zurueckgerollt", laut ADR 0110 R6 eine Angriffssignatur)
     * wird ein `app.log.warn` ueber Beweise, die nicht verifizieren. Genau das
     * verbietet der Satz eine Ebene hoeher: beide Ankerfehler sind laut, und
     * keiner darf von jemandem entdeckt werden, der auf eine Wiederherstellung
     * wartet.
     *
     * **Berichtigung am 2026-09-14 (B166).** Hier stand zuerst, die Ankerdatei
     * bleibe aussen vor. Das ist falsch: `reconcilePicoHomeRecoveryAnchor`
     * kehrt zwar nach dem Saeen zurueck, *diese* Methode aber laeuft weiter,
     * also liegt der Dateischreibvorgang **in** der Transaktion, und ein
     * Ruecklauf nimmt ihn nicht mit. Der Schluss - harmlos - stimmt trotzdem,
     * aus zwei nachpruefbaren Gruenden:
     *
     * - Gesaeet wird nur, wenn der Anker leer ist *und* keine einzige
     *   Wiederherstellungszeile existiert. Auf diesem Zweig folgt danach kein
     *   Schreibvorgang mehr, der scheitern koennte: das Verfallenlassen
     *   trifft null Zeilen, die Pruefschleife laeuft ueber null Zeilen.
     * - Und selbst wenn das Festschreiben selbst scheiterte, bliebe ein
     *   gesaeter Anker ohne Eintraege zurueck, den der naechste Start als
     *   `live` liest. `'seeded'` wird im ganzen Baum erzeugt und nirgends
     *   gelesen; `device-recovery.test.ts` geht genau diesen Uebergang.
     *
     * Ein Satz, der beruhigt, ist kein Beleg - auch dann nicht, wenn er von
     * gestern und von mir ist.
     */
    return this.db.transaction(() => {
      const anchorReconciliation = this.reconcilePicoHomeRecoveryAnchor(reconciledAt);

      const lapsedPending = this.db
        .prepare(`
          UPDATE pico_home_device_recovery
          SET status = 'lapsed',
              resolved_at = ?
          WHERE status = 'pending'
            AND completion_expires_at <= ?
        `)
        .run(reconciledAt, reconciledAt).changes;
      const claim = this.picoHomeClaimState();
      const rows = this.db
        .prepare(`
          SELECT recovery_id AS recoveryId,
                 home_id AS homeId,
                 pico_identity_fingerprint_hex AS picoIdentityFingerprintHex,
                 status,
                 target_delegation_id AS targetDelegationId,
                 target_device_signing_key_fingerprint_hex
                   AS targetDeviceSigningKeyFingerprintHex,
                 target_device_key_agreement_key_fingerprint_hex
                   AS targetDeviceKeyAgreementKeyFingerprintHex,
                 observed_lifecycle_order AS observedLifecycleOrder,
                 evidence_digest_hex AS evidenceDigestHex,
                 claim_digest_hex AS claimDigestHex,
                 submission_json AS submissionJson,
                 accepted_at AS acceptedAt,
                 effective_at AS effectiveAt,
                 completion_expires_at AS completionExpiresAt,
                 resolved_at AS resolvedAt,
                 superseded_by_recovery_id AS supersededByRecoveryId,
                 recovery_record_json AS recoveryRecordJson
          FROM pico_home_device_recovery
          WHERE status = 'consumed'
          ORDER BY resolved_at ASC, recovery_id ASC
        `)
        .all() as PicoHomeDeviceRecoveryRow[];
      const verified: {
        row: PicoHomeDeviceRecoveryRow;
        record: PicoHomeDeviceRecoveryRecord;
      }[] = [];
      // Seeded from the anchor pass so that the projection-clearing transaction
      // below actually covers rollback victims. Reporting an identity as
      // quarantined while leaving its delegations and reader keys projected
      // would be the worst of both worlds.
      const quarantined = new Set<string>(anchorReconciliation.quarantinedIdentities);

      for (const row of rows) {
        try {
          if (row.recoveryRecordJson === null) {
            throw new Error('missing_recovery_record');
          }
          const record =
            JSON.parse(row.recoveryRecordJson) as PicoHomeDeviceRecoveryRecord;
          if (!verifyStoredPicoHomeDeviceRecoveryRecord(
            sodium,
            claim,
            row,
            record,
          )) {
            throw new Error('invalid_recovery_record');
          }
          verified.push({ row, record });
        } catch {
          quarantined.add(row.picoIdentityFingerprintHex);
        }
      }

      this.db.transaction(() => {
        for (const { row, record } of verified) {
          if (quarantined.has(row.picoIdentityFingerprintHex)) {
            continue;
          }
          const evidence = record.submission.evidence;
          const lifecycle = this.recordPicoIdentityLifecycleEvidence({
            identityKeyRecord: evidence.identityKeyRecord,
            delegation: evidence.delegation,
            revocations: evidence.revocations,
            sodium,
            recordedAt: record.receipt.completedAt,
          });
          if (!lifecycle.ok) {
            quarantined.add(row.picoIdentityFingerprintHex);
            continue;
          }
          const reader = this.registerPicoIdentityReaderKey({
            picoIdentityFingerprintHex: row.picoIdentityFingerprintHex,
            deviceSigningKeyFingerprintHex:
              row.targetDeviceSigningKeyFingerprintHex,
            delegationId: row.targetDelegationId,
            deviceKeyAgreementKeyRecord:
              evidence.targetDeviceKeyAgreementKeyRecord,
            sodium,
            at: record.receipt.completedAt,
            registeredAt: record.receipt.completedAt,
          });
          if (!reader.ok) {
            quarantined.add(row.picoIdentityFingerprintHex);
            continue;
          }
          const resulting = this.picoHomeDeviceLifecycleView({
            picoIdentityFingerprintHex: row.picoIdentityFingerprintHex,
            sodium,
            at: record.receipt.completedAt,
          });
          if (
            resulting === undefined
            || resulting.observedLifecycleOrder
              !== record.receipt.resultingLifecycleOrder
            || resulting.devices.filter(
              (device) => device.status === 'active',
            ).length !== 1
            || resulting.devices.find(
              (device) => device.status === 'active',
            )?.delegationId !== row.targetDelegationId
          ) {
            quarantined.add(row.picoIdentityFingerprintHex);
          }
        }

        for (const identity of quarantined) {
          this.db
            .prepare(`
              DELETE FROM pico_identity_reader_key
              WHERE pico_identity_fingerprint_hex = ?
            `)
            .run(identity);
          this.db
            .prepare(`
              DELETE FROM pico_identity_revocation
              WHERE issuer_pico_identity_fingerprint_hex = ?
            `)
            .run(identity);
          this.db
            .prepare(`
              DELETE FROM pico_identity_delegation
              WHERE issuer_pico_identity_fingerprint_hex = ?
            `)
            .run(identity);
        }
      })();

      return {
        verifiedRecoveries: verified.length,
        reprojectedRecoveries: verified.filter(
          ({ row }) => !quarantined.has(row.picoIdentityFingerprintHex),
        ).length,
        lapsedPending,
        quarantinedIdentities: [...quarantined].sort(),
        anchorStatus: anchorReconciliation.anchorStatus,
        resurrectedRecoveryIds: anchorReconciliation.resurrectedRecoveryIds,
      };
    })();
  }

  /**
   * ADR 0110 R6. Reconciles the durable anchor against the restorable rows.
   *
   * Three outcomes matter. A fresh Home with no recovery history seeds an
   * empty anchor silently, so a normal installation never notices this
   * machinery. A Home whose rows show recovery history but whose anchor is
   * empty cannot tell a wiped anchor from a rollback, so it stays empty and
   * reports `anchor_lost`: every completion then fails closed until an
   * operator re-seeds explicitly. Where the anchor holds a resolution the
   * rows no longer carry, the rollback is concrete - those rows are pushed
   * back to their resolved state and the identity is quarantined, because
   * this Home has lost evidence it once projected.
   */
  private reconcilePicoHomeRecoveryAnchor(reconciledAt: string): {
    anchorStatus: PicoHomeDeviceRecoveryReconciliationResult['anchorStatus'];
    resurrectedRecoveryIds: string[];
    quarantinedIdentities: string[];
  } {
    const anchor = this.recoveryAnchor;
    if (anchor === undefined) {
      return {
        anchorStatus: 'absent',
        resurrectedRecoveryIds: [],
        quarantinedIdentities: [],
      };
    }

    const rowCount = (this.db
      .prepare('SELECT COUNT(*) AS count FROM pico_home_device_recovery')
      .get() as { count: number }).count;

    if (anchor.isEmpty()) {
      if (rowCount === 0) {
        anchor.seed({ homeId: this.picoHomeClaimState().homeId ?? null, entries: [] });
        return {
          anchorStatus: 'seeded',
          resurrectedRecoveryIds: [],
          quarantinedIdentities: [],
        };
      }
      return {
        anchorStatus: 'anchor_lost',
        resurrectedRecoveryIds: [],
        quarantinedIdentities: [],
      };
    }

    const resurrected: string[] = [];
    const quarantined = new Set<string>();
    for (const entry of anchor.document().entries) {
      if (entry.state === 'accepted') {
        continue;
      }
      const row = this.db
        .prepare(`
          SELECT status, claim_digest_hex AS claimDigestHex
          FROM pico_home_device_recovery
          WHERE recovery_id = ?
        `)
        .get(entry.recoveryId) as
          | { status: PicoHomeDeviceRecoveryRow['status']; claimDigestHex: string }
          | undefined;
      if (row === undefined) {
        // The rows were rewound past this recovery's very existence, so
        // nothing can be re-applied here at all.
        resurrected.push(entry.recoveryId);
        if (entry.state === 'consumed') {
          quarantined.add(entry.picoIdentityFingerprintHex);
        }
        continue;
      }
      const substituted = row.claimDigestHex !== entry.claimDigestHex;
      if (substituted || row.status === 'pending') {
        resurrected.push(entry.recoveryId);
        // Quarantine follows lost evidence, not mere rewinding. A consumed
        // recovery changed the device set, and a database that no longer
        // carries its record cannot prove the projection it is showing - so
        // that identity's authority goes. A vetoed or superseded recovery
        // never changed device authority, so restoring its resolution is
        // enough; quarantining there would punish an identity for an
        // operator's restore. A claim-digest substitution is quarantined
        // regardless, because the id no longer denotes what the anchor saw.
        if (entry.state === 'consumed' || substituted) {
          quarantined.add(entry.picoIdentityFingerprintHex);
        }
        this.db
          .prepare(`
            UPDATE pico_home_device_recovery
            SET status = ?,
                resolved_at = COALESCE(resolved_at, ?)
            WHERE recovery_id = ?
          `)
          .run(entry.state, reconciledAt, entry.recoveryId);
      }
    }

    return {
      anchorStatus: resurrected.length > 0 ? 'rollback_detected' : 'live',
      resurrectedRecoveryIds: resurrected.sort(),
      quarantinedIdentities: [...quarantined].sort(),
    };
  }

  /**
   * ADR 0114 T3. Registers the reader key of a rotated identity's first
   * device once that identity has a membership again.
   *
   * The delegation is the successor root's own act and stands immediately;
   * the reader key additionally needs an active membership, which only the
   * Home Host Pico can re-issue. Being unable to register yet is therefore
   * the stated cost of rotation - the person waits for their issuer - and is
   * reported as debt, not as failure. Returns false only for an anomaly that
   * no re-issue can fix.
   */
  private registerPicoIdentityRotationSuccessorReaderKey(
    sodium: PicoHomeDeviceLifecycleSodium,
    successorIdentityFingerprintHex: string,
    at: string,
  ): boolean {
    const row = this.db
      .prepare(`
        SELECT successor_first_device_delegation_id AS delegationId,
               successor_first_device_signing_key_fingerprint_hex
                 AS deviceSigningKeyFingerprintHex,
               record_json AS recordJson
        FROM pico_identity_root_rotation
        WHERE home_id = ?
          AND successor_identity_fingerprint_hex = ?
          AND status = 'effective'
          AND successor_first_device_projected_at IS NOT NULL
        ORDER BY effective_at DESC, rotation_id ASC
        LIMIT 1
      `)
      .get(this.picoHomeRotationScope(), successorIdentityFingerprintHex) as {
        delegationId: string;
        deviceSigningKeyFingerprintHex: string;
        recordJson: string;
      } | undefined;
    if (row === undefined) {
      return true;
    }

    let deviceKeyAgreementKeyRecord: PicoIdentityKeyRecordSignatureInput;
    try {
      deviceKeyAgreementKeyRecord = (JSON.parse(row.recordJson) as {
        successorFirstDevice: PicoIdentityRotationSuccessorFirstDevice;
      }).successorFirstDevice.deviceKeyAgreementKeyRecord;
    } catch {
      return false;
    }

    const registered = this.registerPicoIdentityReaderKey({
      sodium,
      picoIdentityFingerprintHex: successorIdentityFingerprintHex,
      deviceSigningKeyFingerprintHex: row.deviceSigningKeyFingerprintHex,
      delegationId: row.delegationId,
      deviceKeyAgreementKeyRecord,
      at,
      registeredAt: at,
    });
    return registered.ok
      // Owed, not broken: the issuer has not acted yet, or the delegation's
      // own validity window has not opened.
      || registered.reason === 'identity_is_not_active_member'
      || registered.reason === 'inactive_reader_delegation';
  }

  /**
   * ADR 0114 T2. Boot re-verifies every stored rotation before honoring it and
   * promotes those whose veto window has passed.
   *
   * A rotation ends an identity's whole device authority, so a tampered record
   * would be a way to lock someone out of their own Home by editing a row.
   * Both signatures and both key records are therefore checked again from the
   * stored evidence, exactly as ADR 0109 does for lifecycle receipts, and a
   * record that no longer verifies quarantines that identity rather than
   * being honored or silently dropped.
   */
  public reconcilePicoIdentityRootRotations(
    sodium: PicoHomeDeviceLifecycleSodium,
    reconciledAt: string = new Date().toISOString(),
  ): PicoIdentityRootRotationReconciliationResult {
    this.ensureOpen();
    if (!tableExists(this.db, 'pico_identity_root_rotation')) {
      return {
        verifiedRotations: 0,
        effectiveRotations: 0,
        projectedSuccessorDevices: 0,
        foreignRotations: 0,
        quarantinedIdentities: [],
      };
    }

    const rows = this.db
      .prepare(`
        SELECT rotation_id AS rotationId,
               predecessor_identity_fingerprint_hex AS predecessorIdentityFingerprintHex,
               successor_identity_fingerprint_hex AS successorIdentityFingerprintHex,
               status,
               effective_at AS effectiveAt,
               successor_first_device_delegation_id AS successorFirstDeviceDelegationId,
               successor_first_device_signing_key_fingerprint_hex
                 AS successorFirstDeviceSigningKeyFingerprintHex,
               successor_first_device_key_agreement_key_fingerprint_hex
                 AS successorFirstDeviceKeyAgreementKeyFingerprintHex,
               successor_first_device_projected_at AS successorFirstDeviceProjectedAt,
               record_json AS recordJson
        FROM pico_identity_root_rotation
        WHERE home_id = ?
          AND status IN ('pending', 'effective')
        ORDER BY accepted_at ASC, rotation_id ASC
      `)
      .all(this.picoHomeRotationScope()) as {
        rotationId: string;
        predecessorIdentityFingerprintHex: string;
        successorIdentityFingerprintHex: string;
        status: 'pending' | 'effective';
        effectiveAt: string;
        successorFirstDeviceDelegationId: string;
        successorFirstDeviceSigningKeyFingerprintHex: string;
        successorFirstDeviceKeyAgreementKeyFingerprintHex: string;
        successorFirstDeviceProjectedAt: string | null;
        recordJson: string;
      }[];

    // ADR 0114 T5. Rows that belong to another Home are counted, not acted on:
    // they decide nothing here, and staying silent about them would make a
    // merged or misrestored database look like an empty one.
    const foreignRotations = (this.db
      .prepare(`
        SELECT COUNT(*) AS count
        FROM pico_identity_root_rotation
        WHERE home_id IS NOT ?
      `)
      .get(this.picoHomeRotationScope()) as { count: number }).count;

    const quarantined = new Set<string>();
    const promotions: typeof rows = [];
    const projections: {
      row: (typeof rows)[number];
      stored: { successorIdentityKeyRecord: PicoIdentityKeyRecordSignatureInput;
        successorFirstDevice: PicoIdentityRotationSuccessorFirstDevice; };
    }[] = [];
    let verified = 0;
    let effective = 0;
    let projected = 0;

    for (const row of rows) {
      let stored: {
        rotation: PicoIdentityRotationSignatureInput;
        predecessorIdentityKeyRecord: PicoIdentityKeyRecordSignatureInput;
        successorIdentityKeyRecord: PicoIdentityKeyRecordSignatureInput;
        predecessorSignatureHex: string;
        successorSignatureHex: string;
        successorFirstDevice: PicoIdentityRotationSuccessorFirstDevice;
      };
      try {
        stored = JSON.parse(row.recordJson) as typeof stored;
        const firstDevice = stored.successorFirstDevice.delegation.record;
        // The successor's first device is the person's way back in, so it is
        // re-verified with the same suspicion as the rotation itself: a device
        // swapped here would hand the identity to whoever edited the row.
        createVerifiedPicoIdentityLifecycleIndex(sodium, {
          issuerIdentityKeyRecord: stored.successorIdentityKeyRecord,
          signedDelegations: [stored.successorFirstDevice.delegation],
          signedRevocations: [],
        });
        if (
          stored.rotation.rotationId !== row.rotationId
          || stored.rotation.predecessorIdentityKeyFingerprintHex
            !== row.predecessorIdentityFingerprintHex
          || stored.rotation.successorIdentityKeyFingerprintHex
            !== row.successorIdentityFingerprintHex
          || firstDevice.delegationId !== row.successorFirstDeviceDelegationId
          || firstDevice.subjectSigningKeyFingerprintHex
            !== row.successorFirstDeviceSigningKeyFingerprintHex
          || firstDevice.subjectKeyAgreementKeyFingerprintHex
            !== row.successorFirstDeviceKeyAgreementKeyFingerprintHex
          || !verifyPicoIdentityRotationSignatures(sodium, {
            predecessorIdentityKeyRecord: stored.predecessorIdentityKeyRecord,
            successorIdentityKeyRecord: stored.successorIdentityKeyRecord,
            rotation: stored.rotation,
            predecessorSignatureHex: stored.predecessorSignatureHex,
            successorSignatureHex: stored.successorSignatureHex,
          })
        ) {
          throw new Error('invalid_rotation_record');
        }
      } catch {
        quarantined.add(row.predecessorIdentityFingerprintHex);
        continue;
      }
      verified += 1;

      // ADR 0120 N2. The rotation veto is an objection window too, and a
      // rotation promoted early is a predecessor root retired before the
      // person could stop it.
      if (hasPicoObjectionWindowElapsed({
        endsAtMs: Date.parse(row.effectiveAt),
        nowMs: Date.parse(reconciledAt),
        anchorFloorMs: anchorFloorMs(this.recoveryAnchor),
      })) {
        effective += 1;
        if (row.status !== 'effective') {
          promotions.push(row);
        }
        if (row.successorFirstDeviceProjectedAt === null) {
          projections.push({ row, stored });
        }
      }
    }

    // Promotion and quarantine are one decision, so they commit together: no
    // reader may observe a rotation already in force while the identity whose
    // evidence failed is still authorized.
    this.db.transaction(() => {
      for (const row of promotions) {
        this.db
          .prepare(`
            UPDATE pico_identity_root_rotation
            SET status = 'effective',
                resolved_at = COALESCE(resolved_at, ?)
            WHERE rotation_id = ?
              AND home_id = ?
              AND status = 'pending'
          `)
          .run(row.effectiveAt, row.rotationId, this.picoHomeRotationScope());
      }

      // ADR 0114 T3. The rotation revoked every device the old root delegated,
      // so the same commit hands the successor the one device the record
      // named. Without this the person is locked out of their own Home by the
      // ceremony that was supposed to save them.
      for (const { row, stored } of projections) {
        const lifecycle = this.recordPicoIdentityLifecycleEvidence({
          sodium,
          identityKeyRecord: stored.successorIdentityKeyRecord,
          delegation: stored.successorFirstDevice.delegation,
          revocations: [],
          recordedAt: row.effectiveAt,
        });
        if (!lifecycle.ok) {
          // The successor's own device set is what is in doubt here, so it is
          // the successor whose authority is withdrawn - the predecessor's
          // already ended with the rotation.
          quarantined.add(row.successorIdentityFingerprintHex);
          continue;
        }
        projected += 1;
        this.db
          .prepare(`
            UPDATE pico_identity_root_rotation
            SET successor_first_device_projected_at = ?
            WHERE rotation_id = ?
              AND home_id = ?
          `)
          .run(row.effectiveAt, row.rotationId, this.picoHomeRotationScope());
        if (!this.registerPicoIdentityRotationSuccessorReaderKey(
          sodium,
          row.successorIdentityFingerprintHex,
          reconciledAt,
        )) {
          quarantined.add(row.successorIdentityFingerprintHex);
        }
      }

      // A rotation whose evidence no longer verifies must not decide anything
      // - neither for nor against the identity - so its device authority is
      // withdrawn until a human looks (the ADR 0109 rule).
      for (const identity of quarantined) {
        this.db
          .prepare(`
            DELETE FROM pico_identity_reader_key
            WHERE pico_identity_fingerprint_hex = ?
          `)
          .run(identity);
      }
    })();

    return {
      verifiedRotations: verified,
      effectiveRotations: effective,
      projectedSuccessorDevices: projected,
      foreignRotations,
      quarantinedIdentities: [...quarantined].sort(),
    };
  }

  /**
   * ADR 0110 R6. The explicit, audited re-seed after anchor loss. It rebuilds
   * only terminal knowledge from the rows: pending recoveries are deliberately
   * not seeded as accepted, because a restored pending row is exactly what an
   * attacker would want re-blessed. Those recoveries must be initiated again,
   * which costs 3+N root approvals and a fresh veto window - and creates no
   * authority by itself.
   */
  public reseedPicoHomeRecoveryAnchor(): {
    ok: boolean;
    seededEntries: number;
    reason?: 'anchor_absent' | 'anchor_not_empty';
  } {
    this.ensureOpen();
    const anchor = this.recoveryAnchor;
    if (anchor === undefined) {
      return { ok: false, seededEntries: 0, reason: 'anchor_absent' };
    }
    if (!anchor.isEmpty()) {
      return { ok: false, seededEntries: 0, reason: 'anchor_not_empty' };
    }
    const rows = this.db
      .prepare(`
        SELECT recovery_id AS recoveryId,
               claim_digest_hex AS claimDigestHex,
               pico_identity_fingerprint_hex AS picoIdentityFingerprintHex,
               status,
               resolved_at AS resolvedAt,
               completion_expires_at AS completionExpiresAt
        FROM pico_home_device_recovery
        WHERE status IN ('consumed', 'vetoed', 'superseded')
        ORDER BY resolved_at ASC, recovery_id ASC
      `)
      .all() as {
        recoveryId: string;
        claimDigestHex: string;
        picoIdentityFingerprintHex: string;
        status: 'consumed' | 'vetoed' | 'superseded';
        resolvedAt: string | null;
        completionExpiresAt: string;
      }[];
    anchor.seed({
      homeId: this.picoHomeClaimState().homeId ?? null,
      entries: rows.map((row) => ({
        recoveryId: row.recoveryId,
        claimDigestHex: row.claimDigestHex,
        picoIdentityFingerprintHex: row.picoIdentityFingerprintHex,
        state: row.status,
        updatedAt: row.resolvedAt ?? new Date().toISOString(),
        expiresAt: row.completionExpiresAt,
      })),
    });
    return { ok: true, seededEntries: rows.length };
  }

  public recordPicoHomeDomainReadGrant(params: {
    sodium: IdentityVerificationSodium;
    record: PicoHomeDomainReadGrantRecord;
  }): PicoHomeDomainReadGrantRecordResult {
    this.ensureOpen();
    const foundingRecord = this.picoHomeFoundingRecord();
    if (foundingRecord === undefined) {
      return { ok: false, reason: 'no_founding_record' };
    }

    const intakeHead = this.currentPicoHomeHostKeyHead();
    const verification = verifyPicoHomeDomainReadGrant(params.sodium, {
      record: params.record,
      foundingRecord,
      // ADR 0115: new grants are stamped by the Home as it is now.
      acceptedHostSigningKeyFingerprintHexes: intakeHead === undefined
        ? undefined
        : [intakeHead.hostSigningKeyFingerprintHex],
    });
    if (!verification.ok) {
      return { ok: false, reason: verification.reason };
    }

    const grant = params.record.grant;
    if (!this.hasActivePicoHomeMembership(
      grant.readerPicoIdentityFingerprintHex,
      grant.homeId,
    )) {
      return { ok: false, reason: 'reader_is_not_active_member' };
    }
    if (!this.isExistingHostCustodyDomain(grant.privacyDomain)) {
      return { ok: false, reason: 'domain_is_not_host_custody' };
    }

    const grantJson = serializePayload(grant);
    const keyJson = serializePayload(params.record.issuerIdentityKeyRecord);
    const existing = this.db
      .prepare(`
        SELECT grant_json AS recordJson,
               issuer_identity_key_record_json AS keyJson,
               issuer_signature_hex AS signatureHex
        FROM pico_home_domain_read_grant
        WHERE grant_id = ?
      `)
      .get(grant.grantId) as SignedEvidenceRow | undefined;
    if (existing !== undefined
      && (existing.recordJson !== grantJson
        || existing.keyJson !== keyJson
        || existing.signatureHex !== params.record.issuerSignatureHex)) {
      return { ok: false, reason: 'conflicting_record' };
    }

    const inserted = this.db
      .prepare(`
        INSERT INTO pico_home_domain_read_grant (
          grant_id,
          home_id,
          host_signing_key_fingerprint_hex,
          privacy_domain,
          controller_pico_identity_fingerprint_hex,
          reader_pico_identity_fingerprint_hex,
          valid_from,
          valid_until,
          lifecycle_order,
          grant_json,
          issuer_identity_key_record_json,
          issuer_signature_hex,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(grant_id) DO NOTHING
      `)
      .run(
        grant.grantId,
        grant.homeId,
        grant.hostSigningKeyFingerprintHex,
        grant.privacyDomain,
        grant.controllerPicoIdentityFingerprintHex,
        grant.readerPicoIdentityFingerprintHex,
        grant.validFrom,
        grant.validUntil,
        grant.lifecycleOrder,
        grantJson,
        keyJson,
        params.record.issuerSignatureHex,
        params.record.createdAt,
      ).changes === 1;

    return { ok: true, inserted, grant: this.picoHomeDomainReadGrantView(grant.grantId) };
  }

  public recordPicoHomeDomainReadGrantLifecycle(params: {
    sodium: IdentityVerificationSodium;
    record: PicoHomeDomainReadGrantLifecycleRecord;
  }): PicoHomeDomainReadGrantRecordResult {
    this.ensureOpen();
    const foundingRecord = this.picoHomeFoundingRecord();
    if (foundingRecord === undefined) {
      return { ok: false, reason: 'no_founding_record' };
    }

    const grantRecord = this.picoHomeDomainReadGrantRecord(params.record.lifecycle.grantId);
    if (grantRecord === undefined) {
      return { ok: false, reason: 'unknown_grant' };
    }

    const verification = verifyPicoHomeDomainReadGrantLifecycle(params.sodium, {
      record: params.record,
      grantRecord,
      foundingRecord,
    });
    if (!verification.ok) {
      return { ok: false, reason: verification.reason };
    }

    const lifecycle = params.record.lifecycle;
    const lifecycleJson = serializePayload(lifecycle);
    const keyJson = serializePayload(params.record.issuerIdentityKeyRecord);
    const existing = this.db
      .prepare(`
        SELECT lifecycle_json AS recordJson,
               issuer_identity_key_record_json AS keyJson,
               issuer_signature_hex AS signatureHex
        FROM pico_home_domain_read_grant_lifecycle
        WHERE lifecycle_id = ?
      `)
      .get(lifecycle.lifecycleId) as SignedEvidenceRow | undefined;
    if (existing !== undefined
      && (existing.recordJson !== lifecycleJson
        || existing.keyJson !== keyJson
        || existing.signatureHex !== params.record.issuerSignatureHex)) {
      return { ok: false, reason: 'conflicting_record' };
    }

    const inserted = this.db
      .prepare(`
        INSERT INTO pico_home_domain_read_grant_lifecycle (
          lifecycle_id,
          grant_id,
          home_id,
          privacy_domain,
          reader_pico_identity_fingerprint_hex,
          status,
          reason_category,
          changed_at,
          lifecycle_order,
          lifecycle_json,
          issuer_identity_key_record_json,
          issuer_signature_hex,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(lifecycle_id) DO NOTHING
      `)
      .run(
        lifecycle.lifecycleId,
        lifecycle.grantId,
        lifecycle.homeId,
        lifecycle.privacyDomain,
        lifecycle.readerPicoIdentityFingerprintHex,
        lifecycle.status,
        lifecycle.reasonCategory,
        lifecycle.changedAt,
        lifecycle.lifecycleOrder,
        lifecycleJson,
        keyJson,
        params.record.issuerSignatureHex,
        params.record.createdAt,
      ).changes === 1;

    return { ok: true, inserted, grant: this.picoHomeDomainReadGrantView(lifecycle.grantId) };
  }

  public picoHomeDomainReadGrants(at: string = new Date().toISOString()): PicoHomeDomainReadGrantView[] {
    this.ensureOpen();
    return this.db
      .prepare('SELECT grant_id AS grantId FROM pico_home_domain_read_grant ORDER BY grant_id')
      .all()
      .map((row) => this.picoHomeDomainReadGrantView((row as { grantId: string }).grantId, at));
  }

  public mayReadDomain(
    picoIdentityFingerprintHex: string,
    privacyDomain: string,
    homeId?: string,
    at: string = new Date().toISOString(),
  ): boolean {
    this.ensureOpen();
    const scopedHomeId = homeId ?? this.picoHomeClaimState().homeId ?? undefined;
    if (scopedHomeId === undefined) {
      return false;
    }

    const grantIds = this.db
      .prepare(`
        SELECT grant_id AS grantId
        FROM pico_home_domain_read_grant
        WHERE home_id = ?
          AND reader_pico_identity_fingerprint_hex = ?
          AND privacy_domain = ?
      `)
      .all(scopedHomeId, picoIdentityFingerprintHex, privacyDomain)
      .map((row) => (row as { grantId: string }).grantId);

    return grantIds.some((grantId) => this.picoHomeDomainReadGrantView(grantId, at).status === 'active');
  }

  public reconcilePicoHomeDomainReadGrants(
    sodium: IdentityVerificationSodium,
  ): { droppedGrants: number; droppedLifecycleRecords: number } {
    this.ensureOpen();
    const foundingRecord = this.picoHomeFoundingRecord();
    let droppedGrants = 0;
    let droppedLifecycleRecords = 0;

    const reconcile = this.db.transaction(() => {
      const grantIds = this.db
        .prepare('SELECT grant_id AS grantId FROM pico_home_domain_read_grant ORDER BY grant_id')
        .all()
        .map((row) => (row as { grantId: string }).grantId);

      for (const grantId of grantIds) {
        let grantRecord: PicoHomeDomainReadGrantRecord | undefined;
        try {
          const candidate = this.picoHomeDomainReadGrantRecord(grantId);
          if (foundingRecord !== undefined
            && candidate !== undefined
            && verifyPicoHomeDomainReadGrant(sodium, {
              record: candidate,
              foundingRecord,
              acceptedHostSigningKeyFingerprintHexes:
                this.acceptedPicoHomeHostSigningKeyFingerprintHexes(),
            }).ok) {
            grantRecord = candidate;
          }
        } catch {
          grantRecord = undefined;
        }
        if (foundingRecord === undefined
          || grantRecord === undefined) {
          droppedLifecycleRecords += this.db
            .prepare('DELETE FROM pico_home_domain_read_grant_lifecycle WHERE grant_id = ?')
            .run(grantId).changes;
          droppedGrants += this.db
            .prepare('DELETE FROM pico_home_domain_read_grant WHERE grant_id = ?')
            .run(grantId).changes;
          continue;
        }

        const lifecycleIds = this.db
          .prepare(`
            SELECT lifecycle_id AS lifecycleId
            FROM pico_home_domain_read_grant_lifecycle
            WHERE grant_id = ?
          `)
          .all(grantId)
          .map((row) => (row as { lifecycleId: string }).lifecycleId);
        for (const lifecycleId of lifecycleIds) {
          let lifecycleValid = false;
          try {
            const record = this.picoHomeDomainReadGrantLifecycleRecord(lifecycleId);
            lifecycleValid = record !== undefined
              && verifyPicoHomeDomainReadGrantLifecycle(sodium, {
                record,
                grantRecord,
                foundingRecord,
              }).ok;
          } catch {
            lifecycleValid = false;
          }
          if (!lifecycleValid) {
            droppedLifecycleRecords += this.db
              .prepare('DELETE FROM pico_home_domain_read_grant_lifecycle WHERE lifecycle_id = ?')
              .run(lifecycleId).changes;
          }
        }
      }
    });
    reconcile();

    return { droppedGrants, droppedLifecycleRecords };
  }

  /**
   * Resolves the complete signed authority record for one currently usable
   * grant. Callers never reconstruct issuer authority from the read model.
   */
  public activePicoHomeDomainReadGrantRecord(
    sodium: IdentityVerificationSodium,
    grantId: string,
    at: string = new Date().toISOString(),
  ): PicoHomeDomainReadGrantRecord | undefined {
    this.ensureOpen();
    try {
      const foundingRecord = this.picoHomeFoundingRecord();
      const record = this.picoHomeDomainReadGrantRecord(grantId);
      if (foundingRecord === undefined
        || record === undefined
        || !verifyPicoHomeDomainReadGrant(sodium, {
          record,
          foundingRecord,
          acceptedHostSigningKeyFingerprintHexes:
            this.acceptedPicoHomeHostSigningKeyFingerprintHexes(),
        }).ok
        || this.picoHomeDomainReadGrantView(grantId, at).status !== 'active'
        || !this.hasActivePicoHomeMembership(
          record.grant.readerPicoIdentityFingerprintHex,
          record.grant.homeId,
          at,
        )
        || !this.isExistingHostCustodyDomain(record.grant.privacyDomain)) {
        return undefined;
      }
      return record;
    } catch {
      return undefined;
    }
  }

  public isHostCustodyDomain(privacyDomain: string): boolean {
    this.ensureOpen();
    return this.isExistingHostCustodyDomain(privacyDomain);
  }

  public recordPicoShareEnvelope(params: {
    sodium: PicoShareEnvelopeVerificationSodium;
    issuanceId: string;
    delegationId: string;
    record: PicoShareEnvelopeRecord;
    at?: string;
  }): PicoShareEnvelopeRecordResult {
    this.ensureOpen();
    const candidate: PicoShareEnvelopeStoredRecord = {
      issuanceId: params.issuanceId,
      delegationId: params.delegationId,
      record: params.record,
    };
    if (!this.isPicoShareEnvelopeValid(params.sodium, candidate, params.at)) {
      return { ok: false, reason: this.activePicoHomeDomainReadGrantRecord(
        params.sodium,
        params.record.envelope.grantId,
        params.at,
      ) === undefined ? 'inactive_grant' : 'invalid_envelope' };
    }

    /*
     * ADR 0119 Q5, **Befund B170 (2026-09-14)**. Dieselbe Luecke wie bei den
     * Erinnerungsstuecken: gezaehlt wurde, abgelehnt nicht. Der Produktweg
     * (`POST /api/home/share-envelopes`) stellt den Umschlag aus und haengt
     * *danach* `home.share_envelope_issued` an - ein Anhang, der unter Druck
     * abgelehnt wird, waehrend der Umschlag schon steht. Geprueft wird darum
     * hier, vor dem Schreiben und nach der Gueltigkeit, damit ein ungueltiger
     * Umschlag weiter seinen eigenen Grund bekommt und nicht den der Decke.
     */
    if (this.hasReachedStoreCeiling('share_envelope')) {
      throw new Error('pico_share_envelope_ceiling_reached');
    }

    const envelopeJson = serializePayload(params.record.envelope);
    const issuerKeyJson = serializePayload(params.record.issuerIdentityKeyRecord);
    const existingByIssuance = this.picoShareEnvelope(params.issuanceId);
    if (existingByIssuance !== undefined) {
      return serializePayload(existingByIssuance) === serializePayload(candidate)
        ? { ok: true, inserted: false, envelope: existingByIssuance }
        : { ok: false, reason: 'conflicting_record' };
    }

    const existingTuple = this.db
      .prepare(`
        SELECT issuance_id AS issuanceId
        FROM pico_share_envelope
        WHERE grant_id = ?
          AND reader_key_fingerprint_hex = ?
          AND kek_version = ?
      `)
      .get(
        params.record.envelope.grantId,
        params.record.envelope.readerKeyFingerprintHex,
        params.record.envelope.kekVersion,
      ) as { issuanceId: string } | undefined;
    if (existingTuple !== undefined) {
      return { ok: false, reason: 'conflicting_record' };
    }

    const grant = this.activePicoHomeDomainReadGrantRecord(
      params.sodium,
      params.record.envelope.grantId,
      params.at,
    )!;
    const inserted = this.db
      .prepare(`
        INSERT INTO pico_share_envelope (
          issuance_id,
          grant_id,
          delegation_id,
          home_id,
          privacy_domain,
          kek_version,
          host_signing_key_fingerprint_hex,
          issuer_identity_key_fingerprint_hex,
          reader_key_fingerprint_hex,
          wrap_digest_hex,
          granted_at,
          envelope_json,
          sealed_wrap_hex,
          issuer_identity_key_record_json,
          issuer_signature_hex,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        params.issuanceId,
        params.record.envelope.grantId,
        params.delegationId,
        grant.grant.homeId,
        params.record.envelope.domainId,
        params.record.envelope.kekVersion,
        params.record.envelope.hostSigningKeyFingerprintHex,
        params.record.envelope.issuerIdentityKeyFingerprintHex,
        params.record.envelope.readerKeyFingerprintHex,
        params.record.envelope.wrapDigestHex,
        params.record.envelope.grantedAt,
        envelopeJson,
        params.record.sealedWrapHex,
        issuerKeyJson,
        params.record.issuerSignatureHex,
        params.record.createdAt,
      ).changes === 1;

    // ADR 0119 Q5. Only a row that actually landed is counted.
    if (inserted) {
      this.rowCounter.recordInsert('share_envelope');
    }

    return { ok: true, inserted, envelope: candidate };
  }

  public picoShareEnvelope(issuanceId: string): PicoShareEnvelopeStoredRecord | undefined {
    this.ensureOpen();
    const row = this.db
      .prepare(`
        SELECT issuance_id AS issuanceId,
               delegation_id AS delegationId,
               envelope_json AS envelopeJson,
               sealed_wrap_hex AS sealedWrapHex,
               issuer_identity_key_record_json AS issuerIdentityKeyRecordJson,
               issuer_signature_hex AS issuerSignatureHex,
               created_at AS createdAt
        FROM pico_share_envelope
        WHERE issuance_id = ?
      `)
      .get(issuanceId) as PicoShareEnvelopeRow | undefined;
    return row === undefined ? undefined : mapPicoShareEnvelopeRow(row);
  }

  public picoShareEnvelopes(): PicoShareEnvelopeStoredRecord[] {
    this.ensureOpen();
    return (this.db
      .prepare(`
        SELECT issuance_id AS issuanceId,
               delegation_id AS delegationId,
               envelope_json AS envelopeJson,
               sealed_wrap_hex AS sealedWrapHex,
               issuer_identity_key_record_json AS issuerIdentityKeyRecordJson,
               issuer_signature_hex AS issuerSignatureHex,
               created_at AS createdAt
        FROM pico_share_envelope
        ORDER BY granted_at, issuance_id
      `)
      .all() as PicoShareEnvelopeRow[])
      .map(mapPicoShareEnvelopeRow);
  }

  public reconcilePicoShareEnvelopes(
    sodium: PicoShareEnvelopeVerificationSodium,
    keyAvailable: (privacyDomain: string, kekVersion: number) => boolean,
    at: string = new Date().toISOString(),
  ): {
    removedForAuthority: PicoShareEnvelopeReference[];
    removedForMissingKey: PicoShareEnvelopeReference[];
  } {
    this.ensureOpen();
    const removedForAuthority: PicoShareEnvelopeReference[] = [];
    const removedForMissingKey: PicoShareEnvelopeReference[] = [];
    const reconcile = this.db.transaction(() => {
      for (const stored of this.picoShareEnvelopes()) {
        const reference = picoShareEnvelopeReference(stored);
        let reason: 'authority' | 'key' | undefined;
        if (!this.isPicoShareEnvelopeValid(sodium, stored, at)) {
          reason = 'authority';
        } else {
          try {
            if (!keyAvailable(reference.privacyDomain, reference.kekVersion)) {
              reason = 'key';
            }
          } catch {
            reason = 'key';
          }
        }
        if (reason === undefined) {
          continue;
        }

        this.db.prepare('DELETE FROM pico_share_envelope WHERE issuance_id = ?').run(stored.issuanceId);
        (reason === 'authority' ? removedForAuthority : removedForMissingKey).push(reference);
      }
    });
    reconcile();
    return { removedForAuthority, removedForMissingKey };
  }

  public isPicoShareEnvelopeValid(
    sodium: PicoShareEnvelopeVerificationSodium,
    stored: PicoShareEnvelopeStoredRecord,
    at: string = new Date().toISOString(),
  ): boolean {
    try {
      const { record } = stored;
      const envelope = record.envelope;
      const grant = this.activePicoHomeDomainReadGrantRecord(
        sodium,
        envelope.grantId,
        at,
      );
      if (!isAsciiToken(stored.issuanceId, 256)
        || !isAsciiToken(stored.delegationId, 256)
        || record.schema !== picoShareEnvelopeRecordSchema
        || envelope.suite !== picoShareSuite
        || grant === undefined
        || envelope.domainId !== grant.grant.privacyDomain
        || envelope.hostSigningKeyFingerprintHex !== grant.grant.hostSigningKeyFingerprintHex
        || envelope.issuerIdentityKeyFingerprintHex
          !== grant.grant.controllerPicoIdentityFingerprintHex
        || envelope.readerKeyFingerprintHex
          !== this.picoIdentityReaderKeyCandidate({
            homeId: grant.grant.homeId,
            picoIdentityFingerprintHex: grant.grant.readerPicoIdentityFingerprintHex,
            delegationId: stored.delegationId,
            deviceKeyAgreementKeyFingerprintHex: envelope.readerKeyFingerprintHex,
            sodium,
            at,
          })?.deviceKeyAgreementKeyFingerprintHex
        || record.issuerIdentityKeyRecord.keyRole !== 'pico_identity'
        || !verifyPicoIdentityKeyRecordFingerprint(sodium, {
          keyRecord: record.issuerIdentityKeyRecord,
          expectedFingerprintHex: envelope.issuerIdentityKeyFingerprintHex,
        })
        || serializePayload(record.issuerIdentityKeyRecord)
          !== serializePayload(grant.issuerIdentityKeyRecord)
        || !isCanonicalHex(record.sealedWrapHex)
        || !isPicoInstant(record.createdAt)) {
        return false;
      }

      const sealedWrap = Buffer.from(record.sealedWrapHex, 'hex');
      const wrapDigestHex = Buffer.from(
        sodium.crypto_generichash(32, sealedWrap, null),
      ).toString('hex');
      return wrapDigestHex === envelope.wrapDigestHex
        && verifyPicoIdentityDetachedSignature(sodium, {
          publicKeyHex: record.issuerIdentityKeyRecord.publicKeyHex,
          signatureInput: buildPicoShareEnvelopeSignatureInput(envelope),
          signatureHex: record.issuerSignatureHex,
        });
    } catch {
      return false;
    }
  }

  private picoIdentitySignedRevocations(
    issuerPicoIdentityFingerprintHex: string,
  ): PicoIdentitySignedRevocation[] {
    return this.db
      .prepare(`
        SELECT revocation_json AS recordJson, signature_hex AS signatureHex
        FROM pico_identity_revocation
        WHERE issuer_pico_identity_fingerprint_hex = ?
        ORDER BY lifecycle_order ASC, revocation_id ASC
      `)
      .all(issuerPicoIdentityFingerprintHex)
      .map((row) => {
        const signed = row as { recordJson: string; signatureHex: string };
        return {
          record: JSON.parse(signed.recordJson) as PicoIdentitySignedRevocation['record'],
          signatureHex: signed.signatureHex,
        };
      });
  }

  private picoIdentityLifecycleIndex(
    sodium: IdentityVerificationSodium,
    issuerPicoIdentityFingerprintHex: string,
  ) {
    const rows = this.db
      .prepare(`
        SELECT delegation_json AS recordJson,
               issuer_identity_key_record_json AS keyJson,
               signature_hex AS signatureHex
        FROM pico_identity_delegation
        WHERE issuer_pico_identity_fingerprint_hex = ?
        ORDER BY lifecycle_order ASC, delegation_id ASC
      `)
      .all(issuerPicoIdentityFingerprintHex) as SignedEvidenceRow[];
    if (rows.length === 0) {
      return undefined;
    }

    try {
      const issuerIdentityKeyRecord = JSON.parse(rows[0]!.keyJson) as PicoIdentityKeyRecordSignatureInput;
      return createVerifiedPicoIdentityLifecycleIndex(sodium, {
        issuerIdentityKeyRecord,
        signedDelegations: rows.map((row) => ({
          record: JSON.parse(row.recordJson) as PicoIdentitySignedDelegation['record'],
          signatureHex: row.signatureHex,
        })),
        signedRevocations: this.picoIdentitySignedRevocations(issuerPicoIdentityFingerprintHex),
      });
    } catch {
      return undefined;
    }
  }

  private isStructurallyValidPicoIdentityReaderKey(
    readerKey: PicoIdentityReaderKeyRow,
    sodium: IdentityVerificationSodium,
  ): boolean {
    try {
      if (this.picoHomeClaimState().homeId !== readerKey.homeId
        || !this.hasActivePicoHomeMembership(
          readerKey.picoIdentityFingerprintHex,
          readerKey.homeId,
        )) {
        return false;
      }

      const keyRecord = JSON.parse(readerKey.keyJson) as PicoIdentityKeyRecordSignatureInput;
      if (keyRecord.suite !== picoIdentitySuite
        || keyRecord.keyRole !== 'device_key_agreement'
        || !verifyPicoIdentityKeyRecordFingerprint(sodium, {
          keyRecord,
          expectedFingerprintHex: readerKey.deviceKeyAgreementKeyFingerprintHex,
        })) {
        return false;
      }

      const lifecycle = this.picoIdentityLifecycleIndex(
        sodium,
        readerKey.picoIdentityFingerprintHex,
      );
      const delegation = lifecycle
        ?.snapshot()
        .delegations
        .find((entry) => entry.delegationId === readerKey.delegationId);
      return delegation !== undefined
        && delegation.issuerIdentityKeyFingerprintHex === readerKey.picoIdentityFingerprintHex
        && delegation.subjectSigningKeyFingerprintHex === readerKey.deviceSigningKeyFingerprintHex
        && delegation.subjectKeyAgreementKeyFingerprintHex
          === readerKey.deviceKeyAgreementKeyFingerprintHex;
    } catch {
      return false;
    }
  }

  private isExistingHostCustodyDomain(privacyDomain: string): boolean {
    const row = this.db
      .prepare(`
        SELECT custody_class AS custodyClass
        FROM memory_domain_custody
        WHERE privacy_domain = ?
      `)
      .get(privacyDomain) as { custodyClass: string } | undefined;

    return row?.custodyClass === 'host_custody';
  }

  private picoHomeDomainReadGrantRecord(grantId: string): PicoHomeDomainReadGrantRecord | undefined {
    const row = this.db
      .prepare(`
        SELECT grant_json AS grantJson,
               issuer_identity_key_record_json AS issuerIdentityKeyRecordJson,
               issuer_signature_hex AS issuerSignatureHex,
               created_at AS createdAt
        FROM pico_home_domain_read_grant
        WHERE grant_id = ?
      `)
      .get(grantId) as DomainReadGrantRecordRow | undefined;

    if (row === undefined) {
      return undefined;
    }

    return {
      schema: picoHomeDomainReadGrantRecordSchema,
      grant: JSON.parse(row.grantJson) as PicoHomeDomainReadGrantRecord['grant'],
      issuerIdentityKeyRecord: JSON.parse(row.issuerIdentityKeyRecordJson) as PicoHomeDomainReadGrantRecord['issuerIdentityKeyRecord'],
      issuerSignatureHex: row.issuerSignatureHex,
      createdAt: row.createdAt,
    };
  }

  private picoHomeDomainReadGrantLifecycleRecord(
    lifecycleId: string,
  ): PicoHomeDomainReadGrantLifecycleRecord | undefined {
    const row = this.db
      .prepare(`
        SELECT lifecycle_json AS lifecycleJson,
               issuer_identity_key_record_json AS issuerIdentityKeyRecordJson,
               issuer_signature_hex AS issuerSignatureHex,
               created_at AS createdAt
        FROM pico_home_domain_read_grant_lifecycle
        WHERE lifecycle_id = ?
      `)
      .get(lifecycleId) as DomainReadGrantLifecycleRecordRow | undefined;

    if (row === undefined) {
      return undefined;
    }

    return {
      schema: picoHomeDomainReadGrantLifecycleRecordSchema,
      lifecycle: JSON.parse(row.lifecycleJson) as PicoHomeDomainReadGrantLifecycleRecord['lifecycle'],
      issuerIdentityKeyRecord: JSON.parse(row.issuerIdentityKeyRecordJson) as PicoHomeDomainReadGrantLifecycleRecord['issuerIdentityKeyRecord'],
      issuerSignatureHex: row.issuerSignatureHex,
      createdAt: row.createdAt,
    };
  }

  private picoHomeDomainReadGrantView(
    grantId: string,
    at: string = new Date().toISOString(),
  ): PicoHomeDomainReadGrantView {
    const row = this.db
      .prepare(`
        SELECT
          grant_id AS grantId,
          home_id AS homeId,
          privacy_domain AS privacyDomain,
          controller_pico_identity_fingerprint_hex AS controllerPicoIdentityFingerprintHex,
          reader_pico_identity_fingerprint_hex AS readerPicoIdentityFingerprintHex,
          valid_from AS validFrom,
          valid_until AS validUntil,
          lifecycle_order AS lifecycleOrder,
          created_at AS createdAt
        FROM pico_home_domain_read_grant
        WHERE grant_id = ?
      `)
      .get(grantId) as DomainReadGrantViewRow | undefined;
    if (row === undefined) {
      throw new Error('Pico Home domain read grant is missing.');
    }

    const lifecycle = this.db
      .prepare(`
        SELECT lifecycle_order AS lifecycleOrder
        FROM pico_home_domain_read_grant_lifecycle
        WHERE grant_id = ?
        ORDER BY lifecycle_order DESC, lifecycle_id DESC
        LIMIT 1
      `)
      .get(grantId) as { lifecycleOrder: string } | undefined;

    let status: PicoHomeDomainReadGrantView['status'];
    if (lifecycle !== undefined && lifecycle.lifecycleOrder > row.lifecycleOrder) {
      status = 'revoked';
    } else if (at < row.validFrom) {
      status = 'not_yet_valid';
    } else if (at >= row.validUntil) {
      status = 'expired';
    } else {
      status = 'active';
    }

    return { ...row, status };
  }

  private dropPicoHomeMembershipCredential(credentialId: string): void {
    this.db.prepare('DELETE FROM pico_home_membership_lifecycle WHERE credential_id = ?').run(credentialId);
    this.db.prepare('DELETE FROM pico_home_membership_credential WHERE credential_id = ?').run(credentialId);
    this.db
      .prepare("DELETE FROM pico_home_membership WHERE source = 'membership_credential' AND source_ref = ?")
      .run(credentialId);
  }

  /**
   * One projection row per person per Home, backed by whichever of their
   * credentials is freshest and carrying the status of that credential's
   * freshest lifecycle statement. Keying on the subject rather than on the
   * credential is what lets a reissue replace a membership instead of colliding
   * with it on the one-row-per-person constraint.
   */
  private projectPicoHomeMemberMembership(
    homeId: string,
    subjectPicoIdentityFingerprintHex: string,
    projectedAt: string,
  ): PicoHomeMembership | undefined {
    const credentialRow = this.db
      .prepare(`
        SELECT credential_id
        FROM pico_home_membership_credential
        WHERE home_id = ? AND subject_pico_identity_fingerprint_hex = ?
        ORDER BY lifecycle_order DESC, credential_id DESC
        LIMIT 1
      `)
      .get(homeId, subjectPicoIdentityFingerprintHex) as { credential_id: string } | undefined;

    if (credentialRow === undefined) {
      return undefined;
    }

    const credential = this.picoHomeMembershipCredential(credentialRow.credential_id);
    if (credential === undefined) {
      return undefined;
    }

    const statusRow = this.db
      .prepare(`
        SELECT status
        FROM pico_home_membership_lifecycle
        WHERE credential_id = ?
        ORDER BY lifecycle_order DESC, lifecycle_id DESC
        LIMIT 1
      `)
      .get(credential.membership.credentialId) as { status: string } | undefined;

    const membership: PicoHomeMembership = {
      membershipId: `member:${homeId}:${subjectPicoIdentityFingerprintHex}`,
      homeId,
      picoIdentityFingerprintHex: subjectPicoIdentityFingerprintHex,
      role: credential.membership.role,
      status: statusRow === undefined ? 'active' : toPicoHomeMembershipStatus(statusRow.status),
      scopes: [...credential.membership.scopes],
      source: 'membership_credential',
      sourceRef: credential.membership.credentialId,
      validFrom: credential.membership.validFrom,
      validUntil: credential.membership.validUntil,
      createdAt: credential.createdAt,
      updatedAt: projectedAt,
    };

    this.upsertPicoHomeMembership(membership);

    return membership;
  }

  // Deleteable memory store (ADR 0068), sharing this store's database
  // connection. When a crypto provider is attached (ADR 0071), it can store and
  // read domain_encrypted items.
  public memory(): MemoryStore {
    this.ensureOpen();
    return new MemoryStore(this.db, this.memoryCrypto, this.rowCounter,
      () => this.hasReachedStoreCeiling('memory_item'));
  }

  /**
   * ADR 0107 D2. The Pico Link Direct replay memory, on this Home's disk.
   *
   * Here rather than in the intake because it is durable Home state, and the
   * intake is the file that decides an order of checks - it holds no route, no
   * policy and, until 2026-09-10, no memory that outlived the process.
   */
  public linkDirectSeenRequests(maxRows = MAX_PICO_LINK_DIRECT_SEEN_REQUESTS): PicoLinkDirectSeenRequests {
    this.ensureOpen();
    return new PicoLinkDirectSeenRequests(this.db, maxRows);
  }

  /**
   * ADR 0118 O1. Attaches the instant the person meant to an existing memory
   * item, which is what turns it into a time-bound entry.
   *
   * Separate from creation on purpose: the item is the person's content and
   * already went through the memory path with its domain, retention and
   * shredding. This adds the one field the floor family is about, so a reminder
   * cannot end up outside the protections every other item has.
   */
  public setPicoTimeBoundEntryDue(input: {
    memoryItemId: string;
    dueAt: string;
  }): boolean {
    this.ensureOpen();
    return this.db
      .prepare(`
        UPDATE memory_item
        SET due_at = ?, updated_at = ?
        WHERE memory_item_id = ? AND deletion_state = 'active'
      `)
      .run(input.dueAt, new Date().toISOString(), input.memoryItemId).changes === 1;
  }

  /**
   * ADR 0118 O1. Entries still waiting, oldest instant first.
   *
   * Deliberately unfiltered by lateness: an instant that passed while the Home
   * was off is still due. Skipping it would be the silent failure this family
   * exists to prevent - the person stopped carrying the appointment themselves
   * the moment they wrote it down.
   */
  public picoTimeBoundEntries(
    limit = 100,
  ): Array<PicoTimeBoundEntry & { privacyDomain: string }> {
    this.ensureOpen();
    const rows = this.db
      .prepare(`
        SELECT memory_item_id AS memoryItemId,
               privacy_domain AS privacyDomain,
               content_type AS contentType,
               due_at AS dueAt,
               raised_at AS raisedAt
        FROM memory_item
        WHERE due_at IS NOT NULL
          AND raised_at IS NULL
          AND deletion_state = 'active'
        ORDER BY due_at ASC
        LIMIT ?
      `)
      .all(limit) as Array<{
        memoryItemId: string;
        privacyDomain: string;
        contentType: string;
        dueAt: string;
        raisedAt: string | null;
      }>;
    return rows.map((row) => ({
      ...parsePicoTimeBoundEntry({
        memoryItemId: row.memoryItemId,
        kind: row.contentType === 'application/vnd.pico.appointment'
          ? 'appointment'
          : 'reminder',
        // The identifier stands in for the title here. The title is the
        // person's content behind the domain's custody rules, so it is read
        // through the memory path by a caller that has established readership -
        // never carried out of this projection, which asks nobody's permission.
        title: row.memoryItemId,
        dueAt: row.dueAt,
        ...(row.raisedAt === null ? {} : { raisedAt: row.raisedAt }),
      }),
      privacyDomain: row.privacyDomain,
    }));
  }

  /**
   * ADR 0118 O1 delivery semantics. Entries the Home has not yet noticed.
   *
   * The scheduler's working set, and it is keyed on `announced_at` rather
   * than `raised_at` because the two are different facts. An entry nobody
   * acknowledged is still outstanding and still offered to the person's
   * device; it is simply not announced twice.
   */
  public picoUnannouncedTimeBoundEntries(
    limit = 100,
  ): Array<PicoTimeBoundEntry & { privacyDomain: string }> {
    this.ensureOpen();
    const rows = this.db
      .prepare(`
        SELECT memory_item_id AS memoryItemId,
               privacy_domain AS privacyDomain,
               content_type AS contentType,
               due_at AS dueAt,
               raised_at AS raisedAt,
               announced_at AS announcedAt
        FROM memory_item
        WHERE due_at IS NOT NULL
          AND announced_at IS NULL
          AND deletion_state = 'active'
        ORDER BY due_at ASC
        LIMIT ?
      `)
      .all(limit) as Array<{
        memoryItemId: string;
        privacyDomain: string;
        contentType: string;
        dueAt: string;
        raisedAt: string | null;
        announcedAt: string | null;
      }>;
    return rows.map((row) => ({
      memoryItemId: row.memoryItemId,
      privacyDomain: row.privacyDomain,
      kind: row.contentType.includes('reminder') ? 'reminder' : 'appointment',
      title: '',
      dueAt: row.dueAt,
      ...(row.raisedAt === null ? {} : { raisedAt: row.raisedAt }),
      ...(row.announcedAt === null ? {} : { announcedAt: row.announcedAt }),
    }));
  }

  /**
   * ADR 0118 O1. The Home noticed. Idempotent by the `IS NULL` clause, so a
   * restart, a double tick or two schedulers racing announce it exactly once.
   */
  public markPicoTimeBoundEntryAnnounced(input: {
    memoryItemId: string;
    announcedAt: string;
  }): boolean {
    this.ensureOpen();
    return this.db
      .prepare(`
        UPDATE memory_item
        SET announced_at = ?, updated_at = ?
        WHERE memory_item_id = ? AND announced_at IS NULL AND due_at IS NOT NULL
      `)
      .run(input.announcedAt, new Date().toISOString(), input.memoryItemId).changes === 1;
  }

  /**
   * ADR 0129 SR3. Records where a memory item was.
   *
   * All three values or none, checked here as well as by the column CHECK,
   * because a caller that lost one of them should be told which rather than
   * meeting a constraint error. The validation is the protocol's, so the
   * column and the spatial-recall fix cannot drift into disagreeing about what
   * a usable position is.
   *
   * Generic on purpose: this is the shape `due_at` already has, and a module
   * that needed its own place column would be inventing a second answer to a
   * question the core already answers.
   */
  public setPicoMemoryItemPlace(input: {
    memoryItemId: string;
    place: PicoPlace;
  }): boolean {
    this.ensureOpen();
    const place = assertPicoPlace(input.place as unknown as Record<string, unknown>);
    return this.db
      .prepare(`
        UPDATE memory_item
        SET latitude_deg = ?, longitude_deg = ?, accuracy_m = ?, updated_at = ?
        WHERE memory_item_id = ? AND deletion_state = 'active'
      `)
      .run(
        place.latitudeDeg,
        place.longitudeDeg,
        place.accuracyM,
        new Date().toISOString(),
        input.memoryItemId,
      ).changes === 1;
  }

  /**
   * ADR 0129 SR3. Where a memory item was, or `undefined` if it has no place.
   *
   * A partial row is treated as no place rather than as two thirds of one. The
   * column CHECK makes that unreachable through this code, and the reading
   * stays defensive because a database restored from somewhere else is not
   * this code's promise to keep.
   */
  public picoMemoryItemPlace(memoryItemId: string): PicoPlace | undefined {
    this.ensureOpen();
    const row = this.db
      .prepare(`
        SELECT latitude_deg AS latitudeDeg,
               longitude_deg AS longitudeDeg,
               accuracy_m AS accuracyM
        FROM memory_item
        WHERE memory_item_id = ?
      `)
      .get(memoryItemId) as
        | { latitudeDeg: number | null; longitudeDeg: number | null; accuracyM: number | null }
        | undefined;
    if (row === undefined
      || row.latitudeDeg === null
      || row.longitudeDeg === null
      || row.accuracyM === null) {
      return undefined;
    }
    return Object.freeze({
      latitudeDeg: row.latitudeDeg,
      longitudeDeg: row.longitudeDeg,
      accuracyM: row.accuracyM,
    });
  }

  /**
   * ADR 0129 SR3. Placed memory items, most recent first, bounded.
   *
   * The ground a later "where was I yesterday afternoon" stands on. Bounded
   * because every read a person can trigger is, and most recent first because
   * a spatial question is nearly always about the last time rather than the
   * first.
   */
  public picoPlacedMemoryItems(input: {
    privacyDomain: string;
    limit?: number;
  }): Array<PicoPlace & { memoryItemId: string; contentType: string; createdAt: string }> {
    this.ensureOpen();
    return this.db
      .prepare(`
        SELECT memory_item_id AS memoryItemId,
               content_type AS contentType,
               created_at AS createdAt,
               latitude_deg AS latitudeDeg,
               longitude_deg AS longitudeDeg,
               accuracy_m AS accuracyM
        FROM memory_item
        WHERE privacy_domain = ?
          AND latitude_deg IS NOT NULL
          AND deletion_state = 'active'
        ORDER BY created_at DESC
        LIMIT ?
      `)
      .all(input.privacyDomain, input.limit ?? 100) as Array<
        PicoPlace & { memoryItemId: string; contentType: string; createdAt: string }
      >;
  }

  /**
   * ADR 0129 SR2. Appends readings to the observation buffer.
   *
   * Every sample goes through the protocol parser rather than being trusted:
   * this is the one write path into the buffer, and a producer that has come
   * loose is exactly what the bound on a single payload is for.
   *
   * The ADR 0119 Q5 ceiling applies here as it does to every store the core
   * owns. A buffer that refused a memory item by filling up would be a working
   * store crowding out a record, so it is counted like the rest and the
   * refusal names the store.
   */
  public appendPicoObservations(observations: readonly unknown[]): number {
    this.ensureOpen();
    const parsed = observations.map((entry) => parsePicoObservation(entry));
    if (parsed.length === 0) {
      return 0;
    }

    const reached = this.hasReachedStoreCeiling('observation');
    if (reached) {
      // Named rather than generic, so a surface can say which store filled.
      // `storageCondition` re-counts a reached ceiling before believing it, so
      // a buffer that was just pruned is not refused on a stale number.
      throw new Error('pico_observation_ceiling_reached');
    }

    const statement = this.db.prepare(`
      INSERT INTO pico_observation (privacy_domain, kind, observed_at, payload, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    const createdAt = new Date().toISOString();
    const write = this.db.transaction((rows: readonly PicoObservation[]) => {
      for (const row of rows) {
        statement.run(row.privacyDomain, row.kind, row.observedAt, row.payload, createdAt);
      }
    });
    write(parsed);
    this.rowCounter.recordInsert('observation', parsed.length);
    return parsed.length;
  }

  /**
   * ADR 0129 SR2. The readings a condensation pass works on, oldest first.
   *
   * Oldest first because a derivation walks a sequence forward; handing it the
   * newest would make every caller re-sort what the index already ordered.
   */
  public picoObservationWindow(input: {
    kind: PicoObservationKind;
    privacyDomain: string;
    sinceIso?: string;
    limit?: number;
  }): Array<PicoObservation & { observationId: number }> {
    this.ensureOpen();
    const rows = this.db
      .prepare(`
        SELECT observation_id AS observationId,
               privacy_domain AS privacyDomain,
               kind,
               observed_at AS observedAt,
               payload
        FROM pico_observation
        WHERE kind = ?
          AND privacy_domain = ?
          AND observed_at >= ?
        ORDER BY observed_at ASC
        LIMIT ?
      `)
      .all(
        input.kind,
        input.privacyDomain,
        input.sinceIso ?? '0000-01-01T00:00:00.000Z',
        input.limit ?? 10_000,
      ) as Array<PicoObservation & { observationId: number }>;
    return rows;
  }

  /**
   * ADR 0129 SR2. Drops readings the buffer is no longer allowed to hold.
   *
   * Called at open, which is what makes this the answer to two of the five
   * places at once. It is boot reconciliation, and it is what a restore does
   * to a buffer: a snapshot older than the window comes back empty, because a
   * buffer restored from last week is worse than no buffer.
   */
  public prunePicoObservations(nowIso = new Date().toISOString()): number {
    this.ensureOpen();
    const cutoff = new Date(Date.parse(nowIso) - maxPicoObservationAgeMs).toISOString();
    const removed = this.db
      .prepare('DELETE FROM pico_observation WHERE observed_at < ?')
      .run(cutoff).changes;
    if (removed > 0) {
      // Deletions are not counted (see PicoStoreRowCounter), so the cached
      // number can only run high. Resyncing here is what stops a pruned buffer
      // from refusing writes on a count that is no longer true.
      this.rowCounter.resync();
    }
    return removed;
  }

  /**
   * ADR 0129 SR2 with ADR 0071. The shred cascade reaches the buffer.
   *
   * Deleted rather than crypto-shredded, and that is the stronger of the two
   * for this shape: these rows carry no key envelope of their own, and data
   * designed not to outlive its window has nothing worth leaving behind
   * undecryptable. What survives a shred is what survived it before - nothing
   * in that domain.
   */
  public deletePicoObservationsInDomain(privacyDomain: string): number {
    this.ensureOpen();
    const removed = this.db
      .prepare('DELETE FROM pico_observation WHERE privacy_domain = ?')
      .run(privacyDomain).changes;
    if (removed > 0) {
      this.rowCounter.resync();
    }
    return removed;
  }

  /** ADR 0129 SR2. Drops exactly the readings a condensation pass consumed. */
  public deletePicoObservations(observationIds: readonly number[]): number {
    this.ensureOpen();
    if (observationIds.length === 0) {
      return 0;
    }
    const statement = this.db.prepare('DELETE FROM pico_observation WHERE observation_id = ?');
    let removed = 0;
    const drop = this.db.transaction((ids: readonly number[]) => {
      for (const id of ids) {
        removed += statement.run(id).changes;
      }
    });
    drop(observationIds);
    if (removed > 0) {
      this.rowCounter.resync();
    }
    return removed;
  }

  /**
   * ADR 0127 M5. How many entries are due right now - all of them, not a page.
   *
   * The list this store hands out is capped, and before this existed the cap
   * was invisible: a Home with 137 due entries answered with 50 and said
   * nothing, so the companion announced "50 entries are due". A count is what
   * makes the cap say so.
   *
   * It rides the same partial index as the scheduler's own query
   * (`idx_memory_item_due`), so it costs an index scan over exactly the rows
   * that still wait rather than a table scan over everything ever recorded.
   */
  public picoDueTimeBoundEntryCount(nowIso: string): number {
    this.ensureOpen();
    const row = this.db
      .prepare(`
        SELECT COUNT(*) AS due
        FROM memory_item
        WHERE due_at IS NOT NULL
          AND raised_at IS NULL
          AND deletion_state = 'active'
          AND due_at <= ?
      `)
      .get(nowIso) as { due: number };
    return row.due;
  }

  /**
   * ADR 0118 O1. A surface confirmed the person was told.
   *
   * **Only an acknowledgement calls this.** The scheduler used to, which made
   * this column a claim the Home could not make: it cannot observe that a
   * notification was shown, and an entry cleared on the Home's say-so is a
   * promise nobody kept. Idempotent by the `IS NULL` clause, so a device that
   * retries an acknowledgement it already sent changes nothing.
   */
  public markPicoTimeBoundEntryRaised(input: {
    memoryItemId: string;
    raisedAt: string;
  }): boolean {
    this.ensureOpen();
    return this.db
      .prepare(`
        UPDATE memory_item
        SET raised_at = ?, updated_at = ?
        WHERE memory_item_id = ? AND raised_at IS NULL AND due_at IS NOT NULL
      `)
      .run(input.raisedAt, new Date().toISOString(), input.memoryItemId).changes === 1;
  }

  /**
   * ADR 0127 M3. Which modules this Home has running.
   *
   * **A Home that has decided nothing gets the shipped default**, which is
   * every module on. That is different from having switched everything off,
   * and conflating the two would leave a fresh install looking broken while a
   * person who deliberately emptied it kept getting their features back.
   *
   * The default is deliberately *not* a per-module manifest field. Both shipped
   * modules are ordinary product features a person expects to work, and the one
   * privacy question in the neighbourhood - whether spatial recall may begin
   * *capturing* - belongs to ADR 0129 SR5/SR6 where consent can actually be
   * enforced. **Activating a module is not consent to record.**
   */
  public picoActiveModules(): readonly PicoModuleIdentifier[] {
    this.ensureOpen();
    const rows = this.db
      .prepare('SELECT identifier, active FROM pico_module_activation')
      .all() as Array<{ identifier: string; active: number }>;
    const decided = new Map(rows.map((row) => [row.identifier, row.active === 1]));

    return Object.freeze(picoModuleIdentifiers
      .filter((identifier) => decided.get(identifier) ?? true));
  }

  /**
   * ADR 0129 SR6. Which modules a person has allowed to record.
   *
   * **Absent means no**, and that is the opposite default from activation on
   * purpose. A Home whose calendar was off would look broken, so activation
   * defaults on; a Home that began writing down its person's movements because
   * they installed it would not be broken, it would be wrong.
   */
  public picoCapturingModules(): readonly PicoModuleIdentifier[] {
    this.ensureOpen();
    const rows = this.db
      .prepare('SELECT identifier, capture_consented AS capturing FROM pico_module_activation')
      .all() as Array<{ identifier: string; capturing: number | null }>;
    const consented = new Map(rows.map((row) => [row.identifier, row.capturing === 1]));
    return Object.freeze(picoModuleIdentifiers
      .filter((identifier) => consented.get(identifier) === true));
  }

  /** ADR 0129 SR6. Records the consent decision for one module. */
  public setPicoModuleCapture(input: {
    identifier: PicoModuleIdentifier;
    capturing: boolean;
    decidedAt: string;
  }): void {
    this.ensureOpen();
    this.db
      .prepare(`
        INSERT INTO pico_module_activation (identifier, active, capture_consented, decided_at)
        VALUES (?, 1, ?, ?)
        ON CONFLICT(identifier) DO UPDATE
          SET capture_consented = excluded.capture_consented, decided_at = excluded.decided_at
      `)
      .run(input.identifier, input.capturing ? 1 : 0, input.decidedAt);
  }

  /**
   * ADR 0127 M3. Records what a person decided, for exactly the modules that
   * changed.
   *
   * Writing only the changed ones keeps "never decided" distinguishable from
   * "decided to leave on", which is what lets a future default change reach a
   * Home that never expressed a preference and leave alone one that did.
   */
  public setPicoModuleActivation(input: {
    changes: ReadonlyArray<{
      identifier: PicoModuleIdentifier;
      active: boolean;
      /**
       * ADR 0139 AC4. What a person is consenting to as this is switched on.
       *
       * Required rather than optional, and that is the whole mechanism: an
       * optional field is one a caller forgets, and the thing forgotten would
       * be the record of what was agreed. Every shipped module declares an
       * empty list today, so supplying it costs nothing and stops costing
       * nothing the moment a module declares an effect.
       */
      effects: readonly PicoModuleEffect[];
    }>;
    decidedAt: string;
  }): void {
    this.ensureOpen();
    const statement = this.db.prepare(`
      INSERT INTO pico_module_activation (identifier, active, decided_at)
      VALUES (?, ?, ?)
      ON CONFLICT(identifier) DO UPDATE SET active = excluded.active, decided_at = excluded.decided_at
    `);
    const clearConsent = this.db
      .prepare('DELETE FROM pico_module_effect_consent WHERE identifier = ?');
    const recordConsent = this.db.prepare(`
      INSERT INTO pico_module_effect_consent
        (identifier, effect_name, description, risk, consented_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    const apply = this.db.transaction(() => {
      for (const change of input.changes) {
        statement.run(change.identifier, change.active ? 1 : 0, input.decidedAt);
        if (!change.active) {
          // ADR 0127 M3: deactivation stops behaviour, never custody, and
          // re-enabling restores everything. Dropping the consent here would
          // make switching a module off and on again an interrogation, and
          // would lose the record of what was agreed while it was off.
          continue;
        }
        clearConsent.run(change.identifier);
        for (const effect of change.effects) {
          recordConsent.run(
            change.identifier,
            effect.name,
            effect.description,
            effect.risk,
            input.decidedAt,
          );
        }
      }
    });
    apply();
  }

  /**
   * ADR 0137 IN5. Attaches a supplier into exactly one Private Space.
   *
   * The manifest is parsed rather than trusted, so ADR 0136 BR1's slot list
   * and ADR 0137 IN1's identifier rules decide before anything is stored: a
   * path or an address is refused here as firmly as at the parser, because
   * this is the boundary the record crosses.
   *
   * Both reaching flags start at **off** (ADR 0138 CO3/CO4). Attaching a
   * supplier says it exists; it does not say Pico may spend a person's money
   * or tell anyone they asked.
   */
  public attachPicoSupplier(input: {
    manifest: unknown;
    attachedAt: string;
  }): PicoSupplierAttachment {
    this.ensureOpen();
    const manifest = parsePicoSupplierManifest(input.manifest);

    // ADR 0119 Q5 with ADR 0137 IN1. The instance list is open by decision, so
    // this ceiling stands in place of the closed enumeration modules have.
    // Checked before the write and only for a new identifier: re-attaching one
    // that is already there replaces a row rather than adding one, and
    // refusing that would leave a person unable to correct an attachment at
    // exactly the moment they are trying to make room.
    if (this.picoSupplierAttachment(manifest.identifier) === undefined) {
      const reached = this.hasReachedStoreCeiling('supplier_attachment');
      if (reached) {
        // Named rather than generic, so a surface can say which store filled.
        // `storageCondition` re-counts a reached ceiling before believing it,
        // so someone who has just detached is not refused on a stale number.
        throw new Error('pico_supplier_attachment_ceiling_reached');
      }
    }

    this.db
      .prepare(`
        INSERT INTO pico_supplier_attachment (
          identifier, kind, slots_json, coverage_json, privacy_domain,
          may_reach_outside, may_reach_unasked, attached_at
        ) VALUES (?, ?, ?, ?, ?, 0, 0, ?)
        ON CONFLICT(identifier) DO UPDATE SET
          kind = excluded.kind,
          slots_json = excluded.slots_json,
          coverage_json = excluded.coverage_json,
          privacy_domain = excluded.privacy_domain,
          attached_at = excluded.attached_at
      `)
      .run(
        manifest.identifier,
        manifest.kind,
        JSON.stringify(manifest.slots),
        JSON.stringify(manifest.coverage),
        manifest.privacyDomain,
        input.attachedAt,
      );
    // After the write, so a failure never inflates the count. The upsert makes
    // a re-attachment cost no row, and `recordInsert` is called for the new
    // case only.
    this.rowCounter.recordInsert('supplier_attachment');
    return this.picoSupplierAttachment(manifest.identifier)!;
  }

  /**
   * ADR 0138 CO3/CO4. The two decisions that stand between an attached
   * supplier and one reaching out unasked.
   *
   * Unasked reaching cannot be granted without reaching, and the database
   * carries that as a CHECK rather than leaving it to whoever writes next.
   */
  public setPicoSupplierReach(input: {
    identifier: string;
    mayReachOutside: boolean;
    mayReachUnasked: boolean;
    decidedAt: string;
  }): void {
    this.ensureOpen();
    if (input.mayReachUnasked && !input.mayReachOutside) {
      throw new Error('pico_supplier_unasked_requires_reach');
    }
    const changed = this.db
      .prepare(`
        UPDATE pico_supplier_attachment
        SET may_reach_outside = ?, may_reach_unasked = ?, attached_at = ?
        WHERE identifier = ?
      `)
      .run(
        input.mayReachOutside ? 1 : 0,
        input.mayReachUnasked ? 1 : 0,
        input.decidedAt,
        input.identifier,
      );
    if (changed.changes === 0) {
      throw new Error('pico_supplier_not_attached');
    }
  }

  public picoSupplierAttachment(identifier: string): PicoSupplierAttachment | undefined {
    this.ensureOpen();
    const row = this.db
      .prepare(`
        SELECT identifier, kind, slots_json AS slotsJson, coverage_json AS coverageJson,
               privacy_domain AS privacyDomain, may_reach_outside AS mayReachOutside,
               may_reach_unasked AS mayReachUnasked, attached_at AS attachedAt,
               credential_scope AS credentialScope,
               credential_present AS credentialPresent
        FROM pico_supplier_attachment WHERE identifier = ?
      `)
      .get(identifier) as {
        identifier: string; kind: string; slotsJson: string; coverageJson: string;
        privacyDomain: string; mayReachOutside: number; mayReachUnasked: number;
        attachedAt: string; credentialScope: string | null; credentialPresent: number;
      } | undefined;
    if (row === undefined) {
      return undefined;
    }
    return Object.freeze({
      identifier: row.identifier,
      kind: row.kind as PicoSupplierAttachment['kind'],
      slots: Object.freeze(JSON.parse(row.slotsJson) as string[]),
      coverage: Object.freeze(JSON.parse(row.coverageJson) as string[]),
      privacyDomain: row.privacyDomain,
      mayReachOutside: row.mayReachOutside === 1,
      mayReachUnasked: row.mayReachUnasked === 1,
      ...(row.credentialScope === null
        ? {}
        : { credentialScope: row.credentialScope as 'read' | 'read_write' }),
      credentialPresent: row.credentialPresent === 1,
      attachedAt: row.attachedAt,
    });
  }

  /**
   * ADR 0138 CO1. Records what a supplier's credential may do, and that one
   * exists - never the secret.
   *
   * **A library takes `read` and nothing else.** A supplier that could write
   * to its source could edit the material it is quoting, and that failure is
   * quieter than losing the credential: the quotes would stay accurate about a
   * source changed to agree with them. Pico never pushes.
   *
   * The secret does not pass through here, and where it lives at rest was
   * settled long ago: `SupplierCredentialCrypto` seals it in the domain its
   * supplier attached into, under that domain's KEK, so a domain shred takes
   * it with everything else that domain held. What is missing is anybody to
   * hand a credential to.
   *
   * This said "the open half of CO1" until finding B196 held it against the
   * argued line in `store:check` - which had been corrected on 2026-08-25 for
   * exactly this wording, without its twin here hearing about it.
   */
  public setPicoSupplierCredential(input: {
    identifier: string;
    scope: 'read' | 'read_write';
    present: boolean;
  }): void {
    this.ensureOpen();
    const attachment = this.picoSupplierAttachment(input.identifier);
    if (attachment === undefined) {
      throw new Error('pico_supplier_not_attached');
    }
    if (attachment.kind === 'library' && input.scope !== 'read') {
      throw new Error('pico_library_credential_must_be_read_only');
    }
    this.db
      .prepare(`
        UPDATE pico_supplier_attachment
        SET credential_scope = ?, credential_present = ?
        WHERE identifier = ?
      `)
      .run(input.scope, input.present ? 1 : 0, input.identifier);
  }

  public picoSupplierAttachments(): readonly PicoSupplierAttachment[] {
    this.ensureOpen();
    const identifiers = this.db
      .prepare('SELECT identifier FROM pico_supplier_attachment ORDER BY identifier')
      .all() as Array<{ identifier: string }>;
    return Object.freeze(identifiers
      .map((row) => this.picoSupplierAttachment(row.identifier)!));
  }

  /**
   * ADR 0143 DP1. Attaches a depot at a commit a person accepted.
   *
   * The pin is parsed rather than trusted, so a record carrying a `branch` is
   * refused here as firmly as at the parser - this is the boundary the decision
   * actually crosses, and a schema without a branch column plus a parser
   * without a branch field is two places saying the same thing rather than one
   * saying it and one hoping.
   *
   * Re-attaching the same remote at the same commit is not an error and not a
   * change: it writes the same row, which is what makes attaching idempotent
   * for a caller that cannot tell whether it already ran.
   */
  public attachPicoDepot(input: {
    pin: unknown;
    acceptedAt: string;
    /**
     * ADR 0143 DP1. Who accepted this, when anybody knows.
     *
     * Optional because it was not always recorded, and a store that demanded
     * it would refuse to reattach depots that already exist. What it buys is
     * that a later read of this material has somebody to be attributed to -
     * without it, a fetch has material and nobody whose decision governs
     * where it may be read.
     */
    acceptedBy?: string;
  }): PicoDepotAttachment {
    this.ensureOpen();
    const pin = parsePicoDepotPin(input.pin);

    // ADR 0119 Q5. A new store answers the ceiling question like every other.
    if (this.picoDepotAttachment(pin.remote) === undefined) {
      const reached = this.hasReachedStoreCeiling('depot_attachment');
      if (reached) {
        throw new Error('pico_depot_attachment_ceiling_reached');
      }
    }

    this.db
      .prepare(`
        INSERT INTO pico_depot_attachment (
          remote, running_commit, accepted_at,
          accepted_by_pico_identity_fingerprint_hex
        ) VALUES (?, ?, ?, ?)
        ON CONFLICT(remote) DO UPDATE SET
          running_commit = excluded.running_commit,
          accepted_at = excluded.accepted_at,
          -- A reattachment without a name does not erase the name that was
          -- there: the person who accepted this is a fact about the past, and
          -- a caller that happens not to know it is not a caller correcting it.
          accepted_by_pico_identity_fingerprint_hex = COALESCE(
            excluded.accepted_by_pico_identity_fingerprint_hex,
            accepted_by_pico_identity_fingerprint_hex
          )
      `)
      .run(pin.remote, pin.commit, input.acceptedAt, input.acceptedBy ?? null);
    this.rowCounter.recordInsert('depot_attachment');
    return this.picoDepotAttachment(pin.remote)!;
  }

  public picoDepotAttachment(remote: string): PicoDepotAttachment | undefined {
    this.ensureOpen();
    const row = this.db
      .prepare(`
        SELECT remote, running_commit AS runningCommit, accepted_at AS acceptedAt,
               accepted_by_pico_identity_fingerprint_hex AS acceptedBy,
               may_fetch AS mayFetch, may_fetch_unasked AS mayFetchUnasked,
               offered_commit AS offeredCommit,
               last_fetch_condition AS lastFetchCondition,
               last_fetch_at AS lastFetchAt
        FROM pico_depot_attachment WHERE remote = ?
      `)
      .get(remote) as {
        remote: string; runningCommit: string; acceptedAt: string;
        mayFetch: number; mayFetchUnasked: number;
        offeredCommit: string | null;
        lastFetchCondition: string | null;
        lastFetchAt: string | null;
        acceptedBy: string | null;
      } | undefined;
    if (row === undefined) {
      return undefined;
    }
    return Object.freeze({
      pin: parsePicoDepotPin({ remote: row.remote, commit: row.runningCommit }),
      acceptedAt: row.acceptedAt,
      mayFetch: row.mayFetch === 1,
      mayFetchUnasked: row.mayFetchUnasked === 1,
      ...(row.acceptedBy === null || row.acceptedBy === undefined
        ? {}
        : { acceptedBy: row.acceptedBy }),
      // Absent rather than null: the view these feed is a set of optional
      // facts, and `undefined` is the shape a caller can spread and omit.
      ...(row.offeredCommit === null ? {} : { offeredCommit: row.offeredCommit }),
      ...(row.lastFetchCondition === null ? {} : {
        lastFetchCondition: assertPicoDepotFetchCondition(row.lastFetchCondition),
      }),
      ...(row.lastFetchAt === null ? {} : { lastFetchAt: row.lastFetchAt }),
    });
  }

  /**
   * ADR 0138 CO3/CO4 for depots. The two decisions that stand between an
   * attached depot and one Pico pulls from while nobody is watching.
   *
   * Unasked fetching cannot be granted without fetching, and this method
   * carries that rather than a table CHECK, because SQLite cannot add one to
   * an existing table. The guarantee is the same because this is the only door
   * into those columns.
   */
  public setPicoDepotReach(input: {
    remote: string;
    mayFetch: boolean;
    mayFetchUnasked: boolean;
  }): void {
    this.ensureOpen();
    if (input.mayFetchUnasked && !input.mayFetch) {
      throw new Error('pico_depot_unasked_requires_fetch');
    }
    const changed = this.db
      .prepare(`
        UPDATE pico_depot_attachment
        SET may_fetch = ?, may_fetch_unasked = ?
        WHERE remote = ?
      `)
      .run(input.mayFetch ? 1 : 0, input.mayFetchUnasked ? 1 : 0, input.remote);
    if (changed.changes === 0) {
      throw new Error('pico_depot_not_attached');
    }
  }

  /**
   * ADR 0143 DP1/DP8. The single write site for what a fetch learned.
   *
   * Everything a fetch can teach the row goes through here, in one statement,
   * and that is what keeps a projection from drifting off the ADR 0121 chain
   * it projects. Two methods - one for the offer, one for the condition -
   * would be two chances to update half of it.
   *
   * **A success clears the condition.** Setting it on failure and leaving it
   * on success would make `lastFetchCondition` mean "something failed once",
   * which is a fact about the past that would be rendered as a state of the
   * present: a person would be told to check their network long after it came
   * back. It holds what is currently true or nothing.
   *
   * The offer survives a failed attempt on purpose. A newer commit that was
   * seen last week is still there, and a fetch that could not reach the remote
   * has learned nothing about it either way - dropping it would turn a network
   * outage into a decision quietly disappearing from in front of a person.
   */
  public recordPicoDepotFetchOutcome(input: {
    remote: string;
    at: string;
    condition?: unknown;
    /** A newer commit seen on the remote. `null` withdraws a standing offer. */
    offeredCommit?: string | null;
  }): PicoDepotAttachment {
    this.ensureOpen();
    const attachment = this.picoDepotAttachment(input.remote);
    if (attachment === undefined) {
      throw new Error('pico_depot_not_attached');
    }
    const condition = input.condition === undefined
      ? null
      : assertPicoDepotFetchCondition(input.condition);
    if (input.offeredCommit !== undefined && input.offeredCommit !== null) {
      // Validated rather than stored as given: this value came off a remote,
      // and the one thing a remote must not be able to do is put something
      // that is not a commit where a commit is read.
      if (!picoGitCommitPattern.test(input.offeredCommit)) {
        throw new Error('invalid_pico_depot_offered_commit');
      }
      if (input.offeredCommit === attachment.pin.commit) {
        // Not an offer. The remote agreeing with the pin is the ordinary case,
        // and recording it as something waiting for a person would put a
        // decision in front of them that has no other side.
        throw new Error('pico_depot_offer_matches_pin');
      }
    }
    // Two statements rather than one with a conditional column, because
    // `offeredCommit` absent and `offeredCommit: null` mean different things -
    // "this fetch says nothing about the offer" and "withdraw it" - and an
    // expression that encodes that inside SQL is one nobody can read.
    if (input.offeredCommit === undefined) {
      this.db
        .prepare(`
          UPDATE pico_depot_attachment
          SET last_fetch_condition = ?, last_fetch_at = ?
          WHERE remote = ?
        `)
        .run(condition, input.at, input.remote);
    } else {
      this.db
        .prepare(`
          UPDATE pico_depot_attachment
          SET last_fetch_condition = ?, last_fetch_at = ?, offered_commit = ?
          WHERE remote = ?
        `)
        .run(condition, input.at, input.offeredCommit, input.remote);
    }
    return this.picoDepotAttachment(input.remote)!;
  }

  public picoDepotAttachments(): readonly PicoDepotAttachment[] {
    this.ensureOpen();
    const rows = this.db
      .prepare('SELECT remote FROM pico_depot_attachment ORDER BY remote')
      .all() as Array<{ remote: string }>;
    return Object.freeze(rows.map((row) => this.picoDepotAttachment(row.remote)!));
  }

  /**
   * ADR 0143 DP1. What a fetch found, as an offer or as nothing.
   *
   * **Reading this changes nothing.** It takes what was seen on the remote and
   * answers whether there is a decision to put in front of a person; the row
   * is not touched, and a caller that never accepts leaves the depot running
   * exactly where it was. That is the whole of "a newer commit is an offer".
   */
  public picoDepotOffer(input: {
    remote: string;
    seenCommit: string;
  }): PicoDepotOffer | null {
    const attachment = this.picoDepotAttachment(input.remote);
    if (attachment === undefined) {
      throw new Error('pico_depot_not_attached');
    }
    return picoDepotOffer({ pin: attachment.pin, seenCommit: input.seenCommit });
  }

  /**
   * ADR 0143 DP1. Moves a depot to a commit a person named.
   *
   * The acceptance names the commit, so this is a decision about a specific
   * revision rather than about "the update", and an offer that moved between
   * the question and the answer is refused. It also re-reads the running
   * commit and refuses an offer that no longer starts where the depot is,
   * because an acceptance computed against a stale row would move the depot
   * from somewhere the person was not looking at.
   */
  public acceptPicoDepotOffer(input: {
    offer: PicoDepotOffer;
    acceptedCommit: string;
    acceptedAt: string;
  }): PicoDepotAttachment {
    this.ensureOpen();
    const attachment = this.picoDepotAttachment(input.offer.remote);
    if (attachment === undefined) {
      throw new Error('pico_depot_not_attached');
    }
    if (attachment.pin.commit !== input.offer.running) {
      throw new Error('pico_depot_offer_is_stale');
    }
    const pin = acceptPicoDepotOffer({
      offer: input.offer,
      acceptedCommit: input.acceptedCommit,
    });
    /**
     * **Und das Angebot geht mit**, gefunden am 2026-08-25, als diese Methode
     * zum ersten Mal erreichbar wurde. Ohne das bliebe `offered_commit` auf
     * dem Commit stehen, der jetzt läuft, und `picoDepotState` sagte weiter
     * `offered`: „es gibt etwas Neues" über genau das, was die Person gerade
     * angenommen hat. Ein angenommenes Angebot ist keins mehr - dieselbe
     * absichtliche Vergesslichkeit, mit der `acceptPicoDepotOffer` einen
     * gewöhnlichen Pin zurückgibt, der nichts davon weiß, ein Angebot gewesen
     * zu sein.
     */
    this.db
      .prepare(`
        UPDATE pico_depot_attachment
        SET running_commit = ?, accepted_at = ?, offered_commit = NULL
        WHERE remote = ?
      `)
      .run(pin.commit, input.acceptedAt, pin.remote);
    return this.picoDepotAttachment(pin.remote)!;
  }

  /**
   * ADR 0138 CO3/CO4. Whether this depot may be fetched right now, read from
   * the attachment rather than from a caller's belief about it.
   *
   * A depot nobody attached is refused as unpermitted rather than reported as
   * missing: from the fetcher's side the two are the same answer, and naming
   * the absence separately would invite a caller to treat "not attached" as a
   * reason to attach one.
   */
  public picoDepotFetchPermission(input: {
    remote: string;
    asked: boolean;
  }): PicoDepotFetchPermission {
    const attachment = this.picoDepotAttachment(input.remote);
    return picoDepotFetchPermission({
      mayFetch: attachment?.mayFetch ?? false,
      mayFetchUnasked: attachment?.mayFetchUnasked ?? false,
      asked: input.asked,
    });
  }

  /** ADR 0143 DP1. Removes the depot record and nothing else. */
  /**
   * ADR 0148 EX2/EX5. Records one exchange of mailbox addresses with a device.
   *
   * **The device is not an argument.** It comes from the four fields of the
   * delegation the ADR 0107 channel already authenticated, and a caller that
   * could name a different one would be letting a device choose which mailbox
   * it is - the same class of mistake as a supplier naming its own directory
   * (ADR 0143 DP8). The signature below takes a `principal` rather than a
   * fingerprint for exactly that reason: there is no shape in which the device
   * half arrives separately from the delegation it was proved by.
   *
   * Re-running replaces (ADR 0148 EX4): one row per device, newest addresses,
   * peer unchanged. That makes rotation, first run and the flooded-mailbox
   * remedy one code path rather than three.
   *
   * The two uniqueness refusals are the table's, not this method's, so a
   * second write path cannot get around them. They surface here by name
   * because ADR 0147 RY2 gives each a distinct meaning: two devices behind one
   * of *our* mailboxes stops the mailbox identifying the sender, and two
   * behind one of *theirs* is a redirection somebody handed us.
   */
  public exchangePicoLinkMailbox(input: {
    principal: {
      picoIdentityFingerprintHex: string;
      deviceSigningKeyFingerprintHex: string;
      deviceKeyAgreementKeyFingerprintHex: string;
      delegationId: string;
    };
    homeInbound: string;
    deviceInbound: string;
    exchangedAt: string;
  }): PicoLinkMailboxRecord {
    this.ensureOpen();
    parsePicoLinkPacketAddress(input.homeInbound);
    parsePicoLinkPacketAddress(input.deviceInbound);
    if (input.homeInbound === input.deviceInbound) {
      // We would write to the mailbox we told this device to write to, so our
      // own traffic would come back as theirs (ADR 0147 RY2).
      throw new Error('pico_link_mailbox_points_at_itself');
    }

    // ADR 0119 Q5. A new store answers the ceiling like every other, and only
    // for a device that is not already here - re-exchanging replaces a row
    // rather than adding one, and refusing that would leave a person unable to
    // rotate a flooded mailbox at exactly the moment they need to.
    const existing = this.picoLinkMailboxFor(input.principal.deviceSigningKeyFingerprintHex) !== undefined;
    if (!existing) {
      const reached = this.hasReachedStoreCeiling('link_mailbox');
      if (reached) {
        throw new Error('pico_link_mailbox_store_ceiling_reached');
      }
    }

    try {
      this.db
        .prepare(`
          INSERT INTO pico_link_mailbox (
            device_signing_key_fingerprint_hex,
            pico_identity_fingerprint_hex,
            device_key_agreement_key_fingerprint_hex,
            delegation_id,
            home_inbound,
            device_inbound,
            exchanged_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(device_signing_key_fingerprint_hex) DO UPDATE SET
            pico_identity_fingerprint_hex = excluded.pico_identity_fingerprint_hex,
            device_key_agreement_key_fingerprint_hex = excluded.device_key_agreement_key_fingerprint_hex,
            delegation_id = excluded.delegation_id,
            home_inbound = excluded.home_inbound,
            device_inbound = excluded.device_inbound,
            exchanged_at = excluded.exchanged_at
        `)
        .run(
          input.principal.deviceSigningKeyFingerprintHex,
          input.principal.picoIdentityFingerprintHex,
          input.principal.deviceKeyAgreementKeyFingerprintHex,
          input.principal.delegationId,
          input.homeInbound,
          input.deviceInbound,
          input.exchangedAt,
        );
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('pico_link_mailbox.home_inbound')) {
        throw new Error('pico_link_inbound_shared_between_peers');
      }
      if (message.includes('pico_link_mailbox.device_inbound')) {
        throw new Error('pico_link_outbound_shared_between_peers');
      }
      throw error;
    }

    // After the write, so a failure never inflates the count, and only for a
    // device that was not already here - re-exchanging upserts and costs no
    // row (the same shape `attachPicoSupplier` uses).
    if (!existing) {
      this.rowCounter.recordInsert('link_mailbox');
    }
    return this.picoLinkMailboxFor(input.principal.deviceSigningKeyFingerprintHex)!;
  }

  /**
   * ADR 0150 PU5. What this Home has already pushed about, for the decision
   * that refuses a second one.
   *
   * Read whole rather than queried per decision: the table is bounded by
   * devices times live events, and a caller that asked per candidate would
   * make the floor's own cost scale with what it is protecting.
   */
  public picoLinkPushLedger(): readonly PicoLinkPushLedgerEntry[] {
    this.ensureOpen();
    const rows = this.db
      .prepare(`
        SELECT device_signing_key_fingerprint_hex AS deviceSigningKeyFingerprintHex,
               occasion, event_id AS eventId, pushed_at AS pushedAt
        FROM pico_link_push_ledger
        ORDER BY pushed_at
      `)
      .all() as Array<{
        deviceSigningKeyFingerprintHex: string;
        occasion: string;
        eventId: string;
        pushedAt: string;
      }>;
    return Object.freeze(rows.map((row) => Object.freeze({
      deviceSigningKeyFingerprintHex: row.deviceSigningKeyFingerprintHex,
      occasion: row.occasion as PicoLinkPushOccasion,
      eventId: row.eventId,
      atMs: Date.parse(row.pushedAt),
    })));
  }

  /**
   * ADR 0150 PU5. Records a push that was sent.
   *
   * Refuses a second row for the same device and event rather than replacing
   * one: the schema holds the no-retry rule, so a caller that lost track
   * cannot push twice by writing twice.
   */
  public recordPicoLinkPush(input: {
    deviceSigningKeyFingerprintHex: string;
    occasion: PicoLinkPushOccasion;
    eventId: string;
    pushedAt: string;
  }): void {
    this.ensureOpen();
    assertPicoLinkPushOccasion(input.occasion);
    try {
      this.db
        .prepare(`
          INSERT INTO pico_link_push_ledger (
            device_signing_key_fingerprint_hex, occasion, event_id, pushed_at
          ) VALUES (?, ?, ?, ?)
        `)
        .run(input.deviceSigningKeyFingerprintHex, input.occasion, input.eventId, input.pushedAt);
    } catch (error) {
      // Befund B150. Stand hier als eigene, schwaechere Schreibweise derselben
      // Frage - `'UNIQUE'` statt `'UNIQUE constraint failed'` -, und sie haengt
      // an genau der Tatsache, die `isPicoUniqueConstraintViolation` unten
      // begruendet: der Primaerschluessel dieser Tabelle meldet sich als
      // UNIQUE-Verletzung. Ein Satz, der auf einer Begruendung ruht, gehoert
      // neben die Begruendung.
      if (isPicoUniqueConstraintViolation(error)) {
        throw new Error('pico_link_push_already_recorded');
      }
      throw error;
    }
  }

  /**
   * ADR 0150 PU5. Forgets pushes about events nobody can still be pushed for.
   *
   * The horizon is the caller's, because how long an event stays the same
   * event is the caller's question - a recovery window is days, and a floor is
   * five minutes.
   */
  public prunePicoLinkPushLedger(before: string): number {
    this.ensureOpen();
    return this.db
      .prepare('DELETE FROM pico_link_push_ledger WHERE pushed_at < ?')
      .run(before).changes;
  }

  public picoLinkMailboxFor(
    deviceSigningKeyFingerprintHex: string,
  ): PicoLinkMailboxRecord | undefined {
    this.ensureOpen();
    const row = this.db
      .prepare(`
        SELECT device_signing_key_fingerprint_hex AS deviceSigningKeyFingerprintHex,
               pico_identity_fingerprint_hex AS picoIdentityFingerprintHex,
               device_key_agreement_key_fingerprint_hex AS deviceKeyAgreementKeyFingerprintHex,
               delegation_id AS delegationId,
               home_inbound AS homeInbound,
               device_inbound AS deviceInbound,
               exchanged_at AS exchangedAt
        FROM pico_link_mailbox WHERE device_signing_key_fingerprint_hex = ?
      `)
      .get(deviceSigningKeyFingerprintHex) as PicoLinkMailboxRecord | undefined;
    return row === undefined ? undefined : Object.freeze({ ...row });
  }

  public picoLinkMailboxes(): readonly PicoLinkMailboxRecord[] {
    this.ensureOpen();
    const rows = this.db
      .prepare('SELECT device_signing_key_fingerprint_hex AS id FROM pico_link_mailbox ORDER BY device_signing_key_fingerprint_hex')
      .all() as Array<{ id: string }>;
    return Object.freeze(rows.map((row) => this.picoLinkMailboxFor(row.id)!));
  }

  /**
   * ADR 0148 EX3. The mailboxes this Home still honours, which is the only
   * list anything should collect from.
   *
   * **A mailbox is not revoked when a device is.** It is honoured while the
   * delegation it was issued to is active, asked here with the same check ADR
   * 0107 runs on every request. The alternative - a status column updated by a
   * lifecycle hook - is a second record to keep in step and a hook somebody
   * can forget, and what it guards is a revoked device holding a mailbox the
   * Home keeps collecting from.
   *
   * Nothing runs in between. A delegation that went inactive a millisecond ago
   * drops out of this list on the next call, because the list is derived and
   * not remembered.
   */
  public honouredPicoLinkMailboxes(
    sodium: IdentityVerificationSodium,
    at?: string,
  ): readonly PicoLinkMailboxRecord[] {
    return Object.freeze(this.picoLinkMailboxes().filter((record) => this.hasActivePicoIdentityDelegation({
      picoIdentityFingerprintHex: record.picoIdentityFingerprintHex,
      deviceSigningKeyFingerprintHex: record.deviceSigningKeyFingerprintHex,
      deviceKeyAgreementKeyFingerprintHex: record.deviceKeyAgreementKeyFingerprintHex,
      delegationId: record.delegationId,
      sodium,
      ...(at === undefined ? {} : { at }),
    })));
  }

  /**
   * ADR 0152 SE6. The provider registry, over this store's connection.
   *
   * Handed out rather than re-opened: two connections to one SQLite file are
   * two write locks and one of them eventually loses. The registry is a table
   * like any other here; it lives in its own file because the rule it enforces
   * - narrow, never widen - is worth reading beside itself rather than in the
   * middle of eight thousand lines.
   */
  public picoModelProviderRegistry(): PicoModelProviderRegistry {
    this.ensureOpen();
    return new PicoModelProviderRegistry(this.db);
  }

  /** ADR 0152. The per-person half, over the same connection. */
  public picoModelProviderConsent(): PicoModelProviderConsent {
    this.ensureOpen();
    return new PicoModelProviderConsent(this.db, new PicoModelProviderRegistry(this.db));
  }

  /** ADR 0049. The job queue, over this store's connection. */
  public picoModelJobQueue(): PicoModelJobQueue {
    this.ensureOpen();
    return new PicoModelJobQueue(this.db);
  }

  /** ADR 0126 P2. Which presences of an identity exist and what they offer. */
  public picoPresenceRegistry(): PicoPresenceRegistry {
    this.ensureOpen();
    return new PicoPresenceRegistry(this.db);
  }

  /**
   * ADR 0104 S3. The memory-encryption decision as Pico holds it.
   *
   * Absent means nobody has decided *and* nothing has been inherited yet,
   * which is the state every instance is in before its first boot under this
   * schema. It is not "off": off is an answer.
   */
  public picoMemoryEncryptionDecision(): {
    enabled: boolean;
    decidedAt: string;
    inheritedFromHost: boolean;
  } | undefined {
    this.ensureOpen();
    const row = this.db.prepare(`
      SELECT enabled, decided_at AS decidedAt,
             inherited_from_host AS inheritedFromHost
      FROM pico_memory_encryption_decision WHERE id = 1
    `).get() as { enabled: number; decidedAt: string; inheritedFromHost: number } | undefined;
    return row === undefined ? undefined : Object.freeze({
      enabled: row.enabled === 1,
      decidedAt: row.decidedAt,
      inheritedFromHost: row.inheritedFromHost === 1,
    });
  }

  /**
   * ADR 0104 S3. Whether this store already holds content only a key can read.
   *
   * **What an instance has is a better witness than what it was started
   * with.** The add-on option is retiring, so the day comes when an instance
   * upgrades onto a release that no longer declares it: the Supervisor strips
   * the value, the variable arrives absent, and an inheritance that read
   * absent as `false` would answer "off" for a Home whose memories are
   * encrypted - which reads back as `crypto_unavailable` for no reason
   * anybody chose.
   *
   * So when nothing was passed, this is asked instead. A row stored
   * `domain_encrypted` is not an opinion about a setting; it is content that
   * needs a key store to be readable at all.
   *
   * **The honest limit:** an instance that had encryption on and never wrote
   * an encrypted item leaves no trace here and inherits `off`. Nothing becomes
   * unreadable - there is nothing - and the first person to look can answer
   * the question in Pico, which is where it now lives.
   */
  public holdsEncryptedMemoryContent(): boolean {
    this.ensureOpen();
    const row = this.db
      .prepare("SELECT 1 AS present FROM memory_item WHERE content_posture = 'domain_encrypted' LIMIT 1")
      .get() as { present: number } | undefined;
    return row !== undefined;
  }

  /**
   * ADR 0104 S3. Records the decision, and says whether a person made it.
   *
   * **An inherited value never overwrites a decided one.** Reading a host
   * option is Pico noticing what it was booted with; a person answering is a
   * person answering, and letting the first replace the second would put the
   * add-on option back in charge through the door this table exists to close.
   */
  public decidePicoMemoryEncryption(input: {
    enabled: boolean;
    at: string;
    inheritedFromHost: boolean;
  }): void {
    this.ensureOpen();
    const existing = this.picoMemoryEncryptionDecision();
    if (input.inheritedFromHost && existing !== undefined && !existing.inheritedFromHost) {
      return;
    }
    this.db.prepare(`
      INSERT INTO pico_memory_encryption_decision (
        id, enabled, decided_at, inherited_from_host
      ) VALUES (1, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        enabled = excluded.enabled,
        decided_at = excluded.decided_at,
        inherited_from_host = excluded.inherited_from_host
    `).run(input.enabled ? 1 : 0, input.at, input.inheritedFromHost ? 1 : 0);
  }

  /** ADR 0104 S5 with ADR 0031. The relay account this Home holds. */
  public picoLinkRelayIdentity(): {
    operator: string;
    accountId: string;
    decidedAt: string;
    inheritedFromHost: boolean;
  } | undefined {
    this.ensureOpen();
    const row = this.db.prepare(`
      SELECT operator, account_id AS accountId, decided_at AS decidedAt,
             inherited_from_host AS inheritedFromHost
      FROM pico_link_relay_identity WHERE id = 1
    `).get() as {
      operator: string; accountId: string; decidedAt: string; inheritedFromHost: number;
    } | undefined;
    return row === undefined ? undefined : Object.freeze({
      operator: row.operator,
      accountId: row.accountId,
      decidedAt: row.decidedAt,
      inheritedFromHost: row.inheritedFromHost === 1,
    });
  }

  /**
   * ADR 0148. Changing this is a move, not an edit.
   *
   * **Every mailbox is an address at *this* operator under *this* account.**
   * ADR 0148 gives each relationship its own pair, so a Home that changed
   * account would be holding addresses nobody answers at and every device
   * would need a fresh exchange - which is a thing a person decides to do,
   * not a consequence of a field they edited.
   *
   * So a change with mailboxes in place is refused, and the refusal carries
   * the count: what it costs is the number of relationships that would have
   * to be re-established, and a person deciding to move should see it before
   * they do rather than discover it afterwards.
   */
  public decidePicoLinkRelayIdentity(input: {
    operator: string;
    accountId: string;
    at: string;
    inheritedFromHost: boolean;
  }): { ok: true } | { ok: false; reason: 'mailboxes_exist'; mailboxes: number } {
    this.ensureOpen();
    const existing = this.picoLinkRelayIdentity();
    if (input.inheritedFromHost && existing !== undefined && !existing.inheritedFromHost) {
      return { ok: true };
    }
    const changes = existing !== undefined
      && (existing.operator !== input.operator || existing.accountId !== input.accountId);
    if (changes) {
      const mailboxes = this.picoLinkMailboxes().length;
      if (mailboxes > 0) {
        return Object.freeze({ ok: false as const, reason: 'mailboxes_exist' as const, mailboxes });
      }
    }
    this.db.prepare(`
      INSERT INTO pico_link_relay_identity (
        id, operator, account_id, decided_at, inherited_from_host
      ) VALUES (1, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        operator = excluded.operator,
        account_id = excluded.account_id,
        decided_at = excluded.decided_at,
        inherited_from_host = excluded.inherited_from_host
    `).run(input.operator, input.accountId, input.at, input.inheritedFromHost ? 1 : 0);
    return { ok: true };
  }

  public detachPicoDepot(remote: string): void {
    this.ensureOpen();
    this.db.prepare('DELETE FROM pico_depot_attachment WHERE remote = ?').run(remote);
  }

  /**
   * ADR 0136. Detaching stops derivation and deletes nothing.
   *
   * ADR 0129 SR6's distinction, unchanged: stopping and forgetting are
   * different acts. What Pico derived from a library is an ordinary memory
   * item under ordinary custody and stays exactly where it was; what it never
   * owned was the library.
   */
  public detachPicoSupplier(identifier: string): void {
    this.ensureOpen();
    this.db
      .prepare('DELETE FROM pico_supplier_attachment WHERE identifier = ?')
      .run(identifier);
  }

  /**
   * ADR 0140 RL4, the durable half. What a person decided a requested effect
   * is answered with, in the domain they decided it for.
   *
   * There is no host-configuration path into this and no effect that can
   * reach it - `module:check` refuses a module that even links against the
   * decision contract. A rule change arrives over an authenticated surface or
   * not at all.
   */
  public setPicoRuleDecision(input: {
    effectName: string;
    privacyDomain: string;
    decision: PicoRulesDecisionValue;
    decidedAt: string;
  }): void {
    this.ensureOpen();
    this.db
      .prepare(`
        INSERT INTO pico_rule_decision (effect_name, privacy_domain, decision, decided_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(effect_name, privacy_domain) DO UPDATE
          SET decision = excluded.decision, decided_at = excluded.decided_at
      `)
      .run(input.effectName, input.privacyDomain, input.decision, input.decidedAt);
  }

  /**
   * ADR 0140 RL4/RL6. The decision recorded for one effect in one domain, or
   * `undefined` where a person has not decided.
   *
   * Undefined is not `deny` here, and the distinction is load-bearing: ADR 0139
   * AC4's consent record already carries a person's decision that this effect
   * may exist, and this refines it. A Home where nobody has written an explicit
   * rule is not a Home that forbade everything - that is the same asymmetry
   * ADR 0127 M3 draws between "never decided" and "decided to leave off".
   */
  public picoRuleDecision(input: {
    effectName: string;
    privacyDomain: string;
  }): PicoRulesDecisionValue | undefined {
    this.ensureOpen();
    const row = this.db
      .prepare(`
        SELECT decision FROM pico_rule_decision
        WHERE effect_name = ? AND privacy_domain = ?
      `)
      .get(input.effectName, input.privacyDomain) as { decision: string } | undefined;
    return row?.decision as PicoRulesDecisionValue | undefined;
  }

  /**
   * ADR 0140 RL4. Nimmt eine Regel zurück, so dass wieder keine gilt.
   *
   * **Zurücknehmen ist nicht `deny`**, und deshalb braucht es diesen Weg: die
   * ADR 0139 AC4 Zustimmung sagt bereits, dass dieser Effekt existieren darf,
   * und eine abwesende Regel überlässt die Antwort dem Risiko. Wer nur auf
   * `require_approval` zurückstellen könnte, hätte für einen `local_write`
   * Effekt etwas *Strengeres* hinterlassen als vorher - eine Rücknahme, die
   * eine Verschärfung ist.
   */
  public forgetPicoRuleDecision(input: {
    effectName: string;
    privacyDomain: string;
  }): 'forgotten' | 'no_rule' {
    this.ensureOpen();
    const removed = this.db
      .prepare('DELETE FROM pico_rule_decision WHERE effect_name = ? AND privacy_domain = ?')
      .run(input.effectName, input.privacyDomain);
    return removed.changes > 0 ? 'forgotten' : 'no_rule';
  }

  /** ADR 0140 RL4. Every recorded rule, for a surface that shows them. */
  public picoRuleDecisions(): ReadonlyArray<{
    effectName: string;
    privacyDomain: string;
    decision: PicoRulesDecisionValue;
    decidedAt: string;
  }> {
    this.ensureOpen();
    const rows = this.db
      .prepare(`
        SELECT
          effect_name AS effectName,
          privacy_domain AS privacyDomain,
          decision,
          decided_at AS decidedAt
        FROM pico_rule_decision
        ORDER BY effect_name, privacy_domain
      `)
      .all() as Array<{
        effectName: string;
        privacyDomain: string;
        decision: PicoRulesDecisionValue;
        decidedAt: string;
      }>;
    return Object.freeze(rows.map((row) => Object.freeze(row)));
  }

  /**
   * ADR 0141 RN5. Action History, which is a **view** and not a store.
   *
   * ADR 0026 already says what Action History is, in one line: the product
   * name for the audit log. So there is no table here and no event type
   * announcing that an event happened - `pico_audit_record` is keyed on
   * `event_id` with `REFERENCES pico_event`, which puts the chain *over* the
   * log rather than beside it, and writing a record about a record would add a
   * row rather than an assurance.
   *
   * The consequence is the reason to do it this way. A separate store would
   * have to join the shred cascade, the backup exclusions, boot
   * reconciliation, the ADR 0119 Q5 ceilings and the chain - the five places
   * ADR 0127 counts - against zero for a projection over rows that are already
   * governed. An action's record is shredded, retained, restored and chained
   * because it is an event, not because someone remembered to make it so.
   *
   * `chained` is reported per row rather than assumed. An action fact with no
   * chain record is not hidden here: the whole point of the chain is that a
   * gap is visible, and a history that quietly dropped unchained rows would be
   * the one place a tampering would not show.
   */
  public picoActionHistory(options: { limit?: number } = {}): readonly PicoActionHistoryRecord[] {
    this.ensureOpen();
    const limit = options.limit ?? 100;
    if (!Number.isSafeInteger(limit) || limit < 1) {
      throw new Error('invalid_pico_action_history_limit');
    }
    const placeholders = picoActionHistoryFactTypes.map(() => '?').join(', ');
    const rows = this.db
      .prepare(`
        SELECT
          e.event_id AS eventId,
          e.type AS type,
          e.wall_time AS wallTime,
          e.payload_json AS payloadJson,
          r.writer_id AS writerId,
          r.chain_position AS chainPosition,
          r.digest_hex AS digestHex
        FROM pico_event e
        LEFT JOIN pico_audit_record r ON r.event_id = e.event_id
        WHERE e.type IN (${placeholders})
        ORDER BY e.lamport DESC, e.event_id DESC
        LIMIT ?
      `)
      .all(...picoActionHistoryFactTypes, limit) as Array<{
        eventId: string;
        type: string;
        wallTime: string;
        payloadJson: string;
        writerId: string | null;
        chainPosition: number | null;
        digestHex: string | null;
      }>;

    return Object.freeze(rows.map((row) => Object.freeze({
      eventId: row.eventId,
      type: row.type as PicoActionHistoryFactType,
      occurredAt: row.wallTime,
      payload: JSON.parse(row.payloadJson) as Record<string, unknown>,
      chained: row.digestHex !== null,
      ...(row.writerId === null ? {} : { writerId: row.writerId }),
      ...(row.chainPosition === null ? {} : { chainPosition: row.chainPosition }),
    })));
  }

  /**
   * ADR 0139 AC4. The effects a person consented to for one module, as they
   * read at the moment they agreed.
   */
  public picoModuleEffectConsent(
    identifier: PicoModuleIdentifier,
  ): readonly PicoModuleEffect[] {
    this.ensureOpen();
    const rows = this.db
      .prepare(`
        SELECT effect_name AS name, description, risk
        FROM pico_module_effect_consent
        WHERE identifier = ?
        ORDER BY effect_name
      `)
      .all(identifier) as Array<{ name: string; description: string; risk: string }>;
    return Object.freeze(rows.map((row) => Object.freeze({
      name: row.name,
      description: row.description,
      risk: row.risk,
    })) as PicoModuleEffect[]);
  }

  /**
   * ADR 0139 AC4. Which modules now declare something other than what was
   * agreed to, and what moved.
   *
   * Asked at boot and before an effect is requested. Returns the drift rather
   * than a boolean, in ADR 0127 M4's posture: a person being asked again is
   * told what changed, not merely that something did.
   *
   * A module that was never activated has no consent rows and no declared
   * effects to compare against until someone switches it on, which is why the
   * empty case reads as current rather than as drifted - it is not that
   * consent was lost, it is that nothing has been asked yet.
   */
  public picoModulesAwaitingConsent(
    manifests: ReadonlyArray<{
      identifier: PicoModuleIdentifier;
      effects: readonly PicoModuleEffect[];
    }>,
  ): ReadonlyArray<{ identifier: PicoModuleIdentifier; drift: PicoModuleConsentDrift }> {
    this.ensureOpen();
    const awaiting: Array<{ identifier: PicoModuleIdentifier; drift: PicoModuleConsentDrift }> = [];
    for (const manifest of manifests) {
      const drift = picoModuleConsentDrift(
        this.picoModuleEffectConsent(manifest.identifier),
        manifest.effects,
      );
      if (!picoModuleConsentIsCurrent(drift)) {
        awaiting.push({ identifier: manifest.identifier, drift });
      }
    }
    return Object.freeze(awaiting);
  }

  /**
   * ADR 0121 J2/J4. Re-proves every link and compares each writer's head with
   * the anchor's checkpoint, in the ADR 0115 U2 posture: report loudly, never
   * drop, repair or hide the affected range.
   *
   * A checkpoint the anchor has never seen is the detection this gate exists
   * for. Rewriting history in the database is cheap; rewriting it so the
   * excluded anchor still agrees means writing to the one location the
   * supported restore path does not carry.
   *
   * Coverage is reported rather than assumed: a writer with no checkpoint is
   * `unanchored`, not `verified`, because "nobody checked" must never render
   * as a green mark.
   */
  public verifyPicoAuditChain(): PicoAuditChainVerification {
    this.ensureOpen();
    const writers = (this.db
      .prepare('SELECT DISTINCT writer_id AS writerId FROM pico_audit_record ORDER BY writer_id')
      .all() as { writerId: string }[]).map((row) => row.writerId);

    const results: PicoAuditWriterVerification[] = [];
    for (const writerId of writers) {
      const rows = this.db
        .prepare(`
          SELECT r.chain_position AS chainPosition,
                 r.previous_digest_hex AS previousDigestHex,
                 r.digest_hex AS digestHex,
                 r.event_id AS eventId,
                 e.type AS eventType,
                 e.wall_time AS occurredAt
          FROM pico_audit_record r
          JOIN pico_event e ON e.event_id = r.event_id
          WHERE r.writer_id = ?
          ORDER BY r.chain_position
        `)
        .all(writerId) as {
          chainPosition: number;
          previousDigestHex: string | null;
          digestHex: string;
          eventId: string;
          eventType: string;
          occurredAt: string;
        }[];

      let status: PicoAuditWriterVerification['status'] = 'verified';
      let brokenAtPosition: number | undefined;
      let expectedPosition = 1;
      let previousDigestHex: string | null = null;

      for (const row of rows) {
        if (row.chainPosition !== expectedPosition
          || row.previousDigestHex !== previousDigestHex) {
          // A gap is a deletion: the surviving rows still link to each other,
          // which is exactly why position and predecessor are both checked.
          status = 'broken';
          brokenAtPosition = row.chainPosition;
          break;
        }
        if (this.auditSodium !== undefined) {
          const recomputed = picoHomeAuditRecordDigestHex(this.auditSodium, {
            writerId,
            chainPosition: row.chainPosition,
            eventId: row.eventId,
            eventType: row.eventType as FoundationEventType,
            occurredAt: row.occurredAt,
            previousDigestHex: row.previousDigestHex,
          });
          if (recomputed !== row.digestHex) {
            status = 'broken';
            brokenAtPosition = row.chainPosition;
            break;
          }
        }
        previousDigestHex = row.digestHex;
        expectedPosition += 1;
      }

      const head = rows.at(-1);
      const checkpoint = this.recoveryAnchor?.auditCheckpoint(writerId);
      if (status === 'verified') {
        if (checkpoint === undefined) {
          status = 'unanchored';
        } else if (head === undefined
          || checkpoint.chainPosition > head.chainPosition
          || (checkpoint.chainPosition === head.chainPosition
            && checkpoint.headDigestHex !== head.digestHex)) {
          // The anchor holds a head this log does not: the database was rolled
          // back past a record the anchor already saw. Reported, never
          // repaired - the anchor can refuse to confirm a head and can never
          // make one valid.
          status = 'rolled_back';
        }
      }

      results.push({
        writerId,
        recordCount: rows.length,
        ...(brokenAtPosition === undefined ? {} : { brokenAtPosition }),
        ...(checkpoint === undefined
          ? {}
          : { checkpointedPosition: checkpoint.chainPosition }),
        status,
      });
    }

    return {
      writers: results,
      // Absent hashing means nothing was chained; saying "verified" about an
      // empty chain would be the green mark this gate forbids.
      chained: this.auditSodium !== undefined,
    };
  }

  /**
   * ADR 0119 Q1. `normal` when no reading is configured: a store with no
   * free-space source is a development host, and this ADR scopes itself
   * against deployments rather than against those.
   */
  public storagePressure(): PicoStoragePressureState {
    return this.storageCondition().state;
  }

  /**
   * ADR 0119 Q1/Q5. Disk and per-store ceilings together, with every applicable
   * reason and the class of action that clears it.
   *
   * A reached ceiling is re-counted before it is believed. Insert counts drift
   * upward between resyncs by design (see {@link PicoStoreRowCounter}), so
   * without this a person who shredded a domain to make room would stay refused
   * on a number that is no longer true. Doing it here means the recount happens
   * only where it can change the answer.
   */
  /**
   * ADR 0119 Q5. Hat *diese* Ablage ihre Deckenzahl erreicht?
   *
   * **Eine Wahrheit, die bis zum 2026-09-14 viermal geschrieben stand** - bei
   * den Beobachtungen, den Zulieferern, den Depots und den Postfaechern, jedes
   * Mal als dieselbe Filterung ueber `storageCondition().reasons`. Seit Befund
   * B170 kommen zwei Stellen dazu (`memory_item` und `share_envelope`), und
   * sechsmal dasselbe zu schreiben waere die Drift, die dieser Baum sonst
   * ueberall entfernt.
   *
   * `storageCondition` zaehlt eine erreichte Decke neu, bevor es ihr glaubt -
   * wer gerade geloescht hat, wird also nicht an einer veralteten Zahl
   * abgewiesen.
   */
  public hasReachedStoreCeiling(store: PicoDurableStore): boolean {
    return this.storageCondition().reasons.some(
      (reason) => reason.cause === 'store_ceiling' && reason.store === store,
    );
  }

  public storageCondition(): PicoStorageCondition {
    const evaluate = (): PicoStorageCondition => evaluatePicoStorageCondition({
      ...(this.availableBytes === undefined
        ? {}
        : { availableBytes: this.availableBytes() }),
      ...(this.storageReserveBytes === undefined
        ? {}
        : { reserveBytes: this.storageReserveBytes }),
      ceilings: this.rowCounter.ceilings(),
    });

    const condition = evaluate();
    if (!condition.reasons.some((reason) => reason.cause === 'store_ceiling')) {
      return condition;
    }
    this.rowCounter.resync();
    return evaluate();
  }

  /**
   * ADR 0122 Y6. Records the running version outside restorable snapshots and
   * returns what was there before. `null` when no anchor is available, which
   * reads as a first boot rather than as a silent match.
   */
  public observeServiceVersion(version: string): string | null {
    this.ensureOpen();
    return this.recoveryAnchor?.observeServiceVersion(version) ?? null;
  }

  /** ADR 0120 N2. The durable floor, or `null` when no anchor is available. */
  public recoveryAnchorFloorMs(): number | null {
    return anchorFloorMs(this.recoveryAnchor);
  }

  /**
   * ADR 0120 N2. Persists the observed time this process has accumulated.
   * Called at boot and on the retention tick: without it a Home that restarts
   * often would keep almost all of its floor advance in memory and lose it,
   * so its objection windows would take far longer than the time it actually
   * ran. Losing unpersisted progress only ever refuses more, so this is a
   * liveness measure rather than a safety one.
   */
  public observeRecoveryAnchor(): void {
    this.recoveryAnchor?.observe();
  }

  public readerCustody(
    sodium: IdentityVerificationSodium,
    readerKeySelector?: PicoIdentityReaderKeySelector,
  ): ReaderCustodyStore {
    this.ensureOpen();
    return new ReaderCustodyStore(this.db, sodium, {
      foundingRecord: () => this.picoHomeFoundingRecord(),
      currentHostSigningKeyFingerprintHex: () =>
        this.currentPicoHomeHostKeyHead()?.hostSigningKeyFingerprintHex,
      hasActiveMembership: (picoIdentityFingerprintHex, homeId, at) =>
        this.hasActivePicoHomeMembership(
          picoIdentityFingerprintHex,
          homeId,
          at,
        ),
      selectReaderKey: readerKeySelector === undefined
        ? undefined
        : (input) => readerKeySelector.select(input),
    });
  }

  // Named retention policies (ADR 0074), sharing this store's connection.
  public retentionPolicies(): RetentionPolicyStore {
    this.ensureOpen();
    return new RetentionPolicyStore(this.db);
  }

  // The Foundation Operator credential (ADR 0075/0076), sharing this store's
  // connection. Only the Argon2id verifier is persisted; sessions are never
  // stored here.
  public operators(sodium: PasswordHashingSodium): OperatorStore {
    this.ensureOpen();
    return new OperatorStore(this.db, sodium);
  }

  /**
   * Re-applies append-only memory.tombstone events onto the memory store
   * (ADR 0070 recovery direction). This enforces recorded deletions after a
   * restore that resurrected deleted items as active. Idempotent; returns the
   * number of items that were newly enforced to the tombstoned state.
   */
  public reconcileMemoryTombstones(): { enforced: number } {
    this.ensureOpen();

    // Resilient to non-standard migration sets: without both tables there is
    // nothing to reconcile.
    const tables = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('pico_event', 'memory_item')")
      .all() as { name: string }[];
    if (tables.length < 2) {
      return { enforced: 0 };
    }

    const rows = this.db
      .prepare("SELECT payload_json FROM pico_event WHERE type = 'memory.tombstone'")
      .all() as { payload_json: string }[];

    const memory = new MemoryStore(this.db, undefined, this.rowCounter,
      () => this.hasReachedStoreCeiling('memory_item'));
    let enforced = 0;

    for (const row of rows) {
      let payload: unknown;
      try {
        payload = JSON.parse(row.payload_json);
      } catch {
        continue;
      }

      if (payload === null || typeof payload !== 'object') {
        continue;
      }

      const { memoryItemId, privacyDomain } = payload as { memoryItemId?: unknown; privacyDomain?: unknown };
      if (typeof memoryItemId !== 'string' || typeof privacyDomain !== 'string') {
        continue;
      }

      if (memory.enforceTombstone(memoryItemId, privacyDomain) === 'tombstoned') {
        enforced += 1;
      }
    }

    return { enforced };
  }

  public close(): void {
    if (this.closed) {
      return;
    }

    this.db.close();
    this.closed = true;
  }

  private selectPageRows(limit: number, after: EventCursor | null): EventRow[] {
    if (after === null) {
      return this.db.prepare(`
        SELECT *
        FROM pico_event
        ORDER BY lamport ASC, wall_time ASC, event_id ASC
        LIMIT ?
      `).all(limit) as EventRow[];
    }

    return this.db.prepare(`
      SELECT *
      FROM pico_event
      WHERE
        lamport > ?
        OR (lamport = ? AND wall_time > ?)
        OR (lamport = ? AND wall_time = ? AND event_id > ?)
      ORDER BY lamport ASC, wall_time ASC, event_id ASC
      LIMIT ?
    `).all(after.lamport, after.lamport, after.wallTime, after.lamport, after.wallTime, after.eventId, limit) as EventRow[];
  }

  private selectTailRows(limit: number): EventRow[] {
    return this.db.prepare(`
      SELECT *
      FROM pico_event
      ORDER BY lamport DESC, wall_time DESC, event_id DESC
      LIMIT ?
    `).all(limit) as EventRow[];
  }

  private ensureOpen(): void {
    if (this.closed) {
      throw new Error('EventStore is closed.');
    }
  }

  private insertPicoHomeFoundingRecord(record: PicoHomeFoundingRecord): void {
    this.db
      .prepare(`
        INSERT INTO pico_home_founding_record (
          id,
          schema,
          founding_id,
          home_id,
          claim_id,
          home_host_pico_identity_fingerprint_hex,
          host_signing_key_fingerprint_hex,
          host_key_agreement_key_fingerprint_hex,
          founded_at,
          lifecycle_order,
          claim_response_json,
          founding_json,
          claimant_identity_key_record_json,
          claimant_founding_signature_hex,
          host_claim_response_signature_hex,
          host_founding_signature_hex,
          first_device_evidence_json,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        1,
        record.schema,
        record.founding.foundingId,
        record.founding.homeId,
        record.hostClaimResponse.claimResponse.claimId,
        record.founding.homeHostPicoIdentityFingerprintHex,
        record.founding.hostSigningKeyFingerprintHex,
        record.founding.hostKeyAgreementKeyFingerprintHex,
        record.founding.foundedAt,
        record.founding.lifecycleOrder,
        serializePayload(record.hostClaimResponse.claimResponse),
        serializePayload(record.founding),
        serializePayload(record.claimantIdentityKeyRecord),
        record.claimantFoundingSignatureHex,
        record.hostClaimResponse.hostSignatureHex,
        record.hostFoundingSignatureHex,
        serializePayload({
          firstDeviceSigningKeyRecord: record.firstDeviceSigningKeyRecord,
          firstDeviceKeyAgreementKeyRecord: record.firstDeviceKeyAgreementKeyRecord,
          firstDeviceDelegation: record.firstDeviceDelegation,
          firstDeviceRevocations: record.firstDeviceRevocations,
        }),
        record.createdAt,
      );
  }

  private picoHomeMembership(membershipId: string): PicoHomeMembership | undefined {
    const row = this.db
      .prepare(`
        SELECT ${picoHomeMembershipColumns}
        FROM pico_home_membership
        WHERE membership_id = ?
      `)
      .get(membershipId) as PicoHomeMembershipRow | undefined;

    return row === undefined ? undefined : mapPicoHomeMembership(row);
  }

  private upsertPicoHomeMembership(membership: PicoHomeMembership): void {
    assertPicoHomeMembership(membership);

    this.db
      .prepare(`
        INSERT INTO pico_home_membership (
          membership_id,
          home_id,
          pico_identity_fingerprint_hex,
          role,
          status,
          scopes_json,
          source,
          source_ref,
          valid_from,
          valid_until,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(membership_id) DO UPDATE SET
          home_id = excluded.home_id,
          pico_identity_fingerprint_hex = excluded.pico_identity_fingerprint_hex,
          role = excluded.role,
          status = excluded.status,
          scopes_json = excluded.scopes_json,
          source = excluded.source,
          source_ref = excluded.source_ref,
          valid_from = excluded.valid_from,
          valid_until = excluded.valid_until,
          updated_at = excluded.updated_at
      `)
      .run(
        membership.membershipId,
        membership.homeId,
        membership.picoIdentityFingerprintHex,
        membership.role,
        membership.status,
        serializePayload(membership.scopes),
        membership.source,
        membership.sourceRef,
        membership.validFrom,
        membership.validUntil,
        membership.createdAt,
        membership.updatedAt,
      );
  }

  private mapRow(row: EventRow): PicoEvent {
    return {
      eventId: row.event_id,
      deviceId: row.device_id,
      sessionId: row.session_id ?? undefined,
      lamport: row.lamport,
      wallTime: row.wall_time,
      type: row.type as PicoEvent['type'],
      stream: row.stream,
      payload: JSON.parse(row.payload_json) as unknown,
      signature: row.signature ?? undefined,
      ...(row.payload_posture ? { payloadPosture: row.payload_posture as PayloadPosture } : {}),
      ...(row.origin ? { origin: row.origin as PicoEventOriginClass } : {}),
    };
  }
}

function defaultBackupDirectory(databasePath: string): string {
  return join(dirname(databasePath), 'backups');
}

interface EventRow {
  event_id: string;
  device_id: string;
  session_id: string | null;
  lamport: number;
  wall_time: string;
  type: string;
  stream: string;
  payload_json: string;
  signature: string | null;
  payload_posture: string | null;
  origin: string | null;
}

interface PicoHomeClaimStateRow {
  state: string;
  hostAdminPicoId: string | null;
  homeId: string | null;
  hostSigningKeyFingerprintHex: string | null;
  hostKeyAgreementKeyFingerprintHex: string | null;
  claimedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PicoHomeFoundingRecordRow {
  schema: string;
  foundingId: string;
  homeId: string;
  claimId: string;
  homeHostPicoIdentityFingerprintHex: string;
  hostSigningKeyFingerprintHex: string;
  hostKeyAgreementKeyFingerprintHex: string;
  foundedAt: string;
  lifecycleOrder: string;
  claimResponseJson: string;
  foundingJson: string;
  claimantIdentityKeyRecordJson: string;
  claimantFoundingSignatureHex: string;
  hostClaimResponseSignatureHex: string;
  hostFoundingSignatureHex: string;
  firstDeviceEvidenceJson: string | null;
  createdAt: string;
}

interface PicoHomeMembershipCredentialRow {
  membership_json: string;
  issuer_identity_key_record_json: string;
  issuer_signature_hex: string;
  host_activation_signature_hex: string;
  created_at: string;
}

interface SignedEvidenceRow {
  recordJson: string;
  keyJson: string;
  signatureHex: string;
}

interface PicoIdentityReaderKeyRow {
  delegationId: string;
  homeId: string;
  picoIdentityFingerprintHex: string;
  deviceSigningKeyFingerprintHex: string;
  deviceKeyAgreementKeyFingerprintHex: string;
  keyJson: string;
}

interface PicoHomeDeviceLifecycleTransitionRow {
  transitionId: string;
  action: string;
  homeId: string;
  picoIdentityFingerprintHex: string;
  sponsorDelegationId: string;
  targetDelegationId: string;
  submissionDigestHex: string;
  recordJson: string;
  acceptedAt: string;
}

interface PicoHomeDeviceRecoveryRow {
  recoveryId: string;
  homeId: string;
  picoIdentityFingerprintHex: string;
  status: PicoHomeDeviceRecoveryPendingStatus;
  targetDelegationId: string;
  targetDeviceSigningKeyFingerprintHex: string;
  targetDeviceKeyAgreementKeyFingerprintHex: string;
  observedLifecycleOrder: string;
  evidenceDigestHex: string;
  claimDigestHex: string;
  submissionJson: string;
  acceptedAt: string;
  effectiveAt: string;
  completionExpiresAt: string;
  resolvedAt: string | null;
  supersededByRecoveryId: string | null;
  recoveryRecordJson: string | null;
}

/**
 * Ist dieser Fehler eine Sachaussage oder ein Unfall?
 *
 * Eine Eindeutigkeitsverletzung ist eine Antwort an die Person: jemand war
 * schneller, oder dieselbe Kennung wurde zweimal benutzt. Eine volle Platte,
 * eine gesperrte Datenbank, ein E/A-Fehler, eine Tabelle, die eine misslungene
 * Wanderung nicht hinterlassen hat - das sind keine Antworten, und wer sie als
 * `conflicting_record` ausgibt, sagt der Person etwas ueber ihre Lage, was in
 * Wahrheit etwas ueber das Geraet ist (Befund B72).
 *
 * Der Geraetelebenszyklus unterschied das schon; die Wiederherstellung und die
 * Wurzelrotation nicht, und beides sind Pfade, die eine Person genau dann
 * betritt, wenn sie nichts anderes mehr hat. Die Unterscheidung steht deshalb
 * einmal hier statt dreimal verschieden.
 *
 * SQLite meldet auch eine verletzte Primaerschluessel-Bedingung als
 * "UNIQUE constraint failed", weshalb die eine Zeichenkette beide Faelle deckt.
 */
function isPicoUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Error
    && error.message.includes('UNIQUE constraint failed');
}

class PicoHomeDeviceLifecycleCommitError extends Error {
  public constructor(
    public readonly reason: 'invalid_transition' | 'conflicting_record',
  ) {
    super(reason);
  }
}

class PicoHomeDeviceRecoveryCommitError extends Error {
  public constructor(
    public readonly reason: 'invalid_recovery' | 'conflicting_record',
  ) {
    super(reason);
  }
}

interface DomainReadGrantRecordRow {
  grantJson: string;
  issuerIdentityKeyRecordJson: string;
  issuerSignatureHex: string;
  createdAt: string;
}

interface DomainReadGrantLifecycleRecordRow {
  lifecycleJson: string;
  issuerIdentityKeyRecordJson: string;
  issuerSignatureHex: string;
  createdAt: string;
}

interface DomainReadGrantViewRow {
  grantId: string;
  homeId: string;
  privacyDomain: string;
  controllerPicoIdentityFingerprintHex: string;
  readerPicoIdentityFingerprintHex: string;
  validFrom: string;
  validUntil: string;
  lifecycleOrder: string;
  createdAt: string;
}

interface PicoShareEnvelopeRow {
  issuanceId: string;
  delegationId: string;
  envelopeJson: string;
  sealedWrapHex: string;
  issuerIdentityKeyRecordJson: string;
  issuerSignatureHex: string;
  createdAt: string;
}

interface PicoHomeMembershipRow {
  membershipId: string;
  homeId: string;
  picoIdentityFingerprintHex: string;
  role: string;
  status: string;
  scopesJson: string;
  source: string;
  sourceRef: string;
  validFrom: string;
  validUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

const picoHomeMembershipColumns = `
          membership_id AS membershipId,
          home_id AS homeId,
          pico_identity_fingerprint_hex AS picoIdentityFingerprintHex,
          role,
          status,
          scopes_json AS scopesJson,
          source,
          source_ref AS sourceRef,
          valid_from AS validFrom,
          valid_until AS validUntil,
          created_at AS createdAt,
          updated_at AS updatedAt
`;

function mapPicoHomeClaimState(row: PicoHomeClaimStateRow): PicoHomeClaimState {
  if (
    row.state === 'unclaimed'
    && row.hostAdminPicoId === null
    && row.homeId === null
    && row.hostSigningKeyFingerprintHex === null
    && row.hostKeyAgreementKeyFingerprintHex === null
    && row.claimedAt === null
  ) {
    return {
      state: 'unclaimed',
      hostAdminPicoId: null,
      homeId: null,
      hostSigningKeyFingerprintHex: null,
      hostKeyAgreementKeyFingerprintHex: null,
      claimedAt: null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  if (row.state === 'claimed' && row.hostAdminPicoId !== null && row.hostAdminPicoId.trim() !== '' && row.claimedAt !== null) {
    return {
      state: 'claimed',
      hostAdminPicoId: row.hostAdminPicoId,
      homeId: row.homeId,
      hostSigningKeyFingerprintHex: row.hostSigningKeyFingerprintHex,
      hostKeyAgreementKeyFingerprintHex: row.hostKeyAgreementKeyFingerprintHex,
      claimedAt: row.claimedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  throw new Error('Pico Home claim state is invalid.');
}

function mapPicoHomeFoundingRecord(row: PicoHomeFoundingRecordRow): PicoHomeFoundingRecord {
  if (row.schema !== picoHomeFoundingRecordSchema) {
    throw new Error('Pico Home founding record is invalid.');
  }

  const common = {
    founding: JSON.parse(row.foundingJson) as PicoHomeFoundingRecord['founding'],
    claimantIdentityKeyRecord: JSON.parse(row.claimantIdentityKeyRecordJson) as PicoHomeFoundingRecord['claimantIdentityKeyRecord'],
    claimantFoundingSignatureHex: row.claimantFoundingSignatureHex,
    hostClaimResponse: {
      schema: picoHomeClaimResponseRecordSchema,
      claimResponse: JSON.parse(row.claimResponseJson) as PicoHomeFoundingRecord['hostClaimResponse']['claimResponse'],
      hostSignatureHex: row.hostClaimResponseSignatureHex,
    },
    hostFoundingSignatureHex: row.hostFoundingSignatureHex,
    createdAt: row.createdAt,
  };
  if (row.firstDeviceEvidenceJson === null) {
    throw new Error('Pico Home founding evidence is missing.');
  }
  const evidence = JSON.parse(row.firstDeviceEvidenceJson) as PicoHomeFirstDeviceEvidence;
  return {
    schema: picoHomeFoundingRecordSchema,
    ...common,
    ...evidence,
  } as PicoHomeFoundingRecord;
}

function mapPicoHomeMembership(row: PicoHomeMembershipRow): PicoHomeMembership {
  const membership: PicoHomeMembership = {
    membershipId: row.membershipId,
    homeId: row.homeId,
    picoIdentityFingerprintHex: row.picoIdentityFingerprintHex,
    role: toPicoHomeMembershipRole(row.role),
    status: toPicoHomeMembershipStatus(row.status),
    scopes: parsePicoHomeMembershipScopes(row.scopesJson),
    source: toPicoHomeMembershipSource(row.source),
    sourceRef: row.sourceRef,
    validFrom: row.validFrom,
    validUntil: row.validUntil,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };

  assertPicoHomeMembership(membership);
  return membership;
}

function mapPicoShareEnvelopeRow(row: PicoShareEnvelopeRow): PicoShareEnvelopeStoredRecord {
  return {
    issuanceId: row.issuanceId,
    delegationId: row.delegationId,
    record: {
      schema: picoShareEnvelopeRecordSchema,
      envelope: JSON.parse(row.envelopeJson) as PicoShareEnvelopeRecord['envelope'],
      sealedWrapHex: row.sealedWrapHex,
      issuerIdentityKeyRecord: JSON.parse(
        row.issuerIdentityKeyRecordJson,
      ) as PicoShareEnvelopeRecord['issuerIdentityKeyRecord'],
      issuerSignatureHex: row.issuerSignatureHex,
      createdAt: row.createdAt,
    },
  };
}

function picoShareEnvelopeReference(stored: PicoShareEnvelopeStoredRecord): PicoShareEnvelopeReference {
  return {
    grantId: stored.record.envelope.grantId,
    privacyDomain: stored.record.envelope.domainId,
    readerKeyFingerprintHex: stored.record.envelope.readerKeyFingerprintHex,
    kekVersion: stored.record.envelope.kekVersion,
  };
}

function isSameStoredEvent(row: EventRow, event: PicoEvent, payloadJson: string): boolean {
  return row.event_id === event.eventId
    && row.device_id === event.deviceId
    && row.session_id === (event.sessionId ?? null)
    && row.lamport === event.lamport
    && row.wall_time === event.wallTime
    && row.type === event.type
    && row.stream === event.stream
    && serializeStoredPayload(row.payload_json) === payloadJson
    && row.signature === (event.signature ?? null)
    && row.payload_posture === (event.payloadPosture ?? null);
  // `origin` is deliberately absent from this comparison: it is server-assigned
  // provenance, not client payload. Origin sticks to the content at first
  // intake (ADR 0116) - an idempotent retry of the same bytes under a
  // different authority, or across the labeling upgrade, is still the same
  // event, and a replay never relabels the stored row.
}

function assertStoredEvent(event: PicoEvent): void {
  assertNonEmptyString(event.eventId, 'eventId');
  assertNonEmptyString(event.deviceId, 'deviceId');

  if (event.sessionId !== undefined) {
    assertNonEmptyString(event.sessionId, 'sessionId');
  }

  assertLamportValue(event.lamport);
  assertNonEmptyString(event.wallTime, 'wallTime');
  assertNonEmptyString(event.type, 'type');
  assertNonEmptyString(event.stream, 'stream');

  if (event.signature !== undefined) {
    assertNonEmptyString(event.signature, 'signature');
  }

  if (event.payloadPosture !== undefined && !payloadPostures.includes(event.payloadPosture)) {
    throw new Error('Event payloadPosture must be a known posture.');
  }
}

function assertNonEmptyString(value: string, label: string): void {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Event ${label} must be a non-empty string.`);
  }
}

function assertAsciiToken(value: string, label: string): void {
  if (typeof value !== 'string' || !isAsciiToken(value, 256)) {
    throw new Error(`Pico Home ${label} must be a non-empty ASCII token.`);
  }
}



function assertFingerprint(value: string, label: string): void {
  if (typeof value !== 'string' || !isHexOfBytes(value, 32)) {
    throw new Error(`Pico Home ${label} must be a lowercase BLAKE2b-256 hex fingerprint.`);
  }
}

function assertDetachedSignature(value: string, label: string): void {
  if (typeof value !== 'string' || !isHexOfBytes(value, 64)) {
    throw new Error(`Pico Home ${label} must be a lowercase Ed25519 signature hex value.`);
  }
}

function assertPicoHomeMembership(membership: PicoHomeMembership): void {
  assertAsciiToken(membership.membershipId, 'membershipId');
  assertAsciiToken(membership.homeId, 'membership.homeId');
  assertFingerprint(membership.picoIdentityFingerprintHex, 'membership.picoIdentityFingerprintHex');
  assertPicoHomeMembershipRole(membership.role);
  assertPicoHomeMembershipStatus(membership.status);
  assertPicoHomeMembershipScopes(membership.scopes);
  if (membership.source !== 'founding_record' && membership.source !== 'membership_credential') {
    throw new Error('Pico Home membership source is invalid.');
  }
  assertAsciiToken(membership.sourceRef, 'membership.sourceRef');
  assertNonEmptyString(membership.validFrom, 'membership.validFrom');
  if (membership.validUntil !== null) {
    assertNonEmptyString(membership.validUntil, 'membership.validUntil');
  }
  assertNonEmptyString(membership.createdAt, 'membership.createdAt');
  assertNonEmptyString(membership.updatedAt, 'membership.updatedAt');
}

function assertPicoHomeMembershipRole(role: PicoHomeMembershipRole): void {
  if (!picoHomeMembershipRoles.includes(role)) {
    throw new Error('Pico Home membership role is invalid.');
  }
}

function assertPicoHomeMembershipStatus(status: PicoHomeMembershipStatus): void {
  if (!picoHomeMembershipStatuses.includes(status)) {
    throw new Error('Pico Home membership status is invalid.');
  }
}

function assertPicoHomeMembershipScopes(scopes: readonly PicoHomeMembershipScope[]): void {
  if (scopes.length === 0) {
    throw new Error('Pico Home membership scopes must not be empty.');
  }

  const seen = new Set<PicoHomeMembershipScope>();
  for (const scope of scopes) {
    if (!picoHomeMembershipScopes.includes(scope)) {
      throw new Error('Pico Home membership scope is invalid.');
    }
    if (seen.has(scope)) {
      throw new Error('Pico Home membership scopes must be unique.');
    }
    seen.add(scope);
  }
}

function assertPicoHomeFoundingRecord(record: PicoHomeFoundingRecord, claim: PicoHomeClaimInput): void {
  if (record.schema !== picoHomeFoundingRecordSchema) {
    throw new Error('Pico Home founding record schema is invalid.');
  }

  if (record.hostClaimResponse.schema !== picoHomeClaimResponseRecordSchema) {
    throw new Error('Pico Home claim response record schema is invalid.');
  }

  const founding = record.founding;
  const claimResponse = record.hostClaimResponse.claimResponse;
  assertAsciiToken(founding.foundingId, 'foundingId');
  assertAsciiToken(founding.homeId, 'homeId');
  assertFingerprint(founding.hostSigningKeyFingerprintHex, 'founding.hostSigningKeyFingerprintHex');
  assertFingerprint(founding.hostKeyAgreementKeyFingerprintHex, 'founding.hostKeyAgreementKeyFingerprintHex');
  assertFingerprint(founding.homeHostPicoIdentityFingerprintHex, 'founding.homeHostPicoIdentityFingerprintHex');
  assertNonEmptyString(founding.foundedAt, 'foundedAt');
  assertPicoLifecycleOrder(
    founding.lifecycleOrder,
    'Pico Home founding.lifecycleOrder must be a fixed-width lifecycle order.',
  );
  assertAsciiToken(claimResponse.claimId, 'claimId');
  assertAsciiToken(claimResponse.homeId, 'claimResponse.homeId');
  assertAsciiToken(claimResponse.foundingRecordId, 'claimResponse.foundingRecordId');
  assertFingerprint(claimResponse.hostSigningKeyFingerprintHex, 'claimResponse.hostSigningKeyFingerprintHex');
  assertFingerprint(claimResponse.hostKeyAgreementKeyFingerprintHex, 'claimResponse.hostKeyAgreementKeyFingerprintHex');
  assertFingerprint(claimResponse.claimantIdentityKeyFingerprintHex, 'claimResponse.claimantIdentityKeyFingerprintHex');
  assertFingerprint(claimResponse.claimantNonceHex, 'claimResponse.claimantNonceHex');
  assertFingerprint(claimResponse.hostNonceHex, 'claimResponse.hostNonceHex');
  assertDetachedSignature(record.claimantFoundingSignatureHex, 'claimantFoundingSignatureHex');
  assertDetachedSignature(record.hostClaimResponse.hostSignatureHex, 'hostClaimResponseSignatureHex');
  assertDetachedSignature(record.hostFoundingSignatureHex, 'hostFoundingSignatureHex');
  assertNonEmptyString(record.createdAt, 'createdAt');

  assertAsciiToken(founding.firstDeviceDelegationId, 'founding.firstDeviceDelegationId');
  assertFingerprint(
    founding.firstDeviceSigningKeyFingerprintHex,
    'founding.firstDeviceSigningKeyFingerprintHex',
  );
  assertFingerprint(
    founding.firstDeviceKeyAgreementKeyFingerprintHex,
    'founding.firstDeviceKeyAgreementKeyFingerprintHex',
  );
  if (record.firstDeviceDelegation.record.delegationId
    !== founding.firstDeviceDelegationId
    || record.firstDeviceDelegation.record.issuerIdentityKeyFingerprintHex
      !== founding.homeHostPicoIdentityFingerprintHex
    || record.firstDeviceDelegation.record.subjectSigningKeyFingerprintHex
      !== founding.firstDeviceSigningKeyFingerprintHex
    || record.firstDeviceDelegation.record.subjectKeyAgreementKeyFingerprintHex
      !== founding.firstDeviceKeyAgreementKeyFingerprintHex) {
    throw new Error('Pico Home first-device evidence is not bound to the founding record.');
  }

  if (
    founding.homeId !== claim.homeId
    || claimResponse.homeId !== claim.homeId
    || founding.hostSigningKeyFingerprintHex !== claim.hostSigningKeyFingerprintHex
    || claimResponse.hostSigningKeyFingerprintHex !== claim.hostSigningKeyFingerprintHex
    || founding.hostKeyAgreementKeyFingerprintHex !== claim.hostKeyAgreementKeyFingerprintHex
    || claimResponse.hostKeyAgreementKeyFingerprintHex !== claim.hostKeyAgreementKeyFingerprintHex
    || claimResponse.foundingRecordId !== founding.foundingId
    || claimResponse.claimantIdentityKeyFingerprintHex !== founding.homeHostPicoIdentityFingerprintHex
    || claimResponse.claimantNonceHex !== founding.claimantNonceHex
    || claimResponse.hostNonceHex !== founding.hostNonceHex
    || claim.hostAdminPicoId !== `pico:identity:${founding.homeHostPicoIdentityFingerprintHex}`
  ) {
    throw new Error('Pico Home founding record is not bound to the claim state.');
  }
}

function picoHomeClaimInputFromFoundingRecord(record: PicoHomeFoundingRecord): PicoHomeClaimInput {
  return {
    homeId: record.founding.homeId,
    hostAdminPicoId: `pico:identity:${record.founding.homeHostPicoIdentityFingerprintHex}`,
    hostSigningKeyFingerprintHex: record.founding.hostSigningKeyFingerprintHex,
    hostKeyAgreementKeyFingerprintHex: record.founding.hostKeyAgreementKeyFingerprintHex,
    foundingRecord: record,
    claimedAt: record.founding.foundedAt,
  };
}

function picoHomeFoundingMembershipFromRecord(record: PicoHomeFoundingRecord): PicoHomeMembership {
  return {
    membershipId: `founding:${record.founding.foundingId}:home_host`,
    homeId: record.founding.homeId,
    picoIdentityFingerprintHex: record.founding.homeHostPicoIdentityFingerprintHex,
    role: 'home_host',
    status: 'active',
    scopes: [...picoHomeMembershipScopes],
    source: 'founding_record',
    sourceRef: record.founding.foundingId,
    validFrom: record.founding.foundedAt,
    validUntil: null,
    createdAt: record.createdAt,
    updatedAt: record.createdAt,
  };
}

function toPicoHomeMembershipRole(value: string): PicoHomeMembershipRole {
  if (!picoHomeMembershipRoles.includes(value as PicoHomeMembershipRole)) {
    throw new Error('Pico Home membership role is invalid.');
  }

  return value as PicoHomeMembershipRole;
}

function toPicoHomeMembershipStatus(value: string): PicoHomeMembershipStatus {
  if (!picoHomeMembershipStatuses.includes(value as PicoHomeMembershipStatus)) {
    throw new Error('Pico Home membership status is invalid.');
  }

  return value as PicoHomeMembershipStatus;
}

function toPicoHomeMembershipSource(value: string): PicoHomeMembershipSource {
  if (value !== 'founding_record' && value !== 'membership_credential') {
    throw new Error('Pico Home membership source is invalid.');
  }

  return value;
}

function parsePicoHomeMembershipScopes(scopesJson: string): PicoHomeMembershipScope[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(scopesJson) as unknown;
  } catch {
    throw new Error('Pico Home membership scopes are invalid.');
  }

  if (!Array.isArray(parsed) || !parsed.every((scope) => typeof scope === 'string')) {
    throw new Error('Pico Home membership scopes are invalid.');
  }

  const scopes = parsed as PicoHomeMembershipScope[];
  assertPicoHomeMembershipScopes(scopes);
  return scopes;
}

/** Scope sets carry no order, so compare them as sets and not as sequences. */
function sameScopeSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const known = new Set(left);
  return right.every((value) => known.has(value));
}

function assertLamportValue(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('Event lamport must be a non-negative safe integer.');
  }
}

function assertListLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new Error('EventStore list limit must be a positive safe integer.');
  }
}

function columnExists(db: Database.Database, tableName: string, columnName: string): boolean {
  return db
    .prepare(`PRAGMA table_info(${tableName})`)
    .all()
    .some((row) => (row as { name: string }).name === columnName);
}

function tableExists(db: Database.Database, tableName: string): boolean {
  return db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) !== undefined;
}

function verifyPicoHomeDeviceRecoverySubmission(
  sodium: PicoHomeDeviceLifecycleSodium,
  params: {
    submission: PicoHomeDeviceRecoverySubmission;
    sender: PicoHomeDeviceLifecycleSponsor;
    claimState: PicoHomeClaimState;
    view: PicoHomeDeviceLifecycleView;
    acceptedAt: string;
  },
):
  | { ok: true; claimDigestHex: string }
  | {
    ok: false;
    reason:
      | 'invalid_recovery'
      | 'active_delegation_not_covered';
  } {
  try {
    const { submission, sender, claimState, view, acceptedAt } = params;
    const { claim, evidence } = submission;
    if (
      submission.schema !== picoHomeDeviceRecoverySubmissionSchema
      || claimState.state !== 'claimed'
      || claimState.homeId === null
      || claimState.hostSigningKeyFingerprintHex === null
      || claimState.hostKeyAgreementKeyFingerprintHex === null
      || claim.homeId !== claimState.homeId
      || claim.hostSigningKeyFingerprintHex
        !== claimState.hostSigningKeyFingerprintHex
      || claim.hostKeyAgreementKeyFingerprintHex
        !== claimState.hostKeyAgreementKeyFingerprintHex
      || claim.picoIdentityFingerprintHex
        !== sender.picoIdentityFingerprintHex
      || claim.targetDelegationId !== sender.delegationId
      || claim.targetDeviceSigningKeyFingerprintHex
        !== sender.deviceSigningKeyFingerprintHex
      || claim.targetDeviceKeyAgreementKeyFingerprintHex
        !== sender.deviceKeyAgreementKeyFingerprintHex
      || claim.observedLifecycleOrder !== view.observedLifecycleOrder
      || evidence.identityKeyRecord.suite !== picoIdentitySuite
      || evidence.identityKeyRecord.keyRole !== 'pico_identity'
      || evidence.targetDeviceSigningKeyRecord.suite !== picoIdentitySuite
      || evidence.targetDeviceSigningKeyRecord.keyRole !== 'device_signing'
      || evidence.targetDeviceKeyAgreementKeyRecord.suite !== picoIdentitySuite
      || evidence.targetDeviceKeyAgreementKeyRecord.keyRole
        !== 'device_key_agreement'
      || evidence.delegation.record.issuerIdentityKeyFingerprintHex
        !== claim.picoIdentityFingerprintHex
      || evidence.delegation.record.delegationId
        !== claim.targetDelegationId
      || evidence.delegation.record.subjectSigningKeyFingerprintHex
        !== claim.targetDeviceSigningKeyFingerprintHex
      || evidence.delegation.record.subjectKeyAgreementKeyFingerprintHex
        !== claim.targetDeviceKeyAgreementKeyFingerprintHex
      || !evidence.delegation.record.scopes.includes('surface_session')
      || claim.evidenceDigestHex
        !== picoHomeDeviceRecoveryEvidenceDigestHex(sodium, evidence)
      || !verifyPicoIdentityKeyRecordFingerprint(sodium, {
        keyRecord: evidence.identityKeyRecord,
        expectedFingerprintHex: claim.picoIdentityFingerprintHex,
      })
      || !verifyPicoIdentityKeyRecordFingerprint(sodium, {
        keyRecord: evidence.targetDeviceSigningKeyRecord,
        expectedFingerprintHex: claim.targetDeviceSigningKeyFingerprintHex,
      })
      || !verifyPicoIdentityKeyRecordFingerprint(sodium, {
        keyRecord: evidence.targetDeviceKeyAgreementKeyRecord,
        expectedFingerprintHex: claim.targetDeviceKeyAgreementKeyFingerprintHex,
      })
    ) {
      return { ok: false, reason: 'invalid_recovery' };
    }

    const createdAtMs = Date.parse(claim.createdAt);
    const expiresAtMs = Date.parse(claim.expiresAt);
    const acceptedAtMs = Date.parse(acceptedAt);
    if (
      !Number.isFinite(createdAtMs)
      || !Number.isFinite(expiresAtMs)
      || !Number.isFinite(acceptedAtMs)
      || acceptedAtMs < createdAtMs
      || acceptedAtMs >= expiresAtMs
      || expiresAtMs - createdAtMs
        > picoHomeDeviceRecoveryTiming.signedRequestLifetimeMs
      || Date.parse(evidence.delegation.record.validFrom) > acceptedAtMs
      || Date.parse(evidence.delegation.record.validUntil)
        <= acceptedAtMs
          + PICO_HOME_DEVICE_RECOVERY_DELAY_MS
          + PICO_HOME_DEVICE_RECOVERY_COMPLETION_WINDOW_MS
    ) {
      return { ok: false, reason: 'invalid_recovery' };
    }

    const claimInput = buildPicoHomeDeviceRecoveryClaimSignatureInput(claim);
    if (
      !verifyPicoIdentityDetachedSignature(sodium, {
        publicKeyHex: evidence.identityKeyRecord.publicKeyHex,
        signatureInput: claimInput,
        signatureHex: submission.rootSignatureHex,
      })
      || !verifyPicoIdentityDetachedSignature(sodium, {
        publicKeyHex: evidence.targetDeviceSigningKeyRecord.publicKeyHex,
        signatureInput: claimInput,
        signatureHex: submission.targetSignatureHex,
      })
    ) {
      return { ok: false, reason: 'invalid_recovery' };
    }

    createVerifiedPicoIdentityLifecycleIndex(sodium, {
      issuerIdentityKeyRecord: evidence.identityKeyRecord,
      signedDelegations: [evidence.delegation],
      signedRevocations: evidence.revocations,
    });

    const evidenceOrders = [
      evidence.delegation.record.lifecycleOrder,
      ...evidence.revocations.map((entry) => entry.record.lifecycleOrder),
    ];
    if (
      evidenceOrders.some((order) => order <= claim.observedLifecycleOrder)
      || evidenceOrders.some((order, index) =>
        index > 0 && order <= evidenceOrders[index - 1])
      || new Set(evidenceOrders).size !== evidenceOrders.length
      || evidence.revocations.some((entry) =>
        entry.record.issuerIdentityKeyFingerprintHex
          !== claim.picoIdentityFingerprintHex
        || entry.record.subjectKind !== 'delegation')
    ) {
      return { ok: false, reason: 'invalid_recovery' };
    }

    const activeDelegations = view.devices
      .filter((device) => device.status === 'active')
      .map((device) => device.delegationId)
      .sort();
    const revokedDelegations = evidence.revocations
      .map((entry) => entry.record.subjectRef)
      .sort();
    if (
      activeDelegations.length !== revokedDelegations.length
      || activeDelegations.some((id, index) => id !== revokedDelegations[index])
    ) {
      return { ok: false, reason: 'active_delegation_not_covered' };
    }

    return {
      ok: true,
      claimDigestHex: picoHomeDeviceRecoveryClaimDigestHex(sodium, claim),
    };
  } catch {
    return { ok: false, reason: 'invalid_recovery' };
  }
}

/**
 * Authenticates the standing pre-authority request before membership or
 * lifecycle state is consulted. The full verifier below still rechecks these
 * bindings and all evidence/coverage rules; this first pass exists so an
 * unauthenticated caller cannot distinguish inactive, stale or current
 * identities by their outcome.
 */
function verifyPicoHomeDeviceRecoveryPreAuthority(
  sodium: PicoHomeDeviceLifecycleSodium,
  params: {
    submission: PicoHomeDeviceRecoverySubmission;
    sender: PicoHomeDeviceLifecycleSponsor;
    claimState: PicoHomeClaimState;
    acceptedAt: string;
  },
): boolean {
  try {
    const { submission, sender, claimState, acceptedAt } = params;
    const { claim, evidence } = submission;
    const createdAtMs = Date.parse(claim.createdAt);
    const expiresAtMs = Date.parse(claim.expiresAt);
    const acceptedAtMs = Date.parse(acceptedAt);
    if (
      submission.schema !== picoHomeDeviceRecoverySubmissionSchema
      || claimState.state !== 'claimed'
      || claimState.homeId === null
      || claimState.hostSigningKeyFingerprintHex === null
      || claimState.hostKeyAgreementKeyFingerprintHex === null
      || claim.homeId !== claimState.homeId
      || claim.hostSigningKeyFingerprintHex
        !== claimState.hostSigningKeyFingerprintHex
      || claim.hostKeyAgreementKeyFingerprintHex
        !== claimState.hostKeyAgreementKeyFingerprintHex
      || claim.picoIdentityFingerprintHex
        !== sender.picoIdentityFingerprintHex
      || claim.targetDelegationId !== sender.delegationId
      || claim.targetDeviceSigningKeyFingerprintHex
        !== sender.deviceSigningKeyFingerprintHex
      || claim.targetDeviceKeyAgreementKeyFingerprintHex
        !== sender.deviceKeyAgreementKeyFingerprintHex
      || evidence.identityKeyRecord.suite !== picoIdentitySuite
      || evidence.identityKeyRecord.keyRole !== 'pico_identity'
      || evidence.targetDeviceSigningKeyRecord.suite !== picoIdentitySuite
      || evidence.targetDeviceSigningKeyRecord.keyRole !== 'device_signing'
      || !verifyPicoIdentityKeyRecordFingerprint(sodium, {
        keyRecord: evidence.identityKeyRecord,
        expectedFingerprintHex: claim.picoIdentityFingerprintHex,
      })
      || !verifyPicoIdentityKeyRecordFingerprint(sodium, {
        keyRecord: evidence.targetDeviceSigningKeyRecord,
        expectedFingerprintHex:
          claim.targetDeviceSigningKeyFingerprintHex,
      })
      || !Number.isFinite(createdAtMs)
      || !Number.isFinite(expiresAtMs)
      || !Number.isFinite(acceptedAtMs)
      || acceptedAtMs < createdAtMs
      || acceptedAtMs >= expiresAtMs
      || expiresAtMs - createdAtMs
        > picoHomeDeviceRecoveryTiming.signedRequestLifetimeMs
    ) {
      return false;
    }
    const signatureInput =
      buildPicoHomeDeviceRecoveryClaimSignatureInput(claim);
    return verifyPicoIdentityDetachedSignature(sodium, {
      publicKeyHex: evidence.identityKeyRecord.publicKeyHex,
      signatureInput,
      signatureHex: submission.rootSignatureHex,
    }) && verifyPicoIdentityDetachedSignature(sodium, {
      publicKeyHex: evidence.targetDeviceSigningKeyRecord.publicKeyHex,
      signatureInput,
      signatureHex: submission.targetSignatureHex,
    });
  } catch {
    return false;
  }
}

function freshestRecoveryEvidenceOrder(
  submission: PicoHomeDeviceRecoverySubmission,
): string {
  return [
    submission.evidence.delegation.record.lifecycleOrder,
    ...submission.evidence.revocations.map(
      (entry) => entry.record.lifecycleOrder,
    ),
  ].sort().at(-1) ?? submission.claim.observedLifecycleOrder;
}

function verifyStoredPicoHomeDeviceRecoveryRecord(
  sodium: PicoHomeDeviceLifecycleSodium,
  claimState: PicoHomeClaimState,
  row: PicoHomeDeviceRecoveryRow,
  record: PicoHomeDeviceRecoveryRecord,
): boolean {
  try {
    if (
      row.status !== 'consumed'
      || row.resolvedAt === null
      || claimState.state !== 'claimed'
      || claimState.homeId === null
      || claimState.hostSigningKeyFingerprintHex === null
      || claimState.hostKeyAgreementKeyFingerprintHex === null
      || record.schema !== picoHomeDeviceRecoveryRecordSchema
      || !hasExactRecordKeys(
        record as unknown as Record<string, unknown>,
        [
          'schema',
          'submission',
          'receipt',
          'hostSigningKeyRecord',
          'hostSignatureHex',
        ],
      )
    ) {
      return false;
    }
    const { submission, receipt } = record;
    const { claim, evidence } = submission;
    if (
      submission.schema !== picoHomeDeviceRecoverySubmissionSchema
      || claim.homeId !== claimState.homeId
      || claim.hostSigningKeyFingerprintHex
        !== claimState.hostSigningKeyFingerprintHex
      || claim.hostKeyAgreementKeyFingerprintHex
        !== claimState.hostKeyAgreementKeyFingerprintHex
      || claim.recoveryId !== row.recoveryId
      || claim.homeId !== row.homeId
      || claim.picoIdentityFingerprintHex
        !== row.picoIdentityFingerprintHex
      || claim.targetDelegationId !== row.targetDelegationId
      || claim.targetDeviceSigningKeyFingerprintHex
        !== row.targetDeviceSigningKeyFingerprintHex
      || claim.targetDeviceKeyAgreementKeyFingerprintHex
        !== row.targetDeviceKeyAgreementKeyFingerprintHex
      || claim.observedLifecycleOrder !== row.observedLifecycleOrder
      || claim.evidenceDigestHex !== row.evidenceDigestHex
      || picoHomeDeviceRecoveryEvidenceDigestHex(sodium, evidence)
        !== row.evidenceDigestHex
      || picoHomeDeviceRecoveryClaimDigestHex(sodium, claim)
        !== row.claimDigestHex
      || evidence.identityKeyRecord.suite !== picoIdentitySuite
      || evidence.identityKeyRecord.keyRole !== 'pico_identity'
      || evidence.targetDeviceSigningKeyRecord.suite !== picoIdentitySuite
      || evidence.targetDeviceSigningKeyRecord.keyRole !== 'device_signing'
      || evidence.targetDeviceKeyAgreementKeyRecord.suite !== picoIdentitySuite
      || evidence.targetDeviceKeyAgreementKeyRecord.keyRole
        !== 'device_key_agreement'
      || !verifyPicoIdentityKeyRecordFingerprint(sodium, {
        keyRecord: evidence.identityKeyRecord,
        expectedFingerprintHex: row.picoIdentityFingerprintHex,
      })
      || !verifyPicoIdentityKeyRecordFingerprint(sodium, {
        keyRecord: evidence.targetDeviceSigningKeyRecord,
        expectedFingerprintHex:
          row.targetDeviceSigningKeyFingerprintHex,
      })
      || !verifyPicoIdentityKeyRecordFingerprint(sodium, {
        keyRecord: evidence.targetDeviceKeyAgreementKeyRecord,
        expectedFingerprintHex:
          row.targetDeviceKeyAgreementKeyFingerprintHex,
      })
    ) {
      return false;
    }

    const claimInput =
      buildPicoHomeDeviceRecoveryClaimSignatureInput(claim);
    if (
      !verifyPicoIdentityDetachedSignature(sodium, {
        publicKeyHex: evidence.identityKeyRecord.publicKeyHex,
        signatureInput: claimInput,
        signatureHex: submission.rootSignatureHex,
      })
      || !verifyPicoIdentityDetachedSignature(sodium, {
        publicKeyHex: evidence.targetDeviceSigningKeyRecord.publicKeyHex,
        signatureInput: claimInput,
        signatureHex: submission.targetSignatureHex,
      })
    ) {
      return false;
    }
    createVerifiedPicoIdentityLifecycleIndex(sodium, {
      issuerIdentityKeyRecord: evidence.identityKeyRecord,
      signedDelegations: [evidence.delegation],
      signedRevocations: evidence.revocations,
    });
    const evidenceOrders = [
      evidence.delegation.record.lifecycleOrder,
      ...evidence.revocations.map(
        (entry) => entry.record.lifecycleOrder,
      ),
    ];
    if (
      evidence.delegation.record.issuerIdentityKeyFingerprintHex
        !== row.picoIdentityFingerprintHex
      || evidence.delegation.record.delegationId
        !== row.targetDelegationId
      || evidence.delegation.record.subjectSigningKeyFingerprintHex
        !== row.targetDeviceSigningKeyFingerprintHex
      || evidence.delegation.record.subjectKeyAgreementKeyFingerprintHex
        !== row.targetDeviceKeyAgreementKeyFingerprintHex
      || evidence.revocations.some(
        (entry) =>
          entry.record.issuerIdentityKeyFingerprintHex
            !== row.picoIdentityFingerprintHex
          || entry.record.subjectKind !== 'delegation'
          || entry.record.subjectRef === row.targetDelegationId,
      )
      || new Set(
        evidence.revocations.map((entry) => entry.record.subjectRef),
      ).size !== evidence.revocations.length
      || evidenceOrders.some(
        (order) =>
          comparePicoIdentityLifecycleOrder(
            order,
            row.observedLifecycleOrder,
          ) <= 0,
      )
      || evidenceOrders.some(
        (order, index) =>
          index > 0
          && comparePicoIdentityLifecycleOrder(
            order,
            evidenceOrders[index - 1]!,
          ) <= 0,
      )
    ) {
      return false;
    }

    const expectedReceipt: PicoHomeDeviceRecoveryReceiptSignatureInput = {
      suite: picoIdentitySuite,
      recoveryId: row.recoveryId,
      homeId: row.homeId,
      hostSigningKeyFingerprintHex:
        claimState.hostSigningKeyFingerprintHex,
      picoIdentityFingerprintHex: row.picoIdentityFingerprintHex,
      targetDelegationId: row.targetDelegationId,
      targetDeviceSigningKeyFingerprintHex:
        row.targetDeviceSigningKeyFingerprintHex,
      targetDeviceKeyAgreementKeyFingerprintHex:
        row.targetDeviceKeyAgreementKeyFingerprintHex,
      evidenceDigestHex: row.evidenceDigestHex,
      claimDigestHex: row.claimDigestHex,
      acceptedLifecycleOrder: row.observedLifecycleOrder,
      resultingLifecycleOrder:
        freshestRecoveryEvidenceOrder(submission),
      pendingAcceptedAt: row.acceptedAt,
      effectiveAt: row.effectiveAt,
      completionExpiresAt: row.completionExpiresAt,
      completedAt: row.resolvedAt,
      leavesExactlyOneActiveDevice: true,
    };
    if (
      serializePayload(receipt) !== serializePayload(expectedReceipt)
      || record.hostSigningKeyRecord.suite !== picoIdentitySuite
      || record.hostSigningKeyRecord.keyRole !== 'home_host_signing'
      || !verifyPicoIdentityKeyRecordFingerprint(sodium, {
        keyRecord: record.hostSigningKeyRecord,
        expectedFingerprintHex:
          claimState.hostSigningKeyFingerprintHex,
      })
      || !verifyPicoIdentityDetachedSignature(sodium, {
        publicKeyHex: record.hostSigningKeyRecord.publicKeyHex,
        signatureInput:
          buildPicoHomeDeviceRecoveryReceiptSignatureInput(receipt),
        signatureHex: record.hostSignatureHex,
      })
    ) {
      return false;
    }

    const acceptedAtMs = Date.parse(row.acceptedAt);
    return Date.parse(claim.createdAt) <= acceptedAtMs
      && acceptedAtMs < Date.parse(claim.expiresAt)
      && Date.parse(claim.expiresAt) - Date.parse(claim.createdAt)
        <= picoHomeDeviceRecoveryTiming.signedRequestLifetimeMs
      && Date.parse(evidence.delegation.record.validFrom) <= acceptedAtMs
      && Date.parse(evidence.delegation.record.validUntil)
        > Date.parse(row.completionExpiresAt);
  } catch {
    return false;
  }
}

function verifyStoredPicoHomeDeviceLifecycleRecord(
  sodium: PicoHomeDeviceLifecycleSodium,
  claim: PicoHomeClaimState,
  row: PicoHomeDeviceLifecycleTransitionRow,
  record: PicoHomeDeviceLifecycleRecord,
): boolean {
  if (
    claim.state !== 'claimed'
    || claim.homeId === null
    || claim.hostSigningKeyFingerprintHex === null
    || record.schema !== picoHomeDeviceLifecycleRecordSchema
    || !hasExactRecordKeys(record as unknown as Record<string, unknown>, [
      'schema',
      'submission',
      'receipt',
      'hostSigningKeyRecord',
      'hostSignatureHex',
    ])
  ) {
    return false;
  }

  const evidence = record.submission.evidence;
  const receipt = record.receipt;
  const submissionDigestHex = picoHomeDeviceLifecycleSubmissionDigestHex(
    sodium,
    record.submission,
  );
  if (
    row.transitionId !== evidence.transitionId
    || row.action !== evidence.action
    || row.homeId !== claim.homeId
    || row.homeId !== receipt.homeId
    || row.picoIdentityFingerprintHex !== evidence.picoIdentityFingerprintHex
    || row.picoIdentityFingerprintHex !== receipt.picoIdentityFingerprintHex
    || row.sponsorDelegationId !== receipt.sponsorDelegationId
    || row.targetDelegationId !== evidence.targetDelegationId
    || row.targetDelegationId !== receipt.targetDelegationId
    || row.submissionDigestHex !== submissionDigestHex
    || receipt.transitionDigestHex !== submissionDigestHex
    || row.acceptedAt !== receipt.acceptedAt
    || receipt.transitionId !== evidence.transitionId
    || receipt.action !== evidence.action
    || receipt.hostSigningKeyFingerprintHex !== claim.hostSigningKeyFingerprintHex
    || receipt.targetDeviceSigningKeyFingerprintHex
      !== evidence.targetDeviceSigningKeyFingerprintHex
    || receipt.targetDeviceKeyAgreementKeyFingerprintHex
      !== evidence.targetDeviceKeyAgreementKeyFingerprintHex
    || record.hostSigningKeyRecord.suite !== picoIdentitySuite
    || record.hostSigningKeyRecord.keyRole !== 'home_host_signing'
    || !verifyPicoIdentityKeyRecordFingerprint(sodium, {
      keyRecord: record.hostSigningKeyRecord,
      expectedFingerprintHex: claim.hostSigningKeyFingerprintHex,
    })
    || !verifyPicoIdentityDetachedSignature(sodium, {
      publicKeyHex: record.hostSigningKeyRecord.publicKeyHex,
      signatureInput: buildPicoHomeDeviceLifecycleReceiptSignatureInput(receipt),
      signatureHex: record.hostSignatureHex,
    })
    || evidence.identityKeyRecord.suite !== picoIdentitySuite
    || evidence.identityKeyRecord.keyRole !== 'pico_identity'
    || !verifyPicoIdentityKeyRecordFingerprint(sodium, {
      keyRecord: evidence.identityKeyRecord,
      expectedFingerprintHex: evidence.picoIdentityFingerprintHex,
    })
  ) {
    return false;
  }

  createVerifiedPicoIdentityLifecycleIndex(sodium, {
    issuerIdentityKeyRecord: evidence.identityKeyRecord,
    signedDelegations: evidence.delegation === null ? [] : [evidence.delegation],
    signedRevocations: evidence.revocations,
  });

  if (evidence.action === 'revoke') {
    return record.submission.activation === null;
  }
  const activation = record.submission.activation;
  const signingKey = evidence.targetDeviceSigningKeyRecord;
  const agreementKey = evidence.targetDeviceKeyAgreementKeyRecord;
  if (activation === null || signingKey === null || agreementKey === null) {
    return false;
  }
  const input = activation.input;
  const createdAt = Date.parse(input.createdAt);
  const expiresAt = Date.parse(input.expiresAt);
  const acceptedAt = Date.parse(receipt.acceptedAt);
  return input.homeId === row.homeId
    && input.hostSigningKeyFingerprintHex === claim.hostSigningKeyFingerprintHex
    && input.picoIdentityFingerprintHex === row.picoIdentityFingerprintHex
    && input.sponsorDelegationId === receipt.sponsorDelegationId
    && input.sponsorDeviceSigningKeyFingerprintHex
      === receipt.sponsorDeviceSigningKeyFingerprintHex
    && input.sponsorDeviceKeyAgreementKeyFingerprintHex
      === receipt.sponsorDeviceKeyAgreementKeyFingerprintHex
    && input.lifecycleEvidenceDigestHex
      === picoHomeDeviceLifecycleEvidenceDigestHex(sodium, evidence)
    && Number.isFinite(acceptedAt)
    && acceptedAt >= createdAt
    && acceptedAt < expiresAt
    && expiresAt - createdAt <= 5 * 60 * 1_000
    && verifyPicoIdentityKeyRecordFingerprint(sodium, {
      keyRecord: signingKey,
      expectedFingerprintHex: evidence.targetDeviceSigningKeyFingerprintHex,
    })
    && verifyPicoIdentityKeyRecordFingerprint(sodium, {
      keyRecord: agreementKey,
      expectedFingerprintHex: evidence.targetDeviceKeyAgreementKeyFingerprintHex,
    })
    && verifyPicoIdentityDetachedSignature(sodium, {
      publicKeyHex: signingKey.publicKeyHex,
      signatureInput: buildPicoHomeDeviceActivationSignatureInput(input),
      signatureHex: activation.targetSignatureHex,
    });
}

function hasExactRecordKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const expected = new Set(keys);
  return Object.keys(record).length === expected.size
    && Object.keys(record).every((key) => expected.has(key));
}

// Storage comparison helper only. This is not Pico protocol canonicalization
// and must not be used as a cryptographic signature or hash input. Future
// security-relevant canonicalization is governed by ADR 0034 and must define
// explicit test vectors.
function serializePayload(payload: unknown): string {
  const serialized = JSON.stringify(payload);

  if (serialized === undefined) {
    throw new Error('Event payload must be JSON serializable.');
  }

  return stringifyStableJson(JSON.parse(serialized) as JsonValue);
}

function serializeStoredPayload(payloadJson: string): string {
  return stringifyStableJson(JSON.parse(payloadJson) as JsonValue);
}

function stringifyStableJson(value: JsonValue): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stringifyStableJson(item)).join(',')}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stringifyStableJson(value[key])}`)
    .join(',')}}`;
}

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
