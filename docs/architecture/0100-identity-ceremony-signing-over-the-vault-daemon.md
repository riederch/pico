# 0100 - Identity Ceremony Signing over the Vault Daemon

## Status

Accepted and implemented as the migration of ceremony **root signing** onto
the ADR 0097 daemon: every Vault ceremony function now accepts a structural
detached signer in place of an in-process identity or writer signing
session, and `@pico/vault-daemon` supplies that signer over the socket —
blocking, approval-aware and bound to one expected key. The identity root
private key therefore no longer needs to exist in any consumer process for
any ceremony the runtime can perform today. Key-agreement operations
(KEK unwrap and re-seal) deliberately stay inside the local Vault library,
with their daemon migration named as future work rather than half-built
here. It is not a multi-session daemon, a ceremony-execution service, a
rendering layer or a network surface.

## Context

ADRs 0097-0099 built the process boundary, its first consumer and its
approval layer. What still runs on embedded `@pico/vault` is everything that
*creates* records: reader-custody domains, grants, revocations, rotations,
items, sync batches, freshness checkpoints and share envelopes. Each of
those holds the person's identity root - the key whose compromise is
identity compromise (ADR 0081) - in the consumer's own memory.

Before designing anything, the actual shape of the problem was measured
rather than assumed, because the handoff carried two open questions whose
answers depend on it:

1. **What do ceremonies need from a signing session?** Exactly two members:
   `metadata()` and `sign()`. No ceremony passes clocks into signing, locks
   through it or exports from it. The signing dependency is therefore an
   interface already satisfied by `PicoVaultSession`, and widening the
   parameter types is a compile-time change with zero runtime delta.
2. **How many gated signatures does one ceremony produce?** More than the
   record count, and this correction came from the end-to-end test rather
   than from reading: **every share envelope is individually signed**
   (`pico.share.envelope.v1`) on top of the record that carries it. Domain
   creation costs two (record plus owner self-envelope); a reader grant
   costs two (its envelope plus the grant record); a rotation costs one per
   remaining reader's envelope plus the rotation record. The chain this
   ADR's tests drive - domain, writer grant, reader grant, item, sealed
   batch - costs five approvals, because the item signature and the sync
   manifest are exempt. The approval storm is therefore real and scales
   with reader count, which is the single most important input to the
   decision below.
3. **Which ceremonies need a second key role?** Reader grants, rotations
   and item encryption also need the owner's `device_key_agreement` key -
   not for signing, but to unwrap and re-seal raw KEKs. Those bytes are
   exactly what the standing invariant says must never leave the Vault
   boundary.

## Scope

Covers: the structural detached-signer seam in `@pico/vault`; the
daemon-backed ceremony signer, its verification and its timeout posture;
the approval-load decision for multi-signature ceremonies; the status-family
extension that publishes the unlocked session's public key; and the honest
boundary of what migrates now versus what is named for later.

Does not cover: daemon-side ceremony execution or KEK ceremony families;
more than one concurrently unlocked daemon session; approval batching or
rendering (ADR 0099 non-goals unchanged); recovery; `SO_PEERCRED`,
platform-keystore unlock, packaging or any network surface; and any change
to record formats, verification rules or the ADR 0098/0099 families.

## Decision

### The seam is a structural signer, not a ceremony service

`@pico/vault` gains one interface:

```ts
interface PicoVaultDetachedSigner {
  metadata(): PicoVaultSessionMetadata;
  sign(signatureInput: Uint8Array): Uint8Array;
}
```

Every ceremony parameter that only signs - the identity root on
checkpoints, domains, grants, revocations, rotations and sync batches, and
the writer key on items - widens from `PicoVaultSession` to this interface.
`PicoVaultSession` satisfies it structurally, so every existing caller and
test compiles unchanged; the label-checked signing rule (ADR 0081 V4) keeps
being enforced by whichever implementation sits behind the interface, and
over the daemon a second time by the wire's own label classification.

The rejected alternative was a per-ceremony daemon family
(`create-domain`, `rotate`, ...) executing the whole ceremony inside the
daemon. It is not wrong - it is where the KEK-touching ceremonies must
eventually go, and the reasons are recorded below - but as the *first* step
it would have duplicated every ceremony's input validation into wire
schemas, grown the daemon by a family per ceremony, and still not solved
the two-role problem, because a daemon holding one unlocked session cannot
serve a ceremony that needs two keys. The signer seam gets the root out of
consumer memory today with a fraction of that surface.

### Sequential single approvals stay - and the cost is stated, not hidden

Per-envelope signing means a rotation over five readers asks the person six
times. That is bad, and it is tempting to fix it here. It is not fixed here,
because every way to fix it *from outside the boundary* is worse than the
problem:

