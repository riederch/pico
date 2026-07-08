# Parent-child relationship model

## Status

Accepted as a concept note.

A parent-child relationship between Picos must be modeled explicitly. It is not the same as a partner relationship and not the same as a normal family relationship.

The key difference is asymmetry: parents may have protective and administrative rights, while the child must still retain age-appropriate privacy, autonomy, and a path to full ownership later.

## Principle

Parent-child Pico trust is protective, age-dependent, transparent where appropriate, and designed to fade into autonomy.

Pico must support guardianship without becoming a covert surveillance tool.

## Relationship roles

```text
parent_pico
child_pico
guardian_pico
co_guardian_pico
emergency_guardian_pico
```

A child can have multiple guardians. Guardian permissions may differ.

## Age and maturity bands

Exact legal age rules depend on jurisdiction. Pico should model age bands as policy inputs, not hard-coded universal rules.

Recommended product bands:

| Band | Example | Default model |
| --- | --- | --- |
| small_child | young child | parent-managed, strong protection |
| child | school-age child | guided autonomy, visible boundaries |
| young_teen | early teenager | more privacy, safety escalation |
| older_teen | late teenager | high autonomy, narrow guardian rights |
| adult | adult child | normal peer relationship unless delegated |

The transition should be gradual, not a hard switch on one birthday.

## Allowed guardian functions

Depending on age, jurisdiction, and explicit configuration, a guardian may be allowed to:

- manage devices
- approve new trusted devices
- configure safety boundaries
- configure screen-time or quiet-time policies
- approve purchases or external accounts
- receive safety alerts
- coordinate school, appointments, transport, and family tasks
- help recover the child's Pico if a device is lost
- configure age-appropriate content restrictions

## Protected child privacy

Even children need protected private spaces. The scope depends on age and risk.

Examples:

- private diary or notes, if enabled
- private conversations, unless safety policy is triggered
- health questions, depending on age and law
- identity and personal development topics
- friendships and social context
- draft thoughts and unfinished messages

Pico should not default to full parental read-access to everything.

## Safety escalation

There must be a difference between normal privacy and safety-critical intervention.

Pico may escalate to a guardian when there are strong indicators of:

- immediate physical danger
- credible self-harm risk
- exploitation or grooming risk
- severe bullying or threats
- medical emergency
- dangerous location or travel issue

Escalation should disclose the minimum necessary information and explain why it escalated when safe to do so.

## Transparency

The child should generally know what the guardian can see and control.

Examples:

- visible guardian permissions
- visible device management policy
- visible location sharing policy
- visible content restrictions
- visible audit of guardian access, where appropriate

Exceptions may exist for emergency or abuse-risk handling, but those should be carefully designed.

## Anti-abuse requirements

A guardian relationship can be misused. Pico must be designed with this in mind.

Required properties:

- no hidden always-on surveillance by default
- no unlimited message reading by default
- no silent export of a child's private data
- no parent override of age-appropriate protected zones without policy reason
- audit of guardian access
- emergency contacts and alternate guardians can be configured
- older children should have increasing control over export and migration

## Split household and custody

Children may live in split households.

Pico must support:

- multiple guardians with different permissions
- custody schedules
- household-specific smart-home access
- school and activity coordination
- emergency access
- conflict handling when guardians disagree

A parent who owns one household server must not automatically own the child's full Pico identity.

## Child portability

The child's Pico identity should be portable.

If the child moves between households or later becomes an adult, the Pico must support migration without data loss.

At adulthood, the default should become:

- guardian rights expire or require renewal by the now-adult user
- personal encryption keys move fully under the adult user's control
- parent relationship becomes a normal family or trusted-contact relationship
- historical guardian audit remains available according to retention policy

## Data domains

Recommended domains:

| Domain | Owner/control |
| --- | --- |
| child_personal | child, with age-dependent guardian policy |
| child_safety | safety-relevant, guardian visible under policy |
| child_school | child and guardian, often shared |
| child_family | family group |
| parent_admin | guardian configuration and audit |
| adult_transition | migration and rights handover |

## Design rule

A parent Pico may protect and guide a child Pico, but it must not permanently own the child's Pico identity.
