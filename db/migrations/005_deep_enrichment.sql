-- Deep enrichment engine: jobs, per-stage logs, company contacts, lead columns.

CREATE TABLE IF NOT EXISTS enrichment_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'pending',
  total_companies INT DEFAULT 0,
  processed INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  concurrency INT DEFAULT 10,
  filters JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS enrichment_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id INT REFERENCES leads(id) ON DELETE CASCADE,
  job_id UUID REFERENCES enrichment_jobs(id) ON DELETE SET NULL,
  stage TEXT NOT NULL,
  status TEXT NOT NULL,
  duration_ms INT,
  detail JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS company_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id INT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  value TEXT NOT NULL,
  source TEXT NOT NULL,
  valid BOOLEAN,
  validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(lead_id, type, value)
);

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS enrichment_score INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS enrichment_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS website_status TEXT,
  ADD COLUMN IF NOT EXISTS website_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_valid BOOLEAN;

CREATE INDEX IF NOT EXISTS idx_enrichment_logs_lead_id ON enrichment_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_enrichment_logs_job_id ON enrichment_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_company_contacts_lead_id ON company_contacts(lead_id);
CREATE INDEX IF NOT EXISTS idx_leads_enrichment_status ON leads(enrichment_status);
