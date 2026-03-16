/**
 * Database Management — global stats dashboard and bulk actions.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Database, Zap, Mail, Inbox, Pause, Play } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { GlassCard, Button, Select } from '../components/ui';
import { SkeletonGrid } from '../components/ui/SkeletonCard';

interface DbStats {
    totalLeads: number;
    leadsWithEmails: number;
    leadsWithWebsite: number;
    newLeads: number;
    enrichedLeads: number;
    emailSentCount: number;
    listCount: number;
    chCacheCount: number;
}

interface JobStatus {
    running: boolean;
    job: string | null;
    processed: number;
    total: number;
    error: string | null;
}

interface ListItem {
    id: number;
    name: string;
    description: string | null;
    lead_count: number | null;
}

interface QueueStatus {
    scheduledToday: number;
    sentToday: number;
    dailyLimit: number;
    nextSendInMinutes: number | null;
    paused: boolean;
    lastScheduled: Array<{ company_name: string; template_name: string; scheduled_at: string; score?: number | null }>;
}

const STAT_LABELS: Array<{ key: keyof DbStats; label: string }> = [
    { key: 'totalLeads', label: 'Total leads' },
    { key: 'leadsWithEmails', label: 'Leads with emails' },
    { key: 'leadsWithWebsite', label: 'Leads with website' },
    { key: 'newLeads', label: 'New (to enrich)' },
    { key: 'enrichedLeads', label: 'Enriched' },
    { key: 'emailSentCount', label: 'Email sent' },
    { key: 'listCount', label: 'Lists' },
    { key: 'chCacheCount', label: 'CH cache companies' },
];

export default function DBManagement() {
    const queryClient = useQueryClient();
    const [bulkListId, setBulkListId] = useState('');
    const [message, setMessage] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const wasRunningRef = useRef(false);

    const { data: stats, isLoading: statsLoading, error: statsError } = useQuery<DbStats>({
        queryKey: ['db-stats'],
        queryFn: () => api.get('/api/db/stats'),
        staleTime: 30_000,
    });

    const { data: lists = [], isLoading: listsLoading } = useQuery<ListItem[]>({
        queryKey: ['lists', 'list'],
        queryFn: async () => { const d: ListItem[] = await api.get('/api/lists'); return Array.isArray(d) ? d : []; },
        staleTime: 30_000,
    });

    const { data: jobStatus = { running: false, job: null, processed: 0, total: 0, error: null }, refetch: refetchJob } = useQuery<JobStatus>({
        queryKey: ['db-job-status'],
        queryFn: async () => {
            try {
                const d = await api.get('/api/db/job-status');
                return { running: d.running ?? false, job: d.job ?? null, processed: d.processed ?? 0, total: d.total ?? 0, error: d.error ?? null };
            } catch { return { running: false, job: null, processed: 0, total: 0, error: null }; }
        },
        refetchInterval: (data) => data?.running ? 2000 : false,
        staleTime: 0,
    });

    const { data: queueStatus, refetch: refetchQueue } = useQuery<QueueStatus>({
        queryKey: ['db-queue-status'],
        queryFn: async () => {
            try {
                const d = await api.get('/api/db/queue-status');
                return {
                    scheduledToday: d.scheduledToday ?? 0,
                    sentToday: d.sentToday ?? 0,
                    dailyLimit: d.dailyLimit ?? 50,
                    nextSendInMinutes: d.nextSendInMinutes ?? null,
                    paused: d.paused ?? false,
                    lastScheduled: Array.isArray(d.lastScheduled) ? d.lastScheduled : [],
                };
            } catch { return { scheduledToday: 0, sentToday: 0, dailyLimit: 50, nextSendInMinutes: null, paused: false, lastScheduled: [] }; }
        },
        staleTime: 60_000,
    });

    const setQueuePausedMutation = useMutation({
        mutationFn: (paused: boolean) => api.post('/api/profile', { queue_paused: paused }),
        onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['db-queue-status'] }); },
    });

    useEffect(() => {
        if (wasRunningRef.current && !jobStatus.running) {
            setMessage('Enrichment completed. Stats updated.');
            void queryClient.invalidateQueries({ queryKey: ['db-stats'] });
            void queryClient.invalidateQueries({ queryKey: ['lists'] });
        }
        wasRunningRef.current = jobStatus.running;
        if (jobStatus.error) setMessage('Error: ' + jobStatus.error);
    }, [jobStatus.running, jobStatus.error, queryClient]);

    const refreshAll = useCallback(() => {
        void queryClient.invalidateQueries({ queryKey: ['db-stats'] });
        void queryClient.invalidateQueries({ queryKey: ['lists'] });
    }, [queryClient]);

    const runBulkEnrich = useCallback(async () => {
        setMessage(null);
        try {
            const listId = bulkListId ? parseInt(bulkListId, 10) : undefined;
            const payload = Number.isInteger(listId) && listId! >= 1 ? { listId } : {};
            const res = await api.post('/api/db/bulk-enrich-new', payload) as { jobStarted?: boolean; enriched?: number; message?: string };
            if (res.jobStarted) {
                setMessage('Enrichment started in background. Status updates below.');
                void refetchJob();
            } else if (res.enriched !== undefined) {
                setMessage(res.enriched > 0 ? `Enriched ${res.enriched} new lead(s).` : (res.message || 'No new leads to enrich.'));
                refreshAll();
            } else {
                setMessage(res.message || 'Done.');
                refreshAll();
            }
        } catch (e: unknown) {
            setMessage('Error: ' + (e instanceof Error ? e.message : 'Enrich failed'));
        }
    }, [bulkListId, refetchJob, refreshAll]);

    const runCleanEmails = useCallback(async () => {
        setActionLoading('clean');
        setMessage(null);
        try {
            const listId = bulkListId ? parseInt(bulkListId, 10) : undefined;
            const payload = Number.isInteger(listId) && listId! >= 1 ? { listId } : {};
            const data = await api.post('/api/db/clean-invalid-emails', payload) as { updated: number };
            setMessage(data.updated > 0 ? `Cleaned invalid emails on ${data.updated} lead(s).` : 'No invalid emails to clean.');
            void queryClient.invalidateQueries({ queryKey: ['db-stats'] });
        } catch (e: unknown) {
            setMessage('Error: ' + (e instanceof Error ? e.message : 'Clean failed'));
        } finally { setActionLoading(null); }
    }, [bulkListId, queryClient]);

    if (statsLoading) {
        return (
            <div className="space-y-6 w-full">
                <h1 className="text-2xl font-semibold text-white tracking-tight flex items-center gap-2"><Database size={22} className="text-white/50" />Database Management</h1>
                <SkeletonGrid count={4} cols={2} />
            </div>
        );
    }

    return (
        <div className="space-y-6 w-full">
            <div>
                <h1 className="text-2xl font-semibold text-white tracking-tight flex items-center gap-2">
                    <Database size={22} className="text-white/50" aria-hidden="true" />Database Management
                </h1>
                <p className="text-sm text-white/70 mt-1">Global stats and bulk actions.</p>
            </div>

            {statsError && <div className="p-4 rounded-xl bg-red-500/20 border border-red-400/30 text-red-200 text-sm" role="alert">{statsError instanceof Error ? statsError.message : 'Failed to load stats'}</div>}
            {message && <div className={`p-4 rounded-xl text-sm ${message.startsWith('Error') ? 'bg-red-500/20 border border-red-400/30 text-red-200' : 'bg-emerald-500/20 border border-emerald-400/30 text-emerald-200'}`} role="status">{message}</div>}

            {stats && (
                <GlassCard className="p-6">
                    <h2 className="text-lg font-semibold text-white mb-4">Global stats</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
                        {STAT_LABELS.map(({ key, label }) => (
                            <div key={key} className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
                                <span className="block text-xl font-semibold text-white">{stats[key] ?? 0}</span>
                                <span className="text-xs text-white/60">{label}</span>
                            </div>
                        ))}
                    </div>
                </GlassCard>
            )}

            <GlassCard className="p-6">
                <h2 className="text-lg font-semibold text-white mb-4">Bulk actions</h2>
                {jobStatus.running && (
                    <div className="mb-4 p-3 rounded-lg bg-indigo-500/20 border border-indigo-400/30 text-indigo-200 text-sm" role="status">
                        {jobStatus.job === 'enrich-new' && <>Enrichment in progress… {jobStatus.processed}/{jobStatus.total} leads</>}
                        {jobStatus.error && <span className="text-red-300"> ({jobStatus.error})</span>}
                    </div>
                )}
                <div className="flex flex-wrap items-end gap-4">
                    <div>
                        <label htmlFor="db-bulk-list" className="block text-sm text-white/70 mb-1">Target list (optional)</label>
                        <Select id="db-bulk-list" className="min-w-[200px]" value={bulkListId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setBulkListId(e.target.value || '')}>
                            <option value="">All leads</option>
                            {lists.map((list) => <option key={list.id} value={String(list.id)}>{list.name} ({list.lead_count ?? 0})</option>)}
                        </Select>
                    </div>
                    <Button variant="primary" onClick={runBulkEnrich} disabled={jobStatus.running || stats?.newLeads === 0}>
                        <Zap size={14} className="mr-1" aria-hidden="true" />{jobStatus.running ? 'Enrichment running…' : bulkListId ? 'Enrich new leads in list' : 'Enrich all new leads'}
                    </Button>
                    <Button variant="secondary" onClick={runCleanEmails} disabled={!!actionLoading}>
                        <Mail size={14} className="mr-1" aria-hidden="true" />{actionLoading === 'clean' ? 'Cleaning…' : 'Clean invalid emails'}
                    </Button>
                </div>
            </GlassCard>

            <GlassCard className="p-6">
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Inbox size={18} className="text-white/50" aria-hidden="true" />Send queue
                </h2>
                {queueStatus && (
                    <>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                            <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
                                <span className="block text-xl font-semibold text-white">{queueStatus.scheduledToday}</span>
                                <span className="text-xs text-white/60">Emails scheduled for today</span>
                            </div>
                            <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
                                <span className="block text-xl font-semibold text-white">{queueStatus.sentToday} / {queueStatus.dailyLimit}</span>
                                <span className="text-xs text-white/60">Sent today (daily limit)</span>
                            </div>
                            <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
                                <span className="block text-xl font-semibold text-white">
                                    {queueStatus.nextSendInMinutes != null ? `${queueStatus.nextSendInMinutes} min` : '—'}
                                </span>
                                <span className="text-xs text-white/60">Next send in</span>
                            </div>
                            <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center gap-2">
                                <Button
                                    variant={queueStatus.paused ? 'primary' : 'secondary'}
                                    size="sm"
                                    onClick={() => setQueuePausedMutation.mutate(!queueStatus.paused)}
                                    disabled={setQueuePausedMutation.isPending}
                                    aria-label={queueStatus.paused ? 'Resume queue' : 'Pause queue'}
                                >
                                    {queueStatus.paused ? <Play size={14} className="mr-1" aria-hidden="true" /> : <Pause size={14} className="mr-1" aria-hidden="true" />}
                                    {setQueuePausedMutation.isPending ? '…' : queueStatus.paused ? 'Resume queue' : 'Pause queue'}
                                </Button>
                            </div>
                        </div>
                        {queueStatus.lastScheduled.length > 0 && (
                            <div>
                                <h3 className="text-sm font-medium text-white/70 mb-2">Last 5 scheduled sends</h3>
                                <div className="overflow-x-auto rounded-xl border border-white/10">
                                    <table className="w-full text-sm" aria-label="Next scheduled sequence emails">
                                        <caption className="sr-only">Next scheduled sequence emails</caption>
                                        <thead>
                                            <tr>
                                                <th scope="col" className="py-2 px-3 text-left text-xs font-semibold text-white/50 uppercase bg-white/5 border-b border-white/10">Company</th>
                                                <th scope="col" className="py-2 px-3 text-left text-xs font-semibold text-white/50 uppercase bg-white/5 border-b border-white/10">Template</th>
                                                <th scope="col" className="py-2 px-3 text-left text-xs font-semibold text-white/50 uppercase bg-white/5 border-b border-white/10">Score</th>
                                                <th scope="col" className="py-2 px-3 text-left text-xs font-semibold text-white/50 uppercase bg-white/5 border-b border-white/10">Scheduled</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {queueStatus.lastScheduled.map((row, i) => (
                                                <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                                                    <td className="py-2 px-3 text-white/80">{row.company_name || '—'}</td>
                                                    <td className="py-2 px-3 text-white/80">{row.template_name || '—'}</td>
                                                    <td className="py-2 px-3 text-white/80">{row.score != null ? `${row.score}/10` : '—'}</td>
                                                    <td className="py-2 px-3 text-white/70">{row.scheduled_at || '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </GlassCard>

        </div>
    );
}
