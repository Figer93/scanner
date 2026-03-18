/**
 * Lead CRUD: upsert, query, update, activities, delete.
 */

const { STATUS, LEAD_SOURCE } = require('./connection');
const logger = require('../lib/logger');

function parseLeadRow(row) {
    let source_metadata = null;
    if (row.source_metadata && typeof row.source_metadata === 'string') {
        try { source_metadata = JSON.parse(row.source_metadata); }
        catch (err) { logger.warn({ err: err.message }, 'Failed to parse source_metadata'); }
    }
    let score_breakdown = null;
    if (row.score_breakdown && typeof row.score_breakdown === 'string') {
        try { score_breakdown = JSON.parse(row.score_breakdown); }
        catch (err) { logger.warn({ err: err.message }, 'Failed to parse score_breakdown'); }
    }
    return {
        ...row,
        emails: JSON.parse(row.emails || '[]'),
        phones: JSON.parse(row.phones || '[]'),
        contact_form: !!row.contact_form,
        source_metadata,
        score_breakdown,
    };
}

async function upsertLead(db, lead) {
    const emailsJson = JSON.stringify(lead.emails || []);
    const phonesJson = JSON.stringify(lead.phones || []);
    const contactForm = lead.contact_form ? 1 : 0;
    const status = lead.status || STATUS.NEW;
    const source = lead.source === 'json_file' ? LEAD_SOURCE.JSON_FILE : (lead.source || LEAD_SOURCE.JSON_FILE);
    const sourceMetadataJson = lead.source_metadata != null ? JSON.stringify(lead.source_metadata) : null;
    const dateOfCreation = lead.date_of_creation != null ? String(lead.date_of_creation).trim() || null : null;

    const existing = await db.queryOne('SELECT id FROM leads WHERE company_number = $1', [lead.company_number]);

    if (existing) {
        await db.run(
            `UPDATE leads SET
                company_name = $1, address = $2, postcode = $3, website = $4,
                emails = $5, phones = $6, contact_form = $7, status = $8, ice_breaker = $9, source = $10,
                score = $11, outreach_draft = $12,
                website_services = $13, website_size = $14, website_tech = $15,
                source_metadata = $16, date_of_creation = $17,
                updated_at = CURRENT_TIMESTAMP
            WHERE company_number = $18`,
            [
                lead.company_name, lead.address ?? null, lead.postcode ?? null, lead.website ?? null,
                emailsJson, phonesJson, contactForm, status, lead.ice_breaker ?? null, source,
                lead.score ?? null, lead.outreach_draft ?? null,
                lead.website_services ?? null, lead.website_size ?? null, lead.website_tech ?? null,
                sourceMetadataJson, dateOfCreation, lead.company_number,
            ]
        );
        return { inserted: false, id: existing.id };
    }

    const { id } = await db.runReturningId(
        `INSERT INTO leads (company_name, company_number, address, postcode, website, emails, phones, contact_form, status, ice_breaker, source, score, outreach_draft, website_services, website_size, website_tech, source_metadata, date_of_creation)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING id`,
        [
            lead.company_name, lead.company_number, lead.address ?? null, lead.postcode ?? null,
            lead.website ?? null, emailsJson, phonesJson, contactForm, status, lead.ice_breaker ?? null,
            source, lead.score ?? null, lead.outreach_draft ?? null,
            lead.website_services ?? null, lead.website_size ?? null, lead.website_tech ?? null,
            sourceMetadataJson, dateOfCreation,
        ]
    );
    return { inserted: true, id };
}

async function getLeadById(db, id) {
    const row = await db.queryOne('SELECT * FROM leads WHERE id = $1', [id]);
    return row ? parseLeadRow(row) : null;
}

async function getLeadByCompanyNumber(db, companyNumber) {
    const row = await db.queryOne('SELECT * FROM leads WHERE company_number = $1', [companyNumber]);
    return row ? parseLeadRow(row) : null;
}

async function getAllLeads(db) {
    const rows = await db.query('SELECT * FROM leads ORDER BY id');
    return rows.map((r) => parseLeadRow(r));
}

async function getLeadsByListId(db, listId) {
    const rows = await db.query(
        'SELECT l.*, ll.added_at AS date_added FROM list_lead ll JOIN leads l ON l.id = ll.lead_id WHERE ll.list_id = $1 ORDER BY ll.added_at ASC',
        [listId]
    );
    return rows.map((row) => {
        const { date_added, ...leadRow } = row;
        const parsed = parseLeadRow(leadRow);
        parsed.date_added = date_added || null;
        return parsed;
    });
}

async function getLeads(db, options = {}) {
    const raw = options?.listId;
    const listId = raw != null ? parseInt(Number(raw), 10) : null;
    if (listId != null && !Number.isNaN(listId) && listId >= 1) {
        return getLeadsByListId(db, listId);
    }
    return getAllLeads(db);
}

async function hasEnrichedLead(db, companyNumber) {
    const row = await db.queryOne('SELECT status FROM leads WHERE company_number = $1', [companyNumber]);
    return row ? [STATUS.ENRICHED, STATUS.CONTACTED, STATUS.QUALIFIED, STATUS.CONVERTED].includes(row.status) : false;
}

