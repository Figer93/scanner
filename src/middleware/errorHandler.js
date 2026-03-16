/**
 * Central Express error handler (4-arg). Attach last after all routes.
 * Returns generic error messages to clients — never leaks internal details.
 */

const logger = require('../lib/logger');

function errorHandler(err, req, res, _next) {
    logger.error({ err, path: req.path, method: req.method }, 'Unhandled request error');
    const status = err.status ?? err.statusCode ?? 500;
    if (!res.headersSent) {
        // Return generic message to prevent internal detail leakage
        const message = status < 500 ? (err.message || 'Bad request') : 'Internal server error';
        res.status(status).json({ error: message });
    }
}

module.exports = { errorHandler };
