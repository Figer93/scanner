-- Performance indexes for CHScanner:
-- 1) `leads` enriched search ordering by `date_of_creation` (stored as YYYY-MM-DD text)
-- 2) inbox summary/sidebar aggregation by `lead_id` and ordering by MAX(sent_at)

-- Enriched leads search ordering/filtering
CREATE INDEX IF NOT EXISTS idx_leads_date_of_creation ON leads(date_of_creation);

-- Inbox aggregation speedups
-- Supports: GROUP BY lead_id + MAX(sent_at)
CREATE INDEX IF NOT EXISTS idx_email_logs_lead_id_sent_at_desc
    ON email_logs(lead_id, sent_at DESC);

-- Helps the inbound-specific MAX(CASE WHEN direction='inbound' THEN sent_at ...)
CREATE INDEX IF NOT EXISTS idx_email_logs_lead_id_inbound_sent_at_desc
    ON email_logs(lead_id, sent_at DESC)
    WHERE direction = 'inbound';

