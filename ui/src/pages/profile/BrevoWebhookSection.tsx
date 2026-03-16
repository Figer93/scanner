/**
 * Brevo webhook URL and status for email tracking.
 * Shows the URL to configure in Brevo and whether webhooks are being received.
 */

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, Check, Mail, Shield, Clock } from 'lucide-react';
import GlassCard from '../../components/ui/GlassCard';
import { Skeleton } from '../../components/ui/SkeletonCard';
import api from '../../api/client';

interface BrevoStatus {
    secretConfigured: boolean;
    lastWebhookAt: string | null;
    webhookEventCount: number;
}

function useBrevoWebhookStatus() {
    return useQuery<BrevoStatus>({
        queryKey: ['webhooks', 'brevo', 'status'],
        queryFn: () => api.get('/api/webhooks/brevo/status'),
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

export default function BrevoWebhookSection() {
    const [copied, setCopied] = useState(false);
    const { data: status, isLoading } = useBrevoWebhookStatus();

    const webhookUrl =
        typeof window !== 'undefined'
            ? `${window.location.origin}/api/webhooks/brevo`
            : '/api/webhooks/brevo';

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(webhookUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // fallback for older browsers
            setCopied(false);
        }
    }, [webhookUrl]);

    return (
        <GlassCard className="p-6">
            <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                <Mail size={18} className="text-white/50" aria-hidden="true" />
                Email tracking (Brevo)
            </h2>
            <p className="text-xs text-white/60 mb-4">
                Use the URLs below in Brevo. Set{' '}
                <code className="text-white/50 bg-white/10 px-1 rounded">BREVO_WEBHOOK_SECRET</code>{' '}
                in .env or in Profile so the endpoint accepts requests (e.g. add <code className="text-white/50 bg-white/10 px-1 rounded">?secret=your_secret</code> to the URL in Brevo if needed).
            </p>

            <div className="space-y-3 mb-4">
                <div>
                    <p className="text-xs font-medium text-white/50 uppercase tracking-wider mb-1">Transactional (opens, clicks, delivered)</p>
                    <div className="flex flex-wrap items-center gap-2">
                        <code className="text-sm text-white/80 bg-white/5 border border-white/10 rounded-lg px-3 py-2 flex-1 min-w-0 break-all">
                            {webhookUrl}
                        </code>
                        <button
                            type="button"
                            onClick={handleCopy}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white/80 hover:bg-white/15 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)] shrink-0"
                            aria-label="Copy transactional webhook URL"
                        >
                            {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                            <span className="text-xs font-medium">{copied ? 'Copied' : 'Copy'}</span>
                        </button>
                    </div>
                </div>
                <div>
                    <p className="text-xs font-medium text-white/50 uppercase tracking-wider mb-1">Inbound (replies)</p>
                    <p className="text-xs text-white/50 mb-1">To track when someone replies: Brevo → Inbound parsing → add webhook with this URL. Replies will then update status to Replied.</p>
                    <code className="text-sm text-white/80 bg-white/5 border border-white/10 rounded-lg px-3 py-2 block break-all">
                        {webhookUrl}/inbound
                    </code>
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
                        <Shield size={12} aria-hidden="true" />
                        Secret: {status.secretConfigured ? (
                            <span className="text-emerald-400/90">yes</span>
                        ) : (
                            <span className="text-amber-400/90">no</span>
                        )}
                    </span>
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
