#!/usr/bin/env python3
# commit-gate.py — PreToolUse(Bash)  [engine preserved; env-prefix parametrized]
# Hard-blocks `git commit` unless ALL are fresh for this branch:
#   - ship-ready.json   (staged_tree_sha matches `git diff --staged`, age <= 60m)
#   - review.json       (diff_sha matches `git diff HEAD` — review covers the committed code; dod_met)
#   - pass-approved.json (human typed 'approve-ship', bound to the current diff) unless ${p}AUTOPASS=1
# Realises "the Ship stage needs a passing Review + marker + human pass-approval". Exit 2 = block.
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _lib as L  # noqa: E402

inp = L.read_input()
if L.tool_name(inp) != "Bash":
    L.allow()
cmd = L.tool_input(inp).get("command") or ""
prefix = L.env_prefix()

_GIT_SUB = re.compile(r"\bgit\b((?:\s+(?:-C\s+\S+|-c\s+\S+|--[\w-]+(?:=\S+)?|-[A-Za-z]+))*)\s+([a-z][a-z-]*)")


def git_sub(c: str, sub: str) -> bool:
    return any(m.group(2) == sub for m in _GIT_SUB.finditer(c))


# Strip QUOTED SPANS (their content is data: commit messages, grep patterns) before detecting a
# real subcommand — so `grep "git commit"` / `echo "...git commit..."` are not treated as commits.
no_str = re.sub(r'"[^"]*"', " ", cmd)
no_str = re.sub(r"'[^']*'", " ", no_str)
if not git_sub(no_str, "commit"):
    L.allow()
if re.search(r"--help\b|\s-h\b|--version\b", cmd):
    L.allow()

# Bypass: env, or inline `${p}BYPASS=1 [VAR=v ...] git ...`
inline_bypass = re.search(r"(?:^|[;&|]|\s)" + re.escape(prefix) + r"BYPASS=1\s+(?:[A-Za-z_]\w*=\S+\s+)*git\b", cmd)
if L.env("BYPASS") == "1" or inline_bypass:
    L.log_bypass("commit-gate " + prefix + "BYPASS=1 " + cmd[:200])
    L.allow()

branch = L.branch()
fails = []

# Marker
marker = L.read_state("ship-ready.json")
if not marker:
    fails.append("no ship marker (run the commit procedure: it writes the marker right before commit)")
elif marker.get("branch") != branch:
    fails.append("ship marker is for branch " + str(marker.get("branch")))
else:
    try:
        age_min = (time.time() * 1000 - L.parse_iso_ms(marker.get("timestamp_iso"))) / 60000
    except Exception:
        age_min = 9999
    if not (age_min <= 60):
        fails.append("ship marker is " + str(round(age_min)) + " min old (>60); re-run the commit procedure")
    elif marker.get("staged_tree_sha") != L.sha("diff --staged"):
        fails.append("staged tree changed since the marker was written; re-stage and re-run the commit procedure")

# Everything must be staged: reviewed tree (diff HEAD) must equal committed tree (diff --staged).
if L.sha("diff HEAD") != L.sha("diff --staged"):
    fails.append("unstaged changes present - stage or stash them so the review covers exactly what is committed")

# Review
review = L.read_state("review.json")
if not review:
    fails.append("no review record (run /review before committing)")
elif review.get("branch") != branch:
    fails.append("review is for branch " + str(review.get("branch")))
elif review.get("diff_sha") != L.sha("diff HEAD"):
    fails.append("code changed since the last review; re-run /review against the final diff")
elif review.get("dod_met") is not True:
    fails.append("Definition-of-Done not affirmatively met (dod_met must be true): " + ", ".join(review.get("dod_unmet") or []))

# Human pass-approval — only approval-gate (a human typing 'approve-ship') writes pass-approved.json.
# Required only when 'ship' is a configured checkpoint; skipped when the owner set AUTOPASS=1.
if "ship" in L.checkpoints() and L.env("AUTOPASS") != "1":
    pa = L.read_state("pass-approved.json")
    if not pa:
        fails.append("no human pass-approval - a human must type 'approve-ship' in chat (or the owner sets " + prefix + "AUTOPASS=1)")
    elif pa.get("branch") != branch:
        fails.append("pass-approval is for branch " + str(pa.get("branch")))
    elif pa.get("diff_sha") != L.sha("diff HEAD"):
        fails.append("code changed since the human approved the pass; ask for 'approve-ship' again")

if not fails:
    L.allow()

L.block(
    "COMMIT GATE - blocked git commit on " + branch + "\n- " + "\n- ".join(fails) + "\n"
    "Complete the pipeline: finish all edits -> /review (writes review.json) -> write-ship-marker.sh -> commit.\n"
    "Bootstrap/hotfix bypass (logged): " + prefix + "BYPASS=1 git commit ...\n"
)
