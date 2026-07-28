# 0103 - Person-Side Ceremony Client and First-Installation Validation

## Status

Accepted; not implemented. Every gate below is open.

This ADR replaces the follow-up ADR 0100 C5, 0101 K5 and 0102 M6 all named
as "`apps/core` caller migration". That work does not exist: the Foundation
holds no person key and takes no Vault session, so there is nothing there to
migrate. What is actually missing sits between the two processes that were
built, and in front of both of them sits an installation nobody has ever
performed.

## Context

ADRs 0097 through 0102 built a Vault daemon, a local IPC contract, a reader
lease, per-request approval, a ceremony signer and three daemon-side
ceremony families. Each was a correct slice. None of them has a caller
outside its own tests: `apps/vault-daemon` is imported only by itself and
by `packages/vault`, and no product path executes the chain.

The expected next step was to migrate Foundation callers onto the daemon.
Reading them shows there are none to migrate:

- `apps/core/package.json` depends on `@pico/identity`, `@pico/protocol`
  and `@pico/sync`. It does not depend on `@pico/vault` or
  `@pico/vault-daemon`, and no file under `apps/core/src` imports either.
- The reader-custody routes take finished records. `app.ts:1496` passes
  the request body straight to `ReaderCustodyStore.recordDomain`; the store
  verifies owner, writer and reader signatures and persists opaque bytes.
- `share-envelope.ts:73-77` states the ADR 0084 seam in the code: the
  Foundation may prepare a host-custody wrap, but cannot finalize or
  persist one until an external Vault returns a detached controller
  signature over the exact canonical bytes.
- `key-store.ts:129` refuses raw KEK access for `reader_custody` domains
  outright, so the host cannot hold what the ceremonies produce.

The only private keys in the Foundation process are Home Host keys in
`home-setup.ts`. Those are host infrastructure custody under ADR 0015 and
0024, not person custody, and they are correctly there.

So the custody seam ADR 0086 and 0084 designed is already built and already
right. The gap is narrower and more ordinary than a process-boundary
question: `pico-vault` can `daemon`, `create`, `status`, `lock`, `sign` and
`unlock` (`cli.ts:267-337`). It cannot run a ceremony and has no way to
deliver a record to the Foundation. Neither side is wrong; nothing joins
them.

Independently, ADR 0007, 0019 and 0027 have named real Home Assistant
installation as unvalidated since the first week. The add-on has CI smokes
and metadata; no person has installed it, claimed a Home and read back a
memory item. Every assumption about first-boot, Move-In Code delivery and
ingress is therefore still an assumption.

## Scope

Covers: where ceremonies execute and who delivers their records; the
person-side ceremony client; the first real installation validation; and
the order between them.

Does not cover: `ceremony.encrypt-item` and its plaintext-inward analysis
(ADR 0102 M6 keeps it); `SO_PEERCRED` (ADR 0097 D7); platform-keystore
unlock (ADR 0081 P3); recovery; any network, relay or Pico Link surface;
any new Foundation route; and any change to record formats, canonical bytes
or verification rules.

## Decision

### The Foundation runs no ceremony that needs a person key

This is a recording of what the code already does, promoted to a decision
so later work stops rediscovering it. A ceremony that signs with a Pico
Identity key or unwraps with an owner agreement key runs on the person's
side. The Foundation verifies the resulting record and persists it.

The alternative — giving a long-lived add-on process a path to the person's
Vault — was never viable and should be named as rejected rather than left
open. The daemon deliberately has no network surface, and its sessions are
hold-bound to a terminal the person is sitting at. A Foundation instance
that could drive it would either need a network API the ADR 0097 contract
forbids, or a cached unlock every ADR from 0097 onward refuses.

The consequence is that ADR 0100 C5, ADR 0101 K5 and ADR 0102 M6 should be
read as "no Foundation-side migration is required"; their remaining open
work is `encrypt-item` and the ADR 0097 D7 list.

### The person-side caller is the CLI

`pico-vault` gains a `ceremony` command group that connects to the daemon,
runs the ceremony inside the boundary, lets the person approve at the
terminal that holds the unlock, and POSTs the finished record to the
Foundation route that already accepts it.

The alternative of a separate ceremony tool was rejected: the CLI already
owns the unlock, the hold connection and the approval channel, and ADR 0099
routes approval to the holder of the signing key. A second process would
have to reproduce all three to gain nothing.

The CLI therefore becomes an HTTP client for the first time. That is a real
new surface and is bounded deliberately: it speaks only to a Foundation URL
the person passes explicitly, authenticates as `home-authority-relay`, and
posts records the daemon produced. It never retries on rejection and never
transforms a record — a Foundation `reason` is surfaced verbatim, because
the Foundation's refusal is authority, not a transport error.

### Validation precedes extension

The installation gates run before the client gates.

The ceremony client builds on assumptions — that the add-on installs, that
first-boot works, that a person can reach the dashboard through ingress —
that have never been checked. Discovering a broken setup flow after the
client is built makes the client's shape a sunk cost. Discovering it first
costs nothing.

