# 0078 - Memory Domain Reader Membership and Key Distribution Threat Model and Direction

## Status

Accepted as the threat model and direction for how memory Domain Content Keys may reach readers beyond the single Foundation process: domain custody classes, the sharing unit, the wrap-suite direction, removal and rotation semantics, and the backup/shred honesty rules — all gated behind three named prerequisites. **The additive custody-class vocabulary, per-domain marker and K6 key-store guard are implemented; this widens no reader set.** Until every gate passes, the runtime keeps exactly the ADR 0071/0072 single-host model for content, and `reader_custody` remains an inert, fail-closed marker with no envelope runtime.

## Context

What exists is one side of a seam. The at-rest layer is real: per-domain KEKs in a separated file store (ADR 0072, R6), per-item DEKs wrapped under the KEK (ADR 0071 R2) with canonical AD binding (ADR 0073), crypto-shred with a durable audit event. The access layer is real: operator sessions and fail-closed access classes (ADR 0075/0076), and the Gate C read API whose `domain-content` authority is a readership evaluation deliberately distinct from the operator role (ADR 0077, realizing A7). That evaluation's foundation-phase policy — the sole principal reads every domain — is a stub with a declared successor: membership.

What is missing is the cryptographic counterpart of that seam. ADR 0071 answered the ADR 0016 questions for a single host and said plainly: "nothing in this ADR widens the reader set." ADR 0031 lists what must exist before Domain Content Keys go multi-reader: a reader membership model, a key wrapping format, rotation on removal, historical-content behaviour, crypto-shredding expectations, backup and restore semantics. ADR 0033 bounds what rotation may ever claim. ADRs 0045/0054 fence the draft fixtures. No ADR yet decides how a second reader would actually obtain a domain key.

More dangerously, no rule yet forbids the obvious wrong implementation. The path of least resistance, once a second reader appears, is to put every domain's KEK into the host key store and hand out copies through the API. Every line of that code would look reasonable, and the sum would make hosting identical to reading — silently breaking the ADR 0029 core rule ("Homes host; they do not become owners") at the key layer, which is the one layer where breaking it is irreversible in effect. This ADR exists to make that slide impossible by vocabulary and by fail-closed structure, decided now — while the instance is still single-principal and the decision is cheap — so membership, product-memory and sync work inherit a direction instead of forming one by accretion. It is the ADR 0071 pattern (dedicated, maximally reviewed step) applied to key distribution.

## Scope

Covers **how memory-domain KEKs may be held and distributed** once readers beyond the single Foundation process exist — the owner's other devices, member Picos, a Pico Home hosting residents: what the host may hold per domain, the wrapping construction, reader removal and rotation, backup/restore behaviour, and what shredding may claim per custody class.

Does not cover: identity or device key formats, serialization, possession proofs or trust paths (ADR 0029/0033/0055 family); membership credential verification (ADR 0045); transporting envelopes (ADR 0028/0032 — Pico Link does not exist); group messaging protocols; item-granular sharing UX; any change to the at-rest suite (`pico.suite.mem.v1`, ADR 0071/0073, unchanged). Single memory scope: other protected content inherits this direction only through its own ADR.

## Threat model

### Protected assets

- domain KEKs — possession of one is readability of a whole domain, including its future content under that version
- the reader set per domain, and the integrity of changes to it (grants, removals)
- the "hosting is not reading" boundary (ADR 0029), which distribution is the first machinery able to break at the key layer
- the shred promise of ADR 0071/0072, which careless distribution would silently hollow out
- the reader graph as metadata: who was granted which domain, when, and how many readers a domain has

### Attacker model

Extending the ADR 0031/0071 tables for the distribution surface:

