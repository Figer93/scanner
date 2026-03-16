/**
 * Playwright-based scraper: visit website, extract emails, phones, detect contact form.
 * Follows Contact/About links when homepage has no email.
 */

const { chromium } = require('playwright');

const PAGE_LOAD_TIMEOUT = 20000;
const WAIT_AFTER_LOAD_MS = 3000;
const CONTACT_LINK_KEYWORDS = ['contact', 'touch', 'about'];
const MAX_CONTACT_LINKS_TO_VISIT = 3;
const MAX_PHONES_TO_KEEP = 5;
const MAX_EMAILS_FROM_BODY = 5;
const CONTACT_REGION_SELECTORS = [
    'header',
    'footer',
    '[class*="contact" i]',
    '[id*="contact" i]',
    '[class*="footer" i]',
    '[id*="footer" i]',
    '[class*="phone" i]',
    '[id*="phone" i]',
    '[class*="tel" i]',
    '[id*="tel" i]',
    '[class*="reach" i]',
    '[class*="get-in-touch" i]',
    'address',
    '.vcard',
    '[itemtype*="PostalAddress" i]'
];

async function gotoWithHttpsFallback(page, url) {
    let httpsUrl = url;
    if (httpsUrl.startsWith('http://')) {
        httpsUrl = 'https://' + httpsUrl.slice('http://'.length);
    } else if (!httpsUrl.startsWith('http')) {
        httpsUrl = 'https://' + httpsUrl;
    }

    try {
        await page.goto(httpsUrl, { waitUntil: 'domcontentloaded', timeout: PAGE_LOAD_TIMEOUT });
        await page.waitForTimeout(WAIT_AFTER_LOAD_MS);
        return;
    } catch {
        // fallback to http
    }

    const httpUrl = httpsUrl.replace(/^https:/, 'http:');
    await page.goto(httpUrl, { waitUntil: 'domcontentloaded', timeout: PAGE_LOAD_TIMEOUT });
    await page.waitForTimeout(WAIT_AFTER_LOAD_MS);
}

function normalizeUkPhone(value) {
    const d = (value || '').replace(/\D/g, '');
    if (d.length < 10 || d.length > 13) return null;
    if (d.startsWith('44')) return d.slice(0, 12);
    if (d.startsWith('0')) return '44' + d.slice(1, 12);
    return d.slice(0, 12);
}

function isValidEmail(e) {
    if (!e || e.length > 80) return false;
    if (/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(e)) return false;
    if (/^(noreply|no-reply|donotreply|do-not-reply|mailer-daemon|newsletter|notifications?|admin@|support@.*\.(png|jpg))/i.test(e)) return false;
    return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(e);
}

/**
 * Get text from contact-rich regions (header, footer, contact sections) to avoid
 * scraping directory listings and unrelated content.
 */
async function getContactRegionsText(page) {
    const chunks = [];
    for (const sel of CONTACT_REGION_SELECTORS) {
        try {
            const els = await page.$$(sel);
            for (const el of els.slice(0, 3)) {
                const text = await el.evaluate(e => (e && e.textContent) ? e.textContent : '');
                if (text && text.trim().length > 0 && text.length < 5000) chunks.push(text.trim());
            }
        } catch {
            // ignore missing selectors
        }
    }
    return chunks.join('\n');
}

async function extractContactsFromPage(page, emailsSet, phonesSet) {
    const mailtoHrefs = await page.$$eval('a[href^="mailto:"]', anchors =>
        anchors.map(a => a.getAttribute('href') || '').filter(Boolean)
    );
    for (const href of mailtoHrefs) {
        const raw = href.replace(/^mailto:/i, '').split('?')[0].trim();
        if (isValidEmail(raw)) emailsSet.add(raw.toLowerCase());
    }

    const telValues = await page.$$eval('a[href^="tel:"]', anchors =>
        anchors.map(a => ({
            href: a.getAttribute('href') || '',
            text: (a.textContent || '').trim()
        }))
    );
    const seenPhoneKeys = new Set();
    for (const { href, text } of telValues) {
        const hrefNumber = href.replace(/^tel:/i, '').trim();
        for (const candidate of [hrefNumber, text].filter(Boolean)) {
            const digitsOnly = candidate.replace(/\D/g, '');
            const key = normalizeUkPhone(digitsOnly);
            if (!key || seenPhoneKeys.has(key)) continue;
            seenPhoneKeys.add(key);
            const original = candidate.trim();
            phonesSet.add(original);
        }
    }

    let contactRegionsText = '';
    try {
        contactRegionsText = await getContactRegionsText(page);
    } catch {
        contactRegionsText = '';
    }

    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emailsFromRegions = (contactRegionsText.match(emailRegex) || []).filter(e => isValidEmail(e));
    for (const e of emailsFromRegions.slice(0, MAX_EMAILS_FROM_BODY)) {
        emailsSet.add(e.toLowerCase());
    }
    if (emailsSet.size === 0) {
        let bodyText = '';
        try {
            bodyText = await page.innerText('body');
        } catch {
            bodyText = '';
        }
        const bodyEmails = (bodyText.match(emailRegex) || []).filter(e => isValidEmail(e));
        for (const e of bodyEmails.slice(0, MAX_EMAILS_FROM_BODY)) {
            emailsSet.add(e.toLowerCase());
        }
    }

    const phoneRegex = /(\+44[\s\d-]{9,14}|0[\s\d-]{9,14})/g;
    const phoneMatches = (contactRegionsText.match(phoneRegex) || []);
    for (const raw of phoneMatches) {
        const original = raw.trim().replace(/\s+/g, ' ').replace(/-/g, ' ');
        const digitsOnly = original.replace(/\D/g, '');
        const key = normalizeUkPhone(digitsOnly);
        if (!key || seenPhoneKeys.has(key)) continue;
        seenPhoneKeys.add(key);
        phonesSet.add(original);
        if (phonesSet.size >= MAX_PHONES_TO_KEEP) break;
    }

    while (phonesSet.size > MAX_PHONES_TO_KEEP) {
        const arr = [...phonesSet];
        phonesSet.delete(arr[arr.length - 1]);
    }
}

