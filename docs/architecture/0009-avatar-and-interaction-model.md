# 0009 - Avatar and Interaction Model

## Status

Accepted for the foundation phase as a concept note.

## Context

Pico should eventually have a visible and audible presence. The avatar is part of the user experience, not part of the authority model.

This distinction is important: a friendly avatar must never imply that the LLM is allowed to bypass policy, permissions, or audit requirements.

## Interaction channels

Pico may eventually support multiple interaction channels:

- text chat
- voice input and output
- avatar state and animation
- status indicators
- notifications
- device-local UI surfaces
- Home Assistant UI surfaces
- mobile and desktop clients

## Avatar states

The protocol already allows avatar-related state events. The intended conceptual states include:

- idle
- listening
- thinking
- speaking
- waiting for confirmation
- executing
- blocked by policy
- error
- offline or degraded

## Separation of concerns

The avatar layer may display intent, mood, state, and progress.

The avatar layer must not decide permissions.

The avatar layer must not directly execute tools.

The avatar layer must not hide dangerous actions behind friendly wording.

## Risk indication

For risky operations, the interaction model should make the risk visible before execution.

Examples:

- read-only action: low friction
- local write: confirmation may be required
- external communication: confirmation required
- destructive action: strong confirmation required
- security-sensitive action: policy review required

## Voice model

Voice should be treated as an input and output channel, not as an authority bypass.

A spoken command must still pass through the same policy and confirmation model as a typed command.

## Design rule

The avatar makes Pico understandable and approachable. It does not make decisions, grant permissions, or execute actions.
