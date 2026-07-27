# 0088 - Reader-Custody Multi-Reader Envelopes and KEK Rotation

## Status

Accepted and implemented as the narrow ADR 0078/0086 multi-reader and rotation
slice. This ADR adds owner-rooted additional-reader grants, explicit history
semantics, revocation-coupled KEK rotation and atomic envelope sets.
Reader-facing transport, delegated controllers and deployable Vault IPC remain
out of scope.

## Context

ADR 0086 proves the reader-custody boundary for one owner reader and one writer:
Vault alone sees raw KEKs, DEKs and plaintext; Foundation verifies signed
authority and stores only opaque records. That slice intentionally stops before
two security properties required by ADR 0078:

1. a second reader must receive only the KEK versions the owner explicitly
   grants; and
2. removing a reader or writer must make all later content use a new KEK that
   the removed principal never receives.

Issuing one loose envelope at a time is insufficient. It could leave a
rotation partially distributed, silently grant historical access, or accept
new writes under a version whose compromised reader set is still current.
The unit of authority therefore has to be an owner-signed reader grant plus a
complete, owner-signed envelope set for every affected version.

## Decision

### Authority and custody

The reader-custody domain owner remains the sole controller:

```text
owner pico_identity
  ├─ signs reader grant
  │    ├─ exact reader identity, device signing key and X25519 reader key
  │    ├─ explicit from_version or forward_only access
  │    └─ initial envelope set for every authorized KEK version
  ├─ signs reader-grant revocation
  └─ signs KEK rotation
       ├─ covers every revocation since the previous version
       ├─ names the complete remaining reader-grant set
       └─ carries one new envelope for the owner and each remaining reader
```

The Home Host and Foundation operator may relay these records under ADR 0087
but cannot create them. Reader-key eligibility and ADR 0085 freshness are
checked before Core accepts an additional-reader grant. Membership alone still
grants no readership.

Vault uses the existing `pico.suite.share.v1` sealed-wrap and envelope
constructions. No new primitive or raw-key serialization is introduced.

### Explicit history semantics

Every reader grant chooses exactly one access mode:

- `from_version`: the owner explicitly sets `firstKekVersion`; the initial
  record contains one envelope for every existing version from that version
  through the current version.
- `forward_only`: `firstKekVersion` must equal the current KEK version when the
  grant is accepted and no envelope for an older version is allowed.

There is no default and no ambient "member sees history" rule. A later
rotation adds an envelope for an active reader regardless of its original
mode, because both modes include future content until explicit revocation.
This is version-forward, not item-time-forward: every holder of KEK `n` can
read all retained items encrypted under `n`, including items created earlier
in that version. A product ceremony that promises access only to newly created
items must rotate to `n+1` first and issue the forward-only grant there.

### Revocation and the write barrier

Reader- and writer-grant lifecycle records remain immediate authorization
stops. In addition, every such revocation newer than the current KEK-version
authority creates a rotation debt. While debt exists, Core rejects all new
reader-custody item ingestion for the domain, including writes by a different
still-active writer.

A rotation:

1. increments exactly from KEK version `n` to `n+1`;
2. names every uncovered reader/writer lifecycle id as its cause set;
3. names the exact active, unexpired and non-revoked reader-grant set;
4. carries one owner envelope plus one envelope for every named remaining
   reader grant, all for `n+1`; and
5. has a lifecycle order greater than the previous version and every covered
   revocation.

Core compares both sets with current stored authority before accepting the
record. Missing, extra, expired or revoked readers fail closed. Only after the
rotation is durable may a newly issued writer grant and item use `n+1`.

Rotation protects future content only. Items and KEK versions already received
by a removed reader remain readable to that reader and may have been copied.
This is the ADR 0033/0078 honesty boundary, not a recoverable failure.

### Atomic envelope records

An additional-reader grant embeds its initial `PicoShareEnvelopeRecord[]`.
A rotation embeds its complete new-version `PicoShareEnvelopeRecord[]`.
For both record types Core requires:

