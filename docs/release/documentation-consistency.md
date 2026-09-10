# Documentation consistency

Pico keeps several README-style documents with different scopes.

## Document roles

| File | Role | Audience |
|---|---|---|
| `AGENTS.md` | repository-wide durable agent working rules and invariants | coding agents and maintainers |
| `.agent-context.md` | compact current handoff with the next concrete work block | coding agents |
| `README.md` | non-technical project introduction | interested readers, users, repository visitors |
| `ReadmeTech.md` | full technical project README | contributors, reviewers, operators, future architecture work |
| `pico_home/README.md` | Home Assistant add-on overview in the style of the root README | Home Assistant users browsing the add-on |
| `pico_home/DOCS.md` | Home Assistant add-on installation and operation documentation | Home Assistant users and administrators |
| `pico_home/CHANGELOG.md` | add-on-specific change history | Home Assistant users and administrators |
| `docs/architecture/*.md` | architecture decisions and concept constraints | architecture and design work |
| `docs/protocol/*.md` | protocol surfaces, compatibility levels and conformance fixture planning | protocol and compatibility work |
| `docs/development/*.md` | on-demand runbooks, development notes and preserved reviewer context that should not bloat root or active handoff files | maintainers and future agents |
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

**What it must not do is keep a second copy of a list something else checks.**
Corrected on 2026-08-17: its endpoint table named nine routes while the Home
served sixty-one and thirty Link operations, because a hand-kept copy drifts
and nobody reads two lists to notice. The surfaces live in
`docs/protocol/public-surfaces.md`, which `surface:check` compares against what
is served in both directions; this document points at it and adds the framing
that list does not carry. The repository tree stays, because it is orientation
rather than a source of truth - and `docs:check` compares it against the
repository in both directions, after the same review found it missing three
apps, two packages, three top-level directories and a renamed Dockerfile.

`ReadmeTech.md` must always cover:

- the same project framing as `README.md`
- the same current version
- the same status statement
- the same core authority model
- the same roadmap direction
- the same design principles
- the same links to key documentation
- the repository structure
- where the current API surface is listed, and the framing that list does not carry
- the Home Assistant add-on path
- the concept document map
- release and update direction

`ReadmeTech.md` may be more detailed, but it must not contradict the non-technical README.

Long explanatory sections that are useful for reviewers but too detailed for the main technical README may live under `docs/development/`. Those files are companion notes, not replacements for ADRs or release rules.

## Home Assistant add-on README purpose

`pico_home/README.md` is the Home Assistant add-on overview.

It should follow the tone and structure of the root `README.md`, but focus on the add-on context:

- what a Pico Home is, and that Pico Core is the runtime inside it
- why Home Assistant is a useful entry point
- what the add-on provides today
- what the add-on is not
- current version and foundation status
- API and endpoint overview
- links to `DOCS.md`, `CHANGELOG.md`, root `README.md`, `ReadmeTech.md`, architecture notes and release docs

It should not contain the complete project architecture, long ADR summaries, or detailed installation steps. Those belong in `ReadmeTech.md`, `docs/architecture/` or `pico_home/DOCS.md`.

## Home Assistant add-on DOCS purpose

`pico_home/DOCS.md` is the Home Assistant add-on installation and operation document.

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

When changing `README.md`, also check `ReadmeTech.md` and `pico_home/README.md` in the same change.

When changing add-on behaviour, also check:

- `pico_home/README.md`
- `pico_home/DOCS.md`
- `pico_home/CHANGELOG.md`
- `ReadmeTech.md`

When changing architecture decisions, also check:

- `README.md` if the concept affects public positioning
- `ReadmeTech.md` if the concept affects technical framing
- `pico_home/README.md` if the concept affects the Home Assistant add-on positioning
- `docs/architecture/implementation-status.md` if the change affects whether an ADR is implemented, partially implemented, reserved, concept-only or blocked before production

## Concept consistency rule

Documents must stay consistent with the architecture decision records under
`docs/architecture`. Where a document and an ADR disagree about what a concept
means, the ADR decides and the document is wrong.

**This section used to enumerate that rule, one line per ADR, and it stopped at
`0076`** - 80 lines covering roughly half of the decisions, last extended long
before the rest were written. Rewritten on 2026-09-10 after an external review
named it: a list that claims to be the rule is a list somebody stops extending,
and then it reads as coverage rather than as a fragment. The rule above is one
sentence and does not go out of date.

### What holds it mechanically

Not the whole rule - none of these reads prose for meaning - but the parts that
can be measured, so a person spends their attention on the part that cannot:

- `scripts/check-docs-structure.mjs` (`pnpm docs:check`): every path a document
  names is a file the repository has; every ADR has a status-matrix row or a
  written reason for not having one; present-tense absence claims are still
  true, read across every tracked document; the README's maturity numbers match
  the matrix; the handoff stays inside the size `AGENTS.md` states.
- `scripts/measure-progress-numbers.mjs` (`pnpm progress:walk`): the counted
  numbers in `progress.md` are held against the gate outputs of the same run.
- `scripts/check-version.mjs` (`pnpm version:check`): every workspace manifest,
  add-on config, README, changelog and image tag says the same version - the
  manifests read from `pnpm-workspace.yaml` rather than from a list.
- The subject gates hold the *code* side of a concept, which is the half a
  document is usually wrong about: instants, labels, refusals, stores, link
  operations and the rest each have one.

### What a person still has to do

- Read a changed concept sentence against the ADR that decided it. Nothing
  mechanical compares meaning, and the two documents agreeing with each other
  rather than with the ADR is exactly how a wrong name survives.
- Notice when one word carries two concepts. "Pico Vault" is the open case
  today: ADR 0015 uses it for the full-client node type and ADR 0097 for the
  custody daemon inside one, and both readings are in `ReadmeTech.md`.

## Review checklist

Before merging documentation changes, check:

1. Does `README.md` stay readable for non-technical readers?
2. Does `ReadmeTech.md` include everything stated in `README.md`?
3. Does `pico_home/README.md` align with the root README while staying add-on-specific?
4. Does `pico_home/DOCS.md` remain operational instead of visionary?
5. Do relevant files use the same current version?
6. Do relevant files describe Pico as a policy-gated personal agent foundation, not just as a chatbot?
7. Do relevant files avoid promising production readiness?
8. Do relevant files avoid unsupported cryptography or privacy claims?
9. Are roadmap and concept statements consistent with ADRs?
10. Are Home Assistant ports, endpoints, image tags and limitations accurate?
11. Do Pico Home, Pico Vault, Pico Surface, Pico Relay, Home Host Pico and Home Member Pico roles remain distinct?
12. Do protocol compatibility claims preserve inter-Pico communication semantics for the advertised protocol version?
13. Do product terms explain function without implying false authority, ownership, trust or control?
14. Do conformance fixture statements avoid implying certification, production security or commercial permission?
15. Do connector, MCP and proactive-delegation statements keep Pico Rules, confirmation and Action History above tool protocols?

## Design rule

The root README explains Pico clearly. The technical README preserves that explanation and adds implementation, architecture, release, and operation details. The Home Assistant README presents the same project in the add-on context. The Home Assistant DOCS explain installation and operation.
