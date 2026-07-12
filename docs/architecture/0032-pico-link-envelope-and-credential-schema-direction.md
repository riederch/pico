# 0032 - Pico Link Envelope and Credential Schema Direction

## Status

Accepted as a conceptual wire-schema direction for Pico Link, Pico Home Link, signed history, key envelopes and future conformance work.

## Context

ADR 0028 defines Pico Link as transport-neutral communication carried by relays, direct transports or future adapters.

ADR 0029 defines separate key roles for Pico identity, devices, Homes, domains, transport sessions and relay routing.

ADR 0031 defines the threat model for identity, relay metadata and protected domains. It also requires draft packet-envelope and signed/encrypted envelope semantics before a walking-skeleton tech demo can be safe.

ADR 0033 defines lifecycle, rotation, revocation, lost-device, reset and recovery boundaries for the key and credential roles referenced by these schema families.

ADR 0034 defines canonicalization, signature-input and test-vector boundaries for future signed objects, manifests, credentials and compatibility claims.

The project now needs conceptual schema families that future protocol work can refine without accidentally turning the current Foundation API into Pico Link or making premature cryptographic claims.

## Decision

Pico will define future wire schemas in layered families:

- Pico Link packet envelope
- protected payload envelope
- signed event segment
- replica manifest
- key envelope
- Home membership credential
- capability and compatibility advertisement

These schema families are conceptual. They describe roles, required semantics and boundaries. They are not final JSON schemas, binary encodings, canonicalization rules, algorithm choices, capability flags or compatibility guarantees.

## Core rule

```text
Outer envelopes route.
Protected envelopes hide content.
Signatures bind authorship and scope.
Manifests bind history.
Key envelopes grant reading authority.
Membership credentials grant host use.
```

## Layering model

Future Pico Link should preserve these layers:

```text
Pico/domain payload
-> protected payload envelope
-> signed event segment or signed message
-> Pico Link packet envelope
-> transport adapter frame
```

Transport adapters may add transport-specific framing, fragmentation, delivery receipts or routing data. They must not redefine Pico identity, content authority or protected payload semantics.

## Schema family overview

| Family | Purpose | Visibility |
|---|---|---|
| Pico Link packet envelope | Transport-neutral routing and delivery wrapper. | Relay and transport may see selected metadata. |
| Protected payload envelope | Carries encrypted or otherwise protected Pico payload. | Relay sees opaque payload only. |
| Signed event segment | Binds a sequence of events or messages to an author/device and scope. | Verifiers can validate authorship and integrity. |
| Replica manifest | Describes known event segments, ordering checkpoints and missing/deleted ranges. | Sync peers can compare state without trusting host rewrite. |
| Key envelope | Wraps domain keys for authorised readers. | Host may store it but cannot read wrapped secrets. |
| Home membership credential | Scoped signed proof that a Pico or device may use a Pico Home. | Home can verify host-use rights without gaining plaintext authority. |
| Capability advertisement | States supported experimental or stable protocol features. | Peers and Homes can negotiate behaviour. |

## Shared schema rules

All future schema families should follow these rules:

- include an explicit schema name or type
- include a version or compatibility marker
- include stable identifiers where replay or deduplication matters
- separate routing identity from Pico identity
- separate issuer, subject and audience where credentials are involved
- include expiry or validity bounds for replay-sensitive material
- keep optional extensions namespaced
- allow unknown optional extensions to be ignored safely
- avoid embedding sensitive plaintext in durable host-visible metadata
- define canonicalization before any signature is security-relevant
- define test vectors before strong compatibility claims

Before canonicalization exists, any `signature`-like field remains opaque metadata.

## Pico Link packet envelope

A future Pico Link packet envelope routes an opaque payload across transports.

Conceptual shape:

```json
{
  "schema": "pico.link.packet",
  "schemaVersion": 1,
  "packetId": "pkt_...",
  "routing": {
    "destinationHint": "route_...",
    "senderRoutingId": "route_...",
    "replyHint": "route_..."
  },
  "delivery": {
    "ttl": 3,
    "expiresAt": "2026-07-08T12:00:00.000Z",
    "priority": "normal",
    "class": "message"
  },
  "content": {
    "contentType": "pico-link/protected",
    "payload": "base64url..."
  },
  "extensions": {}
}
```

Required semantics:

- `packetId` supports deduplication and replay handling.
- `routing` contains routable hints, not Pico identity proof.
- `delivery` is transport behaviour, not policy authority.
- `content.payload` is opaque to relays and transports.
- `extensions` are optional and namespaced.

The packet envelope must not include plaintext message content, domain keys, device private material, Home membership secrets or user-readable private context.

ADR `0043-pico-link-draft-packet-envelope-preflight.md` narrows the first allowed draft fixture shape for this family. It is still draft-only and does not define the final wire format.

