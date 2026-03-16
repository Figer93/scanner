/**
 * Earnings — Phase 3A: monthly overview, settings, weekly chart, top templates.
 */

import { useState, useCallback, useEffect } from 'react';
import {
    Send,
    MailOpen,
    MessageSquare,
    MousePointerClick,
    Users,
    Banknote,
    Settings,
    Save,
    TrendingUp,
} from 'lucide-react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from 'recharts';
import { useQueryClient } from '@tanstack/react-query';
import { useEarnings, earningsKeys } from '../hooks/useEarnings';
import { useProfile, useSaveProfile } from '../hooks/useProfile';
import { GlassCard, Button, Input } from '../components/ui';
import { Skeleton } from '../components/ui/SkeletonCard';
import EmptyState from '../components/ui/EmptyState';

const DEFAULT_CONVERSION_PCT = 15;

function formatWeekLabel(weekKey: string): string {
    if (!weekKey || weekKey.length < 7) return weekKey;
    const [y, w] = weekKey.split('-');
    return `W${w} ${y}`;
}

export default function Earnings() {
    const queryClient = useQueryClient();
    const { data: earnings, isLoading, error } = useEarnings();
    const { data: profile } = useProfile();
    const saveProfile = useSaveProfile();

    const [referralPounds, setReferralPounds] = useState<string>('');
    const [conversionPct, setConversionPct] = useState<string>(String(DEFAULT_CONVERSION_PCT));
    const [saving, setSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    const referralNum = profile?.earnings_referral_pounds ?? earnings?.overview.referralPounds ?? null;
    const conversionNum = profile?.earnings_conversion_rate_pct ?? earnings?.overview.conversionRatePct ?? DEFAULT_CONVERSION_PCT;

    useEffect(() => {
        setReferralPounds(referralNum != null ? String(referralNum) : '');
        setConversionPct(conversionNum != null ? String(conversionNum) : String(DEFAULT_CONVERSION_PCT));
    }, [referralNum, conversionNum]);

    const handleSaveSettings = useCallback(async () => {
        setSaving(true);
        setSaveMessage(null);
        try {
            await saveProfile.mutateAsync({
                earnings_referral_pounds: referralPounds.trim() === '' ? undefined : parseFloat(referralPounds),
                earnings_conversion_rate_pct: conversionPct.trim() === '' ? DEFAULT_CONVERSION_PCT : parseFloat(conversionPct),
            });
            void queryClient.invalidateQueries({ queryKey: earningsKeys.data() });
            setSaveMessage({ text: 'Earnings settings saved.', type: 'success' });
        } catch (e) {
            setSaveMessage({
                text: e instanceof Error ? e.message : 'Save failed',
                type: 'error',
            });
        } finally {
            setSaving(false);
        }
    }, [referralPounds, conversionPct, saveProfile]);

    if (error) {
        return (
            <div className="space-y-6">
                <h1 className="text-2xl font-semibold text-white tracking-tight">Earnings</h1>
                <div className="p-6 rounded-2xl bg-red-500/10 border border-red-400/20" role="alert">
                    <p className="text-red-200 font-medium">
                        {error instanceof Error ? error.message : 'Failed to load earnings'}
                    </p>
                </div>
            </div>
        );
    }

    const overview = earnings?.overview;
    const weekly = earnings?.weekly ?? [];
    const topTemplates = earnings?.topTemplates ?? [];
    const chartData = weekly.map((w) => ({
        name: formatWeekLabel(w.week),
        sent: w.sent,
        opened: w.opened,
        replied: w.replied,
    }));

    return (
        <div className="space-y-6 max-w-screen-2xl mx-auto">
            <header>
                <h1 className="text-2xl font-semibold text-white tracking-tight flex items-center gap-2">
                    <Banknote size={24} className="text-white/50" aria-hidden="true" />
                    Earnings
                </h1>
                <p className="text-sm text-white/50 mt-1">
                    ROI from referral outreach: open rate, conversions, and estimated earnings.
                </p>
            </header>

            {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6">
                    {[...Array(6)].map((_, i) => (
                        <GlassCard key={i} className="p-5">
                            <Skeleton className="h-8 w-16 mb-2" />
                            <Skeleton className="h-4 w-24" />
                        </GlassCard>
                    ))}
                    <GlassCard className="p-6 col-span-full md:col-span-2">
                        <Skeleton className="h-64 w-full" />
                    </GlassCard>
                    <GlassCard className="p-6">
                        <Skeleton className="h-48 w-full" />
                    </GlassCard>
                </div>
            ) : (
                <>
                    {/* Monthly overview bento */}
                    <section aria-label="Monthly overview" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6">
                        <GlassCard className="p-5">
                            <Send size={17} className="text-sky-400 mb-2 opacity-75" aria-hidden="true" />
                            <p className="text-2xl font-bold text-white tracking-tight tabular-nums">
                                {overview?.sent ?? 0}
                            </p>
                            <p className="text-xs text-white/45">Emails sent this month</p>
                        </GlassCard>
                        <GlassCard className="p-5">
                            <MailOpen size={17} className="text-amber-400 mb-2 opacity-75" aria-hidden="true" />
                            <p className="text-2xl font-bold text-white tracking-tight tabular-nums">
                                {overview?.openRatePct ?? 0}%
                            </p>
                            <p className="text-xs text-white/45">Open rate</p>
                        </GlassCard>
                        <GlassCard className="p-5">
                            <MessageSquare size={17} className="text-emerald-400 mb-2 opacity-75" aria-hidden="true" />
                            <p className="text-2xl font-bold text-white tracking-tight tabular-nums">
                                {overview?.replyRatePct ?? 0}%
                            </p>
                            <p className="text-xs text-white/45">Reply rate</p>
                        </GlassCard>
                        <GlassCard className="p-5">
                            <MousePointerClick size={17} className="text-violet-400 mb-2 opacity-75" aria-hidden="true" />
                            <p className="text-2xl font-bold text-white tracking-tight tabular-nums">
                                {overview?.clicks ?? 0}
                            </p>
                            <p className="text-xs text-white/45">Referral link clicks</p>
                        </GlassCard>
                        <GlassCard className="p-5">
                            <Users size={17} className="text-indigo-400 mb-2 opacity-75" aria-hidden="true" />
                            <p className="text-2xl font-bold text-white tracking-tight tabular-nums">
                                {overview?.estimatedConversions ?? 0}
                            </p>
                            <p className="text-xs text-white/45">Est. conversions</p>
                        </GlassCard>
                        <GlassCard className="p-5 border-[var(--color-border-active)] shadow-[var(--shadow-glow)]">
                            <Banknote size={17} className="text-emerald-400 mb-2 opacity-75" aria-hidden="true" />
                            <p className="text-2xl font-bold text-white tracking-tight tabular-nums">
                                {overview?.estimatedEarnings != null
                                    ? `£${overview.estimatedEarnings.toFixed(2)}`
                                    : '—'}
                            </p>
                            <p className="text-xs text-white/45">Est. earnings</p>
                        </GlassCard>
                    </section>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6">
                        {/* Settings card */}
                        <GlassCard className="p-6">
                            <h2 className="text-sm font-semibold text-white/80 uppercase tracking-wider flex items-center gap-2 mb-4">
                                <Settings size={16} className="text-white/50" aria-hidden="true" />
                                Settings
                            </h2>
                            <div className="space-y-4">
                                <div>
                                    <label htmlFor="earnings-referral-pounds" className="block text-xs font-medium text-white/70 mb-1">
                                        Revolut pays me £ ___ per referral
                                    </label>
                                    <Input
                                        id="earnings-referral-pounds"
                                        type="number"
                                        min={0}
                                        step={1}
                                        placeholder="e.g. 50"
                                        value={referralPounds}
                                        onChange={(e) => setReferralPounds(e.target.value)}
                                        className="bg-white/5 border-white/10"
                                        aria-label="Pounds per referral"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="earnings-conversion-pct" className="block text-xs font-medium text-white/70 mb-1">
                                        My estimated conversion rate: ___ %
                                    </label>
                                    <Input
                                        id="earnings-conversion-pct"
                                        type="number"
                                        min={0}
                                        max={100}
                                        step={0.5}
                                        placeholder="15"
                                        value={conversionPct}
                                        onChange={(e) => setConversionPct(e.target.value)}
                                        className="bg-white/5 border-white/10"
                                        aria-label="Conversion rate percent"
                                    />
                                </div>
                                {saveMessage && (
                                    <p
                                        className={`text-sm ${saveMessage.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}
                                        role="status"
                                    >
                                        {saveMessage.text}
                                    </p>
                                )}
                                <Button
                                    onClick={handleSaveSettings}
                                    disabled={saving}
                                    className="flex items-center gap-2"
                                >
                                    <Save size={14} aria-hidden="true" />
                                    {saving ? 'Saving…' : 'Save'}
                                </Button>
                            </div>
                        </GlassCard>

                        {/* Weekly performance chart — col-span-2 */}
                        <GlassCard className="p-6 md:col-span-2">
                            <h2 className="text-sm font-semibold text-white/80 uppercase tracking-wider flex items-center gap-2 mb-4">
                                <TrendingUp size={16} className="text-white/50" aria-hidden="true" />
                                Weekly performance (last 12 weeks)
                            </h2>
                            {chartData.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-center">
                                    <Send size={32} className="text-white/20 mb-3" aria-hidden="true" />
                                    <p className="text-sm text-white/40">No email data yet</p>
                                    <p className="text-xs text-white/30 mt-1">Sent / opened / replied will appear here.</p>
                                </div>
                            ) : (
                                <div className="h-64 motion-safe:transition-opacity">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                                            <XAxis
                                                dataKey="name"
                                                stroke="rgba(255,255,255,0.4)"
                                                tick={{ fontSize: 11 }}
                                                tickLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                                            />
                                            <YAxis
                                                stroke="rgba(255,255,255,0.4)"
                                                tick={{ fontSize: 11 }}
                                                tickLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                                            />
                                            <Tooltip
                                                contentStyle={{
                                                    backgroundColor: 'rgba(10,14,27,0.95)',
                                                    border: '1px solid rgba(255,255,255,0.1)',
                                                    borderRadius: '0.75rem',
                                                }}
                                                labelStyle={{ color: 'rgba(255,255,255,0.9)' }}
                                            />
                                            <Legend
                                                wrapperStyle={{ fontSize: 12 }}
                                                formatter={(value) => <span className="text-white/70">{value}</span>}
                                            />
                                            <Line type="monotone" dataKey="sent" stroke="#38bdf8" strokeWidth={2} name="Sent" dot={false} />
                                            <Line type="monotone" dataKey="opened" stroke="#fbbf24" strokeWidth={2} name="Opened" dot={false} />
                                            <Line type="monotone" dataKey="replied" stroke="#34d399" strokeWidth={2} name="Replied" dot={false} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </GlassCard>
                    </div>

                    {/* Top performing templates */}
                    <section aria-label="Top performing templates">
                        <GlassCard className="p-6">
                            <h2 className="text-sm font-semibold text-white/80 uppercase tracking-wider mb-4">
                                Top performing templates
                            </h2>
                            {topTemplates.length === 0 ? (
                                <EmptyState
                                    icon={Send}
                                    title="No template data yet"
                                    description="Send emails using templates to see performance here."
                                />
                            ) : (
                                <div className="overflow-x-auto rounded-[var(--radius-inner)] bg-white/[0.04]">
                                    <table className="w-full text-left text-sm" role="table" aria-label="Template performance">
                                        <caption className="sr-only">Template name, sent count, open rate, reply rate, estimated conversions</caption>
                                        <thead>
                                            <tr className="border-b border-white/10">
                                                <th scope="col" className="py-3 px-4 font-medium text-white/70">Template</th>
                                                <th scope="col" className="py-3 px-4 font-medium text-white/70 text-right">Sent</th>
                                                <th scope="col" className="py-3 px-4 font-medium text-white/70 text-right">Open rate</th>
                                                <th scope="col" className="py-3 px-4 font-medium text-white/70 text-right">Reply rate</th>
                                                <th scope="col" className="py-3 px-4 font-medium text-white/70 text-right">Est. conversions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {topTemplates.map((row) => (
                                                <tr key={row.templateId} className="border-b border-white/5 hover:bg-white/5">
                                                    <td className="py-3 px-4 text-white/90">{row.templateName}</td>
                                                    <td className="py-3 px-4 text-white/80 text-right tabular-nums">{row.sent}</td>
                                                    <td className="py-3 px-4 text-white/80 text-right tabular-nums">{row.openRatePct}%</td>
                                                    <td className="py-3 px-4 text-white/80 text-right tabular-nums">{row.replyRatePct}%</td>
                                                    <td className="py-3 px-4 text-white/80 text-right tabular-nums">{row.estimatedConversions}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </GlassCard>
                    </section>
                </>
            )}
        </div>
    );
}
