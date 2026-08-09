# 0130 - Every Desktop Operates Through the Companion, and the Tray Is Not Its Only Door

## Status

Accepted as a product-surface and platform-order decision; E6 implemented,
E1-E5 and E7-E8 open. The user decided on 2026-08-09 that desktop operation runs entirely through
the background companion, that `pico-vault` stays a tool rather than a
product path, and that the platform order is Linux, then Windows, then
macOS.

## Context

ADR 0105 fixed the product form - a background service reached through the
avatar, with the CLI demoted to a tool - and `AGENTS.md` carries it as a
standing invariant: no product path may require a terminal. ADR 0113 chose
the shell and built it: Electron whose main process is the service,
tray-only by default with the window destroyed rather than hidden, gates
C1-C3 implemented and release-gated on Linux.

Two things those decisions left unsettled are now load-bearing.

**Product form is not operational parity.** The companion's renderer bridge
exposes nine named methods: presentation get/subscribe, lifecycle check,
window close, recovery veto, Card open/submit, approval decide and
first-run begin. `pico-vault` exposes eight commands and eighteen ceremony
subcommands (`apps/vault-daemon/src/cli.ts`). Exactly one vertical has
crossed: recovery. The alarm carrier, the one-decision veto, Card re-issue,
the restore-driven first run and host re-pin all exist as shell-free
companion code in `apps/companion/src/`. Founding a Home, opening an
identity session, creating or rotating a domain, granting a reader,
publishing a checkpoint, issuing membership, delegating, enrolling,
renewing, revoking or inspecting a device, and rotating the host key exist
only behind argument parsing. "Pico is not a CLI" is true of the decided
product form and false of what a person can actually do today without one.

**A tray icon is not a guaranteed surface.** Electron's tray needs a
StatusNotifierItem/AppIndicator host on Linux; GNOME - the desktop of the
Home-Assistant-adjacent and Fedora user base this project develops on -
does not provide one without a third-party extension. Windows 11 places new
tray icons in the hidden overflow by default. A tray-only reachability
model therefore fails silently on the most common Linux desktop and starts
invisible on the most common desktop overall. ADR 0113 made tray-only the
default *state*; it did not decide that the tray is the only *door*, and
the difference decides whether a person can reach Pico at all.

Finally, ADR 0097 recorded the desktop order as macOS second and Windows
deferred to its own gate. The user has no macOS test host, and this
repository does not claim a platform it has not tested.

## Scope

Covers: what "operated through the companion" requires on a desktop; how
the companion is reached; the order in which the remaining ceremonies
become product surfaces; what the CLI is allowed to be; and the desktop
platform order with its named cost.

Does not cover: Android or any mobile platform (ADR 0131); avatar visual
design; approval rendering content (ADR 0106, unchanged); relay transport;
or any change to custody, canonical bytes, the approval binding or the
daemon request families.

## Decision

### The companion is the only product path; the CLI stays a tool

`pico-vault` is not removed, not deprecated and not reduced. It remains the
setup, diagnosis, scripting, CI and development tool ADR 0105 named, and it
keeps every command it has.

What changes is that this stops being a matter of intent. Product
documentation, onboarding, recovery instructions and release notes may not
route a person through a terminal, and that is checked rather than
remembered: a repository check fails when a product-facing document
instructs a person to run `pico-vault`. Developer, runbook and agent
documents are exempt by path, because that is precisely what the tool is
for.

### The tray is one door among several, and the set is per platform

A desktop platform ships when the companion is reachable through at least
**two** independent, always-available doors, verified on that platform:

- the tray or menu-bar item, where the desktop environment provides one;
- activating the installed desktop entry, which raises the running
  singleton rather than starting a second instance;
- the notification the companion already raises, whose action opens the
  same window.

Stock GNOME with no AppIndicator extension is the reference negative test:
the tray is expected to be absent there, and the platform still passes only
if the remaining doors work. A platform whose only proven door is the tray
does not ship.

This does not weaken ADR 0113's tray discipline. The default state remains
tray-only with no window; what is added is that the window can also be
summoned when no tray exists.

### Ceremony parity is ordered by what a person cannot otherwise do

The eighteen ceremonies move into the companion in five verticals, ordered
by how badly their absence forces a terminal:

1. **Founding and binding** - `claim-home`, `open-identity-session`, and
   the first production write of the device-local profile plus the
   Platform Keystore binding. ADR 0113 records that nobody writes these in
   production yet; that residual is this vertical's real content, and
   without it a first install is a terminal install.
