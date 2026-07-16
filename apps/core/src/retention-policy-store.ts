import type Database from 'better-sqlite3';
import type { MemoryRetentionMode } from '@pico/protocol';

/**
 * Named, editable retention policies (ADR 0074). A memory item references a
 * policy through its `retentionPolicyRef`; the retention sweep resolves the
 * effective policy at evaluation time, so editing a policy changes the expiry
 * of every item that references it. A missing or unresolvable policy never
 * deletes (fail-safe keep, enforced by the sweep). This store performs CRUD and
 * validation only; it applies no deletion itself.
 */

export interface RetentionPolicyInput {
  retentionPolicyId: string;
  displayName: string;
  mode: MemoryRetentionMode;
  /** Required whole-day maximum age for `delete_after_max_age`; forbidden otherwise. */
  maxAgeDays?: number;
}

export interface RetentionPolicy {
  retentionPolicyId: string;
  displayName: string;
  mode: MemoryRetentionMode;
  maxAgeDays?: number;
  createdAt: string;
  updatedAt: string;
}

export type RetentionPolicyUpdate = Partial<Pick<RetentionPolicyInput, 'displayName' | 'mode' | 'maxAgeDays'>>;

export class RetentionPolicyStore {
  public constructor(private readonly db: Database.Database) {}

  public create(input: RetentionPolicyInput): RetentionPolicy {
    assertPolicyShape(input.retentionPolicyId, input.displayName, input.mode, input.maxAgeDays);

    const now = new Date().toISOString();
    const result = this.db
      .prepare(`
        INSERT OR IGNORE INTO memory_retention_policy (
          retention_policy_id,
          display_name,
          mode,
          max_age_days,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(input.retentionPolicyId, input.displayName, input.mode, input.maxAgeDays ?? null, now, now);

    if (result.changes === 0) {
      throw new Error('Retention policy id already exists.');
    }

    return this.getOrThrow(input.retentionPolicyId);
  }

  public get(retentionPolicyId: string): RetentionPolicy | undefined {
    const row = this.db
      .prepare('SELECT * FROM memory_retention_policy WHERE retention_policy_id = ?')
      .get(retentionPolicyId) as RetentionPolicyRow | undefined;

    return row === undefined ? undefined : mapRow(row);
  }

  public list(): RetentionPolicy[] {
    const rows = this.db
      .prepare('SELECT * FROM memory_retention_policy ORDER BY created_at, retention_policy_id')
      .all() as RetentionPolicyRow[];

    return rows.map(mapRow);
  }

  /** Edits a policy in place; changed retention takes effect at the next sweep. */
  public update(retentionPolicyId: string, update: RetentionPolicyUpdate): RetentionPolicy {
    const existing = this.get(retentionPolicyId);
    if (existing === undefined) {
      throw new Error('Retention policy not found.');
    }

    const displayName = update.displayName ?? existing.displayName;
    const mode = update.mode ?? existing.mode;
    // When switching to keep_until_deleted, max age is dropped unless explicitly set.
    const maxAgeDays = 'maxAgeDays' in update
      ? update.maxAgeDays
      : (mode === existing.mode ? existing.maxAgeDays : undefined);

    assertPolicyShape(retentionPolicyId, displayName, mode, maxAgeDays);

    this.db
      .prepare(`
        UPDATE memory_retention_policy
        SET display_name = ?, mode = ?, max_age_days = ?, updated_at = ?
        WHERE retention_policy_id = ?
      `)
      .run(displayName, mode, maxAgeDays ?? null, new Date().toISOString(), retentionPolicyId);

    return this.getOrThrow(retentionPolicyId);
  }

  /** Revokes a policy. Items still referencing it fall back to fail-safe keep. */
  public delete(retentionPolicyId: string): 'deleted' | 'not_found' {
    const result = this.db
      .prepare('DELETE FROM memory_retention_policy WHERE retention_policy_id = ?')
      .run(retentionPolicyId);

    return result.changes === 0 ? 'not_found' : 'deleted';
  }

  private getOrThrow(retentionPolicyId: string): RetentionPolicy {
    const policy = this.get(retentionPolicyId);
    if (policy === undefined) {
      throw new Error('Retention policy could not be read back.');
    }

    return policy;
  }
}

interface RetentionPolicyRow {
  retention_policy_id: string;
  display_name: string;
  mode: string;
  max_age_days: number | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: RetentionPolicyRow): RetentionPolicy {
  return {
    retentionPolicyId: row.retention_policy_id,
    displayName: row.display_name,
    mode: row.mode as MemoryRetentionMode,
    ...(row.max_age_days === null ? {} : { maxAgeDays: row.max_age_days }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function assertPolicyShape(
  retentionPolicyId: string,
  displayName: string,
  mode: MemoryRetentionMode,
  maxAgeDays: number | undefined,
): void {
  if (typeof retentionPolicyId !== 'string' || retentionPolicyId.trim() === '') {
    throw new Error('Retention policy id must be a non-empty string.');
  }
  if (typeof displayName !== 'string' || displayName.trim() === '') {
    throw new Error('Retention policy displayName must be a non-empty string.');
  }
  if (mode !== 'keep_until_deleted' && mode !== 'delete_after_max_age') {
    throw new Error('Retention policy mode must be keep_until_deleted or delete_after_max_age.');
  }

  if (mode === 'delete_after_max_age') {
    if (maxAgeDays === undefined) {
      throw new Error('Retention policy delete_after_max_age requires maxAgeDays.');
    }
    if (!Number.isInteger(maxAgeDays) || maxAgeDays < 1) {
      throw new Error('Retention policy maxAgeDays must be a positive whole number of days.');
    }
  } else if (maxAgeDays !== undefined) {
    throw new Error('Retention policy keep_until_deleted must not set maxAgeDays.');
  }
}
