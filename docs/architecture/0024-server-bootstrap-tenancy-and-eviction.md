# 0024 - Server Bootstrap, Tenancy and Eviction

## Status

Accepted as a concept and tenancy constraint.

## Context

Pico Core should not be tied to one runtime platform. Home Assistant is the first packaging and installation path, but the same core service should also be able to run on other trusted platforms such as a standalone container, local server, NAS, mini PC, desktop machine, VPS, or future dedicated appliance.

This creates a separate architectural question: who owns a newly installed Pico Core host, and what authority does that host have over the Pico instances that later use it?

A useful model is the empty-house model:

```text
freshly installed Pico Core = unclaimed house
first successful claim = first Pico moves in and becomes host administrator
additional invitations = other Picos may move in as residents
```

The host must provide infrastructure without automatically owning the identities, private keys, private data, memories or authority of the resident Picos.

## Decision

A freshly installed Pico Core host starts as an unclaimed host.

A one-time bootstrap claim token allows the first Pico to claim the host. That Pico becomes the host administrator, also called the Gastgeber Pico for this host.

The Gastgeber Pico may invite additional resident Picos and may later evict resident Picos from this host.

Host administration controls future use of this host. It does not grant ownership over resident Pico identities, private encryption keys, private domains, portable history, personal memories or backups.

ADR `0056-pico-home-link-draft-home-host-key-placeholder.md` narrows the first draft-only Home Host Key placeholder boundary for future fixture work. It does not implement host-key serialization, Home continuity verification, membership issuer verification, Setup Mode, bootstrap token validation, resident signing authority, resident domain decryption or runtime host authorization.

## Core design rule

> The Gastgeber Pico manages the house, not the people. It may invite and evict residents from this host, but it must not decrypt, impersonate, rewrite or own resident Picos.

## Terms

| Term | Meaning |
|---|---|
| Pico Core Host | Runtime and storage host for Pico Core. It may run as a Home Assistant add-on, container, local service or other future platform. |
| Unclaimed Host | Fresh installation with no resident Pico and no host administrator yet. |
| Bootstrap Claim Token | One-time initial secret that allows the first Pico to claim the host. It is not a data encryption key. |
| Gastgeber Pico / Host Admin | First Pico that claims the host and receives host-administration authority. |
| Resident Pico | A Pico identity authorised to use this host. |
| Host Operational Domain | Host metadata, residency records, invitations, runtime configuration and update state. |
| Personal Domain | Encrypted resident-owned private data. The host admin must not be able to read it. |
| Shared Domain | Explicitly shared encrypted domain, such as household, pair, family, organisation or project data. |
| Eviction | Revocation of future use of this host. It is not ownership transfer and not identity destruction. |

## Platform neutrality

Home Assistant is a useful first runtime because it already has local devices, sensors, automations and household context. It must not become the only conceptual shape of Pico Core.

The host model must work for:

- Home Assistant add-on
- standalone Docker or Podman container
- local Linux service
- NAS or mini-server
- desktop-hosted core
- future mobile or desktop full-client host modes
- future trusted remote or VPS host

The same authority rule applies on every platform: the host provides infrastructure, but resident Picos keep control of their own identities, keys and private domains.

## Bootstrap flow

Minimum intended flow:

1. Pico Core starts in `unclaimed` state.
2. The host creates a one-time bootstrap claim token.
3. The bootstrap token is shown only through a local or otherwise protected installation channel.
4. A Pico uses the token to claim the host.
5. The host records that Pico as host administrator.
6. The bootstrap token is invalidated and must not remain usable.
7. The host enters `claimed` state.
8. The Gastgeber Pico may create scoped invitations for further resident Picos.

The bootstrap token must not be a master key and must not decrypt resident data. It is only a temporary right to claim an empty host.

## Host administrator capabilities

The Gastgeber Pico may manage host-level administration:

- invite a resident Pico
- set invitation expiry and scope
- revoke unused invitations
- evict a resident Pico from this host
- revoke future sync, routing and storage access for evicted residents
- rotate shared-domain keys after eviction where required
- manage host update channel and runtime settings
- manage host-level storage limits and operational diagnostics
- manage server-side encrypted backup locations where configured

These are infrastructure powers, not personal-data powers.

## Host administrator non-capabilities

The Gastgeber Pico must not be able to:

- decrypt another resident Pico's personal domain
- access another resident Pico's private keys
- impersonate another Pico identity
- rewrite another resident Pico's signed history
- forge another resident Pico's events
- silently export another resident Pico's private data
- use host administration to cross private zones
- make another resident's personal Pico unusable on that resident's own trusted devices
- turn shared hosting into hidden surveillance or relationship control

A host admin may deny future use of this host. It must not own the resident as a person or the resident Pico as an identity.

## Data separation

Resident data must be separated by explicit domains.

Recommended initial domains:

| Domain | Controller | Host admin access |
|---|---|---|
| `host_operational` | host / Gastgeber Pico | allowed, auditable |
| `resident_personal:<pico_id>` | resident Pico | no plaintext access |
| `resident_device_local:<pico_id>` | resident's trusted devices | no plaintext access |
| `shared_pair:<pico_a>:<pico_b>` | participating Picos | only if host admin is a participant |
| `shared_household:<host_id>` | configured group members | only as member, not by host ownership alone |
| `service_or_emergency` | explicit policy | role-, context-, purpose- and necessity-bound |

The host should store ciphertext where practical for resident personal domains. The host must not store resident private keys in plaintext.

