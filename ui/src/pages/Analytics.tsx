/**
 * Analytics — list performance metrics.
 */

import { useState, useEffect } from 'react';
import { BarChart3 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import { GlassCard, Select } from '../components/ui';
import { SkeletonCard } from '../components/ui/SkeletonCard';
import EmptyState from '../components/ui/EmptyState';
import { useLists } from '../hooks/useLists';

interface ListAnalytics {
    listId: number;
    totalLeads: number;
    emailsSent: number;
    opened: number;
    replied: number;
    converted: number;
    conversionRate: number | null;
    byStatus: Record<string, number>;
}

const STATUS_LABELS = ['New', 'Enriched', 'Email Sent', 'Opened', 'Waiting for Reply', 'Replied', 'Converted'];

function getListIdFromSearch(): string {
    if (typeof window === 'undefined') return '';
    const hash = window.location.hash.replace(/^#/, '');
    const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
    return new URLSearchParams(query).get('listId') || '';
}

export default function Analytics() {
    const { data: lists = [] } = useLists();
    const [selectedListId, setSelectedListId] = useState(() => getListIdFromSearch());

    useEffect(() => {
        const fromUrl = getListIdFromSearch();
        if (fromUrl && lists.some((l) => String(l.id) === fromUrl)) {
            setSelectedListId(fromUrl);
        } else if (lists.length > 0 && !selectedListId) {
            setSelectedListId(String(lists[0]!.id));
        }
    }, [lists, selectedListId]);

    const { data: analytics, isLoading, error } = useQuery<ListAnalytics>({
        queryKey: ['analytics', 'list', selectedListId],
        queryFn: () => api.get(`/api/analytics/lists/${selectedListId}`),
        enabled: !!selectedListId,
        staleTime: 30_000,
    });

    const selectedList = lists.find((l) => String(l.id) === selectedListId);

    const STAT_CARDS = analytics ? [
        { label: 'Total leads', value: analytics.totalLeads },
        { label: 'Emails sent', value: analytics.emailsSent },
        { label: 'Opened', value: analytics.opened },
        { label: 'Replied', value: analytics.replied },
        { label: 'Converted', value: analytics.converted },
        { label: 'Conversion rate', value: analytics.conversionRate != null ? `${Number(analytics.conversionRate).toFixed(1)}%` : '—', highlight: true },
    ] : [];

    return (
        <div className="space-y-6 w-full">
            <GlassCard className="p-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <h2 className="text-xl font-semibold text-white tracking-tight flex items-center gap-2">
                        <BarChart3 size={20} className="text-white/50" aria-hidden="true" />List performance
                    </h2>
                    <Select className="min-w-[220px]" value={selectedListId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedListId(e.target.value)} aria-label="Select list">
                        <option value="">Select a list</option>
                        {lists.map((l) => (
                            <option key={l.id} value={String(l.id)}>{l.name} {l.lead_count != null ? `(${l.lead_count} leads)` : ''}</option>
                        ))}
                    </Select>
                </div>
            </GlassCard>

            {error && <div className="p-4 rounded-xl bg-red-500/20 border border-red-400/30 text-red-200 text-sm" role="alert">{error instanceof Error ? error.message : 'Failed to load analytics'}</div>}

            {lists.length === 0 && (
                <EmptyState icon={BarChart3} title="No lists yet" description="Create lists from Find leads to see analytics here." />
            )}
            {lists.length > 0 && !selectedListId && (
                <p className="text-white/60 text-sm">Select a list to see conversion rates, emails sent, and reply counts.</p>
            )}

            {isLoading && selectedListId && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                    {[...Array(6)].map((_, i) => <SkeletonCard key={i} rows={1} />)}
                </div>
            )}

            {analytics && !isLoading && (
                <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                        {STAT_CARDS.map(({ label, value, highlight }) => (
                            <GlassCard key={label} className={`p-5 ${highlight ? 'border-[var(--color-border-active)] shadow-glow' : ''}`}>
                                <span className="block text-xs font-medium text-white/60 mb-1">{label}</span>
                                <span className="text-2xl font-semibold text-white tracking-tight">{value}</span>
                            </GlassCard>
                        ))}
                    </div>

                    {analytics.byStatus && Object.keys(analytics.byStatus).length > 0 && (
                        <GlassCard className="p-6">
                            <h3 className="text-lg font-semibold text-white mb-4 tracking-tight">
                                Leads by status {selectedList && <span className="text-white/50 font-normal">— {selectedList.name}</span>}
                            </h3>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                {STATUS_LABELS.map((status) => (
                                    <div key={status} className="p-3 rounded-xl bg-white/5 border border-white/10 flex justify-between items-center">
                                        <span className="text-sm text-white/80">{status}</span>
                                        <span className="font-semibold text-white">{analytics.byStatus[status] ?? 0}</span>
                                    </div>
                                ))}
                                {Object.keys(analytics.byStatus).filter((s) => !STATUS_LABELS.includes(s)).map((status) => (
                                    <div key={status} className="p-3 rounded-xl bg-white/5 border border-white/10 flex justify-between items-center">
                                        <span className="text-sm text-white/80">{status}</span>
                                        <span className="font-semibold text-white">{analytics.byStatus[status] ?? 0}</span>
                                    </div>
                                ))}
                            </div>
                        </GlassCard>
                    )}
                </>
            )}
        </div>
    );
}
