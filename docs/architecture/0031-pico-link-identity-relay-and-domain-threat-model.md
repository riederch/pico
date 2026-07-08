# 0031 - Pico Link Identity, Relay and Domain Threat Model

## Status

Accepted as a pre-implementation threat-model constraint for Pico Link, Pico Home Link, key lifecycle, relay transport and protected domains.

## Context

ADR 0028 defines Pico Link as the future transport-neutral communication layer and says Pico Relay is transport, not authority.

ADR 0029 separates Pico Identity Keys, Device Keys, Pico Home Host Keys, Home Membership Credentials, Domain Content Keys, Transport Session Keys and Relay Routing Identities.

ADR 0030 keeps the current Foundation HTTP API inside a trusted local diagnostics boundary until authentication, membership, Pico Link and cryptographic boundaries exist.

ADR 0032 defines conceptual schema families for Pico Link packet envelopes, protected payload envelopes, signed event segments, replica manifests, key envelopes, Home membership credentials and compatibility advertisements.

ADR 0033 defines lifecycle, rotation, revocation, lost-device, reset and recovery boundaries for the key and credential roles described here.

ADR 0034 defines canonicalization, signature-input and test-vector boundaries required before signatures, hashes or compatibility claims can carry security meaning.

Before Pico can design wire schemas, key lifecycle or an executable walking-skeleton demo, it needs a concrete threat model for identity, device, Home, relay metadata and encrypted content domains.

## Decision

Pico treats Vaults, devices, Homes, relays, transports and protected content domains as separate trust zones.

This ADR defines the expected attackers, protected assets and minimum design requirements before implementing real Pico Link remote communication, Home membership, signed event history, key envelopes or a relay-backed tech demo.

It does not choose algorithms, key formats, packet schemas, recovery schemes or a group messaging protocol.

## Core rule

```text
Identity proves who speaks.
Membership proves where a Pico may live.
Domain keys decide who can read.
Relays and transports only move ciphertext.
Homes host; they do not become owners.
```

## Protected assets

| Asset | Why it matters | Must not be exposed to |
|---|---|---|
| Pico Identity private key material | Long-lived identity root for one Pico. | Pico Home, Pico Relay, transport adapters, browser-only light clients, untrusted backups. |
| Device private key material | Operational signing/decryption authority for a trusted device or Pico Vault. | Pico Home by hosting alone, relays, other residents, untrusted surfaces. |
| Pico Home Host private key material | Host infrastructure continuity and endpoint identity. | resident Pico private domains, relay operators, guest devices. |
| Home Membership Credentials | Scoped permission to use a Pico Home. | forgery, replay, silent widening, host-only mutation without audit. |
| Domain Content Keys | Ability to read protected spaces. | hosts, relays, non-member Picos, revoked devices, unauthorised surfaces. |
| Signed event segments and manifests | Integrity and authorship of replicated history. | host rewrite, relay modification, malicious device scope escalation. |
| Plaintext payloads | Private messages, memory, location, context and action data. | relays, transport adapters, hosts without explicit domain access. |
| Routing and delivery metadata | Relationship, presence, timing and traffic-shape evidence. | unnecessary relay disclosure, broad diagnostics, long retention. |
| Recovery and reset material | Ability to regain access or replace keys. | relays, host admins, Move-In Codes, unmanaged cloud state. |
| Audit records | Evidence of claim, membership, key rotation, revocation and access. | silent deletion, unauthorised rewriting, payload overexposure. |

## Trust zones

| Zone | Trust level | Notes |
|---|---|---|
| Pico Vault | highest local Pico trust | May hold identity, device, domain keys and durable private state when configured. |
| Trusted device keystore | high but scoped | May hold delegated device keys, preferably hardware- or platform-backed when available. |
| Pico Surface | limited | Presents and captures interaction. Must not silently become a full key or knowledge owner. |
| Pico Home | host infrastructure | May route, store, sync and provide local services. Hosting is not plaintext or identity ownership. |
| Home Host Pico | host-administration role | May manage residency and host access within scope. Must not read resident private domains by role alone. |
| Pico Relay | untrusted transport helper | May route, queue, deduplicate and rate-limit ciphertext. Must not decrypt, authorise or become identity authority. |
| Transport adapter | untrusted or low-trust transport | Handles medium-specific delivery limits. Must not define Pico identity or content authority. |
| Public network | hostile | May observe, delay, replay, drop, reorder or inject traffic. |
| Local network | not inherently trusted | May contain arbitrary clients. Current Foundation API remains local/trusted only until a real boundary exists. |

## Attacker model

Pico must design for at least these attackers:

