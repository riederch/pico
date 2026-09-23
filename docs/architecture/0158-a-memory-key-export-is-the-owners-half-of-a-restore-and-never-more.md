# 0158 - A memory key export is the owner's half of a restore, and never more

## Status

**Draft, 2026-09-23. Nothing here is accepted and nothing is built.** KE1-KE6
are proposed gate shapes rather than decided ones. No status matrix row, no
`.agent-context.md` entry, no ADR 0128 status note on anything it touches -
ADR 0146 set that precedent, ADR 0156 and 0157 follow it.

Written for the user to read before anything is built. It is the design step
that ADR 0072 point 5 named and deferred, ordered second of seven blocks on
2026-09-22 because it is the only open item whose delay accrues a cost
(Roadmap, *Siebzehn Entscheidungen*).

## Context

ADR 0072 R6 keeps memory Domain Content Keys (KEKs) out of every database
backup, and its point 5 states the consequence plainly: restoring a database
backup without the key store leaves every `domain_encrypted` item permanently
unreadable, **by design**. The same point names the only mitigation it allows -
*"explicit, user-initiated key export: a passphrase-protected recovery artifact
... that the owner creates deliberately and stores separately from data
backups"* - and the status matrix has carried it as future work since.

Two things changed on 2026-09-22 and made this urgent rather than pending:

- **Finding B254.** Every write path now seals when a crypto provider exists,
  including a recall answer a person chose to keep. Before, only the HTTP
  write path did, and material kept through a state crossing survived a
  keyless restore *by accident*. The hazard is unchanged; the share of a
  person's memory it covers is larger.
- **Finding B255** measured the whole chain and found every step documented and
  deliberate. The one thing a person cannot do is *prevent* the loss. They can
  only suffer it. This ADR is what turns a designed loss into a decision.

What already exists, measured rather than assumed:

- KEKs are 32 random bytes each, one file per `(domainId, version)` in
  `<data>/keys`, written by `apps/core/src/key-store.ts`. The store lists
  versions per domain and has no "list every domain" operation.
- The Vault keyfile (`pico.vault.keyfile.v1`, ADR 0081) is the house's
  age-style construction: Argon2id through libsodium `crypto_pwhash` with
  self-describing parameters in a labeled header, XChaCha20-Poly1305 with that
  header bound as associated data. It exists, it is walked, and it is what
  ADR 0016 means by *"age-style backup protection"*.
- The Recovery Card (ADR 0110) is the precedent for a passphrase-protected
  artifact a person creates deliberately. It lives on the Vault side because
  the identity root does. KEKs live on the Core side.
- `crypto_pwhash` has two tiers in `@pico/protocol`: moderate (3 ops,
  256 MiB) and maximum (4 ops, 1 GiB).

## Decision

### KE1 - The artifact holds memory KEKs and nothing else

The export carries, for the Home it was made in, the complete set of
`(domainId, version, kek)` triples the key store holds at export time, the
Home id, and the instant of export. It carries **no** identity key, host key,
device key, recovery anchor, operator credential or session - not because a
list says so, but because the exporter reads only `KeyStore` and the parser
refuses any payload element that is not a KEK triple.

This is ADR 0033's rule made structural: holding this file plus a database
backup restores memory readability and nothing else. It cannot become
identity, host administration, membership or transport authority, because
none of those keys can be in it.

**Gate:** the export module imports nothing from identity, host-key, recovery
or operator modules, checked by the module boundary the way `relay:check`
checks the relay reaches no Pico store. And a round trip through the parser
with a foreign element planted fails.

### KE2 - The construction is the Vault keyfile's, with its own name

`pico.vault.keyexport.v1`: the same header fields as `pico.vault.keyfile.v1`
(format, suite, KDF algorithm and profile, ops and memory limits, salt, AEAD
algorithm, nonce), the same Argon2id-through-`crypto_pwhash` derivation, the
same XChaCha20-Poly1305 seal with the header as associated data. The
`keyRole` field of the keyfile header becomes a `contents` field that names
what is inside (`memory_domain_keks`), and a `homeId` field binds the artifact
to the Home it came from.

No new primitive, no new construction. The **format label is inside the
associated data**, so a keyfile can never be opened as an export or an export
as a keyfile: the AEAD refuses before any payload is looked at.

**KDF tier: moderate**, not maximum, and this is a decision about
*availability of the import*, not about strength. The device that owns the
data may be an appliance with 1 GiB in total; an artifact that only a
workstation can open protects nobody. The header is self-describing, so a
later profile can raise the cost without a format change.

