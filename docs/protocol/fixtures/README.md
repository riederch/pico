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

## Current draft Pico Link fixtures

These fixtures are in a separate draft suite and are not part of the Foundation seed suite.

```text
pico-link/draft/suite.json
pico-link/draft/packet-envelope/v0.1.7/parse-positive/minimal-route-placeholder/
pico-link/draft/packet-envelope/v0.1.7/parse-negative/plaintext-message-leak/
pico-link/draft/protected-payload/v0.1.7/parse-positive/opaque-placeholder/
pico-link/draft/home-membership/v0.1.7/parse-positive/invited-member-placeholder/
pico-link/draft/home-membership/v0.1.7/parse-negative/move-in-code-as-credential/
pico-link/draft/device-credential/v0.1.7/parse-positive/vault-device-placeholder/
pico-link/draft/device-credential/v0.1.7/parse-negative/bearer-token-as-device-credential/
pico-link/draft/device-credential/v0.1.7/parse-negative/domain-key-access-claim/
pico-link/draft/lost-device/v0.1.7/parse-positive/revoke-device-placeholder/
pico-link/draft/lost-device/v0.1.7/parse-negative/stale-backup-reactivation/
pico-link/draft/lost-device/v0.1.7/parse-negative/identity-replacement-claim/
pico-link/draft/lost-device/v0.1.7/parse-negative/domain-rotation-proof-claim/
pico-link/draft/canonicalization/v0.1.7/parse-negative/canonical-output-claim/
pico-link/draft/compatibility-claims/v0.1.7/parse-negative/l4-claim-without-runner/
```

## Current draft Model Delegation fixtures

These fixtures are in a separate draft suite and are not part of the Foundation seed suite or the Pico Link draft suite.

```text
model-delegation/draft/suite.json
model-delegation/draft/provider-registry/v0.1.7/parse-positive/local-summarizer-placeholder/
model-delegation/draft/provider-registry/v0.1.7/authority-negative/vault-read-authority-claim/
model-delegation/draft/job-envelope/v0.1.7/privacy-negative/forbidden-input-class/
model-delegation/draft/context-ref/v0.1.7/privacy-negative/provider-expandable-context/
model-delegation/draft/result-envelope/v0.1.7/authority-negative/action-execution-claim/
```

Each fixture directory contains:

- `fixture.json` - fixture metadata and expected result
- `input.json` - source input for the fixture

## Boundary

These fixtures are synthetic Foundation-stage examples. They are not cryptographic vectors and do not include private keys, signatures, canonical bytes, recovery material or production credentials.

Draft Pico Link fixtures are non-normative fixture data only. They are not a runner, not a Pico Link implementation, not cryptographic verification, not Home membership authority, not an L4 compatibility basis and not commercial permission.

Draft Model Delegation fixtures are non-normative fixture data only. They are not a runner, not a provider registry, not model runtime execution, not provider authentication, not privacy-domain enforcement, not model-quality evidence, not an L4 compatibility basis and not commercial permission.
