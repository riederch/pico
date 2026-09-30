#!/usr/bin/env bash
# The one way an APK of this tree is assembled - for the shipped app and for
# the measuring probe under tools/android-runtime-probe alike.
#
# ADR 0131: the whole app is foreground services, two activities and a
# 30-line JNI shim over nodejs-mobile's `node::Start`, so it is assembled by
# hand from build-tools and NDK clang - no Gradle, no AndroidX, measured on
# 2026-08-21 at about a second for the Java half. Until 2026-09-27 six probe
# scripts each carried their own copy of these steps; this file is the one.
#
# Usage:
#   build-apk.sh --manifest FILE --out FILE [--extra-src DIR]... [--embed-stage]
#                [--stage-extra FILE]... [--release]
#
#   --manifest     the AndroidManifest.xml; component names in it are fully
#                  qualified, so one source tree serves two manifests
#   --extra-src    Java sources beside apps/android/src (the probe's own
#                  measuring services)
#   --embed-stage  pack the shell-free core into the APK as assets/stage.tar,
#                  which the app unpacks itself - the shipped path. Without
#                  it the caller pushes the core over adb, as the probe does.
#   --stage-extra  a script added to the embedded core beside apps/android/stage
#   --release      refuse to sign with anything but the release key
#
# Signing: PICO_APK_KEYSTORE (path), PICO_APK_KEYSTORE_PASS (password, read
# from the environment and never from an argument, so it stays out of `ps`)
# and PICO_APK_KEY_ALIAS. Without them, and without --release, a throwaway
# debug key is made - an APK signed so is for a device on this desk only.
#
# Tools: ANDROID_SDK (build-tools + platforms/android-*), ANDROID_NDK, and a
# javac (JAVAC) - on this machine the system JDK is a JRE only.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
sdk="${ANDROID_SDK:-${ANDROID_SDK_ROOT:-$HOME/Android/Sdk}}"
ndk="${ANDROID_NDK:-${ANDROID_NDK_HOME:-$HOME/.cache/android-ndk-r26d}}"
javac_bin="${JAVAC:-javac}"
cache="${PICO_APK_CACHE:-$HOME/.cache/pico-apk-dl}"

# nodejs-mobile, pinned. The zip's digest is the pin; the libnode.so inside it
# was compared byte for byte with the one every device measurement since
# 2026-08-19 ran against (sha256 7c907316...250c) before this line was written.
njm_version=v18.20.4
njm_zip_sha256=bd7321eaa1a7602fbe0bb87302df2d79d87835cf4363fbdd17c350dbb485c2af
njm_url="https://github.com/nodejs-mobile/nodejs-mobile/releases/download/${njm_version}/nodejs-mobile-${njm_version}-android.zip"
# ZXing core, pinned the same way: a pure-Java jar, the one shape of
# dependency a hand-assembled APK can take. The digest matches Maven Central's
# own sha1 for the file and the jar the probe has built with since 2026-08-19.
zxing_url=https://repo1.maven.org/maven2/com/google/zxing/core/3.5.3/core-3.5.3.jar
zxing_sha256=8d8064c1636fdaef7189dd9055c7d59950a8940a12f2293956446ec3c109fd82

die() { echo "build-apk: $*" >&2; exit 1; }

manifest="" out="" embed=0 release=0
extra_src=() stage_extra=()
while [ $# -gt 0 ]; do
  case "$1" in
    --manifest) manifest="$2"; shift 2 ;;
    --out) out="$2"; shift 2 ;;
    --extra-src) extra_src+=("$2"); shift 2 ;;
    --stage-extra) stage_extra+=("$2"); shift 2 ;;
    --embed-stage) embed=1; shift ;;
    --release) release=1; shift ;;
    *) die "unknown argument: $1" ;;
  esac
done
[ -n "$manifest" ] && [ -f "$manifest" ] || die "--manifest names no file"
[ -n "$out" ] || die "--out is required"
manifest="$(cd "$(dirname "$manifest")" && pwd)/$(basename "$manifest")"
out="$(mkdir -p "$(dirname "$out")" && cd "$(dirname "$out")" && pwd)/$(basename "$out")"

fetch() { # url sha256 file
  if [ ! -f "$3" ] || ! echo "$2  $3" | sha256sum --check --status; then
    mkdir -p "$(dirname "$3")"
    curl -sSfL -o "$3.part" "$1"
    echo "$2  $3.part" | sha256sum --check --status || die "digest mismatch for $1"
    mv "$3.part" "$3"
  fi
}

bt="$(ls -d "$sdk"/build-tools/* 2>/dev/null | sort -V | tail -1)"
aj="$(ls "$sdk"/platforms/*/android.jar 2>/dev/null | sort -V | tail -1)"
clang="$(ls "$ndk"/toolchains/llvm/prebuilt/*/bin/aarch64-linux-android2[4-9]-clang++ 2>/dev/null | head -1)"
[ -n "$bt" ] && [ -n "$aj" ] || die "no build-tools or android.jar under $sdk"
[ -n "$clang" ] || die "no NDK clang under $ndk"
command -v "$javac_bin" > /dev/null || die "no javac ($javac_bin); set JAVAC"

njm_zip="$cache/nodejs-mobile-${njm_version}-android.zip"
fetch "$njm_url" "$njm_zip_sha256" "$njm_zip"
zxing="$cache/zxing-core-3.5.3.jar"
fetch "$zxing_url" "$zxing_sha256" "$zxing"

