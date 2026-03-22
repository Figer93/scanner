/**
 * Explains that integration secrets are configured in Railway / environment, not in Profile.
 */

import { GlassCard } from '../../components/ui';

export default function ApiKeysSection() {
    return (
        <GlassCard className="p-6">
            <h2 className="text-lg font-semibold text-white mb-2">API keys &amp; provider secrets</h2>
            <p className="text-sm text-white/70 mb-3">
                Secrets are not stored in Profile. Set them as environment variables on your host (e.g. Railway Variables),
                then redeploy if needed.
            </p>
            <ul className="text-xs text-white/55 space-y-1.5 list-disc list-inside">
                <li>
                    <code className="text-white/80 bg-white/10 px-1 rounded">COMPANIES_HOUSE_API_KEY</code> — Companies House
                </li>
                <li>
                    <code className="text-white/80 bg-white/10 px-1 rounded">SERPER_API_KEY</code>,{' '}
                    <code className="text-white/80 bg-white/10 px-1 rounded">GOOGLE_AI_API_KEY</code> /{' '}
                    <code className="text-white/80 bg-white/10 px-1 rounded">GEMINI_API_KEY</code> — search &amp; AI
                </li>
                <li>
                    <code className="text-white/80 bg-white/10 px-1 rounded">GOOGLE_PLACES_API_KEY</code> — maps/places
                </li>
                <li>
                    <code className="text-white/80 bg-white/10 px-1 rounded">APIFY_API_TOKEN</code>,{' '}
                    <code className="text-white/80 bg-white/10 px-1 rounded">APIFY_LINKEDIN_ACTOR_ID</code> — optional LinkedIn
                </li>
                <li>
                    <code className="text-white/80 bg-white/10 px-1 rounded">MAILGUN_*</code>,{' '}
                    <code className="text-white/80 bg-white/10 px-1 rounded">BREVO_*</code> — email
                </li>
                <li>
                    <code className="text-white/80 bg-white/10 px-1 rounded">HUBSPOT_API_KEY</code>, Pipedrive, Salesforce — CRM
                </li>
            </ul>
            <p className="text-xs text-white/45 mt-4">See <code className="text-white/50">.env.example</code> in the repo for the full list.</p>
        </GlassCard>
    );
}
