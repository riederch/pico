#!/usr/bin/env bash
# ADR 0131 A4 - the reachability contract, measured on real hardware.
#
# Two phases, because the contract has two kinds of answer. `start` records
# what the device grants a first run and posts the ADR 0112 alarm both ways
# (with and without the restricted full-screen permission); it then leaves a
# heartbeat job running. `read` prints the log later - the cadence question
# cannot be answered in a minute, and pretending otherwise would be the
# measurement lying.
#
#   run-reachability-probe.sh start [--full-screen]
#   run-reachability-probe.sh read
#   run-reachability-probe.sh force-stop     # the harshest task-killer case
#   run-reachability-probe.sh stop
#
# `--full-screen` flips the app-op that Android 14+ withholds from
# non-calling apps, so the same alarm can be posted under both states. It is
# a deliberate second run, never the default: what a first run meets is the
# denied state.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
sdk="${ANDROID_SDK:-$HOME/Android/Sdk}"
ndk="${ANDROID_NDK:-$HOME/.cache/android-ndk-r26d}"
njm="${NODEJS_MOBILE:-$HOME/.cache/pico-apk}"
javac_bin="${JAVAC:-javac}"
work="${PICO_APK_WORK:-$HOME/.cache/pico-apk-app}"
pkg=com.pico.a1probe

die() { echo "$*" >&2; exit 1; }
[ "$(adb devices | sed -n '2p' | awk '{print $2}')" = "device" ] || die "no adb device"

case "${1:-start}" in
  read)
    adb shell "run-as $pkg sh -c 'cat files/reachability.log'"
    exit 0
    ;;
  force-stop)
    # A user force-stop is the strongest thing a manufacturer's task manager
    # does, and Android's own rule is that nothing restarts until the app is
    # launched again. Measured rather than argued.
    adb shell am force-stop "$pkg"
    echo "force-stopped; read again later to see whether any heartbeat follows"
    exit 0
    ;;
  stop)
    adb shell am force-stop "$pkg" || true
    adb uninstall "$pkg"
    exit 0
    ;;
esac

bt="$(ls -d "$sdk"/build-tools/* | sort | tail -1)"
aj="$(ls "$sdk"/platforms/*/android.jar | sort | tail -1)"

mkdir -p "$work/lib/arm64-v8a" "$work/src"
cp -r "$here/src/." "$work/src/"
cp "$here/AndroidManifest.xml" "$here/pico_node_jni.cpp" "$work/"
if [ ! -f "$work/lib/arm64-v8a/libpiconode.so" ]; then
  clang="$(ls "$ndk"/toolchains/llvm/prebuilt/*/bin/aarch64-linux-android2[4-9]-clang++ | head -1)"
  cp "$njm/bin/arm64-v8a/libnode.so" "$work/lib/arm64-v8a/"
  cp "$(dirname "$clang")/../sysroot/usr/lib/aarch64-linux-android/libc++_shared.so" \
    "$work/lib/arm64-v8a/"
  "$clang" -fPIC -shared -std=c++17 -I "$njm/include/node" \
    -o "$work/lib/arm64-v8a/libpiconode.so" "$work/pico_node_jni.cpp" \
    -L "$njm/bin/arm64-v8a" -lnode -llog
fi

cd "$work"
rm -rf classes classes.dex base.apk aligned.apk pico-a1-probe.apk
"$javac_bin" --release 11 -classpath "$aj" -d classes src/com/pico/a1probe/*.java
"$bt/d8" --lib "$aj" --output . classes/com/pico/a1probe/*.class
"$bt/aapt2" link -o base.apk --manifest AndroidManifest.xml -I "$aj"
zip -q base.apk classes.dex
zip -qX base.apk lib/arm64-v8a/*.so
"$bt/zipalign" -f -p 4 base.apk aligned.apk
[ -f debug.keystore ] || keytool -genkeypair -keystore debug.keystore -alias pico \
  -keyalg RSA -keysize 2048 -validity 30 -storepass picodebug -dname "CN=PicoA1Probe"
"$bt/apksigner" sign --ks debug.keystore --ks-pass pass:picodebug \
  --out pico-a1-probe.apk aligned.apk

adb install -r "$work/pico-a1-probe.apk"
# Notifications are a runtime permission on 33+; granting it is not what this
# probe measures, so it is granted rather than left to confound the result.
adb shell pm grant "$pkg" android.permission.POST_NOTIFICATIONS 2>/dev/null || true
if [ "${2:-}" = "--full-screen" ]; then
  adb shell appops set "$pkg" USE_FULL_SCREEN_INTENT allow
  echo "== full-screen intent app-op: allowed (deliberate second run)"
else
  adb shell appops set "$pkg" USE_FULL_SCREEN_INTENT default 2>/dev/null || true
  echo "== full-screen intent app-op: left at the default a first run meets"
fi
adb shell "run-as $pkg sh -c 'rm -f files/reachability.log'"
adb shell am start-foreground-service -n "$pkg/.ReachabilityProbeService" > /dev/null
sleep 6
adb shell "run-as $pkg sh -c 'cat files/reachability.log'"
echo
echo "Heartbeat job is scheduled. Look at the phone now: one of the two alarm"
echo "notifications is the ADR 0112 alarm as Android would really present it."
echo "Come back with: $0 read"
