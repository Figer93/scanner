/**
 * Email template CRUD and email log operations.
 */

async function getEmailTemplates(db) {
    return db.query('SELECT id, name, subject, body, created_at, updated_at FROM email_templates ORDER BY name');
}

async function getEmailTemplateById(db, id) {
    return db.queryOne('SELECT id, name, subject, body, created_at, updated_at FROM email_templates WHERE id = $1', [id]);
}

async function createEmailTemplate(db, template) {
    const { id } = await db.runReturningId(
        'INSERT INTO email_templates (name, subject, body) VALUES ($1, $2, $3) RETURNING id',
        [
            String(template.name || '').trim() || null,
            String(template.subject || '').trim() || null,
            String(template.body || '').trim() || null,
        ]
    );
    return { id };
}

async function updateEmailTemplate(db, id, updates) {
    const setClause = [];
    const values = [];
    let idx = 1;
    if (updates.name !== undefined) { setClause.push(`name = $${idx++}`); values.push(String(updates.name || '').trim() || null); }
    if (updates.subject !== undefined) { setClause.push(`subject = $${idx++}`); values.push(String(updates.subject || '').trim() || null); }
    if (updates.body !== undefined) { setClause.push(`body = $${idx++}`); values.push(String(updates.body || '').trim() || null); }
    if (setClause.length === 0) return;
    setClause.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    await db.run(`UPDATE email_templates SET ${setClause.join(', ')} WHERE id = $${idx}`, values);
}

async function deleteEmailTemplate(db, id) {
    await db.run('DELETE FROM email_templates WHERE id = $1', [id]);
}

async function addEmailLog(db, log) {
    const sentAt = log.sent_at != null ? String(log.sent_at).trim() : null;
    const isMissingMatchedVia = (err) => {
        const code = err && typeof err === 'object' ? err.code : undefined;
        const msg = err && typeof err === 'object' ? err.message : '';
        return code === '42703' && String(msg || '').toLowerCase().includes('matched_via');
    };

    try {
        const { id } = await db.runReturningId(
            `INSERT INTO email_logs (
                lead_id,
                template_id,
                brevo_message_id,
                provider,
                provider_message_id,
                direction,
                status,
                subject,
                body,
                from_email,
                to_email,
                matched_via,
                sent_at
            )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, COALESCE($13, CURRENT_TIMESTAMP)) RETURNING id`,
            [
                log.lead_id,
                log.template_id ?? null,
                log.brevo_message_id ?? null,
                log.provider ?? null,
                log.provider_message_id ?? null,
                log.direction ?? 'outbound',
                log.status ?? 'sent',
                log.subject ?? null,
                log.body ?? null,
                log.from_email ?? null,
                log.to_email ?? null,
                log.matched_via ?? null,
                sentAt || null,
            ]
        );
        return { id };
    } catch (err) {
        // If the DB migration adding `email_logs.matched_via` hasn't been applied yet,
        // still allow inbound/outbound logs to be recorded.
        if (!isMissingMatchedVia(err)) throw err;

        const { id } = await db.runReturningId(
            `INSERT INTO email_logs (
                lead_id,
                template_id,
                brevo_message_id,
                provider,
                provider_message_id,
                direction,
                status,
                subject,
                body,
                from_email,
                to_email,
                sent_at
            )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12, CURRENT_TIMESTAMP)) RETURNING id`,
            [
                log.lead_id,
                log.template_id ?? null,
                log.brevo_message_id ?? null,
                log.provider ?? null,
                log.provider_message_id ?? null,
                log.direction ?? 'outbound',
                log.status ?? 'sent',
                log.subject ?? null,
                log.body ?? null,
                log.from_email ?? null,
                log.to_email ?? null,
                sentAt || null,
            ]
        );
        return { id };
    }
}

async function getEmailLogs(db, options = {}) {
    const limit = Math.min(200, Math.max(1, options.limit || 50));
    const params = [];
    let idx = 1;

    const withMatchedVia = () => {
        let sql = `SELECT el.id, el.lead_id, el.template_id, el.brevo_message_id, el.provider, el.provider_message_id, el.direction, el.status, el.sent_at, el.updated_at,
                           el.subject, el.body, el.from_email, el.to_email, el.matched_via,
                           l.company_name, l.company_number FROM email_logs el
                           LEFT JOIN leads l ON l.id = el.lead_id WHERE 1=1`;
        if (options.leadId != null) {
            sql += ` AND el.lead_id = $${idx++}`;
            params.push(options.leadId);
        }
        if (options.listId != null) {
            sql += ` AND el.lead_id IN (SELECT lead_id FROM list_lead WHERE list_id = $${idx++})`;
            params.push(options.listId);
        }
        sql += ` ORDER BY el.sent_at DESC LIMIT $${idx}`;
        params.push(limit);
        return db.query(sql, params);
    };

    const withoutMatchedVia = () => {
        // Keep the result shape stable for the UI.
        let sql = `SELECT el.id, el.lead_id, el.template_id, el.brevo_message_id, el.provider, el.provider_message_id, el.direction, el.status, el.sent_at, el.updated_at,
                           el.subject, el.body, el.from_email, el.to_email, NULL::text as matched_via,
                           l.company_name, l.company_number FROM email_logs el
                           LEFT JOIN leads l ON l.id = el.lead_id WHERE 1=1`;
        const p = [];
        let i = 1;
        if (options.leadId != null) {
            sql += ` AND el.lead_id = $${i++}`;
            p.push(options.leadId);
        }
        if (options.listId != null) {
            sql += ` AND el.lead_id IN (SELECT lead_id FROM list_lead WHERE list_id = $${i++})`;
            p.push(options.listId);
        }
        sql += ` ORDER BY el.sent_at DESC LIMIT $${i}`;
        p.push(limit);
        return db.query(sql, p);
    };

    const isMissingMatchedVia = (err) => {
        const code = err && typeof err === 'object' ? err.code : undefined;
        const msg = err && typeof err === 'object' ? err.message : '';
        return code === '42703' && String(msg || '').toLowerCase().includes('matched_via');
    };

    try {
        // Note: params/idx are mutated in withMatchedVia().
        return await withMatchedVia();
    } catch (err) {
        if (!isMissingMatchedVia(err)) throw err;
        return withoutMatchedVia();
    }
}

async function getEmailLogByBrevoMessageId(db, brevoMessageId) {
    return db.queryOne(
        'SELECT id, lead_id, template_id, brevo_message_id, direction, status, sent_at FROM email_logs WHERE brevo_message_id = $1',
        [String(brevoMessageId || '').trim()]
    );
}

async function updateEmailLogStatus(db, id, status) {
    await db.run("UPDATE email_logs SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2", [status, id]);
}

module.exports = {
    getEmailTemplates,
    getEmailTemplateById,
    createEmailTemplate,
    updateEmailTemplate,
    deleteEmailTemplate,
    addEmailLog,
    getEmailLogs,
    getEmailLogByBrevoMessageId,
    updateEmailLogStatus,
};
