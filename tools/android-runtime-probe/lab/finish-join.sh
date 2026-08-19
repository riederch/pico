#!/usr/bin/env bash
# ADR 0131 A5 - carry the three codes between the phone and the sponsor.
#
# A person does this by looking at two screens. This does it over adb so the
# ceremony can be finished, and re-finished, on a phone that keeps leaving the
# USB bus. It reads what the phone shows and types what the sponsor answers -
# it never invents a code, and it never answers an approval: that tap is the
# one thing the ceremony is for.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../../.." && pwd)"
pkg=com.pico.a1probe
lab="$repo/.pico-stage/lab.json"

die() { echo "$*" >&2; exit 1; }
[ -f "$lab" ] || die "no lab is running (missing $lab)"
[ "$(adb devices | sed -n '2p' | awk '{print $2}')" = "device" ] || die "no adb device"

port="$(python3 -c "import json,sys; print(json.load(open('$lab'))['intakePort'])")"
inbox="$(python3 -c "import json,sys; print(json.load(open('$lab'))['inbox'])")"

# The bridge dies with the USB connection; re-establishing it is the first
# thing, because the grant the phone is about to read carries this address.
adb reverse "tcp:$port" "tcp:$port" > /dev/null
echo "== bridge back on port $port"

screen() {
  adb shell uiautomator dump /sdcard/ui.xml > /dev/null 2>&1
  adb shell cat /sdcard/ui.xml 2>/dev/null
}

codeOnScreen() {
  screen | python3 -c "
import sys, re
xml = sys.stdin.read()
found = re.search(r'text=\"($1[^\"]+)\"', xml)
print(found.group(1) if found else '')
"
}

tapLabelled() {
  screen | python3 -c "
import sys, re
xml = sys.stdin.read()
for node in re.finditer(r'<node[^>]*>', xml):
    text = re.search(r'text=\"([^\"]*)\"', node.group(0))
    bounds = re.search(r'bounds=\"\[(\d+),(\d+)\]\[(\d+),(\d+)\]\"', node.group(0))
    if text and bounds and text.group(1).strip().upper() == '$1'.upper():
        print((int(bounds.group(1))+int(bounds.group(3)))//2,
              (int(bounds.group(2))+int(bounds.group(4)))//2)
        break
"
}

waitForCode() {
  for _ in $(seq 1 60); do
    value="$(codeOnScreen "$1")"
    [ -n "$value" ] && { printf '%s' "$value"; return 0; }
    sleep 2
  done
  return 1
}

echo "== reading the phone's offer"
offer="$(waitForCode 'pico-device-offer-v1:')" || die "the phone is not showing an offer"
printf '%s\n' "$offer" > "$inbox/offer.txt"
echo "   handed ${#offer} characters to the sponsor"

echo "== waiting for the grant"
for _ in $(seq 1 120); do
  [ -f "$inbox/grant.out" ] && break
  sleep 1
done
[ -f "$inbox/grant.out" ] || die "the sponsor wrote no grant"
grant="$(tr -d '\n' < "$inbox/grant.out")"
rm -f "$inbox/grant.out"

echo "== typing the grant on the phone"
read -r x y <<< "$(tapLabelled 'CONTINUE')"
[ -n "${x:-}" ] || die "the phone is not asking for anything"
# The field sits above the button; tapping the button's own row would submit.
adb shell input tap "$x" "$((y - 130))"
adb shell input text "$grant"
adb shell input tap "$x" "$y"

echo "== reading the phone's acceptance"
acceptance="$(waitForCode 'pico-device-acceptance-v1:')" \
  || die "the phone showed no acceptance - look at it; an approval may be waiting for a tap"
printf '%s\n' "$acceptance" > "$inbox/acceptance.txt"
echo "   handed ${#acceptance} characters back"
echo "== watch the sponsor's log for the delegation, and the phone for what it says"