async function hasContactForm(page) {
    try {
        return await page.$$eval('form', forms => {
            const contactKeywords = /contact|message|enquiry|inquiry|get in touch|send|email|feedback/i;
            return forms.some(form => {
                const action = (form.getAttribute('action') || '').toLowerCase();
                const text = (form.textContent || '').toLowerCase();
                const hasContactAction = /contact|form|send|submit|mail/.test(action);
                const hasContactText = contactKeywords.test(text);
                const inputs = form.querySelectorAll('input, textarea');
                const hasEmailInput = Array.from(inputs).some(el => {
                    const type = (el.getAttribute('type') || '').toLowerCase();
                    const name = (el.getAttribute('name') || el.getAttribute('id') || '').toLowerCase();
                    const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
                    return type === 'email' || /email|message|contact|name|phone/.test(name + placeholder);
                });
                const hasTextarea = !!form.querySelector('textarea');
                return (hasContactAction || hasContactText) && (hasEmailInput || hasTextarea);
            });
        });
    } catch {
        return false;
    }
}

/**
 * Get contacts from a URL: emails, phones, contactForm.
 * Visits homepage then follows Contact/About links if no email on homepage.
 * @param {import('playwright').BrowserContext} context
 * @param {string} url
 * @param {import('pino').Logger} [logger]
 * @returns {Promise<{ emails: string[], phones: string[], contactForm: boolean }>}
 */
async function getContacts(context, url, logger) {
    const page = await context.newPage();
    const emails = new Set();
    const phones = new Set();
    let contactForm = false;
    const log = (msg) => (logger ? logger.info(msg) : console.log(msg));

    try {
        log({ msg: 'Opening homepage', url });
        await gotoWithHttpsFallback(page, url);

        await extractContactsFromPage(page, emails, phones);
        if (await hasContactForm(page)) contactForm = true;

        if (emails.size === 0) {
            let candidateLinks = [];
            try {
                candidateLinks = await page.$$eval('a', anchors =>
                    anchors
                        .map((a, index) => ({
                            index,
                            text: (a.textContent || '').toLowerCase(),
                            href: (a.getAttribute('href') || '').toLowerCase()
                        }))
                        .filter(a =>
                            CONTACT_LINK_KEYWORDS.some(k => a.text.includes(k) || a.href.includes(k))
                        )
                );
            } catch {
                candidateLinks = [];
            }

            for (const linkInfo of candidateLinks.slice(0, MAX_CONTACT_LINKS_TO_VISIT)) {
                try {
                    log({ msg: 'Clicking contact link', index: linkInfo.index });
                    const anchors = await page.$$('a');
                    const target = anchors[linkInfo.index];
                    if (!target) continue;

                    await Promise.all([
                        target.click(),
                        page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {})
                    ]);
                    await page.waitForTimeout(WAIT_AFTER_LOAD_MS);
                    await extractContactsFromPage(page, emails, phones);
                    if (await hasContactForm(page)) contactForm = true;
                    if (emails.size > 0 && phones.size > 0) break;
                } catch {
                    // ignore
                }
            }
        }
    } catch (e) {
        log({ msg: 'Scraper error', url, err: e.message });
    }

    let pageText = '';
    try {
        pageText = await page.innerText('body').catch(() => '');
    } catch (_) {}
    await page.close();

    return {
        emails: [...emails],
        phones: [...phones],
        contactForm,
        pageText: pageText.slice(0, 15000)
    };
}

/**
 * Create browser and context with real User-Agent.
 * @returns {Promise<{ browser: import('playwright').Browser, context: import('playwright').BrowserContext }>}
 */
async function createBrowser() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });
    return { browser, context };
}

module.exports = {
    getContacts,
    createBrowser,
    gotoWithHttpsFallback,
    extractContactsFromPage,
    hasContactForm
};
