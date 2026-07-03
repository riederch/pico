# Contributing to Pico

## Documentation model

Pico keeps two root README files:

```text
README.md
ReadmeTech.md
```

`README.md` is for non-technical readers.

`ReadmeTech.md` is the technical README and must always contain all information from `README.md`, plus implementation, architecture, release, and operation details.

When changing either README, check both files in the same change.

Documentation consistency rules are described in:

```text
docs/release/documentation-consistency.md
```

## Concept consistency

README files and contributor-facing documentation must stay consistent with the architecture decision records in:

```text
docs/architecture/
```

Do not introduce claims that contradict the ADRs, especially around:

- user control and relationship boundaries
- policy-gated execution
- auditability
- deletion and append-only event logs
- Full Client / Light Client / Relay roles
- cryptography boundaries and non-goals

## Release gates

Before pushing release-relevant changes, run:

```bash
pnpm release:verify
```

## Version bumps

Version bump locations are documented in:

```text
docs/release/versioning.md
```

The active Home Assistant add-on version lives in:

```text
pico_core/config.yaml
```

The default-branch GHCR image tag must match the add-on version.

## Binary asset workflow

Large or binary files such as PNG design assets should be prepared as a ZIP archive with the correct repository folder structure. The ZIP can then be extracted in the repository root and committed locally.

Expected Pico image asset paths:

```text
docs/assets/pico-design-concept.png
docs/assets/pico-ha-icon.png
docs/assets/pico-readme-hero.png
pico_core/icon.png
```
