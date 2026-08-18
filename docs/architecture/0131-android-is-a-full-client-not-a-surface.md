# 0131 - Android Is a Full Client, Not a Surface

## Status

Status note, 2026-08-18 (later): **the primitive path is green on real
hardware.** Samsung SM-A556B (Galaxy A55), Android 16, arm64, kernel
6.1.157-android14, via `tools/android-runtime-probe/run-on-device.sh` and a
Termux-provided Node 24 as proxy runtime: sodium (WASM) ready in 37 ms,
keyfile create 1218 ms / open 1011 ms at the vault's own argon2id `moderate`
profile - an unlock on this phone is a one-second pause, not a failure -
0600 keyfile modes held on the device filesystem, the ADR 0097 daemon
listening on a pathname AF_UNIX socket in app-private storage, the founding
bootstrap in 3.0 s, the whole ADR 0099 approval loop with the approved
signature verified against the canonical bytes, and 0.877 ms mean per IPC
round trip - the measured price of the custody split, per signing call, on
the phone itself. What this is not: the embedded runtime. Termux Node
shares the kernel, filesystem, Bionic and V8 family with nodejs-mobile but
is not it, so A1 closes only when the same run and the fixture suites are
green under the embedded runtime in an APK. Getting the stage onto the
device taught three lessons the runner now encodes: a failing command
substitution under `set -eo pipefail` ends a script with no message; a
semicolon in `adb shell`'s unquoted middle layer splits there, running half
a command outside `run-as`; and SELinux refuses hardlink creation under
`run-as`, so pnpm's hardlinked store travels as copies while the symlink
topology - which strict resolution depends on - stays intact.

Status note, 2026-08-18: **the A2 fork is decided - a separate custody
process - and the runtime direction with it.** Decided by the user, on the
evidence this day produced: the closure measurement (62 modules, six Node
built-ins, WASM libsodium, nothing native) leaves an embedded Node runtime
(nodejs-mobile) as the only candidate that hosts the shell-free core without
rebuilding either the API layer or the crypto; that runtime hosts one Node
instance per process and Android hosts processes per app freely, so the
question this gate said A2 turns on - "whether that runtime can be hosted
twice in one app" - is answered yes. The split's price is measured, not
guessed: 0.36 ms per signing IPC round trip on the host baseline, plus a
second instance's base memory, to be re-measured on hardware. What it buys is
unlocked key material in a different address space from the process that
parses model output and supplier content - the desktop boundary's own
argument, on the more exposed device. A1 itself stays open until the fixture
suites are green on a real device; the probe and its runner exist
(`tools/android-runtime-probe/`).


Status note, 2026-08-11: ADR 0136 gained an input for the open question
this ADR frames as "what does a full client on Android have to say out
loud". A library may be declared **essential**, meaning every Pico Vault
holds it - and the first one is about 2 GB, 1.4 GB of working tree beside
612 MB of git objects. A full client that must carry two gigabytes of
somebody's filing cabinet is a different proposition on a phone than on a
desktop, and this ADR's scope covers exactly that: what full client
includes and what it deliberately does not. The text below is unchanged;
the question is now larger than when it was written.

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

Amended again on 2026-08-09 after the two open questions in here were put
to the user directly. iOS is deferred rather than undecided: two findings
about it are settled now and the reopening trigger is named. A6 stays
closed and its trigger is sharpened from "after A3" to three conditions,
because keystore strength was never what the gate was about.

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

### iOS is deferred, and two things about it are already settled

Whether to build an iOS client is deferred, because the three expensive
unknowns - the JavaScript runtime, a reviewed libsodium build, and the
keystore tranche - are answered by A1 and A3 on Android and transfer almost
entirely. Deciding before that evidence exists spends a decision to buy
nothing.

Two findings do not depend on that evidence and are recorded now, so a
later decision starts from them rather than rediscovering them:

**iOS can never carry the ADR 0112 alarm duty.** It offers opportunistic
background refresh with no interval guarantee, and an app a person has
terminated stays terminated. The two mechanisms that would work are both
closed: silent push needs a server in the middle of the most
security-critical moment Pico has, and continuous location authorisation
would mean claiming location for something that is not location - an
argument this project should not want to make. Android v1 does not carry
that duty either (A7), but for Android that is a stage; for iOS it is the
permanent shape.

**iOS forecloses A2.** There is no second process to put custody in - an
app is one process, and extensions are not a daemon. Where Android chooses
between a separate custody process and an in-process seam, iOS is handed
the seam. Custody would live in the process that draws the interface, not
as a trade-off but as a platform fact.

