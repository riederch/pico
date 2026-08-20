# 0089 - Authenticated Checkpoint and Reader-Custody Sync

## Status

Accepted and implemented as the narrow transport/projection slice connecting
ADRs 0085 and 0088. It defines deployment adapters and a reference in-memory
transport, not a public Relay service or final Pico Link wire protocol.

## Context

ADR 0085 made reader-key freshness authoritative only when an exact,
identity-root-signed checkpoint is available. ADR 0088 made reader-custody
evidence and KEK envelopes owner-authoritative, but left them on the owner's
side. Foundation lists are deliberately not reader downloads.

A transport cannot safely fill either gap by becoming an Identity, Membership
or Domain authority. A reader also cannot trust a relay cursor as a rollback
floor: a relay may omit, replay, reorder or substitute bytes.

## Decision

### Authority and adapter boundaries

`@pico/sync` defines one byte-oriented transport interface. A deployment
adapter sees:

- an opaque, random `routeRef`;
- an opaque object id and cursor;
- byte length, expiry and ciphertext or signed checkpoint bytes.

It does not decide Identity, Membership, reader eligibility, Domain authority,
KEK versions or item validity. The in-memory implementation is a reference and
test adapter only.

An owner Identity Vault constructs the complete ADR 0085 checkpoint and signs
it with `pico_identity`. The Sync checkpoint source maps a full local query to
an out-of-band route and returns the record to Core. Core still checks the
identity-root signature, exact Home/identity/device/delegation binding,
five-minute window and anti-rollback floor on every lookup. Checkpoints are
signed public metadata, not confidentiality-protected payloads; an adapter that
requires relationship-metadata confidentiality must add a deployment-specific
protected channel without changing checkpoint authority.

Reader-custody batches take the stricter path:

```text
Owner Vault
  -> validate complete domain/grant/lifecycle/rotation/writer/item evidence
  -> owner-sign exact manifest and evidence digest
  -> seal full payload to the one target X25519 reader key
  -> publish { opaque route, batch id, sealed bytes, digest, expiry }

Reader
  -> retrieve opaque batch
  -> Vault opens only with the addressed reader key
  -> verify manifest signature and complete evidence digest
  -> Sync projects all authority, scope, lifecycle and version evidence
  -> only then may Vault unwrap a KEK envelope or decrypt an item
```

The relay-visible record contains no Home id, Pico identity, Domain id, grant,
key fingerprint, content metadata or plaintext. Route references use
`route_` plus 32–128 URL-safe random characters and are provisioned out of
band. Their opacity, not the cursor, is the privacy boundary.

### Signed manifest and evidence completeness

The owner-signed `pico.mem.reader-sync-manifest.v1` binds:

- opaque route and batch id;
- exact Home, host, Domain and owner;
- exact reader grant and X25519 reader key;
- positive sequence and predecessor manifest digest;
- digest of the complete evidence set;
- highest contiguous KEK version and lifecycle order;
- creation and expiry instants.

Each evidence reference binds a family, stable record id and BLAKE2b-256 digest
of the complete recursively key-sorted JSON record. Reference order is sorted
by family and id; duplicates fail. Array order remains significant.

Vault refuses to emit a batch whose rotation cause ids do not exactly match the
included, verified reader/writer lifecycle evidence between adjacent rotation
floors. The reader independently repeats that check. A rotation with an
unknown, omitted, duplicated or out-of-order cause therefore fails before any
KEK unwrap.

### Reader projection and rollback

The reader pins route, Home, host key, Domain, owner identity, reader identity,
grant and reader key out of band. Sync then verifies:

- owner, writer and envelope signatures plus key fingerprints;
- every Domain/grant/lifecycle/item field and ciphertext digest;
- exact reader envelope history;
- contiguous KEK rotations, exact cause sets and exact remaining-reader
  envelope sets;
- item writer validity and availability of the required reader KEK version;
- the manifest lifecycle and KEK maxima.

The locally retained signed-manifest floor is authoritative for sequence
progress. Exact replay is idempotent. A lower sequence is rollback; a skipped
sequence is a gap; the same sequence with different signed bytes or a wrong
predecessor is a fork. Relay cursors remain operational pagination hints only.
Expiry is exact with no stale-while-error grace.

Reader revocation can be projected before the next rotation. Once a rotation
arrives, the removed reader must be absent from its remaining-reader set and
receives no new KEK envelope. Previously received versions remain readable, as
stated by ADR 0088.

### Canonical sync-manifest vector

The authoritative positive and negative fixtures live under
`docs/protocol/fixtures/reader-custody/`.

The positive manifest vector is 502 bytes:

