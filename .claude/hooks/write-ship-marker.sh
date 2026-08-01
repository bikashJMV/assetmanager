#!/usr/bin/env bash
# write-ship-marker.sh — helper (Ship stage)
# Entry wrapper (verbatim invocation surface). Logic lives in write-ship-marker.py (Python 3 port of the
# upstream gate). We exec Python so the impl reads the hook JSON on real stdin.
# Interpreter probe is VALIDATED (runs 'import sys') so a broken Windows Store 'python' shim,
# which exits nonzero without a real interpreter, is skipped in favour of a working one.
REPO="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")}"
export REPO
DIR="$(cd "$(dirname "$0")" && pwd)"
PY=""
for c in python3 python; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c "import sys" >/dev/null 2>&1; then PY="$c"; break; fi
done
if [ -z "$PY" ] && command -v py >/dev/null 2>&1 && py -3 -c "import sys" >/dev/null 2>&1; then PY="py -3"; fi
if [ -z "$PY" ]; then mkdir -p "$REPO/.claude/state" 2>/dev/null; echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) write-ship-marker SKIPPED: no working python3 on PATH (fail-visible)" >> "$REPO/.claude/state/bypass.log" 2>/dev/null; echo "write-ship-marker: no working python3 on PATH; hook skipped + logged to .claude/state/bypass.log" >&2; exit 0; fi
exec $PY "$DIR/write-ship-marker.py" "$@"
