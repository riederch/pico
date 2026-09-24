# 0158 - A memory key export is the owner's half of a restore, and never more

## Status

**Draft, 2026-09-23; reviewed and its two forks decided by the owner on
2026-09-24. Nothing is built.** KE1-KE6 below are the decided shapes: the
review at the end measured the first draft against the tree, found two forks
(A: seal on the device; B: readership-scoped) and eight corrections, and the
gates were rewritten to absorb all of them. No status matrix row, no
`.agent-context.md` entry beyond the handoff, no ADR 0128 status note on
anything it touches until something is built. No status matrix row, no
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

### KE1 - The artifact holds the KEKs its maker may read, and nothing else

The export carries, for the Home it was made in, the `(domainId, version,
kek, kekDigest)` tuples of exactly the **host-custody domains the requesting
identity may read at export time** (ADR 0077 readership, asked per domain the
way `home.recall.ask` asks it), the Home id, the exporting identity's
fingerprint and the instant of export. It carries **no** identity key, host
key, device key, recovery anchor, operator credential or session - not because
a list says so, but because the Home releases only what `KeyStore` holds for
readable domains and the parser refuses any payload element that is not a KEK
tuple.

This is ADR 0033's rule made structural, twice: holding this file plus a
database backup restores memory readability and nothing else; and Home
administration stays what it is - the Home Host exports the domains they may
read, a member exports theirs, and nobody exports a domain they could not
read. In a one-person Home the set is the whole store; the day a second person
lives there it is not, and the export is not where the two start to blur.

**Gate:** the export module imports nothing from identity, host-key, recovery
or operator modules, checked the way `relay:check` checks the relay reaches
no Pico store; a round trip through the parser with a foreign element planted
fails; and a walk against a real Home with two readers shows each export
carrying only its own domains.

### KE2 - The construction is the Vault keyfile's, on the device, with its own name

`pico.vault.keyexport.v1`: the same header fields as `pico.vault.keyfile.v1`
(format, suite, KDF algorithm and profile, ops and memory limits, salt, AEAD
algorithm, nonce), the same Argon2id-through-`crypto_pwhash` derivation, the
same XChaCha20-Poly1305 seal with the header as associated data - **built by
the same code, in `packages/vault`, on the person's device.** The `keyRole`
field of the keyfile header becomes a `contents` field naming what is inside
(`memory_domain_keks`), and `homeId` and the exporting identity's fingerprint
bind the artifact to where it came from.

The seal happens on the device and not at the Home, and this is a decision
about *where a passphrase may exist*: the Home releases raw KEKs over the
sealed Link channel (ADR 0107, end to end between the person's device and
their own Home - the direction `share-envelope.ts` already seals a KEK in),
the device derives, seals and writes. The passphrase a person chooses never
leaves the device that asked for it; the artifact never crosses the wire;
`apps/core` gains no KDF path. ADR 0081's rule that no host holds a
passphrase is kept by construction.

No new primitive, no new construction. The **format label is inside the
associated data**, so a keyfile can never be opened as an export or an export
as a keyfile: the AEAD refuses before any payload is looked at.

**KDF profile: moderate**, the profile every unlock already runs on the same
device, so the availability question the first draft asked answers itself.
The header is self-describing; a later profile can raise the cost without a
format change.

### KE3 - The passphrase is its own, and it is written nowhere

The export passphrase is chosen at export time and never stored. It **must
not equal the Vault passphrase**, and the device can refuse equality without
retaining anything: it attempts to open the identity keyfile with the
candidate - one Argon2id run at the moderate profile, about 215 ms - and
refuses if it opens. ADR 0033 forbids one secret becoming universal
authority, and this is the check that keeps a person from making it one out
of habit. A length floor applies; beyond that, the person is told the truth
rather than scored: *this passphrase is written nowhere; without it the file
is noise.*

Import verifies the passphrase only by attempting to open the artifact. There
is no hint, no recovery, no second way in. Visible loss over hidden recovery
channels - ADR 0081's posture, restated.

