# 0073 - Memory Content Encryption Associated-Data Canonicalization and Test Vectors

## Status

Accepted as the canonical associated-data (AD) byte layout and published test vectors for the memory-content encryption suite `pico.suite.mem.v1`. This satisfies **gate point 1** of the ADR 0071 security-relevance gate. It selects canonical bytes for one narrow surface only — the AEAD associated data of memory-store content at rest — and does not choose a wire canonicalization for any Pico Link or Pico Home Link object. It implements no cryptography and no runtime; it publishes the byte construction and the accept/reject vectors that a later encrypt-on-write step must reproduce.

## Context

ADR 0016 forbids project-specific cryptographic primitives, allows reviewed building blocks and requires a documented threat model before an exact choice.

ADR 0034 makes canonicalization a protocol surface: future signed or hashed objects must define the semantic object, the canonical form that becomes the signature or hash input, excluded fields, unknown-field handling, normalization and rejection rules, replay coverage and the fixture set required before compatibility claims. ADR 0034 deliberately does **not** choose between canonical JSON, deterministic CBOR, a length-prefixed binary encoding or a layered model. It lists, under "protected-payload associated data when selected algorithms require it", exactly the surface this ADR settles.

ADR 0047 defines a draft-only canonicalization *rejection* placeholder and states that authoritative canonical bytes, hash inputs, signature inputs, fixture vector format and verifier behaviour stay locked "until a later ADR selects" them. This ADR is that later ADR **for the memory-content AD surface only**; ADR 0047's lock on the Pico Link draft surfaces (packet envelope, protected payload, membership credential, compatibility claim) is unchanged.

ADR 0071 answers the ADR 0016 threat-model questions for memory content at rest and decides the suite `pico.suite.mem.v1` (libsodium XChaCha20-Poly1305 for both content AEAD and DEK wrapping, per-item DEKs under per-domain KEKs, random nonces). Its requirement **R3 (canonical AD binding)** specifies:

- the **content AEAD** associated data binds `{ suite, memoryItemId, privacyDomain, contentType }`;
- the **DEK-wrap AEAD** associated data binds `{ suite, keyEnvelopeId, domainId, memoryItemId }`;
- the key-envelope reference is deliberately **not** in the content AD, so envelope rotation does not force content re-encryption;
- the suite identifier **is** bound, so a downgrade fails authentication.

ADR 0071's security-relevance gate requires, before any implementation may claim protection: (1) the canonical AD byte layout specified with published test vectors including negatives for swapped IDs, domains and suites; (2) the key-storage design satisfying R6 (ADR 0072, designed); (3) round-trip and shred fixtures before the `domain_encrypted` posture becomes writable. This ADR delivers (1).

ADR 0072 realizes the key-storage design (gate point 2). ADR 0032 defines the `algorithmSuite` and key-envelope schema family whose first concrete suite value is `pico.suite.mem.v1`.

The memory store already carries the relevant columns (migration `0006`/`0007`): `memory_item_id`, `privacy_domain`, `content_type`, `content_posture` (`plaintext_foundation` | `domain_encrypted`) and `key_envelope_ref`. This ADR binds the AD to those existing identifiers.

## Scope

This ADR covers **one** canonicalization surface: the associated-data byte string fed to the `pico.suite.mem.v1` AEAD for

1. memory-item **content** encryption, and
2. per-item **DEK wrapping**.

It does **not** cover, and must not be read as choosing, canonicalization for:

- signed event segments, replica manifests, membership credentials, device delegations, key rotation or revocation statements (still open under ADR 0034 / ADR 0047);
- any Pico Link or Pico Home Link wire object;
- the memory-item **plaintext** itself (that is AEAD plaintext, never canonicalized — free text and binary live there);
- hashes or identifiers (`memoryItemId`, `keyEnvelopeId` remain externally assigned; this ADR derives no identifier from a hash).

Because the AD is an internal AEAD input, the encoding question is narrower than a wire format: the AD is **never parsed, never transmitted and never stored**. It is reconstructed at encrypt time and again at decrypt time from the same metadata columns by the same implementation, and compared implicitly by the Poly1305 tag. There is no foreign parser. The requirement is therefore **injectivity and domain separation**, not interoperable parsing.

## Decision: length-prefixed binary AD construction

The canonical AD is a **length-prefixed concatenation** of a fixed, ordered list of byte-string elements. It is not JSON, not CBOR, and carries no delimiters.

### Rationale for length-prefixed binary over JSON/CBOR

For a closed, fixed tuple of machine identifiers consumed only internally:

