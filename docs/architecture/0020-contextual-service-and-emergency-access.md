# 0020 - Contextual Service and Emergency Access

## Status

Accepted as a concept and safety constraint.

## Context

Pico should eventually help in real-world service, maintenance, care, rescue and emergency situations.

Examples:

- a water service technician needs the location of a water meter
- a heating technician needs the location of a heating system or service panel
- an electrician needs the main electrical panel for an agreed appointment
- firefighters need the main electrical switch, PV disconnect, battery location or gas shutoff during an incident
- paramedics need emergency medical information for an unconscious person
- responders need access or hazard information when the user cannot consent

These situations can strongly benefit from Pico's local knowledge.

However, the same information can be abused. Infrastructure locations, access hints, home layouts, medical information, device locations and emergency contacts are sensitive. If exposed too broadly, Pico could assist burglary, stalking, sabotage, social engineering, coercion or privacy violations.

This ADR defines how Pico should handle contextual service and emergency access.

## Decision

Pico may disclose private service, infrastructure, access or emergency context only when role, context, purpose and necessity justify it.

Disclosure must be minimal, time-limited, source-labelled, visible after the fact and auditable.

## Core design rule

> Role + context + purpose + necessity + minimal data + expiry + audit.

Long form:

> Pico may disclose private context without direct live consent only when the user is unable to consent or a valid policy permits it, and the disclosure is necessary for service, safety or emergency response. Such disclosure must be minimal, purpose-bound, time-limited, source-labelled, visible after the fact and auditable.

## Scope

This ADR covers three related access modes:

1. Service assistance
2. Emergency infrastructure disclosure
3. Emergency medical disclosure

It extends the constraints from:

- `0011-privacy-security-and-audit-model.md`
- `0015-full-clients-light-clients-and-relay.md`
- `0017-contextual-interaction-safety-and-trust-signals.md`
- `0018-presence-context-and-location-sharing.md`

## Access modes

| Mode | Example | Consent posture | Data posture |
|---|---|---|---|
| Service assistance | water meter replacement | direct or preconfigured consent | task-specific service data |
| Emergency infrastructure disclosure | firefighter needs main switch | emergency policy or implied consent for danger prevention | safety-relevant infrastructure only |
| Emergency medical disclosure | unconscious person | implied consent for life/health protection | medical emergency card only |

## Service assistance

Service assistance helps an authorised service person find task-relevant assets.

Examples:

- water meter
- main water shutoff
- heating system
- boiler
- electrical meter
- main electrical panel
- PV inverter
- network cabinet
- pool technology
- delivery drop-off point

The access must be task-scoped, not person-scoped.

Example:

```text
Christoph may see the water meter location for today's water meter replacement visit.
```

Not:

```text
Christoph may always see all home infrastructure.
```

### Water meter example

A water service technician arrives for a scheduled 5-year meter replacement. The homeowner opens the door. The homeowner's Pico knows where the meter is.

Allowed disclosure after confirmation or valid appointment policy:

```text
Water meter: basement, room 3, left of the main shutoff.
Main water shutoff: directly next to it.
```

Not automatically allowed:

```text
complete floor plan
resident data
access codes
alarm system information
camera locations
private notes
other unrelated infrastructure
```

## Service Cards

Pico may represent service-relevant assets as Service Cards.

Example:

```json
{
  "type": "service.asset_card",
  "asset": "water_meter",
  "label": "Water meter",
  "locationHint": "Basement, room 3, left of the main shutoff",
  "allowedRoles": ["water_service_technician", "emergency_water_operator"],
  "defaultPrecision": "room",
  "requiresOwnerConsent": true,
  "emergencyAccessible": true,
  "sensitiveFields": ["photos", "access_notes"]
}
```

Service Cards should be minimal and role-scoped.

## Service access levels

| Level | Condition | Example disclosure |
|---|---|---|
| 0 - No access | no valid context | none |
| 1 - Owner-confirmed | owner or authorised resident confirms | specific asset location |
| 2 - Scheduled service | valid appointment policy | task-specific data during appointment window |
| 3 - Delegated access | authorised representative or preconfigured policy | task-specific data with tighter audit |
| 4 - Emergency service | danger prevention | relevant utility shutoffs and hazards |

Opening a door is a signal, but it is not always full consent.

| Door opened by | Default posture |
|---|---|
| owner | strong consent signal |
| adult authorised resident | usually sufficient, policy-dependent |
| child | not sufficient for sensitive home data by default |
| neighbour | only if pre-authorised |
| unknown person | not sufficient |
| door already open | not consent |

## Emergency infrastructure disclosure

Emergency infrastructure disclosure supports fire, rescue and technical operations.

Relevant data may include:

