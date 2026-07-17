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
| `GET /api/events/tail` | experimental diagnostic surface | Returns the latest foundation events for diagnostics dashboard use. Not a replica sync protocol and no durable sync cursors. |
| `POST /api/realtime/tickets` | experimental foundation realtime guardrail | Mints short-lived single-use tickets for direct `WS /ws` browser upgrades, under the static token or an operator session. |
| `POST /api/events` | experimental foundation API | Accepts only currently writable foundation events. Not a full sync API. |
| `POST /api/auth/bootstrap` | experimental foundation operator bootstrap | Establishes the first operator from the per-process bootstrap code printed on the host log. Available only while no operator exists. Not a Move-In Code or claim API. |
| `POST /api/auth/session` | experimental foundation operator login | Exchanges the operator passphrase for an opaque session. Not a product login or Pico identity. |
| `GET /api/auth/session` | experimental foundation operator surface | Reports whether the calling session is still live and when it expires. |
| `DELETE /api/auth/session` | experimental foundation operator surface | Logs the calling session out. |
| `DELETE /api/auth/sessions` | experimental foundation administration surface | Revokes every session. Requires an operator session. |
| `PUT /api/auth/credential` | experimental foundation administration surface | Replaces the operator passphrase; requires the current one and ends every session. |
| `POST /api/memory/domains/:privacyDomain/shred` | experimental irreversible administration surface | Destroys a privacy domain's key versions so its content becomes unreadable (ADR 0071). Requires an operator session **and** a `confirm` field repeating the exact domain name; refuses with `409` when memory encryption is off, because there would be no keys to destroy. Appends a `memory.domain_shredded` audit event. |
| `GET /api/memory/retention-policies` | experimental foundation administration surface | Lists named retention policies. Requires an operator session. |
| `POST /api/memory/retention-policies` | experimental foundation administration surface | Creates a retention policy. Requires an operator session. |
| `GET /api/memory/retention-policies/:retentionPolicyId` | experimental foundation administration surface | Reads one retention policy. Requires an operator session. |
| `PUT /api/memory/retention-policies/:retentionPolicyId` | experimental foundation administration surface | Edits a retention policy; the change applies to every item referencing it at the next sweep. Requires an operator session. |
| `DELETE /api/memory/retention-policies/:retentionPolicyId` | experimental foundation administration surface | Revokes a retention policy. Items still referencing it fall back to fail-safe keep, so this deletes no memory. Requires an operator session. |
| `GET /api/memory/domains/:privacyDomain/items` | experimental foundation content surface | Lists a privacy domain's active items with decrypted content, cursor-paged (`limit`, `after`). Authorized by **domain readership**, a distinct authority from the operator role (ADR 0077): an operator session alone does not read content, and the static token never reaches here. |
| `GET /api/memory/domains/:privacyDomain/items/:memoryItemId` | experimental foundation content surface | Reads one active item's content, or `404` when it is absent, deleted or tombstoned. A crypto-shredded item reports `contentUnavailable` rather than fabricating content. Same readership authority. |
| `WS /ws` | experimental event stream | Streams events and connection messages. |

These endpoints are not yet a complete Pico Link or Pico Home Link specification.

They assume a trusted local access path while production authentication, authorization, Home membership, Pico Link transport security and policy/audit models are not implemented. They must not be treated as a public internet API or production remote-access surface. The exposure boundary is documented in `../architecture/0030-foundation-api-exposure-and-local-trust-boundary.md`; the staged local hardening direction is documented in `../architecture/0038-foundation-local-access-hardening-and-ingress-boundary.md`; the direct-access WebSocket ticket boundary is documented in `../architecture/0039-foundation-websocket-ticket-boundary.md`; the Home Assistant ingress packaging direction is documented in `../architecture/0040-foundation-home-assistant-ingress-and-addon-token-options.md`.

The current Foundation API is local diagnostics only. Direct Foundation HTTP API access can be protected with the temporary `PICO_FOUNDATION_TOKEN` and with a local Foundation Operator login, but this is not production authentication, authorization, membership, claim, production memory or Home Assistant control boundary. Current `deviceId` values are client-supplied metadata, not verified device identity.

Every Foundation API route carries exactly one access class (`../architecture/0075-foundation-local-authentication-session-and-membership-threat-model-and-scoping.md`), enforced at route registration so an unclassified route cannot be served. Authority comes from two sources: the **operator session** (`../architecture/0076-foundation-operator-credential-session-and-bootstrap-mechanics.md`) and, later, domain readership. The principal-less `PICO_FOUNDATION_TOKEN` reaches diagnostics at most and never administration. Operator sessions are opaque, sent as `Authorization: Bearer <session>`, held in memory only and never persisted; they are not cookies, so the browser attaches no ambient credential.

