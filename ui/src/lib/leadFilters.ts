/**
 * Pure filter and export logic for Companies House cache results.
 * Extracted verbatim from Leads.jsx — only typed, not rewritten.
 */

import type { FilterState } from '../stores/filterStore';

// ── Types ────────────────────────────────────────────────────

export interface CHCompanySourceMetadata {
    company_status?: string;
    type?: string;
    company_type?: string;
    date_of_creation?: string;
    dateOfCreation?: string;
    sic_codes?: Array<string | { sic_code?: string; description?: string }>;
    officers?: Array<{ name?: string }>;
    pscs?: Array<{ name?: string; nature_of_control?: string }>;
    charges_outstanding_count?: number | string;
    total_active_directorships?: number | string;
    share_percentage?: number | string;
    domain_url?: string;
    linkedin_link?: string;
}

export interface CHCompany {
    name?: string;
    company_name?: string;
    number?: string;
    company_number?: string;
    address?: string;
    postcode?: string;
    date_of_creation?: string;
    source_metadata?: CHCompanySourceMetadata | null;
    company_status?: string;
    type?: string;
    company_type?: string;
    website?: string;
    domain_url?: string;
    linkedin_link?: string;
    /** Lead score (1–10) when company has an associated lead; from CH cache search join. */
    score?: number | null;
}

// ── SIC search helper ────────────────────────────────────────

function getSicSearchText(sourceMetadata: CHCompanySourceMetadata | null | undefined): string {
    const raw = sourceMetadata?.sic_codes;
    if (!Array.isArray(raw)) return '';
    return raw
        .map((el) => (typeof el === 'string' ? el : (el?.description || el?.sic_code || '')))
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
}

// ── Main filter function ─────────────────────────────────────

