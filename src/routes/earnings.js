/**
 * /api/earnings — monthly overview, weekly chart data, top templates.
 * Phase 3A Earnings Tracker.
 */

const { getDb, initSchema, getProfile, getEarningsMonthly, getEarningsWeekly, getEarningsTopTemplates } = require('../services/database');
const { authenticate } = require('../middleware/authenticate');
const logger = require('../lib/logger');

function mountEarnings(app) {
    app.get('/api/earnings', authenticate, async (req, res) => {
        try {
            const db = await getDb();
            initSchema(db);
            const profile = await getProfile(db);

            const overview = await getEarningsMonthly(db, profile);
            const weekly = await getEarningsWeekly(db, 12);
            const conversionPct = overview.conversionRatePct ?? 15;
            const topTemplates = await getEarningsTopTemplates(db, 10, conversionPct);

            res.json({
                overview,
                weekly,
                topTemplates,
            });
        } catch (err) {
            logger.error({ err }, 'Failed to get earnings');
            res.status(500).json({ error: 'Failed to retrieve earnings' });
        }
    });
}

module.exports = { mountEarnings };
