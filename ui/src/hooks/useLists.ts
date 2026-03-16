/**
 * React Query hooks for list data (lead lists / campaigns).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import type { Lead } from './useLeads';

// ── Types ────────────────────────────────────────────────────

export interface List {
    id: number;
    name: string;
    description: string | null;
    created_at: string;
    updated_at: string;
    lead_count: number;
}

export interface CreateListPayload {
    name: string;
    description?: string;
}

export interface UpdateListPayload {
    name?: string;
    description?: string;
}

// ── Query key factory ────────────────────────────────────────

export const listsKeys = {
    all: ['lists'] as const,
    list: () => [...listsKeys.all, 'list'] as const,
    detail: (id: number) => [...listsKeys.all, 'detail', id] as const,
    leads: (id: number) => [...listsKeys.all, 'leads', id] as const,
};

// ── Hooks ────────────────────────────────────────────────────

/** Fetch all lists with lead counts. */
export function useLists() {
    return useQuery<List[]>({
        queryKey: listsKeys.list(),
        queryFn: () => api.get('/api/lists'),
        staleTime: 30_000,
    });
}

/** Fetch a single list by id. */
export function useListById(id: number | null) {
    return useQuery<List>({
        queryKey: listsKeys.detail(id ?? 0),
        queryFn: () => api.get(`/api/lists/${id}`),
        enabled: id != null && id > 0,
        staleTime: 30_000,
    });
}

/** Fetch all leads belonging to a list. */
export function useListLeads(listId: number | null) {
    return useQuery<Lead[]>({
        queryKey: listsKeys.leads(listId ?? 0),
        queryFn: () => api.get(`/api/lists/${listId}/leads`),
        enabled: listId != null && listId > 0,
        staleTime: 30_000,
    });
}

// ── Mutations ────────────────────────────────────────────────

/** Create a new list. */
export function useCreateList() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: CreateListPayload) => api.post('/api/lists', payload),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: listsKeys.list() });
        },
    });
}

/** Update a list's name or description. */
export function useUpdateList() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, payload }: { id: number; payload: UpdateListPayload }) =>
            api.patch(`/api/lists/${id}`, payload),
        onSuccess: (_data, { id }) => {
            void queryClient.invalidateQueries({ queryKey: listsKeys.detail(id) });
            void queryClient.invalidateQueries({ queryKey: listsKeys.list() });
        },
    });
}

/** Delete a list. */
export function useDeleteList() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => api.delete(`/api/lists/${id}`),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: listsKeys.all });
        },
    });
}

/** Save companies (by company number) to a list. */
export function useSaveToList() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ listId, companyNumbers }: { listId: number; companyNumbers: string[] }) =>
            api.post('/api/leads/save-to-list', { listId, companyNumbers }),
        onSuccess: (_data, { listId }) => {
            void queryClient.invalidateQueries({ queryKey: listsKeys.leads(listId) });
            void queryClient.invalidateQueries({ queryKey: listsKeys.detail(listId) });
        },
    });
}
