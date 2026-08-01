# Git Conventions

## Branch naming

```
feat/<short-slug>        fix/<short-slug>        chore/<short-slug>
docs/<short-slug>        test/<short-slug>       refactor/<short-slug>
```

Never work on a `config.protectedBranches` branch (default `main`/`master`/`develop`) — the
protected-paths hook blocks source edits there. Branch off first.

## Commit messages (Conventional Commits)

```
feat(api): add search relevance endpoint
fix(chat): release send-lock on stream timeout
test(retrieval): cover empty-result path
chore(deps): bump fastapi to 0.11x
docs(readme): document verify pipeline
```

Scope = the package/area changed. Subject lowercase, imperative, describes the effect not the mechanism.
Never `--no-verify` / `-n` (destructive-guard blocks it) — fix the failing hook instead.

## Staging

Stage **explicitly** — never `git add -A`. The commit gate requires the reviewed tree (`git diff HEAD`)
to equal the committed tree (`git diff --staged`), so forgotten/partial staging is caught.

## Parallel agent worktrees

Multiple agents against this repo simultaneously → one git worktree each (state files aren't locked):

```bash
git worktree add ../agent-<name> <branch>     # create
git worktree list                             # inspect
git worktree remove ../agent-<name>           # clean up
```

Each agent reads/writes only its worktree; all write status to PROGRESS.md in the main worktree.

## PR checklist

- [ ] Tests included (coverage does not drop)
- [ ] Acceptance criteria from the plan-lock pasted into the PR body (the frozen contract)
- [ ] No `any` (TS) / no `.then()` chains introduced
- [ ] API responses use the `{status, status_code, message, timestamp, data}` contract
- [ ] UI components have loading + error + empty states (frontend changes)
- [ ] `/security-review` passed if the PR touches auth, routes, db, file access, or secrets
- [ ] CI green before requesting review — never merge yourself