### KE3 - The passphrase is its own, and it is written nowhere

The export passphrase is chosen at export time and never stored. It **must
not equal the Vault passphrase**: the process performing the seal can refuse
equality without retaining anything, and ADR 0033 forbids one secret becoming
universal authority. A length floor applies; beyond that, the person is told
the truth rather than scored: *this passphrase is written nowhere; without it
the file is noise.*

Import verifies the passphrase only by attempting to open the artifact. There
is no hint, no recovery, no second way in. Visible loss over hidden recovery
channels - ADR 0081's posture, restated.

### KE4 - Export and import are Core-side Link operations, approval-gated

The key store is the Core's, so the Core exports and the Core imports. Two
new Pico Link Direct operations, reached from the companion and from nothing
else (ADR 0105: no product path assumes a terminal):

- `home.memory.keys.export.submit` - the Home seals its KEKs under the
  passphrase carried in the request and returns the artifact bytes in the
  reply. Passphrase and artifact travel only inside sealed Link envelopes
  (ADR 0107). The companion writes the artifact to the path the person chose,
  mode `0600` (`mode:check`), and shows the sentence in KE6.
- `home.memory.keys.import.submit` - the reverse: artifact and passphrase in,
  a report out.

Both require the current Home Host Pico with an active delegation **and
ADR 0099 approval**. Producing a file that restores every memory is a
sensitive act; so is writing keys into a live Home. Neither is a Foundation
route: there is no dashboard convenience here, and the ADR 0076 operator is
not the person whose memories these are.

### KE5 - Import never overwrites and never resurrects

Import writes a KEK file only where none exists. A version already present
is left untouched - a live key is never replaced by an older copy. And a
domain whose audit log carries `memory.domain_shredded` after the artifact's
export instant is **refused**, by name: importing it would resurrect exactly
the key material a shred destroyed, which is the case ADR 0033 names when it
says stale backups must not silently resurrect retired keys. The event log
is the source of truth for that refusal, not the file system.

The report says, per domain: restored, already present, or refused and why.

### KE6 - Both halves are said to the person, and only both restore

At export: *"This file, together with a backup of your Home, restores your
memories. Alone it restores nothing. The passphrase you chose is written
nowhere. Anything your Home seals after today needs a newer file."*

At import: the report from KE5, and one more sentence: *"Your memories are
readable again only once the database backup is restored too."* - because a
person who has just imported keys into an empty Home has restored nothing
yet, and the honest state is to say so.

The two-artifact rule of ADR 0072 point 5 is kept mechanical rather than
advisory: neither half does anything alone, and the product says so at the
moment each half is made.

## Consequences

- A person can prevent the loss ADR 0072 designed, by one deliberate act
  before it happens. Nothing about R6 weakens: backups stay key-free, the
  export stays backup-free, and only the owner can hold both.
- A forgotten export passphrase is a useless file. That is the same shape as
  every scheme this project has accepted (ADR 0081, ADR 0110) and is preferred
  over any recovery channel.
- Domains rotated after an export have newer versions the artifact lacks.
  The export instant in the header, and the KE6 sentence, make that visible
  rather than surprising. A person who rotates often exports often; the
  product may later remind them, but this ADR does not decide that.
- Two new Link operations widen the surface: `surface:check`,
  `docs/protocol/public-surfaces.md`, `link-operations.mjs` and the argued
  routes list all learn them, and `link:walk` counts them once a real Home
  has answered each.
- The key store gains one operation, "list every domain and version", which
  the exporter needs and the shred already almost has.

## What this ADR does not decide

- Whether an export should be **suggested** (after founding, after the first
  sealed write, on a schedule). That is a product-surface decision and
  belongs to the companion's presentation contract, not here.
- Whether the artifact may later be wrapped by a platform keystore or a
  hardware token in addition to the passphrase. ADR 0072 point 6 keeps that
  additive; nothing here prevents it.
- Any change to what a crypto-shred does. KE5 refuses to undo one; it does
  not redefine one.

## Gates, in one place

| Gate | Holds that |
|---|---|
| KE1 | the artifact contains memory KEKs and nothing else, structurally |
| KE2 | the construction is `pico.vault.keyfile.v1`'s with its own AAD-bound format label |
| KE3 | the passphrase is never the Vault passphrase and is stored nowhere |
| KE4 | export and import are approval-gated Link operations, Core-side, companion-only |
| KE5 | import never overwrites a present version and never resurrects a shredded domain |
| KE6 | a real Home round-trips: export, empty the key store, import, read a sealed memory back |
