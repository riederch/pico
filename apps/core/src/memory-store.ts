import type Database from 'better-sqlite3';
import type { MemoryItemDeletionState } from '@pico/protocol';

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
  retentionPolicyRef?: string;
  sourceRef?: string;
}

export interface MemoryItem {
  memoryItemId: string;
  privacyDomain: string;
  owner: string;
  controller: string;
  contentType: string;
  content?: string;
  retentionPolicyRef?: string;
  deletionState: MemoryItemDeletionState;
  sourceRef?: string;
  createdAt: string;
  updatedAt: string;
}

export type MemoryDeleteResult = 'deleted' | 'not_found' | 'already_deleted';

export class MemoryStore {
  public constructor(private readonly db: Database.Database) {}

  public create(input: MemoryItemInput): MemoryItem {
    assertMemoryItemInput(input);

    const now = new Date().toISOString();
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
          source_ref,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
      `)
      .run(
        input.memoryItemId,
        input.privacyDomain,
        input.owner,
        input.controller,
        input.contentType,
        input.content,
        input.retentionPolicyRef ?? null,
        input.sourceRef ?? null,
        now,
        now,
      );

    if (result.changes === 0) {
      throw new Error('Memory item id already exists.');
    }

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

    return row === undefined ? undefined : mapRow(row);
  }

  public listInDomain(privacyDomain: string): MemoryItem[] {
    const rows = this.db
      .prepare(`
        SELECT * FROM memory_item
        WHERE privacy_domain = ? AND deletion_state = 'active'
        ORDER BY created_at, memory_item_id
      `)
      .all(privacyDomain) as MemoryItemRow[];

    return rows.map(mapRow);
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

    return 'deleted';
  }
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
  source_ref: string | null;
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

function assertNonEmptyString(value: unknown, label: string): void {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Memory item ${label} must be a non-empty string.`);
  }
}
