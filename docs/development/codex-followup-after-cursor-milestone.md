# Codex follow-up after cursor milestone

## Status

Follow-up note for the next Codex run after the cursor/shutdown/lockfile-cleanup work.

This file exists because `.agent-context.md` could not be updated through the GitHub connector in the previous ChatGPT run. Treat this file as a temporary handoff supplement.

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

## What was intentionally not done

The lockfile part is incomplete on purpose.

The previous tool environment could not clone GitHub or run `pnpm install`, so no trustworthy `pnpm-lock.yaml` could be generated. Do not fabricate a lockfile.

Still open:

- generate `pnpm-lock.yaml` locally with the actual package manager
- commit `pnpm-lock.yaml`
- switch CI to frozen pnpm install
- switch Dockerfile to frozen pnpm install
- enable pnpm cache in GitHub Actions

## Required local verification

After pulling the current `main`, run:

```bash
pnpm install
pnpm release:verify
```

If install creates `pnpm-lock.yaml`, commit it separately before changing CI/Docker frozen install behaviour.

## Expected follow-up commits

### Commit 1

```text
chore: add pnpm lockfile
```

Contents:

- `pnpm-lock.yaml`

### Commit 2

```text
ci: enforce frozen pnpm installs
```

Contents:

- `.github/workflows/ci.yml`
  - use `cache: pnpm` under `actions/setup-node@v4`
  - use `pnpm install --frozen-lockfile`
- `docker/core.Dockerfile`
  - copy `pnpm-lock.yaml` before install
  - replace `pnpm install --no-frozen-lockfile` with `pnpm install --frozen-lockfile`
  - remove the stale lockfile comment

Run `pnpm release:verify` after these changes.

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

## Known risk

The GitHub connector could not run TypeScript or tests. There may be small compile issues that only local `pnpm release:verify` will catch.

Pay attention to:

- `Buffer.from(..., 'base64url')` support in the configured Node version
- strict TypeScript inference around `eventList.events.map(eventText)` in the new test
- any `version:check` assumptions around `docs/protocol/public-surfaces.md`

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
