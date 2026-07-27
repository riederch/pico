# 0091 - Bounded Reader-Sync Run and Cursor Reconciliation

## Status

Accepted and implemented as the explicitly invoked orchestration slice joining
the ADR 0089 batch source to the ADR 0090 durable Reader client. It is a
bounded library primitive, not a background scheduler, deployable network
client or synchronization-completeness claim.

## Context

ADR 0090 made one verified Reader batch durable before exposing its projection,
but left page traversal, cursor persistence, retries and consumer handoff to
callers. A naive loop can still:

- persist a page cursor before every batch is verified;
- advance the signed floor again before the previous projection is durably
  accepted downstream;
- become stuck when a crash leaves the cursor behind the signed floor;
- treat an empty untrusted Relay page as proof that synchronization is
  complete;
- run without work bounds or allow two loops to use the same client instance.

The cursor remains an operational hint. The signed manifest chain and durable
floor remain the only progress authority.

## Decision

### Strict page boundary

`PicoReaderCustodySyncBatchSource` validates the opaque transport result before
parsing batches:

- the requested page size is 1–100 records;
- record ids and cursors are unique within a page;
- every opaque record is bounded, has a canonical expiry and printable bounded
  cursor;
- a nonempty page has exactly the last record cursor as `nextCursor`;
- an empty page has no cursor and cannot claim `hasMore`;
- a page cannot return the same cursor it was asked to continue after;
- the sealed wrapper id, expiry and pinned opaque route match the transport
  record and query.

These checks do not make the transport authoritative. They reject malformed or
stalled adapters before their bytes enter the Reader client.

### Explicit bounded run

`PicoReaderCustodySyncRunner.run` is started by an explicit caller with an
`AbortSignal`. Defaults are 20 batches per page, at most 10 pages and at most
200 batches. Public hard ceilings are 100 pages and 1,000 batches.

The runner:

1. loads the durable untrusted cursor, if any;
2. reads one bounded page for the client's pinned route;
3. applies batches in returned order through the ADR 0090 client without
   changing the page cursor;
4. waits for the required projection consumer after each successful durable
   floor commit;
5. only after every batch on the page is handled commits `nextCursor`;
6. stops when the source is drained or either run limit is reached.

`source_drained` means only that this adapter returned no further records at
the supplied evaluation instant. It is not proof of global completeness,
freshness, consistency or Relay honesty.

The caller supplies one canonical evaluation instant for the bounded run. A
deployment must obtain it from its trusted local clock. Expiry remains
fail-closed in Vault/projector verification.

### Projection delivery and restart

The projection consumer runs only after the corresponding signed floor is
durable and before the runner attempts the next sequence. It must complete only
after its downstream effect is durably accepted.

Delivery is at least once. If the process stops after the floor commit, during
the consumer or before the page-cursor commit, restart reads from the older
cursor:

- fully verified manifests below the durable floor are counted as obsolete and
  skipped without exposing their projections;
- the exact current manifest is verified and delivered again;
- only after that acknowledgement may the next manifest advance the floor.

The consumer must therefore be idempotent by a stable signed identifier such as
manifest digest, sync batch id or item/envelope reference. An exception from
the consumer stops the run and preserves the old page cursor.

An unacknowledged exact batch that expires during a long outage cannot be
re-exposed from the Relay and fails closed. A later contiguous full-evidence
batch may restore liveness, but this ADR does not claim a durable local payload
inbox or guarantee that every earlier item is repeated. Such an inbox is a
separate future storage decision.

### Failure and retry contract

An authenticated rollback below the current floor is an obsolete transport
replay during cursor reconciliation and is skipped without state regression or
consumer delivery. Exact replay is delivered at least once. Gap, fork, expiry,
wrong scope or invalid payload stops with a typed result and does not commit
the current page cursor.

Transport, Vault-open, state-store and consumer failures propagate as errors.
Abort is checked before reads, before every apply and after every consumer.
Already committed floors and acknowledged consumers remain valid; the page
cursor stays at the last completely handled page so an explicit later run can
reconcile by replay.

One `PicoReaderCustodySyncRunner` instance rejects overlapping runs. As in ADR
0090, this is not a cross-process lock; deployment owns single-process and
single-writer coordination.

## Gates

- **S11.1 — strict source pages: Done.** Limits, cursor continuity, wrapper
  scope and duplicate/stall cases fail before batch projection.
- **S11.2 — bounded explicit orchestration: Done.** Page/batch ceilings,
  source-drained versus limit-reached results and Abort are implemented.
- **S11.3 — ordered durable delivery: Done.** Floor commit precedes consumer
  delivery; consumer acknowledgement precedes the next floor and page cursor.
- **S11.4 — cursor reconciliation: Done.** Obsolete lower batches are skipped,
  exact current replay is redelivered and the page cursor advances only after
  the complete page.
- **S11.5 — failure and restart coverage: Done.** Empty and multiple pages,
  limits, stale cursor, duplicates, gap, fork, expiry, Vault/consumer failure,
  mid-page crash, Abort and overlapping runs are test-bound.
- **S11.6 — honest scope: Done.** No completeness, background automation,
  durable payload inbox, public Relay or Pico Link compatibility is claimed.

## Consequences

Positive:

- callers no longer need to invent page/floor/cursor commit ordering;
- a mid-page crash safely converges through verified obsolete skips and exact
  at-least-once delivery;
- the work performed by one invocation is explicitly bounded and abortable;
- malformed adapter pagination cannot silently skip a partially handled page.

Negative and residual:

- consumers must provide durable idempotency;
- a separate runner instance or process can still race unless deployment
  enforces the ADR 0090 single-writer contract;
- long-outage expiry can lose availability for an unacknowledged exact payload
  because no local durable payload inbox exists;
- transport omission and an empty page remain indistinguishable.

## Non-goals

- automatic polling, retries, scheduling or rotation execution;
- public Relay, Registry or Foundation Reader-download endpoints;
- network transport selection or final Pico Link wire semantics;
- durable local storage of sealed batches or decrypted projection payloads;
- automatic KEK unwrap, item decryption or non-idempotent side effects;
- Vault daemon/IPC, platform keystore, recovery or companion UX.

## References

- [ADR 0033](0033-key-lifecycle-rotation-revocation-and-recovery.md)
- [ADR 0078](0078-memory-domain-reader-membership-and-key-distribution-threat-model-and-direction.md)
- [ADR 0088](0088-reader-custody-multi-reader-and-kek-rotation.md)
- [ADR 0089](0089-authenticated-checkpoint-and-reader-custody-sync.md)
- [ADR 0090](0090-durable-reader-sync-floor-and-crash-safe-apply.md)
