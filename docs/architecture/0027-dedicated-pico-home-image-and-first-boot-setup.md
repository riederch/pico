# 0027 - Dedicated Pico Home Image and First-Boot Setup

## Status

Accepted as a product and installation-path concept. On 2026-08-01 the
appliance platform gates IM1-IM3 were added, lifting requirements that
later ADRs (0110, 0120, 0121, 0122, 0123) had placed on the future
image as scattered footnotes into one explicit, checkable list. All
three are open.

## Context

ADR 0024 defines a Pico Core host as an empty house before it is claimed. ADR 0026 defines the user-facing names for that model:

- Pico Home for the host
- Empty Pico Home for an unclaimed host
- Move-In Code for the bootstrap claim token
- Home Host Pico for the first Pico that claims the host
- Home Member Pico for later resident Picos

The current Home Assistant add-on is the first packaging and runtime path for Pico Home Core. It is not the only intended host shape. A future user-friendly installation path should also support a dedicated local appliance that behaves like a Pico Home from first boot.

A dedicated Pico Home should be understandable to non-developers: flash an image, boot the device, get a Move-In Code, and move the first Pico into the Empty Pico Home.

ADR `0056-pico-home-link-draft-home-host-key-placeholder.md` narrows the first draft-only Home Host Key placeholder boundary for future fixture work. It does not implement Setup Mode, Move-In Code validation, host-key serialization, Home continuity verification or runtime host authorization.

ADR `0080-pico-home-host-key-and-move-in-claim-threat-model-and-ceremony-direction.md` defines the reviewed ceremony direction for this flow: the claim bundle shown through the protected display channel carries the host's key pins alongside the Move-In Code, so both directions authenticate out-of-band; the claim ends in a mutually signed founding record. Setup Mode, the claim endpoint and Move-In Code mechanics remain unimplemented behind its gates.

## Decision

Pico will treat a flashable Pico Home Image as a future official installation path next to the Home Assistant add-on, standalone container, NAS or mini-server, and local service deployments.

A Pico Home Image is an operating-system image for Raspberry Pi, mini-PC, or similar local appliance hardware. It contains the runtime pieces required to start Pico Home automatically after boot and present the first-boot setup flow.

A Dedicated Pico Home is a device running the Pico Home Image and acting as a local Pico Home host.

The Pico Home Image and the Home Assistant add-on use the same host-tenancy model:

```text
Empty Pico Home
-> Move-In Code
-> first Pico moves in
-> Home Host Pico
-> later Home Member Picos may be invited
```

The image may internally use Docker, Podman, systemd services, or another packaging mechanism. That is an implementation detail. The user experience should not require manual Docker knowledge for the appliance path.

## Terms

| Term | Meaning |
|---|---|
| Pico Home Image | Flashable appliance image that boots into Pico Home setup. |
| Dedicated Pico Home | Local device running the Pico Home Image as its primary role. |
| First-Boot Setup | Initial appliance setup phase before the host is claimed. |
| Setup Mode | Temporary mode in which an Empty Pico Home may show a Move-In Code and accept the first claim. |
| Move-In Code | User-facing one-time code for claiming an Empty Pico Home. Technical equivalent: bootstrap claim token. |
| Home Host Pico | First Pico that successfully claims the Empty Pico Home and manages host membership. |

## Intended first-boot flow

Minimum intended flow for a dedicated Pico Home:

1. User flashes the Pico Home Image to SD, eMMC, NVMe, or equivalent appliance storage.
2. Device boots on local hardware such as Raspberry Pi or mini-PC.
3. Pico Home starts automatically.
4. The host creates or loads a local host identity and starts as `unclaimed` if no claim exists.
5. Setup Mode becomes active only while the host is an Empty Pico Home.
6. The host creates a one-time Move-In Code.
7. The Move-In Code is shown through a local or otherwise protected installation channel, for example local web UI, HDMI console, small display, or equivalent pairing surface.
8. A Pico Vault uses the Move-In Code to claim the Empty Pico Home.
9. The host records that Pico as the Home Host Pico.
10. The Move-In Code is invalidated and must not remain usable.
11. Setup Mode ends.
12. The host enters `claimed` state.
13. The Home Host Pico may later create scoped invitations for Home Member Picos.

## Protected display channels

The Move-In Code should only be shown through channels suitable for local first setup. Acceptable examples include:

- local web setup page such as `http://pico-home.local` during Setup Mode
- HDMI or serial console on the physical device
- small attached display or QR-code surface
- Home Assistant add-on UI where Home Assistant already controls add-on installation access

The exact channel may differ per platform. The authority model must not differ.

## Security boundaries

The Move-In Code is only a temporary right to claim an Empty Pico Home.

It is not:

- a master key
- a resident-data encryption key
- a long-term administrator password
- a recovery secret
- a token that can decrypt private resident domains
- a reason to skip future authentication or authorization work

A future claim endpoint is acceptable only as part of Setup Mode and only with the proper bootstrap security model. It must not be introduced as a convenience write API that is always available.

After successful claim:

```text
claim_state = claimed
setup_mode = inactive
move_in_code = invalid
first_pico = Home Host Pico
```

