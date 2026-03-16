# Schema Proposal: Custom Lists & Lead Statuses

This document proposes database and API changes to support **Custom Lists** (e.g. "March Leads", "Tech Startups") and the new **Lead statuses** for the full-cycle outreach platform. It is based on analysis of your current `CompanyTable`, `Leads` page, and `database.js`.

---

## Implementation status

| Item | Status |
|------|--------|
| **Schema: tables `lists`, `list_lead`** | ✅ Done |
| **Schema: leads columns `linkedin_url`, `predicted_email`, `enrichment_status`** | ✅ Done |
| **Schema: tables `email_templates`, `email_logs`** | ✅ Done |
| **Schema: lead statuses extended (Kanban-compatible)** | ✅ Done |
| **API: list CRUD + GET list leads + POST save-to-list** | ✅ Done |
| **UI: Save to List on Leads page (modal + API)** | ✅ Done |
| **UI: Kanban six columns + legacy status mapping** | ✅ Done |
| **UI: Left-hand nav (Find leads, Kanban, Profile, etc.)** | ✅ Done |
| **API: email_templates CRUD** | ✅ Done |
| **API: email_logs + Brevo webhook** | ✅ Done |
| **Analytics tab (list performance)** | ✅ Done |
| **Outreach tab (templates + sent history)** | ✅ Done |
| **Lead enrichment (OSINT background job)** | ✅ Done |

---

## 1. Current State Summary

### CompanyTable & Leads page
- **Data source:** Companies come from **`ch_cache`** (Companies House cache) via `GET /api/ch-cache/search`.
- **Selection:** The table supports row selection via checkboxes; `selectedIds` is a `Set` of **company numbers** (strings).
- **No persistence of selection:** There is no "Save to List" yet; the bottom bar has a "Continue" button with no behaviour tied to lists or leads.

### Existing database
- **`leads`** – One row per company (unique `company_number`). Columns include `company_name`, `company_number`, `address`, `postcode`, `website`, `emails`, `phones`, `status`, `source`, etc. Used by Kanban, lead profile, and the pipeline.
- **`ch_cache`** – Read-only cache of CH data for search; no link to leads or lists.
- **`lead_activities`** – Activities per lead.
- **Lead status (current):** `New | Enriched | Contacted | Qualified | Converted` (in `database.js` and Kanban).

### Desired behaviour
- Select companies from the main search table (ch_cache results) and **save them into Custom Lists**.
- Each saved company becomes a **persistent Lead** (create or update by `company_number`).
- Lead statuses should support the outreach lifecycle: **New, Enriched, Email Sent, Waiting for Reply, Replied, Converted**.

---

## 2. Proposed Schema Changes

### 2.1 New table: `lists`
Stores user-created lists (e.g. "March Leads", "Tech Startups").

| Column       | Type    | Notes                          |
|-------------|---------|----------------------------------|
| id          | INTEGER | PRIMARY KEY AUTOINCREMENT       |
| name        | TEXT    | NOT NULL, list display name     |
| description | TEXT    | Optional                        |
| created_at  | TEXT    | DEFAULT (datetime('now'))       |
| updated_at  | TEXT    | DEFAULT (datetime('now'))       |

### 2.2 New table: `list_lead` (junction)
Many-to-many: a lead can belong to multiple lists, a list can contain many leads.

| Column   | Type    | Notes                                    |
|----------|---------|------------------------------------------|
| id       | INTEGER | PRIMARY KEY AUTOINCREMENT                |
| list_id  | INTEGER | NOT NULL, REFERENCES lists(id) ON DELETE CASCADE |
| lead_id  | INTEGER | NOT NULL, REFERENCES leads(id) ON DELETE CASCADE |
| added_at | TEXT    | DEFAULT (datetime('now'))                |
| UNIQUE(list_id, lead_id) | — | Prevent duplicate list–lead pairs        |

**Index:** `CREATE INDEX idx_list_lead_list_id ON list_lead(list_id);` and `CREATE INDEX idx_list_lead_lead_id ON list_lead(lead_id);` for fast "leads in list" and "lists for lead" queries.

### 2.3 Leads table – new columns (Enrichment & Outreach)
Add the following columns to `leads` (via `ensure*` migrations so existing DBs are updated):

| Column             | Type    | Notes                                                                 |
|--------------------|---------|-----------------------------------------------------------------------|
| linkedin_url       | TEXT    | LinkedIn profile or company page URL (OSINT enrichment).              |
| predicted_email    | TEXT    | Guessed email (e.g. name@company.co.uk) from pattern.                  |
| enrichment_status  | TEXT    | e.g. `pending`, `found_linkedin`, `found_email`, `failed` (for background enrichment). |

### 2.4 Lead statuses (extend `leads.status`) – Kanban-compatible
Current: `New | Enriched | Contacted | Qualified | Converted`.

**Canonical outreach set** (used by Kanban columns and new flows):
- **New**
- **Enriched**
- **Email Sent**
- **Waiting for Reply**
- **Replied**
- **Converted**

**Kanban compatibility:** The Kanban board uses this ordered list of columns. Existing DB values `Contacted` and `Qualified` are **legacy**. For display and drag‑and‑drop we treat them as equivalent to the new statuses so existing data still appears in the right column:
- `Contacted` → display and group under **Email Sent**
- `Qualified` → display and group under **Replied**

So in the UI we use exactly six columns; the API continues to accept and persist both legacy and new values. No data migration required.

