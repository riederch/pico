# 0025 - Inter-Pico and Pico Home Communication Compatibility

## Status

Accepted as a protocol compatibility constraint.

## Context

Pico is source-available for private and non-commercial use. Users should be able to inspect, modify and self-host Pico code within the project license.

At the same time, Pico instances must be able to communicate safely and predictably. A modified Pico implementation should not silently break inter-Pico communication while still presenting itself as protocol-compatible.

This also applies to the interface between a Pico and its Pico Home, meaning the Pico Core Host that provides residency, storage, routing, sync and host services. A real Pico should be able to move into a compatible fork server if that server faithfully implements the advertised Pico Home / Core Host protocol and is used within the project license or with commercial permission where required.

This is especially important for:

- peer invitations
- resident Pico onboarding
- host claim and residency messages
- Pico to Pico Home claim and move-in flow
- Pico Home to resident Pico sync and routing
- Full Client sync
- Light Client requests
- relay-carried encrypted transport
- presence and context sharing
- shared commitments
- service and emergency access
- trust-signal exchange
- future signed or encrypted event transport
- appearance and presentation profiles, animation intents and custom-asset
  fallbacks, where a compatible fork or a newer official version must not
  silently reinterpret the same wire semantics

## Decision

Code may be changed, adapted and self-hosted within the project license. Commercial use requires prior written permission from the designated Pico rights holder.

However, an implementation that claims Pico protocol compatibility must preserve the published inter-Pico communication semantics for the protocol version it advertises.

A server or host implementation that claims Pico Home / Pico Core Host compatibility must also preserve the published Pico-to-host semantics for the protocol version it advertises.

Breaking communication changes must not be hidden behind the same protocol version or the same compatibility claim.

## Core design rule

> You may change the implementation within the license. You must not silently change what a Pico-compatible Pico or Pico Home means on the wire.

Operational form:

> A modified Pico or permitted fork server may be different internally. If it claims compatibility with a Pico protocol version, it must speak that protocol faithfully or clearly negotiate a different version or extension.

For appearance:

> A modified implementation may render differently internally. If it claims compatibility with a published PICO appearance profile, core model or generator version, it must preserve that version's canonical identity semantics and compatibility fallback behaviour.

## License boundary

The source-available license should allow private and non-commercial modification and self-hosting, including private Pico Home and private Pico WG use.

Commercial Pico hosting, including paid hosting, managed Pico Home services, SaaS operation, operating a Pico Home on behalf of another party and commercial product integration, requires prior written permission.

The concrete permission boundary lives in `LICENSE` and `COMMERCIAL.md`, not in this ADR. ADR [0111](0111-self-operated-business-use-and-reserved-commercial-hosting.md) has since widened it to allow business use on a self-operated Pico Home and narrowed the reserved surface to commercial Pico hosting. That change does not affect this ADR's compatibility constraint: compatibility still grants no commercial permission, and commercial permission still grants no compatibility status.

Protocol compatibility should be handled through:

- published protocol specifications
- semantic protocol versioning
- capability negotiation
- conformance tests
- compatibility claims
- trademark or naming policy where needed

Compatibility claims do not grant commercial permission.

A permitted fork may change the protocol. But if it does, it must not pretend to be compatible with the unchanged Pico protocol version.

## Compatibility surfaces

Pico compatibility has at least two public surfaces:

| Surface | Meaning | Compatibility requirement |
|---|---|---|
| Inter-Pico communication | communication between Pico identities, peers, Full Clients, Light Clients or relayed peers | same message semantics for the advertised protocol version |
| Pico Home / Core Host interface | communication between a Pico and the host it can claim, join, reside on, sync with or leave | same host claim, residency, eviction, sync, routing and privacy-domain semantics for the advertised protocol version |
| PICO Appearance / Presentation Profile | exchange of durable parametric appearance identity and its semantic fallbacks | same envelope, profile, compatibility-core and generator semantics for the explicitly claimed versions |

These surfaces may share transport and message formats, but they must be tested as separate compatibility contracts.

Appearance compatibility is testable separately from Pico Link and Pico Home
Link: a project can support, for example, Appearance Compatibility Core v1
without implementing Pico Home Link at all. The general L0-L5 claim levels in
`../protocol/compatibility-levels.md` remain unchanged; appearance adds a
claim surface, not a new level scale. ADR
[0125](0125-parametric-appearance-and-version-compatibility.md) and
`../protocol/appearance-document-v1.md` define the concrete appearance
contract.

## Pico Home / Core Host compatibility

A compatible permitted fork server may implement Pico Core differently internally. It may use a different storage engine, runtime language, deployment model, UI or operating system.

It may still be a valid Pico Home if it preserves the host-facing contract that resident Picos rely on.

A Pico Home-compatible host must not:

- change the meaning of the bootstrap claim flow while advertising the same version
- change resident invitation semantics while advertising the same version
- change eviction semantics while advertising the same version
- treat host administration as ownership of resident Pico private domains
- require resident private keys to be disclosed to the host
- weaken privacy-domain or key-envelope semantics while advertising compatibility
- silently reinterpret resident sync data
- make a resident Pico non-portable while claiming host compatibility

A Pico should be able to evaluate a permitted fork server by its advertised host protocol version, capabilities and conformance status before moving in.

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

A compatible appearance implementer must additionally:

