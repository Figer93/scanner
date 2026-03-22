/**
 * GET /api/companies-house/company/:number — fetch company from Companies House API
 */

const { getDb, initSchema } = require('../services/database');
const { getResolvedKeys } = require('../services/usageTracker');
const { getCompanyByNumber, getOfficers, getPSCs, getCharges } = require('../services/companiesHouse');
const logger = require('../lib/logger');

function mountCompaniesHouse(app) {
    app.get('/api/companies-house/company/:number', async (req, res) => {
        const number = (req.params.number || '').trim();
        if (!number) return res.status(400).json({ error: 'Company number is required' });
        try {
            const db = await getDb();
            const apiKeys = await getResolvedKeys(db);
            const apiKey = apiKeys.companies_house_api_key || '';
            if (!apiKey || !apiKey.trim()) {
                return res.status(400).json({ error: 'Companies House API key is required. Set in Profile or COMPANIES_HOUSE_API_KEY in .env.' });
            }
            const company = await getCompanyByNumber(apiKey, number);
            if (!company) return res.status(404).json({ error: 'Company not found' });
            try {
                const [officers, pscs, chargesCount] = await Promise.all([
                    getOfficers(apiKey, number),
                    getPSCs(apiKey, number),
                    getCharges(apiKey, number)
                ]);
                company.source_metadata = { ...(company.source_metadata || {}), officers, pscs, charges_outstanding_count: chargesCount };
            } catch (detailErr) {
                logger.warn({ err: detailErr.message }, 'Failed to fetch officers/PSCs/charges; returning partial data');
                company.source_metadata = { ...(company.source_metadata || {}), officers: [], pscs: [], charges_outstanding_count: 0 };
            }
            res.json(company);
        } catch (err) {
            logger.error({ err }, 'Failed to get company from Companies House');
            res.status(500).json({ error: 'Failed to retrieve company data' });
        }
    });
}

module.exports = { mountCompaniesHouse };
