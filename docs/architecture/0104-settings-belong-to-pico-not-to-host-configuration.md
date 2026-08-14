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

  **Retirement decided 2026-08-14, and it is a removal from the add-on
  configuration rather than from the code.** The option disappears from
  `pico_core/config.yaml`, so nobody sets a privacy decision in host
  configuration any more, which is what this ADR objected to.
  `PICO_MEMORY_ENCRYPTION` stays as a silent inheritance source: it costs
  nothing, decides nothing, and it is what an instance reads on its first boot
  under the 0017 schema.

  **It may not ship in the same release as 0017, and that ordering is the
  whole safety of it.** Home Assistant validates options against the schema
  and drops what the schema no longer declares. An instance upgrading straight
  onto a release that has both would boot with the option already stripped and
  no decision row yet - inheriting `false`, and reading its own encrypted
  content back as `crypto_unavailable` for no reason anybody chose. One
  release with 0017 and the option guarantees every instance records a row on
  its first boot; the next release may remove the option, because by then
  there is nothing left to inherit from.

  So: 0017 ships first, the option goes in the release after it. What is
  written down here is the condition, not a date, because the condition is
  what makes it safe and a date is only when somebody expects it.
- **S4 - `pico_foundation_token` retires: Open.** Bound to the ADR 0038/0041
  replacement of temporary Foundation hardening with real authentication, not
  to this ADR.
- **S5 - Deployment parameters documented as such: listed 2026-08-14.** There
  are twenty-two, not twelve; the count in this gate was written when there
  were fewer and nobody updated it, which is its own small argument for
  keeping the list somewhere a reader can check.

  The test is the one above: could the answer differ between two people
  sharing one Home, and does it survive moving the Home to another host?

  | Deployment parameter | Why |
  |---|---|
  | `PICO_DATABASE_PATH`, `PICO_BACKUP_DIRECTORY` | Where this process keeps its files. |
  | `PICO_KEY_STORE_PATH`, `PICO_HOME_HOST_KEY_STORE_PATH`, `PICO_RECOVERY_ANCHOR_PATH` | Custody locations on this disk. What they hold is Pico's; where they sit is the installation's. |
  | `PICO_WEB_ROOT`, `PICO_DEPOT_ROOT`, `PICO_SUPPLIER_SCRATCH_ROOT` | Directories this machine offers. |
  | `PICO_HOST`, `PICO_PORT`, `PICO_LINK_INTAKE_HOST`, `PICO_LINK_INTAKE_PORT` | Which sockets this process binds. |
  | `PICO_DEVICE_ID` | Which process this is, among several on one host. |
  | `PICO_FOUNDATION_ACCESS_MODE`, `PICO_WS_ALLOWED_ORIGINS` | ADR 0041/0038: how far this instance's API reaches on this network. |
  | `PICO_DEPOT_FETCH_INTERVAL_MS`, `PICO_LINK_RELAY_SWEEP_INTERVAL_MS` | Operational cadence. A person has no answer to these; an operator tuning a small host does. |
  | `PICO_LINK_RELAY_BASE_URL` | Where the operator this Home holds an account with answers today. See the split below: the account is Pico's, the URL is the host's. |

  **Transitional, and named as such:**

  | Entry | Status |
  |---|---|
  | `PICO_MEMORY_ENCRYPTION` | S3 moved the decision into Pico on 2026-08-14. This now supplies only what an instance *inherits* on its first boot under the new schema, and decides nothing afterwards. |
  | `PICO_LINK_RELAY_OPERATOR`, `PICO_LINK_RELAY_ACCOUNT_ID` | Settings since 2026-08-14, held in `pico_link_relay_identity`. These supply what an instance inherits on its first boot under the 0018 schema, and decide nothing afterwards. |
  | `PICO_FOUNDATION_TOKEN` | S4, bound to the ADR 0038/0041 replacement rather than to this ADR. |

  **The three relay entries, sorted 2026-08-14 by splitting them.** This gate
  first recorded them as unclassifiable, and that was right: they failed the
  test in both directions because they are not one thing. Two residents
  plausibly share one relay account, which reads like infrastructure - and the
  choice survives moving the Home to another host, which is this ADR's own mark
  of a setting.

  What separates them is ADR 0031's own distinction, the same one the model
  provider entry makes between what a thing *is* and where it *answers*:

  | Entry | Class | Why |
  |---|---|---|
  | `PICO_LINK_RELAY_OPERATOR`, `PICO_LINK_RELAY_ACCOUNT_ID` | Setting, inherited on first boot | **Identity.** Which operator carries this Home's messages, and as whom. One answer per Home rather than per person, and it survives moving the Home - which is what makes it Pico's. |
  | `PICO_LINK_RELAY_BASE_URL` | Deployment parameter | **Reachability.** Where that operator answers today. It can change without anybody deciding anything - a hostname move, a proxy in front - and nobody should have to re-decide their identity because a URL changed. |

  The identity is stored and inherited exactly as S3's decision is: an
  inherited value never overwrites a decided one.

  **Changing it is refused while mailboxes exist, and the refusal carries the
  count.** ADR 0148 gives every relationship its own address pair at this
  operator under this account, so a Home that changed account would be holding
  addresses nobody answers at, and every device would need a fresh exchange.
  That is a move somebody decides to make, not a consequence of an edit - so
  what it costs is said in the refusal, as the number of relationships that
  would have to be re-established, before the change rather than after it.

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
