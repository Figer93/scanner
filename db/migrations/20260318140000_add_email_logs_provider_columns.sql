-- Add provider metadata to email logs (Mailgun reply threading)
-- Safe to run multiple times.

ALTER TABLE IF EXISTS public.email_logs
    ADD COLUMN IF NOT EXISTS provider TEXT;

ALTER TABLE IF EXISTS public.email_logs
    ADD COLUMN IF NOT EXISTS provider_message_id TEXT;

CREATE INDEX IF NOT EXISTS idx_email_logs_provider_message_id
    ON public.email_logs(provider_message_id);

