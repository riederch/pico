# Pico Protocol Fixtures

This directory contains experimental fixture data for future Pico protocol conformance work.

The current fixture set is a seed set for Foundation event and realtime compatibility only. It does not publish an executable conformance suite, certify L4 compatibility, define Pico Link or Pico Home Link compatibility, or make current Foundation APIs production-ready.

## Current fixtures

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
foundation-realtime/v0.1.7/parse-negative/core-connected-missing-device-id/
foundation-realtime/v0.1.7/parse-negative/event-created-missing-event/
foundation-realtime/v0.1.7/parse-negative/event-created-reserved-event-type/
foundation-realtime/v0.1.7/parse-negative/event-created-invalid-payload/
foundation-realtime/v0.1.7/parse-negative/pico-link-packet-not-foundation-realtime/
```

Each fixture directory contains:

- `fixture.json` - fixture metadata and expected result
- `input.json` - source input for the fixture

## Boundary

These fixtures are synthetic Foundation-stage examples. They are not cryptographic vectors and do not include private keys, signatures, canonical bytes, recovery material or production credentials.
