/**
 * EmailPerformance — open rate and reply rate for the last 30 days.
 * Uses CSS-only progress bars, no charting library required.
 */

import type { LucideIcon } from 'lucide-react';
import { Send, MailCheck, MessageSquareText } from 'lucide-react';
import GlassCard from '../../components/ui/GlassCard';
import GlassCardInner from '../../components/ui/GlassCardInner';
import { Skeleton } from '../../components/ui/SkeletonCard';
import { useEmailPerformance } from '../../hooks/useAnalytics';

interface RateBarProps {
    label: string;
    icon: LucideIcon;
    rate: number;
    count: number;
    total: number;
    iconClass: string;
    barClass: string;
}

function RateBar({ label, icon: Icon, rate, count, total, iconClass, barClass }: RateBarProps) {
    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between">
                <span className={`flex items-center gap-1.5 text-xs font-medium ${iconClass}`}>
                    <Icon size={13} aria-hidden="true" />
                    {label}
                </span>
                <span className="text-sm font-bold text-white tabular-nums">{rate}%</span>
            </div>
            <div
                className="h-1.5 rounded-full bg-white/10 overflow-hidden"
                role="progressbar"
                aria-valuenow={rate}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${label}: ${rate}%`}
            >
                <div
                    className={`h-full rounded-full motion-safe:transition-all motion-safe:duration-700 ${barClass}`}
                    style={{ width: `${Math.min(rate, 100)}%` }}
                />
            </div>
            <p className="text-xs text-white/30">
                {count.toLocaleString()} of {total.toLocaleString()}
            </p>
        </div>
    );
}

export default function EmailPerformance() {
    const { data, isLoading } = useEmailPerformance(30);

    return (
        <GlassCard className="flex flex-col gap-5">
            <div className="flex items-start justify-between">
                <h2 className="text-xs font-semibold text-white/50 uppercase tracking-widest">
                    Email Performance
                </h2>
                <span className="text-xs text-white/30 mt-0.5 shrink-0">Last 30 days</span>
            </div>

            {isLoading ? (
                <div className="space-y-5">
                    <Skeleton className="h-12 rounded-xl" />
                    <Skeleton className="h-10" />
                    <Skeleton className="h-10" />
                </div>
            ) : !data || data.sent === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                    <Send size={28} className="text-white/20 mb-3" aria-hidden="true" />
                    <p className="text-sm text-white/40 font-medium">No emails sent yet</p>
                    <p className="text-xs text-white/25 mt-1 leading-relaxed max-w-[180px]">
                        Performance metrics appear once you start outreach.
                    </p>
                </div>
            ) : (
                <>
                    <GlassCardInner className="flex items-center gap-3 px-4 py-3">
                        <Send size={15} className="text-white/35 shrink-0" aria-hidden="true" />
                        <div>
                            <p className="text-xl font-bold text-white leading-none tabular-nums">
                                {data.sent.toLocaleString()}
                            </p>
                            <p className="text-xs text-white/40 mt-0.5">emails sent</p>
                        </div>
                    </GlassCardInner>

                    <div className="space-y-5">
                        <RateBar
                            label="Open rate"
                            icon={MailCheck}
                            rate={data.openRate}
                            count={data.opened}
                            total={data.sent}
                            iconClass="text-amber-400"
                            barClass="bg-amber-400"
                        />
                        <RateBar
                            label="Reply rate"
                            icon={MessageSquareText}
                            rate={data.replyRate}
                            count={data.replied}
                            total={data.sent}
                            iconClass="text-emerald-400"
                            barClass="bg-emerald-400"
                        />
                    </div>
                </>
            )}
        </GlassCard>
    );
}
