/**
 * Automated follow-up send queue: processes sequence_enrolments with rate limiting
 * and daily cap. Run every 5 minutes from server.js.
 */

const axios = require('axios');
const logger = require('../lib/logger');
const { resolveTemplateVariables } = require('../lib/templateVars');
const {
    getDb,
    getProfile,
    getLeadById,
    getEmailTemplateById,
    getPendingEnrolments,
    getStepBySequenceAndNumber,
    getSequenceSteps,
    updateEnrolment,
    addEmailLog,
    updateLead,
    STATUS,
} = require('./database');
const { DEFAULT_DB_PATH } = require('./database');

const DEFAULT_DAILY_LIMIT = 50;
const DEFAULT_SEND_DELAY_MINUTES = 3;

async function getSentTodayCount(db) {
    const today = new Date().toISOString().slice(0, 10);
    const row = await db.queryOne(
        'SELECT COUNT(*) as c FROM email_logs WHERE sent_at >= $1 AND sent_at < $2',
        [today + ' 00:00:00', today + ' 23:59:59.999']
    );
    return row ? (row.c | 0) : 0;
}

async function getLastSentAt(db) {
    const row = await db.queryOne('SELECT MAX(sent_at) as last FROM email_logs');
    return row?.last ?? null;
}

function stepConditionMet(condition, leadStatus) {
    const s = (leadStatus || '').trim();
    if (condition === 'always') return true;
    if (condition === 'not_opened') {
        return s !== STATUS.OPENED && s !== STATUS.REPLIED && s !== STATUS.WAITING_FOR_REPLY;
    }
    if (condition === 'opened_not_replied') {
        return s === STATUS.OPENED || s === STATUS.WAITING_FOR_REPLY;
    }
    return false;
}

async function sendSequenceEmail(db, { leadId, templateId, profile }) {
    const lead = await getLeadById(db, leadId);
    if (!lead) return { ok: false, error: 'Lead not found' };
    const toEmail = Array.isArray(lead.emails) && lead.emails[0] ? lead.emails[0] : (lead.emails || '').toString();
    if (!toEmail || toEmail === 'Not found' || toEmail === 'unknown') return { ok: false, error: 'No valid email for lead' };

    const template = await getEmailTemplateById(db, templateId);
    if (!template) return { ok: false, error: 'Template not found' };

    const apiKey = (profile.brevo_api_key || process.env.BREVO_API_KEY || '').trim();
    const senderEmail = (profile.sender_email || process.env.BREVO_SENDER_EMAIL || '').trim();
    const senderName = (profile.sender_name || process.env.BREVO_SENDER_NAME || 'CHScanner').trim();
    if (!apiKey || !senderEmail) return { ok: false, error: 'Brevo not configured' };

    const { subject, body } = resolveTemplateVariables(template, lead, profile);
    const htmlContent = body && /<[a-z][\s\S]*>/i.test(body) ? body : null;
    const textContent = htmlContent ? null : (body || '');

    const payload = {
        sender: { name: senderName, email: senderEmail },
        to: [{ email: toEmail }],
        subject: subject || '(No subject)',
        ...(htmlContent ? { htmlContent } : {}),
        ...(textContent !== null ? { textContent } : {}),
    };

    try {
        const res = await axios.post('https://api.brevo.com/v3/smtp/email', payload, {
            headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
            validateStatus: () => true,
        });
        if (res.status !== 201) {
            const errMsg = res.data?.message || res.statusText || 'Brevo send failed';
            logger.warn({ status: res.status, data: res.data }, 'Brevo sequence send rejected');
            return { ok: false, error: errMsg };
        }
        const brevoMessageId = res.data?.messageId || null;
        await addEmailLog(db, {
            lead_id: leadId,
            template_id: templateId,
            brevo_message_id: brevoMessageId,
            direction: 'outbound',
            status: 'sent',
            subject: subject || '(No subject)',
            body: (body || '').trim() || null,
            from_email: senderEmail,
            to_email: toEmail,
        });
        await updateLead(db, leadId, { status: STATUS.EMAIL_SENT });
        return { ok: true, brevoMessageId };
    } catch (err) {
        logger.error({ err: err.message, leadId, templateId }, 'Sequence email send failed');
        return { ok: false, error: err.message || 'Send failed' };
    }
}

