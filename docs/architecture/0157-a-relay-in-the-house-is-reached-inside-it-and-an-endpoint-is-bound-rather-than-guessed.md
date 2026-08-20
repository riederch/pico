# 0157 - A relay in the house is reached inside it, and an endpoint is bound rather than guessed

## Status

**Draft sketch, 2026-08-20. Nothing here is accepted and nothing is built.**
LR1-LR6 are proposed gate shapes rather than decided ones. No status matrix
row, no `.agent-context.md` entry, no ADR 0128 status note on anything it
touches - ADR 0146 set that precedent and ADR 0156 follows it.

Written from a user request during the same conversation that produced ADR
0156: that a relay should optionally be reachable over its **local URL**. The
request looks like a convenience and is not one. It lands on a value that
cannot express it, and the same value is wrong in the other direction as well.

## Context

**An address deliberately does not say how to get there.** ADR 0147 fixed the
address as `mailbox@operator` and `link-packet.ts:44-49` says why the operator
half is a bare hostname:

> deliberately nothing richer: no scheme, no port, no path. Those are
> reachability details a deployment owns, and putting them in an address a
> person hands over would make the address stop working when the operator moves
> a port.

**So the endpoint lives beside the address, and already does.**
`link-relay-transport.ts:22` names it in the same spirit: "Where the operator
answers. A deployment property, not an address." A Home is configured with
`PICO_LINK_RELAY_BASE_URL`, and nothing in the tree constrains it to a public
name. Pointing it at `http://192.168.1.50:3200` works today.

**What does not work is saying which operator that endpoint speaks for.**
`PicoLinkRelayClient.holds()` infers it from the string:

```ts
public holds(address: string): boolean {
  const operator = parsePicoLinkPacketAddress(address).operator;
  return this.baseUrl.includes(operator);   // index.ts:167
}
```

Measured against an operator named `relay.example.org`:

| Base URL | `holds()` | should be |
|---|---|---|
| `https://relay.example.org` | true | true |
| `http://192.168.1.50:3200` | **false** | true |
| `http://homeassistant.local:3200` | **false** | true |
| `https://relay.example.org.attacker.example` | **true** | false |
| `https://attacker.example/?x=relay.example.org` | **true** | false |

Too strict and too loose at the same time, which is what a substring test of a
structured value always is. The local URL is refused because it does not
contain the name; a hostile host is accepted because it does.

**Nothing rides on it yet.** The only callers are two assertions in
`packages/link-relay-client/src/index.test.ts:175-176`. That is the whole
reason this is a sketch rather than an incident: the value is a placeholder
that has not been wired, and it is cheap to settle before something depends on
it and expensive afterwards.

**And there is an availability argument underneath.** A Home and its relay can
sit on the same machine - ADR 0155 makes that the ordinary case, since both are
now add-ons in one store. If the only path between them is a public hostname,
then two processes one directory apart talk to each other by leaving the house,
crossing a tunnel provider, and coming back. That fails whenever the line
fails, which is precisely the class of failure ADR 0118 exists to reason about,
and it fails for the pair that had no reason to be affected.

## The sketch

**A Home is told which operator its endpoint speaks for, and may hold more than
one way to reach it.**

Three parts:

1. The relay client is configured with its operator name rather than sniffing
   it out of a URL. `holds()` becomes a comparison between a configured name
   and the name in an address - the question it was always asking.
2. An operator may have more than one endpoint in a Home's configuration: a
   local one and a public one, in a stated order. Reaching the relay in the
   house does not go outside it.
3. Neither of those touches an address. An address issued under
   `relay.example.org` keeps working when the Home starts reaching it over
   `http://192.168.1.50:3200`, because the address never named the path.

## Gates, proposed

- **LR1 - The operator is configured, never inferred.** The client holds its
  operator name beside its endpoint, and `holds()` compares that name with the
  address it was given. A substring test of a URL is refused as a check because
  it answers a different question than the one asked.

- **LR2 - More than one endpoint for one operator, in a stated order.** A Home
  may know a local URL and a public URL for the same relay. Which is tried
  first is configuration, not discovery, and the order is written down rather
  than derived from which one looks more local.

