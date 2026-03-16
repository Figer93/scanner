/**
 * UK data sources: Charity Commission (England & Wales), FCA register.
 * Maps results to the same shape as other lead sources (name, number, address, postcode).
 */

const axios = require('axios');

/** Charity Commission Register of Charities API - search by registration date. See https://api-portal.charitycommission.gov.uk */
const CHARITY_API_BASE = process.env.CHARITY_COMMISSION_API_BASE || 'https://register-of-charities.charitycommission.gov.uk';

/**
 * Fetch recently registered charities from Charity Commission API.
 * Requires CHARITY_COMMISSION_API_KEY in env or profile.
 * @param {{ apiKey: string, limit?: number, daysBack?: number }} opts
 * @returns {Promise<Array<{ name: string, number: string, address: string, postcode: string }>>}
 */
async function fetchCharityCommission(opts = {}) {
    const apiKey = (opts.apiKey || process.env.CHARITY_COMMISSION_API_KEY || '').trim();
    if (!apiKey) {
        throw new Error('Charity Commission API key is required. Set CHARITY_COMMISSION_API_KEY in .env or Profile.');
    }
    const limit = Math.min(100, opts.limit || 20);
    const daysBack = opts.daysBack || 90;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    const startStr = startDate.toISOString().slice(0, 10);
    const endStr = endDate.toISOString().slice(0, 10);
    const path = CHARITY_API_BASE.includes('api-portal') ? `/register-of-charities/searchCharityRegDate/${startStr}/${endStr}` : `/searchCharityRegDate/${startStr}/${endStr}`;
    const url = CHARITY_API_BASE.replace(/\/$/, '') + path;
    const res = await axios.get(url, {
        headers: { 'Ocp-Apim-Subscription-Key': apiKey },
        timeout: 15000,
        validateStatus: () => true
    });
    if (res.status !== 200) {
        throw new Error(`Charity Commission API error: ${res.status} ${res.statusText || res.data?.message || ''}`);
    }
    const data = res.data;
    const list = Array.isArray(data) ? data : (data?.charities || data?.results || data?.items || []);
    if (!Array.isArray(list)) return [];
    return list.slice(0, limit).map((c) => {
        const name = c.charityName || c.name || c.organisationName || 'Unknown';
        const number = String(c.registeredCharityNumber ?? c.registrationNumber ?? c.charityNumber ?? c.id ?? '');
        const addr = c.address || c.principalOffice || {};
        const address = [addr.line1, addr.line2, addr.line3].filter(Boolean).join(', ') || (addr.addressLine1 || '');
        const postcode = addr.postCode || addr.postcode || '';
        return { name, number, address, postcode, source_metadata: c };
    });
}

/**
 * FCA Register: fetch firms (stub – uses public search; for full API you need FCA auth).
 * Returns a small set of recently added or sample firms for demo. Replace with real FCA API when key available.
 * @param {{ limit?: number }} opts
 * @returns {Promise<Array<{ name: string, number: string, address: string, postcode: string }>>}
 */
async function fetchFCARegister(opts = {}) {
    const limit = Math.min(50, opts.limit || 20);
    // FCA public register search: https://register.fca.org.uk/ – no key for basic search
    // This stub returns empty; integrate FCA API when you have credentials.
    try {
        const res = await axios.get(
            'https://register.fca.org.uk/services/public/search',
            {
                params: { q: 'limited', page: 1, limit },
                timeout: 10000,
                validateStatus: () => true
            }
        );
        if (res.status !== 200 || !res.data) return [];
        const list = res.data?.results ?? res.data?.data ?? [];
        if (!Array.isArray(list)) return [];
        return list.slice(0, limit).map((f) => {
            const name = f.name || f.firmName || 'Unknown';
            const number = String(f.firmReferenceNumber ?? f.id ?? '');
            const addr = f.address || f.principalAddress || {};
            const address = typeof addr === 'string' ? addr : [addr.addressLine1, addr.addressLine2].filter(Boolean).join(', ');
            const postcode = typeof addr === 'object' && addr ? (addr.postcode || '') : '';
            return { name, number, address, postcode, source_metadata: f };
        });
    } catch (_) {
        return [];
    }
}

module.exports = {
    fetchCharityCommission,
    fetchFCARegister
};
