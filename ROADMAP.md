# CHScanner — Product Roadmap

> **Goal:** Fully automated outreach system that finds newly registered UK businesses,
> enriches their data, sends personalised Revolut Business referral emails, tracks
> responses, and reports earnings — with zero daily manual intervention.
>
> **How to use this file with Cursor:**
> Work through phases sequentially. Never start a new phase until the previous one
> is tested and confirmed working. After each task, test the affected feature in
> the browser before moving on.

---

## ✅ COMPLETED

- Full codebase refactor (TypeScript, React Query, Zustand, design tokens)
- Security hardening (CORS, rate limiting, Zod validation, path traversal fix)
- Backend split (database.js → 9 modules, leads.js → 4 modules)
- Dashboard with pipeline stats, activity feed, quick actions
- Clickable stat cards with colour glow → filtered Kanban
- Improved activity feed with content-type parsing
- **Phase 1B:** Email tracking (Brevo webhook, test endpoint, status, webhook URL in Profile)
- **Phase 2A:** Email personalisation (template variables, referral/sender settings, template preview, send-test via Brevo)
- **Phase 2B:** Automated follow-up sequences (sequence model, builder UI, send queue with rate limiting, queue status in DB Management)
- **Phase 3A:** Earnings Tracker (Earnings page with monthly bento, settings, weekly chart, top templates; Dashboard stat card with tooltip)
- **Phase 3B:** Smart Scoring (transparent points + AI, score breakdown UI, score filter in Find Leads, queue prioritised by score)

---

## 🔴 PHASE 1B — Email Tracking (Completed)

> **Why:** Opened/Replied stats are always 0. Until this is fixed,
> the entire outreach funnel is blind. Everything else depends on this.

### Task 1.1 — Audit and fix Brevo webhook handler

**File:** `src/routes/emailLogs.js`

- Verify `POST /api/webhooks/brevo` correctly maps Brevo event types:
  - `"opened"` → update lead status to `"Opened"`, log event
  - `"replied"` / `"unique_opened"` → update to `"Replied"`, log event
  - `"click"` → log click event with URL, do not change status
  - `"soft_bounce"` / `"hard_bounce"` → mark email as bounced on lead
  - `"unsubscribe"` → add lead to blacklist, update status to `"Unsubscribed"`
- Verify `updateEmailLogStatus()` is called with correct `brevo_message_id`
- Verify lead status is updated via `updateLead()` after each event
- Add structured logging for every webhook event received

**Test:** Use the test endpoint (Task 1.2) to simulate an open event.
Confirm the lead's status changes in the database and on the Kanban board.

---

### Task 1.2 — Add webhook test endpoint

**File:** `src/routes/emailLogs.js`

Add `POST /api/webhooks/brevo/test`:

```json
// Request body
{
  "event": "opened",
  "leadId": 1,
  "messageId": "optional-brevo-message-id"
}
```

- Simulates a Brevo webhook event without needing a real email
- Fires the same handler logic as the real webhook
- Returns `{ ok: true, leadUpdated: true, newStatus: "Opened" }`
- Only available in development (`NODE_ENV !== 'production'`)

---

### Task 1.3 — Add webhook status endpoint

**File:** `src/routes/emailLogs.js`

Add `GET /api/webhooks/brevo/status`:

Returns:
```json
{
  "secretConfigured": true,
  "lastEventAt": "2026-03-15T14:00:00Z",
  "totalEventsReceived": 42,
  "eventBreakdown": {
    "opened": 18,
    "clicked": 7,
    "replied": 3,
    "bounced": 2,
    "unsubscribed": 1
  }
}
```

---

### Task 1.4 — Webhook URL in Profile page

**File:** `ui/src/pages/profile/ApiKeysSection.tsx`

Under the Brevo API key row, add a read-only info box:

```
Your Brevo webhook URL
https://yourdomain.com/api/webhooks/brevo
[Copy URL]
```

