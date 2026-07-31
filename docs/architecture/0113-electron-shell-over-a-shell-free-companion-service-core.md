# 0113 - Electron Shell over a Shell-Free Companion Service Core

## Status

Accepted; partially implemented. This ADR makes the ADR 0105 B2 shell
decision the previous ADRs deliberately left open: the person-side
background companion ships as an Electron application whose main process
hosts a shell-free service core. Gate C1 - the service core with the ADR
0112 alarm carrier - lands with this ADR; C2-C4 (shell wiring, packaging,
further platforms) are open. Both decisions in here - Electron, and
service-core-first for the attached milestone - were made explicitly by
the user on 2026-07-31.

## Context

ADR 0105 fixed the product form (background service reached through the
avatar, CLI stays a tool) and left two implementation gates open: B2, the
long-running local process that holds the Vault unlock and replaces the
terminal as the daemon's consumer, and B3, the interaction surface. ADR
0112 then pinned the first security-critical vertical for exactly that
process: the recovery pending alarm with its cadence, loudness and veto
reachability - and forbade the Foundation dashboard and the CLI as
product surfaces.

The deciding constraint is where the trust-bearing code can run. The
person-side stack - the daemon socket client with its same-UID peer
authentication, the hold-channel approval binding, the Link Direct
client, and every proven ceremony including recovery - is TypeScript on
Node with real-process proofs. Whatever shell is chosen either hosts a
Node process and runs that stack unchanged, or forces a rewrite or a
sidecar. A rewrite of proven security-critical code is exactly where new
bugs enter (the concern behind ADR 0016's no-new-cryptography rule,
applied one layer up); a sidecar keeps Node anyway and adds a second
runtime plus a third IPC boundary in front of it.

Performance was examined honestly for this workload: the companion's
background work is one authenticated lifecycle read every few hours -
computationally nothing. Electron's real costs are disk (~250 MB) and
memory while a window exists; with the window destroyed in tray mode the
resident cost is the Node main process plus a small constant. The costs
that remain are therefore packaging weight and the Chromium security
cadence, and both are named below as obligations rather than hoped away.

## Scope

Covers: the companion shell technology; the shell-free service core and
its mechanically checked boundary; renderer and tray discipline; the
device-local profile the service core reads; platform order; and the
attached C1 implementation.

Does not cover: avatar visual design or character assets (Character
Design v3.2.1 workflow, ADR 0112 S4); the approval rendering content
(ADR 0106, unchanged); relay transport; mobile platforms; any change to
custody, approvals or canonical bytes.

## Decision

### The shell is Electron; the main process is the companion service

The companion ships as an Electron application. Its main process is the
background service ADR 0105 B2 describes: it runs continuously, holds
the Vault unlock, is the daemon's hold-channel approval consumer, and
executes the proven TypeScript stack unchanged - the same same-UID
socket peer authentication and the same approval binding as the CLI it
replaces. No trust-path code is rewritten and no sidecar runtime is
introduced.

### The service core is shell-free, and the boundary is checked

All companion logic - the profile store, the alarm carrier, ceremony
orchestration, approval mediation - lives in a shell-free service core
in `apps/companion`, behind adapter interfaces for what a shell provides
(notifications today; tray, windows and printing when C2 lands). The
Electron layer is glue that hosts this core and implements the adapters.

This boundary is what keeps the shell choice a medium-weight commitment:
a later shell swap pays for glue and packaging, never for the trust path
or the test suite. It is therefore enforced, not aspired to: a check in
`release:verify` fails when `electron` appears among the companion's
dependencies or imports outside the (future) shell layer, mirroring how
the design-system check enforces the character boundary.

### Renderer discipline

Pinned now, applying from C2 on: the renderer runs with context
isolation and the Chromium sandbox, without Node integration. It talks
to the main process only over a narrow, typed IPC bridge that carries
rendered statements (ADR 0106), presentation state and the person's
decisions - never key material, never a Recovery Phrase or PIN, never
raw socket access. Recovery Card PDFs render in the main process and go
direct to the printer (ADR 0112); the renderer sees only the public
front metadata.

### Tray discipline and the memory budget

The companion's default state is tray-only with the window destroyed,
not hidden - one renderer window exists only during interaction or an
active alarm. Avatar animation runs only while the window is visible and
respects reduced motion (design system). The budget is part of the C3
gate, not prose: tray-mode RSS under 100 MB on the reference Linux
build, measured, with the measurement kept in the release checks.

### Chromium currency is a release obligation

Shipping Chromium means owning its security cadence. From C3 on, a
release of the packaged companion must use an Electron version inside
its upstream security-support window; falling behind blocks the release.

### The device-local profile

The service core reads a device-local profile file: Core URL, the Home's
host key pins, and the identity and device binding (fingerprints,
delegation id, identity public key) that the authenticated lifecycle
read requires. This is deployment/binding data in the ADR 0104 sense -
the same facts the enrollment output and the Recovery Card already
carry - not person settings, which stay in Pico. The service core owns
the format and validates strictly; onboarding, enrollment and restore
write it when their product surfaces land (C2/S3).

