# Release and update platform

## Status

Accepted for the foundation phase.

The repository is the release point for Pico.

The first supported target is Pico Core as a Home Assistant add-on. Later targets can include standalone server containers, desktop agents, mobile clients, browser extensions, and web/PWA clients.

## Goals

- The repository builds every releasable component.
- Main branch and tags create container images.
- Servers and clients can discover available updates.
- Updates are controlled, auditable, and reversible.
- No component silently self-modifies outside a defined update policy.

## Release flow

```text
commit to main
  -> CI type checks packages
  -> CI builds packages
  -> CI builds Pico Core container
  -> CI publishes container image to GHCR
  -> Home Assistant add-on can pull the new image
```

Version tags create stable releases:

```text
v0.1.0
v0.1.1
v0.2.0
```

The `main` image is for development or early testers. Stable installations should prefer version tags later.

## Update channels

Recommended channels:

| Channel | Meaning |
| --- | --- |
| dev | every main build |
| beta | manually promoted release candidates |
| stable | tagged and validated releases |

Initial phase may only use `main` and semver tags.

## Server update model

A Pico server should not arbitrarily rewrite itself. It should use a platform-native update mechanism.

For Home Assistant:

- expose Pico Core as an add-on
- publish a container image
- let Home Assistant show and install updates
- later add health checks and rollback notes

For standalone Docker or Podman:

- use the published container image
- update by pulling a newer tag
- restart with the same persistent data volume

## Client update model

Clients should update through their native platform:

| Client | Update mechanism |
| --- | --- |
| Web/PWA | served from current web release; browser refresh updates assets |
| Android | app update or controlled in-app asset update |
| Desktop | signed updater later |
| Browser extension | browser extension store or signed package |

The client must verify API compatibility with the server before assuming new features are available.

## Compatibility

Every component should publish:

```text
component_name
component_version
protocol_version
minimum_core_version
maximum_core_version, optional
build_sha
build_time
update_channel
```

The core should expose this through:

```text
GET /api/system/version
```

Clients should compare protocol versions before enabling features.

## Self-updating policy

Fully unattended self-updates are risky.

Allowed later, if explicitly enabled:

- check for update
- download or pull update
- verify signature/digest
- create backup or restore point
- stop service
- apply update
- run health check
- rollback on failure
- log update event

Not allowed by default:

- unverified remote code execution
- automatic major-version migration
- silently changing permission or privacy policies
- updating while critical operations are running

## Rollback requirement

Before automatic updates are enabled, the platform needs:

- persistent data separation
- schema migration tracking
- backup before migration
- health check endpoint
- rollback or recovery instructions
- audit event for every update attempt

## Current foundation implementation

The repository currently contains:

- CI workflow
- TypeScript check and build
- Pico Core container build
- GHCR image target
- Home Assistant add-on metadata pointing to the Pico Core image
- SQLite backup and restore helpers with restore verification tests
- backup-aware startup migrations that create a SQLite backup before any backup-requiring pending migration
- internal schema migration audit records for applied and failed migration attempts

This is enough to enter the foundation phase, but not enough for fully unattended production-grade auto-update.

## Design rule

The repo is the release source. Devices may update from it, but updates must be controlled by policy, version compatibility, health checks, and rollback.
