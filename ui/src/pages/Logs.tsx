/**
 * Logs — live stream of pipeline, sync, and system activity.
 */

import { useRef, useEffect, useState } from 'react';
import { GlassCard, Button } from '../components/ui';

type LogLevel = 'error' | 'warn' | 'info';

interface LogEntry {
    id?: number;
    message?: string;
    time?: string;
}

interface ParsedEntry {
    id: number | string;
    time: string | null;
    level: LogLevel;
    source: string;
    message: string;
}

interface LogsProps {
    logs?: Array<string | LogEntry>;
    onClearLogs?: () => void;
}

function parseLogEntry(message: string): { level: LogLevel; source: string; message: string } {
    const str = String(message ?? '');
    let level: LogLevel = 'info';
    let source = 'App';
    let text = str;

    if (/^\s*ERROR\s*[:\[]/i.test(str)) level = 'error';
    else if (/^\s*WARN/i.test(str) || /warning/i.test(str)) level = 'warn';

    const syncMatch = str.match(/^\[Sync\s+([^\]]*)\]\s*(.*)/);
    if (syncMatch) {
        source = syncMatch[1]?.trim() ? `Sync: ${syncMatch[1].trim()}` : 'Sync';
        text = syncMatch[2] ?? '';
    } else if (str.startsWith('[Scheduled]')) {
        source = 'Scheduled';
        text = str.slice('[Scheduled]'.length).trim();
    } else if (str.startsWith('[Sync]')) {
        source = 'Sync';
        text = str.slice('[Sync]'.length).trim();
    } else if (/^ERROR\s*[:\[]/i.test(str)) {
        text = str.replace(/^ERROR\s*[:\[]?\s*/i, '');
    }

    return { level, source, message: text || str };
}

function formatTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    try {
        const d = new Date(iso);
        return d.toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch { return iso; }
}

function formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    try {
        const d = new Date(iso);
        return d.toLocaleDateString(undefined, { dateStyle: 'short' });
    } catch { return iso; }
}

export default function Logs({ logs = [], onClearLogs }: LogsProps) {
    const listEndRef = useRef<HTMLDivElement>(null);
    const prevLengthRef = useRef(0);
    const [liveIndicator, setLiveIndicator] = useState(false);
    const isEmpty = !Array.isArray(logs) || logs.length === 0;

    useEffect(() => {
        const length = Array.isArray(logs) ? logs.length : 0;
        if (length > prevLengthRef.current) {
            setLiveIndicator(true);
            const t = requestAnimationFrame(() => listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }));
            const clear = setTimeout(() => setLiveIndicator(false), 1500);
            prevLengthRef.current = length;
            return () => { cancelAnimationFrame(t); clearTimeout(clear); };
        }
        prevLengthRef.current = length;
        return undefined;
    }, [logs]);

    const entries: ParsedEntry[] = (Array.isArray(logs) ? logs : []).map((item, index) => {
        const isObj = item !== null && typeof item === 'object' && 'message' in item;
        const raw = isObj ? (item as LogEntry).message ?? '' : String(item ?? '');
        const time = isObj && (item as LogEntry).time ? (item as LogEntry).time! : null;
        const id = isObj && (item as LogEntry).id != null ? (item as LogEntry).id! : index;
        return { id, time: time ?? null, ...parseLogEntry(raw) };
    });

    const badgeCls = (level: LogLevel) =>
        level === 'error' ? 'bg-red-500/20 text-red-300 border-red-400/30'
        : level === 'warn' ? 'bg-amber-500/20 text-amber-300 border-amber-400/30'
        : 'bg-white/10 text-white/80 border-white/10';

    return (
        <div className="space-y-4 w-full">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-white tracking-tight">Logs</h1>
                    <span
                        className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium ${liveIndicator ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/40' : 'bg-white/10 text-white/60 border border-white/10'}`}
                        aria-live="polite"
                    >
                        Live
                    </span>
                </div>
                <p className="text-sm text-white/60">Live stream of pipeline, sync, and system activity. New entries appear at the bottom.</p>
                {!isEmpty && (
                    <Button variant="secondary" size="sm" onClick={onClearLogs} title="Clear all log entries">Clear logs</Button>
                )}
            </div>

            <GlassCard className="p-0 overflow-hidden">
                <div className="max-h-[70vh] overflow-auto">
                    {isEmpty ? (
                        <p className="p-6 text-white/60 text-sm">No logs yet. Run the pipeline from Profile, sync a lead, or trigger scheduled runs to see activity here.</p>
                    ) : (
                        <table className="w-full text-sm" aria-label="Structured log entries">
                            <caption className="sr-only">System log entries</caption>
                            <thead className="sticky top-0 bg-white/10 backdrop-blur border-b border-white/10">
                                <tr>
                                    <th scope="col" className="py-2.5 px-4 text-left text-xs font-semibold text-white/50 uppercase">Time</th>
                                    <th scope="col" className="py-2.5 px-4 text-left text-xs font-semibold text-white/50 uppercase">Date</th>
                                    <th scope="col" className="py-2.5 px-4 text-left text-xs font-semibold text-white/50 uppercase">Level</th>
                                    <th scope="col" className="py-2.5 px-4 text-left text-xs font-semibold text-white/50 uppercase">Source</th>
                                    <th scope="col" className="py-2.5 px-4 text-left text-xs font-semibold text-white/50 uppercase">Message</th>
                                </tr>
                            </thead>
                            <tbody>
                                {entries.map((entry, index) => (
                                    <tr key={entry.id != null ? entry.id : `log-${index}`} className={`border-b border-white/5 hover:bg-white/5 ${entry.level === 'error' ? 'bg-red-500/5' : entry.level === 'warn' ? 'bg-amber-500/5' : ''}`}>
                                        <td className="py-2 px-4 text-white/70 font-mono text-xs">{formatTime(entry.time)}</td>
                                        <td className="py-2 px-4 text-white/70">{formatDate(entry.time)}</td>
                                        <td className="py-2 px-4"><span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${badgeCls(entry.level)}`}>{entry.level}</span></td>
                                        <td className="py-2 px-4 text-white/80">{entry.source}</td>
                                        <td className="py-2 px-4 text-white/90">{entry.message}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </GlassCard>
            <div ref={listEndRef} aria-hidden="true" />
        </div>
    );
}
