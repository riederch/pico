# Upgrade contract

What a person is entitled to expect when a deployed Pico instance moves from
one version to the next, and what a release must do to keep that promise.

Database migrations have their own contract in
[`backup-before-migration.md`](backup-before-migration.md). This document is
the layer above it: an upgrade touches more surviving state than the database,
and the parts that are not the database are where both 0.1.8 failures came
from.

## The promise

After an upgrade, a person keeps their data, keeps their keys, and does not
have to set anything up again. An upgrade that requires manual repair has
failed its contract even when it eventually starts.

Where a release cannot keep that promise, the release says so in
`pico_core/CHANGELOG.md` with the exact steps, before anyone installs it.

## State that survives an upgrade

An upgrade replaces the image. Everything below outlives it, and each is owned
by something different — which is why "it works on a fresh install" says
nothing about whether an upgrade works.

| State | Lives in | Owned by | Survives |
|---|---|---|---|
| Database | `/data/pico.sqlite` | Pico | Yes |
| Memory Domain Content Keys | `/data/keys` | Pico | Yes, but excluded from backups (ADR 0072 R6) |
| Home host identity keys | `/data/home-host-keys` | Pico | Yes, but excluded from backups (ADR 0080 H5) |
| Add-on options | Supervisor state | Home Assistant | Yes, independently of the add-on's own defaults |
| Image | Registry | CI | No — replaced |

The add-on options row is the one that is easy to miss. Home Assistant stores a
person's option values separately from the defaults in `config.yaml`. Changing
a default does not change what is already stored, and the Supervisor validates
the stored values **before** the add-on starts — so Pico cannot repair them
itself, no matter what it does at boot.

## Change classes

| Change | What the release must do |
|---|---|
| Code only | Nothing beyond the normal gate. |
| Database migration | Follow [`backup-before-migration.md`](backup-before-migration.md). |
| Add-on option schema | Treat as a migration; see below. |
| Key path or key format | Own analysis. Keys are outside backups, so a mistake here is unrecoverable, not merely disruptive. |
| Wire semantics | Raise `picoProtocolVersion` (see [`versioning.md`](versioning.md)). |
| Ingress, ports or access mode | Re-verify a real install; the container smoke tests do not exercise the Supervisor. |

### Add-on option schema changes are migrations

Adding, removing, renaming or retyping an option in `pico_core/config.yaml`
changes how the Supervisor validates values that are already stored on the
person's machine. That makes it a migration with no runtime hook, because the
validation happens before any Pico code runs.

Rules:

1. `pnpm addon:check` must pass. It rejects null defaults, options without a
   schema entry, and required entries without a default.
2. If a stored value can become invalid under the new schema, the changelog
   entry states the exact repair step, including the CLI form. Pico cannot do
   it.
3. Removing an option does not remove it from stored configuration. Assume the
   old key is still there.
4. Never introduce a person-facing setting as an option at all (ADR 0104).

## Release procedure

The version bump itself is in [`versioning.md`](versioning.md). This is what
follows it, and steps 3 and 4 exist because skipping them produced a `404
manifest unknown` on a real install.

1. `pnpm release:verify` green locally.
2. Push `main`, confirm CI green. This publishes only `main` and `sha-*`.
3. Push the matching `v*` tag. **Only the tag build publishes the semver image
   tag** the add-on actually pulls.
4. Confirm the image exists before touching Home Assistant:

   ```bash
   TOKEN=$(curl -s "https://ghcr.io/token?scope=repository:riederch/pico/core:pull&service=ghcr.io" | jq -r .token)
   curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" \
     https://ghcr.io/v2/riederch/pico/core/manifests/<version>
   ```

   `200` means ready. `404` means the tag build has not finished or did not
   run — Home Assistant will offer the update and then fail to install it.
5. Record the image digest in the release's `pico_core/CHANGELOG.md` entry
   (ADR 0122 Y3). This is what makes a later re-tag detectable and what a
   digest-pinned rollback pulls:

   ```bash
   curl -sI -H "Authorization: Bearer $TOKEN" \
     -H "Accept: application/vnd.oci.image.index.v1+json,application/vnd.docker.distribution.manifest.list.v2+json" \
     https://ghcr.io/v2/riederch/pico/core/manifests/<version> \
     | tr -d '\r' | grep -i '^docker-content-digest'
   ```

6. `ha supervisor reload` on the host.
7. Install the update and confirm the add-on actually starts. "Update
   installed" is not the same as "add-on running": the Supervisor reports a
   successful update and then refuses to start it on invalid options.

## Rollback

Honest limits, because rollback is where the exclusions bite.

- **Image**: pulling an older semver tag works — as policy, not as a registry
  property. GHCR tags are mutable; anyone with `packages: write` could
  re-point one. What makes a tag trustworthy is ADR 0122: a published version
  tag is never re-pushed (the pipeline check is gate Y4), and the digest
  recorded per release makes a moved tag detectable. A rollback that must not
  trust the tag pins the digest instead:

  ```bash
  docker pull ghcr.io/riederch/pico/core@sha256:<digest-from-the-changelog>
  ```

  Once ADR 0122 Y2 attestations exist, a moved tag additionally fails
  attestation verification from any machine.
- **Database**: only across a migration boundary with a matching backup. An
  older Core must not reinterpret migrations it does not know.
- **Keys**: `backup_exclude` keeps `/data/keys` and `/data/home-host-keys` out
  of Home Assistant backups by design (ADR 0072 R6). **A Home Assistant backup
  therefore does not restore keys.** Restoring a backup onto an instance whose
  key store is gone leaves `domain_encrypted` memory permanently unreadable —
  that is crypto-shredding working as intended, and it is also the largest
  operational hazard in the current design.
- **Add-on options**: not versioned at all. Rolling back the add-on does not
  roll back stored options.

There is currently no supported key export or continuity flow, so there is no
supported way to move or restore an encrypted memory domain. Until one exists,
enabling memory encryption on an instance whose data matters means accepting
that a host loss is a data loss.

## Current limitations

- No automated upgrade test. Every release is verified against a fresh install
  by CI and against an upgrade only by hand.
- The Supervisor's option validation cannot be reproduced locally; the smoke
  tests mount a finished `/data/options.json` and bypass it.
- No rollback automation, no update health check, no update audit event. ADR
  0005 names all three as goals; none is implemented. The update audit event
  is now decided as ADR 0122 Y6 (boot-time version-change record), still
  unbuilt.
