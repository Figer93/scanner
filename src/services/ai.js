/**
 * Google AI (Gemini) API: ice-breaker, lead scoring, and outreach draft.
 * All AI features use Google AI Studio (Gemini); no Claude/Anthropic.
 */

const axios = require('axios');

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
/** Primary: 10 RPM / 20 RPD on free tier (separate quota from 2.5 Flash). */
const GEMINI_MODEL = 'gemini-2.5-flash-lite';
/** Fallback when primary returns empty (e.g. response shape). */
const GEMINI_MODEL_FALLBACK = 'gemini-2.0-flash';

/** Models to try on 429 (rate limits are per model). Order: lite (10 RPM) -> 2.5 Flash (5 RPM) -> 2.0 Flash. */
const RATE_LIMIT_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash'];

/** Max retries on 429 per model; we can also switch to next model. */
const RATE_LIMIT_MAX_RETRIES = 2;
/** Delay before retry (ms). */
const RATE_LIMIT_RETRY_DELAY_MS = 25000;
/** Min ms between requests. 10 RPM = 1 per 6s; use 7s to stay under. */
const GEMINI_MIN_INTERVAL_MS = 7000;

let lastGeminiCallTime = 0;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Next model in list for 429 fallback (rate limits are per model). */
function getNextModel(currentModel) {
    const i = RATE_LIMIT_MODELS.indexOf(currentModel);
    return i >= 0 && i < RATE_LIMIT_MODELS.length - 1 ? RATE_LIMIT_MODELS[i + 1] : null;
}

/** Wait if we've called Gemini too recently (avoids hitting RPM on free tier). */
async function throttleGemini() {
    const now = Date.now();
    const elapsed = now - lastGeminiCallTime;
    if (lastGeminiCallTime > 0 && elapsed < GEMINI_MIN_INTERVAL_MS) {
        await sleep(GEMINI_MIN_INTERVAL_MS - elapsed);
    }
    lastGeminiCallTime = Date.now();
}

/** Relaxed safety for benign tasks (scoring 1–10, short text). Reduces empty/blocked responses. */
const SAFETY_SETTINGS = [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }
];

/**
 * Format Gemini/axios errors into a short, user-friendly message for UI and logs.
 * @param {Error} err - Axios error or generic Error
 * @returns {{ message: string, code?: string }}
 */
function formatAiError(err) {
    if (!err) return { message: 'Unknown error' };
    const status = err.response?.status;
    const data = err.response?.data;
    const msg = data?.error?.message || data?.message || err.message || String(err);

    if (status === 400) return { message: 'Invalid request to Google AI. Check input.', code: 'BAD_REQUEST' };
    if (status === 401) return { message: 'Google AI API key invalid or missing. Check Profile.', code: 'INVALID_KEY' };
    if (status === 403) return { message: 'Google AI API key not allowed or quota disabled.', code: 'FORBIDDEN' };
    if (status === 404) return { message: 'Gemini model not found. Update the app or try again later.', code: 'MODEL_NOT_FOUND' };
    if (status === 429) return { message: 'Google AI rate limit exceeded (limits are per model). Wait a minute or try again.', code: 'RATE_LIMIT' };
    if (status >= 500) return { message: 'Google AI service error. Try again in a few minutes.', code: 'SERVER_ERROR' };
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') return { message: 'Request timed out. Check your connection.', code: 'TIMEOUT' };
    if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') return { message: 'Cannot reach Google AI. Check network.', code: 'NETWORK' };

    const short = msg.length > 120 ? msg.slice(0, 117) + '...' : msg;
    return { message: short, code: 'API_ERROR' };
}

/**
 * Call Gemini generateContent and return text. Records usage when opts.db provided.
 * @param {{ systemInstruction: string, userText: string, maxOutputTokens?: number }} params
 * @param {{ googleAiApiKey: string, db?: { query: Function, queryOne: Function, run: Function } }} opts
 * @returns {Promise<{ text: string } | { error: string, code?: string }>}
 */
