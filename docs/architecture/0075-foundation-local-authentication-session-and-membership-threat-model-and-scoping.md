# 0075 - Foundation Local Authentication, Session and Membership Threat Model and Scoping

## Status

Accepted as an access-control threat model and scoping decision. Nothing in this ADR is implemented; every runtime piece stays behind the ordering gates below.

## Context

ADR 0030 classifies the current Foundation HTTP and WebSocket surface as trusted-local and lists what must exist before broader exposure: an authentication model, authorization and Home membership, session and token lifecycle, browser-origin/CSRF expectations, rate limiting, audit and endpoint classification. ADR 0038, 0039, 0040 and 0041 then built deliberately temporary guardrails — the static `PICO_FOUNDATION_TOKEN`, one-time WebSocket tickets, ingress packaging and fail-closed access modes — and each repeats that none of it is production authentication.

Three concrete surfaces are now blocked on exactly this gap:

- the memory content read API: protection-at-rest exists (ADR 0071 runtime), so the ADR 0070 ordering no longer blocks it — but there is no answer to *who* may read decrypted content;
- retention policy administration: the ADR 0074 runtime (policies, sweep) is programmatic-only because policy CRUD over HTTP is an admin power without an admin;
- the crypto-shred trigger: ADR 0071 step 4 shipped `shredDomainWithAudit` deliberately without an HTTP trigger "until an authenticated admin surface exists".

The tenancy model (ADR 0024, ADR 0027) creates the first *product* principal — the Home Host Pico — through Setup Mode and a Move-In Code. That flow depends on Pico identity machinery (ADR 0029, 0031–0034) that is far from implemented. Foundation administration cannot wait for it, and it must not be replaced by it either: this ADR scopes what may exist before the claim flow, and how it must dissolve into the claim flow later.

## Scope

This ADR covers **local access control for the Foundation HTTP and WebSocket surface of one Pico Core host**: who may operate the instance, who may read domain content through a future read API, and which route may ship under which authority.

It does not cover Pico Link or remote access (ADR 0028/0030 remote boundary unchanged), Home Assistant entity or service access (ADR 0019), membership credentials or multi-resident hosting (ADR 0029/0045), the Move-In/claim runtime (ADR 0024/0027), TLS, or any change to the encryption-at-rest model (ADR 0070–0074).

## Threat model

### Protected assets

- decrypted memory content behind a future `domain-content` read surface, per privacy domain
- destructive administration: crypto-shred (irreversible by design) and retention policy changes (delete data by policy, ADR 0074)
- the integrity of the append-only event log against unauthenticated writes and audit flooding
- diagnostic metadata (version, capabilities, claim state, event metadata including the plaintext `summary` of `memory.recorded`, ADR 0069)

Stated honestly: this ADR adds **no confidentiality layer**. The running process, the OS root user and physical disk access see exactly what they saw before; those attackers belong to ADR 0071/0072. This ADR defends the network-facing API surface only.

### Trust zones

| Zone | Trust meaning |
|---|---|
| Host console / loopback | Highest local trust; the only zone allowed to bootstrap the first principal. |
| Home Assistant ingress path | Reachability boundary owned by Home Assistant (ADR 0040/0041). Never an identity source. |
| Trusted LAN | Reaches the port in `direct-token` / explicit modes; untrusted for authority beyond its credentials. |
| Browser context on a user device | Runs the dashboard; exposed to cross-site attacks (rebinding, CSRF, XS-WS hijacking). |
| Internet | Out of scope entirely; remote access stays Pico Link / Relay (ADR 0028/0030). |

### Attacker model

| Attacker | Capability against this surface | Posture direction |
|---|---|---|
| Unauthenticated LAN client | In tokenless trusted-local deployments: read diagnostics, write foundation events. | Access modes (ADR 0041) already fail closed for non-loopback tokenless startup; sessions close the residual "trusted local" assumption. Nothing above `public` without a credential. |
| Malicious web page in the owner's browser | DNS rebinding, CSRF, cross-site WebSocket attempts. | Rebinding defeats network-based trust, so trust must be credential-based; if sessions use cookies, CSRF becomes real and the session ADR must solve it (A6). Origin checks stay hardening, never identity (A4). |
| Static-token holder (leaked env var, add-on config, config backup) | Full current `/api/...` surface. | Hard ceiling: a principal-less credential never reaches `domain-content` or `host-admin*` classes (A1). Leak damage stays bounded to diagnostics and event writes. |
| Client device with a live session, stolen or compromised | Acts as its principal until expiry. | Sessions are individually and globally revocable with bounded lifetime (A5); destructive operations carry confirmation friction (A8). |
| Credential brute-force | Online guessing against the login surface. | Reviewed KDF, rate-limited verification (A6); failures go to bounded operational logging, never unbounded into the append-only log (A9). |
| Audit-flooding attacker | Triggers failures to bloat the undeletable event log. | A9: attacker-triggerable failures are never persisted append-only. |
| Direct-port client spoofing ingress headers | Sends fabricated HA user headers. | Headers never authenticate (A4; restates ADR 0041). |
| Stale backup restore | Resurrects revoked sessions or a replaced operator credential. | Named honestly: bounded by session expiry; credential-epoch reconciliation is future work, same family as tombstone replay (ADR 0070). |
| Running process, OS root, physical disk | Everything. | Out of scope by nature (consistent with ADR 0071); at-rest protection is ADR 0071/0072. |

