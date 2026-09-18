# 0122 - Update and Release Integrity Threat Model and Hardening Gates

## Status

Accepted as the update-channel threat model and hardening direction;
the initiative and its scope were chosen by the user on 2026-08-01.
Y1, Y4 and Y6 are implemented; Y2 and Y3 are written but unverified until
a release runs; Y5 is open. This is the highest-priority item of the
security initiative for a stated reason: the update channel is the one
path that defeats every other boundary at once. ADR 0116 contains
hostile content, ADR 0117 keeps it from the acting model, ADR 0121
makes tampering non-silent - and all of it runs as whatever code the
last update delivered.

Status note, 2026-08-21: **this ADR's own sentence was lifted to the root.**
"A Pico release is trustworthy exactly as far as the repository commit that
produced it" was decided here and stood nowhere above it, so six ADRs and five
gates answered a question the product's root never asked. A derivation review
recorded that as finding B1 in `Roadmap.md`; the owner decided on 2026-08-21 to
raise the sentence rather than declare delivery out of scope. It is a boundary
statement in `README.md` now and requirement A14 in the tree. Nothing here
changed - what changed is that it is no longer only here.

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

**Build.** CI builds on `v*` tags and when somebody starts it by hand,
publishes with the workflow's ephemeral `GITHUB_TOKEN`, and the
`verify` job gates the `container` job. (Until 2026-09-18 it also built
on every push to `main` and on every pull request - seven paid jobs
each. The trigger became `workflow_dispatch` plus tags by a user
decision, because the full chain runs before every commit anyway and
what CI adds beyond it - a clean runner, the two container smoke tests,
the client package - is what a release needs. `pnpm prepush` is the
local half of that decision.) That order is right. But the
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

- **Y1 - The commit determines the build (implemented):** all twelve
  action uses carry a full commit SHA with the version as a trailing
  comment, the base image carries its digest, `packageManager` carries a
  sha512 hash verified against the published tarball rather than copied
  from the registry's own claim, `packages: write` sits on the one job
  that publishes, and a dependency audit runs beside `release:verify`
  rather than inside it - a known advisory is a fact about the day of
  the build, and folding it into the gate would make an unrelated
  disclosure look like a broken tree.

  `scripts/check-workflow-pinning.mjs` keeps all of that from being
  undone by the next person adding a step: it fails on an action that is
  not SHA-pinned, a base image without a digest, a package manager
  without an integrity hash, and on the install-script exception going
  unrecorded. That last one was unmet when the check was written, which
  is how it was noticed.

  The audit found three high-severity advisories on its first run
  (2026-08-06) - `find-my-way` HTTP/2 denial of service and two
  `fast-uri` host confusions, all transitive under Fastify. They were
  fixed by re-resolving to `find-my-way@9.7.0` and `fast-uri@3.1.5`, not
  by lowering the threshold.

  **The scope is `--prod`, and what that leaves out was measured on
  2026-09-08** (finding B87). Fourteen advisories sat in the development
  toolchain - four moderate, nine high, one critical - and this gate is silent
  about them by construction. Nine went away the way B63's did: re-resolving
  `brace-expansion`, `nanoid`, `postcss` and `esbuild` inside the ranges the
  tree already declares, no range changed, 2.947 tests still green.

  The five that remain need a range change (`vitest` is already at the highest
  stable version `^2.0.0` admits), and every one of them requires **a running
  dev server**: a Vitest UI that is not installed, a Vite `server.fs.deny`
  bypass on Windows, an esbuild dev-server request, a Vite optimized-deps
  traversal, an editor-launch disclosure through the error overlay. Nothing in
  this repository starts one - `vitest run`, `tsc`, no `vite dev`, no `--ui`.

  That is a fact about a day, exactly like the version above it. Whether the
  gate should cover development dependencies at all is not settled here: it
  would fail today and would need either an upgrade past the declared ranges or
  an exemption list, and this ADR is about the machine that builds and signs,
  which is the machine those packages run on.

  **`fast-uri@3.1.5` is what the audit failed on the next time** (2026-09-04,
  finding B63): eight high advisories, six of them that same package, whose
  fixed range moved to `>=3.1.6`. The remedy was the same one and stays the
  same - re-resolve inside the ranges the tree already declares (`^3.0.0`
  and `^4.0.0`), which is why no override and no ignore entry appears
  anywhere; Fastify itself went to `5.12.3` for two moderate advisories
  against `<5.12.1`. What changed is this paragraph. A version named as the
  fix is a fact about a day, so it now carries its date and stands in the
  past tense - and the thing that catches the next one is this step, which
  reads the world at build time, not a version written down here.

  Install scripts stay enabled and the exception is recorded in the
  workflow: `better-sqlite3` is a native module whose build runs during
  install, so disabling script execution would not harden this build, it
  would stop it. The frozen lockfile with per-package integrity hashes
  is what carries the weight instead.