async function callGemini(params, opts) {
    const apiKey = (opts.googleAiApiKey || process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
        return { error: 'Google AI API key not set. Add it in Profile.', code: 'NO_KEY' };
    }

    const model = opts.modelOverride || GEMINI_MODEL;
    const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const body = {
        contents: [{ parts: [{ text: params.userText }] }],
        systemInstruction: params.systemInstruction ? { parts: [{ text: params.systemInstruction }] } : undefined,
        generationConfig: {
            maxOutputTokens: params.maxOutputTokens ?? 256,
            temperature: params.temperature ?? 0.2
        },
        safetySettings: SAFETY_SETTINGS
    };

    try {
        await throttleGemini();
        let response;
        for (let attempt = 0; attempt <= RATE_LIMIT_MAX_RETRIES; attempt++) {
            response = await axios.post(url, body, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 20000,
                validateStatus: () => true
            });

            if (response.status === 429) {
                const nextModel = getNextModel(model);
                if (nextModel) {
                    console.warn('[Google AI] Rate limited on', model, '; retrying with', nextModel);
                    await sleep(RATE_LIMIT_RETRY_DELAY_MS);
                    return callGemini(params, { ...opts, modelOverride: nextModel });
                }
                if (attempt < RATE_LIMIT_MAX_RETRIES) {
                    await sleep(RATE_LIMIT_RETRY_DELAY_MS * (attempt + 1));
                    continue;
                }
            }

            if (response.status !== 200) {
                const err = new Error(response.data?.error?.message || `HTTP ${response.status}`);
                err.response = { status: response.status, data: response.data };
                const formatted = formatAiError(err);
                return { error: formatted.message, code: formatted.code };
            }
            break;
        }

        const data = response.data;
        const promptFeedback = data?.promptFeedback;
        const candidate = data?.candidates?.[0];
        const finishReason = candidate?.finishReason;

        if (promptFeedback?.blockReason) {
            return { error: 'Google AI blocked the request. Try different lead text or try again.', code: 'PROMPT_BLOCKED' };
        }
        if (finishReason && finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
            return { error: 'Google AI did not return content (safety or filter). Try again or another lead.', code: 'RESPONSE_BLOCKED' };
        }

        // Gemini 2.5 can return multiple parts (e.g. thinking + answer); concatenate all text
        let text = '';
        const parts = candidate?.content?.parts;
        if (Array.isArray(parts)) {
            text = parts.map((p) => (p && typeof p.text === 'string' ? p.text : '')).join('').trim();
        }
        if (!text && candidate?.content?.parts?.[0]?.text != null) {
            text = String(candidate.content.parts[0].text).trim();
        }
        const usage = data?.usageMetadata;
        const inputTokens = usage?.promptTokenCount;
        const outputTokens = usage?.candidatesTokenCount;
        if (opts.db && (inputTokens != null || outputTokens != null)) {
            try {
                const { recordUsage } = require('./usageTracker');
                recordUsage(opts.db, {
                    service: 'google_ai',
                    endpoint: 'generateContent',
                    input_tokens: inputTokens ?? 0,
                    output_tokens: outputTokens ?? 0,
                    request_count: 1,
                    estimated_cost_gbp: 0
                });
            } catch (_) {}
        }

        if (!text) {
            const partCount = Array.isArray(parts) ? parts.length : 0;
            const firstPartKeys = parts?.[0] ? Object.keys(parts[0]) : [];
            console.warn('[Google AI] Empty content from', model, '| candidates[0].content.parts:', partCount, '| first part keys:', firstPartKeys.join(', ') || 'none');
            if (!opts.modelOverride && model === GEMINI_MODEL) {
                console.warn('[Google AI] Retrying with', GEMINI_MODEL_FALLBACK);
                return callGemini(params, { ...opts, modelOverride: GEMINI_MODEL_FALLBACK });
            }
            return { error: 'Google AI returned no content. Try again or use a different lead.', code: 'EMPTY_RESPONSE' };
        }
        return { text };
    } catch (err) {
        const formatted = formatAiError(err);
        return { error: formatted.message, code: formatted.code };
    }
}

/**
 * Infer a simple "niche" from company name (e.g. "FAST FOX LOGISTICS LTD" -> "logistics").
 */
function inferNiche(companyName) {
    const lower = (companyName || '').toLowerCase();
    const words = lower.split(/[\s\-&.,]+/).filter(w => w.length > 2);
    const skip = new Set(['ltd', 'limited', 'plc', 'uk', 'the', 'and', 'co', 'company', 'group', 'biz', 'solutions', 'services']);
    const meaningful = words.filter(w => !skip.has(w));
    return meaningful.length ? meaningful.slice(-2).join(' ') : lower.slice(0, 30);
}