## Manipulation and partial deletion

A host administrator, server operator or attacker with storage control may be able to delete files, stop the service or remove ciphertext stored on that host. Pico cannot fully prevent physical denial of service or storage destruction on infrastructure controlled by someone else.

Pico can and should prevent or detect other classes of abuse:

| Risk | Required direction |
|---|---|
| Reading private resident data | Per-resident and per-domain encryption. |
| Forging resident history | Resident/device signatures for events or event segments. |
| Silent mutation | Hash chains, signed manifests or equivalent integrity checks. |
| Partial deletion | Replica comparison, signed segment manifests and gap detection. |
| Hostile eviction | Local full-client replicas, encrypted exports and recovery material controlled by the resident. |
| Shared-domain continuation after eviction | Shared key rotation and future membership exclusion. |

Deletion on one host must not be confused with deletion of the resident Pico identity. A resident Pico should continue through its own Full Clients, encrypted exports or backups where configured.

## Eviction semantics

Eviction means future exclusion from this host.

Allowed effects:

```text
resident_status = evicted
future_host_access = denied
future_sync_to_this_host = denied
new_shared_domain_keys_exclude_evicted_resident = true
host_local_ciphertext_cleanup = optional policy decision
```

Not allowed as eviction effects:

```text
read_resident_private_domain
steal_resident_private_keys
forge_resident_events
delete_resident_identity_globally
rewrite_shared_history_without audit
silently erase audit of eviction
```

If host-local cleanup deletes ciphertext blobs for an evicted resident, this must be represented as host storage cleanup. It must not claim that the resident's own Pico, own devices or own backups were deleted.

ADR `0057-pico-home-link-draft-residency-eviction-placeholder.md` narrows the first draft-only residency and eviction placeholder boundary for fixture work. It does not implement membership verification, Home Host Key verification, host-local cleanup policy, shared-domain rotation, runtime eviction enforcement or global deletion semantics.

## Home Assistant implication

The Home Assistant add-on is one possible Core Host runtime. It must not be described as owning all Pico identities or all private data just because it hosts the current Pico Core process.

A Home Assistant installation may host one or more resident Picos later, but Home Assistant access must still obey Pico's policy, consent, privacy-domain and audit model.

This extends the Home Assistant threat model in `0019-home-assistant-threat-model.md`.

## Relationship to Full Clients, Light Clients and Relay

This ADR adds a host-tenancy distinction to the node roles in `0015-full-clients-light-clients-and-relay.md`.

A Core Host is infrastructure. A Full Client owns knowledge, local state, policy and backups for a Pico identity. A Light Client is an interaction surface. A Relay is transport.

A Core Host may also run on the same physical device as a Full Client, but those responsibilities must remain conceptually separate.

## Implementation implications

The future data model should include explicit host and residency structures, for example:

```text
core_host
host_claim_state
bootstrap_claim_token
host_admin_membership
resident_membership
resident_status
resident_invitation
resident_capability
privacy_domain
key_envelope
domain_membership
shared_domain_key_rotation
host_access_audit
eviction_record
replica_manifest
signed_event_segment
```

The current foundation implementation only has an internal, non-public Pico Home claim-state skeleton. It records that a fresh host starts as `unclaimed`, but it does not yet implement bootstrap claim tokens, host admin membership, resident membership, invitations, eviction, privacy domains, key envelopes or claim APIs.

Until the full model exists, Pico Core must not be treated as a production multi-resident personal data host.

## Interaction with other ADRs

This ADR extends and constrains:

- `0003-family-server-and-user-sovereignty.md`
- `0011-privacy-security-and-audit-model.md`
- `0014-deletability-and-append-only-events.md`
- `0015-full-clients-light-clients-and-relay.md`
- `0016-cryptography-boundaries-and-non-goals.md`
- `0019-home-assistant-threat-model.md`

It reinforces that hosting is not ownership and that eviction is future infrastructure revocation, not personal identity destruction.

## Non-goals

This ADR does not define:

- final cryptographic primitives
- final group-key protocol
- final UI for claiming a host
- final Home Assistant ingress flow
- final backup provider
- final legal tenancy model
- final physical anti-tamper design

## Open questions

Open questions before implementation:

- How exactly is the bootstrap claim token displayed, transported and expired on each platform?
- Which host actions require direct local confirmation versus remote Gastgeber approval?
- How are resident invitations represented and revoked across offline devices?
- How are shared-domain keys rotated after eviction?
- How are signed manifests represented without inventing custom cryptography?
- What is the minimum local replica requirement before storing meaningful personal data on a shared host?
- How does a resident prove or detect partial host-side deletion?
- Which host audit records remain after a resident is evicted?
- How are server-level backups separated from resident-owned encrypted backups?

## Consequences

Positive:

- makes Pico Core platform-neutral instead of Home-Assistant-owned
- gives the initial server installation a clear unclaimed state
- supports a Gastgeber Pico without giving it ownership over other residents
- allows practical eviction from a shared host
- preserves resident sovereignty, privacy domains and exit paths
- makes manipulation and partial deletion risks explicit

Negative:

- adds a multi-tenant host model before the implementation exists
- requires careful cryptographic and sync design later
- eviction and key rotation are complex in offline and replicated systems
- cannot fully prevent physical deletion by the host operator
- needs very clear UX to avoid confusing host administration with personal authority

## Design rule

A Pico Core host can provide a home for resident Picos. The Gastgeber Pico may decide who can stay in that home. It must not own the residents' identities, private keys, memories or portable histories.
