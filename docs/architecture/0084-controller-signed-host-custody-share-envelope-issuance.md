# 0084 - Controller-Signed Host-Custody Share-Envelope Issuance

## Status

Accepted and implemented for existing `host_custody` domains. This ADR
completes the narrow ADR 0078 host-custody envelope-issuance/storage slice.
ADR 0085 subsequently implements the concrete authenticated
`PicoIdentityReaderKeyFreshnessSource`; production issuance remains fail-closed
until a deployment injects its checkpoint transport. Reader-custody KEKs,
envelope transport and automatic rotation are not implemented.

## Context

ADR 0083 can select one exact delegated X25519 reader key, but only with a
current authenticated external freshness checkpoint. ADR 0078 Gate R2 already
defines the sealed `pico.share.wrap.v1` plaintext and the separately signed
`pico.share.envelope.v1` bytes. Core legitimately holds versioned KEKs only for
`host_custody` domains.

What Core must not acquire is equally important: the Home Host Pico's
`pico_identity` private key. Letting the Foundation sign an envelope itself,
copying that key into Foundation storage, or inventing an operator
countersignature would collapse Home authority into host administration.
Libsodium sealed boxes authenticate no sender, so a sealed wrap is inert until
the controller signs the envelope that binds its digest.

## Decision

### Custody and authority split

Core may read one existing host-custody KEK version only while constructing its
wrap payload. It seals the payload with `crypto_box_seal` to the exact public
reader key returned by ADR 0083, computes the BLAKE2b-256 ciphertext digest and
zeroes the mutable KEK/wrap buffers on a best-effort basis. It never returns or
persists the raw KEK or the unsigned wrap plaintext.

Only a Pico Vault session holding a `pico_identity` key may sign
`pico.share.envelope.v1`. Device-signing and key-agreement Vault roles reject
that label. Core contains no signing fallback and accepts no issuer public key
or envelope fields from the finalization request.

### Two-phase issuance

`POST /api/home/share-envelope-issuance` is a `host-admin` relay endpoint. Its
request names an existing signed grant, registered delegation, exact reader-key
fingerprint and existing KEK version. Core:

1. resolves the complete currently active signed domain grant;
2. requires the grant's reader to be an active Home member;
3. selects the exact reader key with both reader scopes and authenticated
   external freshness;
4. requires the grant domain and requested KEK to be existing
   `host_custody` material;
5. seals the canonical wrap payload and builds the canonical envelope; and
6. returns a random issuance id, sealed-wrap ciphertext, exact envelope fields
   and canonical signature-input hex.

Unsigned pending state is memory-only, bounded to 128 records and expires after
two minutes. A process restart discards it.

The caller asks the external Home Host Pico Vault to sign the returned canonical
bytes, then relays only `{ issuanceId, issuerSignatureHex }` to
`POST /api/home/share-envelopes`. Core consumes the pending record and rechecks
the current grant, membership, local lifecycle/key binding, authenticated
freshness, KEK presence, wrap digest and controller signature before it writes
anything. A changed or unavailable authority fails closed.

### Durable record and idempotency

Migration `0019_pico_share_envelopes` stores only controller-authenticated
`pico.share.envelope-record.v1` records. Each row contains:

- issuance, grant and delegation references;
- the signed canonical envelope fields;
- sealed-wrap ciphertext;
- the public issuer key record and detached signature; and
- host-stamped creation time.

There is no raw KEK, private key or unsigned freshness assertion. A stable
issuance id with identical signature returns the existing record. A different
record under the same id conflicts. The logical tuple
`(grant, reader key, KEK version)` is unique; a new random sealed box cannot
silently replace an already signed tuple.

### Reconciliation, removal and audit

Boot and inventory reconciliation re-verify the controller signature, wrap
digest, current founding-rooted grant, active membership, exact locally
eligible reader-key binding and KEK-version presence. Invalid restored rows are
deleted. Grant or membership lifecycle changes and crypto-shred trigger the
same reconciliation immediately.

`home.share_envelope_issued` and `home.share_envelope_removed` are
server-synthesized content-free audit records. They carry only grant, domain,
reader-key and KEK-version references; removal additionally carries the bounded
reason category `authority_reconciliation` or `key_unavailable`. They never
carry the envelope, ciphertext, signature, key material or content.

All three HTTP routes are `host-admin`. The inventory route exposes sensitive
reader-graph metadata and sealed ciphertext only to an operator session. A
static Foundation token, identity session or unauthenticated request cannot
prepare, finalize or list envelopes. There is deliberately no reader-facing
distribution endpoint in this slice.

## Compatibility

The new record schema, two audit event types, migration and three HTTP routes
are additive foundation-stage surfaces. The canonical R2 wrap and envelope
signature bytes do not change.

Envelopes may be backed up with SQLite because they are ciphertext signed for
one reader. Raw KEKs remain in the separately excluded key store. A restore
without that key store removes the now-unusable envelope rows rather than
claiming that they can still be rotated or reissued.

## Consequences

- Foundation can perform the cryptographic work it is already authorized to do
  for host-custody KEKs without becoming Pico identity authority.
- An operator may relay or withhold a ceremony but cannot mint a valid
  envelope.
- Preparation and finalization both depend on authenticated external freshness.
  ADR 0085 now verifies identity-root-signed checkpoints, while the default
  configuration without transport still returns `freshness_unavailable`.
- A signed envelope survives restart and exact retries, while unsigned pending
  work does not.
- Removing local authority or shredding the KEK removes stored envelopes
  deterministically and leaves reference-only audit evidence.

## Gates

- **E1:** seal the exact R2 wrap payload to the ADR 0083-selected reader key and
  bind its digest in the envelope.
- **E2:** keep controller private-key custody exclusively in Pico Vault and
  require external `pico_identity` signature completion.
- **E3:** re-evaluate grant, membership, reader lifecycle/freshness and KEK
  presence immediately before finalization.
- **E4:** persist only signed, conflict-safe records unique by grant/reader/KEK
  version; exact completion retries are idempotent.
- **E5:** reconcile invalid authority, wrap swaps and missing keys after restore
  and lifecycle/shred changes.
- **E6:** test wrong reader/version/issuer, stale freshness, wrap tamper,
  revocation, restore and Vault role separation.

## Non-goals

This ADR does not define:

- a public Registry/Sync transport (ADR 0085 later defines only its internal
  signed-checkpoint adapter seam);
- reader-custody KEK creation, custody, sealing or rotation;
- delegated controller chains;
- automatic issuance for every KEK version or rotation coupling;
- reader-facing envelope discovery/transport or Pico Link packets; or
- production Vault IPC, approval UX or platform-keystore unlock.

## References

- [ADR 0078](0078-memory-domain-reader-membership-and-key-distribution-threat-model-and-direction.md)
- [ADR 0079](0079-pico-identity-and-device-key-threat-model-and-primitive-direction.md)
- [ADR 0081](0081-pico-vault-person-role-key-custody-threat-model-and-direction.md)
- [ADR 0082](0082-identity-bound-foundation-sessions-and-domain-read-grants.md)
- [ADR 0083](0083-reader-key-registration-and-freshness-contract.md)
- [ADR 0085](0085-authenticated-reader-key-freshness-checkpoints.md)
