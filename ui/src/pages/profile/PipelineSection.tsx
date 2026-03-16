/**
 * Run pipeline card + confirmation modal + logs panel.
 */

import { useState, useCallback, useEffect } from 'react';
import { Play, ChevronDown, ChevronUp, Terminal } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import { GlassCard, Button, Input, Select } from '../../components/ui';
import Modal from '../../components/ui/Modal';
import { useLastPipelineRun, analyticsKeys } from '../../hooks/useAnalytics';

interface LogEntry {
    id?: number;
    message?: string;
}

interface MessagePayload {
    text: string;
    type: 'success' | 'error';
}

interface PipelineSectionProps {
    logs: Array<string | LogEntry>;
    onClearLogs?: () => void;
    onMessage: (msg: MessagePayload) => void;
}

const SOURCE_OPTIONS = [
    { value: 'companies_house', label: 'Companies House' },
    { value: 'google_maps', label: 'Google Maps' },
    { value: 'json_file', label: 'JSON file' },
];

export default function PipelineSection({ logs, onClearLogs, onMessage }: PipelineSectionProps) {
    const queryClient = useQueryClient();
    const { data: lastRun } = useLastPipelineRun();

    const [modalOpen, setModalOpen] = useState(false);
    const [runSource, setRunSource] = useState('companies_house');
    const [runLimit, setRunLimit] = useState(10);
    const [running, setRunning] = useState(false);
    const [logsExpanded, setLogsExpanded] = useState(false);

    useEffect(() => {
        if (running) setLogsExpanded(true);
    }, [running]);

    const openModal = useCallback(() => {
        setRunSource('companies_house');
        setRunLimit(10);
        setModalOpen(true);
    }, []);

    const handleRun = useCallback(async () => {
        setRunning(true);
        setModalOpen(false);
        try {
            const data: { summary?: { inserted?: number; enriched?: number } } = await api.post('/api/run', { source: runSource, limit: runLimit });
            onMessage({ text: `Pipeline complete — ${data?.summary?.inserted ?? 0} added, ${data?.summary?.enriched ?? 0} enriched`, type: 'success' });
            void queryClient.invalidateQueries({ queryKey: analyticsKeys.lastPipelineRun() });
        } catch (e: unknown) {
            onMessage({ text: e instanceof Error ? e.message : 'Pipeline run failed', type: 'error' });
        } finally {
            setRunning(false);
        }
    }, [runSource, runLimit, queryClient, onMessage]);

    const formatLogLine = (line: string | LogEntry): string => {
        if (typeof line === 'object' && line?.message != null) return line.message;
        return String(line);
    };

    return (
        <>
            <GlassCard className="p-6">
                <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                    <Play size={18} className="text-white/50" aria-hidden="true" />
                    Run pipeline
                </h2>
                <p className="text-xs text-white/50 mb-3">Run the lead pipeline now. Logs will stream below.</p>
                {lastRun && (
                    <p className="text-xs text-white/40 mb-3">
                        Last run: {lastRun.at ? new Date(lastRun.at).toLocaleString() : '—'}
                        {' — source: '}{lastRun.source ?? '—'}{', limit: '}{lastRun.limit ?? '—'}
                        {' — inserted: '}{lastRun.inserted ?? 0}{', enriched: '}{lastRun.enriched ?? 0}
                    </p>
                )}
                <Button variant="primary" size="sm" onClick={openModal} disabled={running}>
                    <Play size={14} className="mr-1" aria-hidden="true" />
                    {running ? 'Running…' : 'Run pipeline'}
                </Button>
            </GlassCard>

            <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Run pipeline" size="sm">
                <p className="text-sm text-white/70 mb-4">Confirm to run. Logs will stream below.</p>
                <div className="space-y-3 mb-4">
                    <div>
                        <label htmlFor="run-source" className="block text-xs text-white/60 mb-1">Source</label>
                        <Select id="run-source" value={runSource} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setRunSource(e.target.value)}>
                            {SOURCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </Select>
                    </div>
                    <div>
                        <label htmlFor="run-limit" className="block text-xs text-white/60 mb-1">Limit</label>
                        <Input id="run-limit" type="number" min={1} max={500} value={runLimit} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRunLimit(Number(e.target.value) || 10)} />
                    </div>
                </div>
                <div className="flex gap-3 justify-end">
                    <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
                    <Button variant="primary" onClick={handleRun}>Confirm &amp; run</Button>
                </div>
            </Modal>

            <GlassCard className="p-6">
                <h2 className="text-lg font-semibold text-white mb-2">
                    <button
                        type="button"
                        className="flex items-center gap-2 text-left w-full hover:text-white/90 transition-colors"
                        onClick={() => setLogsExpanded((e) => !e)}
                        aria-expanded={logsExpanded}
                    >
                        <Terminal size={18} className="text-white/50" aria-hidden="true" />
                        Logs
                        {logs.length > 0 && <span className="text-xs text-white/40 font-normal">({logs.length})</span>}
                        {logsExpanded ? <ChevronUp size={16} className="ml-auto text-white/40" /> : <ChevronDown size={16} className="ml-auto text-white/40" />}
                    </button>
                </h2>
                <p className="text-xs text-white/50 mb-2">Pipeline output streams here when you run from this page.</p>
                {logsExpanded && (
                    <div className="mt-3 max-h-64 overflow-y-auto rounded-inner bg-white/3 border border-white/10 p-3 font-mono text-xs text-white/70">
                        {logs.length === 0 ? (
                            <p className="text-white/30">No logs yet. Run the pipeline to see output.</p>
                        ) : (
                            <ul className="space-y-0.5">
                                {logs.map((line, i) => (
                                    <li key={typeof line === 'object' && line?.id != null ? line.id : i}>
                                        {formatLogLine(line)}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
            </GlassCard>
        </>
    );
}
