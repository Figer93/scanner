/**
 * ProfilePage — orchestrator for the Profile/Settings page.
 *
 * Lean layout shell: loads profile data, renders section components,
 * manages the shared toast message.
 */

import { useState, useCallback } from 'react';
import { Settings, AlertTriangle, RefreshCw } from 'lucide-react';
import { useProfile } from '../../hooks/useProfile';
import { SkeletonGrid } from '../../components/ui/SkeletonCard';
import { Button } from '../../components/ui';
import ApiKeysSection from './ApiKeysSection';
import BrevoWebhookSection from './BrevoWebhookSection';
import MailgunWebhookSection from './MailgunWebhookSection';
import OutreachSection from './OutreachSection';
import SettingsSection from './SettingsSection';
import PipelineSection from './PipelineSection';
import ScheduleSection from './ScheduleSection';
import UsageSection from './UsageSection';

interface LogEntry {
    id?: number;
    message?: string;
}

interface ProfilePageProps {
    logs?: Array<string | LogEntry>;
    onClearLogs?: () => void;
}

interface ToastMessage {
    text: string;
    type: 'success' | 'error';
}

export default function ProfilePage({ logs = [], onClearLogs }: ProfilePageProps) {
    const { data: profile, isLoading, error, refetch } = useProfile();
    const [message, setMessage] = useState<ToastMessage | null>(null);

    const handleMessage = useCallback((msg: ToastMessage) => {
        setMessage(msg);
    }, []);

    if (isLoading) {
        return (
            <div className="space-y-6 w-full">
                <div>
                    <h1 className="text-2xl font-semibold text-white tracking-tight flex items-center gap-2">
                        <Settings size={22} className="text-white/50" aria-hidden="true" />
                        Profile
                    </h1>
                    <p className="text-sm text-white/70 mt-1">Loading settings…</p>
                </div>
                <SkeletonGrid count={4} cols={2} />
            </div>
        );
    }

    if (error || !profile || typeof profile !== 'object') {
        return (
            <div className="space-y-6 w-full">
                <div>
                    <h1 className="text-2xl font-semibold text-white tracking-tight flex items-center gap-2">
                        <Settings size={22} className="text-white/50" aria-hidden="true" />
                        Profile
                    </h1>
                </div>
                <div className="p-6 rounded-card bg-red-500/10 border border-red-400/20 text-center" role="alert">
                    <AlertTriangle size={32} className="mx-auto mb-3 text-red-400" aria-hidden="true" />
                    <p className="text-base font-semibold text-red-200 mb-1">Could not load profile</p>
                    <p className="text-sm text-red-300/70 mb-4">
                        {error instanceof Error ? error.message : 'Unknown error'}
                    </p>
                    <Button variant="secondary" size="sm" onClick={() => void refetch()}>
                        <RefreshCw size={14} className="mr-1" aria-hidden="true" />
                        Retry
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 w-full">
            <div>
                <h1 className="text-2xl font-semibold text-white tracking-tight flex items-center gap-2">
                    <Settings size={22} className="text-white/50" aria-hidden="true" />
                    Profile
                </h1>
                <p className="text-sm text-white/70 mt-1">
                    API keys and settings. Values saved here are stored in the database and override .env. No restart needed.
                </p>
            </div>

            {message && (
                <div
                    className={`p-4 rounded-xl text-sm ${
                        message.type === 'error'
                            ? 'bg-red-500/20 border border-red-400/30 text-red-200'
                            : 'bg-emerald-500/20 border border-emerald-400/30 text-emerald-200'
                    }`}
                    role={message.type === 'error' ? 'alert' : 'status'}
                >
                    {message.text}
                </div>
            )}

            <ApiKeysSection profile={profile} onMessage={handleMessage} />
            <MailgunWebhookSection />
            <OutreachSection profile={profile} onMessage={handleMessage} />
            <SettingsSection profile={profile} onMessage={handleMessage} />
            <PipelineSection logs={logs} onClearLogs={onClearLogs} onMessage={handleMessage} />
            <ScheduleSection onMessage={handleMessage} />
            <UsageSection />
        </div>
    );
}
