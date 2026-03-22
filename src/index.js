/**
 * Lead Generation System – main orchestrator.
 * Exports runPipeline({ limit, onProgress }) for programmatic use and CLI.
 */

require('dotenv').config();
const logger = require('./lib/logger');
const { parseArgs, loadCompanies, DELAY_BETWEEN_COMPANIES_MS, SOURCE_CH, SOURCE_GOOGLE_MAPS, SOURCE_CHARITY, SOURCE_FCA } = require('./config');

const DEFAULT_PIPELINE_LIMIT = 10;
const DEFAULT_CH_DAYS_BACK = 30;
const DEFAULT_CHARITY_DAYS_BACK = 90;
const DEFAULT_GOOGLE_MAPS_LIMIT = 20;
const DEFAULT_LINKEDIN_LIMIT = 50;
const { findWebsite } = require('./services/search');
const { createBrowser, getContacts } = require('./services/scraper');
const {
    getDb,
    initSchema,
    upsertLead,
    getLeadById,
    getLeadByCompanyNumber,
    leadExistsByDomain,
    closeDb,
    updateLeadEnrichment,
    STATUS,
    LEAD_SOURCE,
} = require('./services/database');
const { generateIceBreaker, extractWebsiteEnrichment } = require('./services/ai');
const { getResolvedKeys, recordUsage } = require('./services/usageTracker');
const { search: searchChCache } = require('./services/companiesHouseCache');
const { searchPlaces } = require('./services/googleMaps');
const { fetchCharityCommission, fetchFCARegister } = require('./services/ukSources');
const { fetchLinkedInCompanies } = require('./services/linkedin');

function normalizeContacts(contacts) {
    return {
        emails: contacts.emails?.length ? contacts.emails : ['Not found'],
        phones: contacts.phones?.length ? contacts.phones : ['Not found'],
        contactForm: !!contacts.contactForm
    };
}

/**
 * Build a logger that forwards every log to onProgress(message: string).
 */
function progressLogger(onProgress) {
    const format = (a, b) => {
        if (typeof a === 'object' && a !== null && 'msg' in a) {
            let s = a.msg;
            if (a.companyName) s += ': ' + a.companyName;
            if (a.url) s += ' ' + a.url;
            if (a.companyNumber) s += ' (' + a.companyNumber + ')';
            if (a.website) s += ' ' + a.website;
            if (a.emails !== undefined) s += ' – emails: ' + a.emails + ', phones: ' + a.phones;
            if (a.contactForm !== undefined) s += ', form: ' + a.contactForm;
            if (a.queryIndex !== undefined) s += ' – query ' + a.queryIndex;
            if (a.index !== undefined) s += ' [' + a.index + '/' + (a.total || '?') + ']';
            return s;
        }
        return typeof b === 'string' ? b : (typeof a === 'string' ? a : JSON.stringify(a));
    };
    return {
        info: (a, b) => onProgress(format(a, b)),
        warn: (a, b) => onProgress('WARN: ' + format(a, b)),
        error: (a, b) => onProgress('ERROR: ' + format(a, b)),
        fatal: (a, b) => onProgress('FATAL: ' + format(a, b))
    };
}

/**
 * Run the lead enrichment pipeline.
 * @param {{ limit?: number, inputFile?: string, source?: string, googleMapsKeyword?: string, googleMapsLocation?: string, linkedInCompanyNames?: string, onProgress: (message: string) => void }} options
 * @returns {Promise<void>}
 */
