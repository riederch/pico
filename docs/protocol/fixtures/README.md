# Pico Protocol Fixtures

This directory contains experimental fixture data for future Pico protocol conformance work.

The current fixture set includes a Foundation event/realtime seed, authoritative byte/signature/lifecycle vector suites and separate draft-only Pico Link and Model Delegation seeds. It does not publish an executable conformance suite, certify L4 compatibility, define Pico Link, Pico Home Link or Model Delegation compatibility, or make current Foundation APIs production-ready.

## Current Foundation fixtures

```text
suite.json
foundation-events/v0.1.7/parse-positive/device-registered-marker/
foundation-events/v0.1.7/parse-positive/device-seen-online/
foundation-events/v0.1.7/parse-positive/session-created-marker/
foundation-events/v0.1.7/parse-positive/message-created-minimal/
foundation-events/v0.1.7/parse-positive/avatar-state-changed-thinking/
foundation-events/v0.1.7/parse-negative/action-requested-reserved/
foundation-events/v0.1.7/parse-negative/device-registered-unexpected-field/
foundation-events/v0.1.7/parse-negative/device-seen-invalid-status/
foundation-events/v0.1.7/parse-negative/device-seen-unexpected-field/
foundation-events/v0.1.7/parse-negative/message-created-invalid-role/
foundation-events/v0.1.7/parse-negative/message-created-empty-text/
foundation-events/v0.1.7/parse-negative/message-created-unexpected-field/
foundation-events/v0.1.7/parse-negative/avatar-state-invalid-status-color/
foundation-events/v0.1.7/parse-negative/avatar-state-empty-message/
foundation-events/v0.1.7/parse-negative/avatar-state-unexpected-field/
foundation-events/v0.1.7/parse-negative/session-created-unexpected-field/
foundation-realtime/v0.1.7/parse-positive/core-connected/
foundation-realtime/v0.1.7/parse-positive/event-created-message/
foundation-realtime/v0.1.7/parse-positive/event-created-avatar-state/
foundation-realtime/v0.1.7/parse-positive/event-created-device-registered/
foundation-realtime/v0.1.7/parse-positive/event-created-device-seen/
foundation-realtime/v0.1.7/parse-positive/event-created-session-created/
foundation-realtime/v0.1.7/parse-negative/core-connected-missing-device-id/
foundation-realtime/v0.1.7/parse-negative/event-created-missing-event/
foundation-realtime/v0.1.7/parse-negative/event-created-reserved-event-type/
foundation-realtime/v0.1.7/parse-negative/event-created-invalid-payload/
foundation-realtime/v0.1.7/parse-negative/pico-link-packet-not-foundation-realtime/
```

## Current memory-content AD fixtures

These fixtures carry the authoritative canonical associated-data byte vectors for the `pico.suite.mem.v1` memory-content AEAD (ADR 0073). Unlike the draft placeholders they contain real canonical bytes; they are in their own suite and are not part of the Foundation seed suite.

```text
memory-content-ad/suite.json
memory-content-ad/pico.suite.mem.v1/canonicalization-positive/content-typical/
memory-content-ad/pico.suite.mem.v1/canonicalization-positive/content-markdown/
memory-content-ad/pico.suite.mem.v1/canonicalization-positive/dek-wrap-typical/
memory-content-ad/pico.suite.mem.v1/canonicalization-positive/content-inject-a/
memory-content-ad/pico.suite.mem.v1/canonicalization-positive/content-inject-b/
memory-content-ad/pico.suite.mem.v1/canonicalization-negative/content-domain-swap/
memory-content-ad/pico.suite.mem.v1/canonicalization-negative/content-suite-v2/
memory-content-ad/pico.suite.mem.v1/canonicalization-negative/reject-empty-content-type/
memory-content-ad/pico.suite.mem.v1/canonicalization-negative/reject-space-in-domain/
memory-content-ad/pico.suite.mem.v1/canonicalization-negative/reject-nonascii-item-id/
memory-content-ad/pico.suite.mem.v1/canonicalization-negative/reject-overlong-item-id/
```

