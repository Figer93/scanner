/**
 * API path helpers to avoid string typos and centralise paths.
 */

export const endpoints = {
    logs: (limit) => `/api/logs${limit != null ? `?limit=${limit}` : ''}`,
    profile: () => '/api/profile',
    usage: () => '/api/usage',
    usageLog: (page, limit) => `/api/usage/log?page=${page ?? 1}&limit=${limit ?? 50}`,
    leads: (query) => `/api/leads${query ? '?' + new URLSearchParams(query).toString() : ''}`,
    leadById: (id) => `/api/leads/${id}`,
    leadActivities: (id) => `/api/leads/${id}/activities`,
    leadExport: (format, listId) => `/api/leads/export?format=${format}${listId != null ? '&listId=' + listId : ''}`,
    chCacheSearch: (params) => '/api/ch-cache/search?' + new URLSearchParams(params).toString(),
    chCacheCount: () => '/api/ch-cache/count',
    chCacheSync: () => '/api/ch-cache/sync',
    lists: () => '/api/lists',
    listById: (id) => `/api/lists/${id}`,
    listLeads: (id) => `/api/lists/${id}/leads`,
    run: () => '/api/run',
    schedule: () => '/api/schedule',
    enrichmentStats: () => '/api/enrichment/stats',
    enrichmentJobs: () => '/api/enrichment/jobs',
    enrichmentJob: (id) => `/api/enrichment/jobs/${id}`,
    enrichmentJobLeads: (id) => `/api/enrichment/jobs/${id}/leads`,
    enrichmentLeadLog: (leadId) => `/api/enrichment/leads/${leadId}/log`,
    enrichmentRetry: () => '/api/enrichment/retry',
};

export default endpoints;
