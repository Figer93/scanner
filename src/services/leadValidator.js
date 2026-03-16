/**
 * Parse and validate lead data against the Companies House cache (and optionally live API).
 * For existing leads: extract company number/name/address and validate so you can trust the data.
 */

const { getChCacheByNumber } = require('./database');
const { getCompanyByNumber } = require('./companiesHouse');

/**
 * Normalize UK company number: strip spaces, uppercase, pad to 8 digits if numeric.
 * @param {string} value
 * @returns {string}
 */
function normalizeCompanyNumber(value) {
    if (value == null) return '';
    const s = String(value).replace(/\s/g, '').toUpperCase().trim();
    if (/^\d+$/.test(s) && s.length <= 8) return s.padStart(8, '0');
    return s;
}

/**
 * Extract and normalize lead fields from a record (lead row, CSV row, or API payload).
 * Handles company_number, company_number, company_name, name, address, postcode, etc.
 * @param {object} lead - e.g. { company_name, company_number } or { name, number } or mixed
 * @returns {{ company_number: string, company_name: string, address: string | null, postcode: string | null }}
 */
function parseLead(lead) {
    if (!lead || typeof lead !== 'object') {
        return { company_number: '', company_name: '', address: null, postcode: null };
    }
    const company_number = normalizeCompanyNumber(
        lead.company_number ?? lead.companyNumber ?? lead.number ?? lead.company_no ?? ''
    );
    const company_name = String(
        lead.company_name ?? lead.companyName ?? lead.name ?? ''
    ).trim();
    const address = lead.address != null ? String(lead.address).trim() || null : null;
    const postcode = lead.postcode != null ? String(lead.postcode).trim() || null : null;
    return { company_number, company_name, address, postcode };
}

/**
 * Validate a lead against the CH cache (and optionally live API if not in cache).
 * @param {{ query: Function, queryOne: Function, run: Function }} db - Database adapter
 * @param {object} lead - lead record (any shape; parseLead will extract fields)
 * @param {{ useApi?: boolean, apiKey?: string }} [options] - if useApi and apiKey, fetch from CH when not in cache
 * @returns {Promise<{
 *   valid: boolean,
 *   match: { name: string, number: string, address: string, postcode: string } | null,
 *   parsed: { company_number: string, company_name: string, address: string | null, postcode: string | null },
 *   errors: string[],
 *   source: 'cache' | 'api' | null
 * }>}
 */
async function validateLead(db, lead, options = {}) {
    const parsed = parseLead(lead);
    const errors = [];

    if (!parsed.company_number && !parsed.company_name) {
        errors.push('No company number or name to validate.');
        return { valid: false, match: null, parsed, errors, source: null };
    }

    let match = null;
    let source = null;

    if (parsed.company_number) {
        match = getChCacheByNumber(db, parsed.company_number);
        if (match) source = 'cache';
    }

    if (!match && options.useApi && options.apiKey && parsed.company_number) {
        try {
            const fromApi = await getCompanyByNumber(options.apiKey, parsed.company_number);
            if (fromApi) {
                match = fromApi;
                source = 'api';
            }
        } catch (e) {
            errors.push('API lookup failed: ' + (e.message || String(e)));
        }
    }

    if (!match && parsed.company_number) {
        errors.push('Company number not found in cache or API.');
    }
    if (!match && !parsed.company_number && parsed.company_name) {
        errors.push('Company name only: cannot validate without company number. Add number or run a search.');
    }

    if (match && parsed.company_name) {
        const nameMatch = match.name.toLowerCase() === parsed.company_name.toLowerCase();
        if (!nameMatch && match.name.toLowerCase().indexOf(parsed.company_name.toLowerCase()) !== 0) {
            errors.push(`Name mismatch: lead has "${parsed.company_name}", CH has "${match.name}".`);
        }
    }

    const valid = match != null && errors.length === 0;
    return {
        valid,
        match: match ? { name: match.name, number: match.number, address: match.address || '', postcode: match.postcode || '' } : null,
        parsed,
        errors,
        source
    };
}

module.exports = {
    parseLead,
    normalizeCompanyNumber,
    validateLead
};
