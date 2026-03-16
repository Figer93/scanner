# CHScanner Cloud Deployment

This document describes how to deploy CHScanner to a cloud or container environment.

## Required environment variables

Configure the following in your runtime (e.g. container env, orchestrator secrets, or `.env`):

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | **Yes** | PostgreSQL connection string (e.g. Supabase). Get from Project Settings → Database. |
| `NODE_ENV` | No | Set to `production` in production. Affects logging and SSL for Postgres. |
| `PORT` | No | Server port. Default: `3001`. |
| `ADMIN_TOKEN` | No | Optional token for admin-protected endpoints. |
| `SERPER_API_KEY` | No | Serper API key for website discovery (if using that feature). |
| `BREVO_API_KEY` | No | Brevo API key for sending email (if using email sequences). |
| `BREVO_WEBHOOK_SECRET` | **Yes for webhooks** | Shared secret for Brevo webhook verification. Must be set if you use Brevo webhooks; requests without a valid secret receive **403 Forbidden**. |
| `ALLOWED_ORIGINS` | No | Comma-separated CORS origins (e.g. `https://app.example.com`). |

Optional: `LOG_LEVEL`, `LOG_PRETTY`, `LOG_FILE`, and other app-specific variables. See `.env.example` in the repo root for the full list.

## Docker build and run

### Build

From the repository root:

```bash
docker build -t chscanner:latest .
```

The image uses **Node 20**, builds the UI from `ui/`, copies `ui/dist` into the backend `dist/`, and installs **Playwright Chromium** for pipeline/export. The server starts with `node src/server.js`.

### Run

Pass `DATABASE_URL` (Supabase or any Postgres connection string). No volume is needed for the database; data lives in Postgres.

```bash
docker run -d \
  --name chscanner \
  -p 3001:3001 \
  -e DATABASE_URL="postgresql://..." \
  -e NODE_ENV=production \
  -e BREVO_WEBHOOK_SECRET=your_webhook_secret \
  -e BREVO_API_KEY=your_brevo_api_key \
  chscanner:latest
```

### Docker Compose example

```yaml
services:
  chscanner:
    build: .
    ports:
      - "3001:3001"
    environment:
      DATABASE_URL: ${DATABASE_URL}
      NODE_ENV: production
      BREVO_WEBHOOK_SECRET: ${BREVO_WEBHOOK_SECRET}
      BREVO_API_KEY: ${BREVO_API_KEY}
      ALLOWED_ORIGINS: https://your-frontend.com
```

Ensure the schema is applied in your Supabase/Postgres instance (see [SUPABASE_SETUP.md](SUPABASE_SETUP.md)).

## Webhook configuration (Brevo)

1. **Set `BREVO_WEBHOOK_SECRET`** in the environment (or in the app Profile). The same value must be configured in Brevo.
2. In Brevo: configure your transactional and/or Inbound Parse webhook URLs to point to your deployed app:
   - Transactional events (opens, clicks, etc.): `https://your-domain/api/webhooks/brevo`
   - Inbound (replies): `https://your-domain/api/webhooks/brevo/inbound`
3. Pass the secret in requests:
   - **Query:** `?secret=YOUR_SECRET`
   - **Header:** `x-webhook-secret: YOUR_SECRET`
4. Requests that do not include the correct secret receive **403 Forbidden**. Webhook events are logged for auditing.

## Health check endpoint

Use for load balancers and orchestration:

- **URL:** `GET /api/health`
- **Response (200 when healthy):**

```json
{
  "status": "ok",
  "uptime": 123.456,
  "timestamp": 1640000000000,
  "database": { "available": true }
}
```

- If the database is unavailable, `status` is `degraded` and `database.available` is `false` (response code **503**).

Example (Docker healthcheck):

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1
```

Or with `curl` in the image:

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s CMD curl -f http://localhost:3001/api/health || exit 1
```

## Logging

- Logs go to **stdout** by default (suitable for containers and log aggregation). A writable filesystem is not required.
- Optional: set `LOG_FILE` to a path (e.g. `/var/log/chscanner/app.log`) to also write logs to a file. Ensure the directory exists and is writable.

## Build validation (local)

To confirm the project builds and runs:

```bash
npm install
npm run build
npm start
```

Then open `http://localhost:3001` and call `GET http://localhost:3001/api/health`.
