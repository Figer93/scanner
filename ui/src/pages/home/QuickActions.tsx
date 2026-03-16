/**
 * QuickActions — one-click shortcuts for the most frequent daily operations.
 * "Run pipeline" triggers a quick 10-lead enrichment pass with default settings.
 */

import { useState, useCallback } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Play, Kanban, Users, BarChart2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import GlassCard from '../../components/ui/GlassCard';
import { analyticsKeys } from '../../hooks/useAnalytics';

interface ActionDef {
    readonly id: string;
    readonly label: string;
    readonly description: string;
    readonly icon: LucideIcon;
    readonly isPrimary?: boolean;
}

const STATIC_ACTIONS: readonly ActionDef[] = [
    {
        id: 'kanban',
        label: 'Open pipeline board',
        description: 'Manage leads across all pipeline stages',
        icon: Kanban,
    },
    {
        id: 'outreach',
        label: 'Email enriched leads',
        description: 'Go to Kanban · Ready to Send view',
        icon: Users,
    },
    {
        id: 'analytics',
        label: 'View analytics',
        description: 'List performance, funnel and conversion rates',
        icon: BarChart2,
    },
] as const;

function navigate(hash: string) {
    window.location.hash = hash;
}

function handleStaticAction(id: string) {
    if (id === 'kanban') navigate('#/kanban');
    else if (id === 'outreach') navigate('#/kanban');
    else if (id === 'analytics') navigate('#/analytics');
}

export default function QuickActions() {
    const queryClient = useQueryClient();
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState<{ text: string; ok: boolean } | null>(null);

    const handleRunPipeline = useCallback(async () => {
        setRunning(true);
        setResult(null);
        try {
            const data: { summary?: { inserted?: number; enriched?: number } } =
                await api.post('/api/run', { source: 'companies_house', limit: 10 });
            const ins = data?.summary?.inserted ?? 0;
            const enr = data?.summary?.enriched ?? 0;
            setResult({ text: `Done — ${ins} added, ${enr} enriched`, ok: true });
            void queryClient.invalidateQueries({ queryKey: analyticsKeys.all });
        } catch {
            setResult({ text: 'Pipeline run failed — check your settings', ok: false });
        } finally {
            setRunning(false);
        }
    }, [queryClient]);

    return (
        <GlassCard className="flex flex-col gap-4">
            <h2 className="text-xs font-semibold text-white/50 uppercase tracking-widest">
                Quick Actions
            </h2>

            <ul className="flex flex-col gap-2" role="list">
                {/* Run pipeline — primary CTA */}
                <li>
                    <button
                        type="button"
                        onClick={handleRunPipeline}
                        disabled={running}
                        aria-busy={running}
                        className={`
                            w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left
                            transition-all duration-150
                            bg-[var(--color-accent-primary)]/20 hover:bg-[var(--color-accent-primary)]/30
                            border border-[var(--color-accent-primary)]/30 hover:border-[var(--color-accent-primary)]/50
                            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)]
                            focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                            ${running ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}
                        `}
                    >
                        <Play
                            size={15}
                            className="text-violet-300 shrink-0"
                            aria-hidden="true"
                        />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white leading-tight">
                                {running ? 'Running pipeline…' : 'Run pipeline'}
                            </p>
                            <p className="text-xs text-white/40 leading-tight mt-0.5">
                                Enrich 10 new leads from Companies House
                            </p>
                        </div>
                    </button>
                </li>

                {/* Static navigation actions */}
                {STATIC_ACTIONS.map(({ id, label, description, icon: Icon }) => (
                    <li key={id}>
                        <button
                            type="button"
                            onClick={() => handleStaticAction(id)}
                            className={`
                                w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left
                                transition-all duration-150
                                bg-white/4 hover:bg-white/8 border border-white/8 hover:border-white/15
                                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)]
                                focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                                cursor-pointer
                            `}
                        >
                            <Icon size={15} className="text-white/45 shrink-0" aria-hidden="true" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-white leading-tight">{label}</p>
                                <p className="text-xs text-white/35 leading-tight mt-0.5 truncate">
                                    {description}
                                </p>
                            </div>
                        </button>
                    </li>
                ))}
            </ul>

            {result && (
                <p
                    role="status"
                    aria-live="polite"
                    className={`
                        text-xs px-3 py-2 rounded-lg leading-relaxed
                        ${result.ok
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20'
                            : 'bg-red-500/15 text-red-300 border border-red-500/20'
                        }
                    `}
                >
                    {result.text}
                </p>
            )}
        </GlassCard>
    );
}
