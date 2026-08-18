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

    npx pnpm@9.0.0 --filter @pico/companion deploy --prod /tmp/probe-stage
    cp tools/android-runtime-probe/probe.mjs /tmp/probe-stage/
    (cd /tmp/probe-stage && node probe.mjs)

On an Android device (a real phone over USB is the evidence A1 wants):

    tools/android-runtime-probe/run-on-device.sh

The runner stages the core with `pnpm deploy`, installs the Termux *debug*
build (debuggable is what makes `run-as` work - nothing is rooted and no UI
is scripted), installs Node from Termux's repository using the device's own
network, pushes the stage, and runs the probe under the device's filesystem
and sockets. `PICO_TERMUX_APK=/path/to.apk` skips the download.

## Status

2026-08-18: host baseline green (see the ADR 0131 status note for numbers).
The on-device half is unrun: this development host cannot boot the Android
emulator at all - emulator 36.3.10 *and* 37.2.5 SIGSEGV in their host
renderer/scene path on Fedora 44 / kernel 7.1.8, in every GPU mode, with
coredumps on record - so the runner waits for a real device or another host.
The emulator numbers would have been weak evidence anyway: an x86_64 guest's
argon2id timing says nothing about a phone.
