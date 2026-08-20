# Changelog

## 0.2.1

**The first release of Pico Relay as a Home Assistant add-on.**

The relay itself is not new - it has shipped as a standalone container since
0.2.0 and its runtime is unchanged. What is new is that Home Assistant can
install it:

```text
ghcr.io/riederch/pico/relay:0.2.1
```

The same image, under a Supervisor. Two things had to exist for that to work at
all, and both are in this release:

- **The relay reads an add-on's options.** Home Assistant hands an installed
  add-on a JSON file and no environment, so a relay that only read
  `PICO_RELAY_*` variables would have installed, started and been
  unconfigurable. It now reads `/data/options.json` when there is one and keeps
  behaving exactly like a container when there is not.
- **A refusal that names the field you can actually fill in.** A relay with no
  operator hostname refuses to start, which is correct and was previously
  explained in terms of an environment variable no Supervisor lets anybody set.

**ADR 0153 said a relay is deliberately not an add-on, and this reverses that
for the packaging while keeping the objection.** A relay under a Supervisor is
down while that Supervisor restarts. The add-on is the right shape for a Home
Assistant box that is not the household's Home, and the wrong one for a family
whose remote reachability depends on it - `DOCS.md` says which is which rather
than leaving it to be discovered.

**One port may be forwarded from a router, and it is `3200`.** Administration
(`3202`) stays on loopback until two separate acts open it, the health listener
(`3201`) is not published at all, and Pico Home's `3100` never belongs on the
internet under any arrangement.

Known gaps, stated rather than found later: no icon ships yet, there is no
watchdog and cannot honestly be one, and no relay has run in the open.
