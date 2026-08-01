#!/usr/bin/env python3
# migration-reminder.py — PostToolUse(Write)  [engine preserved; gated on detection]
# Non-blocking nudge: when a new .sql migration is written AND the repo actually uses migrations
# (config.integrations.migrations, auto-detected from the migrations dir), remind to add isolation
# tests. Fires only if migrations are in play — silent in repos without them.
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _lib as L  # noqa: E402

inp = L.read_input()
fp = L.tool_input(inp).get("file_path") or inp.get("file_path") or os.environ.get("CLAUDE_TOOL_INPUT_FILE_PATH") or ""
rel = L.rel(fp)

if not L.integration("migrations"):
    L.allow()

mig = (L.cfg("integrations", {}).get("migrations") or {})
mig_dir = mig.get("dir", "migrations")
test_dir = mig.get("testDir", "tests/isolation")

if (mig_dir in rel or "/migrations/" in rel) and rel.endswith(".sql"):
    print(f"⚠️  New migration: add isolation tests in {test_dir}/ for any new tenant-scoped tables.")
L.allow()
