# Changelog

## 0.1.4

Release metadata and documentation consistency update.

- Aligns root workspace, Pico Core, web, protocol, sync, active Home Assistant add-on metadata, and CI image tag on `0.1.4`.
- Documents `pico_core/` as the single active Home Assistant add-on path.
- Removes the historical `apps/ha-addon` draft to avoid duplicate add-on metadata with the same slug.
- Clarifies that the foundation add-on currently exposes port `3100` as a fixed port.
- Keeps the active add-on image aligned with `ghcr.io/riederch/pico/core:0.1.4`.

## 0.1.3

Version alignment and release documentation update.

- Updates Pico package metadata toward the current foundation release.
- Aligns release documentation with the Home Assistant add-on update flow.
- Keeps the add-on version and container tag model explicit for Home Assistant updates.

## 0.1.2

Foundation release process update.

- Adds and refines versioning guidance for release bumps.
- Documents the required version-bearing files.
- Improves release checklist coverage for the Home Assistant add-on path.

## 0.1.1

Foundation packaging and visual identity update.

- Adds Pico visual design references.
- Adds Home Assistant-facing icon asset path documentation.
- Documents binary image asset import workflow.
- Removes TypeScript source path aliases that broke workspace app builds.
- Keeps the add-on image aligned with `ghcr.io/riederch/pico/core:0.1.1`.

## 0.1.0

Initial foundation add-on package.

- Adds Pico Core add-on metadata.
- Uses prebuilt container image `ghcr.io/riederch/pico/core`.
- Exposes Pico Core on port `3100`.
- Adds health watchdog on `/health`.
- Documents persistent SQLite storage under `/data/pico.sqlite`.
