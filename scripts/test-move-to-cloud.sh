#!/usr/bin/env bash
# Manual two-stack test of `pnpm move:cloud` (Story 17.4). Starts two throwaway
# local Supabase stacks (project ids matkoll-move-src / matkoll-move-dst, ports
# 56320-56329 and 56330-56339), applies the migrations to both, seeds a fixture
# user in the source, moves it, checks counts, deep equality, idempotency,
# --dry-run, the safety refusals and RLS, then removes both stacks (containers and
# volumes). It never touches your normal local stack and no cloud account.
#
#   scripts/test-move-to-cloud.sh [--keep]     # --keep leaves the stacks running
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/move-cloud-test.XXXXXX")"
KEEP=0
[[ "${1:-}" == "--keep" ]] && KEEP=1

# name base-port
STACKS=("src 56320" "dst 56330")

make_stack() {
  local name="$1" base="$2" dir="$WORK/$1"
  mkdir -p "$dir/supabase"
  cp -R "$ROOT/supabase/migrations" "$ROOT/supabase/templates" "$dir/supabase/"
  # Rewrite project id and every port; switch off services the test does not need.
  awk -v id="matkoll-move-$name" -v b="$base" '
    /^project_id *=/ { print "project_id = \"" id "\""; next }
    /^\[/ { section=$0 }
    /^port *=/ {
      if (section=="[api]") p=0; else if (section=="[db]") p=1; else if (section=="[db.pooler]") p=3;
      else if (section=="[studio]") p=4; else if (section=="[local_smtp]") p=5; else if (section=="[analytics]") p=7; else p=-1;
      if (p>=0) { print "port = " (b+p); next }
    }
    /^shadow_port *=/ { print "shadow_port = " (b+2); next }
    /^inspector_port *=/ { print "inspector_port = " (b+6); next }
    /^enabled *=/ && (section=="[studio]" || section=="[analytics]" || section=="[edge_runtime]" || section=="[local_smtp]" || section=="[db.seed]" || section=="[storage.analytics]" || section=="[storage.vector]") { print "enabled = false"; next }
    { print }
  ' "$ROOT/supabase/config.toml" > "$dir/supabase/config.toml"
}

stop_all() {
  for s in "${STACKS[@]}"; do
    set -- $s
    [[ -d "$WORK/$1/supabase" ]] && (cd "$WORK/$1" && supabase stop --no-backup >/dev/null 2>&1 || true)
  done
  # Belt and braces: remove leftover containers and volumes of the two projects.
  for id in matkoll-move-src matkoll-move-dst; do
    docker ps -aq --filter "label=com.supabase.cli.project=$id" | xargs -r docker rm -f >/dev/null 2>&1 || true
    docker volume ls -q --filter "label=com.supabase.cli.project=$id" | xargs -r docker volume rm -f >/dev/null 2>&1 || true
    docker network ls -q --filter "label=com.supabase.cli.project=$id" | xargs -r docker network rm >/dev/null 2>&1 || true
  done
}
cleanup() {
  if [[ $KEEP -eq 0 ]]; then stop_all; rm -rf "$WORK"; else echo "Stacks kept; work dir $WORK"; fi
}
trap cleanup EXIT

for s in "${STACKS[@]}"; do set -- $s; make_stack "$1" "$2"; done

for s in "${STACKS[@]}"; do
  set -- $s
  echo "== starting stack $1 (ports from $2)"
  (cd "$WORK/$1" && supabase start >/dev/null)
done

# Read URL and service key per stack (kept in this shell only, never printed).
status_val() { (cd "$WORK/$1" && supabase status -o env 2>/dev/null | sed -n "s/^$2=\"\{0,1\}\([^\"]*\)\"\{0,1\}$/\1/p"); }
export SRC_URL="$(status_val src API_URL)" SRC_KEY="$(status_val src SERVICE_ROLE_KEY)" SRC_DB="$(status_val src DB_URL)" SRC_ANON="$(status_val src ANON_KEY)"
export DST_URL="$(status_val dst API_URL)" DST_KEY="$(status_val dst SERVICE_ROLE_KEY)" DST_DB="$(status_val dst DB_URL)" DST_ANON="$(status_val dst ANON_KEY)"

cd "$ROOT"
node scripts/move-to-cloud/e2e-test.ts
echo "== all checks passed"
