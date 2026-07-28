# 0101 - Daemon-Side KEK Ceremony Families and Ceremony Approval

## Status

Accepted and implemented as the first two ceremony-execution families on the
ADR 0097 contract: reader-custody **domain creation** and **KEK rotation**
now run inside the Vault daemon, under exactly one approval each, bound to
the digest of the exact request the consumer sent. Fresh KEKs are therefore
born inside the boundary instead of in whichever process runs the ceremony,
and a rotation costs the person one decision instead of one per remaining
reader plus one. The single-session lifecycle of ADR 0097 is untouched. It
is not a multi-session daemon, not a generic ceremony-execution service, and
not a migration of the two-role ceremonies - those are named, with their
driver, for the next fork.

## Context

ADR 0100 migrated ceremony *signing* and measured two things that shape this
ADR. First, per-envelope signing makes approval count scale with reader and
history count: a rotation over R readers costs R+1 sequential approvals,
each showing a near-identical label-and-digest prompt. Second, the
KEK-touching ceremonies could not move at all, because raw KEKs must never
cross the boundary and a generic unwrap family is structurally refused.

The handoff carried the blocker as a dichotomy: either introduce multiple
concurrently unlocked sessions (changing the ADR 0097 lifecycle boundary),
or let ceremony families open a second key ceremony-locally. Measurement
dissolved half of it. The two ceremonies with the approval-load problem -
domain creation and rotation - need **no second key at all**: both generate
a *fresh* KEK (`randombytes_buf`) and seal it to reader *public* keys; the
only private key they touch is the identity root the daemon already holds
unlocked. The genuinely two-role ceremonies are reader grants (root plus
owner agreement key, to unwrap historical KEKs and re-seal them) and item
encryption (owner agreement plus writer signing). Their approval load is
real too - a grant with history costs one approval per historical version
plus one - but their migration requires a decision about concurrent
sessions that deserves its own ADR with these ceremonies as its concrete
driver, rather than being smuggled in underneath this one.

The ceremony-local-second-key alternative is rejected outright, not
deferred: the daemon opening a keyfile without the person would be silent
re-unlock (ADR 0097 forbids it), and carrying a passphrase on a consumer's
ceremony request would put passphrases on a surface that ADR 0097
deliberately restricts to the person's own unlock act.

## Scope

Covers: the `ceremony.create-domain` and `ceremony.rotate-domain` families;
ceremony approval semantics and their binding; where the ceremony input
digest comes from; what the person is shown; KEK birth inside the boundary;
and the interaction with the existing approval machinery, which generalizes
from "an approved signature" to "an approved action".

Does not cover: reader grants, item encryption or any two-role ceremony;
more than one concurrently unlocked session; batch or remembered approvals;
rendering; any unwrap, export or raw-key family; `SO_PEERCRED`,
platform-keystore unlock, packaging or network surfaces; and any change to
record formats or verification rules - the daemon calls the same
`@pico/vault` functions a local composition calls, and verifiers cannot
tell the difference.

## Decision

### Two ceremony families, executed where the keys already are

`pico.vault.daemon.ceremony.create-domain.v1` and
`pico.vault.daemon.ceremony.rotate-domain.v1` carry the same parameters the
library functions take - scalars validated structurally at the wire, records
passed through opaquely, because `@pico/vault` is the single authority that
verifies signatures, scope and lifecycle, and a second validator at the
socket would be a second place to disagree with it.

On approval, the daemon executes `createPicoReaderCustodyDomain` or
`rotatePicoReaderCustodyDomain` against its own unlocked `pico_identity`
session and returns the resulting record. Every signature the ceremony
needs happens inside the boundary with no per-signature approval - the
ceremony approval covered them, and the library's label-checked signing
(ADR 0081 V4) still applies unchanged. The fresh KEK is generated, sealed
and zeroized inside the daemon process; sealed envelopes and signed records
are the only things that cross outward. Raw key material now has one fewer
birthplace outside the boundary.

The wire `sign` path for the same record labels stays exactly as ADR
0099/0100 left it: individually gated. A consumer that prefers the hybrid
path may keep using it; the ceremony families are the path that makes the
approval cost honest.

### One ceremony, one approval, bound to the exact request bytes

A ceremony approval reuses the ADR 0099 machinery - same single pending
slot, same window, same `approval.wait`/`approval.decide` families, same
holder-only decision rule, same fail-closed behaviour on timeout, hold
loss, session lock, shutdown and consumer loss. What changes is the
binding: the digest is BLAKE2b-256 over the **exact frame body the
consumer sent**, request id included.

That choice is deliberate. An "upfront canonical ceremony layout" was
considered and rejected: it would have re-invented per-family
canonicalization for inputs that embed whole signed records, and its only
advantage - digest stability across retries - is an anti-feature, because
an approval must authorize one request instance, not a class of equivalent
ones. Frame bytes are what the consumer actually asked; the consumer can
compute the identical digest from what it wrote; and a decision captured
for one request can never be replayed onto another, because even an
identical retry differs in request id.

The approval descriptor gains a `summary`: a few scalar fields echoed
verbatim from the request (domain id, home id, and for rotation the new
KEK version and remaining-reader count). This is input echo, not
interpretation - the fields are covered by the digest the person confirms -
so it adds real information without pretending to be the rendering layer
ADR 0099 declared future.