- **Y2 - Attested provenance per release (written; unverified until a
  release runs):** the workflow attests the published digest with the
  platform's own Sigstore-backed action and pushes the attestation to the
  registry. No Pico-held signing key is created, deliberately: for every
  consumption path that exists today the update authority is already
  repository plus registry write access, and a key Pico held would add a
  ceremony without moving that root of trust.

  **The first publishing run refused it**, and the reason is the kind a
  review does not catch: attestation needs `id-token: write` for the OIDC
  token Sigstore signs against, and `attestations: write` to record the
  result. A job that publishes has neither by default, and Y1 had
  deliberately narrowed permissions to that job - so the least-privilege
  decision and the attestation decision were taken separately and did not
  meet until a real release. The error compounds it: "Unable to get
  ACTIONS_ID_TOKEN_REQUEST_URL" reads as an infrastructure fault rather
  than as a grant the workflow never asked for.

  Both permissions now sit on the publishing job, and
  `scripts/check-workflow-pinning.mjs` refuses a workflow that uses the
  attestation action without them - matched as YAML keys rather than as
  text, because the workflow explains both permissions in a comment and a
  substring match is satisfied by the explanation. Five probes: each
  permission missing, both missing, granted workflow-wide instead of on
  the job, and commented out.

  With the permissions in place the next run got further and stopped
  somewhere else:

      Failed to persist attestation: Feature not available for
      user-owned private repositories.

  **So Y2 is unmet, and not for a reason this repository can fix.** The
  attestation is built and signed; GitHub declines to store it because
  this repository is private and owned by a person rather than an
  organisation. Nothing in the workflow, the permissions or the pinning
  changes that.

  Two things would produce provenance, and both are decisions about the
  project rather than about a file: a **public repository**, or an
  **organisation-owned** one. Until one of them happens, the update
  authority for every consumption path is repository plus registry write
  access, **unattested** - which is the same authority Y2 was written to
  keep from being the only one.

  What the workflow does in the meantime is skip the attestation and say
  so in the job summary. Failing every push would make a wall out of a
  gate; skipping quietly would let a build with no provenance read like
  one that has it, which is the worse of the two. `supply:check` refuses
  a conditional attestation whose skip is not reported, so the notice
  cannot be dropped later while the condition stays - two probes, one
  removing the reporting step and one gutting its text.

  This is also the third thing the first real publishing runs taught that
  no amount of reading would have: the permissions, and then the
  repository shape. A gate written against a platform is a claim about
  that platform, and only the platform can settle it.
- **Y3 - Digest-verified deployment path (partly implemented):**
  `upgrade-contract.md` already states that GHCR tags are mutable and
  documents recording the digest, so the false immutability claim is
  gone. The build now emits the published digest into the job summary,
  so the digest a release records is produced by the build rather than
  copied by hand from a terminal.

  What is missing is the verifying half: no deployment path checks the
  attestation before running the image, and it cannot until Y2 has
  produced one.
- **Y4 - No re-tag, no silent downgrade (implemented):**
  `scripts/check-release-monotonic.mjs` runs before the build, because a
  refusal is only useful while nothing has been pushed. It refuses a
  version that already exists and one below the newest published, reads
  the published set from the registry rather than from anything in this
  repository - what is out there is the fact, and a local list is what an
  attacker would rewrite - and fails closed when the registry cannot be
  read, since a registry that did not answer did not say yes.

  The two refusals are different failures and are named separately. An
  accidental re-run and an attempt to change what a version means are
  indistinguishable from the pipeline, so both get the answer for the
  hostile reading. Versions are ordered numerically: `0.1.10` sorts below
  `0.1.9` as text, which would pass a real downgrade and block a real
  upgrade.

  Nothing here makes a GHCR tag immutable, and the gate does not claim
  it. What it removes is the legitimate path to a moved tag, so a version
  whose bytes change is always evidence rather than possibly a re-run.
- **Y5 - Non-root container with a shipped AppArmor profile (binds the
  next add-on release):** entrypoint prepares `/data` then drops
  privileges before Pico code runs; a custom profile ships with the
  add-on; the smoke tests run against the hardened form.
- **Y6 - Boot-time update evidence (the record implemented; the
  carrier surfacing open):** the running version is recorded in the ADR
  0110 anchor, which is where it has to live: a restore brings back the
  Foundation snapshot *and* its record of what was running, so a
  downgrade would look like continuity. `home.version_changed` carries
  two versions and a direction, and because it starts with `home.` the
  audit family picks it up by prefix - chained and anchored like every
  other authority-relevant record without a second decision.

  A downgrade is named as one. Arriving on older code is the direction
  that can reintroduce a fixed flaw, and an installation unable to say
  which way it moved cannot tell an update from an attack. Versions are
  compared numerically for the same reason as Y4.

  **A first boot records the version and appends nothing.** Nothing
  changed - that is the beginning, and this gate asks for a record where
  the running version *differs* from the recorded one. An anchor that was
  re-seeded also reads as a first boot, and that case already has its own
  more precise record in `home.recovery_anchor_reseeded`.

  **Recording never creates an anchor**, and a test caught the first
  version of this doing exactly that. ADR 0110 R6 keeps a Home closed
  when its anchor is missing until a person re-seeds it deliberately; a
  file written at boot would have turned that loss into a fresh empty
  anchor answering every question with "nothing was ever consumed".
  Knowing which version ran is not worth defeating the block that exists
  to notice a restore.

  What is not done: the record is not raised through the ADR 0112
  carrier, so a person learns of a downgrade by reading the log rather
  than by being told.

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
