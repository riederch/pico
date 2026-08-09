# 0113 - Electron Shell over a Shell-Free Companion Service Core

## Status

Accepted; partially implemented. This ADR makes the ADR 0105 B2 shell
decision the previous ADRs deliberately left open: the person-side
background companion ships as an Electron application whose main process
hosts a shell-free service core. Gates C1-C3 - the service core, the
Linux-first Electron wiring and real-process alarm proof, and the Linux
package/release budget - are implemented; C4 (further platforms) is open.
Both decisions in here - Electron, and
service-core-first for the attached milestone - were made explicitly by
the user on 2026-07-31.

Named on 2026-08-09 under ADR 0126 P5: what this ADR calls the companion
is, in that model, **the first presence** of the identity - one execution
of it on one device, beside others that may run at the same time. The text
below keeps its wording and nothing about the shell, the boundary, the
renderer discipline or the C-gates changes. What the naming adds is where
the seams already were: the shell-free service core is what a second
presence reuses (ADR 0131 counts on exactly that), the device-local
profile is presence-local state rather than identity state, and C4's
further platforms are further presences rather than further products.

The superseding of C4 by ADR 0130 E7/E8 is recorded there and unchanged
here.

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
direct to the printer (ADR 0112); the renderer sees only public setup/front
metadata. S3 extends the original four display methods with four named
recovery methods: veto, open/submit the public Card setup, and one-bit approval.
Each main-process handler is bound to the exact current presentation decision;
there is no generic command or raw-payload bridge. Secret keystrokes are
prevented in Main before renderer delivery, and only their count is rendered.

The ADR 0081 P3 Linux unlock adapter also stays entirely in Main and the
shell-free core. Electron reports the selected `safeStorage` backend; the core
accepts only GNOME libsecret/KWallet and refuses `basic_text`. The renderer
receives neither the encrypted binding nor its decrypted passphrase. Before an
authenticated carrier operation the core may renew the two exact delegated
device sessions, but it never auto-unlocks the identity root and never widens
the daemon's idle or absolute limits. Suspend and screen lock close the hold;
resume/unlock re-enters through the ordinary authenticated check.

### Tray discipline and the memory budget

The companion's default state is tray-only with the window destroyed,
not hidden - one renderer window exists only during interaction or an
active alarm. Avatar animation runs only while the window is visible and
respects reduced motion (design system). The budget is part of the C3
gate, not prose: tray-mode proportional set size (PSS) stays below
225,000,000 bytes and the sum of private dirty plus private hugetlb pages stays
below 110,000,000 bytes on the reference Linux build. Both are measured from
`/proc/*/smaps_rollup` across the whole Electron process tree and retained by
the release check. Summed RSS and total private resident memory remain
diagnostic: RSS counts shared pages once per process, while the observed
private-clean classification changes substantially with the runner's current
file-page sharing despite nearly stable PSS. Neither therefore defines the
second gate. The PSS refinement and both numeric limits were chosen explicitly
by the user on 2026-08-02 after the packaged process measurement made the
original literal sub-100-MB summed-RSS target physically false. The exact
second class was refined explicitly on 2026-08-03 after the root-owned SUID
runner separated clean, dirty and hugetlb evidence.

The v2 retained report separates private clean, dirty and huge pages, states
the exact dirty-plus-hugetlb budgeted total and groups the same measurements by
Electron's closed process roles. Electron's own `app.getAppMetrics()` PID set
supplements the live parent/child walk so a sandbox-reparented app process
cannot silently disappear from the total. The report is written and emitted
before either budget assertion, making a failed reference-build measurement
actionable without weakening the gate.

