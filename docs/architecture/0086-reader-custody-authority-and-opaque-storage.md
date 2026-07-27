# 0086 - Reader-Custody Authority and Opaque Storage

## Status

Accepted and implemented as the first reader-custody domain slice for ADR 0078.
It defines owner-rooted domain and writer authority, Vault-side KEK/DEK
handling, opaque Core ingestion/storage and restore reconciliation. Automatic
rotation, additional-reader distribution, reader-facing transport and a
deployable Vault shell remain future work.

## Context

ADR 0078 made `reader_custody` a hard boundary: Foundation may host encrypted
memory and key envelopes, but it must never hold the raw domain KEK or gain
readership merely by administering the host. The previous runtime deliberately
rejected content writes for that custody class because no authority or package
format existed.

ADRs 0079, 0081 and 0082 now supply the prerequisites:

- a person-owned `pico_identity` root and delegated device keys;
- a Vault boundary that holds the private halves;
- a signed Home founding and active membership projection; and
- a host whose operator can relay records but cannot sign as a person.

The remaining narrow question is how one owner creates a reader-custody domain,
authorizes one exact writer device, encrypts an item and lets Core verify and
store it without crossing the custody boundary.

## Decision

### Authority graph

The owner identity root is the sole authority for this slice:

```text
owner pico_identity
  ├─ signs domain authority
  │    └─ binds owner device_key_agreement reader key + KEK version
  ├─ signs writer grant
  │    └─ binds writer identity + exact device_signing key + validity
  └─ signs writer-grant revocation

authorized device_signing key
  └─ signs opaque item package
       └─ binds ciphertext and wrapped-DEK digests
```

The Home Host signing-key fingerprint is context, not domain authority. The
Foundation operator can relay or withhold an otherwise valid record — the
honest physical-host limit — but cannot mint, change or transplant one.
Membership remains distinct from readership and writing authority: Core also
requires the owner and writer identities to be active members of the exact
founded Home.

Delegated domain controllers are not inferred. Adding one requires a separate
owner-signed delegation family and review.

### Domain creation and KEK custody

`PicoVaultSession.createPicoReaderCustodyDomain` runs only in an unlocked
`pico_identity` Vault session and receives the owner's exact
`device_key_agreement` public record. It:

1. generates a fresh 256-bit domain KEK;
2. builds the existing ADR 0078 `pico.share.wrap.v1` payload;
3. seals that payload to the owner reader key with `crypto_box_seal`;
4. signs the existing `pico.share.envelope.v1` binding as the owner;
5. signs the new reader-domain authority input as the owner; and
6. zeroes the temporary raw KEK before returning.

The returned record contains only signed public records and sealed ciphertext.
The owner envelope reuses `grantId = domainAuthorityId`: it is the bootstrap
self-envelope for that exact domain authority, not a domain-read grant. Core
checks the sealed-wrap digest and both owner signatures but cannot open it.

The raw KEK may exist transiently inside the Vault's JavaScript process. As in
ADR 0081, zeroization is best effort because JavaScript does not provide
guarded-memory guarantees. It is never returned, serialized or persisted by
Foundation.

### Writer grant and revocation

The domain owner signs a writer grant that binds:

- exact Home, host signing key, domain authority and domain;
- exact KEK version;
- owner identity;
- writer identity;
- exact writer `device_signing` key;
- validity start/end; and
- monotonic lifecycle order.

Only the named device key can produce an item that Core accepts. A later
owner-signed lifecycle record has the single current status `revoked` and must
carry a strictly greater lifecycle order. Core stops new ingestion immediately.
Previously accepted opaque items remain as historical ciphertext; revocation is
not retroactive deletion.

Vault does not claim global lifecycle knowledge. It can create a locally valid
package from records presented to it; Core's current stored revocation state is
the authoritative ingestion gate. Rotation after compromise is still required
for future secrecy and remains outside this slice.

### Item encryption and binding

The Vault encrypts each item with the existing ADR 0071/0073 construction:

- fresh 256-bit DEK;
- XChaCha20-Poly1305 content encryption with
  `pico.mem.ad.content.v1`;
- XChaCha20-Poly1305 DEK wrapping under the domain KEK with
  `pico.mem.ad.dek-wrap.v1`; and
- independent 192-bit nonces.

The domain KEK is recovered only inside an unlocked key-agreement Vault session
from the owner envelope. Both KEK and DEK are zeroed after use.

The device signature covers exact Home/domain/grant/writer context, KEK
version, both nonces, BLAKE2b-256 digests of the ciphertext and wrapped DEK,
content type and creation time. Ciphertext bytes remain outside the signature
input but are accepted only when their recomputed digests match it.

