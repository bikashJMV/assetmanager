#!/usr/bin/env python3
# write-review.py — helper for the REVIEW stage, run after /review (and /security-review).
# [engine preserved; test-detection parametrized via config.testGlobs]
# Refuses unless: an APPROVED plan-lock exists for the branch, the working diff is non-empty, and
# tests are present in the diff. Binds the review to the final `git diff HEAD`.
# Usage: write-review.sh <payload.json|-> [--allow-no-tests]
# Payload: verdict, findings_triaged{accepted,deferred,rejected}, dod_met, dod_unmet[], security_review
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _lib as L  # noqa: E402

argv = sys.argv[1:]
L.ensure_state_dir()
allow_no_tests = "--allow-no-tests" in argv
src = next((a for a in argv if not a.startswith("--")), "")
if not src:
    sys.stderr.write("usage: write-review.sh <payload.json|-> [--allow-no-tests]\n")
    sys.exit(1)

branch = L.branch()
plan = L.read_state("plan.json")
if not (plan and plan.get("branch") == branch and plan.get("approved") is True):
    sys.stderr.write("Cannot review: no APPROVED plan-lock for " + branch + ". Freeze + approve a plan first.\n")
    sys.exit(1)

diff = L.git("diff HEAD")
if not diff.strip():
    sys.stderr.write("Cannot review: git diff HEAD is empty - nothing to review.\n")
    sys.exit(1)

changed = [f for f in L.git("diff HEAD --name-only").split("\n") if f]
tests_present = any(L.is_test(L.rel(f)) for f in changed)
if not tests_present and not allow_no_tests:
    sys.stderr.write("Cannot review: no test files in the diff. Review needs plan+code+tests. Add tests, or pass --allow-no-tests for a genuinely test-exempt change (docs/config).\n")
    sys.exit(1)

raw = sys.stdin.read() if src == "-" else open(src, "r", encoding="utf-8").read()
try:
    p = json.loads(raw)
except Exception as e:
    sys.stderr.write("payload is not valid JSON: " + str(e) + "\n")
    sys.exit(1)

review = {
    "branch": branch,
    "reviewed_iso": L.now_iso(),
    "diff_sha": L.sha("diff HEAD"),  # identical hashing path to commit-gate (raw git bytes)
    "verdict": p.get("verdict", "pass"),
    "findings_triaged": p.get("findings_triaged", {"accepted": [], "deferred": [], "rejected": []}),
    "tests_present": tests_present,
    "dod_met": p.get("dod_met") is True,
    "dod_unmet": p.get("dod_unmet", []),
    "security_review": p.get("security_review", None),
}
L.write_state("review.json", review)
print("review written for " + branch + " (verdict=" + str(review["verdict"]) + ", tests=" + str(tests_present) + ", dod_met=" + str(review["dod_met"]) + "). Commit now - any further edit invalidates it.")
sys.exit(0)
