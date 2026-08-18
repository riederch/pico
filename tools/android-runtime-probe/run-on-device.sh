#!/usr/bin/env bash
# ADR 0131 A1 - runs probe.mjs on whatever Android device adb sees.
#
# A real phone over USB is the evidence this gate wants; an emulator only
# answers the functional half (argon2id timings on an x86_64 guest say
# nothing about a phone). Either way the run is: stage the shell-free core
# with `pnpm deploy`, put a Node onto the device through the Termux *debug*
# build - debuggable is what makes `run-as` work, so nothing here roots or
# types into a UI - and execute the probe under the device's own filesystem
# and sockets.
#
# What this script deliberately is not: a gate. It is run by hand, against
# hardware this repository cannot assume, and its output is evidence to be
# recorded - the same posture as the memory measurement scripts.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
stage="${PICO_PROBE_STAGE:-$(mktemp -d)/probe-stage}"
termux_apk="${PICO_TERMUX_APK:-}"

die() { echo "$*" >&2; exit 1; }

[ "$(adb devices | sed -n '2p' | awk '{print $2}')" = "device" ] \
  || die "no adb device is connected and authorised (adb devices)"

echo "== staging the shell-free core (pnpm deploy)"
rm -rf "$stage"
(cd "$repo" && npx pnpm@9.0.0 --filter @pico/companion deploy --prod "$stage")
cp "$here/probe.mjs" "$stage/"
tar -C "$(dirname "$stage")" -chf "$(dirname "$stage")/probe-stage.tar" "$(basename "$stage")"

if ! adb shell pm list packages 2>/dev/null | grep -q '^package:com.termux$'; then
  if [ -z "$termux_apk" ]; then
    echo "== fetching the Termux debug build (debuggable, so run-as works)"
    termux_apk="$(dirname "$stage")/termux-debug.apk"
    url="$(curl -s https://api.github.com/repos/termux/termux-app/releases/latest \
      | grep -o 'https://[^"]*debug_universal\.apk' | head -1)"
    [ -n "$url" ] && curl -sL -o "$termux_apk" "$url" \
      || die "could not resolve the Termux debug apk; pass PICO_TERMUX_APK"
  fi
  echo "== installing Termux"
  adb install -r "$termux_apk"
fi

echo "== waiting for the Termux bootstrap"
adb shell am start -n com.termux/com.termux.app.TermuxActivity > /dev/null
for _ in $(seq 1 60); do
  count="$(adb shell run-as com.termux ls files/usr/bin 2>/dev/null | wc -l)"
  [ "$count" -gt 10 ] && break
  sleep 2
done
[ "$count" -gt 10 ] || die "Termux bootstrap did not appear (run-as failed?)"

tenv='PREFIX=/data/data/com.termux/files/usr; HOME=/data/data/com.termux/files/home; PATH=$PREFIX/bin:$PATH; LD_LIBRARY_PATH=$PREFIX/lib; TMPDIR=$PREFIX/tmp; export PREFIX HOME PATH LD_LIBRARY_PATH TMPDIR;'

if ! adb shell run-as com.termux sh -c "$tenv node --version" > /dev/null 2>&1; then
  echo "== installing Node inside Termux (device network)"
  adb shell run-as com.termux sh -c "$tenv yes | pkg install nodejs-lts" \
    || die "pkg install nodejs-lts failed - check the device's network"
fi
echo "== node on device: $(adb shell run-as com.termux sh -c "$tenv node --version" | tr -d '\r')"

echo "== pushing the staged core"
adb push "$(dirname "$stage")/probe-stage.tar" /data/local/tmp/probe-stage.tar > /dev/null
adb shell run-as com.termux sh -c \
  'cd files/home && rm -rf probe-stage && /system/bin/tar -xf /data/local/tmp/probe-stage.tar'

echo "== running the probe"
adb shell run-as com.termux sh -c \
  "$tenv cd \$HOME/probe-stage && node probe.mjs" | tee "$(dirname "$stage")/probe-device.log"
