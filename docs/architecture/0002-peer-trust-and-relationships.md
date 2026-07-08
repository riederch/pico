# Peer trust and relationship model

## Status

Accepted as a concept note.

Pico-to-Pico communication must reflect the real relationship between the owners. A stranger's Pico may communicate with the local Pico, but only at a basic and privacy-preserving level. A spouse or long-term partner may be allowed to share much more, but not without personal boundaries.

## Principle

Pico trust is relationship-aware, consent-based, scoped, and revocable.

Relationship trust must never mean that one user owns the other user's private context. Even in close relationships, some information can remain private by design.

## Relationship levels

| Level | Meaning | Default communication |
| --- | --- | --- |
| stranger | Unknown Pico or unknown person | Deliver basic messages and invitations only |
| known_contact | Known person from contacts | Invitations, simple coordination, no private details |
| friend | Trusted private contact | Broader scheduling and context sharing after consent |
| family | Family member | Household coordination, reminders, shared tasks, scoped calendars |
| partner | Spouse or long-term partner | Broad sharing by default, with explicit private zones |
| team_member | Work or organization member | Work-scope sharing only |
| admin_delegate | Person trusted for technical administration | Technical actions within explicit scopes |
| blocked | Blocked person or Pico | No communication |

## Privacy zones

Each user can define private zones that are not shared automatically, regardless of relationship level.

Examples:

- private calendar entries
- medical information
- legal information
- financial information
- private messages
- sensitive contacts
- location history
- relationship-sensitive context
- personal journals
- secrets and credentials

Pico must treat these zones as hard boundaries unless the owner explicitly releases a specific item.

## Partner relationship

For spouses and long-term partners, Pico may support a high-trust mode.

Allowed by default, if enabled by both users:

- shared reminders
- shared household tasks
- shared shopping lists
- broad free/busy scheduling
- location sharing, if separately enabled
- travel and logistics coordination
- shared smart-home actions
- family calendar coordination
- emergency escalation

Still protected by default:

- private entries
- personal notes
- sensitive messages
- secrets and credentials
- hidden or private contacts
- any explicitly excluded context

The product must not assume that a partner relationship means full disclosure of everything. High trust is still scoped trust.

## Scheduling privacy

When Pico B answers Pico A about availability, it should disclose only the minimum useful information.

Good:

- Bob is available tomorrow around 14:00.
- Bob is not available tomorrow afternoon.
- Bob suggests 15:30 instead.

Bad:

- Bob has a doctor appointment at 09:00 and a private meeting at 12:00.
- Bob's calendar is empty except for a private event.

## Consent rules

Pico may negotiate, but humans approve social commitments.

- A Pico may receive an invitation automatically.
- A Pico may check local availability if the owner allowed this.
- A Pico may suggest a time.
- A Pico must ask the owner before accepting social commitments, unless the owner configured a narrow auto-accept rule.
- A Pico must not expose private reasons for rejection.

## Auto-accept rules

Auto-accept rules must be narrow and explicit.

Example:

- Auto-accept coffee invitations from Alice on weekdays between 13:00 and 17:00 if there is no calendar conflict.

Not acceptable:

- Auto-accept everything from my spouse.
- Share all my calendar details with my spouse.

## Trust is directional

Alice may trust Bob more than Bob trusts Alice. Therefore each relationship edge has its own policy.

```text
Alice Pico -> Bob Pico: friend
Bob Pico -> Alice Pico: partner
```

The effective shared capability is the intersection of both users' policies.

## Revocation

Every relationship permission must be revocable.

Revocation should invalidate future access, but it must not rewrite past audit logs.

## Audit

Pico must log:

- peer message received
- peer message sent
- relationship level used
- capability used
- consent requested
- consent granted or denied
- private zone access denied

Audit logs must avoid storing sensitive payloads unless necessary.

## Design rule

Picos can coordinate on behalf of people, but they must not become surveillance tools between people.