export function applyFilters(companies: CHCompany[], filters: FilterState): CHCompany[] {
    if (!companies?.length) return [];
    let out = companies;

    const q = (filters.searchQuery || '').trim().toLowerCase();
    if (q) {
        out = out.filter((c) => {
            const name = (c.name || c.company_name || '').toLowerCase();
            const number = (c.number || c.company_number || '').toLowerCase();
            const address = (c.address || '').toLowerCase();
            const postcode = (c.postcode || '').toLowerCase();
            return name.includes(q) || number.includes(q) || address.includes(q) || postcode.includes(q);
        });
    }

    const status = (filters.statusFilter || '').trim().toLowerCase();
    if (status) {
        out = out.filter((c) => {
            const s = (c.source_metadata?.company_status || c.company_status || '').toLowerCase().replace(/\s+/g, ' ');
            const normStatus = status.replace(/\s+/g, ' ');
            return s === normStatus || s.replace(/-/g, ' ') === normStatus.replace(/-/g, ' ');
        });
    }

    const type = (filters.typeFilter || '').trim().toLowerCase();
    if (type) {
        out = out.filter((c) => {
            const t = (c.source_metadata?.type || c.source_metadata?.company_type || c.type || c.company_type || '').toLowerCase();
            if (t === type) return true;
            return t.includes(type) || type.includes(t);
        });
    }

    const loc = (filters.locationQuery || '').trim().toLowerCase();
    if (loc) {
        out = out.filter((c) => {
            const postcode = (c.postcode || '').toLowerCase();
            const address = (c.address || '').toLowerCase();
            return postcode.includes(loc) || address.includes(loc);
        });
    }

    const incorpFrom = (filters.incorporatedFrom || '').trim();
    const incorpTo = (filters.incorporatedTo || '').trim();
    if (incorpFrom) {
        const fromStr = incorpFrom.length === 4 ? incorpFrom + '-01-01' : incorpFrom.length >= 7 ? incorpFrom.slice(0, 7) + '-01' : incorpFrom.slice(0, 10);
        out = out.filter((c) => {
            const d = (c.date_of_creation || c.source_metadata?.date_of_creation || c.source_metadata?.dateOfCreation || '').toString().slice(0, 10);
            return d && d >= fromStr;
        });
    }
    if (incorpTo) {
        let toStr = incorpTo.slice(0, 10);
        if (incorpTo.length === 4) toStr = incorpTo + '-12-31';
        else if (incorpTo.length >= 7) {
            const [y, m] = incorpTo.split('-').map(Number);
            if (y != null && m != null) {
                const lastDay = new Date(y, m, 0).getDate();
                toStr = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
            }
        }
        out = out.filter((c) => {
            const d = (c.date_of_creation || c.source_metadata?.date_of_creation || c.source_metadata?.dateOfCreation || '').toString().slice(0, 10);
            return d && d <= toStr;
        });
    }

    const indInclude = (filters.industriesInclude || '').trim().toLowerCase();
    if (indInclude) {
        const terms = indInclude.split(/[,;]/).map((t) => t.trim()).filter(Boolean);
        if (terms.length) {
            out = out.filter((c) => {
                const name = (c.name || c.company_name || '').toLowerCase();
                const sicText = getSicSearchText(c.source_metadata);
                const text = name + ' ' + sicText;
                return terms.every((t) => text.includes(t));
            });
        }
    }

    const indExclude = (filters.industriesExclude || '').trim().toLowerCase();
    if (indExclude) {
        const terms = indExclude.split(/[,;]/).map((t) => t.trim()).filter(Boolean);
        if (terms.length) {
            out = out.filter((c) => {
                const name = (c.name || c.company_name || '').toLowerCase();
                const sicText = getSicSearchText(c.source_metadata);
                const text = name + ' ' + sicText;
                return !terms.some((t) => text.includes(t));
            });
        }
    }

    const descInclude = (filters.descriptionKeywordsInclude || '').trim().toLowerCase();
    if (descInclude) {
        const terms = descInclude.split(/[,;]/).map((t) => t.trim()).filter(Boolean);
        if (terms.length) {
            out = out.filter((c) => {
                const name = (c.name || c.company_name || '').toLowerCase();
                const addr = (c.address || '').toLowerCase();
                return terms.every((t) => (name + ' ' + addr).includes(t));
            });
        }
    }

    const descExclude = (filters.descriptionKeywordsExclude || '').trim().toLowerCase();
    if (descExclude) {
        const terms = descExclude.split(/[,;]/).map((t) => t.trim()).filter(Boolean);
        if (terms.length) {
            out = out.filter((c) => {
                const name = (c.name || c.company_name || '').toLowerCase();
                const addr = (c.address || '').toLowerCase();
                return !terms.some((t) => (name + ' ' + addr).includes(t));
            });
        }
    }

    const ct = (filters.companyTypes || '').trim().toLowerCase();
    if (ct) {
        out = out.filter((c) => {
            const companyType = (c.source_metadata?.type || c.source_metadata?.company_type || c.type || c.company_type || '').toLowerCase();
            const name = (c.name || c.company_name || '').toLowerCase();
            return companyType.includes(ct) || name.includes(ct);
        });
    }

    const officerName = (filters.officerName || '').trim().toLowerCase();
    if (officerName) {
        out = out.filter((c) => {
            const officers = c.source_metadata?.officers || [];
            return officers.some((o) => (o.name || '').toLowerCase().includes(officerName));
        });
    }

    const pscText = (filters.pscText || '').trim().toLowerCase();
    if (pscText) {
        out = out.filter((c) => {
            const pscs = c.source_metadata?.pscs || [];
            return pscs.some(
                (p) => (p.name || '').toLowerCase().includes(pscText) || (p.nature_of_control || '').toLowerCase().includes(pscText)
            );
        });
    }

    const chargesMin = filters.chargesMin != null && String(filters.chargesMin).trim() !== '' ? Number(filters.chargesMin) : null;
    const chargesMax = filters.chargesMax != null && String(filters.chargesMax).trim() !== '' ? Number(filters.chargesMax) : null;
    if (chargesMin != null && !Number.isNaN(chargesMin)) {
        out = out.filter((c) => { const n = c.source_metadata?.charges_outstanding_count; return n != null && n !== '' && Number(n) >= chargesMin; });
    }
    if (chargesMax != null && !Number.isNaN(chargesMax)) {
        out = out.filter((c) => { const n = c.source_metadata?.charges_outstanding_count; return n != null && n !== '' && Number(n) <= chargesMax; });
    }

    const dirMin = filters.directorshipsMin != null && String(filters.directorshipsMin).trim() !== '' ? Number(filters.directorshipsMin) : null;
    const dirMax = filters.directorshipsMax != null && String(filters.directorshipsMax).trim() !== '' ? Number(filters.directorshipsMax) : null;
    if (dirMin != null && !Number.isNaN(dirMin)) {
        out = out.filter((c) => { const n = c.source_metadata?.total_active_directorships; return n != null && n !== '' && Number(n) >= dirMin; });
    }
    if (dirMax != null && !Number.isNaN(dirMax)) {
        out = out.filter((c) => { const n = c.source_metadata?.total_active_directorships; return n != null && n !== '' && Number(n) <= dirMax; });
    }

    const shareMin = filters.shareMin != null && String(filters.shareMin).trim() !== '' ? Number(filters.shareMin) : null;
    const shareMax = filters.shareMax != null && String(filters.shareMax).trim() !== '' ? Number(filters.shareMax) : null;
    if (shareMin != null && !Number.isNaN(shareMin)) {
        out = out.filter((c) => { const n = c.source_metadata?.share_percentage; return n != null && n !== '' && Number(n) >= shareMin; });
    }
    if (shareMax != null && !Number.isNaN(shareMax)) {
        out = out.filter((c) => { const n = c.source_metadata?.share_percentage; return n != null && n !== '' && Number(n) <= shareMax; });
    }

    if (filters.hasDomain === 'yes') {
        out = out.filter((c) => (c.source_metadata?.domain_url || c.website || c.domain_url || '').trim().length > 0);
    } else if (filters.hasDomain === 'no') {
        out = out.filter((c) => (c.source_metadata?.domain_url || c.website || c.domain_url || '').trim().length === 0);
    }

    if (filters.hasLinkedIn === 'yes') {
        out = out.filter((c) => (c.source_metadata?.linkedin_link || c.linkedin_link || '').trim().length > 0);
    } else if (filters.hasLinkedIn === 'no') {
        out = out.filter((c) => (c.source_metadata?.linkedin_link || c.linkedin_link || '').trim().length === 0);
    }

    const minScore = filters.minScore != null && filters.minScore >= 1 && filters.minScore <= 10 ? filters.minScore : null;
    if (minScore != null) {
        out = out.filter((c) => c.score != null && c.score >= minScore);
    }

    return out;
}

