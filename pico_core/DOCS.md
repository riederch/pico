# Pico Core app documentation

## Current status

Pico Core is a foundation app, not a production-ready Home Assistant assistant.

The current app has no production authentication model, no Home Assistant entity integration, no policy engine and no protected personal data domains. It now declares Home Assistant ingress metadata for the foundation dashboard, but real Home Assistant install validation is still pending. Port `3100` is the internal service port for ingress and watchdog use; it is not published to the Home Assistant host by default.

The current Foundation HTTP and WebSocket API is local diagnostics only. Direct Foundation HTTP API and realtime access can be protected with the temporary `PICO_FOUNDATION_TOKEN` and short-lived WebSocket tickets, but this is not production authentication, authorization, membership, claim or a production memory boundary. Current `deviceId` values are client-supplied metadata, and current `signature` values are stored as unverified metadata rather than cryptographic proof.

Pico Core should not be exposed to the public internet by port forwarding or reverse proxying the current foundation API. Future remote reachability is intended to use Pico Link transports, primarily Pico Relay, with Pico Home acting as a local endpoint in that transport network.

The current Foundation API exposure boundary is documented in `../docs/architecture/0030-foundation-api-exposure-and-local-trust-boundary.md`. The staged hardening direction for Home Assistant ingress and a temporary direct-access Foundation token is documented in `../docs/architecture/0038-foundation-local-access-hardening-and-ingress-boundary.md`. The direct-access WebSocket ticket boundary is documented in `../docs/architecture/0039-foundation-websocket-ticket-boundary.md`. The concrete Home Assistant ingress metadata, app token option and packaging-default direction are documented in `../docs/architecture/0040-foundation-home-assistant-ingress-and-addon-token-options.md`. The explicit Foundation access-mode gate is documented in `../docs/architecture/0041-foundation-access-modes-and-direct-port-gate.md`.

## Installation

1. Add this repository as a Home Assistant app repository.
2. Install the `Pico Core` app.
3. Start the app.
4. Open the foundation dashboard through the Home Assistant app panel when available.

## Ports

| Port | Purpose |
| --- | --- |
| `3100/tcp` | Internal Pico Core ingress, API and WebSocket endpoint |

The foundation app declares Home Assistant ingress metadata that points to internal service port `3100`. The host port mapping is disabled by default with Home Assistant's `null` port mapping form.

Port `3100` is an internal foundation interface for the app. It is not the intended public remote-access surface for Pico Home.

ADR 0040 makes Home Assistant ingress the preferred app browser path. ADR 0041 adds the explicit access-mode gate and closes the default direct host-port mapping. A future explicit debug port option can be considered after real Home Assistant ingress validation if operationally needed.

## Home Assistant ingress

The app metadata now declares:

```yaml
ingress: true
ingress_port: 3100
ingress_entry: /
ingress_stream: true
panel_title: Pico Core
panel_admin: true
```

The dashboard preserves Home Assistant ingress path prefixes when it calls Foundation HTTP endpoints or opens `WS /ws`. This has local unit coverage, but it still needs a real Home Assistant app smoke test before the ingress path is considered fully validated.

## Endpoints

| Endpoint | Purpose |
| --- | --- |
| `/` | Foundation diagnostics dashboard |
| `/health` | App health check |
| `/api/system/version` | Service and protocol version information |
| `/api/system/status` | Diagnostic service, capability, Pico Home claim-state and database migration status |
| `/api/events` | Development event list and limited event creation |
| `/api/events/tail` | Latest foundation events for diagnostics dashboard use |
| `/api/realtime/tickets` | Short-lived realtime ticket minting when token mode is enabled |
| `/api/auth/*` | Foundation operator bootstrap, login, logout and administration |
| `/api/memory/retention-policies` | Retention policy administration (operator session required) |
| `/api/memory/domains/:privacyDomain/shred` | Irreversible crypto-shred of a privacy domain (operator session and confirmation required) |
| `/api/memory/domains/:privacyDomain/items` | Read a privacy domain's content, cursor-paged (authorized by domain readership, not the operator role) |
| `/api/memory/domains/:privacyDomain/items/:memoryItemId` | Read one memory item's content |
| `/ws` | Realtime event stream |

`/api/events/tail` is diagnostics-only. It is not a replica sync protocol and does not provide durable sync cursors.

The generic event API currently accepts only foundation-safe event types. Policy, confirmation, executor and audit event types are reserved for later dedicated write paths.

The dashboard is a development and diagnostics surface only. It is not a chat client, companion UI, Home Assistant control panel, policy console, user-management interface, relay protocol or public remote-access endpoint. Once an operator logs in it shows a small administration area (retention policies and the crypto-shred — instance administration, not a companion or product UI) and, kept deliberately separate, a memory content reader. Reading a domain's content is authorized by domain readership, a different authority from host administration (ADR 0077): in this single-operator instance the operator reads every domain because they are all its own, and the reader states that content crosses the local connection in cleartext.

