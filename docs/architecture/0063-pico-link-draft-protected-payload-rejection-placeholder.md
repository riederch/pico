# 0063 - Pico Link Draft Protected Payload Rejection Placeholder

## Status

Accepted as a draft-only Pico Link protected payload rejection boundary that deepens ADR 0044, before encryption, signatures, key wrapping, canonicalization or verified sender/audience authority are implemented.

Status note, 2026-08-12: **superseded by ADR 0107**, with the same delay as
ADR 0044 and a sharper reason. Its core rule requires a draft protected
payload to *reject* real-crypto claims and verified sender or audience
claims - so a fixture built to this ADR would reject the envelope the
product actually sends. That is not a boundary that has aged; it is one
that now points the wrong way. What survives is the concern underneath it,
`protected_plaintext_leak`, which ADR 0107 answers by sealing rather than
by a fixture rule. Do not use this as current direction.

## Context

ADR 0016 keeps cryptography a non-goal until a threat model, key lifecycle, reviewed primitives, canonicalization and test vectors exist.

ADR 0029 separates Pico Identity Keys, Device Keys, Home Host Keys and Domain Content Keys, and keeps hosting ciphertext separate from decryption authority.

ADR 0031 requires that relay and transport see only metadata, never plaintext, and that domain reads stay separate from hosting.

ADR 0032 defines a conceptual protected payload envelope schema family: a protected payload carries an opaque, encrypted body plus a key envelope and claimed sender, and relay-visible fields must never leak plaintext.

ADR 0044 defines the first constrained draft-only protected payload placeholder shape: synthetic placeholders for protection, claimed sender, claimed audience and body, with no real encryption, signature, key envelope, canonicalization or verified authority.

ADR 0042 stages draft Pico Link fixtures below runtime, cryptography, relay and compatibility claims.

The protected payload is the end-to-end confidentiality surface: the inner body a provider, relay or host must never read. So far the draft suite has only a positive `opaque-placeholder` fixture and no rejection fixtures. Nothing yet proves that a payload leaking plaintext, claiming real encryption, embedding key material or asserting a verified sender is rejected.

The next useful step is a set of rejection placeholders that make the most dangerous protected-payload interpretations fail early.

## Decision

Future draft Pico Link protected payload fixtures may use rejection placeholders in addition to the ADR 0044 positive placeholder.

These placeholders are not cryptography. They do not encrypt, sign, wrap keys, verify senders or verify audiences. They only make unsafe draft inputs rejectable at fixture level.

A draft protected payload keeps its body opaque, its protection a placeholder, its key envelope absent and its claimed sender and audience unverified. Any input that breaks these boundaries is rejected.

## Core rule

```text
A draft protected payload is an opaque placeholder body with no crypto and no verified authority.
It must reject plaintext leaks, real-crypto claims, embedded key material and verified sender/audience claims.
```

## Rejection boundaries

A draft protected payload must reject:

- a body that carries plaintext instead of an opaque placeholder reference
- a protection block that claims a real encryption mode or algorithm suite instead of a placeholder
- embedded key material, wrapped domain keys, ciphertext or signatures in the record
- a claimed sender whose proof status is verified or that claims signing authority
- a claimed audience that claims verified reader authority or domain-decryption rights
- relay-visible or top-level plaintext of any kind
- fixtures that omit required draft disclaimers
- fixtures that claim compatibility above draft-only
- fixtures that imply production security or commercial permission

## Draft rejection reasons

Draft protected payload fixtures may use these rejection reasons:

```text
protected_plaintext_leak
protected_real_crypto_claim
protected_key_material
protected_sender_authority_claim
```

`protected_plaintext_leak` is shared with the packet-envelope surface. The other three are draft vocabulary for a real-encryption claim, embedded key material and a verified sender authority claim.

These values are draft vocabulary only. They are not final conformance error codes.

## A protected body is not plaintext

A draft protected payload body stays an opaque placeholder reference.

It must not:

- carry plaintext content
- expose a readable message body
- present decoded content as if it were the protected payload
- leak plaintext in any relay-visible or top-level field

The body a relay, host or provider sees stays opaque until real encryption and reader authority exist.

