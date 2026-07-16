# 0071 - Memory Content Encryption Threat Model and Primitive Direction

## Status

Accepted as the documented threat model and cryptographic direction for memory-store content at rest. It answers the ADR 0016 threat-model questions for this surface and decides the primitive suite in the dedicated, maximally reviewed step ADR 0070 required. It implements no cryptography: the decided suite becomes security-relevant only after the key-storage design (ADR 0033 realization) and canonicalization test vectors (ADR 0034) exist.

## Context

ADR 0016 forbids project-specific cryptography, allows reviewed building blocks (naming libsodium as an allowed direction) and requires a documented threat model before the exact choice.

ADR 0029 defines the Domain Content Key role: key material for a protected domain; hosting ciphertext is not permission to read it; wrapping and distribution require a reviewed key-management design.

ADR 0031 defines the attacker model and requires, before Domain Content Keys are implemented: protected domain classes, a reader membership model, a key wrapping format, rotation behaviour, deletion and crypto-shredding expectations, and backup/restore semantics.

ADR 0032 defines the `pico.key.envelope` and protected-payload schema family with `algorithmSuite: "tbd"` awaiting exactly this decision.

ADR 0033 bounds what key lifecycle claims may promise: rotation does not prove historical deletion; key material that was itself backed up or exported is not destroyed by rotation; stale backups must not silently resurrect revoked authority.

ADR 0034 gates security relevance behind canonical byte definitions and published test vectors.

ADR 0070 bounds the memory store: content is plaintext at rest today, deletion is live-store removal plus tombstone reconciliation, backups may retain plaintext, and no content-exposing surface ships before protection. Its implementation step 3 defers the concrete threat model and primitive selection to a dedicated step. This ADR is that step.

## Scope

This ADR covers **memory-store content at rest on a single Foundation host**: the `memory_item.content` column and its backups.

It does not cover multi-device key distribution, domain membership, sharing, transport protection or signatures. Those stay behind ADR 0029/0031/0032/0045. The single-host scope is deliberate: it keeps every claim in this ADR checkable against the system that exists.

## Threat model

### Protected assets

- the plaintext content of memory items, per privacy domain
- the effectiveness of deletion: deleted content must not be recoverable from artifacts the owner intended to purge

Not protected by this ADR (stated honestly): storage metadata stays readable — item IDs, privacy-domain IDs, content types, deletion states, postures, timestamps and approximate content sizes (ciphertext length), plus the non-sensitive `summary` a `memory.recorded` event carries by design (ADR 0069).

### Attacker model

In scope (derived from the ADR 0031 attacker table):

| Attacker | Capability against the memory store |
|---|---|
| Stolen disk or device image | Reads the SQLite file and any co-located key material. |
| Backup-artifact attacker | Reads backup copies, including copies stored outside the host (cloud storage). |
| Compromised Pico Home / curious Home Host | Reads host storage as files; must not gain member-content readability from the host role alone (ADR 0029/0031). |
| Backup or restore attacker | Restores stale state to resurrect deleted items or retired key material (ADR 0031, ADR 0033). |

Out of scope for at-rest encryption, by nature not by neglect:

- a compromised **running** Foundation process: it legitimately holds or reaches the keys while operating; at-rest encryption cannot defend against it
- RAM forensics, side channels and swap
- metadata correlation across append-only events (an ADR 0031 concern)

### The ADR 0016 questions, answered for this surface

