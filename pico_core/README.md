# Pico Core

Pico Core brings the foundation of a personal AI companion into Home Assistant.

It is designed as the local-first core for Pico: a companion service that can grow from simple event handling into a trusted assistant for home, devices, context, and everyday workflows. The focus is privacy, clear boundaries, and a future execution model where AI may suggest actions, but policy, confirmation, and auditability decide what is allowed to happen.

## What Pico Core provides today

This foundation release gives Home Assistant a runnable Pico Core service with:

- a local HTTP API
- a realtime WebSocket endpoint
- SQLite-backed event storage
- a health check for add-on supervision
- the first packaging and update path for future Pico features

## Why it exists

Pico is intended to become more than a chatbot. The long-term goal is a personal companion that can run across trusted devices, understand context, and help with tasks while keeping control local and transparent.

Home Assistant is a natural first home for Pico because it already connects many of the systems, sensors, devices, and automations that a useful companion should understand.

## Current status

Pico Core is in the foundation phase. It is suitable for testing the add-on packaging, update flow, API surface, and event protocol.

It is not production-ready yet. Authentication, policy-gated tool execution, migrations, backup/rollback support, encrypted data domains, and the real companion UI are planned next steps.

## Technical entry points

- HTTP API: port `3100`
- WebSocket endpoint: `/ws`
- Health endpoint: `/health`
- Event API: `/api/events`

## Release and updates

Updates are delivered through Home Assistant's normal add-on update flow. The add-on version follows the Pico Core container image tag published by the repository workflow.
