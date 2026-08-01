#!/usr/bin/env python3
# approval-gate.py — UserPromptSubmit  [engine preserved verbatim — the human checkpoint]
# The ONLY path by which a human approval enters the system. It fires on the HUMAN's prompt, which
# the agent cannot emit (the agent produces tool calls + text, never a user prompt) — making
# ACCIDENTAL self-approval unlikely (not a hard guarantee; the un-fakeable approval is the PR review).
# Detects two directives:
#   approve-plan  -> stamps the branch plan-lock approved:true (unlocks source edits)
#   approve-ship  -> writes pass-approved bound to the current diff (unlocks the commit)
# Never blocks; only records approval. Stdout is surfaced to the session as confirmation.
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _lib as L  # noqa: E402

inp = L.read_input()
prompt = str(inp.get("prompt") or "")
L.ensure_state_dir()
out = []


def is_approve(kw: str) -> bool:
    # Fire only when the directive LEADS a line (optionally after a short affirmative) and is not
    # negated/questioned — so "what does approve-ship do?" / "do NOT approve-plan" do not approve.
    at_start = re.search(r"(?:^|\n)\s*(?:ok|yes|please|sure|go ahead|approved?)?[\s,:!.-]*" + kw + r"\b", prompt, re.I)
    negated = re.search(r"\b(?:not|never|no|why|what|how|explain|describe|cannot)\b[^\n]*" + kw, prompt, re.I)
    return bool(at_start) and not bool(negated)


if is_approve("approve-plan"):
    plan = L.read_state("plan.json")
    if not plan:
        out.append("[approval-gate] No plan-lock to approve - the agent must draft one (write-plan.sh set) first.")
    elif plan.get("branch") != L.branch():
        out.append("[approval-gate] Plan-lock is for " + str(plan.get("branch")) + ", not the current branch.")
    else:
        plan["approved"] = True
        plan["approved_iso"] = L.now_iso()
        plan["approved_by"] = "human:UserPromptSubmit"
        L.write_state("plan.json", plan)
        out.append("[approval-gate] PLAN APPROVED by human for " + str(plan.get("branch")) + " - source edits unlocked.")

if is_approve("approve-ship"):
    marker = L.read_state("ship-ready.json")
    staged = L.sha("diff --staged")
    if not marker or marker.get("staged_tree_sha") != staged:
        out.append("[approval-gate] Cannot record approve-ship: no ship marker for the current staged diff. Run the commit procedure (write-ship-marker.sh) first, then type 'approve-ship'.")
    else:
        L.write_state("pass-approved.json", {
            "branch": L.branch(),
            "diff_sha": L.sha("diff HEAD"),
            "approved_iso": L.now_iso(),
            "approved_by": "human:UserPromptSubmit",
        })
        out.append("[approval-gate] SHIP/PASS APPROVED by human for the current diff - the commit is unlocked while the diff is unchanged.")

if out:
    sys.stdout.write("\n".join(out) + "\n")
L.allow()