## Protected payload envelope

A protected payload envelope carries encrypted or otherwise protected Pico content above transport.

Conceptual shape:

```json
{
  "schema": "pico.payload.protected",
  "schemaVersion": 1,
  "protection": {
    "mode": "encrypted",
    "algorithmSuite": "tbd",
    "keyEnvelopeRefs": ["keyenv_..."]
  },
  "sender": {
    "picoId": "pico_...",
    "deviceId": "device_..."
  },
  "audience": {
    "domainId": "domain_...",
    "intendedReaders": "domain_members"
  },
  "ciphertext": "base64url...",
  "extensions": {}
}
```

Required semantics:

- `algorithmSuite` cannot be filled with a custom primitive.
- `sender` identifies the claimed Pico/device at the protected layer, not relay routing identity.
- `audience` points to a protected domain or reader set.
- `keyEnvelopeRefs` identify how authorised readers obtain content keys.
- verifiers must not trust `sender` until signatures and key binding are defined.

ADR `0044-pico-link-draft-protected-payload-placeholder.md` narrows the draft-only placeholder boundary for this family until real encryption, key wrapping, canonicalization and verification semantics exist.

## Signed event segment

A signed event segment binds event or message records to an author, scope and ordering context.

Conceptual shape:

```json
{
  "schema": "pico.history.segment",
  "schemaVersion": 1,
  "segmentId": "seg_...",
  "author": {
    "picoId": "pico_...",
    "deviceId": "device_..."
  },
  "scope": {
    "domainId": "domain_...",
    "stream": "stream_..."
  },
  "range": {
    "firstSequence": 1,
    "lastSequence": 25,
    "previousSegmentId": null
  },
  "eventsHash": "hash_...",
  "signature": "sig_...",
  "extensions": {}
}
```

Required semantics:

- the segment signs a canonical representation, not display JSON.
- the author device must be delegated for the relevant scope.
- `previousSegmentId` or equivalent chaining should help detect missing history.
- payload posture and references must respect ADR 0014.
- a host may store segments, but cannot create valid resident segments without resident signing authority.

## Replica manifest

A replica manifest lets peers compare state without trusting one host's event listing.

Conceptual shape:

```json
{
  "schema": "pico.replica.manifest",
  "schemaVersion": 1,
  "replicaId": "replica_...",
  "owner": {
    "picoId": "pico_...",
    "deviceId": "device_..."
  },
  "domains": [
    {
      "domainId": "domain_...",
      "headSegmentId": "seg_...",
      "checkpoint": "hash_..."
    }
  ],
  "createdAt": "2026-07-08T12:00:00.000Z",
  "signature": "sig_...",
  "extensions": {}
}
```

Required semantics:

- manifests summarize known state for sync and audit.
- manifests must not expose private plaintext.
- manifests should help detect host omission, replay or stale restore.
- manifest signatures need canonicalization and device delegation rules before they are security-relevant.

## Key envelope

A key envelope grants an authorised reader access to a protected domain key or content key.

Conceptual shape:

```json
{
  "schema": "pico.key.envelope",
  "schemaVersion": 1,
  "keyEnvelopeId": "keyenv_...",
  "domainId": "domain_...",
  "issuer": {
    "picoId": "pico_...",
    "deviceId": "device_..."
  },
  "recipient": {
    "picoId": "pico_...",
    "deviceId": "device_..."
  },
  "wrappedKey": {
    "algorithmSuite": "tbd",
    "ciphertext": "base64url..."
  },
  "validity": {
    "notBefore": "2026-07-08T12:00:00.000Z",
    "expiresAt": null
  },
  "signature": "sig_...",
  "extensions": {}
}
```

Required semantics:

- hosts and relays may store key envelopes but must not read wrapped secrets.
- recipients must be authorised by domain membership.
- revocation and rotation behaviour must be defined before real use.
- stale backups must not resurrect revoked authority without detection.
- `wrappedKey.algorithmSuite` must refer to reviewed primitives once chosen.

ADR `0054-pico-link-draft-key-envelope-rotation-placeholder.md` narrows the first draft-only key-envelope rotation placeholder boundary for fixture work. It does not define Domain Content Key format, key wrapping algorithms, runtime decryption, key-envelope removal, completed rotation or historical erasure.

ADR `0055-pico-link-draft-identity-key-placeholder.md` narrows the first draft-only identity-key placeholder boundary for fixture work. It does not define final key record format, key serialization, algorithms, fingerprints, possession proofs, trust paths or runtime identity verification.

## Home membership credential

A Home membership credential proves scoped use of a Pico Home.

Conceptual shape:

