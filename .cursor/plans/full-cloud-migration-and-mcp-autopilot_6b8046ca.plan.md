---
name: full-cloud-migration-and-mcp-autopilot
overview: End-to-end plan to move CHScanner from local dev to fully cloud-hosted (Supabase + Railway) with MCP-powered automation across components.
todos:
  - id: audit-supabase-schema
    content: Audit and align Supabase schema with intended project schema and local DB modules.
    status: pending
  - id: dockerise-backend
    content: Create Dockerfile and Railway backend service using Supabase DB and environment variables.
    status: pending
  - id: deploy-frontend-railway
    content: Configure and deploy the Vite React frontend to a separate Railway service, wired to backend API.
    status: pending
  - id: enable-cloud-schedulers
    content: Move nightly pipeline and email queue schedulers to Railway backend and verify reliability.
    status: pending
  - id: harden-mcp-integration
    content: Configure and document Supabase + project MCP usage for schema and code automation.
    status: pending
  - id: autopilot-and-guardrails
    content: Complete autopilot UI/settings, compliance, and safety rails for scaled cloud sending.
    status: pending
isProject: false
---

### Overview

You want CHScanner to run fully in the cloud (database + backend + frontend), with Supabase as the DB, Railway as the primary host (esp. frontend), and MCP wired in so you can automate changes and operations across components. Downtime tolerance is flexible and you want a "fully automated assistant" style setup.

I’ll structure this as three main workstreams:

- **Cloud runtime migration** (Supabase + Railway, envs, builds, networking)
- **Data & pipeline hardening** (schemas, jobs, schedulers in cloud)
- **MCP automation** (connectors for Supabase and project, plus conventions so every component is automatable)

I’ll also call out where to pause and test before advancing.

---

### Phase 1 — Baseline: Confirm Supabase & Local Cloud Parity

- **1.1 Inventory current Supabase usage**  
  - Review `README.md`, `docs/SCHEMA_PROPOSAL_LISTS_AND_LEADS.md`, and `src/db/`* modules to confirm all tables that should live in Supabase (`leads`, `profile`, `usage_log`, `lists`, `list_lead`, `email_templates`, `email_logs`, `sequences`, `sequence_steps`, `sequence_enrolments`, `blacklist`, etc.).  
  - Compare against the actual Supabase schema (via Supabase UI or Supabase MCP) and list mismatches: missing tables/columns, wrong types, missing indexes.
- **1.2 Define the source of truth for schema**  
  - Adopt `Supabase` as the **only** source of truth for the DB schema; mirror it in `src/db/schema.js` only to support local dev with the same shape.  
  - Ensure all migrations or DDL changes happen first as **Supabase migrations** (SQL), then mirrored in local sqlite/dev logic if present.
- **1.3 Verify all DB environment variables are cloud-ready**  
  - Confirm `.env` / config uses a single `DATABASE_URL` that points to Supabase in production.  
  - Add separate envs: `DATABASE_URL_LOCAL` (optional) and `DATABASE_URL` (prod) so Railway and local dev can point to the same schema without edits.  
  - Document required env vars (DB + APIs like `SERPER_API_KEY`, `GOOGLE_AI_API_KEY`, `BREVO`, etc.) in `README.md` and `docs/DEPLOYMENT.md` with explicit Railway/Supabase examples.
- **1.4 Run local against Supabase only**  
  - Update local `.env` to point `DATABASE_URL` at Supabase.  
  - Run `npm run dev` and smoke-test: Find Leads, Kanban, Profile, Earnings, Outreach, DB Management.  
  - Fix any query assumptions that break against Supabase (e.g. `AUTOINCREMENT` ids, text vs timestamptz) and update schema/migration docs.
- **Checkpoint:** All features work locally while talking to Supabase (no hidden local-only DB usage).

---

### Phase 2 — Backend Cloud Deployment (Railway or Supabase Functions)

- **2.1 Choose and standardise backend runtime**  
  - Use **Railway Node service** as the primary runtime for the Express backend (recommended given current architecture in `src/index.js`).  
  - Keep Supabase strictly as DB + auth (if you later enable it) and optionally edge functions, but don’t split the current Express API yet to avoid complexity.
- **2.2 Containerise the backend**  
  - Add a `Dockerfile` in project root that:  
    - Installs dependencies, builds server with `tsc` (output to `dist-server`), and runs it with `node dist-server/index.js` (or the appropriate entry).  
    - Exposes port `3001` and uses `NODE_ENV=production`.
  - Ensure build respects `tsconfig.json` (rootDir `src`, outDir `dist-server`).
