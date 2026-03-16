# CHScanner Deployment

This guide covers production deployment: build, serve, environment variables, and operational notes.

## Build

1. Install dependencies (root and UI):

   ```bash
   npm install
   cd ui && npm install && cd ..
   ```

2. Build the UI and copy to `dist/`:

   ```bash
   npm run build
   ```

   This runs `cd ui && npm run build` then `node scripts/copy-ui-dist.js`, producing the static app in the root `dist/` folder.

3. Start the server:

   ```bash
   npm start
   ```

   The server listens on `PORT` (default 3001) and serves:

   - Static files from `dist/` (the React app)
   - All `/api/*` and Socket.IO on the same host

Use a reverse proxy (e.g. nginx, Caddy) in front for HTTPS and optional rate limiting. Do not expose the Node process directly to the internet without TLS.

## Environment variables

Set these in the environment or in a `.env` file (root of the project). Keys stored in the **Profile** page (database) override these at runtime.

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP server port | `3001` |
| `NODE_ENV` | Set to `production` in production | — |
| `DATABASE_URL` | **Required.** PostgreSQL connection string (e.g. Supabase) | — |
| `LOG_LEVEL` | Log level (e.g. `info`, `debug`) | — |
| `LOG_PRETTY` | Set to `1` for pretty-printed logs (dev) | — |
| `SERPER_API_KEY` | Serper search API key (required for pipeline) | — |
| `COMPANIES_HOUSE_API_KEY` | Companies House REST API key | — |
| `GOOGLE_PLACES_API_KEY` | Google Places API key (Maps source) | — |
| `GOOGLE_AI_API_KEY` | Google AI Studio (Gemini) key | — |
| `LEAD_SCORING_CRITERIA` | Default criteria for lead scoring | — |
| `CRON_SCHEDULE` | Cron expression for scheduled pipeline runs | — |
| `SCHEDULED_RUN_SOURCE` | Source for scheduled runs | `companies_house` |
| `SCHEDULED_RUN_LIMIT` | Limit for scheduled runs | `20` |
| `WEBHOOK_URL` | Optional webhook for high-score/status events | — |
| `WEBHOOK_SCORE_THRESHOLD` | Score threshold for webhook | `7` |

See `.env.example` for more optional keys (CRM, Apify, team members, etc.).

## Process management

For production, run the Node process under a process manager so it restarts on crash and can be stopped/started cleanly.

Example with **PM2**:

```bash
npm install -g pm2
pm2 start src/server.js --name chscanner
pm2 save
pm2 startup
```

Ensure `DATABASE_URL` is set in the environment. If you use a systemd unit or similar, set `WorkingDirectory` to the project root.

## Data and logs

- **Database:** PostgreSQL (Supabase or any Postgres). Schema is applied via migrations (see `db/migrations/001_init.sql` and [docs/SUPABASE_SETUP.md](SUPABASE_SETUP.md)). Back up your Supabase/Postgres database via your provider.
- **Logs:** Application logs go to stdout/stderr. The in-memory log buffer and optional file log (`data/logs/app.log`) are created at runtime; ensure the process can write to `data/logs` if you use file logging.

## Security

- **Secrets:** Never commit `.env` or put API keys in client-side code. The UI only receives masked profile values from `GET /api/profile`.
- **HTTPS:** Put the app behind HTTPS (reverse proxy or load balancer). Socket.IO will use the same scheme as the page.
- **CORS:** The server uses permissive CORS; tighten in production if the app is only served from specific origins.
- **Rate limiting:** Consider adding rate limiting (e.g. express-rate-limit) on `/api` if the app is public-facing.

## Health and monitoring

- There is no dedicated `/health` endpoint. A simple check is `GET /api/db/stats` or `GET /api/profile` (both require no auth and return JSON).
- Monitor your Postgres/Supabase usage and logs, and monitor external API usage (Companies House, Serper, Google) to stay within quotas.
