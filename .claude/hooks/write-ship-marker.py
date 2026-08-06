#!/usr/bin/env python3
# write-ship-marker.py — helper for the SHIP step, run immediately before `git commit`.
# [engine preserved] Writes .claude/state/ship-ready.json bound to the current staged tree (valid 60m).
# staged_tree_sha uses the SAME hashing path as commit-gate (L.sha of raw `git diff --staged`).
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _lib as L  # noqa: E402

L.ensure_state_dir()
staged = L.git("diff --staged")
if not staged.strip():
    sys.stderr.write("Nothing staged - stage your changes before writing the ship marker.\n")
    sys.exit(1)

marker = {
    "branch": L.branch(),
    "staged_tree_sha": L.sha("diff --staged"),
    "head_sha": L.git("rev-parse HEAD").strip(),
    "timestamp_iso": L.now_iso(),
}
L.write_state("ship-ready.json", marker)
print("ship marker written for " + marker["branch"] + " (staged_sha=" + str(marker["staged_tree_sha"])[:12] + "...). Write this LAST, after the exit condition + review; commit now - valid 60 min.")
sys.exit(0)
