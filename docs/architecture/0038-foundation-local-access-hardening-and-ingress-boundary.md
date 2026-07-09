# 0038 - Foundation Local Access Hardening and Ingress Boundary

## Status

Accepted as a foundation hardening direction.

## Context

ADR 0030 defines the current Foundation HTTP and WebSocket API as a trusted local diagnostics and foundation interface.

That boundary is documented, but not yet fully enforced by runtime access control:

- Pico Home Core defaults to `PICO_HOST=0.0.0.0`.
- The default port is `3100`.
- The Home Assistant add-on maps `3100/tcp`.
- The add-on does not yet use Home Assistant ingress.
- The REST endpoints do not implement production authentication, authorization, CSRF protection or a session model.
- `WS /ws` has a defensive browser `Origin` check, but no authentication.
- `POST /api/events` accepts bounded Foundation event writes from trusted local clients.
- `GET /api/system/status` exposes diagnostic version, capability, migration and claim-state metadata.

This is acceptable for the foundation phase only while deployments remain trusted-local. It is not acceptable as the product remote-access model and must not become a shortcut around Pico Link, Pico identity, Home membership, Pico Rules or Action History.

ADR 0030 left a deliberate hardening decision open:

- whether Home Assistant ingress should protect the add-on dashboard
- whether a temporary Foundation token should protect direct access
- whether a different local pairing or auth path should come first

This ADR resolves that direction for the next foundation hardening milestone without implementing it.

## Decision

Pico will use a staged Foundation access hardening model:

1. Keep the current Foundation API classified as trusted-local diagnostics and foundation plumbing.
2. Use Home Assistant ingress as the preferred protected browser path for the Home Assistant add-on dashboard.
3. Use a temporary direct-access Foundation token for standalone, container or developer-controlled access paths where the current API is reachable directly.
4. Keep local pairing, Setup Mode, Move-In Code, Home membership and Pico identity sessions as later product/bootstrap work.

This model adds a near-term safety boundary without pretending the Foundation API is production auth, Pico Home Link, Pico Link or a membership protocol.

## Core design rule

```text
Home Assistant ingress protects the add-on browser path.
A temporary Foundation token protects direct Foundation access.
Neither one is Pico identity, Home membership or remote access.
```

## Access paths

| Access path | Direction | Boundary meaning |
|---|---|---|
| Home Assistant add-on browser UI | Prefer Home Assistant ingress when implemented. | Reuses the local Home Assistant user/session boundary for the add-on dashboard only. |
| Standalone local development | Keep direct access possible, preferably loopback unless explicitly exposed. | Developer-controlled trusted local access. |
| Standalone container on a trusted LAN | Require an explicit operator decision before exposure. | Temporary Foundation token should protect direct diagnostics and writes when implemented. |
| CI and release smoke tests | Keep isolated local process access. | Tests may use loopback and disposable databases. |
| Public internet, router port forwarding, public reverse proxy or arbitrary tunnel | Not allowed for current Foundation API. | Product remote reachability belongs to Pico Link and Relay. |

Home Assistant ingress and a direct Foundation token are complementary, not competing product auth systems.

## Home Assistant ingress direction

Home Assistant ingress is the preferred protected browser path for the add-on because:

- Home Assistant already owns the add-on user/session entry point.
- It avoids teaching users to expose `3100` directly for the dashboard.
- It fits the current packaging path without inventing Pico user accounts early.
- It gives the dashboard a practical access boundary before Pico identity and membership exist.

This does not mean Home Assistant becomes Pico authority.

Home Assistant ingress must not become:

- Pico identity
- Home membership
- a Move-In Code
- a Home Host Pico credential
- Pico Rules authority
- Action Runner authority
- permission to access Home Assistant entities or services
- production remote access for arbitrary Pico clients

The Home Assistant add-on may continue to need local health checks or internal service ports, but the user-facing browser path should move toward ingress rather than direct `http://host:3100` access.

Exact Home Assistant metadata, port exposure and watchdog behavior are implementation details for a later packaging milestone.

