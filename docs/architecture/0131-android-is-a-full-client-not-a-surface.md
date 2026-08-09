# 0131 - Android Is a Full Client, Not a Surface

## Status

Accepted role decision; not implemented. The user decided on 2026-08-09
that Android must become a full client of the same standing as the desktop,
and that the Pico Surface role belongs to smartwatches, small home displays
and similar devices rather than to a phone. This reverses the sequencing
ADR 0097 recorded, which had mobile arriving "later as a delegated device
(device keys under Pico Link ceremonies), never as the first home of the
identity root". iOS is not decided here.

Amended the same day with gate A7: the first Android client ships as a
home-network client, because Pico Link Direct reaches only the person's own
Home directly and no relay exists. That limit is a product statement, not a
temporary gap to be quietly outgrown.

## Context

ADR 0097 reasoned about mobile three times, and all three arguments were
about sequencing under uncertainty rather than about mobile being unfit:

1. no consumer stack existed on mobile;
2. no cross-app local IPC and no daemon backgrounding, so a mobile-first
   Vault would have demanded the network API that ADR refused;
3. the wire contract did not exist yet, so an in-app library seam would
   have become the first process contract - "exactly the wrong first
   process contract this ADR is meant to prevent".

Two of the three have since been discharged by work that was done for other
reasons. The daemon request families, the approval binding, the ceremony
signer and the canonical bytes are implemented, tested and vector-bound on
the desktop, so a second implementation is no longer the thing that defines
the contract - it is a thing that must conform to it. And ADR 0113 built
the consumer stack as a **shell-free** TypeScript core in `apps/companion`,
with a mechanically enforced boundary that keeps Electron out of it. That
boundary was justified as a swappable-shell hedge; a second shell on a
second platform is exactly the case it was bought for.

What has not changed is that Android is not a small desktop. It has no tray
and no ambient long-lived process by default; its background execution is
governed by the OS and by the manufacturer, and several of the guarantees
ADR 0112 relies on - a check at least every six hours, an alarm loud enough
to be noticed, a veto reachable inside a 48-hour window - are things the
platform grants conditionally rather than things a process simply does.

The honest framing is therefore not "can Android be a full client" but
"what does a full client on Android have to say out loud that a desktop
client does not". This ADR answers the second question.

## Scope

Covers: Android's node role; what "full client" includes and what it
deliberately does not; the process and authority shape to be decided; the
runtime and cryptographic primitive path; the reachability contract that
replaces the tray; and where the Surface role still applies.

Does not cover: iOS; Android UI or avatar design; relay transport; the
desktop platform work (ADR 0130); or any change to the keyfile format,
canonical bytes, approval binding or ceremony semantics - all of which
Android conforms to rather than negotiates with.

## Decision

### Android is a full client

An Android device runs its own Vault, holds its own device key, is its own
approval consumer, and performs the ceremonies its authority allows. It
produces the same records, over the same canonical bytes, through the same
request families as the desktop. It is not a presentation surface for a
Vault that lives somewhere else.

Conformance is not a matter of care: the Android client is held to the
published fixture suites the same way any other implementation is. A record
it produces that the desktop implementation rejects is an Android bug, not
a dialect.

### It is a full client without founding the identity root - for now

ADR 0081's root minimization exists because a phone is the most-lost and
most-stolen device a person owns. That argument is about *where a root key
is born*, not about how capable a client is, and the two are separable: a
client can run every ceremony, hold its own delegated device key and decide
its own approvals while the identity root's first home is a desktop or an
appliance.

The first Android client is therefore built as a full client whose device
key is delegated, and founding an identity root on Android is a separate,
later gate that opens only after the Android keystore tranche is proven on
real hardware. This is a sequencing rule, not a capability ceiling; the
decision to lift it stays with the user.

### The trust path is hosted, not rewritten

The shell-free core runs on Android in a JavaScript runtime, and libsodium
arrives as a reviewed build of the same library - a WebAssembly build or a
native binding to the same C sources - never as a re-implementation.
Argon2id parameters, the `pico.vault.keyfile.v1` format, the AAD layouts
and the signature inputs are unchanged; Android is a new host for proven
code, not a new dialect of it.

A Kotlin re-implementation of custody, canonicalization or ceremony logic
is refused for the same reason ADR 0113 refused a Rust rewrite for a window
shell: re-implementing proven security-critical code is where new bugs
enter, and ADR 0016's no-new-cryptography rule applies one layer up.

### The process and authority boundary is a gate, not an assumption