async function runPipeline({ limit, inputFile, source: sourceOpt, googleMapsKeyword, googleMapsLocation, linkedInCompanyNames, daysBack, onProgress }) {
    const opts = parseArgs();
    const effectiveLimit = limit != null ? limit : (opts.limit ?? DEFAULT_PIPELINE_LIMIT);
    const effectiveInputFile = inputFile ?? opts.inputFile;
    const source = sourceOpt ?? opts.source ?? LEAD_SOURCE.JSON_FILE;

    const logger = progressLogger(onProgress);

    const db = await getDb();
    initSchema(db);
    const apiKeys = await getResolvedKeys(db);

    const sourceLabel = (s) => {
        if (s === SOURCE_CH || s === 'companies_house') return 'Companies House';
        if (s === SOURCE_GOOGLE_MAPS || s === 'google_maps') return 'Google Places';
        if (s === SOURCE_CHARITY || s === 'charity_commission') return 'Charity Commission';
        if (s === SOURCE_FCA || s === 'fca_register') return 'FCA Register';
        if (s === SOURCE_LINKEDIN || s === 'linkedin') return 'LinkedIn';
        return 'JSON file';
    };

    let companies;
    try {
        if (source === SOURCE_CH || source === 'companies_house') {
            onProgress('Searching Companies House cache…');
            const chDaysBack = daysBack != null ? Number(daysBack) : (parseInt(process.env.CH_DAYS_BACK, 10) || DEFAULT_CH_DAYS_BACK);
            companies = await searchChCache(db, {
                limit: effectiveLimit || 100,
                daysBack: chDaysBack
            });
            onProgress(`Searching Companies House cache… ✓ (${companies.length} companies)`);
            if (companies.length === 0) {
                onProgress('Cache is empty. Run "Sync Companies House" (script or API) to populate the cache, then run the pipeline again.');
            }
        } else if (source === SOURCE_GOOGLE_MAPS || source === 'google_maps') {
            if (!apiKeys.google_places_api_key || !apiKeys.google_places_api_key.trim()) {
                throw new Error('Google Places API key is required. Set GOOGLE_PLACES_API_KEY in Railway or .env.');
            }
            const keyword = googleMapsKeyword || process.env.GOOGLE_MAPS_KEYWORD || 'business';
            const location = googleMapsLocation || process.env.GOOGLE_MAPS_LOCATION || 'London';
            onProgress(`Fetching from Google Places: "${keyword}" in ${location}…`);
            const places = await searchPlaces({
                apiKey: apiKeys.google_places_api_key,
                keyword: keyword.trim(),
                location: location.trim(),
                limit: effectiveLimit || 20
            });
            companies = places.map((p) => ({ name: p.name, number: p.number, address: p.address, postcode: p.postcode }));
            onProgress(`Fetching from ${sourceLabel(source)}… ✓`);
            try {
                await recordUsage(db, { service: 'google_places', endpoint: 'textsearch', request_count: 1 });
            } catch (err) {
                logger.warn({ err: err.message }, 'Failed to record google_places usage');
            }
        } else if (source === SOURCE_CHARITY || source === 'charity_commission') {
            onProgress('Fetching from Charity Commission…');
            const charityDaysBack = daysBack != null ? Number(daysBack) : (parseInt(process.env.CHARITY_DAYS_BACK, 10) || DEFAULT_CHARITY_DAYS_BACK);
            companies = await fetchCharityCommission({
                apiKey: apiKeys.charity_commission_api_key || process.env.CHARITY_COMMISSION_API_KEY,
                limit: effectiveLimit || DEFAULT_GOOGLE_MAPS_LIMIT,
                daysBack: charityDaysBack
            });
            onProgress(`Fetching from ${sourceLabel(source)}… ✓`);
            try {
                await recordUsage(db, { service: 'charity_commission', endpoint: 'searchCharityRegDate', request_count: 1 });
            } catch (err) {
                logger.warn({ err: err.message }, 'Failed to record charity_commission usage');
            }
        } else if (source === SOURCE_FCA || source === 'fca_register') {
            onProgress('Fetching from FCA Register…');
            companies = await fetchFCARegister({ limit: effectiveLimit || DEFAULT_GOOGLE_MAPS_LIMIT });
            onProgress(`Fetching from ${sourceLabel(source)}… ✓`);
            try {
                await recordUsage(db, { service: 'fca_register', endpoint: 'search', request_count: 1 });
            } catch (err) {
                logger.warn({ err: err.message }, 'Failed to record fca_register usage');
            }
        } else if (source === SOURCE_LINKEDIN || source === 'linkedin') {
            const linkedInNames = (linkedInCompanyNames || '').toString().split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
            if (!linkedInNames.length) {
                throw new Error('LinkedIn source requires company names (comma or newline separated).');
            }
            if (!apiKeys.apify_api_token || !apiKeys.apify_api_token.trim()) {
                throw new Error('Apify API token is required for LinkedIn. Set APIFY_API_TOKEN in Railway or .env.');
            }
            onProgress('Fetching from LinkedIn via Apify…');
            companies = await fetchLinkedInCompanies({
                apiKey: apiKeys.apify_api_token,
                actorId: apiKeys.apify_linkedin_actor_id || process.env.APIFY_LINKEDIN_ACTOR_ID,
                companyNames: linkedInNames,
                limit: effectiveLimit || DEFAULT_LINKEDIN_LIMIT
            });
            onProgress(`Fetching from ${sourceLabel(source)}… ✓`);
            try {
                await recordUsage(db, { service: 'apify', endpoint: 'linkedin', request_count: 1 });
            } catch (err) {
                logger.warn({ err: err.message }, 'Failed to record apify usage');
            }
        } else {
            onProgress('Loading from JSON file…');
            companies = loadCompanies(effectiveInputFile);
            onProgress(`Fetching from ${sourceLabel(source)}… ✓`);
        }
    } catch (e) {
        logger.fatal({ err: e, inputFile: effectiveInputFile, source }, 'Failed to load companies');
        throw e;
    }

    const toProcess = effectiveLimit ? companies.slice(0, effectiveLimit) : companies;
    onProgress(`Starting lead enrichment – total: ${companies.length}, processing: ${toProcess.length}, limit: ${effectiveLimit}, source: ${source}`);

    let inserted = 0, updated = 0, enrichedCount = 0;
    const { browser, context } = await createBrowser();

    try {
        for (let i = 0; i < toProcess.length; i++) {
            const raw = toProcess[i];
            const companyName = raw.name || raw.company_name || '';
            const companyNumber = String(raw.number ?? raw.company_number ?? '');

            onProgress(`[${i + 1}/${toProcess.length}] Processing: ${companyName} (${companyNumber})`);

            const existingByNumber = await getLeadByCompanyNumber(db, companyNumber);
            if (existingByNumber) {
                onProgress(`Already in DB (company number); skipping ${companyNumber}`);
                await new Promise(r => setTimeout(r, DELAY_BETWEEN_COMPANIES_MS));
                continue;
            }

            const website = await findWebsite(companyName, logger, { apiKey: apiKeys.serper_api_key, db });

            if (website && (await leadExistsByDomain(db, website))) {
                onProgress(`Domain already in DB; skipping ${companyNumber} (${website})`);
                await new Promise(r => setTimeout(r, DELAY_BETWEEN_COMPANIES_MS));
                continue;
            }
            let emails = [];
            let phones = [];
            let contactForm = false;

            let websiteServices = null, websiteSize = null, websiteTech = null;
            if (website) {
                onProgress(`Website found: ${website}`);
                const contacts = await getContacts(context, website, logger);
                const normalized = normalizeContacts(contacts);
                emails = normalized.emails;
                phones = normalized.phones;
                contactForm = normalized.contactForm;
                onProgress(`Contacts scraped – emails: ${emails.length}, phones: ${phones.length}, contactForm: ${contactForm}`);
                if (contacts.pageText && apiKeys.google_ai_api_key) {
                    try {
                        const enrichment = await extractWebsiteEnrichment(contacts.pageText, companyName, { googleAiApiKey: apiKeys.google_ai_api_key, db });
                        if (enrichment && !enrichment.error) {
                            websiteServices = enrichment.services ?? null;
                            websiteSize = enrichment.size ?? null;
                            websiteTech = enrichment.tech ?? null;
                            onProgress(`Website enrichment – services/size/tech extracted`);
                        }
                    } catch (e) {
                        logger.warn({ err: e }, 'Website enrichment skipped');
                    }
                }
            } else {
                emails = ['Not found'];
                phones = ['Not found'];
                onProgress(`Website not found for ${companyName}`);
            }

            let iceBreaker = null;
            try {
                iceBreaker = await generateIceBreaker(companyName, null, logger, { googleAiApiKey: apiKeys.google_ai_api_key, db, website: website || undefined });
            } catch (e) {
                logger.warn({ err: e }, 'Ice-breaker skipped');
            }

            const status = website ? STATUS.ENRICHED : STATUS.NEW;
            const meta = raw.source_metadata || {};
            const dateOfCreation = meta.date_of_creation || meta.dateOfCreation || meta.incorporation_date || meta.registrationDate || meta.dateRegistered || raw.date_of_creation || null;
            const result = await upsertLead(db, {
                company_name: companyName,
                company_number: companyNumber,
                address: raw.address ?? null,
                postcode: raw.postcode ?? null,
                website: website || null,
                emails,
                phones,
                contact_form: contactForm,
                status,
                ice_breaker: iceBreaker,
                source,
                website_services: websiteServices,
                website_size: websiteSize,
                website_tech: websiteTech,
                source_metadata: raw.source_metadata ?? null,
                date_of_creation: dateOfCreation ? String(dateOfCreation).slice(0, 10) : null
            });

            onProgress(`Lead saved: ${companyNumber} (${result.inserted ? 'inserted' : 'updated'}), status: ${status}`);
            if (result.inserted) inserted++;
            else updated++;
            if (status === STATUS.ENRICHED) enrichedCount++;

            if (i < toProcess.length - 1) {
                await new Promise(r => setTimeout(r, DELAY_BETWEEN_COMPANIES_MS));
            }
        }
    } finally {
        await context.close();
        await browser.close();
        closeDb();
    }

    onProgress('Lead generation complete. ✓');
    return { inserted, updated, enriched: enrichedCount };
}

