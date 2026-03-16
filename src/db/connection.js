/**
 * Database connection layer — PostgreSQL (Supabase) only.
 * All db/* modules use the same adapter interface: query, queryOne, run, runReturningId ($1, $2 params).
 * Requires DATABASE_URL (Supabase connection string).
 */

const logger = require('../lib/logger');
const pool = require('./postgres');

function usePostgres() {
    return Boolean(process.env.DATABASE_URL);
}

const STATUS = Object.freeze({
    NEW: 'New',
    ENRICHED: 'Enriched',
    CONTACTED: 'Contacted',
    QUALIFIED: 'Qualified',
    CONVERTED: 'Converted',
    EMAIL_SENT: 'Email Sent',
    OPENED: 'Opened',
    WAITING_FOR_REPLY: 'Waiting for Reply',
    REPLIED: 'Replied',
});
const STATUS_VALUES = Object.values(STATUS);
const STATUS_KANBAN_COLUMNS = ['New', 'Enriched', 'Email Sent', 'Opened', 'Waiting for Reply', 'Replied', 'Converted'];

const LEAD_SOURCE = Object.freeze({
    JSON_FILE: 'json_file',
    COMPANIES_HOUSE: 'companies_house',
    GOOGLE_MAPS: 'google_maps',
    CHARITY_COMMISSION: 'charity_commission',
    FCA_REGISTER: 'fca_register',
    LINKEDIN: 'linkedin',
});

/** Default DB path (legacy; ignored when using PostgreSQL). Kept for getDb(dbPath) signature compatibility. */
const DEFAULT_DB_PATH = null;

/**
 * Returns a PostgreSQL database adapter.
 * @returns {Promise<{ query: Function, queryOne: Function, run: Function, runReturningId: Function }>}
 */
async function getDb() {
    if (!pool) {
        throw new Error(
            'DATABASE_URL is not set. Set DATABASE_URL to your Supabase PostgreSQL connection string (Project Settings → Database).'
        );
    }
    return {
        query(sql, params = []) {
            return pool.query(sql, params).then((r) => r.rows);
        },
        queryOne(sql, params = []) {
            return pool.query(sql, params).then((r) => (r.rows[0] ?? null));
        },
        run(sql, params = []) {
            return pool.query(sql, params).then(() => {});
        },
        runReturningId(sql, params = []) {
            return pool.query(sql, params).then((r) => {
                const row = r.rows[0];
                return { id: row ? (row.id ?? row.ID) : null };
            });
        },
    };
}

function saveDb() {
    // No-op: PostgreSQL has no in-memory save step.
}

async function closeDb() {
    if (pool) {
        await pool.end().catch((err) => logger.warn({ err: err.message }, 'Pool close error'));
    }
}

module.exports = {
    usePostgres,
    DEFAULT_DB_PATH,
    STATUS,
    STATUS_VALUES,
    STATUS_KANBAN_COLUMNS,
    LEAD_SOURCE,
    getDb,
    saveDb,
    closeDb,
};
