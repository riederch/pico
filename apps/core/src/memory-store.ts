import type Database from 'better-sqlite3';
import { memoryDomainCustodyClasses } from '@pico/protocol';
import type {
  MemoryContentPosture,
  MemoryDomainCustodyClass,
  MemoryItemDeletionState,
  ReferenceTargetResolutionState,
} from '@pico/protocol';
import type { KeyEnvelopeRecord, MemoryContentCrypto } from './memory-content-crypto.js';

/**
 * Deleteable memory store skeleton (ADR 0068).
 *
 * Content lives here, not in the append-only event log. Reads and deletes are
 * scoped by privacy domain. Deleting an item removes its content and sets its
 * deletion state to `deleted`; the item row stays so the deletion is not
 * silently undone and a later tombstone event can reference it.
 *
 * This is a storage skeleton: it is not wired to any HTTP write path, has no
 * encryption or retention enforcement, and must stay development/foundation
 * data until deletion and encryption are complete.
 */
export interface MemoryItemInput {
  memoryItemId: string;
  privacyDomain: string;
  owner: string;
  controller: string;
  contentType: string;
  content: string;
  /**
   * How the content is stored. `plaintext_foundation` (default) stores the
   * content as-is; `domain_encrypted` encrypts it under the domain key and
   * requires a crypto provider (ADR 0070/0071). Omitted means foundation data.
   */
  contentPosture?: MemoryContentPosture;
  /**
   * Explicit per-domain custody class (ADR 0078 K1). Omitted means the current
   * single-host model, `host_custody`. A domain's class is fixed on first use.
   */
  domainCustodyClass?: MemoryDomainCustodyClass;
  retentionPolicyRef?: string;
  sourceRef?: string;
}

/** Why an encrypted item's content could not be returned in plaintext. */
export type MemoryContentUnavailableReason = 'key_shredded' | 'crypto_unavailable';

export interface MemoryItem {
  memoryItemId: string;
  privacyDomain: string;
  owner: string;
  controller: string;
  contentType: string;
  content?: string;
  /**
   * Set when {@link contentPosture} is `domain_encrypted` but the plaintext
   * cannot be produced: the domain was crypto-shredded (`key_shredded`) or no
   * crypto provider is attached (`crypto_unavailable`). `content` is omitted.
   */
  contentUnavailable?: MemoryContentUnavailableReason;
  retentionPolicyRef?: string;
  deletionState: MemoryItemDeletionState;
  contentPosture: MemoryContentPosture;
  keyEnvelopeRef?: string;
  sourceRef?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RetentionCandidate {
  memoryItemId: string;
  privacyDomain: string;
  retentionPolicyRef: string;
  createdAt: string;
}

export interface MemoryDomainCustodyRecord {
  privacyDomain: string;
  custodyClass: MemoryDomainCustodyClass;
  createdAt: string;
  updatedAt: string;
}

/**
 * Keyset cursor for paging a domain's content (ADR 0077 C6). Ordered by
 * `(createdAt, memoryItemId)`, mirroring the event list cursor shape.
 */
export interface MemoryContentCursor {
  createdAt: string;
  memoryItemId: string;
}

export interface MemoryItemPage {
  items: MemoryItem[];
  nextCursor: MemoryContentCursor | null;
  hasMore: boolean;
}

export type MemoryDeleteResult = 'deleted' | 'not_found' | 'already_deleted';

export type MemoryTombstoneResult = 'tombstoned' | 'not_found' | 'not_deleted';

export type MemoryEnforceTombstoneResult = 'tombstoned' | 'not_found' | 'already_tombstoned';

export class MemoryStore {
  public constructor(
    private readonly db: Database.Database,
    private readonly crypto?: MemoryContentCrypto,
  ) {}

