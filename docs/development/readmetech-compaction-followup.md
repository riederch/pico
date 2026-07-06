# ReadmeTech compaction follow-up

## Status

Companion note for `ReadmeTech.md` after the technical README was compacted.

This file preserves explanatory context that should not be lost, but also should not bloat the primary technical README again. The primary source of truth remains the ADR set under `docs/architecture/`.

## Why this file exists

`ReadmeTech.md` was intentionally shortened to keep it usable as the main technical entry point. That compaction preserved the main architecture, API, release, add-on and design-principle information, but removed several longer explanatory sections that were useful for reviewers and future agents.

Those removed sections mostly duplicated ADR content, so they are stored here as a follow-up map instead of being re-expanded into the README.

## Preserved extended topics

### Visual identity and interaction state

Pico's visual direction is a small floating digital companion with a rounded body, light shell, dark face display, expressive glowing eyes, antenna identity light and bright chest core.

The avatar is not only decoration. It is intended to communicate state, uncertainty, risk and activity.

Typical color meanings:

| Color | Meaning |
|---|---|
| Blue / cyan | normal, active, available |
| Violet | thinking, analysing, AI reasoning |
| Yellow / amber | warning, uncertainty, approval needed |
| Red | blocked, critical, policy stop |
| Green | success, safe completion, positive result |

Primary reference: `docs/architecture/0013-visual-design-language.md`.

### Deletability and append-only events

The event log is append-only because it supports sync, auditability, replay and debugging.

That conflicts with deleteable personal memory if sensitive data is stored directly inside immutable replicated events.

Design direction:

```text
Append-only events record history. Sensitive memory lives behind references, privacy domains, retention policy and encryption boundaries.
```

Sensitive or deleteable payloads should be referenced from events wherever practical instead of embedded directly in the event log.

Primary reference: `docs/architecture/0014-deletability-and-append-only-events.md`.

### Contextual interaction safety and Context Signals

Pico may help users reason about the safety of concrete person-to-person interactions, but it must not become a global reputation system.

Design rule:

```text
Evaluate the action, not the human as a whole. Evaluate the context, not the reputation. Use Context Signals as evidence-labelled hints, never as a free pass.
```

A remote Pico cannot prove that its owner is trustworthy. It can only provide limited claims, commitments, attestations or evidence references. The receiving Pico must decide locally, conservatively and in context.

Primary reference: `docs/architecture/0017-contextual-interaction-safety-and-trust-signals.md`.

### Presence, context and location sharing

Pico may support sharing presence, activity, ETA, status, approximate location, exact location, live location, emergency state and similar context between trusted Picos.

This must be consent-based, scoped, visible, revocable, purpose-bound and as imprecise as possible.

Design rule:

```text
Pico should share context to support care, coordination and safety, not surveillance, coercion or control.
```

Primary reference: `docs/architecture/0018-presence-context-and-location-sharing.md`.

### Home Assistant threat model

Home Assistant is Pico's first packaging and runtime path. It is useful because it already connects local devices, sensors, scenes and household routines.

That also makes it risky. A Pico add-on can become a powerful local control surface if it later gains access to Home Assistant entities or tokens.

Design rule:

```text
Home Assistant can be a Pico runtime and tool source, but it must not bypass Pico's policy, consent and audit model.
```

Primary reference: `docs/architecture/0019-home-assistant-threat-model.md`.

### Contextual service and emergency access

Pico may disclose private service, infrastructure, access or emergency context only when role, context, purpose and necessity justify it.

Design rule:

```text
Role + context + purpose + necessity + minimal data + expiry + audit.
```

Pico must not expose the home, body, memory or personal life as a searchable private database.

Primary reference: `docs/architecture/0020-contextual-service-and-emergency-access.md`.

### Private behaviour, legal risk and harm

Pico must distinguish legal risk, moral harm, personal autonomy and interpersonal trust.

Design rule:

```text
Pico assists. Pico does not police.
```

Pico should be liberal in private life, strict where real harm, coercion, exploitation, duty risk or danger to others begins.

Primary reference: `docs/architecture/0021-private-behaviour-legal-risk-and-harm.md`.

### Shared Plans and cooperative nudging

Pico may support Shared Plans such as appointments, reservations, shared chores, project steps, service tasks, care responsibilities and duty tasks.

Design rule:

```text
Loose plans get gentle reminders. Binding plans require approval. Unpleasant duties get small next steps. Critical tasks may escalate. People are not scored; commitments are managed.
```

Primary reference: `docs/architecture/0022-shared-commitments-and-cooperative-nudging.md`.

### Adaptive tone, motivation and self-binding

Pico may adapt tone, directness, humour and motivational pressure to the user's preferences and observed effectiveness.

Design rule:

```text
The tone may be personal. The pressure must be user-owned. Real interventions require policy.
```

Primary reference: `docs/architecture/0023-adaptive-tone-motivation-and-self-binding.md`.

### License, trademark and contribution governance

The compact README still links the core governance files, but the expanded governance table is preserved here:

| File | Purpose |
|---|---|
| `LICENSE` | project license and Pico additional permission |
| `NOTICE` | required notice and permission contact |
| `COMMERCIAL.md` | commercial-use boundary and permission rules |
| `LICENSE-FAQ.md` | practical licensing FAQ |
| `TRADEMARK.md` | naming, official-status and compatibility-claim policy |
| `CONTRIBUTING.md` | contribution, relicensing and documentation rules |

Key rules:

- private and non-commercial use is allowed within the license
- private Pico Home and private Pico WG use are allowed
- commercial use requires prior written permission
- compatibility does not grant commercial permission
- commercial permission does not automatically grant compatibility status
- official names and official hosted-service claims require permission
- contributors grant the project rights needed for future official commercial permissions

## How to use this file

Use this file when reviewing whether `ReadmeTech.md` became too short. Do not treat this file as a replacement for ADRs. If a concept here becomes implementation-relevant, update the corresponding ADR or create a new ADR rather than expanding `ReadmeTech.md` with long concept prose again.
