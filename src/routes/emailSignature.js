/**
 * /api/email-signature — save and retrieve the user's email signature.
 *
 * We persist the signature JSON in the existing `profile` key/value table
 * (no DB migration needed). We additionally generate:
 *  - signature_html: HTML signature for templates / message insertion
 *  - signature_text: plain text signature for templates / fallbacks
 */

const { z } = require('zod');
const { getDb, initSchema, getProfile, setProfileKey } = require('../services/database');
const logger = require('../lib/logger');
const { validate } = require('../middleware/validate');

const SIGNATURE_PROFILE_KEY = 'email_signature_json';

function escapeHtml(input) {
    return String(input ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function sanitizeUrl(raw) {
    try {
        const rawStr = String(raw || '').trim();
        const candidate = /^(https?:)?\/\//i.test(rawStr) ? rawStr : `https://${rawStr}`;
        const url = new URL(candidate);
        if (!['http:', 'https:'].includes(url.protocol)) return '';
        return url.toString();
    } catch {
        return '';
    }
}

function sanitizeEmail(raw) {
    const s = String(raw || '').trim();
    return s ? s : '';
}

function sanitizePhone(raw) {
    const s = String(raw || '').trim();
    return s ? s : '';
}

function sanitizeOptionalText(raw, maxLen) {
    const s = String(raw ?? '').trim();
    if (!s) return '';
    return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function generateSignatureHtml(sig) {
    const fullName = sanitizeOptionalText(sig.full_name, 120);
    const jobTitle = sanitizeOptionalText(sig.job_title, 120);
    const companyName = sanitizeOptionalText(sig.company_name, 160);
    const phone = sanitizeOptionalText(sig.phone, 60);
    const email = sanitizeOptionalText(sig.email, 200);
    const website = sanitizeUrl(sig.website);
    const address = sanitizeOptionalText(sig.address, 600);
    const disclaimer = sanitizeOptionalText(sig.disclaimer, 900);
    const logoDataUrl = typeof sig.logo_data_url === 'string' ? sig.logo_data_url : '';

    const socials = Array.isArray(sig.social_links) ? sig.social_links : [];

    const leftLogo = logoDataUrl && /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(logoDataUrl)
        ? `<img src="${escapeHtml(logoDataUrl)}" alt="Logo" style="width:54px;height:54px;border-radius:16px;object-fit:cover;display:block;" />`
        : '';

    const greetingHtml = fullName
        ? `<div style="font-family:'Brush Script MT','Segoe Script',cursive;font-size:22px;line-height:1.1;color:#0f172a;margin-bottom:4px;">Kind regards,</div>`
        : '';

    const nameBlockParts = [
        fullName ? `<div style="font-size:16px;font-weight:800;line-height:1.15;color:#0f172a;letter-spacing:-0.1px;">${escapeHtml(fullName)}</div>` : '',
        jobTitle ? `<div style="font-size:12.8px;line-height:1.2;color:#4f46e5;font-weight:700;margin-top:2px;">${escapeHtml(jobTitle)}</div>` : '',
        companyName ? `<div style="font-size:12.8px;line-height:1.2;color:#334155;margin-top:2px;font-weight:600;">${escapeHtml(companyName)}</div>` : '',
    ].filter(Boolean);

    const contactLines = [];
    if (phone) contactLines.push(`<div style="font-size:12.5px;color:#0f172a;margin-top:6px;">📞 <a href="tel:${escapeHtml(phone)}" style="color:#0f172a;text-decoration:none;">${escapeHtml(phone)}</a></div>`);
    if (email) contactLines.push(`<div style="font-size:12.5px;color:#0f172a;margin-top:6px;">✉️ <a href="mailto:${escapeHtml(email)}" style="color:#0f172a;text-decoration:none;">${escapeHtml(email)}</a></div>`);
    if (website) contactLines.push(`<div style="font-size:12.5px;color:#0f172a;margin-top:6px;">🌐 <a href="${escapeHtml(website)}" style="color:#0f172a;text-decoration:none;">${escapeHtml(website.replace(/^https?:\/\//, ''))}</a></div>`);

    const addressBlock = address
        ? `<div style="font-size:12.5px;color:#0f172a;margin-top:8px;line-height:1.35;">${escapeHtml(address).replaceAll('\n', '<br/>')}</div>`
        : '';

    const socialsFiltered = socials
        .filter((s) => s && typeof s.url === 'string' && s.url.trim())
        .map((s) => ({ label: sanitizeOptionalText(s.label, 32), url: sanitizeUrl(s.url) }))
        .filter((s) => !!s.url);

    const getSocialButtonBg = (label) => {
        const l = String(label || '').toLowerCase();
        if (l.includes('facebook')) return '#1877F2';
        if (l.includes('linkedin')) return '#0A66C2';
        if (l.includes('instagram')) return '#E1306C';
        if (l.includes('twitter') || l.includes('x')) return '#111827';
        return '#4F46E5';
    };

    const socialsHtml = socialsFiltered.length > 0
        ? `
            <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;">
                ${socialsFiltered.map((s) => {
                    const bg = getSocialButtonBg(s.label);
                    return `
                        <a href="${escapeHtml(s.url)}"
                           style="background:${bg};color:#ffffff;text-decoration:none;font-weight:800;font-size:12.5px;padding:10px 14px;border-radius:7px;display:inline-block;">
                            ${escapeHtml(s.label || 'Connect')}
                        </a>
                    `;
                }).join('')}
            </div>
        `
        : '';

    const rightMain = [
        greetingHtml,
        nameBlockParts.join(''),
        contactLines.join(''),
        addressBlock,
        socialsHtml,
        disclaimer
            ? `<div style="border-top:1px solid #e2e8f0;margin-top:10px;padding-top:10px;font-size:11.5px;line-height:1.4;color:#475569;">${escapeHtml(disclaimer).replaceAll('\n', '<br/>')}</div>`
            : '',
    ].filter(Boolean).join('');

    // Table-based layout for better email client compatibility.
    const html = `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,Helvetica,sans-serif;border-collapse:collapse;">
            <tr>
                <td style="padding-right:14px;vertical-align:top;">${leftLogo || ''}</td>
                <td style="vertical-align:top;">
                    ${rightMain}
                </td>
            </tr>
        </table>
    `.trim();

    return html;
}

function generateSignatureText(sig) {
    const fullName = sanitizeOptionalText(sig.full_name, 120);
    const jobTitle = sanitizeOptionalText(sig.job_title, 120);
    const companyName = sanitizeOptionalText(sig.company_name, 160);
    const phone = sanitizeOptionalText(sig.phone, 60);
    const email = sanitizeOptionalText(sig.email, 200);
    const website = sanitizeOptionalText(sig.website, 220);
    const address = sanitizeOptionalText(sig.address, 600);
    const disclaimer = sanitizeOptionalText(sig.disclaimer, 900);

    const socials = Array.isArray(sig.social_links) ? sig.social_links : [];
    const socialsFiltered = socials
        .filter((s) => s && typeof s.url === 'string' && s.url.trim())
        .map((s) => ({ label: sanitizeOptionalText(s.label, 32), url: sanitizeOptionalText(s.url, 220) }))
        .filter((s) => !!s.url);

    const lines = [];
    if (fullName) lines.push(fullName);
    if (jobTitle) lines.push(jobTitle);
    if (companyName) lines.push(companyName);
    if (phone) lines.push(`Phone: ${phone}`);
    if (email) lines.push(`Email: ${email}`);
    if (website) lines.push(`Website: ${website}`);
    if (address) lines.push(address);
    if (socialsFiltered.length > 0) {
        lines.push('Social:');
        socialsFiltered.forEach((s) => lines.push(`- ${s.label || 'Link'}: ${s.url}`));
    }
    if (disclaimer) lines.push(disclaimer);

    return lines.join('\n').trim();
}

function parseSignatureJson(raw) {
    if (!raw || typeof raw !== 'string') return null;
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
}

const socialLinkSchema = z.object({
    label: z.string().optional().default(''),
    url: z.string().optional().default(''),
}).superRefine((val, ctx) => {
    const url = String(val.url ?? '').trim();
    if (!url) return;
    try {
        const candidate = /^(https?:)?\/\//i.test(url) ? url : `https://${url}`;
        const parsed = new URL(candidate);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Social URL must be http(s)' });
        }
    } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid Social URL' });
    }
});

const signatureUpsertSchema = z.object({
    full_name: z.string().max(120).optional().default('').transform((s) => s.trim()),
    job_title: z.string().max(120).optional().default('').transform((s) => s.trim()),
    company_name: z.string().max(160).optional().default('').transform((s) => s.trim()),
    phone: z.string().max(60).optional().default('').transform((s) => s.trim()),
    email: z.string()
        .optional()
        .default('')
        .transform((s) => s.trim())
        .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), { message: 'Invalid email address' }),
    website: z.string().optional().default('').transform((s) => s.trim()).refine((v) => {
        if (!v) return true;
        try {
            const candidate = /^(https?:)?\/\//i.test(v) ? v : `https://${v}`;
            const parsed = new URL(candidate);
            return ['http:', 'https:'].includes(parsed.protocol);
        } catch {
            return false;
        }
    }, { message: 'Website must be a valid http(s) URL' }),
    address: z.string().max(600).optional().default('').transform((s) => s.trim()),
    logo_data_url: z.string()
        .optional()
        .default('')
        .transform((s) => s.trim())
        .refine((v) => {
            if (!v) return true;
            return v.length <= 500_000 && /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(v);
        }, { message: 'Logo must be a data:image/*;base64* URL and <= 500KB' }),
    social_links: z.array(socialLinkSchema).optional().default([]),
    disclaimer: z.string().max(900).optional().default('').transform((s) => s.trim()),
}).strict();

