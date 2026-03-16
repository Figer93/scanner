/**
 * /api/lists/* — list CRUD and list leads
 */

const { getDb, initSchema, getLists, getListById, createList, updateList, deleteList, getLeadsByListId } = require('../services/database');
const { enrichLeads } = require('../services/leadEnrichment');
const { getLeadById, updateLead } = require('../services/database');
const { DEFAULT_DB_PATH } = require('../services/database');
const logger = require('../lib/logger');

function mountLists(app) {
    app.get('/api/lists', async (req, res) => {
        try {
            const db = await getDb(process.env.DB_PATH || DEFAULT_DB_PATH);
            initSchema(db);
            res.json(await getLists(db));
        } catch (err) {
            logger.error({ err }, 'Failed to get lists');
            res.status(500).json({ error: 'Failed to retrieve lists' });
        }
    });

    app.post('/api/lists', async (req, res) => {
        try {
            const db = await getDb(process.env.DB_PATH || DEFAULT_DB_PATH);
            initSchema(db);
            const { name, description } = req.body || {};
            if (!name || !String(name).trim()) return res.status(400).json({ error: 'name is required' });
            const { id } = await createList(db, { name: String(name).trim(), description: description != null ? String(description).trim() : undefined });
            res.status(201).json({ id, name: String(name).trim(), description: description != null ? String(description).trim() : null });
        } catch (err) {
            logger.error({ err }, 'Failed to create list');
            res.status(500).json({ error: 'Failed to create list' });
        }
    });

    app.get('/api/lists/:id', async (req, res) => {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id) || id < 1) return res.status(400).json({ error: 'Invalid list id' });
        try {
            const db = await getDb(process.env.DB_PATH || DEFAULT_DB_PATH);
            initSchema(db);
            const list = await getListById(db, id);
            if (!list) return res.status(404).json({ error: 'List not found' });
            res.json(list);
        } catch (err) {
            logger.error({ err }, 'Failed to get list');
            res.status(500).json({ error: 'Failed to retrieve list' });
        }
    });

    app.patch('/api/lists/:id', async (req, res) => {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id) || id < 1) return res.status(400).json({ error: 'Invalid list id' });
        try {
            const db = await getDb(process.env.DB_PATH || DEFAULT_DB_PATH);
            initSchema(db);
            const list = await getListById(db, id);
            if (!list) return res.status(404).json({ error: 'List not found' });
            const { name, description } = req.body || {};
            await updateList(db, id, { name: name !== undefined ? String(name).trim() : undefined, description: description !== undefined ? (description != null ? String(description).trim() : null) : undefined });
            res.json({ ok: true });
        } catch (err) {
            logger.error({ err }, 'Failed to update list');
            res.status(500).json({ error: 'Failed to update list' });
        }
    });

    app.delete('/api/lists/:id', async (req, res) => {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id) || id < 1) return res.status(400).json({ error: 'Invalid list id' });
        try {
            const db = await getDb(process.env.DB_PATH || DEFAULT_DB_PATH);
            initSchema(db);
            const list = await getListById(db, id);
            if (!list) return res.status(404).json({ error: 'List not found' });
            await deleteList(db, id);
            res.json({ ok: true });
        } catch (err) {
            logger.error({ err }, 'Failed to delete list');
            res.status(500).json({ error: 'Failed to delete list' });
        }
    });

    app.get('/api/lists/:id/leads', async (req, res) => {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id) || id < 1) return res.status(400).json({ error: 'Invalid list id' });
        try {
            const db = await getDb(process.env.DB_PATH || DEFAULT_DB_PATH);
            initSchema(db);
            const list = await getListById(db, id);
            if (!list) return res.status(404).json({ error: 'List not found' });
            res.json(await getLeadsByListId(db, id));
        } catch (err) {
            logger.error({ err }, 'Failed to get list leads');
            res.status(500).json({ error: 'Failed to retrieve list leads' });
        }
    });

    app.post('/api/lists/:id/enrich', async (req, res) => {
        const listId = parseInt(req.params.id, 10);
        if (isNaN(listId) || listId < 1) return res.status(400).json({ error: 'Invalid list id' });
        try {
            const db = await getDb(process.env.DB_PATH || DEFAULT_DB_PATH);
            initSchema(db);
            const list = await getListById(db, listId);
            if (!list) return res.status(404).json({ error: 'List not found' });
            const leads = getLeadsByListId(db, listId);
            const leadIds = leads.map((l) => l.id);
            const delayMs = parseInt(req.body?.delayMs, 10) || 2000;
            const results = await enrichLeads(db, leadIds, { getLeadById, updateLead }, delayMs);
            res.json({ listId, enriched: results.length, results });
        } catch (err) {
            logger.error({ err }, 'Failed to enrich list');
            res.status(500).json({ error: 'Failed to enrich list' });
        }
    });
}

module.exports = { mountLists };