- an upfront ceremony approval cannot bind to signature digests, because
  the envelope bytes do not exist yet - fresh KEKs and sealed wraps are
  produced while the ceremony runs. "Approve these exact bytes" is
  structurally impossible before execution, and ADR 0099's whole guarantee
  is that binding;
- the fallback - approving a label set plus a count for a window - is
  precisely the time-scoped, steerable grant ADR 0099 refused to create,
  and it would be strictly weaker than what exists today;
- suppressing the prompt for envelopes specifically would exempt
  `pico.share.envelope.v1`, which distributes domain keys to readers. That
  is authority distribution; exempting it to reduce clicking would trade
  the exact property this layer exists for.

So each root signature is approved individually, in order, bound to its own
digest. The honest reading is that this makes multi-reader rotation
unpleasant enough that it argues for the next step rather than against this
one: once a ceremony runs *inside* the boundary as a daemon-side family,
one approval can bind to the digest of the ceremony's canonical input, and
the signatures it then produces never cross a trust boundary at all. One
human decision per ceremony becomes both possible and honest. That is the
named future shape (C5), and building half of it here - a batch approval
that cannot name what it authorizes - would have been the wrong half.

### Key-agreement operations do not migrate, and saying so is the point

Reader grants, rotations, item encryption and batch opening unwrap raw
KEKs. Raw KEKs, DEKs and custody plaintext never leave the Vault boundary -
that invariant predates the daemon and survives it. A generic `unwrap`
family would hand raw KEKs to consumers and is therefore not merely
deferred but structurally refused, exactly like a generic key-export family.
ADR 0110 later adds one deliberately non-generic exception: separately
approved Recovery Card issuance of the identity root.

Consequently those ceremonies run hybrid today: their root signature goes
over the daemon, their KEK handling runs in the local `@pico/vault` library
against a locally opened `device_key_agreement` keyfile - unchanged from
yesterday. What this block ends is the identity root living in consumer
processes; what it leaves in place, it leaves in place loudly: the owner
agreement key still lives where the ceremony runs, until daemon-side
ceremony families (with their one-approval-per-ceremony model) migrate the
KEK path whole.

### The daemon ceremony signer

`createPicoVaultDaemonCeremonySigner` opens its own blocking transport
(the ADR 0098 worker bridge) and returns the structural signer plus a
`close()`:

- **Bound to one expected key.** The caller states the expected key role
  and fingerprint; the signer verifies them against the daemon's unlocked
  session before returning, refuses `device_key_agreement` (nothing to
  sign), and rechecks the echoed role and fingerprint on every signature
  response. A signer can never silently start signing with a different key
  than the one it was created for.
- **Real metadata.** Ceremonies embed the signer's public key into records
  (`keyRecordFromMetadata`), so the `status` family now includes the
  unlocked session's `publicKeyHex` - public by definition (the ADR 0079
  public surface), readable only while the session is unlocked, and the
  ADR 0097 status wording is updated accordingly.
- **Approval-aware timeout.** Gated signatures park until the person
  decides; the signer's per-request timeout must therefore exceed the
  ADR 0099 approval window. The default is ninety seconds against the
  sixty-second window, configurable but floored above the window so a
  misconfigured consumer cannot convert "the person is deciding" into a
  transport error.
- **Blocking is the intended UX.** A ceremony is a person-initiated act;
  the consumer thread waiting inside `sign()` while the person reads the
  prompt is the correct behaviour, not an accident. Consumers with an
  interactive thread run ceremonies off it - the ADR 0098 consequence
  restated.
- **Denial is a named outcome.** `approval_denied`, `approval_unavailable`
  and `vault_locked` surface to the ceremony caller as thrown errors with
  their wire reasons intact; a denied founding record fails the ceremony,
  it does not retry.

### What can run over the daemon today

| Ceremony | Root/writer signature over daemon | Local key still required |
|---|---|---|
| freshness checkpoint (ADR 0085) | yes - exempt, no approval | none |
| sync batch creation (ADR 0089) | yes - exempt, no approval | none (payload seal is a public-key operation) |
| writer grant / both revocations | yes - one approval each | none |
| domain creation | yes - two approvals | none (KEK is generated and sealed locally today; moves with the future ceremony families) |
| share envelope issuance (ADR 0084) | yes - one approval | none |
| claim / founding records (ADR 0080) | yes, when a claimant runtime exists - the families are served and gated already | none |
| reader grant, rotation | root signature yes - one approval | owner `device_key_agreement` (KEK unwrap/re-seal) |
| item encryption | writer signature yes - exempt | owner `device_key_agreement` (KEK unwrap) |
| batch open / item decrypt | n/a | served by the ADR 0098 lease |

