# 0105 - Pico Runs as a Background Companion, Not a CLI

## Status

Accepted product-form decision. ADR 0113 has since decided B2's shell and
landed the companion service core; the CLI remains a transitional tool
rather than a product surface.

## Context

ADR 0097 chose "CLI plus local daemon, Linux first" as the first Vault
product form, and everything built since has followed it: the daemon, the
approval channel on a hold connection, and the ADR 0103 ceremony commands
that found a Home and create a domain.

That decision was about where key custody runs as a process. It was read,
including by the work done under it, as if it also described how a person
uses Pico. It does not. A person does not open a terminal to talk to a
companion, and ADR 0008 and 0035 have described Pico as a companion with an
avatar from the start.

The gap became concrete twice. ADR 0099 routes an approval to "the terminal
holding the unlock", which is only meaningful if a terminal is the product.
And the Vault-to-Foundation path has no authenticated channel that is not
the deliberately closed direct port, because no client existed that needed
one - the CLI simply took a URL.

## Scope

Covers: the product form a person interacts with, where interaction
happens, and what the CLI is for.

Does not cover: the transport between an app and a Pico Home (Pico Link);
which platforms come in which order; how an avatar renders an approval;
what the companion runtime does; or any change to custody, canonical bytes
or verification rules.

## Decision

### Pico runs as a background service with an avatar

Pico runs continuously in the background on the person's device and is
reached through the Pico avatar, not through a command line. The avatar is
the interaction surface; the background service is what stays available
between interactions.

### The channel is whatever the device has

Interaction uses whichever channels the device offers - text chat, voice
through a microphone, camera, a watch face, a small display - and degrades
to what is present rather than requiring any single one. A device with no
microphone is not a lesser Pico; it is a Pico that is talked to by typing.

This is why the companion surface cannot be specified per platform: the
same Pico presents itself through different channels depending on where it
is running.

### The CLI is a tool, not the product

`pico-vault` remains, and remains useful for setup, diagnosis, scripting
and development. It is not how a person is expected to use Pico, and no
product decision may assume a terminal is present.

Concretely, the ADR 0103 ceremony commands are the right ceremonies in a
transitional wrapper. Their logic - build the record, have the daemon sign
it under approval, deliver it to the Foundation - is what the background
app will do; the argument parsing is not.

### Approval belongs to the avatar

ADR 0099 binds approval to the connection holding the unlock, and that
connection is currently a terminal. The binding is right and stays: the
holder of the key decides what the key signs. What changes is who the
holder is - the background service holds the unlock, and the avatar asks
the person.

This makes the ADR 0099 rendering gap load-bearing rather than cosmetic. A
person shown a family name, a key and a digest at a terminal can be assumed
to be technical. A person asked by an avatar cannot, so the rendered
statement that ADR 0099 named as future work becomes a precondition for
this product form rather than a refinement of it.

## Gates

- **B1 - Recorded: Done.** The product form is written down, so later work
  stops inheriting the CLI as an assumption.
- **B2 - Background service: Partially implemented.** ADR 0113 decides the
  shell (Electron over a shell-free service core), lands the service core
  in C1 and hosts it in the Electron main process in C2. Packaging,
  autostart, measured tray budget and owning the Vault-unlock interaction
  remain C3/later work.
- **B3 - Avatar interaction: Started.** ADR 0113 C2 supplies the first
  sandboxed renderer and its closed typed bridge for status/alarm
  presentation. Channel detection, approvals, settings, ceremonies,
  graceful degradation and an approved Character asset remain open.
- **B4 - Approval rendering: Done.** ADR 0106 makes the daemon build both
  canonical signature input and human statement from the same fields.
- **B5 - Transport: Partially implemented.** ADR 0107 D1-D5 supplies the
  pinned, signed and sealed direct client plus an envelope-only listener
  without bearer sessions. The real process gate proves that this listener
  exposes no Foundation routes, and the direct threat ledger is explicit.
  Relay-backed product reachability remains open.

## Non-goals

- removing or deprecating `pico-vault`;
- changing the custody boundary, the daemon, or which key signs what;
- specifying platforms, their order, or an avatar visual design here;
- assuming any particular channel is available.

## Consequences

Positive:

- the product form is stated, so a decision that assumes a terminal is now
  visibly wrong rather than merely unexamined;
- the ADR 0099 rendering gap gets its real weight;
- the missing Vault-to-Foundation channel is named as a transport problem
  rather than a configuration one.

Negative and residual:

- the distance between this product form and the current state remains
  larger than any single gate suggests; B2 is not packaged and B3's first
  status surface is not yet the broader avatar interaction model;
- the ADR 0103 ceremony commands are transitional, and their CLI surface
  will be replaced even though their logic survives;
- ADR 0097's platform order was reasoned about a daemon, not about a
  background app with an avatar, and may not survive contact with B2.

## Relationship to other ADRs

- Narrows ADR `0097`: its CLI-plus-daemon decision covered the Vault
  process form, not the product form, and the daemon boundary is unchanged.
- Makes the ADR `0099` rendering gap a precondition instead of future work,
  without touching its approval binding.
- Gives ADR `0009` and `0035` the concrete product statement they described
  in the abstract.
- Restates the ADR `0103` ceremony commands as transitional tooling.
- Leaves ADR `0104` untouched: settings still belong to Pico, and an avatar
  is where a person will change them.

## References

- [ADR 0008](0008-product-vision-and-persona.md)
- [ADR 0009](0009-avatar-and-interaction-model.md)
- [ADR 0035](0035-pico-as-digital-companion-and-twin-model.md)
- [ADR 0097](0097-deployable-vault-process-and-local-ipc-authority-boundary.md)
- [ADR 0099](0099-hold-channel-approval-for-authority-creating-signatures.md)
- [ADR 0103](0103-person-side-ceremony-client-and-first-installation-validation.md)
- [ADR 0113](0113-electron-shell-over-a-shell-free-companion-service-core.md)
