/**
 * /api/db/* — DB stats, bulk enrich, job status, clean invalid emails
 */

const { getDb, initSchema, getDbStats, getLeadIdsByStatus, cleanInvalidEmails, getProfile } = require('../services/database');
const { enrichLead } = require('../services/leadEnrichment');
const { STATUS } = require('../services/database');
const { getLeadById, updateLead } = require('../services/database');
const { getQueueStatusData } = require('../services/emailQueue');
const { backgroundJob } = require('../serverContext');
const { DEFAULT_DB_PATH } = require('../services/database');
const logger = require('../lib/logger');

function mountDb(app) {
    app.get('/api/db/stats', async (req, res) => {
        try {
            const db = await getDb(process.env.DB_PATH || DEFAULT_DB_PATH);
            initSchema(db);
            res.json(await getDbStats(db));
        } catch (err) {
            logger.error({ err }, 'Failed to get DB stats');
            res.status(500).json({ error: 'Failed to retrieve database stats' });
        }
    });

    app.post('/api/db/bulk-enrich-new', async (req, res) => {
        try {
            if (backgroundJob.running) {
                return res.status(409).json({ ok: false, error: 'A background job is already running', job: backgroundJob.job });
            }
            const db = await getDb(process.env.DB_PATH || DEFAULT_DB_PATH);
            initSchema(db);
            const listId = req.body?.listId != null ? parseInt(req.body.listId, 10) : undefined;
            const leadIds = await getLeadIdsByStatus(db, STATUS.NEW, Number.isInteger(listId) && listId >= 1 ? listId : undefined);
            if (leadIds.length === 0) return res.json({ ok: true, jobStarted: false, enriched: 0, message: listId ? 'No new leads in this list to enrich' : 'No new leads to enrich' });
            const delayMs = Math.max(500, parseInt(req.body?.delayMs, 10) || 2000);
            backgroundJob.running = true;
            backgroundJob.job = 'enrich-new';
            backgroundJob.processed = 0;
            backgroundJob.total = leadIds.length;
            backgroundJob.error = null;
            res.status(202).json({ ok: true, jobStarted: true, total: leadIds.length, listId: listId || null, message: 'Enrichment started in background' });
            // NOTE: IIFE intentionally fires after response. Errors captured in backgroundJob.error for polling.
            (async () => {
                try {
                    const dbJob = await getDb(process.env.DB_PATH || DEFAULT_DB_PATH);
                    for (let i = 0; i < leadIds.length; i++) {
                        await enrichLead(dbJob, leadIds[i], { getLeadById, updateLead });
                        backgroundJob.processed = i + 1;
                        if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
                    }
                } catch (err) {
                    logger.error({ err }, 'Background enrichment job failed');
                    backgroundJob.error = err?.message || String(err);
                } finally {
                    backgroundJob.running = false;
                    backgroundJob.job = null;
                    backgroundJob.processed = 0;
                    backgroundJob.total = 0;
                }
            })();
        } catch (err) {
            logger.error({ err }, 'Failed to start bulk enrich');
            res.status(500).json({ error: 'Failed to start enrichment' });
        }
    });

    app.get('/api/db/job-status', (req, res) => {
        res.json({
            running: backgroundJob.running,
            job: backgroundJob.job,
            processed: backgroundJob.processed,
            total: backgroundJob.total,
            error: backgroundJob.error
        });
    });

    app.post('/api/db/clean-invalid-emails', async (req, res) => {
        try {
            const db = await getDb(process.env.DB_PATH || DEFAULT_DB_PATH);
            initSchema(db);
            const listId = req.body?.listId ?? req.query?.listId;
            const id = listId != null ? parseInt(listId, 10) : undefined;
            const { updated } = await cleanInvalidEmails(db, Number.isInteger(id) && id >= 1 ? id : undefined);
            res.json({ ok: true, updated });
        } catch (err) {
            logger.error({ err }, 'Failed to clean invalid emails');
            res.status(500).json({ error: 'Failed to clean emails' });
        }
    });

    app.get('/api/db/queue-status', async (req, res) => {
        try {
            const db = await getDb(process.env.DB_PATH || DEFAULT_DB_PATH);
            initSchema(db);
            const profile = await getProfile(db);
            res.json(await getQueueStatusData(db, profile));
        } catch (err) {
            logger.error({ err }, 'Failed to get queue status');
            res.status(500).json({ error: 'Failed to retrieve queue status' });
        }
    });
}

module.exports = { mountDb };
