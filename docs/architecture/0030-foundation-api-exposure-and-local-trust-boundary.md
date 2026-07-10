# 0030 - Foundation API Exposure and Local Trust Boundary

## Status

Accepted as a foundation exposure and hardening constraint.

## Context

Pico Home Core currently exposes a small HTTP and WebSocket surface for the foundation phase:

- the foundation diagnostics dashboard at `/`
- `GET /health`
- `GET /api/system/version`
- `GET /api/system/status`
- `GET /api/events`
- `POST /api/realtime/tickets`
- `POST /api/events`
- `WS /ws`

These endpoints are useful for local development, Home Assistant add-on monitoring, diagnostics, release smoke tests and the current foundation dashboard.

They are not yet protected by a production authentication model, authorization model, Home membership model, Pico identity model, Pico Link transport security model, policy engine or audit model.

Current exposure facts:

- the default Core bind host is `0.0.0.0`
- the default Core port is `3100`
- the Home Assistant add-on maps host port `3100/tcp`
- the Home Assistant add-on does not yet use Home Assistant ingress
- direct Foundation HTTP API endpoints under `/api/` can be protected with the temporary `PICO_FOUNDATION_TOKEN`
- the Foundation REST API does not emit CORS allow headers
- the WebSocket endpoint has an Origin-boundary check
- when `PICO_FOUNDATION_TOKEN` is configured, direct WebSocket access requires either a non-browser bearer upgrade header or a short-lived single-use ticket minted through the token-protected Foundation API
- `GET /api/system/status` exposes diagnostic claim-state, capability and migration metadata
- `POST /api/events` accepts bounded client-provided Lamport input for foundation events
- the `signature` field on stored events is currently opaque, informational metadata and is not verified

At the same time, ADR 0028 defines remote reachability for Pico Home through Pico Link transports, primarily Pico Relay, not through public inbound Pico Home HTTP APIs. ADR 0029 defines identity, device, Home, transport and domain key roles that do not exist in the current implementation yet.

The project therefore needs an explicit boundary for the current Foundation API so deployment convenience does not accidentally become the future remote-access architecture.

## Decision

The current Foundation API is a trusted local foundation interface.

It may be used through trusted local access paths such as:

- local development on loopback or a developer-controlled network
- Home Assistant add-on access controlled by the local Home Assistant environment
- local network diagnostics in a trusted test environment
- CI and release smoke tests
- operator troubleshooting on infrastructure the operator controls

It must not be treated as:

- a public internet API
- a production remote-access API
- a Pico Link transport
- a Pico Home Link compatibility specification
- a Home membership or claim API
- a Home Assistant control API
- an authentication or authorization boundary
- a production personal-data API

Router port forwarding, public reverse proxying, unauthenticated WAN exposure or mobile-app remote access directly against the current Foundation API are outside the intended model.

## Core design rule

```text
Foundation HTTP is local diagnostics and foundation plumbing.
Pico Link is the future remote reachability surface.
```

## Terms

| Term | Meaning |
|---|---|
| Foundation API | Current HTTP and WebSocket endpoints implemented by Pico Home Core for foundation diagnostics and experimental event storage. |
| Local trust boundary | Deployment assumption that the API is reachable only by trusted local users, tools or infrastructure while production auth and membership are not implemented. |
| Trusted local access path | Loopback, trusted local network, Home Assistant add-on environment, CI, or controlled operator access. |
| Public exposure | Internet, untrusted WAN, public reverse proxy, public tunnel, or other access path where arbitrary clients can reach the Foundation API. |
| Pico Link remote access | Future transport-neutral encrypted remote communication through Pico Link transports and relays. |
| Ingress boundary | A future protected entry path such as Home Assistant ingress, local pairing, passkey-backed login or another reviewed access model. |

## Current implementation boundary

The current implementation provides:

