/**
 * /api/sequences/* — sequence CRUD, steps, and enrolments.
 */

const { z } = require('zod');
const { getDb, initSchema, getSequenceById, getSequences, createSequence, updateSequence, deleteSequence, getSequenceSteps, createSequenceStep, updateSequenceStep, deleteSequenceStep, getEnrolmentsBySequence, countActiveEnrolmentsBySequence, enrolLead, getEmailTemplateById, getListLeadIds } = require('../services/database');
const { VALID_CONDITIONS } = require('../db/sequences');
const logger = require('../lib/logger');

const sequenceIdParam = z.object({ id: z.coerce.number().int().positive() });
const createSequenceSchema = z.object({ name: z.string().min(1).max(200) });
const updateSequenceSchema = z.object({ name: z.string().min(1).max(200).optional() }).strict();
const createStepSchema = z.object({
    step_number: z.coerce.number().int().positive(),
    template_id: z.coerce.number().int().positive(),
    delay_days: z.coerce.number().int().min(0).max(365),
    condition: z.enum(VALID_CONDITIONS),
}).strict();
const updateStepSchema = z.object({
    template_id: z.coerce.number().int().positive().optional(),
    delay_days: z.coerce.number().int().min(0).max(365).optional(),
    condition: z.enum(VALID_CONDITIONS).optional(),
}).strict();
const enrolSchema = z.object({
    listId: z.coerce.number().int().positive().optional(),
    leadIds: z.array(z.coerce.number().int().positive()).optional(),
}).strict().refine((d) => d.listId != null || (Array.isArray(d.leadIds) && d.leadIds.length > 0), { message: 'Provide listId or non-empty leadIds' });

/** Steps with template name for UI */
async function getSequenceStepsWithTemplateNames(db, sequenceId) {
    const steps = await getSequenceSteps(db, sequenceId);
    const withNames = [];
    for (const s of steps) {
        const t = await getEmailTemplateById(db, s.template_id);
        withNames.push({ ...s, template_name: t ? t.name : null });
    }
    return withNames;
}