If `PICO_FOUNDATION_TOKEN` is configured in the Core process environment, direct HTTP calls to the `/api/...` endpoints require `Authorization: Bearer <token>`. `/health` and the dashboard shell remain open. Direct `WS /ws` access then requires either a non-browser `Authorization: Bearer <token>` upgrade header or a short-lived single-use ticket minted through `/api/realtime/tickets`.

## Foundation operator login

The app can have one Foundation Operator: the person who administers this instance. It is a local administration login, not a Pico identity, not Home membership, not a Move-In Code and not remote access.

While no operator exists, every start writes a one-time **operator bootstrap code** to the app log:

```text
No Foundation operator exists. Bootstrap one by POSTing this code and a passphrase to /api/auth/bootstrap.
```

To set the operator up:

1. Open the app log and copy the bootstrap code. Only someone who can read this log can bootstrap, which is why the code goes nowhere else.
2. In the dashboard, enter a passphrase (at least 12 characters) and log in, or call `POST /api/auth/bootstrap` with `{ "bootstrapCode": "...", "passphrase": "..." }`.
3. The code is now spent, and the log stops offering one. Restarting before step 2 replaces the code with a new one.

Afterwards, log in with the passphrase in the dashboard. Notes on how this behaves, so nothing surprises you:

- **The session lives in the browser tab's memory only.** Reloading the page, or restarting the app, means logging in again. Sessions are never stored, so they are never in a backup.
- **Once an operator exists, the Foundation API needs a credential** — the operator session or, where configured, the token. Before bootstrap, the previous trusted-local behaviour is unchanged. `/health` stays open for the Home Assistant watchdog.
- **The token cannot administer.** It still reads diagnostics, but administration needs the operator session.
- **Changing the passphrase requires the current one**, and it logs every session out.

After logging in, the dashboard shows an administration area with two things:

- **Retention policies.** Create, edit and revoke the named policies that decide when memory items expire (see the retention model in the architecture docs). No policy means keep. Editing a policy applies to every item referencing it at the next sweep; revoking one deletes nothing, because items that referenced it fall back to being kept.
- **Crypto-shred a privacy domain.** This destroys the domain's keys, which makes every memory item in it unreadable, including copies in existing backups. It is irreversible: there is no undo and no recovery. You must type the domain name a second time to confirm, and the dashboard never fills that in for you. It only works when memory encryption is enabled; without it the content is plaintext at rest, so destroying keys would protect nothing and the app refuses.

If the passphrase is lost, reset the operator locally: create an empty file named `operator-reset` next to the database (`/data/operator-reset` in the app), then restart. The app clears the operator, records the reset in the event log and prints a fresh bootstrap code. The reset never touches your keys, memory content or event history. Anyone with file access to the host can do this — operator login protects the network surface, not the host itself.

## Remote access boundary

The current app should be reachable only through trusted local access paths such as the Home Assistant environment, local network testing, or developer-controlled local tunnelling for diagnostics.

The WebSocket endpoint rejects browser connections whose `Origin` host does not match the request host. Development setups that serve a dashboard from another origin can allow explicit browser origins with `PICO_WS_ALLOWED_ORIGINS`, a comma-separated list such as `http://localhost:5173`. This is a defensive browser boundary, not production authentication.

Browser clients mint short-lived, single-use realtime tickets through the token-protected `/api/realtime/tickets` endpoint before opening `WS /ws`. The long-lived `PICO_FOUNDATION_TOKEN` must not be placed in a WebSocket URL.

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

## App image assets

Home Assistant app presentation expects PNG image assets in the app directory:

| Path | Purpose | Required format |
| --- | --- | --- |
| `pico_core/icon.png` | square app icon | PNG, 1:1 aspect ratio, recommended 128x128px |
| `pico_core/logo.png` | wide app logo | PNG, recommended around 250x100px |

The repository currently also contains SVG source assets:

```text
pico_core/icon.svg
pico_core/logo.svg
```

If Home Assistant still shows the default or an old app image, verify that `icon.png` and `logo.png` exist in `pico_core/`, then reload the Home Assistant Supervisor repository cache.

## Persistent data

Pico Core stores its SQLite database in the app persistent data directory:

```text
/data/pico.sqlite
```

This directory is managed by Home Assistant app storage.

The current foundation event store is not a production memory, location history, private context, relay queue, encrypted Pico Link inbox or Home Assistant control data store.

## Options

The current foundation app exposes these user-configurable options:

| Option | Purpose |
| --- | --- |
| `pico_foundation_token` | Optional temporary token mapped to `PICO_FOUNDATION_TOKEN` for direct Foundation access. |
| `memory_encryption` | Off by default. When `true`, maps to `PICO_MEMORY_ENCRYPTION` so recorded memory content is encrypted at rest under per-domain keys (ADR 0071). |

The app entrypoint reads Home Assistant's `/data/options.json` file before starting Core. If `pico_foundation_token` is present and non-empty, it sets `PICO_FOUNDATION_TOKEN` unless that environment variable was already explicitly configured. If `memory_encryption` is `true`, it sets `PICO_MEMORY_ENCRYPTION` unless that variable was already configured.

