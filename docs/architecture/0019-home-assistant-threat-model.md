# 0019 - Home Assistant Threat Model

## Status

Accepted as a foundation safety constraint.

## Context

Home Assistant is Pico's first packaging and runtime path. It is useful because it already connects local devices, sensors, scenes and household routines.

That also makes it risky. A Pico add-on can become a powerful local control surface if it gains access to Home Assistant entities or tokens later.

## Decision

Home Assistant integration must remain policy-gated, visible and auditable.

The add-on must not become a hidden automation or control layer.

## Current foundation boundary

The current add-on provides only:

- `/`
- `/health`
- `/api/system/version`
- `/api/system/status`
- limited `/api/events`
- `/ws`
- persistent SQLite storage

It does not yet provide Home Assistant entity access, ingress, policy execution or tool execution.

## Risk domains

Future Home Assistant tools should classify entities and services by risk:

| Domain | Examples | Default posture |
|---|---|---|
| read-only state | temperature, status, non-sensitive sensor | low risk if scoped |
| presence context | people, device trackers, room presence | sensitive |
| media and microphones | cameras, microphones, recordings | high risk |
| comfort control | lights, climate, covers | write risk |
| infrastructure control | heating, pumps, PV, battery, wallbox | high operational risk |
| access control | doors, gates, locks, alarm | security-sensitive |
| destructive or dangerous control | disabling protection, unsafe energy state | block or require strong policy |

## Required controls before HA tools

Before adding Home Assistant tools, Pico needs:

- authentication or ingress boundary
- entity allowlists
- service allowlists
- read/write risk classification
- policy decisions
- user confirmation for risky actions
- audit records
- clear UI indication of active access

## Design rule

Home Assistant can be a Pico runtime and tool source, but it must not bypass Pico's policy, consent and audit model.
