# Documentation consistency

Pico keeps several README-style documents with different scopes.

## Document roles

| File | Role | Audience |
|---|---|---|
| `README.md` | non-technical project introduction | interested readers, users, repository visitors |
| `ReadmeTech.md` | full technical project README | contributors, reviewers, operators, future architecture work |
| `pico_core/README.md` | Home Assistant add-on overview in the style of the root README | Home Assistant users browsing the add-on |
| `pico_core/DOCS.md` | Home Assistant add-on installation and operation documentation | Home Assistant users and administrators |
| `pico_core/CHANGELOG.md` | add-on-specific change history | Home Assistant users and administrators |
| `docs/architecture/*.md` | architecture decisions and concept constraints | architecture and design work |
| `docs/release/*.md` | release, versioning and documentation rules | maintainers |

## Root README purpose

`README.md` is the non-technical project introduction.

It should be understandable for people who want to know:

- what Pico is
- why Pico exists
- what Pico should become
- what Pico is not
- what the current status is
- which core design principles matter
- where to find deeper documentation

`README.md` should stay short enough to read as a project overview. It should not become the full architecture manual.

## Technical README purpose

`ReadmeTech.md` is the technical project README.

It must include all information from `README.md` and add the technical details needed by contributors, reviewers, operators, and future architecture work.

`ReadmeTech.md` must always cover:

- the same project framing as `README.md`
- the same current version
- the same status statement
- the same core authority model
- the same roadmap direction
- the same design principles
- the same links to key documentation
- the repository structure
- the current API surface
- the Home Assistant add-on path
- the concept document map
- release and update direction

`ReadmeTech.md` may be more detailed, but it must not contradict the non-technical README.

## Home Assistant add-on README purpose

`pico_core/README.md` is the Home Assistant add-on overview.

It should follow the tone and structure of the root `README.md`, but focus on the add-on context:

- what Pico Core is
- why Home Assistant is a useful entry point
- what the add-on provides today
- what the add-on is not
- current version and foundation status
- API and endpoint overview
- links to `DOCS.md`, `CHANGELOG.md`, root `README.md`, `ReadmeTech.md`, architecture notes and release docs

It should not contain the complete project architecture, long ADR summaries, or detailed installation steps. Those belong in `ReadmeTech.md`, `docs/architecture/` or `pico_core/DOCS.md`.

## Home Assistant add-on DOCS purpose

`pico_core/DOCS.md` is the Home Assistant add-on installation and operation document.

It should cover:

- installation
- start and stop basics
- ports
- endpoints
- persistent data
- configuration options
- update behaviour
- backup and restore notes when available
- troubleshooting when available
- current limitations

It should not become the main product vision or architecture document.

## Maintenance rule

When changing `README.md`, also check `ReadmeTech.md` and `pico_core/README.md` in the same change.

When changing add-on behaviour, also check:

- `pico_core/README.md`
- `pico_core/DOCS.md`
- `pico_core/CHANGELOG.md`
- `ReadmeTech.md`

When changing architecture decisions, also check:

- `README.md` if the concept affects public positioning
- `ReadmeTech.md` if the concept affects technical framing
- `pico_core/README.md` if the concept affects the Home Assistant add-on positioning

## Concept consistency rule

README files must stay consistent with the architecture decision records under:

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
- trust-signal language must remain consistent with `0017`
- presence, activity and location sharing language must remain consistent with `0018`
- Home Assistant threat-model language must remain consistent with `0019`
- service and emergency access language must remain consistent with `0020`
- private behaviour, legal risk and harm language must remain consistent with `0021`
- shared commitment and cooperative nudging language must remain consistent with `0022`
- adaptive tone, motivation and self-binding language must remain consistent with `0023`
- server bootstrap, Gastgeber Pico, residency, eviction and Core Host ownership language must remain consistent with `0024`

## Review checklist

Before merging documentation changes, check:

1. Does `README.md` stay readable for non-technical readers?
2. Does `ReadmeTech.md` include everything stated in `README.md`?
3. Does `pico_core/README.md` align with the root README while staying add-on-specific?
4. Does `pico_core/DOCS.md` remain operational instead of visionary?
5. Do relevant files use the same current version?
6. Do relevant files describe Pico as a policy-gated personal agent foundation, not just as a chatbot?
7. Do relevant files avoid promising production readiness?
8. Do relevant files avoid unsupported cryptography or privacy claims?
9. Are roadmap and concept statements consistent with ADRs?
10. Are Home Assistant ports, endpoints, image tags and limitations accurate?
11. Do Core Host, Full Client, Light Client, Relay, Gastgeber Pico and resident Pico roles remain distinct?

## Design rule

The root README explains Pico clearly. The technical README preserves that explanation and adds implementation, architecture, release, and operation details. The Home Assistant README presents the same project in the add-on context. The Home Assistant DOCS explain installation and operation.