Against both, iOS is the strongest custody hardware in reach: Secure
Enclave and Keychain behind biometrics, with data-protection classes Linux
has no equivalent for. ADR 0081 already says these promises differ per
platform and must be written down rather than averaged. Two further facts
belong in that later decision: automatic cloud backup is a live hazard to
the ADR 0072 rule that keys and data never share a backup artifact, and
distribution runs through review and a paid account rather than through
this project.

The reopening trigger is A1 through A4 measured on real Android hardware.
Until then no iOS support is claimed or implied anywhere, and "mobile"
means Android in every statement this project makes.

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

- **A1 - Runtime and primitive path (open, and measured 2026-08-18):** the
  JavaScript runtime that hosts the shell-free core on Android, and the
  reviewed libsodium build behind it, with the existing fixture suites
  passing on-device.

  **What the core actually asks of a runtime was measured before choosing
  one**, by walking `apps/companion`'s static import graph: 62 modules, and
  six Node built-ins. `node:fs`, `node:path` and `node:os` for the
  device-local files - profile, first-run journal, recovery state, relay
  operators, mailbox, platform unlock. `node:net` for the *client* end of
  the daemon socket, which is A2's question in one import. `node:crypto`
  in one module, `node:buffer` in one, and `node:child_process` in exactly
  one - `notify.ts`, the desktop notification command, which is a platform
  adapter anywhere else.

  Outside the standard library it reaches `libsodium-wrappers-sumo` and
  `@scure/bip39`, both portable, and `pdf-lib` with `qrcode` only through
  the Recovery Card generator. **No native module is in that closure** - in
  particular no `better-sqlite3`: a client holds files and a socket, not a
  database.

  The walk also found the closure carrying the vault CLI, the daemon
  *server* and `reader-access` - which needs `node:worker_threads`, the
  built-in least likely to exist on a mobile runtime - because two modules
  imported the `@pico/vault-daemon` barrel to open a socket. Narrowed, and
  `check-companion-boundary.mjs` now walks the shell-free core the way it
  already walked the tray, so the next wide import is a named error rather
  than weight discovered on a phone.

  **The probe exists and its host baseline is green**
  (`tools/android-runtime-probe/`). It runs the real modules - keyfile
  create/open at the vault's own argon2id `moderate` profile, the daemon on
  a pathname AF_UNIX socket, the founding bootstrap, the whole ADR 0099
  approval binding with the signature verified against the canonical bytes,
  and 200 IPC round trips - and reports timings as JSON lines. Host
  baseline (x86_64, Node 22): sodium ready 12 ms, keyfile create 833 ms /
  open 582 ms, founding bootstrap 1.75 s, daemon unlock 585 ms, IPC round
  trip 0.36 ms mean. The probe also taught the roles the hard way: the
  connection that made the unlock is the *hold* connection and approvals
  route to it - a watcher on any other connection is refused as
  `approval_wait_forbidden`.

  **The on-device half is blocked on this host, and the block is measured:**
  the Android emulator cannot boot here at all. Emulator 36.3.10 and
  37.2.5 both SIGSEGV in their host renderer/scene path on Fedora 44 /
  kernel 7.1.8, in every GPU mode (`swiftshader_indirect`, `off`,
  default), with coredumps on record - `RenderThread` in one, the mesh3d
  scene init in the other. `run-on-device.sh` therefore targets whatever
  `adb` sees, and a real phone over USB is the better evidence anyway: an
  x86_64 guest's argon2id timing says nothing about a phone.
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
- **A6 - Identity root founding on Android (closed; three conditions to
  reopen):** A3 measured, an ADR 0027 appliance image in existence, and a
  Recovery Card reachable without a printer. The trigger was sharpened on
  2026-08-09, because "after A3" answers the wrong question: A3 measures
  how strong the keystore is, and strength was never the objection.
  ADR 0081 V5 biases the root toward *low exposure* - it signs rarely, has
  no online duty - and a phone is unlocked dozens of times a day and, if
  A2 lands on the seam, draws its own interface. The second condition is
  the honest one: while the Home is an app or a container, every Pico
  owner already has a general-purpose computer to found on, so the
  phone-only person this gate exists for does not yet exist; the appliance
  image is what creates them. The third is the sharpest: ADR 0112 wants
  the Card printed and laminated and warns against the file export, so a
  root on a phone whose owner has no printer is one loss from identity
  loss - and that is exactly the person A6 would be opened for.
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
- ADR 0097's root-minimisation sequencing survives as long as A6 stays
  closed, and two of A6's three reopening conditions are things this
  project must build anyway - so the gate will come due rather than
  lapse;
- iOS remains unplanned, so "mobile" means Android in every claim this
  project makes until A1-A4 have been measured;
- a person whose only personal computer is a phone cannot found a Pico at
  all, and will not be able to until A6 reopens. That is a stated
  consequence of ADR 0081 V5, not an oversight.

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
