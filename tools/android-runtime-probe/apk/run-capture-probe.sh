#!/usr/bin/env bash
# ADR 0129 SR5 auf dem Telefon - der Sensoradapter hinter dem Port.
#
#   run-capture-probe.sh start    # baut, installiert, zieht die Buehne nach,
#                                 # fragt einmal und zeigt das Protokoll
#   run-capture-probe.sh read     # nur das Protokoll
# #
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
    adb shell "run-as $pkg sh -c 'cat files/capture.log; echo; cat files/fixes.jsonl'"
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
adb push "$here/capture.mjs" /data/local/tmp/pico-capture.mjs > /dev/null
# Der schalenfreie Kern, aus dem die Uebergabe kommt. Ganz statt einzeln:
# welche Datei sich geaendert hat, ist nach einem Bau nicht zu sehen, und ein
# vergessenes Modul sieht auf dem Telefon aus wie ein Fehler im Skript.
# Mit der `package.json`: sie traegt die Export-Landkarte, und `capture.mjs`
# erreicht den Kern ueber seinen eigenen Paketnamen. Ein neues Modul ohne
# seinen Eintrag scheitert beim Import - vor jedem `try`, also ohne ein Wort
# im Protokoll (am 2026-08-26 genau so passiert).
tar -C "$repo/apps/companion" -cf /tmp/pico-companion-dist.tar dist package.json
# Und das Protokoll daneben: `observations.js` haengt an einem Deckel, den es
# dort neu gibt. Ein fehlender Export bricht ESM beim Verknuepfen ab - vor
# jedem `try`, also ohne ein Wort im Protokoll.
tar -C "$repo/packages/protocol" -cf /tmp/pico-protocol-dist.tar dist package.json
adb push /tmp/pico-companion-dist.tar /data/local/tmp/pico-companion-dist.tar > /dev/null
adb push /tmp/pico-protocol-dist.tar /data/local/tmp/pico-protocol-dist.tar > /dev/null
adb shell "run-as $pkg sh -c 'cp /data/local/tmp/pico-capture.mjs files/stage/capture.mjs \
  && cd files/stage && /system/bin/tar -xf /data/local/tmp/pico-companion-dist.tar \
  && cd node_modules/@pico/protocol && /system/bin/tar -xf /data/local/tmp/pico-protocol-dist.tar \
  && cd ../../.. \
  && cd .. && rm -f capture.log fixes.jsonl'"

# ADR 0129 SR5 braucht die Berechtigung, sonst wirft `getCurrentLocation` und
# der Dienst saehe aus wie einer, der nichts misst.
adb shell pm grant "$pkg" android.permission.ACCESS_FINE_LOCATION 2>/dev/null || true
adb shell am start-foreground-service -n "$pkg/.LocationCaptureService" > /dev/null
sleep 12
adb shell "run-as $pkg sh -c 'cat files/capture.log; echo \"--- fixes.jsonl ---\"; cat files/fixes.jsonl 2>/dev/null'"
