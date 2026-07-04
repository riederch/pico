# 0015 - Full Clients, Light Clients and Relay

## Status

Accepted as a concept and topology constraint.

## Context

Pico is local-first and should eventually run across several trusted devices. Not every device can or should hold the same data or authority.

The architecture therefore needs explicit node roles.

Pico also needs to distinguish runtime infrastructure from personal authority. A Pico Core Host may run on Home Assistant, Docker, a local server, a NAS, a desktop machine or another future platform. That host can provide storage and availability, but hosting does not automatically mean ownership of resident Pico identities or private data.

## Decision

Pico distinguishes three node types:

| Node type | Role | Data holding | Connectivity |
|---|---|---|---|
| Full Client | full Pico node | knowledge, local database, sync state, backups where configured | direct, LAN, internet, relay |
| Light Client | interaction surface | minimal cache or session state only | requires a Full Client, directly or via relay |
| Relay Server | transport helper | no authority, no Pico memory ownership | forwards encrypted traffic later |

Pico also distinguishes these node roles from a Core Host:

| Host type | Role | Authority boundary |
|---|---|---|
| Pico Core Host | runtime and storage host for Pico Core | hosts infrastructure; does not automatically own resident Pico identities, private keys or personal domains |
| Unclaimed Host | freshly installed Core Host | no resident Pico and no host administrator yet |
| Claimed Host | Core Host claimed by a Gastgeber Pico | host administrator can manage residency and future access, not resident private data |

## Core design rule

> Full Clients own knowledge and backups. Light Clients present and capture interaction. Relay servers transport messages but do not own Pico identity, memory or authority. A Core Host provides infrastructure; hosting is not ownership.

## Full Client responsibilities

A Full Client may:

- hold local state
- participate in sync
- keep configured backups
- evaluate local policy
- own device keys later
- decide what a Light Client may display or submit

A Full Client must not silently give another node authority over personal data.

## Light Client responsibilities

A Light Client may:

- display state
- collect user input
- show confirmation prompts
- forward requests to a Full Client
- keep minimal short-lived cache

A Light Client must not become a hidden knowledge owner or policy authority.

## Relay constraints

A relay may improve availability and routing, but it must not become the owner of memory, identity or permissions.

A relay must not be treated as trusted just because traffic passes through it.

Future relay transport should use reviewed cryptographic building blocks. Pico must not invent its own cryptography.

## Core Host constraints

A Core Host may improve availability, storage and coordination. It may later host several resident Picos.

A Core Host must not automatically become:

- the owner of resident Pico identities
- the holder of resident private keys
- the plaintext reader of resident personal domains
- the only place where a resident Pico can survive
- a hidden administrator over another person's private memory

A claimed Core Host may have a Gastgeber Pico with host-administration authority. That authority is limited to host infrastructure, invitations, residency, future access and host operations. It is not authority over resident private data.

Host bootstrap, residency and eviction are defined more directly in `0024-server-bootstrap-tenancy-and-eviction.md`.

## Backups

Backups belong to Full Clients or explicitly configured storage. A relay is not a backup by default. A Core Host may store encrypted backups or server-side encrypted data, but host storage is not a substitute for resident-owned continuity.

Backup policy must define:

- what is backed up
- which privacy domains are included
- who can restore
- how keys are controlled
- retention and deletion behavior

## Home Assistant implication

A Home Assistant add-on can act as a convenient always-on Core Host and, later, may coexist with Full Client responsibilities on the same physical installation. It must not automatically become the only place where a person's Pico identity or personal data can survive.

Home Assistant is a first packaging path for Pico Core, not a grant of ownership over resident Picos.

## Design rule

A relay increases reachability. A Full Client owns authority. A Light Client is a surface. A Core Host provides infrastructure. These roles must not be blurred.