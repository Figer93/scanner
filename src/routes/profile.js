/**
 * /api/profile — get/set/delete profile keys and settings.
 * Protected by bearer-token auth when ADMIN_TOKEN env var is set.
 */

const { z } = require('zod');
const { getDb, initSchema, getProfile, setProfileKey, deleteProfileKey } = require('../services/database');
const { authenticate } = require('../middleware/authenticate');
const { validate, validateParams } = require('../middleware/validate');
const logger = require('../lib/logger');
const { sendAudit } = require('../services/auditWebhook');

/** Non-secret settings only. API keys and provider secrets belong in Railway / environment variables. */
const PROFILE_KEYS = [
    'delay_between_companies_ms', 'enrichment_concurrency',
    'enrichment_stage_website_find', 'enrichment_stage_scrape', 'enrichment_stage_linkedin', 'enrichment_stage_validate',
    'apify_linkedin_enabled',
    'webhook_url', 'webhook_score_threshold', 'team_members',
    'referral_link', 'sender_name', 'sender_email', 'daily_send_limit', 'send_delay_minutes',
    'queue_paused',
    'earnings_referral_pounds', 'earnings_conversion_rate_pct',
];

// POST /api/profile — accepts any combination of known profile keys
const profileUpdateSchema = z.object({
    delay_between_companies_ms: z.union([z.string(), z.number()]).optional(),
    enrichment_concurrency: z.coerce.number().int().min(1).max(20).optional(),
    enrichment_stage_website_find: z.boolean().optional(),
    enrichment_stage_scrape: z.boolean().optional(),
    enrichment_stage_linkedin: z.boolean().optional(),
    enrichment_stage_validate: z.boolean().optional(),
    apify_linkedin_enabled: z.boolean().optional(),
    webhook_url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
    webhook_score_threshold: z.union([z.string(), z.number()]).optional(),
    team_members: z.string().optional(),
    lead_scoring_criteria: z.string().optional(),
    referral_link: z.string().optional(),
    sender_name: z.string().optional(),
    sender_email: z.string().email().optional().or(z.literal('')),
    daily_send_limit: z.coerce.number().int().min(1).max(1000).optional(),
    send_delay_minutes: z.coerce.number().int().min(0).max(60).optional(),
    queue_paused: z.boolean().optional(),
    earnings_referral_pounds: z.coerce.number().min(0).max(10000).optional(),
    earnings_conversion_rate_pct: z.coerce.number().min(0).max(100).optional(),
}).strict();

// DELETE /api/profile/:key — key must be a known profile key
const profileDeleteParamsSchema = z.object({
    key: z.enum(/** @type {[string, ...string[]]} */ (PROFILE_KEYS)),
});

