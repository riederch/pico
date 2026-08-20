# 0106 - Approval Rendering from the Signed Bytes

## Status

Accepted and implemented. ADR 0105 B4 named this a precondition for the
avatar product form; the `sign` family now takes a label and fields, the
daemon rebuilds the canonical bytes and renders the statement from them,
and every caller - the CLI ceremonies, the ADR 0100 signer adapter and the
`@pico/vault` ceremony functions behind it - has been migrated.

## Context

A person approving a signature currently sees a family name, a key
fingerprint and a BLAKE2b digest. ADR 0099 recorded a rendered statement as
future work and was right to ship without one: a terminal is used by
someone technical, and the digest is checkable against what a consumer
printed.

The `summary` field added by ADR 0101 does not close this, and says so in
its own definition: *"verbatim scalar echo from a ceremony request (already
covered by the digest) - input echo, never interpretation"*. It is what the
caller claims, not what the bytes say. The digest binds the bytes; nothing
binds the display to them. A compromised consumer can present a harmless
sentence and have the person authorize different bytes - the classic
what-you-see-is-not-what-you-sign gap, currently held shut only by the
person being able to read a digest.

ADR 0105 removes that assumption. An avatar asks people who cannot check a
digest, so the displayed statement has to be derived from the same bytes
the key signs, or it is worse than showing nothing.

## Scope

Covers: where an approval's displayed statement comes from and what
guarantees it. Does not cover: wording, translation, avatar presentation,
the ADR 0099 approval binding (unchanged), the exempt list (unchanged), or
anything about which key signs what.

## Decision

### `sign` takes structured fields, not opaque bytes

The signing request carries the label and the record's fields. The daemon
rebuilds the canonical bytes with the same `build…SignatureInput` function
the rest of the system uses, renders its statement from those fields, and
signs the bytes it built.

Display and signature therefore have one source. There is no path by which
the person sees one thing and the key signs another, because the daemon
never signs bytes it did not construct.

### The alternative - parsing the bytes - is rejected

The daemon already reads the first canonical element to get the label
(`firstCanonicalElementAscii`), and `concatCanonicalElements` is
length-prefixed, so the rest could be split out the same way. That was the
obvious cheaper option and is worse.

Splitting yields positional byte strings with no field names, so the daemon
would need a per-label table mapping positions to meanings - a second copy
of knowledge that already exists in the builders, kept in sync by hand,
where drift produces a *confidently wrong* sentence rather than an error.
Rebuilding uses the one definition there is, and a mismatch is impossible
rather than merely unlikely.

### Signing narrows to well-formed records

A consequence worth stating because it is a change in what the daemon will
do: it can no longer sign arbitrary bytes that happen to start with a known
label. It signs records it can build, which is strictly less. That is a
tightening, and it is the point - an unrenderable record is one nobody
could have meaningfully approved.

### Exempt families are unaffected

The ADR 0099 exempt families raise no approval and need no statement.
They keep working as they do, and this ADR does not widen or narrow that
list.

## Gates

- **R1 - Structured sign: Done.** `sign` accepts `{label, fields}`. The
  daemon rebuilds with the shared builders and refuses an unknown label
  (`unknown_signature_input_label`), fields the builder rejects
  (`invalid_signature_input_fields`) and a gated label without a renderer
  (`unrenderable_signature_input`), each without raising an approval.
- **R2 - Renderers: Done.** `sign-rendering.ts` holds one builder entry per
  signable label and one statement per gated label - fourteen sentences
  naming what changes and for whom, with fingerprints shortened for the eye
  while the digest keeps binding the exact bytes.
  **Three things in those sentences were not rendered from anything**
  (2026-08-20). The fingerprint shortening was this file's own rule rather
  than the product's, so the same key arrived twice under two names in one
  approval body - the statement from here, the signing key appended by the
  companion shell (ADR 0079 I5, now `@pico/protocol/fingerprint-display`).
  Deadlines went in raw, so a sentence read `until 2027-08-01T10:00:00.000Z`
  while the window confirming that ceremony said `2027-08-01`
  (`@pico/protocol/when-display`). And two sentences said `48-hour veto
  delay` as a literal, in the same app as the code that refuses a claim whose
  `effectiveAt - acceptedAt` is not exactly
  `picoHomeDeviceRecoveryTiming.vetoDelayMs`.

  The last one is the sharpest reading of what this gate is for. A statement
  is meant to be rendered from what the record says; a number inside it that
  no record supplies is the one part of the sentence nobody would think to
  check, and it goes on reading correctly after the rule beneath it has
  changed. It is derived now, and `check-instant-rules.mjs` fails on the
  next literal.

- **R3 - Callers migrated: Done.** All CLI ceremonies send fields. The ADR
  0100 signer adapter turned out to be a fifth caller this ADR had not
  named: the `@pico/vault` ceremony functions sign through it, so
  `PicoVaultDetachedSigner.sign` now requires a `PicoVaultSignatureContext`
  and every ceremony function supplies the exact builder input it signs. A
  local `PicoVaultSession` accepts and deliberately ignores the context -
  in-process, the renderer and the signer are the same process.
- **R4 - Ceremony statements: Done.** The three daemon-side ceremony
  families now carry a rendered statement built from the same validated
  parameters the ceremony executes with. The scalar summary stays as
  diagnostics; the statement is what a person is shown.
- **R5 - Tests: Done.** Fields the builder rejects fail with no approval
  raised and no `approval_requested` audit line. The adapter verifies the
  returned signature against its caller's own bytes, so claimed fields that
  do not describe those bytes fail as `signature_context_mismatch` instead
  of producing a record whose signature quietly covers something else; a
  context-less call fails as `signature_context_required`. The statement
  test pins the rendered sentence and checks the digest against
  independently built bytes.

## Non-goals

- wording, tone, localisation or how an avatar presents a statement;
- changing the approval binding, its digest, or who decides;
- changing the exempt list;
- rendering for anything that is not an approval.

## Consequences

Positive:

- what a person is shown is derived from what their key signs, which is the
  property the avatar form needs and the terminal form only approximated;
- the daemon stops signing bytes it cannot account for;
- the ADR 0101 summary stops being an echo the person might read as an
  assertion.

Negative and residual:

- a breaking change to `sign`, acceptable only because this contract is
  local and unpublished (ADR 0097 reserves exactly that);
- every existing caller has to be migrated in the same change;
- a new record type is not signable until its renderer exists, which is a
  deliberate cost: it keeps unreadable approvals from appearing by default.

## Relationship to other ADRs

- Discharges ADR `0105` B4 and the rendering gap ADR `0099` named.
- Tightens the ADR `0097` `sign` family without touching the unlock
  lifecycle or the hold binding.
- Supersedes the ADR `0101` summary as the person-facing statement; the
  echo may stay as diagnostics but is no longer what is shown.

## References

- [ADR 0097](0097-deployable-vault-process-and-local-ipc-authority-boundary.md)
- [ADR 0099](0099-hold-channel-approval-for-authority-creating-signatures.md)
- [ADR 0101](0101-daemon-side-kek-ceremony-families-and-ceremony-approval.md)
- [ADR 0105](0105-pico-runs-as-a-background-companion-not-a-cli.md)
