#!/usr/bin/env python3
# edit-gate.py — PreToolUse(Write|Edit)  [engine preserved; parametrized]
# Hard-blocks edits to SOURCE (config.sourceRoots x config.sourceExts) unless a human-APPROVED
# plan-lock exists for the current branch. Realises "the Code stage needs the Plan".
# Docs/config (.md/.json/.env.example) under the source roots edit freely; tests edit freely
# (config.testGlobs). Exit 2 = block. upstream parity: same gate, values now come from config.json.
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _lib as L  # noqa: E402

inp = L.read_input()
if L.tool_name(inp) not in ("Write", "Edit"):
    L.allow()

fp = L.tool_input(inp).get("file_path") or inp.get("file_path") or ""
if not fp:
    L.allow()
rel = L.rel(fp)

# Only gate real source/schema files under the configured source roots.
if not (L.under_source_root(rel) and L.has_source_ext(rel)):
    L.allow()
# Tests edit freely — writing a test should never require a plan-lock (verify-stop still requires
# tests committed before "done", so this stays consistent with that hook).
if L.is_test(rel):
    L.allow()

if L.env("GATE") == "off":
    L.log_bypass("edit-gate " + L.env_prefix() + "GATE=off " + rel)
    L.allow()

branch = L.branch()
plan = L.read_state("plan.json")
if plan and plan.get("branch") == branch and plan.get("approved") is True:
    L.allow()

if not plan:
    reason = "no plan-lock exists for this branch"
elif plan.get("branch") != branch:
    reason = "plan-lock is for branch " + str(plan.get("branch")) + ", not " + branch
else:
    reason = "a plan-lock exists but is not human-approved yet"

L.block(
    "EDIT GATE - blocked editing " + rel + "\n"
    "Reason: " + reason + ".\n"
    "Agree and FREEZE a plan before editing source: run /spec-tasks (or the loop pick step) to\n"
    "draft acceptance criteria + scope, then get explicit human approval (they type 'approve-plan').\n"
    "One-off bypass (logged): " + L.env_prefix() + "GATE=off\n"
)
