/**
 * RecentActivity — live feed of the last 5 actions across all leads.
 * Merges lead_activities, email_log events, and the last pipeline run.
 *
 * Content strings stored by the backend follow these patterns:
 *   email_sent    → "Email sent to x@y.com: "Subject"" | "Email sent (bulk): "Subject""
 *   status_change → "Status changed to Enriched"
 *   note          → "Lead data synced (website, contacts, enrichment)" | "Pushed to hubspot: …"
 *   scored        → "Score: 8/10 – reason text"
 */

import { useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
    Mail, MailOpen, MessageSquare, ArrowRight,
    FileText, Inbox, Activity, Star, Play,
    TrendingUp,
} from 'lucide-react';
import GlassCard from '../../components/ui/GlassCard';
import EmptyState from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/SkeletonCard';
import { useRecentActivity, type RecentActivityItem } from '../../hooks/useAnalytics';
import type { LastPipelineRun } from '../../hooks/useAnalytics';
import { leadUrl } from '../../constants/routes';

// ── Content parsers ──────────────────────────────────────────

function parseEmailLabel(item: RecentActivityItem): string {
    const c = item.content ?? '';
    const toMatch = c.match(/Email sent to [^:]+: "(.+)"/);
    if (toMatch) return `Email sent — ${toMatch[1]}`;
    const bulkMatch = c.match(/Email sent \(bulk\): "(.+)"/);
    if (bulkMatch) return `Email sent — ${bulkMatch[1]}`;
    if (c === 'Outreach draft generated') return `Outreach draft generated`;
    return `Email sent to ${item.company_name}`;
}

function parseStatusLabel(item: RecentActivityItem): string {
    const c = item.content ?? '';
    const match = c.match(/Status changed to (.+)/);
    if (match) return `Status → ${match[1]}`;
    return c || `Status updated`;
}

function parseNoteLabel(item: RecentActivityItem): string {
    const c = item.content ?? '';
    if (c.includes('Lead data synced')) return `Enriched — website and contacts synced`;
    const crmMatch = c.match(/Pushed to (\w+):/i);
    if (crmMatch) {
        const provider = crmMatch[1]!;
        return `CRM push — ${provider.charAt(0).toUpperCase()}${provider.slice(1)}`;
    }
    return c || `Note for ${item.company_name}`;
}

function parseScoredLabel(item: RecentActivityItem): string {
    const c = item.content ?? '';
    const match = c.match(/Score: (\d+\/\d+)/);
    if (match) return `AI scored — ${match[1]}`;
    return c || `Scored`;
}

function parsePipelineLabel(item: RecentActivityItem): string {
    const c = item.content ?? '';
    return c ? `Pipeline run — ${c}` : 'Pipeline run completed';
}

// ── Type config map ──────────────────────────────────────────

interface TypeConfig {
    readonly icon: LucideIcon;
    readonly iconClass: string;
    readonly label: (item: RecentActivityItem) => string;
}

const TYPE_MAP: Readonly<Record<string, TypeConfig>> = {
    email_sent:     { icon: Mail,           iconClass: 'text-sky-400',     label: parseEmailLabel },
    email_opened:   { icon: MailOpen,       iconClass: 'text-amber-400',   label: (i) => `${i.company_name} opened your email` },
    email_replied:  { icon: MessageSquare,  iconClass: 'text-emerald-400', label: (i) => `${i.company_name} replied` },
    email_received: { icon: Inbox,          iconClass: 'text-indigo-400',  label: (i) => `Inbound email from ${i.company_name}` },
    converted:      { icon: TrendingUp,     iconClass: 'text-violet-400',  label: (i) => `${i.company_name} marked converted` },
    status_change:  { icon: ArrowRight,     iconClass: 'text-white/45',    label: parseStatusLabel },
    note:           { icon: FileText,       iconClass: 'text-white/45',    label: parseNoteLabel },
    scored:         { icon: Star,           iconClass: 'text-amber-300',   label: parseScoredLabel },
    pipeline_run:   { icon: Play,           iconClass: 'text-violet-400',  label: parsePipelineLabel },
};

const FALLBACK_CONFIG: TypeConfig = {
    icon: Activity,
    iconClass: 'text-white/35',
    label: (i) => i.content ?? i.company_name,
};

function getTypeConfig(type: string): TypeConfig {
    return TYPE_MAP[type] ?? FALLBACK_CONFIG;
}

// ── Time helper ──────────────────────────────────────────────

function timeAgo(timestamp: string): string {
    const diffMs = Date.now() - new Date(timestamp).getTime();
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

// ── Component ────────────────────────────────────────────────

interface RecentActivityProps {
    /** Passed from Home to add the latest pipeline run as a synthetic feed item */
    lastRun?: LastPipelineRun | null;
}

export default function RecentActivity({ lastRun }: RecentActivityProps) {
    const { data: rawItems = [], isLoading } = useRecentActivity(5);

    const items = useMemo<RecentActivityItem[]>(() => {
        if (!lastRun || (!lastRun.inserted && !lastRun.enriched)) return rawItems;

        const syntheticItem: RecentActivityItem = {
            id: 'pipeline_run',
            type: 'pipeline_run',
            company_name: '',
            lead_id: 0,
            content: `${lastRun.inserted} added · ${lastRun.enriched} enriched`,
            timestamp: lastRun.at,
        };

        const merged = [...rawItems, syntheticItem];
        merged.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
        return merged.slice(0, 5);
    }, [rawItems, lastRun]);

    return (
        <GlassCard className="flex flex-col gap-4">
            <h2 className="text-xs font-semibold text-white/50 uppercase tracking-widest">
                Recent Activity
            </h2>

            {isLoading ? (
                <ul className="space-y-4" aria-busy="true" aria-label="Loading activity…">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <li key={i} className="flex items-start gap-3">
                            <Skeleton className="h-4 w-4 shrink-0 mt-0.5 rounded-full" />
                            <div className="flex-1 space-y-1.5">
                                <Skeleton className="h-3 w-4/5" />
                                <Skeleton className="h-2.5 w-16" />
                            </div>
                        </li>
                    ))}
                </ul>
            ) : items.length === 0 ? (
                <EmptyState
                    compact
                    icon={Activity}
                    title="No activity yet"
                    description="Activity appears once leads are enriched or emailed."
                />
            ) : (
                <ul className="space-y-4" role="list">
                    {items.map((item) => {
                        const { icon: Icon, iconClass, label } = getTypeConfig(item.type);
                        const isLinkable = item.lead_id > 0;
                        const labelText = label(item);

                        return (
                            <li key={item.id} className="flex items-start gap-3">
                                <span className={`shrink-0 mt-0.5 ${iconClass}`} aria-hidden="true">
                                    <Icon size={14} />
                                </span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-white/80 leading-snug">
                                        {isLinkable ? (
                                            <a
                                                href={leadUrl(item.lead_id)}
                                                className="hover:text-white transition-colors focus-visible:outline-none focus-visible:underline"
                                            >
                                                {labelText}
                                            </a>
                                        ) : (
                                            labelText
                                        )}
                                    </p>
                                    <time
                                        className="text-xs text-white/30 mt-0.5 block"
                                        dateTime={item.timestamp}
                                    >
                                        {timeAgo(item.timestamp)}
                                    </time>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </GlassCard>
    );
}
