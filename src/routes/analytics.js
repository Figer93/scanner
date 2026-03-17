/**
 * /api/analytics/* — funnel, cost-per-lead, score distribution, last run, list analytics
 */

const { getDb, initSchema, getFunnelStats, getCostPerLeadStats, getScoreDistribution, getProfile, getListById, getListAnalytics, getRecentActivity, getEmailPerformance } = require('../services/database');
const logger = require('../lib/logger');

function mountAnalytics(app) {
    app.get('/api/analytics/funnel', async (req, res) => {
        try {
            const db = await getDb();
            res.json(await getFunnelStats(db));
        } catch (err) {
            logger.error({ err }, 'Failed to get funnel stats');
            res.status(500).json({ error: 'Failed to retrieve funnel stats' });
        }
    });

    app.get('/api/analytics/cost-per-lead', async (req, res) => {
        try {
            const db = await getDb();
            res.json(await getCostPerLeadStats(db));
        } catch (err) {
            logger.error({ err }, 'Failed to get cost-per-lead stats');
            res.status(500).json({ error: 'Failed to retrieve cost-per-lead stats' });
        }
    });

    app.get('/api/analytics/score-distribution', async (req, res) => {
        try {
            const db = await getDb();
            res.json(await getScoreDistribution(db));
        } catch (err) {
            logger.error({ err }, 'Failed to get score distribution');
            res.status(500).json({ error: 'Failed to retrieve score distribution' });
        }
    });

    app.get('/api/analytics/last-pipeline-run', async (req, res) => {
        try {
            const db = await getDb();
            const profile = getProfile(db);
            const raw = profile.last_pipeline_run;
            if (!raw) return res.json(null);
            res.json(JSON.parse(raw));
        } catch (err) {
            logger.warn({ err }, 'Failed to get last pipeline run');
            res.json(null);
        }
    });

    app.get('/api/analytics/recent-activity', async (req, res) => {
        try {
            const db = await getDb();
            initSchema(db);
            const limit = Math.min(parseInt(req.query.limit, 10) || 5, 20);
            res.json(await getRecentActivity(db, limit));
        } catch (err) {
            logger.error({ err }, 'Failed to get recent activity');
            res.status(500).json({ error: 'Failed to retrieve recent activity' });
        }
    });

    app.get('/api/analytics/email-performance', async (req, res) => {
        try {
            const db = await getDb();
            initSchema(db);
            const days = Math.min(parseInt(req.query.days, 10) || 30, 365);
            res.json(await getEmailPerformance(db, days));
        } catch (err) {
            logger.error({ err }, 'Failed to get email performance');
            res.status(500).json({ error: 'Failed to retrieve email performance' });
        }
    });

    app.get('/api/analytics/lists/:listId', async (req, res) => {
        const listId = parseInt(req.params.listId, 10);
        if (isNaN(listId) || listId < 1) return res.status(400).json({ error: 'Invalid list id' });
        try {
            const db = await getDb();
            initSchema(db);
            const list = await getListById(db, listId);
            if (!list) return res.status(404).json({ error: 'List not found' });
            res.json(await getListAnalytics(db, listId));
        } catch (err) {
            logger.error({ err }, 'Failed to get list analytics');
            res.status(500).json({ error: 'Failed to retrieve list analytics' });
        }
    });
}

module.exports = { mountAnalytics };
