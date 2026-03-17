/**
 * Leads CRUD, activities, email actions, bulk operations, and validation.
 *
 * ROUTE REGISTRATION ORDER IS CRITICAL — static paths must precede /:id wildcard:
 *   /api/leads/by-company/:companyNumber
 *   /api/leads/in-lists
 *   /api/leads/save-to-list
 *   /api/leads/bulk-send-email
 *   /api/leads/bulk-delete
 *   /api/leads/validate
 *   ... then /:id and /:id/* routes
 */

const {
    getDb, initSchema,
    getLeads, getLeadById, getLeadByCompanyNumber,
    getListById, addLeadsToList, updateLead,
    searchEnrichedLeads,
    getLeadActivities, addLeadActivity,
    getProfile, addEmailLog,
    deleteLeadsByIds, getListsByCompanyNumbers,
    STATUS,
} = require('../../services/database');
const { getResolvedKeys } = require('../../services/usageTracker');
const { validateLead } = require('../../services/leadValidator');
const { fireWebhookIfConfigured } = require('../../serverContext');
const { validate, validateQuery, validateParams } = require('../../middleware/validate');
const logger = require('../../lib/logger');
const { sendMailgunEmail } = require('../../services/mailgun');
const {
    leadIdParamsSchema,
    companyNumberParamsSchema,
    leadsQuerySchema,
    enrichedSearchQuerySchema,
    leadUpdateSchema,
    activityCreateSchema,
    sendEmailSchema,
    sendReplySchema,
    saveToListSchema,
    bulkSendEmailSchema,
    bulkDeleteSchema,
    validateLeadSchema,
} = require('../../schemas/leads');

