/**
 * Shared server state and helpers used by route modules.
 * Must be initialized by server.js via initServerContext() before mounting routes.
 */

const path = require('path');
const fs = require('fs');
const logger = require('./lib/logger');

const MAX_LOG_ENTRIES = 1000;
const logBuffer = [];
const LOG_FILE_DIR = path.join(process.cwd(), 'data', 'logs');
const LOG_FILE_PATH = path.join(LOG_FILE_DIR, 'app.log');

let _io = null;

const backgroundJob = {
    running: false,
    job: null,
    processed: 0,
    total: 0,
    error: null
};

function initServerContext(io) {
    _io = io;
}

function persistAndEmitLog(message) {
    const msg = String(message ?? '');
    const entry = { id: Date.now(), time: new Date().toISOString(), message: msg };
    logBuffer.push(entry);
    if (logBuffer.length > MAX_LOG_ENTRIES) logBuffer.splice(0, logBuffer.length - MAX_LOG_ENTRIES);
    try {
        if (!fs.existsSync(LOG_FILE_DIR)) fs.mkdirSync(LOG_FILE_DIR, { recursive: true });
        fs.appendFileSync(LOG_FILE_PATH, entry.time + ' ' + msg.replace(/\n/g, ' ') + '\n');
    } catch (_) {}
    if (_io) _io.emit('log', msg);
}

async function fireWebhookIfConfigured(db, lead, event, extra = {}) {
    const { getProfile } = require('./services/database');
    const profile = await getProfile(db);
    const url = (profile.webhook_url || process.env.WEBHOOK_URL || '').trim();
    if (!url) return Promise.resolve();
    const threshold = parseInt(profile.webhook_score_threshold || process.env.WEBHOOK_SCORE_THRESHOLD || '7', 10) || 7;
    if (event === 'score' && (lead.score == null || lead.score < threshold)) return Promise.resolve();
    const payload = { event, lead: { id: lead.id, company_name: lead.company_name, company_number: lead.company_number, status: lead.status, score: lead.score }, ...extra };
    return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }).then((res) => {
        if (!res.ok) logger.warn({ status: res.status, url }, 'Webhook POST failed');
    }).catch((err) => {
        logger.warn({ err: err.message, url }, 'Webhook request error');
    });
}

module.exports = {
    MAX_LOG_ENTRIES,
    logBuffer,
    backgroundJob,
    initServerContext,
    persistAndEmitLog,
    fireWebhookIfConfigured
};
