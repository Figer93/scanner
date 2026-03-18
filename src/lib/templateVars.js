/**
 * Email template variable resolution for personalisation.
 * Replaces {{variable}} placeholders with lead and profile data.
 * Missing values are replaced with empty string; unresolved var names are tracked.
 */

const VAR_PATTERN = /\{\{(\w+)\}\}/g;

const {
    parseSignatureJson,
    normaliseSignaturePayload,
    generateSignatureHtml,
    generateSignatureText,
} = require('../routes/emailSignature');

/**
 * Get first director full name from lead source_metadata.officers.
 * @param {object} lead - Lead row with source_metadata
 * @returns {string}
 */
function getDirectorName(lead) {
    const meta = lead?.source_metadata;
    if (!meta || !Array.isArray(meta.officers)) return '';
    const officer = meta.officers.find((o) => o.name && String(o.name).trim());
    return officer ? String(officer.name).trim() : '';
}

/**
 * Derive company type suffix from company name (e.g. Ltd, LLP, Limited).
 * @param {string} companyName
 * @returns {string}
 */
function getCompanyType(companyName) {
    if (!companyName || typeof companyName !== 'string') return '';
    const name = companyName.trim();
    const lower = name.toLowerCase();
    if (lower.endsWith(' limited') || lower.endsWith(', limited')) return 'Limited';
    if (lower.endsWith(' ltd') || lower.endsWith(' ltd.') || lower.endsWith(', ltd')) return 'Ltd';
    if (lower.endsWith(' llp')) return 'LLP';
    if (lower.endsWith(' plc')) return 'PLC';
    return '';
}

/**
 * Format date string (YYYY-MM-DD) as "16 February 2026".
 * @param {string|null|undefined} isoDate
 * @returns {string}
 */
function formatIncorporationDate(isoDate) {
    if (!isoDate) return '';
    const str = String(isoDate).trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return '';
    const d = new Date(str + 'T12:00:00Z');
    if (Number.isNaN(d.getTime())) return '';
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const day = d.getUTCDate();
    const month = months[d.getUTCMonth()];
    const year = d.getUTCFullYear();
    return `${day} ${month} ${year}`;
}

/**
 * Build a map of variable name -> value for a lead and profile.
 * @param {object} lead - Lead from DB (company_name, date_of_creation, source_metadata, etc.)
 * @param {object} profile - Profile from getProfile(db) (referral_link, sender_name, etc.)
 * @returns {{ values: Record<string, string>, unresolved: string[] }}
 */
function buildVariableMap(lead, profile) {
    const directorName = getDirectorName(lead || {});
    const directorFirstName = directorName ? directorName.split(/\s+/)[0] || '' : '';
    const companyName = (lead?.company_name && String(lead.company_name).trim()) || '';
    const companyType = getCompanyType(companyName);
    const incorporationDate = formatIncorporationDate(lead?.date_of_creation);
    const referralLink = (profile?.referral_link && String(profile.referral_link).trim()) || '';
    const senderName = (profile?.sender_name && String(profile.sender_name).trim()) || '';

    const signatureRaw = profile?.email_signature_json;
    const parsedSignature = parseSignatureJson(signatureRaw);
    const signature = parsedSignature && typeof parsedSignature === 'object'
        ? normaliseSignaturePayload(parsedSignature)
        : normaliseSignaturePayload({});
    const signatureHtml = generateSignatureHtml(signature);
    const signatureText = generateSignatureText(signature);

    const values = {
        company_name: companyName,
        director_name: directorName,
        director_first_name: directorFirstName,
        incorporation_date: incorporationDate,
        company_type: companyType,
        referral_link: referralLink,
        sender_name: senderName,
        signature: signatureHtml,
        signature_text: signatureText,
    };

    const knownVars = new Set(Object.keys(values));
    return { values, knownVars };
}

/**
 * Resolve all {{variable}} placeholders in a string.
 * @param {string} text - Subject or body
 * @param {Record<string, string>} values - Variable name -> value
 * @param {Set<string>} knownVars - Set of known variable names
 * @returns {{ resolved: string, unresolved: string[] }}
 */
function resolveString(text, values, knownVars) {
    if (text == null) return { resolved: '', unresolved: [] };
    const str = String(text);
    const unresolved = [];
    const resolved = str.replace(VAR_PATTERN, (match, name) => {
        if (knownVars.has(name)) {
            return values[name] ?? '';
        }
        if (!unresolved.includes(name)) unresolved.push(name);
        return '';
    });
    return { resolved, unresolved };
}

/**
 * Resolve template variables in subject and body.
 * @param {{ subject: string, body?: string }} template - Template with subject and optional body
 * @param {object} lead - Lead from getLeadById
 * @param {object} profile - Profile from getProfile(db)
 * @returns {{ subject: string, body: string, unresolvedVars: string[] }}
 */
function resolveTemplateVariables(template, lead, profile) {
    const { values, knownVars } = buildVariableMap(lead, profile || {});
    const subj = resolveString(template?.subject ?? '', values, knownVars);
    const body = resolveString(template?.body ?? '', values, knownVars);
    const unresolvedVars = [...new Set([...subj.unresolved, ...body.unresolved])];
    return {
        subject: subj.resolved,
        body: body.resolved,
        unresolvedVars,
    };
}

module.exports = {
    resolveTemplateVariables,
    getDirectorName,
    getCompanyType,
    formatIncorporationDate,
};
