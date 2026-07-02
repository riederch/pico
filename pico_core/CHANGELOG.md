# Changelog

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
