/**
 * Website discovery: CH field → Serper → domain guessing. 5s timeouts.
 */

const axios = require('axios');
const { serperSearch, rankedResultLinks } = require('../services/search');
const { BOT_UA } = require('./robotsAllow');

const BLOCKED_SUBSTR = [
    'company-information.service.gov.uk',
    'gov.uk',
    'facebook',
    'linkedin',
    'twitter',
    'yell',
    'yelp',
    'vat-search',
    'vatsearch',
    'companycheck',
    'bizstats',
];

const NAME_STOPWORDS = new Set([
    'and',
    'the',
    'ltd',
    'limited',
    'plc',
    'llp',
    'llc',
    'for',
    'uk',
    'company',
    'services',
    'holdings',
    'group',
]);

/**
 * Words from the legal name that should appear on a genuine company site (length ≥ 3).
 * @param {string} companyName
 * @returns {string[]}
 */
function significantCompanyWords(companyName) {
    const raw = String(companyName || '')
        .replace(/&/g, ' and ')
        .replace(/\b(ltd|limited|plc|llp|llc)\b/gi, ' ');
    return raw
        .toLowerCase()
        .split(/[\s\-&.,]+/)
        .map((w) => w.trim())
        .filter((w) => w.length >= 3 && !NAME_STOPWORDS.has(w));
}

/**
 * Strip HTML to loose text for substring checks.
 * @param {string} html
 * @returns {string}
 */
function htmlToLooseText(html) {
    return String(html || '')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .toLowerCase();
}

/**
 * True if page text plausibly describes this UK company (reduces US/homonym sites).
 * @param {string} html
 * @param {string} companyName
 * @param {string | null | undefined} _postcode optional; reserved for stricter UK checks later
 */
function htmlSupportsCompanyIdentity(html, companyName, _postcode) {
    const text = htmlToLooseText(html);
    const words = significantCompanyWords(companyName);
    if (words.length === 0) return true;
    const need = words.length <= 1 ? 1 : Math.ceil(words.length * 0.6);
    let hits = 0;
    for (const w of words) {
        if (text.includes(w)) hits++;
    }
    if (hits < need) return false;
    return true;
}

const PARKING_SNIPPETS = [
    'this domain is for sale',
    'buy this domain',
    'godaddy',
    'sedo',
    'domain parked',
];

const HTTP_TIMEOUT_MS = 5000;
const DOMAIN_GUESS_TIMEOUT_MS = 3000;

function isBlockedUrl(link) {
    const lower = (link || '').toLowerCase();
    return BLOCKED_SUBSTR.some((b) => lower.includes(b));
}

function looksLikeParking(html) {
    const h = (html || '').slice(0, 50000).toLowerCase();
    return PARKING_SNIPPETS.some((s) => h.includes(s));
}

/**
 * @param {string} url
 * @param {import('axios').AxiosInstance} [client]
 * @returns {Promise<{ finalUrl: string, contentType: string, body: string, ok: boolean }>}
 */
async function fetchHtmlCheck(url, client) {
    const ax = client || axios;
    try {
        const res = await ax.get(url.startsWith('http') ? url : `https://${url}`, {
            timeout: HTTP_TIMEOUT_MS,
            maxRedirects: 5,
            validateStatus: () => true,
            headers: { 'User-Agent': BOT_UA },
        });
        const finalUrl = res.request?.res?.responseUrl || res.config?.url || url;
        const ct = String(res.headers['content-type'] || '');
        const body = typeof res.data === 'string' ? res.data : '';
        const ok = res.status === 200 && /text\/html/i.test(ct) && !looksLikeParking(body);
        return { finalUrl: String(finalUrl), contentType: ct, body, ok };
    } catch {
        return { finalUrl: url, contentType: '', body: '', ok: false };
    }
}

/**
 * @param {string} companyName
 * @returns {string[]}
 */