## Current identity signature-input fixtures

These fixtures carry the authoritative canonical signature-input byte vectors for the `pico.suite.id.v1` identity key-record, possession, delegation and revocation families (ADR 0079 Gate G1). They include key-record BLAKE2b-256 fingerprint vectors, but no private keys, signatures, verification runtime, L4 compatibility basis or commercial permission.

```text
identity-signature-input/suite.json
identity-signature-input/pico.suite.id.v1/canonicalization-positive/keyrecord-pico-identity/
identity-signature-input/pico.suite.id.v1/canonicalization-positive/keyrecord-device-signing/
identity-signature-input/pico.suite.id.v1/canonicalization-positive/keyrecord-device-key-agreement/
identity-signature-input/pico.suite.id.v1/canonicalization-positive/possession-device-signing/
identity-signature-input/pico.suite.id.v1/canonicalization-positive/delegation-device-reader/
identity-signature-input/pico.suite.id.v1/canonicalization-positive/delegation-scope-order-canonical/
identity-signature-input/pico.suite.id.v1/canonicalization-positive/revocation-delegation-reader/
identity-signature-input/pico.suite.id.v1/canonicalization-negative/keyrecord-suite-v2/
identity-signature-input/pico.suite.id.v1/canonicalization-negative/keyrecord-role-swap/
identity-signature-input/pico.suite.id.v1/canonicalization-negative/possession-context-swap/
identity-signature-input/pico.suite.id.v1/canonicalization-negative/possession-cross-family-label/
identity-signature-input/pico.suite.id.v1/canonicalization-negative/delegation-field-order-override/
identity-signature-input/pico.suite.id.v1/canonicalization-negative/delegation-truncated-issuer-fingerprint/
identity-signature-input/pico.suite.id.v1/canonicalization-negative/delegation-unknown-scope/
identity-signature-input/pico.suite.id.v1/canonicalization-negative/delegation-validity-inverted/
identity-signature-input/pico.suite.id.v1/canonicalization-negative/delegation-validity-offset-form/
identity-signature-input/pico.suite.id.v1/canonicalization-negative/revocation-invalid-lifecycle-order/
identity-signature-input/pico.suite.id.v1/canonicalization-negative/keyrecord-invalid-public-key-length/
```

## Current reader-key freshness fixtures

These fixtures carry the authoritative canonical signature-input byte vectors
for ADR 0085 identity-root-signed reader-key freshness checkpoints. They bind
the exact Home, identity, device signing key, device key-agreement key,
delegation, status, lifecycle order and five-minute-capable validity window.
They contain no private keys, no Registry/Sync transport, no HTTP freshness
assertion, no L4 compatibility basis and no commercial permission.

```text
reader-key-freshness/suite.json
reader-key-freshness/pico.suite.id.v1/canonicalization-positive/current-reader-binding/
reader-key-freshness/pico.suite.id.v1/canonicalization-positive/revoked-reader-binding/
reader-key-freshness/pico.suite.id.v1/canonicalization-negative/cross-family-label/
reader-key-freshness/pico.suite.id.v1/canonicalization-negative/invalid-status/
reader-key-freshness/pico.suite.id.v1/canonicalization-negative/inverted-window/
```

## Current reader-custody fixtures

These fixtures carry the authoritative canonical signature-input bytes for the
ADR 0086 reader-custody domain, writer grant, writer revocation and opaque item
families. They bind Home and host identity, the owner and exact writer device,
the KEK version, ciphertext/wrapped-DEK digests and lifecycle context. The
vectors contain synthetic public fields only: no private keys, raw KEKs, raw
DEKs, real ciphertext, L4 compatibility basis or commercial permission.

