/**
 * KanbanPage — drag-and-drop + keyboard-accessible pipeline board.
 *
 * Keyboard support: focus a lead card, press Left/Right arrow to move it
 * to the adjacent status column. Screen readers get aria-roledescription
 * and announcements via aria-live region.
 */

import { useState, useMemo, useCallback, type KeyboardEvent } from 'react';
import { GripVertical, X, Mail, Upload, Download } from 'lucide-react';
import api from '../../api/client';
import { GlassCard, GlassCardInner, Button, Select } from '../../components/ui';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonCard } from '../../components/ui/SkeletonCard';
import { useLeads, type Lead } from '../../hooks/useLeads';
import { useLists } from '../../hooks/useLists';
import { capitalize } from '../../lib/utils';

const STATUS_COLUMNS = ['New', 'Enriched', 'Email Sent', 'Opened', 'Waiting for Reply', 'Replied', 'Converted'] as const;
type StatusColumn = typeof STATUS_COLUMNS[number];

function statusToColumn(status: string | undefined): StatusColumn {
    const s = status || 'New';
    if (s === 'Contacted') return 'Email Sent';
    if (s === 'Qualified') return 'Replied';
    return STATUS_COLUMNS.includes(s as StatusColumn) ? (s as StatusColumn) : 'New';
}

function getScoreColor(score: number | null | undefined): string {
    if (score == null) return 'text-white/40';
    const n = Number(score);
    if (n >= 7) return 'text-emerald-400';
    if (n >= 5) return 'text-amber-400';
    return 'text-red-400';
}

function getSearchParams(): URLSearchParams {
    if (typeof window === 'undefined') return new URLSearchParams();
    const hash = window.location.hash.replace(/^#/, '');
    const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
    return new URLSearchParams(query);
}

function getListIdFromSearch(): string {
    return getSearchParams().get('listId') || '';
}

function getColumnFilterFromSearch(): StatusColumn | null {
    const status = getSearchParams().get('status') || '';
    return (STATUS_COLUMNS as readonly string[]).includes(status) ? (status as StatusColumn) : null;
}

const EMPTY_COLUMN_MESSAGES: Partial<Record<StatusColumn, string>> = {
    'Email Sent': 'Send emails to enriched leads with Score >= 7 to move them here',
    'Waiting for Reply': 'Leads waiting for a response',
    Replied: 'Move leads here once they have responded positively',
    Converted: 'Move leads here once a deal is closed',
};

type ViewFilter = 'all' | 'ready' | 'needs_review' | 'contacted';
const VIEW_TABS: Array<{ id: ViewFilter; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'ready', label: 'Ready to Send' },
    { id: 'needs_review', label: 'Needs Review' },
    { id: 'contacted', label: 'Contacted' },
];

