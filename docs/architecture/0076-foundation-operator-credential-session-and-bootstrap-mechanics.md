# 0076 - Foundation Operator Credential, Session and Bootstrap Mechanics

## Status

Accepted as the mechanism design for ADR 0075 Gate A, now implemented for the Foundation surface: operator credential, sessions, bootstrap, local reset, access-class enforcement, auth audit events and the dashboard login all exist. Gate A is therefore open; the surfaces behind Gates B and C stay closed.

## Context

ADR 0075 scopes local access control: a Foundation Operator principal, opaque revocable sessions instead of signed tokens, one access class per route, a `foundation-diagnostic` ceiling for the static token, and ordering Gates A–C. It deliberately deferred the mechanics and named them: credential handling, session transport, CSRF design, rate limits, bootstrap and reset flows.

The mechanics must fit the system that exists:

- The static-token hook in `apps/core/src/app.ts` guards every `/api/...` path indiscriminately when `PICO_FOUNDATION_TOKEN` is configured.
- ADR 0039 realtime tickets are already high-entropy, single-use, digest-stored, in-memory and minted under the static token — the pattern this ADR generalizes.
- ADR 0039 forbids credentials in URLs and forbids dashboard persistence of the token; the short-lived ticket is the single documented exception because browser WebSocket handshakes carry no custom headers.
- ADR 0041 access modes are the deployment gate; `direct-token` requires the static token for non-loopback binding.
- `libsodium-wrappers-sumo` is already a Core dependency, so `crypto_pwhash` (Argon2id) is available without a new dependency or a new primitive family (ADR 0016).
- Home Assistant is the first packaging path, and the appliance target is constrained hardware (Raspberry Pi class).

## Scope

Mechanism decisions for operator bootstrap, credential verification, session lifecycle and auth audit on the local Foundation surface. Route shapes are specified as the Gate A target, not as a stable public surface (ADR 0030 classification rules still apply).

Out of scope: the access classes themselves (ADR 0075), the surfaces behind Gates B/C, the Move-In/claim runtime (ADR 0024/0027), multi-operator or membership machinery (ADR 0029/0045), TLS, and Pico Link.

## Decision 1: Header-bound sessions, no ambient credential

The session credential travels in an `Authorization: Bearer <session>` header. **No cookies.**

This is not a stylistic preference; it removes an attack class instead of mitigating it:

- **Home Assistant ingress puts every add-on on one origin.** Under ingress the dashboard is served from the Home Assistant origin behind a path prefix (ADR 0040). A cookie would become ambient authority for that entire origin: any other add-on page there could make credentialed requests to Pico's ingress path, because cookie path scoping is not a security boundary against a same-origin page. `SameSite` does not help — those requests are same-site by definition.
- **No ambient authority means no CSRF.** A credential the browser never attaches automatically cannot be ridden by a cross-site or same-origin-sibling page. ADR 0075 A6 made the CSRF design conditional on cookies; that condition resolves to **no cookie, therefore no CSRF design** — the honest simplification rather than a `SameSite` bet with known gaps.
- **The API emits no CORS allow headers** (ADR 0030). A cross-origin page can neither read responses nor attach an `Authorization` header without a preflight that fails. Cross-origin write attempts are unauthenticated and rejected.
- **DNS rebinding is defeated by authentication itself.** A rebinding page runs on the attacker's origin and holds no session, whichever transport is used. This is why credential-based trust replaces network-based trust (ADR 0075 A4).
- It matches the existing dashboard posture (memory-only credential, ADR 0039) instead of contradicting it.

Accepted cost: an XSS on the serving origin can use an in-memory session as readily as it could use an `HttpOnly` cookie (it would make requests, not read the cookie). Header transport gives up `HttpOnly`'s exfiltration protection and buys CSRF elimination. For a single-origin local dashboard with no third-party content, that trade is correct.

The dashboard keeps the session **in memory only** — not in local storage, session storage, IndexedDB, cookies or URL parameters. This preserves the ADR 0039 rule unchanged. Honest cost: a page reload requires a new login. That is acceptable for a diagnostics dashboard and is revisited with the product UI, not weakened here.

### WebSocket

