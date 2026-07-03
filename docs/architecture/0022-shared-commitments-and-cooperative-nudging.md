# 0022 - Shared Commitments and Cooperative Nudging

## Status

Accepted as a concept and safety constraint.

## Context

Pico should help people coordinate shared plans, appointments, work, duties, routines and obligations.

Two or more users may agree on something such as:

- a loose social idea
- a concrete appointment
- a reservation
- a shared chore
- a service task
- a project step
- a duty or deadline
- a care responsibility
- an emergency-service or organisation task

Not every shared commitment has the same weight. Missing an informal pizza plan is not the same as missing a restaurant reservation, a customer deadline, a safety check, a care task or a Feuerwehr duty.

Pico should therefore not treat all reminders equally.

It should coordinate reminders, confirmations and progress nudges based on importance, external dependency, harm of failure, procrastination risk and user preferences.

## Decision

Pico may support shared commitments by coordinating reminders, confirmations, progress nudges and escalation according to the commitment's seriousness.

Pico must assist cooperation without turning commitments into surveillance, blame, shame or coercive control.

## Core design rule

> Loose plans get gentle reminders. Binding plans require confirmation. Unpleasant duties get small next steps. Critical tasks may escalate. People are not scored; commitments are managed.

Short form:

> Manage the commitment, do not judge the person.

## Commitment classes

Pico should classify commitments by purpose and seriousness.

| Class | Example | Default posture |
|---|---|---|
| `loose_idea` | pizza sometime | remember only or gentle suggestion |
| `social_plan` | pizza Friday 19:00 | normal reminder |
| `reservation` | reserved table | confirmation and timely cancellation awareness |
| `shared_chore` | clean cellar | anti-procrastination support |
| `shared_project` | prepare documents | progress tracking |
| `service_task` | replace water meter | task-specific coordination |
| `deadline_task` | submit form | stronger reminders |
| `duty_task` | equipment check | high persistence |
| `care_task` | medication / care visit | critical reminders |
| `safety_task` | fire service equipment / hazard check | escalation allowed |

## Commitment levels

| Level | Meaning | Example | Pico behaviour |
|---:|---|---|---|
| 0 | loose idea | pizza sometime | remember, suggest lightly |
| 1 | soft intention | maybe Friday | gentle reminder |
| 2 | concrete plan | Friday 19:00 | normal reminder |
| 3 | external commitment | table reserved | confirmation and timely decision |
| 4 | others depend on it | customer / team waits | persistent follow-up |
| 5 | harm, duty or safety risk | care, deadline, safety | escalation and confirmation required |

The level should be derived from context, not only from title.

## Evaluation dimensions

Pico should evaluate shared commitments across dimensions:

- importance
- deadline
- external dependency
- financial or practical cost of failure
- impact on other people
- impact on safety or care
- whether a reservation or resource was held
- whether the task is enjoyable or unpleasant
- procrastination risk
- repeated postponement pattern
- participant responsibilities
- whether confirmation is still missing
- latest useful decision time
- cancellation etiquette
- allowed escalation level

## Pizza examples

### Loose pizza idea

```text
We should go for pizza sometime.
```

Default:

```text
Level 0 or 1 - loose idea / soft intention.
```

Possible Pico output:

```text
You wanted to go for pizza with Max sometime. Friday would fit.
```

No pressure. No escalation.

### Concrete pizza appointment

```text
Pizza with Max, Friday 19:00.
```

Default:

```text
Level 2 - concrete social plan.
```

Possible Pico output:

```text
Pizza with Max today at 19:00.
```

### Reserved table

```text
Pizza with Max, Friday 19:00, table reserved.
```

Default:

```text
Level 3 - external commitment.
```

Reason:

- the restaurant holds a table
- the other person plans around it
- cancellation should be timely
- the commitment has external coordination cost even without a penalty

Possible Pico output:

```text
Pizza with Max at 19:00. A table is reserved. Please confirm by 17:30 whether you are going or cancelling.
```

If no response:

```text
This is more binding because a table is reserved. Should I prepare a cancellation or ask Max to confirm?
```

## Unpleasant necessary tasks

Some shared tasks are not enjoyable, but still necessary.

Examples:

- clean cellar
- prepare documents
- inventory equipment
- sort tax records
- check water meter list
- prepare maintenance work
- split firewood
- clean workshop

Pico should model:

```text
low_enjoyment
high_necessity
high_procrastination_risk
```

The best intervention is usually not pressure alone, but making the task smaller.

Possible Pico output:

```text
This task has been postponed repeatedly. It is unpleasant, but it blocks the next step. I suggest 30 minutes today, not finishing everything.
```

or:

```text
Both of you are avoiding this. Smallest useful step: open the checklist and clear the first shelf.
```

## Nudge types

Pico should distinguish reminder and nudge types:

| Type | Use |
|---|---|
| `gentle_reminder` | low-importance social plan |
| `normal_reminder` | concrete appointment |
| `confirmation_request` | participant has not confirmed |
| `reservation_warning` | external resource held |
| `latest_decision_prompt` | decision needed before cancellation becomes rude/costly |
| `coordination_nudge` | one participant depends on another |
| `small_next_step` | unpleasant or large task |
| `anti_procrastination_nudge` | repeated postponement |
| `deadline_escalation` | deadline near |
| `safety_escalation` | safety or care risk |

## Participant roles

Pico should model participant roles and responsibilities.

Possible roles:

```text
owner
co_owner
helper
reviewer
dependent
organiser
approver
observer
```

Example:

