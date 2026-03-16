/**
 * Enriched leads search: leads with at least one contact point.
 */

const logger = require('../lib/logger');

const ENRICHED_WHERE = `(
    (website IS NOT NULL AND TRIM(website) != '')
    OR (emails IS NOT NULL AND LENGTH(emails) > 2)
    OR (phones IS NOT NULL AND LENGTH(phones) > 2)
)`;

async function searchEnrichedLeads(db, options = {}) {
    const limit = Math.min(500, Math.max(1, options.limit || 100));
    let sql = `SELECT company_name, company_number, address, postcode, date_of_creation, source_metadata, score
        FROM leads
        WHERE ${ENRICHED_WHERE}`;
    const params = [];
    let idx = 1;
    if (options.q && String(options.q).trim()) {
        const q = '%' + String(options.q).trim() + '%';
        sql += ` AND (company_name LIKE $${idx++} OR company_number LIKE $${idx++} OR postcode LIKE $${idx++} OR address LIKE $${idx++})`;
        params.push(q, q, q, q);
    }
    if (options.postcode && String(options.postcode).trim()) {
        const p = '%' + String(options.postcode).trim() + '%';
        sql += ` AND (postcode LIKE $${idx++} OR address LIKE $${idx++})`;
        params.push(p, p);
    }
    if (options.location && String(options.location).trim()) {
        const loc = '%' + String(options.location).trim() + '%';
        sql += ` AND (address LIKE $${idx++} OR postcode LIKE $${idx++})`;
        params.push(loc, loc);
    }
    if (options.daysBack != null && options.daysBack > 0) {
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - Number(options.daysBack));
        sql += ` AND date_of_creation >= $${idx++}`;
        params.push(fromDate.toISOString().slice(0, 10));
    }
    const listId = options.listId != null ? parseInt(Number(options.listId), 10) : null;
    if (listId != null && !Number.isNaN(listId) && listId >= 1) {
        sql += ` AND id IN (SELECT lead_id FROM list_lead WHERE list_id = $${idx++})`;
        params.push(listId);
    }
    sql += ` ORDER BY date_of_creation DESC NULLS LAST, company_number LIMIT $${idx}`;
    params.push(limit);

    const rows = await db.query(sql, params);
    return rows.map((row) => {
        let source_metadata = null;
        if (row.source_metadata) {
            try {
                source_metadata = JSON.parse(row.source_metadata);
            } catch (err) {
                logger.warn({ err: err.message }, 'Failed to parse leads source_metadata');
            }
        }
        const scoreVal = row.score != null && row.score !== '' ? parseInt(row.score, 10) : null;
        return {
            name: row.company_name || '',
            number: row.company_number || '',
            address: row.address ?? null,
            postcode: row.postcode ?? null,
            date_of_creation: row.date_of_creation || null,
            source_metadata,
            score: Number.isInteger(scoreVal) && scoreVal >= 1 && scoreVal <= 10 ? scoreVal : null,
        };
    });
}

module.exports = {
    searchEnrichedLeads,
};