`WS /ws` keeps the ADR 0039 ticket flow, re-scoped: tickets are minted under an **operator session** where one exists, and under the static token where that is still the configured path. Ticket properties are unchanged (high entropy, single use, ~30 s, digest-stored, in-memory, purged, capped, scoped to one upgrade). The Origin check remains separate browser defense and is never identity (ADR 0075 A4). A ticket minted under a session inherits that session's authority and dies with it: revoking a session invalidates its outstanding tickets.

## Decision 2: Sessions are in-memory only

Sessions live in a process-local map keyed by digest. They are **never written to SQLite**.

| Property | Value |
|---|---|
| Identifier | 256-bit CSPRNG, base64url, opaque to clients |
| Server-side storage | SHA-256 digest only, timing-safe comparison — never the raw value |
| Persistence | none; a process restart ends all sessions |
| Expiry | sliding idle expiry with an absolute ceiling (proposed defaults: 60 min idle, 12 h absolute) |
| Revocation | per session (logout) and globally (revoke-all), both immediate |
| Bound | maximum concurrent sessions per process (proposed default: 32), oldest-first eviction |
| Logging | never logged, never in error messages, never in URLs |

Not persisting is a decision, not laziness. It **resolves the ADR 0075 restore-resurrection question by construction**: a restored backup cannot resurrect a revoked session, because no backup ever contained one. It also removes the need to exclude session rows from `sqlite-backup` and keeps the ADR 0072 backup story unchanged. It follows the ADR 0039 in-memory ticket precedent for exactly the same reason: a credential that is cheap to recreate should not become durable state.

The residual honest limit stands: a restored backup **can** resurrect a replaced operator credential, bounded by nothing but the operator noticing. A credential epoch does not fix this (the epoch restores too). It is documented, not denied.

Persisted state is therefore only: the credential verifier, its parameters and its creation/change timestamps.

## Decision 3: Argon2id via libsodium `crypto_pwhash_str`

The operator credential is a passphrase verified with **Argon2id** through libsodium's `crypto_pwhash_str` / `crypto_pwhash_str_verify`, using the already-present `libsodium-wrappers-sumo`.

Reasoning per ADR 0016 (use reviewed building blocks, never invent):

- Argon2id is the reviewed memory-hard default and the same toolkit that ADR 0071 already relies on — no new primitive family, no new dependency, no custom password scheme (an explicit ADR 0016 non-goal).
- `crypto_pwhash_str` embeds algorithm, salt and cost parameters in its output string, so the verifier is self-describing and `crypto_pwhash_str_needs_rehash` gives a parameter-upgrade path without a migration format of our own.

**Cost parameters: the interactive limits are the floor, not the ceiling.** libsodium's `MODERATE` preset allocates 256 MiB per verification; on a Raspberry Pi class appliance that is a denial-of-service amplifier before it is a defense. The Gate A runtime uses `OPSLIMIT_INTERACTIVE` / `MEMLIMIT_INTERACTIVE` (64 MiB) as the default, chosen for the appliance target and revisitable upward through `needs_rehash` once hardware assumptions are documented.

**Verification concurrency is bounded.** A memory-hard KDF turns an unauthenticated endpoint into a memory-exhaustion lever, so verification is serialized (one at a time per process) with a small queue cap; requests beyond the cap are rejected without verification. This is the KDF's DoS surface and must be closed at Gate A, not later.

Passkeys and hardware-backed identity stay a future option (ADR 0016 lists them as allowed direction); nothing here forecloses them, and nothing here implies they exist.

## Decision 4: Bootstrap through an Operator Bootstrap Code

While the host has **no operator**, and only then, the `setup-bootstrap` class accepts a bootstrap exchange: the caller presents an **Operator Bootstrap Code** and sets the initial passphrase.

| Property | Value |
|---|---|
| Generation | high-entropy CSPRNG, created at process start while no operator exists |
| Channel | the host's local channel only — process/container/add-on log or console (ADR 0027 protected display channel) |
| Lifetime | the process; a restart mints a new code and invalidates the old one |
| Storage | in-memory digest, never SQLite, never an env var |
| Use | single-use; consumed by the first successful bootstrap |
| Rate limiting | shares the bounded-verification path with login |
| Audit | the bootstrap is recorded append-only |