```text
reader-custody/suite.json
reader-custody/pico.suite.mem.v1/canonicalization-positive/domain-authority/
reader-custody/pico.suite.mem.v1/canonicalization-positive/writer-grant/
reader-custody/pico.suite.mem.v1/canonicalization-positive/writer-grant-revoked/
reader-custody/pico.suite.mem.v1/canonicalization-positive/opaque-item/
reader-custody/pico.suite.mem.v1/canonicalization-negative/domain-cross-family-label/
reader-custody/pico.suite.mem.v1/canonicalization-negative/domain-host-custody/
reader-custody/pico.suite.mem.v1/canonicalization-negative/writer-grant-inverted-window/
reader-custody/pico.suite.mem.v1/canonicalization-negative/item-truncated-content-nonce/
```

## Current Pico Home signature-input fixtures

These fixtures carry the authoritative canonical signature-input byte vectors for the `pico.suite.id.v1` Pico Home claim, claim-response, founding, membership, membership lifecycle, domain-read grant, domain-read grant lifecycle and continuity families (ADR 0080 Gate M1 and ADR 0082 S1). They include bind-difference cases for wrong-host pins, stale or foreign codes, cross-ceremony transplants and role/suite swaps, plus structural canonicalization rejects. They include no private keys or signatures and provide no L4 compatibility basis or commercial permission.

```text
home-signature-input/suite.json
home-signature-input/pico.suite.id.v1/canonicalization-positive/claim-display-bundle/
home-signature-input/pico.suite.id.v1/canonicalization-positive/claim-response-founding-proposal/
home-signature-input/pico.suite.id.v1/canonicalization-positive/founding-record/
home-signature-input/pico.suite.id.v1/canonicalization-positive/membership-home-member/
home-signature-input/pico.suite.id.v1/canonicalization-positive/membership-scope-order-canonical/
home-signature-input/pico.suite.id.v1/canonicalization-positive/membership-lifecycle-evicted/
home-signature-input/pico.suite.id.v1/canonicalization-positive/domain-read-grant-home-member/
home-signature-input/pico.suite.id.v1/canonicalization-positive/domain-read-grant-lifecycle-revoked/
home-signature-input/pico.suite.id.v1/canonicalization-positive/continuity-host-rotation/
home-signature-input/pico.suite.id.v1/canonicalization-negative/claim-suite-swap/
home-signature-input/pico.suite.id.v1/canonicalization-negative/claim-wrong-host-pin/
home-signature-input/pico.suite.id.v1/canonicalization-negative/claim-stale-move-in-code/
home-signature-input/pico.suite.id.v1/canonicalization-negative/claim-foreign-move-in-code/
home-signature-input/pico.suite.id.v1/canonicalization-negative/claim-cross-ceremony-nonce/
home-signature-input/pico.suite.id.v1/canonicalization-negative/claim-cross-family-label/
home-signature-input/pico.suite.id.v1/canonicalization-negative/founding-cross-ceremony-nonce/
home-signature-input/pico.suite.id.v1/canonicalization-negative/founding-missing-host-key-agreement/
home-signature-input/pico.suite.id.v1/canonicalization-negative/membership-role-swap/
home-signature-input/pico.suite.id.v1/canonicalization-negative/membership-issuerless-countersignature-only/
home-signature-input/pico.suite.id.v1/canonicalization-negative/membership-unknown-scope/
home-signature-input/pico.suite.id.v1/canonicalization-negative/membership-duplicate-scope/
home-signature-input/pico.suite.id.v1/canonicalization-negative/membership-validity-inverted/
home-signature-input/pico.suite.id.v1/canonicalization-negative/membership-validity-offset-form/
home-signature-input/pico.suite.id.v1/canonicalization-negative/domain-read-grant-validity-inverted/
home-signature-input/pico.suite.id.v1/canonicalization-negative/domain-read-grant-lifecycle-invalid-status/
home-signature-input/pico.suite.id.v1/canonicalization-negative/continuity-without-outgoing-key/
home-signature-input/pico.suite.id.v1/canonicalization-negative/continuity-invalid-lifecycle-order/
```