  public create(input: MemoryItemInput): MemoryItem {
    assertMemoryItemInput(input);

    const posture: MemoryContentPosture = input.contentPosture ?? 'plaintext_foundation';
    if (posture === 'domain_encrypted' && this.crypto === undefined) {
      throw new Error('Cannot store domain_encrypted content without a crypto provider.');
    }

    const now = new Date().toISOString();
    const insert = this.db.transaction((): void => {
      const custodyClass = this.ensureDomainCustodyClass(
        input.privacyDomain,
        input.domainCustodyClass,
        now,
      );
      if (custodyClass === 'reader_custody') {
        throw new Error('Cannot store reader_custody content in the host-custody memory_item path; use the opaque reader-custody package path (ADR 0086).');
      }

      let storedContent = input.content;
      let keyEnvelopeRef: string | null = null;

      if (posture === 'domain_encrypted') {
        const encrypted = this.crypto!.encryptForWrite({
          memoryItemId: input.memoryItemId,
          privacyDomain: input.privacyDomain,
          contentType: input.contentType,
          plaintext: input.content,
          domainCustodyClass: custodyClass,
        });
        storedContent = encrypted.storedContent;
        keyEnvelopeRef = encrypted.keyEnvelopeId;
        this.insertKeyEnvelope(encrypted.envelope);
      }

      const result = this.db
        .prepare(`
          INSERT OR IGNORE INTO memory_item (
            memory_item_id,
            privacy_domain,
            owner,
            controller,
            content_type,
            content,
            retention_policy_ref,
            deletion_state,
            content_posture,
            key_envelope_ref,
            source_ref,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)
        `)
        .run(
          input.memoryItemId,
          input.privacyDomain,
          input.owner,
          input.controller,
          input.contentType,
          storedContent,
          input.retentionPolicyRef ?? null,
          posture,
          keyEnvelopeRef,
          input.sourceRef ?? null,
          now,
          now,
        );

      if (result.changes === 0) {
        throw new Error('Memory item id already exists.');
      }
    });

    insert();

    const created = this.getInDomain(input.memoryItemId, input.privacyDomain);
    if (created === undefined) {
      throw new Error('Memory item could not be read back after creation.');
    }

    return created;
  }

  public getInDomain(memoryItemId: string, privacyDomain: string): MemoryItem | undefined {
    const row = this.db
      .prepare('SELECT * FROM memory_item WHERE memory_item_id = ? AND privacy_domain = ?')
      .get(memoryItemId, privacyDomain) as MemoryItemRow | undefined;

    return row === undefined ? undefined : this.resolveContent(mapRow(row));
  }

  public getDomainCustodyClass(privacyDomain: string): MemoryDomainCustodyClass {
    assertNonEmptyString(privacyDomain, 'privacyDomain');

    const row = this.loadDomainCustodyRecord(privacyDomain);
    return row?.custodyClass ?? 'host_custody';
  }

  public recordDomainCustodyClass(
    privacyDomain: string,
    custodyClass: MemoryDomainCustodyClass,
  ): MemoryDomainCustodyRecord {
    assertNonEmptyString(privacyDomain, 'privacyDomain');
    assertMemoryDomainCustodyClass(custodyClass);

    const now = new Date().toISOString();
    this.ensureDomainCustodyClass(privacyDomain, custodyClass, now);

    const record = this.loadDomainCustodyRecord(privacyDomain);
    if (record === undefined) {
      throw new Error('Memory domain custody marker could not be read back after creation.');
    }

    return record;
  }

  /**
   * Minimal projection of active items that reference a retention policy, for
   * the retention sweep (ADR 0074). Deliberately selects no content and never
   * decrypts: retention is deletion-only and must expose nothing.
   */
  public listRetentionCandidates(): RetentionCandidate[] {
    const rows = this.db
      .prepare(`
        SELECT memory_item_id, privacy_domain, retention_policy_ref, created_at
        FROM memory_item
        WHERE deletion_state = 'active' AND retention_policy_ref IS NOT NULL
        ORDER BY created_at, memory_item_id
      `)
      .all() as { memory_item_id: string; privacy_domain: string; retention_policy_ref: string; created_at: string }[];

    return rows.map((row) => ({
      memoryItemId: row.memory_item_id,
      privacyDomain: row.privacy_domain,
      retentionPolicyRef: row.retention_policy_ref,
      createdAt: row.created_at,
    }));
  }

  public listInDomain(privacyDomain: string): MemoryItem[] {
    const rows = this.db
      .prepare(`
        SELECT * FROM memory_item
        WHERE privacy_domain = ? AND deletion_state = 'active'
        ORDER BY created_at, memory_item_id
      `)
      .all(privacyDomain) as MemoryItemRow[];

    return rows.map((row) => this.resolveContent(mapRow(row)));
  }

