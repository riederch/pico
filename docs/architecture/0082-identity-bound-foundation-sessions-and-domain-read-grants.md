# 0082 - Identity-Bound Foundation Sessions and Domain Read Grants

## Status

Accepted and implemented for the first ADR 0078 Gate R3 runtime slice. This ADR
defines the proof, persistence and authority boundaries that let a claimed Pico
Home serve host-custody domain content to verified Pico identities. It does not
implement reader-custody key envelopes or make the Foundation HTTP surface
public.

## Context

The Foundation has three individually useful pieces that are not yet a safe
multi-principal path:

- opaque, revocable operator sessions;
- signed Pico Home membership credentials and lifecycle statements; and
- `HomeMembershipReadership`, which requires membership plus a domain grant.

Connecting them by putting a Pico identity fingerprint in a request header, by
mapping every operator session to the Home Host Pico, or by treating membership
as readership would violate ADRs 0075, 0077, 0079 and 0080. A session needs a
fresh proof from a device key whose delegation is verifiable, and a domain grant
needs signed controller authority independent of the Foundation operator.

## Scope

This slice covers:

- short-lived, one-use verifier challenges;
- identity-bound opaque Foundation sessions created after device-key possession
  and an active `surface_session` delegation are verified;
- durable signed delegation and revocation evidence used to fail closed on
  later requests;
- Home-Host-Pico-signed grants and revocations for existing
  `host_custody` memory domains; and
- claimed-home readership requiring both active membership and an active
  domain grant.

It does not cover reader-custody KEK issuance, envelope storage or transport;
member-owned domain creation; a global identity registry or online revocation
service; delegated domain controllers; remote exposure of the local Foundation
API; or protected-display guarantees.

## Threat model

| Attacker or failure | Required posture |
|---|---|
| Request forges an identity header or body field. | No request field is an authenticated principal. Only the principal stored with a successfully issued opaque session is used. |
| Stolen device public records are replayed. | The device must sign a verifier-chosen 32-byte nonce and instance-bound context. Challenges expire, are capacity-bounded and are consumed on the first verification attempt. |
| Delegation is absent, expired, out of scope or revoked. | Session issuance fails. Every later request rechecks the durable lifecycle evidence at the current server time and fails closed. |
| Operator grants itself content access. | Operator credentials administer the host but never mint identity, membership or readership authority. Grant intake accepts only a signature rooted in the Home founding identity. |
| Membership is mistaken for readership. | Claimed-home content reads require active membership **and** a current domain grant. Either loss denies the read without revealing whether the domain exists. |
| Genuine grant is replayed across Home, host or domain. | Signed bytes bind the Home id, host signing-key fingerprint, privacy domain, controller identity and reader identity. |
| Restore resurrects stale or forged evidence. | Stored identity and grant records are re-verified against their cryptographic roots; invalid records are dropped before they can authorize. Current stored lifecycle order wins. |
| Restore predates a revocation that has never reached this host. | This slice cannot detect that fact without an external freshness source. The host is authoritative only over the signed lifecycle evidence it has observed. R1 remains open for registry/sync freshness. |

## Decision

### Identity session ceremony

`POST /api/auth/identity-challenges` is public but available only for a claimed
Home. It returns:

- an opaque challenge id;
- a random 32-byte verifier nonce;
- `pico.home.surface-session.v1:<hostSigningKeyFingerprintHex>` as verifier
  context; and
- a short server-stamped expiry.

The context is an ASCII token and binds possession to the current Foundation
instance. Home reset rotates the host keys and therefore invalidates challenges
from the previous Home.

`POST /api/auth/identity-session` consumes the challenge before verification
and accepts:

- the Pico identity key record;
- the device signing key record;
- one identity-signed device delegation;
- zero or more identity-signed revocations; and
- the device signature over the existing `pico.id.possession.v1` input using
  the challenge nonce and context.

The server verifies:

1. the identity is an active member of the current Home;
2. both key-record fingerprints;
3. the identity signature over the delegation and every supplied revocation;
4. that the delegation binds this identity and device signing key;
5. an active delegation at server time with `surface_session` scope; and
6. device-key possession over the exact challenge.

Successful sessions remain random opaque bearer values held only in memory.
Their server-side record carries a typed identity principal. It is not a signed
or self-contained token, and restart ends it exactly like an operator session.

Every use of an identity session re-evaluates current membership and the stored
delegation/revocation set. Expiry, eviction, revocation, missing evidence or
home reset makes the session inert and removes it. Supplying lifecycle evidence
at login is monotonic for the local store: an older client cannot erase a
revocation already observed by the host.

Operator sessions remain typed `operator`; they acquire no Pico identity.
Static Foundation tokens remain principal-less and capped at diagnostics.
Identity sessions may satisfy `authenticated` and `domain-content`, but never
`foundation-diagnostic`, `host-admin` or `host-admin-destructive`.

### Domain read grants

The first grant authority is deliberately narrow. The current Home Host Pico,
anchored by the signed founding record, may grant an active Home member access
to an existing `host_custody` privacy domain on that Home. A Foundation operator
may relay the signed statement but cannot create it. Delegated controllers and
member-owned `reader_custody` domains remain outside this slice.

Two new Home signature-input families are canonical:

`pico.home.domain-read-grant.v1`

1. label
2. suite
3. grant id
4. Home id
5. host signing-key fingerprint
6. privacy domain
7. controller Pico identity fingerprint
8. reader Pico identity fingerprint
9. valid-from instant
10. valid-until instant
11. lifecycle order

