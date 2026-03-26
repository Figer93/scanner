# Foundly Start

Lead generation and outreach automation for UK businesses. Built as a personal side project to explore what you can do when you combine public data sources, browser automation, and AI in a single pipeline.

---

## What it does

Every week, thousands of new companies register with Companies House. Most of them need a website, SEO help, payment tooling, or a dozen other services. Foundly Start finds those companies, figures out who they are, and helps you reach out to them before anyone else does.

The pipeline works like this:

1. Pull newly registered companies from the Companies House API (or load from Google Maps, LinkedIn, or a file)
2. Find their website using Serper search
3. Scrape the site with Playwright to extract contact details (emails, phone numbers, contact forms)
4. Score each lead 1 to 10 using Google AI based on criteria you define
5. Draft a personalised outreach email using Gemini
6. Send via Mailgun, then track opens, clicks, and replies automatically

Everything is managed through a React dashboard that shows the full pipeline, your outreach conversations, email tracking, and estimated earnings.

---

## Why I built it

I wanted to see how far I could get building a real SaaS product solo, using AI tooling (primarily Cursor) to move faster than would otherwise be possible. The result is a working full-stack application that does something genuinely useful, deployed on real infrastructure, with actual email deliverability, webhook handling, and CRM integrations.

It started as a tool for Revolut Business referrals but grew into something more general. The codebase went through a full refactor from plain JavaScript to TypeScript, a security pass, and a modular architecture rebuild along the way.

---

## Tech stack

**Backend**

Node.js, Express 5, PostgreSQL (via pg driver), Socket.IO for real-time pipeline logs, Playwright for browser automation, Zod for validation, Pino for logging, node-cron for scheduled runs.

**Frontend**

React 19, Vite, TypeScript, Tailwind CSS, TanStack Query, Zustand, React Hook Form, Recharts, Axios.

**External services**

Companies House API, Google Places, Serper, Google AI (Gemini), Mailgun, Brevo, Apify (LinkedIn pipeline), HubSpot, Pipedrive, Salesforce (CRM push).

**Production hosting**

Railway (Node app), Supabase (PostgreSQL), Mailgun (email).

---

## Features

- Lead sources: Companies House new incorporations, Google Maps by keyword and location, LinkedIn via Apify, JSON file import
- Enrichment: website discovery via Serper, contact scraping via Playwright, AI-drafted ice-breakers via Gemini
- Lead scoring: 1 to 10 with breakdown, scoring criteria configurable per profile
- Outreach: email sequences, reply tracking, conversation view, team assignment
- Email tracking: open and click events via Mailgun webhooks, inbound reply routing
- CRM push: HubSpot, Pipedrive, Salesforce from the company view
- Export: CSV and Excel from the leads table
- Scheduled runs: cron-based pipeline with real-time log streaming to the UI
- Dashboard: pipeline summary, activity feed, estimated earnings tracker

---

## Project structure

```
src/              Backend: server, routes, services, pipeline
ui/               Frontend: React + Vite
scripts/          Utility scripts
db/migrations/    SQL migration files
dist/             Production UI bundle (generated)
.env.example      Environment variable reference
```

---

## Running locally

```bash
npm install
npm run dev
```

Requires a PostgreSQL instance (Supabase works well). Copy `.env.example` to `.env` and fill in the keys you want to use. The API and Vite dev server run concurrently.

---

## Deployment

The app runs as a single Railway service serving both the API and the built frontend.

```bash
npm run build
node src/server.js
```

Set `DATABASE_URL` to your Supabase connection string. Add Mailgun keys for email sending. Everything else is optional depending on which lead sources and integrations you want active.

---

## Key environment variables

See `.env.example` for the full list.

| Variable | Purpose |
|---|---|
| DATABASE_URL | Postgres connection string (required) |
| COMPANIES_HOUSE_API_KEY | Lead source: new UK incorporations |
| SERPER_API_KEY | Website discovery |
| GOOGLE_AI_API_KEY | Lead scoring and outreach drafts |
| MAILGUN_API_KEY | Email sending |
| MAILGUN_DOMAIN | Your verified Mailgun sending domain |
| MAILGUN_REGION | eu or us depending on your Mailgun account |
| ADMIN_TOKEN | If set, enables dashboard login |

---

## Status

Active personal project, still being built out. Not accepting contributions at this stage but feel free to open an issue if something catches your eye.