/**
 * Generate one short ice-breaker sentence for cold email using Gemini.
 */
async function generateIceBreaker(companyName, niche, logger, opts = {}) {
    const effectiveNiche = niche || inferNiche(companyName);
    const log = (msg) => (logger ? logger.info(msg) : console.log(msg));

    const systemInstruction = 'You are a B2B outreach specialist. Reply with exactly one short, professional sentence (under 15 words) that can be used as an ice-breaker in a cold email. Reference their business or industry specifically. Do not use greetings or sign-offs. Do not include quotation marks.';
    const userText = `Company: "${companyName}". Niche/industry: ${effectiveNiche}.${opts.website ? ` Website: ${opts.website}.` : ''} Write one specific ice-breaker sentence for a cold outreach email.`;

    const result = await callGemini(
        { systemInstruction, userText, maxOutputTokens: 80 },
        { googleAiApiKey: opts.googleAiApiKey || process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY, db: opts.db }
    );

    if (result.error) {
        if (logger) logger.warn({ err: result.error, code: result.code }, 'Ice-breaker skipped');
        return null;
    }
    const sentence = (result.text || '').trim().replace(/^["']|["']$/g, '');
    if (sentence) {
        log({ msg: 'Ice-breaker generated', companyName });
        return sentence;
    }
    return null;
}

/** Points per factor (transparent scoring). Max deterministic = 100, AI adds up to 10. */
const SCORE_FACTORS = {
    email_found: 20,
    website_found: 15,
    director_found: 10,
    registered_under_30_days: 20,
    registered_30_90_days: 10,
    company_status_active: 10,
    phone_found: 5,
    sic_service_tech_retail: 10,
    ai_enrichment: 10, // max from Gemini
};

/**
 * Compute deterministic score breakdown from lead data.
 * @param {object} lead - Lead record (emails, phones, website, date_of_creation, source_metadata)
 * @returns {{ total: number, breakdown: Array<{ key: string, label: string, points: number, earned: boolean }> }}
 */
function computeScoreBreakdown(lead) {
    const breakdown = [];
    const emails = Array.isArray(lead.emails) ? lead.emails.filter((e) => e && e !== 'Not found') : [];
    const hasEmail = emails.length > 0;
    breakdown.push({ key: 'email_found', label: 'Email found', points: SCORE_FACTORS.email_found, earned: hasEmail });

    const hasWebsite = !!(lead.website && String(lead.website).trim() && lead.website !== 'Not found');
    breakdown.push({ key: 'website_found', label: 'Website found', points: SCORE_FACTORS.website_found, earned: hasWebsite });

    const officers = lead.source_metadata?.officers || [];
    const directorName = officers[0]?.name ? String(officers[0].name).trim() : '';
    const hasDirector = directorName.length > 0;
    breakdown.push({ key: 'director_found', label: 'Director found', points: SCORE_FACTORS.director_found, earned: hasDirector });

    const dateStr = (lead.date_of_creation || lead.source_metadata?.date_of_creation || lead.source_metadata?.dateOfCreation || '').toString().trim().slice(0, 10);
    const created = dateStr ? new Date(dateStr) : null;
    let regPoints = 0;
    let regLabel = 'Incorporation recency';
    if (created && !isNaN(created.getTime())) {
        const now = new Date();
        const daysSince = Math.floor((now - created) / (24 * 60 * 60 * 1000));
        if (daysSince < 30) {
            regPoints = SCORE_FACTORS.registered_under_30_days;
            regLabel = `Registered ${daysSince} days ago`;
        } else if (daysSince <= 90) {
            regPoints = SCORE_FACTORS.registered_30_90_days;
            regLabel = 'Registered 30–90 days ago';
        } else {
            regLabel = 'Registered >90 days ago';
        }
    }
    breakdown.push({ key: 'incorporation', label: regLabel, points: regPoints === 20 ? 20 : regPoints === 10 ? 10 : 0, earned: regPoints > 0 });

    const status = (lead.source_metadata?.company_status || '').toString().trim().toLowerCase();
    const isActive = status === 'active';
    breakdown.push({ key: 'company_status_active', label: 'Company status: Active', points: SCORE_FACTORS.company_status_active, earned: isActive });

    const phones = Array.isArray(lead.phones) ? lead.phones.filter((p) => p && String(p).trim()) : [];
    const hasPhone = phones.length > 0;
    breakdown.push({ key: 'phone_found', label: 'Phone found', points: SCORE_FACTORS.phone_found, earned: hasPhone });

    const sicCodes = lead.source_metadata?.sic_codes || [];
    const sicText = Array.isArray(sicCodes)
        ? sicCodes.map((s) => (typeof s === 'string' ? s : (s?.description || s?.sic_code || ''))).join(' ').toLowerCase()
        : '';
    const sicMatch = /software|technology|retail|service|consulting|computer|information technology|it services|business support/.test(sicText);
    breakdown.push({ key: 'sic_service_tech_retail', label: 'SIC service/tech/retail', points: SCORE_FACTORS.sic_service_tech_retail, earned: sicMatch });

    let total = 0;
    breakdown.forEach((b) => {
        if (b.earned) total += b.points;
    });
    return { total: Math.min(100, total), breakdown };
}

/**
 * Rate a lead 1–10 using deterministic points plus AI (up to +10). Store breakdown as JSON on lead.
 * @returns {Promise<{ score: number, reason?: string, breakdown: object } | { error: string }>}
 */
async function scoreLead(lead, criteria, logger, opts = {}) {
    const log = (msg) => (logger ? logger.info(msg) : console.log(msg));
    const { total: deterministicTotal, breakdown } = computeScoreBreakdown(lead);

    let aiPoints = 0;
    let reason = '';
    const effectiveCriteria = (criteria || 'general fit for B2B outreach').trim();
    const emails = Array.isArray(lead.emails) ? lead.emails.filter((e) => e && e !== 'Not found') : [];
    const phones = Array.isArray(lead.phones) ? lead.phones : [];
    const contactSummary = emails.length ? `Email(s): ${emails.join(', ')}` : (phones.length ? `Phone(s): ${(lead.phones || []).join(', ')}` : 'No direct contact');
    const context = [
        `Company: ${lead.company_name || 'Unknown'}`,
        lead.website ? `Website: ${lead.website}` : null,
        `Contact: ${contactSummary}`,
        lead.ice_breaker ? `Ice-breaker: ${lead.ice_breaker}` : null
    ].filter(Boolean).join('\n');

    const systemInstruction = 'You are a lead qualification assistant. Give an enrichment score from 0 to 10 (integer) based on how well this lead fits B2B outreach. Consider data quality, contactability, and fit. Reply with exactly two lines: first line "Score: N" (N = 0–10), second line "Reason: one short sentence." No other text.';
    const userText = `Criteria: ${effectiveCriteria}\n\nLead:\n${context}\n\nEnrichment score (0-10) and reason:`;

    const result = await callGemini(
        { systemInstruction, userText, maxOutputTokens: 80 },
        { ...opts, googleAiApiKey: opts.googleAiApiKey || process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY }
    );

    if (!result.error && result.text) {
        const raw = (result.text || '').trim();
        const numMatch = raw.match(/\b(10|\d)\b/);
        const n = numMatch ? parseInt(numMatch[1], 10) : NaN;
        if (n >= 0 && n <= 10) {
            aiPoints = Math.min(10, n);
            const reasonMatch = raw.match(/Reason:\s*(.+?)(?:\n|$)/i);
            if (reasonMatch && reasonMatch[1]) reason = reasonMatch[1].trim();
        }
    }

    const breakdownWithAi = [...breakdown, { key: 'ai_enrichment', label: 'AI enrichment score', points: SCORE_FACTORS.ai_enrichment, earned: true, aiPoints }];
    const totalPoints = Math.min(100, deterministicTotal + aiPoints);
    const score = Math.max(1, Math.min(10, Math.round(totalPoints / 10) || 1));

    const storedBreakdown = {
        totalPoints,
        scoreOutOf10: score,
        factors: breakdownWithAi.map((b) => ({
            key: b.key,
            label: b.label,
            points: b.earned ? (b.key === 'ai_enrichment' ? b.aiPoints : b.points) : 0,
            maxPoints: b.points,
            earned: b.earned,
        })),
        reason: reason || null,
    };

    log({ msg: 'Lead scored', companyName: lead.company_name, score, totalPoints, reason: reason || undefined });
    return { score, reason: reason || undefined, breakdown: storedBreakdown };
}

/**
 * Generate a personalised cold email draft for a lead using Gemini.
 * @returns {Promise<{ draft: string } | { error: string, code?: string }>} For server: use .draft or .error.
 */
async function generateOutreachDraft(lead, logger, opts = {}) {
    const email = Array.isArray(lead.emails) && lead.emails[0] && lead.emails[0] !== 'Not found' ? lead.emails[0] : null;
    const emails = Array.isArray(lead.emails) ? lead.emails.filter((e) => e && e !== 'Not found') : [];
    const niche = inferNiche(lead.company_name);
    const context = [
        `Company: ${lead.company_name || 'Unknown'}`,
        lead.company_number ? `Company number: ${lead.company_number}` : null,
        lead.website ? `Website: ${lead.website}` : null,
        lead.address ? `Address: ${lead.address}` : null,
        lead.postcode ? `Postcode: ${lead.postcode}` : null,
        niche ? `Industry / niche: ${niche}` : null,
        emails.length ? `Contact email(s): ${emails.join(', ')}` : null,
        lead.ice_breaker ? `Ice-breaker / context: ${lead.ice_breaker}` : null
    ].filter(Boolean).join('\n');

    const systemInstruction = 'You are a B2B cold outreach specialist. Write a short, personalised cold email (3–5 sentences) that could be sent to this lead. Use the company name and reference their actual business, industry, or website where possible — avoid generic fluff. Include a subject line on the first line after "Subject: ". Do not use placeholders like [Name]; use the real company name. Be specific and professional.';
    const userText = `Lead:\n${context}\n\nWrite the cold email (subject line first, then body):`;

    const result = await callGemini(
        { systemInstruction, userText, maxOutputTokens: 400 },
        { ...opts, googleAiApiKey: opts.googleAiApiKey || process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY }
    );

    if (result.error) {
        if (logger) logger.warn({ err: result.error, code: result.code }, 'Outreach draft failed');
        return { error: result.error, code: result.code };
    }
    const draft = (result.text || '').trim();
    if (draft && logger) logger.info({ msg: 'Outreach draft generated', companyName: lead.company_name });
    return { draft };
}

/**
 * Extract website enrichment (services, size, tech stack) from page text using Gemini.
 * @param {string} pageText - innerText of the page (or main content)
 * @param {string} [companyName]
 * @param {object} opts
 * @returns {Promise<{ services?: string, size?: string, tech?: string } | { error: string }>}
 */
async function extractWebsiteEnrichment(pageText, companyName, opts = {}) {
    if (!pageText || (typeof pageText === 'string' && pageText.trim().length < 50)) {
        return { services: null, size: null, tech: null };
    }
    const text = typeof pageText === 'string' ? pageText.trim().slice(0, 12000) : '';
    const systemInstruction = 'You are a business analyst. From the given website page text, extract structured information. Reply with exactly three lines: Line 1 "Services: " followed by a short comma-separated list of services or offerings (or "Unknown"). Line 2 "Size: " followed by company size if mentioned (e.g. "1-10 employees", "SME") or "Unknown". Line 3 "Tech: " followed by any tech stack, CMS, or platform hints (e.g. "WordPress", "React") or "Unknown". No other text.';
    const userText = `Company name: ${companyName || 'Unknown'}\n\nPage text:\n${text}`;

    const result = await callGemini(
        { systemInstruction, userText, maxOutputTokens: 256 },
        { ...opts, googleAiApiKey: opts.googleAiApiKey || process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY }
    );

    if (result.error) {
        return { services: null, size: null, tech: null };
    }
    const raw = (result.text || '').trim();
    let services = null, size = null, tech = null;
    const m1 = raw.match(/Services:\s*(.+?)(?=\n|$)/i);
    const m2 = raw.match(/Size:\s*(.+?)(?=\n|$)/i);
    const m3 = raw.match(/Tech:\s*(.+?)(?=\n|$)/i);
    if (m1 && m1[1]) services = m1[1].trim();
    if (m2 && m2[1]) size = m2[1].trim();
    if (m3 && m3[1]) tech = m3[1].trim();
    return { services: services || null, size: size || null, tech: tech || null };
}

module.exports = {
    formatAiError,
    inferNiche,
    generateIceBreaker,
    scoreLead,
    generateOutreachDraft,
    extractWebsiteEnrichment
};
