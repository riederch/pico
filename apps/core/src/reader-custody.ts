import type Database from 'better-sqlite3';
import {
  buildPicoReaderCustodyDomainSignatureInput,
  buildPicoReaderCustodyItemSignatureInput,
  buildPicoReaderCustodyWriterGrantLifecycleSignatureInput,
  buildPicoReaderCustodyWriterGrantSignatureInput,
  buildPicoShareEnvelopeSignatureInput,
  picoIdentitySuite,
  picoMemoryContentSuite,
  picoReaderCustodyDomainRecordSchema,
  picoReaderCustodyItemRecordSchema,
  picoReaderCustodyWriterGrantLifecycleRecordSchema,
  picoReaderCustodyWriterGrantRecordSchema,
  picoShareEnvelopeRecordSchema,
  picoShareSuite,
} from '@pico/protocol';
import type {
  PicoHomeFoundingRecord,
  PicoReaderCustodyDomainRecord,
  PicoReaderCustodyItemRecord,
  PicoReaderCustodyWriterGrantLifecycleRecord,
  PicoReaderCustodyWriterGrantRecord,
} from '@pico/protocol';
import {
  verifyPicoIdentityDetachedSignature,
  verifyPicoIdentityKeyRecordFingerprint,
} from '@pico/identity';
import type { IdentityVerificationSodium } from '@pico/identity';

export interface ReaderCustodyAuthoritySource {
  foundingRecord(): PicoHomeFoundingRecord | undefined;
  hasActiveMembership(
    picoIdentityFingerprintHex: string,
    homeId: string,
    at: string,
  ): boolean;
}

export interface PicoReaderCustodyDomainView {
  domainAuthorityId: string;
  homeId: string;
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
  status: 'active' | 'not_yet_valid' | 'expired' | 'revoked';
  validFrom: string;
  validUntil: string;
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
  createdAt: string;
  receivedAt: string;
}

export type ReaderCustodyFailureReason =
  | 'no_founding_record'
  | 'wrong_home'
  | 'owner_is_not_active_member'
  | 'writer_is_not_active_member'
  | 'unknown_domain'
  | 'unknown_writer_grant'
  | 'inactive_writer_grant'
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
  droppedWriterGrants: number;
  droppedWriterLifecycleRecords: number;
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
    let droppedWriterGrants = 0;
    let droppedWriterLifecycleRecords = 0;
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
        droppedWriterGrants += removed.writerGrants;
        droppedWriterLifecycleRecords += removed.writerLifecycleRecords;
        droppedItems += removed.items;
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
      droppedWriterGrants,
      droppedWriterLifecycleRecords,
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
      ]);
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
          !== founding.founding.hostSigningKeyFingerprintHex) {
        return 'wrong_home';
      }
      buildPicoReaderCustodyDomainSignatureInput(domain);
      if (!isCanonicalInstant(record.receivedAt)
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
        || !isCanonicalInstant(ownerEnvelope.createdAt)
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
      ]);
      const domain = domainRecord.domain;
      const grant = record.grant;
      return record.schema === picoReaderCustodyWriterGrantRecordSchema
        && grant.suite === picoMemoryContentSuite
        && grant.domainAuthorityId === domain.domainAuthorityId
        && grant.homeId === domain.homeId
        && grant.hostSigningKeyFingerprintHex
          === domain.hostSigningKeyFingerprintHex
        && grant.domainId === domain.domainId
        && grant.kekVersion === domain.kekVersion
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
        && isCanonicalInstant(record.receivedAt)
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
      ]);
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
        && isCanonicalInstant(record.receivedAt)
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
      ]);
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
        || item.kekVersion !== domain.kekVersion
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
        || !isCanonicalInstant(record.receivedAt)
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
        WHERE writer_grant_id = ?
        ORDER BY lifecycle_order DESC, lifecycle_id DESC
        LIMIT 1
      `)
      .get(grant.writerGrantId) as StoredJsonRow | undefined;
    let status: PicoReaderCustodyWriterGrantView['status'];
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

  private dropDomain(domainAuthorityId: string): {
    domains: number;
    writerGrants: number;
    writerLifecycleRecords: number;
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
    return { domains, writerGrants, writerLifecycleRecords, items };
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
    createdAt: record.item.createdAt,
    receivedAt: record.receivedAt,
  };
}

function parseJson<T>(row: StoredJsonRow): T {
  return JSON.parse(row.recordJson) as T;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertExactKeys(
  record: Record<string, unknown>,
  expectedKeys: readonly string[],
): void {
  const expected = new Set(expectedKeys);
  if (Object.keys(record).some((key) => !expected.has(key))
    || expectedKeys.some((key) => !(key in record))) {
    throw new Error('invalid_record_shape');
  }
}

function isCanonicalHex(value: string): boolean {
  return typeof value === 'string'
    && value.length >= 2
    && value.length % 2 === 0
    && /^[0-9a-f]+$/.test(value);
}

function isCanonicalInstant(value: string): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}