The app entrypoint also sets `PICO_FOUNDATION_ACCESS_MODE=ha-ingress` when Home Assistant's options file exists and no explicit access mode was already configured.

Leave `pico_foundation_token` unset for the default ingress-first dashboard path. Set it only when the current token guard should also protect ingress API calls.

If `pico_foundation_token` is set, the current Core token guard protects `/api/...` requests regardless of whether the dashboard is opened through ingress or the direct port. Until a later ingress-aware session bridge exists, the dashboard may still need the same token entered in its Foundation token field to load diagnostic API data.

`pico_foundation_token` is not Pico identity, Home membership, a Move-In Code, a Device Key, a production session credential, Pico Link authentication or Home Assistant service authorization.

Planned future options may include:

| Option | Purpose |
| --- | --- |
| `pico_port` | Runtime port selection, if the app entrypoint is changed to apply it safely. |
| `relay_enabled` | Future opt-in outbound Pico Relay connection, if the Relay and Pico Link security model exists. |

## Update behavior

Updates are delivered through the normal Home Assistant app update flow.

The app image in `config.yaml` is the tagless image name:

```text
ghcr.io/riederch/pico/core
```

The release artifact for the app version must exist as the matching semver image tag. For app version `0.1.7`, the required image is:

```text
ghcr.io/riederch/pico/core:0.1.7
```

The Git release tag, root `package.json` version, package versions, `pico_core/config.yaml` version, changelog entry and published semver container tag must stay aligned. Normal pushes to `main` publish only `main` and `sha-*` image tags and must not mutate existing semver image tags.

The foundation codebase includes migration tests and explicit SQLite backup/restore helpers. During startup, Pico Core runs migrations through the backup-aware path: if a pending migration requires backup, Core creates a backup first and fails startup if backup creation fails. The backup directory defaults to `/data/backups` in the app because the database path defaults to `/data/pico.sqlite`. The app runtime does not yet run an automatic rollback workflow during startup.

Schema updates are recorded in an internal `schema_migration_audit` table when migrations are applied or fail after the audit table is available. This is diagnostic update metadata only; it is not the future policy/tool audit trail.

## Manual rollback path

For the current foundation app, rollback is a manual recovery procedure:

1. Stop the Pico Core app.
2. Keep a copy of `/data/pico.sqlite` before replacing it.
3. Reinstall or select the previous Pico Core app/container version through Home Assistant.
4. Restore the matching SQLite backup to `/data/pico.sqlite` while the app is stopped.
5. Start the app and check `/health` and `/api/system/status`.

Do not restore over a running Pico Core database. The tested restore helper replaces the database file only through an explicit overwrite call and removes stale SQLite WAL/SHM sidecar files for that target path.

If the app fails after selecting an older version and reports an unsupported migration, keep the app stopped and restore the database backup created for that older version. The older Core is expected to refuse databases that contain migrations from a newer Core.

## Memory keys and backup separation

Pico Core keeps a key store at `/data/keys` for memory-content encryption keys (`PICO_KEY_STORE_PATH`, one file per KEK version, ADR 0072). With `memory_encryption` off (the default) no memory content is encrypted and the key store stays empty. With `memory_encryption` on, recorded memory content is encrypted at rest under a per-domain key (ADR 0071/0073), and that domain's key files appear here.

Pico Home setup mode also keeps host identity keys at `/data/home-host-keys` (`PICO_HOME_HOST_KEY_STORE_PATH`, ADR 0080 H5). These keys identify the host infrastructure for a claimed Home; they are not resident Pico identity keys and do not grant domain plaintext access.

The design rule, in force now, is that **keys and data must never share a backup artifact**. The app configuration excludes `/data/keys` and `/data/home-host-keys` from app backups (`backup_exclude`), and the SQLite backup helper copies database files only. At startup Pico Core refuses to run if `PICO_KEY_STORE_PATH` or `PICO_HOME_HOST_KEY_STORE_PATH` is set inside the SQLite backup directory or equal to the database directory, and it also refuses to overlap the two key stores.

Once memory-content encryption ships, this separation is what makes deletion real: destroying a domain's keys makes its content unreadable, including in old backups that never contained the keys. The consequence is deliberate: **restoring a database backup without a separate copy of the keys leaves encrypted memory permanently unreadable.** Recovery will be an explicit, passphrase-protected key export you create and store separately from data backups, never an automatic part of a data restore. If you keep your own backups, back up `/data/keys` separately from `/data/pico.sqlite` and its backups.

## Current limitations

- No Home Assistant entity integration yet.
- Home Assistant ingress metadata exists, but real HA install validation is still pending.
- Direct port `3100` is not mapped to the Home Assistant host by default.
- No companion chat UI yet.
- No production authentication model yet.
- No authorization model yet.
- No policy engine yet.
- No tool executor yet.
- No protected personal data domains yet.
- No production memory model yet.
- No automatic rollback flow for failed or reverted database updates yet.
- No Pico Link transport facade yet.
- No Pico Relay support yet.
- No Meshtastic or other low-bandwidth transport adapter yet.
- No Pico identity, Home identity or device key model yet.
