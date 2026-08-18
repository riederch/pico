# 0130 - Every Desktop Operates Through the Companion, and the Tray Is Not Its Only Door

## Status

Accepted as a product-surface and platform-order decision; E1, E2, E3, E4 and
E6 implemented, E5 and E7-E8 open. The user decided on 2026-08-09 that desktop operation runs entirely through
the background companion, that `pico-vault` stays a tool rather than a
product path, and that the platform order is Linux, then Windows, then
macOS.

Status note, 2026-08-18: **renewal, because ADR 0104's year would otherwise
end every device on a date the window shows.**

The device that holds the identity root renews itself with no exchange at
all - root and target are one vault - and that is the case worth having
first: it is the device everything else is done from.

**Renewal is replacement, so the profile is rewritten.** The new delegation
and the revocation of the old one are one transition, and every Link request
this device makes names its delegation id; a device that renewed and kept
the old id would have signed itself out of its own Home at the moment it
renewed. The test holds the same line the host rotation is held to: the
replaced delegation stops answering, asserted against the same call
succeeding beforehand.

**The warning is the load-bearing half.** Renewal needs the delegation
active - the ceremony wants it and so does the Link request that carries it
- so a device that lets its authority lapse cannot renew itself at all. The
row says how many days are left inside the last month, and says the
consequence rather than colouring the date. On another device it says the
other true thing: that renewing it has to happen with that device in front
of you, and this window cannot do that yet.

Status note, 2026-08-18: **E5 was measured before it was built, and the
measurement said not to build it yet.**

Three facts, in ascending order of how much they decide:

The owner has to keep their own records. `create-domain` returns a signed
domain record, and `rotate-domain` and `grant-reader` take it back as input
along with every rotation and grant lifecycle record - the tool reads them
from files. A product path would need a custody store on the device first.