```json
{
  "participants": [
    {
      "person": "christoph",
      "role": "co_owner",
      "responsibility": "bring tools"
    },
    {
      "person": "max",
      "role": "co_owner",
      "responsibility": "clear shelf"
    }
  ]
}
```

Pico should then nudge each person according to their role and motivation profile.

## Consent and creation flow

One Pico must not unilaterally impose a commitment on another user.

Suggested flow:

1. User A proposes a shared commitment.
2. Pico A sends a proposal to Pico B.
3. User B accepts, modifies or declines.
4. Only accepted commitments become shared commitments.
5. Each participant's Pico manages local reminders according to that user's preferences.

Example:

```text
Christoph proposes: cellar, Saturday 09:00, 90 minutes.
Max counters: 60 minutes.
Both accept: Saturday 09:00, 60 minutes, goal: clear first corner.
```

## Local motivation profiles

Shared commitment state may be common, but motivation style is local.

For the same commitment, one Pico may be gentle and another direct.

Example:

```text
To a sensitive user: Short reminder: Max has confirmed. Does the plan still fit for you?
```

```text
To a direct user: Max has confirmed. Stop drifting. Confirm or cancel now.
```

The tone is user-specific. The shared commitment is not a licence to pressure everyone equally.

## Fairness and blame avoidance

Pico should avoid turning shared commitments into blame engines.

Avoid:

```text
Max is unreliable.
Christoph is lazy.
Your partner failed again.
```

Prefer:

```text
This commitment is still unconfirmed by Max.
```

```text
The task has been postponed three times. Next useful step: 30 minutes today.
```

```text
If nobody confirms by 17:30, cancellation is the fair option.
```

## Escalation boundaries

Escalation must be proportional to the commitment.

| Commitment | Escalation |
|---|---|
| loose social idea | none |
| social appointment | normal reminder |
| reservation | confirmation and cancellation prompt |
| shared chore | repeated but bounded nudges |
| deadline task | stronger reminders |
| duty task | confirmation required |
| safety task | escalation allowed |
| care task | critical escalation |

Pico must not escalate a low-stakes social plan as if it were a duty.

## Shared status and context

Pico may share limited commitment status between participants:

- accepted
- declined
- tentative
- on the way
- delayed
- completed
- blocked
- needs decision

This intersects with ADR `0018-presence-context-and-location-sharing.md`.

Shared status must be scoped to the commitment and must not become general tracking.

Example:

```text
Christoph is delayed by 12 minutes for this appointment.
```

Not:

```text
Here is Christoph's general live location history.
```

## Real-world interventions

Shared commitments may request real-world actions, but such actions require policy.

Examples:

- create calendar event
- send confirmation
- prepare cancellation message
- start focus timer
- activate do-not-disturb
- reduce distractions
- trigger Home Assistant scene

Pico must distinguish:

```text
nudge
suggested action
approved action
self-binding intervention
```

Real-world consequences are covered more directly by ADR `0023-adaptive-tone-motivation-and-self-binding.md`.

## Example commitment object

```json
{
  "type": "shared_commitment.created",
  "title": "Pizza dinner",
  "participants": ["person:christoph", "person:max"],
  "commitmentClass": "reservation",
  "scheduledFor": "2026-07-10T19:00:00+02:00",
  "importance": "low",
  "enjoyment": "high",
  "externalCommitment": {
    "type": "restaurant_reservation",
    "exists": true,
    "reservationTime": "19:00"
  },
  "nudgingPolicy": {
    "level": "moderate",
    "requiresConfirmation": true,
    "latestUsefulDecisionTime": "2026-07-10T17:30:00+02:00"
  }
}
```

Unpleasant task:

```json
{
  "type": "shared_commitment.created",
  "title": "Clean cellar",
  "participants": ["person:christoph", "person:max"],
  "commitmentClass": "shared_chore",
  "importance": "medium",
  "enjoyment": "low",
  "procrastinationRisk": "high",
  "deadline": "2026-07-31",
  "nudgingPolicy": {
    "level": "persistent",
    "strategy": "break_into_small_steps",
    "minimumProgress": "30m"
  }
}
```

## Interaction with other ADRs

This ADR depends on:

- `0011-privacy-security-and-audit-model.md`
- `0017-contextual-interaction-safety-and-trust-signals.md`
- `0018-presence-context-and-location-sharing.md`
- `0021-private-behaviour-legal-risk-and-harm.md`

It is complemented by:

- `0023-adaptive-tone-motivation-and-self-binding.md`

## Non-goals

This ADR does not define:

- final calendar implementation
- final task database schema
- final conflict resolution for shared tasks
- complete household labour fairness model
- employer task management
- legal contract enforcement
- punishment or reputation scoring

## Open questions

Open questions before implementation:

- How are shared commitments synchronised and merged across Picos?
- How are disagreements represented?
- Can commitments be partially accepted?
- How are recurring shared commitments handled?
- How should Pico distinguish care, duty and normal social plans?
- Which nudges are local-only and which may be visible to other participants?
- How should cancellation etiquette be modelled?
- How should repeated non-participation be handled without creating blame profiles?

## Consequences

Positive:

- improves real-world coordination
- handles low-stakes and high-stakes commitments differently
- helps with unpleasant tasks through smaller steps
- reduces missed reservations and deadlines
- preserves user-specific motivation style

Negative:

- requires nuanced context classification
- can become annoying if nudge levels are wrong
- risks interpersonal conflict if blame language is used
- requires careful sync and consent handling
- hard to model fairness without becoming judgemental

## Design rule

Coordinate the next useful action. Do not shame the person. Escalate only according to commitment seriousness and user-owned policy.
