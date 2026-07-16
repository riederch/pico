import type { MemoryStore } from './memory-store.js';
import type { RetentionPolicyStore } from './retention-policy-store.js';

/**
 * Retention sweep (ADR 0074). Deletion-only, idempotent, batch-bounded and
 * fail-safe: it expires only items whose resolved policy is
 * `delete_after_max_age` and whose age exceeds the policy's max age, deleting
 * through the tombstoned deletion path. Anything ambiguous - no policy, an
 * unresolvable reference or an unparseable timestamp - is kept, never deleted.
 *
 * It never reads or exposes content: it works on the retention-candidate
 * projection (ids, domain, policy ref, createdAt) and removes content through
 * the existing tombstone path, so a retention deletion looks exactly like any
 * other deletion and is re-enforced after a stale restore.
 */

const MILLISECONDS_PER_DAY = 86_400_000;
const DEFAULT_MAX_DELETIONS_PER_SWEEP = 1000;

/** Appends the append-only memory.tombstone record that makes a retention deletion restore-proof. */
export type AppendRetentionTombstone = (input: {
  memoryItemId: string;
  privacyDomain: string;
  reason: string;
}) => void;

export interface RetentionSweepOptions {
  now?: () => Date;
  maxDeletionsPerSweep?: number;
}

export interface RetentionSweepResult {
  scanned: number;
  expired: number;
  kept: number;
  /** Candidates kept because their policy was missing, unresolvable or malformed (fail-safe). */
  unresolved: number;
}

export class RetentionSweeper {
  public constructor(
    private readonly memory: MemoryStore,
    private readonly policies: RetentionPolicyStore,
    private readonly appendTombstone: AppendRetentionTombstone,
    private readonly options: RetentionSweepOptions = {},
  ) {}

  public sweep(): RetentionSweepResult {
    const now = (this.options.now ?? (() => new Date()))().getTime();
    const cap = this.options.maxDeletionsPerSweep ?? DEFAULT_MAX_DELETIONS_PER_SWEEP;
    const candidates = this.memory.listRetentionCandidates();

    let expired = 0;
    let kept = 0;
    let unresolved = 0;

    for (const candidate of candidates) {
      const policy = this.policies.get(candidate.retentionPolicyRef);

      // Fail-safe: a missing or unresolvable policy never deletes.
      if (policy === undefined) {
        unresolved += 1;
        continue;
      }

      if (policy.mode !== 'delete_after_max_age' || policy.maxAgeDays === undefined) {
        kept += 1;
        continue;
      }

      const createdAt = new Date(candidate.createdAt).getTime();
      if (Number.isNaN(createdAt)) {
        unresolved += 1;
        continue;
      }

      const expiresAt = createdAt + policy.maxAgeDays * MILLISECONDS_PER_DAY;
      if (now <= expiresAt) {
        kept += 1;
        continue;
      }

      if (expired >= cap) {
        // Batch-bounded: leave the rest for the next sweep.
        kept += 1;
        continue;
      }

      // Record first, then enforce: if enforcement is interrupted, the
      // append-only tombstone re-enforces the deletion on the next open.
      this.appendTombstone({
        memoryItemId: candidate.memoryItemId,
        privacyDomain: candidate.privacyDomain,
        reason: `retention:${policy.retentionPolicyId}`,
      });
      this.memory.enforceTombstone(candidate.memoryItemId, candidate.privacyDomain);
      expired += 1;
    }

    return { scanned: candidates.length, expired, kept, unresolved };
  }
}
