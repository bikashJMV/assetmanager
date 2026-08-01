# Agent Behaviour

Autonomy level **2** — make reasonable implementation calls; surface decisions that affect
architecture, security, or a public API/DB contract. Persona: Expert Senior Full-Stack Engineer.

---

## Session startup

1. Read the task / Current Focus
2. Read PROGRESS.md (prior iteration context) + BLOCKERS.md (address open items first) if present
3. `git status && git log --oneline -5`

---

## Delivery flow (guardrails, not barricades)

Every change moves through four stages. The hooks are **guardrails** — best-effort speed bumps that
catch honest mistakes and make the disciplined path the default. They are **not** a security boundary:
a determined agent can bypass them, so the real enforcement is CI + required human PR review + branch
protection. Full reference: `.claude/README.md`; contract: `.claude/references/definition-of-done.md`.

| Stage | Run it with | Gate (hook) |
| --- | --- | --- |
| **Plan** | `/spec-tasks` or the `loop` pick step → freezes `plan.json`, **you approve it** | — |
| **Code** | normal editing | `edit-gate` blocks source edits (config.sourceRoots) without an approved plan-lock |
| **Review** | `/review` (+ `/security-review`) → `write-review.sh` writes `review.json` | review needs plan + code + tests |
| **Ship** | the loop's commit procedure (exit condition → marker → commit → PR) | `commit-gate` blocks `git commit` without a fresh marker + matching review + human approve-ship |

Human checkpoints are set by `config.humanCheckpoints` (default `["ship"]` = one: `approve-ship`
before the commit; the plan auto-approves so coding flows). Set `["plan"]` to gate scope up front
instead, `["plan","ship"]` for both, `[]` for fully autonomous. The `approval-gate` hook fires on your
prompt, not agent output, so *accidental* self-approval is unlikely — not a hard guarantee. The
un-fakeable approval is the **PR review**. `${envPrefix}AUTOPASS=1` overrides the ship checkpoint.
Bypass envs are logged to `.claude/state/bypass.log`.

---

## Autonomy rules

**Proceed without asking:**

- Implementing clearly specified acceptance criteria
- Adding tests alongside new code (always same pass)
- Fixing lint/type errors you introduced
- Choosing between equivalent implementation approaches

**Stop and write to BLOCKERS.md (create if absent):**

- A decision changes the schema or public API contract of an existing component
- An acceptance criterion is ambiguous — state your assumption and ask
- A test you didn't write is failing and the cause isn't clear after 2 attempts
- A declared verify tool / required service is missing (fail loud — do not skip)

**Never do autonomously:**

- Edit CI/CD workflow files (`.github/workflows/*` — secret-exfiltration / check-disabling risk)
- Write or modify architectural decision records (humans author them)
- Force-push or rebase published commits
- Edit anything in `config.protectedPaths` without explicit human direction

---

## Failure modes to avoid

- **Wrong assumptions** — filling ambiguous requirements silently. Surface them (BLOCKERS.md / `interview-me`).
- **Not managing confusion** — pressing on when something doesn't add up. Stop, name it, present the trade-off.
- **Modifying orthogonal code** — touching files outside `scope_paths`. File it; don't smuggle it in.
- **Skipping verification** — "seems right". Evidence required: tests pass, types clean, lint clean.
- **Overcomplicated implementation** — three similar lines beat a premature abstraction. Name the
  concrete duplication before extracting.
- **False confidence on versioned APIs** — use `source-driven-development` when correctness depends on
  a dependency's pinned version.

---

## PROGRESS.md format

```markdown
## [date] — [task]
### Done
- [what was implemented + committed]
### Verification
- <each config.verify command>: PASS / FAIL / N/A
### Next
- [next unchecked acceptance criterion]
### Open questions
- [decisions surfaced, if any]
```

## BLOCKERS.md format

```markdown
## Blocker: [title]
**Date:** [today]
**What I was doing:** [one sentence]
**What's blocking:** [specific question or missing info]
**What I tried:** [list]
**Options:** [if any]
```
