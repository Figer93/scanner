/**
 * React Query hooks for profile data (settings stored in DB; secrets use env only).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';

// ── Types ────────────────────────────────────────────────────

/** GET /api/profile — non-secret keys plus optional *_source fields. */
export interface ProfileData {
    webhook_url?: string;
    webhook_score_threshold?: string;
    team_members?: string;
    lead_scoring_criteria?: string;
    last_pipeline_run?: string;
    referral_link?: string;
    sender_name?: string;
    sender_email?: string;
    daily_send_limit?: number;
    send_delay_minutes?: number;
    queue_paused?: boolean;
    delay_between_companies_ms?: number;
    enrichment_concurrency?: number;
    enrichment_stage_website_find?: boolean;
    enrichment_stage_scrape?: boolean;
    enrichment_stage_linkedin?: boolean;
    enrichment_stage_validate?: boolean;
    apify_linkedin_enabled?: boolean;
    /** Estimated earnings on dashboard; edited in Profile → Estimated earnings. */
    earnings_referral_pounds?: number | null;
    earnings_conversion_rate_pct?: number;
    [key: string]: string | number | boolean | undefined | null;
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

/** Fetch profile settings (non-secret fields from DB + env fallbacks where applicable). */
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

/** Save profile settings (criteria, webhook, pipeline toggles, outreach, etc.). */
export function useSaveProfile() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: ProfileUpdatePayload) => api.post('/api/profile', payload),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: profileKeys.data() });
        },
    });
}

/** Delete a single profile key (clears DB value for that setting). */
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