- **Injectivity without a canonicalizer.** A fixed field order, a fixed field count per family, a distinct domain-separation label per family, and a fixed-width length prefix before every variable-length element make the map from fields to bytes injective. No delimiter is used, so no delimiter- or separator-injection is possible — the classic failure of naive string concatenation. Length prefixing is exactly the standard defense (see the verified injectivity vector below: `("ab","c",…)` and `("a","bc",…)` produce different bytes).
- **No parser, no ambiguity surface.** JSON canonicalization (JCS) would drag in string escaping, Unicode normalization decisions and a full parse/serialize surface for zero benefit, since the AD is never parsed. Deterministic CBOR would add canonical key-ordering and minimal-integer rules plus a library, overkill for a 4-element tuple.
- **Unicode normalization is eliminated, not deferred.** All four field values are machine identifiers. This ADR restricts them to the ASCII token charset `[A-Za-z0-9._:/+-]` (sufficient for suite ids like `pico.suite.mem.v1`, domain ids, ULID/UUID-style item and envelope ids, and media types like `text/markdown`). ASCII is its own NFC, so there is no normalization question in the AD at all. Anything outside the charset is rejected before it can reach the AEAD.
- **Library-free and cross-language.** `U32BE` length prefixing plus byte concatenation is reproducible identically in TypeScript, Rust, Go, Swift or C without a shared canonicalization dependency — important for future clients.
- **Appropriately scoped commitment.** Choosing this framing for the internal AD does *not* commit Pico Link wire objects to any encoding. The construction carries its own version label (`pico.mem.ad.<family>.v1`) independent of both the crypto suite and any future wire format.

Trade-off, stated honestly: length-prefixed binary is not human-readable and not self-describing; a reader needs this ADR to interpret the bytes. That is acceptable for an internal AEAD input that is never displayed; debuggability is served by the published hex vectors and human-readable notes, not by the wire shape.

### Element encoding

Every element is encoded as:

```text
element(b) = U32BE(len(b)) || b
```

where `U32BE` is a 4-byte big-endian unsigned length and `b` is the raw UTF-8 (here: ASCII) bytes of the value. The AD is the concatenation of the elements of its family in the fixed order below.

### AD families and field order

Two families, each led by a fixed ASCII **domain-separation (DS) label** that is itself encoded as the first element. The DS label versions the *AD construction* and is independent of the crypto-suite value carried in the following element.

**Content AD** — DS label `pico.mem.ad.content.v1`:

| Order | Element | Bound value (source) |
|---|---|---|
| 0 | DS label | `pico.mem.ad.content.v1` (constant) |
| 1 | suite | `pico.suite.mem.v1` (from the key envelope / row) |
| 2 | memoryItemId | `memory_item.memory_item_id` |
| 3 | privacyDomain | `memory_item.privacy_domain` |
| 4 | contentType | `memory_item.content_type` |

**DEK-wrap AD** — DS label `pico.mem.ad.dek-wrap.v1`:

| Order | Element | Bound value (source) |
|---|---|---|
| 0 | DS label | `pico.mem.ad.dek-wrap.v1` (constant) |
| 1 | suite | `pico.suite.mem.v1` |
| 2 | keyEnvelopeId | key-envelope identifier (ADR 0032; referenced by `key_envelope_ref`) |
| 3 | domainId | the domain identifier (same value as `privacy_domain`) |
| 4 | memoryItemId | `memory_item.memory_item_id` |

`domainId` in the DEK-wrap family and `privacyDomain` in the content family carry the **same domain identifier value**; the field names differ only because the DEK-wrap family follows the ADR 0032 key-envelope vocabulary while the content family follows the memory-store column vocabulary.

The suite value appears both inside the DS label and as element 1. This redundancy is deliberate: the DS label is a compile-time constant that guards against building the wrong family, while element 1 carries the R3 downgrade binding from data (the row/envelope), so a stored-suite mismatch fails authentication (see the `content-suite-v2` vector).

### Field classification (ADR 0034 model)

All four value fields in each family are `required_protected`. There are no `optional_protected`, `required_unprotected`, `optional_unprotected` or `ignored_extension` fields in the AD: the AD field set is closed. Any additional field is a `rejected_extension` — the AD builder takes exactly the fixed tuple and nothing else. `key_envelope_ref` is intentionally **excluded** from the content AD (ADR 0071 R3) so envelope rotation does not re-encrypt content.

### Validation and rejection rules

The AD builder enforces, per element value, before emitting any bytes:

| Rule | Violation → reason |
|---|---|
| non-empty (`len(bytes) >= 1`) | `empty_field` |
| all bytes within `[A-Za-z0-9._:/+-]` (ASCII) | `invalid_field_charset` |
| `len(bytes) <= 1024` | `field_too_long` |

