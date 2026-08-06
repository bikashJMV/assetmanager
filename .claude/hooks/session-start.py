#!/usr/bin/env python3
# session-start.py — SessionStart  [conventions swapped; pipeline parametrized from config]
# Injects the delivery-guardrail rules into context every session. Best-effort nudges, not an
# enforcement boundary (plain git + CI are unaffected). The verify pipeline + bypass env names are
# derived from config.json so this text is always correct for the repo it runs in.
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _lib as L  # noqa: E402

p = L.env_prefix()
verify = L.resolve_verify()
pipeline = " && ".join(e["cmd"] for e in verify) if verify else "(no stack detected — configure config.json verify)"
missing = [e for e in verify if not e["available"]]
cps = L.checkpoints()
prof = L.profile()
pr = L.pr_required()
if cps:
    cp_line = "Profile: " + prof + ". Human checkpoint(s): " + ", ".join(("approve-" + c) for c in cps) + " (type in chat; the agent cannot self-approve)."
else:
    cp_line = "Profile: " + prof + ". Human checkpoints: NONE (autonomous — the verify pipeline" + (" + CI + PR review" if pr else "") + " gate the work)."
ship_tail = (
    "Push + PR (paste plan-lock criteria into the body); monitor CI to green; never merge - human's action."
    if pr else
    "PR OPTIONAL (personal profile): commit lands on the feature branch; merge yourself once verify is green."
)

stacks = []
if L.has_python():
    stacks.append("Python")
if L.has_frontend():
    stacks.append("frontend/" + L.detect_pm())
stacks_str = ", ".join(stacks) if stacks else "empty repo"

print(f"""Loop delivery guardrails are ACTIVE for Claude Code in this repo (plain git + CI are unaffected).
Detected stack: {stacks_str}.
These are GUARDRAILS, not barricades - a best-effort speed bump that catches honest mistakes and makes
the disciplined path the default. They are NOT a security boundary (a determined agent can bypass them).
The real gate is CI + required human PR review + branch protection (enable in repo settings).

{cp_line}
Pipeline - the hooks nudge you to produce each stage's artifact before the next:
  PLAN  -> agent drafts acceptance criteria + scope (/spec-tasks or the loop pick step). Scope freezes
           for the edit gate. If 'plan' is a checkpoint the HUMAN types "approve-plan" to unlock edits;
           otherwise the plan auto-approves and coding proceeds.
  CODE  -> all edits + tests land first. No mid-review.
  REVIEW-> one /review at the end (+ /security-review if auth/db/routes/files/secrets). Writes review.json.
  SHIP  -> run the exit condition, write the marker. If 'ship' is a checkpoint the HUMAN types
           "approve-ship". Commit gate blocks `git commit` until marker + review (+ approval, if a
           checkpoint) all match the diff. Never raw commit. {ship_tail}

Exit condition (detected from config.json):
  {pipeline}
{("  FAIL-LOUD: declared verify tool(s) NOT on PATH -> " + ", ".join(e["tool"] + " (" + e["cmd"] + ")" for e in missing) + ". Install them or fix config.verify; never silent-skip a declared check.") if missing else ""}

Conventions enforced by this loop (see .claude/rules/): API contract {{status, status_code, message, timestamp, data}};
every UI component has loading + error + empty states; no `any`; async/await only (no `.then()`);
early returns; components <=200 lines. Frontend rules fire only if a frontend is present; API-contract
rule only if a Python API is present.

Best-effort blocks (documented bypass env, all logged to .claude/state/bypass.log):
  - edit source without a HUMAN-approved plan-lock                    ({p}GATE=off)
  - git commit without marker + matching review + human pass-approval ({p}BYPASS=1)
  - edit on a protected branch / config.protectedPaths / CI workflow  ({p}OFFLIMITS=ack / {p}ALLOW_PROTECTED=1)
  - rm -rf risky / DROP / --no-verify / push --force                  (no bypass)

Completion: when a unit is done, run .claude/hooks/mark-done.sh; the Stop hook then confirms the
pipeline actually finished (everything committed) before the session can end.{" Human pass-approval ('approve-ship') is required on every commit until the owner sets " + p + "AUTOPASS=1." if "ship" in cps else ""}

Source of truth: .claude/config.json (per-project surface), .claude/references/definition-of-done.md,
.claude/rules/, .claude/README.md.""")

# Surface working context if present.
repo = L.REPO
for f in ("BLOCKERS.md", "PROGRESS.md"):
    path = os.path.join(repo, f)
    if os.path.isfile(path):
        print()
        print("=== " + f + " (latest) ===")
        try:
            with open(path, "r", encoding="utf-8") as fh:
                lines = fh.read().split("\n")
            print("\n".join(lines[-40:]))
        except Exception:
            pass
