/**
 * Zod validation middleware factory.
 *
 * Usage:
 *   const { z } = require('zod');
 *   const { validate } = require('../middleware/validate');
 *
 *   app.post('/api/foo', validate(myZodSchema), handler);
 *
 * Validates req.body against the schema. On failure, returns 400
 * with structured error details. On success, replaces req.body
 * with the parsed (coerced/defaulted) result.
 */

function validate(schema) {
    return (req, res, next) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            const errors = result.error.issues.map((issue) => ({
                path: issue.path.join('.'),
                message: issue.message,
            }));
            return res.status(400).json({ error: 'Validation failed', details: errors });
        }
        req.body = result.data;
        next();
    };
}

/**
 * Validates req.query against a schema (for GET endpoints with query params).
 */
function validateQuery(schema) {
    return (req, res, next) => {
        const result = schema.safeParse(req.query);
        if (!result.success) {
            const errors = result.error.issues.map((issue) => ({
                path: issue.path.join('.'),
                message: issue.message,
            }));
            return res.status(400).json({ error: 'Validation failed', details: errors });
        }
        req.query = result.data;
        next();
    };
}

/**
 * Validates req.params against a schema.
 */
function validateParams(schema) {
    return (req, res, next) => {
        const result = schema.safeParse(req.params);
        if (!result.success) {
            const errors = result.error.issues.map((issue) => ({
                path: issue.path.join('.'),
                message: issue.message,
            }));
            return res.status(400).json({ error: 'Validation failed', details: errors });
        }
        req.params = result.data;
        next();
    };
}

module.exports = { validate, validateQuery, validateParams };