Why a code at all: the naive alternative — trust the first caller while unclaimed — is wrong precisely where the product ships. Under `ha-ingress` the caller is not necessarily the operator; it is anything that can reach the ingress path on the shared Home Assistant origin. A code sourced from the host's log requires the same local control that ADR 0027 requires, on every platform, without a platform-specific display path.

Why per-process and not persisted: a restart is itself a local operation, so regeneration proves local control again and keeps bootstrap state out of the database and its backups. This mirrors the ticket and session decisions.

**This is not a Move-In Code.** It is a Foundation administration bootstrap for the operator principal (ADR 0075 A11), not a claim of an Empty Pico Home. When the ADR 0024/0027 claim flow lands, Setup Mode hosts both, the Move-In Code stays the product-level claim credential, and the operator consolidates under the Home Host Pico. The bootstrap code must never be described as a Move-In Code, a master key, a recovery secret or a durable admin credential (ADR 0027 boundaries apply verbatim). ADR `0080-pico-home-host-key-and-move-in-claim-threat-model-and-ceremony-direction.md` now designs that claim ceremony — reusing these mechanics (per-process code, digest storage, bounded verification, reset markers, server-synthesized audit) while keeping the two codes strictly distinct — and fixes the consolidation contract.

### Reset and recovery

A forgotten passphrase is recovered by an **explicit local reset**, never a remote endpoint and never a recovery question or backdoor: a documented startup-time reset (an environment flag or a marker file inside the data directory — both require filesystem or supervisor control of the host) clears the operator credential, drops all sessions and returns the host to bootstrap. The reset is recorded append-only.

Honest limit, stated rather than obscured: anyone with host filesystem or console control can reset the operator. That is not a defect of this design. Host control already implies process control and key access (ADR 0071/0072 scope), so pretending the API layer could resist it would be a false claim. Operator authentication defends the network surface, not the host.

Reset does **not** touch keys, memory content or the event log. It never reads or destroys domain data. Crypto-shredding remains a separate, Gate B, explicitly confirmed operation.

## Decision 5: Auth audit without amplification

Per ADR 0075 A9, only low-volume state changes that an attacker cannot trigger become append-only events. Proposed server-synthesized, content-free types, reserved for Gate A:

| Event | When |
|---|---|
| `auth.operator_bootstrapped` | the first operator credential is established |
| `auth.credential_changed` | the operator passphrase is replaced |
| `auth.operator_reset` | a local reset clears the operator |
| `auth.sessions_revoked` | all sessions are revoked at once |

They carry no credential material, no session identifiers, no passphrase metadata and no content; actor and time come from the event envelope (`deviceId`, `wallTime`), as with `memory.domain_shredded`. They are server-synthesized and not client-writable — the existing `serverSynthesizedFoundationEventTypes` mechanism (ADR 0071 step 4) covers this and must be reused rather than duplicated.

Deliberately **not** append-only: individual logins, logouts, failed logins, rate-limit hits, ticket minting. Failed logins are exactly the attacker-triggerable, unbounded class that A9 keeps out of an undeletable log. They go to bounded operational logging.

Honest limit: this means the durable record answers "was the credential changed?" but not "who logged in when?". For a single-operator local host the operational log covers the latter. Revisit when a second principal exists — a login history is only meaningful once logins can be attributed to different people.

## Route shapes

Gate A target shapes, with their ADR 0075 access class:

| Route | Class | Notes |
|---|---|---|
| `POST /api/auth/bootstrap` | `setup-bootstrap` | Bootstrap code + initial passphrase. Available only while no operator exists; `404`/`409` afterwards. |
| `POST /api/auth/session` | `public` | Login. Unauthenticated by definition; the rate-limited, bounded-verification surface. Returns `{ session, expiresAt }` in the ADR 0039 ticket-response style. |
| `DELETE /api/auth/session` | authenticated | Logout of the calling session. |
| `GET /api/auth/session` | authenticated | Session probe for the dashboard (does the session still live, when does it expire). No credential echo. |
| `DELETE /api/auth/sessions` | `host-admin` | Revoke all sessions, including the caller's. |
| `PUT /api/auth/credential` | `host-admin` | Change the passphrase; requires the current passphrase in the body, not merely a live session. |
| `POST /api/realtime/tickets` | `foundation-diagnostic` | Existing route; now also mintable under a session (ADR 0039 flow otherwise unchanged). |