function mountLeadsCrud(app) {
    // ── List / lookup (static paths — must precede /:id) ─────

    app.get('/api/leads', validateQuery(leadsQuerySchema), async (req, res) => {
        try {
            const db = await getDb();
            const leads = await getLeads(db, { listId: req.query.listId });
            res.json(leads);
        } catch (err) {
            logger.error({ err }, 'Failed to list leads');
            res.status(500).json({ error: 'Failed to list leads' });
        }
    });

    app.get('/api/leads/by-company/:companyNumber', validateParams(companyNumberParamsSchema), async (req, res) => {
        try {
            const db = await getDb();
            const lead = await getLeadByCompanyNumber(db, req.params.companyNumber);
            if (!lead) return res.status(404).json({ error: 'No lead found for this company' });
            res.json(lead);
        } catch (err) {
            logger.error({ err }, 'Failed to get lead by company number');
            res.status(500).json({ error: 'Failed to get lead by company number' });
        }
    });

    app.get('/api/leads/in-lists', async (req, res) => {
        try {
            const db = await getDb();
            initSchema(db);
            const raw = req.query.companyNumbers;
            const companyNumbers = typeof raw === 'string'
                ? raw.split(',').map((n) => n.trim()).filter(Boolean)
                : (Array.isArray(raw) ? raw : []);
            res.json(await getListsByCompanyNumbers(db, companyNumbers));
        } catch (err) {
            logger.error({ err }, 'Failed to get leads in lists');
            res.status(500).json({ error: 'Failed to get leads in lists' });
        }
    });

    app.get('/api/leads/enriched', validateQuery(enrichedSearchQuerySchema), async (req, res) => {
        try {
            const db = await getDb();
            initSchema(db);
            const q = req.query.q || '';
            const limit = Math.min(500, parseInt(req.query.limit, 10) || 100);
            const daysBack = req.query.daysBack != null ? parseInt(req.query.daysBack, 10) : undefined;
            const location = req.query.location || undefined;
            const postcode = req.query.postcode || undefined;
            const listId = req.query.listId != null ? parseInt(Number(req.query.listId), 10) : undefined;
            const items = await searchEnrichedLeads(db, { q: q || undefined, limit, daysBack, location, postcode, listId });
            res.json({ items });
        } catch (err) {
            logger.error({ err }, 'Failed to search enriched leads');
            res.status(500).json({ error: 'Failed to search enriched leads' });
        }
    });

    // ── Bulk operations (static paths — must precede /:id) ───

    app.post('/api/leads/save-to-list', validate(saveToListSchema), async (req, res) => {
        const { listId, companyNumbers } = req.body;
        try {
            const db = await getDb();
            initSchema(db);
            const list = await getListById(db, listId);
            if (!list) return res.status(404).json({ error: 'List not found' });
            const { saved, leadIds } = await addLeadsToList(db, listId, companyNumbers);
            res.status(201).json({ saved, listId, leadIds });
        } catch (err) {
            logger.error({ err }, 'Failed to save to list');
            res.status(500).json({ error: 'Failed to save to list' });
        }
    });

    app.post('/api/leads/bulk-send-email', validate(bulkSendEmailSchema), async (req, res) => {
        const { leadIds, subject } = req.body;
        try {
            const db = await getDb();
            let updated = 0;
            for (const id of leadIds) {
                const lead = await getLeadById(db, id);
                if (!lead) continue;
                await addLeadActivity(db, id, 'email_sent', `Email sent (bulk): "${subject}"`);
                await updateLead(db, id, { status: STATUS.EMAIL_SENT });
                await addLeadActivity(db, id, 'status_change', 'Status changed to Email Sent');
                updated++;
            }
            res.json({ ok: true, updated });
        } catch (err) {
            logger.error({ err }, 'Bulk send-email failed');
            res.status(500).json({ error: 'Bulk send-email failed' });
        }
    });

    app.post('/api/leads/bulk-delete', validate(bulkDeleteSchema), async (req, res) => {
        try {
            const db = await getDb();
            const deleted = await deleteLeadsByIds(db, req.body.ids);
            res.json({ ok: true, deleted });
        } catch (err) {
            logger.error({ err }, 'Bulk delete failed');
            res.status(500).json({ error: 'Bulk delete failed' });
        }
    });

    app.post('/api/leads/validate', validate(validateLeadSchema), async (req, res) => {
        try {
            const db = await getDb();
            initSchema(db);
            const lead = req.body;
            const apiKeys = getResolvedKeys(db);
            const useApi = lead.useApi === true;
            const apiKey = useApi ? (apiKeys.companies_house_api_key || process.env.COMPANIES_HOUSE_API_KEY || '') : '';
            const result = await validateLead(db, lead, { useApi: useApi && !!apiKey, apiKey });
            res.json(result);
        } catch (err) {
            logger.error({ err }, 'Validation failed');
            res.status(500).json({ error: 'Validation failed' });
        }
    });

    // ── Single lead — GET, PATCH (/:id wildcard last) ────────

    app.get('/api/leads/:id', validateParams(leadIdParamsSchema), async (req, res) => {
        try {
            const db = await getDb();
            const lead = await getLeadById(db, req.params.id);
            if (!lead) return res.status(404).json({ error: 'Lead not found' });
            res.json(lead);
        } catch (err) {
            logger.error({ err }, 'Failed to get lead');
            res.status(500).json({ error: 'Failed to get lead' });
        }
    });

    app.patch('/api/leads/:id', validateParams(leadIdParamsSchema), validate(leadUpdateSchema), async (req, res) => {
        const { id } = req.params;
        const updates = {};
        if (req.body.status !== undefined) updates.status = req.body.status;
        if (req.body.score !== undefined) updates.score = req.body.score;
        if (req.body.outreach_draft !== undefined) updates.outreach_draft = req.body.outreach_draft;
        if (req.body.assigned_to !== undefined) {
            updates.assigned_to = req.body.assigned_to == null || req.body.assigned_to === ''
                ? null
                : String(req.body.assigned_to).trim();
        }
        if (req.body.emails !== undefined) updates.emails = req.body.emails;
        if (req.body.phones !== undefined) updates.phones = req.body.phones;
        try {
            const db = await getDb();
            if (updates.status) {
                const lead = await getLeadById(db, id);
                if (lead) await addLeadActivity(db, id, 'status_change', `Status changed to ${updates.status}`);
            }
            await updateLead(db, id, updates);
            const updated = await getLeadById(db, id);
            if (updated && (updates.status === 'Qualified' || updates.status === 'Converted')) {
                await fireWebhookIfConfigured(db, updated, 'status', { newStatus: updates.status }).catch(() => {});
            }
            res.json({ ok: true });
        } catch (err) {
            logger.error({ err }, 'Failed to update lead');
            res.status(500).json({ error: 'Failed to update lead' });
        }
    });

    // ── Activities (/:id/* — registered after bare /:id) ────

    app.get('/api/leads/:id/activities', validateParams(leadIdParamsSchema), async (req, res) => {
        try {
            const db = await getDb();
            res.json(await getLeadActivities(db, req.params.id));
        } catch (err) {
            logger.error({ err }, 'Failed to get activities');
            res.status(500).json({ error: 'Failed to get activities' });
        }
    });

    app.post('/api/leads/:id/activities', validateParams(leadIdParamsSchema), validate(activityCreateSchema), async (req, res) => {
        const { id } = req.params;
        const { type, content } = req.body;
        try {
            const db = await getDb();
            const lead = await getLeadById(db, id);
            if (!lead) return res.status(404).json({ error: 'Lead not found' });
            const activityId = await addLeadActivity(db, id, type, content);
            res.status(201).json({ ok: true, id: activityId });
        } catch (err) {
            logger.error({ err }, 'Failed to add activity');
            res.status(500).json({ error: 'Failed to add activity' });
        }
    });

    app.post('/api/leads/:id/send-email', validateParams(leadIdParamsSchema), validate(sendEmailSchema), async (req, res) => {
        const { id } = req.params;
        const subject = (req.body.subject || '').trim() || 'Introduction';
        try {
            const db = await getDb();
            const lead = await getLeadById(db, id);
            if (!lead) return res.status(404).json({ error: 'Lead not found' });
            const to = Array.isArray(lead.emails) && lead.emails[0]
                ? lead.emails[0]
                : (lead.emails || '').toString() || 'unknown';
            await addLeadActivity(db, id, 'email_sent', `Email sent to ${to}: "${subject}"`);
            await updateLead(db, id, { status: STATUS.EMAIL_SENT });
            await addLeadActivity(db, id, 'status_change', 'Status changed to Email Sent');
            res.json({ ok: true, to, subject });
        } catch (err) {
            logger.error({ err }, 'Send email failed');
            res.status(500).json({ error: 'Send email failed' });
        }
    });

    app.post('/api/leads/:id/send-reply', validateParams(leadIdParamsSchema), validate(sendReplySchema), async (req, res) => {
        const { id } = req.params;
        const subject = (req.body.subject || '').trim();
        const body = (req.body.body || '').trim();
        try {
            const db = await getDb();
            initSchema(db);
            const lead = await getLeadById(db, id);
            if (!lead) return res.status(404).json({ error: 'Lead not found' });
            const toEmail = Array.isArray(lead.emails) && lead.emails[0] ? lead.emails[0] : (lead.emails || '').toString();
            if (!toEmail || toEmail === 'Not found' || toEmail === 'unknown' || !toEmail.trim()) {
                return res.status(400).json({ error: 'Lead has no contact email. Add or edit the contact email first.' });
            }
            const profile = await getProfile(db);
            const htmlContent = body && /<[a-z][\s\S]*>/i.test(body) ? body : null;
            const textContent = htmlContent ? null : body;

            const senderEmailEnv = (process.env.MAILGUN_SENDER_EMAIL || '').trim();
            const mailgunFrom =
                senderEmailEnv ? `Mailgun Sandbox <${senderEmailEnv}>` : senderEmailEnv;
            const sendResult = await sendMailgunEmail({
                to: toEmail.trim(),
                subject,
                text: textContent,
                html: htmlContent,
                tags: ['lead_reply'],
                variables: { leadId: id },
                profileOverride: profile,
            });
            if (!sendResult.ok) {
                logger.warn({ error: sendResult.error }, 'Send-reply Mailgun rejected');
                return res.status(502).json({ error: sendResult.error || 'Send reply failed' });
            }

            const senderEmail = mailgunFrom || senderEmailEnv || null;

            await addEmailLog(db, {
                lead_id: id,
                template_id: null,
                brevo_message_id: null,
                provider: 'mailgun',
                provider_message_id: sendResult.providerMessageId || null,
                direction: 'outbound',
                status: 'sent',
                subject,
                body,
                from_email: senderEmail,
                to_email: toEmail.trim(),
            });
            await updateLead(db, id, { status: STATUS.EMAIL_SENT });
            await addLeadActivity(db, id, 'email_sent', `Reply sent to ${toEmail}: "${subject}"`);
            res.json({ ok: true, to: toEmail, subject });
        } catch (err) {
            logger.error({ err }, 'Send reply failed');
            res.status(500).json({ error: err.message || 'Send reply failed' });
        }
    });
}

module.exports = { mountLeadsCrud };