```json
{
  "schema": "pico.home.membership",
  "schemaVersion": 1,
  "credentialId": "homecred_...",
  "homeId": "home_...",
  "homeHostKeyId": "homekey_...",
  "issuer": {
    "picoId": "pico_host_...",
    "deviceId": "device_..."
  },
  "subject": {
    "picoId": "pico_member_...",
    "deviceId": null
  },
  "role": "home_member",
  "scope": ["host.use", "packet.receive"],
  "validity": {
    "notBefore": "2026-07-08T12:00:00.000Z",
    "expiresAt": null
  },
  "status": "active",
  "signature": "sig_...",
  "extensions": {}
}
```

Required semantics:

- membership grants host use, not domain plaintext access.
- issuer authority must be verified against Home Host Pico and host state.
- credentials need replay, expiry, revocation and audit semantics.
- Move-In Code must not become this credential or any long-term key.
- Home reset and recovery need explicit rules before implementation.

ADR `0045-pico-home-link-draft-membership-credential-placeholder.md` narrows the draft-only placeholder boundary for this family until issuer verification, canonicalization, signature inputs, revocation and Home reset semantics exist.

## Capability and compatibility advertisement

Future compatibility claims need machine-readable capability advertisement.

Conceptual shape:

```json
{
  "schema": "pico.compatibility.claim",
  "schemaVersion": 1,
  "implementationName": "Example Pico Home",
  "implementationVersion": "0.1.0",
  "protocolVersion": "0.1.7",
  "surfaces": {
    "picoLink": false,
    "picoHomeLink": true
  },
  "capabilities": {
    "pico.core.events.v1": true
  },
  "conformance": {
    "suite": null,
    "result": "not_tested"
  },
  "extensions": {}
}
```

Required semantics:

- capability names must stay lowercase, namespaced and versioned.
- unsupported capabilities must not be implied by generic version strings.
- compatibility remains experimental until conformance tests exist.
- commercial permission is separate from compatibility.

ADR `0046-draft-compatibility-claim-placeholder.md` narrows the draft-only compatibility-claim placeholder boundary until conformance runner, official recognition, security and commercial-permission processes exist.

## Extension rules

Extensions must:

- use a namespace not owned by core Pico unless accepted into core
- be optional unless negotiated
- not redefine existing fields
- not weaken security, privacy or deletion semantics
- be safe for older peers to ignore if marked optional
- declare whether they are relay-visible or protected-payload-only

## Versioning and canonicalization

Future schema work must define:

- semantic meaning of `schemaVersion`
- protocol version interaction
- canonical serialization for signatures, constrained by ADR 0034
- unknown field handling
- required versus optional fields
- downgrade handling
- test vectors

Until those exist, examples in this ADR are non-normative.

## Walking-skeleton demo implication

A walking-skeleton demo may use simplified forms of these schema families only if it labels them as demo-only and avoids security claims.

Minimum demo-safe behaviour:

- relay receives a packet envelope with opaque payload
- relay does not inspect protected payload contents
- routing identities remain separate from Pico identities
- membership and key envelopes are stubbed or clearly absent
- tests assert relay-visible fields do not contain plaintext message content

## Current implementation status

The repository currently implements none of these future schema families.

Current `PicoEvent.signature` remains unverified opaque metadata. Current `WS /ws` messages are Foundation realtime messages, not Pico Link packets. Current Foundation HTTP responses are trusted-local diagnostics, not Pico Home Link.

## Non-goals

This ADR does not implement or finalize:

- JSON Schema files
- binary encoding
- canonicalization
- cryptographic algorithms
- key serialization
- key generation
- signature verification
- relay software
- claim APIs
- membership APIs
- conformance tests
- stable public compatibility levels

## Consequences

Positive:

- gives future protocol work concrete schema families to refine
- keeps routing, identity, membership and domain access separate
- creates a safe target for walking-skeleton demo fixtures
- prevents Foundation HTTP and `WS /ws` from becoming accidental Pico Link
- makes future conformance planning more concrete

Negative:

- adds more design work before real remote communication
- requires canonicalization and test vectors before signatures matter
- may require revising examples once algorithms and formats are selected
- can expose more schema surface that must be versioned carefully later

## Relationship to other ADRs

This ADR extends and constrains:

- `0014-deletability-and-append-only-events.md`
- `0016-cryptography-boundaries-and-non-goals.md`
- `0025-inter-pico-communication-compatibility.md`
- `0028-pico-link-transport-facade-and-relay-network.md`
- `0029-identity-device-home-keys-and-e2e-boundaries.md`
- `0030-foundation-api-exposure-and-local-trust-boundary.md`
- `0031-pico-link-identity-relay-and-domain-threat-model.md`
- `0033-key-lifecycle-rotation-revocation-and-recovery.md`
- `0034-canonicalization-signature-inputs-and-test-vectors.md`

It does not replace those ADRs. It gives future Pico Link, Pico Home Link, relay, membership, key envelope and conformance work a shared schema vocabulary.
