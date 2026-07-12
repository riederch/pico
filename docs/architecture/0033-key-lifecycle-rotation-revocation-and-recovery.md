# 0033 - Key Lifecycle, Rotation, Revocation and Recovery

## Status

Accepted as a key-lifecycle, revocation and recovery concept.

## Context

ADR 0016 requires reviewed cryptographic building blocks and forbids Pico-specific cryptographic primitives.

ADR 0024 defines host tenancy and eviction as future host-use revocation, not resident identity destruction.

ADR 0027 defines the Move-In Code as a temporary Empty Pico Home claim right, not a recovery secret or encryption key.

ADR 0029 separates Pico Identity Keys, Device Keys, Pico Home Host Keys, Home Membership Credentials, Domain Content Keys, Transport Session Keys and Relay Routing Identities.

ADR 0031 defines the threat model for identity, devices, Homes, relays, metadata and protected domains.

ADR 0032 defines conceptual schema families for packet envelopes, protected payload envelopes, signed event segments, replica manifests, key envelopes, Home membership credentials and compatibility advertisements.

ADR 0034 defines canonicalization, signature-input and test-vector boundaries for future signed lifecycle-sensitive objects and conformance fixtures.

The next boundary needed before implementation is lifecycle semantics: when keys are created, delegated, rotated, revoked, replaced, reset, backed up or recovered.

## Decision

Pico separates lifecycle rules by key role.

No single secret, token, relay account, Home Host role, Move-In Code or backup artifact may become universal recovery, identity, host administration and decryption authority.

Lifecycle events must be explicit, auditable and scoped before they become security-relevant.

This ADR does not choose algorithms, key sizes, key serialization, key storage APIs, passkey schemes, social recovery, group messaging protocols or canonical signature formats.

## Core rule

```text
Identity can delegate.
Devices can operate.
Homes can host.
Domains decide reading.
Recovery restores scoped access, not unchecked authority.
Revocation stops future authority and must be visible.
```

## Lifecycle vocabulary

| Term | Meaning |
|---|---|
| Create | Generate or establish new key material or credential material. |
| Delegate | Grant scoped authority from a stronger or controlling authority to a narrower key or credential. |
| Activate | Mark a key, credential or envelope as usable within its scope and validity period. |
| Rotate | Replace active key material with new material while preserving continuity where allowed. |
| Revoke | Stop future authority for a key, credential or device. |
| Retire | Stop using a key intentionally without treating it as compromised. |
| Replace | Move identity or host continuity to a new key because the previous root is lost or compromised. |
| Recover | Regain access through a reviewed, scoped recovery path. |
| Reset | Reinitialize host or local state. Reset is not global identity deletion. |
| Audit | Record lifecycle decisions without leaking protected key material or private payloads. |

## Lifecycle states

Future lifecycle records should distinguish at least:

```text
planned
created
pending_activation
active
retiring
retired
revoked
compromised
superseded
expired
lost
unknown
```

These are conceptual states, not final enum values.

## Role lifecycle summary

| Role | Created by | Rotated by | Revoked by | Recovery boundary |
|---|---|---|---|---|
| Pico Identity Key | Pico Vault or reviewed identity setup flow. | Pico identity owner through trusted recovery or active delegated device quorum. | Rare; only after compromise or replacement. | Must not depend on Pico Home, Relay or Move-In Code alone. |
| Device Key | Pico identity owner or trusted delegated device flow. | Owning Pico or device under policy. | Owning Pico or recovery path. | Lost device must not destroy Pico identity. |
| Pico Home Host Key | Pico Home setup or first-boot host identity flow. | Home Host Pico plus host-controlled setup rules. | Home reset or host replacement flow. | Must not grant resident private-domain access. |
| Home Membership Credential | Home Host Pico or authorised host administration flow. | Issuer according to host membership policy. | Home Host Pico or host governance flow. | Revokes host use, not Pico identity. |
| Domain Content Key | Domain controller or domain membership process. | Domain controller or configured domain policy. | Not usually revoked directly; rotate and stop wrapping to removed readers. | Recovery must respect reader membership and deletion rules. |
| Transport Session Key | Transport adapter/session establishment. | Session lifecycle. | Session close, expiry or compromise. | No Pico identity or domain recovery meaning. |
| Relay Routing Identity | Pico Link transport configuration. | Pico or transport facade. | Pico or transport facade. | Replaceable without changing Pico identity. |

## Pico Identity Key lifecycle

The Pico Identity Key is the portable identity root for one Pico.

Future design should support:

- creation inside a Pico Vault, platform keystore, hardware-backed key holder or other reviewed identity setup path
- explicit public identity material for relationships and compatibility claims
- explicit private material storage policy
- delegation to Device Keys
- rotation or replacement statements
- recovery statements only after a reviewed recovery design exists
- audit records for identity replacement and device delegation changes

Identity key rotation should be rare. It may be needed when:

