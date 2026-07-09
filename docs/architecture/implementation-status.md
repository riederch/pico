# ADR implementation status

This matrix separates ADR decision status from implementation status. An `Accepted` ADR may still be concept-only, reserved, partially implemented or blocked before production.

Pico is currently foundation-stage. This document does not make Pico Home, Pico Link, Relay, Crypto, Membership, Pico Rules, Action Runner, Action History, Memory Store or Home Assistant control production-ready.

## Status categories

| Category | Meaning |
|---|---|
| implemented | The described behavior is present in the current codebase for the stated scope. |
| partially implemented | A limited skeleton or hardening subset exists, but major required behavior is missing. |
| concept-only | The ADR is accepted direction only; no meaningful runtime implementation exists. |
| reserved | Names, types or capability direction exist, but the runtime write path or product behavior is not implemented. |
| blocked-before-production | The ADR defines prerequisites that must be satisfied before production or public compatibility claims. |

## Matrix

| ADR | Topic | Decision status | Implementation status | Code refs | Blocking prerequisites |
|---|---|---|---|---|---|
| [0014](0014-deletability-and-append-only-events.md) | Deletability and append-only events | Accepted concept and safety constraint | partially implemented | `apps/core/src/event-store.ts`, `docs/protocol/public-surfaces.md` | `payloadPosture`, tombstones, deleteable memory store and product memory schema are missing. |
| [0019](0019-home-assistant-threat-model.md) | Home Assistant threat model | Accepted foundation safety constraint | concept-only | `pico_core/config.yaml`, `pico_core/DOCS.md` | No Home Assistant tools, entity access, ingress security model or HA control policy exists. |
| [0024](0024-server-bootstrap-tenancy-and-eviction.md) | Server bootstrap, tenancy and eviction | Accepted concept and tenancy constraint | partially implemented | `apps/core/src/migrations.ts`, `apps/core/src/event-store.ts`, `apps/core/src/app.ts` | Only internal claim-state skeleton and diagnostic read exist; Move-In Code, membership credentials, eviction and claim write APIs are missing. |
| [0028](0028-pico-link-transport-facade-and-relay-network.md) | Pico Link, transport facade and relay network | Accepted transport, relay and decentralisation concept | concept-only | None; docs only. | Pico Link packet model, relay server, transport facade, encryption, routing and conformance tests are missing. |
| [0029](0029-identity-device-home-keys-and-e2e-boundaries.md) | Identity, device/home keys and E2E boundaries | Accepted identity, key-role and encryption-boundary concept | concept-only | `packages/protocol/src/index.ts` for public type direction only. | Pico Identity Keys, Device Keys, Home Keys, Domain Content Keys, lifecycle, recovery and verification are missing. |
| [0030](0030-foundation-api-exposure-and-local-trust-boundary.md) | Foundation API exposure and local trust boundary | Accepted foundation exposure and hardening constraint | partially implemented | `apps/core/src/app.ts`, `apps/core/src/config.ts`, `pico_core/DOCS.md` | WebSocket origin and keepalive hardening exist; authentication, authorization, HA ingress decision and production remote boundary are absent. |
| [0031](0031-pico-link-identity-relay-and-domain-threat-model.md) | Pico Link identity, relay and domain threat model | Accepted pre-implementation threat-model constraint | blocked-before-production | None; docs only. | Threat mitigations must be implemented before Pico Link, Relay, keys, protected domains or production compatibility claims. |
| [0032](0032-pico-link-envelope-and-credential-schema-direction.md) | Envelope and credential schema direction | Accepted conceptual wire-schema direction | concept-only | `packages/protocol/src/index.ts` for Foundation event types only. | No Pico Link envelope, credential schema, signature semantics, capability negotiation or conformance runner exists. |
| [0033](0033-key-lifecycle-rotation-revocation-and-recovery.md) | Key lifecycle, rotation, revocation and recovery | Accepted key-lifecycle concept | concept-only | None; docs only. | Key storage, rotation, revocation, lost-device handling, recovery and migration tests are missing. |
| [0034](0034-canonicalization-signature-inputs-and-test-vectors.md) | Canonicalization, signature inputs and test vectors | Accepted canonicalization and conformance-fixture concept | concept-only | `docs/protocol/conformance-fixtures.md`, `apps/core/src/event-store.ts` | Foundation fixtures exist, but crypto canonicalization, signature inputs, cryptographic vectors and a compatibility runner are missing. |
| [0035](0035-pico-as-digital-companion-and-twin-model.md) | Pico as digital companion and twin | Accepted product and architecture concept | concept-only | None; docs only. | Companion runtime, memory model, identity continuity, autonomy controls and user-facing consent flows are missing. |
| [0036](0036-capabilities-connectors-and-mcp-boundary.md) | Capabilities, connectors and MCP boundary | Accepted capability and integration boundary concept | concept-only | `.ai/mcp/mcp.json` is explicitly empty. | Capability registry, connector execution, MCP mediation, policy gates and audit trail are missing. |
| [0037](0037-proactive-companion-delegation-and-procurement.md) | Proactive delegation and procurement | Accepted vision and safety-boundary concept | concept-only | None; docs only. | Pico Rules, Action Runner, approvals, spending limits, procurement integrations and Action History are missing. |
