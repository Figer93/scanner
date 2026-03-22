/**
 * Persist enrichment results: leads UPDATE, enrichment_logs, company_contacts, job counters.
 */

const logger = require('../lib/logger');
const { STATUS } = require('../db/connection');
const { getIo } = require('../serverContext');

/**
 * @param {import('../db/connection').Db} db
 * @param {object} row
 */
async function insertEnrichmentLog(db, row) {
    try {
        await db.run(
            `INSERT INTO enrichment_logs (lead_id, job_id, stage, status, duration_ms, detail)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
            [
                row.lead_id,
                row.job_id || null,
                row.stage,
                row.status,
                row.duration_ms != null ? row.duration_ms : null,
                JSON.stringify(row.detail || {}),
            ]
        );
    } catch (err) {
        logger.error({ err: err.message, leadId: row.lead_id, stage: row.stage }, 'insertEnrichmentLog failed');
    }
}

/**
 * @param {import('../db/connection').Db} db
 * @param {number} leadId
 * @param {Array<{ type: string, value: string, source: string, valid?: boolean | null }>} contacts
 */
async function upsertCompanyContacts(db, leadId, contacts) {
    for (const c of contacts) {
        if (!c.value || !c.type) continue;
        try {
            await db.run(
                `INSERT INTO company_contacts (lead_id, type, value, source, valid, validated_at)
                 VALUES ($1, $2, $3, $4, $5, CASE WHEN $5 IS NOT NULL THEN CURRENT_TIMESTAMP ELSE NULL END)
                 ON CONFLICT (lead_id, type, value) DO NOTHING`,
                [leadId, c.type, c.value, c.source, c.valid ?? null]
            );
        } catch (err) {
            logger.warn({ err: err.message, leadId }, 'company_contacts upsert failed');
        }
    }
}

/**
 * @param {{
 *   db: import('../db/connection').Db,
 *   leadId: number,
 *   jobId: string | null,
 *   website: string | null,
 *   emails: string[],
 *   phones: string[],
 *   linkedin_url: string | null,
 *   predicted_email: string | null,
 *   enrichment_score: number,
 *   enrichment_status: string,
 *   website_status: string | null,
 *   website_checked_at: string | null,
 *   email_valid: boolean | null,
 *   source_metadata: object | null,
 * }} p
 */
async function applyLeadEnrichmentUpdate(db, leadId, jobId, p) {
    const emailsJson = JSON.stringify(p.emails || []);
    const phonesJson = JSON.stringify(p.phones || []);
    const metaJson = p.source_metadata != null ? JSON.stringify(p.source_metadata) : null;
    const score = p.enrichment_score | 0;
    const setEnrichedCrm = score >= 25;

    try {
        await db.run(
            `UPDATE leads SET
                website = COALESCE($1, website),
                emails = $2,
                phones = $3,
                linkedin_url = COALESCE($4, linkedin_url),
                predicted_email = COALESCE($5, predicted_email),
                enrichment_score = $6,
                enrichment_status = $7,
                website_status = $8,
                website_checked_at = $9::timestamptz,
                email_valid = $10,
                enriched_at = COALESCE(enriched_at, CURRENT_TIMESTAMP),
                source_metadata = CASE WHEN $11::text IS NULL THEN source_metadata ELSE $11::text END,
                status = CASE WHEN $12::boolean THEN $13 ELSE status END,
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $14`,
            [
                p.website,
                emailsJson,
                phonesJson,
                p.linkedin_url,
                p.predicted_email,
                score,
                p.enrichment_status,
                p.website_status,
                p.website_checked_at,
                p.email_valid,
                metaJson,
                setEnrichedCrm,
                STATUS.ENRICHED,
                leadId,
            ]
        );
    } catch (err) {
        logger.error({ err: err.message, leadId }, 'applyLeadEnrichmentUpdate failed');
        throw err;
    }

    const io = getIo();
    if (io && score >= 25) {
        try {
            const row = await db.queryOne(
                'SELECT id, company_name, company_number, website, enrichment_score, status FROM leads WHERE id = $1',
                [leadId]
            );
            if (row) io.emit('lead:enriched', { lead: row });
        } catch (err) {
            logger.warn({ err: err.message }, 'lead:enriched emit failed');
        }
    }
}

module.exports = {
    insertEnrichmentLog,
    upsertCompanyContacts,
    applyLeadEnrichmentUpdate,
};
