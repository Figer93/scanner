/**
 * Sequences and sequence steps: CRUD and enrolment tracking.
 */

const VALID_CONDITIONS = ['always', 'not_opened', 'opened_not_replied'];

async function getSequences(db) {
    return db.query('SELECT id, name, created_at FROM sequences ORDER BY name');
}

async function getSequenceById(db, id) {
    return db.queryOne('SELECT id, name, created_at FROM sequences WHERE id = $1', [id]);
}

async function createSequence(db, name) {
    const { id } = await db.runReturningId(
        'INSERT INTO sequences (name) VALUES ($1) RETURNING id',
        [String(name || '').trim() || 'Unnamed sequence']
    );
    return { id };
}

async function updateSequence(db, id, updates) {
    if (!updates || updates.name === undefined) return;
    await db.run('UPDATE sequences SET name = $1 WHERE id = $2', [String(updates.name || '').trim() || 'Unnamed sequence', id]);
}

async function deleteSequence(db, id) {
    await db.run('DELETE FROM sequences WHERE id = $1', [id]);
}

async function getSequenceSteps(db, sequenceId) {
    return db.query(
        'SELECT id, sequence_id, step_number, template_id, delay_days, condition FROM sequence_steps WHERE sequence_id = $1 ORDER BY step_number',
        [sequenceId]
    );
}

async function createSequenceStep(db, step) {
    const condition = VALID_CONDITIONS.includes(step.condition) ? step.condition : 'always';
    const { id } = await db.runReturningId(
        'INSERT INTO sequence_steps (sequence_id, step_number, template_id, delay_days, condition) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [step.sequence_id, step.step_number, step.template_id, step.delay_days ?? 0, condition]
    );
    return { id };
}

async function updateSequenceStep(db, id, updates) {
    const setClause = [];
    const values = [];
    let idx = 1;
    if (updates.template_id !== undefined) { setClause.push(`template_id = $${idx++}`); values.push(updates.template_id); }
    if (updates.delay_days !== undefined) { setClause.push(`delay_days = $${idx++}`); values.push(updates.delay_days); }
    if (updates.condition !== undefined && VALID_CONDITIONS.includes(updates.condition)) {
        setClause.push(`condition = $${idx++}`);
        values.push(updates.condition);
    }
    if (setClause.length === 0) return;
    values.push(id);
    await db.run(`UPDATE sequence_steps SET ${setClause.join(', ')} WHERE id = $${idx}`, values);
}

async function deleteSequenceStep(db, id) {
    await db.run('DELETE FROM sequence_steps WHERE id = $1', [id]);
}

async function getStepBySequenceAndNumber(db, sequenceId, stepNumber) {
    return db.queryOne(
        'SELECT id, sequence_id, step_number, template_id, delay_days, condition FROM sequence_steps WHERE sequence_id = $1 AND step_number = $2',
        [sequenceId, stepNumber]
    );
}

async function getEnrolmentsBySequence(db, sequenceId, options = {}) {
    let sql = `SELECT se.id, se.sequence_id, se.lead_id, se.current_step, se.status, se.enrolled_at, se.next_send_at,
               l.company_name FROM sequence_enrolments se
               LEFT JOIN leads l ON l.id = se.lead_id WHERE se.sequence_id = $1`;
    const params = [sequenceId];
    let idx = 2;
    if (options.status) {
        sql += ` AND se.status = $${idx++}`;
        params.push(options.status);
    }
    sql += ' ORDER BY se.next_send_at ASC, se.id ASC';
    const limit = Math.min(500, Math.max(1, options.limit || 100));
    sql += ` LIMIT $${idx}`;
    params.push(limit);
    return db.query(sql, params);
}

async function countActiveEnrolmentsBySequence(db, sequenceId) {
    const row = await db.queryOne('SELECT COUNT(*) as c FROM sequence_enrolments WHERE sequence_id = $1 AND status = $2', [sequenceId, 'active']);
    return row ? (row.c | 0) : 0;
}

async function getPendingEnrolments(db, limit = 50) {
    const rows = await db.query(
        `SELECT se.id, se.sequence_id, se.lead_id, se.current_step, se.status, se.next_send_at, l.score as lead_score
         FROM sequence_enrolments se
         JOIN leads l ON l.id = se.lead_id
         WHERE se.status = 'active' AND se.next_send_at IS NOT NULL AND se.next_send_at <= CURRENT_TIMESTAMP
         ORDER BY l.score DESC NULLS LAST, se.next_send_at ASC LIMIT $1`,
        [limit]
    );
    return rows.map(({ lead_score, ...rest }) => rest);
}

async function getEnrolmentById(db, id) {
    return db.queryOne('SELECT id, sequence_id, lead_id, current_step, status, enrolled_at, next_send_at FROM sequence_enrolments WHERE id = $1', [id]);
}

async function createEnrolment(db, sequenceId, leadId) {
    const { id } = await db.runReturningId(
        "INSERT INTO sequence_enrolments (sequence_id, lead_id, current_step, status, next_send_at) VALUES ($1, $2, 1, 'active', CURRENT_TIMESTAMP) RETURNING id",
        [sequenceId, leadId]
    );
    return { id };
}

async function enrolLead(db, sequenceId, leadId) {
    try {
        const { id } = await db.runReturningId(
            "INSERT INTO sequence_enrolments (sequence_id, lead_id, current_step, status, next_send_at) VALUES ($1, $2, 1, 'active', CURRENT_TIMESTAMP) RETURNING id",
            [sequenceId, leadId]
        );
        return { id, enrolled: true };
    } catch (err) {
        if (err.message && (err.message.includes('UNIQUE') || err.message.includes('unique') || err.code === '23505')) return { enrolled: false };
        throw err;
    }
}

async function updateEnrolment(db, id, updates) {
    const setClause = [];
    const values = [];
    let idx = 1;
    if (updates.current_step !== undefined) { setClause.push(`current_step = $${idx++}`); values.push(updates.current_step); }
    if (updates.status !== undefined) { setClause.push(`status = $${idx++}`); values.push(updates.status); }
    if (updates.next_send_at !== undefined) { setClause.push(`next_send_at = $${idx++}`); values.push(updates.next_send_at); }
    if (setClause.length === 0) return;
    values.push(id);
    await db.run(`UPDATE sequence_enrolments SET ${setClause.join(', ')} WHERE id = $${idx}`, values);
}

async function setEnrolmentStatus(db, id, status) {
    await db.run('UPDATE sequence_enrolments SET status = $1, next_send_at = NULL WHERE id = $2', [status, id]);
}

async function setEnrolmentStatusForLead(db, leadId, status) {
    await db.run("UPDATE sequence_enrolments SET status = $1, next_send_at = NULL WHERE lead_id = $2 AND status = 'active'", [status, leadId]);
}

module.exports = {
    getSequences,
    getSequenceById,
    createSequence,
    updateSequence,
    deleteSequence,
    getSequenceSteps,
    createSequenceStep,
    updateSequenceStep,
    deleteSequenceStep,
    getStepBySequenceAndNumber,
    getEnrolmentsBySequence,
    countActiveEnrolmentsBySequence,
    getPendingEnrolments,
    getEnrolmentById,
    createEnrolment,
    enrolLead,
    updateEnrolment,
    setEnrolmentStatus,
    setEnrolmentStatusForLead,
    VALID_CONDITIONS,
};