### Platform order

Linux desktop first - it matches the ADR 0097 toolchain reality, the
development environment and the Home-Assistant-adjacent user base.
Windows and macOS follow from the same codebase at C4. Mobile is not a
smaller desktop and stays a future decision under ADR 0105's
channel-degradation rule.

## Rejected alternatives

### Tauri 2

Smaller disk footprint and a lighter window runtime, but the trust path
would return as a Node sidecar - two runtimes, a third IPC boundary and
a new toolchain in the repository - or be rewritten in Rust, which
re-implements proven security-critical code for a window shell. In tray
mode, where the companion spends its life, the runtime advantage shrinks
to tens of megabytes.

### A plain background service with the UI deferred

notify-send can carry the alarm, but approvals need an interaction
surface; deferring it keeps the terminal as the approval product form,
which is the state ADR 0105 B2 exists to end - and it would defer
exactly the decision this ADR is for.

### Native shells per platform

Three UI implementations, no shared avatar surface, and the trust path
still needs a Node host beside them.

### A browser/PWA surface

A browser tab cannot hold the daemon's Unix socket or the Vault unlock,
its notification and background lifetime guarantees are weak, and the
Foundation HTTP surface is diagnosis, not product (ADR 0112).

## Gates

- **C1 - Service core (implemented with this ADR):** `apps/companion`
  as a workspace package with no shell dependency: the strict profile
  store and the ADR 0112 alarm carrier - checks on start and on a
  six-hour cadence, immediate re-check hook for wake/network-regain,
  loud notification through the adapter on every check while a pending
  recovery exists, resilient to read failures. Deterministic-clock tests
  for cadence and re-arming; a real spawned-process proof for the Linux
  notify-send adapter; the boundary check wired into `release:verify`.
- **C2 - Shell wiring and real-process alarm (open, network-capable
  environment):** the Electron main process hosting the service core;
  tray, notification and wake/network triggers as adapters; the
  renderer with its typed bridge rendering ADR 0106 statements (B3
  start); and the alarm carrier proven against a real founded Home the
  way the recovery suite proves its ceremonies.
- **C3 - Packaging and budget (open):** Linux packaging first,
  autostart, the measured tray-mode memory budget, and the Electron
  currency check as release obligations.
- **C4 - Further desktop platforms (open):** Windows and macOS from the
  same codebase and discipline.

## Consequences

Positive:

- ADR 0105 B2 is decided with an implementation attached instead of a
  technology preference on paper;
- the proven trust path runs unchanged in the process that replaces the
  terminal - no rewrite, no sidecar;
- the shell is swappable at a bounded, named price, and the boundary
  that keeps it so is checked mechanically;
- the ADR 0112 alarm carrier exists as tested code rather than as a
  contract waiting for a client.

Negative and residual:

- Chromium's disk weight and security cadence are now Pico's to carry,
  and the cadence is a standing release obligation;
- the Electron binary cannot be installed in restricted environments
  like this one, so shell wiring and packaging (C2/C3) happen on a
  network-capable machine - the service core is deliberately the part
  that does not need it;
- the alarm carrier's end-to-end proof against a real founded Home is
  deferred to C2; C1 proves cadence, re-arming and the notification
  path, not the full transport chain;
- the service core depends on `@pico/vault-daemon` for the daemon and
  Link clients; extracting those clients into a dedicated package is
  legitimate later hygiene, not a product gate;
- nobody writes the profile in production yet - enrollment, onboarding
  and restore gain that duty with their product surfaces (C2/S3).

## Relationship to other ADRs

- Decides ADR `0105` B2's shell and starts B2 itself; B3 begins at C2.
  The CLI remains transitional tooling.
- Implements the core of ADR `0112` S2; the cadence and loudness
  contract lives there, the carrier lives here.
- Leaves ADR `0099`/`0106` untouched: the main process is the hold
  channel, approvals render from the signed bytes, the avatar asks.
- Applies ADR `0013` and the design system to the future renderer;
  character visuals stay gated on registered production assets.
- Applies ADR `0104`: the profile is deployment/binding data; person
  settings stay in Pico.
- Extends the ADR `0016` spirit one layer up: proven security code is
  hosted, not re-implemented, for a window shell.

## References

- [ADR 0016](0016-cryptography-boundaries-and-non-goals.md)
- [ADR 0097](0097-deployable-vault-process-and-local-ipc-authority-boundary.md)
- [ADR 0099](0099-hold-channel-approval-for-authority-creating-signatures.md)
- [ADR 0104](0104-settings-belong-to-pico-not-to-host-configuration.md)
- [ADR 0105](0105-pico-runs-as-a-background-companion-not-a-cli.md)
- [ADR 0106](0106-approval-rendering-from-the-signed-bytes.md)
- [ADR 0112](0112-recovery-product-surfaces-in-the-background-companion.md)
