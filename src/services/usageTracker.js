/**
 * Records per-call API usage to usage_log and provides aggregated stats for the Profile dashboard.
 */

const { resolveCompaniesHouseApiKey } = require('./companiesHouse');

/** Integration secrets: environment variables only (Railway / .env), not profile DB. `db` is ignored (callers pass it for API consistency). */
async function getResolvedKeys(_db) {
    return {
        serper_api_key: (process.env.SERPER_API_KEY || '').trim(),
        companies_house_api_key: resolveCompaniesHouseApiKey(),
        google_places_api_key: (process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '').trim(),
        google_ai_api_key: (process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || '').trim(),
        charity_commission_api_key: (process.env.CHARITY_COMMISSION_API_KEY || '').trim(),
        apify_api_token: (process.env.APIFY_API_TOKEN || '').trim(),
        apify_linkedin_actor_id: (process.env.APIFY_LINKEDIN_ACTOR_ID || '').trim()
    };
}

async function recordUsage(db, entry) {
    await db.run(
        'INSERT INTO usage_log (service, endpoint, input_tokens, output_tokens, request_count, estimated_cost_gbp) VALUES ($1, $2, $3, $4, $5, $6)',
        [
            entry.service,
            entry.endpoint ?? null,
            entry.input_tokens ?? null,
            entry.output_tokens ?? null,
            entry.request_count ?? 1,
            entry.estimated_cost_gbp ?? null
        ]
    );
}

async function getUsageStats(db) {
    const services = ['serper', 'companies_house', 'google_places', 'google_ai', 'apify'];
    const out = {};
    for (const service of services) {
        const row = await db.queryOne(
            `SELECT
                COUNT(*) as request_count,
                COALESCE(SUM(input_tokens), 0) as total_input_tokens,
                COALESCE(SUM(output_tokens), 0) as total_output_tokens,
                COALESCE(SUM(estimated_cost_gbp), 0) as total_cost_gbp,
                MAX(called_at) as last_called
             FROM usage_log WHERE service = $1`,
            [service]
        );
        out[service] = row ? {
            request_count: row.request_count || 0,
            total_input_tokens: row.total_input_tokens || 0,
            total_output_tokens: row.total_output_tokens || 0,
            total_cost_gbp: row.total_cost_gbp || 0,
            last_called: row.last_called
        } : { request_count: 0, total_input_tokens: 0, total_output_tokens: 0, total_cost_gbp: 0, last_called: null };
    }
    return out;
}

async function getUsageLog(db, opts = {}) {
    const page = Math.max(1, opts.page || 1);
    const limit = Math.min(100, Math.max(1, opts.limit || 50));
    const offset = (page - 1) * limit;
    return db.query('SELECT * FROM usage_log ORDER BY called_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
}

module.exports = {
    getResolvedKeys,
    recordUsage,
    getUsageStats,
    getUsageLog
};