### The ADR 0016 questions, answered for this surface

1. **Who controls keys?** Unchanged (ADR 0071/0072). Sessions and operator credentials add no key authority; no session ever carries or exports a KEK, and no HTTP surface of any class may return key material. The operator credential verifier (a KDF hash) is host state, not a content key.
2. **Which devices can read which domain?** Now answerable at the API layer: devices holding an authenticated session of a principal with readership of that domain. Foundation milestone: the sole operator's authenticated clients, because a single-principal instance's domains are all its own. Membership machinery stays with ADR 0029/0045.
3. **What can a server see?** Unchanged for content — the process already decrypts. New host state: credential verifiers, hashed session records, auth audit events. There is no end-to-end claim anywhere in this ADR.
4. **What can a relay see?** Nothing; this surface is local-only. Sessions never traverse relays and are never Pico Link authentication.
5. **What happens after device loss?** A lost client device holding a session is handled by per-session and all-session revocation plus bounded lifetime. Losing the *host* stays the ADR 0072 story.
6. **What happens after relationship revocation?** Single-principal phase: not applicable. The seam for later: removing a member revokes sessions and membership, but sessions only gate the API — ciphertext access is governed by keys, and key rotation after membership change stays ADR 0031/0033 work. Session revocation must never be sold as key revocation.
7. **How does backup restore work?** Session and credential records are host state; a restore can resurrect revoked sessions (bounded by expiry) or a replaced credential. Sessions must be cheap to lose (re-login), so excluding or invalidating them on restore is acceptable; the honest residual risk is documented rather than denied.
8. **How does deletion interact with protected payloads?** Deletion semantics are unchanged (tombstones, shred). What changes: deletion *authority* becomes principal-bound, confirmed and audited — the shred audit event (`memory.domain_shredded`) already exists and gains an attributable actor.

## Required properties

- **A1 — Principal-bound authority.** Every request above `public` resolves to an explicit authority source. `domain-content` and `host-admin*` classes require an authenticated principal. A principal-less credential (the static token) reaches at most `foundation-diagnostic`.
- **A2 — Explicit route classification.** Every HTTP/WS route carries exactly one access class, assigned when the route is introduced. An unclassified route must not be routable.
- **A3 — Fail-closed evaluation.** Unknown session, ambiguous configuration or an authorization error denies. Ambiguity never authorizes — the access-control sibling of ADR 0074's "ambiguity never deletes".
- **A4 — No identity from spoofable context.** IP addresses, `Origin`/`Host` headers and ingress headers never establish a principal. They may harden (origin checks stay), never authenticate.
- **A5 — Sessions are opaque, revocable, expiring.** Server-side records keyed by high-entropy random identifiers, stored hashed, individually and globally revocable, with bounded lifetime. **No signed self-contained tokens**: signature schemes would pull ADR 0034 canonicalization into the trust path before it exists; opaque sessions need only CSPRNG and a hash — building blocks ADR 0016 already allows.
- **A6 — Reviewed credential handling only.** Credential verification uses a reviewed KDF (ADR 0016; no custom password schemes). No plaintext credential storage, no credentials or session identifiers in URLs (the one-time short-lived WS ticket of ADR 0039 remains the single documented exception and re-scopes under sessions), no secrets in logs, rate-limited verification. If session transport uses cookies, the same ADR must deliver the CSRF/same-site design.
- **A7 — Administration is not readership.** The operator role authorizes instance management and destruction, never domain content reads. Readability of a privacy domain belongs to the domain's owner and readers. In a single-principal instance the distinction is invisible — it must be enforced in the design anyway, because it is the ADR 0024 host-admin boundary arriving early. A second principal must never inherit read access by role.
- **A8 — Destructive administration is confirmed and audited.** Irreversible operations (crypto-shred) require an authenticated operator, explicit confirmation semantics and a durable content-free audit record (exists: `memory.domain_shredded`). Retention policy changes are administration with deletion consequences and require the same authority class.
- **A9 — Audit without amplification.** Low-volume, state-changing auth events (bootstrap, credential change, revocation, destructive operations) are recorded as server-synthesized, content-free append-only events (ADR 0037 style). Attacker-triggerable failures (bad logins, rate-limit hits) go to bounded operational logging and never unbounded into the append-only store.
- **A10 — Bootstrap is local, one-time, explicit.** The first principal is established only through a protected local channel while no principal exists — the Setup Mode pattern of ADR 0027. It is never derived from `PICO_FOUNDATION_TOKEN`, never from headers, never from mere network reachability. Re-bootstrap requires an explicit local reset. Both are audited. Physical/console control of the host cannot be defended against by this layer and is not claimed to be.
- **A11 — No parallel identity vocabulary.** The Foundation operator is a phase-scoped principal defined for succession: once the claim flow (ADR 0024/0027) creates a Home Host Pico, host-administration authority consolidates there, and the operator principal is bound to it or retired by that ADR. It must never survive as a hidden second root of authority, never become a Pico identity, and never leak into Pico Link surfaces.

