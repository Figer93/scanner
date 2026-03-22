/**
 * Website search via Serper API (Google search).
 * Finds official company website with blacklist and domain relevance scoring.
 */

const axios = require('axios');

const BLACKLIST = [
    'vat-search',
    'vatsearch',
    'vat-check',
    'vatcheck',
    'companycheck',
    'bizstats',
    'duedil',
    'northdata',
    'endole',
    'opencorporates',
    'facebook',
    'linkedin',
    'yell',
    'gov.uk',
    'secret-bases.co.uk',
    'gbcomp',
    'p-o.co.uk',
    'check-business',
    'company-information.service.gov.uk',
    'companieslist.org',
    'company-directory.co.uk',
    'bizdb.co.uk',
    'cylex.co.uk',
    'hotfrog.',
    'freeindex.co.uk',
    'touchlocal',
    'scoot.co.uk',
    'tupalo.',
    'brownbook.net',
    'expressbusinessdirectory',
    'postcode'
];

/** Path segments that indicate a directory/listing page, not a company homepage */
const DIRECTORY_PATH_PATTERNS = /^(postcode|search|listing|listings|directory|companies|company-list|business-list|results?|find|browse|en\/[^/]+\/(postcode|search|listing|company))/i;

function isBlacklisted(link) {
    const lower = (link || '').toLowerCase();
    return BLACKLIST.some(b => lower.includes(b));
}

/**
 * Returns true if the URL looks like a directory/listing page (e.g. postcode listings)
 * rather than a company's own website.
 */
function isDirectoryOrListingUrl(link) {
    if (!link) return true;
    try {
        const u = new URL(link.startsWith('http') ? link : 'https://' + link);
        const path = u.pathname.toLowerCase();
        const pathSegments = path.split('/').filter(Boolean);
        if (DIRECTORY_PATH_PATTERNS.test(path) || path.includes('/postcode/') || path.includes('/search')) return true;
        if (pathSegments.length >= 3 && (path.includes('postcode') || path.includes('listing'))) return true;
        return false;
    } catch {
        return false;
    }
}

/**
 * Prefer company homepages: short path (root or 1 segment) scores higher.
 */
function pathScore(link) {
    try {
        const u = new URL(link.startsWith('http') ? link : 'https://' + link);
        const path = u.pathname.replace(/\/$/, '') || '/';
        const segments = path.split('/').filter(Boolean);
        if (segments.length === 0) return 1;
        if (segments.length === 1 && segments[0].length < 25) return 0.8;
        if (segments.length <= 2) return 0.5;
        return 0.2;
    } catch {
        return 0;
    }
}

function scoreDomainMatch(link, companyWords) {
    if (!companyWords.length) return 1;
    let host;
    try {
        host = new URL(link).hostname.toLowerCase();
    } catch {
        host = (link || '').toLowerCase();
    }
    const hostTokens = host.split(/[.\-]/).filter(Boolean);
    let matchCount = 0;
    for (const w of companyWords) {
        if (hostTokens.some(t => t.includes(w) || w.includes(t))) matchCount++;
    }
    return matchCount / companyWords.length;
}

/**
 * @param {string} query
 * @param {number} num
 * @param {string[]} companyWords
 * @param {{ apiKey?: string }} [opts]
 * @returns {Promise<Array<{ link: string }>>}
 */
async function serperSearch(query, num = 10, companyWords = [], opts = {}) {
    const apiKey = opts.apiKey || process.env.SERPER_API_KEY;
    if (!apiKey || !apiKey.trim()) throw new Error('SERPER_API_KEY is required (set in .env or Profile)');

    const response = await axios({
        method: 'post',
        url: 'https://google.serper.dev/search',
        headers: {
            'X-API-KEY': apiKey.trim(),
            'Content-Type': 'application/json'
        },
        data: JSON.stringify({ q: query, num })
    });

    const data = response.data || {};
    const organic = data.organic || [];
    const kg = data.knowledgeGraph || {};
    const kgWebsite = kg.website || kg.attributes?.Website;

    if (
        kgWebsite &&
        typeof kgWebsite === 'string' &&
        !isBlacklisted(kgWebsite) &&
        scoreDomainMatch(kgWebsite, companyWords) >= 0.5
    ) {
        return [{ link: kgWebsite, fromKg: true }, ...organic];
    }
    return organic;
}

