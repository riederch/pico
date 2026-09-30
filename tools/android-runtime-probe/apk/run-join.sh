#!/usr/bin/env bash
# ADR 0131 A5, first vertical - this phone asking a Home to let it in.
#
# Builds the same APK as the other runners and starts `JoinActivity`, which
# brings up custody in its own process, the shell-free core in this one, and
# a surface over an app-private AF_UNIX socket. Typed path only: the code the
# other device shows is typed here, because a camera would mean a dependency
# this machine has no build system for.
#
# What this needs that the probes did not: a *sponsoring* device. A Pico Home
# reachable from the phone (see the roadmap's Phase 5 note - publish the Link
# intake, not the Foundation port) and a desktop companion signed in to it,
# running "add another device". Without one, the walk stops after this phone
# has shown its offer, which is itself the thing worth seeing first.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../../.." && pwd)"
sdk="${ANDROID_SDK:-$HOME/Android/Sdk}"
ndk="${ANDROID_NDK:-$HOME/.cache/android-ndk-r26d}"
njm="${NODEJS_MOBILE:-$HOME/.cache/pico-apk}"
javac_bin="${JAVAC:-javac}"
work="${PICO_APK_WORK:-$HOME/.cache/pico-apk-app}"
pkg=com.pico.a1probe

die() { echo "$*" >&2; exit 1; }
[ "$(adb devices | sed -n '2p' | awk '{print $2}')" = "device" ] || die "no adb device"

bt="$(ls -d "$sdk"/build-tools/* | sort | tail -1)"
aj="$(ls "$sdk"/platforms/*/android.jar | sort | tail -1)"

mkdir -p "$work"
# Built the one way every APK here is built (apps/android/build-apk.sh), and
# signed with the probe's own debug key: the phones on this desk carry the
# probe installed under it, and `adb install -r` with another key would fail -
# or, forced, erase the joined vault in `files/`.
[ -f "$work/debug.keystore" ] || keytool -genkeypair -keystore "$work/debug.keystore" \
  -alias pico -keyalg RSA -keysize 2048 -validity 30 -storepass picodebug -dname "CN=PicoA1Probe"
PICO_APK_KEYSTORE="$work/debug.keystore" PICO_APK_KEYSTORE_PASS=picodebug PICO_APK_KEY_ALIAS=pico \
  "$repo/apps/android/build-apk.sh" --manifest "$here/AndroidManifest.xml" \
  --extra-src "$here/src" --out "$work/pico-a1-probe.apk"
cd "$work"

echo "== staging the shell-free core"
# Inside the workspace, deliberately: a deploy target outside it makes pnpm
# walk up to `/` for a workspace root and fail writing there.
stage="$repo/.pico-stage/probe-stage"
mkdir -p "$repo/.pico-stage"
rm -rf "$stage"
# The store this repository installs from, named explicitly: without it pnpm
# resolves a cache of its own and has been seen to land somewhere unwritable.
(cd "$repo" && npx pnpm@9.0.0 --filter @pico/companion --store-dir /tmp/pico-pnpm-store \
  deploy --prod --frozen-lockfile "$stage")
cp "$repo/apps/android/stage/join.mjs" "$repo/apps/android/stage/keystore-port.mjs" "$here/reopen.mjs" "$repo/apps/android/stage/daemon.mjs" \
  "$repo/apps/android/stage/preload.cjs" "$here/conformance.mjs" "$repo/apps/android/stage/reachability.mjs" "$stage/"
tar -C "$repo/.pico-stage" -c --hard-dereference -f "$work/probe-stage.tar" probe-stage

adb install -r "$work/pico-a1-probe.apk"
adb shell pm grant "$pkg" android.permission.POST_NOTIFICATIONS 2>/dev/null || true
adb push "$work/probe-stage.tar" /data/local/tmp/probe-stage.tar > /dev/null
# A join starts from a device that holds nothing: the offer's key bootstrap
# refuses a vault that already has keyfiles, which is the rule, not a nuisance.
# `files` does not exist until the app has run once, and a fresh install has
# not. Making it here keeps the first join from needing a rehearsal.
adb shell "run-as $pkg sh -c 'mkdir -p files && cd files && rm -rf stage vault fdata fbackup ui.sock keystore.sock profile.json platform-unlock.json join.log daemon.log keystore-port.log && /system/bin/tar -xf /data/local/tmp/probe-stage.tar && mv probe-stage stage'"
# The lab's port, so the runtime self-test can try to reach the Home before
# anybody scans anything. Lab-only: a real client learns its address from the
# grant.
if [ -f "$repo/.pico-stage/lab.json" ]; then
  python3 -c "import json;print(json.load(open('$repo/.pico-stage/lab.json'))['intakePort'])" \
    > "$repo/.pico-stage/lab-port.txt"
  adb push "$repo/.pico-stage/lab-port.txt" /data/local/tmp/lab-port.txt > /dev/null
  adb shell "run-as $pkg sh -c 'cp /data/local/tmp/lab-port.txt files/stage/lab-port.txt'"
fi
adb shell am start -n "$pkg/.JoinActivity" > /dev/null
echo
echo "The phone is showing the first step. Type a passphrase there; it will make"
echo "its keys and show you an offer code to carry to your other device."
echo "Follow along with: adb shell \"run-as $pkg sh -c 'cat files/join.log'\""