## Decision

### The Foundation Operator

The first principal is the **Foundation Operator**: the person who administers this Pico Core instance. The *role* is permanent — every host has an instance administrator, and after the claim flow exists that role is held by the Home Host Pico (ADR 0024). The *representation* is transitional: a local principal with a locally bootstrapped credential, defined under A10/A11 so the claim flow can subsume it instead of competing with it.

The operator is not a Pico identity, not a Device Key, not a Home Membership Credential, not the Gastgeber Pico, and not a user-account system. Credential mechanics (passphrase KDF choice, optional passkeys later — both listed as allowed directions by ADR 0016) belong to the follow-up session ADR.

### Sessions

Authentication produces an opaque server-side session under A5/A6. Sessions replace the dashboard's static-token entry for humans; the ADR 0039 ticket pattern carries over with tickets minted under a session instead of the static token. Non-browser diagnostic clients may keep using the static token within its ceiling until a deprecation decision, which this ADR does not make.

### Access classes

Every route carries exactly one class (A2). Authority comes from exactly two sources: the **operator role** for `host-admin*`, and **domain readership** for `domain-content`.

| Class | Authority required | Current occupants | Planned occupants |
|---|---|---|---|
| `public` | none | `GET /health`; dashboard shell and static assets (needed to reach a login) | login surface |
| `setup-bootstrap` | protected local channel, only while no principal exists | — | operator bootstrap; later the Move-In/claim endpoint (ADR 0027) |
| `foundation-diagnostic` | access mode + static token where configured; later also operator session | `GET /api/system/version`, `GET /api/system/status`, `GET /api/events`, `GET /api/events/tail`, `POST /api/events`, `POST /api/realtime/tickets`, `WS /ws` | — |
| `domain-content` | authenticated principal with domain readership | — | memory content read API (ADR 0070 step 5) |
| `host-admin` | operator session | — | retention policy CRUD (ADR 0074) |
| `host-admin-destructive` | operator session + explicit confirmation + durable audit | — | crypto-shred trigger (ADR 0071 step 4) |

Honest note on `POST /api/events`: the `memory.recorded` content-splitting write (ADR 0069) carries personal content *into* the host over the diagnostic class. A token holder can therefore write — and poison — memory it can never read back. That stays acceptable for the foundation phase and is recorded as a threat; once principals exist, content-writing events should become principal-attributed (the currently unverified `deviceId` gains a verifiable actor), as an additive reclassification.

The WebSocket surface stays diagnostic because broadcasts carry event envelopes and summaries, never split-out memory content. If content ever streams, A2 forces reclassification.

### Static token and access modes

`PICO_FOUNDATION_TOKEN` keeps exactly its ADR 0038 meaning — temporary, principal-less transport hardening — with one new hard rule: **its ceiling is `foundation-diagnostic`**. It never authorizes content reads or administration, gains no scopes and no roles. The ADR 0041 access modes remain the deployment gate; sessions operate inside them. Home Assistant ingress remains a reachability boundary and never authenticates (A4; ADR 0040/0041 unchanged).

## Ordering gates

Nothing regresses before these gates: programmatic-only administration (retention, shred) and the absent read API remain the status quo.