/**
 * @param {Array<{ link: string }>} results
 * @param {string[]} companyWords
 * @returns {string|null}
 */
function pickBestFromResults(results, companyWords) {
    let bestResult = null;
    let bestScore = -1;
    for (const res of results || []) {
        const link = res.link;
        if (!link) continue;
        if (isBlacklisted(link)) continue;
        if (isDirectoryOrListingUrl(link)) continue;
        const domainScore = scoreDomainMatch(link, companyWords);
        const pathSc = pathScore(link);
        const score = domainScore * 0.7 + pathSc * 0.3;
        if (score > bestScore && (companyWords.length === 0 || domainScore >= 0.3)) {
            bestScore = score;
            bestResult = link;
        }
        if (!bestResult && (companyWords.length === 0 || domainScore >= 0.2)) bestResult = link;
    }
    return bestResult;
}

/**
 * Same ranking as pickBestFromResults but returns ordered candidates for sequential verification (HTML copy checks).
 * @param {Array<{ link: string }>} results
 * @param {string[]} companyWords
 * @returns {string[]}
 */
function rankedResultLinks(results, companyWords) {
    const scored = [];
    for (const res of results || []) {
        const link = res.link;
        if (!link) continue;
        if (isBlacklisted(link)) continue;
        if (isDirectoryOrListingUrl(link)) continue;
        const domainScore = scoreDomainMatch(link, companyWords);
        const pathSc = pathScore(link);
        const score = domainScore * 0.7 + pathSc * 0.3;
        if (companyWords.length > 0 && domainScore < 0.25) continue;
        scored.push({ link, score });
    }
    scored.sort((a, b) => b.score - a.score);
    const out = [];
    const seen = new Set();
    for (const s of scored) {
        if (seen.has(s.link)) continue;
        seen.add(s.link);
        out.push(s.link);
    }
    return out;
}

/**
 * Find company website using multiple query fallbacks.
 * @param {string} companyName
 * @param {import('pino').Logger} [logger]
 * @param {{ apiKey?: string, db?: { query: Function, queryOne: Function, run: Function } }} [opts] - apiKey overrides env; db for usage logging
 * @returns {Promise<string|null>}
 */
async function findWebsite(companyName, logger, opts = {}) {
    const rawName = (companyName || '').trim().replace(/\s+/g, ' ');
    if (!rawName) return null;

    const companyWords = rawName
        .toLowerCase()
        .split(/[\s\-&.,]+/)
        .filter(w => w.length > 1);

    const queries = [
        { q: `"${rawName}" Manchester official website`, num: 20 },
        { q: `${rawName} Manchester official website`, num: 20 },
        { q: `"${rawName}" website`, num: 15 },
        { q: `${rawName} UK website`, num: 15 }
    ];

    const log = (msg) => logger ? logger.info(msg) : console.log(msg);

    const apiKey = opts.apiKey || process.env.SERPER_API_KEY;
    try {
        log({ msg: 'Searching for website', companyName: rawName });

        for (let i = 0; i < queries.length; i++) {
            const { q, num } = queries[i];
            const results = await serperSearch(q, num, companyWords, { apiKey });
            const best = pickBestFromResults(results, companyWords);
            if (best) {
                if (opts.db) {
                    try {
                        const { recordUsage } = require('./usageTracker');
                        recordUsage(opts.db, { service: 'serper', endpoint: '/search', request_count: i + 1, estimated_cost_gbp: 0.001 * (i + 1) });
                    } catch (_) {}
                }
                if (i > 0) log({ msg: 'Found via fallback query', queryIndex: i + 1, url: best });
                else log({ msg: 'Website found', url: best });
                return best;
            }
            if (i < queries.length - 1) {
                await new Promise(r => setTimeout(r, 400));
            }
        }

        log({ msg: 'No suitable results from Serper' });
        return null;
    } catch (e) {
        if (logger) logger.error({ err: e, companyName: rawName }, 'Search failed');
        else console.error('Search error:', e.message);
        return null;
    }
}

module.exports = {
    findWebsite,
    serperSearch,
    pickBestFromResults,
    rankedResultLinks,
    isBlacklisted,
    isDirectoryOrListingUrl,
    pathScore,
    scoreDomainMatch,
    BLACKLIST
};