On the desktop, authority comes from a separate daemon process, a
mode-0600 pathname socket and same-UID peer authentication. Android offers
two candidate shapes and the choice is genuinely open:

- a **separate app process** holding custody, reached over an AF_UNIX
  socket inside app-private storage. This preserves the ADR 0097 contract
  literally. The isolation argument differs from the desktop's: every
  process of an app shares one UID, so the boundary that keeps other apps
  out is the app sandbox and the private data directory, not the socket
  mode - which is stronger against other apps and weaker within the app.
- an **in-process library seam** speaking the same request families. This
  is the shape ADR 0097 warned about. It is materially less dangerous now
  that the contract is fixed and vector-bound elsewhere, but it puts key
  custody in the same process as the UI, which is the property the desktop
  boundary exists to deny.

Whichever wins, the ADR 0099 approval binding survives unchanged: the
holder of the unlock decides what the key signs, and no approval may be
answered by anything other than the person on the device that holds it.
This gate is decided together with the runtime choice, because it depends
on whether that runtime can be hosted twice in one app.

### The foreground service replaces the tray, and its guarantees are written down

Android can host a long-running foreground service with a persistent
notification. That is the honest analogue of the tray, and it is why
Android can carry the ADR 0112 cadence at all. What it grants, it grants
conditionally, so the contract names each condition rather than assuming
it:

- the service declares its foreground type and holds the runtime
  permission current Android versions require for it;
- the six-hourly authenticated lifecycle read is a periodic background job
  whose interval is a **floor the OS may stretch**, not a promise, plus the
  immediate re-check on resume and on network regain that the desktop
  carrier already performs;
- the loud alarm needs a high-importance notification channel, and the
  full-screen presentation that makes it unmissable is a restricted
  permission. Where it is not granted, the alarm degrades to a
  high-importance notification and **the degradation is shown to the
  person**, not silently absorbed;
- exemption from battery optimisation is requested, and its absence is a
  named degraded state, because manufacturer task killers will otherwise
  break the veto window without any error anywhere.

No claim about meeting the 48-hour veto window on Android may be made until
it is measured on real hardware with battery optimisation active. Until
then, the reachable veto guarantee is anchored on the desktop or appliance
client, and Android is an additional channel rather than the one the
guarantee rests on.

### The first Android client is a home-network client, and says so

ADR 0107 carries envelopes to the person's **own Home, directly**, and
explicitly excludes the relay, discovery and streaming. For a desktop that
costs nothing: it sits in the house. For a phone it is the defining
constraint, because a phone's whole point is leaving. Away from the home
network there is no Home to reach - no authenticated lifecycle read, no
alarm delivery, no ceremony.

The first Android client therefore ships with that limit spoken rather than
discovered. It states when it cannot reach its Home instead of presenting
an unreachable Home as a quiet one - the same rule ADR 0118 already applies
to a failed read, where "nothing is waiting" and "nobody looked" are
different claims. No product surface, document or release note may describe
the Android client as working away from home.

The relay stays a separate undertaking. Putting it in front of the first
client would trade the whole path to a working product for a packet layer
carrying its own operational, privacy and cost questions - and the ADR 0112
alarm already has its anchor on a desktop or appliance client, which is
exactly why that anchor was placed there.

### The Surface role stays, for watches and small displays

A Pico Surface is still a real node role, and it is what a smartwatch, a
small home display or a similar constrained device is. Those devices hold
minimal cache and session state and require a Vault behind them. What
changes here is only that a phone is not one of them.

### iOS is not decided here

This ADR plans Android. iOS grants none of the conditional guarantees above
- no long-running background process a person cannot end, and no
notification path that survives an app the OS has terminated - so it cannot
inherit this decision by analogy. Whether iOS arrives as a full client
under a different reachability contract, as a Surface, or not at all is an
open user decision, and no iOS support is claimed or implied by anything in
here.

## Rejected alternatives

### Android as a delegated Surface only

ADR 0097's original sequencing, and the recommendation this decision
overruled. It is cheaper and it makes the ADR 0112 guarantees easy, because
they stay on a desktop. It was rejected by the user: a phone is where a
person actually is, and a companion that needs a desktop nearby to do
anything is not the product.

### A native Kotlin client

Removes the JavaScript runtime question and gives the best platform
integration, at the price of re-implementing custody, canonicalization and
ceremony logic outside the vector-bound reference. That is the trade ADR
0016 and ADR 0113 both refuse.

### Reusing the Electron shell