// ── Export utilities ─────────────────────────────────────────

function escapeCsvField(s: unknown): string {
    const str = String(s ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) return '"' + str.replace(/"/g, '""') + '"';
    return str;
}

export function exportCsv(companies: CHCompany[]): void {
    const headers = ['#', 'Name', 'Company Number', 'Status', 'Type', 'Incorporation Date', 'Address'];
    const rows = [headers.join(',')];
    companies.forEach((c, i) => {
        const meta = c.source_metadata || {};
        const compStatus = meta.company_status || c.company_status || '';
        const compType = meta.type || meta.company_type || c.type || c.company_type || '';
        const date = c.date_of_creation || meta.date_of_creation || meta.dateOfCreation || '';
        rows.push([
            i + 1,
            c.name || c.company_name || '',
            c.number || c.company_number || '',
            compStatus,
            compType,
            date ? String(date).slice(0, 10) : '',
            (c.address || '').replace(/\n/g, ' '),
        ].map(escapeCsvField).join(','));
    });
    const blob = new Blob([rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'companies.csv';
    a.click();
    URL.revokeObjectURL(url);
}

export async function exportExcel(companies: CHCompany[]): Promise<void> {
    const mod = await import('xlsx');
    const XLSX = mod.default || mod;
    const headers = ['#', 'Name', 'Company Number', 'Status', 'Type', 'Incorporation Date', 'Address'];
    const rows = companies.map((c, i) => {
        const meta = c.source_metadata || {};
        return [
            i + 1,
            c.name || c.company_name || '',
            c.number || c.company_number || '',
            meta.company_status || c.company_status || '',
            meta.type || meta.company_type || c.type || c.company_type || '',
            c.date_of_creation || meta.date_of_creation || meta.dateOfCreation || '',
            c.address || '',
        ];
    });
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Companies');
    XLSX.writeFile(wb, 'companies.xlsx');
}
