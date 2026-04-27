import { useEffect, useRef, useState } from "react";
import { userManager } from "../../utils/authService";
import { useNavigate } from "react-router-dom";

export const Callback = () => {
    const navigate = useNavigate();
    const processing = useRef(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (processing.current) return;
        processing.current = true;

        const handleCallback = async () => {
            try {
                console.log("[callBack.authNexus] Callback handler triggered");
                // Process the URL code and perform the swap [cite: 114]
                console.log("[callBack.authNexus] Calling signinRedirectCallback()");
                await userManager.signinRedirectCallback();
                console.log(" ✅ [authNexus] Handshake Success - User authenticated, redirecting to /home");
                navigate("/home", { replace: true });
            } catch (err: unknown) {
                console.error(" ❌ [authNexus] Handshake Error:", (err as Error).message);
                console.error("[callBack.authNexus] Full error details:", err);
                setError((err as Error).message || "Authentication failed.");
            }
        };

        void handleCallback();
    }, [navigate]);

    if (error) return <div style={{ color: 'red' }}>Handshake Failed: {error}</div>;
    return <div>Finalizing Handshake...</div>;
};

// import { useEffect, useRef, useState } from "react";
// import { userManager } from "../../utils/authService";
// import { useNavigate } from "react-router-dom";

// export const Callback = () => {

//     const navigate = useNavigate();
//     const processing = useRef(false);
//     const [error, setError] = useState<string | null>(null);

//     useEffect(() => {
//         if (processing.current) return;
//         processing.current = true;
//         const handleCallback = async () => {

//             try {
//                 // 1. CHECK FIRST: If we already have a user in storage, just go home.
//                 const existingUser = await userManager.getUser();
//                 if (existingUser && !existingUser.expired) {
//                     console.log("[authNexus] User already found in storage, skipping callback processing.");
//                     navigate("/", { replace: true });
//                     return;
//                 }

//                 // 2. PROCESS: Only if no user exists, process the URL code.
//                 console.log("[authNexus] Processing callback. Expected Authority:", userManager.settings.authority);
//                 await userManager.signinRedirectCallback();
//                 console.log("[authNexus] Handshake Success.");
//                 navigate("/", { replace: true });

//             } catch (err: unknown) {
//                 console.error("[authNexus] Handshake Error Detail:", {
//                     message: (err as Error).message,
//                     error: (err as { error?: string }).error,
//                     error_description: (err as { error_description?: string }).error_description,
//                     settings_authority: userManager.settings.authority
//                 });

                

//                 if ((err as Error).message.includes("No matching state")) {
//                     console.warn("[authNexus] State mismatch detected. This often happens if the 'authority' string differs between request and callback.");
//                     // Fallback: Check one last time if the first execution actually worked
//                     const user = await userManager.getUser();
//                     if (user) {
//                         navigate("/", { replace: true });
//                         return;
//                     }
//                 }
//                 setError((err as Error).message || "Authentication failed during handshake.");
//                 void userManager.clearStaleState();
//                 // navigate("/login"); // Commented out to allow reading the error UI
//             }
//         };
//         void handleCallback();
//     }, [navigate]);
//     if (error) {
//         return (
//             <div className="min-h-screen bg-gov-dark flex items-center justify-center p-4">
//                 <div className="bg-red-900/20 border border-red-500 p-6 rounded-lg max-w-md text-center">
//                     <h2 className="text-red-400 font-bold mb-2">Handshake Failed</h2>
//                     <p className="text-slate-300 text-sm mb-4">{error}</p>
//                     <button
//                         onClick={() => {void userManager.clearStaleState(); window.location.href = "/login"; }}
//                         className="bg-red-500 text-white px-4 py-2 rounded text-sm font-bold"
//                     >
//                         Reset Session & Retry
//                     </button>
//                 </div>
//             </div>
//         );
//     }

//     return (
//         <div className="min-h-screen bg-gov-dark flex items-center justify-center">
//             <div className="text-gov-accent flex flex-col items-center">
//                 <div className="w-10 h-10 border-4 border-gov-accent/20 border-t-gov-accent rounded-full animate-spin mb-4"></div>
//                 <p className="font-mono text-xs tracking-widest uppercase">Finalizing Handshake</p>
//             </div>
//         </div>
//     );
// };
