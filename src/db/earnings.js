/**
 * Earnings analytics: monthly overview, weekly performance, top templates.
 */

async function getEarningsMonthly(db, profile) {
    const referralPounds = profile?.earnings_referral_pounds != null && String(profile.earnings_referral_pounds).trim() !== ''
        ? parseFloat(profile.earnings_referral_pounds) : null;
    const conversionPct = profile?.earnings_conversion_rate_pct != null && String(profile.earnings_conversion_rate_pct).trim() !== ''
        ? parseFloat(profile.earnings_conversion_rate_pct) : 15;

    let sent = 0, opened = 0, replied = 0, clicks = 0;
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01 00:00:00`;

    try {
        const sentRow = await db.queryOne(
            "SELECT COUNT(*) as c FROM email_logs WHERE direction = 'outbound' AND sent_at >= $1",
            [monthStart]
        );
        if (sentRow) sent = (sentRow.c || 0) | 0;
        const openedRow = await db.queryOne(
            "SELECT COUNT(*) as c FROM email_logs WHERE status = 'opened' AND sent_at >= $1",
            [monthStart]
        );
        if (openedRow) opened = (openedRow.c || 0) | 0;
        const repliedRow = await db.queryOne(
            "SELECT COUNT(*) as c FROM email_logs WHERE status = 'replied' AND sent_at >= $1",
            [monthStart]
        );
        if (repliedRow) replied = (repliedRow.c || 0) | 0;
        const clicksRow = await db.queryOne(
            "SELECT COUNT(*) as c FROM lead_activities WHERE type = 'email_clicked' AND created_at >= $1",
            [monthStart]
        );
        if (clicksRow) clicks = (clicksRow.c || 0) | 0;
    } catch (_) { /* tables may not exist */ }

    const openRatePct = sent > 0 ? (opened / sent) * 100 : 0;
    const replyRatePct = sent > 0 ? (replied / sent) * 100 : 0;
    const estimatedConversions = clicks * (conversionPct / 100);
    const estimatedEarnings = referralPounds != null && !Number.isNaN(referralPounds)
        ? estimatedConversions * referralPounds
        : null;

    return {
        sent,
        opened,
        replied,
        clicks,
        openRatePct: Math.round(openRatePct * 10) / 10,
        replyRatePct: Math.round(replyRatePct * 10) / 10,
        conversionRatePct: conversionPct,
        referralPounds,
        estimatedConversions: Math.round(estimatedConversions * 10) / 10,
        estimatedEarnings: estimatedEarnings != null ? Math.round(estimatedEarnings * 100) / 100 : null,
    };
}

function weekKey(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - x.getDay() + 1);
    return `${x.getFullYear()}-W${String(Math.ceil(x.getDate() / 7)).padStart(2, '0')}`;
}

async function getEarningsWeekly(db, weeks = 12) {
    const n = Math.min(Math.max(weeks, 1), 52);
    const since = new Date();
    since.setDate(since.getDate() - n * 7);
    const sinceStr = since.toISOString().slice(0, 19).replace('T', ' ');
    const rows = await db.query(
        'SELECT sent_at, status FROM email_logs WHERE direction = $1 AND sent_at >= $2',
        ['outbound', sinceStr]
    );
    const byWeek = {};
    for (const r of rows) {
        const wk = weekKey(r.sent_at);
        if (!byWeek[wk]) byWeek[wk] = { sent: 0, opened: 0, replied: 0 };
        byWeek[wk].sent++;
        if (r.status === 'opened') byWeek[wk].opened++;
        if (r.status === 'replied') byWeek[wk].replied++;
    }
    const sorted = Object.entries(byWeek)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([week, v]) => ({ week, sent: v.sent, opened: v.opened, replied: v.replied }));
    return sorted.slice(-n);
}

async function getEarningsTopTemplates(db, limit = 10, conversionRatePct = 15) {
    const out = [];
    try {
        const rows = await db.query(
            `SELECT
                et.id,
                et.name,
                COUNT(el.id) as sent,
                SUM(CASE WHEN el.status = 'opened' THEN 1 ELSE 0 END) as opened,
                SUM(CASE WHEN el.status = 'replied' THEN 1 ELSE 0 END) as replied
             FROM email_templates et
             LEFT JOIN email_logs el ON el.template_id = et.id AND el.direction = 'outbound'
             GROUP BY et.id, et.name
             HAVING COUNT(el.id) > 0
             ORDER BY sent DESC
             LIMIT $1`,
            [limit]
        );
        for (const r of rows) {
            const sent = (r.sent || 0) | 0;
            const opened = (r.opened || 0) | 0;
            const replied = (r.replied || 0) | 0;
            out.push({
                templateId: r.id,
                templateName: r.name || '—',
                sent,
                opened,
                replied,
                openRatePct: sent > 0 ? Math.round((opened / sent) * 1000) / 10 : 0,
                replyRatePct: sent > 0 ? Math.round((replied / sent) * 1000) / 10 : 0,
                estimatedConversions: sent > 0 ? Math.round((opened * (conversionRatePct / 100)) * 10) / 10 : 0,
            });
        }
    } catch (_) { /* ignore */ }
    return out;
}

module.exports = {
    getEarningsMonthly,
    getEarningsWeekly,
    getEarningsTopTemplates,
};
