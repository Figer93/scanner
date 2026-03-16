/**
 * Outreach settings: referral link, sender name/email, daily send limit, send delay.
 * Saved via useSaveProfile(); used by template vars and Phase 2B queue.
 */

import { useState, useCallback, useEffect } from 'react';
import { Send, Save } from 'lucide-react';
import { GlassCard, Button, Input } from '../../components/ui';
import { useSaveProfile } from '../../hooks/useProfile';
import type { ProfileData } from '../../hooks/useProfile';

interface MessagePayload {
    text: string;
    type: 'success' | 'error';
}

interface OutreachSectionProps {
    profile: ProfileData & {
        referral_link?: string;
        referral_link_source?: string;
        sender_name?: string;
        sender_name_source?: string;
        sender_email?: string;
        sender_email_source?: string;
        daily_send_limit?: number;
        daily_send_limit_source?: string;
        send_delay_minutes?: number;
        send_delay_minutes_source?: string;
    };
    onMessage: (msg: MessagePayload) => void;
}

const DEFAULT_DAILY_LIMIT = 50;
const DEFAULT_SEND_DELAY = 3;

function safeString(v: unknown): string {
    if (v == null) return '';
    return typeof v === 'string' ? v : String(v);
}
function safeNumber(v: unknown, fallback: number): number {
    if (v == null) return fallback;
    const n = typeof v === 'number' ? v : parseInt(String(v), 10);
    return Number.isNaN(n) ? fallback : n;
}

export default function OutreachSection({ profile, onMessage }: OutreachSectionProps) {
    const p = profile ?? {};
    const [referralLink, setReferralLink] = useState(() => safeString(p.referral_link));
    const [senderName, setSenderName] = useState(() => safeString(p.sender_name));
    const [senderEmail, setSenderEmail] = useState(() => safeString(p.sender_email));
    const [dailyLimit, setDailyLimit] = useState(() => safeNumber(p.daily_send_limit, DEFAULT_DAILY_LIMIT));
    const [sendDelay, setSendDelay] = useState(() => safeNumber(p.send_delay_minutes, DEFAULT_SEND_DELAY));
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setReferralLink(safeString(p.referral_link));
        setSenderName(safeString(p.sender_name));
        setSenderEmail(safeString(p.sender_email));
        setDailyLimit(safeNumber(p.daily_send_limit, DEFAULT_DAILY_LIMIT));
        setSendDelay(safeNumber(p.send_delay_minutes, DEFAULT_SEND_DELAY));
    }, [p.referral_link, p.sender_name, p.sender_email, p.daily_send_limit, p.send_delay_minutes]);

    const saveProfile = useSaveProfile();

    const handleSave = useCallback(async () => {
        setSaving(true);
        try {
            await saveProfile.mutateAsync({
                referral_link: referralLink.trim(),
                sender_name: senderName.trim(),
                sender_email: senderEmail.trim(),
                daily_send_limit: dailyLimit,
                send_delay_minutes: sendDelay,
            });
            onMessage({ text: 'Outreach settings saved.', type: 'success' });
        } catch (e: unknown) {
            onMessage({
                text: e instanceof Error ? e.message : 'Save failed',
                type: 'error',
            });
        } finally {
            setSaving(false);
        }
    }, [referralLink, senderName, senderEmail, dailyLimit, sendDelay, saveProfile, onMessage]);

    return (
        <GlassCard className="p-6">
            <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                <Send size={18} className="text-white/50" aria-hidden="true" />
                Outreach settings
            </h2>
            <p className="text-xs text-white/60 mb-4">
                Used in email templates (e.g. {'{{referral_link}}'}, {'{{sender_name}}'}) and by the send queue (Phase 2B).
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <label htmlFor="outreach-referral-link" className="block text-sm font-medium text-white/80">
                        Referral link
                    </label>
                    <Input
                        id="outreach-referral-link"
                        type="url"
                        placeholder="https://revolut.com/referral/your-code"
                        value={referralLink}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setReferralLink(e.target.value)}
                        className="w-full"
                        aria-label="Revolut referral link"
                    />
                </div>
                <div className="space-y-2">
                    <label htmlFor="outreach-sender-name" className="block text-sm font-medium text-white/80">
                        Sender name
                    </label>
                    <Input
                        id="outreach-sender-name"
                        type="text"
                        placeholder="Alex from CHScanner"
                        value={senderName}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSenderName(e.target.value)}
                        className="w-full"
                        aria-label="Sender name for emails"
                    />
                </div>
                <div className="space-y-2">
                    <label htmlFor="outreach-sender-email" className="block text-sm font-medium text-white/80">
                        Sender email
                    </label>
                    <Input
                        id="outreach-sender-email"
                        type="email"
                        placeholder="noreply@yourdomain.com"
                        value={senderEmail}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSenderEmail(e.target.value)}
                        className="w-full"
                        aria-label="From address for sent emails"
                    />
                    <p className="text-xs text-white/50">Required for sending test emails and queue.</p>
                </div>
                <div className="space-y-2">
                    <label htmlFor="outreach-daily-limit" className="block text-sm font-medium text-white/80">
                        Daily send limit
                    </label>
                    <input
                        id="outreach-daily-limit"
                        type="number"
                        min={1}
                        max={1000}
                        value={dailyLimit}
                        onChange={(e) => setDailyLimit(Math.max(1, parseInt(e.target.value, 10) || DEFAULT_DAILY_LIMIT))}
                        className="w-full bg-white/5 border border-white/10 rounded-inner px-4 py-2.5 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/50"
                        aria-label="Maximum emails to send per day"
                    />
                </div>
                <div className="space-y-2">
                    <label htmlFor="outreach-send-delay" className="block text-sm font-medium text-white/80">
                        Send delay (minutes)
                    </label>
                    <input
                        id="outreach-send-delay"
                        type="number"
                        min={0}
                        max={60}
                        value={sendDelay}
                        onChange={(e) => setSendDelay(Math.max(0, Math.min(60, parseInt(e.target.value, 10) || DEFAULT_SEND_DELAY)))}
                        className="w-full bg-white/5 border border-white/10 rounded-inner px-4 py-2.5 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/50"
                        aria-label="Minimum minutes between each send"
                    />
                </div>
            </div>
            <div className="mt-4">
                <Button
                    variant="primary"
                    onClick={handleSave}
                    disabled={saving}
                    aria-label="Save outreach settings"
                >
                    <Save size={14} className="mr-1" aria-hidden="true" />
                    {saving ? 'Saving…' : 'Save'}
                </Button>
            </div>
        </GlassCard>
    );
}
