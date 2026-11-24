# Changelog

## 0.3.1

```text
ghcr.io/riederch/pico/home:0.3.1
```

The release workflow now checks the tag before starting the publication jobs.
The previous tag published Relay and built the clients, while the Home image
failed before publication. This release includes the Home changes and the
upgrade from `0.2.1` described below.

## 0.3.0

```text
ghcr.io/riederch/pico/home:0.3.0
```

**Pico for Android.** The same release carries a signed Android app beside
the Linux client. A phone joins your Home the way a second desktop does - by
holding two screens up to each other - and keeps its own keys. The app is
new: it has run on one phone, and joining has been proven with the probe it
grew out of, not yet with the app itself. Noting where you parked is not in
it yet.

**What changed in the Home since 0.2.1**, in the words of what you can do:

- Host a shared space for someone else and end it again; hand a second device
  the right to read a part of your memory, and take that right back from the
  device that granted it.
- Export the keys of your memory domains into a file sealed with a passphrase
  of its own, and bring them back into a Home - the half of a recovery you
  hold yourself.
- Decide what Pico may do without asking you, and see what is waiting for
  your answer and why.

**Storage that keeps what it confirmed.** The database now writes with
`synchronous = FULL`, so a write the Home acknowledged survives a power cut,
and with `secure_delete`, so what you delete leaves the file instead of only
the answer. Domain keys and host keys are on the disk before anything is
encrypted under them.

**Upgrading from 0.2.1.** Every database step 0.2.1 shipped is unchanged, and
four are appended (`0025` to `0028`); none of them rewrites existing data.
One can refuse: `0027` makes each device's event counter unique, and a
database that two Pico Cores ever wrote to at the same time may hold a
duplicate. Then the step does not run, nothing is changed, and the Home does
not start - the previous version still opens that database. This upgrade was
checked against the shipped migration list, not by running a 0.2.1 database
through it; see `docs/release/upgrade-contract.md` for what that leaves open.

## 0.2.1

**The first tag this add-on was actually published under.** 0.2.0 existed as
a version string but its release tag was never pushed, so the Supervisor met
a 404 where the image should have been - this release exists so your Home
Assistant sees a new version and pulls a container that is really there:

```text
ghcr.io/riederch/pico/home:0.2.1
```

Everything 0.2.0's notes describe below is included, plus the work since:
founding a Home from the Pico Client with no terminal in the walk, adding and
renewing a second device by holding two screens up to each other, ending a
device's authority or a membership from the window that granted it, and
rotating the Home's host keys with the Recovery Card warning said out loud.

**Pico Relay is now an add-on too** (ADR 0155). The same release adds a second
add-on to this repository, `pico_relay`, running the image you could previously
only start by hand (`ghcr.io/riederch/pico/relay:0.2.1`). ADR 0153's reason for
keeping it out is unchanged and worth reading before you install it beside this
Home: a relay under a Supervisor is down while that Supervisor restarts, so it
belongs on a machine that is not the household's Home.

One port may be forwarded from a router, and it is the relay's `3200`. Pico
Home's `3100` is not a public endpoint under any arrangement - it is reached
*through* a relay, which is the whole point of having one.

## 0.2.0

**This add-on replaces `Pico Core`, and it is not an update of it.**

Home Assistant identifies an add-on by its slug. The slug changed from
`pico_core` to `pico_home`, so the Supervisor treats this as a different
add-on: it installs beside the old one, gets its own `/data`, and starts as an
Empty Pico Home. Nothing moves across - not the database, not the keys, not
your option values.

Why now: what you install is the place your Pico lives, and ADR 0026 has
called that a **Pico Home** since long before this package existed. "Core" is
the runtime inside it, and it keeps that name where it belongs - in the code.
The rename is only affordable while no Home has been founded for keeps, which
is true today and will not stay true (ADR 0153).

**If you were running `Pico Core`:** its data is still on your machine and
this release cannot bring it over. Uninstall the old add-on when you are ready
to lose it. There is no supported way to migrate a founded Home between
add-ons, so treat anything in the old one as disposable - which, at this stage
of the project, it is.

- Renames the add-on to `Pico Home`, slug `pico_home`, image
  `ghcr.io/riederch/pico/home:0.2.0`.
- Publishes **Pico Relay** as its own container image,
  `ghcr.io/riederch/pico/relay:0.2.0`. A relay is not a Home Assistant add-on
  on purpose: it has to stay reachable when one household's Supervisor is
  restarting.
- Publishes the **Pico Client** Debian package as a release asset, built and
  byte-verified by the same job that verifies the release.
- Ships a derivation of your own notes on the narrower model allowance
  (ADR 0151 PV1), so asking a follow-up question about an answer you kept no
  longer requires a provider that proved who it is.
