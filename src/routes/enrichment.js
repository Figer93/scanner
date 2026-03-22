/**
 * /api/enrichment — deep enrichment jobs, logs, stats.
 */

const { z } = require('zod');
const { getDb, initSchema, getProfile } = require('../services/database');
const { authenticate } = require('../middleware/authenticate');
const { validate } = require('../middleware/validate');
const logger = require('../lib/logger');
const {
    backgroundJob,
    getIo,
    setDeepEnrichmentRunning,
    isDeepEnrichmentRunning,
} = require('../serverContext');
const { runChBulkImport } = require('../pipeline/chBulkImport');
const { runWorkerPool } = require('../pipeline/workerPool');
const { ensureEnrichmentSchema } = require('../db/enrichmentBootstrap');

/** True when Postgres reports missing table/column (migration not applied and bootstrap skipped/failed). */
function isMissingEnrichmentRelation(err) {
    if (!err) return false;
    if (err.code === '42P01' || err.code === '42703') return true;
    const msg = String(err.message || '');
    return /relation .+ does not exist/i.test(msg) || /column .+ does not exist/i.test(msg);
}

let enrichmentSchemaReady = false;
/** @type {Promise<void> | null} */
let enrichmentSchemaPromise = null;

async function ensureEnrichmentReady(db) {
    if (enrichmentSchemaReady) return;
    if (!enrichmentSchemaPromise) {
        enrichmentSchemaPromise = ensureEnrichmentSchema(db)
            .then(() => {
                enrichmentSchemaReady = true;
            })
            .catch((e) => {
                enrichmentSchemaPromise = null;
                throw e;
            });
    }
    await enrichmentSchemaPromise;
}

const startJobSchema = z
    .object({
        filters: z
            .object({
                sicCodes: z.array(z.string()).optional(),
                incorporatedFrom: z.string().optional(),
                incorporatedTo: z.string().optional(),
                companyStatus: z.string().optional(),
                jurisdiction: z.string().optional(),
            })
            .optional()
            .default({}),
        concurrency: z.coerce.number().int().min(1).max(20).optional().default(10),
    })
    .strict();

const retrySchema = z
    .object({
        leadIds: z.array(z.coerce.number().int().positive()),
        jobId: z.string().uuid().optional(),
        concurrency: z.coerce.number().int().min(1).max(20).optional().default(10),
    })
    .strict();

const uuidParam = z.object({
    id: z.string().uuid(),
});

function defaultIncorporationRange() {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 30);
    return {
        incorporatedFrom: from.toISOString().slice(0, 10),
        incorporatedTo: to.toISOString().slice(0, 10),
    };
}