## A placeholder is not real crypto

A draft protected payload protection block stays a placeholder.

It must not claim:

- a real encryption mode
- a real algorithm suite
- a completed sealing operation
- verified cryptographic protection

Real cryptography stays a non-goal until ADR 0016 prerequisites and ADR 0034 canonicalization and signature inputs exist.

## A record does not embed key material

A draft protected payload record does not embed secret material.

It must not include:

- wrapped or raw Domain Content Keys
- private identity or device keys
- ciphertext presented as verified protection
- signatures presented as verified authority
- recovery material or credentials

Key envelopes stay absent references, not embedded material.

## A claimed sender is not verified authority

A draft protected payload names a claimed sender and audience.

It must not claim:

- a verified sender proof
- sender signing authority
- verified audience reader authority
- domain-decryption rights for the audience

Sender and audience stay unverified placeholders until identity, delegation and membership verification exist.

## Relationship to the packet envelope

ADR 0043 packet-envelope placeholders keep relay-visible routing and delivery metadata plus an opaque protected-payload reference, and reject relay-visible plaintext with `protected_plaintext_leak`.

ADR 0063 narrows the inner protected payload: it keeps the body opaque, rejects inner plaintext leaks, and additionally rejects real-crypto claims, embedded key material and verified sender/audience authority claims. The outer packet and inner payload remain separate surfaces.

## Relationship to future verification

Before protected payloads carry security meaning, later ADRs must define:

- payload encryption and algorithm suites
- key envelope construction and domain membership
- canonicalization and signature inputs
- sender identity and delegation verification
- audience reader-set and domain-decryption semantics
- relay and host plaintext-exposure guarantees
- audit persistence and visibility
- verifier behaviour for leaking, key-bearing or authority-claiming payloads
- conformance fixture families for positive and negative protected-payload verification

Until then, protected payload fixtures may only prove placeholder boundaries and rejection of unsafe claims.

## Demo boundary

A walking-skeleton demo may reference protected payload placeholders only as visibly unverified fixture data.

The demo must not:

- encrypt or decrypt a real payload
- embed real key material
- verify a sender or audience
- expose plaintext to relay or host
- publish compatibility or security claims

If a demo needs real protected payloads, this ADR is insufficient and reviewed cryptography, key envelope, canonicalization and membership designs must come first.

## Implementation status

This ADR is documentation and fixture-gate direction only.

The repository does not implement:

- protected payload encryption or signing
- key envelope construction
- sender or audience verification
- canonicalization
- relay plaintext-exposure enforcement
- a conformance runner for protected-payload verification

## Non-goals

This ADR does not define:

- final protected payload schema
- cryptographic algorithms
- key envelope schema
- canonicalization output
- signature formats
- sender or audience verification protocol
- runtime parser
- production verifier
- compatibility level
- commercial permission

## Relationship to other ADRs

This ADR refines:

- `0044-pico-link-draft-protected-payload-placeholder.md`

It depends on and stays below:

- `0016-cryptography-boundaries-and-non-goals.md`
- `0029-identity-device-home-keys-and-e2e-boundaries.md`
- `0031-pico-link-identity-relay-and-domain-threat-model.md`
- `0032-pico-link-envelope-and-credential-schema-direction.md`
- `0034-canonicalization-signature-inputs-and-test-vectors.md`

It is staged under:

- `0042-pico-link-draft-schema-and-fixture-gate.md`

It is similar in staging intent to:

- `0043-pico-link-draft-packet-envelope-preflight.md`
- `0062-pico-link-draft-signed-event-segment-placeholder.md`

It remains below future Pico Link cryptography, key envelope, canonicalization, membership and conformance specifications.

## Consequences

Positive:

- gives the protected payload surface its first rejection coverage
- hardens the end-to-end confidentiality boundary against plaintext leaks, real-crypto claims, embedded key material and verified-authority claims
- keeps the outer packet and inner payload boundaries distinct
- makes the most dangerous protected-payload interpretations rejectable early

Negative:

- adds more draft fixtures before a runtime exists
- draft fixture fields may need migration when final schemas are selected
- implementers must remember that these fixtures prove no encryption, no key wrapping and no verified authority
