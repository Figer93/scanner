/**
 * API keys management: save/clear/reveal for each configured service key.
 */

import { useState, useCallback } from 'react';
import { Eye, EyeOff, Save, Trash2 } from 'lucide-react';
import { GlassCard, Button, Input } from '../../components/ui';
import { useSaveProfile, useDeleteProfileKey } from '../../hooks/useProfile';
import type { ProfileData } from '../../hooks/useProfile';

interface MessagePayload {
    text: string;
    type: 'success' | 'error';
}

interface ApiKeysDef {
    key: string;
    label: string;
    description: string;
}

const API_KEYS: ApiKeysDef[] = [
    { key: 'companies_house_api_key', label: 'Companies House API key', description: 'Required for Find Leads: syncs CH cache, fetches company and officer data.' },
    { key: 'google_ai_api_key', label: 'Google AI (Gemini) API key', description: 'Used for lead scoring, outreach draft generation, and AI enrichment.' },
    { key: 'serper_api_key', label: 'Serper API key', description: 'Used to find company websites via search when enriching leads.' },
    { key: 'google_places_api_key', label: 'Google Places API key', description: 'Used when pipeline source is Google Maps to discover businesses.' },
    { key: 'apify_api_token', label: 'Apify API token', description: 'Used for LinkedIn company scraping when enriching leads.' },
    { key: 'apify_linkedin_actor_id', label: 'Apify LinkedIn actor ID', description: 'Optional. Apify actor for LinkedIn. Leave blank for default.' },
    { key: 'hubspot_api_key', label: 'HubSpot API key', description: 'Private app token for pushing leads to HubSpot.' },
    { key: 'pipedrive_api_token', label: 'Pipedrive API token', description: 'Used to push leads to Pipedrive.' },
    { key: 'pipedrive_domain', label: 'Pipedrive domain', description: 'Your Pipedrive subdomain (e.g. mycompany).' },
    { key: 'salesforce_access_token', label: 'Salesforce access token', description: 'OAuth or session token for pushing leads to Salesforce.' },
    { key: 'salesforce_instance_url', label: 'Salesforce instance URL', description: 'Your Salesforce instance (e.g. https://myorg.my.salesforce.com).' },
];

interface ApiKeysSectionProps {
    profile: ProfileData;
    onMessage: (msg: MessagePayload) => void;
}

export default function ApiKeysSection({ profile, onMessage }: ApiKeysSectionProps) {
    const [values, setValues] = useState<Record<string, string | undefined>>({});
    const [reveal, setReveal] = useState<Record<string, boolean>>({});
    const [saving, setSaving] = useState<string | null>(null);

    const saveProfile = useSaveProfile();
    const deleteKey = useDeleteProfileKey();

    const handleSave = useCallback(async (key: string) => {
        const value = values[key];
        if (value === undefined) return;
        setSaving(key);
        try {
            await saveProfile.mutateAsync({ [key]: value });
            setValues((v) => ({ ...v, [key]: undefined }));
            onMessage({ text: 'Saved. Keys in the database override .env.', type: 'success' });
        } catch (e: unknown) {
            onMessage({ text: `Save failed: ${e instanceof Error ? e.message : 'Unknown error'}`, type: 'error' });
        } finally {
            setSaving(null);
        }
    }, [values, saveProfile, onMessage]);

    const handleClear = useCallback(async (key: string) => {
        setSaving(key);
        try {
            await deleteKey.mutateAsync(key);
            setValues((v) => ({ ...v, [key]: undefined }));
            onMessage({ text: 'Key cleared; app will use .env if set.', type: 'success' });
        } catch (e: unknown) {
            onMessage({ text: `Clear failed: ${e instanceof Error ? e.message : 'Unknown error'}`, type: 'error' });
        } finally {
            setSaving(null);
        }
    }, [deleteKey, onMessage]);

    return (
        <GlassCard className="p-6">
            <h2 className="text-lg font-semibold text-white mb-2">API keys</h2>
            <p className="text-xs text-white/60 mb-4">Each key is used as described below. Save to store in the database; Clear to fall back to .env.</p>
            <div className="space-y-4">
                {API_KEYS.map(({ key, label, description }) => {
                    const sourceKey = `${key}_source` as keyof ProfileData;
                    const source = profile[sourceKey] as string | undefined;
                    const maskedValue = profile[key as keyof ProfileData] as string | undefined;
                    return (
                        <div key={key} className="p-4 rounded-xl bg-white/5 border border-white/10">
                            <div className="flex justify-between items-center mb-1">
                                <label className="text-sm font-medium text-white">{label}</label>
                                <span className="text-xs text-white/50">
                                    {source === 'db' ? 'DB' : source === 'env' ? 'Env' : 'Not set'}
                                </span>
                            </div>
                            <p className="text-xs text-white/50 mb-3">{description}</p>
                            <div className="flex flex-wrap items-center gap-2">
                                <Input
                                    type={reveal[key] ? 'text' : 'password'}
                                    placeholder={maskedValue ? '••••••••' : 'Enter key'}
                                    value={values[key] ?? ''}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                                    className="flex-1 min-w-[200px]"
                                    aria-label={label}
                                />
                                <button
                                    type="button"
                                    className="flex items-center justify-center w-9 h-9 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)]"
                                    onClick={() => setReveal((r) => ({ ...r, [key]: !r[key] }))}
                                    title={reveal[key] ? 'Hide' : 'Show'}
                                    aria-label={reveal[key] ? 'Hide key value' : 'Show key value'}
                                >
                                    {reveal[key] ? <EyeOff size={15} /> : <Eye size={15} />}
                                </button>
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={() => handleSave(key)}
                                    disabled={saving === key || values[key] === undefined || !String(values[key] ?? '').trim()}
                                >
                                    <Save size={14} className="mr-1" aria-hidden="true" />
                                    {saving === key ? '…' : 'Save'}
                                </Button>
                                {source === 'db' && (
                                    <Button variant="secondary" size="sm" onClick={() => handleClear(key)} disabled={saving === key}>
                                        <Trash2 size={14} className="mr-1" aria-hidden="true" />Clear
                                    </Button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </GlassCard>
    );
}
