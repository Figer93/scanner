/**
 * Companies House REST API: search and fetch newly incorporated UK companies.
 * Uses Advanced Company Search with incorporated_from / incorporated_to.
 */

const axios = require('axios');

const CH_BASE = 'https://api.company-information.service.gov.uk';
const DEFAULT_DAYS_BACK = parseInt(process.env.CH_DAYS_BACK, 10) || 30;

/**
 * Prefer COMPANIES_HOUSE_API_KEY (Railway / .env) over Profile so a stale DB key does not override deployment.
 * @param {Record<string, string> | null | undefined} profile
 * @returns {string}
 */
function resolveCompaniesHouseApiKey(profile) {
    const strip = (s) => {
        if (s == null || s === '') return '';
        let x = String(s).trim();
        if ((x.startsWith('"') && x.endsWith('"')) || (x.startsWith("'") && x.endsWith("'"))) {
            x = x.slice(1, -1).trim();
        }
        return x;
    };
    const fromEnv = strip(process.env.COMPANIES_HOUSE_API_KEY);
    const fromProf =
        profile && typeof profile === 'object' && profile.companies_house_api_key != null
            ? strip(profile.companies_house_api_key)
            : '';
    return fromEnv || fromProf;
}

/**
 * Format date as YYYY-MM-DD.
 * @param {Date} d
 * @returns {string}
 */
function toDateString(d) {
    return d.toISOString().slice(0, 10);
}

/**
 * Fetch companies from Companies House Advanced Search (rolling date window).
 * @param {{
 *   apiKey: string,
 *   daysBack?: number,
 *   limit?: number,
 *   companyType?: string,
 *   companyStatus?: string,
 *   sicCode?: string,
 *   location?: string
 * }} options
 * @returns {Promise<Array<{ name: string, number: string, address: string, postcode: string }>>}
 */
async function fetchCompanies(options = {}) {
    const apiKey = options.apiKey || resolveCompaniesHouseApiKey({});
    if (!apiKey || !apiKey.trim()) {
        throw new Error('Companies House API key is required. Set COMPANIES_HOUSE_API_KEY in .env or in Profile.');
    }

    const daysBack = options.daysBack ?? DEFAULT_DAYS_BACK;
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - daysBack);

    const params = {
        incorporated_from: toDateString(fromDate),
        incorporated_to: toDateString(toDate),
        size: Math.min(500, Math.max(1, options.limit || 100))
    };
    if (options.location) params.location = options.location;
    if (options.companyType) params.type = options.companyType;
    if (options.companyStatus) params.status = options.companyStatus;
    if (options.sicCode) params.sic_codes = options.sicCode;

    const auth = Buffer.from(apiKey.trim() + ':').toString('base64');

    const response = await axios.get(CH_BASE + '/advanced-search/companies', {
        params,
        headers: {
            Authorization: `Basic ${auth}`
        },
        timeout: 20000
    });

    const items = response.data?.items || [];
    return items.map((c) => {
        const addr = c.registered_office_address || {};
        const line1 = addr.address_line_1 || '';
        const postcode = addr.postal_code || '';
        const address = [line1, addr.locality, postcode].filter(Boolean).join(', ');
        return {
            name: c.company_name || '',
            number: c.company_number || '',
            address,
            postcode,
            source_metadata: c
        };
    });
}

/**
 * Fetch officers for a company. Returns current directors only.
 * GET /company/{number}/officers
 * @param {string} apiKey
 * @param {string} companyNumber
 * @returns {Promise<Array<{ name: string }>>}
 */
async function getOfficers(apiKey, companyNumber) {
    if (!apiKey || !apiKey.trim()) return [];
    const num = String(companyNumber || '').trim();
    if (!num) return [];
    const auth = Buffer.from(apiKey.trim() + ':').toString('base64');
    try {
        const response = await axios.get(CH_BASE + '/company/' + encodeURIComponent(num) + '/officers', {
            headers: { Authorization: `Basic ${auth}` },
            timeout: 10000,
            params: { items_per_page: 100 }
        });
        const items = response.data?.items || [];
        return items
            .filter((o) => {
                const role = (o.officer_role || '').toLowerCase();
                const resigned = o.resigned_on != null && String(o.resigned_on).trim() !== '';
                return (role === 'director' || role === 'corporate-director') && !resigned;
            })
            .map((o) => ({ name: o.name || '—' }));
    } catch (err) {
        if (err.response?.status === 404) return [];
        throw err;
    }
}

