#!/usr/bin/env python3
# destructive-guard.py — PreToolUse(Bash)  [engine preserved — generic, no per-project values]
# A GUARDRAIL, not a barricade. Blocks common destructive command forms so honest mistakes are
# stopped early: rm -rf on risky paths, mass-delete tools, DROP/TRUNCATE outside a migration,
# git commit --no-verify, git push --force. Best-effort by nature (a determined agent can bypass
# via wrapper scripts / variable indirection). Exit 2 = block.
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _lib as L  # noqa: E402

inp = L.read_input()
if L.tool_name(inp) != "Bash":
    L.allow()
raw = L.tool_input(inp).get("command") or ""
cmd = re.sub(r"['\"]", " ", raw)  # strip quotes so "/", "$HOME" etc cannot hide a target


def block(msg: str):
    L.block("DESTRUCTIVE GUARD - blocked.\n" + msg + "\nIf this is genuinely required, run it yourself in a plain terminal.\n")


# rm with BOTH recursive and force, targeting a risky path or a glob
rm_recursive = re.search(r"\brm\b[^|;&]*(?:\s-[A-Za-z]*r[A-Za-z]*\b|\s--recursive\b)", cmd)
rm_force = re.search(r"\brm\b[^|;&]*(?:\s-[A-Za-z]*f[A-Za-z]*\b|\s--force\b)", cmd)
if rm_recursive and rm_force:
    if (re.search(r"\brm\s+[^\n]*\s(\/|~|\$HOME|\.git\b|\*|\.\.(\/|\s|$)|\s\.\s|\s\.$)", cmd)
            or re.search(r"\brm\s+-[a-zA-Z]*\s+(\/|~|\.|\*)\s*$", cmd)
            or re.search(r"\brm\s[^|;&]*\s\.\/(\*|\s|$)", cmd)):
        block("rm -rf targeting a risky path (root, home, repo root, .git, cwd, or a bare glob).")

# Other irreversible mass-delete tools
if re.search(r"\bfind\b[^|;&]*\s-delete\b", cmd):
    block("find -delete (mass delete).")
if re.search(r"\btruncate\b[^|;&]*\s-s\s*0\b", cmd):
    block("truncate -s 0 (destroys file contents).")
if re.search(r"\bshred\b", cmd):
    block("shred (irreversible destroy).")

# SQL destructive (allow inside a migration file / .sql)
if re.search(r"\bDROP\s+DATABASE\b", cmd, re.I):
    block("DROP DATABASE.")
if re.search(r"\b(DROP\s+TABLE|TRUNCATE\s+TABLE)\b", cmd, re.I) and not re.search(r"migration|\.sql\b", cmd, re.I):
    block("DROP TABLE / TRUNCATE TABLE outside a migration file.")

# git history / verify hazards. Strip quoted spans (commit message is data) so -n/--no-verify is
# matched only as a real flag wherever it sits relative to -m.
no_str = re.sub(r'"[^"]*"', " ", raw)
no_str = re.sub(r"'[^']*'", " ", no_str)
if re.search(r"\bgit\s+commit\b[^|;&]*(--no-verify|\s-[A-Za-z]*n[A-Za-z]*\b)", no_str):
    block("git commit --no-verify (incl. combined short flags like -anm) bypasses pre-commit/commit-msg hooks. Fix the issue instead.")
if re.search(r"\bgit\s+push\b[^|;&]*(--force\b|--force-with-lease\b|\s-f\b|\s\+[A-Za-z0-9._/@^~-]+(:[A-Za-z0-9._/@^~-]+)?)", cmd):
    block("git push force-update (--force / -f / --force-with-lease / +refspec) can overwrite published history.")

L.allow()