function mountProfile(app) {
    app.get('/api/profile', authenticate, async (req, res) => {
        try {
            const db = await getDb();
            const profile = await getProfile(db);
            const masked = {};
            PROFILE_KEYS.forEach((k) => {
                if (k === 'team_members') {
                    masked[k] = profile[k] || process.env.TEAM_MEMBERS || '';
                    masked[k + '_source'] = '';
                    return;
                }
                if (k === 'daily_send_limit' || k === 'send_delay_minutes') {
                    const raw = profile[k] != null && String(profile[k]).trim() !== '' ? profile[k] : (k === 'daily_send_limit' ? '50' : '3');
                    masked[k] = parseInt(raw, 10) || (k === 'daily_send_limit' ? 50 : 3);
                    masked[k + '_source'] = profile[k] != null && String(profile[k]).length > 0 ? 'db' : '';
                    return;
                }
                if (k === 'queue_paused') {
                    masked[k] = profile[k] === '1';
                    masked[k + '_source'] = profile[k] != null && String(profile[k]).length > 0 ? 'db' : '';
                    return;
                }
                if (
                    k === 'enrichment_stage_website_find' ||
                    k === 'enrichment_stage_scrape' ||
                    k === 'enrichment_stage_linkedin' ||
                    k === 'enrichment_stage_validate' ||
                    k === 'apify_linkedin_enabled'
                ) {
                    masked[k] = profile[k] === '1' || profile[k] === 'true';
                    masked[k + '_source'] = profile[k] != null && String(profile[k]).length > 0 ? 'db' : '';
                    return;
                }
                if (k === 'delay_between_companies_ms') {
                    const raw = profile[k] != null && String(profile[k]).trim() !== '' ? profile[k] : '500';
                    masked[k] = parseInt(raw, 10) || 500;
                    masked[k + '_source'] = profile[k] != null && String(profile[k]).length > 0 ? 'db' : '';
                    return;
                }
                if (k === 'enrichment_concurrency') {
                    const raw = profile[k] != null && String(profile[k]).trim() !== '' ? profile[k] : '10';
                    masked[k] = Math.min(20, Math.max(1, parseInt(raw, 10) || 10));
                    masked[k + '_source'] = profile[k] != null && String(profile[k]).length > 0 ? 'db' : '';
                    return;
                }
                if (k === 'earnings_referral_pounds' || k === 'earnings_conversion_rate_pct') {
                    const raw = profile[k];
                    const num = raw != null && String(raw).trim() !== '' ? parseFloat(raw) : (k === 'earnings_conversion_rate_pct' ? 15 : null);
                    masked[k] = k === 'earnings_conversion_rate_pct' ? (Number.isNaN(num) ? 15 : num) : (Number.isNaN(num) ? null : num);
                    masked[k + '_source'] = profile[k] != null && String(profile[k]).length > 0 ? 'db' : '';
                    return;
                }
                if (k === 'referral_link' || k === 'sender_name' || k === 'sender_email') {
                    masked[k] = profile[k] || '';
                    masked[k + '_source'] = profile[k] != null && String(profile[k]).length > 0 ? 'db' : '';
                    return;
                }
                if (k === 'webhook_url') {
                    masked[k] = profile.webhook_url || process.env.WEBHOOK_URL || '';
                    masked[k + '_source'] = profile[k] != null && String(profile[k]).length > 0 ? 'db' : (process.env.WEBHOOK_URL ? 'env' : '');
                    return;
                }
                if (k === 'webhook_score_threshold') {
                    masked[k] = profile.webhook_score_threshold || process.env.WEBHOOK_SCORE_THRESHOLD || '7';
                    masked[k + '_source'] = profile[k] != null && String(profile[k]).length > 0 ? 'db' : (process.env.WEBHOOK_SCORE_THRESHOLD ? 'env' : '');
                    return;
                }
                logger.warn({ k }, 'profile GET: unhandled PROFILE_KEYS entry');
                masked[k] = profile[k] || '';
                masked[k + '_source'] = profile[k] != null && String(profile[k]).length > 0 ? 'db' : '';
            });
            masked.lead_scoring_criteria = profile.lead_scoring_criteria || process.env.LEAD_SCORING_CRITERIA || '';
            res.json(masked);
        } catch (err) {
            logger.error({ err }, 'Failed to get profile');
            res.status(500).json({ error: 'Failed to retrieve profile' });
        }
    });

    app.post('/api/profile', authenticate, validate(profileUpdateSchema), async (req, res) => {
        try {
            const db = await getDb();
            initSchema(db);
            const before = await getProfile(db);
            const body = req.body || {};
            for (const k of PROFILE_KEYS) {
                if (body[k] === undefined) continue;
                if (
                    k === 'enrichment_stage_website_find' ||
                    k === 'enrichment_stage_scrape' ||
                    k === 'enrichment_stage_linkedin' ||
                    k === 'enrichment_stage_validate' ||
                    k === 'apify_linkedin_enabled'
                ) {
                    await setProfileKey(db, k, body[k] ? '1' : '0');
                    continue;
                }
                if (k === 'delay_between_companies_ms' || k === 'enrichment_concurrency') {
                    const n = typeof body[k] === 'number' ? body[k] : parseInt(body[k], 10);
                    const def = k === 'delay_between_companies_ms' ? 500 : 10;
                    await setProfileKey(db, k, Number.isNaN(n) ? String(def) : String(n));
                    continue;
                }
                if (k === 'daily_send_limit' || k === 'send_delay_minutes') {
                    const n = typeof body[k] === 'number' ? body[k] : parseInt(body[k], 10);
                    await setProfileKey(db, k, Number.isNaN(n) ? (k === 'daily_send_limit' ? '50' : '3') : String(n));
                    continue;
                }
                if (k === 'queue_paused') {
                    await setProfileKey(db, k, body[k] ? '1' : '0');
                    continue;
                }
                if (k === 'earnings_referral_pounds' || k === 'earnings_conversion_rate_pct') {
                    const n = typeof body[k] === 'number' ? body[k] : parseFloat(body[k]);
                    await setProfileKey(db, k, Number.isNaN(n) ? (k === 'earnings_conversion_rate_pct' ? '15' : '') : String(n));
                    continue;
                }
                await setProfileKey(db, k, body[k] == null ? '' : body[k]);
            }
            if (body.lead_scoring_criteria !== undefined) {
                await setProfileKey(db, 'lead_scoring_criteria', body.lead_scoring_criteria);
            }
            const after = await getProfile(db);

            const changedKeys = Object.keys(body || {}).filter((k) => body[k] !== undefined);
            await sendAudit({
                action: 'profile.update',
                actor: req.user?.sub || 'admin',
                resource: 'profile',
                meta: { changedKeys },
                before: { changedKeys: changedKeys.reduce((acc, k) => { acc[k] = before?.[k]; return acc; }, {}) },
                after: { changedKeys: changedKeys.reduce((acc, k) => { acc[k] = after?.[k]; return acc; }, {}) },
            });
            res.json({ ok: true });
        } catch (err) {
            logger.error({ err }, 'Failed to update profile');
            res.status(500).json({ error: 'Failed to update profile' });
        }
    });

    app.delete('/api/profile/:key', authenticate, validateParams(profileDeleteParamsSchema), async (req, res) => {
        const key = req.params.key;
        try {
            const db = await getDb();
            await deleteProfileKey(db, key);
            res.json({ ok: true });
        } catch (err) {
            logger.error({ err, key }, 'Failed to delete profile key');
            res.status(500).json({ error: 'Failed to delete profile key' });
        }
    });
}

module.exports = { mountProfile };
