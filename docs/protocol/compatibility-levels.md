# Pico Compatibility Levels

This document defines practical compatibility levels for future Pico implementations, forks, clients and hosts.

It is a planning document for the foundation phase. It does not certify any current implementation as production-ready.

## License boundary

Compatibility is separate from licensing.

Pico is source-available for private and non-commercial use. Commercial use requires prior written permission from the designated Pico rights holder.

A compatibility claim does not grant commercial permission.

Commercial permission does not automatically grant compatibility status.

## Compatibility level overview

| Level | Name | Meaning |
|---|---|---|
| L0 | No compatibility claim | Uses Pico ideas or code but makes no compatibility promise. |
| L1 | Foundation event compatibility | Can parse and preserve current foundation event semantics. |
| L2 | Pico Link compatibility | Preserves peer/client communication semantics for the advertised version. |
| L3 | Pico Home Link compatibility | Preserves host claim, residency, sync, routing and host semantics for the advertised version. |
| L4 | Conformance-tested compatibility | Passes the published compatibility tests for the claimed surfaces. |
| L5 | Official compatibility | Explicitly recognized by the designated Pico rights holder. |

## L0 - No compatibility claim

An implementation at L0 may use ideas, code or private forks within the license, but must not claim compatibility.

Allowed statements:

```text
Inspired by Pico.
Forked from Pico for private non-commercial use.
Experimental Pico-derived project.
```

Not allowed:

```text
Pico-compatible
Pico Home-compatible
Official Pico
Pico Home Managed
```

## L1 - Foundation event compatibility

L1 means the implementation can parse, preserve and round-trip current foundation events for the advertised version.

Current foundation event types include:

```text
device.registered
device.seen
session.created
message.created
avatar.state_changed
memory.recorded
memory.tombstone
memory.domain_shredded
auth.operator_bootstrapped
auth.credential_changed
auth.operator_reset
auth.sessions_revoked
home.claimed
home.reset
home.membership_recorded
home.membership_changed
home.domain_read_granted
home.domain_read_revoked
```

L1 does not imply sync compatibility, Pico Link compatibility, Pico Home hosting compatibility or commercial permission.

## L2 - Pico Link compatibility

L2 means the implementation preserves the advertised Pico Link semantics.

This may include future semantics for:

- peer messages
- client messages
- session continuity
- relayed communication
- presence and context exchange
- shared commitments
- service and emergency access messages
- risk, approval and action-related messages where applicable

L2 does not imply that the implementation can host resident Picos.

## L3 - Pico Home Link compatibility

L3 means the implementation preserves the advertised Pico Home Link semantics.

This may include future semantics for:

- Empty Pico Home state
- Move-In Code handling
- host claim
- Home Host Pico membership
- Home Member Pico membership
- residency
- invitation
- eviction
- sync and routing
- privacy-domain handling
- portability expectations

L3 does not imply official hosting status, commercial permission or production security certification.

## L4 - Conformance-tested compatibility

L4 means the implementation passes the published conformance tests for the claimed surfaces and version.

A future conformance test suite should test:

- version reporting
- capability reporting
- event parsing
- event compatibility
- canonicalization fixtures for signed or hashed surfaces
- signature and lifecycle negative vectors once signatures exist
- unknown extension handling
- downgrade resistance
- host claim semantics
- residency semantics
- eviction semantics
- sync semantics
- privacy-domain semantics
- action approval semantics
- Action History semantics

The long-term rule is:

```text
No compatibility claim without conformance tests.
```

The planned fixture layout and current Foundation event/realtime fixture seed are documented in [`conformance-fixtures.md`](conformance-fixtures.md). Until runner semantics and conformance policy exist, compatibility statements should be marked experimental.

Draft compatibility-claim placeholder wording is constrained by [`../architecture/0046-draft-compatibility-claim-placeholder.md`](../architecture/0046-draft-compatibility-claim-placeholder.md). Those placeholders can only reject unsafe wording or missing disclaimers; they do not certify an implementation.

## L5 - Official compatibility

L5 requires explicit recognition by the designated Pico rights holder.

L5 may be used for official clients, official Pico Home services or explicitly approved third-party implementations.

L5 may require:

- conformance test results
- security review
- naming approval
- compatibility statement review
- commercial permission where relevant
- operational commitments for hosted services

## Commercial hosting

Paid hosting, managed Pico Home services, Pico Home rental, multi-tenant Pico Home operation for money, SaaS operation and commercial support require permission regardless of compatibility level.

A project can be technically compatible but not commercially permitted.

A project can be commercially permitted for a specific use but still not be certified as compatible until it passes the relevant requirements.

## Claim examples

Acceptable:

```text
Experimental L1 foundation event compatibility with Pico protocol 0.1.7.
```

Acceptable if true:

```text
L3 Pico Home Link compatibility for protocol 0.1.7, not official and not commercially permitted.
```

Not acceptable without permission:

```text
Official Pico Home Managed hosting.
```

Not acceptable without conformance basis:

```text
Fully Pico-compatible.
```

## Design rule

Compatibility is a claim about behaviour. Commercial permission is a legal permission. Official status is a separate project recognition. Do not collapse these into one claim.
