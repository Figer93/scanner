/**
 * LinkedIn enrichment via Serper + optional Apify.
 */

const { serperSearch } = require('../services/search');
const { getOfficers, resolveCompaniesHouseApiKey } = require('../services/companiesHouse');
const { runApifyActor } = require('../services/linkedin');

/**
 * @param {string} url
 */
function isCompanyLinkedIn(url) {
    return /linkedin\.com\/company\/[^/]+/i.test(String(url || ''));
}

/**
 * @param {{
 *   companyName: string,
 *   lead: object,
 *   apiKeys: { serper?: string, apify?: string, actorId?: string, companies_house?: string },
 *   serperAcquire?: () => Promise<void>,
 *   apifyAcquire?: () => Promise<void>,
 *   apifyLinkedinEnabled?: boolean,
 *   logger?: import('pino').Logger
 * }} opts
 * @returns {Promise<{
 *   companyUrl: string | null,
 *   personUrls: string[],
 *   apifyMeta: object | null,
 *   updatedSourceMetadata: object
 * }>}
 */
async function enrichLinkedIn(opts) {
    const { companyName, lead, apiKeys, serperAcquire, apifyAcquire, apifyLinkedinEnabled, logger } = opts;
    const rawName = String(companyName || '').trim();
    let companyUrl = null;
    const personUrls = [];

    if (apiKeys.serper) {
        try {
            if (serperAcquire) await serperAcquire();
            const q = `site:linkedin.com/company "${rawName}"`;
            const organic = await serperSearch(q, 10, [], { apiKey: apiKeys.serper });
            for (const row of organic || []) {
                const link = row.link || row.url || '';
                if (isCompanyLinkedIn(link)) {
                    companyUrl = link.split('?')[0];
                    break;
                }
            }
        } catch (err) {
            if (logger) logger.warn({ err: err.message }, 'linkedin company serper failed');
        }
    }

    let meta = lead.source_metadata;
    if (typeof meta === 'string') {
        try {
            meta = JSON.parse(meta);
        } catch {
            meta = {};
        }
    }
    if (!meta || typeof meta !== 'object') meta = {};

    let officers = Array.isArray(meta.officers) ? meta.officers : [];
    const chKey = apiKeys.companies_house || resolveCompaniesHouseApiKey();
    if (officers.length === 0 && chKey && lead.company_number) {
        try {
            officers = await getOfficers(chKey, lead.company_number);
            meta.officers = officers;
        } catch (err) {
            if (logger) logger.warn({ err: err.message }, 'getOfficers failed');
        }
    }

    if (apiKeys.serper && officers.length > 0) {
        for (const o of officers.slice(0, 8)) {
            const name = (o && o.name ? String(o.name) : '').trim();
            if (!name || name === '—') continue;
            try {
                if (serperAcquire) await serperAcquire();
                const q = `site:linkedin.com/in "${name}" "${rawName}"`;
                const organic = await serperSearch(q, 5, [], { apiKey: apiKeys.serper });
                for (const row of organic || []) {
                    const link = row.link || row.url || '';
                    if (/linkedin\.com\/in\//i.test(link)) {
                        personUrls.push(link.split('?')[0]);
                        break;
                    }
                }
            } catch (err) {
                if (logger) logger.debug({ err: err.message, name }, 'director serper failed');
            }
        }
    }

    let apifyMeta = null;
    if (apifyLinkedinEnabled && apiKeys.apify && rawName && apiKeys.actorId) {
        try {
            if (apifyAcquire) await apifyAcquire();
            const items = await runApifyActor({
                apiToken: apiKeys.apify,
                actorId: apiKeys.actorId,
                input: { companyNames: [rawName], maxItems: 1 },
            });
            apifyMeta = Array.isArray(items) && items[0] ? items[0] : { items };
        } catch (err) {
            if (logger) logger.warn({ err: err.message }, 'apify linkedin failed');
        }
    }

    return {
        companyUrl,
        personUrls: [...new Set(personUrls)],
        apifyMeta,
        updatedSourceMetadata: meta,
    };
}

module.exports = { enrichLinkedIn, isCompanyLinkedIn };
