/**
 * PostgreSQL connection pool for Supabase (or any Postgres).
 * DATABASE_URL is required — use the connection string from Supabase Project Settings → Database.
 * For connection pooling (recommended), use the "Transaction" pooler mode and port 6543.
 */

const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

// Allow skipping TLS verification when behind a proxy with a self-signed cert (e.g. corporate).
// Set PG_SSL_REJECT_UNAUTHORIZED=0 in .env to fix "self-signed certificate in certificate chain".
const sslRejectUnauthorized = process.env.PG_SSL_REJECT_UNAUTHORIZED !== '0';

const pool = connectionString
    ? new Pool({
          connectionString,
          max: 10,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 10000,
          ssl: { rejectUnauthorized: sslRejectUnauthorized },
      })
    : null;

module.exports = pool;
