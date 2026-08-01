# Skill: source-driven-development

Ground every framework-specific decision in official versioned documentation.
Training data goes stale. APIs get deprecated. Best practices evolve.

---

## When to use

Invoke `/sourced` when:

- Implementing a pattern for a dependency you haven't used recently in this project
- The user requests a "correct" or "current" implementation
- Correctness depends on the pinned versions of your project's dependencies
- You are about to wire up an external service integration

Skip for pure logic, variable renaming, or when the user explicitly prioritises speed.

---

## Process

### 1. DETECT — read the dependency file

```
read the project's dependency manifest and list its dependencies and dev dependencies
```

Note the **exact version** of the package in question. A pattern that is correct for
one major version may be wrong for the next.

### 2. FETCH — retrieve official documentation

Sources in priority order:

1. Official docs site for that package + version
2. Official changelog / migration guide for the version in use
3. Web standards bodies (MDN, web.dev) for platform APIs
4. Official source repository README or `/docs` directory

**Not authoritative:** Stack Overflow, blog posts, AI-generated docs, training data.

Use WebFetch to retrieve the relevant page. If the page is versioned, find the version
matching the project's pinned dependency version.

### 3. IMPLEMENT — follow the documented pattern

Implement exactly what the current version's docs show.
If the docs show a different pattern than what is currently in the codebase, surface
the conflict — do not silently pick one.

### 4. CITE — reference the source

For every non-trivial framework-specific decision, include in your response:

- The URL of the documentation page consulted
- The relevant quote or code sample

---

## Verifying against official docs

For each framework-specific dependency, verify against the pinned version's official
documentation site (and its changelog / migration guide). Prefer the official docs URL
over any third-party source, and match the docs version to the version pinned in the
project's dependency manifest.

---

## Flag, don't guess

If you cannot find official documentation for a pattern:

> "I could not find official documentation for [X] in [package] [version].
> This is unverified. Proceed with review?"

Never deliver unverified framework-specific patterns with false confidence.
