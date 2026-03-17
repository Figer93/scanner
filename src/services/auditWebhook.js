const axios = require('axios');
const crypto = require('crypto');
const logger = require('../lib/logger');

function truncate(value, max = 1800) {
    const s = value == null ? '' : String(value);
    if (s.length <= max) return s;
    return s.slice(0, max - 1) + '…';
}

function safeJson(value, max = 1800) {
    try {
        return truncate(JSON.stringify(value), max);
    } catch {
        return truncate(String(value), max);
    }
}

function truncateSlackText(value) {
    // Slack incoming webhooks have practical message size limits; keep a safe ceiling.
    return truncate(value, 3900);
}

/**
 * Sends a structured audit message to Slack Incoming Webhook.
 *
 * Requires AUDIT_WEBHOOK_URL in env.
 *
 * @param {object} evt
 * @param {string} evt.action
 * @param {string} [evt.actor]
 * @param {string} [evt.resource]
 * @param {object} [evt.before]
 * @param {object} [evt.after]
 * @param {object} [evt.links]
 * @param {object} [evt.meta]
 */
async function sendAudit(evt) {
    const url = (process.env.AUDIT_WEBHOOK_URL || '').trim();
    if (!url) return;

    if (!/^https:\/\/hooks\.slack\.com\/services\//i.test(url)) {
        logger.warn({ url: url.slice(0, 48) + '…' }, 'AUDIT_WEBHOOK_URL does not look like a Slack Incoming Webhook URL');
    }

    const requestId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
    const ts = new Date().toISOString();
    const action = evt?.action ? String(evt.action) : 'audit_event';
    const actor = evt?.actor ? String(evt.actor) : 'system';
    const resource = evt?.resource ? String(evt.resource) : '';

    const lines = [
        `*Action:* ${truncate(action, 200)}`,
        `*Actor:* ${truncate(actor, 200)}`,
        resource ? `*Resource:* ${truncate(resource, 300)}` : null,
        `*Time:* ${ts}`,
        `*RequestId:* ${requestId}`,
    ].filter(Boolean);

    const details = [];
    if (evt?.links && typeof evt.links === 'object') {
        details.push(`*Links:* ${safeJson(evt.links, 800)}`);
    }
    if (evt?.meta && typeof evt.meta === 'object') {
        details.push(`*Meta:* ${safeJson(evt.meta, 1200)}`);
    }
    if (evt?.before !== undefined) {
        details.push(`*Before:* ${safeJson(evt.before, 1200)}`);
    }
    if (evt?.after !== undefined) {
        details.push(`*After:* ${safeJson(evt.after, 1200)}`);
    }

    const text = truncateSlackText(lines.join('\n') + (details.length ? `\n\n${details.join('\n')}` : ''));

    try {
        const res = await axios.post(
            url,
            { text },
            {
                timeout: 10_000,
                validateStatus: () => true,
                headers: { 'Content-Type': 'application/json' },
            }
        );
        const body = typeof res.data === 'string' ? res.data : safeJson(res.data, 400);
        // Slack incoming webhooks typically respond with HTTP 200 and body "ok".
        if (res.status < 200 || res.status >= 300 || (typeof res.data === 'string' && res.data.trim().toLowerCase() !== 'ok')) {
            logger.warn(
                { status: res.status, body },
                'Slack audit webhook rejected request'
            );
        }
    } catch (err) {
        logger.warn({ err: err?.message }, 'Slack audit webhook request failed');
    }
}

module.exports = { sendAudit };

