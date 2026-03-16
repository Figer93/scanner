/**
 * 404 handler for /api/* routes that don't match any handler.
 */

function notFound(req, res, next) {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Not found' });
    }
    next();
}

module.exports = { notFound };
