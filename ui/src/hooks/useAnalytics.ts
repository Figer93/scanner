/**
 * React Query hooks for analytics endpoints used by the Profile Overview section.
 */

import { useQuery } from '@tanstack/react-query';
import api from '../api/client';

export interface FunnelStats {
    byStatus: Record<string, number>;
    bySource: Record<string, number>;
    total: number;
}

export interface CostPerLeadStats {
    totalCostGbp: number;
    totalLeads: number;
    qualifiedLeads: number;
    costPerLead: number | null;
    costPerQualifiedLead: number | null;
}

export interface ScoreDistribution {
    low: number;
    mid: number;
    high: number;
}

export interface LastPipelineRun {
    at: string;
    source: string;
    limit: number;
    inserted: number;
    updated: number;
    enriched: number;
}

export interface RecentActivityItem {
    id: string;
    type: string;
    company_name: string;
    lead_id: number;
    content: string | null;
    timestamp: string;
}

export interface EmailPerformance {
    days: number;
    sent: number;
    opened: number;
    replied: number;
    openRate: number;
    replyRate: number;
}

export const analyticsKeys = {
    all: ['analytics'] as const,
    funnel: () => [...analyticsKeys.all, 'funnel'] as const,
    costPerLead: () => [...analyticsKeys.all, 'cost-per-lead'] as const,
    scoreDistribution: () => [...analyticsKeys.all, 'score-distribution'] as const,
    lastPipelineRun: () => [...analyticsKeys.all, 'last-pipeline-run'] as const,
    recentActivity: (limit: number) => [...analyticsKeys.all, 'recent-activity', limit] as const,
    emailPerformance: (days: number) => [...analyticsKeys.all, 'email-performance', days] as const,
};

export function useFunnelStats() {
    return useQuery<FunnelStats>({
        queryKey: analyticsKeys.funnel(),
        queryFn: () => api.get('/api/analytics/funnel'),
        staleTime: 30_000,
    });
}

export function useCostPerLead() {
    return useQuery<CostPerLeadStats>({
        queryKey: analyticsKeys.costPerLead(),
        queryFn: () => api.get('/api/analytics/cost-per-lead'),
        staleTime: 30_000,
    });
}

export function useScoreDistribution() {
    return useQuery<ScoreDistribution>({
        queryKey: analyticsKeys.scoreDistribution(),
        queryFn: async () => {
            const data = await api.get('/api/analytics/score-distribution');
            return data && typeof data === 'object' ? data : { low: 0, mid: 0, high: 0 };
        },
        staleTime: 30_000,
    });
}

export function useLastPipelineRun() {
    return useQuery<LastPipelineRun | null>({
        queryKey: analyticsKeys.lastPipelineRun(),
        queryFn: async () => {
            try {
                const data = await api.get('/api/analytics/last-pipeline-run');
                return data && typeof data === 'object' ? data : null;
            } catch {
                return null;
            }
        },
        staleTime: 30_000,
    });
}

export function useRecentActivity(limit = 5) {
    return useQuery<RecentActivityItem[]>({
        queryKey: analyticsKeys.recentActivity(limit),
        queryFn: () => api.get(`/api/analytics/recent-activity?limit=${limit}`),
        staleTime: 15_000,
    });
}

export function useEmailPerformance(days = 30) {
    return useQuery<EmailPerformance>({
        queryKey: analyticsKeys.emailPerformance(days),
        queryFn: () => api.get(`/api/analytics/email-performance?days=${days}`),
        staleTime: 60_000,
    });
}