Failure responses follow the existing posture: `401` with `WWW-Authenticate` for missing/invalid credentials, `403` for rejected origins, and uniform, non-enumerating errors — a wrong passphrase and an absent operator must not be distinguishable by response.

### Two implementation traps that Gate A must not walk into

1. **The static-token hook currently guards every `/api/...` path.** `/api/auth/*` must be exempted from it and enforce its own classes. Otherwise, in `direct-token` mode, logging in would require the static token — which would make the token a prerequisite for the principal that is supposed to outrank it, and would make bootstrap impossible on a host that wants sessions instead of a token.
2. **Class enforcement must fail closed structurally, not by convention.** ADR 0075 A2/A3 require that an unclassified route is not routable. The runtime needs a central route-to-class registry (or per-route declaration) plus a hook that rejects any `/api/*` route that carries no class — so a future route added without a class fails immediately in tests rather than shipping open. A checklist in a document is not enforcement.

## Composition with existing boundaries

- **Static token**: unchanged semantics (ADR 0038), unchanged ceiling (ADR 0075: `foundation-diagnostic`). Sessions and the token are independent paths; the dashboard prefers session login. Deprecation stays undecided (ADR 0075).
- **Access modes** (ADR 0041): unchanged by this ADR. A bootstrapped operator is a stronger boundary than a static token, so a session-aware mode that permits non-loopback binding without `PICO_FOUNDATION_TOKEN` is the obvious follow-on — but it is a packaging and startup-validation change in ADR 0041 territory and needs its own decision. Until then, `direct-token` still requires the token.
- **Home Assistant ingress** (ADR 0040/0041): unchanged and still not authentication. Under `ha-ingress` the operator logs in *after* Home Assistant's own login. The second login is the price of ADR 0075 A4 and of the shared add-on origin; it disappears only if the ADR 0041 ingress-header question is ever answered with a tested, spoofing-proof path.
- **ADR 0039 tickets**: preserved, re-scoped to sessions. The URL-credential exception stays limited to short-lived single-use tickets.

## Implementation implications

Gate A checklist, now built:

1. **Done** — `OperatorStore` (`apps/core/src/operator-store.ts`): Argon2id verifier at interactive limits in `foundation_operator` (migration `0010`), serialized verification with a bounded queue, passphrase change requiring the current one.
2. **Done** — `SessionStore` (`apps/core/src/session-store.ts`): digest-keyed, sliding idle + absolute expiry, per-session and global revocation, count cap with oldest-first eviction, purge. Never persisted.
3. **Done** — `OperatorBootstrapCode` (`apps/core/src/operator-bootstrap.ts`): per-process code on the host log, single use, gated on operator absence.
4. **Done** — one-shot local reset marker (`<data>/operator-reset`), consumed at boot, audited.
5. **Done** — `AccessClassRegistry` (`apps/core/src/access-classes.ts`) enforced from Fastify's `onRoute` hook, replacing the blanket static-token hook; `/api/auth/*` is reachable without the token and the token stops at `foundation-diagnostic`.
6. **Done** — the four `auth.*` types via `serverSynthesizedFoundationEventTypes`, with the `public-surfaces.md` and `compatibility-levels.md` fences updated and test-bound.
7. **Done** — tickets mint under a session and are purged when it is revoked.
8. **Done** — dashboard operator login: memory-only session, preferred over the static token, re-login on reload, no persistent store touched.
9. **Done** — Core 141 → 167, web 17 → 22, protocol 33 → 34.

Two behaviours worth recording because they were decided during implementation:

- **An operator raises the bar for diagnostics.** Once an operator exists, `foundation-diagnostic` requires a credential even when no static token is configured. Establishing an operator is an explicit act, and on the shared ingress origin an open diagnostic surface would keep leaking event metadata to every add-on page — which would make bootstrapping pointless for reads. Hosts with no token and no operator keep the unchanged trusted-local behaviour, so nothing that exists today breaks. For the same reason `WS /ws` requires a credential once an operator exists.
- **Fastify's auto-generated HEAD routes are classified with their GET.** They serve the same resource; a HEAD route without a GET still fails closed. The registry found this on its first run, which is the point of enforcing at registration.

