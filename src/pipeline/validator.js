/**
 * Validation: DNS MX, website HTTPS/parking, LinkedIn HTTP 200, UK phone format. Target &lt;3s total via parallel checks.
 */

const dns = require('dns').promises;
const { fetchHtmlCheck, looksLikeParking } = require('./websiteFinder');

const UK_E164 = /^\+44[1-9]\d{8,9}$/;

const FREE_EMAIL_DOMAINS = new Set([
    'gmail.com',
    'googlemail.com',
    'yahoo.com',
    'yahoo.co.uk',
    'hotmail.com',
    'outlook.com',
    'live.com',
    'icloud.com',
    'proton.me',
    'protonmail.com',
]);

/**
 * Corporate mailbox should sit on the same registrable domain as the company website when both are known.
 * @param {string | null} email
 * @param {string | null} websiteUrl
 */
function emailDomainAlignsWithWebsite(email, websiteUrl) {
    if (!email || !websiteUrl) return true;
    const at = String(email).indexOf('@');
    if (at < 0) return false;
    const dom = String(email)
        .slice(at + 1)
        .trim()
        .toLowerCase();
    if (!dom || FREE_EMAIL_DOMAINS.has(dom)) return true;
    try {
        const u = new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`);
        let host = u.hostname.replace(/^www\./, '').toLowerCase();
        if (host === dom) return true;
        if (host.endsWith(`.${dom}`) || dom.endsWith(`.${host}`)) return true;
        const root = (h) => {
            const p = h.split('.').filter(Boolean);
            return p.length >= 2 ? p.slice(-2).join('.') : h;
        };
        return root(host) === root(dom);
    } catch {
        return false;
    }
}

/**
 * @param {string} email
 * @returns {Promise<boolean>}
 */
async function validateEmailMx(email) {
    const domain = String(email).split('@')[1];
    if (!domain) return false;
    try {
        const mx = await Promise.race([
            dns.resolveMx(domain),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000)),
        ]);
        return Array.isArray(mx) && mx.length > 0;
    } catch {
        return false;
    }
}

/**
 * @param {string} url
 * @returns {Promise<boolean>}
 */
async function validateLinkedInUrl(url) {
    if (!url || !String(url).includes('linkedin.com')) return false;
    try {
        const res = await fetch(
            url.startsWith('http') ? url : `https://${url}`,
            { method: 'GET', signal: AbortSignal.timeout(3000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FoundlyBot/1.0)' } }
        );
        return res.ok;
    } catch {
        return false;
    }
}

/**
 * @param {string} url
 * @returns {Promise<boolean>}
 */
async function validateWebsiteHttps(url) {
    if (!url) return false;
    const u = url.startsWith('http') ? url : `https://${url}`;
    try {
        const { ok, body } = await fetchHtmlCheck(u);
        if (!ok && body && looksLikeParking(body)) return false;
        return ok;
    } catch {
        return false;
    }
}

/**
 * @param {string} phone
 */
function validateUkPhoneE164(phone) {
    const d = String(phone || '').replace(/\s/g, '');
    return UK_E164.test(d);
}

/**
 * @param {{
 *   bestEmail: string | null,
 *   website: string | null,
 *   phones: string[],
 *   linkedinCompanyUrl: string | null,
 *   linkedinPersonUrls: string[],
 * }} input
 * @returns {Promise<{
 *   email_valid: boolean,
 *   website_valid: boolean,
 *   phone_valid: boolean,
 *   linkedin_company_valid: boolean,
 *   linkedin_person_valid: boolean,
 *   enrichment_score: number
 * }>}
 */
async function validateEnrichment(input) {
    const { bestEmail, website, phones, linkedinCompanyUrl, linkedinPersonUrls } = input;

    const mxOk = bestEmail ? await validateEmailMx(bestEmail) : false;
    const domainAligns = emailDomainAlignsWithWebsite(bestEmail, website);

    const checks = await Promise.all([
        Promise.resolve(mxOk && domainAligns),
        website ? validateWebsiteHttps(website) : Promise.resolve(false),
        Promise.resolve((phones || []).some((p) => validateUkPhoneE164(p))),
        linkedinCompanyUrl ? validateLinkedInUrl(linkedinCompanyUrl) : Promise.resolve(false),
        (linkedinPersonUrls || []).length > 0
            ? validateLinkedInUrl(linkedinPersonUrls[0])
            : Promise.resolve(false),
    ]);

    const email_valid = checks[0];
    const website_valid = checks[1];
    const phone_valid = checks[2];
    const linkedin_company_valid = checks[3];
    const linkedin_person_valid = checks[4];

    let enrichment_score = 0;
    if (email_valid) enrichment_score += 25;
    if (website_valid) enrichment_score += 20;
    if (phone_valid) enrichment_score += 20;
    if (linkedin_company_valid) enrichment_score += 20;
    if (linkedin_person_valid) enrichment_score += 15;
    enrichment_score = Math.min(100, enrichment_score);

    return {
        email_valid,
        website_valid,
        phone_valid,
        linkedin_company_valid,
        linkedin_person_valid,
        enrichment_score,
    };
}

module.exports = {
    validateEnrichment,
    validateEmailMx,
    validateLinkedInUrl,
    validateUkPhoneE164,
    emailDomainAlignsWithWebsite,
};
