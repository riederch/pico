# 0026 - Product Terminology and Naming

## Status

Accepted as a product and code naming direction.

## Context

Pico's early architecture used precise but technical names such as Core Host, Full Client, Light Client, Policy Layer, Executor and Audit Log.

Those names are useful for system design, but they are not always understandable for users, contributors or future UI surfaces. Pico should use product terms that explain what a component does without implying hidden authority, ownership or control.

The terminology must also respect `0025-inter-pico-communication-compatibility.md`: renaming code and documentation must not silently break inter-Pico or Pico Home protocol compatibility.

## Decision

Pico uses product-facing terms as the primary language in user-facing documentation, UI labels and new code where practical.

Technical terms may remain as legacy aliases, protocol compatibility names or internal implementation details where immediate replacement would create unnecessary compatibility risk.

## Core naming rule

> Product names should explain the component's job. They must not imply authority, ownership, trust, rank or control that the component does not have.

## Primary terminology map

| Product term | Technical / legacy term | Meaning |
|---|---|---|
| Pico | Pico identity / companion | Personal AI companion identity. |
| Pico Home | Pico Core Host / server | Place where Picos may live, sync, route and use host services. |
| Empty Pico Home | Unclaimed Host | Fresh Pico Home before the first Pico moves in. |
| Move-In Code | Bootstrap Claim Token | One-time code used by the first Pico to claim an Empty Pico Home. |
| Home Host Pico | Gastgeber Pico / Host Admin | Pico that manages membership and future access for one Pico Home. |
| Home Member Pico | Resident Pico | Pico that lives in a Pico Home. |
| Pico Vault | Full Client | Trusted client that holds knowledge, keys, sync state and backups where configured. |
| Pico Surface | Light Client | Interaction surface with little or no durable private knowledge. |
| Pico Relay | Relay Server | Transport helper that forwards encrypted traffic without owning authority. |
| Pico Link | Inter-Pico Protocol | Communication between Picos. |
| Pico Home Link | Pico-to-Core-Host Interface | Claim, move-in, residency, sync, routing and host compatibility interface. |
| Private Space | Personal Privacy Domain | Private encrypted data space controlled by a Pico. |
| Shared Space | Shared Domain | Explicitly shared encrypted data space. |
| Protected Space | Encrypted / privacy-controlled data domain | General user-facing term for protected data areas. |
| Pico Rules | Policy Layer / Policy Engine | Rule layer that decides whether an action is allowed, blocked or needs approval. |
| Action Runner | Executor | Component that performs only approved actions. |
| Action History | Audit Log | User-visible and auditable history of decisions and actions. |
| Approval Step | Confirmation Flow | User approval step before risky actions. |
| Action Risk | Tool Risk Level / Risk Class | Risk class of an action. |
| Action Catalog | Tool Registry | Available action definitions. |
| Context Signals | Trust Signals | Contextual evidence, not global person scores. |
| Context Sharing | Presence / Location / ETA Sharing | Visible, scoped and revocable sharing of status or context. |
| Shared Plans | Shared Commitments | Shared next steps and commitments. |
| Self-Set Rules | Self-Binding Policy | User-owned rules for bounded interventions. |
| Motivation Style | Motivation Profile | User-controlled tone and nudging style. |
| Origin Light | Decorative Origin Marker | Subtle, hideable, non-authoritative marker for Pico #1. |

## Product language examples

Preferred public sentence:

> Pico may suggest. Pico Rules decide. The Action Runner acts only after approval. Action History records what happened.

Preferred host sentence:

> A Pico can move into a Pico Home using a Move-In Code. The Home Host Pico manages membership, not resident private data.

Preferred client sentence:

> Pico Vaults keep knowledge and backups. Pico Surfaces are interaction points. Pico Relay transports encrypted traffic.

## Terms to avoid as primary product language

Avoid these as public primary names:

| Avoid | Reason | Prefer |
|---|---|---|
| Master Pico | implies hierarchy and control | Home Host Pico where host administration is meant |
| Owner Pico | implies ownership over other Picos | Home Host Pico |
| Admin Pico | technically useful, but cold and authority-heavy | Home Host Pico |
| Full Client | technical | Pico Vault |
| Light Client | sounds lesser or incomplete | Pico Surface |
| Trust Score | suggests global human scoring | Context Signals |
| Reputation Signal | suggests person ranking | Context Signals |
| Control Layer | sounds authoritarian | Pico Rules |
| Executor as public product term | technical and opaque | Action Runner |
| Audit Log as public product term | correct but less approachable | Action History |

## Code naming direction

New code should prefer product terms where they do not create protocol ambiguity.

Examples:

- `ActionRisk` should be preferred over `ToolRiskLevel`.
- `PicoRulesDecision` should be preferred over `PolicyDecision`.
- `ActionRequestedPayload` should be preferred for new action APIs.
- `ActionHistoryEventPayload` should be preferred for new action-history APIs.
- UI labels should prefer Pico Home, Pico Vault, Pico Surface, Pico Relay, Pico Rules, Action Runner and Action History.

Legacy names may remain as deprecated type aliases or compatibility event names.

## Protocol and compatibility rule

Product renaming must not silently break compatibility.

Existing wire protocol names, event names and API endpoints may remain until a versioned compatibility migration exists.

When a product term replaces a technical term in the protocol, the change must use at least one of:

- a new protocol version
- a new capability flag
- an alias period
- a compatibility adapter
- explicit migration documentation
- conformance tests

## Wire naming rule

Human-facing product terms may use natural names such as Pico Home or Action History.

Wire names should stay stable, lowercase, namespaced and machine-friendly.

Examples:

```text
action.requested
pico_rules.decision_created
action_runner.action_started
action_history.event_created
pico_home.claim_requested
pico_home.resident_invited
```

## UI naming rule

UI surfaces should prefer product names, not implementation names.

Examples:

- Pico Home URL instead of Core URL
- Pico Home status instead of Core status
- Action History instead of Audit Log
- Pico Rules instead of Policy Engine
- Action Runner instead of Executor
- Private Space instead of Personal Privacy Domain

## Relationship to ADR 0025

A fork may rename its internal code. It may also add product terminology or visual branding.

If it claims Pico or Pico Home protocol compatibility, it must still preserve the advertised protocol semantics.

Terminology must not be used to disguise incompatible protocol behaviour.

## Non-goals

This ADR does not require an immediate destructive rename of:

- package names
- repository paths
- existing API endpoints
- existing event names
- existing Home Assistant add-on identifiers

Those may be migrated later with aliases and protocol/version guarantees.

## Consequences

Positive:

- makes Pico easier to explain
- gives the codebase clearer future naming direction
- avoids Apple-like opaque branding while keeping product language approachable
- keeps authority boundaries visible in names
- allows code cleanup without breaking protocol compatibility

Negative:

- some old and new terms will coexist during migration
- requires aliases and documentation discipline
- full code/path/API renames must be delayed until compatibility handling exists

## Design rule

Use product terms where humans interact with Pico. Keep compatibility names where other software relies on them. Never let a nicer name hide a weaker boundary.