#!/usr/bin/env python3
# verify-stop.py — Stop  [engine preserved; parametrized]
# Backstop against a FALSE "done": acts only when a .claude/state/claimed-done sentinel exists
# (the agent asserted the unit is complete). It then does a CHEAP pipeline-completion check — is
# source still uncommitted? — over config.verifyDirtyPaths. It does NOT re-run typecheck/lint (the
# commit step already owns verification). No sentinel => normal pause => allow. Exit 2 = block stop.
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _lib as L  # noqa: E402

inp = L.read_input()
# Avoid re-entrancy loops: if this Stop is already a hook continuation, allow.
if inp.get("stop_hook_active") is True:
    L.allow()

if not os.path.exists(os.path.join(L.STATE, "claimed-done")):
    L.allow()

# Scope = product code (config.verifyDirtyPaths; empty/absent -> sourceRoots + tests). Only paths
# that actually exist are passed to git so an empty repo / missing dir never errors.
configured = L.cfg("verifyDirtyPaths", [])
if not configured:
    configured = list(L.cfg("sourceRoots", [])) + ["tests"]
paths = [p for p in configured if os.path.exists(os.path.join(L.REPO, p))]
dirty = L.git("status --porcelain -- " + " ".join(paths)).strip() if paths else ""

if not dirty:
    L.unlink_state("claimed-done")
    L.allow()

lines = "\n".join(dirty.split("\n")[:12])
L.block(
    "VERIFY-STOP - you claimed done, but the pipeline did not complete.\n"
    "Uncommitted source changes remain:\n" + lines + "\n"
    "Finish the commit procedure (all edits -> /review -> marker -> commit), or if you are\n"
    "intentionally pausing mid-work, clear the claim: rm .claude/state/claimed-done\n"
)
