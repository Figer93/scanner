/**
 * /api/email-logs, POST /api/webhooks/brevo — email logs and Brevo webhook.
 *
 * Brevo event mapping (transactional webhook):
 *   opened / open  → lead status "Opened"
 *   reply / replied → lead status "Replied" (SMS only; email replies use Inbound Parse)
 *   click          → log only (activity), do not change lead status
 *   delivered      → keep "Email Sent"
 *   soft_bounce / hard_bounce / blocked → email_log status "bounced"
 *
 * Reply tracking for email: Brevo does not send a "reply" event for transactional email.
 * Use Inbound Parse webhook (POST /api/webhooks/brevo/inbound): when a reply is received
 * at your Brevo inbound domain, payload items[].InReplyTo is matched to brevo_message_id.
 */

const { z } = require('zod');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const {
    getDb, initSchema, getEmailLogs, getEmailLogByBrevoMessageId, updateEmailLogStatus,
    addEmailLog, updateLead, getProfile, setProfileKey, addLeadActivity, setEnrolmentStatusForLead,
    setLeadMilestoneOnce,
} = require('../services/database');
const { STATUS } = require('../services/database');
const { validate, validateQuery } = require('../middleware/validate');
const logger = require('../lib/logger');

const DEFAULT_EMAIL_LOG_LIMIT = 50;

// ── Schemas ──────────────────────────────────────────────────

const emailLogsQuerySchema = z.object({
    leadId: z.coerce.number().int().positive().optional(),
    listId: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().min(1).max(500).default(DEFAULT_EMAIL_LOG_LIMIT),
});

const inboxSummaryQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(2000).default(500),
});

const emailLogCreateSchema = z.object({
    lead_id: z.coerce.number().int().positive({ message: 'lead_id is required' }),
    template_id: z.coerce.number().int().positive().nullable().optional(),
    brevo_message_id: z.string().nullable().optional(),
    direction: z.enum(['outbound', 'inbound']).default('outbound'),
    status: z.enum(['sent', 'delivered', 'opened', 'replied', 'bounced']).default('sent'),
});

const brevoWebhookSchema = z.object({
    'message-id': z.string().optional(),
    messageId: z.string().optional(),
    message_id: z.string().optional(),
    event: z.string().optional(),
    type: z.string().optional(),
}).passthrough();

const brevoWebhookTestSchema = z.object({
    event: z.enum(['opened', 'replied', 'delivered', 'click']),
    leadId: z.coerce.number().int().positive(),
});

/** Brevo Inbound Parse webhook payload: items[].InReplyTo, Subject, RawTextBody, From, SentAtDate */
const brevoInboundSchema = z.object({
    items: z.array(z.object({
        InReplyTo: z.string().optional().nullable(),
        MessageId: z.string().optional(),
        Subject: z.string().optional(),
        RawTextBody: z.string().optional().nullable(),
        ExtractedMarkdownMessage: z.string().optional().nullable(),
        From: z.object({ Address: z.string().optional(), Name: z.string().optional() }).optional(),
        SentAtDate: z.string().optional(),
    }).passthrough()).optional().default([]),
}).passthrough();

/** Normalize Message-ID / InReplyTo for lookup (strip angle brackets, trim). */
function normalizeMessageId(value) {
    if (value == null || typeof value !== 'string') return '';
    const s = value.trim();
    if (s.startsWith('<') && s.endsWith('>')) return s.slice(1, -1).trim();
    return s;
}

/** Best-effort extract an email from "Name <email@x>" */
function extractEmailAddress(input) {
    if (!input) return '';
    const s = String(input).trim();
    const m = s.match(/<([^>]+)>/);
    return (m && m[1] ? m[1] : s).trim();
}

