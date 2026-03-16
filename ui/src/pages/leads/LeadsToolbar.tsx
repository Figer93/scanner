/**
 * LeadsToolbar — header bar (title, list selector, export buttons)
 * + selection action bar + footer (counts, save, continue).
 */

import { Download, X, ArrowRight } from 'lucide-react';
import { Button, Select } from '../../components/ui';
import type { List } from '../../hooks/useLists';

interface LeadsToolbarProps {
    filteredCount: number;
    totalCount: number;
    selectedCount: number;
    loading: boolean;
    // List selector
    lists: List[];
    activeListId: string;
    onActiveListChange: (id: string) => void;
    // Export
    onExportCsv: () => void;
    onExportExcel: () => void;
    onExportSelectedCsv: () => void;
    onExportSelectedExcel: () => void;
    // Selection actions
    onClearSelection: () => void;
    onSaveToList: () => void;
    saveToListLoading: boolean;
    // Navigation
    onContinue: () => void;
}

export function LeadsToolbarHeader({
    lists,
    activeListId,
    onActiveListChange,
    onExportCsv,
    onExportExcel,
    loading,
    filteredCount,
}: Pick<LeadsToolbarProps, 'lists' | 'activeListId' | 'onActiveListChange' | 'onExportCsv' | 'onExportExcel' | 'loading' | 'filteredCount'>) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <h3 className="text-lg font-semibold text-white tracking-tight">Companies</h3>
            <div className="flex items-center gap-3 flex-wrap">
                <label htmlFor="leads-active-list" className="text-sm text-white/70">Active list</label>
                <Select
                    id="leads-active-list"
                    className="min-w-[180px]"
                    value={activeListId}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onActiveListChange(e.target.value || '')}
                >
                    <option value="">— None —</option>
                    {lists.map((list) => (
                        <option key={list.id} value={String(list.id)}>
                            {list.name} {list.lead_count != null ? `(${list.lead_count})` : ''}
                        </option>
                    ))}
                </Select>
                <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={onExportCsv} disabled={loading || filteredCount === 0} title="Export as CSV">
                        <Download size={14} className="mr-1" aria-hidden="true" />CSV
                    </Button>
                    <Button size="sm" variant="secondary" onClick={onExportExcel} disabled={loading || filteredCount === 0} title="Export as Excel">
                        <Download size={14} className="mr-1" aria-hidden="true" />Excel
                    </Button>
                </div>
            </div>
        </div>
    );
}

export function LeadsSelectionBar({
    selectedCount,
    onClearSelection,
    onExportSelectedCsv,
    onExportSelectedExcel,
}: Pick<LeadsToolbarProps, 'selectedCount' | 'onClearSelection' | 'onExportSelectedCsv' | 'onExportSelectedExcel'>) {
    if (selectedCount === 0) return null;
    return (
        <div className="flex flex-wrap items-center gap-3 py-3 mb-4 border-t border-b border-white/10" role="toolbar" aria-label="Selection actions">
            <span className="text-sm text-white/70">{selectedCount} selected</span>
            <Button size="sm" variant="secondary" onClick={onExportSelectedCsv}>Export selected (CSV)</Button>
            <Button size="sm" variant="secondary" onClick={onExportSelectedExcel}>Export selected (Excel)</Button>
            <Button size="sm" variant="ghost" onClick={onClearSelection}>
                <X size={14} className="mr-1" aria-hidden="true" />Clear selection
            </Button>
        </div>
    );
}

export function LeadsFooter({
    filteredCount,
    totalCount,
    selectedCount,
    lists,
    activeListId,
    saveToListLoading,
    onSaveToList,
    onContinue,
    loading,
}: Pick<LeadsToolbarProps,
    'filteredCount' | 'totalCount' | 'selectedCount' | 'lists' | 'activeListId' |
    'saveToListLoading' | 'onSaveToList' | 'onContinue' | 'loading'
>) {
    if (!loading && totalCount === 0) return null;

    const activeListName = lists.find((l) => String(l.id) === String(activeListId))?.name;
    const saveLabel = saveToListLoading
        ? 'Saving…'
        : activeListId
            ? `Save to ${activeListName ?? 'list'}`
            : 'Save to List';

    return (
        <div className="flex flex-wrap items-center justify-between gap-4 mt-4 pt-4 border-t border-white/10">
            <span className="text-sm text-white/60">
                Showing {filteredCount} of {totalCount} companies
                {selectedCount > 0 && ` · ${selectedCount} selected`}
            </span>
            <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={onSaveToList} disabled={selectedCount === 0 || saveToListLoading}>
                    {saveLabel}
                </Button>
                <Button variant="primary" size="sm" onClick={onContinue}>
                    Continue<ArrowRight size={14} className="ml-1" aria-hidden="true" />
                </Button>
            </div>
        </div>
    );
}

export default LeadsToolbarHeader;
