/**
 * LinkedIn company/contact data via Apify (e.g. harvestapi/linkedin-company or similar).
 * Pulls company data by name; maps to lead shape (name, number, address, postcode).
 */

const axios = require('axios');

const APIFY_BASE = 'https://api.apify.com/v2';
const DEFAULT_ACTOR = 'harvestapi~linkedin-company';
const POLL_MS = 3000;
const MAX_WAIT_MS = 120000;

/**
 * Run an Apify actor and wait for completion, then return dataset items.
 * @param {{ apiToken: string, actorId?: string, input: object }} opts
 * @returns {Promise<object[]>}
 */
async function runApifyActor({ apiToken, actorId = DEFAULT_ACTOR, input }) {
    const token = (apiToken || '').trim();
    if (!token) throw new Error('Apify API token is required. Set APIFY_API_TOKEN in .env or Profile.');
    const id = (actorId || DEFAULT_ACTOR).replace('/', '~');
    const url = `${APIFY_BASE}/acts/${id}/runs`;
    const res = await axios.post(url, input, {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        params: { token },
        timeout: 20000,
        validateStatus: () => true
    });
    if (res.status !== 201 && res.status !== 200) {
        const err = res.data?.error?.message || res.statusText || 'Apify run failed';
        throw new Error(err);
    }
    const runId = res.data?.data?.id;
    const defaultDatasetId = res.data?.data?.defaultDatasetId;
    if (!runId || !defaultDatasetId) {
        throw new Error('Apify run response missing id or defaultDatasetId');
    }
    const started = Date.now();
    while (Date.now() - started < MAX_WAIT_MS) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        const runRes = await axios.get(`${APIFY_BASE}/actor-runs/${runId}`, {
            headers: { Authorization: `Bearer ${token}` },
            params: { token },
            timeout: 10000,
            validateStatus: () => true
        });
        const status = runRes.data?.data?.status;
        if (status === 'SUCCEEDED') break;
        if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
            throw new Error(`Apify run ${status}: ${runRes.data?.data?.statusMessage || ''}`);
        }
    }
    if (Date.now() - started >= MAX_WAIT_MS) {
        throw new Error('Apify run timed out waiting for completion');
    }
    const itemsRes = await axios.get(`${APIFY_BASE}/datasets/${defaultDatasetId}/items`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { token },
        timeout: 15000,
        validateStatus: () => true
    });
    if (itemsRes.status !== 200) {
        throw new Error('Failed to fetch Apify dataset items');
    }
    const items = Array.isArray(itemsRes.data) ? itemsRes.data : (itemsRes.data?.items || []);
    return items;
}

/**
 * Extract UK-style postcode from address string.
 * @param {string} address
 * @returns {string|null}
 */
function extractPostcode(address) {
    if (!address || typeof address !== 'string') return null;
    const match = address.match(/\b([A-Z]{1,2}[0-9][0-9A-Z]?\s*[0-9][A-Z]{2})\b/i);
    return match ? match[1].trim() : null;
}

/**
 * Fetch companies from LinkedIn via Apify; returns array in lead shape.
 * @param {{ apiKey: string, actorId?: string, companyNames: string[], limit?: number }} opts
 * @returns {Promise<Array<{ name: string, number: string, address: string, postcode: string | null }>>}
 */
async function fetchLinkedInCompanies(opts = {}) {
    const apiKey = (opts.apiKey || opts.apiToken || '').trim();
    const companyNames = opts.companyNames || [];
    const limit = Math.min(100, opts.limit || 20);
    const actorId = opts.actorId || DEFAULT_ACTOR;
    if (!companyNames.length) {
        return [];
    }
    const names = companyNames.slice(0, limit).map((n) => String(n).trim()).filter(Boolean);
    if (!names.length) return [];
    const input = { companyNames: names };
    const items = await runApifyActor({ apiToken: apiKey, actorId, input });
    const out = [];
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const name = item.name || item.companyName || item.title || item.company_name || 'Unknown';
        const id = item.companyId || item.id || item.url || item.linkedinUrl || `linkedin_${i}_${Date.now()}`;
        const number = String(id).replace(/^https?:\/\//i, '').replace(/\//g, '_').slice(0, 80) || `linkedin_${i}`;
        let address = item.address || item.location || item.headquarters || item.formattedAddress || '';
        if (typeof address === 'object') {
            address = [address.line1, address.line2, address.city, address.country].filter(Boolean).join(', ') || '';
        }
        const postcode = extractPostcode(address) || item.postcode || item.postalCode || null;
        out.push({ name, number: number.startsWith('linkedin_') ? number : `linkedin_${number}`, address, postcode, source_metadata: item });
    }
    return out;
}

module.exports = {
    fetchLinkedInCompanies,
    runApifyActor,
    DEFAULT_ACTOR
};
