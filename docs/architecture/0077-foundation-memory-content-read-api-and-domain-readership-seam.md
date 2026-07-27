# 0077 - Foundation Memory Content Read API and Domain Readership Seam

## Status

Accepted as the ADR 0075 **Gate C** design and **implemented**: the memory
content read API and domain-readership evaluation seam (A7). Unclaimed
development instances use `SoleResidentReadership`; after a signed founding
record exists, ADR 0082 switches the default to `HomeMembershipReadership`,
requiring an identity-bound session, active Home membership and an active
signed grant for the exact domain. The read routes remain
`GET /api/memory/domains/:privacyDomain/items[/:memoryItemId]`, cursor-paged via
`MemoryStore.listInDomainPage`. Operator authority never overrides readership,
stored owner/controller fields never authorize, and the static token remains at
its `foundation-diagnostic` ceiling.

## Context

ADR 0075 scopes local access control and orders three gates. Gates A and B are built (ADR 0076 mechanics: operator principal, sessions, fail-closed route classification, auth audit; behind them retention policy CRUD and the crypto-shred trigger). Gate C is the last one open, and it is the only surface that returns **decrypted memory content** over the network.

Everything the read API needs at rest already exists:

- `MemoryStore.listInDomain` / `getInDomain` already resolve content per privacy domain — they decrypt `domain_encrypted` items in-process, and they already report `contentUnavailable` (`key_shredded` / `crypto_unavailable`) instead of fabricating content when a domain was crypto-shredded or no crypto provider is attached (ADR 0071 runtime).
- The ADR 0070/0071 protection-at-rest prerequisites for a content-exposing surface are met, so ADR 0070's ordering no longer blocks the read API.
- Sessions, the access-class registry and the `domain-content` class already exist; the class is reserved and unused (`apps/core/src/access-classes.ts`).

What is missing is the one thing ADR 0075 A7 named and deliberately deferred: **who may read a domain's decrypted content**, expressed so that a second principal never inherits read access by role. ADR 0071 step 5 ("revisit the content read API") and the ADR 0075 non-goals ("the content read API itself — own ADR behind Gate C") both point here. This ADR is that step.

The tenancy end state (ADR 0024/0027 claim flow, ADR 0029/0045 membership) is far from implemented, and Gate C must not wait for it or pretend to be it. It must instead cut the seam where membership will later plug in, while the instance still has exactly one principal.

## Scope

This ADR covers the **local HTTP surface that returns decrypted memory content** for one Pico Core host, and the readership authorization that gates it: which authenticated principal may read which privacy domain, and the route shapes that carry it under the `domain-content` class.

It does not add or change any at-rest cryptography (ADR 0070–0073 unchanged), does not define membership or key distribution (ADR 0029/0031/0032/0045), does not touch the write path or the reference-only `memory.recorded` event (ADR 0069), does not introduce remote access or TLS (ADR 0028/0030), and does not change the access modes (ADR 0041). It stays single-principal.

## Threat model

### Protected assets

- decrypted memory content behind the read surface, **per privacy domain** — the asset ADR 0075 listed first and left unguarded pending this gate
- the boundary between *administering* a host and *reading its residents' content* (ADR 0075 A7 / ADR 0024 host-admin boundary), which this surface is the first to make load-bearing
- the non-enumerability of privacy domains a principal may not read, once more than one principal exists

Stated honestly, and consistent with ADR 0071: this ADR adds **no confidentiality against the running process, the OS root user or physical disk** — the process already decrypts. It authorizes a network surface. It is also the first surface to return *full* content: below it, only the non-sensitive `summary` of `memory.recorded` already leaks to diagnostic clients (ADR 0069), so this gate genuinely raises the confidentiality bar, but only for content and only on the network path.

### Attacker model

Extending the ADR 0075 table for the content read surface:

| Attacker | Capability against this surface | Posture direction |
|---|---|---|
| Static-token holder (leaked env var, config backup) | Full `foundation-diagnostic` surface. | Hard ceiling holds: the principal-less token never reaches `domain-content` (ADR 0075 A1). It can already read `summary`; it can never read full content. |
| Operator session (the host administrator) | Administers the host; holds `host-admin*`. | **Must not** gain content readership *by that role* (A7). In the single-principal phase the operator reads all domains because it is the sole principal that owns them — not because it is the operator. The distinction is invisible now and structural in code, so a future Home Host Pico that administers the host does not thereby read a resident's domain. |
| Second principal with a live session (future member) | Reads its own domains. | Readership is evaluated per domain; a member reads the domains it is a reader of and no others, and holds no `host-admin*`. The seam this ADR cuts is exactly what makes that expressible without a rewrite. |
| Content-write poisoner | Already writes `memory.recorded` over the diagnostic class, setting an arbitrary `owner`/`controller` (unverified `deviceId`). | The readership evaluation **must never consult stored `owner`/`controller`** — they are attacker-controllable. Authorizing reads on them would be authorization on spoofable data (the A4 rule applied to stored provenance). |
| On-path LAN attacker (non-loopback mode, no TLS) | Reads response bodies in cleartext. | Full content on the wire is a sharper exposure than diagnostics were. Bounded only by the access mode; TLS stays out of scope (ADR 0075/0076 non-goal). Named as an honest limit and an ordering consideration, not solved here. |
| List-flooding attacker | Requests an unbounded domain listing to force mass per-item decryption. | Responses are bounded (paged, capped); per-item decryption is CPU work and an unbounded scan is a DoS lever, closed at Gate C. |

### The ADR 0016 questions, answered for this surface

1. **Who controls keys?** Unchanged (ADR 0071/0072). The read API carries no key authority and returns no key material; it decrypts in-process to answer an authorized read, exactly as the store already does.
2. **Which devices can read which domain?** This is the question Gate C answers at the API layer: an authenticated session of a principal with **readership** of the target domain. Foundation phase: the sole operator-principal's sessions, because a single-principal instance's domains are all its own. Membership machinery stays ADR 0029/0045; this ADR only cuts the seam it plugs into.
3. **What can a server see?** Unchanged — the process already decrypts. New network-visible state: decrypted content to an authorized reader, over the local surface.
4. **What can a relay see?** Nothing; this surface is local-only and never traverses a relay (ADR 0075).
5. **What happens after device loss?** A lost client device holding a session reads until the session expires or is revoked (ADR 0076); losing the host stays the ADR 0072 story.
6. **What happens after relationship revocation?** Single-principal phase: not applicable. The seam: removing a member revokes their sessions and their readership rows; the read API then denies them. Session revocation gates the API, never the keys — content already replicated elsewhere is an ADR 0031/0033 concern, never claimed solved here.
7. **How does backup restore work?** Unchanged. The read API is stateless over the store; a restore that resurrects content is re-tombstoned by the existing reconciliation (ADR 0070), and a crypto-shredded domain stays `contentUnavailable` even to an authorized reader.
8. **How does deletion interact with protected payloads?** Deleted and tombstoned items are not content: their content column is already NULL and they are absent from the read surface. A crypto-shredded item is present as metadata but reports `contentUnavailable`, never a decrypted value.

## Required properties

