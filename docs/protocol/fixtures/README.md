# Pico Protocol Fixtures

This directory contains experimental fixture data for future Pico protocol conformance work.

The current fixture set includes a Foundation event/realtime seed plus separate draft-only Pico Link and Model Delegation seeds. It does not publish an executable conformance suite, certify L4 compatibility, define Pico Link, Pico Home Link or Model Delegation compatibility, or make current Foundation APIs production-ready.

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
identity-signature-input/pico.suite.id.v1/canonicalization-negative/revocation-invalid-lifecycle-order/
identity-signature-input/pico.suite.id.v1/canonicalization-negative/keyrecord-invalid-public-key-length/
```

## Current Vault keyfile fixtures

These fixtures carry the authoritative canonical header-AAD byte vectors for the `pico.vault.keyfile.v1` at-rest format (ADR 0081 Gate P1). They include tampered-header bind-difference cases and synthetic wrong-passphrase/truncation open negatives, but no private keys, no real keyfiles, no unlock runtime, no decryption, no L4 compatibility basis and no commercial permission.

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
vault-keyfile/pico.vault.keyfile.v1/canonicalization-negative/field-order-override/
vault-keyfile/pico.vault.keyfile.v1/canonicalization-negative/invalid-salt-length/
vault-keyfile/pico.vault.keyfile.v1/canonicalization-negative/invalid-nonce-length/
vault-keyfile/pico.vault.keyfile.v1/canonicalization-negative/invalid-fingerprint-length/
vault-keyfile/pico.vault.keyfile.v1/open-negative/wrong-passphrase/
vault-keyfile/pico.vault.keyfile.v1/open-negative/truncated-ciphertext/
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

The memory-content AD, identity signature-input and Vault keyfile suites are authoritative byte-vector fixtures for their narrow ADR scopes. They still include no private keys, signatures, recovery material, production credentials, conformance runner or L4 compatibility basis. The Vault keyfile suite is header-AAD and synthetic open-negative metadata only; it is not an unlock or decryption runtime.

Draft Pico Link fixtures are non-normative fixture data only. They are not a runner, not a Pico Link implementation, not cryptographic verification, not Home membership authority, not an L4 compatibility basis and not commercial permission.

Draft Model Delegation fixtures are non-normative fixture data only. They are not a runner, not a provider registry, not model runtime execution, not provider authentication, not privacy-domain enforcement, not model-quality evidence, not an L4 compatibility basis and not commercial permission.