- **LR3 - A relay in the house is reachable when the line is down.** If the
  Home and the relay are on one machine or one LAN, a broken internet
  connection must not break the pair. This is ADR 0118's contract applied to a
  path that only recently became ordinary.

- **LR4 - Changing an endpoint never invalidates an address.** ADR 0147 kept
  scheme, port and path out of the address for exactly this. Moving between the
  local and the public endpoint is a deployment change, and no mailbox anybody
  was handed may stop working because of one.

- **LR5 - A local endpoint is not a weaker endpoint.** A LAN path typically has
  no TLS, and the account credential is a bearer secret that today travels on
  every account-bearing request (ADR 0149 RS2). Reaching the relay locally
  would therefore expose it to the LAN, where the public path exposed it only
  to a terminating proxy. Either the local path carries TLS too, or the
  credential stops being a transmitted secret - which is ADR 0156. **The two
  sketches meet here, and this gate is the reason 0156 is worth more than it
  first appears: the deployment this one enables is the one that most needs
  it.**

- **LR6 - No discovery, in either direction.** The endpoint is never guessed
  from the operator name - no `https://<operator>` default, no mDNS, no probing
  the subnet. A guessed endpoint means DNS or the local network decides where a
  Home sends its packets, which is authority that was never delegated to
  either.

## Rejected alternatives

### Derive `https://<operator>` when no endpoint is configured

The obvious convenience, and it reintroduces exactly what ADR 0147 kept out of
the address. It also makes an address stop working when an operator moves a
port - the failure the address format was shaped to avoid - and it does so
silently, because the derived endpoint is plausible.

### Keep `includes()` and document the sharp edge

Cheap, and wrong in the direction that matters. Too strict is an inconvenience;
too loose is a security property. `https://relay.example.org.attacker.example`
passing this test is not an edge case, it is the shape of the attack it should
have refused.

### Let the relay advertise its own endpoints

A relay could return the URLs it believes it is reachable at. ADR 0149's
posture forbids the shape: the public surface answers an unknown route the way
it answers a wrong method, so it carries no map of itself. A relay describing
its own reachability is a map of itself, and ADR 0154 already removed a
`describe` route for a smaller version of that reason.

### mDNS or zeroconf for the local case

Solves the local URL without configuration, and hands the decision of where
packets go to whoever answers on the segment. LR6 is the refusal.

## What should change whatever is decided

`holds()` is a placeholder with no production caller and a check that is wrong
in both directions. Whether or not this sketch is accepted, that method should
not be wired as it stands. If the local-URL case is rejected, the honest form
of the rejection is still a correct comparison - the too-loose half has nothing
to do with local reachability.

## Questions this sketch does not decide

- What "in a stated order" means operationally: try and fall back, probe once
  at start-up, or hold both and choose per request.
- Whether a failed local endpoint should fall back to the public one silently,
  loudly, or not at all - a silent fallback is a working system that quietly
  left the house.
- Whether the local endpoint is a property of the Home's configuration or of
  the relationship with that operator, which matters as soon as a Home uses two
  relays.
- Whether any of this is worth building before a Home and a relay actually run
  on one machine.

## Relationship to other ADRs

- **ADR 0147** kept scheme, port and path out of an address; LR4 is that
  property defended and LR6 is its corollary.
- **ADR 0149** decided the relay surface and its refusal to describe itself;
  the rejected self-advertisement alternative is that applied.
- **ADR 0104** puts deployment parameters outside Pico, which is why an
  endpoint is configuration and an address is not.
- **ADR 0118** is the degradation contract LR3 draws on.
- **ADR 0155** made a Home and a relay on one machine the ordinary case, which
  is what turns this from a nicety into a gap.
- **ADR 0156** is where LR5 lands: a local path without TLS is the deployment
  that most needs a credential which is never transmitted.

## References

- ADR 0104 - what is decided in Pico and what is decided outside it
- ADR 0118 - offline and model-free degradation contract
- ADR 0146 - the precedent for a draft that decides nothing
- ADR 0147 - a mailbox is a relationship, and a relay is told where, not why
- ADR 0149 - the relay surface, its accounts and its absences
- ADR 0154 - claiming a relay and administering its accounts
- ADR 0155 - a relay may run under a Supervisor
- ADR 0156 - a relay account should be a key it proves