- main electrical panel
- main switch
- electrical meter
- PV inverter
- PV DC disconnect
- battery storage
- generator or backup power system
- wallbox / EV charging
- gas shutoff
- main water shutoff
- heating room
- oil tank, pellet store, chip bunker
- hazardous substances
- oxygen bottles or pressurised cylinders
- animals in the building
- access points relevant to rescue
- last known position of people if life safety requires it

These are high-value and high-risk data.

Pico must not expose them like normal context data.

Suggested data class:

```text
critical_home_infrastructure
```

More specific classes:

```text
emergency_utility_shutoff
emergency_energy_system_hazard
emergency_hazard_material
emergency_rescue_access
emergency_known_occupants_or_animals
```

### Firefighter electrical panel example

A firefighter or incident commander needs the location of the main electrical panel during an incident.

Allowed disclosure in verified or plausible emergency context:

```text
Main electrical panel: basement, technical room 3.
Main switch: top right in panel.
PV inverter: same room.
Battery storage: same room, right wall.
Warning: PV DC lines may remain energised in daylight.
```

Not automatically allowed:

```text
complete private floor plan
resident profiles
valuables
door codes
camera locations
normal occupancy patterns
private messages
full home database
```

## Emergency infrastructure access levels

| Level | Condition | Disclosure |
|---|---|---|
| 0 - No emergency | no incident | no infrastructure disclosure |
| 1 - Unverified helper | unknown person claims emergency | general safety guidance only |
| 2 - Occupant confirmed | resident confirms emergency | relevant utility or hazard data |
| 3 - Verified responder | verified fire/rescue/incident role | incident-relevant infrastructure |
| 4 - Imminent danger | life safety or serious damage prevention | broader but still minimal emergency data |
| 5 - Post-incident | incident closed | no live disclosure; audit only |

The preferred trust anchor for broader emergency data is an incident context such as:

- verified dispatch / Leitstelle
- incident number
- incident commander
- group commander
- trusted organisation role
- owner emergency policy
- local confirmed emergency state

## Emergency medical disclosure

If a user is unconscious, incapacitated or otherwise unable to consent, Pico may disclose a limited Emergency Medical Card when necessary to protect life or health.

Allowed emergency medical data:

- name or emergency identifier
- age or birth year
- emergency contacts
- known allergies
- critical diagnoses
- critical medications
- anticoagulants / blood thinners
- diabetes, epilepsy, asthma, severe heart conditions
- implants, pacemaker, insulin pump
- blood group if known and source-labelled
- DNR or advance directive hint if configured
- primary doctor or relevant care provider
- last relevant activity or detected incident if useful
- exact location if emergency response needs it

Not automatically allowed:

- private chat history
- normal memory contents
- relationship history
- financial data
- private photos without medical relevance
- political, religious or intimate notes
- full location history
- trust signals about other people
- unrelated home data

## Medical source labelling

Medical data must be source-labelled.

| Source | Display posture |
|---|---|
| self-entered | show as self-entered |
| guardian-entered | show source and date |
| doctor-confirmed | show source and date if available |
| imported health record | show source and date |
| wearable estimate | show as measurement/estimate, not diagnosis |
| old or unconfirmed | show age and uncertainty |

Example:

```text
Allergy: Penicillin - self-entered, last confirmed 2025-04.
Blood group: user-entered, not independently verified.
```

Pico must avoid presenting uncertain medical data as certain fact.

## Access and entry assistance

In some emergencies, responders may need access information.

Possible disclosures when justified:

- key safe location
- key safe code through verified dispatch only
- access route
- known blocked entrance
- dog or animal warning
- location of incapacitated person
- hazard near entrance

Access information is very sensitive and should require stronger conditions than utility-location information.

Example:

```text
Emergency access: key safe at garage. Code is released only to verified dispatch or incident commander. Disclosure expires after 30 minutes.
```

## Incident-specific filtering

Pico should filter disclosure by incident type.

| Incident type | Relevant disclosure |
|---|---|
| Fire | electricity, gas, PV, battery, hazards, people, animals, rescue access |
| Water leak / pipe burst | main water shutoff, electrical risk, floor drain if known |
| CO / gas | gas shutoff, heating room, ventilation, people |
| Medical emergency | medical card, location, access, emergency contacts |
| Door opening | medical risk, access policy, contact, not full home database |
| Technical rescue | hazards, shutoffs, access, last known position if needed |
| Storm / power outage | backup power, PV/battery, critical devices |
| Hazardous material | material location, quantity if known, safety data sheet reference |

The incident type must reduce disclosure, not broaden it by default.

## Role and recipient model

Pico should reason about recipient roles, not just identities.

Possible roles:

