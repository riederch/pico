# 0103 - Person-Side Ceremony Client and First-Installation Validation

## Status

Accepted. The validation half (V1-V5) is done: the add-on runs on a real
Home Assistant instance and a memory item has been written, read and
crypto-shredded there. On the client half, C1, C3 and C4 are done - a
person can now found a Pico Home with `pico-vault ceremony claim-home` and
create a reader-custody domain in it, both impossible when this ADR was
written, and C5 proves the chain end to end across two real processes.
C2 is complete, and with it the whole of ADR 0103: a reader is admitted to
a Home, delegates to its own device keys, registers them, asserts their
freshness and is granted access to a domain - across two separate Vaults
and a real Foundation, all in one test.

This ADR replaces the follow-up ADR 0100 C5, 0101 K5 and 0102 M6 all named
as "`apps/core` caller migration". That work does not exist: the Foundation
holds no person key and takes no Vault session, so there is nothing there to
migrate. What is actually missing sits between the two processes that were
built, and in front of both of them sits an installation nobody has ever
performed. Below both sits a Home nobody can found: the claim ceremony has
no caller either, and without a founding record the domain ceremonies
cannot run at all.

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

The same gap sits one level lower, and it is the one that blocks
everything above it. `POST /api/home/claim` takes a sealed `claimEnvelope`
or a signed `foundingAcceptance`; the dashboard only reads `claimState`
(`apps/web/src/api.ts:420`) and offers no claim flow; the CLI has no claim
command; and no script or add-on document supplies one. **No tool exists
with which a person can found a Pico Home.** The ceremony is implemented,
signature-bound and covered by tests, and it is not reachable.

That is not a separate nice-to-have. `ReaderCustodyStore.verifyDomain`
refuses every domain record with `no_founding_record` while no founding
exists (`apps/core/src/reader-custody.ts:1176`), so the domain ceremonies
this ADR set out to deliver cannot be exercised against a real Foundation
at all until a Home has been founded. The claim is the first ceremony, not
a later one.

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

- **V1 - Real installation: Done, after two failures.** The add-on now
  installs and runs on a real Home Assistant instance. It took three
  releases. `0.1.8` could not be pulled at all (`404 manifest unknown`):
  pushing `main` publishes only `main` and `sha-*`, and the semver tag the
  add-on pulls exists only after a `v*` tag build - now step 3 and 4 of the
  upgrade contract. `0.1.8` then installed but refused to start, because
  `config.yaml` carried a `null` default for an optional option and the
  Supervisor reads that back as a missing value; fixed in `0.1.9` and now
  gated by `pnpm addon:check`. Finally, the stored option value survived the
  update and had to be cleared by hand, because Supervisor validation runs
  before any Pico code and Pico cannot repair it.
- **V2 - First boot: Done as far as it can go.** Setup Mode opens, the
  Move-In Code and the operator bootstrap code are both in the add-on log,
  and both are usable. The expected friction is real but mild: each is a
  field inside a JSON log line carrying four other values, so a person has
  to find the right line and read a field out of it, and both are reminted
  on every restart. The claim itself could not be performed - there is no
  tool for it, which is the finding this ADR already records and gate C1
  answers.
- **V3 - Ingress reach: Done.** Migrations `0001`, `0002` and `0003` applied
  cleanly on first boot, `/api/system/version` reports `0.1.9` with protocol
  version `0.1.7` (the ADR-0104-era split, visible in production), operator
  bootstrap succeeded against a Home with no founding record, and the
  returned session authorized the rest.
- **V4 - Memory round trip: Done.** `POST /api/events` wrote a
  `memory.recorded` item and returned `payloadPosture: reference_only`, so
  the plaintext never entered the append-only event. The domain items route
  returned it, the shred route accepted the exact-name confirmation and
  removed one key version, and the same read then reported
  `contentUnavailable: key_shredded` with the record still present. The
  ADR 0070-0074 crypto-shredding boundary works end to end on real hardware.