- "Copy URL" button uses `navigator.clipboard.writeText()`
- Shows a green "Copied!" confirmation for 2 seconds
- Explains: "Paste this URL into Brevo → Transactional → Webhooks.
  Select events: opened, clicked, replied, soft_bounce, hard_bounce, unsubscribe."

**Test:** Open Profile page, verify webhook URL is visible, copy button works.

---

## ✅ PHASE 2A — Email Personalisation (Completed)

> **Why:** Generic emails get ~5% open rate. Personalised emails get ~25%.
> This is the single biggest lever for increasing referral conversions.

### Task 2.1 — Template variable system ✅

**Files:** `src/routes/emailTemplates.js`, `ui/src/pages/Outreach.jsx`

Add support for these variables in email template subject and body:

| Variable | Resolves to |
|---|---|
| `{{company_name}}` | Lead's company name |
| `{{director_name}}` | First director's full name |
| `{{director_first_name}}` | First name only |
| `{{incorporation_date}}` | Formatted: "16 February 2026" |
| `{{company_type}}` | "Ltd", "LLP", etc. |
| `{{referral_link}}` | From Profile settings (Task 2.2) |
| `{{sender_name}}` | From Profile settings |

- Add a `resolveTemplateVariables(template, lead)` function in `src/lib/templateVars.js`
- Call this function before sending every email
- If a variable is missing (e.g. no director found), replace with empty string silently

---

### Task 2.2 — Referral link and sender settings in Profile ✅

**File:** `ui/src/pages/profile/ApiKeysSection.tsx` or new `OutreachSection.tsx`

Add a new "Outreach settings" section to the Profile page with these fields:

- **Referral link** — `https://revolut.com/referral/your-code` (text input, saved to DB)
- **Sender name** — "Alex from CHScanner" (used in `{{sender_name}}`)
- **Daily send limit** — number input, default 50 (used by Phase 2B queue)
- **Send delay (minutes)** — min delay between emails, default 3

Save all fields via `useSaveProfile()` mutation. Show save confirmation toast.

---

### Task 2.3 — Template preview with real data ✅

**File:** `ui/src/pages/Outreach.tsx`

Add a "Preview" button next to each email template. When clicked:

- Open a `Modal` with a dropdown: "Preview with lead:" (select from enriched leads)
- Show the rendered subject and body with all `{{variables}}` substituted
- Show a warning banner if any variables could not be resolved
- Add a "Send test email to myself" button (see Task 2.4)

---

### Task 2.4 — Test email send ✅

**File:** `src/routes/emailTemplates.js`

Add `POST /api/email-templates/:id/send-test`:

```json
{ "toEmail": "your@email.com", "leadId": 1 }
```

- Resolves all template variables using the specified lead's data
- Sends the email via Brevo to `toEmail`
- Returns `{ ok: true, subject: "...", previewText: "..." }`

**Test:** Send a test email to yourself. Verify variables are substituted correctly.
Open the email, verify the referral link is correct.

---

## ✅ PHASE 2B — Automated Follow-up Sequences (Completed)

> **Why:** 70% of replies come from follow-ups, not first contact.
> Without this, you are leaving most of your revenue on the table.

### Task 2.5 — Follow-up sequence data model ✅

**File:** `src/db/schema.js`, `src/db/emailTemplates.js`

Add two new tables:

