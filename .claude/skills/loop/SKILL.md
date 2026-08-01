# Skill: loop

Portable PLAN→CODE→REVIEW→SHIP delivery loop. Encodes the two-pass procedure, the config-driven
verification commands, and the gate-respecting commit procedure. Every project-specific value comes
from `.claude/config.json` — this skill is repo-agnostic.

## When to use

When handed a task to implement, or when a `Current Focus` / task list describes work to deliver.
Persona: **Expert Senior Full-Stack Engineer** — high-density, 0% filler, name the winner, no hedging.

---

## Loop procedure (two-pass: Writer → Verifier)

Each iteration is two separate invocations with no shared context. The separation is the point: the
Verifier must not trust the Writer's narrative.

### Pass 1 — Writer

```
1. Read the task / Current Focus + any PROGRESS.md, BLOCKERS.md (absent on first run)
2. git status + git log --oneline -5
3. Pick the first unchecked acceptance criterion
4. FREEZE THE PLAN-LOCK — build a payload from the chosen criterion (each carries a `verify` command
   + `scope_paths`), run:  echo '<payload>' | .claude/hooks/write-plan.sh set -
   This freezes scope for the edit gate. With the default `config.humanCheckpoints:["ship"]` the plan
   AUTO-APPROVES and coding proceeds. If 'plan' is a checkpoint instead, present the criteria and ask
   the human to type `approve-plan` in chat (the agent must not self-approve) — edits stay blocked until then.
5. Do ONE unit of work — all edits + tests first. Frontend components ship loading+error+empty
   states; every API response uses the {status, status_code, message, timestamp, data} contract (see code-style).
6. Write what was done + what's next to PROGRESS.md
7. Stop — do NOT run verification here; do NOT run `git commit` (use the commit procedure below)
```

### Pass 2 — Verifier

```
1. Read PROGRESS.md
2. Run ALL exit-condition commands independently (config.verify, detected stacks) — do not trust
   the Writer's description
3. Output exactly one of: LOOP_DONE | LOOP_FAIL | LOOP_BLOCKED (with reason)
```

**Verifier rules**

- `LOOP_DONE` only if the full exit condition passes AND every acceptance criterion is checked.
- `LOOP_FAIL` if commands ran but failed — the Writer gets another iteration.
- `LOOP_BLOCKED` if checks cannot run (missing declared verify tool, service down, missing env) —
  include the exact blocker. **Never silent-skip a declared check; a skip is a BLOCKED, not a DONE.**
- The Verifier may not pass on description alone — it must run the commands.
- **Stop-hook backstop:** when the Writer asserts a unit complete in an autonomous run it writes
  `.claude/state/claimed-done` (via `mark-done.sh`); the Stop hook blocks the session from ending if
  source is still uncommitted. Clear the sentinel to pause mid-work intentionally.

---

## Exit condition (verification commands)

Run after every unit of work. Commands are **detected from `config.verify`** — session-start prints
the resolved pipeline. Typical shapes:

```bash
# Python project (config.verify.python)
ruff check .        # lint
mypy app            # types (add scripts/ if you type them; lint covers scripts either way)
pytest -q           # tests

# Frontend (config.verify.frontend, package manager auto-substituted)
<pm> run typecheck
<pm> run lint
<pm> test
```

All detected checks must be green before marking a criterion complete. If a declared tool is missing,
**fail loud** (LOOP_BLOCKED) — do not skip it.

---

## Commit procedure (the SHIP stage — never a bare `git commit`)

The commit gate blocks a bare `git commit` in the common path (best-effort; bypassable via subshell
or `${envPrefix}BYPASS=1`). Once a unit is complete, run this — the canonical way *any* change, even a
one-liner, gets committed:

```
1. All edits + tests are in. No mid-review — review happens once, at the end.
2. Run the exit condition (config.verify). Block on any red.
3. /review  (+ /security-review if the diff touches auth/db/routes/files/secrets). Triage findings;
   apply ACCEPTED. Check the diff against .claude/references/definition-of-done.md.
4. Record the review:  echo '<payload>' | .claude/hooks/write-review.sh -
   (refuses unless an approved plan-lock exists, the diff is non-empty, and tests are present).
   Payload: verdict, dod_met, dod_unmet, findings_triaged, security_review.
5. If 'ship' is a checkpoint (org-profile default), present the pass; the human types `approve-ship`
   in chat (the agent must not self-approve). The commit gate stays blocked until that approval matches
   the diff. Personal profile: no checkpoint — the green verify pipeline IS the pass.
6. Stage explicitly (never `git add -A`).
7. .claude/hooks/write-ship-marker.sh  — write the marker LAST, after the exit condition + review, so
   its 60-min window covers only stage→commit. Then `git commit` (Conventional Commits, lowercase subject).
8. Org profile / prRequired: push, open a PR — paste the plan-lock acceptance criteria into the PR body
   (the frozen contract). Monitor CI to green — part of raising the PR, not optional. Fix failures on
   the same branch. Never merge — that is the human's action.
   Personal profile: the commit lands on the feature branch; PR optional. Merge yourself once verify
   (and CI, if the repo has workflows) is green.
```

| The excuse | The reality |
| --- | --- |
| "I'll review while I edit." | Mid-review is wasted tokens on code that will change. Edits first, one review at the end. |
| "Tests pass, ship it." | Org profile: the pass is the human's call until `${envPrefix}AUTOPASS=1`. Present it. |
| "Bare `git commit` is faster." | The commit gate blocks it. Run the procedure; the marker unlocks the commit. |
| "PR is open, I'm done." | Raising a PR includes watching CI to green. Open + red ≠ done. |

---

## Parallel worktrees

More than one agent against this repo simultaneously → each needs its own git worktree (state files
are not locked; sharing a branch causes confusing stale-marker errors):

```bash
git worktree add ../agent-<name> <branch>
```

Each agent reads/writes only its worktree; all write status to PROGRESS.md in the main worktree.

---

## What to avoid

- Editing source without an approved plan-lock (the edit gate blocks it — freeze first).
- `any` (TS) · `.then()` chains · `process.env`/direct-env reads outside the config module.
- UI components without loading/error/empty states.
- Marking a criterion done on "seems right" — evidence required.
- Premature abstraction — three similar lines beat a wrong abstraction. Name the concrete duplication
  before extracting.