| Attacker | Capability | Posture direction |
|---|---|---|
| Curious or compromised Home Host | Reads all host storage of hosted member domains. | Reader-custody defends by construction: the host holds ciphertext and sealed envelopes it cannot unwrap (K1/K6). The real failure mode is custody *misclassification*, so custody is explicit, fixed and fail-closed — never inferred from context. |
| Removed reader | Holds previously granted KEK versions, cached plaintext, possibly full copies. | Rotation bounds the future only (K5). No retroactive claim, ever (ADR 0033). Removal must also never depend on the removed reader's cooperation. |
| Malicious co-reader | Leaks plaintext; re-shares key material out of band. | Stated honestly: **possession is possession.** Membership authorizes the *system's* wrapping; it cannot revoke arithmetic. A key holder can always be a leak — a trust boundary, not a crypto one. |
| Envelope forger | Injects or swaps envelope rows (host DB write access, future sync path). | No unauthenticated envelope has any effect (K4); the sealed payload binds its context canonically (K3); and a sealed box decrypts only for its one reader, so a swapped row fails for everyone else regardless. |
| Stale-backup attacker | Restores old envelopes to resurrect removed grants. | Envelope validity reconciles against current membership after restore (K7/K8) — the key-layer sibling of tombstone re-enforcement (ADR 0070). Residual: a removed reader with a stolen backup can unwrap versions it was actually granted; that is within the cached-plaintext honesty limit, not a new exposure class. |
| Metadata correlator | Reads the envelope inventory: reader refs, counts, grant timing. | Classified as sensitive (ADR 0031); reader references stay key references, never identity display data; retention of removal traces is bounded (metadata section). |
| Stolen host disk | Full local state. | Host-custody: unchanged ADR 0072 gap (closed only by the future passphrase layer, stated there). Reader-custody: the KEK is absent by construction — strictly better than today for those domains. |

### The ADR 0016 questions, answered for distribution

1. **Who controls keys?** The domain's controller — the identity that decides the reader set. For a host-custody domain, the owner's Foundation process manages the KEK on the controller's behalf: today's model, unchanged, and correct for the owner's own host. For a reader-custody domain, controller devices generate, hold and wrap the KEK; it reaches the host only in wrapped form. The Home Host role grants no key authority in either class — ADR 0029's rule, now with a mechanism.
2. **Which devices can read which domain?** Exactly the wrapped-to set: devices holding an unwrappable envelope for a current or granted KEK version. The envelope inventory is the *cryptographic ground truth* of readership; membership records are administrative intent and must reconcile against it (K7). The ADR 0077 seam governs the host's plaintext API path; envelopes govern everything beyond it.
3. **What can a server see?** Host-custody: plaintext — that is what the class means, and it is a deliberate choice, not a leak. Reader-custody: ciphertext, sealed envelopes and metadata (domain ids, sizes, versions, reader refs, timing) — never a KEK, DEK or plaintext.
4. **What can a relay see?** Nothing new. If envelopes ever travel, they travel as protected payloads (ADR 0032) and relays see transport metadata only (ADR 0031). No transport exists today.
5. **What happens after device loss?** The lost device is removed as a reader: membership revoked, its envelopes deleted best-effort, affected domains rotated where future secrecy is required (ADR 0033). What it could already read may be cached or copied — stated, not hidden. Losing the *host* stays the ADR 0072 story for host-custody domains and loses nothing for reader-custody ones.
6. **What happens after relationship revocation?** Reader removal, same mechanics, with two speeds stated honestly: API-path revocation (sessions, readership) is immediate; cryptographic removal bounds only future content. Neither reaches cached or exfiltrated plaintext, and neither claims to.
7. **How does backup restore work?** Envelopes and ciphertext may share backup artifacts — an envelope is ciphertext to everyone but its one reader. Raw-KEK separation (ADR 0072 R6) is unchanged wherever a host-held KEK exists at all. A restore may resurrect stale envelopes; reconciliation re-deletes grants that current membership does not support (K8) before anything serves them.
8. **How does deletion interact with protected payloads?** Tombstones and retention are metadata-driven and unchanged (ADR 0071 R7; the sweep never decrypts, for either class). Shredding splits by custody: host-custody shred keeps its full meaning — destroy the KEK files and every backup goes dark, because no backup ever held the keys. Reader-custody shred is **host-local** destruction of envelopes and ciphertext and must never claim domain-wide darkness (K9): the keys live with readers, and at most a destruction *request* can travel — a protocol expectation, never a guarantee.

## Required properties

