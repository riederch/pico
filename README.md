# Pico

![Pico hero](docs/assets/pico-readme-hero.png)

Pico is a local-first personal AI companion foundation.

The goal is not simply to build another chatbot. Pico is meant to become a personal agent foundation that can run across trusted devices, understand context, interact through text, voice, avatar, and Home Assistant surfaces, and execute approved tools only through clear policy and audit boundaries.

For the full technical documentation, see [`ReadmeTech.md`](ReadmeTech.md).

## Why Pico exists

Many assistant and smart-home systems are controlled by one account, one cloud, or one technical owner. That is convenient, but shared homes, families, partnerships, and organisations need clearer ownership, permissions, exit paths, and auditability.

Pico is designed around a different premise:

> Personal AI should help people without taking away their control over their own data and decisions.

This means Pico treats identity, ownership, privacy, relationship boundaries, exit rights, and auditability as product features, not as afterthoughts.

## What Pico should become

Pico should eventually be able to:

- run locally where practical
- sync between trusted full clients
- support light clients such as watches or small displays
- work with Home Assistant and other local tools
- remember useful personal context safely
- explain and audit what it did
- ask for confirmation before risky actions
- keep companion UX separate from execution authority

## What Pico is not

Pico is not intended to become:

- an uncontrolled chatbot with system access
- a cloud-only personal data silo
- a background automation layer without clear confirmation
- a replacement for explicit user approval
- a project that invents its own cryptography

## Core idea

Pico separates the friendly assistant surface from the authority model:

> The assistant may suggest. The policy layer decides. The executor acts only after approval. The audit log records what happened.

That means the companion can feel helpful and present, but risky actions still need clear rules, confirmation, and traceability.

## Current status

Pico is in the foundation phase.

Current version:

```text
0.1.4
```

Prepared foundation pieces include:

- Pico Core service
- event storage
- sync primitives
- release pipeline
- Home Assistant add-on path
- architecture notes

Pico is **not production-ready** yet. Authentication, authorization, policy execution, encrypted personal data domains, migration safety, and real companion clients still need to be built.

## Visual direction

Pico's visual direction is a small floating digital companion with a light shell, dark face display, glowing eyes, an antenna identity light, and a bright chest core.

![Pico design concept](docs/assets/pico-design-concept.png)

The avatar communicates state and risk. For example:

| Color | Meaning |
|---|---|
| Blue / cyan | normal and available |
| Violet | thinking or analysing |
| Yellow / amber | warning or confirmation needed |
| Red | blocked or critical |
| Green | success |

## Roadmap in plain language

1. Build a safe technical foundation.
2. Make updates and migrations safe before real user data matters.
3. Build the first usable client.
4. Add policy-gated tool execution.
5. Add memory only after deletion and privacy-domain semantics are clear.
6. Add richer companion UX after the control and audit layers are solid.

## Documentation map

- [`ReadmeTech.md`](ReadmeTech.md) - full technical README
- [`docs/architecture`](docs/architecture) - architecture decisions and concept notes
- [`docs/release/versioning.md`](docs/release/versioning.md) - release/versioning checklist
- [`docs/release/documentation-consistency.md`](docs/release/documentation-consistency.md) - README and concept consistency rules

## Design principles

- Local-first where practical
- User control over identity and personal data
- Explicit privacy domains
- Policy-gated tool execution
- Confirmation for risky actions
- Auditability instead of hidden automation
- Friendly companion layer, strict execution layer
- Full clients own knowledge and backups; light clients are interaction surfaces
- Use reviewed cryptographic primitives; do not invent cryptography
