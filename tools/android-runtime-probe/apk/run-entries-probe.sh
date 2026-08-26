#!/usr/bin/env bash
# ADR 0118 O1 auf dem Telefon - Phase 6, "Termine auf dem Telefon".
#
#   run-entries-probe.sh start    # baut, installiert, zieht die Buehne nach,
#                                 # fragt einmal und zeigt das Protokoll
#   run-entries-probe.sh read     # nur das Protokoll
#   run-entries-probe.sh ack      # quittiert, als haette jemand den Knopf gedrueckt
#
# **Loescht nichts.** `build-and-run.sh` raeumt `files/` auf, samt `vault` -
# richtig fuer einen ersten Lauf und toedlich fuer einen bestehenden Beitritt.
# Ein Beitritt ist eine Zeremonie mit einem Menschen darin; ihn fuer einen Bau
# wegzuwerfen, ist am 2026-08-25 einmal passiert und hat einen ganzen Durchgang
# gekostet. Dieser Laeufer installiert ueber die App und kopiert nur die
# Dateien, die sich geaendert haben.
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

case "${1:-start}" in
  read)
    adb shell "run-as $pkg sh -c 'cat files/entries.log; echo; cat files/entries.txt'"
    exit 0
    ;;
  ack)
    adb shell am start-foreground-service -n "$pkg/.DueEntryAcknowledgeService" > /dev/null
    sleep 8
    adb shell "run-as $pkg sh -c 'cat files/entries-acknowledge.log'"
    exit 0
    ;;
esac

bt="$(ls -d "$sdk"/build-tools/* | sort | tail -1)"
aj="$(ls "$sdk"/platforms/*/android.jar | sort | tail -1)"

mkdir -p "$work/lib/arm64-v8a" "$work/src"
cp -r "$here/src/." "$work/src/"
cp "$here/AndroidManifest.xml" "$here/pico_node_jni.cpp" "$work/"

cd "$work"
rm -rf classes classes.dex base.apk aligned.apk pico-a1-probe.apk
zxing="${PICO_ZXING_JAR:-$HOME/.cache/pico-apk-libs/zxing-core.jar}"
"$javac_bin" --release 11 -classpath "$aj:$zxing" -d classes src/com/pico/a1probe/*.java
"$bt/d8" --lib "$aj" --output . classes/com/pico/a1probe/*.class "$zxing"
"$bt/aapt2" link -o base.apk --manifest AndroidManifest.xml -I "$aj"
zip -q base.apk classes.dex
zip -qX base.apk lib/arm64-v8a/*.so
"$bt/zipalign" -f -p 4 base.apk aligned.apk
"$bt/apksigner" sign --ks debug.keystore --ks-pass pass:picodebug \
  --out pico-a1-probe.apk aligned.apk

# Ueber die bestehende App, damit `files/` bleibt - Beitritt, Vault, Profil.
adb install -r "$work/pico-a1-probe.apk"

# Nur die geaenderten Buehnenteile. Das Skript und der Kern, aus dem seine
# Worte kommen; alles andere steht schon dort.
adb push "$here/entries.mjs" /data/local/tmp/pico-entries.mjs > /dev/null
adb push "$repo/apps/companion/dist/notify.js" /data/local/tmp/pico-notify.js > /dev/null
adb shell "run-as $pkg sh -c 'cp /data/local/tmp/pico-entries.mjs files/stage/entries.mjs \
  && cp /data/local/tmp/pico-notify.js files/stage/dist/notify.js \
  && rm -f files/entries.log files/entries.txt files/entries.pending'"

adb shell am start-foreground-service -n "$pkg/.DueEntriesService" > /dev/null
sleep 12
adb shell "run-as $pkg sh -c 'cat files/entries.log; echo \"--- entries.txt ---\"; cat files/entries.txt 2>/dev/null'"
