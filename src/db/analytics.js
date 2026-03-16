/**
 * Analytics queries: funnel stats, cost-per-lead, score distribution, etc.
 */

const { STATUS, STATUS_VALUES } = require('./connection');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function getFunnelStats(db) {
    const byStatus = {};
    STATUS_VALUES.forEach((s) => { byStatus[s] = 0; });
    const rows = await db.query('SELECT status, source FROM leads');
    const bySource = {};
    for (const row of rows) {
        byStatus[row.status || STATUS.NEW] = (byStatus[row.status || STATUS.NEW] || 0) + 1;
        const src = row.source || 'json_file';
        bySource[src] = (bySource[src] || 0) + 1;
    }
    return { byStatus, bySource, total: rows.length };
}

async function getCostPerLeadStats(db) {
    const rowCost = await db.queryOne('SELECT COALESCE(SUM(estimated_cost_gbp), 0) as total FROM usage_log');
    const totalCostGbp = rowCost ? (rowCost.total || 0) : 0;
    const rowLeads = await db.queryOne('SELECT COUNT(*) as c FROM leads');
    const totalLeads = rowLeads ? (rowLeads.c || 0) : 0;
    const rowQual = await db.queryOne("SELECT COUNT(*) as c FROM leads WHERE status IN ('Qualified', 'Converted')");
    const qualifiedLeads = rowQual ? (rowQual.c || 0) : 0;
    return {
        totalCostGbp,
        totalLeads,
        qualifiedLeads,
        costPerLead: totalLeads > 0 ? totalCostGbp / totalLeads : null,
        costPerQualifiedLead: qualifiedLeads > 0 ? totalCostGbp / qualifiedLeads : null,
    };
}

async function getScoreDistribution(db) {
    const lowRow = await db.queryOne('SELECT COUNT(*) as c FROM leads WHERE score IS NOT NULL AND score >= 1 AND score <= 3');
    const low = (lowRow?.c || 0) | 0;
    const midRow = await db.queryOne('SELECT COUNT(*) as c FROM leads WHERE score IS NOT NULL AND score >= 4 AND score <= 6');
    const mid = (midRow?.c || 0) | 0;
    const highRow = await db.queryOne('SELECT COUNT(*) as c FROM leads WHERE score IS NOT NULL AND score >= 7 AND score <= 10');
    const high = (highRow?.c || 0) | 0;
    return { low, mid, high };
}

async function getDbStats(db) {
    const totalRow = await db.queryOne('SELECT COUNT(*) as c FROM leads');
    const totalLeads = totalRow ? (totalRow.c || 0) : 0;
    const emailRow = await db.queryOne("SELECT COUNT(*) as c FROM leads WHERE emails IS NOT NULL AND emails != '[]' AND emails != ''");
    const leadsWithEmails = emailRow ? (emailRow.c || 0) : 0;
    const webRow = await db.queryOne("SELECT COUNT(*) as c FROM leads WHERE website IS NOT NULL AND TRIM(website) != ''");
    const leadsWithWebsite = webRow ? (webRow.c || 0) : 0;
    const newRow = await db.queryOne('SELECT COUNT(*) as c FROM leads WHERE status = $1', [STATUS.NEW]);
    const newLeads = newRow ? (newRow.c || 0) : 0;
    const enrichedRow = await db.queryOne('SELECT COUNT(*) as c FROM leads WHERE status = $1', [STATUS.ENRICHED]);
    const enrichedLeads = enrichedRow ? (enrichedRow.c || 0) : 0;
    const sentRow = await db.queryOne('SELECT COUNT(*) as c FROM leads WHERE status = $1', [STATUS.EMAIL_SENT]);
    const emailSentCount = sentRow ? (sentRow.c || 0) : 0;
    const listRow = await db.queryOne('SELECT COUNT(*) as c FROM lists');
    const listCount = listRow ? (listRow.c || 0) : 0;
    const chRow = await db.queryOne('SELECT COUNT(*) as c FROM ch_cache');
    const chCacheCount = chRow ? (chRow.c || 0) : 0;
    return { totalLeads, leadsWithEmails, leadsWithWebsite, newLeads, enrichedLeads, emailSentCount, listCount, chCacheCount };
}

async function getListAnalytics(db, listId) {
    const leadIdRows = await db.query('SELECT lead_id FROM list_lead WHERE list_id = $1', [listId]);
    const leadIds = leadIdRows.map((r) => r.lead_id);
    if (leadIds.length === 0) {
        return { listId, totalLeads: 0, byStatus: {}, emailsSent: 0, opened: 0, replied: 0, converted: 0, conversionRate: null };
    }
    const placeholders = leadIds.map((_, i) => `$${i + 1}`).join(',');
    const byStatus = {};
    STATUS_VALUES.forEach((s) => { byStatus[s] = 0; });
    const statusRows = await db.query(`SELECT status FROM leads WHERE id IN (${placeholders})`, leadIds);
    for (const row of statusRows) {
        const s = row.status || STATUS.NEW;
        byStatus[s] = (byStatus[s] || 0) + 1;
    }
    const emailsRow = await db.queryOne(`SELECT COUNT(DISTINCT id) as c FROM email_logs WHERE lead_id IN (${placeholders}) AND direction = 'outbound'`, leadIds);
    const emailsSent = emailsRow ? (emailsRow.c || 0) : 0;
    const openedRow = await db.queryOne(`SELECT COUNT(DISTINCT id) as c FROM email_logs WHERE lead_id IN (${placeholders}) AND status = 'opened'`, leadIds);
    const opened = openedRow ? (openedRow.c || 0) : 0;
    const repliedRow = await db.queryOne(`SELECT COUNT(DISTINCT lead_id) as c FROM email_logs WHERE lead_id IN (${placeholders}) AND (status = 'replied' OR direction = 'inbound')`, leadIds);
    const replied = repliedRow ? (repliedRow.c || 0) : 0;
    const convertedRow = await db.queryOne(`SELECT COUNT(*) as c FROM leads WHERE id IN (${placeholders}) AND status = 'Converted'`, leadIds);
    const converted = convertedRow ? (convertedRow.c || 0) : 0;
    const emailSentLeadCount = byStatus[STATUS.EMAIL_SENT] || 0;
    const repliedLeadCount = byStatus[STATUS.REPLIED] || 0;
    const conversionRate = emailSentLeadCount > 0 ? (repliedLeadCount / emailSentLeadCount) * 100 : null;
    return { listId, totalLeads: leadIds.length, byStatus, emailsSent, opened, replied, converted, conversionRate };
}

