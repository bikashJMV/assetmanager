import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { userManager } from '../../utils/authService';

export default function AuthCallback() {
    const navigate = useNavigate();
    const processed = useRef(false);

    useEffect(() => {
        if (processed.current) return;
        processed.current = true;

        userManager.signinRedirectCallback()
            .then((user) => {
                console.log("[authNexus] Callback success");
                const state = user?.state as any;
                const returnTo = typeof state?.returnTo === 'string' ? state.returnTo : '/';
                navigate(returnTo, { replace: true });
            })
            .catch((err) => {
                console.error("[authNexus] Callback error:", err);
                navigate('/login?error=callback_failed', { replace: true });
            });
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
