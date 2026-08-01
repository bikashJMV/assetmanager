# Auth: OIDC + BFF refresh-token flow (HUMAN-OWNED — protected paths)

These files are in `config.protectedPaths`; edits need explicit human sign-off
(`LOOP_OFFLIMITS=ack` per edit).

## Flow

1. Login: `oidc-client-ts` Authorization Code + PKCE against AuthNexus (ZITADEL).
   `token`/`userinfo` endpoints routed same-origin via `/nexus-proxy/` (nginx / Vite proxy);
   `authorization`/`jwks`/`end_session` hit the authority directly (`Client/src/utils/authService.ts`).
2. On `addUserLoaded`: client POSTs the refresh token to `POST /api/auth/set-session`
   (`credentials:'include'`) → server plants HttpOnly cookie `nexus_refresh_token`
   (`Server/routers/api_auth.py`). Refresh token never stays in JS-accessible storage.
3. Access token lives in localStorage (`access_token`), mirrored into the OIDC user object.
4. Refresh: `POST /api/auth/refresh` — server reads the cookie, proxies to
   `{AUTH_AUTHORITY}/api/auth/refresh`, returns new access token in body, rotates the cookie,
   strips `refresh_token` from the JSON.
5. Client refresh triggers: proactive (`addAccessTokenExpiring`, 60s before expiry) + axios request
   interceptor (expired/within 5s) + response interceptor on 401 (single `_retry`, mutex
   `failedQueue`). Refresh failure → remove user, hard redirect `/login`.
6. Server side: `AuthMiddleware` verifies RS256 JWT via JWKS (PyJWKClient), resolves employee row
   per request (`resolve_employee_for_sub` — self-provisioning by sub → username → email link).
   RBAC guards in `core/authz.py` (`employee|admin|it_ops`).

## Why no idle-timeout UI

`IdleWarningModal` + `useIdleTimeout` were deleted on this branch — silent BFF refresh keeps the
session alive transparently; the modal became redundant.

## Known gaps (backlog — see roadmap.md)

- ~~Refresh token leaked in `/api/auth/refresh` JSON body~~ — FIXED 2026-07-18.
- ~~Cookie lacks `Secure` + `Max-Age`~~ — FIXED 2026-07-18 (`_set_refresh_cookie` helper; Secure
  keyed off `settings.ENV`, Max-Age 7d).
- ~~`AUTH_AUDIENCE` accepts only web client_id~~ — FIXED 2026-07-18 (both audiences accepted).
- Callback now backend-gated: `AuthCallback.tsx` verifies `getSessionEmployee` before dashboard
  redirect; else `/login?error=not_authorized`.
- Multi-tab refresh race: two tabs can race `/api/auth/refresh`; rotation invalidates the loser.
  Candidate fixes: BroadcastChannel lock or reuse-grace-window server-side.
- `require_backend_api_key` gate assembled but never wired (`Server/main.py`).
- Legacy `core/auth.py` (jose, never-expiring JWKS cache) should be deleted.
- Verbose `console.log` step-tracing in client auth paths — strip for production.
