# Definition of Done

The verified-completion contract. The **Review** stage checks the diff against this list and records
the result in `.claude/state/review.json` (`dod_met` / `dod_unmet`); the **commit gate** refuses if
`dod_met` is false. "Compiles" and "seems right" are **not** done — evidence is.

A change is **done** only when every *applicable* box is true. Stack-conditional rows apply only when
that stack is present (frontend rows if a frontend exists; API rows if a Python API exists).

## Correctness (proof, not assertion)

- [ ] Behaves as intended, **verified at runtime** — not just typechecked or compiled.
- [ ] New behaviour is covered by a test that **fails without the change and passes with it**.
- [ ] Existing tests still pass; no regressions.
- [ ] Bug fixes include a reproduction test that failed before the fix.
- [ ] No skipped / `.only` / disabled / `xfail`-without-reason tests left behind.

## Scope (no creep)

- [ ] Changes are **scoped to the plan-lock's `acceptance_criteria` + `scope_paths`** — no unrelated
      refactors. Each criterion's `verify` command actually ran green before `done:true`.
- [ ] No dead code, debug logging (`print` / `console.log`), or commented-out blocks added.

## Conventions (the loop enforces these — see `.claude/rules/code-style.md`)

- [ ] **API contract** on every endpoint/handler response: `{ "status": bool, "status_code": int, "message": str, "timestamp": UTC-ISO, "data": any }` (+ `error{code,details}` on failure — see rules/api-standards.md).
- [ ] **No `any`** (TypeScript): `unknown` + narrowing, or a schema-inferred type. `any` blocks the review.
- [ ] **`async/await` only** — no `.then()` chains.
- [ ] **Early returns** over nested conditionals.
- [ ] Components/handlers ≤ **200 lines** — split past that.
- [ ] *(frontend)* Every UI component renders **loading + error + empty** states, not just the happy path.
- [ ] *(frontend)* React = function components + hooks · Vue = `<script setup>` · styling = Tailwind utilities only.
- [ ] *(Python API)* FastAPI route + **Pydantic v2** models validating input at the boundary; typed, no `# type: ignore` without an inline reason.

## Quality gate (the exit condition)

- [ ] The detected `config.verify` pipeline is **green** (Python: e.g. `ruff` + `mypy` + `pytest`;
      frontend: `<pm> run typecheck` + `lint` + `test`).
- [ ] **Fail loud, never silent-skip:** if a declared verify tool is missing or a required service
      (Docker, DB) is down, surface a blocker — do **not** mark the criterion done.

## Integration & docs

- [ ] Works with the whole system; migrations / config / feature-flags accounted for; backward-compat considered.
- [ ] User-facing changes noted where the project tracks them (CHANGELOG / release notes) if such a file exists.
- [ ] If an architectural decision was made, an ADR/decision note is **flagged as needed** (humans author it).

## Security (when the diff touches auth / db / routes / files / secrets)

- [ ] `/security-review` run; findings triaged. Input validated at every boundary; no secrets in code or logs;
      authorization checked on every protected path; rate limiting where relevant.

## Ship-readiness

- [ ] Rollback path exists for anything risky.
- [ ] *(org profile / 'ship' checkpoint)* **The human approved the pass** (`approve-ship` in chat)
      before commit — required until the owner sets `${envPrefix}AUTOPASS=1`.
- [ ] *(org profile / prRequired)* PR raised with the plan-lock criteria in the body; CI green.
      *(personal profile: verify pipeline green on the feature branch is sufficient.)*

---

### Anti-rationalization

| The excuse | The reality |
| --- | --- |
| "It typechecks, so it works." | DoD requires runtime-verified behaviour. Typecheck is necessary, not sufficient. |
| "The test passes immediately." | A test that passes without the change proves nothing. It must fail first. |
| "I'll add tests after." | The review gate needs tests in the diff. "After" = never. |
| "I'll just tidy this nearby code too." | Out of `scope_paths` = out of scope. File it; do not smuggle it into this commit. |
| "The verify tool isn't installed, skip it." | Fail loud. A skipped declared check is an unknown, not a pass. |