- **C1 — Readership is a distinct authority from the operator role.** `domain-content` is authorized by a per-`(principal, domain)` readership evaluation, never by the operator role or any `host-admin*` check. The operator-role branch must not lie on the `domain-content` path. This is ADR 0075 A7 made structural rather than documentary: "administration is not readership" has to be a property of the code, not a promise in prose.
- **C2 — No authorization on spoofable stored provenance.** The readership evaluation never consults the stored `owner`/`controller` of a memory item. Today those are unverified writer-supplied strings (`owner = request.owner ?? request.deviceId`, and `deviceId` is unverified — ADR 0075's own note on `POST /api/events`). Authorizing a read on them would be the A4 failure ("no identity from spoofable context") applied to stored data. A *verified* actor may enter the evaluation only once content writes are authenticated (the ADR 0075 additive-reclassification note), never before.
- **C3 — The authorization target is explicit in the route.** The domain being read is the `:privacyDomain` path segment, resolved the way the shred route resolves its target — never inferred from the body, a header or a default. A request that names a domain the principal may not read is denied on that domain, not silently redirected.
- **C4 — Fail-closed, non-enumerating denial.** An unreadable or unknown domain denies without revealing whether it exists or holds content, so a denied read cannot be used to enumerate other principals' domains (the read side of ADR 0075 A3). Ambiguity denies.
- **C5 — Honest unavailability, never fabrication.** A crypto-shredded or crypto-unavailable item reports `contentUnavailable` (reusing the store's existing resolution), not empty content and not a 500. Deleted and tombstoned items are absent from the read surface entirely.
- **C6 — Bounded responses.** Content listing is paginated with a capped page size and an opaque cursor, following the existing events-API cursor shape. Per-item decryption is CPU-bound, so an unbounded domain scan is never offered — it is a denial-of-service lever, closed here rather than later.
- **C7 — No new at-rest or transport confidentiality claim.** The API returns plaintext to an authorized reader because the process already decrypts (ADR 0071); it adds network-surface authorization only. Its privacy is bounded by the ADR 0041 access mode and the absence of TLS, and that bound is stated wherever the surface is described.

## Decision

### Domain readership as a seam, not a role

Authority for `domain-content` comes from **domain readership**, distinct from
both ADR 0087 local-host administration and signed Home/domain-authority relay.
Readership is evaluated per request as a function of the authenticated
principal and the target domain:

> `mayReadDomain(principal, privacyDomain) → boolean`

This is deliberately a *different question* from either administration plane,
answered by a different source:

| Class | Question | Answer source (foundation phase) |
|---|---|---|
| `host-admin` | Is this current local operator allowed to control host infrastructure? | Exact current operator session. |
| `home-authority-relay` | May this session transport signed evidence for this founding? | Exact Home-bound operator fallback or founding Home Host Pico; handler verifies the evidence authority. |
| `domain-content` | Is this session's principal a reader of this domain? | Pre-claim sole-resident policy, or claimed-Home membership plus explicit domain grant. |

The foundation-phase readership policy is "**one principal, reads all domains**" — but it is keyed on *there being a single authenticated principal that is this session*, never on the operator role and never on the stored `owner`/`controller` (C1, C2). The two evaluations must be two code paths so their present coincidence is not load-bearing:

- A **Home member** (ADR 0082) holds an authenticated session but no local
  operator role. `domain-content` can grant an exact domain; local
  infrastructure and ADR 0087 relay deny ordinary members.
- The **founding Home Host Pico** can reach signed-evidence relay but is not
  thereby a reader of a resident's private domain. Local retention/shred remain
  the exact-bound operator fallback's host powers. That is A7 realized:
  administration and relay do not read.

The honest transition this makes explicit: introducing a second principal with its own domains **narrows** what each principal reads, and the operator does *not* retain read-all by virtue of being operator. That narrowing must be a data change (membership/readership rows), never a rewrite of an authorization branch — which is precisely why the seam is cut now, while it trivially resolves to the sole principal, rather than retrofitted when it is expensive and risky.

### The read surface

Two routes, both `domain-content`, under the same `/api/memory/domains/:privacyDomain/…` prefix the shred route already uses:

| Route | Class | Returns |
|---|---|---|
| `GET /api/memory/domains/:privacyDomain/items` | `domain-content` | A bounded, cursor-paged page of the domain's **active** items with resolved content (C6). |
| `GET /api/memory/domains/:privacyDomain/items/:memoryItemId` | `domain-content` | One active item of the domain with resolved content, or `404` if it is absent, deleted or tombstoned. |

Each returned item carries the metadata that is already readable at rest (ADR 0071) — `memoryItemId`, `privacyDomain`, `contentType`, `contentPosture`, `deletionState`, `retentionPolicyRef`, timestamps — plus exactly one of:

- `content`: the decrypted (or plaintext-foundation) value, for a readable item;
- `contentUnavailable`: `key_shredded` or `crypto_unavailable`, for a `domain_encrypted` item whose key is gone or whose provider is absent (C5), reusing `MemoryStore.resolveContent` unchanged.

The stored `owner`/`controller` are advisory, unverified provenance. They are **not** authorization inputs (C2) and are omitted from the read response until a verifiable actor exists, so the surface never presents a spoofable field as if it were authoritative. A readership-filtered domain **index** (`GET /api/memory/domains`) is deliberately *not* part of Gate C — see open questions.

### Interaction with encryption, transport and the static token

- **Encryption on or off changes nothing about authorization.** With encryption off the content is `plaintext_foundation` and returned directly; with encryption on it is decrypted in-process. Either way the process reads, and the read API authorizes the *network* access, not the decryption — restating ADR 0071's honesty limit rather than implying a new one (C7).
- **The static token can never reach this surface.** Its ceiling is `foundation-diagnostic` (ADR 0075), and `domain-content` requires an authenticated principal with readership; a principal-less token satisfies neither. A token leak exposes `summary`, never full content.
- **Transport privacy is only as strong as the access mode.** Under `ha-ingress`/loopback the content stays within the host or the Home Assistant origin; under a non-loopback mode without TLS an on-path attacker reads it. This is a sharper exposure than diagnostics carried, and TLS is out of scope. The honest bound is stated (C7); a mode restriction for content reads is raised as an open question, not silently assumed.

## Route shapes

Gate C target shapes (ADR 0030 classification rules still apply; not a stable public contract):

| Route | Class | Notes |
|---|---|---|
| `GET /api/memory/domains/:privacyDomain/items` | `domain-content` | Authenticated principal with readership of `:privacyDomain`. Cursor-paged over `(createdAt, memoryItemId)`, capped page size, active items only. Denies non-enumeratingly (C4) when readership fails. |
| `GET /api/memory/domains/:privacyDomain/items/:memoryItemId` | `domain-content` | Same authority. `404` for an item that is absent, deleted or tombstoned; `contentUnavailable` for a shredded/crypto-unavailable encrypted item. |

Failure responses follow the existing posture: `401` with `WWW-Authenticate` for a missing/invalid session, `403`/`404` for a readership denial chosen so it does not enumerate, and uniform errors that do not distinguish "no such domain" from "not your domain" (C4).

## Two implementation traps that Gate C must not walk into

1. **Do not authorize `domain-content` through the operator branch.** The `onRequest` hook today authorizes *every* class above `foundation-diagnostic` with `authority === 'operator'`. Extending that branch to cover `domain-content` would encode "operator ⇒ read-all" — exactly the role inheritance A7/C1 forbid, and it would be invisible in tests because the sole principal *is* the operator. `domain-content` must run the readership evaluation as its own step, and the operator-role check must not be on its path. A test must prove that a principal which is authenticated-but-not-a-reader is denied, so the branch is exercised while a second principal still doesn't exist (e.g. a readership policy stub that returns false).
2. **Do not key readership on stored `owner`/`controller`.** They are unverified writer input (C2). A readership check that compares the principal to the stored owner authorizes on spoofable data. Foundation-phase readership authorizes on "the single authenticated principal," and the owner field stays out of the trust path until content writes are authenticated.

A third, quieter trap: **the listing must stay per-domain.** `MemoryStore.listInDomain` is already domain-scoped; Gate C must not add a cross-domain "list all items" convenience that would evaluate readership once and then return content across domains, bypassing C3.

## Ordering

Gate C requires Gate A (operator sessions, fail-closed classification) — built — plus the readership seam this ADR specifies. It is independent of Gate B (shred). Nothing regresses: until the runtime lands, the store stays reachable only programmatically and through the reference-only `memory.recorded` event, exactly as today.

## Non-goals

This ADR does not define or implement:

- membership, reader sets, domain ownership as a product concept, or key distribution (ADR 0029/0031/0032/0045) — the seam is where they plug in, not this ADR
- authenticated content writes or a verifiable `owner`/`controller` (ADR 0075 additive reclassification, deferred)
- a readership-filtered domain index or any cross-domain enumeration surface
- a content *write*/update/delete API over HTTP (deletion stays the tombstone/retention path; shred stays Gate B)
- TLS, an access-mode change for content reads (ADR 0041), or remote access
- search over content, projections, or padding of ciphertext length (ADR 0071 residual)
- compliance or regulatory claims

## Open questions

- **A readership-filtered domain index.** Without one, a reader discovers their domains from `memory.recorded` event metadata (visible at `foundation-diagnostic`), so discovery is not blocked. An index would need a *cross-domain enumeration* authority — the ability to answer "which domains may this principal read?" — which is a strictly larger power than "may this principal read domain D?". Deferred until membership makes it meaningful, so Gate C does not build enumeration authority prematurely.
- **A mode restriction for content reads.** Should the read API be confined to loopback/ingress until TLS exists, given it returns full plaintext where diagnostics returned only summaries? This is ADR 0041 territory (a `direct-content` distinction) and is raised, not decided.
- **When a verified owner enters the evaluation.** Once content writes gain a verifiable actor, does the stored verified owner become a readership input, and how does that compose with membership rows without reintroducing C2's spoofability?
- **Pagination shape.** Reuse the events cursor over `(createdAt, memoryItemId)` verbatim, or a dedicated content cursor? The events shape is the default unless a content-specific need appears.
- **Provenance exposure.** When actors become verifiable, does the read response start echoing `owner`/`controller`, and behind what label, so a client never mistakes advisory provenance for authority?

## Consequences

Positive:

- cuts the ADR 0075 A7 readership seam in code while it trivially resolves to the sole principal, so a second principal is a data change and never a rewrite of an authorization branch
- keeps "administration is not readership" structural — the operator role is never on the `domain-content` path — so a future Home Host Pico administers without reading residents' content
- refuses to authorize on the one attacker-controllable field in the write path (`owner`/`controller`), closing a spoofable-data authorization bug before it can be written
- reuses the store's existing content resolution (decrypt, `contentUnavailable`, active-only listing) rather than adding a parallel read path
- bounds the new surface's DoS (paged, capped) and states its transport/at-rest limits instead of implying confidentiality it does not add

Negative:

- introduces the first full-content network surface; its privacy is only as strong as the access mode until TLS exists, and that residual is real
- the readership seam carries a foundation-phase implementation ("one principal reads all") that looks like a no-op and must be tested against a not-a-reader stub to prove it is not one
- discovery of readable domains rides event metadata until an index exists, which is adequate for one principal and will need revisiting for many
- more transitional surface (`/api/memory/domains/:privacyDomain/items`) that the membership work (ADR 0029/0045) must later refine rather than replace

## Relationship to other ADRs

- Realizes **ADR 0075** Gate C and its A7 (administration is not readership), A1 (the static token never reaches `domain-content`) and A3 (fail-closed, non-enumerating). Leaves A11 intact: the readership seam is where membership plugs in, and the operator principal still consolidates under the Home Host Pico.
- Reuses **ADR 0076** mechanics unchanged: header-bound opaque sessions, the digest-stored session store, the access-class registry and its fail-closed `onRoute` hook. Adds no credential and no key surface.
- Stays within **ADR 0070/0071/0072/0073**: no new cryptography, no new at-rest claim; it exposes `MemoryStore` content resolution (decrypt in-process, `contentUnavailable` on shred) over an authorized network surface, and restates that at-rest encryption does not defend the running process. Completes ADR 0071 step 5 and ADR 0070's deferred content read API.
- Respects **ADR 0069**: the read API is the full-content surface that `memory.recorded` deliberately is not; the reference-only event and its non-sensitive `summary` are unchanged.
- Carries **ADR 0074** `retentionPolicyRef` through as read metadata; deletion authority and the sweep are unchanged.
- Leaves **ADR 0029/0031/0032/0045** as the membership/key end state; this ADR defines only the readership evaluation seam they will implement, and forbids (C2) using today's unverified provenance as a stand-in for them.
- The key-distribution side of the same seam is scoped by **ADR 0078**: membership rows (its Gate R3) are the declared successor of the foundation-phase readership policy on this API path *and* the issuance authority for reader-custody envelopes; for a reader-custody domain the host cannot decrypt, so `mayReadDomain` on the plaintext path is structurally false for everyone and content moves as envelopes instead.
- Constrained by **ADR 0016**: this is authorization, not cryptography — no new primitives, no invented scheme.
- Bounded by **ADR 0041** access modes and the ADR 0075/0076 no-TLS scope: the content surface's exposure is the access mode's exposure, stated as an honest limit and an open question.
