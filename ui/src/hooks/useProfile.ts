/**
 * React Query hooks for profile data (API keys, settings, usage).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';

// ── Types ────────────────────────────────────────────────────

export interface ProfileData {
    serper_api_key: string;
    serper_api_key_source: string;
    companies_house_api_key: string;
    companies_house_api_key_source: string;
    google_ai_api_key: string;
    google_ai_api_key_source: string;
    webhook_url: string;
    webhook_score_threshold: string;
    team_members: string;
    team_members_source: string;
    lead_scoring_criteria: string;
    last_pipeline_run?: string;
    /** Estimated earnings on dashboard; edited in Profile → Estimated earnings. */
    earnings_referral_pounds?: number | null;
    earnings_conversion_rate_pct?: number;
}

export interface UsageStat {
    service: string;
    total_requests: number;
    total_input_tokens: number;
    total_output_tokens: number;
    total_cost_gbp: number;
    last_called_at: string | null;
}

export type ProfileUpdatePayload = Partial<Omit<ProfileData,
    | `${string}_source`
    | 'last_pipeline_run'
>>;

// ── Query key factory ────────────────────────────────────────

export const profileKeys = {
    all: ['profile'] as const,
    data: () => [...profileKeys.all, 'data'] as const,
    usage: () => [...profileKeys.all, 'usage'] as const,
    schedule: () => [...profileKeys.all, 'schedule'] as const,
};

// ── Hooks ────────────────────────────────────────────────────

/** Fetch masked profile settings (API keys shown as ***xxxx). */
export function useProfile() {
    return useQuery<ProfileData>({
        queryKey: profileKeys.data(),
        queryFn: () => api.get('/api/profile'),
        staleTime: 60_000,
    });
}

/** Fetch API usage stats per service. */
export function useUsageStats() {
    return useQuery<UsageStat[]>({
        queryKey: profileKeys.usage(),
        queryFn: () => api.get('/api/usage'),
        staleTime: 30_000,
    });
}

/** Fetch schedule config (cron expression, source, limit). */
export function useSchedule() {
    return useQuery<{ cron: string; source: string; limit: number }>({
        queryKey: profileKeys.schedule(),
        queryFn: () => api.get('/api/schedule'),
        staleTime: 60_000,
    });
}

// ── Mutations ────────────────────────────────────────────────

/** Save profile settings (API keys, criteria, webhook config, etc.). */
export function useSaveProfile() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: ProfileUpdatePayload) => api.post('/api/profile', payload),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: profileKeys.data() });
        },
    });
}

/** Delete a single profile key (revert to .env fallback). */
export function useDeleteProfileKey() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (key: string) => api.delete(`/api/profile/${key}`),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: profileKeys.data() });
        },
    });
}

/** Save schedule config. */
export function useSaveSchedule() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: { cron: string; source: string; limit: number }) =>
            api.post('/api/schedule', payload),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: profileKeys.schedule() });
        },
    });
}
