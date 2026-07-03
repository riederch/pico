# Pico Core

![Pico hero](../docs/assets/pico-readme-hero.png)

Pico Core is the Home Assistant add-on foundation for Pico.

Pico is a local-first personal AI companion foundation. The goal is not simply to build another chatbot. Pico is meant to become a personal agent foundation that can run across trusted devices, understand context, interact through text, voice, avatar, and Home Assistant surfaces, and execute approved tools only through clear policy and audit boundaries.

This add-on is the Home Assistant entry point for the current Pico Core service.

For full technical project documentation, see [`../ReadmeTech.md`](../ReadmeTech.md). For add-on installation and operation details, see [`DOCS.md`](DOCS.md).

## Why Pico exists

Many assistant and smart-home systems are controlled by one account, one cloud, or one technical owner. That is convenient, but shared homes, families, partnerships, and organisations need clearer ownership, permissions, exit paths, and auditability.

Pico is designed around a different premise:

> Personal AI should help people without taking away their control over their own data and decisions.

Home Assistant is a useful starting point because it already brings together local devices, sensors, states, events, automations and routines. Pico Core uses that environment as the first add-on packaging and runtime path.

## What Pico Core should become

Pico Core should eventually provide the Home Assistant-side foundation for a companion that can:

- run locally where practical
- connect to Home Assistant and other local tools
- understand device, event and household context safely
- store and stream events
- support policy-gated tool execution
- support shared commitments, reminders and context-aware nudging
- respect scoped presence, location and emergency context rules
- explain and audit what it did
- ask for confirmation before risky actions
- stay separate from the friendly companion UI layer

## What Pico Core is not

Pico Core is not intended to become:

- an uncontrolled chatbot with system access
- a hidden Home Assistant automation layer
- a cloud-only personal data silo
- a global human scoring or reputation system
- a replacement for explicit user approval
- a production-ready personal data store yet
- a project that invents its own cryptography

## Core idea

Pico separates the friendly assistant surface from the authority model:

> The assistant may suggest. The policy layer decides. The executor acts only after approval. The audit log records what happened.

That means Pico may eventually feel helpful and present in Home Assistant, but risky actions still need clear rules, confirmation and traceability.

## Current concept boundaries

Pico's current concept work defines several important boundaries:

- full clients own knowledge and backups; light clients are interaction surfaces
- relay servers transport encrypted messages but do not own Pico memory or authority
- trust signals are contextual evidence, not global person scores
- presence and location sharing must be scoped, visible, revocable and minimally precise
- service and emergency disclosures must be role-, context-, purpose- and necessity-bound
- personal context should remain private unless a clear purpose and policy allow otherwise
- shared commitments should manage next actions, not judge people
- motivational pressure must be user-owned

## Current status

Pico Core is in the foundation phase.

Current version:

```text
0.1.6
```

The current foundation add-on provides:

- local HTTP API
- realtime WebSocket endpoint
- SQLite-backed event storage
- foundation diagnostics dashboard
- health check endpoint for add-on monitoring
- first packaging and update path for later Pico functions

Pico Core is **not production-ready** yet. Authentication, authorization, policy execution, encrypted personal data domains, migration safety, backup/rollback behaviour and companion clients still need to be built.

## Visual direction

Pico's visual direction is a small floating digital companion with a light shell, dark face display, glowing eyes, an antenna identity light and a bright chest core.

![Pico design concept](../docs/assets/pico-design-concept.png)

The avatar communicates state and risk. For example:

| Color | Meaning |
|---|---|
| Blue / cyan | normal and available |
| Violet | thinking or analysing |
| Yellow / amber | warning or confirmation needed |
| Red | blocked or critical |
| Green | success |

## Home Assistant entry points

| Entry point | Purpose |
|---|---|
| Port `3100` | Pico Core HTTP API and WebSocket endpoint |
| `/` | foundation diagnostics dashboard |
| `/health` | add-on health check |
| `/api/events` | event list and event creation |
| `/ws` | realtime event stream |

Persistent data is stored in the Home Assistant add-on data directory:

```text
/data/pico.sqlite
```

## Roadmap in plain language

1. Build a safe technical foundation.
2. Make updates and migrations safe before real user data matters.
3. Build the first usable client.
4. Add policy-gated tool execution.
5. Add memory only after deletion and privacy-domain semantics are clear.
6. Add richer companion UX after the control and audit layers are solid.

## Documentation map

- [`DOCS.md`](DOCS.md) - Home Assistant add-on installation and operation details
- [`CHANGELOG.md`](CHANGELOG.md) - add-on-specific changelog
- [`../README.md`](../README.md) - non-technical project overview
- [`../ReadmeTech.md`](../ReadmeTech.md) - full technical project documentation
- [`../docs/architecture`](../docs/architecture) - architecture decisions and concept notes
- [`../docs/release/versioning.md`](../docs/release/versioning.md) - release/versioning checklist
- [`../docs/release/documentation-consistency.md`](../docs/release/documentation-consistency.md) - README and concept consistency rules

## Design principles

- Local-first where practical
- User control over identity and personal data
- Explicit privacy domains
- Policy-gated tool execution
- Confirmation for risky actions
- Auditability instead of hidden automation
- Friendly companion layer, strict execution layer
- Full clients own knowledge and backups; light clients are interaction surfaces
- Home Assistant integration must not bypass Pico's policy and audit model
- Presence and location sharing must be scoped, visible, revocable and minimally precise
- Shared commitments should manage next actions, not judge people
- Motivational pressure must be user-owned
- Use reviewed cryptographic primitives; do not invent cryptography
