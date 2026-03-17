/**
 * App config: server env, input path, DB path, delays, and CLI args (--limit, --input, --source).
 */

const path = require('path');
const fs = require('fs');

// Server config (from env). DATABASE_URL is required (Supabase PostgreSQL connection string).
const PORT = parseInt(process.env.PORT, 10) || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_PRETTY = process.env.LOG_PRETTY === '1' || process.env.LOG_PRETTY === 'true';
/** Optional file path for logging; when set, logs are written to stdout and this file. Not set = stdout only (container-friendly). */
const LOG_FILE = (process.env.LOG_FILE || '').trim() || null;

const INPUT_FILE = path.join(process.cwd(), 'manchester_leads_month.json');
const DELAY_BETWEEN_COMPANIES_MS = 3000;
const SOURCE_JSON = 'json_file';
const SOURCE_CH = 'companies_house';
const SOURCE_GOOGLE_MAPS = 'google_maps';
const SOURCE_CHARITY = 'charity_commission';
const SOURCE_FCA = 'fca_register';
const SOURCE_LINKEDIN = 'linkedin';

function parseArgs() {
    const args = process.argv.slice(2);
    let limit = null;
    let inputFile = INPUT_FILE;
    let source = SOURCE_JSON;
    for (const arg of args) {
        if (arg.startsWith('--limit=')) {
            const n = parseInt(arg.slice('--limit='.length), 10);
            if (!isNaN(n) && n > 0) limit = n;
        }
        if (arg.startsWith('--input=')) {
            inputFile = arg.slice('--input='.length).trim() || INPUT_FILE;
        }
        if (arg.startsWith('--source=')) {
            const s = arg.slice('--source='.length).trim().toLowerCase();
            if (s === SOURCE_CH || s === 'companies_house') source = SOURCE_CH;
            else if (s === SOURCE_GOOGLE_MAPS || s === 'google_maps') source = SOURCE_GOOGLE_MAPS;
            else if (s === SOURCE_CHARITY || s === 'charity_commission') source = SOURCE_CHARITY;
            else if (s === SOURCE_FCA || s === 'fca_register') source = SOURCE_FCA;
            else if (s === SOURCE_LINKEDIN || s === 'linkedin') source = SOURCE_LINKEDIN;
            else if (s === 'json' || s === SOURCE_JSON) source = SOURCE_JSON;
        }
    }
    return { limit, inputFile, source };
}

function loadCompanies(inputPath) {
    const resolved = path.isAbsolute(inputPath) ? inputPath : path.join(process.cwd(), inputPath);
    if (!fs.existsSync(resolved)) {
        throw new Error(`Input file not found: ${resolved}`);
    }
    const raw = fs.readFileSync(resolved, 'utf-8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [data];
}

module.exports = {
    PORT,
    NODE_ENV,
    LOG_LEVEL,
    LOG_PRETTY,
    LOG_FILE,
    INPUT_FILE,
    DELAY_BETWEEN_COMPANIES_MS,
    SOURCE_JSON,
    SOURCE_CH,
    SOURCE_GOOGLE_MAPS,
    SOURCE_CHARITY,
    SOURCE_FCA,
    SOURCE_LINKEDIN,
    parseArgs,
    loadCompanies
};
