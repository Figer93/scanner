/**
 * Schema initialisation — no-op when using Supabase PostgreSQL.
 * Schema is managed by Supabase migrations (see db/migrations/001_init.sql).
 * initSchema is kept for API compatibility so existing route code can still call it.
 */

/**
 * No-op. Schema is created and evolved via Supabase migrations.
 * @param {object} _db - Ignored; kept for signature compatibility.
 */
function initSchema(_db) {
    // Schema is managed in Supabase; no runtime init.
}

module.exports = { initSchema };
