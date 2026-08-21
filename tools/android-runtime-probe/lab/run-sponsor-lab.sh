#!/usr/bin/env bash
# ADR 0131 A5 - the sponsor a joining phone needs.
#
# Stages the companion the same way the phone's side is staged, then runs the
# lab from there: this script's neighbour lives outside every workspace
# package, so it borrows one rather than pretending to be one.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../../.." && pwd)"
work="${PICO_LAB_WORK:-${TMPDIR:-/tmp}/pico-sponsor-lab}"

(cd "$repo" && npx pnpm@9.0.0 --filter @pico/core --filter @pico/vault-daemon --filter @pico/companion run build)
rm -rf "$work"
# The same store every other command in this repository uses; without it pnpm
# resolves a cache directory of its own and can land somewhere unwritable.
(cd "$repo" && npx pnpm@9.0.0 --filter @pico/companion --store-dir /tmp/pico-pnpm-store \
  deploy --prod --frozen-lockfile "$work")
cp "$here/sponsor-lab.mjs" "$work/"
# `exec`, und deshalb steht das Aufräumen nicht hier. Nach dem `exec` gibt es
# keine Shell mehr, die ein `trap` ausführen könnte - der Node-Prozess *ist*
# von da an dieses Skript. Wer hier ein `trap` einhängt, hängt es an eine Shell,
# die es nie erlebt.
PICO_LAB_REPO="$repo" exec node "$work/sponsor-lab.mjs"
