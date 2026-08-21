# Pico

![Pico hero](docs/assets/pico-readme-hero.png)

Pico is a local-first personal AI companion foundation.

The goal is not simply to build another chatbot. Pico is meant to become a personal agent foundation that can run across trusted devices, understand context, interact through text, voice, avatar, and Home Assistant surfaces, and execute approved tools only through clear policy and audit boundaries.

A Pico can be understood as a digital companion and, technically, as a digital twin of something meaningful to the user: a person, home, site, organisation, project, asset, device, or another explicit context.

For the full technical documentation, see [`ReadmeTech.md`](ReadmeTech.md).

## Why Pico exists

Many assistant and smart-home systems are controlled by one account, one cloud, or one technical owner. That is convenient, but shared homes, families, partnerships, and organisations need clearer ownership, permissions, exit paths, and auditability.

Pico is designed around a different premise:

> Personal AI should help people without taking away their control over their own data and decisions.

This means Pico treats identity, ownership, privacy, relationship boundaries, exit rights, and auditability as product features, not as afterthoughts.

## What Pico should become

Pico should eventually be able to:

- act as a digital companion for a user-chosen subject such as a person, home, site, organisation, project, asset or device
- run locally where practical
- run Pico Home on multiple host platforms, with Home Assistant as the first packaging path
- support a future Pico Home Image for dedicated local appliance-style hosts
- sync between trusted Pico Clients
- support Pico Surfaces such as watches or small displays
- communicate through transport-neutral Pico Link packets
- reach Pico Homes remotely through Pico Relay instead of public home ports
- allow Picos to communicate across different Pico Homes
- support optional low-bandwidth transports such as Meshtastic through adapters
- work with Home Assistant and other local tools
- use capabilities through native connectors, MCP-style tools or future tool protocols without bypassing Pico Rules
- remember useful personal context safely
- share presence, activity, location and emergency context only under clear rules
- support shared commitments, reminders and cooperative nudging
- adapt its tone to the user while preserving user control
- notice relevant state changes and prepare useful actions under explicit delegation rules
- explain and audit what it did
- ask for confirmation before risky actions
- keep companion UX separate from execution authority

## What Pico is not

Pico is not intended to become:

- an uncontrolled chatbot with system access
- a cloud-only personal data silo
- a background automation layer without clear confirmation
- a hidden surveillance or control tool
- a global human scoring or reputation system
- a replacement for explicit user approval
- a project that invents its own cryptography
- a public home server that requires exposing local Pico Home APIs to the internet
- a project that binds its core protocol to one relay provider or one radio transport
- a tool protocol wrapper that lets MCP or any connector bypass Pico's policy and audit model

## Core idea

Pico separates the friendly assistant surface from the authority model:

> Pico may suggest. Pico Rules decide. The Action Runner acts only after approval. Action History records what happened.

That means the companion can feel helpful and present, but risky actions still need clear rules, confirmation, and traceability.

## Current concept boundaries

Pico's current concept work defines several important boundaries:

- Pico can act as a digital companion and technical digital twin for a user-chosen subject
- Pico Clients own knowledge and backups; Pico Surfaces are interaction surfaces. A Pico Vault is the key custody inside a Client, not the Client itself
- Pico Homes provide infrastructure, but hosting is not ownership over resident Pico identities or private data
- a freshly installed Pico Home starts empty; a one-time Move-In Code lets the first Pico become the Home Host Pico
- the Home Host Pico may invite or remove Home Member Picos from that Pico Home, but must not decrypt, impersonate, rewrite or own them
- a future Pico Home Image is an appliance-style installation path, not a separate trust model
- Pico Homes are local endpoints in the Pico Link / Relay network, not public inbound API servers
- external reachability should use Pico Link transports, primarily Pico Relay, instead of port forwarding into the home network
- Pico Relays transport encrypted packets but do not own Pico identity, memory, relationships, actions or authority
- Pico Link is transport-neutral; Relay, LAN, VPN/direct, Meshtastic and future radio transports belong behind transport adapters
- befriended Picos can communicate across different Pico Homes; relationships belong to Picos, not Homes
- capabilities are evaluated above connector protocols; MCP is a tool connection method, not Pico authority
- proactive delegation must remain bounded by user-owned preferences, policy decisions, confirmation and Action History
- Pico identity, device, Home, transport and domain keys are separate roles; Pico must still use reviewed primitives and must not invent cryptography
- the current Foundation HTTP API is a trusted local diagnostics and foundation interface, not a public remote-access API
- Context Signals are contextual evidence, not global person scores
- Context Sharing and location sharing must be scoped, visible, revocable and minimally precise
- service and emergency disclosures must be role-, context-, purpose- and necessity-bound
- personal context should remain private unless a clear purpose and policy allow otherwise
- Shared Plans should manage next actions, not judge people
- motivational pressure must be user-owned

