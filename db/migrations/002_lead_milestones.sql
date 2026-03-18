-- Add per-lead milestone timestamps (one-time events) to avoid double-counting
-- and keep dashboards stable even with long email threads.
--
-- Rule: milestones are only set after a lead becomes Enriched.
-- Each milestone is set at most once per lead.

ALTER TABLE IF EXISTS leads
    ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS first_email_sent_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS first_email_opened_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS first_email_replied_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;

-- Helpful indexes for dashboard/list analytics.
CREATE INDEX IF NOT EXISTS idx_leads_enriched_at ON leads(enriched_at);
CREATE INDEX IF NOT EXISTS idx_leads_first_email_sent_at ON leads(first_email_sent_at);
CREATE INDEX IF NOT EXISTS idx_leads_first_email_opened_at ON leads(first_email_opened_at);
CREATE INDEX IF NOT EXISTS idx_leads_first_email_replied_at ON leads(first_email_replied_at);
CREATE INDEX IF NOT EXISTS idx_leads_converted_at ON leads(converted_at);

