# CHScanner

**Automated UK business lead enrichment and outreach.** Load companies from JSON, Companies House, or Google Maps → find websites (Serper) → scrape contacts (Playwright) → score and draft outreach with Google AI (Gemini) → store in Supabase PostgreSQL. Web UI for Find leads, Kanban, Profile, Analytics, and CRM push.

**Target users:** Web agencies, SEO/marketing firms, and SaaS providers targeting newly registered UK companies.

---

## Table of contents

- [Features](#features)
- [Quick start](#quick-start)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Installation & configuration](#installation--configuration)
- [Usage](#usage)
- [Documentation](#documentation)
- [Database schema](#database-schema)
- [Profile & API key management](#profile--api-key-management)
- [Companies House integration](#companies-house-integration)
- [Google Maps (Places) source](#google-maps-places-source)
- [Lead scoring & outreach draft](#lead-scoring--outreach-draft)
- [LinkedIn source (Apify)](#linkedin-source-apify)
- [CRM push](#crm-push)
- [Team members & assign lead](#team-members--assign-lead)
- [Cost per lead](#cost-per-lead)
- [Troubleshooting](#troubleshooting)
- [Resilience](#resilience)
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

## Quick start

1. **Clone and install**

   ```bash
   npm install
   cd ui && npm install && cd ..
   ```

2. **Environment**

   Copy `.env.example` to `.env` and set **`DATABASE_URL`** (Supabase PostgreSQL connection string) and at least **`SERPER_API_KEY`**:

   ```bash
   cp .env.example .env
   ```

   Get `DATABASE_URL` from Supabase: Project Settings → Database → Connection string (URI). The schema is applied via Supabase migrations (see `db/migrations/001_init.sql` or apply via Supabase MCP/dashboard).

3. **Run**

   ```bash
   npm run dev
   ```

   Open **http://localhost:5173** in your browser. The backend runs on port 3001; Vite proxies `/api` and Socket.IO to it. **Use 5173 for the current UI** — if you open 3001 you see the last built static bundle (may be outdated).

   **Smart Scoring (Phase 3B)** — where to find it:
   - **Minimum score filter:** Find leads → left sidebar → **Minimum score** (slider 1–10, “Score ≥ X” and matching count). Section is expanded by default.
   - **Score breakdown:** Open a company that has a lead (in a list) → **Score** button in the action bar → after scoring, expand **Score breakdown** in the Company card.
   - **Queue by score:** DB Management → **Send queue** → “Last 5 scheduled sends” table includes a **Score** column; queue sends higher-scored leads first.

For production: `npm run build` then `npm start` — see [Installation & configuration](#installation--configuration) and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

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

For architecture and data flow, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Project structure

```
CHScanner/
├── src/                 # Backend: server, pipeline, routes, services
├── ui/                  # Frontend: React + Vite (pages, components, api, hooks)
├── scripts/             # Build and sync (copy-ui-dist, copy-export-html, sync-companies-house)
├── docs/                # Architecture, API, deployment, scripts, contributing
├── data/logs/           # Runtime logs (created on first write)
├── dist/                # Production UI build (after npm run build)
├── .env.example         # Example environment variables
├── README.md            # This file
├── ROADMAP.md           # Feature backlog
└── TROUBLESHOOTING.md   # Common errors and fixes
```

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Installation & configuration

1. **Install dependencies**

   ```bash
   npm install
   cd ui && npm install && cd ..
   ```

2. **Environment**

   Copy `.env.example` to `.env` and set your keys:

   ```env
   DATABASE_URL=postgresql://...   # required — Supabase connection string (Project Settings → Database)
   SERPER_API_KEY=your_key_here
   COMPANIES_HOUSE_API_KEY=your_key_here    # optional — CH live fetch
   GOOGLE_PLACES_API_KEY=your_key_here      # optional — Google Maps source
   GOOGLE_AI_API_KEY=your_key_here          # optional — scoring, ice-breakers, drafts (get at aistudio.google.com)
   ```

   Keys set in the **Profile** page of the UI are stored in the database and override `.env` at runtime (no restart needed).

3. **Lead sources (choose one per run)**

   - **JSON file** *(default):* `manchester_leads_month.json` — array of objects with `name`, `number`, `address`, `postcode`.
   - **Companies House API:** Newly incorporated UK companies. Requires `COMPANIES_HOUSE_API_KEY`. See [Companies House integration](#companies-house-integration).
   - **Google Maps (Places):** Search by keyword + location. Requires `GOOGLE_PLACES_API_KEY`. See [Google Maps (Places) source](#google-maps-places-source).

For production deployment and env reference, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## Usage

- **Production (single server):** `npm run build` then `npm start`. Open http://localhost:3001. UI is served from `dist/`.
- **Development (live reload):** `npm run dev`. Backend on 3001, Vite on 5173. Open **http://localhost:5173**; edits hot-reload.
- **CLI pipeline:** `node src/index.js 50` or `node src/index.js --limit=50 --source=companies_house` (see [docs/API.md](docs/API.md) for pipeline options).
- **Export single-file UI:** `npm run export:html` → `export/chscanner.html` (backend still required for API/Socket.IO).

Output is stored in Supabase PostgreSQL. Companies are deduplicated by `company_number`; existing website domains are skipped.

---

## Documentation

| Document | Description |
|----------|-------------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | High-level architecture, components, data flow |
| [docs/API.md](docs/API.md) | REST API reference by endpoint group |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Production build, env vars, process management, security |
| [docs/SCRIPTS.md](docs/SCRIPTS.md) | Scripts in `scripts/` (copy-ui-dist, copy-export-html, sync-companies-house) |
| [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) | Dev setup, lint, tests, submitting changes |
| [ROADMAP.md](ROADMAP.md) | Feature backlog and priorities |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Common errors and fixes |

---

## Database schema

**Table `leads`:**  
`id`, `company_name`, `company_number` (unique), `address`, `postcode`, `website`, `emails` (JSON), `phones` (JSON), `contact_form` (0/1), `status`, `score` (1–10), `ice_breaker`, `outreach_draft`, `source`, `created_at`, `updated_at`, plus enrichment/outreach columns.

**Table `profile`:**  
`key`, `value` — API keys and settings set via the UI, overriding `.env`.

**Table `usage_log`:**  
API usage per service (tokens, requests, estimated cost).

See [docs/SCHEMA_PROPOSAL_LISTS_AND_LEADS.md](docs/SCHEMA_PROPOSAL_LISTS_AND_LEADS.md) for lists, list_lead, email_templates, email_logs, and status lifecycle.

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

Errors (e.g. missing key, rate limit): [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

---

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

CHScanner is provided as-is. For bugs, feature requests, or contributions, open an issue or see [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md).
