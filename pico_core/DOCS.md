# Pico Core add-on documentation

## Current status

Pico Core is a foundation add-on, not a production-ready Home Assistant assistant.

The current add-on has no authentication model, no Home Assistant entity integration, no ingress panel, no policy engine and no protected personal data domains. Port `3100` is currently a development interface for a trusted local test environment.

The current Foundation HTTP and WebSocket API is unauthenticated local diagnostics only. It is not an authorization, membership, claim or production memory boundary. Current `deviceId` values are client-supplied metadata, and current `signature` values are stored as unverified metadata rather than cryptographic proof.

Pico Core should not be exposed to the public internet by port forwarding or reverse proxying the current foundation API. Future remote reachability is intended to use Pico Link transports, primarily Pico Relay, with Pico Home acting as a local endpoint in that transport network.

The current Foundation API exposure boundary is documented in `../docs/architecture/0030-foundation-api-exposure-and-local-trust-boundary.md`.

## Installation

1. Add this repository as a Home Assistant add-on repository.
2. Install the `Pico Core` add-on.
3. Start the add-on.
4. Open the foundation dashboard on the add-on web UI link or call the health endpoint directly.

## Ports

| Port | Purpose |
| --- | --- |
| `3100/tcp` | Pico Core local foundation HTTP API and WebSocket endpoint |

The foundation add-on currently exposes port `3100` as a fixed port. A configurable runtime port can be added later, but is not active in the current add-on metadata.

Port `3100` is a trusted local foundation interface for development and diagnostics. It is not the intended public remote-access surface for Pico Home.

## Endpoints

| Endpoint | Purpose |
| --- | --- |
| `/` | Foundation diagnostics dashboard |
| `/health` | Add-on health check |
| `/api/system/version` | Service and protocol version information |
| `/api/system/status` | Diagnostic service, capability, Pico Home claim-state and database migration status |
| `/api/events` | Development event list and limited event creation |
| `/ws` | Realtime event stream |

The generic event API currently accepts only foundation-safe event types. Policy, confirmation, executor and audit event types are reserved for later dedicated write paths.

The dashboard is a development and diagnostics surface only. It is not a chat client, companion UI, Home Assistant control panel, policy console, user-management interface, relay protocol or public remote-access endpoint.

## Remote access boundary

The current add-on should be reachable only through trusted local access paths such as the Home Assistant environment, local network testing, or developer-controlled local tunnelling for diagnostics.

The WebSocket endpoint rejects browser connections whose `Origin` host does not match the request host. Development setups that serve a dashboard from another origin can allow explicit browser origins with `PICO_WS_ALLOWED_ORIGINS`, a comma-separated list such as `http://localhost:5173`. This is a defensive browser boundary, not production authentication.

Product-level remote reachability should later use:

```text
Pico Vault outside home
-> Pico Link Transport Facade
-> Pico Relay / Relay Network
-> Pico Home Endpoint
```

Do not model remote access as:

```text
Internet
-> router port forwarding / public reverse proxy
-> Pico Core port 3100
```

Pico Relay is transport only. It must not become an owner of resident identities, memory, actions, relationships or private data.

Meshtastic or other future radio standards may be considered only as optional low-bandwidth transport adapters for small encrypted Pico Link packets. They must not replace Pico identity, encryption, authorization or audit boundaries.

## Add-on image assets

Home Assistant add-on presentation expects PNG image assets in the add-on directory:

| Path | Purpose | Required format |
| --- | --- | --- |
| `pico_core/icon.png` | square add-on icon | PNG, 1:1 aspect ratio, recommended 128x128px |
| `pico_core/logo.png` | wide add-on logo | PNG, recommended around 250x100px |

The repository currently also contains SVG source assets:

```text
pico_core/icon.svg
pico_core/logo.svg
```

If Home Assistant still shows the default or an old add-on image, verify that `icon.png` and `logo.png` exist in `pico_core/`, then reload the Home Assistant Supervisor repository cache.

## Persistent data

Pico Core stores its SQLite database in the add-on persistent data directory:

```text
/data/pico.sqlite
```

This directory is managed by Home Assistant add-on storage.

The current foundation event store is not a production memory, location history, private context, relay queue, encrypted Pico Link inbox or Home Assistant control data store.

## Options

The current foundation add-on does not expose user-configurable options yet.

Planned future options may include:

| Option | Purpose |
| --- | --- |
| `pico_port` | Runtime port selection, if the add-on entrypoint is changed to apply it safely. |
| `relay_enabled` | Future opt-in outbound Pico Relay connection, if the Relay and Pico Link security model exists. |

## Update behavior

Updates are delivered through the normal Home Assistant add-on update flow.

The add-on image in `config.yaml` is the tagless image name:

```text
ghcr.io/riederch/pico/core
```

The release artifact for the add-on version must exist as the matching semver image tag. For add-on version `0.1.7`, the required image is:

```text
ghcr.io/riederch/pico/core:0.1.7
```

The Git release tag, root `package.json` version, package versions, `pico_core/config.yaml` version, changelog entry and published semver container tag must stay aligned. Normal pushes to `main` publish only `main` and `sha-*` image tags and must not mutate existing semver image tags.

The foundation codebase includes migration tests and explicit SQLite backup/restore helpers. The add-on runtime does not yet run an automatic backup or rollback workflow during startup.

Schema updates are recorded in an internal `schema_migration_audit` table when migrations are applied or fail after the audit table is available. This is diagnostic update metadata only; it is not the future policy/tool audit trail.

## Manual rollback path

For the current foundation add-on, rollback is a manual recovery procedure:

1. Stop the Pico Core add-on.
2. Keep a copy of `/data/pico.sqlite` before replacing it.
3. Reinstall or select the previous Pico Core add-on/container version through Home Assistant.
4. Restore the matching SQLite backup to `/data/pico.sqlite` while the add-on is stopped.
5. Start the add-on and check `/health` and `/api/system/status`.

Do not restore over a running Pico Core database. The tested restore helper replaces the database file only through an explicit overwrite call and removes stale SQLite WAL/SHM sidecar files for that target path.

If the add-on fails after selecting an older version and reports an unsupported migration, keep the add-on stopped and restore the database backup created for that older version. The older Core is expected to refuse databases that contain migrations from a newer Core.

## Current limitations

- No Home Assistant entity integration yet.
- No ingress panel yet.
- No companion chat UI yet.
- No authentication model yet.
- No authorization model yet.
- No policy engine yet.
- No tool executor yet.
- No protected personal data domains yet.
- No production memory model yet.
- No automatic backup-before-migration runtime flow yet.
- No Pico Link transport facade yet.
- No Pico Relay support yet.
- No Meshtastic or other low-bandwidth transport adapter yet.
- No Pico identity, Home identity or device key model yet.
