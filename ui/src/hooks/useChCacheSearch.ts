/**
 * React Query hook for Companies House cache search.
 * Used by the Leads (Find) page to load companies from the local CH cache.
 */

import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import type { CHCompany } from '../lib/leadFilters';

const DEFAULT_LIMIT = 500;

interface ChCacheSearchResponse {
    items: CHCompany[];
    total?: number;
}

export const chCacheKeys = {
    all: ['ch-cache'] as const,
    search: (limit: number) => [...chCacheKeys.all, 'search', limit] as const,
    count: () => [...chCacheKeys.all, 'count'] as const,
};

export function useChCacheSearch(limit: number = DEFAULT_LIMIT, enabled: boolean = true) {
    return useQuery<CHCompany[]>({
        queryKey: chCacheKeys.search(limit),
        queryFn: async () => {
            const data: ChCacheSearchResponse = await api.get(`/api/ch-cache/search?limit=${limit}`);
            const items = data?.items ?? [];
            return Array.isArray(items) ? items : [];
        },
        enabled,
        staleTime: 60_000,
    });
}

export function useChCacheCount() {
    return useQuery<number>({
        queryKey: chCacheKeys.count(),
        queryFn: async () => {
            const data: { count: number } = await api.get('/api/ch-cache/count');
            return data?.count ?? 0;
        },
        staleTime: 60_000,
    });
}
