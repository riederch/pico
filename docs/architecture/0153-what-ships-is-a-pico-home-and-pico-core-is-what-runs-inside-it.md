# 0153 - What ships is a Pico Home, and Pico Core is what runs inside it

## Status

Accepted 2026-08-16, decided by the user, who also decided the two questions
this could not answer for itself: one version across all deliverables, and the
Linux client published from the build that already produces it.

**Taken now because it is a rename, and a rename has an expiry.** Home
Assistant identifies an add-on by its slug. Changing `pico_core` to
`pico_home` is not an update - the Supervisor sees a different add-on, gives
it a different `/data`, and the old one's database, keys and options stay
where they were. Today that costs nothing: `docs/release/versioning.md`
records that no kept identity has been founded, so every Home in existence is
disposable by declaration (ADR 0134). After the first founded Home it costs a
migration path that does not exist, and there is no such thing as a cheap
rename any more.

So this ADR is not "the packaging is now correct". It is "the packaging can
still be corrected, and this is the last stretch where that is true".

## Context

ADR 0026 fixed the product vocabulary: **Pico Home** is the host, the place a
Pico lives. **Pico Core** is the technical term it replaced - "Pico Core Host
/ server" is the legacy column in that table.

The Home Assistant add-on has been called Pico Core since ADR 0007, which
predates that decision. The result is that the thing a person installs, the
panel title they see, and the image they pull all carry the internal name of
a runtime, while the product term for exactly that thing has been decided for
sixteen ADRs and used everywhere else.

That is not a cosmetic mismatch. ADR 0026's rule is that a product name
should explain the component's job; "Core" explains nothing to somebody
installing a place for their Pico to live, and it collides with `apps/core`,
`@pico/core` and `pico-home-core`, which are the runtime and should keep
their names.

The second half of the context is that Pico now has more than one thing to
ship. `apps/relay` is a working server with its own boundary check
(ADR 0149 RS1) and no way to run it. `apps/companion-shell` builds a Debian
package that CI assembles, verifies byte by byte, and then drops on the
floor. Neither is a missing implementation; both are implementations with no
delivery.

## Decision

**Three deliverables, named after what a person gets:**

| Deliverable | What it is | How it updates |
|---|---|---|
| Pico Home | Home Assistant add-on `pico_home`, image `ghcr.io/riederch/pico/home` | Home Assistant Supervisor |
| Pico Relay | OCI container `ghcr.io/riederch/pico/relay` | container management |
| Pico Client | Debian package `pico-companion_<version>_amd64.deb` | package management |

`apps/core` stays `apps/core`, `@pico/core` stays `@pico/core`, and the
service keeps answering `pico-home-core`. **The runtime did not get renamed -
the product shell did**, which is exactly the split ADR 0026's table already
described.

Pico Relay is deliberately **not** a Home Assistant add-on. A relay has to be
reachable independently of any single Home, and an add-on's lifecycle is the
Supervisor's. Filing it under one Home would make one household's restart
another household's outage.

## Gates

- **PK1 - The product shell carries the product name.** `pico_home/` with
  slug `pico_home`, name `Pico Home`, image `ghcr.io/riederch/pico/home`.
  `pico_core/` is removed rather than aliased: two add-ons for one thing is
  the drift ADR 0026 exists to prevent, and there is no installed base to
  strand.

- **PK2 - Every deliverable has an entrypoint, durable state and a health
  signal.** Not a library that a test can start. The relay gets `main.ts`,
  a `/data` volume and a health listener; the Home already had all three;
  the client is a package that installs and launches without a terminal
  (ADR 0105).

- **PK3 - The relay's public port keeps exactly five routes.** ADR 0149 made
  an unknown route and a wrong method answer identically, so that the surface
  carries no map of itself. A `GET /health` on that port would be the only
  request that answers differently, which is a map with one entry - and the
  one entry says "a Pico relay lives here". **So the health signal listens on
  its own port**, bound to loopback by default, and the public port learns
  nothing.

