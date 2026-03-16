# CHScanner Scripts

Scripts in the `scripts/` folder are run from the project root (e.g. `node scripts/...` or via npm scripts).

## copy-ui-dist.js

**Purpose:** Copies the built UI from `ui/dist/` to the root `dist/` folder so the backend can serve the production frontend.

**When to run:** Automatically run by `npm run build`. Run manually only if you have already built the UI (`cd ui && npm run build`) and want to refresh root `dist/` without rebuilding.

**Usage:**

```bash
node scripts/copy-ui-dist.js
```

**Requirements:** `ui/dist/` must exist (build the UI first). The script removes the existing root `dist/` and copies the contents of `ui/dist` into it.

---

## copy-export-html.js

**Purpose:** Copies the single-file HTML export from `ui/export/index.html` to `export/chscanner.html` in the project root. The single-file build inlines all JS/CSS so the app can be opened as one HTML file (e.g. for archiving or offline layout).

**When to run:** Automatically run by `npm run export:html`. Run manually after building the single-file UI with `cd ui && npm run build:single`.

**Usage:**

```bash
node scripts/copy-export-html.js
```

**Requirements:** `ui/export/index.html` must exist. The backend is still required for API and Socket.IO; the single file only bundles the UI.

---

## sync-companies-house.js

**Purpose:** Syncs Companies House data into the local cache (`ch_cache` table). The pipeline and “Find leads” UI search this cache for instant results instead of calling the Companies House API on every search.

**When to run:** Periodically (e.g. daily via cron) or manually after installing or when you want fresh CH data. Also run once before using “Find leads” if the cache is empty.

**Usage:**

```bash
npm run sync:companies-house
# or
node scripts/sync-companies-house.js [--daysBack=30] [--limit=500] [--fullProfile]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `--daysBack=N` | How many days back to fetch incorporations | env `CH_DAYS_BACK` or 30 |
| `--limit=N` | Max companies to sync | env `CH_LIMIT` or 500 |
| `--fullProfile` | Fetch full company profile (GET /company/:number) for each result | false |

**Environment:** `COMPANIES_HOUSE_API_KEY` (or key set in Profile via UI) is required. Optional: `DB_PATH`, `CH_DAYS_BACK`, `CH_LIMIT`.

**Output:** Logs “Synced N companies” and any errors. Usage is recorded in `usage_log` for the Companies House service.