/**
 * Fetch persons with significant control. Returns name and nature of control.
 * GET /company/{number}/persons-with-significant-control
 * @param {string} apiKey
 * @param {string} companyNumber
 * @returns {Promise<Array<{ name: string, nature_of_control: string }>>}
 */
async function getPSCs(apiKey, companyNumber) {
    if (!apiKey || !apiKey.trim()) return [];
    const num = String(companyNumber || '').trim();
    if (!num) return [];
    const auth = Buffer.from(apiKey.trim() + ':').toString('base64');
    const results = [];
    try {
        let url = CH_BASE + '/company/' + encodeURIComponent(num) + '/persons-with-significant-control';
        while (url) {
            const response = await axios.get(url, {
                headers: { Authorization: `Basic ${auth}` },
                timeout: 10000,
                params: url === CH_BASE + '/company/' + encodeURIComponent(num) + '/persons-with-significant-control' ? { items_per_page: 100 } : undefined
            });
            const items = response.data?.items || [];
            for (const p of items) {
                if (p.ceased_on != null && String(p.ceased_on).trim() !== '') continue;
                let name = p.name;
                if (!name && p.kind === 'individual-person-with-significant-control' && p.name_elements) {
                    name = [p.name_elements.title, p.name_elements.forename, p.name_elements.surname].filter(Boolean).join(' ').trim();
                }
                name = name || '—';
                const natures = p.nature_of_control || [];
                const natureStr = Array.isArray(natures) ? natures.map((n) => String(n).replace(/-/g, ' ')).join(', ') : '';
                results.push({ name, nature_of_control: natureStr || '—' });
            }
            const nextLink = response.data?.links?.next;
            url = nextLink ? (nextLink.startsWith('http') ? nextLink : CH_BASE.replace(/\/$/, '') + nextLink) : null;
        }
        return results;
    } catch (err) {
        if (err.response?.status === 404) return [];
        throw err;
    }
}

/**
 * Fetch charges for a company. Returns count of outstanding charges.
 * GET /company/{number}/charges
 * @param {string} apiKey
 * @param {string} companyNumber
 * @returns {Promise<number>}
 */
async function getCharges(apiKey, companyNumber) {
    if (!apiKey || !apiKey.trim()) return 0;
    const num = String(companyNumber || '').trim();
    if (!num) return 0;
    const auth = Buffer.from(apiKey.trim() + ':').toString('base64');
    try {
        let count = 0;
        let url = CH_BASE + '/company/' + encodeURIComponent(num) + '/charges';
        while (url) {
            const response = await axios.get(url, {
                headers: { Authorization: `Basic ${auth}` },
                timeout: 10000,
                params: url === CH_BASE + '/company/' + encodeURIComponent(num) + '/charges' ? { items_per_page: 100 } : undefined
            });
            const items = response.data?.items || [];
            for (const c of items) {
                if ((c.status || '').toLowerCase() === 'outstanding') count++;
            }
            const nextLink = response.data?.links?.next;
            url = nextLink ? (nextLink.startsWith('http') ? nextLink : CH_BASE.replace(/\/$/, '') + nextLink) : null;
        }
        return count;
    } catch (err) {
        if (err.response?.status === 404) return 0;
        throw err;
    }
}

/**
 * Fetch a single company by company number (for validation).
 * @param {string} apiKey
 * @param {string} companyNumber
 * @returns {Promise<{ name: string, number: string, address: string, postcode: string, source_metadata?: object } | null>}
 */
async function getCompanyByNumber(apiKey, companyNumber) {
    if (!apiKey || !apiKey.trim()) return null;
    const num = String(companyNumber || '').trim();
    if (!num) return null;
    const auth = Buffer.from(apiKey.trim() + ':').toString('base64');
    try {
        const response = await axios.get(CH_BASE + '/company/' + encodeURIComponent(num), {
            headers: { Authorization: `Basic ${auth}` },
            timeout: 10000
        });
        const c = response.data;
        if (!c) return null;
        const addr = c.registered_office_address || {};
        const line1 = addr.address_line_1 || '';
        const postcode = addr.postal_code || '';
        const address = [line1, addr.locality, postcode].filter(Boolean).join(', ');
        return {
            name: c.company_name || '',
            number: c.company_number || '',
            address,
            postcode,
            source_metadata: c
        };
    } catch (err) {
        if (err.response?.status === 404) return null;
        throw err;
    }
}

module.exports = {
    resolveCompaniesHouseApiKey,
    fetchCompanies,
    getCompanyByNumber,
    getOfficers,
    getPSCs,
    getCharges
};