- a static foundation diagnostics dashboard
- health and version diagnostics
- system status diagnostics including capabilities, database migration state and minimal Pico Home claim-state metadata
- cursor-based listing of stored foundation events
- limited creation of currently writable foundation events
- optional temporary `PICO_FOUNDATION_TOKEN` protection for direct HTTP `/api/` endpoints
- WebSocket connection and event broadcast messages
- a minimal WebSocket Origin check for browser-initiated connections
- optional temporary token/ticket protection for direct `WS /ws` access when `PICO_FOUNDATION_TOKEN` is configured
- WebSocket ping/pong keepalive and stale socket termination

The current implementation does not provide:

- production authentication
- production authorization
- CSRF or browser-session model
- REST CORS allowlist model
- Home Assistant entity access
- Home Assistant service execution
- Pico Rules
- Action Runner
- Action History
- Move-In Code generation or validation
- claim write endpoint
- Home Host Pico membership records
- Home Member Pico invitations or eviction
- Pico Identity Keys
- Pico Home Host Keys
- Device Keys
- domain content keys
- encrypted Pico Link payloads
- relay transport
- production audit trail
- signed-event verification

Until those pieces exist, the Foundation API must remain a local/trusted foundation surface.

## Current concrete threats

The current local/trusted boundary is not a complete security model. The project should continue to treat these concrete risks as foundation-hardening inputs:

| Threat | Current posture | Required direction |
|---|---|---|
| Cross-site WebSocket hijacking | Mitigated by rejecting browser WebSocket upgrades whose `Origin` does not match the request `Host` and is not explicitly allowlisted. In token mode, ADR 0039 adds a short-lived direct-access ticket boundary. | Keep the checks as defensive plumbing; they are still not production authentication. |
| DNS rebinding against diagnostic GET endpoints | Partially mitigated for direct `/api/` calls when `PICO_FOUNDATION_TOKEN` is configured; not solved for all browser/session cases. | Requires a real ingress/auth/session or local pairing boundary before broader exposure. |
| Arbitrary LAN clients writing foundation events | Partially mitigated for direct `/api/` calls when `PICO_FOUNDATION_TOKEN` is configured; trusted-local assumption remains for deployments without it. | Requires endpoint authorization, audit and abuse handling before the API is exposed beyond trusted local paths. |
| Lamport inflation through `POST /api/events` | Incoming Lamport values are bounded, but a trusted-local client can still advance ordering substantially. | Keep input bounds now; revisit once identity, device authorization and sync semantics exist. |
| Information disclosure via `/api/system/status` | Diagnostic endpoint reveals version, capabilities, claim-state and migration metadata. | Classify diagnostics by sensitivity before production auth or remote access. |
| Misinterpreting `signature` as verified | `signature` is stored but not checked against keys or signed manifests. | Treat it as unverified metadata until ADR 0029 follow-ups define keys, formats and verification. |
| Container process privileges | The current image keeps the platform default user so the Home Assistant `/data` mount remains writable for SQLite across add-on installations. | Before production hardening, add a tested entrypoint or platform-specific setup that prepares `/data` ownership and drops privileges without breaking persistence. |

These are not reasons to implement ad hoc authentication or custom cryptography. They define the backlog for a later foundation-hardening release.

## Endpoint classification

| Endpoint | Current classification | Exposure rule |
|---|---|---|
| `GET /` | local diagnostics dashboard | Trusted local access only. Not a companion UI, policy console or remote access UI. |
| `GET /health` | process health diagnostic | May be used by local supervisors and smoke tests. Not a public service status API. |
| `GET /api/system/version` | version diagnostic | Local/trusted diagnostic. Can reveal implementation and protocol version. |
| `GET /api/system/status` | system diagnostic | Local/trusted diagnostic. Can reveal capability, claim-state and database migration metadata. |
| `GET /api/events` | experimental foundation event listing | Local/trusted foundation API. Not full sync, not memory export, not stable Pico Link. |
| `GET /api/events/tail` | experimental dashboard event tail | Local/trusted diagnostic API. Returns latest Foundation events for the dashboard only; not sync and no durable cursors. |
| `POST /api/realtime/tickets` | experimental realtime ticket minting | Local/trusted Foundation guardrail. Mints short-lived tickets for `WS /ws`; not a login or product session API. |
| `POST /api/events` | experimental foundation event creation | Local/trusted foundation API. Only currently writable foundation events are accepted. |
| `WS /ws` | experimental event stream | Local/trusted realtime surface. Not relay transport and not Pico Link. |

