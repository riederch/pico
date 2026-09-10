import { assertExactKeys } from '@pico/protocol/canonical-bytes';
import type Database from 'better-sqlite3';
import {
  isPicoInstant,
  buildPicoReaderCustodyDomainSignatureInput,
  buildPicoReaderCustodyItemSignatureInput,
  buildPicoReaderCustodyKekRotationSignatureInput,
  buildPicoReaderCustodyReaderGrantLifecycleSignatureInput,
  buildPicoReaderCustodyReaderGrantSignatureInput,
  buildPicoReaderCustodyWriterGrantLifecycleSignatureInput,
  buildPicoReaderCustodyWriterGrantSignatureInput,
  buildPicoShareEnvelopeSignatureInput,
  picoIdentitySuite,
  type PicoReaderCustodyReaderAccessMode,
  picoMemoryContentSuite,
  picoReaderCustodyDomainRecordSchema,
  picoReaderCustodyItemRecordSchema,
  picoReaderCustodyKekRotationRecordSchema,
  picoReaderCustodyReaderGrantLifecycleRecordSchema,
  picoReaderCustodyReaderGrantRecordSchema,
  picoReaderCustodyWriterGrantLifecycleRecordSchema,
  picoReaderCustodyWriterGrantRecordSchema,
  picoShareEnvelopeRecordSchema,
  picoShareSuite,
} from '@pico/protocol';
import type {
  PicoEventOriginClass,
  PicoHomeFoundingRecord,
  PicoReaderCustodyDomainRecord,
  PicoReaderCustodyItemRecord,
  PicoReaderCustodyKekRotationRecord,
  PicoReaderCustodyReaderGrantLifecycleRecord,
  PicoReaderCustodyReaderGrantRecord,
  PicoReaderCustodyWriterGrantLifecycleRecord,
  PicoReaderCustodyWriterGrantRecord,
} from '@pico/protocol';
import {
  verifyPicoIdentityDetachedSignature,
  verifyPicoIdentityKeyRecordFingerprint,
} from '@pico/identity';
import type { IdentityVerificationSodium } from '@pico/identity';
import type {
  PicoIdentityReaderKeySelectionResult,
} from './reader-key.js';

export interface ReaderCustodyAuthoritySource {
  foundingRecord(): PicoHomeFoundingRecord | undefined;
  /** ADR 0115: the chain head; new reader-custody domains bind to it. */
  currentHostSigningKeyFingerprintHex?(): string | undefined;
  hasActiveMembership(
    picoIdentityFingerprintHex: string,
    homeId: string,
    at: string,
  ): boolean;
  selectReaderKey?(input: {
    homeId: string;
    picoIdentityFingerprintHex: string;
    delegationId: string;
    deviceKeyAgreementKeyFingerprintHex: string;
    at: string;
  }): Promise<PicoIdentityReaderKeySelectionResult>;
}

export interface PicoReaderCustodyDomainView {
  domainAuthorityId: string;
  homeId: string;
  /**
   * Der Host-Schlüssel, unter dem diese Domäne autorisiert wurde - **nicht**
   * der, den das Home heute führt.
   *
   * Er steht hier, seit ein Gerät einen Lesezugang widerrufen können soll: die
   * Widerrufsaussage trägt ihn, und wer ihn aus dem Profil nähme, träfe nach
   * einer Host-Schlüssel-Rotation (ADR 0115) den falschen. Ein öffentlicher
   * Fingerabdruck, den das Gerät ohnehin kennt.
   */
  hostSigningKeyFingerprintHex: string;
  domainId: string;
  ownerIdentityKeyFingerprintHex: string;
  ownerReaderKeyFingerprintHex: string;
  kekVersion: number;
  authorizedAt: string;
  lifecycleOrder: string;
  receivedAt: string;
}

export interface PicoReaderCustodyWriterGrantView {
  writerGrantId: string;
  domainAuthorityId: string;
  domainId: string;
  writerIdentityKeyFingerprintHex: string;
  writerDeviceSigningKeyFingerprintHex: string;
  status: 'active' | 'not_yet_valid' | 'expired' | 'revoked' | 'superseded';
  validFrom: string;
  validUntil: string;
  lifecycleOrder: string;
  receivedAt: string;
}

export interface PicoReaderCustodyReaderGrantView {
  readerGrantId: string;
  domainAuthorityId: string;
  domainId: string;
  readerIdentityKeyFingerprintHex: string;
  readerDeviceSigningKeyFingerprintHex: string;
  readerKeyFingerprintHex: string;
  readerDelegationId: string;
  accessMode: PicoReaderCustodyReaderAccessMode;
  firstKekVersion: number;
  envelopeKekVersions: number[];
  status: 'active' | 'not_yet_valid' | 'expired' | 'revoked';
  validFrom: string;
  validUntil: string;
  lifecycleOrder: string;
  receivedAt: string;
}

export interface PicoReaderCustodyKekRotationView {
  rotationId: string;
  domainAuthorityId: string;
  domainId: string;
  previousKekVersion: number;
  kekVersion: number;
  causeLifecycleIds: string[];
  remainingReaderGrantIds: string[];
  envelopeReaderKeyFingerprintHexes: string[];
  rotatedAt: string;
  lifecycleOrder: string;
  receivedAt: string;
}

export interface PicoReaderCustodyItemView {
  packageId: string;
  domainAuthorityId: string;
  writerGrantId: string;
  domainId: string;
  memoryItemId: string;
  contentType: string;
  kekVersion: number;
  writerIdentityKeyFingerprintHex: string;
  writerDeviceSigningKeyFingerprintHex: string;
  contentCiphertextHex: string;
  wrappedDekHex: string;
  /** ADR 0116 W2: provenance for a context assembler, beside the identity. */
  originClass: PicoEventOriginClass;
  createdAt: string;
  receivedAt: string;
}

export type ReaderCustodyFailureReason =
  | 'no_founding_record'
  | 'wrong_home'
  | 'owner_is_not_active_member'
  | 'writer_is_not_active_member'
  | 'reader_is_not_active_member'
  | 'reader_key_is_not_current'
  | 'freshness_unavailable'
  | 'freshness_stale'
  | 'reader_key_revoked'
  | 'unknown_domain'
  | 'unknown_reader_grant'
  | 'unknown_writer_grant'
  | 'inactive_writer_grant'
  | 'rotation_required'
  | 'invalid_rotation'
  | 'invalid_record'
  | 'conflicting_record'
  | 'domain_custody_conflict';

export type ReaderCustodyRecordResult<T> =
  | { ok: true; inserted: boolean; value: T }
  | {
    ok: false;
    reason: ReaderCustodyFailureReason;
  };

export interface ReaderCustodyReconciliation {
  droppedDomains: number;
  droppedReaderGrants: number;
  droppedReaderLifecycleRecords: number;
  droppedWriterGrants: number;
  droppedWriterLifecycleRecords: number;
  droppedRotations: number;
  droppedItems: number;
}

/**
 * Opaque reader-custody persistence (ADR 0086). This store never accepts a
 * plaintext field or raw KEK/DEK. Domain and writer authority are owner-root
 * signatures; item integrity is a signature by the exact owner-authorized
 * device-signing key.
 */
export class ReaderCustodyStore {
  public constructor(
    private readonly db: Database.Database,
    private readonly sodium: IdentityVerificationSodium,
    private readonly authority: ReaderCustodyAuthoritySource,
  ) {}

