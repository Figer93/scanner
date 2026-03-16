/**
 * /api/usage — usage stats and log
 */

const { getDb, DEFAULT_DB_PATH } = require('../services/database');
const { getUsageStats, getUsageLog } = require('../services/usageTracker');
const logger = require('../lib/logger');

function mountUsage(app) {
    app.get('/api/usage', async (req, res) => {
        try {
            const db = await getDb(process.env.DB_PATH || DEFAULT_DB_PATH);
            res.json(await getUsageStats(db));
        } catch (err) {
            logger.error({ err }, 'Failed to get usage stats');
            res.status(500).json({ error: 'Failed to retrieve usage stats' });
        }
    });

    app.get('/api/usage/log', async (req, res) => {
        try {
            const db = await getDb(process.env.DB_PATH || DEFAULT_DB_PATH);
            const page = parseInt(req.query.page, 10) || 1;
            const limit = Math.min(100, parseInt(req.query.limit, 10) || 50);
            res.json(await getUsageLog(db, { page, limit }));
        } catch (err) {
            logger.error({ err }, 'Failed to get usage log');
            res.status(500).json({ error: 'Failed to retrieve usage log' });
        }
    });
}

module.exports = { mountUsage };
