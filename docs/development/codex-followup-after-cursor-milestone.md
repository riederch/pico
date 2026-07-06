# Codex follow-up after cursor milestone

## Status

Completed follow-up note for the cursor/shutdown/lockfile-cleanup work.

This file originally existed because `.agent-context.md` could not be updated through the GitHub connector in the previous ChatGPT run. The local lockfile and frozen-install follow-up has now been completed.

## What changed

The following changes were made through the GitHub connector:

- removed stale `package-lock.json`
- added `package-lock.json` and `yarn.lock` to `.gitignore`
- added graceful shutdown handling in `apps/core/src/index.ts`
- added cursor-based event pages in `apps/core/src/event-store.ts`
- exposed `after`, `nextCursor` and `hasMore` on `GET /api/events` in `apps/core/src/app.ts`
- updated the web client to load event pages through the cursor API in `apps/web/src/api.ts`
- updated `apps/web/src/types.ts` for cursor metadata
- added `apps/core/src/event-cursor-api.test.ts`
- extended `apps/core/src/event-store.test.ts`
- documented the event cursor response in `docs/protocol/public-surfaces.md`

## Local follow-up completed

The lockfile and frozen-install follow-up was completed locally after the GitHub-connector commits landed.

Completed commits:

- `9fa2cba chore: add pnpm lockfile`
- `f15b659 ci: enforce frozen pnpm installs`

Completed changes:

- generated a real `pnpm-lock.yaml` with `pnpm install`
- committed `pnpm-lock.yaml` separately
- switched CI to `pnpm install --frozen-lockfile`
- enabled `cache: pnpm` under `actions/setup-node@v4`
- switched `docker/core.Dockerfile` to copy `pnpm-lock.yaml` before install
- switched `docker/core.Dockerfile` to `pnpm install --frozen-lockfile`
- removed the stale Dockerfile comment about a missing lockfile

Local verification performed:

```bash
pnpm install --store-dir /tmp/pico-pnpm-store
pnpm release:verify
pnpm install --frozen-lockfile --store-dir /tmp/pico-pnpm-store
podman build -f docker/core.Dockerfile -t pico-core:frozen-install-smoke .
```

The first install required network approval because the sandbox could not resolve `registry.npmjs.org`.

## Cursor implementation review points

Please review the current code before touching it further:

- `EventStore.listPage()` returns `limit + 1` rows to compute `hasMore`.
- The ordering is `lamport ASC, wall_time ASC, event_id ASC`.
- Cursor progression uses the same order: `lamport`, `wallTime`, `eventId`.
- The API cursor is intentionally opaque and base64url-encoded JSON.
- `GET /api/events` remains additive: existing clients can still read `events`.
- Webclient still clamps visible events with `MAX_VISIBLE_EVENTS`.

Potential improvement for a future cleanup:

- move cursor encode/decode helpers out of `app.ts` if the route grows further
- add a small protocol type for the event-list response once API schemas move toward `@pico/protocol`
- consider class split only if `app.ts` grows further; no forced split is necessary yet

## Verification notes

The local `pnpm release:verify` run passed after the cursor commits and after the lockfile/frozen-install changes.

The checked areas included:

- `Buffer.from(..., 'base64url')` support in the configured Node version
- strict TypeScript inference around `eventList.events.map(eventText)` in the new test
- `version:check` assumptions around `docs/protocol/public-surfaces.md`

## Do not add yet

Do not implement these as part of the lockfile/cursor follow-up unless explicitly requested:

- authentication
- HA ingress
- token auth
- claim write API
- Move-In Code endpoint
- Pico Relay implementation
- transport facade implementation
- cryptographic key generation
- signed events
- production sync protocol

Those need separate security/protocol milestones.

## Next conceptual milestone

After the local lockfile and verification work is green, the next recommended milestone is:

```text
Foundation API Exposure and Local Trust Boundary
```

Likely output:

- ADR documenting the current local Foundation API exposure
- clearer Home Assistant add-on warning if needed
- decision whether HA Ingress or a temporary `PICO_FOUNDATION_TOKEN` belongs in a follow-up foundation-hardening release
