/**
 * Deep enrichment pipeline monitor — stats, job control, live table, logs drawer.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { Activity, CheckCircle2, XCircle, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import api from '../api/client';
import { endpoints } from '../api/endpoints';
import { companyUrl } from '../constants/routes';
import { Button } from '../components/ui';

const SOCKET_URL = import.meta.env.DEV ? (typeof window !== 'undefined' ? window.location.origin : '') : '';

interface EnrichmentStats {
  queue: number;
  processingNow: number;
  completedToday: number;
  failed: number;
  successRate: number | null;
  activeWorkers: number;
  totalWorkers: number;
  activeJob: { concurrency: number; processed: number; total_companies: number; status: string } | null;
}

interface JobRow {
  id: string;
  status: string;
  total_companies: number;
  processed: number;
  failed_count: number;
  concurrency: number;
  filters: Record<string, unknown> | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface JobLead {
  id: number;
  company_name: string;
  company_number: string;
  website: string | null;
  website_status: string | null;
  emails: string[];
  phones: string[];
  linkedin_url: string | null;
  enrichment_score: number | null;
  enrichment_status: string | null;
  enriched_at: string | null;
}

interface EnrichmentLogRow {
  id: string;
  stage: string;
  status: string;
  duration_ms: number | null;
  detail: Record<string, unknown> | null;
  created_at: string;
}

function scoreColor(score: number | null | undefined) {
  const s = score ?? 0;
  if (s >= 50) return 'text-emerald-400';
  if (s >= 25) return 'text-amber-400';
  return 'text-red-400';
}

function statusBadge(status: string | null | undefined) {
  const s = (status || '').toLowerCase();
  if (s === 'enriched' || s === 'enriched_partial') {
    return s === 'enriched' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300';
  }
  if (s === 'running') return 'bg-violet-500/20 text-violet-300';
  if (s === 'failed') return 'bg-red-500/20 text-red-300';
  return 'bg-white/10 text-white/70';
}

export default function PipelinePage() {
  const queryClient = useQueryClient();
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [drawerLeadId, setDrawerLeadId] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [sic, setSic] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'all'>('active');
  const [concurrency, setConcurrency] = useState(10);

  const [delayMs, setDelayMs] = useState(500);
  const [concSetting, setConcSetting] = useState(10);
  const [stWebsite, setStWebsite] = useState(true);
  const [stScrape, setStScrape] = useState(true);
  const [stLinkedin, setStLinkedin] = useState(true);
  const [stValidate, setStValidate] = useState(true);

  const pollOpts = {
    refetchInterval: 12_000,
    refetchOnWindowFocus: false,
    retry: (failureCount: number, err: unknown) => {
      const status = err && typeof err === 'object' && 'status' in err ? (err as { status?: number }).status : undefined;
      if (status === 429) return false;
      return failureCount < 2;
    },
  };

  const { data: stats, isLoading: statsLoading } = useQuery<EnrichmentStats>({
    queryKey: ['enrichment-stats'],
    queryFn: () => api.get(endpoints.enrichmentStats()),
    ...pollOpts,
  });

  const { data: jobsData } = useQuery<{ jobs: JobRow[] }>({
    queryKey: ['enrichment-jobs'],
    queryFn: () => api.get(endpoints.enrichmentJobs()),
    ...pollOpts,
  });

  const jobs = jobsData?.jobs ?? [];

  const latestJob = jobs[0] || null;
  const activeJobId = selectedJobId || latestJob?.id || null;

  const { data: jobLeadsData } = useQuery<{ leads: JobLead[] }>({
    queryKey: ['enrichment-job-leads', activeJobId],
    queryFn: () => api.get(endpoints.enrichmentJobLeads(activeJobId!)),
    enabled: Boolean(activeJobId),
    ...pollOpts,
  });

  const jobLeads = jobLeadsData?.leads ?? [];

  const { data: logData } = useQuery<{ logs: EnrichmentLogRow[] }>({
    queryKey: ['enrichment-lead-log', drawerLeadId],
    queryFn: () => api.get(endpoints.enrichmentLeadLog(drawerLeadId!)),
    enabled: drawerLeadId != null,
  });

  const lastSocketRefreshAt = useRef(0);
  const SOCKET_REFRESH_MIN_MS = 2500;

  useEffect(() => {
    const socket: Socket = io(SOCKET_URL, { path: '/socket.io', transports: ['websocket', 'polling'] });
    const onProg = () => {
      const now = Date.now();
      if (now - lastSocketRefreshAt.current < SOCKET_REFRESH_MIN_MS) return;
      lastSocketRefreshAt.current = now;
      queryClient.invalidateQueries({ queryKey: ['enrichment-stats'] });
      queryClient.invalidateQueries({ queryKey: ['enrichment-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['enrichment-job-leads'] });
    };
    socket.on('pipeline:progress', onProg);
    socket.on('enrichment:done', onProg);
    socket.on('enrichment:stage', onProg);
    return () => {
      socket.off('pipeline:progress', onProg);
      socket.off('enrichment:done', onProg);
      socket.off('enrichment:stage', onProg);
      socket.disconnect();
    };
  }, [queryClient]);

  const startMutation = useMutation({
    mutationFn: () =>
      api.post(endpoints.enrichmentJobs(), {
        filters: {
          sicCodes: sic.trim() ? [sic.trim()] : undefined,
          incorporatedFrom: dateFrom || undefined,
          incorporatedTo: dateTo || undefined,
          companyStatus: statusFilter,
        },
        concurrency,
      }) as Promise<{ jobId?: string }>,
    onSuccess: (data) => {
      if (data?.jobId) setSelectedJobId(data.jobId);
      queryClient.invalidateQueries({ queryKey: ['enrichment-jobs'] });
    },
  });

  const retryMutation = useMutation({
    mutationFn: (leadIds: number[]) =>
      api.post(endpoints.enrichmentRetry(), { leadIds, concurrency }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrichment-job-leads'] });
      queryClient.invalidateQueries({ queryKey: ['enrichment-stats'] });
    },
  });

  const saveSettings = useCallback(async () => {
    await api.post('/api/profile', {
      delay_between_companies_ms: delayMs,
      enrichment_concurrency: concSetting,
      enrichment_stage_website_find: stWebsite,
      enrichment_stage_scrape: stScrape,
      enrichment_stage_linkedin: stLinkedin,
      enrichment_stage_validate: stValidate,
    });
  }, [delayMs, concSetting, stWebsite, stScrape, stLinkedin, stValidate]);

  const estimatedSec = Math.ceil((jobLeads.length || 1) / Math.max(1, concurrency) * 6);

  const failedLeads = useMemo(() => jobLeads.filter((l) => (l.enrichment_status || '').toLowerCase() === 'failed'), [jobLeads]);

  const activeJob = useMemo(() => jobs.find((j) => j.id === activeJobId), [jobs, activeJobId]);
  const jobOutcome = useMemo(() => {
    if (!activeJob) return null;
    const f = activeJob.filters;
    if (!f || typeof f !== 'object' || Array.isArray(f)) {
      return { lastError: null, lastErrorDetail: null, message: null, outcome: null };
    }
    const lastError = typeof f.lastError === 'string' ? f.lastError : null;
    const lastErrorDetail = typeof f.lastErrorDetail === 'string' ? f.lastErrorDetail : null;
    const message = typeof f.message === 'string' ? f.message : null;
    const outcome = typeof f.outcome === 'string' ? f.outcome : null;
    return { lastError, lastErrorDetail, message, outcome };
  }, [activeJob]);

  return (
    <div className="min-h-full bg-[#0d0f12] text-white/90">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-white flex items-center gap-2">
            <Activity className="w-6 h-6 text-[#7c5cbf]" />
            Pipeline
          </h1>
          <p className="text-sm text-white/50 mt-1">Deep enrichment monitoring and job control</p>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Queue', value: statsLoading ? '—' : stats?.queue ?? 0 },
            {
              label: 'Processing',
              value: statsLoading ? '—' : stats?.processingNow ?? 0,
              pulse: (stats?.processingNow ?? 0) > 0,
            },
            { label: 'Completed today', value: statsLoading ? '—' : stats?.completedToday ?? 0 },
            {
              label: 'Failed',
              value: statsLoading ? '—' : stats?.failed ?? 0,
              danger: (stats?.failed ?? 0) > 0,
            },
            {
              label: 'Success rate',
              value: stats?.successRate != null ? `${stats.successRate}%` : '—',
            },
            {
              label: 'Workers',
              value: statsLoading ? '—' : `${stats?.activeWorkers ?? 0} / ${stats?.totalWorkers ?? 0}`,
            },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-xl border border-white/10 bg-[#161920] px-4 py-3"
            >
              <div className="text-xs text-white/50 flex items-center gap-1.5">
                {card.pulse && (
                  <span className="inline-flex h-2 w-2 rounded-full bg-[#7c5cbf] animate-pulse" aria-hidden />
                )}
                {card.label}
              </div>
              <div
                className={`text-lg font-semibold mt-1 ${card.danger ? 'text-red-400' : 'text-white'}`}
              >
                {card.value}
              </div>
            </div>
          ))}
        </div>

        {/* Start job */}
        <div className="rounded-xl border border-white/10 bg-[#161920] p-5 space-y-4">
          <h2 className="text-sm font-medium text-white/90">Start new job</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <label className="block text-xs text-white/50">
              SIC code
              <input
                className="mt-1 w-full rounded-lg bg-[#0d0f12] border border-white/10 px-3 py-2 text-sm"
                value={sic}
                onChange={(e) => setSic(e.target.value)}
                placeholder="e.g. 62012"
              />
            </label>
            <label className="block text-xs text-white/50">
              Date from
              <input
                type="date"
                className="mt-1 w-full rounded-lg bg-[#0d0f12] border border-white/10 px-3 py-2 text-sm"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </label>
            <label className="block text-xs text-white/50">
              Date to
              <input
                type="date"
                className="mt-1 w-full rounded-lg bg-[#0d0f12] border border-white/10 px-3 py-2 text-sm"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </label>
            <label className="block text-xs text-white/50">
              Company status
              <select
                className="mt-1 w-full rounded-lg bg-[#0d0f12] border border-white/10 px-3 py-2 text-sm"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'active' | 'all')}
              >
                <option value="active">Active</option>
                <option value="all">All</option>
              </select>
            </label>
          </div>
          <div className="flex flex-col md:flex-row md:items-end gap-4">
            <label className="block text-xs text-white/50 flex-1">
              Concurrency ({concurrency})
              <input
                type="range"
                min={1}
                max={20}
                value={concurrency}
                onChange={(e) => setConcurrency(parseInt(e.target.value, 10))}
                className="w-full mt-2 accent-[#7c5cbf]"
              />
            </label>
            <div className="text-sm text-white/50">
              Est. time: ~{estimatedSec}s (rough)
            </div>
            <Button
              type="button"
              className="bg-[#7c5cbf] hover:bg-[#6a4faf] text-white border-0"
              onClick={() => startMutation.mutate()}
              disabled={startMutation.isPending}
            >
              {startMutation.isPending ? 'Starting…' : 'Start enrichment'}
            </Button>
          </div>
          {startMutation.isError && (
            <p className="text-sm text-red-400">{(startMutation.error as Error)?.message || 'Failed to start'}</p>
          )}
        </div>

        {/* Job selector */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-white/50">View job:</span>
          <select
            className="rounded-lg bg-[#161920] border border-white/10 px-3 py-2 text-sm"
            value={activeJobId || ''}
            onChange={(e) => setSelectedJobId(e.target.value || null)}
          >
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.id.slice(0, 8)}… {j.status} ({j.processed}/{j.total_companies})
              </option>
            ))}
          </select>
        </div>

        {activeJob && (activeJob.status === 'failed' || jobOutcome?.outcome === 'no_companies') && (
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              activeJob.status === 'failed'
                ? 'border-red-500/40 bg-red-950/40 text-red-100'
                : 'border-amber-500/30 bg-amber-950/30 text-amber-100'
            }`}
          >
            {activeJob.status === 'failed' && jobOutcome.lastError && (
              <p className="font-medium text-white">Job failed: {jobOutcome.lastError}</p>
            )}
            {activeJob.status === 'failed' && jobOutcome.lastErrorDetail && (
              <pre className="mt-2 text-xs whitespace-pre-wrap break-all text-white/70 max-h-48 overflow-auto font-mono">
                {jobOutcome.lastErrorDetail}
              </pre>
            )}
            {jobOutcome.outcome === 'no_companies' && jobOutcome.message && (
              <p className="text-white/90">{jobOutcome.message}</p>
            )}
            {activeJob.status === 'failed' && !jobOutcome.lastError && (
              <p className="text-white/70">No error details stored. Check server logs for this job id.</p>
            )}
          </div>
        )}

        {/* Live table */}
        <div className="rounded-xl border border-white/10 bg-[#161920] overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 text-sm font-medium">Live job</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-white/50 border-b border-white/10">
                  <th className="p-3">Company</th>
                  <th className="p-3">Pipeline</th>
                  <th className="p-3">Web</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Phone</th>
                  <th className="p-3">LI</th>
                  <th className="p-3">Score</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {jobLeads.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-white/40">
                      {activeJob?.status === 'failed'
                        ? 'No leads were imported before this job failed. See the message above.'
                        : jobOutcome?.outcome === 'no_companies'
                          ? 'No companies matched this search (or all were already in your leads).'
                          : 'No leads for this job yet — start a job or pick another job.'}
                    </td>
                  </tr>
                ) : (
                  jobLeads.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-white/5 hover:bg-white/5 cursor-pointer"
                      onClick={() => setDrawerLeadId(row.id)}
                    >
                      <td className="p-3">
                        <a
                          href={companyUrl(row.company_number)}
                          className="text-[#7c5cbf] hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {row.company_name}
                        </a>
                      </td>
                      <td className="p-3 text-white/40 text-xs">CH → Web → Scrape → LI → ✓</td>
                      <td className="p-3">
                        {row.website_status === 'found' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-400/80" />
                        )}
                      </td>
                      <td className="p-3">
                        {row.emails?.length ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-400/80" />
                        )}
                      </td>
                      <td className="p-3">
                        {row.phones?.length ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-400/80" />
                        )}
                      </td>
                      <td className="p-3">
                        {row.linkedin_url ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-400/80" />
                        )}
                      </td>
                      <td className={`p-3 font-medium ${scoreColor(row.enrichment_score)}`}>
                        {row.enrichment_score ?? '—'}
                      </td>
                      <td className="p-3">
                        <span className={`text-xs px-2 py-0.5 rounded ${statusBadge(row.enrichment_status)}`}>
                          {row.enrichment_status || '—'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Error queue */}
        {failedLeads.length > 0 && (
          <div className="rounded-xl border border-red-500/30 bg-[#161920] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-red-300">Failed ({failedLeads.length})</h3>
            <Button
              type="button"
              variant="secondary"
              className="text-xs"
              onClick={() => retryMutation.mutate(failedLeads.map((l) => l.id))}
              disabled={retryMutation.isPending}
            >
                <RefreshCw className="w-3 h-3 mr-1 inline" />
                Retry all failed
              </Button>
            </div>
            <ul className="space-y-2">
              {failedLeads.map((l) => (
                <li key={l.id} className="flex items-center justify-between text-sm">
                  <span>{l.company_name}</span>
                  <Button
                    type="button"
                    variant="secondary"
                    className="text-xs"
                    onClick={() => retryMutation.mutate([l.id])}
                  >
                    Retry
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Settings */}
        <div className="rounded-xl border border-white/10 bg-[#161920]">
          <button
            type="button"
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium"
            onClick={() => setSettingsOpen((o) => !o)}
          >
            Settings
            {settingsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {settingsOpen && (
            <div className="px-4 pb-4 space-y-4 border-t border-white/10 pt-4">
              <label className="block text-xs text-white/50">
                Concurrency (profile)
                <input
                  type="range"
                  min={1}
                  max={20}
                  value={concSetting}
                  onChange={(e) => setConcSetting(parseInt(e.target.value, 10))}
                  className="w-full mt-2 accent-[#7c5cbf]"
                />
              </label>
              <label className="block text-xs text-white/50">
                Delay between companies (ms)
                <input
                  type="number"
                  className="mt-1 w-full rounded-lg bg-[#0d0f12] border border-white/10 px-3 py-2 text-sm"
                  value={delayMs}
                  onChange={(e) => setDelayMs(parseInt(e.target.value, 10) || 500)}
                />
              </label>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {[
                  ['Website find', stWebsite, setStWebsite],
                  ['Scrape', stScrape, setStScrape],
                  ['LinkedIn', stLinkedin, setStLinkedin],
                  ['Validate', stValidate, setStValidate],
                ].map(([label, on, set]) => (
                  <label key={String(label)} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={on as boolean}
                      onChange={(e) => (set as (v: boolean) => void)(e.target.checked)}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <Button type="button" className="bg-[#7c5cbf] text-white border-0" onClick={() => saveSettings()}>
                Save settings
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Drawer */}
      {drawerLeadId != null && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Close"
            onClick={() => setDrawerLeadId(null)}
          />
          <div className="relative w-full max-w-md bg-[#161920] border-l border-white/10 h-full overflow-auto shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium">Enrichment log</h3>
              <button type="button" className="text-white/50 hover:text-white" onClick={() => setDrawerLeadId(null)}>
                ✕
              </button>
            </div>
            <ul className="space-y-3 text-sm">
              {(logData?.logs ?? []).map((log) => (
                <li key={log.id} className="border border-white/10 rounded-lg p-3">
                  <div className="flex justify-between text-white/70">
                    <span className="font-medium text-[#7c5cbf]">{log.stage}</span>
                    <span className="text-white/40">{log.status}</span>
                  </div>
                  <div className="text-white/40 text-xs mt-1">
                    {log.duration_ms != null ? `${log.duration_ms} ms` : ''}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
