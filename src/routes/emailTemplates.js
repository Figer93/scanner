/**
 * /api/email-templates/* — email template CRUD, preview, send-test
 */

const { z } = require('zod');
const { getDb, initSchema, getEmailTemplates, getEmailTemplateById, createEmailTemplate, updateEmailTemplate, deleteEmailTemplate, getLeadById, getProfile, addEmailLog, updateLead, addLeadActivity, STATUS } = require('../services/database');
const { resolveTemplateVariables } = require('../lib/templateVars');
const logger = require('../lib/logger');
const { sendMailgunEmail } = require('../services/mailgun');

const sendTestSchema = z.object({
    toEmail: z.string().email('Valid email required'),
    leadId: z.coerce.number().int().positive('leadId must be a positive integer'),
});

const sendToLeadSchema = z.object({
    leadId: z.coerce.number().int().positive('leadId must be a positive integer'),
});

function mountEmailTemplates(app) {
    app.get('/api/email-templates', async (req, res) => {
        try {
            const db = await getDb();
            initSchema(db);
            res.json(getEmailTemplates(db));
        } catch (err) {
            logger.error({ err }, 'Failed to get email templates');
            res.status(500).json({ error: 'Failed to retrieve templates' });
        }
    });

    app.get('/api/email-templates/:id', async (req, res) => {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id) || id < 1) return res.status(400).json({ error: 'Invalid template id' });
        try {
            const db = await getDb();
            initSchema(db);
            const template = getEmailTemplateById(db, id);
            if (!template) return res.status(404).json({ error: 'Template not found' });
            res.json(template);
        } catch (err) {
            logger.error({ err }, 'Failed to get email template');
            res.status(500).json({ error: 'Failed to retrieve template' });
        }
    });

    app.post('/api/email-templates', async (req, res) => {
        try {
            const db = await getDb();
            initSchema(db);
            const { name, subject, body } = req.body || {};
            if (!name || !String(name).trim()) return res.status(400).json({ error: 'name is required' });
            if (!subject || !String(subject).trim()) return res.status(400).json({ error: 'subject is required' });
            const { id } = await createEmailTemplate(db, { name: String(name).trim(), subject: String(subject).trim(), body: (body != null ? String(body) : '') });
            res.status(201).json(getEmailTemplateById(db, id));
        } catch (err) {
            logger.error({ err }, 'Failed to create email template');
            res.status(500).json({ error: 'Failed to create template' });
        }
    });

    app.patch('/api/email-templates/:id', async (req, res) => {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id) || id < 1) return res.status(400).json({ error: 'Invalid template id' });
        try {
            const db = await getDb();
            initSchema(db);
            const template = getEmailTemplateById(db, id);
            if (!template) return res.status(404).json({ error: 'Template not found' });
            const { name, subject, body } = req.body || {};
            updateEmailTemplate(db, id, {
                name: name !== undefined ? String(name).trim() : undefined,
                subject: subject !== undefined ? String(subject).trim() : undefined,
                body: body !== undefined ? String(body) : undefined
            });
            res.json(await getEmailTemplateById(db, id));
        } catch (err) {
            logger.error({ err }, 'Failed to update email template');
            res.status(500).json({ error: 'Failed to update template' });
        }
    });

    app.delete('/api/email-templates/:id', async (req, res) => {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id) || id < 1) return res.status(400).json({ error: 'Invalid template id' });
        try {
            const db = await getDb();
            initSchema(db);
            const template = getEmailTemplateById(db, id);
            if (!template) return res.status(404).json({ error: 'Template not found' });
            await deleteEmailTemplate(db, id);
            res.json({ ok: true });
        } catch (err) {
            logger.error({ err }, 'Failed to delete email template');
            res.status(500).json({ error: 'Failed to delete template' });
        }
    });

    // GET /api/email-templates/:id/preview?leadId=1 — resolve variables for display
    app.get('/api/email-templates/:id/preview', async (req, res) => {
        const id = parseInt(req.params.id, 10);
        const leadId = req.query.leadId != null ? parseInt(String(req.query.leadId), 10) : NaN;
        if (isNaN(id) || id < 1) return res.status(400).json({ error: 'Invalid template id' });
        if (isNaN(leadId) || leadId < 1) return res.status(400).json({ error: 'Valid leadId query is required' });
        try {
            const db = await getDb();
            initSchema(db);
            const template = getEmailTemplateById(db, id);
            if (!template) return res.status(404).json({ error: 'Template not found' });
            const lead = await getLeadById(db, leadId);
            if (!lead) return res.status(404).json({ error: 'Lead not found' });
            const profile = await getProfile(db);
            const { subject, body, unresolvedVars } = resolveTemplateVariables(template, lead, profile);
            res.json({ subject, body, unresolvedVars });
        } catch (err) {
            logger.error({ err }, 'Template preview failed');
            res.status(500).json({ error: 'Preview failed' });
        }
    });

    // POST /api/email-templates/:id/send-test — send one email via Mailgun with resolved vars
    app.post('/api/email-templates/:id/send-test', async (req, res) => {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id) || id < 1) return res.status(400).json({ error: 'Invalid template id' });
        const parsed = sendTestSchema.safeParse(req.body || {});
        if (!parsed.success) {
            const msg = parsed.error.errors.map((e) => e.message).join('; ') || 'Invalid request';
            return res.status(400).json({ error: msg });
        }
        const { toEmail, leadId } = parsed.data;
        try {
            const db = await getDb();
            initSchema(db);
            const template = getEmailTemplateById(db, id);
            if (!template) return res.status(404).json({ error: 'Template not found' });
            const lead = await getLeadById(db, leadId);
            if (!lead) return res.status(404).json({ error: 'Lead not found' });
            const profile = await getProfile(db);

            const { subject, body, unresolvedVars } = resolveTemplateVariables(template, lead, profile);
            const htmlContent = body && /<[a-z][\s\S]*>/i.test(body) ? body : null;
            const textContent = htmlContent ? null : (body || '');

            const sendResult = await sendMailgunEmail({
                to: toEmail,
                subject,
                text: textContent,
                html: htmlContent,
                tags: ['template_test'],
                variables: { leadId, templateId: id },
                profileOverride: profile,
            });

            if (!sendResult.ok) {
                logger.warn({ error: sendResult.error }, 'Mailgun send-test rejected');
                return res.status(502).json({ error: sendResult.error || 'Send failed' });
            }

            const previewText = (body || '').replace(/\s+/g, ' ').trim().slice(0, 120);
            res.json({ ok: true, subject, previewText, unresolvedVars });
        } catch (err) {
            logger.error({ err }, 'Send-test failed');
            res.status(500).json({ error: err.message || 'Send-test failed' });
        }
    });

    // POST /api/email-templates/:id/send-to-lead — send template to lead's contact email via Mailgun, log and update status
    app.post('/api/email-templates/:id/send-to-lead', async (req, res) => {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id) || id < 1) return res.status(400).json({ error: 'Invalid template id' });
        const parsed = sendToLeadSchema.safeParse(req.body || {});
        if (!parsed.success) {
            const msg = parsed.error.errors.map((e) => e.message).join('; ') || 'Invalid request';
            return res.status(400).json({ error: msg });
        }
        const { leadId } = parsed.data;
        try {
            const db = await getDb();
            initSchema(db);
            const template = getEmailTemplateById(db, id);
            if (!template) return res.status(404).json({ error: 'Template not found' });
            const lead = await getLeadById(db, leadId);
            if (!lead) return res.status(404).json({ error: 'Lead not found' });
            const toEmail = Array.isArray(lead.emails) && lead.emails[0] ? lead.emails[0] : (lead.emails || '').toString();
            if (!toEmail || toEmail === 'Not found' || toEmail === 'unknown' || !toEmail.trim()) {
                return res.status(400).json({ error: 'Lead has no valid contact email. Add or edit the contact email for this company first.' });
            }
            const profile = await getProfile(db);

            const { subject, body } = resolveTemplateVariables(template, lead, profile);
            const htmlContent = body && /<[a-z][\s\S]*>/i.test(body) ? body : null;
            const textContent = htmlContent ? null : (body || '');

            const senderEmailEnv = (process.env.MAILGUN_SENDER_EMAIL || '').trim();
            const mailgunFrom =
                senderEmailEnv ? `Mailgun Sandbox <${senderEmailEnv}>` : senderEmailEnv;

            const sendResult = await sendMailgunEmail({
                to: toEmail.trim(),
                subject: subject || '(No subject)',
                text: textContent,
                html: htmlContent,
                tags: ['template_send'],
                variables: { leadId, templateId: id },
                profileOverride: profile,
            });

            if (!sendResult.ok) {
                logger.warn({ error: sendResult.error }, 'Mailgun send-to-lead rejected');
                return res.status(502).json({ error: sendResult.error || 'Send failed' });
            }

            const senderEmail = mailgunFrom || senderEmailEnv || null;

            addEmailLog(db, {
                lead_id: leadId,
                template_id: id,
                brevo_message_id: null,
                provider: 'mailgun',
                provider_message_id: sendResult.providerMessageId || null,
                direction: 'outbound',
                status: 'sent',
                subject: subject || '(No subject)',
                body: (body || '').trim() || null,
                from_email: senderEmail,
                to_email: toEmail.trim(),
            });
            updateLead(db, leadId, { status: STATUS.EMAIL_SENT });
            addLeadActivity(db, leadId, 'email_sent', `Email sent to ${toEmail}: "${subject || '(No subject)'}"`);

            res.json({ ok: true, to: toEmail, subject: subject || '(No subject)' });
        } catch (err) {
            logger.error({ err }, 'Send-to-lead failed');
            res.status(500).json({ error: err.message || 'Send failed' });
        }
    });
}

module.exports = { mountEmailTemplates };
