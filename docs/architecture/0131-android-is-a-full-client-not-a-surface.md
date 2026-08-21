# 0131 - Android Is a Full Client, Not a Surface

## Status

Status note, 2026-08-19 (later): **the probe ran under nodejs-mobile
itself, in the decided two-process shape, and A1 is implemented.** A
hand-assembled APK (`tools/android-runtime-probe/apk/` - build-tools and NDK
clang, no gradle, because the whole app is two foreground services and a
30-line JNI shim over `node::Start`) hosts one embedded Node v18.20.4 per
process: the `:custody` service runs the real vault daemon, the client
service walks the custody path across the app-private AF_UNIX socket.
On the Galaxy A55: founding bootstrap 3,336 ms, unlock 993 ms, **the ADR
0099 approval loop across real process boundaries with the signature
verified against the canonical bytes**, IPC 1.639 ms mean per call - against
0.877 ms same-process under Termux Node and 0.36 ms on the desktop. The
sticky-service restarts that followed re-ran the client against the founded
vault and were refused with `founding_bootstrap_requires_fresh_vault`, which
is the daemon being right, twice.

Hosting the embedded runtime taught four things the product client will
inherit:

- **Node 18 has webcrypto but not the global.** The reviewed libsodium's
  ESM build refuses to load without `globalThis.crypto.getRandomValues`
  (automatic from Node 19), so the embedder preloads a two-line shim
  (`preload.cjs`). The dual-build packaging made this look nondeterministic
  first: a `require.resolve` path got the CJS build and worked while the
  ESM import path died.
- **One Node instance per process** is nodejs-mobile's own constraint, so
  the A2 split maps to Android processes (`android:process=":custody"`),
  exactly as decided - and it works.
- **Foreground services are the only shape a locked Samsung leaves
  running.** An activity - even `showWhenLocked` with the screen forced on
  - was culled by the launcher within seconds, twice. The product client
  was always going to be a foreground service (this ADR's own tray
  analogue); the probe now proves that shape and nothing else survives.
- **The embedded runtime has no `process.execPath` to spawn**, so
  vitest-style forked suites cannot run under it. That bounds the test
  harness, not the product: the client closure's one `child_process` use is
  the desktop notification adapter. The fixture-suite evidence therefore
  stands on Termux Node (same kernel, Bionic, V8 family), and the embedded
  evidence is this probe.

Status note, 2026-08-19: **the existing fixture suites are green on the
phone - A1's own words, run.** Galaxy A55, Android 16, arm64, Termux Node 24
as proxy runtime, `tools/android-runtime-probe/run-suites-on-device.sh`:
protocol 588, identity 34, vault 19 (55 s wall - the argon2id-heavy suite),
sync 26, companion 170, vault-daemon 100 - **937 tests, all passing on the
device**. Two suites deliberately stay host-side and are named rather than
skipped: `claim-ceremony.test.ts` boots @pico/core and the
`link-relay-client` suite boots the real relay - both servers backed by
better-sqlite3, which never runs on a phone (its x86_64 binary failing to
dlopen on arm64 is how the boundary announced itself).

The run found three portability defects in the fixtures themselves, which
is what on-device runs are for. Thirteen test files hardcoded `/tmp`, which
Android does not have - every one now derives from `tmpdir()`. The notify
test built its fake tool with a `#!/usr/bin/env node` shebang, which
resolves against a filesystem Android does not have - it now writes the
running Node's own absolute path. And two vault-daemon suites carried the
*conclusion* of `index.test.ts`'s sun_path length guard - a hardcoded
`/tmp` - with the reasoning deleted; they carry the guard itself now. The
staging recipe that made the run possible without device-side network is
pnpm's own `supportedArchitectures` (both OSes, both CPUs in one
node_modules), a worktree so the repository stays untouched, and the same
tar rules the probe learned the hard way.

What still separates this from closing A1: the same runs under nodejs-mobile
in an APK, since Termux Node shares the kernel, Bionic and V8 family but is
not the embedded runtime.

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

- **A1 - Runtime and primitive path (implemented 2026-08-19):** the
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
- **A2 - Process and authority boundary (decided 2026-08-18, and the shape
  measured on the device 2026-08-19):** separate custody process
  over an app-private AF_UNIX socket, or an in-process seam over the same
  request families; decided with A1, with the ADR 0099 approval binding
  preserved either way.
- **A3 - Android keystore tranche (analysis done on measured evidence
  2026-08-19, implementation open, ADR 0081 P3):** device-key and
  passphrase protection through the platform keystore and biometric
  prompt, with the canonical keyfile format unchanged and hardware-backed
  storage verified rather than assumed.

  Measured on a Galaxy A55 (Android 16, patch 2026-07-05) with
  `tools/android-runtime-probe/apk/run-keystore-probe.sh`:

  - **Hardware-backed, and verified twice over.** `KeyInfo.getSecurityLevel()`
    reports `TRUSTED_ENVIRONMENT`, and independently a five-certificate
    attestation chain whose signatures link, certificate by certificate, to
    `C=US, O=Google LLC, OU=Android, CN=Key Attestation CA1`. The root is
    **not pinned** by the probe and the attestation extension is not parsed:
    shipping Google's root and reading verified-boot state, patch level and
    the challenge out of the extension is the implementation's work, and
    naming that distance is the point of measuring rather than assuming.
  - **StrongBox is not universal, and its absence is honest.** A current
    mid-range phone on a six-week-old patch declares no StrongBox and
    *throws* `StrongBoxUnavailableException` rather than quietly handing back
    a weaker key. So the tranche's floor is the TEE and StrongBox is a bonus
    where it exists - requiring it would refuse real phones - and the
    refusal is what makes that floor safe to stand on.
  - **The keystore fails closed.** A key with
    `setUserAuthenticationRequired(true)` and `AUTH_BIOMETRIC_STRONG` refused
    to initialise a cipher with `UserNotAuthenticatedException`. ADR 0112's
    fail-closed Platform Keystore unlock owner is therefore implementable on
    Android as specified, rather than as a prompt that decorates an unlock
    that would have happened anyway.
  - **An unlock secret round-trips** through a TEE-held key (32 bytes, 48
    sealed, identical on the way back) and the alias survives process death,
    which is the whole job ADR 0081 gives a platform keystore: hold the
    *unlock secret*, never the keys as their canonical form.

  Two things follow for the implementation. The Android analogue of refusing
  Electron's `basic_text` is a closed list of **security levels**, not
  backend names: `trusted_environment` and `strongbox` count, `software` is
  refused - and it has to be judged from `getSecurityLevel()` *plus*
  attestation, because every other call in this probe succeeds identically
  on a keystore that is software all the way down. And that judgement cannot
  live where the Linux one lives: the shell-free core never sees a
  `KeyInfo`, so on Android the platform code judges and what crosses into the
  core is a verdict with its evidence, not a backend name to be judged there.
  **The two named gaps are closed, and closing them changed the answer**
  (2026-08-21, same Galaxy A55, Android 16, patch 2026-07-05). The probe pins
  the root and parses the extension now, which is what the paragraph above said
  an implementation would have to do.

  **There is not one Google attestation root. There are two, and pinning
  either alone refuses real phones.** The RSA root
  (`SERIALNUMBER=f92009e853b6b045`, valid to 2042) signed every chain until
  Google's EC root - `CN=Key Attestation CA1`, P-384, valid 2025-07-17 to
  2035-07-15 - **began signing on 2026-02-01**. This phone, six weeks off a
  patch, already chains to the EC one. A pin written from the older
  documentation would have refused it, and a pin written from this device alone
  would refuse every phone that has not moved. Both are shipped.

  The pin was not taken from the device it verifies, which would be circular.
  The device's root was extracted, Google's published list fetched
  independently from `https://android.googleapis.com/attestation/root`, and the
  two compared: **byte-identical**, SHA-256
  `6d9db4ce6c5c0b293166d08986e05774a8776ceb525d9e4329520de12ba4bcc0`. That
  comparison also proves the transcription exact, since one wrong character
  moves the digest. A refreshed pin comes from that endpoint, never from a
  phone.

  **What the extension actually says on this device**, read out of bytes signed
  by a key the phone does not hold: attestation version 300, attestation
  security level `trusted_environment`, KeyMint 300 at `trusted_environment`,
  verified boot state `verified`, device locked, a 32-byte verified-boot key,
  OS patch level `202607` and boot patch level `20260705`. The challenge comes
  back exactly as it went in.

  So the two independent sources **agree**: `KeyInfo.getSecurityLevel()` says
  `TRUSTED_ENVIRONMENT` and the signed extension says `trusted_environment`.
  That agreement is the whole point of reading both - on a keystore that is
  software all the way down the first would say the same thing and the second
  could not.

  **Both checks were falsified rather than trusted.** One byte turned in the
  pinned root makes the verdict `none`; a changed expected challenge makes
  `challengeMatches` false *while the pin still matches*, so the two are
  independent rather than one check wearing two names.

  Two things stay open, and they are the product half. No Android surface
  ships this yet - it lives in the probe, which is a lab artifact. And the
  verdict that crosses into the shell-free core is not written: what belongs
  there is a level plus its evidence, and the ADR 0134 question of what happens
  when the pin list changes under a client that is already installed has no
  answer yet. A pin is a list, and lists that ship become things that expire.

