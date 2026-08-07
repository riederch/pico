# 0128 - Home Assistant is a Host, Not a Frame, and the Effect-Bearing Module

## Status

Accepted as a placement and framing constraint; the observation that Home
Assistant reads as more central to Pico than it is came from the user on
2026-08-07. H1, H2, H3 and H5 are implemented. H4 is open and binds
the first Home Assistant integration.

## Context

Home Assistant appears in 47 of 127 ADRs. In code it appears in about
twenty lines. That gap is the whole problem, and measuring it is what
makes it fixable.

**In code, Home Assistant is only a host.** There is no Supervisor
client, no entity read, no service call, no automation trigger. Nothing
in this tree talks to Home Assistant. What exists is packaging:

- `addon-entrypoint.ts` and `addon-options.ts` read `/data/options.json`
  and set environment defaults;
- `ha-ingress` is one of three values of `PICO_FOUNDATION_ACCESS_MODE`;
- `frame-ancestors 'self'` instead of `'none'`, because ingress embeds
  the dashboard as a same-origin iframe;
- `pico_core/` and its `addon:check` gate.

`PICO_FOUNDATION_ACCESS_MODE` never reaches `app.ts`. It decides two
things at startup - whether a non-loopback host may boot without a token,
and that the Link intake binding may not be combined with `direct-token`
- and nothing at runtime. The value is a label for what stands in front
of the Foundation surface, and the label is more specific than the code
behind it.

**In the ADRs, Home Assistant is the frame.** Four carry it as the
setting in which Foundation access is explained: 0040 (85 mentions), 0038
(44), 0030 (35), 0041 (31). Twenty-seven more mention it once or twice in
passing. A reader learning how Pico protects its Foundation surface
learns it as a fact about someone else's product.

**Two decisions already say Home Assistant is not special, and neither is
being heard.** ADR 0027: "The current Home Assistant add-on is the first
packaging and runtime path for Pico Home Core. It is not the only
intended host shape." ADR 0036 lists Home Assistant first among many
connector sources - MQTT, local files, databases, cloud APIs, Meshtastic.
Both predate ADR 0127, so neither could say *where* an integration would
live. Now there is an answer, which is why this is decidable today and
was not before.

**Home Assistant has renamed add-ons to apps.** Our vocabulary is one
product generation behind, in the way the ADR 0113 Electron currency
requirement exists to prevent.

## Scope

Covers: where Home Assistant belongs now that modules have a place; what
a future Home Assistant integration is; the module property that a
world-changing module needs and ADR 0127 does not have; and the naming
currency.

The context above describes the code as it stood when this was written.
H5 has since changed it, and the gate says how; the description is left
as the problem statement it was.

Does not cover:

- building the Home Assistant integration, which does not exist and is
  not scheduled here;
- ADR 0036's capability and MCP boundary, which stands and is what an
  integration would be built against;
- ADR 0027's appliance image, which is the second host and is unaffected
  except that it stops being the exception to a Home Assistant rule.

## Decision

### There are two Home Assistants, and only one is a module

**As a host**, Home Assistant is where Pico runs. That is packaging and
deployment: an image, ingress, an options file, a backup exclusion list.
It is not a module, because a module is vocabulary, composition and
surface (ADR 0127), and none of those is a hosting concern.

It is **one host among several**, which ADR 0027 already decided: the
dedicated Pico Home image is the second and local development is the
third. Wherever Foundation access is explained, the subject is *what
stands in front of the Foundation surface* - a loopback boundary, a
token, or a trusted proxy - and Home Assistant is an instance of the
third, never the subject itself.

**As a connected house**, Home Assistant is a source of state and a way
to act on devices. That does not exist in this tree. When it is built it
is a **module**, never core, and it is a **connector**: entity names,
notification bodies and synchronised calendar titles are foreign content,
and they carry an origin label at the threshold under ADR 0116 W2 or they
do not enter.

### A module that changes the world declares it, and that is a property, not a kind

ADR 0127 sorts modules by **where their input comes from**: product,
connector, provider. A Home Assistant integration does not fit, and the
reason is worth stating precisely rather than patching with a fourth
kind.

Turning on a light is not input. It is an **effect**: something outside
Pico's custody changes, and deleting a row afterwards does not undo it.
That is a different axis from where input arrives, and the two are
orthogonal - a product module can be effect-bearing, a connector can be,
a provider can be.

