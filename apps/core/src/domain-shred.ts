import type { MemoryStore } from './memory-store.js';

/**
 * Domain crypto-shred with a durable audit record (ADR 0071 step 4).
 *
 * Destroying a domain's KEK versions is the irreversible act (ADR 0072); this
 * wrapper performs the shred and then appends an append-only
 * `memory.domain_shredded` audit event so the decision is durably recorded in
 * ADR 0037 style: which domain, how many key versions were destroyed and an
 * optional reason - never content or key material. The KEK destruction happens
 * first so the recorded version count is accurate; the audit event is written
 * immediately after into the append-only log.
 *
 * The HTTP trigger lives behind ADR 0075 Gate B: `POST
 * /api/memory/domains/:privacyDomain/shred` carries the
 * `host-admin-destructive` class, so it needs an operator session *and* a
 * confirmation naming the exact domain. This function stays free of HTTP
 * concerns so the operation can also be driven programmatically.
 */

export type AppendShredAudit = (input: {
  privacyDomain: string;
  removedKeyVersions: number;
  reason?: string;
}) => void;

export interface ShredDomainInput {
  privacyDomain: string;
  reason?: string;
}

/**
 * ADR 0129 SR2. The observation buffer, which the shred must also reach.
 *
 * A port rather than a second call site, because "shred a domain" is one act
 * and a cascade with two entry points is a cascade someone forgets half of.
 * The buffer carries no key envelope, so the rows are deleted: for data
 * designed not to outlive its window that is stronger than making it
 * unreadable, since nothing survives to be decrypted later.
 */
export type DeleteDomainObservations = (privacyDomain: string) => number;

export function shredDomainWithAudit(
  memory: MemoryStore,
  appendAudit: AppendShredAudit,
  input: ShredDomainInput,
  deleteObservations?: DeleteDomainObservations,
): { removedKeyVersions: number; removedObservations: number } {
  const { removed } = memory.cryptoShredDomain(input.privacyDomain);
  // After the keys, so a failure between the two leaves readings whose domain
  // key is already gone rather than keys for readings that are already gone.
  // Both are bad; only one of them is recoverable by running the shred again.
  const removedObservations = deleteObservations?.(input.privacyDomain) ?? 0;

  appendAudit({
    privacyDomain: input.privacyDomain,
    removedKeyVersions: removed,
    ...(input.reason === undefined ? {} : { reason: input.reason }),
  });

  return { removedKeyVersions: removed, removedObservations };
}