- **2.3 Create Railway backend service**  
  - Create a new Railway project/service for the backend.  
  - Connect GitHub repo or direct deploy from local using Railway CLI.  
  - Configure Railway service port (3001) and health checks (e.g. `/api/health`).
- **2.4 Wire environment variables on Railway**  
  - In Railway, add all required env vars: `DATABASE_URL` (Supabase), `SERPER_API_KEY`, `GOOGLE_AI_API_KEY`, `COMPANIES_HOUSE_API_KEY`, `GOOGLE_PLACES_API_KEY`, `APIFY_API_TOKEN`, `BREVO_`*, pipeline schedule settings, etc.  
  - Use **Railway env groups** (if available) to share env vars between backend and frontend services.
- **2.5 Update CORS, URLs, and webhooks for cloud**  
  - Configure allowed origins in backend CORS to include the Railway frontend domain and local dev (5173).  
  - Set the public `BASE_URL` (or equivalent) env so URL generation for Brevo webhooks, unsubscribe links, and exported HTML points to the correct Railway domain.  
  - Update Brevo webhook URL to use `https://<railway-backend-domain>/api/webhooks/brevo`.
- **2.6 Validate backend in cloud**  
  - Deploy backend and test via Postman or browser: `/api/health`, one or two main endpoints, and socket connection from local UI pointing at cloud backend.  
  - Temporarily run UI locally (`npm run dev`) against the cloud backend by pointing Vite proxy to the Railway backend URL; fix any CORS or URL issues.
- **Checkpoint:** Express API + pipelines run successfully on Railway, fully backed by Supabase.

---

### Phase 3 — Frontend Cloud Deployment on Railway

- **3.1 Standardise frontend build output**  
  - Confirm `ui/` uses Vite with `npm run build` producing a static bundle (likely in `ui/dist`).  
  - Ensure a single script exists in root `package.json` (e.g. `build:ui`) that:
    - `cd ui && npm install` (on first build) and `npm run build`.
  - Decide between two hosting patterns:  
    - (A) **Separate Railway static service** serving `ui/dist`.  
    - (B) **Backend-served static**: copy `ui/dist` into backend `dist/` and serve via Express.
  - For cleaner scaling, prefer **pattern A**: static frontend on its own Railway service.
- **3.2 Create Railway frontend service**  
  - Add a second Railway service for the frontend (static or Node-based Vite preview).  
  - For a static service, configure it to serve the built `ui/dist` directory with correct `index.html` routing for your hash/SPA routing (router is likely hash-based, so minimal config needed).
- **3.3 Connect frontend to backend**  
  - Configure frontend env vars (e.g. `VITE_API_BASE_URL`) to point at the Railway backend URL.  
  - Remove assumptions of `localhost:3001` in the frontend; instead use a `config.ts` or env-driven base URL.  
  - For Socket.IO, ensure it uses the same base URL and supports HTTPS/wss.
- **3.4 Verify complete cloud flow**  
  - Open the Railway frontend URL and run through core flows: loading leads, Kanban moves, scoring, Outreach send-test, earnings view.  
  - Measure performance; adjust Railway instance size or caching as needed.
- **Checkpoint:** Users can fully use CHScanner in the cloud without touching local dev.

---

### Phase 4 — Schedulers and Background Jobs in the Cloud

- **4.1 Move cron/scheduler to Railway**  
  - Review existing scheduler in `src/index.js` / `src/services/scheduler.js` that runs pipelines and the email queue.  
  - Ensure it triggers based on time (setInterval / node-cron) and is safe in a single-instance environment.  
  - On Railway, pin the backend to a single instance or use a distributed-lock approach (e.g. advisory lock in Supabase) if you plan to scale horizontally.
- **4.2 Configure nightly autopilot in production**  
  - Wire Profile → Schedule settings (Phase 4A in `ROADMAP.md`) to actually drive the scheduler config for your cloud deployment.  
  - Confirm the nightly jobs (CH sync, enrichment, scoring, auto-enrolment) run successfully against Supabase from Railway.
- **4.3 Add monitoring and alerts**  
  - Implement or verify `/api/health` endpoint that checks DB connectivity and key dependencies (e.g. ability to run a trivial query).  
  - Add simple logging and, optionally, Railway alerts for restarts or high error rate.  
  - Implement pipeline failure notifications (Phase 4.3 in `ROADMAP.md`) so you receive an email if a nightly job fails in the cloud.
