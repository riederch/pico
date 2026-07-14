# 0043 - Pico Link Draft Packet Envelope Preflight

## Status

Accepted as a draft-only packet-envelope preflight before Pico Link implementation.

## Context

ADR 0028 defines Pico Link as a transport-neutral facade above relays, direct transports and future adapters.

ADR 0029 separates Pico identity, device, Home, transport and protected-domain key roles.

ADR 0031 defines the relay metadata and Pico identity threat model.

ADR 0032 defines the conceptual Pico Link packet-envelope family, but intentionally does not define a final wire format.

ADR 0034 defines canonicalization and test-vector boundaries before signatures or hashes become security-relevant.

ADR 0042 allows draft-only Pico Link fixture work under a strict staging gate. The first useful draft fixture family is a packet-envelope preflight that proves relay-visible shape and privacy boundaries without claiming runtime support, cryptography or compatibility.

## Decision

Pico Link draft packet-envelope fixtures may use a constrained preflight shape.

This preflight shape is not the final wire format. It exists to keep future draft fixture data consistent while the project is still below cryptography, canonicalization, relay implementation and compatibility claims.

## Draft packet envelope shape

Draft fixtures may model a relay-visible packet envelope with only these top-level fields:

```json
{
  "schema": "pico.link.packet.draft",
  "schemaVersion": 1,
  "fixtureStage": "draft",
  "packetId": "pkt_draft_...",
  "routing": {
    "destinationRouteId": "route_...",
    "senderRouteId": "route_...",
    "replyRouteId": "route_..."
  },
  "delivery": {
    "trafficClass": "message",
    "priority": "normal",
    "ttl": 3,
    "expiresAt": "2026-07-12T12:00:00.000Z"
  },
  "payload": {
    "contentType": "application/vnd.pico.link.protected-placeholder+json",
    "placeholder": true,
    "protectedPayloadRef": "payload_placeholder_..."
  },
  "extensions": {}
}
```

The example is deliberately non-normative. Field names and values may change before implementation.

## Field semantics

`schema` identifies the draft fixture family only.

`schemaVersion` is a draft fixture version, not a Pico Link compatibility level.

`fixtureStage` must remain `draft` for this shape.

`packetId` is an opaque deduplication and replay-boundary identifier. It is not a Pico identity, device identity, Home identity, relationship label, plaintext hash or content-derived identifier.

`routing` contains route identifiers only. Route identifiers may be stable enough for delivery, but they are not Pico identity proofs, Home membership credentials, contact labels, account identifiers or authorization handles.

`delivery` contains relay handling hints. Delivery hints do not authorize actions, domain access, Home membership, deletion, recovery or policy decisions.

`payload` points to an opaque protected-payload placeholder. It is not real ciphertext and does not prove encryption, signing, key wrapping, canonicalization or payload compatibility.

`extensions` is optional draft-only metadata. Unknown top-level fields are rejected by default.

## Allowed draft delivery values

Draft preflight fixtures may use these `trafficClass` values:

```text
message
presence
wake_hint
system_probe
```

Draft preflight fixtures may use these `priority` values:

```text
low
normal
```

No draft packet-envelope fixture may encode emergency state, relationship meaning, medical status, location precision, financial urgency or action authority through `trafficClass`, `priority`, `ttl`, `expiresAt` or extension fields.

## Required rejection cases

Draft packet-envelope fixture checks should reject:

- unknown top-level fields
- missing `fixtureStage: "draft"`
- non-object `routing`, `delivery`, `payload` or `extensions`
- `routing` fields that contain Pico identity, device identity, Home identity, account identity, relationship labels or user-readable names
- plaintext message, memory, action input or private context in any relay-visible field
- `payload` fields named `ciphertext`, `signature`, `keyEnvelope`, `algorithmSuite` or `plaintext`
- unbounded delivery, including absent `expiresAt` or non-positive `ttl`
- delivery hints that imply authority, membership, deletion, recovery or policy decisions
- unnamespaced extension keys
- extension values that carry protected plaintext or authority semantics

## Extension discipline

Draft extensions must use a namespaced key.

Example:

```json
{
  "extensions": {
    "org.example.demo": {
      "note": "draft-only relay-visible demo metadata"
    }
  }
}
```

Relay-visible extensions may be ignored by older draft consumers. They must not alter identity, authority, decryption, membership, deletion, recovery or lifecycle semantics.

If an extension needs protected meaning, it belongs inside the protected payload, not in the relay-visible packet envelope.

## Relationship to protected payloads

The draft packet envelope does not define protected-payload contents.

ADR `0044-pico-link-draft-protected-payload-placeholder.md` defines the first draft-only protected-payload placeholder boundary. Packet-envelope fixtures must still treat that layer as opaque.

Protected payload work still requires later decisions for:

- encryption mode
- algorithm suite
- key envelope references
- sender identity proof
- audience and domain binding
- canonicalization
- signature inputs
- replay coverage
- test vectors

Until then, packet-envelope fixtures may only prove that a protected payload is opaque from the relay-visible layer.

## Demo boundary

A walking-skeleton tech demo may use this draft envelope only if:

- fixture or demo metadata says `draft-only`
- payloads are placeholders or otherwise opaque demo data
- no production encryption claim is made
- no relay interoperability claim is made
- no Home membership, Pico identity proof or action authority is inferred from routing fields
- no compatibility level above draft is advertised

## Non-goals

This ADR does not define:

- final Pico Link JSON Schema
- final binary encoding
- canonicalization
- cryptographic algorithms
- ciphertext format
- signature format
- key envelope format
- Home membership verification
- relay API behaviour
- runtime packet parser
- conformance runner
- production compatibility certification

## Consequences

Positive:

- gives future draft fixtures a concrete privacy-preserving first target
- keeps relay-visible metadata separate from Pico identity and protected payloads
- makes unsafe plaintext and authority leakage explicit rejection cases
- supports walking-skeleton planning without pretending to implement Pico Link

Negative:

- draft packet fixtures may require migration when final wire schemas are selected
- the preflight shape is intentionally conservative and may exclude useful future fields
- implementers must treat the example as fixture scaffolding, not a protocol contract

## Relationship to other ADRs

This ADR refines:

- `0028-pico-link-transport-facade-and-relay-network.md`
- `0029-identity-device-home-keys-and-e2e-boundaries.md`
- `0031-pico-link-identity-relay-and-domain-threat-model.md`
- `0032-pico-link-envelope-and-credential-schema-direction.md`
- `0034-canonicalization-signature-inputs-and-test-vectors.md`
- `0042-pico-link-draft-schema-and-fixture-gate.md`

It is deepened by:

- `0065-pico-link-draft-packet-envelope-rejection-placeholder.md`, which adds the first packet-envelope rejection boundaries for Pico identity in routing, payload crypto claims and relay-visible relationship/domain metadata leaks

It remains below the future normative Pico Link wire format, cryptography, canonicalization, relay, Home membership and conformance specifications.