- **V5 - Findings recorded: Done.** The findings are above, plus one that
  belongs to another ADR: with the direct host port mapped, `ha-ingress`
  and no token, `POST /api/events` accepts writes from anyone on the
  network, because `foundation-diagnostic` is open when no token is
  configured. ADR 0041 already forbids exactly this - *"No tokenless
  ha-ingress mode while the add-on direct host port is mapped"* - but
  nothing enforces it: a person can map the port in Home Assistant and the
  container cannot see that it happened. The closed-by-default port is the
  only thing holding that rule up, and it is a packaging default rather than
  a check.
- **C1 - Claim ceremony: Done.** `pico-vault ceremony claim-home` takes the
  Move-In Code and host key material a person can read from the add-on log,
  seals the claim envelope to the host key-agreement key, signs the founding
  acceptance with the identity key inside the daemon, and completes both
  steps against `POST /api/home/claim`. Implemented as
  `pico-vault ceremony claim-home`. The host fingerprints the person reads
  from the add-on log are compared against what the Foundation serves before
  anything is signed - without that, whatever answers on `--core-url` could
  hand out its own key and receive a claim sealed to itself. Founding costs
  exactly two approvals, because the claim and the acceptance each create
  authority and neither is on the ADR 0099 exempt list.
- **C2 - Domain ceremony group: Done.** `pico-vault ceremony
  create-domain` drives the existing daemon ceremony and POSTs the signed
  record to the existing route; no new Foundation route was added. It needs
  two unlocked keys - the identity root signs, and the owner's
  key-agreement public key is read from its own unlocked session, because
  the daemon publishes public keys only for sessions the person opened.
  `homeId` and the host signing fingerprint are read from the Foundation's
  claim state rather than passed in, since a mistyped one would produce a
  signed record the Home then rejects.

  `rotate-domain` and `grant-reader` are implemented on the same pattern but
  take the signed domain record as a file. They have to: `GET .../domains`
  answers with a view carrying no signature and no key records, so the
  Foundation cannot hand back what a later ceremony needs. **The owner holds
  their own records**, and losing them means the domain cannot be rotated or
  granted against again. Nothing else in the design states that, and no tool
  stores them yet.

  `grant-reader` now completes: the ADR 0089 transport seam is filled by a
  local checkpoint inbox, and the four commands a reader chain needs -
  `issue-membership`, `delegate-device`, `open-identity-session` and
  `publish-checkpoint` - exist. `rotate-domain` is still correctly refused
  with `invalid_rotation_causes` on a domain whose readers have not been
  revoked, which is ADR 0088 working rather than a gap.
- **C3 - No person key in the client: Done.** The CLI holds no private key;
  both signatures cross the socket. Proven negatively rather than asserted:
  with no session unlocked the ceremony fails with
  `claim_signer_not_unlocked` even though the client can see the keyfile,
  because it has no passphrase and no way to open it.
- **C4 - Refusal fidelity: Done.** A Foundation rejection surfaces its
  status and `error` unchanged with no retry; a wrong Move-In Code fails as
  `foundation_rejected:401 ... Move-In Code is invalid.` and leaves the Home
  unclaimed. Retrying would either replay a spent Move-In Code or hide the
  reason.
- **C5 - Executing test: Done.** `claim-ceremony.test.ts` runs a real
  Foundation process and a real Vault daemon process together, founds a Home
  across them and then creates a reader-custody domain inside it - the first
  test to exercise a product path rather than a unit, and the first to prove
  the deployment shape (Vault on the person's machine, Foundation in the
  Home, meeting only over HTTP carrying finished records). Founding costs two
  approvals and the domain a third, all on the identity terminal; the
  agreement key is used but signs nothing.

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

- a person can found a Pico Home for the first time, which every signed
  record above it depends on and which no tool could do before;
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
