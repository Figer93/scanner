/**
 * Overview section: API usage table, cost per lead, score distribution, funnel.
 * Each sub-card manages its own loading/error state via React Query.
 */

import { BarChart3, DollarSign, Target, TrendingUp } from 'lucide-react';
import { GlassCard } from '../../components/ui';
import { Skeleton } from '../../components/ui/SkeletonCard';
import { useUsageStats } from '../../hooks/useProfile';
import { useFunnelStats, useCostPerLead, useScoreDistribution } from '../../hooks/useAnalytics';

const SERVICES = ['serper', 'companies_house', 'google_places', 'google_ai', 'apify'] as const;

function ErrorRetry({ label, error, onRetry }: { label: string; error: unknown; onRetry: () => void }) {
    return (
        <div className="text-sm text-red-300">
            {label}: {error instanceof Error ? error.message : 'Failed to load'}{' '}
            <button type="button" className="underline hover:text-white" onClick={onRetry}>Retry</button>
        </div>
    );
}

function CardTitle({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
    return (
        <h3 className="text-sm font-semibold text-white/80 mb-3 flex items-center gap-2">
            <Icon size={15} className="text-white/40" aria-hidden="true" />
            {children}
        </h3>
    );
}

export default function UsageSection() {
    const { data: usage, error: usageError, refetch: refetchUsage, isLoading: usageLoading } = useUsageStats();
    const { data: costPerLead, error: costError, refetch: refetchCost } = useCostPerLead();
    const { data: scoreDist, error: scoreError, refetch: refetchScore } = useScoreDistribution();
    const { data: funnel, error: funnelError, refetch: refetchFunnel } = useFunnelStats();

    return (
        <GlassCard className="p-6">
            <h2 className="text-lg font-semibold text-white mb-2">Overview</h2>
            <p className="text-xs text-white/50 mb-4">Usage and analytics from the database. Each block loads separately.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Usage table */}
                <div className="p-4 rounded-xl bg-white/4 border border-white/10">
                    <CardTitle icon={BarChart3}>Usage</CardTitle>
                    {usageError && <ErrorRetry label="Usage" error={usageError} onRetry={() => void refetchUsage()} />}
                    {usageLoading && <div className="space-y-2"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-4/5" /><Skeleton className="h-3 w-3/5" /></div>}
                    {usage && !usageError && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs text-white/70">
                                <thead>
                                    <tr className="text-left text-white/50">
                                        <th className="pb-2 pr-3 font-medium" scope="col">Service</th>
                                        <th className="pb-2 pr-3 font-medium" scope="col">Requests</th>
                                        <th className="pb-2 pr-3 font-medium" scope="col">Tokens (in/out)</th>
                                        <th className="pb-2 pr-3 font-medium" scope="col">Est. cost (GBP)</th>
                                        <th className="pb-2 font-medium" scope="col">Last called</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {SERVICES.map((s) => {
                                        const row = (usage as Record<string, Record<string, unknown>>)?.[s];
                                        return (
                                            <tr key={s} className="border-t border-white/5">
                                                <td className="py-1.5 pr-3">{s}</td>
                                                <td className="py-1.5 pr-3">{(row?.request_count as number) ?? 0}</td>
                                                <td className="py-1.5 pr-3">{s === 'google_ai' ? `${(row?.total_input_tokens as number) ?? 0} / ${(row?.total_output_tokens as number) ?? 0}` : '—'}</td>
                                                <td className="py-1.5 pr-3">{row?.total_cost_gbp != null ? Number(row.total_cost_gbp).toFixed(4) : '—'}</td>
                                                <td className="py-1.5">{row?.last_called ? new Date(row.last_called as string).toLocaleString() : '—'}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Cost per lead */}
                <div className="p-4 rounded-xl bg-white/4 border border-white/10">
                    <CardTitle icon={DollarSign}>Cost per lead</CardTitle>
                    {costError && <ErrorRetry label="Cost" error={costError} onRetry={() => void refetchCost()} />}
                    {costPerLead && !costError && (
                        <ul className="space-y-1 text-sm text-white/70">
                            <li>Total cost (GBP): <strong className="text-white/90">{costPerLead.totalCostGbp?.toFixed(4) ?? '0'}</strong></li>
                            <li>Total leads: <strong className="text-white/90">{costPerLead.totalLeads ?? 0}</strong></li>
                            <li>Qualified/Converted: <strong className="text-white/90">{costPerLead.qualifiedLeads ?? 0}</strong></li>
                            <li>Cost per lead: <strong className="text-white/90">{costPerLead.costPerLead != null ? costPerLead.costPerLead.toFixed(4) : '—'}</strong> GBP</li>
                            <li>Cost per qualified: <strong className="text-white/90">{costPerLead.costPerQualifiedLead != null ? costPerLead.costPerQualifiedLead.toFixed(4) : '—'}</strong> GBP</li>
                        </ul>
                    )}
                </div>

                {/* Score distribution */}
                <div className="p-4 rounded-xl bg-white/4 border border-white/10">
                    <CardTitle icon={Target}>Score distribution</CardTitle>
                    {scoreError && <ErrorRetry label="Scores" error={scoreError} onRetry={() => void refetchScore()} />}
                    {scoreDist && !scoreError && (() => {
                        const { low, mid, high } = scoreDist;
                        const maxVal = Math.max(1, low, mid, high);
                        const pct = (n: number) => Math.round((n / maxVal) * 100);
                        const bars: Array<{ label: string; value: number; color: string }> = [
                            { label: '1–3', value: low, color: 'bg-red-500/60' },
                            { label: '4–6', value: mid, color: 'bg-amber-500/60' },
                            { label: '7–10', value: high, color: 'bg-emerald-500/60' },
                        ];
                        return (
                            <div className="space-y-2">
                                {bars.map((b) => (
                                    <div key={b.label} className="flex items-center gap-2" title={`Score ${b.label}: ${b.value} leads`}>
                                        <span className="text-xs text-white/50 w-8 text-right">{b.label}</span>
                                        <div className="flex-1 h-4 rounded-full bg-white/5 overflow-hidden">
                                            <div className={`h-full rounded-full ${b.color} transition-all`} style={{ width: `${pct(b.value)}%` }} />
                                        </div>
                                        <span className="text-xs text-white/70 w-8">{b.value}</span>
                                    </div>
                                ))}
                            </div>
                        );
                    })()}
                </div>

                {/* Funnel */}
                <div className="p-4 rounded-xl bg-white/4 border border-white/10">
                    <CardTitle icon={TrendingUp}>Funnel (by status &amp; source)</CardTitle>
                    {funnelError && <ErrorRetry label="Funnel" error={funnelError} onRetry={() => void refetchFunnel()} />}
                    {funnel && !funnelError && (
                        <>
                            <div className="grid grid-cols-2 gap-4 text-sm text-white/70">
                                <div>
                                    <strong className="block text-xs text-white/50 mb-1">By status</strong>
                                    <ul className="space-y-0.5">
                                        {Object.entries(funnel.byStatus || {}).map(([status, count]) => (
                                            <li key={status}>{status}: <strong className="text-white/90">{count as number}</strong></li>
                                        ))}
                                    </ul>
                                </div>
                                <div>
                                    <strong className="block text-xs text-white/50 mb-1">By source</strong>
                                    <ul className="space-y-0.5">
                                        {Object.entries(funnel.bySource || {}).map(([src, count]) => (
                                            <li key={src}>{src}: <strong className="text-white/90">{count as number}</strong></li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                            <p className="text-sm text-white/60 mt-3">Total leads: <strong className="text-white/90">{funnel.total ?? 0}</strong></p>
                        </>
                    )}
                </div>
            </div>
        </GlassCard>
    );
}
