# Railway monitoring (builds + health)

So the assistant (or you) can check build and health status **without you pasting logs or screenshots**.

## 1. How the assistant checks status (no input needed)

With a **Railway project token** set in your environment (e.g. in `.env` as `RAILWAY_PROJECT_ACCESS_TOKEN`), the assistant can:

- Run the **Railway MCP** tool `railway_status` to get:
  - Project and environment
  - All services and their **latest deployment** (status, commit, time)
  - Public **domains** for each service
  - Live **health**: `GET /api/health` on each service’s public URL

So when you ask “how’s the deploy?” or “is the app healthy?”, the assistant can answer from the API and health endpoint instead of waiting for you to paste logs.

**Setup:** Ensure `RAILWAY_PROJECT_ACCESS_TOKEN` is set where Cursor runs (e.g. in `.env` and load it, or in your shell/Cursor env). The token is scoped to your project (e.g. **skillful-warmth**); create it under **Project Settings → Tokens**.

## 2. Health check in Railway (recommended)

So Railway can mark deployments as healthy and do zero-downtime deploys:

1. Open your **service** (e.g. **scanner**) in Railway.
2. Go to **Settings**.
3. Under **Health Check** (or **Deploy**), set:
   - **Health check path:** `/api/health`
   - Timeout: default is fine (or set `RAILWAY_HEALTHCHECK_TIMEOUT_SEC` if needed).

Railway will call `https://<your-service-domain>/api/health` and expect **200**. Your app already exposes `GET /api/health` (see `src/routes/health.js`).

## 3. Webhooks (build/deploy alerts)

So you get notified on build or deploy events without opening Railway:

1. **Project Settings → Webhooks** (left sidebar).
2. **Add webhook**:
   - **Events:** e.g. `deployment.failed`, `deployment.succeeded`, `deployment.created`.
   - **URL:**
     - **Slack:** Create an Incoming Webhook, paste the URL here.
     - **Discord:** Create a webhook in the channel, paste the URL here.
     - **Email / other:** Use a service that accepts HTTP POST (e.g. Zapier, Make, or a small server you run).

Then you’ll get alerts when a build fails or a deploy completes; the assistant can still use `railway_status` and `/api/health` for the current state.

## 4. Optional: CLI status script

From the repo root, with `RAILWAY_PROJECT_ACCESS_TOKEN` (and optionally other Railway env vars) set:

```bash
node scripts/railway-status.js
```

This prints the same kind of summary (project, services, latest deployment, domains, and live health) so you or the assistant can run it locally.

## 5. Troubleshooting: 500 on assets / “MIME type ('text/html')” for JS/CSS

If the app loads but the UI is blank and the console shows **500** on `/assets/*.js` or **“Refused to apply style… MIME type ('text/html')”** for `/assets/*.css`, the server is not finding the built UI files. That usually means **the UI was never built** in the environment that runs the app.

- **Using Docker:** Ensure the service is built from the repo **Dockerfile**. The Dockerfile runs `npm run build`, which builds the UI and copies it into `dist/`. If Railway is using Nixpacks (or “no Dockerfile”), it may only run `npm install` and `npm start`, so `dist/` is never created.
- **Fix:** In Railway, set the service to use **Dockerfile** (Settings → Build → Dockerfile path, or “Use Dockerfile” if available). Redeploy so the image is built with the Dockerfile; then `dist/` will exist and `/assets/*` will be served correctly.
- After the change, the server will also **exit at startup** with a clear error if `dist/index.html` is missing, so you’ll see the problem in deploy logs instead of a blank page.

## Summary

| What you want              | What to do |
|----------------------------|------------|
| Assistant checks without you | Set `RAILWAY_PROJECT_ACCESS_TOKEN`; assistant uses MCP tool `railway_status`. |
| Railway knows app is healthy | Set health check path to `/api/health` in service Settings. |
| You get build/deploy alerts  | Add a webhook in Project Settings → Webhooks (Slack/Discord/etc.). |
| Blank page / 500 on assets   | Use the repo **Dockerfile** so `npm run build` runs and `dist/` exists. |
