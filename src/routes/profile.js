/**
 * /api/profile — get/set/delete profile keys and settings.
 * Protected by bearer-token auth when ADMIN_TOKEN env var is set.
 */

const { z } = require('zod');
const { getDb, initSchema, getProfile, setProfileKey, deleteProfileKey } = require('../services/database');
const { DEFAULT_DB_PATH } = require('../services/database');
const { authenticate } = require('../middleware/authenticate');
const { validate, validateParams } = require('../middleware/validate');
const logger = require('../lib/logger');

const PROFILE_KEYS = [
    'serper_api_key', 'companies_house_api_key', 'google_places_api_key',
    'google_ai_api_key', 'apify_api_token', 'apify_linkedin_actor_id',
    'hubspot_api_key', 'pipedrive_api_token', 'pipedrive_domain',
    'salesforce_access_token', 'salesforce_instance_url',
    'webhook_url', 'webhook_score_threshold', 'team_members',
    'brevo_webhook_secret', 'brevo_api_key',
    'mailgun_api_key', 'mailgun_signing_key', 'mailgun_domain', 'mailgun_region',
    'referral_link', 'sender_name', 'sender_email', 'daily_send_limit', 'send_delay_minutes',
    'queue_paused',
    'earnings_referral_pounds', 'earnings_conversion_rate_pct',
];

const ENV_KEY_MAP = {
    serper_api_key: 'SERPER_API_KEY',
    companies_house_api_key: 'COMPANIES_HOUSE_API_KEY',
    google_places_api_key: 'GOOGLE_PLACES_API_KEY',
    google_ai_api_key: 'GOOGLE_AI_API_KEY',
    apify_api_token: 'APIFY_API_TOKEN',
    apify_linkedin_actor_id: 'APIFY_LINKEDIN_ACTOR_ID',
    hubspot_api_key: 'HUBSPOT_API_KEY',
    pipedrive_api_token: 'PIPEDRIVE_API_TOKEN',
    pipedrive_domain: 'PIPEDRIVE_DOMAIN',
    salesforce_access_token: 'SALESFORCE_ACCESS_TOKEN',
    salesforce_instance_url: 'SALESFORCE_INSTANCE_URL',
    brevo_webhook_secret: 'BREVO_WEBHOOK_SECRET',
    brevo_api_key: 'BREVO_API_KEY',
    mailgun_api_key: 'MAILGUN_API_KEY',
    mailgun_signing_key: 'MAILGUN_SIGNING_KEY',
    mailgun_domain: 'MAILGUN_DOMAIN',
    mailgun_region: 'MAILGUN_REGION',
};

// POST /api/profile — accepts any combination of known profile keys
const profileUpdateSchema = z.object({
    serper_api_key: z.string().optional(),
    companies_house_api_key: z.string().optional(),
    google_places_api_key: z.string().optional(),
    google_ai_api_key: z.string().optional(),
    apify_api_token: z.string().optional(),
    apify_linkedin_actor_id: z.string().optional(),
    hubspot_api_key: z.string().optional(),
    pipedrive_api_token: z.string().optional(),
    pipedrive_domain: z.string().optional(),
    salesforce_access_token: z.string().optional(),
    salesforce_instance_url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
    webhook_url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
    webhook_score_threshold: z.union([z.string(), z.number()]).optional(),
    team_members: z.string().optional(),
    lead_scoring_criteria: z.string().optional(),
    brevo_webhook_secret: z.string().optional(),
    brevo_api_key: z.string().optional(),
    mailgun_api_key: z.string().optional(),
    mailgun_signing_key: z.string().optional(),
    mailgun_domain: z.string().optional(),
    mailgun_region: z.string().optional(),
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
            const db = await getDb(process.env.DB_PATH || DEFAULT_DB_PATH);
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
                const v = profile[k] || process.env[ENV_KEY_MAP[k]] || '';
                masked[k] = v ? '***' + v.slice(-4) : '';
                masked[k + '_source'] = profile[k] != null && String(profile[k]).length > 0 ? 'db' : (process.env[ENV_KEY_MAP[k]] ? 'env' : '');
            });
            masked.lead_scoring_criteria = profile.lead_scoring_criteria || process.env.LEAD_SCORING_CRITERIA || '';
            masked.webhook_url = profile.webhook_url || process.env.WEBHOOK_URL || '';
            masked.webhook_score_threshold = profile.webhook_score_threshold || process.env.WEBHOOK_SCORE_THRESHOLD || '7';
            res.json(masked);
        } catch (err) {
            logger.error({ err }, 'Failed to get profile');
            res.status(500).json({ error: 'Failed to retrieve profile' });
        }
    });

    app.post('/api/profile', authenticate, validate(profileUpdateSchema), async (req, res) => {
        try {
            const db = await getDb(process.env.DB_PATH || DEFAULT_DB_PATH);
            initSchema(db);
            const body = req.body || {};
            for (const k of PROFILE_KEYS) {
                if (body[k] === undefined) continue;
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
            if (body.webhook_url !== undefined) await setProfileKey(db, 'webhook_url', body.webhook_url);
            if (body.webhook_score_threshold !== undefined) await setProfileKey(db, 'webhook_score_threshold', String(body.webhook_score_threshold));
            if (body.team_members !== undefined) await setProfileKey(db, 'team_members', body.team_members);
            res.json({ ok: true });
        } catch (err) {
            logger.error({ err }, 'Failed to update profile');
            res.status(500).json({ error: 'Failed to update profile' });
        }
    });

    app.delete('/api/profile/:key', authenticate, validateParams(profileDeleteParamsSchema), async (req, res) => {
        const key = req.params.key;
        try {
            const db = await getDb(process.env.DB_PATH || DEFAULT_DB_PATH);
            await deleteProfileKey(db, key);
            res.json({ ok: true });
        } catch (err) {
            logger.error({ err, key }, 'Failed to delete profile key');
            res.status(500).json({ error: 'Failed to delete profile key' });
        }
    });
}

module.exports = { mountProfile };
