/**
 * React Query hook for earnings data (Phase 3A).
 */

import { useQuery } from '@tanstack/react-query';
import api from '../api/client';

export interface EarningsOverview {
    sent: number;
    opened: number;
    replied: number;
    clicks: number;
    openRatePct: number;
    replyRatePct: number;
    conversionRatePct: number;
    referralPounds: number | null;
    estimatedConversions: number;
    estimatedEarnings: number | null;
}

export interface EarningsWeeklyPoint {
    week: string;
    sent: number;
    opened: number;
    replied: number;
}

export interface EarningsTemplateRow {
    templateId: number;
    templateName: string;
    sent: number;
    opened: number;
    replied: number;
    openRatePct: number;
    replyRatePct: number;
    estimatedConversions: number;
}

export interface EarningsData {
    overview: EarningsOverview;
    weekly: EarningsWeeklyPoint[];
    topTemplates: EarningsTemplateRow[];
}

export const earningsKeys = {
    all: ['earnings'] as const,
    data: () => [...earningsKeys.all, 'data'] as const,
};

export function useEarnings() {
    return useQuery<EarningsData>({
        queryKey: earningsKeys.data(),
        queryFn: () => api.get('/api/earnings'),
        staleTime: 60_000,
    });
}
