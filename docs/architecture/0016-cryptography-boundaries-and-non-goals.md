# 0016 - Cryptography Boundaries and Non-goals

## Status

Accepted as a concept and safety constraint.

## Context

Pico may eventually need protected storage and protected transport for personal data, peer communication, backups, relay traffic and shared domains.

This area is high risk. A project-specific security scheme would create false confidence.

## Decision

Pico may define product boundaries, data domains, threat models and integration requirements.

Pico must use reviewed security building blocks instead of creating its own low-level scheme.

## Non-goals

Pico will not create custom:

- ciphers
- signature schemes
- key exchange schemes
- password protection schemes
- group message state machines
- recovery schemes

## Allowed direction

Future implementation should evaluate established building blocks such as:

- platform keystores
- passkeys or hardware-backed identity where appropriate
- libsodium primitives
- age-style backup protection
- reviewed group messaging approaches if group transport is required

The exact choice must follow a documented threat model.

## Required threat model topics

Before implementing protected domains, document:

- who controls keys
- which devices can read which domain
- what a server can see
- what a relay can see
- what happens after device loss
- what happens after relationship revocation
- how backup restore works
- how deletion interacts with protected payloads

ADR `0031-pico-link-identity-relay-and-domain-threat-model.md` defines the first concrete threat-model boundary for Pico Link identity, relay metadata and protected-domain work.

ADR `0033-key-lifecycle-rotation-revocation-and-recovery.md` defines lifecycle, rotation, revocation, lost-device, reset and recovery boundaries for future key and credential work.

ADR `0034-canonicalization-signature-inputs-and-test-vectors.md` defines canonicalization, signature-input and test-vector boundaries before future signatures or hashes become security-relevant.

ADR `0070-memory-store-encryption-at-rest-and-crypto-shredding-boundary.md` defines the memory-store-specific protection boundary: plaintext-at-rest content stays foundation data, per-domain encryption with crypto-shredding is the target, and no content-exposing surface ships before protection.

ADR `0071-memory-content-encryption-threat-model-and-primitive-direction.md` answers the threat-model questions above for memory-store content at rest and decides the primitive suite (`pico.suite.mem.v1`, libsodium XChaCha20-Poly1305) in the required dedicated step; implementation stays gated behind the ADR 0033 key-storage design and ADR 0034 test vectors.

## Design rule

Pico may use reviewed security primitives. Pico must not invent them.
