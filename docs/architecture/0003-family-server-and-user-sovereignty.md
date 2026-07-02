# Family server and user sovereignty

Pico may run as a shared family server, but each person's Pico identity, data access, and export path must remain under that person's control.

A family server is shared infrastructure, not ownership over the people using it.

## Problem statement

In real life, couples or families can separate. The technical design must support this from the beginning.

If one partner owns the physical server or the hosting account, that person must not be able to prevent another person from leaving with their Pico identity and personal data.

## Design principles

- One server can host multiple persons.
- Each person has a separate Pico identity.
- Each person has separate encryption keys.
- Personal data is encrypted per person.
- Shared data is encrypted for a defined group, not for the server owner.
- The server operator can provide storage and transport, but should not be able to read or hold another person's private data hostage.
- Leaving the family server must be a supported workflow, not an emergency hack.
- A person's Pico must remain usable without the family server, at least in degraded offline mode.

## Person identity

Each person has a stable identity independent of the server.

```text
person_id
pico_id
public_key
private_key controlled by the person
trusted devices
recovery material
```

The server may know the public key and routing metadata, but it must not own the private key.

## Encryption domains

Data should be separated into encryption domains.

| Domain | Encryption | Example |
| --- | --- | --- |
| personal | encrypted to one person | private memory, personal notes, private reminders |
| shared_pair | encrypted to two people | partner household planning |
| shared_family | encrypted to family group | shopping list, family calendar summaries |
| work_scope | encrypted to work group | team tasks, organization reminders |
| server_public | not sensitive | service metadata, health checks |

The server stores ciphertext where possible. The server owner should not be able to read another user's personal domain.

## Key ownership

The private key should live on the person's trusted devices or in a recovery vault controlled by that person.

Recommended starting model:

- each person has a primary device key
- additional devices are added through explicit pairing
- the family server receives only public keys
- personal data encryption keys are wrapped for the person's trusted devices
- shared group keys are wrapped for each group member

## Device-distributed continuity

A person's Pico should keep enough encrypted state on the person's own trusted devices to survive loss of the family server.

Examples:

- phone
- desktop
- tablet
- laptop
- local encrypted backup medium

The devices hold encrypted shards or replicated encrypted event segments for that person's portable event log. A server is useful for availability and coordination, but it must not be the only place where the person can recover their Pico.

If the family server becomes unavailable or hostile, the person's trusted devices enter serverless mode.

## Serverless mode

Serverless mode is a degraded but intentional operating mode.

In serverless mode Pico can:

- keep the person's identity active
- read and search locally available personal memory
- sync between the person's own devices when they can see each other
- queue outbound peer messages until a route is available
- keep reminders and local tasks running
- create encrypted export bundles
- migrate to a new Pico Core later

In serverless mode Pico may lose or degrade:

- always-on sync
- Home Assistant access tied to the old household
- shared family data that is no longer accessible
- server-side automations
- some peer routing paths
- large RAG indexes stored only on the old server

This is acceptable as long as the person's private identity and personal data remain usable.

## Hostile lockout scenario

Example: Alice owns the family server and removes Bob during a conflict.

Required result:

- Alice can revoke Bob's access to Alice-owned household resources.
- Alice can stop Bob from using the family server as infrastructure.
- Alice must not be able to read Bob's personal encrypted data.
- Alice must not be able to decrypt Bob's personal event log.
- Alice must not be able to impersonate Bob's Pico.
- Alice must not be able to prevent Bob's own trusted devices from continuing with Bob's Pico.
- Bob's devices must detect loss of the family server and switch to serverless mode.
- Bob must be able to export or migrate his Pico from his own trusted devices.
- Shared keys must be rotated so future shared-family data excludes Bob, while Bob keeps the historical shared data he is entitled to retain.

The system cannot prevent Alice from deleting storage on a server she physically controls. Therefore Bob's continuity depends on local encrypted replicas, exports, and recovery material controlled by Bob.

## Exit workflow

A person must be able to leave with their Pico.

Minimum supported flow:

1. Person requests export from any trusted own device.
2. Pico creates an encrypted export bundle.
3. Export contains personal event log, personal memory, device list, peer relationships, and portable settings.
4. Shared data is included only if the person has rights to retain it.
5. Server marks the person as migrated or removed, if still reachable.
6. Group keys are rotated for remaining members, if still reachable.
7. The leaving person's future sync is redirected to a new server, local core, or serverless device mesh.

The server owner must not be able to block the export if the person still has a trusted device or recovery key.

## Server owner limitations

The person who owns or administers the physical server may be able to stop the service, delete storage, or deny network access. The design cannot fully prevent physical denial of service.

But the design can prevent data capture and lock-in:

- personal data remains encrypted
- current personal keys are not stored in plaintext on the server
- periodic encrypted backup/export can be configured
- each person can keep an offline recovery bundle
- each person keeps local encrypted replicas on their own trusted devices
- clients can sync to a new Pico Core if the old server disappears

## Shared data after separation

Shared data must be classified.

Examples:

- shared shopping list: both may retain history
- shared family calendar: both may retain relevant past entries
- private messages: follow conversation retention policy
- household automations: stay with the household/server owner unless separately exported
- children's shared data: requires special rules and guardianship policy

A separation wizard should make these categories explicit.

## Abuse-resistance

Pico must not become a control tool within a relationship.

Required properties:

- no hidden partner monitoring
- no forced disclosure of private zones
- no admin override for another person's personal encryption domain
- visible relationship permissions
- revocable sharing
- export and recovery paths
- audit of access attempts and denied access attempts
- local continuity for each person through their own trusted devices

## Emergency mode

A person should be able to run a minimal personal Pico without the family server.

This can start as:

- local client cache
- encrypted export bundle
- device-to-device sync between trusted own devices
- small local Pico Core
- later migration to another Home Assistant add-on or VPS

## Implementation implication

The data model must avoid a single global user table owned by the server operator.

Instead use:

```text
person
pico_identity
trusted_device
key_envelope
encryption_domain
group_membership
relationship_policy
portable_event_log
local_replica_state
serverless_sync_state
```

## Design rule

A family Pico server can coordinate a household, but each person's Pico must remain portable. Losing a shared server must reduce comfort, not personal ownership.