### What this does to approval load, stated with numbers

| Ceremony | Approvals before | Approvals now |
|---|---|---|
| domain creation | 2 (record + self-envelope) | 1 |
| rotation over R remaining readers | R + 1 | 1 |
| reader grant with V historical versions | V + 1 | unchanged (V + 1) - next fork |
| item encryption | 0 (exempt) | unchanged |

The unchanged rows are the honest remainder: reader grants keep both their
approval scaling and their in-process owner agreement key until the
multi-session ADR. That ADR now has a measured, concrete driver instead of
a hypothetical one.

### Approved actions, not approved signatures

Internally, the pending-approval state generalizes from "these signature
bytes, to be signed on approval" to "this action, to be run on approval" -
signature completion and ceremony execution are the two actions. Nothing
about the wire changes for the existing signature path; the audit stream
distinguishes ceremonies (`ceremony_requested` / `ceremony_completed` /
outcome-carrying failures) from plain signatures, content-free as always.

## Gates

- **K1 - Root-only measurement and fork resolution: Done.** Domain creation
  and rotation proven root-only (fresh KEK, public seals); the
  ceremony-local second key rejected as silent re-unlock; multi-session
  named as the next fork with reader grants as its driver.
- **K2 - Ceremony families: Done.** Both families parse structurally, pass
  records opaquely, require an unlocked `pico_identity` session, execute
  the unchanged library functions daemon-side and return their records;
  raw KEKs are generated and zeroized inside the boundary.
- **K3 - Ceremony approval: Done.** One pending approval, frame-byte
  digest binding with request id included, verbatim scalar summary,
  holder-only decision, and every ADR 0099 fail-closed path inherited by
  the generalized approved-action machinery.
- **K4 - Tests: Done.** Real-crypto coverage: a one-approval domain
  creation whose record then carries a locally signed writer grant; a
  one-approval rotation whose record is accepted by downstream validation;
  denial, no-watcher and wrong-role refusals; digest-mismatch rejection;
  and the audit distinguishing ceremony from signature approvals.
- **K5 - Future (each its own decision):** the multi-session unlock
  lifecycle and, on top of it, reader-grant and item-encryption ceremony
  families; migration of `apps/core` ceremony callers; everything ADR 0097
  D7, 0099 P7 and 0100 C5 already list.

## Non-goals

- reader grants, item encryption or any ceremony needing two private keys;
- a second concurrently unlocked session or any hold-lifecycle change;
- generic ceremony execution, scripting or batching on the daemon;
- unwrap, export or any raw-key-material family, in any direction;
- approval batching, remembered decisions or rendering;
- changes to record formats, canonical bytes or verification rules;
- any network, remote or Pico Link surface.

## Consequences

Positive:

- rotation - the most security-relevant recurring ceremony - drops from
  R+1 near-identical prompts to one meaningful decision, removing the
  blind-approval reflex ADR 0099 worried about where it was worst;
- fresh KEKs for domains and rotations are born and die inside the
  boundary; consumer compromise during those ceremonies no longer observes
  key material at all;
- the approval machinery generalized without changing the wire for
  existing clients, and the 0099 negative suite carries over wholesale;
- the next fork (multi-session) starts from measured need.

Negative and residual:

- reader grants keep their V+1 approval scaling and their local owner
  agreement key until the next ADR - the gap is now the named driver, but
  it is still a gap;
- a rotation request embeds full record sets and must fit the 128 KiB
  control frame; dozens of readers fit, hundreds would not - a bound, not
  a cliff, and stated;
- the person approves a summary plus a digest, still not a rendered
  statement;
- ceremony execution runs synchronously on the daemon's event loop;
  these functions are fast (no KDF), but a pathological record set delays
  other connections for its duration.

## Relationship to other ADRs

- Extends the ADR `0097` contract with its first ceremony-execution
  families and keeps its lifecycle, framing and single-session rules
  untouched; the no-unwrap stance of ADR `0098`/`0100` is restated and
  relied on.
- Generalizes the ADR `0099` approval machinery to approved actions while
  inheriting its binding, its single-pending rule and its fail-closed
  paths; per-signature approval remains the rule everywhere outside an
  approved ceremony.
- Completes the ADR `0100` C5 direction for the root-only half of the KEK
  ceremonies and sharpens its remainder into a concrete next fork.
- Leaves ADR `0086`/`0088` record semantics byte-identical: the daemon
  runs the same library functions, and no verifier can tell where a
  domain or rotation was created.

## References

- [ADR 0081](0081-pico-vault-person-role-key-custody-threat-model-and-direction.md)
- [ADR 0086](0086-reader-custody-authority-and-opaque-storage.md)
- [ADR 0088](0088-reader-custody-multi-reader-and-kek-rotation.md)
- [ADR 0097](0097-deployable-vault-process-and-local-ipc-authority-boundary.md)
- [ADR 0099](0099-hold-channel-approval-for-authority-creating-signatures.md)
- [ADR 0100](0100-identity-ceremony-signing-over-the-vault-daemon.md)
