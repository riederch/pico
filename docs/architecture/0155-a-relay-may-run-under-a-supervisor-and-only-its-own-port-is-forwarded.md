# 0155 - A relay may run under a Supervisor, and only its own port is forwarded

## Status

Accepted 2026-08-20, decided by the user, who asked for a Home Assistant
add-on for both deliverables and for the documentation to say which port a
port forwarding is set up for.

This **reverses ADR 0153's packaging decision** that a relay is deliberately
not a Home Assistant add-on. It does not reverse the argument behind it, which
is still correct and is now carried as a fitness statement rather than as a
prohibition.

## Context

ADR 0153 decided three deliverables and gave the relay a container. The reason
was availability: an add-on's lifecycle belongs to the Supervisor, so a relay
filed under one household is down whenever that household restarts.

Two things have happened since.

**Nobody can install the container.** The images are built and pushed on every
push to `main`, and both GHCR packages are private, so an anonymous pull - the
only kind a Supervisor or a stranger makes - is refused. No release tag has
been pushed since `v0.1.9`, so `ghcr.io/riederch/pico/relay:0.2.1` does not
exist either. A deliverable that has no install path is not a deliverable, and
"it ships as a container" was a statement about intent rather than about what
anybody could run. That is packaging debt rather than an argument for or
against an add-on, and it is fixed in the same release.

**The Home Assistant path is the one that exists.** A person who already runs
Home Assistant has a Supervisor, an update flow, a log viewer and a network
panel. Asking them to also learn container management to run the second half
of a two-part system is a real cost, and it is the cost that decides whether
anybody ever runs a relay at all.

The availability argument does not disappear under either of those. What
changes is who it applies to: it is an argument about *which machine* a relay
belongs on, not about which packaging format may exist.

## Decision

**Pico Relay ships as a Home Assistant add-on as well as a container, from one
image.** `pico_relay/` with slug `pico_relay`, image
`ghcr.io/riederch/pico/relay`, the same version as everything else in the tree.

**ADR 0153's objection is kept and relocated.** It is a fitness statement in
`pico_relay/README.md` and `DOCS.md`, where somebody deciding what to install
meets it:

| Shape | Fit |
|---|---|
| Home Assistant box that is **not** the household's Home | the add-on |
| Relay between Homes over LAN or VPN | the add-on |
| Operator running a relay for other people | either |
| The household's own Home, with a forwarded port | **the container, on another machine** |

A relay under the same Supervisor as the Home it serves shares that Home's
outages and puts a forwarded port back on the family's router. That is the
arrangement Pico Link exists to remove, and no packaging decision makes it
correct. It is now argued rather than prevented, because preventing it also
prevented the three shapes above.

**One port is forwarded, and it is the relay's mailbox port.** `3200/tcp`, and
nothing else - not the relay's administration port, not its health listener,
and never Pico Home's `3100`. This is not new policy; it is the existing
invariant written where an installer looks for it.

## Gates

- **HR1 - One image, two packagings.** The add-on installs
  `ghcr.io/riederch/pico/relay` unchanged. No add-on-only branch, no second
  Dockerfile, no third build. What differs is how the process is told what it
  is, and that difference is one file.

- **HR2 - An add-on's options reach the relay, and a container's environment
  still wins.** `apps/relay/src/home-assistant-options.ts` reads
  `/data/options.json` when it exists, and its presence is the detection - the
  same signal `apps/core/src/host-adapter-home-assistant.ts` uses. Without
  this, the add-on would install, start, and be unconfigurable: Home Assistant
  hands an add-on a JSON file and no environment.

  `operator_api_on_lan` is the one value that outranks the environment, and it
  says why in the file: the image sets `PICO_RELAY_OPERATOR_HOST=127.0.0.1`, so
  an "only if unset" guard would ship an option that saves, displays as
  enabled, and changes nothing.

- **HR3 - The add-on and the reader name the same options.** Checked in
  `apps/relay/src/home-assistant-options.test.ts` against `config.yaml`
  itself. A renamed option would otherwise leave a Configuration tab that
  saves happily into a field nothing reads, and every unit test in the package
  would still pass, because they all supply the names themselves.