- **A4 - Reachability contract measured (measured 2026-08-19, all four
  questions answered):** foreground service, periodic check interval, alarm
  loudness with and without the restricted full-screen permission, and
  behaviour under battery optimisation and at least one manufacturer
  task-killer, measured on real hardware before any ADR 0112 claim is made
  for Android.

  Measured on a Galaxy A55 (Android 16, patch 2026-07-05) with
  `tools/android-runtime-probe/apk/run-reachability-probe.sh`. ADR 0112's
  claim is a cadence claim - six hours against a 48-hour window "gives a
  running device at least seven independent chances to see the alarm" - so
  every number below is about whether that sentence survives Android.

  **The interval is a window, and the window is not kept.** JobScheduler
  accepted the documented 15-minute floor and assigned it with a *flex of
  15 minutes*: the platform models a period as a range, not a point. Then,
  in forced deep doze with the screen off, the period fell due and nothing
  ran for twenty minutes; the job fired 20 min 17 s after the previous beat,
  seconds after doze was lifted and while the screen was still off. So the
  deferral is not jitter around the period - the work waits for the device
  to stir.

  **There is no wall-clock anchor to fall back on.**
  `AlarmManager.canScheduleExactAlarms()` is **false** for this app by
  default: exact alarms are withheld from anything that is not a clock or
  calendar. A six-hour cadence can be *requested* on Android; it cannot be
  *promised*.

  **A task manager deletes the cadence, it does not pause it.** After
  `am force-stop` - the harshest thing a manufacturer's task manager does,
  and the case every Samsung owner can reach - the process stayed gone, no
  heartbeat followed in four minutes, and
  `cmd jobscheduler get-job-state` answered *"Could not find job 164"*: the
  `setPersisted(true)` periodic job was **removed**, not suspended. Nothing
  brings it back until the person opens the app. A recovery alarm's cadence
  can therefore be ended silently by one tap, and the client cannot learn
  this by asking - it can only notice that too long has passed since its
  last successful check, which is A7's rule one layer down.

  **The alarm degrades exactly as this ADR predicted, and the degradation
  is detectable.** With the app-op denied, `canUseFullScreenIntent()`
  returns false while the channel keeps `IMPORTANCE_HIGH`, its alarm sound
  and its vibration: what is lost is the full-screen takeover, not the
  loudness. Because the app can read that state, "the degradation is shown
  to the person" is implementable rather than aspirational. One correction
  to this ADR's assumption: on this device the restricted permission is
  **granted by default** to a freshly installed app that merely declares
  it, so the degraded path had to be entered deliberately to be seen at
  all. What is denied by default here is exact alarms, not full-screen
  intents.

  **Battery optimisation is on by default** (`isIgnoringBatteryOptimizations`
  false) and background restriction is off. `notificationsEnabled` reads
  true only because the probe granted it over adb; a real client has to ask
  the person and handle a refusal.

  **What this does to the ADR 0112 claim: it confirms the sequencing this
  ADR already chose.** Seven chances in 48 hours holds for a phone that is
  *used* - every unlock ends doze - and fails for a phone left untouched on
  a table, and ends outright if anything force-stops the app. That is why
  the reachable-veto guarantee stays anchored on the desktop or appliance
  client with Android as an additional channel, and the measurement is now
  the reason rather than the caution.

  **The long run, read 2026-08-19 after 5 hours 26 minutes:** 23 heartbeats
  against a requested 15-minute period, mean gap 14.8 minutes, worst 22.5 -
  so the period is honoured on average and stretched by up to half when it
  is not. Nine of twenty-two gaps ran past sixteen minutes, in both screen
  states. **Not one of the twenty-three ran while `isDeviceIdleMode()` was
  true**, which is the forced-doze result again without the forcing: the
  work does not slip inside doze, it waits for the device to stir.

  That is an upper bound on Android's generosity rather than a typical week.
  The app stayed in the `ACTIVE` standby bucket the whole time, because it
  was attached to a laptop and being watched; a phone in a pocket for two
  days drops through `WORKING_SET` to `RARE` and dozes far deeper. So the
  honest reading of ADR 0112's seven chances in 48 hours is: comfortable for
  a phone in use, unmeasured for a phone left alone - and the unmeasured
  case is exactly the one the desktop anchor exists for.

  **The manufacturer's own switch, measured 2026-08-19 after the user set
  it: it does not throttle the cadence, it ends it.** Samsung's per-app
  "Restricted" is not a hint - it sets the `RUN_ANY_IN_BACKGROUND` app-op to
  `ignore` and moves the app from standby bucket 10 (`ACTIVE`) straight to
  45 (`RESTRICTED`). Within about thirty minutes Samsung's own freezer had
  logged 304 attempts against the app, and `ActivityManager` killed the
  foreground-service process: `Killing ... :reach (adj 905): empty`. That
  adjacency and that reason say the foreground service was no longer
  counted as running by then, which is Android's documented treatment of a
  background-restricted app: its foreground services stop when it leaves
  the foreground. Sixty minutes after the switch: no service, no process,
  and **not one heartbeat** where the same job had been averaging one every
  14.8 minutes.

  The part that matters for ADR 0112 is what stays behind. Unlike
  `force-stop`, which deletes the periodic job, the job here remains
  registered and reports `waiting` - so nothing looks broken from the
  outside while nothing at all is running. A person who tapped one switch
  their phone actively recommends ("this app is using battery") has ended
  the recovery alarm's cadence, and neither the phone nor the app has any
  way to tell them that a scheduled check simply stopped happening.

  With this, A4's four questions are all measured: the foreground service,
  the interval, the alarm with and without the restricted permission, and
  battery optimisation with two task-killers - Android's own force-stop and
  the manufacturer's switch. No ADR 0112 claim for Android survives them
  intact, which is the answer this gate existed to get.