### Canonical families

All four families use the ADR 0073-style sequence
`U32BE(byte_length) || bytes`, one element per field, and the canonical
`pico.suite.mem.v1` ASCII-token, fingerprint, instant, lifecycle-order and
positive KEK-version validators.

#### Domain

Label:

```text
pico.mem.reader-domain.v1
```

Order: label, suite, domain authority id, Home id, host signing-key
fingerprint, domain id, literal `reader_custody`, owner identity fingerprint,
owner reader-key fingerprint, KEK version, authorization instant, lifecycle
order.

Authoritative vector, 296 bytes:

```text
000000197069636f2e6d656d2e7265616465722d646f6d61696e2e7631000000117069636f2e73756974652e6d656d2e7631000000137263646f6d5f32303236303732375f3030303100000012686f6d655f32303236303731385f303030310000002011111111111111111111111111111111111111111111111111111111111111110000000e646f6d61696e2d6a6f75726e616c0000000e7265616465725f637573746f6479000000202222222222222222222222222222222222222222222222222222222222222222000000203333333333333333333333333333333333333333333333333333333333333333000000013100000018323032362d30372d32375431303a30303a30302e3030305a000000147365713a30303030303030303030303030303031
```

#### Writer grant

Label:

```text
pico.mem.reader-writer-grant.v1
```

Order: label, suite, writer grant id, domain authority id, Home id, host
signing-key fingerprint, domain id, KEK version, owner identity fingerprint,
writer identity fingerprint, writer device-signing fingerprint, validity start,
validity end, lifecycle order.

Authoritative vector, 374 bytes:

```text
0000001f7069636f2e6d656d2e7265616465722d7772697465722d6772616e742e7631000000117069636f2e73756974652e6d656d2e76310000001672637772697465725f32303236303732375f30303031000000137263646f6d5f32303236303732375f3030303100000012686f6d655f32303236303731385f303030310000002011111111111111111111111111111111111111111111111111111111111111110000000e646f6d61696e2d6a6f75726e616c000000013100000020222222222222222222222222222222222222222222222222222222222222222200000020444444444444444444444444444444444444444444444444444444444444444400000020555555555555555555555555555555555555555555555555555555555555555500000018323032362d30372d32375431303a30303a30302e3030305a00000018323032372d30372d32375431303a30303a30302e3030305a000000147365713a30303030303030303030303030303032
```

#### Writer-grant lifecycle

Label:

```text
pico.mem.reader-writer-grant-lifecycle.v1
```

Order: label, suite, lifecycle id, writer grant id, domain authority id, Home
id, host signing-key fingerprint, domain id, owner identity fingerprint, writer
identity fingerprint, writer device-signing fingerprint, status, reason,
change instant, lifecycle order.

Authoritative vector, 404 bytes:

```text
000000297069636f2e6d656d2e7265616465722d7772697465722d6772616e742d6c6966656379636c652e7631000000117069636f2e73756974652e6d656d2e76310000001472636c6966655f32303236303732375f303030310000001672637772697465725f32303236303732375f30303031000000137263646f6d5f32303236303732375f3030303100000012686f6d655f32303236303731385f303030310000002011111111111111111111111111111111111111111111111111111111111111110000000e646f6d61696e2d6a6f75726e616c000000202222222222222222222222222222222222222222222222222222222222222222000000204444444444444444444444444444444444444444444444444444444444444444000000205555555555555555555555555555555555555555555555555555555555555555000000077265766f6b65640000000e6465766963655f7265746972656400000018323032362d30382d30315431303a30303a30302e3030305a000000147365713a30303030303030303030303030303033
```

#### Item

Label:

```text
pico.mem.reader-item.v1
```

Order: label, suite, package id, domain authority id, writer grant id, Home id,
host signing-key fingerprint, domain id, memory item id, content type, KEK
version, writer identity fingerprint, writer device-signing fingerprint,
content nonce, ciphertext digest, DEK-wrap nonce, wrapped-DEK digest, creation
instant.

Authoritative vector, 468 bytes:

```text
000000177069636f2e6d656d2e7265616465722d6974656d2e7631000000117069636f2e73756974652e6d656d2e76310000001772636974656d706b675f32303236303732375f30303031000000137263646f6d5f32303236303732375f303030310000001672637772697465725f32303236303732375f3030303100000012686f6d655f32303236303731385f303030310000002011111111111111111111111111111111111111111111111111111111111111110000000e646f6d61696e2d6a6f75726e616c000000116d656d5f32303236303732375f303030310000000a746578742f706c61696e0000000131000000204444444444444444444444444444444444444444444444444444444444444444000000205555555555555555555555555555555555555555555555555555555555555555000000186666666666666666666666666666666666666666666666660000002077777777777777777777777777777777777777777777777777777777777777770000001888888888888888888888888888888888888888888888888800000020999999999999999999999999999999999999999999999999999999999999999900000018323032362d30372d32375431303a30313a30302e3030305a
```