- **K1 — Explicit custody class per domain.** Every protected domain is exactly one of `host_custody` (the ADR 0072 key store holds the KEK; the host decrypts for readers the ADR 0077 seam authorizes) or `reader_custody` (the KEK exists only wrapped to reader keys; the host stores ciphertext and envelopes and can never decrypt). The class is chosen explicitly at domain creation, is visible, and never changes silently. A domain hosted for anyone other than the host's owner **must** be reader-custody. Every domain that exists today is host-custody.
- **K2 — The domain KEK is the sharing unit for domain readership.** A reader grant wraps the domain KEK, one envelope per `(reader key, kekVersion)` — matching the granularity the access model already has (`mayReadDomain(principal, domain)`, ADR 0077). This deliberately refines the ADR 0071 R2 aside that pointed at per-item DEKs as "the later unit for authorized-reader wrapping": per-item DEKs remain what makes *item-granular* sharing possible later without re-encryption; domain readership does not use them. One content-encryption path; no second scheme.
- **K3 — Wraps bind their context canonically.** The sealed wrap payload carries, in an ADR 0073-style length-prefixed layout, at least `{suite, domainId, kekVersion, readerKeyRef}` alongside the KEK bytes, and the reader verifies that binding after unsealing. A wrap presented for the wrong domain, version or reader fails closed. Sealed boxes take no associated data, so binding lives *inside* the sealed payload — message format over a reviewed construction, assembling no new primitive (ADR 0016).
- **K4 — No unauthenticated envelope has any effect.** Until issuer signatures over canonical envelope bytes exist (Gate R2) and issuer authority is verifiable (Gates R1/R3), an envelope is inert data: nothing accepts, honors or acts on one. There is no interim trust-on-first-use and no "verified later" path.
- **K5 — Removal stops wrapping, then rotates.** Removing a reader deletes their envelopes (best-effort), stops all future wrapping to them, and rotates the domain KEK where future secrecy is required — new content becomes dark to them by construction. Rotation is never described as retroactive: versions they held, cached plaintext and copies are outside its reach. This makes the ADR 0033/0054 honesty language normative for this surface.
- **K6 — Raw KEKs never cross their custody boundary.** Host-custody KEKs live only in the ADR 0072 key store (R6 unchanged). A reader-custody KEK must never exist unwrapped in host storage; the key store refuses to create or hold KEK files for a reader-custody domain, fail-closed — the K1 boundary enforced where the keys actually live.
- **K7 — The envelope inventory is auditable ground truth.** Grants and removals append content-free audit events (ADR 0037 / A9 style: references and counts, never key material). Membership intent and the envelope set must be reconcilable; drift is detectable and resolves toward membership.
- **K8 — Restore does not resurrect removed readers.** After a restore, envelopes that current membership does not support are re-deleted before anything serves them — the key-layer sibling of tombstone re-enforcement (ADR 0070).
- **K9 — Shred claims follow custody.** Host-custody: the ADR 0071/0072 shred promise stands unchanged. Reader-custody: shred is host-local destruction and every surface offering it must present it as such, never reusing the host-custody wording. Overclaiming here would be exactly the dishonesty ADR 0070 exists to prevent.

## Decision

### Custody classes: hosting is not reading, enforced at the key layer