- the identity root is suspected compromised
- the identity root storage is being migrated
- a future algorithm or serialization format must be retired
- a reviewed recovery path replaces lost identity material

Identity replacement must preserve relationship continuity only through signed, verifiable transition records or another reviewed continuity mechanism.

It must not rely on:

- Pico Relay account control
- Pico Home host control
- Home Host Pico authority
- Move-In Code possession
- transport node ID
- email or cloud account control alone

## Device Key lifecycle

Device Keys are delegated operational keys for trusted Pico Vaults, full clients or trusted installations.

Future Device Key records should include:

- device identifier
- human-recognisable device name or description
- delegated scope
- issuing Pico identity or issuing trusted device
- creation time
- activation time
- expiry if any
- revocation state
- last-seen or last-used metadata where safe
- allowed protected domains or domain access references

Device Key scope should distinguish:

| Scope | Meaning |
|---|---|
| sign_history | May sign event segments or manifests for authorised domains. |
| decrypt_domain | May receive key envelopes for specified domains. |
| administer_home | May perform scoped host-administration actions where separately authorised. |
| approve_action | May approve Pico Rules decisions where policy allows. |
| surface_session | May operate an interaction surface without becoming a durable knowledge owner. |

These names are conceptual, not final capability strings.

Lost-device handling must support:

- marking the device as lost or suspected compromised
- revoking future signatures and domain key envelopes
- rotating affected Domain Content Keys where needed
- preserving historical signed records while marking future trust as revoked
- preventing stale backups from silently reactivating the device
- user-visible audit of what was revoked and what remains readable historically

ADR `0051-pico-link-draft-device-credential-placeholder.md` narrows the first draft-only Device Credential placeholder boundary for fixture work. ADR `0052-pico-link-draft-lost-device-revocation-placeholder.md` narrows the first draft-only lost-device revocation placeholder boundary. ADR `0053-pico-link-draft-revocation-registry-placeholder.md` narrows the first draft-only revocation registry record placeholder boundary. These placeholders do not implement Device Keys, revocation propagation, stale-backup enforcement, domain-key rotation or runtime authorization.

## Pico Home Host Key lifecycle

A Pico Home Host Key identifies host infrastructure continuity.

It may be created:

- on first boot
- during Setup Mode
- during migration to a new host
- during reset, if the user intentionally creates a new Home identity

It must not:

- sign as a resident Pico
- decrypt resident private domains by hosting alone
- become the Home Host Pico identity key
- become a Move-In Code
- become a Relay Routing Identity

Host Key rotation or replacement must define:

- whether the Pico Home is the same Home with a rotated host key or a new Home
- how Home Membership Credentials bind to the new host key
- how Home Member Picos are notified or asked to accept continuity
- how old host keys are retired or marked compromised
- how reset affects claim state and host operational audit

Home reset is local host state reset. It must not claim to delete resident Pico identities, resident private keys or resident-owned backups.

## Home Membership Credential lifecycle

Home Membership Credentials grant scoped use of a Pico Home.

ADR `0045-pico-home-link-draft-membership-credential-placeholder.md` narrows the draft-only placeholder boundary for future fixture work. It does not implement credential verification or authorization.

They should include:

- credential identifier
- Home identifier
- Home Host Key reference
- issuer
- subject Pico or device
- role and scope
- validity bounds
- status
- revocation reference where applicable
- signature once canonicalization exists

Membership credentials may move through:

```text
invited -> active -> revoked
invited -> expired
active -> evicted
active -> transferred_or_reissued
```

Eviction means future exclusion from one host. It must not become:

- Pico identity destruction
- private-domain decryption
- resident key seizure
- global relationship revocation
- silent history rewrite

After eviction, shared or household domain keys may need rotation according to domain policy.

## Domain Content Key lifecycle

Domain Content Keys decide who can read protected content.

Future domain key lifecycle should distinguish:

- domain creation
- initial reader set
- key wrapping to authorised devices
- reader addition
- reader removal
- routine rotation
- compromise rotation
- deletion or crypto-shredding
- archival or historical-read policy

Domain key rotation should happen when:

- a reader is removed and future secrecy is required
- a device with domain access is lost or compromised
- a domain changes sensitivity or purpose
- a key envelope format or algorithm suite is retired
- policy requires periodic rotation

Rotation does not automatically remove historical plaintext already accessible to former readers. Pico must avoid overstating deletion or retroactive secrecy.

Deletion semantics must remain aligned with ADR 0014. Append-only records may document that deletion or rotation happened, but sensitive deleteable content should live behind references, retention policy, privacy domains and encryption boundaries.

## Transport Session Key lifecycle

Transport Session Keys are session-level transport material.

They may support confidentiality, integrity or endpoint authentication at a transport layer, but they do not become:

- Pico Identity Keys
- Device Keys
- Domain Content Keys
- Home Membership Credentials
- Policy authority
- Recovery authority

