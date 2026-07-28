# 0102 - Multi-Session Unlock and Two-Role Ceremonies

## Status

Accepted and implemented as the unlock-lifecycle change ADR 0101 named as
its remaining fork: the daemon now holds several concurrently unlocked
sessions, keyed by key fingerprint, each held and locked by its own
connection. On top of it, `ceremony.create-reader-grant` executes the first
genuinely two-role ceremony inside the boundary under one approval, which
removes the last per-envelope approval scaling and takes the owner's
key-agreement key out of consumer processes. Every key use now names the key
it wants; implicit "the unlocked session" no longer exists anywhere on the
contract. Item encryption is deliberately not migrated, for reasons recorded
below rather than left implicit.

## Context

ADR 0097 built the unlock lifecycle around exactly one unlocked session,
hold-bound to the terminal that opened it. That was right for a contract
with one consumer. ADR 0098 added a reader lease, ADR 0100 a ceremony
signer, ADR 0101 daemon-side domain and rotation ceremonies - and each of
those needed exactly one key, so the single session held.

Reader grants do not. They need the identity root to sign the grant and the
owner's key-agreement key to unwrap historical KEKs and re-seal them to the
new reader. ADR 0101 measured what that costs today: one approval per
historical version plus one for the grant record, with the agreement key
sitting in whichever process runs the ceremony. Both problems have the same
cause, and neither can be fixed without the daemon being able to hold two
keys at once.

The alternative ADR 0101 already rejected - letting a ceremony open the
second keyfile itself - stays rejected: the daemon opening a keyfile without
the person is silent re-unlock, and carrying a passphrase on a consumer's
request would put passphrases on a surface ADR 0097 restricts to the
person's own unlock act.

## Scope

Covers: the multi-session unlock lifecycle and its locking rules; explicit
key selection across the contract; which holder approves what; the
`ceremony.create-reader-grant` family; and the interaction of all of this
with the ADR 0098 lease and the ADR 0101 ceremonies.

Does not cover: item encryption (see the recorded reasoning); unlocking
without a person; any weakening of hold-bound locking; `SO_PEERCRED`,
platform-keystore unlock, packaging or network surfaces; approval batching
or rendering; and any change to record formats or verification rules.

## Decision

### Sessions are keyed by fingerprint, not by role

The daemon holds a bounded map of unlocked sessions keyed by
`keyFingerprintHex`. Keying by *role* was the obvious alternative and is
wrong for a real case: one person is frequently both the domain owner and a
reader on the same machine, so two distinct `device_key_agreement` keys need
to be unlockable at once. A role-keyed map would forbid that for no reason
other than its own convenience. Fingerprints are what keyfiles are already
identified by, everywhere else on this contract.

The map is capped (four concurrent sessions). The cap exists so the
lifecycle stays small and reviewable, not because more would be unsafe;
`too_many_unlocked_sessions` says so plainly rather than pretending a
security rationale.

### Hold stays per session; only shared causes lock everything

Each unlock is held by the connection that performed it, and closing that
connection locks that session and no other. Idle and maximum-duration
bounds are per session, because each was opened at its own instant by its
own act. The causes that are properties of the machine rather than of a key
- suspend detection, wall-clock rollback and daemon shutdown - lock every
session at once.

This keeps the ADR 0097 promise intact per key: closing the terminal is
still locking, and a person watching one terminal is never misled about
another key's state. The observable consequence is that unlocking two keys
means two terminals, which is honest about what is unlocked.

### Every key use names its key

`sign` gains a required `keyFingerprintHex`; the ceremony families name
their signer and, where applicable, their agreement key; `reader-access`
already named its reader key. Nothing on the contract selects a key
implicitly any more.

This is a deliberate breaking change to a local, unpublished contract
(ADR 0097 reserves exactly that), and it is a security improvement rather
than a mechanical consequence. The obvious cheaper option - "if exactly one
session is unlocked, use it" - would mean a consumer that behaves correctly
today silently signs with a different key tomorrow, the moment the person
unlocks a second one. A wrong-key signature is precisely the failure this
layer exists to prevent, so the contract refuses to guess: an unknown or
locked fingerprint fails with `unknown_unlocked_key`, never with a
substitute.

### The signing key's holder approves

An approval is raised on the hold connection of the session whose key
creates the authority - the signer. Not any holder, and not every holder
whose key the action touches.

The alternative of requiring each involved holder to approve would restore
the multi-prompt problem this ADR exists to remove, in a new shape. The
alternative of accepting a decision from any hold connection would break
the property that the person holding *this* key decided what *this* key
signs.

For a two-role ceremony this means the identity root's holder approves,
while the agreement key's holder does not. That follows the ADR 0099
principle rather than bending it: approval gates **the creation of new
signed authority**, and the agreement key does not create any - it unwraps
a KEK its owner already holds and re-seals it, which is use of a capability
the person deliberately unlocked. The grant record that *does* create
authority is signed by the root, and that is what the person approves.

### `ceremony.create-reader-grant`