## Current status

Pico is in the foundation phase.

Current version:

```text
0.2.1
```

Three things are built and shipped as separate deliverables:

- **Pico Home** - the place a Pico lives. Runs as a Home Assistant add-on or a container.
- **Pico Relay** - a queue with a door on it, so a Home is reachable without opening a port into the house. Runs as a Home Assistant add-on or a container; the one port anybody ever forwards is this one's.
- **Pico Client** - the desktop companion, packaged for Linux, through which a person makes the decisions that are theirs: what a model may see, what material may be here, which of their devices may do what.

Underneath them: event storage with migrations, sync primitives, a local Pico Vault daemon, identity verification and lifecycle, canonical signature-input vectors, sealed Pico Link envelopes between claimed devices, the request/decide/run split for actions, a foundation diagnostics dashboard, the release gates, and the architecture notes the whole thing is argued in.

Pico is **not production-ready** yet, and the reason is no longer that the pieces are missing. Of 155 architecture decisions, 36 are implemented and 86 partially - which means most paths exist end to end and few are hardened. What still needs work: production authentication and authorization beyond the local host, further desktop platforms, the mobile capture path, and turning "partially" into "fully" across the middle of that list.

A person can, today, ask their own Home a question about their own memory and get an answer; keep that answer and later forget it; attach material from a repository and decide whether Pico may fetch it; point Pico at a model host they own and decide what it may see. Each of those paths is walked end to end by a test - against a real git remote, a real model host over HTTP, and for the desktop package a real Electron process and a real Debian install, upgrade and removal.

The current Foundation HTTP and WebSocket API is local diagnostics only. It can be protected with a local **Foundation Operator login** (a passphrase set once through a bootstrap code printed to the host log), and with the temporary `PICO_FOUNDATION_TOKEN` plus short-lived WebSocket tickets. That is a local administration boundary, not production authentication or authorization, not a Pico identity, not Home membership and not remote access. Do not expose port `3100` outside a trusted local development or add-on boundary. Home Assistant ingress metadata, ingress-prefix-aware dashboard URLs, the optional add-on `pico_foundation_token` bridge and the `PICO_FOUNDATION_ACCESS_MODE` startup gate are implemented as foundation hardening, but real HA install validation remains open. Current `deviceId` values are client-supplied metadata, and `signature` values are stored as unverified metadata rather than cryptographic proof.

The Home Assistant add-on no longer publishes the direct host port by default; direct standalone/container exposure must be selected explicitly.

## License and commercial use

Pico is source-available for private and non-commercial use under the PolyForm Noncommercial License 1.0.0.

Private Pico use, private Pico Home use and private Pico WG use are permitted, including family, household, private shared-home and private non-commercial friend-group use.

Business use is permitted on a self-operated Pico Home. A guesthouse, workshop, practice or small company may run one or more Picos for itself, as long as it operates that Pico Home itself and holds its host keys. Those Picos may interact with employees, guests and customers.

Commercial Pico hosting stays with the designated Pico rights holder. Paid hosting, managed Pico Home services, Pico Home rental, multi-tenant hosting, SaaS operation, selling Pico or Pico-based products, and integration into commercial products or services require prior written permission.

Current commercial permission contact:

```text
https://github.com/riederch
```