- **A5 - Ceremony parity (open, and measured 2026-08-19):** the ADR 0130
  verticals, in the same order, on Android.

  **What parity actually costs was measured before any of it was built**, by
  asking of each vertical how much lives in the shell-free core - which
  Android inherits, and which A1 already ran on the device - and how much
  lives in the desktop shell, which it would have to rebuild.

  E2 founding (`founding.ts`), E3 device lifecycle (`enrolment.ts`,
  `device-lifecycle.ts`) and E4 home continuity (`home-authority.ts`) are
  about 1,500 lines of core, and A1's on-device run already exercised them:
  founding bootstrap, the approval loop and the ADR 0112 carrier ran under
  the embedded runtime, and 937 fixture tests passed on the phone. E1's
  reachability half is A4's territory and is measured there. So the ceremony
  *logic* is not the cost.

  What Android must genuinely build is platform work and rightly so: camera
  and typed capture of the three codes, the presentations, the secure input,
  and the A3 keystore binding. The desktop's own `readDeviceCode` splitting
  camera from typed is exactly the shape a second client re-implements
  differently and correctly.

  **A second thing was in the wrong place, found by asking what else the
  shell decides that Android would decide again** (2026-08-20). How a key
  fingerprint is shown to a person had three answers inside one client: the
  shell-free core shortened it head-and-tail, the Electron main process
  carried a byte-identical private copy of that rule, and the renderer
  contract took a bare twelve-character prefix. So one host-key rotation
  reached one person twice under two names - `a1b2c3d4…7f8e9d0c` in the
  notification, `a1b2c3d4e5f6` in the window - and Android would have been
  the fourth spelling.

  ADR 0079 I5 leaves this open on purpose: display encoding "is UX and
  decided with the surfaces that show them". This surface had never decided.
  It has now, in `@pico/companion/fingerprint`, head and tail rather than a
  prefix - because the attack ADR 0079's own threat table names is grinding a
  key whose truncated fingerprint matches a target's *display prefix*, and
  twelve hex characters is forty-eight bits to match where eight from each
  end is sixty-four and costs a person nothing to read.

  **The window was the hard half, and it took the fix the boundary already
  wanted.** Renderer-reachable files resolve relative paths only - the window
  loads plain ESM under `script-src 'self'` - so a bare `@pico/companion/...`
  specifier there compiles, passes every test, and breaks the window at
  runtime. That was written down as a residual for a few hours, with two
  sites keeping their own slice; it reads badly as a permanent answer,
  because a window that shortens a fingerprint is a window deciding a
  rendering, which is the one thing ADR 0113 C2 says it does not do.

  So the member rows now cross with the rendered string beside the hex, and
  the hex stays because ending a membership names its subject - a name, not
  something to read. The parser refuses a row that arrives without the
  rendered form rather than filling one in: a default would put the decision
  back in the window, quietly. `check-companion-boundary.mjs` now covers the
  renderer too and tells it something different from the rest - it cannot
  reach the rule, so it must not invent a second one.

  **And one line was making a promise about a second screen.** After adding a
  device, the sponsor's window said the new device "is known by <twelve hex
  characters>, which is what that device showed you". That device shows no
  fingerprint at any step of the walk. A person who looks for it and fails
  has learned that the check is unreliable, which is worse than not being
  offered one; the line now says what is true, and making it checkable would
  mean the joining screen showing the same string - which would widen the
  three verbs a platform owes into three-plus-a-value, and is not worth that
  on this evidence.

  **Asking the same question of time found the same shape, one field over**
  (2026-08-20). Nothing had decided how this client says *when*, and three
  answers had grown: the ADR 0112 recovery alarm printed the instant raw
  ("becomes that identity's only device at 2027-01-01T23:30:00.000Z"), the
  window cut ten characters off the same kind of string in six places, and
  Android's Java formatter would have answered a third way.

  The cut is the one worth naming, because it looks right. Ten characters of
  an ISO instant is the *UTC* calendar day with nothing saying so. For an
  instant at 23:30Z a reader in Vienna is already on the next day and the row
  says the previous one; on Kiritimati the same row is a day and a half out.
  A ceremony is held whenever it is held, so the band that lands wrong is the
  reader's own offset - two hours in twenty-four for Vienna.

  One rule now, in `@pico/companion/when`, ICU-free for the reason A1
  measured: `Intl` is absent from the embedded runtime, so
  `toLocaleDateString` was never a fallback this could take. `getFullYear`
  and its siblings are ECMA-262 core and read the host's timezone, which is
  why the phone can run the desktop's rule rather than the nearest thing it
  can build. The Home's own web UI already formats with
  `Intl.DateTimeFormat(undefined, …)` - the reader's locale and zone - so
  local is the house answer, and the companion was the surface disagreeing
  with it.

  **And the arithmetic behind the date was wrong in the same direction.** The
  expiry warning counted twenty-four hour blocks: at 23:00 in Vienna, an
  authority ending at 00:30 the next night is an hour and a half away, so the
  row printed "That is today" directly under "It can act as you until
  2027-01-02". A person who believes the second sentence renews a day late,
  and a device whose authority has run out cannot renew itself - it is a
  Recovery Card away.

  Days a person counts are midnights, and one of Vienna's is twenty-three
  hours long every March. `picoCompanionCalendarDaysUntil` counts midnights,
  the number crosses with the row, and the window no longer holds a day
  length at all - which the boundary check now says out loud, because the
  rendering side has been wrong about calendars twice.

  With the rows now crossing rendered, the seam has a name:
  `apps/companion-shell/src/rendered-rows.ts`. It exists as a module rather
  than four expressions inside the IPC handlers because the real-process
  tests read the same core views, and a test that re-implements the mapping
  it is checking measures its own copy. `check-companion-boundary.mjs` holds
  both rules, and it tells the window something different from the rest,
  because the window cannot reach either of them.

  **Then the sweep moved from what the shell *shows* to what it *checks*, and
  found more** (2026-08-20). Every prompt in `main.ts` carries a `validate`
  and a length, and each of those is a rule a second client re-decides.

  Three were rules with an owner elsewhere. What a Home's address is had four
  disagreeing answers and is now one, recorded in ADR 0130's E2 note. What a
  Pico may be admitted by was the ceremony's own expression, copied into the
  field beside a cap of 128 - twice a fingerprint - so field and ceremony
  agreed by coincidence; `isPicoCompanionMembershipSubject` is exported now
  and both ask it. And how long a code may be was 8,192 in the field against
  a parser that stops at 5,488: three thousand characters in which a person
  keeps typing and the refusal, when it comes, can only say the code is
  malformed.

  One was already right and is worth naming as such: the announcement line's
  check is `startsWith('{')` and deliberately no more, because a stricter
  version once made `founding.ts`'s own refusals unreachable - the parser had
  the exact words ready and the field was answering with a character count. A
  loose check in front of a parser that speaks is not the same defect as a
  loose check in front of one that does not.

  **One thing was in the wrong place, and it was the dangerous kind.** The
  pairing of each exchange step with the prefix a read must accept lived as
  six string literals in `apps/companion-shell/src/main.ts`, and the
  protocol's three constants sat unused beside them. That pairing is not
  presentation: two devices have to agree on it, and disagreeing does not
  fail loudly - a client that reads an acceptance while validating the offer
  prefix refuses a code that is correct, in front of two people who both did
  what they were asked, and the refusal reads as the other device's fault.
  A second client would have inherited a seventh copy by reading a desktop
  file. It now lives in `@pico/companion/enrolment-steps` with a test that
  binds every read to the protocol's own constant, and the shell reads it
  from there.

  **The sequence followed the pairing, the same day.** Both halves of the
  walk are core-owned now. `picoCompanionSponsorExchange` states the
  sponsor's two beats - show the grant, read the acceptance while it stays
  shown - and `runPicoCompanionAskingDeviceExchange` states the asking
  device's seven, walked identically by a device that has nothing and by one
  whose year ran out; what differs is `offer` and `accept` and the sentence
  at the end, which is why those are arguments and the walk is not.

  The ordering rule that walk exists to hold: **the acceptance is shown
  before `confirm` is awaited.** The other device cannot finish without
  reading it, so a client that waited first would leave two devices waiting
  for each other, each convinced it is the one being kept waiting, with no
  error raised anywhere. Planting that inversion fails the test, as does
  clearing the grant before the acceptance is read.

  What the desktop shell keeps is exactly what a platform owes the ceremony:
  three verbs - put a code in front of a person, take one back, say where in
  the walk they are - over its own canvas, camera and typed input. An Android
  client supplies its own three and inherits the order rather than reading it
  out of a desktop file.

  **The copy has a gate now, so the next client cannot inherit one.**
  `scripts/check-wire-labels.mjs` fails when any of the protocol's 72
  exported wire labels - signature-input labels, schema names, the prefixes
  people read off each other's screens - is spelled out anywhere else in
  product code. Two exemptions carry arguments rather than permissions: a
  migration must *not* follow a renamed constant, because the rows it
  describes keep the old word, and ADR 0099's approval-exempt list must fail
  closed, since importing the constants would carry an exemption onto a
  renamed label while a literal turns a rename into "ask the person". Tests
  may spell labels out: pinning exact bytes is what a fixture is for.

  **It was also blind to most of what it claimed to guard, for three months**
  (found 2026-08-21 by planting a label it should have caught). It read only
  `export const NAME = '...'`, and the protocol keeps most of its families in
  object literals - `picoHomeSignatureInputLabels`, the device-recovery
  canonical labels, the appearance capabilities, the supplier transport.
  Seventy-two labels were guarded and forty-seven were not, among them the
  family a person's approval statement is keyed by. The summary said "72
  protocol labels spelled once", which was true and read as though it were all
  of them. Measured before widening - no product file spells any of the
  forty-seven - so the fix cost nothing and the count now reads 129.

  The gate says what it cannot do, because a check trusted for more than it
  does is worse than none. It catches a copy, not an invention:
  `pico-recovery-card-v2:` matched no constant at all. A rule against unknown
  labels was measured before being written - 46 in product code, nearly all
  of them a package naming its own schema, which is exactly right - so
  inventions stay the business of tests that build a real value and require
  the surface to accept it.

  **The first surface exists** (`tools/android-runtime-probe/apk/`,
  `JoinActivity` + `join.mjs`): this phone asking a Home to let it in, in the
  decided two-process shape - custody in `:custody`, the shell-free core and
  the surface in the main process. Built by hand for the same reason the
  probes were: this machine has no Gradle and no AndroidX, and a Compose
  build would start with a wrapper, hundreds of megabytes and a daemon beside
  the work already running. **Typed path only, no camera** - which is why the
  desktop's typed path had to be repaired first (ADR 0112, the same day).

  The shell side is short, and that is the measurement rather than the
  aesthetic: `join.mjs` owns three verbs and no ceremony, because
  `runPicoCompanionAskingDeviceExchange` owns the walk. The three verbs
  travel over an **app-private AF_UNIX socket, not a localhost port** - on
  Android every app can reach 127.0.0.1, and this conversation carries a
  ceremony. The approval is a real question with the daemon's own ADR 0106
  statement on screen and a tap for an answer; answering it in code would
  have kept the ceremony working and removed the only thing it is for.

  One difference from the desktop is named rather than left to be discovered:
  ADR 0113 C2 keeps secrets out of the renderer because a renderer is a
  second, less trusted context. Here the Activity *is* the app, so the
  passphrase is typed into the same process. That is not the desktop's rule
  relaxed - it is the rule with nothing to separate.

  **It ran** (2026-08-19, Galaxy A55). The sponsor is
  `tools/android-runtime-probe/lab/`: a headless Home founded on the laptop
  with the Foundation API on loopback and only the Link intake published,
  plus the device that founded it acting as the granting device. On the
  phone: both processes came up, the core announced its socket, the surface
  asked for a passphrase in the words the contract gives it, and **this
  phone made its own device keys through its own custody daemon and showed
  an offer code** - a real ADR 0130 E3 step, on Android, through the same
  core the desktop runs. The phone left the USB bus before the grant could
  be carried back, so the second half of the walk is still unwitnessed;
  `finish-join.sh` resumes it without founding a second Home.

  **The last step did not complete, and why is the finding: a grant cannot
  be typed.** Both halves work - the phone makes its keys and shows a
  213-character offer, the sponsor grants against exactly that offer and
  produces a grant carrying the bridged address - but the grant is **1,127
  characters**, because it holds the activation signature input, the Home's
  host keys, its identity and the endpoint. Nobody types that. Driving it by
  machine failed four times over, and each failure is a fact about the path
  rather than about the automation: a system dialog took the foreground, the
  field lost focus and the remainder went to the dialer, the screen locked
  mid-code, and a caret placed by a tap interleaved the chunks into
  something the right length and the wrong order - which the ceremony
  refused as `invalid_pico_device_enrolment_grant_body`, correctly.

  On top of that the grant carries a **four-minute activation window**, so
  any hand-carried path slow enough to need care is too slow to finish.

  So the camera is not an optional convenience on Android; for the grant it
  is the path, and the typed field is a fallback for a *scanner* rather than
  for fingers. That is a product conclusion, and it arrived from a lab
  rather than from an opinion - which is what the lab was for. The offer,
  at 213 characters, is the one code a person could carry by hand.

  **The camera was then built, without Gradle** (`ScanActivity`): platform
  Camera2 for the frames and ZXing's `core` for the decoding - a pure-Java
  jar with no resources, which is the one shape of dependency a
  hand-assembled APK can take, dexed beside the app's own classes. The
  permission is asked at the moment it is needed and for the reason it is
  needed. The step's expected prefix travels to the surface, so the scanner
  refuses a code from an earlier step rather than handing it on. And the
  camera never meets the ceremony: what it produces is a string, carried to
  the walk over the same bridge a typed one uses - the split ADR 0113 draws
  on the desktop, where the scanner is shell code and the core is told only
  what was read. The sponsor lab shows the grant as a QR image for it, the
  way the desktop window does.

  **And then the camera found the thing the fixture suites could not.**

  With the scan working, every grant was still refused as
  `invalid_pico_device_enrolment_grant_body` - the same 1,127 characters the
  desktop accepts. The transport was innocent: the decoder read 1,127
  characters and the walk received 1,127 with an identical checksum, and the
  built `device-enrolment.js` on the phone had the same md5 as the one on
  the laptop. Same code, same bytes, opposite answers.

  A stack trace from inside the embedded runtime named the line: the `catch`
  around `new TextDecoder('utf-8', { fatal: true })`. A self-test in that
  runtime named the cause: **nodejs-mobile v18.20.4 is built without ICU**,
  `Intl` is absent, and constructing a `TextDecoder` with *any* option
  throws `ERR_NO_ICU`. Plain `new TextDecoder()` works.

  So the canonical decoder - the one that reads enrolment codes *and*
  Recovery Cards - could not read a single text element on the runtime this
  ADR chose. Every code was refused as malformed, which is the worst kind of
  wrong answer: it accuses the code.

  Fixed in `@pico/protocol` as `decodeCanonicalText`, which keeps the
  strictness by the means this transport already uses everywhere else -
  decode, re-encode, require the bytes back. A broken sequence becomes
  U+FFFD, whose encoding differs from what came in; text that legitimately
  contains U+FFFD survives, because its bytes are the ones that were read.
  Both parsers use it now. Planting the round-trip away, and planting
  `fatal: true` back, each fail the new tests.

  **Then the two parsers were asked what actually holds the line, and they
  answered differently** (2026-08-20). The helper had tests; neither *path*
  did, and the paths are what a code travels. Written now, one each, and
  falsified by taking the round-trip away.

  The card path answered `noncanonical_recovery_card_payload`: it re-encodes
  the whole payload and compares, so a replacement character is caught there
  regardless. Its UTF-8 refusal is about *naming* the fault, not about being
  the only one who sees it - and a wrong name costs the next reader an hour.

  The grant path did not answer at all. It has no such second riegel: with
  the strictness gone, a grant whose Home address carries one broken byte is
  **accepted**, and the device is pointed at `http://192\uFFFD168.1.20:3000`
  - a Home that does not exist, from a code that looked fine to whoever read
  it aloud. The downstream shape checks do not help; `http://` still matches,
  the length still fits. So on the path that hands a device its Home,
  `decodeCanonicalText` is the whole guard, and the test says so.

  **The absence of ICU was then audited for anything else it touches, and
  nothing else needed changing.** Six calls to `localeCompare` sit in the
  identity core, deciding which lifecycle statement is freshest and ordering
  delegations, revocations and revocation references - answers that travel,
  since `apps/core`'s event store records them. Every one of them is a
  *tie-break*, and every tie is unreachable: the lifecycle index refuses two
  statements that share an order (`conflicting_lifecycle_order_statement`),
  and a revocation reference matches exactly one of a delegation's keys. So
  a phone and a desktop cannot disagree there, and the calls were left
  alone rather than changed for tidiness.

  Three more sit in `@pico/sync`, ordering a reader-custody catalogue, and
  those are *not* guarded by a refusal - they are the primary order. They
  were left for a different measured reason: that order feeds descriptors
  handed to a consumer, not bytes anybody signs. Worth knowing that the
  divergence is real where it would matter - with ICU `'mem_01…'` sorts
  *after* `'mem__1…'` and without it before, ten disagreements in a hundred
  pairs of realistic ids - so an ordering that ever becomes canonical must
  not be built this way.

  Recorded because the next reader
  who finds them, knowing about the missing ICU, would otherwise spend the
  same hour deciding they are harmless.

  **This is what A1's "fixture suites green on-device" did not cover, and
  the gap is worth naming.** Those suites ran under Termux's Node, which has
  full ICU. The product runs under the embedded one, which does not. A suite
  green on a proxy runtime is evidence about the proxy.

  So the gap got a check of its own (`apk/run-conformance.sh`, 2026-08-20).
  It runs *in* the embedded runtime and exercises what a client cannot do
  without: text encoding both ways, the canonical transport including its
  refusal of invalid UTF-8, an enrolment code round trip, the Recovery Card
  transport layer, libsodium signing, argon2id at the vault's own profile,
  and a unix socket - reporting one line per fact, `intl: false` among them.
  On the Galaxy A55 everything passes, with argon2id at 1,342 ms against 844
  on the laptop.

  Its worth was measured the only way that counts: planting `fatal: true`
  back made it answer *`"fatal" option is not supported on Node.js compiled
  without ICU`* in one line, twenty seconds after asking - where the same
  fact took a stack trace, two checksums and an md5 comparison to find by
  hand. The enrolment round trip stayed green under that plant, because
  *building* a code decodes nothing, which is exactly how a suite can be
  green while the runtime cannot read anything.

  **The ceremony then ran end to end.** The phone made its own keys through
  its own custody daemon, showed its offer, read the grant with its camera,
  parsed it, raised the ADR 0099 approval and had it answered by the person
  holding it, showed its acceptance, confirmed with the Home, and wrote its
  profile: *"This phone is part of your Home."* The Home's side reports
  `delegation_b675f359f33b51d4f6d3a59caa10ad1b`, and the phone's profile
  carries the same delegation, its own signing and key-agreement
  fingerprints, and the Home's identity. A phone is a device of a Home over
  three codes and a camera.

  Two more findings stood between the grant and that sentence, and both were
  invisible from the outside.

  **The app had no `INTERNET` permission**, so the Link client could not open
  a socket at all: Android answered `EPERM`, `fetch` said only "fetch
  failed", and the confirmation loop spent two minutes concluding that the
  Home never answered. The Home was answering; nothing was allowed to ask.
  One line of manifest - but the *diagnosis* took a runtime self-test that
  tried the Home directly, because every layer above it reported the same
  shrug.

  **And the confirmation loop had been shrugging on purpose.** It swallowed
  every refusal, because a refusal is the ordinary state before the sponsor
  submits - and then, on timeout, said only that the device "was not
  accepted". It carries the last thing it heard now. That is the same rule
  the desktop learned the same day for its secure input and its refusal
  lines: a refusal that names nothing is a refusal nobody can act on, and the
  one thing worth keeping out of a timeout is what kept happening.

  **A third was found by a person pressing Back, and then fixed.** The walk
  lived in the Activity's process, so leaving the screen ended a ceremony
  another device was waiting on: the process had nothing left to keep it
  alive, Android reclaimed it, and the next launch began again at "choose a
  passphrase" - after the person had chosen one and shown a code.

  It has its own foreground service now (`JoinService`), beside the custody
  one and for the same reason: what is in flight is not a screen, it is a
  ceremony somebody else is waiting on. Two things had to follow. The
  Activity became a view - it starts the two services, draws what arrives
  and carries answers back, and hosts nothing. And the surface socket now
  lets the **newest** connection take over rather than refusing it: a view
  Android destroyed can leave its socket open for seconds, and refusing on
  that basis left a person watching "starting" while the walk waited for an
  answer nobody could give it.

  Measured after the change: pressing Back mid-ceremony leaves both
  processes alive, and reopening shows the step the walk is actually on -
  "type what your other device shows", with the offer still on screen - not
  the beginning. The ceremony then completed, both sides agreeing on
  `delegation_ed5512b7fecf7e140837ae7cedd332cd`.

  Two more findings came out of the lab that no amount of reading would have
  produced.

  **Android 16 says nodejs-mobile is not 16 KB-page compatible.** A system
  dialog covers the app on first launch and names all three libraries -
  `libnode.so`, `libc++_shared.so` and this project's own JNI shim - as
  having mismatched LOAD segments. This phone uses 4 KB pages, so it runs;
  devices that use 16 KB pages will not load them at all. That is a shipping
  constraint for A1's runtime choice, found on the first launch of the first
  surface.

  Measured per library on 2026-08-20, because "not compatible" names three
  different amounts of work: the shim was a linker flag away and is now
  aligned at `0x4000`; `libc++_shared.so` ships from NDK r26 at `0x1000` and
  is an NDK upgrade away (r27 aligns it); `libnode.so` is `0x1000` from
  nodejs-mobile's own release and is the one that needs a rebuild. So the
  runtime choice carries a build obligation, not a blocker.

  **The phone could not reach the laptop, and the reason was not a
  firewall.** It had no default route at all - two on-link subnets and
  nothing else - so the laptop's wifi address was unroutable from it, and
  the laptop's second interface, despite sharing the phone's /24, sat on a
  different segment using the same range. The lab therefore bridges the
  intake over `adb reverse` and says so in its own output: on Android
  loopback is reachable by every app on the device, which is fine for a lab
  and wrong for a deployment. A deployment publishes the intake on a LAN
  both devices are actually on.

  **The fingerprint rule moved, and the reason is that it was still one
  client's** (2026-08-20). `@pico/companion/fingerprint` closed three
  spellings inside this client. It did not close the fourth: the Vault daemon
  renders the sentence a person actually approves (ADR 0106, from the same
  validated fields the signed bytes are built from), and it shortened to a
  twelve-character prefix of its own. The two meet in one string -
  `main.ts` builds the approval body as the daemon's statement with the
  signing key appended - so a single dialogue could say *Admit 9f8e7d6c5b4a…*
  and *Signing key a1b2c3d4…7f8e9d0c* about keys a person is being asked to
  compare, and the membership the window confirms afterwards shares no
  visible characters with the one they approved beyond the first eight.

  So the decision now lives in `@pico/protocol/fingerprint-display`, the one
  package both already depend on and the only direction available -
  `@pico/companion` depends on `@pico/vault-daemon`, so a Vault reaching back
  is a cycle. ADR 0079's open question on display encoding is closed there
  rather than here, since the answer is the product's and not this gate's.

  Its check moved with it: `scripts/check-fingerprint-display.mjs` reads
  every app and package, and `check-companion-boundary.mjs` keeps only the
  half that really is this client's, a person's own calendar day. The list of
  renderer-reachable files both need is now stated once, in
  `scripts/companion-window.mjs` - two checks holding their own copy of one
  list is the same defect these checks exist to catch.

  What A5 keeps from this: the count of things a second client would decide
  again went down by one, and the one it went down by was the only one that
  two *processes* had to agree on.


  **The same question asked of time, and the same answer** (2026-08-20, the
  hour after). `@pico/companion/when` had closed three answers inside this
  client; it had not closed the ones outside it. Measured across every app and
  package rather than guessed: **eleven** instants reached a person raw - five
  in the Vault daemon's approval statements, one in the daemon itself, four in
  the Electron presentation adapter, one in the shell. `until
  2027-08-01T10:00:00.000Z` is a timezone, a precision and a punctuation style
  nobody asked for, in the one string somebody is supposed to check, while the
  window confirming the same ceremony said `2027-08-01`.

  So the rule is `@pico/protocol/when-display` -
  `picoDisplayDate`, `picoDisplayInstant`, `picoCalendarDaysUntil` - for the
  reason and by the route the fingerprint rule took an hour earlier, and it
  lands in the one package `check-runtime-floor.mjs` already refuses `Intl` in,
  which is where an ICU-free rendering rule ought to be enforced rather than
  promised.

  `check-instant-rules.mjs` reads every app and package for all three shapes
  of this defect - the raw instant, the ten-character UTC cut, the day counted
  in blocks - and found one on its first run that no companion-scoped check
  could have: the Recovery Card PDF stamped the UTC day, so a card printed at
  00:30 on the second names a date its owner never experienced.

  `check-companion-boundary.mjs` is back to its own subject - what the tray may
  reach, what the core may reach, and that both sides name the same IPC
  channels. **The lesson is the placement, not the two rules.** Both were found
  by one client and fixed inside it, and both were still wrong an hour later,
  because a check named after one of two surfaces that share a reader has its
  blind spot exactly where the reader is.


  **The field caps were swept once and the sweep missed most of them**
  (2026-08-20, later the same day). The first pass read the prompts in
  `main.ts` and fixed the three whose rule lived elsewhere. Counting instead
  of reading found seven caps that were bare numbers, and two more the count
  itself turned up.

  A passphrase may be 1,024 characters, and that was written in **seven**
  places: three byte-identical private `assertPassphrase` helpers in three
  packages, the daemon's wire cap, and four prompts. They all agreed - which
  is the finding, not the reassurance. A field and a rule holding the same
  number agree by coincidence, and the coincidence ends the first time one of
  them is revisited; then somebody chooses a passphrase a prompt accepted and
  the Vault refuses, during founding, after they have committed to it. The
  bound is `@pico/vault`'s now, where a passphrase becomes a keyfile, and the
  three surfaces keep their own refusals in their own vocabulary. Moving it to
  512 and rebuilding one package carries the daemon's wire cap and all four
  prompts with it, which is the property that was missing.

  The membership field was the same shape one number later: `64`, typed in
  beside a rule whose regex says `{64}` - and typed in *by the correction*
  that removed 128 for agreeing with nothing.

  **And the check found the one the first sweep could not see.** A cap must be
  a name now, not a number, and running that against the shell turned up
  `contract.ts` capping the Recovery Card code at 8,192 against a parser that
  refuses anything over `maxPicoRecoveryCardScanChars` - **5,486**. Two
  thousand seven hundred characters in which a scanner feeding the wrong line
  keeps feeding, and the refusal, when it comes, can only say the code is
  malformed. That is the identical defect the device-enrolment field had, and
  it survived that field's repair by hours because it lives in the *window*,
  where no protocol constant can be imported - so the bound arrives as an
  argument, the way the prefix already did, for the reason ADR 0113 C2 gives.

  Two caps had no rule anywhere to defer to and are named where they are used
  with the argument for their size. That is the other half of the rule: if
  nothing enforces a length, naming it is what turns a number somebody picked
  into a decision somebody can find to question.

  **The three verbs had a contract and no words** (2026-08-21, found by asking
  what an Android surface would inherit). `PicoCompanionEnrolmentSurface` is
  core-owned and states them exactly - `showCode`, `readCode`, `announce` - so
  the shape a platform implements was never in doubt. But `announce(step)`
  hands over a *step name*, and every sentence a person reads during the walk
  lived in `apps/companion-shell/src/contract.ts`: eleven steps with a title and
  a body, plus three founding ones. A phone implementing the same interface
  would have received `'waiting'` and written its own sentence.

  The founding lines carried an argument for staying per-caller, and it is half
  right: the CLI says "on the terminal holding the unlock", which is true there
  and false in a window. That difference is real between a terminal and a
  screen and imaginary between two screens, so the argument is kept and
  narrowed rather than dropped.

  The words are `@pico/companion/enrolment-steps` now, beside the interface
  whose steps they name. A test walks all eleven and refuses a mute one, and
  refuses the technical vocabulary the doc comment already forbade in prose -
  "delegation", "activation", "evidence" are true and tell a person holding two
  screens nothing they can act on.

  **The window was calling the wording function itself**, which is the other
  half and the ADR 0113 C2 one: `openDeviceCodePanel` picked a hint by calling
  `picoCompanionEnrolmentStepLine`. It receives both sentences over
  `getEnrolmentHints` now and only chooses which of the two belongs to the
  intent that was opened - choosing among finished sentences is not deciding a
  rendering.

  **The Gradle question was measured on 2026-08-21, and it is the wrong
  question.** The sequencing document carried it as "a Compose surface means a
  Gradle wrapper and hundreds of megabytes next to PhpStorm and Blender on
  16 GB - that is a decision, not a footnote". Two of those three claims do not
  survive contact with the machine.

  **Disk is not the constraint.** `/home` has 123 GB free. The Android SDK
  (3.7 GB) and NDK (2.1 GB) are already there; a Gradle and AndroidX cache
  would be a rounding error against that. The sentence conflated disk with
  memory.

  **Memory is a real constraint**, and it is the one worth naming: 14 GB total,
  **2.9 GB available** with PhpStorm holding 2.7 GB and Chromium 1.8 GB -
  Blender not even running. Gradle and Kotlin build as long-lived daemons and
  neither is installed here, so a first build is also a first download. This
  was not measured against an installed Gradle, deliberately: installing one to
  price it is the thing being decided.

  **And the question is moot for what A5 owes.** The hand-built path already
  carries an interactive ceremony:

  - `JoinActivity`, 338 lines, plain `android.widget` views built in code - no
    XML layouts
  - `ScanActivity`, 442 lines, on `android.hardware.camera2`, the *framework*
    camera API rather than CameraX
  - the biometric binding A3 measured uses
    `KeyGenParameterSpec.setUserAuthenticationParameters` with
    `AUTH_BIOMETRIC_STRONG` - framework again
  - **zero** occurrences of `androidx` or `kotlin` anywhere in the APK source
  - the whole UI toolchain, twelve Java files: `javac` 0.3 s, `d8` 0.6 s -
    **one second**, against a Gradle build that starts by warming daemons

  One correction to that list, made on the same day by compiling it: there *is*
  a third-party jar. `ScanActivity` reads QR codes with `com.google.zxing`, and
  `run-keystore-probe.sh` fetches `core-3.5.3.jar` from Maven Central with a
  `curl` into `~/.cache/pico-apk-libs`. That is a dependency, and the first
  version of this note read as though there were none. It does not change the
  conclusion - one jar on a classpath is not a resolver, a daemon or a build
  system - but "no dependency machinery" and "one curl" are different claims
  and the second one is the true one.

  So the decision is not "can this machine afford Gradle" but "does the Android
  surface need Compose at all", and for the three verbs this gate owes a
  platform - put a code in front of a person, take one back, say where in the
  walk they are - the evidence says no. What would flip it is a real AndroidX
  dependency, and the two candidates that usually are one, camera and biometric
  prompt, are both answered by the framework at this `minSdkVersion`.

  **Die drei Verben hatten ihren Vertrag im Kern und ihre Worte in der Schale**
  (2026-08-21, gefunden beim Nachsehen, was eine Android-Fläche eigentlich
  implementieren müsste). `PicoCompanionEnrolmentSurface` steht in
  `@pico/companion/enrolment-steps` und nennt genau die drei Verben, die dieser
  Gate-Text einer Plattform zuschreibt: `showCode`, `readCode`, `announce`. Das
  ist die gute Hälfte - eine zweite Fläche implementiert eine Schnittstelle
  statt eine Zeremonie.

  Die schlechte: `announce(step)` reicht nur einen Schrittnamen hinüber, und
  **jeder Satz, den eine Person im Walk liest**, stand in
  `apps/companion-shell/src/contract.ts`. Elf Schritte mit Titel und Text, plus
  drei Gründungsschritte. Eine Android-Fläche hätte denselben Vertrag erfüllt
  und vierzehn eigene Sätze geschrieben - dieselbe Gestalt wie bei den
  Bedingungen aus A7, eine Ebene weiter, im Walk, um den A5 sich dreht.

  Der Doc-Kommentar der Gründungssätze argumentierte sogar dafür, und das
  Argument stimmt zur Hälfte: die CLI sagt „on the terminal holding the
  unlock", was dort wahr und in einem Fenster falsch ist. Zwischen CLI und
  Bildschirm ist der Unterschied echt. **Zwischen zwei Bildschirmen ist er
  keiner**, und genau das stand nicht da.

  Die Worte liegen jetzt neben ihrem Vertrag im Kern. Ein Test läuft die elf
  Schritte ab und verlangt für jeden Titel und Text - ein Schritt kann nicht
  mehr stumm ankommen - und hält zugleich die Regel fest, die der Kommentar
  aufstellte: kein Schritt nennt die Zeremonie beim technischen Namen, weil
  „Delegation" und „Evidence" wahr sind und einer Person nichts sagen, was sie
  tun kann.

  **Und das Fenster wählte einen dieser Sätze selbst.** `renderer.ts` rief
  `picoCompanionEnrolmentStepLine` auf, um den Hinweis der Gerätefläche zu
  setzen - eine Wortwahl an der Stelle, die unter ADR 0113 C2 keine trifft, und
  zugleich die Stelle, die nach dem Umzug gar nicht mehr an die Worte kommt.
  Die zwei Sätze kommen jetzt über einen eigenen Kanal fertig herüber; was das
  Fenster noch tut, ist auswählen, welcher zur geöffneten Absicht gehört. Unter
  fertigen Sätzen zu wählen ist keine Darstellungsentscheidung.

  **Phase 5 hat angefangen, und der erste Handgriff war der, den der Umzug
  derselben Stunde möglich gemacht hat** (2026-08-21). Die Android-Fläche
  erfüllte den Vertrag längst: `join.mjs` implementiert `showCode`, `readCode`
  und `announce` und treibt `runPicoCompanionAskingDeviceExchange`. Aber sie
  reichte nur den **Schrittnamen** an die Activity weiter, und
  `JoinActivity.java` hielt eigene Sätze für `show_offer`, `read_grant`,
  `show_acceptance`, `waiting` und `joined` - in Java geschrieben, neben
  denselben Schritten im Kern.

  Das ist genau der zweite Client, den dieses Gate misst, und er existierte
  schon. Der Desktop hat denselben Defekt am selben Tag verloren; hier war er
  eine Ebene tiefer, weil zwischen Kern und Fläche noch ein Prozess und ein
  Socket liegen.

  `join.mjs` läuft im selben App-Prozess wie der Kern und kann ihn importieren,
  also rendert es jetzt dort und schickt den fertigen Satz mit. Die Activity
  nimmt den gereichten und wählt keinen mehr - dieselbe Gestalt wie das
  Electron-Fenster, das seine Sätze über IPC bekommt.

  Was in der Activity bleibt, sind zwei Momente, die kein Schritt des Walks
  sind: die Passphrase und die ADR-0106-Zustimmung. Der Desktop hält seine
  dafür ebenfalls selbst, **also ist das ein gleicher Stand und keine
  Abweichung** - und die nächsten zwei, die umziehen, wenn jemand sie anfasst.

  **Am Gerät bewiesen, und der Beweis brauchte keine Pflanzung.** Der Walk lief
  auf dem A55 bis `read_grant`, und der Bildschirm zeigte:

      Read the code your other device shows
      This device checks that the code is really about itself before it signs
      anything, and it will not sign one meant for a different machine.

  Das ist wörtlich der Satz des Kerns. Die Activity hätte für denselben Schritt
  gesagt: *„Your other device is showing a grant. Type it here."* Zwei
  verschiedene Sätze über denselben Moment - genau der Preis, den dieses Gate
  misst, und zugleich der Nachweis, dass der gezeigte nicht aus der Activity
  stammen kann.

  Danach wurden die fünf toten Sätze aus `titleFor`/`bodyFor` entfernt und der
  Walk wiederholt: derselbe Bildschirm, derselbe Satz, ohne dass für diesen
  Schritt noch ein Rückfall existiert. Ein Rückfall, den niemand liest, ist
  einer, den niemand bemerkt, wenn eine Nachricht ihren Satz einmal verliert.

  **Der ganze Walk lief danach gegen ein echtes Home** - das Sponsor-Labor auf
  diesem Laptop, Foundation-API auf Loopback, nur der Link-Intake über
  `adb reverse` veröffentlicht. Drei Codes zwischen zwei Geräten, von denen
  eines ein Telefon ist, und der Sponsor meldete am Ende die Delegation.

  **Dabei fiel der letzte Satz auf, den der Vertrag gar nicht abdeckt.**
  `join.mjs` schickt am Ende ein eigenes Verb `done`, außerhalb von
  `PicoCompanionEnrolmentSurface`, und die Activity schrieb dafür wieder eigene
  Worte: *"This phone is part of your Home"*. Der Kern sagt für `joined` etwas
  anderes - *"This device is yours. Your Home answers to it now, and every
  device you already had keeps working."* Der **letzte** Bildschirm, den eine
  Person sieht, war also weiter der des zweiten Clients, während alle Schritte
  davor schon stimmten.

  Behoben und am Gerät nachgewiesen: derselbe Walk, dasselbe Telefon, und der
  Schlussbildschirm zeigt jetzt den Satz des Kerns. Was bleibt, sind drei
  Momente mit eigenen Worten - Passphrase, ADR-0106-Zustimmung und die
  Ablehnung -, und der Desktop hält seine für dieselben drei ebenfalls selbst.
  Ein gleicher Stand, keine Abweichung.

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
- **A7 - The home-network limit is spoken (half implemented 2026-08-19):**
  the client names an unreachable Home rather than presenting it as a quiet
  one, and no product surface or document claims away-from-home function.
  Decided 2026-08-09 together with the sequencing in `Roadmap.md` (which
  absorbed `docs/development/roadmap-to-first-client.md` on 2026-08-21).

  **The client half was missing, and not only on Android.** The alarm
  carrier's own comment said read failures "are counted and visible"; they
  were counted in a status object **nothing outside that file ever read**.
  So a failed authenticated lifecycle read produced no statement anywhere -
  the tray, the window and the condition list looked exactly as they do when
  the Home answered and had nothing to report. That is the precise thing
  this gate forbids, and ADR 0118 O4 already forbade it for the model and
  storage reads: "nothing is waiting" and "nobody looked" are different
  claims. The read that carries the ADR 0112 recovery alarm was the one
  without the rule.

  `home_unreachable` is now a stated condition, reported on every check in
  both directions. It is deliberately **not** `no_network` renamed: that one
  is the device's own link, which the shell reads from Electron, while this
  one is the Home not answering over a link that works - the state a phone
  is in from the moment it leaves the house. When the link *is* down, the
  network condition explains it and this one stays silent, because a refusal
  must not be an inventory (ADR 0077 C4).

  The already-armed alarm was never at risk: a failed read returns early
  without clearing `alarmActive`, so a raised alarm stays raised. What was
  missing was telling the person that the check itself had stopped landing.

  **The document half was audited the same day and holds:** every
  "remote access" and "away from home" occurrence across documents and
  product strings is a statement *denying* the function, not claiming it.
  No check enforces this, deliberately - a forbidden-phrase gate over prose
  would flag this ADR, which has to discuss the limit to set it.

  What keeps A7 from closing: an Android product surface to speak the limit
  on. The condition and its wording are in the shell-free core and the
  contract, so that surface inherits them rather than reinventing them.

  **That last sentence was half wrong, and it was found by going to build on
  it** (2026-08-21). The condition *kind* was in the core's carrier, which
  reports `reportHomeReachable`. Everything a person actually reads was not:
  `picoCompanionConditionsFor` and its remedy sentences were in
  `apps/companion-shell/src/contract.ts`, and the short labels - "Home not
  reached" and its four siblings - were in `renderer.ts`. In the *window*,
  which under ADR 0113 C2 decides no rendering at all.

  So an Android surface would have inherited a boolean and written the words
  again, and two clients would have told one person two different things about
  the same silence. That is the defect ADR 0131 A5 spent two days removing, and
  this gate asserted the opposite was already true.

  The words are `@pico/companion/conditions` now: kinds, labels, remedies and
  the derivation, in the package both a desktop and a phone can read. Label and
  remedy cross to the window already rendered, the parser requires them rather
  than filling them in, and the window keeps exactly one copy - the set of
  names - because a parser needs its vocabulary *before* anything arrives and
  that file resolves relative paths only. `condition-vocabulary.test.ts` binds
  that copy to the core's.

  **The device half ran** (2026-08-21, Galaxy A55, nodejs-mobile v18.20.4 with
  no ICU). A step in the conformance probe asks the moved rule for the two cases
  that decide whether it is worth anything, and got both right on the phone:

      {"check":"stated conditions","ok":true,"detail":{
        "label":"Home not reached","remedyChars":117,"silentWhenLinkIsDown":true}}

  So a Home that does not answer over a link that works produces the named
  condition with its words, and a link that is itself down produces only
  `no_network` - the Home stays unmentioned, because a refusal must not be an
  inventory (ADR 0077 C4) and telling somebody both is one fact said twice.

  **The rule was falsified rather than trusted**, though not where it was
  measured: removing the precedence guard makes it report `no_network` *and*
  `home_unreachable` together, which the host test catches by name. The same
  plant on the device did not finish - the phone left the bus mid-run - so what
  is proven on the phone is that the rule holds there, and what is proven on the
  host is that it bites when broken. Stated rather than merged, because they are
  different claims.

  What still keeps A7 from closing is unchanged and is the product half: this
  runs in a lab artifact, not in a shipped Android client. What changed is that
  the client, when it comes, inherits the sentence instead of writing a second
  one.

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
