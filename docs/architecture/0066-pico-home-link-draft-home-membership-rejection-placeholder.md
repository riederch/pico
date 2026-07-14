# 0066 - Pico Home Link Draft Home Membership Rejection Placeholder

## Status

Accepted as a draft-only Pico Home Link Home Membership Credential rejection boundary that deepens ADR 0045, before credential verification, issuer authority, lifecycle enforcement or domain-key membership are implemented.

## Context

ADR 0024 defines host tenancy: membership grants host use, not ownership of resident identity or resident domains.

ADR 0029 separates Home Membership Credentials, Pico Identity Keys, Device Keys, Home Host Keys and Domain Content Keys, and keeps host use separate from domain decryption.

ADR 0031 requires Home membership and domain access to stay separate: host membership grants host use only, never automatic plaintext access.

ADR 0033 defines Home Membership Credential lifecycle states such as invited, active, revoked, expired, evicted and transferred or reissued.

ADR 0045 defines the first constrained draft-only Home Membership Credential placeholder shape: issuer, subject, audience, membership, validity and revocation as synthetic placeholders, with no credential verification, no Home claim API, no Move-In Code substitute, no domain read rights and no runtime authorization. The current draft suite has one positive Home Membership fixture and one negative that rejects a Move-In Code masquerading as a credential.

ADR 0056 defines the Home Host Key placeholder and forbids host keys from decrypting resident domains.

The Home Membership Credential is the surface that says a Pico belongs to a Home. So far only the Move-In Code boundary is seeded. The still-open risks - a credential claiming Domain Content Key access, an expired credential claiming active membership, and a credential claiming a verified issuer or signature - are not yet rejectable.

The next useful step is a set of rejection placeholders that make the most dangerous membership interpretations fail early.

## Decision

Future draft Pico Home Link Home Membership fixtures may use rejection placeholders in addition to the ADR 0045 positive placeholder.

These placeholders are not a membership implementation. They do not verify credentials, issuers, signatures, validity or revocation, and they do not authorize anything.

A draft Home Membership Credential grants host-use scopes only, keeps its issuer and signature unverified, and reflects its true lifecycle status. Any input that breaks these boundaries is rejected.

## Core rule

```text
A Home Membership Credential grants host use, not domain decryption.
It must reject Domain Content Key access, expired-as-active claims, verified-issuer claims and Move-In Code substitution.
```

## Rejection boundaries

A draft Home Membership Credential must reject:

- membership that claims Domain Content Key access, private-domain read or plaintext access
- a scope that grants domain access instead of host use
- an expired credential that claims active membership
- a credential that claims a verified issuer, verified signature or verified membership authority
- a Move-In Code presented as a membership credential
- fixtures that omit required draft disclaimers
- fixtures that claim compatibility above draft-only
- fixtures that imply production security or commercial permission

## Draft rejection reasons

Draft Home Membership fixtures may use these rejection reasons:

```text
move_in_code_boundary
membership_domain_access_claim
membership_expired_active_claim
membership_verified_issuer_claim
```

`move_in_code_boundary` comes from ADR 0045. The other three are draft vocabulary for a domain-access claim, an expired-as-active claim and a verified-issuer claim.

These values are draft vocabulary only. They are not final conformance error codes.

## Membership is not domain access

A draft Home Membership Credential grants host-use scopes.

It must not claim:

- Domain Content Key access
- private-domain or shared-domain read rights
- plaintext access to resident domains
- a scope that names a domain

Membership grants host use - packet receive, storage queue, sync exchange. Domain access stays an explicit protected-domain decision with separate key envelopes, membership and audit, consistent with ADR 0031 and ADR 0056.

## An expired credential is not active

A draft Home Membership Credential reflects its true lifecycle status.

It must not:

- claim active membership after its validity has expired
- treat an expired credential as still granting host use
- hide an expired or revoked status behind an active claim

Lifecycle status stays honest; expiry and revocation must be able to end membership, consistent with ADR 0033.

## An issuer claim is not verified authority

A draft Home Membership Credential names a placeholder issuer.

It must not claim:

- a verified issuer
- a verified signature
- verified membership authority
- verified Home Host Key issuance

Issuer, signature and authority stay unverified placeholders until ADR 0034 canonicalization and signature inputs and Home Host Key verification exist.

## Relationship to Move-In Codes and Home Host Keys

ADR 0045 keeps a Move-In Code separate from a membership credential; ADR 0066 keeps that boundary and adds three more.

ADR 0056 Home Host Key placeholders may describe host infrastructure but must not decrypt resident domains; ADR 0066 keeps a membership credential from granting domain access even when it references a Home Host Key.

## Relationship to future verification

Before Home Membership Credentials carry security meaning, later ADRs must define:

- credential canonicalization and signature inputs
- issuer identity and Home Host Key verification
- validity and revocation checking
- lifecycle transition rules
- scope semantics and host-use enforcement
- domain-key membership as a separate decision
- audit persistence and visibility
- verifier behaviour for domain-claiming, expired-active or verified-issuer credentials
- conformance fixture families for positive and negative membership verification

Until then, Home Membership fixtures may only prove placeholder boundaries and rejection of unsafe claims.

## Demo boundary

A walking-skeleton demo may reference Home Membership Credential placeholders only as visibly unverified fixture data.

The demo must not:

- verify a real credential, issuer or signature
- grant host use or domain access
- treat an expired credential as active
- publish compatibility or security claims

If a demo needs real membership, this ADR is insufficient and reviewed credential, issuer, lifecycle, domain-membership and audit designs must come first.

## Implementation status

This ADR is documentation and fixture-gate direction only.

The repository does not implement:

- Home Membership Credentials
- credential canonicalization or signatures
- issuer or Home Host Key verification
- validity or revocation checking
- lifecycle transition enforcement
- domain-key membership
- a conformance runner for membership verification

## Non-goals

This ADR does not define:

- final membership credential schema
- cryptographic algorithms
- canonicalization output
- signature formats
- issuer verification protocol
- revocation protocol
- domain-membership protocol
- runtime parser
- production verifier
- compatibility level
- commercial permission

## Relationship to other ADRs

This ADR refines:

- `0045-pico-home-link-draft-membership-credential-placeholder.md`

It depends on and stays below:

- `0024-server-bootstrap-tenancy-and-eviction.md`
- `0029-identity-device-home-keys-and-e2e-boundaries.md`
- `0031-pico-link-identity-relay-and-domain-threat-model.md`
- `0033-key-lifecycle-rotation-revocation-and-recovery.md`
- `0056-pico-home-link-draft-home-host-key-placeholder.md`

It is staged under:

- `0042-pico-link-draft-schema-and-fixture-gate.md`

It is similar in staging intent to:

- `0063-pico-link-draft-protected-payload-rejection-placeholder.md`
- `0065-pico-link-draft-packet-envelope-rejection-placeholder.md`

It remains below future Pico Home Link membership, issuer, lifecycle, domain-membership and conformance specifications.

## Consequences

Positive:

- extends Home Membership rejection coverage beyond the Move-In Code boundary
- hardens the membership surface against domain-access, expired-active and verified-issuer claims
- keeps host use and domain decryption distinct
- makes the most dangerous membership interpretations rejectable early

Negative:

- adds more draft fixtures before a runtime exists
- draft fixture fields may need migration when final schemas are selected
- implementers must remember that these fixtures prove no credential, issuer or lifecycle verification
