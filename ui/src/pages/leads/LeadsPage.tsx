/**
 * LeadsPage — Find Leads page.
 *
 * Orchestrates filter sidebar, company table, toolbar, and save-to-list modal.
 * Replaces the original 731-line Leads.jsx with:
 *   - useFilterStore (21 filter fields — zero prop drilling)
 *   - React Query (server state — companies, lists, in-lists map)
 *   - 5 local useState (ephemeral UI state)
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { Search, Building2, Sparkles, Compass } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/client';
import { GlassCard } from '../../components/ui';
import LeadsSidebar from '../../components/LeadsSidebar';
import CompaniesTable from '../../components/CompaniesTable';
import EmptyState from '../../components/ui/EmptyState';
import { LeadsToolbarHeader, LeadsSelectionBar, LeadsFooter } from './LeadsToolbar';
import SaveToListModal from './SaveToListModal';
import LeadsFloatingActionBar from './LeadsFloatingActionBar';
import { useFilterStore } from '../../stores/filterStore';
import { useChCacheSearch } from '../../hooks/useChCacheSearch';
import { useEnrichedLeadsSearch } from '../../hooks/useEnrichedLeadsSearch';
import { useLists, useDeleteList } from '../../hooks/useLists';
import { applyFilters, exportCsv, exportExcel } from '../../lib/leadFilters';
import type { CHCompany } from '../../lib/leadFilters';
import type { List } from '../../hooks/useLists';

export type LeadsViewMode = 'enriched' | 'discovery';

const ACTIVE_LIST_STORAGE_KEY = 'chscanner_active_list_id';
const IN_LISTS_SLICE_LIMIT = 250;

function readStoredListId(): string {
    try {
        const saved = localStorage.getItem(ACTIVE_LIST_STORAGE_KEY);
        if (!saved) return '';
        const n = parseInt(saved, 10);
        return Number.isInteger(n) && n >= 1 ? String(n) : '';
    } catch { return ''; }
}

export default function LeadsPage() {
    const [activeListId, setActiveListIdState] = useState(() => readStoredListId());
    const [viewMode, setViewMode] = useState<LeadsViewMode>('enriched');

    const listIdNum = activeListId ? parseInt(activeListId, 10) : 0;
    const listIdForQuery = Number.isInteger(listIdNum) && listIdNum >= 1 ? listIdNum : null;

    const setActiveListId = useCallback((id: string) => {
        setActiveListIdState(id);
    }, []);

    // ── Server state (Enriched = leads with contact point, optionally filtered by active list; Discovery = raw CH cache) ──
    const enriched = useEnrichedLeadsSearch(
        { listId: listIdForQuery ?? undefined },
        viewMode === 'enriched'
    );
    const discovery = useChCacheSearch(500, viewMode === 'discovery');

    const companies =
        viewMode === 'enriched'
            ? (enriched.data ?? [])
            : (discovery.data ?? []);

    const loading =
        viewMode === 'enriched' ? enriched.isLoading : discovery.isLoading;
    const fetchError =
        viewMode === 'enriched' ? enriched.error : discovery.error;

    const { data: lists = [] } = useLists();
    const deleteListMutation = useDeleteList();

    // ── Filter state (Zustand) ───────────────────────────────
    const filters = useFilterStore();
    const filteredCompanies = useMemo(() => applyFilters(companies, filters), [companies, filters]);

    // ── In-lists map (which companies are already in lists) ──
    const companyNumbers = useMemo(
        () => filteredCompanies.map((c) => c.number || c.company_number).filter(Boolean).slice(0, IN_LISTS_SLICE_LIMIT),
        [filteredCompanies]
    );
    const { data: companyInListsMap = {} } = useQuery<Record<string, string[]>>({
        queryKey: ['leads', 'in-lists', companyNumbers],
        queryFn: () => {
            if (companyNumbers.length === 0) return {};
            const params = new URLSearchParams({ companyNumbers: companyNumbers.join(',') });
            return api.get(`/api/leads/in-lists?${params}`);
        },
        enabled: companyNumbers.length > 0,
        staleTime: 30_000,
    });

    // ── Local UI state ───────────────────────────────────────
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [saveModalOpen, setSaveModalOpen] = useState(false);
    const [saveLoading, setSaveLoading] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    useEffect(() => {
        if (activeListId) {
            try { localStorage.setItem(ACTIVE_LIST_STORAGE_KEY, activeListId); } catch { /* noop */ }
        }
    }, [activeListId]);

    // When lists load, clear active list if it no longer exists (e.g. list was deleted).
    useEffect(() => {
        if (lists.length === 0 || !activeListId) return;
        const exists = lists.some((l) => String(l.id) === String(activeListId));
        if (!exists) setActiveListIdState('');
    }, [lists, activeListId]);

    // ── Derived ──────────────────────────────────────────────
    const selectedCompanies = useMemo(
        () => filteredCompanies.filter((c) => selectedIds.has((c.number || c.company_number) ?? '')),
        [filteredCompanies, selectedIds]
    );

    // ── Handlers ─────────────────────────────────────────────
    const handleExportCsv = useCallback(() => exportCsv(filteredCompanies), [filteredCompanies]);
    const handleExportExcel = useCallback(async () => {
        try { await exportExcel(filteredCompanies); }
        catch (e: unknown) { setSaveError(e instanceof Error ? e.message : 'Excel export failed'); }
    }, [filteredCompanies]);
    const handleExportSelectedCsv = useCallback(() => exportCsv(selectedCompanies), [selectedCompanies]);
    const handleExportSelectedExcel = useCallback(async () => {
        try { await exportExcel(selectedCompanies); }
        catch (e: unknown) { setSaveError(e instanceof Error ? e.message : 'Excel export failed'); }
    }, [selectedCompanies]);

    const saveCompanies = useCallback(async (targetListId: number) => {
        setSaveLoading(true);
        setSaveError(null);
        try {
            await api.post('/api/leads/save-to-list', { listId: targetListId, companyNumbers: [...selectedIds] });
            setSelectedIds(new Set());
            setSaveModalOpen(false);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Failed to save to list';
            setSaveError(msg);
        } finally {
            setSaveLoading(false);
        }
    }, [selectedIds]);

    const handleFloatingAddToList = useCallback(
        (listId: number) => {
            void saveCompanies(listId);
        },
        [saveCompanies]
    );

    const handleSaveToList = useCallback(async (listId: number | null, newListName: string) => {
        setSaveLoading(true);
        setSaveError(null);
        try {
            let targetId = listId;
            if (newListName) {
                const created: { id: number } = await api.post('/api/lists', { name: newListName });
                targetId = created.id;
            }
            if (!targetId) {
                setSaveError('Could not create or select list.');
                setSaveLoading(false);
                return;
            }
            await saveCompanies(targetId);
        } catch (e: unknown) {
            setSaveError(e instanceof Error ? e.message : 'Failed to save to list');
            setSaveLoading(false);
        }
    }, [saveCompanies]);

    const handleSaveToListClick = useCallback(() => {
        const listId = activeListId ? parseInt(activeListId, 10) : 0;
        if (Number.isInteger(listId) && listId >= 1 && selectedIds.size > 0) {
            void saveCompanies(listId);
        } else {
            setSaveError(null);
            setSaveModalOpen(true);
        }
    }, [activeListId, selectedIds, saveCompanies]);

    const handleContinue = useCallback(() => {
        window.location.hash = activeListId ? `#/kanban?listId=${activeListId}` : '#/kanban';
    }, [activeListId]);

    const handleCompanyClick = useCallback((company: CHCompany) => {
        const num = company?.number || company?.company_number;
        if (num) window.location.hash = `#/company/${encodeURIComponent(num)}`;
    }, []);

    const handleDeleteList = useCallback(
        (listId: number) => {
            deleteListMutation.mutate(listId, {
                onSuccess: () => {
                    if (String(listId) === activeListId) setActiveListIdState('');
                },
            });
        },
        [deleteListMutation, activeListId]
    );

    // ── Error display ────────────────────────────────────────
    const errorMessage = fetchError instanceof Error ? fetchError.message : fetchError ? String(fetchError) : null;

    return (
        <div className="flex flex-col gap-4 lg:gap-6">
            {/* Top section: Filters (single full-width card); generous max-height, styled scrollbar */}
            <GlassCard className="leads-filter-card-scroll p-4 overflow-y-auto max-h-[72vh] min-h-0">
                <LeadsSidebar filteredCount={filteredCompanies.length} />
            </GlassCard>

            {/* Companies section: full width below */}
            <div className="min-w-0">
                {errorMessage && (
                    <div className="mb-4 p-4 rounded-xl bg-red-500/20 border border-red-400/30 text-red-200 text-sm" role="alert">
                        {errorMessage}
                    </div>
                )}
                {saveError && !saveModalOpen && (
                    <div className="mb-4 p-4 rounded-xl bg-red-500/20 border border-red-400/30 text-red-200 text-sm" role="alert">
                        {saveError}
                    </div>
                )}

                {!errorMessage && (
                    <GlassCard className="p-6">
                        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                            <div
                                className="flex rounded-[var(--radius-inner)] bg-white/5 border border-white/10 p-0.5"
                                role="tablist"
                                aria-label="Data source: Enriched leads or Discovery cache"
                            >
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={viewMode === 'enriched'}
                                    aria-controls="leads-table-panel"
                                    id="tab-enriched"
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-[var(--transition-base)] focus-visible:ring-2 ring-violet-500 ring-offset-2 ring-offset-[var(--color-bg-base)] outline-none ${
                                        viewMode === 'enriched'
                                            ? 'bg-white/10 text-white border border-white/10'
                                            : 'text-white/70 hover:text-white hover:bg-white/5'
                                    }`}
                                    onClick={() => setViewMode('enriched')}
                                >
                                    <Sparkles size={16} aria-hidden />
                                    Enriched
                                </button>
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={viewMode === 'discovery'}
                                    aria-controls="leads-table-panel"
                                    id="tab-discovery"
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-[var(--transition-base)] focus-visible:ring-2 ring-violet-500 ring-offset-2 ring-offset-[var(--color-bg-base)] outline-none ${
                                        viewMode === 'discovery'
                                            ? 'bg-white/10 text-white border border-white/10'
                                            : 'text-white/70 hover:text-white hover:bg-white/5'
                                    }`}
                                    onClick={() => setViewMode('discovery')}
                                >
                                    <Compass size={16} aria-hidden />
                                    Discovery
                                </button>
                            </div>
                        </div>
                        <div
                            id="leads-table-panel"
                            role="tabpanel"
                            aria-labelledby={viewMode === 'enriched' ? 'tab-enriched' : 'tab-discovery'}
                        >
                        <LeadsToolbarHeader
                            lists={lists}
                            activeListId={activeListId}
                            onActiveListChange={setActiveListId}
                            onExportCsv={handleExportCsv}
                            onExportExcel={handleExportExcel}
                            loading={loading}
                            filteredCount={filteredCompanies.length}
                        />

                        <LeadsSelectionBar
                            selectedCount={selectedIds.size}
                            onClearSelection={() => setSelectedIds(new Set())}
                            onExportSelectedCsv={handleExportSelectedCsv}
                            onExportSelectedExcel={handleExportSelectedExcel}
                        />

                        {!loading && companies.length === 0 && (
                            <EmptyState
                                icon={viewMode === 'enriched' ? Sparkles : Search}
                                title={
                                    viewMode === 'enriched'
                                        ? 'No enriched leads yet'
                                        : 'No companies loaded'
                                }
                                description={
                                    viewMode === 'enriched'
                                        ? 'Enriched leads have at least one contact (email, phone, or website). Add companies from Discovery and enrich them, or run enrichment on a list.'
                                        : 'Sync Companies House from Profile or run the sync script to populate the cache.'
                                }
                            />
                        )}

                        {!loading && companies.length > 0 && filteredCompanies.length === 0 && (
                            <EmptyState
                                icon={Building2}
                                title="No matches"
                                description="No companies match the current filters. Try adjusting your criteria."
                                compact
                                action={{ label: 'Reset filters', onClick: filters.resetFilters }}
                            />
                        )}

                        {(loading || filteredCompanies.length > 0) && (
                            <div className="overflow-x-auto rounded-xl bg-white/5 border border-white/10">
                                <CompaniesTable
                                    companies={filteredCompanies}
                                    loading={loading}
                                    selectedIds={selectedIds}
                                    onSelectionChange={setSelectedIds}
                                    onCompanyClick={handleCompanyClick}
                                    companyInListsMap={companyInListsMap}
                                />
                            </div>
                        )}

                        <LeadsFooter
                            filteredCount={filteredCompanies.length}
                            totalCount={companies.length}
                            selectedCount={selectedIds.size}
                            lists={lists}
                            activeListId={activeListId}
                            saveToListLoading={saveLoading}
                            onSaveToList={handleSaveToListClick}
                            onContinue={handleContinue}
                            loading={loading}
                        />
                        </div>
                    </GlassCard>
                )}
            </div>

            <SaveToListModal
                open={saveModalOpen}
                onClose={() => setSaveModalOpen(false)}
                lists={lists}
                selectedCount={selectedIds.size}
                initialListId={activeListId}
                onSave={handleSaveToList}
                loading={saveLoading}
                error={saveError}
            />

            <LeadsFloatingActionBar
                selectedCount={selectedIds.size}
                lists={lists}
                selectedListId={activeListId}
                onSelectedListIdChange={setActiveListId}
                onAddToList={handleFloatingAddToList}
                onCreateNewListFromSelection={() => setSaveModalOpen(true)}
                onClearSelection={() => setSelectedIds(new Set())}
                onDeleteList={handleDeleteList}
                loading={saveLoading}
                deleteListLoading={deleteListMutation.isPending}
            />
        </div>
    );
}
