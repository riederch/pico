# 0025 - Inter-Pico Communication Compatibility

## Status

Accepted as a protocol compatibility constraint.

## Context

Pico is intended to become open source. Users should be able to inspect, modify, fork and self-host Pico code.

At the same time, Pico instances must be able to communicate safely and predictably. A modified Pico implementation should not silently break inter-Pico communication while still presenting itself as protocol-compatible.

This is especially important for:

- peer invitations
- resident Pico onboarding
- host claim and residency messages
- Full Client sync
- Light Client requests
- relay-carried encrypted transport
- presence and context sharing
- shared commitments
- service and emergency access
- trust-signal exchange
- future signed or encrypted event transport

## Decision

Code may be changed, forked and adapted under the project license.

However, an implementation that claims Pico protocol compatibility must preserve the published inter-Pico communication semantics for the protocol version it advertises.

Breaking communication changes must not be hidden behind the same protocol version or the same compatibility claim.

## Core design rule

> You may change the implementation. You must not silently change what a Pico-compatible Pico means on the wire.

Operational form:

> A modified Pico may be different internally. If it claims compatibility with a Pico protocol version, it must speak that protocol faithfully or clearly negotiate a different version or extension.

## License boundary

The open-source license should allow modification and forks.

Protocol compatibility should therefore be handled through:

- published protocol specifications
- semantic protocol versioning
- capability negotiation
- conformance tests
- compatibility claims
- trademark or naming policy where needed

It should not rely on DRM, obfuscation, remote activation, anti-fork logic or hidden enforcement.

A fork may change the protocol. But if it does, it must not pretend to be compatible with the unchanged Pico protocol version.

## Compatibility requirements

A Pico-compatible implementation must:

- preserve required message fields for the advertised protocol version
- preserve event type semantics for the advertised protocol version
- preserve risk, policy, confirmation and audit semantics where those messages are part of the protocol
- preserve privacy-domain and data-domain meanings
- preserve host claim, residency and eviction semantics once implemented
- preserve extension and capability negotiation rules
- reject or safely ignore unknown optional extensions
- avoid reusing existing message names for incompatible meanings
- avoid downgrading security or privacy semantics while claiming the same compatibility level

## Breaking changes

Breaking changes require at least one of:

- a new protocol version
- explicit version negotiation
- a new capability flag
- an extension namespace
- a migration path
- a compatibility adapter

Examples of breaking changes:

- changing the meaning of an existing event type
- changing required fields without negotiation
- treating a formerly optional field as required without versioning
- changing privacy-domain semantics
- weakening confirmation or policy semantics
- changing signed payload canonicalization
- changing encryption envelope interpretation
- changing host claim or eviction semantics
- changing trust-signal evidence classes

## Extensions

Pico implementations may add extensions.

Extensions should be:

- namespaced
- capability-advertised
- optional unless negotiated
- safe to ignore by older compatible peers
- documented before broad use

An extension must not redefine the meaning of an existing core field or event type.

Example direction:

```json
{
  "protocolVersion": "0.1.7",
  "capabilities": {
    "pico.core.events.v1": true,
    "example.fork.custom_visuals.v1": true
  }
}
```

## Conformance tests

The repository should eventually include inter-Pico protocol conformance tests.

A release that changes protocol behaviour should add or update tests for:

- protocol version reporting
- message parsing and validation
- unknown extension handling
- event compatibility
- sync compatibility
- policy and confirmation semantics
- privacy-domain semantics
- host claim and residency semantics
- relay-safe transport assumptions

The long-term rule should be:

```text
No compatibility claim without conformance tests.
```

## Communication versus implementation

Internal architecture may differ between implementations.

Allowed differences:

- different storage engine
- different UI
- different rendering
- different local runtime platform
- different programming language
- different internal module layout
- additional optional features

Not allowed under the same compatibility claim:

- incompatible wire messages
- incompatible meaning of existing event types
- silent change of authority semantics
- silent change of privacy semantics
- silent change of trust-signal semantics
- silent downgrade of security assumptions

## Naming and user trust

A modified implementation that remains compatible may describe itself as Pico-compatible.

A modified implementation that intentionally breaks compatibility should use a clear fork name, protocol name or compatibility statement so users and other Picos are not misled.

This is separate from copyright licensing. It protects user expectations and inter-Pico safety without preventing open-source forks.

## Interaction with other ADRs

This ADR constrains future implementation of:

- `0010-tool-policy-and-executor-model.md`
- `0011-privacy-security-and-audit-model.md`
- `0014-deletability-and-append-only-events.md`
- `0015-full-clients-light-clients-and-relay.md`
- `0016-cryptography-boundaries-and-non-goals.md`
- `0017-contextual-interaction-safety-and-trust-signals.md`
- `0018-presence-context-and-location-sharing.md`
- `0024-server-bootstrap-tenancy-and-eviction.md`

It reinforces that interoperability is part of Pico's safety model.

## Non-goals

This ADR does not define:

- final protocol schema
- final transport encryption
- final conformance test runner
- final trademark policy
- final extension registry
- final backwards compatibility duration

## Open questions

Open questions before implementation:

- Which protocol surfaces are public stable interfaces and which are internal foundation APIs?
- How long must old protocol versions remain supported?
- Which breaking changes are acceptable before `1.0.0`?
- How should compatibility be advertised between Picos?
- How are extension namespaces reserved?
- Which tests are required before a fork can claim compatibility?
- How should official clients display compatibility warnings?

## Consequences

Positive:

- supports open-source modification without breaking the Pico network model
- prevents silent protocol fragmentation
- protects users from misleading compatibility claims
- gives forks a clean extension path
- makes inter-Pico communication part of the release safety model

Negative:

- requires protocol documentation earlier than a closed single-implementation project would
- adds compatibility test burden
- can slow breaking protocol changes
- requires careful version negotiation and extension design

## Design rule

Fork the code freely. Extend Pico carefully. Do not claim the same Pico protocol compatibility unless inter-Pico communication remains compatible for the advertised protocol version.