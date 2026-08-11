# 0036 - Capabilities, Connectors and MCP Boundary

## Status

Accepted as a capability and integration boundary concept.

Status note, 2026-08-11: ADR 0136 and ADR 0144 turn the connector half of
this note into decisions, and this text keeps its wording under ADR 0128's
record rule. What survives unchanged is the substance this ADR is cited
for: the core rule that MCP is a tool connection method and not Pico
authority, capability before connector, the same capability having several
providers, the refusal to make MCP the only tool interface, and the rule
that connectors never hand raw secrets to a model.

Four illustrations no longer hold.

The **direct tool connection** shape - `Pico Assistant -> MCP server ->
target system` - has no process boundary in it, and ADR 0136 BR2 requires
one: supplier code runs outside the core process wherever Pico authored
neither the parser nor the bytes. "A Pico Assistant may act as an MCP
client" is therefore no longer the placement. An MCP client is a bridge's
implementation and, under ADR 0144, the lower half of a supplier stack
inside one depot.

The **connector registry** here carries "available capabilities", which
would make a connector's advertised list the set of things Pico may do.
Since ADR 0128 H3 an effect is declared by the module that bears it, and
since ADR 0139 AC1 the effect list is the manifest list, refused at the
request contract before any decision is asked for. A connector describes
itself; it does not extend the catalog.

The **capability metadata** table lists `risk_class`,
`confirmation_default`, `audit_requirement` and `privacy_domain_access` as
properties travelling with a capability. Those are now decided elsewhere
and by parties that are not the connector: risk and outcome by ADR 0140
from a closed typed input, approval and its statement by ADR 0141 RN3/RN4,
history as a view over log plus chain, and the privacy domain by ADR 0137
IN5 as a person's judgement with no safe default.

The **model reads the tool surface** framing - "the model may see a tool
name, schema, scoped descriptions and returned results" - is narrower than
the path now allows. ADR 0116 W2 labels foreign content at the threshold
and ADR 0117 splits the planner from a quarantined reader, so the acting
model does not receive a description written on the far side of a network.
ADR 0140 states the same refusal for the decision layer: a closed typed
input, never prose.

The non-goals stand, including "an MCP client", which nothing in the tree
implements.

## Context

Pico will need to use tools from many sources: Home Assistant, MQTT, local files, databases, cloud APIs, Meshtastic adapters, vendor systems, local scripts, and future domain-specific connectors.

The Model Context Protocol (MCP) is a useful tool interface, but Pico must not become architecturally dependent on MCP as its only capability mechanism. Equally, MCP must not bypass Pico Rules, Action Runner, privacy domains or Action History.

This ADR defines how Pico should treat capabilities, connectors and MCP-style tools.

## Decision

Pico models actions as capabilities first.

A capability describes what Pico may do or ask to do. The connector or protocol describes how that capability is implemented.

Capability examples:

- list devices
- read state
- call a service
- publish a message
- read a file
- write a configuration
- send a message
- request an offer
- prepare an order
- create a reminder
- ask for approval

Implementation mechanisms may include:

- built-in Pico connector
- Home Assistant API
- MQTT
- REST or GraphQL API
- local file or database connector
- Meshtastic or another transport adapter
- vendor cloud API
- MCP server
- future tool protocol

## Core rule

> MCP is a tool connection method. It is not Pico authority. Pico Rules, Action Runner, privacy domains and Action History remain above the tool protocol.

## Pico Assistant and MCP

A Pico Assistant may act as an MCP client.

This enables advanced users or local deployments to connect Pico directly to existing MCP servers, for example:

```text
Pico Assistant
-> MCP client
-> MCP server
-> Home Assistant / files / git / database / custom API
```

This is valid, but direct MCP use still needs a policy boundary before risky actions are executed.

## Pico Home and MCP

Pico Home may also expose or host MCP-compatible tools.

In that role, Pico Home is a connector runtime and local policy enforcement point:

```text
Pico Assistant
-> Pico Home
-> Pico Rules
-> Action Runner
-> connector / MCP server / local service
```