Electron does not run on Android. This is not a preference; it is why the
shell-free core boundary is the asset that makes this decision affordable.

### Push-delivered alarms through a relay

Would solve mobile reachability properly and is the eventual answer, but no
relay exists, and a push dependency today means a server in the middle of a
local-first product's most security-critical moment.

## Gates

- **A1 - Runtime and primitive path (open):** the JavaScript runtime that
  hosts the shell-free core on Android, and the reviewed libsodium build
  behind it, with the existing fixture suites passing on-device.
- **A2 - Process and authority boundary (open):** separate custody process
  over an app-private AF_UNIX socket, or an in-process seam over the same
  request families; decided with A1, with the ADR 0099 approval binding
  preserved either way.
- **A3 - Android keystore tranche (open, ADR 0081 P3):** device-key and
  passphrase protection through the platform keystore and biometric
  prompt, with the canonical keyfile format unchanged and hardware-backed
  storage verified rather than assumed.
- **A4 - Reachability contract measured (open):** foreground service,
  periodic check interval, alarm loudness with and without the restricted
  full-screen permission, and behaviour under battery optimisation and at
  least one manufacturer task-killer, measured on real hardware before any
  ADR 0112 claim is made for Android.
- **A5 - Ceremony parity (open):** the ADR 0130 verticals, in the same
  order, on Android.
- **A6 - Identity root founding on Android (open, separate decision):**
  opens only after A3, and only by an explicit user decision.
- **A7 - The home-network limit is spoken (open):** the client names an
  unreachable Home rather than presenting it as a quiet one, and no product
  surface or document claims away-from-home function. Decided 2026-08-09
  together with the sequencing in
  `docs/development/roadmap-to-first-client.md`.

## Consequences

Positive:

- the platform where a person actually is becomes a first-class client
  instead of a window onto a desktop;
- ADR 0113's shell-free boundary earns its cost a second time, on the case
  it was bought for;
- the guarantees Android cannot make are written down before a product
  claims them, so the ADR 0112 alarm keeps an anchor that actually holds;
- the Surface role gets a clear population - watches and small displays -
  instead of being the drawer everything non-desktop was swept into.

Negative and residual:

- this is a second shell, a second packaging pipeline, a second keystore
  tranche and a second reachability contract; nothing about it is free;
- A2 may end with custody in the same process as the UI, which is weaker
  than the desktop boundary, and no amount of contract conformance fixes
  that - it would be a stated property of the Android client;
- the mobile veto guarantee stays conditional until A4 measures it, and it
  may turn out to be conditional permanently on some manufacturers;
- ADR 0097's root-minimisation sequencing survives only as long as A6 stays
  closed, and A6 is a user decision rather than a technical barrier;
- iOS remains unplanned, so "mobile" means Android in every claim this
  project makes until that changes.

## Relationship to other ADRs

- Reverses the mobile sequencing in ADR `0097` and records why two of its
  three reasons have been discharged; its daemon contract, request families
  and custody rules are conformed to, not changed.
- Depends on ADR `0113`'s shell-free core boundary and inherits nothing
  else from it; Electron does not travel.
- Keeps ADR `0099` and `0106` unchanged, including on a platform where the
  approval holder is a phone.
- Extends ADR `0081` P3 with an Android tranche and keeps its root
  minimisation intact behind gate A6.
- Constrains ADR `0112`: its cadence, loudness and veto-window claims hold
  for Android only after A4, and the desktop anchor carries them until
  then.
- Sibling of ADR `0130`, which decides the desktop side; A5 follows its
  vertical order deliberately.
- Applies ADR `0015`'s node roles: a phone is a Vault, a watch or small
  display is a Surface.

## References

- [ADR 0015](0015-full-clients-light-clients-and-relay.md)
- [ADR 0016](0016-cryptography-boundaries-and-non-goals.md)
- [ADR 0081](0081-pico-vault-person-role-key-custody-threat-model-and-direction.md)
- [ADR 0097](0097-deployable-vault-process-and-local-ipc-authority-boundary.md)
- [ADR 0099](0099-hold-channel-approval-for-authority-creating-signatures.md)
- [ADR 0105](0105-pico-runs-as-a-background-companion-not-a-cli.md)
- [ADR 0112](0112-recovery-product-surfaces-in-the-background-companion.md)
- [ADR 0113](0113-electron-shell-over-a-shell-free-companion-service-core.md)
- [ADR 0130](0130-desktop-operation-through-the-companion-and-tray-reachability.md)
