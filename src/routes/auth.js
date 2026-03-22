/**
 * /api/auth/* — dashboard login against ADMIN_TOKEN (no separate user DB).
 * Set ADMIN_TOKEN in Railway / .env to require login; omit for open local dev.
 */

const crypto = require('crypto');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const logger = require('../lib/logger');

const loginBodySchema = z.object({
    password: z.string().min(1).max(512),
});

function timingSafeEqualString(a, b) {
    const aa = Buffer.from(String(a), 'utf8');
    const bb = Buffer.from(String(b), 'utf8');
    if (aa.length !== bb.length) return false;
    return crypto.timingSafeEqual(aa, bb);
}

function mountAuth(app) {
    app.get('/api/auth/status', (req, res) => {
        const t = process.env.ADMIN_TOKEN;
        const authRequired = Boolean(t && String(t).length > 0);
        res.json({ authRequired });
    });

    app.post('/api/auth/login', validate(loginBodySchema), (req, res) => {
        const required = process.env.ADMIN_TOKEN;
        if (!required) {
            return res.json({ ok: true, authRequired: false, message: 'Auth disabled (ADMIN_TOKEN not set).' });
        }
        const password = req.body.password;
        if (!timingSafeEqualString(password, required)) {
            logger.warn({ path: req.path, ip: req.ip }, 'Dashboard login failed');
            return res.status(401).json({ error: 'Invalid password' });
        }
        res.json({ ok: true, authRequired: true });
    });
}

module.exports = { mountAuth };
