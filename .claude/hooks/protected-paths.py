#!/usr/bin/env python3
# protected-paths.py — PreToolUse(Write|Edit)  [engine preserved; parametrized]
# Hard-blocks edits the repo declares off-limits / human-owned:
#   - any edit while on a protected/integration branch (config.protectedBranches)
#   - secret .env files (.env, .env.local, .env.production, ...) — .env.example is allowed
#   - .github/workflows/* (CI/CD — secret-exfiltration / check-disabling risk)
#   - any extra human-owned glob in config.protectedPaths
# The .env + CI-workflow + branch guards are UNIVERSAL (always on, empty-repo safe); the upstream
# modules/*.ts + ADR specifics are gone — express those (if wanted) via config.protectedPaths.
# Exit 2 = block. Bypass (logged): ${prefix}OFFLIMITS=ack ; per-path ${prefix}ALLOW_PROTECTED=1.
import fnmatch
import os
import re
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
prefix = L.env_prefix()


def bypassed(env_name: str, expect: str) -> bool:
    on = L.env(env_name) == expect
    if on:
        L.log_bypass("protected-paths " + prefix + env_name + " " + rel)
    return on


def block(msg: str, bypass_env: str = ""):
    tail = ("Human-directed bypass (logged): " + prefix + bypass_env + "\n") if bypass_env else ""
    L.block("PROTECTED PATH - blocked editing " + rel + "\n" + msg + "\n" + tail)


# Integration branches
branch = L.branch()
if branch in L.cfg("protectedBranches", ["main", "master", "develop"]):
    block("'" + branch + "' is an integration branch. Create a feat/ fix/ chore/ docs/ test/ branch first.")

# Secret .env files (.env.example is an allowed checked-in template)
if (re.search(r"(^|/)\.env(\.|$)", rel) or re.search(r"\.env$", rel) or re.search(r"\.env\.[\w-]+$", rel)) \
        and not re.search(r"\.env\.example$", rel):
    block("Never write secret .env files (incl. .env.local/.env.production). Keep secrets out of the repo. (.env.example is allowed.)")

# CI/CD workflows
if re.search(r"^\.github/workflows/", rel):
    if not bypassed("OFFLIMITS", "ack"):
        block("CI/CD workflows are off-limits to autonomous edits (a workflow can exfiltrate secrets or disable required checks).", "OFFLIMITS=ack")
    L.allow()

# Extra human-owned globs from config
for glob in L.cfg("protectedPaths", []):
    if fnmatch.fnmatch(rel, glob) or fnmatch.fnmatch(rel, glob.rstrip("/") + "/*"):
        if not bypassed("ALLOW_PROTECTED", "1"):
            block("config.protectedPaths marks '" + glob + "' human-owned. Get explicit human direction before editing.", "ALLOW_PROTECTED=1")
        L.allow()

L.allow()
