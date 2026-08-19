#!/usr/bin/env bash
# ADR 0131 A1 - runs probe.mjs on whatever Android device adb sees.
#
# A real phone over USB is the evidence this gate wants; an emulator only
# answers the functional half. The run: stage the shell-free core with
# `pnpm deploy`, put a Node onto the device through the Termux *debug* build
# (debuggable is what makes `run-as` work - nothing is rooted, no UI is
# scripted), push the stage, execute the probe under the device's own
# filesystem and sockets.
#
# Deliberately not a gate: run by hand against hardware this repository
# cannot assume, output recorded as evidence - the same posture as the
# memory measurement scripts.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
stage="${PICO_PROBE_STAGE:-$(mktemp -d)/probe-stage}"
work="$(dirname "$stage")"
termux_apk="${PICO_TERMUX_APK:-}"

die() { echo "$*" >&2; exit 1; }

[ "$(adb devices | sed -n '2p' | awk '{print $2}')" = "device" ] \
  || die "no adb device is connected and authorised (adb devices)"

echo "== staging the shell-free core (pnpm deploy)"
rm -rf "$stage"
# --frozen-lockfile, because deploy otherwise rewrites the workspace
# lockfile's importers to `file:` specifiers as a side effect - a staging
# step must not edit the repository it stages from. It did, once.
(cd "$repo" && npx pnpm@9.0.0 --filter @pico/companion deploy --prod --frozen-lockfile "$stage")
cp "$here/probe.mjs" "$stage/"
# Symlinks stay symlinks - the strict pnpm layout carries its transitive
# resolution through their topology, and Termux's home holds them fine.
# Hardlinks become copies, because SELinux refuses link() under run-as.
tar -C "$work" -c --hard-dereference -f "$work/probe-stage.tar" "$(basename "$stage")"

if ! adb shell pm list packages 2>/dev/null | grep -q '^package:com.termux'; then
  if [ -z "$termux_apk" ]; then
    echo "== fetching the Termux debug build (debuggable, so run-as works)"
    termux_apk="$work/termux-debug.apk"
    url="$(curl -s https://api.github.com/repos/termux/termux-app/releases/latest \
      | grep -o 'https://[^"]*debug_universal\.apk' | head -1)"
    [ -n "$url" ] && curl -sL -o "$termux_apk" "$url" \
      || die "could not resolve the Termux debug apk; pass PICO_TERMUX_APK"
  fi
  echo "== installing Termux"
  adb install -r "$termux_apk"
fi

echo "== waiting for the Termux bootstrap"
adb shell am start -n com.termux/com.termux.app.TermuxActivity > /dev/null 2>&1 || true
count=0
for _ in $(seq 1 60); do
  # `|| true`, because before the first launch finishes `run-as` exits
  # non-zero - and under `set -eo pipefail` a failing command substitution
  # in an assignment ends the script with no message at all. It did.
  count="$(adb shell run-as com.termux ls files/usr/bin 2>/dev/null | wc -l || true)"
  [ "${count:-0}" -gt 10 ] && break
  sleep 2
done
[ "${count:-0}" -gt 10 ] || die "Termux bootstrap did not appear (run-as failed?)"

# One env script on the device instead of quoting across three shells: the
# host shell, the device shell `adb shell` hands its joined arguments to, and
# the sh under run-as. A semicolon in the unquoted middle layer splits there,
# which is how `pkg` once ran outside the Termux environment entirely.
cat > "$work/pico-probe-env.sh" <<'ENV'
#!/system/bin/sh
PREFIX=/data/data/com.termux/files/usr
HOME=/data/data/com.termux/files/home
PATH=$PREFIX/bin:$PATH
LD_LIBRARY_PATH=$PREFIX/lib
TMPDIR=$PREFIX/tmp
export PREFIX HOME PATH LD_LIBRARY_PATH TMPDIR
exec "$@"
ENV
adb push "$work/pico-probe-env.sh" /data/local/tmp/pico-probe-env.sh > /dev/null
termux() { adb shell "run-as com.termux sh /data/local/tmp/pico-probe-env.sh $*"; }

if ! termux node --version > /dev/null 2>&1; then
  echo "== installing Node inside Termux (device network)"
  termux "sh -c 'yes | pkg install -y nodejs-lts'" \
    || die "pkg install nodejs-lts failed - check the device's network"
fi
echo "== node on device: $(termux node --version | tr -d '\r')"

echo "== pushing the staged core"
adb push "$work/probe-stage.tar" /data/local/tmp/probe-stage.tar > /dev/null
termux "sh -c 'cd \$HOME && rm -rf probe-stage && /system/bin/tar -xf /data/local/tmp/probe-stage.tar'"

echo "== running the probe"
termux "sh -c 'cd \$HOME/probe-stage && node probe.mjs'" | tee "$work/probe-device.log"