function mountEnrichment(app, context = {}) {
    const io = context.io || getIo();

    app.post('/api/enrichment/jobs', authenticate, validate(startJobSchema), async (req, res) => {
        try {
            const db0 = await getDb();
            await ensureEnrichmentReady(db0);

            if (backgroundJob.running || isDeepEnrichmentRunning()) {
                return res.status(409).json({ error: 'Another background or enrichment job is already running' });
            }
            const db = db0;
            initSchema(db);
            const profile = await getProfile(db);
            const chKey = (profile.companies_house_api_key || process.env.COMPANIES_HOUSE_API_KEY || '').trim();
            if (!chKey) {
                return res.status(400).json({ error: 'Companies House API key required (profile or COMPANIES_HOUSE_API_KEY)' });
            }

            const { filters: rawFilters, concurrency } = req.body || {};
            const defaults = defaultIncorporationRange();
            const filters = {
                ...rawFilters,
                incorporatedFrom: rawFilters?.incorporatedFrom || defaults.incorporatedFrom,
                incorporatedTo: rawFilters?.incorporatedTo || defaults.incorporatedTo,
                companyStatus: rawFilters?.companyStatus === 'all' ? 'all' : rawFilters?.companyStatus || 'active',
            };

            const row = await db.queryOne(
                `INSERT INTO enrichment_jobs (status, concurrency, filters, started_at)
                 VALUES ('running', $1, $2::jsonb, CURRENT_TIMESTAMP)
                 RETURNING id`,
                [concurrency, JSON.stringify(filters)]
            );
            const jobId = row && row.id ? String(row.id) : null;
            if (!jobId) {
                return res.status(500).json({ error: 'Failed to create job' });
            }

            res.status(202).json({ ok: true, jobId, message: 'Enrichment job started' });

            setDeepEnrichmentRunning(true);
            (async () => {
                try {
                    const { leadIds } = await runChBulkImport({
                        db,
                        apiKey: chKey,
                        filters,
                        jobId,
                        io,
                    });
                    if (leadIds.length === 0) {
                        await db.run(
                            `UPDATE enrichment_jobs SET status = 'done', completed_at = CURRENT_TIMESTAMP, total_companies = 0 WHERE id = $1::uuid`,
                            [jobId]
                        );
                        return;
                    }
                    await runWorkerPool({
                        db,
                        io,
                        jobId,
                        leadIds,
                        concurrency,
                        profile,
                    });
                } catch (err) {
                    logger.error({ err: err.message, jobId }, 'enrichment job failed');
                    try {
                        await db.run(
                            `UPDATE enrichment_jobs SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE id = $1::uuid`,
                            [jobId]
                        );
                    } catch (e2) {
                        logger.warn({ err: e2.message }, 'mark job failed');
                    }
                } finally {
                    setDeepEnrichmentRunning(false);
                }
            })().catch((err) => logger.error({ err }, 'enrichment async'));
        } catch (err) {
            logger.error({ err: err.message, code: err.code }, 'POST /api/enrichment/jobs');
            if (isMissingEnrichmentRelation(err)) {
                return res.status(503).json({
                    error: 'Enrichment database objects are missing. Redeploy the app or run db/migrations/005_deep_enrichment.sql in Supabase.',
                });
            }
            res.status(500).json({ error: 'Failed to start job' });
        }
    });

    app.get('/api/enrichment/jobs', authenticate, async (req, res) => {
        try {
            const db = await getDb();
            await ensureEnrichmentReady(db);
            const rows = await db.query(
                `SELECT id, status, total_companies, processed, failed_count, concurrency, filters, created_at, started_at, completed_at
                 FROM enrichment_jobs ORDER BY created_at DESC LIMIT 20`
            );
            res.json({ jobs: rows });
        } catch (err) {
            logger.error({ err: err.message, code: err.code }, 'GET /api/enrichment/jobs');
            if (isMissingEnrichmentRelation(err)) {
                return res.json({ jobs: [] });
            }
            res.status(500).json({ error: 'Failed to list jobs' });
        }
    });

    app.get('/api/enrichment/jobs/:id', authenticate, async (req, res) => {
        try {
            const parsed = uuidParam.safeParse({ id: req.params.id });
            if (!parsed.success) return res.status(400).json({ error: 'Invalid job id' });
            const db = await getDb();
            await ensureEnrichmentReady(db);
            const job = await db.queryOne(
                `SELECT id, status, total_companies, processed, failed_count, concurrency, filters, created_at, started_at, completed_at
                 FROM enrichment_jobs WHERE id = $1::uuid`,
                [parsed.data.id]
            );
            if (!job) return res.status(404).json({ error: 'Job not found' });
            res.json({ job });
        } catch (err) {
            logger.error({ err }, 'GET /api/enrichment/jobs/:id');
            res.status(500).json({ error: 'Failed to load job' });
        }
    });

    app.get('/api/enrichment/jobs/:id/leads', authenticate, async (req, res) => {
        try {
            const parsed = uuidParam.safeParse({ id: req.params.id });
            if (!parsed.success) return res.status(400).json({ error: 'Invalid job id' });
            const db = await getDb();
            const job = await db.queryOne('SELECT filters FROM enrichment_jobs WHERE id = $1::uuid', [parsed.data.id]);
            if (!job) return res.status(404).json({ error: 'Job not found' });
            let leadIds = [];
            try {
                const f = typeof job.filters === 'string' ? JSON.parse(job.filters) : job.filters;
                leadIds = Array.isArray(f?.leadIds) ? f.leadIds.map((n) => parseInt(n, 10)).filter((x) => Number.isInteger(x)) : [];
            } catch (_) {
                leadIds = [];
            }
            if (leadIds.length === 0) return res.json({ leads: [] });
            const placeholders = leadIds.map((_, i) => `$${i + 1}`).join(',');
            const rows = await db.query(
                `SELECT id, company_name, company_number, website, website_status, emails, phones, linkedin_url,
                        enrichment_score, enrichment_status, enriched_at
                 FROM leads WHERE id IN (${placeholders}) ORDER BY id`,
                leadIds
            );
            const leads = rows.map((row) => {
                let emails = [];
                let phones = [];
                try {
                    emails = JSON.parse(row.emails || '[]');
                } catch (_) {}
                try {
                    phones = JSON.parse(row.phones || '[]');
                } catch (_) {}
                return {
                    ...row,
                    emails,
                    phones,
                };
            });
            res.json({ leads });
        } catch (err) {
            logger.error({ err }, 'GET /api/enrichment/jobs/:id/leads');
            res.status(500).json({ error: 'Failed to load job leads' });
        }
    });

    app.post('/api/enrichment/jobs/:id/pause', authenticate, async (req, res) => {
        try {
            const db = await getDb();
            await ensureEnrichmentReady(db);
            await db.run(`UPDATE enrichment_jobs SET status = 'paused' WHERE id = $1::uuid`, [req.params.id]);
            res.json({ ok: true });
        } catch (err) {
            logger.error({ err }, 'pause job');
            res.status(500).json({ error: 'Failed to pause' });
        }
    });

    app.post('/api/enrichment/jobs/:id/resume', authenticate, async (req, res) => {
        try {
            const db = await getDb();
            await ensureEnrichmentReady(db);
            await db.run(`UPDATE enrichment_jobs SET status = 'running' WHERE id = $1::uuid`, [req.params.id]);
            res.json({ ok: true });
        } catch (err) {
            logger.error({ err }, 'resume job');
            res.status(500).json({ error: 'Failed to resume' });
        }
    });

    app.post('/api/enrichment/jobs/:id/cancel', authenticate, async (req, res) => {
        try {
            const db = await getDb();
            await ensureEnrichmentReady(db);
            await db.run(`UPDATE enrichment_jobs SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP WHERE id = $1::uuid`, [
                req.params.id,
            ]);
            res.json({ ok: true });
        } catch (err) {
            logger.error({ err }, 'cancel job');
            res.status(500).json({ error: 'Failed to cancel' });
        }
    });

    app.post('/api/enrichment/retry', authenticate, validate(retrySchema), async (req, res) => {
        try {
            if (backgroundJob.running || isDeepEnrichmentRunning()) {
                return res.status(409).json({ error: 'Another job is already running' });
            }
            const { leadIds, jobId, concurrency } = req.body || {};
            if (!leadIds || leadIds.length === 0) {
                return res.status(400).json({ error: 'leadIds required' });
            }
            const db0 = await getDb();
            await ensureEnrichmentReady(db0);
            const db = db0;
            const profile = await getProfile(db);
            res.status(202).json({ ok: true, message: 'Retry queued' });

            setDeepEnrichmentRunning(true);
            (async () => {
                try {
                    await runWorkerPool({
                        db,
                        io,
                        jobId: jobId || null,
                        leadIds,
                        concurrency,
                        profile,
                    });
                } catch (err) {
                    logger.error({ err: err.message }, 'retry enrichment failed');
                } finally {
                    setDeepEnrichmentRunning(false);
                }
            })().catch((err) => logger.error({ err }, 'retry async'));
        } catch (err) {
            logger.error({ err }, 'POST /api/enrichment/retry');
            res.status(500).json({ error: 'Failed to retry' });
        }
    });

    app.get('/api/enrichment/leads/:id/log', authenticate, async (req, res) => {
        try {
            const leadId = parseInt(req.params.id, 10);
            if (!Number.isInteger(leadId) || leadId < 1) {
                return res.status(400).json({ error: 'Invalid lead id' });
            }
            const db = await getDb();
            await ensureEnrichmentReady(db);
            const rows = await db.query(
                `SELECT id, lead_id, job_id, stage, status, duration_ms, detail, created_at
                 FROM enrichment_logs WHERE lead_id = $1 ORDER BY created_at ASC`,
                [leadId]
            );
            res.json({ logs: rows });
        } catch (err) {
            logger.error({ err }, 'GET enrichment log');
            res.status(500).json({ error: 'Failed to load logs' });
        }
    });

    app.get('/api/enrichment/stats', authenticate, async (req, res) => {
        try {
            const db = await getDb();
            await ensureEnrichmentReady(db);
            const queueRow = await db.queryOne(
                `SELECT COUNT(*)::int AS c FROM leads WHERE enrichment_status IN ('pending', 'running')`
            );
            const processingRow = await db.queryOne(`SELECT COUNT(*)::int AS c FROM leads WHERE enrichment_status = 'running'`);
            const doneToday = await db.queryOne(
                `SELECT COUNT(*)::int AS c FROM leads WHERE enriched_at IS NOT NULL AND enriched_at >= CURRENT_DATE`
            );
            const failedRow = await db.queryOne(`SELECT COUNT(*)::int AS c FROM leads WHERE enrichment_status = 'failed'`);
            const totalDone = await db.queryOne(
                `SELECT COUNT(*)::int AS c FROM leads WHERE enrichment_status IN ('enriched', 'enriched_partial')`
            );
            const q = queueRow?.c || 0;
            const proc = processingRow?.c || 0;
            const fail = failedRow?.c || 0;
            const done = totalDone?.c || 0;
            const today = doneToday?.c || 0;
            const denom = done + fail;
            const successRate = denom > 0 ? Math.round((done / denom) * 1000) / 10 : null;

            const activeJob = await db.queryOne(
                `SELECT concurrency, processed, total_companies, status FROM enrichment_jobs WHERE status IN ('running', 'paused') ORDER BY created_at DESC LIMIT 1`
            );

            res.json({
                queue: q,
                processingNow: proc,
                completedToday: today,
                failed: fail,
                successRate,
                activeWorkers: proc,
                totalWorkers: activeJob?.concurrency || 0,
                activeJob: activeJob || null,
            });
        } catch (err) {
            logger.error({ err: err.message, code: err.code }, 'GET /api/enrichment/stats');
            if (isMissingEnrichmentRelation(err)) {
                return res.json({
                    queue: 0,
                    processingNow: 0,
                    completedToday: 0,
                    failed: 0,
                    successRate: null,
                    activeWorkers: 0,
                    totalWorkers: 0,
                    activeJob: null,
                });
            }
            res.status(500).json({ error: 'Failed to load stats' });
        }
    });
}

module.exports = { mountEnrichment };