A violation is a canonicalization failure: the builder produces **no** AD and the operation is rejected. Rejection reasons map to the ADR 0034 conceptual category `canonicalization_error` (with `field_too_long` also expressible as `integer_out_of_range`). These are conceptual categories, not final API error codes.

Because the field set is closed and the values are constrained to ASCII tokens, the ADR 0034 normalization checklist collapses to: no field ordering choice (order is fixed), no duplicate fields (fixed tuple), no null-vs-absent ambiguity (every field required and non-empty), no integer/decimal values, no Unicode normalization (ASCII), no timestamps and no binary values in the AD.

## Test vectors

The vectors below are **authoritative**. They were generated deterministically from the construction above and any implementation of `pico.suite.mem.v1` AD building must reproduce them exactly. Bytes are shown as lowercase hex; `len` is the byte length of the AD.

### Fixture vector format

Each future on-disk fixture (planned layout `docs/protocol/fixtures/memory-content-ad/pico.suite.mem.v1/`, families `canonicalization-positive` and `canonicalization-negative` per ADR 0034) states:

- `fixtureId`
- `suite`: `pico.suite.mem.v1`
- `adFamily`: `content` | `dek-wrap`
- `construction`: the DS label (e.g. `pico.mem.ad.content.v1`)
- `input`: the ordered field values (object with the family's named fields)
- for positives: `canonicalAdHex` and `canonicalAdLen`
- for negatives: `expect: reject`, `errorCategory: canonicalization_error` and `reason` (`empty_field` | `invalid_field_charset` | `field_too_long`)
- `notes`: human-readable intent
- `adr`: `0073`

Fixtures are synthetic and contain no real user content, keys, recovery material or deployment identifiers. The identifiers below are synthetic.

### canonicalization-positive

**`content-typical`** — content AD, a private text note.

```text
input   suite=pico.suite.mem.v1  memoryItemId=mem_01hzx8m9q4rt5v
        privacyDomain=domain-private  contentType=text/plain
len     101
adHex   000000167069636f2e6d656d2e61642e636f6e74656e742e763100000011
        7069636f2e73756974652e6d656d2e7631000000126d656d5f3031687a78
        386d397134727435760000000e646f6d61696e2d707269766174650000000a
        746578742f706c61696e
```

**`content-markdown`** — content AD, differs from `content-typical` only in `contentType`.

```text
input   suite=pico.suite.mem.v1  memoryItemId=mem_01hzx8m9q4rt5v
        privacyDomain=domain-private  contentType=text/markdown
len     104
adHex   000000167069636f2e6d656d2e61642e636f6e74656e742e763100000011
        7069636f2e73756974652e6d656d2e7631000000126d656d5f3031687a78
        386d397134727435760000000e646f6d61696e2d707269766174650000000d
        746578742f6d61726b646f776e
```

**`dek-wrap-typical`** — DEK-wrap AD for the same item.

```text
input   suite=pico.suite.mem.v1  keyEnvelopeId=kenv_01hzx8m9q4rt5v
        domainId=domain-private  memoryItemId=mem_01hzx8m9q4rt5v
len     111
adHex   000000177069636f2e6d656d2e61642e64656b2d777261702e7631000000
        117069636f2e73756974652e6d656d2e7631000000136b656e765f303168
        7a78386d397134727435760000000e646f6d61696e2d70726976617465
        000000126d656d5f3031687a78386d39713472743576
```

**`content-inject-a` / `content-inject-b`** — injectivity / delimiter-injection resistance. Both are valid content ADs of identical total length (63 bytes) that differ only in where a boundary falls; they must produce **different** bytes.

```text
inject-a  memoryItemId=ab  privacyDomain=c  contentType=t
len 63    000000167069636f2e6d656d2e61642e636f6e74656e742e763100000011
          7069636f2e73756974652e6d656d2e763100000002616200000001630000
          000174

inject-b  memoryItemId=a  privacyDomain=bc  contentType=t
len 63    000000167069636f2e6d656d2e61642e636f6e74656e742e763100000011
          7069636f2e73756974652e6d656d2e763100000001610000000262630000
          000174
```

`inject-a` != `inject-b`. Without length prefixing these would both concatenate to `…ab c t…` versus `…a bc t…` and could collide; the length prefixes make them distinct. This is the core injectivity guarantee.

### canonicalization-negative (bind-difference: these MUST authenticate differently)

**`content-domain-swap`** — same item and type as `content-typical`, `privacyDomain=domain-shared`. Produces a **different** AD (len 100), so ciphertext moved to another domain fails authentication (ADR 0071 R3).

```text
adHex   000000167069636f2e6d656d2e61642e636f6e74656e742e763100000011
        7069636f2e73756974652e6d656d2e7631000000126d656d5f3031687a78
        386d397134727435760000000d646f6d61696e2d7368617265640000000a
        746578742f706c61696e
```

**`content-suite-v2`** — same as `content-typical` but `suite=pico.suite.mem.v2`. Produces a **different** AD (len 101), so a suite downgrade fails authentication.

```text
adHex   000000167069636f2e6d656d2e61642e636f6e74656e742e763100000011
        7069636f2e73756974652e6d656d2e7632000000126d656d5f3031687a78
        386d397134727435760000000e646f6d61696e2d707269766174650000000a
        746578742f706c61696e
```

Both differ from `content-typical` in exactly the bound field, demonstrating R3: a ciphertext row moved to another domain, or reinterpreted under another suite, reconstructs a different AD and the Poly1305 tag check fails.

### canonicalization-negative (rejected before any AD is produced)

| fixtureId | family | violation | reason |
|---|---|---|---|
| `reject-empty-content-type` | content | `contentType` = `""` | `empty_field` |
| `reject-space-in-domain` | content | `privacyDomain` = `"domain private"` | `invalid_field_charset` |
| `reject-nonascii-item-id` | content | `memoryItemId` = `"mém"` (non-ASCII) | `invalid_field_charset` |
| `reject-overlong-item-id` | content | `memoryItemId` length 1025 | `field_too_long` |

Each maps to `canonicalization_error`; the builder emits no AD.

## Security-relevance gate status

This ADR closes ADR 0071 gate point 1 (canonical AD byte layout + published vectors with swap/domain/suite negatives). It does **not** by itself make encryption security-relevant. Still required before the `domain_encrypted` posture becomes writable or anything advertises encryption:

- gate point 2: key-storage design satisfying R6 — **designed** (ADR 0072); its implementation steps are separately tracked;
- gate point 3: encrypt/decrypt round-trip and crypto-shred fixtures — **open**.

Until all three are met, the memory store stays plaintext-at-rest foundation data under the ADR 0070 ordering.

## Non-goals

This ADR does not define or implement:

- any encryption, decryption, DEK generation, KEK handling or nonce generation (ADR 0071 suite; runtime deferred)
- the on-disk fixture files or a conformance runner (a later `high` implementation step seeds `docs/protocol/fixtures/memory-content-ad/` from these authoritative vectors)
- canonicalization for any Pico Link or Pico Home Link wire object (open under ADR 0034 / ADR 0047)
- hash-derived identifiers, signatures, key serialization or a JSON Schema dialect
- padding policy (ciphertext length still leaks approximate size — ADR 0071 residual)
- a stable public API error code set (reasons here are ADR 0034 conceptual categories)

## Relationship to other ADRs

Realizes:

- `0071-memory-content-encryption-threat-model-and-primitive-direction.md` — gate point 1 and requirement R3 canonical AD binding
- `0034-canonicalization-signature-inputs-and-test-vectors.md` — supplies the concrete "protected-payload associated data" canonical bytes for one surface, in the ADR 0034 fixture model

Stays within and below:

- `0016-cryptography-boundaries-and-non-goals.md` — reviewed primitives only; this ADR chooses only a byte framing, no primitive
- `0047-draft-canonicalization-rejection-placeholder.md` — unlocks canonical bytes for the memory-content AD surface only; the Pico Link draft-surface lock is unchanged
- `0032-pico-link-envelope-and-credential-schema-direction.md` — `algorithmSuite` / key-envelope vocabulary
- `0070-memory-store-encryption-at-rest-and-crypto-shredding-boundary.md` — protection-before-exposure ordering
- `0072-memory-domain-key-storage-and-backup-separation.md` — gate point 2, sibling prerequisite

## Consequences

Positive:

- ADR 0071 gate point 1 is closed with authoritative, reproducible vectors, including the swap/domain/suite negatives the gate demands
- the AD construction is minimal, library-free and cross-language, and its injectivity and downgrade-binding are demonstrated by verified vectors
- Unicode normalization is removed from the AD surface entirely by the ASCII-token constraint, not merely deferred
- the choice is scoped: it does not pre-commit any Pico Link wire encoding, and it is independently versioned
- the next step (encrypt-on-write) has an exact, testable target for AD bytes

Negative:

- the AD is not human-readable or self-describing; interpreting the bytes requires this ADR
- the ASCII-token charset constrains future identifier and media-type choices to that set (currently sufficient); a broader charset would need a new AD construction version
- a second AD construction version (`pico.mem.ad.*.v2`) is required if the field set, order or framing ever changes — by design, so changes are explicit and downgrade-detectable
- these vectors become a compatibility contract: once encrypt-on-write ships, changing them would break existing ciphertext authentication