**Open on 2026-08-10: the PSS budget is exceeded on the development
machine.** Four measurements of the packaged `0.1.9` build with Electron
43.2.0 gave 237.7, 238.0, 238.6 and 241.2 MB against the 225 MB limit -
5.7 to 7.2 percent over, and stable enough that this is not measurement
noise. The private dirty-plus-hugetlb class stays inside its own budget
(about 105 MB against 110 MB), so only the PSS gate fails. It was
attributed rather than assumed: the 238.6 MB reading comes from a clean
`HEAD` worktree built and measured on the same machine in the same
session, so it predates the ADR 0134 F2 work that surfaced it and is not
caused by it. What is not yet known is whether the cause is this machine
(PSS attributes shared pages by how many processes map them, so the
number is a property of the host as much as of the build) or a real
growth in the packaged tree since the budget was last met. That question
is the next step, and it has to be answered before either number is
touched: raising a budget to meet a measurement is how a budget stops
meaning anything, and the limits were chosen by the user, not derived.

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
- **C2 - Shell wiring and real-process alarm (implemented):**
  `apps/companion-shell` pins Electron 43.2.0 and hosts C1 in the main
  process over the existing profile, Vault-daemon socket and Link client.
  Tray, critical desktop notifications, resume and false-to-true network
  regain are adapters around `checkNow`; the default state owns no window,
  and an interaction/alarm creates a strict sandboxed BrowserWindow that is
  destroyed on close. The preload exposes only nine named methods:
  presentation get/subscribe, lifecycle check, window close, recovery veto,
  Card open/submit, approval decide and first-run begin - the last carrying
  nothing but the chosen scan source, since ADR 0112 S3 collects the card, its
  PIN and the passphrase in Main; renderer-reachable code has no Node or
  Electron import, parses a closed display-only state, uses textContent and
  a no-network/no-inline CSP, and renders color+symbol+text without inventing
  a Character asset. The shell adapter carries all three existing loud
  statements (pending recovery, verified host rotation, unverified Home
  continuity), while raw errors are reduced to public categories before IPC.
  Static boundary checks and an actual Electron smoke prove
  `contextIsolation`, sandboxing, absent Node/`require` and the exact nine
  bridge methods. A spawned Foundation, a founded Home and two real Vault
  daemons prove that a real pending recovery reaches the hosted carrier and
  raises its blocked presentation on the first authenticated read.
