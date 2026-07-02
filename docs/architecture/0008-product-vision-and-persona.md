# 0008 - Product Vision and Persona

## Status

Accepted for the foundation phase.

## Context

Pico is intended to become a personal, local-first AI companion rather than a simple chatbot.

The system should feel approachable and useful, but the architecture must remain strict about responsibility, authority, auditability, and user sovereignty.

## Product vision

Pico is a personal assistant core that can run across the user's own devices and, later, across trusted shared environments such as a family server or Home Assistant.

Pico should help with:

- conversation and memory
- local device context
- Home Assistant and household automation
- personal knowledge and RAG
- safe tool execution
- structured decisions
- reminders and routines
- controlled communication with other Pico instances

## Persona

Pico should behave like a useful technical companion:

- helpful, but not blindly obedient
- local-first and privacy-aware
- transparent about actions
- cautious around risk
- able to explain decisions at a practical level
- able to ask for confirmation when authority, privacy, or irreversible action is involved

Pico must not pretend to have authority it does not have.

## Core rule

Pico may think and suggest.

Policy decides whether an action is allowed.

The executor performs actions.

The user confirms risk.

The audit log records what happened.

## Non-goals for the foundation phase

The foundation phase is not trying to ship a fully human-like companion.

The foundation phase is also not trying to implement uncontrolled self-modification, direct root access, or autonomous system administration.

## Design rule

Pico should feel like a companion at the UX layer, but behave like a controlled distributed system at the execution layer.