async function runQueue(dbPath = process.env.DB_PATH || DEFAULT_DB_PATH) {
    let db;
    try {
        db = await getDb(dbPath);
    } catch (err) {
        logger.error({ err: err.message }, 'Email queue: getDb failed');
        return;
    }

    const profile = await getProfile(db);
    if (profile.queue_paused === '1') {
        logger.debug('Email queue skipped: paused');
        return;
    }

    const dailyLimit = parseInt(profile.daily_send_limit, 10) || DEFAULT_DAILY_LIMIT;
    const delayMinutes = parseInt(profile.send_delay_minutes, 10) || DEFAULT_SEND_DELAY_MINUTES;
    const sentToday = await getSentTodayCount(db);
    if (sentToday >= dailyLimit) {
        logger.debug({ sentToday, dailyLimit }, 'Email queue skipped: daily limit reached');
        return;
    }

    const lastSentAt = await getLastSentAt(db);
    if (lastSentAt) {
        const last = new Date(lastSentAt).getTime();
        const minNext = last + delayMinutes * 60 * 1000;
        if (Date.now() < minNext) {
            logger.debug({ lastSentAt, delayMinutes }, 'Email queue skipped: min delay not met');
            return;
        }
    }

    const pending = await getPendingEnrolments(db, 20);
    for (const enr of pending) {
        const lead = await getLeadById(db, enr.lead_id);
        if (!lead) {
            await updateEnrolment(db, enr.id, { status: 'stopped', next_send_at: null });
            continue;
        }
        const step = await getStepBySequenceAndNumber(db, enr.sequence_id, enr.current_step);
        if (!step) {
            await updateEnrolment(db, enr.id, { status: 'completed', next_send_at: null });
            continue;
        }
        if (!stepConditionMet(step.condition, lead.status)) {
            continue;
        }

        const result = await sendSequenceEmail(db, {
            leadId: enr.lead_id,
            templateId: step.template_id,
            profile,
        });
        if (!result.ok) {
            logger.warn({ enrolmentId: enr.id, error: result.error }, 'Queue send failed, skipping');
            continue;
        }

        const steps = await getSequenceSteps(db, enr.sequence_id);
        const nextStep = steps.find((s) => s.step_number === enr.current_step + 1);
        if (!nextStep) {
            await updateEnrolment(db, enr.id, { status: 'completed', current_step: enr.current_step + 1, next_send_at: null });
        } else {
            const delayDays = Math.max(0, nextStep.delay_days || 0);
            const d = new Date();
            d.setUTCDate(d.getUTCDate() + delayDays);
            const nextSendAtStr = d.toISOString().slice(0, 19).replace('T', ' ');
            await updateEnrolment(db, enr.id, {
                current_step: enr.current_step + 1,
                next_send_at: nextSendAtStr,
            });
        }
        logger.info({ enrolmentId: enr.id, leadId: enr.lead_id, step: enr.current_step }, 'Queue sent sequence email');
        return;
    }
}

async function getQueueStatusData(db, profile) {
    const dailyLimit = parseInt(profile.daily_send_limit, 10) || DEFAULT_DAILY_LIMIT;
    const sentToday = await getSentTodayCount(db);
    const paused = profile.queue_paused === '1';

    const today = new Date().toISOString().slice(0, 10);
    let scheduledToday = 0;
    try {
        const row = await db.queryOne(
            "SELECT COUNT(*) as c FROM sequence_enrolments WHERE status = 'active' AND next_send_at IS NOT NULL AND next_send_at >= $1 AND next_send_at < $2",
            [today + ' 00:00:00', today + ' 23:59:59.999']
        );
        scheduledToday = row ? (row.c | 0) : 0;
    } catch (_) {
        scheduledToday = 0;
    }

    let nextSendInMinutes = null;
    let lastScheduled = [];
    try {
        const rows = await db.query(
            `SELECT se.id, se.next_send_at, l.company_name, l.score as lead_score, et.name as template_name
             FROM sequence_enrolments se
             JOIN leads l ON l.id = se.lead_id
             JOIN sequence_steps ss ON ss.sequence_id = se.sequence_id AND ss.step_number = se.current_step
             JOIN email_templates et ON et.id = ss.template_id
             WHERE se.status = 'active' AND se.next_send_at IS NOT NULL
             ORDER BY l.score DESC NULLS LAST, se.next_send_at ASC LIMIT 5`
        );
        lastScheduled = (rows || []).map((r) => ({
            company_name: r.company_name,
            template_name: r.template_name,
            scheduled_at: r.next_send_at,
            score: r.lead_score != null && r.lead_score !== '' ? parseInt(r.lead_score, 10) : null,
        }));
        if (rows.length > 0 && rows[0].next_send_at) {
            const nextAt = new Date(rows[0].next_send_at.toString().replace(' ', 'T') + 'Z').getTime();
            nextSendInMinutes = Math.max(0, Math.round((nextAt - Date.now()) / 60000));
        }
    } catch (_) {
        lastScheduled = [];
    }

    return {
        scheduledToday,
        sentToday,
        dailyLimit,
        nextSendInMinutes,
        paused,
        lastScheduled,
    };
}

module.exports = {
    runQueue,
    getSentTodayCount,
    getLastSentAt,
    getQueueStatusData,
    stepConditionMet,
};
