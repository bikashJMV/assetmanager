import { UserManager, WebStorageStateStore, Log } from 'oidc-client-ts';

// Enable debugging for integration logs
Log.setLogger(console);
Log.setLevel(Log.WARN);

const AUTHNEXUS_ACCESS_TOKEN_STORAGE_KEY = 'ams-authnexus-access-token'

export function getAuthNexusAccessToken(): string | null {
    const raw = window.localStorage.getItem(AUTHNEXUS_ACCESS_TOKEN_STORAGE_KEY)
    const token = (raw || '').trim()
    return token ? token : null
}

export function setAuthNexusAccessToken(token: string | null) {
    if (!token || !token.trim()) {
        window.localStorage.removeItem(AUTHNEXUS_ACCESS_TOKEN_STORAGE_KEY)
        return
    }
    window.localStorage.setItem(AUTHNEXUS_ACCESS_TOKEN_STORAGE_KEY, token.trim())
}

export function clearAuthNexusAccessToken() {
    window.localStorage.removeItem(AUTHNEXUS_ACCESS_TOKEN_STORAGE_KEY)
}

// Base URLs from ENV
const authority = import.meta.env.VITE_AUTH_AUTHORITY?.trim().replace(/\/$/, "");
const clientOrigin = window.location.origin; // Dynamically gets http://localhost:5174
const projectId = import.meta.env.VITE_PROJECT_ID?.trim();

const settings = {
    authority: authority,
    client_id: import.meta.env.VITE_CLIENT_ID?.trim(),

    // Dynamically construct paths
    redirect_uri: `${clientOrigin}${import.meta.env.VITE_CALLBACK_PATH}`,
    post_logout_redirect_uri: `${clientOrigin}${import.meta.env.VITE_LOGOUT_PATH}`,
    response_type: 'code',
    // Dynamic Project Scope
    scope: `openid profile email role urn:zitadel:iam:org:project:id:${projectId}:aud`,

    loadUserInfo: true, // Ensure roles are fetched from the gateway userinfo endpoint
    automaticSilentRenew: false,

    monitorSession: false,
    accessTokenExpiringNotificationTimeInSeconds: 60,
    // Never store sensitive data in localStorage (except the access token itself).
    // OIDC user/session details stay in sessionStorage; access_token is mirrored into localStorage explicitly.
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),

    // Critical: Force metadata to use the authority IP for all handshakes
    metadata: {
        issuer: authority,
        authorization_endpoint: `${authority}/api/v1/auth/authorize`,
        token_endpoint: `${authority}/api/v1/auth/token`,
        userinfo_endpoint: `${authority}/oidc/v1/userinfo`,
        jwks_uri: `${authority}/api/v1/auth/jwks`,
        end_session_endpoint: `${authority}/oidc/v1/end_session`
    },

    extraQueryParams: {
        "org_id": import.meta.env.VITE_ORG_ID?.trim()
    }
};

export const userManager = new UserManager(settings);

// Add these to the bottom of authService.ts
userManager.events.addAccessTokenExpiring(() => {
    console.warn("[authNexus] Access token expiring soon... initiating silent renew.");
});

userManager.events.addAccessTokenExpired(() => {
    clearAuthNexusAccessToken()
})


userManager.events.addSilentRenewError((error) => {
    console.error("[authNexus] Silent Renew Error:", error);
    // Treat silent renew failures as unsafe to keep using any cached token.
    clearAuthNexusAccessToken()
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
