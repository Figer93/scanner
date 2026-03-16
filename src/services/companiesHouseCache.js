/**
 * Companies House cache: local DB of CH data for instant search.
 * - Sync: fetch from Companies House API and upsert into ch_cache (run anytime via script or API).
 * - When fetchFullProfile is true, each company is enriched with GET /company/{number} (full profile).
 * - Search: query ch_cache for near-instant results; pipeline uses this instead of live API.
 */

const { fetchCompanies, getCompanyByNumber, getOfficers, getPSCs, getCharges } = require('./companiesHouse');
const { upsertChCache, searchChCache } = require('./database');

const FULL_PROFILE_DELAY_MS = 150;

/**
 * Sync Companies House data into the local cache by calling the CH API and upserting results.
 * When fetchFullProfile is true, fetches full company profile (GET /company/{number}) for each
 * search result and stores that in raw_json (accounts, confirmation_statement, sic_codes, etc.).
 * @param {{ query: Function, queryOne: Function, run: Function }} db - Database adapter
 * @param {string} apiKey - Companies House API key
 * @param {{
 *   daysBack?: number,
 *   limit?: number,
 *   companyType?: string,
 *   companyStatus?: string,
 *   sicCode?: string,
 *   location?: string,
 *   fetchFullProfile?: boolean
 * }} [options]
 * @returns {Promise<{ synced: number, errors: string[] }>}
 */
async function syncFromApi(db, apiKey, options = {}) {
    const errors = [];
    let synced = 0;
    const fetchFullProfile = !!options.fetchFullProfile;
    try {
        const companies = await fetchCompanies({
            apiKey,
            daysBack: options.daysBack ?? 30,
            limit: options.limit ?? 500,
            companyType: options.companyType,
            companyStatus: options.companyStatus,
            sicCode: options.sicCode,
            location: options.location
        });
        for (let i = 0; i < companies.length; i++) {
            const c = companies[i];
            try {
                let meta = c.source_metadata || {};
                let companyName = c.name;
                let address = c.address || null;
                let postcode = c.postcode || null;
                let dateOfCreation = meta.date_of_creation || meta.dateOfCreation || null;

                if (fetchFullProfile && c.number) {
                    const full = await getCompanyByNumber(apiKey, c.number);
                    if (full && full.source_metadata) {
                        meta = full.source_metadata;
                        companyName = full.name;
                        address = full.address || null;
                        postcode = full.postcode || null;
                        dateOfCreation = meta.date_of_creation || meta.dateOfCreation || null;
                    }
                    try {
                        const [officers, pscs, chargesCount] = await Promise.all([
                            getOfficers(apiKey, c.number),
                            getPSCs(apiKey, c.number),
                            getCharges(apiKey, c.number)
                        ]);
                        meta = { ...meta, officers, pscs, charges_outstanding_count: chargesCount };
                    } catch (e) {
                        meta = { ...meta, officers: meta.officers || [], pscs: meta.pscs || [], charges_outstanding_count: meta.charges_outstanding_count ?? 0 };
                    }
                    if (i < companies.length - 1) {
                        await new Promise((r) => setTimeout(r, FULL_PROFILE_DELAY_MS));
                    }
                } else {
                    dateOfCreation = dateOfCreation ? String(dateOfCreation).slice(0, 10) : null;
                }

                if (!dateOfCreation && meta.date_of_creation) {
                    dateOfCreation = String(meta.date_of_creation).slice(0, 10);
                }
                dateOfCreation = dateOfCreation ? String(dateOfCreation).slice(0, 10) : null;

                await upsertChCache(db, {
                    company_number: c.number,
                    company_name: companyName,
                    address,
                    postcode,
                    date_of_creation: dateOfCreation,
                    raw_json: meta
                });
                synced++;
            } catch (e) {
                errors.push(`${c.number}: ${e.message}`);
            }
        }
    } catch (e) {
        errors.push(e.message || String(e));
    }
    return { synced, errors };
}

/**
 * Search the local CH cache. Returns the same shape as fetchCompanies for pipeline compatibility.
 * Use this in the pipeline instead of calling the live API.
 * @param {{ query: Function, queryOne: Function, run: Function }} db - Database adapter
 * @param {{
 *   q?: string,
 *   limit?: number,
 *   daysBack?: number,
 *   location?: string,
 *   postcode?: string
 * }} [options]
 * @returns {Array<{ name: string, number: string, address: string, postcode: string, source_metadata?: object }>}
 */
async function search(db, options = {}) {
    return await searchChCache(db, {
        q: options.q,
        limit: options.limit ?? 100,
        daysBack: options.daysBack,
        location: options.location,
        postcode: options.postcode
    });
}

module.exports = {
    syncFromApi,
    search
};