  /**
   * A bounded, cursor-paged page of a domain's active items with resolved
   * content (ADR 0077 Gate C read surface). Per-item decryption is CPU work, so
   * the read API pages rather than scanning a whole domain (C6). Fetches one
   * extra row to detect `hasMore` without a second query. Only active items are
   * returned; deleted and tombstoned items are not content (C5).
   */
  public listInDomainPage(
    privacyDomain: string,
    options: { limit?: number; after?: MemoryContentCursor | null } = {},
  ): MemoryItemPage {
    const limit = options.limit ?? 100;

    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error('Memory content page limit must be a positive integer.');
    }

    const after = options.after ?? null;
    const rows = (after === null
      ? this.db
          .prepare(`
            SELECT * FROM memory_item
            WHERE privacy_domain = ? AND deletion_state = 'active'
            ORDER BY created_at ASC, memory_item_id ASC
            LIMIT ?
          `)
          .all(privacyDomain, limit + 1)
      : this.db
          .prepare(`
            SELECT * FROM memory_item
            WHERE privacy_domain = ? AND deletion_state = 'active'
              AND (created_at > ? OR (created_at = ? AND memory_item_id > ?))
            ORDER BY created_at ASC, memory_item_id ASC
            LIMIT ?
          `)
          .all(privacyDomain, after.createdAt, after.createdAt, after.memoryItemId, limit + 1)
    ) as MemoryItemRow[];

    const pageRows = rows.slice(0, limit);
    const items = pageRows.map((row) => this.resolveContent(mapRow(row)));
    const last = pageRows.length === 0 ? undefined : pageRows[pageRows.length - 1];

    return {
      items,
      nextCursor: last === undefined ? null : { createdAt: last.created_at, memoryItemId: last.memory_item_id },
      hasMore: rows.length > limit,
    };
  }

  /**
   * Replaces the stored ciphertext of a `domain_encrypted` item with its
   * decrypted plaintext, or marks it unavailable when the domain was
   * crypto-shredded or no crypto provider is attached. Plaintext-foundation
   * items pass through unchanged.
   */
  private resolveContent(item: MemoryItem): MemoryItem {
    if (item.contentPosture !== 'domain_encrypted' || item.content === undefined) {
      return item;
    }

    const { content: storedContent, ...withoutContent } = item;

    if (this.crypto === undefined || item.keyEnvelopeRef === undefined) {
      return { ...withoutContent, contentUnavailable: 'crypto_unavailable' };
    }

    const envelope = this.loadKeyEnvelope(item.keyEnvelopeRef);
    if (envelope === undefined) {
      return { ...withoutContent, contentUnavailable: 'key_shredded' };
    }

    const result = this.crypto.decryptForRead({
      memoryItemId: item.memoryItemId,
      privacyDomain: item.privacyDomain,
      contentType: item.contentType,
      storedContent,
      envelope,
      domainCustodyClass: this.getDomainCustodyClass(item.privacyDomain),
    });

    if (result.status === 'key_unavailable') {
      return { ...withoutContent, contentUnavailable: 'key_shredded' };
    }

    return { ...withoutContent, content: result.plaintext };
  }

  /**
   * Crypto-shreds a domain (ADR 0072): destroys its KEK versions so every
   * `domain_encrypted` item in the domain becomes unreadable, including backup
   * copies, subject to the ADR 0033 key-handling limits. Ciphertext rows stay.
   */
  public cryptoShredDomain(privacyDomain: string): { removed: number } {
    if (this.crypto === undefined) {
      throw new Error('Cannot crypto-shred without a crypto provider.');
    }

    return this.crypto.shredDomain(privacyDomain, this.getDomainCustodyClass(privacyDomain));
  }

  public deleteInDomain(memoryItemId: string, privacyDomain: string): MemoryDeleteResult {
    const existing = this.getInDomain(memoryItemId, privacyDomain);

    if (existing === undefined) {
      return 'not_found';
    }

    if (existing.deletionState !== 'active') {
      return 'already_deleted';
    }

    this.db
      .prepare(`
        UPDATE memory_item
        SET content = NULL,
            deletion_state = 'deleted',
            updated_at = ?
        WHERE memory_item_id = ? AND privacy_domain = ?
      `)
      .run(new Date().toISOString(), memoryItemId, privacyDomain);
    this.deleteKeyEnvelope(existing.keyEnvelopeRef);

    return 'deleted';
  }

