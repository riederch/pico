# 0065 - Pico Link Draft Packet Envelope Rejection Placeholder

## Status

Accepted as a draft-only Pico Link packet envelope rejection boundary that deepens ADR 0043, before relay routing, transport encryption, metadata-privacy enforcement or compatibility are implemented.

Status note, 2026-08-12: **superseded by ADR 0147 RY1.** This was the
rejection counterpart to ADR 0043 and it goes with it. Its boundaries
assume fields ADR 0147 removed - a routing ID that must not be a Pico
identity, a payload block that must not carry crypto claims, relay-visible
metadata that must not leak a relationship - and a rejection rule for a
field that does not exist has nothing left to reject. Two of its four draft
reasons survive as substance rather than as vocabulary:
`packet_routing_pico_identity` is answered by a mailbox belonging to a
relationship rather than to a Pico, and `packet_relay_metadata_leak` by the
four absent fields. Do not use this as current direction.

## Context

ADR 0028 defines Pico Link as a transport facade over relays: a relay forwards and queues packets but is not identity owner, action authorizer or plaintext reader.

ADR 0031 requires that relay-visible metadata stay minimal: even encrypted packets can leak timing, size, routing hints and relationship patterns, so relay-visible fields must not expose Pico identity, relationships or domains.

ADR 0032 defines a conceptual packet envelope schema family and requires routing identities to stay separate from Pico identities, and the payload to stay an opaque protected reference.

ADR 0043 defines the first constrained draft-only packet envelope preflight shape: relay-visible routing and delivery metadata plus an opaque protected-payload placeholder, with no Pico identity, no plaintext and no authority or crypto claims. The current draft suite has one positive packet-envelope fixture and one negative that rejects a relay-visible plaintext leak.

ADR 0044 and ADR 0063 govern the inner protected payload; the packet envelope is the outer, relay-visible surface.

The packet envelope is what a relay actually sees. So far only the plaintext-leak rejection is seeded. The still-open relay-visible risks - a Pico identity used as a routing ID, crypto claims smuggled into a supposedly opaque payload block, and relationship or domain metadata leaked in relay-visible fields - are not yet rejectable.

The next useful step is a set of rejection placeholders that make the most dangerous relay-visible interpretations fail early.

## Decision

Future draft Pico Link packet envelope fixtures may use rejection placeholders in addition to the ADR 0043 positive placeholder.

These placeholders are not a relay implementation. They do not route, encrypt, authorize or verify anything. They only make unsafe relay-visible draft inputs rejectable at fixture level.

A draft packet envelope keeps routing IDs separate from Pico identity, keeps the payload an opaque protected reference, and keeps relay-visible metadata minimal. Any input that breaks these boundaries is rejected.

## Core rule

```text
A packet envelope is relay-visible routing and delivery metadata plus an opaque payload reference.
It must reject Pico identity in routing, crypto claims in the payload block, relationship/domain metadata leaks and plaintext leaks.
```

## Rejection boundaries

A draft packet envelope must reject:

- a routing ID that is a Pico identity instead of a relay routing ID
- a payload block that carries ciphertext, signatures, key envelopes or algorithm suites instead of an opaque reference
- relay-visible fields that leak relationship or domain identity
- relay-visible plaintext of any kind
- fixtures that omit required draft disclaimers
- fixtures that claim compatibility above draft-only
- fixtures that imply production security or commercial permission

## Draft rejection reasons

Draft packet envelope fixtures may use these rejection reasons:

```text
protected_plaintext_leak
packet_routing_pico_identity
packet_payload_crypto_claim
packet_relay_metadata_leak
```

`protected_plaintext_leak` is shared with the protected-payload surface. The other three are draft vocabulary for a Pico identity in routing, a crypto claim in the payload block and a relay-visible relationship/domain metadata leak.

These values are draft vocabulary only. They are not final conformance error codes.

## Routing IDs are not Pico identity

A draft packet envelope routes over relay routing IDs.

A routing ID must not:

