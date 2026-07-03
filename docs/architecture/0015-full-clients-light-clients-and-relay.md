# 0015 - Full Clients, Light Clients and Relay

## Status

Accepted as a concept and topology constraint.

## Context

Pico is local-first and should eventually run across several trusted devices. Not every device can or should hold the same data or authority.

The architecture therefore needs explicit node roles.

## Decision

Pico distinguishes three node types:

| Node type | Role | Data holding | Connectivity |
|---|---|---|---|
| Full Client | full Pico node | knowledge, local database, sync state, backups where configured | direct, LAN, internet, relay |
| Light Client | interaction surface | minimal cache or session state only | requires a Full Client, directly or via relay |
| Relay Server | transport helper | no authority, no Pico memory ownership | forwards encrypted traffic later |

## Core design rule

> Full Clients own knowledge and backups. Light Clients present and capture interaction. Relay servers transport messages but do not own Pico identity, memory or authority.

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

## Backups

Backups belong to Full Clients or explicitly configured storage. A relay is not a backup by default.

Backup policy must define:

- what is backed up
- which privacy domains are included
- who can restore
- how keys are controlled
- retention and deletion behavior

## Home Assistant implication

A Home Assistant add-on can act as a convenient always-on Full Client or Core host, but it must not become the only place where a person's Pico identity or personal data can survive.

## Design rule

A relay increases reachability. A Full Client owns authority. A Light Client is a surface. These roles must not be blurred.