The host-custody path can already be exercised end to end without any of
this ADR's client work: `POST /api/events` records a memory item
(`app.ts:2170`), `GET /api/memory/domains/:privacyDomain/items` reads it
back, and `KeyStore` holds the KEK. That is the path a person can use
today, so that is the path the first installation validates.

## Gates

- **V1 - Real installation: Open.** The add-on installs into an actual
  Home Assistant instance from this repository, not a CI smoke.
- **V2 - First boot: Open.** Setup Mode, Move-In Code delivery, claim and
  founding complete with a person following the documented path. Log-only
  Move-In Code delivery is expected to be the first thing that does not
  survive contact; the outcome is recorded either way.
- **V3 - Ingress reach: Open.** The dashboard is usable through Home
  Assistant ingress, the operator credential can be set, and an event can
  be written and read.
- **V4 - Memory round trip: Open.** A memory item is written through
  `POST /api/events`, read through the domain items route, then crypto-
  shredded, after which the read reports `key_shredded`.
- **V5 - Findings recorded: Open.** Every friction point is written down,
  including small ones. The output of this gate is the list, not a pass.
- **C1 - Ceremony command group: Open.** `pico-vault ceremony
  create-domain`, `grant-reader` and `rotate-domain` drive the existing
  `client.ts` ceremony methods and POST to the existing Foundation routes.
  No new Foundation route is added.
- **C2 - No person key in the client: Open.** The CLI process holds no
  identity or agreement private key; all key use crosses the socket. This
  is a test, not a claim.
- **C3 - Refusal fidelity: Open.** A Foundation rejection surfaces its
  `reason` unchanged, with no retry and no partial local state.
- **C4 - Executing test: Open.** An integration test runs a daemon and a
  Foundation together and creates a reader-custody domain end to end. This
  is the first test that executes the ADR 0097-0102 chain as a product
  path rather than as a unit.

## Non-goals

- item encryption or any ceremony carrying plaintext inward;
- new Foundation routes, or Foundation-held person keys;
- automatic, scheduled or unattended ceremony execution;
- a networked Vault, remote daemon access or cached unlock;
- packaging, autostart, macOS or Windows transports;
- recovery, platform keystore or approval rendering;
- any Pico Link, relay or compatibility claim.

## Consequences

Positive:

- the ADR 0097-0102 chain gains its first product path, closing the gap
  between a built custody boundary and a used one;
- three ADRs stop carrying a follow-up item that describes work that does
  not exist;
- the installation assumptions underneath every Home and Foundation ADR
  get checked for the first time, at the point where correcting them is
  cheapest;
- the shape stays honest: the person's keys stay on the person's side, and
  the Foundation keeps verifying rather than holding.

Negative and residual:

- V1-V5 are manual and cannot be automated into the release gate; their
  value is the findings, which is exactly the kind of output this project
  has so far had no place to put;
- V2 is expected to fail in some form, and that failure will generate work
  this ADR does not scope;
- the CLI becomes an HTTP client, which is a genuinely new surface on a
  tool that until now spoke only to a local socket;
- running a ceremony still means a person at a terminal with the
  Foundation reachable, which is workable for setup and unreasonable as a
  steady state; a UX layer remains unnamed future work;
- nothing here makes the reader-custody path usable by a person end to end
  — item encryption still holds the owner agreement key in the writing
  process (ADR 0102 M6), so the full reader story stays incomplete.

## Relationship to other ADRs

- Discharges the "`apps/core` caller migration" item in ADR `0100` C5,
  `0101` K5 and `0102` M6 by establishing that no such migration exists,
  and leaves the rest of those gates untouched.
- Supplies the first consumer of the ADR `0101` and `0102` ceremony
  families, as ADR `0098` did for the ADR `0097` lease.
- Records the ADR `0084` prepare/finalize seam and the ADR `0086` opaque
  relay as already correct, and builds the missing person-side half.
- Validates, for the first time, the installation path ADR `0007`, `0019`
  and `0027` describe, and the Foundation exposure boundary of ADR `0030`
  and `0040`.
- Keeps the ADR `0015` and `0024` split intact: the Foundation Host is
  infrastructure, not custody.

## References

- [ADR 0007](0007-home-assistant-add-on-release.md)
- [ADR 0024](0024-server-bootstrap-tenancy-and-eviction.md)
- [ADR 0027](0027-dedicated-pico-home-image-and-first-boot-setup.md)
- [ADR 0084](0084-controller-signed-host-custody-share-envelope-issuance.md)
- [ADR 0086](0086-reader-custody-authority-and-opaque-storage.md)
- [ADR 0097](0097-deployable-vault-process-and-local-ipc-authority-boundary.md)
- [ADR 0100](0100-identity-ceremony-signing-over-the-vault-daemon.md)
- [ADR 0101](0101-daemon-side-kek-ceremony-families-and-ceremony-approval.md)
- [ADR 0102](0102-multi-session-unlock-and-two-role-ceremonies.md)
