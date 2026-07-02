# 0010 - Tool Policy and Executor Model

## Status

Accepted for the foundation phase as a concept note.

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

- read_only
- local_write
- external_write
- destructive
- security_sensitive
- privileged_system_action

The risk class is part of the tool request, not just UI wording.

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

## Design rule

The LLM is allowed to reason. The policy engine is allowed to decide. The executor is allowed to act. These responsibilities must not collapse into one unchecked component.
