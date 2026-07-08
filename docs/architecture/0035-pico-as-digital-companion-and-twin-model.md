# 0035 - Pico as Digital Companion and Twin Model

## Status

Accepted as a product and architecture concept.

## Context

Earlier Pico documents describe Pico as a local-first personal AI companion identity. That remains correct, but the product concept needs one additional boundary: Pico should not be limited to a generic chat workspace or only to a personal assistant owned by one user.

A Pico can represent something real or meaningful to the user. It can be a companion for a person, a home, a site, an organisation, a project, an asset, a device, or another explicitly named context.

This ADR defines that conceptual layer without weakening the existing authority, privacy, relay, Home and tool-execution boundaries.

## Decision

Pico is product-facing language for a digital companion.

Technically, a Pico may be modelled as a digital twin of a chosen subject.

A Pico subject may be:

- a person
- a household or building
- a site or location
- an organisation
- a project
- an asset or machine
- a device
- another explicitly described context

The user should be free to decide what a Pico represents. Product flows should guide that choice, not constrain Pico to only one subject type.

A Pico is therefore not only a workspace. It has identity, context, state, memory boundaries, capabilities, policies and relationships associated with its subject.

## Product wording

User-facing wording should prefer companion language:

```text
Pico is your digital companion for something that matters to you.
```

Technical and architecture wording may use twin language:

```text
A Pico can act as a digital twin of a chosen subject.
```

Avoid making digital twin the only public product phrase. It is precise, but can sound industrial or abstract to non-technical users.

## Subject types

Initial subject-type language may include:

| Subject type | Example |
|---|---|
| `person` | Christoph's personal Pico |
| `home` | house, apartment, shared household |
| `site` | office, workshop, pump station, fire station |
| `organisation` | club, company, water cooperative |
| `project` | software project, planning effort, research topic |
| `asset` | heating system, reservoir, PV system, pellet store |
| `device` | gateway, sensor, appliance |
| `custom` | a user-defined context |

The type helps Pico choose default memory, policy, connector and UX assumptions. It must not become a rigid identity prison.

## Core design rule

> Pico is the companion/twin. Pico Home is infrastructure. Pico Model is reasoning capability. Pico Relay is transport. Connectors and MCP-style tools provide capabilities. These roles must not be collapsed.

## Relationship to Pico Home

A Pico Home may host, route, sync or execute infrastructure for one or more Picos. It is not the Pico itself.

For a home or site Pico, Pico Home may be the local runtime arm of that Pico. For a personal or project Pico, Pico Home may be only one host among several trusted surfaces, vaults or runtimes.

Hosting still does not imply ownership over resident Pico identities, private spaces, keys, memories or relationships.

## Relationship to users

Users receive roles or membership on a Pico. A Pico is not always owned by exactly one user.

Examples:

```text
Personal Pico:
  subject = Christoph
  owner = Christoph

Home Pico:
  subject = House Pogoriach
  members = household users with roles

Organisation Pico:
  subject = WWG Pogoriach
  members = chair, deputy, treasurer, technicians

Asset Pico:
  subject = KWB heating system
  members = maintainers and operators
```

The same user may have access to several Picos. Several users may have access to the same Pico. The important boundary is the subject, role and policy, not a one-user-one-Pico rule.

## Twin state and memory

A Pico twin may eventually hold or reference:

- subject profile
- current state
- historical events
- capabilities
- connector configuration
- preferences
- policies
- action history
- relevant documents
- relationships to other Picos or subjects

Sensitive data must remain governed by explicit privacy domains, deletion semantics, policy decisions and audit requirements.

## Capabilities

A Pico's capabilities should be described independently of the underlying transport or tool protocol.

Examples:

```text
read state
write configuration
call Home Assistant service
publish MQTT message
send message
prepare order
request approval
record action history
```

A capability may be implemented through internal code, Home Assistant, MQTT, REST, a local connector, a cloud connector, MCP, or another future tool interface.

## Non-goals

This ADR does not implement:

- a final database schema for Pico subjects
- a final UI for creating subject-typed Picos
- a final ontology for all possible subject types
- automatic inference of a user's private preferences
- autonomous action execution
- a new authority model for Pico Home

## Implementation implications

Future implementation may add structures such as:

```text
pico_subject
pico_subject_type
pico_profile
pico_state_snapshot
pico_capability
pico_preference
pico_policy_binding
pico_relationship
subject_connector_binding
```

Creation flows should ask a user what the Pico should represent, for example:

```text
What should this Pico be a companion for?

- Me
- My home
- A site
- An organisation
- A project
- An asset or device
- Something else
```

The answer should shape defaults, not permanently restrict the Pico.

## Relationship to other ADRs

This ADR extends and constrains:

- `0008-product-vision-and-persona.md`
- `0010-tool-policy-and-executor-model.md`
- `0011-privacy-security-and-audit-model.md`
- `0015-full-clients-light-clients-and-relay.md`
- `0024-server-bootstrap-tenancy-and-eviction.md`
- `0026-product-terminology-and-naming.md`
- `0027-dedicated-pico-home-image-and-first-boot-setup.md`
- `0028-pico-link-transport-facade-and-relay-network.md`

## Consequences

Positive:

- makes the product concept stronger than a generic assistant workspace
- explains why Pico needs state, memory, relationships, policies and connectors
- supports personal, household, project, organisation and asset use cases under one model
- keeps user-facing language approachable while preserving a precise architecture concept

Negative:

- requires careful terminology so digital twin does not sound too industrial for private users
- adds subject modelling work before advanced companion features
- requires UI defaults that guide users without overconstraining them

## Design rule

Pico should be understandable as a digital companion. Architecturally, it may be treated as a digital twin of a chosen subject. The subject gives context; policy gives authority; infrastructure only hosts and transports.