/**
 * Shared utility functions — single source of truth.
 * Deduplicates formatDate, capitalize, getStatusVariant, formatAddress
 * previously copy-pasted across CompanyDetailDrawer, CompanyDetailPage,
 * CompaniesTable, and LeadProfile.
 */

/** Format an ISO date string or YYYY-MM-DD value for display. */
export function formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    try {
        const d = new Date(String(value).slice(0, 10));
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
        return '—';
    }
}

/** Format a full ISO datetime string (includes time). */
export function formatDateTime(value: string | null | undefined): string {
    if (!value) return '—';
    try {
        const d = new Date(value);
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleString('en-GB', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
        return '—';
    }
}

/** Capitalise first letter, lowercase rest. */
export function capitalize(s: string | null | undefined): string {
    if (!s) return '';
    const str = String(s);
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export type StatusVariant = 'active' | 'dissolved' | 'warning' | 'other';

/** Map a Companies House status string to a design-system variant token. */
export function getStatusVariant(status: string | null | undefined): StatusVariant {
    if (!status) return 'other';
    const s = String(status).toLowerCase();
    if (s === 'active') return 'active';
    if (s === 'dissolved') return 'dissolved';
    if (s.includes('liquidation') || s.includes('receivership') || s.includes('administration')) return 'warning';
    return 'other';
}

/** Resolve status variant to a CSS colour token pairing: [text class, background class] */
export function statusVariantClasses(variant: StatusVariant): [string, string] {
    switch (variant) {
        case 'active':    return ['text-emerald-400',  'bg-emerald-500/10'];
        case 'dissolved': return ['text-red-400',      'bg-red-500/10'];
        case 'warning':   return ['text-amber-400',    'bg-amber-500/10'];
        default:          return ['text-white/50',     'bg-white/5'];
    }
}

/** CH address object shape (from raw JSON). */
export interface CHAddress {
    address_line_1?: string;
    address_line_2?: string;
    locality?: string;
    region?: string;
    postal_code?: string;
    country?: string;
}

/** Format a Companies House address object into a single-line string. */
export function formatAddress(addr: CHAddress | string | null | undefined): string {
    if (!addr) return '—';
    if (typeof addr === 'string') return addr || '—';
    const parts = [
        addr.address_line_1,
        addr.address_line_2,
        addr.locality,
        addr.region,
        addr.postal_code,
        addr.country,
    ].filter(Boolean) as string[];
    return parts.length > 0 ? parts.join(', ') : '—';
}

/** Clamp a number between min and max. */
export function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

/** Extract list ID from window.location.search (?list=123). */
export function getListIdFromSearch(search: string): number | null {
    const params = new URLSearchParams(search);
    const raw = params.get('list');
    if (!raw) return null;
    const n = parseInt(raw, 10);
    return isNaN(n) ? null : n;
}

/** Join class names, filtering falsy values. */
export function cn(...classes: Array<string | false | null | undefined>): string {
    return classes.filter(Boolean).join(' ');
}
