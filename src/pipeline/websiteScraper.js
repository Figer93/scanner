/**
 * Scrape contact pages: fetch first, Playwright fallback when needed.
 */

const { chromium } = require('playwright');
const { isPathAllowedForBot, BOT_UA } = require('./robotsAllow');

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /(\+44|0)[\s\-]?[0-9]{2,4}[\s\-]?[0-9]{3,4}[\s\-]?[0-9]{3,4}/g;
const LI_CO_RE = /linkedin\.com\/company\/([a-zA-Z0-9\-]+)/gi;
const LI_IN_RE = /linkedin\.com\/in\/([a-zA-Z0-9\-]+)/gi;

const META_JS = /(react|angular|vue)/i;

/**
 * @param {string} html
 */
function extractFromHtml(html) {
    const emails = new Set();
    const phones = new Set();
    const liCo = new Set();
    const liIn = new Set();
    const text = String(html || '');
    let m;
    const emRe = new RegExp(EMAIL_RE.source, 'g');
    while ((m = emRe.exec(text)) !== null) {
        emails.add(m[0].toLowerCase());
    }
    const mailtoRe = /mailto:([^"'\s>]+)/gi;
    while ((m = mailtoRe.exec(text)) !== null) {
        const addr = decodeURIComponent(m[1].split('?')[0]).trim().toLowerCase();
        if (addr.includes('@')) emails.add(addr);
    }
    const phRe = new RegExp(PHONE_RE.source, 'g');
    while ((m = phRe.exec(text)) !== null) {
        phones.add(normalizeUkPhone(m[0]));
    }
    const coRe = new RegExp(LI_CO_RE.source, 'gi');
    while ((m = coRe.exec(text)) !== null) {
        liCo.add(`https://www.linkedin.com/company/${m[1]}`);
    }
    const inRe = new RegExp(LI_IN_RE.source, 'gi');
    while ((m = inRe.exec(text)) !== null) {
        liIn.add(`https://www.linkedin.com/in/${m[1]}`);
    }
    return {
        emails: filterEmails([...emails]),
        phones: [...phones].filter(Boolean),
        linkedinCompanyUrls: [...liCo],
        linkedinPersonUrls: [...liIn],
    };
}

/**
 * @param {string} raw
 */
function normalizeUkPhone(raw) {
    const d = String(raw).replace(/[^\d+]/g, '');
    if (!d) return '';
    if (d.startsWith('44')) return `+${d}`;
    if (d.startsWith('0')) return `+44${d.slice(1)}`;
    return d.startsWith('+') ? d : `+${d}`;
}

/**
 * @param {string[]} emails
 */
function filterEmails(emails) {
    const list = emails.filter((e) => {
        const lower = e.toLowerCase();
        if (/@sentry\.|@example\.|noreply@|no-reply@|support@/.test(lower)) return false;
        return true;
    });
    const nonInfo = list.filter((e) => !/^info@/i.test(e));
    if (nonInfo.length > 0) return nonInfo;
    return list.filter((e) => /^info@/i.test(e));
}

/**
 * @param {string} base
 * @returns {string[]}
 */
function pageUrls(base) {
    const b = base.replace(/\/$/, '');
    return [
        `${b}/contact`,
        `${b}/contact-us`,
        `${b}/about`,
        `${b}/about-us`,
        `${b}/team`,
        `${b}/`,
    ];
}

/**
 * @param {string} html
 */
function shouldTryPlaywright(html) {
    const h = String(html || '').slice(0, 5000);
    const meta = /<meta[^>]+name=["']generator["'][^>]*content=["']([^"']+)["']/i.exec(h);
    const gen = meta ? meta[1] : '';
    if (gen && META_JS.test(gen)) return true;
    if (String(html || '').length > 0 && String(html || '').length < 1000) return true;
    return false;
}

/**
 * @param {{
 *   websiteBaseUrl: string,
 *   playwrightSemaphore: import('./tokenBucket').ConcurrencySemaphore,
 *   getBrowser: () => Promise<import('playwright').Browser>,
 *   logger?: import('pino').Logger
 * }} opts
 */
async function scrapeWebsiteContacts(opts) {
    const { websiteBaseUrl, playwrightSemaphore, getBrowser, logger } = opts;
    const base = websiteBaseUrl.startsWith('http') ? websiteBaseUrl : `https://${websiteBaseUrl}`;
    let urlObj;
    try {
        urlObj = new URL(base);
    } catch {
        return { emails: [], phones: [], linkedinCompanyUrls: [], linkedinPersonUrls: [] };
    }

    const collected = {
        emails: /** @type {string[]} */ ([]),
        phones: /** @type {string[]} */ ([]),
        linkedinCompanyUrls: /** @type {string[]} */ ([]),
        linkedinPersonUrls: /** @type {string[]} */ ([]),
    };

    const merge = (part) => {
        collected.emails.push(...part.emails);
        collected.phones.push(...part.phones);
        collected.linkedinCompanyUrls.push(...part.linkedinCompanyUrls);
        collected.linkedinPersonUrls.push(...part.linkedinPersonUrls);
    };

    for (const pageUrl of pageUrls(base)) {
        let path;
        try {
            path = new URL(pageUrl).pathname || '/';
        } catch {
            path = '/';
        }
        const allowed = await isPathAllowedForBot(urlObj.origin, path);
        if (!allowed) continue;

        let html = '';
        try {
            const res = await fetch(pageUrl, {
                signal: AbortSignal.timeout(5000),
                headers: { 'User-Agent': BOT_UA },
                redirect: 'follow',
            });
            html = await res.text();
        } catch (err) {
            if (logger) logger.debug({ err: err.message, pageUrl }, 'fetch page failed');
            html = '';
        }

        let part = extractFromHtml(html);
        merge(part);

        const needPw = part.emails.length === 0 && part.phones.length === 0 && shouldTryPlaywright(html);
        if (needPw) {
            await playwrightSemaphore.acquire();
            try {
                const browser = await getBrowser();
                const context = await browser.newContext({ userAgent: BOT_UA });
                const page = await context.newPage();
                await page.goto(pageUrl, { timeout: 10000, waitUntil: 'domcontentloaded' });
                const content = await page.content();
                await context.close();
                part = extractFromHtml(content);
                merge(part);
            } catch (err) {
                if (logger) logger.warn({ err: err.message, pageUrl }, 'playwright scrape failed');
            } finally {
                playwrightSemaphore.release();
            }
        }
    }

    const emailSet = new Set(filterEmails([...new Set(collected.emails)]));
    const phoneSet = new Set([...new Set(collected.phones)].filter(Boolean));
    return {
        emails: [...emailSet],
        phones: [...phoneSet],
        linkedinCompanyUrls: [...new Set(collected.linkedinCompanyUrls)],
        linkedinPersonUrls: [...new Set(collected.linkedinPersonUrls)],
    };
}

module.exports = {
    scrapeWebsiteContacts,
    extractFromHtml,
    filterEmails,
    normalizeUkPhone,
    chromium,
};
