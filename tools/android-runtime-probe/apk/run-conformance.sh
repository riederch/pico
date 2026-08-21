#!/usr/bin/env bash
# ADR 0131 A1 - what the embedded runtime actually provides.
#
# A1 was called implemented on 937 fixture tests passing on the phone, under
# Termux's Node: full ICU, a real process, every module a desktop has. The
# product runs under nodejs-mobile, which has none of that, and the
# difference cost a day - `TextDecoder` with `fatal: true` throws
# `ERR_NO_ICU` there, so every enrolment code and every Recovery Card was
# refused as malformed by a runtime that could not read one.
#
# This asks the runtime directly, in about twenty seconds, and prints one
# line per fact. Planting that bug back makes it say so by name.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
pkg=com.pico.a1probe

[ "$(adb devices | sed -n '2p' | awk '{print $2}')" = "device" ] \
  || { echo "no adb device" >&2; exit 1; }

# The APK and stage the join runner builds are what this needs; building them
# twice differently would make two probes of two apps.
"$here/run-join.sh" > /dev/null

# The log is opened with "a" by the JNI shim, so it accumulates across runs -
# and this script polls for the word CONFORMANCE, which a *previous* run already
# put there. On 2026-08-21 that made it print an older block: a preserved run
# carrying the deliberately re-planted ICU bug, read as a current regression,
# with the new run's own answer not yet written. Its two siblings,
# `run-keystore-probe.sh` and `run-reachability-probe.sh`, already clear their
# log before starting; this one now does what they do.
adb shell "run-as $pkg sh -c 'rm -f files/conformance.log'"
adb shell am start-foreground-service -n "$pkg/.ConformanceService" > /dev/null
for _ in $(seq 1 30); do
  if adb shell "run-as $pkg sh -c 'grep -c CONFORMANCE files/conformance.log 2>/dev/null'" \
    | tr -d '\r' | grep -qv '^0$'; then
    break
  fi
  sleep 2
done
adb shell "run-as $pkg sh -c 'cat files/conformance.log'"
