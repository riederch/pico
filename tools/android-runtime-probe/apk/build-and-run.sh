#!/usr/bin/env bash
# ADR 0131 A1/A2 - the probe under the embedded runtime, in the decided
# two-process shape: a :custody foreground service hosting the real vault
# daemon, a client foreground service walking the custody path across the
# app-private AF_UNIX socket. Hand-assembled APK - build-tools + NDK clang,
# no gradle - because the entire app is two services and a JNI shim.
#
# Needs: ANDROID_SDK (build-tools + a platforms/android-*), an NDK, a javac,
# and the nodejs-mobile android release unpacked (NODEJS_MOBILE). All are
# downloaded fine by hand; this script refuses to guess locations.
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
clang="$(ls "$ndk"/toolchains/llvm/prebuilt/*/bin/aarch64-linux-android2[4-9]-clang++ | head -1)"
[ -f "$njm/bin/arm64-v8a/libnode.so" ] || die "nodejs-mobile not found at $njm (release zip, unpacked)"

mkdir -p "$work/lib/arm64-v8a" "$work/src"
cp -r "$here/src/." "$work/src/"
cp "$here/AndroidManifest.xml" "$here/pico_node_jni.cpp" "$work/"
cp "$njm/bin/arm64-v8a/libnode.so" "$work/lib/arm64-v8a/"
cp "$(dirname "$clang")/../sysroot/usr/lib/aarch64-linux-android/libc++_shared.so" "$work/lib/arm64-v8a/"

echo "== JNI shim"
"$clang" -fPIC -shared -std=c++17 -I "$njm/include/node" \
  -o "$work/lib/arm64-v8a/libpiconode.so" "$work/pico_node_jni.cpp" \
  -L "$njm/bin/arm64-v8a" -lnode -llog

echo "== APK"
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
cp "$here/daemon.mjs" "$here/client.mjs" "$here/preload.cjs" "$stage/"
tar -C "$repo/.pico-stage" -c --hard-dereference -f "$work/probe-stage.tar" probe-stage

echo "== device"
[ "$(adb devices | sed -n '2p' | awk '{print $2}')" = "device" ] || die "no adb device"
adb install -r "$work/pico-a1-probe.apk"
adb push "$work/probe-stage.tar" /data/local/tmp/probe-stage.tar > /dev/null
adb shell "run-as com.pico.a1probe sh -c 'cd files && rm -rf stage vault fdata fbackup daemon-ready client.log daemon.log && /system/bin/tar -xf /data/local/tmp/probe-stage.tar && mv probe-stage stage'"
adb shell am start-foreground-service -n com.pico.a1probe/.CustodyService > /dev/null
sleep 12
adb shell am start-foreground-service -n com.pico.a1probe/.ClientService > /dev/null
sleep 45
adb shell "run-as com.pico.a1probe sh -c 'cat files/client.log'" | tee "$work/client.log"
