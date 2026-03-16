/**
 * /api/leads/:id/push-crm, /api/crm/push-bulk — CRM push (HubSpot, Pipedrive, Salesforce)
 */

const { getDb, getLeadById, getProfile, addLeadActivity } = require('../services/database');
const { pushLeadToCrm } = require('../services/crmPush');
const { DEFAULT_DB_PATH } = require('../services/database');
const logger = require('../lib/logger');

function mountCrm(app) {
    app.post('/api/leads/:id/push-crm', async (req, res) => {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id) || id < 1) return res.status(400).json({ error: 'Invalid lead id' });
        const provider = (req.body?.provider || '').toString().toLowerCase();
        if (!['hubspot', 'pipedrive', 'salesforce'].includes(provider)) {
            return res.status(400).json({ error: 'Invalid provider. Use hubspot, pipedrive, or salesforce.' });
        }
        try {
            const db = await getDb(process.env.DB_PATH || DEFAULT_DB_PATH);
            const lead = await getLeadById(db, id);
            if (!lead) return res.status(404).json({ error: 'Lead not found' });
            const profile = await getProfile(db);
            const credentials = {
                hubspot_api_key: profile.hubspot_api_key || process.env.HUBSPOT_API_KEY || '',
                pipedrive_api_token: profile.pipedrive_api_token || process.env.PIPEDRIVE_API_TOKEN || '',
                pipedrive_domain: profile.pipedrive_domain || process.env.PIPEDRIVE_DOMAIN || '',
                salesforce_access_token: profile.salesforce_access_token || process.env.SALESFORCE_ACCESS_TOKEN || '',
                salesforce_instance_url: profile.salesforce_instance_url || process.env.SALESFORCE_INSTANCE_URL || ''
            };
            const result = await pushLeadToCrm(provider, lead, credentials);
            if (!result.ok) {
                return res.status(502).json({ error: result.error });
            }
            addLeadActivity(db, id, 'note', `Pushed to ${provider}: ${JSON.stringify(result)}`);
            res.json({ ok: true, ...result });
        } catch (err) {
            logger.error({ err }, 'Failed to push lead to CRM');
            res.status(500).json({ error: 'Failed to push lead to CRM' });
        }
    });

    app.post('/api/crm/push-bulk', async (req, res) => {
        const leadIds = Array.isArray(req.body?.leadIds) ? req.body.leadIds.map((x) => parseInt(x, 10)).filter((n) => !isNaN(n) && n >= 1) : [];
        const provider = (req.body?.provider || '').toString().toLowerCase();
        if (!['hubspot', 'pipedrive', 'salesforce'].includes(provider)) {
            return res.status(400).json({ error: 'Invalid provider. Use hubspot, pipedrive, or salesforce.' });
        }
        if (!leadIds.length) return res.status(400).json({ error: 'Provide leadIds array.' });
        try {
            const db = await getDb(process.env.DB_PATH || DEFAULT_DB_PATH);
            const profile = await getProfile(db);
            const credentials = {
                hubspot_api_key: profile.hubspot_api_key || process.env.HUBSPOT_API_KEY || '',
                pipedrive_api_token: profile.pipedrive_api_token || process.env.PIPEDRIVE_API_TOKEN || '',
                pipedrive_domain: profile.pipedrive_domain || process.env.PIPEDRIVE_DOMAIN || '',
                salesforce_access_token: profile.salesforce_access_token || process.env.SALESFORCE_ACCESS_TOKEN || '',
                salesforce_instance_url: profile.salesforce_instance_url || process.env.SALESFORCE_INSTANCE_URL || ''
            };
            const results = { pushed: 0, failed: 0, errors: [] };
            for (const lid of leadIds) {
                const lead = await getLeadById(db, lid);
                if (!lead) { results.failed++; results.errors.push({ id: lid, error: 'Lead not found' }); continue; }
                const result = await pushLeadToCrm(provider, lead, credentials);
                if (result.ok) results.pushed++;
                else { results.failed++; results.errors.push({ id: lid, error: result.error }); }
            }
            res.json({ ok: true, ...results });
        } catch (err) {
            logger.error({ err }, 'Failed to bulk push to CRM');
            res.status(500).json({ error: 'Failed to bulk push to CRM' });
        }
    });
}

module.exports = { mountCrm };
