/**
 * PipelineSummary — six clickable stat cards + Est. earnings (Phase 3A).
 * Stat cards link to Find Leads; earnings card links to Profile settings.
 */

import type { LucideIcon } from 'lucide-react';
import { Database, Sparkles, Send, MailOpen, MessageSquare, TrendingUp, Banknote } from 'lucide-react';
import GlassCard from '../../components/ui/GlassCard';
import { Skeleton } from '../../components/ui/SkeletonCard';
import { useFunnelStats } from '../../hooks/useAnalytics';
import { useEarnings } from '../../hooks/useEarnings';

interface StatConfig {
    readonly key: string;
    readonly label: string;
    readonly icon: LucideIcon;
    readonly iconClass: string;
    readonly href: string;
    /** Tailwind arbitrary shadow applied on group-hover via style attribute */
    readonly glowRgb: string;
    readonly hoverBorderClass: string;
}

const STATS: readonly StatConfig[] = [
    { key: 'total',      label: 'Total',      icon: Database,      iconClass: 'text-white/50',    href: '#/leads',                           glowRgb: '255,255,255',   hoverBorderClass: 'group-hover:border-white/25' },
    { key: 'Enriched',   label: 'Enriched',   icon: Sparkles,      iconClass: 'text-indigo-400',  href: '#/leads', glowRgb: '129,140,248',   hoverBorderClass: 'group-hover:border-indigo-400/60' },
    { key: 'Email Sent', label: 'Email Sent', icon: Send,          iconClass: 'text-sky-400',     href: '#/leads', glowRgb: '56,189,248',    hoverBorderClass: 'group-hover:border-sky-400/60' },
    { key: 'Opened',     label: 'Opened',     icon: MailOpen,      iconClass: 'text-amber-400',   href: '#/leads', glowRgb: '251,191,36',    hoverBorderClass: 'group-hover:border-amber-400/60' },
    { key: 'Replied',    label: 'Replied',    icon: MessageSquare, iconClass: 'text-emerald-400', href: '#/leads', glowRgb: '52,211,153',    hoverBorderClass: 'group-hover:border-emerald-400/60' },
    { key: 'Converted',  label: 'Converted',  icon: TrendingUp,    iconClass: 'text-violet-400',  href: '#/leads', glowRgb: '167,139,250',   hoverBorderClass: 'group-hover:border-violet-400/60' },
] as const;

interface StatCardProps {
    config: StatConfig;
    value: number;
    isLoading: boolean;
    title?: string;
}

function StatCard({ config, value, isLoading, title }: StatCardProps) {
    const { label, icon: Icon, iconClass, href, glowRgb, hoverBorderClass } = config;
    return (
        <a
            href={href}
            title={title}
            aria-label={title ? `${label}: ${value.toLocaleString()} — ${title}` : `${label}: ${value.toLocaleString()} — click to view`}
            className="group relative block rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
        >
            <GlassCard
                className={`p-5 transition-all duration-200 group-hover:bg-white/[0.12] ${hoverBorderClass}`}
            >
                <Icon
                    size={17}
                    className={`${iconClass} mb-3 opacity-75 group-hover:opacity-100 transition-opacity duration-150`}
                    aria-hidden="true"
                />
                {isLoading ? (
                    <Skeleton className="h-7 w-10 mb-1.5" />
                ) : (
                    <p className="text-2xl font-bold text-white tracking-tight leading-none mb-1 tabular-nums">
                        {value.toLocaleString()}
                    </p>
                )}
                <p className="text-xs text-white/45 leading-none">{label}</p>
            </GlassCard>
            {/* Color-matched glow halo on hover — sits outside card border so it doesn't shift layout */}
            <div
                className="pointer-events-none absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                style={{ boxShadow: `0 0 24px rgba(${glowRgb},0.28)` }}
                aria-hidden="true"
            />
        </a>
    );
}

export default function PipelineSummary() {
    const { data: funnel, isLoading } = useFunnelStats();
    const { data: earnings, isLoading: earningsLoading } = useEarnings();

    function getValue(key: string): number {
        if (!funnel) return 0;
        if (key === 'total') return funnel.total;
        return funnel.byStatus[key] ?? 0;
    }

    const estimatedEarnings = earnings?.overview?.estimatedEarnings ?? null;
    const earningsConfigured = earnings?.overview?.referralPounds != null && !Number.isNaN(earnings.overview.referralPounds);
    const earningsDisplay = estimatedEarnings != null ? `£${estimatedEarnings.toFixed(2)}` : '£0';
    const earningsTitle = earningsConfigured ? undefined : 'Configure in Profile';

    return (
        <section aria-label="Pipeline summary">
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-7 gap-4">
                {STATS.map((config) => (
                    <StatCard
                        key={config.key}
                        config={config}
                        value={getValue(config.key)}
                        isLoading={isLoading}
                    />
                ))}
                <a
                    href="#/profile#profile-earnings-settings"
                    title={earningsTitle}
                    aria-label={earningsTitle ? `Est. earnings this month: ${earningsDisplay} — ${earningsTitle}` : `Est. earnings this month: ${earningsDisplay} — click to view`}
                    className="group relative block rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                >
                    <GlassCard className="p-5 transition-all duration-200 group-hover:bg-white/[0.12] group-hover:border-emerald-400/60">
                        <Banknote size={17} className="text-emerald-400 mb-3 opacity-75 group-hover:opacity-100 transition-opacity duration-150" aria-hidden="true" />
                        {earningsLoading ? (
                            <Skeleton className="h-7 w-16 mb-1.5" />
                        ) : (
                            <p className="text-2xl font-bold text-white tracking-tight leading-none mb-1 tabular-nums">
                                {earningsDisplay}
                            </p>
                        )}
                        <p className="text-xs text-white/45 leading-none">Est. earnings this month</p>
                    </GlassCard>
                    <div className="pointer-events-none absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-200" style={{ boxShadow: '0 0 24px rgba(52,211,153,0.28)' }} aria-hidden="true" />
                </a>
            </div>
        </section>
    );
}