1. **Who controls keys?** The owning Pico (the item's `owner`/`controller` identity). Operationally the Foundation process manages Domain Content Keys on the owner's behalf. The host-administration role grants no key authority (ADR 0029).
2. **Which devices can read which domain?** Foundation phase: only the single Foundation host itself. Target: readers authorized per domain through key envelopes (ADR 0032) and membership (ADR 0045); nothing in this ADR widens the reader set.
3. **What can a server see?** Ciphertext plus the storage metadata listed above. Never plaintext content. Hosting ciphertext and key envelopes is not permission to read them.
4. **What can a relay see?** Nothing new; memory at rest never reaches a relay. If items ever sync, they travel as protected payload envelopes (ADR 0032) and relays see transport metadata only (ADR 0031).
5. **What happens after device loss?** Honest current answer: while KEKs live with the host, losing the host risks all domains — one reason the store holds foundation data only. Target: KEKs live in separated key storage (ADR 0033 realization); device loss then triggers rotation and, where required, domain crypto-shredding.
6. **What happens after relationship revocation?** Not applicable while memory is single-host and unshared. Once domains are shared: member removal rotates the domain KEK for new content; content already replicated to the removed member is not retroactively erased (ADR 0033 honesty limit) — the ADR 0031 membership work owns that path.
7. **How does backup restore work?** Backups hold ciphertext and wrapped DEKs, never KEKs (requirement R6). A restore restores ciphertext; tombstone reconciliation (ADR 0070, implemented) re-enforces recorded deletions; a domain whose KEK was destroyed stays unreadable even from old backups — provided the KEK was truly never in a backup.
8. **How does deletion interact with protected payloads?** Three layers: live deletion removes content from the store (exists); tombstones record and re-enforce deletion (exists); crypto-shredding destroys key material so residual ciphertext — including backup copies — becomes unreadable (target; the layer this ADR specifies).

## Cryptographic requirements

- **R1 — AEAD per item.** Each item's content is protected by an AEAD providing confidentiality and integrity; a file-level attacker cannot read or undetectably modify content.
- **R2 — Two-level key hierarchy.** Each item gets a fresh random 256-bit DEK; the DEK is wrapped by the per-domain KEK (the ADR 0029 Domain Content Key) into a key envelope (ADR 0032) referenced by the existing `memory_item.key_envelope_ref`. Rationale: destroying a domain KEK shreds the whole domain; KEK rotation re-wraps DEKs without re-encrypting content; per-item DEKs are the later unit for authorized-reader wrapping.
- **R3 — Canonical AD binding.** The AEAD associated data binds each ciphertext to `{ suite, memoryItemId, privacyDomain, contentType }`, canonicalized per ADR 0034. A ciphertext moved to another row, domain or type fails authentication. The key-envelope reference is deliberately not in the AD, so envelope rotation does not force content re-encryption; the suite identifier is, so a downgrade fails authentication.
- **R4 — Stateless nonces.** Nonces are random per encryption and stored alongside the ciphertext; the nonce space must be large enough that random generation is birthday-safe without counter state.
- **R5 — Crypto-shredding.** Destroying all versions of a domain's KEK must render every item of that domain unreadable, including copies in backups — subject to the ADR 0033 limits, which must be stated wherever shredding is surfaced: shredding is only as strong as the key-material handling, and keys that were exported or backed up are not destroyed by rotation.
- **R6 — Key/backup separation.** KEKs must never live in the SQLite database file and never in the same backup artifact as the ciphertext they protect. Where they do live (platform keystore, add-on secret store, separate file set) is the ADR 0033 key-storage design, prerequisite to any implementation.
- **R7 — Operable metadata.** The store remains operable without decryption: listing, deletion-state transitions, tombstone reconciliation and resolution states work on metadata alone.

Known residual leak, accepted for now: ciphertext length reveals approximate content size. Padding policy is future work; content is not compressed before encryption.

## Decision: primitive suite `pico.suite.mem.v1`

One reviewed toolkit, one suite, versioned:

| Purpose | Primitive | Notes |
|---|---|---|
| Content AEAD | **XChaCha20-Poly1305** (IETF), 256-bit key, 192-bit random nonce | libsodium `crypto_aead_xchacha20poly1305_ietf`; the 192-bit nonce makes random nonces birthday-safe (R4) without hardware dependence |
| DEK wrapping | The same XChaCha20-Poly1305 construction | AD binds `{ suite, keyEnvelopeId, domainId, memoryItemId }`; one primitive set, no second scheme |
| Subkey derivation | libsodium `crypto_kdf` (BLAKE2b) | for deriving purpose-bound subkeys from a domain KEK where needed |
| Randomness | libsodium CSPRNG | DEKs, KEKs and nonces |

`pico.suite.mem.v1` is the value the ADR 0032 `algorithmSuite` field carries for memory-content envelopes.

Reasoning, per the ADR 0016 rule:

- **libsodium end to end** — ADR 0016 explicitly lists libsodium primitives as the allowed direction; a single reviewed toolkit minimizes the primitive zoo and the review surface. No custom constructions anywhere (ADR 0016 non-goals).
- **XChaCha20-Poly1305 over AES-GCM** as the default: the 192-bit nonce removes the nonce-management failure mode that dominates real-world AEAD breaks, and performance does not depend on AES hardware. AES-256-GCM remains an acceptable, documented deviation only if a platform or compliance constraint ever forces it — as `pico.suite.mem.v2`, never silently.
- **Versioned suite identifier** — bound into the AD (R3), so future migration is an explicit new suite, and downgrade attempts fail authentication.
- **Deliberately undecided here:** the concrete libsodium binding (library packaging), passphrase KDFs and recovery flows (ADR 0033 territory), and signature/identity algorithms (unrelated to this surface).

## Security-relevance gate

The suite is decided, not yet security-relevant. Before any implementation may claim protection:

1. the canonical AD byte layout is specified with published test vectors (ADR 0034), including negative vectors for swapped IDs, domains and suites;
2. the key-storage design exists and satisfies R6 (ADR 0033 realization — designed by ADR `0072-memory-domain-key-storage-and-backup-separation.md`; its implementation steps remain open);
3. encrypt/decrypt round-trip and shred behaviour are covered by fixtures before the `domain_encrypted` posture becomes writable.

Until then the memory store stays plaintext-at-rest foundation data under the ADR 0070 rules, and nothing may advertise encryption.

## Non-goals

This ADR does not define or implement:

- encryption/decryption runtime or the libsodium binding choice
- key storage location, format or lifecycle mechanics (ADR 0033)
- multi-device key distribution, domain membership or sharing
- passphrase protection, recovery or export flows
- padding policy or search over ciphertext
- signature, identity or transport algorithms
- FIPS or compliance claims

## Implementation implications

Ordered additive steps, all deferred:

1. Specify the canonical AD layout and seed an ADR 0034-style test-vector fixture family for `pico.suite.mem.v1` (accept + reject vectors). No runtime.
2. Design key storage satisfying R6 for the Foundation/Home Assistant context (ADR 0033 realization). Concept step.
3. Implement encrypt-on-write/decrypt-in-process behind the `domain_encrypted` content posture, gated on steps 1–2; the posture becomes writable only here.
4. Implement the domain crypto-shred operation with its audit trail (ADR 0037-compatible: decisions and references, no content).
5. Only after all of that: revisit the content read API under the ADR 0070 ordering.

## Relationship to other ADRs

Realizes the dedicated decision step required by:

- `0070-memory-store-encryption-at-rest-and-crypto-shredding-boundary.md` (implementation step 3)
- `0016-cryptography-boundaries-and-non-goals.md` (documented threat model before the exact choice)

Stays within and below:

- `0029-identity-device-home-keys-and-e2e-boundaries.md` (Domain Content Key role; host ciphertext ≠ read permission)
- `0031-pico-link-identity-relay-and-domain-threat-model.md` (attacker model; the reader-membership and rotation-on-removal requirements stay open there)
- `0032-pico-link-envelope-and-credential-schema-direction.md` (key envelope and protected payload family; this ADR supplies the first concrete `algorithmSuite` value)
- `0033-key-lifecycle-rotation-revocation-and-recovery.md` (lifecycle and honesty limits; key storage design still owed)
- `0034-canonicalization-signature-inputs-and-test-vectors.md` (vectors before security relevance)

## Consequences

Positive:

- the ADR 0016 threat-model questions have concrete, checkable answers for the first real content surface
- the primitive choice is made once, in a dedicated reviewed step, with a versioned suite and an explicit downgrade defense — not as a byproduct of implementation
- deletion gains its target semantics: live removal + tombstone enforcement + domain crypto-shredding, each with stated limits
- ADR 0032's `algorithmSuite: "tbd"` has its first concrete value

Negative:

- single-host scope means sharing and multi-device reads will need follow-up threat-model work before the reader set may widen
- metadata (domains, types, sizes, summaries) remains readable at rest by design; padding remains open
- honest limits must travel with the feature: at-rest encryption does not defend a compromised running process, and crypto-shredding is bounded by key-handling reality
- the store remains foundation-only until the security-relevance gate is passed