So: **effect-bearing is a declared property of a module, not a fourth
kind.** A module declares the effects it can cause. Forcing this onto the
kind axis would do one of two bad things: split one integration into two
modules, drawing a boundary to satisfy a taxonomy rather than the code,
or hide the effect behind a kind whose name does not mention it.

**A module never decides to act.** It declares what it can cause; the
decision to cause it belongs to the core's action path - ADR 0036's
Action Runner, Pico Rules, and the ADR 0117 origin-aware action rules.
This is the rule ADR 0127 already applies to guards, and it holds for the
same reason: one decision, one place, one failing counter-proof.

**A module that is both connector and effect-bearing is the ADR 0117
danger in a single package.** Foreign content in, world-changing action
out, one import apart. What makes that survivable is not a boundary
between the two halves - it is that **origin crosses with the value**:
something that entered as foreign content may not become an action
argument without its label. Splitting it into two modules would suggest a
separation that does not exist, which is exactly the misreading ADR
0127's stated non-goal warns against.

### Deactivating an effect-bearing module has to stay quick

ADR 0127 M4 makes deactivation loud where unfinished commitments stand,
because switching something off can silently drop a promise. An
effect-bearing module carries the opposite risk, and it deserves saying:
stopping it means the world stops changing, and that may be precisely
what someone wants at that moment. Its deactivation must stay reachable
and immediate, and the M4 statement must not become a confirmation step
that delays it.

### The naming follows Home Assistant's, except in the record

"App" is the current name; "add-on" is what it was called. New and
current-state text says App.

**Text that records a past decision keeps its own words.** An ADR is a
record of what was decided then, and a changelog entry is a record of
what shipped. Rewriting either to match today's vocabulary would make the
record less true rather than more current - and this repository has 34
such entries in `pico_core/CHANGELOG.md` alone.

Identifiers are not prose, and H5 changed the ones that named a host from
inside general code. Two are deliberately kept: `pico_core/` is the
installed App's slug, which a rename would break for every existing
install, and `addon:check` validates that package's manifest. Both name
the Home Assistant packaging artifact, and that is precisely where a host
name belongs.

## Gates

- **H1 - Home Assistant is a host, not the frame (implemented):** ADR
  0030, 0038, 0040 and 0041 each carry, near the top, which host shape
  they were written against and a pointer to this rule, and their
  current-state claims are either true today or marked as the history
  they are. 0038's context listed absent authentication, authorization,
  CSRF and session models as present-tense fact, which ADR 0075/0076
  ended; 0040 described the state *before* its own implementation in the
  present tense. Both are now dated rather than asserted.
- **H2 - Current-state text says App (implemented):** `pico_core/DOCS.md`,
  `pico_core/README.md`, `progress.md`, `implementation-status.md` and
  `.agent-context.md` describe today's product with today's name.
  Accepted-decision text and changelog entries keep their words, and
  Home Assistant's own interface labels are quoted as they read rather
  than translated - a user following a wrong menu path is worse served
  than one reading a slightly older word.
- **H3 - Effect-bearing is declared (implemented):** the module manifest
  carries `effects`, each one `<module-identifier>.<verb>` with a
  description a person could be asked to consent to. The namespace is the
  declaring module's own identifier, which is checkable and stops a module
  claiming another's effects; what the second half says is the module's
  decision, because a closed list of effects would have to be guessed
  before any module needed one.

  **Absent is not empty.** A missing `effects` field means nobody
  considered the question; an empty list says this module changes nothing.
  The parser refuses the first and accepts the second, and the calendar
  ships the second.

  **Effect-bearing is derived from the list, never stored beside it.** A
  boolean and a list are two things that can contradict each other, and
  the contradiction would be found by whoever trusted the wrong one.

  "Causing an effect it did not declare" is checked in the two places
  where causing is observable, because no scanner sees through a port:

  - **statically**, `module:check` refuses every *direct* route out of the
    process - a process spawner, a socket, the filesystem, `fetch`,
    `process.env`. This is refused whether or not an effect was declared:
    a declaration asks the core for a port, it does not permit going
    around one.
  - **at wiring**, `bindPicoModuleEffects` refuses a supplied effect the
    manifest never declared, and a declared effect the runtime did not
    supply. The first is a runtime handing a module more power than it
    asked for, which makes the manifest a false thing to read; the second
    would fail at first use, which is the moment someone is relying on it.
    Extra power is reported before missing power, because only one of them
    can act right now.

  Seventeen probes cover the module boundary, and the seventeenth is the
  one that keeps this honest: **a well-formed declared effect passes.**
  Without it the check would be indistinguishable from "effects are
  forbidden".

  What was accepted in building this early: the shape is drawn from one
  module that declares nothing, so the first module that actually causes
  something may disagree with it. The parts most likely to be wrong are
  the effect-name grammar and the absence of any severity or
  reversibility, both of which are additions rather than rewrites.
