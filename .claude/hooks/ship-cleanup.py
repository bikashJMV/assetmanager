#!/usr/bin/env python3
# ship-cleanup.py — PostToolUse(Bash)  [engine preserved verbatim]
# One-shot: after a `git commit` verifiably lands, delete the ship marker (so it can never be
# reused for a second commit), the claimed-done sentinel, and the pass-approval. If there is no
# marker (e.g. the bypass path writes none) or HEAD is unchanged (commit rejected by a pre-commit
# hook), leave claimed-done in place for verify-stop to catch a false "done".
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _lib as L  # noqa: E402

inp = L.read_input()
if L.tool_name(inp) != "Bash":
    L.allow()
cmd = L.tool_input(inp).get("command") or ""

import re
_GIT_SUB = re.compile(r"\bgit\b((?:\s+(?:-C\s+\S+|-c\s+\S+|--[\w-]+(?:=\S+)?|-[A-Za-z]+))*)\s+([a-z][a-z-]*)")
no_str = re.sub(r'"[^"]*"', " ", cmd)
no_str = re.sub(r"'[^']*'", " ", no_str)
if not any(m.group(2) == "commit" for m in _GIT_SUB.finditer(no_str)):
    L.allow()

marker = L.read_state("ship-ready.json")
head = L.git("rev-parse HEAD").strip()
committed = bool(marker and marker.get("head_sha") and head and head != marker.get("head_sha"))
if committed:
    for f in ("ship-ready.json", "claimed-done", "pass-approved.json"):
        L.unlink_state(f)
L.allow()