The claim transition must be auditable once the host-access audit model exists.

## Relationship to Home Assistant

The Home Assistant add-on remains the first supported packaging and runtime path. It can participate in the same Empty Pico Home and Move-In Code model.

The difference is installation experience, not host authority:

| Path | User entry point | Host model |
|---|---|---|
| Home Assistant add-on | Install add-on in an existing Home Assistant system. | Pico Home host starts unclaimed and may later be claimed. |
| Standalone container | Run Pico Home Core with Docker or Podman. | Same host-tenancy model. |
| Pico Home Image | Flash appliance image and boot hardware. | Same host-tenancy model with appliance first-boot setup. |

Home Assistant must not become the owner of all Pico identities or resident private data just because it hosts the add-on.

## Implementation implications

Future implementation may add components such as:

```text
pico_home_image
first_boot_setup
setup_mode
move_in_code
move_in_code_expires_at
claim_attempt
home_host_pico_id
host_access_audit
```

Before implementing a public claim write path, the project should define at least:

- Move-In Code generation and expiry semantics
- local or protected display channel requirements
- claim endpoint scope and lifecycle
- replay protection
- rate limiting or attempt handling
- host identity persistence
- reset and recovery behaviour
- audit representation
- compatibility capability flag or protocol versioning, if exposed over Pico Home Link

## Appliance platform gates

The image is the one deployment path where Pico chooses the operating
system, and several decided residuals stay open precisely because the
add-on and generic-host paths cannot choose it. What only the image
can provide is therefore gated here, once, instead of living as
footnotes in the ADRs that need it.

- **IM1 - Platform anchor.** The image provides a platform-backed,
  rollback-resistant substrate - a TPM NV counter or equivalent secure
  element - for the ADR 0110 R6 anchor, replacing the filesystem
  substrate through the interface that was built for exactly this
  swap, without touching a caller. The anchor has since become
  load-bearing three times over: recovery consumption (ADR 0110), the
  time floor for objection windows (ADR 0120) and the audit checkpoint
  heads (ADR 0121). IM1 closes, on this path only, the
  whole-filesystem-rollback residual all three name and the
  matching-backup residual of ADRs 0087/0090/0092/0093/0094. Hardware
  without a TPM or secure element does not become a lesser appliance
  by silent downgrade: the image states at setup whether the platform
  anchor is active, and the filesystem substrate with its stated
  residuals remains the honest fallback.
- **IM2 - Encrypted or absent swap.** Decided in ADR 0123 Z3: the
  image runs with encrypted swap or none, so the memory-exposure
  posture does not depend on an operator remembering a mount option.
- **IM3 - Verifying updater.** Decided in ADR 0122: the image's update
  path verifies the release attestation and switches by digest - the
  first consumption path that gates on ADR 0122 Y2 instead of merely
  auditing it, closing the unverified-Supervisor residual for this
  path.

## Current implementation status

The current foundation implementation only has an internal Pico Home claim-state skeleton and a minimal claim-state diagnostic in `GET /api/system/status`.

It does not yet implement:

- Move-In Code generation
- Move-In Code display
- Setup Mode lifecycle
- public or protected claim endpoint
- Home Host Pico membership records
- Home Member Pico invitations
- eviction
- privacy domains
- key envelopes
- production authentication or authorization

Until these pieces exist, Pico Home Core must not be described as a production-ready multi-resident personal-data host.

## Non-goals

This ADR does not require immediate implementation of a Raspberry Pi image.

It also does not require immediate changes to:

- existing API endpoints
- existing Home Assistant add-on identifiers
- current container packaging
- current SQLite claim-state skeleton
- protocol compatibility levels

## Consequences

Positive:

- makes the dedicated Pico Home product path explicit
- keeps Home Assistant add-on, container, and appliance deployments under one authority model
- gives agents a clear concept before implementing Move-In-Code mechanics
- separates user-facing Move-In Code language from technical bootstrap-token internals
- prevents accidental always-open claim APIs

Negative:

- introduces another future packaging path to maintain
- requires careful first-boot, reset, backup, and recovery design
- requires extra documentation discipline so appliance convenience does not weaken security boundaries

## Relationship to other ADRs

This ADR extends and constrains:

- `0024-server-bootstrap-tenancy-and-eviction.md`
- `0026-product-terminology-and-naming.md`

The appliance platform gates carry requirements decided elsewhere:

- IM1 realizes the platform-anchor substrate ADR
  `0110-recovery-card-and-time-locked-zero-device-recovery.md` R6
  designed for, which ADR
  `0120-time-authority-and-conservative-window-evaluation.md` and ADR
  `0121-tamper-evident-audit-records-and-anchored-checkpoints.md`
  extended.
- IM2 carries ADR
  `0123-runtime-key-hygiene-and-memory-exposure-limits.md` Z3.
- IM3 carries ADR
  `0122-update-and-release-integrity-threat-model-and-hardening-gates.md`
  Y2/Y3 verification onto the first path that can gate on it.

Use product terms where humans interact with the setup flow. Keep technical names stable where protocol compatibility requires them.
