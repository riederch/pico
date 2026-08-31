# 0104 - Settings Belong to Pico, Not to Host Configuration

## Status

Status note, 2026-08-31: **Der dritte Takt dieses Homes steht jetzt neben den
beiden anderen.** Die Betriebszeile führte `PICO_DEPOT_FETCH_INTERVAL_MS` und
`PICO_LINK_RELAY_SWEEP_INTERVAL_MS`; der Takt der Modellwarteschlange fehlte,
und zwar nicht aus einem Grund, sondern als Auslassung: das Feld
`modelJobSweepIntervalMs` gab es, den Umgebungswert nicht, und die Voreinstellung
stand als `60_000` im Aufrufer statt als Name neben dem Vorgang. Damit war er
der einzige der drei, den nur ein Test im selben Prozess stellen konnte.

Die Begründung ist unverändert die der Zeile, in der er jetzt steht: eine Person
hat auf einen Takt keine Antwort, eine Betreiberin auf einem kleinen Rechner
schon. Neu entschieden wird hier nichts - eine Auslassung wird geschlossen.

Status note, 2026-08-24: **the relay's twelve were classified by nobody.**
`settings:check` reads `apps/core/src/config.ts` and holds its twenty-two
entries against S5 below. Pico Relay reads twelve of its own, and the check
never looked at them - its passing line said "22 environment entries, each
classified", which is true and reads as though it were all of them. The same
shape as the seventy-two wire labels beside a hundred and nineteen.

S2 makes a person's setting in the environment a defect, and the judgement
that none of these is one had never been written down. It is written now, in
S5's shape so the check can read it as a classification rather than as a
mention:

**S5 (relay), 2026-08-24 - deployment parameters, every one:**
`PICO_RELAY_DATABASE_PATH` is where the host puts the file.
`PICO_RELAY_HOST`, `PICO_RELAY_PORT`, `PICO_RELAY_HEALTH_HOST`,
`PICO_RELAY_HEALTH_PORT`, `PICO_RELAY_OPERATOR_HOST` and
`PICO_RELAY_OPERATOR_PORT` are where it listens - three ports on purpose,
since ADR 0147 keeps the mailbox surface, the health signal and operator
administration apart. `PICO_RELAY_OPERATOR` is the hostname senders resolve
to reach this relay, so it is an address rather than a preference, and the
service refuses to start without it rather than guessing one that would issue
addresses pointing elsewhere. `PICO_RELAY_MAX_CONNECTIONS`,
`PICO_RELAY_HEADERS_TIMEOUT_MS`, `PICO_RELAY_KEEP_ALIVE_TIMEOUT_MS` and
`PICO_RELAY_REQUEST_TIMEOUT_MS` are what the machine can carry.

**Not one of them is a person's decision**, and that is the load-bearing part:
a relay holds no Pico identity and decides nothing for anybody, so it has no
setting to misplace. The classification is cheap here precisely because the
component was built that way - and writing it down is what makes the emptiness
checkable instead of assumed.


Status note, 2026-08-16: **S3's retirement is carried out.**
`memory_encryption` is gone from the add-on configuration in 0.2.0, and
`options` is now empty - which is the shape S2 was asking for rather than an
accident: there is no person-facing option in host configuration to set.

The removal was safe by construction rather than by the release ordering this
gate first rested on. That ordering could not cover an instance that upgrades
late, because it passes through no release; what covers it is that an absent
variable is not a value. With nothing passed, the boot asks the store what it
holds, so a Home with encrypted content stays encrypted.

`check-addon-config.mjs` needed one correction to say so. Its reader could not
tell an *empty* `options` mapping from a *missing* one, so on the day the tree
reached S2's goal it reported the goal as a fault. Empty and absent are
different statements (ADR 0117 X1), including in a YAML reader.

**Verified against the image the same day, because a changelog sentence about
somebody else's data is worth proving rather than reasoning to.** A database
carrying `domain_encrypted` content with its decision row deleted - an
instance from before this gate - was mounted into the 0.2.0 container, which
carries no `memory_encryption` option and was given no `PICO_MEMORY_ENCRYPTION`
variable. It came up healthy and wrote `enabled: 1, inherited_from_host: 1` for
itself: it asked its own store what it holds, which is the whole argument. The
content stayed `domain_encrypted` and the key store was untouched.
`memory-encryption-inheritance.test.ts` already held that behaviour without a
container; what the run adds is that the packaged thing behaves like the
tested thing.

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

  **The ordering this gate first rested on was not enforceable, so the boot no
  longer depends on it.** The argument was: ship 0017 with the option, remove
  the option in the release after, and every instance records a row on its
  first boot under the new schema. Home Assistant validates options against
  the schema and drops what it no longer declares, so an instance that arrived
  on a release without the option would inherit `false` and read its own
  encrypted content back as `crypto_unavailable`.

  **An instance that upgrades late passes through no release.** It jumps from
  wherever it is to whatever is current, which is exactly the case the
  ordering cannot cover - and the damage was not a wrong setting, it was a
  Home told it has none of the machinery to read its own memories.

  So the absence is answered where it happens, and in this ADR's own posture:
  **an absent variable is not a value.** The config parser omits the field
  rather than reading a missing entry as `false` (ADR 0117 X1's construction),
  and the boot asks the store what it holds. A row stored `domain_encrypted`
  is not an opinion about a setting - it is content that needs a key store to
  be readable at all, so what an instance *has* decides what it inherits.
  A variable that is present still decides, in both directions, because a
  deployment that answered has answered.

  **The honest limit, and it is what keeps the ordering worth one release.**
  An instance that had encryption on and never wrote an encrypted item leaves
  no trace to read and inherits `off`. Nothing becomes unreadable - there is
  nothing - but its next memory would be recorded plaintext under a posture
  its owner had chosen against. One release carrying both 0017 and the option
  gives every instance that boots in that window a recorded row, which closes
  even that case for everyone except a Home that skips the window entirely and
  has never encrypted anything.

  So: 0017 ships first, the option goes in the release after it. The condition
  is unchanged and its standing is not - it is now a courtesy for one narrow
  case rather than the whole safety of the retirement.
- **S4a - Both settings reachable: done 2026-08-14.** A decision route with no
  surface is a decision nobody can make, which is the objection this ADR raises
  about host configuration wearing a different hat. Both now sit in the
  Foundation dashboard's administration section, beside the retention policies
  they share an access class with.

  The rendering carries the ADR's own distinction: **what this Home is running
  under and what somebody decided are two sentences**, because a key store is
  built before the database opens and a surface that showed one line would
  either hide the answer just given or claim a change that has not happened.
  The relay card says what a change costs - the number of mailboxes - while a
  person is deciding, rather than in the refusal afterwards, and a Home with no
  relay account reads as an absence rather than as a fault (ADR 0118 O4).
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
  | `PICO_DEPOT_FETCH_INTERVAL_MS`, `PICO_LINK_RELAY_SWEEP_INTERVAL_MS`, `PICO_MODEL_JOB_SWEEP_INTERVAL_MS` | Operational cadence. A person has no answer to these; an operator tuning a small host does. |
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
