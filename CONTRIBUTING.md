# Contributing to Pico

Pico is currently an early private project that is source-available for private and non-commercial use.

Commercial use requires prior written permission from the designated Pico rights holder.

Because Pico may later offer official commercial services such as managed Pico Home hosting, contributions must not create unclear commercial licensing rights.

## Contribution status

External contributions may be accepted only when the licensing terms are clear.

Before submitting a pull request, contributors should understand that Pico uses a non-commercial source-available license and reserves commercial use for permitted cases.

## Contribution license

By submitting a contribution to Pico, you agree that your contribution may be included in Pico under the project's current license and any future project license chosen by the designated Pico rights holder, including licenses or commercial terms that allow official Pico commercial services.

This is required so that the project can:

- keep private and non-commercial use available
- preserve compatibility and naming rules
- offer official commercial permissions where appropriate
- avoid fragmented ownership that blocks future managed Pico Home services

## Rights you keep

You keep copyright to your own contributions.

You grant the Pico project the rights needed to use, modify, distribute, sublicense and commercially license your contribution as part of Pico.

## Rights granted to Pico

By contributing, you grant the designated Pico rights holder a perpetual, worldwide, non-exclusive, royalty-free, irrevocable license to:

- use your contribution
- modify your contribution
- distribute your contribution
- include your contribution in Pico
- license Pico with your contribution under the project license
- grant commercial permissions for Pico including your contribution
- relicense Pico including your contribution under future Pico project licenses

## No hidden third-party rights

Do not contribute code, documentation, images, designs, generated assets or other material unless you have the right to contribute it.

Do not copy code from projects with incompatible licenses.

Do not contribute secrets, private keys, credentials, private user data, proprietary vendor material, or confidential information.

## AI-assisted contributions

AI-assisted contributions are allowed only when the contributor reviews, understands and accepts responsibility for the submitted content.

Do not submit AI-generated code or text if you cannot confirm that it is appropriate for the project and compatible with the contribution rules.

## Local IDE metadata

`.idea/` files are local IDE metadata and should not be committed.

The `.gitignore` entry for `.idea/` is intentional: it keeps local IDE artifacts from being added accidentally. Local `.idea/` files may remain in a developer working tree, but they are not part of the repository contract.

## Compatibility-sensitive contributions

Changes to protocol semantics, event meanings, Pico Link, Pico Home Link, privacy-domain semantics, host claim semantics, residency, eviction, sync, Action Runner or Pico Rules behaviour are compatibility-sensitive.

Such changes must clearly document whether they are:

- internal only
- experimental
- backwards compatible
- breaking and versioned
- behind a capability flag

Do not silently change compatibility semantics.

## Commercial-use boundaries

A contribution does not grant the contributor commercial rights to operate Pico commercially.

Commercial use still requires prior written permission.

Compatibility claims and commercial permissions remain separate.

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
- Pico Rules and policy-gated execution
- Action History and auditability
- deletion and append-only event logs
- Pico Vault / Pico Surface / Pico Relay roles
- cryptography boundaries and non-goals
- source-available licensing and commercial-use boundaries
- Pico compatibility versus commercial permission

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

The matching semver GHCR image tag is created by the release Git tag build. Default-branch pushes publish only `main` and `sha-*` image tags and must not mutate semver image tags.

## Binary asset workflow

Large or binary files such as PNG design assets should be prepared as a ZIP archive with the correct repository folder structure. The ZIP can then be extracted in the repository root and committed locally.

Expected Pico image asset paths:

```text
docs/assets/pico-design-concept.png
docs/assets/pico-ha-icon.png
docs/assets/pico-readme-hero.png
pico_core/icon.png
```

## Sign-off

Until a formal Contributor License Agreement or Developer Certificate of Origin process is introduced, contributors should include the following sign-off in pull requests:

```text
I confirm that I have the right to contribute this material and that I grant the Pico project the contribution rights described in CONTRIBUTING.md.
```

## Future contributor process

The project may later introduce:

- a formal Contributor License Agreement
- a Developer Certificate of Origin process
- automated sign-off checks
- compatibility test requirements
- contributor role guidelines

## Permission contact

Current contribution, licensing and commercial permission contact:

```text
https://github.com/riederch
```

The initial designated Pico rights holder is the maintainer of the GitHub account @riederch.
