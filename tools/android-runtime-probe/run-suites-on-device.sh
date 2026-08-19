#!/usr/bin/env bash
# ADR 0131 A1 - the existing fixture suites, on whatever Android device adb
# sees. Assumes run-on-device.sh has run once (Termux debug build + Node).
#
# What runs and what deliberately does not: every client-side package's suite
# runs whole. `claim-ceremony.test.ts` (vault-daemon) and the
# `link-relay-client` suite boot @pico/core and the relay - servers backed by
# better-sqlite3, which never runs on a phone - so they stay host-side, named
# here rather than silently skipped.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
work="${PICO_SUITE_WORK:-$HOME/.cache}"
stage="$work/pico-a1-stage"

die() { echo "$*" >&2; exit 1; }
[ "$(adb devices | sed -n '2p' | awk '{print $2}')" = "device" ] \
  || die "no adb device is connected and authorised"

echo "== staging the workspace (worktree + both architectures)"
if [ ! -d "$stage" ]; then
  git -C "$repo" worktree add "$stage" HEAD
fi
python3 - "$stage" <<'PY'
import json, sys
from pathlib import Path
p = Path(sys.argv[1]) / 'package.json'
d = json.loads(p.read_text())
d.setdefault('pnpm', {})['supportedArchitectures'] = {
    'os': ['linux', 'android'], 'cpu': ['x64', 'arm64'],
}
p.write_text(json.dumps(d, indent=2) + '\n')
PY
(cd "$stage" && npx pnpm@9.0.0 install --store-dir /tmp/pico-pnpm-store && npx pnpm@9.0.0 run build)

echo "== pushing"
tar -C "$work" -c --hard-dereference -f "$work/pico-a1-stage.tar" \
  --exclude='pico-a1-stage/.git' pico-a1-stage
cat > "$work/pico-probe-env.sh" <<'ENV'
#!/system/bin/sh
PREFIX=/data/data/com.termux/files/usr
HOME=/data/data/com.termux/files/home
PATH=$PREFIX/bin:$PATH
LD_LIBRARY_PATH=$PREFIX/lib
TMPDIR=$PREFIX/tmp
export PREFIX HOME PATH LD_LIBRARY_PATH TMPDIR
exec "$@"
ENV
adb push "$work/pico-probe-env.sh" /data/local/tmp/pico-probe-env.sh > /dev/null
adb push "$work/pico-a1-stage.tar" /data/local/tmp/pico-a1-stage.tar
termux() { adb shell "run-as com.termux sh /data/local/tmp/pico-probe-env.sh $*"; }
termux "sh -c 'cd \$HOME && rm -rf pico-a1-stage && /system/bin/tar -xf /data/local/tmp/pico-a1-stage.tar'"

run_suite() {
  local pkg="$1"; shift
  echo "== $pkg"
  termux "sh -c 'cd \$HOME/pico-a1-stage/$pkg && ../../node_modules/.bin/vitest run --minWorkers=1 --maxWorkers=2 $* 2>&1 | grep -E \"Test Files|Tests |FAIL\" | head -8'"
}

run_suite packages/protocol
run_suite packages/identity
run_suite packages/vault
run_suite packages/sync
run_suite apps/companion
run_suite apps/vault-daemon "--exclude \\\"**/claim-ceremony.test.ts\\\""