A future Pico Home may provide tools such as:

```text
home.list_devices
home.get_state
home.call_service
mqtt.publish
mqtt.read_snapshot
meshtastic.send_message
filesystem.read_scoped
wmbus.read_meter
automation.run
```

Those names are illustrative. Final wire names must follow compatibility rules.

## Direct connector versus Pico Home connector

Both deployment shapes are allowed:

### Direct tool connection

```text
Pico Assistant -> MCP server -> target system
```

Useful for:

- developers
- power users
- local desktop assistant modes
- simple single-user setups
- experiments and prototypes

### Pico Home mediated connection

```text
Pico Assistant -> Pico Home -> connector -> target system
```

Useful for:

- shared households
- appliance deployments
- remote access through Pico Relay
- auditability
- consistent policy decisions
- normalised device and state context
- multiple connectors under one local runtime

Pico Home is not required for every tool call, but it is the preferred product path for local systems that need durable, visible and auditable access.

## Capability metadata

Each capability should eventually declare at least:

```text
capability_id
provider_id
subject_scope
input_schema
output_schema
risk_class
read_or_write
requires_user_context
requires_device_context
confirmation_default
audit_requirement
privacy_domain_access
availability
```

The same capability may have different providers.

Example:

```text
Capability: turn on Technikraum light
Provider A: Home Assistant connector
Provider B: MCP Home Assistant server
Provider C: vendor cloud API
```

Policy should evaluate the capability and context, not blindly trust the provider.

## Connector registry

A future connector registry should distinguish:

- connector identity
- connector trust level
- local versus cloud execution
- user or Pico subject that configured it
- secrets location
- available capabilities
- transport requirements
- supported confirmation and audit surfaces

Connectors must not hand raw secrets to the language model.

The model may see a tool name, schema, scoped descriptions and returned results. Server-side secrets remain inside the connector or runtime boundary.

## Home Assistant implication

Home Assistant may be connected through:

- a native Pico Home connector
- an MCP Home Assistant server
- Home Assistant Cloud or another remote integration
- a future Home Assistant add-on ingress path

Regardless of path, Home Assistant actions must obey Pico's risk, policy, confirmation and audit model.

## Relay implication

Pico Relay transports encrypted Pico Link packets. It is not a connector runtime and not an action authority.

Relay delivery may carry a request toward a Pico Home endpoint, but the receiving Pico side must still evaluate policy before execution.

## Non-goals

This ADR does not implement:

- an MCP client
- an MCP server
- a final connector registry
- a final capability schema
- a Home Assistant tool implementation
- a remote relay execution protocol
- a plugin marketplace

It also does not require MCP as the only supported tool interface.

## Implementation implications

Future implementation may add structures such as:

```text
capability
capability_provider
connector
connector_secret_ref
connector_scope
connector_health
capability_risk
capability_policy_binding
action_request
action_result
action_history_entry
```

Pico Home may start with a small number of first-party connectors and later add MCP compatibility where it strengthens interoperability without weakening the policy boundary.

## Relationship to other ADRs

This ADR extends and constrains:

- `0010-tool-policy-and-executor-model.md`
- `0011-privacy-security-and-audit-model.md`
- `0019-home-assistant-threat-model.md`
- `0026-product-terminology-and-naming.md`
- `0028-pico-link-transport-facade-and-relay-network.md`
- `0035-pico-as-digital-companion-and-twin-model.md`

## Consequences

Positive:

- keeps Pico tool use independent of a single protocol
- allows MCP without giving MCP authority over actions
- preserves direct power-user integrations while keeping Pico Home valuable as product runtime
- provides a path to normalised capabilities across different connectors

Negative:

- adds an abstraction layer between tools and actions
- requires careful mapping from external MCP tools into Pico risk and policy metadata
- needs connector health, secret and audit handling before broad tool use

## Design rule

Pico should reason in capabilities, not in raw protocol calls. Connectors and MCP servers provide capabilities. Pico Rules decide whether they may be used. The Action Runner executes only approved requests and Action History records what happened.