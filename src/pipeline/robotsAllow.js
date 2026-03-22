/**
 * Minimal robots.txt check for FoundlyBot (no extra npm deps).
 * If robots.txt is missing or unparsable, allow fetch.
 */

const BOT_UA = 'Mozilla/5.0 (compatible; FoundlyBot/1.0)';

/**
 * @param {string} baseUrl - e.g. https://example.co.uk/
 * @param {string} path - e.g. /contact
 * @returns {Promise<boolean>}
 */
async function isPathAllowedForBot(baseUrl, path) {
    let origin;
    try {
        const u = new URL(baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`);
        origin = u.origin;
    } catch {
        return true;
    }
    const robotsUrl = new URL('/robots.txt', origin).href;
    let text = '';
    try {
        const res = await fetch(robotsUrl, {
            signal: AbortSignal.timeout(3000),
            headers: { 'User-Agent': BOT_UA },
        });
        if (!res.ok) return true;
        text = await res.text();
    } catch {
        return true;
    }
    return parseRobotsAllow(text, path);
}

/**
 * Very small parser: User-agent: * (or *) rules, Disallow lines.
 */
function parseRobotsAllow(text, requestPath) {
    const p = requestPath.startsWith('/') ? requestPath : `/${requestPath}`;
    const lines = String(text || '').split(/\r?\n/);
    let inGlobal = false;
    const disallows = [];
    for (const line of lines) {
        const t = line.split('#')[0].trim();
        if (!t) continue;
        const m = /^user-agent:\s*(.+)$/i.exec(t);
        if (m) {
            const ua = m[1].trim().toLowerCase();
            inGlobal = ua === '*' || ua === 'foundlybot';
            continue;
        }
        if (!inGlobal) continue;
        const dm = /^disallow:\s*(.*)$/i.exec(t);
        if (dm) {
            const prefix = (dm[1] || '').trim();
            if (prefix) disallows.push(prefix);
        }
    }
    for (const prefix of disallows) {
        if (prefix === '/') return false;
        if (p.startsWith(prefix)) return false;
    }
    return true;
}

module.exports = { isPathAllowedForBot, BOT_UA };
