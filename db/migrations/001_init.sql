-- CHScanner PostgreSQL schema (Supabase-compatible).
-- Run this once when using DATABASE_URL (e.g. Supabase).

-- Core tables
CREATE TABLE IF NOT EXISTS leads (
    id SERIAL PRIMARY KEY,
    company_name TEXT NOT NULL,
    company_number TEXT NOT NULL,
    address TEXT,
    postcode TEXT,
    website TEXT,
    emails TEXT,
    phones TEXT,
    contact_form INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'New',
    ice_breaker TEXT,
    source TEXT DEFAULT 'json_file',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    score INTEGER,
    outreach_draft TEXT,
    score_reasoning TEXT,
    score_breakdown TEXT,
    website_services TEXT,
    website_size TEXT,
    website_tech TEXT,
    assigned_to TEXT,
    source_metadata TEXT,
    date_of_creation TEXT,
    linkedin_url TEXT,
    predicted_email TEXT,
    enrichment_status TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_company_number ON leads(company_number);
CREATE INDEX IF NOT EXISTS idx_leads_website ON leads(website);

CREATE TABLE IF NOT EXISTS profile (
    key TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS usage_log (
    id SERIAL PRIMARY KEY,
    service TEXT NOT NULL,
    called_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    endpoint TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    request_count INTEGER DEFAULT 1,
    estimated_cost_gbp REAL
);

-- Lead activities
CREATE TABLE IF NOT EXISTS lead_activities (
    id SERIAL PRIMARY KEY,
    lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    content TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_id ON lead_activities(lead_id);

-- CH cache
CREATE TABLE IF NOT EXISTS ch_cache (
    company_number TEXT PRIMARY KEY,
    company_name TEXT NOT NULL,
    address TEXT,
    postcode TEXT,
    date_of_creation TEXT,
    raw_json TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ch_cache_company_name ON ch_cache(company_name);
CREATE INDEX IF NOT EXISTS idx_ch_cache_postcode ON ch_cache(postcode);
CREATE INDEX IF NOT EXISTS idx_ch_cache_date_of_creation ON ch_cache(date_of_creation);

-- Lists
CREATE TABLE IF NOT EXISTS lists (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS list_lead (
    id SERIAL PRIMARY KEY,
    list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(list_id, lead_id)
);

CREATE INDEX IF NOT EXISTS idx_list_lead_list_id ON list_lead(list_id);
CREATE INDEX IF NOT EXISTS idx_list_lead_lead_id ON list_lead(lead_id);
CREATE INDEX IF NOT EXISTS idx_list_lead_added_at ON list_lead(added_at);

-- Email templates
CREATE TABLE IF NOT EXISTS email_templates (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Email logs
CREATE TABLE IF NOT EXISTS email_logs (
    id SERIAL PRIMARY KEY,
    lead_id INTEGER NOT NULL REFERENCES leads(id),
    template_id INTEGER REFERENCES email_templates(id),
    brevo_message_id TEXT,
    provider TEXT,
    provider_message_id TEXT,
    direction TEXT,
    status TEXT,
    subject TEXT,
    body TEXT,
    from_email TEXT,
    to_email TEXT,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_logs_lead_id ON email_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_brevo_message_id ON email_logs(brevo_message_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_provider_message_id ON email_logs(provider_message_id);

-- Sequences
CREATE TABLE IF NOT EXISTS sequences (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sequence_steps (
    id SERIAL PRIMARY KEY,
    sequence_id INTEGER NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
    step_number INTEGER NOT NULL,
    template_id INTEGER NOT NULL REFERENCES email_templates(id),
    delay_days INTEGER NOT NULL,
    condition TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sequence_steps_sequence_step ON sequence_steps(sequence_id, step_number);

CREATE TABLE IF NOT EXISTS sequence_enrolments (
    id SERIAL PRIMARY KEY,
    sequence_id INTEGER NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
    lead_id INTEGER NOT NULL REFERENCES leads(id),
    current_step INTEGER DEFAULT 1,
    status TEXT DEFAULT 'active',
    enrolled_at TIMESTAMPTZ DEFAULT NOW(),
    next_send_at TIMESTAMPTZ,
    UNIQUE(sequence_id, lead_id)
);

CREATE INDEX IF NOT EXISTS idx_sequence_enrolments_next_send ON sequence_enrolments(next_send_at);
CREATE INDEX IF NOT EXISTS idx_sequence_enrolments_status ON sequence_enrolments(status);
