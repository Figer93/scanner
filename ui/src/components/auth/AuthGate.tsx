/**
 * Loads /api/auth/status; if ADMIN_TOKEN is set, shows login until password is stored as Bearer token.
 */

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { clearAdminToken, getAdminToken, setAdminToken } from '../../api/client';
import LoginPage from './LoginPage';

type AuthContextValue = {
    authRequired: boolean;
    signOut: () => void;
};

const AuthContext = createContext<AuthContextValue>({
    authRequired: false,
    signOut: () => {},
});

export function useAuth() {
    return useContext(AuthContext);
}

type Phase = 'loading' | 'login' | 'ready';

export function AuthGate({ children }: { children: ReactNode }) {
    const [phase, setPhase] = useState<Phase>('loading');
    const [authRequired, setAuthRequired] = useState(false);

    useEffect(() => {
        let cancelled = false;
        fetch('/api/auth/status')
            .then((r) => r.json())
            .then((d) => {
                if (cancelled) return;
                const req = Boolean(d?.authRequired);
                setAuthRequired(req);
                if (!req) setPhase('ready');
                else if (getAdminToken()) setPhase('ready');
                else setPhase('login');
            })
            .catch(() => {
                if (cancelled) return;
                setAuthRequired(true);
                setPhase(getAdminToken() ? 'ready' : 'login');
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const signOut = useCallback(() => {
        clearAdminToken();
        if (authRequired) setPhase('login');
        else window.location.reload();
    }, [authRequired]);

    const onLoginSuccess = useCallback((token: string) => {
        const t = String(token || '').trim();
        if (t) setAdminToken(t);
        else clearAdminToken();
        setPhase('ready');
    }, []);

    if (phase === 'loading') {
        return (
            <div className="min-h-screen bg-[#0d0f12] flex items-center justify-center text-white/60 text-sm">
                Loading…
            </div>
        );
    }

    if (phase === 'login') {
        return <LoginPage onSuccess={onLoginSuccess} />;
    }

    return <AuthContext.Provider value={{ authRequired, signOut }}>{children}</AuthContext.Provider>;
}