- preserve the required appearance records
- interpret claimed versions exactly
- produce and read the compatibility core correctly
- skip unknown optional records
- reject unknown critical records
- never reuse a generator ID
- never change a parameter meaning
- preserve custom-asset fallbacks
- never confuse presentation quality with identity
- never treat visual similarity as an identity or trust statement

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
- changing Pico Home residency semantics
- changing trust-signal evidence classes
- changing the meaning of an appearance parameter
- changing the compatibility-core projection
- changing the semantic family behind an existing family ID
- changing canonical colour or rounding rules
- changing a released generator under the same version
- removing historical official generator support from a newer official runtime
- making a custom asset mandatory that previously had a fallback
- treating a formerly optional unknown extension as required

## Extensions

Pico implementations may add extensions.

Extensions should be:

- namespaced
- capability-advertised
- optional unless negotiated
- safe to ignore by older compatible peers or hosts
- documented before broad use

An extension must not redefine the meaning of an existing core field, event type or host operation.

Appearance extensions must additionally be namespaced, versioned,
length-prefixed, capability-advertised, and either optional or explicitly
critical; an unknown optional appearance extension must be safely ignorable.
A critical extension must never be used to bypass the mandatory
compatibility core.

Example direction:

```json
{
  "protocolVersion": "0.1.7",
  "capabilities": {
    "pico.core.events.v1": true,
    "pico.home.residency.v1": true,
    "example.fork.custom_visuals.v1": true
  }
}
```

Appearance fork example:

```json
{
  "capabilities": {
    "pico.appearance.document.v1": true,
    "pico.appearance.compatibility-core.v1": true,
    "pico.appearance.profile.parametric.v1": true,
    "example.fork.crystal-head-module.v1": true
  }
}
```

## Conformance tests

The repository should eventually include inter-Pico and Pico Home protocol conformance tests.

The planned non-cryptographic fixture layout is documented in `../protocol/conformance-fixtures.md`.

A release that changes protocol behaviour should add or update tests for:

- protocol version reporting
- message parsing and validation
- unknown extension handling
- event compatibility
- sync compatibility
- policy and confirmation semantics
- privacy-domain semantics
- host claim and residency semantics
- Pico Home move-in and eviction semantics
- permitted fork-server compatibility expectations
- relay-safe transport assumptions

Appearance conformance must additionally cover:

- canonical encode/decode roundtrips
- the compatibility-core projection
- unknown optional records
- unknown critical records
- duplicate required records
- historical official profiles
- generator golden vectors
- custom-asset fallbacks
- capability claims
- downgrade to the compatibility core
- separation of identity and presentation tier

The first authoritative appearance vectors live in
`../protocol/fixtures/appearance-document/v1/suite.json` and the governance
vector file pinned by the official generator registry.

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

"Different rendering" stays allowed internally, with one boundary: without
an appearance claim a fork designs freely; with a compatibility-core claim
the semantic fallback must be correct; with a concrete generator claim the
canonical identity of that generator version must be correct. Different
shaders, LODs and rendering technologies remain allowed as long as the
claimed design identity is preserved.

Not allowed under the same compatibility claim:

- incompatible wire messages
- incompatible meaning of existing event types
- incompatible meaning of existing Pico Home host operations
- silent change of authority semantics
- silent change of privacy semantics
- silent change of trust-signal semantics
- silent downgrade of security assumptions

## Naming and user trust

A modified implementation that remains compatible may describe itself as Pico-compatible or Pico Home-compatible for the advertised protocol version, provided that the applicable license, commercial permission and naming requirements are also satisfied.

A modified implementation that intentionally breaks compatibility should use a clear fork name, protocol name or compatibility statement so users and other Picos are not misled.

This is separate from commercial permission. It protects user expectations, inter-Pico safety and Pico Home portability without turning compatibility into a hosting license.

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
- `0034-canonicalization-signature-inputs-and-test-vectors.md`
- `0124-authored-character-core-and-tiered-presentation.md`
- `0125-parametric-appearance-and-version-compatibility.md`

It reinforces that interoperability is part of Pico's safety model.

## Non-goals

This ADR does not define:

- final protocol schema
- final Pico Home API schema
- final transport encryption
- final conformance test runner
- final trademark policy
- final extension registry
- final backwards compatibility duration
- the concrete appearance binary codec or its parameter domains, which live
  in ADR 0125 and `../protocol/appearance-document-v1.md`

## Open questions

Open questions before implementation:

- Which protocol surfaces are public stable interfaces and which are internal foundation APIs?
- How long must old protocol versions remain supported?
- Which breaking changes are acceptable before `1.0.0`?
- How should compatibility be advertised between Picos and Pico Homes?
- How are extension namespaces reserved?
- Which tests are required before a fork can claim Pico or Pico Home compatibility?
- How should official clients display compatibility warnings?
- How should a Pico decide whether a permitted fork server is safe enough to move into?

## Consequences

Positive:

- supports private and non-commercial modification without breaking the Pico network model
- allows compatible private or permitted fork servers to host resident Picos
- prevents silent protocol fragmentation
- protects users from misleading compatibility claims
- gives permitted forks a clean extension path
- makes inter-Pico and Pico Home communication part of the release safety model

Negative:

- requires protocol documentation earlier than a closed single-implementation project would
- adds compatibility test burden
- can slow breaking protocol changes
- requires careful version negotiation and extension design
- requires clear separation between compatibility and commercial permission

## Design rule

Modify Pico within the license. Extend Pico carefully. Do not claim the same Pico or Pico Home protocol compatibility unless inter-Pico and Pico-to-host communication remain compatible for the advertised protocol version. Do not treat compatibility as commercial hosting permission.
