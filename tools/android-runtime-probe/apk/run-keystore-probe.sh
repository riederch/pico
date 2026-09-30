#!/usr/bin/env bash
# ADR 0131 A3 / ADR 0081 P3 - what this phone's keystore actually is.
#
# Builds the same probe APK as `build-and-run.sh` (the app hosts the gate
# probes; the package name keeps its A1 spelling because documents point at
# it) and runs only `KeystoreProbeService`. No Node, no staged core: this
# measurement is pure platform API, so it needs neither.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../../.." && pwd)"
sdk="${ANDROID_SDK:-$HOME/Android/Sdk}"
ndk="${ANDROID_NDK:-$HOME/.cache/android-ndk-r26d}"
njm="${NODEJS_MOBILE:-$HOME/.cache/pico-apk}"
javac_bin="${JAVAC:-javac}"
work="${PICO_APK_WORK:-$HOME/.cache/pico-apk-app}"

die() { echo "$*" >&2; exit 1; }
bt="$(ls -d "$sdk"/build-tools/* | sort | tail -1)"
aj="$(ls "$sdk"/platforms/*/android.jar | sort | tail -1)"
[ "$(adb devices | sed -n '2p' | awk '{print $2}')" = "device" ] || die "no adb device"

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

adb install -r "$work/pico-a1-probe.apk"
adb shell "run-as com.pico.a1probe sh -c 'rm -f files/keystore.log'"
adb shell am start-foreground-service -n com.pico.a1probe/.KeystoreProbeService > /dev/null
sleep 15
adb shell "run-as com.pico.a1probe sh -c 'cat files/keystore.log'" | tee "$work/keystore.log"