- canonical lower-case ciphertext and digest fields;
- exact domain, Home, host key, owner issuer, reader key and KEK version;
- BLAKE2b-256 digest equality for every sealed wrap;
- a valid owner signature over every existing ADR 0078 envelope input; and
- no missing, duplicate or additional envelope.

The owner envelope uses the stable domain authority id for version 1 and the
rotation id for later versions. Reader envelopes use their reader-grant id.
This makes each sealed wrap attributable without turning the envelope id into
membership or identity authority.

### Core persistence and reconciliation

Migration `0003_reader_custody_multi_reader_rotation` adds three opaque tables:

- reader grants;
- reader-grant lifecycle records; and
- KEK rotations.

No table contains plaintext, a raw KEK or a raw DEK. Existing domain, writer and
item rows remain immutable historical evidence. The current KEK version is
derived from the highest valid contiguous rotation, never from an unsigned
counter.

Boot/restore reconciliation re-verifies owner signatures, reader-key records,
membership, grant/lifecycle ordering, exact rotation causes, exact remaining
reader sets and every envelope digest/signature. Invalid reader state and
dependent rotations are removed fail-closed. Historical items remain only when
their original domain/writer/version evidence is still cryptographically
valid.

The local `/api/home/reader-custody/*` additions remain
`home-authority-relay`. They are not a reader download or Pico Link surface.

## Canonical families

All new families use the existing sequence
`U32BE(byte_length) || bytes`, one element per field. Variable id sets are
canonicalized lexicographically and encoded as an ASCII count followed by one
ASCII element per id.

### Reader grant

Label `pico.mem.reader-grant.v1`.

Order: label, suite, reader grant id, domain authority id, Home id, host
signing-key fingerprint, domain id, owner identity fingerprint, reader identity
fingerprint, reader device-signing fingerprint, reader key-agreement
fingerprint, delegation id, access mode, first KEK version, validity start,
validity end, lifecycle order.

### Reader-grant lifecycle

Label `pico.mem.reader-grant-lifecycle.v1`.

Order: label, suite, lifecycle id, reader grant id, domain authority id, Home
id, host signing-key fingerprint, domain id, owner identity fingerprint,
reader identity fingerprint, reader key-agreement fingerprint, status, reason,
change instant, lifecycle order.

### KEK rotation

Label `pico.mem.reader-kek-rotation.v1`.

Order: label, suite, rotation id, domain authority id, Home id, host signing-key
fingerprint, domain id, owner identity fingerprint, previous KEK version, new
KEK version, cause count and sorted cause lifecycle ids, remaining-reader count
and sorted reader grant ids, rotation instant, lifecycle order.

Authoritative positive and negative vector bytes are published under
`docs/protocol/fixtures/reader-custody/`.

Reader-grant vector, 447 bytes:

```text
000000187069636f2e6d656d2e7265616465722d6772616e742e7631000000117069636f2e73756974652e6d656d2e76310000001672637265616465725f32303236303732375f30303031000000137263646f6d5f32303236303732375f3030303100000012686f6d655f32303236303731385f303030310000002011111111111111111111111111111111111111111111111111111111111111110000000e646f6d61696e2d6a6f75726e616c0000002022222222222222222222222222222222222222222222222222222222222222220000002044444444444444444444444444444444444444444444444444444444444444440000002055555555555555555555555555555555555555555555555555555555555555550000002066666666666666666666666666666666666666666666666666666666666666660000001864656c65676174696f6e5f32303236303732375f303030310000000c66726f6d5f76657273696f6e000000013100000018323032362d30372d32375431303a30353a30302e3030305a00000018323032372d30372d32375431303a30353a30302e3030305a000000147365713a30303030303030303030303030303033
```

Reader-grant-revocation vector, 398 bytes:

