# CHScanner API Reference

REST API endpoints exposed by the CHScanner backend. All responses are JSON unless noted (e.g. CSV/Excel export). For error handling and common failures, see [TROUBLESHOOTING.md](../TROUBLESHOOTING.md).

Base URL: same origin as the app (e.g. `http://localhost:3001` in production, or proxied via Vite in dev).

---

## Logs

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/logs` | Returns in-memory log entries. Query: `limit` (optional, max 1000). Response: `{ entries: [{ id, time, message }] }`. |

---

## Leads

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/leads` | List leads. Query: `listId` (optional) to filter by list. |
| GET | `/api/leads/by-company/:companyNumber` | Get lead by company number. |
| GET | `/api/leads/:id` | Get lead by id. |
| PATCH | `/api/leads/:id` | Update lead. Body: `status`, `score`, `outreach_draft`, `assigned_to`. |
| GET | `/api/leads/:id/activities` | Get activities for a lead. |
| POST | `/api/leads/:id/activities` | Add activity. Body: `type` (note, status_change, email_sent, call, meeting, scored), `content`. |
| POST | `/api/leads/:id/score` | Score lead 1–10 via Google AI (uses Profile criteria). Returns `{ ok, score, reason }`. |
| POST | `/api/leads/:id/outreach-draft` | Generate outreach draft via Google AI. Returns `{ ok, draft }`. |
| POST | `/api/leads/:id/send-email` | Record email sent. Body: `subject`, `body` or `draft`. |
| POST | `/api/leads/:id/sync` | Re-run sync/enrichment for this lead. |
| POST | `/api/leads/:id/enrich` | Run enrichment for this lead. |
| POST | `/api/leads/:id/push-crm` | Push lead to CRM. Body: `provider` (hubspot, pipedrive, salesforce). |
| POST | `/api/leads/save-to-list` | Save companies to a list (creates/updates leads). Body: `listId`, `companyNumbers[]`. |
| GET | `/api/leads/in-lists` | Which lists contain given companies. Query: `companyNumbers` (comma-separated). |
| POST | `/api/leads/validate` | Validate lead data (e.g. against Companies House). Body: lead object, optional `useApi`. |
| POST | `/api/leads/bulk-send-email` | Mark multiple leads as email sent. Body: `leadIds[]`, `subject`. |
| POST | `/api/leads/bulk-delete` | Delete leads by id. Body: `ids[]`. |
| GET | `/api/leads/export` | Export leads as file. Query: `format=csv` or `format=xlsx`, optional `listId`. Returns CSV or Excel file. |

---

## Companies House (live API)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/companies-house/company/:number` | Fetch company by number from Companies House API (officers, PSCs, charges). Requires API key in Profile or env. |

---

## Companies House cache (local DB)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/ch-cache/count` | Count of cached companies. |
| GET | `/api/ch-cache/search` | Search cache. Query: `q`, `limit`, `daysBack`, `location`, `postcode`. Response: `{ items }`. |
| POST | `/api/ch-cache/sync` | Sync cache from Companies House API. Body: `daysBack`, `limit`, `fetchFullProfile`. |

---

## Lists

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/lists` | List all lists. |
| POST | `/api/lists` | Create list. Body: `name`, optional `description`. |
| GET | `/api/lists/:id` | Get list by id. |
| PATCH | `/api/lists/:id` | Update list. Body: `name`, `description`. |
| DELETE | `/api/lists/:id` | Delete list. |
| GET | `/api/lists/:id/leads` | Leads in list. |
| POST | `/api/lists/:id/enrich` | Enrich all leads in list. Body: optional `delayMs`. |

---

## Email templates and logs

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/email-templates` | List email templates. |
| GET | `/api/email-templates/:id` | Get template by id. |
| POST | `/api/email-templates` | Create template. Body: `name`, `subject`, `body`. |
| PATCH | `/api/email-templates/:id` | Update template. |
| DELETE | `/api/email-templates/:id` | Delete template. |
| GET | `/api/email-logs` | List email logs. Query: `leadId`, `listId`, `limit`. |
| POST | `/api/email-logs` | Add email log. Body: `lead_id`, optional `template_id`, `brevo_message_id`, `direction`, `status`. |
| POST | `/api/webhooks/brevo` | Brevo webhook: update email log and lead status (opened, replied, etc.). Body: `message-id`, `event`. |

---

## Profile and usage

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/profile` | Get profile (masked keys, sources, criteria, webhook, team_members). |
| POST | `/api/profile` | Save profile keys/settings (keys stored in DB, override .env). |
| DELETE | `/api/profile/:key` | Clear one profile key (fallback to .env). |
| GET | `/api/usage` | Aggregated usage stats per service. |
| GET | `/api/usage/log` | Raw usage log rows. Query: `page`, `limit`. |

---

## Analytics

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/analytics/funnel` | Funnel stats (e.g. by status). |
| GET | `/api/analytics/cost-per-lead` | Cost per lead metrics. |
| GET | `/api/analytics/score-distribution` | Score distribution. |
| GET | `/api/analytics/last-pipeline-run` | Last pipeline run summary (time, source, counts). |
| GET | `/api/analytics/lists/:listId` | List performance analytics. |

---

## Database management

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/db/stats` | Global DB stats. |
| POST | `/api/db/bulk-enrich-new` | Start background job to enrich all “New” leads (optional `listId`, `delayMs`). Returns 202. |
| GET | `/api/db/job-status` | Background job status: `running`, `job`, `processed`, `total`, `error`. |
| POST | `/api/db/clean-invalid-emails` | Clean invalid emails. Body/query: optional `listId`. |

---

## Schedule

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/schedule` | Get scheduled run config: `cron`, `source`, `limit`. |
| POST | `/api/schedule` | Set scheduled run. Body: `cron`, `source`, `limit`. |

---

## CRM

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/crm/push-bulk` | Push multiple leads to CRM. Body: `provider` (hubspot, pipedrive, salesforce), `leadIds[]`. |

---

## Pipeline run

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/run` | Run pipeline. Body: `limit`, `source`, optional `inputFile`, `googleMapsKeyword`, `googleMapsLocation`, `linkedInCompanyNames`, `daysBack`. Progress is streamed via Socket.IO `log`. Returns `{ ok, summary }`. |

---

## Errors

- **4xx:** Validation or not found; body often includes `{ error: "message" }`.
- **5xx:** Server error; body may include `{ error: "message" }`.
- **502:** Often used for upstream API failures (e.g. Google AI, CRM). See [TROUBLESHOOTING.md](../TROUBLESHOOTING.md) for typical causes and fixes.