export default function KanbanPage() {
    const [selectedListId, setSelectedListId] = useState(getListIdFromSearch);
    const listIdNum = selectedListId ? parseInt(selectedListId, 10) : undefined;
    const { data: leads = [], isLoading, error, refetch } = useLeads(listIdNum && !isNaN(listIdNum) ? listIdNum : undefined);
    const { data: lists = [] } = useLists();

    const [draggedLead, setDraggedLead] = useState<Lead | null>(null);
    const [draggedOverColumn, setDraggedOverColumn] = useState<StatusColumn | null>(null);
    const [selectedLeadIds, setSelectedLeadIds] = useState<Set<number>>(new Set());
    const [sendEmailLoading, setSendEmailLoading] = useState(false);
    const [pushCrmLoading, setPushCrmLoading] = useState(false);
    const [pushCrmResult, setPushCrmResult] = useState<{ provider: string; pushed: number; failed: number } | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [viewFilter, setViewFilter] = useState<ViewFilter>('all');
    const [columnFilter, setColumnFilter] = useState<StatusColumn | null>(getColumnFilterFromSearch);
    const [announcement, setAnnouncement] = useState('');

    const filteredLeads = useMemo(() => {
        if (viewFilter === 'all') return leads;
        if (viewFilter === 'ready') return leads.filter((l) => statusToColumn(l.status) === 'Enriched' && Number(l.score) >= 7 && l.outreach_draft);
        if (viewFilter === 'needs_review') return leads.filter((l) => statusToColumn(l.status) === 'Enriched' && (Number(l.score) < 7 || !l.outreach_draft));
        if (viewFilter === 'contacted') {
            const contacted = ['Email Sent', 'Opened', 'Waiting for Reply', 'Replied', 'Converted', 'Contacted', 'Qualified'];
            return leads.filter((l) => contacted.includes(l.status || ''));
        }
        return leads;
    }, [leads, viewFilter]);

    const byStatus = useMemo(() => {
        const map: Record<StatusColumn, Lead[]> = Object.fromEntries(STATUS_COLUMNS.map((s) => [s, []])) as Record<StatusColumn, Lead[]>;
        filteredLeads.forEach((lead) => {
            const col = statusToColumn(lead.status);
            (map[col] || map.New).push(lead);
        });
        return map;
    }, [filteredLeads]);

    const selectedList = useMemo(() => lists.find((l) => String(l.id) === selectedListId), [lists, selectedListId]);

    const visibleColumns = useMemo(
        () => (columnFilter ? STATUS_COLUMNS.filter((s) => s === columnFilter) : STATUS_COLUMNS),
        [columnFilter]
    );

    const clearColumnFilter = useCallback(() => {
        setColumnFilter(null);
        const params = new URLSearchParams();
        if (selectedListId) params.set('listId', selectedListId);
        window.location.hash = params.toString() ? `#/kanban?${params}` : '#/kanban';
    }, [selectedListId]);

    // ── Status change (shared by drag-and-drop + keyboard) ───
    const changeStatus = useCallback(async (leadId: number, newStatus: StatusColumn) => {
        try {
            await api.patch(`/api/leads/${leadId}`, { status: newStatus });
            void refetch();
        } catch (err: unknown) {
            setActionError(err instanceof Error ? err.message : 'Failed to update status');
        }
    }, [refetch]);

    // ── Drag and drop ────────────────────────────────────────
    const handleDragStart = useCallback((e: React.DragEvent, lead: Lead) => {
        setDraggedLead(lead);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(lead.id));
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent, status: StatusColumn) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDraggedOverColumn(status);
    }, []);

    const handleDrop = useCallback(async (e: React.DragEvent, newStatus: StatusColumn) => {
        e.preventDefault();
        setDraggedOverColumn(null);
        if (!draggedLead || statusToColumn(draggedLead.status) === newStatus) { setDraggedLead(null); return; }
        await changeStatus(draggedLead.id, newStatus);
        setDraggedLead(null);
    }, [draggedLead, changeStatus]);

    const handleDragEnd = useCallback(() => { setDraggedLead(null); setDraggedOverColumn(null); }, []);

    // ── Keyboard navigation ──────────────────────────────────
    const handleCardKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>, lead: Lead) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        const currentCol = statusToColumn(lead.status);
        const idx = STATUS_COLUMNS.indexOf(currentCol);
        const nextIdx = e.key === 'ArrowRight' ? idx + 1 : idx - 1;
        if (nextIdx < 0 || nextIdx >= STATUS_COLUMNS.length) return;
        const nextStatus = STATUS_COLUMNS[nextIdx]!;
        setAnnouncement(`Moving ${lead.company_name || 'lead'} to ${nextStatus}`);
        void changeStatus(lead.id, nextStatus);
    }, [changeStatus]);

    // ── Bulk actions ─────────────────────────────────────────
    const handleBulkSendEmail = useCallback(async () => {
        if (selectedLeadIds.size === 0) return;
        setSendEmailLoading(true);
        setActionError(null);
        try {
            await api.post('/api/leads/bulk-send-email', { leadIds: [...selectedLeadIds], subject: 'Introduction' });
            setSelectedLeadIds(new Set());
            void refetch();
        } catch (err: unknown) {
            setActionError(err instanceof Error ? err.message : 'Bulk send failed');
        } finally { setSendEmailLoading(false); }
    }, [selectedLeadIds, refetch]);

    const handleBulkPushCrm = useCallback(async (provider: string) => {
        if (selectedLeadIds.size === 0) return;
        setPushCrmLoading(true);
        setPushCrmResult(null);
        setActionError(null);
        try {
            const data: { pushed?: number; failed?: number } = await api.post('/api/crm/push-bulk', { leadIds: [...selectedLeadIds], provider });
            setPushCrmResult({ provider, pushed: data.pushed ?? 0, failed: data.failed ?? 0 });
        } catch (err: unknown) {
            setActionError(err instanceof Error ? err.message : 'Bulk CRM push failed');
        } finally { setPushCrmLoading(false); }
    }, [selectedLeadIds]);

    const toggleSelection = useCallback((leadId: number) => {
        setSelectedLeadIds((prev) => {
            const next = new Set(prev);
            if (next.has(leadId)) next.delete(leadId);
            else next.add(leadId);
            return next;
        });
    }, []);

    const handleListChange = useCallback((value: string) => {
        setSelectedListId(value);
        const params = new URLSearchParams();
        if (value) params.set('listId', value);
        if (columnFilter) params.set('status', columnFilter);
        window.location.hash = params.toString() ? `#/kanban?${params}` : '#/kanban';
    }, [columnFilter]);

    const tabCls = (active: boolean) =>
        `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${active ? 'bg-indigo-500/25 text-indigo-200 border border-indigo-400/40' : 'bg-white/5 text-white/70 border border-transparent hover:bg-white/10'}`;

    if (isLoading) {
        return (
            <div className="space-y-4">
                <GlassCard className="p-6"><div className="h-6 w-32 bg-white/10 rounded animate-pulse" /></GlassCard>
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    {STATUS_COLUMNS.map((s) => <SkeletonCard key={s} rows={4} />)}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Screen reader announcements for keyboard moves */}
            <div className="sr-only" aria-live="assertive" aria-atomic="true">{announcement}</div>

            <GlassCard className="p-6">
                <div className="flex flex-wrap items-center gap-4 mb-3">
                    <h2 className="text-xl font-semibold text-white tracking-tight">Pipeline</h2>
                    <div className="flex items-center gap-2">
                        <label htmlFor="kanban-list-select" className="text-sm text-white/60">List</label>
                        <Select id="kanban-list-select" className="min-w-[180px]" value={selectedListId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleListChange(e.target.value)}>
                            <option value="">All leads</option>
                            {lists.map((l) => <option key={l.id} value={String(l.id)}>{l.name} {l.lead_count != null ? `(${l.lead_count})` : ''}</option>)}
                        </Select>
                        <a href={selectedListId ? `/api/leads/export?format=csv&listId=${selectedListId}` : '/api/leads/export?format=csv'} className="text-sm text-indigo-300 hover:text-indigo-200 inline-flex items-center gap-1" download="leads.csv"><Download size={13} aria-hidden="true" />CSV</a>
                        <a href={selectedListId ? `/api/leads/export?format=xlsx&listId=${selectedListId}` : '/api/leads/export?format=xlsx'} className="text-sm text-indigo-300 hover:text-indigo-200 inline-flex items-center gap-1" download="leads.xlsx"><Download size={13} aria-hidden="true" />Excel</a>
                    </div>
                </div>
                <p className="text-sm text-white/60 mb-4">
                    {selectedListId ? `Showing leads in list: ${selectedList?.name ?? 'List'}. Drag or use arrow keys to update status.` : 'Drag leads between columns or use Left/Right arrow keys to update status'}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                    <div className="flex flex-wrap gap-1.5" role="tablist">
                        {VIEW_TABS.map((tab) => (
                            <button key={tab.id} type="button" role="tab" aria-selected={viewFilter === tab.id} className={tabCls(viewFilter === tab.id)} onClick={() => setViewFilter(tab.id)}>{tab.label}</button>
                        ))}
                    </div>
                    {columnFilter && (
                        <div className="flex items-center gap-2 ml-2 px-3 py-1 rounded-lg bg-indigo-500/15 border border-indigo-400/30 text-indigo-200 text-xs font-medium">
                            <span>Showing: {columnFilter}</span>
                            <button
                                type="button"
                                onClick={clearColumnFilter}
                                className="hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400 rounded"
                                aria-label="Clear status filter"
                            >
                                <X size={12} aria-hidden="true" />
                            </button>
                        </div>
                    )}
                </div>
            </GlassCard>

            {(actionError || error) && (
                <div className="p-4 rounded-xl bg-red-500/20 border border-red-400/30 text-red-200 text-sm" role="alert">{actionError || (error instanceof Error ? error.message : 'Failed to load leads')}</div>
            )}

            {!isLoading && filteredLeads.length === 0 && leads.length === 0 && (
                <EmptyState icon={GripVertical} title="No leads in this list" description="Add companies from Find leads and save them to a list to see them here." />
            )}
            {!isLoading && filteredLeads.length === 0 && leads.length > 0 && (
                <EmptyState icon={GripVertical} title="No leads match the current filter" description="Try another tab or clear the list filter." compact />
            )}

            {selectedLeadIds.size > 0 && (
                <GlassCard className="p-4 flex flex-wrap items-center gap-3" role="toolbar" aria-label="Bulk actions">
                    <span className="text-sm text-white/70">{selectedLeadIds.size} selected</span>
                    <Button size="sm" variant="primary" onClick={handleBulkSendEmail} disabled={sendEmailLoading}>
                        <Mail size={14} className="mr-1" aria-hidden="true" />Mark as Email Sent
                    </Button>
                    <span className="text-sm text-white/50">Push to CRM:</span>
                    {['hubspot', 'pipedrive', 'salesforce'].map((provider) => (
                        <Button key={provider} size="sm" variant="secondary" onClick={() => handleBulkPushCrm(provider)} disabled={pushCrmLoading}>
                            <Upload size={14} className="mr-1" aria-hidden="true" />{capitalize(provider)}
                        </Button>
                    ))}
                    {pushCrmResult && (
                        <span className="text-sm text-white/70" role="status">
                            {pushCrmResult.pushed} pushed to {pushCrmResult.provider}
                            {pushCrmResult.failed > 0 && `, ${pushCrmResult.failed} failed`}
                        </span>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => { setSelectedLeadIds(new Set()); setPushCrmResult(null); }} className="ml-auto">
                        <X size={14} className="mr-1" aria-hidden="true" />Clear selection
                    </Button>
                </GlassCard>
            )}

            <div
                className={`gap-4 pb-4 ${columnFilter ? 'flex justify-center' : 'grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 overflow-x-auto'}`}
                role="region"
                aria-label="Kanban board"
            >
                {visibleColumns.map((status) => (
                    <GlassCardInner
                        key={status}
                        className={`p-4 flex flex-col transition-all ${columnFilter ? 'w-full max-w-md' : 'min-w-[200px]'} ${draggedOverColumn === status ? 'ring-2 ring-indigo-400/50 bg-white/10' : ''}`}
                        onDragOver={(e: React.DragEvent) => handleDragOver(e, status)}
                        onDragLeave={() => setDraggedOverColumn(null)}
                        onDrop={(e: React.DragEvent) => handleDrop(e, status)}
                        role="group"
                        aria-label={`${status} column, ${byStatus[status].length} leads`}
                    >
                        <div className="flex items-center justify-between mb-3">
                            <span className="font-medium text-white text-sm">{status}</span>
                            <span className="text-xs text-white/50 bg-white/10 px-2 py-0.5 rounded-full">{byStatus[status].length}</span>
                        </div>
                        <div className="space-y-2 flex-1 min-h-0 overflow-y-auto">
                            {byStatus[status].length === 0 && EMPTY_COLUMN_MESSAGES[status] && (
                                <p className="text-xs text-white/50 italic">{EMPTY_COLUMN_MESSAGES[status]}</p>
                            )}
                            {byStatus[status].map((lead) => (
                                <div
                                    key={lead.id}
                                    className={`p-3 rounded-xl border transition-all ${
                                        draggedLead?.id === lead.id ? 'opacity-50 border-indigo-400/50' : 'border-white/10 hover:border-white/20 bg-white/5'
                                    } ${selectedLeadIds.has(lead.id) ? 'ring-1 ring-indigo-400/50' : ''} cursor-grab active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)] focus-visible:outline-none`}
                                    draggable
                                    tabIndex={0}
                                    role="option"
                                    aria-roledescription="Kanban card"
                                    aria-label={`${lead.company_name || 'Lead'}, status ${statusToColumn(lead.status)}. Use left and right arrow keys to move between columns.`}
                                    onDragStart={(e) => handleDragStart(e, lead)}
                                    onDragEnd={handleDragEnd}
                                    onKeyDown={(e) => handleCardKeyDown(e, lead)}
                                >
                                    <div className="flex items-start gap-2">
                                        <input
                                            type="checkbox"
                                            className="mt-1 w-4 h-4 rounded border-white/20 text-indigo-500 focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)]"
                                            checked={selectedLeadIds.has(lead.id)}
                                            onChange={() => toggleSelection(lead.id)}
                                            onClick={(e) => e.stopPropagation()}
                                            aria-label={`Select ${lead.company_name || 'lead'}`}
                                        />
                                        <div className="min-w-0 flex-1">
                                            <button
                                                type="button"
                                                className="block w-full text-left font-medium text-white text-sm truncate hover:text-indigo-200 focus-visible:outline-none focus-visible:underline"
                                                onClick={(e) => { e.stopPropagation(); if (lead.company_number) window.location.hash = `#/company/${encodeURIComponent(lead.company_number)}`; }}
                                            >
                                                {lead.company_name || '—'}
                                            </button>
                                            <div className="flex flex-wrap gap-1.5 mt-1 text-xs text-white/50">
                                                {lead.company_number && <span>{lead.company_number}</span>}
                                                {lead.score != null && (
                                                    <span className={getScoreColor(lead.score)} title={lead.score_reasoning ? `Scored ${lead.score}: ${lead.score_reasoning}` : undefined}>Score: {lead.score}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </GlassCardInner>
                ))}
            </div>
        </div>
    );
}
