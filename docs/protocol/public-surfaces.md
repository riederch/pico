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
| `GET /` | experimental diagnostic surface | Serves the current foundation dashboard. Not a companion UI, policy console or remote-access UI. |
| `GET /health` | experimental diagnostic surface | Health check for the current Pico Home Core process. |
| `GET /api/system/version` | experimental diagnostic surface | Reports service and protocol version information. |
| `GET /api/system/status` | experimental diagnostic surface | Reports diagnostic service, capability, Pico Home claim-state and database migration state. |
| `GET /api/events` | experimental foundation API | Lists stored foundation events with additive cursor metadata. |
| `POST /api/events` | experimental foundation API | Accepts only currently writable foundation events. Not a full sync API. |
| `WS /ws` | experimental event stream | Streams events and connection messages. |

These endpoints are not yet a complete Pico Link or Pico Home Link specification.

They assume a trusted local access path while production authentication, authorization, Home membership, Pico Link transport security and policy/audit models are not implemented. They must not be treated as a public internet API or production remote-access surface. The exposure boundary is documented in `../architecture/0030-foundation-api-exposure-and-local-trust-boundary.md`.

### Current `GET /api/events` shape

`GET /api/events` accepts:

| Query parameter | Meaning |
|---|---|
| `limit` | Optional positive integer, clamped to the implementation maximum. |
| `after` | Optional opaque cursor returned by a previous response. |

The response keeps `events` as the primary additive field and adds cursor metadata:

```json
{
  "events": [],
  "nextCursor": null,
  "hasMore": false
}
```

`nextCursor` is opaque. Clients must not parse it or rely on its internal format.

The current `PicoEvent.signature` field is stored and returned as opaque metadata only. Pico Home Core does not verify signatures yet. Clients must not treat a populated `signature` field as proof of authorship, integrity or Pico identity until the key lifecycle, canonicalization, signature format, test vectors and verification model exist.

### Current `WS /ws` message types

`WS /ws` currently emits connection and event-broadcast messages for the local Foundation dashboard. These messages are not Pico Link packets and do not define a production remote transport.

```text
pico.core.connected
pico.event.created
```

Current message shapes:

```json
{
  "type": "pico.core.connected",
  "deviceId": "pico-home-core"
}
```

```json
{
  "type": "pico.event.created",
  "event": {
    "eventId": "example-event",
    "deviceId": "example-device",
    "lamport": 1,
    "wallTime": "2026-07-08T00:00:00.000Z",
    "type": "message.created",
    "stream": "session:example",
    "payload": {
      "role": "user",
      "text": "Hallo Pico"
    }
  }
}
```

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

### Current foundation payload values

The current Foundation API validates small development payloads for implemented writable Foundation event types. These value sets describe the current experimental foundation surface only. They are not a final companion, memory, Pico Link or Pico Home Link schema.

#### `message.created.payload.role`

```text
user
assistant
system
tool
```

#### `avatar.state_changed.payload.mode`

```text
everyday
technical
wwg
firefighter
security
organization
smart_home
```

#### `avatar.state_changed.payload.state`

```text
idle
listening
thinking
working
unsure
warning
confirmation_required
blocked
success
sleeping
```

#### `avatar.state_changed.payload.intensity`

```text
low
normal
high
```

#### `avatar.state_changed.payload.statusColor`

```text
neutral
blue
green
yellow
red
violet
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

### Current runtime capability flags

The current Pico Home Core status response advertises these implemented experimental runtime capability flags:

```text
pico.core.events.v1
pico.core.websocket.v1
pico.avatar_state.v1
```

These flags do not imply L2 Pico Link compatibility, L3 Pico Home Link compatibility, production readiness or commercial permission.

### Current Pico Home claim-state values

The current `GET /api/system/status` diagnostic shape exposes a minimal Pico Home claim-state value. This is diagnostic metadata only. It is not a claim API, membership credential or authorization boundary.

```text
unclaimed
claimed
```

Examples:

```text
pico.core.events.v1
pico.core.websocket.v1
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