- **PK4 - One version, and the protocol version stays separate.** All three
  artifacts carry the repository version and ship from one tag.
  `picoProtocolVersion` remains the compatibility axis (ADR 0025), which is
  what makes the shared number affordable: it is a build stamp, not a promise
  about the wire. The known cost is recorded rather than discovered - a
  client-only fix raises the Home's version and Home Assistant offers an
  update containing nothing. The alternative, three version lines and a
  hand-kept interoperability matrix, buys accuracy in a number nobody
  interoperates on.

- **PK5 - `check-version.mjs` covers what ships.** `apps/relay` and
  `packages/link-relay-client` were outside it, which was harmless while
  neither was published and is not once one of them is an image.

- **PK6 - A published artifact is published from the build that verified
  it.** The Debian package CI already builds and byte-verifies is the one
  attached to the release, with its checksum, rather than a second build made
  for publishing. Two builds of one artifact is one artifact too many.

- **PK7 - The relay ships with no accounts and says so.** Provisioning is an
  open decision (below), and a container that invented one would be deciding
  it. A relay with no account refuses every registration as
  `unknown_account`, which is the honest state and already the store's
  behaviour.

## What this deliberately does not decide

**How an operator provisions a relay account.** `PicoRelayStore.upsertAccount`
is documented as "operator business, out of band", which was true while the
only caller was a test. In a container there is no out of band. Three shapes
are visible - a CLI inside the image, an environment-seeded first account, a
sixth administrative route - and they differ in who may create an account and
from where, which makes it an authority question rather than a packaging one.

The relay therefore ships able to run, hold, forward and expire packets, and
unable to accept its first registration. That is a gap, it is stated here,
and it is the next decision rather than an oversight. The third shape is
already discouraged: an administrative route on the public port would undo
PK3 in the same file that establishes it.

## Alternatives rejected

**Keep `pico_core` and add `pico_home` beside it.** The safe-looking option,
and it produces two add-ons that install the same image and differ only in
which one a person happened to find. ADR 0026's whole subject is names that
say what a thing is; two names for one thing says neither.

**Rename the runtime too.** `apps/core` → `apps/home`, `@pico/core` →
`@pico/home`. Tempting for symmetry and wrong on ADR 0026's own terms: the
runtime *is* a core, several deliverables contain it, and the Home is the
place - not the process. It would also touch every import in the tree to
express a product decision that lives in one directory.

**A relay as a Home Assistant add-on, for the installation convenience.**
Rejected in the Decision above: a transport whose availability is one
household's Supervisor is not a transport.

**Per-artifact versions.** Considered and put to the user, who chose
lockstep. Recorded in PK4 with its cost, so the day the cost is felt, nobody
has to reconstruct why.

## What building it actually taught

**A `HEALTHCHECK` in the image was written and then removed.** Building the
relay image twice showed why: with Docker's image format the check lands in
the config, and with the OCI format - which is what a pushed multi-arch
manifest uses - it is dropped with a warning, because the OCI image config has
no field for it.

```text
podman inspect pico-relay:oci    --format '{{json .HealthCheck}}'  -> null
podman inspect pico-relay:docker --format '{{json .HealthCheck}}'  -> {...}
```

An instruction that survives in one format and vanishes in the one we publish
is worse than none, because the image then looks like it carries a check it
does not - the same failure as a stale limitation list, in a file nobody
reads twice. Forcing Docker media types would bring it back and would trade a
property this repository can verify for two build flags it cannot.

So the check belongs to whoever runs the relay, which is where it was going to
live anyway: compose, systemd and Kubernetes all declare their own and ignore
the image's. What the image owes them is an endpoint, and PK3 is the endpoint.

## Residuals

- **No path between Homes.** This rename is affordable because nothing is
  founded. Nothing in it creates the export/import path that would make the
  *next* one affordable - moving a founded Home from the add-on to ADR 0027's
  appliance image has no mechanism today, and after the format freeze it will
  need one.

- **Provenance still depends on repository visibility.** ADR 0122 Y2 is unmet
  for user-owned private repositories, and adding two more published
  artifacts multiplies the number of unattested things rather than changing
  that. The workflow states the omission per artifact instead of once.

- **The client is Linux amd64 only.** Windows and macOS need platform runners
  and signing certificates issued to a legal person, which is ADR 0111 L3's
  neighbourhood rather than this ADR's.
