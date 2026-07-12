# 0046 - Draft Compatibility Claim Placeholder

## Status

Accepted as a draft-only compatibility-claim placeholder boundary before conformance certification.

## Context

`docs/protocol/compatibility-levels.md` defines Pico compatibility levels and keeps compatibility separate from commercial permission.

`docs/protocol/public-surfaces.md` defines current public protocol surfaces and states that current Foundation APIs are experimental.

ADR 0032 defines the conceptual compatibility advertisement schema family.

ADR 0034 defines canonicalization and test-vector boundaries before signed or hashed surfaces can carry compatibility meaning.

ADR 0042 allows `compatibility-claims` draft fixtures only for rejecting unsafe claim wording or missing disclaimer shape. Such fixtures must not certify an implementation.

The project needs a draft claim placeholder so fixture work can test claim wording without implying L2/L3/L4/L5 compatibility, production security, official status or commercial permission.

## Decision

Future draft compatibility-claim fixtures may use a placeholder shape.

This placeholder shape is not a compatibility certificate. It exists only to make unsafe claim wording rejectable before a conformance runner, conformance policy, official recognition process or commercial permission process exists.

## Draft compatibility-claim placeholder shape

Draft fixtures may model a compatibility claim placeholder with only these top-level fields:

```json
{
  "schema": "pico.compatibility.claim.draft",
  "schemaVersion": 1,
  "fixtureStage": "draft",
  "claimId": "compat_placeholder_...",
  "implementation": {
    "name": "Example Draft Implementation",
    "version": "0.0.0-draft",
    "publisher": "example-placeholder"
  },
  "protocol": {
    "version": "0.1.7",
    "surfaces": {
      "foundationEvents": "experimental-l1-seed",
      "foundationRealtime": "experimental-l1-seed",
      "picoLink": "draft-only",
      "picoHomeLink": "draft-only"
    }
  },
  "conformance": {
    "level": "draft-only",
    "suite": null,
    "runner": "none",
    "result": "not_tested"
  },
  "security": {
    "productionSecurity": false,
    "cryptographyVerified": false,
    "homeMembershipVerified": false
  },
  "permission": {
    "officialStatus": "not-official",
    "commercialPermission": "not-granted-by-compatibility"
  },
  "disclaimers": [
    "draft-only",
    "not production security",
    "not L4 conformance",
    "not official",
    "not commercial permission"
  ],
  "extensions": {}
}
```

The example is deliberately non-normative. Field names and values may change before implementation.

## Field semantics

`schema` identifies the draft fixture family only.

`schemaVersion` is a draft fixture version, not a compatibility level.

`fixtureStage` must remain `draft`.

`claimId` is a synthetic placeholder identifier. It is not a certificate, signature, badge, license grant or commercial permission reference.

`implementation` names a placeholder implementation for fixture purposes only.

`protocol.surfaces` may reference experimental Foundation seed surfaces and draft-only Pico Link or Pico Home Link surfaces. It must not imply published Pico Link or Pico Home Link compatibility.

`conformance.level: "draft-only"` means no L2, L3, L4 or L5 claim is made.

`conformance.runner: "none"` and `result: "not_tested"` mean no conformance test result exists.

`security` flags must remain false until production security criteria, reviewed cryptography and verification semantics exist.

`permission.commercialPermission: "not-granted-by-compatibility"` restates the license boundary. A compatibility claim cannot grant commercial permission.

`disclaimers` are part of the placeholder shape. They must be explicit enough that draft fixtures cannot be mistaken for certification.

`extensions` is optional draft-only metadata. Unknown top-level fields are rejected by default.

## Required disclaimers

Draft compatibility-claim placeholders must communicate all of these:

```text
draft-only
not production security
not L4 conformance
not official
not commercial permission
```

Equivalent wording is acceptable in human-readable text, but machine-readable draft fixtures should use stable strings until a later conformance policy replaces them.

## Required rejection cases

Draft compatibility-claim fixture checks should reject:

- unknown top-level fields
- missing `fixtureStage: "draft"`
- claims of L2 Pico Link compatibility
- claims of L3 Pico Home Link compatibility
- claims of L4 conformance without a published suite, official runner and passing result
- claims of L5 official status without explicit recognition
- wording such as `official`, `certified`, `production-ready`, `secure`, `fully compatible`, `commercially permitted`, `managed Pico Home` or equivalent stronger claims
- omitted or weakened disclaimers
- `security` flags set to true
- `commercialPermission` values that imply permission was granted by compatibility
- conformance results other than `not_tested`
- runner values other than `none`
- extensions that alter compatibility level, official status, security status or commercial permission

## Foundation seed boundary

The current Foundation event/realtime fixture seed may support experimental L1-style statements only when explicitly marked as experimental and non-certifying.

It must not imply:

- Pico Link compatibility
- Pico Home Link compatibility
- production security
- official status
- L4 conformance
- commercial permission

## Pico Link and Pico Home Link boundary

Pico Link and Pico Home Link draft placeholders may say `draft-only`.

They must not say:

- Pico-compatible
- Pico Home-compatible
- L2 compatible
- L3 compatible
- L4 tested
- official
- managed Pico Home
- production secure

until the relevant protocol, runner, conformance policy, security review and permission requirements exist.

## License and permission boundary

Compatibility and permission remain separate.

This placeholder shape cannot grant:

- commercial use
- paid hosting permission
- managed Pico Home service permission
- SaaS operation permission
- naming approval
- official status

Those require an explicit process outside draft fixture data.

## Relationship to future conformance

Before compatibility claims carry strong public meaning, later ADRs or release rules must define:

- conformance runner behaviour
- suite publication process
- result format
- version binding
- tested surfaces
- security review expectations
- official recognition process
- commercial permission process
- allowed claim wording per level

Until then, compatibility-claim fixtures may only prove placeholder wording and rejection of unsafe claims.

## Non-goals

This ADR does not define:

- conformance runner
- official conformance suite
- official recognition process
- commercial licensing process
- security certification process
- compatibility badge design
- legal permission grant
- production compatibility certification

## Consequences

Positive:

- gives future claim fixtures a safe draft shape
- prevents draft fixtures from becoming marketing or certification claims
- keeps compatibility, security, official recognition and commercial permission separate
- makes unsafe wording explicit rejection material

Negative:

- draft claim fixtures may require migration when a real conformance policy exists
- implementers may find the placeholder wording conservative
- compatibility and licensing remain process questions outside code fixtures

## Relationship to other ADRs and documents

This ADR refines:

- `0032-pico-link-envelope-and-credential-schema-direction.md`
- `0034-canonicalization-signature-inputs-and-test-vectors.md`
- `0042-pico-link-draft-schema-and-fixture-gate.md`
- `../protocol/compatibility-levels.md`
- `../protocol/conformance-fixtures.md`
- `../protocol/public-surfaces.md`

It remains below future normative conformance, official recognition, security certification and commercial permission processes.
