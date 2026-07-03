# Documentation consistency

Pico keeps two root-level README files:

```text
README.md
ReadmeTech.md
```

## Purpose

`README.md` is the non-technical project introduction. It should be understandable for people who want to know what Pico is, why it exists, what it should become, and what the current status is.

`ReadmeTech.md` is the technical project README. It must include all information from `README.md` and add the technical details needed by contributors, reviewers, operators, and future architecture work.

## Maintenance rule

When changing `README.md`, also check `ReadmeTech.md` in the same change.

`ReadmeTech.md` must always cover:

- the same project framing as `README.md`
- the same current version
- the same status statement
- the same core authority model
- the same roadmap direction
- the same design principles
- the same links to key documentation

`ReadmeTech.md` may be more detailed, but it must not contradict the non-technical README.

## Concept consistency rule

Both README files must stay consistent with the architecture decision records under:

```text
docs/architecture/
```

In particular:

- sovereignty and relationship boundaries must remain consistent with `0003` and `0004`
- authority and execution language must remain consistent with `0010`
- audit, privacy and security language must remain consistent with `0011`
- roadmap wording must remain consistent with `0012`
- visual identity language must remain consistent with `0013`
- deletion and memory wording must remain consistent with `0014`
- Full Client / Light Client / Relay wording must remain consistent with `0015`
- cryptography claims must remain consistent with `0016`

## Review checklist

Before merging documentation changes, check:

1. Does `README.md` stay readable for non-technical readers?
2. Does `ReadmeTech.md` include everything stated in `README.md`?
3. Do both files use the same current version?
4. Do both files describe Pico as a policy-gated personal agent foundation, not just as a chatbot?
5. Do both files avoid promising production readiness?
6. Do both files avoid unsupported cryptography or privacy claims?
7. Are roadmap and concept statements consistent with ADRs?

## Design rule

The non-technical README explains Pico clearly. The technical README preserves that explanation and adds implementation, architecture, release, and operation details.
