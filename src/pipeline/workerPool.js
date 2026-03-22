/**
 * In-process worker pool for deep enrichment with rate limits and Playwright concurrency cap.
 */

const { chromium } = require('playwright');
const logger = require('../lib/logger');
const { getProfile } = require('../services/database');
const { runEnrichmentForLead } = require('./enrichmentOrchestrator');
const { TokenBucket, ConcurrencySemaphore } = require('./tokenBucket');

/**
 * Reset leads stuck in running after a crash.
 * @param {import('../db/connection').Db} db
 */
async function recoverStaleEnrichmentLeads(db) {
    try {
        await db.run(`UPDATE leads SET enrichment_status = 'pending' WHERE enrichment_status = 'running'`);
    } catch (err) {
        logger.warn({ err: err.message }, 'recoverStaleEnrichmentLeads');
    }
}

/**
 * @param {{
 *   db: import('../db/connection').Db,
 *   io: import('socket.io').Server | null,
 *   jobId: string | null,
 *   leadIds: number[],
 *   concurrency: number,
 *   profile?: Record<string, string>,
 * }} opts
 */
async function runWorkerPool(opts) {
    const { db, io, jobId, leadIds, concurrency } = opts;
    const hasJob = Boolean(jobId);
    let profile = opts.profile || (await getProfile(db));

    const serperBucket = new TokenBucket(2);
    const apifyBucket = new TokenBucket(1);
    const playwrightSemaphore = new ConcurrencySemaphore(3);

    const serperAcquire = () => serperBucket.acquire();
    const apifyAcquire = () => apifyBucket.acquire();

    let browserSingleton = null;
    async function getBrowser() {
        if (!browserSingleton) {
            browserSingleton = await chromium.launch({ headless: true });
        }
        return browserSingleton;
    }

    const delayMs = Math.max(0, parseInt(profile.delay_between_companies_ms || '500', 10) || 500);

    await recoverStaleEnrichmentLeads(db);

    if (io) {
        io.emit('enrichment:start', { jobId: jobId || 'adhoc', total: leadIds.length });
    }

    const queue = leadIds.slice();
    const conc = Math.max(1, Math.min(20, concurrency || 10));

    async function processLead(leadId) {
        if (hasJob) {
            const jobRow = await db.queryOne('SELECT status FROM enrichment_jobs WHERE id = $1::uuid', [jobId]);
            if (!jobRow || jobRow.status === 'cancelled') return { skipped: true };

            let status = jobRow.status;
            while (status === 'paused') {
                await new Promise((r) => setTimeout(r, 400));
                const j = await db.queryOne('SELECT status FROM enrichment_jobs WHERE id = $1::uuid', [jobId]);
                if (!j || j.status === 'cancelled') return { skipped: true };
                status = j.status;
            }
        }

        try {
            const result = await runEnrichmentForLead({
                db,
                jobId,
                leadId,
                profile,
                limits: { serperAcquire, apifyAcquire, playwrightSemaphore, getBrowser },
                io,
            });
            if (!result.ok) {
                if (hasJob) await db.run(`UPDATE enrichment_jobs SET failed_count = failed_count + 1 WHERE id = $1::uuid`, [jobId]);
                await db.run(`UPDATE leads SET enrichment_status = $1 WHERE id = $2`, ['failed', leadId]);
                return { failed: true };
            }
            if (hasJob) await db.run(`UPDATE enrichment_jobs SET processed = processed + 1 WHERE id = $1::uuid`, [jobId]);
            return { ok: true };
        } catch (err) {
            logger.error({ err: err.message, leadId, jobId }, 'enrichment worker failed');
            try {
                if (hasJob) await db.run(`UPDATE enrichment_jobs SET failed_count = failed_count + 1 WHERE id = $1::uuid`, [jobId]);
                await db.run(`UPDATE leads SET enrichment_status = $1 WHERE id = $2`, ['failed', leadId]);
            } catch (e2) {
                logger.warn({ err: e2.message }, 'failed to mark lead failed');
            }
            if (io) io.emit('enrichment:error', { leadId, stage: 'worker', error: err.message || String(err) });
            return { failed: true };
        }
    }

    async function worker() {
        while (queue.length > 0) {
            if (hasJob) {
                const jobCheck = await db.queryOne('SELECT status FROM enrichment_jobs WHERE id = $1::uuid', [jobId]);
                if (!jobCheck || jobCheck.status === 'cancelled') break;
            }

            const leadId = queue.shift();
            if (leadId == null) break;

            if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));

            await processLead(leadId);

            if (hasJob) {
                const row = await db.queryOne(
                    'SELECT processed, failed_count, total_companies FROM enrichment_jobs WHERE id = $1::uuid',
                    [jobId]
                );
                if (io && row) {
                    io.emit('pipeline:progress', {
                        jobId,
                        processed: (row.processed || 0) + (row.failed_count || 0),
                        total: row.total_companies || leadIds.length,
                        failed: row.failed_count || 0,
                    });
                }
            }
        }
    }

    const workers = Array.from({ length: conc }, () => worker());
    await Promise.allSettled(workers);

    if (hasJob) {
        try {
            await db.run(
                `UPDATE enrichment_jobs SET status = 'done', completed_at = CURRENT_TIMESTAMP WHERE id = $1::uuid AND status NOT IN ('cancelled')`,
                [jobId]
            );
        } catch (err) {
            logger.warn({ err: err.message }, 'finalize enrichment job');
        }
    }
}

module.exports = { runWorkerPool, recoverStaleEnrichmentLeads };
