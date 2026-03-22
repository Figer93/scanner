# Foundly Start

**Automated UK business lead enrichment and outreach.** Load companies from Companies House, Google Maps, or file-based sources → find websites (Serper) → scrape contacts (Playwright) → score + draft outreach (Google AI) → store in **PostgreSQL** (e.g. Supabase). Designed to deploy on **Railway** with the React UI served from the same Node process.

**Target users:** Web agencies, SEO/marketing firms, and SaaS providers targeting newly registered UK companies.

---

## Table of contents

- [Features](#features)
- [Web application](#web-application)
- [Railway deployment](#railway-deployment)
- [Environment variables](#environment-variables)
- [Profile page vs `.env`](#profile-page-vs-env)
- [Mailgun (send, inbound replies, open/click tracking)](#mailgun-send-inbound-replies-openclick-tracking)
- [Main domain vs dashboard](#main-domain-vs-dashboard)
- [Outreach milestones](#outreach-milestones)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Local development](#local-development)
- [Database](#database)
- [Lead sources & integrations](#lead-sources--integrations)
- [CRM push](#crm-push)
- [Team members & assignment](#team-members--assignment)
- [Cost and estimated earnings](#cost-and-estimated-earnings)
- [Troubleshooting](#troubleshooting)
- [Resilience & logging](#resilience--logging)
- [License](#license)

---

## Features

- **Lead sources:** JSON file, Companies House API (new incorporations), Google Maps (Places) by keyword + location, LinkedIn via Apify (CLI/pipeline).
- **Enrichment:** Serper for website discovery → Playwright for contact scraping (emails, phones, contact form) → optional AI ice-breaker (Gemini).
- **Lead scoring:** 1–10 score and breakdown per lead via Google AI; criteria configurable in Profile.
- **Web UI:** Dashboard (pipeline summary, activity), **Find Leads** (search CH cache, enriched leads, lists, company detail), **Outreach** (conversations, templates, signature, sequences), **DB Management**, **Profile** (keys, Mailgun/Brevo helpers, outreach, pipeline run + logs, schedule, usage, estimated earnings).
- **CRM:** Push to HubSpot, Pipedrive, or Salesforce from the **company** view when credentials are configured (see [CRM push](#crm-push)).
- **Export:** CSV and Excel from Find Leads; optional single-file HTML export (`npm run export:html`).
- **Scheduled runs:** Cron-based pipeline runs; optional audit webhooks.

---

## Web application

Hash routes are handled in `ui/src/constants/routes.js`.

| Area | Route | Notes |
|------|--------|--------|
| Dashboard | `#/` | Pipeline stats, quick actions, recent activity |
| Find Leads | `#/leads` | List filters, company detail `#/company/{number}` |
| Outreach | `#/outreach` | Optional `?conversation={leadId}` |
| DB Management | `#/db` | |
| Profile | `#/profile` | Settings, API keys, Mailgun webhook copy, pipeline logs |

**Legacy bookmarks** (removed tabs) still resolve:  
`#/kanban` → Find Leads, `#/analytics` → home, `#/earnings` and `#/logs` → Profile.

**Optional admin auth:** If `ADMIN_TOKEN` is set, Profile API endpoints require `Authorization: Bearer <token>`. Other JSON APIs used by the dashboard expect the same token if your client sends it (configure in your hosting / frontend as needed).

---

## Railway deployment

- **Build:** `npm run build` runs the Vite UI build and copies `ui/dist` into `dist/` for Express static hosting.
- **Start:** `node src/server.js` (see `package.json` `start`).
- **Port:** Railway sets `PORT`; the app defaults to `3001` if unset.

**Required**

- `DATABASE_URL` — PostgreSQL connection string (Supabase pooler URI is recommended for serverless).

**Recommended**

- `NODE_ENV=production`
- Feature keys as below or via Profile where supported.

---

## Environment variables

Copy `.env.example` to `.env` for local use. On Railway, set variables in the service dashboard.

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | **Required.** Postgres connection string. |
| `PORT` | Listen port (Railway injects this). |
| `ADMIN_TOKEN` | If set, secures Profile (and related) API mutations with Bearer token. |
| `SERPER_API_KEY` | Website discovery via Serper. |
| `COMPANIES_HOUSE_API_KEY` | CH API + cache sync. |
| `GOOGLE_AI_API_KEY` | Scoring, ice-breakers, drafts (Gemini). |
| `GOOGLE_PLACES_API_KEY` | **Pipeline only:** Google Maps / Places source. |
| `APIFY_API_TOKEN` / `APIFY_LINKEDIN_ACTOR_ID` | **Pipeline only:** LinkedIn enrichment source. |
| `MAILGUN_API_KEY` | Private API key for sending. |
| `MAILGUN_DOMAIN` | Verified **sending** domain in Mailgun (e.g. `foundlystart.co.uk` — not necessarily your dashboard hostname). |
| `MAILGUN_REGION` | `eu` or `us` (must match Mailgun region; wrong value → `401 Unauthorized` from Mailgun). |
| `MAILGUN_SENDER_EMAIL` / `sender_email` in Profile | From address allowed for that domain. |
| `MAILGUN_REPLY_TO` / `mailgun_reply_to` | Address Mailgun receives for **inbound** routes (replies). |
| `MAILGUN_SIGNING_KEY` | Optional webhook signature verification. |
| `BREVO_API_KEY`, `BREVO_WEBHOOK_SECRET` | If using Brevo for mail or webhooks. |
| `ALLOWED_ORIGINS` | CORS allowlist for browser clients. |
| `HUBSPOT_API_KEY`, `PIPEDRIVE_*`, `SALESFORCE_*` | CRM push (see below). |

---

## Profile page vs `.env`

The **Profile** UI in the app stores many keys in the `profile` table and **overrides** `.env` for those keys.

**Editable in Profile (Settings UI)**

- **API keys (shown in app):** Companies House, Google AI (Gemini), Serper.
- **Estimated earnings:** Referral value (£) and conversion % — used for dashboard “Est. earnings” (no separate Earnings page).
- **Pipeline / schedule / outreach / team / webhooks:** As implemented in each section (Mailgun, Brevo, sender, signature, etc.).

**Typically environment-only** (not exposed as Profile form fields in the current UI, but still read by the server from env or DB if previously stored)

- `GOOGLE_PLACES_API_KEY`, Apify tokens, HubSpot / Pipedrive / Salesforce — configure in **Railway** (or legacy DB keys if you had saved them before). The **company** page can still show **Push to CRM** when the backend resolves credentials from env/DB.

After changing Railway env vars, **redeploy or restart** the service so the process reloads them.

---

## Mailgun (send, inbound replies, open/click tracking)

### Sending

Outbound mail uses `src/services/mailgun.js`. You need a valid **private API key**, **`MAILGUN_DOMAIN`** matching a **verified** Mailgun domain, **`MAILGUN_REGION`** matching EU vs US, and a permitted **From** (`MAILGUN_SENDER_EMAIL` or Profile `sender_email`).

### Domain vs dashboard URL

- **`MAILGUN_DOMAIN`** = the domain Mailgun shows under **Sending → Domains** (e.g. `foundlystart.co.uk`).
- **Webhook URLs** must use the **public origin of your API** (e.g. `https://dashboard.foundlystart.co.uk`) — that is where Express serves `/api/...`. The dashboard hostname and Mailgun sending domain **do not** have to be the same string.

### Inbound replies (Outreach → Conversations)

1. Set **`MAILGUN_REPLY_TO`** (or Profile `mailgun_reply_to`) to an address Mailgun **receives** (e.g. `replies@mg.yourdomain.com`).
2. In Mailgun **Receiving → Routes**, forward matching mail to  
   `POST https://YOUR_API_ORIGIN/api/webhooks/mailgun/inbound`  
   (e.g. `https://dashboard.foundlystart.co.uk/api/webhooks/mailgun/inbound`).

### Event webhooks (opened, delivered, clicked, …)

To update lead status and milestones from Mailgun events, add a **webhook** in Mailgun (**Sending → Webhooks**) pointing to:

`https://YOUR_API_ORIGIN/api/webhooks/mailgun/events`

Enable at least **Delivered**, **Opened**, and any other events you care about. The server matches events to `email_logs` using Mailgun’s **Message-ID** (including nested `message.headers` in JSON payloads).

**Profile → Email tracking (Mailgun)** shows copyable URLs and optional status (`GET /api/webhooks/mailgun/status`).

---

## Main domain vs dashboard

- **Marketing / welcome site** can be served on the apex domain (e.g. `foundlystart.co.uk`) with a contact form posting to `POST /api/welcome/contact`.
- **App UI** is often on a subdomain (e.g. `dashboard.foundlystart.co.uk`). The same Node process serves both API and static UI; configure DNS and reverse proxy so both hostnames reach the service.

---

## Outreach milestones

After a lead is **Enriched**, one-time timestamps record: first send, first open, first reply, and manual **Converted** on the company page. List membership is live — analytics for lists reflect **current** list membership.

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js |
| Backend | Express, Socket.IO (logs stream to Profile pipeline UI) |
| Database | PostgreSQL |
| Browser automation | Playwright (Chromium) |
| APIs | Companies House, Google Places, Serper, Google AI (Gemini), Mailgun, optional Brevo |
| Frontend | React, Vite, TanStack Query (`ui/`) |

---

## Project structure

```
├── src/                 # Backend: server, routes, services, pipeline
├── ui/                  # Frontend: React + Vite
├── scripts/             # copy-ui-dist, copy-export-html, sync-companies-house, …
├── db/migrations/       # SQL migrations
├── data/logs/           # Optional file logs if configured
├── dist/                # Production UI bundle (after npm run build)
├── .env.example
└── README.md
```

---

## Local development

```bash
npm install
npm run dev
```

Runs the API and the Vite dev server concurrently. Point `DATABASE_URL` at a Postgres instance (e.g. Supabase). See `.env.example`.

---

## Database

Migrations live under `db/migrations/`. Apply them in order on your database (including `001_init.sql`, `002_lead_milestones.sql`, `003_email_logs_matched_via.sql`, and later numbered migrations).

Core tables include **`leads`**, **`profile`** (key/value settings), **`email_logs`**, **`usage_log`**, and list membership tables. Schema details are in the SQL files.

---

## Lead sources & integrations

| Source | Config |
|--------|--------|
| **Companies House** | `COMPANIES_HOUSE_API_KEY`; CH filters in pipeline config / UI. Sync CH cache with `npm run sync:companies-house` or Profile tools where available. |
| **Google Maps** | `GOOGLE_PLACES_API_KEY` (env); Places API enabled in Google Cloud. |
| **LinkedIn (Apify)** | `APIFY_API_TOKEN` and optional actor id (env). |
| **JSON file** | Pipeline CLI / run options. |

---

## CRM push

The UI exposes **Push to CRM** on the company view. Credentials are resolved from **environment** (or existing DB profile keys if present): HubSpot private app token, Pipedrive token + domain, Salesforce token + instance URL — see `.env.example` and `src/services/crmPush.js`.

---

## Team members & assignment

Set **Team members** (comma-separated) in Profile. Names appear in assignment UI where implemented; stored per lead for exports.

---

## Cost and estimated earnings

**Usage** in Profile aggregates `usage_log` (requests, tokens, estimated GBP). **Estimated earnings** on the dashboard uses referral £ and conversion % configured under Profile → **Estimated earnings** (stored as profile keys).

---

## Troubleshooting

| Symptom | Likely cause | What to do |
|---------|----------------|------------|
| `502` + `{"error":"Unauthorized"}` on send / send-reply | Mailgun rejected the API call | Fix `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, **`MAILGUN_REGION` (eu vs us)**, and sender email. Ensure Profile is not overriding with a bad key. |
| Replies appear but **Send** fails | Inbound does not use your Mailgun **sending** key; outbound does | Same as above — verify sending credentials on Railway. |
| Opens in Mailgun logs but lead never **Opened** in app | Webhook URL or event types | Add **Webhooks** → `…/api/webhooks/mailgun/events` with **Opened** (and **Delivered** as needed). Redeploy after server fixes. |
| Profile save 401 | `ADMIN_TOKEN` set | Send `Authorization: Bearer <ADMIN_TOKEN>` on API requests used by your deployment, or align client config. |
| Google AI errors | Missing/invalid key | Set `GOOGLE_AI_API_KEY` in Profile or env ([Google AI Studio](https://aistudio.google.com/app/apikey)). |

---

## Resilience & logging

- Pipeline delay between companies is configurable in code (`DELAY_BETWEEN_COMPANIES_MS` in config).
- **Logging:** `LOG_LEVEL`, optional `LOG_PRETTY=1`, optional `LOG_FILE`.

---

## License

Foundly Start is provided as-is. For bugs or feature requests, open an issue in the repository.
