/**
 * React Query hook for fetching full company details from Companies House API.
 */

import { useQuery } from '@tanstack/react-query';
import api from '../api/client';

export interface CompanyDetail {
    name?: string;
    company_name?: string;
    number?: string;
    company_number?: string;
    address?: string;
    company_status?: string;
    type?: string;
    company_type?: string;
    date_of_creation?: string;
    website?: string;
    domain_url?: string;
    linkedin_link?: string;
    source_metadata?: Record<string, unknown> | null;
}

export const companyDetailKeys = {
    all: ['company-detail'] as const,
    detail: (number: string) => [...companyDetailKeys.all, number] as const,
};

export function useCompanyDetail(companyNumber: string | null | undefined) {
    return useQuery<CompanyDetail>({
        queryKey: companyDetailKeys.detail(companyNumber ?? ''),
        queryFn: () => api.get(`/api/companies-house/company/${encodeURIComponent(companyNumber!)}`),
        enabled: !!companyNumber,
        staleTime: 60_000,
        retry: 1,
    });
}
