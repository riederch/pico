# Changelog

## 0.1.0

Initial foundation add-on package.

- Adds Pico Core add-on metadata.
- Uses prebuilt container image `ghcr.io/riederch/pico/core`.
- Exposes Pico Core on port `3100`.
- Adds health watchdog on `/health`.
- Documents persistent SQLite storage under `/data/pico.sqlite`.