When `PICO_FOUNDATION_TOKEN` is configured, or once an operator exists, `WS /ws` requires either a non-browser bearer upgrade header (token or session) or a short-lived single-use realtime ticket. Neither the long-lived token nor a session may be placed in a WebSocket URL.

### Current `GET /api/events` shape

`GET /api/events` accepts:

| Query parameter | Meaning |
|---|---|
| `limit` | Optional positive integer, clamped to the implementation maximum. |
| `after` | Optional opaque cursor returned by a previous response. |

`GET /api/events/tail` accepts `limit` and returns the latest stored events without changing the cursor contract for `GET /api/events`.

The response keeps `events` as the primary additive field and adds cursor metadata:

```json
{
  "events": [],
  "nextCursor": null,
  "hasMore": false
}
```

`nextCursor` is opaque. Clients must not parse it or rely on its internal format.

For `GET /api/events/tail`, `events` contains the latest page in chronological order, `nextCursor` is currently `null`, and `hasMore` means older stored events were omitted.

The current `PicoEvent.signature` field is stored and returned as opaque metadata only. Pico Home Core does not verify signatures yet. Clients must not treat a populated `signature` field as proof of authorship, integrity or Pico identity until the key lifecycle, canonicalization, signature format, test vectors and verification model exist.

### Current `WS /ws` message types

`WS /ws` currently emits connection and event-broadcast messages for the local Foundation dashboard. These messages are not Pico Link packets and do not define a production remote transport. The current implementation uses an Origin check and, when `PICO_FOUNDATION_TOKEN` is configured, the ADR 0039 ticket/bearer upgrade boundary.

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

These are the implemented foundation event types. All are writable through `POST /api/events` except the server-synthesized ones listed below, which the client write path rejects:

```text
device.registered
device.seen
session.created
message.created
avatar.state_changed
memory.recorded
memory.tombstone
memory.domain_shredded
auth.operator_bootstrapped
auth.credential_changed
auth.operator_reset
auth.sessions_revoked
```

Server-synthesized foundation event types (exported as `serverSynthesizedFoundationEventTypes`), appended by the server and never accepted on `POST /api/events`:

```text
memory.domain_shredded
auth.operator_bootstrapped
auth.credential_changed
auth.operator_reset
auth.sessions_revoked
```

`memory.recorded` records a reference to a deleteable memory item (ADR 0068 / ADR 0069). Its `POST /api/events` request carries the content (`{ privacyDomain, contentType, content, summary?, owner?, controller?, retentionPolicyRef? }`); an unknown `retentionPolicyRef` is rejected at write time, because the sweep's fail-safe rule would otherwise keep the item forever while the writer believed expiry was configured. The reference is stored with the item and does not appear in the event payload; the server stores the content in the deleteable memory store and records a server-derived event whose payload is only the reference `{ memoryItemId, privacyDomain, contentType, summary? }` with posture `reference_only`. The append-only event never holds the content. The stored event and its `memoryItemId` are returned in the response. On read, `GET /api/events` and `/api/events/tail` enrich each `memory.recorded` event with a `resolutionState` (`resolvable`, `deleted` or `unknown`) computed from the store; this is a read-time projection and does not change the stored event.

`memory.tombstone` is the append-only deletion marker for a deleteable memory item (ADR 0014 / ADR 0068). Its payload is `{ memoryItemId, privacyDomain, reason? }` and carries no sensitive content. Writing one transitions a matching `deleted` memory item to `tombstoned` on a best-effort basis; the event log stays the source of truth.

`memory.domain_shredded` is the append-only crypto-shred audit record for a privacy domain (ADR 0071 step 4, ADR 0037 audit style). Its payload is `{ privacyDomain, removedKeyVersions, reason? }` and carries no content or key material; the actor and time are the event's `deviceId` and `wallTime`. It is appended by the server's crypto-shred operation and rejected on the client write path, so a client cannot forge a shred record.

The `auth.*` types are the append-only Foundation Operator audit trail (ADR 0076, ADR 0037 audit style): `auth.operator_bootstrapped` (payload `{}`) when the first operator credential is established, `auth.credential_changed` (payload `{}`) when the passphrase is replaced, `auth.operator_reset` (payload `{ reason? }`) when a local reset clears the operator, and `auth.sessions_revoked` (payload `{ revokedSessions }`) when all sessions are revoked at once. They carry no credential material, no session identifiers and no content; the actor and time are the event's `deviceId` and `wallTime`. All four are server-synthesized and rejected on the client write path. Individual logins, logouts, failed logins and rate-limit hits are deliberately **not** recorded here: they are attacker-triggerable and stay in bounded operational logging so the append-only log cannot be flooded (ADR 0075 A9).

