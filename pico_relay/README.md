# Pico Relay

A Pico Relay is a queue with a door on it. It holds sealed packets for
mailboxes until the Pico they belong to collects them, and it is the reason a
Pico Home never needs a port open to the internet.

This add-on is the Home Assistant path to running one. The same image runs as
a plain container, and for most households that is still the better shape -
see [When this add-on is the wrong shape](#when-this-add-on-is-the-wrong-shape).

For the full technical documentation see [`../ReadmeTech.md`](../ReadmeTech.md).
For installation and operation see [`DOCS.md`](DOCS.md).

## What a relay is, in one paragraph

It forwards packets it cannot read, for accounts it knows nothing about beyond
a quota. It never learns a Pico: no identity, no membership, no delegation, no
signature is parsed anywhere in it, and no code path could be taught to. That
absence is measured rather than promised - `pnpm relay:check` fails if the
relay ever imports the core, the vault, an identity or a companion.

## What it holds and what it cannot

| It holds | It cannot |
|---|---|
| sealed packets, until collected or expired | read them |
| mailbox registrations against an account | say whose Pico a mailbox belongs to |
| account credentials and quotas | issue an identity, a membership or a permission |
| a rate-limit budget per account and per mailbox | decide anything about a person |

> Pico Relay provides transport, not authority.

## When this add-on is the wrong shape

**A relay run beside the Home it serves is a relay that shares its outages.**
An add-on's lifecycle belongs to the Supervisor, so this relay is down while
Home Assistant restarts, updates or reboots - and if it is the relay your
household's remote reachability depends on, that outage is the household's.

It is also the shape that puts a forwarded port back on the family's router,
which is the thing Pico Link exists to avoid.

So this add-on fits:

- a Home Assistant box that is **not** the household's Pico Home - a small
  server, a second machine, a VPS
- a relay between two Homes over a LAN or a VPN, with nothing forwarded
- an operator who runs a relay for other people and wants the Supervisor's
  update path for it

and it does not fit a household that forwards a router port into the same box
its Home lives in. The standalone container is the shape for a relay that has
to outlive one household's restart.

The reasoning behind both halves is in
[`../docs/architecture/0155-a-relay-may-run-under-a-supervisor-and-only-its-own-port-is-forwarded.md`](../docs/architecture/0155-a-relay-may-run-under-a-supervisor-and-only-its-own-port-is-forwarded.md).

## Ports, and the one that may be forwarded

| Port | What it is | From the internet |
|---|---|---|
| `3200/tcp` | the mailbox port: five POST routes, and nothing that says so | **this one, and only this one** |
| `3202/tcp` | operator administration, from the Pico Client | LAN or VPN, never a router |
| `3201/tcp` | the health signal, on loopback inside the container | never, and it cannot be |

Pico Home's own port `3100` is not on this list and never joins it. A Home is
reached *through* a relay; that is the entire arrangement.

## Current status

Foundation phase.

Current version:

```text
0.2.1
```

**Not production-ready.** No relay has run outside a test and a CI smoke
container. Accounts, quotas, expiry and the operator surface are implemented
and measured; an operator's real deployment is not yet evidence anybody has.

## Design principles

- transport, not authority
- a relay never learns a Pico
- the public port carries no map of itself
- administration is a separate port, closed by default
- reviewed cryptographic primitives; no invented cryptography
- an operator is untrustworthy by design, and the boundary is checked rather
  than intended

## Documentation map

- [`DOCS.md`](DOCS.md) - installation, configuration and the port table
- [`CHANGELOG.md`](CHANGELOG.md) - what changed, add-on facing
- [`../README.md`](../README.md) - non-technical project overview
- [`../ReadmeTech.md`](../ReadmeTech.md) - full technical documentation
- [`../docs/architecture`](../docs/architecture) - architecture decisions
- [`../docs/release/versioning.md`](../docs/release/versioning.md) - release and versioning checklist