Known residual, honest: the Argon2id verifier lives in the database, so a stolen database or backup permits offline guessing of the operator passphrase. Argon2id is the mitigation, not a proof; a weak passphrase falls. This does not widen content exposure — whoever holds the database already holds whatever the ADR 0071/0072 at-rest layer does not protect.

No implementation describes the result as production authentication for remote access, Pico identity, Home membership or Pico Link.

## Non-goals

This ADR does not define or implement:

- the surfaces behind Gates B/C (shred trigger, retention CRUD, content read API)
- multi-operator, roles beyond operator, or membership credentials
- passkeys, hardware-backed identity or second factors
- account recovery beyond an explicit local reset
- session persistence, refresh tokens or remember-me
- an access-mode change (ADR 0041)
- ingress-header trust (ADR 0041 open question)
- TLS, mDNS or browser-trust for appliances
- Pico Link authentication or remote access
- rate-limit tuning as a product feature, or compliance claims

## Open questions

- Should reload survival (per-tab `sessionStorage`) be reconsidered for the product UI, given it weakens the ADR 0039 no-persistence rule for a short-lived, revocable credential?
- Should idle/absolute expiry, session cap and rate-limit thresholds become configuration, or stay fixed like the ADR 0039 ticket TTL?
- Should the Argon2id parameters be raised above interactive limits when the host is known not to be appliance-class, and how would that be detected rather than guessed?
- Does `direct-operator` (non-loopback without a static token) belong in the ADR 0041 mode table once Gate A ships?
- Should successful logins become append-only once a second principal exists, and what prevents that from reintroducing the amplification A9 avoids?
- How should the bootstrap code be surfaced on the future Pico Home Image (console, display, QR) without becoming a Move-In Code lookalike?

## Consequences

Positive:

- eliminates CSRF by construction instead of mitigating it, and states why the shared HA add-on origin makes cookies the wrong default
- removes the session restore-resurrection risk entirely by never persisting sessions, closing an ADR 0075 open question
- reuses primitives, dependencies and mechanisms already in the tree (libsodium, ticket pattern, server-synthesized events) instead of adding a parallel stack
- names the KDF's own DoS surface and closes it in the same decision
- gives Gate A a concrete, testable checklist and two named traps
- keeps the bootstrap credential distinct from the Move-In Code while reusing the ADR 0027 pattern

Negative:

- a page reload and a process restart both force a new login; this is real UX friction accepted for the foundation phase
- header transport gives up `HttpOnly`, so an XSS on the serving origin can exfiltrate a live session
- a stale restore can resurrect a replaced credential; unresolved and documented
- host filesystem/console control defeats operator auth by design; the layer's honest limit
- an operator login is added on top of the Home Assistant login under ingress
- more transitional surface (`/api/auth/*`) that the claim flow must later consolidate

## Relationship to other ADRs

- Realizes the mechanics deferred by `0075-foundation-local-authentication-session-and-membership-threat-model-and-scoping.md` and satisfies its A5 (opaque revocable sessions), A6 (reviewed KDF, no ambient credential, no credentials in URLs), A9 (audit without amplification) and A10 (local one-time bootstrap).
- Constrained by `0016-cryptography-boundaries-and-non-goals.md`: Argon2id via libsodium, CSPRNG identifiers, no invented scheme, no signed tokens.
- Refines `0039-foundation-websocket-ticket-boundary.md`: the ticket flow survives, re-scoped under sessions; the no-credentials-in-URLs and no-dashboard-persistence rules stay intact.
- Extends `0038-foundation-local-access-hardening-and-ingress-boundary.md` and leaves `0041-foundation-access-modes-and-direct-port-gate.md` unchanged, naming the session-aware access mode as a separate follow-on.
- Follows the ADR 0027 protected-channel pattern for bootstrap without becoming the ADR 0024/0027 Move-In Code, and consolidates under the Home Host Pico per ADR 0075 A11.
- Reuses the server-synthesized event mechanism introduced for `memory.domain_shredded` (ADR 0071 step 4) and the audit style of ADR 0037.