  /**
   * Marks a deleted item as tombstoned in response to a memory.tombstone event.
   * The event log is the source of truth; this store projection is best-effort,
   * so a tombstone for a missing or not-yet-deleted item is reported, not thrown.
   */
  public tombstone(memoryItemId: string, privacyDomain: string): MemoryTombstoneResult {
    const existing = this.getInDomain(memoryItemId, privacyDomain);

    if (existing === undefined) {
      return 'not_found';
    }

    if (existing.deletionState !== 'deleted') {
      return 'not_deleted';
    }

    this.db
      .prepare(`
        UPDATE memory_item
        SET deletion_state = 'tombstoned',
            updated_at = ?
        WHERE memory_item_id = ? AND privacy_domain = ?
      `)
      .run(new Date().toISOString(), memoryItemId, privacyDomain);

    return 'tombstoned';
  }

  /**
   * Enforces the terminal tombstoned state for an item that has an append-only
   * tombstone (ADR 0070 recovery direction). Unlike {@link tombstone}, this
   * forces content removal and the tombstoned state regardless of the current
   * state, so a restore that resurrected a deleted item as active is corrected.
   * Idempotent: an already-tombstoned or missing item is a reported no-op.
   */
  public enforceTombstone(memoryItemId: string, privacyDomain: string): MemoryEnforceTombstoneResult {
    const existing = this.getInDomain(memoryItemId, privacyDomain);

    if (existing === undefined) {
      return 'not_found';
    }

    if (existing.deletionState === 'tombstoned') {
      return 'already_tombstoned';
    }

    this.db
      .prepare(`
        UPDATE memory_item
        SET content = NULL,
            deletion_state = 'tombstoned',
            updated_at = ?
        WHERE memory_item_id = ? AND privacy_domain = ?
      `)
      .run(new Date().toISOString(), memoryItemId, privacyDomain);
    this.deleteKeyEnvelope(existing.keyEnvelopeRef);

    return 'tombstoned';
  }