- **H4 - The integration is a module (binds the first Home Assistant
  integration):** no Supervisor client, entity read or service call lands
  in `apps/core`. Proven the way ADR 0127 M1 was proven - the
  integration's data is shredded, retained and restored by the core's
  existing paths with no integration-specific handling.
- **H5 - The host adapter (implemented):** `apps/core` names no host
  outside one file. `host-adapter.ts` is the seam - detect, then fill in
  what nobody set - and `host-adapter-home-assistant.ts` is the only place
  in the core that knows what Home Assistant is. Everything downstream
  reads the environment and nothing else.

  **Defaults, never overrides**, checked at the seam: a host that could
  overrule an explicit value would make one deployment behave differently
  depending on where it ran, which is the failure the seam exists to
  prevent rather than a convenience it may trade away. The first detected
  adapter wins and the rest are not consulted, because two hosts at once
  is not a real deployment and merging their answers would produce a
  configuration neither describes.

  `ha-ingress` became `trusted-proxy`, which is what it always was: the
  one mode requiring neither a loopback host nor a token, because
  something in front has already authenticated the person. **The old name
  still resolves**, and a former spelling reaches the same rules rather
  than a parallel set that can drift - removing the alias fails the
  transition test and the error-message test, and nothing else. The boot
  log names the detected host, the mode, and once, that a former name was
  configured.

  The separate container entrypoint is gone rather than renamed. It meant
  the image and a plain `pnpm start` booted from different configuration
  on the same host - the entrypoint applied the options file, the plain
  start did not - so host detection moved into `index.ts`, where the
  logger already exists. One start path, one answer.

## Failure ledger

| Situation | Posture |
|---|---|
| An ADR explains Foundation access as a Home Assistant fact | H1. The subject is what stands in front of the surface; Home Assistant is an instance of one of three. |
| A Home Assistant integration is proposed inside `apps/core` | Refused (H4). It is a module, and a connector. |
| An effect-bearing module wants to decide whether to act | The decision goes to the action path. A module declares what it can cause; the core chooses. |
| A module reaches the world directly instead of asking | Refused at `module:check` (H3), declared effects or not. A declaration asks for a port; it does not permit going around one. |
| A runtime supplies an effect the manifest never declared | Refused at wiring (H3). The manifest is what a person reads to know what a module can do. |
| A connector's foreign content becomes an action argument | Only with its origin label attached (ADR 0117). A module boundary is not a substitute and never was one. |
| An effect-bearing module is switched off with promises standing | The M4 statement is made, but it does not gate the stop. Stopping the world changing is sometimes the point. |
| Someone drops the `ha-ingress` alias | A release decision under ADR 0122, never a cleanup: the value sits in installed environments today (H5). |
| A historical ADR or a changelog entry says "add-on" | Correct, and left alone. It records what was decided and what shipped. |

## Consequences

Positive:

- the reason Pico protects its Foundation surface stops being a fact
  about someone else's product, which is what lets ADR 0027's second host
  shape be described without rewriting the security story;
- the Home Assistant integration has a place before anyone writes it, and
  that place already carries the rules its input needs;
- the gap between "where input comes from" and "what a mistake costs" is
  named before the first module that has both, instead of after.

Negative and accepted:

- two spellings of one access mode for as long as the alias lives, which
  is a small carrying cost paid so that no running install breaks;
- a property no module declares yet is a promise about a future check;
  until H3 is built nothing enforces it, and H3's shape may be wrong
  until a second effect-bearing module exists to disagree with it;
- "effect-bearing" is a judgement with no mechanical answer at its edges
  - a module that writes a file changes the world too - and the wrong
  line is cheap to draw and awkward to move;
- two names for one thing for as long as the transition lasts, which H2's
  split between current text and record makes correct without making it
  simple.
