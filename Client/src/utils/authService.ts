import { UserManager, WebStorageStateStore, Log } from 'oidc-client-ts';

// Enable debugging for integration logs
Log.setLogger(console);
Log.setLevel(Log.WARN);

const AUTHNEXUS_ACCESS_TOKEN_STORAGE_KEY = 'access_token'
const LEGACY_AUTHNEXUS_ACCESS_TOKEN_STORAGE_KEY = 'ams-authnexus-access-token'

export function getAuthNexusAccessToken(): string | null {
    const raw = window.localStorage.getItem(AUTHNEXUS_ACCESS_TOKEN_STORAGE_KEY)
    const token = (raw || '').trim()
    if (token) return token

    const legacyRaw = window.localStorage.getItem(LEGACY_AUTHNEXUS_ACCESS_TOKEN_STORAGE_KEY)
    const legacyToken = (legacyRaw || '').trim()
    if (!legacyToken) return null

    window.localStorage.setItem(AUTHNEXUS_ACCESS_TOKEN_STORAGE_KEY, legacyToken)
    window.localStorage.removeItem(LEGACY_AUTHNEXUS_ACCESS_TOKEN_STORAGE_KEY)
    return legacyToken
}

export function setAuthNexusAccessToken(token: string | null) {
    if (!token || !token.trim()) {
        window.localStorage.removeItem(AUTHNEXUS_ACCESS_TOKEN_STORAGE_KEY)
        window.localStorage.removeItem(LEGACY_AUTHNEXUS_ACCESS_TOKEN_STORAGE_KEY)
        return
    }
    window.localStorage.setItem(AUTHNEXUS_ACCESS_TOKEN_STORAGE_KEY, token.trim())
    window.localStorage.removeItem(LEGACY_AUTHNEXUS_ACCESS_TOKEN_STORAGE_KEY)
}

export function clearAuthNexusAccessToken() {
    window.localStorage.removeItem(AUTHNEXUS_ACCESS_TOKEN_STORAGE_KEY)
    window.localStorage.removeItem(LEGACY_AUTHNEXUS_ACCESS_TOKEN_STORAGE_KEY)
}

// Base URLs from ENV
const authority = import.meta.env.VITE_AUTH_AUTHORITY?.trim().replace(/\/$/, "");
const clientOrigin = window.location.origin; // 
const projectId = import.meta.env.VITE_PROJECT_ID?.trim();

const settings = {
    authority: authority,
    client_id: import.meta.env.VITE_CLIENT_ID?.trim(),

    // Dynamically construct paths
    redirect_uri: `${clientOrigin}${import.meta.env.VITE_CALLBACK_PATH}`,
    post_logout_redirect_uri: `${clientOrigin}${import.meta.env.VITE_LOGOUT_PATH}`,
    response_type: 'code',
    // Dynamic Project Scope
    scope: `openid profile email role offline_access urn:zitadel:iam:org:project:id:${projectId}:aud`,

    loadUserInfo: true, // Ensure roles are fetched from the gateway userinfo endpoint
    automaticSilentRenew: false,
 
    monitorSession: true, // DISABLED: Prevents check_session_iframe from firing 'userSignedOut' when the BFF rotates the token
    accessTokenExpiringNotificationTimeInSeconds: 60,
    // Never store sensitive data in localStorage (except the access token itself).
    // OIDC user/session details stay in sessionStorage; access_token is mirrored into localStorage explicitly.
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),

    // Critical: Force metadata to use the authority IP for all handshakes
    metadata: {
        issuer: authority,
        authorization_endpoint: `${authority}/api/v1/auth/authorize`,
        token_endpoint: `${window.location.origin}/nexus-proxy/api/v1/auth/token`,
        userinfo_endpoint: `${window.location.origin}/nexus-proxy/oidc/v1/userinfo`,
        jwks_uri: `${authority}/api/v1/auth/jwks`,
        end_session_endpoint: `${authority}/oidc/v1/end_session`
    },

    extraQueryParams: {
        "org_id": import.meta.env.VITE_ORG_ID?.trim(),
        "project_id": import.meta.env.VITE_PROJECT_ID?.trim(),
        "project_name": import.meta.env.VITE_PROJECT_NAME?.trim()
    }
};

export const userManager = new UserManager(settings);

let _proactiveRefreshCallback: (() => Promise<void>) | null = null
export function registerSilentRefreshCallback(cb: () => Promise<void>) {
    _proactiveRefreshCallback = cb
}

// Add these to the bottom of authService.ts
userManager.events.addAccessTokenExpiring(async () => {
    console.warn("[authNexus] Access token expiring soon... initiating proactive BFF refresh.");
    if (_proactiveRefreshCallback) {
        try { await _proactiveRefreshCallback() }
        catch (err) { console.error("[authNexus] Proactive refresh failed:", err) }
    }
});

userManager.events.addAccessTokenExpired(() => {
    clearAuthNexusAccessToken()
})


userManager.events.addSilentRenewError((error) => {
    console.error("[authNexus] Silent Renew Error (oidc):", error);
    // Do NOT clear access token — it may still be valid
});

userManager.events.addUserLoaded((user) => {
    // Allowed exception: persist only the access token in localStorage.
    setAuthNexusAccessToken(user?.access_token ?? null)
});

userManager.events.addUserUnloaded(() => {
    clearAuthNexusAccessToken()
})

userManager.events.addUserSignedOut(() => {
    clearAuthNexusAccessToken()
})
