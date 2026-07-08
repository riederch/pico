# 0037 - Proactive Companion Delegation and Procurement

## Status

Accepted as a vision and safety-boundary concept.

## Context

Pico should eventually do more than answer questions. A useful digital companion/twin may notice relevant state changes, forecast likely needs, prepare a useful action and ask for approval before executing it.

A reference scenario is pellet ordering:

```text
Pico notices that pellets are running low.
Pico estimates remaining time.
Pico knows the user's usual ordering preference.
Pico compares or selects suppliers according to policy.
Pico asks a short confirmation question.
Pico places or sends the order only after approval.
Pico records the action history.
```

This scenario is intentionally high-value and high-risk. It touches local sensing, prediction, user preference, external communication, money, supplier selection and confirmation.

## Decision

Pico may support proactive delegation only under explicit policy and audit boundaries.

Proactive does not mean uncontrolled autonomy.

Pico may:

- observe permitted state
- detect changes
- forecast needs
- use stored preferences
- prepare options
- compare providers where permitted
- ask for approval
- execute approved actions
- record outcomes

Pico must not silently perform high-risk, financial, contractual, destructive or safety-sensitive actions without a matching policy, permission and confirmation path.

## Delegation levels

Pico should distinguish delegation levels:

| Level | Meaning | Example |
|---:|---|---|
| 0 | inform only | Pellets are low. |
| 1 | suggest | You should consider ordering pellets soon. |
| 2 | prepare | I found options and prepared a draft order. |
| 3 | execute after confirmation | Shall I order 4 tons from the preferred supplier? |
| 4 | execute within explicit rules | Order automatically if below 10 percent and price is below the configured limit. |
| 5 | fully autonomous | Reserved for very low-risk domains, if allowed at all. |

Financial, contractual, safety-sensitive and external-write actions should default to level 3 or lower until explicit user-owned rules allow level 4.

## Core design rule

> Pico may notice and prepare. Pico may act only within user-owned delegation rules, policy checks, confirmation requirements and Action History.

## Preference model

Pico should not guess durable preferences from casual conversation alone when those preferences control money, safety or external commitments.

For procurement-like tasks, preferences should become explicit structured state.

Example:

```json
{
  "pellet_ordering": {
    "preferred_supplier": "Muller Fuels",
    "strategy": "trusted_supplier_first",
    "fallback_strategy": "cheapest_if_saving_over_amount",
    "saving_threshold_amount": 50,
    "usual_quantity_tons": 4,
    "max_price_per_ton_without_warning": 340,
    "confirmation_required": true
  }
}
```

The exact schema is not final. The important point is that durable delegation preferences are inspectable, editable and revocable.

## Acting as the user would act

Pico should not define a single universal optimum.

Different users or Pico subjects may prefer:

- trusted supplier first
- cheapest supplier first
- regional supplier first
- fastest delivery first
- quality or certification first
- existing business relationship first
- supplier switch only if the saving crosses a threshold

Pico should make the applied preference visible when it asks for approval.

Example:

```text
The pellets likely last 18 days.
You usually order from Muller Fuels, even if another supplier is slightly cheaper.
Muller is currently 312 EUR/t. The cheapest available supplier is 298 EUR/t.
Should I order the usual 4 tons from Muller, or compare alternatives first?
```

## Action proposal requirements

Before a high-risk or financial action, Pico should present a compact proposal that includes:

- supplier or target
- quantity or scope
- expected price or impact
- delivery or execution window where known
- reason for the proposal
- preference or policy used
- whether this is an inquiry, draft, order, payment or other commitment
- approval options

For example:

```text
I would place this order:

Supplier: Muller Fuels
Quantity: 4 t pellets
Price: about 312 EUR/t
Total: about 1,248 EUR
Reason: pellet store at 17 percent, estimated remaining time 18 days
Policy: trusted supplier first

Approve order?
```

## State and forecast sources

A proactive flow may use:

- local sensors
- Home Assistant entities
- MQTT state
- manual inventory entries
- historical consumption
- weather or seasonality where permitted
- supplier lead times
- prior orders
- user-maintained preferences

Every source should be represented as evidence with freshness and uncertainty where practical.

## Safety and audit boundaries

High-risk proactive actions need:

- authentication
- authorization
- policy decision
- confirmation where required
- argument validation
- scope limits
- amount or quantity limits
- external-write visibility
- Action History entry
- failure handling
- cancellation or correction path where possible

The LLM must not receive raw payment credentials, unrestricted supplier account credentials or unrelated private data.

## Relationship to Pico Rules and Action Runner

The proactive companion flow should be layered:

```text
State source
-> event or context signal
-> forecast / need detection
-> preference and policy lookup
-> action proposal
-> Pico Rules decision
-> Approval Step if required
-> Action Runner
-> Action History
```

The model may help interpret context and formulate proposals. It must not become the policy engine or the executor.

## Non-goals

This ADR does not implement:

- a pellet sensor connector
- supplier search
- payment handling
- order placement
- price comparison
- automated procurement
- a final preference schema
- a final forecasting engine

It also does not approve autonomous financial actions by default.

## Implementation implications

Future implementation may add structures such as:

```text
proactive_signal
forecast_result
preference_profile
delegation_policy
delegation_level
action_proposal
approval_request
approval_record
external_commitment_record
```

Pico should initially support conservative flows:

```text
notice -> prepare -> ask -> execute after approval -> record
```

Only after policy, audit and recovery flows are mature should bounded automatic execution be considered.

## Relationship to other ADRs

This ADR extends and constrains:

- `0008-product-vision-and-persona.md`
- `0010-tool-policy-and-executor-model.md`
- `0011-privacy-security-and-audit-model.md`
- `0019-home-assistant-threat-model.md`
- `0022-shared-commitments-and-cooperative-nudging.md`
- `0023-adaptive-tone-motivation-and-self-binding.md`
- `0035-pico-as-digital-companion-and-twin-model.md`
- `0036-capabilities-connectors-and-mcp-boundary.md`

## Consequences

Positive:

- gives Pico a concrete reference case beyond chat and smart-home control
- connects digital twin state, user preference, forecasting, policy and tool execution
- shows why Pico needs explicit preferences and delegation levels
- prevents proactive behaviour from becoming hidden automation

Negative:

- requires more product and safety design before real execution
- introduces liability and expectation risks for procurement, money and contracts
- needs careful UI language so users understand inquiry, draft, order and payment boundaries

## Design rule

Pico may become proactive, but not opaque. It should notice, explain, prepare, ask and record. Automatic execution requires explicit user-owned delegation rules and must remain bounded by policy, confirmation and audit.