```text
water_service_technician
heating_service_technician
electrician
homeowner
authorised_resident
emergency_dispatch
fire_incident_commander
firefighter
first_responder
paramedic
emergency_doctor
police_for_rescue_context
neighbour_authorised_for_emergency
```

A role claim is evidence, not proof. It must be evaluated under ADR `0017-contextual-interaction-safety-and-trust-signals.md`.

## Example disclosure object

```json
{
  "type": "emergency.infrastructure_disclosure",
  "incidentId": "incident:...",
  "recipientRole": "fire_incident_commander",
  "purpose": "utility_shutdown_and_scene_safety",
  "dataClasses": [
    "main_electrical_panel",
    "pv_disconnect",
    "battery_storage",
    "main_water_shutoff"
  ],
  "precision": "room_and_hazard_note",
  "validUntil": "incident_end_plus_30m",
  "source": "home_owner_policy",
  "auditRequired": true
}
```

## Audit semantics

Every disclosure must be auditable.

Audit record should include:

- time
- requester identity if known
- requester role
- context or incident id if known
- purpose
- data classes disclosed
- precision
- source policy
- whether direct consent, preconfigured policy, or emergency exception was used
- expiry
- whether the user or guardian was notified

Audit records should avoid storing unnecessary sensitive payloads.

Example:

```text
2026-07-03 09:14
Disclosure: water_meter_location
Recipient: Christoph / water_service_technician
Purpose: scheduled meter replacement
Consent: owner-confirmed
Expiry: current visit
```

## Visibility after the fact

If disclosure occurs without live user consent, the affected user or responsible guardian should be informed afterwards where safe and appropriate.

Example:

```text
Emergency disclosure occurred during Feuerwehr incident. Shared: main electrical panel, PV disconnect, battery location. Recipient: incident commander. Duration: incident + 30 minutes.
```

## Server and relay constraints

Relays and family servers must not become owners of service or emergency context.

Preferred model:

- Full Client stores and decides
- Light Client may request or display
- Relay transports encrypted data
- server does not automatically inspect infrastructure or medical data
- emergency policies are local and auditable

This follows ADR `0015-full-clients-light-clients-and-relay.md`.

## Abuse resistance

Pico must resist:

- fake service visits
- fake emergency claims
- burglary reconnaissance
- sabotage targeting
- social engineering
- stalking through service context
- employer or organisation overreach
- hidden copying of home infrastructure data
- broad disclosure after a narrow request

Mitigations:

- role verification where possible
- appointment windows
- owner confirmation where possible
- incident id or dispatch validation where possible
- minimal data classes
- short validity
- no broad search interface
- visible audit
- source labels
- recipient role scoping
- stronger rules for children and vulnerable persons

## No searchable private database

Pico may help authorised people find task-relevant things.

Pico must not expose the home, body, memory or personal life as a searchable private database.

Allowed:

```text
For this water meter replacement, the meter is in basement room 3.
```

Not allowed:

```text
Ask me anything about this house, its occupants, routines or private data.
```

## Output language

Pico should be explicit and bounded.

Good:

```text
Owner approved: water meter location for this visit only.
```

```text
Emergency infrastructure disclosure active for incident commander. Shared: main electrical panel, PV disconnect, battery location. Expires after incident close + 30 minutes.
```

```text
Emergency Medical Card: source-labelled data only. Some fields are self-entered and not independently verified.
```

Avoid:

```text
This responder can access the house data.
```

```text
All emergency data shared.
```

```text
This medical information is certainly correct.
```

## Non-goals

This ADR does not define:

- legal compliance per jurisdiction
- final responder identity verification protocol
- final medical data source integration
- final dispatch or Leitstelle integration
- final UI
- cryptographic implementation
- complete fire-service tactical doctrine

## Open questions

Open questions before implementation:

- How can fire/rescue/medical roles be verified locally, offline or through dispatch?
- How should incident ids be represented and validated?
- Which data classes are universal and which are local configuration?
- How is emergency disclosure revoked across offline replicas?
- Which Service Cards should exist by default?
- How should medical data be imported and source-labelled?
- How can emergency access work when the user device is locked or offline?
- How can sensitive access hints be shown without allowing easy copying?
- What retention period is appropriate for emergency audit records?

## Consequences

Positive:

- makes Pico useful in real service and emergency situations
- helps responders find critical infrastructure quickly
- supports medical help when the user cannot consent
- preserves privacy through minimal and scoped disclosure
- creates a clear audit model

Negative:

- high implementation complexity
- role verification is hard
- emergency exceptions can be socially and technically abused
- false data can cause harm if not source-labelled
- offline revocation remains difficult
- UX must be extremely clear under stress

## Design rule

So much as necessary to protect life, health, property and safety. So little as possible to preserve privacy, dignity and abuse resistance.
