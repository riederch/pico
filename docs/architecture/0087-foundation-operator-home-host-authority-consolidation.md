# 0087 - Foundation Operator and Home Host Authority Consolidation

## Status

Accepted and implemented for the local Foundation API. The Foundation operator
is retained as a console fallback, bound after claim to one exact Home founding.
Local host infrastructure and signed Home/domain-authority relay are separate
access classes. There is no unsigned Home-governance endpoint.

Continuity/host-key rotation, remote transport, delegated Home administration
and retirement of the local fallback remain separate future work.

## Context

ADR 0075 A11 and ADR 0080 H9 require the phase-scoped Foundation operator to
consolidate under the Home Host Pico after founding. Before this ADR, every
Home evidence route still used `host-admin`, and every `host-admin*` route
accepted only an operator session. That was safe against signature forgery
because the handlers verified signed records, but incomplete in two ways:

- the same local credential was not durably bound to the Home it administered;
- the founding Home Host Pico could authenticate as an identity but could not
  reach the signed-evidence administration surface.

Treating the operator as a second Home root would violate the tenancy model.
Retiring it immediately would also pretend that physical host administration
and recovery no longer exist. The required result is a narrow local mechanism
that can relay or withhold records and administer host storage, but cannot sign
as a person, mint membership, become a reader, or move between Homes.

## Decision

### Two administration planes

The local API distinguishes two planes:

| Plane / class | Accepted session | Current routes | Authority actually changing state |
|---|---|---|---|
| Local host infrastructure (`host-admin`) | Current operator session | global session revocation, operator credential change, retention-policy CRUD | Local host control. |
| Destructive local infrastructure (`host-admin-destructive`) | Current operator session plus exact confirmation | host-custody domain shred | Local host control, with existing durable audit. |
| Signed authority relay (`home-authority-relay`) | Exact Home-bound operator fallback, or active founding Home Host Pico identity session | membership/lifecycle, domain-read grants/lifecycle, share-envelope issuance/finalization/list, reader-custody domain/reader/writer/lifecycle/rotation/item relay/list | The signed founding, controller, owner, issuer, exact reader/writer or rotation evidence verified by each handler. |

`public`, `setup-bootstrap`, `foundation-diagnostic`, `authenticated` and
`domain-content` retain their existing meanings. The static token remains
capped at diagnostics. Domain content still requires readership and never
falls through either administration plane.

There is deliberately no class or route on which an operator session alone
performs Home governance. A future unsigned Home mutation is not a relay route;
it requires a separate signed request family, access-class decision and ADR.

The founding Home Host Pico reaches `home-authority-relay` through an active
identity session whose identity fingerprint exactly matches the founding
record and whose Home membership remains active. An ordinary active member is
denied. No new delegation scope is inferred: the session grants transport
reachability, while the record's identity-root/controller/owner/device
signature remains the mutation authority. Delegated Home governance therefore
cannot be smuggled in through `surface_session`.

### Exact operator binding

Migration `0002_foundation_operator_home_binding` adds
`foundation_operator.home_binding_json`. It is:

- `NULL` only in the unclaimed phase; or
- `{homeId, foundingId, hostSigningKeyFingerprintHex}` for a claimed Home.

The binding is stored beside the verifier and copied into every in-memory
operator session principal. On every request, Core compares three values:

1. the session snapshot;
2. the current persisted operator record; and
3. the current signed Home founding, or the unclaimed phase.

All three must match. A mismatch revokes the session and its realtime
derivatives. The binding is not a signature or a trust-chain member; it is an
anti-transplant constraint on the local credential.

### State transitions

#### Claim

At founding acceptance, Core refuses a credential already bound to a different
founding. It records the claim, immediately narrows an existing unclaimed
operator to the new exact binding, and revokes every pre-claim session, ticket
and socket. A pre-claim session cannot cross the authority transition even if
it is concurrently retained by a client.