## Temporary Foundation token direction

`PICO_FOUNDATION_TOKEN` is the preferred name for a temporary direct-access token if direct Foundation hardening is implemented.

The token is a narrow foundation guardrail. It exists to reduce casual or accidental access from local network clients and browser attacks against direct Foundation endpoints.

It must be documented and implemented as:

- temporary
- local/direct-access only
- manually configured or generated by deployment tooling
- scoped to the current Foundation HTTP and WebSocket surface
- replaceable by later local pairing, sessions, membership and Pico identity work

It must not be documented or implemented as:

- Pico identity
- a Device Key
- a Home Membership Credential
- a Move-In Code
- a recovery secret
- a long-lived admin credential
- Pico Link authentication
- public remote-access security
- authorization to call Home Assistant tools

## Token posture

When the token is configured, the current implementation protects direct Foundation HTTP API endpoints and direct `WS /ws` access:

| Endpoint | Token posture for direct access |
|---|---|
| `GET /` | May remain reachable as a shell only if needed for token entry; diagnostic data loaded by the dashboard must be token-protected. |
| `GET /health` | May remain unauthenticated for local supervisors and watchdogs if it stays minimal and non-sensitive. |
| `GET /api/system/version` | Token-protected for direct access. |
| `GET /api/system/status` | Token-protected for direct access. |
| `GET /api/events` | Token-protected for direct access. |
| `GET /api/events/tail` | Token-protected for direct access. |
| `POST /api/realtime/tickets` | Token-protected for direct access; mints short-lived single-use tickets for `WS /ws`. |
| `POST /api/events` | Token-protected for direct access. |
| `WS /ws` | Token/ticket-protected for direct access: non-browser bearer upgrade header or short-lived single-use realtime ticket for browser upgrades. |

The WebSocket `Origin` check remains useful browser defense, but it remains separate from token or ticket validation.

The long-lived token should not be accepted in ordinary URL query strings. Headers are preferred for HTTP. ADR 0039 chooses short-lived single-use realtime tickets for browser WebSocket handshakes because browser WebSocket clients cannot set arbitrary request headers.

## Bind and port direction

Changing bind defaults can break packaging and smoke tests, so it must be reviewed as a runtime and packaging change.

Direction:

- Standalone local development should prefer loopback when no explicit exposure is needed.
- Container and Home Assistant packaging may keep explicit all-interface binding where the platform requires it.
- Any all-interface direct exposure should be treated as an operator decision, not a security default.
- A future token-required mode should be considered for direct all-interface deployments.
- Home Assistant ingress should reduce reliance on direct browser access to port `3100`.

This ADR does not change `PICO_HOST`, Docker `ENV`, Home Assistant port mappings or CI smoke tests.

## Threat posture

| Threat | Staged hardening effect | Remaining gap |
|---|---|---|
| DNS rebinding against diagnostic GET endpoints | Ingress or token-protected API calls reduce exposure if the token/session is not readable by the attacker. | A full browser session, same-site and local TLS model is still future work. |
| Cross-site WebSocket hijacking | Existing `Origin` check remains useful; ADR 0039 adds a short-lived ticket boundary for direct token mode. | Still not production auth or same-site session design. |
| Arbitrary LAN writes to `POST /api/events` | A direct Foundation token can reduce casual local writes. | It is not endpoint authorization, identity, rate limiting or audit. |
| Diagnostic metadata disclosure | Token or ingress can reduce direct access to version/status/event diagnostics. | Diagnostics still need sensitivity classification before production auth. |
| Port-forwarding the current API | Still disallowed. | Product remote access must use Pico Link and Relay after their security model exists. |
| Home Assistant entity misuse | Not addressed by ingress alone. | ADR 0019 controls still apply before HA entity or service access exists. |

## Implementation implications

Remaining implementation milestones should stay narrow and testable.

For Home Assistant ingress, that milestone should define:

