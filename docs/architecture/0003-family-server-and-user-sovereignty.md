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

## Exit workflow

A person must be able to leave with their Pico.

Minimum supported flow:

1. Person requests export from any trusted own device.
2. Pico creates an encrypted export bundle.
3. Export contains personal event log, personal memory, device list, peer relationships, and portable settings.
4. Shared data is included only if the person has rights to retain it.
5. Server marks the person as migrated or removed.
6. Group keys are rotated for remaining members.
7. The leaving person's future sync is redirected to a new server or local core.

The server owner must not be able to block the export if the person still has a trusted device or recovery key.

## Server owner limitations

The person who owns or administers the physical server may be able to stop the service, delete storage, or deny network access. The design cannot fully prevent physical denial of service.

But the design can prevent data capture and lock-in:

- personal data remains encrypted
- current personal keys are not stored in plaintext on the server
- periodic encrypted backup/export can be configured
- each person can keep an offline recovery bundle
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

## Emergency mode

A person should be able to run a minimal personal Pico without the family server.

This can start as:

- local client cache
- encrypted export bundle
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
```

## Design rule

A family Pico server can coordinate a household, but each person's Pico must remain portable.
