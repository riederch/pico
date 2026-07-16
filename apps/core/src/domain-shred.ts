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
 * There is deliberately no HTTP trigger: crypto-shred is a privileged
 * operation that must wait for an authenticated admin surface. This is a
 * programmatic capability, like `MemoryStore.cryptoShredDomain` itself.
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

export function shredDomainWithAudit(
  memory: MemoryStore,
  appendAudit: AppendShredAudit,
  input: ShredDomainInput,
): { removedKeyVersions: number } {
  const { removed } = memory.cryptoShredDomain(input.privacyDomain);

  appendAudit({
    privacyDomain: input.privacyDomain,
    removedKeyVersions: removed,
    ...(input.reason === undefined ? {} : { reason: input.reason }),
  });

  return { removedKeyVersions: removed };
}
