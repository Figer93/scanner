/**
 * Estimated earnings inputs (referral value and conversion rate) for dashboard ROI.
 */

import { useState, useCallback, useEffect } from 'react';
import { Banknote, Save } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { GlassCard, Button, Input } from '../../components/ui';
import { useProfile, useSaveProfile } from '../../hooks/useProfile';
import { earningsKeys } from '../../hooks/useEarnings';

const DEFAULT_CONVERSION_PCT = 15;

interface MessagePayload {
    text: string;
    type: 'success' | 'error';
}

interface EarningsSectionProps {
    onMessage: (msg: MessagePayload) => void;
}

export default function EarningsSection({ onMessage }: EarningsSectionProps) {
    const queryClient = useQueryClient();
    const { data: profile } = useProfile();
    const saveProfile = useSaveProfile();

    const [referralPounds, setReferralPounds] = useState('');
    const [conversionPct, setConversionPct] = useState(String(DEFAULT_CONVERSION_PCT));
    const [saving, setSaving] = useState(false);

    const referralNum = profile?.earnings_referral_pounds ?? null;
    const conversionNum = profile?.earnings_conversion_rate_pct ?? DEFAULT_CONVERSION_PCT;

    useEffect(() => {
        setReferralPounds(referralNum != null ? String(referralNum) : '');
        setConversionPct(conversionNum != null ? String(conversionNum) : String(DEFAULT_CONVERSION_PCT));
    }, [referralNum, conversionNum]);

    const handleSave = useCallback(async () => {
        setSaving(true);
        try {
            await saveProfile.mutateAsync({
                earnings_referral_pounds: referralPounds.trim() === '' ? undefined : parseFloat(referralPounds),
                earnings_conversion_rate_pct: conversionPct.trim() === '' ? DEFAULT_CONVERSION_PCT : parseFloat(conversionPct),
            });
            void queryClient.invalidateQueries({ queryKey: earningsKeys.data() });
            onMessage({ text: 'Earnings settings saved.', type: 'success' });
        } catch (e: unknown) {
            onMessage({
                text: e instanceof Error ? e.message : 'Save failed',
                type: 'error',
            });
        } finally {
            setSaving(false);
        }
    }, [referralPounds, conversionPct, saveProfile, queryClient, onMessage]);

    return (
        <GlassCard className="p-6" id="profile-earnings-settings">
            <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                <Banknote size={18} className="text-white/50" aria-hidden="true" />
                Estimated earnings
            </h2>
            <p className="text-xs text-white/60 mb-4">
                Used for the dashboard “Est. earnings this month” card. Referral value per converted lead and assumed conversion rate from outreach.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                    <label htmlFor="profile-earnings-referral" className="block text-xs font-medium text-white/70 mb-1">
                        Referral value (£ per conversion)
                    </label>
                    <Input
                        id="profile-earnings-referral"
                        type="number"
                        min={0}
                        step={0.01}
                        placeholder="e.g. 50"
                        value={referralPounds}
                        onChange={(e) => setReferralPounds(e.target.value)}
                    />
                </div>
                <div>
                    <label htmlFor="profile-earnings-conversion" className="block text-xs font-medium text-white/70 mb-1">
                        Conversion rate (%)
                    </label>
                    <Input
                        id="profile-earnings-conversion"
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        placeholder={String(DEFAULT_CONVERSION_PCT)}
                        value={conversionPct}
                        onChange={(e) => setConversionPct(e.target.value)}
                    />
                </div>
            </div>
            <Button variant="primary" size="sm" onClick={() => void handleSave()} disabled={saving}>
                <Save size={14} className="mr-1" aria-hidden="true" />
                {saving ? 'Saving…' : 'Save'}
            </Button>
        </GlassCard>
    );
}