- be a Pico identity
- embed a Pico identifier
- let a relay map a route to a Pico
- reuse Pico identity as an address

Routing identity and Pico identity stay separate, consistent with ADR 0032.

## The payload block is an opaque reference

A draft packet envelope payload block references an opaque protected payload.

It must not carry:

- ciphertext
- signatures
- key envelopes or wrapped keys
- algorithm suites
- plaintext

Real protection lives in the inner protected payload governed by ADR 0044 and ADR 0063, not in the relay-visible packet.

## Relay-visible metadata stays minimal

A draft packet envelope exposes only routing and delivery metadata.

Relay-visible fields must not:

- name a relationship between Picos
- name a private or shared domain
- expose who is talking to whom
- expose subject or content hints

Metadata privacy is a first-class concern: even opaque packets must avoid leaking relationship and domain patterns to a relay.

## Relationship to the protected payload

ADR 0044 and ADR 0063 keep the inner protected payload opaque and reject inner plaintext, real-crypto claims, embedded key material and verified sender/audience authority.

ADR 0065 narrows the outer packet envelope: it keeps routing free of Pico identity, keeps the payload block an opaque reference, and keeps relay-visible metadata minimal. The outer packet and inner payload remain separate surfaces with separate rejection reasons.

## Relationship to future verification

Before packet envelopes carry security meaning, later ADRs must define:

- relay routing identity assignment and rotation
- transport encryption and metadata padding
- relationship-unlinkability and traffic-analysis defenses
- delivery, TTL and retry semantics
- relay trust, rate limiting and abuse handling
- audit persistence and visibility
- verifier behaviour for identity-leaking, crypto-claiming or metadata-leaking packets
- conformance fixture families for positive and negative packet-envelope verification

Until then, packet envelope fixtures may only prove placeholder boundaries and rejection of unsafe claims.

## Demo boundary

A walking-skeleton demo may reference packet envelope placeholders only as visibly unverified fixture data.

The demo must not:

- route over a real relay
- encrypt or authorize a real packet
- expose Pico identity, relationships or domains to a relay
- expose plaintext
- publish compatibility or security claims

If a demo needs real packet routing, this ADR is insufficient and reviewed relay, transport, routing-identity and metadata-privacy designs must come first.

## Implementation status

This ADR is documentation and fixture-gate direction only.

The repository does not implement:

- packet routing or relay forwarding
- transport encryption or metadata padding
- routing identity assignment
- metadata-privacy enforcement
- a conformance runner for packet-envelope verification

## Non-goals

This ADR does not define:

- final packet envelope schema
- cryptographic algorithms
- relay protocol
- routing identity scheme
- metadata-padding scheme
- delivery/retry protocol
- runtime parser
- production verifier
- compatibility level
- commercial permission

## Relationship to other ADRs

This ADR refines:

- `0043-pico-link-draft-packet-envelope-preflight.md`

It depends on and stays below:

- `0028-pico-link-transport-facade-and-relay-network.md`
- `0031-pico-link-identity-relay-and-domain-threat-model.md`
- `0032-pico-link-envelope-and-credential-schema-direction.md`
- `0044-pico-link-draft-protected-payload-placeholder.md`

It is staged under:

- `0042-pico-link-draft-schema-and-fixture-gate.md`

It is similar in staging intent to:

- `0063-pico-link-draft-protected-payload-rejection-placeholder.md`
- `0064-pico-link-draft-replica-manifest-placeholder.md`

It remains below future Pico Link relay, transport, routing-identity, metadata-privacy and conformance specifications.

## Consequences

Positive:

- extends packet-envelope rejection coverage beyond the plaintext leak
- hardens the relay-visible surface against Pico-identity routing, payload crypto claims and relationship/domain metadata leaks
- keeps the outer packet and inner payload boundaries distinct
- makes the most dangerous relay-visible interpretations rejectable early

Negative:

- adds more draft fixtures before a runtime exists
- draft fixture fields may need migration when final schemas are selected
- implementers must remember that these fixtures prove no routing, no encryption and no metadata-privacy enforcement
