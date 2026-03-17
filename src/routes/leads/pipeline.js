/**
 * POST /api/run — trigger the lead enrichment pipeline.
 */

const { getDb, setProfileKey, getScoreDistribution } = require('../../services/database');
const { runPipeline } = require('../../index');
const { persistAndEmitLog } = require('../../serverContext');
const { validate } = require('../../middleware/validate');
const logger = require('../../lib/logger');
const { pipelineRunSchema } = require('../../schemas/leads');

function mountLeadsPipeline(app) {
    app.post('/api/run', validate(pipelineRunSchema), async (req, res) => {
        const { limit, source, inputFile, googleMapsKeyword, googleMapsLocation, linkedInCompanyNames, daysBack } = req.body;
        try {
            const summary = await runPipeline({
                limit,
                inputFile,
                source,
                googleMapsKeyword,
                googleMapsLocation,
                linkedInCompanyNames,
                daysBack,
                onProgress: (message) => persistAndEmitLog(message),
            });
            const db = await getDb();
            const lastRun = {
                at: new Date().toISOString(),
                source,
                limit,
                inserted: summary?.inserted ?? 0,
                updated: summary?.updated ?? 0,
                enriched: summary?.enriched ?? 0,
            };
            setProfileKey(db, 'last_pipeline_run', JSON.stringify(lastRun));
            const scoreDist = getScoreDistribution(db);
            res.json({ ok: true, summary: { ...(summary || {}), scoredHigh: scoreDist.high } });
        } catch (err) {
            persistAndEmitLog('ERROR: ' + (err.message || String(err)));
            logger.error({ err }, 'Pipeline run failed');
            res.status(500).json({ ok: false, error: 'Pipeline run failed' });
        }
    });
}

module.exports = { mountLeadsPipeline };