The two classes of K1 are the structural decision of this ADR. Host-custody is not a lesser mode — it is the correct model for the owner's own domains on the owner's own host, where the process legitimately decrypts (ADR 0071's scope) and remote readers can be served plaintext over the authenticated API within the access-mode and TLS limits (ADR 0075/0041 family). Envelopes become *necessary* exactly where the host must not be able to read — a Pico Home hosting a resident's domain — and *useful* where off-host replication is wanted. Which class a domain gets is therefore a real product decision made at creation, not an implementation detail; and conversion between classes is an explicit, audited migration (open question below), never an ambient side effect.

### The wrap suite direction: `pico.suite.share.v1`

- **Reader keys are X25519 key-agreement keys** — the concrete material behind the future Device Key `decrypt_domain` scope (ADR 0033). Their delegation, serialization and possession story is identity-strand work (Gate R1); this ADR fixes only what kind of key a wrap targets.
- **A KEK grant is a libsodium sealed box** (`crypto_box_seal`: X25519 + XSalsa20-Poly1305 with an ephemeral sender key) over the canonical payload of K3. Same reviewed toolkit as everything else in the tree, no new dependency, no custom construction (ADR 0016).
- **Envelope authenticity is a signature concern, not a wrap concern.** Sealed boxes authenticate no sender by design. The envelope — row metadata plus sealed wrap — must carry an issuer signature over canonical envelope bytes before any runtime trusts it; the signature scheme and issuer key model belong to the identity and canonicalization strand (ADR 0029/0033/0034). This ADR requires their existence (Gate R2) and refuses every interim substitute (K4).
- **Deviations are new suites, never silent changes** — the ADR 0071 rule verbatim. Hardware-backed reader keys (platform keystore or passkey-class hardware, typically P-256 ECDH rather than X25519) or an HPKE-based construction (reviewed AAD support, but outside libsodium) would enter as `pico.suite.share.v2`, with their own vectors.

### Removal and rotation on the existing versioned store

The ADR 0072 layout already carries versions (`domain_<id>.v<n>.key`), and the runtime already writes new content under the latest version. Rotation therefore has a prepared seat: create version `n+1`, wrap it to the remaining readers, and new content is dark to the removed reader with no re-encryption of history. Historical versions remain available to remaining readers so old items stay readable. Whether a *newly added* reader receives historical versions (read-history) or only the current one (forward-only) is an explicit, per-grant, audited decision — never a default hidden in code. And the two speeds of removal stay separate and honest: the API path (session revocation, readership denial) cuts off immediately; the cryptographic path bounds only the future.

### Backups, restore and shredding

Envelopes may live in the same backup artifacts as ciphertext — they are sealed to their readers, and R6 concerns raw KEKs only. Restores reconcile: stale envelopes for removed readers are re-deleted against current membership (K8), exactly as restored items are re-tombstoned today. Shredding splits by custody per K9, and the split must reach the UX: the existing shred surfaces (Gate B route, dashboard card) carry the host-custody promise and must not be reused verbatim for reader-custody domains when those exist.

### Metadata

The envelope inventory is a relationship graph: which reader refs hold which domains, since when, how many. Direction: reader references in envelope rows are key references, never identity display data; grant/removal audit events carry counts and refs, not names; traces of removed grants are retention-bounded rather than kept forever. Sizes and timing remain visible to the host as with all at-rest metadata (ADR 0071); nothing here claims metadata privacy beyond classification and minimization (ADR 0031).

## Ordering gates

Nothing behind these gates ships, and nothing is security-relevant before **all three** pass. Draft fixtures stay inside the ADR 0042/0054 fences — which forbid wrapped-key material entirely; the authoritative accept/reject vectors of Gate R2 are a different artifact class (synthetic keys, ADR 0073 precedent), not draft placeholders.

1. **Gate R1 — Reader keys are real.** Device-held X25519 keys with a reviewed delegation and possession story (ADR 0029 Device Key role, ADR 0033 lifecycle, realization of the ADR 0055 family). Without them there is no one to wrap to, and no envelope can be issued. *Direction now exists: ADR 0079 fixes the device key-agreement key (X25519 under `pico.suite.id.v1`) and the delegation record direction, and ADR 0081 fixes the custody story for the private halves (device Vault, agent-boundary unwrap); the gate discharges when ADR 0079's Gates G1–G3 and ADR 0081's Gate P2 deliver vectors, custody and lifecycle mechanics.*
2. **Gate R2 — Canonical bytes and vectors.** Canonical wrap-payload and envelope-byte layouts with authoritative accept/reject vectors (ADR 0034 discipline), including negative vectors for wrong-domain, wrong-version, wrong-reader and suite-swap presentations. *Method now selected: ADR 0079 I3 (labeled length-prefixed binary layouts); the envelope-family layouts and vectors themselves remain this gate's work.*
3. **Gate R3 — Membership runtime.** Verified membership records that drive both envelope issuance and the ADR 0077 `mayReadDomain` seam, with content-free grant/removal audit. The stored `owner`/`controller` fields remain non-authorization inputs forever (ADR 0077 C2); membership rows are the readership source the seam was cut for. *Direction now exists: ADR 0080 fixes the membership credential realization these records verify against (issuer signature by the Home Host Pico, activation countersignature by the host key, I9-ordered lifecycle statements) — the gate discharges when ADR 0080's Gates M1/M3 deliver layouts, vectors and the membership runtime.*

## Implementation implications

Ordered and additive:

1. **Done — reserve the custody-class vocabulary** (`host_custody`, `reader_custody`) additively in the protocol package, with a per-domain storage marker defaulting to `host_custody`, plus the K6 fail-closed guard in the key store (refuse KEK files for a reader-custody domain). This is the ADR-0068-style reserve-then-build pattern and prevents drift while the gates are open. The current runtime also rejects memory content writes for `reader_custody` domains until reader-custody envelopes exist.
2. Gate R1/R2/R3 work, each its own reviewed step in the identity/membership strand.
3. Only after all gates: the wrap module (`pico.suite.share.v1`), envelope storage and issuance, rotation trigger, restore reconciliation, and — separately gated by transport ADRs — any surface that lets an envelope leave the host. Until then, the ADR 0070 rule extends naturally: no envelope leaves the host, because none exists.

## Non-goals

This ADR does not define or implement:

- identity keys, device keys, delegation, possession proofs or their serialization (ADR 0029/0033/0055 family)
- membership credentials, issuer verification or the claim/Move-In flow (ADR 0024/0027/0045)
- the signature scheme or canonical envelope byte layout (Gate R2 work under ADR 0034)
- any transport for envelopes (ADR 0028/0032; Pico Link does not exist)
- group messaging protocols or MLS-style group state
- item-granular sharing (per-item DEK wrapping stays a preserved possibility, not a design)
- passphrase export of host-custody keys (ADR 0072 step 4, unchanged and separate)
- any change to `pico.suite.mem.v1`, the AD layouts (ADR 0073) or the at-rest model

## Open questions

- **HPKE as `pico.suite.share.v2`.** RFC 9180 is the standards-track construction for exactly this shape and has AAD support; adopting it would add a primitive family outside libsodium. Revisit when a reviewed implementation is worth the zoo cost.
- **History grants for new readers.** Read-history vs forward-only as the default offering at membership time is a product decision; the envelope model supports both (per-version wraps). Decide with the membership UX, not here.
- **Custody migration.** Host-custody → reader-custody for an owner taking a domain E2E: re-wrap the existing KEK versions and best-effort-delete the host copies, or re-encrypt under fresh keys? What may the migration honestly claim about the host's past readability? Own step when wanted.
- **Where envelopes sync.** Which Pico Link surface carries envelopes, and its metadata budget (ADR 0031/0032 refinement).
- **Whether custody surfaces in the dashboard** before any reader exists — probably as read-only domain metadata once the marker lands.
- **Owner multi-device without membership.** The owner's second device could be served by the host-custody API path (a device principal under ADR 0075's successor work) long before reader-custody exists. Whether that intermediate step is wanted belongs to the identity strand's ordering.

