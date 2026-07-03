# 0018 - Presence, Context and Location Sharing

## Status

Accepted as a concept and safety constraint.

## Context

Pico should eventually support trusted coordination between people and their Pico instances.

Depending on relationship, consent, context, and purpose, Picos may share limited context such as:

- presence
- reachability
- activity
- approximate location
- exact location
- live location
- ETA
- emergency status
- battery or device state
- check-in status
- event or deployment status

This can support care, coordination, safety, travel, family logistics, emergency response, and everyday convenience.

However, context and location sharing is highly sensitive. If designed poorly, it can become a surveillance, coercion, stalking, or relationship-control mechanism.

This ADR defines the baseline constraints.

## Decision

Pico may support presence, context, and location sharing only as consent-based, scoped, visible, revocable, purpose-bound sharing.

Pico should share the least precise information that satisfies the purpose.

Relationship alone must not grant permanent access.

A family server or relay must not automatically own or see shared context data.

## Core design rule

> Pico should share context to support care, coordination and safety — not surveillance, coercion or control.

Shorter operational rule:

> Context sharing is purpose-bound, visible, revocable and as imprecise as possible.

## Data classes

Pico should distinguish multiple context data classes instead of treating sharing as all-or-nothing.

| Data class | Example | Sensitivity |
|---|---|---|
| `presence` | online, offline, reachable, busy | low to medium |
| `availability` | can respond, do not disturb, driving | low to medium |
| `activity` | commuting, at appointment, at school, on duty | medium |
| `place_category` | home, work, school, unterwegs | medium |
| `area_location` | Villach, Pogöriach, district-level area | medium |
| `approximate_location` | 500 m radius | high |
| `exact_location` | GPS precise | very high |
| `live_location` | continuous position updates | very high |
| `route_or_history` | past route or movement history | very high |
| `eta` | estimated arrival time | medium |
| `device_state` | battery low, no signal, last seen | medium |
| `emergency_status` | help requested, missed check-in | very high |

## Precision levels

Location and activity sharing should support precision levels:

| Precision | Meaning |
|---|---|
| `none` | no context shared |
| `presence_only` | reachable / unavailable |
| `category` | home / work / school / unterwegs |
| `area` | town, district, broad zone |
| `approximate` | radius-limited location |
| `exact` | precise one-time location |
| `live` | continuous location updates |
| `history` | route or movement history |

The default should be the lowest precision useful for the purpose.

For example:

```text
I am on my way home, ETA 18:20.
```

is often better than:

```text
Here is my exact live GPS location.
```

## Sharing scopes

A share must define:

- who receives it
- what data classes are shared
- precision level
- purpose
- start time
- expiry time or end condition
- whether it is recurring
- whether it is emergency-triggered
- whether it is guardian-policy based
- whether it can be paused or revoked
- whether a visible indicator is required
- whether access is audited

Example:

```json
{
  "type": "context.share_policy",
  "subject": "self",
  "recipient": "person:anna",
  "allowedData": ["presence", "eta", "approximate_location"],
  "precision": "area",
  "purpose": "commute_home",
  "validUntil": "2026-07-03T18:45:00Z",
  "revocable": true,
  "requiresUserVisibleIndicator": true
}
```

## Sharing levels

Pico may expose user-facing levels such as:

| Level | Meaning |
|---|---|
| No sharing | nothing shared |
| Basic presence | online, offline, reachable, busy |
| Context status | driving, in appointment, on duty, at school |
| Coarse location | place category or area |
| Temporary live sharing | exact or live location for a limited time |
| Emergency sharing | exact location, last movement, battery, check-in status |

These levels are UI conveniences. Internally they should still resolve to explicit policies.

## Relationship and consent

Relationship is a factor, not automatic authority.

| Relationship | Possible sharing | Constraint |
|---|---|---|
| Unknown | none or minimal presence | no location |
| Acquaintance | limited presence | no sensitive context by default |
| Friend | context status | scoped and revocable |
| Family | coarse location or ETA | not automatically permanent |
| Partner | negotiated sharing | must not become relationship control |
| Parent / child | guardian-policy sharing | age- and autonomy-aware |
| Care context | safety-related sharing | scoped to care need |
| Emergency contact | emergency sharing | trigger- and time-limited |
| Organisation | duty/context sharing | limited to organisational role |
| Emergency service | deployment/location sharing | only in deployment context |

Design rule:

```text
Relationship does not equal permanent access.
```

## Visibility and revocation

Active context shares must be visible to the sharing user where practical.

A user should be able to:

- see active shares
- pause sharing
- reduce precision
- revoke sharing
- see access history
- see expiry time
- extend sharing consciously

Example UI wording:

```text
Anna can see your coarse commute status until 18:45.
[Stop] [Reduce] [Extend]
```

