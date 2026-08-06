---
paths: ["**/*.test.*", "**/*.spec.*", "**/tests/**", "**/test_*.py", "**/*_test.py", "**/conftest.py"]
---

# Testing Conventions

Stack-conditional. The runner is the project's own — `pytest` for Python, the frontend's configured
runner (Vitest/Jest) for JS/TS. The `config.testGlobs` patterns define what the loop counts as a test
(the review gate requires ≥1 test file in the diff).

## Coverage

Every change that adds or alters behaviour ships tests in the same diff. "I'll add tests after" =
never — the review gate needs them present.

## Naming — behaviour, not implementation

Describe the observable outcome, not the call:

```
# good
it("returns 404 when the record belongs to another user")
def test_stream_releases_lock_on_timeout(): ...

# bad
it("calls db.update")
def test_calls_helper(): ...
```

## Prove-It pattern (every bug fix)

```
1. Write a test reproducing the exact failure — it MUST fail on current code
2. Fix the bug
3. Confirm the test now passes
4. Commit test + fix together
```

Never fix a bug without a failing test first. "It seems fixed" is not evidence.

## Test doubles

Prefer, in order: **real implementation → test database (fresh schema) → fake → stub → mock**.
Mock at *service boundaries* (HTTP, external APIs, email) — **not** the database. Mocked-DB tests that
pass while the real query/migration fails are a known production-incident pattern.

## Isolation & state

Each suite starts from clean state and tears down after; tests never share mutable state or ordering.
If the project scopes data per user/account/tenant, the suite must attempt cross-scope access via each
public surface and assert it is blocked.

## Sizing

One logical concern per test file. Past ~200 lines, split it. A change adding more than one new test
suite is a hint the implementation unit is too large.