```text
000000207069636f2e6d656d2e7265616465722d73796e632d6d616e69666573742e7631000000117069636f2e73756974652e6d656d2e76310000001873796e635f62617463685f32303236303732375f3030303100000036726f7574655f414141414141414141414141414141414141414141414141414141414141414141414141414141414141414141414141000000137263646f6d5f32303236303732375f3030303100000012686f6d655f32303236303731385f303030310000002011111111111111111111111111111111111111111111111111111111111111110000000e646f6d61696e2d6a6f75726e616c0000002022222222222222222222222222222222222222222222222222222222222222220000001672637265616465725f32303236303732375f3030303100000020666666666666666666666666666666666666666666666666666666666666666600000001310000002000000000000000000000000000000000000000000000000000000000000000000000002077777777777777777777777777777777777777777777777777777777777777770000000131000000147365713a3030303030303030303030303030303300000018323032362d30372d32375431303a31303a30302e3030305a00000018323032362d30372d32375431313a30303a30302e3030305a
```

## Gates

- **S9.1 — canonical authority: Done.** Versioned manifest, full-record and
  evidence-digest constructions plus positive/negative vectors.
- **S9.2 — authenticated freshness adapter: Done.** Vault publisher, opaque
  route adapter and unchanged Core verification authority.
- **S9.3 — reader-addressed confidentiality: Done.** Full evidence is sealed
  to one exact reader; the transport wrapper leaks no protected metadata.
- **S9.4 — full projection: Done.** Signatures, pins, digests, lifecycle,
  complete rotation causes, envelope sets, writers and items fail closed.
- **S9.5 — replay and revocation safety: Done.** Idempotent replay,
  rollback/gap/fork rejection, persisted-floor restore input, expiry and
  revocation-during-sync tests.
  **Expiry was fail-open for one shape of instant, found 2026-08-20.** The
  comparison is a string comparison — which the protocol pins to one
  fixed-width UTC form precisely because every consumer compares these that
  way. `@pico/vault` carried a second spelling of "is this a canonical
  instant" that checked only whether the value round-tripped through
  `toISOString`, and the extended-year form does:
  `+275760-09-13T00:00:00.000Z` is a real `Date` and re-serializes to itself.
  But `+` is 0x2B, below every digit, so as a string the farthest future a
  `Date` can hold sorts *before* every ordinary year — an `evaluatedAt` in
  that form reads as earlier than any `expiresAt`, and an otherwise valid
  expired batch opens. The rule is the protocol's own now (`isPicoInstant`),
  asked rather than restated, and the test lives on a real sealed batch in
  `@pico/sync` so that removing the fix opens it again rather than merely
  changing an error string.

  Counting the copies afterwards found **nine**, not two: four more in the
  Foundation and four in the protocol's own parsers, standing beside the
  correct rule in the same package. `@pico/core`'s freshness check is the
  second reachable one - it compares `checkedAt`, `freshUntil` and the
  evaluation instant as strings, so a `checkedAt` in the extended-year form
  computes a negative window, the ADR 0085 max-freshness bound never fires,
  and a checkpoint the policy forbids is accepted. All nine are one rule now,
  in `@pico/protocol/instant`, and `check-instant-rules.mjs` refuses the
  tenth.

- **S9.6 — bounded scope: Done.** No new Foundation endpoint, database table or
  migration; no draft Pico Link packet promoted into runtime.

## Consequences

Positive:

- a deployment can supply real ADR 0085 freshness without granting the
  transport Identity authority;
- Reader evidence is confidential from the relay and cryptographically
  complete before key use;
- relay omission, replay and reordering cannot silently lower local authority;
- the implementation reuses existing Vault, Protocol, Identity and Sync
  boundaries without another storage migration.

Negative and residual:

- random routes must be securely provisioned and rotated by a future product
  ceremony;
- clients must use the ADR 0090 durable apply boundary, or an equivalent
  platform store, before using newly projected envelope/item references;
- checkpoint contents are authenticated but not encrypted by this generic
  adapter;
- no network transport, public Relay, automatic scheduler or production
  checkpoint publisher process is included;
- a revoked reader retains every KEK version already received.

## Non-goals

- final Pico Link/Pico Home Link packet formats or compatibility claims;
- a public relay server or Foundation reader-download endpoint;
- automatic background sync/rotation execution;
- delegated Domain controllers or group/threshold authority;
- Vault daemon/IPC, platform keystore, approvals, recovery or companion UX;
- retroactive revocation or re-encryption of historical content.

## References

- [ADR 0031](0031-pico-link-identity-relay-and-domain-threat-model.md)
- [ADR 0033](0033-key-lifecycle-rotation-revocation-and-recovery.md)
- [ADR 0078](0078-memory-domain-reader-membership-and-key-distribution-threat-model-and-direction.md)
- [ADR 0081](0081-pico-vault-person-role-key-custody-threat-model-and-direction.md)
- [ADR 0083](0083-reader-key-registration-and-freshness-contract.md)
- [ADR 0085](0085-authenticated-reader-key-freshness-checkpoints.md)
- [ADR 0088](0088-reader-custody-multi-reader-and-kek-rotation.md)
- [ADR 0090](0090-durable-reader-sync-floor-and-crash-safe-apply.md)
