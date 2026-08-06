#!/usr/bin/env python3
# write-plan.py — helper for the PLAN stage (/spec-tasks or the loop pick step). [engine preserved]
# Usage:
#   write-plan.sh set <payload.json|->   # write plan-lock (approved:false) from a payload
#   write-plan.sh approve                # REFUSED — approval is human-only via 'approve-plan'
# Payload fields: track, spec_ref, adr_refs[], acceptance_criteria[{id,text,verify}], scope_paths[]
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _lib as L  # noqa: E402

argv = sys.argv[1:]
mode = argv[0] if argv else ""
L.ensure_state_dir()

if mode == "approve":
    sys.stderr.write(
        "Plan approval is HUMAN-ONLY and cannot be performed by the agent. The human types "
        "\"approve-plan\" in chat; the approval-gate (UserPromptSubmit) hook stamps approved:true. "
        "Use write-plan.sh set to draft or redraft the plan.\n"
    )
    sys.exit(1)

if mode == "set":
    src = argv[1] if len(argv) > 1 else ""
    if not src:
        sys.stderr.write("usage: write-plan.sh set <payload.json|->\n")
        sys.exit(1)
    raw = sys.stdin.read() if src == "-" else open(src, "r", encoding="utf-8").read()
    try:
        p = json.loads(raw)
    except Exception as e:
        sys.stderr.write("payload is not valid JSON: " + str(e) + "\n")
        sys.exit(1)
    ac = []
    for i, c in enumerate(p.get("acceptance_criteria", [])):
        if isinstance(c, dict):
            ac.append({"id": c.get("id") or ("AC" + str(i + 1)), "text": c.get("text") or "", "verify": c.get("verify"), "done": False})
        else:
            ac.append({"id": "AC" + str(i + 1), "text": str(c), "verify": None, "done": False})
    plan = {
        "branch": L.branch(),
        "created_iso": L.now_iso(),
        "base_sha": L.base_sha(),
        "track": p.get("track"),
        "spec_ref": p.get("spec_ref"),
        "adr_refs": p.get("adr_refs", []),
        "approved": False,
        "approved_iso": None,
        "acceptance_criteria": ac,
        "scope_paths": p.get("scope_paths", []),
    }
    # If 'plan' is not a human checkpoint (config.humanCheckpoints), auto-approve so the agent flows
    # into coding without a sign-off — the scope still freezes for the edit gate; the human touch has
    # moved to 'ship'. If 'plan' IS a checkpoint, leave approved:false for the human 'approve-plan'.
    if "plan" not in L.checkpoints():
        plan["approved"] = True
        plan["approved_iso"] = L.now_iso()
        plan["approved_by"] = "auto:plan-not-a-checkpoint"
    L.write_state("plan.json", plan)
    if plan["approved"]:
        print("plan-lock FROZEN + auto-approved for " + plan["branch"] + " (plan is not a human checkpoint; the human gate is at ship). Source edits unlocked; code against the frozen scope.")
    else:
        print("plan-lock DRAFTED (approved:false) for " + plan["branch"] + ". Present the criteria to the human; they type \"approve-plan\" in chat to approve (the agent must not self-approve).")
    sys.exit(0)

sys.stderr.write("usage: write-plan.sh set <payload.json|-> | write-plan.sh approve\n")
sys.exit(1)