/**
 * Re-enrich a single lead by id: find website, scrape contacts, extract enrichment, update DB.
 * Caller must provide an open db; does not close it.
 * @param {{ query: Function, queryOne: Function, run: Function }} db - Database adapter
 * @param {number} leadId
 * @param {{ logger?: import('pino').Logger, apiKeys?: object }} opts
 * @returns {Promise<object|null>} Updated lead or null if not found
 */
async function syncLeadById(db, leadId, opts = {}) {
    const lead = await getLeadById(db, leadId);
    if (!lead) return null;

    const companyName = lead.company_name || '';
    const logger = opts.logger || { info: () => {}, warn: () => {}, error: () => {} };
    const apiKeys = opts.apiKeys || await getResolvedKeys(db);

    let website = null;
    try {
        website = await findWebsite(companyName, logger, { apiKey: apiKeys.serper_api_key, db });
    } catch (e) {
        logger.warn({ err: e }, 'Website search failed during sync');
    }
    if (!website && lead.website) website = lead.website;

    let emails = ['Not found'];
    let phones = ['Not found'];
    let contactForm = false;
    let websiteServices = null, websiteSize = null, websiteTech = null;
    let pageText = '';

    if (website) {
        const { browser, context } = await createBrowser();
        try {
            const contacts = await getContacts(context, website, logger);
            const normalized = normalizeContacts(contacts);
            emails = normalized.emails;
            phones = normalized.phones;
            contactForm = normalized.contactForm;
            pageText = contacts.pageText || '';
        } finally {
            await context.close();
            await browser.close();
        }

        if (pageText && apiKeys.google_ai_api_key) {
            try {
                const enrichment = await extractWebsiteEnrichment(pageText, companyName, { googleAiApiKey: apiKeys.google_ai_api_key, db });
                if (enrichment && !enrichment.error) {
                    websiteServices = enrichment.services ?? null;
                    websiteSize = enrichment.size ?? null;
                    websiteTech = enrichment.tech ?? null;
                }
            } catch (err) {
                logger.warn({ err: err.message }, 'Website enrichment skipped during sync');
            }
        }
    }

    let iceBreaker = null;
    try {
        iceBreaker = await generateIceBreaker(companyName, null, logger, { googleAiApiKey: apiKeys.google_ai_api_key, db, website: website || undefined });
    } catch (err) {
        logger.warn({ err: err.message }, 'Ice-breaker skipped during sync');
    }

    const status = website ? STATUS.ENRICHED : STATUS.NEW;
    await updateLeadEnrichment(db, leadId, {
        website: website || null,
        emails,
        phones,
        contact_form: contactForm,
        website_services: websiteServices,
        website_size: websiteSize,
        website_tech: websiteTech,
        ice_breaker: iceBreaker,
        status
    });

    return await getLeadById(db, leadId);
}

if (require.main === module) {
    const opts = parseArgs();
    const limitArg = process.argv[2];
    const limit = opts.limit ?? (limitArg ? parseInt(limitArg, 10) : DEFAULT_PIPELINE_LIMIT);
    runPipeline({
        limit: isNaN(limit) ? DEFAULT_PIPELINE_LIMIT : limit,
        inputFile: opts.inputFile,
        source: opts.source,
        onProgress: (msg) => logger.info(msg)
    }).catch((err) => {
        logger.error({ err }, 'Pipeline CLI failed');
        process.exit(1);
    });
}

module.exports = { runPipeline, syncLeadById };
