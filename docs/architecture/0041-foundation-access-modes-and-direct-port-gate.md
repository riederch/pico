# 0041 - Foundation Access Modes and Direct Port Gate

## Status

Accepted and implemented for Foundation access-mode parsing, startup validation, Home Assistant add-on defaulting and default direct host-port disablement. The temporary unsafe compatibility mode was removed before the first deployment.

## Context

ADR 0030 defines the current Foundation HTTP and WebSocket surface as trusted-local diagnostics and foundation plumbing.

ADR 0038 chooses a staged hardening direction:

- Home Assistant ingress should be the preferred add-on browser path.
- `PICO_FOUNDATION_TOKEN` should guard direct Foundation access.
- local pairing, Setup Mode, Move-In, Home membership and Pico identity remain later work.

ADR 0040 adds Home Assistant ingress metadata, ingress-prefix-aware dashboard URLs and the add-on `pico_foundation_token` bridge. Before this ADR was implemented, the add-on still mapped host port `3100/tcp` by default. That meant a tokenless add-on install exposed the Foundation API directly to the local network while also offering an ingress panel.

This ADR makes unsafe exposure an explicit operator decision or a startup error, not an implicit default.

## Decision

Pico Core introduces an explicit Foundation access mode:

```text
PICO_FOUNDATION_ACCESS_MODE
```

The access mode is a Foundation deployment guardrail. It is not production authentication, Pico identity, Home membership, Pico Link security, Setup Mode or authorization.

The implementation supports these modes:

| Mode | Intended use | Runtime requirements |
|---|---|---|
| `loopback-dev` | Local development on the same machine. | Core must bind only to a loopback host. `PICO_FOUNDATION_TOKEN` is optional. |
| `direct-token` | Standalone/container direct access where the port is reachable beyond loopback. | `PICO_FOUNDATION_TOKEN` is required. Core may bind to non-loopback addresses. |
| `ha-ingress` | Home Assistant add-on ingress path. | Packaging must not expose the direct host port by default. Core may bind to the internal add-on interface. Token remains optional. |

The default is fail-closed for unsafe ambiguity:

| Configuration | Result |
|---|---|
| no explicit mode, loopback bind | treat as `loopback-dev` |
| no explicit mode, non-loopback bind, token configured | treat as `direct-token` |
| no explicit mode, non-loopback bind, no token | startup error |

The standalone `PICO_HOST` default is `127.0.0.1` so ordinary local development starts in `loopback-dev`. Docker keeps explicit all-interface binding for container operation, and CI direct-port smokes use `direct-token` with disposable tokens. The Home Assistant add-on entrypoint sets `ha-ingress` when `/data/options.json` exists and no explicit access mode was already configured.

## Core design rule

```text
No non-loopback Foundation API without an explicit access mode.
No direct non-loopback Foundation API without a token.
No tokenless ha-ingress mode while the add-on direct host port is mapped.
```

## Home Assistant add-on contract

`ha-ingress` is only a valid safe default when the user-facing direct host port is disabled or made opt-in.

The implemented add-on sequence is:

1. Add `PICO_FOUNDATION_ACCESS_MODE`.
2. Keep ingress metadata and prefix-aware dashboard behavior.
3. Disable the default direct host-port mapping with `3100/tcp: null`.
4. Set `PICO_FOUNDATION_ACCESS_MODE=ha-ingress` only in the add-on runtime where the direct host port is not exposed by default.
5. Leave any future direct debug port as an explicit follow-up decision that must require `direct-token` and `pico_foundation_token`.

If real Home Assistant ingress validation is not available yet, the implementation must not claim the ingress path is fully validated. It may still add the Core access-mode validation first, but the add-on should not silently keep tokenless direct exposure as its normal path.

## Ingress headers

The implementation does not trust Home Assistant ingress user headers as a token bypass.

Ingress headers may later become useful diagnostic or audit context, but only after a separate decision proves that:

- direct-port clients cannot spoof the headers,
- the ingress proxy strips or owns those headers,
- the bypass is limited to the ingress path,
- the behavior is tested with a real Home Assistant add-on installation.

Until then, `ha-ingress` is a packaging boundary, not a header-authentication mechanism.

## Pre-release unsafe-mode removal

The first implementation included an explicit unsafe non-loopback mode so the access-mode gate could land without immediately rewriting container smokes. Before any Pico deployment existed, CI gained disposable-token coverage for both architectures and that escape hatch was removed from configuration, tests and operational documentation.

This is a pre-release hardening cleanup. A tokenless non-loopback direct path must not be reintroduced as a compatibility shortcut.

## Token behavior

`direct-token` reuses the existing temporary Foundation token behavior:

- `/api/...` requires `Authorization: Bearer <token>`.
- browser WebSocket clients mint short-lived single-use realtime tickets through `/api/realtime/tickets`.
- non-browser WebSocket clients may use a bearer upgrade header.
- `/health` remains unauthenticated while it stays minimal.
- the dashboard shell and static assets may remain reachable, but diagnostic data remains behind the token.

The token remains a temporary Foundation guardrail and must not be documented as a long-lived admin password, device credential, Home membership credential or Pico Link credential.

## Implemented scope

The implementation includes:

- config parsing for `PICO_FOUNDATION_ACCESS_MODE`,
- validation for valid modes and invalid host/token/mode combinations,
- loopback host detection for `127.0.0.1`, `::1` and `localhost`,
- an explicit standalone default decision for `PICO_HOST`,
- startup failure before `app.listen()` when the access mode is unsafe,
- Docker and CI smoke environment updates,
- add-on entrypoint or add-on metadata updates for the chosen add-on mode,
- docs for direct local, direct token and Home Assistant ingress operation,
- tests for accepted and rejected configurations.

It does not include:

- production authentication,
- endpoint authorization,
- sessions or cookies,
- CSRF model,
- Home Assistant entity permissions,
- Home Assistant service execution,
- trusted ingress-header bypass,
- local pairing,
- Setup Mode,
- Move-In Code,
- Home membership,
- Pico identity,
- Pico Link or Relay.

## Consequences

Positive:

- turns the current trusted-local assumption into an explicit deployment contract,
- prevents accidental tokenless `0.0.0.0` startup,
- separates standalone direct-token operation from Home Assistant ingress packaging,
- gives the direct-port transition a concrete implementation gate,
- avoids treating Home Assistant headers as Pico identity or product auth.

Negative:

- changes default startup behavior for non-loopback tokenless deployments,
- requires Docker, CI and add-on environment updates,
- may force a temporary add-on UX decision if real ingress validation is not yet available.

## Relationship to other ADRs

This ADR refines:

- `0030-foundation-api-exposure-and-local-trust-boundary.md`
- `0038-foundation-local-access-hardening-and-ingress-boundary.md`
- `0039-foundation-websocket-ticket-boundary.md`
- `0040-foundation-home-assistant-ingress-and-addon-token-options.md`

It does not replace the later Setup Mode, Move-In, Home membership, Pico identity, Pico Link, Relay, policy or Home Assistant tool-control decisions.
