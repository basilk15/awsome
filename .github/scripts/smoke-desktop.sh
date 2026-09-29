#!/usr/bin/env bash
set -euo pipefail

app_binary="${1:-awsome}"
smoke_log="$(mktemp)"
"$app_binary" >"$smoke_log" 2>&1 &
app_pid=$!
trap 'kill "$app_pid" 2>/dev/null || true; wait "$app_pid" 2>/dev/null || true; rm -f "$smoke_log"' EXIT

for _ in $(seq 1 30); do
  if ! kill -0 "$app_pid" 2>/dev/null; then
    cat "$smoke_log"
    echo "The desktop app exited before opening a window." >&2
    exit 1
  fi
  if xdotool search --all --onlyvisible --pid "$app_pid" --name '^awsome' >/dev/null 2>&1; then
    sleep 2
    if ! kill -0 "$app_pid" 2>/dev/null; then
      cat "$smoke_log"
      echo "The desktop app exited shortly after opening its window." >&2
      exit 1
    fi
    echo "The awsome desktop window opened."
    exit 0
  fi
  sleep 1
done

cat "$smoke_log"
echo "The desktop app did not open a visible window within 30 seconds." >&2
exit 1
