/**
 * Production health endpoint for load balancers and orchestration.
 * GET /api/health — returns status, uptime, timestamp; optionally checks DB.
 */

const { getDb, initSchema } = require('../services/database');
const logger = require('../lib/logger');

async function checkDb() {
    try {
        const db = await getDb();
        initSchema(db);
        return { ok: true };
    } catch (err) {
        logger.warn({ err: err.message }, 'Health check DB probe failed');
        return { ok: false, error: err.message };
    }
}

function mountHealth(app) {
    app.get('/api/health', async (_req, res) => {
        const payload = {
            status: 'ok',
            uptime: process.uptime(),
            timestamp: Date.now(),
        };
        const dbCheck = await checkDb();
        if (!dbCheck.ok) {
            payload.status = 'degraded';
            payload.database = { available: false, error: dbCheck.error };
        } else {
            payload.database = { available: true };
        }
        const statusCode = payload.status === 'ok' ? 200 : 503;
        res.status(statusCode).json(payload);
    });
}

module.exports = { mountHealth };
