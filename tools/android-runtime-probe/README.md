# Android runtime probe (ADR 0131 A1/A2)

Runs the **real** shell-free companion core - the vault's keyfile functions,
the ADR 0097 daemon on an AF_UNIX socket, the ADR 0099 approval binding, the
companion's own profile module - on whatever host executes it, and reports one
JSON line per step. Nothing in `probe.mjs` is a stand-in: a probe that passed
on re-implementations would prove the re-implementations.

## What a green run proves

- the reviewed libsodium build (WASM) loads and runs argon2id at the vault's
  own `moderate` profile, with the create/open timings that decide whether an
  unlock on a phone is a pause or a failure;
- `pico.vault.keyfile.v1` round-trips on the device's real filesystem with the
  0600 mode assertion holding;
- the custody daemon listens on a pathname AF_UNIX socket, its client
  connects, and the founding bootstrap runs end to end;
- a gated sign blocks until the hold connection approves it, and the approved
  signature verifies against the canonical bytes - ADR 0099, whole;
- the measured IPC round-trip cost of A2's process split, which every Link
  request pays once.

## Running it

Host baseline (should always be green):

    npx pnpm@9.0.0 --filter @pico/companion deploy --prod --frozen-lockfile /tmp/probe-stage
    cp tools/android-runtime-probe/probe.mjs /tmp/probe-stage/
    (cd /tmp/probe-stage && node probe.mjs)

On an Android device (a real phone over USB is the evidence A1 wants):

    tools/android-runtime-probe/run-on-device.sh

The runner stages the core with `pnpm deploy`, installs the Termux *debug*
build (debuggable is what makes `run-as` work - nothing is rooted and no UI
is scripted), installs Node from Termux's repository using the device's own
network, pushes the stage, and runs the probe under the device's filesystem
and sockets. `PICO_TERMUX_APK=/path/to.apk` skips the download.

## The keystore probe (ADR 0131 A3 / ADR 0081 P3)

`apk/run-keystore-probe.sh` builds the same APK and runs `KeystoreProbeService`
only - no Node, no staged core, because that measurement is pure platform API.
It asks where a key actually lives (`KeyInfo.getSecurityLevel()` *and* an
attestation chain verified signature by signature), whether StrongBox exists,
whether a biometric-gated key refuses to work without a fresh authentication,
whether an unlock secret round-trips through a hardware-held key, and whether
the alias survives. It deletes its own aliases when it finishes.

What it deliberately does not do: pin Google's attestation root or parse the
attestation extension. Shipping the root and reading verified-boot state,
patch level and the challenge belongs to the implementation; a probe that
faked it would measure its own fake.

## The conformance probe (ADR 0131 A1)

`apk/run-conformance.sh` asks the *embedded* runtime what it provides, and
prints one line per fact: Node version and whether `Intl` exists at all, text
encoding both ways, the canonical transport including a refusal of invalid
UTF-8, an enrolment code round trip, the Recovery Card transport layer,
libsodium signing, argon2id at the vault's own profile with a timing, and a
unix socket.

It exists because A1's "937 fixture tests green on-device" was measured under
Termux's Node, which has full ICU. The product runs under nodejs-mobile,
which has none, and the gap cost a day: `TextDecoder` with `fatal: true`
throws `ERR_NO_ICU` there, so every code was refused as malformed. Planting
that bug back makes this probe say `"fatal" option is not supported on
Node.js compiled without ICU` in one line, in about twenty seconds.

Measured 2026-08-20 on the Galaxy A55: everything green, `intl: false`
recorded in the first line, argon2id 1,342 ms against 844 ms on the laptop.

## The reachability probe (ADR 0131 A4)

`apk/run-reachability-probe.sh start` records what the device grants a first
run - battery-optimisation exemption, background restriction, standby bucket,
exact-alarm and full-screen-intent permission, notification channel importance
as actually granted - posts the ADR 0112 alarm both with and without the
restricted full-screen intent, and leaves a heartbeat job running so the
distance between a requested interval and the intervals that arrive becomes a
subtraction rather than an argument.

    run-reachability-probe.sh start                # the default state a first run meets
    run-reachability-probe.sh start --full-screen  # the same alarm with the app-op allowed
    run-reachability-probe.sh read                 # heartbeats so far
    run-reachability-probe.sh force-stop           # the harshest task-killer case
    run-reachability-probe.sh stop                 # force-stop and uninstall

It deliberately does not request the battery-optimisation exemption: the
default is what a first run meets, and a probe that fixed its own environment
would measure the fix. It also never claims the alarm was *seen* - whether a
notification is unmissable is a person's observation, so it records what the
system permitted and posted, and the looking is left to whoever holds the
phone.

The cadence half needs hours, not minutes. `start` now, `read` later.

Measured 2026-08-19 (Galaxy A55, Android 16): the 15-minute floor is assigned
with a 15-minute flex, deep doze deferred it past its due time by 5 min 17 s
and released it only when doze ended, exact alarms are unavailable by default,
and `am force-stop` deletes the persisted job outright. Numbers and what they
do to the ADR 0112 claim are in ADR 0131's A4 gate.

## Status

2026-08-18: **green on real hardware.** Samsung SM-A556B (Galaxy A55),
Android 16, arm64, Termux Node v24: sodium ready 37 ms, keyfile create
1218 ms / open 1011 ms at the vault's argon2id `moderate` profile, daemon on
a pathname AF_UNIX socket, founding bootstrap 3.0 s, the whole ADR 0099
approval loop with the signature verified against the canonical bytes, IPC
round trip 0.877 ms mean. Host baseline (x86_64, Node 22) for comparison:
create 833 ms / open 582 ms, IPC 0.36 ms.

Termux Node is a *proxy* runtime - same kernel, filesystem, Bionic and V8
family as the embedded runtime the product will use, but not that runtime.
A1 is implemented. The fixture suites are green on-device (937 tests via
`run-suites-on-device.sh`, the two server-booting suites named as host-side),
and the probe ran under nodejs-mobile itself in the decided two-process shape
via `apk/build-and-run.sh` - see the ADR 0131 status notes for the numbers
and the four findings hosting the embedded runtime produced.

The Android emulator is not an option on this development host: 36.3.10 and
37.2.5 both SIGSEGV in their host renderer/scene path on Fedora 44 / kernel
7.1.8, in every GPU mode, coredumps on record. The runner targets whatever
`adb` sees instead, which is the better evidence anyway.