async function getLeadIdsByStatus(db, status, listId) {
    if (listId != null && Number.isInteger(listId) && listId >= 1) {
        const rows = await db.query(
            'SELECT l.id FROM leads l INNER JOIN list_lead ll ON ll.lead_id = l.id WHERE ll.list_id = $1 AND l.status = $2',
            [listId, status]
        );
        return rows.map((r) => r.id);
    }
    const rows = await db.query('SELECT id FROM leads WHERE status = $1', [status]);
    return rows.map((r) => r.id);
}

async function cleanInvalidEmails(db, listId) {
    let rows;
    if (listId != null && Number.isInteger(listId) && listId >= 1) {
        rows = await db.query(
            "SELECT l.id, l.emails FROM leads l INNER JOIN list_lead ll ON ll.lead_id = l.id WHERE ll.list_id = $1 AND l.emails IS NOT NULL AND l.emails != '' AND l.emails != '[]'",
            [listId]
        );
    } else {
        rows = await db.query("SELECT id, emails FROM leads WHERE emails IS NOT NULL AND emails != '' AND emails != '[]'");
    }
    const toUpdate = [];
    for (const row of rows) {
        try {
            const emails = JSON.parse(row.emails || '[]');
            if (!Array.isArray(emails)) continue;
            const valid = emails.filter((e) => typeof e === 'string' && EMAIL_REGEX.test(String(e).trim()));
            if (valid.length !== emails.length) toUpdate.push({ id: row.id, emails: valid });
        } catch (_) { /* skip */ }
    }
    for (const { id, emails } of toUpdate) {
        await db.run('UPDATE leads SET emails = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [JSON.stringify(emails), id]);
    }
    return { updated: toUpdate.length };
}

async function getRecentActivity(db, limit) {
    const n = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 20) : 5;
    const items = [];
    try {
        const rows = await db.query(
            `SELECT a.id, a.type, a.content, a.created_at, l.company_name, l.id AS lead_id
             FROM lead_activities a
             JOIN leads l ON l.id = a.lead_id
             ORDER BY a.created_at DESC
             LIMIT $1`,
            [n]
        );
        for (const r of rows) {
            items.push({
                id: `act_${r.id}`,
                type: String(r.type || 'note'),
                company_name: String(r.company_name || ''),
                lead_id: r.lead_id,
                content: r.content ? String(r.content) : null,
                timestamp: String(r.created_at),
            });
        }
    } catch (_) { /* lead_activities may not exist */ }
    try {
        const rows = await db.query(
            `SELECT el.id, el.status, el.direction, el.sent_at, l.company_name, l.id AS lead_id
             FROM email_logs el
             JOIN leads l ON l.id = el.lead_id
             ORDER BY el.sent_at DESC
             LIMIT $1`,
            [n]
        );
        for (const r of rows) {
            const type = r.direction === 'inbound' ? 'email_received'
                : r.status === 'opened' ? 'email_opened'
                : r.status === 'replied' ? 'email_replied'
                : 'email_sent';
            items.push({
                id: `email_${r.id}`,
                type,
                company_name: String(r.company_name || ''),
                lead_id: r.lead_id,
                content: null,
                timestamp: String(r.sent_at),
            });
        }
    } catch (_) { /* email_logs may not exist */ }
    items.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    return items.slice(0, n);
}

async function getEmailPerformance(db, days) {
    const d = Number.isInteger(days) && days > 0 ? Math.min(days, 365) : 30;
    const since = new Date();
    since.setDate(since.getDate() - d);
    const sinceStr = since.toISOString().slice(0, 19).replace('T', ' ');
    let sent = 0, opened = 0, replied = 0;
    try {
        const sentRow = await db.queryOne(
            "SELECT COUNT(*) as c FROM email_logs WHERE direction = 'outbound' AND sent_at >= $1",
            [sinceStr]
        );
        if (sentRow) sent = (sentRow.c || 0) | 0;
        const openedRow = await db.queryOne(
            "SELECT COUNT(*) as c FROM email_logs WHERE status = 'opened' AND sent_at >= $1",
            [sinceStr]
        );
        if (openedRow) opened = (openedRow.c || 0) | 0;
        const repliedRow = await db.queryOne(
            "SELECT COUNT(*) as c FROM email_logs WHERE status = 'replied' AND sent_at >= $1",
            [sinceStr]
        );
        if (repliedRow) replied = (repliedRow.c || 0) | 0;
    } catch (_) { /* ignore */ }
    return {
        days: d,
        sent,
        opened,
        replied,
        openRate: sent > 0 ? Math.round((opened / sent) * 100) : 0,
        replyRate: sent > 0 ? Math.round((replied / sent) * 100) : 0,
    };
}

module.exports = {
    getFunnelStats,
    getCostPerLeadStats,
    getScoreDistribution,
    getDbStats,
    getListAnalytics,
    getLeadIdsByStatus,
    cleanInvalidEmails,
    getRecentActivity,
    getEmailPerformance,
};