- **Checkpoint:** Autopilot (nightly pipeline + email queue) runs reliably in the cloud and not just on your laptop.

---

### Phase 5 — MCP Integration for Database and Codebase

- **5.1 Finalise Supabase MCP server usage**  
  - Using `.cursor/mcp.json`, validate the Supabase MCP server is reachable and authorised for your project.  
  - Standardise a set of MCP-assisted operations:  
    - Explore schema and list tables.  
    - Run safe `SELECT` queries for debugging and analytics.  
    - Apply non-destructive migrations (e.g. add columns, create tables) under your guidance.
- **5.2 Model DB schema as first-class artifacts**  
  - Keep Supabase migrations in a dedicated folder (e.g. `supabase/migrations`) and ensure MCP can reference them for context.  
  - Make a short `docs/DB-MIGRATION.md` describing how to use MCP (Supabase server) to inspect or adjust schema in a controlled way.
- **5.3 Enable project-wide code navigation via MCP**  
  - Ensure the project’s MCP tooling (Cursor’s built-in project server) is aware of `src/` and `ui/` so agents can:
    - Answer "where is X implemented?" for any route, component, or service.  
    - Generate patches or new components in the correct folders (`src/routes/`*, `ui/src/pages/`*, `ui/src/components/*`).
  - Document simple conversational patterns you’ll use, e.g. “update the scoring breakdown UI to include X” or “create a new Profile section for schedule settings.”
- **5.4 Define conventions that make components automatable**  
  - Enforce clear naming and file organisation:  
    - Backend routes in `src/routes/*.js`, services in `src/services/*.js`, DB access in `src/db/*.js`.  
    - Frontend pages in `ui/src/pages/*.tsx`, shared UI in `ui/src/components/ui/`*, feature components in `ui/src/components/[feature]/`*.
  - Ensure each component is small and single-responsibility so MCP-generated changes don’t need to touch 5+ files at once for trivial tasks.
- **5.5 Establish safe MCP edit workflows**  
  - Decide your workflow for MCP-driven edits:  
    - Use MCP agents to propose patches; you manually review and apply via Cursor.  
    - Or grant MCP agents permission to apply patches directly, but always inspect diffs before running in production.
  - Add a short section in `docs/CONTRIBUTING.md` or a new `docs/MCP_AUTOMATION.md` describing:
    - How to ask MCP to modify a specific component or route.  
    - What to test after MCP changes (e.g. specific pages/flows).  
    - Guardrails: never changing API response shapes or URLs without explicit approval (matching your `ROADMAP.md` rules).
- **Checkpoint:** You can say “update X behaviour” or “add Y card to dashboard” and have MCP safely implement it end-to-end with your review.

---

### Phase 6 — Fully Automated System (Your "Tell It What to Do" Mode)

- **6.1 Wire Autopilot configuration into UI**  
  - Complete Phase 4A settings in the Profile page (Schedule, threshold, default sequence, notification email) so you can toggle autopilot parameters without touching code.  
  - Expose a simple "Autopilot status" card on the dashboard summarising whether nightly runs are on, next run time, and last success/failure.
- **6.2 Codify safety rails (compliance and scale)**  
  - Implement and verify Phase 5 roadmap items (blacklist, unsubscribe link, bounce handling, dedupe before send) in the cloud deployment.  
  - Confirm these protections are in place before scaling volume to production levels.
- **6.3 Define MCP-based runbooks**  
  - Create a small runbook (e.g. `docs/RUNBOOKS.md`) that lists typical natural-language commands you’ll give MCP, such as:  
    - “Audit email queue logic for potential double-sends and fix them.”  
    - “Add a new metric to the Earnings page using `usage_log` data.”  
    - “Update Supabase schema to add a column, then plumb it through backend and frontend.”
  - For each runbook entry, note the endpoints/screens to test after MCP completes the change.
- **6.4 Optional: Multi-env & rollback strategy**  
  - Add a staging Railway environment wired to a staging Supabase project, and configure Cursor/MCP to target staging by default.  
  - Document how to promote successful changes from staging to production and how to roll back (Rails deploy rollback or previous image).
- **Final success criteria**  
  - Backend and frontend run entirely on Railway, using Supabase as the single DB.  
  - Nightly pipelines and email queue run without you manually starting anything on your laptop.  
  - All schema and code changes can be driven via MCP instructions and reviewed in Cursor before deployment.  
  - You can treat CHScanner like a SaaS you manage, not a local script you babysit.