```sql
-- A sequence is a series of emails for a campaign
CREATE TABLE sequences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Each step in a sequence
CREATE TABLE sequence_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sequence_id INTEGER NOT NULL,
  step_number INTEGER NOT NULL,       -- 1, 2, 3
  template_id INTEGER NOT NULL,       -- which email template to send
  delay_days INTEGER NOT NULL,        -- days after previous step
  condition TEXT NOT NULL,            -- 'always' | 'not_opened' | 'opened_not_replied'
  FOREIGN KEY (sequence_id) REFERENCES sequences(id) ON DELETE CASCADE,
  FOREIGN KEY (template_id) REFERENCES email_templates(id)
);

-- Tracks where each lead is in a sequence
CREATE TABLE sequence_enrolments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sequence_id INTEGER NOT NULL,
  lead_id INTEGER NOT NULL,
  current_step INTEGER DEFAULT 1,
  status TEXT DEFAULT 'active',       -- 'active' | 'completed' | 'stopped' | 'replied'
  enrolled_at TEXT DEFAULT (datetime('now')),
  next_send_at TEXT,
  UNIQUE(sequence_id, lead_id)
);
```

---

### Task 2.6 — Sequence builder UI ✅

**File:** `ui/src/pages/Outreach.tsx` — add new "Sequences" tab

Build a sequence builder with:

- "New sequence" button → modal to name the sequence
- Sequence steps displayed as a vertical timeline:
  ```
  Step 1: [Template dropdown] — Send immediately
  ↓ Wait [3] days if [not opened ▼]
  Step 2: [Template dropdown]
  ↓ Wait [2] days if [opened but not replied ▼]
  Step 3: [Template dropdown]
  [+ Add step]
  ```
- "Enrol leads" button → opens modal to select a list or filter
- Active enrolment count shown per sequence

---

### Task 2.7 — Send queue with rate limiting ✅

**File:** `src/services/emailQueue.js` (new file)

Build an email send queue that:

- Reads pending `sequence_enrolments` where `next_send_at <= now()`
- Checks lead's current email status meets the step condition
- Respects daily send limit from Profile settings (default 50)
- Enforces minimum delay between sends (default 3 minutes)
- Marks step complete, calculates and sets `next_send_at` for next step
- On reply/unsubscribe: sets enrolment status to `'replied'` / `'stopped'`
- Runs every 5 minutes via the existing scheduler in `src/index.js`

---

### Task 2.8 — Queue status in DB Management ✅

**File:** `ui/src/pages/DBManagement.tsx`

Add a "Send Queue" section showing:

- Emails scheduled for today: X
- Emails sent today: X / 50 (daily limit)
- Next send in: X minutes
- [Pause queue] / [Resume queue] toggle button
- Last 5 scheduled sends: company name, template, scheduled time

---

## ✅ PHASE 3A — Earnings Tracker (Completed)

> **Why:** You need to know your ROI. What open rate are you getting?
> How many referrals? How much money did this generate?

### Task 3.1 — Earnings page ✅

**File:** `ui/src/pages/Earnings.tsx` (new page), add to navigation

Build a dedicated Earnings page with these sections:

**Monthly overview bento grid:**
- Emails sent this month
- Open rate % (opened / sent)
- Reply rate % (replied / sent)
- Referral link clicks (from email tracking)
- Estimated conversions (clicks × conversion rate %)
- Estimated earnings (conversions × £ per referral)

**Settings card:**
- "Revolut pays me £ ___ per referral" — number input, saved to Profile
- "My estimated conversion rate: ___ %" — number input, default 15%

**Weekly performance chart:**
- Line chart: sent / opened / replied per week (last 12 weeks)
- Use recharts (already in the project)

**Top performing templates table:**
- Template name | Sent | Open rate | Reply rate | Est. conversions

---

### Task 3.2 — Add earnings to Dashboard ✅

**File:** `ui/src/pages/Home.tsx`

Add one new stat card to the existing row:

- **Est. earnings this month** — calculated from sends × open rate × conversion rate × £/referral
- Clicking it navigates to `/earnings`
- Show `£0` with a tooltip "Configure in Earnings page" if not set up yet

---

## ✅ PHASE 3B — Smart Scoring (Completed)

> **Why:** Not all leads are equal. A company registered yesterday with a
> director email is 10x more likely to convert than one with no contact data.
> Score them correctly to maximise your time.

### Task 3.3 — Transparent scoring system ✅