## Current identity signature-verification fixtures

These fixtures carry deterministic detached Ed25519 verification vectors for the `pico.suite.id.v1` possession, delegation and revocation families (ADR 0079). They publish public key records and signatures only: no private keys, no registry freshness, no storage adapter, no reader membership, no L4 compatibility basis and no commercial permission.

```text
identity-signature-verification/suite.json
identity-signature-verification/pico.suite.id.v1/verify-positive/possession-device-signing/
identity-signature-verification/pico.suite.id.v1/verify-positive/delegation-device-reader/
identity-signature-verification/pico.suite.id.v1/verify-positive/revocation-delegation-reader/
identity-signature-verification/pico.suite.id.v1/verify-negative/delegation-wrong-issuer-key/
identity-signature-verification/pico.suite.id.v1/verify-negative/delegation-tampered-scope/
identity-signature-verification/pico.suite.id.v1/verify-negative/possession-key-agreement-role/
```

## Current identity lifecycle fixtures

These fixtures carry the authoritative lifecycle lookup and reconciliation vectors for the `pico.suite.id.v1` delegation and revocation families (ADR 0079 Gate G3). They operate only on already accepted lifecycle statements: no private keys, no signatures, no reader membership, no L4 compatibility basis and no commercial permission.

```text
identity-lifecycle/suite.json
identity-lifecycle/pico.suite.id.v1/lifecycle-positive/delegation-active/
identity-lifecycle/pico.suite.id.v1/lifecycle-negative/delegation-revoked-after-restore/
identity-lifecycle/pico.suite.id.v1/lifecycle-negative/key-revocation-terminal/
identity-lifecycle/pico.suite.id.v1/lifecycle-negative/identity-key-revocation-terminal/
identity-lifecycle/pico.suite.id.v1/lifecycle-negative/missing-scope/
identity-lifecycle/pico.suite.id.v1/lifecycle-negative/conflicting-delegation-id/
```

## Current Vault keyfile fixtures

These fixtures carry the authoritative canonical header-AAD byte vectors for the `pico.vault.keyfile.v1` at-rest format (ADR 0081 Gate P1). They include tampered-header bind-difference cases and synthetic wrong-passphrase/truncation open negatives, but no private keys, no real keyfiles, no unlock runtime, no decryption, no L4 compatibility basis and no commercial permission. The Gate P2 runtime is tested separately in `@pico/vault`; this fixture suite remains header-AAD scoped.

```text
vault-keyfile/suite.json
vault-keyfile/pico.vault.keyfile.v1/canonicalization-positive/identity-root-moderate/
vault-keyfile/pico.vault.keyfile.v1/canonicalization-positive/device-signing-moderate/
vault-keyfile/pico.vault.keyfile.v1/canonicalization-positive/device-key-agreement-moderate/
vault-keyfile/pico.vault.keyfile.v1/canonicalization-negative/tampered-header-suite-swap/
vault-keyfile/pico.vault.keyfile.v1/canonicalization-negative/tampered-header-role-swap/
vault-keyfile/pico.vault.keyfile.v1/canonicalization-negative/tampered-header-nonce-swap/
vault-keyfile/pico.vault.keyfile.v1/canonicalization-negative/wrong-label/
vault-keyfile/pico.vault.keyfile.v1/canonicalization-negative/host-role-rejected/
vault-keyfile/pico.vault.keyfile.v1/canonicalization-negative/kdf-parameter-downgrade/
vault-keyfile/pico.vault.keyfile.v1/canonicalization-negative/kdf-parameter-unsupported/
vault-keyfile/pico.vault.keyfile.v1/canonicalization-negative/field-order-override/
vault-keyfile/pico.vault.keyfile.v1/canonicalization-negative/invalid-salt-length/
vault-keyfile/pico.vault.keyfile.v1/canonicalization-negative/invalid-nonce-length/
vault-keyfile/pico.vault.keyfile.v1/canonicalization-negative/invalid-fingerprint-length/
vault-keyfile/pico.vault.keyfile.v1/open-negative/wrong-passphrase/
vault-keyfile/pico.vault.keyfile.v1/open-negative/truncated-ciphertext/
```

