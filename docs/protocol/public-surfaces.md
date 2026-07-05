# Pico Public Protocol Surfaces

This document defines which Pico interfaces are intended to become public compatibility surfaces and which interfaces are still internal foundation APIs.

Pico is currently in the foundation phase. Nothing in this document makes the current implementation production-ready.

## License boundary

Pico is source-available for private and non-commercial use.

Commercial use, including paid hosting, managed Pico Home services, SaaS operation, paid support, business-internal use and commercial product integration, requires prior written permission.

Protocol compatibility does not grant commercial permission.

Commercial permission does not automatically grant compatibility status.

## Compatibility terms

| Term | Meaning |
|---|---|
| Pico Link | Communication between Pico identities, clients, peers and relayed peers. |
| Pico Home Link | Communication between a Pico and a Pico Home host. |
| Pico-compatible | Preserves the advertised Pico Link semantics for the claimed protocol version. |
| Pico Home-compatible | Preserves the advertised Pico Home Link semantics for the claimed protocol version. |
| Experimental | May change without compatibility guarantees before `1.0.0`. |
| Reserved | Name exists as design direction but is not writable or fully implemented yet. |
| Internal | Implementation detail that must not be relied upon as a stable public surface. |

## Current public surfaces

The following surfaces are visible today but should be treated as foundation-stage and experimental:

| Surface | Current status | Notes |
|---|---|---|
| `GET /health` | experimental diagnostic surface | Health check for the current Pico Home Core process. |
| `GET /api/system/version` | experimental diagnostic surface | Reports service and protocol version information. |
| `GET /api/system/status` | experimental diagnostic surface | Reports diagnostic service and database migration state. |
| `GET /api/events` | experimental foundation API | Lists stored foundation events. |
| `POST /api/events` | experimental foundation API | Accepts only currently writable foundation events. Not a full sync API. |
| `WS /ws` | experimental event stream | Streams events and connection messages. |

These endpoints are not yet a complete Pico Link or Pico Home Link specification.

## Current event compatibility classes

### Foundation event types

These are implemented foundation event types:

```text
device.registered
device.seen
session.created
message.created
avatar.state_changed
```

### Product action event types

These names are product-facing protocol direction and may be reserved until their APIs exist:

```text
action.requested
action.completed
pico_rules.decision_created
approval.requested
approval.resolved
action_runner.action_started
action_runner.action_completed
action_history.event_created
```

### Legacy tool/policy event types

These names exist for compatibility with earlier technical terminology:

```text
tool.call_requested
tool.call_completed
policy.decision_created
confirmation.requested
confirmation.resolved
executor.action_started
executor.action_completed
audit.event_created
```

They must not be silently removed without an alias period, versioning or compatibility adapter.

### Pico Home event direction

These names describe future Pico Home Link direction:

```text
pico_home.claim_requested
pico_home.claim_completed
pico_home.invite_created
pico_home.resident_joined
pico_home.resident_removed
```

They are not yet a complete host claim, residency or eviction protocol.

## Compatibility surfaces to separate

Pico compatibility has at least two different surfaces.

| Surface | Compatibility focus |
|---|---|
| Pico Link | peer communication, client communication, relayed messages, identity-level interaction |
| Pico Home Link | host claim, move-in, residency, eviction, sync, routing and privacy-domain handling |

A project may be compatible with one surface and not the other.

For example, a client may implement Pico Link but not host a Pico Home.

A server may implement Pico Home Link but not act as a peer companion.

## Experimental versus stable

Before `1.0.0`, APIs may change. However, compatibility claims must still be honest.

If an implementation claims compatibility with protocol version `0.1.7`, it must preserve the documented semantics for that version.

Breaking changes require at least one of:

- a new protocol version
- explicit version negotiation
- a new capability flag
- an extension namespace
- a migration path
- a compatibility adapter

## Capability naming

Capability names should be lowercase, namespaced and versioned.

Examples:

```text
pico.events.v1
pico.avatar_state.v1
pico_link.messages.v1
pico_home.claim.v1
pico_home.residency.v1
pico_home.eviction.v1
pico_rules.decisions.v1
action_runner.actions.v1
action_history.records.v1
```

Fork or extension capability names should use their own namespace:

```text
example_fork.custom_visuals.v1
example_fork.custom_storage.v1
```

## Compatibility claim format

A future compatibility claim should include at least:

```json
{
  "implementationName": "Example Pico Home",
  "implementationVersion": "0.1.0",
  "protocolVersion": "0.1.7",
  "surfaces": {
    "pico_link": false,
    "pico_home_link": true
  },
  "capabilities": {
    "pico_home.claim.v1": true,
    "pico_home.residency.v1": true
  },
  "commercialPermission": false
}
```

`commercialPermission` is informational only and does not replace a written license grant.

## Naming and user trust

A compatibility claim must not imply official status.

Allowed wording:

```text
Compatible with Pico Home Link protocol version 0.1.7.
```

Not allowed without permission:

```text
Official Pico Home
Pico Home Managed
Pico Certified
Official Pico-compatible Hosting
```

## Non-goals

This document does not define:

- final event schemas
- final sync protocol
- final encryption envelopes
- final claim-token format
- final residency model
- final conformance test runner
- final production security model

## Design rule

Expose only the surfaces you can preserve. Claim only the compatibility you implement. Do not treat protocol compatibility as commercial hosting permission.
