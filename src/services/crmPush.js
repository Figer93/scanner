/**
 * Push leads to CRM: HubSpot, Pipedrive, Salesforce.
 * Uses API keys / tokens from profile.
 */

const axios = require('axios');

/**
 * Push a single lead to HubSpot (company + optional contact with email).
 * @param {object} lead - Lead row from DB (company_name, website, emails, address, etc.)
 * @param {string} apiKey - HubSpot private app access token
 * @returns {Promise<{ ok: boolean, companyId?: string, contactId?: string, error?: string }>}
 */
async function pushToHubSpot(lead, apiKey) {
    const token = (apiKey || '').trim();
    if (!token) return { ok: false, error: 'HubSpot API key not set. Add in Profile.' };
    const base = 'https://api.hubapi.com';
    try {
        const companyRes = await axios.post(
            `${base}/crm/v3/objects/companies`,
            {
                properties: {
                    name: lead.company_name || 'Unknown',
                    domain: lead.website ? new URL(lead.website.startsWith('http') ? lead.website : 'https://' + lead.website).hostname.replace(/^www\./, '') : undefined,
                    address: lead.address || undefined,
                    zip: lead.postcode || undefined
                }
            },
            {
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                timeout: 15000,
                validateStatus: () => true
            }
        );
        if (companyRes.status !== 201) {
            const msg = companyRes.data?.message || companyRes.data?.error || companyRes.statusText;
            return { ok: false, error: msg || `HubSpot API ${companyRes.status}` };
        }
        const companyId = companyRes.data?.id;
        const email = Array.isArray(lead.emails) ? lead.emails[0] : (lead.emails || '').trim();
        let contactId;
        if (email && email !== 'Not found') {
            const contactRes = await axios.post(
                `${base}/crm/v3/objects/contacts`,
                {
                    properties: {
                        email,
                        firstname: lead.company_name ? lead.company_name.split(/\s+/)[0] : 'Contact',
                        lastname: lead.company_name ? lead.company_name.split(/\s+/).slice(1).join(' ') || 'Lead' : 'Lead',
                        company: lead.company_name
                    }
                },
                {
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    timeout: 15000,
                    validateStatus: () => true
                }
            );
            if (contactRes.status === 201) contactId = contactRes.data?.id;
        }
        return { ok: true, companyId, contactId };
    } catch (err) {
        return { ok: false, error: err.message || 'HubSpot request failed' };
    }
}

/**
 * Push a single lead to Pipedrive (organization + person if email).
 * @param {object} lead
 * @param {string} apiToken - Pipedrive API token
 * @param {string} domain - Pipedrive company domain (e.g. mycompany for mycompany.pipedrive.com)
 */
async function pushToPipedrive(lead, apiToken, domain) {
    const token = (apiToken || '').trim();
    const dom = (domain || '').trim().replace(/\.pipedrive\.com$/i, '');
    if (!token) return { ok: false, error: 'Pipedrive API token not set. Add in Profile.' };
    if (!dom) return { ok: false, error: 'Pipedrive domain not set (e.g. mycompany). Add in Profile.' };
    const base = `https://${dom}.pipedrive.com/api/v1`;
    // NOTE: Token is sent in Authorization header, not URL query param, to avoid it appearing in server logs.
    const pipedriveHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
    try {
        const orgRes = await axios.post(
            `${base}/organizations`,
            {
                name: lead.company_name || 'Unknown',
                address: lead.address || undefined
            },
            { headers: pipedriveHeaders, timeout: 15000, validateStatus: () => true }
        );
        const orgData = orgRes.data?.data;
        if (!orgData || !orgRes.data?.success) {
            return { ok: false, error: orgRes.data?.error || orgRes.statusText || `Pipedrive API ${orgRes.status}` };
        }
        const orgId = orgData.id;
        const email = Array.isArray(lead.emails) ? lead.emails[0] : (lead.emails || '').trim();
        let personId;
        if (email && email !== 'Not found') {
            const personRes = await axios.post(
                `${base}/persons`,
                {
                    name: lead.company_name || 'Contact',
                    email: [email],
                    org_id: orgId
                },
                { headers: pipedriveHeaders, timeout: 15000, validateStatus: () => true }
            );
            if (personRes.data?.success && personRes.data?.data?.id) personId = personRes.data.data.id;
        }
        return { ok: true, organizationId: orgId, personId };
    } catch (err) {
        return { ok: false, error: err.message || 'Pipedrive request failed' };
    }
}

/**
 * Push a single lead to Salesforce (Account + Contact if email).
 * Requires salesforce_access_token and salesforce_instance_url in profile.
 * @param {object} lead
 * @param {string} accessToken
 * @param {string} instanceUrl - e.g. https://myorg.my.salesforce.com
 */
async function pushToSalesforce(lead, accessToken, instanceUrl) {
    const token = (accessToken || '').trim();
    const instance = (instanceUrl || '').trim().replace(/\/$/, '');
    if (!token) return { ok: false, error: 'Salesforce access token not set. Add in Profile.' };
    if (!instance) return { ok: false, error: 'Salesforce instance URL not set. Add in Profile.' };
    try {
        const accountRes = await axios.post(
            `${instance}/services/data/v59.0/sobjects/Account`,
            {
                Name: lead.company_name || 'Unknown',
                Website: lead.website || undefined,
                BillingStreet: lead.address || undefined,
                BillingPostalCode: lead.postcode || undefined
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000,
                validateStatus: () => true
            }
        );
        if (accountRes.status >= 400) {
            const msg = accountRes.data?.[0]?.message || accountRes.data?.error_description || accountRes.statusText;
            return { ok: false, error: msg || `Salesforce API ${accountRes.status}` };
        }
        const accountId = accountRes.data?.id;
        const email = Array.isArray(lead.emails) ? lead.emails[0] : (lead.emails || '').trim();
        let contactId;
        if (email && email !== 'Not found' && accountId) {
            const contactRes = await axios.post(
                `${instance}/services/data/v59.0/sobjects/Contact`,
                {
                    LastName: lead.company_name || 'Lead',
                    Email: email,
                    AccountId: accountId
                },
                {
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    timeout: 15000,
                    validateStatus: () => true
                }
            );
            if (contactRes.status < 400 && contactRes.data?.id) contactId = contactRes.data.id;
        }
        return { ok: true, accountId, contactId };
    } catch (err) {
        return { ok: false, error: err.message || 'Salesforce request failed' };
    }
}

/**
 * Push one lead to the given CRM provider.
 * @param {string} provider - 'hubspot' | 'pipedrive' | 'salesforce'
 * @param {object} lead
 * @param {object} credentials - From profile: hubspot_api_key, pipedrive_api_token, pipedrive_domain, salesforce_access_token, salesforce_instance_url
 */
async function pushLeadToCrm(provider, lead, credentials) {
    const p = (provider || '').toLowerCase();
    if (p === 'hubspot') return pushToHubSpot(lead, credentials.hubspot_api_key);
    if (p === 'pipedrive') return pushToPipedrive(lead, credentials.pipedrive_api_token, credentials.pipedrive_domain);
    if (p === 'salesforce') return pushToSalesforce(lead, credentials.salesforce_access_token, credentials.salesforce_instance_url);
    return { ok: false, error: 'Unknown CRM provider. Use hubspot, pipedrive, or salesforce.' };
}

module.exports = {
    pushToHubSpot,
    pushToPipedrive,
    pushToSalesforce,
    pushLeadToCrm
};
