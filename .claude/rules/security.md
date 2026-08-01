---
paths: ["**/auth/**", "**/api/**", "**/routes/**", "**/middleware/**", "**/files/**", "**/secrets/**"]
---

# Security Rules

Non-negotiable, reviewed in every PR touching these paths. `/security-review` is mandatory for any
diff touching auth, new routes/tables, file access, or secrets.

1. **Validate all external input at the boundary** before using it — API bodies, query params,
   webhook payloads, uploaded file metadata. Use the project's schema validator (Pydantic v2 / Zod).

2. **Never construct SQL (or any query language) from user input.** Parameterised queries only.

3. **Authorization on every protected path.** Check the caller may act on *this* resource, not just
   that they are authenticated. Where data is scoped to a user/account, filter by that scope in the
   query — never trust a client-supplied id alone.

4. **Return 404, not 403, for resources the caller may not see** — 403 leaks existence.

5. **Never expose internal error details to clients.** Catch at the API boundary, return a generic
   message + correlation id; log the full error server-side.

6. **Secrets only from configuration / a secrets manager** — never hardcoded in code or tests, never
   logged. `.env*` files stay out of the repo (protected-paths blocks writing them; `.env.example` is
   the allowed template).

7. **Rate-limit public endpoints** (auth + webhook endpoints tighter than the rest). Justify any override.

8. **File access:** validate ownership before serving; prefer presigned/expiring URLs over public buckets.

9. **Never roll your own auth.** Org projects authenticate via **authNexus** — the in-house
   OAuth/RBAC microservice. New org project = integrate authNexus middleware + its role contract
   from day one; never a local user/password table, never a second RBAC scheme beside it. Role
   checks follow its hierarchy on every protected route and in the UI. (Personal/external projects:
   use an established provider — still never hand-rolled.)

---

## Threat modelling for new features (STRIDE)

Before implementing any feature that crosses a trust boundary:

1. **Map trust boundaries** — where does untrusted data enter?
2. **Name the assets** — what's worth stealing or corrupting?
3. **Run STRIDE** for each boundary: **S**poofing · **T**ampering · **R**epudiation ·
   **I**nformation disclosure · **D**enial of service · **E**levation of privilege.
4. **Write abuse cases** alongside acceptance criteria — for every "user can do X", write "attacker
   attempts X on data they don't own" and confirm it is blocked.

STRIDE is mandatory for: new routes, auth changes, any feature reading/writing scoped data, file
uploads, and third-party integrations.