**File:** `src/services/ai.js` — `scoreLead()` function

Rewrite the scoring to use a deterministic points system alongside AI:

| Factor | Points |
|---|---|
| Email found | +20 |
| Website found | +15 |
| Director name found | +10 |
| Registered < 30 days ago | +20 |
| Registered 30–90 days ago | +10 |
| Company status: Active | +10 |
| Phone number found | +5 |
| SIC code is service/tech/retail | +10 |
| AI enrichment score | up to +10 |

Store the score breakdown as JSON in the lead record.

---

### Task 3.4 — Score explanation UI ✅

**File:** `ui/src/pages/company/CompanyActions.tsx`

On the company detail page, show score breakdown:

```
AI Score: 8/10
━━━━━━━━━━━━━━━━
✓ Email found        +20
✓ Website found      +15
✓ Director found     +10
✓ Registered 18 days +20
✗ Phone not found      0
━━━━━━━━━━━━━━━━
Total: 65/100 → 8/10
```

Show as a collapsible section under the score badge.

---

### Task 3.5 — Score filter in Find Leads ✅

**File:** `ui/src/stores/filterStore.ts`, `ui/src/components/LeadsSidebar.tsx`

Add a "Minimum score" slider to the filter sidebar:
- Range: 1–10
- Default: show all
- Label: "Score ≥ 7" (shows count of matching leads)

---

### Task 3.6 — Auto-prioritise send queue by score ✅

**File:** `src/services/emailQueue.js`

When picking the next lead to email from the queue:
- Sort by `score DESC` before selecting
- Leads with score ≥ 8 go first
- Add score to the queue status display (Task 2.8)

---

## 🟢 PHASE 4A — Full Autopilot

> **Why:** The real value of this system is that it runs without you.
> Set it up once, check the dashboard once a day, collect referral fees.

### Task 4.1 — Nightly pipeline scheduler

**File:** `src/index.js`, `src/services/scheduler.js`

Build a configurable nightly pipeline:

```
00:00 — Sync new companies from Companies House (last 24h)
00:15 — Enrich all new companies (website, contacts, director)
00:45 — Score all newly enriched leads
01:00 — Auto-enrol leads with score ≥ threshold into default sequence
```

- All timings configurable in Profile → Schedule section
- Score threshold configurable (default: 7)
- Default sequence configurable (which sequence to auto-enrol into)
- Pipeline skips leads already in a sequence

---

### Task 4.2 — "Next run" countdown on Dashboard

**File:** `ui/src/pages/Home.tsx`

Add to the top-right header area (next to "Last run"):

```
Last run 19h ago · 3 added · 3 enriched    Next run in 4h 23m
```

- Calculate from `schedule.cronExpression` + last run timestamp
- Clicking "Next run in X" navigates to Profile → Schedule section

---

### Task 4.3 — Pipeline failure notification

**File:** `src/services/scheduler.js`, `src/routes/profile.js`

If the nightly pipeline fails:
- Send an email to the address in Profile settings using Brevo
- Subject: "CHScanner: Pipeline failed — action required"
- Body: error message, timestamp, link to Logs page
- Add "Notification email" field to Profile → Schedule section

---

## 🟢 PHASE 4B — A/B Testing

> **Why:** Small differences in subject lines can double your open rate.
> Test systematically instead of guessing.

### Task 4.4 — A/B test on sequences

**File:** `src/db/emailTemplates.js`, `ui/src/pages/Outreach.tsx`

Add A/B testing to sequence steps:

- Each step can have Template A and Template B
- Split is configurable: 50/50 default, adjustable
- Assignment is random per lead, stored in `sequence_enrolments`
- After 50+ sends, show winner badge on the Analytics tab:
  ```
  Template A: 22% open rate
  Template B: 31% open rate ← Winner
  ```
- "Use winner for all" button promotes the winning template

---

### Task 4.5 — A/B results in Earnings page