function normaliseSignaturePayload(payload) {
    const out = {
        full_name: sanitizeOptionalText(payload.full_name, 120),
        job_title: sanitizeOptionalText(payload.job_title, 120),
        company_name: sanitizeOptionalText(payload.company_name, 160),
        phone: sanitizeOptionalText(payload.phone, 60),
        email: sanitizeOptionalText(payload.email, 200),
        website: payload.website ? sanitizeUrl(payload.website) : '',
        address: sanitizeOptionalText(payload.address, 600),
        logo_data_url: '',
        social_links: Array.isArray(payload.social_links) ? payload.social_links : [],
        disclaimer: sanitizeOptionalText(payload.disclaimer, 900),
    };

    if (payload.logo_data_url && typeof payload.logo_data_url === 'string') {
        // Guardrail: prevent extremely large base64 payloads from bloating profile.
        if (payload.logo_data_url.length <= 500_000 && /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(payload.logo_data_url)) {
            out.logo_data_url = payload.logo_data_url;
        }
    }

    out.social_links = (out.social_links || [])
        .map((s) => ({
            label: sanitizeOptionalText(s?.label, 32),
            url: sanitizeUrl(s?.url),
        }))
        .filter((s) => !!s.url);

    return out;
}

function buildOutputs(signature) {
    const signature_html = generateSignatureHtml(signature);
    const signature_text = generateSignatureText(signature);
    return { signature_html, signature_text };
}