2. **Device lifecycle** - `delegate-device`, `enroll-device`,
   `renew-device`, `revoke-device`, `inspect-device-lifecycle`. This is
   what a second device costs today, and losing a device is not a moment
   for argument parsing.
3. **Home continuity and membership** - `rotate-host-key`,
   `issue-membership`, alongside the host re-pin that already exists.
4. **Domains and readership** - `create-domain`, `rotate-domain`,
   `grant-reader`, `publish-checkpoint`.
5. **Vault state** - `create`, `unlock`, `lock`, `status` as product
   moments. `sign` and `daemon` stay tool-only; they are not person
   decisions.

Each vertical moves the way ADR 0105 describes: record building and the
daemon-signed approval survive unchanged, argument parsing does not. ADR
0099's approval binding and ADR 0106's rendering from the signed bytes
apply to every one of them without exception - a ceremony that gains a
product surface does not gain a shortcut past approval.

### Every ceremony is loaded lazily, and the boundary check names it

The C3 tray budget is 225,000,000 bytes PSS and 110,000,000 bytes of
private dirty plus hugetlb pages. It has already broken once, at
225,261,568 bytes, over a single barrel import that pulled the vault CLI
and daemon server into a tray that uses neither.

Eighteen ceremonies are far more than one barrel import. So the rule is
structural rather than hoped for: no ceremony module, and nothing a
ceremony pulls in, may appear in the tray's static import graph. Ceremonies
load dynamically at the moment a person opens them, exactly as the
first-run runtime and the keystore adapter already do.
`scripts/check-companion-boundary.mjs` names each one, so a regression is a
named error in a second rather than a number twenty minutes into the
release gate.

### The desktop order is Linux, then Windows, then macOS

This reverses ADR 0097's recorded order, and the reversal has a price that
belongs in writing: Windows has no Unix-domain-socket peer authentication.
The daemon needs a named-pipe transport whose peer authorization is built
from the client process token rather than `SO_PEERCRED`, with the pipe's
ACL restricted to the current user. ADR 0097 deferred that to its own gate
precisely because it is a different authorization story; putting Windows
second pulls it forward instead of removing it.

Each platform also needs its own adapter tranche, and none of it is
inherited: autostart (XDG done, Registry Run, LaunchAgent), the ADR 0081 P3
keystore backend (libsecret/KWallet done, DPAPI, Keychain), packaging and
code signing (deterministic `.deb` done, Authenticode, notarization), and a
re-measured memory budget - the numbers in ADR 0113 C3 describe the Linux
reference build and are not portable claims.

macOS has no test host. Its gate stays open, and no macOS support may be
claimed in `README.md`, `ReadmeTech.md`, add-on documentation, release
notes or the implementation-status matrix until it is implemented and
tested on a real Mac. An untested platform is absent, not "probably fine".

## Rejected alternatives

### The tray as the single entry point

The literal reading of the request. It fails on stock GNOME, starts hidden
on Windows 11, and makes reachability depend on a component the desktop
environment is free not to implement. The product form survives the
correction intact: nothing here reintroduces a terminal.

### Removing or freezing `pico-vault` now

The CLI is currently the only working way to found a Home. Freezing the
ceremony subcommands before the companion carries them would leave no way
to install Pico at all, and removing the tool contradicts an explicit ADR
0105 non-goal. The product-path check gets the same outcome without the
outage.

### One milestone for full parity

Eighteen ceremonies against roughly a megabyte of budget headroom on the
CI-near host is a lottery, not a plan. The verticals exist so that each
lands with its own boundary check, its own budget run and its own real
process proof.

### Native shells for Windows and macOS

ADR 0113 rejected this and the reasons are unchanged: three UI
implementations, no shared avatar surface, and the trust path still needs a
Node host beside each of them.

## Gates

- **E1 - Reachability contract (open):** at least two proven doors per
  platform, with stock GNOME (no AppIndicator extension) as the reference
  negative test for the tray; single-instance activation raises the
  existing companion rather than starting a second.
- **E2 - Founding and binding vertical (open):** `claim-home`,
  `open-identity-session`, and the first production write of the profile
  and Platform Keystore binding, closing the ADR 0113 residual.
- **E3 - Device lifecycle vertical (open):** delegate, enroll, renew,
  revoke, inspect - each under ADR 0099 approval and ADR 0106 rendering.
