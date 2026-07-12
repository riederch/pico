# 0042 - Pico Link Draft Schema and Fixture Gate

## Status

Accepted as a draft-schema and fixture-staging gate before Pico Link implementation.

## Context

ADR 0028 defines Pico Link as the future transport-neutral communication layer and keeps relay, LAN, VPN, WebSocket, Meshtastic and future transports behind adapters.

ADR 0029 separates Pico identity, device, Home, transport and domain key roles.

ADR 0031 defines the Pico Link identity, relay metadata and protected-domain threat model.

ADR 0032 defines conceptual schema families for Pico Link packet envelopes, protected payload envelopes, signed event segments, replica manifests, key envelopes, Home membership credentials and compatibility advertisements.

ADR 0033 defines key lifecycle, rotation, revocation and recovery boundaries.

ADR 0034 defines canonicalization, signature-input and test-vector boundaries.

The repository now has an experimental Foundation event/realtime fixture seed. The next protocol work needs a safe way to draft Pico Link fixture data without accidentally claiming production cryptography, relay compatibility, Home membership semantics or L4 conformance.

## Decision

Pico may add draft-only Pico Link and Pico Home Link schema fixtures before implementation, but only under a strict staging boundary.

Draft fixtures may describe and test:

- structural shape of relay-visible packet envelopes
- separation between routing identity and Pico identity
- absence of protected plaintext in relay-visible fields
- opaque protected-payload placeholders
- explicit rejection of unsafe plaintext or authority-bearing fields
- capability advertisement shape without claiming compatibility
- version and extension-field discipline

Draft fixtures must not claim:

- production encryption
- signature verification
- canonical byte stability
- key lifecycle verification
- Home membership authority
- relay interoperability
- Pico Home Link compatibility
- L4 conformance
- commercial permission

## Core rule

```text
Draft packet fixtures may prove shape and privacy boundaries.
They must not prove cryptography, authority or compatibility.
```

## Allowed draft fixture surfaces

Future draft machine-readable files may use these surfaces:

```text
pico-link
pico-home-link
canonicalization
compatibility-claims
```

`pico-link` draft fixtures may cover packet-envelope and protected-payload placeholder structure.

ADR `0051-pico-link-draft-device-credential-placeholder.md` defines the first draft-only Device Credential placeholder boundary for future Pico Link identity fixture work. Device Credential placeholders may describe scoped device-operation intent, but must not claim Pico identity ownership, Home membership, domain access, bearer-token authority, runtime verification or compatibility.

`pico-home-link` draft fixtures may cover membership-credential placeholder shape only after the issuer, subject, audience, expiry and revocation fields are described at a concept level. They must not make a credential accepted by runtime code before verification semantics exist.

ADR `0045-pico-home-link-draft-membership-credential-placeholder.md` defines that first draft-only placeholder shape for future Pico Home Link membership fixture work.

`canonicalization` draft fixtures may describe parse and rejection cases before canonical bytes are selected, but must not publish authoritative signature or hash vectors.

ADR `0047-draft-canonicalization-rejection-placeholder.md` defines the first draft-only canonicalization rejection placeholder shape for such future fixture work.

`compatibility-claims` draft fixtures may reject unsafe claim wording or missing disclaimer shape, but must not certify an implementation.

ADR `0046-draft-compatibility-claim-placeholder.md` defines the first draft-only compatibility-claim placeholder shape for such future fixture work.

## Required draft labels

Every draft fixture or suite outside the Foundation seed must state:

- `stage: "fixture_data"` only if machine-readable data exists
- `compatibilityLevel: "draft-only"` or equivalent wording
- runner status as not required and not official
- no production security guarantee
- no L4 compatibility basis
- no commercial permission

Human-readable notes must use words like `draft`, `experimental`, `placeholder` or `non-normative` where appropriate.

## Separate suites

Draft Pico Link or Pico Home Link fixtures must not be added to the current Foundation seed suite:

```text
docs/protocol/fixtures/suite.json
```

They should use a separate suite manifest if machine-readable fixture data is added, for example conceptually:

```text
docs/protocol/fixtures/pico-link/draft/suite.json
```

This separation prevents a Foundation L1 seed from becoming an implied Pico Link compatibility suite.

## Relay-visible packet envelope preflight

The first allowed Pico Link draft fixture family is a packet-envelope preflight.

ADR `0043-pico-link-draft-packet-envelope-preflight.md` defines the first constrained draft-only packet-envelope preflight shape for that family. It is fixture scaffolding, not the final wire format.

It may assert that relay-visible fields do not include:

- message text
- memory content
- action input payloads
- domain keys
- private key material
- Home membership secrets
- recovery material
- precise location
- health details
- relationship labels
- Pico identity private material

It may also assert that relay routing identities are not treated as Pico identity.

## Protected payload placeholder boundary

Draft protected-payload fixtures may include opaque placeholder values.

They must not include:

- real ciphertext
- real key envelopes
- real algorithm-suite claims
- real private keys
- production credentials
- canonical bytes
- signatures presented as verifiable

Any `algorithmSuite`, `signature`, `keyEnvelope` or `ciphertext` field in draft fixtures must be labelled placeholder or absent until later ADRs select reviewed primitives and verification semantics.

ADR `0044-pico-link-draft-protected-payload-placeholder.md` defines the first constrained draft-only protected-payload placeholder shape. It is not cryptography and must not be treated as encryption, signing, key wrapping or verified authority.

## Version and extension discipline

Draft schemas should still practice extension discipline:

- unknown fields are rejected by default
- extension points are explicit and namespaced
- extensions cannot affect authority, decryption, membership, deletion or lifecycle semantics unless a later ADR defines how
- relay-visible extensions must be checked for protected plaintext leakage

## Demo boundary

A walking-skeleton tech demo may consume draft fixture-like data only if:

- the data is labelled demo-only or draft-only
- relay-visible payloads remain opaque
- no production encryption claim is made
- no Home membership or claim flow is implied
- no compatibility level above draft is advertised
- no user data is used

The demo must be discarded or migrated before any production Pico Link implementation claim.

## Non-goals

This ADR does not define:

- final JSON Schema
- binary encoding
- canonicalization
- cryptographic algorithms
- signature formats
- key serialization
- Home membership verification
- relay server behaviour
- conformance runner CLI
- production compatibility certification

## Consequences

Positive:

- allows useful protocol fixture work before full cryptography
- keeps Foundation fixtures separate from Pico Link drafts
- gives metadata-privacy checks a concrete first target
- prevents draft fixtures from becoming compatibility claims

Negative:

- adds another staging layer to documentation
- draft fixtures may need migration or deletion when final schemas are selected
- implementers must tolerate that draft fixture data is deliberately non-normative

## Relationship to other ADRs

This ADR refines:

- `0025-inter-pico-communication-compatibility.md`
- `0028-pico-link-transport-facade-and-relay-network.md`
- `0031-pico-link-identity-relay-and-domain-threat-model.md`
- `0032-pico-link-envelope-and-credential-schema-direction.md`
- `0033-key-lifecycle-rotation-revocation-and-recovery.md`
- `0034-canonicalization-signature-inputs-and-test-vectors.md`

It does not replace the future normative Pico Link, Pico Home Link, canonicalization, cryptography, key lifecycle, relay or conformance-runner specifications.
