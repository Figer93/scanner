/**
 * Companies House cache: local copy of CH data for instant search.
 */

const { STATUS, LEAD_SOURCE } = require('./connection');
const { upsertLead } = require('./leads');
const logger = require('../lib/logger');

async function upsertChCache(db, company) {
    const rawJson = company.raw_json != null ? JSON.stringify(company.raw_json) : null;
    await db.run(
        `INSERT INTO ch_cache (company_number, company_name, address, postcode, date_of_creation, raw_json, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
         ON CONFLICT(company_number) DO UPDATE SET
            company_name = EXCLUDED.company_name,
            address = EXCLUDED.address,
            postcode = EXCLUDED.postcode,
            date_of_creation = EXCLUDED.date_of_creation,
            raw_json = EXCLUDED.raw_json,
            updated_at = CURRENT_TIMESTAMP`,
        [
            String(company.company_number || '').trim(),
            String(company.company_name || '').trim(),
            company.address ?? null,
            company.postcode ?? null,
            company.date_of_creation ?? null,
            rawJson,
        ]
    );
}

async function searchChCache(db, options = {}) {
    const limit = Math.min(500, Math.max(1, options.limit || 100));
    let sql = `SELECT ch_cache.company_number, ch_cache.company_name, ch_cache.address, ch_cache.postcode, ch_cache.date_of_creation, ch_cache.raw_json, leads.score
        FROM ch_cache
        LEFT JOIN leads ON leads.company_number = ch_cache.company_number
        WHERE 1=1`;
    const params = [];
    let idx = 1;
    if (options.q && String(options.q).trim()) {
        const q = '%' + String(options.q).trim() + '%';
        sql += ` AND (ch_cache.company_name LIKE $${idx++} OR ch_cache.company_number LIKE $${idx++} OR ch_cache.postcode LIKE $${idx++} OR ch_cache.address LIKE $${idx++})`;
        params.push(q, q, q, q);
    }
    if (options.postcode && String(options.postcode).trim()) {
        const p = '%' + String(options.postcode).trim() + '%';
        sql += ` AND (ch_cache.postcode LIKE $${idx++} OR ch_cache.address LIKE $${idx++})`;
        params.push(p, p);
    }
    if (options.location && String(options.location).trim()) {
        const loc = '%' + String(options.location).trim() + '%';
        sql += ` AND (ch_cache.address LIKE $${idx++} OR ch_cache.postcode LIKE $${idx++})`;
        params.push(loc, loc);
    }
    if (options.daysBack != null && options.daysBack > 0) {
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - Number(options.daysBack));
        sql += ` AND ch_cache.date_of_creation >= $${idx++}`;
        params.push(fromDate.toISOString().slice(0, 10));
    }
    sql += ' ORDER BY ch_cache.date_of_creation DESC, ch_cache.company_number LIMIT $' + idx;
    params.push(limit);

    const rows = await db.query(sql, params);
    return rows.map((row) => {
        let source_metadata = null;
        if (row.raw_json) {
            try { source_metadata = JSON.parse(row.raw_json); }
            catch (err) { logger.warn({ err: err.message }, 'Failed to parse CH cache raw_json'); }
        }
        const scoreVal = row.score != null && row.score !== '' ? parseInt(row.score, 10) : null;
        return {
            name: row.company_name || '',
            number: row.company_number || '',
            address: row.address || '',
            postcode: row.postcode || '',
            date_of_creation: row.date_of_creation || null,
            source_metadata,
            score: Number.isInteger(scoreVal) && scoreVal >= 1 && scoreVal <= 10 ? scoreVal : null,
        };
    });
}

async function getChCacheByNumber(db, companyNumber) {
    const num = String(companyNumber || '').trim();
    if (!num) return null;
    const row = await db.queryOne(
        'SELECT company_number, company_name, address, postcode, date_of_creation, raw_json FROM ch_cache WHERE company_number = $1',
        [num]
    );
    if (!row) return null;
    let source_metadata = null;
    if (row.raw_json) {
        try { source_metadata = JSON.parse(row.raw_json); }
        catch (err) { logger.warn({ err: err.message }, 'Failed to parse CH cache raw_json'); }
    }
    return {
        name: row.company_name || '',
        number: row.company_number || '',
        address: row.address || '',
        postcode: row.postcode || '',
        date_of_creation: row.date_of_creation || null,
        source_metadata,
    };
}

async function getChCacheCount(db) {
    const row = await db.queryOne('SELECT COUNT(*) as c FROM ch_cache');
    return row ? (row.c || 0) : 0;
}

async function upsertLeadFromChCache(db, chPayload) {
    const company_number = String(chPayload.company_number || '').trim();
    if (!company_number) return null;

    const existing = await db.queryOne('SELECT id FROM leads WHERE company_number = $1', [company_number]);
    const sourceMetadataJson = chPayload.source_metadata != null ? JSON.stringify(chPayload.source_metadata) : null;
    const dateOfCreation = chPayload.date_of_creation != null ? String(chPayload.date_of_creation).trim() || null : null;
    const source = chPayload.source || LEAD_SOURCE.COMPANIES_HOUSE;

    if (existing) {
        await db.run(
            `UPDATE leads SET company_name = $1, address = $2, postcode = $3, date_of_creation = $4, source_metadata = $5, source = $6, updated_at = CURRENT_TIMESTAMP WHERE company_number = $7`,
            [
                String(chPayload.company_name || '').trim(),
                chPayload.address ?? null, chPayload.postcode ?? null,
                dateOfCreation, sourceMetadataJson, source, company_number,
            ]
        );
        return { inserted: false, id: existing.id };
    }

    return upsertLead(db, {
        company_number,
        company_name: chPayload.company_name || '',
        address: chPayload.address ?? null,
        postcode: chPayload.postcode ?? null,
        date_of_creation: chPayload.date_of_creation ?? null,
        source_metadata: chPayload.source_metadata,
        source: LEAD_SOURCE.COMPANIES_HOUSE,
        status: STATUS.NEW,
    });
}

module.exports = {
    upsertChCache,
    searchChCache,
    getChCacheByNumber,
    getChCacheCount,
    upsertLeadFromChCache,
};