## Gates

- **C1 - Structural signer seam: Done.** `PicoVaultDetachedSigner` is
  exported; all signing-only ceremony parameters are widened; no runtime
  behaviour, record byte or test changes; `PicoVaultSession` satisfies the
  interface structurally.
- **C2 - Daemon ceremony signer: Done.** Own blocking transport, expected
  role and fingerprint verified at creation and on every response,
  `device_key_agreement` refused, metadata served from the extended status
  family, approval-floored timeout, close path.
- **C3 - Approval-load decision: Done.** Sequential per-signature approvals
  retained; ceremony-batch approval rejected with the digest argument
  recorded; per-envelope signing measured (five approvals for the tested
  chain, one per remaining reader for a rotation) and its cost stated; the
  future ceremony-approval shape is named for the KEK ceremony families.
- **C4 - End-to-end ceremonies: Done.** Real-crypto coverage runs a full
  chain against a daemon child process with a scripted `pico-vault unlock`
  approver: an exempt checkpoint without any approval, a gated
  domain -> writer grant -> item -> sealed batch chain approved on the hold
  terminal whose records then verify and decrypt through the existing
  reader path, a denial that fails the ceremony with `approval_denied`, and
  a signer refused against a locked daemon.
- **C5 - Future (each its own decision):** daemon-side KEK ceremony
  families with one-approval-per-ceremony input-digest binding — **ADR
  0101 discharges this for the root-only half** (domain creation and
  rotation); more than one concurrently unlocked session per daemon, which
  the remaining two-role ceremonies will force; migration of the
  Foundation-side ceremony callers as their deployment shapes appear;
  everything ADR 0097 Gate D7 and ADR 0099 P7 already list.

## Non-goals

- executing ceremonies inside the daemon, and any KEK or unwrap family;
- a second concurrently unlocked session, or any weakening of the
  hold-bound single-session lifecycle;
- approval batching, rendering or policy (ADR 0099 boundaries unchanged);
- changes to record formats, canonical bytes or verification rules;
- migrating `apps/core` intake paths, which already consume externally
  signed records and needed no change;
- any network, remote or Pico Link surface.

## Consequences

Positive:

- the identity root private key no longer has to exist in any consumer
  process for any currently buildable ceremony - the ADR 0081 root
  minimization now holds at process granularity, with approval in front of
  every authority-creating root signature;
- the seam is one interface and one adapter: no wire schema per ceremony,
  no duplicated validation, and existing callers compile unchanged;
- claim and founding gain their custody story before their runtime exists,
  instead of after;
- the signature counts are now measured rather than assumed - the
  end-to-end test corrected this ADR's own first reading of them - so the
  next ADR argues from data.

Negative and residual:

- the owner agreement key still lives in the process that runs reader
  grants, rotations and item encryption - stated, bounded, and the
  explicit target of the named ceremony-family work;
- approval count scales with envelopes, so a multi-reader rotation asks
  once per remaining reader plus once for the rotation record; until the
  ceremony families land, that is a real usability cost on the most
  security-relevant ceremony there is;
- prompts carry labels and digests rather than a rendered statement -
  fidelity remains the ADR 0099 rendering gap, and it bites hardest when
  five near-identical envelope prompts arrive in a row;
- a blocking signer holds its consumer thread for up to the approval
  window per signature;
- the daemon signer serializes: one connection, one in-flight request, one
  pending approval daemon-wide - concurrent ceremony runners queue.

## Relationship to other ADRs

- Executes the consumer-migration direction of ADR `0097` for the signing
  path and extends its `status` family with the unlocked session's public
  key; framing, lifecycle and audit rules are untouched.
- Composes with ADR `0098` (the same bridge, a second use) and ADR `0099`
  (every gated ceremony signature flows through hold-channel approval,
  bound to its exact bytes).
- Realizes ADR `0081` V4/V5 at process granularity for the root and keeps
  V8 intact - no unwrap or export family exists, and the KEK invariant is
  restated as structural, not deferred.
- Serves the ADR `0079`/`0080`/`0084`/`0085`/`0086`/`0088`/`0089` record
  families unchanged; verifiers cannot tell a daemon-signed record from a
  library-signed one, which is the compatibility claim in its entirety.

## References

- [ADR 0081](0081-pico-vault-person-role-key-custody-threat-model-and-direction.md)
- [ADR 0084](0084-controller-signed-host-custody-share-envelope-issuance.md)
- [ADR 0097](0097-deployable-vault-process-and-local-ipc-authority-boundary.md)
- [ADR 0098](0098-reader-access-lease-over-the-vault-daemon.md)
- [ADR 0099](0099-hold-channel-approval-for-authority-creating-signatures.md)
