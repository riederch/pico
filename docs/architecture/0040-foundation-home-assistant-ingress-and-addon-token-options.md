# 0040 - Foundation Home Assistant Ingress and Add-on Token Options

## Status

Accepted and partially implemented for add-on ingress metadata, dashboard ingress-prefix URL handling, the optional direct-access `pico_foundation_token` bridge and the default direct host-port disablement.

## Context

ADR 0038 chooses a staged Foundation access hardening model:

- Home Assistant ingress should become the preferred protected browser path for the add-on dashboard.
- `PICO_FOUNDATION_TOKEN` protects temporary direct standalone/container access.
- real Pico identity, Home membership, local pairing, Setup Mode and Move-In remain separate product/bootstrap work.

ADR 0039 implements the direct WebSocket portion for token mode with short-lived, single-use realtime tickets.

The first ADR 0040 implementation slice was packaging-specific. Before that slice:

- `pico_core/config.yaml` still exposes a fixed host port mapping for `3100/tcp`.
- the add-on still advertises `webui: "http://[HOST]:[PORT:3100]"`.
- the add-on has no Home Assistant ingress metadata.
- the add-on has no user option for `PICO_FOUNDATION_TOKEN`.
- the Docker image has no add-on entrypoint layer that reads `/data/options.json`.
- the dashboard currently derives its default base URL from `location.origin`, which is not sufficient for an ingress-prefixed URL.

The implementation slices add Home Assistant ingress metadata to `pico_core/config.yaml`, change the dashboard URL helpers so Foundation HTTP and `WS /ws` URLs preserve an ingress path prefix, add a Core add-on entrypoint that maps a non-empty `pico_foundation_token` option from `/data/options.json` to `PICO_FOUNDATION_TOKEN`, and close the default direct host-port mapping.

The current implementation uses `3100/tcp: null`, removes the direct `webui` entry and keeps `watchdog` on the internal `/health` path.

The current Home Assistant app/add-on developer documentation describes ingress metadata such as `ingress`, `ingress_port`, `ingress_entry`, `ingress_stream`, `panel_icon`, `panel_title` and `panel_admin`. It also describes `ports` mappings where a `null` host port disables the mapping, and `options`/`schema` fields for add-on configuration. The Home Assistant security documentation says ingress requests can include authenticated Home Assistant user headers.

References:

- <https://developers.home-assistant.io/docs/apps/configuration/>
- <https://developers.home-assistant.io/docs/apps/security/>

## Decision

Pico will treat Home Assistant ingress as the primary add-on browser path for the Foundation dashboard.

The first implementation milestone adds ingress metadata and dashboard ingress-prefix support before changing broader auth or product behavior.

Current target add-on metadata:

```yaml
ingress: true
ingress_port: 3100
ingress_entry: /
ingress_stream: true
panel_title: Pico Core
panel_admin: true
```

`panel_icon` should use a Pico-appropriate Material Design icon if available, with the existing Home Assistant default acceptable if icon validation becomes a blocker.

`ingress_stream: true` is the target posture because the current dashboard uses `WS /ws` as a long-lived realtime connection. The implementation must still validate that WebSocket upgrade behavior works through ingress before claiming the add-on ingress path is complete.

## Core design rule

```text
Home Assistant ingress is the add-on dashboard path.
The Foundation token is for direct access.
Neither one is Pico identity, Home membership or product auth.
```

## Ingress browser path

The add-on dashboard should be opened through the Home Assistant ingress panel when available.

This has three immediate consequences:

1. The dashboard must be path-prefix aware.
2. `GET /`, `/api/...` and `WS /ws` must work when proxied under the Home Assistant ingress URL prefix.
3. Documentation must stop treating `http://host:3100/` as the normal add-on browser path once ingress is implemented.

The current webclient helper preserves the current ingress base path for same-origin requests. Earlier versions defaulted only to `location.origin`, which was safe for direct local access but not for an ingress URL that includes a path prefix.

The implementation should prefer relative or base-path-preserving URLs for:

- `/health`
- `/api/system/status`
- `/api/events/tail`
- `/api/realtime/tickets`
- `WS /ws`

This is an ingress routing requirement only. It must not create new Foundation endpoints.

## Direct port policy

Direct port `3100` is a transitional diagnostics path, not the intended Home Assistant user path.

The conservative implementation sequence is:

1. Add ingress metadata and path-prefix support while keeping the existing direct host port mapping for one validation slice. Done.
2. Document that the direct port remains trusted-local and transitional. Done.
3. Disable the default host-port mapping with Home Assistant's supported `null` host-port form. Done.
4. Validate ingress dashboard loading, API calls, WebSocket reconnects and watchdog behavior in a real Home Assistant add-on install. Still open.

Keeping a direct mapping would require an explicit debug/direct-token decision. It must not be documented as the product access model.

## `webui` and watchdog posture

`webui` should stop being the preferred add-on browser entry once ingress exists.

The default direct host-port mapping is disabled, so the direct `webui` entry is removed. Home Assistant ingress is the intended browser entry.

The watchdog should continue to use the minimal `/health` endpoint:

```yaml
watchdog: "http://[HOST]:[PORT:3100]/health"
```

`/health` should stay unauthenticated as long as it remains minimal and non-sensitive. This is a supervisor/liveness boundary, not a product auth exception.

## Add-on token option

The add-on should expose a future optional option named:

```text
pico_foundation_token
```

It maps to:

```text
PICO_FOUNDATION_TOKEN
```

The option is for direct Foundation access. It is optional and unset by default for the ingress-first add-on path.

Target schema direction:

