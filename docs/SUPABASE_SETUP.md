# Supabase (PostgreSQL) setup for CHScanner

The CHScanner backend uses **PostgreSQL only** (e.g. [Supabase](https://supabase.com)). You must set `DATABASE_URL` to your Supabase (or any Postgres) connection string before starting the app.

## 1. Create a Supabase project

1. Sign in at [supabase.com](https://supabase.com) and create a new project.
2. Wait for the project to be ready, then open **Project Settings → Database**.
3. Copy the **Connection string** (URI). Use the **Transaction** pooler if you run many short-lived connections; otherwise **Session** is fine.
   - Format: `postgresql://postgres.[ref]:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:5432/postgres`
   - Or direct: `postgresql://postgres:[YOUR-PASSWORD]@db.[ref].supabase.co:5432/postgres`

## 2. Set DATABASE_URL

Set the connection string in your environment (never commit it):

- **Local:** In `.env`:
  ```env
  DATABASE_URL=postgresql://postgres.[ref]:YOUR_PASSWORD@aws-0-xx.pooler.supabase.com:5432/postgres
  ```
- **Docker:** Pass with `-e` or a env file:
  ```bash
  docker run -e DATABASE_URL="postgresql://..." ...
  ```
- **Hosted (e.g. Railway, Render):** Add `DATABASE_URL` in the dashboard.

The app uses PostgreSQL for all data. `DATABASE_URL` is required at startup; the server will fail with a clear error if it is missing.

## 3. Run migrations

Create the schema in your Supabase (Postgres) database by running the init migration once.

**Option A – Supabase SQL Editor**

1. In the Supabase dashboard, open **SQL Editor**.
2. Paste the contents of `db/migrations/001_init.sql` and run it.

**Option B – psql**

```bash
psql "$DATABASE_URL" -f db/migrations/001_init.sql
```

**Option C – Node one-liner**

```bash
node -e "require('dotenv').config(); const fs=require('fs'); const {Pool}=require('pg'); const p=new Pool({connectionString:process.env.DATABASE_URL}); p.query(fs.readFileSync('db/migrations/001_init.sql','utf8')).then(()=>{console.log('Done');p.end();}).catch(e=>{console.error(e);p.end();process.exit(1);});"
```

After this, tables (`leads`, `profile`, `email_logs`, etc.) exist and the app can start.

## 4. (Optional) Migrate data from SQLite

If you have an existing `leads.db` (SQLite) and want to copy data into Postgres:

1. Ensure `DATABASE_URL` is set and the schema is applied (step 3).
2. Run the migration script:
   ```bash
   node scripts/migrate-sqlite-to-postgres.js
   ```
   Or with a custom path to the SQLite file:
   ```bash
   node scripts/migrate-sqlite-to-postgres.js /path/to/leads.db
   ```
3. The script reads all rows from the SQLite file and inserts them into PostgreSQL. Duplicate key errors are skipped so you can re-run it if needed.

## 5. Start the app

```bash
npm install
npm run build
npm start
```

The app will connect to Postgres and use it for all reads and writes.

## Troubleshooting

- **Connection refused / timeout:** Check that `DATABASE_URL` uses the correct host, port (usually 5432), and that your IP is allowed (Supabase: Settings → Database → Connection pooling / Network).
- **SSL:** Supabase requires SSL. The `pg` client uses SSL by default for `postgresql://`; if you use `?sslmode=require` in the URL, that’s fine too.
- **Schema errors:** Ensure `db/migrations/001_init.sql` was run exactly once. Re-running it is safe (it uses `CREATE TABLE IF NOT EXISTS`).
- **Permission errors:** The database user in `DATABASE_URL` must be allowed to create tables and read/write data (Supabase’s `postgres` user has this).