work="$(mktemp -d "${TMPDIR:-/tmp}/pico-apk.XXXXXX")"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/njm" "$work/lib/arm64-v8a" "$work/src" "$work/assets"
unzip -q "$njm_zip" 'bin/arm64-v8a/libnode.so' 'include/node/*' -d "$work/njm"

cp -r "$here/src/." "$work/src/"
for dir in "${extra_src[@]}"; do cp -r "$dir/." "$work/src/"; done
cp "$work/njm/bin/arm64-v8a/libnode.so" "$work/lib/arm64-v8a/"
cp "$(dirname "$clang")/../sysroot/usr/lib/aarch64-linux-android/libc++_shared.so" \
  "$work/lib/arm64-v8a/"

echo "== JNI shim"
# 16 KB-aligned segments; see the note in the ADR 0131 A5 gate. libnode.so
# itself is not, which is nodejs-mobile's release and a rebuild away.
"$clang" -fPIC -shared -std=c++17 -I "$work/njm/include/node" \
  -Wl,-z,max-page-size=16384 -Wl,-z,common-page-size=16384 \
  -o "$work/lib/arm64-v8a/libpiconode.so" "$here/pico_node_jni.cpp" \
  -L "$work/lib/arm64-v8a" -lnode -llog

if [ "$embed" = 1 ]; then
  echo "== the shell-free core, packed into the APK"
  # Inside the workspace, deliberately: a deploy target outside it makes pnpm
  # walk up to `/` for a workspace root and fail writing there.
  stage="$repo/.pico-stage/app-stage"
  rm -rf "$stage"
  mkdir -p "$repo/.pico-stage"
  # The store the workspace was installed from, read from pnpm's own record
  # rather than named here: this machine keeps it in /tmp, CI keeps it where
  # setup-node's cache puts it, and pnpm refuses a deploy from any other store
  # than the one node_modules was linked from. The record carries the layout
  # suffix (`/v3`), which --store-dir adds itself.
  pnpm_store="$(sed -n 's/^storeDir: //p' "$repo/node_modules/.modules.yaml")"
  [ -n "$pnpm_store" ] || die "no storeDir in node_modules/.modules.yaml - run pnpm install first"
  pnpm_store="${pnpm_store%/v[0-9]*}"
  (cd "$repo" && npx pnpm@9.0.0 --filter @pico/companion --store-dir "$pnpm_store" \
    deploy --prod --frozen-lockfile "$stage")
  cp "$here"/stage/*.mjs "$here"/stage/*.cjs "$stage/"
  for file in "${stage_extra[@]}"; do cp "$file" "$stage/"; done
  tar -C "$repo/.pico-stage" -c --hard-dereference --owner=0 --group=0 --numeric-owner \
    --sort=name --mtime='2026-01-01 00:00Z' -f "$work/assets/stage.tar" app-stage
fi

# The repository's version, which `version:check` holds equal across the
# workspace and `release:monotonic` holds rising across tags. Android installs
# an update only over a smaller versionCode, so the code is derived from the
# same three numbers: it rises exactly when the version does.
version="$(node -p "require('$repo/package.json').version")"
IFS=. read -r v_major v_minor v_patch <<< "${version%%-*}"
version_code=$(( v_major * 1000000 + v_minor * 1000 + v_patch ))

echo "== APK $version ($version_code)"
(
  cd "$work"
  # Resources: the launcher icon and the colours generated from
  # pico.tokens.json. Compiled for every APK, because a manifest that does not
  # name them simply does not use them.
  "$bt/aapt2" compile --dir "$here/res" -o res.zip
  find src -name '*.java' > sources.txt
  "$javac_bin" --release 11 -classpath "$aj:$zxing" -d classes @sources.txt
  find classes -name '*.class' > classes.txt
  "$bt/d8" --lib "$aj" --output . @classes.txt "$zxing"
  if [ "$embed" = 1 ]; then
    "$bt/aapt2" link -o base.apk --manifest "$manifest" -I "$aj" -A assets -R res.zip \
      --auto-add-overlay --version-code "$version_code" --version-name "$version"
  else
    "$bt/aapt2" link -o base.apk --manifest "$manifest" -I "$aj" -R res.zip \
      --auto-add-overlay --version-code "$version_code" --version-name "$version"
  fi
  zip -q base.apk classes.dex
  zip -qX base.apk lib/arm64-v8a/*.so
  "$bt/zipalign" -f -p 4 base.apk aligned.apk
)

if [ -n "${PICO_APK_KEYSTORE:-}" ]; then
  [ -n "${PICO_APK_KEYSTORE_PASS:-}" ] || die "PICO_APK_KEYSTORE_PASS is not set"
  "$bt/apksigner" sign --ks "$PICO_APK_KEYSTORE" --ks-pass env:PICO_APK_KEYSTORE_PASS \
    --ks-key-alias "${PICO_APK_KEY_ALIAS:-pico}" --out "$out" "$work/aligned.apk"
elif [ "$release" = 1 ]; then
  die "--release needs PICO_APK_KEYSTORE; a release is never signed with a throwaway key"
else
  debug_ks="$cache/debug.keystore"
  [ -f "$debug_ks" ] || keytool -genkeypair -keystore "$debug_ks" -alias pico \
    -keyalg RSA -keysize 2048 -validity 365 -storepass picodebug -dname "CN=Pico debug" \
    > /dev/null 2>&1
  "$bt/apksigner" sign --ks "$debug_ks" --ks-pass pass:picodebug --out "$out" "$work/aligned.apk"
fi
"$bt/apksigner" verify "$out"
echo "== $out"