  private insertKeyEnvelope(envelope: KeyEnvelopeRecord): void {
    this.db
      .prepare(`
        INSERT INTO memory_key_envelope (
          key_envelope_id,
          memory_item_id,
          domain_id,
          suite,
          kek_version,
          wrap_nonce,
          wrapped_dek,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        envelope.keyEnvelopeId,
        envelope.memoryItemId,
        envelope.domainId,
        envelope.suite,
        envelope.kekVersion,
        envelope.wrapNonce,
        envelope.wrappedDek,
        envelope.createdAt,
      );
  }

  private ensureDomainCustodyClass(
    privacyDomain: string,
    custodyClass: MemoryDomainCustodyClass | undefined,
    now: string,
  ): MemoryDomainCustodyClass {
    if (custodyClass !== undefined) {
      assertMemoryDomainCustodyClass(custodyClass);
    }

    const existing = this.loadDomainCustodyRecord(privacyDomain);
    if (existing !== undefined) {
      if (custodyClass !== undefined && existing.custodyClass !== custodyClass) {
        throw new Error(
          `Memory domain ${privacyDomain} already has custody class ${existing.custodyClass}; refusing to change it silently (ADR 0078 K1).`,
        );
      }

      return existing.custodyClass;
    }

    const chosenCustodyClass = custodyClass ?? 'host_custody';
    this.db
      .prepare(`
        INSERT INTO memory_domain_custody (
          privacy_domain,
          custody_class,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?)
      `)
      .run(privacyDomain, chosenCustodyClass, now, now);

    return chosenCustodyClass;
  }

  private loadDomainCustodyRecord(privacyDomain: string): MemoryDomainCustodyRecord | undefined {
    const row = this.db
      .prepare(`
        SELECT
          privacy_domain,
          custody_class,
          created_at,
          updated_at
        FROM memory_domain_custody
        WHERE privacy_domain = ?
      `)
      .get(privacyDomain) as MemoryDomainCustodyRow | undefined;

    if (row === undefined) {
      return undefined;
    }

    return {
      privacyDomain: row.privacy_domain,
      custodyClass: row.custody_class as MemoryDomainCustodyClass,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private loadKeyEnvelope(keyEnvelopeId: string): KeyEnvelopeRecord | undefined {
    const row = this.db
      .prepare('SELECT * FROM memory_key_envelope WHERE key_envelope_id = ?')
      .get(keyEnvelopeId) as KeyEnvelopeRow | undefined;

    if (row === undefined) {
      return undefined;
    }

    return {
      keyEnvelopeId: row.key_envelope_id,
      memoryItemId: row.memory_item_id,
      domainId: row.domain_id,
      suite: row.suite,
      kekVersion: row.kek_version,
      wrapNonce: row.wrap_nonce,
      wrappedDek: row.wrapped_dek,
      createdAt: row.created_at,
    };
  }

  private deleteKeyEnvelope(keyEnvelopeId: string | undefined): void {
    if (keyEnvelopeId === undefined) {
      return;
    }

    this.db.prepare('DELETE FROM memory_key_envelope WHERE key_envelope_id = ?').run(keyEnvelopeId);
  }

  /**
   * Read-time resolution of a reference target against the store (ADR 0068 /
   * ADR 0069): `resolvable` while the item is active, `deleted` after it is
   * deleted or tombstoned, `unknown` if it is not in this domain.
   */
  public resolutionState(memoryItemId: string, privacyDomain: string): ReferenceTargetResolutionState {
    const item = this.getInDomain(memoryItemId, privacyDomain);

    if (item === undefined) {
      return 'unknown';
    }

    return item.deletionState === 'active' ? 'resolvable' : 'deleted';
  }
}

interface KeyEnvelopeRow {
  key_envelope_id: string;
  memory_item_id: string;
  domain_id: string;
  suite: string;
  kek_version: number;
  wrap_nonce: string;
  wrapped_dek: string;
  created_at: string;
}

interface MemoryItemRow {
  memory_item_id: string;
  privacy_domain: string;
  owner: string;
  controller: string;
  content_type: string;
  content: string | null;
  retention_policy_ref: string | null;
  deletion_state: string;
  content_posture: string;
  key_envelope_ref: string | null;
  source_ref: string | null;
  created_at: string;
  updated_at: string;
}

interface MemoryDomainCustodyRow {
  privacy_domain: string;
  custody_class: string;
  created_at: string;
  updated_at: string;
}

function mapRow(row: MemoryItemRow): MemoryItem {
  return {
    memoryItemId: row.memory_item_id,
    privacyDomain: row.privacy_domain,
    owner: row.owner,
    controller: row.controller,
    contentType: row.content_type,
    ...(row.content === null ? {} : { content: row.content }),
    ...(row.retention_policy_ref === null ? {} : { retentionPolicyRef: row.retention_policy_ref }),
    deletionState: row.deletion_state as MemoryItemDeletionState,
    contentPosture: row.content_posture as MemoryContentPosture,
    ...(row.key_envelope_ref === null ? {} : { keyEnvelopeRef: row.key_envelope_ref }),
    ...(row.source_ref === null ? {} : { sourceRef: row.source_ref }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function assertMemoryItemInput(input: MemoryItemInput): void {
  assertNonEmptyString(input.memoryItemId, 'memoryItemId');
  assertNonEmptyString(input.privacyDomain, 'privacyDomain');
  assertNonEmptyString(input.owner, 'owner');
  assertNonEmptyString(input.controller, 'controller');
  assertNonEmptyString(input.contentType, 'contentType');
  assertNonEmptyString(input.content, 'content');

  if (input.retentionPolicyRef !== undefined) {
    assertNonEmptyString(input.retentionPolicyRef, 'retentionPolicyRef');
  }

  if (input.sourceRef !== undefined) {
    assertNonEmptyString(input.sourceRef, 'sourceRef');
  }
}

function assertMemoryDomainCustodyClass(value: unknown): asserts value is MemoryDomainCustodyClass {
  if (!memoryDomainCustodyClasses.includes(value as MemoryDomainCustodyClass)) {
    throw new Error('Memory domain custodyClass must be host_custody or reader_custody.');
  }
}

function assertNonEmptyString(value: unknown, label: string): void {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Memory item ${label} must be a non-empty string.`);
  }
}
