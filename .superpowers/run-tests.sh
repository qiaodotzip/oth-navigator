#!/usr/bin/env bash
# One test run at a time across the worktree (the laptop crashed at 16:12 with
# several parallel runs). Usage, from the worktree root:
#   bash .superpowers/run-tests.sh vitest packages/editor/src/build packages/editor/src/flow
#   bash .superpowers/run-tests.sh tsc packages/server
# mkdir is atomic, so only one caller holds the lock. A lock older than 12
# minutes is treated as left behind by a crashed run and taken over.
set -u
LOCK=".superpowers/test.lock"
kind="${1:-}"; shift || true
waited=0
until mkdir "$LOCK" 2>/dev/null; do
  if [ -f "$LOCK/since" ] && [ $(( $(date +%s) - $(cat "$LOCK/since") )) -gt 720 ]; then
    echo "run-tests: taking over a lock older than 12 minutes"; rm -rf "$LOCK"; continue
  fi
  if [ "$waited" -ge 1200 ]; then echo "run-tests: waited 20 minutes for the lock; giving up"; exit 3; fi
  sleep 15; waited=$((waited + 15))
done
date +%s > "$LOCK/since"
trap 'rm -rf "$LOCK"' EXIT
[ "$waited" -gt 0 ] && echo "run-tests: waited ${waited}s for another run"
case "$kind" in
  vitest) timeout 600 npx vitest run "$@" --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1 ;;
  tsc)    for p in "$@"; do timeout 300 npx tsc -p "$p" --noEmit || exit $?; done ;;
  *) echo "usage: run-tests.sh vitest <paths…> | tsc <package dirs…>"; exit 2 ;;
esac