## Current Pico share fixtures

These fixtures carry the authoritative canonical byte layouts for the `pico.suite.share.v1` reader-key sharing family (ADR 0078 Gate R2): the wrap payload that is sealed to a reader key, and the issuer-signed envelope that binds it. The envelope binds a digest of the sealed wrap, so a swapped sealed box breaks the issuer signature — the vectors carry synthetic key material only, no real KEKs, no sealing, no signing and no runtime. Nothing accepts, honors or acts on an envelope until Gates R1 and R3 also pass (K4).

```text
share-envelope/suite.json
share-envelope/pico.suite.share.v1/canonicalization-positive/wrap-payload-canonical/
share-envelope/pico.suite.share.v1/canonicalization-positive/envelope-canonical/
share-envelope/pico.suite.share.v1/canonicalization-negative/wrap-cross-reader/
share-envelope/pico.suite.share.v1/canonicalization-negative/wrap-cross-domain/
share-envelope/pico.suite.share.v1/canonicalization-negative/wrap-cross-version/
share-envelope/pico.suite.share.v1/canonicalization-negative/envelope-cross-host/
share-envelope/pico.suite.share.v1/canonicalization-negative/envelope-cross-domain/
share-envelope/pico.suite.share.v1/canonicalization-negative/envelope-cross-version/
share-envelope/pico.suite.share.v1/canonicalization-negative/envelope-cross-issuer/
share-envelope/pico.suite.share.v1/canonicalization-negative/envelope-cross-reader/
share-envelope/pico.suite.share.v1/canonicalization-negative/envelope-cross-suite/
share-envelope/pico.suite.share.v1/canonicalization-negative/envelope-cross-wrap/
share-envelope/pico.suite.share.v1/canonicalization-negative/envelope-cross-grant/
share-envelope/pico.suite.share.v1/canonicalization-negative/envelope-cross-granted-at/
share-envelope/pico.suite.share.v1/canonicalization-negative/envelope-field-order-override/
share-envelope/pico.suite.share.v1/canonicalization-negative/envelope-invalid-field-charset/
share-envelope/pico.suite.share.v1/canonicalization-negative/envelope-truncated-reader-fingerprint/
share-envelope/pico.suite.share.v1/canonicalization-negative/envelope-invalid-wrap-digest-length/
share-envelope/pico.suite.share.v1/canonicalization-negative/envelope-invalid-granted-at/
share-envelope/pico.suite.share.v1/canonicalization-negative/envelope-zero-kek-version/
share-envelope/pico.suite.share.v1/canonicalization-negative/wrap-truncated-kek/
share-envelope/pico.suite.share.v1/canonicalization-negative/envelope-cross-family-label/
```

## Current draft Pico Link fixtures

These fixtures are in a separate draft suite and are not part of the Foundation seed suite.

