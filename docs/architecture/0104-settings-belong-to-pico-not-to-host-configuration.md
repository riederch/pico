# 0104 - Settings Belong to Pico, Not to Host Configuration

## Status

Accepted; currently violated in two named places. `memory_encryption` is a
Home Assistant add-on option and `pico_foundation_token` is a Home Assistant
add-on option, and both are decisions a person makes about their own Pico.
They stay where they are until the replacement paths exist, and this ADR names
them as debt rather than pretending the rule already holds.

## Context

Pico currently exposes person-facing decisions through the host's
configuration surface. `pico_core/config.yaml` carries `memory_encryption`
and `pico_foundation_token`, so turning on memory encryption means editing an
add-on option in Home Assistant, restarting the add-on, and knowing that the
option exists at all.

That is backwards for a product whose premise is that a person owns their own
companion. It puts a Pico setting in a place that belongs to whoever
administers the host, it makes the setting invisible to anyone using Pico
through any other surface, and it means a person on a phone cannot change
their own privacy posture without access to the Home Assistant admin UI.

It also contradicts the boundary this project has been careful about
everywhere else: ADR 0015 and 0024 keep the host as infrastructure and deny it
authority over residents. A host-owned option that decides whether a person's
memory is encrypted is exactly that authority, arriving through the back door.

## Scope

Covers: where person-facing settings live, how they are changed, and what
remains legitimately outside Pico.

Does not cover: the runtime that will serve these settings (Pico Rules and the
companion surfaces are separate work); authentication for that runtime; the
migration order for the two named violations; anything about Pico Link.

## Decision

### Anything a person decides is set in Pico

Every setting that expresses a person's choice about their own Pico is stored
and changed through Pico itself: memory encryption posture, retention rules,
privacy domains, sharing and readership, tone, delegation limits, and whatever
later joins them. It is reachable from a Pico surface, it takes effect without
editing a file, and it survives moving the Home to a different host.

No such setting may be introduced as a host configuration file entry, an
add-on option, or an environment variable. That is a hard rule for new work,
not an aspiration.

### Deployment parameters are not settings, and stay outside

The boundary is what the value is *for*, not where it happens to be stored.

A deployment parameter tells a process how to exist on this machine: which
database file, which backup directory, which key-store path, which bind
address and port, which device id, which web root. Pico needs these to start
at all, so they cannot live inside Pico without circularity, and they belong
to whoever installs and operates the instance.

A setting expresses what a person wants their Pico to do. Those go in Pico.

The test is: could the answer differ between two people sharing one Home? If
yes, it is a setting. A database path cannot differ per person; a retention
rule can.

### The host may not decide for the person

A host administrator may install, update, back up and remove the instance.
They may not, through host configuration, decide a resident's privacy posture.
Where a person's setting has to be enforced by host-side infrastructure, the
host executes the person's recorded decision rather than carrying its own copy
of it.

This is the same separation ADR 0024 and 0087 draw for authority, applied to
configuration, and it is why the two current violations matter beyond
tidiness.

### Transitional host entries must be named and bounded

Some host-level entries are legitimate while the product path does not exist.
`pico_foundation_token` is one: ADR 0038 and 0041 introduced it as temporary
Foundation hardening, and it disappears when real authentication exists. Such
an entry is acceptable only while it is documented as transitional, named in
the implementation status, and has a decided replacement.

`memory_encryption` does not meet that bar. It is a person's privacy decision
with no reason to be a host option other than that no other surface existed
when it was added.

## Gates

- **S1 - Rule recorded: Done.** The invariant is in `AGENTS.md` and in this
  ADR, so new work has something to be held against.
- **S2 - No new host settings: Done as a rule.** Any new person-facing setting
  introduced as an add-on option, config file entry or environment variable is
  a defect from now on.
- **S3 - `memory_encryption` moves into Pico: the decision does, 2026-08-14.**
  A durable row holds it, an operator route sets it, and the boot reads it
  before the key store is built - which needed a second, short-lived database
  connection, because the key store has to exist before the event store opens
  and the decision lives inside the event store. Two opens at boot is the cost
  of a setting that decides something; a decision read afterwards would be a
  setting that takes effect never.

  **The migration is inheritance rather than a cut-over.** An instance with no
  decision inherits the host option and records *that it inherited*, so nothing
  changes on the day it upgrades and the next answer comes from Pico. Inherited
  and decided are kept apart because they are different facts: an inherited
  value never overwrites a decided one, or the add-on option would be back in
  charge through the door this table exists to close.

  The add-on option stays for now and stays transitional. What it still does is
  supply the value an instance inherits on its first boot under this schema;
  what it no longer does is decide. Retiring it is the remaining half of S3.
- **S4 - `pico_foundation_token` retires: Open.** Bound to the ADR 0038/0041
  replacement of temporary Foundation hardening with real authentication, not
  to this ADR.
- **S5 - Deployment parameters documented as such: Open.** The twelve `PICO_*`
  environment variables are not separated anywhere into deployment parameters
  and settings; that list should say which is which.

## Non-goals

- moving deployment parameters (paths, ports, bind address, device id) into
  Pico;
- designing the settings runtime, its storage or its authentication here;
- removing the transitional Foundation token before its replacement exists;
- a settings UI specification;
- any change to how the Vault daemon is started or addressed locally - a
  person-side tool naming its socket or its Foundation URL is an invocation
  parameter, not a setting.

## Consequences

Positive:

- a person's decisions follow their Pico rather than the host it currently
  runs on, which is what moving a Home between hosts has to mean;
- the host-as-infrastructure boundary now covers configuration, closing a gap
  that the authority work had already closed everywhere else;
- new settings have one obvious home, so the question stops being decided per
  feature.

Negative and residual:

- two violations remain, one of them a person's privacy posture, and this ADR
  does not remove them;
- until S3, turning on memory encryption still means editing a Home Assistant
  option and restarting, and that is now a documented defect rather than the
  design;
- the settings runtime does not exist, so S3 cannot be scheduled before there
  is a surface to put it on.

## Relationship to other ADRs

- Extends the ADR `0015`/`0024` host-as-infrastructure boundary from authority
  to configuration.
- Constrains ADR `0038`/`0041`: the Foundation token remains acceptable only as
  the transitional entry those ADRs already call it.
- Applies to ADR `0074` retention rules, which are already settings served by
  Pico and are the shape the rest should follow.
- Does not change ADR `0103`: a person-side CLI naming a socket path or a
  Foundation URL passes an invocation parameter, not a setting.

## References

- [ADR 0015](0015-full-clients-light-clients-and-relay.md)
- [ADR 0024](0024-server-bootstrap-tenancy-and-eviction.md)
- [ADR 0038](0038-foundation-local-access-hardening-and-ingress-boundary.md)
- [ADR 0041](0041-foundation-access-modes-and-direct-port-gate.md)
- [ADR 0074](0074-memory-retention-policy-and-expiry-deletion-boundary.md)
