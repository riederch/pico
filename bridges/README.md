# bridges/

The Pico Depot this tree ships. A depot is an attached repository that provides
one or more suppliers - a Pico Bridge or a Pico Library under ADR 0136 - and
this one is a depot like any other, pinned to the release rather than
privileged by living here (ADR 0143 DP6).

It holds **one** supplier, and that is not a change of policy. ADR 0143's
starting point stands: as few mandatory bridges as possible, and none that a
person has to attach. `git-library` exists because ADR 0136 BR2's process
boundary could not be proved without something to run inside it - it is the
cheapest supplier that can be proved end to end today, since a bridge would
need a credential and a paid account and a library needs neither.

It reports what it is and does not hand over what it holds. Reading a library
is lawful only through ADR 0117 X4's quarantined read job, which needs a model
delegation runtime that does not exist, so there is no `offer` handler and no
content crosses a slot.

## What a supplier is, as a file

A module that exports one function and touches no socket:

```js
export default async function handle(request) { return { ... }; }
```

Pico starts the process, Pico owns the loop (`supplier-runner.mjs`), and the
depot contributes the answers. That is why nothing here imports anything of
Pico's: the contract is the **wire form** - length-prefixed UTF-8 JSON with a
versioned family label - and a third party reproduces it from the
specification rather than by linking against a package. `git-library` imports
`node:fs` and `node:path`, and nothing else.

## Why this is not `modules/`

`modules/` ships with the product and is checked by `pnpm module:check`, which
asserts that a module reaches nothing it should not - no socket, no process, no
`fetch`. A bridge does all three, because reaching one outside system is its
job. Putting bridges under `modules/` would force that check either to be
weakened until it stopped holding for modules, or to fail for every bridge
forever.

So supplier code is checked by `pnpm supplier:check` instead, which states the
opposite where the two differ: **outward reach is permitted**, and three things
are not.

| Refused | Why |
|---|---|
| Core internals, including the `@pico/protocol` barrel | A supplier speaks the ADR 0136 BR1 slot contract and nothing else. The barrel re-exports the whole surface, so allowing it would make every other rule decorative. |
| A second runtime - `node:child_process`, `node:worker_threads`, `node:vm`, `eval` | ADR 0143 DP3: a bridge runs in the runtime Pico brings, and the manifest has no field for another. These are how one would be taken anyway. |
| Another supplier's files | ADR 0143 DP5: suppliers compose by declaration inside one depot, not by reaching into each other by path. |

## Not a workspace member

`bridges/` is deliberately absent from `pnpm-workspace.yaml`, and
`supplier:check` fails if it is added. Two reasons, and both are load-bearing:

- **ADR 0136 BR2** - supplier code runs outside the core process and is reached
  over a private socket with named request families
  (`@pico/protocol/supplier-transport`). A workspace member would be linkable,
  and an import is the one route that turns a process boundary into a comment.
- **ADR 0143 DP2** - what runs is vendored. A workspace member is installed by
  the package manager, which is the thing vendoring exists to avoid.

## Layout

One directory per supplier. Everything else about a depot - its manifest, the
entry point it names, the commit it is pinned to, how a person attaches one -
is ADR 0143 DP1 and DP3, and none of it is built yet.
