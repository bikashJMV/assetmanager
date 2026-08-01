# /spec-tasks — Generate Implementation Plan + Freeze the Plan-Lock

You are a technical lead breaking a reviewed spec into a concrete, phase-gated plan **and freezing the
plan-lock** that unlocks the Code stage.

## Usage

`/spec-tasks <filename>` — no argument uses `SPEC.md` at repo root.

---

## Protocol

1. Load the spec file
2. Ensure `§R` (requirements) and `§T` (tasks) exist — generate `§T` if empty
3. Expand `§T` into a phase plan (OUTPUT FORMAT below); update the `§T` table in the spec
4. Save the expanded plan to `docs/specs/<filename>-tasks.md` (or the project's specs dir)
5. **Freeze the plan-lock** (below) — the gate that lets coding begin
6. Print the kick-off prompt

---

## Freeze the plan-lock (gated delivery)

Finalizing a plan **freezes a branch plan-lock** — the acceptance-criteria contract the edit gate
looks for before any source edit under `config.sourceRoots`. Without it, those edits are blocked
(best-effort, bypassable — see `.claude/README.md`).

1. Build a payload from §R and §T. Each criterion carries a **`verify` command** (not just prose),
   and `scope_paths` limits where edits may land:

   ```json
   {
     "track": "<track or feature>",
     "spec_ref": "docs/specs/<filename>.md",
     "acceptance_criteria": [
       { "id": "AC1", "text": "<observable, testable outcome>", "verify": "<command that proves it>" }
     ],
     "scope_paths": ["<glob>", "<glob>"]
   }
   ```

2. **Every criterion that produces an API response must assert the `{status, status_code, message, timestamp, data}`
   contract. Every criterion that produces a UI component must assert loading + error + empty states.**
   A criterion the review can't check against the DoD is not done — write it so it can be.
3. Write it: `echo '<payload>' | .claude/hooks/write-plan.sh set -` (writes `approved:false`).
4. **Present the criteria + scope to the human; they type `approve-plan` in chat.** The agent must not
   self-approve — `write-plan.sh approve` is refused. Hedged answers ("looks fine", "I guess") are not approval.
5. Only now may coding begin. Implement against the locked criteria; re-freeze before expanding scope.

| The excuse | The reality |
| --- | --- |
| "It's a one-line fix, skip the plan." | The edit gate blocks it anyway. A one-criterion freeze takes seconds. |
| "I'll approve my own plan and move on." | The edit gate needs `approved:true`, and approval is the human's, not the agent's. |

---

## Task Generation Rules

Every §R requirement maps to ≥1 §T task. Phase assignment:

- **Phase 1** — data models / core domain, no external deps
- **Phase 2** — service/API layer, internal interfaces
- **Phase 3** — consumer-facing layer (UI, webhooks, events), end-to-end
- Max 4 phases — if more are needed, split the spec.

---

## OUTPUT FORMAT

```markdown
# Implementation Plan: [Feature]
**Spec:** [path]   **Generated:** YYYY-MM-DD   **Status:** not started

## Phase 1 — [Name]
**Goal:** [one sentence]   **Gate:** all unit tests pass → Phase 2
| task | requirement | status |
| ---- | ----------- | ------ |
| T1   | R1          | todo   |

## Phase 2 — [Name]
**Goal:**   **Gate:** integration tests pass + Phase 1 gate still green
...
```

Then print a kick-off prompt: which phase to implement, the rule that tests land in the same pass, and
"stop and ask on any decision the spec doesn't cover."