## Minors and care contexts

Guardian policies may allow more structured sharing for minors or care contexts, but this must be visible, age-aware, and designed to fade into autonomy.

Examples:

- child is on school route
- child arrived at school
- route was left unexpectedly
- child requested help
- check-in missed

Rules:

- no hidden total surveillance by default
- precision should be limited to purpose
- older children and teenagers need increasing transparency and control
- guardian access must be auditable
- emergency escalation must be explicit

This extends ADR `0004-parent-child-relationship.md`.

## Emergency sharing

Emergency sharing may temporarily increase precision.

Examples:

- missed check-in
- explicit SOS
- crash/fall detection
- unexpected immobility
- high-risk route or situation
- deployment safety trigger

Emergency sharing must define:

- trigger
- recipients
- data classes
- precision
- expiry
- audit record
- user notification where safe

Example:

```json
{
  "type": "context.emergency_share_started",
  "reason": "missed_checkin",
  "recipient": "guardian:primary",
  "data": ["exact_location", "last_movement", "battery"],
  "expiresAt": "2026-07-03T20:00:00Z"
}
```

## Organisation and deployment context

Pico may support organisational context sharing, for example during Feuerwehr or other response deployments.

Rules:

- sharing is bound to the duty/deployment context
- sharing ends automatically after the context ends
- private location outside the duty context is not shared
- role and task sharing should be separated from private life
- organisational access must be auditable

Example:

```text
Status: on deployment
Role: driver / Atemschutz / command support
Location: deployment-relevant only
Sharing ends: after deployment close
```

## Relay and server constraints

Relays and family servers may transport context updates, but they must not automatically own or inspect the data.

Preferred direction:

- Full Clients decide sharing
- Light Clients display or request sharing through Full Clients
- Relay servers transport encrypted messages
- servers should not become context owners
- context history should not be stored centrally unless explicitly configured

This extends ADR `0015-full-clients-light-clients-and-relay.md` and ADR `0003-family-server-and-user-sovereignty.md`.

## Abuse resistance

Pico must resist:

- stalking
- coercive relationship control
- hidden monitoring
- employer overreach
- guardian overreach
- family-server lock-in
- pressure to keep sharing permanently enabled
- punishment for revoking sharing

Mitigations:

- visible active shares
- short default durations
- precision reduction
- revocation controls
- access history
- unusual access warnings
- purpose labels
- emergency-only escalation
- no permanent adult-to-adult location obligation by default

## Context sharing and interaction safety

Context sharing may reduce risk in some interactions, but it can also create risk.

Examples:

- sharing live location with a trusted emergency contact can improve safety
- sharing live location with a manipulative partner can reduce safety
- sharing ETA can coordinate care without exposing exact location
- sharing exact location can expose patterns and routines

Therefore, Pico should use ADR `0017-contextual-interaction-safety-and-trust-signals.md` when deciding whether to request, offer, accept, or continue a context share.

## Audit semantics

Context sharing should create audit records without leaking more sensitive data than necessary.

Audit entries should record:

- share started
- share stopped
- precision changed
- recipient
- purpose
- expiry
- emergency trigger if applicable
- policy source

Audit entries should avoid storing unnecessary exact location history.

## Output language

Pico should use clear wording:

```text
You are sharing coarse location with Anna until 18:45.
```

```text
This request asks for exact live location. Coarse ETA may be enough.
```

```text
This sharing request is unusual for this relationship. Consider limiting duration or precision.
```

```text
Emergency sharing started because your check-in was missed. It expires at 20:00.
```

## Non-goals

This ADR does not define:

- the final encryption protocol
- the final UI
- exact legal compliance for every jurisdiction
- organisation-specific duty rules
- complete child safety policy
- long-term route-history analytics

## Open questions

Open questions before implementation:

- What are the default precision levels for common relationship types?
- Which sharing policies are user-configurable versus hard-coded safety boundaries?
- How are emergency triggers configured and tested?
- How should offline devices handle pending or expired shares?
- How is context sharing revoked across offline replicas?
- How long should audit records for context sharing be retained?
- Can a recipient prove they no longer have sensitive context after revocation?
- How do users export or delete historical context data?

## Consequences

Positive:

- supports care, coordination and safety
- avoids all-or-nothing location sharing
- aligns with local-first and sovereignty principles
- gives minors and care contexts structured safety options
- supports emergency and deployment contexts

Negative:

- adds complex policy handling
- requires careful UX to avoid confusion
- can still be socially abused even with technical safeguards
- exact location and live sharing remain high-risk
- revocation across offline devices is difficult

## Design rule

Share the least precise context that satisfies the purpose. Make sharing visible, scoped, time-limited, revocable and auditable. Never turn context sharing into surveillance or control.