See [`LICENSE`](LICENSE), [`NOTICE`](NOTICE), [`COMMERCIAL.md`](COMMERCIAL.md), [`LICENSE-FAQ.md`](LICENSE-FAQ.md), [`TRADEMARK.md`](TRADEMARK.md) and [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Visual direction

Pico's visual direction is a small floating digital companion with a light shell, dark face display, glowing eyes, an antenna identity light, and a bright chest core.

![Pico design concept](docs/assets/pico-design-concept.png)

The avatar communicates state and risk. For example:

| Color | Meaning |
|---|---|
| Blue / cyan | normal and available |
| Violet | thinking or analysing |
| Yellow / amber | warning or confirmation needed |
| Red | blocked or critical |
| Green | success |

## Roadmap in plain language

1. Build a safe technical foundation.
2. Make updates and migrations safe before real user data matters.
3. Build the first usable client.
4. Turn identity, transport, relay, encryption, lifecycle and canonicalization boundaries into concrete threat models, protocol schemas and test fixtures before real remote communication; after that, optionally build a small non-blocking walking-skeleton tech demo.
5. Add policy-gated tool execution.
6. Add memory only after deletion and privacy-domain semantics are clear.
7. Add richer companion UX after the control and audit layers are solid.

## Documentation map

- [`ReadmeTech.md`](ReadmeTech.md) - full technical README
- [`pico_home/README.md`](pico_home/README.md) - Pico Home add-on overview
- [`pico_home/DOCS.md`](pico_home/DOCS.md) - Pico Home add-on installation and operation details
- [`pico_relay/README.md`](pico_relay/README.md) - Pico Relay add-on overview, and which shapes it fits
- [`pico_relay/DOCS.md`](pico_relay/DOCS.md) - Pico Relay add-on operation, and the one port that may be forwarded
- [`docs/architecture`](docs/architecture) - architecture decisions and concept notes
- [`docs/architecture/implementation-status.md`](docs/architecture/implementation-status.md) - every numbered architecture decision, what it decided, and how much of it is built
- [`docs/release/versioning.md`](docs/release/versioning.md) - release/versioning checklist
- [`docs/release/documentation-consistency.md`](docs/release/documentation-consistency.md) - README and concept consistency rules
- [`docs/protocol/public-surfaces.md`](docs/protocol/public-surfaces.md) - public compatibility surfaces
- [`docs/protocol/compatibility-levels.md`](docs/protocol/compatibility-levels.md) - compatibility level definitions
- [`docs/protocol/conformance-fixtures.md`](docs/protocol/conformance-fixtures.md) - conformance fixture layout and current Foundation, memory-content AD, identity signature-input/signature-verification/lifecycle, reader-key freshness, reader-custody, Pico Home signature-input, Vault keyfile and draft fixture suites

## Design principles

- Local-first where practical
- User control over identity and personal data
- Explicit privacy domains
- Policy-gated tool execution
- Confirmation for risky actions
- Auditability instead of hidden automation
- Friendly companion layer, strict execution layer
- Pico can be a digital companion and technical digital twin of a user-chosen subject
- Pico Clients own knowledge and backups; Pico Surfaces are interaction surfaces. A Pico Vault is the key custody inside a Client, not the Client itself
- Pico Homes provide infrastructure; hosting is not ownership
- Pico Homes are local endpoints in the Pico Link / Relay network, not public inbound API servers
- Pico Relays provide transport, not authority
- Pico Link remains transport-neutral; specific transports belong behind adapters
- Capabilities are evaluated above connector protocols; MCP is not an authority layer
- Proactive behaviour must be explicit, bounded, revocable and auditable
- Meshtastic and future radio transports are optional low-bandwidth adapters, not Pico identity or authority layers
- Pico identity, device, Home, transport and domain keys are separate roles
- The current Foundation API remains local/trusted until auth, membership, policy and Pico Link boundaries exist
- A Home Host Pico may manage residency on a Pico Home, not resident private data
- Picos can communicate across Homes; relationships belong to Picos, not Homes
- Context Sharing and location sharing must be scoped, visible, revocable and minimally precise
- Context Signals are contextual evidence, not global human scores
- Personal context needs purpose, policy and clear boundaries
- Shared Plans should manage next actions, not judge people
- Motivational pressure must be user-owned
- Use reviewed cryptographic primitives; do not invent cryptography
