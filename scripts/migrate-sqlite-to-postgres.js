#!/usr/bin/env node
/**
 * One-time migration: read SQLite leads.db and insert all rows into PostgreSQL (Supabase).
 *
 * Prerequisites:
 *   1. Set DATABASE_URL in .env (PostgreSQL connection string).
 *   2. Schema already applied in Supabase (db/migrations/001_init.sql).
 *
 * Usage:
 *   npm install sql.js   # one-time, for this script only
 *   node scripts/migrate-sqlite-to-postgres.js [path-to-leads.db]
 *
 * Default SQLite path: ./leads.db, then ./data/leads.db.
 * Uses batched inserts (500 rows per batch), preserves PKs/FKs, skips duplicates, prints progress and verification.
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');

let initSqlJs;
try {
    initSqlJs = require('sql.js');
} catch (_) {
    console.error('This script requires sql.js. Install it with: npm install sql.js');
    process.exit(1);
}

const { Pool } = require('pg');

const BATCH_SIZE = 500;

// Detect SQLite file: argv, then leads.db, then data/leads.db
function detectSqlitePath() {
    if (process.argv[2]) {
        const p = path.resolve(process.cwd(), process.argv[2]);
        if (fs.existsSync(p)) return p;
        return p; // still return so we fail with a clear "not found" below
    }
    const candidates = [
        path.join(process.cwd(), 'leads.db'),
        path.join(process.cwd(), 'data', 'leads.db'),
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    return candidates[0]; // default for error message
}

const SQLITE_PATH = detectSqlitePath();

const TABLES = [
    { name: 'profile', cols: ['key', 'value'], conflict: 'ON CONFLICT (key) DO NOTHING' },
    {
        name: 'leads',
        cols: [
            'id', 'company_name', 'company_number', 'address', 'postcode', 'website', 'emails', 'phones',
            'contact_form', 'status', 'ice_breaker', 'source', 'created_at', 'updated_at', 'score',
            'outreach_draft', 'score_reasoning', 'score_breakdown', 'website_services', 'website_size',
            'website_tech', 'assigned_to', 'source_metadata', 'date_of_creation', 'linkedin_url',
            'predicted_email', 'enrichment_status',
        ],
        conflict: 'ON CONFLICT (id) DO NOTHING',
    },
    {
        name: 'usage_log',
        cols: ['id', 'service', 'called_at', 'endpoint', 'input_tokens', 'output_tokens', 'request_count', 'estimated_cost_gbp'],
        conflict: 'ON CONFLICT (id) DO NOTHING',
    },
    {
        name: 'lead_activities',
        cols: ['id', 'lead_id', 'type', 'content', 'created_at'],
        conflict: 'ON CONFLICT (id) DO NOTHING',
    },
    {
        name: 'ch_cache',
        cols: ['company_number', 'company_name', 'address', 'postcode', 'date_of_creation', 'raw_json', 'updated_at'],
        conflict: 'ON CONFLICT (company_number) DO NOTHING',
    },
    {
        name: 'lists',
        cols: ['id', 'name', 'description', 'created_at', 'updated_at'],
        conflict: 'ON CONFLICT (id) DO NOTHING',
    },
    {
        name: 'list_lead',
        cols: ['id', 'list_id', 'lead_id', 'added_at'],
        conflict: 'ON CONFLICT (list_id, lead_id) DO NOTHING',
    },
    {
        name: 'email_templates',
        cols: ['id', 'name', 'subject', 'body', 'created_at', 'updated_at'],
        conflict: 'ON CONFLICT (id) DO NOTHING',
    },
    {
        name: 'email_logs',
        cols: ['id', 'lead_id', 'template_id', 'brevo_message_id', 'direction', 'status', 'subject', 'body', 'from_email', 'to_email', 'sent_at', 'updated_at'],
        conflict: 'ON CONFLICT (id) DO NOTHING',
    },
    {
        name: 'sequences',
        cols: ['id', 'name', 'created_at'],
        conflict: 'ON CONFLICT (id) DO NOTHING',
    },
    {
        name: 'sequence_steps',
        cols: ['id', 'sequence_id', 'step_number', 'template_id', 'delay_days', 'condition'],
        conflict: 'ON CONFLICT (id) DO NOTHING',
    },
    {
        name: 'sequence_enrolments',
        cols: ['id', 'sequence_id', 'lead_id', 'current_step', 'status', 'enrolled_at', 'next_send_at'],
        conflict: 'ON CONFLICT (sequence_id, lead_id) DO NOTHING',
    },
];

const SERIAL_TABLES = [
    'leads', 'usage_log', 'lead_activities', 'lists', 'list_lead',
    'email_templates', 'email_logs', 'sequences', 'sequence_steps', 'sequence_enrolments',
];

async function main() {
    if (!process.env.DATABASE_URL) {
        console.error('Set DATABASE_URL in .env (e.g. postgresql://user:pass@host:5432/dbname)');
        process.exit(1);
    }
    if (!fs.existsSync(SQLITE_PATH)) {
        console.error('SQLite file not found:', SQLITE_PATH);
        console.error('Usage: node scripts/migrate-sqlite-to-postgres.js [path-to-leads.db]');
        process.exit(1);
    }

    console.log('SQLite source:', SQLITE_PATH);
    console.log('PostgreSQL: DATABASE_URL (Supabase)');
    console.log('Batch size:', BATCH_SIZE);
    console.log('---');

    const SQL = await initSqlJs();
    const buf = fs.readFileSync(SQLITE_PATH);
    const db = new SQL.Database(buf);

    const sslRejectUnauthorized = process.env.PG_SSL_REJECT_UNAUTHORIZED !== '0';
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: sslRejectUnauthorized },
    });

    const run = (sql, params = []) => {
        const stmt = db.prepare(sql);
        stmt.bind(params);
        const rows = [];
        while (stmt.step()) rows.push(stmt.getAsObject());
        stmt.free();
        return rows;
    };

    // Collect valid parent IDs from SQLite so we can skip orphaned child rows (avoids FK violations).
    const leadIds = new Set();
    const listIds = new Set();
    const emailTemplateIds = new Set();
    const sequenceIds = new Set();

    try {
        for (const { name, cols, conflict } of TABLES) {
            const exists = run(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [name]);
            if (exists.length === 0) {
                console.log(`${name}: table not in SQLite — skip`);
                continue;
            }

            let rows = run(`SELECT * FROM ${name}`);
            const rowsRead = rows.length;

            // Filter child rows to only those whose FKs exist in migrated parent data (skip orphans).
            if (name === 'lead_activities') {
                const before = rows.length;
                rows = rows.filter((r) => leadIds.has(r.lead_id));
                if (before > rows.length) console.log(`  ${name}: skipped ${before - rows.length} orphaned (missing lead_id)`);
            } else if (name === 'list_lead') {
                const before = rows.length;
                rows = rows.filter((r) => listIds.has(r.list_id) && leadIds.has(r.lead_id));
                if (before > rows.length) console.log(`  ${name}: skipped ${before - rows.length} orphaned (missing list_id or lead_id)`);
            } else if (name === 'email_logs') {
                const before = rows.length;
                rows = rows.filter((r) => leadIds.has(r.lead_id) && (r.template_id == null || emailTemplateIds.has(r.template_id)));
                if (before > rows.length) console.log(`  ${name}: skipped ${before - rows.length} orphaned (missing lead_id or template_id)`);
            } else if (name === 'sequence_steps') {
                const before = rows.length;
                rows = rows.filter((r) => sequenceIds.has(r.sequence_id) && emailTemplateIds.has(r.template_id));
                if (before > rows.length) console.log(`  ${name}: skipped ${before - rows.length} orphaned (missing sequence_id or template_id)`);
            } else if (name === 'sequence_enrolments') {
                const before = rows.length;
                rows = rows.filter((r) => sequenceIds.has(r.sequence_id) && leadIds.has(r.lead_id));
                if (before > rows.length) console.log(`  ${name}: skipped ${before - rows.length} orphaned (missing sequence_id or lead_id)`);
            }

            if (rows.length === 0) {
                console.log(`${name}: rows read: ${rowsRead}, rows inserted: 0${rowsRead > 0 ? ' (all filtered as orphaned)' : ''}`);
                continue;
            }

            const first = rows[0];
            const availableCols = cols.filter((c) => c in first);
            if (availableCols.length === 0) {
                console.log(`${name}: no matching columns — skip`);
                continue;
            }

            // Record parent IDs for subsequent child tables (use current rows, which may be filtered).
            if (name === 'leads') rows.forEach((r) => leadIds.add(r.id));
            if (name === 'lists') rows.forEach((r) => listIds.add(r.id));
            if (name === 'email_templates') rows.forEach((r) => emailTemplateIds.add(r.id));
            if (name === 'sequences') rows.forEach((r) => sequenceIds.add(r.id));

            const colList = availableCols.join(', ');
            let inserted = 0;

            for (let i = 0; i < rows.length; i += BATCH_SIZE) {
                const batch = rows.slice(i, i + BATCH_SIZE);
                const placeholders = batch.map((_, b) =>
                    '(' + availableCols.map((_, c) => `$${b * availableCols.length + c + 1}`).join(', ') + ')'
                ).join(', ');
                const values = batch.flatMap((row) => availableCols.map((c) => row[c] ?? null));
                const sql = `INSERT INTO ${name} (${colList}) VALUES ${placeholders} ${conflict}`;
                const result = await pool.query(sql, values);
                inserted += result.rowCount ?? 0;
            }

            console.log(`${name}: rows read: ${rowsRead}, rows inserted: ${inserted}`);
        }

        // Reset sequences so future INSERTs get correct next id
        for (const table of SERIAL_TABLES) {
            try {
                await pool.query(
                    `SELECT setval(pg_get_serial_sequence($1, 'id'), (SELECT COALESCE(MAX(id), 1) FROM "${table}"))`,
                    [table]
                );
            } catch (_) {
                // table may not have id or sequence
            }
        }

        console.log('---');
        console.log('Verification (PostgreSQL row counts):');

        for (const { name } of TABLES) {
            try {
                const r = await pool.query(`SELECT COUNT(*) AS c FROM ${name}`);
                const count = parseInt(r.rows[0]?.c ?? '0', 10);
                console.log(`  ${name}: ${count}`);
            } catch (e) {
                console.log(`  ${name}: error — ${e.message}`);
            }
        }

        db.close();
        await pool.end();

        console.log('---');
        console.log('Migration complete.');
    } catch (err) {
        console.error(err);
        db.close();
        await pool.end();
        process.exit(1);
    }
}

main();
