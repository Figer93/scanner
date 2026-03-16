/**
 * AI-driven lead actions: score, outreach draft, sync, enrich.
 * All routes are POST /api/leads/:id/<action>.
 */

const { getDb, initSchema, getLeadById, updateLead, addLeadActivity, getProfile, DEFAULT_DB_PATH } = require('../../services/database');
const { getResolvedKeys } = require('../../services/usageTracker');
const { scoreLead, generateOutreachDraft } = require('../../services/ai');
const { syncLeadById } = require('../../index');
const { enrichLead } = require('../../services/leadEnrichment');
const { persistAndEmitLog, fireWebhookIfConfigured } = require('../../serverContext');
const { validateParams } = require('../../middleware/validate');
const logger = require('../../lib/logger');
const { leadIdParamsSchema } = require('../../schemas/leads');

function resolveDbPath() {
    return process.env.DB_PATH || DEFAULT_DB_PATH;
}

function mountLeadsAi(app) {
    app.post('/api/leads/:id/score', validateParams(leadIdParamsSchema), async (req, res) => {
        const { id } = req.params;
        try {
            const db = await getDb(resolveDbPath());
            const lead = await getLeadById(db, id);
            if (!lead) return res.status(404).json({ error: 'Lead not found' });
            const profile = await getProfile(db);
            const criteria = profile.lead_scoring_criteria || process.env.LEAD_SCORING_CRITERIA || 'B2B fit, has contact info, UK-based';
            const apiKeys = await getResolvedKeys(db);
            const result = await scoreLead(lead, criteria, null, { googleAiApiKey: apiKeys.google_ai_api_key, db });
            if (result.error) return res.status(502).json({ error: result.error });
            updateLead(db, id, {
                score: result.score,
                score_reasoning: result.reason ?? null,
                score_breakdown: result.breakdown ?? null,
            });
            addLeadActivity(db, id, 'scored', `Score: ${result.score}/10${result.reason ? ' – ' + result.reason : ''}`);
            const updated = await getLeadById(db, id);
            if (updated) await fireWebhookIfConfigured(db, updated, 'score', { reason: result.reason }).catch(() => {});
            res.json({ ok: true, score: result.score, reason: result.reason ?? null });
        } catch (err) {
            logger.error({ err }, 'Scoring failed');
            res.status(500).json({ error: 'Scoring failed' });
        }
    });

    app.post('/api/leads/:id/outreach-draft', validateParams(leadIdParamsSchema), async (req, res) => {
        const { id } = req.params;
        try {
            const db = await getDb(resolveDbPath());
            const lead = await getLeadById(db, id);
            if (!lead) return res.status(404).json({ error: 'Lead not found' });
            const apiKeys = await getResolvedKeys(db);
            const result = await generateOutreachDraft(lead, null, { googleAiApiKey: apiKeys.google_ai_api_key, db });
            if (result.error) return res.status(502).json({ error: result.error });
            updateLead(db, id, { outreach_draft: result.draft });
            addLeadActivity(db, id, 'email_sent', 'Outreach draft generated');
            res.json({ ok: true, draft: result.draft });
        } catch (err) {
            logger.error({ err }, 'Draft generation failed');
            res.status(500).json({ error: 'Draft generation failed' });
        }
    });

    app.post('/api/leads/:id/sync', validateParams(leadIdParamsSchema), async (req, res) => {
        const { id } = req.params;
        try {
            const db = await getDb(resolveDbPath());
            initSchema(db);
            const lead = await getLeadById(db, id);
            if (!lead) return res.status(404).json({ error: 'Lead not found' });
            const apiKeys = await getResolvedKeys(db);
            const syncLog = (msg) => persistAndEmitLog(
                typeof msg === 'object' && msg.msg != null
                    ? `[Sync ${lead.company_name}] ${msg.msg}`
                    : `[Sync] ${msg}`
            );
            const syncLogger = { info: syncLog, warn: syncLog, error: syncLog };
            const updated = await syncLeadById(db, id, { logger: syncLogger, apiKeys });
            if (!updated) return res.status(404).json({ error: 'Lead not found' });
            addLeadActivity(db, id, 'note', 'Lead data synced (website, contacts, enrichment)');
            res.json(updated);
        } catch (err) {
            logger.error({ err }, 'Sync failed');
            res.status(500).json({ error: 'Sync failed' });
        }
    });

    app.post('/api/leads/:id/enrich', validateParams(leadIdParamsSchema), async (req, res) => {
        const { id } = req.params;
        try {
            const db = await getDb(resolveDbPath());
            initSchema(db);
            const lead = await getLeadById(db, id);
            if (!lead) return res.status(404).json({ error: 'Lead not found' });
            const result = await enrichLead(db, id, { getLeadById, updateLead });
            res.json(result);
        } catch (err) {
            logger.error({ err }, 'Enrichment failed');
            res.status(500).json({ error: 'Enrichment failed' });
        }
    });
}

module.exports = { mountLeadsAi };
