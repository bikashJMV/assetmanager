# AMS Client

React 19 + Vite 7 SPA for Asset Manager. Communicates with the AMS Server via a typed API layer.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript |
| Build | Vite 7 |
| Routing | React Router v6 |
| Server state | TanStack React Query |
| HTTP client | Axios (with interceptors) |
| Auth | oidc-client-ts + custom BFF integration |
| Charts | Apache ECharts |
| Styling | Tailwind CSS v4 |

---

## Environment Variables

Copy `.env.example` to `.env` and fill in:

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | ✅ | AMS Server base URL |
| `VITE_AUTH_AUTHORITY` | ✅ | AuthNexus base URL |
| `VITE_CLIENT_ID` | ✅ | OIDC client ID |
| `VITE_PROJECT_ID` | ✅ | AuthNexus project ID |
| `VITE_ORG_ID` | ✅ | AuthNexus organization ID |
| `VITE_PROJECT_NAME` | optional | Human-readable project name |
| `VITE_CALLBACK_PATH` | ✅ | OIDC redirect path, e.g. `/auth/callback` |
| `VITE_LOGOUT_PATH` | ✅ | Post-logout redirect path, e.g. `/login` |
| `VITE_BACKEND_API_KEY` | optional | Internal API key sent as `X-API-Key` |

---

## Auth Architecture

The client uses a **BFF (Backend-for-Frontend)** pattern. The refresh token lives in an HttpOnly cookie managed entirely by the server — JavaScript cannot read it. The client only ever holds the short-lived access token.

### Token Storage

| Token | Where | Readable by JS? |
|---|---|---|
| `access_token` | `localStorage` key `access_token` | ✅ Yes |
| OIDC user object (incl. `expires_at`) | `sessionStorage` (oidc-client-ts) | ✅ Yes |
| `nexus_refresh_token` | HttpOnly cookie, `path=/api/auth/` | ❌ Never |

### Three-Layer Refresh Strategy

```
Layer 1 — Proactive (600 s before expiry)
  oidc-client-ts fires addAccessTokenExpiring event
  → registered callback calls POST /api/auth/refresh via BFF
  → new access_token stored in localStorage + sessionStorage

Layer 2 — Safety Net (< 5 s until expiry)
  axios request interceptor checks expires_at before every request
  → if expiring in < 5 s, refreshes before sending

Layer 3 — Reactive (on 401)
  axios response interceptor catches 401
  → calls POST /api/auth/refresh
  → retries original request with new token
  → if refresh fails → logout + redirect /login
```

Concurrent requests during a refresh are queued via `isRefreshing` flag + `failedQueue` array and replayed once the refresh completes.

### Key Files

| File | Responsibility |
|---|---|
| `src/utils/authService.ts` | `UserManager` config, token localStorage helpers, OIDC event handlers (`addUserLoaded` → plants HttpOnly cookie, `addAccessTokenExpiring` → triggers proactive refresh) |
| `src/utils/authNexus.api.ts` | Axios instance, request interceptor (safety-net check), response interceptor (401 → refresh → retry), `refreshTokenViaBFF()` function, concurrent-request queue |
| `src/api.ts` | `requestBackend` wrapper, `SessionEmployee` type, `getSessionEmployee()`, `signOut()` |
| `src/components/pages/AuthCallback.tsx` | OIDC callback handler — calls `signinRedirectCallback()` which triggers `addUserLoaded` |

### Login Flow

```
1. User clicks Login → userManager.signinRedirect()
2. AuthNexus authenticates → redirects to /auth/callback
3. AuthCallback.tsx → signinRedirectCallback()
4. addUserLoaded fires:
   a. access_token stored in localStorage
   b. POST /api/auth/set-session called with refresh_token in body
   c. Server plants nexus_refresh_token as HttpOnly cookie
5. App loads sessionEmployee from GET /api/v1/employees/me
6. React state updated, user sees their dashboard
```

### Logout Flow

```
1. signOut() called
2. POST /api/auth/logout → server revokes token at AuthNexus + deletes cookie
3. localStorage cleared
4. userManager.removeUser() → sessionStorage cleared
5. Redirect to /login
```

---

## Route Access Control

| Route | Guard | Roles |
|---|---|---|
| `/assets`, `/assets/:tag` | `RequireAuthenticated` | all |
| `/assets/new`, `/employee`, `/qr-generate` | `RequirePrivileged` | admin, it_ops |
| `/logs` | `RequirePrivileged` | admin, it_ops |
| `/login`, `/auth/callback` | public | — |

---

## Running Locally

```bash
cd Client
npm install
cp .env.example .env   # fill in values
npm run dev
```

The dev server proxies `/nexus-proxy` to AuthNexus to avoid CORS issues with the OIDC token endpoint.

---

## Troubleshooting

**Unexpected logouts mid-session**
- Verify `monitorSession: false` in `authService.ts`. If `true`, oidc-client-ts polls AuthNexus session state via iframe — BFF cookie rotation can trigger false `userSignedOut` events.

**"No refresh_token in OIDC user object"** (console error after login)
- The `offline_access` scope is missing from the OIDC request, or AuthNexus is not configured to return refresh tokens for this client.

**401 on every request after tab restore**
- `sessionStorage` is cleared between sessions. The OIDC user (`expires_at`) is gone, so the safety-net refresh fires immediately on the first request. This is expected — the reactive 401 interceptor handles recovery automatically.

**`nexus_refresh_token` cookie not sent to `/api/auth/refresh`**
- Cookie path must match: server sets `path=/api/auth/`, and the refresh fetch goes to `/api/auth/refresh`. Both must share the same origin.
- In development, ensure `VITE_API_URL` and the dev server proxy are on the same origin as the cookie.
