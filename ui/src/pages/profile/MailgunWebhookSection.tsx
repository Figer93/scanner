import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, Check, Mail, Clock } from 'lucide-react';
import GlassCard from '../../components/ui/GlassCard';
import { Skeleton } from '../../components/ui/SkeletonCard';
import api from '../../api/client';

interface MailgunStatus {
    // For now reuse Brevo-style status if needed later; keep minimal.
    lastWebhookAt: string | null;
    webhookEventCount: number;
}

function useMailgunWebhookStatus() {
    return useQuery<MailgunStatus>({
        queryKey: ['webhooks', 'mailgun', 'status'],
        queryFn: () => api.get('/api/webhooks/mailgun/status'),
        staleTime: 30_000,
    });
}

function formatRelativeTime(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

export default function MailgunWebhookSection() {
    const [copiedEvents, setCopiedEvents] = useState(false);
    const [copiedInbound, setCopiedInbound] = useState(false);
    const { data: status, isLoading } = useMailgunWebhookStatus();

    const eventsUrl =
        typeof window !== 'undefined'
            ? `${window.location.origin}/api/webhooks/mailgun/events`
            : '/api/webhooks/mailgun/events';
    const inboundUrl =
        typeof window !== 'undefined'
            ? `${window.location.origin}/api/webhooks/mailgun/inbound`
            : '/api/webhooks/mailgun/inbound';

    const handleCopyEvents = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(eventsUrl);
            setCopiedEvents(true);
            setTimeout(() => setCopiedEvents(false), 2000);
        } catch {
            setCopiedEvents(false);
        }
    }, [eventsUrl]);

    const handleCopyInbound = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(inboundUrl);
            setCopiedInbound(true);
            setTimeout(() => setCopiedInbound(false), 2000);
        } catch {
            setCopiedInbound(false);
        }
    }, [inboundUrl]);

    return (
        <GlassCard className="p-6">
            <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                <Mail size={18} className="text-white/50" aria-hidden="true" />
                Email tracking (Mailgun)
            </h2>
            <p className="text-xs text-white/60 mb-4">
                Use these URLs in your Mailgun dashboard. Configure a Route for inbound replies and a webhook for events (delivered, opened, clicked, bounced).
            </p>

            <div className="space-y-3 mb-4">
                <div>
                    <p className="text-xs font-medium text-white/50 uppercase tracking-wider mb-1">Event webhooks (opens, clicks, delivered, bounced)</p>
                    <div className="flex flex-wrap items-center gap-2">
                        <code className="text-sm text-white/80 bg-white/5 border border-white/10 rounded-lg px-3 py-2 flex-1 min-w-0 break-all">
                            {eventsUrl}
                        </code>
                        <button
                            type="button"
                            onClick={handleCopyEvents}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white/80 hover:bg-white/15 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)] shrink-0"
                            aria-label="Copy Mailgun events webhook URL"
                        >
                            {copiedEvents ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                            <span className="text-xs font-medium">{copiedEvents ? 'Copied' : 'Copy'}</span>
                        </button>
                    </div>
                </div>
                <div>
                    <p className="text-xs font-medium text-white/50 uppercase tracking-wider mb-1">Inbound replies (Routes)</p>
                    <p className="text-xs text-white/50 mb-1">
                        In Mailgun Routes, forward matching replies (e.g. to your outbound domain) to this URL as a POST. Replies will show up in the
                        Conversations chat.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                        <code className="text-sm text-white/80 bg-white/5 border border-white/10 rounded-lg px-3 py-2 flex-1 min-w-0 break-all">
                            {inboundUrl}
                        </code>
                        <button
                            type="button"
                            onClick={handleCopyInbound}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white/80 hover:bg-white/15 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)] shrink-0"
                            aria-label="Copy Mailgun inbound webhook URL"
                        >
                            {copiedInbound ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                            <span className="text-xs font-medium">{copiedInbound ? 'Copied' : 'Copy'}</span>
                        </button>
                    </div>
                </div>
            </div>

            {isLoading ? (
                <div className="flex flex-wrap gap-4">
                    <Skeleton className="h-5 w-24 rounded" />
                    <Skeleton className="h-5 w-32 rounded" />
                </div>
            ) : status ? (
                <div className="flex flex-wrap items-center gap-4 text-xs text-white/50">
                    <span className="flex items-center gap-1.5">
                        <Clock size={12} aria-hidden="true" />
                        Last webhook: {formatRelativeTime(status.lastWebhookAt)}
                    </span>
                    <span>
                        Events received: <strong className="text-white/70 tabular-nums">{status.webhookEventCount}</strong>
                    </span>
                </div>
            ) : null}
        </GlassCard>
    );
}

