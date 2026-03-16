/**
 * Floating Glass action bar when leads are selected.
 * Add selected to list (dropdown) or create new list from selection.
 */

import { ListPlus, PlusCircle, Trash2, X } from 'lucide-react';
import { Button, Select } from '../../components/ui';
import type { List } from '../../hooks/useLists';

const DELETE_LIST_CONFIRM_MESSAGE = (name: string) =>
    `Delete list "${name}"? This does not delete the leads, only removes them from this list.`;

interface LeadsFloatingActionBarProps {
    selectedCount: number;
    lists: List[];
    selectedListId: string;
    onSelectedListIdChange: (id: string) => void;
    onAddToList: (listId: number) => void;
    onCreateNewListFromSelection: () => void;
    onClearSelection: () => void;
    onDeleteList?: (listId: number) => void;
    loading: boolean;
    deleteListLoading?: boolean;
}

export default function LeadsFloatingActionBar({
    selectedCount,
    lists,
    selectedListId,
    onSelectedListIdChange,
    onAddToList,
    onCreateNewListFromSelection,
    onClearSelection,
    onDeleteList,
    loading,
    deleteListLoading = false,
}: LeadsFloatingActionBarProps) {
    if (selectedCount === 0) return null;

    const handleAddToList = () => {
        const id = selectedListId ? parseInt(selectedListId, 10) : 0;
        if (Number.isInteger(id) && id >= 1) {
            onAddToList(id);
        } else {
            onCreateNewListFromSelection();
        }
    };

    const selectedListIdNum = selectedListId ? parseInt(selectedListId, 10) : 0;
    const hasListSelected = Number.isInteger(selectedListIdNum) && selectedListIdNum >= 1;
    const selectedList = hasListSelected ? lists.find((l) => l.id === selectedListIdNum) : undefined;

    const handleDeleteList = () => {
        if (!onDeleteList || !hasListSelected || selectedListIdNum < 1) return;
        const name = selectedList?.name ?? 'List';
        if (!window.confirm(DELETE_LIST_CONFIRM_MESSAGE(name))) return;
        onDeleteList(selectedListIdNum);
    };

    return (
        <div
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[var(--z-sticky)] px-4 py-3 rounded-[var(--radius-card)] bg-[var(--color-bg-elevated)] backdrop-blur-3xl border border-white/10 shadow-[var(--shadow-card)] flex flex-wrap items-center gap-3 min-w-[280px] max-w-[90vw]"
            role="toolbar"
            aria-label="Bulk actions for selected leads"
        >
            <span className="text-sm font-medium text-white/90 mr-1">
                {selectedCount} selected
            </span>
            <Select
                id="floating-bar-list"
                value={selectedListId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onSelectedListIdChange(e.target.value || '')}
                disabled={loading}
                className="min-w-[180px]"
                aria-label="Choose list to add selected leads to"
            >
                <option value="">— Select list —</option>
                {lists.map((list) => (
                    <option key={list.id} value={String(list.id)}>
                        {list.name} {list.lead_count != null ? `(${list.lead_count})` : ''}
                    </option>
                ))}
            </Select>
            <Button
                variant="primary"
                size="sm"
                onClick={handleAddToList}
                disabled={loading}
                aria-label={hasListSelected ? `Add selected to list` : 'Open save to list'}
            >
                <ListPlus size={14} className="mr-1.5" aria-hidden />
                {hasListSelected ? 'Add to list' : 'Save to list…'}
            </Button>
            <Button
                variant="secondary"
                size="sm"
                onClick={onCreateNewListFromSelection}
                disabled={loading}
                aria-label="Create new list from selection"
            >
                <PlusCircle size={14} className="mr-1.5" aria-hidden />
                New list from selection
            </Button>
            {onDeleteList && hasListSelected && (
                <Button
                    variant="danger"
                    size="sm"
                    onClick={handleDeleteList}
                    disabled={loading || deleteListLoading}
                    aria-label="Delete list"
                >
                    <Trash2 size={14} className="mr-1.5" aria-hidden />
                    Delete list
                </Button>
            )}
            <Button
                variant="ghost"
                size="sm"
                onClick={onClearSelection}
                disabled={loading}
                aria-label="Clear selection"
                className="text-white/70 hover:text-white"
            >
                <X size={14} className="mr-1.5" aria-hidden />
                Clear
            </Button>
        </div>
    );
}