### Current foundation payload schemas

The current Foundation API validates exact development payload schemas for implemented writable Foundation event types. Unknown payload fields are rejected so clients cannot hide personal memory, credentials, location, health, relationship or product data inside append-only Foundation events.

These schemas describe the current experimental foundation surface only. They are not a final companion, memory, Pico Link or Pico Home Link schema.

#### `device.registered.payload`

The current payload is an empty diagnostics marker:

```json
{}
```

It does not carry verified identity, device metadata, membership or trust claims.

#### `device.seen.payload.status`

```text
online
offline
```

#### `session.created.payload`

The current payload is an empty diagnostics marker:

```json
{}
```

It does not define product session semantics.

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

### Reserved payload posture direction

These names are reserved privacy and deletability direction for later additive protocol work (ADR 0014, operationalized by ADR 0067). They are exported as `payloadPostures` in `@pico/protocol`:

```text
inline_operational
inline_test
reference_only
summary_only
redacted
```

The Foundation `PicoEvent` shape now carries an optional additive `payloadPosture` envelope field (ADR 0067); an absent value is treated as `inline_operational` and existing events stay unchanged. Only `inline_operational` and `inline_test` are writable through `POST /api/events`; `reference_only`, `summary_only` and `redacted` are reserved for future memory-referencing events and are rejected with a 400. These names do not implement memory storage, tombstones, retention policy, privacy domains, crypto-shredding or deleteable memory. Inline Foundation payloads remain development/foundation data only.

### Reserved memory item deletion states

Reserved deleteable-memory direction (ADR 0014, defined by ADR 0068), exported as `memoryItemDeletionStates` in `@pico/protocol`. There is no memory store, deletion or tombstone runtime:

```text
active
deleted
tombstoned
```

### Reserved reference target resolution states

Reserved reference-target direction (ADR 0068), exported as `referenceTargetResolutionStates` in `@pico/protocol`. A reference target names where a deleteable memory item lives; it is not the content and is not accepted on any current write path:

```text
resolvable
deleted
unknown
```

### Reserved memory content postures

Reserved memory-content protection direction (ADR 0070), exported as `memoryContentPostures` in `@pico/protocol`. Storage metadata for how a memory item's content is protected at rest, not an access decision. `plaintext_foundation` is the current state (content stored as plaintext, foundation/development data only); `domain_encrypted` is the target state (encrypted under a privacy-domain content key with a key-envelope reference). No encryption, key management or crypto-shredding exists yet:

```text
plaintext_foundation
domain_encrypted
```

### Reserved memory retention modes

Reserved memory retention direction (ADR 0074), exported as `memoryRetentionModes` in `@pico/protocol`. How a memory item's retention is governed, referenced by the item's retention policy. `keep_until_deleted` is the system default (no automatic expiry; content lives until a user or controller deletes it); `delete_after_max_age` expires content once the item is older than the policy's maximum age, deleting through the tombstoned deletion path. A missing or unresolvable policy never deletes (fail-safe keep). No compliance or legal-hold semantics:

```text
keep_until_deleted
delete_after_max_age
```

### Reserved context-signal direction

`ContextSignalLevel` and its deprecated alias `TrustedLevel` are TypeScript planning types only. They are not fields in the current Foundation event payload schema and do not create an authorization, membership or host-administration boundary.

The current compatibility type still contains the legacy value `admin`. That value must be read only as a reserved context-signal label. It is not a role, permission, capability, Home Host Pico membership grant, Pico Rules decision or Action Runner authorization.

Future work should separate context evidence, roles, capabilities and membership credentials explicitly before any context-signal data becomes writable or security-relevant.

### Product action event types

These names are product-facing protocol direction. They are reserved and not writable through the current Foundation `POST /api/events` endpoint until dedicated Pico Rules, Action Runner and Action History write paths exist:

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

These names exist as reserved compatibility aliases for earlier technical terminology:

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

They are not writable through the current Foundation `POST /api/events` endpoint and must not be silently removed without an alias period, versioning or compatibility adapter.

### Pico Home event direction

These names describe future Pico Home Link direction:

```text
pico_home.claim_requested
pico_home.claim_completed
pico_home.invite_created
pico_home.resident_joined
pico_home.resident_removed
```

They are not writable through the current Foundation `POST /api/events` endpoint. They are not yet a host claim API, membership API, residency protocol or eviction protocol.

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

## Conformance fixture planning

Future compatibility claims need published fixtures and runner semantics before they can become strong claims.

The planned fixture layout and current Foundation event/realtime fixture seed are documented in [`conformance-fixtures.md`](conformance-fixtures.md).

That document and the seed fixtures do not publish a conformance suite, certify L4 compatibility or make current Foundation APIs production-ready.

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