```yaml
schema:
  pico_foundation_token: "password?"
```

The implementation reads the option from Home Assistant's `/data/options.json` path and exports `PICO_FOUNDATION_TOKEN` only when the option is present and non-empty. If `PICO_FOUNDATION_TOKEN` is already explicitly configured in the process environment, the add-on option does not override it.

The option must not be documented as:

- Pico identity
- Home membership
- Move-In Code
- Device Key
- admin password
- production session credential
- Pico Link credential
- Home Assistant service authorization

## Token and ingress interaction

The default ingress add-on path should not require `PICO_FOUNDATION_TOKEN`.

If an operator sets `pico_foundation_token`, the current Core token guard will protect `/api/...` requests no matter whether the browser reached the dashboard directly or through ingress. Until a separate ingress-aware session bridge exists, that means the dashboard may still need the token to load diagnostic API data even when opened through Home Assistant ingress.

That is acceptable as a transitional direct-access hardening behavior. It must be documented clearly if the option is exposed.

The implementation must not bypass `PICO_FOUNDATION_TOKEN` purely because a request contains `X-Remote-User-*` headers unless a later ADR proves that:

- the direct port cannot be used to spoof those headers,
- the ingress proxy boundary strips or controls those headers,
- the bypass is limited to the add-on ingress path,
- the behavior is tested with real Home Assistant ingress.

Ingress user headers may later become useful diagnostic context or audit input. They are not Pico identity or Home membership.

## Home Assistant entity access

This ADR does not enable `homeassistant_api`, `hassio_api`, `auth_api`, services, entity reads or entity writes.

No add-on permission should be added only because ingress is added.

Home Assistant API access remains gated by ADR 0019 and later Pico Rules, Action Runner, Action History, allowlist and policy decisions.

## Implementation implications

The first narrow implementation milestone includes:

- `pico_core/config.yaml` ingress metadata
- add-on docs that make ingress the preferred browser path
- a dashboard base-URL change that preserves ingress path prefixes
- WebSocket URL construction that preserves the same ingress prefix
- tests for direct root and prefixed base URL endpoint construction
- the optional `pico_foundation_token` schema
- an add-on-aware startup bridge from `/data/options.json` to `PICO_FOUNDATION_TOKEN`
- tests for the add-on option bridge

The next narrow implementation milestone should include:

- real Home Assistant add-on install smoke for ingress
- dashboard load through ingress
- `/api/system/status` through ingress
- `WS /ws` through ingress
- watchdog `/health`
- direct-port behavior while the port remains transitional
- direct-port disablement or optional mapping after ingress validation
- clear docs for any changed direct port and token behavior

It should not include:

- production auth
- HA API permissions
- Home Assistant entity integration
- local pairing
- Setup Mode
- Move-In Code
- Home membership
- Pico identity sessions
- a public reverse proxy model

Current validation covers:

- local unit tests for URL construction
- local unit tests for the add-on option bridge
- local container smoke with and without `pico_foundation_token`
- CI container smoke for the add-on token option on `linux/amd64` and `linux/arm64`
- existing Core/Web/Protocol checks
- `pnpm release:verify`

Remaining validation should cover:

- real Home Assistant add-on install smoke when available
- dashboard load through ingress
- `/api/system/status` through ingress
- `WS /ws` through ingress
- watchdog `/health`
- direct-port behavior while the port remains transitional

## Non-goals

This ADR does not implement or define:

- production authentication
- production authorization
- user accounts
- passkeys
- Pico identity
- Device Keys
- Home Membership Credentials
- Move-In Code behavior
- Setup Mode
- local pairing UX
- Pico Link
- Pico Relay
- Home Assistant entity reads or writes
- Home Assistant service execution
- Pico Rules
- Action Runner
- Action History
- endpoint-level permissions
- CSRF/session-cookie model
- local TLS, private CA or mDNS behavior

## Open questions

- After real HA ingress validation, is an explicit optional direct debug port setting needed, or should the add-on stay ingress-only by default?
- Should a future ingress-aware bridge trust Supervisor user headers for diagnostics or audit, and how should it prevent direct-port spoofing?
- Does Home Assistant ingress proxy `WS /ws` reliably with the current Fastify WebSocket setup and `ingress_stream: true`?
- Which Home Assistant install matrix is sufficient before declaring ingress complete?

## Consequences

Positive:

- turns ADR 0038's open ingress direction into a concrete packaging milestone
- avoids treating direct port `3100` as the normal add-on browser path
- keeps direct token hardening separate from Home Assistant ingress
- identifies the path-prefix issue before metadata is added
- keeps Home Assistant user/session context separate from Pico identity and membership

Negative:

- leaves real Home Assistant ingress validation as a required follow-up before stronger packaging claims
- may require an add-on-aware entrypoint before the token option is useful
- does not remove the need for real HA install validation
- does not solve product auth, membership, endpoint authorization or audit

## Relationship to other ADRs

This ADR refines the Home Assistant packaging portion of:

- `0038-foundation-local-access-hardening-and-ingress-boundary.md`
- `0039-foundation-websocket-ticket-boundary.md`

It remains constrained by:

- `0007-home-assistant-add-on-release.md`
- `0019-home-assistant-threat-model.md`
- `0024-server-bootstrap-tenancy-and-eviction.md`
- `0027-dedicated-pico-home-image-and-first-boot-setup.md`
- `0030-foundation-api-exposure-and-local-trust-boundary.md`

It does not replace Pico identity, Home membership, local pairing, Setup Mode, Move-In, Pico Link, Pico Relay or product authorization decisions.
