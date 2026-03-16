/**
 * Home — the operational dashboard.
 * Answers two questions every morning: "What happened?" and "What do I do next?"
 *
 * Layout:
 *   ┌─ Header: greeting + last pipeline run badge ─────────────────────────┐
 *   ├─ Pipeline summary: 6 stat cards (Total → Converted) → Kanban links ──┤
 *   └─ 3-col bento: Recent Activity | Email Performance | Quick Actions ────┘
 */

import { useMemo } from 'react';
import { useProfile } from '../hooks/useProfile';
import { useLastPipelineRun } from '../hooks/useAnalytics';
import PipelineSummary from './home/PipelineSummary';
import RecentActivity from './home/RecentActivity';
import EmailPerformance from './home/EmailPerformance';
import QuickActions from './home/QuickActions';

function getGreeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
}

function relativeTime(isoString: string): string {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

export default function Home() {
    const { data: profile } = useProfile();
    const { data: lastRun } = useLastPipelineRun();

    const userName = useMemo(() => {
        const raw = (profile?.team_members ?? '').toString().trim();
        if (!raw) return '';
        return raw.split(',')[0]?.trim() ?? '';
    }, [profile?.team_members]);

    const today = useMemo(
        () =>
            new Date().toLocaleDateString('en-GB', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
            }),
        []
    );

    return (
        <div className="flex flex-col gap-8 max-w-screen-2xl mx-auto">
            {/* ── Header ───────────────────────────────────────────── */}
            <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-white tracking-tight">
                        {getGreeting()}{userName ? `, ${userName}` : ''}.
                    </h1>
                    <p className="text-sm text-white/40 mt-1">{today}</p>
                </div>

                {lastRun && (
                    <div
                        className="flex flex-wrap items-center gap-x-2 gap-y-1 shrink-0 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5"
                        aria-label="Last pipeline run summary"
                    >
                        <span className="text-xs text-white/35">Last run</span>
                        <span className="text-xs font-medium text-white/65">
                            {relativeTime(lastRun.at)}
                        </span>
                        <span className="text-xs text-white/20" aria-hidden="true">·</span>
                        <span className="text-xs text-white/35">
                            {lastRun.inserted} added · {lastRun.enriched} enriched
                        </span>
                    </div>
                )}
            </header>

            {/* ── Pipeline summary ─────────────────────────────────── */}
            <PipelineSummary />

            {/* ── Operational panels ───────────────────────────────── */}
            <section
                className="grid grid-cols-1 md:grid-cols-3 gap-6"
                aria-label="Operations"
            >
                <RecentActivity lastRun={lastRun} />
                <EmailPerformance />
                <QuickActions />
            </section>
        </div>
    );
}
