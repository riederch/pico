# 0039 - Foundation WebSocket Ticket Boundary

## Status

Accepted and implemented for the current Foundation direct-access scope.

## Context

ADR 0038 chooses a staged Foundation access hardening model:

- Home Assistant ingress is the preferred protected add-on browser path.
- `PICO_FOUNDATION_TOKEN` is the temporary guardrail for direct standalone, container and developer-controlled access.
- Local pairing, Setup Mode, Move-In Code, Home membership and Pico identity sessions remain later product/bootstrap work.

The first `PICO_FOUNDATION_TOKEN` implementation protects direct HTTP Foundation API endpoints under `/api/...`.

`WS /ws` remains different:

- The current endpoint has a defensive browser `Origin` check.
- It has no token, session or ticket check.
- Browser WebSocket clients cannot set arbitrary `Authorization` headers.
- Putting the long-lived `PICO_FOUNDATION_TOKEN` into a WebSocket URL query string would leak it through request URLs, logs, browser tooling, proxies or support screenshots.
- Authenticating after the WebSocket opens would still allow unauthenticated clients to establish a realtime connection and complicate failure behavior.

The project needs a concrete direct-access WebSocket hardening direction that does not pretend to be production authentication, Home membership, Pico identity or Pico Link.

## Decision

For direct Foundation access, `WS /ws` should use a pre-upgrade credential when `PICO_FOUNDATION_TOKEN` is configured.

The preferred browser path is a short-lived, single-use Foundation realtime ticket:

1. The dashboard or browser client calls a token-protected HTTP endpoint to mint a ticket.
2. The ticket endpoint requires `Authorization: Bearer <PICO_FOUNDATION_TOKEN>`.
3. The server returns a high-entropy ticket scoped only to one future `WS /ws` upgrade.
4. The browser connects to `WS /ws` with that ticket in the WebSocket URL.
5. The server validates and consumes the ticket before accepting the WebSocket upgrade.

Non-browser clients may use either the same ticket flow or, if implemented and tested, an `Authorization: Bearer <PICO_FOUNDATION_TOKEN>` header on the WebSocket upgrade request.

The long-lived `PICO_FOUNDATION_TOKEN` must not be accepted in a WebSocket query string or in a first WebSocket message.

The existing WebSocket `Origin` check remains required browser defense. A ticket or bearer credential does not replace it.

## Core design rule

```text
The Foundation token may mint or present direct WebSocket access.
Browser WebSockets use short-lived tickets.
The long-lived Foundation token never goes into a WebSocket URL.
```

## Ticket endpoint direction

The current implementation adds a narrow Foundation API endpoint for minting WebSocket tickets.

Preferred shape:

```text
POST /api/realtime/tickets
Authorization: Bearer <PICO_FOUNDATION_TOKEN>
```

Example response:

```json
{
  "ticket": "base64url-random-ticket",
  "expiresAt": "2026-07-09T12:00:30.000Z"
}
```

The endpoint is Foundation-stage plumbing:

- not Pico Link
- not Pico Home Link
- not Home membership
- not a product login endpoint
- not a production session API
- not a public compatibility guarantee

It exists only because browser WebSocket handshakes cannot carry arbitrary authorization headers.

## Ticket properties

Foundation realtime tickets should be:

- high entropy
- short lived, preferably around 30 seconds and no longer than one minute without a separate decision
- single use
- scoped only to `WS /ws`
- stored server-side as a digest, not as raw ticket text
- held in memory only
- invalidated by process restart
- purged when expired
- bounded by a maximum outstanding ticket count

The current implementation uses:

- 30 second ticket TTL
- 128 maximum outstanding tickets per Core process
- server-side SHA-256 ticket digests
- in-memory ticket storage only

They should not be:

- persisted in SQLite
- accepted for HTTP API calls
- accepted for other endpoints
- reusable after a successful upgrade
- a refresh token
- a user session
- an identity credential
- a Home membership credential
- a Move-In Code
- a Pico Link transport credential

## WebSocket upgrade behavior

