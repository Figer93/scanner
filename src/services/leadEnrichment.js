/**
 * Lead enrichment (OSINT): find LinkedIn URL via DuckDuckGo, guess email from domain + director name.
 * Free methods only. Updates lead linkedin_url, predicted_email, enrichment_status.
 */

const https = require('https');
const http = require('http');

/**
 * Search DuckDuckGo HTML for a query and return the first LinkedIn URL found, or null.
 * @param {string} query - e.g. "Acme Ltd site:linkedin.com"
 * @returns {Promise<string|null>}
 */
async function searchDuckDuckGoForLinkedIn(query) {
    const encoded = encodeURIComponent(query);
    const url = `https://html.duckduckgo.com/html/?q=${encoded}`;
    return new Promise((resolve) => {
        const req = https.get(
            url,
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            },
            (res) => {
                let body = '';
                res.on('data', (chunk) => { body += chunk; });
                res.on('end', () => {
                    const linkedInUrl = extractFirstLinkedInUrl(body);
                    resolve(linkedInUrl);
                });
            }
        );
        req.setTimeout(10000, () => { req.destroy(); resolve(null); });
        req.on('error', () => resolve(null));
    });
}

/**
 * Extract first LinkedIn profile/company URL from HTML string.
 * @param {string} html
 * @returns {string|null}
 */
function extractFirstLinkedInUrl(html) {
    const patterns = [
        /href="(https?:\/\/(?:www\.)?linkedin\.com\/company\/[^"]+)"/i,
        /href="(https?:\/\/(?:www\.)?linkedin\.com\/in\/[^"]+)"/i,
        /href="(https?:\/\/[^"]*linkedin\.com[^"]*)"/i,
        /(https?:\/\/(?:www\.)?linkedin\.com\/company\/[^\s"<>]+)/i,
        /(https?:\/\/(?:www\.)?linkedin\.com\/in\/[^\s"<>]+)/i
    ];
    for (const re of patterns) {
        const m = html.match(re);
        if (m && m[1]) {
            let url = m[1].replace(/&amp;/g, '&');
            if (url.includes('?')) url = url.split('?')[0];
            return url;
        }
    }
    return null;
}

/**
 * Derive domain from lead: website hostname or guess from company name (slug.co.uk).
 * @param {{ website?: string | null, company_name?: string }} lead
 * @returns {string|null}
 */
function getDomainFromLead(lead) {
    const site = (lead.website || '').trim();
    if (site) {
        try {
            const u = new URL(site.startsWith('http') ? site : 'https://' + site);
            const host = u.hostname.toLowerCase().replace(/^www\./, '');
            if (host && host.length > 3) return host;
        } catch (_) {}
    }
    const name = (lead.company_name || '').trim();
    if (!name) return null;
    const slug = name
        .replace(/\s+(ltd|limited|plc|llp|pllp)\.?$/i, '')
        .replace(/[^a-z0-9]+/gi, '')
        .toLowerCase()
        .slice(0, 30);
    if (slug.length < 2) return null;
    return `${slug}.co.uk`;
}

/**
 * Guess email from director name and domain: firstname.lastname@domain or firstname@domain.
 * @param {string} fullName - e.g. "John Smith"
 * @param {string} domain - e.g. "acme.co.uk"
 * @returns {string}
 */
function guessEmailFromName(fullName, domain) {
    const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '';
    const first = parts[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    const last = parts.length > 1 ? parts[parts.length - 1].toLowerCase().replace(/[^a-z0-9]/g, '') : '';
    if (!first) return '';
    const candidates = last ? [`${first}.${last}@${domain}`, `${first}@${domain}`] : [`${first}@${domain}`];
    return candidates[0];
}

/**
 * Get first director name from lead source_metadata.officers.
 * @param {object} lead
 * @returns {string|null}
 */
function getFirstOfficerName(lead) {
    const meta = lead.source_metadata;
    if (!meta || !Array.isArray(meta.officers)) return null;
    const officer = meta.officers.find((o) => o.name && String(o.name).trim());
    return officer ? String(officer.name).trim() : null;
}

/**
 * Enrich a single lead: find LinkedIn, guess email, update DB.
 * @param {{ query: Function, queryOne: Function, run: Function }} db - Database adapter
 * @param {number} leadId
 * @param {{ getLeadById: Function, updateLead: Function }} dbHelpers
 * @returns {Promise<{ linkedin_url: string | null, predicted_email: string | null, enrichment_status: string }>}
 */
async function enrichLead(db, leadId, dbHelpers) {
    const lead = dbHelpers.getLeadById(db, leadId);
    if (!lead) return { linkedin_url: null, predicted_email: null, enrichment_status: 'failed' };

    let linkedin_url = null;
    let predicted_email = null;
    const statuses = [];

    const companyName = (lead.company_name || '').trim();
    if (companyName) {
        const query = `${companyName} site:linkedin.com`;
        linkedin_url = await searchDuckDuckGoForLinkedIn(query);
        if (linkedin_url) statuses.push('found_linkedin');
    }

    const domain = getDomainFromLead(lead);
    if (domain) {
        const officerName = getFirstOfficerName(lead);
        if (officerName) {
            predicted_email = guessEmailFromName(officerName, domain);
            if (predicted_email) statuses.push('found_email');
        } else {
            predicted_email = `info@${domain}`;
            if (predicted_email) statuses.push('found_email');
        }
    }

    const enrichment_status = statuses.length > 0 ? statuses.join(',') : (linkedin_url || predicted_email ? 'partial' : 'failed');
    dbHelpers.updateLead(db, leadId, {
        linkedin_url: linkedin_url || lead.linkedin_url || null,
        predicted_email: predicted_email || lead.predicted_email || null,
        enrichment_status
    });
    // Automatic status: if OSINT found a contact (LinkedIn or email), set status to Enriched
    if (statuses.length > 0) {
        dbHelpers.updateLead(db, leadId, { status: 'Enriched' });
    }
    return {
        linkedin_url: linkedin_url || lead.linkedin_url || null,
        predicted_email: predicted_email || lead.predicted_email || null,
        enrichment_status
    };
}

/**
 * Enrich multiple leads (e.g. for a list). Runs sequentially with a short delay to avoid rate limits.
 * @param {{ query: Function, queryOne: Function, run: Function }} db - Database adapter
 * @param {number[]} leadIds
 * @param {{ getLeadById: Function, updateLead: Function }} dbHelpers
 * @param {number} [delayMs=2000]
 * @returns {Promise<Array<{ leadId: number, linkedin_url: string | null, predicted_email: string | null, enrichment_status: string }>>}
 */
async function enrichLeads(db, leadIds, dbHelpers, delayMs = 2000) {
    const results = [];
    for (const leadId of leadIds) {
        const r = await enrichLead(db, leadId, dbHelpers);
        results.push({ leadId, ...r });
        if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return results;
}

module.exports = {
    searchDuckDuckGoForLinkedIn,
    extractFirstLinkedInUrl,
    getDomainFromLead,
    guessEmailFromName,
    getFirstOfficerName,
    enrichLead,
    enrichLeads
};
