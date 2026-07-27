# 0083 - Reader-Key Registration and Freshness Contract

## Status

Accepted and implemented for ADR 0078 Gate R1. This ADR closes the public
reader-key binding and pre-issuance freshness seam. It does not wrap domain
KEKs, issue or store envelopes, add a public registry transport, or expose key
selection over HTTP. ADR 0085 subsequently implements the signed-checkpoint
adapter behind this seam.

## Context

ADR 0082 proves possession of a delegated device signing key and persists
identity lifecycle evidence. The same delegation names a
`device_key_agreement` fingerprint, but Core previously never received or
verified the corresponding X25519 public-key record. A future envelope issuer
could therefore be tempted to trust a bare fingerprint or an unrelated stored
public key.

The durable lifecycle index is monotonic only over signed statements this Home
has observed. A restored database can predate a revocation that already exists
in an identity registry or on another synchronized device. Labeling the local
row "fresh" would turn backup age into key-distribution authority.

## Decision

### Session proof and durable registration

`POST /api/auth/identity-session` additionally requires the complete
`deviceKeyAgreementKeyRecord`. Core verifies all three public records:

- `pico_identity` for the delegation issuer;
- `device_signing` for challenge possession; and
- `device_key_agreement` for the future envelope recipient.

The key-agreement record's computed fingerprint must exactly equal the
delegation's `subjectKeyAgreementKeyFingerprintHex`. A cross-identity or
cross-device swap, malformed record, signing key presented in the agreement
role, or other role confusion fails the whole proof.

After membership, delegation, scopes and signing-key possession pass, Core
persists a reader-key projection containing:

- Home id;
- Pico identity fingerprint;
- device signing-key fingerprint;
- device key-agreement fingerprint and public record;
- delegation id; and
- local registration instant.

The signed delegation remains the authority. The projection is idempotent for
identical content and rejects a stable delegation id with different bindings.
Boot reconciliation re-verifies the identity lifecycle and key record, checks
the exact binding and active Home membership, and drops invalid or orphaned
reader-key rows. No private device key is stored.

### Local evidence versus external freshness

Core exposes an internal `PicoIdentityReaderKeyFreshnessSource` trust boundary.
An adapter may return `current` only after authenticating its registry/sync
source and verifying that the exact Home, identity, signing key, agreement key
and delegation binding is active and non-revoked at the reported checkpoint.
The result binds:

- all selection identifiers;
- the lifecycle order observed by the source;
- a check instant;
- a bounded `freshUntil`; and
- a non-secret source reference.

Core validates those echoes, canonical instants, the freshness window and that
the source observed at least the locally known lifecycle order. A future
checkpoint, an expired window, a checkpoint older than local evidence, a
binding mismatch or an adapter error fails closed.
Core additionally caps the accepted source window at five minutes by default;
an adapter cannot turn one successful lookup into delegation-long freshness.

Local lifecycle order is only an input to that check. It can make an external
checkpoint insufficient, but can never make a missing external checkpoint
sufficient. Freshness results are not accepted from HTTP request bodies and
are not persisted as unsigned SQLite facts. The production default source is
`unavailable`.

### Pre-issuance key selection

`PicoIdentityReaderKeySelector` resolves one exact requested reader-key
binding. It succeeds only when all of the following hold at evaluation time:

1. the identity is an active member of the named Home;
2. the registered key record has role `device_key_agreement` and its
   fingerprint matches;
3. the identity-signed delegation binds the identity, signing key and agreement
   key;
4. the delegation is valid, not revoked and has both `decrypt_domain` and
   `receive_key_envelope` scopes; and
5. the authenticated freshness source returns a current, sufficiently recent,
   exactly bound checkpoint.

This result is pre-authorization only. The following envelope-issuance slice
must still require a current domain grant, bind all ADR 0078/R2 envelope fields,
seal to this public key, persist the envelope conflict-free and re-evaluate
authority before every issuance or rotation.

## Compatibility

The identity-session request shape is intentionally tightened: older clients
that omit `deviceKeyAgreementKeyRecord` receive the existing generic invalid
request/proof response. This is a fail-closed security change in the
pre-compatibility Foundation API. Opaque sessions are memory-only, so no
pre-upgrade session survives a process restart.

Migration `0018_pico_identity_reader_keys` is additive and needs no backup
rewrite. Existing delegation rows do not automatically become reader keys;
the device must present the actual public record in a new session.

This ADR introduced no new cryptographic wire bytes or fixture family. ADR
0085 subsequently selects the internal identity-root-signed checkpoint bytes
and adapter without adding a public Registry/Sync protocol.

## Consequences

- Core no longer treats a delegated key-agreement fingerprint as proof that it
  knows the corresponding public key.
- A stale local restore cannot authorize envelope targeting when the freshness
  source reports a later revocation or cannot be reached.
- Reader-key and membership metadata remain sensitive relationship data in the
  Foundation database, but contain no content, KEK, private key or session
  credential.
- Reader-custody stays unavailable in the default runtime. ADR 0085 now
  provides the authenticated adapter, but deployment transport and the
  reader-custody envelope path remain absent.

## Gates

- **R1.1:** verify the exact `device_key_agreement` key record in the
  possession-bound identity-session ceremony.
- **R1.2:** persist an idempotent Home/identity/device/delegation reader-key
  projection and reconcile it fail closed after restore.
- **R1.3:** separate local lifecycle monotonicity from an authenticated,
  bounded external freshness-source result; default to unavailable.
- **R1.4:** select only an active member's correctly scoped, valid,
  non-revoked, fresh exact reader-key binding.
- **R1.5:** bind cross-key swap, role confusion, missing/stale freshness,
  stale-restore revocation, local key revocation, delegation expiry and
  corrupted-projection cases in tests.

## References

- [ADR 0078](0078-memory-domain-reader-membership-and-key-distribution-threat-model-and-direction.md)
- [ADR 0079](0079-pico-identity-and-device-key-threat-model-and-primitive-direction.md)
- [ADR 0082](0082-identity-bound-foundation-sessions-and-domain-read-grants.md)
- [ADR 0033](0033-key-lifecycle-rotation-revocation-and-recovery.md)
- [ADR 0085](0085-authenticated-reader-key-freshness-checkpoints.md)
