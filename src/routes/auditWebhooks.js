/**
 * Audit webhook receivers (Railway-hosted backend).
 *
 * - GitHub: POST /api/webhooks/github (signature verified)
 * - Railway: POST /api/webhooks/railway (shared secret header)
 * - Admin test: POST /api/audit/test (bearer ADMIN_TOKEN via authenticate middleware)
 */

const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const logger = require('../lib/logger');
const { sendAudit } = require('../services/auditWebhook');
const { authenticate } = require('../middleware/authenticate');
const { validate } = require('../middleware/validate');

function timingSafeEqualHex(a, b) {
    if (!a || !b) return false;
    const ab = Buffer.from(String(a), 'utf8');
    const bb = Buffer.from(String(b), 'utf8');
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
}

function verifyGitHubSignature(req, res, next) {
    const secret = (process.env.GITHUB_WEBHOOK_SECRET || '').trim();
    if (!secret) return res.status(403).json({ error: 'GITHUB_WEBHOOK_SECRET not set' });

    const sig = (req.header('x-hub-signature-256') || '').toString();
    if (!sig.startsWith('sha256=')) return res.status(403).json({ error: 'Invalid signature' });

    const raw = req.body; // Buffer from express.raw
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
    if (!timingSafeEqualHex(sig, expected)) return res.status(403).json({ error: 'Invalid signature' });
    next();
}

function verifySharedSecret(headerName, envName) {
    return (req, res, next) => {
        const expected = (process.env[envName] || '').toString().trim();
        if (!expected) return res.status(403).json({ error: `${envName} not set` });
        const provided = (req.header(headerName) || '').toString().trim();
        if (!provided) return res.status(403).json({ error: 'Forbidden' });
        if (!timingSafeEqualHex(provided, expected)) return res.status(403).json({ error: 'Forbidden' });
        next();
    };
}

function summarizeGitHubEvent(eventName, payload) {
    const repo = payload?.repository?.full_name || '';
    const sender = payload?.sender?.login || 'unknown';

    if (eventName === 'pull_request') {
        const action = payload?.action || '';
        const pr = payload?.pull_request;
        return {
            action: `github.pull_request.${action}`,
            actor: sender,
            resource: repo ? `${repo}#${pr?.number}` : `PR#${pr?.number}`,
            links: { url: pr?.html_url },
            meta: {
                title: pr?.title,
                state: pr?.state,
                merged: pr?.merged,
                base: pr?.base?.ref,
                head: pr?.head?.ref,
            },
        };
    }

    if (eventName === 'check_run') {
        const action = payload?.action || '';
        const cr = payload?.check_run;
        return {
            action: `github.check_run.${action}`,
            actor: sender,
            resource: repo ? `${repo}:${cr?.name}` : cr?.name,
            links: { url: cr?.html_url },
            meta: {
                status: cr?.status,
                conclusion: cr?.conclusion,
                head_sha: cr?.head_sha,
            },
        };
    }

    if (eventName === 'push') {
        return {
            action: 'github.push',
            actor: sender,
            resource: repo ? `${repo}:${payload?.ref}` : payload?.ref,
            links: { compare: payload?.compare },
            meta: { commits: Array.isArray(payload?.commits) ? payload.commits.length : 0 },
        };
    }

    return {
        action: `github.${eventName || 'event'}`,
        actor: sender,
        resource: repo,
        meta: { action: payload?.action },
    };
}

const auditTestSchema = z.object({
    action: z.string().default('audit.test'),
    resource: z.string().optional(),
});

function mountAuditWebhooks(app) {
    // GitHub needs raw body for signature verification.
    app.post(
        '/api/webhooks/github',
        express.raw({ type: 'application/json' }),
        verifyGitHubSignature,
        async (req, res) => {
            try {
                const eventName = (req.header('x-github-event') || '').toString();
                const payload = JSON.parse(req.body.toString('utf8') || '{}');
                const evt = summarizeGitHubEvent(eventName, payload);
                await sendAudit(evt);
                res.json({ ok: true });
            } catch (err) {
                logger.error({ err }, 'GitHub webhook failed');
                res.status(500).json({ error: 'Webhook failed' });
            }
        }
    );

    // Railway: optional; accepts any JSON with shared secret.
    app.post(
        '/api/webhooks/railway',
        verifySharedSecret('x-webhook-secret', 'RAILWAY_WEBHOOK_SECRET'),
        async (req, res) => {
            try {
                await sendAudit({
                    action: 'railway.webhook',
                    actor: 'railway',
                    resource: 'railway',
                    meta: req.body || {},
                });
                res.json({ ok: true });
            } catch (err) {
                logger.error({ err }, 'Railway webhook failed');
                res.status(500).json({ error: 'Webhook failed' });
            }
        }
    );

    // Admin-only test endpoint to verify Slack wiring.
    app.post('/api/audit/test', authenticate, validate(auditTestSchema), async (req, res) => {
        try {
            await sendAudit({
                action: req.body.action,
                actor: req.user?.sub || 'admin',
                resource: req.body.resource || 'chscanner',
                meta: { ok: true },
            });
            res.json({ ok: true });
        } catch (err) {
            logger.error({ err }, 'Audit test failed');
            res.status(500).json({ error: 'Audit test failed' });
        }
    });
}

module.exports = { mountAuditWebhooks };