function mountSequences(app) {
    app.get('/api/sequences', async (req, res) => {
        try {
            const db = await getDb();
            initSchema(db);
            const list = await getSequences(db);
            const includeSteps = req.query.steps === '1' || req.query.steps === 'true';
            const withCount = [];
            for (const seq of list) {
                const item = { ...seq, active_enrolments: await countActiveEnrolmentsBySequence(db, seq.id) };
                if (includeSteps) {
                    item.steps = await getSequenceStepsWithTemplateNames(db, seq.id);
                }
                withCount.push(item);
            }
            res.json(withCount);
        } catch (err) {
            logger.error({ err }, 'Failed to list sequences');
            res.status(500).json({ error: 'Failed to retrieve sequences' });
        }
    });

    app.post('/api/sequences', async (req, res) => {
        const parsed = createSequenceSchema.safeParse(req.body || {});
        if (!parsed.success) {
            const msg = parsed.error.errors.map((e) => e.message).join('; ') || 'Invalid request';
            return res.status(400).json({ error: msg });
        }
        try {
            const db = await getDb();
            initSchema(db);
            const { id } = await createSequence(db, parsed.data.name);
            res.status(201).json(await getSequenceById(db, id));
        } catch (err) {
            logger.error({ err }, 'Failed to create sequence');
            res.status(500).json({ error: 'Failed to create sequence' });
        }
    });

    app.get('/api/sequences/:id', async (req, res) => {
        const parsed = sequenceIdParam.safeParse(req.params);
        if (!parsed.success) return res.status(400).json({ error: 'Invalid sequence id' });
        try {
            const db = await getDb();
            initSchema(db);
            const seq = await getSequenceById(db, parsed.data.id);
            if (!seq) return res.status(404).json({ error: 'Sequence not found' });
            const steps = await getSequenceStepsWithTemplateNames(db, seq.id);
            const active_enrolments = await countActiveEnrolmentsBySequence(db, seq.id);
            res.json({ ...seq, steps, active_enrolments });
        } catch (err) {
            logger.error({ err }, 'Failed to get sequence');
            res.status(500).json({ error: 'Failed to retrieve sequence' });
        }
    });

    app.patch('/api/sequences/:id', async (req, res) => {
        const parsed = sequenceIdParam.safeParse(req.params);
        const body = updateSequenceSchema.safeParse(req.body || {});
        if (!parsed.success) return res.status(400).json({ error: 'Invalid sequence id' });
        if (!body.success) return res.status(400).json({ error: body.error.errors.map((e) => e.message).join('; ') });
        try {
            const db = await getDb();
            initSchema(db);
            const seq = await getSequenceById(db, parsed.data.id);
            if (!seq) return res.status(404).json({ error: 'Sequence not found' });
            if (body.data.name !== undefined) await updateSequence(db, parsed.data.id, { name: body.data.name });
            res.json(await getSequenceById(db, parsed.data.id));
        } catch (err) {
            logger.error({ err }, 'Failed to update sequence');
            res.status(500).json({ error: 'Failed to update sequence' });
        }
    });

    app.delete('/api/sequences/:id', async (req, res) => {
        const parsed = sequenceIdParam.safeParse(req.params);
        if (!parsed.success) return res.status(400).json({ error: 'Invalid sequence id' });
        try {
            const db = await getDb();
            initSchema(db);
            const seq = await getSequenceById(db, parsed.data.id);
            if (!seq) return res.status(404).json({ error: 'Sequence not found' });
            await deleteSequence(db, parsed.data.id);
            res.json({ ok: true });
        } catch (err) {
            logger.error({ err }, 'Failed to delete sequence');
            res.status(500).json({ error: 'Failed to delete sequence' });
        }
    });

    app.get('/api/sequences/:id/steps', async (req, res) => {
        const parsed = sequenceIdParam.safeParse(req.params);
        if (!parsed.success) return res.status(400).json({ error: 'Invalid sequence id' });
        try {
            const db = await getDb();
            initSchema(db);
            const seq = await getSequenceById(db, parsed.data.id);
            if (!seq) return res.status(404).json({ error: 'Sequence not found' });
            res.json(await getSequenceStepsWithTemplateNames(db, parsed.data.id));
        } catch (err) {
            logger.error({ err }, 'Failed to get sequence steps');
            res.status(500).json({ error: 'Failed to retrieve steps' });
        }
    });

    app.post('/api/sequences/:id/steps', async (req, res) => {
        const parsed = sequenceIdParam.safeParse(req.params);
        const body = createStepSchema.safeParse(req.body || {});
        if (!parsed.success) return res.status(400).json({ error: 'Invalid sequence id' });
        if (!body.success) return res.status(400).json({ error: body.error.errors.map((e) => e.message).join('; ') });
        try {
            const db = await getDb();
            initSchema(db);
            const seq = await getSequenceById(db, parsed.data.id);
            if (!seq) return res.status(404).json({ error: 'Sequence not found' });
            const template = await getEmailTemplateById(db, body.data.template_id);
            if (!template) return res.status(400).json({ error: 'Template not found' });
            const { id } = await createSequenceStep(db, { sequence_id: parsed.data.id, ...body.data });
            const steps = await getSequenceStepsWithTemplateNames(db, parsed.data.id);
            const created = steps.find((s) => s.id === id);
            res.status(201).json(created || { id, ...body.data, template_name: template.name });
        } catch (err) {
            logger.error({ err }, 'Failed to create step');
            res.status(500).json({ error: 'Failed to create step' });
        }
    });

    app.patch('/api/sequences/:id/steps/:stepId', async (req, res) => {
        const params = z.object({ id: z.coerce.number().int().positive(), stepId: z.coerce.number().int().positive() }).safeParse(req.params);
        const body = updateStepSchema.safeParse(req.body || {});
        if (!params.success) return res.status(400).json({ error: 'Invalid params' });
        if (!body.success) return res.status(400).json({ error: body.error.errors.map((e) => e.message).join('; ') });
        try {
            const db = await getDb();
            initSchema(db);
            const seq = await getSequenceById(db, params.data.id);
            if (!seq) return res.status(404).json({ error: 'Sequence not found' });
            const steps = await getSequenceSteps(db, params.data.id);
            if (!steps.some((s) => s.id === params.data.stepId)) return res.status(404).json({ error: 'Step not found' });
            if (body.data.template_id != null) {
                const template = await getEmailTemplateById(db, body.data.template_id);
                if (!template) return res.status(400).json({ error: 'Template not found' });
            }
            await updateSequenceStep(db, params.data.stepId, body.data);
            const updated = await getSequenceStepsWithTemplateNames(db, params.data.id);
            res.json(updated.find((s) => s.id === params.data.stepId) || { id: params.data.stepId, ...body.data });
        } catch (err) {
            logger.error({ err }, 'Failed to update step');
            res.status(500).json({ error: 'Failed to update step' });
        }
    });

    app.delete('/api/sequences/:id/steps/:stepId', async (req, res) => {
        const params = z.object({ id: z.coerce.number().int().positive(), stepId: z.coerce.number().int().positive() }).safeParse(req.params);
        if (!params.success) return res.status(400).json({ error: 'Invalid params' });
        try {
            const db = await getDb();
            initSchema(db);
            const seq = await getSequenceById(db, params.data.id);
            if (!seq) return res.status(404).json({ error: 'Sequence not found' });
            const steps = await getSequenceSteps(db, params.data.id);
            if (!steps.some((s) => s.id === params.data.stepId)) return res.status(404).json({ error: 'Step not found' });
            await deleteSequenceStep(db, params.data.stepId);
            res.json({ ok: true });
        } catch (err) {
            logger.error({ err }, 'Failed to delete step');
            res.status(500).json({ error: 'Failed to delete step' });
        }
    });

    app.post('/api/sequences/:id/enrol', async (req, res) => {
        const parsed = sequenceIdParam.safeParse(req.params);
        const body = enrolSchema.safeParse(req.body || {});
        if (!parsed.success) return res.status(400).json({ error: 'Invalid sequence id' });
        if (!body.success) return res.status(400).json({ error: body.error.errors.map((e) => e.message).join('; ') });
        try {
            const db = await getDb();
            initSchema(db);
            const seq = await getSequenceById(db, parsed.data.id);
            if (!seq) return res.status(404).json({ error: 'Sequence not found' });
            let leadIds = [];
            if (body.data.listId != null) {
                leadIds = await getListLeadIds(db, body.data.listId);
            } else if (Array.isArray(body.data.leadIds) && body.data.leadIds.length > 0) {
                leadIds = body.data.leadIds;
            }
            let enrolled = 0;
            let skipped = 0;
            for (const leadId of leadIds) {
                const result = await enrolLead(db, parsed.data.id, leadId);
                if (result.enrolled) enrolled++; else skipped++;
            }
            res.json({ ok: true, enrolled, skipped, total: leadIds.length });
        } catch (err) {
            logger.error({ err }, 'Failed to enrol leads');
            res.status(500).json({ error: 'Failed to enrol leads' });
        }
    });

    app.get('/api/sequences/:id/enrolments', async (req, res) => {
        const parsed = sequenceIdParam.safeParse(req.params);
        if (!parsed.success) return res.status(400).json({ error: 'Invalid sequence id' });
        try {
            const db = await getDb();
            initSchema(db);
            const seq = await getSequenceById(db, parsed.data.id);
            if (!seq) return res.status(404).json({ error: 'Sequence not found' });
            const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
            const status = req.query.status && ['active', 'completed', 'stopped', 'replied'].includes(req.query.status) ? req.query.status : undefined;
            res.json(await getEnrolmentsBySequence(db, parsed.data.id, { limit, status }));
        } catch (err) {
            logger.error({ err }, 'Failed to get enrolments');
            res.status(500).json({ error: 'Failed to retrieve enrolments' });
        }
    });
}

module.exports = { mountSequences };