| Attacker | Capabilities |
|---|---|
| Passive relay observer | Sees timing, size, routing hints, retry behaviour and relay account or endpoint identifiers. |
| Malicious relay | Drops, delays, reorders, replays, duplicates or selectively forwards packets; may lie about delivery metadata. |
| Malicious transport adapter | Corrupts, fragments incorrectly, leaks transport identifiers or maps transport identities to Pico trust. |
| Compromised Pico Home | Reads host storage and operational metadata; may try to rewrite resident history or impersonate residents. |
| Curious Home Host Pico | Has legitimate host-administration role but tries to read member private domains or infer relationships. |
| Compromised device | Holds delegated keys and may sign within or beyond its intended scope until revoked. |
| Stolen light client or Pico Surface | Has UI/session access and cached state, but should not hold durable unrestricted authority. |
| Local network attacker | Can reach local ports, attempt DNS rebinding, inject LAN traffic or abuse unauthenticated diagnostics. |
| Replay attacker | Reuses old packets, membership credentials, invitations, Move-In Codes or key-rotation statements. |
| Metadata correlator | Combines relay, Home, timing, size, presence and location metadata to infer relationships. |
| Backup or restore attacker | Restores stale state, stale credentials or old key material to bypass revocation. |
| Malicious compatible implementation | Claims compatibility while weakening semantics, authority boundaries or conformance expectations. |

## Required security properties

Future Pico Link and Pico Home Link designs must support these properties:

- a relay cannot read Pico plaintext payloads
- a relay cannot forge a valid Pico payload as another Pico
- a relay cannot become the source of truth for Pico identity or relationships
- a Pico Home cannot sign as a resident Pico by hosting that resident
- a Home Host Pico cannot decrypt Home Member private domains by role alone
- a device cannot exceed delegated scope without detection
- revoked devices and evicted Home members cannot keep gaining new access through old credentials
- replayed invitations, Move-In Codes, membership credentials and packets can be detected or bounded
- signed history or manifests can detect host or relay modification
- domain membership changes are auditable
- transport-specific identifiers cannot become Pico identities
- metadata exposure is classified, minimised and retention-bounded where practical
- compatibility claims require conformance tests before becoming strong public claims

## Current concrete threat posture

| Threat | Current posture | Required direction |
|---|---|---|
| Relay reads private content | Relay does not exist yet. | Pico Link payloads must be encrypted above transport before relay use. |
| Relay or transport forges identity | Not implemented. | Signed payloads, device delegations and identity verification must exist before trusted remote semantics. |
| Host forges resident history | Foundation events are unsigned and `signature` is unverified metadata. | Define signed segments or manifests before resident history has security meaning. |
| Home Host reads member private data | Private domains do not exist yet. | Domain keys must not be granted by host role alone. |
| Device compromise | No device key model yet. | Delegation, revocation, rotation and lost-device flow are required before real private domains. |
| Replay of claim or membership | Move-In Code and membership are conceptual only. | Credentials need expiry, nonce or equivalent replay limits plus audit. |
| Metadata leakage through relays | Acknowledged but not solved. | Classify metadata, minimise routing hints and define retention expectations before production relay. |
| Local Foundation API abuse | Trusted-local boundary only. | Broader exposure requires ADR 0030 hardening decisions. |
| False compatibility claim | No conformance suite yet. | Keep claims experimental until tests exist. |

## Metadata privacy requirements

Encryption of payloads is not enough. Pico must treat metadata as potentially sensitive.

Relay-visible metadata should be classified before implementation:

| Metadata | Sensitivity | Direction |
|---|---|---|
| packet size | medium | Pad, bucket or limit where practical for sensitive classes. |
| packet timing | medium to high | Avoid unnecessary high-frequency telemetry. |
| destination hint | high | Use the least specific routable hint; avoid exposing Pico identity where a routing identity is enough. |
| sender routing identity | high | Keep separate from Pico Identity Key. |
| priority | medium | Avoid leaking emergency or relationship meaning unless necessary. |
| TTL and expiry | low to medium | Keep operational but do not encode private semantics unnecessarily. |
| delivery receipts | medium | Scope visibility and retention. |
| presence and availability | high | Make scoped, visible, revocable and purpose-bound. |
| location or emergency context | very high | Use minimal precision, short retention and explicit policy. |

Low-bandwidth transports need stricter metadata and payload limits because repeated small packets can still reveal presence, movement, relationships and routines.

## Relay trust boundary

Pico Relay may:

- route encrypted packets
- queue packets until expiry
- deduplicate packets
- enforce rate limits and abuse controls
- expose limited delivery metadata
- support multiple relay operators

Pico Relay must not:

- decrypt Pico payloads
- own Pico Identity Keys
- issue Home Membership Credentials
- authorise actions
- decide Pico Rules outcomes
- become the only recovery path
- require one central provider
- make relay account identity equivalent to Pico identity

Relay routing identities may be stable enough for delivery, but they must remain below Pico identity semantics and must be replaceable.