The on-disk fixture suite adds cross-family label, custody-class, inverted
validity and nonce-length rejection cases. Vault/Core runtime tests separately
cover wrong key roles, signature and ciphertext tamper, cross-domain swaps,
idempotency/conflicts, membership loss, revocation and restore reconciliation.

### Core storage and local relay

Migration `0020_reader_custody` creates four separate tables for domain,
writer, lifecycle and item records. No reader-custody record enters
`memory_item`; no table has a plaintext, raw KEK or raw DEK column. Core accepts
only strict versioned records after it has:

1. matched the current signed Home founding and host key;
2. verified owner and exact device key fingerprints and signatures;
3. matched domain, writer, KEK version and validity exactly;
4. checked active owner/writer Home membership;
5. recomputed ciphertext and wrapped-DEK digests; and
6. rejected conflicts or a revoked/expired/not-yet-valid writer.

The local Foundation API exposes host-admin-only relay/list routes under
`/api/home/reader-custody/*`. These are an opaque evidence administration
surface, not a reader API. The principal-less static token and identity sessions
cannot reach them. There is no route that asks Core to decrypt or return
plaintext.

At boot, Core re-verifies every stored domain, grant, lifecycle and item.
Unsupported domain authority cascades to its records; invalid grants cascade to
their lifecycle/items; tampered lifecycle or item rows are dropped. The
`reader_custody` classification remains as a fail-closed marker so a stale
restore cannot silently reinterpret the domain as host custody.

## Consequences

- Foundation can store and relay useful reader-custody state while holding no
  raw domain/content key and no plaintext.
- Host administration remains denial-of-service power only, not signing,
  readership or decryption authority.
- A writer compromise is bounded by an exact device key and grant window;
  owner-signed revocation stops new host ingestion.
- Revocation alone does not remove access to old KEK versions already present
  on a compromised reader. Future secrecy still requires KEK rotation and
  rewrapping to the remaining reader set.
- The owner bootstrap envelope supports only the owner reader key. Additional
  readers and transport require the existing domain-read grant/freshness
  authority plus a later reader-custody envelope flow.
- JavaScript zeroization is best effort, matching ADR 0081's stated limitation.

## Gates

- **C1 — canonical authority:** four versioned signature-input families and
  authoritative accept/reject vectors.
- **C2 — owner-rooted creation:** Vault creates a KEK, immediately seals it to
  the owner reader key, signs the envelope/domain and returns no raw key.
- **C3 — exact writer authority:** owner-signed bounded grant plus
  owner-signed revocation for one exact device-signing key.
- **C4 — opaque item crypto:** fresh DEK/nonces, ADR 0073 AD, digest-bound
  device signature, Vault-only unwrap/decrypt and best-effort zeroization.
- **C5 — separated Core path:** strict verification, conflict safety, no
  `memory_item` reuse, no plaintext/key columns and host-admin-only local relay.
- **C6 — restore/lifecycle tests:** tamper, membership loss and writer
  revocation fail closed; full repository gate remains mandatory.

All six gates are implemented for this narrow slice.

## Non-goals

This ADR does not define:

- automatic KEK rotation or multi-version re-encryption;
- additional-reader envelope issuance/discovery;
- reader-facing sync, Relay or Pico Link transport;
- delegated domain controllers;
- domain deletion/shred UX for reader-custody ciphertext;
- Vault daemon/IPC, approval UX or platform-keystore unlock;
- identity recovery, Home continuity or multi-registry consensus;
- L4 compatibility certification or commercial permission.

## References

- [ADR 0071](0071-memory-content-encryption-threat-model-and-primitive-direction.md)
- [ADR 0073](0073-memory-content-ad-canonicalization-and-test-vectors.md)
- [ADR 0078](0078-memory-domain-reader-membership-and-key-distribution-threat-model-and-direction.md)
- [ADR 0079](0079-pico-identity-and-device-key-threat-model-and-primitive-direction.md)
- [ADR 0081](0081-pico-vault-person-role-key-custody-threat-model-and-direction.md)
- [ADR 0082](0082-identity-bound-foundation-sessions-and-domain-read-grants.md)
- [ADR 0083](0083-reader-key-registration-and-freshness-contract.md)
- [ADR 0085](0085-authenticated-reader-key-freshness-checkpoints.md)
