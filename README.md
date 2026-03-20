# Foundly Start

**Automated UK business lead enrichment and outreach.** Load companies from Companies House / Google Maps / LinkedIn → find websites (Serper) → scrape contacts (Playwright) → score + draft outreach (Google AI) → store in **Supabase Postgres**. Deployed on **Railway**.

**Target users:** Web agencies, SEO/marketing firms, and SaaS providers targeting newly registered UK companies.

---

## Table of contents

- [Features](#features)
- [Railway deployment (primary)](#railway-deployment-primary)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Local development (optional)](#local-development-optional)
- [Database schema](#database-schema)
- [Profile & API key management](#profile--api-key-management)
- [Companies House integration](#companies-house-integration)
- [Google Maps (Places) source](#google-maps-places-source)
- [Lead scoring & outreach draft](#lead-scoring--outreach-draft)
- [LinkedIn source (Apify)](#linkedin-source-apify)
- [CRM push](#crm-push)
- [Team members & assign lead](#team-members--assign-lead)
- [Cost per lead](#cost-per-lead)
- [License & support](#license--support)

---

## Features

- **Lead sources:** JSON file, Companies House API (new incorporations), Google Maps (Places) by keyword + location, LinkedIn via Apify.
- **Enrichment:** Serper for website discovery → Playwright for contact scraping (emails, phones, contact form) → optional AI ice-breaker (Gemini).
- **Lead scoring:** 1–10 score and outreach draft per lead via Google AI Studio (Gemini); criteria configurable in Profile.
- **Web UI:** Find leads (search CH cache, save to lists), Kanban (status drag-and-drop), Lead profile (score, draft, sync, enrich, push to CRM), Profile (API keys, usage, schedule, cost per lead), Analytics, Outreach (templates, sent history), DB Management (bulk enrich, clean invalid emails).
- **CRM:** Push to HubSpot, Pipedrive, or Salesforce (per lead or bulk).
- **Export:** CSV and Excel; optional single-file HTML export for archiving.
- **Scheduled runs:** Cron-based pipeline runs; webhook for high-score or status events.

---

## Railway deployment (primary)

Foundly Start is intended to run **fully in Railway + Supabase** (no local DB).

- **Deploy**
  - Railway builds the app (UI + backend) and runs `node src/server.js`.
  - Ensure your Railway service has the required environment variables below.

- **Required environment variables**
  - `DATABASE_URL` (**Supabase Postgres** connection string)
  - `NODE_ENV=production` (recommended)
  - `PORT` (Railway sets this; the app defaults to `3001`)

- **Recommended / feature-specific variables (or set via Profile UI)**
  - `SERPER_API_KEY` (website discovery)
  - `COMPANIES_HOUSE_API_KEY` (Companies House live fetch + cache sync)
  - `GOOGLE_PLACES_API_KEY` (Google Maps source)
  - `GOOGLE_AI_API_KEY` (scoring, ice-breakers, drafts)
  - `APIFY_API_TOKEN` (LinkedIn source via Apify)
  - Webhooks / email: `BREVO_WEBHOOK_SECRET`, `BREVO_API_KEY`, `MAILGUN_*`

Most secrets can also be set from the **Profile** page and are stored in the database (no redeploy needed for changes).

### Mailgun replies (inbound)

If you want **email replies** to appear in **Outreach → Conversations**, configure Mailgun inbound forwarding:

- **1. Set Reply-To**
  - Set `MAILGUN_REPLY_TO` (or Profile key `mailgun_reply_to`) to an address on your Mailgun domain, e.g. `replies@mg.yourdomain.com`.
  - Foundly Start will set the outbound email header `Reply-To` to that value so replies go to Mailgun (not to a random/non-existent mailbox).

- **2. Create a Mailgun Route**
  - In Mailgun → `Receiving` → `Routes`, add a Route that matches that address (or your whole Mailgun domain).
  - Action: `forward()` to `https://YOUR_APP_DOMAIN/api/webhooks/mailgun/inbound` as `POST`.

- **3. Test**
  - Send a new outbound email from the app, then click **Reply** in your email client.
  - The reply should create an inbound message in the thread and set the lead to **Replied**.

- **4. Direct inbound emails (no reply headers)**
  - If a customer sends an email that is NOT a reply (no `In-Reply-To` / `Message-Id` match to a previous outbound message), Foundly Start will try to correlate it by the sender email address to a lead in `leads.emails`.
  - If a lead match is found, the email will be inserted as an inbound `email_logs` row so it appears in **Outreach → Conversations**.
  - These messages are labeled as `Direct message` in the thread UI (stored in `email_logs.matched_via = sender_fallback`).

### Main-domain welcome page + contact form

This app serves two UIs based on hostname:

- `https://foundlystart.co.uk` (main domain): public **welcome page** with a contact form.
- `https://dashboard.foundlystart.co.uk` (subdomain): the Foundly Start dashboard (internal UI).

The welcome page contact form submits to:

- `POST /api/welcome/contact`

To make the contact form send email, ensure Mailgun sending is configured (used by `src/services/mailgun.js`):

- `MAILGUN_API_KEY` and `MAILGUN_DOMAIN`
- `MAILGUN_SENDER_EMAIL` (or Profile key `sender_email`) so the app knows which address to send from.

Replies to the visitor are set via the email `Reply-To` header.

### Outreach tracking model (Sent / Opened / Replied / Converted)

Foundly Start tracks outreach performance using **one-time milestone timestamps per lead** (to avoid double-counting when you send multiple emails or have long reply threads).

- **Starts after Enriched**: milestones are only recorded once a lead has `enriched_at` (i.e. after it first becomes **Enriched**).
- **One-time per lead**:
  - **Sent**: the first outbound email sent to the lead → `first_email_sent_at`
  - **Opened**: the first open event received → `first_email_opened_at`
  - **Replied**: the first inbound reply received → `first_email_replied_at`
  - **Converted**: manually toggled in the Company page → `converted_at`
- **Lists are live membership**: when viewing list analytics, counts are based on **current** list membership (`list_lead`). Removing a lead from a list changes that list’s stats.

This makes the Dashboard counters stable and prevents “further conversation” from flooding metrics.

---

## Tech stack

| Layer              | Technology                                                                 |
|--------------------|----------------------------------------------------------------------------|
| Runtime            | Node.js                                                                    |
| Backend            | Express, Socket.IO                                                         |
| Database           | PostgreSQL (Supabase)                                                      |
| Browser automation | Playwright (Chromium)                                                      |
| APIs               | Companies House, Google Places, Serper, Google AI (Gemini)                 |
| Frontend           | React, Vite (in `ui/`)                                                     |

---

## Project structure

```
FoundlyStart/
├── src/                 # Backend: server, pipeline, routes, services
├── ui/                  # Frontend: React + Vite (pages, components, api, hooks)
├── scripts/             # Build and sync (copy-ui-dist, copy-export-html, sync-companies-house)
├── data/logs/           # Runtime logs (created on first write)
├── dist/                # Production UI build (after npm run build)
├── .env.example         # Example environment variables
├── README.md            # This file
```

---

## Local development (optional)

Only needed if you want to run it on your machine against Supabase:

```bash
npm install
npm run dev
```

---

## Database schema

**Table `leads`:**  
`id`, `company_name`, `company_number` (unique), `address`, `postcode`, `website`, `emails` (JSON), `phones` (JSON), `contact_form` (0/1), `status`, `score` (1–10), `ice_breaker`, `outreach_draft`, `source`, `created_at`, `updated_at`, plus enrichment/outreach columns.

**Outreach milestone columns (per lead, one-time):**  
`enriched_at`, `first_email_sent_at`, `first_email_opened_at`, `first_email_replied_at`, `converted_at`.

**Table `profile`:**  
`key`, `value` — API keys and settings set via the UI, overriding `.env`.

**Table `usage_log`:**  
API usage per service (tokens, requests, estimated cost).

Schema is defined in `db/migrations/001_init.sql`.

If you already deployed an older schema, apply the follow-up migration:

- `db/migrations/002_lead_milestones.sql`

---

## Profile & API key management

The **Profile** page (`#/profile`) centralises API keys and usage. Keys are stored in the database and override `.env` without restart.

- Enter or update keys in the UI; they are masked after save.
- **Test** validates each key before saving.
- Clear a key to fall back to `.env`.
- **Usage dashboard:** Total requests, tokens (Google AI), estimated cost (GBP), last called — from `usage_log`.

API reference for profile and usage: [docs/API.md](docs/API.md#profile-and-usage).

---

## Companies House integration

Companies House REST API fetches newly incorporated UK companies. Pipeline uses Advanced Company Search (e.g. `incorporated_from` 30-day window), maps results to lead shape, then runs Serper → Playwright → AI. Leads get `source = 'companies_house'`.

**Config (env or Profile):** `CH_DAYS_BACK`, `CH_COMPANY_TYPE`, `CH_COMPANY_STATUS`, `CH_SIC_CODE`.  
**Key:** [developer.company-information.service.gov.uk](https://developer.company-information.service.gov.uk/) — use the REST API key.  
**Cache:** Use “Find leads” with the local CH cache; sync via Profile or `npm run sync:companies-house`. See [docs/SCRIPTS.md](docs/SCRIPTS.md).

---

## Google Maps (Places) source

Pipeline source `google_maps`: search by keyword + location (e.g. "plumbers" in "London"). Google Places API (Text Search) → same enrichment pipeline. Leads: `source = 'google_maps'`, `company_number` = Place ID. Set `GOOGLE_PLACES_API_KEY` and enable Places API in Google Cloud.

---

## Lead scoring & outreach draft

- **Scoring:** In Profile, set **Lead scoring criteria** and **Google AI** key. On a lead, use **Score** to get 1–10 and store in `score`.
- **Draft:** Use **Generate** on a lead to create a cold email with Gemini; stored as `outreach_draft`.

## LinkedIn source (Apify)

Pipeline source `linkedin`: pass company names (CLI). Apify actor (e.g. `harvestapi/linkedin-company`) fetches data → same enrichment. Set `APIFY_API_TOKEN` in .env or Profile; optional `APIFY_LINKEDIN_ACTOR_ID`.

---

## CRM push

Push leads to **HubSpot**, **Pipedrive**, or **Salesforce** from the lead profile or Kanban (bulk). Configure keys in Profile. See README or Profile UI for required scopes and fields (e.g. HubSpot private app token, Pipedrive domain, Salesforce instance URL).

---

## Team members & assign lead

In Profile, set **Team members** (comma-separated). Names appear in the **Assigned** dropdown on leads; `assigned_to` is stored and included in CSV/Excel export.

---

## Cost per lead

Profile shows **Cost per lead**: total API spend (`usage_log`), total leads, qualified/converted counts, cost per lead and cost per qualified lead (GBP).

---

## Troubleshooting

| Message | Cause | Fix |
|--------|--------|-----|
| Google AI API key not set / invalid | No or wrong key | Add Google AI Studio key in **Profile** ([aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)) |
| Rate limit exceeded | Too many Gemini requests | Wait and retry; smaller batches |
| Request timed out / Cannot reach Google AI | Network/firewall | Check connection; allow `generativelanguage.googleapis.com` |
| Gemini model not found | Model name changed | Update app |

Full list and pipeline/Serper/CH errors: [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

---

## Resilience

- **Delay:** 3 seconds between companies (`DELAY_BETWEEN_COMPANIES_MS` in config).
- **Scraper:** Contact/About link fallback (up to 3 links) if homepage has no email.
- **Keys:** Profile (DB) → `.env` → error; log indicates which key is missing.
- **Logging:** Set `LOG_LEVEL` (e.g. `debug`) and `LOG_PRETTY=1` for development.

---

## License & support

Foundly Start is provided as-is. For bugs or feature requests, open an issue.