## Consequences

Positive:

- makes the one irreversible mistake — host-held keys for hosted member domains — structurally impossible before any code invites it, with vocabulary (K1), storage enforcement (K6) and shred honesty (K9) aligned
- reconciles the crypto layer with the access layer: the ADR 0077 readership seam gets its designated successor (membership rows, Gate R3) on both paths
- resolves the ADR 0071 R2 ambiguity explicitly: KEK-per-reader for domain readership, per-item DEKs preserved for item-granular sharing
- keeps the primitive zoo at one toolkit (libsodium sealed box) with the deviation rule already proven by ADR 0071
- states every honesty limit up front — possession is possession, rotation is not retroactive, shared shred is host-local — so no later surface has to walk a claim back

Negative:

- three gates sit before any of it runs, and two of them (reader keys, membership) are large identity-strand work — accepted: the alternative is direction-by-accretion on the most irreversible layer
- custody classes add a per-domain concept users will eventually have to understand ("the host can read this domain / cannot read that one")
- sealed-box-without-AAD forces the context binding into the payload and the authenticity onto a future signature, a two-piece story that must be explained carefully in Gate R2 vectors
- reader-custody weakens the shred promise for shared domains, and that weakening must surface in UX rather than stay in documents

## Relationship to other ADRs

- Realizes the "Domain key requirements" list of **ADR 0031** (reader membership model, key wrapping format, rotation on removal, historical-content behaviour, shredding expectations, backup/restore semantics) as decided direction for the memory scope.
- Refines **ADR 0071**: answers its questions 2 and 6 for the widened reader set it deliberately excluded, and resolves the R2 aside on reader wrapping (KEK-per-reader for domain readership; per-item DEKs preserved for item-level sharing). The at-rest suite is untouched.
- Extends **ADR 0072**: custody classes sit on top of its key store; R6 is unchanged for host-custody, and K6 adds the fail-closed refusal for reader-custody. The stolen-disk gap and passphrase-export step stay exactly as stated there.
- Constrained by **ADR 0016**: libsodium sealed box, no custom constructions — the in-payload context binding is message format, not a primitive; HPKE or hardware-backed keys would be explicit new suites.
- Enforces **ADR 0029** mechanically: "hosting ciphertext is not permission to read it" becomes reader-custody by construction, and the Home Host role holds no key authority in either class.
- Makes **ADR 0033**'s rotation honesty normative for this surface (K5) and follows its lifecycle vocabulary; recovery and passphrase flows stay there and in ADR 0072.
- Stays above the **ADR 0045/0054** draft fences: placeholders remain metadata-only and wrapped-key-free; Gate R2's authoritative vectors follow the **ADR 0073** precedent instead.
- Plugs into **ADR 0075/0077**: membership rows (Gate R3) are the declared successor of the foundation-phase readership policy on the API path and the issuance authority on the envelope path; A7 ("administration is not readership") and C2 (stored `owner`/`controller` never authorize) carry over unchanged.
- Preserves the **ADR 0070** ordering: protection before exposure — no envelope leaves the host before the gates pass, and shred claims never exceed what key destruction actually reaches (K9).
- Follows the **ADR 0034** discipline via Gate R2: canonical bytes and published vectors before any signature or envelope carries security meaning.
