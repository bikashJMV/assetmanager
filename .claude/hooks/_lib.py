"""
_lib.py — shared helpers for the loop-engine hooks (Python 3 port of the upstream node-e logic).

Every hook impl imports this. It provides: config loading (config.json is the ONLY per-project
surface), env-prefix indirection, git shell-outs, sha256 of git output, state-file read/write,
detection of package manager / stacks / optional integrations, and repo-relative path helpers.

Design goals: zero third-party deps (stdlib only), degrade gracefully when config.json or any path
is absent (empty-repo safe), never raise out of a helper (hooks must not crash the tool call).
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys

# ── Repo root ──────────────────────────────────────────────────────────────
# The .sh wrapper exports REPO; fall back to git, then CLAUDE_PROJECT_DIR, then cwd.
def _detect_repo() -> str:
    r = os.environ.get("REPO")
    if r:
        return r
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True, encoding="utf-8", errors="replace", check=True,
        ).stdout.strip()
        if out:
            return out
    except Exception:
        pass
    return os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()


REPO = _detect_repo()
CLAUDE = os.path.join(REPO, ".claude")
STATE = os.path.join(CLAUDE, "state")


# ── Config ─────────────────────────────────────────────────────────────────
def load_config() -> dict:
    """Load config.json. Missing file -> {} (empty-repo safe defaults). Present-but-malformed ->
    BLOCK LOUDLY (exit 2): a broken single-surface config must never silently degrade the gates."""
    path = os.path.join(CLAUDE, "config.json")
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        sys.stderr.write(
            "LOOP CONFIG ERROR - .claude/config.json is not valid JSON: " + str(e) + "\n"
            "It is the single per-project surface; the gates will not run correctly until it parses.\n"
            "Fix the JSON and retry. (Comment keys like \"$comment\" are fine; trailing commas/quotes are not.)\n"
        )
        sys.exit(2)


CONFIG = load_config()


def cfg(key: str, default):
    v = CONFIG.get(key)
    return default if v is None else v


def env_prefix() -> str:
    return cfg("envPrefix", "LOOP_")


def env(name: str):
    """Read a prefixed override env var, e.g. env('GATE') -> $LOOP_GATE."""
    return os.environ.get(env_prefix() + name)


def profile() -> str:
    """Delivery profile: 'org' (strict — ship checkpoint, PR flow) or 'personal' (light — no
    checkpoints, verify pipeline only, direct commit to a feature branch allowed)."""
    v = cfg("profile", "org")
    return v if v in ("org", "personal") else "org"


def checkpoints() -> list:
    """Stages requiring a human chat approval. Explicit humanCheckpoints wins; otherwise derived
    from the profile: org -> ['ship'], personal -> []."""
    v = CONFIG.get("humanCheckpoints")
    if v is None:
        return ["ship"] if profile() == "org" else []
    return v if isinstance(v, list) else [v]


def pr_required() -> bool:
    """Whether the ship stage must end in a PR (org) or a direct branch commit/merge is fine
    (personal). Explicit config.prRequired overrides the profile default."""
    v = CONFIG.get("prRequired")
    if v is None:
        return profile() == "org"
    return bool(v)


# ── Hook stdin ─────────────────────────────────────────────────────────────
def read_input() -> dict:
    try:
        return json.loads(sys.stdin.read() or "{}")
    except Exception:
        return {}


def tool_name(inp: dict) -> str:
    return inp.get("tool_name") or ""


def tool_input(inp: dict) -> dict:
    return inp.get("tool_input") or {}


# ── Git ────────────────────────────────────────────────────────────────────
def git(args: str) -> str:
    # UTF-8 decode with replacement — NEVER the platform default (Windows cp1252 raises on the
    # em-dashes / ✓ / emoji that legitimately appear in diffs, which would return None and crash callers).
    try:
        out = subprocess.run(
            "git " + args, shell=True, cwd=REPO, capture_output=True,
            encoding="utf-8", errors="replace",
        ).stdout
        return out or ""
    except Exception:
        return ""


def git_bytes(args: str) -> bytes:
    try:
        return subprocess.run(
            "git " + args, shell=True, cwd=REPO, capture_output=True
        ).stdout
    except Exception:
        return b""


def sha(args: str):
    """sha256 hex of `git <args>` stdout, or None on failure. Mirrors upstream."""
    try:
        return hashlib.sha256(git_bytes(args)).hexdigest()
    except Exception:
        return None


def branch() -> str:
    return git("rev-parse --abbrev-ref HEAD").strip()


def base_sha() -> str:
    for c in ("merge-base HEAD origin/main", "rev-parse main", "rev-parse HEAD"):
        out = git(c).strip()
        if out:
            return out
    return ""


# ── State files ────────────────────────────────────────────────────────────
def ensure_state_dir() -> None:
    try:
        os.makedirs(STATE, exist_ok=True)
    except Exception:
        pass


def read_state(name: str):
    try:
        with open(os.path.join(STATE, name), "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def write_state(name: str, obj: dict) -> None:
    ensure_state_dir()
    with open(os.path.join(STATE, name), "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2)


def unlink_state(name: str) -> None:
    try:
        os.unlink(os.path.join(STATE, name))
    except Exception:
        pass


def log_bypass(line: str) -> None:
    ensure_state_dir()
    try:
        from datetime import datetime, timezone
        stamp = datetime.now(timezone.utc).isoformat()
        with open(os.path.join(STATE, "bypass.log"), "a", encoding="utf-8") as f:
            f.write(stamp + " " + line + "\n")
    except Exception:
        pass


def now_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


def parse_iso_ms(s) -> float:
    """ISO-8601 string -> epoch milliseconds. Raises on bad input (caller guards)."""
    from datetime import datetime
    return datetime.fromisoformat(str(s).replace("Z", "+00:00")).timestamp() * 1000


# ── Paths ──────────────────────────────────────────────────────────────────
def rel(fp: str) -> str:
    """Repo-relative, forward-slashed path."""
    if not fp:
        return ""
    r = fp
    # normalise Windows backslashes so config globs (posix-style) match
    r = r.replace("\\", "/")
    repo_fwd = REPO.replace("\\", "/")
    if r.startswith(repo_fwd):
        r = r[len(repo_fwd):]
    return r.lstrip("/")


def is_test(relpath: str) -> bool:
    for pat in cfg("testGlobs", []):
        try:
            if re.search(pat, relpath):
                return True
        except re.error:
            continue
    return False


def under_source_root(relpath: str) -> bool:
    roots = cfg("sourceRoots", [])
    return any(relpath == r or relpath.startswith(r.rstrip("/") + "/") for r in roots)


def has_source_ext(relpath: str) -> bool:
    exts = cfg("sourceExts", [])
    m = re.search(r"\.([A-Za-z0-9]+)$", relpath)
    return bool(m and m.group(1).lower() in [e.lower() for e in exts])


# ── Detection (stack + integrations) ─────────────────────────────────────────
def _exists(*rels: str) -> bool:
    return any(os.path.exists(os.path.join(REPO, r)) for r in rels)


def _frontend_dirs() -> list[str]:
    """Dirs containing a package.json: repo root, conventional subdirs, and the first path
    component of each configured sourceRoot (so sourceRoots ["Client/src"] finds Client/)."""
    # sourceRoot-derived names first so the configured casing wins on case-insensitive filesystems
    cands: list[str] = []
    for root in cfg("sourceRoots", []):
        first = str(root).replace("\\", "/").split("/")[0]
        if first:
            cands.append(first)
    cands += ["", "frontend", "client", "web", "app"]
    seen: set[str] = set()
    out: list[str] = []
    for d in cands:
        key = d.lower()
        if key in seen:
            continue
        seen.add(key)
        if os.path.exists(os.path.join(REPO, d, "package.json")):
            out.append(d)
    return out


def detect_pm() -> str:
    pm = cfg("packageManager", "auto")
    if pm != "auto":
        return pm
    dirs = _frontend_dirs() or [""]

    def probe(name: str) -> bool:
        return any(os.path.exists(os.path.join(REPO, d, name)) for d in dirs)

    if probe("pnpm-lock.yaml"):
        return "pnpm"
    if probe("yarn.lock"):
        return "yarn"
    if probe("bun.lockb"):
        return "bun"
    return "npm"


def has_python() -> bool:
    if _exists("requirements.txt", "pyproject.toml", "setup.py"):
        return True
    # any .py under a source root?
    for root in cfg("sourceRoots", []):
        base = os.path.join(REPO, root)
        for _dp, _dn, fns in os.walk(base):
            if any(fn.endswith(".py") for fn in fns):
                return True
            break  # shallow — one level is enough of a signal
    return False


def has_frontend() -> bool:
    return bool(_frontend_dirs())


def integration(name: str) -> bool:
    integ = cfg("integrations", {})
    val = integ.get(name)
    if name == "migrations":
        val = (integ.get("migrations") or {}).get("enabled", "auto")
        if val != "auto":
            return bool(val)
        mig_dir = (integ.get("migrations") or {}).get("dir", "")
        return bool(mig_dir) and _exists(mig_dir)
    if val is not True and val is not False:  # "auto"
        if name == "docker":
            return _exists("docker-compose.yml", "compose.yaml", "compose.yml", "docker-compose.yaml")
        if name == "husky":
            return _exists(".husky")
        if name == "codeowners":
            return _exists(".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS")
        return False
    return bool(val)


def _tool_of(cmd: str) -> str:
    """First real token of a command (the executable to probe on PATH)."""
    import shlex
    try:
        parts = shlex.split(cmd)
    except Exception:
        parts = cmd.split()
    return parts[0] if parts else ""


def _on_path(tool: str) -> bool:
    import shutil
    return bool(tool) and shutil.which(tool) is not None


def resolve_verify() -> list[dict]:
    """Detect + declare. Returns the exit-condition commands for DETECTED stacks only, in run order
    (python then frontend), with the frontend package-manager substituted from the detected PM.
    Each entry: {cmd, tool, available}. `available` lets callers FAIL LOUD on a declared-but-missing
    tool instead of silently skipping it. Absent stacks contribute nothing (not a failure)."""
    v = cfg("verify", {})
    out: list[dict] = []
    if has_python():
        for c in v.get("python", []):
            out.append({"cmd": c, "tool": _tool_of(c)})
    if has_frontend():
        pm = detect_pm()
        fdir = _frontend_dirs()[0]
        for c in v.get("frontend", []):
            cc = c if pm == "npm" else c.replace("npm ", pm + " ", 1)
            tool = _tool_of(cc)
            # package.json lives in a subdir (e.g. Client/): run from there, in a subshell so
            # chained commands don't compound the cd
            if fdir:
                cc = "(cd " + fdir + " && " + cc + ")"
            out.append({"cmd": cc, "tool": tool})
    for e in out:
        e["available"] = _on_path(e["tool"])
    return out


def verify_commands() -> list[str]:
    """Just the command strings for detected stacks (convenience over resolve_verify)."""
    return [e["cmd"] for e in resolve_verify()]


# ── Exit helpers ─────────────────────────────────────────────────────────────
def block(msg: str, code: int = 2):
    sys.stderr.write(msg)
    sys.exit(code)


def allow():
    sys.exit(0)