```text
pico-link/draft/suite.json
pico-link/draft/packet-envelope/v0.1.7/parse-positive/minimal-route-placeholder/
pico-link/draft/packet-envelope/v0.1.7/parse-negative/plaintext-message-leak/
pico-link/draft/packet-envelope/v0.1.7/parse-negative/pico-id-in-routing/
pico-link/draft/packet-envelope/v0.1.7/parse-negative/payload-crypto-claim/
pico-link/draft/packet-envelope/v0.1.7/parse-negative/relay-metadata-leak/
pico-link/draft/protected-payload/v0.1.7/parse-positive/opaque-placeholder/
pico-link/draft/protected-payload/v0.1.7/parse-negative/plaintext-in-protected-body/
pico-link/draft/protected-payload/v0.1.7/parse-negative/real-encryption-claim/
pico-link/draft/protected-payload/v0.1.7/parse-negative/embedded-key-material/
pico-link/draft/protected-payload/v0.1.7/parse-negative/verified-sender-authority-claim/
pico-link/draft/home-host-key/v0.1.7/parse-positive/host-public-key-placeholder/
pico-link/draft/home-host-key/v0.1.7/parse-negative/resident-signing-authority-claim/
pico-link/draft/home-host-key/v0.1.7/parse-negative/domain-decryption-authority-claim/
pico-link/draft/home-host-key/v0.1.7/parse-negative/move-in-code-as-host-key/
pico-link/draft/home-membership/v0.1.7/parse-positive/invited-member-placeholder/
pico-link/draft/home-membership/v0.1.7/parse-negative/move-in-code-as-credential/
pico-link/draft/home-membership/v0.1.7/parse-negative/membership-grants-domain-access/
pico-link/draft/home-membership/v0.1.7/parse-negative/expired-credential-as-active/
pico-link/draft/home-membership/v0.1.7/parse-negative/verified-issuer-claim/
pico-link/draft/home-residency/v0.1.7/parse-positive/resident-status-placeholder/
pico-link/draft/home-residency/v0.1.7/parse-negative/eviction-as-identity-destruction/
pico-link/draft/home-residency/v0.1.7/parse-negative/host-cleanup-as-global-deletion/
pico-link/draft/home-residency/v0.1.7/parse-negative/eviction-grants-domain-key-access/
pico-link/draft/identity-key/v0.1.7/parse-positive/identity-public-key-placeholder/
pico-link/draft/identity-key/v0.1.7/parse-negative/private-key-material-in-record/
pico-link/draft/identity-key/v0.1.7/parse-negative/verified-root-authority-claim/
pico-link/draft/identity-key/v0.1.7/parse-negative/relay-routing-key-as-identity/
pico-link/draft/device-credential/v0.1.7/parse-positive/vault-device-placeholder/
pico-link/draft/device-credential/v0.1.7/parse-negative/bearer-token-as-device-credential/
pico-link/draft/device-credential/v0.1.7/parse-negative/domain-key-access-claim/
pico-link/draft/lost-device/v0.1.7/parse-positive/revoke-device-placeholder/
pico-link/draft/lost-device/v0.1.7/parse-negative/stale-backup-reactivation/
pico-link/draft/lost-device/v0.1.7/parse-negative/identity-replacement-claim/
pico-link/draft/lost-device/v0.1.7/parse-negative/domain-rotation-proof-claim/
pico-link/draft/revocation-record/v0.1.7/parse-positive/device-revocation-record-placeholder/
pico-link/draft/revocation-record/v0.1.7/parse-negative/stale-record-current-claim/
pico-link/draft/revocation-record/v0.1.7/parse-negative/registry-authority-escalation/
pico-link/draft/revocation-record/v0.1.7/parse-negative/domain-key-material-in-record/
pico-link/draft/key-envelope-rotation/v0.1.7/parse-positive/domain-rotation-plan-placeholder/
pico-link/draft/key-envelope-rotation/v0.1.7/parse-negative/plaintext-domain-key-in-plan/
pico-link/draft/key-envelope-rotation/v0.1.7/parse-negative/completed-rotation-without-records/
pico-link/draft/key-envelope-rotation/v0.1.7/parse-negative/historical-plaintext-erasure-claim/
pico-link/draft/signed-event-segment/v0.1.7/parse-positive/signed-segment-placeholder/
pico-link/draft/signed-event-segment/v0.1.7/parse-negative/verified-signature-claim/
pico-link/draft/signed-event-segment/v0.1.7/parse-negative/host-resident-authorship-forgery/
pico-link/draft/signed-event-segment/v0.1.7/parse-negative/history-rewrite-claim/
pico-link/draft/replica-manifest/v0.1.7/parse-positive/replica-manifest-placeholder/
pico-link/draft/replica-manifest/v0.1.7/parse-negative/plaintext-in-manifest/
pico-link/draft/replica-manifest/v0.1.7/parse-negative/verified-completeness-claim/
pico-link/draft/replica-manifest/v0.1.7/parse-negative/verified-signature-claim/
pico-link/draft/canonicalization/v0.1.7/parse-positive/parse-only-placeholder/
pico-link/draft/canonicalization/v0.1.7/parse-negative/canonical-output-claim/
pico-link/draft/compatibility-claims/v0.1.7/parse-positive/draft-only-claim-placeholder/
pico-link/draft/compatibility-claims/v0.1.7/parse-negative/l4-claim-without-runner/
```

