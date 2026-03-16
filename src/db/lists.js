/**
 * List CRUD and list-lead association operations.
 */

const { LEAD_SOURCE } = require('./connection');
const { getLeadByCompanyNumber } = require('./leads');
const { getChCacheByNumber, upsertLeadFromChCache } = require('./chCache');

async function createList(db, list) {
    const { id } = await db.runReturningId(
        'INSERT INTO lists (name, description) VALUES ($1, $2) RETURNING id',
        [String(list.name || '').trim() || null, list.description != null ? String(list.description).trim() || null : null]
    );
    return { id };
}

async function getLists(db) {
    const rows = await db.query('SELECT id, name, description, created_at, updated_at FROM lists ORDER BY name');
    const countRows = await db.query('SELECT list_id, COUNT(*) as c FROM list_lead GROUP BY list_id');
    const counts = {};
    for (const r of countRows) counts[r.list_id] = r.c;
    return rows.map((r) => ({ ...r, lead_count: counts[r.id] || 0 }));
}

async function getListById(db, id) {
    return db.queryOne('SELECT id, name, description, created_at, updated_at FROM lists WHERE id = $1', [id]);
}

async function updateList(db, id, updates) {
    if (!updates || Object.keys(updates).length === 0) return;
    const setClause = [];
    const values = [];
    let idx = 1;
    if (updates.name !== undefined) {
        setClause.push(`name = $${idx++}`);
        values.push(String(updates.name || '').trim() || null);
    }
    if (updates.description !== undefined) {
        setClause.push(`description = $${idx++}`);
        values.push(updates.description != null ? String(updates.description).trim() || null : null);
    }
    if (setClause.length === 0) return;
    setClause.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    await db.run(`UPDATE lists SET ${setClause.join(', ')} WHERE id = $${idx}`, values);
}

async function deleteList(db, id) {
    await db.run('DELETE FROM lists WHERE id = $1', [id]);
}

async function addLeadsToList(db, listId, companyNumbers) {
    const leadIds = [];
    const numbers = [...new Set(companyNumbers)].map((n) => String(n).trim()).filter(Boolean);
    for (const companyNumber of numbers) {
        let leadId = null;
        const company = await getChCacheByNumber(db, companyNumber);
        if (company) {
            const chPayload = {
                company_number: company.number,
                company_name: company.name,
                address: company.address ?? undefined,
                postcode: company.postcode ?? undefined,
                date_of_creation: company.date_of_creation ?? undefined,
                source_metadata: company.source_metadata,
                source: LEAD_SOURCE.COMPANIES_HOUSE,
            };
            const result = await upsertLeadFromChCache(db, chPayload);
            if (result) leadId = result.id;
        } else {
            let existingLead = await getLeadByCompanyNumber(db, companyNumber);
            if (!existingLead && /^\d+$/.test(companyNumber)) {
                existingLead = await getLeadByCompanyNumber(db, companyNumber.padStart(8, '0'));
            }
            if (!existingLead && /^0+(\d+)$/.test(companyNumber)) {
                existingLead = await getLeadByCompanyNumber(db, companyNumber.replace(/^0+/, ''));
            }
            if (existingLead && existingLead.id) leadId = existingLead.id;
        }
        if (!leadId) continue;
        try {
            await db.run('INSERT INTO list_lead (list_id, lead_id, added_at) VALUES ($1, $2, CURRENT_TIMESTAMP)', [listId, leadId]);
        } catch (e) {
            if (!e.message || !e.message.includes('UNIQUE') && !e.message.includes('unique')) throw e;
        }
        leadIds.push(leadId);
    }
    return { saved: leadIds.length, leadIds };
}

async function getListsByCompanyNumbers(db, companyNumbers) {
    const nums = [...new Set(companyNumbers)].map((n) => String(n).trim()).filter(Boolean);
    if (nums.length === 0) return {};
    const placeholders = nums.map((_, i) => `$${i + 1}`).join(',');
    const rows = await db.query(
        `SELECT l.company_number, li.name
         FROM list_lead ll
         JOIN leads l ON l.id = ll.lead_id
         JOIN lists li ON li.id = ll.list_id
         WHERE l.company_number IN (${placeholders})`,
        nums
    );
    const out = {};
    nums.forEach((n) => { out[n] = []; });
    for (const row of rows) {
        const num = row.company_number != null ? String(row.company_number) : '';
        if (!num) continue;
        const listNames = out[num] || (out[num] = []);
        if (!listNames.includes(row.name)) listNames.push(row.name);
    }
    for (const n of nums) {
        const key = String(n).trim();
        if (key && !(key in out)) out[key] = [];
    }
    const alt = {};
    for (const key of Object.keys(out)) {
        const listNames = out[key];
        if (!listNames || listNames.length === 0) continue;
        const padded = /^\d+$/.test(key) ? key.padStart(8, '0') : null;
        if (padded && padded !== key) alt[padded] = listNames;
        const stripped = /^0+(\d+)$/.test(key) ? key.replace(/^0+/, '') : null;
        if (stripped && stripped !== key) alt[stripped] = listNames;
    }
    Object.assign(out, alt);
    return out;
}

async function getListLeadIds(db, listId) {
    const rows = await db.query('SELECT lead_id FROM list_lead WHERE list_id = $1 ORDER BY added_at', [listId]);
    return rows.map((r) => r.lead_id);
}

module.exports = {
    createList,
    getLists,
    getListById,
    updateList,
    deleteList,
    addLeadsToList,
    getListsByCompanyNumbers,
    getListLeadIds,
};