When `PICO_FOUNDATION_TOKEN` is not configured, the current trusted-local WebSocket behavior may remain:

- `WS /ws` is allowed when the `Origin` check passes.
- Missing `Origin` remains allowed for non-browser clients.
- The endpoint remains local diagnostics and foundation realtime only.

When `PICO_FOUNDATION_TOKEN` is configured for direct access, `WS /ws` should require:

1. the existing `Origin` check to pass for browser requests, and
2. either a valid bearer token in the upgrade headers for non-browser clients or a valid single-use ticket in the query string.

Missing, expired, reused or invalid credentials should fail before the upgrade is accepted. The response should be a normal HTTP rejection, preferably:

- `401` for missing or invalid WebSocket credentials
- `403` for rejected browser origins

The server should not send a realtime `pico.core.connected` message until the upgrade has passed both checks.

## URL and logging posture

The long-lived `PICO_FOUNDATION_TOKEN` must never be carried in:

- WebSocket query strings
- first WebSocket messages
- browser local storage
- reconnect URLs
- dashboard DOM attributes

The short-lived ticket will appear in the WebSocket URL because browser WebSocket clients need a handshake-visible credential. That is acceptable only because the ticket is high-entropy, short lived, single use and scoped to one upgrade.

Implementations should still treat tickets as secrets:

- Do not log raw ticket values.
- Redact `ticket` query parameters in request logs where possible.
- Avoid including ticket values in error messages.
- Do not echo the ticket in the selected WebSocket subprotocol.
- Keep dashboard reconnect logic from exposing tickets in visible UI.

## Dashboard behavior

The Foundation dashboard should keep the existing temporary token posture:

- The user may enter `PICO_FOUNDATION_TOKEN` manually for direct local access.
- The dashboard should keep the token in memory only.
- The dashboard should not persist the token in local storage, session storage, IndexedDB, cookies or URL parameters.
- Before opening or reopening `WS /ws`, the dashboard should mint a fresh realtime ticket through the protected HTTP endpoint.
- Reconnects should mint a new ticket rather than reusing an old WebSocket URL.

If no `PICO_FOUNDATION_TOKEN` is configured, the dashboard may keep the current direct WebSocket connection behavior.

## Home Assistant ingress relationship

This ADR defines the direct-access WebSocket hardening path. It does not define the final Home Assistant ingress implementation.

Home Assistant ingress remains the preferred protected browser path for the add-on dashboard under ADR 0038. ADR 0040 defines the current ingress packaging direction:

- target Home Assistant ingress metadata
- path-prefix-aware dashboard endpoint construction
- WebSocket-through-ingress validation
- optional add-on token option wiring
- transitional direct-port behavior
- watchdog and `/health` posture

Home Assistant ingress is still not Pico identity, Home membership, Pico Rules authority or product remote access.

## Threat posture

| Threat | Ticket strategy effect | Remaining gap |
|---|---|---|
| Long-lived token leakage through WebSocket URLs | Avoided by never accepting `PICO_FOUNDATION_TOKEN` in query strings. | Short-lived tickets still need log redaction and careful dashboard reconnect behavior. |
| Cross-site WebSocket hijacking | Existing `Origin` check remains the first browser boundary; ticket adds a second direct-access boundary when token mode is enabled. | Origin and tickets are still not production auth or same-site session design. |
| Arbitrary LAN WebSocket listeners | Token mode can reject unauthenticated realtime connections. | No endpoint-level authorization, identity, rate limiting or audit model yet. |
| DNS rebinding against WebSocket | Token-backed ticket minting limits WebSocket access if the attacker cannot read or provide the token and the Origin check holds. | Broader browser session, local TLS and same-site assumptions remain future work. |
| Treating `WS /ws` as Pico Link | The ticket only protects Foundation realtime diagnostics. | Pico Link still requires its own protocol, crypto, membership and conformance work. |

## Implementation implications

The current implementation stays narrow and testable:

