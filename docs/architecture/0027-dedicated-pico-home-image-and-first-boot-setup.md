# 0027 - Dedicated Pico Home Image and First-Boot Setup

## Status

Accepted as a product and installation-path concept.

## Context

ADR 0024 defines a Pico Core host as an empty house before it is claimed. ADR 0026 defines the user-facing names for that model:

- Pico Home for the host
- Empty Pico Home for an unclaimed host
- Move-In Code for the bootstrap claim token
- Home Host Pico for the first Pico that claims the host
- Home Member Pico for later resident Picos

The current Home Assistant add-on is the first packaging and runtime path for Pico Home Core. It is not the only intended host shape. A future user-friendly installation path should also support a dedicated local appliance that behaves like a Pico Home from first boot.

A dedicated Pico Home should be understandable to non-developers: flash an image, boot the device, get a Move-In Code, and move the first Pico into the Empty Pico Home.

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

Use product terms where humans interact with the setup flow. Keep technical names stable where protocol compatibility requires them.
