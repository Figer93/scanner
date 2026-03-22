/**
 * Dashboard password gate — same secret as server ADMIN_TOKEN (Railway variable).
 */

import { useState } from 'react';

interface LoginPageProps {
    onSuccess: (token: string) => void;
}

export default function LoginPage({ onSuccess }: LoginPageProps) {
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: password.trim() }),
            });
            const data = res.ok ? await res.json().catch(() => ({})) : await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(typeof data?.error === 'string' ? data.error : 'Login failed');
                return;
            }
            if (data?.authRequired === false) {
                onSuccess('');
                return;
            }
            onSuccess(password);
        } catch {
            setError('Network error');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen bg-[#0d0f12] flex items-center justify-center p-6">
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 shadow-xl">
                <h1 className="text-xl font-semibold text-white mb-1">Foundly Start</h1>
                <p className="text-sm text-white/50 mb-6">Sign in to open the dashboard.</p>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="dash-password" className="block text-xs font-medium text-white/60 mb-1.5">
                            Password
                        </label>
                        <input
                            id="dash-password"
                            type="password"
                            autoComplete="current-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                            placeholder="Same value as ADMIN_TOKEN on the server"
                            required
                        />
                    </div>
                    {error && (
                        <p className="text-sm text-red-300" role="alert">
                            {error}
                        </p>
                    )}
                    <button
                        type="submit"
                        disabled={loading || !password.trim()}
                        className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:pointer-events-none text-white font-medium py-2.5 transition-colors"
                    >
                        {loading ? 'Signing in…' : 'Sign in'}
                    </button>
                </form>
                <p className="mt-6 text-xs text-white/35 leading-relaxed">
                    Set <code className="text-white/50 bg-white/10 px-1 rounded">ADMIN_TOKEN</code> in Railway (or{' '}
                    <code className="text-white/50 bg-white/10 px-1 rounded">.env</code>) to a long random string — that value is your dashboard password.
                </p>
            </div>
        </div>
    );
}
