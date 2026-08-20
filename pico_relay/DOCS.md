# Pico Relay add-on documentation

## Current status

Foundation phase, and not production-ready. The relay is implemented, bounded
and tested; what it has not had is an operator running one in the open for
real traffic. Treat a relay you run today as an experiment you own.

The add-on installs the same image the standalone container uses:

```text
ghcr.io/riederch/pico/relay
```

## Installation

1. Add this repository to Home Assistant: **Settings → Add-ons → Add-on Store
   → ⋮ → Repositories**, then `https://github.com/riederch/pico`.
2. Install **Pico Relay**.
3. Open **Configuration** and set `operator` before starting it. See below -
   the relay refuses to start without it, on purpose.
4. Start the add-on and open the **Log** tab. A relay nobody has claimed prints
   a single-use claim code there.

## Before you start it: the operator hostname

`operator` is the hostname senders resolve to reach this relay. It has no
default and there is no value that could stand in for one: an address issued by
a relay carries this name, so a guessed one hands out addresses pointing at
somebody else's machine, and every packet sent to them is refused by a
stranger's server.

The add-on therefore installs unconfigured and refuses to start until you fill
it in. That is the design, not a defect - the log says so in as many words:

```text
Open this add-on's Configuration tab and set `operator` to the hostname
senders will resolve to reach this relay, then start it again.
```

Use the name that will actually resolve to this machine from outside -
`relay.example.org`, not `homeassistant.local` and not an IP address.

## Options

| Option | Default | Purpose |
|---|---|---|
| `operator` | none - the relay refuses to start | The hostname senders resolve to reach this relay. |
| `operator_api_on_lan` | `false` | Moves the operator administration listener off loopback so the Pico Client can reach it. Publishing port `3202` is a second, separate act. |

Both are deployment parameters rather than settings: two people in the same
Home cannot answer either of them differently (ADR 0104). Nothing a person
decides about their own Pico is configured here.

## Ports

| Port | Published by default | Binds to | What it is |
|---|---|---|---|
| `3200/tcp` | yes | all interfaces | The mailbox port. Five POST routes, and an unknown route answers exactly like a wrong method, so the surface carries no map of itself. |
| `3202/tcp` | no | loopback, unless `operator_api_on_lan` | Operator administration: claiming the relay, creating and revoking accounts. |
| `3201/tcp` | no, and not listed | loopback | The health signal, for a process supervisor inside the container. |

Opening administration takes **two** deliberate acts: switch on
`operator_api_on_lan`, and publish `3202` in the add-on's **Network** panel.
Neither alone makes it reachable, and installing does neither.

## Port forwarding: one port, and it is this add-on's

If you want this relay reachable from outside your network, forward **exactly
one** port on your router:

```text
TCP 3200  ->  <the machine running this add-on>:3200
```

Nothing else. Specifically not:

| Do not forward | Why |
|---|---|
| `3202` - relay administration | It creates and revokes accounts. It belongs on a LAN or behind a VPN, and is best switched off again once the relay is claimed. |
| `3201` - relay health | It binds to loopback; a forward would reach nothing, and the point of the separate listener is that the public port stays five routes. |
| `3100` - **Pico Home** | A Home is never a public endpoint. It is reached *through* a relay, which is the entire reason relays exist. Forwarding it puts the foundation API, the dashboard and the WebSocket surface on the internet. |
| Home Assistant itself | Not this project's business, and the same answer. |

**Before you forward anything, read the shape question.** A relay in the same
household as the Home it serves, with 3200 forwarded, is a public port on the
family's router again - the arrangement Pico Link exists to remove. It is a
reasonable thing to run on a box that is not the household's Home; it is not
the recommended product path for a family's own Home, and this document will
not pretend otherwise. `README.md` has the long version.

A relay reachable only inside a LAN or a VPN needs no forward at all, and two
Homes on the same network can use one that way today.

## Claiming the relay and creating accounts

A relay ships with no accounts and refuses every registration as
`unknown_account` until one exists. Provisioning runs from the Pico Client
over the operator port:

1. Switch on `operator_api_on_lan`, publish `3202`, restart the add-on.
2. Read the claim code from the **Log** tab. It is single-use, held in memory
   only, and replaced on every restart, so a leaked log line is a window one
   restart wide rather than a standing key.
3. Enter it in the Pico Client. The client trades it for the operator
   credential, which is shown once.
4. Create an account, and hand its credential to the Home that will use it.

If the operator credential is lost, create a file named `operator-reset` beside
the database in the add-on's data directory and restart. The relay forgets its
operator and mints a new claim code; the accounts stay, because losing the
administration credential is not a reason to cut off every customer.

## Persistent data

```text
/data/relay.sqlite
```

Sealed packets in transit, mailbox registrations, accounts and quotas. Mount
persistence is the Supervisor's; a relay that lost this file forgets what it
was holding and every account it had.

**Home Assistant backups include it, and that has a consequence worth knowing:**
restoring an old backup restores packets that were already collected, and they
will be offered again until they expire. The queue is not the valuable part of
a relay backup - the accounts are.

## Health and the watchdog

This add-on declares no watchdog. The Supervisor's watchdog needs a route it
can call, and a relay deliberately has none it may offer:

- the public port answers an unknown route exactly like a wrong method, so a
  `/health` there would be the single request that answered differently - a map
  with one entry, and the entry says "a Pico relay lives here";
- the health listener that does answer binds to loopback.

A watchdog pointed at either would either undo that property or restart a
healthy relay in a loop. Use the **Log** tab: a running relay logs
`relay_listening`, and every refusal it makes is a line.

## Update behavior

Updates arrive through the normal Home Assistant add-on update flow. The
add-on version and the image tag move together:

```text
ghcr.io/riederch/pico/relay:0.2.1
```

All three Pico deliverables carry one version and ship from one Git tag, so a
Pico Relay update may contain nothing but a Pico Client fix. That cost is
recorded rather than discovered (ADR 0153 PK4).

## Current limitations

- No relay has run in the open. Every property here is held up by tests, a CI
  smoke container and a boundary check, not by traffic.
- The add-on is down while its Supervisor restarts. That is inherent, and it
  is why a relay serving the household it lives in is the wrong arrangement.
- No icon or logo ships with this add-on yet: character assets are governed
  (`docs/design-system`) and one has not been approved for it, so Home
  Assistant shows a placeholder.
- No watchdog, for the reason above.
- Restoring a backup can resurrect already-collected packets until they expire.
- Provisioning needs the operator port open on a LAN while it happens; there
  is no path that avoids that step yet.
