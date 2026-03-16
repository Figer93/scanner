/**
 * React Query hooks for leads data.
 * Replaces manual useEffect + useState fetch patterns in consuming components.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';

// ── Types ────────────────────────────────────────────────────

export interface Lead {
    id: number;
    company_name: string;
    company_number: string;
    address: string | null;
    postcode: string | null;
    website: string | null;
    emails: string[];
    phones: string[];
    contact_form: boolean;
    status: string;
    score: number | null;
    score_reasoning: string | null;
    score_breakdown?: ScoreBreakdown | null;
    ice_breaker: string | null;
    outreach_draft: string | null;
    source: string;
    website_services: string | null;
    website_size: string | null;
    website_tech: string | null;
    assigned_to: string | null;
    linkedin_url: string | null;
    predicted_email: string | null;
    enrichment_status: string | null;
    date_of_creation: string | null;
    created_at: string;
    updated_at: string;
    date_added?: string | null;
}

export interface ScoreBreakdown {
    totalPoints: number;
    scoreOutOf10: number;
    factors: Array<{ key: string; label: string; points: number; maxPoints: number; earned: boolean }>;
    reason: string | null;
}

export interface Activity {
    id: number;
    lead_id: number;
    type: string;
    content: string;
    created_at: string;
}

export interface LeadUpdatePayload {
    status?: string;
    score?: number;
    outreach_draft?: string;
    assigned_to?: string | null;
    emails?: string[];
    phones?: string[];
}

// ── Query key factory ────────────────────────────────────────

export const leadsKeys = {
    all: ['leads'] as const,
    list: (listId?: number | null) => [...leadsKeys.all, 'list', listId ?? 'all'] as const,
    detail: (id: number) => [...leadsKeys.all, 'detail', id] as const,
    activities: (id: number) => [...leadsKeys.all, 'activities', id] as const,
    byCompany: (companyNumber: string) => [...leadsKeys.all, 'byCompany', companyNumber] as const,
};

// ── Hooks ────────────────────────────────────────────────────

/** Fetch all leads, optionally filtered by list. */
export function useLeads(listId?: number | null) {
    const query = listId != null ? `?listId=${listId}` : '';
    return useQuery<Lead[]>({
        queryKey: leadsKeys.list(listId),
        queryFn: () => api.get(`/api/leads${query}`),
        staleTime: 30_000,
    });
}

/** Fetch a single lead by id. */
export function useLeadById(id: number | null) {
    return useQuery<Lead>({
        queryKey: leadsKeys.detail(id ?? 0),
        queryFn: () => api.get(`/api/leads/${id}`),
        enabled: id != null && id > 0,
        staleTime: 30_000,
    });
}

/** Fetch a lead by Companies House company number. */
export function useLeadByCompanyNumber(companyNumber: string | null) {
    return useQuery<Lead>({
        queryKey: leadsKeys.byCompany(companyNumber ?? ''),
        queryFn: () => api.get(`/api/leads/by-company/${companyNumber}`),
        enabled: !!companyNumber,
        staleTime: 30_000,
        retry: false,
    });
}

/** Fetch activities for a lead. */
export function useLeadActivities(leadId: number | null) {
    return useQuery<Activity[]>({
        queryKey: leadsKeys.activities(leadId ?? 0),
        queryFn: () => api.get(`/api/leads/${leadId}/activities`),
        enabled: leadId != null && leadId > 0,
        staleTime: 10_000,
    });
}

// ── Mutations ────────────────────────────────────────────────

/** Update a lead's status, score, outreach draft, or assignment. */
export function useUpdateLead() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, payload }: { id: number; payload: LeadUpdatePayload }) =>
            api.patch(`/api/leads/${id}`, payload),
        onSuccess: (_data, { id }) => {
            void queryClient.invalidateQueries({ queryKey: leadsKeys.detail(id) });
            void queryClient.invalidateQueries({ queryKey: leadsKeys.all });
        },
    });
}

/** Add an activity note to a lead. */
export function useAddActivity() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ leadId, type, content }: { leadId: number; type: string; content: string }) =>
            api.post(`/api/leads/${leadId}/activities`, { type, content }),
        onSuccess: (_data, { leadId }) => {
            void queryClient.invalidateQueries({ queryKey: leadsKeys.activities(leadId) });
        },
    });
}

/** Score a lead via AI. */
export function useScoreLead() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (leadId: number) => api.post(`/api/leads/${leadId}/score`, {}),
        onSuccess: (_data, leadId) => {
            void queryClient.invalidateQueries({ queryKey: leadsKeys.detail(leadId) });
        },
    });
}

/** Generate an outreach draft via AI. */
export function useGenerateDraft() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (leadId: number) => api.post(`/api/leads/${leadId}/outreach-draft`, {}),
        onSuccess: (_data, leadId) => {
            void queryClient.invalidateQueries({ queryKey: leadsKeys.detail(leadId) });
        },
    });
}
