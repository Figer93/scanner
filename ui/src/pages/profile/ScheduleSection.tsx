/**
 * Scheduled pipeline runs configuration (cron expression, source, limit).
 */

import { useState, useEffect, useCallback } from 'react';
import { Clock, Save } from 'lucide-react';
import { GlassCard, Button, Input, Select } from '../../components/ui';
import { useSchedule, useSaveSchedule } from '../../hooks/useProfile';

interface MessagePayload {
    text: string;
    type: 'success' | 'error';
}

interface ScheduleSectionProps {
    onMessage: (msg: MessagePayload) => void;
}

const SOURCE_OPTIONS = [
    { value: 'companies_house', label: 'Companies House' },
    { value: 'google_maps', label: 'Google Maps' },
    { value: 'charity_commission', label: 'Charity Commission' },
    { value: 'fca_register', label: 'FCA Register' },
    { value: 'json_file', label: 'JSON file' },
];

export default function ScheduleSection({ onMessage }: ScheduleSectionProps) {
    const { data, error: loadError, refetch } = useSchedule();
    const saveMutation = useSaveSchedule();

    const [cron, setCron] = useState('');
    const [source, setSource] = useState('companies_house');
    const [limit, setLimit] = useState(20);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (data && !dirty) {
            setCron(data.cron ?? '');
            setSource(data.source ?? 'companies_house');
            setLimit(data.limit ?? 20);
        }
    }, [data, dirty]);

    const handleSave = useCallback(async () => {
        setSaving(true);
        try {
            await saveMutation.mutateAsync({ cron, source, limit });
            setDirty(false);
            onMessage({ text: cron ? `Schedule saved. Cron: ${cron}` : 'Schedule saved. Scheduled runs disabled.', type: 'success' });
        } catch (e: unknown) {
            onMessage({ text: `Save failed: ${e instanceof Error ? e.message : 'Unknown error'}`, type: 'error' });
        } finally {
            setSaving(false);
        }
    }, [cron, source, limit, saveMutation, onMessage]);

    return (
        <GlassCard className="p-6">
            <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                <Clock size={18} className="text-white/50" aria-hidden="true" />
                Scheduled runs
            </h2>
            <p className="text-xs text-white/50 mb-4">
                Run the pipeline on a cron schedule (e.g. &quot;0 9 * * *&quot; for daily at 9am). Leave cron empty to disable.
            </p>
            {loadError && (
                <div className="mb-3 text-sm text-red-300">
                    Schedule: {loadError instanceof Error ? loadError.message : 'Failed to load'}
                    {' '}
                    <button type="button" className="underline hover:text-white" onClick={() => void refetch()}>Retry</button>
                </div>
            )}
            <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[200px]">
                    <label htmlFor="sched-cron" className="block text-xs text-white/60 mb-1">Cron expression</label>
                    <Input
                        id="sched-cron"
                        placeholder="0 9 * * * (daily 9am)"
                        value={cron}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setCron(e.target.value); setDirty(true); }}
                    />
                </div>
                <div className="w-44">
                    <label htmlFor="sched-source" className="block text-xs text-white/60 mb-1">Source</label>
                    <Select
                        id="sched-source"
                        value={source}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { setSource(e.target.value); setDirty(true); }}
                    >
                        {SOURCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </Select>
                </div>
                <div className="w-20">
                    <label htmlFor="sched-limit" className="block text-xs text-white/60 mb-1">Limit</label>
                    <Input
                        id="sched-limit"
                        type="number"
                        min={1}
                        max={500}
                        value={limit}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setLimit(Number(e.target.value) || 20); setDirty(true); }}
                    />
                </div>
                <Button variant="primary" size="sm" onClick={handleSave} disabled={saving || !dirty}>
                    <Save size={14} className="mr-1" aria-hidden="true" />
                    {saving ? '…' : 'Save schedule'}
                </Button>
            </div>
        </GlassCard>
    );
}