- add-on ingress metadata and routing
- whether direct port `3100` remains user-visible, internal-only or transitional
- watchdog and health-check behavior
- documentation for users who previously opened the web UI by port
- tests or smoke checks that do not require a full production HA environment unless available

Implemented `PICO_FOUNDATION_TOKEN` HTTP work:

- environment/config parsing and validation
- HTTP `/api/...` endpoint protection
- `401` plus `WWW-Authenticate` behavior for missing or invalid credentials
- dashboard token entry for direct local access
- tests for protected HTTP reads and writes

Implemented ADR 0039 token work:

- short-lived single-use WebSocket ticket minting under `/api/realtime/tickets`
- in-memory ticket digest storage, expiry and consume-on-use behavior
- direct `WS /ws` credential checks when `PICO_FOUNDATION_TOKEN` is configured
- non-browser bearer-token WebSocket upgrade support
- dashboard ticket minting before WebSocket connect/reconnect
- request-log redaction for `ticket` query parameters
- tests for protected WebSocket connection attempts, ticket reuse, expiry and Origin behavior

For bind behavior, a later milestone should define:

- whether the default host changes for local development
- whether Docker and Home Assistant keep explicit `0.0.0.0`
- whether direct all-interface binding without ingress/token emits a warning or fails in a future mode

No implementation should describe the result as production authentication or membership.

## Non-goals

This ADR does not implement or define:

- production authentication
- production authorization
- user accounts
- passkeys
- Home membership APIs
- Move-In Code generation or validation
- claim write endpoints
- local pairing UX
- Setup Mode
- Pico Identity Keys
- Device Keys
- Home Membership Credentials
- Pico Link
- Pico Relay
- TLS termination
- public reverse-proxy support
- Home Assistant entity access
- Home Assistant service execution
- Action Runner authorization
- product audit records

## Open questions

- Which exact Home Assistant ingress metadata and routing model should the add-on use?
- Should direct port `3100` remain exposed by the add-on after ingress exists, and if so in which mode?
- Should `PICO_FOUNDATION_TOKEN` be optional, required when `PICO_HOST` is not loopback, or controlled by a separate access mode?
- How should the dashboard store or hold the temporary token without encouraging long-lived secret leakage?
- Should the 30-second WebSocket ticket TTL and 128 outstanding-ticket cap remain fixed or become explicit configuration later?
- Which failed access attempts should be recorded before Action History exists?
- When should standalone development default to loopback?
- How should local TLS, private CA, mDNS and browser trust be handled for dedicated Pico Home devices?

## Consequences

Positive:

- resolves the ADR 0030 hardening direction without jumping to product auth
- gives Home Assistant add-on work a concrete ingress target
- gives standalone/container deployments a small direct-access hardening path
- keeps Pico identity, membership, Move-In Code and pairing separate from temporary Foundation protection
- reduces the risk that port `3100` becomes the accidental remote-access architecture

Negative:

- introduces two transitional access paths that must be documented carefully
- WebSocket ticket/auth support is another transitional Foundation-only path that must not become product auth
- Home Assistant ingress will need packaging-specific validation
- does not remove the need for real auth, membership, policy, audit and Pico Link work

## Relationship to other ADRs

This ADR extends:

- `0019-home-assistant-threat-model.md`
- `0024-server-bootstrap-tenancy-and-eviction.md`
- `0027-dedicated-pico-home-image-and-first-boot-setup.md`
- `0028-pico-link-transport-facade-and-relay-network.md`
- `0029-identity-device-home-keys-and-e2e-boundaries.md`
- `0030-foundation-api-exposure-and-local-trust-boundary.md`
- `0031-pico-link-identity-relay-and-domain-threat-model.md`

It answers the ADR 0030 ingress-vs-token direction at the concept level.

ADR `0039-foundation-websocket-ticket-boundary.md` refines this ADR's direct-access WebSocket token/ticket boundary.

It does not replace the future Setup Mode, Move-In, Home membership, Pico identity, Pico Link or Home Assistant tool policy decisions.