`pico.home.domain-read-grant-lifecycle.v1`

1. label
2. suite
3. lifecycle id
4. grant id
5. Home id
6. host signing-key fingerprint
7. privacy domain
8. controller Pico identity fingerprint
9. reader Pico identity fingerprint
10. status (`revoked`)
11. reason category
12. changed-at instant
13. lifecycle order

Both records are signed by a `pico_identity` key whose fingerprint equals the
founding record's Home Host Pico identity. Grant ids and lifecycle ids are
replay-safe: an identical statement is idempotent; the same id with different
bytes is rejected. The freshest lifecycle order determines the current state.
A grant is active only inside its validity window, for the current Home/host,
while its reader has active membership, and while no accepted revocation is
freshest.

The host-admin relay surface is:

- `POST /api/home/domain-read-grants`
- `POST /api/home/domain-read-grant-lifecycle`
- `GET /api/home/domain-read-grants`

Successful first-time intake appends content-free
`home.domain_read_granted` or `home.domain_read_revoked` audit events. Events
carry only grant/lifecycle, domain and reader references; they never carry
content, keys, signatures or complete signed credentials.

Authoritative S1 accepted vectors (synthetic key references only):

| Case | Bytes | Canonical bytes (hex) |
|---|---:|---|
| `domain-read-grant-home-member` | 305 | `0000001e7069636f2e686f6d652e646f6d61696e2d726561642d6772616e742e7631000000107069636f2e73756974652e69642e7631000000136772616e745f32303236303732375f3030303100000012686f6d655f32303236303732375f303030310000002011111111111111111111111111111111111111111111111111111111111111110000000e646f6d61696e5f6a6f75726e616c00000020888888888888888888888888888888888888888888888888888888888888888800000020999999999999999999999999999999999999999999999999999999999999999900000018323032362d30372d32375431303a30303a30302e3030305a00000018323032362d31302d32375431303a30303a30302e3030305a000000147365713a30303030303030303030303030303031` |
| `domain-read-grant-lifecycle-revoked` | 349 | `000000287069636f2e686f6d652e646f6d61696e2d726561642d6772616e742d6c6966656379636c652e7631000000107069636f2e73756974652e69642e76310000001d6772616e745f6c6966656379636c655f32303236303732375f30303031000000136772616e745f32303236303732375f3030303100000012686f6d655f32303236303732375f303030310000002011111111111111111111111111111111111111111111111111111111111111110000000e646f6d61696e5f6a6f75726e616c000000208888888888888888888888888888888888888888888888888888888888888888000000209999999999999999999999999999999999999999999999999999999999999999000000077265766f6b65640000000e7265616465725f72656d6f76656400000018323032362d30382d30315431303a30303a30302e3030305a000000147365713a30303030303030303030303030303032` |

Negative vectors reject inverted grant validity and a lifecycle status other
than `revoked`. They live with the existing Home signature-input suite under
`docs/protocol/fixtures/home-signature-input/`.

### Read path transition

An unclaimed Foundation preserves the existing sole-resident development
policy. Once a signed founding record exists, the default read path becomes
membership-backed:

```text
verified identity session
  AND active Home membership
  AND active signed domain grant
  -> domain content read
```

Operator sessions fail that path because they have no identity principal.
Configured test policies remain injectable, but production defaults are
claim-aware and cannot silently fall back to sole-resident after founding.

## Security and privacy consequences

- A stolen identity session is a bearer credential until session expiry or
  revocation, as for operator sessions. The narrower principal and dynamic
  lifecycle checks reduce authority; they do not turn bearer transport into
  proof-of-possession per request.
- The local database stores public keys, signed authority statements and
  reader-graph metadata. It stores no identity private key, raw session value,
  domain KEK or memory content in these new records.
- Grant inventory is sensitive relationship metadata and remains host-admin
  only. Domain-read denial is a non-enumerating `404`.
- Local freshness is monotonic only over evidence this host has received.
  Global stale-restore resistance requires R1 registry/sync integration and is
  not claimed here.
- `host_custody` means this Foundation process can decrypt. This slice authorizes
  which verified Home member may invoke that local read; it does not satisfy
  ADR 0078's reader-custody hosting boundary.

## Gates

- **S1:** canonical grant/lifecycle builders and positive/negative vectors.
- **S2:** one-use instance-bound possession challenge and typed opaque sessions.
- **S3:** durable verified identity lifecycle evidence with dynamic fail-closed
  session re-evaluation.
- **S4:** durable signed grant/lifecycle intake, ordering, boot reconciliation
  and content-free audit.
- **S5:** claimed-home read path requires identity session, active membership
  and active grant; operator, cross-home, cross-host, cross-domain, expired,
  evicted and revoked cases deny.

This completes the narrow access-control portion of ADR 0078 Gate R3 only.
Envelope issuance still waits for R1 freshness/reader-key custody and the
remaining R3 controller/key-distribution integration.

## Related ADRs

- ADR 0075 supplies the local API and authority-separation threat model.
- ADR 0076 supplies opaque in-memory session mechanics.
- ADR 0077 supplies the non-enumerating domain-readership seam.
- ADR 0078 defines membership-versus-key-distribution and R1/R2/R3 gates.
- ADR 0079 supplies key records, possession, delegation and lifecycle ordering.
- ADR 0080 supplies the signed Home founding and membership authority roots.
- ADR 0081 supplies person-role private-key custody; no private identity key is
  imported into Core by this decision.
