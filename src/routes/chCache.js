/**
 * /api/ch-cache/* — Companies House cache (local DB) search and sync
 */

const { getDb, initSchema, getChCacheCount, searchChCache } = require('../services/database');
const { getResolvedKeys, recordUsage } = require('../services/usageTracker');
const { syncFromApi } = require('../services/companiesHouseCache');
const { DEFAULT_DB_PATH } = require('../services/database');
const logger = require('../lib/logger');

function mountChCache(app) {
    app.get('/api/ch-cache/count', async (req, res) => {
        try {
            const db = await getDb(process.env.DB_PATH || DEFAULT_DB_PATH);
            initSchema(db);
            res.json({ count: await getChCacheCount(db) });
        } catch (err) {
            logger.error({ err }, 'Failed to get CH cache count');
            res.status(500).json({ error: 'Failed to retrieve cache count' });
        }
    });

    app.get('/api/ch-cache/search', async (req, res) => {
        try {
            const db = await getDb(process.env.DB_PATH || DEFAULT_DB_PATH);
            initSchema(db);
            const q = req.query.q || '';
            const limit = Math.min(500, parseInt(req.query.limit, 10) || 100);
            const daysBack = req.query.daysBack != null ? parseInt(req.query.daysBack, 10) : undefined;
            const location = req.query.location || undefined;
            const postcode = req.query.postcode || undefined;
            const items = await searchChCache(db, { q: q || undefined, limit, daysBack, location, postcode });
            res.json({ items });
        } catch (err) {
            logger.error({ err }, 'Failed to search CH cache');
            res.status(500).json({ error: 'Failed to search cache' });
        }
    });

    app.post('/api/ch-cache/sync', async (req, res) => {
        try {
            const db = await getDb(process.env.DB_PATH || DEFAULT_DB_PATH);
            initSchema(db);
            const apiKeys = await getResolvedKeys(db);
            const apiKey = apiKeys.companies_house_api_key || process.env.COMPANIES_HOUSE_API_KEY || '';
            if (!apiKey || !apiKey.trim()) {
                return res.status(400).json({ error: 'Companies House API key is required. Set in Profile or COMPANIES_HOUSE_API_KEY in .env.' });
            }
            const body = req.body || {};
            const daysBack = body.daysBack != null ? parseInt(body.daysBack, 10) : 30;
            const limit = body.limit != null ? Math.min(500, parseInt(body.limit, 10)) : 500;
            const fetchFullProfile = body.fetchFullProfile === true;
            const result = await syncFromApi(db, apiKey, { daysBack, limit, fetchFullProfile });
            try {
                recordUsage(db, { service: 'companies_house', endpoint: '/advanced-search/companies', request_count: 1 });
            } catch (usageErr) {
                logger.warn({ err: usageErr.message }, 'Failed to record CH cache usage');
            }
            res.json({ ok: true, synced: result.synced, errors: result.errors });
        } catch (err) {
            logger.error({ err }, 'Failed to sync CH cache');
            res.status(500).json({ error: 'Failed to sync cache' });
        }
    });
}

module.exports = { mountChCache };
