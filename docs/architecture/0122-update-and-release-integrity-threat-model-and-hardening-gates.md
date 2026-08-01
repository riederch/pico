# 0122 - Update and Release Integrity Threat Model and Hardening Gates

## Status

Accepted as the update-channel threat model and hardening direction;
the initiative and its scope were chosen by the user on 2026-08-01.
Gates Y1-Y6 are open. This is the highest-priority item of the
security initiative for a stated reason: the update channel is the one
path that defeats every other boundary at once. ADR 0116 contains
hostile content, ADR 0117 keeps it from the acting model, ADR 0121
makes tampering non-silent - and all of it runs as whatever code the
last update delivered.

## Context

The chain as it exists, stated exactly, because the decision is only
as honest as this list.

**Consumption.** A Home Assistant installation learns about updates by
reading `repository.yaml` and `pico_core/config.yaml` from the GitHub
repository and pulls `ghcr.io/riederch/pico/core` at the tag named by
`config.yaml`'s `version`. The Supervisor verifies registry TLS and
nothing else. The add-on format has no digest field, so the reference
is a mutable tag. A standalone Docker or Podman deployment pulls the
same tag the same way. Nothing on any consumption path verifies a
signature, because no signature exists.

**Build.** CI builds on every push to `main` and on `v*` tags,
publishes with the workflow's ephemeral `GITHUB_TOKEN`, and the
`verify` job gates the `container` job. That order is right. But the
build reads mutable references everywhere: every action is pinned to a
major tag (`actions/checkout@v4`, `docker/build-push-action@v6`), the
base image is `node:22-bookworm-slim` by tag, and `packageManager`
pins `pnpm@9.0.0` without an integrity hash. Dependencies are the
strong spot - `--frozen-lockfile` against a lockfile with integrity
hashes - with one honest hole: native modules (`better-sqlite3`) make
npm install scripts load-bearing, so script execution during install
cannot be turned off. `scripts/check-release-tag.mjs` checks that a
tag matches `package.json` - consistency, not integrity. The
workflow-level `permissions` block grants `packages: write` to both
jobs, though only one publishes.

**What already holds.** Two protections exist and are worth crediting
precisely. The migration runner refuses a database containing unknown
migration ids - old code fails closed on newer data instead of
running vulnerable logic over it - which is the data half of downgrade
protection, already implemented. And `docs/release/upgrade-contract.md`
documents backup-before-migration and honest rollback limits.

**What is asserted but not true.** The same upgrade contract says
image rollback works because "the tags are immutable". GHCR tags are
mutable. Anyone with `packages: write` can re-point `0.1.9` at
different bytes tomorrow, and no installation would notice. The
contract is currently leaning on a registry property that does not
exist.

**The root of trust, named.** For every consumption path that exists
today, the update authority is write access to the GitHub repository
plus write access to GHCR. There is no key ceremony that changes this,
because the Supervisor verifies nothing an external key could sign.
ADR 0005 listed signature verification, update audit events and
rollback health as goals; none is implemented, and this ADR decides
which of them can be real under the actual trust topology rather than
restating the wish list.

## Scope

Covers: the build-input integrity of a release; what is signed and
attested, by which identity, and who can verify it; downgrade and
re-tag behavior; least privilege inside the published container; and
how an installation learns its code changed.

Does not cover:

- the Supervisor's own update UX and trust decisions, which belong to
  Home Assistant;
- self-update automation, which stays behind ADR 0005's rollback and
  health-check preconditions;
- Vault daemon and companion packaging (ADR 0113 C3 owns the desktop
  artifact and inherits the same posture when it ships);
- runtime secret hygiene inside the process, which is the next ADR of
  the initiative;
- repository governance mechanics such as branch protection settings -
  operational practice, named in the ledger, not architecture.

## Decision

### The repo is the root of trust, and the build must deserve it

No consumption path verifies an external signature today, so
pretending a signing key would change the trust topology is theater.
The honest statement is: **a Pico release is trustworthy exactly as
far as the repository commit that produced it.** The decision is to
make that statement as strong as it can be, in two moves: the commit
determines the build completely (Y1), and the binding from commit to
published bytes becomes independently checkable (Y2).

### The build reads nothing mutable and nothing unaudited

A release build becomes a function of the commit. Every action is
pinned to a commit SHA, the base image is pinned by digest, the
package manager is pinned with its integrity hash, and the lockfile
stays frozen. Anything the build fetches that is not determined by the
commit is a second author of the release, and after Y1 there are no
second authors - what remains is the content risk of the pinned
inputs themselves, which pinning cannot judge and the ledger names.

