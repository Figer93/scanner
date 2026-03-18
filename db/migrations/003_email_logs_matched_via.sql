-- Track how inbound email_logs were matched to help UI label threads.
-- One of:
--   - in_reply_to: matched to an outbound email using In-Reply-To / Message-Id linkage
--   - sender_fallback: no reply match; matched by sender email to a lead's contact email(s)

ALTER TABLE IF EXISTS email_logs
    ADD COLUMN IF NOT EXISTS matched_via TEXT;

CREATE INDEX IF NOT EXISTS idx_email_logs_matched_via ON email_logs(matched_via);

