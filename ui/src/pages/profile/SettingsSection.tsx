/**
 * Lead scoring criteria, team members, and webhook configuration.
 */

import { useState, useCallback, useEffect } from 'react';
import { Target, Users, Webhook, Save } from 'lucide-react';
import { GlassCard, Button, Input } from '../../components/ui';
import { useSaveProfile } from '../../hooks/useProfile';
import type { ProfileData } from '../../hooks/useProfile';

interface MessagePayload {
    text: string;
    type: 'success' | 'error';
}

interface SettingsSectionProps {
    profile: ProfileData;
    onMessage: (msg: MessagePayload) => void;
}

export default function SettingsSection({ profile, onMessage }: SettingsSectionProps) {
    const [scoringCriteria, setScoringCriteria] = useState(profile.lead_scoring_criteria || '');
    const [scoringDirty, setScoringDirty] = useState(false);
    const [teamMembers, setTeamMembers] = useState(profile.team_members || '');
    const [teamDirty, setTeamDirty] = useState(false);
    const [webhookUrl, setWebhookUrl] = useState(profile.webhook_url || '');
    const [webhookThreshold, setWebhookThreshold] = useState(profile.webhook_score_threshold || '7');
    const [saving, setSaving] = useState<string | null>(null);

    const saveProfile = useSaveProfile();

    // Sync from server when profile refreshes (unless user has unsaved edits)
    useEffect(() => {
        if (!scoringDirty) setScoringCriteria(profile.lead_scoring_criteria || '');
        if (!teamDirty) setTeamMembers(profile.team_members || '');
        setWebhookUrl(profile.webhook_url || '');
        setWebhookThreshold(profile.webhook_score_threshold || '7');
    }, [profile, scoringDirty, teamDirty]);

    const saveField = useCallback(async (field: string, payload: Record<string, string>, onDone?: () => void) => {
        setSaving(field);
        try {
            await saveProfile.mutateAsync(payload);
            onDone?.();
            onMessage({ text: `${field === 'webhook' ? 'Webhook settings' : field === 'lead_scoring_criteria' ? 'Lead scoring criteria' : 'Team members'} saved.`, type: 'success' });
        } catch (e: unknown) {
            onMessage({ text: `Save failed: ${e instanceof Error ? e.message : 'Unknown error'}`, type: 'error' });
        } finally {
            setSaving(null);
        }
    }, [saveProfile, onMessage]);

    return (
        <>
            <GlassCard className="p-6">
                <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                    <Target size={18} className="text-white/50" aria-hidden="true" />
                    Lead scoring &amp; team
                </h2>
                <div className="space-y-5">
                    <div>
                        <label htmlFor="scoring-criteria" className="block text-sm font-medium text-white/80 mb-1">Lead scoring criteria</label>
                        <p className="text-xs text-white/50 mb-2">Used when you click "Score" on a lead. Example: "B2B, UK-based, has website, suitable for agency outreach".</p>
                        <textarea
                            id="scoring-criteria"
                            className="w-full rounded-inner bg-white/5 border border-white/10 text-white/90 text-sm px-3 py-2 placeholder-white/30 focus:outline-none focus:border-[var(--color-border-active)] focus:ring-1 focus:ring-[var(--color-accent-primary)] resize-y"
                            placeholder="e.g. B2B fit, has contact info, UK-based"
                            value={scoringCriteria}
                            onChange={(e) => { setScoringCriteria(e.target.value); setScoringDirty(true); }}
                            rows={3}
                        />
                        <Button
                            variant="primary"
                            size="sm"
                            className="mt-2"
                            onClick={() => saveField('lead_scoring_criteria', { lead_scoring_criteria: scoringCriteria }, () => setScoringDirty(false))}
                            disabled={saving === 'lead_scoring_criteria' || !scoringDirty}
                        >
                            <Save size={14} className="mr-1" aria-hidden="true" />
                            {saving === 'lead_scoring_criteria' ? '…' : 'Save criteria'}
                        </Button>
                    </div>
                    <div>
                        <label htmlFor="team-members" className="block text-sm font-medium text-white/80 mb-1 flex items-center gap-2">
                            <Users size={15} className="text-white/50" aria-hidden="true" />
                            Team members
                        </label>
                        <p className="text-xs text-white/50 mb-2">Comma-separated names for the Assign lead dropdown on lead profiles.</p>
                        <Input
                            id="team-members"
                            placeholder="Alice, Bob, Carol"
                            value={teamMembers}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setTeamMembers(e.target.value); setTeamDirty(true); }}
                        />
                        <Button
                            variant="primary"
                            size="sm"
                            className="mt-2"
                            onClick={() => saveField('team_members', { team_members: teamMembers }, () => setTeamDirty(false))}
                            disabled={saving === 'team_members' || !teamDirty}
                        >
                            <Save size={14} className="mr-1" aria-hidden="true" />
                            {saving === 'team_members' ? '…' : 'Save'}
                        </Button>
                    </div>
                </div>
            </GlassCard>

            <GlassCard className="p-6">
                <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                    <Webhook size={18} className="text-white/50" aria-hidden="true" />
                    Webhook
                </h2>
                <p className="text-xs text-white/50 mb-4">When a lead is scored at or above the threshold, or status changes to Qualified/Converted, a POST is sent to this URL.</p>
                <div className="flex flex-wrap items-end gap-3">
                    <div className="flex-1 min-w-[200px]">
                        <label htmlFor="webhook-url" className="block text-xs text-white/60 mb-1">Webhook URL</label>
                        <Input
                            id="webhook-url"
                            type="url"
                            placeholder="https://hooks.slack.com/… or webhook URL"
                            value={webhookUrl}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWebhookUrl(e.target.value)}
                        />
                    </div>
                    <div className="w-24">
                        <label htmlFor="webhook-threshold" className="block text-xs text-white/60 mb-1">Min score</label>
                        <Input
                            id="webhook-threshold"
                            type="number"
                            min={1}
                            max={10}
                            value={webhookThreshold}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWebhookThreshold(e.target.value)}
                        />
                    </div>
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={() => saveField('webhook', { webhook_url: webhookUrl, webhook_score_threshold: webhookThreshold })}
                        disabled={saving === 'webhook'}
                    >
                        <Save size={14} className="mr-1" aria-hidden="true" />
                        {saving === 'webhook' ? '…' : 'Save'}
                    </Button>
                </div>
            </GlassCard>
        </>
    );
}
