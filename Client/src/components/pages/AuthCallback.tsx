import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { userManager } from '../../utils/authService';
import { getSessionEmployee } from '../../api';
import { describeError, devLog, errorLog } from '../../utils/devLog';

export default function AuthCallback() {
    const navigate = useNavigate();
    const processed = useRef(false);

    useEffect(() => {
        if (processed.current) return;
        processed.current = true;

        const completeSignIn = async (): Promise<void> => {
            let user;
            try {
                user = await userManager.signinRedirectCallback();
                devLog("[authNexus] Callback success");
            } catch (err) {
                // Message only — the thrown value can carry the OIDC response, including tokens.
                errorLog("[authNexus] Callback error:", describeError(err));
                navigate('/login?error=callback_failed', { replace: true });
                return;
            }

            // OIDC succeeded, but the dashboard is gated on the BACKEND accepting the
            // session: the token must verify server-side and map to a provisioned,
            // active employee. Only then redirect; otherwise sign out and bounce.
            const employee = await getSessionEmployee(user).catch(() => null);
            if (!employee || employee.is_active === false) {
                errorLog("[authNexus] Backend rejected session - user not provisioned/active for this project.");
                try {
                    await userManager.removeUser();
                } catch {
                    // best-effort cleanup; still bounce to login
                }
                navigate('/login?error=not_authorized', { replace: true });
                return;
            }

            const state: unknown = user?.state;
            const returnTo =
                typeof state === 'object' && state !== null &&
                    typeof (state as { returnTo?: unknown }).returnTo === 'string'
                    ? (state as { returnTo: string }).returnTo
                    : '/';
            navigate(returnTo, { replace: true });
        };

        void completeSignIn();
    }, [navigate]);

    return (
        <div className="min-h-screen bg-app flex flex-col items-center justify-center p-4">
            <div className="flex flex-col items-center gap-4">
                <div className="h-10 w-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
                <div className="text-center">
                    <p className="text-lg font-bold text-primary">Finalizing Sign In</p>
                    <p className="text-sm text-muted animate-pulse">Securing your session with authNexus...</p>
                </div>
            </div>
        </div>
    );
}
