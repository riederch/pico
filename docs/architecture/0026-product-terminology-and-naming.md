# 0026 - Product Terminology and Naming

## Status

Accepted as a product and code naming direction.

Status note, 2026-09-27: **ein Geraet heisst wie sein Hersteller, und der
Hersteller heisst wie dieses Projekt.** Der Nutzer hat eine PICO 4 Ultra
(Hersteller PICO, VR-Headset); ein VR-Client ist geplant, dieses Headset soll
das erste unterstuetzte sein. Vom Nutzer am 2026-09-27 entschieden:

- **Das Headset heisst P4U.** Beim ersten Vorkommen in einem Dokument
  "PICO 4 Ultra (P4U)", danach nur "P4U"; im Code `p4u`. Das Wort "Pico"
  allein bleibt diesem Projekt vorbehalten. Gross-/Kleinschreibung ("PICO"
  gegen "Pico") ist ausdruecklich **keine** Unterscheidung - sie ueberlebt
  weder Commit-Messages noch Chats.
- **Der Client heisst nach seiner Rolle: VR-Client**, nicht nach dem ersten
  Geraet. So heissen die Clients hier schon (Android-Client in ADR 0131,
  mobile und desktop clients in ADR 0009); ein zweites Headset braucht dann
  keine Umbenennung.

Verworfen: **picoVr** - es liest sich als "Picos VR-Anteil", also als dieser
VR-Client, und baut damit genau die Verwechslung ein, die der Name verhindern
sollte.

Offen und nicht Teil dieser Notiz: ob der VR-Client ein Pico Client oder eine
Pico Surface ist, und ob er auf dem Android-Client aus ADR 0131 aufsetzt
(OpenXR nativ, WebXR im Browser). Das entscheidet ein eigener ADR, wenn der
VR-Client konkret wird. Vorher gibt es keinen VR-Code und keine Runtime-Aussage.

Status note, 2026-08-21: **the vocabulary named a topology, and the product
grew a third name for one of its roles.** The table below maps ADR 0015's
`Full Client` to **Pico Vault**, and that was written before anything shipped.
What ships is `pico-companion_<version>_amd64.deb`, the README calls it **Pico
Client**, and ADR 0105 calls the way it runs a **background companion**. Three
names for one object, and a reader of the product documents met two of them
four sections apart.

Decided by the owner on 2026-08-21, and the direction is to let the vocabulary
follow the tree rather than the other way around:

- **Pico Vault is key custody** - `packages/vault`, `apps/vault-daemon`, the
  six ADRs with the word in their title, and the `pico-vault` binary. That is
  what the name means in nineteen source files, and it is precise there.
- **Pico Client is the full client** - the trusted device that holds knowledge,
  keys, sync state and backups, packaged as `pico-companion`. A Vault is the
  custody *inside* a Client, not the Client itself.
- **Companion is how it runs**, not a third thing it is: a background service
  with a window, per ADR 0105 and ADR 0113.

The `pico-vault` binary keeps its name deliberately. It is honestly named - it
is the custody tool - and ADR 0105 with `check-product-path.mjs` exists to keep
people *away* from it. Renaming it toward "companion" would give the thing
nobody should be routed to the name of the thing they should use, which is the
confusion the gate was built to prevent.

The table and the design rules below are **not** rewritten; they are the record
of what was decided in the foundation phase, and ADR 0128 keeps them. `README.md`
and `ReadmeTech.md` are living documents and were corrected. Two occurrences of
`Pico Vaults` survive there on purpose: one says private keys stay under the
control of Pico Vaults, which the narrowing makes *more* accurate, and one cites
ADR 0015's own title.

Found by building on ADR 0131 A7 and asking what a second client would inherit -
recorded as B7 in `Roadmap.md`, including why that morning's derivation review
missed it.

Status note, 2026-08-10: ADR 0139 AC5 removed two reserved action event
names - `action.completed` as a duplicate, and `action_history.event_created`
because ADR 0141 makes Action History a view over the event log and the
ADR 0121 chain rather than a store beside it. Two consequences here, and
they are handled differently on purpose.

The wire-naming example above **was edited**, replacing
`action_history.event_created` with `action_runner.action_completed`. That
is an exception to ADR 0128's rule against rewriting an ADR body, and the
reason is mechanical: `index.test.ts` asserts every name in that fence is a
live event type, so an illustration naming something that no longer exists
would fail a check rather than merely read as history. The naming *rule* is
untouched; only an illustration whose subject ceased to exist moved.

The prose under "Code naming direction" **was not edited**. It still names
`ActionHistoryEventPayload` as the canonical shape for future
action-history APIs. That type is gone; its redaction vocabulary survives as
`picoActionRecordRedactionModes` under ADR 0141 RN6, and Action History
remains this ADR's product term for the audit log - which is exactly why
ADR 0141 could make it a view.

Status note, 2026-08-11: the terminology map gained **Pico Bridge** and **Pico
Library** with ADR 0136 BR6, which is where that ADR said they would land. This
is an addition to a registry rather than a rewrite of an argument - the map is
the one part of this ADR meant to grow - and it changes nothing already in it.

Two rejections are recorded in ADR 0136 rather than here, because the reasoning
belongs with the decision that produced it. **Skill** fails this ADR's core
rule: a skill is an ability, which is the one thing a supplier does not have,
and it would be the friendliest available name for the weakest boundary in the
system. **Bridge** is not free either - it is this tree's most reused generic
noun - so the Companion's Electron preload bridge is always *the preload
bridge* and never "the bridge", because two security boundaries under one word
is the failure ADR 0128 had to spend an ADR undoing.

**Pico Depot** from ADR 0143 is deliberately not here yet. It lands with that
ADR's DP-gates, none of which are built.

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
| Pico Bridge | Connector / provider adapter | Runs beside Pico, connects exactly one outside system, and speaks only Pico's shapes inward. |
| Pico Library | Attached or pinned corpus | A body of documents Pico may read but does not own, answering without a network. |

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

- `ActionRisk` is the canonical action-risk type.
- `PicoRulesDecision` is the canonical rule-decision type.
- `ActionRequestedPayload` is the canonical shape for future action APIs.
- `ActionHistoryEventPayload` is the canonical shape for future action-history APIs.
- UI labels should prefer Pico Home, Pico Vault, Pico Surface, Pico Relay, Pico Rules, Action Runner and Action History.

Compatibility aliases should exist only when a real published or deployed consumer requires them.

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

## Pre-release terminology consolidation

On 2026-07-27, before the first deployment or external protocol publication, Pico removed the unused TypeScript aliases, payload interfaces and reserved event names for the earlier tool, policy, confirmation, executor, audit, Core-URL and device/trust terminology.

The Protocol package is private, the old names had no runtime callers, the old events were never writable through the Foundation API and no stored wire data existed. The product names in this ADR therefore became the sole code and reserved event direction without an alias period. This is an explicit pre-release breaking cleanup, not precedent for silently renaming a deployed or published protocol surface.

## Wire naming rule

Human-facing product terms may use natural names such as Pico Home or Action History.

Wire names should stay stable, lowercase, namespaced and machine-friendly.

Examples:

```text
action.requested
pico_rules.decision_created
action_runner.action_started
action_runner.action_completed
pico_home.claim_requested
pico_home.invite_created
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

- historical documents and external discussions may still use technical terms
- future public renames require versioning and documentation discipline
- full code/path/API renames after deployment must wait for compatibility handling

## Design rule

Use product terms where humans interact with Pico. Keep compatibility names where other software relies on them. Never let a nicer name hide a weaker boundary.