function mountEmailSignature(app) {
    app.get('/api/email-signature', async (req, res) => {
        try {
            const db = await getDb();
            initSchema(db);
            const profile = await getProfile(db);
            const parsed = parseSignatureJson(profile?.[SIGNATURE_PROFILE_KEY]);
            const signature = parsed && typeof parsed === 'object'
                ? normaliseSignaturePayload(parsed)
                : normaliseSignaturePayload({});
            const { signature_html, signature_text } = buildOutputs(signature);
            res.json({
                ok: true,
                signature,
                signature_html,
                signature_text,
            });
        } catch (err) {
            logger.error({ err }, 'Failed to get email signature');
            res.status(500).json({ error: 'Failed to retrieve email signature' });
        }
    });

    app.post('/api/email-signature', validate(signatureUpsertSchema), async (req, res) => {
        try {
            const db = await getDb();
            initSchema(db);
            const signature = normaliseSignaturePayload(req.body || {});
            const { signature_html, signature_text } = buildOutputs(signature);

            await setProfileKey(db, SIGNATURE_PROFILE_KEY, JSON.stringify(signature));
            res.json({
                ok: true,
                signature,
                signature_html,
                signature_text,
            });
        } catch (err) {
            logger.error({ err }, 'Failed to save email signature');
            res.status(500).json({ error: 'Failed to save email signature' });
        }
    });
}

module.exports = {
    mountEmailSignature,
    // Export generators for template variable resolution.
    parseSignatureJson,
    normaliseSignaturePayload,
    generateSignatureHtml,
    generateSignatureText,
};