### 2.5 New table: `email_templates`
Stores subject lines and email bodies for the Outreach tab.

| Column       | Type    | Notes                                |
|-------------|---------|--------------------------------------|
| id          | INTEGER | PRIMARY KEY AUTOINCREMENT            |
| name        | TEXT    | NOT NULL, template label              |
| subject     | TEXT    | NOT NULL, subject line                |
| body        | TEXT    | NOT NULL, email body (plain or HTML)  |
| created_at  | TEXT    | DEFAULT (datetime('now'))            |
| updated_at  | TEXT    | DEFAULT (datetime('now'))            |

### 2.6 New table: `email_logs`
Tracks Brevo sends for analytics and webhook updates (opens/replies).

| Column        | Type    | Notes                                           |
|---------------|---------|-------------------------------------------------|
| id            | INTEGER | PRIMARY KEY AUTOINCREMENT                       |
| lead_id       | INTEGER | NOT NULL, REFERENCES leads(id)                  |
| template_id   | INTEGER | NULL, REFERENCES email_templates(id)            |
| brevo_message_id | TEXT  | Brevo message ID for webhook correlation        |
| direction     | TEXT    | 'outbound' \| 'inbound' (reply)                 |
| status        | TEXT    | e.g. 'sent', 'delivered', 'opened', 'replied', 'bounced' |
| sent_at       | TEXT    | DEFAULT (datetime('now'))                       |
| updated_at    | TEXT    | DEFAULT (datetime('now'))                       |

Indexes: `idx_email_logs_lead_id`, `idx_email_logs_brevo_message_id` (for webhook lookups).

### 2.7 Optional: `list_id` on `leads`?
We do **not** add a single `list_id` on `leads`. The many-to-many `list_lead` table allows a lead to appear in multiple lists (e.g. "March Leads" and "Tech Startups") without schema changes later.

---

## 3. API Additions (for Save to List and list management)

| Method | Path | Purpose |
|--------|------|---------|
| GET    | `/api/lists` | List all custom lists (id, name, description, created_at, lead_count optional). |
| POST   | `/api/lists` | Create a list. Body: `{ name, description? }`. |
| PATCH  | `/api/lists/:id` | Update list name/description. |
| DELETE | `/api/lists/:id` | Delete list (and list_lead rows via CASCADE). |
| GET    | `/api/lists/:id/leads` | Leads in this list (full lead objects). |
| POST   | `/api/leads/save-to-list` | **Save to List.** Body: `{ listId: number, companyNumbers: string[] }`. For each `company_number`: (1) get company from ch_cache; (2) upsert lead (create or update by company_number); (3) insert into list_lead if not already in list. Returns `{ saved: number, listId, leadIds?: number[] }`. |

Behaviour of **Save to List**:
- If a lead already exists for `company_number`, it is updated with latest ch_cache snapshot (name, address, etc.) and linked to the list.
- If no lead exists, create one from ch_cache data with `status = 'New'` and `source = 'companies_house'` (or keep existing source if updating), then add to list.

---

## 4. UI Changes (Leads page – Companies tab)

- **List selector** – Dropdown or combobox to choose "Current list" (or "All companies" when viewing ch_cache). Choosing a list could switch the table to "companies in this list" (leads in list) vs "CH search" (ch_cache). For the first phase, we can keep the main view as ch_cache search and use the list only for the "Save to List" action.
- **Save to List** – When one or more rows are selected:
  - Show a button "Save to List" in the bottom bar (e.g. next to "Continue" or replacing it for this action).
  - On click: open a small modal (or dropdown) to pick an existing list or create a new one (name only is enough for MVP). Then call `POST /api/leads/save-to-list` with `listId` and `companyNumbers` (from `selectedIds`).
  - After success: toast or inline message "X companies saved to list Y", clear selection optionally.
- **Reuse existing components:** Use your existing Buttons and Modals (or a simple modal) to keep the same UI/UX style.

---

## 5. Implementation Order (after approval)

1. **Database:** In `initSchema` (and `ensure*` helpers): create `lists`, `list_lead`, `email_templates`, `email_logs`; add to `leads`: `linkedin_url`, `predicted_email`, `enrichment_status`; extend `STATUS` / `STATUS_VALUES` for outreach (Kanban maps legacy Contacted/Qualified to Email Sent/Replied).
2. **Backend:** Add in `database.js`: `createList`, `getLists`, `getListById`, `updateList`, `deleteList`, `getLeadsByListId`, `addLeadsToList`. Expose list CRUD and `POST /api/leads/save-to-list` in `server.js`. (Email template/log APIs and Brevo in a later phase.)
3. **Frontend:** In Leads page, "Save to List" button and modal/dropdown to choose or create list; wire to `POST /api/leads/save-to-list`. Update Kanban to use the six outreach columns and legacy status mapping.

---

## 6. Summary

| Item | Change |
|------|--------|
| **New tables** | `lists`, `list_lead`, `email_templates`, `email_logs` |
| **leads** | New columns: `linkedin_url`, `predicted_email`, `enrichment_status`; status enum extended (Kanban-compatible) |
| **New APIs** | GET/POST/PATCH/DELETE lists, GET list leads, POST save-to-list |
| **UI** | Save to List on Leads page with selection + list picker |

**Phase 1:** Lists, list_lead, leads new columns, extended statuses, Save to List.  
**Later (Enrichment / Outreach):** email_templates and email_logs used by Brevo integration and Analytics.
