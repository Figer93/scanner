/**
 * GET /api/logs — in-memory log entries
 */

const { logBuffer, MAX_LOG_ENTRIES } = require('../serverContext');

function mountLogs(app) {
    app.get('/api/logs', (req, res) => {
        const limit = Math.min(MAX_LOG_ENTRIES, parseInt(req.query.limit, 10) || MAX_LOG_ENTRIES);
        const entries = limit >= logBuffer.length ? logBuffer : logBuffer.slice(-limit);
        res.json({ entries });
    });
}

module.exports = { mountLogs };