The same gate carries the audit half: a dependency-audit step runs
beside `release:verify`, failing on known-vulnerable production
dependencies, and workflow permissions narrow so that only the publish
job holds `packages: write`. The one stated exception survives on the
record: install scripts stay enabled because native modules need them,
so lockfile integrity is the only line in front of that class.

### Releases are attested with existing identity, not invented keys

Every published image digest gains a build-provenance attestation
binding it to the exact workflow run, commit and repository that built
it, using the platform's existing Sigstore-backed attestation tooling.
No Pico-held signing key exists, deliberately: a key custodied beside
the token that publishes the image would attest nothing the token does
not already control, and ADR 0016 forbids inventing ceremony around
it. The attestation's value is that it is checkable *outside* the
publish path: a re-tagged image fails verification against the digest
its attestation named, from any machine, without trusting GHCR.

Verification runs where verification is possible. A container
deployment can verify the attestation and deploy by digest before any
byte runs - that path becomes the documented and scripted one. The
Supervisor path cannot verify today and this ADR does not pretend
otherwise: for Home Assistant installs the attestation is detection
and audit, not a gate, and the first consumption path that *can* gate
is the ADR 0027 appliance image, which inherits verify-before-switch
as a requirement when it is built.

### Published means immutable, and version means forward

The false immutability claim becomes a true one by policy and check: a
published version tag is never re-pushed, and the release pipeline
refuses to publish a tag that already exists on the registry or a
version below the newest published one. `upgrade-contract.md` drops
the registry-property wording and states the real mechanism - digest
recorded per release, re-tag detectable by attestation mismatch.

The downgrade story then has three honest layers: the publish pipeline
refuses to offer a lower version (defeated by repo compromise, admitted);
the migration runner's unknown-migration refusal keeps old code from
touching newer data (already implemented, and the layer that holds
even when the channel is compromised); and a person deliberately
installing an older image against an older database stays possible,
because rollback is a feature (ADR 0005) and the contract documents
its limits.

### The container stops being root

The Dockerfile's own comment explains the current state: root, because
`/data` arrives with unknown ownership. That reason bounds the fix
rather than excusing the state: the entrypoint prepares `/data`
ownership as its first act and drops to the non-root user before any
Pico code runs. The add-on additionally ships a custom AppArmor
profile - the Supervisor's existing mechanism, currently unused -
scoped to what the process actually does: its data directory, its
port, no capability it does not use.

This is the same defense-in-depth logic as ADR 0117: assume the worst
delivery - a hostile update that made it through - and shrink what it
wins. A hostile add-on as root on a Home Assistant host is the whole
house; the same code as an unprivileged user under a deny-by-default
profile has to work for the rest.

### An installation notices its own update

ADR 0005 wanted an audit event per update attempt; the Supervisor will
not provide one, but the add-on can observe itself: on boot, Core
compares the running build's version against the last version recorded
in its database and appends a content-free audit record on change -
version-to-version, nothing else. Under ADR 0121 that record joins the
per-writer chain, so an update - the attacker's cheapest persistence
move - becomes a chained, checkpointed fact the person can see through
the ADR 0112 carrier, including the downgrade case: an installation
that boots into an *older* version than its database remembers says
so loudly.

## Gates

- **Y1 - The commit determines the build (binds the next release):**
  actions pinned to commit SHAs, base image pinned by digest,
  `packageManager` pinned with integrity hash, lockfile frozen,
  dependency-audit step beside `release:verify`, `packages: write`
  narrowed to the publish job. Install scripts stay enabled and the
  exception is recorded in the workflow.
- **Y2 - Attested provenance per release (binds the next release after
  Y1):** every published digest carries a build-provenance attestation
  from the platform's existing Sigstore-backed tooling; no Pico-held
  signing key is created.
- **Y3 - Digest-verified deployment path (binds docs and scripts):**
  the container deployment path verifies the attestation and deploys
  by digest; `upgrade-contract.md` replaces the tag-immutability claim
  with the recorded-digest mechanism.
- **Y4 - No re-tag, no silent downgrade (binds the release pipeline):**
  publishing refuses an already-published version and a version below
  the newest published; a version tag is never re-pushed.
- **Y5 - Non-root container with a shipped AppArmor profile (binds the
  next add-on release):** entrypoint prepares `/data` then drops
  privileges before Pico code runs; a custom profile ships with the
  add-on; the smoke tests run against the hardened form.
- **Y6 - Boot-time update evidence (binds ADR 0121 J1):** a
  content-free version-change audit record on every boot where the
  running version differs from the recorded one, downgrades stated as
  downgrades, raised through the ADR 0112 carrier.

## Threat ledger