function makeMailgunBodyParser() {
    const parseUrlencoded = express.urlencoded({ extended: false });
    const parseMultipart = multer().none();

    return function mailgunBodyParser(req, res, next) {
        const type = (req.headers['content-type'] || '').toString().toLowerCase();
        if (type.includes('multipart/form-data')) {
            return parseMultipart(req, res, (err) => {
                if (err) {
                    logger.error({ err, type }, 'Mailgun webhook body parse failed (multipart)');
                    return res.status(200).json({ ok: true, processed: 0 });
                }
                return next();
            });
        }
        if (type.includes('application/x-www-form-urlencoded')) {
            return parseUrlencoded(req, res, (err) => {
                if (err) {
                    logger.error({ err, type }, 'Mailgun webhook body parse failed (urlencoded)');
                    return res.status(200).json({ ok: true, processed: 0 });
                }
                return next();
            });
        }
        // Fallback: allow JSON (already parsed by app-level express.json()) and unknown types
        return next();
    };
}

async function getEmailLogByMailgunMessageIdFlexible(db, messageId) {
    if (!messageId || !String(messageId).trim()) return null;
    const raw = String(messageId).trim();
    const normalized = normalizeMessageId(raw);

    const candidates = [
        raw,
        normalized,
        normalized ? `<${normalized}>` : null,
        raw.startsWith('<') ? raw.slice(1) : null,
    ].filter(Boolean);

    for (const id of candidates) {
        const rows = await db.query(
            'SELECT * FROM email_logs WHERE provider = $1 AND provider_message_id = $2 LIMIT 1',
            ['mailgun', id]
        );
        if (rows && rows[0]) return rows[0];
    }
    return null;
}

/** Find email log by brevo_message_id, trying raw and normalized form (with/without angle brackets). */
async function getEmailLogByBrevoMessageIdFlexible(db, messageId) {
    if (!messageId || !String(messageId).trim()) return null;
    const raw = String(messageId).trim();
    let log = await getEmailLogByBrevoMessageId(db, raw);
    if (log) return log;
    const normalized = normalizeMessageId(raw);
    if (normalized) log = await getEmailLogByBrevoMessageId(db, normalized);
    if (log) return log;
    if (normalized && !raw.startsWith('<')) log = await getEmailLogByBrevoMessageId(db, `<${normalized}>`);
    return log || null;
}

/** Resolve expected Brevo webhook secret: profile (DB) overrides .env */
async function getExpectedBrevoSecret(db) {
    const profile = await getProfile(db);
    return (profile.brevo_webhook_secret || process.env.BREVO_WEBHOOK_SECRET || '').toString().trim();
}

/**
 * Verifies Brevo webhook requests using a shared secret.
 * BREVO_WEBHOOK_SECRET (or profile brevo_webhook_secret) is required; requests without a valid secret return 403.
 * Secret may be provided via query ?secret= or header x-webhook-secret.
 */
async function verifyBrevoWebhook(req, res, next) {
    try {
        const db = await getDb();
        initSchema(db);
        const expectedSecret = await getExpectedBrevoSecret(db);
        if (!expectedSecret) {
            logger.warn({ path: req.path }, 'Brevo webhook rejected — BREVO_WEBHOOK_SECRET not set');
            return res.status(403).json({ error: 'Forbidden' });
        }
        const providedSecret = (req.query.secret || req.headers['x-webhook-secret'] || '').toString().trim();
        if (!providedSecret) {
            logger.warn({ ip: req.ip, path: req.path }, 'Brevo webhook rejected — no secret provided');
            return res.status(403).json({ error: 'Forbidden' });
        }
        const expectedBuf = Buffer.from(expectedSecret, 'utf8');
        const providedBuf = Buffer.from(providedSecret.padEnd(expectedBuf.length, '\0').slice(0, expectedBuf.length), 'utf8');
        if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
            logger.warn({ ip: req.ip, path: req.path }, 'Brevo webhook rejected — invalid secret');
            return res.status(403).json({ error: 'Forbidden' });
        }
        next();
    } catch (err) {
        logger.error({ err }, 'Brevo webhook verification failed');
        res.status(500).json({ error: 'Internal error' });
    }
}

