#!/usr/bin/env bash
# ADR 0131 A3 / ADR 0081 P3 - what this phone's keystore actually is.
#
# Builds the same probe APK as `build-and-run.sh` (the app hosts the gate
# probes; the package name keeps its A1 spelling because documents point at
# it) and runs only `KeystoreProbeService`. No Node, no staged core: this
# measurement is pure platform API, so it needs neither.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
sdk="${ANDROID_SDK:-$HOME/Android/Sdk}"
ndk="${ANDROID_NDK:-$HOME/.cache/android-ndk-r26d}"
njm="${NODEJS_MOBILE:-$HOME/.cache/pico-apk}"
javac_bin="${JAVAC:-javac}"
work="${PICO_APK_WORK:-$HOME/.cache/pico-apk-app}"

die() { echo "$*" >&2; exit 1; }
bt="$(ls -d "$sdk"/build-tools/* | sort | tail -1)"
aj="$(ls "$sdk"/platforms/*/android.jar | sort | tail -1)"
[ "$(adb devices | sed -n '2p' | awk '{print $2}')" = "device" ] || die "no adb device"

mkdir -p "$work/lib/arm64-v8a" "$work/src"
cp -r "$here/src/." "$work/src/"
cp "$here/AndroidManifest.xml" "$here/pico_node_jni.cpp" "$work/"

# The native libraries are the A1 half; this probe never loads them, but the
# APK is one artifact and building it twice differently would make the two
# measurements come from two apps.
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
adb shell "run-as com.pico.a1probe sh -c 'rm -f files/keystore.log'"
adb shell am start-foreground-service -n com.pico.a1probe/.KeystoreProbeService > /dev/null
sleep 15
adb shell "run-as com.pico.a1probe sh -c 'cat files/keystore.log'" | tee "$work/keystore.log"