## Current draft Model Delegation fixtures

These fixtures are in a separate draft suite and are not part of the Foundation seed suite or the Pico Link draft suite.

```text
model-delegation/draft/suite.json
model-delegation/draft/provider-registry/v0.1.7/parse-positive/local-summarizer-placeholder/
model-delegation/draft/provider-registry/v0.1.7/authority-negative/vault-read-authority-claim/
model-delegation/draft/provider-registry/v0.1.7/authority-negative/trust-grant-by-discovery/
model-delegation/draft/provider-registry/v0.1.7/authority-negative/revoked-provider-usable/
model-delegation/draft/provider-registry/v0.1.7/authority-negative/tool-execution-by-advertisement/
model-delegation/draft/job-envelope/v0.1.7/parse-positive/scoped-summarize-placeholder/
model-delegation/draft/job-envelope/v0.1.7/privacy-negative/forbidden-input-class/
model-delegation/draft/job-envelope/v0.1.7/authority-negative/durable-access-claim/
model-delegation/draft/job-envelope/v0.1.7/authority-negative/missing-policy-consent/
model-delegation/draft/job-envelope/v0.1.7/privacy-negative/unsafe-provider-retention/
model-delegation/draft/context-ref/v0.1.7/parse-positive/bounded-excerpt-placeholder/
model-delegation/draft/context-ref/v0.1.7/privacy-negative/provider-expandable-context/
model-delegation/draft/context-ref/v0.1.7/authority-negative/provider-read-through-context-ref/
model-delegation/draft/context-ref/v0.1.7/privacy-negative/unscoped-context-ref/
model-delegation/draft/context-ref/v0.1.7/privacy-negative/secret-material-in-context-ref/
model-delegation/draft/result-envelope/v0.1.7/parse-positive/proposal-provenance-placeholder/
model-delegation/draft/result-envelope/v0.1.7/authority-negative/action-execution-claim/
model-delegation/draft/result-envelope/v0.1.7/authority-negative/model-correctness-claim/
model-delegation/draft/result-envelope/v0.1.7/provenance-negative/result-job-mismatch/
model-delegation/draft/result-envelope/v0.1.7/provenance-negative/result-provider-mismatch/
```

Each fixture directory contains:

- `fixture.json` - fixture metadata and expected result
- `input.json` - source input for the fixture

## Boundary

The Foundation seed fixtures are synthetic Foundation-stage examples. They are not cryptographic vectors and do not include private keys, signatures, canonical bytes, recovery material or production credentials.

The memory-content AD, identity signature-input, Pico Home signature-input and Vault keyfile suites are authoritative byte-vector fixtures for their narrow ADR scopes. The identity signature-verification suite adds public-key detached signature vectors only. They still include no private keys, recovery material, production credentials, conformance runner or L4 compatibility basis. The Pico Home signature-input suite is byte-layout only, not Setup Mode or membership runtime. The Vault keyfile suite is header-AAD and synthetic open-negative metadata only; it is not an unlock or decryption runtime.

Draft Pico Link fixtures are non-normative fixture data only. They are not a runner, not a Pico Link implementation, not cryptographic verification, not Home membership authority, not an L4 compatibility basis and not commercial permission.

Draft Model Delegation fixtures are non-normative fixture data only. They are not a runner, not a provider registry, not model runtime execution, not provider authentication, not privacy-domain enforcement, not model-quality evidence, not an L4 compatibility basis and not commercial permission.
