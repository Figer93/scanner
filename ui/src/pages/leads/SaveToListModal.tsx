/**
 * Save-to-list modal: select existing list or create new one.
 * Uses Modal primitive for focus trap, Escape close, ARIA.
 */

import { useState, useCallback } from 'react';
import { ListPlus } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import { Button, Input, Select } from '../../components/ui';
import type { List } from '../../hooks/useLists';

interface SaveToListModalProps {
    open: boolean;
    onClose: () => void;
    lists: List[];
    selectedCount: number;
    initialListId?: string;
    onSave: (listId: number | null, newListName: string) => void;
    loading: boolean;
    error: string | null;
}

export default function SaveToListModal({
    open,
    onClose,
    lists,
    selectedCount,
    initialListId = '',
    onSave,
    loading,
    error,
}: SaveToListModalProps) {
    const [selectedListId, setSelectedListId] = useState(initialListId);
    const [newListName, setNewListName] = useState('');

    const handleSave = useCallback(() => {
        if (newListName.trim()) {
            onSave(null, newListName.trim());
        } else {
            const id = parseInt(selectedListId, 10);
            if (Number.isInteger(id) && id >= 1) {
                onSave(id, '');
            }
        }
    }, [selectedListId, newListName, onSave]);

    const canSave = !loading && (!!selectedListId || !!newListName.trim());

    return (
        <Modal open={open} onClose={() => !loading && onClose()} title="Save to List" size="md">
            <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center justify-center w-10 h-10 rounded-inner bg-white/5 border border-white/10" aria-hidden="true">
                    <ListPlus size={18} className="text-white/40" />
                </div>
                <p className="text-sm text-white/70">
                    Save {selectedCount} selected {selectedCount === 1 ? 'company' : 'companies'} to a list.
                    They will be added as leads if not already present.
                </p>
            </div>

            {error && (
                <div className="mb-4 p-3 rounded-inner bg-red-500/20 border border-red-400/30 text-red-200 text-sm" role="alert">
                    {error}
                </div>
            )}

            <div className="space-y-2 mb-4">
                <label htmlFor="stl-existing" className="block text-sm text-white/70">Existing list</label>
                <Select
                    id="stl-existing"
                    value={selectedListId}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedListId(e.target.value)}
                    disabled={loading}
                >
                    <option value="">— Select list —</option>
                    {lists.map((list) => (
                        <option key={list.id} value={String(list.id)}>
                            {list.name} {list.lead_count != null ? `(${list.lead_count})` : ''}
                        </option>
                    ))}
                </Select>
            </div>

            <div className="space-y-2 mb-6">
                <label htmlFor="stl-new" className="block text-sm text-white/70">Or create new list</label>
                <Input
                    id="stl-new"
                    placeholder="List name"
                    value={newListName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewListName(e.target.value)}
                    disabled={loading}
                />
            </div>

            <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => !loading && onClose()} disabled={loading}>Cancel</Button>
                <Button variant="primary" onClick={handleSave} disabled={!canSave}>
                    {loading ? 'Saving…' : 'Save'}
                </Button>
            </div>
        </Modal>
    );
}