- **E4 - Home continuity and membership vertical (open):**
  `rotate-host-key` and `issue-membership` as product surfaces.
- **E5 - Domain and readership vertical (open):** create/rotate domain,
  grant reader, publish checkpoint.
- **E6 - Product-path check (implemented):** `scripts/check-product-path.mjs`
  runs in `release:verify` over nine enumerated product-facing documents and
  fails when one routes a person through `pico-vault`. It draws the line
  between describing the tool and routing through it: inside a fenced code
  block any mention is an invocation, outside one the name plus a
  subcommand is an instruction even in prose, and a bare prose mention is
  left alone because ADR 0105 requires product documentation to be able to
  say what the tool is. A longer hyphenated token never counts - the ADR
  filename `0081-pico-vault-person-role-...` is cited across the tree and
  would otherwise light up every document that references it.

  Exemptions are enumerated with their reasons rather than globbed: ADRs
  and the status matrix are records (ADR 0128), `progress.md` must be able
  to report that founding currently needs the CLI, `docs/development/**` is
  the tool's home, `docs/release/**` is maintainer procedure, and
  `CONTRIBUTING.md` addresses developers by definition.

  It starts green: no product-facing document contains such an instruction
  today, and every command-shaped occurrence in the tree sits in an ADR or
  the status matrix. Its value is refusing the first regression, so it
  carries three probes that must fire and three that must not.
- **E7 - Windows (open):** named-pipe transport with token-based peer
  authorization and a user-restricted pipe ACL; DPAPI keystore tranche;
  Registry autostart; signed package; re-measured budget; E1 satisfied.
- **E8 - macOS (blocked - no test host):** Keychain keystore tranche,
  LaunchAgent autostart, notarized package, re-measured budget, E1
  satisfied. Blocked on hardware, and unclaimable until run.

## Consequences

Positive:

- the gap between the decided product form and what a person can actually
  do is measured (nine bridge methods against eighteen ceremonies) instead
  of being carried as an impression;
- reachability becomes a tested property rather than an assumption about
  the desktop environment, and the assumption that would have failed is
  named before it ships;
- the C3 budget survives parity work, because the loading rule lands before
  the modules do;
- the cost of the platform order is written down where the order is, so
  Windows' peer-authorization work is scheduled rather than discovered.

Negative and residual:

- five verticals is a large body of work, and this ADR schedules it without
  shortening it;
- the named-pipe peer-authorization story is genuinely new security-relevant
  code, not a port, and it now arrives earlier than ADR 0097 planned;
- macOS is blocked on hardware, so the "all desktops" ambition is honest
  only as far as two of three platforms;
- the product-path check enforces documentation, not behaviour: it cannot
  detect a product surface that is merely missing, which is what E2-E5 are
  for.

## Relationship to other ADRs

- Narrows ADR `0105`: its product form is unchanged, and this adds what
  "operated through the companion" costs in ceremonies and reachability.
- Extends ADR `0113`: C4 is superseded by E7/E8, which name the per-platform
  adapter tranches and the budget re-measurement C4 left implicit. Tray
  discipline, the renderer boundary and the C3 gates are unchanged.
- Reverses ADR `0097`'s desktop platform order and records the price;
  the daemon contract, custody boundary and single-instance model are
  untouched.
- Leaves ADR `0099` and `0106` semantically unchanged and applies them to
  every migrated ceremony.
- Applies ADR `0104`: the profile and keystore binding written in E2 remain
  deployment/binding data; person settings stay in Pico.
- Companion to ADR `0131`, which decides the mobile role separately because
  it is not a smaller desktop.

## References

- [ADR 0081](0081-pico-vault-person-role-key-custody-threat-model-and-direction.md)
- [ADR 0097](0097-deployable-vault-process-and-local-ipc-authority-boundary.md)
- [ADR 0099](0099-hold-channel-approval-for-authority-creating-signatures.md)
- [ADR 0103](0103-person-side-ceremony-client-and-first-installation-validation.md)
- [ADR 0104](0104-settings-belong-to-pico-not-to-host-configuration.md)
- [ADR 0105](0105-pico-runs-as-a-background-companion-not-a-cli.md)
- [ADR 0106](0106-approval-rendering-from-the-signed-bytes.md)
- [ADR 0112](0112-recovery-product-surfaces-in-the-background-companion.md)
- [ADR 0113](0113-electron-shell-over-a-shell-free-companion-service-core.md)
- [ADR 0131](0131-android-is-a-full-client-not-a-surface.md)
