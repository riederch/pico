# 0010 - Tool Policy and Executor Model

## Status

Accepted for the foundation phase as a concept note.

Status note, 2026-08-10: ADR 0139, 0140 and 0141 turn this note into
decisions and this text keeps its wording under ADR 0128's record rule.
What survives unchanged is the substance: the six risk classes, the three
policy outcomes, the separation of static risk from contextual decision,
the executor constraints, the redaction requirement and the design rule
at the end. What no longer holds is the layering. The reasoning layer is
two roles with different trust since ADR 0117 split planner from
quarantined reader; tools are module-declared effects since ADR 0128 H3
rather than a registry the core owns; and the audit log is a chain over
the event log since ADR 0121, so ADR 0141 makes Action History a view
rather than a fourth component. The framing "the LLM may propose an
action" is also narrower than the path needs: ADR 0139 decides that every
requester is untrusted, and the first one is a person.

## Context

Pico will eventually call tools and act on local devices, Home Assistant, external services, files, and user data.

This makes authority boundaries more important than model capability.

The language model must not directly execute arbitrary actions.

## Responsibility split

Pico is split into four conceptual layers:

1. LLM reasoning layer
2. Policy engine
3. Executor
4. Audit log

The LLM may propose an action.

The policy engine decides whether the action is allowed, blocked, or requires user confirmation.

The executor performs only approved actions.

The audit log records the decision and result.

## Tool risk classes

Tools should be classified by risk:

- `read_only`
- `local_write`
- `external_write`
- `destructive`
- `security_sensitive`
- `privileged_system_action`

The risk class is part of the tool request, not just UI wording.

`forbidden` is not a tool risk class. It is a policy decision outcome. A tool can be high risk because of what it does, but a concrete request is allowed, denied or sent to confirmation by policy.

## Policy decision outcomes

Policy decisions should use explicit outcomes:

- `allow`
- `require_confirmation`
- `deny`

This keeps static tool risk separate from contextual policy decisions.

Example:

```text
Tool risk: external_write
Policy decision: require_confirmation
Reason: sending a message to another person requires explicit user approval
```

## Confirmation model

Read-only actions may be allowed without confirmation if policy permits.

Writes require policy checks.

Destructive or security-sensitive actions require explicit confirmation.

A tool must never escalate from read-only to write behavior without a new policy decision.

## Executor constraints

The executor must:

- validate arguments
- enforce allowlists and scopes
- execute only declared tool behavior
- return structured results
- record failures
- avoid hidden side effects

The executor must not offer a raw unrestricted shell as a general LLM tool.

## Policy constraints

Policy decisions may depend on:

- user identity
- device identity
- location of execution
- tool risk class
- relationship context
- privacy zone
- data domain
- recent confirmations
- current safety mode

## Audit requirements

For every tool call, Pico should eventually record:

- requested action
- requesting model/session
- policy decision
- user confirmation, if any
- executor result
- timestamp
- device identity
- affected data domain

Audit records should avoid storing full sensitive payloads when a summary or reference is enough.

## Current foundation API boundary

The current generic `POST /api/events` endpoint is only a foundation event ingestion surface.

It must not be treated as the policy, executor or audit API. Policy, confirmation, executor and audit event types may exist in the shared protocol before their dedicated write paths exist, but they must not be accepted through the generic unauthenticated foundation event endpoint.

## Design rule

The LLM is allowed to reason. The policy engine is allowed to decide. The executor is allowed to act. These responsibilities must not collapse into one unchecked component.