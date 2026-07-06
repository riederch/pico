# 0029 - Identity, Device, Home Keys and E2E Boundaries

## Status

Accepted as an identity, key-role and encryption-boundary concept.

## Context

ADR 0024 defines Pico Home as infrastructure that may host resident Picos without owning their identities, private keys or personal domains.

ADR 0027 defines the future Pico Home Image and Move-In Code flow for an Empty Pico Home.

ADR 0028 defines Pico Link as the transport-neutral communication layer between Picos, Homes and related Pico endpoints. It also states that Pico Relay and transport adapters must not decrypt payloads, authorize actions, own identities, alter signed content or become trust anchors.

ADR 0016 requires Pico to use reviewed cryptographic building blocks and forbids project-specific cryptographic primitives.

The next boundary needed before real Pico Link communication is a product-level separation of identity keys, device keys, home keys, transport keys, signatures and encrypted content domains.

## Decision

Pico separates identity, device, home, transport and content-domain key roles.

This ADR defines those roles and authority boundaries. It does not choose algorithms, wire formats, key serialization formats or a group messaging protocol.

## Core design rule

```text
Pico identity owns the person-level companion identity.
Devices hold delegated operational keys.
Homes host and route.
Relays transport.
Encrypted domains decide who can read content.
```

A Home Host Pico may manage residency on one Pico Home. It must not gain the private keys, plaintext data or signing authority of Home Member Picos by hosting them.

## Key roles

| Role | Purpose | Must not become |
|---|---|---|
| Pico Identity Key | Long-lived public identity root for one Pico identity. | a relay credential, host admin password, transport node ID or Move-In Code |
| Device Key | Key for one trusted Pico Vault, device or trusted client installation. | a permanent replacement for the Pico identity without explicit delegation |
| Pico Home Host Key | Host infrastructure identity for one Pico Home endpoint. | owner of resident Pico identities or resident personal domains |
| Home Membership Credential | Signed statement that a Pico or device may use a Pico Home with a defined role and scope. | plaintext access to resident personal domains |
| Domain Content Key | Key material for a Private Space, Shared Space or other protected domain. | a host administrator key or transport key |
| Transport Session Key | Shorter-lived keying material for a transport session or adapter. | Pico identity, domain decryption authority or policy authority |
| Relay Routing Identity | Transport/routing identifier used by a relay or adapter. | Pico identity, Pico Home identity or user trust anchor |

## Pico Identity Keys

A Pico Identity Key is the portable identity anchor for one Pico.

It may later be used to verify:

- device delegations
- membership assertions
- relationship or contact assertions
- signed manifests
- signed event segments
- key rotation statements
- recovery or migration statements, if a reviewed recovery model exists

A Pico Identity Key should be stable enough for relationships and compatibility claims, but it must still support documented rotation or replacement when compromise, migration or recovery requires it.

Private identity material must remain under the control of Pico Vaults, platform keystores, hardware-backed key storage or another explicitly trusted key holder. It must not be stored as plaintext host state on Pico Home or Pico Relay.

## Device Keys

A Device Key represents one trusted device, Pico Vault, full client or other trusted client installation.

Device Keys allow Pico to avoid using the long-lived Pico Identity Key for every operational signature.

A future Device Key model should support:

- explicit delegation from the Pico identity
- device naming or description for user recognition
- device capability scope
- revocation
- rotation
- lost-device handling
- signed event or manifest authorship
- local policy about which devices may read which domains

A compromised or retired device should be revocable without destroying the Pico identity.

Light clients and Pico Surfaces may use session credentials or scoped delegated keys, but they must not silently become durable knowledge owners or unrestricted signing authorities.

## Pico Home Host Keys

A Pico Home Host Key identifies a Pico Home endpoint as host infrastructure.

It may later be used to verify:

- that a transport endpoint is the same Pico Home previously claimed or trusted
- host operational state
- host membership records
- host invitations
- host audit records
- relay endpoint registration or routing hints

A Pico Home Host Key does not make the Home the owner of resident Picos.

It must not be used to:

- sign as a resident Pico
- decrypt a resident Private Space by hosting alone
- forge resident event history
- authorize personal actions without Pico Rules
- turn Pico Home into a public account authority

If the same physical machine runs a Pico Home and a Pico Vault, the host key and the resident Pico/device keys must remain separate roles.

## Home Membership Credentials

Home membership should be represented by signed, scoped credentials rather than implicit trust in host storage.

Future membership credentials should distinguish at least:

- Home Host Pico
- Home Member Pico
- invited Pico
- trusted device for a member Pico
- revoked or evicted membership
- optional service or emergency roles

Membership credentials may grant future use of a Pico Home for routing, storage, sync or host services. They do not automatically grant plaintext access to another resident's Private Space.

Eviction revokes future use of one host. It is not identity destruction and not global key deletion.

## Domain Content Keys

Data readability belongs to explicit protected domains.

Examples:

| Domain | Reader set direction |
|---|---|
| Private Space | authorized devices of the owning Pico |
| Shared Space | explicitly included Pico identities or devices |
| Household Space | configured Home members, not host ownership by default |
| Service or emergency space | role-, context-, purpose- and necessity-bound access |
| Host operational domain | host and Home Host Pico where appropriate |

Domain Content Keys should be wrapped or distributed only to authorized readers under a reviewed key-management design.

A host may store ciphertext for resident domains. Hosting ciphertext is not permission to read it.

## Transport and Relay Keys

Transport keys and relay routing identifiers exist below Pico Link semantics.

They may help establish sessions, reduce abuse, authenticate a transport endpoint or support delivery. They must not become Pico identity keys, Home membership credentials or domain decryption keys.