- **HR4 - A refusal in the vocabulary of the surface that received it.** A
  relay with no operator hostname must still refuse to start (ADR 0153 PK2,
  ADR 0147 RY3). Under a Supervisor it now also says which field to fill in,
  because `PICO_RELAY_OPERATOR is required` names something no Home Assistant
  user can set.

- **HR5 - Two acts to open administration.** `operator_api_on_lan` moves the
  bind address; publishing `3202` in the add-on's network panel makes it
  reachable. Neither alone opens it and installing does neither, which is
  ADR 0154 RO1/RO7 held under a Supervisor rather than restated by it.

- **HR6 - No watchdog, and no route invented to have one.** The public port
  answers an unknown route exactly like a wrong method (ADR 0149), so a
  `/health` there would be a map with one entry saying "a Pico relay lives
  here"; the health listener binds to loopback. A watchdog pointed at either
  undoes ADR 0153 PK3 or restarts a healthy relay in a loop. The absence is
  declared in `config.yaml` and in `DOCS.md` rather than left to be noticed.

- **HR7 - The gates cover the second add-on.** `check-addon-config.mjs`,
  `check-version.mjs` and `check-product-path.mjs` read `pico_relay/` as well
  as `pico_home/`. A gate that guards the first add-on only leaves the new one
  unchecked on the day it is written, which is the day it is most likely to be
  wrong - the same lesson ADR 0153 taught the Dockerfile list in that file.

## What this deliberately does not decide

**Whether the images become publicly pullable.** Both GHCR packages are
private, which is why nothing can be installed today regardless of packaging.
That is a repository setting on GitHub rather than anything in this tree, it is
the user's to make, and this ADR records that the add-on cannot work until it
is made. `riederch/pico/core` is public and the two packages that replaced it
are not, which is what a rename produces when package visibility does not
follow the name.

**Whether an add-on may ever be the recommended relay for a household.** The
table above says which shape fits; it does not promote the add-on to the
product path for remote reachability. That question needs a relay that has run
in the open, and none has.

**How a relay is provisioned without opening a port on a LAN.** Claiming still
needs the operator port reachable from the Pico Client while it happens.
ADR 0154 RO8's reset path has the same shape. A Supervisor could in principle
offer a better channel - it already shows the log the claim code is printed to
- and nothing here explores that.

## Alternatives rejected

**Keep the container-only rule and fix only the registry visibility.** The
honest minimum, and it leaves the relay installable only by people who run
containers by hand. The availability argument it protects is real for one of
four shapes and was blocking all four.

**An add-on that is a different image, hardened for a Supervisor.** A second
image is a second thing to build, sign, version and get wrong, and the
difference it would encode is one JSON file.

**Publish the health port and declare a watchdog.** The convenient option, and
it trades a property this repository can check - the public surface carries no
map of itself - for an auto-restart that compose, systemd and Kubernetes all
declare themselves anyway.

**A required `operator` option with a default.** `check-addon-config.mjs`
requires a required option to carry a default so a fresh install is not
unstartable. There is no defensible default for a hostname other machines must
resolve, so the option is optional in the schema and the relay refuses to start
until it is set. The rule's letter is satisfied by `str?` and its spirit is
satisfied by the refusal message, and `config.yaml` says exactly that rather
than letting the gate look like it passed on the merits.

## Residuals

- **The add-on ships with no icon or logo.** Character assets are governed and
  none has been approved for a relay, so Home Assistant shows a placeholder.
  Copying Pico Home's would put two identical entries in one store, which is
  worse than a placeholder.

- **A restored backup can resurrect collected packets.** Home Assistant backs
  up `/data`, and a relay database restored from yesterday offers packets that
  were already collected until they expire. Stated in `DOCS.md`; the queue is
  not the valuable half of a relay backup, and no exclusion is invented here.

- **The availability argument now depends on somebody reading a document.**
  ADR 0153 enforced it by not shipping the format at all. Nothing mechanical
  replaces that, and nothing could: whether the machine running this add-on is
  also the household's Home is not a fact this repository can observe.
