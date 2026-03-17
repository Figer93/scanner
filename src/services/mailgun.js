/**
 * Mailgun email sender — single place to send transactional email.
 * All callers should go through sendMailgunEmail so we can
 * centralise error handling, logging, and provider ids.
 */

const axios = require('axios');
const logger = require('../lib/logger');
const { getProfile, getDb } = require('./database');

function getMailgunConfigFromProfile(profile) {
    const apiKey = (profile.mailgun_api_key || process.env.MAILGUN_API_KEY || '').trim();
    const domain = (profile.mailgun_domain || process.env.MAILGUN_DOMAIN || '').trim();
    const region = (profile.mailgun_region || process.env.MAILGUN_REGION || 'us').trim().toLowerCase();
    const fromEmail = (profile.sender_email || process.env.MAILGUN_SENDER_EMAIL || process.env.BREVO_SENDER_EMAIL || '').trim();
    const fromName = (profile.sender_name || process.env.MAILGUN_SENDER_NAME || process.env.BREVO_SENDER_NAME || 'CHScanner').trim();

    const baseUrl = region === 'eu'
        ? 'https://api.eu.mailgun.net/v3'
        : 'https://api.mailgun.net/v3';

    return {
        apiKey,
        domain,
        region,
        fromEmail,
        fromName,
        baseUrl,
    };
}

/**
 * Send an email via Mailgun.
 *
 * @param {object} options
 * @param {string} options.to - recipient email
 * @param {string} options.subject
 * @param {string|null} options.text
 * @param {string|null} options.html
 * @param {object} [options.headers]
 * @param {string[]} [options.tags]
 * @param {object} [options.variables]
 * @param {object} [options.profileOverride] - optional profile object to use instead of loading from DB
 * @returns {Promise<{ ok: boolean, error?: string, providerMessageId?: string }>}
 */
async function sendMailgunEmail({
    to,
    subject,
    text,
    html,
    headers,
    tags,
    variables,
    profileOverride,
}) {
    if (!to || !String(to).trim()) {
        return { ok: false, error: 'Recipient email required' };
    }
    if (!subject || !String(subject).trim()) {
        return { ok: false, error: 'Subject required' };
    }

    let profile = profileOverride;
    if (!profile) {
        const db = await getDb();
        profile = await getProfile(db);
    }

    const cfg = getMailgunConfigFromProfile(profile || {});
    if (!cfg.apiKey || !cfg.domain || !cfg.fromEmail) {
        return { ok: false, error: 'Mailgun not configured' };
    }

    const url = `${cfg.baseUrl}/${encodeURIComponent(cfg.domain)}/messages`;

    const form = new URLSearchParams();
    form.set('from', cfg.fromName ? `${cfg.fromName} <${cfg.fromEmail}>` : cfg.fromEmail);
    form.set('to', to);
    form.set('subject', subject);
    if (html && html.trim()) {
        form.set('html', html);
    }
    if ((!html || !html.trim()) && text && text.trim()) {
        form.set('text', text);
    }
    if (Array.isArray(tags) && tags.length > 0) {
        for (const tag of tags) {
            if (tag && String(tag).trim()) {
                form.append('o:tag', String(tag).trim());
            }
        }
    }
    if (variables && typeof variables === 'object') {
        form.set('h:X-CHScanner-Metadata', JSON.stringify(variables));
    }
    if (headers && typeof headers === 'object') {
        Object.entries(headers).forEach(([k, v]) => {
            if (!k || v == null) return;
            form.set(`h:${k}`, String(v));
        });
    }

    try {
        const res = await axios.post(url, form.toString(), {
            auth: { username: 'api', password: cfg.apiKey },
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            validateStatus: () => true,
        });

        if (res.status < 200 || res.status >= 300) {
            const msg = res.data?.message || res.statusText || 'Mailgun send failed';
            logger.warn({ status: res.status, data: res.data }, 'Mailgun send rejected');
            return { ok: false, error: msg };
        }

        const providerMessageId = res.data?.id || res.headers['message-id'] || null;
        return { ok: true, providerMessageId: providerMessageId || null };
    } catch (err) {
        logger.error({ err: err.message }, 'Mailgun send failed');
        return { ok: false, error: err.message || 'Mailgun send failed' };
    }
}

module.exports = {
    sendMailgunEmail,
    getMailgunConfigFromProfile,
};

