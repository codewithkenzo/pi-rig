#!/usr/bin/env bash
set -euo pipefail

SESSION_NAME="${1:-plan-relay}"
TELEGRAM_TARGET="${2:-${TELEGRAM_NOTIFY_TARGET:-${PLAN_RELAY_TELEGRAM_TARGET:-}}}"
SOURCE="${PLAN_RELAY_SOURCE:-codex}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v tmux >/dev/null 2>&1; then
  echo "tmux not found" >&2
  exit 1
fi

if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  echo "tmux session already running: $SESSION_NAME"
  exit 0
fi

cd "$ROOT_DIR"
bun run plan:watch:seed >/dev/null
cmd="cd $ROOT_DIR && bun run plan:watch -- --source $SOURCE --attach-file"
if [ -n "$TELEGRAM_TARGET" ]; then
  cmd="$cmd --telegram-target $TELEGRAM_TARGET"
else
  echo "warning: no telegram target set (pass as 2nd arg or TELEGRAM_NOTIFY_TARGET/PLAN_RELAY_TELEGRAM_TARGET)." >&2
fi
tmux new -d -s "$SESSION_NAME" "$cmd"
echo "started tmux session: $SESSION_NAME"
echo "attach with: tmux attach -t $SESSION_NAME"