Diagnostic metadata should be treated as low-sensitivity only in the current foundation environment. It may become more sensitive as claim, membership, device, migration and capability data become richer.

## Deployment responsibilities

The current service can be packaged in different ways, and each package must preserve the same exposure boundary.

| Deployment path | Boundary requirement |
|---|---|
| Local development | Prefer loopback or a trusted developer network. Do not use the current API as a public test server. |
| Standalone container | Publish the port only to trusted networks. Prefer loopback mapping when remote local access is not needed. |
| Home Assistant add-on | Treat port `3100` as a local add-on foundation interface. Home Assistant access control is not yet Pico membership or Pico authorization. |
| Future Pico Home Image | First-boot setup must define a protected setup channel before showing a Move-In Code or accepting a claim. |
| CI and smoke tests | Use isolated test databases and local process access. |

Changing default bind behaviour, port publishing, ingress settings or reverse-proxy support can be a packaging change and must be reviewed against this ADR.

## Home Assistant boundary

Home Assistant is the first packaging path, but Home Assistant access does not automatically become Pico authorization.

Home Assistant may protect the add-on UI or local network access path. That is useful as a deployment boundary, but it does not replace future Pico identity, membership, policy or audit models.

Before Pico can use Home Assistant entities or services, ADR 0019 still requires:

- authentication or ingress boundary
- entity allowlists
- service allowlists
- read/write risk classification
- policy decisions
- user confirmation for risky actions
- audit records
- clear UI indication of active access

The Foundation API must not become a hidden shortcut around those controls.

## Future ingress decision

Before broader browser or remote access, Pico needs a deliberate ingress decision. Two plausible foundation-hardening directions are:

| Option | Benefit | Tradeoff |
|---|---|---|
| Home Assistant ingress | Reuses Home Assistant's existing local user/session boundary for the add-on UI. | Ties the first protected browser path to Home Assistant packaging and does not define non-HA standalone access. |
| Temporary `PICO_FOUNDATION_TOKEN` | Simple to apply to standalone container and local development deployments. | Creates token lifecycle, storage, UI entry and leakage risks; must not become Pico identity or Home membership. |

Neither option is implemented by this ADR. Whichever path is chosen must be explicitly documented as a temporary foundation boundary unless it is later replaced by Pico identity, Home membership and policy-aware authorization.

ADR 0038 chooses the staged direction: Home Assistant ingress for the add-on browser path, a temporary `PICO_FOUNDATION_TOKEN` for direct standalone/container access, and later local pairing or Setup Mode for product bootstrap. ADR 0039 refines and implements the direct WebSocket portion with a short-lived ticket strategy. ADR 0040 refines the Home Assistant packaging portion with concrete ingress metadata, ingress-prefix URL requirements, add-on token option direction and direct-port transition rules.

## Remote access boundary

Product-level remote access should use:

```text
Pico Vault outside home
-> Pico Link Transport Facade
-> Pico Relay / Relay Network
-> Pico Home Endpoint
```

It should not use:

```text
Internet
-> public reverse proxy or router port forwarding
-> current Foundation HTTP API
```

A future Pico Link or Pico Home Link implementation may use WebSocket, HTTP, QUIC, WebRTC, relay sessions or other transports internally. That does not make the current `WS /ws` endpoint or current REST endpoints a Pico Link wire protocol.

The dashboard currently uses the experimental `GET /api/events/tail` surface for the latest Foundation events. That endpoint is a diagnostics convenience only. It is not a replica sync protocol, does not provide durable sync cursors and must not become a hidden substitute for Pico Link or Pico Home Link.

## Requirements before broader exposure

Before any Pico Home API is intentionally exposed beyond the trusted local boundary, the project must define at least:

- authentication model
- authorization and Home membership model
- session and token lifecycle
- browser-origin, CSRF and same-site expectations where browser access exists
- local pairing or setup-mode boundary where relevant
- rate limiting and abuse handling
- audit model for reads, writes and failed attempts
- endpoint classification by sensitivity and write risk
- TLS or protected transport expectations
- Home Assistant ingress or access-control integration if used
- compatibility capability flags for any stable surface
- conformance tests for advertised public behaviour
- how unverified event metadata such as `signature` is represented to clients
- how diagnostic endpoints behave under DNS rebinding and same-origin browser assumptions

For claim, residency, eviction, Pico Link, encrypted payloads or Home Assistant action execution, the stricter requirements in ADRs 0019, 0024, 0027, 0028 and 0029 also apply.

## Implementation implications

Documentation should consistently describe the current API as local/trusted and foundation-stage.

Runtime and packaging work should avoid implying that the current port is safe for public exposure. Future hardening may include:

- safer default bind settings for non-add-on deployments
- explicit configuration for exposed interfaces
- container entrypoint or platform setup that prepares `/data` and drops privileges where supported
- Home Assistant ingress support
- local setup-mode access rules
- authentication middleware
- endpoint-level authorization
- structured audit for protected operations
- explicit dashboard behaviour for truncated event history

None of those are implemented by this ADR.

Capability flags such as `pico.core.events.v1` and `pico.core.websocket.v1` describe current runtime support only. They do not imply production auth, remote access safety, L2 Pico Link compatibility, L3 Pico Home Link compatibility or commercial permission.

The event `signature` field is not a capability flag and not a security guarantee. Until key lifecycle, signing formats, verification rules and conformance tests exist, clients must not treat a populated `signature` field as proof of authorship or integrity.

## Non-goals

This ADR does not implement:

- authentication
- authorization
- user accounts
- Home membership APIs
- Move-In Code generation
- claim write endpoint
- Home Assistant ingress
- TLS termination
- reverse-proxy configuration
- Pico Link
- Pico Relay
- encrypted payload envelopes
- a stable public protocol schema

It also does not forbid controlled local diagnostics or developer testing. It defines the trust boundary those uses rely on.

## Open questions

- Should standalone development default to loopback while the Home Assistant add-on and container keep explicit all-interface binding?
- Which exact Home Assistant ingress implementation details should protect the dashboard before Pico identity and membership exist?
- How should the implemented ADR 0039 WebSocket ticket boundary interact with HA ingress once ingress exists?
- Which diagnostics can remain unauthenticated after production auth exists?
- How should local pairing work before a Pico identity has moved into an Empty Pico Home?
- Which endpoints should survive unchanged once Pico Home Link has a stable schema?
- How should local TLS, private CA, mDNS and browser trust be handled for dedicated Pico Home devices?
- How should failed remote or local access attempts be recorded before the full Action History model exists?

## Consequences

Positive:

- makes the current HTTP and WebSocket exposure boundary explicit
- prevents port `3100` from becoming an accidental public remote-access architecture
- aligns Foundation API documentation with the Pico Link and Relay model
- preserves Home Assistant as a packaging path without turning it into Pico authorization
- gives future auth, ingress and setup-mode work a concrete prerequisite list

Negative:

- makes local access assumptions visible instead of pretending the foundation API is already hardened
- may require future packaging changes if the default bind or add-on exposure model changes
- requires repeated documentation discipline until production auth and Pico Link exist

## Relationship to other ADRs

This ADR extends and constrains:

- `0001-foundation.md`
- `0019-home-assistant-threat-model.md`
- `0024-server-bootstrap-tenancy-and-eviction.md`
- `0027-dedicated-pico-home-image-and-first-boot-setup.md`
- `0028-pico-link-transport-facade-and-relay-network.md`
- `0029-identity-device-home-keys-and-e2e-boundaries.md`

It does not replace those ADRs. It defines how the current foundation-stage HTTP and WebSocket surfaces must be understood until the future auth, membership, Pico Link and cryptographic boundaries exist.
