/**
 * Bearer-token authentication middleware.
 *
 * Behaviour:
 *   - If ADMIN_TOKEN env var is set, requires `Authorization: Bearer <token>`.
 *   - If ADMIN_TOKEN is NOT set, passes through (backwards-compatible for local dev).
 *
 * This lets production deployments secure sensitive endpoints (profile, schedule)
 * by setting a single env var, while keeping the dev workflow frictionless.
 */

const logger = require('../lib/logger');

function authenticate(req, res, next) {
    const requiredToken = process.env.ADMIN_TOKEN;

    if (!requiredToken) {
        return next();
    }

    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';

    if (!token || token !== requiredToken) {
        logger.warn({ path: req.path, ip: req.ip }, 'Unauthorized access attempt');
        return res.status(401).json({ error: 'Unauthorized' });
    }

    next();
}

module.exports = { authenticate };
