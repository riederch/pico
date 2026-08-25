#!/usr/bin/env bash
# ADR 0131 A5 - carry the three codes between the phone and the sponsor.
#
# A person does this by looking at two screens. This does it over adb so the
# ceremony can be finished, and re-finished, on a phone that keeps leaving the
# USB bus. It reads what the phone shows and types what the sponsor answers -
# it never invents a code, and it never answers an approval: that tap is the
# one thing the ceremony is for.
set -euo pipefail

# Was dieses Skript NICHT tut, und warum das jedes Mal Zeit kostet, wenn man es
# vergisst: es tippt die Passphrase nicht. Der erste Schritt gehört einem
# Menschen, und wer ihn über `adb` nachstellt, läuft in drei Fallen, die alle
# gleich aussehen - "der Knopf reagiert nicht":
#
#   * Die Bildschirmtastatur verdeckt CONTINUE. Der Knopf ist da, der Tipp
#     landet auf der Tastatur. Position immer frisch aus dem UI-Dump lesen
#     statt aus einem früheren Lauf zu übernehmen; sie verschiebt sich, je
#     nachdem ob der Kompatibilitätsdialog vorher stand.
#   * `input keyevent KEYCODE_BACK`, um die Tastatur wegzubekommen, beendet
#     stattdessen die Activity. Der Dienst läuft weiter - `am start` holt sie
#     zurück, und `begin` zeigt wieder die offene Frage -, aber der Umweg
#     kostet einen Durchgang.
#   * `KEYCODE_ENTER` im Passphrasefeld schickt nicht ab.
#   * **Ein zweites CONTINUE zerstört das Angebot** (2026-08-25). Der Schirm,
#     der den Angebotscode zeigt, *ist* zugleich die Frage nach dem Grant:
#     ein Textfeld und derselbe Knopf darunter. Wer dort noch einmal tippt,
#     schickt eine leere Antwort ab; der Code wird gelöscht und kommt auch
#     durch einen Neustart der Activity nicht zurück, weil er nie irgendwo
#     anders stand. Nach der Passphrase also genau einmal CONTINUE - danach
#     übernimmt dieses Skript.
#
# Der Grant hat seine eigenen Fallen, und die stehen weiter unten an ihrer
# Stelle. Gemeinsam ist beiden: nach dem Tippen nachsehen, was auf dem Schirm
# steht, statt anzunehmen, dass es angekommen ist.
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

read_screen() { screen | python3 "$here/screen.py" "$@"; }

waitForCode() {
  for _ in $(seq 1 60); do
    value="$(read_screen code "$1")"
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
# The sponsor has to reach the Home and raise an approval first, which takes
# longer than it reads. Ten minutes of patience here, because the grant that
# follows is only good for four - see below.
for _ in $(seq 1 600); do
  [ -f "$inbox/grant.out" ] && break
  sleep 1
done
[ -f "$inbox/grant.out" ] || die "the sponsor wrote no grant"
grant="$(tr -d '\n' < "$inbox/grant.out")"
rm -f "$inbox/grant.out"

echo "== typing the grant on the phone"
# The field's own bounds, read off the screen. Guessing an offset from the
# button typed a long grant code into whatever happened to have focus once,
# and brought a calendar to the front.
read -r fx fy <<< "$(read_screen field)"
[ -n "${fx:-}" ] || die "the phone is showing no field to type into"
read -r bx by <<< "$(read_screen button CONTINUE)"
[ -n "${bx:-}" ] || die "the phone is showing nothing to press"
adb shell input tap "$fx" "$fy"
# In chunks, and checked. `input text` delivered 223 of 1127 characters in one
# call and said nothing about the rest; the ceremony then refused a grant that
# had been typed correctly by a machine that could not tell.
#
# Speed is not a nicety here: the grant carries a four-minute activation
# window, so a hand-off that stops to think has to be redone.
# Focus is re-taken before every chunk and the count checked after it. A
# field that loses focus mid-code sends the rest to whatever is behind it -
# on this phone that opened the dialer, with the ceremony none the wiser.
offset=0
while [ "$offset" -lt "${#grant}" ]; do
  adb shell input tap "$fx" "$fy"
  # To the end before typing: a tap puts the caret where the finger landed,
  # which is the middle of what is already there. Without this the chunks
  # interleave, the length comes out right, and the ceremony refuses a code
  # that looks complete - which is exactly what it did.
  adb shell input keyevent KEYCODE_MOVE_END
  adb shell input text "${grant:$offset:120}"
  offset=$((offset + 120))
  have="$(read_screen fieldlen)"
  [ "${have:-0}" -ge "$offset" ] || [ "$offset" -ge "${#grant}" ] \
    || die "the field holds $have characters after typing $offset; focus was lost"
done
typed="$(read_screen fieldlen)"
[ "$typed" = "${#grant}" ] \
  || die "the phone holds $typed characters of a ${#grant}-character grant; not submitting a half-typed code"
adb shell input tap "$bx" "$by"

echo "== reading the phone's acceptance"
acceptance="$(waitForCode 'pico-device-acceptance-v1:')" \
  || die "the phone showed no acceptance - look at it; an approval may be waiting for a tap"
printf '%s\n' "$acceptance" > "$inbox/acceptance.txt"
echo "   handed ${#acceptance} characters back"
echo "== watch the sponsor's log for the delegation, and the phone for what it says"