- ticket minting under `/api/realtime/tickets`
- reuse of the existing `PICO_FOUNDATION_TOKEN` validation boundary for ticket minting
- high-entropy single-use ticket generation with Node's crypto APIs
- in-memory digest-only ticket storage
- ticket expiry and purge behavior
- valid credentials in the WebSocket `preValidation` path when the token is configured
- the existing WebSocket `Origin` check
- non-browser bearer-token upgrade support
- dashboard ticket minting before WebSocket connect/reconnect
- no dashboard persistence for tokens or tickets
- request-log redaction for `ticket` query parameters

Implemented tests:

- `WS /ws` remains available under the current trusted-local behavior when no token is configured.
- Missing WebSocket credentials are rejected when `PICO_FOUNDATION_TOKEN` is configured.
- A valid minted ticket allows one WebSocket connection.
- Ticket reuse is rejected.
- Expired tickets are rejected.
- The long-lived token is not accepted as a query parameter.
- A valid ticket does not bypass the existing Origin check.
- A valid non-browser bearer upgrade is accepted.
- Dashboard reconnect mints a fresh ticket.

## Non-goals

This ADR does not implement or define:

- production authentication
- production authorization
- user accounts
- passkeys
- Home membership
- Move-In Code behavior
- Setup Mode
- local pairing UX
- product sessions
- refresh tokens
- CSRF/session-cookie model
- Pico Identity Keys
- Device Keys
- Home Membership Credentials
- Pico Link
- Pico Relay
- TLS termination
- public reverse-proxy support
- Home Assistant ingress metadata
- Home Assistant entity or service access
- Action History audit records

## Open questions

- Should the current 30-second ticket TTL and 128 outstanding-ticket cap remain fixed or become explicit configuration later?
- Are non-browser bearer-token WebSocket upgrades sufficient for future non-browser direct clients, or should those clients prefer the ticket flow too?
- Should failed WebSocket credential attempts be counted or recorded before Action History exists?
- Is the current Fastify request serializer redaction sufficient for all future logging configurations?
- How should the HA ingress milestone handle WebSocket ticketing if the direct port is no longer user-visible?
- When should direct all-interface binding require `PICO_FOUNDATION_TOKEN`?
- How should local TLS, private CA, mDNS and browser trust be handled for dedicated Pico Home devices?

## Consequences

Positive:

- closes the biggest design gap left by the HTTP token slice
- avoids putting the long-lived Foundation token into WebSocket URLs
- keeps browser and non-browser WebSocket constraints explicit
- preserves the existing Origin check as separate browser defense
- gives the next implementation milestone clear tests
- keeps temporary Foundation protection separate from Pico identity, Home membership and Pico Link

Negative:

- adds a small in-memory ticket mechanism before real sessions exist
- requires careful log redaction despite short ticket lifetime
- creates another transitional Foundation-only endpoint
- still does not provide production auth, authorization, audit, rate limiting or remote-access safety

## Relationship to other ADRs

This ADR refines the WebSocket portion of:

- `0030-foundation-api-exposure-and-local-trust-boundary.md`
- `0038-foundation-local-access-hardening-and-ingress-boundary.md`

Its Home Assistant ingress packaging interaction is refined by:

- `0040-foundation-home-assistant-ingress-and-addon-token-options.md`

It remains constrained by:

- `0019-home-assistant-threat-model.md`
- `0024-server-bootstrap-tenancy-and-eviction.md`
- `0027-dedicated-pico-home-image-and-first-boot-setup.md`
- `0028-pico-link-transport-facade-and-relay-network.md`
- `0029-identity-device-home-keys-and-e2e-boundaries.md`
- `0031-pico-link-identity-relay-and-domain-threat-model.md`
- `0032-pico-link-envelope-and-credential-schema-direction.md`
- `0033-key-lifecycle-rotation-revocation-and-recovery.md`
- `0034-canonicalization-signature-inputs-and-test-vectors.md`

It does not replace Home Assistant ingress, local pairing, Setup Mode, Move-In, Home membership, Pico identity, Pico Link or product authorization decisions.