## Device and lost-device requirements

Before Device Keys are implemented, define:

- how a device is delegated by a Pico identity or trusted recovery path
- which operations the device may sign
- which domains the device may decrypt
- how the user recognises the device
- how revocation is represented
- how key rotation happens after compromise
- how old encrypted content behaves after revocation
- how stale backups avoid resurrecting revoked authority
- how surfaces differ from full Pico Vaults

Revocation must not require destroying the Pico identity unless the identity root itself is compromised.

## Home membership requirements

Before Home Membership Credentials are implemented, define:

- issuer and verifier roles
- Home Host Pico and Home Member Pico scopes
- invited, active, revoked and evicted states
- expiry and replay limits
- relationship to Pico Home Host Key
- relationship to Domain Content Keys
- audit records for claim, invitation, acceptance, revocation and eviction
- reset and recovery behaviour for a Pico Home

Membership grants use of host infrastructure. It does not grant resident plaintext access unless a protected domain explicitly grants that access.

## Domain key requirements

Before Domain Content Keys are implemented, define:

- protected domain classes
- reader membership model
- key wrapping format
- rotation on device revocation
- rotation on member removal where needed
- behaviour for historical content
- deletion and crypto-shredding expectations
- backup and restore semantics
- audit metadata that avoids exposing sensitive plaintext

Append-only events must not become undeletable sensitive memory by accident. ADR 0014 still controls deletion and payload-reference direction.

## Walking-skeleton demo gate

A walking-skeleton tech demo may be built only after the following exist as drafts:

- Pico Link packet envelope schema
- role-bound threat model from this ADR
- placeholder signed/encrypted envelope semantics
- explicit statement that demo crypto, auth, membership and conformance are stubbed or absent
- test fixtures that prove relays see only demo metadata and opaque payloads

The demo should stop if it pressures the project to implement:

- real remote access through Foundation HTTP
- ad hoc cryptography
- long-lived relay credentials as Pico identity
- Home membership without signed/scoped credentials
- claim flows without setup-mode and replay analysis
- conformance or compatibility claims without tests

## Implementation prerequisites

Before real Pico Link remote communication:

- choose reviewed cryptographic primitives or protocols under ADR 0016
- define key serialization and public identity formats
- define device delegation and revocation
- define Home Host Key persistence and reset semantics
- define Home Membership Credential format
- define domain key envelope format
- define replay protection and ordering expectations
- define signed event segment or manifest semantics
- define relay metadata classification and retention
- define endpoint authentication and local pairing or ingress where browser access exists
- define conformance tests for claimed surfaces

## Current implementation status

The current repository does not implement:

- Pico Identity Keys
- Device Keys
- Pico Home Host Keys
- Home Membership Credentials
- Domain Content Keys
- key envelopes
- signed event segments
- verified event signatures
- encrypted Pico Link payloads
- Pico Relay
- production remote access

The current Foundation API remains trusted-local diagnostics and foundation plumbing.

## Non-goals

This ADR does not implement:

- cryptography
- key generation
- key serialization
- a key registry
- relay software
- Pico Link wire format
- Home membership APIs
- claim APIs
- recovery UI
- conformance suite

It also does not bless PGP, MLS, Signal, age, libsodium or any specific primitive as the required Pico protocol.

## Consequences

Positive:

- turns the ADR 0029 key-role boundary into concrete threat-model work
- prevents the relay from becoming accidental identity or authority
- gives future packet-envelope work explicit metadata limits
- defines a gate for a safe walking-skeleton demo
- keeps host administration separate from resident data access

Negative:

- adds required design work before remote communication can ship
- delays attractive demos until schema and threat-model drafts exist
- requires metadata privacy choices that may reduce convenience
- makes compatibility claims dependent on future conformance tests

## Relationship to other ADRs

This ADR extends and constrains:

- `0014-deletability-and-append-only-events.md`
- `0016-cryptography-boundaries-and-non-goals.md`
- `0018-presence-context-and-location-sharing.md`
- `0019-home-assistant-threat-model.md`
- `0024-server-bootstrap-tenancy-and-eviction.md`
- `0025-inter-pico-communication-compatibility.md`
- `0027-dedicated-pico-home-image-and-first-boot-setup.md`
- `0028-pico-link-transport-facade-and-relay-network.md`
- `0029-identity-device-home-keys-and-e2e-boundaries.md`
- `0030-foundation-api-exposure-and-local-trust-boundary.md`
- `0032-pico-link-envelope-and-credential-schema-direction.md`
- `0033-key-lifecycle-rotation-revocation-and-recovery.md`
- `0034-canonicalization-signature-inputs-and-test-vectors.md`

It does not replace those ADRs. It defines the minimum threat-model boundary that future Pico Link schemas, relay work, Home membership, domain key work and walking-skeleton demos must respect.