1. **Gate A — `host-admin` surfaces (first: retention policy CRUD).** Requires: operator bootstrap (A10), session runtime (A5/A6), fail-closed route classification (A2/A3), auth audit (A9) — implemented and tested.
2. **Gate B — `host-admin-destructive` over HTTP (crypto-shred trigger).** Requires Gate A plus explicit confirmation semantics (A8). The durable audit event already exists.
3. **Gate C — `domain-content` read API.** Requires Gate A plus an explicit readership evaluation seam (A7) even while it trivially resolves to the sole operator — the seam must exist in code from day one so a second principal never inherits read-all. The ADR 0070/0071 protection prerequisites are already met.

Gate B and Gate C are independent of each other.

## Non-goals

This ADR does not define or implement:

- login, bootstrap, session or credential mechanics (KDF parameters, cookie-vs-header transport, CSRF design, rate-limit numbers — the follow-up session ADR)
- user accounts as a product concept, multi-operator administration or any membership credential machinery (ADR 0029/0045)
- the Move-In/claim runtime (ADR 0024/0027) or Setup Mode UX
- the content read API itself (own ADR behind Gate C)
- passkey/hardware-key selection, TLS, mDNS or browser trust for appliances
- Pico Link authentication, remote access or relay trust changes
- Home Assistant entity/service authorization (ADR 0019)
- token deprecation scheduling
- compliance or regulatory claims

## Open questions

ADR `0076-foundation-operator-credential-session-and-bootstrap-mechanics.md` now answers the mechanism questions below: session transport is header-bound with no cookies (so no CSRF design is needed), sessions are in-memory only (so the restore-resurrection question dissolves), credentials use Argon2id via libsodium, and bootstrap/reset run through a per-process Operator Bootstrap Code and an explicit local reset. The remaining entries stay open.

- ~~Cookie-based vs header-based session transport for the dashboard, and the resulting CSRF/same-site design (A6).~~ Decided in ADR 0076: header-bound, no cookies, no ambient credential.
- How operator login composes with `ha-ingress` mode UX — HA session first, Pico operator login second — without teaching users to bypass ingress.
- Operator credential recovery after loss: ADR 0076 fixes the direction (explicit startup-time local reset, audited, never a remote endpoint); the per-platform surface (console, add-on option, appliance button) stays open.
- ~~Whether session records should be excluded from `sqlite-backup` or invalidated on restore detection (credential-epoch direction).~~ Dissolved by ADR 0076: sessions are never persisted, so no backup can hold one. A restored backup can still resurrect a replaced credential — that residual limit stands.
- Whether `foundation-diagnostic` later splits (system metadata vs event plumbing) once sessions exist.
- When the static token enters deprecation once operator sessions cover its uses.

## Consequences

Positive:

- unblocks retention CRUD, the shred trigger and the content read API behind principled, named gates
- one authorization vocabulary (classes + two authority sources) instead of per-surface ad-hoc decisions
- keeps ADR 0034 canonicalization out of the authentication trust path (opaque sessions, no signed tokens)
- pulls the ADR 0024 administration-vs-readership boundary forward before a second principal exists
- bounds static-token leak damage explicitly (diagnostic ceiling)
- gives Theme B (claim/Move-In) a defined consolidation target instead of a competitor (A11)

Negative:

- introduces one more transitional construct (the operator principal) that the claim flow must later subsume — accepted, with A11 as the anti-backdoor rule
- adds bootstrap, login, reset and revocation UX burden to a local-first product
- session state in host storage adds restore-honesty obligations (resurrection window)
- until Gate A ships, the three blocked surfaces stay blocked; this ADR deliberately does not shortcut them

## Relationship to other ADRs

- Realizes the scoping step demanded by ADR `0030` ("Requirements before broader exposure": authentication, authorization/membership, session lifecycle, endpoint classification) for the local surface.
- Extends ADR `0038`/`0039`/`0040`/`0041`: the staged guardrails stay; the token gains an explicit authority ceiling; ingress stays non-authenticating.
- Constrained by ADR `0016`: reviewed building blocks only (KDF, CSPRNG); the no-signed-tokens rule keeps ADR `0034` out of this trust path.
- Respects ADR `0024`/`0027`: the operator is not the Gastgeber Pico; bootstrap follows the Setup Mode pattern; claim later consolidates authority (A11).
- Leaves ADR `0029`/`0031`/`0045` untouched as the identity/membership end state; A7 defines the seam where domain readership will plug in.
- Gates ADR `0070` step 5 (content read API), ADR `0071` step 4's missing HTTP trigger and ADR `0074`'s HTTP administration behind Gates A–C.
- Follows ADR `0037`'s audit style and ADR `0074`'s fail-safe principle (A3).
- Refined by ADR `0076-foundation-operator-credential-session-and-bootstrap-mechanics.md`, which specifies the credential, session, bootstrap, reset and auth-audit mechanics this ADR deferred, and which the Gate A runtime implements.
