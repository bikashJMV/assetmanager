#!/usr/bin/env python3
# lint-changed.py — PostToolUse(Write|Edit)  [conventions swapped; per-stack; replaces upstream ESLint node-e]
# Fast convention check on the file just written, keyed to the DETECTED stack so a Python-only repo
# sees zero React lint noise and a TS-only repo runs no Python tooling:
#   - Python file  + a Python project  -> ruff check + mypy --strict (each only if on PATH)
#   - TS/JS/Vue    + a frontend present -> dependency-free heuristic: ban `any`, ban `.then()`,
#                                          component line cap (config.conventions)
# Exit 2 surfaces findings to the agent. External linters run only when installed (a nudge, not the
# fail-loud gate — that is the SHIP verify pipeline).
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _lib as L  # noqa: E402

inp = L.read_input()
if L.tool_name(inp) not in ("Write", "Edit"):
    L.allow()
fp = L.tool_input(inp).get("file_path") or inp.get("file_path") or os.environ.get("CLAUDE_TOOL_INPUT_FILE_PATH") or ""
rel = L.rel(fp)
if not rel or L.is_test(rel):
    L.allow()

conv = L.cfg("conventions", {})


def run(tool_args: list) -> tuple:
    try:
        r = subprocess.run(tool_args, cwd=L.REPO, capture_output=True, encoding="utf-8", errors="replace")
        return r.returncode, (r.stdout or "") + (r.stderr or "")
    except Exception:
        return 0, ""


# ── Python branch ────────────────────────────────────────────────────────────
if rel.endswith(".py") and L.has_python():
    import shutil
    findings = []
    if shutil.which("ruff"):
        rc, out = run(["ruff", "check", fp])
        if rc != 0:
            findings.append("ruff:\n" + "\n".join(out.strip().split("\n")[:12]))
    if shutil.which("mypy"):
        rc, out = run(["mypy", "--strict", fp])
        if rc != 0:
            findings.append("mypy --strict:\n" + "\n".join(out.strip().split("\n")[:12]))
    if findings:
        L.block("CONVENTION CHECK (" + rel + ") - fix before continuing:\n" + "\n".join(findings) + "\n")
    L.allow()

# ── Frontend branch ──────────────────────────────────────────────────────────
if re.search(r"\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|vue)$", rel) and L.has_frontend():
    try:
        with open(fp, "r", encoding="utf-8") as f:
            lines = f.readlines()
    except Exception:
        L.allow()
    findings = []
    for n, line in enumerate(lines, 1):
        s = line.strip()
        if s.startswith("//") or s.startswith("*") or s.startswith("import ") or s.startswith("/*"):
            continue
        code = re.sub(r"//.*$", "", line)
        if conv.get("banAny", True) and re.search(r"(:\s*any\b|<any>|\bas\s+any\b|\bany\[\])", code):
            findings.append(f"  {rel}:{n}: `any` — use `unknown` + narrow, or a Zod-inferred type.")
        if conv.get("banThen", True) and re.search(r"\.then\s*\(", code):
            findings.append(f"  {rel}:{n}: `.then(` — use async/await instead.")
    max_lines = conv.get("maxComponentLines", 200)
    if max_lines and re.search(r"\.(tsx|jsx|vue)$", rel) and len(lines) > max_lines:
        findings.append(f"  {rel}: {len(lines)} lines (> {max_lines}) — split this component.")
    if findings:
        L.block("CONVENTION CHECK - fix before continuing:\n" + "\n".join(findings) + "\n")

L.allow()