- **C3 - Packaging and budget (implemented; the budget now has a cheap
  companion check):** the measured PSS budget stays the authority - but it is
  a twenty-minute round trip that packages the app, installs it and reads
  memory, then reports a number and nothing about why. On 2026-08-06 it
  reported 225,261,568 against 225,000,000 and left the cause to be found by
  hand.

  The cause was structural rather than a leak: the Electron tray's *static*
  import graph had grown. `vault-product-session.ts` imported the
  `@pico/vault-daemon` barrel for one client function, and that barrel also
  carries the vault CLI and the daemon server - 156 KiB of source starting
  with a tray that uses neither. Three protocol modules added the same week
  rode in through `@pico/protocol`'s barrel for the same reason. Narrowing
  the one import and publishing those three as subpaths took the tray graph
  from 44 modules and 836 KiB to 38 and 647 KiB, which is far more than the
  additions had cost: the budget had roughly 819 KB of headroom, so anything
  at all would have tripped it.

  `check-companion-boundary.mjs` now walks that graph and fails, by name, on
  a module that has no business starting with the tray. Type-only imports are
  not walked, because they are erased before anything runs. The check found
  nothing when it was written - the narrowing had already landed - and exists
  so the next one is a named error in a second rather than a number in CI.
  Counter-proven against both shapes the regression took: restoring the
  barrel import, and re-adding a subpath module to the barrel.

  The rest of the gate is unchanged: the Linux-amd64 build emits
  a deterministic Debian package plus SHA-256 sidecar. It carries only
  built runtime files and internal dependency links. The production closure
  is installed offline from the committed frozen lockfile and existing pnpm
  store under an intentionally empty metadata cache, rather than through the
  pnpm-v9 deploy path whose resolution is not lockfile-authoritative. The
  package installs the Electron shell under `/opt`, registers its desktop
  entry and system-wide XDG autostart, retains Chromium's root-owned setuid
  sandbox helper, and owns neither a person's profile nor Vault data. The
  gate rejects production launcher or desktop entries that embed
  `--no-sandbox`. Chromium prefers the SUID helper adjacent to its executable,
  so CI probes that exact packaged helper instead of configuring an external
  substitute. The verifier atomically creates a temporary root, makes that
  directory `root:root` mode `0755` before privileged package extraction, and
  therefore preserves the archive's root-owned `4755` helper. It validates both
  the secured extraction root and the adjacent helper before launching without
  `CHROME_DEVEL_SANDBOX` or a sandbox command-line override. This exercises the
  same helper selection as a real package installation while keeping the
  privileged write confined to a registered `mkdtemp` root; ownership is
  returned to the invoking user before ordinary cleanup. A normal local probe
  remains unprivileged and disables only the unusable setuid path, leaving
  Chromium's user-namespace sandbox active. Inherited helper paths and fully
  unsandboxed probes are rejected. The resource probe therefore proves packaged
  runtime closure and resource/core-dump behavior with a real Chromium sandbox
  in either environment. C2's window options, boundary tests and Electron smoke
  carry the separate renderer-boundary proof. A
  temporary-root lifecycle proof performs
  install, synthetic upgrade, remove and purge while byte-and-mode sentinels
  prove profile and keyfile preservation. The
  packaged launcher sets both soft and hard core-dump limits to zero before
  `exec`, and the real packaged tray probe proves those inherited limits.
  Its retained evidence separates private clean/dirty/huge pages and aggregates
  browser, zygote, GPU, utility, renderer, sandbox and unknown-role processes;
  Electron-associated PIDs remain included even if sandboxing reparents them.
  Failed budget runs emit this evidence before refusing the release.
  The local user-namespace probe has a seven-process topology; the 2026-08-03
  v2 full-gate run reported 200,540,160 bytes PSS and 95,756,288 private
  dirty-plus-hugetlb bytes below the unchanged 225,000,000/110,000,000 numeric
  gates. Total private memory was 99,762,176 bytes including 4,005,888 clean
  bytes, and summed RSS was 516,456,448 bytes. The root-owned SUID v2 package
  gate then passed with 203,502,592-byte PSS and 55,300,096 budgeted private
  bytes. Its 136,916,992 total private bytes included 81,616,896 clean bytes;
  this evidence is why clean pages remain visible but do not decide the v2
  private gate. Static
  upstream evidence pins Electron 43.2.0 as the reviewed latest stable
  version and expires at the next scheduled stable-major date, so stale
  currency evidence blocks `release:verify`.
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
- the exact Electron binary and its Chromium security cadence remain
  operational debt; C3 turns that debt into an expiring release check, so
  every scheduled stable-major transition requires a fresh upstream review;
- the service core depends on `@pico/vault-daemon` for the daemon and
  Link clients; extracting those clients into a dedicated package is
  legitimate later hygiene, not a product gate;
- nobody writes the profile or Platform Keystore binding in production yet -
  enrollment, onboarding and restore gain that duty with their product
  surfaces (S3); the current Card surface is re-issue from an already bound
  profile.

## Relationship to other ADRs

- Decides ADR `0105` B2's shell and implements its first hosted background
  runtime; B3 has begun with the status renderer and typed bridge.
  The CLI remains transitional tooling.
- Implements the core of ADR `0112` S2; the cadence and loudness
  contract lives there, the carrier lives here.
- Keeps ADR `0099`/`0106` approval semantics unchanged: the main process
  acknowledges its watcher before opening the ceremony consumer, approvals
  render from the signed bytes, and the avatar returns only the exact decision.
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
- [Linux `/proc` memory accounting](https://www.kernel.org/doc/html/v6.15/filesystems/proc.html)
- [Chromium MemoryInfra](https://chromium.googlesource.com/chromium/src/+/7bf60df60dea0/docs/memory-infra/)