/** Record that a Brevo webhook was received (for status endpoint) */
async function recordWebhookReceived(db) {
    const profile = await getProfile(db);
    const count = (parseInt(profile.brevo_webhook_count, 10) || 0) + 1;
    await setProfileKey(db, 'brevo_last_webhook_at', new Date().toISOString());
    await setProfileKey(db, 'brevo_webhook_count', String(count));
}

/** Record that a Mailgun webhook was received (for status endpoint) */
async function recordMailgunWebhookReceived(db) {
    const profile = await getProfile(db);
    const count = (parseInt(profile.mailgun_webhook_count, 10) || 0) + 1;
    await setProfileKey(db, 'mailgun_last_webhook_at', new Date().toISOString());
    await setProfileKey(db, 'mailgun_webhook_count', String(count));
}

// ── Route handlers ───────────────────────────────────────────

function mountEmailLogs(app) {
    const mailgunBodyParser = makeMailgunBodyParser();

    app.get('/api/email-logs', validateQuery(emailLogsQuerySchema), async (req, res) => {
        try {
            const db = await getDb();
            initSchema(db);
            const { leadId, listId, limit } = req.query;
            const logs = await getEmailLogs(db, { leadId, listId, limit });
            res.json(logs);
        } catch (err) {
            logger.error({ err }, 'Failed to get email logs');
            res.status(500).json({ error: 'Failed to retrieve email logs' });
        }
    });

    // GET /api/email-inbox/summary — last inbound timestamp per lead (for unread badges)
    app.get('/api/email-inbox/summary', validateQuery(inboxSummaryQuerySchema), async (req, res) => {
        try {
            const db = await getDb();
            initSchema(db);
            const limit = req.query.limit;
            const rows = await db.query(
                `SELECT el.lead_id, MAX(el.sent_at) as last_inbound_at
                 FROM email_logs el
                 WHERE el.direction = 'inbound'
                 GROUP BY el.lead_id
                 ORDER BY MAX(el.sent_at) DESC
                 LIMIT $1`,
                [limit]
            );
            res.json((rows || []).map((r) => ({
                lead_id: r.lead_id,
                last_inbound_at: r.last_inbound_at ? String(r.last_inbound_at) : null,
            })));
        } catch (err) {
            logger.error({ err }, 'Failed to get inbox summary');
            res.status(500).json({ error: 'Failed to retrieve inbox summary' });
        }
    });

    app.post('/api/email-logs', validate(emailLogCreateSchema), async (req, res) => {
        try {
            const db = await getDb();
            initSchema(db);
            const { lead_id, template_id, brevo_message_id, direction, status } = req.body;
            const { id } = await addEmailLog(db, {
                lead_id,
                template_id: template_id ?? null,
                brevo_message_id: brevo_message_id ?? null,
                direction,
                status,
            });
            await updateLead(db, lead_id, { status: STATUS.EMAIL_SENT });
            res.status(201).json({ id });
        } catch (err) {
            logger.error({ err }, 'Failed to create email log');
            res.status(500).json({ error: 'Failed to create email log' });
        }
    });

    app.post('/api/webhooks/brevo', verifyBrevoWebhook, validate(brevoWebhookSchema), async (req, res) => {
        try {
            const db = await getDb();
            initSchema(db);
            const body = req.body;
            const messageId = body['message-id'] || body.messageId || body.message_id;
            const event = (body.event || body.type || '').toLowerCase();
            logger.info({ messageId, event, path: '/api/webhooks/brevo' }, 'Brevo webhook event received');
            if (!messageId) {
                return res.status(400).json({ error: 'message-id required' });
            }
            const logEntry = await getEmailLogByBrevoMessageIdFlexible(db, messageId);
            if (!logEntry) {
                return res.status(200).json({ ok: true, updated: false });
            }

            let didUpdate = false;
            if (event === 'opened' || event === 'open') {
                await updateEmailLogStatus(db, logEntry.id, 'opened');
                await updateLead(db, logEntry.lead_id, { status: STATUS.OPENED });
                await setLeadMilestoneOnce(db, logEntry.lead_id, 'opened');
                didUpdate = true;
            } else if (event === 'reply' || event === 'replied') {
                await updateEmailLogStatus(db, logEntry.id, 'replied');
                await updateLead(db, logEntry.lead_id, { status: STATUS.REPLIED });
                await setEnrolmentStatusForLead(db, logEntry.lead_id, 'replied');
                await setLeadMilestoneOnce(db, logEntry.lead_id, 'replied');
                didUpdate = true;
            } else if (event === 'click') {
                await addLeadActivity(db, logEntry.lead_id, 'email_clicked', 'Link clicked in email');
                didUpdate = true;
            } else if (event === 'delivered') {
                await updateEmailLogStatus(db, logEntry.id, 'delivered');
                await updateLead(db, logEntry.lead_id, { status: STATUS.EMAIL_SENT });
                didUpdate = true;
            } else if (event === 'soft_bounce' || event === 'hard_bounce' || event === 'blocked') {
                await updateEmailLogStatus(db, logEntry.id, 'bounced');
                didUpdate = true;
            }

            if (didUpdate) await recordWebhookReceived(db);
            logger.info({ messageId, event, leadId: logEntry.lead_id, updated: didUpdate }, 'Brevo webhook processed');
            res.status(200).json({ ok: true, updated: true });
        } catch (err) {
            logger.error({ err }, 'Brevo webhook processing failed');
            res.status(500).json({ error: 'Webhook processing failed' });
        }
    });

    // POST /api/webhooks/brevo/inbound — Brevo Inbound Parse webhook (replies)
    // Configure in Brevo: Inbound parsing → webhook URL = this endpoint. When someone replies
    // to an email we sent, Brevo POSTs items[].InReplyTo = original Message-ID; we match to email_logs.
    app.post('/api/webhooks/brevo/inbound', verifyBrevoWebhook, async (req, res) => {
        try {
            const parsed = brevoInboundSchema.safeParse(req.body || {});
            const body = parsed.success ? parsed.data : { items: [] };
            const items = Array.isArray(body.items) ? body.items : [];
            logger.info({ itemCount: items.length, path: '/api/webhooks/brevo/inbound' }, 'Brevo inbound webhook received');
            if (items.length === 0) {
                return res.status(200).json({ ok: true, processed: 0 });
            }
            const db = await getDb();
            initSchema(db);
            let processed = 0;
            for (const item of items) {
                const inReplyTo = item.InReplyTo;
                if (!inReplyTo || typeof inReplyTo !== 'string' || !inReplyTo.trim()) continue;
                const logEntry = await getEmailLogByBrevoMessageIdFlexible(db, inReplyTo);
                if (!logEntry) continue;
                await updateEmailLogStatus(db, logEntry.id, 'replied');
                await updateLead(db, logEntry.lead_id, { status: STATUS.REPLIED });
                await setEnrolmentStatusForLead(db, logEntry.lead_id, 'replied');
                await addLeadActivity(db, logEntry.lead_id, 'email_replied', 'Inbound reply received');
                const body = (item.RawTextBody || item.ExtractedMarkdownMessage || '').trim() || null;
                const fromAddr = item.From && typeof item.From === 'object' && item.From.Address ? String(item.From.Address).trim() : null;
                const sentAt = (item.SentAtDate && typeof item.SentAtDate === 'string') ? item.SentAtDate.trim() : null;
                await setLeadMilestoneOnce(db, logEntry.lead_id, 'replied', sentAt);
                await addEmailLog(db, {
                    lead_id: logEntry.lead_id,
                    template_id: null,
                    brevo_message_id: item.MessageId || null,
                    direction: 'inbound',
                    status: 'replied',
                    subject: (item.Subject && typeof item.Subject === 'string') ? item.Subject.trim() : null,
                    body,
                    from_email: fromAddr,
                    to_email: null,
                    sent_at: sentAt,
                });
                await recordWebhookReceived(db);
                processed++;
            }
            logger.info({ processed, itemCount: items.length }, 'Brevo inbound webhook processed');
            res.status(200).json({ ok: true, processed });
        } catch (err) {
            logger.error({ err }, 'Brevo inbound webhook failed');
            res.status(500).json({ error: 'Inbound webhook failed' });
        }
    });

    // ── Mailgun webhooks: events + inbound replies ──

    // POST /api/webhooks/mailgun/events — delivered/open/click/bounce
    app.post('/api/webhooks/mailgun/events', mailgunBodyParser, async (req, res) => {
        try {
            const db = await getDb();
            initSchema(db);
            // Basic Mailgun event payload: signature verification should be enabled with MAILGUN_SIGNING_KEY
            const body = req.body || {};
            const event = (body.event || '').toString().toLowerCase();
            const providerMessageId = (body['message-id'] || body.messageId || body['Message-Id'] || '').toString();
            if (!providerMessageId || !event) {
                return res.status(400).json({ error: 'message-id and event required' });
            }

            // Lookup by provider_message_id
            const rows = await db.query(
                'SELECT * FROM email_logs WHERE provider = $1 AND provider_message_id = $2 LIMIT 1',
                ['mailgun', providerMessageId]
            );
            const logEntry = rows && rows[0] ? rows[0] : null;
            if (!logEntry) {
                return res.status(200).json({ ok: true, updated: false });
            }

            let didUpdate = false;
            if (event === 'opened' || event === 'open') {
                await updateEmailLogStatus(db, logEntry.id, 'opened');
                await updateLead(db, logEntry.lead_id, { status: STATUS.OPENED });
                await setLeadMilestoneOnce(db, logEntry.lead_id, 'opened');
                didUpdate = true;
            } else if (event === 'clicked' || event === 'click') {
                await addLeadActivity(db, logEntry.lead_id, 'email_clicked', 'Link clicked in email');
                didUpdate = true;
            } else if (event === 'delivered') {
                await updateEmailLogStatus(db, logEntry.id, 'delivered');
                await updateLead(db, logEntry.lead_id, { status: STATUS.EMAIL_SENT });
                didUpdate = true;
            } else if (event === 'failed' || event === 'bounced') {
                await updateEmailLogStatus(db, logEntry.id, 'bounced');
                didUpdate = true;
            }

            logger.info({ providerMessageId, event, leadId: logEntry.lead_id, updated: didUpdate }, 'Mailgun event processed');
            if (didUpdate) await recordMailgunWebhookReceived(db);
            res.status(200).json({ ok: true, updated: didUpdate });
        } catch (err) {
            logger.error({ err }, 'Mailgun events webhook failed');
            res.status(500).json({ error: 'Webhook processing failed' });
        }
    });

    // POST /api/webhooks/mailgun/inbound — inbound Route replies
    app.post('/api/webhooks/mailgun/inbound', mailgunBodyParser, async (req, res) => {
        try {
            const body = req.body || {};
            const inReplyTo = (body['In-Reply-To'] || body['in-reply-to'] || body.in_reply_to || body['In-Reply-To:'] || '').toString();
            const messageId = (body['Message-Id'] || body['message-id'] || body.message_id || body['Message-Id:'] || '').toString();
            const subject = (body.subject || body.Subject || '').toString();
            const text = (body['stripped-text'] || body['body-plain'] || body['body'] || '').toString();
            const fromEmail = extractEmailAddress(body.sender || body.From || body.from || '');
            const sentAt = (body['Date'] || body.timestamp || null);

            if (!inReplyTo && !messageId) {
                return res.status(200).json({ ok: true, processed: 0 });
            }

            const db = await getDb();
            initSchema(db);

            // Prefer matching by In-Reply-To provider_message_id, fall back to Message-Id.
            const replyKey = inReplyTo || messageId;
            const outboundLog = await getEmailLogByMailgunMessageIdFlexible(db, replyKey);
            if (!outboundLog) {
                return res.status(200).json({ ok: true, processed: 0 });
            }

            await updateEmailLogStatus(db, outboundLog.id, 'replied');
            await updateLead(db, outboundLog.lead_id, { status: STATUS.REPLIED });
            await setEnrolmentStatusForLead(db, outboundLog.lead_id, 'replied');
            await addLeadActivity(db, outboundLog.lead_id, 'email_replied', 'Inbound reply received');
            await setLeadMilestoneOnce(db, outboundLog.lead_id, 'replied', sentAt || null);

            await addEmailLog(db, {
                lead_id: outboundLog.lead_id,
                template_id: null,
                brevo_message_id: null,
                provider: 'mailgun',
                provider_message_id: messageId || null,
                direction: 'inbound',
                status: 'replied',
                subject: subject || null,
                body: text.trim() || null,
                from_email: fromEmail || null,
                to_email: null,
                sent_at: sentAt || null,
            });

            await recordMailgunWebhookReceived(db);

            res.status(200).json({ ok: true, processed: 1 });
        } catch (err) {
            logger.error({ err }, 'Mailgun inbound webhook failed');
            res.status(500).json({ error: 'Inbound webhook failed' });
        }
    });

    // ── Test endpoint: simulate Brevo webhook by leadId (no message-id lookup) ──
    app.post('/api/webhooks/brevo/test', validate(brevoWebhookTestSchema), async (req, res) => {
        try {
            const db = await getDb();
            initSchema(db);
            const { event, leadId } = req.body;
            const logs = await getEmailLogs(db, { leadId, limit: 1 });
            const logEntry = logs.length > 0 ? logs[0] : null;

            const applyToLead = async (status) => {
                await updateLead(db, leadId, { status });
            };
            if (event === 'opened') {
                if (logEntry && logEntry.id) await updateEmailLogStatus(db, logEntry.id, 'opened');
                await applyToLead(STATUS.OPENED);
                await setLeadMilestoneOnce(db, leadId, 'opened');
            } else if (event === 'replied') {
                if (logEntry && logEntry.id) await updateEmailLogStatus(db, logEntry.id, 'replied');
                await applyToLead(STATUS.REPLIED);
                await setEnrolmentStatusForLead(db, leadId, 'replied');
                await setLeadMilestoneOnce(db, leadId, 'replied');
            } else if (event === 'click') {
                await addLeadActivity(db, leadId, 'email_clicked', 'Link clicked (test)');
            } else if (event === 'delivered') {
                if (logEntry && logEntry.id) await updateEmailLogStatus(db, logEntry.id, 'delivered');
                await applyToLead(STATUS.EMAIL_SENT);
            }

            res.status(200).json({ ok: true, simulated: event, leadId });
        } catch (err) {
            logger.error({ err }, 'Brevo webhook test failed');
            res.status(500).json({ error: 'Test failed' });
        }
    });

    // ── Brevo status: secret configured?, last webhook, event count ──
    app.get('/api/webhooks/brevo/status', async (req, res) => {
        try {
            const db = await getDb();
            initSchema(db);
            const profile = await getProfile(db);
            const secret = (profile.brevo_webhook_secret || process.env.BREVO_WEBHOOK_SECRET || '').toString().trim();
            const lastAt = profile.brevo_last_webhook_at || null;
            const count = parseInt(profile.brevo_webhook_count, 10) || 0;
            res.json({
                secretConfigured: secret.length > 0,
                lastWebhookAt: lastAt,
                webhookEventCount: count,
            });
        } catch (err) {
            logger.error({ err }, 'Brevo webhook status failed');
            res.status(500).json({ error: 'Failed to get status' });
        }
    });
    // ── Mailgun status endpoint (minimal for now) ──
    app.get('/api/webhooks/mailgun/status', async (req, res) => {
        try {
            const db = await getDb();
            initSchema(db);
            const profile = await getProfile(db);
            const lastAt = profile.mailgun_last_webhook_at || null;
            const count = parseInt(profile.mailgun_webhook_count, 10) || 0;
            res.json({
                lastWebhookAt: lastAt,
                webhookEventCount: count,
            });
        } catch (err) {
            logger.error({ err }, 'Mailgun webhook status failed');
            res.status(500).json({ error: 'Failed to get status' });
        }
    });
}

module.exports = { mountEmailLogs };