async function updateLead(db, id, updates) {
    if (!updates || Object.keys(updates).length === 0) return;
    const allowed = ['status', 'score', 'score_reasoning', 'score_breakdown', 'outreach_draft', 'website_services', 'website_size', 'website_tech', 'assigned_to', 'linkedin_url', 'predicted_email', 'enrichment_status', 'emails', 'phones'];
    const setClause = [];
    const values = [];
    let idx = 1;
    for (const key of allowed) {
        if (updates[key] === undefined) continue;
        if (key === 'emails' || key === 'phones') {
            const arr = Array.isArray(updates[key]) ? updates[key] : [];
            const normalized = arr.map((v) => (v != null && String(v).trim() !== '' ? String(v).trim() : null)).filter(Boolean);
            setClause.push(`${key} = $${idx++}`);
            values.push(JSON.stringify(normalized));
        } else if (key === 'score_breakdown') {
            setClause.push(`${key} = $${idx++}`);
            values.push(updates[key] != null ? JSON.stringify(updates[key]) : null);
        } else {
            setClause.push(`${key} = $${idx++}`);
            values.push(updates[key]);
        }
    }
    if (setClause.length === 0) return;
    setClause.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    await db.run(`UPDATE leads SET ${setClause.join(', ')} WHERE id = $${idx}`, values);
}

async function ensureLeadEnrichedAt(db, leadId, at = null) {
    if (!leadId) return;
    await db.run(
        `UPDATE leads
         SET enriched_at = COALESCE(enriched_at, COALESCE($1, CURRENT_TIMESTAMP)),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [at, leadId]
    );
}

const MILESTONE_COLUMNS = Object.freeze({
    sent: 'first_email_sent_at',
    opened: 'first_email_opened_at',
    replied: 'first_email_replied_at',
});

/**
 * Set a milestone timestamp exactly once per lead, but only after the lead is enriched.
 * If `at` is provided, it must be >= enriched_at (otherwise ignored).
 */
async function setLeadMilestoneOnce(db, leadId, milestone, at = null) {
    const col = MILESTONE_COLUMNS[milestone];
    if (!col) return;
    await db.run(
        `UPDATE leads
         SET ${col} = COALESCE(${col}, COALESCE($1, CURRENT_TIMESTAMP)),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
           AND enriched_at IS NOT NULL
           AND (${col} IS NULL)
           AND (COALESCE($1, CURRENT_TIMESTAMP) >= enriched_at)`,
        [at, leadId]
    );
}

async function setLeadConverted(db, leadId, converted) {
    if (!leadId) return;
    if (converted) {
        await db.run(
            `UPDATE leads
             SET converted_at = COALESCE(converted_at, CURRENT_TIMESTAMP),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [leadId]
        );
    } else {
        await db.run(
            `UPDATE leads
             SET converted_at = NULL,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [leadId]
        );
    }
}

async function updateLeadEnrichment(db, id, enrichment) {
    if (!enrichment || !id) return;
    const emailsJson = JSON.stringify(enrichment.emails || []);
    const phonesJson = JSON.stringify(enrichment.phones || []);
    await db.run(
        `UPDATE leads SET
            website = $1, emails = $2, phones = $3, contact_form = $4,
            website_services = $5, website_size = $6, website_tech = $7,
            ice_breaker = $8, status = $9,
            enriched_at = CASE WHEN enriched_at IS NULL AND $9 = 'Enriched' THEN CURRENT_TIMESTAMP ELSE enriched_at END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $10`,
        [
            enrichment.website ?? null, emailsJson, phonesJson, enrichment.contact_form ? 1 : 0,
            enrichment.website_services ?? null, enrichment.website_size ?? null, enrichment.website_tech ?? null,
            enrichment.ice_breaker ?? null, enrichment.status ?? null, id,
        ]
    );
}

async function leadExistsByDomain(db, domainOrUrl) {
    if (!domainOrUrl || !String(domainOrUrl).trim()) return false;
    let normalized;
    try {
        const s = String(domainOrUrl).trim();
        const url = s.startsWith('http') ? s : 'https://' + s;
        normalized = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    } catch (_) {
        return false;
    }
    const rows = await db.query('SELECT website FROM leads WHERE website LIKE $1 LIMIT 50', ['%' + normalized + '%']);
    for (const row of rows) {
        const w = row.website;
        try {
            const u = new URL(w.startsWith('http') ? w : 'https://' + w);
            if (u.hostname.toLowerCase().replace(/^www\./, '') === normalized) return true;
        } catch (_) { /* skip */ }
    }
    return false;
}

async function getLeadActivities(db, leadId) {
    return db.query('SELECT * FROM lead_activities WHERE lead_id = $1 ORDER BY created_at DESC', [leadId]);
}

async function addLeadActivity(db, leadId, type, content) {
    const { id } = await db.runReturningId(
        'INSERT INTO lead_activities (lead_id, type, content) VALUES ($1, $2, $3) RETURNING id',
        [leadId, type, content ?? '']
    );
    return id;
}

async function deleteLeadsByIds(db, ids) {
    if (!Array.isArray(ids) || ids.length === 0) return 0;
    const valid = ids.filter((id) => Number.isInteger(id) && id >= 1);
    if (valid.length === 0) return 0;
    const placeholders = valid.map((_, i) => `$${i + 1}`).join(',');
    await db.run(`DELETE FROM lead_activities WHERE lead_id IN (${placeholders})`, valid);
    await db.run(`DELETE FROM leads WHERE id IN (${placeholders})`, valid);
    return valid.length;
}

module.exports = {
    parseLeadRow,
    upsertLead,
    getLeadById,
    getLeadByCompanyNumber,
    getAllLeads,
    getLeads,
    getLeadsByListId,
    hasEnrichedLead,
    updateLead,
    ensureLeadEnrichedAt,
    setLeadMilestoneOnce,
    setLeadConverted,
    updateLeadEnrichment,
    leadExistsByDomain,
    getLeadActivities,
    addLeadActivity,
    deleteLeadsByIds,
};