Transport session keys should be short-lived or bounded by transport session lifecycle. They should rotate on reconnect, expiry or suspected compromise according to the selected transport protocol.

## Relay Routing Identity lifecycle

Relay Routing Identities exist for delivery.

They may be stable enough for routing, abuse control and reply hints, but they must remain below Pico identity semantics.

They should be:

- replaceable
- separable from Pico Identity Keys
- scoped to relay or transport context
- rotatable when metadata exposure becomes too high
- revocable without destroying a Pico identity

Relay account recovery, if any, must not become Pico identity recovery.

## Recovery boundary

Recovery is high risk because it can silently become universal authority.

Future recovery design must define:

- what is being recovered: identity, device access, domain access, host access, backup access or relay routing
- who or what authorises recovery
- how old authority is revoked
- how recovery is audited
- how users distinguish recovery from impersonation
- how stale backups are handled
- what cannot be recovered

Recovery must not be granted by:

- Move-In Code alone
- Home Host Pico role alone
- Pico Relay account control alone
- transport routing identity alone
- possession of host storage alone

If recovery cannot preserve identity continuity safely, the product should prefer explicit identity replacement with visible loss-of-continuity semantics over hidden impersonation.

## Backup and restore boundary

Backups may contain stale credentials, old key envelopes, old membership state or deleted protected content.

Future backup restore must handle:

- revocation freshness
- domain key rotation state
- membership status
- host reset state
- replay of old manifests or credentials
- restored devices that were revoked after backup time
- deletion and retention policies

Restore must not silently re-enable revoked devices or re-add evicted members.

## Audit requirements

Lifecycle audit should record:

- key or credential type
- lifecycle action
- actor or issuer
- subject
- scope
- reason category
- time
- previous and new state
- related manifest, credential or key-envelope references

Audit records must not include:

- private key material
- unwrapped Domain Content Keys
- recovery secrets
- full sensitive plaintext payloads
- unnecessary location or presence data

## Compatibility and conformance implications

Before a surface can claim compatibility for lifecycle-sensitive behaviour, conformance tests should cover:

- device delegation
- device revocation
- lost-device flow
- membership revocation and eviction
- host key rotation or reset
- stale credential rejection
- stale backup restore handling
- key-envelope reader removal
- unknown extension handling
- downgrade resistance

Until such tests exist, lifecycle claims must remain experimental.

## Implementation prerequisites

Before implementing lifecycle-sensitive keys or credentials, define at least:

- canonicalization and signature verification rules
- key serialization formats
- reviewed cryptographic primitive choices
- lifecycle record schemas
- audit schemas
- revocation propagation rules
- stale backup handling
- user-visible recovery UX boundaries
- conformance tests for lifecycle behaviour

## Current implementation status

The current repository does not implement:

- Pico Identity Keys
- Device Keys
- Pico Home Host Keys
- Home Membership Credentials
- Domain Content Keys
- Transport Session Keys
- Relay Routing Identities
- lifecycle records
- key rotation
- device revocation
- recovery flows
- signature verification
- key envelopes

The current Foundation API remains trusted-local diagnostics and foundation plumbing. `PicoEvent.signature` remains opaque unverified metadata.

## Non-goals

This ADR does not implement or choose:

- cryptographic algorithms
- key sizes
- key serialization
- passkeys
- hardware-backed key APIs
- social recovery
- password recovery
- group messaging protocols
- recovery UI
- migration tools
- production backup format
- conformance tests

It also does not make any cloud account, relay account, Home Host Pico, Move-In Code or transport identity a universal recovery authority.

## Consequences

Positive:

- gives future key work explicit lifecycle boundaries
- separates recovery by key role instead of creating a master secret
- keeps host reset and eviction from becoming identity destruction
- defines lost-device and stale-backup risks before implementation
- gives conformance work lifecycle behaviours to test

Negative:

- adds more design work before crypto-backed features can ship
- requires careful UX for recovery and lost-device handling
- may make some simple demos wait until stubs and disclaimers are explicit
- increases the number of lifecycle states future implementations must handle

## Relationship to other ADRs

This ADR extends and constrains:

- `0014-deletability-and-append-only-events.md`
- `0016-cryptography-boundaries-and-non-goals.md`
- `0024-server-bootstrap-tenancy-and-eviction.md`
- `0027-dedicated-pico-home-image-and-first-boot-setup.md`
- `0028-pico-link-transport-facade-and-relay-network.md`
- `0029-identity-device-home-keys-and-e2e-boundaries.md`
- `0031-pico-link-identity-relay-and-domain-threat-model.md`
- `0032-pico-link-envelope-and-credential-schema-direction.md`
- `0034-canonicalization-signature-inputs-and-test-vectors.md`

It does not replace those ADRs. It defines how future Pico key, credential, membership and recovery implementations must behave across their lifecycle.
