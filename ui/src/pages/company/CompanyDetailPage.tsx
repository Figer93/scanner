/**
 * CompanyDetailPage — orchestrator for a single company view.
 * Uses React Query for company detail + lead data.
 */

import { useCallback } from 'react';
import { Building2, AlertTriangle, RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { PageBack, Button } from '../../components/ui';
import { SkeletonGrid } from '../../components/ui/SkeletonCard';
import { useCompanyDetail, companyDetailKeys } from '../../hooks/useCompanyDetail';
import { useLeadByCompanyNumber, leadsKeys } from '../../hooks/useLeads';
import { formatAddress } from '../../lib/utils';
import CompanyOverview from './CompanyOverview';
import CompanyOfficers from './CompanyOfficers';
import CompanyActions from './CompanyActions';

interface CompanyDetailPageProps {
    companyNumber: string;
    onBack?: () => void;
}

export default function CompanyDetailPage({ companyNumber }: CompanyDetailPageProps) {
    const queryClient = useQueryClient();
    const { data: company, isLoading, error: loadError, refetch: refetchCompany } = useCompanyDetail(companyNumber);
    const { data: lead = null, refetch: refetchLead } = useLeadByCompanyNumber(companyNumber);

    const handleLeadRefresh = useCallback(() => {
        void refetchLead();
        void queryClient.invalidateQueries({ queryKey: leadsKeys.byCompany(companyNumber) });
    }, [refetchLead, queryClient, companyNumber]);

    const handleCompanyRefresh = useCallback(() => {
        void queryClient.invalidateQueries({ queryKey: companyDetailKeys.detail(companyNumber) });
    }, [queryClient, companyNumber]);

    if (!companyNumber) {
        return (
            <div className="space-y-4">
                <PageBack href="#/leads">← Back to companies</PageBack>
                <div className="p-6 rounded-card bg-red-500/10 border border-red-400/20">
                    <p className="text-red-200">No company specified.</p>
                </div>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="w-full">
                <PageBack href="#/leads">← Back to companies</PageBack>
                <div className="mt-4">
                    <SkeletonGrid count={6} cols={3} />
                </div>
            </div>
        );
    }

    if (loadError || !company) {
        return (
            <div className="w-full space-y-4">
                <PageBack href="#/leads">← Back to companies</PageBack>
                <div className="p-6 rounded-card bg-red-500/10 border border-red-400/20 text-center" role="alert">
                    <AlertTriangle size={32} className="mx-auto mb-3 text-red-400" aria-hidden="true" />
                    <p className="text-base font-semibold text-red-200 mb-1">Failed to load company</p>
                    <p className="text-sm text-red-300/70 mb-4">{loadError instanceof Error ? loadError.message : 'Unknown error'}</p>
                    <Button variant="secondary" size="sm" onClick={() => void refetchCompany()}>
                        <RefreshCw size={14} className="mr-1" aria-hidden="true" />Retry
                    </Button>
                </div>
            </div>
        );
    }

    const profile = company as Record<string, unknown>;
    const meta = (profile.source_metadata as Record<string, unknown>) || {};
    const status = String(meta.company_status || profile.company_status || meta.status || '');
    const type = String(meta.type || meta.company_type || profile.type || profile.company_type || '');
    const incorpDate = String(profile.date_of_creation || meta.date_of_creation || meta.dateOfCreation || '');
    const name = String(profile.name || profile.company_name || meta.company_name || '—');
    const numDisplay = String(profile.number || profile.company_number || meta.company_number || companyNumber);
    const registeredOffice = meta.registered_office_address as Record<string, string> | undefined;
    const address = String(profile.address || '') || formatAddress(registeredOffice) || '—';
    const jurisdiction = String(meta.jurisdiction || '');
    const domainUrl = String(meta.domain_url || profile.website || profile.domain_url || '') || undefined;
    const linkedinLink = String(meta.linkedin_link || profile.linkedin_link || '') || undefined;

    const variant = (() => {
        const s = status.toLowerCase();
        if (s === 'active') return 'active';
        if (s === 'dissolved') return 'dissolved';
        return 'other';
    })();
    const statusBadgeCls = variant === 'active'
        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'
        : variant === 'dissolved'
            ? 'bg-red-500/20 text-red-300 border-red-400/30'
            : 'bg-white/10 text-white/70 border-white/10';

    return (
        <div className="w-full">
            <PageBack href="#/leads">← Back to companies</PageBack>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6 mt-4">
                <div className="col-span-full">
                    <CompanyOverview
                        name={name}
                        status={status}
                        statusBadgeCls={statusBadgeCls}
                        type={type}
                        numDisplay={numDisplay}
                        jurisdiction={jurisdiction}
                        incorpDate={incorpDate}
                        address={address}
                        domainUrl={domainUrl}
                        linkedinLink={linkedinLink}
                    />
                </div>

                <CompanyActions
                    lead={lead}
                    companyNumber={companyNumber}
                    company={profile}
                    statusBadgeCls={statusBadgeCls}
                    status={status}
                    type={type}
                    jurisdiction={jurisdiction}
                    incorpDate={incorpDate}
                    address={address}
                    domainUrl={domainUrl}
                    numDisplay={numDisplay}
                    onLeadRefresh={handleLeadRefresh}
                    onCompanyRefresh={handleCompanyRefresh}
                />

                <CompanyOfficers
                    sicCodes={(meta.sic_codes as Array<string>) || []}
                    officers={(meta.officers as Array<{ name?: string }>) || []}
                    pscs={(meta.pscs as Array<{ name?: string; nature_of_control?: string }>) || []}
                    chargesOutstandingCount={meta.charges_outstanding_count as number | string | undefined}
                    accounts={(meta.accounts as Record<string, unknown>) || {}}
                    confirmationStatement={(meta.confirmation_statement as Record<string, unknown>) || {}}
                    totalActiveDirectorships={meta.total_active_directorships as number | string | undefined}
                    domainUrl={domainUrl}
                    linkedinLink={linkedinLink}
                    sharePercentage={meta.share_percentage as number | string | undefined}
                    hasCharges={meta.has_charges as boolean | undefined}
                    hasInsolvency={meta.has_insolvency_history as boolean | undefined}
                    hasBeenLiquidated={meta.has_been_liquidated as boolean | undefined}
                    undeliverableAddress={meta.undeliverable_registered_office_address as boolean | undefined}
                    officeInDispute={meta.registered_office_is_in_dispute as boolean | undefined}
                    canFile={meta.can_file as boolean | undefined}
                />
            </div>
        </div>
    );
}
