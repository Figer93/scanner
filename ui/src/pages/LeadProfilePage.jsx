import { useEffect, useState } from 'react';
import axios from 'axios';
import { GlassCard, Button } from '../components/ui';

const API_BASE = import.meta.env.DEV ? '' : '';

/**
 * Lead profile route (#/leads/:id) redirects to company details (#/company/:companyNumber)
 * so all lead actions (Enrich, Sync, Push to CRM) live in Find leads → Company details.
 */
export default function LeadProfilePage({ leadId, onBack }) {
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!leadId) return;
        let cancelled = false;
        axios.get(`${API_BASE}/api/leads/${leadId}`)
            .then(({ data }) => {
                if (cancelled || !data?.company_number) return;
                window.location.hash = `#/company/${encodeURIComponent(data.company_number)}`;
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(err?.response?.data?.error || err?.message || 'Failed to load lead');
                }
            });
        return () => { cancelled = true; };
    }, [leadId]);

    if (!leadId) return null;

    if (error) {
        return (
            <GlassCard className="p-6 max-w-md">
                <p className="text-red-200 mb-4">{error}</p>
                <Button variant="secondary" onClick={onBack}>← Back to leads</Button>
            </GlassCard>
        );
    }

    return (
        <div className="p-6 text-white/70">Redirecting to company details…</div>
    );
}