Nothing in the product writes reader-custody content. A memory domain
carries a custody class, the default is `host_custody`, and the ordinary
store path *refuses* reader-custody items by name ("use the opaque
reader-custody package path"). Nobody calls that path outside tests.

Neither does anything read it: share envelopes and freshness checkpoints
exist as Foundation routes, and no companion ever issues or receives one.
ADR 0086's own status row says it: reader transport remains open.

So the four ceremonies would move into the Client and give a person controls
whose consequence they cannot observe - the mirror image of the defect these
gates exist to find, and worse than a documented gap. E5 stays open with
this measurement attached, and its subject - a writer path - is the work
that would make it worth having.

**What the same measurement found and was worth building: ending a
membership.** E4 made a person able to let somebody in; nothing anywhere
could let them out - not this Client, not the CLI's eighteen subcommands,
and `home.authority.submit` carried the credential but not the statement
that ends it. It is one now, in two acts the Home keeps apart: somebody who
should not live here any more, and a Pico something is wrong with. Nothing
is deleted - the Home keeps every statement and projects the latest one, so
a member who was removed can be told apart from one who was never admitted.

The lifecycle order taught the test a lesson: with one statement the Home
has nothing to compare, so *any* order passes. It decides between statements
about the same credential, so the test now writes three and checks that an
older one landing later changes nothing.

Status note, 2026-08-18: **E4 - the Home itself, from the device that
decides about it.**

Both ceremonies lived inside `cli.ts` behind sixteen flags each, so they
moved out to `home-authority-ceremony.ts` unchanged; the terminal sentences
stayed with the tool, because what a rotation costs is said by whoever is
asking rather than by the ceremony.

**A rotation ends with a re-pin, immediately.** ADR 0115 U4 already had the
walk; what was missing is that the device which asked for the rotation is
standing right there, and leaving it pinned to a key its own Home retired
makes the next ordinary read look like an attack. The new fingerprint is
read out of the verified chain rather than out of the submission's answer -
a device believing the reply it just received would be trusting the
endpoint to describe its own rotation. The proof that this is a rotation
and not a record about one is the other half of the test: the old pins stop
answering, shown against the same call succeeding before it.

**Memberships were write-only over Link.** `home.authority.submit` carried
`membership`, and `home.authority.list` knew `home_state` and
`reader_custody_domains` and not memberships - so the Home Host Pico could
admit somebody from their own device and had no way to see who was in. A
surface that cannot check its own work is the same defect this gate exists
to find, so the resource was added, held to the test the write is held to.

Two things the walk found in the Home's own answers: the founder's
membership carries `validUntil: null`, which is a fact rather than a gap and
now reads as *your place in it does not end*; and a membership issued for
the founder's own identity is refused by the Home as
`home_host_membership_is_not_reissued`, which is a true sentence about a
record and a useless one to a person - so the Client refuses it first, in
what it means.

Not in this gate and now visible: **ending a membership has no ceremony
anywhere**, not in the tool either. A person can be let in and cannot be
let out.

Status note, 2026-08-18: **the other half - a second device joins over
camera and code, which is what the user chose.**

Three codes, and the ceremony is what says three: the identity root signs
the delegation, the target co-signs a four-minute activation binding the
digest of that evidence, and the sponsor submits. Offer, grant, acceptance
is therefore the shortest exchange that exists, not a chosen one. What
crosses is two public keys, one activation to sign and one signature; the
trust pins ride along because a pin learned from the endpoint it checks is
not a pin (ADR 0115 U4), and a person watching two of their own screens is
what makes this out-of-band.

The ceremony grew a **target signer port** rather than a second daemon
client: it used to take a `targetClient`, which meant the target vault had
to be reachable from the sponsor's process - true for the tool and false
for every real second device. Two defects fell out. It read the identity
session and the lifecycle head concurrently, which answers
`client_request_in_flight` on a device where root and sponsor are one
vault; the tool had two sockets and never noticed. And a canonical label
written out by hand was wrong by one character, which is a signature over
the wrong bytes.

The grant did not fit as JSON. Fifteen 32-byte values spelled as hex is
about 1,900 bytes: a version-37 QR at correction L, and **no fit at all at
M**, the level this tree prints a Recovery Card at. As a length-prefixed
element list it is 1,079 characters and version 27 at M.

The new device writes no profile on the strength of its own signature: it
waits until the Home answers it as one of its own, and the read that proves
it is refused until the sponsor's submission lands.

Status note, 2026-08-18: **E3's first half, and the half is the
half a person is in when something goes wrong.**

Inspect and revoke are product surfaces now. The read turned out to be
running already - ADR 0112's alarm carrier polls
`home.device.lifecycle.read` on a schedule and keeps three fields from it,
so the device list came back on every poll and had nowhere to go. The rows
join ADR 0126's presences on the presence id both sides derive from the
device signing key, which keeps this one list of devices with two facts
rather than two lists over one subject.

Revoke is the ceremony that had to come with it: losing a device is not a
moment for argument parsing. It signs with the identity root under ADR 0099
approval - proved by counting the approvals the ceremony raises against a
real daemon, so "under approval" is a number rather than a claim - and the
person picks from three of ADR 0114's five reason categories, the other two
being renewal's and membership's rather than theirs.

**Ending a device's authority ends its ability to ask what happened**, and
that is reported rather than smoothed over: the count of what is left comes
back as `null` when the read that follows is refused, and the sentence says
which question went unanswered. On the row that ends the last line into a
Home, a `0` invented by this process would be the scariest possible way to
be wrong.

Delegate, enroll and renew were left for the next block because enrolment
is genuinely a two-device ceremony - the target vault co-signs a
four-minute activation with its own key - and that exchange was a product
decision this gate did not carry. The user decided it the same day: camera
and code, like the Recovery Card.

Status note, 2026-08-18: **E1 is closed, and the tray is now measured rather
than assumed.**

Three doors, each proven against the packaged `.deb` in
`scripts/verify-linux-package.mjs`:

- the **desktop entry**, followed through rather than compared. The entry names
  a launcher script - ADR 0123 Z3 drops the core-dump limits there before
  Electron starts - so the entry and the running process carry names that are
  correctly different, and asserting them equal would have been a check that
  passes forever without looking at anything. The chain checked is entry ->
  installed launcher -> the binary it execs -> the process holding the
  single-instance lock. It replaced a substring test that also accepted
  `Exec=...pico-companion-anything`.
- the **second launch**, which is a real second copy of the packaged binary.
  The probe only *observes*: raising the window is the product's handler's job,
  and a probe that called `showWindow` itself would keep passing on a build
  that had lost it.
- the **notification**, driven through the same function the product uses, with
  the click emitted rather than delivered. A daemon's delivery belongs to the
  session; what belongs to this process is that the action leads somewhere.

**The reference negative test is constructed, not waited for.** GNOME has
shipped with no StatusNotifierItem host since 3.26, and nobody here runs GNOME -
this was written on KDE, which hosts one, so all three doors were open and any
arrangement would have passed by accident. `dbus-run-session` gives a private
bus that owns nothing, which is the same absence from the companion's side. On
it, the desktop entry and the notification still open the window.

The tray is deliberately **not** asserted absent there: Electron accepts an icon
on a bus nobody watches and reports success. That is the whole reason
reachability is a property of the session rather than of the code that asks for
it - and it is why `assertPicoCompanionReachability` refuses two doors when one
of them is the tray, which would count as two here and be one on GNOME.

Where a session bus can be reached, the E1 contract is asserted against it;
where it cannot, the product-side facts are still asserted and the rest is
reported. That split is ADR 0113 C3's lesson applied a second time.

One cost worth recording: the negative run appeared to hang for three minutes.
A private bus activates `xdg-desktop-portal` on demand, the activated service
inherits the verifier's descriptors and outlives the companion, and a piped
`spawnSync` therefore keeps reading an open write end long after the probe has
answered. It arrives as `ETIMEDOUT` and reads exactly like a companion that
hung. The probe's output goes through a file now.

Status note, 2026-08-18: **E2 is closed. A Home can be founded from the Pico
Client, and the Client is the only place a person is sent.**

The three named parts are built: `claim-home` through the shell's own handler,
`open-identity-session` as the product session that both holds the unlocks and
answers the ceremony's three approvals, and the first production write of the
profile *and* the Platform Keystore binding.

The binding is the part that would have been missed. Founding wrote the profile
and stopped, while the recovery first run also sealed the passphrase - so the
same person would have been asked for it at every start on a Home they founded
and never on one they restored. Nothing failed; two paths simply disagreed
about what a device is, which is the shape of defect only a walk finds. Both
seal now, and the outcome carries `platformUnlockBound` so a keystore that
cannot seal is said out loud rather than silently costing somebody a passphrase
per start.

The first-run surface asks the two situations apart before either happens,
because the wrong one is expensive in one direction: a person who founds when
they meant to restore has a second identity and no way back to the first. The
words are the contract's - *"I have a Recovery Card"* and *"This Home is new"* -
things a person knows about their own situation, rather than *restore* and
*found*, which are things this codebase knows.

Founding ends on the idle presentation that carries the Recovery Card button
and a sentence saying to make one next. The two ceremonies stay two; the
surface leads from the first to the second.

Status note, 2026-08-17: **E2's founding half started, by lifting the one
ceremony out of the one place it was reachable from.**

`runClaimHomeCeremony` lived inside `cli.ts` and was called by exactly one
thing: `pico-vault ceremony claim-home`. That made founding the last piece of
configuration on a command line, against the decision of 2026-08-16 that every
configuration goes through the Pico Client - and it is what this roadmap means
when it says a Home can only be founded through `pico-vault` today.

It now lives in `claim-home-ceremony.ts`, unchanged except for the one thing
that was terminal-shaped: three `process.stderr.write` calls told the person to
approve *on the terminal holding the unlock*. Those are an `announce` port over
a closed set of three moments, so each caller writes the sentence in its own
medium. The CLI's wording is byte-identical to what it was, and the fifteen
real-process ceremony tests pass unchanged - including the one that founds a
Home end to end without a private key in the client process.

**What that test's title makes explicit is the shape of the rest**, and the
next step took it. Key creation was `createPicoVaultKeyfile` called by the CLI,
writing keyfiles into the vault directory - a local file operation the
companion may not do, because the recovery path goes through the daemon's
`recoveryBootstrap` request precisely so a private key never enters the client
process.

Founding now has its twin: `pico.vault.daemon.founding.bootstrap.v1` makes the
identity and this device's two keys under one passphrase and answers with
fingerprints and public halves only. The difference from the recovery twin is
where the identity comes from - a card restores one, this makes one - and
nothing else, deliberately: a founding that wrote keyfiles differently would be
a second way for a vault to exist. It refuses a vault that already holds keys,
because one vault with two roots has no way to say which one a signature
belongs to, and it removes what it wrote if any step fails, because a half
vault is worse than none.

The request shape is closed by `assertExactKeys`, and that is the load-bearing
half rather than tidiness: a founding request that *could* carry a card payload
or a PIN would be a second way to start an identity, arriving through the door
that makes one.

`foundPicoCompanionHome` now drives the whole thing: bootstrap on a plain
connection, then the product session that holds the unlocks *and answers the
approvals* - the arrangement the recovery first run already uses, because a key
opened by one party and approved by another would be two people holding one
ceremony - then the ceremony, then the profile.

**The host pins come from a line the person copies out of their Home**, not
from `/api/home/setup`. Reading them from that endpoint would be asking the
machine whether it is itself, which is exactly what the ceremony's mismatch
check exists to prevent. A Home prints the code, both fingerprints and both
public keys on one line at boot, so the out-of-band check is one paste rather
than four hex strings a person would copy off the same screen anyway.

Walked against a real Home process and a real vault daemon with no CLI
anywhere in it: the Home ends up claimed, its setup mode closed, and the
profile carries the founder's own identity as the acceptor pin - founding being
the one moment where those are the same fingerprint (ADR 0115 U4).

What remains for E2: the first-run surface offering founding beside restoring,
and the Recovery Card. Founding and card issuance are two ceremonies and stay
two - fusing them would be the same mistake as any other second way to do one
thing - but the surface has to lead from the first to the second, because
without a card a person who founds a Home can never recover it.

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

- **E1 - Reachability contract (implemented for Linux):** at least two proven doors per
  platform, with stock GNOME (no AppIndicator extension) as the reference
  negative test for the tray; single-instance activation raises the
  existing companion rather than starting a second.
- **E2 - Founding and binding vertical (implemented):** `claim-home`,
  `open-identity-session`, and the first production write of the profile
  and Platform Keystore binding, closing the ADR 0113 residual.
- **E3 - Device lifecycle vertical (implemented):** delegate, enroll, renew,
  revoke, inspect - each under ADR 0099 approval and ADR 0106 rendering.
  Inspect, revoke, enrolment and renewal of the device a person is holding
  are product surfaces since 2026-08-18. Delegate is the primitive inside
  enrolment rather than a surface of its own; renewing *another* device is
  the same three codes with `action: 'renew'` and is not built.
- **E4 - Home continuity and membership vertical (implemented):**
  `rotate-host-key` and `issue-membership` as product surfaces, with the
  reading half that turned out to be missing: over Link a Home Host Pico
  could admit somebody and then not see who was in.
- **E5 - Domain and readership vertical (open, and measured):** create/rotate
  domain, grant reader, publish checkpoint. Measured on 2026-08-18 before
  building: nothing in the product writes reader-custody content, so these
  four would be controls whose effect nobody can observe. What the same
  measurement found missing *and* observable - ending a membership - was
  built instead. The status note above carries the argument.
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
