# `.claude/` — portable delivery-loop guardrails

Configures **Claude Code** for this repo: rules, prompt scaffolds, skills, and **hooks that guide a
disciplined delivery flow** (Plan → Code → Review → Ship). Installed from the **loop-kit** template
repo (`init.ps1` / `init.sh`); update by re-running init from a newer kit. Every project-specific
value lives in `.claude/config.json` — kit files are shared machinery, don't edit them per-project.

## Profiles

`config.profile` sizes the process to the project:

- **`org`** (strict) — human `approve-ship` checkpoint before every commit; ship ends in a PR with the
  plan-lock criteria in the body; CI monitored to green; never self-merge.
- **`personal`** (light) — no human checkpoints; the green verify pipeline is the pass; PR optional —
  commit to a feature branch and merge yourself.

Explicit `humanCheckpoints` / `prRequired` in config override the profile defaults. The plan-lock,
edit gate, review record, ship marker, and destructive-guard apply in **both** profiles — the profile
changes who approves and whether a PR is required, not the discipline.

## Per-project layer (yours, tracked in this repo's git)

- `config.json` — the only config surface
- `context/*.md` — domain architecture docs Claude should read (engines, schemas, invariants)
- `prompts/*.md` — project scaffolds (add your own: new-route, new-channel, new-asset-type, …)
- `settings.local.json`, `state/` — machine-local, gitignored

> ### Guardrails, not barricades
>
> The hooks make the disciplined path the easy default and catch **honest mistakes** early — fast local
> feedback before CI. They are **not a security boundary.** A determined agent can bypass them (write
> state files directly, edit via `Bash` instead of the Write tool, wrap `git` in a script the
> per-command hooks don't parse). The real enforcement lives outside these scripts: **CI**, and — to
> make human approval un-fakeable — **branch protection + required PR review** (enable in repo
> settings). Treat the hooks as a seatbelt, CI as the floor.

> **Not using Claude Code? Unaffected.** Every hook fires only inside a Claude Code session. Plain
> `git` and CI are untouched.

## Delivery flow

```
 PLAN ─────────► CODE ─────────► REVIEW ─────────► SHIP
 freeze+approve   all edits +     one /review at    verify pipeline, marker,
 acceptance       tests first     the end (+        commit, structured PR
 criteria         (no mid-review) /security-review)
      │                │                │                  │
  plan.json       EDIT GATE        REVIEW GATE        COMMIT GATE
  (approved)      needs approved   needs plan+code+   needs fresh marker +
                  plan.json        tests → review.json review matching diff +
                                                      human approve-ship
```

Human checkpoints are **configurable** via `config.humanCheckpoints` (default `["ship"]` = one
checkpoint). They fire through the `approval-gate` hook on **your** chat message, not agent output, so
accidental self-approval is unlikely (not a hard guarantee — the un-fakeable gate is the PR review):

- **`approve-ship`** (default) — the agent drafts + auto-approves the plan (scope still freezes for
  the edit gate) and codes autonomously; the commit gate stays blocked until you type `approve-ship`
  and it matches the exact diff. `${envPrefix}AUTOPASS=1` also overrides it at runtime.
- **`approve-plan`** (set `humanCheckpoints:["plan"]`) — you approve scope up front to unlock edits;
  the ship auto-passes.
- `["plan","ship"]` = both (strictest) · `[]` = fully autonomous (CI + PR review are the only gates).

## Hooks

Bash wrappers (`*.sh`) keep the invocation surface Claude Code matches on byte-identical; the logic is
**Python 3** (`*.py` + shared `_lib.py`) — chosen over shell because the gates parse `plan.json` /
`review.json` / diff SHAs, and sh/grep parsing breaks on nesting (false passes). Each wrapper probes
for a working interpreter (`python3` → `python` → `py -3`, skipping a broken Windows Store shim); if
none is found it exits 0 (guardrail, not barricade). If `config.json` exists but is malformed, the
hooks **block loudly** rather than silently degrade.

| Hook | Event / matcher | What it does | Block? | Bypass (logged) |
| --- | --- | --- | --- | --- |
| `edit-gate` | PreToolUse `Write\|Edit` | no source edits (config.sourceRoots × sourceExts) without an **approved** `plan.json` | hard | `${envPrefix}GATE=off` |
| `commit-gate` | PreToolUse `Bash` | no `git commit` without a fresh marker + review matching the diff + human `approve-ship` | hard | `${envPrefix}BYPASS=1` |
| `protected-paths` | PreToolUse `Write\|Edit` | blocks integration branches, `.env` secrets, `.github/workflows/*`, `config.protectedPaths` | hard | `${envPrefix}OFFLIMITS=ack`, `${envPrefix}ALLOW_PROTECTED=1` |
| `destructive-guard` | PreToolUse `Bash` | blocks `rm -rf` on risky paths, `DROP`/`TRUNCATE`, `--no-verify`, `push --force` | default | — (run it yourself) |
| `verify-stop` | Stop | if a `claimed-done` sentinel exists, blocks a **false** "done" while source is uncommitted | conditional | clear the sentinel |
| `lint-changed` | PostToolUse `Write\|Edit` | per-stack: Python → `ruff`+`mypy --strict`; frontend → ban `any` / `.then()` / oversized component | soft (surfaces) | — |
| `migration-reminder` | PostToolUse `Write` | reminds to add scoping tests on a new `.sql` migration (only if the repo uses migrations) | — | — |
| `ship-cleanup` | PostToolUse `Bash` | after a commit lands, deletes marker + sentinel + pass-approval (one-shot) | — | — |
| `session-start` | SessionStart | injects the rules + the detected verify pipeline; flags declared-but-missing verify tools | — | — |
| `approval-gate` | UserPromptSubmit | the human-only `approve-plan` / `approve-ship` path | — | — |
| helpers | — | `write-plan` · `write-review` · `write-ship-marker` · `mark-done` | — | — |

## `config.json` — the only per-project edit surface

Everything project-specific funnels here: `envPrefix`, `packageManager` (auto-detected), `sourceRoots`,
`sourceExts`, `testGlobs`, `protectedPaths`, `protectedBranches`, `verify.{python,frontend}` (frontend
commands derive from the detected package manager — never hardcoded `npm`), `verifyDirtyPaths`,
`integrations.{docker,husky,codeowners,migrations}` (each fires only when detected), and
`conventions.{apiContract,uiStates,banAny,banThen,maxComponentLines}`. Empty-repo safe: `sourceRoots: []`
means the edit gate never fires. Verification is **detect + declare** — a declared tool that's missing
**fails loud**, never silent-skips.

## State (`.claude/state/`, gitignored)

Per-branch / per-session, never committed: `plan.json`, `review.json`, `ship-ready.json`,
`pass-approved.json`, `claimed-done`, `bypass.log`. Because `plan.json` is gitignored, the commit step
copies its acceptance criteria into the **PR body** so reviewers see the frozen contract.

## Conventions enforced (see `rules/`)

API contract `{status, status_code, message, timestamp, data}` · every UI component has loading/error/empty states ·
no TS `any` · `async/await` only (no `.then()`) · early returns · components ≤200 lines · TS strict ·
React 18 hooks · Vue 3 `<script setup>` · Tailwind utilities only · FastAPI + Pydantic v2. Rules are
**stack-conditional** — frontend rules fire only with a frontend; API rules only with a Python API.

## Known limitations

State files are not locked — concurrent sessions on one branch can produce confusing stale-marker
errors; use separate worktrees. The commit-gate parses the Bash command string, so a `git commit`
inside a wrapper script bypasses it silently (mitigated by edit-gate + the bypass audit log).
