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

mkdir -p "$work/lib/arm64-v8a" "$work/src"
cp -r "$here/src/." "$work/src/"
cp "$here/AndroidManifest.xml" "$here/pico_node_jni.cpp" "$work/"
if [ ! -f "$work/lib/arm64-v8a/libpiconode.so" ]; then
  clang="$(ls "$ndk"/toolchains/llvm/prebuilt/*/bin/aarch64-linux-android2[4-9]-clang++ | head -1)"
  cp "$njm/bin/arm64-v8a/libnode.so" "$work/lib/arm64-v8a/"
  cp "$(dirname "$clang")/../sysroot/usr/lib/aarch64-linux-android/libc++_shared.so" \
    "$work/lib/arm64-v8a/"
  # 16 KB-aligned segments. Android 16 warns that nodejs-mobile's
  # libraries are not, and a device with 16 KB pages will not load them
  # at all; this shim is one flag away from being ready, libnode.so is a
  # rebuild away, and the NDK's libc++ is an NDK upgrade away.
  "$clang" -fPIC -shared -std=c++17 -I "$njm/include/node" \
    -Wl,-z,max-page-size=16384 -Wl,-z,common-page-size=16384 \
    -o "$work/lib/arm64-v8a/libpiconode.so" "$work/pico_node_jni.cpp" \
    -L "$njm/bin/arm64-v8a" -lnode -llog
fi

cd "$work"
rm -rf classes classes.dex base.apk aligned.apk pico-a1-probe.apk
# ZXing's `core`, a pure-Java jar with no resources - the one shape of
# dependency a hand-assembled APK can take, and what makes the camera path
# possible without Gradle.
zxing="${PICO_ZXING_JAR:-$HOME/.cache/pico-apk-libs/zxing-core.jar}"
[ -f "$zxing" ] || curl -sL -o "$zxing" --create-dirs \
  https://repo1.maven.org/maven2/com/google/zxing/core/3.5.3/core-3.5.3.jar
"$javac_bin" --release 11 -classpath "$aj:$zxing" -d classes src/com/pico/a1probe/*.java
"$bt/d8" --lib "$aj" --output . classes/com/pico/a1probe/*.class "$zxing"
"$bt/aapt2" link -o base.apk --manifest AndroidManifest.xml -I "$aj"
zip -q base.apk classes.dex
zip -qX base.apk lib/arm64-v8a/*.so
"$bt/zipalign" -f -p 4 base.apk aligned.apk
[ -f debug.keystore ] || keytool -genkeypair -keystore debug.keystore -alias pico \
  -keyalg RSA -keysize 2048 -validity 30 -storepass picodebug -dname "CN=PicoA1Probe"
"$bt/apksigner" sign --ks debug.keystore --ks-pass pass:picodebug \
  --out pico-a1-probe.apk aligned.apk

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
cp "$here/join.mjs" "$here/keystore-port.mjs" "$here/daemon.mjs" "$here/preload.cjs" \
  "$here/conformance.mjs" "$stage/"
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
