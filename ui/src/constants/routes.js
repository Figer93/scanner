/**
 * Hash routes and page parsing for the app.
 */

export const ROUTES = {
    HOME: '#/',
    LEADS: '#/leads',
    KANBAN: '#/kanban',
    ANALYTICS: '#/analytics',
    EARNINGS: '#/earnings',
    OUTREACH: '#/outreach',
    DB: '#/db',
    LOGS: '#/logs',
    PROFILE: '#/profile',
};

function parseQueryParams(hash) {
    const q = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
    const params = {};
    q.split('&').forEach((pair) => {
        const [k, v] = pair.split('=').map((s) => decodeURIComponent((s || '').replace(/\+/g, ' ')));
        if (k) params[k] = v;
    });
    return params;
}

export function getPageFromHash(hash) {
    if (typeof window === 'undefined') return { page: 'home', leadId: null, companyNumber: null, conversationLeadId: null };
    const h = hash || '#/';
    const leadMatch = h.match(/#\/leads\/(\d+)/);
    if (leadMatch) return { page: 'leads', leadId: parseInt(leadMatch[1], 10), companyNumber: null, conversationLeadId: null };
    const companyMatch = h.match(/#\/company\/([^/#?]+)/);
    if (companyMatch) return { page: 'company', leadId: null, companyNumber: decodeURIComponent(companyMatch[1]), conversationLeadId: null };
    if (h === '#/leads') return { page: 'leads', leadId: null, companyNumber: null, conversationLeadId: null };
    if (h === '#/' || h === '#') return { page: 'home', leadId: null, companyNumber: null, conversationLeadId: null };
    if (h.includes('profile')) return { page: 'profile', leadId: null, companyNumber: null, conversationLeadId: null };
    if (h.includes('kanban')) return { page: 'kanban', leadId: null, companyNumber: null, conversationLeadId: null };
    if (h.includes('analytics')) return { page: 'analytics', leadId: null, companyNumber: null, conversationLeadId: null };
    if (h.includes('earnings')) return { page: 'earnings', leadId: null, companyNumber: null, conversationLeadId: null };
    if (h.includes('outreach')) {
        const params = parseQueryParams(h);
        const conversationLeadId = params.conversation ? String(params.conversation).trim() : null;
        return { page: 'outreach', leadId: null, companyNumber: null, conversationLeadId };
    }
    if (h.includes('db')) return { page: 'db', leadId: null, companyNumber: null, conversationLeadId: null };
    if (h.includes('logs')) return { page: 'logs', leadId: null, companyNumber: null, conversationLeadId: null };
    return { page: 'home', leadId: null, companyNumber: null, conversationLeadId: null };
}

export function leadUrl(leadId) {
    return `#/leads/${leadId}`;
}

export function companyUrl(companyNumber) {
    return `#/company/${encodeURIComponent(companyNumber)}`;
}

/** Outreach URL with optional conversation lead pre-selected. */
export function outreachConversationUrl(leadId) {
    return leadId != null ? `#/outreach?conversation=${encodeURIComponent(String(leadId))}` : '#/outreach';
}