This applies to all transports, including:

- Pico Relay
- LAN/direct
- VPN/direct
- WebSocket
- future QUIC or WebRTC-style transports
- Meshtastic
- future radio or low-bandwidth adapters

Meshtastic channel keys, node IDs or radio-specific identities must remain transport-specific. They must not become Pico identity, Home identity or authority.

## Signatures

Pico should use signatures for integrity and authorship boundaries once the threat model and protocol formats are defined.

Future signed material may include:

- device delegations
- home membership credentials
- invitations
- event segments
- replica manifests
- domain membership changes
- key rotation statements
- relay or transport envelope bindings where needed
- audit records for claim, move-in, eviction and host administration

Signatures should make these properties possible:

- a host cannot forge a resident's history
- a relay cannot alter signed Pico payloads
- a device cannot exceed its delegated scope without detection
- deletion or missing segments can be detected by manifests or equivalent integrity records
- key rotation and revocation are auditable

The current foundation event API does not yet implement signed events, signed manifests or key envelopes.

## End-to-end encryption boundary

Pico Link payloads should be encrypted above the transport.

Conceptually:

```text
Pico/device/domain layer signs and encrypts payload
-> Pico Link packet envelope carries ciphertext
-> Transport Facade chooses adapter
-> Relay or other transport routes/queues/fragments ciphertext
-> recipient endpoint verifies and decrypts if authorized
```

Relays and transport adapters may see transport metadata needed for delivery, such as timing, size, routing hints, priority, TTL, expiry and retry behaviour. They must not see plaintext Pico payloads or gain authority to authorize actions.

A Pico Home endpoint may route, queue or store encrypted packets for local delivery. It must not read resident private payloads by hosting alone.

Metadata privacy remains a separate open design problem. Encryption of payloads does not hide all relationship, timing or traffic-shape information.

## Move-In Code boundary

The Move-In Code is only a temporary right to claim an Empty Pico Home.

It is not:

- a Pico Identity Key
- a Device Key
- a Pico Home Host Key
- a Domain Content Key
- a Transport Session Key
- a recovery secret
- a long-term administrator credential
- an authentication shortcut after claim

After a successful claim, the Move-In Code must be invalidated and the claimed host should rely on explicit host identity, membership, authentication, authorization and audit models.

## Algorithm and primitive boundary

This ADR intentionally does not choose:

- key algorithms
- signature algorithms
- key exchange algorithms
- group messaging state machines
- password or passkey mechanisms
- backup recovery schemes
- key serialization formats
- wire protocol formats

Implementation must follow ADR 0016: use reviewed primitives and documented threat models. Pico must not invent cryptographic primitives.

Future candidates may include platform keystores, passkeys or hardware-backed identity where appropriate, libsodium primitives, age-style backup protection, and reviewed group messaging approaches if group transport is required.

## Implementation implications

Before implementing real Pico Link remote communication, define at least:

- threat model for identities, homes, devices, relays and metadata
- Pico identity key lifecycle
- device delegation, revocation and lost-device handling
- Pico Home Host Key persistence and reset behaviour
- Home membership credential format and audit model
- domain content key wrapping and rotation
- event segment or manifest signature formats
- replay protection and ordering expectations
- compatibility capability flags
- conformance tests for advertised compatibility

Before implementing a public or protected claim write path, define at least:

- how a claimed host binds the Home Host Pico to membership credentials
- how the Pico Home Host Key is created, persisted and verified
- how the Move-In Code is proven without becoming an identity or encryption key
- how failed, replayed and expired claim attempts are audited
- how reset and recovery interact with host keys and membership

## Current implementation status

The current foundation implementation has:

- internal Pico Home claim-state storage
- a minimal claim-state diagnostic in `GET /api/system/status`
- Foundation event storage
- WebSocket event broadcast for Foundation events
- protocol capability names

It does not yet implement:

- Pico Identity Keys
- Device Keys
- Pico Home Host Keys
- Move-In Code generation or validation
- Home membership credentials
- domain content keys
- key envelopes
- signed event segments
- signed manifests
- end-to-end encrypted Pico Link payloads
- relay transport
- production authentication or authorization

Until these pieces exist, Pico must not claim production-ready remote communication, encrypted multi-resident hosting or strong Pico Link compatibility.

## Non-goals

This ADR does not implement:

- cryptography
- a key registry
- a public claim endpoint
- a relay server
- Pico Link wire format
- Home membership APIs
- recovery UI
- account management
- central identity service

It also does not make PGP, MLS, Signal, age, libsodium or any other named technology the required wire protocol.

## Consequences

Positive:

- gives Pico Link a clear authority boundary before implementation
- keeps Home, Relay and transport roles from becoming identity owners
- separates host administration from private-data access
- leaves room for reviewed cryptographic protocols
- makes Move-In Code limitations explicit
- gives future protocol and conformance work concrete key roles to test

Negative:

- adds more design work before remote communication can ship
- requires key lifecycle, recovery and revocation UX later
- metadata privacy remains unsolved
- conformance claims will need cryptographic test fixtures and compatibility discipline

## Relationship to other ADRs

This ADR extends and constrains:

- `0015-full-clients-light-clients-and-relay.md`
- `0016-cryptography-boundaries-and-non-goals.md`
- `0024-server-bootstrap-tenancy-and-eviction.md`
- `0026-product-terminology-and-naming.md`
- `0027-dedicated-pico-home-image-and-first-boot-setup.md`
- `0028-pico-link-transport-facade-and-relay-network.md`

The continuity rule is:

```text
Identity and encrypted domains stay above transport. Hosting and relay improve reachability; they do not create authority.
```