  public recordDomain(
    record: PicoReaderCustodyDomainRecord,
    at: string = new Date().toISOString(),
  ): ReaderCustodyRecordResult<PicoReaderCustodyDomainView> {
    const verification = this.verifyDomain(record, at, true);
    if (verification !== undefined) {
      return { ok: false, reason: verification };
    }

    const existingById = this.domainRecord(record.domain.domainAuthorityId);
    if (existingById !== undefined) {
      return sameJson(existingById, record)
        ? { ok: true, inserted: false, value: domainView(existingById) }
        : { ok: false, reason: 'conflicting_record' };
    }

    const existingByDomain = this.db
      .prepare(`
        SELECT domain_authority_id AS domainAuthorityId
        FROM pico_reader_custody_domain
        WHERE home_id = ? AND privacy_domain = ?
      `)
      .get(record.domain.homeId, record.domain.domainId) as
        | { domainAuthorityId: string }
        | undefined;
    if (existingByDomain !== undefined) {
      return { ok: false, reason: 'conflicting_record' };
    }

    const custody = this.db
      .prepare(`
        SELECT custody_class AS custodyClass
        FROM memory_domain_custody
        WHERE privacy_domain = ?
      `)
      .get(record.domain.domainId) as { custodyClass: string } | undefined;
    if (custody !== undefined && custody.custodyClass !== 'reader_custody') {
      return { ok: false, reason: 'domain_custody_conflict' };
    }

    const insert = this.db.transaction(() => {
      this.db
        .prepare(`
          INSERT OR IGNORE INTO memory_domain_custody (
            privacy_domain, custody_class, created_at, updated_at
          ) VALUES (?, 'reader_custody', ?, ?)
        `)
        .run(record.domain.domainId, record.receivedAt, record.receivedAt);
      this.db
        .prepare(`
          INSERT INTO pico_reader_custody_domain (
            domain_authority_id,
            home_id,
            host_signing_key_fingerprint_hex,
            privacy_domain,
            owner_identity_key_fingerprint_hex,
            owner_reader_key_fingerprint_hex,
            kek_version,
            authorized_at,
            lifecycle_order,
            domain_record_json,
            received_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          record.domain.domainAuthorityId,
          record.domain.homeId,
          record.domain.hostSigningKeyFingerprintHex,
          record.domain.domainId,
          record.domain.ownerIdentityKeyFingerprintHex,
          record.domain.ownerReaderKeyFingerprintHex,
          record.domain.kekVersion,
          record.domain.authorizedAt,
          record.domain.lifecycleOrder,
          JSON.stringify(record),
          record.receivedAt,
        );
    });
    insert();

    return { ok: true, inserted: true, value: domainView(record) };
  }

  public async recordReaderGrant(
    record: PicoReaderCustodyReaderGrantRecord,
    at: string = new Date().toISOString(),
  ): Promise<ReaderCustodyRecordResult<PicoReaderCustodyReaderGrantView>> {
    const domain = this.domainRecord(record.grant.domainAuthorityId);
    if (domain === undefined) {
      return { ok: false, reason: 'unknown_domain' };
    }
    const domainVerification = this.verifyDomain(domain, at, true);
    if (domainVerification !== undefined) {
      return { ok: false, reason: domainVerification };
    }
    const currentKekVersion = this.currentKekVersion(
      domain.domain.domainAuthorityId,
    );
    if (!this.verifyReaderGrant(domain, record, currentKekVersion)) {
      return { ok: false, reason: 'invalid_record' };
    }
    if (!this.authority.hasActiveMembership(
      record.grant.readerIdentityKeyFingerprintHex,
      record.grant.homeId,
      at,
    )) {
      return { ok: false, reason: 'reader_is_not_active_member' };
    }
    if (this.authority.selectReaderKey === undefined) {
      return { ok: false, reason: 'reader_key_is_not_current' };
    }
    const selected = await this.authority.selectReaderKey({
      homeId: record.grant.homeId,
      picoIdentityFingerprintHex:
        record.grant.readerIdentityKeyFingerprintHex,
      delegationId: record.grant.readerDelegationId,
      deviceKeyAgreementKeyFingerprintHex:
        record.grant.readerKeyFingerprintHex,
      at,
    });
    if (!selected.ok) {
      if (selected.reason === 'freshness_unavailable') {
        return { ok: false, reason: 'freshness_unavailable' };
      }
      if (selected.reason === 'freshness_stale') {
        return { ok: false, reason: 'freshness_stale' };
      }
      if (selected.reason === 'reader_key_revoked') {
        return { ok: false, reason: 'reader_key_revoked' };
      }
      return { ok: false, reason: 'reader_key_is_not_current' };
    }
    if (selected.candidate.deviceSigningKeyFingerprintHex
        !== record.grant.readerDeviceSigningKeyFingerprintHex
      || selected.candidate.deviceKeyAgreementKeyFingerprintHex
        !== record.grant.readerKeyFingerprintHex) {
      return { ok: false, reason: 'reader_key_is_not_current' };
    }

    const existing = this.readerGrantRecord(record.grant.readerGrantId);
    if (existing !== undefined) {
      return sameJson(existing, record)
        ? {
          ok: true,
          inserted: false,
          value: this.readerGrantView(existing, at),
        }
        : { ok: false, reason: 'conflicting_record' };
    }
    this.db
      .prepare(`
        INSERT INTO pico_reader_custody_reader_grant (
          reader_grant_id,
          domain_authority_id,
          home_id,
          privacy_domain,
          owner_identity_key_fingerprint_hex,
          reader_identity_key_fingerprint_hex,
          reader_device_signing_key_fingerprint_hex,
          reader_key_fingerprint_hex,
          reader_delegation_id,
          access_mode,
          first_kek_version,
          valid_from,
          valid_until,
          lifecycle_order,
          reader_grant_record_json,
          received_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        record.grant.readerGrantId,
        record.grant.domainAuthorityId,
        record.grant.homeId,
        record.grant.domainId,
        record.grant.ownerIdentityKeyFingerprintHex,
        record.grant.readerIdentityKeyFingerprintHex,
        record.grant.readerDeviceSigningKeyFingerprintHex,
        record.grant.readerKeyFingerprintHex,
        record.grant.readerDelegationId,
        record.grant.accessMode,
        record.grant.firstKekVersion,
        record.grant.validFrom,
        record.grant.validUntil,
        record.grant.lifecycleOrder,
        JSON.stringify(record),
        record.receivedAt,
      );
    return {
      ok: true,
      inserted: true,
      value: this.readerGrantView(record, at),
    };
  }

  public recordReaderGrantLifecycle(
    record: PicoReaderCustodyReaderGrantLifecycleRecord,
    at: string = new Date().toISOString(),
  ): ReaderCustodyRecordResult<PicoReaderCustodyReaderGrantView> {
    const grant = this.readerGrantRecord(record.lifecycle.readerGrantId);
    if (grant === undefined) {
      return { ok: false, reason: 'unknown_reader_grant' };
    }
    const domain = this.domainRecord(grant.grant.domainAuthorityId);
    if (domain === undefined) {
      return { ok: false, reason: 'unknown_domain' };
    }
    const domainVerification = this.verifyDomain(domain, at, true);
    if (domainVerification !== undefined) {
      return { ok: false, reason: domainVerification };
    }
    if (!this.verifyReaderGrantLifecycle(domain, grant, record)) {
      return { ok: false, reason: 'invalid_record' };
    }
    const existing = this.readerGrantLifecycleRecord(
      record.lifecycle.lifecycleId,
    );
    if (existing !== undefined) {
      return sameJson(existing, record)
        ? {
          ok: true,
          inserted: false,
          value: this.readerGrantView(grant, at),
        }
        : { ok: false, reason: 'conflicting_record' };
    }
    this.db
      .prepare(`
        INSERT INTO pico_reader_custody_reader_grant_lifecycle (
          lifecycle_id,
          reader_grant_id,
          domain_authority_id,
          status,
          reason_category,
          changed_at,
          lifecycle_order,
          lifecycle_record_json,
          received_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        record.lifecycle.lifecycleId,
        record.lifecycle.readerGrantId,
        record.lifecycle.domainAuthorityId,
        record.lifecycle.status,
        record.lifecycle.reasonCategory,
        record.lifecycle.changedAt,
        record.lifecycle.lifecycleOrder,
        JSON.stringify(record),
        record.receivedAt,
      );
    return {
      ok: true,
      inserted: true,
      value: this.readerGrantView(grant, at),
    };
  }

  public recordKekRotation(
    record: PicoReaderCustodyKekRotationRecord,
    at: string = new Date().toISOString(),
  ): ReaderCustodyRecordResult<PicoReaderCustodyKekRotationView> {
    const domain = this.domainRecord(record.rotation.domainAuthorityId);
    if (domain === undefined) {
      return { ok: false, reason: 'unknown_domain' };
    }
    const domainVerification = this.verifyDomain(domain, at, true);
    if (domainVerification !== undefined) {
      return { ok: false, reason: domainVerification };
    }
    if (!this.verifyKekRotation(domain, record, at)) {
      return { ok: false, reason: 'invalid_rotation' };
    }
    const existing = this.kekRotationRecord(record.rotation.rotationId);
    if (existing !== undefined) {
      return sameJson(existing, record)
        ? {
          ok: true,
          inserted: false,
          value: kekRotationView(existing),
        }
        : { ok: false, reason: 'conflicting_record' };
    }
    const existingVersion = this.db
      .prepare(`
        SELECT rotation_id AS rotationId
        FROM pico_reader_custody_kek_rotation
        WHERE domain_authority_id = ? AND kek_version = ?
      `)
      .get(
        record.rotation.domainAuthorityId,
        record.rotation.kekVersion,
      ) as { rotationId: string } | undefined;
    if (existingVersion !== undefined) {
      return { ok: false, reason: 'conflicting_record' };
    }
    this.db
      .prepare(`
        INSERT INTO pico_reader_custody_kek_rotation (
          rotation_id,
          domain_authority_id,
          previous_kek_version,
          kek_version,
          rotated_at,
          lifecycle_order,
          rotation_record_json,
          received_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        record.rotation.rotationId,
        record.rotation.domainAuthorityId,
        record.rotation.previousKekVersion,
        record.rotation.kekVersion,
        record.rotation.rotatedAt,
        record.rotation.lifecycleOrder,
        JSON.stringify(record),
        record.receivedAt,
      );
    return {
      ok: true,
      inserted: true,
      value: kekRotationView(record),
    };
  }

  public recordWriterGrant(
    record: PicoReaderCustodyWriterGrantRecord,
    at: string = new Date().toISOString(),
  ): ReaderCustodyRecordResult<PicoReaderCustodyWriterGrantView> {
    const domain = this.domainRecord(record.grant.domainAuthorityId);
    if (domain === undefined) {
      return { ok: false, reason: 'unknown_domain' };
    }
    const domainVerification = this.verifyDomain(domain, at, true);
    if (domainVerification !== undefined) {
      return { ok: false, reason: domainVerification };
    }
    if (!this.verifyWriterGrant(domain, record)) {
      return { ok: false, reason: 'invalid_record' };
    }
    if (this.hasRotationDebt(record.grant.domainAuthorityId)
      || record.grant.kekVersion
        !== this.currentKekVersion(record.grant.domainAuthorityId)) {
      return { ok: false, reason: 'rotation_required' };
    }
    if (!this.authority.hasActiveMembership(
      record.grant.writerIdentityKeyFingerprintHex,
      record.grant.homeId,
      at,
    )) {
      return { ok: false, reason: 'writer_is_not_active_member' };
    }

    const existing = this.writerGrantRecord(record.grant.writerGrantId);
    if (existing !== undefined) {
      return sameJson(existing, record)
        ? {
          ok: true,
          inserted: false,
          value: this.writerGrantView(existing, at),
        }
        : { ok: false, reason: 'conflicting_record' };
    }

    this.db
      .prepare(`
        INSERT INTO pico_reader_custody_writer_grant (
          writer_grant_id,
          domain_authority_id,
          home_id,
          privacy_domain,
          kek_version,
          owner_identity_key_fingerprint_hex,
          writer_identity_key_fingerprint_hex,
          writer_device_signing_key_fingerprint_hex,
          valid_from,
          valid_until,
          lifecycle_order,
          writer_grant_record_json,
          received_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        record.grant.writerGrantId,
        record.grant.domainAuthorityId,
        record.grant.homeId,
        record.grant.domainId,
        record.grant.kekVersion,
        record.grant.ownerIdentityKeyFingerprintHex,
        record.grant.writerIdentityKeyFingerprintHex,
        record.grant.writerDeviceSigningKeyFingerprintHex,
        record.grant.validFrom,
        record.grant.validUntil,
        record.grant.lifecycleOrder,
        JSON.stringify(record),
        record.receivedAt,
      );

    return {
      ok: true,
      inserted: true,
      value: this.writerGrantView(record, at),
    };
  }

  public recordWriterGrantLifecycle(
    record: PicoReaderCustodyWriterGrantLifecycleRecord,
    at: string = new Date().toISOString(),
  ): ReaderCustodyRecordResult<PicoReaderCustodyWriterGrantView> {
    const grant = this.writerGrantRecord(record.lifecycle.writerGrantId);
    if (grant === undefined) {
      return { ok: false, reason: 'unknown_writer_grant' };
    }
    const domain = this.domainRecord(grant.grant.domainAuthorityId);
    if (domain === undefined) {
      return { ok: false, reason: 'unknown_domain' };
    }
    const domainVerification = this.verifyDomain(domain, at, true);
    if (domainVerification !== undefined) {
      return { ok: false, reason: domainVerification };
    }
    if (!this.verifyWriterGrant(domain, grant)
      || !this.verifyWriterGrantLifecycle(domain, grant, record)) {
      return { ok: false, reason: 'invalid_record' };
    }

    const existing = this.writerGrantLifecycleRecord(
      record.lifecycle.lifecycleId,
    );
    if (existing !== undefined) {
      return sameJson(existing, record)
        ? {
          ok: true,
          inserted: false,
          value: this.writerGrantView(grant, at),
        }
        : { ok: false, reason: 'conflicting_record' };
    }

    this.db
      .prepare(`
        INSERT INTO pico_reader_custody_writer_grant_lifecycle (
          lifecycle_id,
          writer_grant_id,
          domain_authority_id,
          status,
          reason_category,
          changed_at,
          lifecycle_order,
          lifecycle_record_json,
          received_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        record.lifecycle.lifecycleId,
        record.lifecycle.writerGrantId,
        record.lifecycle.domainAuthorityId,
        record.lifecycle.status,
        record.lifecycle.reasonCategory,
        record.lifecycle.changedAt,
        record.lifecycle.lifecycleOrder,
        JSON.stringify(record),
        record.receivedAt,
      );

    return {
      ok: true,
      inserted: true,
      value: this.writerGrantView(grant, at),
    };
  }

  public recordItem(
    record: PicoReaderCustodyItemRecord,
    at: string = new Date().toISOString(),
  ): ReaderCustodyRecordResult<PicoReaderCustodyItemView> {
    const grant = this.writerGrantRecord(record.item.writerGrantId);
    if (grant === undefined) {
      return { ok: false, reason: 'unknown_writer_grant' };
    }
    const domain = this.domainRecord(record.item.domainAuthorityId);
    if (domain === undefined) {
      return { ok: false, reason: 'unknown_domain' };
    }
    const domainVerification = this.verifyDomain(domain, at, true);
    if (domainVerification !== undefined) {
      return { ok: false, reason: domainVerification };
    }
    if (!this.verifyWriterGrant(domain, grant)
      || !this.verifyItem(domain, grant, record)) {
      return { ok: false, reason: 'invalid_record' };
    }
    if (this.hasRotationDebt(record.item.domainAuthorityId)) {
      return { ok: false, reason: 'rotation_required' };
    }
    if (record.item.kekVersion
        !== this.currentKekVersion(record.item.domainAuthorityId)
      || grant.grant.kekVersion !== record.item.kekVersion) {
      return { ok: false, reason: 'inactive_writer_grant' };
    }
    if (this.writerGrantView(grant, at).status !== 'active') {
      return { ok: false, reason: 'inactive_writer_grant' };
    }
    if (!this.authority.hasActiveMembership(
      grant.grant.writerIdentityKeyFingerprintHex,
      grant.grant.homeId,
      at,
    )) {
      return { ok: false, reason: 'writer_is_not_active_member' };
    }

    const existingByPackage = this.itemRecord(record.item.packageId);
    if (existingByPackage !== undefined) {
      return sameJson(existingByPackage, record)
        ? {
          ok: true,
          inserted: false,
          value: itemView(existingByPackage),
        }
        : { ok: false, reason: 'conflicting_record' };
    }
    const existingByItem = this.db
      .prepare(`
        SELECT package_id AS packageId
        FROM pico_reader_custody_item
        WHERE domain_authority_id = ? AND memory_item_id = ?
      `)
      .get(record.item.domainAuthorityId, record.item.memoryItemId) as
        | { packageId: string }
        | undefined;
    if (existingByItem !== undefined) {
      return { ok: false, reason: 'conflicting_record' };
    }

    this.db
      .prepare(`
        INSERT INTO pico_reader_custody_item (
          package_id,
          domain_authority_id,
          writer_grant_id,
          home_id,
          privacy_domain,
          memory_item_id,
          content_type,
          kek_version,
          writer_identity_key_fingerprint_hex,
          writer_device_signing_key_fingerprint_hex,
          content_ciphertext_hex,
          wrapped_dek_hex,
          created_at,
          item_record_json,
          received_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        record.item.packageId,
        record.item.domainAuthorityId,
        record.item.writerGrantId,
        record.item.homeId,
        record.item.domainId,
        record.item.memoryItemId,
        record.item.contentType,
        record.item.kekVersion,
        record.item.writerIdentityKeyFingerprintHex,
        record.item.writerDeviceSigningKeyFingerprintHex,
        record.contentCiphertextHex,
        record.wrappedDekHex,
        record.item.createdAt,
        JSON.stringify(record),
        record.receivedAt,
      );

    return { ok: true, inserted: true, value: itemView(record) };
  }

  public domains(): PicoReaderCustodyDomainView[] {
    return (this.db
      .prepare(`
        SELECT domain_record_json AS recordJson
        FROM pico_reader_custody_domain
        ORDER BY authorized_at, domain_authority_id
      `)
      .all() as StoredJsonRow[])
      .map((row) => domainView(parseJson<PicoReaderCustodyDomainRecord>(row)));
  }

  public readerGrants(
    at: string = new Date().toISOString(),
  ): PicoReaderCustodyReaderGrantView[] {
    return (this.db
      .prepare(`
        SELECT reader_grant_record_json AS recordJson
        FROM pico_reader_custody_reader_grant
        ORDER BY valid_from, reader_grant_id
      `)
      .all() as StoredJsonRow[])
      .map((row) => this.readerGrantView(
        parseJson<PicoReaderCustodyReaderGrantRecord>(row),
        at,
      ));
  }

  public kekRotations(
    domainAuthorityId?: string,
  ): PicoReaderCustodyKekRotationView[] {
    const rows = (domainAuthorityId === undefined
      ? this.db
        .prepare(`
          SELECT rotation_record_json AS recordJson
          FROM pico_reader_custody_kek_rotation
          ORDER BY kek_version, rotation_id
        `)
        .all()
      : this.db
        .prepare(`
          SELECT rotation_record_json AS recordJson
          FROM pico_reader_custody_kek_rotation
          WHERE domain_authority_id = ?
          ORDER BY kek_version, rotation_id
        `)
        .all(domainAuthorityId)) as StoredJsonRow[];
    return rows.map((row) => kekRotationView(
      parseJson<PicoReaderCustodyKekRotationRecord>(row),
    ));
  }

  public writerGrants(
    at: string = new Date().toISOString(),
  ): PicoReaderCustodyWriterGrantView[] {
    return (this.db
      .prepare(`
        SELECT writer_grant_record_json AS recordJson
        FROM pico_reader_custody_writer_grant
        ORDER BY valid_from, writer_grant_id
      `)
      .all() as StoredJsonRow[])
      .map((row) => this.writerGrantView(
        parseJson<PicoReaderCustodyWriterGrantRecord>(row),
        at,
      ));
  }

  public items(domainAuthorityId?: string): PicoReaderCustodyItemView[] {
    const rows = (domainAuthorityId === undefined
      ? this.db
        .prepare(`
          SELECT item_record_json AS recordJson
          FROM pico_reader_custody_item
          ORDER BY created_at, package_id
        `)
        .all()
      : this.db
        .prepare(`
          SELECT item_record_json AS recordJson
          FROM pico_reader_custody_item
          WHERE domain_authority_id = ?
          ORDER BY created_at, package_id
        `)
        .all(domainAuthorityId)) as StoredJsonRow[];
    return rows.map((row) => itemView(
      parseJson<PicoReaderCustodyItemRecord>(row),
    ));
  }

  public reconcile(
    at: string = new Date().toISOString(),
  ): ReaderCustodyReconciliation {
    let droppedDomains = 0;
    let droppedReaderGrants = 0;
    let droppedReaderLifecycleRecords = 0;
    let droppedWriterGrants = 0;
    let droppedWriterLifecycleRecords = 0;
    let droppedRotations = 0;
    let droppedItems = 0;
    const reconcile = this.db.transaction(() => {
      const domainIds = this.db
        .prepare(`
          SELECT domain_authority_id AS domainAuthorityId
          FROM pico_reader_custody_domain
        `)
        .all()
        .map((row) => (row as { domainAuthorityId: string }).domainAuthorityId);
      for (const domainAuthorityId of domainIds) {
        const domain = this.domainRecord(domainAuthorityId);
        if (domain !== undefined
          && this.verifyDomain(domain, at, true) === undefined) {
          continue;
        }
        const removed = this.dropDomain(domainAuthorityId);
        droppedDomains += removed.domains;
        droppedReaderGrants += removed.readerGrants;
        droppedReaderLifecycleRecords += removed.readerLifecycleRecords;
        droppedWriterGrants += removed.writerGrants;
        droppedWriterLifecycleRecords += removed.writerLifecycleRecords;
        droppedRotations += removed.rotations;
        droppedItems += removed.items;
      }

      const readerGrantIds = this.db
        .prepare(`
          SELECT reader_grant_id AS readerGrantId
          FROM pico_reader_custody_reader_grant
        `)
        .all()
        .map((row) => (row as { readerGrantId: string }).readerGrantId);
      for (const readerGrantId of readerGrantIds) {
        const grant = this.readerGrantRecord(readerGrantId);
        const domain = grant === undefined
          ? undefined
          : this.domainRecord(grant.grant.domainAuthorityId);
        if (grant !== undefined
          && domain !== undefined
          && this.verifyReaderGrant(
            domain,
            grant,
            this.currentKekVersion(grant.grant.domainAuthorityId),
            true,
          )
          && this.authority.hasActiveMembership(
            grant.grant.readerIdentityKeyFingerprintHex,
            grant.grant.homeId,
            at,
          )) {
          continue;
        }
        droppedReaderLifecycleRecords += this.db
          .prepare(`
            DELETE FROM pico_reader_custody_reader_grant_lifecycle
            WHERE reader_grant_id = ?
          `)
          .run(readerGrantId).changes;
        droppedReaderGrants += this.db
          .prepare(`
            DELETE FROM pico_reader_custody_reader_grant
            WHERE reader_grant_id = ?
          `)
          .run(readerGrantId).changes;
      }

      const readerLifecycleIds = this.db
        .prepare(`
          SELECT lifecycle_id AS lifecycleId
          FROM pico_reader_custody_reader_grant_lifecycle
        `)
        .all()
        .map((row) => (row as { lifecycleId: string }).lifecycleId);
      for (const lifecycleId of readerLifecycleIds) {
        const lifecycle = this.readerGrantLifecycleRecord(lifecycleId);
        const grant = lifecycle === undefined
          ? undefined
          : this.readerGrantRecord(lifecycle.lifecycle.readerGrantId);
        const domain = grant === undefined
          ? undefined
          : this.domainRecord(grant.grant.domainAuthorityId);
        if (lifecycle !== undefined
          && grant !== undefined
          && domain !== undefined
          && this.verifyReaderGrantLifecycle(domain, grant, lifecycle)) {
          continue;
        }
        droppedReaderLifecycleRecords += this.db
          .prepare(`
            DELETE FROM pico_reader_custody_reader_grant_lifecycle
            WHERE lifecycle_id = ?
          `)
          .run(lifecycleId).changes;
      }

      const grantIds = this.db
        .prepare(`
          SELECT writer_grant_id AS writerGrantId
          FROM pico_reader_custody_writer_grant
        `)
        .all()
        .map((row) => (row as { writerGrantId: string }).writerGrantId);
      for (const writerGrantId of grantIds) {
        const grant = this.writerGrantRecord(writerGrantId);
        const domain = grant === undefined
          ? undefined
          : this.domainRecord(grant.grant.domainAuthorityId);
        if (grant !== undefined
          && domain !== undefined
          && this.verifyWriterGrant(domain, grant)
          && this.authority.hasActiveMembership(
            grant.grant.writerIdentityKeyFingerprintHex,
            grant.grant.homeId,
            at,
          )) {
          continue;
        }
        droppedItems += this.db
          .prepare(`
            DELETE FROM pico_reader_custody_item WHERE writer_grant_id = ?
          `)
          .run(writerGrantId).changes;
        droppedWriterLifecycleRecords += this.db
          .prepare(`
            DELETE FROM pico_reader_custody_writer_grant_lifecycle
            WHERE writer_grant_id = ?
          `)
          .run(writerGrantId).changes;
        droppedWriterGrants += this.db
          .prepare(`
            DELETE FROM pico_reader_custody_writer_grant
            WHERE writer_grant_id = ?
          `)
          .run(writerGrantId).changes;
      }

      const lifecycleIds = this.db
        .prepare(`
          SELECT lifecycle_id AS lifecycleId
          FROM pico_reader_custody_writer_grant_lifecycle
        `)
        .all()
        .map((row) => (row as { lifecycleId: string }).lifecycleId);
      for (const lifecycleId of lifecycleIds) {
        const lifecycle = this.writerGrantLifecycleRecord(lifecycleId);
        const grant = lifecycle === undefined
          ? undefined
          : this.writerGrantRecord(lifecycle.lifecycle.writerGrantId);
        const domain = grant === undefined
          ? undefined
          : this.domainRecord(grant.grant.domainAuthorityId);
        if (lifecycle !== undefined
          && grant !== undefined
          && domain !== undefined
          && this.verifyWriterGrantLifecycle(domain, grant, lifecycle)) {
          continue;
        }
        droppedWriterLifecycleRecords += this.db
          .prepare(`
            DELETE FROM pico_reader_custody_writer_grant_lifecycle
            WHERE lifecycle_id = ?
          `)
          .run(lifecycleId).changes;
      }

      const rotationIds = this.db
        .prepare(`
          SELECT rotation_id AS rotationId
          FROM pico_reader_custody_kek_rotation
          ORDER BY kek_version, rotation_id
        `)
        .all()
        .map((row) => (row as { rotationId: string }).rotationId);
      for (const rotationId of rotationIds) {
        const rotation = this.kekRotationRecord(rotationId);
        const domain = rotation === undefined
          ? undefined
          : this.domainRecord(rotation.rotation.domainAuthorityId);
        if (rotation !== undefined
          && domain !== undefined
          && this.verifyKekRotation(domain, rotation, at)) {
          continue;
        }
        droppedRotations += this.db
          .prepare(`
            DELETE FROM pico_reader_custody_kek_rotation
            WHERE rotation_id = ?
          `)
          .run(rotationId).changes;
      }

      // A dropped/tampered rotation can make grants from that KEK version
      // unsupported. Re-evaluate both grant families against the now-valid
      // contiguous version chain before item reconciliation.
      const remainingReaderGrantIds = this.db
        .prepare(`
          SELECT reader_grant_id AS readerGrantId
          FROM pico_reader_custody_reader_grant
        `)
        .all()
        .map((row) => (row as { readerGrantId: string }).readerGrantId);
      for (const readerGrantId of remainingReaderGrantIds) {
        const grant = this.readerGrantRecord(readerGrantId);
        const domain = grant === undefined
          ? undefined
          : this.domainRecord(grant.grant.domainAuthorityId);
        if (grant !== undefined
          && domain !== undefined
          && this.verifyReaderGrant(
            domain,
            grant,
            this.currentKekVersion(grant.grant.domainAuthorityId),
            true,
          )) {
          continue;
        }
        droppedReaderLifecycleRecords += this.db
          .prepare(`
            DELETE FROM pico_reader_custody_reader_grant_lifecycle
            WHERE reader_grant_id = ?
          `)
          .run(readerGrantId).changes;
        droppedReaderGrants += this.db
          .prepare(`
            DELETE FROM pico_reader_custody_reader_grant
            WHERE reader_grant_id = ?
          `)
          .run(readerGrantId).changes;
      }

      const remainingWriterGrantIds = this.db
        .prepare(`
          SELECT writer_grant_id AS writerGrantId
          FROM pico_reader_custody_writer_grant
        `)
        .all()
        .map((row) => (row as { writerGrantId: string }).writerGrantId);
      for (const writerGrantId of remainingWriterGrantIds) {
        const grant = this.writerGrantRecord(writerGrantId);
        const domain = grant === undefined
          ? undefined
          : this.domainRecord(grant.grant.domainAuthorityId);
        if (grant !== undefined
          && domain !== undefined
          && this.verifyWriterGrant(domain, grant)) {
          continue;
        }
        droppedItems += this.db
          .prepare(`
            DELETE FROM pico_reader_custody_item WHERE writer_grant_id = ?
          `)
          .run(writerGrantId).changes;
        droppedWriterLifecycleRecords += this.db
          .prepare(`
            DELETE FROM pico_reader_custody_writer_grant_lifecycle
            WHERE writer_grant_id = ?
          `)
          .run(writerGrantId).changes;
        droppedWriterGrants += this.db
          .prepare(`
            DELETE FROM pico_reader_custody_writer_grant
            WHERE writer_grant_id = ?
          `)
          .run(writerGrantId).changes;
      }

      const packageIds = this.db
        .prepare(`
          SELECT package_id AS packageId FROM pico_reader_custody_item
        `)
        .all()
        .map((row) => (row as { packageId: string }).packageId);
      for (const packageId of packageIds) {
        const item = this.itemRecord(packageId);
        const grant = item === undefined
          ? undefined
          : this.writerGrantRecord(item.item.writerGrantId);
        const domain = item === undefined
          ? undefined
          : this.domainRecord(item.item.domainAuthorityId);
        if (item !== undefined
          && grant !== undefined
          && domain !== undefined
          && this.verifyItem(domain, grant, item)) {
          continue;
        }
        droppedItems += this.db
          .prepare(`
            DELETE FROM pico_reader_custody_item WHERE package_id = ?
          `)
          .run(packageId).changes;
      }
    });
    reconcile();
    return {
      droppedDomains,
      droppedReaderGrants,
      droppedReaderLifecycleRecords,
      droppedWriterGrants,
      droppedWriterLifecycleRecords,
      droppedRotations,
      droppedItems,
    };
  }

  private verifyDomain(
    record: PicoReaderCustodyDomainRecord,
    at: string,
    requireMembership: boolean,
  ): ReaderCustodyFailureReason | undefined {
    try {
      assertExactKeys(record as unknown as Record<string, unknown>, [
        'schema',
        'domain',
        'ownerIdentityKeyRecord',
        'ownerReaderKeyRecord',
        'ownerEnvelope',
        'ownerSignatureHex',
        'receivedAt',
      ], 'invalid_record_shape');
      const founding = this.authority.foundingRecord();
      if (founding === undefined) {
        return 'no_founding_record';
      }
      const domain = record.domain;
      if (record.schema !== picoReaderCustodyDomainRecordSchema
        || domain.suite !== picoMemoryContentSuite
        || domain.custodyClass !== 'reader_custody'
        || domain.homeId !== founding.founding.homeId
        || domain.hostSigningKeyFingerprintHex
          !== (this.authority.currentHostSigningKeyFingerprintHex?.()
            ?? founding.founding.hostSigningKeyFingerprintHex)) {
        return 'wrong_home';
      }
      buildPicoReaderCustodyDomainSignatureInput(domain);
      if (!isPicoInstant(record.receivedAt)
        || record.ownerIdentityKeyRecord.suite !== picoIdentitySuite
        || record.ownerIdentityKeyRecord.keyRole !== 'pico_identity'
        || record.ownerReaderKeyRecord.suite !== picoIdentitySuite
        || record.ownerReaderKeyRecord.keyRole !== 'device_key_agreement'
        || !verifyPicoIdentityKeyRecordFingerprint(this.sodium, {
          keyRecord: record.ownerIdentityKeyRecord,
          expectedFingerprintHex: domain.ownerIdentityKeyFingerprintHex,
        })
        || !verifyPicoIdentityKeyRecordFingerprint(this.sodium, {
          keyRecord: record.ownerReaderKeyRecord,
          expectedFingerprintHex: domain.ownerReaderKeyFingerprintHex,
        })
        || !verifyPicoIdentityDetachedSignature(this.sodium, {
          publicKeyHex: record.ownerIdentityKeyRecord.publicKeyHex,
          signatureInput: buildPicoReaderCustodyDomainSignatureInput(domain),
          signatureHex: record.ownerSignatureHex,
        })
        || !this.verifyOwnerEnvelope(record)) {
        return 'invalid_record';
      }
      if (requireMembership && !this.authority.hasActiveMembership(
        domain.ownerIdentityKeyFingerprintHex,
        domain.homeId,
        at,
      )) {
        return 'owner_is_not_active_member';
      }
      return undefined;
    } catch {
      return 'invalid_record';
    }
  }

  private verifyOwnerEnvelope(record: PicoReaderCustodyDomainRecord): boolean {
    try {
      const domain = record.domain;
      const ownerEnvelope = record.ownerEnvelope;
      const envelope = ownerEnvelope.envelope;
      if (ownerEnvelope.schema !== picoShareEnvelopeRecordSchema
        || envelope.suite !== picoShareSuite
        || envelope.grantId !== domain.domainAuthorityId
        || envelope.domainId !== domain.domainId
        || envelope.kekVersion !== domain.kekVersion
        || envelope.hostSigningKeyFingerprintHex
          !== domain.hostSigningKeyFingerprintHex
        || envelope.issuerIdentityKeyFingerprintHex
          !== domain.ownerIdentityKeyFingerprintHex
        || envelope.readerKeyFingerprintHex
          !== domain.ownerReaderKeyFingerprintHex
        || envelope.grantedAt !== domain.authorizedAt
        || !sameJson(
          ownerEnvelope.issuerIdentityKeyRecord,
          record.ownerIdentityKeyRecord,
        )
        || !isPicoInstant(ownerEnvelope.createdAt)
        || !isCanonicalHex(ownerEnvelope.sealedWrapHex)) {
        return false;
      }
      const digest = Buffer.from(this.sodium.crypto_generichash(
        32,
        Buffer.from(ownerEnvelope.sealedWrapHex, 'hex'),
        null,
      )).toString('hex');
      return digest === envelope.wrapDigestHex
        && verifyPicoIdentityDetachedSignature(this.sodium, {
          publicKeyHex: record.ownerIdentityKeyRecord.publicKeyHex,
          signatureInput: buildPicoShareEnvelopeSignatureInput(envelope),
          signatureHex: ownerEnvelope.issuerSignatureHex,
        });
    } catch {
      return false;
    }
  }

  private verifyReaderGrant(
    domainRecord: PicoReaderCustodyDomainRecord,
    record: PicoReaderCustodyReaderGrantRecord,
    currentKekVersion: number,
    allowHistoricalEnvelopeSet = false,
  ): boolean {
    try {
      assertExactKeys(record as unknown as Record<string, unknown>, [
        'schema',
        'grant',
        'ownerIdentityKeyRecord',
        'readerKeyRecord',
        'envelopes',
        'ownerSignatureHex',
        'receivedAt',
      ], 'invalid_record_shape');
      const domain = domainRecord.domain;
      const grant = record.grant;
      if (record.schema !== picoReaderCustodyReaderGrantRecordSchema
        || grant.suite !== picoMemoryContentSuite
        || grant.domainAuthorityId !== domain.domainAuthorityId
        || grant.homeId !== domain.homeId
        || grant.hostSigningKeyFingerprintHex
          !== domain.hostSigningKeyFingerprintHex
        || grant.domainId !== domain.domainId
        || grant.ownerIdentityKeyFingerprintHex
          !== domain.ownerIdentityKeyFingerprintHex
        || !sameJson(
          record.ownerIdentityKeyRecord,
          domainRecord.ownerIdentityKeyRecord,
        )
        || record.readerKeyRecord.suite !== picoIdentitySuite
        || record.readerKeyRecord.keyRole !== 'device_key_agreement'
        || !verifyPicoIdentityKeyRecordFingerprint(this.sodium, {
          keyRecord: record.readerKeyRecord,
          expectedFingerprintHex: grant.readerKeyFingerprintHex,
        })
        || !Array.isArray(record.envelopes)
        || record.envelopes.length === 0
        || !isPicoInstant(record.receivedAt)) {
        return false;
      }
      buildPicoReaderCustodyReaderGrantSignatureInput(grant);
      const versions = record.envelopes
        .map((envelope) => envelope.envelope.kekVersion)
        .sort((left, right) => left - right);
      const envelopeMaximum = versions.at(-1);
      if (envelopeMaximum === undefined
        || versions[0] !== grant.firstKekVersion
        || new Set(versions).size !== versions.length
        || versions.some((version, index) =>
          version !== grant.firstKekVersion + index)
        || envelopeMaximum > currentKekVersion
        || (!allowHistoricalEnvelopeSet
          && envelopeMaximum !== currentKekVersion)
        || (grant.accessMode === 'forward_only'
          && (versions.length !== 1
            || grant.firstKekVersion !== envelopeMaximum))
        || !verifyPicoIdentityDetachedSignature(this.sodium, {
          publicKeyHex: record.ownerIdentityKeyRecord.publicKeyHex,
          signatureInput:
            buildPicoReaderCustodyReaderGrantSignatureInput(grant),
          signatureHex: record.ownerSignatureHex,
        })) {
        return false;
      }
      return record.envelopes.every((envelope) =>
        this.verifyReaderCustodyEnvelope(envelope, {
          ownerIdentityKeyRecord: record.ownerIdentityKeyRecord,
          grantId: grant.readerGrantId,
          domain,
          kekVersion: envelope.envelope.kekVersion,
          readerKeyFingerprintHex: grant.readerKeyFingerprintHex,
          grantedAt: grant.validFrom,
        }));
    } catch {
      return false;
    }
  }

  private verifyReaderGrantLifecycle(
    domainRecord: PicoReaderCustodyDomainRecord,
    grantRecord: PicoReaderCustodyReaderGrantRecord,
    record: PicoReaderCustodyReaderGrantLifecycleRecord,
  ): boolean {
    try {
      assertExactKeys(record as unknown as Record<string, unknown>, [
        'schema',
        'lifecycle',
        'ownerIdentityKeyRecord',
        'ownerSignatureHex',
        'receivedAt',
      ], 'invalid_record_shape');
      const domain = domainRecord.domain;
      const grant = grantRecord.grant;
      const lifecycle = record.lifecycle;
      return record.schema
          === picoReaderCustodyReaderGrantLifecycleRecordSchema
        && lifecycle.suite === picoMemoryContentSuite
        && lifecycle.readerGrantId === grant.readerGrantId
        && lifecycle.domainAuthorityId === domain.domainAuthorityId
        && lifecycle.homeId === domain.homeId
        && lifecycle.hostSigningKeyFingerprintHex
          === domain.hostSigningKeyFingerprintHex
        && lifecycle.domainId === domain.domainId
        && lifecycle.ownerIdentityKeyFingerprintHex
          === domain.ownerIdentityKeyFingerprintHex
        && lifecycle.readerIdentityKeyFingerprintHex
          === grant.readerIdentityKeyFingerprintHex
        && lifecycle.readerKeyFingerprintHex
          === grant.readerKeyFingerprintHex
        && lifecycle.lifecycleOrder > grant.lifecycleOrder
        && sameJson(
          record.ownerIdentityKeyRecord,
          domainRecord.ownerIdentityKeyRecord,
        )
        && isPicoInstant(record.receivedAt)
        && verifyPicoIdentityDetachedSignature(this.sodium, {
          publicKeyHex: record.ownerIdentityKeyRecord.publicKeyHex,
          signatureInput:
            buildPicoReaderCustodyReaderGrantLifecycleSignatureInput(
              lifecycle,
            ),
          signatureHex: record.ownerSignatureHex,
        });
    } catch {
      return false;
    }
  }

  private verifyKekRotation(
    domainRecord: PicoReaderCustodyDomainRecord,
    record: PicoReaderCustodyKekRotationRecord,
    at: string,
  ): boolean {
    try {
      assertExactKeys(record as unknown as Record<string, unknown>, [
        'schema',
        'rotation',
        'ownerIdentityKeyRecord',
        'envelopes',
        'ownerSignatureHex',
        'receivedAt',
      ], 'invalid_record_shape');
      const domain = domainRecord.domain;
      const rotation = record.rotation;
      if (record.schema !== picoReaderCustodyKekRotationRecordSchema
        || rotation.suite !== picoMemoryContentSuite
        || rotation.domainAuthorityId !== domain.domainAuthorityId
        || rotation.homeId !== domain.homeId
        || rotation.hostSigningKeyFingerprintHex
          !== domain.hostSigningKeyFingerprintHex
        || rotation.domainId !== domain.domainId
        || rotation.ownerIdentityKeyFingerprintHex
          !== domain.ownerIdentityKeyFingerprintHex
        || !sameJson(
          record.ownerIdentityKeyRecord,
          domainRecord.ownerIdentityKeyRecord,
        )
        || !Array.isArray(record.envelopes)
        || rotation.rotatedAt > at
        || !isPicoInstant(record.receivedAt)) {
        return false;
      }
      buildPicoReaderCustodyKekRotationSignatureInput(rotation);
      const previous = this.previousVersionAuthority(
        rotation.domainAuthorityId,
        rotation.kekVersion,
        domainRecord,
      );
      if (rotation.previousKekVersion !== previous.kekVersion
        || rotation.kekVersion !== previous.kekVersion + 1
        || rotation.lifecycleOrder <= previous.lifecycleOrder
        || !verifyPicoIdentityDetachedSignature(this.sodium, {
          publicKeyHex: record.ownerIdentityKeyRecord.publicKeyHex,
          signatureInput:
            buildPicoReaderCustodyKekRotationSignatureInput(rotation),
          signatureHex: record.ownerSignatureHex,
        })) {
        return false;
      }

      const causes = this.uncoveredLifecycleRecords(
        rotation.domainAuthorityId,
        previous.lifecycleOrder,
        rotation.rotatedAt,
      );
      if (causes.some((cause) =>
        cause.lifecycleOrder >= rotation.lifecycleOrder
        || cause.changedAt > rotation.rotatedAt)
        || !sameStringSet(
          rotation.causeLifecycleIds,
          causes.map((cause) => cause.lifecycleId),
        )) {
        return false;
      }
      const remainingReaders = this.activeReaderGrantRecords(
        rotation.domainAuthorityId,
        rotation.rotatedAt,
      );
      if (!sameStringSet(
          rotation.remainingReaderGrantIds,
          remainingReaders.map((grant) => grant.grant.readerGrantId),
        )
        || record.envelopes.length !== remainingReaders.length + 1) {
        return false;
      }

      const envelopeByGrantId = new Map(
        record.envelopes.map((envelope) => [
          envelope.envelope.grantId,
          envelope,
        ]),
      );
      if (envelopeByGrantId.size !== record.envelopes.length) {
        return false;
      }
      const ownerEnvelope = envelopeByGrantId.get(rotation.rotationId);
      if (ownerEnvelope === undefined
        || !this.verifyReaderCustodyEnvelope(ownerEnvelope, {
          ownerIdentityKeyRecord: record.ownerIdentityKeyRecord,
          grantId: rotation.rotationId,
          domain,
          kekVersion: rotation.kekVersion,
          readerKeyFingerprintHex: domain.ownerReaderKeyFingerprintHex,
          grantedAt: rotation.rotatedAt,
        })) {
        return false;
      }
      return remainingReaders.every((readerGrant) => {
        const envelope = envelopeByGrantId.get(
          readerGrant.grant.readerGrantId,
        );
        return envelope !== undefined
          && this.verifyReaderCustodyEnvelope(envelope, {
            ownerIdentityKeyRecord: record.ownerIdentityKeyRecord,
            grantId: readerGrant.grant.readerGrantId,
            domain,
            kekVersion: rotation.kekVersion,
            readerKeyFingerprintHex:
              readerGrant.grant.readerKeyFingerprintHex,
            grantedAt: rotation.rotatedAt,
          });
      });
    } catch {
      return false;
    }
  }

  private verifyReaderCustodyEnvelope(
    record: PicoReaderCustodyReaderGrantRecord['envelopes'][number],
    expected: {
      ownerIdentityKeyRecord:
        PicoReaderCustodyDomainRecord['ownerIdentityKeyRecord'];
      grantId: string;
      domain: PicoReaderCustodyDomainRecord['domain'];
      kekVersion: number;
      readerKeyFingerprintHex: string;
      grantedAt: string;
    },
  ): boolean {
    try {
      const envelope = record.envelope;
      if (record.schema !== picoShareEnvelopeRecordSchema
        || envelope.suite !== picoShareSuite
        || envelope.grantId !== expected.grantId
        || envelope.domainId !== expected.domain.domainId
        || envelope.kekVersion !== expected.kekVersion
        || envelope.hostSigningKeyFingerprintHex
          !== expected.domain.hostSigningKeyFingerprintHex
        || envelope.issuerIdentityKeyFingerprintHex
          !== expected.domain.ownerIdentityKeyFingerprintHex
        || envelope.readerKeyFingerprintHex
          !== expected.readerKeyFingerprintHex
        || envelope.grantedAt !== expected.grantedAt
        || !sameJson(
          record.issuerIdentityKeyRecord,
          expected.ownerIdentityKeyRecord,
        )
        || !isPicoInstant(record.createdAt)
        || !isCanonicalHex(record.sealedWrapHex)) {
        return false;
      }
      const digest = Buffer.from(this.sodium.crypto_generichash(
        32,
        Buffer.from(record.sealedWrapHex, 'hex'),
        null,
      )).toString('hex');
      return digest === envelope.wrapDigestHex
        && verifyPicoIdentityDetachedSignature(this.sodium, {
          publicKeyHex: expected.ownerIdentityKeyRecord.publicKeyHex,
          signatureInput: buildPicoShareEnvelopeSignatureInput(envelope),
          signatureHex: record.issuerSignatureHex,
        });
    } catch {
      return false;
    }
  }

  private verifyWriterGrant(
    domainRecord: PicoReaderCustodyDomainRecord,
    record: PicoReaderCustodyWriterGrantRecord,
  ): boolean {
    try {
      assertExactKeys(record as unknown as Record<string, unknown>, [
        'schema',
        'grant',
        'ownerIdentityKeyRecord',
        'writerDeviceSigningKeyRecord',
        'ownerSignatureHex',
        'receivedAt',
      ], 'invalid_record_shape');
      const domain = domainRecord.domain;
      const grant = record.grant;
      return record.schema === picoReaderCustodyWriterGrantRecordSchema
        && grant.suite === picoMemoryContentSuite
        && grant.domainAuthorityId === domain.domainAuthorityId
        && grant.homeId === domain.homeId
        && grant.hostSigningKeyFingerprintHex
          === domain.hostSigningKeyFingerprintHex
        && grant.domainId === domain.domainId
        && grant.kekVersion >= domain.kekVersion
        && grant.kekVersion
          <= this.currentKekVersion(domain.domainAuthorityId)
        && grant.ownerIdentityKeyFingerprintHex
          === domain.ownerIdentityKeyFingerprintHex
        && sameJson(
          record.ownerIdentityKeyRecord,
          domainRecord.ownerIdentityKeyRecord,
        )
        && record.writerDeviceSigningKeyRecord.suite === picoIdentitySuite
        && record.writerDeviceSigningKeyRecord.keyRole === 'device_signing'
        && verifyPicoIdentityKeyRecordFingerprint(this.sodium, {
          keyRecord: record.writerDeviceSigningKeyRecord,
          expectedFingerprintHex:
            grant.writerDeviceSigningKeyFingerprintHex,
        })
        && isPicoInstant(record.receivedAt)
        && verifyPicoIdentityDetachedSignature(this.sodium, {
          publicKeyHex: record.ownerIdentityKeyRecord.publicKeyHex,
          signatureInput:
            buildPicoReaderCustodyWriterGrantSignatureInput(grant),
          signatureHex: record.ownerSignatureHex,
        });
    } catch {
      return false;
    }
  }

  private verifyWriterGrantLifecycle(
    domainRecord: PicoReaderCustodyDomainRecord,
    grantRecord: PicoReaderCustodyWriterGrantRecord,
    record: PicoReaderCustodyWriterGrantLifecycleRecord,
  ): boolean {
    try {
      assertExactKeys(record as unknown as Record<string, unknown>, [
        'schema',
        'lifecycle',
        'ownerIdentityKeyRecord',
        'ownerSignatureHex',
        'receivedAt',
      ], 'invalid_record_shape');
      const domain = domainRecord.domain;
      const grant = grantRecord.grant;
      const lifecycle = record.lifecycle;
      return record.schema
          === picoReaderCustodyWriterGrantLifecycleRecordSchema
        && lifecycle.suite === picoMemoryContentSuite
        && lifecycle.writerGrantId === grant.writerGrantId
        && lifecycle.domainAuthorityId === domain.domainAuthorityId
        && lifecycle.homeId === domain.homeId
        && lifecycle.hostSigningKeyFingerprintHex
          === domain.hostSigningKeyFingerprintHex
        && lifecycle.domainId === domain.domainId
        && lifecycle.ownerIdentityKeyFingerprintHex
          === domain.ownerIdentityKeyFingerprintHex
        && lifecycle.writerIdentityKeyFingerprintHex
          === grant.writerIdentityKeyFingerprintHex
        && lifecycle.writerDeviceSigningKeyFingerprintHex
          === grant.writerDeviceSigningKeyFingerprintHex
        && lifecycle.lifecycleOrder > grant.lifecycleOrder
        && sameJson(
          record.ownerIdentityKeyRecord,
          domainRecord.ownerIdentityKeyRecord,
        )
        && isPicoInstant(record.receivedAt)
        && verifyPicoIdentityDetachedSignature(this.sodium, {
          publicKeyHex: record.ownerIdentityKeyRecord.publicKeyHex,
          signatureInput:
            buildPicoReaderCustodyWriterGrantLifecycleSignatureInput(lifecycle),
          signatureHex: record.ownerSignatureHex,
        });
    } catch {
      return false;
    }
  }

  private verifyItem(
    domainRecord: PicoReaderCustodyDomainRecord,
    grantRecord: PicoReaderCustodyWriterGrantRecord,
    record: PicoReaderCustodyItemRecord,
  ): boolean {
    try {
      assertExactKeys(record as unknown as Record<string, unknown>, [
        'schema',
        'item',
        'contentCiphertextHex',
        'wrappedDekHex',
        'writerDeviceSigningKeyRecord',
        'writerSignatureHex',
        'receivedAt',
      ], 'invalid_record_shape');
      const domain = domainRecord.domain;
      const grant = grantRecord.grant;
      const item = record.item;
      if (record.schema !== picoReaderCustodyItemRecordSchema
        || item.suite !== picoMemoryContentSuite
        || item.domainAuthorityId !== domain.domainAuthorityId
        || item.writerGrantId !== grant.writerGrantId
        || item.homeId !== domain.homeId
        || item.hostSigningKeyFingerprintHex
          !== domain.hostSigningKeyFingerprintHex
        || item.domainId !== domain.domainId
        || item.kekVersion !== grant.kekVersion
        || item.writerIdentityKeyFingerprintHex
          !== grant.writerIdentityKeyFingerprintHex
        || item.writerDeviceSigningKeyFingerprintHex
          !== grant.writerDeviceSigningKeyFingerprintHex
        || item.createdAt < grant.validFrom
        || item.createdAt >= grant.validUntil
        || !sameJson(
          record.writerDeviceSigningKeyRecord,
          grantRecord.writerDeviceSigningKeyRecord,
        )
        || !isPicoInstant(record.receivedAt)
        || !isCanonicalHex(record.contentCiphertextHex)
        || !isCanonicalHex(record.wrappedDekHex)) {
        return false;
      }
      buildPicoReaderCustodyItemSignatureInput(item);
      const ciphertextDigest = Buffer.from(this.sodium.crypto_generichash(
        32,
        Buffer.from(record.contentCiphertextHex, 'hex'),
        null,
      )).toString('hex');
      const wrappedDekDigest = Buffer.from(this.sodium.crypto_generichash(
        32,
        Buffer.from(record.wrappedDekHex, 'hex'),
        null,
      )).toString('hex');
      return ciphertextDigest === item.contentCiphertextDigestHex
        && wrappedDekDigest === item.wrappedDekDigestHex
        && verifyPicoIdentityDetachedSignature(this.sodium, {
          publicKeyHex: record.writerDeviceSigningKeyRecord.publicKeyHex,
          signatureInput: buildPicoReaderCustodyItemSignatureInput(item),
          signatureHex: record.writerSignatureHex,
        });
    } catch {
      return false;
    }
  }

  private writerGrantView(
    record: PicoReaderCustodyWriterGrantRecord,
    at: string,
  ): PicoReaderCustodyWriterGrantView {
    const grant = record.grant;
    const lifecycle = this.db
      .prepare(`
        SELECT lifecycle_record_json AS recordJson
        FROM pico_reader_custody_writer_grant_lifecycle
        WHERE writer_grant_id = ? AND changed_at <= ?
        ORDER BY lifecycle_order DESC, lifecycle_id DESC
        LIMIT 1
      `)
      .get(grant.writerGrantId, at) as StoredJsonRow | undefined;
    let status: PicoReaderCustodyWriterGrantView['status'];
    if (lifecycle !== undefined) {
      status = 'revoked';
    } else if (at < grant.validFrom) {
      status = 'not_yet_valid';
    } else if (at >= grant.validUntil) {
      status = 'expired';
    } else if (grant.kekVersion
        < this.currentKekVersion(grant.domainAuthorityId)) {
      status = 'superseded';
    } else {
      status = 'active';
    }
    return {
      writerGrantId: grant.writerGrantId,
      domainAuthorityId: grant.domainAuthorityId,
      domainId: grant.domainId,
      writerIdentityKeyFingerprintHex:
        grant.writerIdentityKeyFingerprintHex,
      writerDeviceSigningKeyFingerprintHex:
        grant.writerDeviceSigningKeyFingerprintHex,
      status,
      validFrom: grant.validFrom,
      validUntil: grant.validUntil,
      lifecycleOrder: grant.lifecycleOrder,
      receivedAt: record.receivedAt,
    };
  }

  private readerGrantView(
    record: PicoReaderCustodyReaderGrantRecord,
    at: string,
  ): PicoReaderCustodyReaderGrantView {
    const grant = record.grant;
    const lifecycle = this.db
      .prepare(`
        SELECT lifecycle_record_json AS recordJson
        FROM pico_reader_custody_reader_grant_lifecycle
        WHERE reader_grant_id = ? AND changed_at <= ?
        ORDER BY lifecycle_order DESC, lifecycle_id DESC
        LIMIT 1
      `)
      .get(grant.readerGrantId, at) as StoredJsonRow | undefined;
    let status: PicoReaderCustodyReaderGrantView['status'];
    if (lifecycle !== undefined) {
      status = 'revoked';
    } else if (at < grant.validFrom) {
      status = 'not_yet_valid';
    } else if (at >= grant.validUntil) {
      status = 'expired';
    } else {
      status = 'active';
    }
    return {
      readerGrantId: grant.readerGrantId,
      domainAuthorityId: grant.domainAuthorityId,
      domainId: grant.domainId,
      readerIdentityKeyFingerprintHex:
        grant.readerIdentityKeyFingerprintHex,
      readerDeviceSigningKeyFingerprintHex:
        grant.readerDeviceSigningKeyFingerprintHex,
      readerKeyFingerprintHex: grant.readerKeyFingerprintHex,
      readerDelegationId: grant.readerDelegationId,
      accessMode: grant.accessMode,
      firstKekVersion: grant.firstKekVersion,
      envelopeKekVersions: record.envelopes
        .map((envelope) => envelope.envelope.kekVersion)
        .sort((left, right) => left - right),
      status,
      validFrom: grant.validFrom,
      validUntil: grant.validUntil,
      lifecycleOrder: grant.lifecycleOrder,
      receivedAt: record.receivedAt,
    };
  }

  private currentKekVersion(domainAuthorityId: string): number {
    const domain = this.domainRecord(domainAuthorityId);
    if (domain === undefined) {
      return 0;
    }
    const row = this.db
      .prepare(`
        SELECT MAX(kek_version) AS kekVersion
        FROM pico_reader_custody_kek_rotation
        WHERE domain_authority_id = ?
      `)
      .get(domainAuthorityId) as { kekVersion: number | null };
    return row.kekVersion ?? domain.domain.kekVersion;
  }

  private currentVersionAuthority(domainAuthorityId: string): {
    kekVersion: number;
    lifecycleOrder: string;
  } {
    const rotation = this.db
      .prepare(`
        SELECT rotation_record_json AS recordJson
        FROM pico_reader_custody_kek_rotation
        WHERE domain_authority_id = ?
        ORDER BY kek_version DESC
        LIMIT 1
      `)
      .get(domainAuthorityId) as StoredJsonRow | undefined;
    if (rotation !== undefined) {
      const record = parseJson<PicoReaderCustodyKekRotationRecord>(rotation);
      return {
        kekVersion: record.rotation.kekVersion,
        lifecycleOrder: record.rotation.lifecycleOrder,
      };
    }
    const domain = this.domainRecord(domainAuthorityId);
    return {
      kekVersion: domain?.domain.kekVersion ?? 0,
      lifecycleOrder: domain?.domain.lifecycleOrder ?? '',
    };
  }

  private previousVersionAuthority(
    domainAuthorityId: string,
    beforeKekVersion: number,
    domainRecord: PicoReaderCustodyDomainRecord,
  ): { kekVersion: number; lifecycleOrder: string } {
    const previous = this.db
      .prepare(`
        SELECT rotation_record_json AS recordJson
        FROM pico_reader_custody_kek_rotation
        WHERE domain_authority_id = ? AND kek_version < ?
        ORDER BY kek_version DESC
        LIMIT 1
      `)
      .get(domainAuthorityId, beforeKekVersion) as StoredJsonRow | undefined;
    if (previous === undefined) {
      return {
        kekVersion: domainRecord.domain.kekVersion,
        lifecycleOrder: domainRecord.domain.lifecycleOrder,
      };
    }
    const record = parseJson<PicoReaderCustodyKekRotationRecord>(previous);
    return {
      kekVersion: record.rotation.kekVersion,
      lifecycleOrder: record.rotation.lifecycleOrder,
    };
  }

  private uncoveredLifecycleRecords(
    domainAuthorityId: string,
    afterLifecycleOrder: string,
    throughAt: string = new Date().toISOString(),
  ): {
    lifecycleId: string;
    lifecycleOrder: string;
    changedAt: string;
  }[] {
    return this.db
      .prepare(`
        SELECT
          lifecycle_id AS lifecycleId,
          lifecycle_order AS lifecycleOrder,
          changed_at AS changedAt
        FROM pico_reader_custody_reader_grant_lifecycle
        WHERE domain_authority_id = ?
          AND lifecycle_order > ?
          AND changed_at <= ?
        UNION ALL
        SELECT
          lifecycle_id AS lifecycleId,
          lifecycle_order AS lifecycleOrder,
          changed_at AS changedAt
        FROM pico_reader_custody_writer_grant_lifecycle
        WHERE domain_authority_id = ?
          AND lifecycle_order > ?
          AND changed_at <= ?
        ORDER BY lifecycleOrder, lifecycleId
      `)
      .all(
        domainAuthorityId,
        afterLifecycleOrder,
        throughAt,
        domainAuthorityId,
        afterLifecycleOrder,
        throughAt,
      ) as {
        lifecycleId: string;
        lifecycleOrder: string;
        changedAt: string;
      }[];
  }

  private activeReaderGrantRecords(
    domainAuthorityId: string,
    at: string,
  ): PicoReaderCustodyReaderGrantRecord[] {
    return (this.db
      .prepare(`
        SELECT reader_grant_record_json AS recordJson
        FROM pico_reader_custody_reader_grant
        WHERE domain_authority_id = ?
        ORDER BY reader_grant_id
      `)
      .all(domainAuthorityId) as StoredJsonRow[])
      .map((row) => parseJson<PicoReaderCustodyReaderGrantRecord>(row))
      .filter((record) =>
        this.readerGrantView(record, at).status === 'active'
        && this.authority.hasActiveMembership(
          record.grant.readerIdentityKeyFingerprintHex,
          record.grant.homeId,
          at,
        ));
  }

  private hasRotationDebt(domainAuthorityId: string): boolean {
    const authority = this.currentVersionAuthority(domainAuthorityId);
    return this.uncoveredLifecycleRecords(
      domainAuthorityId,
      authority.lifecycleOrder,
    ).length > 0;
  }

  /**
   * ADR 0094 mit ADR 0086 - alles, was ein Leser zum Entschlüsseln braucht.
   *
   * **Der Raum war beschreibbar, erteilbar und unlesbar** (gefunden
   * 2026-08-27). Die Leihe im Vault-Daemon verlangt vier Aufzeichnungen -
   * Domäne, Leserrecht, Schreibrecht und das Item -, und ein lesendes Gerät
   * hat keine davon: sie liegen hier. Die einzige Route dorthin war
   * Home-zu-Home, und sie lieferte Projektionen statt Aufzeichnungen.
   *
   * **Nur an einen Leser.** Ohne ein gültiges Leserrecht für diese Identität
   * gibt es kein Bündel - nicht, weil der Geheimtext etwas verriete, sondern
   * weil die Umschläge daneben für genau einen Schlüssel bestimmt sind und
   * eine Liste davon eine Karte wäre, wer wo hineindarf.
   *
   * Die Aufzeichnungen gehen **ganz** hinaus, mit ihren Unterschriften: der
   * Daemon prüft sie selbst, und ein Bündel, das hier zurechtgeschnitten
   * würde, machte diesen Speicher zur zweiten Meinung über etwas, das er
   * nicht entscheidet.
   */
  /**
   * ADR 0101 mit ADR 0130 E5 - was eine Rotation nennen muss, für die Person,
   * der die Domäne gehört.
   *
   * **Warum das nicht im Lesebündel steht** (gebaut 2026-08-27). Das Bündel
   * daneben bedient *Leser*, und die verbleibenden Leserrechte aufzuzählen
   * wäre für sie eine Karte, wer sonst noch hineindarf - genau das, was
   * `readingBundleFor` verweigert. Hier ist die Aufzählung dagegen der Inhalt:
   * eine Rotation versiegelt den neuen KEK für jeden, der bleibt, und das Home
   * prüft die Liste danach Zeichen für Zeichen gegen seine eigene.
   *
   * **Nur an die Besitzerin.** Kein Leserrecht öffnet diese Tür, auch kein
   * gültiges: rotieren darf, wem die Domäne gehört.
   *
   * Die drei Listen sind genau die, gegen die `verifyKekRotation` prüft: die
   * Aussagen, die seit der aktuellen Fassung offen sind - sie sind der
   * *Anlass* -, und die Leserrechte, die dann noch gelten. Sie hier zu
   * berechnen statt sie das Gerät raten zu lassen, ist der Unterschied
   * zwischen einer Rotation, die angenommen wird, und einer, die mit
   * `invalid_record` zurückkommt, ohne zu sagen, welche Liste falsch war.
   */
  public rotationBundleFor(input: {
    domainAuthorityId: string;
    ownerIdentityKeyFingerprintHex: string;
    at?: string;
  }): {
    domain: PicoReaderCustodyDomainRecord;
    rotations: PicoReaderCustodyKekRotationRecord[];
    readerGrantLifecycles: PicoReaderCustodyReaderGrantLifecycleRecord[];
    writerGrantLifecycles: PicoReaderCustodyWriterGrantLifecycleRecord[];
    remainingReaderGrants: PicoReaderCustodyReaderGrantRecord[];
  } | undefined {
    const at = input.at ?? new Date().toISOString();
    const domain = this.domainRecord(input.domainAuthorityId);
    if (domain === undefined
      || domain.domain.ownerIdentityKeyFingerprintHex
        !== input.ownerIdentityKeyFingerprintHex) {
      return undefined;
    }
    const authority = this.currentVersionAuthority(input.domainAuthorityId);
    const causes = new Set(this.uncoveredLifecycleRecords(
      input.domainAuthorityId,
      authority.lifecycleOrder,
      at,
    ).map((cause) => cause.lifecycleId));

    return {
      domain,
      rotations: (this.db
        .prepare(`
          SELECT rotation_record_json AS recordJson
          FROM pico_reader_custody_kek_rotation
          WHERE domain_authority_id = ?
          ORDER BY kek_version, rotation_id
        `)
        .all(input.domainAuthorityId) as StoredJsonRow[])
        .map((row) => parseJson<PicoReaderCustodyKekRotationRecord>(row)),
      readerGrantLifecycles: (this.db
        .prepare(`
          SELECT lifecycle_record_json AS recordJson
          FROM pico_reader_custody_reader_grant_lifecycle
          WHERE domain_authority_id = ?
          ORDER BY lifecycle_order, lifecycle_id
        `)
        .all(input.domainAuthorityId) as StoredJsonRow[])
        .map((row) => parseJson<PicoReaderCustodyReaderGrantLifecycleRecord>(row))
        .filter((record) => causes.has(record.lifecycle.lifecycleId)),
      writerGrantLifecycles: (this.db
        .prepare(`
          SELECT lifecycle_record_json AS recordJson
          FROM pico_reader_custody_writer_grant_lifecycle
          WHERE domain_authority_id = ?
          ORDER BY lifecycle_order, lifecycle_id
        `)
        .all(input.domainAuthorityId) as StoredJsonRow[])
        .map((row) => parseJson<PicoReaderCustodyWriterGrantLifecycleRecord>(row))
        .filter((record) => causes.has(record.lifecycle.lifecycleId)),
      remainingReaderGrants: this.activeReaderGrantRecords(input.domainAuthorityId, at),
    };
  }

  public readingBundleFor(input: {
    domainAuthorityId: string;
    readerIdentityKeyFingerprintHex: string;
    at?: string;
  }): {
    domain: PicoReaderCustodyDomainRecord;
    /**
     * **Fehlt beim Besitzer, und das ist kein Mangel** (2026-08-27). Wer eine
     * Domäne angelegt hat, entschlüsselt über seinen eigenen Umschlag im
     * Domänen-Datensatz; ein Leserrecht wird dabei nie angefasst. Die erste
     * Fassung dieser Methode verlangte trotzdem eines - und verweigerte damit
     * genau der Person das Bündel, die den Raum gemacht und beschrieben hat.
     */
    readerGrant?: PicoReaderCustodyReaderGrantRecord;
    writerGrants: PicoReaderCustodyWriterGrantRecord[];
    rotations: PicoReaderCustodyKekRotationRecord[];
    items: PicoReaderCustodyItemRecord[];
  } | undefined {
    const at = input.at ?? new Date().toISOString();
    const domain = this.domainRecord(input.domainAuthorityId);
    if (domain === undefined) {
      return undefined;
    }
    /**
     * Zwei Wege hinein, und der zweite ist der, den die erste Fassung vergaß:
     * ein **Leserrecht** für diese Identität, oder **die Domäne gehört ihr**.
     * Der Besitzer liest über seinen eigenen Umschlag und hat nie ein
     * Leserrecht - ihn abzuweisen hiess, der Person das Bündel zu verweigern,
     * die den Raum gemacht und beschrieben hat.
     */
    const owns = domain.domain.ownerIdentityKeyFingerprintHex
      === input.readerIdentityKeyFingerprintHex;
    const readerGrant = this.readerGrants(at).find((view) =>
      view.domainAuthorityId === input.domainAuthorityId
      && view.readerIdentityKeyFingerprintHex === input.readerIdentityKeyFingerprintHex
      && view.status === 'active');
    const readerGrantRecord = readerGrant === undefined
      ? undefined
      : this.readerGrantRecord(readerGrant.readerGrantId);
    if (!owns && readerGrantRecord === undefined) {
      return undefined;
    }
    const items = (this.db
      .prepare(`
        SELECT item_record_json AS recordJson
        FROM pico_reader_custody_item
        WHERE domain_authority_id = ?
        ORDER BY created_at, package_id
      `)
      .all(input.domainAuthorityId) as StoredJsonRow[])
      .map((row) => parseJson<PicoReaderCustodyItemRecord>(row));
    const writerGrants = this.writerGrants(at)
      .filter((view) => view.domainAuthorityId === input.domainAuthorityId)
      .flatMap((view) => {
        const record = this.writerGrantRecord(view.writerGrantId);
        return record === undefined ? [] : [record];
      });
    return {
      domain,
      ...(readerGrantRecord === undefined ? {} : { readerGrant: readerGrantRecord }),
      writerGrants,
      rotations: (this.db
        .prepare(`
          SELECT rotation_record_json AS recordJson
          FROM pico_reader_custody_kek_rotation
          WHERE domain_authority_id = ?
          ORDER BY kek_version, rotation_id
        `)
        .all(input.domainAuthorityId) as StoredJsonRow[])
        .map((row) => parseJson<PicoReaderCustodyKekRotationRecord>(row)),
      items,
    };
  }

  private domainRecord(
    domainAuthorityId: string,
  ): PicoReaderCustodyDomainRecord | undefined {
    const row = this.db
      .prepare(`
        SELECT domain_record_json AS recordJson
        FROM pico_reader_custody_domain
        WHERE domain_authority_id = ?
      `)
      .get(domainAuthorityId) as StoredJsonRow | undefined;
    return row === undefined
      ? undefined
      : parseJson<PicoReaderCustodyDomainRecord>(row);
  }

  private readerGrantRecord(
    readerGrantId: string,
  ): PicoReaderCustodyReaderGrantRecord | undefined {
    const row = this.db
      .prepare(`
        SELECT reader_grant_record_json AS recordJson
        FROM pico_reader_custody_reader_grant
        WHERE reader_grant_id = ?
      `)
      .get(readerGrantId) as StoredJsonRow | undefined;
    return row === undefined
      ? undefined
      : parseJson<PicoReaderCustodyReaderGrantRecord>(row);
  }

  private readerGrantLifecycleRecord(
    lifecycleId: string,
  ): PicoReaderCustodyReaderGrantLifecycleRecord | undefined {
    const row = this.db
      .prepare(`
        SELECT lifecycle_record_json AS recordJson
        FROM pico_reader_custody_reader_grant_lifecycle
        WHERE lifecycle_id = ?
      `)
      .get(lifecycleId) as StoredJsonRow | undefined;
    return row === undefined
      ? undefined
      : parseJson<PicoReaderCustodyReaderGrantLifecycleRecord>(row);
  }

  private writerGrantRecord(
    writerGrantId: string,
  ): PicoReaderCustodyWriterGrantRecord | undefined {
    const row = this.db
      .prepare(`
        SELECT writer_grant_record_json AS recordJson
        FROM pico_reader_custody_writer_grant
        WHERE writer_grant_id = ?
      `)
      .get(writerGrantId) as StoredJsonRow | undefined;
    return row === undefined
      ? undefined
      : parseJson<PicoReaderCustodyWriterGrantRecord>(row);
  }

  private writerGrantLifecycleRecord(
    lifecycleId: string,
  ): PicoReaderCustodyWriterGrantLifecycleRecord | undefined {
    const row = this.db
      .prepare(`
        SELECT lifecycle_record_json AS recordJson
        FROM pico_reader_custody_writer_grant_lifecycle
        WHERE lifecycle_id = ?
      `)
      .get(lifecycleId) as StoredJsonRow | undefined;
    return row === undefined
      ? undefined
      : parseJson<PicoReaderCustodyWriterGrantLifecycleRecord>(row);
  }

  private itemRecord(packageId: string): PicoReaderCustodyItemRecord | undefined {
    const row = this.db
      .prepare(`
        SELECT item_record_json AS recordJson
        FROM pico_reader_custody_item
        WHERE package_id = ?
      `)
      .get(packageId) as StoredJsonRow | undefined;
    return row === undefined
      ? undefined
      : parseJson<PicoReaderCustodyItemRecord>(row);
  }

  private kekRotationRecord(
    rotationId: string,
  ): PicoReaderCustodyKekRotationRecord | undefined {
    const row = this.db
      .prepare(`
        SELECT rotation_record_json AS recordJson
        FROM pico_reader_custody_kek_rotation
        WHERE rotation_id = ?
      `)
      .get(rotationId) as StoredJsonRow | undefined;
    return row === undefined
      ? undefined
      : parseJson<PicoReaderCustodyKekRotationRecord>(row);
  }

  private dropDomain(domainAuthorityId: string): {
    domains: number;
    readerGrants: number;
    readerLifecycleRecords: number;
    writerGrants: number;
    writerLifecycleRecords: number;
    rotations: number;
    items: number;
  } {
    const items = this.db
      .prepare(`
        DELETE FROM pico_reader_custody_item WHERE domain_authority_id = ?
      `)
      .run(domainAuthorityId).changes;
    const writerLifecycleRecords = this.db
      .prepare(`
        DELETE FROM pico_reader_custody_writer_grant_lifecycle
        WHERE domain_authority_id = ?
      `)
      .run(domainAuthorityId).changes;
    const readerLifecycleRecords = this.db
      .prepare(`
        DELETE FROM pico_reader_custody_reader_grant_lifecycle
        WHERE domain_authority_id = ?
      `)
      .run(domainAuthorityId).changes;
    const readerGrants = this.db
      .prepare(`
        DELETE FROM pico_reader_custody_reader_grant
        WHERE domain_authority_id = ?
      `)
      .run(domainAuthorityId).changes;
    const rotations = this.db
      .prepare(`
        DELETE FROM pico_reader_custody_kek_rotation
        WHERE domain_authority_id = ?
      `)
      .run(domainAuthorityId).changes;
    const writerGrants = this.db
      .prepare(`
        DELETE FROM pico_reader_custody_writer_grant
        WHERE domain_authority_id = ?
      `)
      .run(domainAuthorityId).changes;
    const domains = this.db
      .prepare(`
        DELETE FROM pico_reader_custody_domain
        WHERE domain_authority_id = ?
      `)
      .run(domainAuthorityId).changes;
    return {
      domains,
      readerGrants,
      readerLifecycleRecords,
      writerGrants,
      writerLifecycleRecords,
      rotations,
      items,
    };
  }
}

interface StoredJsonRow {
  recordJson: string;
}

function domainView(
  record: PicoReaderCustodyDomainRecord,
): PicoReaderCustodyDomainView {
  return {
    domainAuthorityId: record.domain.domainAuthorityId,
    homeId: record.domain.homeId,
    hostSigningKeyFingerprintHex: record.domain.hostSigningKeyFingerprintHex,
    domainId: record.domain.domainId,
    ownerIdentityKeyFingerprintHex:
      record.domain.ownerIdentityKeyFingerprintHex,
    ownerReaderKeyFingerprintHex: record.domain.ownerReaderKeyFingerprintHex,
    kekVersion: record.domain.kekVersion,
    authorizedAt: record.domain.authorizedAt,
    lifecycleOrder: record.domain.lifecycleOrder,
    receivedAt: record.receivedAt,
  };
}

function itemView(record: PicoReaderCustodyItemRecord): PicoReaderCustodyItemView {
  return {
    packageId: record.item.packageId,
    domainAuthorityId: record.item.domainAuthorityId,
    writerGrantId: record.item.writerGrantId,
    domainId: record.item.domainId,
    memoryItemId: record.item.memoryItemId,
    contentType: record.item.contentType,
    kekVersion: record.item.kekVersion,
    writerIdentityKeyFingerprintHex:
      record.item.writerIdentityKeyFingerprintHex,
    writerDeviceSigningKeyFingerprintHex:
      record.item.writerDeviceSigningKeyFingerprintHex,
    contentCiphertextHex: record.contentCiphertextHex,
    wrappedDekHex: record.wrappedDekHex,
    // ADR 0116 W2. Reader-custody content is authored by a granted writer and
    // arrives already sealed, so the Home holds authenticity - who signed it -
    // and no evidence at all about whether it may instruct. `remote_pico` is
    // the class the ADR names for it, and it is applied uniformly rather than
    // raised when the writer happens to be the domain owner: this is a signed
    // write, never a person typing in a live session, and a wrong guess in the
    // trusting direction is the only one that costs anything.
    originClass: 'remote_pico',
    createdAt: record.item.createdAt,
    receivedAt: record.receivedAt,
  };
}

function kekRotationView(
  record: PicoReaderCustodyKekRotationRecord,
): PicoReaderCustodyKekRotationView {
  return {
    rotationId: record.rotation.rotationId,
    domainAuthorityId: record.rotation.domainAuthorityId,
    domainId: record.rotation.domainId,
    previousKekVersion: record.rotation.previousKekVersion,
    kekVersion: record.rotation.kekVersion,
    causeLifecycleIds: [...record.rotation.causeLifecycleIds].sort(),
    remainingReaderGrantIds:
      [...record.rotation.remainingReaderGrantIds].sort(),
    envelopeReaderKeyFingerprintHexes: record.envelopes
      .map((envelope) => envelope.envelope.readerKeyFingerprintHex)
      .sort(),
    rotatedAt: record.rotation.rotatedAt,
    lifecycleOrder: record.rotation.lifecycleOrder,
    receivedAt: record.receivedAt,
  };
}

function parseJson<T>(row: StoredJsonRow): T {
  return JSON.parse(row.recordJson) as T;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return new Set(left).size === left.length
    && new Set(right).size === right.length
    && JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}


function isCanonicalHex(value: string): boolean {
  return typeof value === 'string'
    && value.length >= 2
    && value.length % 2 === 0
    && /^[0-9a-f]+$/.test(value);
}