### KE4 - Export and import are signed statements the Home answers over Link

The key store is the Core's, so the Core releases and the Core writes; the
device seals and opens. Two Pico Link Direct operations, reached from the
companion and from nothing else (ADR 0105: no product path assumes a
terminal):

- `home.memory.keys.export.submit` - carries a **key-export statement**
  signed by the identity root (`pico.mem.key-export.v1`: Home id, exporting
  identity, the domains asked for, the instant). The Home verifies it against
  its founding record, checks readership per domain (KE1), and answers with
  the raw KEK tuples inside the sealed reply. The companion seals them (KE2)
  and writes the artifact at mode `0600` (`mode:check`).
- `home.memory.keys.import.submit` - the mirror: a signed **key-import
  statement** and the raw KEK tuples the device opened from the artifact go
  in; a report (KE5) comes out.

This is the tree's own shape of approval rather than a new one: the Core has
no ADR 0099 gate (`home.action.approval.*` is ADR 0141's action runner), and
every sensitive act an owner performs here is a statement the identity root
signs at the Vault daemon, approval-gated there with a rendered sentence. Each
statement therefore has a builder, a renderer and a role entry - all three
catalogs, which is what B268 taught - and the rendered sentence is KE6's,
shown at the moment the key signs. Neither operation is a Foundation route:
there is no dashboard convenience here, and the ADR 0076 operator is not the
person whose memories these are.

Both refuse by name when the Home's memory encryption decision is off
(`memory_encryption_off`): there is no key store to release from, and keys
written into a Home that stores plaintext protect nothing (ADR 0070,
protection before exposure).

### KE5 - Import never overwrites, never mixes generations, never resurrects

Keys are identified by **digest**, not by version name. `KeyStore.nextVersion`
restarts at `v1` after a shred, and a domain re-created afterwards gets a
fresh `v1` under the old name; a report keyed by name would call a different
key "already present" and write the old `v2..vn` beside the new `v1` - the
mixed-generation state in which a later restore of an old backup reads again.
So the artifact carries a BLAKE2b digest per KEK (the shape `wrap_digest_hex`
already uses), and import compares digests.

Per domain, the report says one of four things: **restored** (no key of that
version was present, the file was written), **already present** (same
version, same digest), **conflicting** (same version, different digest - the
whole domain is refused, because mixed generations are the resurrection
path), or **refused** because the Home's log carries
`memory.domain_shredded` for that domain after the artifact's export instant.
Importing a shredded domain's keys would resurrect exactly the material a
shred destroyed, which is the case ADR 0033 names when it says stale backups
must not silently resurrect retired keys. The event log is the source of
truth for that refusal, not the file system; nothing reads events by type
today, and an import - rare by nature - may scan for it.

### KE6 - Both halves are said to the person, and only both restore

At export, in the sentence the daemon renders for the signature and again
when the file is written: *"This file, together with a backup of your Home,
restores your memories. Alone it restores nothing. The passphrase you chose is
written nowhere. Any part of your memory your Home starts after today needs a
newer file."*

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
- Domains born after an export are not in it - a host-custody KEK is created
  on a domain's first write, and no host-custody rotation exists today. The
  export instant in the header, and the KE6 sentence, make that visible
  rather than surprising. The product may later remind a person to export
  again, but this ADR does not decide that.
- Two new Link operations and two new signed statements widen the surface:
  `surface:check`, `docs/protocol/public-surfaces.md`, `link-operations.mjs`
  and the argued routes list learn the operations; `sign-rendering.ts` and
  `signableLabelsByKeyRole` learn the labels, and the B174 triad test holds
  the three catalogs together; `link:walk` counts the operations once a real
  Home has answered each.
- The key store gains one operation, "list every domain and version, with a
  digest", which the exporter needs and the shred already almost has.
- The day `pico_share_envelope` gets a door, a device's key-agreement key plus
  a backup becomes a second restore path (C6). That is a question for
  ADR 0033 at that time, named here so it is not discovered.

## What this ADR does not decide

- Whether an export should be **suggested** (after founding, after the first
  sealed write, on a schedule). That is a product-surface decision and
  belongs to the companion's presentation contract, not here.
- Whether the artifact may later be wrapped by a platform keystore or a
  hardware token in addition to the passphrase. ADR 0072 point 6 keeps that
  additive; nothing here prevents it.
- Any change to what a crypto-shred does. KE5 refuses to undo one; it does
  not redefine one.

## Review, 2026-09-24 - measured against the tree, before anything is built

Everything below was read off code, not off the draft: `key-store.ts`,
`memory-content-crypto.ts`, `share-envelope.ts`, `packages/vault`'s keyfile
construction, `argued-routes.mjs`, `pico_home/config.yaml`, and the Link
handlers in `app.ts`. Two findings are forks the owner decides; the rest are
corrections the draft has to absorb whichever way the forks go.

### Fork A - where the seal happens (KE2, KE4)

KE4 has the Home seal the artifact under a passphrase that travels in the
request. Measured: the whole construction KE2 reuses - Argon2id through
`crypto_pwhash`, the labeled header as AAD, XChaCha20-Poly1305 - lives in
`packages/vault` and runs on the person's device; `apps/core` has no KDF path
at all. And the passphrase would be a **new secret the Home process sees in
plaintext**, chosen by a person who may reuse it. ADR 0081 keeps every host
out of the passphrase business ("no host-assisted escrow"), and nothing else
in this tree hands a typed secret to the Home.

- **A1 (recommended): seal on the device.** The Home releases the raw KEKs the
  caller may read over the sealed Link channel (ADR 0107, end to end between
  the person's device and their own Home); the device derives the file key,
  seals, and writes the artifact at `0600` through the companion's atomic
  file write. Import is the mirror: the device opens the file and sends raw
  KEKs over Link, the Home writes them. The passphrase never leaves the
  device; the artifact never crosses the wire; KE3's equality check becomes
  possible (see C4); and the code that seals is the code that already seals
  every keyfile. Raw KEKs crossing this seam is not new - `share-envelope.ts`
  already seals a host-custody KEK to a reader device key for exactly this
  direction.
- **A2: seal at the Home, as drafted.** Simpler to describe, and it puts a
  person's chosen passphrase into a process that ADR 0081 says must never hold
  one. Rejected unless A1 has a cost the review missed.
- **A3: hybrid** - Home seals under a random file key, device wraps that key
  under the passphrase. Two constructions for one artifact and no property A1
  lacks.

### Fork B - what the export contains (KE1)

KE1 says *the complete set of KEK triples the key store holds*. Measured:
ADR 0077 separates "may use this Home" from "may read this domain", and every
Link read of memory (`home.recall.ask`, `home.parking.ask`) asks
`readership.mayRead` per domain. An export that hands the Home Host every KEK
in the store would turn Home administration into domain readership - the
invariant AGENTS.md states as *Home-Administration ist keine
Domain-Readership*. In a one-person Home the two sets coincide; in a Home with
members they do not, and the export must not be where they start to.

- **B1 (recommended): readership-scoped.** The export covers exactly the
  host-custody domains the requesting identity may read at export time, and
  the artifact records which. A member exports their readable domains; the
  Home Host exports theirs. Nobody exports a domain they could not read.
- **B2: whole key store, Home Host only.** Matches the draft's wording and
  breaks the invariant the day a second person lives in the Home.

### Corrections that are not forks

- **C1 - keys are identified by digest, not by version name (KE5).**
  `KeyStore.nextVersion` restarts at `v1` after `shredDomain` deletes the
  files, and `memory_domain_custody` records no shred. A domain re-created
  after a shred gets a fresh `v1` under the same name. KE5's *"a version
  already present is left untouched"* would then report **already present**
  for a different key with the same name, and write the old `v2..vn` beside
  the new `v1` - the mixed-generation state that makes a later restore of an
  old backup readable. The artifact carries a BLAKE2b digest per KEK (the
  shape `wrap_digest_hex` already uses); import compares digests. The report
  gains a fourth outcome, **conflicting**, and a domain with any conflicting
  version is refused as a whole: mixed generations are the resurrection path.
- **C2 - the shred check has no reader yet (KE5).** `memory.domain_shredded`
  exists as an audit event and nothing reads events by type; the event store
  offers `list`, `listPage`, `listTail`. Import scans the log for that type
  and domain - an import is rare and the scan is correct - or the custody row
  materialises `shredded_at` under ADR 0133's four conditions. Either is a
  build decision, not an ADR one; the draft keeps the log as the source.
- **C3 - the tree's approval is a signed statement, not a Core gate (KE4).**
  The Core has no ADR 0099 approval; `home.action.approval.*` is ADR 0141's
  action runner for module effects. Every sensitive owner act here is a
  statement the identity root signs at the Vault daemon, approval-gated there
  with a rendered sentence, and the Home verifies it against its founding
  record. Export and import are two such statements, `pico.mem.key-export.v1`
  and `pico.mem.key-import.v1`, each with a builder, a renderer and a role
  entry - all three catalogs, which is B268's lesson. The rendered sentence is
  KE6's sentence, shown at the moment the key signs.
- **C4 - KE3's equality check is one KDF run, on the device.** The daemon does
  not retain the unlock passphrase. It can still refuse an export passphrase
  that equals the Vault passphrase: attempt to open the identity keyfile with
  the candidate (one Argon2id run at the moderate profile, about 215 ms) and
  refuse if it opens. Only the device has the keyfile - a second reason for
  A1.
- **C5 - there is no host-custody KEK rotation.** `createKeyVersion` is
  reached only from `currentOrNewKekVersion` on a domain's first write and
  from the two credential cryptos. The consequence *"domains rotated after an
  export have newer versions"* describes a thing that does not exist. What
  goes stale after an export is a **new domain**, whose KEK is born on its
  first write. The KE6 sentence says that instead.
- **C6 - what a person holds today, measured.** The Recovery Card restores the
  identity root only (ADR 0110). `pico_share_envelope` holds host-custody KEKs
  sealed to reader device keys - inside the database, so inside a backup - but
  `argued-routes.mjs` records that no companion issues or receives one and no
  Link operation exists. Today no device holds a KEK in any form; B255's
  "the loss cannot be prevented" stands, and this export is the only path.
  The day share envelopes get a door, a device's key-agreement key plus a
  backup becomes a second restore path, and ADR 0033 will have to be asked
  again about it. Stated here so it is not discovered.
- **C7 - encryption off is a named refusal, both ways.** Export from a Home
  whose encryption decision is off: refuse as `memory_encryption_off`; there
  is no key store, and a sentence about restoring memories would be false.
  Import into such a Home: refuse for ADR 0070's reason - protection before
  exposure; keys written into a Home that stores plaintext protect nothing.
- **C8 - the KDF tier question mostly disappears under A1.** The moderate
  profile runs on the device that already runs it at every unlock. The header
  stays self-describing.

### What the review did not find

No weakness in the construction itself: header-bound AAD refuses a keyfile
opened as an export and vice versa (KE2), the nonce and salt are fresh per
artifact, and the format label sits inside the authenticated data. The R6
separation (`assertKeyStoreSeparation`, `backup_exclude` in
`pico_home/config.yaml`) is intact and untouched by any variant above.

## Gates, in one place

| Gate | Holds that |
|---|---|
| KE1 | the artifact contains the KEKs of the domains its maker may read, and nothing else, structurally |
| KE2 | the construction is `pico.vault.keyfile.v1`'s, built on the device by `packages/vault`, with its own AAD-bound format label |
| KE3 | the passphrase is never the Vault passphrase (one KDF run proves it) and is stored nowhere |
| KE4 | export and import are signed statements over Link, Core answers, companion only; refused by name when encryption is off |
| KE5 | import compares digests, refuses a conflicting domain whole, and never resurrects a shredded domain |
| KE6 | a real Home round-trips: export, empty the key store, import, read a sealed memory back |
