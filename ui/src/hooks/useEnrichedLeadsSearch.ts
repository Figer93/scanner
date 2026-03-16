/**
 * React Query hook for enriched leads search (leads with at least one contact point).
 * Used by Find Leads page when view mode is "Enriched".
 */

import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import type { CHCompany } from '../lib/leadFilters';

const DEFAULT_LIMIT = 500;

export interface EnrichedSearchParams {
    limit?: number;
    q?: string;
    daysBack?: number;
    location?: string;
    postcode?: string;
    listId?: number;
}

interface EnrichedSearchResponse {
    items: CHCompany[];
}

export const enrichedLeadsKeys = {
    all: ['leads', 'enriched'] as const,
    search: (params: EnrichedSearchParams) => [...enrichedLeadsKeys.all, 'search', params] as const,
};

export function useEnrichedLeadsSearch(params: EnrichedSearchParams = {}) {
    const limit = Math.min(500, Math.max(1, params.limit ?? DEFAULT_LIMIT));
    const queryKey = enrichedLeadsKeys.search({ ...params, limit });

    return useQuery<CHCompany[]>({
        queryKey,
        queryFn: async () => {
            const searchParams = new URLSearchParams();
            searchParams.set('limit', String(limit));
            if (params.q?.trim()) searchParams.set('q', params.q.trim());
            if (params.daysBack != null) searchParams.set('daysBack', String(params.daysBack));
            if (params.location?.trim()) searchParams.set('location', params.location.trim());
            if (params.postcode?.trim()) searchParams.set('postcode', params.postcode.trim());
            if (params.listId != null && params.listId >= 1) searchParams.set('listId', String(params.listId));
            const data: EnrichedSearchResponse = await api.get(`/api/leads/enriched?${searchParams}`);
            const items = data?.items ?? [];
            return Array.isArray(items) ? items : [];
        },
        staleTime: 60_000,
    });
}