- **Removes the `memory_encryption` option.** Whether Pico encrypts what it
  remembers is a decision about your own privacy, and it belongs to you rather
  than to add-on configuration - it lives in Pico and is set through the
  Foundation surface (ADR 0104 S3). If you had it switched on, it stays on:
  with nothing passed, Pico asks its own store what it holds, so a Home with
  encrypted content stays encrypted rather than reading a missing setting as
  "off". You do not have to do anything - and that was tried on this release's
  own container with a Home that had encryption on, rather than only reasoned
  about.
- Does not change the wire contract. `picoProtocolVersion` stays `0.1.7`.

## Earlier releases, as the `Pico Core` add-on

The entries below describe the add-on this one replaces. They are kept because
they are what happened, not because they apply to `pico_home` - every version
number and image tag in them belongs to `ghcr.io/riederch/pico/core`.

## 0.1.9

Fixes the add-on refusing to start after the 0.1.8 update.

**If you are updating from 0.1.8, one manual step is needed.** This release
repairs the add-on's option *defaults*, but Home Assistant stores your own
option values separately, and 0.1.8 left a `pico_foundation_token: null` entry
there. The Supervisor reads that stored `null` as a missing value and refuses
to start the add-on, so it has to be cleared once:

Open the add-on's Configuration tab and remove the `pico_foundation_token`
entry, leaving only `memory_encryption`. From the CLI this is:

```bash
ha addons options 3b6b2827_pico_core --options '{"memory_encryption": false}'
```

Pico Core cannot clean this up itself, because the Supervisor rejects the
add-on before it starts. A fresh install is not affected.

- Removes the `null` default for `pico_foundation_token` from `options`. The Supervisor reads a `null` default as a missing value and rejects the add-on before it starts, even though the schema marks the option optional. The option stays declared in `schema`, so it can still be set; leaving it unset keeps Pico Core in Home Assistant ingress mode, which is what the runtime already expected.
- Adds `pnpm addon:check` to the release gate. It rejects null defaults, options without a schema entry and required schema entries without a default. The container smoke tests could not catch this class of fault, because they mount a finished `/data/options.json` and never exercise Supervisor validation.
- Keeps the active add-on image aligned with `ghcr.io/riederch/pico/core:0.1.9`.
- Does not change Pico Core runtime behaviour, database migrations or the API surface. The wire-contract version remains `0.1.7`.

## 0.1.8

Release bump so the add-on update is offered in Home Assistant.

- Adds an `approval_watch_started` audit record to the Vault daemon, so an approval that returns unavailable is diagnosable after the fact. The daemon is a separate local process and is not part of this add-on image.
- Makes the approval tests wait on that record instead of fixed sleeps, removing a load-dependent failure in the release gate.
- Records in ADR 0103 that no tool can yet found a Pico Home, and makes the claim ceremony the first gate of the planned person-side client.
- Separates the wire-contract version from the release version. `picoProtocolVersion` now lives in `packages/protocol` and stays at `0.1.7`, because nothing observable on the wire changed in this release. `/api/system/version` therefore reports version `0.1.8` with protocol version `0.1.7`.
- Aligns root workspace, Pico Core, web, protocol, sync, active Home Assistant add-on metadata, and CI image tag on `0.1.8`.
- Keeps the active add-on image aligned with `ghcr.io/riederch/pico/core:0.1.8`.
- Does not change Pico Core runtime behaviour, database migrations or the API surface.

## 0.1.7

Home Assistant add-on permission fix.

- Keeps Pico Core running with a writable Home Assistant `/data` mount so SQLite can create and update `/data/pico.sqlite`.
- Aligns root workspace, Pico Core, web, protocol, sync, active Home Assistant add-on metadata, and CI image tag on `0.1.7`.
- Keeps the active add-on image aligned with `ghcr.io/riederch/pico/core:0.1.7`.
- Does not introduce database migrations or API changes.

## 0.1.6

Foundation web dashboard delivery.

- Serves the framework-free diagnostics dashboard from Pico Core at `/`.
- Adds a container smoke-test check for the dashboard shell.
- Keeps the existing Foundation API and WebSocket paths unchanged.
- Aligns root workspace, Pico Core, web, protocol, sync, active Home Assistant add-on metadata, and CI image tag on `0.1.6`.
- Keeps the active add-on image aligned with `ghcr.io/riederch/pico/core:0.1.6`.

## 0.1.5

Foundation runtime and release metadata update.

- Adds `/api/system/version` and `/api/system/status` to expose service, protocol and database migration status.
- Adds explicit database migration runner tests and a backup-before-migration contract.
- Aligns root workspace, Pico Core, web, protocol, sync, active Home Assistant add-on metadata, and CI image tag on `0.1.5`.
- Keeps the active add-on image aligned with `ghcr.io/riederch/pico/core:0.1.5`.
- Notes that Home Assistant add-on presentation requires PNG assets named `icon.png` and `logo.png` in the add-on folder.

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