| Attacker | Posture |
|---|---|
| Holds repository write access | Owns the channel - stated, not solved. Every gate raises the bar afterward: Y1 leaves no unaudited second input to hide in, Y2 makes the hostile build permanently attributable to its commit and workflow run, Y6 makes the delivered change visible on the person's host. Repository account protection is operational practice outside this ADR. |
| Holds GHCR write (stolen token, registry compromise) | Can re-point a tag. Y2/Y3: the re-tagged digest fails attestation verification from any machine; Y4 makes any legitimate re-push impossible, so a moved tag is always evidence. The unverifying Supervisor path stays exposed until the ADR 0027 image gates on verification - named residual. |
| Hijacks an action tag (`@v4` moved) | Closed by Y1's SHA pins. The pinned SHA's content risk remains and updates become deliberate diffs. |
| Poisons the base-image tag | Closed by Y1's digest pin; refreshing the digest is a reviewed commit. |
| Compromises an npm dependency | Frozen lockfile pins bytes; the audit gate catches the known; install scripts remain load-bearing for native modules and a malicious postinstall inside a pinned, hash-matching package survives - the xz lesson, named as the accepted residual of Y1. |
| Compromises the CI runner | Trusted by construction and stated: the workflow identity is what Y2 attestations attest. A runner compromise is a repository-trust event, not below it. |
| Offers a downgrade to vulnerable code | Y4 refuses it at publish; the migration runner refuses old code over newer data regardless of channel state; Y6 announces a booted downgrade on the host. |
| Ships a hostile update that installs | The Y5 case: non-root under a deny-by-default profile instead of root on the house. Containment, not prevention - the same stance as ADR 0116. |
| Waits for the person to click update | The Supervisor UX is the only consent surface and it is not Pico's. Residual until the ADR 0027 appliance path exists; Y6 at least makes what happened visible afterward. |

## Consequences

Positive:

- the trust topology is stated instead of implied, so effort lands
  where verification can actually happen rather than on ceremony the
  consumption path ignores;
- a release becomes reproducible in its inputs and attributable in its
  outputs with zero new key custody, which is ADR 0016 applied to the
  supply chain;
- the two protections that already existed - the unknown-migration
  refusal and the honest rollback contract - get named load-bearing
  roles instead of being incidental;
- the false immutability claim is replaced before anything relies on
  it harder;
- update visibility closes the attacker's quietest persistence path at
  the cost of one row per version change.

Negative and residual:

- pinned actions and base images stop floating, so security updates to
  them now require deliberate bumps - staleness is the price of
  determinism, and the audit gate only covers what advisories know;
- install scripts stay enabled, and the strongest supply-chain attack
  class therefore stays open behind lockfile integrity alone;
- the Home Assistant consumption path verifies nothing until the ADR
  0027 image exists - for the current sole deployment target, Y2 is
  audit rather than gate;
- non-root plus AppArmor will surface real breakage (the Dockerfile
  comment about `/data` ownership is a warning from experience) and
  Y5 accepts that debugging cost;
- a single-maintainer repository means the root of trust is one
  account - stated here once, mitigated operationally, not solvable
  by architecture.

## Relationship to other ADRs

- Realizes the enforceable subset of ADR `0005`'s update goals and
  leaves self-update automation behind its stated rollback and
  health-check preconditions.
- Applies ADR `0016` to the release path: existing attestation
  infrastructure, no invented signing ceremony, no Pico-custodied
  release key.
- Feeds ADR `0027` its verify-before-switch requirement: the appliance
  image is the first consumption path that can gate on Y2 rather than
  merely audit it.
- Gives ADR `0121` J1 its update-evidence record (Y6) and rides ADR
  `0112`'s carrier for the loud path.
- Corrects `docs/release/upgrade-contract.md`'s tag-immutability claim
  (Y3) and leaves its backup, rollback and key-exclusion semantics
  unchanged.
- Bounds the blast radius of a failed channel with the same
  containment stance as ADR `0116`/`0117`: assume delivery, shrink
  the win.
- Leaves runtime secret hygiene to the next ADR of the initiative and
  desktop packaging posture to ADR `0113` C3.

## References

- [ADR 0005](0005-release-and-update-platform.md)
- [ADR 0007](0007-home-assistant-add-on-release.md)
- [ADR 0016](0016-cryptography-boundaries-and-non-goals.md)
- [ADR 0027](0027-dedicated-pico-home-image-and-first-boot-setup.md)
- [ADR 0112](0112-recovery-product-surfaces-in-the-background-companion.md)
- [ADR 0113](0113-electron-shell-over-a-shell-free-companion-service-core.md)
- [ADR 0116](0116-untrusted-content-and-self-replicating-prompt-threat-model-and-hardening-gates.md)
- [ADR 0117](0117-planner-reader-split-and-origin-aware-data-flow-policy.md)
- [ADR 0121](0121-tamper-evident-audit-records-and-anchored-checkpoints.md)