```text
000000227069636f2e6d656d2e7265616465722d6772616e742d6c6966656379636c652e7631000000117069636f2e73756974652e6d656d2e7631000000157263726c6966655f32303236303830315f303030310000001672637265616465725f32303236303732375f30303031000000137263646f6d5f32303236303732375f3030303100000012686f6d655f32303236303731385f303030310000002011111111111111111111111111111111111111111111111111111111111111110000000e646f6d61696e2d6a6f75726e616c000000202222222222222222222222222222222222222222222222222222222222222222000000204444444444444444444444444444444444444444444444444444444444444444000000206666666666666666666666666666666666666666666666666666666666666666000000077265766f6b65640000000e7265616465725f72656d6f76656400000018323032362d30382d30315431303a30303a30302e3030305a000000147365713a30303030303030303030303030303034
```

KEK-rotation vector, 364 bytes:

```text
0000001f7069636f2e6d656d2e7265616465722d6b656b2d726f746174696f6e2e7631000000117069636f2e73756974652e6d656d2e7631000000167263726f746174655f32303236303830315f30303031000000137263646f6d5f32303236303732375f3030303100000012686f6d655f32303236303731385f303030310000002011111111111111111111111111111111111111111111111111111111111111110000000e646f6d61696e2d6a6f75726e616c0000002022222222222222222222222222222222222222222222222222222222222222220000000131000000013200000001320000001472636c6966655f32303236303830315f30303031000000157263726c6966655f32303236303830315f3030303100000001310000001672637265616465725f32303236303732375f3030303200000018323032362d30382d30315431303a30313a30302e3030305a000000147365713a30303030303030303030303030303035
```

## Gates

- **R8.1 — canonical authority: Done.** Three new versioned signature-input
  families and authoritative accept/reject vectors.
- **R8.2 — explicit history: Done.** No grant exists without `from_version` or
  `forward_only`; initial envelopes exactly match the authorized versions.
- **R8.3 — fresh exact reader: Done.** Core requires active Home membership,
  the exact registered delegated key and a current ADR 0085 checkpoint at
  grant intake.
- **R8.4 — Vault-only distribution: Done.** Vault unwraps historical owner
  envelopes transiently, seals to the new reader, generates rotation KEKs and
  returns no raw key material.
- **R8.5 — revocation-coupled rotation: Done.** Uncovered reader/writer
  revocation blocks new writes; `n+1` atomically covers the exact remaining
  reader set.
- **R8.6 — opaque restore safety: Done.** Additive storage, conflict safety,
  reconciliation and cross-reader/version/restore negative tests.

## Consequences

Positive:

- A reader receives exactly the versions the owner selected.
- Removing any key holder creates a structural write barrier until future
  secrecy is restored.
- Partial rotations and silent reader carry-over cannot be accepted.
- Foundation continues to host useful multi-reader state without decryption
  authority.

Negative and residual:

- Historical grants require the owner's Vault to unwrap each historical owner
  envelope transiently.
- Rotation metadata reveals the count and references of remaining readers to
  the Home.
- A removed reader retains every version it already received.
- Without a checkpoint publisher, additional-reader intake remains
  `freshness_unavailable`.
- There is still no reader-facing envelope transport or automatic background
  rotation executor.

## Non-goals

- retroactive revocation or re-encryption of historical items;
- delegated domain controllers or threshold/group authority;
- reader-facing Sync, Relay or Pico Link transport;
- automatic scheduling/background jobs;
- Vault daemon/IPC, platform keystore, approval or recovery UX;
- domain-wide shred guarantees for reader-custody material; or
- compatibility certification and commercial permission.

## References

- [ADR 0033](0033-key-lifecycle-rotation-revocation-and-recovery.md)
- [ADR 0078](0078-memory-domain-reader-membership-and-key-distribution-threat-model-and-direction.md)
- [ADR 0081](0081-pico-vault-person-role-key-custody-threat-model-and-direction.md)
- [ADR 0083](0083-reader-key-registration-and-freshness-contract.md)
- [ADR 0085](0085-authenticated-reader-key-freshness-checkpoints.md)
- [ADR 0086](0086-reader-custody-authority-and-opaque-storage.md)
- [ADR 0087](0087-foundation-operator-home-host-authority-consolidation.md)
