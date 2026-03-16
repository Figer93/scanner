# CHScanner – Troubleshooting & error handling

This guide covers common errors, what they mean, and how to fix them. The app returns **clear, user-facing messages** for API failures where possible.

---

## Google AI (Gemini) – scoring, ice-breakers, drafts

All AI features (lead scoring, ice-breaker during pipeline, outreach draft) use **Google AI Studio (Gemini)**. Errors are mapped to short messages shown in the UI or logs.

### Error messages and fixes

| You see | Likely cause | What to do |
|--------|----------------|------------|
| **Google AI API key not set. Add it in Profile.** | No `GOOGLE_AI_API_KEY` in Profile or `.env` | Open **Profile**, add your Google AI Studio API key, Save. Get a key at [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey). |
| **Google AI API key invalid or missing. Check Profile.** | Key rejected by API (wrong key, revoked) | In Profile, re-paste the key or create a new one in AI Studio. Ensure no extra spaces. |
| **Google AI API key not allowed or quota disabled.** | Key restrictions or billing/quota issue in Google Cloud | In Google AI Studio / Cloud Console, check API is enabled and quota or billing is set up if required. |
| **Gemini model not found. Update the app or try again later.** | API model name changed (e.g. deprecated) | Update CHScanner to the latest version. If the problem persists, open an issue. |
| **Google AI rate limit exceeded. Wait a moment and retry.** | Too many requests in a short time | Wait 30–60 seconds and try again. Score or generate drafts in smaller batches. |
| **Request timed out. Check your connection.** | Network slow or request took >20s | Retry once. If it keeps happening, check your connection and that `generativelanguage.googleapis.com` is not blocked. |
| **Cannot reach Google AI. Check network.** | DNS or firewall blocking the API | Allow outbound HTTPS to `generativelanguage.googleapis.com`. Check VPN/proxy. |
| **Google AI service error. Try again in a few minutes.** | 5xx from Google’s servers | Retry after a short wait. If it persists, check [Google AI status](https://status.cloud.google.com/) or try again later. |
| **Could not parse score from Google AI response.** | Model returned text that wasn’t a number 1–10 | Rare. Retry scoring that lead; if it keeps failing, the lead data may be unusual. |

### Where the key is read from

1. **Profile** (UI): keys stored in the database – used first.
2. **Environment**: `GOOGLE_AI_API_KEY` or `GEMINI_API_KEY` in `.env` – used if not set in Profile.

Keys in Profile override `.env`. No server restart needed after changing keys in Profile.

---

## Pipeline errors (run / enrichment)

### Failed to load leads

- **Cause:** `/api/leads` failed (e.g. database unreachable, permission, or server error).
- **Fix:** Ensure the server is running and `DATABASE_URL` is set to a valid PostgreSQL (Supabase) connection string. Check server logs.

### Run pipeline fails

- **Serper (search):** “No API key” or 401 → set **Serper** key in Profile or `SERPER_API_KEY` in `.env`.
- **Companies House:** 401/403 → check **Companies House** key; ensure it’s the REST API key from [developer.company-information.service.gov.uk](https://developer.company-information.service.gov.uk/).
- **Google Places:** 401 or “REQUEST_DENIED” → set **Google Places** key and enable **Places API** (e.g. Text Search) in Google Cloud.

### No / wrong websites or contacts

- Serper may not find a site for every company; scraper may not find email on the page.
- Check **Logs** in the UI for “Website not found” or “Contacts scraped – emails: 0”. Normal for some leads.

---

## Database (PostgreSQL / Supabase)

- **DATABASE_URL is not set:** The backend requires a PostgreSQL connection string. Set `DATABASE_URL` in `.env` to your Supabase (or any Postgres) URI. Get it from Supabase: Project Settings → Database → Connection string. The server will fail at startup with a clear error if it is missing.
- **Connection refused / timeout:** Check that `DATABASE_URL` uses the correct host and port (Supabase pooler often uses 6543). Ensure your IP is allowed in Supabase: Settings → Database → Network.
- **Profile keys not saving:** Ensure the database is reachable and the schema has been applied (run `db/migrations/001_init.sql` in Supabase SQL Editor once). See [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md).

---

## Error handling in the app

- **API errors** from Gemini are turned into short messages via `formatAiError()` in `src/services/ai.js` (e.g. 401 → “API key invalid or missing”, 429 → “rate limit exceeded”).
- **Score** and **outreach draft** endpoints return these messages in the HTTP body (e.g. 502 with `{ error: "..." }`); the UI shows them in the red action banner.
- **Pipeline** errors are sent over Socket.IO as `ERROR: ...` and shown in the Logs panel; the run response includes `error` when the run fails.

For developer-oriented details (stack traces, raw API responses), run with `LOG_LEVEL=debug` and `LOG_PRETTY=1` and check the server console.