The database claim and operator update are adjacent synchronous SQLite writes,
not one shared transaction. If the second write or the process fails, the
claimed Home survives but the unbound credential fails the three-way check.
Recovery is explicit local operator reset/bootstrap; failure cannot widen
authority.

#### Post-claim bootstrap and operator reset

If no credential exists on a claimed Home, bootstrap creates it already bound
to the current founding. Operator reset removes only the local verifier/binding
and sessions. Re-bootstrap restores local host access and signed-evidence relay
for that exact Home; it does not create Home signatures, membership,
reader-custody keys or readership.

#### Home reset

The separate local Home-reset marker destroys the Home claim/host-key state,
clears the operator Home binding and revokes sessions. The local passphrase may
survive as unclaimed host access because filesystem control already authorized
the reset. It cannot reach `home-authority-relay` until a new founding binds it,
and that later claim revokes the unclaimed session again.

#### Restore

Sessions never survive restart. A restored operator whose binding exactly
matches the restored founding may log in, retaining ADR 0076's honest residual
that a backup can restore an older passphrase. An unbound, foreign or stale
binding on a claimed Home is never auto-rebound: startup logs the conflict,
login fails with the uniform credential error, and bootstrap stays closed
until the explicit local reset path removes the credential. Malformed binding
state fails closed during loading.

## Security invariants

1. A Foundation operator credential is never a Pico identity, Home Host key,
   membership credential, domain controller, writer key or reader.
2. A post-claim operator is valid for exactly one `homeId`, `foundingId` and
   host signing-key fingerprint.
3. Operator binding grants route reachability only; every Home/domain mutation
   still requires its existing verified signed evidence.
4. The founding Home Host Pico may relay that evidence; an ordinary Home member
   may not.
5. Operator reset, Home reset and restore never mint or silently transplant
   Home authority.
6. Administration never implies domain readership. Reader-custody raw KEKs and
   plaintext remain outside Foundation.
7. Static-token, stale-session and pre-claim-session authority never reaches
   signed Home/domain relay.

## Verification

The runtime tests bind:

- unclaimed credential creation, one-way exact binding and cross-Home refusal;
- binding snapshots in opaque sessions;
- claim-time revocation and post-claim re-login;
- Home Host Pico relay access and ordinary-member confused-deputy denial;
- stale/foreign restored binding fail-closed plus explicit reset recovery;
- post-claim bootstrap with an exact binding;
- Home reset back to unclaimed local access without Home relay; and
- the additive migration and status reporting.

Existing signature, membership, reader-custody, domain-readership and static
token tests continue to prove that relay access cannot mint evidence or read
content.

## Consequences

Positive:

- A11/H9 is now structural rather than a promise: the operator cannot float
  between Homes and no longer monopolizes the Home evidence surface.
- Physical host control remains honestly represented without becoming a
  person/Home cryptographic root.
- Restore, operator reset and Home reset have distinct fail-closed semantics.
- Future route additions still fail boot when unclassified.

Negative and residual:

- A matching database backup can restore an older local passphrase; no external
  monotonic credential epoch exists.
- The retained console fallback can relay, withhold and locally destroy data,
  powers already inherent in host control. It cannot forge the signed records
  or reader keys it hosts.
- Claim and binding are fail-closed adjacent writes rather than one transaction.
- Remote/Vault transport, delegated administration, continuity and eventual
  operator retirement remain unresolved.

## Relationship to other ADRs

- Completes ADR 0075 A11 for the current local route set and refines its
  two-source access model into local host, signed Home/domain relay and
  readership authorities.
- Extends ADR 0076's verifier/session mechanics with phase/Home binding while
  preserving in-memory sessions and explicit local reset.
- Realizes ADR 0080 H9 and the operator-consolidation part of Gate M3.
- Reclassifies the ADR 0084 and ADR 0086 host-only relay routes without changing
  their controller/owner/writer signature authority or custody boundaries.