function domainCandidates(companyName) {
    let s = String(companyName || '')
        .replace(/&/g, 'and')
        .replace(/\b(ltd|limited|plc|llp)\b/gi, '')
        .replace(/[^a-zA-Z0-9]+/g, ' ')
        .trim()
        .toLowerCase();
    const slug = s.replace(/\s+/g, '').slice(0, 60) || 'company';
    return [`${slug}.co.uk`, `${slug}.com`, `get${slug}.co.uk`, `${slug}hq.com`];
}

/**
 * @param {{
 *   companyName: string,
 *   existingWebsite?: string | null,
 *   postcode?: string | null,
 *   apiKey?: string,
 *   serperAcquire?: () => Promise<void>,
 *   logger?: import('pino').Logger
 * }} opts
 * @returns {Promise<{ website: string | null, website_status: 'found'|'not_found'|'parked', website_checked_at: string }>}
 */
async function findWebsiteForLead(opts) {
    const { companyName, existingWebsite, postcode, apiKey, serperAcquire, logger } = opts;
    const checkedAt = new Date().toISOString();

    if (existingWebsite && String(existingWebsite).trim()) {
        const u = String(existingWebsite).trim();
        const { finalUrl, ok, body } = await fetchHtmlCheck(u);
        if (ok && htmlSupportsCompanyIdentity(body, companyName, postcode)) {
            return { website: finalUrl, website_status: 'found', website_checked_at: checkedAt };
        }
        if (body && looksLikeParking(body)) {
            return { website: finalUrl, website_status: 'parked', website_checked_at: checkedAt };
        }
    }

    const rawName = String(companyName || '').trim().replace(/\s+/g, ' ');
    if (rawName && apiKey) {
        try {
            if (serperAcquire) await serperAcquire();
            const companyWords = rawName
                .toLowerCase()
                .split(/[\s\-&.,]+/)
                .filter((w) => w.length > 1);
            const query = `"${rawName}" site UK official`;
            const organic = await serperSearch(query, 10, companyWords, { apiKey });
            const filtered = organic.filter((o) => o.link && !isBlockedUrl(o.link));
            const candidates = rankedResultLinks(filtered, companyWords);
            for (const cand of candidates) {
                const { finalUrl, ok, body } = await fetchHtmlCheck(cand);
                if (ok && htmlSupportsCompanyIdentity(body, rawName, postcode)) {
                    return { website: finalUrl, website_status: 'found', website_checked_at: checkedAt };
                }
                if (body && looksLikeParking(body)) {
                    /* try other results; parked single-result case is rare */
                }
            }
        } catch (err) {
            if (logger) logger.warn({ err: err.message }, 'websiteFinder serper failed');
        }
    }

    for (const host of domainCandidates(companyName)) {
        const tryUrl = `https://${host}`;
        try {
            const res = await axios.get(tryUrl, {
                timeout: DOMAIN_GUESS_TIMEOUT_MS,
                maxRedirects: 5,
                validateStatus: (s) => s === 200,
                headers: { 'User-Agent': BOT_UA },
            });
            const ct = String(res.headers['content-type'] || '');
            const body = typeof res.data === 'string' ? res.data : '';
            const finalUrl = res.request?.res?.responseUrl || tryUrl;
            if (res.status === 200 && /text\/html/i.test(ct) && !looksLikeParking(body)) {
                if (htmlSupportsCompanyIdentity(body, companyName, postcode)) {
                    return { website: String(finalUrl), website_status: 'found', website_checked_at: checkedAt };
                }
            }
            if (looksLikeParking(body)) {
                return { website: String(finalUrl), website_status: 'parked', website_checked_at: checkedAt };
            }
        } catch {
            /* try next */
        }
    }

    return { website: null, website_status: 'not_found', website_checked_at: checkedAt };
}

module.exports = {
    findWebsiteForLead,
    fetchHtmlCheck,
    looksLikeParking,
    domainCandidates,
    significantCompanyWords,
    htmlSupportsCompanyIdentity,
};