**File:** `ui/src/pages/Earnings.tsx`

Add "Template performance" table with A/B results:

| Template | Variant | Sent | Open rate | Reply rate | Winner |
|---|---|---|---|---|---|
| Cold outreach v1 | A | 50 | 18% | 3% | |
| Cold outreach v1 | B | 50 | 31% | 7% | ✓ |

---

## 🟢 PHASE 5 — Compliance and Scale Protection

> **Why:** Sending to 1,500 contacts/month without these safeguards
> risks your domain being blacklisted and Brevo account suspended.

### Task 5.1 — Blacklist management

**File:** `src/db/schema.js`, `ui/src/pages/DBManagement.tsx`

Add a `blacklist` table:

```sql
CREATE TABLE blacklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,        -- 'domain' | 'company_number' | 'email'
  value TEXT NOT NULL UNIQUE,
  reason TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

- In DB Management, add "Blacklist" tab: view, add, remove entries
- Email queue checks blacklist before every send
- Unsubscribe webhook automatically adds domain to blacklist

---

### Task 5.2 — Unsubscribe link in emails

**Files:** `src/lib/templateVars.js`, `src/routes/emailLogs.js`

- Add `{{unsubscribe_link}}` template variable
- Generates a unique signed URL: `/api/unsubscribe?token=...`
- `GET /api/unsubscribe?token=...` adds lead's domain to blacklist,
  updates lead status to "Unsubscribed", shows a simple "You have been
  unsubscribed" HTML page
- Warn in the template editor if `{{unsubscribe_link}}` is missing
  from the template body

---

### Task 5.3 — Bounce handling

**File:** `src/routes/emailLogs.js` — Brevo webhook handler

When a hard bounce event is received:
- Mark the email address as invalid on the lead record
- Set lead status to "Bounced"
- Add the email domain to a "soft blacklist" (warn but don't block future sends)
- Show bounced leads as a filter in Find Leads: "Bounced emails"

When a soft bounce is received:
- Log the event
- Pause sending to this lead for 7 days
- Retry once after 7 days, then mark as hard bounce if it fails again

---

### Task 5.4 — Deduplication check before send

**File:** `src/services/emailQueue.js`

Before enroling any lead into a sequence:
- Check if a sequence enrolment already exists for this lead
- Check if an email was sent to this lead in the last 30 days
- If yes, skip silently and log: "Skipped [company] — already contacted 5 days ago"
- Show deduplication skips in the queue status (Task 2.8)

---

## 📊 Revenue Projection by Phase

| After Phase | Daily sends | Open rate | Monthly referrals | Est. monthly earnings |
|---|---|---|---|---|
| 1B + 2A | 30 | 15% | 10–20 | £500–1,500 |
| 2B (follow-ups) | 50 | 22% | 25–40 | £1,250–3,000 |
| 3A + 3B | 50 | 28% | 35–55 | £1,750–4,125 |
| 4A (autopilot) | 50 | 28% | 35–55 | £1,750–4,125 (zero effort) |
| 4B (A/B tested) | 50 | 35% | 45–70 | £2,250–5,250 |

*Assumes Revolut pays £50 per approved business account referral.*
*Actual results depend on email deliverability and Revolut's referral terms.*

---

## 🛠 Cursor Instructions

When implementing any task from this roadmap:

1. Read the task description fully before writing code
2. Follow all rules in `.cursorrules` without exception
3. Do NOT change API response shapes — frontend depends on them
4. Do NOT change URL paths of existing endpoints
5. Add loading, error, and empty states to every new UI component
6. After each task, stop and confirm it is working before starting the next
7. If a task requires a new database table, always add it via `initSchema()`
   in `src/db/schema.js` using `CREATE TABLE IF NOT EXISTS`
8. All new frontend files must be TypeScript (`.tsx` / `.ts`)
9. All new backend files can stay as JavaScript (`.js`) for now
10. Test every feature manually in the browser before marking it done