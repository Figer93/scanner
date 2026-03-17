/**
 * GET/POST /api/schedule — scheduled pipeline run config
 */

const { getDb, getProfile, setProfileKey } = require('../services/database');
const logger = require('../lib/logger');

function mountSchedule(app, context = {}) {
    const { startScheduledRuns } = context;

    app.get('/api/schedule', async (req, res) => {
        try {
            const db = await getDb();
            const profile = await getProfile(db);
            res.json({
                cron: profile.scheduled_run_cron || process.env.CRON_SCHEDULE || '',
                source: profile.scheduled_run_source || process.env.SCHEDULED_RUN_SOURCE || 'companies_house',
                limit: parseInt(profile.scheduled_run_limit || process.env.SCHEDULED_RUN_LIMIT || '20', 10) || 20
            });
        } catch (err) {
            logger.error({ err }, 'Failed to get schedule');
            res.status(500).json({ error: 'Failed to retrieve schedule' });
        }
    });

    app.post('/api/schedule', async (req, res) => {
        const body = req.body || {};
        const cronExpr = (body.cron !== undefined ? body.cron : '').toString().trim();
        const cron = require('node-cron');
        if (body.cron !== undefined && cronExpr && !cron.validate(cronExpr)) {
            return res.status(400).json({ error: 'Invalid cron expression (e.g. "0 9 * * *" for daily at 9am)' });
        }
        try {
            const db = await getDb();
            if (body.cron !== undefined) await setProfileKey(db, 'scheduled_run_cron', cronExpr);
            if (body.source !== undefined) await setProfileKey(db, 'scheduled_run_source', body.source);
            if (body.limit !== undefined) await setProfileKey(db, 'scheduled_run_limit', String(body.limit));
            if (typeof startScheduledRuns === 'function') await startScheduledRuns();
            res.json({ ok: true });
        } catch (err) {
            logger.error({ err }, 'Failed to save schedule');
            res.status(500).json({ error: 'Failed to save schedule' });
        }
    });
}

module.exports = { mountSchedule };