The family takes the signer and agreement fingerprints plus the parameters
`createPicoReaderCustodyReaderGrant` already takes, and on approval runs
that unchanged library function inside the daemon against both sessions.
The historical KEKs it unwraps and the envelopes it seals never leave the
boundary; the signed grant record is the only thing that crosses outward.

The approval count for a grant with V historical versions therefore drops
from V+1 to one, which was the last place where per-envelope signing was
visible to the person.

### Item encryption is not migrated, and why

`encrypt-item` would need the agreement key and the writer key, so it fits
the machinery this ADR builds. It is still deferred, for two reasons worth
stating rather than leaving as an omission:

1. **There is no approval win.** The item signature is on the ADR 0099
   exempt list, so item encryption costs zero approvals today and would
   cost zero after migrating. The only gain is moving the agreement key.
2. **It would carry plaintext inward**, which is a new direction for the
   contract. Every plaintext crossing so far has been a crypto *result*
   travelling outward (ADR 0098). Accepting plaintext as ceremony *input*
   needs its own analysis of frame budget, audit and what a compromised
   consumer gains, and that analysis belongs in the ADR that does it.

## Gates

- **M1 - Multi-session lifecycle: Done.** Bounded fingerprint-keyed session
  map; per-session hold, idle and duration; global suspend, rollback and
  shutdown locking; per-session lease and approval teardown; status lists
  every unlocked session.
- **M2 - Explicit key selection: Done.** `sign` requires
  `keyFingerprintHex`; ceremonies name signer and agreement keys; unknown
  or locked fingerprints fail with `unknown_unlocked_key` and never
  substitute another key.
- **M3 - Approval routing: Done.** Approvals are raised on the signing
  session's hold connection, decided only there, and denied when that
  session locks; every ADR 0099 fail-closed path is preserved per session.
- **M4 - Two-role ceremony: Done.** `ceremony.create-reader-grant` runs
  daemon-side against two sessions under one approval, with KEK unwrap and
  re-seal inside the boundary.
- **M5 - Tests: Done.** Real crypto covers two concurrent sessions, a
  one-approval reader grant whose envelopes the reader key actually opens,
  per-session locking isolation, wrong-key and locked-key refusals,
  approval routed to the signer's holder rather than another holder, and
  the session cap.
- **M6 - Future:** `ceremony.encrypt-item` with its plaintext-inward
  analysis; `apps/core` caller migration; everything ADR 0097 D7, 0099 P7,
  0100 C5 and 0101 K5 still list.

## Non-goals

- item encryption, or any ceremony carrying plaintext into the daemon;
- unlocking without the person, cached unlock or session persistence;
- per-role or per-binary authority, `SO_PEERCRED`, platform keystores;
- approval batching, remembered decisions or rendering;
- changes to record formats, canonical bytes or verification rules;
- any network, remote or Pico Link surface.

## Consequences

Positive:

- the owner's key-agreement key leaves consumer processes for the reader
  grant path, closing the last routinely used custody gap on this contract;
- reader grants cost one approval regardless of history depth, so the
  per-envelope scaling ADR 0100 measured is no longer visible anywhere;
- key selection is explicit contract-wide, removing a class of silent
  wrong-key faults that multi-session would otherwise have introduced;
- the lifecycle generalized without loosening any lock: every ADR 0097
  cause still fires, now with the right scope.

Negative and residual:

- unlocking two keys means two terminals and two approval channels; the
  person carries that until a UX layer exists;
- `sign` is a breaking wire change for any existing consumer, which is
  acceptable only because this contract is explicitly local and unpublished;
- item encryption keeps the agreement key in the writing process;
- more concurrently unlocked keys means more material in daemon memory at
  once - bounded by the cap and by per-session idle locking, but real, and
  the endpoint-compromise honesty of ADR 0081 is unchanged.

## Relationship to other ADRs

- Extends the ADR `0097` unlock lifecycle from one session to a bounded
  set while preserving hold-bound locking, restart-starts-locked and every
  named lock cause; the wire remains strict request/response.
- Discharges the ADR `0101` K5 fork for reader grants and inherits its
  ceremony pattern, frame-digest approval binding and audit shape.
- Applies the ADR `0099` gating principle to decide who approves a
  two-role ceremony, and preserves its single-pending-approval rule.
- Leaves the ADR `0098` lease semantics unchanged; a lease now binds to
  its own session and ends when that session locks.
- Leaves ADR `0086`/`0088` record semantics byte-identical - the daemon
  runs the same library function a local composition would.

## References

- [ADR 0081](0081-pico-vault-person-role-key-custody-threat-model-and-direction.md)
- [ADR 0088](0088-reader-custody-multi-reader-and-kek-rotation.md)
- [ADR 0097](0097-deployable-vault-process-and-local-ipc-authority-boundary.md)
- [ADR 0098](0098-reader-access-lease-over-the-vault-daemon.md)
- [ADR 0099](0099-hold-channel-approval-for-authority-creating-signatures.md)
- [ADR 0101](0101-daemon-side-kek-ceremony-families-and-ceremony-approval.md)
