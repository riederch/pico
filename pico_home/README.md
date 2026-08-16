# Pico Home

![Pico hero](../docs/assets/pico-readme-hero.png)

A Pico Home is a place where your Pico lives. This add-on is the Home
Assistant path to running one on hardware you already own.

Pico is a local-first personal AI companion foundation. The goal is not
another chatbot: Pico is meant to become a personal agent foundation that runs
across trusted devices, understands context, and executes approved actions
only through clear policy and audit boundaries.

Home Assistant is the first packaging and runtime path for a Pico Home. It is
not the only intended one, and it is not an ownership layer over the Picos
that live here or over their private data.

For the full technical documentation see [`../ReadmeTech.md`](../ReadmeTech.md).
For installation and operation see [`DOCS.md`](DOCS.md).

## What this add-on is, in one paragraph

It runs **Pico Core**, the technical runtime, and presents it as a **Pico
Home**, the product. Those are two different words on purpose (ADR 0026): the
core is a process, the Home is the place. Installing this gives you an *Empty
Pico Home* - a house before anybody moves in - which shows a Move-In Code so
the first Pico can claim it and become the Home Host Pico.

## Why Home Assistant is a useful entry point

Many assistant and smart-home systems are controlled by one account, one
cloud, or one technical owner. That is convenient, and it is the wrong shape
for shared homes, families, partnerships and organisations, which need clearer
ownership, permissions, exit paths and auditability.

> Personal AI should help people without taking away their control over their
> own data and decisions.

Home Assistant already brings local devices, sensors, states, events and
automations together, and it already runs on hardware in the household. That
makes it a good first house for a Pico - not a good owner of one.

## What this add-on provides today

- an Empty Pico Home that can be claimed, with founding records and host keys
- privacy domains with encryption at rest and crypto-shredded deletion
- a Pico Home Link surface for claimed devices, over sealed envelopes
- the model-provider path: a measured local provider, and what it may carry
- SQLite-backed event storage with migrations and a backup contract
- a Foundation diagnostics dashboard and `/health` for the watchdog
- the update path this whole package exists to prove

## What this add-on is not

- an uncontrolled chatbot with system access
- a hidden Home Assistant automation layer
- a cloud-only personal data silo
- an owner of the Pico identities that live here, just because it hosts them
- a public internet endpoint - remote reachability belongs to Pico Link and
  Pico Relay, not to a forwarded port into this API
- a relay provider, transport authority or cryptographic identity provider
- production-ready

## The authority model, in one line

> The assistant may suggest. The policy layer decides. The executor acts only
> after approval. The audit log records what happened.

A Home Host Pico may invite and evict residents. It may not decrypt,
impersonate, rewrite or own them. Hosting is not ownership.

## Current status

Foundation phase.

Current version:

```text
0.2.0
```

**Not production-ready.** The Foundation HTTP and WebSocket surface is local
diagnostics. Do not expose port `3100` outside a trusted local boundary; the
add-on does not publish it to the host by default, and the browser path is
Home Assistant ingress.

**This add-on replaces the earlier `Pico Core` add-on and cannot migrate its
data.** See [`CHANGELOG.md`](CHANGELOG.md).

## Home Assistant entry points

| Entry point | Purpose |
|---|---|
| Ingress panel | The browser path to the Foundation diagnostics dashboard |
| Internal port `3100` | Local HTTP API and WebSocket, used by ingress and the watchdog |
| `/health` | add-on health check |
| `/` | diagnostics dashboard |
| `/api/events`, `/api/events/tail` | event list, creation, and latest events for the dashboard |
| `/ws` | realtime event stream |

`/api/events/tail` is diagnostics only. It is not a replica sync protocol and
carries no durable sync cursor.

Persistent data lives in the add-on data directory:

```text
/data/pico.sqlite
```

Keys live beside it and are deliberately excluded from Home Assistant backups
(`/data/keys`, ADR 0072 R6; `/data/home-host-keys`, ADR 0080 H5). A data
backup is not a key backup, by design.

## The other two deliverables

Pico ships three things, and this is one of them (ADR 0153):

| Deliverable | What it is |
|---|---|
| **Pico Home** | this add-on |
| **Pico Relay** | a container that forwards encrypted packets and holds no authority |
| **Pico Client** | the desktop companion, a Debian package for Linux |

A relay is deliberately not a Home Assistant add-on: it has to stay reachable
when one household's Supervisor is restarting.

## Design principles

- local-first where practical
- user control over identity and personal data
- explicit privacy domains
- policy-gated action execution, with confirmation for risky actions
- auditability instead of hidden automation
- friendly companion layer, strict execution layer
- hosting is not ownership
- Pico Relay provides transport, not authority
- reviewed cryptographic primitives; no invented cryptography

## Documentation map

- [`DOCS.md`](DOCS.md) - installation and operation
- [`CHANGELOG.md`](CHANGELOG.md) - what changed, add-on facing
- [`../README.md`](../README.md) - non-technical project overview
- [`../ReadmeTech.md`](../ReadmeTech.md) - full technical documentation
- [`../docs/architecture`](../docs/architecture) - architecture decisions
- [`../docs/architecture/0153-what-ships-is-a-pico-home-and-pico-core-is-what-runs-inside-it.md`](../docs/architecture/0153-what-ships-is-a-pico-home-and-pico-core-is-what-runs-inside-it.md) - why this add-on is called Pico Home
- [`../docs/architecture/0027-dedicated-pico-home-image-and-first-boot-setup.md`](../docs/architecture/0027-dedicated-pico-home-image-and-first-boot-setup.md) - the appliance path for the same host model
- [`../docs/release/versioning.md`](../docs/release/versioning.md) - release and versioning checklist
- [`../docs/release/upgrade-contract.md`](../docs/release/upgrade-contract.md) - what an upgrade owes you
