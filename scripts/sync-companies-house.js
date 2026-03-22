#!/usr/bin/env node
/**
 * Sync Companies House data into the local cache.
 * Run this periodically (cron/scheduled task) or manually to keep the cache fresh.
 * Pipeline then searches the cache for instant results instead of calling the API on each run.
 *
 * Usage:
 *   node scripts/sync-companies-house.js [--daysBack=30] [--limit=500] [--fullProfile]
 *   Or set CH_DAYS_BACK / CH_LIMIT in .env
 *   --fullProfile: fetch full company profile (GET /company/{number}) for each result (accounts, SIC, etc.)
 */

require('dotenv').config();
const path = require('path');
const { getDb, initSchema } = require('../src/services/database');
const { syncFromApi } = require('../src/services/companiesHouseCache');
const { getResolvedKeys, recordUsage } = require('../src/services/usageTracker');

async function main() {
    const args = process.argv.slice(2);
    let daysBack = parseInt(process.env.CH_DAYS_BACK, 10) || 30;
    let limit = parseInt(process.env.CH_LIMIT, 10) || 500;
    let fetchFullProfile = false;
    for (const arg of args) {
        if (arg.startsWith('--daysBack=')) daysBack = parseInt(arg.slice('--daysBack='.length), 10) || 30;
        if (arg.startsWith('--limit=')) limit = Math.min(500, parseInt(arg.slice('--limit='.length), 10) || 500);
        if (arg === '--fullProfile') fetchFullProfile = true;
    }

    const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'leads.db');
    const db = await getDb(dbPath);
    initSchema(db);
    const apiKeys = await getResolvedKeys(db);
    const apiKey = apiKeys.companies_house_api_key || '';

    if (!apiKey || !apiKey.trim()) {
        console.error('Companies House API key is required. Set COMPANIES_HOUSE_API_KEY in .env or in Profile (via UI).');
        process.exit(1);
    }

    console.log(`Syncing Companies House cache (daysBack=${daysBack}, limit=${limit}, fullProfile=${fetchFullProfile})…`);
    const { synced, errors } = await syncFromApi(db, apiKey, { daysBack, limit, fetchFullProfile });
    console.log(`Synced ${synced} companies.`);
    try {
        recordUsage(db, { service: 'companies_house', endpoint: '/advanced-search/companies', request_count: 1 });
    } catch (_) {}
    if (errors.length) {
        console.warn('Errors:', errors.slice(0, 10).join('; '));
        if (errors.length > 10) console.warn(`… and ${errors.length - 10} more.`);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
