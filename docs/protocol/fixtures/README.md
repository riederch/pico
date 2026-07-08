# Pico Protocol Fixtures

This directory contains experimental fixture data for future Pico protocol conformance work.

The current fixture set is a seed set for Foundation event compatibility only. It does not publish an executable conformance suite, certify L4 compatibility, define Pico Link or Pico Home Link compatibility, or make current Foundation APIs production-ready.

## Current fixtures

```text
suite.json
foundation-events/v0.1.7/parse-positive/message-created-minimal/
foundation-events/v0.1.7/parse-negative/action-requested-reserved/
```

Each fixture directory contains:

- `fixture.json` - fixture metadata and expected result
- `input.json` - source input for the fixture

## Boundary

These fixtures are synthetic Foundation-stage examples. They are not cryptographic vectors and do not include private keys, signatures, canonical bytes, recovery material or production credentials.
