/**
 * Analytics queries: funnel stats, cost-per-lead, score distribution, etc.
 */

const { STATUS, STATUS_VALUES } = require('./connection');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function getFunnelStats(db) {
    const byStatus = {};
    STATUS_VALUES.forEach((s) => { byStatus[s] = 0; });

    const totalRow = await db.queryOne('SELECT COUNT(*) as c FROM leads');
    const total = totalRow ? ((totalRow.c || 0) | 0) : 0;

    const bySource = {};
    const srcRows = await db.query('SELECT source, COUNT(*) as c FROM leads GROUP BY source');
    for (const r of srcRows) {
        const src = r.source || 'json_file';
        bySource[src] = (r.c || 0) | 0;
    }

    // Milestone-based funnel counters (one-time per lead, only after Enriched).
    const enrichedRow = await db.queryOne('SELECT COUNT(*) as c FROM leads WHERE enriched_at IS NOT NULL');
    const sentRow = await db.queryOne('SELECT COUNT(*) as c FROM leads WHERE first_email_sent_at IS NOT NULL');
    const openedRow = await db.queryOne('SELECT COUNT(*) as c FROM leads WHERE first_email_opened_at IS NOT NULL');
    const repliedRow = await db.queryOne('SELECT COUNT(*) as c FROM leads WHERE first_email_replied_at IS NOT NULL');
    const convertedRow = await db.queryOne('SELECT COUNT(*) as c FROM leads WHERE converted_at IS NOT NULL');

    byStatus[STATUS.ENRICHED] = (enrichedRow?.c || 0) | 0;
    byStatus[STATUS.EMAIL_SENT] = (sentRow?.c || 0) | 0;
    byStatus[STATUS.OPENED] = (openedRow?.c || 0) | 0;
    byStatus[STATUS.REPLIED] = (repliedRow?.c || 0) | 0;
    byStatus[STATUS.CONVERTED] = (convertedRow?.c || 0) | 0;

    return { byStatus, bySource, total };
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
    const byStatus = {};
    STATUS_VALUES.forEach((s) => { byStatus[s] = 0; });

    const totalRow = await db.queryOne(
        'SELECT COUNT(*) as c FROM list_lead WHERE list_id = $1',
        [listId]
    );
    const totalLeads = (totalRow?.c || 0) | 0;
    if (totalLeads === 0) {
        return { listId, totalLeads: 0, byStatus, emailsSent: 0, opened: 0, replied: 0, converted: 0, conversionRate: null };
    }

    // Keep byStatus as live lead.status distribution, but milestone metrics are one-time per lead.
    const statusRows = await db.query(
        `SELECT l.status, COUNT(*) as c
         FROM list_lead ll
         JOIN leads l ON l.id = ll.lead_id
         WHERE ll.list_id = $1
         GROUP BY l.status`,
        [listId]
    );
    for (const r of statusRows) {
        const s = r.status || STATUS.NEW;
        byStatus[s] = (r.c || 0) | 0;
    }

    const sentRow = await db.queryOne(
        `SELECT COUNT(*) as c
         FROM list_lead ll
         JOIN leads l ON l.id = ll.lead_id
         WHERE ll.list_id = $1 AND l.first_email_sent_at IS NOT NULL`,
        [listId]
    );
    const openedRow = await db.queryOne(
        `SELECT COUNT(*) as c
         FROM list_lead ll
         JOIN leads l ON l.id = ll.lead_id
         WHERE ll.list_id = $1 AND l.first_email_opened_at IS NOT NULL`,
        [listId]
    );
    const repliedRow = await db.queryOne(
        `SELECT COUNT(*) as c
         FROM list_lead ll
         JOIN leads l ON l.id = ll.lead_id
         WHERE ll.list_id = $1 AND l.first_email_replied_at IS NOT NULL`,
        [listId]
    );
    const convertedRow = await db.queryOne(
        `SELECT COUNT(*) as c
         FROM list_lead ll
         JOIN leads l ON l.id = ll.lead_id
         WHERE ll.list_id = $1 AND l.converted_at IS NOT NULL`,
        [listId]
    );

    const emailsSent = (sentRow?.c || 0) | 0;
    const opened = (openedRow?.c || 0) | 0;
    const replied = (repliedRow?.c || 0) | 0;
    const converted = (convertedRow?.c || 0) | 0;
    const conversionRate = emailsSent > 0 ? (converted / emailsSent) * 100 : null;

    return { listId, totalLeads, byStatus, emailsSent, opened, replied, converted, conversionRate };
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
    // Milestone-based email activity to avoid flooding the feed with long conversations.
    try {
        const rows = await db.query(
            `SELECT id, company_name,
                    enriched_at, first_email_sent_at, first_email_opened_at, first_email_replied_at, converted_at
             FROM leads
             WHERE enriched_at IS NOT NULL
                OR first_email_sent_at IS NOT NULL
                OR first_email_opened_at IS NOT NULL
                OR first_email_replied_at IS NOT NULL
                OR converted_at IS NOT NULL
             ORDER BY GREATEST(
                COALESCE(enriched_at, '1970-01-01'::timestamptz),
                COALESCE(first_email_sent_at, '1970-01-01'::timestamptz),
                COALESCE(first_email_opened_at, '1970-01-01'::timestamptz),
                COALESCE(first_email_replied_at, '1970-01-01'::timestamptz),
                COALESCE(converted_at, '1970-01-01'::timestamptz)
             ) DESC
             LIMIT $1`,
            [n]
        );

        for (const r of rows) {
            const leadId = r.id;
            const companyName = String(r.company_name || '');
            const candidates = [
                { t: r.converted_at, type: 'converted' },
                { t: r.first_email_replied_at, type: 'email_replied' },
                { t: r.first_email_opened_at, type: 'email_opened' },
                { t: r.first_email_sent_at, type: 'email_sent' },
                { t: r.enriched_at, type: 'status_change', content: 'Status changed to Enriched' },
            ].filter((x) => x.t);
            if (candidates.length === 0) continue;
            candidates.sort((a, b) => String(a.t).localeCompare(String(b.t)));
            const last = candidates[candidates.length - 1];
            items.push({
                id: `milestone_${leadId}_${last.type}`,
                type: last.type,
                company_name: companyName,
                lead_id: leadId,
                content: last.content ?? null,
                timestamp: String(last.t),
            });
        }
    } catch (_) { /* ignore */ }
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
        // Distinct-lead performance based on first-time milestones.
        const sentRow = await db.queryOne(
            'SELECT COUNT(*) as c FROM leads WHERE first_email_sent_at IS NOT NULL AND first_email_sent_at >= $1',
            [sinceStr]
        );
        if (sentRow) sent = (sentRow.c || 0) | 0;
        const openedRow = await db.queryOne(
            'SELECT COUNT(*) as c FROM leads WHERE first_email_opened_at IS NOT NULL AND first_email_opened_at >= $1',
            [sinceStr]
        );
        if (openedRow) opened = (openedRow.c || 0) | 0;
        const repliedRow = await db.queryOne(
            'SELECT COUNT(*) as c FROM leads WHERE first_email_replied_at IS NOT NULL AND first_email_replied_at >= $1',
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
