/**
 * Public marketing endpoints.
 *
 * POST /api/welcome/contact — contact form backed by Mailgun.
 */

const { z } = require('zod');
const logger = require('../lib/logger');
const { getDb, initSchema, getProfile } = require('../services/database');
const { sendMailgunEmail } = require('../services/mailgun');
const { validate } = require('../middleware/validate');

const welcomeContactSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().email(),
  company: z
    .string()
    .trim()
    .optional()
    .transform((v) => {
      const s = (v ?? '').trim();
      return s ? s : undefined;
    }),
  website: z
    .string()
    .trim()
    .optional()
    .transform((v) => {
      const s = (v ?? '').trim();
      return s ? s : undefined;
    }),
  message: z.string().trim().min(10),
  consent: z.boolean().refine((v) => v === true, { message: 'Consent is required' }),
});

function normaliseWebsite(raw) {
  if (!raw) return undefined;
  const s = String(raw).trim();
  if (!s) return undefined;
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

function buildContactEmailText({ name, email, company, website, message }) {
  const lines = [
    'New welcome contact enquiry',
    '',
    `Name: ${name}`,
    `Email: ${email}`,
    company ? `Company: ${company}` : null,
    website ? `Website: ${website}` : null,
    '',
    'Message:',
    message,
  ].filter(Boolean);
  return lines.join('\n');
}

function buildContactEmailSubject({ name, company }) {
  if (company) return `Welcome setup enquiry — ${company} (${name})`;
  return `Welcome setup enquiry — ${name}`;
}

function mountWelcome(app) {
  app.post('/api/welcome/contact', validate(welcomeContactSchema), async (req, res) => {
    try {
      const db = await getDb();
      initSchema(db);
      const profile = await getProfile(db);

      const ownerEmail = (profile?.sender_email || process.env.MAILGUN_SENDER_EMAIL || process.env.BREVO_SENDER_EMAIL || '').trim();
      if (!ownerEmail) {
        return res.status(500).json({ error: 'Email sender not configured' });
      }

      const parsed = req.body || {};
      const payload = {
        name: parsed.name,
        email: parsed.email,
        company: parsed.company,
        website: normaliseWebsite(parsed.website),
        message: parsed.message,
      };

      const subject = buildContactEmailSubject({ name: payload.name, company: payload.company });
      const text = buildContactEmailText(payload);

      const sendResult = await sendMailgunEmail({
        to: ownerEmail,
        subject,
        text,
        tags: ['welcome_contact'],
        replyTo: payload.email,
        profileOverride: profile,
      });

      if (!sendResult.ok) {
        logger.warn({ error: sendResult.error }, 'Welcome contact send rejected');
        return res.status(502).json({ error: sendResult.error || 'Send failed' });
      }

      res.json({ ok: true });
    } catch (err) {
      logger.error({ err }, 'Welcome contact failed');
      res.status(500).json({ error: 'Failed to send message' });
    }
  });
}

module.exports = { mountWelcome };

