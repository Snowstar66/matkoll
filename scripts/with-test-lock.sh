#!/bin/sh
# Runs a command while holding a lock shared by every git worktree of this repo.
# Integration and e2e tests share the local Supabase, Mailpit and port 3100, so
# stories built in parallel worktrees must run them one at a time:
#   scripts/with-test-lock.sh pnpm test:e2e
common_dir=$(cd "$(git rev-parse --git-common-dir)" && pwd) || exit 1
lock="$common_dir/matkoll-test.lock"

waited=0
until mkdir "$lock" 2>/dev/null; do
  holder=$(cat "$lock/pid" 2>/dev/null)
  # A lock whose holder has exited (crash, killed agent) is stale.
  if [ -n "$holder" ] && ! kill -0 "$holder" 2>/dev/null; then
    rm -rf "$lock"
    continue
  fi
  if [ "$waited" -eq 0 ]; then echo "Waiting for the test lock (held by pid ${holder:-?})..." >&2; fi
  waited=1
  sleep 5
done
echo $$ > "$lock/pid"
trap 'rm -rf "$lock"' EXIT
trap 'exit 130' INT TERM

"$@"
